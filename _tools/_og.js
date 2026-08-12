// OG 이미지(1200x630) 생성. 앱 개수는 표기하지 않는다(문구가 낡는 것 방지).
const { chromium } = require('C:/Users/USER/Downloads/프로젝트/youcall-promo/node_modules/playwright');
const fs = require('fs');
const ROOT = 'C:/Users/USER/Downloads/프로젝트/ac';

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  const p = await c.newPage();
  await p.goto('http://localhost:8791/_tools/og-template.html', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: ROOT + '/og.jpg', type: 'jpeg', quality: 92 });
  const kb = Math.round(fs.statSync(ROOT + '/og.jpg').size / 1024);
  console.log('og.jpg 생성 —', kb + 'KB');
  await b.close();
})();
