/* =====================================================================
   1:1 오락실 공용 뼈대 (kimju.kr/vs)
   - 서버 없이 두 기기를 직접 잇는다(PeerJS 공개 중개 + WebRTC). 방장 기기가 방 서버 역할.
   - 컴퓨터 상대 / 친구 대전(방 번호 4자리·비번) / 대기실 / 결과 / 음악·전체 화면을 모든 게임이 같이 쓴다.
   - 게임은 VS.init({...})으로 붙는다. 게임 쪽 규약은 맨 아래 «게임 규약» 주석 참고.
   말랑 대전(kimju.kr/bbu)의 검증된 연결 코드를 일반화한 것.
   ===================================================================== */
(function(){
'use strict';
const VS = window.VS = {};
const $ = id => document.getElementById(id);
const store = { get(k){ try { return localStorage.getItem(k); } catch { return null; } }, set(k, v){ try { localStorage.setItem(k, v); } catch {} } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
VS.$ = $; VS.store = store;
VS.rng = function(a){ a |= 0; return function(){ a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

// ================= 소리 =================
let AC = null;
function ac(){ if (!AC){ try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
VS.ac = ac;
function tone(freq, dur, type, vol, slide, delay = 0){
  const a = AC; if (!a || !BGM.sfxOn) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol || .08, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
let lastMove = 0;
VS.sfx = function(k, n = 0){
  if (!AC) return;
  if (k === 'move'){ const t = performance.now(); if (t - lastMove < 30) return; lastMove = t; tone(520, .04, 'square', .025); }
  else if (k === 'rot') tone(760, .05, 'triangle', .05, 900);
  else if (k === 'place') tone(240, .08, 'sine', .1, 150);
  else if (k === 'click') tone(1400, .04, 'triangle', .05, 900);
  else if (k === 'pop'){ const b = 392 * Math.pow(2, Math.min(n, 12) * 2 / 12); tone(b, .16, 'triangle', .09, b * 1.5); tone(b * 1.5, .14, 'sine', .05, 0, .06); }
  else if (k === 'hit') tone(180, .12, 'square', .06, 90);
  else if (k === 'thud') tone(120, .2, 'sine', .12, 55);
  else if (k === 'whoosh') tone(300, .25, 'sine', .05, 1200);
  else if (k === 'garbage') tone(110, .25, 'sawtooth', .05, 60);
  else if (k === 'count') tone(440, .12, 'triangle', .07);
  else if (k === 'go') tone(880, .25, 'triangle', .09);
  else if (k === 'win'){ [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'triangle', .08, 0, i * .09)); }
  else if (k === 'lose') tone(300, .6, 'sawtooth', .06, 70);
  else if (k === 'turn') tone(660, .08, 'triangle', .05, 880);
};
// 배경음악(말랑 대전과 같은 Mixkit 무료 곡) — 16마디 이음매 없이 반복
const BGM_SRC = {
  menu:   { file: '/bbu/bgm-menu.mp3',   ls: .010, le: .010 + 64 * 60 / 130, vol: .28 },
  battle: { file: '/bbu/bgm-battle.mp3', ls: .5,   le: .5 + 32,              vol: .22 },
};
const BGM = { on: store.get('vs_bgm') !== '0', sfxOn: true, want: null, cur: null, src: null, gain: null, bufs: {}, loading: {} };
function bgmLoad(k){
  if (BGM.bufs[k]) return Promise.resolve(BGM.bufs[k]);
  if (BGM.loading[k]) return BGM.loading[k];
  const a = AC; if (!a) return Promise.resolve(null);
  return BGM.loading[k] = fetch(BGM_SRC[k].file).then(r => r.arrayBuffer()).then(ab => new Promise((res, rej) => a.decodeAudioData(ab, res, rej)))
    .then(b => (BGM.bufs[k] = b)).catch(() => { BGM.loading[k] = null; return null; });
}
function bgmStop(f = .35){
  if (!BGM.src || !AC){ BGM.src = null; BGM.cur = null; return; }
  const a = AC, s = BGM.src, g = BGM.gain;
  try { g.gain.cancelScheduledValues(a.currentTime); g.gain.setValueAtTime(g.gain.value, a.currentTime); g.gain.linearRampToValueAtTime(0, a.currentTime + f); s.stop(a.currentTime + f + .05); } catch {}
  BGM.src = null; BGM.gain = null; BGM.cur = null;
}
function bgmPlay(k){
  BGM.want = k;
  if (!BGM.on || !AC || !k){ if (!k) bgmStop(); return; }
  if (BGM.cur === k && BGM.src) return;
  bgmLoad(k).then(buf => {
    if (!buf || BGM.want !== k || !BGM.on || (BGM.cur === k && BGM.src)) return;
    bgmStop(.3);
    const a = AC, c = BGM_SRC[k], src = a.createBufferSource(), g = a.createGain();
    src.buffer = buf; src.loop = true; src.loopStart = c.ls; src.loopEnd = Math.min(c.le, buf.duration);
    g.gain.setValueAtTime(0, a.currentTime); g.gain.linearRampToValueAtTime(c.vol, a.currentTime + .8);
    src.connect(g); g.connect(a.destination); src.start(0, c.ls);
    BGM.src = src; BGM.gain = g; BGM.cur = k;
  });
}
function bgmSync(){ document.querySelectorAll('.vsBgm').forEach(b => { b.classList.toggle('off', !BGM.on); b.setAttribute('aria-label', BGM.on ? '음악 끄기' : '음악 켜기'); }); }
function bgmToggle(){ ac(); BGM.on = !BGM.on; store.set('vs_bgm', BGM.on ? '1' : '0'); bgmSync(); if (BGM.on) bgmPlay(BGM.want || 'menu'); else bgmStop(.2); }
document.addEventListener('visibilitychange', () => { if (!AC) return; if (document.visibilityState === 'hidden') AC.suspend(); else AC.resume(); });
VS.bgm = bgmPlay;

// ================= 전체 화면·화면 꺼짐 방지·진동 =================
function isFs(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function goFs(){ if (isFs()) return; const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen; if (!f) return; try { const r = f.call(d, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); } catch {} }
function toggleFs(){ if (isFs()){ const e = document.exitFullscreen || document.webkitExitFullscreen; if (e) e.call(document); } else goFs(); }
VS.goFs = goFs;
let wakeLock = null;
async function keepAwake(on){ try { if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible'){ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } else if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; } } catch { wakeLock = null; } }
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
VS.isTouch = isTouch;
VS.buzz = v => { if (!isTouch) return; try { navigator.vibrate && navigator.vibrate(v); } catch {} };
document.addEventListener('gesturestart', e => e.preventDefault());

// ================= 직접 연결(P2P) =================
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }, { urls: 'stun:global.stun.twilio.com:3478' }] };
class FakeSock {
  constructor(sendFn, closeFn){ this.h = {}; this.open = true; this._s = sendFn; this._c = closeFn; }
  on(e, f){ (this.h[e] = this.h[e] || []).push(f); }
  emit(e, ...a){ (this.h[e] || []).forEach(f => { try { f(...a); } catch (x) { console.warn(x); } }); }
  send(d){ if (this.open) this._s(d); }
  close(){ if (!this.open) return; this.open = false; try { this._c && this._c(); } catch {} this.emit('close'); }
}
const GRACE_MS = 15000;
const clean = (v, n, d) => { if (typeof v !== 'string') return d; const s = [...v].filter(ch => { const c = ch.codePointAt(0); return c >= 32 && c !== 127 && !(c >= 0x200b && c <= 0x200f) && !(c >= 0x2028 && c <= 0x202e) && !'<>&"\''.includes(ch); }).join('').trim(); return [...s].slice(0, n).join('').trim() || d; };
const rid = n => { const u = new Uint8Array(n); crypto.getRandomValues(u); return [...u].map(x => x.toString(16).padStart(2, '0')).join(''); };
// 방 서버: 방장 기기 안에서 도는 방 하나짜리 서버. 모든 게임 공통(게임 내용은 't:g' 메시지로 그대로 전달만)
function makeRoomServer(code, opts){
  const R = { code, name: clean(opts.room, 16, '한 판 붙자'), pw: /^[0-9]{4}$/.test(opts.pw || '') ? opts.pw : '', ft: Math.min(7, Math.max(1, opts.ft | 0 || 3)), opts: opts.gopts || {},
    players: [], state: 'wait', round: 0, seed: 0, first: 0, lastEnd: null, nextT: 0, waitStart: false, reported: false };
  const send = (s, o) => { if (s && s.open) s.send(JSON.stringify(o)); };
  const bcast = o => R.players.forEach(p => send(p.sock, o));
  const other = p => R.players.find(q => q !== p);
  const roomState = () => ({ t: 'room', code: R.code, name: R.name, pw: R.pw, ft: R.ft, opts: R.opts, state: R.state, round: R.round,
    players: R.players.map((p, i) => ({ id: p.id, seat: i, name: p.name, ready: p.ready, wins: p.wins, on: !!p.sock })) });
  const allOn = () => R.players.length === 2 && R.players.every(p => p.sock);
  function startRound(){
    if (!allOn()){ R.waitStart = true; return; }
    R.waitStart = false; R.state = 'play'; R.round++; R.reported = false; R.lastEnd = null;
    R.seed = (Math.random() * 2147483646 | 0) + 1; R.first = (R.round + 1) % 2;   // 라운드마다 선공을 번갈아
    bcast(roomState()); bcast({ t: 'start', seed: R.seed, first: R.first, round: R.round, opts: R.opts });
  }
  function onResult(p, m){
    if (R.state !== 'play' || m.round !== R.round || R.reported) return;
    const w = m.winner === 0 || m.winner === 1 ? m.winner : -1;
    R.reported = true;
    if (w >= 0) R.players[w] && R.players[w].wins++;
    const match = w >= 0 && R.players[w].wins >= R.ft;
    R.state = match ? 'over' : 'between';
    R.lastEnd = { t: 'roundEnd', round: R.round, winner: w, wins: R.players.map(q => q.wins), match };
    bcast(R.lastEnd); bcast(roomState());
    if (!match) R.nextT = setTimeout(() => { if (R.players.length === 2 && R.state === 'between') startRound(); }, 3200);
    else R.players.forEach(q => q.ready = false);
  }
  function leave(p, why){
    clearTimeout(p.graceT); R.players = R.players.filter(q => q !== p);
    if (p.sock){ p.sock.player = null; }
    const o = R.players[0];
    if (!o){ clearTimeout(R.nextT); R.state = 'wait'; R.round = 0; return; }
    if (R.state === 'play' || R.state === 'between'){ clearTimeout(R.nextT); send(o.sock, { t: 'forfeit', why: why || 'left' }); }
    R.state = 'wait'; R.round = 0; R.lastEnd = null; R.players.forEach(q => { q.ready = false; q.wins = 0; });
    bcast(roomState());
  }
  function attach(sock, isHost){
    sock.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      const p = sock.player;
      switch (m.t){
        case 'join': {
          if (p) return;
          if (!isHost && R.players.length === 0) return send(sock, { t: 'err', msg: '방장이 아직 방에 없어요.' });
          if (R.players.length >= 2) return send(sock, { t: 'err', msg: '이미 두 명이 있어요.' });
          if (!isHost && R.pw && m.pw !== R.pw) return send(sock, { t: 'err', msg: m.pw ? '비밀번호가 달라요.' : '비밀번호 4자리를 넣어 주세요.', need: 'pw' });
          const np = { id: rid(4), token: rid(12), name: clean(m.name, 10, '플레이어'), sock, ready: false, wins: 0 };
          R.players.push(np); sock.player = np;
          send(sock, { t: 'joined', id: np.id, token: np.token, seat: R.players.length - 1 });
          bcast(roomState());
          return;
        }
        case 'resume': {
          const q = R.players.find(x => x.token === m.token && typeof m.token === 'string');
          if (!q) return send(sock, { t: 'resumeFail' });
          clearTimeout(q.graceT);
          if (q.sock && q.sock !== sock) { q.sock.player = null; q.sock.close(); }
          q.sock = sock; sock.player = q;
          send(sock, { t: 'joined', id: q.id, token: q.token, seat: R.players.indexOf(q), resumed: true });
          bcast(roomState());
          if (R.state === 'play' && m.round !== R.round) send(sock, { t: 'start', seed: R.seed, first: R.first, round: R.round, opts: R.opts, late: true });
          if ((R.state === 'between' || R.state === 'over') && R.lastEnd && !(m.round === R.round && m.ended)) send(sock, R.lastEnd);
          const o = other(q); if (o) send(o.sock, { t: 'oppBack' });
          if (R.waitStart) startRound();
          return;
        }
        case 'leave': if (p) leave(p); return;
        case 'ready': {
          if (!p || (R.state !== 'wait' && R.state !== 'over')) return;
          if (R.state === 'over'){ R.state = 'wait'; R.round = 0; R.lastEnd = null; R.players.forEach(q => q.wins = 0); }
          p.ready = !!m.v;
          if (R.players.length === 2 && R.players.every(q => q.ready)) startRound(); else bcast(roomState());
          return;
        }
        case 'ft': if (p && R.players[0] === p && R.state === 'wait'){ R.ft = Math.min(7, Math.max(1, m.v | 0)) || R.ft; bcast(roomState()); } return;
        case 'opt': if (p && R.players[0] === p && R.state === 'wait' && typeof m.k === 'string' && m.k.length < 20){ R.opts[m.k] = m.v; bcast(roomState()); } return;
        case 'g': {
          // 게임 메시지: 지금 라운드 것만 상대에게 그대로 넘긴다(크기 제한)
          if (!p || R.state !== 'play' || m.round !== R.round) return;
          if (raw.length > 6000) return;
          const o = other(p); if (o) send(o.sock, m);
          return;
        }
        case 'result': if (p) onResult(p, m); return;
      }
    });
    sock.on('close', () => {
      const p = sock.player; if (!p || p.sock !== sock) return;
      p.sock = null; bcast(roomState());
      const o = other(p); if (o) send(o.sock, { t: 'oppAway' });
      p.graceT = setTimeout(() => { if (!p.sock && R.players.includes(p)) leave(p, 'away'); }, GRACE_MS);
    });
  }
  return { R, attach };
}

const NET = { role: null, peer: null, conn: null, srv: null, local: null, send: null, code: null };
let reconnectT = 0;
VS.NET = NET;
function netClose(){
  clearTimeout(reconnectT);
  try { NET.conn && NET.conn.close(); } catch {}
  try { NET.peer && NET.peer.destroy(); } catch {}
  Object.assign(NET, { role: null, peer: null, conn: null, srv: null, local: null, send: null, code: null });
  S.online = false;
}
function netSend(o){ if (NET.send) NET.send(JSON.stringify(o)); }
function hostWire(peer){
  peer.on('connection', conn => {
    conn.on('open', () => {
      if (!NET.srv){ try { conn.close(); } catch {} return; }
      const sock = new FakeSock(d => { try { conn.send(d); } catch {} }, () => { try { conn.close(); } catch {} });
      NET.srv.attach(sock, false);
      conn.on('data', d => sock.emit('message', typeof d === 'string' ? d : String(d)));
      conn.on('close', () => { if (sock.open){ sock.open = false; sock.emit('close'); } });
      conn.on('error', () => {});
    });
  });
  // 카톡 등에 다녀오면 중개와의 연결만 끊긴다 — 방은 그대로 두고 다시 잇는다
  peer.on('disconnected', () => { if (NET.peer === peer) setTimeout(hostRevive, 700); });
  peer.on('close', () => { if (NET.peer === peer) setTimeout(hostRevive, 700); });
  peer.on('error', e => { if (NET.peer === peer && /network|server-error|socket-error|socket-closed/.test(e.type || '')) setTimeout(hostRevive, 2000); });
}
function hostRevive(){
  if (NET.role !== 'host' || !NET.code || !NET.srv) return;
  const old = NET.peer;
  if (old && !old.destroyed && old.open) return;
  if (old && !old.destroyed && old.disconnected){ try { old.reconnect(); } catch {} return; }
  const peer = new Peer(S.prefix + NET.code, { config: ICE, debug: 0 });
  NET.peer = peer; hostWire(peer);
  peer.on('error', e => { if (NET.peer === peer && e.type === 'unavailable-id'){ try { peer.destroy(); } catch {} NET.peer = null; setTimeout(hostRevive, 3000); } });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && NET.role === 'host') hostRevive(); });
setInterval(() => { if (NET.role === 'host') hostRevive(); }, 5000);
function hostStart(opts){
  return new Promise((resolve, reject) => {
    netClose();
    let tries = 0;
    const attempt = () => {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const peer = new Peer(S.prefix + code, { config: ICE, debug: 0 });
      let opened = false;
      const to = setTimeout(() => { if (!opened){ try { peer.destroy(); } catch {} reject(new Error('timeout')); } }, 12000);
      peer.on('open', () => {
        if (opened) return;   // 재연결 때 또 오는 open — 방 서버는 한 번만
        opened = true; clearTimeout(to);
        const srv = makeRoomServer(code, opts);
        const mine = new FakeSock(d => queueMicrotask(() => { let m; try { m = JSON.parse(d); } catch { return; } onMsg(m); }));
        Object.assign(NET, { role: 'host', peer, srv, local: mine, code, send: d => queueMicrotask(() => mine.emit('message', d)) });
        srv.attach(mine, true);
        S.online = true;
        hostWire(peer);
        resolve(code);
      });
      peer.on('error', e => { if (opened) return; clearTimeout(to); try { peer.destroy(); } catch {} if (e.type === 'unavailable-id' && tries++ < 5) attempt(); else reject(e); });
    };
    attempt();
  });
}
function guestStart(code){
  return new Promise((resolve, reject) => {
    netClose();
    const peer = new Peer(undefined, { config: ICE, debug: 0 });
    let done = false;
    const fail = why => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch {} reject(new Error(why)); };
    const to = setTimeout(() => fail('timeout'), 15000);
    peer.on('open', () => {
      if (done) return;
      const conn = peer.connect(S.prefix + code, { reliable: true, serialization: 'raw' });
      conn.on('open', () => { if (done) return; done = true; clearTimeout(to); Object.assign(NET, { role: 'guest', peer, conn, code, send: d => { try { conn.send(d); } catch {} } }); S.online = true; resolve(); });
      conn.on('data', d => { let m; try { m = JSON.parse(typeof d === 'string' ? d : String(d)); } catch { return; } onMsg(m); });
      conn.on('close', () => { if (NET.conn === conn) onNetLost(); });
      conn.on('error', () => {});
    });
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'noroom' : (e.type || 'error')));
  });
}
function onNetLost(){
  S.online = false;
  if (S.resultOpen){ netClose(); S.roomCode = null; S.token = null; sess.clear(); return; }
  if (S.roomCode && S.screen === 'game') note('연결을 다시 잇는 중…');
  guestReconnect(0);
}
function guestReconnect(n){
  clearTimeout(reconnectT);
  const code = S.roomCode;
  if (!code || !S.token || n > (S.screen === 'game' ? 10 : 40)){
    if (code){ netClose(); S.roomCode = null; S.token = null; S.room = null; sess.clear(); stopGame(); overlay(null); hideNote(); show('lobby'); $('vsCode').value = code; status('lobby', '방장과 연결이 끊겼어요. 방이 남아 있으면 번호로 다시 들어가 보세요.', true); }
    return;
  }
  reconnectT = setTimeout(() => {
    guestStart(code).then(() => { netSend({ t: 'resume', token: S.token, round: S.round, ended: S.roundEnded }); hideNote(); }).catch(() => guestReconnect(n + 1));
  }, 1500);
}

// ================= 상태 =================
const S = { G: null, prefix: '', screen: 'menu', mode: null, level: 'normal', online: false, roomCode: null, token: null, room: null, myId: null, mySeat: 0,
  round: 0, roundEnded: false, resultOpen: false, live: false, cpuWins: [0, 0], cpuFt: 2, nextT: 0, countT: 0 };
VS.S = S;
const sess = {
  key: () => 'vs_sess_' + (S.G ? S.G.id : ''),
  save(){ try { sessionStorage.setItem(sess.key(), JSON.stringify({ roomCode: S.roomCode, token: S.token, role: NET.role })); } catch {} },
  clear(){ try { sessionStorage.removeItem(sess.key()); } catch {} },
  load(){ try { const v = JSON.parse(sessionStorage.getItem(sess.key()) || 'null'); if (v && v.roomCode && v.token && v.role === 'guest'){ S.roomCode = v.roomCode; S.token = v.token; } else sessionStorage.removeItem(sess.key()); } catch {} },
};
const nick = () => (($('vsNick') && $('vsNick').value.trim()) || '플레이어').slice(0, 10);

// ================= 화면 뼈대 =================
const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  bgm: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path class="w" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M16 9l6 6M22 9l-6 6"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};
function buildShell(G){
  const levels = G.levels || [{ k: 'easy', name: '쉬움', desc: '느긋하게 둬요' }, { k: 'normal', name: '보통', desc: '제법 잘 둬요' }, { k: 'hard', name: '어려움', desc: '만만치 않아요' }];
  const root = document.createElement('div'); root.id = 'vsRoot';
  root.innerHTML = `
<div id="vsBg"><div class="img"></div></div>
<div class="vsTopR" id="vsTopR"><button class="vsIc vsBgm" aria-label="음악 끄기">${ICON.bgm}</button><button class="vsIc" id="vsFs" aria-label="전체 화면">${ICON.fs}</button></div>

<section id="vsMenu" class="vsFull">
  <a class="vsBackL" href="/vs/">‹ 오락실</a>
  <canvas id="vsArt"></canvas>
  <div class="vsTitle">${esc(G.title)}</div>
  <div class="vsSub">${esc(G.sub || '')}</div>
  <div class="vsTiles">
    <div class="vsTile solo"><b>컴퓨터와 대결</b><span>2선승 · 난이도를 고르세요</span>
      <div class="vsLv">${levels.map(l => `<button data-lv="${l.k}"><b>${esc(l.name)}</b><small>${esc(l.desc)}</small></button>`).join('')}</div></div>
    <button class="vsTile duo" id="vsTileDuo"><b>친구와 대전</b><span>방 번호 4자리 · 서버 없이 바로 연결</span></button>
  </div>
  <button class="vsPill" id="vsHowBtn">규칙·조작 보기</button>
</section>

<section id="vsHow" class="vsScreen hide"><div class="vsPanel vsGuide">
  <button class="vsBack" data-go="menu">‹ 돌아가기</button>
  <h2>${esc(G.title)} 규칙</h2>${G.rules || ''}
  <h2>조작</h2>${G.controls || ''}
  <h2>친구와 대전</h2><ul><li>«친구와 대전»에서 방을 만들면 방 번호 4자리가 나옵니다. «카톡 등으로 보내기»나 «주소 복사»로 친구를 부르세요.</li><li>서버 없이 두 기기가 바로 연결됩니다. 방을 만든 사람은 경기가 끝날 때까지 이 화면을 켜 두세요.</li><li>연결이 안 되면 다른 와이파이나 데이터로 바꿔 보세요.</li></ul>
</div></section>

<section id="vsLobby" class="vsScreen hide"><div class="vsPanel">
  <button class="vsBack" data-go="menu">‹ 돌아가기</button>
  <div class="vsBrand"><h1>친구와 대전</h1><span>${esc(G.title)} · 방 번호 4자리로 1:1</span></div>
  <div class="vsInapp hide" id="vsInapp">카카오톡 안에서 열렸어요. 친구 대전은 <b>크롬·사파리</b>에서 더 잘 됩니다.<button class="vsBtn pri full" id="vsExt">크롬·사파리로 열기</button></div>
  <div class="vsMsg hide" id="vsMsg"></div>
  <label class="vsLbl" for="vsNick">닉네임</label><input id="vsNick" class="vsInp" maxlength="10" placeholder="10자 이내" autocomplete="off">
  <div class="vsTabs"><button id="vsTabJoin" class="on">방 들어가기</button><button id="vsTabMake">방 만들기</button></div>
  <div id="vsPaneJoin">
    <p class="vsHelp">친구가 만든 방의 <b>번호 4자리</b>를 넣고 입장하세요.</p>
    <label class="vsLbl" for="vsCode">방 번호</label>
    <div class="vsRow"><input id="vsCode" class="vsInp" maxlength="4" inputmode="numeric" placeholder="방 번호 4자리" autocomplete="off"><input id="vsPw" class="vsInp" maxlength="4" inputmode="numeric" placeholder="비번(있으면)" autocomplete="off"><button id="vsJoin" class="vsBtn sec">입장</button></div>
  </div>
  <div id="vsPaneMake" class="hide">
    <label class="vsLbl" for="vsRoomPw">비밀번호 (숫자 4자리, 비우면 누구나)</label><input id="vsRoomPw" class="vsInp" maxlength="4" inputmode="numeric" placeholder="예: 1234" autocomplete="off">
    <label class="vsLbl">선승 (먼저 이기면 끝)</label><div class="vsSeg" id="vsFtMake"></div>
    <button id="vsMake" class="vsBtn pri full" style="margin-top:14px">방 열기</button>
    <p class="vsHelp">방을 만든 사람의 기기가 경기를 진행합니다. 경기가 끝날 때까지 이 화면을 켜 두세요.</p>
  </div>
  <div class="vsStatus" id="vsLobbyStatus"></div>
</div></section>

<section id="vsWait" class="vsScreen hide"><div class="vsPanel">
  <div class="vsBrand"><h1>${esc(G.title)}</h1><span id="vsWaitSub"></span></div>
  <div class="vsCodeRow"><div><div class="vsCap">방 번호<span id="vsPwL"></span></div><div class="vsBig" id="vsWaitCode">----</div></div>
    <div class="vsShareBtns"><button id="vsShare" class="vsBtn pri hide">카톡 등으로 보내기</button><button id="vsCopy" class="vsBtn sec">주소 복사</button></div></div>
  <div class="vsSlots" id="vsSlots"></div>
  <label class="vsLbl">선승</label><div class="vsSeg" id="vsFtWait"></div>
  <div id="vsOptsWait"></div>
  <div class="vsStatus" id="vsWaitStatus"></div>
  <div class="vsRow" style="margin-top:10px"><button id="vsLeave" class="vsBtn sec">나가기</button><button id="vsReady" class="vsBtn pri" style="flex:1">준비</button></div>
</div></section>

<section id="vsGame" class="hide">
  <div class="vsBar top"><button class="vsIc" id="vsQuit" aria-label="나가기">${ICON.back}</button><div class="vsTurn" id="vsTurn"></div><div class="vsBarR"></div></div>
  <div id="vsStage"></div>
  <div class="vsBar bot"><div class="vsPn me" id="vsPnMe">나</div><div class="vsSc"><b id="vsWins"></b><small id="vsFtLbl"></small></div><div class="vsPn op" id="vsPnOp">상대</div></div>
  <div class="vsOv hide" id="vsOv"></div>
  <div class="vsNote hide" id="vsNote"></div>
</section>`;
  document.body.appendChild(root);
  // 버튼들
  document.querySelectorAll('.vsBgm').forEach(b => b.onclick = bgmToggle); bgmSync();
  $('vsFs').onclick = toggleFs;
  root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  $('vsHowBtn').onclick = () => show('how');
  root.querySelectorAll('.vsLv button').forEach(b => b.onclick = () => { ac(); goFs(); startCpu(b.dataset.lv); });
  $('vsTileDuo').onclick = () => { ac(); goFs(); show('lobby'); };
  $('vsNick').value = store.get('vs_nick') || store.get('ml_nick') || '';
  $('vsNick').oninput = () => store.set('vs_nick', $('vsNick').value.trim());
  for (const id of ['vsCode', 'vsPw', 'vsRoomPw']) $(id).addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); });
  $('vsTabJoin').onclick = () => { $('vsTabJoin').classList.add('on'); $('vsTabMake').classList.remove('on'); $('vsPaneJoin').classList.remove('hide'); $('vsPaneMake').classList.add('hide'); };
  $('vsTabMake').onclick = () => { $('vsTabMake').classList.add('on'); $('vsTabJoin').classList.remove('on'); $('vsPaneMake').classList.remove('hide'); $('vsPaneJoin').classList.add('hide'); setTimeout(() => { try { $('vsMake').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {} }, 60); };
  let makeFt = G.ft || 3;
  const seg = (el, cur, pick, dis) => { el.innerHTML = ''; for (const v of [1, 2, 3, 4, 5]){ const b = document.createElement('button'); b.textContent = v + '선승'; b.className = v === cur ? 'on' : ''; b.disabled = !!dis; b.onclick = () => pick(v); el.appendChild(b); } };
  VS._seg = seg;
  seg($('vsFtMake'), makeFt, function pk(v){ makeFt = v; seg($('vsFtMake'), v, pk); });
  $('vsJoin').onclick = () => { const c = $('vsCode').value.trim(); if (!/^[0-9]{4}$/.test(c)) return status('lobby', '방 번호 4자리를 넣어 주세요.', true); joinRoom(c, $('vsPw').value.trim()); };
  $('vsPw').addEventListener('keydown', e => { if (e.key === 'Enter') $('vsJoin').click(); });
  $('vsCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('vsJoin').click(); });
  $('vsMake').onclick = async () => {
    const btn = $('vsMake'); if (btn.disabled) return;
    ac(); const pw = $('vsRoomPw').value.trim();
    if (pw && !/^[0-9]{4}$/.test(pw)) return status('lobby', '비밀번호는 숫자 4자리로 넣어 주세요.', true);
    btn.disabled = true; btn.textContent = '방을 여는 중…';
    status('lobby', '방을 여는 중… 잠시만요');
    try { await hostStart({ room: nick() + '의 방', pw, ft: makeFt, gopts: Object.assign({}, G.defaultOpts || {}) }); }
    catch (e){ btn.disabled = false; btn.textContent = '방 열기'; return status('lobby', netErrMsg(e), true); }
    btn.disabled = false; btn.textContent = '방 열기';
    status('lobby', '');
    S.roomCode = 'new'; netSend({ t: 'join', name: nick() });
  };
  $('vsLeave').onclick = leaveRoom;
  $('vsReady').onclick = () => { ac(); const me = S.room && S.room.players.find(p => p.id === S.myId); netSend({ t: 'ready', v: !(me && me.ready) }); };
  if (navigator.share) $('vsShare').classList.remove('hide');
  const link = () => location.origin + location.pathname + '?room=' + (S.room ? S.room.code : '');
  $('vsShare').onclick = async () => { if (!S.room) return; try { await navigator.share({ title: G.title, text: G.title + ' 한 판 붙자! 방 번호 ' + S.room.code + (S.room.pw ? ' · 비번 ' + S.room.pw : ''), url: link() }); status('wait', '보냈어요. 이 화면으로 돌아와 기다려 주세요.'); } catch {} };
  $('vsCopy').onclick = async () => { try { await navigator.clipboard.writeText(link()); status('wait', '주소를 복사했어요. 카톡 등으로 보낸 뒤 이 화면으로 돌아와 기다려 주세요.'); } catch { status('wait', link()); } };
  $('vsQuit').onclick = () => {
    if (S.mode === 'cpu'){ stopGame(); clearTimeout(S.nextT); overlay(null); show('menu'); return; }
    if (S.live && !confirm('경기 중에 나가면 집니다. 나갈까요?')) return;
    stopGame(); overlay(null); leaveRoom();
  };
}
function leaveRoom(){
  netSend({ t: 'leave' }); setTimeout(netClose, 400);
  S.roomCode = null; S.token = null; S.room = null; sess.clear(); S.resultOpen = false; S.round = 0; stopGame(); overlay(null); hideNote(); show('lobby');
}
function status(which, t, err){
  const el = $(which === 'lobby' ? 'vsLobbyStatus' : 'vsWaitStatus'); el.textContent = t || ''; el.classList.toggle('err', !!err);
  // 폰에선 아래 글씨가 화면 밖일 수 있어 로비 안내는 위쪽 큰 칸에도 띄운다
  if (which === 'lobby'){ const m = $('vsMsg'); m.textContent = t || ''; m.classList.toggle('err', !!err); m.classList.toggle('hide', !t); }
}
function netErrMsg(e){
  const t = e && (e.type || e.message) || '';
  if (typeof Peer === 'undefined') return '연결 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 페이지를 새로 열어 주세요.';
  if (t === 'browser-incompatible') return '이 브라우저에서는 친구 대전이 안 돼요. 크롬이나 사파리로 열어 주세요.';
  if (t === 'timeout') return '연결이 너무 오래 걸려요. 와이파이나 데이터를 확인하고 다시 눌러 주세요.';
  return '연결하지 못했어요(' + t + '). 인터넷 연결을 확인하고 다시 해 보세요.';
}
function note(t, ms){ const n = $('vsNote'); n.textContent = t; n.classList.remove('hide'); clearTimeout(note._t); if (ms) note._t = setTimeout(() => n.classList.add('hide'), ms); }
function hideNote(){ $('vsNote').classList.add('hide'); }
VS.note = note;
function show(id){
  const map = { menu: 'vsMenu', how: 'vsHow', lobby: 'vsLobby', wait: 'vsWait', game: 'vsGame' };
  for (const [k, el] of Object.entries(map)) $(el).classList.toggle('hide', k !== id);
  S.screen = id;
  document.body.classList.toggle('vsInGame', id === 'game');
  keepAwake(id === 'game' || id === 'wait');
  bgmPlay(id === 'game' ? 'battle' : 'menu');
  if (id === 'game' && S.G.resize) requestAnimationFrame(() => S.G.resize());
}
function overlay(html, cls){ const ov = $('vsOv'); if (!html){ ov.classList.add('hide'); ov.innerHTML = ''; return ov; } ov.className = 'vsOv' + (cls ? ' ' + cls : ''); ov.innerHTML = html; return ov; }
function stars(a, b, ft){ const n = Math.max(1, Math.min(7, ft || 3)); return '<span class="st">' + '☆'.repeat(Math.max(0, n - a)) + '★'.repeat(Math.min(n, a)) + '</span> WIN <span class="st">' + '★'.repeat(Math.min(n, b)) + '☆'.repeat(Math.max(0, n - b)) + '</span>'; }

// ================= 경기 진행 =================
function stopGame(){ clearTimeout(S.countT); S.live = false; if (S.G && S.G.stop) try { S.G.stop(); } catch (e) { console.warn(e); } }
function beginRound(ctx, label){
  S.live = false; S.roundEnded = false; hideNote();
  show('game');
  const G = S.G;
  // 이름·전적 막대: 나는 항상 왼쪽
  const myName = S.mode === 'cpu' ? nick() : (S.room ? (S.room.players[S.mySeat] || {}).name : nick());
  const opName = S.mode === 'cpu' ? '컴퓨터' : (S.room ? (S.room.players[1 - S.mySeat] || {}).name : '상대');
  $('vsPnMe').textContent = myName || '나'; $('vsPnOp').textContent = opName || '상대';
  const w = S.mode === 'cpu' ? S.cpuWins : [(S.room.players[S.mySeat] || {}).wins || 0, (S.room.players[1 - S.mySeat] || {}).wins || 0];
  const ft = S.mode === 'cpu' ? S.cpuFt : S.room.ft;
  $('vsWins').innerHTML = stars(w[0], w[1], ft);
  $('vsFtLbl').textContent = (S.mode === 'cpu' ? levelName(S.level) + ' · ' : '') + 'First to ' + ft;
  try { G.start(Object.assign({ mode: S.mode, level: S.level, mySeat: S.mySeat, names: [myName, opName] }, ctx)); } catch (e) { console.error(e); }
  const firstName = ctx.first === S.mySeat ? '내가 먼저' : '상대가 먼저';
  const n = G.countdown ? 3 : 1;
  let left = n;
  const tick = () => {
    if (left <= 0){ overlay(null); S.live = true; VS.sfx('go'); try { G.go && G.go(); } catch (e) { console.error(e); } return; }
    overlay(`<div class="big">${G.countdown ? left : '시작'}</div><div class="msg">${esc(label)}${G.turnBased ? ' · ' + firstName : ''}</div>`);
    VS.sfx('count'); left--; S.countT = setTimeout(tick, G.countdown ? 1000 : 1100);
  };
  clearTimeout(S.countT); tick();
}
function levelName(k){ const l = (S.G.levels || []).find(x => x.k === k); return l ? l.name : ({ easy: '쉬움', normal: '보통', hard: '어려움' }[k] || k); }
// --- 컴퓨터와 대결 ---
function startCpu(lv){ S.mode = 'cpu'; S.level = lv; S.cpuWins = [0, 0]; S.round = 0; S.mySeat = 0; cpuRound(); }
function cpuRound(){
  clearTimeout(S.nextT); S.round++; S.resultOpen = false;
  const first = (S.round + 1) % 2;
  beginRound({ seed: (Math.random() * 2147483646 | 0) + 1, first, round: S.round, opts: Object.assign({}, S.G.defaultOpts || {}) }, '라운드 ' + S.round + ' · 컴퓨터(' + levelName(S.level) + ')');
}
function cpuOver(winner){
  if (S.roundEnded) return; S.roundEnded = true; stopGame();
  if (winner >= 0) S.cpuWins[winner]++;
  const meWin = winner === 0, match = winner >= 0 && S.cpuWins[winner] >= S.cpuFt;
  $('vsWins').innerHTML = stars(S.cpuWins[0], S.cpuWins[1], S.cpuFt);
  VS.sfx(winner < 0 ? 'count' : meWin ? 'win' : 'lose'); VS.buzz(meWin ? 40 : [60, 40, 120]);
  const big = winner < 0 ? '무승부' : match ? (meWin ? '최종 승리' : '최종 패배') : (meWin ? '승리' : '패배');
  const ov = overlay(`<div class="big">${big}</div><div class="msg">${S.cpuWins[0]} : ${S.cpuWins[1]}${match ? '' : ' · 곧 다음 판'}</div>${match ? '<div class="btns"><button class="vsBtn sec" id="vsOvL">메뉴로</button><button class="vsBtn pri" id="vsOvA">다시 하기</button></div>' : ''}`, winner < 0 ? '' : meWin ? 'win' : 'lose');
  if (match){ S.resultOpen = true; $('vsOvL').onclick = () => { overlay(null); show('menu'); }; $('vsOvA').onclick = () => { overlay(null); startCpu(S.level); }; }
  else S.nextT = setTimeout(() => { if (S.mode === 'cpu' && S.screen === 'game') cpuRound(); }, 2600);
}
// --- 친구와 대전 ---
async function joinRoom(code, pw){
  const jb = $('vsJoin'); if (jb.disabled) return; jb.disabled = true; jb.textContent = '연결 중…';
  try { await joinRoom2(code, pw); } finally { jb.disabled = false; jb.textContent = '입장'; }
}
async function joinRoom2(code, pw){
  ac(); status('lobby', '방장 기기에 연결하는 중…');
  let err = null;
  for (let i = 0; i < 4; i++){
    try { await guestStart(code); err = null; break; }
    catch (e){ err = e; if (e.message !== 'noroom') break; status('lobby', '방을 찾는 중… (' + (i + 1) + '/4) 방장이 화면을 켜 두었는지 확인해 주세요'); await new Promise(r => setTimeout(r, 2500)); }
  }
  if (err){ status('lobby', err.message === 'noroom' ? '그 방이 없어요. 방 번호를 확인해 주세요(방장이 화면을 켜 두어야 해요).' : (err.message === 'browser-incompatible' || typeof Peer === 'undefined' ? netErrMsg(err) : '연결하지 못했어요. 다른 와이파이나 데이터로 바꿔 다시 해 보세요.'), true); return; }
  S.roomCode = code; netSend({ t: 'join', pw: pw || '', name: nick() });
}
function onMsg(m){
  switch (m.t){
    case 'err':
      if (S.roomCode === 'new') S.roomCode = null;
      status(S.screen === 'wait' ? 'wait' : 'lobby', m.msg, true);
      if (m.need === 'pw'){ $('vsTabJoin').click(); $('vsPw').value = ''; $('vsPw').focus(); }
      if (S.screen === 'lobby'){ S.roomCode = null; if (NET.role === 'guest') netClose(); }
      break;
    case 'joined': S.myId = m.id; S.token = m.token; S.mySeat = m.seat; sess.save(); hideNote();
      if (m.resumed && S.G.lost && S.G.lost() && !S.roundEnded) netSend({ t: 'result', round: S.round, winner: 1 - S.mySeat });
      break;
    case 'resumeFail': netClose(); S.roomCode = null; S.token = null; S.room = null; sess.clear(); stopGame(); S.resultOpen = false; overlay(null); show('lobby'); status('lobby', '방에 다시 들어가지 못했어요. 번호로 다시 입장해 주세요.', true); break;
    case 'room': if (S.roomCode) onRoom(m); break;
    case 'start': if (S.roomCode){ S.mode = 'net'; S.round = m.round; S.resultOpen = false; beginRound(m, '라운드 ' + m.round); } break;
    case 'g': if (S.G.onNet && S.mode === 'net' && m.round === S.round) try { S.G.onNet(m.d); } catch (e) { console.warn(e); } break;
    case 'roundEnd': onRoundEnd(m); break;
    case 'forfeit': onForfeit(m); break;
    case 'oppAway': note('상대 연결이 끊겼어요. 15초 기다립니다.'); break;
    case 'oppBack': note('상대가 돌아왔어요.', 2000); break;
  }
}
function onRoom(m){
  S.room = m; S.roomCode = m.code; sess.save();
  const me = m.players.find(p => p.id === S.myId), op = m.players.find(p => p.id !== S.myId);
  if (me) S.mySeat = me.seat;
  if (S.screen === 'game' && S.resultOpen){ if (op && op.ready && m.state === 'wait') note('상대가 다시 하기를 눌렀어요', 2500); if (!op) note('상대가 방을 나갔어요', 2500); return; }
  if (m.state === 'wait' || (m.state === 'over' && S.screen !== 'game')){
    if (S.screen !== 'wait') show('wait');
    $('vsWaitCode').textContent = m.code; $('vsPwL').textContent = m.pw ? ' · 비번 ' + m.pw : ''; $('vsWaitSub').textContent = '친구와 대전';
    const slots = $('vsSlots'); slots.innerHTML = '';
    for (const p of [me, op]){
      const d = document.createElement('div');
      if (!p){ d.className = 'vsSlot wait'; d.innerHTML = '<b>기다리는 중</b><small>방 번호를 보내 주세요</small>'; }
      else { d.className = 'vsSlot' + (p.ready ? ' rd' : '') + (p.id === S.myId ? ' me' : ''); d.innerHTML = '<b></b><small></small>'; d.querySelector('b').textContent = p.name; d.querySelector('small').textContent = !p.on ? '연결 끊김' : p.ready ? '준비 완료' : (p.id === S.myId ? '나' : '준비 전'); }
      slots.appendChild(d);
    }
    const host = m.players[0] && m.players[0].id === S.myId;
    VS._seg($('vsFtWait'), m.ft, v => { if (host) netSend({ t: 'ft', v }); }, !host);
    // 게임별 방 설정(예: 오목 판 크기)
    const ow = $('vsOptsWait'); ow.innerHTML = '';
    for (const o of (S.G.roomOpts || [])){
      const lbl = document.createElement('label'); lbl.className = 'vsLbl'; lbl.textContent = o.label; ow.appendChild(lbl);
      const sg = document.createElement('div'); sg.className = 'vsSeg'; ow.appendChild(sg);
      for (const [v, t] of o.choices){ const b = document.createElement('button'); b.textContent = t; b.className = (m.opts && m.opts[o.k]) === v ? 'on' : ''; b.disabled = !host; b.onclick = () => netSend({ t: 'opt', k: o.k, v }); sg.appendChild(b); }
    }
    $('vsReady').textContent = me && me.ready ? '준비 취소' : '준비';
    status('wait', !op ? '친구에게 방 번호를 보낸 뒤 이 화면으로 돌아와 기다려 주세요. 방은 그대로 유지돼요.' : (me && me.ready) ? '상대가 준비하면 시작합니다.' : '둘 다 준비하면 시작합니다.');
  }
}
function onRoundEnd(m){
  if (m.round !== S.round || S.roundEnded) return;
  S.roundEnded = true; S.resultOpen = !!m.match; stopGame();
  const meWin = m.winner === S.mySeat, draw = m.winner < 0;
  const a = m.wins[S.mySeat] || 0, b = m.wins[1 - S.mySeat] || 0;
  $('vsWins').innerHTML = stars(a, b, S.room ? S.room.ft : 3);
  VS.sfx(draw ? 'count' : meWin ? 'win' : 'lose'); VS.buzz(meWin ? 40 : [60, 40, 120]);
  if (S.G.result) try { S.G.result(m.winner); } catch {}
  const big = draw ? '무승부' : m.match ? (meWin ? '최종 승리' : '최종 패배') : (meWin ? '승리' : '패배');
  overlay(`<div class="big">${big}</div><div class="msg">${a} : ${b}${m.match ? '' : ' · 곧 다음 판'}</div>${m.match ? '<div class="btns"><button class="vsBtn sec" id="vsOvL">나가기</button><button class="vsBtn pri" id="vsOvA">다시 하기</button></div>' : ''}`, draw ? '' : meWin ? 'win' : 'lose');
  if (m.match){ $('vsOvL').onclick = () => leaveRoom(); $('vsOvA').onclick = () => { S.resultOpen = false; overlay(null); show('wait'); onRoom(S.room); netSend({ t: 'ready', v: true }); }; }
}
function onForfeit(m){
  stopGame(); S.resultOpen = true; S.roundEnded = true;
  overlay(`<div class="big">승리</div><div class="msg">${m.why === 'away' ? '상대 연결이 끊겨 경기를 끝냈어요.' : '상대가 나갔어요.'}</div><div class="btns"><button class="vsBtn sec" id="vsOvL">나가기</button><button class="vsBtn pri" id="vsOvW">대기실로</button></div>`, 'win');
  $('vsOvL').onclick = () => leaveRoom();
  $('vsOvW').onclick = () => { S.resultOpen = false; overlay(null); if (!S.roomCode){ show('lobby'); status('lobby', '방장이 방을 닫았어요. 새 방을 만들거나 다른 방에 들어가세요.'); return; } show('wait'); if (S.room) onRoom(S.room); };
  hideNote();
}

// ================= 게임 쪽에 주는 함수 =================
// 게임 → 상대에게 보내기(컴퓨터 모드에선 아무 일도 안 함)
VS.send = d => { if (S.mode === 'net' && S.live !== null) netSend({ t: 'g', round: S.round, d }); };
// 게임 → 판이 끝났다. winner = 이긴 자리(0/1), 무승부는 -1
VS.over = winner => {
  if (S.mode === 'cpu') return cpuOver(winner);
  if (S.roundEnded) return;
  S.live = false;
  netSend({ t: 'result', round: S.round, winner });
};
VS.live = () => S.live && (S.mode === 'cpu' || S.online);   // 실시간 게임은 이게 false면 멈춘다(연결 끊김·카운트다운)
VS.setTurn = t => { $('vsTurn').innerHTML = t || ''; };

// ================= 시작 =================
/* 게임 규약 — VS.init(G)
   G.id          : 영문 짧은 이름(피어 이름·저장 키)
   G.title, G.sub: 제목, 한 줄 설명
   G.rules, G.controls: 규칙·조작 HTML
   G.levels      : [{k,name,desc}] (기본 쉬움/보통/어려움)
   G.turnBased   : 차례 게임이면 true(시작 문구에 선공 표시), G.countdown: 실시간이면 true(3·2·1)
   G.ft          : 친구 대전 기본 선승, G.defaultOpts / G.roomOpts: 방 설정
   G.mount(stage): 무대(div)에 캔버스 등을 만든다(한 번)
   G.start(ctx)  : 판 준비. ctx = {mode:'cpu'|'net', level, mySeat(0|1), first(선공 자리), seed, round, opts, names}
                   컴퓨터 모드에서 나는 자리 0, 컴퓨터는 자리 1.
   G.go()        : 카운트다운이 끝나 실제로 시작
   G.onNet(d)    : 상대가 VS.send(d)로 보낸 것
   G.stop()      : 판 멈춤(결과·나가기), G.resize(): 화면 크기 바뀜
   G.lost()      : (선택) 내가 이미 진 상태인지 — 재연결 때 결과를 다시 보냄
   G.drawArt(ctx2d, w, h, t): (선택) 메뉴 화면 위쪽 그림 */
VS.init = function(G){
  S.G = G; S.prefix = 'kimjuvs-' + G.id + '-'; S.cpuFt = G.cpuFt || 2;
  document.title = G.title + ' — 1:1 오락실';
  buildShell(G);
  G.mount($('vsStage'));
  addEventListener('resize', () => { if (S.screen === 'game' && G.resize) G.resize(); });
  // 배경
  const pick = () => innerHeight > innerWidth ? '/vs/common/bg-tall.jpg' : '/vs/common/bg-wide.jpg';
  let cur = ''; const setBg = () => { const u = pick(); if (u === cur) return; cur = u; const im = new Image(); im.onload = () => { document.querySelector('#vsBg .img').style.backgroundImage = `url(${u})`; }; im.src = u; };
  setBg(); addEventListener('resize', setBg);
  // 메뉴 그림
  const art = $('vsArt');
  const loop = t => { if (S.screen === 'menu' && G.drawArt && art.clientWidth){ const w = art.clientWidth, h = art.clientHeight, d = Math.min(devicePixelRatio || 1, 2); if (art.width !== Math.round(w * d)){ art.width = Math.round(w * d); art.height = Math.round(h * d); } const x = art.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h); try { G.drawArt(x, w, h, t); } catch {} } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  if (/KAKAOTALK/i.test(navigator.userAgent)){ $('vsInapp').classList.remove('hide'); $('vsExt').onclick = () => { location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href); }; }
  // 첫 터치에 소리 켜기
  addEventListener('pointerdown', () => { ac(); if (!BGM.cur) bgmPlay(S.screen === 'game' ? 'battle' : 'menu'); }, { once: true });
  // 친구 주소(?room=)·새로고침 복귀
  sess.load();
  const q = new URLSearchParams(location.search).get('room');
  if (q && !S.roomCode){ show('lobby'); $('vsCode').value = q.replace(/[^0-9]/g, '').slice(0, 4); status('lobby', '친구가 보낸 방이에요. 닉네임을 적고 «입장»을 누르세요.'); }
  else if (S.roomCode && S.token){
    const code = S.roomCode; show('lobby'); status('lobby', '방에 다시 연결하는 중…');
    guestStart(code).then(() => netSend({ t: 'resume', token: S.token, round: S.round, ended: S.roundEnded }))
      .catch(() => { S.roomCode = null; S.token = null; sess.clear(); status('lobby', '방에 다시 들어가지 못했어요. 번호로 다시 입장해 주세요.', true); $('vsCode').value = code; });
  } else show('menu');
};
})();
