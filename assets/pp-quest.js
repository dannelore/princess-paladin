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
  { key:'baby',   name:'Baby',   at:0,     dressable:['hat','held'] },
  { key:'child',  name:'Child',  at:800,   dressable:['hat','held'] },
  { key:'teen',   name:'Teen',   at:2500,  dressable:['hat','hair','top','held','accessory','background'] },
  { key:'adult',  name:'Adult',  at:7200,  dressable:['hat','hair','top','held','accessory','background'] },
  { key:'legend', name:'Legend', at:18000, dressable:['hat','hair','top','held','accessory','background'] }
];

const SLOTS = [
  { key:'background', name:'Background' },
  { key:'hair',       name:'Hair' },
  { key:'top',        name:'Top' },
  { key:'hat',        name:'Hat' },
  { key:'accessory',  name:'Accessory' },
  { key:'held',       name:'Held' }
];

/* ---------- species ---------- */
const SPECIES = {
  cat: {
    name:'Cat',
    bodyColors:  ['#ED93B1','#F4C0D1','#B4B2A9','#444441','#FAC775','#9FE1CB'],
    accentColors:['#D4537E','#993556','#888780','#2C2C2A','#EF9F27','#5DCAA5'],
    buff: { key:'payout', label:'Coin sense', text:'+12% on every payout' }
  },
  penguin: {
    name:'Penguin',
    bodyColors:  ['#444441','#2C2C2A','#185FA5','#534AB7','#72243E','#0F6E56'],
    accentColors:['#F1EFE8','#D3D1C7','#B5D4F4','#CECBF6','#F4C0D1','#9FE1CB'],
    buff: { key:'hunger', label:'Cold blooded', text:'party hunger drains 20% slower' }
  },
  panda: {
    name:'Panda',
    bodyColors:  ['#F1EFE8','#FAEEDA','#E1F5EE','#FBEAF0','#EEEDFE','#D3D1C7'],
    accentColors:['#2C2C2A','#444441','#0F6E56','#993556','#534AB7','#5F5E5A'],
    buff: { key:'xp', label:'Slow wisdom', text:'+20% XP from everything' }
  }
};

const SPECIES_KEYS = Object.keys(SPECIES);

/* ---------- wardrobe ---------- */
const CATALOG = [
  { id:'hat-crown',    slot:'hat',        name:'Little crown',    price:900,  unlock:1  },
  { id:'hat-bow',      slot:'hat',        name:'Big bow',         price:300,  unlock:1  },
  { id:'hat-wizard',   slot:'hat',        name:'Wizard hat',      price:750,  unlock:4  },
  { id:'hat-flower',   slot:'hat',        name:'Flower crown',    price:450,  unlock:3  },

  { id:'hair-braids',  slot:'hair',       name:'Braids',          price:500,  unlock:5  },
  { id:'hair-curls',   slot:'hair',       name:'Curls',           price:500,  unlock:5  },
  { id:'hair-long',    slot:'hair',       name:'Long hair',       price:650,  unlock:8  },

  { id:'top-scarf',    slot:'top',        name:'Scarf',           price:350,  unlock:5  },
  { id:'top-cape',     slot:'top',        name:'Cape',            price:800,  unlock:9  },
  { id:'top-apron',    slot:'top',        name:'Apron',           price:400,  unlock:6  },
  { id:'top-armour',   slot:'top',        name:'Little armour',   price:1200, unlock:14 },

  { id:'held-sword',   slot:'held',       name:'Tiny sword',      price:700,  unlock:6  },
  { id:'held-book',    slot:'held',       name:'Heavy book',      price:400,  unlock:2  },
  { id:'held-lantern', slot:'held',       name:'Lantern',         price:550,  unlock:7  },

  { id:'acc-glasses',  slot:'accessory',  name:'Round glasses',   price:400,  unlock:5  },
  { id:'acc-collar',   slot:'accessory',  name:'Bell collar',     price:300,  unlock:5  },
  { id:'acc-freckles', slot:'accessory',  name:'Freckles',        price:200,  unlock:5  },

  { id:'bg-meadow',    slot:'background', name:'Meadow',          price:600,  unlock:5  },
  { id:'bg-night',     slot:'background', name:'Night sky',       price:600,  unlock:8  },
  { id:'bg-hearth',    slot:'background', name:'Hearth',          price:600,  unlock:10 },
  { id:'bg-rose',      slot:'background', name:'Rose window',     price:900,  unlock:12 }
];

const FOOD = [
  { id:'food-kibble', name:'Plain kibble', price:40,  hunger:25, xp:0,   desc:'Does the job.' },
  { id:'food-fish',   name:'Good fish',    price:90,  hunger:55, xp:0,   desc:'A proper meal.' },
  { id:'food-feast',  name:'Feast',        price:180, hunger:100, xp:0,  desc:'Fills them right up.' },
  { id:'treat-cake',  name:'Honey cake',   price:500, hunger:40, xp:400, desc:'A treat that also teaches.' },
  { id:'treat-star',  name:'Star biscuit', price:1400, hunger:60, xp:1500, desc:'Expensive. Worth it.' }
];

const RECOLOR_PRICE = 750;

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
function canWear(pet, slot){ return stageOf(pet).dressable.includes(slot); }

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
function activeMonster(state){
  return (state.monsters || []).find(m => m.id === state.activeMonster && !m.dead) || null;
}
function damageMonster(state, amount){
  const m = activeMonster(state);
  if(!m || amount <= 0) return null;
  m.hp = Math.max(0, m.hp - amount);
  if(m.hp === 0){ m.dead = true; return m; }
  return null;
}

/* ---------- pet creation ---------- */
function rollPetOptions(count){
  const opts = [];
  for(let i=0;i<count;i++){
    const species = SPECIES_KEYS[Math.floor(Math.random()*SPECIES_KEYS.length)];
    const s = SPECIES[species];
    opts.push({
      species,
      colors: {
        body:   s.bodyColors[Math.floor(Math.random()*s.bodyColors.length)],
        accent: s.accentColors[Math.floor(Math.random()*s.accentColors.length)]
      }
    });
  }
  return opts;
}
function makePet(species, colors, name){
  return {
    id: 'p' + Math.random().toString(36).slice(2,10),
    species, name: name || 'Unnamed',
    colors: { body: colors.body, accent: colors.accent },
    tier: 'stable',
    xp: 0, hunger: 100,
    outfit: {},
    title: null
  };
}

/* ==========================================================================
   DRAWING
   One skeleton. Species changes ears, face and body silhouette; stage changes
   proportion. Every garment is drawn against the same coordinates, so
   anything fits anything.
   ========================================================================== */

const GEO = {
  baby:   { headR:30, headY:52, bodyRx:19, bodyRy:19, bodyY:95, eyeY:52, eyeX:10, eyeR:4.0 },
  child:  { headR:29, headY:52, bodyRx:22, bodyRy:22, bodyY:93, eyeY:52, eyeX:10, eyeR:3.8 },
  teen:   { headR:28, headY:52, bodyRx:25, bodyRy:25, bodyY:91, eyeY:51, eyeX:10, eyeR:3.6 },
  adult:  { headR:27, headY:51, bodyRx:27, bodyRy:27, bodyY:89, eyeY:50, eyeX:10, eyeR:3.5 },
  legend: { headR:27, headY:51, bodyRx:28, bodyRy:28, bodyY:88, eyeY:50, eyeX:10, eyeR:3.5 }
};

function backgroundSvg(id){
  if(id === 'bg-meadow') return `<rect x="0" y="0" width="100" height="120" rx="10" fill="#EAF3DE"/><ellipse cx="50" cy="112" rx="52" ry="16" fill="#C0DD97"/>`;
  if(id === 'bg-night')  return `<rect x="0" y="0" width="100" height="120" rx="10" fill="#26215C"/><circle cx="22" cy="22" r="2" fill="#CECBF6"/><circle cx="76" cy="16" r="1.6" fill="#CECBF6"/><circle cx="60" cy="30" r="1.4" fill="#CECBF6"/><circle cx="34" cy="38" r="1.4" fill="#CECBF6"/><circle cx="84" cy="42" r="2" fill="#CECBF6"/>`;
  if(id === 'bg-hearth') return `<rect x="0" y="0" width="100" height="120" rx="10" fill="#FAEEDA"/><rect x="18" y="60" width="64" height="60" fill="#F5C4B3"/><path d="M50 78 Q58 92 50 104 Q42 92 50 78 Z" fill="#EF9F27"/>`;
  if(id === 'bg-rose')   return `<rect x="0" y="0" width="100" height="120" rx="10" fill="#FBEAF0"/><circle cx="50" cy="46" r="34" fill="none" stroke="#ED93B1" stroke-width="2"/><circle cx="50" cy="46" r="22" fill="none" stroke="#ED93B1" stroke-width="1.5"/><circle cx="50" cy="46" r="10" fill="#F4C0D1"/>`;
  return '';
}

function earsSvg(species, g, colors){
  const y = g.headY, r = g.headR;
  if(species === 'cat'){
    return `<path d="M${50-r*0.72} ${y-r*0.55} L${50-r*0.88} ${y-r*1.5} L${50-r*0.16} ${y-r*1.02} Z" fill="${colors.body}"/>
            <path d="M${50+r*0.72} ${y-r*0.55} L${50+r*0.88} ${y-r*1.5} L${50+r*0.16} ${y-r*1.02} Z" fill="${colors.body}"/>`;
  }
  if(species === 'panda'){
    return `<circle cx="${50-r*0.85}" cy="${y-r*0.8}" r="${r*0.38}" fill="${colors.accent}"/>
            <circle cx="${50+r*0.85}" cy="${y-r*0.8}" r="${r*0.38}" fill="${colors.accent}"/>`;
  }
  return '';
}

function faceSvg(species, g, colors, m){
  const { headY:y, headR:r, eyeX:ex, eyeR:er } = g;
  const eyeY = g.eyeY;
  let out = '';

  if(species === 'panda'){
    out += `<ellipse cx="${50-ex}" cy="${eyeY-1}" rx="${er*2.3}" ry="${er*2.6}" fill="${colors.accent}"/>
            <ellipse cx="${50+ex}" cy="${eyeY-1}" rx="${er*2.3}" ry="${er*2.6}" fill="${colors.accent}"/>`;
  }
  if(species === 'penguin'){
    out += `<ellipse cx="50" cy="${y+r*0.22}" rx="${r*0.64}" ry="${r*0.72}" fill="${colors.accent}"/>`;
  }

  const eyeFill = species === 'panda' ? colors.body : (species === 'penguin' ? '#2C2C2A' : '#4B1528');
  if(m === 'low'){
    out += `<path d="M${50-ex-er} ${eyeY} Q${50-ex} ${eyeY+er*1.4} ${50-ex+er} ${eyeY}" stroke="${eyeFill}" stroke-width="2" fill="none" stroke-linecap="round"/>
            <path d="M${50+ex-er} ${eyeY} Q${50+ex} ${eyeY+er*1.4} ${50+ex+er} ${eyeY}" stroke="${eyeFill}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else {
    out += `<circle cx="${50-ex}" cy="${eyeY}" r="${er}" fill="${eyeFill}"/>
            <circle cx="${50+ex}" cy="${eyeY}" r="${er}" fill="${eyeFill}"/>`;
  }

  const mouthY = y + r*0.42;
  if(species === 'penguin'){
    out += `<path d="M${50-6} ${mouthY-2} L${50+6} ${mouthY-2} L50 ${mouthY+7} Z" fill="#EF9F27"/>`;
  } else if(m === 'happy'){
    out += `<path d="M${50-5} ${mouthY} Q50 ${mouthY+5} ${50+5} ${mouthY}" stroke="#4B1528" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else if(m === 'uneasy'){
    out += `<path d="M${50-5} ${mouthY+2} L${50+5} ${mouthY+2}" stroke="#4B1528" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else {
    out += `<path d="M${50-5} ${mouthY+4} Q50 ${mouthY-2} ${50+5} ${mouthY+4}" stroke="#4B1528" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  return out;
}

function garmentSvg(id, g){
  const y = g.headY, r = g.headR, by = g.bodyY, brx = g.bodyRx;
  switch(id){
    case 'hat-crown':
      return `<path d="M${50-r*0.8} ${y-r*0.86} L${50-r*0.86} ${y-r*1.42} L${50-r*0.3} ${y-r*1.06} L50 ${y-r*1.58} L${50+r*0.3} ${y-r*1.06} L${50+r*0.86} ${y-r*1.42} L${50+r*0.8} ${y-r*0.86} Z" fill="#C9A227" stroke="#7C5B30" stroke-width="1.2" stroke-linejoin="round"/>`;
    case 'hat-bow':
      return `<path d="M${50-r*0.9} ${y-r*0.95} L${50-r*0.2} ${y-r*1.2} L${50-r*0.9} ${y-r*1.45} Z" fill="#E87CA6"/>
              <path d="M${50+r*0.9} ${y-r*0.95} L${50+r*0.2} ${y-r*1.2} L${50+r*0.9} ${y-r*1.45} Z" fill="#E87CA6"/>
              <circle cx="50" cy="${y-r*1.2}" r="4" fill="#C85D87"/>`;
    case 'hat-wizard':
      return `<path d="M${50-r*0.78} ${y-r*0.9} L50 ${y-r*2.1} L${50+r*0.78} ${y-r*0.9} Z" fill="#534AB7"/>
              <rect x="${50-r*0.95}" y="${y-r*0.98}" width="${r*1.9}" height="6" rx="3" fill="#3C3489"/>`;
    case 'hat-flower':
      return `<circle cx="${50-r*0.6}" cy="${y-r*0.98}" r="5" fill="#ED93B1"/>
              <circle cx="50" cy="${y-r*1.12}" r="5.5" fill="#F4C0D1"/>
              <circle cx="${50+r*0.6}" cy="${y-r*0.98}" r="5" fill="#ED93B1"/>
              <circle cx="50" cy="${y-r*1.12}" r="2" fill="#C9A227"/>`;

    case 'hair-braids':
      return `<path d="M${50-r} ${y-r*0.2} Q${50-r*1.25} ${y+r*0.9} ${50-r*0.8} ${y+r*1.35}" stroke="#7C5B30" stroke-width="7" fill="none" stroke-linecap="round"/>
              <path d="M${50+r} ${y-r*0.2} Q${50+r*1.25} ${y+r*0.9} ${50+r*0.8} ${y+r*1.35}" stroke="#7C5B30" stroke-width="7" fill="none" stroke-linecap="round"/>`;
    case 'hair-curls':
      return `<circle cx="${50-r*0.95}" cy="${y-r*0.5}" r="7" fill="#6E2430"/>
              <circle cx="${50+r*0.95}" cy="${y-r*0.5}" r="7" fill="#6E2430"/>
              <circle cx="${50-r*0.5}" cy="${y-r*0.95}" r="7" fill="#6E2430"/>
              <circle cx="${50+r*0.5}" cy="${y-r*0.95}" r="7" fill="#6E2430"/>`;
    case 'hair-long':
      return `<path d="M${50-r} ${y-r*0.35} Q${50-r*1.3} ${y+r*1.6} ${50-r*0.55} ${y+r*2.0} L${50-r*0.35} ${y+r*1.2} Z" fill="#2C2C2A"/>
              <path d="M${50+r} ${y-r*0.35} Q${50+r*1.3} ${y+r*1.6} ${50+r*0.55} ${y+r*2.0} L${50+r*0.35} ${y+r*1.2} Z" fill="#2C2C2A"/>`;

    case 'top-scarf':
      return `<rect x="${50-brx*0.85}" y="${by-brx*0.92}" width="${brx*1.7}" height="9" rx="4" fill="#B23A3A"/>
              <rect x="${50+brx*0.15}" y="${by-brx*0.75}" width="8" height="18" rx="3" fill="#B23A3A"/>`;
    case 'top-cape':
      return `<path d="M${50-brx*0.9} ${by-brx*0.85} Q${50-brx*1.5} ${by+brx*0.7} ${50-brx*0.5} ${by+brx*1.0} L${50+brx*0.5} ${by+brx*1.0} Q${50+brx*1.5} ${by+brx*0.7} ${50+brx*0.9} ${by-brx*0.85} Z" fill="#6E2430" opacity="0.92"/>`;
    case 'top-apron':
      return `<path d="M${50-brx*0.5} ${by-brx*0.8} L${50+brx*0.5} ${by-brx*0.8} L${50+brx*0.62} ${by+brx*0.85} L${50-brx*0.62} ${by+brx*0.85} Z" fill="#F1EFE8" stroke="#D3D1C7" stroke-width="1"/>
              <rect x="${50-brx*0.5}" y="${by-brx*0.85}" width="${brx}" height="4" rx="2" fill="#8FA37E"/>`;
    case 'top-armour':
      return `<path d="M${50-brx*0.72} ${by-brx*0.78} L${50+brx*0.72} ${by-brx*0.78} L${50+brx*0.6} ${by+brx*0.6} L${50-brx*0.6} ${by+brx*0.6} Z" fill="#B4B2A9" stroke="#5F5E5A" stroke-width="1.4"/>
              <path d="M50 ${by-brx*0.78} L50 ${by+brx*0.6}" stroke="#5F5E5A" stroke-width="1.2"/>`;

    case 'held-sword':
      return `<rect x="${50+brx*0.92}" y="${by-22}" width="4" height="26" rx="1.5" fill="#B23A3A"/>
              <rect x="${50+brx*0.62}" y="${by+4}" width="14" height="4" rx="2" fill="#9C7440"/>
              <rect x="${50+brx*0.86}" y="${by+8}" width="6" height="9" rx="2" fill="#7C1F2A"/>`;
    case 'held-book':
      return `<rect x="${50+brx*0.62}" y="${by-6}" width="18" height="14" rx="2" fill="#6E2430"/>
              <rect x="${50+brx*0.68}" y="${by-4}" width="14" height="10" rx="1" fill="#F7F1E4"/>`;
    case 'held-lantern':
      return `<path d="M${50+brx*0.92} ${by-20} L${50+brx*0.92} ${by-9}" stroke="#7C5B30" stroke-width="2"/>
              <rect x="${50+brx*0.66}" y="${by-9}" width="14" height="15" rx="3" fill="#C9A227" stroke="#7C5B30" stroke-width="1.2"/>`;

    case 'acc-glasses':
      return `<circle cx="${50-g.eyeX}" cy="${g.eyeY}" r="${g.eyeR*2.1}" fill="none" stroke="#7C5B30" stroke-width="1.6"/>
              <circle cx="${50+g.eyeX}" cy="${g.eyeY}" r="${g.eyeR*2.1}" fill="none" stroke="#7C5B30" stroke-width="1.6"/>
              <path d="M${50-g.eyeX+g.eyeR*2.1} ${g.eyeY} L${50+g.eyeX-g.eyeR*2.1} ${g.eyeY}" stroke="#7C5B30" stroke-width="1.6"/>`;
    case 'acc-collar':
      return `<rect x="${50-brx*0.62}" y="${by-brx*0.98}" width="${brx*1.24}" height="6" rx="3" fill="#E87CA6"/>
              <circle cx="50" cy="${by-brx*0.78}" r="4" fill="#C9A227"/>`;
    case 'acc-freckles':
      return `<circle cx="${50-g.eyeX-4}" cy="${g.eyeY+9}" r="1.4" fill="#C85D87"/>
              <circle cx="${50-g.eyeX+1}" cy="${g.eyeY+12}" r="1.4" fill="#C85D87"/>
              <circle cx="${50+g.eyeX+4}" cy="${g.eyeY+9}" r="1.4" fill="#C85D87"/>
              <circle cx="${50+g.eyeX-1}" cy="${g.eyeY+12}" r="1.4" fill="#C85D87"/>`;
  }
  return '';
}

/* Draws a pet. opts: { size, showBackground } */
function petSvg(pet, opts){
  opts = opts || {};
  const stage = stageOf(pet);
  const g = GEO[stage.key];
  const colors = pet.colors || { body:'#ED93B1', accent:'#D4537E' };
  const m = mood(pet);
  const outfit = pet.outfit || {};
  const wearable = s => canWear(pet, s) && outfit[s];

  let svg = `<svg viewBox="0 0 100 120" width="100%" ${opts.size ? `style="max-width:${opts.size}px"` : ''} role="img" aria-label="${escapeAttr(pet.name)}, a ${SPECIES[pet.species].name.toLowerCase()} at ${stage.name.toLowerCase()} stage">`;

  if(opts.showBackground !== false && wearable('background')) svg += backgroundSvg(outfit.background);
  if(wearable('hair') && outfit.hair === 'hair-long') svg += garmentSvg('hair-long', g);

  svg += `<ellipse cx="50" cy="${g.bodyY}" rx="${g.bodyRx}" ry="${g.bodyRy}" fill="${colors.body}"/>`;
  if(pet.species === 'penguin'){
    svg += `<ellipse cx="50" cy="${g.bodyY+3}" rx="${g.bodyRx*0.62}" ry="${g.bodyRy*0.78}" fill="${colors.accent}"/>`;
  }

  if(wearable('top')) svg += garmentSvg(outfit.top, g);

  svg += earsSvg(pet.species, g, colors);
  svg += `<circle cx="50" cy="${g.headY}" r="${g.headR}" fill="${colors.body}"/>`;

  if(wearable('hair') && outfit.hair !== 'hair-long') svg += garmentSvg(outfit.hair, g);

  svg += faceSvg(pet.species, g, colors, m);

  if(wearable('accessory')) svg += garmentSvg(outfit.accessory, g);
  if(wearable('hat'))       svg += garmentSvg(outfit.hat, g);
  if(wearable('held'))      svg += garmentSvg(outfit.held, g);

  if(stage.key === 'legend'){
    svg += `<circle cx="22" cy="24" r="2.2" fill="#C9A227"/><circle cx="78" cy="20" r="1.8" fill="#C9A227"/><circle cx="84" cy="70" r="2" fill="#C9A227"/>`;
  }

  svg += `</svg>`;
  return svg;
}

function escapeAttr(s){ return String(s == null ? '' : s).replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

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
    pets:[], petTokens:0, hungerDate:null,
    wardrobe:{}, fragments:{ prefix:[], subject:[] },
    monsters:[], activeMonster:null
  };
}

function migrate(s){
  const d = defaultState();
  for(const k in d){ if(s[k] === undefined) s[k] = d[k]; }
  if(!Array.isArray(s.tags) || !s.tags.length) s.tags = d.tags;
  COLUMNS.forEach(k => { if(!Array.isArray(s[k])) s[k] = []; });
  ['pets','monsters','shop','vacations'].forEach(k => { if(!Array.isArray(s[k])) s[k] = []; });
  s.targets = Object.assign({}, DEFAULT_TARGETS, s.targets || {});
  s.rates   = Object.assign({}, SEED_RATES, s.rates || {});
  if(!s.fragments || !Array.isArray(s.fragments.prefix)) s.fragments = { prefix:[], subject:[] };
  if(typeof s.wardrobe !== 'object' || s.wardrobe === null) s.wardrobe = {};
  delete s.work; delete s.hp; delete s.maxHp; delete s.closet; delete s.worn;
  return s;
}

const STORE_KEY = 'questlog-danni-v5';

function makeStore(firebase){
  const db = firebase.firestore();
  const ref = db.collection('questlog').doc('danni-quest-log');
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
          const raw = localStorage.getItem(STORE_KEY);
          state = raw ? migrate(JSON.parse(raw)) : defaultState();
          await ref.set(state);
        }
      } catch(err){
        console.error('Firestore read failed, using local copy:', err);
        const raw = localStorage.getItem(STORE_KEY);
        state = raw ? migrate(JSON.parse(raw)) : defaultState();
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return state;
    },
    save(){
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      ref.set(state).catch(err => console.error('Sync to Firestore failed:', err));
    },
    reset(){ state = defaultState(); return state; }
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
  TODAY, TODAY_KEY, MIN_DATE, BACKFILL_DAYS, SEED_RATES, DEFAULT_TARGETS,
  startOfDay, addDays, dateKey, fromKey, sameDay, daysBetween, mondayOf,
  defaultState, migrate, makeStore,
  isScheduled, repeatSummary, makeCtx, isVacation, vacationActive,
  ageMultiplier, getStreak, taskValue, subtaskValue, bonusValue,
  addCurrency, removeCurrency, spendCurrency, ledgerWeek, recalibrate,
  addAccountXP,
  stageOf, stageIndex, petLevel, nextStage, stageProgress, canWear, mood,
  legendBuffs, partySlots, nextSlotLevel, activePet, partyPets, stablePets,
  settleHunger, liveHunger, feed, awardPetXP,
  ensureFragments, addFragment, randomPrefix, titleText,
  activeMonster, damageMonster,
  rollPetOptions, makePet, petSvg
};

})();
