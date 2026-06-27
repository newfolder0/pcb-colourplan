// Expand BOM categories into colour-plan pages: each (category, side) is a
// "document", paginated at most N groups per page. Each page's groups get the
// first N palette colours, so the colour meaning resets every page.

import type { BomRow } from '../bom/derive';
import type { Side } from '../model/types';
import type { Category } from './categories';
import { colourAt } from './palette';

export interface PlanGroup {
  groupKey: string;
  colour: string;
  row: BomRow;
}

export interface CatPage {
  categoryId: string;
  category: string;
  side: Side;
  groups: PlanGroup[];
  /** Running document number across the whole output. */
  docNumber: number;
  pageInDoc: number;
  pagesInDoc: number;
}

export interface DocumentConfig {
  sides: Side[];
  groupsPerPage: number;
  palette: string[];
  /** Restrict to these category ids (default: all). */
  categoryIds?: Set<string>;
}

/**
 * Expand categories into a flat, ordered list of pages: for each category, for
 * each side that has parts, paginate its lines into pages of <=N groups. Each
 * (category, side) pair is one "document" with its own running number.
 */
export function buildDocuments(categories: Category[], config: DocumentConfig): CatPage[] {
  const perPage = Math.max(1, config.groupsPerPage);
  const pages: CatPage[] = [];
  let docNumber = 0;

  for (const cat of categories) {
    if (config.categoryIds && !config.categoryIds.has(cat.id)) continue;
    for (const side of config.sides) {
      const sideRows = cat.rows.filter((r) => r.sides.includes(side));
      if (!sideRows.length) continue;
      docNumber++;
      const pagesInDoc = Math.ceil(sideRows.length / perPage);
      for (let i = 0; i < sideRows.length; i += perPage) {
        const chunk = sideRows.slice(i, i + perPage);
        pages.push({
          categoryId: cat.id,
          category: cat.label,
          side,
          groups: chunk.map((row, j) => ({ groupKey: row.groupKey, row, colour: colourAt(config.palette, j) })),
          docNumber,
          pageInDoc: Math.floor(i / perPage) + 1,
          pagesInDoc,
        });
      }
    }
  }
  return pages;
}

/** ref -> colour map for a single plan page (used to highlight the board). */
export function pageHighlight(page: { groups: PlanGroup[] }): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of page.groups) for (const ref of g.row.refs) map.set(ref, g.colour);
  return map;
}
