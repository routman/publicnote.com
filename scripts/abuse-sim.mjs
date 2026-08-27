// Phase 7 abuse-simulation regressions: run `npm run test:abuse`.
// Proves the write gates stop the bot abuse that killed the old site: a
// script that clobbers one note (per-note cap) or sprays many notes
// (per-IP cap) gets rate-limited (429) / rejected (401), full stop. A spike
// of legitimate writing is fine and is NOT the target — the defense is the
// gates themselves, and this test proves they hold.
//
// Runs the mock backend (backend/server.js createApp) over real HTTP,
// simulating distinct source IPs via X-Forwarded-For (clientIp takes the
// first hop). Mirrors the scripts/pow-limits.mjs harness.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../backend/server.js';
import { solveProof } from '../backend/lib/pow.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('PASS ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL ' + name);
    console.error(error);
  }
}

async function startApp(opts = {}) {
  const created = createApp(opts);
  const server = await new Promise(function (resolve) {
    const s = created.app.listen(0, '127.0.0.1');
    s.once('listening', function () {
      resolve(s);
    });
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  return Object.assign({}, created, {
    base,
    stop: function () {
      return new Promise(function (resolve) {
        server.close(function () {
          resolve();
        });
      });
    }
  });
}

// POST with an optional X-Forwarded-For hop to simulate a source IP.
async function post(app, path, body, xff) {
  const headers = { 'Content-Type': 'application/json' };
  if (xff !== undefined) {
    headers['X-Forwarded-For'] = xff;
  }
  const response = await fetch(app.base + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body === undefined ? {} : body)
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (error) {
    // non-JSON body: keep null
  }
  return { status: response.status, json, headers: response.headers };
}

// Issue a challenge through the endpoint and grind the proof Node-side.
async function challengeFor(app) {
  const result = await post(app, '/api/challenge', {});
  assert.equal(result.status, 200);
  const c = JSON.parse(result.json.body);
  const proof = solveProof(c.nonce, c.k);
  assert.notEqual(proof, null, 'server-side proof solve failed');
  return { nonce: c.nonce, proof };
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function main() {
  // --- single-note clobber: the per-note cap bounds one note (any IP) ---
  await test('single-note clobber: per-note cap bounds one note', async function () {
    const dir = mkdtempSync(join(tmpdir(), 'pn-abuse-note-'));
    const limitsFile = join(dir, 'limits.json');
    writeFileSync(limitsFile, JSON.stringify({ perNote: { windowMs: 60000, maxWrites: 3 } }));
    const app = await startApp({ limitsFile, limitsWatchMs: 150 });
    try {
      const bot = '10.0.0.1';
      // A bot hammers one note: 3 writes get through (the cap), the 4th stops.
      for (let i = 0; i < 3; i += 1) {
        const bits = await challengeFor(app);
        const save = await post(app, '/api/save2', {
          id: 'clobber',
          ct: 'bot-write-' + i,
          challenge: bits.nonce,
          proof: bits.proof
        }, bot);
        assert.equal(save.status, 200, 'accepted clobber write ' + (i + 1));
      }
      const bits = await challengeFor(app);
      const limited = await post(app, '/api/save2', {
        id: 'clobber',
        ct: 'bot-write-3',
        challenge: bits.nonce,
        proof: bits.proof
      }, bot);
      assert.equal(limited.status, 429, '4th clobber write is rate-limited');
      assert.equal(limited.json.body, 'rate limited');
      const retryAfter = Number(limited.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1, 'Retry-After >= 1s');

      // The note is bounded: it holds the 3rd accepted write, not the 4th.
      const get = await post(app, '/api/get2', { id: 'clobber' });
      assert.equal(JSON.parse(get.json.body).ct, 'bot-write-2');

      // The per-note cap protects the note from ANYONE, not just the bot:
      // a different source IP is also blocked on the capped note.
      const otherBits = await challengeFor(app);
      const other = await post(app, '/api/save2', {
        id: 'clobber',
        ct: 'other-write',
        challenge: otherBits.nonce,
        proof: otherBits.proof
      }, '10.0.0.2');
      assert.equal(other.status, 429, 'a different IP is also blocked on the capped note');
      assert.equal(other.json.body, 'rate limited');
    } finally {
      await app.stop();
    }
  });

  // --- multi-note spray: the per-IP cap bounds one source, then lifts ---
  await test('multi-note spray: per-IP cap bounds one source, then hot-reload lifts it', async function () {
    const dir = mkdtempSync(join(tmpdir(), 'pn-abuse-ip-'));
    const limitsFile = join(dir, 'limits.json');
    writeFileSync(limitsFile, JSON.stringify({
      perIp: { windowMs: 60000, maxWrites: 5 },
      perNote: { windowMs: 60000, maxWrites: 100 }
    }));
    const app = await startApp({ limitsFile, limitsWatchMs: 150 });
    try {
      const bot = '10.0.0.1';
      // A bot sprays 5 different notes from one IP: all 5 get through (the cap).
      for (let i = 0; i < 5; i += 1) {
        const bits = await challengeFor(app);
        const save = await post(app, '/api/save2', {
          id: 'spray-' + i,
          ct: 'bot-spray-' + i,
          challenge: bits.nonce,
          proof: bits.proof
        }, bot);
        assert.equal(save.status, 200, 'accepted spray write ' + (i + 1));
      }
      // The 6th note from the same IP is stopped by the per-IP cap.
      const bits = await challengeFor(app);
      const limited = await post(app, '/api/save2', {
        id: 'spray-5',
        ct: 'bot-spray-5',
        challenge: bits.nonce,
        proof: bits.proof
      }, bot);
      assert.equal(limited.status, 429, '6th spray write is rate-limited');
      assert.equal(limited.json.body, 'rate limited');
      const retryAfter = Number(limited.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1, 'Retry-After >= 1s');

      // The cap is per-source, not global: a different IP can still write.
      const otherBits = await challengeFor(app);
      const other = await post(app, '/api/save2', {
        id: 'spray-5',
        ct: 'other-spray',
        challenge: otherBits.nonce,
        proof: otherBits.proof
      }, '10.0.0.2');
      assert.equal(other.status, 200, 'a different IP is unaffected by the per-IP cap');

      // Recovery (ban, not brick): hot-reload lifts the per-IP cap; the same
      // bot IP can write again.
      unlinkSync(limitsFile);
      writeFileSync(limitsFile, JSON.stringify({
        perIp: { windowMs: 60000, maxWrites: 10 },
        perNote: { windowMs: 60000, maxWrites: 100 }
      }));
      let last;
      for (let i = 0; i < 50; i += 1) {
        const bits2 = await challengeFor(app);
        last = await post(app, '/api/save2', {
          id: 'spray-6',
          ct: 'bot-recover-' + i,
          challenge: bits2.nonce,
          proof: bits2.proof
        }, bot);
        if (last.status === 200) {
          break;
        }
        assert.equal(last.status, 429, 'still limited before reload lands');
        await sleep(150);
      }
      assert.equal(last.status, 200, 'hot-reloaded config lifts the per-IP cap');
    } finally {
      await app.stop();
    }
  });

  // --- PoW gate: a bot that skips PoW cannot write at all ---
  await test('PoW gate: a bot that skips PoW cannot write', async function () {
    const app = await startApp();
    try {
      const bot = '10.0.0.1';
      // No challenge/proof: the write is rejected before it can land.
      const noProof = await post(app, '/api/save2', {
        id: 'n',
        ct: 'ct'
      }, bot);
      assert.equal(noProof.status, 401, 'a write with no proof is rejected');
      assert.equal(noProof.json.body, 'proof required');

      // And the note was NOT written (the gate held).
      const get = await post(app, '/api/get2', { id: 'n' });
      assert.equal(get.json.body, undefined, 'the note was not created');
    } finally {
      await app.stop();
    }
  });

  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  // Explicit exit: undici (global fetch) keep-alive sockets would otherwise
  // keep the process alive after every app above has stopped.
  process.exit(failed > 0 ? 1 : 0);
}

main();
