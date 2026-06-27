// Parses a PCB design file off the main thread. The file never leaves the
// browser; this worker only isolates CPU work and keeps the UI responsive.

import { deriveBom } from '../core/bom/derive';
import { parseDesign } from '../core/import';

interface ParseRequest {
  id: number;
  filename: string;
  data: string | ArrayBuffer;
}

// `self` is typed as Window under the DOM lib; cast postMessage to the
// single-argument worker signature.
const post = (msg: unknown): void =>
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg);

self.addEventListener('message', (e: MessageEvent<ParseRequest>) => {
  const { id, filename, data } = e.data;
  try {
    const board = parseDesign(filename, data);
    const bom = deriveBom(board);
    post({ id, ok: true, board, bom });
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
