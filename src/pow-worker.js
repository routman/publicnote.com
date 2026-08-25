// Dedicated Web Worker for the PoW grind: offloads the SHA-256 search from
// the UI thread so autosave never blocks typing.
import { solvePow } from './pow-core.js';

self.onmessage = function (event) {
  const { nonce, k, id, maxAttempts, deadline } = event.data;
  const result = solvePow(nonce, k, { maxAttempts, deadline });
  // Keep the worker's own id: a superseded solve (new autosave cycle) simply
  // gets ignored by the caller.
  self.postMessage(result ? { id, ok: true, proof: result.proof, attempts: result.attempts } : { id, ok: false });
};
