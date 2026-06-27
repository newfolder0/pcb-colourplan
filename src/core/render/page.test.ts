import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom/derive';
import { deriveCategories } from '../colourplan/categories';
import { STANDARD_PALETTE } from '../colourplan/palette';
import { buildDocuments } from '../colourplan/paginate';
import { buildBoard } from '../model/board';
import { A4_LANDSCAPE, composePageSvg, type TitleBlock } from './page';

// A crafted board whose file-derived fields carry SVG/HTML injection payloads.
// The category label flows from the "Assembly Process" property into the title
// bar; the value flows into the legend. Both must end up escaped, because the
// composed SVG is injected via innerHTML (preview) and appendChild (PDF export).
const CATEGORY_PAYLOAD = '</text><image href=x onerror=alert(document.domain)/>';
const VALUE_PAYLOAD = '<script>alert(1)</script>';

const MALICIOUS_PCB = `(kicad_pcb
  (footprint "lib:F"
    (layer "F.Cu")
    (at 10 10 0)
    (property "Reference" "R1")
    (property "Value" "${VALUE_PAYLOAD}")
    (property "Assembly Process" "${CATEGORY_PAYLOAD}")
    (attr smd)
    (fp_line (start -1 -1) (end 1 1) (layer "F.Fab") (stroke (width 0.1)))
    (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu"))
  )
)`;

const TITLE_BLOCK: TitleBlock = {
  documentNumber: 'DOC-1',
  revision: 'A',
  author: 'Tester',
  organisation: 'Org',
  projectTitle: 'Proj',
};

function renderMaliciousPage(): string {
  const board = buildBoard(MALICIOUS_PCB);
  const { rows } = deriveBom(board);
  const categories = deriveCategories(rows);
  const pages = buildDocuments(categories, { sides: ['F'], groupsPerPage: 4, palette: STANDARD_PALETTE });
  expect(pages.length).toBeGreaterThan(0);
  // Sanity: the payload really did become the category label upstream.
  expect(pages[0].category).toBe(CATEGORY_PAYLOAD);
  return composePageSvg(board, pages[0], {
    size: A4_LANDSCAPE,
    titleBlock: TITLE_BLOCK,
    partNumberField: null,
    date: '2026-01-01',
  });
}

describe('composePageSvg XSS escaping', () => {
  const svg = renderMaliciousPage();

  it('never emits a raw injected element', () => {
    // No real elements: the payload's '<' is escaped, so onerror= can never sit
    // on an actual attribute (the escaped text "onerror=alert" is inert).
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('<script');
  });

  it('escapes the payloads into inert text', () => {
    expect(svg).toContain('&lt;image');
    expect(svg).toContain('&lt;script');
  });

  it('does not let the category break out of its <text> element', () => {
    // The only legitimate </text> closings are the page chrome; the payload's
    // </text> must be escaped, so no <text> is left unclosed/duplicated.
    const opens = (svg.match(/<text\b/g) ?? []).length;
    const closes = (svg.match(/<\/text>/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
