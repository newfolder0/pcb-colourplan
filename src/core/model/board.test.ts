import { describe, expect, it } from 'vitest';
import { loadFixture } from '../__fixtures__/load';
import { buildBoard } from './board';

const board = buildBoard(loadFixture('sample.kicad_pcb'));

describe('buildBoard', () => {
  it('reads the title block and version', () => {
    expect(board.title).toBe('Sample Board');
    expect(board.rev).toBe('A');
    expect(board.kicadVersion).toBe(20240108);
  });

  it('collects Edge.Cuts board outline graphics', () => {
    expect(board.edges).toHaveLength(4);
    expect(board.edges.every((g) => g.layer === 'Edge.Cuts')).toBe(true);
  });

  it('parses all footprints', () => {
    expect(board.footprints).toHaveLength(7);
  });

  const fp = (ref: string) => board.footprints.find((f) => f.ref === ref)!;

  it('reads placement, rotation and side', () => {
    expect(fp('R1').at).toEqual({ x: 20, y: 20, rot: 0 });
    expect(fp('R2').at.rot).toBe(90);
    expect(fp('C2').side).toBe('B');
    expect(fp('R1').side).toBe('F');
  });

  it('detects SMD vs through-hole mount', () => {
    expect(fp('R1').mount).toBe('SMD');
    expect(fp('J1').mount).toBe('THT');
  });

  it('detects DNP and exclude flags', () => {
    expect(fp('R3').dnp).toBe(true);
    expect(fp('R1').dnp).toBe(false);
    expect(fp('H1').excludeFromBom).toBe(true);
  });

  it('reads properties including custom fields', () => {
    expect(fp('J1').properties['MPN']).toBe('618-002-1');
    expect(fp('R1').value).toBe('10k');
    expect(fp('R1').footprintName).toBe('Resistor_SMD:R_0402_1005Metric');
  });

  it('captures footprint graphics and pads', () => {
    expect(fp('R1').graphics.length).toBeGreaterThan(0);
    expect(fp('R1').graphics.every((g) => g.layer.endsWith('.Fab'))).toBe(true);
    expect(fp('J1').pads.some((p) => p.type === 'thru_hole' && p.drill === 1)).toBe(true);
  });
});
