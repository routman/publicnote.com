// Pure proof-of-work solver shared by the Web Worker and the main-thread
// fallback. Finds the smallest integer proof such that the hex digest of
// SHA-256(nonce + ':' + proof, utf8) begins with `k` zero hex chars.
// Mirrors backend/lib/pow.js so both sides verify the same rule.
import CryptoJS from 'crypto-js';

export function solvePow(nonce, k, options = {}) {
  const maxAttempts = options.maxAttempts || 1 << 20;
  const deadline = options.deadline;
  const zeros = '0'.repeat(k);
  const started = performance.now();
  for (let i = 0; i < maxAttempts; i += 1) {
    if (deadline !== undefined && performance.now() > deadline) {
      return null;
    }
    if (CryptoJS.SHA256(nonce + ':' + i).toString().slice(0, k) === zeros) {
      return { proof: String(i), attempts: i + 1, ms: Math.round(performance.now() - started) };
    }
  }
  return null;
}
