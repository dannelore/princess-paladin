/* ==========================================================================
   Princess & Paladin — the cleaning schedule
   /assets/pp-cleaning.js

   The schedule itself lives here, as a plain list, so the Cleaning Schedule
   page (and anything else that wants to know what's on today) reads the
   same one. Nothing in here touches the page or Firestore.

   ADDING A CHORE
   Add an entry to SCHEDULE:

     { name: 'Trash Tuesday',              optional — leave it off for a day
                                           that's just a list of jobs
       days: ['Tue'],                      which days it happens (Sun … Sat)
       parts: [                            who does which bit
         { who: 'D', tasks: ['…', '…'] },  D = Danni, B = Brendon,
         { who: 'B', tasks: ['…'] }        DB = both of us together
       ] }

   A chore on more than one day lists them all: days: ['Tue','Fri'].
   `tasks` can be empty when the name says it all (Date Night).

   WEEKENDS ARE DIFFERENT
   They don't repeat every week — they go round a four-week loop (WEEKENDS,
   further down): a deep clean, a kid weekend, the other deep clean, a kid
   weekend, then back to the start. A weekend is Friday to Sunday, and all
   three days show whatever that weekend is.
   ========================================================================== */

window.PPCleaning = (function(){
  "use strict";

  var DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DAY_LABELS = { Sun:'Sunday', Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' };
  var PEOPLE = { D:'Danni', B:'Brendon', DB:'Both' };

  var SCHEDULE = [
    { name: 'Trash Tuesday',
      days: ['Tue'],
      parts: [
        { who: 'D', tasks: ['Collect the green bags', 'Reline the barrels'] },
        { who: 'B', tasks: ['Take out the trash', 'Take out the recycling', 'Take out the litterbox'] }
      ] },

    { name: 'Work/Wedding Wednesday',
      days: ['Wed'],
      parts: [
        { who: 'DB', tasks: ['Adulting tasks', 'Anything to do with the wedding'] }
      ] },

    { name: 'Date Night',
      days: ['Thu'],
      parts: [
        { who: 'DB', tasks: [] }
      ] },

    { days: ['Fri'],
      parts: [
        { who: 'D', tasks: ['Sort the laundry', 'Create the meal plan', 'Start the shopping cart'] },
        { who: 'B', tasks: ['Finalize the cart', 'Place the order'] }
      ] }
  ];

  /* The weekend loop, in order. Each one is written like a chore above,
     minus the days.

     A weekend here runs Friday to Sunday.

     WEEKEND_START is a Friday that began the FIRST weekend in the list.
     Everything else is counted from it, four weeks at a time — so if the
     loop ever slips (a swapped kid weekend, say), moving this one date
     puts it right. */
  var WEEKEND_DAYS = ['Fri', 'Sat', 'Sun'];
  var WEEKENDS = [
    { name: 'Deep Clean',  parts: [{ who: 'DB', tasks: ['Bedroom', 'Bathroom'] }] },
    { name: 'Kid Weekend', parts: [{ who: 'DB', tasks: [] }] },
    { name: 'Deep Clean',  parts: [{ who: 'DB', tasks: ['Living room', 'Kitchen'] }] },
    { name: 'Kid Weekend', parts: [{ who: 'DB', tasks: [] }] }
  ];
  var WEEKEND_START = '2026-11-20';

  var DAY_MS = 24 * 60 * 60 * 1000;
  function atMidnight(date){ var d = new Date(date); d.setHours(0,0,0,0); return d; }

  /* The weekend a date belongs to. Saturday and Sunday go with the Friday
     before them; Monday to Thursday look ahead to the Friday coming.
     Returns { friday, sunday, plan } — plan is the entry from WEEKENDS. */
  function weekendOf(date){
    var fri = atMidnight(date);
    var dow = fri.getDay();
    fri.setDate(fri.getDate() + (dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow));
    var p = WEEKEND_START.split('-');
    var start = new Date(+p[0], +p[1] - 1, +p[2]);
    var weeks = Math.round((fri - start) / (7 * DAY_MS)); // round: clock changes make a week an hour off
    var n = WEEKENDS.length;
    var sun = new Date(fri); sun.setDate(sun.getDate() + 2);
    return { friday: fri, sunday: sun, plan: WEEKENDS[((weeks % n) + n) % n] };
  }

  /* The next `count` weekends, starting with the one `from` belongs to. */
  function weekendsFrom(from, count){
    var first = weekendOf(from).friday, out = [];
    for (var i = 0; i < count; i++){
      var d = new Date(first); d.setDate(d.getDate() + i * 7);
      out.push(weekendOf(d));
    }
    return out;
  }

  /* Everything on for one date: that weekday's chores, plus the weekend's
     plan if it's a Friday, Saturday or Sunday. */
  function choresOn(date){
    var d = atMidnight(date);
    var key = DAY_KEYS[d.getDay()];
    var list = SCHEDULE.filter(function(c){ return c.days.indexOf(key) > -1; });
    if (WEEKEND_DAYS.indexOf(key) > -1) list.push(weekendOf(d).plan);
    return list;
  }

  return {
    DAY_KEYS: DAY_KEYS, DAY_LABELS: DAY_LABELS, PEOPLE: PEOPLE,
    SCHEDULE: SCHEDULE, WEEKENDS: WEEKENDS,
    choresOn: choresOn, weekendOf: weekendOf, weekendsFrom: weekendsFrom
  };
})();
