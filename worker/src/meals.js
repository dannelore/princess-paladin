/* The meal plan's own logic, borrowed from the site rather than copied.

   /assets/pp-meals.js is what the Meal Planner and the home page use to work
   out each day's lunch and dinner — including which dinner's leftovers feed
   which lunch, which is fiddly enough that a second copy would drift. It is
   a browser script that hangs itself off `window`, so the shim points
   `window` at the global first. Imports run in the order they're written,
   so the shim always goes before it. */
import './browser-shim.js';
import '../../assets/pp-meals.js';

export const PPMeals = globalThis.PPMeals;
