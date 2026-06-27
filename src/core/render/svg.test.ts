import { describe, expect, it } from 'vitest';
import { loadFixture } from '../__fixtures__/load';
import { buildBoard } from '../model/board';
import { renderBoardSvg } from './svg';

const board = buildBoard(loadFixture('sample.kicad_pcb'));

describe('renderBoardSvg', () => {
  it('produces a self-contained SVG with a viewBox covering the board', () => {
    const { svg, viewBox } = renderBoardSvg(board, { side: 'F' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Board is 100x80 with default 2mm margin -> "-2 -2 104 84".
    expect(viewBox).toBe('-2 -2 104 84');
  });

  it('only renders footprints on the requested side', () => {
    const front = renderBoardSvg(board, { side: 'F', interactive: true });
    const back = renderBoardSvg(board, { side: 'B', interactive: true });
    expect(front.svg).toContain('data-ref="R1"');
    expect(front.svg).not.toContain('data-ref="C2"'); // C2 is on the back
    expect(back.svg).toContain('data-ref="C2"');
    expect(back.svg).not.toContain('data-ref="R1"');
  });

  it('fills highlighted parts with their assigned colour', () => {
    const highlight = new Map([['R1', '#1e6fff']]);
    const { svg } = renderBoardSvg(board, { side: 'F', highlight, showLabels: true });
    expect(svg).toContain('#1e6fff');
    expect(svg).toContain('>R1</text>');
  });

  it('does not leak highlight colour onto non-highlighted parts', () => {
    const highlight = new Map([['R1', '#1e6fff']]);
    const { svg } = renderBoardSvg(board, { side: 'F', highlight });
    // R2 should be drawn in the context grey, not the highlight colour.
    expect(svg).toContain('#b8bcc2');
  });
});
