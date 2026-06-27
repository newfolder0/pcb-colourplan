import { useEffect, useMemo, useRef } from 'react';
import { boardBBox } from '../core/geometry/transform';
import { renderBoardSvg } from '../core/render/svg';
import { selectionHighlight, useStore } from '../state/store';

export function BoardCanvas() {
  const board = useStore((s) => s.board);
  const bom = useStore((s) => s.bom);
  const side = useStore((s) => s.side);
  const setSide = useStore((s) => s.setSide);
  const selection = useStore((s) => s.selection);
  const hoverGroup = useStore((s) => s.hoverGroup);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const setHoverGroup = useStore((s) => s.setHoverGroup);
  const containerRef = useRef<HTMLDivElement>(null);

  const refToGroup = useMemo(() => {
    const m = new Map<string, string>();
    if (bom) for (const r of bom.rows) for (const ref of r.refs) m.set(ref, r.groupKey);
    return m;
  }, [bom]);

  const groupRefs = useMemo(() => {
    const m = new Map<string, string[]>();
    if (bom) for (const r of bom.rows) m.set(r.groupKey, r.refs);
    return m;
  }, [bom]);

  const hasFront = useMemo(() => board?.footprints.some((f) => f.side === 'F') ?? false, [board]);
  const hasBack = useMemo(() => board?.footprints.some((f) => f.side === 'B') ?? false, [board]);

  // Base SVG depends only on selection (not hover) to keep hover cheap.
  const svg = useMemo(() => {
    if (!board) return '';
    const highlight = selectionHighlight(bom, selection);
    return renderBoardSvg(board, {
      side,
      highlight,
      mirror: side === 'B',
      interactive: true,
      bbox: boardBBox(board),
    }).svg;
  }, [board, bom, side, selection]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.innerHTML = svg;
  }, [svg]);

  // Apply the hover outline by toggling a CSS class (no re-render).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    root.querySelectorAll('.fp-hover').forEach((el) => el.classList.remove('fp-hover'));
    if (!hoverGroup) return;
    const refs = new Set(groupRefs.get(hoverGroup) ?? []);
    root.querySelectorAll('[data-ref]').forEach((el) => {
      if (refs.has(el.getAttribute('data-ref') ?? '')) el.classList.add('fp-hover');
    });
  }, [hoverGroup, svg, groupRefs]);

  function refUnder(target: EventTarget | null): string | null {
    const el = (target as Element | null)?.closest?.('[data-ref]');
    return el?.getAttribute('data-ref') ?? null;
  }

  if (!board) return null;

  return (
    <div className="board-panel">
      <div className="board-toolbar">
        <div className="seg">
          <button className={side === 'F' ? 'on' : ''} disabled={!hasFront} onClick={() => setSide('F')}>
            Top
          </button>
          <button className={side === 'B' ? 'on' : ''} disabled={!hasBack} onClick={() => setSide('B')}>
            Bottom
          </button>
        </div>
        <span className="muted small">
          {side === 'B' ? 'Bottom (mirrored) · ' : ''}click a part or BOM row to highlight
        </span>
      </div>
      <div
        ref={containerRef}
        className="board-canvas"
        onClick={(e) => {
          const ref = refUnder(e.target);
          const g = ref && refToGroup.get(ref);
          if (g) toggleGroup(g);
        }}
        onPointerMove={(e) => {
          const ref = refUnder(e.target);
          const g = (ref && refToGroup.get(ref)) || null;
          if (g !== hoverGroup) setHoverGroup(g);
        }}
        onPointerLeave={() => setHoverGroup(null)}
      />
    </div>
  );
}
