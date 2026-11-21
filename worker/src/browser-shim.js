/* Workers (and Node, in the tests) have no `window`. The site's browser
   scripts expect one, so point it at the global object. See meals.js. */
if(typeof globalThis.window === 'undefined') globalThis.window = globalThis;
