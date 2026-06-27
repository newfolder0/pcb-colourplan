import { describe, expect, it } from 'vitest';
import { loadFixture } from '../__fixtures__/load';
import { deriveBom } from '../bom/derive';
import { buildBoard } from '../model/board';
import { deriveCategories } from './categories';
import { STANDARD_PALETTE } from './palette';
import { buildDocuments, pageHighlight } from './paginate';

const board = buildBoard(loadFixture('sample.kicad_pcb'));
const { rows } = deriveBom(board);
const categories = deriveCategories(rows);

describe('buildDocuments', () => {
  it('creates a document per (category, side) with running numbers', () => {
    const pages = buildDocuments(categories, { sides: ['F', 'B'], groupsPerPage: 4, palette: STANDARD_PALETTE });
    // SMD top (10k, 10nF), THD top (Conn), NotMounted top (10k DNP), SMD bot (1nF)
    const docs = new Set(pages.map((p) => `${p.categoryId}/${p.side}`));
    expect(docs.has('SMD/F')).toBe(true);
    expect(docs.has('THD/F')).toBe(true);
    expect(docs.has('NotMounted/F')).toBe(true);
    expect(docs.has('SMD/B')).toBe(true);
    expect(pages[0].docNumber).toBe(1);
    expect(new Set(pages.map((p) => p.docNumber)).size).toBe(docs.size);
  });

  it('respects groupsPerPage and pages within a document', () => {
    const pages = buildDocuments(categories, { sides: ['F'], groupsPerPage: 1, palette: STANDARD_PALETTE });
    const smd = pages.filter((p) => p.categoryId === 'SMD');
    expect(smd.length).toBe(2); // 10k + 10nF, one group per page
    expect(smd[0].pagesInDoc).toBe(2);
    expect(smd.map((p) => p.pageInDoc)).toEqual([1, 2]);
  });

  it('can restrict to selected categories', () => {
    const pages = buildDocuments(categories, {
      sides: ['F', 'B'],
      groupsPerPage: 4,
      palette: STANDARD_PALETTE,
      categoryIds: new Set(['SMD']),
    });
    expect(pages.every((p) => p.categoryId === 'SMD')).toBe(true);
  });

  it('assigns the first palette colour to the first group', () => {
    const pages = buildDocuments(categories, { sides: ['F'], groupsPerPage: 4, palette: STANDARD_PALETTE });
    expect(pages[0].groups[0].colour).toBe(STANDARD_PALETTE[0]);
    const hl = pageHighlight(pages[0]);
    expect(hl.get(pages[0].groups[0].row.refs[0])).toBe(STANDARD_PALETTE[0]);
  });
});
