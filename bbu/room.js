// 말랑 대전 방 서버 — 방장 브라우저 안에서 돈다(서버 없이 1:1 직접 연결용)
// 원본: class-arcade/puyo-server.js 를 그대로 감싼 것. 수정은 원본에서 하고 이 파일은 다시 만든다(scratchpad mkroom.js).
(function(){
  const CRYPTO = {
    randomInt(a, b){ if (b === undefined){ b = a; a = 0; } const u = new Uint32Array(1); window.crypto.getRandomValues(u); return a + (u[0] % (b - a)); },
    randomBytes(n){ const u = new Uint8Array(n); window.crypto.getRandomValues(u); return { toString(){ return [...u].map(x => x.toString(16).padStart(2, '0')).join(''); } }; },
  };
  const module = { exports: null };
  const require = (name) => name === 'crypto' ? CRYPTO : {};

// 말랑 대전(뿌요뿌요식 1:1) 서버 — 방 목록·입장·준비·라운드 시작/판정·공격 중계만 맡는다.
// 판은 각자 브라우저가 돌리고(같은 시드로 같은 뿌요 순서), 서버는 상대 판 모습과 방해뿌요 수만 넘겨준다.
// 아케이드 방(wss)과 완전히 따로 논다 — 경로 /mallang-7xq4/ws, 방 목록도 따로.
const crypto = CRYPTO;

const MAX_ROOMS = 60, GRACE_MS = 15000, MSG_LIMIT = 50;
const IP_CONN_MAX = 8;              // 한 IP에서 동시에 붙을 수 있는 연결 수(학교는 NAT라 넉넉히)
const PW_FAIL_MAX = 8, PW_FAIL_WIN = 60000; // 비밀번호 틀림: IP당 1분 8번
const ATK_MSG_MAX = 720, ATK_ROUND_MAX = 6000; // 방해뿌요 한 번·한 라운드 상한(말이 안 되는 값 차단)

module.exports = function createPuyoServer(WebSocketServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const rooms = new Map();
  const lobby = new Set();
  const ipConn = new Map(), pwFail = new Map();

  // 판 모습(s)만 버퍼가 밀리면 버린다. 상태 전이 메시지는 항상 보낸다
  const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const sendSnap = (ws, o) => { if (ws && ws.readyState === 1 && ws.bufferedAmount < 131072) ws.send(JSON.stringify(o)); };
  const okCh = (c) => c >= 32 && c !== 127 && !(c >= 0x200b && c <= 0x200f) && !(c >= 0x2028 && c <= 0x202e) && !"<>&\"'".includes(String.fromCharCode(c));
  // 글자 단위(이모지 포함)로 걸러서 자른다
  const clean = (v, n, d) => {
    if (typeof v !== "string") return d;
    const s = [...v].filter(ch => okCh(ch.codePointAt(0))).join("").trim();
    return [...s].slice(0, n).join("").trim() || d;
  };
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi ? v : null;
  const newCode = () => { if (globalThis.__ML_CODE && !rooms.has(globalThis.__ML_CODE)) return globalThis.__ML_CODE; let c; do { c = String(crypto.randomInt(1000, 10000)); } while (rooms.has(c)); return c; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ipOf = (req) => String((req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?");

  const listRooms = () => [...rooms.values()].map(r => ({
    code: r.code, name: r.name, ft: r.ft, n: r.players.length, state: r.state, lock: !!r.pw,
    host: r.players[0] ? r.players[0].name : "",
  }));
  let lobbyTimer = null;
  function pushLobby() {
    if (lobbyTimer) return;
    lobbyTimer = setTimeout(() => {
      lobbyTimer = null;
      const s = JSON.stringify({ t: "rooms", list: listRooms() });
      for (const ws of lobby) if (ws.readyState === 1) ws.send(s);
    }, 150);
  }
  function roomState(r) {
    return { t: "room", code: r.code, name: r.name, ft: r.ft, qd: !!r.qd, pw: r.pw || "", state: r.state, round: r.round,
      players: r.players.map(p => ({ id: p.id, name: p.name, ready: p.ready, wins: p.wins, on: !!p.ws })) };
  }
  const bcast = (r, o) => { for (const p of r.players) send(p.ws, o); };
  const other = (r, p) => r.players.find(q => q !== p);
  const allOn = (r) => r.players.length === 2 && r.players.every(q => q.ws);

  function leave(r, p, why) {
    clearTimeout(p.graceT);
    r.players = r.players.filter(q => q !== p);
    if (p.ws) { p.ws.room = null; p.ws.player = null; }
    const o = r.players[0];
    if (!o) { clearTimeout(r.nextT); rooms.delete(r.code); pushLobby(); return; }
    if (r.state === "play" || r.state === "between") {
      // 경기 중에 나가면 남은 사람이 그 경기를 이긴 것으로 끝낸다
      clearTimeout(r.nextT);
      send(o.ws, { t: "forfeit", why: why || "left" });
    }
    r.state = "wait"; r.round = 0; r.waitStart = false; r.lastEnd = null;
    for (const q of r.players) { q.ready = false; q.wins = 0; }
    bcast(r, roomState(r));
    pushLobby();
  }

  // 둘 다 접속해 있어야 라운드를 연다. 한쪽이 끊겨 있으면 돌아올 때(resume) 연다
  function tryStart(r) {
    if (!allOn(r)) { r.waitStart = true; return; }
    r.waitStart = false; startRound(r);
  }
  function startRound(r) {
    r.state = "play"; r.round++; r.lastEnd = null;
    r.seed = crypto.randomInt(1, 2147483647);
    r.colors = shuffle([0, 1, 2, 3, 4]).slice(0, 4);
    for (const p of r.players) { p.dead = false; p.snap = null; p.atkSum = 0; p.missAtk = 0; p.missDone = false; }
    bcast(r, roomState(r));
    bcast(r, { t: "start", seed: r.seed, colors: r.colors, round: r.round, qd: !!r.qd, at: 3000 });
    pushLobby();
  }

  function onDead(r, p) {
    if (r.state !== "play" || p.dead) return;
    p.dead = true;
    const w = other(r, p);
    if (!w) return;
    w.wins++;
    const match = w.wins >= r.ft;
    r.state = match ? "over" : "between";
    r.lastEnd = { t: "roundEnd", round: r.round, winner: w.id, loser: p.id, wins: r.players.map(q => [q.id, q.wins]), match };
    bcast(r, r.lastEnd);
    bcast(r, roomState(r));
    if (!match) r.nextT = setTimeout(() => { if (r.players.length === 2 && r.state === "between") tryStart(r); }, 3500);
    else { for (const q of r.players) q.ready = false; pushLobby(); }
  }

  wss.on("error", (e) => console.error("[puyo wss 오류]", e.message));
  wss.on("connection", (ws, req) => {
    ws.on("error", () => {});
    const ip = req ? ipOf(req) : "?";
    const nConn = (ipConn.get(ip) || 0) + 1;
    if (nConn > IP_CONN_MAX) { try { ws.close(1013, "too many"); } catch {} return; }
    ipConn.set(ip, nConn);
    ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; });
    ws.cnt = 0; ws.win = Date.now();
    lobby.add(ws);
    send(ws, { t: "rooms", list: listRooms() });

    ws.on("message", (raw) => {
      try {
        const now = Date.now();
        if (now - ws.win > 1000) { ws.win = now; ws.cnt = 0; }
        if (++ws.cnt > MSG_LIMIT) return;
        let m; try { m = JSON.parse(raw); } catch { return; }
        if (!m || typeof m !== "object") return;
        const r = ws.room, p = ws.player;
        // 경기 메시지는 지금 라운드 것만 받는다(늦게 도착한 지난 라운드 메시지가 섞이지 않게)
        const cur = r && r.state === "play" && m.round === r.round;

        switch (m.t) {
          case "create": {
            if (r) return;
            if (rooms.size >= MAX_ROOMS) return send(ws, { t: "err", msg: "방이 너무 많아요. 잠시 후 다시 해 주세요." });
            const code = newCode();
            const room = { code, name: clean(m.room, 16, "한 판 붙자"), ft: int(m.ft, 1, 7) || 3, qd: false, players: [], state: "wait", round: 0,
              pw: typeof m.pw === "string" && /^[0-9]{4}$/.test(m.pw) ? m.pw : "" };
            rooms.set(code, room);
            join(ws, room, m);
            return;
          }
          case "join": {
            if (r) return;
            const room = rooms.get(clean(m.code, 4, ""));
            if (!room) return send(ws, { t: "err", msg: "그 방이 없어요. 방 번호를 확인해 주세요." });
            if (room.players.length >= 2) return send(ws, { t: "err", msg: "이미 두 명이 있어요." });
            if (room.pw && m.pw !== room.pw) {
              const f = (pwFail.get(ip) || []).filter(t => now - t < PW_FAIL_WIN);
              if (f.length >= PW_FAIL_MAX) return send(ws, { t: "err", msg: "비밀번호를 너무 많이 틀렸어요. 1분 뒤에 다시 해 주세요." });
              if (m.pw) { f.push(now); pwFail.set(ip, f); }
              return send(ws, { t: "err", msg: m.pw ? "비밀번호가 달라요." : "비밀번호 4자리를 넣어 주세요.", need: "pw", code: room.code });
            }
            join(ws, room, m);
            return;
          }
          case "resume": {
            // 잠깐 끊겼다 다시 붙은 경우 — 같은 토큰이면 자리를 돌려준다
            if (r) return;
            const room = rooms.get(clean(m.code, 4, ""));
            const q = room && typeof m.token === "string" && room.players.find(x => x.token === m.token);
            if (!q) return send(ws, { t: "resumeFail", code: room ? room.code : "" });
            clearTimeout(q.graceT);
            if (q.ws && q.ws !== ws) { try { q.ws.room = null; q.ws.player = null; q.ws.close(); } catch {} }
            q.ws = ws; ws.room = room; ws.player = q; lobby.delete(ws);
            send(ws, { t: "joined", id: q.id, token: q.token, resumed: true });
            bcast(room, roomState(room));
            const o = other(room, q);
            if (room.state === "play" && m.round !== room.round) {
              // 끊긴 사이 라운드가 시작됐다 → 시작 신호를 다시 준다
              send(ws, { t: "start", seed: room.seed, colors: room.colors, round: room.round, qd: !!room.qd, at: 1500 });
            } else if (room.state === "play" && (q.missAtk || q.missDone)) {
              // 끊긴 사이 온 방해뿌요를 한 번에 넘긴다
              send(ws, { t: "atk", n: q.missAtk, done: true, ch: 0, round: room.round });
            }
            if ((room.state === "between" || room.state === "over") && room.lastEnd && !(m.round === room.round && m.ended)) send(ws, room.lastEnd);
            q.missAtk = 0; q.missDone = false;
            if (o && o.snap && room.state === "play") sendSnap(ws, o.snap);
            if (o) send(o.ws, { t: "oppBack" });
            if (room.waitStart) tryStart(room);
            return;
          }
          case "leave": if (r) { leave(r, p); lobby.add(ws); send(ws, { t: "rooms", list: listRooms() }); } return;
          case "ready": {
            if (!r || (r.state !== "wait" && r.state !== "over")) return;
            if (r.state === "over") { r.state = "wait"; r.round = 0; r.lastEnd = null; for (const q of r.players) q.wins = 0; }
            p.ready = !!m.v;
            if (r.players.length === 2 && r.players.every(q => q.ready)) tryStart(r);
            bcast(r, roomState(r));
            return;
          }
          case "qd": {
            if (!r || r.players[0] !== p || r.state !== "wait") return;
            r.qd = !!m.v; bcast(r, roomState(r));
            return;
          }
          case "ft": {
            if (!r || r.players[0] !== p || r.state !== "wait") return;
            r.ft = int(m.v, 1, 7) || r.ft; bcast(r, roomState(r)); pushLobby();
            return;
          }
          case "s": {
            // 내 판 모습 → 상대에게. 모양·범위를 칸별로 검사한다
            if (!cur) return;
            if (typeof m.f !== "string" || m.f.length !== 78 || !/^[.RGBYPOrgbypo]+$/.test(m.f)) return;
            const a = Array.isArray(m.a) && m.a.length === 5 && int(m.a[0], 0, 5) !== null && int(m.a[1], 0, 27) !== null
              && int(m.a[2], 0, 3) !== null && int(m.a[3], 0, 4) !== null && int(m.a[4], 0, 4) !== null ? m.a : null;
            const snap = { t: "s", f: m.f, a,
              sc: int(m.sc, 0, 99999999) || 0, p: int(m.p, 0, 99999) || 0, ch: int(m.ch, 0, 40) || 0,
              n: Array.isArray(m.n) && m.n.length === 4 && m.n.every(v => int(v, 0, 4) !== null) ? m.n : [],
              k: Array.isArray(m.k) && m.k.length === 2 && int(m.k[0], 40, 9990) !== null && int(m.k[1], 1, 999) !== null ? m.k : null };
            p.snap = snap;
            const o = other(r, p); if (o) sendSnap(o.ws, snap);
            return;
          }
          case "atk": {
            // 방해뿌요 전송. done=연쇄 끝(이때 상대 쪽 예고가 확정되어 떨어질 수 있게 된다)
            if (!cur || p.dead) return;
            let n = int(m.n, 0, ATK_MSG_MAX); if (n === null) return;
            n = Math.min(n, Math.max(0, ATK_ROUND_MAX - (p.atkSum || 0))); p.atkSum = (p.atkSum || 0) + n;
            const o = other(r, p); if (!o) return;
            if (o.ws) send(o.ws, { t: "atk", n, done: !!m.done, ch: int(m.ch, 0, 40) || 0, round: r.round });
            else { o.missAtk = (o.missAtk || 0) + n; if (m.done) o.missDone = true; } // 끊긴 쪽은 모아 두었다가 돌아오면 넘긴다
            return;
          }
          case "dead": if (cur) onDead(r, p); return;
        }
      } catch (e) { console.error("[puyo 메시지 오류]", e && e.stack || e); }
    });

    ws.on("close", () => {
      const c = (ipConn.get(ip) || 1) - 1; if (c > 0) ipConn.set(ip, c); else ipConn.delete(ip);
      lobby.delete(ws);
      const r = ws.room, p = ws.player;
      if (!r || !p || p.ws !== ws) return;
      p.ws = null;
      bcast(r, roomState(r));
      const o = other(r, p); if (o) send(o.ws, { t: "oppAway" });
      p.graceT = setTimeout(() => { if (!p.ws && rooms.get(r.code) === r && r.players.includes(p)) leave(r, p, "away"); }, GRACE_MS);
    });
  });

  function join(ws, room, m) {
    const p = { id: crypto.randomBytes(4).toString("hex"), token: crypto.randomBytes(12).toString("hex"),
      name: clean(m.name, 10, "플레이어"), ws, ready: false, wins: 0 };
    room.players.push(p);
    ws.room = room; ws.player = p; lobby.delete(ws);
    send(ws, { t: "joined", id: p.id, token: p.token });
    bcast(room, roomState(room));
    pushLobby();
  }

  // 죽은 연결 정리(반쯤 끊긴 소켓을 빨리 알아채도록 10초)
  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
      ws.isAlive = false; try { ws.ping(); } catch {}
    }
    const now = Date.now();
    for (const [k, v] of pwFail) if (!v.some(t => now - t < PW_FAIL_WIN)) pwFail.delete(k);
  }, 10000);
  hb.unref && hb.unref();

  return wss;
};

  window.createPuyoServer = module.exports;
})();
