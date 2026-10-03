/* ===== 체육 교과서 슬라이드 엔진 (공통) ===== */
(function () {
  // 다크모드 토글
  var darkBtn = document.createElement('button');
  darkBtn.className = 'dark-toggle';
  darkBtn.setAttribute('aria-label', '다크모드');
  darkBtn.textContent = '🌙';
  document.body.appendChild(darkBtn);
  if(localStorage.getItem('pe-dark')==='1') document.body.classList.add('dark');
  darkBtn.addEventListener('click', function(){
    document.body.classList.toggle('dark');
    darkBtn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    localStorage.setItem('pe-dark', document.body.classList.contains('dark') ? '1' : '0');
  });
  if(document.body.classList.contains('dark')) darkBtn.textContent = '☀️';

  // 발표 모드 (전체화면 — 주소창 등 브라우저 UI 숨기고 화면 가득 채움)
  var fsBtn = document.createElement('button');
  fsBtn.className = 'fs-toggle';
  fsBtn.setAttribute('aria-label', '발표 모드(전체화면)');
  fsBtn.innerHTML = '⛶';
  document.body.appendChild(fsBtn);

  function isFullscreen(){
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function enterFullscreen(){
    var el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }
  function exitFullscreen(){
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  function toggleFullscreen(){
    if (isFullscreen()) exitFullscreen(); else enterFullscreen();
  }
  function syncFsBtn(){
    var full = isFullscreen();
    fsBtn.classList.toggle('is-full', full);
    fsBtn.setAttribute('aria-label', full ? '발표 모드 종료' : '발표 모드(전체화면)');
    document.body.classList.toggle('presenting', full);
  }
  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', syncFsBtn);
  document.addEventListener('webkitfullscreenchange', syncFsBtn);
  document.addEventListener('keydown', function(e){
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      toggleFullscreen();
      e.preventDefault();
    }
  });

  // 학습지 모드 (body[data-lesson]이 있는 종목만): 같은 화면 위에 학습지를 겹쳐 열어 전체화면을 유지한다
  (function(){
    var href = document.body.getAttribute('data-lesson');
    if (!href) return;
    var btn = document.createElement('button');
    btn.className = 'lesson-btn';
    btn.setAttribute('aria-label', '학습지');
    btn.textContent = '학습지';
    document.body.appendChild(btn);
    var wrap = null;
    function open(){
      if (wrap) return;
      wrap = document.createElement('div');
      wrap.className = 'lesson-overlay';
      var f = document.createElement('iframe');
      f.src = href; f.title = '학습지';
      f.setAttribute('allow', 'fullscreen'); f.setAttribute('allowfullscreen', '');
      wrap.appendChild(f); document.body.appendChild(wrap);
      f.addEventListener('load', function(){ try { f.contentWindow.focus(); } catch (e) {} });
    }
    function close(){ if (!wrap) return; wrap.remove(); wrap = null; }
    btn.addEventListener('click', open);
    window.addEventListener('message', function(e){ if (e.data === 'pe-lesson-close') close(); });
  })();

  // 테이블 자동 래퍼 (가로 스크롤 지원)
  document.querySelectorAll('.slide table').forEach(function(t){
    if(!t.parentElement.classList.contains('table-wrap')){
      var w=document.createElement('div');w.className='table-wrap';
      t.parentNode.insertBefore(w,t);w.appendChild(t);
    }
  });

  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  if (!slides.length) return;
  var total = slides.length;
  var cur = 0;

  var progress = document.querySelector('.progress');
  var counter = document.querySelector('.counter');
  var prevBtn = document.getElementById('prev');
  var nextBtn = document.getElementById('next');
  var dotsBox = document.querySelector('.dots');

  // 점(dot) 생성
  var dots = [];
  if (dotsBox) {
    slides.forEach(function (_, i) {
      var d = document.createElement('i');
      d.setAttribute('tabindex', '0');
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', '슬라이드 ' + (i + 1));
      d.addEventListener('click', function () { go(i); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { go(i); e.preventDefault(); } });
      dotsBox.appendChild(d);
      dots.push(d);
    });
  }

  function show(i) {
    slides[cur].classList.remove('active');
    cur = i;
    slides[cur].classList.add('active');
    slides[cur].scrollTop = 0;
    if (progress) progress.style.width = ((cur + 1) / total * 100) + '%';
    if (counter) counter.textContent = (cur + 1) + ' / ' + total;
    if (prevBtn) prevBtn.disabled = (cur === 0);
    if (nextBtn) nextBtn.disabled = (cur === total - 1);
    dots.forEach(function (d, k) { d.classList.toggle('on', k === cur); });
    // 커버 슬라이드면 body에 on-cover 클래스 토글
    document.body.classList.toggle('on-cover', slides[cur].classList.contains('cover'));
    // 상단바 잠깐 보였다가 사라짐
    var topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.classList.add('show');
      clearTimeout(topbar._hideTimer);
      topbar._hideTimer = setTimeout(function () { topbar.classList.remove('show'); }, 1500);
    }
    if (location.hash !== '#' + (cur + 1)) {
      history.replaceState(null, '', '#' + (cur + 1));
    }
  }
  function go(i) { if (i >= 0 && i < total) show(i); }
  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  if (nextBtn) nextBtn.addEventListener('click', next);
  if (prevBtn) prevBtn.addEventListener('click', prev);

  // 키보드
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); e.preventDefault(); }
    else if (e.key === 'Home') { go(0); }
    else if (e.key === 'End') { go(total - 1); }
  });

  // 슬라이드 클릭으로 다음 넘기기
  document.querySelector('.deck').addEventListener('click', function (e) {
    if (e.target.closest('a, button, input, select, textarea, .dots, .nav, .quiz-btns')) return;
    next();
  });

  // 터치 스와이프
  var x0 = null;
  document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    x0 = null;
  }, { passive: true });

  // 해시로 특정 슬라이드 바로가기 (#3 등)
  window.addEventListener('hashchange', function () {
    var h = parseInt((location.hash || '').replace('#', ''), 10);
    if (h >= 1 && h <= total && h - 1 !== cur) show(h - 1);
  });

  // ===== 목차(TOC) 오버뷰 =====
  // 버튼 생성
  var tocBtn = document.createElement('button');
  tocBtn.className = 'toc-btn';
  tocBtn.setAttribute('aria-label', '목차');
  tocBtn.innerHTML = '☰';
  document.body.appendChild(tocBtn);

  // 오버레이
  var tocOverlay = document.createElement('div');
  tocOverlay.className = 'toc-overlay';
  document.body.appendChild(tocOverlay);

  // 패널
  var tocPanel = document.createElement('div');
  tocPanel.className = 'toc-panel';

  var tocHeader = document.createElement('div');
  tocHeader.className = 'toc-header';
  tocHeader.innerHTML = '<h3>📑 슬라이드 목차</h3>';
  var tocClose = document.createElement('button');
  tocClose.className = 'toc-close';
  tocClose.innerHTML = '✕';
  tocHeader.appendChild(tocClose);
  tocPanel.appendChild(tocHeader);

  var tocGrid = document.createElement('div');
  tocGrid.className = 'toc-grid';

  slides.forEach(function (slide, i) {
    var card = document.createElement('div');
    card.className = 'toc-card';
    if (slide.classList.contains('cover')) card.classList.add('is-cover');

    // 썸네일 내용 추출
    var thumb = document.createElement('div');
    thumb.className = 'toc-thumb';

    var emoji = slide.querySelector('.emoji');
    var tag = slide.querySelector('.tag');
    var h2 = slide.querySelector('h2');
    var h1 = slide.querySelector('h1');
    var title = h2 ? h2.textContent : (h1 ? h1.textContent : '슬라이드 ' + (i + 1));

    if (emoji) {
      var me = document.createElement('div');
      me.className = 'mini-emoji';
      me.textContent = emoji.textContent;
      thumb.appendChild(me);
    }
    if (tag) {
      var mt = document.createElement('div');
      mt.className = 'mini-tag';
      mt.textContent = tag.textContent;
      thumb.appendChild(mt);
    }
    var mtitle = document.createElement('div');
    mtitle.className = 'mini-title';
    mtitle.textContent = title;
    thumb.appendChild(mtitle);

    card.appendChild(thumb);

    // 하단 번호 + 라벨
    var footer = document.createElement('div');
    footer.className = 'toc-card-footer';
    var num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    var label = document.createElement('span');
    label.className = 'label';
    label.textContent = title.length > 20 ? title.substring(0, 20) + '…' : title;
    footer.appendChild(num);
    footer.appendChild(label);
    card.appendChild(footer);

    card.addEventListener('click', function () {
      go(i);
      closeToc();
    });

    tocGrid.appendChild(card);
  });

  tocPanel.appendChild(tocGrid);
  document.body.appendChild(tocPanel);

  function openToc() {
    // 현재 슬라이드 표시
    var cards = tocGrid.querySelectorAll('.toc-card');
    cards.forEach(function (c, k) { c.classList.toggle('current', k === cur); });
    tocOverlay.classList.add('open');
    tocPanel.classList.add('open');
  }
  function closeToc() {
    tocOverlay.classList.remove('open');
    tocPanel.classList.remove('open');
  }

  tocBtn.addEventListener('click', openToc);
  tocClose.addEventListener('click', closeToc);
  tocOverlay.addEventListener('click', closeToc);

  // ESC로 닫기
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && tocPanel.classList.contains('open')) {
      closeToc();
      e.preventDefault();
    }
  });

  // ===== 공유 (링크 · QR코드) =====
  (function initShare() {
    var shareBtn = document.createElement('button');
    shareBtn.className = 'share-btn';
    shareBtn.setAttribute('aria-label', '공유');
    shareBtn.innerHTML = '🔗';
    document.body.appendChild(shareBtn);

    var overlay = document.createElement('div');
    overlay.className = 'share-overlay';
    var modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML =
      '<button class="share-close" aria-label="닫기">✕</button>' +
      '<h3>📤 이 페이지 공유하기</h3>' +
      '<img class="share-qr" alt="QR 코드">' +
      '<div class="share-url"></div>' +
      '<div class="share-actions">' +
        '<button class="share-action share-copy">🔗 링크 복사</button>' +
        '<button class="share-action share-native" style="display:none">📤 공유하기</button>' +
      '</div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var qrImg = modal.querySelector('.share-qr');
    var urlBox = modal.querySelector('.share-url');
    var copyBtn = modal.querySelector('.share-copy');
    var nativeBtn = modal.querySelector('.share-native');
    var closeBtn = modal.querySelector('.share-close');

    if (navigator.share) nativeBtn.style.display = '';

    function openShare(url, title) {
      urlBox.textContent = url;
      qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(url);
      overlay.classList.add('open');
      copyBtn.textContent = '🔗 링크 복사';
      nativeBtn.onclick = function () {
        navigator.share({ title: title || document.title, url: url }).catch(function () {});
      };
    }
    function closeShare() { overlay.classList.remove('open'); }

    copyBtn.addEventListener('click', function () {
      navigator.clipboard.writeText(urlBox.textContent).then(function () {
        copyBtn.textContent = '✅ 복사됨!';
        setTimeout(function () { copyBtn.textContent = '🔗 링크 복사'; }, 1500);
      });
    });
    closeBtn.addEventListener('click', closeShare);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeShare(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeShare(); });

    shareBtn.addEventListener('click', function () {
      openShare(location.href.split('#')[0], document.title);
    });
  })();

  // ===== 인터랙티브 O/X 퀴즈 =====
  (function initQuiz() {
    // Find all <li> elements whose <span class="n"> text matches Q1~Q9
    var quizItems = Array.prototype.slice.call(document.querySelectorAll('.slide li'));
    var quizBySlide = {};

    quizItems.forEach(function (li) {
      var nSpan = li.querySelector('.n');
      if (!nSpan || !/^Q\d+$/i.test(nSpan.textContent.trim())) return;

      var divEl = li.querySelector('div');
      if (!divEl) return;

      // Parse: <b>질문</b> — O. 해설  or  <b>질문</b> — X. 해설
      var html = divEl.innerHTML;
      var bMatch = divEl.querySelector('b');
      if (!bMatch) return;
      var question = bMatch.textContent;

      // Get text after </b>
      var afterB = html.substring(html.indexOf('</b>') + 4).trim();
      // Match pattern: — O. explanation  or  — X. explanation  or  — True/False. explanation
      var m = afterB.match(/^[\s—–-]+\s*([OX])\.\s*([\s\S]*)$/);
      if (!m) {
        var mEn = afterB.match(/^[\s—–-]+\s*(True|False)[\.\!]?\s*([\s\S]*)$/i);
        if (mEn) m = [null, mEn[1].toLowerCase() === 'true' ? 'O' : 'X', mEn[2]];
      }
      if (!m) return;

      var correctAnswer = m[1]; // "O" or "X"
      var explanation = m[2].trim();

      // Find which slide this belongs to
      var slideEl = li.closest('.slide');
      if (!slideEl) return;
      var slideIdx = slides.indexOf(slideEl);
      if (!quizBySlide[slideIdx]) quizBySlide[slideIdx] = [];
      quizBySlide[slideIdx].push({ li: li, question: question, correct: correctAnswer, explanation: explanation, nSpan: nSpan });
    });

    // Rebuild each quiz item
    Object.keys(quizBySlide).forEach(function (sIdx) {
      var items = quizBySlide[sIdx];
      var answered = 0;
      var score = 0;
      var totalQ = items.length;
      var slideEl = slides[parseInt(sIdx, 10)];
      var ulEl = items[0].li.parentElement;

      items.forEach(function (item) {
        var li = item.li;
        li.className = 'quiz-item';

        var qLabel = item.nSpan.textContent.trim();
        li.innerHTML = '';

        var span = document.createElement('span');
        span.className = 'n';
        span.textContent = qLabel;
        li.appendChild(span);

        var wrapper = document.createElement('div');

        var qDiv = document.createElement('div');
        qDiv.className = 'quiz-q';
        qDiv.textContent = item.question;
        wrapper.appendChild(qDiv);

        var btnsDiv = document.createElement('div');
        btnsDiv.className = 'quiz-btns';

        var btnO = document.createElement('button');
        btnO.className = 'quiz-btn';
        btnO.setAttribute('data-choice', 'O');
        btnO.textContent = 'O';

        var btnX = document.createElement('button');
        btnX.className = 'quiz-btn';
        btnX.setAttribute('data-choice', 'X');
        btnX.textContent = 'X';

        btnsDiv.appendChild(btnO);
        btnsDiv.appendChild(btnX);
        wrapper.appendChild(btnsDiv);

        var ansDiv = document.createElement('div');
        ansDiv.className = 'quiz-answer';
        ansDiv.setAttribute('data-correct', item.correct);
        ansDiv.textContent = item.explanation;
        wrapper.appendChild(ansDiv);

        li.appendChild(wrapper);

        // Click handler
        function handleClick(e) {
          var btn = e.currentTarget;
          var choice = btn.getAttribute('data-choice');
          var isCorrect = (choice === item.correct);

          // Disable both buttons
          btnO.classList.add('disabled');
          btnX.classList.add('disabled');

          // Highlight chosen button
          if (isCorrect) {
            btn.classList.add('correct');
            ansDiv.classList.add('is-correct');
            score++;
          } else {
            btn.classList.add('wrong');
            ansDiv.classList.add('is-wrong');
            // Also highlight the correct one
            if (item.correct === 'O') btnO.classList.add('correct');
            else btnX.classList.add('correct');
          }

          // Show explanation
          ansDiv.classList.add('show');

          answered++;
          if (answered === totalQ) {
            var scoreDiv = document.createElement('div');
            scoreDiv.className = 'quiz-score';
            scoreDiv.textContent = score + '/' + totalQ + ' 정답!';
            var resetBtn = document.createElement('button');
            resetBtn.className = 'quiz-btn';
            resetBtn.style.cssText = 'margin:12px auto 0;display:block;font-size:14px;padding:8px 20px';
            resetBtn.textContent = '다시 풀기';
            resetBtn.addEventListener('click', function(){ location.reload(); });
            scoreDiv.appendChild(resetBtn);
            ulEl.parentElement.appendChild(scoreDiv);
          }
        }

        btnO.addEventListener('click', handleClick);
        btnX.addEventListener('click', handleClick);
      });
    });
  })();

  // 도면 SVG 맞춤: 여백을 잘라 도면을 키우고, 너무 작은 글자는 읽을 크기로 키운다
  function fitFigures() {
    Array.prototype.forEach.call(document.querySelectorAll('.figure svg[viewBox]'), function (svg) {
      if (svg.getAttribute('data-fit')) return;
      try {
        var vb = svg.viewBox.baseVal;
        if (!vb || !vb.width || !svg.getScreenCTM()) return;
        // 화면 좌표로 잰 각 요소의 범위를 도면 좌표로 되돌려 합친다 (전체를 덮는 배경은 제외)
        function content() {
          var m = svg.getScreenCTM().inverse(), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          Array.prototype.forEach.call(svg.children, function (c) {
            if (/^(defs|title|desc|style|linearGradient|radialGradient|clipPath|mask|pattern|marker)$/i.test(c.tagName)) return;
            var r = c.getBoundingClientRect();
            if (!r.width && !r.height) return;
            var p1 = svg.createSVGPoint(), p2 = svg.createSVGPoint();
            p1.x = r.left; p1.y = r.top; p2.x = r.right; p2.y = r.bottom;
            p1 = p1.matrixTransform(m); p2 = p2.matrixTransform(m);
            if (p2.x - p1.x >= vb.width * 0.9 && p2.y - p1.y >= vb.height * 0.9) return;
            x0 = Math.min(x0, p1.x); y0 = Math.min(y0, p1.y); x1 = Math.max(x1, p2.x); y1 = Math.max(y1, p2.y);
          });
          return x1 > x0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
        }
        var texts = svg.querySelectorAll('text'), minPx = 1e9;
        Array.prototype.forEach.call(texts, function (t) {
          var fs = parseFloat(getComputedStyle(t).fontSize) || 0;
          if (fs && fs < minPx) minPx = fs;
        });
        var b = content();
        if (!b) return;
        var pad = Math.max(b.width, b.height) * 0.03, w = b.width + pad * 2;
        var rw = svg.getBoundingClientRect().width, sl = svg.closest('.slide'), sw = sl ? sl.getBoundingClientRect().width : 1280;
        var asp = w / (b.height + pad * 2), wide = asp > 1.15, tall = asp < 0.9;
        var shh = sl ? sl.getBoundingClientRect().height : 720;
        if (tall && rw) rw = Math.min(rw, (shh - 340) * asp);   // 세로로 긴 도면은 슬라이드 높이에 맞춰 줄어든다
        var need = rw ? 14 * (w / (rw * (wide ? 1.35 : 1))) * (1280 / sw) : 0;   // 슬라이드 폭 1280 기준으로 글자 11px 이상
        if (minPx < 1e9 && minPx < need) {
          var f = Math.min(tall ? 2.6 : 2.2, need / minPx);
          Array.prototype.forEach.call(texts, function (t) {
            t.style.fontSize = (parseFloat(getComputedStyle(t).fontSize) * f) + 'px';
          });
          b = content() || b;
          pad = Math.max(b.width, b.height) * 0.03; w = b.width + pad * 2;
        }
        svg.setAttribute('viewBox', [b.x - pad, b.y - pad, w, b.height + pad * 2].join(' '));
        svg.setAttribute('data-fit', '1');
        if (tall) svg.classList.add('tall-fig');
        var sp = svg.closest('.split');
        if (sp && (w / (b.height + pad * 2)) > 1.15) sp.classList.add('wide-fig');   // 가로로 긴 도면은 칸을 넓게
      } catch (e) {}
    });
  }
  fitFigures();
  window.addEventListener('load', fitFigures);

  // 시작 슬라이드 (해시 지원)
  var start = parseInt((location.hash || '').replace('#', ''), 10);
  show(start >= 1 && start <= total ? start - 1 : 0);
})();
