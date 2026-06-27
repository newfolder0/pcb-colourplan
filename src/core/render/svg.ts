// Shared SVG renderer. One code path feeds both the on-screen board view and
// the colour-plan PDF. Output is a self-contained SVG string in board space
// (millimetres, Y down -> matches SVG, no Y flip needed).

import {
  bboxIsValid,
  boardBBox,
  emptyBBox,
  expandBBox,
  fpLocalToBoard,
  mirrorX,
  tessellateArc,
  type BBox,
} from '../geometry/transform';
import type { Board, Footprint, Graphic, Side, Vec2 } from '../model/types';

export interface RenderStyle {
  background: string;
  edge: string;
  edgeWidth: number;
  context: string;
  contextWidth: number;
  highlightStrokeWidth: number;
  highlightOpacity: number;
  label: string;
  labelSize: number;
}

export const DEFAULT_STYLE: RenderStyle = {
  background: '#ffffff',
  edge: '#1f2933',
  edgeWidth: 0.2,
  context: '#b8bcc2',
  contextWidth: 0.12,
  highlightStrokeWidth: 0.15,
  highlightOpacity: 0.8,
  label: '#101418',
  labelSize: 0.9,
};

export interface RenderOptions {
  side: Side;
  /** ref -> highlight colour (hex). */
  highlight?: Map<string, string>;
  /** Mirror X so a bottom side reads as seen from the bottom. */
  mirror?: boolean;
  style?: Partial<RenderStyle>;
  /** Draw the reference designator on highlighted parts. */
  showLabels?: boolean;
  /** Override bounding box (e.g. to share scale across both sides). */
  bbox?: BBox;
  /** Emit data-ref / data-side attributes for interactivity. */
  interactive?: boolean;
}

export interface RenderResult {
  /** Complete standalone SVG document. */
  svg: string;
  /** Inner markup only (no <svg> wrapper), for embedding in a composed page. */
  inner: string;
  bbox: BBox;
  viewBox: string;
}

export function renderBoardSvg(board: Board, opts: RenderOptions): RenderResult {
  const style = { ...DEFAULT_STYLE, ...opts.style };
  const bb = opts.bbox ?? boardBBox(board);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const axisX = (bb.minX + bb.maxX) / 2;
  const project = opts.mirror ? (p: Vec2): Vec2 => mirrorX(p, axisX) : (p: Vec2): Vec2 => p;
  const viewBox = `${f(bb.minX)} ${f(bb.minY)} ${f(w)} ${f(h)}`;

  const parts: string[] = [];
  parts.push(
    `<rect x="${f(bb.minX)}" y="${f(bb.minY)}" width="${f(w)}" height="${f(h)}" fill="${esc(style.background)}"/>`,
  );

  // Board outline (Edge.Cuts) -- same geometry on both sides.
  parts.push('<g stroke-linecap="round" stroke-linejoin="round" fill="none">');
  for (const e of board.edges) {
    parts.push(strokeGraphic(e, (p) => project(p), style.edge, style.edgeWidth));
  }
  parts.push('</g>');

  // Footprints on this side.
  for (const fp of board.footprints) {
    if (fp.side !== opts.side) continue;
    const colour = opts.highlight?.get(fp.ref);
    parts.push(renderFootprint(fp, project, style, colour, opts));
  }

  const inner = parts.join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
  return { svg, inner, bbox: bb, viewBox };
}

function renderFootprint(
  fp: Footprint,
  project: (p: Vec2) => Vec2,
  style: RenderStyle,
  colour: string | undefined,
  opts: RenderOptions,
): string {
  const toBoard = (p: Vec2): Vec2 => project(fpLocalToBoard(fp, p));
  const outline = pickOutlineGraphics(fp);
  const body: string[] = [];

  if (colour) {
    // Filled marker over the part extent, plus a coloured outline and label.
    const ext = projectBBox(footprintExtent(fp), project);
    if (bboxIsValid(ext)) {
      body.push(
        `<rect x="${f(ext.minX)}" y="${f(ext.minY)}" width="${f(ext.maxX - ext.minX)}" height="${f(
          ext.maxY - ext.minY,
        )}" rx="0.15" fill="${esc(colour)}" fill-opacity="${style.highlightOpacity}" stroke="${esc(
          colour,
        )}" stroke-width="${style.highlightStrokeWidth}"/>`,
      );
    }
    for (const g of outline) body.push(strokeGraphic(g, toBoard, colour, style.highlightStrokeWidth));
    if (opts.showLabels) {
      const c = projectBBox(footprintExtent(fp), project);
      const cx = (c.minX + c.maxX) / 2;
      const cy = (c.minY + c.maxY) / 2;
      body.push(
        `<text x="${f(cx)}" y="${f(cy)}" font-size="${style.labelSize}" text-anchor="middle" ` +
          `dominant-baseline="central" fill="${esc(style.label)}" ` +
          `font-family="sans-serif">${esc(fp.ref)}</text>`,
      );
    }
  } else {
    for (const g of outline) body.push(strokeGraphic(g, toBoard, style.context, style.contextWidth));
  }

  const attrs = opts.interactive ? ` data-ref="${esc(fp.ref)}" data-side="${fp.side}"` : '';
  const cls = colour ? 'fp fp-hl' : 'fp';
  return `<g class="${cls}"${attrs} fill="none" stroke-linecap="round" stroke-linejoin="round">${body.join(
    '',
  )}</g>`;
}

/** Prefer fabrication outline; fall back to courtyard, then silkscreen. */
function pickOutlineGraphics(fp: Footprint): Graphic[] {
  const fab = fp.graphics.filter((g) => g.layer.endsWith('.Fab'));
  if (fab.length) return fab;
  const crt = fp.graphics.filter((g) => g.layer.endsWith('.CrtYd'));
  if (crt.length) return crt;
  return fp.graphics.filter((g) => g.layer.endsWith('.SilkS'));
}

function footprintExtent(fp: Footprint): BBox {
  const bb = emptyBBox();
  const add = (p: Vec2) => expandBBox(bb, fpLocalToBoard(fp, p));
  for (const g of pickOutlineGraphics(fp)) {
    for (const p of graphicPoints(g)) add(p);
  }
  if (!bboxIsValid(bb)) {
    // Fall back to pad span (e.g. connectors with no fab outline).
    for (const pad of fp.pads) {
      const half = Math.max(pad.size.x, pad.size.y) / 2 || 0.5;
      add({ x: pad.at.x - half, y: pad.at.y - half });
      add({ x: pad.at.x + half, y: pad.at.y + half });
    }
  }
  if (!bboxIsValid(bb)) {
    return { minX: fp.at.x - 0.5, minY: fp.at.y - 0.5, maxX: fp.at.x + 0.5, maxY: fp.at.y + 0.5 };
  }
  return bb;
}

function projectBBox(bb: BBox, project: (p: Vec2) => Vec2): BBox {
  if (!bboxIsValid(bb)) return bb;
  const out = emptyBBox();
  expandBBox(out, project({ x: bb.minX, y: bb.minY }));
  expandBBox(out, project({ x: bb.maxX, y: bb.maxY }));
  return out;
}

/** Sample points of a graphic in its own coordinate space. */
function graphicPoints(g: Graphic): Vec2[] {
  switch (g.kind) {
    case 'line':
      return [g.start, g.end];
    case 'rect':
      return [g.start, { x: g.end.x, y: g.start.y }, g.end, { x: g.start.x, y: g.end.y }];
    case 'poly':
      return g.pts;
    case 'circle': {
      const r = Math.hypot(g.end.x - g.center.x, g.end.y - g.center.y);
      return [
        { x: g.center.x - r, y: g.center.y - r },
        { x: g.center.x + r, y: g.center.y + r },
      ];
    }
    case 'arc':
      return tessellateArc(g.start, g.mid, g.end);
  }
}

/** Emit an SVG element for a graphic, mapping points through `toBoard`. */
function strokeGraphic(g: Graphic, toBoard: (p: Vec2) => Vec2, stroke: string, width: number): string {
  const sw = Math.max(width, 0.05);
  switch (g.kind) {
    case 'line': {
      const a = toBoard(g.start);
      const b = toBoard(g.end);
      return `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${esc(
        stroke,
      )}" stroke-width="${sw}"/>`;
    }
    case 'rect':
    case 'poly': {
      const pts =
        g.kind === 'rect'
          ? [g.start, { x: g.end.x, y: g.start.y }, g.end, { x: g.start.x, y: g.end.y }, g.start]
          : g.pts;
      const d = polylinePath(pts.map(toBoard), g.kind === 'rect' || isClosed(g));
      return `<path d="${d}" stroke="${esc(stroke)}" stroke-width="${sw}"/>`;
    }
    case 'circle': {
      const c = toBoard(g.center);
      const r = Math.hypot(g.end.x - g.center.x, g.end.y - g.center.y);
      return `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}" stroke="${esc(
        stroke,
      )}" stroke-width="${sw}"/>`;
    }
    case 'arc': {
      const d = polylinePath(tessellateArc(g.start, g.mid, g.end).map(toBoard), false);
      return `<path d="${d}" stroke="${esc(stroke)}" stroke-width="${sw}"/>`;
    }
  }
}

function isClosed(g: Graphic): boolean {
  if (g.kind !== 'poly' || g.pts.length < 3) return false;
  const a = g.pts[0];
  const b = g.pts[g.pts.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
}

function polylinePath(pts: Vec2[], close: boolean): string {
  if (pts.length === 0) return '';
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${f(pts[i].x)} ${f(pts[i].y)}`;
  if (close) d += ' Z';
  return d;
}

function f(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 1000) / 1000).toString();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
