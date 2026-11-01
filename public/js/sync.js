// Optional online saves. Each player's progress is stored under their nickname
// and merged with the copy on the device, so nothing is lost when playing on
// two phones or reinstalling. Works without a connection; it catches up later.
(function (root) {
  'use strict';

  // Also used by the Cloudflare Worker (worker/index.js), so server and game merge the same way.
  // Combines two copies of a player's progress without losing anything: puzzles
  // solved on either side, best times, and the newer copy of each unfinished game.
  function mergeProgress(a, b) {
    a = a || {};
    b = b || {};
    const best = (x, y) => (typeof x !== 'number' ? y : typeof y !== 'number' ? x : Math.min(x, y));
    const latest = (x, y) => Math.max(x || 0, y || 0);
    const out = { done: {}, saves: {}, endlessMax: latest(a.endlessMax, b.endlessMax) };
    [a.done, b.done].forEach((done) => {
      Object.keys(done || {}).forEach((id) => {
        const d = done[id] || {}, prev = out.done[id];
        out.done[id] = prev
          ? { t: best(prev.t, d.t), m: best(prev.m, d.m), at: latest(prev.at, d.at) }
          : { t: d.t, m: d.m, at: d.at || 0 };
      });
    });
    [a.saves, b.saves].forEach((saves) => {
      Object.keys(saves || {}).forEach((id) => {
        const s = saves[id];
        if (s && (!out.saves[id] || (s.at || 0) > (out.saves[id].at || 0))) out.saves[id] = s;
      });
    });
    // Drop unfinished games that were completed later, and keep the 25 newest.
    Object.keys(out.saves).forEach((id) => {
      const d = out.done[id];
      if (d && (out.saves[id].at || 0) <= (d.at || 0)) delete out.saves[id];
    });
    Object.keys(out.saves)
      .sort((x, y) => (out.saves[y].at || 0) - (out.saves[x].at || 0))
      .slice(25)
      .forEach((id) => delete out.saves[id]);
    return out;
  }

  const url = () => String((root.NONOCAT_CONFIG && root.NONOCAT_CONFIG.syncUrl) || '').trim();

  // Sends local progress and gets back the merged copy. With reset, the online
  // copy is replaced instead of merged.
  async function exchange(nick, data, reset) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 20000);
    try {
      // text/plain keeps this a "simple" request, which Google Apps Script accepts cross-site.
      const res = await fetch(url(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ nick, data, reset: !!reset }),
        signal: ctrl ? ctrl.signal : undefined,
      });
      // No save service at this address (e.g. a plain local server): not an error.
      if (res.status === 404) throw Object.assign(new Error('no save service here'), { missing: true });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'sync failed');
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // Fire-and-forget upload for when the app is being closed.
  function beacon(nick, data) {
    if (!url() || !navigator.sendBeacon) return;
    try {
      navigator.sendBeacon(url(), new Blob([JSON.stringify({ nick, data })], { type: 'text/plain' }));
    } catch (e) { /* best effort */ }
  }

  root.Sync = { mergeProgress, exchange, beacon, enabled: () => !!url() };
})(globalThis);
