const { chromium } = require('C:/Users/USER/Downloads/프로젝트/youcall-promo/node_modules/playwright');
const path=require('path'), fs=require('fs');
const OUT='C:/Users/USER/Downloads/프로젝트/ac/shots';
const T=[
 ['chekim','AKfycbzdB3NCoQrqB-EmIgeqGdu9hN9rsjx0SboDYMQZVZdicHHZYgJMv3UQwIeGXd3Xwcet2w'],
 ['lostfound','AKfycbzs_v0LXNEYdtrVP4YpLyrrMXY6MxFcBAz3KKSjb-yxzlLlMEW9PSpJTnaP8Wzk7irq2w'],
 ['hakpok-case','AKfycbyqUaIBoYZfeNvEyNgqEbsk5B7GueRhyUjhHBYiwgRaZW8QijgTnysz7Cp3mFO-IC3dKg'],
 ['hakpok-report','AKfycbwtNoBaAkll_0yjvYnYxLdCsIp7mDzHJ8CINdN3biyYvJ5XfYANVtIuhq4mM6SLmDTU'],
 ['schoolrule','AKfycbxfQaxzmOg2v890NpOhLK_QSTS4iTEayO2qjv92YGMsCBZpVfBQv2NeZkE8PqD7M4j2Yg'],
 ['consult','AKfycbwe1EyG7D2t3pR5-b3GYlRDaE5xaAAbwNVZFhtRYk8ue0VzlXHdx63HtplbKuypuH8X0w'],
 ['notice-jung','AKfycbydazAppiD53jKuGJWxQNIWBeuKfIjS1Bl1T9bCO35vWyfZ8N8YyM8necZ6TgXcaSYv'],
 ['notice-cho','AKfycbwg3jea2Qe6GeWowbeWTJiL_rg9u5a-Ir0ba093TCPuKPROlj5_PhLaq9Mc0suCFhVN'],
 ['seat','AKfycbwSHcUKYNczy2EINWWxBTy_YWo9BxcKuwQhEeynVfrLV12NlsO6yve6a4RNlZks9QMCaQ'],
 ['sportsmap','AKfycbxKmq6VNRxo2rHxhjzRhPL9JT_YRnKjZqe_uMA_X9iwtesY3dCF_yA-OriIcqVKdriEpQ'],
 ['classmemo','AKfycbzCROalZq7y3Gr3SbHA1QoleRKKw6R43djuP6ehPGn5FK1yS8V5noCnN8HLLnvIMaI6ew'],
 ['training','AKfycbxcohvhg_BldzZxR2P0d_i8DuPjmYj0sfDvwRVb_d7NOJ0se8DsoRCpJudmWqT0a1wf'],
 ['classassign','AKfycbyYdP4BcO6KUMCsv5vJ4bSqfbXW9EskhsVw4AF7-kO2pgqaUDC9OqTrIdxXFqOWLf0jiQ'],
];
(async()=>{
  const b=await chromium.launch();
  const c=await b.newContext({viewport:{width:1024,height:900},deviceScaleFactor:1,locale:'ko-KR'});
  let ok=0,fail=0;
  for(const [name,dep] of T){
    const p=await c.newPage();
    try{
      await p.goto(`https://script.google.com/macros/s/${dep}/exec`,{waitUntil:'domcontentloaded',timeout:35000});
      await p.waitForTimeout(6500);
      if(p.url().includes('accounts.google.com')){ console.log('  로그인벽 '+name); fail++; await p.close(); continue; }
      const BANNER=await p.evaluate(()=>{const b=document.querySelector('#sandboxFrame')||document.querySelector('iframe');return b?Math.round(b.getBoundingClientRect().top):44;}).catch(()=>44);
      const f=path.join(OUT,name+'.jpg');
      await p.screenshot({path:f,type:'jpeg',quality:68,clip:{x:0,y:BANNER,width:1024,height:640}});
      console.log(`  OK  ${String(Math.round(fs.statSync(f).size/1024)).padStart(3)}KB  ${name}.jpg`); ok++;
    }catch(e){ console.log('  FAIL '+name+' :: '+e.message.split('\n')[0].slice(0,50)); fail++; }
    await p.close();
  }
  await b.close();
  console.log(`\n성공 ${ok} / 실패 ${fail}`);
})();
