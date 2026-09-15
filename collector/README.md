# Telemetry collector (reference implementation)

A tiny, dependency-free Node service that receives the app's **opt-in, anonymous**
usage events. It is intentionally minimal and privacy-preserving - see
[`../PRIVACY.md`](../PRIVACY.md) for the user-facing notice.

## What it does

- Accepts `POST /collect` with a strict JSON schema (`server.mjs`). Unknown keys
  are dropped, the body is capped at 1 KB, and malformed/oversized requests are
  rejected. It **cannot** be used as a generic data sink.
- Uses the **IP + User-Agent only** to compute the daily unique-visitor hash,
  then **discards them** - neither is stored, and no geolocation or browser
  parsing is performed.
- Estimates **unique visitors** with a daily-rotating salted hash of IP+UA kept
  **only in memory**; the hash is never written to disk. Only aggregate counts
  and event rows (with no IP/UA/hash) are persisted.
- **Abuse limits, in memory.** Each client gets `COLLECT_RATE_LIMIT` requests an
  hour, then 429 with `Retry-After`. The number of tracked clients and visitor
  hashes is capped, so the endpoint can't fill the disk or memory. The client is
  the first `X-Forwarded-For` entry, so the proxy in front must pass the real
  client address (see the `trusted_proxies` note in `../Caddyfile`).
- Responses:
  - 204: stored
  - 400: malformed JSON
  - 405: not a POST
  - 413: over 1 KB
  - 415: not JSON
  - 422: unknown event
  - 429: rate-limited
  - 404: any other path

## Run

Via docker-compose (recommended - Caddy proxies same-origin `/collect` to it):

```bash
docker compose up -d --build
```

Standalone for testing:

```bash
node collector/server.mjs            # listens on :8081, writes ./collector/data
node collector/selftest.mjs          # retention, request contract, concurrent writes
```

Environment:
- `PORT`: default 8081
- `DATA_DIR`
- `TELEMETRY_RETENTION_DAYS`: default 365
- `COLLECT_RATE_LIMIT`: requests per client per hour, default 300

## Output

Under `DATA_DIR` (default `collector/data`, a Docker volume in compose):

- `events.ndjson` - one JSON object per event: `ts, e, v` and the event-specific
  counts (`fmt`, `outcome`, `comp`, `bom`, `pages`). No IP, no User-Agent, no
  country, no identifiers.
- `uniques.json` - `{ "YYYY-MM-DD": <count> }` approximate daily unique visitors.

Example aggregate query:

```bash
# events per type
jq -r .e collector/data/events.ndjson | sort | uniq -c
# total components processed
jq -s 'map(.comp // 0) | add' collector/data/events.ndjson
```

## Notes

- This is a reference implementation. For higher volume, swap the NDJSON append
  for SQLite/Postgres; the privacy contract (no IP/UA/hash stored) must be kept.
- Retention is enforced by the collector itself. At start-up, and then once a
  day, it deletes `events.ndjson` rows older than `TELEMETRY_RETENTION_DAYS`
  (default 365, the "12 months" in the privacy notice). It rewrites the file
  and swaps it in atomically. Rows it cannot parse are dropped too.
  `uniques.json` totals are kept indefinitely. No cron job is needed; until
  2026-09-14 the README asked for one, and none was ever set up on the hosted
  instance.
- All writes (append, uniques update, prune) run through one queue, so a
  concurrent request can't lose a row or an increment.
