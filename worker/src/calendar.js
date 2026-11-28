/* ==========================================================================
   Princess & Paladin — calendar feeds
   worker/src/calendar.js

   Turns the quest log and the meal plan into calendar feeds (.ics) that a
   Skylight — or anything else that subscribes to a calendar link — can show.

     /cal/<CAL_TOKEN>/danni.ics     Danni's open quests that have a due date
     /cal/<CAL_TOKEN>/brendon.ics   Brendon's, the same
     /cal/<CAL_TOKEN>/meals.ics     lunch and dinner from the meal plan

   Everything is an all-day event, so there are no time zones to get wrong.
   A quest leaves the feed when it's ticked off; dailies are left out
   altogether, since every day of every week would be wall-to-wall habits.

   It only ever reads. It goes through Firestore's REST API with the same
   public key the board ships in /assets/pp-firebase.js, so it can see
   exactly what the board can and nothing more, and it asks for just the
   fields it uses. The token in the path is what keeps the feed itself
   private: the link gets handed to Skylight, so it's a different secret
   from the paste helper's, and changing it only breaks the calendar.
   ========================================================================== */

import { PPMeals } from './meals.js';

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/princess-paladin/databases/(default)/documents';
const FIREBASE_KEY = 'AIzaSyAdNZBoh1pH80-ZFBbOlcrlsLdMi3D62Wg'; // public client key, as in /assets/pp-firebase.js
const SITE = 'https://princessandpaladin.com';
const UID_HOST = 'princessandpaladin.com';

/* Mirrors PEOPLE in /assets/pp-quest.js — which file is whose. */
const PEOPLE = {
  danni:   { name: 'Danni',   doc: 'danni-quest-log' },
  brendon: { name: 'Brendon', doc: 'brendon-quest-log' }
};

const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
const DIFFICULTY_LABEL = { 1: 'Trivial', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Gruelling' };

/* How far either side of today the meal feed reaches. The plan is made a
   week or two ahead; a little history keeps last week's dinners visible. */
const MEAL_DAYS_BACK = 14;
const MEAL_DAYS_AHEAD = 56;

/* ---------- reading Firestore ---------- */

/* Firestore's REST API wraps every value in its type ({ stringValue: … },
   { mapValue: { fields: … } }); this unwraps it into plain JSON. */
export function fromFirestore(v){
  if(!v || typeof v !== 'object') return null;
  if('nullValue' in v) return null;
  if('stringValue' in v) return v.stringValue;
  if('booleanValue' in v) return v.booleanValue;
  if('integerValue' in v) return Number(v.integerValue);
  if('doubleValue' in v) return Number(v.doubleValue);
  if('timestampValue' in v) return v.timestampValue;
  if('referenceValue' in v) return v.referenceValue;
  if('bytesValue' in v) return v.bytesValue;
  if('geoPointValue' in v) return v.geoPointValue;
  if('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestore);
  if('mapValue' in v) return fromFields(v.mapValue.fields);
  return null;
}
function fromFields(fields){
  const out = {};
  for(const k of Object.keys(fields || {})) out[k] = fromFirestore(fields[k]);
  return out;
}

async function readDoc(path, fieldPaths){
  const mask = fieldPaths.map(f => 'mask.fieldPaths=' + encodeURIComponent(f)).join('&');
  const res = await fetch(`${FIRESTORE}/${path}?${mask}&key=${FIREBASE_KEY}`);
  if(res.status === 404) return {};
  if(!res.ok) throw new Error(`Firestore answered ${res.status}`);
  const doc = await res.json();
  return fromFields(doc.fields);
}

/* ---------- writing .ics ---------- */

/* Text values: backslash, semicolon and comma are escaped, newlines become
   a literal \n, and other control characters aren't allowed at all. */
function esc(s){
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/* Lines may be at most 75 bytes; longer ones carry on after CRLF + space.
   Counted in UTF-8 bytes and split between characters, never inside one. */
const utf8 = new TextEncoder();
function fold(line){
  let out = '', bytes = 0;
  for(const ch of line){
    const n = utf8.encode(ch).length;
    if(bytes + n > 75){ out += '\r\n '; bytes = 1; }
    out += ch; bytes += n;
  }
  return out;
}

function isDateKey(s){
  if(typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function icsDate(key){ return key.replace(/-/g, ''); }
function nextDay(key){
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function stamp(now){ return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'); }

function calendar(name, description, events, now){
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Princess & Paladin//Calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(name),
    'X-WR-CALDESC:' + esc(description),
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H'
  ];
  for(const e of events){
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + e.uid,
      'DTSTAMP:' + stamp(now),
      'DTSTART;VALUE=DATE:' + icsDate(e.date),
      'DTEND;VALUE=DATE:' + icsDate(nextDay(e.date)),
      'SUMMARY:' + esc(e.summary)
    );
    if(e.description) lines.push('DESCRIPTION:' + esc(e.description));
    if(e.category) lines.push('CATEGORIES:' + esc(e.category));
    if(e.url) lines.push('URL:' + e.url);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------- the feeds ---------- */

export function questEvents(log, who){
  const tags = Array.isArray(log.tags) ? log.tags : [];
  const tagName = id => (tags.find(t => t && t.id === id) || {}).name || '';
  const link = SITE + '/quest-log/' + (who === 'danni' ? '' : '?who=' + who);
  const events = [];

  [['todos', 'To-do'], ['projects', 'Project']].forEach(([col, kind]) => {
    (Array.isArray(log[col]) ? log[col] : []).forEach(t => {
      if(!t || t.done || !isDateKey(t.due)) return;
      const tag = tagName(t.tag);
      const facts = [
        kind,
        (PRIORITY_LABEL[t.priority] || 'Medium') + ' priority',
        DIFFICULTY_LABEL[t.difficulty] || DIFFICULTY_LABEL[3]
      ];
      if(tag) facts.push(tag);
      const subDone = t.subDone || {};
      const subs = (Array.isArray(t.subs) ? t.subs : [])
        .filter(s => s && s.title)
        .map(s => (subDone[s.id] ? '☑ ' : '☐ ') + s.title);
      events.push({
        uid: `quest-${t.id}@${UID_HOST}`,
        date: t.due,
        summary: String(t.title || '').trim() || 'Untitled quest',
        description: [facts.join(' · '), ...subs].join('\n'),
        category: tag,
        url: link
      });
    });
  });
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary));
}

function localKey(d){
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/* Asks pp-meals.js what's on each day, the same question the home page's
   Today panel asks, so the calendar and the site always agree. */
export function mealEvents(state, now){
  const events = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - MEAL_DAYS_BACK);
  for(let i = 0; i <= MEAL_DAYS_BACK + MEAL_DAYS_AHEAD; i++){
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localKey(day);
    const meals = PPMeals.mealsOn(state, day);
    [['lunch', 'Lunch'], ['dinner', 'Dinner']].forEach(([slot, label]) => {
      const words = String(meals[slot] || '').trim();
      if(!words) return;
      events.push({
        uid: `meal-${key}-${slot}@${UID_HOST}`,
        date: key,
        summary: `${label}: ${words}`,
        url: SITE + '/castle/meal-planner.html'
      });
    });
  }
  return events;
}

const FEEDS = {
  meals: {
    async build(now){
      const state = await readDoc('mealplanning/danni-meal-plan', ['mealplan', 'recipes']);
      return calendar('Meal plan', 'Lunch and dinner from the Princess & Paladin meal planner.', mealEvents(state, now), now);
    }
  }
};
for(const [who, person] of Object.entries(PEOPLE)){
  FEEDS[who] = {
    async build(now){
      const log = await readDoc('questlog/' + person.doc, ['todos', 'projects', 'tags']);
      return calendar(`${person.name}'s quests`,
        `${person.name}'s open quests with a due date, from the Princess & Paladin quest log.`,
        questEvents(log, who), now);
    }
  };
}

function text(body, status){
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

/* GET /cal/<token>/<feed>.ics. A wrong token, a missing one, or the feed
   being switched off (no CAL_TOKEN set) all look like a plain 404, so the
   URL gives nothing away to anyone guessing at it. */
export async function calendarResponse(request, env, url){
  if(request.method !== 'GET' && request.method !== 'HEAD') return text('Calendar feeds are read-only.', 405);

  const m = url.pathname.match(/^\/cal\/([^/]+)\/([a-z]+)\.ics$/);
  let token = '';
  try { token = m ? decodeURIComponent(m[1]) : ''; } catch { /* malformed: treated as wrong */ }
  const feed = m && Object.prototype.hasOwnProperty.call(FEEDS, m[2]) ? FEEDS[m[2]] : null;
  if(!env.CAL_TOKEN || !feed || token !== env.CAL_TOKEN) return text('Not found.', 404);

  let body;
  try { body = await feed.build(new Date()); }
  catch(err){
    /* Skylight and friends keep the last copy they had when a refresh
       fails, so an error here just means a stale calendar for a while. */
    return text('Could not read the quest log just now.', 502);
  }

  return new Response(request.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${m[2]}.ics"`,
      'Cache-Control': 'private, max-age=300'
    }
  });
}
