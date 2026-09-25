import numpy as np, wave
import sys
SR=44100; BPM=float(sys.argv[1]); beat=60/BPM; DUR=float(sys.argv[2]); OUT=sys.argv[3]; HITS=[float(v) for v in sys.argv[4].split(',')] if len(sys.argv)>4 else []; PUNCH=BPM>110
N=int(SR*DUR); out=np.zeros((N,2))
t_all=np.arange(N)/SR
def note(f): return 440*2**((f-69)/12)
def add(sig,start,pan=0.0):
    i=int(start*SR)
    if i>=N: return
    j=min(N,i+len(sig)); s=sig[:j-i]
    out[i:j,0]+=s*(1-pan)*0.5*2**0.5*0.71; out[i:j,1]+=s*(1+pan)*0.5*2**0.5*0.71
# progression Fmaj7 - G6 - Em7 - Am9 (C major-ish, bright/premium)
prog=[[53,57,60,64],[55,59,62,64],[52,55,59,62],[57,60,64,67]]
bass=[41,43,40,45]
bar=beat*4
nbars=int(DUR/bar)+1
for b in range(nbars):
    c=prog[b%4]; st=b*bar; L=bar+0.6
    t=np.arange(int(L*SR))/SR
    env=np.minimum(1,t/0.35)*np.exp(-t*0.35)
    pad=sum(np.sin(2*np.pi*note(m)*t)+0.3*np.sin(2*np.pi*note(m)*2.003*t) for m in c)*env*0.045
    add(pad,st)
    bt=np.arange(int(bar*SR))/SR
    bs=np.sin(2*np.pi*note(bass[b%4])*bt)*np.exp(-bt*1.2)*0.22
    add(bs,st)
    # arp pluck 8ths
    arp=c+[c[1]+12]
    for k in range(8):
        m=arp[[0,2,1,3,4,2,3,1][k]]+12
        pt=np.arange(int(0.5*SR))/SR
        pl=(np.sin(2*np.pi*note(m)*pt)+0.25*np.sin(4*np.pi*note(m)*pt))*np.exp(-pt*9)*0.07
        add(pl,st+k*beat/2,pan=0.35 if k%2 else -0.35)
# drums from bar 1
for i in range(int(DUR/ (beat/2))):
    st=i*beat/2
    if st<bar: continue
    if i%2==0 and ((i//2)%2==0 or PUNCH):
        kt=np.arange(int(0.35*SR))/SR
        f=50+90*np.exp(-kt*30)
        k=np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-kt*9)*0.45; add(k,st)
    if i%2==0 and (i//2)%2==1:
        ct=np.arange(int(0.2*SR))/SR
        cl=np.random.randn(len(ct))*np.exp(-ct*25)*0.08; add(cl,st)
    ht=np.arange(int(0.06*SR))/SR
    h=np.diff(np.random.randn(len(ht)+1))*np.exp(-ht*70)*0.03; add(h,st,pan=0.2)
# riser + impact at 21s (price reveal)
rt=np.arange(int(1.5*SR))/SR
it=np.arange(int(2.5*SR))/SR
for h in HITS:
    add(np.random.randn(len(rt))*(rt/1.5)**2*0.05,h-1.5)
    add(np.sin(2*np.pi*45*it)*np.exp(-it*2)*0.4,h)
# fade in/out
fade=np.ones(N); fi=int(0.3*SR); fo=int(2.5*SR)
fade[:fi]=np.linspace(0,1,fi); fade[-fo:]=np.linspace(1,0,fo)
out*=fade[:,None]
out/=np.abs(out).max()/0.85
w=wave.open(OUT,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype('<i2').tobytes()); w.close(); print('ok')
