import { describe, expect, it } from 'vitest';
import { buildEvent } from './telemetry';

type BuildData = Parameters<typeof buildEvent>[1];
const ALLOWED = new Set(['e', 'v', 'fmt', 'outcome', 'comp', 'bom', 'pages']);

describe('telemetry buildEvent (privacy contract)', () => {
  it('app_open carries only the event name and version', () => {
    const ev = buildEvent('app_open');
    expect(Object.keys(ev).sort()).toEqual(['e', 'v']);
    expect(ev.e).toBe('app_open');
  });

  it('board_processed emits only allowlisted numeric/enum fields', () => {
    const ev = buildEvent('board_processed', { format: 'kicad', outcome: 'ok', components: 12, bomLines: 7 });
    expect(ev).toEqual({ e: 'board_processed', v: ev.v, fmt: 'kicad', outcome: 'ok', comp: 12, bom: 7 });
  });

  it('omits component/BOM counts when parsing failed', () => {
    const ev = buildEvent('board_processed', { format: 'ipc2581', outcome: 'parse_error', components: 5, bomLines: 5 });
    expect(ev.outcome).toBe('parse_error');
    expect(ev.comp).toBeUndefined();
    expect(ev.bom).toBeUndefined();
  });

  it('never leaks design-derived strings or extra keys', () => {
    const SECRET = 'SECRET_PART_NUMBER_XYZ';
    const hostile = {
      format: SECRET,
      outcome: SECRET,
      components: SECRET,
      bomLines: SECRET,
      // extra keys a buggy/hostile caller might add - must be dropped entirely
      filename: SECRET,
      value: SECRET,
      title: SECRET,
    } as unknown as BuildData;

    const ev = buildEvent('board_processed', hostile);

    for (const k of Object.keys(ev)) expect(ALLOWED.has(k)).toBe(true);
    expect(ev.fmt).toBe('unknown'); // unrecognised format coerced
    expect(ev.outcome).toBe('ok'); // unrecognised outcome coerced
    expect(JSON.stringify(ev)).not.toContain(SECRET);
  });

  it('coerces counts to non-negative integers', () => {
    expect(buildEvent('pdf_generated', { pages: 3.9 }).pages).toBe(3);
    expect(buildEvent('pdf_generated', { pages: -5 }).pages).toBe(0);
    expect(buildEvent('pdf_generated', { pages: 'x' as unknown as number }).pages).toBe(0);
  });
});
