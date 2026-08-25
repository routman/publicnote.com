// Phase 2 hardening regressions: run `npm run test:pow`.
// Exercises the mock backend (backend/server.js createApp) over real HTTP:
// challenge endpoint, PoW verification, version stamping, stale writes,
// rate/size caps, hot-reloadable limits, and the adaptive difficulty.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../backend/server.js';
import { PowController, solveProof, powDigest, hasKZeros } from '../backend/lib/pow.js';

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

async function post(app, path, body) {
  const response = await fetch(app.base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  // --- challenge endpoint shape ---
  await test('challenge shape', async function () {
    const app = await startApp();
    try {
      const result = await post(app, '/api/challenge', {});
      assert.equal(result.status, 200);
      const c = JSON.parse(result.json.body);
      assert.match(c.nonce, /^[0-9a-f]{32}$/);
      assert.ok(Number.isInteger(c.k) && c.k >= 1 && c.k <= 8, 'k in [1,8]');
      assert.ok(c.expires > Date.now(), 'expires in the future');
    } finally {
      await app.stop();
    }
  });

  // --- PoW verification ---
  await test('save2 without proof -> 401 proof required', async function () {
    const app = await startApp();
    try {
      const result = await post(app, '/api/save2', { id: 'n', ct: 'ct' });
      assert.equal(result.status, 401);
      assert.equal(result.json.body, 'proof required');
    } finally {
      await app.stop();
    }
  });

  await test('unknown challenge -> 401 challenge unknown', async function () {
    const app = await startApp();
    try {
      const result = await post(app, '/api/save2', {
        id: 'n',
        ct: 'ct',
        challenge: '0'.repeat(32),
        proof: '0'
      });
      assert.equal(result.status, 401);
      assert.equal(result.json.body, 'challenge unknown');
    } finally {
      await app.stop();
    }
  });

  await test('invalid proof -> 401 challenge invalid', async function () {
    const app = await startApp();
    try {
      const issued = JSON.parse((await post(app, '/api/challenge', {})).json.body);
      // Deterministic bad proof: find a value whose digest fails the check.
      let bad;
      for (let i = 0; i < 1000; i += 1) {
        bad = String(i);
        if (!hasKZeros(powDigest(issued.nonce, bad), issued.k)) {
          break;
        }
      }
      const result = await post(app, '/api/save2', {
        id: 'n',
        ct: 'ct',
        challenge: issued.nonce,
        proof: bad
      });
      assert.equal(result.status, 401);
      assert.equal(result.json.body, 'challenge invalid');
    } finally {
      await app.stop();
    }
  });

  await test('expired challenge -> 401 challenge expired', async function () {
    const dir = mkdtempSync(join(tmpdir(), 'pn-expire-'));
    const limitsFile = join(dir, 'limits.json');
    writeFileSync(limitsFile, JSON.stringify({ pow: { expiryMs: 60 } }));
    const app = await startApp({ limitsFile });
    try {
      const issued = JSON.parse((await post(app, '/api/challenge', {})).json.body);
      const proof = solveProof(issued.nonce, issued.k);
      assert.notEqual(proof, null);
      await sleep(100);
      const result = await post(app, '/api/save2', {
        id: 'n',
        ct: 'ct',
        challenge: issued.nonce,
        proof
      });
      assert.equal(result.status, 401);
      assert.equal(result.json.body, 'challenge expired');
    } finally {
      await app.stop();
    }
  });

  await test('challenge is one-time (replay -> unknown)', async function () {
    const app = await startApp();
    try {
      const first = await challengeFor(app);
      const ok = await post(app, '/api/save2', {
        id: 'n',
        ct: 'ct',
        challenge: first.nonce,
        proof: first.proof
      });
      assert.equal(ok.status, 200);
      const replay = await post(app, '/api/save2', {
        id: 'n',
        ct: 'ct2',
        challenge: first.nonce,
        proof: first.proof
      });
      assert.equal(replay.status, 401);
      assert.equal(replay.json.body, 'challenge unknown');
    } finally {
      await app.stop();
    }
  });

  // --- versioning ---
  await test('valid save stamps version 1; get2 echoes it', async function () {
    const app = await startApp();
    try {
      const bits = await challengeFor(app);
      const save = await post(app, '/api/save2', {
        id: 'alpha',
        ct: 'ct1',
        challenge: bits.nonce,
        proof: bits.proof
      });
      assert.equal(save.status, 200);
      assert.equal(save.json.body, 'successfully saved');
      assert.equal(save.json.version, 1);

      const get = await post(app, '/api/get2', { id: 'alpha' });
      const d = JSON.parse(get.json.body);
      assert.equal(d.ct, 'ct1');
      assert.equal(d.version, 1);
    } finally {
      await app.stop();
    }
  });

  await test('stale write -> 409 with current version', async function () {
    const app = await startApp();
    try {
      let bits = await challengeFor(app);
      const first = await post(app, '/api/save2', {
        id: 'alpha',
        ct: 'ct1',
        challenge: bits.nonce,
        proof: bits.proof
      });
      assert.equal(first.json.version, 1);

      bits = await challengeFor(app);
      const second = await post(app, '/api/save2', {
        id: 'alpha',
        ct: 'ct2',
        challenge: bits.nonce,
        proof: bits.proof,
        version: 1
      });
      assert.equal(second.status, 200);
      assert.equal(second.json.version, 2);

      bits = await challengeFor(app);
      const stale = await post(app, '/api/save2', {
        id: 'alpha',
        ct: 'ct3',
        challenge: bits.nonce,
        proof: bits.proof,
        version: 1 // lagging behind current (2)
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.json.body, 'stale write');
      assert.equal(stale.json.version, 2);
    } finally {
      await app.stop();
    }
  });

  await test('save without version is accepted', async function () {
    const app = await startApp();
    try {
      let bits = await challengeFor(app);
      await post(app, '/api/save2', {
        id: 'alpha',
        ct: 'ct1',
        challenge: bits.nonce,
        proof: bits.proof
      });
      bits = await challengeFor(app);
      const save = await post(app, '/api/save2', {
        id: 'alpha',
        ct: 'ct2',
        challenge: bits.nonce,
        proof: bits.proof
      });
      assert.equal(save.status, 200);
      assert.equal(save.json.version, 2);
    } finally {
      await app.stop();
    }
  });

  // --- base regressions ---
  await test('get2 for a missing note -> {}', async function () {
    const app = await startApp();
    try {
      const result = await post(app, '/api/get2', { id: 'never-saved' });
      assert.equal(result.status, 200);
      assert.equal(result.json.body, undefined);
    } finally {
      await app.stop();
    }
  });

  await test('400 on bad payloads', async function () {
    const app = await startApp();
    try {
      assert.equal((await post(app, '/api/save2', { id: 123, ct: 'x' })).status, 400);
      assert.equal((await post(app, '/api/save2', { id: 'n' })).status, 400);
      assert.equal((await post(app, '/api/get2', { id: 123 })).status, 400);
      const bits = await challengeFor(app);
      const badVersion = await post(app, '/api/save2', {
        id: 'n',
        ct: 'x',
        challenge: bits.nonce,
        proof: bits.proof,
        version: 'x'
      });
      assert.equal(badVersion.status, 400);
    } finally {
      await app.stop();
    }
  });

  // --- rate limits + hot reload ---
  await test('rate limit 429 with Retry-After, then hot reload lifts the cap', async function () {
    const dir = mkdtempSync(join(tmpdir(), 'pn-limits-'));
    const limitsFile = join(dir, 'limits.json');
    writeFileSync(limitsFile, JSON.stringify({ perNote: { windowMs: 60000, maxWrites: 2 } }));
    const app = await startApp({ limitsFile, limitsWatchMs: 150 });
    try {
      for (let i = 0; i < 2; i += 1) {
        const bits = await challengeFor(app);
        const save = await post(app, '/api/save2', {
          id: 'rate',
          ct: 'ct' + i,
          challenge: bits.nonce,
          proof: bits.proof
        });
        assert.equal(save.status, 200, 'accepted write ' + (i + 1));
      }
      const bits = await challengeFor(app);
      const limited = await post(app, '/api/save2', {
        id: 'rate',
        ct: 'ct2',
        challenge: bits.nonce,
        proof: bits.proof
      });
      assert.equal(limited.status, 429);
      assert.equal(limited.json.body, 'rate limited');
      const retryAfter = Number(limited.headers.get('retry-after'));
      assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1, 'Retry-After >= 1s');

      // Hot reload: raise the cap; the mtime poll should pick it up.
      unlinkSync(limitsFile);
      writeFileSync(limitsFile, JSON.stringify({ perNote: { windowMs: 60000, maxWrites: 10 } }));
      let last;
      for (let i = 0; i < 50; i += 1) {
        const bits2 = await challengeFor(app);
        last = await post(app, '/api/save2', {
          id: 'rate',
          ct: 'ct' + i,
          challenge: bits2.nonce,
          proof: bits2.proof
        });
        if (last.status === 200) {
          break;
        }
        assert.equal(last.status, 429, 'still limited before reload lands');
        await sleep(150);
      }
      assert.equal(last.status, 200, 'hot-reloaded config lifts the cap');
    } finally {
      await app.stop();
    }
  });

  await test('413 at maxCtChars', async function () {
    const dir = mkdtempSync(join(tmpdir(), 'pn-size-'));
    const limitsFile = join(dir, 'limits.json');
    writeFileSync(limitsFile, JSON.stringify({ maxCtChars: 50 }));
    const app = await startApp({ limitsFile });
    try {
      let bits = await challengeFor(app);
      const tooBig = await post(app, '/api/save2', {
        id: 'big',
        ct: 'c'.repeat(50),
        challenge: bits.nonce,
        proof: bits.proof
      });
      assert.equal(tooBig.status, 413);
      assert.equal(tooBig.json.body, 'note too large');

      bits = await challengeFor(app);
      const fits = await post(app, '/api/save2', {
        id: 'big',
        ct: 'c'.repeat(49),
        challenge: bits.nonce,
        proof: bits.proof
      });
      assert.equal(fits.status, 200);
    } finally {
      await app.stop();
    }
  });

  // --- enforcement toggle ---
  await test('enforcePow=false accepts saves without proof', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const result = await post(app, '/api/save2', { id: 'n', ct: 'ct' });
      assert.equal(result.status, 200);
      assert.equal(result.json.body, 'successfully saved');
      assert.equal(result.json.version, 1);
    } finally {
      await app.stop();
    }
  });

  // --- adaptive difficulty ---
  await test('adaptive k: quiet->1, calm->2, busy->4, flood->8', function () {
    const pow = new PowController();
    assert.equal(pow.kFor(), 1); // quiet (0 accepted writes)
    for (let i = 0; i < 15; i += 1) {
      pow.observe();
    }
    assert.equal(pow.kFor(), 2); // calm
    for (let i = 0; i < 50; i += 1) {
      pow.observe();
    }
    assert.equal(pow.kFor(), 4); // busy (65 total)
    for (let i = 0; i < 250; i += 1) {
      pow.observe();
    }
    assert.equal(pow.kFor(), 8); // flood (315 total)
  });

  await test('k=2 solve is fast and verifiable', function () {
    const nonce = '0123456789abcdef0123456789abcdef';
    const t0 = Date.now();
    const proof = solveProof(nonce, 2);
    const ms = Date.now() - t0;
    assert.notEqual(proof, null);
    assert.ok(hasKZeros(powDigest(nonce, proof), 2), 'digest has 2 zero nibbles');
    assert.ok(ms < 200, 'k=2 grind took ' + ms + 'ms (budget 200ms)');
  });

  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  // Explicit exit: undici (global fetch) keep-alive sockets would otherwise
  // keep the process alive after every app above has stopped.
  process.exit(failed > 0 ? 1 : 0);
}

main();
