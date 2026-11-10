/* ==========================================================================
   Princess & Paladin — meal plan shared logic
   /assets/pp-meals.js

   Loaded by the Meal Planner and by the home page's Today panel, so both
   agree on what a day's lunch and dinner are. Nothing in here reads or
   writes Firestore or touches the page: it's given the plan and a way to
   look up a recipe, and it answers questions about them.

   WHAT A DAY HOLDS
   dinner       a recipe id, one of the DINNER_SPECIALS keys below, or null (empty)
   dinnerOther  the words typed next to "Other" — only kept when dinner is OTHER
   lunch        null = automatic (leftovers, worked out by computeLunches).
                'OTHER' = typed by hand, the words are in lunchText.
                Older weeks may still hold 'SKIP' or a recipe id from when lunch
                was a dropdown; those are still shown and still count.
   lunchFor     the days this dinner makes lunch for, once ticked by hand
                (e.g. ['Mon','Tue']). Left off = worked out from servings.

   The optional ones are only stored when they're set, and the keys are kept
   in alphabetical order because that's the order Firestore hands them back
   in — otherwise every page load would look like a change and re-save.
   ========================================================================== */

window.PPMeals = (function(){
  "use strict";

  var DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var DAY_LABELS = { Sun:'Sunday', Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday' };
  var HOUSEHOLD = 2; // always 2 people

  var DINNER_SPECIALS = {
    TAKEOUT:  'Take out',
    CLEANOUT: 'Fridge cleanout',
    OTHER:    'Other',
    SKIP:     'Eating out / other'   // the old catch-all: still shown on weeks that used it, no longer offered
  };
  function isRecipeChoice(v){ return !!v && !DINNER_SPECIALS[v]; }

  /* The key a week is stored under: the date of its Sunday. */
  function weekStartOf(date){
    var d = new Date(date); d.setHours(0,0,0,0);
    d.setDate(d.getDate() - d.getDay());
    return d.toISOString().slice(0,10);
  }

  function normalizeDay(val){
    if (val && typeof val === 'object'){
      var day = { dinner: val.dinner == null ? null : val.dinner };
      if (day.dinner === 'OTHER' && val.dinnerOther) day.dinnerOther = String(val.dinnerOther);
      day.lunch = val.lunch == null ? null : val.lunch;
      if (day.dinner && Array.isArray(val.lunchFor)) day.lunchFor = val.lunchFor.filter(function(d){ return DAY_KEYS.indexOf(d) > -1; });
      if (day.lunch === 'OTHER'){
        if (val.lunchText) day.lunchText = String(val.lunchText);
        else day.lunch = null; // "other" with nothing typed is just automatic
      }
      return day;
    }
    return { dinner: val == null ? null : val, lunch: null }; // legacy format: bare dinner value
  }

  /* `getRecipe(id)` is how these look a recipe up — each page has its own
     copy of the recipe list, so it hands in the lookup. */

  function dinnerName(day, getRecipe){
    var v = day.dinner;
    if (!v) return '';
    if (v === 'OTHER') return day.dinnerOther || 'Other';
    if (DINNER_SPECIALS[v]) return DINNER_SPECIALS[v];
    var r = getRecipe(v);
    return r ? r.name : '';
  }

  /* The words for a lunch that isn't automatic. */
  function lunchWords(day, getRecipe){
    if (day.lunch === 'OTHER') return day.lunchText || '';
    if (day.lunch === 'SKIP') return 'Not eating lunch';
    var r = day.lunch ? getRecipe(day.lunch) : null; // an older week's recipe pick
    return r ? r.name : '';
  }

  /* Figures out, for each day, whether lunch is leftovers — and from which dinner.
     A dinner's leftover portions = servings - household (what's eaten at dinner)
     become a "batch" available starting the day after it's cooked. Each lunch
     day eats `household` portions from the OLDEST batch that still has stock —
     oldest leftovers get eaten first, same as you'd actually clear a fridge —
     so a batch's days never get silently skipped just because a fresher dinner
     happened in the meantime. A batch's stock never carries into next week.

     Two things can overrule the servings maths:
       - Ticks under a dinner. Once you tick or untick a day there, that dinner
         makes lunch for exactly the days ticked, whatever its servings say.
       - A lunch you typed yourself. That day doesn't eat any leftovers, so
         they roll on to the next lunch that's still automatic.

     A lunch only ever comes from ONE dinner. Once a day is ticked under a
     dinner (by hand, or by the servings maths), no other dinner can take it —
     its tick for that day is greyed out until the first one lets go.

     `days` is one week: { Sun:{…}, Mon:{…}, … }, each already through
     normalizeDay. Returns { labels, feeds, owner, leftovers }:
       labels[i]         the automatic lunch for day i ('—' when there's nothing)
       feeds[dinnerDay]  the days that dinner makes lunch for — what the ticks show
       owner[i]          which night's dinner is day i's lunch, or null
       leftovers[dinnerDay]  { total, left } in servings: what the recipe leaves
                         after dinner, and what's still there after the lunches
                         it's ticked for (negative = ticked for more than it
                         makes). null when the dinner isn't a recipe. */
  function computeLunches(days, getRecipe, household){
    household = household || HOUSEHOLD;
    var owner = DAY_KEYS.map(function(){ return null; });
    var feeds = {};
    DAY_KEYS.forEach(function(k){ feeds[k] = []; });
    function claim(dinnerDay, j){ owner[j] = dinnerDay; feeds[dinnerDay].push(DAY_KEYS[j]); }
    function leftoverServings(day){
      var r = isRecipeChoice(day.dinner) ? getRecipe(day.dinner) : null;
      return r ? Math.max(0, (Number(r.servings) || 0) - household) : null;
    }

    // Hand-ticked dinners first, so the automatic ones can work around them.
    // If two somehow list the same day, the earlier night keeps it.
    DAY_KEYS.forEach(function(k, i){
      var day = days[k];
      if (!day.dinner || !Array.isArray(day.lunchFor)) return;
      DAY_KEYS.forEach(function(d, j){
        if (j <= i || day.lunchFor.indexOf(d) < 0) return; // can't be lunch before it's cooked
        if (owner[j] || days[d].lunch) return;             // already taken, or lunch was typed in
        claim(k, j);
      });
    });

    var batches = []; // { day, daysLeft }, oldest first
    DAY_KEYS.forEach(function(k, i){
      var day = days[k];

      // Today's lunch, from whichever batch (created on an earlier day) has
      // stock left. Today's own dinner isn't cooked yet, so it can't feed it.
      // Skipped if a hand-ticked dinner already covers today, or lunch was typed in.
      if (!owner[i] && !day.lunch){
        var batch = batches.filter(function(b){ return b.daysLeft > 0; })[0];
        if (batch){
          claim(batch.day, i);
          batch.daysLeft--;
        }
      }

      // Today's dinner starts a new batch, available from tomorrow.
      if (Array.isArray(day.lunchFor)) return;
      var daysLeft = Math.floor((leftoverServings(day) || 0) / household);
      if (daysLeft > 0) batches.push({ day: k, daysLeft: daysLeft });
    });

    var leftovers = {};
    DAY_KEYS.forEach(function(k){
      var total = leftoverServings(days[k]);
      leftovers[k] = total == null ? null : { total: total, left: total - feeds[k].length * household };
    });

    return {
      labels: owner.map(function(o){ return o ? 'Leftovers — ' + dinnerName(days[o], getRecipe) : '—'; }),
      feeds: feeds, owner: owner, leftovers: leftovers
    };
  }

  /* What's on for one date, straight from the saved meal state (the whole
     Firestore document: { recipes, mealplan, … }). Returns
     { lunch, dinner } as words, each '' when nothing is planned. Used by
     the home page. */
  function mealsOn(mealState, date){
    var recipes = (mealState && mealState.recipes) || [];
    function getRecipe(id){ return recipes.filter(function(r){ return r.id === id; })[0]; }
    var week = ((mealState && mealState.mealplan) || {})[weekStartOf(date)] || {};
    var days = {};
    DAY_KEYS.forEach(function(k){ days[k] = normalizeDay(week[k]); });

    var i = new Date(date).getDay();
    var day = days[DAY_KEYS[i]];
    var auto = computeLunches(days, getRecipe).labels[i];
    return {
      lunch: day.lunch ? lunchWords(day, getRecipe) : (auto === '—' ? '' : auto),
      dinner: dinnerName(day, getRecipe)
    };
  }

  return {
    DAY_KEYS: DAY_KEYS, DAY_LABELS: DAY_LABELS, HOUSEHOLD: HOUSEHOLD,
    DINNER_SPECIALS: DINNER_SPECIALS, isRecipeChoice: isRecipeChoice,
    weekStartOf: weekStartOf, normalizeDay: normalizeDay,
    dinnerName: dinnerName, lunchWords: lunchWords,
    computeLunches: computeLunches, mealsOn: mealsOn
  };
})();
