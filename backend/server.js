// publicnote mock backend (in-memory, optional --persist snapshot).
// Phase 2 hardening: write-side PoW (challenge + proof), per-IP / per-note
// rate + size caps. Saves are last-write-wins: every accepted save writes,
// no version tracking, no stale-write rejection.
// All hardening primitives live in backend/lib so the production backend
// (backend/prod-server.js) speaks the exact same protocol.
//
// Run: node backend/server.js [--persist <file>] [--limits <file>]
import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PowController, ChallengeStore } from './lib/pow.js';
import { Limits, loadLimitsConfig, watchLimitsFile, clientIp, deepMerge } from './lib/limits.js';
import { isAllowedAdminIp, adminSourceIp, noteIdOf, AuditRing, rewriteLimitsFile, freeDiskKb, userDaysWindow } from './lib/admin.js';

// Build the express app. opts:
//   enforcePow    - require a valid PoW proof on save2 (default true;
//                   prod sets this from the POW_ENFORCE env during cutover)
//   limitsFile    - JSON file with rate/size/pow config; hot-reloaded on mtime change
//   limitsWatchMs - poll interval for limitsFile (tests shorten this)
//   notes         - seed map/object: id -> ct string (legacy { ct, ... }
//                   snapshots are accepted too; extra fields are ignored)
//   onWrite       - callback(notes) after each successful save (persist hook)
//   trustProxy    - trust the rightmost X-Forwarded-For hop for the admin
//                   gate (prod sets this via TRUST_PROXY behind Caddy)
//   auditCap      - admin audit ring size (default 500)
export function createApp(opts = {}) {
  const enforcePow = opts.enforcePow !== false;
  const trustProxy = opts.trustProxy === true;
  const notes = new Map(); // id -> ct (string)

  if (opts.notes) {
    for (const [id, value] of Object.entries(opts.notes)) {
      if (typeof value === 'string') {
        notes.set(id, value);
      } else if (value && typeof value.ct === 'string') {
        notes.set(id, value.ct);
      }
    }
  }

  const limits = opts.limitsFile ? new Limits(loadLimitsConfig(opts.limitsFile)) : new Limits();
  if (opts.limitsFile) {
    watchLimitsFile(opts.limitsFile, limits, { intervalMs: opts.limitsWatchMs });
  }
  const pow = new PowController(limits.cfg.pow);
  const challenges = new ChallengeStore(pow);

  const globalWrites = []; // accepted-write timestamps (60 s stat window)
  const audit = new AuditRing(opts.auditCap || 500);

  // Per-UTC-day user metrics (unique writer IPs + accepted writes). In-memory
  // here (the mock has no SQLite); prod persists the same shape to user_days.
  const userDays = new Map(); // 'YYYY-MM-DD' -> { uniqueIps: Set, writes: number }
  function recordUserDay(ip) {
    const key = new Date().toISOString().slice(0, 10);
    let row = userDays.get(key);
    if (!row) {
      row = { uniqueIps: new Set(), writes: 0 };
      userDays.set(key, row);
    }
    row.uniqueIps.add(ip);
    row.writes += 1;
  }

  const sweeper = setInterval(function () {
    challenges.sweep();
    limits.sweep();
    const cutoff = new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);
    for (const key of userDays.keys()) {
      if (key < cutoff) {
        userDays.delete(key);
      }
    }
    const now = Date.now();
    const cutoff60 = now - 60000;
    while (globalWrites.length > 0 && globalWrites[0] < cutoff60) {
      globalWrites.shift();
    }
  }, 60000);
  if (typeof sweeper.unref === 'function') {
    sweeper.unref();
  }

  // Persist the given patch into the limits config: rewrite the file (full
  // normalized object, hot-reloaded by the mtime watcher) or, without a
  // limitsFile, apply it in memory.
  function applyLimitsPatch(patch) {
    const merged = opts.limitsFile
      ? rewriteLimitsFile(opts.limitsFile, patch)
      : deepMerge(limits.cfg, patch);
    // Keep the in-memory config in sync immediately (file rewrites are also
    // picked up by the mtime watcher — that reload is idempotent).
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
    const ct = notes.get(id);
    if (ct === undefined) {
      return res.json({});
    }
    res.json({ body: JSON.stringify({ ct }) });
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
    notes.set(id, ct);
    limits.recordWrite(ip, id, now);
    pow.observe(now);
    globalWrites.push(now);
    recordUserDay(ip);
    audit.record({ ip: ip, action: 'save', status: 200 });
    if (typeof opts.onWrite === 'function') {
      opts.onWrite(notes);
    }
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
    const writes30m = globalWrites.filter(function (t) {
      return t >= now - 1800000;
    }).length;
    res.json({
      body: JSON.stringify({
        notes: notes.size,
        writes60s: writes60s,
        writes30m: writes30m,
        activeIps: limits.byIp.size,
        powK: pow.kFor(),
        readonly: limits.cfg.readonly === true,
        blockedIps: Array.isArray(limits.cfg.blockedIps) ? limits.cfg.blockedIps : [],
        freeDiskKb: freeDiskKb(process.cwd()),
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
    const deleted = notes.delete(noteId);
    audit.record({ ip: ip, action: 'purge', detail: title, status: deleted ? 200 : 404 });
    res.json({ body: JSON.stringify({ deleted: deleted, id: noteId }) });
  });

  admin.post('/audit', function (req, res) {
    const patch = req.body || {};
    let n = 100;
    if (typeof patch.n === 'number' && Number.isFinite(patch.n)) {
      n = Math.max(1, Math.min(patch.n, 500));
    }
    res.json({ body: JSON.stringify(audit.tail(n)) });
  });

  admin.post('/user-days', function (req, res) {
    const patch = req.body || {};
    let days = 30;
    if (typeof patch.days === 'number' && Number.isFinite(patch.days)) {
      days = Math.max(1, Math.min(Math.floor(patch.days), 365));
    }
    const byDate = new Map();
    for (const [key, row] of userDays) {
      byDate.set(key, { uniqueIps: row.uniqueIps.size, writes: row.writes });
    }
    res.json({
      body: JSON.stringify({
        days: userDaysWindow(function (key) {
          return byDate.get(key);
        }, days)
      })
    });
  });

  app.use('/api/admin', admin);

  return { app, notes, limits, pow, challenges, audit, globalWrites, userDays };
}

function argValue(flag) {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const persistFile = argValue('--persist');
  const limitsFile = argValue('--limits');

  let seed = null;
  if (persistFile && existsSync(persistFile)) {
    try {
      // Snapshots map id -> ct string (legacy { ct, ... } objects are also
      // accepted by the seed loader; extra fields are ignored).
      seed = JSON.parse(readFileSync(persistFile, 'utf8'));
    } catch (error) {
      console.error('failed to load notes file:', error.message);
    }
  }

  function persist(notesMap) {
    if (!persistFile) {
      return;
    }
    const obj = {};
    for (const [id, note] of notesMap) {
      obj[id] = note;
    }
    writeFileSync(persistFile, JSON.stringify(obj, null, 2));
  }

  const trustProxy = process.env.TRUST_PROXY === '1';
  const { app } = createApp({ notes: seed, limitsFile, onWrite: persist, trustProxy });

  const port = process.env.PORT || 3001;
  app.listen(port, function () {
    console.log('publicnote mock backend on http://localhost:' + port);
    if (limitsFile) {
      console.log('limits from ' + limitsFile + ' (hot-reloaded on change)');
    }
    if (trustProxy) {
      console.log('admin gate trusts X-Forwarded-For (TRUST_PROXY=1)');
    }
  });
}
