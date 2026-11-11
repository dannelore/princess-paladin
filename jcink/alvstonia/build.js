// Puts skin.js inside the wrapper, ready to paste into Jcink.
//   node jcink/alvstonia/build.js
const fs = require('fs');
const path = require('path');
const here = f => path.join(__dirname, f);
const out = fs.readFileSync(here('wrapper.src.html'), 'utf8')
  .replace('/*SKIN_JS*/', () => fs.readFileSync(here('skin.js'), 'utf8').trim());
fs.writeFileSync(here('wrapper.html'), out);
console.log('wrote wrapper.html (' + out.length + ' characters)');
