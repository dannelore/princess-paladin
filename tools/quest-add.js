#!/usr/bin/env node
/* ==========================================================================
   Princess & Paladin — file to-dos into the quest log from a Claude session
   /tools/quest-add.js

   Driven by the /quest-add skill (.claude/skills/quest-add/SKILL.md): you
   paste a list at Claude, Claude works out titles, tags, difficulty and due
   dates, and hands them here as shorthand lines — the same grammar the
   quick-add panel on the board speaks, defined once in
   /assets/pp-shorthand.js.

     node tools/quest-add.js context [--who danni]
     node tools/quest-add.js add [--who danni] [--column todos] [--dry-run] < lines
     node tools/quest-add.js undo --ids id1,id2 [--who danni] [--column todos]
     node tools/quest-add.js add-tag --name "Garden" --color "#8FA37E" [--who danni]

   HOW IT WRITES, AND WHY IT'S WRITTEN THIS WAY

   One Firestore document holds a whole quest log: tasks, completions, XP,
   pets, wardrobe, coins. Rewriting that document to append a to-do would put
   everything else at risk for no reason, so this only ever PATCHes the one
   field it needs (todos, dailies, projects or tags) behind an updateMask.

   Within that field it keeps Firestore's own typed representation of the
   entries already there and appends newly encoded ones, rather than decoding
   and re-encoding what it found. An integer that came back as an integer
   goes back as an integer, and a field this script has never heard of
   survives untouched.

   Every write carries a currentDocument.updateTime precondition from the
   read that preceded it, so if the board is open in a browser and saves
   between our read and our write, the write is rejected rather than
   clobbering it — and we re-read and retry.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const PPShorthand = require(path.join(__dirname, '..', 'assets', 'pp-shorthand.js'));

/* The project and its client key are read out of assets/pp-firebase.js —
   the same public config every page on the site already ships — rather than
   copied here, so there's one place to change and no second copy to go
   stale. Access control is Firestore's rules, not the secrecy of this. */
function firebaseConfig(){
  const src = fs.readFileSync(path.join(__dirname, '..', 'assets', 'pp-firebase.js'), 'utf8');
  const read = field => {
    const m = src.match(new RegExp(field + ':\\s*"([^"]+)"'));
    if(!m) throw new Error(`No ${field} in assets/pp-firebase.js`);
    return m[1];
  };
  return { projectId: read('projectId'), apiKey: process.env.PP_FIREBASE_KEY || read('apiKey') };
}
const CONFIG = firebaseConfig();
/* Overridable so the test suite can point at a local stand-in. */
const ENDPOINT = process.env.PP_FIRESTORE_ENDPOINT ||
  `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents`;

const PEOPLE = { danni:'danni-quest-log', brendon:'brendon-quest-log' };
const COLUMNS = ['todos', 'dailies', 'projects'];
const PRIORITY_RANK = { urgent:0, high:1, medium:2, low:3 };
const DIFFICULTY_LABEL = { 1:'Trivial', 2:'Easy', 3:'Medium', 4:'Hard', 5:'Gruelling' };

/* ---------- Firestore typed values ---------- */
function encode(v){
  if(v === null || v === undefined) return { nullValue: null };
  if(typeof v === 'boolean') return { booleanValue: v };
  if(typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if(typeof v === 'string') return { stringValue: v };
  if(Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(encode) } : {} };
  const fields = {};
  Object.entries(v).forEach(([k, val]) => { fields[k] = encode(val); });
  return { mapValue: { fields } };
}
function decode(v){
  if(!v || typeof v !== 'object') return null;
  if('nullValue' in v) return null;
  if('booleanValue' in v) return v.booleanValue;
  if('integerValue' in v) return parseInt(v.integerValue, 10);
  if('doubleValue' in v) return v.doubleValue;
  if('stringValue' in v) return v.stringValue;
  if('timestampValue' in v) return v.timestampValue;
  if('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if('mapValue' in v){
    const out = {};
    Object.entries(v.mapValue.fields || {}).forEach(([k, val]) => { out[k] = decode(val); });
    return out;
  }
  return null;
}

function docUrl(who, params){
  const doc = PEOPLE[who];
  if(!doc) throw new Error(`Unknown person "${who}". Known: ${Object.keys(PEOPLE).join(', ')}`);
  const qs = new URLSearchParams(Object.assign({ key: CONFIG.apiKey }, params || {}));
  return `${ENDPOINT}/questlog/${doc}?${qs}`;
}
/* URLSearchParams would encode the repeated mask keys fine, but they have to
   repeat rather than collapse, so they're appended by hand. */
function withMasks(url, param, fields){
  return url + fields.map(f => `&${param}=${encodeURIComponent(f)}`).join('');
}

async function readFields(who, fields){
  const res = await fetch(withMasks(docUrl(who), 'mask.fieldPaths', fields));
  if(!res.ok) throw new Error(`Firestore read failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
  const doc = await res.json();
  return { updateTime: doc.updateTime, fields: doc.fields || {} };
}

/* Read → change → write, with the read's updateTime as a precondition. A
   rejected precondition means the log changed underneath us (the board is
   open somewhere), so the whole thing is retried against the new state
   rather than forced. */
async function patchField(who, field, mutate, { dryRun } = {}){
  for(let attempt = 1; attempt <= 5; attempt++){
    const { updateTime, fields } = await readFields(who, [field]);
    const current = (fields[field] && fields[field].arrayValue && fields[field].arrayValue.values) || [];
    const result = mutate(current.slice());
    if(!result || !result.values) return result;
    if(dryRun) return Object.assign({ dryRun: true }, result);

    const url = withMasks(
      docUrl(who, { 'currentDocument.updateTime': updateTime }),
      'updateMask.fieldPaths', [field]
    );
    const body = { fields: { [field]: { arrayValue: result.values.length ? { values: result.values } : {} } } };
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if(res.ok) return result;

    const text = await res.text();
    const stale = res.status === 400 || res.status === 409 || res.status === 412;
    if(stale && /precondition|updateTime|FAILED_PRECONDITION/i.test(text) && attempt < 5){
      await new Promise(r => setTimeout(r, 150 * attempt));
      continue;
    }
    throw new Error(`Firestore write failed (${res.status}): ${text.slice(0, 400)}`);
  }
  throw new Error('Firestore write kept losing a race with the board — try again with the log closed.');
}

/* ---------- ids ---------- */
function uid(){ return 'x' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

/* ---------- duplicate guard ----------
   Claude does the judgement call on near-duplicates; this is the backstop
   for the literal ones, so a list pasted twice by accident can't double up. */
function normalise(title){
  return String(title).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|to|my|our|and|for|of|please|need|needs|want|must)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- commands ---------- */

/* Everything Claude needs before it writes anything: the tag list to match
   against, what's already open (so it can skip duplicates), and — the point
   of it — the difficulties already on the board, so new items are rated the
   way this person rates things rather than on some generic scale. */
async function cmdContext(opts){
  const { fields } = await readFields(opts.who, ['tags', ...COLUMNS]);
  const tags = decode(fields.tags) || [];
  const tagName = id => (tags.find(t => t.id === id) || {}).name || null;

  const out = {
    who: opts.who,
    today: PPShorthand.dateKey(new Date()),
    tags: tags.map(t => ({ id:t.id, name:t.name, color:t.color })),
    shorthand: '!urgent|!high|!med|!low · *1–*5 or *easy|*hard|*gruelling · #tag · @today|@fri|@3d|@2w|@sep25|@2026-12-01',
    columns: {}
  };
  COLUMNS.forEach(col => {
    const items = decode(fields[col]) || [];
    const open = items.filter(t => !t.done);
    out.columns[col] = {
      open: open.length,
      /* Titles and difficulties, oldest first — this is the calibration
         sample. Capped so a long log doesn't bury the rest of the context. */
      items: open.slice(-60).map(t => ({
        title: t.title,
        difficulty: t.difficulty,
        priority: t.priority,
        tag: tagName(t.tag),
        due: t.due || null,
        subs: (t.subs || []).length
      })),
      recentlyDone: items.filter(t => t.done).slice(-25).map(t => ({ title: t.title, difficulty: t.difficulty }))
    };
  });
  return out;
}

async function cmdAdd(opts, text){
  const { fields } = await readFields(opts.who, ['tags', opts.column]);
  const tags = decode(fields.tags) || [];
  const existing = decode(fields[opts.column]) || [];
  const openTitles = new Map(existing.filter(t => !t.done).map(t => [normalise(t.title), t.title]));

  const today = PPShorthand.dateKey(new Date());
  const parsed = PPShorthand.parseLines(text, { today: new Date(), tags }, uid);
  if(!parsed.length) throw new Error('Nothing to add — no usable lines on stdin.');

  const skipped = [];
  const tasks = [];
  parsed.forEach(({ meta, subs }) => {
    const clash = openTitles.get(normalise(meta.title));
    if(clash){ skipped.push({ title: meta.title, reason: `already open as "${clash}"` }); return; }
    const task = {
      id: uid(),
      title: meta.title,
      subs,
      created: today,
      done: false,
      doneDate: null,
      difficulty: meta.difficulty || 3,
      priority: meta.priority || 'medium',
      tag: meta.tag || null,
      due: meta.due || null
    };
    /* Dailies are scheduled things; without a repeat they'd never come up. */
    if(opts.column === 'dailies') task.repeat = { type:'weekdays', days:[0,1,2,3,4,5,6] };
    tasks.push(task);
    openTitles.set(normalise(task.title), task.title);
  });

  if(!tasks.length) return { who: opts.who, column: opts.column, added: [], skipped };

  await patchField(opts.who, opts.column, values => ({
    values: values.concat(tasks.map(encode))
  }), { dryRun: opts.dryRun });

  const tagName = id => (tags.find(t => t.id === id) || {}).name || null;
  return {
    who: opts.who,
    column: opts.column,
    dryRun: !!opts.dryRun,
    added: tasks.map(t => ({
      id: t.id,
      title: t.title,
      difficulty: DIFFICULTY_LABEL[t.difficulty],
      priority: t.priority,
      tag: tagName(t.tag),
      due: t.due,
      subs: t.subs.map(s => s.title)
    })),
    skipped,
    undo: `node tools/quest-add.js undo --who ${opts.who} --column ${opts.column} --ids ${tasks.map(t => t.id).join(',')}`
  };
}

async function cmdUndo(opts){
  const ids = new Set(opts.ids);
  if(!ids.size) throw new Error('undo needs --ids id1,id2');
  const removed = [];
  await patchField(opts.who, opts.column, values => ({
    values: values.filter(v => {
      const task = decode(v) || {};
      if(!ids.has(task.id)) return true;
      removed.push({ id: task.id, title: task.title });
      return false;
    })
  }), { dryRun: opts.dryRun });
  const missing = [...ids].filter(id => !removed.some(r => r.id === id));
  return { who: opts.who, column: opts.column, removed, missing };
}

/* Only ever called once you've said yes to a proposed tag — the skill is not
   allowed to invent tags on its own. */
async function cmdAddTag(opts){
  if(!opts.name) throw new Error('add-tag needs --name');
  if(!/^#[0-9a-fA-F]{6}$/.test(opts.color || '')) throw new Error('add-tag needs --color as #rrggbb');
  let created = null;
  await patchField(opts.who, 'tags', values => {
    const clash = values.map(decode).find(t => String(t.name).toLowerCase() === opts.name.toLowerCase());
    if(clash){ created = { existing: clash }; return null; }
    created = { id: 't-' + opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: opts.name, color: opts.color };
    return { values: values.concat(encode(created)) };
  }, { dryRun: opts.dryRun });
  return { who: opts.who, tag: created };
}

/* ---------- cli ---------- */
function parseArgs(argv){
  const opts = { who:'danni', column:'todos', dryRun:false, ids:[] };
  const rest = [];
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a === '--who') opts.who = String(argv[++i]).toLowerCase();
    else if(a === '--column') opts.column = String(argv[++i]).toLowerCase();
    else if(a === '--ids') opts.ids = String(argv[++i]).split(',').map(s => s.trim()).filter(Boolean);
    else if(a === '--name') opts.name = argv[++i];
    else if(a === '--color') opts.color = argv[++i];
    else if(a === '--file') opts.file = argv[++i];
    else if(a === '--dry-run') opts.dryRun = true;
    else rest.push(a);
  }
  if(!PEOPLE[opts.who]) throw new Error(`Unknown --who "${opts.who}". Known: ${Object.keys(PEOPLE).join(', ')}`);
  if(!COLUMNS.includes(opts.column)) throw new Error(`Unknown --column "${opts.column}". Known: ${COLUMNS.join(', ')}`);
  return { opts, rest };
}
function readStdin(){
  return new Promise(resolve => {
    if(process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', d => { data += d; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main(){
  const { opts, rest } = parseArgs(process.argv.slice(2));
  const cmd = rest[0];
  let result;
  if(cmd === 'context')      result = await cmdContext(opts);
  else if(cmd === 'add')     result = await cmdAdd(opts, opts.file ? fs.readFileSync(opts.file, 'utf8') : await readStdin());
  else if(cmd === 'undo')    result = await cmdUndo(opts);
  else if(cmd === 'add-tag') result = await cmdAddTag(opts);
  else {
    console.error('Usage: quest-add.js context|add|undo|add-tag [--who danni] [--column todos] [--dry-run]');
    process.exit(2);
  }
  console.log(JSON.stringify(result, null, 2));
}

if(require.main === module){
  main().catch(err => { console.error(String(err.message || err)); process.exit(1); });
}
module.exports = { encode, decode, normalise, PEOPLE, COLUMNS, PRIORITY_RANK };
