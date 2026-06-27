// Promise-based client around the parse worker.

import type { BomResult } from '../core/bom/derive';
import type { Board } from '../core/model/types';

export interface ParseOutput {
  board: Board;
  bom: BomResult;
}

interface Pending {
  resolve: (out: ParseOutput) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, board, bom, error } = e.data ?? {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve({ board, bom });
      else p.reject(new Error(error ?? 'Parse failed'));
    };
    worker.onerror = (e) => {
      for (const [, p] of pending) p.reject(new Error(e.message || 'Worker error'));
      pending.clear();
    };
  }
  return worker;
}

export function parseDesignFile(filename: string, data: string | ArrayBuffer): Promise<ParseOutput> {
  const id = ++seq;
  return new Promise<ParseOutput>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const w = getWorker();
    // Transfer the ArrayBuffer to avoid copying large binary designs.
    if (data instanceof ArrayBuffer) w.postMessage({ id, filename, data }, [data]);
    else w.postMessage({ id, filename, data });
  });
}
