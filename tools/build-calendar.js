#!/usr/bin/env node
/* Builds the two calendar feeds the Skylight Calendar subscribes to.

     node tools/build-calendar.js

   Writes:
     /calendar/household.ics   the cleaning schedule, from /assets/pp-cleaning.js
     /calendar/meals.ics       lunches and dinners, from the newest file in
                               /firestore_backups/

   The site is static, so the feeds are ordinary files in the repo. The daily
   backup workflow (.github/workflows/firestore-backup.yml) runs this right
   after the backup and commits whatever changed, so both feeds are never
   more than a day behind the site.

   It's one-way: the site tells the Skylight, never the other way round. On
   the Skylight app, each feed is added once under Sync Calendars → Sync new
   calendar → Calendar URL, and the Skylight re-reads it on its own after that.

   NOTHING IS COPIED
   The schedule and the meal logic are loaded straight out of the two assets
   files the pages use (with a pretend `window` for them to hang off), so
   the feeds can't disagree with the site.

   RUNNING IT TWICE CHANGES NOTHING
   Nothing in the output comes from the clock. Every event's id (UID) is made
   from what the event is, so the Skylight sees the same event again rather
   than a new one, and the "last touched" stamp every event has to carry
   (DTSTAMP) is taken from the data too.

   THE FEEDS ARE PUBLIC, like the rest of the site. Only chore names, meal
   names and first names go in. */

"use strict";

// Dates here are plain calendar days. Pinning the clock to UTC means a day
// is always exactly 24 hours and this gives the same answer on any machine.
process.env.TZ = 'UTC';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'calendar');
const BACKUP_DIR = path.join(ROOT, 'firestore_backups');
const SITE = 'princessandpaladin.com';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_BACK = 2; // how many weeks of past meals stay in the feed
const ICS_DAYS = { Sun:'SU', Mon:'MO', Tue:'TU', Wed:'WE', Thu:'TH', Fri:'FR', Sat:'SA' };

/* ---------- loading the site's own scripts ---------- */

/* Runs a browser script from /assets with an empty `window`, and hands back
   whatever it hung on it (window.PPCleaning, window.PPMeals). */
function loadAsset(file, name){
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets', file), 'utf8'), sandbox, { filename: file });
  if (!sandbox.window[name]) throw new Error(file + ' did not set window.' + name);
  return sandbox.window[name];
}

/* ---------- dates ---------- */

function parseDay(iso){ const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(date, n){ return new Date(date.getTime() + n * DAY_MS); }
function isoDay(date){ return date.toISOString().slice(0, 10); }
function icsDay(date){ return isoDay(date).replace(/-/g, ''); }            // 20261120
function icsStamp(date){ return icsDay(date) + 'T000000Z'; }               // 20261120T000000Z

/* ---------- writing iCalendar ---------- */

/* Commas, semicolons, backslashes and line breaks all mean something in an
   .ics file, so in ordinary text they have to be escaped. */
function escapeText(s){
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/* No line may be longer than 75 bytes. A longer one is carried on to the
   next line, which starts with a space to say "still the same line". The
   count is in bytes, not letters, and a letter that takes several bytes
   (é, —) is never split down the middle. */
function fold(line){
  const out = [];
  let current = '', size = 0;
  for (const ch of line){
    const bytes = Buffer.byteLength(ch, 'utf8');
    if (size + bytes > 75){
      out.push(current);
      current = ' '; size = 1;
    }
    current += ch; size += bytes;
  }
  out.push(current);
  return out;
}

/* One all-day event. `end` is the day AFTER the last day — that's how
   all-day events are written. `rrule` is left off for a one-off. */
function eventLines(ev){
  const lines = [
    'BEGIN:VEVENT',
    'UID:' + ev.uid + '@' + SITE,
    'DTSTAMP:' + icsStamp(ev.stamp),
    'DTSTART;VALUE=DATE:' + icsDay(ev.start),
    'DTEND;VALUE=DATE:' + icsDay(ev.end)
  ];
  if (ev.rrule) lines.push('RRULE:' + ev.rrule);
  lines.push('SUMMARY:' + escapeText(ev.title));
  if (ev.description) lines.push('DESCRIPTION:' + escapeText(ev.description));
  lines.push('TRANSP:TRANSPARENT'); // doesn't mark anyone as busy
  lines.push('END:VEVENT');
  return lines;
}

function calendarText(name, events){
  let lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Princess & Paladin//Skylight feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(name)
  ];
  events.forEach(function(ev){ lines = lines.concat(eventLines(ev)); });
  lines.push('END:VCALENDAR');
  // Lines end with CRLF, including the last one.
  return lines.map(function(l){ return fold(l).join('\r\n'); }).join('\r\n') + '\r\n';
}

function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/* ---------- the household schedule ---------- */

/* "Danni: Collect the green bags, Reline the barrels" — one line per person.
   A part with no tasks is just the name ("Both"). */
function whoDoesWhat(chore, PEOPLE){
  return chore.parts.map(function(part){
    const who = PEOPLE[part.who] || part.who;
    return part.tasks.length ? who + ': ' + part.tasks.join(', ') : who;
  }).join('\n');
}

function allTasks(chore){
  return chore.parts.reduce(function(list, part){ return list.concat(part.tasks); }, []);
}

/* A chore with no name (Friday's list of jobs) is titled by its first two
   jobs, with a count of the rest: "Sort the laundry, Create the meal plan
   + 3 more". */
function choreTitle(chore){
  if (chore.name) return chore.name;
  const tasks = allTasks(chore);
  if (!tasks.length) return 'Chores';
  const shown = tasks.slice(0, 2).join(', ');
  return tasks.length > 2 ? shown + ' + ' + (tasks.length - 2) + ' more' : shown;
}

/* Two weekends in the loop are both called "Deep Clean", so a weekend's
   title says which rooms too: "Deep Clean: Bedroom & Bathroom". */
function weekendTitle(plan){
  const tasks = allTasks(plan);
  const name = plan.name || 'Weekend';
  return tasks.length ? name + ': ' + tasks.join(' & ') : name;
}

function buildHousehold(){
  const C = loadAsset('pp-cleaning.js', 'PPCleaning');
  if (!C.WEEKEND_START) throw new Error('pp-cleaning.js no longer shares WEEKEND_START');

  const loopStart = parseDay(C.WEEKEND_START);
  const loopWeeks = C.WEEKENDS.length;
  // Everything starts one whole loop before WEEKEND_START, so the weeks just
  // gone (and the one we're in) show on the Skylight too.
  const from = addDays(loopStart, -7 * loopWeeks);
  const events = [];
  const used = {};
  function uniqueId(id){
    used[id] = (used[id] || 0) + 1;
    return used[id] > 1 ? id + '-' + used[id] : id;
  }

  // The weekly chores: one event each, repeating every week on its day(s).
  C.SCHEDULE.forEach(function(chore){
    const days = C.DAY_KEYS.filter(function(k){ return chore.days.indexOf(k) > -1; });
    if (!days.length) return;
    // The first of its days on or after `from`.
    let start = from;
    while (days.indexOf(C.DAY_KEYS[start.getDay()]) < 0) start = addDays(start, 1);
    events.push({
      uid: uniqueId('chore-' + slug(chore.name || days.join('-'))),
      stamp: loopStart,
      start: start,
      end: addDays(start, 1),
      rrule: 'FREQ=WEEKLY;BYDAY=' + days.map(function(k){ return ICS_DAYS[k]; }).join(','),
      title: choreTitle(chore),
      description: whoDoesWhat(chore, C.PEOPLE)
    });
  });

  // The weekend loop: each entry is one Friday-to-Sunday event that comes
  // round again every time the loop does. The site is asked which weekend
  // each Friday is, rather than counting here, so the two always match.
  for (let i = 0; i < loopWeeks; i++){
    const weekend = C.weekendOf(addDays(from, 7 * i));
    const friday = parseDay(isoDay(weekend.friday));
    const length = Math.round((weekend.sunday - weekend.friday) / DAY_MS) + 1;
    events.push({
      uid: 'weekend-' + (C.WEEKENDS.indexOf(weekend.plan) + 1),
      stamp: loopStart,
      start: friday,
      end: addDays(friday, length),
      rrule: 'FREQ=WEEKLY;INTERVAL=' + loopWeeks,
      title: weekendTitle(weekend.plan),
      description: whoDoesWhat(weekend.plan, C.PEOPLE)
    });
  }

  return calendarText('Household Schedule', events);
}

/* ---------- the meal plan ---------- */

/* The newest backup, going by the date in its name
   (firestore-2026-11-16.json). */
function newestBackup(){
  const files = fs.readdirSync(BACKUP_DIR).filter(function(f){ return /^firestore-\d{4}-\d{2}-\d{2}\.json$/.test(f); }).sort();
  if (!files.length) throw new Error('No backups in ' + BACKUP_DIR);
  const file = files[files.length - 1];
  return { date: parseDay(file.slice(10, 20)), data: JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), 'utf8')) };
}

function buildMeals(){
  const M = loadAsset('pp-meals.js', 'PPMeals');
  const backup = newestBackup();
  const doc = ((backup.data.collections || {}).mealplanning || {})['danni-meal-plan'];
  const state = (doc && doc.data) || {};
  const weeks = Object.keys(state.mealplan || {}).filter(function(k){ return /^\d{4}-\d{2}-\d{2}$/.test(k); }).sort();

  // From two weeks before the backup was taken, to the Saturday of the last
  // week that has anything saved. "Two weeks back" is counted from the
  // backup's date, not today's, so the same backup always gives the same feed.
  const first = addDays(backup.date, -7 * WEEK_BACK);
  const last = weeks.length ? addDays(parseDay(weeks[weeks.length - 1]), 6) : first;

  const events = [];
  for (let day = first; day <= last; day = addDays(day, 1)){
    const meals = M.mealsOn(state, day); // the same answer the home page shows
    const stamp = parseDay(M.weekStartOf(day));
    [['lunch', 'Lunch'], ['dinner', 'Dinner']].forEach(function(slot){
      const words = meals[slot[0]];
      if (!words) return; // nothing planned
      events.push({
        uid: 'meal-' + isoDay(day) + '-' + slot[0],
        stamp: stamp,
        start: day,
        end: addDays(day, 1),
        title: slot[1] + ': ' + words
      });
    });
  }

  return calendarText('Meal Plan', events);
}

/* ---------- go ---------- */

fs.mkdirSync(OUT_DIR, { recursive: true });
[['household.ics', buildHousehold()], ['meals.ics', buildMeals()]].forEach(function(feed){
  fs.writeFileSync(path.join(OUT_DIR, feed[0]), feed[1]);
  console.log('Wrote calendar/' + feed[0] + ' (' + (feed[1].match(/BEGIN:VEVENT/g) || []).length + ' events)');
});
