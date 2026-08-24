import CryptoJS from 'crypto-js';
import { createHash, createDecipheriv } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureFile = join(here, 'fixture.json');

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

function sha256Node(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

function ensureFixture() {
  if (existsSync(fixtureFile)) {
    return JSON.parse(readFileSync(fixtureFile, 'utf8'));
  }
  const title = 'publicnote';
  const note = 'hello world';
  const ct = CryptoJS.AES.encrypt(note, title).toString();
  const fixture = { title, note, ct };
  writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2) + '\n');
  console.log('note: fixture missing, generated ' + fixtureFile);
  return fixture;
}

function evpBytesToKey(password, salt, keyLen, ivLen) {
  const pass = Buffer.from(password, 'utf8');
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  const total = keyLen + ivLen;
  while (derived.length < total) {
    const hash = createHash('md5');
    if (block.length > 0) {
      hash.update(block);
    }
    hash.update(pass);
    hash.update(salt);
    block = hash.digest();
    derived = Buffer.concat([derived, block]);
  }
  return { key: derived.subarray(0, keyLen), iv: derived.subarray(keyLen, total) };
}

function decryptLegacy(ctB64, password) {
  const buf = Buffer.from(ctB64, 'base64');
  if (buf.subarray(0, 8).toString('utf8') !== 'Salted__') {
    throw new Error('not a legacy OpenSSL-style ciphertext');
  }
  const salt = buf.subarray(8, 16);
  const { key, iv } = evpBytesToKey(password, salt, 32, 16);
  const data = buf.subarray(16);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

console.log('--- sha256 known vectors ---');
check('sha256("") crypto-js', CryptoJS.SHA256('').toString(), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('sha256("abc") crypto-js', CryptoJS.SHA256('abc').toString(), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('sha256("") node:crypto', sha256Node(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

console.log('--- note id cross-check (crypto-js vs node:crypto) ---');
const titles = ['publicnote', 'terms', 'about', 'suicide', 'hello world', 'Ünïcödé ✓'];
for (const title of titles) {
  check('id("' + title + '")', CryptoJS.SHA256(title).toString(), sha256Node(title));
}

console.log('--- aes round trip ---');
const roundTitle = 'publicnote';
const roundNote = 'the quick brown fox jumps over the lazy dog';
const roundCt = CryptoJS.AES.encrypt(roundNote, roundTitle).toString();
check('legacy ct prefix', roundCt.slice(0, 10), 'U2FsdGVkX1');
check('round trip', CryptoJS.AES.decrypt(roundCt, roundTitle).toString(CryptoJS.enc.Utf8), roundNote);
const emptyCt = CryptoJS.AES.encrypt('', roundTitle).toString();
check('round trip empty note', CryptoJS.AES.decrypt(emptyCt, roundTitle).toString(CryptoJS.enc.Utf8), '');

console.log('--- legacy fixture (independent node:crypto decrypt) ---');
const fixture = ensureFixture();
check('fixture legacy decrypt', decryptLegacy(fixture.ct, fixture.title), fixture.note);
check('fixture crypto-js decrypt', CryptoJS.AES.decrypt(fixture.ct, fixture.title).toString(CryptoJS.enc.Utf8), fixture.note);
check('fixture id', CryptoJS.SHA256(fixture.title).toString(), sha256Node(fixture.title));

console.log('--- done ---');
console.log(failures === 0 ? 'all checks passed' : failures + ' check(s) failed');
process.exit(failures === 0 ? 0 : 1);
