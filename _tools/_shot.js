const { chromium } = require('C:/Users/USER/Downloads/프로젝트/youcall-promo/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/USER/Downloads/프로젝트/ac';
const OUT = path.join(ROOT, 'shots');

// index.html에서 앱 목록 추출
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const body = src.match(/const apps = \[([\s\S]*?)\n\];/)[1];
const items = [...body.matchAll(/name:'([^']+)'[\s\S]*?url:'([^']+)'/g)]
  .map(([, name, url]) => ({ name, url }));

// 공개 웹사이트만 (로그인 없이 열리는 것)
const PUBLIC = items.filter(a =>
  !a.url.includes('docs.google.com') &&
  !a.url.includes('drive.google.com') &&
  !a.url.includes('m.site.naver.com') &&
  !a.url.includes('github.com/')
);

// URL에서 안정적인 슬러그 생성
function slug(url) {
  const u = new URL(url);
  let s = u.hostname.replace(/^www\./, '').replace(/\.(github\.io|netlify\.app|com|net|kr)$/g, '');
  const p = u.pathname.replace(/^\/|\/$/g, '');
  if (p) s = (s === 'kimju1416' ? '' : s + '-') + p.replace(/\//g, '-');
  return s.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'index';
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 640 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
  });
  const manifest = {};
  let ok = 0, fail = 0;

  for (const app of PUBLIC) {
    const file = slug(app.url) + '.jpg';
    const page = await ctx.newPage();
    try {
      await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2800); // 폰트·이미지·애니메이션 안정화
      await page.screenshot({
        path: path.join(OUT, file),
        type: 'jpeg',
        quality: 68,
        clip: { x: 0, y: 0, width: 1024, height: 640 },
      });
      const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
      manifest[app.name] = file;
      console.log(`  OK   ${String(kb).padStart(4)}KB  ${file}  <- ${app.name}`);
      ok++;
    } catch (e) {
      console.log(`  FAIL           ${app.name} :: ${e.message.split('\n')[0].slice(0, 70)}`);
      fail++;
    }
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  await browser.close();
  console.log(`\n성공 ${ok} / 실패 ${fail} / 대상 ${PUBLIC.length}`);
})();
