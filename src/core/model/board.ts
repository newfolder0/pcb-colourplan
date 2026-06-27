// Build the typed Board model from `.kicad_pcb` text.

import {
  atomsAfterTag,
  children,
  childrenWithTag,
  firstWithTag,
  isList,
  num,
  parseSExpr,
  str,
  tag,
  type SExpr,
} from '../parser/sexpr';
import type { Board, Footprint, Graphic, Mount, Pad, Side, Vec2 } from './types';

/** Parse `.kicad_pcb` text into a Board. Throws if it is not a kicad_pcb file. */
export function buildBoard(text: string): Board {
  const root = parseSExpr(text);
  if (!isList(root) || tag(root) !== 'kicad_pcb') {
    throw new Error('Not a .kicad_pcb file (missing kicad_pcb root)');
  }

  const version = num(firstWithTag(root, 'version')?.[1]) || undefined;
  const tb = firstWithTag(root, 'title_block');

  const edges: Graphic[] = [];
  for (const c of children(root)) {
    if (tag(c).startsWith('gr_')) {
      const g = parseGraphic(c);
      if (g && g.layer === 'Edge.Cuts') edges.push(g);
    }
  }

  const footprints = childrenWithTag(root, 'footprint').map(parseFootprint);

  return {
    title: tb ? str(firstWithTag(tb, 'title')?.[1]) : '',
    rev: tb ? str(firstWithTag(tb, 'rev')?.[1]) : '',
    date: tb ? str(firstWithTag(tb, 'date')?.[1]) : '',
    company: tb ? str(firstWithTag(tb, 'company')?.[1]) : '',
    kicadVersion: version,
    edges,
    footprints,
  };
}

function parseFootprint(node: SExpr[]): Footprint {
  const link = str(atomsAfterTag(node)[0]);
  const placementLayer = str(firstWithTag(node, 'layer')?.[1], 'F.Cu');
  const side: Side = placementLayer.startsWith('B') ? 'B' : 'F';

  const at = firstWithTag(node, 'at');
  const placement = { x: num(at?.[1]), y: num(at?.[2]), rot: num(at?.[3]) };

  const properties: Record<string, string> = {};
  for (const p of childrenWithTag(node, 'property')) {
    const key = str(p[1]);
    if (key) properties[key] = str(p[2]);
  }

  let ref = properties['Reference'] ?? '';
  let value = properties['Value'] ?? '';
  if (!ref || !value) {
    // Older files store Reference/Value as fp_text instead of property.
    for (const ft of childrenWithTag(node, 'fp_text')) {
      const kind = str(ft[1]);
      if (kind === 'reference' && !ref) ref = str(ft[2]);
      if (kind === 'value' && !value) value = str(ft[2]);
    }
  }

  const footprintName = properties['Footprint'] || link;

  const pads = childrenWithTag(node, 'pad').map(parsePad);

  const attrNode = firstWithTag(node, 'attr');
  const attrs = attrNode ? atomsAfterTag(attrNode).map(String) : [];
  const dnp = attrs.includes('dnp');
  // A footprint with no pads is a graphic (silkscreen symbol, logo, dimension
  // mark), never an assembled component - keep it out of the BOM/colour-plan.
  // It still renders on the board wireframe via its graphics. This matches the
  // IPC/ODB adapters, which also drop documentation/symbol items.
  const excludeFromBom = attrs.includes('exclude_from_bom') || pads.length === 0;
  const excludeFromPos = attrs.includes('exclude_from_pos_files');

  let mount: Mount;
  if (attrs.includes('through_hole')) mount = 'THT';
  else if (attrs.includes('smd')) mount = 'SMD';
  else mount = pads.some((p) => p.type === 'thru_hole' || p.type === 'np_thru_hole') ? 'THT' : 'SMD';

  const graphics: Graphic[] = [];
  for (const c of children(node)) {
    const g = parseGraphic(c);
    if (g) graphics.push(g);
  }

  const uuid = str(firstWithTag(node, 'uuid')?.[1]) || undefined;

  return {
    uuid,
    ref,
    value,
    footprintName,
    side,
    mount,
    dnp,
    excludeFromBom,
    excludeFromPos,
    at: placement,
    properties,
    graphics,
    pads,
  };
}

function parsePad(node: SExpr[]): Pad {
  const atoms = atomsAfterTag(node).map(String);
  const at = firstWithTag(node, 'at');
  const size = firstWithTag(node, 'size');
  const layersNode = firstWithTag(node, 'layers');

  let drill: number | undefined;
  const drillNode = firstWithTag(node, 'drill');
  if (drillNode) {
    // `(drill 0.8)` or `(drill oval 0.8 1.2)`
    const da = atomsAfterTag(drillNode);
    const firstNum = da.find((v) => typeof v === 'number');
    drill = typeof firstNum === 'number' ? firstNum : undefined;
  }

  return {
    number: atoms[0] ?? '',
    type: (atoms[1] ?? 'smd') as Pad['type'],
    shape: atoms[2] ?? 'rect',
    at: { x: num(at?.[1]), y: num(at?.[2]), rot: num(at?.[3]) },
    size: { x: num(size?.[1]), y: num(size?.[2]) },
    drill,
    layers: layersNode ? atomsAfterTag(layersNode).map(String) : [],
  };
}

function parseGraphic(node: SExpr[]): Graphic | null {
  const t = tag(node);
  const layer = str(firstWithTag(node, 'layer')?.[1]);
  const width = readWidth(node);

  switch (t) {
    case 'fp_line':
    case 'gr_line': {
      const start = readXY(firstWithTag(node, 'start'));
      const end = readXY(firstWithTag(node, 'end'));
      return start && end ? { kind: 'line', layer, width, start, end } : null;
    }
    case 'fp_rect':
    case 'gr_rect': {
      const start = readXY(firstWithTag(node, 'start'));
      const end = readXY(firstWithTag(node, 'end'));
      return start && end ? { kind: 'rect', layer, width, start, end } : null;
    }
    case 'fp_circle':
    case 'gr_circle': {
      const center = readXY(firstWithTag(node, 'center'));
      const end = readXY(firstWithTag(node, 'end'));
      return center && end ? { kind: 'circle', layer, width, center, end } : null;
    }
    case 'fp_arc':
    case 'gr_arc': {
      const start = readXY(firstWithTag(node, 'start'));
      const mid = readXY(firstWithTag(node, 'mid'));
      const end = readXY(firstWithTag(node, 'end'));
      return start && mid && end ? { kind: 'arc', layer, width, start, mid, end } : null;
    }
    case 'fp_poly':
    case 'gr_poly': {
      const ptsNode = firstWithTag(node, 'pts');
      const pts = ptsNode ? readPts(ptsNode) : [];
      return pts.length >= 2 ? { kind: 'poly', layer, width, pts } : null;
    }
    default:
      return null;
  }
}

function readWidth(node: SExpr[]): number {
  const w = firstWithTag(node, 'width');
  if (w) return num(w[1], 0.12);
  // KiCAD 7+ uses `(stroke (width W) ...)`.
  const stroke = firstWithTag(node, 'stroke');
  if (stroke) {
    const sw = firstWithTag(stroke, 'width');
    if (sw) return num(sw[1], 0.12);
  }
  return 0.12;
}

function readXY(node: SExpr[] | undefined): Vec2 | null {
  if (!node) return null;
  return { x: num(node[1]), y: num(node[2]) };
}

function readPts(node: SExpr[]): Vec2[] {
  return childrenWithTag(node, 'xy').map((p) => ({ x: num(p[1]), y: num(p[2]) }));
}
