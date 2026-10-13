#!/usr/bin/env node
/* Makes the starter key bundles for Holiday Quest's Plans and Gifts.

     node tools/holiday-keys.js "<danni's password>" "<brendon's password>"

   Prints a STARTER_KEYS block to paste over the one in
   /assets/pp-holiday-vault.js. The passwords themselves never go into the
   repo — only the bundles, which are useless without them. See
   /assets/pp-vault-crypto.js for how the keys fit together.

   RUN THIS ONCE. It makes brand-new keys, so anything already saved under
   the old ones can no longer be opened. After the first setup, each person
   changes their own password from the page (the "Change password" button
   once unlocked), which keeps everything readable. */

const path = require('path');
const V = require(path.join(__dirname, '..', 'assets', 'pp-vault-crypto.js'));

async function main(){
  const [danniPw, brendonPw] = process.argv.slice(2);
  if(!danniPw || !brendonPw){
    console.error('Usage: node tools/holiday-keys.js "<danni password>" "<brendon password>"');
    process.exit(1);
  }
  if(danniPw === brendonPw){
    console.error('The two passwords must be different — the password is how the page knows who you are.');
    process.exit(1);
  }

  const shared = V.newRawKey();
  const danni   = await V.makeBundle(danniPw,   { who:'danni',   shared, own: V.newRawKey() });
  const brendon = await V.makeBundle(brendonPw, { who:'brendon', shared, own: V.newRawKey() });

  const line = b => `{ salt:"${b.salt}", iter:${b.iter},\n             iv:"${b.iv}",\n             ct:"${b.ct}" }`;
  console.log('  const STARTER_KEYS = {');
  console.log('    danni:   ' + line(danni) + ',');
  console.log('    brendon: ' + line(brendon));
  console.log('  };');
}

main().catch(e => { console.error(e); process.exit(1); });
