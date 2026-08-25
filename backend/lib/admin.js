// Shared admin/instrumentation primitives for publicnote (phase 6).
// Used by both the mock and production backends:
// - admin source-IP resolution + CIDR gate (loopback/RFC1918/Tailscale only)
// - in-memory audit ring (mock; prod persists to SQLite)
// - atomic full-object limits-file rewrites so admin edits hot-reload
// - note id derivation (same SHA-256 as the client's title -> id mapping)

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { LIMITS_DEFAULTS, deepMerge } from './limits.js';

// Loopback + private ranges + Tailscale (CGNAT). Anything else is denied.
export const ADMIN_ALLOW_CIDRS = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10'
];

function ip4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) {
    return null;
  }
  let n = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const v = Number(part);
    if (v > 255) {
      return null;
    }
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function isAllowedAdminIp(ip) {
  let s = String(ip || '').trim().toLowerCase();
  if (s.startsWith('::ffff:')) {
    s = s.slice(7); // dual-stack sockets report IPv4 peers as ::ffff:a.b.c.d
  }
  if (s === '::1' || s === '::') {
    return true; // loopback (IPv6)
  }
  const n = ip4ToInt(s);
  if (n === null) {
    return false;
  }
  for (const entry of ADMIN_ALLOW_CIDRS) {
    const slash = entry.lastIndexOf('/');
    const base = ip4ToInt(entry.slice(0, slash));
    const prefix = Number(entry.slice(slash + 1));
    if (base === null || Number.isNaN(prefix)) {
      continue;
    }
    const mask = (prefix === 0 ? 0 : (0xFFFFFFFF ^ (0xFFFFFFFF >>> (32 - prefix)))) >>> 0;
    if ((((n ^ base) >>> 0) & mask) === 0) {
      return true;
    }
  }
  return false;
}

// Source IP for the admin gate. With TRUST_PROXY (prod, behind Caddy) the
// rightmost X-Forwarded-For hop is the real client address Caddy appended;
// without it we trust only the socket peer.
export function adminSourceIp(req, trustProxy) {
  if (trustProxy) {
    const xf = req.headers['x-forwarded-for'];
    const raw = Array.isArray(xf) ? xf.join(',') : xf;
    if (typeof raw === 'string' && raw.length > 0) {
      const hops = raw.split(',');
      const last = hops[hops.length - 1].trim();
      if (last.length > 0) {
        return last;
      }
    }
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Same mapping as the client: note id = SHA-256(title) lowercase hex.
export function noteIdOf(title) {
  return createHash('sha256').update(String(title), 'utf8').digest('hex');
}

// Bounded in-memory audit trail (mock backend). Prod uses the SQLite-backed
// SqliteAudit from prod-server.js with the same record/tail interface.
export class AuditRing {
  constructor(cap = 500) {
    this.cap = cap;
    this.entries = [];
  }

  record(entry) {
    this.entries.push(Object.assign({ at: new Date().toISOString() }, entry));
    if (this.entries.length > this.cap) {
      this.entries.shift();
    }
  }

  tail(n = 100) {
    const count = Math.max(0, n | 0);
    return this.entries.slice(Math.max(0, this.entries.length - count));
  }
}

// Free space in KiB on the filesystem holding `dir` (`df -kP`, best effort;
// null when df is unavailable or unparseable). Admin stats field.
export function freeDiskKb(dir) {
  try {
    const out = execFileSync('df', ['-kP', dir], { encoding: 'utf8', timeout: 2000 });
    const lines = out.trim().split('\n');
    const last = lines[lines.length - 1].split(/\s+/);
    const kb = Number(last[3]);
    return Number.isFinite(kb) ? kb : null;
  } catch (error) {
    return null;
  }
}

// Apply a patch to the limits file as a FULL normalized object (defaults +
// current file + patch), written atomically via tmp + rename. Writing the
// complete object keeps the file self-describing and idempotent; the mtime
// watcher hot-reloads the result.
export function rewriteLimitsFile(file, patch) {
  let current = {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      current = parsed;
    }
  } catch (error) {
    // Missing/unreadable file: rewrite from defaults + patch.
  }
  const merged = deepMerge(deepMerge(LIMITS_DEFAULTS, current), patch || {});
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
  return merged;
}
