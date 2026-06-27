import { useState, type ReactNode } from 'react';
import { CONTACT_EMAIL, SELF_HOST_URL, TELEMETRY_ENABLED } from '../config';
import { getConsent, setConsent, type Consent } from '../telemetry';
import { TelemetryNotice } from './TelemetryNotice';

// Consent wall for the hosted instance: using the free hosted tool is
// conditioned on anonymous usage analytics. Declining does not collect anything
// and points the user at the open-source container to self-host instead - a
// genuine, equivalent, free alternative (which is what makes a consent wall
// defensible). A build with telemetry disabled shows no wall at all.

export function DisclaimerGate({ children }: { children: ReactNode }) {
  const [consent, setLocal] = useState<Consent | null>(getConsent());

  // Self-host / privacy-pure build: no telemetry, no wall.
  if (!TELEMETRY_ENABLED) return <>{children}</>;
  // Already agreed: run the app.
  if (consent === 'granted') return <>{children}</>;

  function choose(next: Consent) {
    setConsent(next);
    setLocal(next);
  }

  if (consent === 'denied') {
    // Directory `git clone` creates - derived from the URL so it can't drift.
    const repoDir = SELF_HOST_URL.replace(/\/+$/, '').split('/').pop() || 'pcb-colourplan';
    return (
      <div className="disclaimer-gate" role="dialog" aria-modal="true" aria-labelledby="declined-title">
        <div className="disclaimer-card">
          <h2 id="declined-title">No problem - here's how to self-host</h2>
          <p>
            The hosted version isn't available without anonymous usage data (that's what pays for the server).
            The tool is fully open source and free, and a self-hosted instance collects <strong>nothing</strong>.
          </p>
          <p>
            Get the Docker container and run it yourself:{' '}
            <a href={SELF_HOST_URL} target="_blank" rel="noopener noreferrer">
              {SELF_HOST_URL}
            </a>
          </p>
          <pre className="selfhost-cmd">git clone {SELF_HOST_URL}
cd {repoDir}
docker compose up -d --build   # then open http://localhost</pre>
          {CONTACT_EMAIL && (
            <p className="muted small">
              Questions? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          )}
          <button className="primary" onClick={() => choose('granted')}>
            Changed your mind? Agree and use the hosted tool
          </button>
        </div>
      </div>
    );
  }

  // consent === null: first visit - present the deal.
  return (
    <div className="disclaimer-gate" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <div className="disclaimer-card">
        <h2 id="consent-title">Before you use this tool</h2>

        <p>
          This tool has been written by AI. 
        </p>
        <p>
          Your design is processed locally in your browser and does not leave your computer, but
          I cannot guarantee correctness, security, or privacy; this tool is provided on a best-effort basis.
          You must carefully check all outputs, which <strong>may result in non-conformities in PCB assembly.</strong>
          {CONTACT_EMAIL && (
            <> To report bugs or concerns: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>
          )}
        </p>

        <div className="telemetry-box">
          <h3>This free tool is funded by anonymous usage data</h3>
          <p>
            Running this server costs me money, and I offer the hosted version for <strong>free</strong>. In
            return, I collect a small amount of <strong>anonymous</strong> usage data - honestly, I'm just
            curious to know how it is being used. <strong>That data is the price of using the free, hosted tool.</strong>
          </p>
          <p>
            If you'd rather not consent, no problem; the tool is open source. Download the Docker container from
            GitHub and self-host it:{' '}
            <a href={SELF_HOST_URL} target="_blank" rel="noopener noreferrer">
              {SELF_HOST_URL}
            </a>
          </p>

          <TelemetryNotice />
        </div>

        <div className="gate-actions">
          <button className="primary" onClick={() => choose('granted')}>
            Agree and use the tool
          </button>
          <button className="link" onClick={() => choose('denied')}>
            No thanks - I'll self-host
          </button>
        </div>
      </div>
    </div>
  );
}
