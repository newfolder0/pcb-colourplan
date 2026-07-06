// Browser-only: assemble colour-plan pages into a multi-page vector PDF.
// Uses the shared SVG page composer so screen preview and PDF stay identical.

import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { CatPage } from '../colourplan/paginate';
import type { Board } from '../model/types';
import { composeBoardPageSvg, composePageSvg, type PageSize, type TitleBlock } from '../render/page';
import type { RenderStyle } from '../render/svg';
import type { Side } from '../model/types';

export interface PdfOptions {
  size: PageSize;
  titleBlock: TitleBlock;
  partNumberField: string | null;
  date: string;
  filename?: string;
  style?: Partial<RenderStyle>;
}

/** Build the PDF document (does not trigger a download). */
export async function buildColourPlanPdf(board: Board, pages: CatPage[], opts: PdfOptions): Promise<jsPDF> {
  const landscape = opts.size.width >= opts.size.height;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const size: PageSize = { width, height };

  // svg2pdf measures elements via the DOM, so render off-screen.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;';
  document.body.appendChild(host);

  try {
    for (let i = 0; i < pages.length; i++) {
      if (i > 0) doc.addPage('a4', landscape ? 'landscape' : 'portrait');
      const svg = composePageSvg(board, pages[i], {
        size,
        titleBlock: opts.titleBlock,
        partNumberField: opts.partNumberField,
        date: opts.date,
        style: opts.style,
      });
      const el = parseSvg(svg);
      host.appendChild(el);
      await svg2pdf(el, doc, { x: 0, y: 0, width, height });
      host.removeChild(el);
    }
    return doc;
  } finally {
    document.body.removeChild(host);
  }
}

export async function generateColourPlanPdf(board: Board, pages: CatPage[], opts: PdfOptions): Promise<void> {
  const doc = await buildColourPlanPdf(board, pages, opts);
  doc.save(opts.filename ?? 'colour-plan.pdf');
}

export interface InspectorPdfOptions {
  size: PageSize;
  /** Board sides to emit, in order (e.g. ['F', 'B']). */
  sides: Side[];
  /** ref -> highlight colour (hex), from the current selection. */
  highlight: Map<string, string>;
  /** Heading shown on each page (e.g. file / project name). */
  title?: string;
  filename?: string;
  style?: Partial<RenderStyle>;
}

/**
 * Build a simple PDF of the interactive inspector's current view: one page per
 * requested side, each showing the whole board with the current selection
 * highlighted. Top and bottom land on consecutive pages.
 */
export async function generateInspectorPdf(board: Board, opts: InspectorPdfOptions): Promise<void> {
  const landscape = opts.size.width >= opts.size.height;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const size: PageSize = { width, height };

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;';
  document.body.appendChild(host);

  try {
    for (let i = 0; i < opts.sides.length; i++) {
      if (i > 0) doc.addPage('a4', landscape ? 'landscape' : 'portrait');
      const svg = composeBoardPageSvg(board, {
        size,
        side: opts.sides[i],
        highlight: opts.highlight,
        title: opts.title,
        style: opts.style,
      });
      const el = parseSvg(svg);
      host.appendChild(el);
      await svg2pdf(el, doc, { x: 0, y: 0, width, height });
      host.removeChild(el);
    }
    doc.save(opts.filename ?? 'inspector.pdf');
  } finally {
    document.body.removeChild(host);
  }
}

function parseSvg(s: string): SVGElement {
  const parsed = new DOMParser().parseFromString(s, 'image/svg+xml');
  return parsed.documentElement as unknown as SVGElement;
}
