// Anonymous usage telemetry for the hosted instance.
//
// On the hosted build, using the tool is conditioned on consent (see the consent
// wall in DisclaimerGate); declining sends the user to self-host instead. A
// self-host build with telemetry disabled sends nothing at all.
//
// PRIVACY CONTRACT (see PRIVACY.md and the consent dialog):
//   - Nothing is ever sent unless the user has granted consent.
//   - Only the fields built by `buildEvent` below are ever transmitted - a fixed
//     allowlist of an event name, the app version, and a few integer counts /
//     enum codes. NO design-derived string can be sent: callers pass only
//     numbers and values that are coerced to a closed set here.
//   - The endpoint is same-origin (CSP stays `connect-src 'self'`).
//   - Country, timestamp, browser/OS family and unique-visitor estimation are
//     all derived SERVER-side; the client sends none of them.
//
// The payload builder is pure and unit-tested to guarantee no extra keys leak.

import { APP_VERSION, TELEMETRY_ENDPOINT } from './config';
import type { DesignFormat } from './core/import';

// Bumped to v2 with the move to a consent wall, to re-ask everyone under the
// new terms rather than silently reusing an old opt-in/opt-out choice.
const CONSENT_KEY = 'cp_analytics_consent_v2';

export type Consent = 'granted' | 'denied';
export type Outcome = 'ok' | 'parse_error' | 'unsupported';

type EventName = 'app_open' | 'board_processed' | 'pdf_generated';
const FORMATS: readonly DesignFormat[] = ['kicad', 'ipc2581', 'odbpp', 'unknown'];
const OUTCOMES: readonly Outcome[] = ['ok', 'parse_error', 'unsupported'];

/** The exact shape sent to the collector. Keys are an intentional allowlist. */
export interface TelemetryEvent {
  e: EventName;
  v: string;
  fmt?: DesignFormat;
  outcome?: Outcome;
  comp?: number;
  bom?: number;
  pages?: number;
}

// ---- consent ---------------------------------------------------------------

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(consent: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    /* storage unavailable - treat as not opted in */
  }
}

export function hasOptedIn(): boolean {
  return getConsent() === 'granted';
}

// ---- payload (pure, allowlist-only) ---------------------------------------

const nonNegInt = (n: unknown): number => {
  const x = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return x;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);

interface BoardInfo {
  format: DesignFormat;
  outcome: Outcome;
  components?: number;
  bomLines?: number;
}

/**
 * Build the wire payload. Every value is coerced to a number or a closed enum,
 * so no free-form (design-derived) string can ever appear. This function is the
 * single source of truth for what may be transmitted.
 */
export function buildEvent(
  e: EventName,
  data?: Partial<BoardInfo> & { pages?: number },
): TelemetryEvent {
  const ev: TelemetryEvent = { e, v: APP_VERSION };
  if (e === 'board_processed' && data) {
    ev.fmt = oneOf(data.format, FORMATS, 'unknown');
    ev.outcome = oneOf(data.outcome, OUTCOMES, 'ok');
    if (data.outcome === 'ok') {
      ev.comp = nonNegInt(data.components);
      ev.bom = nonNegInt(data.bomLines);
    }
  } else if (e === 'pdf_generated' && data) {
    ev.pages = nonNegInt(data.pages);
  }
  return ev;
}

// ---- sending ---------------------------------------------------------------

function send(ev: TelemetryEvent): void {
  if (!TELEMETRY_ENDPOINT || !hasOptedIn()) return; // hard gates
  let body: string;
  try {
    body = JSON.stringify(ev);
  } catch {
    return;
  }
  // Same-origin POST; keepalive lets it complete past navigation. Errors (e.g.
  // no collector in dev, offline) are swallowed: telemetry must never disrupt use.
  try {
    void fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      mode: 'same-origin',
      cache: 'no-store',
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ---- public events ---------------------------------------------------------

let openSent = false;
export function trackAppOpen(): void {
  if (openSent) return; // once per page load
  openSent = true;
  send(buildEvent('app_open'));
}

export function trackBoardProcessed(info: BoardInfo): void {
  send(buildEvent('board_processed', info));
}

export function trackPdfGenerated(pages: number): void {
  send(buildEvent('pdf_generated', { pages }));
}
