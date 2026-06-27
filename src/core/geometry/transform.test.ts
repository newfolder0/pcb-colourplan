import { describe, expect, it } from 'vitest';
import type { Footprint } from '../model/types';
import { boardBBox, circumcenter, fpLocalToBoard, mirrorX, tessellateArc } from './transform';

function fp(partial: Partial<Footprint>): Footprint {
  return {
    ref: 'X1',
    value: 'v',
    footprintName: 'f',
    side: 'F',
    mount: 'SMD',
    dnp: false,
    excludeFromBom: false,
    excludeFromPos: false,
    at: { x: 10, y: 20, rot: 0 },
    properties: {},
    graphics: [],
    pads: [],
    ...partial,
  };
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('fpLocalToBoard', () => {
  it('translates by footprint position at 0 rotation', () => {
    const p = fpLocalToBoard(fp({ at: { x: 10, y: 20, rot: 0 } }), { x: 1, y: 2 });
    expect(p).toEqual({ x: 11, y: 22 });
  });

  it('rotates front footprints CCW-positive in Y-down space', () => {
    // +90 deg: local +X (right) should point up (-Y) on a Y-down board.
    const p = fpLocalToBoard(fp({ at: { x: 0, y: 0, rot: 90 } }), { x: 1, y: 0 });
    expect(close(p.x, 0)).toBe(true);
    expect(close(p.y, -1)).toBe(true);
  });

  it('mirrors local Y for back-side footprints', () => {
    const p = fpLocalToBoard(fp({ side: 'B', at: { x: 0, y: 0, rot: 0 } }), { x: 1, y: 1 });
    expect(p).toEqual({ x: 1, y: -1 });
  });
});

describe('mirrorX', () => {
  it('reflects across a vertical axis', () => {
    expect(mirrorX({ x: 3, y: 5 }, 10)).toEqual({ x: 17, y: 5 });
  });
});

describe('circumcenter / tessellateArc', () => {
  it('finds the centre of a circle through three points', () => {
    const c = circumcenter({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 })!;
    expect(close(c.x, 0)).toBe(true);
    expect(close(c.y, 0)).toBe(true);
  });

  it('returns the chord for collinear points', () => {
    const pts = tessellateArc({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 });
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('keeps tessellated points on the arc radius', () => {
    const pts = tessellateArc({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
    expect(pts.length).toBeGreaterThan(2);
    for (const p of pts) expect(close(Math.hypot(p.x, p.y), 1)).toBe(true);
  });
});

describe('boardBBox', () => {
  it('bounds the Edge.Cuts outline plus margin', () => {
    const board = {
      title: '',
      rev: '',
      date: '',
      company: '',
      edges: [
        { kind: 'line' as const, layer: 'Edge.Cuts', width: 0.1, start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
        { kind: 'line' as const, layer: 'Edge.Cuts', width: 0.1, start: { x: 100, y: 80 }, end: { x: 0, y: 80 } },
      ],
      footprints: [],
    };
    const bb = boardBBox(board, 2);
    expect(bb).toEqual({ minX: -2, minY: -2, maxX: 102, maxY: 82 });
  });

  it('frames in a footprint placed outside the board outline', () => {
    const board = {
      title: '',
      rev: '',
      date: '',
      company: '',
      edges: [
        { kind: 'line' as const, layer: 'Edge.Cuts', width: 0.1, start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
        { kind: 'line' as const, layer: 'Edge.Cuts', width: 0.1, start: { x: 50, y: 30 }, end: { x: 0, y: 30 } },
      ],
      // Part sits above the top edge (y < 0); its body must be included.
      footprints: [
        fp({
          at: { x: 25, y: -12, rot: 0 },
          graphics: [{ kind: 'line', layer: 'F.Fab', width: 0.1, start: { x: -2, y: -2 }, end: { x: 2, y: 2 } }],
        }),
      ],
    };
    const bb = boardBBox(board, 2);
    expect(bb.minY).toBeLessThanOrEqual(-14); // extended up to include the off-board part
  });
});
