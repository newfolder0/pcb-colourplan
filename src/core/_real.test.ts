import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBoard } from './model/board';
import { deriveBom } from './bom/derive';

const path = process.env.REAL_PCB;

describe.skipIf(!path)('real board smoke test', () => {
  it('parses and derives a BOM', () => {
    const board = buildBoard(readFileSync(path!, 'utf8'));
    const { rows, propertyKeys } = deriveBom(board);
    const total = rows.reduce((n, r) => n + r.quantity, 0);
    console.log(
      `\n[REAL] title=${JSON.stringify(board.title)} v=${board.kicadVersion}\n` +
        `  footprints=${board.footprints.length} edges=${board.edges.length}\n` +
        `  bom lines=${rows.length} placed parts=${total}\n` +
        `  sides: F=${board.footprints.filter((f) => f.side === 'F').length} B=${board.footprints.filter((f) => f.side === 'B').length}\n` +
        `  mount: SMD=${board.footprints.filter((f) => f.mount === 'SMD').length} THT=${board.footprints.filter((f) => f.mount === 'THT').length}\n` +
        `  dnp=${board.footprints.filter((f) => f.dnp).length}\n` +
        `  custom props=${JSON.stringify(propertyKeys)}\n` +
        `  sample lines:\n` +
        rows
          .slice(0, 8)
          .map((r) => `    ${r.quantity}x ${r.value} [${r.footprint}] ${r.mount} ${r.dnp ? 'DNP' : ''} {${r.refs.slice(0, 4).join(',')}${r.refs.length > 4 ? '...' : ''}}`)
          .join('\n'),
    );
    expect(board.footprints.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
  });
});
