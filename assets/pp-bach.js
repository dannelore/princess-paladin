/* ==========================================================================
   Princess & Paladin — Bach Quest guest-list engine
   /assets/pp-bach.js

   Shared by bach/index.html (read-only display) and bach/guests.html
   (the password-gated admin page). Plain classic <script src>, no bundler —
   top-level declarations here are visible as bare globals to any inline
   <script> loaded after this file on the same page, same pattern as
   pp-watchlist.js.

   Data lives in one Firestore doc (bach/guest-data), with localStorage kept
   only as a same-device cache so a page has something to show instantly.
   Only guests.html ever calls save(); index.html just reads and re-renders
   on every snapshot via the onStateChange hook.
   ========================================================================== */

const CACHE_KEY = "pp_bach_guests";

const EVENTS = [
  { key: "longRest0",    label: "Long Rest — Friday",              kind: "rooms",  night: "friday",   capLabel: "Bunks" },
  { key: "dragBrunch",   label: "Drag Brunch",                     kind: "simple", capLabel: "Headcount" },
  { key: "smartyPants1", label: "Smarty Pants Presentations",      kind: "dual",   roleLabels: ["Presenters", "Audience"] },
  { key: "danddd",       label: "D&D&D",                           kind: "dual",   roleLabels: ["Players", "Audience"] },
  { key: "longRest1",    label: "Long Rest — Saturday",            kind: "rooms",  night: "saturday", capLabel: "Bunks" },
  { key: "roomEscapers", label: "Room Escapers",                   kind: "simple", capLabel: "Headcount" },
  { key: "longRest2",    label: "Long Rest — Sunday",              kind: "rooms",  night: "sunday",   capLabel: "Bunks" },
];
const EVENT_BY_KEY = Object.fromEntries(EVENTS.map(e => [e.key, e]));

const NIGHTS = [
  { key: "friday",   label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday",   label: "Sunday" },
];

/* Bedrooms 1-3 are double beds: they sleep up to 2, but the room reads as
   "taken" the moment 1 person is in it (bunks: 1) rather than counting
   toward capacity per-person. Bedroom 4's two individual beds are
   independent, so each occupant counts on their own (bunks: 2). The
   couch/floor are single spots. `shared` drives that "1 fills it"
   behavior; `sleeps` caps how many guests can be checked into the room. */
const ROOMS = [
  { key: "bedroom1", label: "Bedroom 1",          note: "double",    sleeps: 2, bunks: 1, shared: true },
  { key: "bedroom2", label: "Bedroom 2",          note: "double",    sleeps: 2, bunks: 1, shared: true },
  { key: "bedroom3", label: "Bedroom 3",          note: "double",    sleeps: 2, bunks: 1, shared: true },
  { key: "bedroom4", label: "Bedroom 4",          note: "individual beds", sleeps: 2, bunks: 2, shared: false },
  { key: "couch",    label: "Couch",              note: "backup",    sleeps: 1, bunks: 1, shared: false },
  { key: "floor",    label: "Living room floor",  note: "backup",    sleeps: 1, bunks: 1, shared: false },
];
const TOTAL_BUNKS = ROOMS.reduce((sum, r) => sum + r.bunks, 0);

let state = null;
let docRef = null;
let saveTimer = null;
let onStateChange = null;

function uid(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

function defaultState(){
  return { guests: [], capacity: {}, attendance: {}, rooms: {} };
}

/* Seeds the doc the first time it's ever loaded, from the names/capacities
   that used to be hand-typed into bach/index.html, so the page doesn't
   regress to blanks the moment this ships. */
function seedState(){
  const s = defaultState();
  const mk = name => { const id = uid(); s.guests.push({ id, name }); return id; };
  const danni = mk("Danni"), brendon = mk("Brendon"), jess = mk("Jess"),
        brian = mk("Brian"), benji = mk("Benji"), garrett = mk("Garrett");

  EVENTS.forEach(ev => {
    if(ev.kind === "simple") s.attendance[ev.key] = [];
    else if(ev.kind === "dual") s.attendance[ev.key] = { players: [], audience: [] };
  });
  s.capacity = { dragBrunch: "15+", roomEscapers: "12" };

  NIGHTS.forEach(n => { s.rooms[n.key] = {}; ROOMS.forEach(r => { s.rooms[n.key][r.key] = { guestIds: [], note: "" }; }); });
  const room = (night, key, guestIds, note) => { s.rooms[night][key] = { guestIds: guestIds || [], note: note || "" }; };

  room("friday", "bedroom1", [danni, brendon]);
  room("friday", "bedroom2", [jess]);
  room("friday", "bedroom3", [], "TBD");
  room("friday", "bedroom4", [], "AVAILABLE");
  room("friday", "couch", [], "TBD");
  room("friday", "floor", [], "TBD");

  room("saturday", "bedroom1", [danni, brendon]);
  room("saturday", "bedroom2", [jess]);
  room("saturday", "bedroom3", [], "AVAILABLE+");
  room("saturday", "bedroom4", [brian, benji]);
  room("saturday", "couch", [], "if needed");
  room("saturday", "floor", [], "if needed");

  room("sunday", "bedroom1", [danni, brendon]);
  room("sunday", "bedroom2", [jess]);
  room("sunday", "bedroom3", [garrett]);
  room("sunday", "bedroom4", [], "AVAILABLE");
  room("sunday", "couch", [], "if needed");
  room("sunday", "floor", [], "if needed");

  return s;
}

function migrate(){
  if(!Array.isArray(state.guests)) state.guests = [];
  if(!state.capacity || typeof state.capacity !== "object") state.capacity = {};
  if(!state.attendance || typeof state.attendance !== "object") state.attendance = {};
  if(!state.rooms || typeof state.rooms !== "object") state.rooms = {};

  EVENTS.forEach(ev => {
    if(ev.kind === "simple"){
      if(!Array.isArray(state.attendance[ev.key])) state.attendance[ev.key] = [];
    }else if(ev.kind === "dual"){
      const a = state.attendance[ev.key];
      if(!a || typeof a !== "object" || Array.isArray(a)) state.attendance[ev.key] = { players: [], audience: [] };
      else{
        if(!Array.isArray(a.players)) a.players = [];
        if(!Array.isArray(a.audience)) a.audience = [];
      }
    }
    // "rooms"-kind events (the three Long Rests) have no attendance of
    // their own — their headcount is derived from that night's room
    // assignments instead, see nightBunkCount().
  });

  NIGHTS.forEach(n => {
    if(!state.rooms[n.key] || typeof state.rooms[n.key] !== "object") state.rooms[n.key] = {};
    ROOMS.forEach(r => {
      const slot = state.rooms[n.key][r.key];
      if(!slot || typeof slot !== "object") state.rooms[n.key][r.key] = { guestIds: [], note: "" };
      else{
        if(!Array.isArray(slot.guestIds)) slot.guestIds = [];
        if(typeof slot.note !== "string") slot.note = "";
      }
    });
  });
}

function loadCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(raw) state = Object.assign(defaultState(), JSON.parse(raw));
  }catch(e){}
  if(!state) state = defaultState();
}
function writeCache(){
  try{ localStorage.setItem(CACHE_KEY, JSON.stringify(state)); }catch(e){}
}

function startFirebase(){
  docRef = firebase.firestore().collection("bach").doc("guest-data");
  docRef.onSnapshot(snap => {
    if(snap.exists){
      state = Object.assign(defaultState(), snap.data());
      migrate();
      writeCache();
      if(onStateChange) onStateChange();
    }else{
      docRef.set(seedState()).catch(err => console.error("Bach seed failed:", err));
    }
  }, err => console.error("Bach sync failed:", err));
}

/* Debounced write-through, same 500ms pattern as the watchlist pages.
   Only guests.html should ever call this. */
function save(){
  writeCache();
  if(onStateChange) onStateChange();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if(docRef) docRef.set(state).catch(err => console.error("Bach save failed:", err));
  }, 500);
}

function boot(){
  loadCache();
  migrate();
  if(onStateChange) onStateChange();
  startFirebase();
}

/* ---------- guests ---------- */
function guestName(id){
  const g = state.guests.find(x => x.id === id);
  return g ? g.name : "";
}
function sortedGuests(){
  return state.guests.slice().sort((a, b) => a.name.localeCompare(b.name));
}
function addGuest(name){
  name = (name || "").trim();
  if(!name) return null;
  const id = uid();
  state.guests.push({ id, name });
  return id;
}
function renameGuest(id, name){
  const g = state.guests.find(x => x.id === id);
  if(g && (name || "").trim()) g.name = name.trim();
}
function removeGuest(id){
  state.guests = state.guests.filter(g => g.id !== id);
  EVENTS.forEach(ev => {
    if(ev.kind === "simple"){
      state.attendance[ev.key] = state.attendance[ev.key].filter(x => x !== id);
    }else if(ev.kind === "dual"){
      const a = state.attendance[ev.key];
      a.players = a.players.filter(x => x !== id);
      a.audience = a.audience.filter(x => x !== id);
    }
  });
  NIGHTS.forEach(n => ROOMS.forEach(r => {
    const slot = state.rooms[n.key][r.key];
    slot.guestIds = slot.guestIds.filter(x => x !== id);
  }));
}

/* ---------- event attendance ---------- */
function isAttending(eventKey, guestId){
  const ev = EVENT_BY_KEY[eventKey];
  if(ev.kind === "simple") return state.attendance[eventKey].includes(guestId);
  const a = state.attendance[eventKey];
  return a.players.includes(guestId) || a.audience.includes(guestId);
}
function roleOf(eventKey, guestId){
  const a = state.attendance[eventKey];
  if(a.players.includes(guestId)) return "players";
  if(a.audience.includes(guestId)) return "audience";
  return "";
}
function setSimpleAttendance(eventKey, guestId, on){
  const list = state.attendance[eventKey];
  const i = list.indexOf(guestId);
  if(on && i === -1) list.push(guestId);
  if(!on && i > -1) list.splice(i, 1);
}
function setRole(eventKey, guestId, role){
  const a = state.attendance[eventKey];
  a.players = a.players.filter(x => x !== guestId);
  a.audience = a.audience.filter(x => x !== guestId);
  if(role === "players") a.players.push(guestId);
  if(role === "audience") a.audience.push(guestId);
}
function setCapacity(eventKey, value){
  state.capacity[eventKey] = (value || "").trim();
}

function badgeFor(eventKey){
  const ev = EVENT_BY_KEY[eventKey];
  if(!ev) return { value: "", title: "" };
  if(ev.kind === "rooms"){
    return { value: `${nightBunkCount(ev.night)}/${TOTAL_BUNKS}`, title: ev.capLabel };
  }
  if(ev.kind === "simple"){
    const count = state.attendance[eventKey].length;
    const cap = state.capacity[eventKey];
    return { value: cap ? `${count}/${cap}` : `${count}`, title: ev.capLabel };
  }
  const a = state.attendance[eventKey];
  const [pLabel, aLabel] = ev.roleLabels;
  return { value: `${a.players.length} ${pLabel} · ${a.audience.length} ${aLabel}`, title: ev.roleLabels.join(" / ") };
}

/* ---------- rooms ---------- */
function roomOccupantText(night, roomKey){
  const slot = state.rooms[night] && state.rooms[night][roomKey];
  if(!slot) return "TBD";
  if(slot.guestIds.length) return slot.guestIds.map(guestName).filter(Boolean).join(" & ");
  return slot.note || "TBD";
}

/* A shared double-bed room counts as 1 bunk the moment anyone's in it,
   however many people that ends up being. Bedroom 4's individual beds
   (and the couch/floor) count each occupant separately, up to capacity. */
function bunksUsedForRoom(slot, room){
  if(!slot || !slot.guestIds.length) return 0;
  return room.shared ? room.bunks : Math.min(slot.guestIds.length, room.bunks);
}
function nightBunkCount(night){
  const rooms = state.rooms[night];
  if(!rooms) return 0;
  return ROOMS.reduce((sum, r) => sum + bunksUsedForRoom(rooms[r.key], r), 0);
}
function toggleRoomGuest(night, roomKey, guestId, on){
  const slot = state.rooms[night][roomKey];
  const i = slot.guestIds.indexOf(guestId);
  if(on && i === -1) slot.guestIds.push(guestId);
  if(!on && i > -1) slot.guestIds.splice(i, 1);
}
function setRoomNote(night, roomKey, note){
  state.rooms[night][roomKey].note = note || "";
}
