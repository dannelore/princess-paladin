/* Splits original.xml (a Jcink "Full" skin export) into separate files
   that are easier to edit: skin.css, wrapper.src.html and templates/*.html.
   Run once:  node jcink/if-it-kills-me/split.js
   It will not overwrite files that already exist. */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const xml = fs.readFileSync(path.join(here, 'original.xml'), 'utf8');

function between(open, close) {
  const a = xml.indexOf(open);
  const b = xml.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error('missing ' + open);
  return xml.slice(a + open.length, b);
}

function save(name, text) {
  const file = path.join(here, name);
  if (fs.existsSync(file)) {
    console.log('kept   ' + name);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n').trim() + '\n');
  console.log('wrote  ' + name);
}

save('skin.css', between('<stylesheet>', '</stylesheet>'));
save('wrapper.src.html', between('<wrappers>', '</wrappers>'));

const templates = between('<templates>', '</templates>');
const item = /<item name='([a-z_]+)'>([\s\S]*?)<\/item>/g;
let m;
while ((m = item.exec(templates))) {
  save('templates/' + m[1] + '.html', m[2]);
}
