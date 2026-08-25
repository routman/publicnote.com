// publicnote production backend.
// Node + built-in node:sqlite (WAL) + express. Persists to a SQLite file so
// notes survive restarts. Mirrors the mock (backend/server.js) API envelopes
// exactly; the only differences are the persistence layer and that it binds to
// 127.0.0.1 by default (Caddy is the only public entry point).
//
// Phase 2 hardening (shared with the mock via backend/lib):
//   POST /api/challenge  -> { body: JSON.stringify({ nonce, k, expires }) }
//   save2 accepts { id, ct, challenge, proof }; proof is required unless
//   POW_ENFORCE=0. Saves are last-write-wins: every accepted save writes,
//   no version tracking (a stray version field in the payload is ignored).
//   Rate and size caps come from a hot-reloadable JSON config (LIMITS_FILE).
//
// Run: DB_PATH=/opt/publicnote/notes.db node backend/prod-server.js
// Env: PORT (default 3001), HOST (default 127.0.0.1), DB_PATH (required in
// prod), LIMITS_FILE (optional, e.g. /opt/publicnote/limits.json),
// POW_ENFORCE (default 1; 0 disables the proof requirement for cutover).
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PowController, ChallengeStore } from './lib/pow.js';
import { Limits, loadLimitsConfig, watchLimitsFile, clientIp } from './lib/limits.js';

const dbPath = process.env.DB_PATH || 'notes.db';
if (!process.env.DB_PATH) {
  console.warn('DB_PATH not set; using CWD-relative notes.db (dev only).');
}
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec(
  'CREATE TABLE IF NOT EXISTS notes (' +
    'id TEXT PRIMARY KEY NOT NULL, ' +
    'ct TEXT NOT NULL, ' +
    'updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP' +
  ');'
);
// Note: pre-last-write-wins databases have a dormant `version` column; it is
// no longer read or written (last-write-wins: saves carry no version).

const getStmt = db.prepare('SELECT ct FROM notes WHERE id = ?');
const upsertStmt = db.prepare(
  'INSERT INTO notes (id, ct, updated_at) VALUES (?, ?, datetime(\'now\')) ' +
    'ON CONFLICT(id) DO UPDATE SET ct = excluded.ct, updated_at = excluded.updated_at;'
);

const limitsFile = process.env.LIMITS_FILE;
const enforcePow = process.env.POW_ENFORCE !== '0';

const limits = limitsFile ? new Limits(loadLimitsConfig(limitsFile)) : new Limits();
if (limitsFile) {
  watchLimitsFile(limitsFile, limits);
}
const pow = new PowController(limits.cfg.pow);
const challenges = new ChallengeStore(pow);

const sweeper = setInterval(function () {
  challenges.sweep();
  limits.sweep();
}, 60000);
sweeper.unref();

const app = express();

app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

app.post('/api/challenge', function (req, res) {
  res.json({ body: JSON.stringify(challenges.issue()) });
});

app.post('/api/get2', function (req, res) {
  const id = req.body && req.body.id;
  if (typeof id !== 'string') {
    return res.status(400).json({ body: 'bad request' });
  }
  const row = getStmt.get(id);
  if (!row) {
    return res.json({});
  }
  res.json({ body: JSON.stringify({ ct: row.ct }) });
});

app.post('/api/save2', function (req, res) {
  const body = req.body || {};
  const id = body.id;
  const ct = body.ct;
  const now = Date.now();
  if (typeof id !== 'string' || typeof ct !== 'string') {
    return res.status(400).json({ body: 'bad request' });
  }
  const ip = clientIp(req);
  const gate = limits.checkWrite(ip, id, now);
  if (!gate.ok) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(gate.retryAfterMs / 1000))));
    return res.status(429).json({ body: 'rate limited' });
  }
  if (enforcePow) {
    if (typeof body.challenge !== 'string' || typeof body.proof !== 'string') {
      return res.status(401).json({ body: 'proof required' });
    }
    const verdict = challenges.verify(body.challenge, body.proof, now);
    if (!verdict.ok) {
      return res.status(401).json({ body: 'challenge ' + verdict.reason });
    }
  }
  if (String(ct).length >= limits.cfg.maxCtChars) {
    return res.status(413).json({ body: 'note too large' });
  }
  upsertStmt.run(id, ct);
  limits.recordWrite(ip, id, now);
  pow.observe(now);
  res.json({ body: 'successfully saved' });
});

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3001;
app.listen(port, host, function () {
  console.log(
    'publicnote backend on http://' + host + ':' + port +
    ' (db=' + dbPath + ', WAL, pow=' + (enforcePow ? 'on' : 'off') +
    (limitsFile ? ', limits=' + limitsFile : '') + ')'
  );
});
