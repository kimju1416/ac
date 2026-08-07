// shots/ 폴더의 jpg 목록을 읽어 index.html의 SHOTS 집합을 갱신한다.
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/USER/Downloads/프로젝트/ac';

const files = fs.readdirSync(path.join(ROOT, 'shots'))
  .filter(f => f.endsWith('.jpg'))
  .map(f => f.replace(/\.jpg$/, ''))
  .sort();

const idx = path.join(ROOT, 'index.html');
let src = fs.readFileSync(idx, 'utf8');

const list = files.map(f => `'${f}'`).join(',');
const next = src.replace(
  /const SHOTS = new Set\(\[[\s\S]*?\]\);/,
  `const SHOTS = new Set([${list}]);`
);

if (next === src) { console.error('!! SHOTS 블록을 찾지 못했습니다.'); process.exit(1); }
fs.writeFileSync(idx, next, 'utf8');
console.log(`SHOTS 갱신 완료 — ${files.length}개`);
files.forEach(f => console.log('   · ' + f));
