import { describe, expect, it } from 'vitest';
import { decodeText, parseDesign } from './index';
import { deriveBom } from '../bom/derive';

const pcb = (value: string) =>
  `(kicad_pcb (version 20240108) (generator "pcbnew")
 (layers (0 "F.Cu" signal) (44 "Edge.Cuts" user))
 (gr_line (start 0 0) (end 10 0) (stroke (width 0.1) (type solid)) (layer "Edge.Cuts"))
 (footprint "C_0402" (layer "F.Cu") (uuid "aa") (at 5 5 0)
   (property "Reference" "C1") (property "Value" "${value}")
   (attr smd) (pad "1" smd roundrect (at 0 0 0) (size 0.5 0.6) (layers "F.Cu"))))`;

/** Latin-1 encode: every char is one byte (micro sign "µ" -> 0xB5). */
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe('decodeText', () => {
  it('decodes valid UTF-8 (µ = 0xC2 0xB5)', () => {
    expect(decodeText(new TextEncoder().encode('4.7µF'))).toBe('4.7µF');
  });

  it('falls back to Windows-1252 for Latin-1 bytes (µ = 0xB5), not "�"', () => {
    const out = decodeText(latin1('4.7µF'));
    expect(out).toBe('4.7µF');
    expect(out).not.toContain('�');
  });
});

describe('parseDesign encoding', () => {
  it('preserves µ from a Latin-1 encoded .kicad_pcb', () => {
    const board = parseDesign('board.kicad_pcb', latin1(pcb('4.7µF')));
    const { rows } = deriveBom(board);
    expect(rows[0].value).toBe('4.7µF');
  });

  it('preserves µ from a UTF-8 encoded .kicad_pcb', () => {
    const board = parseDesign('board.kicad_pcb', new TextEncoder().encode(pcb('10µH')));
    const { rows } = deriveBom(board);
    expect(rows[0].value).toBe('10µH');
  });
});
