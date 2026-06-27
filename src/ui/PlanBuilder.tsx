import { useEffect, useMemo, useRef, useState } from 'react';
import { deriveCategories, detectPartNumberField } from '../core/colourplan/categories';
import { getPalette, type PaletteName } from '../core/colourplan/palette';
import { buildDocuments } from '../core/colourplan/paginate';
import { generateColourPlanPdf } from '../core/pdf/export';
import { A4_LANDSCAPE, A4_PORTRAIT, composePageSvg, type TitleBlock } from '../core/render/page';
import { boardBBox } from '../core/geometry/transform';
import type { Side } from '../core/model/types';
import { useStore } from '../state/store';
import { trackPdfGenerated } from '../telemetry';

const today = () => new Date().toISOString().slice(0, 10);

type Orientation = 'auto' | 'landscape' | 'portrait';

export function PlanBuilder() {
  const board = useStore((s) => s.board);
  const bom = useStore((s) => s.bom);
  const filename = useStore((s) => s.filename);

  const baseName = useMemo(() => (filename ?? '').replace(/\.kicad_pcb$/i, ''), [filename]);

  const categories = useMemo(() => (bom ? deriveCategories(bom.rows) : []), [bom]);
  const detectedPn = useMemo(() => (bom ? detectPartNumberField(bom.propertyKeys) : null), [bom]);

  const hasFront = useMemo(() => board?.footprints.some((f) => f.side === 'F') ?? false, [board]);
  const hasBack = useMemo(() => board?.footprints.some((f) => f.side === 'B') ?? false, [board]);

  const [sides, setSides] = useState<Side[]>(['F', 'B']);
  const [groupsPerPage, setGroupsPerPage] = useState(4);
  const [paletteName, setPaletteName] = useState<PaletteName>('standard');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [pnChoice, setPnChoice] = useState<string>('auto'); // 'auto' | '__none__' | key
  // Default to all categories selected. Lazy init (not an effect): this component
  // remounts whenever a new board is loaded, so it re-derives per board.
  const [catIds, setCatIds] = useState<Set<string>>(() => new Set(categories.map((c) => c.id)));
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [date] = useState(today);
  const previewRef = useRef<HTMLDivElement>(null);

  // Title-block defaults derived from the board at mount (see note above).
  const [tb, setTb] = useState<TitleBlock>(() => ({
    documentNumber: baseName.toUpperCase(),
    revision: '',
    author: '',
    organisation: '',
    projectTitle: board?.title || baseName,
  }));

  const partNumberField = pnChoice === 'auto' ? detectedPn : pnChoice === '__none__' ? null : pnChoice;

  const effectiveSides = useMemo(
    () => sides.filter((s) => (s === 'F' ? hasFront : hasBack)),
    [sides, hasFront, hasBack],
  );

  const pages = useMemo(() => {
    if (!bom) return [];
    return buildDocuments(categories, {
      sides: effectiveSides.length ? effectiveSides : hasFront ? ['F'] : ['B'],
      groupsPerPage,
      palette: getPalette(paletteName),
      categoryIds: catIds,
    });
  }, [bom, categories, effectiveSides, hasFront, groupsPerPage, paletteName, catIds]);

  const size = useMemo(() => {
    if (orientation === 'landscape') return A4_LANDSCAPE;
    if (orientation === 'portrait') return A4_PORTRAIT;
    if (!board) return A4_LANDSCAPE;
    const bb = boardBBox(board);
    return bb.maxX - bb.minX >= bb.maxY - bb.minY ? A4_LANDSCAPE : A4_PORTRAIT;
  }, [orientation, board]);

  // Clamp for display; nav buttons below operate on clampedIdx, so pageIdx never
  // needs an effect to "correct" itself when the page count shrinks.
  const clampedIdx = Math.min(pageIdx, Math.max(0, pages.length - 1));
  const page = pages[clampedIdx];

  useEffect(() => {
    if (!previewRef.current) return;
    previewRef.current.innerHTML = board && page ? composePageSvg(board, page, { size, titleBlock: tb, partNumberField, date }) : '';
  }, [board, page, size, tb, partNumberField, date]);

  if (!board || !bom) return null;

  const toggleSide = (s: Side) => setSides((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const toggleCat = (id: string) =>
    setCatIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function onGenerate() {
    if (!board || !pages.length) return;
    setBusy(true);
    try {
      await generateColourPlanPdf(board, pages, {
        size,
        titleBlock: tb,
        partNumberField,
        date,
        filename: `${tb.projectTitle || baseName || 'colour-plan'} - colour plan.pdf`,
      });
      trackPdfGenerated(pages.length); // opt-in: page count only
    } catch (err) {
      console.error('PDF generation failed', err);
      alert('PDF generation failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plan-builder">
      <aside className="plan-controls">
        <h3>Colour plan</h3>

        <section title="Assembly-process groups. Each becomes its own set of pages (Top/Bottom). Derived from KiCAD SMD/through-hole/DNP attributes today, or from an 'Assembly Process' field on the parts if present.">
          <div className="sec-title">Categories</div>
          {categories.map((c) => (
            <label key={c.id} className="check" title={`Include the "${c.label}" category (${c.rows.length} line${c.rows.length === 1 ? '' : 's'}) in the PDF.`}>
              <input type="checkbox" checked={catIds.has(c.id)} onChange={() => toggleCat(c.id)} />
              {c.label} <span className="muted small">({c.rows.length})</span>
            </label>
          ))}
        </section>

        <label className="row" title="Which board side(s) to produce pages for. Bottom pages are mirrored (drawn as viewed from underneath the board).">
          Board sides
          <span className="seg">
            <button className={sides.includes('F') ? 'on' : ''} disabled={!hasFront} onClick={() => toggleSide('F')}>
              Top
            </button>
            <button className={sides.includes('B') ? 'on' : ''} disabled={!hasBack} onClick={() => toggleSide('B')}>
              Bottom
            </button>
          </span>
        </label>

        <label className="row" title="Maximum number of component groups highlighted (each in a different colour) on a single page. A category with more groups spills onto extra pages.">
          Groups / page
          <select value={groupsPerPage} onChange={(e) => setGroupsPerPage(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="row" title="Highlight colour set used for the groups on each page (up to 4 distinct colours). Colour-blind safe uses the Okabe-Ito palette.">
          Palette
          <select value={paletteName} onChange={(e) => setPaletteName(e.target.value as PaletteName)}>
            <option value="standard">Standard (green/yellow/red/blue)</option>
            <option value="bright">Bright</option>
            <option value="cbSafe">Colour-blind safe</option>
          </select>
        </label>

        <label className="row" title="Page orientation. 'Auto' chooses landscape or portrait to best fit the board's shape.">
          Orientation
          <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)}>
            <option value="auto">Auto</option>
            <option value="landscape">A4 landscape</option>
            <option value="portrait">A4 portrait</option>
          </select>
        </label>

        <label className="row" title="Which component field fills the legend's 'Part Number' column. 'Auto' picks the first MPN-like field; 'None' hides the column.">
          Part Number
          <select value={pnChoice} onChange={(e) => setPnChoice(e.target.value)}>
            <option value="auto">Auto{detectedPn ? ` (${detectedPn})` : ' (none found)'}</option>
            <option value="__none__">None</option>
            {bom.propertyKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>

        <section title="Fields printed in the title block at the bottom of every page.">
          <div className="sec-title">Title block</div>
          <input
            className="tb"
            placeholder="Document number"
            title="Document / drawing identifier, shown large in the bottom-right of the title block."
            value={tb.documentNumber}
            onChange={(e) => setTb({ ...tb, documentNumber: e.target.value })}
          />
          <input
            className="tb"
            placeholder="Project title"
            title="Board or project name, shown in the bottom-left of the title block. Also used as the PDF file name."
            value={tb.projectTitle}
            onChange={(e) => setTb({ ...tb, projectTitle: e.target.value })}
          />
          <div className="tb-row">
            <input
              className="tb"
              placeholder="Rev"
              title="Revision, shown in the title block."
              value={tb.revision}
              onChange={(e) => setTb({ ...tb, revision: e.target.value })}
            />
            <input
              className="tb"
              placeholder="Author"
              title="Prepared-by name, shown in the title block."
              value={tb.author}
              onChange={(e) => setTb({ ...tb, author: e.target.value })}
            />
          </div>
          <input
            className="tb"
            placeholder="Organisation"
            title="Organisation or department, shown in the bottom-left of the title block."
            value={tb.organisation}
            onChange={(e) => setTb({ ...tb, organisation: e.target.value })}
          />
        </section>

        <div className="plan-summary muted small">
          {pages.length} page{pages.length === 1 ? '' : 's'}
        </div>
        <button
          className="primary"
          title="Generate and download the multi-page colour-plan PDF for the selected categories and sides."
          disabled={busy || !pages.length}
          onClick={onGenerate}
        >
          {busy ? 'Generating…' : 'Download PDF'}
        </button>
      </aside>

      <div className="plan-preview-wrap">
        <div className="plan-nav">
          <button disabled={clampedIdx <= 0} onClick={() => setPageIdx(clampedIdx - 1)}>
            ‹
          </button>
          <span>
            {pages.length ? `Page ${clampedIdx + 1} / ${pages.length}` : 'No pages'}
            {page ? ` · ${page.docNumber} ${page.category} ${page.side === 'B' ? 'BOTTOM' : 'TOP'}` : ''}
          </span>
          <button disabled={clampedIdx >= pages.length - 1} onClick={() => setPageIdx(clampedIdx + 1)}>
            ›
          </button>
        </div>
        <div ref={previewRef} className="plan-preview" />
      </div>
    </div>
  );
}
