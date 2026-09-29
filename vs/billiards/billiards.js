// =====================================================================
// 1:1 오락실 공용 당구 엔진 (4구 · 포켓볼이 같이 쓴다)
// - 3D 무대(Three.js), 공 물리(미끄러짐·굴림·당점·쿠션), 큐 조작, 컴퓨터, 친구 대전 동기화
// - 게임(html)은 규칙 객체(RULE)만 넘긴다: start(RULE)
// 좌표: 미터. x = 당구대 긴 쪽(헤드 쪽이 -), z = 짧은 쪽, y = 위. 당구대 가운데가 원점, 천 표면이 y = 0.
// 동기화: 차례제. 친 사람이 {k:'shot'}을 보내면 양쪽이 같은 계산을 돌리고,
//         멈춘 뒤 친 사람이 {k:'rest'}로 최종 위치와 기록을 보낸다. 받는 쪽은 그 값으로 맞춘 뒤에만 판정한다.
// =====================================================================
import * as THREE from 'three';
const VS = window.VS;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------- 물리 상수 ----------
const GRAV = 9.81;
const PH = {
  mus: 0.2,       // 미끄러질 때 천 마찰
  mur: 0.016,     // 굴림 저항
  drag: 0.12,     // 속도에 비례하는 저항(천 결·공기) 1/s
  spin: 14,       // 옆회전이 천에서 줄어드는 빠르기 rad/s²
  eBall: 0.95,    // 공끼리 반발
  eCush: 0.75,    // 쿠션 반발
  muC: 0.2,       // 쿠션 마찰(옆회전이 반사각을 바꾼다)
  jumpV: 6.6,     // 쿠션에 이보다 세게 수직으로 부딪히면 당구대 밖으로 튄다
};
const DT = 1 / 240;                // 고정 간격
const VMAX = 7.0;                  // 가장 센 샷(m/s)
const TURN_SEC = 40;               // 한 차례 제한 시간
const powV = p => VMAX * Math.pow(clamp(p, 0, 1), 1.4);
const fast = () => !!window.__blFast;
const tScale = () => fast() ? 6 : 1;            // 시험용 빨리 감기(기본은 1)

// =====================================================================
// 당구대 모양(쿠션 선분·포켓)
// =====================================================================
function makeTable(T){
  const L = T.L, W = T.W, R = T.R, hx = L / 2, hz = W / 2;
  const tb = { L, W, R, hx, hz, segs: [], pockets: [], pool: !!T.pockets };
  const seg = (ax, az, bx, bz, k) => { const dx = bx - ax, dz = bz - az; tb.segs.push({ ax, az, bx, bz, dx, dz, l2: dx * dx + dz * dz, k: k || 'rail' }); };
  if (!T.pockets){
    seg(-hx, -hz, hx, -hz); seg(hx, -hz, hx, hz); seg(hx, hz, -hx, hz); seg(-hx, hz, -hx, -hz);
    return tb;
  }
  // 포켓볼(WPA 규격에 가깝게): 코너 입구 약 11.6cm(턱 각 142°), 사이드 입구 약 13cm(턱 각 104°)
  const c = 0.116 / Math.SQRT2, s = 0.065;
  const cf = [Math.cos(38 * Math.PI / 180), Math.sin(38 * Math.PI / 180)];
  const sf = [Math.cos(104 * Math.PI / 180), Math.sin(104 * Math.PI / 180)];
  const FL = 0.07, SL = 0.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]){
    // 긴 쿠션 (코너 턱 ~ 사이드 턱)
    seg(sx * (hx - c), sz * hz, sx * s, sz * hz);
    // 코너 턱 두 개(긴 쪽·짧은 쪽)
    seg(sx * (hx - c), sz * hz, sx * (hx - c + cf[0] * FL), sz * (hz + cf[1] * FL), 'jaw');
    seg(sx * hx, sz * (hz - c), sx * (hx + cf[1] * FL), sz * (hz - c + cf[0] * FL), 'jaw');
    // 사이드 턱
    seg(sx * s, sz * hz, sx * (s + sf[0] * SL), sz * (hz + sf[1] * SL), 'jaw');
    // 코너 포켓
    tb.pockets.push({ mx: sx * (hx - c / 2), mz: sz * (hz - c / 2), nx: sx * Math.SQRT1_2, nz: sz * Math.SQRT1_2, d: 0.045, cx: sx * (hx + 0.022), cz: sz * (hz + 0.022), r: 0.066, corner: true, ang: Math.atan2(sz, sx) });
  }
  for (const sx of [-1, 1]) seg(sx * hx, -(hz - c), sx * hx, hz - c);   // 짧은 쿠션
  for (const sz of [-1, 1]) tb.pockets.push({ mx: 0, mz: sz * hz, nx: 0, nz: sz, d: 0.4 * R, cx: 0, cz: sz * (hz + 0.036), r: 0.064, corner: false, ang: Math.atan2(sz, 0) });
  return tb;
}

// =====================================================================
// 물리 — 사칙연산과 Math.sqrt만 쓴다(기기마다 결과가 최대한 같게)
// 공: {x,z,vx,vz,wx,wy,wz,st(0 판 위·1 포켓·2 밖),mv,pk}
// =====================================================================
function newLog(cue){ return { cue, first: -1, hits: [], cush: [], cc: 0, after: false, pk: [], out: [] }; }
function mkWorld(tb, B){ return { tb, B, log: newLog(-1), t: 0, moving: false, ev: null }; }
function cloneBalls(B){ return B.map(b => ({ x: b.x, z: b.z, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, st: b.st, mv: false, pk: b.pk })); }
// 큐로 친 순간의 속도와 회전: 당점(sx 좌우, sy 위아래, 반지름 1 원 안)은 공 반지름의 절반까지
function strike(a, p, sx, sy, R, ca, sa){
  const V = powV(p), dx = ca !== undefined ? ca : Math.cos(a), dz = sa !== undefined ? sa : Math.sin(a);
  const ox = clamp(sx, -1, 1) * 0.5, oy = clamp(sy, -1, 1) * 0.5, c = Math.sqrt(Math.max(0, 1 - ox * ox - oy * oy));
  // 친 자리 r = R(ox·오른쪽 + oy·위 − c·앞), 오른쪽 = (−dz, 0, dx)
  const rx = R * (-ox * dz - c * dx), ry = R * oy, rz = R * (ox * dx - c * dz);
  // ω = 5/(2R²) · r × (V·d)
  const k = 5 / (2 * R * R) * V;
  return { vx: V * dx, vz: V * dz, wx: k * (ry * dz), wy: k * (rz * dx - rx * dz), wz: k * (-ry * dx) };
}
function fire(Wd, i, s){
  const b = Wd.B[i];
  b.vx = s.vx; b.vz = s.vz; b.wx = s.wx; b.wy = s.wy; b.wz = s.wz; b.mv = true;
  Wd.log = newLog(i); Wd.t = 0; Wd.moving = true;
}
function stepWorld(Wd){
  const B = Wd.B, R = Wd.tb.R;
  let v2 = 0;
  for (const b of B) if (b.st === 0 && b.mv){ const s = b.vx * b.vx + b.vz * b.vz; if (s > v2) v2 = s; }
  let n = Math.ceil(Math.sqrt(v2) * DT / (0.4 * R)); if (n < 1) n = 1; if (n > 16) n = 16;
  const h = DT / n;
  for (let k = 0; k < n; k++) sub(Wd, h);
  Wd.t += DT;
  let mv = false;
  for (const b of B) if (b.st === 0 && b.mv){ mv = true; break; }
  if (Wd.t > 40){ for (const b of B){ b.vx = b.vz = b.wx = b.wy = b.wz = 0; b.mv = false; } mv = false; }
  Wd.moving = mv;
  return mv;
}
function sub(Wd, h){
  const B = Wd.B, tb = Wd.tb, R = tb.R, n = B.length, log = Wd.log;
  const kS = PH.mus * GRAV * h, kR = PH.mur * GRAV * h;
  // 1) 마찰·이동
  for (let i = 0; i < n; i++){
    const b = B[i]; if (b.st !== 0 || !b.mv) continue;
    const ux = b.vx + R * b.wz, uz = b.vz - R * b.wx, u2 = ux * ux + uz * uz;
    if (u2 > 1e-8){
      // 미끄러짐: 닿는 점의 미끄럼을 줄이는 쪽으로 마찰(속도·회전 둘 다 바뀜)
      const u = Math.sqrt(u2); let k = kS; if (3.5 * k >= u) k = u / 3.5;
      const ex = ux / u, ez = uz / u;
      b.vx -= k * ex; b.vz -= k * ez; b.wx += 2.5 * k * ez / R; b.wz -= 2.5 * k * ex / R;
    } else {
      // 굴림: 굴림 저항으로 느려지고, 회전은 속도에 맞춘다
      const s2 = b.vx * b.vx + b.vz * b.vz;
      if (s2 > 0){ const s = Math.sqrt(s2), ns = s - kR - PH.drag * s * h; if (ns <= 0){ b.vx = 0; b.vz = 0; } else { const f = ns / s; b.vx *= f; b.vz *= f; } }
      b.wx = b.vz / R; b.wz = -b.vx / R;
    }
    if (b.wy > 0){ b.wy -= PH.spin * h; if (b.wy < 0) b.wy = 0; } else if (b.wy < 0){ b.wy += PH.spin * h; if (b.wy > 0) b.wy = 0; }
    b.x += b.vx * h; b.z += b.vz * h;
    if (b.vx === 0 && b.vz === 0 && b.wx === 0 && b.wz === 0){ b.wy = 0; b.mv = false; }
  }
  // 2) 공끼리 충돌
  const D = 2 * R, D2 = D * D;
  for (let i = 0; i < n; i++){
    const a = B[i]; if (a.st !== 0) continue;
    for (let j = i + 1; j < n; j++){
      const c = B[j]; if (c.st !== 0 || (!a.mv && !c.mv)) continue;
      const dx = c.x - a.x, dz = c.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 >= D2) continue;
      let d = Math.sqrt(d2), nx = 1, nz = 0;
      if (d > 1e-9){ nx = dx / d; nz = dz / d; } else d = 0;
      const ov = (D - d) / 2;
      a.x -= nx * ov; a.z -= nz * ov; c.x += nx * ov; c.z += nz * ov;
      const rv = (a.vx - c.vx) * nx + (a.vz - c.vz) * nz;
      if (rv > 0){
        const J = rv * (1 + PH.eBall) / 2;
        a.vx -= J * nx; a.vz -= J * nz; c.vx += J * nx; c.vz += J * nz; a.mv = true; c.mv = true;
        if (i === log.cue || j === log.cue){ const o = i === log.cue ? j : i; if (log.first < 0) log.first = o; if (log.hits.indexOf(o) < 0) log.hits.push(o); }
        if (Wd.ev) Wd.ev.push(['bb', rv, a.x + nx * R, a.z + nz * R]);
      }
    }
  }
  // 3) 쿠션
  const lim = tb.hx - R - 0.002, limz = tb.hz - R - 0.002, R2 = R * R;
  for (let i = 0; i < n; i++){
    const b = B[i]; if (b.st !== 0) continue;
    if (b.x > -lim && b.x < lim && b.z > -limz && b.z < limz) continue;
    for (const s of tb.segs){
      const px = b.x - s.ax, pz = b.z - s.az;
      let t = (px * s.dx + pz * s.dz) / s.l2; if (t < 0) t = 0; else if (t > 1) t = 1;
      const qx = s.ax + s.dx * t, qz = s.az + s.dz * t, ex = b.x - qx, ez = b.z - qz, e2 = ex * ex + ez * ez;
      if (e2 >= R2 || e2 < 1e-12) continue;
      const e = Math.sqrt(e2), nx = -ex / e, nz = -ez / e;
      b.x = qx - nx * R; b.z = qz - nz * R;
      const vn = b.vx * nx + b.vz * nz;
      if (vn > 0) cushion(Wd, i, b, nx, nz, vn);
      if (b.st !== 0) break;
    }
  }
  // 4) 포켓
  if (tb.pool){
    for (let i = 0; i < n; i++){
      const b = B[i]; if (b.st !== 0) continue;
      if (b.x > -tb.hx + 0.001 && b.x < tb.hx - 0.001 && b.z > -tb.hz + 0.001 && b.z < tb.hz - 0.001) continue;
      for (let k = 0; k < tb.pockets.length; k++){
        const p = tb.pockets[k], dx = b.x - p.mx, dz = b.z - p.mz;
        if (dx * dx + dz * dz > 0.02) continue;
        if (dx * p.nx + dz * p.nz > p.d){ b.st = 1; b.pk = k; b.mv = false; log.pk.push(i); if (Wd.ev) Wd.ev.push(['pk', i, k, Math.sqrt(b.vx * b.vx + b.vz * b.vz)]); break; }
      }
    }
  }
  // 안전장치: 틈으로 빠져나간 공
  for (let i = 0; i < n; i++){
    const b = B[i]; if (b.st !== 0) continue;
    if (b.x < -tb.hx - 0.2 || b.x > tb.hx + 0.2 || b.z < -tb.hz - 0.2 || b.z > tb.hz + 0.2){
      if (tb.pool){ let bk = 0, bd = 1e9; tb.pockets.forEach((p, k) => { const d = (b.x - p.cx) * (b.x - p.cx) + (b.z - p.cz) * (b.z - p.cz); if (d < bd){ bd = d; bk = k; } }); b.st = 1; b.pk = bk; log.pk.push(i); }
      else { b.st = 2; log.out.push(i); }
      b.mv = false;
    }
  }
}
function cushion(Wd, i, b, nx, nz, vn){
  const R = Wd.tb.R, log = Wd.log;
  if (vn > PH.jumpV){ b.st = 2; b.mv = false; b.jx = nx; b.jz = nz; b.jv = vn; log.out.push(i); if (Wd.ev) Wd.ev.push(['out', i, vn]); return; }
  const e = PH.eCush;
  b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz;
  // 옆회전: 닿는 점의 미끄럼(접선 속도 − R·ωy)을 쿠션 마찰이 줄이며 반사각이 바뀐다
  const tx = -nz, tz = nx, s = b.vx * tx + b.vz * tz - R * b.wy;
  let P = PH.muC * (1 + e) * vn; const Pm = (s < 0 ? -s : s) / 3.5; if (Pm < P) P = Pm;
  const sg = s > 0 ? 1 : -1, px = -sg * P * tx, pz = -sg * P * tz;
  b.vx += px; b.vz += pz; b.wy += 2.5 * (nz * px - nx * pz) / R;
  // 앞뒤 회전: 쿠션 코가 공 가운데보다 높아 굴러 들어온 회전 대부분이 꺾인다
  const wa = b.wx * nz - b.wz * nx, dw = -1.3 * wa;
  b.wx += dw * nz; b.wz -= dw * nx;
  b.mv = true;
  if (log.cush.indexOf(i) < 0) log.cush.push(i);
  if (i === log.cue) log.cc++;
  if (log.first >= 0) log.after = true;
  if (Wd.ev) Wd.ev.push(['cu', vn, b.x + nx * R, b.z + nz * R]);
}
// 끝까지 돌려 본다(컴퓨터·시험용)
function simulate(tb, B, i, s, tmax){
  const Wd = mkWorld(tb, cloneBalls(B));
  fire(Wd, i, s);
  const n = Math.round((tmax || 40) / DT);
  for (let k = 0; k < n && stepWorld(Wd); k++);
  return Wd;
}

// 빈 자리 찾기(다른 공과 겹치지 않게)
function freeAt(tb, B, x, z, skip){
  const R = tb.R, D = 2 * R + 0.0015;
  if (x < -tb.hx + R || x > tb.hx - R || z < -tb.hz + R || z > tb.hz - R) return false;
  for (let k = 0; k < B.length; k++){ if (k === skip || B[k].st !== 0) continue; const dx = B[k].x - x, dz = B[k].z - z; if (dx * dx + dz * dz < D * D) return false; }
  return true;
}
function respot(tb, B, i, x, z, dir){
  const R = tb.R, b = B[i], st = 2 * R + 0.002, d = dir || 1;
  for (let k = 0; k < 60; k++){
    for (const sg of k ? [d, -d] : [d]){
      const xx = x + sg * k * st;
      if (freeAt(tb, B, xx, z, i)){ b.x = xx; b.z = z; b.st = 0; b.vx = b.vz = b.wx = b.wy = b.wz = 0; b.mv = false; return; }
    }
  }
  for (let k = 1; k < 40; k++) if (freeAt(tb, B, x, z + k * st * (k % 2 ? 1 : -1) * Math.ceil(k / 2), i)){ b.x = x; b.z = z + k * st * (k % 2 ? 1 : -1) * Math.ceil(k / 2); b.st = 0; return; }
}

// =====================================================================
// 조준선: 수구에서 처음 닿는 것까지
// =====================================================================
function traceAim(tb, B, ci, a){
  const C = B[ci], R = tb.R, dx = Math.cos(a), dz = Math.sin(a);
  let best = 9, hit = -1;
  for (let k = 0; k < B.length; k++){
    if (k === ci || B[k].st !== 0) continue;
    const px = B[k].x - C.x, pz = B[k].z - C.z, pr = px * dx + pz * dz; if (pr <= 0) continue;
    const pp = px * px + pz * pz - pr * pr, q = 4 * R * R - pp; if (q < 0) continue;
    const t = pr - Math.sqrt(q); if (t < best && t > -R){ best = Math.max(0, t); hit = k; }
  }
  // 쿠션·포켓까지 한 걸음씩
  let wall = 9;
  for (let t = 0; t < Math.min(best, 3.2); t += 0.004){
    const x = C.x + dx * t, z = C.z + dz * t;
    if (Math.abs(x) < tb.hx - R - 0.001 && Math.abs(z) < tb.hz - R - 0.001) continue;
    let stop = false;
    for (const s of tb.segs){
      const px = x - s.ax, pz = z - s.az; let u = (px * s.dx + pz * s.dz) / s.l2; u = clamp(u, 0, 1);
      const ex = x - s.ax - s.dx * u, ez = z - s.az - s.dz * u; if (ex * ex + ez * ez < R * R){ stop = true; break; }
    }
    if (!stop && tb.pool) for (const p of tb.pockets){ const qx = x - p.mx, qz = z - p.mz; if (qx * qx + qz * qz < 0.02 && qx * p.nx + qz * p.nz > p.d * 0.6){ stop = true; break; } }
    if (stop){ wall = t; break; }
  }
  if (wall < best){ best = wall; hit = -1; }
  const gx = C.x + dx * best, gz = C.z + dz * best;
  const out = { gx, gz, hit, t: best };
  if (hit >= 0){ let nx = B[hit].x - gx, nz = B[hit].z - gz; const l = Math.sqrt(nx * nx + nz * nz) || 1; nx /= l; nz /= l; out.nx = nx; out.nz = nz; out.cos = nx * dx + nz * dz; }
  return out;
}

// =====================================================================
// 소리(직접 합성)
// =====================================================================
let NZ = null;
function noiseBuf(a){ if (NZ) return NZ; const n = a.sampleRate, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return (NZ = b); }
let sndN = 0, sndT = 0;
function snd(k, v = 1){
  const a = VS.ac && VS.ac(); if (!a || a.state !== 'running') return;
  const t = a.currentTime; if (t - sndT > 0.05){ sndT = t; sndN = 0; } if (++sndN > 6) return;   // 한꺼번에 너무 많이 울리지 않게
  const out = a.createGain(); out.gain.value = clamp(v, 0.02, 1.4); out.connect(a.destination);
  const nz = (dur, type, f, q, g0, t0 = 0) => {
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf(a); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t + t0); g.gain.exponentialRampToValueAtTime(g0, t + t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(out); s.start(t + t0, Math.random() * 0.8); s.stop(t + t0 + dur + 0.03);
  };
  const os = (dur, f, f2, g0, type = 'sine', t0 = 0) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t + t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + t0 + dur);
    g.gain.setValueAtTime(g0, t + t0); g.gain.exponentialRampToValueAtTime(0.0001, t + t0 + dur); o.connect(g); g.connect(out); o.start(t + t0); o.stop(t + t0 + dur + 0.03);
  };
  if (k === 'cue'){ nz(0.035, 'bandpass', 2600, 1.4, 0.9); os(0.05, 900, 500, 0.25, 'triangle'); }                      // 딱(큐 끝)
  else if (k === 'ball'){ nz(0.025, 'bandpass', 3800, 2.2, 0.9); os(0.035, 2400, 1900, 0.35, 'sine'); os(0.04, 3300, 0, 0.12, 'sine'); }  // 딱딱(공끼리)
  else if (k === 'cush'){ os(0.12, 150, 80, 0.55); nz(0.06, 'lowpass', 700, 0.8, 0.4); }                                // 퉁(쿠션)
  else if (k === 'drop'){ os(0.1, 190, 90, 0.6); nz(0.08, 'lowpass', 900, 0.8, 0.5); for (let i = 1; i < 6; i++) nz(0.04, 'bandpass', 700 + i * 90, 3, 0.25 / i, 0.1 + i * 0.07); }  // 덜컥 굴러감
  else if (k === 'out'){ os(0.25, 120, 50, 0.6); nz(0.2, 'lowpass', 500, 0.7, 0.6, 0.05); }
  else if (k === 'clap'){
    // 관중 박수: 짧은 잡음 딸깍을 여럿 흩뿌림
    for (let i = 0; i < 70; i++) nz(0.025, 'bandpass', 1400 + Math.random() * 1800, 1.2, 0.08 + Math.random() * 0.1, Math.random() * 1.6);
  }
}

// =====================================================================
// 3D 무대
// =====================================================================
let RULE = null, TB = null, BALLS = [];
let renderer = null, scene, cam, stage, cv, SW = 300, SH = 300, PR = 1, lowN = 0;
let ballM = [], ballSh = null, _sm = new THREE.Matrix4(), _hid = new THREE.Matrix4().makeScale(0, 0, 0), _flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), _one = new THREE.Vector3(1, 1, 1), cueG = null, aimLine = null, ghost = null, objLine = null, handRing = null, lamps = [];
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const ASSET = {};
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function loadTex(url, cb){ if (!ASSET[url]) return; new THREE.TextureLoader().load(url, tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; cb(tx); }, undefined, () => {}); }
// 그림 파일이 있는지 작은 일꾼(worker) 안에서 HEAD로 확인 — 없어도 페이지 콘솔에 404가 찍히지 않는다
function checkAssets(urls){
  return new Promise(res => {
    try {
      const src = 'onmessage=async e=>{const o={};await Promise.all(e.data.map(async u=>{try{const r=await fetch(u,{method:"HEAD",cache:"no-cache"});o[u]=r.ok}catch(x){o[u]=false}}));postMessage(o)}';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      const to = setTimeout(() => { try { w.terminate(); } catch {} res({}); }, 1800);
      w.onmessage = e => { clearTimeout(to); try { w.terminate(); } catch {} const o = {}; for (const u of urls) o[u] = !!e.data[new URL(u, location.href).href]; res(o); };
      w.onerror = () => { clearTimeout(to); res({}); };
      w.postMessage(urls.map(u => new URL(u, location.href).href));
    } catch { res({}); }
  });
}
// 천 질감(코드): 잔 결이 보이는 단색
function feltTex(col){
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = col; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++){ const v = Math.random(); x.fillStyle = v < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)'; x.fillRect(Math.random() * w, Math.random() * h, 1, 1 + Math.random() * 2); }
  });
}
function woodTex(){
  return canvasTex(512, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6B3A1E'); g.addColorStop(0.5, '#7E4726'); g.addColorStop(1, '#5A2E16');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 38; i++){ const y0 = Math.random() * h, amp = 1 + Math.random() * 3, fq = 1 + Math.random() * 3, ph = Math.random() * 6; x.strokeStyle = `rgba(40,18,6,${0.08 + Math.random() * 0.18})`; x.lineWidth = 0.5 + Math.random() * 1.4; x.beginPath(); for (let px = 0; px <= w; px += 8){ const py = y0 + Math.sin(px / w * fq * 6.28 + ph) * amp; px ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
  });
}
// 공 질감(정거원통 도법: 가로 360°, 세로 180°) — 번호 원은 적도 양쪽
function ballTex(d){
  return canvasTex(512, 256, (x, w, h) => {
    if (d.stripe){ x.fillStyle = '#F6F2E6'; x.fillRect(0, 0, w, h); x.fillStyle = d.c; x.fillRect(0, 74, w, 108); }
    else { x.fillStyle = d.c; x.fillRect(0, 0, w, h); }
    if (d.num){
      for (const cx of [128, 384]){
        x.fillStyle = '#F8F5EC'; x.beginPath(); x.ellipse(cx, 128, 34, 34, 0, 0, 7); x.fill();
        x.fillStyle = '#16120E'; x.font = '800 44px Arial, "Helvetica Neue", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(d.num), cx, 131);
        if (d.num === 6 || d.num === 9){ x.fillRect(cx - 11, 152, 22, 4); }
      }
    }
    if (d.dots){ x.fillStyle = d.dots; for (const [cx, cy] of [[0, 128], [128, 128], [256, 128], [384, 128], [512, 128]]) { x.beginPath(); x.ellipse(cx, cy, 7, 7, 0, 0, 7); x.fill(); } x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6); }
    if (d.logo){ x.fillStyle = d.logo; x.beginPath(); x.ellipse(256, 128, 8, 8, 0, 0, 7); x.fill(); }
  });
}
// 테두리(나무 레일) 안쪽 구멍 모양: 직사각형 + 포켓 원을 합친 둘레(반시계)
function railHolePath(hx, hz, pk){
  const pts = [];
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const inside = (x, z) => x >= -hx - 1e-9 && x <= hx + 1e-9 && z >= -hz - 1e-9 && z <= hz + 1e-9;
  // 둘레를 잘게 따라가며 포켓 원 안에 들면 원 바깥 둘레로 돌아간다
  const N = 480, per = 4 * (hx + hz) * 2;
  const at = u => { let d = u * per; const e = [2 * hx, 2 * hz, 2 * hx, 2 * hz]; for (let k = 0; k < 4; k++){ if (d <= e[k]){ const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4]; const f = d / e[k]; return [ax + (bx - ax) * f, az + (bz - az) * f]; } d -= e[k]; } return corners[0]; };
  let inP = null;
  for (let i = 0; i <= N; i++){
    const [x, z] = at(i / N);
    const p = pk.find(q => (x - q.cx) ** 2 + (z - q.cz) ** 2 < q.r * q.r);
    if (p){
      if (inP !== p){
        // 원에 들어섬: 들어간 각에서 나올 각까지 바깥쪽으로 돈다
        let j = i; while (j <= N){ const [x2, z2] = at(j / N); if ((x2 - p.cx) ** 2 + (z2 - p.cz) ** 2 >= p.r * p.r) break; j++; }
        const [xa, za] = at(i / N), [xb, zb] = at(Math.min(j, N) / N);
        let a1 = Math.atan2(za - p.cz, xa - p.cx), a2 = Math.atan2(zb - p.cz, xb - p.cx);
        while (a2 < a1) a2 += Math.PI * 2;
        for (let s = 0; s <= 14; s++){ const a = a1 + (a2 - a1) * s / 14, px = p.cx + p.r * Math.cos(a), pz = p.cz + p.r * Math.sin(a); if (!inside(px, pz) || s === 0 || s === 14) pts.push([px, pz]); }
        inP = p;
      }
      continue;
    }
    inP = null;
    if (i % 6 === 0 || corners.some(c => Math.abs(c[0] - x) < 1e-6 && Math.abs(c[1] - z) < 1e-6)) pts.push([x, z]);
  }
  return pts;
}
function buildScene(){
  const T = RULE.table, R = T.R, hx = TB.hx, hz = TB.hz, CW = 0.05, RW = 0.12, RH = 0.046;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1A1310);
  scene.fog = new THREE.Fog(0x1A1310, 5, 11);
  // 빛: 은은한 반구광 + 그림자 만드는 빛 하나. 펜던트 셋의 따뜻한 빛 웅덩이는 천 위 가짜 빛 판으로(폰 성능)
  scene.add(new THREE.HemisphereLight(0xFFE6C8, 0x2A1A10, 0.9));
  const sun = new THREE.DirectionalLight(0xFFE2BC, 2.1); sun.position.set(0.25, 3, 0.35); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.7, right: 1.7, top: 1.1, bottom: -1.1, near: 1, far: 5 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01; sun.shadow.radius = 4;
  scene.add(sun); scene.add(sun.target);
  const shadeMat = new THREE.MeshLambertMaterial({ color: 0x1F3B2C, side: THREE.DoubleSide }), bulbMat = new THREE.MeshBasicMaterial({ color: 0xFFF1D0 }), wireMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const lx of [-0.85, 0, 0.85]){
    // 등갓(조준 시점에서만 보임)
    const shade = new THREE.Group(); shade.position.set(lx, 1.02, 0);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 24, 1, true), shadeMat); cone.position.y = 0.04; shade.add(cone);
    shade.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), bulbMat));
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 5), wireMat); wire.position.y = 0.7; shade.add(wire);
    shade.visible = false; scene.add(shade); lamps.push(shade);
  }
  // 바닥(당구장 마루)
  const floorT = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#3A2618'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++){ x.fillStyle = i % 2 ? 'rgba(0,0,0,.12)' : 'rgba(255,220,180,.04)'; x.fillRect(0, i * 32, w, 31); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, i * 32 + 31, w, 1); x.fillRect((i * 97) % w, i * 32, 1, 32); } });
  floorT.wrapS = floorT.wrapT = THREE.RepeatWrapping; floorT.repeat.set(8, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshLambertMaterial({ map: floorT })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.8; scene.add(floor);
  // 흐린 배경 그림(있으면)
  const bgU = '/vs/common/bg-billiard-wide.jpg';
  if (ASSET[bgU]){ const im = new Image(); im.onload = () => { const t = canvasTex(256, 144, (x, w, h) => { x.filter = 'blur(5px) brightness(.55)'; x.drawImage(im, -10, -10, w + 20, h + 20); }); scene.background = t; scene.fog.color.set(0x16100C); }; im.src = bgU; }
  // 같은 재질끼리 한 덩어리로 합쳐 그리기 횟수를 줄인다
  const merged = (parts, mat) => {
    const pos = [], nor = [], uv = [];
    for (const [g0, mtx] of parts){
      const g = g0.index ? g0.toNonIndexed() : g0.clone(); g.applyMatrix4(mtx);
      pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
      if (g.attributes.uv) uv.push(...g.attributes.uv.array); else for (let i = 0; i < g.attributes.position.count; i++) uv.push(0, 0);
    }
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); G.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(G, mat); scene.add(m); return m;
  };
  const M4 = (x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  // 천
  const felt = feltTex(T.cloth); felt.wrapS = felt.wrapT = THREE.RepeatWrapping; felt.repeat.set(6, 3);
  const feltMat = new THREE.MeshLambertMaterial({ map: felt });
  const cushMat = new THREE.MeshLambertMaterial({ map: felt, color: 0xDDDDDD });
  loadTex(T.feltImg, tx => { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(4, 2); feltMat.map = tx; feltMat.needsUpdate = true; cushMat.map = tx; cushMat.needsUpdate = true; });
  const bedS = new THREE.Shape(); const bx = hx + CW + 0.05, bz = hz + CW + 0.05;
  bedS.moveTo(-bx, -bz); bedS.lineTo(bx, -bz); bedS.lineTo(bx, bz); bedS.lineTo(-bx, bz); bedS.lineTo(-bx, -bz);
  for (const p of TB.pockets){ const hp = new THREE.Path(); hp.absarc(p.cx, -p.cz, p.r, 0, Math.PI * 2, true); bedS.holes.push(hp); }
  const bedG = new THREE.ShapeGeometry(bedS, 12); bedG.rotateX(-Math.PI / 2);
  { const pa = bedG.attributes.position, uv = bedG.attributes.uv; for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + bx) / (2 * bx), (pa.getZ(i) + bz) / (2 * bz)); }
  const bed = new THREE.Mesh(bedG, feltMat); bed.receiveShadow = true; scene.add(bed);
  // 펜던트 빛 웅덩이(가짜 빛): 따뜻한 빛 셋을 한 장의 더하기 판으로
  const poolT = canvasTex(512, 256, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'lighter';
    for (const cx of [0.165, 0.5, 0.835]){ const g = x.createRadialGradient(cx * w, h / 2, 0, cx * w, h / 2, h * 0.62); g.addColorStop(0, 'rgba(255,196,120,.55)'); g.addColorStop(0.55, 'rgba(255,170,90,.22)'); g.addColorStop(1, 'rgba(255,150,80,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  });
  const poolM = new THREE.MeshBasicMaterial({ map: poolT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75, fog: false });
  // 천 높이에 깐다(쿠션·레일은 깊이로 가려진다, 공 가짜 그림자보다 먼저 그린다)
  const pools = new THREE.Mesh(new THREE.PlaneGeometry(2 * (hx + CW + RW) + 0.1, 2 * (hz + CW + RW) + 0.1), poolM);
  pools.rotation.x = -Math.PI / 2; pools.position.y = 0.0004; pools.renderOrder = 1; scene.add(pools);
  // 쿠션(천 색 고무): 선분마다 긴 상자 → 한 덩어리
  const cuH = 0.04, cuParts = [];
  for (const s of TB.segs){
    const len = Math.sqrt(s.l2), dep = s.k === 'jaw' ? 0.03 : CW, ang = Math.atan2(s.dz, s.dx);
    let ox = s.dz / len, oz = -s.dx / len; const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    if (ox * mx + oz * mz < 0 && s.k !== 'jaw'){ ox = -ox; oz = -oz; }
    if (s.k === 'jaw'){ const tst = (mx + ox * 0.01) ** 2 / (hx * hx) + (mz + oz * 0.01) ** 2 / (hz * hz); const tst2 = (mx - ox * 0.01) ** 2 / (hx * hx) + (mz - oz * 0.01) ** 2 / (hz * hz); if (tst < tst2){ ox = -ox; oz = -oz; } }
    cuParts.push([new THREE.BoxGeometry(len + (s.k === 'jaw' ? 0 : 0.002), cuH, dep), M4(mx + ox * dep / 2, cuH / 2, mz + oz * dep / 2, 0, -ang, 0)]);
  }
  const cush = merged(cuParts, cushMat); cush.castShadow = true;
  // 나무 레일(광택 원목): 바깥 직사각형 − (안쪽 직사각형 ∪ 포켓 원)
  const wood = woodTex(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2, 1);
  const woodMat = new THREE.MeshPhongMaterial({ map: wood, shininess: 70, specular: 0x5A4030 });
  const bodyMat = new THREE.MeshLambertMaterial({ map: wood, color: 0x8A6A58 });
  loadTex('/vs/common/bl-wood.jpg', tx => { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(2, 1); woodMat.map = tx; woodMat.needsUpdate = true; bodyMat.map = tx; bodyMat.needsUpdate = true; });
  const ox = hx + CW + RW, oz = hz + CW + RW;
  const rs = new THREE.Shape(); rs.moveTo(-ox, -oz); rs.lineTo(ox, -oz); rs.lineTo(ox, oz); rs.lineTo(-ox, oz); rs.lineTo(-ox, -oz);
  const hp = railHolePath(hx + CW, hz + CW, TB.pockets.map(p => ({ cx: p.cx, cz: p.cz, r: p.r + 0.004 })));
  const hole = new THREE.Path(); hole.moveTo(hp[0][0], -hp[0][1]); for (let i = hp.length - 1; i > 0; i--) hole.lineTo(hp[i][0], -hp[i][1]); rs.holes.push(hole);
  const rg = new THREE.ExtrudeGeometry(rs, { depth: RH - 0.008, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 4 });
  rg.rotateX(-Math.PI / 2);
  // 나뭇결이 각 레일 길이 방향으로 흐르게
  { const pa = rg.attributes.position, uv = rg.attributes.uv; for (let i = 0; i < pa.count; i++){ const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i), lng = Math.abs(z) - hz > Math.abs(x) - hx; uv.setXY(i, (lng ? x : z) / 0.8, (lng ? z : x) / 0.8 + y * 2); } }
  const rail = new THREE.Mesh(rg, woodMat); rail.castShadow = true; scene.add(rail);
  // 몸통과 다리 → 한 덩어리
  const bodyParts = [[new THREE.BoxGeometry(2 * ox - 0.04, 0.22, 2 * oz - 0.04), M4(0, -0.13, 0, 0, 0, 0)]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bodyParts.push([new THREE.BoxGeometry(0.13, 0.6, 0.13), M4(sx * (ox - 0.25), -0.5, sz * (oz - 0.18), 0, 0, 0)]);
  merged(bodyParts, bodyMat);
  // 포인트(다이아몬드): 긴 쪽 7개, 짧은 쪽 3개 — 4구는 둥근 점, 포켓볼은 마름모 → 한 덩어리
  const dmParts = [], dmG = T.pockets ? new THREE.CircleGeometry(0.011, 4) : new THREE.CircleGeometry(0.008, 12);
  const dm = (x, z) => dmParts.push([dmG, M4(x, RH + 0.0015, z, -Math.PI / 2, 0, 0)]);
  const rmid = CW + RW * 0.5;
  for (let i = 1; i < 8; i++){ if (T.pockets && i === 4) continue; for (const sz of [-1, 1]) dm(-hx + i * TB.L / 8, sz * (hz + rmid)); }
  for (let j = 1; j < 4; j++) for (const sx of [-1, 1]) dm(sx * (hx + rmid), -hz + j * TB.W / 4);
  merged(dmParts, new THREE.MeshPhongMaterial({ color: 0xF4EEDC, shininess: 60 }));
  // 포켓: 검은 속, 금속 테두리, 그물 주머니 → 재질별 한 덩어리
  if (T.pockets){
    const metal = new THREE.MeshPhongMaterial({ color: 0xB9BEC4, specular: 0xFFFFFF, shininess: 90 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x0B0908, side: THREE.DoubleSide });
    const netT = canvasTex(128, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(235,225,205,.95)'; x.lineWidth = 3; for (let i = -w; i < w * 2; i += 16){ x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); } });
    netT.wrapS = netT.wrapT = THREE.RepeatWrapping; netT.repeat.set(4, 2);
    const netM = new THREE.MeshLambertMaterial({ map: netT, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    const liners = [], nets = [], metals = [];
    for (const p of TB.pockets){
      liners.push([new THREE.CylinderGeometry(p.r, p.r * 0.92, 0.1, 14, 1, true), M4(p.cx, -0.05, p.cz, 0, 0, 0)]);
      nets.push([new THREE.SphereGeometry(p.r * 0.95, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M4(p.cx, -0.1, p.cz, 0, 0, 0, 1, 1.5, 1)]);
      // 입구(당구대 가운데 쪽)는 비우고 바깥쪽만 두른다. x축으로 눕히면 평면의 각 θ가 세계에선 −θ → 시작 각 −(바깥 각 + 호/2)
      const arc = Math.PI * (p.corner ? 1.35 : 1.0), a0 = -(p.ang + arc / 2);
      const rimG = new THREE.TorusGeometry(p.r + 0.012, 0.011, 6, 20, arc); rimG.rotateZ(a0);
      metals.push([rimG, M4(p.cx, RH + 0.002, p.cz, -Math.PI / 2, 0, 0)]);
      metals.push([new THREE.RingGeometry(p.r + 0.004, p.r + 0.03, 24, 1, a0, arc), M4(p.cx, RH + 0.0012, p.cz, -Math.PI / 2, 0, 0)]);
    }
    merged(liners, dark); merged(nets, netM); merged(metals, metal);
  }
  // 공: 그림자맵 대신 둥근 가짜 그림자, 광택은 반사 지도(도착하면)로
  const sg = new THREE.SphereGeometry(R, 32, 16);
  const shT = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(0.55, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  const shG = new THREE.PlaneGeometry(R * 2.6, R * 2.6), shM = new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false, opacity: 0.6 });
  const ballMats = [];
  BALLS.forEach((d) => {
    const mat = new THREE.MeshStandardMaterial({ map: ballTex(d), roughness: 0.14, metalness: 0 }); ballMats.push(mat);
    const m = new THREE.Mesh(sg, mat);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); scene.add(m); ballM.push(m);
  });
  // 가짜 그림자 16개를 한 번에 그린다
  ballSh = new THREE.InstancedMesh(shG, shM, BALLS.length); ballSh.renderOrder = 2; ballSh.frustumCulled = false; scene.add(ballSh);
  // 큐(끝이 원점, +x가 치는 방향)
  cueG = new THREE.Group(); scene.add(cueG);
  const CL = 1.45;
  const cyl = (r1, r2, l, seg, mat, x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, seg), mat); m.rotation.z = Math.PI / 2; m.position.x = x; cueG.add(m); };
  cyl(0.0145, 0.0062, CL, 12, new THREE.MeshPhongMaterial({ color: 0xE8CFA0, shininess: 40 }), -CL / 2);
  cyl(0.0152, 0.0122, 0.55, 12, new THREE.MeshPhongMaterial({ color: 0x2A1A12, shininess: 60 }), -CL + 0.275);
  cyl(0.0125, 0.0125, 0.012, 12, new THREE.MeshPhongMaterial({ color: 0xD9B45A, shininess: 90 }), -CL + 0.55);
  cyl(0.0063, 0.0063, 0.02, 10, new THREE.MeshLambertMaterial({ color: 0xF4F2EC }), -0.013);
  cyl(0.006, 0.0062, 0.006, 10, new THREE.MeshLambertMaterial({ color: 0x3B6FB8 }), -0.002);
  cueG.rotation.order = 'YZX'; cueG.visible = false;
  // 조준선·예상 맞는 자리·맞은 공 방향
  const lm = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8, depthWrite: false });
  aimLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.005), lm); aimLine.renderOrder = 3; scene.add(aimLine);
  objLine = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.005), new THREE.MeshBasicMaterial({ color: 0xFFE27A, transparent: true, opacity: 0.9, depthWrite: false })); objLine.renderOrder = 3; scene.add(objLine);
  ghost = new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R, 32), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85, depthWrite: false })); ghost.rotation.x = -Math.PI / 2; ghost.renderOrder = 3; scene.add(ghost);
  handRing = new THREE.Mesh(new THREE.RingGeometry(R * 1.35, R * 1.6, 32), new THREE.MeshBasicMaterial({ color: 0x8FD0FF, transparent: true, opacity: 0.8, depthWrite: false })); handRing.rotation.x = -Math.PI / 2; handRing.renderOrder = 3; scene.add(handRing);
  aimLine.visible = objLine.visible = ghost.visible = handRing.visible = false;
  cam = new THREE.PerspectiveCamera(40, 1, 0.05, 30);
  // 반사광(있으면): 방 환경을 흐리게 비춰 공 광택만 살린다(다른 면에는 안 씀)
  import('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/environments/RoomEnvironment.js').then(m => {
    try { const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(new m.RoomEnvironment(), 0.04).texture; for (const mt of ballMats){ mt.envMap = env; mt.envMapIntensity = 0.55; mt.needsUpdate = true; } pm.dispose(); } catch {}
  }).catch(() => {});
  // 그림자맵: 그림자를 드리우는 것(레일·쿠션)은 움직이지 않으니 처음 한 번만 그린다
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
}

// =====================================================================
// 카메라: 전체 보기(비스듬히 내려다보기) ↔ 조준 시점(수구 뒤)
// =====================================================================
let camMode = 'top', camPos = new THREE.Vector3(0, 3, 2), camTgt = new THREE.Vector3(), camFov = 40, topFit = null;
function margins(){
  const touch = VS.isTouch;
  const port = SH > SW * 1.05;
  // 위: 점수판, 아래: 당점·시점 단추, 오른쪽: 힘 막대 자리를 비운다
  return { top: port ? 78 : 52, bot: touch ? 70 : 60, left: port ? 8 : 70, right: 76 };
}
function fitTop(){
  const asp = SW / SH, port = asp < 0.95, E = (port ? 66 : 54) * Math.PI / 180;
  const hx = TB.hx + 0.19, hz = TB.hz + 0.19, y = 0.05;
  const pts = [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]];
  const dir = port ? new THREE.Vector3(-Math.cos(E), Math.sin(E), 0) : new THREE.Vector3(0, Math.sin(E), Math.cos(E));
  const D = port ? 4.4 : 4.0, mg = margins();
  const hi = 1 - 2 * mg.top / SH, lo = -1 + 2 * mg.bot / SH, rt = 1 - 2 * mg.right / SW, lf = -1 + 2 * mg.left / SW;
  const c = new THREE.PerspectiveCamera(40, asp, 0.05, 30);
  let best = null;
  for (let a = -0.5; a <= 0.5001; a += 0.05) for (let b = -0.35; b <= 0.3501; b += 0.05){
    // a: 화면 세로 방향 이동, b: 화면 가로 방향 이동
    const tx = port ? a : -b, tz = port ? b : a;
    c.position.set(tx + dir.x * D, dir.y * D, tz + dir.z * D); c.up.set(0, 1, 0); c.lookAt(tx, 0, tz); c.updateMatrixWorld();
    let tn = 0;
    for (const p of pts){
      _v.set(p[0], p[1], p[2]).applyMatrix4(c.matrixWorldInverse); const dep = -_v.z;
      tn = Math.max(tn, _v.y >= 0 ? _v.y / (dep * hi) : _v.y / (dep * lo), _v.x >= 0 ? _v.x / (dep * asp * rt) : _v.x / (dep * asp * lf));
    }
    if (!best || tn < best.tn) best = { tn, tx, tz };
  }
  topFit = { pos: new THREE.Vector3(best.tx + dir.x * D, dir.y * D, best.tz + dir.z * D), tgt: new THREE.Vector3(best.tx, 0, best.tz), fov: 2 * Math.atan(best.tn) * 180 / Math.PI };
}
function aimCam(a, C){
  const port = SW / SH < 0.95, dx = Math.cos(a), dz = Math.sin(a);
  const back = port ? 0.95 : 0.8, up = port ? 0.72 : 0.42, ahead = port ? 0.85 : 0.8;
  return { pos: new THREE.Vector3(C.x - dx * back, up, C.z - dz * back), tgt: new THREE.Vector3(C.x + dx * ahead, 0, C.z + dz * ahead), fov: port ? 60 : 50 };
}
function placeCamera(dt, snap){
  if (!topFit) fitTop();
  let want = topFit;
  const aimNow = st && st.phase === 'aim' && camMode === 'aim';
  if (aimNow){ const ci = RULE.cueIdx(st.gs), C = W.B[ci]; if (C.st === 0){ const a = st.gs.turn === st.me ? st.aim.a : (st.oppAim ? st.oppAim.a : st.aim.a); want = aimCam(a, C); } }
  for (const l of lamps) l.visible = aimNow;
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  camPos.lerp(want.pos, k); camTgt.lerp(want.tgt, k); camFov = lerp(camFov, want.fov, k);
  cam.position.copy(camPos); cam.up.set(0, 1, 0); cam.lookAt(camTgt); cam.fov = camFov; cam.aspect = SW / SH; cam.updateProjectionMatrix();
}

// =====================================================================
// 경기 상태
// =====================================================================
let W = null, st = null;
const helpers = {
  respot: (B, i, x, z, dir) => respot(TB, B, i, x, z, dir),
  free: (B, x, z, skip) => freeAt(TB, B, x, z, skip),
  rng: s => VS.rng(s),
  get tb(){ return TB; },
  get me(){ return st ? st.me : 0; },          // 보는 사람 자리(판정 글자에만 쓴다)
  get cpu(){ return !!(st && st.mode === 'cpu'); },
};
const myTurn = () => st && st.gs.turn === st.me && st.phase === 'aim';
const gameOn = () => st && !st.stopped && !$('vsGame').classList.contains('hide');
function newBalls(){ return BALLS.map(() => ({ x: 0, z: 0, vx: 0, vz: 0, wx: 0, wy: 0, wz: 0, st: 0, mv: false, pk: -1 })); }
function posOf(B){ return B.map(b => [b.x, b.z, b.st]); }

// ---------- 판정 적용(양쪽이 같은 값으로 부른다) ----------
function resolve(lg){
  const gs = st.gs, me = st.me, before = gs.turn;
  const res = RULE.judge(gs, lg, W.B, helpers) || {};
  const L = window.__blLog; L.push([before, lg.first, lg.pk.join('+'), res.call ? res.call.big + '/' + (res.call.small || '') : '', gs.turn]); if (L.length > 200) L.shift();   // 시험용 기록
  for (const b of W.B){ b.vx = b.vz = b.wx = b.wy = b.wz = 0; b.mv = false; }
  if (res.call) showCall(res.call.big, res.call.small, res.call.hot);
  if (res.clap) snd('clap', 0.9);
  if (res.over === 0 || res.over === 1){
    st.phase = 'over'; st.overSeat = res.over; updateTurn(); updateHud();
    const s0 = st;
    setTimeout(() => { if (st === s0 && !s0.stopped) VS.over(res.over); }, 1300 / tScale());
    return;
  }
  st.phase = 'aim'; st.turnEl = 0; st.lock = performance.now() + 450 / tScale(); st.cpu = null; st.bot = null; st.oppAim = null; st.spin = { x: 0, y: 0 }; syncSpin();
  st.aim.p = 0; st.pull = 0;
  const ci = RULE.cueIdx(gs); if (W.B[ci].st !== 0 && gs.bih) placeDefault();
  if (gs.turn === me && before !== me) VS.sfx('turn');
  // 차례가 넘어가면 조준 방향을 새 수구 기준으로(가장 가까운 목표 공 쪽)
  if (gs.turn !== before || res.reaim) st.aim.a = defaultAim();
  updateTurn(); updateHud();
}
function placeDefault(){
  const ci = RULE.cueIdx(st.gs), b = W.B[ci], hs = -TB.L / 4;
  respot(TB, W.B, ci, hs, 0, -1);
  if (st.gs.bih === 'k' && b.x > hs) respot(TB, W.B, ci, hs - 0.1, 0, -1);
}
function defaultAim(){
  const gs = st.gs, ci = RULE.cueIdx(gs), C = W.B[ci], tg = RULE.targets(gs, W.B);
  if (gs.n === 0 || gs.brk) return C.x < 0 ? 0 : Math.PI;     // 첫 샷(초구·브레이크)은 당구대 길이 방향으로
  let best = null, bd = 1e9;
  for (const i of tg){ const b = W.B[i]; if (b.st !== 0) continue; const d = (b.x - C.x) ** 2 + (b.z - C.z) ** 2; if (d < bd){ bd = d; best = b; } }
  return best ? Math.atan2(best.z - C.z, best.x - C.x) : (C.x < 0 ? 0 : Math.PI);
}
// 내가(또는 컴퓨터·시험 봇이) 친다
function shoot(a, p, sx, sy, fromNet){
  const gs = st.gs, ci = RULE.cueIdx(gs), C = W.B[ci];
  const s = strike(a, p, sx, sy, TB.R);
  if (st.mode === 'net' && !fromNet && gs.turn === st.me) VS.send({ k: 'shot', n: gs.n, c: [C.x, C.z], v: [s.vx, s.vz], w: [s.wx, s.wy, s.wz], a: +a.toFixed(4), p: +p.toFixed(3), sp: [+sx.toFixed(2), +sy.toFixed(2)] });
  launch(s, a, p, sx, sy);
}
function launch(s, a, p, sx, sy){
  const gs = st.gs, ci = RULE.cueIdx(gs);
  st.shotAim = { a, p, sx, sy, t: performance.now(), cx: W.B[ci].x, cz: W.B[ci].z };
  st.shooter = gs.turn; st.phase = 'move'; st.pend = null; st.waitRest = 0; st.pendAt = 0;
  fire(W, ci, s); W.ev = [];
  st.acc = 0; st.pull = 0; st.cpu = null; st.bot = null; st.dragPow = null; st.space = null;
  snd('cue', 0.4 + 0.6 * p); VS.buzz(12);
  updateTurn();
}
// 시뮬레이션이 멈췄다
function onStop(){
  const gs = st.gs;
  if (st.mode === 'net' && st.shooter !== st.me){
    if (st.pend){ const d = st.pend; st.pend = null; applyRest(d); resolve(d.lg); }
    else { st.phase = 'wait'; st.waitRest = performance.now(); }
    return;
  }
  const lg = W.log;
  if (st.mode === 'net') VS.send({ k: 'rest', n: gs.n, pos: posOf(W.B), lg });
  resolve(lg);
}
function applyRest(d){
  d.pos.forEach((p, k) => {
    const b = W.B[k]; if (!b || !Array.isArray(p)) return;
    const x = +p[0], z = +p[1], s = p[2] | 0; if (!isFinite(x) || !isFinite(z)) return;
    b.x = x; b.z = z; if (b.st === 0 && s !== 0) startFall(k, s); b.st = s; b.vx = b.vz = b.wx = b.wy = b.wz = 0; b.mv = false;
  });
  W.moving = false;
}
function cleanLog(l){
  const arr = v => Array.isArray(v) ? v.filter(x => Number.isInteger(x) && x >= 0 && x < BALLS.length).slice(0, 40) : [];
  return { cue: l.cue | 0, first: Number.isInteger(l.first) ? l.first : -1, hits: arr(l.hits), cush: arr(l.cush), cc: l.cc | 0, after: !!l.after, pk: arr(l.pk), out: arr(l.out) };
}
function doTimeout(fromNet){
  const gs = st.gs, n = gs.n;
  if (st.mode === 'net' && !fromNet) VS.send({ k: 'to', n });
  const res = RULE.timeout(gs, W.B, helpers) || {};
  if (res.call) showCall(res.call.big, res.call.small);
  const before = gs.turn;
  st.phase = 'aim'; st.turnEl = 0; st.cpu = null; st.bot = null; st.oppAim = null; st.lock = performance.now() + 450;
  const ci = RULE.cueIdx(gs); if (W.B[ci].st !== 0 && gs.bih) placeDefault();
  if (gs.turn !== before) st.aim.a = defaultAim();
  if (gs.turn === st.me) VS.sfx('turn');
  updateTurn(); updateHud();
}

// =====================================================================
// 컴퓨터(시험 봇도 같이 쓴다)
// =====================================================================
const AIL = {
  easy:   { err: 0.022, perr: 0.12, spins: [[0, 0]], pw: [0.5, 0.66], offs: [-0.5, 0, 0.5], banks: false, max: 24, pick: 4 },
  normal: { err: 0.006, perr: 0.05, spins: [[0, 0], [0, 0.6], [0, -0.6]], pw: [0.42, 0.56, 0.7], offs: [-0.85, -0.55, -0.25, 0, 0.25, 0.55, 0.85], banks: false, max: 150, pick: 1 },
  hard:   { err: 0.0015, perr: 0.025, spins: [[0, 0], [0, 0.7], [0, -0.7], [0.7, 0], [-0.7, 0], [0.5, 0.5], [-0.5, 0.5]], pw: [0.4, 0.52, 0.64, 0.78], offs: [-0.9, -0.7, -0.45, -0.2, 0, 0.2, 0.45, 0.7, 0.9], banks: true, max: 420, pick: 1 },
};
function aiCands(gs, B, lv){
  const L = AIL[lv] || AIL.normal, R = TB.R, ci = RULE.cueIdx(gs), C = B[ci], out = [];
  const tg = RULE.targets(gs, B).filter(i => B[i].st === 0);
  const add = (a, p, sp, pri) => out.push({ a, p, sx: sp[0], sy: sp[1], pri });
  if (gs.brk){
    // 브레이크: 맨 앞 공을 세게
    let apex = tg[0], bx = 1e9; for (const i of tg){ const v = B[i].x + 3 * Math.abs(B[i].z); if (B[i].st === 0 && v < bx){ bx = v; apex = i; } }
    const b = B[apex]; for (const o of [0, 0.15, -0.15, 0.3]){ const a = Math.atan2(b.z - C.z + o * R, b.x - C.x); add(a, 1, [0, 0.2], 1); add(a, 0.92, [0, -0.2], 1); }
    return out;
  }
  if (TB.pool){
    for (const t of tg){
      const T = B[t];
      for (const p of TB.pockets){
        const ax = p.mx + p.nx * 0.01, az = p.mz + p.nz * 0.01;
        let ux = ax - T.x, uz = az - T.z; const dl = Math.sqrt(ux * ux + uz * uz); ux /= dl; uz /= dl;
        // 코너 포켓은 입구 방향과 너무 틀어지면 안 들어간다
        if (ux * p.nx + uz * p.nz < (p.corner ? 0.35 : 0.55)) continue;
        const gx = T.x - ux * 2 * R, gz = T.z - uz * 2 * R;
        let dx = gx - C.x, dz = gz - C.z; const dd = Math.sqrt(dx * dx + dz * dz); if (dd < 1e-3) continue; dx /= dd; dz /= dd;
        const cs = dx * ux + dz * uz; if (cs < 0.25) continue;
        const a = Math.atan2(dz, dx), pri = cs * 2 - dl * 0.4 - dd * 0.25;
        // 필요한 힘을 거리로 어림하고 앞뒤로 한 칸씩
        const need = Math.sqrt(2 * 0.5 * (dd + dl / Math.max(0.3, cs * cs) + 0.4));
        const p0 = Math.pow(clamp(need / VMAX, 0.1, 1), 1 / 1.4);
        const pws = lv === 'easy' ? [p0 * 1.05] : lv === 'normal' ? [p0, p0 * 1.18, p0 * 0.88] : [p0, p0 * 1.18, p0 * 0.88, p0 * 1.35];
        for (const pw of pws) for (const sp of L.spins) add(a, clamp(pw, 0.15, 0.95), sp, pri);
      }
    }
    // 넣을 게 마땅치 않으면 정당하게 맞히기(세이프티)
    for (const t of tg){ const T = B[t]; for (const o of [-0.6, 0, 0.6]){ const a = Math.atan2(T.z - C.z, T.x - C.x) + o * R * 2 / Math.max(0.1, Math.hypot(T.x - C.x, T.z - C.z)); for (const pw of [0.35, 0.5]) add(a, pw, [0, 0], -5); } }
    if (lv === 'hard') out.sort((u, v) => v.pri - u.pri);
    else out.sort((u, v) => v.pri - u.pri + (Math.random() - 0.5) * 0.3);
    return out;
  }
  // 4구: 빨간 공 하나를 두께를 바꿔 가며 맞혀 본다(어려우면 쿠션 먼저 치기도)
  for (const t of tg){
    const T = B[t]; let dx = T.x - C.x, dz = T.z - C.z; const d = Math.sqrt(dx * dx + dz * dz);
    for (const o of L.offs){
      const a = Math.atan2(dz, dx) + Math.asin(clamp(o * 2 * R / d, -1, 1));
      for (const pw of L.pw) for (const sp of L.spins) add(a, pw, sp, 1 - Math.abs(o) * 0.3);
    }
    if (L.banks){
      const lx = TB.hx - R, lz = TB.hz - R;
      for (const [mx, mz] of [[2 * lx - T.x, T.z], [-2 * lx - T.x, T.z], [T.x, 2 * lz - T.z], [T.x, -2 * lz - T.z]]){
        const a = Math.atan2(mz - C.z, mx - C.x);
        for (const pw of [0.55, 0.7]) for (const sp of [[0, 0], [0.6, 0.2], [-0.6, 0.2]]) add(a, pw, sp, 0.3);
      }
    }
  }
  out.sort(() => Math.random() - 0.5);
  return out;
}
// 다음 샷이 얼마나 좋은지(포켓볼: 곧게 넣을 수 있는 공 수)
function nextQuality(gs, B, seat){
  const R = TB.R, ci = RULE.cueIdx(gs), C = B[ci]; if (!C || C.st !== 0) return 0;
  if (!TB.pool){
    const r = [2, 3].map(i => B[i]); if (r.some(b => b.st !== 0)) return 0;
    const d = Math.hypot(r[0].x - r[1].x, r[0].z - r[1].z), dc = Math.min(Math.hypot(C.x - r[0].x, C.z - r[0].z), Math.hypot(C.x - r[1].x, C.z - r[1].z));
    return clamp(1.4 - d, 0, 1.4) * 40 + clamp(1 - dc, 0, 1) * 25;
  }
  const g2 = Object.assign({}, gs, { turn: seat });
  const tg = RULE.targets(g2, B).filter(i => B[i].st === 0);
  const clear = (x0, z0, x1, z1, skip) => { const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1; for (let k = 0; k < B.length; k++){ if (skip.includes(k) || B[k].st !== 0) continue; let t = ((B[k].x - x0) * dx + (B[k].z - z0) * dz) / l2; t = clamp(t, 0, 1); const ex = x0 + dx * t - B[k].x, ez = z0 + dz * t - B[k].z; if (ex * ex + ez * ez < 4 * R * R) return false; } return true; };
  let q = 0;
  for (const t of tg){ const T = B[t]; let best = 0;
    for (const p of TB.pockets){ let ux = p.mx - T.x, uz = p.mz - T.z; const dl = Math.hypot(ux, uz); ux /= dl; uz /= dl; if (ux * p.nx + uz * p.nz < 0.4) continue; const gx = T.x - ux * 2 * R, gz = T.z - uz * 2 * R; let dx = gx - C.x, dz = gz - C.z; const dd = Math.hypot(dx, dz); const cs = (dx * ux + dz * uz) / (dd || 1); if (cs < 0.5) continue; if (!clear(C.x, C.z, gx, gz, [ci, t]) || !clear(T.x, T.z, p.mx, p.mz, [t])) continue; best = Math.max(best, cs - dl * 0.15 - dd * 0.1); }
    q += best; }
  return Math.min(q, 3) * 40;
}
function aiValue(res, gs2, B2, seat){
  let v = 0;
  if (res.over === seat) return 10000; if (res.over === 1 - seat) return -10000;
  if (res.foul) v -= 400;
  if (gs2.turn === seat){ v += 300 + nextQuality(gs2, B2, seat); }
  else if (TB.pool) v -= nextQuality(gs2, B2, 1 - seat) * 0.5;
  if (res.one) v += 20;
  return v;
}
// 계산을 여러 프레임에 나눠 한다(한 프레임 최대 약 8ms, 모두 합쳐 약 0.35초)
function* planGen(seat, lv){
  const gs = st.gs, B = cloneBalls(W.B), ci = RULE.cueIdx(gs), L = AIL[lv] || AIL.normal;
  const cands = aiCands(gs, B, lv).slice(0, L.max);
  const scored = []; let used = 0;
  for (let i = 0; i < cands.length; i++){
    const t0 = performance.now();
    const c = cands[i], s = strike(c.a, c.p, c.sx, c.sy, TB.R);
    const Wd = simulate(TB, B, ci, s, 14);
    const g2 = JSON.parse(JSON.stringify(gs)); g2.__ai = 1;
    const res = RULE.judge(g2, Wd.log, Wd.B, helpers) || {};
    c.v = aiValue(res, g2, Wd.B, seat) + (lv === 'easy' ? Math.random() * 80 : Math.random() * 4);
    scored.push(c);
    used += performance.now() - t0;
    if (used > 350 && scored.length >= 6) break;
    yield scored.length / cands.length;
  }
  if (!scored.length) return { a: st.aim.a, p: 0.5, sx: 0, sy: 0 };
  scored.sort((a, b) => b.v - a.v);
  const k = Math.min(L.pick, scored.length);
  const pk = scored[Math.floor(Math.random() * k)];
  return { a: pk.a + gauss() * L.err, p: clamp(pk.p * (1 + gauss() * L.perr), 0.08, 1), sx: pk.sx, sy: pk.sy, v: pk.v };
}
// 프리볼: 넣기 좋은 자리에 수구를 놓는다
function aiPlace(seat){
  const gs = st.gs, B = W.B, R = TB.R, ci = RULE.cueIdx(gs), kitchen = gs.bih === 'k', hs = -TB.L / 4;
  const g2 = Object.assign({}, gs, { turn: seat });
  const tg = RULE.targets(g2, B).filter(i => B[i].st === 0 && i !== ci);
  let best = null;
  for (const t of tg){ const T = B[t];
    for (const p of TB.pockets){
      let ux = p.mx - T.x, uz = p.mz - T.z; const dl = Math.hypot(ux, uz); ux /= dl; uz /= dl;
      if (ux * p.nx + uz * p.nz < 0.5) continue;
      for (const back of [0.2, 0.35, 0.55]){
        const x = T.x - ux * (2 * R + back), z = T.z - uz * (2 * R + back);
        if (kitchen && x > hs) continue;
        if (!freeAt(TB, B, x, z, ci)) continue;
        const v = -dl - back * 0.3 + Math.random() * 0.05;
        if (!best || v > best.v) best = { x, z, v };
      }
    }
  }
  if (best){ const b = B[ci]; b.x = best.x; b.z = best.z; b.st = 0; }
  else placeDefault();
}
// 조준하는 모습(1~2초)을 보여 주며 친다: 생각 → 돌리기 → 뒤로 빼기 → 치기
function aiTick(o, now){
  const sp = tScale();
  if (o.stage === 'place'){ if (now - o.t0 > 300 / sp){ if (st.gs.bih && !st.gs.brk){ aiPlace(o.seat); if (o.mine) sendPlace(true); } o.stage = 'think'; o.t0 = now; o.gen = planGen(o.seat, o.lv); o.a0 = st.aim.a; } return; }
  if (o.stage === 'think'){
    let r; const f0 = performance.now(); const sl = window.__blFps && window.__blFps < 30 ? 60 : 12; do { r = o.gen.next(); } while (!r.done && performance.now() - f0 < sl);   // 화면이 느린 기기에선 한 번에 더 많이
    o.idle = (o.idle || 0) + 1;
    if (!o.mine || st.mode === 'cpu') st.aim.a = o.a0 + Math.sin((now - o.t0) / 500) * 0.15;
    if (r.done){ o.plan = r.value; o.stage = 'wait'; }
    return;
  }
  if (o.stage === 'wait'){ if (now - o.t0 > (o.mine ? 250 : 700) / sp){ o.stage = 'turn'; o.t1 = now; o.from = st.aim.a; } return; }
  const turnT = (o.mine ? 250 : 650) / sp, pullT = (o.mine ? 250 : 550) / sp;
  if (o.stage === 'turn'){ const u = clamp((now - o.t1) / turnT, 0, 1), e = 1 - (1 - u) * (1 - u); st.aim.a = o.from + wrapA(o.plan.a - o.from) * e; st.spin = { x: o.plan.sx, y: o.plan.sy }; if (u >= 1){ o.stage = 'pull'; o.t2 = now; } return; }
  if (o.stage === 'pull'){ const u = clamp((now - o.t2) / pullT, 0, 1); st.aim.p = o.plan.p * u; st.pull = st.aim.p; if (u >= 1 && now - o.t2 > pullT + 120 / sp){ const p = o.plan; st.aim.a = p.a; shoot(p.a, p.p, p.sx, p.sy); } }
}

// =====================================================================
// 화면 글자판·조작 단추
// =====================================================================
const CSS = `
#blCv{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}
.blHud{position:absolute;inset:0;pointer-events:none;z-index:2;font-family:"Pretendard Variable",Pretendard,sans-serif;color:#fff}
.blBoard{position:absolute;left:8px;top:6px;background:rgba(14,12,10,.8);border-radius:8px;padding:4px 0;min-width:140px;max-width:calc(100% - 90px);box-shadow:0 2px 0 rgba(0,0,0,.3)}
.blRow{display:flex;align-items:center;gap:6px;height:24px;padding:0 8px;font-size:13px;font-weight:800;white-space:nowrap}
.blRow.blNow{background:rgba(255,210,80,.16)}
.blRow .blNm{min-width:0;max-width:92px;overflow:hidden;text-overflow:ellipsis}
.blRow .blSc{margin-left:auto;font-size:17px;font-weight:900;min-width:20px;text-align:right}
.blDot{width:13px;height:13px;border-radius:50%;flex:0 0 auto;box-shadow:inset -2px -2px 3px rgba(0,0,0,.35)}
.blMini{display:flex;gap:2px;margin-left:auto}
.blMb{width:14px;height:14px;border-radius:50%;font-size:8px;line-height:14px;text-align:center;color:#111;font-weight:900;box-shadow:inset -1px -2px 2px rgba(0,0,0,.35)}
.blMb.blGone{opacity:.18}
.blTag{margin-left:auto;font-size:12px;color:#E8D7B5;font-weight:700}
.blTime{position:absolute;right:8px;top:6px;min-width:42px;height:28px;border-radius:999px;background:rgba(14,12,10,.8);font-size:15px;font-weight:900;display:flex;align-items:center;justify-content:center;padding:0 10px}
.blTime.blLow{background:#C0392B}
.blTime:empty{display:none}
.blCall{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .15s;white-space:nowrap}
.blCall.blOn{opacity:1;animation:blPop .32s cubic-bezier(.2,1.5,.4,1)}
.blCall b{display:block;font-size:clamp(38px,9vw,78px);font-weight:900;line-height:1;color:#fff;text-shadow:0 4px 0 #1B120C,3px 0 0 #1B120C,-3px 0 0 #1B120C,0 -3px 0 #1B120C,0 10px 22px rgba(0,0,0,.4)}
.blCall.blHot b{color:#FFD84A}
.blCall small{display:inline-block;margin-top:8px;font-size:clamp(13px,2.4vw,17px);font-weight:800;background:rgba(14,12,10,.82);padding:4px 12px;border-radius:999px}
.blCall small:empty{display:none}
@keyframes blPop{from{transform:translate(-50%,-50%) scale(.6)}to{transform:translate(-50%,-50%) scale(1)}}
.blUi{position:absolute;inset:0;pointer-events:none;z-index:3}
.blUi button{pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none}
.blPow{position:absolute;right:10px;top:50%;width:52px;height:min(44%,250px);transform:translateY(-38%);pointer-events:auto;touch-action:none;border-radius:14px;background:rgba(14,12,10,.78);box-shadow:0 3px 0 rgba(0,0,0,.35)}
.blPowT{position:absolute;left:18px;right:18px;top:12px;bottom:12px;border-radius:8px;background:linear-gradient(#FBE2A0,#F29B38 55%,#D4402B);opacity:.28}
.blPowF{position:absolute;left:18px;right:18px;top:12px;height:0;border-radius:8px;background:linear-gradient(#FBE2A0,#F29B38 55%,#D4402B)}
.blPowK{position:absolute;left:6px;right:6px;height:12px;top:6px;border-radius:6px;background:#F4EEDC;box-shadow:0 2px 0 rgba(0,0,0,.4)}
.blPowL{position:absolute;left:0;right:0;bottom:-20px;text-align:center;font-size:11px;font-weight:800;color:#F4EEDC;text-shadow:0 1px 2px #000}
.blBtn{position:absolute;height:48px;min-width:48px;border-radius:12px;background:rgba(14,12,10,.8);color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 10px;box-shadow:0 3px 0 rgba(0,0,0,.35)}
.blBtn.blOn{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.35);background:rgba(60,50,40,.9)}
.blSpinB{left:10px;bottom:10px;width:56px;height:56px;border-radius:50%;padding:0;background:radial-gradient(circle at 36% 32%,#fff 0,#F2EEE4 45%,#BDB6A6 100%)}
.blSpinB i,.blSpinBig i{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#D8262B;left:50%;top:50%;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.blView{left:74px;bottom:14px;font-size:14px}
.blFineL{right:66px;bottom:10px;width:52px}.blFineR{right:10px;bottom:10px;width:52px}
.blSpinPad{position:absolute;inset:0;z-index:6;background:rgba(8,6,4,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;pointer-events:auto}
.blSpinBig{position:relative;width:min(60vw,240px);height:min(60vw,240px);border-radius:50%;background:radial-gradient(circle at 36% 32%,#fff 0,#F2EEE4 45%,#BDB6A6 100%);box-shadow:0 8px 24px rgba(0,0,0,.5);touch-action:none}
.blSpinBig::before{content:"";position:absolute;inset:10%;border-radius:50%;border:2px dashed rgba(0,0,0,.18)}
.blSpinBig::after{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px solid rgba(0,0,0,.12)}
.blSpinBig i{width:22px;height:22px;margin:-11px 0 0 -11px}
.blSpinPad p{color:#fff;font-size:14px;font-weight:700;text-align:center;line-height:1.5}
.blSpinPad .blBtn{position:static;background:#E05A1E;padding:0 26px}
.blHint{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);background:rgba(14,12,10,.82);color:#fff;font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;white-space:nowrap;pointer-events:none}
.blHint:empty{display:none}
`;
let hud = null, ui = null, hudCache = {};
function makeUi(){
  const sty = document.createElement('style'); sty.textContent = CSS; document.head.appendChild(sty);
  hud = document.createElement('div'); hud.className = 'blHud';
  hud.innerHTML = '<div class="blBoard" id="blBoard"></div><div class="blTime" id="blTime"></div><div class="blCall" id="blCall"><b id="blCallB"></b><small id="blCallS"></small></div><div class="blHint" id="blHint"></div>';
  stage.appendChild(hud);
  ui = document.createElement('div'); ui.className = 'blUi';
  ui.innerHTML = `<div class="blPow" id="blPow" role="slider" aria-label="힘: 아래로 끌었다 놓으면 칩니다"><div class="blPowT"></div><div class="blPowF" id="blPowF"></div><div class="blPowK" id="blPowK"></div><div class="blPowL">힘</div></div>
<button class="blBtn blSpinB" id="blSpinB" aria-label="당점 고르기"><i id="blSpinD"></i></button>
<button class="blBtn blView" id="blView" aria-label="시점 바꾸기">조준 시점</button>
${VS.isTouch ? '<button class="blBtn blFineL" id="blFineL" aria-label="왼쪽으로 조금">◀</button><button class="blBtn blFineR" id="blFineR" aria-label="오른쪽으로 조금">▶</button>' : ''}`;
  stage.appendChild(ui);
  const pad = document.createElement('div'); pad.className = 'blSpinPad hide'; pad.id = 'blSpinPad';
  pad.innerHTML = '<p>수구의 어디를 칠지 누르세요<br>위: 밀어치기 · 아래: 끌어치기 · 옆: 회전</p><div class="blSpinBig" id="blSpinBig"><i id="blSpinBD"></i></div><button class="blBtn" id="blSpinOk">확인</button>';
  stage.appendChild(pad);
  // 힘 막대: 아래로 끌면 큐가 뒤로 빠지고, 놓으면 친다
  const pw = $('blPow'); let pid = null, y0 = 0;
  pw.addEventListener('pointerdown', e => { e.preventDefault(); VS.ac(); if (!canShoot() || pid !== null) return; pid = e.pointerId; y0 = e.clientY; try { pw.setPointerCapture(pid); } catch {} st.dragPow = 0; });
  pw.addEventListener('pointermove', e => { if (e.pointerId !== pid || !st) return; const h = pw.clientHeight - 24; st.dragPow = clamp((e.clientY - y0) / h, 0, 1); st.pull = st.dragPow; st.aim.p = st.dragPow; });
  const pwUp = e => { if (e.pointerId !== pid) return; pid = null; if (!st) return; const p = st.dragPow; st.dragPow = null; if (p !== null && p >= 0.03 && canShoot()) shootMine(p); else { st.pull = 0; st.aim.p = 0; } };
  pw.addEventListener('pointerup', pwUp); pw.addEventListener('pointercancel', e => { if (e.pointerId === pid){ pid = null; if (st){ st.dragPow = null; st.pull = 0; st.aim.p = 0; } } });
  // 당점
  $('blSpinB').addEventListener('click', e => { e.preventDefault(); if (!st) return; $('blSpinPad').classList.remove('hide'); syncSpin(); });
  const big = $('blSpinBig');
  const setSp = e => { const r = big.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = -((e.clientY - r.top) / r.height * 2 - 1); const m = Math.sqrt(x * x + y * y); if (m > 0.8){ x *= 0.8 / m; y *= 0.8 / m; } if (st && canAim()){ st.spin = { x: x / 0.8, y: y / 0.8 }; syncSpin(); } };
  let sp = null;
  big.addEventListener('pointerdown', e => { e.preventDefault(); sp = e.pointerId; try { big.setPointerCapture(sp); } catch {} setSp(e); });
  big.addEventListener('pointermove', e => { if (e.pointerId === sp) setSp(e); });
  big.addEventListener('pointerup', e => { if (e.pointerId === sp) sp = null; });
  $('blSpinOk').onclick = () => $('blSpinPad').classList.add('hide');
  pad.addEventListener('pointerdown', e => { if (e.target === pad) pad.classList.add('hide'); });
  // 시점
  $('blView').onclick = () => { camMode = camMode === 'top' ? 'aim' : 'top'; $('blView').textContent = camMode === 'top' ? '조준 시점' : '전체 보기'; };
  // 미세 조정(누르고 있으면 계속)
  for (const [id, sg] of [['blFineL', 1], ['blFineR', -1]]){
    const b = $(id); if (!b) continue; let t = null, n = 0;
    const tick = () => { if (canAim()){ st.aim.a = wrapA(st.aim.a + sg * rotSign() * (n < 6 ? 0.0012 : n < 20 ? 0.003 : 0.008)); } n++; t = setTimeout(tick, n === 1 ? 260 : 45); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); VS.ac(); b.classList.add('blOn'); clearTimeout(t); n = 0; tick(); });
    const up = () => { clearTimeout(t); t = null; b.classList.remove('blOn'); };
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(k, up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
}
// 화면에서 ◀가 왼쪽으로 돌도록(카메라 방향에 따라 부호가 바뀜)
function rotSign(){
  if (!cam) return 1;
  const ci = RULE.cueIdx(st.gs), C = W.B[ci], a = st.aim.a;
  const p0 = scr(C.x, C.z), p1 = scr(C.x + Math.cos(a) * 0.3, C.z + Math.sin(a) * 0.3), p2 = scr(C.x + Math.cos(a + 0.05) * 0.3, C.z + Math.sin(a + 0.05) * 0.3);
  const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
  return cross > 0 ? -1 : 1;
}
function syncSpin(){
  if (!st) return;
  const s = st.spin || { x: 0, y: 0 };
  const d = $('blSpinD'); if (d) d.style.transform = `translate(${(s.x * 0.8 * 22).toFixed(1)}px,${(-s.y * 0.8 * 22).toFixed(1)}px)`;
  const big = $('blSpinBig'), bd = $('blSpinBD');
  if (big && bd){ const r = big.clientWidth / 2 || 110; bd.style.transform = `translate(${(s.x * 0.8 * r).toFixed(1)}px,${(-s.y * 0.8 * r).toFixed(1)}px)`; }
}
let callQ = [], callEnd = 0;
function showCall(big, small, hot){ callQ.push([big, small || '', hot]); }
function tickCall(now){
  const el = $('blCall'); if (!el) return;
  if (now < callEnd) return;
  if (!callQ.length){ if (el.classList.contains('blOn')) el.classList.remove('blOn'); return; }
  const [b, s, h] = callQ.shift();
  $('blCallB').textContent = b; $('blCallS').textContent = s;
  el.classList.remove('blOn'); void el.offsetWidth; el.classList.add('blOn'); el.classList.toggle('blHot', !!h);
  callEnd = now + 1300 / tScale();
}
function updateTurn(){
  if (!st) return;
  const t = RULE.turnText(st.gs, st.me, { phase: st.phase, cpu: st.mode === 'cpu', moving: st.phase === 'move' || st.phase === 'wait' });
  if (t !== st.turnTxt){ st.turnTxt = t; VS.setTurn(t); }
}
function updateHud(){
  if (!st) return;
  const h = RULE.hud(st.gs, st.me, st.names, W.B);
  if (hudCache.board !== h){ hudCache.board = h; $('blBoard').innerHTML = h; }
}
function setHint(t){ if (hudCache.hint !== t){ hudCache.hint = t; $('blHint').textContent = t; } }

// =====================================================================
// 입력
// =====================================================================
const canAim = () => myTurn() && !st.cpu && !st.bot && performance.now() > st.lock && VS.live();
const canShoot = () => canAim() && W.B[RULE.cueIdx(st.gs)].st === 0;
function shootMine(p){ const s = st.spin || { x: 0, y: 0 }; st.aim.p = p; shoot(st.aim.a, p, s.x, s.y); }
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _p = new THREE.Vector3(), _m = new THREE.Vector2();
function worldAt(cx, cy){
  const r = cv.getBoundingClientRect();
  _m.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height * 2 - 1));
  plane.constant = -TB.R; ray.setFromCamera(_m, cam);
  return ray.ray.intersectPlane(plane, _p) ? [_p.x, _p.z] : null;
}
function scr(x, z){ _v.set(x, TB.R, z).project(cam); return [(_v.x + 1) / 2 * SW, (1 - _v.y) / 2 * SH]; }
let ptr = null;   // {id, mode:'rot'|'pow'|'place', ...}
function onDown(e){
  if (!gameOn()) return;
  VS.ac(); e.preventDefault();
  if (ptr || !canAim()) return;
  const gs = st.gs, ci = RULE.cueIdx(gs), C = W.B[ci], w = worldAt(e.clientX, e.clientY);
  try { cv.setPointerCapture(e.pointerId); } catch {}
  // 프리볼: 수구 가까이를 누르면 끌어서 옮긴다
  if (gs.bih && w){ const [sx, sy] = scr(C.x, C.z), r = cv.getBoundingClientRect(); const dpx = Math.hypot(e.clientX - r.left - sx, e.clientY - r.top - sy); if (dpx < 46 || Math.hypot(w[0] - C.x, w[1] - C.z) < TB.R * 2.2){ ptr = { id: e.pointerId, mode: 'place' }; return; } }
  if (!VS.isTouch && e.button === 0 && C.st === 0){
    // PC: 누른 채 뒤로 끌었다 놓으면 친다
    const p0 = scr(C.x, C.z), p1 = scr(C.x + Math.cos(st.aim.a) * 0.3, C.z + Math.sin(st.aim.a) * 0.3); let bx = p0[0] - p1[0], by = p0[1] - p1[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    ptr = { id: e.pointerId, mode: 'pow', x0: e.clientX, y0: e.clientY, bx, by }; st.dragPow = 0; return;
  }
  ptr = { id: e.pointerId, mode: 'rot', w, x: e.clientX, y: e.clientY };
}
function onMove(e){
  if (!st || !gameOn()) return;
  if (!ptr){
    // PC 전체 보기: 마우스가 가리키는 곳으로 조준 / 조준 시점: 좌우로 움직인 만큼 돈다
    if (!VS.isTouch && canAim() && e.pointerType === 'mouse'){
      const ci = RULE.cueIdx(st.gs), C = W.B[ci];
      if (camMode === 'top' || st.phase !== 'aim'){ const w = worldAt(e.clientX, e.clientY); if (w && Math.hypot(w[0] - C.x, w[1] - C.z) > TB.R * 1.2) st.aim.a = Math.atan2(w[1] - C.z, w[0] - C.x); }
      else if (onMove.lx !== undefined) st.aim.a = wrapA(st.aim.a - (e.clientX - onMove.lx) * 0.003);
      onMove.lx = e.clientX;
    }
    return;
  }
  if (e.pointerId !== ptr.id) return;
  e.preventDefault();
  if (!canAim()){ ptr = null; st.dragPow = null; st.pull = 0; return; }
  const ci = RULE.cueIdx(st.gs), C = W.B[ci];
  if (ptr.mode === 'place'){
    const w = worldAt(e.clientX, e.clientY); if (!w) return;
    let x = clamp(w[0], -TB.hx + TB.R, TB.hx - TB.R), z = clamp(w[1], -TB.hz + TB.R, TB.hz - TB.R);
    if (st.gs.bih === 'k') x = Math.min(x, -TB.L / 4);
    if (freeAt(TB, W.B, x, z, ci)){ C.x = x; C.z = z; C.st = 0; sendPlace(); }
    return;
  }
  if (ptr.mode === 'pow'){
    const p = clamp(((e.clientX - ptr.x0) * ptr.bx + (e.clientY - ptr.y0) * ptr.by) / 200, 0, 1);
    st.dragPow = p; st.pull = p; st.aim.p = p; return;
  }
  // 돌리기: 전체 보기에선 수구 둘레를 손가락 따라, 조준 시점에선 좌우 끌기
  if (camMode === 'aim'){ st.aim.a = wrapA(st.aim.a - (e.clientX - ptr.x) * 0.0035); ptr.x = e.clientX; return; }
  const w = worldAt(e.clientX, e.clientY);
  if (w && ptr.w){
    const a0 = Math.atan2(ptr.w[1] - C.z, ptr.w[0] - C.x), a1 = Math.atan2(w[1] - C.z, w[0] - C.x);
    const dist = Math.hypot(w[0] - C.x, w[1] - C.z), g = clamp(dist / 0.35, 0.15, 1);
    st.aim.a = wrapA(st.aim.a + wrapA(a1 - a0) * g);
  }
  ptr.w = w;
}
function onUp(e){
  if (!ptr || e.pointerId !== ptr.id) return;
  const m = ptr.mode; ptr = null;
  if (!st) return;
  if (m === 'pow'){ const p = st.dragPow; st.dragPow = null; if (p !== null && p >= 0.03 && canShoot()) shootMine(p); else { st.pull = 0; st.aim.p = 0; } }
  if (m === 'place') sendPlace(true);
}
function onCancel(e){ if (ptr && e.pointerId === ptr.id){ ptr = null; if (st){ st.dragPow = null; st.pull = 0; } } }
const keys = {};
function onKey(e, down){
  if (!gameOn()) return;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight'){ keys[e.code] = down; e.preventDefault(); return; }
  if (e.code === 'Space'){
    e.preventDefault();
    if (down && !e.repeat && canShoot() && !st.space){ st.space = { t0: performance.now() }; }
    else if (!down && st.space){ const p = st.aim.p; st.space = null; if (p >= 0.03 && canShoot()) shootMine(p); else { st.aim.p = 0; st.pull = 0; } }
  }
}
let lastPlace = 0;
function sendPlace(force){
  if (st.mode !== 'net') return;
  const now = performance.now(); if (!force && now - lastPlace < 110) return; lastPlace = now;
  const C = W.B[RULE.cueIdx(st.gs)]; VS.send({ k: 'place', n: st.gs.n, x: +C.x.toFixed(4), z: +C.z.toFixed(4) });
}
let lastAimSend = 0, lastAimKey = '';
function sendAim(now){
  if (st.mode !== 'net' || !myTurn()) return;
  if (now - lastAimSend < 120) return;
  const s = st.spin || { x: 0, y: 0 }, a = +st.aim.a.toFixed(3), p = +(st.pull || 0).toFixed(2), key = a + ',' + p + ',' + s.x.toFixed(2) + s.y.toFixed(2);
  if (key === lastAimKey && now - lastAimSend < 1500) return;
  lastAimSend = now; lastAimKey = key;
  VS.send({ k: 'aim', n: st.gs.n, a, s: p, x: +s.x.toFixed(2), y: +s.y.toFixed(2) });
}

// =====================================================================
// 프레임
// =====================================================================
let lastT = 0, fpsN = 0, fpsT = 0;
window.__blFps = 0;
window.__blPerf = { tick: 0, draw: 0, n: 0 };
const falls = [];   // 포켓에 떨어지는·밖으로 튀는 연출
function startFall(i, s){ const b = W.B[i]; falls.push({ i, s, t0: performance.now(), x: b.x, z: b.z, pk: b.pk, jx: b.jx || 0, jz: b.jz || 0 }); }
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - (lastT || now)) / 1000); lastT = now;
  fpsN++; if (now - fpsT >= 1000){ window.__blFps = Math.round(fpsN * 1000 / (now - fpsT)); fpsN = 0; fpsT = now; adaptQuality(); }
  try {
    const p0 = performance.now();
    if (st && !st.stopped && st.running && VS.live()) tick(dt, now);
    const p1 = performance.now();
    if (renderer && st && gameOn()) draw(dt, now);
    const p2 = performance.now(), PF = window.__blPerf; PF.tick += p1 - p0; PF.draw += p2 - p1; PF.n++;   // 시험용 시간 재기
  } catch (e){ console.error(e); }
}
function tick(dt, now){
  const gs = st.gs;
  if (st.phase === 'move'){
    st.acc += dt * tScale();
    let n = 0;
    const was = W.B.map(b => b.st);
    while (st.acc >= DT && n < 480){
      st.acc -= DT; n++;
      if (!stepWorld(W)){ st.acc = 0; break; }
    }
    // 소리·떨어짐 연출
    for (const e of W.ev.splice(0)){
      if (e[0] === 'bb') snd('ball', clamp(e[1] / 3, 0.05, 1.2));
      else if (e[0] === 'cu') snd('cush', clamp(e[1] / 3, 0.05, 1));
      else if (e[0] === 'pk') snd('drop', 0.8);
      else if (e[0] === 'out') snd('out', 1);
    }
    W.B.forEach((b, k) => { if (was[k] === 0 && b.st !== 0) startFall(k, b.st); });
    // 받는 쪽: 최종 위치가 벌써 왔는데 내 계산이 오래 걸리면 그 값으로 맞춘다
    if (st.pend && now - st.pendAt > 2500){ W.moving = false; for (const b of W.B){ b.vx = b.vz = b.wx = b.wy = b.wz = 0; b.mv = false; } }
    if (!W.moving) onStop();
    return;
  }
  if (st.phase === 'wait'){
    if (now - st.waitRest > 10000){ st.phase = 'move'; st.waitRest = 0; resolve(W.log); }
    return;
  }
  if (st.phase !== 'aim') return;
  // 차례 시간
  st.turnEl += dt;
  const mine = gs.turn === st.me;
  if (st.turnEl >= TURN_SEC && (mine || st.mode === 'cpu')) return doTimeout(false);
  // 조준(키보드)
  if (canAim()){
    const k = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
    if (k){ st.keyT = (st.keyT || 0) + dt; st.aim.a = wrapA(st.aim.a + k * rotSign() * (st.keyT < 0.4 ? 0.06 : 0.3) * dt); } else st.keyT = 0;
    if (st.space){ const u = ((now - st.space.t0) / 1600) % 2; st.aim.p = u < 1 ? u : 2 - u; st.pull = st.aim.p; }
  }
  // 컴퓨터·시험 봇
  if (st.mode === 'cpu' && !mine){
    if (!st.cpu) st.cpu = { seat: gs.turn, lv: st.level, stage: 'place', t0: now, mine: false };
    aiTick(st.cpu, now);
  } else if (mine && st.bot){ aiTick(st.bot, now); }
  sendAim(now);
  // 안내
  const ci = RULE.cueIdx(gs), C = W.B[ci];
  setHint(mine && gs.bih && !st.bot ? (VS.isTouch ? '수구를 끌어 원하는 곳에 놓으세요' : '수구를 끌어 놓고 칩니다') : '');
}
function adaptQuality(){
  if (!renderer || !gameOn() || !st || !st.running) return;
  if (window.__blFps < 45 && PR > 1){ lowN++; if (lowN >= 2){ lowN = 0; PR = Math.max(1, PR - 0.25); renderer.setPixelRatio(PR); } } else lowN = 0;
}
const _eu = new THREE.Euler();
function draw(dt, now){
  const R = TB.R, gs = st.gs;
  // 공: 자리 + 굴러가는 방향으로 회전(질감이 돈다)
  W.B.forEach((b, i) => {
    const m = ballM[i];
    if (b.st === 0){
      m.visible = true; m.position.set(b.x, R, b.z); _v.set(b.x + 0.004, 0.0008, b.z + 0.006); ballSh.setMatrixAt(i, _sm.compose(_v, _flat, _one));
      const w2 = b.wx * b.wx + b.wy * b.wy + b.wz * b.wz;
      if (w2 > 1e-6 && st.phase === 'move'){ const w = Math.sqrt(w2); _ax.set(b.wx / w, b.wy / w, b.wz / w); _q.setFromAxisAngle(_ax, w * dt * tScale()); m.quaternion.premultiply(_q); }
    } else { m.visible = false; ballSh.setMatrixAt(i, _hid); }
  });
  ballSh.instanceMatrix.needsUpdate = true;
  // 떨어지는 공
  for (let k = falls.length - 1; k >= 0; k--){
    const f = falls[k], u = (now - f.t0) / 1000 * tScale(), m = ballM[f.i];
    if (u > 0.9 || W.B[f.i].st === 0){ falls.splice(k, 1); continue; }
    m.visible = true;
    if (f.s === 1){
      const p = TB.pockets[f.pk] || TB.pockets[0], g = clamp(u / 0.18, 0, 1);
      const x = lerp(f.x, p.cx, g), z = lerp(f.z, p.cz, g), y = u < 0.18 ? R : R - (u - 0.18) * (u - 0.18) * 9 - (u - 0.18) * 0.3;
      m.position.set(x, Math.max(y, -0.12), z); if (y < -0.1) m.visible = false;
    } else { m.position.set(f.x + f.jx * u * 1.2, R + u * 1.3 - u * u * 3.5, f.z + f.jz * u * 1.2); }
  }
  // 큐·조준선
  const ci = RULE.cueIdx(gs), C = W.B[ci];
  let show = false, a = st.aim.a, pull = st.pull || 0, spn = st.spin || { x: 0, y: 0 }, lines = false;
  if (st.phase === 'aim' && C.st === 0){
    if (gs.turn === st.me || st.mode === 'cpu'){ show = true; lines = gs.turn === st.me && !st.bot; if (st.mode === 'cpu' && gs.turn !== st.me) lines = false; }
    else if (st.oppAim && now - st.oppAim.at < 4000){ show = true; a = st.oppAim.a; pull = st.oppAim.s; spn = { x: st.oppAim.x, y: st.oppAim.y }; }
  }
  let strikeK = -1;
  if (st.shotAim && now - st.shotAim.t < 260 / tScale()){ show = true; a = st.shotAim.a; strikeK = (now - st.shotAim.t) / (260 / tScale()); spn = { x: st.shotAim.sx, y: st.shotAim.sy }; }
  cueG.visible = show;
  if (show){
    // 큐 끝은 당점 자리(수구 뒤), 힘을 모으면 뒤로 빠진다. 친 순간엔 앞으로 찌르고 사라진다
    const dx = Math.cos(a), dz = Math.sin(a), ox = spn.x * 0.5 * R, oy = spn.y * 0.5 * R;
    const back = strikeK >= 0 ? -0.01 * Math.min(1, strikeK * 4) : 0.012 + pull * 0.26;
    const bx = strikeK >= 0 ? st.shotAim.cx : C.x, bz = strikeK >= 0 ? st.shotAim.cz : C.z;
    cueG.position.set(bx - dx * (R * 0.95 + back) - dz * ox, R + oy + 0.004, bz - dz * (R * 0.95 + back) + dx * ox);
    cueG.rotation.set(0, -a, -0.07);
    if (strikeK >= 0) cueG.visible = strikeK < 1;
  }
  aimLine.visible = objLine.visible = ghost.visible = lines;
  if (lines){
    const tr = traceAim(TB, W.B, ci, a), y = 0.0012, len = tr.t;
    aimLine.scale.set(Math.max(0.001, len), VS.isTouch ? 1.5 : 1, 1); aimLine.position.set(C.x + Math.cos(a) * len / 2, y, C.z + Math.sin(a) * len / 2);
    aimLine.quaternion.setFromEuler(_eu.set(-Math.PI / 2, 0, -a, 'XYZ'));
    ghost.position.set(tr.gx, y + 0.0005, tr.gz);
    objLine.visible = tr.hit >= 0;
    if (tr.hit >= 0){ const T = W.B[tr.hit], l = 0.06 + 0.3 * Math.max(0, tr.cos), oa = Math.atan2(tr.nz, tr.nx); objLine.scale.set(l, VS.isTouch ? 1.5 : 1, 1); objLine.position.set(T.x + tr.nx * l / 2, y, T.z + tr.nz * l / 2); objLine.quaternion.setFromEuler(_eu.set(-Math.PI / 2, 0, -oa, 'XYZ')); }
  }
  // 프리볼 고리
  handRing.visible = st.phase === 'aim' && !!gs.bih && C.st === 0;
  if (handRing.visible){ handRing.position.set(C.x, 0.0015, C.z); const s = 1 + Math.sin(now / 220) * 0.08; handRing.scale.set(s, s, 1); }
  // 힘 막대
  const pv = st.phase === 'aim' && gs.turn === st.me ? (st.pull || 0) : 0;
  if (hudCache.pw !== pv){ hudCache.pw = pv; const pw = $('blPow'), h = pw.clientHeight - 24; $('blPowF').style.height = (pv * h).toFixed(0) + 'px'; $('blPowK').style.top = (6 + pv * h).toFixed(0) + 'px'; }
  const pwOn = canAim();
  if (hudCache.pwOn !== pwOn){ hudCache.pwOn = pwOn; $('blPow').style.opacity = pwOn ? 1 : 0.45; }
  // 시간
  let tt = '';
  if (st.phase === 'aim'){ const left = Math.max(0, Math.ceil(TURN_SEC - st.turnEl)); tt = String(left); }
  if (hudCache.tt !== tt){ hudCache.tt = tt; const el = $('blTime'); el.textContent = tt; el.classList.toggle('blLow', tt !== '' && +tt <= 10); }
  placeCamera(dt, false);
  tickCall(now);
  renderer.render(scene, cam);
}

// =====================================================================
// 게임 규약(VS.init) 연결
// =====================================================================
export async function start(rule){
  RULE = rule; BALLS = rule.balls; TB = makeTable(rule.table);
  const urls = [rule.table.feltImg, '/vs/common/bl-wood.jpg', '/vs/common/bg-billiard-wide.jpg', '/vs/common/bg-billiard-tall.jpg'];
  Object.assign(ASSET, await checkAssets(urls));
  const G = {
    id: rule.id, title: rule.title, sub: rule.sub,
    turnBased: true, countdown: false, ft: rule.ft || 3, cpuFt: rule.cpuFt || 2,
    levels: rule.levels, rules: rule.rules, controls: rule.controls,
    mount(stg){
      stage = stg;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        PR = Math.min(devicePixelRatio || 1, 2); renderer.setPixelRatio(PR);
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;   // 넓은 천에서 PCFSoft는 무겁다
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
        cv = renderer.domElement; cv.id = 'blCv'; stage.appendChild(cv);
        buildScene();
      } catch (e){ console.warn(e); renderer = null; cv = document.createElement('div'); cv.id = 'blCv'; stage.appendChild(cv); }
      makeUi();
      cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onCancel);
      cv.addEventListener('contextmenu', e => e.preventDefault());
      addEventListener('keydown', e => onKey(e, true)); addEventListener('keyup', e => onKey(e, false));
      addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (st) st.space = null; });
      requestAnimationFrame(frame);
    },
    start(ctx){
      const B = newBalls(), me = ctx.mode === 'cpu' ? 0 : ctx.mySeat;
      W = mkWorld(TB, B);
      const gs = rule.newGame(ctx, B, helpers);
      st = { ctx, mode: ctx.mode, level: ctx.level, me, names: ctx.names || ['나', '상대'], gs, running: false, stopped: false, phase: 'aim',
        aim: { a: 0, p: 0 }, pull: 0, spin: { x: 0, y: 0 }, turnEl: 0, lock: 0, acc: 0, cpu: null, bot: null, oppAim: null, pend: null, pendAt: 0, waitRest: 0, turnTxt: '', shooter: -1, shotAim: null };
      st.aim.a = defaultAim();
      callQ = []; callEnd = 0; hudCache = {}; falls.length = 0; ptr = null;
      $('blSpinPad').classList.add('hide'); syncSpin();
      if (!renderer) VS.note('이 브라우저는 3D 그림을 지원하지 않아요. 크롬이나 사파리 최신판으로 열어 주세요.');
      G.resize(); placeCamera(0, true);
      updateTurn(); updateHud();
    },
    go(){ if (!st) return; st.running = true; st.turnEl = 0; if (st.gs.turn === st.me) VS.sfx('turn'); },
    onNet(d){
      if (!st || st.stopped || !d || typeof d !== 'object') return;
      const gs = st.gs, opp = 1 - st.me, now = performance.now();
      if (d.n !== gs.n) return;
      if (d.k === 'aim'){ if (gs.turn === opp && st.phase === 'aim') st.oppAim = { a: +d.a || 0, s: clamp(+d.s || 0, 0, 1), x: clamp(+d.x || 0, -1, 1), y: clamp(+d.y || 0, -1, 1), at: now }; return; }
      if (d.k === 'place'){ if (gs.turn === opp && st.phase === 'aim' && gs.bih){ const x = +d.x, z = +d.z, ci = RULE.cueIdx(gs); if (isFinite(x) && isFinite(z) && freeAt(TB, W.B, x, z, ci)){ W.B[ci].x = x; W.B[ci].z = z; W.B[ci].st = 0; } } return; }
      if (d.k === 'shot'){
        if (gs.turn !== opp || st.phase !== 'aim') return;
        const v = d.v, w = d.w, c = d.c; if (!Array.isArray(v) || !Array.isArray(w) || !Array.isArray(c)) return;
        const s = { vx: +v[0], vz: +v[1], wx: +w[0], wy: +w[1], wz: +w[2] };
        if (![s.vx, s.vz, s.wx, s.wy, s.wz, +c[0], +c[1]].every(isFinite)) return;
        if (Math.sqrt(s.vx * s.vx + s.vz * s.vz) > VMAX * 1.01) return;
        const ci = RULE.cueIdx(gs), C = W.B[ci];
        if (gs.bih){ C.x = +c[0]; C.z = +c[1]; C.st = 0; }
        st.oppAim = null;
        const sp = Array.isArray(d.sp) ? d.sp : [0, 0];
        launch(s, +d.a || 0, clamp(+d.p || 0, 0, 1), clamp(+sp[0] || 0, -1, 1), clamp(+sp[1] || 0, -1, 1));
        return;
      }
      if (d.k === 'rest'){
        if (st.shooter !== opp || !Array.isArray(d.pos) || d.pos.length !== W.B.length || !d.lg) return;
        const r = { pos: d.pos, lg: cleanLog(d.lg) };
        if (st.phase === 'move'){ st.pend = r; st.pendAt = now; }
        else if (st.phase === 'wait'){ applyRest(r); st.waitRest = 0; resolve(r.lg); }
        return;
      }
      if (d.k === 'to'){ if (gs.turn === opp && st.phase === 'aim') doTimeout(true); }
    },
    stop(){ if (st){ st.stopped = true; st.cpu = null; st.bot = null; st.space = null; } ptr = null; for (const k in keys) keys[k] = false; },
    lost(){ return !!(st && st.phase === 'over' && st.overSeat === 1 - st.me); },
    resize(){
      if (!stage) return;
      SW = Math.max(200, stage.clientWidth); SH = Math.max(200, stage.clientHeight);
      if (renderer) renderer.setSize(SW, SH, false);
      if (cam){ topFit = null; fitTop(); }
      syncSpin();
    },
    drawArt: rule.drawArt,
  };
  // 배경: 그림이 있으면 당구장, 없으면 공용 경기장
  if (ASSET['/vs/common/bg-billiard-wide.jpg'] && ASSET['/vs/common/bg-billiard-tall.jpg']) G.bg = { wide: '/vs/common/bg-billiard-wide.jpg', tall: '/vs/common/bg-billiard-tall.jpg' };
  VS.init(G);
}

// ---------- 시험용(기본 동작은 그대로) ----------
// __blBot(): 내 차례이고 한가하면 보통 수준 컴퓨터가 대신 친다(시험 스크립트가 0.1초마다 부름)
window.__blBot = () => {
  if (!st || st.stopped || !st.running) return 'none';
  if (st.phase === 'aim' && st.gs.turn === st.me && !st.bot && performance.now() > st.lock && VS.live()) st.bot = { seat: st.me, lv: 'normal', stage: 'place', t0: performance.now(), mine: true };
  return st.phase;
};
window.__blLog = [];
window.__blTest = {
  get st(){ return st; }, get W(){ return W; }, get TB(){ return TB; }, get RULE(){ return RULE; }, helpers,
  strike: (a, p, sx, sy) => strike(a, p, sx, sy, TB.R), simulate: (B, i, s, t) => simulate(TB, B, i, s, t), traceAim: (B, ci, a) => traceAim(TB, B, ci, a),
  get scene(){ return scene; }, get renderer(){ return renderer; },
  newBalls, cloneBalls, info: () => { const r = renderer.info.render; let sc = 0, cast = 0; scene.traverse(o => { if (o.isMesh && o.visible){ sc++; if (o.castShadow) cast++; } }); return { calls: r.calls, tri: r.triangles, meshes: sc, casters: cast, lights: scene.children.filter(o => o.isLight).length }; }, fps: () => window.__blFps, PR: () => PR, cam: () => cam && { fov: +cam.fov.toFixed(1), mode: camMode },
  setView: m => { camMode = m; }, cueScr: () => { const C = W.B[RULE.cueIdx(st.gs)]; return scr(C.x, C.z); }, shoot: (a, p, sx, sy) => { if (canShoot()){ shoot(a, p, sx || 0, sy || 0); return true; } return false; },
  setAim: (a, p) => { if (st){ st.aim.a = a; st.pull = p || 0; st.aim.p = p || 0; } },
};
