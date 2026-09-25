
const W=1080,H=1920,c=document.getElementById('c'),x=c.getContext('2d');
const NAVY='#0c1a3a',NAVY2='#162a57',GOLD='#d8b36a',GOLD2='#f3dca3',WHITE='#ffffff';
const img=new Image();img.src='bldg_clean.jpg';
let BA=1;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const eo=t=>1-Math.pow(1-clamp(t),3);             // easeOutCubic
const eb=t=>{t=clamp(t);const s=1.7;return 1+(s+1)*Math.pow(t-1,3)+s*Math.pow(t-1,2)}; // easeOutBack
const seg=(t,a,d)=>clamp((t-a)/d);
function A(a){x.globalAlpha=clamp(BA*a)}
function font(w,s){x.font=`${w} ${s}px K`}
function txt(s,X,Y,{w=700,size=60,color=WHITE,align='left',a=1,ls=0,shadow=0}={}){
  A(a);font(w,size);x.fillStyle=color;x.textAlign=align;x.textBaseline='alphabetic';
  x.letterSpacing=ls+'px';
  if(shadow){x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=shadow;x.shadowOffsetY=4}
  x.fillText(s,X,Y);x.shadowBlur=0;x.shadowOffsetY=0;x.letterSpacing='0px';
}
function rr(X,Y,w,h,r){x.beginPath();x.roundRect(X,Y,w,h,r)}
function goldGrad(y0,y1){const g=x.createLinearGradient(0,y0,0,y1);g.addColorStop(0,GOLD2);g.addColorStop(1,GOLD);return g}
// draw photo covering a rect with zoom/pan (sx,sy = focus 0..1)
function photo(zoom,fx,fy,X=0,Y=0,w=W,h=H){
  const iw=img.width,ih=img.height,s=Math.max(w/iw,h/ih)*zoom;
  const dw=iw*s,dh=ih*s;
  const dx=X+(w-dw)*fx,dy=Y+(h-dh)*fy;
  x.save();x.beginPath();x.rect(X,Y,w,h);x.clip();x.drawImage(img,dx,dy,dw,dh);x.restore();
}
function vgrad(stops){const g=x.createLinearGradient(0,0,0,H);stops.forEach(([p,c])=>g.addColorStop(p,c));return g}
function navyBG(){A(1);x.fillStyle=vgrad([[0,NAVY],[1,'#060e22']]);x.fillRect(0,0,W,H)}
function diag(t){ // decorative gold diagonal lines
  A(.35);x.strokeStyle=GOLD;x.lineWidth=3;
  const o=(t*40)%200;
  x.beginPath();x.moveTo(W-420+o*0,H+10);x.lineTo(W+10,H-430);x.stroke();
  x.beginPath();x.moveTo(W-300,H+10);x.lineTo(W+10,H-310);x.stroke();
  x.beginPath();x.moveTo(-10,420);x.lineTo(300,-10);x.stroke();
}
function brand(a){ // MISO SQUARE logo row
  A(a);x.strokeStyle=GOLD;x.lineWidth=5;
  x.beginPath();x.moveTo(90,178);x.lineTo(90,140);x.lineTo(108,160);x.lineTo(126,140);x.lineTo(126,178);x.stroke();
  txt('MISO SQUARE',146,176,{w:700,size:38,color:GOLD2,a,ls:6});
}


function check(X,Y,sz,a,col){A(a);x.strokeStyle=col;x.lineWidth=sz*.18;x.lineCap='round';x.lineJoin='round';
  x.beginPath();x.moveTo(X-sz*.35,Y);x.lineTo(X-sz*.08,Y+sz*.28);x.lineTo(X+sz*.4,Y-sz*.32);x.stroke();}
function run(SC,XF,END){
  window.draw=function(T){
    x.setTransform(1,0,0,1,0,0);BA=1;A(1);x.fillStyle='#000';x.fillRect(0,0,W,H);
    for(let i=0;i<SC.length;i++){const [a,b,f]=SC[i];
      if(T<a-XF||T>b) continue;
      const k=i===0?1:eo(clamp((T-(a-XF))/XF));BA=k;x.save();
      if(i>0&&k<1&&XF>0){x.translate(0,(1-k)*60)}
      f(Math.max(0,T-a));x.restore();}
    BA=1;if(END&&T>END-.6){A((T-(END-.6))/.6);x.fillStyle='#000';x.fillRect(0,0,W,H);A(1)}
  };
  window.ready=Promise.all([document.fonts.load('900 50px K'),document.fonts.load('700 50px K'),document.fonts.load('500 50px K'),new Promise(r=>img.complete?r():img.onload=r)]);
}
