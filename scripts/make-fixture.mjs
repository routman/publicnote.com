import CryptoJS from 'crypto-js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const title = 'publicnote';
const note = 'hello world';
const ct = CryptoJS.AES.encrypt(note, title).toString();

const file = join(dirname(fileURLToPath(import.meta.url)), 'fixture.json');
writeFileSync(file, JSON.stringify({ title, note, ct }, null, 2) + '\n');
console.log('wrote ' + file);
console.log('id: ' + CryptoJS.SHA256(title).toString());
console.log('ct: ' + ct.slice(0, 40) + '...');
