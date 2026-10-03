/* 체육 플레이북 학습지 공통 엔진: 이동·전체화면·문제·판정·기록·정리 점수·보조 함수 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var PE = { $: $, $$: $$, ENTER: {}, results: {}, G: 9.81, DEG: Math.PI / 180 };
  var slides = [], N = 0, cur = 0, backHref = '../index.html';

  /* ---------- 이동 ---------- */
  function show(i) {
    if (i < 0 || i >= N) return;
    slides[cur].classList.remove('on');
    cur = i;
    slides[cur].classList.add('on');
    slides[cur].scrollTop = 0;
    $('#bar').style.width = ((cur + 1) / N * 100) + '%';
    $('#cnt').textContent = (cur + 1) + ' / ' + N;
    $('#prev').disabled = cur === 0;
    $('#next').disabled = cur === N - 1;
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {}
    var f = PE.ENTER[slides[cur].id];
    if (f) f();
  }
  PE.show = show;
  PE.current = function () { return slides[cur] && slides[cur].id; };

  function toggleFs() {
    var d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); }
    else { var r = el.requestFullscreen || el.webkitRequestFullscreen; if (r) r.call(el); }
  }
  function leave() {
    if (window.parent !== window) { window.parent.postMessage('pe-lesson-close', '*'); }
    else { location.href = backHref; }
  }

  /* ---------- 문제 / 판정 ---------- */
  var jqs = [], jdots = [];
  function markDot(id, ok) {
    var i = jqs.map(function (q) { return q.dataset.id; }).indexOf(id);
    if (i > -1 && jdots[i]) jdots[i].className = ok ? 'ok' : 'no';
  }
  function initQuiz() {
    $$('.q').forEach(function (q) {
      var first = true, done = false, id = q.dataset.id, fb = $('.fb', q);
      var rev = q.dataset.reveal ? $(q.dataset.reveal) : $('.reveal', q);
      $$('.choice', q).forEach(function (c) {
        c.addEventListener('click', function () {
          if (done || c.disabled) return;
          if (c.hasAttribute('data-ok')) {
            done = true;
            c.classList.add('right');
            $$('.choice', q).forEach(function (x) { x.disabled = true; });
            if (!(id in PE.results)) PE.results[id] = first;
            fb.textContent = '';
            if (rev) rev.classList.add('show');
            if (q.classList.contains('jq')) markDot(id, first);
            var cb = PE.onAnswer && PE.onAnswer[id];
            if (cb) cb(first);
          } else {
            c.classList.add('wrong');
            c.disabled = true;
            fb.className = 'fb bad';
            fb.textContent = (c.dataset.why || '다시 생각해 보세요.') + ' 다시 골라 보세요.';
            if (first) { first = false; PE.results[id] = false; }
          }
        });
      });
    });
    jqs = $$('.jq');
    jdots = $$('#jdots span');
    $$('.nextj').forEach(function (b) {
      b.onclick = function () {
        var i = jqs.indexOf(b.closest('.jq'));
        jqs[i].classList.remove('cur');
        if (jqs[i + 1]) { jqs[i + 1].classList.add('cur'); if (jdots[i + 1] && jdots[i + 1].className === '') jdots[i + 1].className = 'on'; }
      };
    });
    if (jdots[0]) jdots[0].className = 'on';
  }
  PE.onAnswer = {};

  /* ---------- 보조 함수 ---------- */
  PE.loadImg = function (src, cb) {
    var im = new Image();
    im.onload = function () { cb && cb(im); };
    im.onerror = function () { cb && cb(null); };
    im.src = src;
    return im;
  };
  PE.lbl = function (ctx, t, x, y, opt) {
    opt = opt || {};
    ctx.font = (opt.w || 700) + ' ' + (opt.s || 34) + 'px Pretendard,sans-serif';
    ctx.textAlign = opt.a || 'left';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = opt.c || '#fff';
    ctx.fillText(t, x, y);
  };
  PE.tween = function (dur, fn) {
    var t0 = performance.now(), id = 0, dead = false;
    (function f(now) {
      if (dead) return;
      var u = Math.min(1, (now - t0) / dur), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      fn(u, e);
      if (u < 1) id = requestAnimationFrame(f);
    })(t0);
    return function () { dead = true; cancelAnimationFrame(id); };
  };
  PE.OFF = ['#ffa062', '#e8601c'];
  PE.DEF = ['#f2f2f4', '#a9a9b2'];
  /* 전술판 말 (x,y는 미터, S는 1m당 px) */
  PE.disc = function (ctx, S, x, y, txt, col, txtCol, rm) {
    var r = (rm || 0.42) * S, px = x * S, py = y * S;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
    var g = ctx.createRadialGradient(px - r * .3, py - r * .35, r * .1, px, py, r);
    g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
    ctx.fillStyle = txtCol; ctx.font = '800 ' + (r * 0.95) + 'px Pretendard,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, px, py + 1); ctx.textBaseline = 'alphabetic';
  };
  PE.dot = function (ctx, px, py, r, col) {
    ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 7); ctx.fill();
    ctx.fillStyle = col || '#ff7a2f'; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
  };

  /* 사진 위 삽입 그래프: 눈금이 있는 과학 도서식 궤적 그림. o: 상자(x,y,w,h)·범위(xmin,xmax,ymin,ymax)·눈금 간격(xt,yt) */
  PE.plot = function (ctx, o) {
    var pad = { l: 110, r: 30, t: 64, b: 96 };
    var pw = o.w - pad.l - pad.r, ph = o.h - pad.t - pad.b;
    function X(m) { return o.x + pad.l + (m - o.xmin) / (o.xmax - o.xmin) * pw; }
    function Y(m) { return o.y + pad.t + ph - (m - o.ymin) / (o.ymax - o.ymin) * ph; }
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,12,.82)';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '600 38px Pretendard,sans-serif';
    var v;
    ctx.textAlign = 'center';
    for (v = Math.ceil(o.xmin / o.xt) * o.xt; v <= o.xmax + 1e-9; v += o.xt) {
      ctx.beginPath(); ctx.moveTo(X(v), Y(o.ymin)); ctx.lineTo(X(v), Y(o.ymax)); ctx.stroke();
      ctx.fillText(String(Math.round(v * 10) / 10), X(v), Y(o.ymin) + 44);
    }
    ctx.textAlign = 'right';
    for (v = Math.ceil(o.ymin / o.yt) * o.yt; v <= o.ymax + 1e-9; v += o.yt) {
      ctx.beginPath(); ctx.moveTo(X(o.xmin), Y(v)); ctx.lineTo(X(o.xmax), Y(v)); ctx.stroke();
      ctx.fillText(String(Math.round(v * 10) / 10), X(o.xmin) - 12, Y(v) + 13);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(X(o.xmin), Y(o.ymax)); ctx.lineTo(X(o.xmin), Y(o.ymin)); ctx.lineTo(X(o.xmax), Y(o.ymin)); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)';
    if (o.xlabel) ctx.fillText(o.xlabel, o.x + pad.l + pw / 2, o.y + o.h - 14);
    if (o.title) { ctx.textAlign = 'left'; ctx.fillText(o.title, o.x + pad.l, o.y + 42); }
    if (o.ylabel) { ctx.save(); ctx.translate(o.x + 32, o.y + pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
    ctx.restore();
    return { X: X, Y: Y, clip: function () { ctx.save(); ctx.beginPath(); ctx.rect(o.x + pad.l, o.y + pad.t, pw, ph); ctx.clip(); }, unclip: function () { ctx.restore(); } };
  };

  /* 기록 활동: 성공/실패 누적 (localStorage 저장) */
  PE.tally = function (o) {
    var made = 0, tried = 0, total = o.total || 10;
    var out = $(o.n), msg = $(o.msg);
    function render() {
      out.innerHTML = made + '<em>/ ' + tried + '</em>';
      if (tried >= total) {
        msg.textContent = o.done(made, total);
        try { localStorage.setItem(o.key, String(made)); } catch (e) {}
      } else {
        msg.textContent = o.hint + ' (' + tried + '/' + total + ')';
      }
    }
    $(o.ok).onclick = function () { if (tried < total) { made++; tried++; render(); } };
    $(o.no).onclick = function () { if (tried < total) { tried++; render(); } };
    $(o.reset).onclick = function () { made = 0; tried = 0; render(); };
    render();
  };

  /* ---------- 시작 ---------- */
  PE.init = function (opts) {
    opts = opts || {};
    if (opts.back) backHref = opts.back;
    slides = $$('.slide');
    N = slides.length;
    $('#prev').onclick = function () { show(cur - 1); };
    $('#next').onclick = function () { show(cur + 1); };
    document.addEventListener('keydown', function (e) {
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { show(cur + 1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { show(cur - 1); e.preventDefault(); }
      else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) { toggleFs(); }
    });
    var x0 = null;
    document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var d = e.changedTouches[0].clientX - x0, t = e.target && e.target.tagName;
      if (Math.abs(d) > 70 && t !== 'INPUT' && t !== 'CANVAS') { d < 0 ? show(cur + 1) : show(cur - 1); }
      x0 = null;
    }, { passive: true });
    $('#fs').onclick = toggleFs;
    $('#close').onclick = leave;
    var b2 = $('#back2'); if (b2) b2.onclick = leave;
    var rd = $('#redo'); if (rd) rd.onclick = function () { location.hash = '#1'; location.reload(); };
    initQuiz();

    var sn = $('#sc-n');
    if (sn) {
      var sid = sn.closest('.slide').id, prev = PE.ENTER[sid];
      PE.ENTER[sid] = function () {
        var ids = $$('.q').map(function (q) { return q.dataset.id; }), ok = 0;
        ids.forEach(function (id) { if (PE.results[id] === true) ok++; });
        sn.textContent = ok;
        $('#sc-t').textContent = '/ ' + ids.length;
        if (prev) prev();
      };
    }
    var h = parseInt((location.hash || '').replace('#', ''), 10);
    show(h >= 1 && h <= N ? h - 1 : 0);
    window.addEventListener('hashchange', function () {
      var n = parseInt((location.hash || '').replace('#', ''), 10);
      if (n >= 1 && n <= N && n - 1 !== cur) show(n - 1);
    });
  };

  window.PE = PE;
})();
