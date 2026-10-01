import io
s=io.open('index.html',encoding='utf-8').read()
css='''
<style>
.mk{position:relative;margin:48px 0;outline:2px dashed #C9D7E8;outline-offset:14px;border-radius:6px}
.mk>.mt{position:absolute;top:-30px;left:-6px;background:#15171B;color:#D4F25A;font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;letter-spacing:-.01em}
.stats{display:grid;grid-template-columns:repeat(4,1fr);background:#15171B;color:#fff;border-radius:var(--r);overflow:hidden}
.stats div{padding:26px 24px;border-right:1px solid rgba(255,255,255,.1)}.stats div:last-child{border:0}
.stats b{display:block;font-size:34px;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.stats b em{font-style:normal;color:var(--lime)}.stats span{font-size:13.5px;color:#A9AEB6}
.news{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:18px}
.nw{background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}
.nw .im{aspect-ratio:16/10;background:var(--soft);overflow:hidden}.nw img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.nw .tx{padding:16px 18px 18px}.nw .d{font-size:12px;font-weight:700;color:#3C6E00;background:#EEF9C8;display:inline-block;padding:3px 8px;border-radius:6px}
.nw h3{font-size:18px;letter-spacing:-.03em;margin:8px 0 4px}.nw p{font-size:13.5px;color:var(--sub);line-height:1.5}
.nw:first-child h3{font-size:21px}
.qs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.q{background:var(--sky);border-radius:var(--r);padding:26px 24px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:170px}
.q p{font-size:17px;line-height:1.55;letter-spacing:-.02em;font-weight:600;color:var(--ink)}
.q p:before{content:"“";display:block;font-size:44px;line-height:.6;color:#9DB6D3;font-weight:800;margin-bottom:10px}
.q small{font-size:12.5px;color:var(--mute);margin-top:16px}
.vids{display:grid;grid-template-columns:1fr auto auto;gap:22px;align-items:center;background:#15171B;border-radius:24px;padding:34px 40px;color:#fff}
.vids h3{font-size:28px;letter-spacing:-.04em;line-height:1.25}.vids p{color:#A9AEB6;font-size:14.5px;margin-top:10px;line-height:1.6}
.ph{width:190px;aspect-ratio:9/16;border-radius:22px;overflow:hidden;position:relative;border:5px solid #2A2D33}
.ph img{width:100%;height:100%;object-fit:cover;display:block}.ph .pl{position:absolute;inset:0;display:grid;place-items:center}
.ph .pl i{width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center}
.ph .pl i:after{content:"";border-left:16px solid #15171B;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:4px}
.ph .cap{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 10px;background:linear-gradient(transparent,rgba(0,0,0,.75));font-size:13px;font-weight:700}
@media(max-width:820px){.stats{grid-template-columns:1fr 1fr}.stats div:nth-child(2){border-right:0}.stats div{border-bottom:1px solid rgba(255,255,255,.1)}
.news,.qs{grid-template-columns:1fr}.vids{grid-template-columns:1fr 1fr;padding:26px 22px}.vids>div:first-child{grid-column:1/-1}.ph{width:100%}}
</style>'''
A='''
  <div class="mk"><span class="mt">시안 ① 숫자 띠</span>
  <div class="stats">
    <div><b>6,034</b><span>누적 방문</span></div>
    <div><b>1,219</b><span>TeacherDesk 2 내려받기</span></div>
    <div><b>22<em>+</em></b><span>게시판에 남겨 주신 글</span></div>
    <div><b>09.25</b><span>마지막 업데이트</span></div>
  </div></div>

  <div class="mk"><span class="mt">시안 ② 이번 달 새로 나온 앱</span>
  <div class="sh"><div><h2>9월에 새로 나왔어요</h2><p>최근에 만들거나 크게 고친 앱</p></div></div>
  <div class="news">
    <div class="nw"><div class="im"><img src="../shots/kimju-guide.jpg"></div><div class="tx"><span class="d">NEW · 09.24</span><h3>학교 사안 처리 길잡이</h3><p>학교폭력·아동학대·교권·위기·안전사고 21가지 사안, 지금 할 일부터 근거 법령까지</p></div></div>
    <div class="nw"><div class="im"><img src="../shots/gb-edu-map.jpg"></div><div class="tx"><span class="d">NEW · 09.23</span><h3>경북교육지도</h3><p>우리 지역 학교·통학구역·학생 수를 3D 지도로</p></div></div>
    <div class="nw"><div class="im"><img src="../shots/seat.jpg"></div><div class="tx"><span class="d">업데이트 · 09.07</span><h3>스마트 자리 교체 v5.0</h3><p>남녀 배치 방식 4가지를 골라 뽑기</p></div></div>
  </div></div>
'''
B='''
  <div class="mk"><span class="mt">시안 ③ 선생님 후기 (게시판 글 인용)</span>
  <div class="sh"><div><h2>써 보신 선생님들 이야기</h2><p>게시판에 남겨 주신 글에서 골랐어요</p></div></div>
  <div class="qs">
    <div class="q"><p>오늘 처음 유콜 사용해봤는데 너무 편리합니다. 방송 마이크가 잘 안되어서 유용하게 쓰고있습니다.</p><small>유콜 · 2026.09</small></div>
    <div class="q"><p>선생님 덕분에 업무가 수월해졌습니다.</p><small>게시판 후기 · 2026.09</small></div>
    <div class="q"><p>티쳐데스크2를 아주 잘 사용하고 있습니다. 활용도가 너무 좋아서 유콜 기능도 사용하려고 시도 중입니다.</p><small>TeacherDesk 2 · 2026.09</small></div>
  </div></div>

  <div class="mk"><span class="mt">시안 ④ 30초 소개 영상</span>
  <div class="vids">
    <div><h3>30초면<br>감이 옵니다</h3><p>새로 나온 앱을 짧은 영상으로 먼저 보세요.<br>누르면 소리와 함께 재생돼요.</p></div>
    <div class="ph"><img src="casev.jpg"><div class="pl"><i></i></div><div class="cap">사안 처리 길잡이</div></div>
    <div class="ph"><img src="gbv.jpg"><div class="pl"><i></i></div><div class="cap">경북교육지도</div></div>
  </div></div>
'''
s=s.replace('</head>',css+'\n</head>',1)
k1='<div class="sh"><div><h2>선생님들이 많이 쓰는 앱</h2>'
k2='<section id="apps">'
assert s.count(k1)==1 and s.count(k2)==1
s=s.replace(k1,A+'\n  '+k1,1).replace(k2,B+'\n  '+k2,1)
# 상대경로 보정(목업은 _mock/ 안에 있음)
for a in ['src="shots/',"'shots/",'src="30020','href="icon','src="icon']:
    s=s.replace(a,a.replace('shots/','../shots/').replace('30020','../30020').replace('icon','../icon'))
s=s.replace('<head>','<head><meta name="robots" content="noindex">',1)
io.open('_mock/index.html','w',encoding='utf-8').write(s)
print('ok')
