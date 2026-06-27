// Geometry helpers: footprint-local -> board-space transforms, arc tessellation,
// and bounding boxes. All coordinates are in millimetres, board space (Y down).

import type { Board, Footprint, Graphic, Vec2 } from '../model/types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/**
 * Transform a footprint-local point into board space.
 *
 * Front: rotate by the footprint angle. KiCAD angles are counter-clockwise
 * positive while board Y points down, so the rotation uses -angle. Back: KiCAD
 * mirrors the footprint about its X axis (local Y negated) and the rotation
 * sense reverses. (Back-side convention verified against a real board.)
 */
export function fpLocalToBoard(fp: Footprint, p: Vec2): Vec2 {
  const lx = p.x;
  const ly = fp.side === 'B' ? -p.y : p.y;
  const angle = fp.side === 'B' ? fp.at.rot : -fp.at.rot;
  const rad = deg2rad(angle);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: fp.at.x + lx * c - ly * s,
    y: fp.at.y + lx * s + ly * c,
  };
}

/** Mirror a point's X about a vertical axis (used to flip bottom-side pages). */
export function mirrorX(p: Vec2, axisX: number): Vec2 {
  return { x: 2 * axisX - p.x, y: p.y };
}

/**
 * Tessellate a 3-point arc (start, a point on the arc, end) into a polyline.
 * Robust to collinear input (returns the chord).
 */
export function tessellateArc(start: Vec2, mid: Vec2, end: Vec2, maxSegments = 48): Vec2[] {
  const center = circumcenter(start, mid, end);
  if (!center) return [start, end];

  const r = Math.hypot(start.x - center.x, start.y - center.y);
  const a0 = Math.atan2(start.y - center.y, start.x - center.x);
  const am = Math.atan2(mid.y - center.y, mid.x - center.x);
  const a1 = Math.atan2(end.y - center.y, end.x - center.x);

  // Sweep from a0 to a1 in the direction that passes through am.
  let sweep = normalizeAngle(a1 - a0);
  const midSweep = normalizeAngle(am - a0);
  if (midSweep > sweep) sweep -= 2 * Math.PI; // go the other way round

  const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * maxSegments));
  const pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
  }
  return pts;
}

function normalizeAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x;
}

export function circumcenter(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

export function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function expandBBox(bb: BBox, p: Vec2): void {
  if (p.x < bb.minX) bb.minX = p.x;
  if (p.y < bb.minY) bb.minY = p.y;
  if (p.x > bb.maxX) bb.maxX = p.x;
  if (p.y > bb.maxY) bb.maxY = p.y;
}

export function bboxIsValid(bb: BBox): boolean {
  return bb.minX <= bb.maxX && bb.minY <= bb.maxY;
}

/** Expand a bbox by a graphic's points, each mapped to board space via `map`. */
function expandGraphic(bb: BBox, g: Graphic, map: (p: Vec2) => Vec2): void {
  switch (g.kind) {
    case 'line':
      expandBBox(bb, map(g.start));
      expandBBox(bb, map(g.end));
      break;
    case 'rect':
      expandBBox(bb, map(g.start));
      expandBBox(bb, map(g.end));
      expandBBox(bb, map({ x: g.start.x, y: g.end.y }));
      expandBBox(bb, map({ x: g.end.x, y: g.start.y }));
      break;
    case 'circle': {
      const r = Math.hypot(g.end.x - g.center.x, g.end.y - g.center.y);
      const c = map(g.center);
      expandBBox(bb, { x: c.x - r, y: c.y - r });
      expandBBox(bb, { x: c.x + r, y: c.y + r });
      break;
    }
    case 'arc':
      for (const p of tessellateArc(g.start, g.mid, g.end)) expandBBox(bb, map(p));
      break;
    case 'poly':
      for (const p of g.pts) expandBBox(bb, map(p));
      break;
  }
}

const identity = (p: Vec2): Vec2 => p;

/**
 * Bounding box of everything that gets drawn: the board outline (Edge.Cuts) plus
 * every footprint. Including footprints means a part placed outside the board
 * outline still frames into the board view, instead of spilling onto the page's
 * legend or title block.
 */
export function boardBBox(board: Board, margin = 2): BBox {
  const bb = emptyBBox();
  for (const e of board.edges) expandGraphic(bb, e, identity);
  for (const fp of board.footprints) {
    expandBBox(bb, fpLocalToBoard(fp, { x: 0, y: 0 }));
    for (const g of fp.graphics) expandGraphic(bb, g, (p) => fpLocalToBoard(fp, p));
    for (const pad of fp.pads) expandBBox(bb, fpLocalToBoard(fp, pad.at));
  }
  if (!bboxIsValid(bb)) return { minX: 0, minY: 0, maxX: 100, maxY: 80 };
  bb.minX -= margin;
  bb.minY -= margin;
  bb.maxX += margin;
  bb.maxY += margin;
  return bb;
}
