// Phase 6 admin regressions: run `npm run test:admin`.
// Exercises the CIDR-gated admin endpoints on the mock backend over real HTTP:
// the admin gate (trustProxy on/off, forged XFF has no effect), the readonly
// toggle, block / unblock, purge, the audit ring (tail + clamp), and
// set-limits (in-memory apply, full-file rewrite, and live effect on saves).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../backend/server.js';
import { isAllowedAdminIp, noteIdOf } from '../backend/lib/admin.js';

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

async function post(app, path, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json' };
  if (extraHeaders) {
    for (const key of Object.keys(extraHeaders)) {
      headers[key] = extraHeaders[key];
    }
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
    json = null;
  }
  return { status: response.status, json, headers: response.headers };
}

// Admin endpoints wrap their payload as res.json({ body: JSON.stringify(x) });
// error/shape endpoints use a plain string body. Parse the string when it is
// JSON, otherwise keep the raw value.
function bodyOf(result) {
  const b = result.json && result.json.body;
  if (typeof b !== 'string') {
    return b;
  }
  try {
    return JSON.parse(b);
  } catch (error) {
    return b;
  }
}

async function main() {
  // --- admin gate ---
  await test('admin gate: 403 for a disallowed source ip (trustProxy, XFF 8.8.8.8)', async function () {
    const app = await startApp({ trustProxy: true });
    try {
      const result = await post(app, '/api/admin/stats', {}, { 'X-Forwarded-For': '8.8.8.8' });
      assert.equal(result.status, 403);
      assert.equal(bodyOf(result), 'forbidden');
    } finally {
      await app.stop();
    }
  });

  await test('admin gate: 200 for a loopback source ip (trustProxy, XFF 127.0.0.1)', async function () {
    const app = await startApp({ trustProxy: true });
    try {
      const result = await post(app, '/api/admin/stats', {}, { 'X-Forwarded-For': '127.0.0.1' });
      assert.equal(result.status, 200);
      assert.equal(typeof bodyOf(result).notes, 'number');
    } finally {
      await app.stop();
    }
  });

  await test('admin gate: forged public XFF is ignored when trustProxy is off', async function () {
    const app = await startApp(); // trustProxy false -> the socket peer is authoritative
    try {
      const result = await post(app, '/api/admin/stats', {}, { 'X-Forwarded-For': '8.8.8.8' });
      // Socket peer is 127.0.0.1 (allowed); the forged header must not change the decision.
      assert.equal(result.status, 200);
    } finally {
      await app.stop();
    }
  });

  await test('gate ip: dual-stack ::ffff:a.b.c.d peers are judged as their ipv4', async function () {
    // Node reports ipv4 peers on a dual-stack socket as ::ffff:a.b.c.d;
    // loopback dev and caddy-terminated prod must keep working.
    assert.equal(isAllowedAdminIp('::ffff:127.0.0.1'), true);
    assert.equal(isAllowedAdminIp('::ffff:10.0.0.5'), true);
    assert.equal(isAllowedAdminIp('::ffff:100.64.1.1'), true);
    assert.equal(isAllowedAdminIp('::ffff:8.8.8.8'), false);
    assert.equal(isAllowedAdminIp('::1'), true);
    assert.equal(isAllowedAdminIp('8.8.8.8'), false);

    const app = await startApp({ trustProxy: true });
    try {
      const result = await post(app, '/api/admin/stats', {}, { 'X-Forwarded-For': '::ffff:127.0.0.1' });
      assert.equal(result.status, 200, 'mapped loopback via xff is allowed');
      const denied = await post(app, '/api/admin/stats', {}, { 'X-Forwarded-For': '::ffff:8.8.8.8' });
      assert.equal(denied.status, 403, 'mapped public via xff is denied');
    } finally {
      await app.stop();
    }
  });

  // --- readonly ---
  await test('readonly: on blocks save2 with 403; off restores saves', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const on = await post(app, '/api/admin/readonly', { on: true });
      assert.equal(on.status, 200);
      assert.deepEqual(bodyOf(on), { ok: true, readonly: true });

      const denied = await post(app, '/api/save2', { id: 'n', ct: 'ct' });
      assert.equal(denied.status, 403);
      assert.equal(bodyOf(denied), 'read-only');

      const off = await post(app, '/api/admin/readonly', { on: false });
      assert.equal(off.status, 200);
      assert.deepEqual(bodyOf(off), { ok: true, readonly: false });

      const ok = await post(app, '/api/save2', { id: 'n', ct: 'ct' });
      assert.equal(ok.status, 200);
      assert.equal(bodyOf(ok), 'successfully saved');
    } finally {
      await app.stop();
    }
  });

  await test('readonly: bad payload -> 400', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const result = await post(app, '/api/admin/readonly', {});
      assert.equal(result.status, 400);
      assert.equal(bodyOf(result), 'bad request');
    } finally {
      await app.stop();
    }
  });

  // --- block / unblock ---
  await test('block/unblock: a blocked ip gets 429 on save2; unblock restores', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const block = await post(app, '/api/admin/block', { ip: '203.0.113.7' });
      assert.equal(block.status, 200);
      assert.equal(bodyOf(block).ok, true);
      assert.ok(bodyOf(block).blockedIps.includes('203.0.113.7'));

      const denied = await post(app, '/api/save2', { id: 'n', ct: 'ct' }, { 'X-Forwarded-For': '203.0.113.7' });
      assert.equal(denied.status, 429);
      assert.equal(bodyOf(denied), 'blocked');

      const unblock = await post(app, '/api/admin/unblock', { ip: '203.0.113.7' });
      assert.equal(unblock.status, 200);
      assert.deepEqual(bodyOf(unblock).blockedIps, []);

      const ok = await post(app, '/api/save2', { id: 'n', ct: 'ct' }, { 'X-Forwarded-For': '203.0.113.7' });
      assert.equal(ok.status, 200);
    } finally {
      await app.stop();
    }
  });

  await test('block: payload validation (400 on non-string / empty / >64 chars)', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      assert.equal((await post(app, '/api/admin/block', { ip: 123 })).status, 400);
      assert.equal((await post(app, '/api/admin/block', { ip: '' })).status, 400);
      assert.equal((await post(app, '/api/admin/block', { ip: 'x'.repeat(65) })).status, 400);
    } finally {
      await app.stop();
    }
  });

  await test('block: the server stores any well-formed string (no format check)', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const result = await post(app, '/api/admin/block', { ip: 'nope' });
      assert.equal(result.status, 200);
      assert.deepEqual(bodyOf(result).blockedIps, ['nope']);
    } finally {
      await app.stop();
    }
  });

  await test('block: a blocked ip is reflected in stats.blockedIps', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const block = await post(app, '/api/admin/block', { ip: '203.0.113.9' });
      assert.equal(block.status, 200);
      const stats = await post(app, '/api/admin/stats');
      assert.ok(bodyOf(stats).blockedIps.includes('203.0.113.9'));
    } finally {
      await app.stop();
    }
  });

  // --- purge ---
  await test('purge: deletes the note id derived from the title', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const id = noteIdOf('secret title');
      const save = await post(app, '/api/save2', { id: id, ct: 'ct' });
      assert.equal(save.status, 200);

      const purge = await post(app, '/api/admin/purge', { title: 'secret title' });
      assert.equal(purge.status, 200);
      const p = bodyOf(purge);
      assert.equal(p.deleted, true);
      assert.equal(p.id, id);

      const get = await post(app, '/api/get2', { id: id });
      assert.equal(get.status, 200);
      assert.equal(get.json.body, undefined); // note gone -> {}

      const again = await post(app, '/api/admin/purge', { title: 'secret title' });
      assert.equal(again.status, 200);
      assert.equal(bodyOf(again).deleted, false);
    } finally {
      await app.stop();
    }
  });

  await test('purge: bad payload -> 400', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      assert.equal((await post(app, '/api/admin/purge', {})).status, 400);
      assert.equal((await post(app, '/api/admin/purge', { title: 5 })).status, 400);
      assert.equal((await post(app, '/api/admin/purge', { title: '' })).status, 400);
    } finally {
      await app.stop();
    }
  });

  // --- audit ring ---
  await test('audit: returns recent entries and clamps n to the ring cap', async function () {
    const app = await startApp({ enforcePow: false, auditCap: 10 });
    try {
      for (let i = 0; i < 5; i += 1) {
        await post(app, '/api/save2', { id: 'a', ct: 'c' + i });
      }
      const small = await post(app, '/api/admin/audit', { n: 3 });
      assert.equal(small.status, 200);
      const tail = bodyOf(small);
      assert.ok(Array.isArray(tail));
      assert.equal(tail.length, 3);
      assert.equal(tail[tail.length - 1].action, 'save');

      const big = await post(app, '/api/admin/audit', { n: 9999 });
      const all = bodyOf(big);
      assert.ok(Array.isArray(all));
      assert.ok(all.length <= 10, 'clamped to the auditCap');
    } finally {
      await app.stop();
    }
  });

  // --- set-limits ---
  await test('set-limits: applies in memory and rewrites the limits file', async function () {
    const dir = mkdtempSync(join(tmpdir(), 'pn-admin-'));
    const limitsFile = join(dir, 'limits.json');
    const app = await startApp({ enforcePow: false, limitsFile, limitsWatchMs: 150 });
    try {
      const result = await post(app, '/api/admin/set-limits', { perNote: { maxWrites: 1 } });
      assert.equal(result.status, 200);
      const b = bodyOf(result);
      assert.equal(b.ok, true);
      assert.equal(b.cfg.perNote.maxWrites, 1);

      const onDisk = JSON.parse(readFileSync(limitsFile, 'utf8'));
      assert.equal(onDisk.perNote.maxWrites, 1);
      assert.ok(onDisk.perIp, 'full object: perIp present');
      assert.ok(onDisk.pow, 'full object: pow present');

      // The change took effect: the per-note cap is now 1 write / window.
      const first = await post(app, '/api/save2', { id: 's', ct: 'c1' });
      assert.equal(first.status, 200);
      const second = await post(app, '/api/save2', { id: 's', ct: 'c2' });
      assert.equal(second.status, 429);
      assert.equal(bodyOf(second), 'rate limited');

      const limits = await post(app, '/api/admin/limits', {});
      assert.equal(limits.status, 200);
      assert.equal(bodyOf(limits).perNote.maxWrites, 1);
    } finally {
      await app.stop();
    }
  });

  await test('set-limits: a non-object (array) patch is rejected by the handler', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      // A top-level JSON array passes express.json (strict allows arrays) but the
      // handler rejects it, so this exercises the admin 400 path with no server-side
      // body-parse error. (Bare null / string bodies are rejected earlier by
      // express.json strict mode.)
      const result = await post(app, '/api/admin/set-limits', [1, 2, 3]);
      assert.equal(result.status, 400);
      assert.equal(bodyOf(result), 'bad request');
    } finally {
      await app.stop();
    }
  });

  await test('set-limits: an empty patch is a valid no-op', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const result = await post(app, '/api/admin/set-limits', {});
      assert.equal(result.status, 200);
      assert.equal(bodyOf(result).ok, true);
    } finally {
      await app.stop();
    }
  });

  // --- stats shape ---
  await test('stats: returns the documented shape', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      const result = await post(app, '/api/admin/stats');
      assert.equal(result.status, 200);
      const s = bodyOf(result);
      assert.equal(typeof s.notes, 'number');
      assert.equal(typeof s.writes60s, 'number');
      assert.equal(typeof s.activeIps, 'number');
      assert.equal(typeof s.powK, 'number');
      assert.equal(typeof s.readonly, 'boolean');
      assert.ok(Array.isArray(s.blockedIps));
      assert.ok(s.freeDiskKb === null || typeof s.freeDiskKb === 'number');
      assert.equal(typeof s.uptimeS, 'number');
    } finally {
      await app.stop();
    }
  });

  // --- active writers + user-days ---
  await test('stats: activeIps counts unique writer IPs in the last minute', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      assert.equal(bodyOf(await post(app, '/api/admin/stats')).activeIps, 0);

      await post(app, '/api/save2', { id: 'n', ct: 'c' }, { 'X-Forwarded-For': '203.0.113.7' });
      await post(app, '/api/save2', { id: 'n', ct: 'c' }, { 'X-Forwarded-For': '203.0.113.8' });
      await post(app, '/api/save2', { id: 'n', ct: 'c' }, { 'X-Forwarded-For': '203.0.113.7' }); // same ip again

      assert.equal(bodyOf(await post(app, '/api/admin/stats')).activeIps, 2);
    } finally {
      await app.stop();
    }
  });

  await test('user-days: returns a zero-filled 30-day window', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      await post(app, '/api/save2', { id: 'n', ct: 'c' }, { 'X-Forwarded-For': '203.0.113.7' });

      const result = await post(app, '/api/admin/user-days', { days: 30 });
      assert.equal(result.status, 200);
      const days = bodyOf(result).days;
      assert.ok(Array.isArray(days));
      assert.equal(days.length, 30);
      for (let i = 1; i < days.length; i += 1) {
        assert.ok(days[i - 1].date < days[i].date, 'dates ascending');
      }
      for (const row of days) {
        assert.equal(typeof row.date, 'string');
        assert.equal(typeof row.uniqueIps, 'number');
        assert.equal(typeof row.writes, 'number');
      }
      const today = days[days.length - 1];
      assert.equal(today.uniqueIps, 1);
      assert.equal(today.writes, 1);
      for (let i = 0; i < days.length - 1; i += 1) {
        assert.equal(days[i].uniqueIps, 0);
        assert.equal(days[i].writes, 0);
      }
    } finally {
      await app.stop();
    }
  });

  await test('user-days: clamps days to 1..365 and defaults to 30', async function () {
    const app = await startApp({ enforcePow: false });
    try {
      assert.equal(bodyOf(await post(app, '/api/admin/user-days', { days: 0 })).days.length, 1);
      assert.equal(bodyOf(await post(app, '/api/admin/user-days', { days: 9999 })).days.length, 365);
      assert.equal(bodyOf(await post(app, '/api/admin/user-days', { days: 'x' })).days.length, 30);
      assert.equal(bodyOf(await post(app, '/api/admin/user-days', {})).days.length, 30);
    } finally {
      await app.stop();
    }
  });

  await test('user-days: 403 for a disallowed source ip', async function () {
    const app = await startApp({ trustProxy: true });
    try {
      const result = await post(app, '/api/admin/user-days', {}, { 'X-Forwarded-For': '8.8.8.8' });
      assert.equal(result.status, 403);
      assert.equal(bodyOf(result), 'forbidden');
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
