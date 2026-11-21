/* Exercises the calendar feeds through the worker's fetch handler, with
   Firestore's REST API swapped for a stand-in so nothing real is read.

   The Worker runs in UTC, so the tests do too — that's the clock the meal
   plan's week maths sees in production. */
process.env.TZ = 'UTC';

const { default: worker } = await import('./src/index.js');

/* ---- a stand-in Firestore ---- */

/* Plain JSON into Firestore's typed REST shape — empty arrays come back with
   no `values` at all, as the real API sends them. */
function toFs(v){
  if(v === null || v === undefined) return { nullValue: null };
  if(Array.isArray(v)) return v.length ? { arrayValue: { values: v.map(toFs) } } : { arrayValue: {} };
  if(typeof v === 'boolean') return { booleanValue: v };
  if(typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if(typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
  return { stringValue: String(v) };
}

const docs = {};
let firestoreStatus = 200;
let lastRead = null;

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if(url.hostname !== 'firestore.googleapis.com') return realFetch(input, init);

  const path = decodeURIComponent(url.pathname).split('/documents/')[1];
  const mask = url.searchParams.getAll('mask.fieldPaths');
  lastRead = { path, mask, key: url.searchParams.get('key') };
  if(firestoreStatus !== 200) return new Response('{"error":{}}', { status: firestoreStatus });
  if(!docs[path]) return new Response('{"error":{"code":404}}', { status: 404 });

  // Honour the mask, like the real thing, so a missing field path shows up.
  const fields = {};
  for(const [k, v] of Object.entries(docs[path])) if(!mask.length || mask.includes(k)) fields[k] = toFs(v);
  return new Response(JSON.stringify({ name: path, fields }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

docs['questlog/danni-quest-log'] = {
  tags: [{ id: 't-work', name: 'Work', color: '#6E2430' }],
  completions: { '2026-11-01': { secret: true } },
  meowBucks: 12,
  todos: [
    { id: 'q1', title: 'Ring venue, re: numbers; and \\ check', due: '2026-12-31', done: false,
      priority: 'high', difficulty: 4, tag: 't-work',
      subs: [{ id: 's1', title: 'Find number' }, { id: 's2', title: 'Call' }], subDone: { s1: true } },
    { id: 'q2', title: 'Done thing', due: '2026-12-01', done: true, priority: 'medium', difficulty: 2, subs: [] },
    { id: 'q3', title: 'Someday thing', due: null, done: false, priority: 'medium', difficulty: 2, subs: [] },
    { id: 'q4', title: 'Bad date thing', due: '2026-02-30', done: false, priority: 'medium', difficulty: 2, subs: [] },
    { id: 'q5', title: "Wrap the 🎁 presents for everyone in the family before the party at Grandma's house 🎄🎄🎄",
      due: '2026-12-05', done: false, priority: 'low', difficulty: 1.5, tag: 'gone-tag', subs: [] }
  ],
  projects: [
    { id: 'p1', title: 'Fill holes with spackle', due: '2027-01-15', done: false, priority: 'medium', difficulty: 4, tag: null, subs: [] }
  ],
  dailies: [
    { id: 'd1', title: 'Take AM meds', due: '2026-12-02', done: false, priority: 'urgent', difficulty: 2, subs: [] }
  ]
};
docs['questlog/brendon-quest-log'] = {
  tags: [],
  todos: [{ id: 'b1', title: 'Buy rings', due: '2026-12-10', done: false, priority: 'urgent', difficulty: 3, subs: [] }],
  projects: []
};

/* The meal plan, keyed by this week's Sunday so it always lands in range. */
const now = new Date();
const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()));
const iso = d => d.toISOString().slice(0, 10);
const plus = (d, n) => new Date(d.getTime() + n * 86400000);
const ics = d => iso(d).replace(/-/g, '');
const empty = { dinner: null, lunch: null };

docs['mealplanning/danni-meal-plan'] = {
  pantryItems: ['flour'],
  recipes: [
    { id: 'r_stew', name: 'Beef stew', servings: 4, ingredients: [] },
    { id: 'r_tacos', name: 'Tacos', servings: 2, ingredients: [] }
  ],
  mealplan: {
    [iso(sunday)]: {
      Sun: { dinner: 'r_stew', lunch: null },
      Mon: { dinner: 'r_tacos', lunch: null },
      Tue: { dinner: 'OTHER', dinnerOther: 'Parents dinner', lunch: 'OTHER', lunchText: 'Bridal brunch' },
      Wed: { dinner: 'TAKEOUT', lunch: null },
      Thu: empty, Fri: empty, Sat: empty
    },
    [iso(plus(sunday, -35))]: { Sun: { dinner: 'r_stew', lunch: null }, Mon: empty, Tue: empty, Wed: empty, Thu: empty, Fri: empty, Sat: empty },
    [iso(plus(sunday, 210))]: { Sun: { dinner: 'r_tacos', lunch: null }, Mon: empty, Tue: empty, Wed: empty, Thu: empty, Fri: empty, Sat: empty }
  }
};

/* ---- helpers ---- */

const ENV = { PP_TOKEN: 'paste-sekrit', CAL_TOKEN: 'cal-sekrit', ANTHROPIC_API_KEY: 'unused' };

function get(path, env = ENV, method = 'GET'){
  return worker.fetch(new Request('https://helper.example' + path, { method }), env);
}
const unfold = body => body.replace(/\r\n /g, '');
const events = body => unfold(body).split('BEGIN:VEVENT').slice(1);

let failed = 0, ran = 0;
const eq = (label, got, want) => {
  ran++;
  if(JSON.stringify(got) === JSON.stringify(want)) return;
  failed++;
  console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
};

/* ---- who gets in ---- */

eq('no CAL_TOKEN set means no feeds', (await get('/cal/cal-sekrit/danni.ics', { PP_TOKEN: 'x' })).status, 404);
eq('a wrong token is a plain 404', (await get('/cal/nope/danni.ics')).status, 404);
eq('the paste helper token does not open it', (await get('/cal/paste-sekrit/danni.ics')).status, 404);
eq('an unknown feed is a 404', (await get('/cal/cal-sekrit/pets.ics')).status, 404);
eq('object built-ins are not feeds', (await get('/cal/cal-sekrit/constructor.ics')).status, 404);
eq('a malformed token is a 404, not a crash', (await get('/cal/%E0%A4%A/danni.ics')).status, 404);
eq('feeds cannot be posted to', (await get('/cal/cal-sekrit/danni.ics', ENV, 'POST')).status, 405);

/* ---- a quest feed ---- */

let res = await get('/cal/cal-sekrit/danni.ics');
let body = await res.text();
eq('danni feed is served', res.status, 200);
eq('as a calendar', res.headers.get('content-type'), 'text/calendar; charset=utf-8');
eq('read the right document', lastRead.path, 'questlog/danni-quest-log');
eq('asked only for the fields it uses', lastRead.mask.sort(), ['projects', 'tags', 'todos']);
eq('with the public key', lastRead.key, 'AIzaSyAdNZBoh1pH80-ZFBbOlcrlsLdMi3D62Wg');

eq('every line ends CRLF', body.endsWith('\r\n') && !body.replace(/\r\n/g, '').includes('\n'), true);
eq('no line over 75 bytes', body.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75), true);
eq('is a calendar', body.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'), true);
eq('names the calendar', unfold(body).includes("X-WR-CALNAME:Danni's quests\r\n"), true);

const ev = events(body);
eq('open dated to-dos and projects only', ev.length, 3);
eq('in date order', ev.map(e => e.match(/DTSTART;VALUE=DATE:(\d+)/)[1]), ['20261205', '20261231', '20270115']);
const ring = ev.find(e => e.includes('UID:quest-q1@'));
eq('escapes commas, semicolons and backslashes', ring.includes('SUMMARY:Ring venue\\, re: numbers\\; and \\\\ check\r\n'), true);
eq('is an all-day event', ring.includes('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n'), true);
eq('describes it with ticked subtasks', ring.includes('DESCRIPTION:To-do · High priority · Hard · Work\\n☑ Find number\\n☐ Call\r\n'), true);
eq('carries the tag', ring.includes('CATEGORIES:Work\r\n'), true);
eq('links back to the board', ring.includes('URL:https://princessandpaladin.com/quest-log/\r\n'), true);
eq('does not block time', ring.includes('TRANSP:TRANSPARENT'), true);
const wrap = ev.find(e => e.includes('UID:quest-q5@'));
eq('long titles survive folding, emoji and all', wrap.includes("SUMMARY:Wrap the 🎁 presents for everyone in the family before the party at Grandma's house 🎄🎄🎄\r\n"), true);
eq('an odd difficulty and a deleted tag fall back quietly', wrap.includes('DESCRIPTION:To-do · Low priority · Medium\r\n') && !wrap.includes('CATEGORIES'), true);
eq('projects are included', ev.some(e => e.includes('SUMMARY:Fill holes with spackle') && e.includes('Project · Medium priority · Hard')), true);
eq('done, undated and impossible dates are left out', /Done thing|Someday thing|Bad date thing/.test(body), false);
eq('dailies are left out', body.includes('Take AM meds'), false);

res = await get('/cal/cal-sekrit/brendon.ics');
body = unfold(await res.text());
eq('brendon has his own feed', lastRead.path, 'questlog/brendon-quest-log');
eq('with his quests', body.includes('SUMMARY:Buy rings'), true);
eq('and links to his log', body.includes('URL:https://princessandpaladin.com/quest-log/?who=brendon'), true);
eq('and none of danni\'s', body.includes('Ring venue'), false);

/* ---- the meal feed ---- */

res = await get('/cal/cal-sekrit/meals.ics');
body = await res.text();
eq('meal feed is served', res.status, 200);
eq('reads the meal plan', lastRead.path, 'mealplanning/danni-meal-plan');
eq('asking for the plan and recipes only', lastRead.mask.sort(), ['mealplan', 'recipes']);
const meals = events(body).map(e => [e.match(/DTSTART;VALUE=DATE:(\d+)/)[1], e.match(/SUMMARY:(.*)\r\n/)[1]]);
eq('lunch and dinner, worked out like the site does', meals, [
  [ics(sunday), 'Dinner: Beef stew'],
  [ics(plus(sunday, 1)), 'Lunch: Leftovers — Beef stew'],
  [ics(plus(sunday, 1)), 'Dinner: Tacos'],
  [ics(plus(sunday, 2)), 'Lunch: Bridal brunch'],
  [ics(plus(sunday, 2)), 'Dinner: Parents dinner'],
  [ics(plus(sunday, 3)), 'Dinner: Take out']
]);
eq('a meal keeps the same UID when it changes', events(body)[0].includes(`UID:meal-${iso(sunday)}-dinner@princessandpaladin.com`), true);

/* ---- when things go wrong ---- */

firestoreStatus = 503;
eq('Firestore being down is a 502', (await get('/cal/cal-sekrit/danni.ics')).status, 502);
firestoreStatus = 200;

delete docs['questlog/brendon-quest-log'];
res = await get('/cal/cal-sekrit/brendon.ics');
body = await res.text();
eq('a missing log is an empty calendar, not an error', [res.status, events(body).length, body.includes('END:VCALENDAR')], [200, 0, true]);

res = await get('/cal/cal-sekrit/danni.ics', ENV, 'HEAD');
eq('HEAD is answered without a body', [res.status, (await res.text()).length], [200, 0]);

/* ---- the paste helper is untouched ---- */
res = await worker.fetch(new Request('https://helper.example/', { method: 'GET' }), ENV);
eq('a GET on the root is still the paste helper\'s 405', res.status, 405);

console.log(failed ? `\n${failed} of ${ran} failed` : `all ${ran} passed`);
process.exit(failed ? 1 : 0);
