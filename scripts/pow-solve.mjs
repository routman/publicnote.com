// Regression suite for the Web Worker PoW solver (src/pow.js).
//
// The historical bug this guards: the message listener was registered on the
// module-level `worker` *before* `getWorker()` ran, so the first save of
// every session rejected with
//   TypeError: Cannot read properties of null (reading 'addEventListener')
// and every subsequent save failed the same way (the module variable was
// never constructed). No DOM/browser is needed: a stub `Worker` runs the
// real src/pow.js wiring (worker path, broken-worker fallback, and the
// no-Worker main-thread path).
import { createHash } from 'node:crypto';

let failures = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) {
    failures++;
  }
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) {
    console.log('  expected: ' + expected);
    console.log('  actual:   ' + actual);
  }
}

function grindProof(nonce, k) {
  const zeros = '0'.repeat(k);
  for (let i = 0; i < 1 << 20; i += 1) {
    if (createHash('sha256').update(nonce + ':' + i, 'utf8').digest('hex').slice(0, k) === zeros) {
      return String(i);
    }
  }
  return null;
}

class WorkerStub {
  constructor(url, options) {
    WorkerStub.instances.push(this);
    WorkerStub.lastUrl = String(url);
    WorkerStub.lastOptions = options;
    this.messageListeners = [];
  }
  addEventListener(type, fn) {
    if (type === 'message') {
      this.messageListeners.push(fn);
    }
  }
  removeEventListener(type, fn) {
    if (type === 'message') {
      this.messageListeners = this.messageListeners.filter(function (f) {
        return f !== fn;
      });
    }
  }
  postMessage(data) {
    if (WorkerStub.throwOnPost) {
      throw new Error('simulated postMessage failure');
    }
    const proof = grindProof(data.nonce, data.k);
    const result = { id: data.id, ok: proof !== null, proof, attempts: 1 };
    if (proof !== null) {
      result.attempts = Number(proof) + 1;
    }
    setTimeout(() => {
      for (const fn of this.messageListeners.slice()) {
        fn({ data: result });
      }
    }, 0);
  }
}
WorkerStub.instances = [];
WorkerStub.lastUrl = null;
WorkerStub.lastOptions = null;
WorkerStub.throwOnPost = false;

globalThis.Worker = WorkerStub;

const mod = await import('../src/pow.js');

console.log('--- worker path (first call is the historical crash) ---');
const nonce = 'a3f1'.repeat(8);
const r1 = await mod.solvePowAsync({ nonce, k: 1 });
check('first call resolves a valid proof', r1, grindProof(nonce, 1));
check('first call constructed the worker', WorkerStub.instances.length, 1);
check('worker is a module-type worker', WorkerStub.lastOptions && WorkerStub.lastOptions.type, 'module');

const r2 = await mod.solvePowAsync({ nonce, k: 1 });
check('second call reuses the worker instance', WorkerStub.instances.length, 1);
check('second call resolves', r2 !== null, true);

console.log('--- broken postMessage -> main-thread fallback ---');
WorkerStub.throwOnPost = true;
const r3 = await mod.solvePowAsync({ nonce, k: 1 });
check('postMessage failure resolves null', r3, null);
const r4 = await mod.solvePowAsync({ nonce, k: 1 });
check('fallback solve after breakage', r4, grindProof(nonce, 1));
WorkerStub.throwOnPost = false;

console.log('--- worker constructor throws (fresh module instance) ---');
class ThrowingWorker {
  constructor() {
    throw new Error('simulated worker construction failure');
  }
}
globalThis.Worker = ThrowingWorker;
const modBroken = await import('../src/pow.js?pow-test-broken');
const r5 = await modBroken.solvePowAsync({ nonce, k: 1 });
check('constructor throw resolves null (no crash)', r5, null);
const r6 = await modBroken.solvePowAsync({ nonce, k: 1 });
check('subsequent call falls back to main thread', r6, grindProof(nonce, 1));

console.log('--- no Worker at all (fresh module instance) ---');
delete globalThis.Worker;
const modNoworker = await import('../src/pow.js?pow-test-noworker');
const r7 = await modNoworker.solvePowAsync({ nonce, k: 1 });
check('main-thread fallback without Worker', r7, grindProof(nonce, 1));

console.log('--- done ---');
console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
