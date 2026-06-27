// User-editable configuration.

/**
 * Contact email shown in the disclaimer and as the data-controller contact in
 * the privacy notice.
 */
export const CONTACT_EMAIL = 'admin@peterbell.ch';

/** Person/entity responsible for the hosted app and its analytics (GDPR controller). */
export const DATA_CONTROLLER = 'Peter Bell Electronics Ltd';

/**
 * Public repository where anyone can get the open-source container and self-host
 * a telemetry-free instance. Shown to users who decline data collection.
 */
export const SELF_HOST_URL = 'https://github.com/newfolder0/pcb-colourplan';

// ---- Usage telemetry -------------------------------------------------------
// The HOSTED instance is funded by anonymous usage data: using it requires
// agreeing to the collection (a consent wall). Anyone who declines can self-host
// the identical open-source container, which collects nothing. See PRIVACY.md
// and src/telemetry.ts (the strict allowlist of fields that may be sent).

/**
 * Where anonymous usage events are POSTed. MUST be same-origin (a path, not a
 * full URL) so the Content-Security-Policy can stay `connect-src 'self'`.
 *
 * Controlled by the VITE_TELEMETRY_ENDPOINT build env:
 *   - default '/collect'  -> telemetry + consent wall ON (the hosted build).
 *   - set to '' (empty)   -> telemetry OFF, no wall: the fully local, private
 *                            tool. This is what a self-hoster builds for a
 *                            telemetry-free instance.
 */
const endpointEnv = import.meta.env.VITE_TELEMETRY_ENDPOINT;
export const TELEMETRY_ENDPOINT = (typeof endpointEnv === 'string' ? endpointEnv : '/collect').trim();

/** When false (endpoint disabled) there is no telemetry and no consent wall. */
export const TELEMETRY_ENABLED = TELEMETRY_ENDPOINT.length > 0;

/** How long raw events are kept server-side before deletion (shown in the notice). */
export const TELEMETRY_RETENTION = '12 months';

/** Build version reported with each event. Injected by Vite; 'dev' under tests. */
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
