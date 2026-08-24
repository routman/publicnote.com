import CryptoJS from 'crypto-js';

export function noteId(title) {
  return CryptoJS.SHA256(title).toString();
}

export function encryptNote(note, title) {
  return CryptoJS.AES.encrypt(note, title).toString();
}

export function decryptNote(ct, title) {
  return CryptoJS.AES.decrypt(ct.toString(), title).toString(CryptoJS.enc.Utf8);
}
