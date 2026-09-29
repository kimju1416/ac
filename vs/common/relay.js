/* =====================================================================
   1:1 중계(예비 길) — 직접 연결(WebRTC)이 막힌 곳(학교·회사 방화벽, 일부 LTE·5G)을 위한 것.
   Supabase 실시간 방송 채널을 우체통처럼 써서 방장↔손님 메시지를 대신 전달한다.
   - 평소엔 직접 연결이 먼저다. 이 길은 직접 연결이 안 될 때만 쓴다(방장은 창구만 열어 둔다).
   - 무료 한도(초당 100건)를 아끼려고 보낼 것을 0.1초씩 묶어 한 번에 보낸다.
   - 공개 키(anon)는 원래 웹에 공개하는 키다(kimju.kr/ops와 같은 프로젝트). 표는 안 쓰고 방송만 쓴다.
   쓰는 곳: vs/common/vs.js(1:1 오락실 전체), bbu/index.html(말랑 대전)
   ===================================================================== */
(function(){
'use strict';
const SB_URL = 'https://mkntbkvzxofggauxmyde.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbnRia3Z6eG9mZ2dhdXhteWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MTg3OTIsImV4cCI6MjEwMDM5NDc5Mn0.kr7d9CXyMebCShd9hzv87X80W71yG2Az9tstQDYhdWU';
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
const FLUSH_MS = 100, HB_MS = 4000, DEAD_MS = 14000;
let client = null, libP = null;
const rid = () => Math.random().toString(36).slice(2, 10);

function lib(){
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  if (libP) return libP;
  return libP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = LIB; s.async = true;
    s.onload = () => res(); s.onerror = () => { libP = null; rej(new Error('relay-lib')); };
    document.head.appendChild(s);
  });
}
async function sb(){ await lib(); if (!client) client = window.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 20 } } }); return client; }

// 채널 하나를 열고, 보낼 것을 묶어 보내는 통로를 만든다
async function openChannel(name, ms){
  const c = (await sb()).channel('kimjuvs-relay-' + name, { config: { broadcast: { self: false, ack: false } } });
  const handlers = [];
  c.on('broadcast', { event: 'b' }, p => { const list = p && p.payload && p.payload.l; if (Array.isArray(list)) for (const m of list) handlers.forEach(h => { try { h(m); } catch (e) { console.warn(e); } }); });
  const st = await new Promise(res => {
    const to = setTimeout(() => res('TIMED_OUT'), ms || 10000);
    c.subscribe(s => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED'){ clearTimeout(to); res(s); } });
  });
  if (st !== 'SUBSCRIBED'){ try { (await sb()).removeChannel(c); } catch {} throw new Error('relay-' + st.toLowerCase()); }
  let q = [], t = 0, closed = false;
  const flush = () => { t = 0; if (!q.length || closed) return; const l = q; q = []; c.send({ type: 'broadcast', event: 'b', payload: { l } }).catch(() => {}); };
  return {
    post(m){ if (closed) return; q.push(m); if (!t) t = setTimeout(flush, FLUSH_MS); },
    now(m){ if (closed) return; q.push(m); clearTimeout(t); flush(); },
    on(h){ handlers.push(h); },
    async close(){ if (closed) return; flush(); closed = true; clearTimeout(t); try { (await sb()).removeChannel(c); } catch {} },
  };
}

// 연결 한 개(방장 쪽 손님 하나 / 손님 쪽 방장)를 PeerJS DataConnection 비슷하게 흉내 낸다
function makeConn(sendFn, closeFn){
  const conn = { open: true, _d: [], _c: [], relay: true,
    on(e, f){ if (e === 'data') conn._d.push(f); else if (e === 'close') conn._c.push(f); },
    send(d){ if (conn.open) sendFn(d); },
    close(){ if (!conn.open) return; conn.open = false; try { closeFn(); } catch {} conn._c.forEach(f => { try { f(); } catch {} }); },
    _data(d){ if (conn.open) conn._d.forEach(f => { try { f(d); } catch (e) { console.warn(e); } }); },
    _drop(){ if (!conn.open) return; conn.open = false; conn._c.forEach(f => { try { f(); } catch {} }); },
  };
  return conn;
}

// 방장: 창구를 열어 두고, 손님이 오면 onConn(conn)
async function host(key, onConn){
  const ch = await openChannel(key);
  const guests = new Map();   // cid → {conn, seen}
  ch.on(m => {
    if (!m || m.to !== 'host' || typeof m.from !== 'string') return;
    let g = guests.get(m.from);
    if (m.k === 'hello'){
      if (!g){
        const cid = m.from;
        const conn = makeConn(d => ch.post({ k: 'd', to: cid, d }), () => { ch.now({ k: 'bye', to: cid }); guests.delete(cid); });
        g = { conn, seen: Date.now() }; guests.set(cid, g);
        ch.now({ k: 'welcome', to: cid });
        onConn(conn);
      } else ch.now({ k: 'welcome', to: m.from });
      return;
    }
    if (!g) { if (m.k !== 'bye') ch.now({ k: 'gone', to: m.from }); return; }   // 방장이 새로 열린 뒤 옛 손님
    g.seen = Date.now();
    if (m.k === 'd') g.conn._data(m.d);
    else if (m.k === 'bye'){ guests.delete(m.from); g.conn._drop(); }
  });
  const hb = setInterval(() => {
    const now = Date.now();
    for (const [cid, g] of guests){ if (now - g.seen > DEAD_MS){ guests.delete(cid); g.conn._drop(); } }
    if (guests.size) ch.post({ k: 'hb', to: '*' });
  }, HB_MS);
  return { close(){ clearInterval(hb); for (const g of guests.values()) g.conn.close(); guests.clear(); ch.close(); } };
}

// 손님: 방장 창구에 인사하고, 답이 오면 연결 성공
async function connect(key, ms){
  // 채널 여는 시간(느린 폰·학교망은 3초를 넘기도 한다)과 방장을 찾는 시간(ms)을 따로 잡는다
  const ch = await openChannel(key, 10000);
  const cid = rid();
  return new Promise((resolve, reject) => {
    let conn = null, seen = Date.now(), hb = 0, poke = 0;
    const done = setTimeout(() => { if (!conn){ clearInterval(poke); ch.close(); reject(new Error('noroom')); } }, ms || 6000);
    ch.on(m => {
      if (!m || (m.to !== cid && m.to !== '*')) return;
      seen = Date.now();
      if (m.k === 'welcome' && !conn){
        clearTimeout(done); clearInterval(poke);
        conn = makeConn(d => ch.post({ k: 'd', to: 'host', from: cid, d }), () => { clearInterval(hb); ch.now({ k: 'bye', to: 'host', from: cid }); setTimeout(() => ch.close(), 300); });
        hb = setInterval(() => {
          if (Date.now() - seen > DEAD_MS){ clearInterval(hb); ch.close(); conn._drop(); return; }
          ch.post({ k: 'hb', to: 'host', from: cid });
        }, HB_MS);
        resolve(conn);
      } else if (conn && m.k === 'd') conn._data(m.d);
      else if (conn && (m.k === 'bye' || m.k === 'gone')){ clearInterval(hb); ch.close(); conn._drop(); }
    });
    const hello = () => ch.now({ k: 'hello', to: 'host', from: cid });
    hello(); poke = setInterval(hello, 1200);
  });
}

// 그 번호에 이미 방장이 있는가(중계만으로 방을 열 때 번호가 겹치지 않게)
async function taken(key){
  try { const c = await connect(key, 1800); c.close(); return true; } catch { return false; }
}

window.VSRelay = { host, connect, taken, available: () => lib().then(() => true, () => false) };
})();
