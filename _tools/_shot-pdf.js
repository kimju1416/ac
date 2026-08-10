/**
 * PDF 표지를 미리보기 규격(1024x640)으로 만든다.
 * 구글 드라이브가 "파일이 너무 커서 미리보기를 표시할 수 없습니다"를 띄우는 대용량 PDF용.
 *
 *   node _tools/_shot-pdf.js "<PDF 경로>" <저장이름>
 *   예) node _tools/_shot-pdf.js "C:/Users/USER/Downloads/에듀테크 활용북(씨마스).pdf" cmass
 *
 * 1) PyMuPDF(python -c)로 1페이지를 PNG로 뽑고
 * 2) 세로 표지를 어두운 배경의 가로 프레임에 얹어 다른 미리보기와 톤을 맞춘다.
 */
const { chromium } = require('C:/Users/USER/Downloads/프로젝트/youcall-promo/node_modules/playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const [, , PDF, NAME] = process.argv;
if (!PDF || !NAME) {
  console.error('사용법: node _tools/_shot-pdf.js "<PDF 경로>" <저장이름>');
  process.exit(1);
}

const ROOT = 'C:/Users/USER/Downloads/프로젝트/ac';
const TMP = path.join(require('os').tmpdir(), NAME + '-cover.png');

// 1) 표지 추출 (세로 1280px)
const py = `
import fitz
doc = fitz.open(r"${PDF}")
page = doc[0]
zoom = 1280 / page.rect.height
pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
pix.save(r"${TMP}")
print(pix.width, pix.height, doc.page_count)
doc.close()
`;
const out = execFileSync('python', ['-c', py], { encoding: 'utf8' }).trim();
console.log('표지 추출:', out, '(가로 세로 총페이지)');

// 2) 1024x640 프레임에 배치
(async () => {
  const b64 = fs.readFileSync(TMP).toString('base64');
  const br = await chromium.launch();
  const c = await br.newContext({ viewport: { width: 1024, height: 640 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.setContent(`<style>
    html,body{margin:0;width:1024px;height:640px;overflow:hidden}
    body{background:#16181d;display:flex;align-items:center;justify-content:center}
    img{height:560px;width:auto;display:block;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  </style><img src="data:image/png;base64,${b64}">`);
  await p.waitForTimeout(1200);
  const dest = path.join(ROOT, 'shots', NAME + '.jpg');
  await p.screenshot({ path: dest, type: 'jpeg', quality: 74, clip: { x: 0, y: 0, width: 1024, height: 640 } });
  console.log('저장:', dest, Math.round(fs.statSync(dest).size / 1024) + 'KB');
  await br.close();
  fs.unlinkSync(TMP);
})();
