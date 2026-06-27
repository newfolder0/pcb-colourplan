import { describe, expect, it } from 'vitest';
import { loadFixture } from '../__fixtures__/load';
import { buildBoard } from '../model/board';
import { deriveBom } from './derive';

const board = buildBoard(loadFixture('sample.kicad_pcb'));

describe('deriveBom', () => {
  const { rows, propertyKeys } = deriveBom(board);
  const find = (refs: string[]) => rows.find((r) => r.refs.join(',') === refs.join(','));

  it('excludes exclude_from_bom footprints by default', () => {
    expect(rows.some((r) => r.refs.includes('H1'))).toBe(false);
  });

  it('groups identical value+footprint parts into one line', () => {
    const r = find(['R1', 'R2']);
    expect(r).toBeDefined();
    expect(r!.quantity).toBe(2);
    expect(r!.value).toBe('10k');
  });

  it('keeps DNP parts on a separate line', () => {
    const fit = find(['R1', 'R2'])!;
    const dnp = find(['R3'])!;
    expect(fit.dnp).toBe(false);
    expect(dnp.dnp).toBe(true);
    expect(dnp.quantity).toBe(1);
  });

  it('records the side(s) of a line', () => {
    expect(find(['C2'])!.sides).toEqual(['B']);
    expect(find(['C1'])!.sides).toEqual(['F']);
  });

  it('records mount type per line', () => {
    expect(find(['J1'])!.mount).toBe('THT');
    expect(find(['C1'])!.mount).toBe('SMD');
  });

  it('discovers custom property columns and per-line values', () => {
    expect(propertyKeys).toContain('MPN');
    expect(find(['J1'])!.properties['MPN']).toBe('618-002-1');
  });

  it('produces the expected number of BOM lines', () => {
    // 10k(R1,R2), 10k DNP(R3), 10nF(C1), 1nF(C2), Conn(J1)
    expect(rows).toHaveLength(5);
  });

  it('can include excluded parts on request', () => {
    const withExcluded = deriveBom(board, { includeExcluded: true });
    expect(withExcluded.rows.some((r) => r.refs.includes('H1'))).toBe(true);
  });
});
