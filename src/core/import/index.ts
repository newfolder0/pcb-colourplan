// Detect the input format and dispatch to the right format -> Board adapter.
// Everything downstream depends only on the Board model, so adding a format is
// just adding an adapter here.

import { parseIpc2581 } from '../ipc2581/parse';
import { buildBoard } from '../model/board';
import type { Board } from '../model/types';
import { parseOdbpp } from '../odbpp/parse';

export type DesignData = string | ArrayBuffer | Uint8Array;

const BINARY_RE = /\.(tgz|tar\.gz|tar|zip)$/i;

/** True if the file must be read as bytes (ArrayBuffer) rather than text. */
export function isBinaryDesign(filename: string): boolean {
  return BINARY_RE.test(filename);
}

export type DesignFormat = 'kicad' | 'ipc2581' | 'odbpp' | 'unknown';

/**
 * Classify a file by name only (no content) for telemetry/UI. Mirrors the
 * dispatch in parseDesign. Returns 'unknown' for extensions we sniff at parse
 * time. Carries no design data.
 */
export function detectFormat(filename: string): DesignFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.kicad_pcb')) return 'kicad';
  if (lower.endsWith('.xml') || lower.endsWith('.cvg')) return 'ipc2581';
  if (BINARY_RE.test(lower)) return 'odbpp';
  return 'unknown';
}

export function parseDesign(filename: string, data: DesignData): Board {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.kicad_pcb')) return buildBoard(asText(data));
  if (lower.endsWith('.xml') || lower.endsWith('.cvg')) return parseIpc2581(asText(data));
  if (BINARY_RE.test(lower)) return parseOdbpp(asBytes(data));

  // Unknown extension: sniff text content.
  if (typeof data === 'string') {
    if (data.includes('(kicad_pcb')) return buildBoard(data);
    if (/<IPC-2581/i.test(data)) return parseIpc2581(data);
  }
  throw new Error(`Unrecognised file type: ${filename}`);
}

function asText(d: DesignData): string {
  if (typeof d === 'string') return d;
  return new TextDecoder().decode(d instanceof Uint8Array ? d : new Uint8Array(d));
}

function asBytes(d: DesignData): Uint8Array {
  if (typeof d === 'string') return new TextEncoder().encode(d);
  return d instanceof Uint8Array ? d : new Uint8Array(d);
}
