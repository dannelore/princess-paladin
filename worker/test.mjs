/* Exercises the worker's fetch handler directly, with the Anthropic SDK's
   HTTP layer pointed at a stand-in so no real API call is made. */
import http from 'node:http';
import worker from './src/index.js';

let lastRequest = null;
let reply = null;

const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    lastRequest = { url: req.url, headers: req.headers, body: JSON.parse(body || '{}') };
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});
await new Promise(r => api.listen(0, r));
const apiBase = `http://localhost:${api.address().port}`;

const ENV = { ANTHROPIC_API_KEY: 'test-key', PP_TOKEN: 'sekrit', ANTHROPIC_BASE_URL: apiBase };
process.env.ANTHROPIC_BASE_URL = apiBase;

const toolReply = (input) => ({
  status: 200,
  body: {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5',
    stop_reason: 'tool_use', stop_sequence: null,
    content: [{ type: 'tool_use', id: 'tu_1', name: 'file_todos', input }],
    usage: { input_tokens: 900, output_tokens: 120 }
  }
});

function post(body, headers = {}) {
  return worker.fetch(new Request('https://helper.example/', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json', 'Origin': 'https://princessandpaladin.com', 'X-PP-Token': 'sekrit' }, headers),
    body: JSON.stringify(body)
  }), ENV);
}

let failed = 0, ran = 0;
const eq = (label, got, want) => {
  ran++;
  if(JSON.stringify(got) === JSON.stringify(want)) return;
  failed++;
  console.log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
};

/* ---- the happy path ---- */
reply = toolReply({
  lines: ['Ring the florist back !high #wedding @fri', 'Pack the boxes *4 #etsy', '  bubble wrap'],
  skipped: [{ text: 'hoover the stairs', reason: 'already open as "Hoover the stairs"' }],
  notes: ['Two garden jobs here and no tag for them.']
});
let res = await post({
  text: 'ring florist back re flowers by friday\nhoover the stairs\npack the boxes - bubble wrap',
  today: '2026-09-22',
  tags: [{ id: 't-wedding', name: 'Wedding' }, { id: 't-etsy', name: 'Etsy' }],
  samples: [{ title: 'Hoover the stairs', difficulty: 2, tag: 'Chore' }],
  open: ['Hoover the stairs']
});
let data = await res.json();
eq('returns the lines', data.lines.length, 3);
eq('passes skipped through', data.skipped[0].reason, 'already open as "Hoover the stairs"');
eq('passes notes through', data.notes.length, 1);
eq('reports usage', data.usage, { input: 900, output: 120 });
eq('allows the site origin', res.headers.get('access-control-allow-origin'), 'https://princessandpaladin.com');

/* what actually went to the API */
eq('uses opus 5', lastRequest.body.model, 'claude-opus-5');
eq('forces the tool', lastRequest.body.tool_choice, { type: 'tool', name: 'file_todos' });
eq('sends the key as a header', lastRequest.headers['x-api-key'], 'test-key');
const sent = lastRequest.body.messages[0].content;
eq('context carries the tags', sent.includes('Wedding, Etsy'), true);
eq('context carries the calibration sample', sent.includes('Hoover the stairs — *2 #Chore'), true);
eq('the paste is fenced off', sent.includes('<paste>'), true);
eq('quest log internals are not sent', /completions|meowBucks|wardrobe|petTokens/.test(JSON.stringify(lastRequest.body)), false);

/* ---- refusals to answer ---- */
for (const [label, headers, body, status] of [
  ['no token', { 'X-PP-Token': '' }, { text: 'x' }, 401],
  ['wrong token', { 'X-PP-Token': 'nope' }, { text: 'x' }, 401],
  ['empty paste', {}, { text: '   ' }, 400],
  ['oversized paste', {}, { text: 'x'.repeat(9000) }, 413],
]) {
  const r = await post(body, headers);
  eq(label + ' is refused', r.status, status);
}
const foreign = await worker.fetch(new Request('https://helper.example/', {
  method: 'POST', headers: { 'Origin': 'https://evil.example', 'X-PP-Token': 'sekrit' }, body: '{}'
}), ENV);
eq('a foreign origin is refused', foreign.status, 403);
const preflight = await worker.fetch(new Request('https://helper.example/', { method: 'OPTIONS', headers: { Origin: 'https://princessandpaladin.com' } }), ENV);
eq('preflight is answered', preflight.status, 204);
eq('preflight names the token header', preflight.headers.get('access-control-allow-headers').includes('X-PP-Token'), true);

/* ---- the model misbehaving ---- */
reply = toolReply({ lines: 'not an array' });
eq('a bad shape is caught', (await post({ text: 'x' })).status, 502);

reply = { status: 200, body: { id:'m', type:'message', role:'assistant', model:'claude-opus-5', stop_reason:'refusal', stop_details:{type:'refusal',category:'other'}, content: [], usage:{input_tokens:5,output_tokens:0} } };
eq('a refusal is reported', (await post({ text: 'x' })).status, 422);

reply = { status: 429, body: { type:'error', error:{ type:'rate_limit_error', message:'slow down' } } };
eq('a rate limit is passed on', (await post({ text: 'x' })).status, 429);

reply = { status: 401, body: { type:'error', error:{ type:'authentication_error', message:'bad key' } } };
const keyFail = await post({ text: 'x' });
eq('a bad API key is reported as the helper failing', keyFail.status, 502);
eq('and does not leak the reason', (await keyFail.json()).error.includes('rejected'), true);

api.close();
console.log(failed ? `\n${failed} of ${ran} failed` : `all ${ran} passed`);
process.exit(failed ? 1 : 0);
