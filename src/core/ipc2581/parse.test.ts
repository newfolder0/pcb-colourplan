import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom/derive';
import { deriveCategories } from '../colourplan/categories';
import { parseIpc2581 } from './parse';

const xml = readFileSync(fileURLToPath(new URL('./__fixtures__/sample.xml', import.meta.url)), 'utf8');
const board = parseIpc2581(xml);
const fp = (ref: string) => board.footprints.find((f) => f.ref === ref)!;

describe('parseIpc2581', () => {
  it('rejects non-IPC-2581 XML', () => {
    expect(() => parseIpc2581('<root/>')).toThrow();
  });

  it('reads title, revision and the board outline', () => {
    expect(board.title).toBe('Sample Board');
    expect(board.rev).toBe('C');
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0].layer).toBe('Edge.Cuts');
  });

  it('parses all components', () => {
    expect(board.footprints).toHaveLength(6);
    expect(board.footprints.map((f) => f.ref).sort()).toEqual(['C1', 'C2', 'J1', 'R1', 'R2', 'R3']);
  });

  it('maps side, mount, value and DNP', () => {
    expect(fp('C2').side).toBe('B');
    expect(fp('R1').side).toBe('F');
    expect(fp('J1').mount).toBe('THT');
    expect(fp('R1').mount).toBe('SMD');
    expect(fp('R1').value).toBe('10k');
    expect(fp('R3').dnp).toBe(true);
    expect(fp('R1').dnp).toBe(false);
  });

  it('attaches the package outline as a Fab graphic', () => {
    expect(fp('R1').graphics).toHaveLength(1);
    expect(fp('R1').graphics[0].layer).toBe('F.Fab');
    expect(fp('C2').graphics[0].layer).toBe('B.Fab');
  });

  it('feeds the existing BOM + category pipeline', () => {
    const { rows } = deriveBom(board);
    const cats = deriveCategories(rows).map((c) => c.id);
    expect(cats).toContain('SMD');
    expect(cats).toContain('THD');
    expect(cats).toContain('NotMounted');
    // R1+R2 group, qty 2.
    const r = rows.find((row) => row.refs.join(',') === 'R1,R2')!;
    expect(r.quantity).toBe(2);
  });
});
