# PCB Colour-Plan

Import a KiCAD PCB, explore an interactive Bill of Materials, and generate
**colour-plan** assembly PDFs: each page is a greyscale top-down
wireframe of the board with up to four BOM groups highlighted in distinct
colours, plus a legend. Built for the person assembling and checking the board.

**Try it now - free hosted version: [colourplan.peterbell.ch](https://colourplan.peterbell.ch)**

Everything runs **in your browser**. The `.kicad_pcb` file is parsed, rendered,
and turned into a PDF entirely client-side - it never leaves your machine.

## Security & privacy

- **Your design never leaves your browser.** Parsing, rendering, and PDF
  generation all happen locally (parsing, incl. archive decompression and XML,
  runs in a Web Worker). The design file and its contents are never uploaded.
- **The hosted instance is funded by anonymous usage stats.** Using the free
  hosted tool requires agreeing to a small amount of anonymous usage data
  (aggregate counts only - never any design data, no location, no browser/device,
  same-origin endpoint). Don't want that? **Self-host this container and it
  collects nothing** - build with `VITE_TELEMETRY_ENDPOINT=""` (the default
  `docker compose` build enables it; see [`docker-compose.yml`](docker-compose.yml)).
  Exact field list and basis in [`PRIVACY.md`](PRIVACY.md).
- All dependencies are bundled locally (no CDN, no web fonts, no third-party
  analytics). No cookies; the only client storage is two local flags (disclaimer
  acknowledgement + your analytics choice) that never leave the device.
- **Strict Content-Security-Policy in the built app.** A `default-src 'self'`
  CSP is injected into `dist/index.html` at build time, so the same confinement
  applies whether you serve the bundle behind the bundled [`Caddyfile`](Caddyfile)
  (which also sends it as a header) or from any static host. A design file cannot
  be exfiltrated even if a dependency were compromised.
- **Untrusted input is treated as hostile.** All file-derived text is escaped
  before it reaches the DOM/SVG/PDF; oversized inputs and decompression bombs are
  bounded. Parsing failures are caught and shown, never crash the page.
- **If you self-host:** web servers log visitor IP addresses (personal data under
  GDPR) by default. The bundled Caddy config writes **no** access logs; if you use
  a different host, disable or anonymize its logs and tell users what you keep.

## What it reads

Three input formats, all parsed in-browser into one common `Board` model:

- **KiCAD `.kicad_pcb`** (KiCAD 7/8/9, s-expression) - the richest source:
  reference/value/footprint, side, SMD vs through-hole, DNP, placement, footprint
  outlines, board outline, and propagated schematic fields.
- **IPC-2581** (`.xml`) - the open exchange standard exported by Altium, KiCAD 8+, and
  Cadence Allegro. The simplest way to use the tool with a non-KiCAD CAD.
- **ODB++** (`.tgz`/`.tar.gz`/`.zip`) - the Siemens exchange format and defacto
  standard used by many in the industry, exported by Altium and Cadence.

Adding a format is just a `format -> Board` adapter (`src/core/import/`); the BOM,
renderer and colour-plan pipeline are shared. The IPC-2581/ODB++ adapters are
best-effort v1s - rotation/mirror conventions and value/DNP field spellings may
need tuning against a real export from your specific tool. Native Altium
`.PcbDoc` (binary) is intentionally not supported; export IPC-2581 or ODB++ instead.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (parser, BOM, geometry, renderer, pagination)
npm run build    # type-check + production build to dist/
```

## Deploy (private VM)

Caddy serves the static bundle and gets HTTPS automatically. Point your domain's
DNS at the VM, open ports 80 + 443, then:

```bash
cp .env.example .env
echo "DOMAIN=pcb.example.com" > .env   # your domain -> Caddy auto-provisions TLS
docker compose up -d --build           # web (Caddy) + telemetry collector
```

For a quick local run, leave `DOMAIN=:80` (the default) and open
`http://127.0.0.1`. The web image is a multi-stage build (compile the static
bundle, then serve with Caddy); design processing always happens client-side.

## How it works

```
.kicad_pcb ─► parser ─► Board model ─► BOM (grouped)
                          │                 │
                          ▼                 ▼
                    SVG renderer ◄──── colour-plan pages (≤4 groups/page, per side)
                          │
            ┌─────────────┴─────────────┐
       interactive board view      multi-page vector PDF (jsPDF + svg2pdf.js)
```

The core (`src/core/`) is framework-agnostic and pure TypeScript, so the same
engine could run server-side if a board ever outgrows the browser.

- `core/parser` - s-expression tokenizer/parser
- `core/model` - typed Board model
- `core/geometry` - footprint transforms, arc tessellation, bounding boxes
- `core/bom` - grouped Bill of Materials
- `core/render` - shared SVG renderer (board view + composed PDF pages)
- `core/colourplan` - assembly categories, palettes, page pagination
- `core/pdf` - multi-page PDF assembly

## Colour-plan format

A standard assembly colour-plan layout:

- Documents are organised by **assembly category** - SMD, Through-Holes, Not
  Mounted (DNP) - each split top/bottom, paginated at <=4 highlighted groups per
  page. Categories are derived from KiCAD attributes today via a single
  `categoryOf()` function that already prefers an **`Assembly Process`** field,
  so switching the library to that field later is a one-line change.
- Each page: top-centre title (`<n> <Category> <SIDE>`), a legend table
  (`Color | Reference | Value | Part Number | Outline | Qty`, references collapsed
  to ranges like `C1-C10, C16-C17`), the greyscale board with colour-highlighted
  and labelled parts, and an editable title block (doc no., rev, author, org,
  page x/y, date).
- Palette defaults to green/yellow/red/blue (a common assembly-plan convention);
  bright and colour-blind-safe also available. Part Number column auto-detects an
  MPN-like field.

## Next steps

- Back-side mirroring renders as "viewed from the bottom"; verify orientation
  against KiCAD for your specific boards.
- Optional logo image in the title block; per-page group reordering/recolouring;
  pressfit / mechanical categories (need the `Assembly Process` field or a
  footprint-name rule); PNG/SVG export.

## Contributing & security

Bug reports and PRs are welcome - see [`CONTRIBUTING.md`](CONTRIBUTING.md). To
report a security issue privately, see [`SECURITY.md`](SECURITY.md).

## Licence

Copyright © 2026 Peter Bell Electronics Ltd. Released under the
[MIT License](LICENSE) - you may use, study, share, modify, and redistribute it,
including in proprietary and commercial works, provided the copyright notice and
licence text are preserved. Bundled third-party dependencies keep their own
(permissive) licences; see [`THIRD-PARTY-NOTICES.txt`](THIRD-PARTY-NOTICES.txt).
