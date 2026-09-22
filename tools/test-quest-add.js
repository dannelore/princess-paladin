#!/usr/bin/env node
/* Tests for tools/quest-add.js — the script that writes into the live quest
   log. It runs against a stand-in for the Firestore REST surface, started
   in-process on a spare port, so nothing here touches the real thing.

   What's actually being pinned down: that a write only ever changes the one
   field it was asked to change, that entries already in the log come back
   out untouched (including fields this script has never heard of), and that
   losing a race with the board is retried rather than steamrollered.

   No dependencies: `node tools/test-quest-add.js`. */

const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run_ = promisify(execFile);
const { encode } = require(path.join(__dirname, 'quest-add.js'));

const SCRIPT = path.join(__dirname, 'quest-add.js');

/* ---------- the stand-in ---------- */
function makeDoc(){
  const todo = (id, title, extra) => encode(Object.assign({
    id, title, subs:[], created:'2026-09-01', done:false, doneDate:null,
    difficulty:3, priority:'medium', tag:null, due:null
  }, extra || {}));

  /* one existing entry carries fields the script doesn't know about, and a
     float — both must survive a write verbatim */
  const oddity = todo('old2', 'Post the Etsy orders', { difficulty:3, tag:'t-etsy' });
  oddity.mapValue.fields.legacyThing = { stringValue:'keep me' };
  oddity.mapValue.fields.someFloat = { doubleValue:1.5 };

  return {
    updateTime: '2026-09-21T10:00:00.000000Z',
    fields: {
      tags: encode([
        { id:'t-home', name:'Home', color:'#8FA37E' },
        { id:'t-etsy', name:'Etsy', color:'#9C7440' },
        { id:'t-wedding', name:'Wedding', color:'#E87CA6' }
      ]),
      todos: { arrayValue: { values: [ todo('old1', 'Hoover the stairs', { difficulty:2, tag:'t-home' }), oddity ] } },
      dailies: { arrayValue: {} },
      projects: { arrayValue: {} },
      level: { integerValue:'7' },
      gold: { integerValue:'42' },
      pets: encode([{ id:'p1', name:'Lord Woodrow', xp:120 }])
    }
  };
}

let db, interfere, server, endpoint;

function start(){
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const doc = url.pathname.split('/').pop();
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type':'application/json' }); res.end(JSON.stringify(obj)); };
      if(doc !== 'danni-quest-log') return send(404, { error:'no such document' });

      if(req.method === 'GET'){
        const masks = url.searchParams.getAll('mask.fieldPaths');
        const fields = {};
        (masks.length ? masks : Object.keys(db.fields)).forEach(f => { if(db.fields[f] !== undefined) fields[f] = db.fields[f]; });
        return send(200, { fields, updateTime: db.updateTime });
      }
      if(req.method === 'PATCH'){
        let body = '';
        req.on('data', d => { body += d; });
        return req.on('end', () => {
          /* the board saving in the gap between the script's read and write */
          if(interfere > 0){
            interfere--;
            db.fields.todos.arrayValue.values.push(encode({ id:'from-the-browser', title:'Typed on the board', done:false, difficulty:3 }));
            db.updateTime = new Date(Date.now() + 5000).toISOString();
          }
          const pre = url.searchParams.get('currentDocument.updateTime');
          if(!pre) return send(400, { error:{ message:'refusing a write with no precondition' } });
          if(pre !== db.updateTime) return send(400, { error:{ status:'FAILED_PRECONDITION', message:'the stored version does not match the required base version' } });

          const masks = url.searchParams.getAll('updateMask.fieldPaths');
          if(!masks.length) return send(400, { error:{ message:'refusing a maskless write' } });
          const incoming = JSON.parse(body).fields || {};
          const strays = Object.keys(incoming).filter(f => !masks.includes(f));
          if(strays.length) return send(400, { error:{ message:'fields outside the mask: ' + strays } });

          masks.forEach(f => { db.fields[f] = incoming[f]; });
          db.updateTime = new Date(Date.now() + 1000).toISOString();
          return send(200, { fields: db.fields, updateTime: db.updateTime });
        });
      }
      send(405, { error:'no' });
    }).listen(0, () => {
      endpoint = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
}

/* Async on purpose: the stand-in server shares this process, so a blocking
   execFileSync here would deadlock against the child's own requests. */
async function run(args, stdin){
  const child = run_(process.execPath, [SCRIPT, ...args], {
    env: Object.assign({}, process.env, { PP_FIRESTORE_ENDPOINT: endpoint }),
    encoding: 'utf8'
  });
  child.child.stdin.end(stdin || '');
  const { stdout } = await child;
  return JSON.parse(stdout);
}
function titles(){
  return db.fields.todos.arrayValue.values.map(v => v.mapValue.fields.title.stringValue);
}

let failed = 0, ran = 0;
function eq(label, got, want){
  ran++;
  if(JSON.stringify(got) === JSON.stringify(want)) return;
  failed++;
  console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
}

(async () => {
  await start();

  /* ---- context ---- */
  db = makeDoc(); interfere = 0;
  const ctx = await run(['context']);
  eq('context lists the tags', ctx.tags.map(t => t.name), ['Home', 'Etsy', 'Wedding']);
  eq('context counts what is open', ctx.columns.todos.open, 2);
  eq('context carries difficulties for calibration', ctx.columns.todos.items.map(i => i.difficulty), [2, 3]);
  eq('context names tags rather than ids', ctx.columns.todos.items[0].tag, 'Home');

  /* ---- a dry run changes nothing ---- */
  db = makeDoc(); interfere = 0;
  const before = JSON.stringify(db);
  const dry = await run(['add', '--dry-run'], 'Ring the florist !high #wedding @2026-12-01\n');
  eq('a dry run reports what it would add', dry.added.map(a => a.title), ['Ring the florist']);
  eq('a dry run writes nothing', JSON.stringify(db), before);

  /* ---- a real add ---- */
  db = makeDoc(); interfere = 0;
  const existing = JSON.stringify(db.fields.todos.arrayValue.values);
  const others = JSON.stringify(Object.keys(db.fields).filter(k => k !== 'todos').map(k => db.fields[k]));
  const added = await run(['add'], [
    'Ring the florist !high #wedding @2026-12-01',
    'Pack the studio boxes *4 #etsy',
    '  bubble wrap',
    '  tape',
    'Hoover the stairs'            // already open — must be skipped
  ].join('\n'));

  eq('it adds what is new', added.added.map(a => a.title), ['Ring the florist', 'Pack the studio boxes']);
  eq('it skips what is already open', added.skipped.map(s => s.title), ['Hoover the stairs']);
  eq('difficulty comes back as a word', added.added[1].difficulty, 'Hard');
  eq('tags come back by name', added.added[0].tag, 'Wedding');
  eq('the due date is parsed', added.added[0].due, '2026-12-01');
  eq('subtasks hang off the right to-do', added.added[1].subs, ['bubble wrap', 'tape']);
  eq('defaults fill the rest', [added.added[1].priority, added.added[1].due], ['medium', null]);

  eq('entries already there are untouched', JSON.stringify(db.fields.todos.arrayValue.values.slice(0, 2)), existing);
  eq('every other field is untouched', JSON.stringify(Object.keys(db.fields).filter(k => k !== 'todos').map(k => db.fields[k])), others);
  eq('the log grew by exactly two', titles().length, 4);

  /* ---- undo ---- */
  const undone = await run(added.undo.split(' ').slice(2));
  eq('undo removes exactly what it added', undone.removed.map(r => r.title), ['Ring the florist', 'Pack the studio boxes']);
  eq('and leaves the rest alone', titles(), ['Hoover the stairs', 'Post the Etsy orders']);
  eq('undoing twice is harmless', (await run(added.undo.split(' ').slice(2))).missing.length, 2);

  /* ---- losing a race with the board ---- */
  db = makeDoc(); interfere = 1;
  const raced = await run(['add'], 'Collect the suit hire !high #wedding\n');
  eq('the add still lands', raced.added.map(a => a.title), ['Collect the suit hire']);
  eq("the board's write survives", titles(), ['Hoover the stairs', 'Post the Etsy orders', 'Typed on the board', 'Collect the suit hire']);

  /* ---- a daily needs a repeat or it never comes up ---- */
  db = makeDoc(); interfere = 0;
  await run(['add', '--column', 'dailies'], 'Water the plants *1\n');
  const daily = db.fields.dailies.arrayValue.values[0].mapValue.fields;
  eq('a daily is given a repeat', daily.repeat.mapValue.fields.type.stringValue, 'weekdays');

  /* ---- tags ---- */
  db = makeDoc(); interfere = 0;
  eq('a new tag is created', (await run(['add-tag', '--name', 'Garden', '--color', '#8FA37E'])).tag.name, 'Garden');
  eq('an existing one is reported, not duplicated', Object.keys((await run(['add-tag', '--name', 'garden', '--color', '#111111'])).tag), ['existing']);
  eq('the tag list grew by one', db.fields.tags.arrayValue.values.length, 4);

  server.close();
  console.log(failed ? `\n${failed} of ${ran} failed` : `all ${ran} passed`);
  process.exit(failed ? 1 : 0);
})();
