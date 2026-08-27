// Attacker simulation: run `npm run test:attacker`.
// Simulates a REAL attacker — a bot that solves the PoW and writes notes — and
// measures the TRUE COST of attacking. Proves the defenses actually kick in:
//
//   1. PoW cost curve: the per-write cost at each difficulty k. A proof at
//      difficulty k needs ~16^k = 2^(4k) SHA-256 digests on average. At k=8
//      that is ~4.3 billion digests — minutes per write on a normal machine.
//      This is the "true cost to attacking": a sustained attack is throttled
//      to near-zero.
//   2. Distributed attack: many bot IPs push the global write rate up; the
//      adaptive PoW ramps k (1 -> 2 -> 4 -> 8) as the accepted-write rate
//      climbs past busyAt / floodAt, so the attacker's per-write cost explodes
//      exactly when the attack scales.
//
// The PoW is a CLIENT-SIDE throttle: the attacker pays it on their own
// machine, and the server cost per write stays ~constant (one SHA-256 + k hex
// checks), so the VPS is not the thing being protected here. The per-IP /
// per-note rate caps (proven by scripts/abuse-sim.mjs) are the SERVER-SIDE
// defense that bounds the VPS. Together: attacking is expensive (PoW) and
// bounded (caps).
//
// Runs the mock backend (backend/server.js createApp) over real HTTP,
// simulating distinct source IPs via X-Forwarded-For (clientIp takes the
// first hop). Mirrors the scripts/pow-limits.mjs + scripts/abuse-sim.mjs
// harnesses.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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

// --- Part 1: the PoW cost curve (the "true cost per write") ---
// Time N SHA-256 digests to get this machine's hash rate, then the expected
// per-write cost at each k (16^k digests on average). k=8 is ~minutes.
function measureHashRate(n) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i += 1) {
    createHash('sha256').update('nonce:' + i, 'utf8').digest('hex');
  }
  const t1 = process.hrtime.bigint();
  return n / (Number(t1 - t0) / 1e9);
}

function fmtDuration(ms) {
  if (ms < 1) {
    return (ms * 1000).toFixed(1) + ' µs';
  }
  if (ms < 1000) {
    return ms.toFixed(1) + ' ms';
  }
  if (ms < 60000) {
    return (ms / 1000).toFixed(1) + ' s';
  }
  return (ms / 60000).toFixed(1) + ' min';
}

function powCostCurve() {
  const hashRate = measureHashRate(1000000);
  const curve = [];
  for (const k of [1, 2, 4, 8]) {
    const expectedHashes = 2 ** (4 * k);
    const expectedMs = (expectedHashes / hashRate) * 1000;
    curve.push({ k, expectedHashes, expectedMs });
  }
  return { hashRate, curve };
}

// --- Part 2: the distributed attack (the PoW ramp kicks in) ---
// 30 bot IPs x 10 notes = 300 accepted writes, which hits floodAt=300 and
// ramps the next challenge to k=8. High caps isolate the PoW ramp (the caps
// are proven separately by abuse-sim.mjs). Real PoW thresholds.
async function distributedAttack() {
  const dir = mkdtempSync(join(tmpdir(), 'pn-attacker-'));
  const limitsFile = join(dir, 'limits.json');
  writeFileSync(limitsFile, JSON.stringify({
    perIp: { windowMs: 60000, maxWrites: 1000000 },
    perNote: { windowMs: 60000, maxWrites: 1000000 },
    pow: { quietAt: 10, busyAt: 60, floodAt: 300 }
  }));
  const app = await startApp({ limitsFile });
  try {
    const kHistory = [];
    let totalSolveMs = 0;
    const t0 = Date.now();
    for (let i = 0; i < 300; i += 1) {
      const ip = '10.9.' + Math.floor(i / 10) + '.' + (i % 10 + 1);
      const note = 'note-' + i;
      const challenge = await post(app, '/api/challenge', {}, ip);
      const c = JSON.parse(challenge.json.body);
      const tSolve0 = Date.now();
      const proof = solveProof(c.nonce, c.k);
      totalSolveMs += Date.now() - tSolve0;
      const save = await post(app, '/api/save2', {
        id: note,
        ct: 'ct',
        challenge: c.nonce,
        proof
      }, ip);
      assert.equal(save.status, 200, 'accepted write ' + (i + 1));
      kHistory.push(c.k);
    }
    const totalMs = Date.now() - t0;
    // After 300 accepted writes the global rate is at flood: the next
    // challenge is minted at k=8.
    const next = await post(app, '/api/challenge', {}, '10.9.99.1');
    const nextK = JSON.parse(next.json.body).k;
    assert.equal(nextK, 8, 'the next challenge is at k=8 (flood)');
    return { kHistory, totalSolveMs, totalMs, nextK };
  } finally {
    await app.stop();
  }
}

async function main() {
  // --- Part 1: the PoW cost curve ---
  await test('PoW cost curve: per-write cost climbs with k', function () {
    const { hashRate, curve } = powCostCurve();
    console.log('');
    console.log('=== PoW cost curve (the "true cost per write") ===');
    console.log('measured hash rate: ' + Math.round(hashRate).toLocaleString() + ' SHA-256/sec');
    for (const row of curve) {
      console.log('  k=' + row.k + ': ~' + row.expectedHashes.toLocaleString() +
        ' digests ≈ ' + fmtDuration(row.expectedMs) + ' per write');
    }
    // The cost must climb monotonically; k=8 must be orders of magnitude
    // more expensive than k=1 (the "true cost" of a sustained attack).
    assert.ok(curve[1].expectedMs > curve[0].expectedMs, 'k=2 costs more than k=1');
    assert.ok(curve[2].expectedMs > curve[1].expectedMs, 'k=4 costs more than k=2');
    assert.ok(curve[3].expectedMs > curve[2].expectedMs, 'k=8 costs more than k=4');
    assert.ok(curve[3].expectedMs / curve[0].expectedMs > 1000,
      'k=8 is >1000x the cost of k=1');
  });

  // --- Part 2: the distributed attack ---
  await test('distributed attack: the PoW ramp kicks in at flood', async function () {
    const result = await distributedAttack();
    const counts = { 1: 0, 2: 0, 4: 0, 8: 0 };
    for (const k of result.kHistory) {
      counts[k] += 1;
    }
    console.log('');
    console.log('=== Distributed attack (the PoW ramp kicks in) ===');
    console.log('300 writes (30 IPs x 10 notes), real thresholds (busyAt=60, floodAt=300):');
    console.log('  k ramp: 1 (x' + counts[1] + ') -> 2 (x' + counts[2] + ') -> 4 (x' + counts[4] + ')');
    console.log('  total PoW solve time: ' + fmtDuration(result.totalSolveMs));
    console.log('  total wall time:      ' + fmtDuration(result.totalMs));
    console.log('  next challenge:       k=' + result.nextK + ' (flood)');
    // The ramp must have climbed through the quiet/calm/busy bands.
    assert.equal(counts[1], 10, 'first 10 writes are quiet (k=1)');
    assert.equal(counts[2], 50, 'next 50 writes are calm (k=2)');
    assert.equal(counts[4], 240, 'remaining 240 writes are busy (k=4)');
    assert.equal(result.nextK, 8, 'after flood the next challenge is k=8');
  });

  // --- The "true cost" report ---
  await test('true cost: a sustained attack is throttled to near-zero', async function () {
    const { curve } = powCostCurve();
    const k8 = curve[3];
    const attack = await distributedAttack();
    // The attacker reached flood (300 writes) in `attack.totalMs`. Every
    // write AFTER that is minted at k=8, costing ~k8.expectedMs each. A
    // 1000-write attack is 300 fast writes + 700 writes at k=8.
    const tailWrites = 700;
    const tailMs = tailWrites * k8.expectedMs;
    console.log('');
    console.log('=== The "true cost" to attacking ===');
    console.log('reached flood (300 writes) in ' + fmtDuration(attack.totalMs) +
      '; every write after that is minted at k=8.');
    console.log('a 1000-write attack = 300 fast writes + ' + tailWrites +
      ' writes at k=8 ≈ ' + fmtDuration(tailMs) + ' of grinding.');
    console.log('=> the attack is throttled to ~' +
      Math.round(1000 / (tailMs / 60000)) + ' writes/min once k=8 kicks in.');
    // The tail must dominate: the attack cannot be sustained.
    assert.ok(tailMs > attack.totalMs * 100,
      'the k=8 tail dwarfs the time to reach flood');
  });

  console.log('');
  console.log(passed + ' passed, ' + failed + ' failed');
  // Explicit exit: undici (global fetch) keep-alive sockets would otherwise
  // keep the process alive after every app above has stopped.
  process.exit(failed > 0 ? 1 : 0);
}

main();
