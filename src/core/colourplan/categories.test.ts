import { describe, expect, it } from 'vitest';
import { loadFixture } from '../__fixtures__/load';
import { deriveBom, type BomRow } from '../bom/derive';
import { buildBoard } from '../model/board';
import { categoryOfRow, categorySlug, deriveCategories, detectPartNumberField } from './categories';

const board = buildBoard(loadFixture('sample.kicad_pcb'));
const { rows, propertyKeys } = deriveBom(board);

const mk = (p: Partial<BomRow>): BomRow => ({
  groupKey: 'k',
  refs: ['X1'],
  value: 'v',
  footprint: 'f',
  quantity: 1,
  sides: ['F'],
  mount: 'SMD',
  dnp: false,
  properties: {},
  ...p,
});

describe('categoryOfRow', () => {
  it('routes DNP parts to Not Mounted regardless of mount', () => {
    expect(categoryOfRow(mk({ dnp: true, mount: 'THT' })).id).toBe('NotMounted');
  });

  it('splits SMD and through-hole', () => {
    expect(categoryOfRow(mk({ mount: 'SMD' })).id).toBe('SMD');
    expect(categoryOfRow(mk({ mount: 'THT' })).id).toBe('THD');
  });

  it('normalises Assembly Process spellings to a canonical id', () => {
    expect(categoryOfRow(mk({ mount: 'THT', properties: { 'Assembly Process': 'THT' } })).id).toBe('THD');
    expect(categoryOfRow(mk({ mount: 'SMD', properties: { 'Assembly Process': 'SMT' } })).id).toBe('SMD');
  });

  it('routes "not fitted"/"DNP"-style processes to Not Mounted', () => {
    for (const v of ['Not Mounted', 'Not Fitted', 'DNP', 'DNF', 'Do Not Fit']) {
      expect(categoryOfRow(mk({ mount: 'SMD', properties: { 'Assembly Process': v } })).id).toBe('NotMounted');
    }
  });

  it('keeps unknown processes as their own category', () => {
    const c = categoryOfRow(mk({ mount: 'SMD', properties: { 'Assembly Process': 'Post-Assembly' } }));
    expect(c.id).toBe('Post-Assembly');
    expect(c.rawLabel).toBe('Post-Assembly');
  });
});

describe('deriveCategories', () => {
  it('groups the sample board into SMD, THD and Not Mounted', () => {
    const cats = deriveCategories(rows);
    const ids = cats.map((c) => c.id);
    expect(ids).toContain('SMD');
    expect(ids).toContain('THD');
    expect(ids).toContain('NotMounted');
    // Not Mounted always sorts last.
    expect(ids[ids.length - 1]).toBe('NotMounted');
  });

  it('labels the default categories SMT / THT / Not Mounted', () => {
    const byId = new Map(deriveCategories(rows).map((c) => [c.id, c.label]));
    expect(byId.get('SMD')).toBe('SMT');
    expect(byId.get('THD')).toBe('THT');
    expect(byId.get('NotMounted')).toBe('Not Mounted');
  });

  it('merges "THT"-tagged and untagged through-hole parts into one category', () => {
    const mixed: BomRow[] = [
      mk({ groupKey: 'a', refs: ['J1'], mount: 'THT', properties: { 'Assembly Process': 'THT' } }),
      mk({ groupKey: 'b', refs: ['J2'], mount: 'THT' }), // untagged -> mount-inferred
    ];
    const cats = deriveCategories(mixed);
    const thd = cats.filter((c) => c.id === 'THD');
    expect(thd).toHaveLength(1); // one category, not two
    expect(thd[0].rows).toHaveLength(2);
    expect(thd[0].label).toBe('THT'); // project's own wording wins
  });
});

describe('categorySlug', () => {
  it('makes filesystem-friendly slugs', () => {
    expect(categorySlug('SMT')).toBe('SMT');
    expect(categorySlug('THT')).toBe('THT');
    expect(categorySlug('Not Mounted')).toBe('Not-Mounted');
    expect(categorySlug('Post-Assembly')).toBe('Post-Assembly');
    expect(categorySlug('Through-Holes / PTH')).toBe('Through-Holes-PTH');
  });
});

describe('detectPartNumberField', () => {
  it('finds an MPN-like field', () => {
    expect(detectPartNumberField(propertyKeys)).toBe('MPN');
    expect(detectPartNumberField(['Tolerance', 'Voltage'])).toBeNull();
  });
});
