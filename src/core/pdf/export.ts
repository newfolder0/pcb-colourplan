// Browser-only: assemble colour-plan pages into a multi-page vector PDF.
// Uses the shared SVG page composer so screen preview and PDF stay identical.

import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { CatPage } from '../colourplan/paginate';
import type { Board } from '../model/types';
import { composePageSvg, type PageSize, type TitleBlock } from '../render/page';
import type { RenderStyle } from '../render/svg';

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

function parseSvg(s: string): SVGElement {
  const parsed = new DOMParser().parseFromString(s, 'image/svg+xml');
  return parsed.documentElement as unknown as SVGElement;
}
