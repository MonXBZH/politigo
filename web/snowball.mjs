// Trêve des confiseurs, the snowball fight: a pure, seeded engine shared by the browser (which draws the fight from
// it, live) and the server (which replays the player's taps with it and keeps the score it computes, never the one the
// browser sends). No DOM, no clock, no Math.random: the same seed and the same taps always give the same fight.
// Coordinates are the round 466x466 screen; times are ms since the start of the fight.
export const SNOW={ms:45000,ammo:5,reload:500,fly:280,flyPerPx:0.25,incoming:1000,splat:1100,maxTaps:400,parryPad:16,far:3,near:2,sleigh:15,passant:-5,passChance:0.12};
// The hiding places: far (small, 3 points) and near (big, 2 points). Every cover is low (26 units of the 64 sprite):
// the head and shoulders show above it.
export const SPOTS=[{x:112,base:252,k:1.3,far:true,cover:"bank"},{x:233,base:256,k:1.3,far:true,cover:"wall"},{x:354,base:252,k:1.3,far:true,cover:"bank"},
 {x:136,base:384,k:2.1,far:false,cover:"wall"},{x:330,base:384,k:2.1,far:false,cover:"bench"}];
export const COVER=26;
const C=233,RISE=140,SIDE=466;
// where the player's balls leave from
export const ORIGIN={x:C+42,y:420};

// mulberry32, as in maquette/duel.js
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export const mult=c=>c>=15?3:c>=10?2:c>=5?1.5:1;

// The fight, from the seed alone. `camp` is the player's: it does not change the draw, so a challenge between two
// players of opposite camps replays the very same fight (the browser picks the foes' sprites from the other camp).
// `foe` is a raw index (the browser takes it modulo its list of élus), `passant` an index into the passers-by or null.
export function schedule(seed,camp){
 void camp;
 const r=rng(seed),pops=[];let t=900;
 while(t<SNOW.ms-900){
  const k=t/SNOW.ms,spot=Math.floor(r()*SPOTS.length),pass=r()<SNOW.passChance;
  const passant=pass?Math.floor(r()*2):null,foe=Math.floor(r()*65536),throws=!pass&&r()<0.3+0.25*k;
  const stay=1350-600*k,aim={x:C+(r()*2-1)*90,y:330+r()*60};
  pops.push({t,spot,stay,passant,foe,throws,throwAt:t+stay*0.45,aim});
  t+=900-470*k+r()*250;
 }
 return {pops,sleighs:[{t:14000,dir:1},{t:33000,dir:-1}]};
}

// 0 to 1: a 140 ms rise, the stay, a 140 ms fall
export function visible(pop,t){
 const dt=t-pop.t;
 if(dt<=0)return 0;
 if(dt<=pop.stay)return Math.min(1,dt/RISE);
 return Math.max(0,1-(dt-pop.stay)/RISE);
}
// the part of a foe that shows above his cover, at a given visibility
export function popRect(pop,vis){
 const s=SPOTS[pop.spot],top=s.base-64*s.k*vis;
 return {x:s.x-32*s.k,y:top,w:64*s.k,h:Math.max(0,s.base-COVER*s.k-top)};
}
// the sleigh crosses the sky in 4.5 s; null when it is not there
export function sleighPos(s,t){
 const k=(t-s.t)/4500;if(k<0||k>1)return null;
 return {x:s.dir>0?-80+k*620:546-k*620,y:92+Math.sin(k*8)*10};
}
// an incoming ball, thrown from the foe's head toward `aim`: where it is at t, and how big ({x,y,r}), or null
export function incomingAt(pop,t){
 const k=(t-pop.throwAt)/SNOW.incoming;if(!(k>=0&&k<1))return null;
 const s=SPOTS[pop.spot],x0=s.x,y0=s.base-64*s.k*0.7;
 return {x:x0+(pop.aim.x-x0)*k,y:y0+(pop.aim.y-y0)*k,r:4+26*k};
}

const okNum=(v,max)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=max;
// Only what a browser sends: an array of at most 400 {t,x,y}, finite, t in [0,45000], x and y in [0,466]. Never throws.
export function validTaps(taps){
 try{
  if(!Array.isArray(taps)||taps.length>SNOW.maxTaps)return false;
  for(const p of taps){
   if(p===null||typeof p!=="object"||Array.isArray(p))return false;
   if(!okNum(p.t,SNOW.ms)||!okNum(p.x,SIDE)||!okNum(p.y,SIDE))return false;
  }
  return true;
 }catch{return false;}
}

// The priority of what happens at the same ms: a foe throws, a ball lands, an incoming ball arrives, then the tap.
const LAUNCH=0,LAND=1,ARRIVE=2,TAP=3;

// Replays the taps against the schedule (the taps are sorted by time first; `sched` is never modified).
// Returns {score,hits,thrown,parries,passHits,taken,best,events}; events: [{t,kind,pts,x,y}] for the browser to draw.
export function play(sched,taps){
 if(!validTaps(taps))throw new RangeError("snowball: invalid taps");
 const pops=sched.pops,sleighs=sched.sleighs||[];
 const hit=new Uint8Array(pops.length),sleighHit=new Uint8Array(sleighs.length);
 const R={score:0,hits:0,thrown:0,parries:0,passHits:0,taken:0,best:0,events:[]};
 let combo=0,ammo=SNOW.ammo,reloadFrom=-1,seq=0;
 const ev=(t,kind,pts,x,y)=>R.events.push({t,kind,pts,x,y});

 // a queue sorted by (t, priority, order of insertion)
 const Q=[];
 const before=(a,b)=>a.t<b.t||(a.t===b.t&&(a.p<b.p||(a.p===b.p&&a.n<b.n)));
 const push=e=>{e.n=seq++;let lo=0,hi=Q.length;while(lo<hi){const m=(lo+hi)>>1;if(before(Q[m],e))lo=m+1;else hi=m;}Q.splice(lo,0,e);};
 for(let i=0;i<pops.length;i++)if(pops[i].throws)push({t:pops[i].throwAt,p:LAUNCH,i});
 const sorted=taps.map(o=>({t:o.t,x:o.x,y:o.y})).sort((a,b)=>a.t-b.t||a.x-b.x||a.y-b.y);
 for(const o of sorted)push({t:o.t,p:TAP,x:o.x,y:o.y});

 const flying=[];   // incoming balls in the air: pop indexes, in launch order
 const land=(t,x,y)=>{
  for(let j=0;j<sleighs.length;j++){
   const pos=sleighPos(sleighs[j],t);
   if(pos&&!sleighHit[j]&&x>pos.x-70&&x<pos.x+50&&y>pos.y-20&&y<pos.y+30){sleighHit[j]=1;R.score+=SNOW.sleigh;R.hits++;ev(t,"sleigh",SNOW.sleigh,x,y);return;}
  }
  for(let i=0;i<pops.length;i++){
   if(hit[i])continue;
   const p=pops[i],vis=visible(p,t);if(vis<0.55)continue;
   const s=SPOTS[p.spot],half=32*s.k-8;
   if(x>=s.x-half&&x<=s.x+half&&y>=s.base-64*s.k*vis&&y<=s.base-COVER*s.k){
    hit[i]=1;
    if(p.passant!=null){R.score=Math.max(0,R.score+SNOW.passant);combo=0;R.passHits++;ev(t,"pass",SNOW.passant,x,y);return;}
    combo++;R.best=Math.max(R.best,combo);R.hits++;
    const pts=Math.round((s.far?SNOW.far:SNOW.near)*mult(combo));R.score+=pts;ev(t,"hit",pts,x,y);return;
   }
  }
  combo=0;ev(t,"miss",0,x,y);
 };
 const tap=(t,x,y)=>{
  // an incoming ball first: tapped, it breaks in flight, and costs no ammo
  for(let j=0;j<flying.length;j++){
   const b=incomingAt(pops[flying[j]],t);
   if(b&&Math.sqrt((x-b.x)**2+(y-b.y)**2)<b.r+SNOW.parryPad){flying.splice(j,1);R.parries++;R.score+=1;ev(t,"parry",1,b.x,b.y);return;}
  }
  if(ammo<SNOW.ammo&&reloadFrom>=0){
   const n=Math.floor((t-reloadFrom)/SNOW.reload);
   if(n>0){ammo=Math.min(SNOW.ammo,ammo+n);reloadFrom=ammo<SNOW.ammo?reloadFrom+n*SNOW.reload:-1;}
  }
  if(ammo<1){ev(t,"empty",0,x,y);return;}
  if(ammo===SNOW.ammo)reloadFrom=t;
  ammo--;R.thrown++;
  push({t:t+SNOW.fly+SNOW.flyPerPx*Math.sqrt((x-ORIGIN.x)**2+(y-ORIGIN.y)**2),p:LAND,x,y});
 };

 while(Q.length){
  const e=Q.shift();
  if(e.t>SNOW.ms)break;
  if(e.p===TAP)tap(e.t,e.x,e.y);
  else if(e.p===LAND)land(e.t,e.x,e.y);
  else if(e.p===LAUNCH){if(!hit[e.i]){flying.push(e.i);push({t:e.t+SNOW.incoming,p:ARRIVE,i:e.i});}}
  else{const j=flying.indexOf(e.i);if(j>=0){flying.splice(j,1);combo=0;R.taken++;const a=pops[e.i].aim;ev(e.t,"taken",0,a.x,a.y);}}
 }
 return R;
}
