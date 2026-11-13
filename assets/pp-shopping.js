/* ==========================================================================
   Princess & Paladin — shopping list shared logic
   /assets/pp-shopping.js

   Loaded by the Meal Planner and by the week page (/castle/week.html), so
   both build the same shopping list from the same week. Load it after
   /assets/pp-meals.js. Nothing in here reads or writes Firestore or touches
   the page: it's given the week's recipes, the pantry and the extras, and
   hands back the list, sorted into aisles.
   ========================================================================== */

window.PPShopping = (function(){
  "use strict";

  /* ============ SHOPPING-LIST CATEGORIES ============
     THIS is the list to edit. Each grocery item on the shopping list is matched
     against the names below and filed under whichever category you put it in.
     To move an item, just move its name from one list to another — no other code
     needs to change. Matching is by whole words and ignores plurals, quantities,
     and units, so "6 oz of frozen corn" still finds "corn (frozen)".            */
  const SHOPPING_CATEGORIES = {
    Produce:      ['asparagus','bell peppers','celery','corn (fresh)','green beans (fresh)','mushrooms','onion','spinach'],
    Meat:         ['beef chuck roast','chicken breast','chicken thighs','ground beef','ground turkey','kielbasa','pork shoulder'],
    Dairy:        ['butter','cream cheese','eggs','grated cheese','milk','shredded cheese','sliced cheese'],
    Refrigerated: ['desired pizza toppings','Garlic & Herb cream cheese','refrigerated pizza crust','salsa','sour cream'],
    Frozen:       ['corn (frozen)','frozen chicken fries','frozen Chinese chicken','frozen garlic bread','frozen hamburger patties','green beans (frozen)','zucchini fries'],
    Spices:       ['bay leaves','black pepper','chili powder','cumin','garlic powder','honey','Italian seasoning','onion soup mix','parsley','red pepper flakes','salt','seasoning of choice','taco seasoning','thyme'],
    Snacks:       ['potato chips','tortilla chips','variety chips'],
    Condiments:   ['BBQ sauce','bleu cheese dressing','desired burger toppings','Dijon mustard','honey mustard dressing','ketchup','mayo','relish','tomato paste','yellow mustard'],
    Pantry:       ['alfredo sauce','apple cider vinegar','baked beans','beef broth','black beans','bread','canned corn','cereal','chicken broth','cooking spray','cornstarch','cream of mushroom/chicken soup','egg noodles','garlic','gravy','Kraft Mac & Cheese','Nutella','olive oil','pasta','pasta sauce','peanut butter','pizza sauce','potatoes','ramen','red cooking wine','rice','soy sauce','taco sauce','tomato sauce','vegetable broth','Worcestershire sauce','wraps'],
  };

  // The order aisles appear in on the shopping list (roughly how you walk a store).
  const CATEGORY_ORDER = ['Produce','Meat','Dairy','Refrigerated','Frozen','Pantry','Spices','Snacks','Condiments','Other'];

  // On a tie — an item's name fully matches two different list entries with the
  // same number of words — the category earlier in this list wins. (So "garlic
  // salt" counts as Spices, not Pantry.)
  const CATEGORY_TIE_PRIORITY = ['Frozen','Spices','Condiments','Snacks','Refrigerated','Meat','Dairy','Produce','Pantry'];

  // A light safety net for recipe wording that doesn't appear in the lists above
  // at all. You shouldn't need to touch this — the lists above are the real
  // control. Anything that matches nothing here lands in "Other".
  const CATEGORY_FALLBACK = {
    Frozen:     ['frozen','ice cream','sherbet','popsicle'],
    Spices:     ['pepper flakes','black pepper','ground pepper','seasoning','paprika','oregano','cinnamon','nutmeg','turmeric','bay leaf'],
    Condiments: ['mustard','ketchup','dressing','relish','mayo'],
    Snacks:     ['chips'],
    Pantry:     ['cream of','broth','stock','soup','sauce','cornstarch','peanut butter','egg noodle','vinegar','oil','flour','bean','pasta','noodle','rice','bread','cereal','tortilla','wrap'],
    Produce:    ['lettuce','onion','tomato','carrot','celery','spinach','mushroom','broccoli','zucchini','cabbage','pepper','corn','potato','apple','lemon','lime','garlic'],
    Meat:       ['chicken','beef','pork','turkey','sausage','bacon','steak','shrimp','fish','salmon','kielbasa','ham'],
    Dairy:      ['milk','cheese','butter','cream','yogurt','egg','parmesan','mozzarella','cheddar'],
  };

  // Words that carry no sorting meaning, stripped before matching.
  const CATEGORY_STOPWORDS = new Set(['of','the','a','and','with','in','to','for','fat','free','condensed','desired','choice']);

  function catSingular(w){
    if (w.length < 4) return w;
    if (/ies$/.test(w)) return w.slice(0,-3)+'y';
    if (/oes$/.test(w)) return w.slice(0,-2);
    if (/(s|x|z|ch|sh)es$/.test(w)) return w.slice(0,-2);
    if (/ss$/.test(w)) return w;
    if (/s$/.test(w)) return w.slice(0,-1);
    return w;
  }
  function catTokens(str){
    return [...new Set(
      String(str).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
        .map(catSingular).filter(t => t && !CATEGORY_STOPWORDS.has(t))
    )];
  }

  // Pre-tokenize the master list once
  const CATEGORY_MASTER = [];
  for (const [cat, items] of Object.entries(SHOPPING_CATEGORIES))
    for (const raw of items) CATEGORY_MASTER.push({ cat, toks: catTokens(raw) });

  function catTieRank(c){ const i = CATEGORY_TIE_PRIORITY.indexOf(c); return i < 0 ? 99 : i; }

  function categorize(name){
    const inSet = new Set(catTokens(name));
    let best = null;
    // An item matches a list entry when every word of that entry is present in
    // the item's name. The entry with the MOST matched words wins (so "garlic
    // powder" beats a bare "garlic"); ties break by CATEGORY_TIE_PRIORITY.
    for (const m of CATEGORY_MASTER){
      if (m.toks.length && m.toks.every(t => inSet.has(t))){
        if (!best
            || m.toks.length > best.toks.length
            || (m.toks.length === best.toks.length && catTieRank(m.cat) < catTieRank(best.cat))){
          best = m;
        }
      }
    }
    if (best) return best.cat;

    const n = name.toLowerCase();
    for (const c of ['Frozen','Spices','Condiments','Snacks','Pantry','Produce','Meat','Dairy']){
      if ((CATEGORY_FALLBACK[c] || []).some(w => n.includes(w))) return c;
    }
    return 'Other';
  }
  function norm(name){ return name.trim().toLowerCase().replace(/\s+/g,' '); }

  // "cups" and "cup" are the same unit; "onions" and "onion" are the same thing.
  // Without this the list ends up with three separate garlic lines.
  const UNIT_ALIASES = {
    cups:'cup', tablespoon:'tbsp', tablespoons:'tbsp', tbsps:'tbsp',
    teaspoon:'tsp', teaspoons:'tsp', tsps:'tsp',
    pound:'lb', pounds:'lb', lbs:'lb', ounce:'oz', ounces:'oz',
    grams:'g', gram:'g', kilograms:'kg', kilogram:'kg',
    liters:'l', litres:'l', liter:'l', litre:'l',
    milliliters:'ml', millilitres:'ml',
    cloves:'clove', cans:'can', sticks:'stick', bunches:'bunch', pinches:'pinch'
  };
  function canonUnit(u){
    const c = (u || '').trim().toLowerCase();
    return UNIT_ALIASES[c] || c;
  }
  function singular(word){
    if (word.length < 4) return word;
    if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
    if (/oes$/.test(word)) return word.slice(0, -2);          // tomatoes, potatoes
    if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
    if (/ss$/.test(word)) return word;
    if (/s$/.test(word)) return word.slice(0, -1);
    return word;
  }
  function mergeKey(name){
    return norm(name).split(' ').map(singular).join(' ');
  }
  function round2(n){ return Math.round(n * 100) / 100; }

  // Abbreviations never pluralize — "3 tbsp", not "3 tbsps"
  const PLURAL_UNITS = ['cup','clove','can','stick','bunch','pinch','slice','package','box','bag'];

  // Turns { cup: 3, tbsp: 2 } into "3 cups + 2 tbsp"
  function formatQty(units){
    const parts = Object.entries(units)
      .filter(([, qty]) => qty > 0)
      .map(([unit, qty]) => {
        const n = round2(qty);
        if (!unit) return String(n);
        const plural = n !== 1 && PLURAL_UNITS.includes(unit);
        return n + ' ' + (plural ? unit + 's' : unit);
      });
    if (!parts.length) return '';
    return parts.join(' + ');
  }

  function addToMap(map, name, qty, unit, source, extra){
    const u = canonUnit(unit);
    // "3 cloves garlic cloves" reads badly — drop the unit word off the name
    let display = String(name).trim();
    if (u){
      const words = display.split(' ');
      if (words.length > 1 && singular(words[words.length - 1].toLowerCase()) === u){
        display = words.slice(0, -1).join(' ');
      }
    }
    const key = mergeKey(display);
    if (!map[key]){
      map[key] = { name: display, units: {}, sources: new Set(), category: categorize(display), unlisted: false };
    }
    const entry = map[key];
    // Keep the shortest name — "onion" reads better than "onions, diced"
    if (display.length < entry.name.length) entry.name = display;
    const n = typeof qty === 'number' ? qty : parseFloat(qty);
    if (!isNaN(n) && n > 0){
      entry.units[u] = (entry.units[u] || 0) + n;
    } else {
      entry.unlisted = true;
    }
    entry.sources.add(source);
    if (extra) Object.assign(entry, extra);
    return entry;
  }

  /* Builds the list. Give it:
       recipes        the recipes being cooked this week
       pantryItems    every pantry item's name. An ingredient that's a pantry
                      item is left off — the Pantry sidebar flags it instead
       extras         things added by hand: [{ name, qty, unit }]
       pantryChecked  { item: true } for pantry items ticked "need to buy"
     Returns the aisles in store order, each with its items A–Z:
       [{ cat, items: [{ key, name, qty, sources }] }]
     key is what the ticked-off state is saved under; qty is words like
     "3 cups + 2 tbsp" ('' when no amount is known). */
  function build(opts){
    const pantryKeys = (opts.pantryItems || []).map(mergeKey);
    const map = {};

    // Everything this week's recipes call for, merged by ingredient
    (opts.recipes || []).forEach(r => (r.ingredients || []).forEach(ing => {
      if (pantryKeys.includes(mergeKey(ing.name))) return;
      addToMap(map, ing.name, ing.qty, ing.unit, r.name);
    }));

    // Anything added by hand merges into the same lines
    (opts.extras || []).forEach(ex => addToMap(map, ex.name, ex.qty, ex.unit, 'Added by you'));

    // Pantry items ticked as "need to buy"
    const pantryChecked = opts.pantryChecked || {};
    Object.keys(pantryChecked).filter(item => pantryChecked[item]).forEach(item => {
      addToMap(map, item, null, '', 'Pantry');
    });

    const grouped = {};
    Object.entries(map).forEach(([key, item]) => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push({ key, name: item.name, qty: formatQty(item.units), sources: Array.from(item.sources) });
    });
    const catRank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? CATEGORY_ORDER.length : i; };
    return Object.keys(grouped)
      .sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b))
      .map(cat => ({ cat, items: grouped[cat].sort((a, b) => a.name.localeCompare(b.name)) }));
  }

  /* The list for one week, straight from the saved meal state (the whole
     Firestore document). "week" is the date of its Sunday. Returns
     { aisles, checked }: aisles as build() gives them, checked as
     { key: true } for the lines already ticked off. Used by the week page. */
  function forWeek(mealState, week){
    const state = mealState || {};
    const all = state.recipes || [];
    const saved = (state.mealplan || {})[week] || {};
    const ids = [];
    // Dinners first, then lunches — only older weeks have a recipe picked for lunch.
    ['dinner', 'lunch'].forEach(meal => PPMeals.DAY_KEYS.forEach(k => {
      const v = PPMeals.normalizeDay(saved[k])[meal];
      if (PPMeals.isRecipeChoice(v)) ids.push(v);
    }));
    // The pantry is saved as groups ({ Basics: […], Fridge: […] }); long ago it was one flat list.
    const pantry = state.pantryItems;
    const pantryItems = Array.isArray(pantry) ? pantry
      : pantry && typeof pantry === 'object' ? [].concat(...Object.values(pantry).filter(Array.isArray))
      : [];
    return {
      aisles: build({
        recipes: ids.map(id => all.find(r => r.id === id)).filter(Boolean),
        pantryItems,
        extras: (state.shoppingExtras || {})[week],
        pantryChecked: (state.pantryChecked || {})[week]
      }),
      checked: (state.shoppingChecked || {})[week] || {}
    };
  }

  return { norm, mergeKey, categorize, formatQty, build, forWeek, CATEGORY_ORDER };
})();
