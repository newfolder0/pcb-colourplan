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

## Run

Via docker-compose (recommended - Caddy proxies same-origin `/collect` to it):

```bash
docker compose up -d --build
```

Standalone for testing:

```bash
node collector/server.mjs            # listens on :8081, writes ./collector/data
```

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
- Retention: prune `events.ndjson` to your stated policy (12 months) with a cron
  job; aggregate counts can be kept indefinitely.
