// Shared rate/size limiting + hot-reloadable config for publicnote (phase 2).
// Used by both the mock and production backends.
//
// Two sliding-window rate caps: per-IP (all notes combined) and per-note.
// Only *accepted* writes count toward a window, so a rejected burst does not
// extend the caller's ban. `maxCtChars` is the ciphertext size cap (413 at or
// over it). The whole config can come from a JSON file whose mtime is
// polled; editing the file re-tunes the running backend with no redeploy.

import { readFileSync, statSync } from 'node:fs';

export const LIMITS_DEFAULTS = {
  perIp: { windowMs: 60000, maxWrites: 120 },
  perNote: { windowMs: 60000, maxWrites: 60 },
  maxCtChars: 100000,
  pow: {
    minK: 1,
    defaultK: 2,
    busyK: 4,
    maxK: 8,
    expiryMs: 15000,
    windowMs: 60000,
    quietAt: 10,
    busyAt: 60,
    floodAt: 300,
    maxChallenges: 50000
  }
};

function deepMerge(base, extra) {
  const out = {};
  for (const key of Object.keys(base)) {
    const b = base[key];
    const e = extra ? extra[key] : undefined;
    if (
      b !== null && typeof b === 'object' && !Array.isArray(b) &&
      e !== undefined && e !== null && typeof e === 'object' && !Array.isArray(e)
    ) {
      out[key] = deepMerge(b, e);
    } else if (e !== undefined) {
      out[key] = e;
    } else {
      out[key] = b;
    }
  }
  return out;
}

// Read a limits config file (JSON, any subset of the defaults). A missing or
// unreadable file falls back to the built-in defaults rather than failing.
export function loadLimitsConfig(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return deepMerge(LIMITS_DEFAULTS, parsed);
    }
    console.warn('[publicnote] limits config is not an object; using defaults (' + file + ')');
  } catch (error) {
    console.warn('[publicnote] limits config unreadable (' + file + '); using defaults: ' + error.message);
  }
  return deepMerge(LIMITS_DEFAULTS, {});
}

export class Limits {
  constructor(cfg = {}) {
    this.cfg = deepMerge(LIMITS_DEFAULTS, cfg);
    this.byIp = new Map();
    this.byNote = new Map();
  }

  setConfig(cfg) {
    this.cfg = deepMerge(LIMITS_DEFAULTS, cfg);
  }

  // { ok, reason: 'ip-rate' | 'note-rate', retryAfterMs }
  checkWrite(ip, id, now = Date.now()) {
    const ipGate = this.windowCheck(this.byIp, ip, this.cfg.perIp, now, 'ip-rate');
    if (!ipGate.ok) {
      return ipGate;
    }
    return this.windowCheck(this.byNote, id, this.cfg.perNote, now, 'note-rate');
  }

  windowCheck(store, key, spec, now, reason) {
    const stamps = store.get(key);
    if (stamps === undefined || stamps.length === 0) {
      return { ok: true };
    }
    const cutoff = now - spec.windowMs;
    while (stamps.length > 0 && stamps[0] < cutoff) {
      stamps.shift();
    }
    if (stamps.length >= spec.maxWrites) {
      const retryAfterMs = Math.max(1000, stamps[0] + spec.windowMs - now);
      return { ok: false, reason, retryAfterMs };
    }
    return { ok: true };
  }

  recordWrite(ip, id, now = Date.now()) {
    let ipStamps = this.byIp.get(ip);
    if (ipStamps === undefined) {
      ipStamps = [];
      this.byIp.set(ip, ipStamps);
    }
    ipStamps.push(now);
    let noteStamps = this.byNote.get(id);
    if (noteStamps === undefined) {
      noteStamps = [];
      this.byNote.set(id, noteStamps);
    }
    noteStamps.push(now);
  }

  // Drop keys whose activity has fallen out of the window (keeps the maps
  // bounded on long-running processes).
  sweep(now = Date.now()) {
    for (const [ip, stamps] of this.byIp) {
      if (stamps.length === 0 || now - stamps[stamps.length - 1] > this.cfg.perIp.windowMs) {
        this.byIp.delete(ip);
      }
    }
    for (const [id, stamps] of this.byNote) {
      if (stamps.length === 0 || now - stamps[stamps.length - 1] > this.cfg.perNote.windowMs) {
        this.byNote.delete(id);
      }
    }
  }
}

// Poll `file` for mtime changes; on change, re-read + re-apply the config.
// Returns a stop() handle. Invalid JSON is logged and ignored (current
// config stays in effect until a valid edit lands).
export function watchLimitsFile(file, limits, { intervalMs = 5000, log = console.log } = {}) {
  let lastMtimeMs = -1;
  const tick = function () {
    try {
      const mtimeMs = statSync(file).mtimeMs;
      if (mtimeMs !== lastMtimeMs) {
        lastMtimeMs = mtimeMs;
        try {
          const parsed = JSON.parse(readFileSync(file, 'utf8'));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            limits.setConfig(parsed);
            log('[publicnote] limits reloaded from ' + file);
          } else {
            console.warn('[publicnote] limits file is not an object; keeping current config (' + file + ')');
          }
        } catch (error) {
          console.warn('[publicnote] limits reload failed, keeping current config: ' + error.message);
          lastMtimeMs = -1;
        }
      }
    } catch (error) {
      // File disappeared or transient IO error: keep the current config.
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return function stop() {
    clearInterval(timer);
  };
}

// Best-effort caller identity: Caddy (prod) sets X-Forwarded-For; the mock
// dev server is hit from localhost. First hop only.
export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  let first = null;
  if (typeof xf === 'string' && xf.length > 0) {
    first = xf;
  } else if (Array.isArray(xf) && xf.length > 0) {
    first = String(xf[0]);
  }
  if (first !== null) {
    const ip = first.split(',')[0].trim();
    if (ip.length > 0) {
      return ip;
    }
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
