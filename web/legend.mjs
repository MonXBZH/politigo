// The Bâton de feu des Apprix: its legend, fourteen pictures at the player's pace (a tap, Enter, Space or → shows the
// next one, « Passer » jumps to the end), then the reveal card; and the volcano that replaces the hemicycle while its
// bearer holds it. Nothing touches the DOM until the first play: the module loads in node for its tests.
import {baton} from "./looks.mjs";

const W=128,H=256,LIFT=34;   // pictures are drawn LIFT px higher: the bottom of the screen belongs to the caption
let c=null;                  // the picture's context, set while one is drawn
const px=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),w,h);};
const rnd=i=>((Math.sin(i*127.1)*43758.5453)%1+1)%1;

// ---------------------------------------------------------------- little helpers
function embers(t,n,y0=H,speed=1400,cols=["#ff6a1a","#ffb347","#ffd23f"]){
 for(let i=0;i<n;i++){const life=((t/speed)+rnd(i))%1;px(rnd(i+9)*W+Math.sin(t/300+i)*3,y0-life*y0,1,1,cols[i%cols.length]);}
}
function glow(x,y,r,a,col="255,106,26"){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${col},${a})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
// A silhouette about 22 px tall: mohawk, arms up or down, legs apart when jumping. ink: its colour.
function fig(x,y,{jump=0,armsUp=false,ink="#0b0608",mohawk=true,step=0,crown=false}={}){
 y-=jump;
 if(mohawk)for(let i=0;i<3;i++)px(x+1+i,y-2-(i===1?1:0),1,2,"#d42a2a");
 if(crown){px(x,y-2,5,2,"#b88a1e");px(x,y-3,1,1,"#b88a1e");px(x+2,y-3,1,1,"#b88a1e");px(x+4,y-3,1,1,"#b88a1e");}
 px(x,y,5,5,ink);px(x+1,y+5,3,1,ink);px(x,y+6,5,8,ink);
 if(armsUp){px(x-2,y-1,2,7,ink);px(x+5,y-1,2,7,ink);}else{px(x-2,y+6,2,7,ink);px(x+5,y+6,2,7,ink);}
 const sp=jump>1||step?2:0;px(x-sp/2,y+14,2,7,ink);px(x+3+sp/2,y+14,2,7,ink);
}
const big=(x,y,k,o)=>{c.save();c.translate(x,y);c.scale(k,k);fig(0,0,o);c.restore();};
function note(x,y,col){px(x+2,y,1,6,col);px(x+2,y,3,1,col);px(x,y+5,3,2,col);}
function bolt(x,y,col){px(x+2,y,2,3,col);px(x+1,y+3,2,2,col);px(x,y+5,4,1,col);px(x+2,y+6,2,3,col);}
function sky(top,bottom,h=150){for(let y=0;y<h;y++){const k=y/h;px(0,y,W,1,`rgb(${top[0]+(bottom[0]-top[0])*k|0},${top[1]+(bottom[1]-top[1])*k|0},${top[2]+(bottom[2]-top[2])*k|0})`);}}
function mountains(col="#1b0a14"){
 c.fillStyle=col;c.beginPath();c.moveTo(0,150);for(const [x,y] of [[14,110],[28,132],[44,96],[58,128],[64,118]])c.lineTo(x,y);c.lineTo(64,200);c.lineTo(0,200);c.fill();
 c.beginPath();c.moveTo(128,150);for(const [x,y] of [[114,104],[100,126],[88,92],[74,128],[64,118]])c.lineTo(x,y);c.lineTo(64,200);c.lineTo(128,200);c.fill();
}
function rivers(t){for(let y=200;y<H;y++)px(0,y,W,1,y%6<3?"#2a0a0c":"#3a0e10");for(let r=0;r<3;r++)for(let x=0;x<W;x+=2)px(x,212+r*16+Math.sin(x/9+t/250+r)*3,2,2,["#d42a2a","#ff6a1a"][(x/2+r)%2]);}

// ---------------------------------------------------------------- the pictures (t: ms since the picture appeared)
function title(t){px(0,0,W,H,"#000");embers(t,24,H,1600);glow(64,118,60,0.28);}
function lands(t){
 sky([20,6,16],[110,22,20]);mountains();rivers(t);
 for(let i=0;i<9;i++){const x=((t/6+i*53)%180)-30,y=40+i*14+Math.sin(t/400+i)*3;px(x,y,14+(i%3)*6,1,"rgba(255,220,200,.35)");}   // howling winds
 const k=0.6+0.4*Math.sin(t/300);glow(64,180,30,0.3*k);baton(c,62,186,t,1);   // the staff is born, small, at the foot of the mountains
}
function forge(t){
 sky([40,8,16],[130,20,16]);mountains();
 c.fillStyle="#2a0e10";c.beginPath();c.moveTo(22,200);c.lineTo(52,118);c.lineTo(76,118);c.lineTo(106,200);c.fill();
 px(52,114,24,5,`rgba(255,${120+60*(0.6+0.4*Math.sin(t/120))|0},40,1)`);
 for(let i=0;i<26;i++){const life=((t/900)+rnd(i))%1,a=(rnd(i+3)-0.5)*2.4;px(64+a*life*30,116-Math.sin(life*Math.PI)*60*rnd(i+5),2,2,["#ff6a1a","#ffb347","#ffd23f"][i%3]);}
 for(let k=0;k<4;k++){const x=40+k*14,j=Math.abs(Math.sin(t/180+k))*3;fig(x,96-j,{armsUp:k%2===0,ink:"#3a1a10",mohawk:false});}   // the Danseurs de Cendre
 const up=Math.min(1,t/2500);baton(c,62,118-up*34,t,1);
 rivers(t);
}
function chaos(t){
 px(0,0,W,H,"#0a0406");glow(64,120,70,0.35+0.15*Math.sin(t/110));
 for(let i=0;i<12;i++){const a=t/700+i*Math.PI/6,r=34+Math.sin(t/300+i)*6;(i%2?note:bolt)(62+Math.cos(a)*r,112+Math.sin(a)*r*1.3,i%3?"#ffd23f":"#ff6a1a");}   // fury and music swirling
 baton(c,60,150,t,2.4);embers(t,26,H,800);
}
function tyrans(t){
 sky([14,10,20],[44,20,30],H);
 for(let k=0;k<3;k++){const stomp=Math.max(0,Math.sin(t/400+k*2))*6;const x=10+k*42,y=62+stomp;big(x,y,3.2,{mohawk:false,crown:true,ink:"#2a1a30"});px(x+3,y+5,3,2,"#ff2a2a");px(x+10,y+5,3,2,"#ff2a2a");}   // the tyrant lords, stomping
 px(0,170,W,86,"#160e14");
 for(let i=0;i<8;i++)if(i!==4)fig(6+i*15,190,{mohawk:false,ink:"#3a2a32"});   // the crushed people, heads low
 fig(66,186,{ink:"#0b0608"});   // Korvax among them
 const beat=(t%700)/700;c.strokeStyle=`rgba(212,42,42,${1-beat})`;c.lineWidth=1;c.beginPath();c.arc(68.5,194.5,4+beat*16,0,Math.PI*2);c.stroke();   // his heart, a war drum
 if(beat<0.15){px(64,170,10,3,"#d42a2a");}
}
function korvax(t){
 px(0,0,W,H,"#0e0a12");
 for(const x of [8,30,90,112]){px(x,60,10,150,"#2a2430");px(x-2,56,14,6,"#3a3340");px(x,60,2,150,"#3a3340");}   // the forbidden temple
 px(0,210,W,6,"#3a3340");px(0,216,W,40,"#1d1822");
 const raised=t>1800,burst=Math.max(0,1-(t-1800)/1400);
 if(raised)glow(70,120,90,0.45,"255,140,40");
 big(50,150,2,{armsUp:raised});
 baton(c,raised?64:66,raised?150:186,t,raised?2:1.4);
 if(raised){for(let i=0;i<30;i++){const a=i/30*Math.PI*2,d=Math.min(1,(t-1800)/1400)*60+6;px(68+Math.cos(a)*d,110+Math.sin(a)*d,2,2,i%2?"#ffd23f":"#ff6a1a");}
  if(burst>0&&!still){c.fillStyle=`rgba(255,240,200,${burst*0.7})`;c.fillRect(0,0,W,H);}}   // no white flash with reduced motion
 embers(t,10,H,1200);
}
function pogo(t){
 c.save();if(!still)c.translate(Math.round(Math.sin(t/37)*2),Math.round(Math.cos(t/29)));
 px(-4,-4,W+8,H+8,"#160a12");
 for(let i=0;i<5;i++){const on=Math.floor(t/120+i)%3===0;px(i*28,0,14,90,on?"rgba(255,80,40,.18)":"rgba(255,80,40,.05)");}
 px(4,150,20,40,"#222");px(6,152,16,16,"#333");px(104,150,20,40,"#222");px(106,152,16,16,"#333");
 px(0,190,W,66,"#0c0608");
 const g=c.createRadialGradient(64,170,0,64,170,80);g.addColorStop(0,`rgba(255,90,40,${0.45+0.2*Math.sin(t/90)})`);g.addColorStop(1,"rgba(255,90,40,0)");c.fillStyle=g;c.fillRect(0,90,W,140);
 for(let i=0;i<9;i++){const x=6+i*13,j=Math.abs(Math.sin(t/140+i*1.3))*10;fig(x,184,{jump:j,armsUp:i%3!==1,step:j>4,ink:i%2?"#1a0c14":"#24121c"});}
 baton(c,60,178-Math.abs(Math.sin(t/140))*8,t,1.6);
 px(80,140,1,60,"#6b4426");px(81,140,16,10,"#d42a2a");
 c.restore();
}
function riffs(t){
 px(0,0,W,H,"#100810");glow(64,140,80,0.3+0.15*Math.sin(t/100),"255,60,60");
 big(44,120,2.4,{armsUp:false});   // the guitarist
 const strum=Math.floor(t/120)%2;px(44,150+strum,26,8,"#7a2a1a");px(46,151+strum,6,6,"#a8452a");px(68,148+strum,22,2,"#3a2a20");px(88,146+strum,4,5,"#3a2a20");   // the guitar
 for(let i=0;i<7;i++){const life=((t/900)+rnd(i))%1,x=84+life*50,y=150-i*14+Math.sin(t/200+i)*4;   // riffs turning into blades
  px(x,y,10,1,"#e8f0ff");px(x+10,y,2,1,"#ffffff");px(x-3,y-1,3,3,"#6b4426");}
 for(let i=0;i<4;i++){const y=52+i*22,w=(t/30+i*40)%60;px(0,y,w,8,"#d42a2a");px(0,y+8,w,1,"#6e0d14");}   // the cries become banners
 for(let i=0;i<6;i++){const life=((t/1100)+rnd(i+20))%1;note(rnd(i)*60+8,200-life*180,"#ffd23f");}
 baton(c,30,190,t,1.6);
}
function prix(t){
 px(0,0,W,H,"#06070c");glow(64,176,60,0.5+0.12*Math.sin(t/200));
 for(let i=0;i<40;i++){const y=((t/30)+rnd(i)*H)%H;px(rnd(i+5)*W,y,1,2,"#5a5560");}   // ash falling
 px(0,206,W,50,"#0c0c12");
 const k="#0b0608";px(58,184,6,6,k);px(56,190,10,8,k);px(54,198,14,4,k);px(66,190,2,8,k);   // the bearer, kneeling, head low
 baton(c,68,200,t,1.4);
}
function errance(t){
 sky([30,14,30],[120,50,40],H);px(0,200,W,56,"#1a1016");
 const n=5,step=(t/1400)%n,cur=Math.floor(step),f=step-cur;
 for(let i=0;i<n;i++)fig(8+i*25,178,{armsUp:i===cur||i===(cur+1)%n,mohawk:i%2===0,ink:"#160c12"});   // angry souls in a row
 const from=8+cur*25+5,to=8+((cur+1)%n)*25+5,x=cur===n-1?from:from+(to-from)*f;   // the staff, passed from hand to hand
 baton(c,x,172-Math.sin(f*Math.PI)*10,t,1.2);
 embers(t,8,200,1600);
}
function prison(t){
 px(0,0,W,H,"#0b0a10");glow(64,150,110,0.55);
 for(let k=0;k<3;k++)fig(30+k*28,182,{armsUp:true,jump:Math.abs(Math.sin(t/160+k))*4});
 baton(c,60,170,t,1.4);
 const fall=t/3500;
 for(let row=0;row<20;row++)for(let col=0;col<9;col++){
  const x=col*16-(row%2?8:0),y=row*12+20,d=Math.abs(col-4)+Math.abs(row-12)*0.4,k=Math.max(0,fall-d*0.07);
  if(k>0.9)continue;
  px(x,y+k*k*260,15,11,(row+col)%3?"#4a4450":"#565060");px(x,y+k*k*260,15,1,"#6a6474");
 }
 embers(t,12,H,1000);
}
function ombre(t){
 px(0,0,W,H,"#030204");glow(64,150,26,0.18+0.08*Math.sin(t/500));
 c.globalAlpha=0.55;baton(c,60,170,t,1.6);c.globalAlpha=1;
 px(0,200,62,1,"#3a3036");const sx=(t/40)%70;px(sx,199,2,2,"#ffd23f");px(sx-1,198,1,1,"#ff6a1a");px(sx+2,197,1,1,"#ffb347");   // the fuse, a spark crawling
}
function chosen(t){
 px(0,0,W,H,"#000");glow(64,120,70,0.35+0.15*Math.sin(t/150));
 const up=Math.min(1,t/1400);baton(c,60,200-up*60,t,3);embers(t,30,H,900);
}
function monde(t){
 c.save();if(!still)c.translate(Math.round(Math.sin(t/37)*2),Math.round(Math.cos(t/31)*2));
 px(-4,-4,W+8,H+8,"#120406");
 c.fillStyle="#2a1a2e";c.beginPath();c.arc(64,128,40,0,Math.PI*2);c.fill();   // the world
 c.fillStyle="#3a2a3e";for(const [x,y,r] of [[50,116,10],[74,138,12],[60,146,6]]){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
 for(let i=0;i<36;i++){const a=i/36*Math.PI*2,h=6+Math.abs(Math.sin(t/120+i*1.7))*10;for(let k=0;k<h;k++)px(64+Math.cos(a)*(40+k),128+Math.sin(a)*(40+k),2,2,k<3?"#ffd23f":k<7?"#ff6a1a":"#d42a2a");}   // it burns
 for(let i=0;i<8;i++){const a=t/800+i*Math.PI/4;(i%2?note:bolt)(64+Math.cos(a)*62,128+Math.sin(a)*62,"#ffd23f");}
 embers(t,30,H,700);
 c.restore();
}
let still=false;   // reduced motion: one still frame per picture, no shaking, no flash

// [draw, caption]: the captions follow the legend's text closely; <b>…</b> marks the words in bold (static strings,
// turned into nodes by captionParts: never parsed as HTML).
export const SLIDES=[
 [title,""],
 [lands,"Dans les terres lointaines et sauvages des <b>Apprix</b>, là où les montagnes hurlent sous les vents déchaînés et où les rivières brûlent d'une lueur écarlate, naquit un objet maudit et sacré : <b>le Bâton de Feu</b>."],
 [forge,"Il fut forgé dans le cœur d'un volcan endormi par les mains des <b>Danseurs de Cendre</b>, une secte de guerriers anarchistes qui croyaient en la destruction comme seule forme de renaissance."],
 [chaos,"Ce bâton n'était pas une simple arme. Il était <b>l'incarnation vivante du chaos</b>, une flamme qui ne s'éteignait jamais, alimentée par la fureur et la musique sauvage du <b>hardcore</b>."],
 [tyrans,"Son premier porteur fut <b>Korvax le Déchaîné</b>, un rebelle dont le cœur battait au rythme des tambours de guerre. Les seigneurs tyranniques des Apprix écrasaient alors son peuple sous leur botte."],
 [korvax,"Un jour, Korvax vola le Bâton dans le temple interdit des Danseurs de Cendre. Dès qu'il le brandit, les flammes jaillirent, non pas pour brûler, mais pour <b>inspirer la révolte</b>."],
 [pogo,"Les opprimés se levèrent : leurs cris devinrent des chants de guerre, leurs pas une danse frénétique qui fit trembler la terre."],
 [riffs,"Le Bâton avait un pouvoir terrible : <b>quiconque le tenait voyait son âme enflammée par la musique du hardcore</b>. Les mélodies devenaient des armes, les riffs des lames, et les cris des étendards de la rébellion."],
 [prix,"Mais il y avait un prix. Le porteur du Bâton était condamné à <b>ne jamais connaître la paix</b>, car la flamme ne s'éteignait qu'avec sa mort."],
 [errance,"Aujourd'hui encore, on dit que le Bâton de Feu erre à travers les mondes, passé de main en main parmi les âmes en colère."],
 [prison,"Certains prétendent l'avoir vu dans les mains d'un <b>groupe de punks nomades</b>, dont les concerts font s'effondrer les murs des prisons et s'embraser les cœurs des opprimés."],
 [ombre,"D'autres murmurent qu'il repose dans l'ombre, attendant le prochain révolté assez fou pour <b>allumer la mèche de l'anarchie</b>."],
 [chosen,"Car le Bâton ne choisit pas son maître. <b>C'est lui qui te choisit.</b>"],
 [monde,"Et quand il le fait… <b>le monde brûle au rythme du hardcore.</b> 🔥🎸"]
];
// A caption split into plain and bold runs: [{b:false,text:"…"},{b:true,text:"…"}].
export function captionParts(s){
 const out=[];let bold=false;
 for(const part of String(s).split(/<\/?b>/)){if(part)out.push({b:bold,text:part});bold=!bold;}
 return out;
}
// A slide's plain text (screen readers, tests).
export const captionText=s=>captionParts(s).map(p=>p.text).join("");
// Draws picture i at time t on a 128x256 context (exported for the tests and the screenshots).
export function drawSlide(ctx,i,t,reduced=false){
 c=ctx;still=reduced;try{c.clearRect(0,0,W,H);SLIDES[i][0](reduced?3000:t);}finally{c=null;still=false;}
}

// ---------------------------------------------------------------- the player
// opts: reduced() (prefers-reduced-motion), drawWinner(ctx64,t) (the bearer, staff in hand), inert(on) (the page
// behind), onWear() (« Le brandir »), onClose(). Returns {play, open}.
export function createLegend({reduced=()=>false,drawWinner=()=>{},inert=()=>{},onWear=()=>{},onClose=()=>{}}={}){
 let root=null,els=null,i=0,shownAt=0,raf=0,opener=null,mode="film";
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
 function build(){
  root=el("div","legend");root.hidden=true;root.setAttribute("role","dialog");root.setAttribute("aria-modal","true");root.setAttribute("aria-label","La légende du Bâton de feu des Apprix");root.tabIndex=-1;
  const film=el("div","legend-film"),cv=el("canvas","legend-cv");cv.width=W;cv.height=H;cv.setAttribute("aria-hidden","true");
  const ttl=el("div","legend-title");ttl.append(el("small","","LA LÉGENDE DU"),"Bâton de feu",document.createElement("br"),"des Apprix");ttl.setAttribute("aria-hidden","true");
  const cap=el("p","legend-cap");cap.setAttribute("aria-live","polite");
  const count=el("span","legend-count"),hint=el("span","legend-hint");hint.setAttribute("aria-hidden","true");
  const skip=el("button","btn legend-skip","Passer");skip.type="button";
  const next=el("button","legend-next");next.type="button";next.setAttribute("aria-label","Continuer");   // the whole picture is the « next » button
  film.append(cv,ttl,next,cap,count,hint,skip);
  const fin=el("div","legend-final");fin.hidden=true;
  const frame=el("div","legend-frame"),win=el("canvas","legend-win");win.width=win.height=256;win.setAttribute("aria-hidden","true");frame.append(win);
  const h=el("h2","","Le Bâton de feu des Apprix"),p=el("p","");p.append("Il ne choisit pas son maître : c'est lui qui t'a choisi.",document.createElement("br"),"Tant qu'il est à toi, personne d'autre ne pourra l'avoir.");
  const row=el("div","btn-row"),wear=el("button","btn go","Le brandir"),again=el("button","btn","Lire la légende"),close=el("button","btn","Fermer");
  for(const b of [wear,again,close])b.type="button";row.append(wear,again,close);
  fin.append(el("span","legend-tag","Mythique · exemplaire unique"),frame,h,p,row);
  root.append(film,fin);document.body.append(root);
  els={film,cv,vc:cv.getContext("2d"),ttl,cap,count,hint,fin,win,wc:win.getContext("2d"),wear,again,close,off:Object.assign(document.createElement("canvas"),{width:W,height:H}),sp:Object.assign(document.createElement("canvas"),{width:64,height:64})};
  next.addEventListener("click",step);skip.addEventListener("click",finish);
  wear.addEventListener("click",()=>{shut();onWear();});again.addEventListener("click",()=>play(opener));close.addEventListener("click",shut);
  // Keys stay inside: the page's own shortcuts (the sheet's Escape, the mini-games) never see them.
  root.addEventListener("keydown",e=>{
   e.stopPropagation();
   if(e.key==="Escape"){e.preventDefault();if(mode==="film")finish();else shut();return;}
   if(mode==="film"&&["Enter"," ","ArrowRight"].includes(e.key)&&!e.target.closest(".legend-skip")){e.preventDefault();step();return;}
   if(e.key==="Tab"){const f=[...root.querySelectorAll("button")].filter(b=>b.getClientRects().length);if(!f.length)return;
    const a=f.indexOf(document.activeElement);if(e.shiftKey&&a<=0){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&a===f.length-1){e.preventDefault();f[0].focus();}}
  });
 }
 function show(n){
  i=n;shownAt=performance.now();
  els.cap.replaceChildren(...captionParts(SLIDES[i][1]).map(p=>p.b?el("b","",p.text):document.createTextNode(p.text)));
  els.cap.classList.toggle("on",!!SLIDES[i][1]);els.ttl.classList.toggle("on",i===0);
  els.count.textContent=`${i+1} / ${SLIDES.length}`;
  els.hint.textContent=i===SLIDES.length-1?"Touche l'écran pour découvrir ton trophée ›":"Touche l'écran pour continuer ›";
  if(reduced())paint(performance.now());
 }
 function paint(now){
  const t=now-shownAt;drawSlide(els.off.getContext("2d"),i,t,reduced());
  els.vc.imageSmoothingEnabled=false;els.vc.clearRect(0,0,W,H);els.vc.drawImage(els.off,0,-LIFT);els.vc.drawImage(els.off,0,H-1,W,1,0,H-LIFT,W,LIFT);   // the last row stretched under the caption
 }
 function paintWin(now){
  const s=els.sp.getContext("2d");s.clearRect(0,0,64,64);drawWinner(s,reduced()?0:now);
  els.wc.imageSmoothingEnabled=false;els.wc.clearRect(0,0,256,256);els.wc.drawImage(els.sp,0,0,256,256);
 }
 function tick(now){
  if(!root||root.hidden)return;
  if(reduced())return;                               // one still frame each (show, finish), no loop
  if(mode==="film")paint(now);else paintWin(now);
  raf=requestAnimationFrame(tick);
 }
 // A tap too soon after a picture appeared (a double tap) is ignored: nobody skips a passage by accident.
 function step(){if(mode!=="film"||performance.now()-shownAt<500)return;if(i<SLIDES.length-1)show(i+1);else finish();}
 function finish(){
  mode="final";els.film.hidden=true;els.fin.hidden=false;cancelAnimationFrame(raf);paintWin(performance.now());
  if(!reduced())raf=requestAnimationFrame(tick);els.wear.focus();
 }
 function shut(){if(!root||root.hidden)return;cancelAnimationFrame(raf);root.hidden=true;inert(false);onClose();(opener&&opener.isConnected?opener:null)?.focus();}
 // Plays from the first picture. from: what gets the focus back at the end.
 function play(from=null){
  if(!root)build();
  opener=from||(root.hidden?document.activeElement:opener);mode="film";
  cancelAnimationFrame(raf);root.hidden=false;inert(true);els.fin.hidden=true;els.film.hidden=false;
  root.classList.remove("on");requestAnimationFrame(()=>root.classList.add("on"));   // the screen dims first
  show(0);root.focus();raf=requestAnimationFrame(tick);
 }
 return {play,open:()=>!!root&&!root.hidden};
}

// ---------------------------------------------------------------- the bearer's room
// While the staff is held, the round panel's hemicycle gives way to an erupting volcano (off to the right, the bearer
// stands before it): war banners drifting, ash falling and settling. Drawn at 116 px and scaled up crisp.
const L=116,GROUND=79;   // 79/116 of 466 = the panel's floor line (318)
let lo=null;
function banner(lc,x,y,t,k){   // a pole and a war banner rippling in the wind: black with a flame, or red with a fist
 const P=(a,b,w,h,col)=>{lc.fillStyle=col;lc.fillRect(Math.round(a),Math.round(b),w,h);};
 P(x,y,1,26,"#3a2416");P(x-1,y-1,3,2,"#b88a1e");
 for(let col=0;col<14;col++){const dy=Math.round(Math.sin(t/180+col*0.6+k)*1.5);P(x+1+col,y+1+dy,1,10,k%2?"#b8232a":"#141016");}
 const dy=Math.round(Math.sin(t/180+3.6+k)*1.5);
 if(k%2){P(x+6,y+4+dy,4,4,"#141016");P(x+7,y+3+dy,1,1,"#141016");P(x+9,y+3+dy,1,1,"#141016");}
 else{P(x+7,y+3+dy,2,6,"#ff6a1a");P(x+6,y+5+dy,4,3,"#ff6a1a");P(x+7,y+6+dy,2,2,"#ffd23f");}
}
// ctx: a context in a size x size space (466 for the panel). t: the clock (0 with reduced motion).
export function volcanoRoom(ctx,t,size=466){
 if(!lo){lo=document.createElement("canvas");lo.width=lo.height=L;}
 const lc=lo.getContext("2d"),P=(x,y,w,h,col)=>{lc.fillStyle=col;lc.fillRect(Math.round(x),Math.round(y),w,h);};
 for(let y=0;y<GROUND;y++){const k=y/GROUND;P(0,y,L,1,`rgb(${30+k*120|0},${8+k*20|0},${18+k*6|0})`);}   // a burning sky
 lc.fillStyle="#1a0a12";lc.beginPath();lc.moveTo(0,66);for(const [x,y] of [[12,48],[24,58],[36,42],[48,60],[70,60],[82,40],[94,56],[106,46],[116,60]])lc.lineTo(x,y);lc.lineTo(116,GROUND);lc.lineTo(0,GROUND);lc.fill();
 for(let k=0;k<4;k++)banner(lc,((t/55+k*42)%170)-30,26+(k%2)*6,t,k);                                          // war banners drifting by
 lc.fillStyle="#2a0e10";lc.beginPath();lc.moveTo(60,GROUND);lc.lineTo(82,24);lc.lineTo(98,24);lc.lineTo(122,GROUND);lc.fill();   // the volcano, off to the right
 const g=0.6+0.4*Math.sin(t/120);P(82,21,16,4,`rgb(255,${120+60*g|0},40)`);
 const gr=lc.createRadialGradient(90,22,0,90,22,22);gr.addColorStop(0,`rgba(255,120,40,${(0.35*g).toFixed(2)})`);gr.addColorStop(1,"rgba(255,120,40,0)");lc.fillStyle=gr;lc.fillRect(68,0,44,44);
 for(let i=0;i<26;i++){const life=((t/1000)+rnd(i))%1,a=(rnd(i+3)-0.5)*2.2;P(90+a*life*24,22-Math.sin(life*Math.PI)*22*rnd(i+5),2,2,["#ff6a1a","#ffb347","#ffd23f"][i%3]);}   // the eruption
 for(let i=0;i<7;i++){const y=28+i*7;P(84-i*2.4+Math.sin(t/300+i),y,2+i*0.6,2,"#ff4a1a");}                    // a lava flow down its side
 P(0,GROUND,L,L-GROUND,"#140a0e");for(let x=0;x<L;x+=3)P(x,GROUND+((x*7)%5),2,1,`rgba(255,90,30,${(0.25+0.2*Math.sin(t/200+x)).toFixed(2)})`);   // cracked, glowing ground
 // Ash: it drifts down, lands on the ground and stays a while before fading; a thin grey layer builds up.
 for(let i=0;i<46;i++){
  const per=5200+rnd(i)*3000,ph=((t+rnd(i+7)*per)%per)/per,fallEnd=0.55,x=rnd(i+11)*L;
  if(ph<fallEnd){const y=ph/fallEnd*(GROUND+6);P(x+Math.sin(t/400+i)*3,y,1,1,i%4?"#8a8590":"#c9c3cc");}
  else{const fade=1-(ph-fallEnd)/(1-fallEnd);P(x,GROUND+4+(i%5),1,1,`rgba(170,164,176,${fade.toFixed(2)})`);}
 }
 for(let x=0;x<L;x+=2)P(x,GROUND+9,2,1,`rgba(140,134,146,${(0.35+0.15*Math.sin(x)).toFixed(2)})`);
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(lo,0,0,size,size);
 const h=size/2,vg=ctx.createRadialGradient(h,h,size*0.32,h,h,size*0.52);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.55)");ctx.fillStyle=vg;ctx.fillRect(0,0,size,size);
 ctx.restore();
}
