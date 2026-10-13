#!/usr/bin/env node
/* Tests for /assets/pp-vault-crypto.js, the encryption behind Holiday
   Quest's Plans and Gifts. No dependencies: `node tools/test-vault-crypto.js`. */

const fs = require('fs');
const path = require('path');
const V = require(path.join(__dirname, '..', 'assets', 'pp-vault-crypto.js'));

let failed = 0;
function check(name, ok){
  console.log((ok ? '  ok   ' : '  FAIL ') + name);
  if(!ok) failed++;
}

(async () => {
  const key = await V.importKey(V.newRawKey());
  const value = { plans:[{ id:'a', title:'Tree farm \u{1F384}', date:'2026-12-06' }], gifts:[] };

  const blob = await V.seal(key, value);
  check('seal gives base64 iv and ct', typeof blob.iv === 'string' && typeof blob.ct === 'string');
  check('ciphertext does not contain the plain text', !Buffer.from(blob.ct, 'base64').toString('latin1').includes('Tree farm'));
  check('open round-trips the value', JSON.stringify(await V.open(key, blob)) === JSON.stringify(value));

  const sealedTwice = await V.seal(key, value);
  check('sealing the same value twice uses a fresh iv', sealedTwice.iv !== blob.iv);

  const otherKey = await V.importKey(V.newRawKey());
  let threw = false;
  try{ await V.open(otherKey, blob); }catch(e){ threw = true; }
  check('the wrong key cannot open it', threw);

  const tampered = Object.assign({}, blob, { ct: blob.ct.slice(0, -4) + (blob.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') });
  threw = false;
  try{ await V.open(key, tampered); }catch(e){ threw = true; }
  check('a tampered blob is rejected', threw);

  const contents = { who:'danni', shared: V.newRawKey(), own: V.newRawKey() };
  const bundle = await V.makeBundle('correct horse battery', contents);
  check('bundle records its iteration count', bundle.iter === V.ITERATIONS);
  check('the right password opens the bundle',
        JSON.stringify(await V.openBundle('correct horse battery', bundle)) === JSON.stringify(contents));
  check('a wrong password gives null, not an error', (await V.openBundle('correct horse batter', bundle)) === null);

  /* The starter bundles shipped in the page must be well-formed. */
  const vaultJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pp-holiday-vault.js'), 'utf8');
  const starters = vaultJs.match(/(danni|brendon):\s*\{ salt:"[^"]+", iter:\d+,\s*iv:"[^"]+",\s*ct:"[^"]+" \}/g) || [];
  check('pp-holiday-vault.js ships a starter bundle for each of you', starters.length === 2);

  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
