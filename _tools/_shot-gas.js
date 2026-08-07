// 로그인 없이 열리는 GAS 라이브 배포를 캡처한다. 파일명은 index.html의 shot: 필드와 맞춘다.
const { chromium } = require('C:/Users/USER/Downloads/프로젝트/youcall-promo/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = 'C:/Users/USER/Downloads/프로젝트/ac/shots';

const TARGETS = [
  ['maeumjido-cho','AKfycbzphZ8wIvBkiX2KbU4nK8kh8JWT5lDAj7FNHgeV6Cpy4OD8-jgrW_A0tzgYexgfgCuF',''],
  ['maeumjido-jung','AKfycbz5fB48MvDkmGsuvjPkUdqMGWgJtHse6ykO1_qELcdlza3B3_e0Z3KBKRThw9OnziTB',''],
  ['timetable-swap','AKfycbwkUngQaLoFi0HspKCsB7iEvVqHUv5hyxhRPl1yu0a1UknBnZnisBkgQwC9sRbXhMQc',''],
  ['saemcall','AKfycbzd6IJLDghRFTdh5kpO9W2ht5btOyNESDG0cvOJtj7tsQzXOtyNqM6XegpeCdsXjftZ',''],
  ['youcall','AKfycbwgIxmGtns2UDmJ0rSAuswByqJGsbZjKBtJdwsfkE0LLO7t7awPRsqxQ79Ig9hIH9JOKA',''],
  ['teammix','AKfycbx8p2-_capdx4VlKt3mTA2-s-5nM0sIc0tQ7eqM62IUyOdAF2WHzxXymAmFvbPEymva-A',''],
  ['archive','AKfycbyBBrjhGiaz4VrcX-6iYZEmnBKTbrKYjfBfB3fqa0OQSZIX_ujD3hlsK-nFA8GwRfR8tA',''],
  ['paps','AKfycby1ucewElExFFQ7cO1pinvLscsa11jNnOKchbsh6h76hUQTG0mPZcZ5nL0sAMOnP3o',''],
];

(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport:{width:1024,height:900}, deviceScaleFactor:1, locale:'ko-KR' });
  let ok=0, fail=0;
  for (const [name, dep, q] of TARGETS) {
    const p = await c.newPage();
    try {
      await p.goto(`https://script.google.com/macros/s/${dep}/exec${q}`, { waitUntil:'domcontentloaded', timeout:35000 });
      await p.waitForTimeout(6500);
      // GAS 안내 배너 높이를 실측해 잘라낸다
      const BANNER = await p.evaluate(()=>{const b=document.querySelector('#sandboxFrame')||document.querySelector('iframe');return b?Math.round(b.getBoundingClientRect().top):44;}).catch(()=>44);          // GAS iframe 렌더 + 폰트 안정화
      const file = path.join(OUT, name + '.jpg');
      await p.screenshot({ path:file, type:'jpeg', quality:68, clip:{x:0,y:BANNER,width:1024,height:640} });
      console.log(`  OK  ${String(Math.round(fs.statSync(file).size/1024)).padStart(3)}KB  ${name}.jpg`);
      ok++;
    } catch(e) { console.log('  FAIL '+name+' :: '+e.message.split('\n')[0].slice(0,60)); fail++; }
    await p.close();
  }
  await b.close();
  console.log(`\n성공 ${ok} / 실패 ${fail}`);
})();
