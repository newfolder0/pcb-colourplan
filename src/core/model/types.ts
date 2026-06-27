// Typed board model derived from a parsed `.kicad_pcb`. All coordinates are in
// millimetres in KiCAD board space (origin top-left, Y increases downward).

export type Side = 'F' | 'B';
export type Mount = 'SMD' | 'THT';

export interface Vec2 {
  x: number;
  y: number;
}

/** Position + rotation (degrees, as stored in the file). */
export interface Placement {
  x: number;
  y: number;
  rot: number;
}

export interface GfxLine {
  kind: 'line';
  layer: string;
  width: number;
  start: Vec2;
  end: Vec2;
}
export interface GfxRect {
  kind: 'rect';
  layer: string;
  width: number;
  start: Vec2;
  end: Vec2;
}
export interface GfxCircle {
  kind: 'circle';
  layer: string;
  width: number;
  center: Vec2;
  /** A point on the circle; radius = |end - center|. */
  end: Vec2;
}
export interface GfxArc {
  kind: 'arc';
  layer: string;
  width: number;
  start: Vec2;
  mid: Vec2;
  end: Vec2;
}
export interface GfxPoly {
  kind: 'poly';
  layer: string;
  width: number;
  pts: Vec2[];
}
export type Graphic = GfxLine | GfxRect | GfxCircle | GfxArc | GfxPoly;

export type PadType = 'smd' | 'thru_hole' | 'np_thru_hole' | 'connect';

export interface Pad {
  number: string;
  type: PadType;
  shape: string; // rect, circle, oval, roundrect, trapezoid, custom
  /** Relative to footprint origin; rot is relative to footprint rotation. */
  at: Placement;
  size: Vec2;
  /** Round-drill diameter in mm, if any. */
  drill?: number;
  layers: string[];
}

export interface Footprint {
  uuid?: string;
  ref: string;
  value: string;
  /** Library id (e.g. "Resistor_SMD:R_0402_1005Metric") or the "Footprint" property. */
  footprintName: string;
  side: Side;
  mount: Mount;
  dnp: boolean;
  excludeFromBom: boolean;
  excludeFromPos: boolean;
  at: Placement;
  /** All `(property ...)` fields, including Reference/Value/Footprint. */
  properties: Record<string, string>;
  /** Footprint graphics (fab/silk/courtyard/...), in footprint-local coords. */
  graphics: Graphic[];
  pads: Pad[];
}

export interface Board {
  title: string;
  rev: string;
  date: string;
  company: string;
  kicadVersion?: number;
  /** Board outline graphics on the Edge.Cuts layer, in board coords. */
  edges: Graphic[];
  footprints: Footprint[];
}
