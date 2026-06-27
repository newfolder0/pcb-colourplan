import { gzipSync } from 'fflate';
import { createTar } from 'nanotar';
import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom/derive';
import { deriveCategories } from '../colourplan/categories';
import { boardFromOdbFiles, parseOdbpp } from './parse';

const EDA = `UNITS=MM
PKG R_0402 0.5 -0.5 -0.3 0.5 0.3
PKG C_0402 0.5 -0.5 -0.3 0.5 0.3
PKG HDR_1x02 2.54 -1.27 -1.27 1.27 3.81
`;

const PROFILE = `UNITS=MM
OB 0 0 I
OS 100 0
OS 100 80
OS 0 80
OS 0 0
OE
`;

const COMP_TOP = `UNITS=MM
@0 .comp_mount_type
@1 .no_pop
CMP 0 20 20 0 N R1 10k ;0=SMD
CMP 0 25 20 90 N R2 10k ;0=SMD
CMP 0 30 20 0 N R3 10k ;0=SMD,1
CMP 1 40 30 0 N C1 10nF ;0=SMD
CMP 2 60 40 0 N J1 Conn_01x02 ;0=THMT
`;

const COMP_BOT = `UNITS=MM
@0 .comp_mount_type
CMP 1 45 30 0 M C2 1nF ;0=SMD
`;

const files = new Map<string, string>([
  ['design/steps/pcb/eda/data', EDA],
  ['design/steps/pcb/profile', PROFILE],
  ['design/steps/pcb/layers/comp_+_top/components', COMP_TOP],
  ['design/steps/pcb/layers/comp_+_bot/components', COMP_BOT],
]);

const board = boardFromOdbFiles(files);
const fp = (ref: string) => board.footprints.find((f) => f.ref === ref)!;

describe('boardFromOdbFiles', () => {
  it('rejects archives with no component layers', () => {
    expect(() => boardFromOdbFiles(new Map([['x/profile', PROFILE]]))).toThrow();
  });

  it('parses the board outline from the profile', () => {
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0].layer).toBe('Edge.Cuts');
  });

  it('parses components from both sides', () => {
    expect(board.footprints).toHaveLength(6);
    expect(fp('C2').side).toBe('B');
    expect(fp('R1').side).toBe('F');
  });

  it('maps mount, value, footprint and DNP', () => {
    expect(fp('J1').mount).toBe('THT');
    expect(fp('R1').mount).toBe('SMD');
    expect(fp('R1').value).toBe('10k');
    expect(fp('R1').footprintName).toBe('R_0402');
    expect(fp('R3').dnp).toBe(true);
    expect(fp('R1').dnp).toBe(false);
  });

  it('attaches a package bbox outline on the correct Fab layer', () => {
    expect(fp('R1').graphics[0].layer).toBe('F.Fab');
    expect(fp('C2').graphics[0].layer).toBe('B.Fab');
  });

  it('feeds the existing BOM + category pipeline', () => {
    const { rows } = deriveBom(board);
    const cats = deriveCategories(rows).map((c) => c.id);
    expect(cats).toEqual(expect.arrayContaining(['SMD', 'THD', 'NotMounted']));
  });
});

describe('parseOdbpp (full .tgz path)', () => {
  it('decompresses a gzipped tar and parses it', () => {
    const tar = createTar([...files.entries()].map(([name, data]) => ({ name, data })));
    const tgz = gzipSync(tar);
    const fromTgz = parseOdbpp(tgz);
    expect(fromTgz.footprints).toHaveLength(6);
    expect(fromTgz.edges).toHaveLength(1);
  });
});
