/* ==========================================================================
   Princess & Paladin — vault crypto
   /assets/pp-vault-crypto.js

   The small amount of encryption behind Holiday Quest's Plans and Gifts.

   WHY ENCRYPT AT ALL
   The site is static and its Firestore data is copied into the repo every
   night by .github/workflows/firestore-backup.yml. A password screen on its
   own would hide nothing: the gift list would sit in plain text in
   firestore_backups/ for anyone to read. So the private parts are stored
   only as AES-GCM ciphertext, and the password is what makes the key.

   HOW THE KEYS FIT TOGETHER
     shared key   one random key for Plans and the family-and-friends gifts.
                  Both of you hold it.
     own key      one random key per person, for that person's secret gift
                  list. Only they hold it.
     key bundle   { who, shared, own }, encrypted with a key stretched from
                  that person's password (PBKDF2-SHA256). One per person.

   Typing a password tries it against each bundle; the one that opens says
   who you are and hands over both keys. Changing your password makes a new
   own key, re-encrypts your secret list with it, and writes a new bundle —
   so anyone who knew the old password can't read anything written after.

   Pure WebCrypto, no DOM, no Firebase: it runs as a browser global
   (window.PPVaultCrypto) and as a Node module for tools/holiday-keys.js and
   tools/test-vault-crypto.js.
   ========================================================================== */
(function(root, factory){
  const api = factory(root.crypto || (typeof require === 'function' ? require('crypto').webcrypto : null));
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.PPVaultCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(webcrypto){
  "use strict";

  const subtle = webcrypto.subtle;
  /* Slow on purpose: each guess at a password costs this many hashes. A
     phone takes about a second per bundle, which is fine for an unlock. */
  const ITERATIONS = 310000;

  /* ---------- base64 ---------- */
  function toB64(bytes){
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for(let i = 0; i < u8.length; i += 0x8000){
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function fromB64(str){
    const s = atob(str);
    const u8 = new Uint8Array(s.length);
    for(let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  }

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const random = n => webcrypto.getRandomValues(new Uint8Array(n));

  /* ---------- keys ---------- */

  /* A fresh 256-bit key, as base64 raw bytes — the form bundles carry. */
  function newRawKey(){ return toB64(random(32)); }

  function importKey(rawB64){
    return subtle.importKey('raw', fromB64(rawB64), { name:'AES-GCM' }, false, ['encrypt','decrypt']);
  }

  async function passwordKey(password, saltB64, iterations){
    const base = await subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name:'PBKDF2', hash:'SHA-256', salt: fromB64(saltB64), iterations: iterations || ITERATIONS },
      base, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
  }

  /* ---------- sealing ---------- */

  /* Any JSON-able value -> { iv, ct }, both base64. */
  async function seal(key, value){
    const iv = random(12);
    const ct = await subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
    return { iv: toB64(iv), ct: toB64(ct) };
  }

  /* { iv, ct } -> the value. Throws on a wrong key or a tampered blob. */
  async function open(key, blob){
    const pt = await subtle.decrypt({ name:'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- bundles ---------- */

  /* { who, shared, own } locked under a password. */
  async function makeBundle(password, contents){
    const salt = toB64(random(16));
    const key  = await passwordKey(password, salt, ITERATIONS);
    const sealed = await seal(key, contents);
    return { salt, iter: ITERATIONS, iv: sealed.iv, ct: sealed.ct };
  }

  /* The bundle's contents, or null if the password doesn't open it. */
  async function openBundle(password, bundle){
    try{
      const key = await passwordKey(password, bundle.salt, bundle.iter);
      return await open(key, bundle);
    }catch(e){
      return null;
    }
  }

  return { ITERATIONS, toB64, fromB64, newRawKey, importKey, passwordKey,
           seal, open, makeBundle, openBundle };
});
