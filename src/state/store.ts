import { create } from 'zustand';
import type { BomResult, BomRow } from '../core/bom/derive';
import type { Board, Side } from '../core/model/types';
import { BRIGHT_PALETTE, colourAt } from '../core/colourplan/palette';
import { detectFormat, isBinaryDesign } from '../core/import';
import { trackBoardProcessed } from '../telemetry';
import { parseDesignFile } from '../worker/parseClient';

type Status = 'idle' | 'parsing' | 'ready' | 'error';
export type View = 'inspect' | 'plan';

/**
 * Hard cap on the raw input file, checked before we read it into memory. Even
 * the largest real boards (or ODB++/IPC archives) are well under this; the cap
 * just stops an accidental or hostile multi-GB file from freezing the tab.
 */
const MAX_INPUT_BYTES = 256 * 1024 * 1024; // 256 MB

interface AppState {
  filename: string | null;
  board: Board | null;
  bom: BomResult | null;
  status: Status;
  error: string | null;

  view: View;
  side: Side;
  /** Ordered group keys highlighted on the interactive board view. */
  selection: string[];
  hoverGroup: string | null;

  loadFile: (file: File) => Promise<void>;
  reset: () => void;
  setView: (view: View) => void;
  setSide: (side: Side) => void;
  toggleGroup: (groupKey: string) => void;
  clearSelection: () => void;
  setHoverGroup: (groupKey: string | null) => void;
}

export const useStore = create<AppState>((set, get) => ({
  filename: null,
  board: null,
  bom: null,
  status: 'idle',
  error: null,
  view: 'inspect',
  side: 'F',
  selection: [],
  hoverGroup: null,

  async loadFile(file) {
    set({ status: 'parsing', error: null, filename: file.name });
    try {
      if (file.size > MAX_INPUT_BYTES) {
        throw new Error(
          `File is ${(file.size / 1024 / 1024).toFixed(0)} MB; the limit is ${MAX_INPUT_BYTES / 1024 / 1024} MB.`,
        );
      }
      const data = isBinaryDesign(file.name) ? await file.arrayBuffer() : await file.text();
      const { board, bom } = await parseDesignFile(file.name, data);
      const hasBack = board.footprints.some((f) => f.side === 'B');
      set({
        board,
        bom,
        status: 'ready',
        side: board.footprints.some((f) => f.side === 'F') || !hasBack ? 'F' : 'B',
        selection: [],
        hoverGroup: null,
      });
      // Opt-in telemetry: counts only, no design content (see telemetry.ts).
      trackBoardProcessed({
        format: detectFormat(file.name),
        outcome: 'ok',
        components: board.footprints.length,
        bomLines: bom.rows.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ status: 'error', error: message, board: null, bom: null });
      trackBoardProcessed({
        format: detectFormat(file.name),
        outcome: /unrecognis|unsupported/i.test(message) ? 'unsupported' : 'parse_error',
      });
    }
  },

  reset() {
    set({ filename: null, board: null, bom: null, status: 'idle', error: null, selection: [], hoverGroup: null, view: 'inspect' });
  },

  setView(view) {
    set({ view });
  },

  setSide(side) {
    set({ side });
  },

  toggleGroup(groupKey) {
    const sel = get().selection;
    set({ selection: sel.includes(groupKey) ? sel.filter((k) => k !== groupKey) : [...sel, groupKey] });
  },

  clearSelection() {
    set({ selection: [] });
  },

  setHoverGroup(groupKey) {
    set({ hoverGroup: groupKey });
  },
}));

/** Map a group key to the refs it contains (built from the current BOM). */
export function groupRefIndex(bom: BomResult | null): Map<string, BomRow> {
  const m = new Map<string, BomRow>();
  if (bom) for (const r of bom.rows) m.set(r.groupKey, r);
  return m;
}

/** ref -> highlight colour, from the ordered selection and a palette. */
export function selectionHighlight(bom: BomResult | null, selection: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!bom) return map;
  const byKey = groupRefIndex(bom);
  selection.forEach((key, i) => {
    const row = byKey.get(key);
    if (!row) return;
    const colour = colourAt(BRIGHT_PALETTE, i);
    for (const ref of row.refs) map.set(ref, colour);
  });
  return map;
}
