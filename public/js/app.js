(function () {
  'use strict';

  const { Solver, Generator, Pictures, Rng } = globalThis;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // Cell states while playing
  const EMPTY = 0, FILL = 1, CROSS = 2;

  // ---------------------------------------------------------------- icons
  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
    image: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 16l4.5-4.5 4 4 2.5-2.5L20 18"/><circle cx="15.5" cy="8.5" r="1.5"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    restart: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
    zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8v6M8 11h6"/>',
    unzoom: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8 11h6"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="currentColor" stroke="none"/>',
    user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  };
  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  }
  function paintIcons(root = document) {
    for (const el of $$('[data-icon]', root)) el.innerHTML = icon(el.dataset.icon);
  }

  // ---------------------------------------------------------------- storage
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* blocked */ }
    },
  };
  const SETTINGS_KEY = 'nonocat.settings', PROGRESS_KEY = 'nonocat.progress';
  const PLAYER_KEY = 'nonocat.player', PLAYERS_KEY = 'nonocat.players';
  const settings = Object.assign(
    { check: true, autoCross: true, sound: true, vibrate: true, theme: 'auto', tool: FILL, quickSize: '10x10' },
    store.get(SETTINGS_KEY, {}));
  // Each player (nickname) has their own progress on the device:
  // done: id -> { t: best seconds, m: fewest mistakes + hints, at: when solved }
  // saves: id -> in-progress game
  let player = store.get(PLAYER_KEY, null);
  const progressKey = () => PROGRESS_KEY + ':' + player.name.toLowerCase();
  const emptyProgress = () => ({ done: {}, saves: {}, endlessMax: 0 });
  let progress = player ? Sync.mergeProgress(store.get(progressKey(), {}), null) : emptyProgress();
  const saveSettings = () => store.set(SETTINGS_KEY, settings);
  const saveProgress = () => { if (player) store.set(progressKey(), progress); };

  // ---------------------------------------------------------------- puzzles
  function endlessSize(n) {
    if (n <= 5) return [5, 5];
    if (n <= 12) return [8, 8];
    if (n <= 20) return [10, 10];
    // After that: mostly 10x10, now and then something smaller or bigger, never above 15x15.
    const r = Rng.make('size:' + n);
    return r.pick([[8, 8], [8, 10], [10, 10], [10, 10], [10, 10], [10, 10], [10, 12], [12, 12], [10, 15], [15, 15]]);
  }

  // Small on Monday, biggest (15x15) on Sunday, 10x10 on most days.
  function dailySize(date) {
    const dow = new Date(date + 'T12:00:00').getDay();
    return [[15, 15], [8, 8], [10, 10], [10, 10], [10, 12], [12, 12], [10, 10]][dow];
  }

  function dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const today = () => dateStr(new Date());
  function prettyDate(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function seedFor(id) {
    const [kind, a, b] = id.split(':');
    if (kind === 'e') return 'endless:' + a;
    if (kind === 'd') return 'daily:' + a;
    if (kind === 'q') return 'quick:' + b;
    return id;
  }

  const cache = new Map();
  function puzzleFor(id) {
    if (cache.has(id)) return cache.get(id);
    const [kind, a, b] = id.split(':');
    let p;
    if (kind === 'c') {
      const pic = Pictures.PICTURES.find((x) => x.id === a);
      const sameTier = Pictures.PICTURES.filter((x) => x.tier === pic.tier);
      const tier = TIERS.find((t) => t[0] === pic.tier)[1];
      p = Object.assign(Pictures.fromPicture(pic), { title: `${tier} n. ${sameTier.indexOf(pic) + 1}`, reveal: pic.name });
    } else if (kind === 'e') {
      const [w, h] = endlessSize(+a);
      p = Object.assign(Generator.generate(w, h, seedFor(id)), { title: 'Livello ' + a, n: +a });
    } else if (kind === 'd') {
      const [w, h] = dailySize(a);
      p = Object.assign(Generator.generate(w, h, seedFor(id)), { title: 'Puzzle del ' + new Date(a + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) });
    } else {
      const [w, h] = a.split('x').map(Number);
      p = Object.assign(Generator.generate(w, h, seedFor(id)), { title: 'Partita veloce' });
    }
    p.id = id;
    p.kind = kind;
    Object.assign(p, Solver.clues(p.sol, p.w, p.h));
    cache.set(id, p);
    if (cache.size > 30) cache.delete(cache.keys().next().value);
    return p;
  }

  function drawPicture(canvas, w, h, sol, colors) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < w * h; i++) {
      if (!sol[i]) continue;
      ctx.fillStyle = colors[i] || '#555';
      ctx.fillRect(i % w, (i / w) | 0, 1, 1);
    }
  }

  // Draws a solved level onto a square canvas, letterboxed.
  function drawThumb(canvas, w, h, sol, colors) {
    const n = Math.max(w, h), ox = (n - w) >> 1, oy = (n - h) >> 1;
    const s2 = new Uint8Array(n * n), c2 = new Array(n * n).fill(null);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) { s2[(y + oy) * n + x + ox] = sol[y * w + x]; c2[(y + oy) * n + x + ox] = colors[y * w + x]; }
    }
    drawPicture(canvas, n, n, s2, c2);
  }

  // Solved levels are regenerated from their number (about a millisecond each) to draw thumbnails.
  function thumbFor(id) {
    if (!progress.done[id]) return null;
    try { return puzzleFor(id); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- feedback
  let actx = null;
  function tone(freq, dur, type = 'triangle', vol = 0.05, when = 0) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime + when;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    fill: (k = 0) => tone(500 + Math.min(k, 20) * 18, 0.05),
    cross: () => tone(300, 0.04, 'sine', 0.04),
    clear: () => tone(240, 0.04, 'sine', 0.03),
    error: () => { tone(160, 0.22, 'sawtooth', 0.05); tone(120, 0.25, 'sawtooth', 0.04, 0.08); },
    line: () => { tone(784, 0.08, 'sine', 0.04); tone(1047, 0.12, 'sine', 0.04, 0.07); },
    hint: () => { tone(660, 0.08, 'sine', 0.04); tone(990, 0.1, 'sine', 0.04, 0.08); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.06, i * 0.09)),
  };
  function buzz(ms) {
    if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function dialog(title, text, buttons) {
    const m = $('#modal');
    $('#modal-title').textContent = title;
    $('#modal-text').textContent = text;
    const actions = $('#modal-actions');
    actions.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'small-btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.onclick = () => { m.hidden = true; if (b.action) b.action(); };
      actions.append(btn);
    }
    m.hidden = false;
  }

  // ---------------------------------------------------------------- navigation
  let current = null;
  const renderers = {};
  function show(name, mode = 'push') {
    if (current === 'game' && name !== 'game') leaveGame();
    for (const s of $$('.screen')) s.classList.toggle('active', s.id === 'screen-' + name);
    if (mode === 'push') history.pushState({ screen: name }, '');
    else if (mode === 'replace') history.replaceState({ screen: name }, '');
    current = name;
    if (renderers[name]) renderers[name]();
  }
  function back() {
    if (history.state && history.state.screen !== 'home') history.back();
    else show('home', 'replace');
  }
  window.addEventListener('popstate', (e) => {
    $('#modal').hidden = true;
    show((e.state && e.state.screen) || 'home', 'none');
  });

  // ---------------------------------------------------------------- home
  function endlessContinue() {
    for (let n = 1; n <= progress.endlessMax + 1; n++) if (!progress.done['e:' + n]) return n;
    return progress.endlessMax + 1;
  }

  function dailyStreak() {
    const d = new Date();
    if (!progress.done['d:' + dateStr(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (progress.done['d:' + dateStr(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  renderers.home = () => {
    const n = endlessContinue();
    $('#home-continue').textContent = progress.saves['e:' + n] ? `Riprendi il livello ${n}` : `Livello ${n}`;
    const [w, h] = dailySize(today());
    const doneToday = !!progress.done['d:' + today()];
    const streak = dailyStreak();
    $('#home-daily').textContent = doneToday ? `Risolto oggi · ${w}×${h}` : `${prettyDate(today())} · ${w}×${h}`;
    $('#home-daily-badge').textContent = streak > 1 ? `${streak} giorni di fila` : doneToday ? '✓' : '';
    const pics = Pictures.PICTURES.filter((p) => progress.done['c:' + p.id]).length;
    $('#home-pictures').textContent = `${pics} su ${Pictures.PICTURES.length} scoperti`;
    const solved = Object.keys(progress.done).filter((k) => k.startsWith('e:')).length;
    $('#home-player').textContent = player ? player.name : '';
    $('#home-levels').textContent = solved ? `${solved} risolti · infiniti` : 'infiniti, creati al momento';
  };

  function drawLogo() {
    const pic = Pictures.PICTURES.find((p) => p.id === 'cat');
    const p = Pictures.fromPicture(pic);
    drawThumb($('#logo'), p.w, p.h, p.sol, p.colors);
  }

  // ---------------------------------------------------------------- pictures
  const TIERS = [['easy', 'Facile'], ['medium', 'Medio'], ['hard', 'Difficile']];
  renderers.pictures = () => {
    const list = $('#pictures-list');
    list.innerHTML = '';
    let solvedAll = 0;
    for (const [tier, label] of TIERS) {
      const pics = Pictures.PICTURES.filter((p) => p.tier === tier);
      const solved = pics.filter((p) => progress.done['c:' + p.id]).length;
      solvedAll += solved;
      const title = document.createElement('div');
      title.className = 'section-title';
      title.innerHTML = `<span>${label}</span><span>${solved}/${pics.length}</span>`;
      const grid = document.createElement('div');
      grid.className = 'tiles';
      for (const pic of pics) grid.append(pictureTile(pic));
      list.append(title, grid);
    }
    $('#pictures-count').textContent = `${solvedAll}/${Pictures.PICTURES.length}`;
  };

  function pictureTile(pic) {
    const id = 'c:' + pic.id;
    const tile = document.createElement('button');
    tile.className = 'tile';
    const p = Pictures.fromPicture(pic);
    if (progress.done[id]) {
      tile.classList.add('solved');
      const c = document.createElement('canvas');
      drawThumb(c, p.w, p.h, p.sol, p.colors);
      tile.append(c);
    } else {
      const m = document.createElement('div');
      m.className = 'tile-mystery';
      m.textContent = `${p.w}×${p.h}`;
      tile.append(m);
    }
    const name = document.createElement('div');
    name.className = 'tile-name';
    name.textContent = progress.done[id] ? pic.name : '? ? ?';
    tile.append(name);
    if (progress.saves[id]) tile.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
    tile.onclick = () => startGame(id);
    return tile;
  }

  // ---------------------------------------------------------------- level map
  const PAGE = 30;
  let levelsPage = -1;
  renderers.levels = () => {
    const cont = endlessContinue();
    if (levelsPage < 0) levelsPage = Math.floor((cont - 1) / PAGE);
    const unlockedTo = progress.endlessMax + 3;
    const start = levelsPage * PAGE + 1;
    $('#levels-range').textContent = `${start} – ${start + PAGE - 1}`;
    $('#levels-prev').disabled = levelsPage === 0;
    $('#levels-next').disabled = start + PAGE > unlockedTo;
    const solved = Object.keys(progress.done).filter((k) => k.startsWith('e:')).length;
    $('#levels-count').textContent = `${solved} risolti`;
    const grid = $('#levels-grid');
    grid.innerHTML = '';
    for (let n = start; n < start + PAGE; n++) {
      const id = 'e:' + n;
      const tile = document.createElement('button');
      tile.className = 'tile level-tile';
      const th = thumbFor(id);
      if (th) {
        tile.classList.add('solved');
        const c = document.createElement('canvas');
        drawThumb(c, th.w, th.h, th.sol, th.colors);
        tile.append(c);
      } else if (n <= unlockedTo) {
        tile.textContent = n;
        if (n === cont) tile.classList.add('current');
        if (progress.saves[id]) tile.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
      } else {
        tile.classList.add('locked');
        tile.innerHTML = icon('lock');
        tile.disabled = true;
      }
      if (n <= unlockedTo) tile.onclick = () => startGame(id);
      grid.append(tile);
    }
  };

  // ---------------------------------------------------------------- quick play
  const QUICK_SIZES = [[5, 5, 'mini'], [8, 8, 'piccolo'], [10, 10, 'classico'], [10, 12, 'alto'], [12, 12, 'medio'],
    [15, 15, 'grande']];
  renderers.quick = () => {
    const grid = $('#quick-sizes');
    if (grid.childElementCount) return;
    for (const [w, h, label] of QUICK_SIZES) {
      const b = document.createElement('button');
      b.className = 'size-btn';
      b.innerHTML = `<b>${w}×${h}</b><small>${label}</small>`;
      b.onclick = () => startGame(`q:${w}x${h}:${Date.now().toString(36)}`);
      grid.append(b);
    }
  };

  // ---------------------------------------------------------------- settings
  function applyTheme() {
    if (settings.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', settings.theme);
    const dark = settings.theme === 'dark' ||
      (settings.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const m of $$('meta[name="theme-color"]')) m.content = dark ? '#1d1a24' : '#fff6ec';
  }

  renderers.settings = () => {
    for (const input of $$('[data-setting]')) input.checked = !!settings[input.dataset.setting];
    for (const b of $$('[data-theme-opt]')) b.classList.toggle('on', b.dataset.themeOpt === settings.theme);
    $('#settings-player').textContent = player ? 'Giocatore: ' + player.name : 'Giocatore';
    renderSyncState();
    const sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    $('#offline-status').textContent = sw
      ? 'Il gioco è salvato sul dispositivo e funziona anche senza connessione.'
      : location.protocol === 'file:'
        ? 'Avviato da un file locale: funziona anche senza connessione.'
        : 'La copia offline si sta ancora scaricando. Riapri il gioco una volta con la connessione per completarla.';
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((yes) => {
        if (yes) $('#offline-status').textContent += ' I dati sono protetti dalla pulizia automatica.';
      }).catch(() => { /* unsupported */ });
    }
  };

  function bindSettings() {
    for (const input of $$('[data-setting]')) {
      input.addEventListener('change', () => {
        settings[input.dataset.setting] = input.checked;
        saveSettings();
        if (input.dataset.setting === 'check') toast('Vale per i puzzle che inizi da adesso');
      });
    }
    for (const b of $$('[data-theme-opt]')) {
      b.addEventListener('click', () => {
        settings.theme = b.dataset.themeOpt;
        saveSettings();
        applyTheme();
        renderers.settings();
      });
    }
    $('#reset-progress').onclick = () => dialog('Azzerare i progressi?',
      `Tutti i puzzle risolti e le partite in corso di ${player.name} verranno cancellati, anche online.`, [
        { label: 'Annulla' },
        { label: 'Azzera', danger: true, action: () => {
          progress = emptyProgress();
          saveProgress();
          levelsPage = -1;
          syncNow(true);
          toast('Progressi azzerati');
        } },
      ]);
  }

  // ---------------------------------------------------------------- players
  renderers.player = () => {
    $('#player-back').hidden = !player;
    $('#player-name').value = '';
    const names = store.get(PLAYERS_KEY, []);
    const list = $('#player-list');
    list.innerHTML = '';
    $('#player-list-title').hidden = !names.length;
    for (const name of names) {
      const b = document.createElement('button');
      b.className = 'player-row' + (player && player.name.toLowerCase() === name.toLowerCase() ? ' on' : '');
      b.innerHTML = icon('user');
      const label = document.createElement('span');
      label.textContent = name;
      b.append(label);
      b.onclick = () => choosePlayer(name);
      list.append(b);
    }
    $('#player-note').textContent = Sync.enabled()
      ? 'Chi usa lo stesso nome condivide gli stessi progressi, quindi in famiglia scegliete nomi diversi.'
      : 'Il salvataggio online non è ancora attivo: per ora i progressi restano su questo dispositivo.';
  };

  function choosePlayer(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!name) { toast('Scrivi un nome'); return; }
    if (player) Sync.beacon(player.name, progress);
    // Progress saved before nicknames existed goes to the first player chosen on this device.
    const legacy = store.get(PROGRESS_KEY, null);
    player = { name };
    store.set(PLAYER_KEY, player);
    const names = store.get(PLAYERS_KEY, []).filter((n) => n.toLowerCase() !== name.toLowerCase());
    store.set(PLAYERS_KEY, [name, ...names].slice(0, 10));
    progress = Sync.mergeProgress(store.get(progressKey(), {}), legacy);
    if (legacy) store.remove(PROGRESS_KEY);
    saveProgress();
    levelsPage = -1;
    syncInfo.gen++;
    show('home', 'replace');
    syncNow().then((res) => { if (res && res.existed) toast(`Ciao ${name}! Ho recuperato i tuoi progressi.`); });
  }

  // ---------------------------------------------------------------- online saves
  // gen changes on reset or player switch, so an answer to an older request is ignored.
  const syncInfo = { state: 'off', at: 0, timer: 0, busy: false, again: false, reset: false, gen: 0 };

  function setSyncState(state) {
    syncInfo.state = state;
    if (state === 'ok') syncInfo.at = Date.now();
    renderSyncState();
  }

  function renderSyncState() {
    $('#sync-dot').className = 'sync-dot ' + syncInfo.state;
    const time = syncInfo.at ? new Date(syncInfo.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    $('#settings-sync').textContent = {
      off: 'Salvataggio online non attivo: i progressi restano su questo dispositivo.',
      syncing: 'Salvataggio online in corso…',
      ok: `Progressi salvati online alle ${time}.`,
      offline: 'Sei offline: salverò online appena torna la connessione.',
      error: 'Salvataggio online non riuscito, riproverò più tardi.',
    }[syncInfo.state];
  }

  // Sends this player's progress and takes back the merged copy from the server.
  async function syncNow(reset) {
    clearTimeout(syncInfo.timer);
    if (reset) { syncInfo.reset = true; syncInfo.gen++; }
    if (!player || !Sync.enabled()) { setSyncState('off'); return null; }
    if (navigator.onLine === false) { setSyncState('offline'); return null; }
    if (syncInfo.busy) { syncInfo.again = true; return null; }
    syncInfo.busy = true;
    setSyncState('syncing');
    const gen = syncInfo.gen, sendReset = syncInfo.reset;
    try {
      const res = await Sync.exchange(player.name, progress, sendReset);
      if (sendReset) syncInfo.reset = false;
      if (gen !== syncInfo.gen) return null;
      // Keep anything that changed here while the request was in flight.
      progress = Sync.mergeProgress(res.data, progress);
      saveProgress();
      setSyncState('ok');
      if (['home', 'levels', 'pictures'].includes(current)) renderers[current]();
      return res;
    } catch (e) {
      setSyncState(e.missing ? 'off' : navigator.onLine === false ? 'offline' : 'error');
      return null;
    } finally {
      syncInfo.busy = false;
      if (syncInfo.again) { syncInfo.again = false; syncSoon(); }
    }
  }

  function syncSoon() {
    clearTimeout(syncInfo.timer);
    syncInfo.timer = setTimeout(() => syncNow(), 1500);
  }

  // ================================================================ game
  let G = null;

  function startGame(id, mode = 'push') {
    let p;
    try { p = puzzleFor(id); } catch (e) { toast('Impossibile creare questo puzzle, provane un altro'); return; }
    const n = p.w * p.h;
    G = {
      id, p,
      state: new Uint8Array(n),
      errors: new Set(),
      check: settings.check,
      lives: 3, mistakes: 0, hints: 0, time: 0,
      undo: [],
      rowDone: new Uint8Array(p.h), colDone: new Uint8Array(p.w),
      won: false, zoom: null,
    };
    const save = progress.saves[id];
    if (save && save.s && save.s.length === n) {
      for (let i = 0; i < n; i++) G.state[i] = +save.s[i];
      G.errors = new Set(save.e || []);
      G.check = save.c !== undefined ? save.c : G.check;
      G.lives = save.l !== undefined ? save.l : 3;
      G.mistakes = save.m || 0;
      G.hints = save.h || 0;
      G.time = save.t || 0;
    }
    buildBoard();
    show('game', mode);
    $('#win-sheet').hidden = true;
    $('#game-name').textContent = p.title;
    $('#btn-undo').classList.toggle('invisible', G.check);
    setTool(settings.tool);
    layout();
    $('#board-wrap').scrollTo(0, 0);
    for (let y = 0; y < p.h; y++) updateLine('row', y, true);
    for (let x = 0; x < p.w; x++) updateLine('col', x, true);
    renderHearts();
    renderSub();
    updateUndo();
    if (G.check && G.lives <= 0) outOfLives();
  }

  function leaveGame() {
    if (G && !G.won) persist();
    hideStrokeCount();
    G = null;
    syncSoon();
  }

  function persist() {
    if (!G || G.won) return;
    const any = G.state.some((v) => v !== EMPTY);
    if (!any && !G.time) return;
    progress.saves[G.id] = {
      s: G.state.join(''), e: [...G.errors], c: G.check, l: G.lives, m: G.mistakes, h: G.hints,
      t: Math.round(G.time), at: Date.now(),
    };
    const keys = Object.keys(progress.saves);
    if (keys.length > 25) {
      keys.sort((a, b) => (progress.saves[a].at || 0) - (progress.saves[b].at || 0));
      for (const k of keys.slice(0, keys.length - 25)) delete progress.saves[k];
    }
    saveProgress();
  }
  let persistTimer = 0;
  function persistSoon() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 400);
  }

  // ---------------------------------------------------------------- board
  function buildBoard() {
    const { p } = G;
    const board = $('#board');
    board.className = '';
    board.innerHTML = '';
    board.style.setProperty('--w', p.w);
    board.style.setProperty('--h', p.h);
    const frag = document.createDocumentFragment();
    const corner = document.createElement('div');
    corner.className = 'corner';
    frag.append(corner);
    G.colEls = p.cols.map((clue) => {
      const d = document.createElement('div');
      d.className = 'clue col-clue';
      d.innerHTML = (clue.length ? clue : [0]).map((n) => `<span>${n}</span>`).join('');
      frag.append(d);
      return d;
    });
    G.rowEls = [];
    G.cellEls = [];
    for (let y = 0; y < p.h; y++) {
      const d = document.createElement('div');
      d.className = 'clue row-clue';
      d.innerHTML = (p.rows[y].length ? p.rows[y] : [0]).map((n) => `<span>${n}</span>`).join('');
      frag.append(d);
      G.rowEls.push(d);
      for (let x = 0; x < p.w; x++) {
        const c = document.createElement('div');
        let cls = 'cell';
        if (y === 0) cls += ' t';
        if (x === 0) cls += ' l';
        if (x === p.w - 1) cls += ' r'; else if (x % 5 === 4) cls += ' br';
        if (y === p.h - 1) cls += ' b'; else if (y % 5 === 4) cls += ' bb';
        c.className = cls;
        frag.append(c);
        G.cellEls.push(c);
      }
    }
    board.append(frag);
    for (let i = 0; i < G.state.length; i++) renderCell(i);
  }

  function layout() {
    if (!G) return;
    const { p } = G;
    const wrap = $('#board-wrap');
    const availW = wrap.clientWidth - 18, availH = wrap.clientHeight - 18;
    const rowUnits = Math.max(...p.rows.map((r) => {
      const nums = r.length ? r : [0];
      return nums.reduce((s, n) => s + String(n).length * 0.36, 0) + (nums.length - 1) * 0.22 + 0.45;
    }));
    const colUnits = Math.max(...p.cols.map((c) => Math.max(1, c.length))) * 0.62 + 0.25;
    const fit = Math.floor(Math.min(availW / (p.w + rowUnits), availH / (p.h + colUnits), 46));
    G.fitCell = fit;
    if (G.zoom === null) G.zoom = fit < 18;
    const cell = G.zoom ? Math.max(Math.round(fit * 1.6), 28) : fit;
    const board = $('#board');
    board.style.setProperty('--cell', cell + 'px');
    board.style.setProperty('--fs', Math.max(9, cell * 0.56).toFixed(1) + 'px');
    board.style.setProperty('--clue-w', Math.ceil(rowUnits * Math.max(cell, 16)) + 'px');
    board.style.setProperty('--clue-h', Math.ceil(colUnits * Math.max(cell, 16)) + 'px');
    wrap.classList.toggle('zoomed', G.zoom);
    $('#btn-zoom').hidden = fit >= 26 && !G.zoom;
    $('#btn-zoom').innerHTML = icon(G.zoom ? 'unzoom' : 'zoom');
  }

  function renderCell(i) {
    const el = G.cellEls[i], s = G.state[i];
    el.classList.toggle('f', s === FILL);
    el.classList.toggle('x', s === CROSS);
    el.classList.toggle('err', G.errors.has(i));
  }

  function lineCells(kind, k) {
    const { w, h } = G.p, out = [];
    if (kind === 'row') for (let x = 0; x < w; x++) out.push(k * w + x);
    else for (let y = 0; y < h; y++) out.push(y * w + k);
    return out;
  }

  function lineMatches(kind, k) {
    const cells = lineCells(kind, k).map((i) => (G.state[i] === FILL ? 1 : 0));
    const want = kind === 'row' ? G.p.rows[k] : G.p.cols[k];
    const got = Solver.lineClue(cells);
    return got.length === want.length && got.every((v, j) => v === want[j]);
  }

  // Returns true when the line has just become complete.
  function updateLine(kind, k, silent) {
    const done = lineMatches(kind, k);
    const arr = kind === 'row' ? G.rowDone : G.colDone;
    const was = arr[k] === 1;
    arr[k] = done ? 1 : 0;
    (kind === 'row' ? G.rowEls : G.colEls)[k].classList.toggle('done', done);
    return done && !was && !silent;
  }

  function setCell(i, s, changes) {
    if (G.state[i] === s) return;
    if (changes) changes.push([i, G.state[i]]);
    G.state[i] = s;
    renderCell(i);
  }

  // After a move: refresh clue states, auto-cross finished lines, check for a win.
  function afterMove(cells, changes) {
    const { w } = G.p;
    const rows = new Set(), cols = new Set();
    for (const i of cells) { rows.add((i / w) | 0); cols.add(i % w); }
    let completed = 0;
    const finished = [];
    for (const y of rows) if (updateLine('row', y)) { completed++; finished.push(['row', y]); }
    for (const x of cols) if (updateLine('col', x)) { completed++; finished.push(['col', x]); }
    if (settings.autoCross) {
      for (const [kind, k] of finished) {
        for (const i of lineCells(kind, k)) if (G.state[i] === EMPTY) setCell(i, CROSS, changes);
      }
    }
    if (completed) sfx.line();
    if (G.rowDone.every((v) => v) && G.colDone.every((v) => v)) win();
    else persistSoon();
  }

  // ---------------------------------------------------------------- input
  let stroke = null, panning = null;
  const pointers = new Map();

  function cellAt(cx, cy, clamp) {
    const r0 = G.cellEls[0].getBoundingClientRect();
    const size = r0.width;
    let x = Math.floor((cx - r0.left) / size), y = Math.floor((cy - r0.top) / size);
    const { w, h } = G.p;
    if (clamp) {
      x = Math.max(0, Math.min(w - 1, x));
      y = Math.max(0, Math.min(h - 1, y));
    } else if (x < 0 || y < 0 || x >= w || y >= h) return null;
    return { x, y };
  }

  function highlight(c) {
    $$('#board .hl').forEach((el) => el.classList.remove('hl'));
    if (!c) return;
    G.rowEls[c.y].classList.add('hl');
    G.colEls[c.x].classList.add('hl');
    for (const i of lineCells('row', c.y)) G.cellEls[i].classList.add('hl');
    for (const i of lineCells('col', c.x)) G.cellEls[i].classList.add('hl');
  }

  function showStrokeCount(n, px, py) {
    const el = $('#stroke-count');
    if (n < 2) { el.classList.remove('show'); return; }
    el.textContent = n;
    el.style.left = px + 'px';
    el.style.top = (py - 34) + 'px';
    el.classList.add('show');
  }
  function hideStrokeCount() { $('#stroke-count').classList.remove('show'); }

  function onPointerDown(e) {
    if (!G || G.won) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      // Second finger: switch from painting to panning a zoomed board.
      if (stroke) endStroke();
      const [a, b] = [...pointers.values()];
      panning = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      highlight(null);
      return;
    }
    if (pointers.size > 2) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) return;
    e.preventDefault();
    try { $('#board').setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const tool = e.button === 2 ? CROSS : settings.tool;
    const i = c.y * G.p.w + c.x, from = G.state[i];
    highlight(c);
    if (G.check && from !== EMPTY) return; // checked cells are final
    const to = from === EMPTY ? tool : EMPTY;
    stroke = { sx: c.x, sy: c.y, from, to, axis: null, last: c, changes: [], touched: [], dead: false, count: 0 };
    paint(i);
  }

  function onPointerMove(e) {
    if (!G || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (panning) {
      const [a, b] = [...pointers.values()];
      if (!b) return;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const wrap = $('#board-wrap');
      wrap.scrollLeft -= m.x - panning.x;
      wrap.scrollTop -= m.y - panning.y;
      panning = m;
      return;
    }
    if (!stroke || stroke.dead) return;
    const c = cellAt(e.clientX, e.clientY, true);
    if (c.x === stroke.last.x && c.y === stroke.last.y) return;
    if (!stroke.axis) {
      if (c.x === stroke.sx && c.y === stroke.sy) return;
      stroke.axis = Math.abs(c.x - stroke.sx) >= Math.abs(c.y - stroke.sy) ? 'x' : 'y';
    }
    const target = stroke.axis === 'x' ? { x: c.x, y: stroke.sy } : { x: stroke.sx, y: c.y };
    const { w } = G.p;
    let { x, y } = stroke.last;
    while ((x !== target.x || y !== target.y) && !stroke.dead) {
      x += Math.sign(target.x - x);
      y += Math.sign(target.y - y);
      paint(y * w + x);
    }
    stroke.last = target;
    highlight(target);
    const len = Math.abs(target.x - stroke.sx) + Math.abs(target.y - stroke.sy) + 1;
    showStrokeCount(len, e.clientX, e.clientY - 20);
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) panning = null;
    if (stroke && pointers.size === 0) endStroke();
    if (pointers.size === 0) {
      hideStrokeCount();
      if (G && !G.won) setTimeout(() => { if (!stroke && G) highlight(null); }, 250);
    }
  }

  function paint(i) {
    if (G.state[i] !== stroke.from) return;
    stroke.touched.push(i);
    if (G.check && stroke.to !== EMPTY) {
      const want = G.p.sol[i] ? FILL : CROSS;
      if (stroke.to !== want) {
        setCell(i, want);
        G.errors.add(i);
        renderCell(i);
        stroke.dead = true;
        mistake();
        return;
      }
    }
    setCell(i, stroke.to, stroke.changes);
    stroke.count++;
    if (stroke.to === FILL) { sfx.fill(stroke.count); buzz(8); } else if (stroke.to === CROSS) sfx.cross(); else sfx.clear();
  }

  function endStroke() {
    const s = stroke;
    stroke = null;
    hideStrokeCount();
    if (!s.touched.length) return;
    afterMove(s.touched, s.changes);
    if (!G.check && s.changes.length) { G.undo.push(s.changes); updateUndo(); }
  }

  function mistake() {
    G.mistakes++;
    G.lives--;
    sfx.error();
    buzz([60, 40, 60]);
    renderHearts(true);
    if (G.lives <= 0) setTimeout(outOfLives, 350);
  }

  function outOfLives() {
    if (!G) return;
    dialog('Cuori finiti', 'Puoi ricominciare questo puzzle oppure continuare con tre cuori nuovi.', [
      { label: 'Ricomincia', action: restart },
      { label: 'Continua', primary: true, action: () => { G.lives = 3; renderHearts(); persistSoon(); } },
    ]);
  }

  function renderHearts(shake) {
    const el = $('#hearts');
    if (!G.check) { el.innerHTML = ''; return; }
    el.innerHTML = [0, 1, 2].map((k) => `<span class="${k < G.lives ? '' : 'lost'}">${icon('heart')}</span>`).join('');
    if (shake) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  function setTool(t) {
    settings.tool = t;
    saveSettings();
    $('#tool-fill').classList.toggle('on', t === FILL);
    $('#tool-cross').classList.toggle('on', t === CROSS);
    $('#tool-fill').setAttribute('aria-checked', t === FILL);
    $('#tool-cross').setAttribute('aria-checked', t === CROSS);
  }

  function updateUndo() { $('#btn-undo').disabled = !G.undo.length; }

  function undo() {
    if (!G || G.won || !G.undo.length) return;
    const changes = G.undo.pop();
    const cells = [];
    for (let k = changes.length - 1; k >= 0; k--) {
      const [i, old] = changes[k];
      G.state[i] = old;
      renderCell(i);
      cells.push(i);
    }
    const { w } = G.p;
    for (const y of new Set(cells.map((i) => (i / w) | 0))) updateLine('row', y, true);
    for (const x of new Set(cells.map((i) => i % w))) updateLine('col', x, true);
    sfx.clear();
    updateUndo();
    persistSoon();
  }

  function restart() {
    if (!G) return;
    // An empty save (rather than none) so an older copy from another device can't bring the marks back.
    progress.saves[G.id] = { s: '', at: Date.now() };
    saveProgress();
    startGame(G.id, 'replace');
  }

  // ---------------------------------------------------------------- hints
  function flashCell(i) {
    const el = G.cellEls[i];
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function hint() {
    if (!G || G.won) return;
    const { p } = G;
    // In free mode, point out a wrong mark first.
    for (let i = 0; i < G.state.length; i++) {
      const s = G.state[i];
      if ((s === FILL && !p.sol[i]) || (s === CROSS && p.sol[i])) {
        G.hints++;
        const changes = [];
        setCell(i, p.sol[i] ? FILL : CROSS, changes);
        flashCell(i);
        toast('Quella casella era sbagliata: l\'ho corretta');
        sfx.hint();
        afterMove([i], changes);
        return;
      }
    }
    const known = new Int8Array(G.state.length);
    for (let i = 0; i < known.length; i++) known[i] = G.state[i] === FILL ? 1 : G.state[i] === CROSS ? 0 : -1;
    const d = Solver.bestDeduction(p.rows, p.cols, p.w, p.h, known);
    let cells;
    if (d) {
      const fills = d.cells.filter((c) => c.v === 1);
      cells = fills.length ? fills : d.cells;
      const el = (d.kind === 'row' ? G.rowEls : G.colEls)[d.index];
      el.classList.add('hint-line');
      setTimeout(() => el.classList.remove('hint-line'), 1600);
      toast(`Guarda la ${d.kind === 'row' ? 'riga' : 'colonna'} ${d.index + 1}`);
    } else {
      const unknown = [];
      for (let i = 0; i < G.state.length; i++) if (G.state[i] === EMPTY) unknown.push({ i, v: p.sol[i] });
      if (!unknown.length) return;
      cells = [unknown[Math.floor(Math.random() * unknown.length)]];
    }
    G.hints++;
    const changes = [];
    for (const c of cells) { setCell(c.i, c.v ? FILL : CROSS, changes); flashCell(c.i); }
    sfx.hint();
    if (!G.check) { G.undo.push(changes); updateUndo(); }
    afterMove(cells.map((c) => c.i), changes);
  }

  // ---------------------------------------------------------------- win
  function fmtTime(s) {
    s = Math.round(s);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderSub() {
    if (!G) return;
    $('#game-sub').textContent = `${G.p.w}×${G.p.h} · ${fmtTime(G.time)}`;
  }

  function win() {
    G.won = true;
    highlight(null);
    hideStrokeCount();
    const { p, id } = G;
    const prev = progress.done[id];
    const rec = { t: Math.round(G.time), m: G.mistakes + G.hints, at: Date.now() };
    if (prev) { rec.t = Math.min(prev.t, rec.t); rec.m = Math.min(prev.m, rec.m); }
    if (p.kind !== 'q') progress.done[id] = rec;
    if (p.kind === 'e') progress.endlessMax = Math.max(progress.endlessMax, p.n);
    delete progress.saves[id];
    saveProgress();
    keepStorage();
    syncSoon();

    // Reveal the picture in colour, sweeping out from the centre.
    const board = $('#board');
    const cx = (p.w - 1) / 2, cy = (p.h - 1) / 2;
    G.cellEls.forEach((el, i) => {
      const x = i % p.w, y = (i / p.w) | 0;
      el.classList.remove('err', 'flash');
      el.style.setProperty('--d', (Math.hypot(x - cx, y - cy) * 0.035).toFixed(2) + 's');
      if (p.sol[i]) el.style.setProperty('--c', p.colors[i] || 'var(--fill)');
    });
    board.classList.add('solved');
    sfx.win();
    buzz([30, 50, 30, 50, 80]);

    const clean = G.mistakes === 0 && G.hints === 0;
    $('#win-name').textContent = p.reveal || p.title;
    $('#game-name').textContent = p.reveal || p.title;
    $('#win-stats').textContent = `${fmtTime(G.time)} · ` + (clean ? '★ nessun errore, nessun aiuto'
      : [G.mistakes && `${G.mistakes} ${G.mistakes > 1 ? 'errori' : 'errore'}`, G.hints && `${G.hints} ${G.hints > 1 ? 'aiuti' : 'aiuto'}`].filter(Boolean).join(', '));
    $('#win-next').textContent = p.kind === 'd' ? 'Fatto' : 'Avanti';
    setTimeout(() => { if (G && G.won) $('#win-sheet').hidden = false; }, 1100);
  }

  function nextPuzzle() {
    const { p } = G;
    if (p.kind === 'e') return startGame('e:' + (p.n + 1), 'replace');
    if (p.kind === 'q') return startGame(`q:${p.w}x${p.h}:${Date.now().toString(36)}`, 'replace');
    if (p.kind === 'c') {
      const list = Pictures.PICTURES;
      const at = list.findIndex((x) => 'c:' + x.id === p.id);
      for (let k = 1; k <= list.length; k++) {
        const pic = list[(at + k) % list.length];
        if (!progress.done['c:' + pic.id]) return startGame('c:' + pic.id, 'replace');
      }
      return startGame('c:' + list[(at + 1) % list.length].id, 'replace');
    }
    back();
  }

  // ---------------------------------------------------------------- timer
  setInterval(() => {
    if (current === 'game' && G && !G.won && !document.hidden && $('#modal').hidden) {
      G.time++;
      renderSub();
    }
  }, 1000);

  // ---------------------------------------------------------------- wiring
  function bind() {
    paintIcons();
    for (const b of $$('[data-go]')) b.addEventListener('click', () => show(b.dataset.go));
    for (const b of $$('[data-back]')) b.addEventListener('click', back);
    $('[data-action="continue"]').onclick = () => startGame('e:' + endlessContinue());
    $('[data-action="daily"]').onclick = () => startGame('d:' + today());
    $('#levels-prev').onclick = () => { levelsPage = Math.max(0, levelsPage - 1); renderers.levels(); };
    $('#levels-next').onclick = () => { levelsPage++; renderers.levels(); };

    const board = $('#board');
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerUp);
    board.addEventListener('contextmenu', (e) => e.preventDefault());
    $('#tool-fill').onclick = () => setTool(FILL);
    $('#tool-cross').onclick = () => setTool(CROSS);
    $('#btn-undo').onclick = undo;
    $('#btn-hint').onclick = hint;
    $('#btn-zoom').onclick = () => { if (G) { G.zoom = !G.zoom; layout(); } };
    $('#btn-restart').onclick = () => {
      if (!G || G.won) return;
      dialog('Ricominciare il puzzle?', 'I segni su questo puzzle verranno cancellati.', [
        { label: 'Annulla' },
        { label: 'Ricomincia', primary: true, action: restart },
      ]);
    };
    $('#win-next').onclick = nextPuzzle;
    $('#win-menu').onclick = back;

    window.addEventListener('resize', () => layout());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        persist();
        if (player) Sync.beacon(player.name, progress);
      } else if (current !== 'game') {
        syncNow();
      }
    });
    window.addEventListener('pagehide', persist);
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => { if (Sync.enabled() && player) setSyncState('offline'); });
    $('#player-form').addEventListener('submit', (e) => {
      e.preventDefault();
      $('#player-name').blur();
      choosePlayer($('#player-name').value);
    });
    document.addEventListener('keydown', (e) => {
      if (current !== 'game') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'x' || e.key === 'X') setTool(settings.tool === FILL ? CROSS : FILL);
    });
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    }
    bindSettings();
  }

  // Asks the browser not to clear saved progress when the phone runs low on space.
  function keepStorage() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then((yes) => yes || navigator.storage.persist()).catch(() => { /* unsupported */ });
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline install unavailable */ });
    }
  }

  applyTheme();
  bind();
  drawLogo();
  history.replaceState({ screen: 'home' }, '');
  if (player) {
    show('home', 'none');
    syncNow();
  } else {
    show('player', 'none');
  }
  registerServiceWorker();
  if (Object.keys(progress.done).length) keepStorage();
})();
