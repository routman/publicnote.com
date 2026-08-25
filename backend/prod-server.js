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
import { Limits, loadLimitsConfig, watchLimitsFile, clientIp, deepMerge } from './lib/limits.js';
import { isAllowedAdminIp, adminSourceIp, noteIdOf, rewriteLimitsFile, freeDiskKb } from './lib/admin.js';

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
const deleteStmt = db.prepare('DELETE FROM notes WHERE id = ?');
const countStmt = db.prepare('SELECT COUNT(*) AS n FROM notes;');

// Admin audit trail (phase 6), persisted in SQLite and bounded to ~10000 rows.
db.exec(
  'CREATE TABLE IF NOT EXISTS audit_log (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'at TEXT NOT NULL, ' +
    'ip TEXT NOT NULL, ' +
    'action TEXT NOT NULL, ' +
    'detail TEXT, ' +
    'status INTEGER NOT NULL DEFAULT 0' +
  ');'
);
const auditInsertStmt = db.prepare(
  'INSERT INTO audit_log (at, ip, action, detail, status) VALUES (?, ?, ?, ?, ?);'
);
const auditTailStmt = db.prepare(
  'SELECT at, ip, action, detail, status FROM audit_log ORDER BY id DESC LIMIT ?;'
);
const auditPruneStmt = db.prepare(
  'DELETE FROM audit_log WHERE id <= (SELECT COALESCE(MAX(id), 0) - 10000 FROM audit_log);'
);

// Same record/tail interface as the mock's in-memory AuditRing.
const audit = {
  record: function (entry) {
    auditInsertStmt.run(
      entry.at || new Date().toISOString(),
      entry.ip || 'unknown',
      entry.action || '',
      entry.detail === undefined ? null : String(entry.detail),
      Number.isFinite(entry.status) ? entry.status : 0
    );
  },
  tail: function (n = 100) {
    const count = Math.max(1, Math.min(n | 0, 5000));
    const rows = auditTailStmt.all(count).reverse();
    return rows.map(function (row) {
      const item = { at: row.at, ip: row.ip, action: row.action, status: row.status };
      if (row.detail !== null) {
        item.detail = row.detail;
      }
      return item;
    });
  }
};

const limitsFile = process.env.LIMITS_FILE;
const enforcePow = process.env.POW_ENFORCE !== '0';
const trustProxy = process.env.TRUST_PROXY === '1';

const limits = limitsFile ? new Limits(loadLimitsConfig(limitsFile)) : new Limits();
if (limitsFile) {
  watchLimitsFile(limitsFile, limits);
}
const pow = new PowController(limits.cfg.pow);
const challenges = new ChallengeStore(pow);

const globalWrites = []; // accepted-write timestamps (60 s stat window)

const sweeper = setInterval(function () {
  challenges.sweep();
  limits.sweep();
  auditPruneStmt.run();
  const cutoff = Date.now() - 60000;
  while (globalWrites.length > 0 && globalWrites[0] < cutoff) {
    globalWrites.shift();
  }
}, 60000);
sweeper.unref();

// Persist the given patch into the limits config: rewrite the file (full
// normalized object, hot-reloaded by the mtime watcher) or, without a
// LIMITS_FILE, apply it in memory.
function applyLimitsPatch(patch) {
  const merged = limitsFile
    ? rewriteLimitsFile(limitsFile, patch)
    : deepMerge(limits.cfg, patch);
  limits.setConfig(merged);
  return merged;
}

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
  if (limits.cfg.readonly === true) {
    return res.status(403).json({ body: 'read-only' });
  }
  const ip = clientIp(req);
  if (Array.isArray(limits.cfg.blockedIps) && limits.cfg.blockedIps.includes(ip)) {
    audit.record({ ip: ip, action: 'save-blocked', status: 429 });
    return res.status(429).json({ body: 'blocked' });
  }
  const gate = limits.checkWrite(ip, id, now);
  if (!gate.ok) {
    audit.record({ ip: ip, action: 'rate-limited', status: 429 });
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
  globalWrites.push(now);
  audit.record({ ip: ip, action: 'save', status: 200 });
  res.json({ body: 'successfully saved' });
});

// --- admin / incident tooling (phase 6) ---
// CIDR-gated: loopback / RFC1918 / Tailscale ranges only. Behind Caddy with
// TRUST_PROXY the rightmost X-Forwarded-For hop is the real client.
function adminGate(req, res, next) {
  const ip = adminSourceIp(req, trustProxy);
  if (!isAllowedAdminIp(ip)) {
    audit.record({ ip: ip, action: 'admin-denied', status: 403 });
    return res.status(403).json({ body: 'forbidden' });
  }
  next();
}

const admin = express.Router();
admin.use(adminGate);

admin.post('/stats', function (req, res) {
  const now = Date.now();
  const writes60s = globalWrites.filter(function (t) {
    return t >= now - 60000;
  }).length;
  res.json({
    body: JSON.stringify({
      notes: countStmt.get().n,
      writes60s: writes60s,
      powK: pow.kFor(),
      readonly: limits.cfg.readonly === true,
      blockedIps: Array.isArray(limits.cfg.blockedIps) ? limits.cfg.blockedIps : [],
      freeDiskKb: freeDiskKb(dirname(dbPath)),
      uptimeS: Math.floor(process.uptime())
    })
  });
});

admin.post('/limits', function (req, res) {
  res.json({ body: JSON.stringify(limits.cfg) });
});

admin.post('/set-limits', function (req, res) {
  const patch = req.body;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return res.status(400).json({ body: 'bad request' });
  }
  const cfg = applyLimitsPatch(patch);
  const ip = adminSourceIp(req, trustProxy);
  audit.record({ ip: ip, action: 'limits-set', detail: JSON.stringify(patch), status: 200 });
  res.json({ body: JSON.stringify({ ok: true, cfg: cfg }) });
});

admin.post('/readonly', function (req, res) {
  const patch = req.body || {};
  if (typeof patch.on !== 'boolean') {
    return res.status(400).json({ body: 'bad request' });
  }
  const ip = adminSourceIp(req, trustProxy);
  applyLimitsPatch({ readonly: patch.on });
  audit.record({ ip: ip, action: patch.on ? 'readonly-on' : 'readonly-off', status: 200 });
  res.json({ body: JSON.stringify({ ok: true, readonly: patch.on }) });
});

admin.post('/block', function (req, res) {
  const ip = adminSourceIp(req, trustProxy);
  const target = (req.body || {}).ip;
  if (typeof target !== 'string' || target.length === 0 || target.length > 64) {
    return res.status(400).json({ body: 'bad request' });
  }
  const current = Array.isArray(limits.cfg.blockedIps) ? limits.cfg.blockedIps : [];
  if (!current.includes(target)) {
    applyLimitsPatch({ blockedIps: current.concat([target]) });
  }
  audit.record({ ip: ip, action: 'block', detail: target, status: 200 });
  res.json({ body: JSON.stringify({ ok: true, blockedIps: limits.cfg.blockedIps || [] }) });
});

admin.post('/unblock', function (req, res) {
  const ip = adminSourceIp(req, trustProxy);
  const target = (req.body || {}).ip;
  if (typeof target !== 'string' || target.length === 0) {
    return res.status(400).json({ body: 'bad request' });
  }
  const current = Array.isArray(limits.cfg.blockedIps) ? limits.cfg.blockedIps : [];
  applyLimitsPatch({ blockedIps: current.filter(function (entry) {
    return entry !== target;
  }) });
  audit.record({ ip: ip, action: 'unblock', detail: target, status: 200 });
  res.json({ body: JSON.stringify({ ok: true, blockedIps: limits.cfg.blockedIps || [] }) });
});

admin.post('/purge', function (req, res) {
  const ip = adminSourceIp(req, trustProxy);
  const title = (req.body || {}).title;
  if (typeof title !== 'string' || title.length === 0) {
    return res.status(400).json({ body: 'bad request' });
  }
  const noteId = noteIdOf(title);
  const result = deleteStmt.run(noteId);
  const deleted = result.changes > 0;
  audit.record({ ip: ip, action: 'purge', detail: title, status: deleted ? 200 : 404 });
  res.json({ body: JSON.stringify({ deleted: deleted, id: noteId }) });
});

admin.post('/audit', function (req, res) {
  const patch = req.body || {};
  let n = 100;
  if (typeof patch.n === 'number' && Number.isFinite(patch.n)) {
    n = Math.max(1, Math.min(patch.n, 5000));
  }
  res.json({ body: JSON.stringify(audit.tail(n)) });
});

app.use('/api/admin', admin);

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3001;
app.listen(port, host, function () {
  console.log(
    'publicnote backend on http://' + host + ':' + port +
    ' (db=' + dbPath + ', WAL, pow=' + (enforcePow ? 'on' : 'off') +
    (limitsFile ? ', limits=' + limitsFile : '') +
    (trustProxy ? ', trust-proxy' : '') + ')'
  );
});
