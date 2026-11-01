// Tests online saves against a running copy of the Worker.
// Start it with `npm run dev`, then: node tools/test-sync.js [base url]
// Uses throwaway nicknames, so it is safe to run again; don't point it at the
// family's live copy unless you're fine with a few "test-..." players there.
const assert = require('assert');

const BASE = (process.argv[2] || 'http://localhost:8787').replace(/\/$/, '');
const RUN = 'test-' + Date.now().toString(36);
const nick = (n) => `${RUN}-${n}`.slice(0, 30);

async function post(body) {
  const res = await fetch(BASE + '/api/progress', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  return res.json();
}
async function get(n) {
  return (await (await fetch(`${BASE}/api/progress?nick=${encodeURIComponent(n)}`)).json()).data;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('the game itself is served', async () => {
  const res = await fetch(BASE + '/');
  assert.strictEqual(res.status, 200);
  assert((await res.text()).includes('Nonocat'));
});

test('new player is stored and reported as new', async () => {
  const r = await post({ nick: nick('a'), data: { done: { 'e:1': { t: 30, m: 0, at: 1 } }, saves: {}, endlessMax: 1 } });
  assert(r.ok && !r.existed, JSON.stringify(r));
  assert.deepStrictEqual((await get(nick('a'))).done['e:1'], { t: 30, m: 0, at: 1 });
});

test('nickname ignores case and spaces; a second phone merges instead of overwriting', async () => {
  const r = await post({ nick: '  ' + nick('A').toUpperCase() + ' ', data: { done: { 'e:2': { t: 50, m: 1, at: 2 }, 'e:1': { t: 20, m: 2, at: 3 } }, saves: {}, endlessMax: 2 } });
  assert(r.existed);
  assert.deepStrictEqual(Object.keys(r.data.done).sort(), ['e:1', 'e:2']);
  assert.deepStrictEqual(r.data.done['e:1'], { t: 20, m: 0, at: 3 }, 'keeps best time and fewest mistakes');
  assert.strictEqual(r.data.endlessMax, 2);
});

test('players are kept apart', async () => {
  await post({ nick: nick('b'), data: { done: { 'c:heart': { t: 9, m: 0, at: 1 } } } });
  assert.deepStrictEqual(Object.keys((await get(nick('b'))).done), ['c:heart']);
  assert(!(await get(nick('a'))).done['c:heart']);
  assert.strictEqual(await get(nick('nobody')), null);
});

test('newer unfinished game wins; solved games drop their old save', async () => {
  await post({ nick: nick('a'), data: { saves: { 'e:3': { s: '10', at: 100 }, 'e:4': { s: '01', at: 100 } } } });
  const r = await post({ nick: nick('a'), data: { done: { 'e:3': { t: 5, m: 0, at: 200 } }, saves: { 'e:4': { s: '11', at: 300 } } } });
  assert(!r.data.saves['e:3']);
  assert.strictEqual(r.data.saves['e:4'].s, '11');
  const older = await post({ nick: nick('a'), data: { saves: { 'e:4': { s: '00', at: 50 } } } });
  assert.strictEqual(older.data.saves['e:4'].s, '11', 'an older copy cannot overwrite a newer one');
});

test('reset replaces the online copy', async () => {
  const r = await post({ nick: nick('a'), reset: true, data: { done: {}, saves: {}, endlessMax: 0 } });
  assert.deepStrictEqual(r.data, { done: {}, saves: {}, endlessMax: 0 });
  assert.deepStrictEqual((await get(nick('a'))).done, {});
});

test('big progress (5,000 solved levels) is stored and read back', async () => {
  const done = {};
  for (let n = 1; n <= 5000; n++) done['e:' + n] = { t: n % 400, m: n % 3, at: 1700000000000 + n };
  const r = await post({ nick: nick('big'), data: { done, saves: {}, endlessMax: 5000 } });
  assert(r.ok, r.error);
  assert.strictEqual(Object.keys((await get(nick('big'))).done).length, 5000);
});

test('ten phones saving at the same moment all get kept', async () => {
  await Promise.all(Array.from({ length: 10 }, (_, k) =>
    post({ nick: nick('race'), data: { done: { ['e:' + (k + 1)]: { t: k, m: 0, at: k } } } })));
  assert.strictEqual(Object.keys((await get(nick('race'))).done).length, 10);
});

test('bad requests get an error, not a crash', async () => {
  assert.strictEqual((await post({ nick: '', data: {} })).ok, false);
  const res = await fetch(BASE + '/api/progress', { method: 'POST', body: 'not json' });
  assert.strictEqual((await res.json()).ok, false);
  assert.strictEqual((await fetch(BASE + '/api/progress', { method: 'DELETE' })).status, 405);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok    ' + name); } catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
  }
  console.log(failed ? `\n${failed} failed` : `\nAll ${tests.length} save tests passed against ${BASE}`);
  process.exitCode = failed ? 1 : 0;
})();
