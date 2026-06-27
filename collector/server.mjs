// Minimal, dependency-free telemetry collector for PCB Colour-Plan.
//
// Privacy-by-design (see ../PRIVACY.md):
//   - Accepts ONLY the strict event schema below; unknown keys are dropped, the
//     body is size-capped, and anything malformed is rejected. It cannot be used
//     as a generic data-exfiltration sink.
//   - Uses the IP + User-Agent ONLY to compute the daily unique-visitor hash,
//     then DISCARDS them. Neither is stored, and no geolocation/browser parsing
//     is done. Stored rows are just a timestamp + the client payload.
//   - Estimates unique visitors with a daily-rotating salted hash of IP+UA held
//     ONLY in memory; the hash is never written to disk. Only aggregate counts
//     and the event rows (no IP/UA/hash) are persisted.
//
// Deploy behind Caddy as a same-origin /collect (see ../Caddyfile), so the app
// CSP can stay `connect-src 'self'`. Run: `node collector/server.mjs`.

import { createServer } from 'node:http';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 8081);
const DATA_DIR = process.env.DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'data');
const EVENTS_FILE = join(DATA_DIR, 'events.ndjson');
const UNIQUES_FILE = join(DATA_DIR, 'uniques.json');
const MAX_BODY = 1024; // bytes - the payload is tiny; reject anything larger

// Per-run secret so the daily visitor hash cannot be reproduced from stored data
// (and rotates on restart). Combined with the date, never persisted.
const RUN_SALT = randomBytes(32);

// In-memory set of today's visitor hashes (NEVER persisted). { date, set }.
let today = { date: '', seen: new Set() };

const EVENTS = new Set(['app_open', 'board_processed', 'pdf_generated']);
const FORMATS = new Set(['kicad', 'ipc2581', 'odbpp', 'unknown']);
const OUTCOMES = new Set(['ok', 'parse_error', 'unsupported']);

const isInt = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e7;

/** Allowlist + coerce the client payload. Returns null if invalid. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!EVENTS.has(raw.e)) return null;
  const out = { e: raw.e, v: typeof raw.v === 'string' ? raw.v.slice(0, 32) : '' };
  if (raw.e === 'board_processed') {
    out.fmt = FORMATS.has(raw.fmt) ? raw.fmt : 'unknown';
    out.outcome = OUTCOMES.has(raw.outcome) ? raw.outcome : 'ok';
    if (out.outcome === 'ok') {
      out.comp = isInt(raw.comp) ? Math.trunc(raw.comp) : 0;
      out.bom = isInt(raw.bom) ? Math.trunc(raw.bom) : 0;
    }
  } else if (raw.e === 'pdf_generated') {
    out.pages = isInt(raw.pages) ? Math.trunc(raw.pages) : 0;
  }
  return out;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  return req.socket.remoteAddress ?? '';
}

function dateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/** Count a unique visitor for today without persisting any identifier. */
async function countUnique(ip, ua) {
  const date = dateKey();
  if (today.date !== date) today = { date, seen: new Set() };
  const hash = createHash('sha256').update(RUN_SALT).update(date).update(ip).update(ua).digest('hex');
  if (today.seen.has(hash)) return; // already counted today
  today.seen.add(hash);
  // Persist only the aggregate count, never the hash.
  let counts = {};
  try {
    counts = JSON.parse(await readFile(UNIQUES_FILE, 'utf8'));
  } catch {
    /* first write */
  }
  counts[date] = (counts[date] ?? 0) + 1;
  await writeFile(UNIQUES_FILE, JSON.stringify(counts, null, 0));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const cors = { 'Cache-Control': 'no-store' };
  if (req.method !== 'POST' || (req.url ?? '').split('?')[0] !== '/collect') {
    res.writeHead(404, cors).end();
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    res.writeHead(415, cors).end();
    return;
  }
  let payload;
  try {
    payload = sanitize(JSON.parse(await readBody(req)));
  } catch {
    res.writeHead(400, cors).end();
    return;
  }
  if (!payload) {
    res.writeHead(422, cors).end();
    return;
  }

  // IP + User-Agent are used ONLY for the unstored daily unique-visitor hash,
  // then discarded. The stored row is just a timestamp + the client payload.
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] ?? '');
  const row = { ts: new Date().toISOString(), ...payload };

  try {
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(EVENTS_FILE, JSON.stringify(row) + '\n');
    await countUnique(ip, ua); // ip/ua used here only, never stored
  } catch (err) {
    // Log server-side (visible in container logs) so a misconfiguration is never
    // silent, but never expose detail to the client.
    console.error('[collector] storage write failed:', err instanceof Error ? err.message : err);
  }
  // 204: nothing to return; keep the response opaque and tiny.
  res.writeHead(204, cors).end();
});

server.listen(PORT, () => console.log(`[collector] listening on :${PORT}, data in ${DATA_DIR}`));
