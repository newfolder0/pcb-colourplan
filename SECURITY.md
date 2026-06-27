# Security Policy

## Reporting a vulnerability

Please report security issues **privately** - do not open a public issue.

Use GitHub's private vulnerability reporting: open the **Security** tab of this
repository and click **"Report a vulnerability"**. This opens a private channel
with the maintainers.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a sample input file is ideal), and
- the affected version or commit.

We aim to acknowledge reports within a few days and will keep you updated on a
fix. Please allow reasonable time for a fix to ship before any public disclosure.

## Scope and threat model

- **Design files are parsed entirely client-side** (in a Web Worker). A malicious
  or malformed `.kicad_pcb` / IPC-2581 / ODB++ file can only affect the browser
  tab that opened it - it is never uploaded. Decompression bombs and oversized
  inputs are bounded; parse failures are caught.
- The only server-side component is the optional telemetry collector
  (`collector/server.mjs`). It accepts a strict, size-capped allowlist of fields
  on a same-origin `/collect` endpoint and stores no IP / User-Agent.
- A strict `default-src 'self'` Content-Security-Policy is built into the app, so
  a compromised dependency still cannot exfiltrate a design file.

Reports we're particularly interested in: parser memory-safety / DoS (ReDoS,
unbounded allocation), CSP bypasses, XSS via file-derived text reaching the
DOM / SVG / PDF, and any way to make the collector store or leak unintended data.
