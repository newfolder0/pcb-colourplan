import { APP_VERSION, CONTACT_EMAIL, DATA_CONTROLLER, TELEMETRY_RETENTION } from '../config';

// The single source of truth for EXACTLY what the hosted instance collects.
// Shown verbatim in both the consent wall and the "Privacy & data" panel, so the
// disclosure can never drift from what telemetry.ts / the collector actually do.
export function TelemetryNotice() {
  return (
    <div className="telemetry-notice">
      <p className="tn-head">The ONLY data collected, when you open the app and when you process a board:</p>
      <ul>
        <li>The date and time of the request (set by the server).</li>
        <li>App version (this web app, currently v{APP_VERSION}).</li>
        <li>Which import format you used (KiCAD, IPC-2581, or ODB++).</li>
        <li>The <strong>number of components</strong> on the board.</li>
        <li>The <strong>number of BOM lines</strong>.</li>
        <li>The <strong>number of pages</strong> in the generated PDF.</li>
        <li>Whether processing <strong>succeeded or failed</strong> (a category only - never the error text).</li>
      </ul>

      <p className="tn-head">Your IP address is never stored</p>
      <p>
        Your IP is used <strong>only</strong> to create a temporary daily code so I can estimate how many 
        different people use the tool each day. Your IP address and that code are <strong>never stored.</strong> 
        Only the anonymous totals are kept. No location lookup is done.
      </p>

      <p className="tn-head">This is never collected:</p>
      <ul>
        <li>Your design file, or any part of it.</li>
        <li>Component values, reference designators, part numbers, or footprints.</li>
        <li>File names, or the board's title, company, or author fields.</li>
        <li>Your location or country, your stored IP address, or your browser/device details.</li>
        <li>Cookies or any cross-site trackers.</li>
        <li>Anything that identifies you personally.</li>
      </ul>

      <p className="muted small">
        The data is anonymous and aggregated. Data controller: {DATA_CONTROLLER} (contact:{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>). Raw events are deleted after{' '}
        {TELEMETRY_RETENTION}; only aggregate counts are kept.
      </p>
    </div>
  );
}
