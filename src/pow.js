// Promise API for the PoW solve, with a main-thread fallback when Web
// Workers are unavailable. The worker is a shared singleton; each call gets
// a unique id so a superseded solve (its autosave cycle was replaced by a
// newer one) is simply ignored by the caller.
import CryptoJS from 'crypto-js';

let worker = null;
let workerBroken = false;
let nextId = 1;

function getWorker() {
  if (worker !== null) {
    return worker;
  }
  worker = new Worker(new URL('./pow-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('error', function () {
    workerBroken = true;
  });
  return worker;
}

// Chunked main-thread solve: yield to the event loop between slices so the
// UI stays responsive and the deadline is actually honored.
function fallbackSolve(nonce, k, deadline) {
  const zeros = '0'.repeat(k);
  let start = 0;
  const SLICE = 50000;
  return new Promise(function (resolve) {
    function step() {
      if (deadline !== undefined && performance.now() > deadline) {
        resolve(null);
        return;
      }
      for (let i = start; i < start + SLICE; i += 1) {
        start = i + 1;
        if (CryptoJS.SHA256(nonce + ':' + i).toString().slice(0, k) === zeros) {
          resolve(String(i));
          return;
        }
      }
      if (deadline !== undefined && performance.now() > deadline) {
        resolve(null);
        return;
      }
      setTimeout(step, 0);
    }
    step();
  });
}

export function solvePowAsync(challenge, deadlineMs = 14000) {
  const deadline = performance.now() + deadlineMs;
  if (workerBroken || typeof Worker === 'undefined') {
    return fallbackSolve(challenge.nonce, challenge.k, deadline);
  }
  const id = nextId;
  nextId += 1;
  return new Promise(function (resolve) {
    let settled = false;
    const done = function (value) {
      if (settled) {
        return;
      }
      settled = true;
      worker.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = function (event) {
      const message = event.data;
      if (message === null || message.id !== id) {
        return;
      }
      if (!message.ok) {
        workerBroken = true;
      }
      done(message.ok ? message.proof : null);
    };
    worker.addEventListener('message', onMessage);
    try {
      getWorker().postMessage({ nonce: challenge.nonce, k: challenge.k, id, deadline });
    } catch (error) {
      workerBroken = true;
      done(null);
    }
  });
}
