/* ==========================================================================
   Princess & Paladin — quest log shared logic
   /assets/pp-quest.js

   Loaded by the board, the pets page and the monsters page.
   Owns: the Firestore store, the shape of state, dates, the payout maths,
   pet drawing, the wardrobe catalog, hunger, pet XP, Legend buffs, title
   fragments and monster damage.

   All three pages share one document, so anything that defines the shape of
   state belongs here rather than in a page.
   ========================================================================== */

const PQ = (function(){

/* ---------- stages ---------- */
const STAGES = [
  { key:'baby',   name:'Baby',   at:0,     dressable:false },
  { key:'child',  name:'Child',  at:800,   dressable:true  },
  { key:'teen',   name:'Teen',   at:2500,  dressable:true  },
  { key:'adult',  name:'Adult',  at:7200,  dressable:true  },
  { key:'legend', name:'Legend', at:18000, dressable:false }
];

/* `dressable` covers GARMENTS only — hats, tops, bottoms, shoes, held items.
   Those are drawn for the standing pose, which Baby and Legend don't use, so
   clothing unlocks at Child and closes again at Legend.

   Backgrounds are a separate matter. They sit behind the pet and don't touch
   the pose at all, so every stage can use one — a Baby with nothing else in
   the wardrobe can still be given a scene. See canWear() below. */

const SLOTS = [
  { key:'background', name:'Background' },
  { key:'bottoms',    name:'Bottoms' },
  { key:'top',        name:'Top' },
  { key:'shoes',      name:'Shoes' },
  { key:'hat',        name:'Hat' },
  { key:'held',       name:'Held' }
];

/* Layer order, back to front. */
const LAYERS = ['background','bottoms','shoes','top','hat','held'];

/* ---------- species ----------
   `furs` lists the colourways you have art for. Adding one is a filename
   plus a word here — nothing else in the app needs to change. */
const SPECIES = {
  cat: {
    name:'Cat',
    furs:['black','gray'],
    buff: { key:'payout', label:'Coin sense', text:'+12% on every payout' }
  },
  penguin: {
    name:'Penguin',
    furs:['black'],
    buff: { key:'hunger', label:'Cold blooded', text:'party hunger drains 20% slower' }
  },
  panda: {
    name:'Panda',
    furs:['black'],
    buff: { key:'xp', label:'Slow wisdom', text:'+20% XP from everything' }
  }
};

/* Eyes are their own layer, so any eye goes with any fur. */
const EYE_COLORS = ['blue','green','orange','pink','purple','yellow'];
const EYE_SHAPES = ['round','slit'];

const SPECIES_KEYS = Object.keys(SPECIES);

/* ---------- wardrobe ----------
   Garments need a PNG at /assets/wardrobe/{id}.png. Backgrounds don't: give
   one a `color` and it paints a flat fill instead of loading an image, so a
   plain-colour scene costs nothing to add and can never show a broken tile.

   To add an illustrated background later, drop the file in and add an entry
   WITHOUT a `color` — the renderer falls back to the image path on its own.

   `unlock` is the pet level the item appears at. Levels run 1 + xp/250, so
   the ladder below lands roughly: 1 straight away, 4 around Child, 11 around
   Teen, 20 well into Adult. Nothing is ever taken away once it's bought. */
const CATALOG = [
  { id:'hat-beanie',   slot:'hat',        name:'Cat-ear beanie', price:600, unlock:1, fit:{} },
  { id:'hat-pumpkin',  slot:'hat',        name:'Pumpkin hat',    price:650, unlock:4, fit:{
      child: { x:49.9, y:52.5, w:81.5 },
      teen:  { x:50.3, y:53.1, w:95.5 },
      adult: { x:50.1, y:51.3, w:100  }
    } },
  { id:'top-hoodie',   slot:'top',        name:'Paw hoodie',     price:800, unlock:1, fit:{} },
  { id:'bot-shorts',   slot:'bottoms',    name:'Cargo shorts',   price:550, unlock:1, fit:{} },
  { id:'shoe-hitops',  slot:'shoes',      name:'Paw hi-tops',    price:650, unlock:2, fit:{} },

  /* --- plain-colour backgrounds, drawn from the canonical palette --- */
  { id:'bg-cream',     slot:'background', name:'Cream',      price:100,  unlock:1,  color:'#F7F1E4' },
  { id:'bg-rose',      slot:'background', name:'Rose',       price:100,  unlock:1,  color:'#F6D9E6' },
  { id:'bg-sage',      slot:'background', name:'Sage',       price:150,  unlock:4,  color:'#C7D2BA' },
  { id:'bg-sky',       slot:'background', name:'Sky',        price:150,  unlock:4,  color:'#BFD6E8' },
  { id:'bg-parchment', slot:'background', name:'Parchment',  price:220,  unlock:8,  color:'#EDE1C3' },
  { id:'bg-dusk',      slot:'background', name:'Dusk',       price:300,  unlock:11, color:'#6B4A78' },
  { id:'bg-burgundy',  slot:'background', name:'Burgundy',   price:300,  unlock:11, color:'#6E2430' },
  { id:'bg-midnight',  slot:'background', name:'Midnight',   price:450,  unlock:20, color:'#2E241F' }
];

function catalogItem(id){ return CATALOG.find(i => i.id === id) || null; }

/* Items a given pet can actually see in the shop right now. */
function itemsForSlot(pet, slotKey){
  return CATALOG.filter(i => i.slot === slotKey);
}

const FOOD = [
  { id:'food-kibble', name:'Plain kibble', price:40,  hunger:25, xp:0,   desc:'Does the job.' },
  { id:'food-fish',   name:'Good fish',    price:90,  hunger:55, xp:0,   desc:'A proper meal.' },
  { id:'food-feast',  name:'Feast',        price:180, hunger:100, xp:0,  desc:'Fills them right up.' },
  { id:'treat-cake',  name:'Honey cake',   price:500, hunger:40, xp:400, desc:'A treat that also teaches.' },
  { id:'treat-star',  name:'Star biscuit', price:1400, hunger:60, xp:1500, desc:'Expensive. Worth it.' }
];

const RECOLOR_PRICE = 400;

/* ---------- title fragments ---------- */
const STARTER_PREFIXES  = ['Small','Sleepy','Gentle','Stubborn'];
const STARTER_SUBJECTS  = ['Monday','Dust','The Pile','Small Hours'];
const CONNECTORS        = ['of the','of','against','beyond','before'];

const PREFIX_POOL = ['Slayer','Keeper','Devourer','Warden','Herald','Relentless','Unbothered','Patient','Bright','Ancient','Sovereign','Quiet'];

/* ---------- helpers ---------- */
function stageOf(pet){
  let s = STAGES[0];
  for(const st of STAGES){ if((pet.xp || 0) >= st.at) s = st; }
  return s;
}
function stageIndex(pet){ return STAGES.findIndex(s => s.key === stageOf(pet).key); }
function petLevel(pet){ return 1 + Math.floor((pet.xp || 0) / 250); }
function nextStage(pet){
  const i = stageIndex(pet);
  return i < STAGES.length - 1 ? STAGES[i+1] : null;
}
function stageProgress(pet){
  const cur = stageOf(pet), nxt = nextStage(pet);
  if(!nxt) return 1;
  return Math.min(1, ((pet.xp || 0) - cur.at) / (nxt.at - cur.at));
}
/* canWear(pet)            → can this pet wear GARMENTS at all?
   canWear(pet, slotKey)   → can this pet use that particular slot?

   Backgrounds are always allowed; everything else follows stage.dressable.
   The one-argument form is unchanged, so old callers keep working. */
function canWear(pet, slotKey){
  if(slotKey === 'background') return true;
  return stageOf(pet).dressable === true;
}

function mood(pet){
  const h = pet.hunger == null ? 100 : pet.hunger;
  if(h >= 60) return 'happy';
  if(h >= 30) return 'uneasy';
  return 'low';
}

/* ---------- Legend buffs ---------- */
function legendBuffs(state){
  const out = { payout:1, hunger:1, xp:1, legends:[] };
  (state.pets || []).forEach(p => {
    if(stageOf(p).key !== 'legend' || p.tier !== 'stable') return;
    const b = SPECIES[p.species].buff;
    out.legends.push({ pet:p, buff:b });
    if(b.key === 'payout') out.payout += 0.12;
    if(b.key === 'hunger') out.hunger *= 0.8;
    if(b.key === 'xp')     out.xp += 0.20;
  });
  return out;
}

/* ---------- party ---------- */
const SLOT_LEVELS = [3,6,10,14,18,22];
function partySlots(state){ return SLOT_LEVELS.filter(l => (state.level || 1) >= l).length; }
function nextSlotLevel(state){ return SLOT_LEVELS.find(l => (state.level || 1) < l) || null; }
function activePet(state){ return (state.pets || []).find(p => p.tier === 'active') || null; }
function partyPets(state){ return (state.pets || []).filter(p => p.tier === 'party'); }
function stablePets(state){ return (state.pets || []).filter(p => p.tier === 'stable'); }

/* ---------- hunger ----------
   Hunger is settled lazily. state.hungerDate is the last day fully accounted
   for. Each elapsed day drains in proportion to how little was completed that
   day. Today is computed live so ticking a task moves the bar straight away. */
const DAILY_DRAIN = 100 / 7;

function dayCompletionRatio(state, dateKey, isScheduledFn, isDoneFn){
  const scheduled = (state.dailies || []).filter(t => isScheduledFn(t, dateKey));
  if(!scheduled.length) return 1;
  const done = scheduled.filter(t => isDoneFn(t, dateKey)).length;
  return done / scheduled.length;
}

function drainFor(pet, ratio, buffs){
  const tierRate = pet.tier === 'active' ? 1 : (pet.tier === 'party' ? 0.35 : 0);
  return DAILY_DRAIN * tierRate * (1 - ratio) * buffs.hunger;
}

/* Applies drain for every completed day since hungerDate. Mutates state. */
function settleHunger(state, ctx){
  const pets = state.pets || [];
  if(!pets.length){ state.hungerDate = ctx.todayKey; return; }
  if(!state.hungerDate){ state.hungerDate = ctx.todayKey; return; }
  if(state.hungerDate >= ctx.todayKey) return;

  const buffs = legendBuffs(state);
  let cursor = ctx.addDays(ctx.fromKey(state.hungerDate), 1);
  let guard = 0;

  while(ctx.dateKey(cursor) < ctx.todayKey && guard < 400){
    guard++;
    const k = ctx.dateKey(cursor);
    if(!ctx.isVacation(k)){
      const ratio = dayCompletionRatio(state, k, ctx.isScheduled, ctx.isDone);
      pets.forEach(p => {
        const before = p.hunger == null ? 100 : p.hunger;
        const after = before - drainFor(p, ratio, buffs);
        if(after < 0) applyStarvation(p, -after);
        p.hunger = Math.max(0, Math.min(100, after));
      });
    }
    cursor = ctx.addDays(cursor, 1);
  }
  state.hungerDate = ctx.todayKey;
}

/* Hunger shown right now — settled value minus today's partial drain. */
function liveHunger(state, pet, ctx){
  const base = pet.hunger == null ? 100 : pet.hunger;
  if(ctx.isVacation(ctx.todayKey)) return Math.round(base);
  const buffs = legendBuffs(state);
  const ratio = dayCompletionRatio(state, ctx.todayKey, ctx.isScheduled, ctx.isDone);
  return Math.round(Math.max(0, Math.min(100, base - drainFor(pet, ratio, buffs))));
}

/* Hunger at zero eats into pet XP. Slow, and always recoverable. */
function applyStarvation(pet, overflow){
  const loss = Math.round(overflow * 12);
  pet.xp = Math.max(0, (pet.xp || 0) - loss);
}

function feed(pet, amount){
  pet.hunger = Math.max(0, Math.min(100, (pet.hunger == null ? 100 : pet.hunger) + amount));
}

/* ---------- pet XP ---------- */
function awardPetXP(state, amount){
  const buffs = legendBuffs(state);
  const scaled = Math.round(amount * buffs.xp);
  const gained = [];
  (state.pets || []).forEach(p => {
    if(p.tier === 'stable') return;
    const share = p.tier === 'active' ? scaled : Math.round(scaled * 0.35);
    if(share <= 0) return;
    const before = stageOf(p).key;
    p.xp = (p.xp || 0) + share;
    const after = stageOf(p).key;
    if(before !== after) gained.push({ pet:p, stage: stageOf(p) });
  });
  return gained;
}

/* ---------- titles ---------- */
function ensureFragments(state){
  if(!state.fragments) state.fragments = { prefix:[], subject:[] };
  if(!state.fragments.prefix.length) state.fragments.prefix = STARTER_PREFIXES.slice();
  if(!state.fragments.subject.length) state.fragments.subject = STARTER_SUBJECTS.slice();
  return state.fragments;
}
function addFragment(state, kind, word){
  const f = ensureFragments(state);
  if(!word) return false;
  if(f[kind].includes(word)) return false;
  f[kind].push(word);
  return true;
}
function randomPrefix(state){
  const f = ensureFragments(state);
  const unused = PREFIX_POOL.filter(w => !f.prefix.includes(w));
  return unused.length ? unused[Math.floor(Math.random()*unused.length)] : null;
}
function titleText(pet){
  const t = pet.title;
  if(!t || !t.prefix || !t.subject) return '';
  return t.connector ? `${t.prefix} ${t.connector} ${t.subject}` : `${t.prefix} ${t.subject}`;
}

/* ---------- monsters ---------- */
function activeMonster(ms){
  if(!ms) return null;
  return (ms.monsters || []).find(m => m.id === ms.activeMonster && !m.dead) || null;
}

function damageMonster(ms, amount, who){
  const m = activeMonster(ms);
  if(!m || amount <= 0) return null;
  m.hp = Math.max(0, m.hp - amount);
  if(!ms.damage[m.id]) ms.damage[m.id] = {};
  ms.damage[m.id][who] = (ms.damage[m.id][who] || 0) + amount;
  if(m.hp === 0){ m.dead = true; m.killed = m.killed || TODAY_KEY; return m; }
  return null;
}

function hasCollected(ms, monsterId, who){
  return !!((ms.collected || {})[monsterId] || {})[who];
}
function collectorCount(ms, monsterId){
  return Object.keys((ms.collected || {})[monsterId] || {}).length;
}
function markCollected(ms, monsterId, who){
  if(!ms.collected[monsterId]) ms.collected[monsterId] = {};
  ms.collected[monsterId][who] = true;
}

/* ---------- pet creation ---------- */
function rollPetOptions(count){
  const pool = SPECIES_KEYS.slice();
  const opts = [];
  for(let i=0;i<count && pool.length;i++){
    const species = pool.splice(Math.floor(Math.random()*pool.length), 1)[0];
    opts.push({ species, fur: SPECIES[species].furs[0] });
  }
  return opts;
}

/* Where a newly-earned pet lands.

   First pet ever → active, so the log isn't staring at an empty slot.
   Otherwise it joins the party if a slot is free, and drops into the stable
   if not. It is never discarded for want of room — that was the old bug. */
function placePet(state, pet){
  if(!activePet(state)){ pet.tier = 'active'; }
  else if(partyPets(state).length < partySlots(state)){ pet.tier = 'party'; }
  else { pet.tier = 'stable'; }
  state.pets.push(pet);
  return pet.tier;
}

function makePet(species, look, name){
  look = look || {};
  return {
    id: 'p' + Math.random().toString(36).slice(2,10),
    species,
    name: name || 'Unnamed',
    fur: look.fur || SPECIES[species].furs[0],
    eyeColor: look.eyeColor || 'yellow',
    eyeShape: look.eyeShape || 'round',
    tier: 'stable',
    xp: 0, hunger: 100,
    outfit: {},
    title: null
  };
}

/* ==========================================================================
   DRAWING
   Pets are rendered PNGs, one per species and stage, stacked with garment
   images on top. Everything is positioned in percentages of the frame, so it
   scales from a 34px header icon up to the closet without re-tuning.

   Expected files:
     /assets/pets/{species}-{stage}.png      e.g. cat-teen.png
     /assets/wardrobe/{itemId}.png           e.g. hat-beanie.png
   ========================================================================== */

const PET_ART  = '/assets/pets/';
const EYE_ART  = '/assets/eyes/';
const ITEM_ART = '/assets/wardrobe/';

/* Frame aspect ratio, width:height. The art is portrait. */
const FRAME_RATIO = 2 / 3;

function petImageUrl(pet){
  return `${PET_ART}${pet.species}-${pet.fur || 'black'}-${stageOf(pet).key}.png`;
}
function eyeImageUrl(pet){
  return `${EYE_ART}${pet.eyeColor || 'yellow'}-${stageOf(pet).key}-${pet.eyeShape || 'round'}.png`;
}
function itemImageUrl(id){ return `${ITEM_ART}${id}.png`; }

/* A garment's placement for a given stage, as percentages of the frame.
   Produced by the fitting tool and pasted into CATALOG entries. */
function fitFor(item, stageKey){
  const f = (item.fit || {})[stageKey];
  return f || { x:50, y:50, w:60 };
}

function layerStyle(fit){
  /* h is optional — leave it out and the image keeps its own aspect ratio.
     Set it to squash or stretch a garment onto a differently proportioned
     stage, which is how one image covers child, teen and adult. */
  return `position:absolute;left:${fit.x}%;top:${fit.y}%;width:${fit.w}%;`
       + (fit.h ? `height:${fit.h}%;` : '')
       + `transform:translate(-50%,-50%)${fit.r ? ` rotate(${fit.r}deg)` : ''};`
       + `pointer-events:none;`;
}

function escapeAttr(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

/* Returns an HTML string. Callers drop it straight into innerHTML. */
function petSvg(pet, opts){
  opts = opts || {};
  const stage = stageOf(pet);
  const own = pet.outfit || {};
  /* Garments follow the stage; the background does not, so a Baby with an
     otherwise empty wardrobe still gets its scene. */
  const outfit = canWear(pet) ? own : {};
  const background = own.background || null;
  const alt = `${pet.name || 'pet'}, a ${SPECIES[pet.species].name.toLowerCase()} at ${stage.name.toLowerCase()} stage`;

  let html = `<div class="pq-pet" role="img" aria-label="${escapeAttr(alt)}" `
           + `style="position:relative;width:100%;padding-bottom:${(1/FRAME_RATIO)*100}%;`
           + `${opts.size ? `max-width:${opts.size}px;` : ''}">`;

  if(opts.showBackground !== false && background){
    const bg = catalogItem(background);
    if(bg && bg.color){
      html += `<div style="position:absolute;inset:0;background:${bg.color};border-radius:8px;"></div>`;
    } else {
      html += `<img src="${itemImageUrl(background)}" alt="" `
            + `style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;" `
            + `onerror="this.style.display='none'">`;
    }
  }

  /* Garments behind the body */
  ['bottoms','shoes'].forEach(slot => {
    if(!outfit[slot]) return;
    const item = CATALOG.find(i => i.id === outfit[slot]);
    if(!item) return;
    html += `<img src="${itemImageUrl(item.id)}" alt="" style="${layerStyle(fitFor(item, stage.key))}z-index:1;" onerror="this.style.display='none'">`;
  });

  const full = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
  html += `<img src="${petImageUrl(pet)}" alt="" style="${full}z-index:2;" `
        + `onerror="this.dataset.missing=1;this.style.display='none'">`;
  html += `<img src="${eyeImageUrl(pet)}" alt="" style="${full}z-index:3;" `
        + `onerror="this.style.display='none'">`;

  /* Garments in front of the body */
  ['top','hat','held'].forEach(slot => {
    if(!outfit[slot]) return;
    const item = CATALOG.find(i => i.id === outfit[slot]);
    if(!item) return;
    html += `<img src="${itemImageUrl(item.id)}" alt="" style="${layerStyle(fitFor(item, stage.key))}z-index:4;" onerror="this.style.display='none'">`;
  });

  if(stage.key === 'legend'){
    html += `<span aria-hidden="true" style="position:absolute;top:4%;right:6%;z-index:5;font-size:0.9em;color:#C9A227;">\u2726</span>`;
  }

  html += `</div>`;
  return html;
}

/* ==========================================================================
   DATES
   ========================================================================== */
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function dateKey(d){
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
}
function fromKey(k){ const [y,m,d] = String(k).split('-').map(Number); return new Date(y, m-1, d); }
function sameDay(a,b){ return dateKey(a) === dateKey(b); }
function daysBetween(a,b){ return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
function mondayOf(d){ const x = startOfDay(d); return addDays(x, -((x.getDay()+6)%7)); }

const TODAY = startOfDay(new Date());
const TODAY_KEY = dateKey(TODAY);
const BACKFILL_DAYS = 13;
const MIN_DATE = addDays(TODAY, -BACKFILL_DAYS);

const PEOPLE = {
  danni: {
    name:'Danni', doc:'danni-quest-log', emoji:'\uD83E\uDDDD\u200D\u2640\uFE0F',
    starter:{ id:'p-woodrow', species:'cat', fur:'black',
              eyeColor:'yellow', eyeShape:'slit', name:'Lord Woodrow' }
  },
  brendon: {
    name:'Brendon', doc:'brendon-quest-log', emoji:'\uD83E\uDDDB\u200D\u2642\uFE0F',
    /* No name — he picks one. The pets page prompts until he does. */
    starter:{ id:'p-first', species:'penguin', fur:'black',
              eyeColor:'green', eyeShape:'slit', name:'' }
  }
};

function currentPerson(){
  let who = 'danni';
  try{
    const q = new URLSearchParams(location.search).get('who');
    if(q && PEOPLE[q.toLowerCase()]) who = q.toLowerCase();
  }catch(e){}
  return who;
}

/* Keeps ?who= on internal links so you don't fall back into the other log. */
function personLink(href){
  const who = currentPerson();
  if(who === 'danni') return href;
  return href + (href.includes('?') ? '&' : '?') + 'who=' + who;
}


/* ==========================================================================
   STATE
   ========================================================================== */
const SEED_RATES = { dailies:6, todos:20, projects:60 };
const DEFAULT_TARGETS = { dailies:1200, todos:700, projects:600 };
const COLUMNS = ['dailies','todos','projects'];
const SUBTASK_SHARE = 0.6;
const AGE_PER_WEEK = 0.2;
const AGE_CAP = 3.0;
const STREAK_PER_DAY = 0.02;
const STREAK_CAP_DAYS = 20;
const MEOW_PER_GOLD = 500;

/* Everyone starts with one companion, so something is growing from day one.
   Whose log it is decides who that companion is. */
function starterPet(who){
  const spec = (PEOPLE[who || currentPerson()] || PEOPLE.danni).starter;
  return {
    id: spec.id,
    species: spec.species,
    name: spec.name,
    fur: spec.fur,
    eyeColor: spec.eyeColor,
    eyeShape: spec.eyeShape,
    tier: 'active',
    xp: 0, hunger: 100,
    outfit: {},
    title: null
  };
}

function defaultState(){
  return {
    version: 5,
    level:1, xp:0, xpToNext:100,
    gold:0, copper:0, meowBucks:0,
    tags:[
      { id:'t-work',    name:'Work',    color:'#6E2430' },
      { id:'t-home',    name:'Home',    color:'#8FA37E' },
      { id:'t-wedding', name:'Wedding', color:'#E87CA6' },
      { id:'t-etsy',    name:'Etsy',    color:'#9C7440' }
    ],
    dailies:[], todos:[], projects:[],
    completions:{},
    shop:[],
    vacations:[],
    targets:{ ...DEFAULT_TARGETS },
    rates:{ ...SEED_RATES },
    weekStart:null,
    ledger:{},
    celebrated:{},
    pets:[starterPet()], petTokens:0, hungerDate:null, starterGiven:true,
    wardrobe:{}, fragments:{ prefix:[], subject:[] },
  };
}

function migrate(s){
  const hadStarter = s.starterGiven === true;
  const d = defaultState();
  for(const k in d){ if(s[k] === undefined) s[k] = d[k]; }
  if(!Array.isArray(s.tags) || !s.tags.length) s.tags = d.tags;
  COLUMNS.forEach(k => { if(!Array.isArray(s[k])) s[k] = []; });
  ['pets','shop','vacations'].forEach(k => { if(!Array.isArray(s[k])) s[k] = []; });
  s.targets = Object.assign({}, DEFAULT_TARGETS, s.targets || {});
  s.rates   = Object.assign({}, SEED_RATES, s.rates || {});
  if(!s.fragments || !Array.isArray(s.fragments.prefix)) s.fragments = { prefix:[], subject:[] };
  if(typeof s.wardrobe !== 'object' || s.wardrobe === null) s.wardrobe = {};
  if(!hadStarter && !s.pets.length){ s.pets = [starterPet()]; s.starterGiven = true; }
  /* pets used to store hex colours; art is per-file now */
  s.pets.forEach(p => {
    if(!p.fur) p.fur = (SPECIES[p.species] || SPECIES.cat).furs[0];
    if(!p.eyeColor) p.eyeColor = 'yellow';
    if(!p.eyeShape) p.eyeShape = 'round';
    delete p.colors;
  });
  delete s.work; delete s.hp; delete s.maxHp; delete s.closet; delete s.worn;
  delete s.monsters; delete s.activeMonster;   /* monsters are shared now */
  return s;
}

/* ==========================================================================
   PEOPLE
   One set of files serves both logs. ?who=brendon switches which document
   is loaded; everything except monsters is per person.
   ========================================================================== */
const MONSTER_DOC = 'shared-monsters';
const STORE_KEY = 'questlog-v6';

function makeStore(firebase, who){
  who = who || currentPerson();
  const db = firebase.firestore();
  const ref = db.collection('questlog').doc(PEOPLE[who].doc);
  const localKey = STORE_KEY + '-' + who;
  let state = defaultState();

  return {
    get state(){ return state; },
    set state(v){ state = v; },
    async load(){
      try{
        const snap = await ref.get();
        if(snap.exists){
          state = migrate(snap.data());
        } else {
          const raw = localStorage.getItem(localKey);
          state = raw ? migrate(JSON.parse(raw)) : defaultState();
          await ref.set(state);
        }
      } catch(err){
        console.error('Firestore read failed, using local copy:', err);
        const raw = localStorage.getItem(localKey);
        state = raw ? migrate(JSON.parse(raw)) : defaultState();
      }
      localStorage.setItem(localKey, JSON.stringify(state));
      return state;
    },
    who,
    person: PEOPLE[who],
    save(){
      localStorage.setItem(localKey, JSON.stringify(state));
      ref.set(state).catch(err => console.error('Sync to Firestore failed:', err));
    },
    reset(){ state = defaultState(); return state; }
  };
}

/* ==========================================================================
   SHARED MONSTERS
   Lives in its own document so both logs damage the same creature.
   `damage` records who dealt what; `collected` records who has taken their
   share, so neither person can claim the other's half.
   ========================================================================== */
function defaultMonsterState(){
  return { version:1, monsters:[], activeMonster:null, damage:{}, collected:{} };
}

function migrateMonsters(m){
  const d = defaultMonsterState();
  for(const k in d){ if(m[k] === undefined) m[k] = d[k]; }
  if(!Array.isArray(m.monsters)) m.monsters = [];
  return m;
}

function makeMonsterStore(firebase){
  const db = firebase.firestore();
  const ref = db.collection('questlog').doc(MONSTER_DOC);
  const localKey = STORE_KEY + '-monsters';
  let state = defaultMonsterState();
  return {
    get state(){ return state; },
    async load(){
      try{
        const snap = await ref.get();
        if(snap.exists) state = migrateMonsters(snap.data());
        else {
          const raw = localStorage.getItem(localKey);
          state = raw ? migrateMonsters(JSON.parse(raw)) : defaultMonsterState();
          await ref.set(state);
        }
      }catch(err){
        console.error('Monster read failed, using local copy:', err);
        const raw = localStorage.getItem(localKey);
        state = raw ? migrateMonsters(JSON.parse(raw)) : defaultMonsterState();
      }
      localStorage.setItem(localKey, JSON.stringify(state));
      return state;
    },
    save(){
      localStorage.setItem(localKey, JSON.stringify(state));
      ref.set(state).catch(err => console.error('Monster sync failed:', err));
    },
    reset(){ state = defaultMonsterState(); return state; }
  };
}

/* Half each, rounded so the first to collect takes the odd penny.
   Pets and wardrobe items can't be halved — they go to whoever collects first. */
function splitReward(reward, isFirst){
  const half = n => isFirst ? Math.ceil((n||0)/2) : Math.floor((n||0)/2);
  return {
    gold: half(reward.gold),
    meow: half(reward.meow),
    xp:   half(reward.xp),
    pet:  !!reward.pet  && isFirst,
    item: !!reward.item && isFirst
  };
}

/* ==========================================================================
   RECURRENCE + COMPLETIONS
   ========================================================================== */
const WEEKDAYS = ['S','M','T','W','T','F','S'];
const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function isScheduled(task, d){
  const date = (typeof d === 'string') ? fromKey(d) : d;
  const r = task.repeat || { type:'weekdays', days:[0,1,2,3,4,5,6] };
  if(r.type === 'weekdays') return (r.days || []).includes(date.getDay());
  if(r.type === 'ndays'){
    const diff = daysBetween(fromKey(r.anchor || TODAY_KEY), date);
    return diff >= 0 && diff % Math.max(1, r.n || 1) === 0;
  }
  if(r.type === 'monthly-date'){
    const last = new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();
    return date.getDate() === Math.min(r.dom || 1, last);
  }
  if(r.type === 'monthly-nth'){
    if(date.getDay() !== (r.dow || 0)) return false;
    if(r.nth === -1) return date.getDate() + 7 > new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();
    return Math.floor((date.getDate()-1)/7) + 1 === (r.nth || 1);
  }
  return false;
}

function repeatSummary(task){
  const r = task.repeat || {};
  if(r.type === 'weekdays'){
    const days = r.days || [];
    if(days.length === 7) return 'every day';
    if(!days.length) return 'never';
    if(days.length === 5 && [1,2,3,4,5].every(x => days.includes(x))) return 'weekdays';
    if(days.length === 2 && days.includes(0) && days.includes(6)) return 'weekends';
    return days.slice().sort().map(i => WEEKDAYS[i]).join('');
  }
  if(r.type === 'ndays') return r.n === 1 ? 'every day' : `every ${r.n} days`;
  if(r.type === 'monthly-date') return `day ${r.dom} monthly`;
  if(r.type === 'monthly-nth'){
    const ord = r.nth === -1 ? 'last' : ['','first','second','third','fourth'][r.nth];
    return `${ord} ${DOW_FULL[r.dow]}`;
  }
  return '';
}

function makeCtx(state){
  return {
    todayKey: TODAY_KEY,
    dateKey, fromKey, addDays,
    isVacation: k => isVacation(state, k),
    isScheduled: (t, k) => isScheduled(t, k),
    isDone: (t, k) => {
      const rec = (state.completions[k] || {})[t.id];
      return !!(rec && rec.done);
    }
  };
}

function isVacation(state, k){
  const key = (typeof k === 'string') ? k : dateKey(k);
  return (state.vacations || []).some(v => key >= v.start && (!v.end || key <= v.end));
}
function vacationActive(state){ return (state.vacations || []).some(v => !v.end); }

/* ==========================================================================
   PAYOUT MATHS
   ========================================================================== */
function ageMultiplier(state, task, column, viewDate){
  let sinceKey = null;
  if(column === 'projects') sinceKey = task.created;
  else if(column === 'todos' && task.due && dateKey(viewDate) > task.due) sinceKey = task.due;
  if(!sinceKey) return 1;
  const weeks = Math.max(0, daysBetween(fromKey(sinceKey), viewDate) / 7);
  return Math.min(AGE_CAP, 1 + weeks * AGE_PER_WEEK);
}

function getStreak(state, task, viewDate){
  let streak = 0, guard = 0;
  let d = addDays(viewDate, -1);
  while(d >= MIN_DATE && guard < 400){
    guard++;
    const k = dateKey(d);
    if(isVacation(state, k)){ d = addDays(d,-1); continue; }
    if(!isScheduled(task, d)){ d = addDays(d,-1); continue; }
    const rec = (state.completions[k] || {})[task.id];
    if(rec && rec.done){ streak++; d = addDays(d,-1); }
    else break;
  }
  return streak;
}

function taskValue(state, task, column, viewDate){
  const rate = state.rates[column] || SEED_RATES[column];
  const streak = column === 'dailies' ? getStreak(state, task, viewDate) : 0;
  const buffs = legendBuffs(state);
  const raw = rate
    * (task.difficulty || 3)
    * ageMultiplier(state, task, column, viewDate)
    * (1 + Math.min(streak, STREAK_CAP_DAYS) * STREAK_PER_DAY)
    * buffs.payout;
  return Math.max(1, Math.round(raw));
}
function subtaskValue(state, task, column, viewDate){
  const n = (task.subs || []).length;
  if(!n) return 0;
  return Math.max(1, Math.round(taskValue(state, task, column, viewDate) * SUBTASK_SHARE / n));
}
function bonusValue(state, task, column, viewDate){
  const n = (task.subs || []).length;
  if(!n) return taskValue(state, task, column, viewDate);
  return Math.max(0, taskValue(state, task, column, viewDate) - subtaskValue(state, task, column, viewDate) * n);
}

function ledgerWeek(state){
  const wk = dateKey(mondayOf(TODAY));
  if(!state.ledger[wk]) state.ledger[wk] = { dailies:0, todos:0, projects:0, monsters:0 };
  if(state.ledger[wk].monsters === undefined) state.ledger[wk].monsters = 0;
  return state.ledger[wk];
}
function addCurrency(state, copper, column){
  if(copper <= 0) return;
  const total = state.copper + copper;
  state.gold += Math.floor(total/100);
  state.copper = total % 100;
  if(column) ledgerWeek(state)[column] += copper;
}
function removeCurrency(state, copper, column){
  if(copper <= 0) return;
  const left = Math.max(0, state.gold*100 + state.copper - copper);
  state.gold = Math.floor(left/100);
  state.copper = left % 100;
  if(column){ const l = ledgerWeek(state); l[column] = Math.max(0, l[column] - copper); }
}
function spendCurrency(state, gold, copper){
  const have = state.gold*100 + state.copper, cost = gold*100 + copper;
  if(have < cost) return false;
  const left = have - cost;
  state.gold = Math.floor(left/100);
  state.copper = left % 100;
  return true;
}

/* Monster gold comes out of the weekly budget rather than sitting on top of
   it, so a fat monster payout quietly lowers per-task rates that week. */
function recalibrate(state){
  const thisWeek = dateKey(mondayOf(TODAY));
  if(state.weekStart === thisWeek){ ledgerWeek(state); return; }

  if(state.weekStart){
    const paid = state.ledger[state.weekStart];
    if(paid){
      const totalTarget = COLUMNS.reduce((n,c) => n + state.targets[c], 0) || 1;
      const monsterPaid = paid.monsters || 0;
      COLUMNS.forEach(col => {
        const share = state.targets[col] / totalTarget;
        const effective = Math.max(state.targets[col] * 0.2, state.targets[col] - monsterPaid * share);
        const actual = paid[col];
        if(!effective || actual < 5) return;
        const ratio = Math.min(1.6, Math.max(0.6, effective / actual));
        state.rates[col] = Math.max(1, Math.round(state.rates[col] * ratio));
      });
    }
  }
  state.weekStart = thisWeek;
  ledgerWeek(state);
  const cutoff = dateKey(addDays(TODAY, -70));
  Object.keys(state.ledger).forEach(k => { if(k < cutoff) delete state.ledger[k]; });
}

/* ==========================================================================
   ACCOUNT XP
   ========================================================================== */
function addAccountXP(state, amount){
  const buffs = legendBuffs(state);
  const scaled = Math.round(amount * buffs.xp);
  const levels = [];
  state.xp += scaled;
  while(state.xp >= state.xpToNext){
    state.xp -= state.xpToNext;
    state.level += 1;
    state.xpToNext = Math.round(state.xpToNext * 1.25);
    levels.push(state.level);
  }
  return levels;
}

/* ---------- exports ---------- */
return {
  STAGES, SLOTS, SPECIES, SPECIES_KEYS, CATALOG, FOOD, RECOLOR_PRICE,
  CONNECTORS, SLOT_LEVELS, COLUMNS, WEEKDAYS, DOW_FULL, MEOW_PER_GOLD,
  EYE_COLORS, EYE_SHAPES, EYE_ART, eyeImageUrl,
  LAYERS, PET_ART, ITEM_ART, FRAME_RATIO, petImageUrl, itemImageUrl, fitFor,
  TODAY, TODAY_KEY, MIN_DATE, BACKFILL_DAYS, SEED_RATES, DEFAULT_TARGETS,
  startOfDay, addDays, dateKey, fromKey, sameDay, daysBetween, mondayOf,
  defaultState, migrate, makeStore,
  PEOPLE, currentPerson, personLink, MONSTER_DOC,
  defaultMonsterState, makeMonsterStore, splitReward,
  hasCollected, collectorCount, markCollected,
  isScheduled, repeatSummary, makeCtx, isVacation, vacationActive,
  ageMultiplier, getStreak, taskValue, subtaskValue, bonusValue,
  addCurrency, removeCurrency, spendCurrency, ledgerWeek, recalibrate,
  addAccountXP,
  stageOf, stageIndex, petLevel, nextStage, stageProgress, canWear, mood,
  legendBuffs, partySlots, nextSlotLevel, activePet, partyPets, stablePets,
  settleHunger, liveHunger, feed, awardPetXP,
  ensureFragments, addFragment, randomPrefix, titleText,
  activeMonster, damageMonster,
  rollPetOptions, makePet, placePet, petSvg,
  catalogItem, itemsForSlot
};

})();
