import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'child_process';
import fs from 'fs';
const FF='/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const mode=process.argv[2]||'preview', HTML=process.argv[4]||'video.html', WAV=process.argv[5]||'bgm.wav', OUT=process.argv[6]||'out.mp4', DUR=+(process.argv[7]||27);
const b=await chromium.launch({args:['--allow-file-access-from-files']});
const p=await b.newPage({viewport:{width:1080,height:1920}});
p.on('console',m=>console.log('PAGE',m.text())); p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('file://'+process.cwd()+'/'+HTML); await p.evaluate(()=>window.ready);
const grab=async T=>{const d=await p.evaluate(T=>{draw(T);return document.getElementById('c').toDataURL('image/jpeg',0.93)},T);return Buffer.from(d.split(',')[1],'base64')};
if(mode==='preview'){
  for(const T of (process.argv[3]||'3.5,8.5,14.5,20,26').split(',').map(Number)) fs.writeFileSync(`pv_${HTML.split('.')[0]}_${T}.jpg`,await grab(T));
}else{
  const FPS=30;
  const ff=spawn(FF,['-y','-f','image2pipe','-framerate',''+FPS,'-i','-','-i',WAV,'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart',OUT],{stdio:['pipe','ignore','inherit']});
  for(let i=0;i<FPS*DUR;i++){const buf=await grab(i/FPS); if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));}
  ff.stdin.end(); await new Promise(r=>ff.on('close',r));
}
await b.close();
