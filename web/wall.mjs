// La Nuit du collage: the pure wall rules, shared by the server and the browser (no clock, no DOM, no I/O).
// Times are numbers in ms (the caller passes `now`); everything is deterministic from its inputs.
// The walls are a queue of 8×6 walls kept in ONE flat array of cells (wall w = cells[w*48 .. w*48+47]); a full last
// wall opens the next one (at most 5), a trailing empty wall disappears, wall 1 always exists (settleWalls).
// A cell is null (empty) or a poster:
//   {camp:"left"|"right", by:playerId|null, name:string|null, vol:boolean (a volunteer), sol:1..3,
//    at:ms of the last paste or refresh, takenFrom?:camp it was captured from, takenAt?:ms of the capture, motif:number}

export const WALL_W=8,WALL_H=6,WALL_CELLS=WALL_W*WALL_H,MAX_WALLS=5;
export const DAILY_QUOTA=5;
export const HOUR=3600_000;
export const WEAR_H={pale:24,torn:44,free:48};   // nette < 24 h ≤ pâlie < 44 h ≤ déchirée < 48 h = freed
export const BRUSH_MS=3000,BRUSH_MIN_MS=250;     // the brush auto-stops at 3 s; a stop faster than 250 ms is not human
export const ZONE={perfect:0.06,good:0.2};       // half-widths around the gauge's centre (0.5)
export const SOLIDITY={parfait:3,bon:2,bacle:1};
export const XP={parfait:14,bon:10,bacle:5};
export const QUALITY_LABEL={parfait:"parfait",bon:"bon",bacle:"bâclé"};
export const VOLUNTEER_QUALITY="bon";
export const WAVE_HOURS=[10,13,16,19,22];        // one volunteer poster per wave: 5 waves = the daily quota
export const THREAT_AGE_H=40;                    // an own poster this old is « proche des 48 h »
export const RETAKE_H=24;                        // a cell lost less than 24 h ago is « perdue récemment »
export const CAMPS=["left","right"];
export const otherCamp=c=>c==="left"?"right":"left";
export const CAMP_NAME={left:"la Gauche",right:"la Droite"};

// ---------------------------------------------------------------- deterministic draws
// FNV-1a over the parts, then an avalanche: the same parts always give the same 32-bit number.
export function hash32(...parts){
 let h=0x811c9dc5;
 for(const p of parts){const s=String(p);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}h^=0x1f;h=Math.imul(h,0x01000193);}
 h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
 return h>>>0;
}
export const rand01=(...parts)=>hash32(...parts)/4294967296;

// ---------------------------------------------------------------- the brush
// A back-and-forth (triangle wave) over the gauge 0..1. The seed sets the speed (one round trip in 1.3–1.9 s) and the
// start: near an edge, so stopping at once never lands in the centre.
export function brushMotion(seed){
 const period=1300+Math.floor(rand01(seed,"period")*600);
 const phase=(rand01(seed,"side")<0.5?0:0.5)+rand01(seed,"phase")*0.1;
 return {period,phase};
}
export function brushPos(seed,ms){
 const {period,phase}=brushMotion(seed),t=Math.min(Math.max(ms,0),BRUSH_MS);
 const x=(t/period+phase)%1;
 return x<0.5?x*2:2-x*2;
}
// The quality of a stop after `ms`: no stop before 3 s (or an impossible time) is « bâclé ».
export function brushQuality(seed,ms){
 if(!Number.isFinite(ms)||ms<BRUSH_MIN_MS||ms>=BRUSH_MS)return "bacle";
 const d=Math.abs(brushPos(seed,ms)-0.5);
 return d<=ZONE.perfect?"parfait":d<=ZONE.good?"bon":"bacle";
}
// The server's check on a returned time: not faster than a human, not longer than what really elapsed (+ tolerance).
export const brushTimeOk=(ms,serverElapsedMs,toleranceMs=1000)=>
 Number.isFinite(ms)&&ms>=BRUSH_MIN_MS&&ms<=BRUSH_MS&&ms<=serverElapsedMs+toleranceMs;

// ---------------------------------------------------------------- wear
export const ageH=(cell,now)=>(now-cell.at)/HOUR;
export function wearStage(cell,now){
 if(!cell)return "vide";
 const a=ageH(cell,now);
 return a<WEAR_H.pale?"nette":a<WEAR_H.torn?"palie":a<WEAR_H.free?"dechiree":"libre";
}
export const liveCell=(cell,now)=>cell&&ageH(cell,now)<WEAR_H.free?cell:null;
export const hoursLeft=(cell,now)=>WEAR_H.free-ageH(cell,now);
// Frees the posters that reached 48 h. Returns a new wall and the freed indexes.
export function freeExpired(wall,now){
 const freed=[];
 const next=wall.map((c,i)=>{if(c&&!liveCell(c,now)){freed.push(i);return null;}return c;});
 return {wall:next,freed};
}

// ---------------------------------------------------------------- the queue of walls
export const wallCount=cells=>Math.max(1,Math.ceil(cells.length/WALL_CELLS));
export const wallOf=g=>Math.floor(g/WALL_CELLS);
export const emptyWalls=(n=1)=>Array(n*WALL_CELLS).fill(null);
const wallSlice=(cells,w)=>cells.slice(w*WALL_CELLS,(w+1)*WALL_CELLS);
// Frees the expired posters, drops the trailing empty walls (never wall 1), then opens the next wall if the last one
// is full (up to MAX_WALLS). Returns a new array and the freed indexes. Run it after every change and on every tick.
export function settleWalls(cells,now){
 const f=freeExpired(cells,now);let next=f.wall;
 while(next.length>WALL_CELLS&&wallSlice(next,wallCount(next)-1).every(c=>!c))next=next.slice(0,next.length-WALL_CELLS);
 if(next.length<WALL_CELLS)next=next.concat(emptyWalls(1).slice(next.length));
 const n=wallCount(next);
 if(n<MAX_WALLS&&wallSlice(next,n-1).every(c=>c))next=next.concat(emptyWalls(1));
 return {cells:next,freed:f.freed};
}
// The wall shown when the screen opens: the first with an empty cell, else wall 1.
export function firstOpenWall(cells,now){
 for(let w=0;w<wallCount(cells);w++)if(wallSlice(cells,w).some(c=>!liveCell(c,now)))return w;
 return 0;
}
export const wallScore=(cells,w,now)=>countWall(wallSlice(cells,w),now);

// ---------------------------------------------------------------- one paste
// The effect of a paste on a cell, at the moment the brush stops (an expired poster counts as empty).
// outcome: "posee" (empty cell) | "rafraichie" (own camp) | "abimee" (enemy −1) | "prise" (enemy fell to 0).
export function pasteEffect(cell,{camp,quality,by=null,name=null,now,vol=false,motif=0}){
 const got=SOLIDITY[quality],cur=liveCell(cell,now);
 if(!cur)return {cell:{camp,by,name,vol,sol:got,at:now,motif},outcome:"posee"};
 if(cur.camp===camp)return {cell:{...cur,by,name,vol,sol:Math.max(cur.sol,got),at:now},outcome:"rafraichie"};
 if(cur.sol>1)return {cell:{...cur,sol:cur.sol-1},outcome:"abimee"};
 return {cell:{camp,by,name,vol,sol:got,at:now,takenFrom:cur.camp,takenAt:now,motif},outcome:"prise"};
}
export function applyPaste(wall,idx,paste){
 const {cell,outcome}=pasteEffect(wall[idx],paste);
 const next=wall.slice();next[idx]=cell;
 return {wall:next,outcome};
}
// A « collage utile » for the weekly title: a pose on an empty cell or a capture.
export const isUseful=outcome=>outcome==="posee"||outcome==="prise";

// ---------------------------------------------------------------- the night (all walls together)
export function countWall(wall,now){
 const n={left:0,right:0,empty:0};
 for(const c of wall){const l=liveCell(c,now);if(l)n[l.camp]++;else n.empty++;}
 return n;
}
// active = {left,right}: human colleurs who pasted at least once that day. Only a camp with one can win.
// Returns the winners (0, 1 or 2 camps) and the feed line (null when nobody wins).
export function scoreNight(counts,active){
 const can=CAMPS.filter(c=>active[c]>0);
 let winners=[];
 if(can.length===2){
  if(counts.left>counts.right)winners=["left"];
  else if(counts.right>counts.left)winners=["right"];
  else if(counts.left>=1)winners=["left","right"];
 }else if(can.length===1&&counts[can[0]]>=1)winners=[can[0]];
 return {winners,line:nightLine(winners,counts,can)};
}
const cases=n=>`${n} case${n>1?"s":""}`;
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
export function nightLine(winners,counts,can){
 if(!winners.length)return null;
 if(winners.length===2)return `🖌️ Égalité : ${CAMP_NAME.left} et ${CAMP_NAME.right} se partagent le mur cette nuit (${cases(counts.left)} chacune).`;
 const w=winners[0],l=otherCamp(w);
 const alone=can.length===1&&counts[w]<=counts[l]?` : ${CAMP_NAME[l]} n'a pas collé.`:".";
 return `🖌️ ${cap(CAMP_NAME[w])} a tenu le mur cette nuit (${cases(counts[w])} contre ${counts[l]})${alone}`;
}

// ---------------------------------------------------------------- the volunteers
// The minority camp gets min(A − B, B): never more than its own real players, none if it has no active colleur.
export function volunteerCounts(active){
 const n={left:0,right:0};
 const a=active.left,b=active.right;
 if(a>b)n.right=Math.min(a-b,b);else if(b>a)n.left=Math.min(b-a,a);
 return n;
}
// The volunteers' daily budget, followed from one wave to the next. `slots` = what each current volunteer has left.
// A volunteer appearing at wave i only gets the share of the remaining waves (at 22 h: 1 poster, not 5); when the gap
// shrinks, the extra volunteers leave with what they had left.
export function planWave(slots,count,waveIndex){
 const waves=WAVE_HOURS.length,left=waves-waveIndex;
 if(left<=0)return {slots:[],posters:0};
 const next=slots.slice(0,count);
 while(next.length<count)next.push(Math.round(DAILY_QUOTA*left/waves));
 let posters=0;
 const after=next.map(b=>{const n=Math.min(b,Math.ceil(b/left));posters+=n;return b-n;});
 return {slots:after,posters};
}
// Where a volunteer of `camp` pastes, in order: 1. refresh its own most threatened poster (about to expire, then
// solidity 1); 2. retake a cell lost in the last 24 h; 3. an empty cell; 4. the weakest enemy poster.
// All open walls are targets; an empty-cell pose goes to the first wall that has one. Ties: the lowest seeded draw. Returns {idx, reason} or null (nothing to do: cannot happen on a real wall).
export function pickVolunteerTarget(wall,camp,now,seed){
 const draw=i=>rand01(seed,i);
 const best=(list,key)=>list.length?list.map(i=>({i,k:[...key(i),draw(i)]})).sort((a,b)=>{for(let j=0;j<a.k.length;j++)if(a.k[j]!==b.k[j])return a.k[j]-b.k[j];return 0;})[0].i:null;
 const live=wall.map(c=>liveCell(c,now));
 const idxs=f=>live.flatMap((c,i)=>f(c)?[i]:[]);
 const enemy=otherCamp(camp);
 const threatened=idxs(c=>c&&c.camp===camp&&(c.sol===1||ageH(c,now)>=THREAT_AGE_H));
 if(threatened.length)return {idx:best(threatened,i=>[ageH(live[i],now)>=THREAT_AGE_H?0:1,live[i].sol,-ageH(live[i],now)]),reason:"menacee"};
 const lost=idxs(c=>c&&c.camp===enemy&&c.takenFrom===camp&&now-c.takenAt<RETAKE_H*HOUR);
 if(lost.length)return {idx:best(lost,i=>[live[i].sol]),reason:"reprise"};
 const empty=idxs(c=>!c);
 if(empty.length){const w=wallOf(empty[0]);return {idx:best(empty.filter(i=>wallOf(i)===w),()=>[]),reason:"libre"};}
 const foes=idxs(c=>c&&c.camp===enemy);
 if(foes.length)return {idx:best(foes,i=>[live[i].sol]),reason:"attaque"};
 return null;
}
// One wave for one camp: `posters` volunteer pastes, always « bon », by nobody (by:null, vol:true). Each paste sees the last
// (a wall they fill opens the next one).
export function runVolunteers(wall,{camp,posters,now,seed}){
 const actions=[];
 for(let k=0;k<posters;k++){
  const t=pickVolunteerTarget(wall,camp,now,hash32(seed,k));
  if(!t)break;
  const r=applyPaste(wall,t.idx,{camp,quality:VOLUNTEER_QUALITY,by:null,name:null,vol:true,motif:hash32(seed,k,"motif")%1000,now});
  wall=settleWalls(r.wall,now).cells;actions.push({idx:t.idx,reason:t.reason,outcome:r.outcome});
 }
 return {wall,actions};
}

// ---------------------------------------------------------------- the week
// events: [{who, at, outcome}] for one week (volunteers: who = null, ignored). Only poses and captures count;
// a tie goes to whoever reached that score first. Returns {who, score, reachedAt} or null.
export function weeklyScores(events){
 const s=new Map();
 for(const e of [...events].sort((a,b)=>a.at-b.at)){
  if(e.who==null||!isUseful(e.outcome))continue;
  const r=s.get(e.who)||{who:e.who,score:0,reachedAt:0};
  r.score++;r.reachedAt=e.at;s.set(e.who,r);
 }
 return [...s.values()].sort((a,b)=>b.score-a.score||a.reachedAt-b.reachedAt);
}
export const weeklyChampion=events=>weeklyScores(events)[0]||null;

// ---------------------------------------------------------------- cells
// « C4 » inside its wall; cellLabel adds the wall: « mur 2, C4 ».
export const cellName=g=>{const i=g%WALL_CELLS;return `${String.fromCharCode(65+i%WALL_W)}${Math.floor(i/WALL_W)+1}`;};
export const cellLabel=g=>`mur ${wallOf(g)+1}, ${cellName(g)}`;

// ---------------------------------------------------------------- the calendar
// The index of the Monday-start week holding a server day key (integer YYYYMMDD, Paris time; see R.dayKey).
export function weekOf(dayKey){
 const y=Math.floor(dayKey/10000),m=Math.floor(dayKey/100)%100,d=dayKey%100;
 return Math.floor((Date.UTC(y,m-1,d)/864e5-4)/7);   // day 4 since 1970-01-01 is Monday 1970-01-05
}

// ---------------------------------------------------------------- the gate
// Why a player cannot paste now, or "" when they can. Pasting is open 24/7: only the level and the daily quota count.
export function wallBlock(S,{minLevel,used}){
 if((S.lvl|0)<minLevel)return `La Nuit du collage s'ouvre au niveau ${minLevel}.`;
 if(used>=DAILY_QUOTA)return "Plus d'affiche aujourd'hui : reviens demain.";
 return "";
}
