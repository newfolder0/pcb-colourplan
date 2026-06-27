# Privacy Notice - PCB Colour-Plan

_Last updated: 2026-06-05_

## In short

- **Your PCB design never leaves your browser.** Parsing, rendering, and PDF
  generation all happen locally on your device. The design file, its contents,
  and the generated PDF are never uploaded anywhere.
- **The hosted instance is funded by anonymous usage data.** Running the server
  costs money and the hosted tool is free; in return it collects a small amount
  of anonymous usage data (listed below). Using the hosted tool requires
  agreeing to this. If you'd rather not, the tool is open source - **self-host
  the identical container and nothing is collected at all** (see the repository
  link shown when you decline, and `docker-compose.yml`).
- You can withdraw at any time from the **"Privacy & data"** link; because use of
  the hosted tool is conditioned on the data, withdrawing returns you to that
  choice (agree, or self-host).

## Who is responsible

Data controller: **Peter Bell**. Contact: `you@example.com` _(replace with your
real address before publishing)_.

## What is processed locally and never transmitted

Everything to do with your design: the `.kicad_pcb` / IPC-2581 / ODB++ file, all
component values, reference designators, part numbers, footprints, the board
title/company/author fields, file names, and the generated PDF. None of this is
sent off your device under any circumstances.

The app stores two small flags in your browser's `localStorage` (not cookies,
never transmitted): your acknowledgement of the start-up disclaimer
(`cp_disclaimer_v2`) and your analytics choice (`cp_analytics_consent_v1`).

## Anonymous usage statistics (hosted instance)

On the hosted instance, the app sends a small event when you open it and when you
process a board. **Legal basis: your consent** (GDPR Art. 6(1)(a); UK PECR reg. 6
for the network/storage), requested before any data is sent. Use of the free
hosted service is conditioned on this, but a **genuine, equivalent, free
alternative is offered** - self-hosting the identical open-source container, which
collects nothing - so the choice remains real. The data itself is anonymous and
aggregated. You may withdraw at any time (and then self-host).

**What is sent** (server-side fields are derived by the receiving server, not by
your browser):

| Field | Source | Notes |
|---|---|---|
| Date/time of the request | server | not sent by your browser |
| App version | browser | e.g. `1.2.3` |
| Import format | browser | `kicad` / `ipc2581` / `odbpp` |
| Component count, BOM-line count | browser | integers only |
| PDF page count | browser | integer only |
| Outcome | browser | `ok` / `parse_error` / `unsupported` - a code only, never the error text |

**Unique-visitor estimate:** the server computes a daily-rotating, salted hash of
IP + User-Agent purely to estimate how many different people use the tool. The raw
IP/User-Agent and the hash itself are **not stored** - only aggregate counts are
kept. No geolocation is performed.

**What is never collected:** your design file or any part of it; component values,
references, part numbers, or footprints; file names, board title, company, or
author; your location or country; your stored IP address; your browser/device
details; cookies or any cross-site/advertising trackers; anything that identifies
you personally.

**Where it goes:** a same-origin endpoint (`/collect`) on the same server that
hosts the app - no third-party analytics provider, and the app's
Content-Security-Policy keeps it confined to its own origin. _(If you reconfigure
it to use a third-party processor, add that processor and a Data Processing
Agreement here.)_

**Retention:** raw events are deleted after 12 months; only aggregate counts are
kept thereafter.

## Your rights

You can withdraw consent at any time via **"Privacy & data"** (as easy as giving
it). Because the collected data is anonymous and not linked to you, it generally
cannot be traced back to an individual for access/erasure requests; contact the
controller above with any questions.

## Hosting logs

This app needs no request logs to function. The bundled Caddy config writes no
access logs (no `log` directive), so visitor IP addresses are never logged. If you
host it elsewhere, note that web servers log visitor IP addresses (personal data)
by default - disable or anonymize those logs and disclose what you keep.

## Changes

Material changes to what is collected will bump the consent version, so you will
be asked again rather than silently opted in.
