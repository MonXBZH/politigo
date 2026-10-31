// PolitiGo mini-games drawn on the 466x466 screen: the timed debate (both camps) and the "Manif", one game per
// camp (Le Cortège on the left, L'Épervier on the right). The Manif is played in the browser from the server's seed;
// the server charges the activity at the start and checks the score at the end (rules.mjs, MINI). The debate is
// refereed by the server, question by question. Every function takes the game clock as "now", which
// app.js stops while a scene plays, so an evolution earned mid-game never eats the time.
import * as R from "./rules.mjs";

const W=466,C=233,RAD=222;
// Every random draw of a game comes from g.rand, seeded by the server (createMini): the same seed plays the same game.
const rnd=(g,a,b)=>a+g.rand()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b,c,d)=>Math.hypot(a-c,b-d);
// Keeps a point inside the round panel, with a margin.
function inCircle(x,y,m){const dx=x-C,dy=y-C,d=Math.hypot(dx,dy),max=RAD-m;return d<=max?[x,y]:[C+dx/d*max,C+dy/d*max];}
export const miniBonus=(key,score)=>{const c=R.MINI[key];return Math.min(c.bonusCap,Math.floor(Math.max(0,score)*c.bonusRate));};
export const manifLabel=camp=>R.MINI[camp==="left"?"cortege":"epervier"].label;

// ===================================================================== SPRITES (64x64 grid, like app.js)
const scratch=document.createElement("canvas");scratch.width=scratch.height=64;const sctx=scratch.getContext("2d");
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
// A riot policeman: helmet and visor, padded uniform, an LBD, a tonfa or a shield.
function crs(c,t,state,weapon){
 c.clearRect(0,0,64,64);
 const phase=Math.floor(t/300)%4,ink="#151a24",blue="#2c3a52",pad="#3e5170",run=state==="run";
 c.fillStyle="#0004";c.beginPath();c.ellipse(32,59,15,3,0,0,Math.PI*2);c.fill();
 c.save();c.translate(0,run?[0,-2,0,-2][phase]:0);
 rect(c,24,54-(run&&phase%2===0?2:0),7,5,ink);rect(c,34,54-(run&&phase%2===1?2:0),7,5,ink);
 rect(c,21,36,22,19,ink);rect(c,23,37,18,17,blue);rect(c,24,39,7,6,pad);rect(c,33,39,7,6,pad);rect(c,23,49,18,2,"#1d2638");
 rect(c,17,38,5,13,blue);rect(c,42,38,5,13,blue);rect(c,17,38,5,4,pad);rect(c,42,38,5,4,pad);
 rect(c,20,12,24,23,ink);rect(c,21,13,22,21,"#1f2a3d");rect(c,22,14,20,4,"#33425e");
 rect(c,23,20,18,11,"#e9b38e");rect(c,22,19,20,8,"#8db3d6aa");rect(c,22,19,20,1,"#d6e6f5");
 rect(c,27,24,2,2,ink);rect(c,35,24,2,2,ink);rect(c,30,29,5,1,ink);
 if(weapon==="lbd"){rect(c,40,44,12,4,"#3a3a3a");rect(c,50,44,3,4,"#f2a03d");rect(c,43,48,3,4,"#3a3a3a");}
 if(weapon==="tonfa"){if(state==="win"){rect(c,40,30,14,3,ink);rect(c,44,28,2,7,ink);}else{rect(c,44,40,3,16,ink);rect(c,41,45,4,2,ink);}}
 c.restore();
}
// Protesters by outfit; the undercover officer borrows a plain or yellow-vest outfit ("look").
const KINDS={
 plain:{coat:"#c75c5c",hair:"#4b3628",speed:1},gilet:{coat:"#e8d23a",hair:"#3b2b22",speed:1.25},
 bloc:{coat:"#1b1b22",hair:"#1b1b22",speed:1.3},retraite:{coat:"#b99f7b",hair:"#d8d8d2",speed:.7},
 presse:{coat:"#3b6fd1",hair:"#6a4a32",speed:1},infiltre:{coat:"#c75c5c",hair:"#4b3628",speed:1}
};
function protester(c,t,kind,state){
 c.clearRect(0,0,64,64);
 const k=KINDS[kind],phase=Math.floor(t/220)%4,ink="#202330",skin="#e9b38e",run=state==="run",caught=state==="caught";
 c.fillStyle="#0004";c.beginPath();c.ellipse(32,59,13,3,0,0,Math.PI*2);c.fill();
 c.save();c.translate(0,run?[0,-2,0,-2][phase]:0);
 rect(c,25,54-(run&&phase%2===0?2:0),6,5,ink);rect(c,34,54-(run&&phase%2===1?2:0),6,5,ink);
 rect(c,23,38,18,17,ink);rect(c,24,39,16,15,k.coat);
 if(kind==="gilet"){rect(c,24,46,16,2,"#d8dde2");rect(c,24,50,16,2,"#d8dde2");}
 if(kind==="presse"){rect(c,25,42,14,5,"#f4f6fb");rect(c,27,44,10,1,"#3b6fd1");}
 if(caught){rect(c,22,42,4,8,k.coat);rect(c,38,42,4,8,k.coat);rect(c,28,50,8,3,"#9aa3b0");}
 else{rect(c,19,40,5,11,k.coat);rect(c,40,34,5,11,k.coat);rect(c,41,31,4,4,skin);}
 rect(c,23,16,19,20,ink);rect(c,24,17,17,18,skin);
 rect(c,24,15,17,5,k.hair);rect(c,23,17,3,6,k.hair);rect(c,39,17,3,6,k.hair);
 if(kind==="bloc"){rect(c,23,15,19,21,"#1b1b22");rect(c,26,22,13,5,skin);}
 if(kind==="retraite"){c.strokeStyle=ink;c.lineWidth=1;c.strokeRect(26.5,23.5,5,4);c.strokeRect(33.5,23.5,5,4);}
 rect(c,28,24,2,2,ink);rect(c,35,24,2,2,ink);
 rect(c,30,30,5,caught?1:2,caught?ink:"#783f49");
 if(!caught&&kind!=="presse"){rect(c,42,8,2,24,"#8a6a48");rect(c,34,4,18,11,"#f2e8cd");rect(c,36,7,14,2,"#c23b4a");rect(c,36,11,9,2,"#685a67");}
 if(kind==="presse"&&!caught){rect(c,40,34,9,7,"#2a2a2a");rect(c,43,36,4,3,"#8fd0ff");}
 c.restore();
}

// Halloween costume (drawing only): a jack-o'-lantern, and a bat flapping with the clock.
function pumpkin(c,x,y,r,face){
 c.fillStyle="#e8742a";c.beginPath();c.ellipse(x,y,r*1.2,r,0,0,7);c.fill();
 c.fillStyle="#c4561c";c.fillRect(x-r*.5-1,y-r*.85,2,r*1.7);c.fillRect(x+r*.5-1,y-r*.85,2,r*1.7);c.fillStyle="#4f7a2c";c.fillRect(x-1.5,y-r-4,3,5);
 if(face){c.fillStyle="#ffe08a";c.fillRect(x-r*.55,y-r*.35,r*.35,r*.3);c.fillRect(x+r*.2,y-r*.35,r*.35,r*.3);c.fillRect(x-r*.5,y+r*.2,r,r*.22);}
}
function bat(c,x,y,s,t){
 const f=Math.sin(t/60)*s*.6;c.fillStyle="#141018";c.beginPath();c.moveTo(x-s*.4,y);c.lineTo(x-s*1.7,y-s*.4-f);c.lineTo(x-s*1.1,y+s*.3);c.lineTo(x-s*.6,y+s*.1);c.lineTo(x,y+s*.5);
 c.lineTo(x+s*.6,y+s*.1);c.lineTo(x+s*1.1,y+s*.3);c.lineTo(x+s*1.7,y-s*.4-f);c.lineTo(x+s*.4,y);c.closePath();c.fill();
 c.beginPath();c.arc(x,y,s*.5,0,7);c.fill();c.fillRect(x-s*.45,y-s*.85,2,s*.5);c.fillRect(x+s*.45-2,y-s*.85,2,s*.5);
 c.fillStyle="#ff5a3c";c.fillRect(x-s*.25-1,y-s*.15,2,2);c.fillRect(x+s*.25-1,y-s*.15,2,2);
}

// ===================================================================== SHARED DRAWING
function makeKit(ctx,scale){
 const blit=(size,cx,ground,flip)=>{
  ctx.imageSmoothingEnabled=false;
  if(flip){ctx.save();ctx.translate(cx,0);ctx.scale(-1,1);ctx.drawImage(scratch,-size/2,ground-size,size,size);ctx.restore();}
  else ctx.drawImage(scratch,cx-size/2,ground-size,size,size);
 };
 const text=(s,x,y,font,color,align="center")=>{ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);};
 const outlined=(s,x,y,size,color)=>{ctx.font=`700 ${size}px Fredoka, system-ui, sans-serif`;ctx.textAlign="center";ctx.lineWidth=4;ctx.strokeStyle="#141b2a";ctx.strokeText(s,x,y);ctx.fillStyle=color;ctx.fillText(s,x,y);};
 const heart=(x,y,on)=>{ctx.fillStyle=on?"#ef6c89":"#ffffff30";for(const [a,b] of [[1,0],[2,0],[4,0],[5,0],[0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[2,4],[3,4],[4,4],[3,5]])ctx.fillRect(x+a*2,y+b*2,2,2);};
 const floaters=[];
 const floater=(s,x,y,color,now)=>floaters.push({s,x,y,color,t:now});
 const drawFloaters=now=>{for(let i=floaters.length-1;i>=0;i--){const f=floaters[i],a=(now-f.t)/900;if(a>=1||a<0){floaters.splice(i,1);continue;}ctx.globalAlpha=1-a;outlined(f.s,f.x,f.y-a*28,15,f.color);ctx.globalAlpha=1;}};
 const endPanel=(title,lines,color)=>{
  ctx.fillStyle="#0b0f19cc";ctx.fillRect(0,0,W,W);
  outlined(title,C,170,26,color);
  lines.forEach((l,i)=>text(l,C,214+i*26,"600 15px Inter, system-ui, sans-serif",i===lines.length-1?"#ffd59a":"#fff6ea"));
  text("Touche l'écran pour continuer",C,360,"500 12px Inter, system-ui, sans-serif","#b9b2c7");
 };
 return {ctx,scale,blit,text,outlined,heart,floater,drawFloaters,endPanel};
}
// Steering shared by the two Manif games: arrows, or towards the finger / mouse.
function steer(g,dt,speed){
 const k=g.keys;let vx=(k.ArrowRight?1:0)-(k.ArrowLeft?1:0),vy=(k.ArrowDown?1:0)-(k.ArrowUp?1:0);
 if(vx||vy){const n=Math.hypot(vx,vy);g.x+=vx/n*speed*dt;g.y+=vy/n*speed*dt;g.target=null;}
 else if(g.target){const dx=g.target[0]-g.x,dy=g.target[1]-g.y,d=Math.hypot(dx,dy),step=Math.min(d,speed*dt);if(d>1){g.x+=dx/d*step;g.y+=dy/d*step;}}
}

// ===================================================================== LE CORTÈGE (left: dodge LBD and tear gas on a scrolling street)
const CG={ms:30000,lives:3,speed:210,scroll:70};
function cortege(g,K,drawCand){
 const {ctx}=K,hw=g.season==="halloween";
 Object.assign(g,{x:C,y:380,hp:CG.lives,inv:-Infinity,hitT:-Infinity,tears:0,tracts:0,blocked:0,scroll:0,shots:[],grenades:[],clouds:[],items:[],nextItem:g.t0+800,
  crs:[150,233,316].map((x,i)=>({x,dir:i%2?1:-1,cool:1.2+i*.6,aim:null})),
  crowd:[{dx:-46,dy:34,kind:"plain"},{dx:44,dy:40,kind:"gilet"},{dx:-12,dy:62,kind:"retraite"},{dx:26,dy:74,kind:"plain"}].map(m=>({...m,x:C+m.dx,y:380+m.dy})),
  umbrella:-Infinity,umbrellaCd:-Infinity,why:""});
 g.score=()=>Math.round(Math.min(1,((g.endT||g.now)-g.t0)/CG.ms)*60)+g.tracts*5+g.blocked*2;
 g.special=now=>{if(g.endT||now<g.umbrellaCd)return;g.umbrella=now+1300;g.umbrellaCd=now+6000;};
 g.step=(now,dt)=>{
  const prog=Math.min(1,(now-g.t0)/CG.ms),slow=g.clouds.some(c=>dist(c.x,c.y,g.x,g.y-24)<c.r)?.5:1;
  if(!g.endT&&(prog>=1||g.hp<=0)){g.endT=now;g.why=g.hp<=0?"down":"nation";}
  if(g.endT)return;
  g.scroll+=CG.scroll*dt;
  steer(g,dt,CG.speed*slow);
  g.y=clamp(g.y,250,420);[g.x,g.y]=inCircle(g.x,g.y,26);
  for(const m of g.crowd){m.x+=(g.x+m.dx-m.x)*Math.min(1,dt*2.2);m.y+=(g.y+m.dy-m.y)*Math.min(1,dt*2.2);}
  // The CRS line wanders, telegraphs an LBD shot (red line) or lobs a tear-gas canister.
  for(const c of g.crs){
   c.x+=c.dir*30*dt;if(c.x<110||c.x>356)c.dir*=-1;
   if(c.aim){if(now>=c.aim.at){const dx=c.aim.x-c.x,dy=c.aim.y-128,d=Math.hypot(dx,dy)||1,v=280+150*prog;g.shots.push({x:c.x+10,y:128,vx:dx/d*v,vy:dy/d*v});c.aim=null;}continue;}
   c.cool-=dt;if(c.cool>0)continue;
   c.cool=rnd(g,1.7,2.9)*(1-.45*prog);
   if(g.rand()<.58)c.aim={x:g.x+rnd(g,-14,14),y:g.y-26,at:now+620-200*prog};
   else g.grenades.push({x0:c.x,y0:122,x1:clamp(g.x+rnd(g,-70,70),90,376),y1:clamp(g.y-20+rnd(g,-50,40),220,410),t0:now,ms:1100});
  }
  const hit=label=>{if(now<g.inv)return;g.hp--;g.inv=now+1200;g.hitT=now;K.floater(label,g.x,g.y-70,"#ff9aa5",now);};
  for(let i=g.shots.length-1;i>=0;i--){const s=g.shots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;
   if(s.y>W+10||s.x<-10||s.x>W+10){g.shots.splice(i,1);continue;}
   if(dist(s.x,s.y,g.x,g.y-30)<(g.umbrella>now?34:17)){g.shots.splice(i,1);
    if(g.umbrella>now){g.blocked++;K.floater("Ploc !",g.x,g.y-70,"#8fd0ff",now);}else hit(hw?"Aïe ! Une chauve-souris":"Aïe ! LBD");}}
  for(let i=g.grenades.length-1;i>=0;i--){const n=g.grenades[i];if(now-n.t0>=n.ms){g.clouds.push({x:n.x1,y:n.y1,r:0,max:rnd(g,48,62),born:now,life:4200});g.grenades.splice(i,1);}}
  for(let i=g.clouds.length-1;i>=0;i--){const c=g.clouds[i],age=now-c.born;if(age>c.life){g.clouds.splice(i,1);continue;}c.y+=CG.scroll*.6*dt;c.r=c.max*Math.min(1,age/600)*(age>c.life-800?(c.life-age)/800:1);}
  if(slow<1&&now>g.inv){g.tears+=55*dt;if(g.tears>=100){g.tears=0;hit("Les yeux qui piquent !");}}
  else g.tears=Math.max(0,g.tears-18*dt);
  if(now>=g.nextItem){g.nextItem=now+rnd(g,700,1300);const r=g.rand();g.items.push({x:rnd(g,110,356),y:150,kind:r<.74?"tract":r<.9?"serum":"merguez"});}
  for(let i=g.items.length-1;i>=0;i--){const it=g.items[i];it.y+=CG.scroll*dt;if(it.y>440){g.items.splice(i,1);continue;}
   if(dist(it.x,it.y,g.x,g.y-24)<28){g.items.splice(i,1);
    if(it.kind==="tract"){g.tracts++;K.floater("+1 tract",it.x,it.y-10,"#ffd59a",now);}
    if(it.kind==="serum"){g.tears=0;K.floater("Sérum phy !",it.x,it.y-10,"#8fd0ff",now);}
    if(it.kind==="merguez"){if(g.hp<CG.lives)g.hp++;K.floater("Merguez de manif ! ♥",it.x,it.y-10,"#ef6c89",now);}}}
 };
 g.draw=now=>{
  const until=g.endT||now,off=g.scroll%60;
  ctx.fillStyle="#4a4f5c";ctx.fillRect(0,0,W,W);
  ctx.fillStyle="#8c8f99";ctx.fillRect(0,0,92,W);ctx.fillRect(374,0,92,W);
  ctx.fillStyle="#7a7d87";for(let y=-60+off;y<W;y+=30){ctx.fillRect(0,y,92,2);ctx.fillRect(374,y,92,2);}
  ctx.fillStyle="#e3d5b8";ctx.fillRect(0,0,52,W);ctx.fillRect(414,0,52,W);
  ctx.fillStyle="#5d6c86";for(let y=-120+(g.scroll%120);y<W;y+=40){ctx.fillRect(18,y,14,22);ctx.fillRect(434,y,14,22);}
  ctx.fillStyle="#d9d3c6";for(let y=-60+off;y<W;y+=60)ctx.fillRect(231,y,4,30);
  ctx.fillStyle="#5a5f6c";for(let i=0;i<10;i++){const y=(i*97+g.scroll)%520-30;ctx.fillRect(110+(i*71)%240,y,8,5);}
  ctx.fillStyle="#e8edf3";ctx.fillRect(160,40,146,58);ctx.fillStyle="#2f4c8f";ctx.fillRect(160,70,146,8);ctx.fillStyle="#9fb6d2";ctx.fillRect(176,48,34,16);ctx.fillRect(256,48,34,16);
  ctx.fillStyle=Math.floor(now/250)%2?"#3c7cf0":"#8fb6ff";ctx.fillRect(220,34,26,7);
  // In costume: dusk over the street, lanterns scrolling along both pavements.
  if(hw){ctx.fillStyle="#3b1d5e59";ctx.fillRect(0,0,W,W);for(let y=-100+(g.scroll%100);y<W+20;y+=100){pumpkin(ctx,72,y,7,true);pumpkin(ctx,394,y+50,7,true);}}
  for(const c of g.crs){crs(sctx,now+(c.x|0),"idle","lbd");K.blit(62,c.x,140);}
  for(const c of g.crs)if(c.aim){ctx.strokeStyle=`rgba(255,70,70,${.35+.4*Math.sin(now/50)**2})`;ctx.setLineDash([6,6]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(c.x+18,124);ctx.lineTo(c.aim.x,c.aim.y);ctx.stroke();ctx.setLineDash([]);}
  for(const it of g.items){
   if(it.kind==="tract"){ctx.fillStyle="#f2e8cd";ctx.fillRect(it.x-8,it.y-10,16,20);ctx.fillStyle="#c23b4a";ctx.fillRect(it.x-6,it.y-7,12,3);ctx.fillStyle="#685a67";ctx.fillRect(it.x-6,it.y-1,9,2);ctx.fillRect(it.x-6,it.y+3,11,2);}
   if(it.kind==="serum"){ctx.fillStyle="#e9f3fb";ctx.fillRect(it.x-4,it.y-11,8,18);ctx.fillStyle="#6fb4e8";ctx.fillRect(it.x-4,it.y-2,8,5);ctx.fillStyle="#bcd3e6";ctx.fillRect(it.x-2,it.y-14,4,3);}
   if(it.kind==="merguez"){ctx.fillStyle="#e8c27a";ctx.fillRect(it.x-12,it.y-5,24,10);ctx.fillStyle="#a8402e";ctx.fillRect(it.x-10,it.y-3,20,5);}
  }
  for(const n of g.grenades){const a=Math.min(1,(until-n.t0)/n.ms),x=n.x0+(n.x1-n.x0)*a,y=n.y0+(n.y1-n.y0)*a-Math.sin(a*Math.PI)*70;
   ctx.fillStyle=hw?"#a8e89a88":"#dfe6f088";for(let k=1;k<5;k++){const b=Math.max(0,a-k*.05);ctx.beginPath();ctx.arc(n.x0+(n.x1-n.x0)*b,n.y0+(n.y1-n.y0)*b-Math.sin(b*Math.PI)*70,3+k,0,7);ctx.fill();}
   ctx.save();ctx.translate(x,y);ctx.rotate(now/90);if(hw)pumpkin(ctx,0,0,6,true);else{ctx.fillStyle="#7d8a6c";ctx.fillRect(-4,-7,8,14);ctx.fillStyle="#c9c46a";ctx.fillRect(-4,-7,8,3);}ctx.restore();}
  for(const m of [...g.crowd].sort((a,b)=>a.y-b.y)){protester(sctx,now+m.dx*13,m.kind,"run");K.blit(46,m.x,m.y);}
  if(!(now<g.inv&&Math.floor(now/90)%2))drawCand(g.p,now-g.hitT<700?"stress":g.endT&&g.why==="nation"?"win":"run",72,g.x,g.y,now);
  if(g.umbrella>now){ctx.fillStyle="#e1576b";ctx.beginPath();ctx.arc(g.x,g.y-64,34,Math.PI,2*Math.PI);ctx.fill();ctx.fillStyle="#b8324a";for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(g.x,g.y-98);ctx.lineTo(g.x+k*17-5,g.y-64);ctx.lineTo(g.x+k*17+5,g.y-64);ctx.fill();}ctx.fillStyle="#202330";ctx.fillRect(g.x-1,g.y-64,2,22);}
  for(const c of g.clouds){if(c.r<=1)continue;for(let k=0;k<5;k++){const a=k*1.3+now/1400,cx=c.x+Math.cos(a)*c.r*.35,cy=c.y+Math.sin(a)*c.r*.25,rr=c.r*(.55+.12*(k%3));const gr=ctx.createRadialGradient(cx,cy,0,cx,cy,rr);gr.addColorStop(0,hw?"#bff0a8cc":"#f2f5f0cc");gr.addColorStop(1,hw?"#bff0a800":"#f2f5f000");ctx.fillStyle=gr;ctx.beginPath();ctx.arc(cx,cy,rr,0,7);ctx.fill();}}
  for(const s of g.shots){ctx.fillStyle="#00000040";ctx.beginPath();ctx.arc(s.x-s.vx*.03,s.y-s.vy*.03,4,0,7);ctx.fill();
   if(hw)bat(ctx,s.x,s.y,7,now+s.vx);else{ctx.fillStyle="#2a2a2a";ctx.beginPath();ctx.arc(s.x,s.y,6,0,7);ctx.fill();ctx.fillStyle="#9aa0aa";ctx.fillRect(s.x-3,s.y-3,2,2);}}
  if(g.tears>45){ctx.fillStyle=`rgba(150,200,255,${(g.tears-45)/240})`;ctx.fillRect(0,0,W,W);}
  if(g.tears>0){ctx.fillStyle="#141b2acc";ctx.fillRect(g.x-26,g.y+6,52,6);ctx.fillStyle="#8fd0ff";ctx.fillRect(g.x-25,g.y+7,50*g.tears/100,4);}
  // Route République → Nation, lives, tracts, umbrella.
  const prog=Math.min(1,(until-g.t0)/CG.ms);
  ctx.fillStyle="#141b2ad9";ctx.beginPath();ctx.roundRect(126,160,214,44,12);ctx.fill();
  K.text("République",140,177,"700 10px Inter, sans-serif","#fff6ea","left");K.text("Nation",326,177,"700 10px Inter, sans-serif","#fff6ea","right");
  ctx.fillStyle="#ffffff25";ctx.fillRect(140,184,186,5);ctx.fillStyle="#ef7c91";ctx.fillRect(140,184,186*prog,5);ctx.fillStyle="#fff6ea";ctx.fillRect(137+186*prog,181,6,11);
  for(let i=0;i<CG.lives;i++)K.heart(140+i*17,193,i<g.hp);
  K.text(`Tracts ${g.tracts}`,326,201,"700 11px Inter, sans-serif","#ffd59a","right");
  if(!g.endT)K.text(g.umbrellaCd>now?`☂ ${Math.ceil((g.umbrellaCd-now)/1000)} s`:"☂ prêt",233,201,"700 11px Inter, sans-serif",g.umbrellaCd>now?"#b9b2c7":"#8fd0ff");
  if(now-g.t0<2400)K.outlined("Tiens le cortège jusqu'à Nation !",C,250,18,"#fff6ea");
  if(now-g.t0<2400)K.text("☂ parapluie : Espace ou deuxième doigt",C,272,"600 12px Inter, sans-serif","#fff6ea");
  K.drawFloaters(now);
  if(g.endT&&now-g.endT>600){
   const score=g.score();
   K.endPanel(g.why==="nation"?"Arrivée à Nation !":"Évacué par les street medics",
    [`${g.tracts} tract${g.tracts>1?"s":""} · ${g.blocked} tir${g.blocked>1?"s":""} paré${g.blocked>1?"s":""} au parapluie`,
     `Parcours : ${Math.round(prog*100)} %`,`+${miniBonus("cortege",score)} XP de terrain (score ${score})`],g.why==="nation"?"#ffd59a":"#ff9aa5");
  }
 };
}

// ===================================================================== L'ÉPERVIER (right: the candidate and a CRS catch protesters crossing the square)
const EP={ms:35000,speed:225,ally:95,catchR:30,zoneL:118,zoneR:348,lives:3,flight:950,lead:.75,fireMs:2000,fireR:34};
// Who throws what: black blocs favour molotovs, the others mostly paving stones; pensioners and journalists never throw.
const THROW={bloc:.8,plain:.2,gilet:.2};
// Catching these costs points: the press, and colleagues working undercover.
const TRAP={presse:{pts:2,label:"Carte de presse !"},infiltre:{pts:3,label:"C'était un collègue infiltré !"}};
function spawnProt(g,side,y){
 const r=g.rand(),kind=r<.34?"plain":r<.52?"gilet":r<.67?"bloc":r<.80?"retraite":r<.90?"presse":"infiltre";
 return{x:side?EP.zoneR+rnd(g,18,48):EP.zoneL-rnd(g,18,48),y,kind,look:kind==="infiltre"?(g.rand()<.5?"plain":"gilet"):kind,state:"wait",side,zig:rnd(g,0,6),delay:0,throwAt:0};
}
function epervier(g,K,drawCand){
 const {ctx}=K,hw=g.season==="halloween";
 Object.assign(g,{x:C,y:250,vx:0,vy:0,hp:EP.lives,inv:-Infinity,hitT:-Infinity,throws:[],fires:[],rubble:[],points:0,caught:0,press:0,cops:0,wave:0,
  waveT:g.t0+1600,side:0,prot:[],ally:{x:C+30,y:320,hitT:-Infinity,flip:false},swingT:-Infinity,shoutT:-Infinity,reinfT:-Infinity,why:""});
 for(let i=0;i<5;i++)g.prot.push(spawnProt(g,0,150+i*50));
 g.score=()=>Math.max(0,g.points);
 const throwAt=(m,now,dP,minMs,maxMs)=>{
  if(!(m.kind in THROW)||now<m.throwAt||dP<60||dP>320)return;
  m.throwAt=now+rnd(g,minMs,maxMs)/(1+g.wave*.12);
  // Aimed where the player is heading (part of the way): running in a straight line is not enough.
  const ms=EP.flight*(.8+dP/800),lead=EP.lead*ms/1000,[x1,y1]=inCircle(g.x+g.vx*lead+rnd(g,-18,18),g.y+g.vy*lead+rnd(g,-12,12),24);
  g.throws.push({x0:m.x,y0:m.y-40,x1,y1,t0:now,ms,type:g.rand()<THROW[m.kind]?"molotov":"pave"});
 };
 const launchWave=now=>{
  g.wave++;g.shoutT=now;
  for(let i=0;i<Math.min(4,1+Math.floor(g.wave/2));i++)g.prot.push(spawnProt(g,g.side,rnd(g,140,350)));
  for(const m of g.prot)if(m.state==="wait"||m.state==="safe"){m.state="run";m.side=g.side;m.delay=now+rnd(g,0,700);m.speed=rnd(g,62,96)*KINDS[m.kind].speed*(1+g.wave*.07);m.throwAt=now+rnd(g,600,2400)/(1+g.wave*.15);}
 };
 g.step=(now,dt)=>{
  if(!g.endT&&now-g.t0>=EP.ms){g.endT=now;g.why="time";}
  if(g.endT)return;
  const px=g.x,py=g.y;
  steer(g,dt,EP.speed);[g.x,g.y]=inCircle(g.x,g.y,24);g.y=clamp(g.y,130,430);
  g.vx=dt?(g.x-px)/dt:0;g.vy=dt?(g.y-py)/dt:0;
  if(g.waveT&&now>=g.waveT){g.waveT=0;launchWave(now);}
  // The CRS partner chases the nearest runner, slower than the player, and knows the press and his colleagues.
  const tgt=g.prot.filter(m=>m.state==="run"&&!TRAP[m.kind]).sort((a,b)=>dist(a.x,a.y,g.ally.x,g.ally.y)-dist(b.x,b.y,g.ally.x,g.ally.y))[0];
  if(tgt){const dx=tgt.x-g.ally.x,dy=tgt.y-g.ally.y,d=Math.hypot(dx,dy);if(d>1){g.ally.x+=dx/d*EP.ally*dt;g.ally.y+=dy/d*EP.ally*dt;}g.ally.flip=dx<0;}
  for(const m of g.prot){
   if(m.state==="run"){
    if(now<m.delay)continue;
    let vy=m.kind==="bloc"?Math.sin(now/260+m.zig)*90:0;
    const dP=dist(m.x,m.y,g.x,g.y);if(dP<95&&!TRAP[m.kind])vy+=(m.y<g.y?-1:1)*140*(1-dP/95);
    m.x+=(m.side?-1:1)*m.speed*dt;m.y=clamp(m.y+vy*dt,130,400);[m.x,m.y]=inCircle(m.x,m.y,22);
    const by=dP<EP.catchR?"me":dist(m.x,m.y,g.ally.x,g.ally.y)<EP.catchR?"ally":null;
    if(by){
     m.state="caught";
     if(by==="me")g.swingT=now;else g.ally.hitT=now;
     if(TRAP[m.kind]){const t=TRAP[m.kind];g.points-=t.pts;if(m.kind==="presse")g.press++;else g.cops++;K.floater(`${t.label} −${t.pts}`,m.x,m.y-60,"#ff9aa5",now);}
     else{g.points++;g.caught++;K.floater(by==="me"?"Interpellé !":"Interpellé (par le CRS)",m.x,m.y-60,"#ffd59a",now);}
    }
    else if((m.side===0&&m.x>=EP.zoneR+20)||(m.side===1&&m.x<=EP.zoneL-20))m.state="safe";
    else throwAt(m,now,dP,1500,3000);
   }
   // Between crossings, protesters keep throwing from behind their line, a little less often.
   if(m.state==="wait"||m.state==="safe"){if(!m.throwAt)m.throwAt=now+rnd(g,1500,4000);throwAt(m,now,dist(m.x,m.y,g.x,g.y),2600,4800);}
   if(m.state==="caught"){const dx=233-m.x,dy=96-m.y,d=Math.hypot(dx,dy);if(d<8)m.state="van";else{m.x+=dx/d*140*dt;m.y+=dy/d*140*dt;}}
  }
  // Projectiles land where the player was heading: a paving stone hurts on impact, a molotov's fire while it burns.
  const hurt=label=>{if(now<g.inv)return;g.hp--;g.inv=now+1200;g.hitT=now;K.floater(label,g.x,g.y-80,"#ff9aa5",now);if(g.hp<=0){g.endT=now;g.why="hurt";}};
  for(let i=g.throws.length-1;i>=0;i--){const s=g.throws[i];if(now-s.t0<s.ms)continue;g.throws.splice(i,1);
   if(s.type==="pave"){g.rubble.push({x:s.x1,y:s.y1,t:now});if(dist(s.x1,s.y1,g.x,g.y-8)<26)hurt(hw?"Aïe ! Une citrouille":"Aïe ! Un pavé");}
   else g.fires.push({x:s.x1,y:s.y1,born:now});}
  g.fires=g.fires.filter(f=>now-f.born<EP.fireMs);g.rubble=g.rubble.filter(r=>now-r.t<1500);
  if(g.fires.some(f=>dist(f.x,f.y,g.x,g.y-6)<EP.fireR))hurt("Ça brûle !");
  if(g.endT)return;
  // A wave is over: the next one runs back; when nobody is left, reinforcements join from the cortège.
  if(!g.waveT&&!g.prot.some(m=>m.state==="run"||m.state==="caught")){
   g.side=1-g.side;g.waveT=now+1400;
   if(!g.prot.some(m=>m.state==="safe")){for(let i=0;i<Math.min(9,4+g.wave);i++)g.prot.push({...spawnProt(g,g.side,rnd(g,150,380)),state:"safe"});g.reinfT=now;}
   g.prot=g.prot.filter(m=>m.state!=="van");
  }
 };
 const drawCop=(m,st,now)=>{
  // Undercover officer: a pulsing police glow, red on one side and blue on the other, swapping like light bars.
  const red="#ff2a44",blu="#2f7bff",swap=Math.floor(now/170)%2===0,pulse=.55+.45*Math.abs(Math.sin(now/150)),s=K.scale();
  protester(sctx,now+m.zig*500,m.look,st);
  const halo=ctx.createRadialGradient(m.x,m.y-27,0,m.x,m.y-27,40);
  halo.addColorStop(0,`rgba(${swap?"255,42,68":"47,123,255"},${.5*pulse})`);halo.addColorStop(.6,`rgba(${swap?"47,123,255":"255,42,68"},${.22*pulse})`);halo.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=halo;ctx.beginPath();ctx.ellipse(m.x,m.y-27,36,42,0,0,7);ctx.fill();
  // Shadows ignore the canvas transform: sized in device pixels, so scaled by hand.
  ctx.save();
  for(const [col,dx] of [[swap?red:blu,-5],[swap?blu:red,5]])for(const blur of [8,14+18*pulse]){ctx.shadowColor=col;ctx.shadowBlur=blur*s;ctx.shadowOffsetX=dx*s;K.blit(54,m.x,m.y,m.side===1);}
  ctx.restore();
  K.blit(54,m.x,m.y,m.side===1);
 };
 g.draw=now=>{
  const until=g.endT||now;
  ctx.fillStyle="#b7a98f";ctx.fillRect(0,0,W,W);
  ctx.fillStyle="#a99b81";for(let y=0;y<W;y+=18)for(let x=(y/18%2)*14;x<W;x+=28)ctx.fillRect(x,y,26,16);
  ctx.fillStyle="#7fae8a55";ctx.fillRect(0,0,EP.zoneL,W);ctx.fillRect(EP.zoneR,0,W-EP.zoneR,W);
  ctx.fillStyle="#f6f1e4";ctx.fillRect(EP.zoneL-2,0,4,W);ctx.fillRect(EP.zoneR-2,0,4,W);
  K.text("CAMP",60,250,"700 11px Inter, sans-serif","#2f4a36");K.text("CAMP",406,250,"700 11px Inter, sans-serif","#2f4a36");
  ctx.fillStyle="#e8edf3";ctx.fillRect(170,46,126,62);ctx.fillStyle="#2f4c8f";ctx.fillRect(170,80,126,8);ctx.fillStyle="#22293a";ctx.fillRect(206,56,54,22);
  ctx.fillStyle="#9fb6d2";for(let i=0;i<5;i++)ctx.fillRect(210+i*10,58,3,18);
  ctx.fillStyle=Math.floor(now/250)%2?"#3c7cf0":"#8fb6ff";ctx.fillRect(220,40,26,7);
  if(hw){ctx.fillStyle="#3b1d5e59";ctx.fillRect(0,0,W,W);}   // in costume: dusk over the square
  K.text(`${g.caught}`,233,104,"700 11px Inter, sans-serif","#fff6ea");
  // On the ground: where each projectile will land (the ring closes in), fires and fallen stones.
  for(const s of g.throws){const a=Math.min(1,(until-s.t0)/s.ms),r=(s.type==="molotov"?EP.fireR:26)*(1.5-.5*a);ctx.strokeStyle=s.type==="molotov"?`rgba(${hw?"110,230,80":"255,120,40"},${.3+.6*a})`:`rgba(40,40,50,${.25+.5*a})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(s.x1,s.y1,r,r*.45,0,0,7);ctx.stroke();}
  for(const f of g.fires){const age=until-f.born,k=Math.max(0,age<200?age/200:age>EP.fireMs-400?(EP.fireMs-age)/400:1);
   const gr=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,EP.fireR*1.3);gr.addColorStop(0,`rgba(${hw?"120,235,90":"255,170,60"},${.55*k})`);gr.addColorStop(1,hw?"rgba(60,200,60,0)":"rgba(255,90,30,0)");ctx.fillStyle=gr;ctx.beginPath();ctx.ellipse(f.x,f.y,EP.fireR*1.3,EP.fireR*.7,0,0,7);ctx.fill();
   ctx.fillStyle="#3a2a2288";ctx.beginPath();ctx.ellipse(f.x,f.y,EP.fireR*.9,EP.fireR*.4,0,0,7);ctx.fill();
   for(let i=0;i<9;i++){const fx=f.x+Math.cos(i*2.4)*EP.fireR*.7*((i%3+1)/3),fy=f.y+Math.sin(i*2.4)*EP.fireR*.3,h=(10+((now/60+i*7)%10))*k;
    ctx.fillStyle=hw?"#2f9e3a":"#e8532c";ctx.fillRect(fx-4,fy-h,8,h);ctx.fillStyle=hw?"#7fe35a":"#ffb13b";ctx.fillRect(fx-2,fy-h*.7,4,h*.7);ctx.fillStyle=hw?"#e6ffc4":"#fff1a8";ctx.fillRect(fx-1,fy-h*.35,2,h*.35);}}
  // A fallen stone; in costume, a squashed pumpkin.
  for(const r of g.rubble){ctx.globalAlpha=Math.max(0,1-(until-r.t)/1500);
   if(hw){ctx.fillStyle="#e8742a";ctx.beginPath();ctx.ellipse(r.x,r.y,11,5,0,0,7);ctx.fill();ctx.fillStyle="#f7b05a";ctx.fillRect(r.x-12,r.y+2,4,3);ctx.fillRect(r.x+8,r.y+1,5,3);ctx.fillStyle="#4f7a2c";ctx.fillRect(r.x-1,r.y-7,3,4);}
   else{ctx.fillStyle="#6f6a63";ctx.fillRect(r.x-7,r.y-5,14,10);ctx.fillStyle="#8e8880";ctx.fillRect(r.x-7,r.y-5,14,3);}ctx.globalAlpha=1;}
  const actors=[];
  for(const m of g.prot)if(m.state!=="van")actors.push({y:m.y,draw:()=>{
   const st=m.state==="caught"?"caught":m.state==="run"&&now>=m.delay?"run":"idle";
   if(m.kind==="infiltre"&&m.state!=="caught")drawCop(m,st,now);else{protester(sctx,now+m.zig*500,m.look,st);K.blit(54,m.x,m.y,m.side===1);}
  }});
  actors.push({y:g.ally.y,draw:()=>{crs(sctx,now,now-g.ally.hitT<300?"win":"run","tonfa");K.blit(66,g.ally.x,g.ally.y,g.ally.flip);}});
  if(!(now<g.inv&&Math.floor(now/90)%2))actors.push({y:g.y,draw:()=>drawCand(g.p,now-g.hitT<700?"stress":now-g.swingT<300?"win":"run",70,g.x,g.y,now)});
  actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
  for(const s of g.throws){const a=Math.min(1,(until-s.t0)/s.ms),x=s.x0+(s.x1-s.x0)*a,y=s.y0+(s.y1-s.y0)*a-Math.sin(a*Math.PI)*80+40*a;
   ctx.save();ctx.translate(x,y);ctx.rotate(now/110);
   // In costume: a pumpkin for a paving stone, a bubbling green potion for a molotov.
   if(hw&&s.type==="pave")pumpkin(ctx,0,0,7,true);
   else if(hw){ctx.fillStyle="#6b3fa0";ctx.beginPath();ctx.arc(0,2,7,0,7);ctx.fill();ctx.fillRect(-2,-9,4,6);ctx.fillStyle="#7fe35a";ctx.beginPath();ctx.arc(0,3,5,0,7);ctx.fill();
    ctx.fillStyle="#d8ffc0";const b=Math.floor(now/120)%3;ctx.fillRect(-3+b*2,1-b,2,2);ctx.fillRect(1-b,-2+b,2,2);ctx.fillStyle="#8a6a48";ctx.fillRect(-2,-12,4,3);}
   else if(s.type==="pave"){ctx.fillStyle="#6f6a63";ctx.fillRect(-7,-6,14,12);ctx.fillStyle="#8e8880";ctx.fillRect(-7,-6,14,4);}
   else{ctx.fillStyle="#4f7a45";ctx.fillRect(-4,-6,8,13);ctx.fillRect(-2,-11,4,5);ctx.fillStyle="#f2e8cd";ctx.fillRect(-2,-14,4,3);ctx.fillStyle=Math.floor(now/80)%2?"#ffb13b":"#e8532c";ctx.fillRect(-3,-20,6,6);}
   ctx.restore();}
  ctx.fillStyle="#141b2ad9";ctx.beginPath();ctx.roundRect(140,122,186,42,10);ctx.fill();
  for(let i=0;i<EP.lives;i++)K.heart(209+i*17,147,i<g.hp);
  K.text(`Vague ${Math.max(1,g.wave)} · ${g.points} pts · ${Math.max(0,Math.ceil((EP.ms-(until-g.t0))/1000))} s`,233,140,"700 12px Inter, sans-serif","#fff6ea");
  if(now-g.reinfT<1400)K.outlined("Des renforts arrivent du cortège !",C,236,18,"#ffd59a");
  else if(now-g.shoutT<1300)K.outlined("« Épervier, sortez ! »",C,236,24,"#fff6ea");
  else if(now-g.t0<1600)K.outlined("Attrape-les avant l'autre camp !",C,236,18,"#fff6ea");
  if(now-g.t0<2400)K.text("Gare aux journalistes et aux collègues infiltrés (aura police)",C,262,"600 11px Inter, sans-serif","#202330");
  K.drawFloaters(now);
  if(g.endT&&now-g.endT>600){
   const freed=g.freed??=Math.round(g.caught*rnd(g,.55,.8)),errs=[g.press&&`${g.press} journaliste${g.press>1?"s":""}`,g.cops&&`${g.cops} collègue${g.cops>1?"s":""}`].filter(Boolean).join(", ");
   K.endPanel(g.why==="hurt"?"Blessé en service":"Fin de la manif",
    [`${g.caught} interpellation${g.caught>1?"s":""}${errs?` · erreurs : ${errs}`:""}`,`dont ${freed} relâché${freed>1?"s":""} sans poursuite`,
     `+${miniBonus("epervier",g.score())} XP d'ordre public (score ${g.score()})`],"#7fa8f8");
  }
 };
}

// ===================================================================== LE DÉBAT CHRONO (both camps: answer the party line, fast)
// The questions live in rules.mjs (the server deals them); kept here for older imports.
export const QUESTIONS=R.QUESTIONS;
// Layout only: the clock (intro, penalty, flash) is R.DEBATE, the referee's.
const DB={top:212,h:46,gap:10,w:316};
// Refereed by the server (R.debateReveal and R.debateAnswer, behind POST /api/debate): after the countdown the game
// asks for its first question, then sends each answer's index and gets the verdict with the next question. It never
// holds the deck nor knows which answer is right; the clock on screen follows the time left the server sends back.
// g.ask(body) returns a promise of the server's reply {ok,q:{idx,text,answers}|null,points,errors,leftMs,done,
// right?,miss?,ignored?,result?}; body is {} (the question on screen, or the verdict once the time is up) or {choice,idx}.
function debate(g,K,drawCand){
 const {ctx}=K,ms=R.MINI.debate.ms,D=R.DEBATE,hw=g.season==="halloween";
 Object.assign(g,{t0:g.t0+D.intro,endAt:g.t0+D.intro+ms,q:null,points:0,errors:0,flashT:-Infinity,flashOk:true,pick:-1,pickT:-Infinity,
  wait:false,asked:false,result:null,failed:false});
 g.score=()=>g.points;
 const left=now=>Math.max(0,g.endAt-Math.max(g.t0,g.endT||now));
 const box=n=>({x:C-DB.w/2,y:DB.top+n*(DB.h+DB.gap),w:DB.w,h:DB.h});
 // One request at a time: an answer waits for the verdict on the previous one.
 const call=body=>{
  g.wait=true;let p;
  try{p=Promise.resolve(g.ask?g.ask(body):null);}catch{p=Promise.resolve(null);}
  p.then(r=>reply(r,body),()=>reply(null,body));
 };
 const reply=(r,body)=>{
  g.wait=false;const now=g.now;
  if(g.endT){if(r?.ok&&r.done&&r.result&&typeof r.result==="object")g.result=r.result;return;}   // given up meanwhile
  if(!r||!r.ok){g.failed=true;g.endT=now;return;}
  const p0=g.points,e0=g.errors;
  if(Number.isInteger(r.points))g.points=r.points;
  if(Number.isInteger(r.errors))g.errors=r.errors;
  if(Number.isFinite(r.leftMs))g.endAt=now+Math.max(0,r.leftMs);
  if("choice" in body){
   if(g.points>p0){g.flashT=now;g.flashOk=true;K.floater("+1",C+150,160,"#9be59b",now);}
   else if(g.errors>e0){g.flashT=now;g.flashOk=false;K.floater(r.miss==="decoy"?"Hors sujet ! −1 s":r.miss==="opponent"?"Ligne de l'adversaire ! −1 s":"Hors de la ligne ! −1 s",C,206,"#ff9aa5",now);}
   else if(r.ignored)K.floater("Lis d'abord la question !",C,206,"#ffd59a",now);
  }
  if(r.done){g.result=r.result&&typeof r.result==="object"?r.result:null;g.endT=now;return;}
  if(r.q&&typeof r.q.text==="string"&&Array.isArray(r.q.answers)&&r.q.answers.length===3)g.q=r.q;
 };
 g.answer=(n,now)=>{
  if(g.endT||g.wait||!g.q||now<g.t0||now-g.flashT<D.flash||!(n>=0&&n<=2)||left(now)<=0)return;
  g.pick=n;g.pickT=now;call({choice:n,idx:g.q.idx});
 };
 g.tapAt=(x,y,now)=>{for(let n=0;n<3;n++){const r=box(n);if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)g.answer(n,now);}};
 // The countdown over, the first question; the time up on screen, the verdict (the server's clock decides).
 g.step=now=>{
  if(g.endT||g.wait||now<g.t0)return;
  if(!g.asked){g.asked=true;call({});}
  else if(left(now)<=0)call({});
 };
 g.draw=now=>{
  const lft=g.camp==="left",accent=lft?"#ef7c91":"#7fa8f8",rest=left(now),frac=rest/ms;
  ctx.fillStyle="#141b2a";ctx.fillRect(0,0,W,W);
  ctx.fillStyle=lft?"#583345":"#2d4265";ctx.beginPath();ctx.arc(C,C,200,0,7);ctx.fill();
  ctx.lineWidth=12;ctx.strokeStyle=lft?"#ffb2c21c":"#b4ceff1c";for(const r of [150,185]){ctx.beginPath();ctx.arc(C,330,r,Math.PI,2*Math.PI);ctx.stroke();}
  // In costume: an orange ring, a crescent moon, two bats and two lanterns, all behind the question and answers.
  if(hw){
   ctx.lineWidth=4;ctx.strokeStyle="#ff8c2a99";ctx.beginPath();ctx.arc(C,C,198,0,7);ctx.stroke();
   ctx.fillStyle="#f6e7b0";ctx.beginPath();ctx.arc(372,146,16,0,7);ctx.fill();ctx.fillStyle=lft?"#583345":"#2d4265";ctx.beginPath();ctx.arc(380,140,14,0,7);ctx.fill();
   bat(ctx,92,152,7,now);bat(ctx,120,126,5,now+170);pumpkin(ctx,168,440,9,true);pumpkin(ctx,298,440,9,true);
  }
  K.outlined(hw?"DÉBAT D'OUTRE-TOMBE":"DÉBAT CHRONO",C,62,20,hw?"#ffb36b":"#fff6ea");
  ctx.fillStyle="#ffffff22";ctx.beginPath();ctx.roundRect(133,76,200,10,5);ctx.fill();
  ctx.fillStyle=frac<.3?"#ff6b7d":"#ffd59a";ctx.beginPath();ctx.roundRect(133,76,Math.max(10,200*frac),10,5);ctx.fill();
  K.text(`${(rest/1000).toFixed(1)} s · ${g.points} argument${g.points>1?"s":""}`,C,104,"700 12px Inter, sans-serif","#fff6ea");
  // The countdown, then (for the time a request takes) the first question on its way.
  if(now<g.t0||!g.q){
   K.outlined(lft?"Défends la ligne de gauche !":"Défends la ligne de droite !",C,190,19,"#fff6ea");
   K.outlined(now<g.t0?String(Math.ceil((g.t0-now)/(D.intro/3))):"…",C,260,44,accent);
   K.text("Touche la bonne réponse, ou 1 · 2 · 3",C,300,"600 12px Inter, sans-serif","#fff6ea");
   drawCand(g.p,"idle",80,C,430,now);
   if(!g.endT)return;
  }else{
   ctx.font="700 18px Fredoka, system-ui, sans-serif";const qw=Math.max(170,ctx.measureText(g.q.text).width+40);
   ctx.fillStyle="#f8efdf";ctx.beginPath();ctx.roundRect(C-qw/2,124,qw,50,16);ctx.fill();
   ctx.beginPath();ctx.moveTo(C-10,174);ctx.lineTo(C,188);ctx.lineTo(C+10,174);ctx.fill();
   K.text(g.q.text,C,156,"700 18px Fredoka, system-ui, sans-serif","#2a2230");
   K.text("ADVERSAIRE",C,120,"700 9px ui-monospace, monospace","#fff6ea99");
   // The last pick flashes green or red for a moment, over the new question's answers; while its verdict is on its
   // way, the answer touched stays lit.
   const flash=now-g.flashT<D.flash,sent=g.wait&&now-g.pickT<1500;
   g.q.answers.forEach((a,n)=>{
    const r=box(n),hot=flash&&n===g.pick,lit=sent&&n===g.pick;
    ctx.fillStyle=hot?(g.flashOk?"#5fbf73":"#e0566a"):lit?"#ffe3a8":"#fff6ea";ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,14);ctx.fill();
    ctx.strokeStyle=hot?"#fff":accent;ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle=accent;ctx.beginPath();ctx.arc(r.x+24,r.y+r.h/2,12,0,7);ctx.fill();
    K.text(String(n+1),r.x+24,r.y+r.h/2+5,"700 13px Inter, sans-serif","#141b2a");
    ctx.font="700 15px Inter, system-ui, sans-serif";let s=String(a);while(ctx.measureText(s).width>r.w-60&&s.length>2)s=s.slice(0,-2)+"…";
    K.text(s,r.x+r.w/2+14,r.y+r.h/2+5,"700 15px Inter, system-ui, sans-serif",hot?"#fff":"#2a2230");
   });
   drawCand(g.p,flash?(g.flashOk?"win":"stress"):"idle",64,C,446,now);
  }
  K.drawFloaters(now);
  if(g.endT&&now-g.endT>500){
   const rate=g.points+g.errors?Math.round(100*g.points/(g.points+g.errors)):0,great=g.points>=R.MINI.debate.great,res=g.result;
   const tally=`${g.points} argument${g.points>1?"s":""} dans la ligne · ${g.errors} faux pas`;
   // The score is the referee's: without its verdict (a game given up), it counts what was played when the time is up.
   const pending=g.failed?"Partie close par l'arbitre.":"Score compté par l'arbitre à la fin du temps.";
   if(g.duel){
    const n=v=>Number.isFinite(v)?v:0;
    const last=!res?pending:res.res==="win"?`Victoire ${n(res.mine)} à ${n(res.theirs)} !`:res.res==="loss"?`Défaite ${n(res.mine)} à ${n(res.theirs)}.`
     :res.res==="tie"?`Match nul, ${n(res.mine)} partout.`:"Score envoyé : ton rival a 24 h pour répondre.";
    K.endPanel("Fin du duel !",[tally,`Fidélité à la ligne : ${rate} %`,last],accent);
   }else K.endPanel(great?"Débat remporté !":g.points>=9?"Match nul sur le plateau":"Recadré par le parti",
    [tally,`Fidélité à la ligne : ${rate} %`,res?`+${Number.isFinite(res.bonus)?res.bonus:miniBonus("debate",g.points)} XP d'éloquence`:pending],great?"#ffd59a":accent);
  }
 };
}

// ===================================================================== ENTRY POINT
// key: "debate", "cortege" or "epervier"; p: the candidate to draw; drawCand(p,state,size,cx,ground,t) draws him.
// The game ends on its own, or with abort(); it is over (score ready to send) a moment after its result shows,
// or sooner with a tap on the result.
// seed (Manif games): the server's seed; every random draw of the game comes from it (Math.random without one).
// ask, duel (debate only): the referee's line (see debate above), and whether it is a duel (its end screen).
// season: "halloween" puts the games in costume (drawings and lines only). Same hitboxes, timings and scores.
export function createMini(key,{p,camp,ctx,scale,drawCand,now,seed,season,ask,duel}){
 const K=makeKit(ctx,scale),g={key,p,camp,t0:now,now,endT:0,keys:{},target:null,skipT:0,seed:Number.isFinite(seed)?seed:null,season:season==="halloween"?"halloween":"",
  ask:typeof ask==="function"?ask:null,duel:!!duel};
 g.rand=g.seed===null?Math.random:R.seeded(g.seed);
 ({debate,cortege,epervier})[key](g,K,drawCand);
 const step0=g.step;
 g.step=(t,dt)=>{g.now=t;step0(t,dt);};
 g.over=t=>!!g.endT&&(t-g.endT>4000||(g.skipT&&g.skipT-g.endT>900));
 g.abort=t=>{if(!g.endT){g.endT=t;g.why=g.why||(key==="cortege"?"down":"time");}};
 g.pointer=(x,y,t,down)=>{
  if(g.endT){if(down)g.skipT=t;return;}
  if(key==="debate"){if(down)g.tapAt(x,y,t);return;}
  g.target=[x,y];
 };
 // Escape gives up; on the result, Enter, Space or Escape go on.
 g.keydown=(k,t)=>{
  if(g.endT){if(k==="Enter"||k===" "||k==="Escape"){g.skipT=t;return true;}return false;}
  if(k==="Escape"){g.abort(t);return true;}
  if(k.startsWith("Arrow")&&key!=="debate"){g.keys[k]=true;return true;}
  if(k===" "&&key==="cortege"){g.special(t);return true;}
  if(/^[1-3]$/.test(k)&&key==="debate"){g.answer(+k-1,t);return true;}
  return false;
 };
 g.keyup=k=>{g.keys[k]=false;};
 g.release=()=>{g.keys={};};
 g.second=t=>{if(key==="cortege")g.special(t);};
 return g;
}
