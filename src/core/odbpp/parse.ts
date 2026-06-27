// ODB++ (Siemens) -> Board adapter.
//
// An ODB++ design is a directory tree of ASCII files, usually delivered as a
// .tgz (or .tar / .zip). We read:
//   steps/<step>/eda/data                       -> package bounding boxes
//   steps/<step>/layers/comp_+_top|bot/components -> component placements
//   steps/<step>/profile                        -> board outline
//
// Runs in a Web Worker: decompression via fflate (gzip/zip) + nanotar (tar),
// both no-DOM. v1 renders each component as its package bounding-box rectangle
// (full silk outline lives in layer artwork - deferred). COORDINATE NOTE: ODB++
// is Y-up; Y_SIGN converts to our Y-down model. Rotation/mirror signs should be
// confirmed against a real export (see plan).

import { Gunzip, unzipSync } from 'fflate';
import { parseTar } from 'nanotar';
import type { Board, Footprint, Graphic, Mount, Side, Vec2 } from '../model/types';

const Y_SIGN = -1;
// ODB++ is Y-up with counter-clockwise rotations. Flipping Y to our Y-down model
// mirrors the coordinate system, which reverses the rotation sense, so component
// angles must be negated. Confirmed against a real KiCAD export: CON1 is 270deg in
// ODB++ but 90deg in the .kicad_pcb / IPC-2581 of the same board.
const ROT_SIGN = -1;

// Cap on total decompressed bytes from one archive. Generous for real ODB++
// designs (ASCII layer files) but bounds a decompression bomb - a tiny archive
// that expands to many GB - so it cannot exhaust memory and freeze the tab.
const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024; // 512 MB

export function parseOdbpp(bytes: Uint8Array): Board {
  return boardFromOdbFiles(decodeText(readArchive(bytes)));
}

/** Build a Board from a map of ODB++ file path -> text content (test seam). */
export function boardFromOdbFiles(files: Map<string, string>): Board {
  const compPaths = [...files.keys()].filter((p) => /comp_\+_(top|bot)\/components$/i.test(p));
  if (!compPaths.length) throw new Error('Not an ODB++ design (no comp_+_top/components found)');

  const edaPath = [...files.keys()].find((p) => /\/eda\/data$/i.test(p));
  const packages = edaPath ? parsePackages(files.get(edaPath)!) : [];

  const profilePath = [...files.keys()].find((p) => /\/profile$/i.test(p));
  const edges = profilePath ? parseProfile(files.get(profilePath)!) : [];

  const footprints: Footprint[] = [];
  for (const path of compPaths) {
    const side: Side = /comp_\+_bot\//i.test(path) ? 'B' : 'F';
    footprints.push(...parseComponents(files.get(path)!, side, packages));
  }

  return { title: '', rev: '', date: '', company: '', edges, footprints };
}

interface Pkg {
  name: string;
  bbox: { xmin: number; ymin: number; xmax: number; ymax: number };
}

function parsePackages(text: string): Pkg[] {
  const scale = unitScale(text);
  const pkgs: Pkg[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('PKG ')) continue;
    const t = line.trim().split(/\s+/);
    // PKG <name> <pitch> <xmin> <ymin> <xmax> <ymax> ...
    pkgs.push({
      name: t[1] ?? '',
      bbox: {
        xmin: num(t[3]) * scale,
        ymin: num(t[4]) * scale,
        xmax: num(t[5]) * scale,
        ymax: num(t[6]) * scale,
      },
    });
  }
  return pkgs;
}

function parseProfile(text: string): Graphic[] {
  const scale = unitScale(text);
  const edges: Graphic[] = [];
  let pts: Vec2[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('OB ')) {
      pts = [];
      const t = line.split(/\s+/);
      pts.push({ x: num(t[1]) * scale, y: Y_SIGN * num(t[2]) * scale });
    } else if (line.startsWith('OS ') || line.startsWith('OC ')) {
      const t = line.split(/\s+/);
      pts.push({ x: num(t[1]) * scale, y: Y_SIGN * num(t[2]) * scale });
    } else if (line.startsWith('OE')) {
      if (pts.length >= 2) edges.push({ kind: 'poly', layer: 'Edge.Cuts', width: 0.1, pts });
      pts = [];
    }
  }
  return edges;
}

function parseComponents(text: string, side: Side, packages: Pkg[]): Footprint[] {
  const scale = unitScale(text);
  const attrNames = new Map<number, string>();
  const out: Footprint[] = [];
  let current: Footprint | undefined; // the CMP that following PRP records attach to

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const am = /^@(\d+)\s+(\S+)/.exec(line);
    if (am) {
      attrNames.set(Number(am[1]), am[2]);
      continue;
    }
    // PRP records carry the real fields (Value, Value2, Voltage, ...) and follow
    // their CMP. The CMP head only has the package/part name, not the value.
    if (line.startsWith('PRP ') && current) {
      const pm = /^PRP\s+(\S+)\s+(?:'([^']*)'|"([^"]*)"|(\S+))/.exec(line);
      if (pm) {
        const name = pm[1];
        const val = pm[2] ?? pm[3] ?? pm[4] ?? '';
        current.properties[name] = val;
        if (name === 'Value' && val) current.value = val; // real value, not the package name
      }
      continue;
    }
    if (!line.startsWith('CMP ')) continue; // ignore TOP/pin and comment lines

    const semi = line.indexOf(';');
    const head = semi >= 0 ? line.slice(0, semi) : line;
    const attrs = parseAttrs(semi >= 0 ? line.slice(semi + 1) : '', attrNames);
    const t = tokenize(head); // CMP pkgRef x y rot mirror compName partName
    const pkg = packages[Number(t[1])];
    const ref = t[6] ?? '';
    if (!ref) {
      current = undefined;
      continue;
    }

    const dnp = attrs.has('.no_pop') || attrs.has('.comp_ignore') || attrs.has('.no_load');
    const graphics: Graphic[] = pkg ? [bboxRect(pkg.bbox, `${side}.Fab`)] : [];

    current = {
      ref,
      value: t[7] ?? '', // package/part name; overridden by a PRP Value below if present
      footprintName: pkg?.name || t[7] || '',
      side,
      mount: mountOf(attrs.get('.comp_mount_type') ?? ''),
      dnp,
      excludeFromBom: false,
      excludeFromPos: false,
      at: { x: num(t[2]) * scale, y: Y_SIGN * num(t[3]) * scale, rot: ROT_SIGN * num(t[4]) },
      properties: {},
      graphics,
      pads: [],
    };
    out.push(current);
  }
  return out;
}

// .comp_mount_type is either a text option (SMD/SMT/THMT/PRESSFIT) or a numeric
// option index. KiCAD's ODB++ exporter writes the index: 1=SMD, 2=THMT (through-
// hole), 3=press-fit. Fall back to SMD for OTHER/unknown.
function mountOf(raw: string): Mount {
  const s = raw.toUpperCase();
  if (/THM|THT|PRESS/.test(s)) return 'THT';
  if (/SMD|SMT/.test(s)) return 'SMD';
  if (s === '2' || s === '3') return 'THT';
  return 'SMD';
}

function bboxRect(b: Pkg['bbox'], layer: string): Graphic {
  // This box is in the package-LOCAL frame. The ODB++ Y-up -> model Y-down
  // conversion is already handled at placement time (at.y flip + ROT_SIGN
  // rotation negation), so the local box must NOT be flipped again here -
  // doing so mirrors asymmetric packages (connectors, mounting holes) to the
  // wrong side of the origin.
  return {
    kind: 'poly',
    layer,
    width: 0.12,
    pts: [
      { x: b.xmin, y: b.ymin },
      { x: b.xmax, y: b.ymin },
      { x: b.xmax, y: b.ymax },
      { x: b.xmin, y: b.ymax },
      { x: b.xmin, y: b.ymin },
    ],
  };
}

function parseAttrs(tail: string, names: Map<number, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of tail.split(',')) {
    const item = part.trim();
    if (!item) continue;
    const eq = item.indexOf('=');
    const idx = Number(eq >= 0 ? item.slice(0, eq) : item);
    const name = names.get(idx);
    if (name) map.set(name, eq >= 0 ? item.slice(eq + 1) : 'true');
  }
  return map;
}

function tokenize(line: string): string[] {
  const toks: string[] = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) toks.push(m[1] ?? m[2] ?? m[3]);
  return toks;
}

function unitScale(text: string): number {
  const m = /UNITS\s*=\s*(\S+)/i.exec(text);
  const u = (m?.[1] ?? 'MM').toUpperCase();
  return u.includes('INCH') || u === 'IN' ? 25.4 : 1;
}

// ---- archive handling ------------------------------------------------------

const BOMB = 'Decompressed archive is too large (possible decompression bomb)';

/** Streaming gunzip that aborts once output exceeds `cap` bytes. */
function gunzipBounded(bytes: Uint8Array, cap: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const g = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > cap) throw new Error(BOMB);
    chunks.push(chunk);
  });
  g.push(bytes, true); // callback runs synchronously; a throw propagates here
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function readArchive(bytes: Uint8Array): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // ZIP: the filter runs before each entry is inflated, so checking the
    // central-directory uncompressed sizes bounds expansion up front.
    let total = 0;
    const files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_DECOMPRESSED_BYTES) throw new Error(BOMB);
        return true;
      },
    });
    for (const [name, data] of Object.entries(files)) map.set(name, data);
    return map;
  }
  const tarBytes =
    bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipBounded(bytes, MAX_DECOMPRESSED_BYTES) : bytes;
  for (const item of parseTar(tarBytes)) {
    if (item.data) map.set(item.name, item.data as Uint8Array);
  }
  return map;
}

function decodeText(bin: Map<string, Uint8Array>): Map<string, string> {
  const dec = new TextDecoder();
  const out = new Map<string, string>();
  for (const [name, data] of bin) out.set(name, dec.decode(data));
  return out;
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}
