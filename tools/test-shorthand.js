#!/usr/bin/env node
/* Tests for the to-do shorthand in /assets/pp-shorthand.js.

   The grammar has two consumers that can't be allowed to drift — the
   quick-add panel on the quest board and tools/quest-add.js — so it gets a
   test of its own. No dependencies: `node tools/test-shorthand.js`.

   Dates are checked against a fixed "today" (Monday 21 September 2026)
   rather than the real one, so a test run on a Thursday means the same
   thing as a test run on a Sunday. */

const path = require('path');
const S = require(path.join(__dirname, '..', 'assets', 'pp-shorthand.js'));

const TODAY = new Date(2026, 8, 21);           // Mon 21 Sep 2026
const TAGS = [
  { id:'t-work', name:'Work', color:'#6E2430' },
  { id:'t-home', name:'Home', color:'#8FA37E' },
  { id:'t-wedding', name:'Wedding', color:'#E87CA6' },
  { id:'t-deep', name:'Deep Clean', color:'#123456' }
];
const CTX = { today: TODAY, tags: TAGS };
const plus = n => S.dateKey(S.addDays(TODAY, n));

let failed = 0, ran = 0;
function eq(label, got, want){
  ran++;
  if(JSON.stringify(got) === JSON.stringify(want)) return;
  failed++;
  console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
}
const parse = line => S.parse(line, CTX);

/* ---- titles ---- */
eq('a plain line is just a title', parse('buy milk'), { title:'buy milk', priority:null, difficulty:null, tag:null, due:null });
eq('surrounding whitespace goes', parse('   buy milk  ').title, 'buy milk');

/* ---- priority ---- */
eq('priority word', parse('call venue !urgent').priority, 'urgent');
eq('priority letter', parse('!h call venue').priority, 'high');
eq('unknown priority stays in the title', parse('shout !loudly').title, 'shout !loudly');

/* ---- difficulty ---- */
eq('difficulty as a number', parse('*3 write vows').difficulty, 3);
eq('difficulty by name', parse('write vows *gruelling').difficulty, 5);
eq('difficulty out of range stays', parse('do 100 *9 reps').title, 'do 100 *9 reps');

/* ---- tags ---- */
eq('tag by exact name', parse('hoover #home').tag, 't-home');
eq('tag by prefix', parse('#wed pick flowers').tag, 't-wedding');
eq('tag ignoring spaces', parse('#deepclean the oven').tag, 't-deep');
eq('tag with a hyphen', parse('#deep-clean the oven').tag, 't-deep');
eq('unknown tag is left in the text', parse('ship #etsy order').title, 'ship #etsy order');

/* ---- due dates ---- */
eq('today', parse('bins @today').due, plus(0));
eq('tomorrow', parse('bins @tomorrow').due, plus(1));
eq('n days', parse('bins @3d').due, plus(3));
eq('n weeks', parse('bins @2w').due, plus(14));
eq('iso date', parse('bins @2026-12-01').due, '2026-12-01');
eq('month and day', parse('bins @sep25').due, '2026-09-25');
eq('day and month', parse('bins @25-sep').due, '2026-09-25');
eq('a month already past rolls to next year', parse('taxes @jan10').due, '2027-01-10');
eq('day of this month', parse('rent @25').due, '2026-09-25');
eq('a day already past rolls to next month', parse('rent @5').due, '2026-10-05');
eq('a weekday is never today', parse('gym @mon').due, plus(7));
eq('the next friday', parse('gym @fri').due, plus(4));
eq('an @handle is not a date', parse('email @bob about it').title, 'email @bob about it');

/* ---- everything at once ---- */
const all = parse('*4 cake tasting !high #wedding @fri');
eq('all four tokens', [all.title, all.difficulty, all.priority, all.tag, all.due],
   ['cake tasting', 4, 'high', 't-wedding', plus(4)]);

/* ---- lines and subtasks ---- */
let n = 0;
const ids = () => 'id' + (++n);
const lines = S.parseLines('*2 pack boxes !high\n  - bubble wrap\n  tape\nbook the van @fri', CTX, ids);
eq('two top-level to-dos', lines.length, 2);
eq('the first keeps its title', lines[0].meta.title, 'pack boxes');
eq('and its difficulty', lines[0].meta.difficulty, 2);
eq('indented and dashed lines become subtasks', lines[0].subs.map(s => s.title), ['bubble wrap', 'tape']);
eq('subtasks get ids', lines[0].subs.every(s => !!s.id), true);
eq('the second is its own to-do', lines[1].meta.due, plus(4));
eq('blank lines are ignored', S.parseLines('a\n\n\nb', CTX, ids).length, 2);
eq('a line of nothing but tokens is dropped', S.parseLines('#home\n', CTX, ids).length, 0);
eq('a bullet with a space is a bullet', S.parseLines('* milk', CTX, ids).length, 1);
eq('a star with no space is a difficulty', S.parseLines('*3 milk', CTX, ids)[0].meta.difficulty, 3);
eq('a subtask cannot come first', S.parseLines('  - orphan', CTX, ids)[0].meta.title, 'orphan');

/* ---- context ---- */
eq('no tags means no tag match', S.parse('x #home', { today: TODAY, tags: [] }).title, 'x #home');
eq('a missing context still parses', typeof S.parse('just a title').title, 'string');

console.log(failed ? `\n${failed} of ${ran} failed` : `all ${ran} passed`);
process.exit(failed ? 1 : 0);
