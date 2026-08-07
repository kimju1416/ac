const { chromium } = require('C:/Users/USER/Downloads/프로젝트/youcall-promo/node_modules/playwright');
const OUT = 'C:/Users/USER/AppData/Local/Temp/claude/C--Users-USER-Downloads/20b5928b-23d3-4bca-92a6-fa4bf1fca4b7/scratchpad/';

(async () => {
  const b = await chromium.launch();

  // 1) 데스크탑 hover 팝업
  const c1 = await b.newContext({ viewport:{width:1440,height:900}, locale:'ko-KR' });
  const p1 = await c1.newPage();
  await p1.goto('http://localhost:8791/', { waitUntil:'domcontentloaded' });
  await p1.waitForTimeout(1500);
  const row = p1.locator('.app-row[data-shot]').filter({ hasText:'체육교과 플레이북' }).first();
  await row.scrollIntoViewIfNeeded();
  await p1.waitForTimeout(400);
  await row.hover();
  await p1.waitForTimeout(1400);   // 이미지 로드 + 트랜지션
  await p1.screenshot({ path: OUT+'verify-hover.png' });
  console.log('hover 팝업 표시:', await p1.locator('#shotPop.on').count() > 0);

  // 2) 모바일 라이트박스
  const c2 = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, locale:'ko-KR' });
  const p2 = await c2.newPage();
  await p2.goto('http://localhost:8791/', { waitUntil:'domcontentloaded' });
  await p2.waitForTimeout(1500);
  const btn = p2.locator('.shot-btn').first();
  await btn.scrollIntoViewIfNeeded();
  await p2.waitForTimeout(300);
  await btn.click();
  await p2.waitForTimeout(1400);
  await p2.screenshot({ path: OUT+'verify-lightbox.png' });
  console.log('라이트박스 열림:', await p2.locator('#shotLb.open').count() > 0);
  console.log('현재 URL 유지(이동 안함):', p2.url());

  // 3) 모바일 목록 (버튼 배치)
  await p2.locator('#shotLb').evaluate(el=>el.classList.remove('open'));
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: OUT+'verify-mobile-list.png' });

  await b.close();
})();
