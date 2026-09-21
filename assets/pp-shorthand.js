/* ==========================================================================
   Princess & Paladin — to-do shorthand
   /assets/pp-shorthand.js

   One line of text, optionally carrying everything the long add form asks
   for as tokens:

     !urgent !high !med !low     priority
     *1 … *5, or *easy *hard     difficulty
     #home                       an existing tag, matched on its name
     @today @fri @3d @2w
     @sep25 @2026-12-01 @25      due date

   A token is only taken out of the title when it is understood, so an
   unrecognised #hashtag or @handle stays in the text rather than being
   silently swallowed.

   This file is the single definition of that grammar, because it has two
   consumers that must never drift apart: the quick-add panel on the quest
   board, and tools/quest-add.js, which files pasted lists from a Claude
   session. It therefore has to run both as a browser global and as a Node
   module, and must not reach for the DOM, Firebase or PQ — the caller hands
   it today's date and the tag list instead.
   ========================================================================== */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.PPShorthand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){

  const PRIORITY = {
    low:'low', l:'low', med:'medium', medium:'medium', m:'medium',
    high:'high', h:'high', urgent:'urgent', u:'urgent', now:'urgent'
  };
  const DIFFICULTY = { trivial:1, easy:2, medium:3, med:3, hard:4, gruelling:5, grueling:5 };
  const DOW = { sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, thurs:4, fri:5, sat:6 };
  const MONTH = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };

  /* Kept in step with the same helpers in pp-quest.js: a date key is local
     time, never UTC, or a to-do typed at 11pm lands on the wrong day. */
  function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function dateKey(d){
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  }

  function context(ctx){
    ctx = ctx || {};
    return {
      today: startOfDay(ctx.today ? new Date(ctx.today) : new Date()),
      tags: Array.isArray(ctx.tags) ? ctx.tags : []
    };
  }

  /* A month/day with no year means the next one that hasn't happened yet. */
  function monthDay(today, month, day){
    if(!(day >= 1 && day <= 31)) return null;
    let d = new Date(today.getFullYear(), month, day);
    if(dateKey(d) < dateKey(today)) d = new Date(today.getFullYear() + 1, month, day);
    return dateKey(d);
  }

  function due(word, today){
    const w = String(word).toLowerCase();
    if(w === 'today' || w === 'tod') return dateKey(today);
    if(w === 'tomorrow' || w === 'tom' || w === 'tmr') return dateKey(addDays(today, 1));
    if(DOW[w] !== undefined){
      const ahead = (DOW[w] - today.getDay() + 7) % 7;
      return dateKey(addDays(today, ahead || 7));
    }
    if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(w)){
      const [y, m, d] = w.split('-').map(Number);
      return dateKey(new Date(y, m - 1, d));
    }
    let m = w.match(/^(\d{1,3})([dw])$/);
    if(m) return dateKey(addDays(today, parseInt(m[1]) * (m[2] === 'w' ? 7 : 1)));
    m = w.match(/^([a-z]{3,4})-?(\d{1,2})$/);
    if(m && MONTH[m[1]] !== undefined) return monthDay(today, MONTH[m[1]], parseInt(m[2]));
    m = w.match(/^(\d{1,2})-?([a-z]{3,4})$/);
    if(m && MONTH[m[2]] !== undefined) return monthDay(today, MONTH[m[2]], parseInt(m[1]));
    if(/^\d{1,2}$/.test(w)){
      const day = parseInt(w);
      if(!(day >= 1 && day <= 31)) return null;
      let d = new Date(today.getFullYear(), today.getMonth(), day);
      if(dateKey(d) < dateKey(today)) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
      return dateKey(d);
    }
    return null;
  }

  function difficulty(word){
    const w = String(word).toLowerCase();
    if(/^[1-5]$/.test(w)) return parseInt(w);
    return DIFFICULTY[w] || null;
  }

  /* Tags are matched on the name you'd say out loud: exact first, then
     ignoring spaces (#deepclean → Deep Clean), then as a prefix
     (#wed → Wedding). */
  function tag(word, tags){
    const w = String(word).toLowerCase().replace(/[-_]/g, ' ');
    const flat = w.replace(/\s+/g, '');
    return tags.find(t => String(t.name).toLowerCase() === w)
        || tags.find(t => String(t.name).toLowerCase().replace(/\s+/g, '') === flat)
        || tags.find(t => String(t.name).toLowerCase().startsWith(w))
        || null;
  }

  function parse(line, ctx){
    const c = context(ctx);
    const meta = { title:'', priority:null, difficulty:null, tag:null, due:null };
    const kept = [];
    String(line).trim().split(/\s+/).forEach(word => {
      const body = word.slice(1);
      if(body){
        if(word[0] === '!' && PRIORITY[body.toLowerCase()]){ meta.priority = PRIORITY[body.toLowerCase()]; return; }
        if(word[0] === '*'){ const d = difficulty(body); if(d){ meta.difficulty = d; return; } }
        if(word[0] === '#'){ const t = tag(body, c.tags); if(t){ meta.tag = t.id; return; } }
        if(word[0] === '@'){ const d = due(body, c.today); if(d){ meta.due = d; return; } }
      }
      kept.push(word);
    });
    meta.title = kept.join(' ').trim();
    return meta;
  }

  /* An indented or dashed line hangs off the one above as a subtask. The
     bullet is only stripped when a space follows it — otherwise
     "*3 write vows" would lose its difficulty. */
  function parseLines(text, ctx, makeId){
    const c = context(ctx);
    const id = makeId || (() => 'x' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4));
    const out = [];
    String(text).split('\n').forEach(line => {
      if(!line.trim()) return;
      const isSub = /^(\s{2,}|\t|\s*[-•*]\s)/.test(line);
      const meta = parse(line.replace(/^[ \t]*(?:[-•*][ \t]+)?/, ''), c);
      if(!meta.title) return;
      if(isSub && out.length) out[out.length - 1].subs.push({ id: id(), title: meta.title });
      else out.push({ meta, subs: [] });
    });
    return out;
  }

  return { parse, parseLines, due, difficulty, tag, dateKey, addDays, startOfDay, PRIORITY, DIFFICULTY };
});
