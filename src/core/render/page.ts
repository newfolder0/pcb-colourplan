// Compose a colour-plan page as one SVG (millimetre units):
//   - top-centre title bar: "<n>  <Category> <SIDE>"
//   - legend table: Color | Reference | Value | Part Number | Outline | Qty
//   - greyscale board with this page's groups highlighted and labelled
//   - bottom title block with editable project fields
// svg2pdf renders this 1:1 onto an A4 PDF page.

import type { CatPage, PlanGroup } from '../colourplan/paginate';
import { pageHighlight } from '../colourplan/paginate';
import { boardBBox } from '../geometry/transform';
import type { Board } from '../model/types';
import { renderBoardSvg, type RenderStyle } from './svg';
import { compressRefs } from '../util/refs';

export interface PageSize {
  width: number;
  height: number;
}

export const A4_LANDSCAPE: PageSize = { width: 297, height: 210 };
export const A4_PORTRAIT: PageSize = { width: 210, height: 297 };

export interface TitleBlock {
  documentNumber: string;
  revision: string;
  author: string;
  organisation: string;
  projectTitle: string;
}

export interface ComposeOptions {
  size: PageSize;
  titleBlock: TitleBlock;
  partNumberField: string | null;
  date: string;
  style?: Partial<RenderStyle>;
}

const M = 6; // page margin
const TITLE_H = 7;
const HEAD_H = 5;
const ROW_H = 5.5;
const TB_H = 20; // title block height
const GAP = 3;
const LINE = '#333a44';
const THIN = 0.2;

export function composePageSvg(board: Board, page: CatPage, opts: ComposeOptions): string {
  const { width: W, height: H } = opts.size;
  const availW = W - 2 * M;
  const sideLabel = page.side === 'B' ? 'BOTTOM' : 'TOP';
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="helvetica, sans-serif">`,
  );
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  // Outer page frame.
  out.push(`<rect x="${M - 2}" y="${M - 2}" width="${f(W - 2 * (M - 2))}" height="${f(H - 2 * (M - 2))}" fill="none" stroke="#c2c7cf" stroke-width="0.3"/>`);

  // --- Title bar ---
  let y = M;
  out.push(box(M, y, availW, TITLE_H));
  out.push(text(W / 2, y + TITLE_H / 2 + 1.4, `${page.docNumber}\u2003${page.category} ${sideLabel}`, 4, '#101418', 'middle', true));
  y += TITLE_H;

  // --- Legend table ---
  const cols = legendColumns(availW, opts.partNumberField != null);
  // header
  out.push(`<rect x="${M}" y="${f(y)}" width="${f(availW)}" height="${HEAD_H}" fill="#eceef1"/>`);
  out.push(box(M, y, availW, HEAD_H));
  drawCellText(out, cols, y, HEAD_H, (c) => c.title, true);
  y += HEAD_H;
  // rows
  for (const g of page.groups) {
    out.push(box(M, y, availW, ROW_H));
    drawColourSwatch(out, cols, y, ROW_H, g.colour);
    drawCellText(out, cols, y, ROW_H, (c) => legendValue(c.key, g, opts.partNumberField), false);
    y += ROW_H;
  }
  // column separators across header+rows
  drawColumnSeparators(out, cols, M, M + TITLE_H, y);

  const legendBottom = y;

  // --- Title block (bottom) ---
  const tbY = H - M - TB_H;
  out.push(titleBlock(tbY, availW, TB_H, page, sideLabel, opts));

  // --- Board region (between legend and title block) ---
  const rx = M;
  const ry = legendBottom + GAP;
  const rw = availW;
  const rh = tbY - GAP - ry;
  if (rh > 10) {
    const bb = boardBBox(board);
    const bw = bb.maxX - bb.minX;
    const bh = bb.maxY - bb.minY;
    const s = Math.min(rw / bw, rh / bh);
    const ox = rx + (rw - bw * s) / 2;
    const oy = ry + (rh - bh * s) / 2;
    const inner = renderBoardSvg(board, {
      side: page.side,
      mirror: page.side === 'B',
      highlight: pageHighlight(page),
      showLabels: true,
      style: opts.style,
      bbox: bb,
    }).inner;
    out.push(`<g transform="translate(${f(ox)} ${f(oy)}) scale(${f(s)}) translate(${f(-bb.minX)} ${f(-bb.minY)})">${inner}</g>`);
  }

  out.push('</svg>');
  return out.join('');
}

interface Col {
  key: 'color' | 'reference' | 'value' | 'partnum' | 'outline' | 'qty';
  title: string;
  x: number;
  w: number;
  align: 'start' | 'middle' | 'end';
}

function legendColumns(availW: number, withPn: boolean): Col[] {
  const colorW = 12;
  const qtyW = 12;
  const rem = availW - colorW - qtyW;
  const frac = withPn
    ? { reference: 0.4, value: 0.18, partnum: 0.28, outline: 0.14 }
    : { reference: 0.52, value: 0.22, partnum: 0, outline: 0.26 };
  const defs: Array<[Col['key'], string, number, Col['align']]> = [
    ['color', 'Color', colorW, 'middle'],
    ['reference', 'Reference', rem * frac.reference, 'start'],
    ['value', 'Value', rem * frac.value, 'start'],
  ];
  if (withPn) defs.push(['partnum', 'Part Number', rem * frac.partnum, 'start']);
  defs.push(['outline', 'Outline', rem * frac.outline, 'start']);
  defs.push(['qty', 'Qty', qtyW, 'middle']);

  let x = M;
  return defs.map(([key, title, w, align]) => {
    const col: Col = { key, title, x, w, align };
    x += w;
    return col;
  });
}

function legendValue(key: Col['key'], g: PlanGroup, pnField: string | null): string {
  switch (key) {
    case 'reference':
      return compressRefs(g.row.refs);
    case 'value':
      return g.row.value || '—';
    case 'partnum':
      return (pnField && g.row.properties[pnField]) || '';
    case 'outline':
      return shortFootprint(g.row.footprint);
    case 'qty':
      return String(g.row.quantity);
    default:
      return '';
  }
}

function drawCellText(out: string[], cols: Col[], y: number, h: number, get: (c: Col) => string, bold: boolean): void {
  for (const c of cols) {
    if (c.key === 'color') continue;
    const content = get(c);
    if (!content) continue;
    const pad = 1.2;
    const tx = c.align === 'middle' ? c.x + c.w / 2 : c.x + pad;
    const fontSize = 2.8;
    out.push(text(tx, y + h / 2 + 1, clip(content, c.w - 2 * pad, fontSize), fontSize, '#101418', c.align, bold));
  }
}

function drawColourSwatch(out: string[], cols: Col[], y: number, h: number, colour: string): void {
  const c = cols.find((k) => k.key === 'color');
  if (!c) return;
  const sw = Math.min(c.w - 3, 8);
  const sh = Math.min(h - 1.6, 3.6);
  out.push(`<rect x="${f(c.x + (c.w - sw) / 2)}" y="${f(y + (h - sh) / 2)}" width="${f(sw)}" height="${f(sh)}" rx="0.4" fill="${esc(colour)}" stroke="#333" stroke-width="0.1"/>`);
}

function drawColumnSeparators(out: string[], cols: Col[], _x0: number, yTop: number, yBot: number): void {
  for (let i = 1; i < cols.length; i++) {
    const x = cols[i].x;
    out.push(`<line x1="${f(x)}" y1="${f(yTop)}" x2="${f(x)}" y2="${f(yBot)}" stroke="${LINE}" stroke-width="${THIN}"/>`);
  }
}

function titleBlock(y: number, availW: number, h: number, page: CatPage, sideLabel: string, opts: ComposeOptions): string {
  const tb = opts.titleBlock;
  const parts: string[] = [];
  parts.push(box(M, y, availW, h));

  const leftW = 60;
  const rightW = 62;
  const midX = M + leftW;
  const rightX = M + availW - rightW;
  parts.push(`<line x1="${f(midX)}" y1="${f(y)}" x2="${f(midX)}" y2="${f(y + h)}" stroke="${LINE}" stroke-width="${THIN}"/>`);
  parts.push(`<line x1="${f(rightX)}" y1="${f(y)}" x2="${f(rightX)}" y2="${f(y + h)}" stroke="${LINE}" stroke-width="${THIN}"/>`);

  // Left: organisation + project title
  parts.push(text(M + 2, y + 5, clip(tb.organisation || 'Organisation', leftW - 4, 3.4), 3.4, '#101418', 'start', true));
  parts.push(text(M + 2, y + 10, clip(tb.projectTitle || '', leftW - 4, 2.8), 2.8, '#445', 'start', false));

  // Middle: drawn by / date / rev
  parts.push(labelVal(midX + 2, y + 5, 'Prepared by', tb.author || '—'));
  parts.push(labelVal(midX + 2, y + 10.5, 'Date', opts.date));
  parts.push(labelVal(midX + 2, y + 16, 'Rev', tb.revision || '—'));

  // Right: document number (big), side, page
  parts.push(text(rightX + 3, y + 7, clip(tb.documentNumber || 'DOC-0001', rightW - 6, 4.6), 4.6, '#101418', 'start', true));
  parts.push(labelVal(rightX + 3, y + 13, 'Side', sideLabel));
  parts.push(labelVal(rightX + 3, y + 18, 'Page', `${page.pageInDoc} / ${page.pagesInDoc}`));

  return parts.join('');
}

function labelVal(x: number, y: number, label: string, val: string): string {
  // Value is left-aligned at a fixed offset that clears the longest label.
  return (
    text(x, y, label, 2.2, '#7a828c', 'start', false) +
    text(x + 24, y, clip(val, 34, 3), 3, '#101418', 'start', true)
  );
}

function shortFootprint(fp: string): string {
  const i = fp.indexOf(':');
  return i >= 0 ? fp.slice(i + 1) : fp;
}

function clip(s: string, widthMm: number, fontMm: number): string {
  const maxChars = Math.max(2, Math.floor(widthMm / (fontMm * 0.52)));
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}

function box(x: number, y: number, w: number, h: number): string {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="none" stroke="${LINE}" stroke-width="${THIN}"/>`;
}

// Escapes `content` itself: the single choke point for text injected into the
// page SVG, so file-derived values (e.g. the category label) can never break out
// of the <text> element. Callers must pass raw (un-escaped) strings.
function text(x: number, y: number, content: string, size: number, fill: string, anchor: 'start' | 'middle' | 'end', bold: boolean): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}>${esc(content)}</text>`;
}

function f(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return (Math.round(n * 1000) / 1000).toString();
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
