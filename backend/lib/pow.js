// Shared proof-of-work primitives for publicnote write hardening (phase 2).
// Used by both the mock backend (backend/server.js) and the production backend
// (backend/prod-server.js) so the protocol is identical everywhere.
//
// A challenge is { nonce, k, expires }. The client must find a decimal integer
// proof such that the hex digest of SHA-256(nonce + ':' + proof, utf8) starts
// with `k` zero hex chars (4k bits of work). `k` is chosen per-challenge by
// PowController, which ramps difficulty up as the accepted write rate climbs
// and back down when the box is quiet.

import { createHash, randomBytes } from 'node:crypto';

export const POW_DEFAULTS = {
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
};

export function powDigest(nonce, proof) {
  return createHash('sha256').update(nonce + ':' + proof, 'utf8').digest('hex');
}

export function hasKZeros(digest, k) {
  for (let i = 0; i < k; i += 1) {
    if (digest[i] !== '0') {
      return false;
    }
  }
  return true;
}

export function solveProof(nonce, k, maxProof = 1 << 24) {
  for (let i = 0; i < maxProof; i += 1) {
    if (hasKZeros(powDigest(nonce, String(i)), k)) {
      return String(i);
    }
  }
  return null;
}

function clampK(k, cfg) {
  if (!Number.isInteger(k) || k < cfg.minK || k > cfg.maxK) {
    return cfg.defaultK;
  }
  return k;
}

export class PowController {
  constructor(powCfg = {}) {
    this.cfg = { ...POW_DEFAULTS, ...powCfg };
    this.writes = [];
  }

  observe(now = Date.now()) {
    this.writes.push(now);
    this.prune(now);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.cfg.windowMs;
    while (this.writes.length > 0 && this.writes[0] < cutoff) {
      this.writes.shift();
    }
  }

  // Difficulty for the next challenge: quiet -> minK, calm -> defaultK,
  // busy -> busyK, flood -> maxK (all clamped to [minK, maxK]).
  kFor(now = Date.now()) {
    const { minK, defaultK, busyK, maxK, quietAt, busyAt, floodAt } = this.cfg;
    this.prune(now);
    const n = this.writes.length;
    let k;
    if (n >= floodAt) {
      k = maxK;
    } else if (n >= busyAt) {
      k = busyK;
    } else if (n < quietAt) {
      k = minK;
    } else {
      k = defaultK;
    }
    return clampK(k, this.cfg);
  }

  challenge(now = Date.now()) {
    return {
      nonce: randomBytes(16).toString('hex'),
      k: this.kFor(now),
      expires: now + this.cfg.expiryMs
    };
  }
}

export class ChallengeStore {
  constructor(pow) {
    this.pow = pow;
    this.challenges = new Map();
  }

  issue(now = Date.now()) {
    const challenge = this.pow.challenge(now);
    this.challenges.set(challenge.nonce, challenge);
    // Bound memory under a challenge flood: drop the oldest outstanding one.
    if (this.challenges.size > this.pow.cfg.maxChallenges) {
      this.challenges.delete(this.challenges.keys().next().value);
    }
    return challenge;
  }

  // One-time use: the nonce is consumed (deleted) on verification, pass or
  // fail, so a proof cannot be replayed.
  verify(nonce, proof, now = Date.now()) {
    const c = this.challenges.get(nonce);
    if (c === undefined) {
      return { ok: false, reason: 'unknown' };
    }
    this.challenges.delete(nonce);
    if (now > c.expires) {
      return { ok: false, reason: 'expired' };
    }
    if (typeof proof !== 'string' || !hasKZeros(powDigest(nonce, proof), c.k)) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, challenge: c };
  }

  sweep(now = Date.now()) {
    for (const [nonce, c] of this.challenges) {
      if (now > c.expires) {
        this.challenges.delete(nonce);
      }
    }
  }
}
