// Group BOM lines into assembly-process categories (SMD / THD /
// Not Mounted, plus future custom processes).
//
// FUTURE: parts will carry an "Assembly Process" field (SMT, THT,
// Post-Assembly, ...). categoryOfRow already prefers that field when present,
// so switching the library over is a no-op here.

import type { BomRow } from '../bom/derive';

export const ASSEMBLY_PROCESS_FIELD = 'Assembly Process';

export interface Category {
  id: string;
  label: string;
  rows: BomRow[];
}

const DEFAULT_LABELS: Record<string, string> = {
  SMD: 'SMD',
  THD: 'Through-Holes',
  NotMounted: 'Not Mounted',
};

// Normalise common Assembly Process spellings to a canonical id, so that a
// part tagged "THT" and an untagged through-hole part land in the SAME
// category (rather than splitting into "THT" and "Through-Holes").
const CANONICAL: Record<string, string> = {
  smd: 'SMD',
  smt: 'SMD',
  thd: 'THD',
  tht: 'THD',
  th: 'THD',
  throughhole: 'THD',
  throughholes: 'THD',
  pth: 'THD',
  notmounted: 'NotMounted',
  dnp: 'NotMounted',
  nm: 'NotMounted',
  donotpopulate: 'NotMounted',
  donotmount: 'NotMounted',
};

/** Normalise a key for separator/case-insensitive matching ("Assembly_Process" == "Assembly Process"). */
function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s._-]+/g, '');
}

function canonicalId(raw: string): string {
  return CANONICAL[normKey(raw)] ?? raw.trim();
}

/** Look up a property by name, ignoring case and separators (space/_/-/.). */
function propByName(props: Record<string, string>, name: string): string | undefined {
  const target = normKey(name);
  for (const [k, v] of Object.entries(props)) if (normKey(k) === target) return v;
  return undefined;
}

/** The category a BOM line belongs to: canonical id, and the raw field label if any. */
export function categoryOfRow(row: BomRow): { id: string; rawLabel?: string } {
  if (row.dnp) return { id: 'NotMounted' }; // DNP parts are "not mounted" regardless of process
  // ODB++ spells custom fields with underscores ("Assembly_Process"); match loosely.
  const ap = propByName(row.properties, ASSEMBLY_PROCESS_FIELD)?.trim();
  if (ap) return { id: canonicalId(ap), rawLabel: ap }; // explicit Assembly Process field wins
  return { id: row.mount === 'THT' ? 'THD' : 'SMD' };
}

export function deriveCategories(rows: BomRow[]): Category[] {
  const map = new Map<string, { rows: BomRow[]; label?: string }>();
  for (const row of rows) {
    const { id, rawLabel } = categoryOfRow(row);
    let entry = map.get(id);
    if (!entry) map.set(id, (entry = { rows: [] }));
    entry.rows.push(row);
    // Prefer the project's own wording (first explicit field value seen).
    if (rawLabel && !entry.label) entry.label = rawLabel;
  }
  return [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([id, entry]) => ({ id, label: entry.label ?? DEFAULT_LABELS[id] ?? id, rows: entry.rows }));
}

function rank(id: string): number {
  if (id === 'SMD') return 0;
  if (id === 'THD') return 1;
  if (id === 'NotMounted') return 100; // always last
  return 50; // custom Assembly Process values in between
}

/** Auto-detect the "Part Number" field from discovered property keys. */
const PN_CANDIDATES = [
  'MPN',
  'Part Number',
  'PartNumber',
  'Manufacturer Part Number',
  'Manufacturer_Part_Number',
  'MPN1',
  'PN',
];

export function detectPartNumberField(propertyKeys: string[]): string | null {
  for (const cand of PN_CANDIDATES) {
    const target = normKey(cand);
    const hit = propertyKeys.find((k) => normKey(k) === target);
    if (hit) return hit;
  }
  return null;
}
