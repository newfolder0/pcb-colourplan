import { useEffect, useState } from 'react';
import './App.css';
import { BoardCanvas } from './ui/BoardCanvas';
import { BomTable } from './ui/BomTable';
import { DisclaimerGate } from './ui/DisclaimerGate';
import { ImportDropzone } from './ui/ImportDropzone';
import { PlanBuilder } from './ui/PlanBuilder';
import { PrivacySettings } from './ui/PrivacySettings';
import { CONTACT_EMAIL } from './config';
import { trackAppOpen } from './telemetry';
import { useStore } from './state/store';

function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const filename = useStore((s) => s.filename);
  const board = useStore((s) => s.board);
  const bom = useStore((s) => s.bom);
  const reset = useStore((s) => s.reset);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Fires once per page load, and only actually sends if the user has opted in.
  useEffect(() => {
    trackAppOpen();
  }, []);

  // Stop the browser from opening (navigating to) a file dropped outside the drop
  // zone - e.g. on the header/footer, or once a board is loaded. The file never
  // leaves the browser, and only the drop zone actually loads one.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const ready = status === 'ready' && board && bom;

  return (
    <DisclaimerGate>
      <div className="app">
        <header className="topbar">
        <div className="brand">
          <span className="logo">▦</span>
          <span>PCB Colour-Plan</span>
        </div>
        {ready && (
          <div className="seg view-tabs">
            <button className={view === 'inspect' ? 'on' : ''} onClick={() => setView('inspect')}>
              Inspect
            </button>
            <button className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')}>
              Colour plan
            </button>
          </div>
        )}
        {filename && (
          <div className="file-info">
            <span className="fname">{filename}</span>
            {board && (
              <span className="muted small">
                {board.footprints.length} parts · {bom?.rows.length ?? 0} BOM lines
              </span>
            )}
            <button className="link" onClick={reset}>
              load another
            </button>
          </div>
        )}
      </header>

      {error && <div className="banner error">Could not parse: {error}</div>}

      {!ready ? (
        <main className="landing">
          <ImportDropzone />
        </main>
      ) : view === 'inspect' ? (
        <main className="workspace">
          <section className="left">
            <BoardCanvas />
          </section>
          <section className="right">
            <BomTable />
          </section>
        </main>
      ) : (
        <main className="plan-main">
          {/* key: remount per board so PlanBuilder re-derives its defaults */}
          <PlanBuilder key={filename} />
        </main>
      )}

        <footer className="disclaimer" role="note">
          <strong>⚠ AI-built tool.</strong> This web app was developed using AI and has not been carefully
          vetted for security or correctness by a human. Be aware of this when you upload your intellectual
          property, and carefully check all outputs. Found a bug?{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {' · '}
          <button type="button" className="link" onClick={() => setPrivacyOpen(true)}>
            Privacy &amp; data
          </button>
          <div className="copyright muted small">
            PCB Colour-Plan © 2026 Peter Bell Electronics Ltd · free software under the{' '}
            <a href="https://github.com/newfolder0/pcb-colourplan/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
              MIT Licence
            </a>, with no warranty.
          </div>
        </footer>
      </div>
      {privacyOpen && <PrivacySettings onClose={() => setPrivacyOpen(false)} />}
    </DisclaimerGate>
  );
}

export default App;
