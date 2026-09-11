/* ==========================================================================
   Princess & Paladin — The Writing Room
   /assets/pp-rp.js

   Loaded by every page under /dannelore/rp/. Owns: the Firestore store, the
   shape of every record, the Markdown renderer, [[wikilink]] resolution,
   backlinks, the timeline order, and the small pieces of markup (faces, mini
   profiles, pills) that more than one page draws.

   ONE UNIVERSE
   One cast, one wiki, one timeline. Threads are the storylines woven through
   it; every scene belongs to one thread and sits somewhere on the timeline.

   STORAGE
   Firestore collection `writingroom`, one document per record:

     thread-{id}   a storyline
     scene-{id}    a scene, including its posts
     cast-{id}     a character
     wiki-{id}     a wiki entry
     draft-{id}    the unsent composer text for scene {id}

   Separate documents so that saving one thing only ever rewrites that thing.
   A wiki edit in one tab can't clobber a post written in another, and no
   single document creeps toward Firestore's 1 MB ceiling as the prose grows.
   ========================================================================== */

window.RP = (function(){
  "use strict";

  var firebaseConfig = {
    apiKey: "AIzaSyAdNZBoh1pH80-ZFBbOlcrlsLdMi3D62Wg",
    authDomain: "princess-paladin.firebaseapp.com",
    projectId: "princess-paladin",
    storageBucket: "princess-paladin.appspot.com",
    messagingSenderId: "282931655557",
    appId: "1:282931655557:web:cae6ccd23f32cb9be54aec"
  };

  var COLLECTION = "writingroom";
  var CACHE_KEY  = "writingroom-v1";
  var OUTBOX_KEY = "writingroom-v1-outbox";   /* changes Firestore hasn't confirmed */
  var SYNCED_KEY = "writingroom-v1-synced";   /* set once this device has reached Firestore */
  var BASE       = "/dannelore/rp/";

  var TYPES = ["thread","scene","cast","wiki","draft"];

  /* ---------------- vocabulary ---------------- */

  var STATES = [
    { key:"writing",  label:"Writing"  },
    { key:"resting",  label:"Resting"  },
    { key:"finished", label:"Finished" }
  ];

  /* Wiki entries are typed so the sidebar can group them. People aren't a
     kind — they live in the cast, and [[links]] reach them there. */
  var KINDS = {
    place: { label:"Place", color:"#6D8259" },
    group: { label:"Group", color:"#523862" },
    thing: { label:"Thing", color:"#7C5B30" },
    event: { label:"Event", color:"#6E2430" },
    idea:  { label:"Idea",  color:"#C85D87" }
  };
  var KIND_KEYS = Object.keys(KINDS);

  /* Swatches for threads and characters. All from pp.css, all dark enough to
     carry white text. */
  var COLORS = [
    { name:"Rose",     hex:"#C85D87" },
    { name:"Dusk",     hex:"#6B4A78" },
    { name:"Sage",     hex:"#6D8259" },
    { name:"Gold",     hex:"#9C7440" },
    { name:"Burgundy", hex:"#6E2430" },
    { name:"Blade",    hex:"#B23A3A" },
    { name:"Pumpkin",  hex:"#A4501C" },
    { name:"Teal",     hex:"#5A8A7A" },
    { name:"Ink",      hex:"#4A4441" }
  ];

  var NARRATION = { id:"narration", name:"Narration", color:"#9C7440" };

  var MINI_FACT_LIMIT = 4;

  /* ---------------- small helpers ---------------- */

  function esc(s){
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  function uid(){
    return Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
  }

  function $(id){ return document.getElementById(id); }

  function param(name){
    try{ return new URLSearchParams(location.search).get(name); }catch(e){ return null; }
  }

  function safeColor(c, fallback){
    return /^#[0-9a-fA-F]{3,8}$/.test(String(c || "")) ? c : (fallback || "#9C7440");
  }

  /* Only http(s) and site-relative paths make it into a src or href. */
  function safeUrl(u){
    var s = String(u || "").trim();
    if(!s) return "";
    if(/^https?:\/\//i.test(s) || /^\/(?!\/)/.test(s)) return s;
    return "";
  }

  function todayISO(){
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  }

  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var MON    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function parseISO(k){
    var m = /^(-?\d{1,6})-(\d{2})-(\d{2})/.exec(String(k || ""));
    if(!m) return null;
    return { y:+m[1], m:+m[2], d:+m[3] };
  }

  /* "8 Sep", or "8 Sep 2025" when it isn't this year. */
  function shortDate(k){
    var p = parseISO(k);
    if(!p) return "";
    var s = p.d + " " + MON[p.m-1];
    return p.y === new Date().getFullYear() ? s : s + " " + p.y;
  }

  function longDate(k){
    var p = parseISO(k);
    if(!p) return "";
    return p.d + " " + MONTHS[p.m-1] + " " + p.y;
  }

  function relative(k){
    var p = parseISO(k);
    if(!p) return "";
    var then = new Date(p.y, p.m-1, p.d);
    var now  = new Date(); now.setHours(0,0,0,0);
    var days = Math.round((now - then) / 86400000);
    if(days <= 0)  return "today";
    if(days === 1) return "yesterday";
    if(days < 14)  return days + " days ago";
    if(days < 60)  return Math.round(days/7) + " weeks ago";
    return shortDate(k);
  }

  function plural(n, one, many){ return n.toLocaleString() + " " + (n === 1 ? one : (many || one + "s")); }

  /* ---------------- story dates ----------------
     A scene's place on the timeline is a real calendar date plus an optional
     time, which is what sorts it. `label` is what's shown, when the story
     keeps its own calendar — "the 14th of Hollow" still needs a stand-in date
     so it knows where it goes. */
  function storyKey(rec){
    var w = rec && rec.when;
    if(!w || !parseISO(w.date)) return null;
    return w.date + "T" + (/^\d{2}:\d{2}$/.test(w.time || "") ? w.time : "99:99");
  }

  function storyLabel(rec){
    var w = (rec && rec.when) || {};
    if(w.label) return w.label;
    if(!parseISO(w.date)) return "";
    return longDate(w.date) + (w.time ? ", " + w.time : "");
  }

  /* ---------------- birthdays ----------------
     A character's birthday is a real calendar date, like a scene's, with an
     optional "shown as" for the story's own calendar. Their age is worked out
     against whichever scene you're looking at, so the same person is 19 in
     one thread and 23 in another without anyone updating anything. */
  function ageOn(born, on){
    var b = parseISO(born), d = parseISO(on);
    if(!b || !d) return null;
    var early = d.m < b.m || (d.m === b.m && d.d < b.d);
    var years = d.y - b.y - (early ? 1 : 0);
    if(years < 0) return null;   /* not born yet */
    var months = (d.y - b.y) * 12 + (d.m - b.m) - (d.d < b.d ? 1 : 0);
    return { years:years, months:months, birthday: d.m === b.m && d.d === b.d };
  }

  function ageText(a){
    if(!a) return "";
    var n = a.years >= 1 ? String(a.years)
          : (a.months >= 1 ? plural(a.months, "month") : "Newborn");
    return a.birthday && a.years >= 1 ? n + " \u00b7 birthday" : n;
  }

  function bornLabel(p){
    var b = (p && p.born) || {};
    return b.label || (parseISO(b.date) ? longDate(b.date) : "");
  }

  /* ==========================================================================
     STORE
     ========================================================================== */

  var state = { threads:[], scenes:[], cast:[], wiki:[], drafts:{} };
  var db = null;
  var online = false;
  var lastError = null;   /* Firestore's error code, so the readout can say why */
  var pending = 0;
  var syncEls = [];

  function docId(type, id){ return type + "-" + id; }

  function listFor(type){
    return { thread:state.threads, scene:state.scenes, cast:state.cast, wiki:state.wiki }[type];
  }

  function clean(obj){
    /* Firestore rejects undefined; JSON round-trip drops it. */
    return JSON.parse(JSON.stringify(obj));
  }

  function normalizeRecord(type, r){
    r.type = type;
    if(type === "scene"){
      if(!Array.isArray(r.posts)) r.posts = [];
      if(!Array.isArray(r.cast))  r.cast = [];
      if(!r.when || typeof r.when !== "object") r.when = {};
      if(!STATES.some(function(s){ return s.key === r.state; })) r.state = "writing";
    }
    if(type === "cast"){
      if(!Array.isArray(r.aka))   r.aka = [];
      if(!Array.isArray(r.facts)) r.facts = [];
      if(!Array.isArray(r.sheet)) r.sheet = [];
      if(!r.born || typeof r.born !== "object") r.born = {};
    }
    if(type === "wiki"){
      if(!Array.isArray(r.aka)) r.aka = [];
      if(!KINDS[r.kind]) r.kind = "idea";
      if(!r.when || typeof r.when !== "object") r.when = {};
    }
    return r;
  }

  function ingest(docs){
    state = { threads:[], scenes:[], cast:[], wiki:[], drafts:{} };
    Object.keys(docs).forEach(function(key){
      var r = docs[key];
      if(!r || TYPES.indexOf(r.type) < 0 || !r.id) return;
      if(r.type === "draft"){ state.drafts[r.id] = r; return; }
      listFor(r.type).push(normalizeRecord(r.type, r));
    });
  }

  function snapshotDocs(){
    var out = {};
    ["thread","scene","cast","wiki"].forEach(function(t){
      listFor(t).forEach(function(r){ out[docId(t, r.id)] = r; });
    });
    Object.keys(state.drafts).forEach(function(id){ out[docId("draft", id)] = state.drafts[id]; });
    return out;
  }

  function writeCache(){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(snapshotDocs())); }
    catch(e){ console.warn("Couldn't write the local copy:", e); }
  }

  function readCache(){
    try{ return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); }
    catch(e){ return null; }
  }

  /* ---------------- outbox ----------------
     Every save and delete is written here first and crossed off only when
     Firestore confirms it. Anything still listed when the page next reaches
     Firestore gets sent then — so work done while disconnected is uploaded
     rather than overwritten by the (older, or empty) copy in the cloud. */

  function readOutbox(){
    try{ return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "{}") || {}; }
    catch(e){ return {}; }
  }

  function outboxAdd(key, op){
    var box = readOutbox();
    box[key] = { op:op, at:new Date().toISOString() };
    try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify(box)); }catch(e){}
    return box[key].at;
  }

  /* Only cross it off if nothing newer has been queued for the same record. */
  function outboxDone(key, at){
    var box = readOutbox();
    if(box[key] && box[key].at === at) delete box[key];
    try{ localStorage.setItem(OUTBOX_KEY, JSON.stringify(box)); }catch(e){}
  }

  /* ---------------- sync readout ---------------- */

  function setSync(text, s){
    syncEls.forEach(function(el){
      el.textContent = text;
      if(s) el.setAttribute("data-state", s); else el.removeAttribute("data-state");
    });
  }

  function watchSync(el){ if(el) syncEls.push(el); }

  function refreshSync(){
    if(!db)          return setSync(lastError === "permission-denied"
                       ? "Not connected \u2014 Firestore rules are blocking this"
                       : "Offline \u2014 saved on this device", "error");
    if(lastError === "permission-denied") return setSync("Firestore refused that save \u2014 check the rules", "error");
    if(pending > 0)  return setSync("Saving\u2026", "saving");
    setSync(online ? "Saved" : "Saved on this device", online ? "" : "error");
  }

  var leaving = false;

  window.addEventListener("beforeunload", function(e){
    if(pending > 0 && !leaving){ e.preventDefault(); e.returnValue = ""; }
  });

  /* Navigate once a save has had a moment to land. Offline persistence has
     it safely queued within milliseconds; the server ack can take longer and
     isn't worth waiting on. */
  function go(url, promise){
    var wait = new Promise(function(r){ setTimeout(r, 1500); });
    Promise.race([promise || Promise.resolve(), wait]).then(function(){
      leaving = true;
      location.href = url;
    });
  }

  /* ---------------- load ---------------- */

  async function load(){
    setSync("Loading\u2026", "saving");

    try{
      if(!window.firebase) throw new Error("Firebase didn't load");
      if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();

      /* Offline persistence queues writes in IndexedDB, so a post written on
         a train still reaches Firestore once there's signal — even across a
         reload. Only one tab can own it without synchronizeTabs. */
      if(db.enablePersistence){
        try{ await db.enablePersistence({ synchronizeTabs:true }); }
        catch(err){ /* already enabled, or a browser that can't */ }
      }

      var snap = await db.collection(COLLECTION).get();
      var docs = {};
      snap.forEach(function(d){ docs[d.id] = d.data(); });
      online = !(snap.metadata && snap.metadata.fromCache);
      lastError = null;
      var uploads = reconcile(docs);
      ingest(docs);
      writeCache();
      uploads.forEach(function(fn){ fn(); });
      if(online){ try{ localStorage.setItem(SYNCED_KEY, new Date().toISOString()); }catch(e){} }
    }catch(err){
      console.error("Firestore unavailable, working from the local copy:", err);
      lastError = (err && err.code) || null;
      db = null;
      ingest(readCache() || {});
    }

    refreshSync();
    return state;
  }

  /* Merge what this device has waiting into what Firestore sent. Mutates
     `docs`; returns the uploads to start once state is in place.

     A device that has never reached Firestore treats its whole local copy as
     waiting — that covers everything written before the outbox existed. A
     record changed in both places keeps whichever was saved last. */
  function reconcile(docs){
    var local = readCache() || {};
    var box = readOutbox();
    var ever = false;
    try{ ever = !!localStorage.getItem(SYNCED_KEY); }catch(e){}

    if(!ever){
      Object.keys(local).forEach(function(key){
        if(!box[key]) box[key] = { op:"set", at:"" };
      });
    }

    var uploads = [];
    Object.keys(box).forEach(function(key){
      var job = box[key];
      var ref = db.collection(COLLECTION).doc(key);

      if(job.op === "delete"){
        delete docs[key];
        uploads.push(function(){ track(ref.delete(), key, job.at); });
        return;
      }

      var mine = local[key];
      if(!mine){ outboxDone(key, job.at); return; }
      var theirs = docs[key];
      if(theirs && String(theirs.updated || "") > String(mine.updated || "")){
        outboxDone(key, job.at);
        return;
      }
      docs[key] = mine;
      uploads.push(function(){ track(ref.set(clean(mine)), key, job.at); });
    });
    return uploads;
  }

  /* ---------------- save + delete ---------------- */

  function track(promise, key, at){
    pending++;
    refreshSync();

    /* A write made offline doesn't resolve until it reaches the server. Say
       so after a moment rather than spinning on "Saving…" forever. */
    var slow = setTimeout(function(){
      if(pending > 0){ online = false; setSync("Saved on this device \u2014 will sync", "error"); }
    }, 4000);

    return promise.then(function(){
      online = true;
      lastError = null;
      if(key) outboxDone(key, at);
    }).catch(function(err){
      console.error("Sync to Firestore failed:", err);
      online = false;
      lastError = (err && err.code) || null;
    }).then(function(){
      clearTimeout(slow);
      pending = Math.max(0, pending - 1);
      refreshSync();
    });
  }

  function save(type, rec){
    rec.type = type;
    rec.updated = new Date().toISOString();

    if(type === "draft"){
      state.drafts[rec.id] = rec;
    } else {
      var list = listFor(type);
      var i = list.findIndex(function(r){ return r.id === rec.id; });
      if(i < 0) list.push(rec); else list[i] = rec;
    }
    writeCache();
    var key = docId(type, rec.id);
    var at = outboxAdd(key, "set");

    if(!db){ refreshSync(); return Promise.resolve(); }
    return track(db.collection(COLLECTION).doc(key).set(clean(rec)), key, at);
  }

  function remove(type, id){
    if(type === "draft"){
      delete state.drafts[id];
    } else {
      var list = listFor(type);
      var i = list.findIndex(function(r){ return r.id === id; });
      if(i > -1) list.splice(i, 1);
    }
    writeCache();
    var key = docId(type, id);
    var at = outboxAdd(key, "delete");

    if(!db){ refreshSync(); return Promise.resolve(); }
    return track(db.collection(COLLECTION).doc(key).delete(), key, at);
  }

  /* ---------------- lookups ---------------- */

  function byId(list, id){ return list.find(function(r){ return r.id === id; }) || null; }
  function thread(id){ return byId(state.threads, id); }
  function scene(id){  return byId(state.scenes, id); }
  function person(id){ return id === "narration" ? NARRATION : byId(state.cast, id); }
  function entry(id){  return byId(state.wiki, id); }

  /* The latest story date this character is in — posting, or listed on the
     scene. Used where there's no scene to measure their age against. */
  function latestDate(castId){
    var best = null;
    state.scenes.forEach(function(sc){
      var d = sc.when && sc.when.date;
      if(!parseISO(d)) return;
      var here = (sc.cast || []).indexOf(castId) > -1 ||
                 (sc.posts || []).some(function(p){ return p.who === castId; });
      if(here && (!best || d > best)) best = d;
    });
    return best;
  }

  /* Every word that links to a record: the name first, then its link words. */
  function linkWords(kind, r){
    return [kind === "wiki" ? r.title : r.name].concat(r.aka || []).filter(Boolean);
  }

  function sortByName(list, key){
    return list.slice().sort(function(a,b){
      return String(a[key] || "").localeCompare(String(b[key] || ""), undefined, { sensitivity:"base" });
    });
  }

  function castSorted(){   return sortByName(state.cast, "name"); }
  function wikiSorted(){   return sortByName(state.wiki, "title"); }
  function threadsSorted(){ return sortByName(state.threads, "name"); }

  function threadColor(sc){
    var t = sc && thread(sc.thread);
    return safeColor(t && t.color, "#9C7440");
  }

  /* ==========================================================================
     WORDS
     ========================================================================== */

  var LINK_RE = /\[\[([^\[\]|\n]+)(?:\|([^\[\]\n]+))?\]\]/g;

  function plainText(md){
    return String(md || "")
      .replace(LINK_RE, function(m, t, shown){ return shown || t; })
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
      .replace(/^\s*([-*_]\s*){3,}$/gm, "")
      .replace(/[*_~`]/g, "");
  }

  function wordCount(md){
    var t = plainText(md).trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function sceneWords(sc){
    return (sc.posts || []).reduce(function(n, p){ return n + wordCount(p.md); }, 0);
  }

  /* First and last day anything was written into a scene. */
  function writtenRange(sc){
    var days = (sc.posts || []).map(function(p){ return p.written; }).filter(parseISO).sort();
    if(!days.length) return null;
    return { first:days[0], last:days[days.length-1] };
  }

  function writtenLabel(sc){
    var r = writtenRange(sc);
    if(!r) return "nothing written yet";
    if(r.first === r.last) return "written " + shortDate(r.first);
    return "written " + shortDate(r.first) + " \u2013 " + shortDate(r.last);
  }

  function lastTouched(sc){
    var r = writtenRange(sc);
    return (r && r.last) || sc.created || "";
  }

  /* ==========================================================================
     WIKILINKS
     [[Title]] or [[Title|what to show]]. Resolved against wiki titles and
     aliases first, then cast names and aliases, ignoring case, extra spaces
     and curly apostrophes. An unresolved link renders as plain text — a name
     without an entry yet is a normal state, not an error.
     ========================================================================== */

  function norm(s){
    return String(s || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
  }

  function namesOf(kind, r){
    var primary = kind === "wiki" ? r.title : r.name;
    return [primary].concat(r.aka || []).map(norm).filter(Boolean);
  }

  function resolve(name){
    var n = norm(name);
    if(!n) return null;
    var w = state.wiki.find(function(r){ return namesOf("wiki", r).indexOf(n) > -1; });
    if(w) return { kind:"wiki", rec:w };
    var c = state.cast.find(function(r){ return namesOf("cast", r).indexOf(n) > -1; });
    if(c) return { kind:"cast", rec:c };
    return null;
  }

  function hrefFor(hit){
    if(!hit) return "";
    return hit.kind === "wiki" ? wikiUrl(hit.rec.id) : castUrl(hit.rec.id);
  }

  function linksIn(md){
    var out = [], m;
    LINK_RE.lastIndex = 0;
    while((m = LINK_RE.exec(String(md || ""))) !== null){
      out.push({ target:m[1].trim(), shown:(m[2] || m[1]).trim(), index:m.index });
    }
    return out;
  }

  /* A short quote around a link, with the link syntax stripped out. */
  function snippet(md, index){
    var src = String(md || "");
    var start = Math.max(0, src.lastIndexOf("\n", index) + 1);
    var end = src.indexOf("\n", index); if(end < 0) end = src.length;
    var line = plainText(src.slice(start, end)).trim();
    if(line.length <= 110) return line;
    var at = plainText(src.slice(start, index)).length;
    var from = Math.max(0, at - 45);
    return (from > 0 ? "\u2026" : "") + line.slice(from, from + 105).trim() + "\u2026";
  }

  /* Every text a link can live in, as { source, md }. */
  function allTexts(){
    var out = [];
    state.scenes.forEach(function(sc){
      (sc.posts || []).forEach(function(p){
        out.push({ kind:"post", scene:sc, post:p, md:p.md });
      });
    });
    state.wiki.forEach(function(w){
      out.push({ kind:"wiki", rec:w, md:(w.summary || "") + "\n" + (w.md || "") });
    });
    state.cast.forEach(function(c){
      var md = (c.sheet || []).map(function(s){ return s.text || ""; }).join("\n") + "\n" +
               (c.facts || []).map(function(f){ return f.value || ""; }).join("\n");
      out.push({ kind:"cast", rec:c, md:md });
    });
    return out;
  }

  /* Backlinks, read out of the writing so they can never go stale.
     Returns { scenes:[{scene, post, quote, count}], pages:[{kind, rec}] } */
  function backlinks(kind, rec){
    var scenes = [], pages = [];
    allTexts().forEach(function(t){
      var hits = linksIn(t.md).filter(function(l){
        var r = resolve(l.target);
        return r && r.kind === kind && r.rec.id === rec.id;
      });
      if(!hits.length) return;

      if(t.kind === "post"){
        var existing = scenes.find(function(s){ return s.scene.id === t.scene.id; });
        if(existing){ existing.count += hits.length; return; }
        scenes.push({ scene:t.scene, post:t.post, quote:snippet(t.md, hits[0].index), count:hits.length });
      } else {
        if(t.kind === kind && t.rec.id === rec.id) return;   /* links to itself */
        if(!pages.some(function(p){ return p.rec.id === t.rec.id && p.kind === t.kind; })){
          pages.push({ kind:t.kind, rec:t.rec });
        }
      }
    });

    scenes.sort(function(a,b){ return compareStory(a.scene, b.scene); });
    return { scenes:scenes, pages:pages };
  }

  /* Links that point at nothing yet, most-used first. */
  function unresolved(){
    var seen = {};
    allTexts().forEach(function(t){
      linksIn(t.md).forEach(function(l){
        if(resolve(l.target)) return;
        var k = norm(l.target);
        if(!seen[k]) seen[k] = { name:l.target, count:0 };
        seen[k].count++;
      });
    });
    return Object.keys(seen).map(function(k){ return seen[k]; })
      .sort(function(a,b){ return b.count - a.count || a.name.localeCompare(b.name); });
  }

  /* When something is renamed, keep the old name as an alias if the writing
     still uses it — otherwise every existing link to it quietly goes dead. */
  function keepOldName(kind, rec, oldName){
    var o = norm(oldName);
    if(!o) return false;
    if(namesOf(kind, rec).indexOf(o) > -1) return false;
    var used = allTexts().some(function(t){
      return linksIn(t.md).some(function(l){ return norm(l.target) === o; });
    });
    if(!used) return false;
    rec.aka = (rec.aka || []).concat([oldName.trim()]);
    return true;
  }

  /* ==========================================================================
     MARKDOWN
     A small renderer that covers what prose needs: paragraphs, *italic*,
     **bold**, ~~strike~~, headings, > quotes, lists, --- breaks, [links](url)
     and [[wikilinks]]. Everything is escaped first, so nothing typed into a
     post can become markup it didn't ask for.

     One deliberate difference from strict Markdown: a single line break is
     kept as a line break. A blank line starts a new paragraph.
     ========================================================================== */

  function inline(src){
    var tokens = [];
    function stash(html){ tokens.push(html); return "\u0000" + (tokens.length - 1) + "\u0000"; }

    var s = String(src || "");

    /* backslash escapes */
    s = s.replace(/\\([\\*_~`\[\]#>|-])/g, function(m, ch){ return stash(esc(ch)); });

    /* inline code */
    s = s.replace(/`([^`\n]+)`/g, function(m, code){ return stash("<code>" + esc(code) + "</code>"); });

    /* wikilinks */
    s = s.replace(LINK_RE, function(m, target, shown){
      var hit = resolve(target);
      var label = inlineNoLinks((shown || target).trim());
      if(!hit) return stash('<span class="rp-wl-missing">' + label + "</span>");
      var cls = hit.kind === "cast" ? "rp-wl rp-wl-cast" : "rp-wl";
      return stash('<a class="' + cls + '" href="' + esc(hrefFor(hit)) + '">' + label + "</a>");
    });

    /* ordinary links */
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function(m, text, url){
      var u = safeUrl(url);
      if(!u) return m;
      return stash('<a href="' + esc(u) + '" target="_blank" rel="noopener">' + inlineNoLinks(text) + "</a>");
    });

    s = emphasis(esc(s));

    return s.replace(/\u0000(\d+)\u0000/g, function(m, i){ return tokens[+i]; });
  }

  /* For link labels, which can't hold another link. */
  function inlineNoLinks(src){ return emphasis(esc(src)); }

  function emphasis(s){
    return s
      .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?![\w])/g, "$1<strong>$2</strong>")
      .replace(/\*(?=\S)([\s\S]*?\S)\*/g, "<em>$1</em>")
      .replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?![\w])/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  }

  function markdown(src){
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var html = "";
    var para = [];
    var i = 0;

    function flush(){
      if(!para.length) return;
      html += "<p>" + para.map(inline).join("<br>") + "</p>";
      para = [];
    }

    while(i < lines.length){
      var line = lines[i];

      if(/^\s*$/.test(line)){ flush(); i++; continue; }

      /* --- or *** or * * * */
      if(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)){
        flush(); html += '<hr class="rp-break">'; i++; continue;
      }

      /* headings, stepped down so a post's # never outranks the page */
      var h = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
      if(h){
        flush();
        var level = Math.min(6, h[1].length + 2);
        html += "<h" + level + ">" + inline(h[2]) + "</h" + level + ">";
        i++; continue;
      }

      if(/^\s{0,3}>/.test(line)){
        flush();
        var quote = [];
        while(i < lines.length && /^\s{0,3}>/.test(lines[i])){
          quote.push(lines[i].replace(/^\s{0,3}>\s?/, "")); i++;
        }
        html += "<blockquote>" + markdown(quote.join("\n")) + "</blockquote>";
        continue;
      }

      var bullet = /^\s{0,3}[-*+]\s+/, number = /^\s{0,3}\d+[.)]\s+/;
      if(bullet.test(line) || number.test(line)){
        flush();
        var ordered = number.test(line);
        var re = ordered ? number : bullet;
        var items = [];
        while(i < lines.length && re.test(lines[i])){
          var item = lines[i].replace(re, ""); i++;
          while(i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !number.test(lines[i])){
            item += "\n" + lines[i].trim(); i++;
          }
          items.push("<li>" + item.split("\n").map(inline).join("<br>") + "</li>");
        }
        html += (ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>");
        continue;
      }

      para.push(line);
      i++;
    }
    flush();
    return html;
  }

  /* ==========================================================================
     URLS
     ========================================================================== */

  function sceneUrl(id, postId){ return BASE + "scene.html?id=" + encodeURIComponent(id) + (postId ? "#p-" + postId : ""); }
  function castUrl(id){  return BASE + "cast.html" + (id ? "?c=" + encodeURIComponent(id) : ""); }
  function wikiUrl(id){  return BASE + "wiki.html" + (id ? "?e=" + encodeURIComponent(id) : ""); }

  /* ==========================================================================
     SHARED MARKUP
     ========================================================================== */

  function initials(name){
    var words = String(name || "").replace(/^the\s+/i, "").trim().split(/\s+/).filter(Boolean);
    if(!words.length) return "?";
    return (words[0][0] + (words.length > 1 ? words[words.length-1][0] : "")).toUpperCase();
  }

  function portraitPos(p){
    return { top:"50% 15%", center:"50% 50%", bottom:"50% 85%" }[p && p.crop] || "50% 25%";
  }

  /* Round face: portrait if there is one, monogram on their colour if not. */
  function face(p, size){
    size = size || 28;
    var color = safeColor(p && p.color);
    var url = safeUrl(p && p.portrait);
    var style = "width:" + size + "px;height:" + size + "px;background:" + color + ";font-size:" + Math.round(size * 0.4) + "px;";
    var inner = (p && p.id === "narration") ? "\u2767" : esc(initials(p && p.name));
    if(url){
      inner = '<img src="' + esc(url) + '" alt="" style="object-position:' + portraitPos(p) + '" ' +
              'onerror="this.remove()">' + inner;
    }
    return '<span class="rp-face" style="' + style + '" aria-hidden="true">' + inner + "</span>";
  }

  /* The card beside every post. Portrait, name, role, the facts this
     character chose to show, and the face claim credit. */
  function mini(p, opts){
    opts = opts || {};
    if(!p){
      return '<div class="rp-mini rp-mini-missing"><div class="rp-mini-body">' +
             '<p class="rp-mini-name">Unknown</p><p class="rp-mini-role">This character was removed.</p></div></div>';
    }
    var color = safeColor(p.color);
    var url = safeUrl(p.portrait);
    /* With a birthday and a dated scene, Age is worked out and goes first.
       A hand-written "Age" fact would only disagree with it, so it steps aside. */
    var age = ageText(ageOn(p.born && p.born.date, opts.on));
    var facts = (p.facts || []).filter(function(f){
        return f && f.value && !(age && norm(f.label) === "age");
      })
      .slice(0, MINI_FACT_LIMIT)
      .map(function(f){ return "<div><dt>" + esc(f.label) + "</dt><dd>" + esc(f.value) + "</dd></div>"; })
      .join("");
    if(age) facts = '<div class="rp-mini-age"><dt>Age</dt><dd>' + esc(age) + "</dd></div>" + facts;

    return '<a class="rp-mini" href="' + esc(castUrl(p.id)) + '" style="--who:' + color + '">' +
      '<span class="rp-mini-band"></span>' +
      '<span class="rp-portrait">' +
        '<span class="rp-portrait-mono">' + esc(initials(p.name)) + "</span>" +
        (url ? '<img src="' + esc(url) + '" alt="' + esc(p.name) + '" loading="lazy" style="object-position:' + portraitPos(p) + '" onerror="this.remove()">' : "") +
      "</span>" +
      '<span class="rp-mini-body">' +
        '<span class="rp-mini-name">' + esc(p.name) + "</span>" +
        (p.role ? '<span class="rp-mini-role">' + esc(p.role) + "</span>" : "") +
        (facts ? '<dl class="rp-mini-facts">' + facts + "</dl>" : "") +
        (p.playedBy ? '<span class="rp-mini-fc">Played by ' + esc(p.playedBy) + "</span>" : "") +
      "</span>" +
    "</a>";
  }

  /* "Link with [[Ophelia Montgomery]] [[Phey]]" — on sheets and entries. */
  function linkLine(kind, r){
    return '<p class="rp-linkwords"><span>Link with</span> ' +
      linkWords(kind, r).map(function(w){ return "<code>[[" + esc(w) + "]]</code>"; }).join(" ") + "</p>";
  }

  function statePill(s){
    var st = STATES.find(function(x){ return x.key === s; }) || STATES[0];
    return '<span class="rp-state" data-s="' + st.key + '">' + st.label + "</span>";
  }

  function threadChip(sc){
    var t = thread(sc && sc.thread);
    if(!t) return '<span class="rp-thread rp-thread-none">No thread</span>';
    return '<span class="rp-thread" style="--thread:' + safeColor(t.color) + '">' + esc(t.name) + "</span>";
  }

  function colorPicker(name, current){
    return '<div class="rp-swatches" role="radiogroup">' + COLORS.map(function(c){
      var on = c.hex.toLowerCase() === String(current || "").toLowerCase();
      return '<label class="rp-swatch" title="' + c.name + '" style="--sw:' + c.hex + '">' +
        '<input type="radio" name="' + esc(name) + '" value="' + c.hex + '"' + (on ? " checked" : "") + '>' +
        '<span></span><span class="pp-sr-only">' + c.name + "</span></label>";
    }).join("") + "</div>";
  }

  /* Comma-separated aliases in, tidy array out. */
  function splitList(s){
    var seen = {};
    return String(s || "").split(",").map(function(x){ return x.trim(); }).filter(function(x){
      var k = norm(x);
      if(!k || seen[k]) return false;
      seen[k] = true; return true;
    });
  }

  /* Textarea + preview pane, used by the composer and every Markdown field. */
  function wirePreview(button, textarea, preview){
    button.addEventListener("click", function(){
      var showing = preview.hidden === false;
      if(showing){
        preview.hidden = true;
        textarea.hidden = false;
        button.setAttribute("aria-pressed", "false");
        button.textContent = "Preview";
        textarea.focus();
      } else {
        preview.innerHTML = markdown(textarea.value) || '<p class="rp-none">Nothing to preview yet.</p>';
        preview.style.minHeight = textarea.offsetHeight + "px";
        preview.hidden = false;
        textarea.hidden = true;
        button.setAttribute("aria-pressed", "true");
        button.textContent = "Back to writing";
      }
    });
  }

  var MD_HINT =
    '<span class="rp-md-hint">' +
      "<code>*italic*</code> <code>**bold**</code> <code>[[Wiki page]]</code> " +
      "<code>[[Page|shown as]]</code> <code>&gt; quote</code> <code>---</code> scene break" +
    "</span>";

  /* ==========================================================================
     TIMELINE ORDER
     Story date first. Scenes with no date sort after dated ones, by when they
     were started, so a new idea doesn't vanish from the list.
     ========================================================================== */

  function compareStory(a, b){
    var ka = storyKey(a), kb = storyKey(b);
    if(ka && kb){ if(ka !== kb) return ka < kb ? -1 : 1; }
    else if(ka) return -1;
    else if(kb) return 1;
    return String(a.created || "").localeCompare(String(b.created || ""));
  }

  function timelineScenes(){ return state.scenes.slice().sort(compareStory); }

  /* The scene either side of this one on the timeline, in any thread. */
  function neighbours(sc){
    var list = timelineScenes().filter(function(s){ return storyKey(s); });
    var i = list.findIndex(function(s){ return s.id === sc.id; });
    if(i < 0) return { before:null, after:null };
    return { before:list[i-1] || null, after:list[i+1] || null };
  }

  /* ==========================================================================
     SCENE FORM
     The same fields create a scene on the index and edit one on its page.
     ========================================================================== */

  function sceneFormFields(sc){
    sc = sc || { when:{}, cast:[] };
    var w = sc.when || {};
    var threads = threadsSorted();

    return '' +
      '<div class="rp-fields">' +
        '<div class="pp-field wide"><label for="sf-title">Title</label>' +
          '<input id="sf-title" name="title" required maxlength="140" value="' + esc(sc.title || "") + '"></div>' +

        '<div class="pp-field"><label for="sf-thread">Thread</label>' +
          '<select id="sf-thread" name="thread">' +
            '<option value="">No thread</option>' +
            threads.map(function(t){
              return '<option value="' + esc(t.id) + '"' + (t.id === sc.thread ? " selected" : "") + ">" + esc(t.name) + "</option>";
            }).join("") +
          "</select></div>" +

        '<div class="pp-field"><label for="sf-where">Where</label>' +
          '<input id="sf-where" name="where" maxlength="140" value="' + esc(sc.where || "") + '"></div>' +

        '<div class="pp-field wide"><div class="rp-fields rp-fields-3">' +
          '<div class="pp-field"><label for="sf-date">Story date</label>' +
            '<input id="sf-date" name="date" type="date" value="' + esc(w.date || "") + '"></div>' +
          '<div class="pp-field"><label for="sf-time">Time</label>' +
            '<input id="sf-time" name="time" type="time" value="' + esc(w.time || "") + '"></div>' +
          '<div class="pp-field"><label for="sf-label">Shown as</label>' +
            '<input id="sf-label" name="label" maxlength="80" placeholder="Optional" value="' + esc(w.label || "") + '"></div>' +
        "</div>" +
        '<span class="pp-hint">The date puts the scene in its place on the timeline. Use &ldquo;Shown as&rdquo; if the story keeps its own calendar.</span></div>' +

        (sc.id ? '<div class="pp-field"><label for="sf-state">State</label>' +
          '<select id="sf-state" name="state">' +
            STATES.map(function(s){
              return '<option value="' + s.key + '"' + (s.key === sc.state ? " selected" : "") + ">" + s.label + "</option>";
            }).join("") +
          "</select></div><div></div>" : "") +

        '<div class="pp-field wide"><span class="pp-field-label">In this scene</span>' +
          castPicker(sc.cast || []) + "</div>" +

        '<div class="pp-field wide"><label for="sf-summary">Summary</label>' +
          '<textarea id="sf-summary" name="summary" maxlength="600" rows="3">' + esc(sc.summary || "") + "</textarea></div>" +
      "</div>";
  }

  function castPicker(selected){
    var cast = castSorted();
    if(!cast.length){
      return '<p class="pp-hint">No cast yet. <a href="' + castUrl() + '">Add characters</a> and they&rsquo;ll appear here.</p>';
    }
    return '<div class="rp-castpick">' + cast.map(function(c){
      var on = selected.indexOf(c.id) > -1;
      return '<button type="button" data-cast="' + esc(c.id) + '" aria-pressed="' + on + '">' + face(c, 26) + esc(c.name) + "</button>";
    }).join("") + "</div>";
  }

  function wireCastPicker(root){
    root.addEventListener("click", function(e){
      var b = e.target.closest && e.target.closest(".rp-castpick button");
      if(!b || !root.contains(b)) return;
      b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  }

  /* Reads the form into `sc` (mutated and returned). */
  function readSceneForm(root, sc){
    function val(name){ var el = root.querySelector('[name="' + name + '"]'); return el ? el.value.trim() : ""; }
    sc.title   = val("title");
    sc.thread  = val("thread") || null;
    sc.where   = val("where");
    sc.summary = val("summary");
    sc.when    = { date:val("date"), time:val("time"), label:val("label") };
    var st = val("state"); if(st) sc.state = st;
    sc.cast = Array.prototype.map.call(
      root.querySelectorAll('.rp-castpick button[aria-pressed="true"]'),
      function(b){ return b.getAttribute("data-cast"); }
    );
    return sc;
  }

  /* ---------------- exports ---------------- */
  return {
    sceneFormFields:sceneFormFields, readSceneForm:readSceneForm, wireCastPicker:wireCastPicker,
    STATES:STATES, KINDS:KINDS, KIND_KEYS:KIND_KEYS, COLORS:COLORS, NARRATION:NARRATION,
    MINI_FACT_LIMIT:MINI_FACT_LIMIT, MD_HINT:MD_HINT, BASE:BASE,
    get state(){ return state; },
    load:load, save:save, remove:remove, watchSync:watchSync, go:go,
    $:$, esc:esc, uid:uid, param:param, safeColor:safeColor, safeUrl:safeUrl,
    todayISO:todayISO, parseISO:parseISO, shortDate:shortDate, longDate:longDate,
    relative:relative, plural:plural, MONTHS:MONTHS,
    storyKey:storyKey, storyLabel:storyLabel,
    ageOn:ageOn, ageText:ageText, bornLabel:bornLabel, latestDate:latestDate, linkWords:linkWords,
    thread:thread, scene:scene, person:person, entry:entry,
    castSorted:castSorted, wikiSorted:wikiSorted, threadsSorted:threadsSorted, threadColor:threadColor,
    wordCount:wordCount, sceneWords:sceneWords, plainText:plainText,
    writtenRange:writtenRange, writtenLabel:writtenLabel, lastTouched:lastTouched,
    norm:norm, resolve:resolve, hrefFor:hrefFor, linksIn:linksIn,
    backlinks:backlinks, unresolved:unresolved, keepOldName:keepOldName,
    markdown:markdown, inline:inline,
    sceneUrl:sceneUrl, castUrl:castUrl, wikiUrl:wikiUrl,
    initials:initials, face:face, mini:mini, linkLine:linkLine, statePill:statePill, threadChip:threadChip,
    colorPicker:colorPicker, splitList:splitList, wirePreview:wirePreview,
    compareStory:compareStory, timelineScenes:timelineScenes, neighbours:neighbours
  };
})();
