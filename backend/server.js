// publicnote mock backend (in-memory, optional --persist snapshot).
// Phase 2 hardening: write-side PoW (challenge + proof), server-stamped
// versions with stale-write rejection, per-IP / per-note rate + size caps.
// All hardening primitives live in backend/lib so the production backend
// (backend/prod-server.js) speaks the exact same protocol.
//
// Run: node backend/server.js [--persist <file>] [--limits <file>]
import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PowController, ChallengeStore } from './lib/pow.js';
import { Limits, loadLimitsConfig, watchLimitsFile, clientIp } from './lib/limits.js';

// Build the express app. opts:
//   enforcePow    - require a valid PoW proof on save2 (default true;
//                   prod sets this from the POW_ENFORCE env during cutover)
//   limitsFile    - JSON file with rate/size/pow config; hot-reloaded on mtime change
//   limitsWatchMs - poll interval for limitsFile (tests shorten this)
//   notes         - seed map/object: id -> ct string | { ct, version }
//   onWrite       - callback(notes) after each successful save (persist hook)
export function createApp(opts = {}) {
  const enforcePow = opts.enforcePow !== false;
  const notes = new Map(); // id -> { ct, version }

  if (opts.notes) {
    for (const [id, value] of Object.entries(opts.notes)) {
      if (typeof value === 'string') {
        notes.set(id, { ct: value, version: 0 });
      } else if (value && typeof value.ct === 'string') {
        notes.set(id, { ct: value.ct, version: Number.isInteger(value.version) ? value.version : 0 });
      }
    }
  }

  const limits = opts.limitsFile ? new Limits(loadLimitsConfig(opts.limitsFile)) : new Limits();
  if (opts.limitsFile) {
    watchLimitsFile(opts.limitsFile, limits, { intervalMs: opts.limitsWatchMs });
  }
  const pow = new PowController(limits.cfg.pow);
  const challenges = new ChallengeStore(pow);

  const sweeper = setInterval(function () {
    challenges.sweep();
    limits.sweep();
  }, 60000);
  if (typeof sweeper.unref === 'function') {
    sweeper.unref();
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
    const note = notes.get(id);
    if (note === undefined) {
      return res.json({});
    }
    res.json({ body: JSON.stringify({ ct: note.ct, version: note.version }) });
  });

  app.post('/api/save2', function (req, res) {
    const body = req.body || {};
    const id = body.id;
    const ct = body.ct;
    const now = Date.now();
    if (typeof id !== 'string' || typeof ct !== 'string') {
      return res.status(400).json({ body: 'bad request' });
    }
    const gate = limits.checkWrite(clientIp(req), id, now);
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
    const current = notes.get(id) === undefined ? 0 : notes.get(id).version;
    if (body.version !== undefined) {
      const clientVersion = Number(body.version);
      if (!Number.isInteger(clientVersion) || clientVersion < 0) {
        return res.status(400).json({ body: 'bad request' });
      }
      if (clientVersion !== current) {
        return res.status(409).json({ body: 'stale write', version: current });
      }
    }
    if (String(ct).length >= limits.cfg.maxCtChars) {
      return res.status(413).json({ body: 'note too large' });
    }
    const version = current + 1;
    notes.set(id, { ct, version });
    limits.recordWrite(clientIp(req), id, now);
    pow.observe(now);
    if (typeof opts.onWrite === 'function') {
      opts.onWrite(notes);
    }
    res.json({ body: 'successfully saved', version });
  });

  return { app, notes, limits, pow, challenges };
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
      // Backward compatible: legacy snapshots map id -> ct string (version 0).
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

  const { app } = createApp({ notes: seed, limitsFile, onWrite: persist });

  const port = process.env.PORT || 3001;
  app.listen(port, function () {
    console.log('publicnote mock backend on http://localhost:' + port);
    if (limitsFile) {
      console.log('limits from ' + limitsFile + ' (hot-reloaded on change)');
    }
  });
}
