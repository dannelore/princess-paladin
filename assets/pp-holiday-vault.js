/* ==========================================================================
   Princess & Paladin — Holiday Quest: Plans and Gifts
   /assets/pp-holiday-vault.js

   The two locked tabs on /side-quests/holiday-quest.html. The watch list on
   the same page is the ordinary Couch Quest engine and stays open; this file
   only owns the Plans and Gifts tabs and the tab switching.

   WHAT'S LOCKED, AND FROM WHOM
     Plans, and gifts for family & friends   — either password opens them.
     Danni's secret list (gifts for Brendon) — only Danni's password.
     Brendon's secret list (gifts for Danni) — only Brendon's password.

   Everything private is stored encrypted, in one Firestore doc
   (sidequest/holiday-vault) — see /assets/pp-vault-crypto.js for why and
   how. The doc looks like:

     shared   { iv, ct }   -> { plans:[...], gifts:[...] }
     danni    { iv, ct }   -> { gifts:[...] }      Danni's secret list
     brendon  { iv, ct }   -> { gifts:[...] }      Brendon's secret list
     keys     { danni, brendon }  key bundles, once a password is changed
     updated  ms timestamp

   Until someone changes their password, their bundle comes from
   STARTER_KEYS below. Those were made by tools/holiday-keys.js; the
   passwords themselves are not in the repo.

   Load after pp-vault-crypto.js and after the page's own script has called
   boot(), so Firebase is already initialised.
   ========================================================================== */
(function(){
  "use strict";

  const V = window.PPVaultCrypto;

  /* Made by: node tools/holiday-keys.js "<danni pw>" "<brendon pw>" */
  const STARTER_KEYS = {
    danni:   { salt:"eVAmCQwS0UEL16ElYljDWw==", iter:310000,
             iv:"EYBsx6Vscx+U7o5T",
             ct:"MmqgDbY94L0ROMYI84aOmU7UJOFaIWDDqga3qAz3tcTqO6o6x9i32JbfuA4y80W6q8tELcwYaRD8TZ8LG+O7zVTgdauXQbr22gtvi0YX721Qt77D+jTSU7WejOZLhKwMJCjFZEQ/oVL2xDOqHLZQ9r/OPEPC7WNcZO4j+pa++R8dchGnJZgHXv1wTyE=" },
    brendon: { salt:"4a/vCltlMnH2MjXpQJiBVQ==", iter:310000,
             iv:"AvKyqQFv8qbE7tBM",
             ct:"YwAXJwgE7KHOgBACwvg3tGpyJtIKwZGyu5z+1YwNL6trrg15ljuJpNARkWAc/54FvliSMa1tJvsW9HxKZ3MCxwa/LOB2ONWTO2rIxAJHVy9NCF6UoEGrqv1RIdbWEQQo5oOhQHf721X1XXV89+J36uxKmcsvQnyXW2/cotqwcYUi1dQxPKDchOVII/DdSA==" }
  };

  const DOC   = "sidequest/holiday-vault";
  const CACHE = "pp_holiday_vault";      // the encrypted doc, for offline loads
  const SESS  = "pp_holiday_session";    // unlocked keys — this tab only, gone when it closes
  const WHO   = ["danni", "brendon"];
  const NAME  = { danni:"Danni", brendon:"Brendon" };
  const OTHER = { danni:"brendon", brendon:"danni" };

  const STATUSES = ["idea", "bought", "wrapped", "given"];
  const STATUS_LABEL = { idea:"Idea", bought:"Bought", wrapped:"Wrapped", given:"Given" };

  const $id = id => document.getElementById(id);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function h(s){
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }

  /* The season a date belongs to. January still counts as the one just gone,
     so a Boxing Day gift and a New Year's Day plan land in the same year. */
  function holidayYear(d){
    d = d || new Date();
    return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
  }

  /* ---------------- state ---------------- */
  let docData = null;   // last copy of the vault doc — ciphertext only
  let ref     = null;
  let session = null;   // { who, shared, own, ct, sharedKey, ownKey }
  let data    = emptyData();
  let tab     = "watch";
  let year    = holidayYear();
  let editing = null;   // { kind:"plan"|"gift", list:"shared"|"own", id }
  let dirty   = { shared:false, own:false };
  let saveTimer = null, saving = false, lockNote = "";

  function emptyData(){ return { shared:{ plans:[], gifts:[] }, own:{ gifts:[] } }; }

  const bundleFor = who => (docData && docData.keys && docData.keys[who]) || STARTER_KEYS[who];
  const onStarter = who => !(docData && docData.keys && docData.keys[who]);

  function setSync(state, text){
    const e = $id("vaultSync");
    if(!e) return;
    e.dataset.state = state;
    e.textContent = text;
  }

  /* ---------------- storage ---------------- */
  function loadCache(){
    try{ docData = JSON.parse(localStorage.getItem(CACHE) || "null"); }catch(e){ docData = null; }
  }
  function writeCache(){
    try{ localStorage.setItem(CACHE, JSON.stringify(docData)); }catch(e){}
  }
  function writeSession(){
    try{
      sessionStorage.setItem(SESS, JSON.stringify({
        who: session.who, shared: session.shared, own: session.own, ct: session.ct }));
    }catch(e){}
  }

  async function startSession(contents, ct){
    session = {
      who: contents.who, shared: contents.shared, own: contents.own, ct: ct,
      sharedKey: await V.importKey(contents.shared),
      ownKey:    await V.importKey(contents.own)
    };
    writeSession();
  }

  /* A reload in the same tab stays unlocked, as long as the password hasn't
     been changed somewhere else in the meantime. */
  async function restoreSession(){
    let saved = null;
    try{ saved = JSON.parse(sessionStorage.getItem(SESS) || "null"); }catch(e){}
    if(!saved || !WHO.includes(saved.who)) return;
    if(bundleFor(saved.who).ct !== saved.ct){ forget(); return; }
    try{ await startSession(saved, saved.ct); }catch(e){ forget(); }
  }

  function forget(){
    session = null;
    data = emptyData();
    try{ sessionStorage.removeItem(SESS); }catch(e){}
  }

  /* Read the doc's blobs with the keys we hold. */
  async function decrypt(){
    if(!session) return;
    if(bundleFor(session.who).ct !== session.ct){
      lock("Your password was changed on another device. Enter the new one.");
      return;
    }
    const next = emptyData();
    try{
      if(docData && docData.shared) next.shared = await V.open(session.sharedKey, docData.shared);
      if(docData && docData[session.who]) next.own = await V.open(session.ownKey, docData[session.who]);
    }catch(e){
      console.error(e);
      lock("Couldn't open the saved lists with that key. Enter your password again.");
      return;
    }
    next.shared.plans = next.shared.plans || [];
    next.shared.gifts = next.shared.gifts || [];
    next.own.gifts    = next.own.gifts    || [];
    data = next;
  }

  /* ---------------- saving ---------------- */
  function queueSave(which){
    dirty[which] = true;
    render();
    clearTimeout(saveTimer);
    setSync("saving", "Saving");
    saveTimer = setTimeout(flush, 500);
  }

  async function flush(){
    saveTimer = null;
    if(!session) return;
    const patch = { updated: Date.now() };
    if(dirty.shared) patch.shared = await V.seal(session.sharedKey, data.shared);
    if(dirty.own)    patch[session.who] = await V.seal(session.ownKey, data.own);
    dirty = { shared:false, own:false };
    docData = Object.assign({}, docData, patch);
    writeCache();
    if(!ref){ setSync("error", "Offline — this device only"); return; }
    saving = true;
    ref.set(patch, { merge:true })
      .then(() => setSync("idle", "Synced"))
      .catch(e => { console.error(e); setSync("error", "Couldn't save"); })
      .finally(() => { saving = false; });
  }

  /* ---------------- lock / unlock ---------------- */
  async function unlock(password){
    for(const who of WHO){
      const bundle = bundleFor(who);
      const contents = await V.openBundle(password, bundle);
      if(contents && contents.who === who){
        await startSession(contents, bundle.ct);
        lockNote = "";
        await decrypt();
        return true;
      }
    }
    return false;
  }

  function lock(note){
    clearTimeout(saveTimer);
    saveTimer = null;
    dirty = { shared:false, own:false };
    editing = null;
    forget();
    lockNote = note || "";
    render();
  }

  /* New own key, secret list re-sealed under it, new bundle — one write, so
     the doc never holds a bundle that doesn't match its list. */
  async function changePassword(pw){
    /* Anything still waiting to save goes first, under the old key. */
    if(saveTimer){ clearTimeout(saveTimer); await flush(); }
    const who = session.who;
    const own = V.newRawKey();
    const ownKey = await V.importKey(own);
    const bundle = await V.makeBundle(pw, { who: who, shared: session.shared, own: own });
    const patch = { updated: Date.now(), keys: {} };
    patch.keys[who] = bundle;
    patch[who] = await V.seal(ownKey, data.own);

    /* `saving` keeps the snapshot of this very write from arriving while the
       session still holds the old bundle — it would look like the password
       had been changed somewhere else, and lock you out. */
    saving = true;
    try{
      if(ref) await ref.set(patch, { merge:true });
      const keys = Object.assign({}, docData && docData.keys, patch.keys);
      docData = Object.assign({}, docData, patch, { keys: keys });
      writeCache();
      await startSession({ who: who, shared: session.shared, own: own }, bundle.ct);
    }finally{
      saving = false;
    }
  }

  /* ---------------- formatting ---------------- */
  function money(n){
    if(n == null || n === "" || isNaN(n)) return "";
    const v = Number(n);
    return "$" + (Math.round(v) === v ? v.toLocaleString("en-US")
                                       : v.toLocaleString("en-US", { minimumFractionDigits:2, maximumFractionDigits:2 }));
  }
  function parseDay(s){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function dayLabel(s){
    const d = parseDay(s);
    return d ? d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" }) : "";
  }
  function safeUrl(u){
    u = String(u || "").trim();
    return /^https?:\/\//i.test(u) ? u : "";
  }

  /* ---------------- tabs ---------------- */
  function setTab(next){
    tab = ["plans", "gifts"].includes(next) ? next : "watch";
    document.querySelectorAll(".hq-tab").forEach(a => {
      a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false");
    });
    $id("paneWatch").hidden = tab !== "watch";
    $id("paneVault").hidden = tab === "watch";
    editing = null;
    render();
  }

  /* ---------------- rendering ---------------- */
  function render(){
    if(tab === "watch") return;
    const locked = !session;
    $id("vaultLock").hidden = !locked;
    $id("vaultOpen").hidden = locked;
    $id("lockFor").textContent = tab === "plans" ? "Plans are" : "Gifts are";
    $id("lockNote").textContent = lockNote;
    $id("lockNote").hidden = !lockNote;
    if(locked) return;

    $id("vaultWho").textContent = NAME[session.who];
    $id("vaultStarter").hidden = !onStarter(session.who);
    renderYears();
    renderForm();
    $id("plansView").hidden = tab !== "plans";
    $id("giftsView").hidden = tab !== "gifts";
    if(tab === "plans") renderPlans(); else renderGifts();
  }

  function renderYears(){
    const years = new Set([holidayYear(), year]);
    data.shared.plans.concat(data.shared.gifts, data.own.gifts)
      .forEach(i => { if(i.year) years.add(i.year); });
    $id("vaultYear").innerHTML = Array.from(years).sort((a, b) => b - a)
      .map(y => `<option value="${y}"${y === year ? " selected" : ""}>${y}${y === holidayYear() ? " (this year)" : ""}</option>`)
      .join("");
  }

  const inYear = i => (i.year || holidayYear()) === year;

  function renderPlans(){
    const plans = data.shared.plans.filter(inYear).sort((a, b) => {
      if(!!a.done !== !!b.done) return a.done ? 1 : -1;
      if(!a.date !== !b.date) return a.date ? -1 : 1;
      return (a.date || "").localeCompare(b.date || "") || (a.title || "").localeCompare(b.title || "");
    });

    let html = `<div class="hq-head">
        <h2>Plans</h2>
        <button class="pp-btn" data-act="add" data-kind="plan" data-list="shared">Add a plan</button>
      </div>`;

    if(!plans.length){
      html += `<p class="pp-empty">No plans for ${year} yet.</p>`;
    }
    plans.forEach(p => {
      const when = [dayLabel(p.date), p.time, p.where ? "at " + p.where : ""].filter(Boolean).join(" · ");
      html += `<div class="pp-panel pp-panel-tight hq-plan${p.done ? " is-done" : ""}">
          <button class="hq-check" data-act="toggle" data-id="${h(p.id)}"
            aria-pressed="${p.done ? "true" : "false"}" aria-label="${p.done ? "Mark not done" : "Mark done"}">&#10003;</button>
          <div class="hq-plan-body">
            <span class="hq-plan-title">${h(p.title)}</span>
            ${when ? `<span class="hq-plan-when">${h(when)}</span>` : ""}
            ${p.notes ? `<span class="hq-plan-notes">${h(p.notes)}</span>` : ""}
          </div>
          <button class="hq-edit" data-act="edit" data-kind="plan" data-list="shared" data-id="${h(p.id)}">Edit</button>
        </div>`;
    });
    $id("plansView").innerHTML = html;
  }

  function giftGroups(gifts){
    const groups = {};
    gifts.forEach(g => {
      const k = (g.to || "Someone").trim() || "Someone";
      (groups[k] = groups[k] || []).push(g);
    });
    return Object.keys(groups).sort((a, b) => a.localeCompare(b)).map(name => ({
      name: name,
      gifts: groups[name].sort((a, b) =>
        STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || (a.idea || "").localeCompare(b.idea || ""))
    }));
  }

  const sum = gifts => gifts.reduce((n, g) => n + (Number(g.price) || 0), 0);

  function giftRow(g, list){
    const url = safeUrl(g.link);
    const idea = url ? `<a href="${h(url)}" target="_blank" rel="noopener">${h(g.idea)}</a>` : h(g.idea);
    return `<div class="hq-gift">
        <button class="hq-status" data-status="${h(g.status || "idea")}" data-act="cycle"
          data-list="${list}" data-id="${h(g.id)}" title="Tap to move it along">${STATUS_LABEL[g.status] || "Idea"}</button>
        <span class="hq-gift-idea">${idea}${g.notes ? `<small>${h(g.notes)}</small>` : ""}</span>
        <span class="hq-gift-price">${money(g.price)}</span>
        <button class="hq-edit" data-act="edit" data-kind="gift" data-list="${list}" data-id="${h(g.id)}">Edit</button>
      </div>`;
  }

  function giftSection(gifts, list){
    if(!gifts.length) return `<p class="pp-empty">Nothing here for ${year} yet.</p>`;
    return giftGroups(gifts).map(grp => {
      const total = sum(grp.gifts);
      return `<div class="pp-panel pp-panel-tight hq-person">
          <div class="hq-person-head">
            <span class="hq-person-name">${h(grp.name)}</span>
            <span class="hq-person-meta">${grp.gifts.length} ${grp.gifts.length === 1 ? "gift" : "gifts"}${total ? " · " + money(total) : ""}</span>
          </div>
          ${grp.gifts.map(g => giftRow(g, list)).join("")}
        </div>`;
    }).join("");
  }

  function renderGifts(){
    const shared = data.shared.gifts.filter(inYear);
    const mine   = data.own.gifts.filter(inYear);
    const all    = shared.concat(mine);
    const got    = all.filter(g => g.status && g.status !== "idea");
    const other  = NAME[OTHER[session.who]];

    let html = `<div class="hq-head">
        <h2>Gifts</h2>
        <span class="hq-stats">${all.length} ${all.length === 1 ? "gift" : "gifts"} · ${got.length} sorted${
          sum(got) ? " · " + money(sum(got)) + " spent" : ""}${
          sum(all) ? " of " + money(sum(all)) + " planned" : ""}</span>
      </div>

      <section class="hq-giftlist">
        <div class="hq-subhead">
          <h3>For family &amp; friends</h3>
          <button class="pp-btn pp-btn-sm" data-act="add" data-kind="gift" data-list="shared">Add a gift</button>
        </div>
        ${giftSection(shared, "shared")}
      </section>

      <section class="hq-giftlist hq-secret">
        <div class="hq-subhead">
          <h3>&#128274; Just yours &mdash; for ${h(other)}</h3>
          <button class="pp-btn pp-btn-sm" data-act="add" data-kind="gift" data-list="own">Add a gift</button>
        </div>
        <p class="hq-hint">Only your password opens this list. ${h(other)} can't see it, even when signed in.</p>
        ${giftSection(mine, "own")}
      </section>`;
    $id("giftsView").innerHTML = html;
  }

  /* ---------------- add / edit form ---------------- */
  function listOf(e){
    return e.kind === "plan" ? data.shared.plans
         : e.list === "own" ? data.own.gifts : data.shared.gifts;
  }

  function renderForm(){
    const box = $id("itemForm");
    if(!editing){ box.hidden = true; box.innerHTML = ""; return; }
    if(box.dataset.for === JSON.stringify(editing) && !box.hidden) return;   // keep what's typed

    const item = editing.id ? listOf(editing).find(x => x.id === editing.id) : null;
    const v = item || {};
    let fields;

    if(editing.kind === "plan"){
      fields = `
        <div class="cq-field wide"><label for="vTitle">What</label>
          <input id="vTitle" type="text" value="${h(v.title)}" placeholder="Tree farm" autocomplete="off"></div>
        <div class="cq-field"><label for="vDate">Date</label>
          <input id="vDate" type="date" value="${h(v.date)}"></div>
        <div class="cq-field"><label for="vTime">Time</label>
          <input id="vTime" type="text" value="${h(v.time)}" placeholder="2pm" autocomplete="off"></div>
        <div class="cq-field wide"><label for="vWhere">Where</label>
          <input id="vWhere" type="text" value="${h(v.where)}" autocomplete="off"></div>
        <div class="cq-field wide"><label for="vNotes">Notes</label>
          <textarea id="vNotes" rows="3">${h(v.notes)}</textarea></div>`;
    }else{
      const names = new Set();
      data.shared.gifts.concat(data.own.gifts).forEach(g => { if(g.to) names.add(g.to); });
      const to = item ? v.to : (editing.list === "own" ? NAME[OTHER[session.who]] : "");
      fields = `
        <div class="cq-field"><label for="vTo">For</label>
          <input id="vTo" type="text" value="${h(to)}" list="vNames" placeholder="Mom" autocomplete="off">
          <datalist id="vNames">${Array.from(names).sort().map(n => `<option value="${h(n)}">`).join("")}</datalist></div>
        <div class="cq-field"><label for="vStatus">Status</label>
          <select id="vStatus">${STATUSES.map(s =>
            `<option value="${s}"${(v.status || "idea") === s ? " selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}</select></div>
        <div class="cq-field wide"><label for="vIdea">Gift</label>
          <input id="vIdea" type="text" value="${h(v.idea)}" placeholder="Cozy socks" autocomplete="off"></div>
        <div class="cq-field"><label for="vPrice">Price</label>
          <input id="vPrice" type="number" min="0" step="0.01" value="${h(v.price)}" placeholder="25"></div>
        <div class="cq-field"><label for="vLink">Link</label>
          <input id="vLink" type="url" value="${h(v.link)}" placeholder="https://…" autocomplete="off"></div>
        <div class="cq-field wide"><label for="vNotes">Notes</label>
          <textarea id="vNotes" rows="2">${h(v.notes)}</textarea></div>`;
    }

    const title = (item ? "Edit " : "Add ") + (editing.kind === "plan" ? "a plan"
                : editing.list === "own" ? "a secret gift" : "a gift");
    box.innerHTML = `<h2 class="pp-panel-title">${title}</h2>
      <div class="cq-fields">${fields}</div>
      <p class="hq-error" id="vError" hidden></p>
      <div class="cq-actions">
        <button class="pp-btn" data-act="save">Save</button>
        <button class="pp-btn pp-btn-quiet" data-act="cancel">Cancel</button>
        <span class="cq-spacer"></span>
        ${item ? `<button class="pp-btn pp-btn-quiet" data-act="delete">Delete</button>` : ""}
      </div>`;
    box.dataset.for = JSON.stringify(editing);
    box.hidden = false;
    const first = box.querySelector("input");
    if(first) first.focus();
    box.scrollIntoView({ block:"nearest", behavior:"smooth" });
  }

  function formError(msg){
    const e = $id("vError");
    e.textContent = msg;
    e.hidden = !msg;
  }

  function saveForm(){
    const list = listOf(editing);
    const old = editing.id ? list.find(x => x.id === editing.id) : null;
    const val = id => ($id(id) ? $id(id).value.trim() : "");
    let item;

    if(editing.kind === "plan"){
      if(!val("vTitle")){ formError("Give the plan a name."); return; }
      const date = val("vDate");
      item = { title: val("vTitle"), date: date, time: val("vTime"), where: val("vWhere"),
               notes: val("vNotes"), done: old ? !!old.done : false,
               year: date ? holidayYear(parseDay(date)) : (old && old.year) || year };
    }else{
      if(!val("vIdea")){ formError("What's the gift?"); return; }
      const price = val("vPrice");
      item = { to: val("vTo"), idea: val("vIdea"), status: val("vStatus") || "idea",
               price: price === "" ? null : Math.round(parseFloat(price) * 100) / 100,
               link: val("vLink"), notes: val("vNotes"),
               year: (old && old.year) || year };
    }

    if(old) Object.assign(old, item);
    else list.push(Object.assign({ id: newId(), added: Date.now() }, item));
    const which = editing.list;
    editing = null;
    queueSave(which);
  }

  function deleteItem(){
    const list = listOf(editing);
    const i = list.findIndex(x => x.id === editing.id);
    if(i < 0) return;
    const name = list[i].title || list[i].idea || "this";
    if(!confirm("Delete “" + name + "”?")) return;
    list.splice(i, 1);
    const which = editing.list;
    editing = null;
    queueSave(which);
  }

  /* ---------------- events ---------------- */
  function onClick(e){
    const btn = e.target.closest("[data-act]");
    if(!btn || !session) return;
    const act = btn.dataset.act;

    if(act === "add" || act === "edit"){
      editing = { kind: btn.dataset.kind, list: btn.dataset.list, id: btn.dataset.id || null };
      $id("itemForm").dataset.for = "";
      render();
    }else if(act === "cancel"){
      editing = null;
      render();
    }else if(act === "save"){
      saveForm();
    }else if(act === "delete"){
      deleteItem();
    }else if(act === "toggle"){
      const p = data.shared.plans.find(x => x.id === btn.dataset.id);
      if(p){ p.done = !p.done; queueSave("shared"); }
    }else if(act === "cycle"){
      const list = btn.dataset.list === "own" ? data.own.gifts : data.shared.gifts;
      const g = list.find(x => x.id === btn.dataset.id);
      if(g){
        g.status = STATUSES[(STATUSES.indexOf(g.status) + 1) % STATUSES.length];
        queueSave(btn.dataset.list);
      }
    }
  }

  function wire(){
    $id("paneVault").addEventListener("click", onClick);

    $id("itemForm").addEventListener("keydown", e => {
      if(e.key === "Enter" && e.target.tagName === "INPUT"){ e.preventDefault(); saveForm(); }
      if(e.key === "Escape"){ editing = null; render(); }
    });

    $id("lockForm").addEventListener("submit", async e => {
      e.preventDefault();
      const input = $id("lockPw"), btn = $id("lockBtn"), err = $id("lockError");
      if(!input.value) return;
      btn.disabled = true;
      btn.textContent = "Unlocking…";
      err.hidden = true;
      const ok = await unlock(input.value).catch(x => { console.error(x); return false; });
      btn.disabled = false;
      btn.textContent = "Unlock";
      if(ok){ input.value = ""; render(); }
      else{ err.textContent = "That password doesn't open anything."; err.hidden = false; input.select(); }
    });

    $id("lockBtnTop").addEventListener("click", () => lock());

    $id("vaultYear").addEventListener("change", e => {
      year = parseInt(e.target.value, 10) || holidayYear();
      editing = null;
      render();
    });

    $id("pwOpen").addEventListener("click", () => {
      $id("pwForm").hidden = !$id("pwForm").hidden;
      if(!$id("pwForm").hidden) $id("pwNew").focus();
    });
    $id("pwCancel").addEventListener("click", () => { $id("pwForm").hidden = true; });
    $id("pwOpenStarter").addEventListener("click", () => {
      $id("pwForm").hidden = false;
      $id("pwNew").focus();
    });

    $id("pwForm").addEventListener("submit", async e => {
      e.preventDefault();
      const a = $id("pwNew").value, b = $id("pwAgain").value, err = $id("pwError");
      const fail = msg => { err.textContent = msg; err.hidden = false; };
      err.hidden = true;
      if(a.length < 8) return fail("Use at least 8 characters.");
      if(a !== b) return fail("Those two don't match.");
      const otherWho = OTHER[session.who];
      if(await V.openBundle(a, bundleFor(otherWho))) return fail("Pick something " + NAME[otherWho] + " isn't using.");

      const btn = $id("pwSave");
      btn.disabled = true;
      btn.textContent = "Saving…";
      try{
        await changePassword(a);
        $id("pwNew").value = $id("pwAgain").value = "";
        $id("pwForm").hidden = true;
        setSync("idle", "Password changed");
        render();
      }catch(x){
        console.error(x);
        fail("Couldn't save the new password — check the connection and try again.");
      }finally{
        btn.disabled = false;
        btn.textContent = "Save new password";
      }
    });

    window.addEventListener("hashchange", () => setTab(location.hash.slice(1)));
  }

  /* ---------------- start ---------------- */
  async function applyDoc(){
    if(!session) await restoreSession();
    await decrypt();
    render();
  }

  function startFirebase(){
    try{
      if(!(window.firebase && firebase.apps && firebase.apps.length)) throw new Error("Firebase isn't loaded");
      ref = firebase.firestore().doc(DOC);
      ref.onSnapshot(snap => {
        if(saving || saveTimer) return;      // our own write is on its way back
        docData = snap.exists ? snap.data() : null;
        writeCache();
        setSync("idle", "Synced");
        applyDoc();
      }, err => { console.error(err); setSync("error", "Offline — this device only"); });
    }catch(e){
      console.error(e);
      setSync("error", "Offline — this device only");
    }
  }

  wire();
  loadCache();
  setTab(location.hash.slice(1));
  applyDoc();
  startFirebase();
})();
