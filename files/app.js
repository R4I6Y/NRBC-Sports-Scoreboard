(() => {
'use strict';

const KEY = 'bbscore_state', ROOM_KEY = 'bbscore_room', PEER_PREFIX = 'bbscore-';
const DEFAULT = {
  away: { name: 'AWAY', abbr: 'AWY', score: 0, fouls: 0, to: 7, color: '#c8102e' },
  home: { name: 'HOME', abbr: 'HME', score: 0, fouls: 0, to: 7, color: '#1d428a' },
  period: '1ST',
  gameMs: 720000, gameRun: false,
  shotMs: 24000, shotRun: false,
  spot: { show: false, name: '', num: '', stat: '' },
  _t: 0 // timestamp (ms) at which gameMs/shotMs were last accurate
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setPath = (o, p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((a, x) => a[x], o)[l] = v; };
const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && s.away ? s : null; } catch { return null; } };

// Current clock values, interpolated from the last sync point
const cur = s => {
  const d = Date.now() - s._t;
  return { game: s.gameRun ? Math.max(0, s.gameMs - d) : s.gameMs,
           shot: s.shotRun ? Math.max(0, s.shotMs - d) : s.shotMs };
};
const fmtGame = ms => {
  if (ms < 60000) return (Math.floor(ms / 100) / 10).toFixed(1);   // tenths under 1:00
  const t = Math.ceil(ms / 1000);
  return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
};
const fmtShot = ms => String(Math.ceil(ms / 1000));

// "12:00", "5:30.5" -> mm:ss ; plain number -> seconds ("45.5")
function parseTime(v) {
  v = v.trim();
  let m = v.match(/^(\d+):(\d{1,2})(?:\.(\d))?$/);
  if (m) return (+m[1] * 60 + +m[2]) * 1000 + (m[3] ? +m[3] * 100 : 0);
  m = v.match(/^\d+(?:\.\d+)?$/);
  return m ? Math.round(parseFloat(v) * 1000) : null;
}

/* ===================== OVERLAY ===================== */
function initOverlay() {
  let S = load() || structuredClone(DEFAULT);
  const q = new URLSearchParams(location.search);
  const nameKey = q.get('names') === 'full' ? 'name' : 'abbr';   // overlay.html?names=full
  if (q.has('preview')) document.body.classList.add('preview');
  const last = {};
  const el = id => document.getElementById(id);
  const set = (id, v) => { v = String(v); if (last[id] === v) return false; last[id] = v; el(id).textContent = v; return true; };
  const pop = id => { const e = el(id); e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); };

  function renderStatic() {
    for (const t of ['away', 'home']) {
      const T = S[t];
      set(t + 'Name', T[nameKey] || T.abbr);
      if (set(t + 'Score', T.score) && last._init) pop(t + 'Score');
      set(t + 'Fouls', 'FOULS ' + T.fouls);
      el(t + 'Fouls').classList.toggle('bonus', T.fouls >= 5);
      el(t + 'To').innerHTML = Array.from({ length: 7 }, (_, i) => `<i class="${i < T.to ? 'on' : ''}"></i>`).join('');
      document.documentElement.style.setProperty('--' + t + '-color', T.color);
    }
    set('period', S.period);
    set('spotNum', S.spot.num || '');
    set('spotName', S.spot.name || '');
    set('spotStat', S.spot.stat || '');
    el('spot').classList.toggle('show', !!S.spot.show);
    last._init = true;
  }

  function frame() {
    const c = cur(S);
    set('clock', fmtGame(c.game));
    set('shot', fmtShot(c.shot));
    el('clock').classList.toggle('low', c.game < 60000);
    el('shot').classList.toggle('low', c.shot <= 5000);
    requestAnimationFrame(frame);
  }

  // fromPeer: the sender's clock is different, so stamp with our own time
  function apply(s, fromPeer) {
    if (!s || !s.away) return;
    S = s;
    if (fromPeer) S._t = Date.now();
    renderStatic();
  }

  // Same-browser sync
  addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) { try { apply(JSON.parse(e.newValue)); } catch {} }
  });

  // Peer-to-peer sync: overlay.html?room=1234
  const room = q.get('room');
  if (room && window.Peer) {
    const connect = () => {
      let done = false;
      const retry = () => { if (done) return; done = true; try { p.destroy(); } catch {} setTimeout(connect, 2500); };
      const p = new Peer();
      p.on('open', () => {
        const c = p.connect(PEER_PREFIX + room, { reliable: true });
        c.on('data', d => apply(d, true));
        c.on('close', retry);
        c.on('error', retry);
      });
      p.on('error', retry);
    };
    connect();
  }

  renderStatic();
  frame();
}

/* ===================== CONTROLLER ===================== */
function initController() {
  let S = load() || structuredClone(DEFAULT);
  S.gameRun = S.shotRun = false; S._t = Date.now();
  const conns = new Set();
  let peer = null, roomCode = '';

  const settle = () => { const c = cur(S); S.gameMs = c.game; S.shotMs = c.shot; S._t = Date.now(); };
  const push = () => {
    settle();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
    conns.forEach(c => c.open && c.send(S));
  };
  const commit = fn => { settle(); if (fn) fn(S); push(); render(); };

  // ---- UI ----
  const teamUI = t => `
    <section class="card">
      <h2><span data-bind="${t}.name"></span></h2>
      <div class="big" data-bind="${t}.score"></div>
      <div class="row">${[1, 2, 3, -1].map(v => `<button data-a="score" data-t="${t}" data-v="${v}">${v > 0 ? '+' : '−'}${Math.abs(v)}</button>`).join('')}</div>
      <div class="row"><input data-in="${t}.name" placeholder="Team name"><input data-in="${t}.abbr" maxlength="4" placeholder="Abbr" style="max-width:90px"><input type="color" data-in="${t}.color" style="max-width:60px"></div>
      ${['fouls', 'to'].map(k => `<div class="counter"><span>${k === 'to' ? 'Timeouts' : 'Fouls'}</span>
        <button data-a="${k === 'to' ? 'to' : 'foul'}" data-t="${t}" data-v="-1">−</button><b data-bind="${t}.${k}"></b>
        <button data-a="${k === 'to' ? 'to' : 'foul'}" data-t="${t}" data-v="1">+</button></div>`).join('')}
    </section>`;
  $('#teams').innerHTML = teamUI('away') + teamUI('home');

  const mark = (btn, on, onText, offText) => { btn.textContent = on ? onText : offText; btn.classList.toggle('stop', on); };
  function clocks() {
    const c = cur(S);
    $('#gameClock').textContent = fmtGame(c.game);
    $('#shotClock').textContent = fmtShot(c.shot);
  }
  function render() {
    $$('[data-bind]').forEach(e => e.textContent = getPath(S, e.dataset.bind));
    $$('[data-a=period]').forEach(b => b.classList.toggle('on', b.dataset.v === S.period));
    mark($('#gameBtn'), S.gameRun, 'Pause', 'Start');
    mark($('#shotBtn'), S.shotRun, 'Pause', 'Start');
    $('#spotBtn').textContent = S.spot.show ? 'Hide card' : 'Show card';
    $('#spotBtn').classList.toggle('on', S.spot.show);
    clocks();
  }

  // Text inputs (filled once, so typing is never overwritten)
  $$('[data-in]').forEach(i => {
    i.value = getPath(S, i.dataset.in) ?? '';
    i.addEventListener('input', () => commit(s => setPath(s, i.dataset.in, i.value)));
  });

  // ---- Actions ----
  const A = {
    score: d => commit(s => { s[d.t].score = Math.max(0, s[d.t].score + +d.v); }),
    foul: d => commit(s => { s[d.t].fouls = clamp(s[d.t].fouls + +d.v, 0, 99); }),
    to: d => commit(s => { s[d.t].to = clamp(s[d.t].to + +d.v, 0, 7); }),
    resetFouls: () => commit(s => { s.away.fouls = s.home.fouls = 0; }),
    gameToggle: () => commit(s => {
      if (s.gameMs <= 0) return;
      s.gameRun = !s.gameRun;
      if ($('#link').checked) s.shotRun = s.gameRun && s.shotMs > 0;
    }),
    gameAdj: d => commit(s => { s.gameMs = clamp(s.gameMs + +d.v, 0, 5999000); }),
    gameSet: () => {
      const ms = parseTime($('#timeIn').value);
      if (ms != null) commit(s => { s.gameMs = clamp(ms, 0, 5999000); });
    },
    shotToggle: () => commit(s => { if (s.shotMs > 0) s.shotRun = !s.shotRun; }),
    shotReset: d => commit(s => { s.shotMs = +d.v * 1000; if ($('#link').checked) s.shotRun = s.gameRun; }),
    period: d => commit(s => { s.period = d.v; }),
    spot: () => commit(s => { s.spot.show = !s.spot.show; }),
    connect: () => { const v = $('#room').value.trim(); /^\d{4}$/.test(v) ? startRoom(v) : status('Enter exactly 4 digits'); },
    newRoom: () => startRoom(String(Math.floor(1000 + Math.random() * 9000))),
    copy: () => { $('#overlayLink').select(); navigator.clipboard?.writeText($('#overlayLink').value); }
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (b) A[b.dataset.a]?.(b.dataset);
  });

  // ---- Hotkeys (ignored while typing) ----
  const KEYS = {
    ' ': ['gameToggle'], r: ['shotReset', { v: 24 }], t: ['shotReset', { v: 14 }], p: ['spot'],
    ',': ['gameAdj', { v: -1000 }], '.': ['gameAdj', { v: 1000 }],
    a: ['score', { t: 'away', v: 1 }], s: ['score', { t: 'away', v: 2 }], d: ['score', { t: 'away', v: 3 }], z: ['score', { t: 'away', v: -1 }],
    j: ['score', { t: 'home', v: 1 }], k: ['score', { t: 'home', v: 2 }], l: ['score', { t: 'home', v: 3 }], m: ['score', { t: 'home', v: -1 }],
    1: ['period', { v: '1ST' }], 2: ['period', { v: '2ND' }], 3: ['period', { v: '3RD' }], 4: ['period', { v: '4TH' }], 0: ['period', { v: 'OT' }]
  };
  const typing = e => /INPUT|TEXTAREA/.test(e.target.tagName);
  addEventListener('keydown', e => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYS[e.key.toLowerCase()];
    if (k) { e.preventDefault(); A[k[0]](k[1] || {}); }
  });
  addEventListener('keyup', e => { if (e.key === ' ' && !typing(e)) e.preventDefault(); }); // stop focused buttons double-firing

  // ---- Peer-to-peer room ----
  const status = t => { $('#status').textContent = t; };
  const live = () => status(`Room ${roomCode} is live · ${conns.size} overlay${conns.size === 1 ? '' : 's'} connected`);
  function startRoom(code) {
    if (peer) { try { peer.destroy(); } catch {} conns.clear(); }
    roomCode = code;
    localStorage.setItem(ROOM_KEY, code);
    $('#room').value = code;
    $('#overlayLink').value = new URL('overlay.html?room=' + code, location.href).href;
    if (!window.Peer) return status('PeerJS could not load (offline?). Same-browser sync only.');
    status('Connecting…');
    peer = new Peer(PEER_PREFIX + code);
    peer.on('open', live);
    peer.on('connection', c => {
      c.on('open', () => { conns.add(c); settle(); c.send(S); live(); });
      c.on('close', () => { conns.delete(c); live(); });
      c.on('error', () => { conns.delete(c); live(); });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
    peer.on('error', e => status(e.type === 'unavailable-id' ? 'That code is already in use. Try another.' : 'Connection problem: ' + e.type));
  }

  // ---- Clock watchdog: stop clocks at zero ----
  setInterval(() => {
    clocks();
    const c = cur(S);
    if ((S.gameRun && c.game <= 0) || (S.shotRun && c.shot <= 0)) {
      commit(s => {
        if (s.gameMs <= 0) { s.gameRun = false; s.shotRun = false; }
        if (s.shotMs <= 0) s.shotRun = false;
      });
    }
  }, 100);
  setInterval(() => { if (conns.size) push(); }, 2000);  // heartbeat re-sync

  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch {}  // keep phone awake
  render();
  push();
  startRoom(localStorage.getItem(ROOM_KEY) || String(Math.floor(1000 + Math.random() * 9000)));
}

document.body.dataset.role === 'overlay' ? initOverlay() : initController();
})();
