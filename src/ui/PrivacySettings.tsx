import { SELF_HOST_URL, TELEMETRY_ENABLED } from '../config';
import { setConsent } from '../telemetry';
import { TelemetryNotice } from './TelemetryNotice';

// "Privacy & data" panel. On the hosted build it shows exactly what is collected
// and lets the user withdraw consent - which, since use is conditioned on it,
// returns them to the wall (and points to self-hosting). On a telemetry-free
// self-host build it simply states that nothing is collected.
export function PrivacySettings({ onClose }: { onClose: () => void }) {
  function withdraw() {
    setConsent('denied');
    // Use is conditioned on consent, so re-enter the wall from a clean state.
    location.reload();
  }

  return (
    <div className="disclaimer-gate" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div className="disclaimer-card">
        <h2 id="privacy-title">Privacy &amp; data</h2>

        {TELEMETRY_ENABLED ? (
          <>
            <p>
              This hosted instance is funded by anonymous usage data, so using it includes the collection below.
              You can withdraw at any time - the tool is open source and a self-hosted instance collects nothing.
            </p>
            <div className="telemetry-box">
              <TelemetryNotice />
            </div>
            <p className="muted small">
              Prefer zero collection? Self-host the identical container:{' '}
              <a href={SELF_HOST_URL} target="_blank" rel="noopener noreferrer">
                {SELF_HOST_URL}
              </a>
            </p>
            <div className="gate-actions">
              <button className="primary" onClick={onClose}>
                Done
              </button>
              <button className="link" onClick={withdraw}>
                Withdraw consent (switch to self-hosting)
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              This instance collects <strong>no</strong> usage data. Everything happens locally in your browser;
              nothing is sent anywhere.
            </p>
            <button className="primary" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
