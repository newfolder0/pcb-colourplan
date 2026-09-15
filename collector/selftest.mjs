// Self-test for the telemetry collector: retention pruning, the request
// contract, the per-client rate limit, and that concurrent writes neither lose
// rows nor uniques.
// Dependency-free, no network beyond loopback:
//
//   node collector/selftest.mjs
//
// Spawns server.mjs on a free port with a throwaway DATA_DIR.

import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failures++;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);

// Seed: one row past a 30-day retention, one inside it, one unreadable.
const dataDir = await mkdtemp(join(tmpdir(), 'colourplan-collector-'));
const eventsFile = join(dataDir, 'events.ndjson');
const uniquesFile = join(dataDir, 'uniques.json');
await writeFile(
  eventsFile,
  [
    JSON.stringify({ ts: agoIso(40 * DAY_MS), e: 'app_open', v: 'old' }),
    JSON.stringify({ ts: agoIso(1 * DAY_MS), e: 'app_open', v: 'recent' }),
    '{not json',
  ].join('\n') + '\n',
);
await writeFile(uniquesFile, JSON.stringify({ '2020-01-01': 7 }));

// Only these variables reach the child, so nothing in the calling shell leaks in.
const port = await freePort();
const child = spawn(process.execPath, [join(here, 'server.mjs')], {
  env: {
    PATH: process.env.PATH,
    PORT: String(port),
    DATA_DIR: dataDir,
    TELEMETRY_RETENTION_DAYS: '30',
    COLLECT_RATE_LIMIT: '60',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let log = '';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('collector did not start')), 10_000);
  child.stdout.on('data', (buf) => {
    log += buf;
    if (log.includes('listening')) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.on('exit', (code) => reject(new Error(`collector exited with ${code}`)));
});

const base = `http://127.0.0.1:${port}`;
const rows = async () => (await readFile(eventsFile, 'utf8')).split('\n').filter(Boolean);
const uniques = async () => JSON.parse(await readFile(uniquesFile, 'utf8'));
function post(body, extraHeaders = {}) {
  return fetch(`${base}/collect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body,
  });
}

try {
  // ---- retention: applied before the server accepts anything -------------
  const start = await rows();
  check('start-up prune drops rows past retention', !start.some((l) => l.includes('"old"')));
  check('start-up prune keeps rows inside retention', start.some((l) => l.includes('"recent"')));
  check('start-up prune drops unreadable rows', start.length === 1);
  check('prune is logged with the retention in force', log.includes('pruned 2 event row(s) older than 30 days'));
  check('start-up log states the retention and rate limit', log.includes('retention 30 days, rate limit 60/client/hour'));
  check('prune leaves the per-day unique totals alone', (await uniques())['2020-01-01'] === 7);

  // ---- request contract ---------------------------------------------------
  check(
    'valid event -> 204',
    (await post(JSON.stringify({ e: 'pdf_generated', v: '9', pages: 3, extra: 'x' }))).status === 204,
  );
  const stored = (await rows()).map((l) => JSON.parse(l)).find((r) => r.e === 'pdf_generated');
  check('stored row drops unknown keys', Boolean(stored) && !('extra' in stored) && stored.pages === 3);
  check('unknown event -> 422', (await post(JSON.stringify({ e: 'nope' }))).status === 422);
  check('non-JSON -> 415', (await post('e=app_open', { 'content-type': 'text/plain' })).status === 415);
  check('malformed JSON -> 400', (await post('{"e":')).status === 400);
  const getCollect = await fetch(`${base}/collect`);
  check('GET /collect -> 405 with Allow: POST', getCollect.status === 405 && getCollect.headers.get('allow') === 'POST');
  check('any other path -> 404', (await fetch(`${base}/nope`)).status === 404);
  check('oversized body -> 413', (await post(JSON.stringify({ e: 'app_open', v: 'x'.repeat(2000) }))).status === 413);
  check('unique counted for the first visitor today', (await uniques())[todayKey()] === 1);

  // ---- concurrency: the write queue ---------------------------------------
  const before = (await rows()).length;
  const burst = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      post(JSON.stringify({ e: 'app_open', v: 'burst' }), { 'user-agent': `selftest-agent-${i}` }),
    ),
  );
  check('burst of 20 concurrent events all accepted', burst.every((r) => r.status === 204));
  check('no row lost under concurrency', (await rows()).length === before + 20);
  check('no unique-visitor increment lost under concurrency', (await uniques())[todayKey()] === 21);

  // ---- per-client rate limit (COLLECT_RATE_LIMIT=60 above) ---------------
  // Everything so far came from 127.0.0.1 with no X-Forwarded-For. These carry
  // one, as the front door would, so each address starts with a fresh budget.
  const bad = JSON.stringify({ e: 'nope' });
  const clientA = { 'x-forwarded-for': '198.51.100.1' };
  const budget = await Promise.all(Array.from({ length: 60 }, () => post(bad, clientA)));
  check('rate limit: a client gets its full hourly budget', budget.every((r) => r.status === 422));
  const over = await post(bad, clientA);
  check(
    'rate limit: the next request gets 429 with Retry-After',
    over.status === 429 && Number(over.headers.get('retry-after')) > 0,
  );
  check('rate limit: other clients are unaffected', (await post(bad, { 'x-forwarded-for': '198.51.100.2' })).status === 422);
  check(
    'rate limit: keyed on the first X-Forwarded-For entry (the real client)',
    (await post(bad, { 'x-forwarded-for': '198.51.100.1, 172.18.0.2' })).status === 429,
  );
} finally {
  child.kill();
  await once(child, 'exit').catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
