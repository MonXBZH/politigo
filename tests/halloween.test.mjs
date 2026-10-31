// Seasonal event (Halloween): the calendar window in the game's time zone, the costume data, the daily treat, and
// the guarantee that a duel deals and replays exactly as outside the event (node --test, rules only).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {H,HALLOWEEN}=R;
R.setTimeZone("Europe/Paris");
const never=()=>0.99;   // never rolls a stress
// Paris is UTC+1 from the last Sunday of October (25 Oct 2026): local time = UTC + 1 h on these dates.
const paris=(y,mo,d,h=0,mi=0,s=0,ms=0)=>Date.UTC(y,mo-1,d,h-1,mi,s,ms);
// A day at 10:00 local, 31 October 2026.
const DAY=paris(2026,10,31,10);
// Moves a state forward without playing the hours in between (no gauge drain, no death): only the clock moves.
function jump(S,ms){S.vclock+=ms;S.lastReal+=ms;S.hourIdx=Math.floor(S.vclock/H);return S.lastReal;}
const treat=(S,now,event="halloween",random=never)=>R.act(S,{type:"treat"},{now,random,event});

// ---------------------------------------------------------------- eventAt
test("eventAt auto: 31 Oct 00:00 to 1 Nov 23:59:59.999, Paris time, edges included",()=>{
 assert.equal(R.eventAt(paris(2026,10,30,23,59,59,999)),"");
 assert.equal(R.eventAt(paris(2026,10,31,0,0,0,0)),"halloween");
 assert.equal(R.eventAt(paris(2026,10,31,12)),"halloween");
 assert.equal(R.eventAt(paris(2026,11,1,12)),"halloween");
 assert.equal(R.eventAt(paris(2026,11,1,23,59,59,999)),"halloween");
 assert.equal(R.eventAt(paris(2026,11,2,0,0,0,0)),"");
 assert.equal(R.eventAt(paris(2026,10,31,0),"auto"),"halloween","auto is the default");
 // The edges in UTC: Paris is an hour ahead.
 assert.equal(R.eventAt(Date.UTC(2026,9,30,22,59,59,999)),"");
 assert.equal(R.eventAt(Date.UTC(2026,9,30,23)),"halloween");
 assert.equal(R.eventAt(Date.UTC(2026,10,1,22,59,59,999)),"halloween");
 assert.equal(R.eventAt(Date.UTC(2026,10,1,23)),"");
});

test("eventAt auto: every year, and never on other days",()=>{
 for(const y of [2025,2028,2029,2030]){   // DST already over by 30 Oct: UTC+1
  assert.equal(R.eventAt(paris(y,10,30,23,59,59,999)),"",`${y}-10-30`);
  assert.equal(R.eventAt(paris(y,10,31,0)),"halloween",`${y}-10-31`);
  assert.equal(R.eventAt(paris(y,11,1,23,59)),"halloween",`${y}-11-01`);
  assert.equal(R.eventAt(paris(y,11,2,0)),"",`${y}-11-02`);
 }
 for(const [mo,d] of [[1,1],[3,31],[10,1],[10,30],[11,2],[12,31],[5,31],[11,30]])
  assert.equal(R.eventAt(paris(2026,mo,d,12)),"",`${mo}/${d}`);
});

test("eventAt modes: off never, halloween always, unknown mode or bad clock never",()=>{
 assert.deepEqual(R.EVENT_MODES,["auto","off","halloween"]);
 assert.equal(R.eventAt(paris(2026,10,31,12),"off"),"");
 assert.equal(R.eventAt(paris(2026,11,1,12),"off"),"");
 for(const ms of [paris(2026,3,14,12),paris(2026,10,31,12),0,Date.now()])assert.equal(R.eventAt(ms,"halloween"),"halloween");
 for(const m of ["bogus","Halloween","",null,"christmas"])assert.equal(R.eventAt(paris(2026,10,31,12),m),"",String(m));
 for(const ms of [NaN,Infinity,-Infinity,undefined,"x"])assert.equal(R.eventAt(ms),"",String(ms));
});

test("eventAt follows setTimeZone (another zone shifts the window)",()=>{
 try{
  R.setTimeZone("Etc/GMT+10");   // UTC-10
  assert.equal(R.eventAt(Date.UTC(2026,9,30,23)),"","still 30 Oct 13:00 there");
  assert.equal(R.eventAt(Date.UTC(2026,9,31,9,59,59,999)),"");
  assert.equal(R.eventAt(Date.UTC(2026,9,31,10)),"halloween");
  assert.equal(R.eventAt(Date.UTC(2026,10,1,23)),"halloween","still 1 Nov 13:00 there");
  assert.equal(R.eventAt(Date.UTC(2026,10,2,9,59,59,999)),"halloween");
  assert.equal(R.eventAt(Date.UTC(2026,10,2,10)),"");
 }finally{R.setTimeZone("Europe/Paris");}
 assert.equal(R.timeZone(),"Europe/Paris");
 assert.equal(R.eventAt(Date.UTC(2026,9,30,23)),"halloween");
});

// ---------------------------------------------------------------- data
const nonEmpty=s=>typeof s==="string"&&s.trim().length>0;
test("HALLOWEEN.shop: a costume for every shop item and camp, distinct from the normal names, nothing extra",()=>{
 assert.deepEqual(Object.keys(HALLOWEEN.shop).sort(),R.shop.map(i=>i.key).sort());
 for(const it of R.shop){
  const c=HALLOWEEN.shop[it.key];
  assert.deepEqual(Object.keys(c).sort(),["left","right"],it.key);
  for(const camp of ["left","right"]){
   assert.ok(nonEmpty(c[camp]),`${it.key}.${camp}`);
   assert.notEqual(c[camp],it[camp],`${it.key}.${camp} is a costume`);
  }
  assert.notEqual(c.left,c.right,it.key);
 }
});

test("HALLOWEEN.pong: short distinct lines, as many for each camp",()=>{
 assert.deepEqual(Object.keys(HALLOWEEN.pong).sort(),["left","right"]);
 assert.equal(HALLOWEEN.pong.left.length,HALLOWEEN.pong.right.length);
 assert.ok(HALLOWEEN.pong.left.length>0);
 for(const camp of ["left","right"]){
  const l=HALLOWEEN.pong[camp];
  for(const s of l){assert.ok(nonEmpty(s),s);assert.ok(s.length<=40,`too long: ${s}`);assert.ok(!R.pongLines[camp].includes(s),`already a normal line: ${s}`);}
  assert.equal(new Set(l).size,l.length,`duplicates in ${camp}`);
 }
});

test("HALLOWEEN.questions: four strings, three distinct answers, none from the duel questions",()=>{
 assert.ok(HALLOWEEN.questions.length>0);
 const normal=new Set(R.QUESTIONS.map(q=>q[0]));
 for(const q of HALLOWEEN.questions){
  assert.equal(q.length,4,q[0]);
  for(const s of q)assert.ok(nonEmpty(s),q[0]);
  assert.equal(new Set(q.slice(1)).size,3,q[0]);
  assert.ok(!normal.has(q[0]),`already a duel question: ${q[0]}`);
 }
 assert.equal(new Set(HALLOWEEN.questions.map(q=>q[0])).size,HALLOWEEN.questions.length);
});

test("HALLOWEEN sleep, ghost and treat lines for both camps",()=>{
 for(const camp of ["left","right"]){
  assert.ok(nonEmpty(HALLOWEEN.sleep[camp]),"sleep "+camp);
  assert.ok(nonEmpty(HALLOWEEN.ghost[camp]),"ghost "+camp);
  const t=HALLOWEEN.treat.lines[camp];
  assert.ok(Array.isArray(t)&&t.length>0,"treat "+camp);
  for(const s of t)assert.ok(nonEmpty(s),s);
 }
 assert.equal(HALLOWEEN.treat.moral,5);
});

// ---------------------------------------------------------------- names and lines
test("itemName: the costume only during Halloween",()=>{
 for(const it of R.shop)for(const camp of ["left","right"]){
  assert.equal(R.itemName(it,camp),it[camp]);
  assert.equal(R.itemName(it,camp,""),it[camp]);
  assert.equal(R.itemName(it,camp,"christmas"),it[camp]);
  assert.equal(R.itemName(it,camp,"halloween"),HALLOWEEN.shop[it.key][camp]);
 }
});

test("pongLine: normal lines outside the event, both pools during it",()=>{
 for(const camp of ["left","right"]){
  const rnd=R.seeded(7);
  for(let k=0;k<500;k++)assert.ok(R.pongLines[camp].includes(R.pongLine(camp,"",rnd)));
  const rh=R.seeded(8);let normal=0,costume=0;
  for(let k=0;k<1000;k++){
   const l=R.pongLine(camp,"halloween",rh);
   if(R.pongLines[camp].includes(l))normal++;else if(HALLOWEEN.pong[camp].includes(l))costume++;else assert.fail("unknown line "+l);
  }
  assert.ok(normal>300&&costume>300,`${camp}: ${normal} normal, ${costume} costume`);
 }
});

// ---------------------------------------------------------------- the treat
test("treat: refused outside the event",()=>{
 for(const ev of ["",undefined,"christmas"]){
  const S=R.newGame("left",DAY);
  const r=R.act(S,{type:"treat"},{now:DAY,random:never,event:ev});
  assert.equal(r.ok,false);assert.equal(r.error,"Plus de bonbons : Halloween est fini.");
  assert.equal(S.treatDay,-1);assert.equal(S.moral,80);
 }
 assert.equal(R.treatBlock(R.newGame("left",DAY)),"Plus de bonbons : Halloween est fini.");
});

test("treat: refused asleep, at night (before 06:00) and during a nap",()=>{
 const night=paris(2026,10,31,3);
 const S=R.newGame("right",night);
 assert.ok(R.isNight(S));
 let r=treat(S,night);assert.equal(r.ok,false);assert.match(r.error,/dort/);assert.equal(S.treatDay,-1);
 const N=R.newGame("left",DAY);
 assert.ok(R.act(N,{type:"light"},{now:DAY,random:never}).ok);assert.equal(N.sleeping,true);
 r=treat(N,DAY);assert.equal(r.ok,false);assert.match(r.error,/dort/);
 assert.equal(N.treatDay,-1);assert.equal(N.moral,80);
 // Light back on: it works.
 N.energy=100;assert.ok(R.act(N,{type:"light"},{now:DAY,random:never}).ok);
 assert.equal(treat(N,DAY).ok,true);
});

test("treat: once a game day, +5 moral (capped), logged; again the next day",()=>{
 const S=R.newGame("left",DAY);
 assert.equal(S.treatDay,-1);assert.equal(R.treatBlock(S,"halloween"),"");
 const n0=S.journal.length;
 let r=treat(S,DAY);
 assert.equal(r.ok,true,r.error);
 assert.equal(S.moral,85);assert.equal(S.treatDay,20261031);
 assert.equal(S.journal.length,n0+1);
 const j=S.journal[0];
 assert.equal(j.k,"treat");assert.ok(HALLOWEEN.treat.lines.left.includes(j.d.line));assert.ok(j.text.includes(j.d.line));
 assert.match(j.text,/Moral \+5/);
 // The same day: refused, nothing changes.
 const later=jump(S,5*H);
 r=treat(S,later);assert.equal(r.ok,false);assert.equal(r.error,"Déjà servi aujourd'hui : reviens demain.");
 assert.equal(S.moral,85);assert.equal(S.journal.length,n0+1);
 // The next day (1 Nov 10:00): again, capped at 100.
 const next=jump(S,19*H);
 assert.equal(R.dayKey(R.curIdx(S)),20261101);
 S.moral=98;
 r=treat(S,next);assert.equal(r.ok,true,r.error);
 assert.equal(S.moral,100);assert.equal(S.treatDay,20261101);
 r=treat(S,next);assert.equal(r.ok,false);
});

test("treat: the right camp gets its own lines",()=>{
 const S=R.newGame("right",DAY);
 assert.equal(treat(S,DAY,"halloween",()=>0).ok,true);
 assert.equal(S.journal[0].d.line,HALLOWEEN.treat.lines.right[0]);
});

test("treat: a resignation keeps the day, so it cannot reopen the treat",()=>{
 const S=R.newGame("left",DAY);
 assert.equal(treat(S,DAY).ok,true);
 const r=R.act(S,{type:"restart",camp:"right"},{now:DAY,random:never});
 assert.equal(r.ok,true,r.error);
 assert.equal(S.camp,"right");assert.equal(S.lvl,1);assert.equal(S.deaths,1);
 assert.equal(S.treatDay,20261031);
 const t=treat(S,DAY);assert.equal(t.ok,false);assert.equal(t.error,"Déjà servi aujourd'hui : reviens demain.");
});

test("treatDay: fresh -1, sanitize keeps a valid day and resets garbage",()=>{
 assert.equal(R.freshState("left",DAY).treatDay,-1);
 assert.equal(R.newGame("right",DAY).treatDay,-1);
 const S=R.newGame("left",DAY);assert.equal(treat(S,DAY).ok,true);
 const copy=JSON.parse(JSON.stringify(S));
 assert.equal(R.sanitize(copy,DAY).treatDay,20261031);
 for(const bad of ["20261031",null,undefined,NaN,{},[],true]){
  const c={...copy,treatDay:bad};
  assert.equal(R.sanitize(c,DAY).treatDay,-1,String(bad));
 }
 assert.equal(R.sanitize({...copy,treatDay:-50},DAY).treatDay,-1);
 assert.equal(R.sanitize({...copy,treatDay:1e15},DAY).treatDay,1e9);
 const old={...copy};delete old.treatDay;   // a state saved before the event
 assert.equal(R.sanitize(old,DAY).treatDay,-1);
});

// ---------------------------------------------------------------- the shop in costume
test("buy: the costume name in the journal during Halloween, same price and effects",()=>{
 for(const camp of ["left","right"])for(const key of ["bread","soup","snack","garden"]){
  const it=R.shop.find(i=>i.key===key);
  const a=R.newGame(camp,DAY),b=R.newGame(camp,DAY);
  const ra=R.act(a,{type:"buy",key},{now:DAY,random:never,event:""});
  const rb=R.act(b,{type:"buy",key},{now:DAY,random:never,event:"halloween"});
  assert.equal(ra.ok,true,ra.error);assert.deepEqual(rb,ra);
  assert.ok(a.journal[0].text.startsWith(it[camp]+" :"),a.journal[0].text);
  assert.ok(b.journal[0].text.startsWith(HALLOWEEN.shop[key][camp]+" :"),b.journal[0].text);
  assert.deepEqual(b.journal[0].d,a.journal[0].d);
  // Everything else identical: FM, gauges, XP, counters.
  const strip=S=>{const o={...S};delete o.journal;return o;};
  assert.deepEqual(strip(b),strip(a));
  assert.equal(a.journal[0].text.slice(it[camp].length),b.journal[0].text.slice(HALLOWEEN.shop[key][camp].length));
 }
});

// ---------------------------------------------------------------- duels are untouched
test("debateRounds: the new count parameter defaults to QUESTIONS.length",()=>{
 for(let s=0;s<300;s++){
  const seed=(s*2654435761)>>>0;
  assert.deepEqual(R.debateRounds(R.seeded(seed)),R.debateRounds(R.seeded(seed),undefined,R.QUESTIONS.length),String(seed));
  assert.deepEqual(R.debateRounds(R.seeded(seed),7),R.debateRounds(R.seeded(seed),7,R.QUESTIONS.length));
 }
 // A deck with the costume questions deals indexes beyond QUESTIONS, never from a duel.
 const all=R.QUESTIONS.length+HALLOWEEN.questions.length;
 const big=R.debateRounds(R.seeded(5),all,all).map(r=>r.i);
 assert.deepEqual([...big].sort((x,y)=>x-y),Array.from({length:all},(_,i)=>i));
 for(const r of R.debateRounds(R.seeded(5),200))assert.ok(r.i<R.QUESTIONS.length);
});

test("replayDebate: the same deal and score as before the event (fixed seed)",()=>{
 assert.deepEqual(R.debateRounds(R.seeded(424242),6),[
  {i:4,order:[0,1,2]},{i:7,order:[1,2,0]},{i:5,order:[1,2,0]},{i:18,order:[1,2,0]},{i:9,order:[0,1,2]},{i:16,order:[1,0,2]}]);
 const picks=[[0,300],[1,700],[2,1100],[0,1500],[1,1900],[2,2300]];
 assert.deepEqual(R.replayDebate(424242,"left",picks),{points:2,errors:4,last:2300});
 assert.deepEqual(R.replayDebate(424242,"right",picks),{points:2,errors:4,last:2300});
 // The right answers for the camp score every pick.
 const rounds=R.debateRounds(R.seeded(424242),6);
 for(const camp of ["left","right"]){
  const good=rounds.map((r,k)=>[r.order.indexOf(R.ANSWER_KINDS.indexOf(camp)),300+k*400]);
  assert.deepEqual(R.replayDebate(424242,camp,good),{points:6,errors:0,last:2300});
 }
});

test("act debate during Halloween: the same game, only the journal line may change",()=>{
 for(const camp of ["left","right"]){
  const a=R.newGame(camp,DAY),b=R.newGame(camp,DAY);
  const ra=R.act(a,{type:"debate"},{now:DAY,random:R.seeded(3),event:""});
  const rb=R.act(b,{type:"debate"},{now:DAY,random:R.seeded(3),event:"halloween"});
  assert.equal(ra.ok,true,ra.error);assert.deepEqual(rb,ra);
  assert.deepEqual(b.mini,a.mini);assert.deepEqual(b.mini,{k:"debate",t:DAY,id:ra.game.id});
  // The referee's deck is the only difference: the event's questions join a solo debate in costume.
  assert.deepEqual({...rb.turn,count:0},{...ra.turn,count:0});assert.equal(rb.turn.count,R.debateCount("halloween"));assert.equal(ra.turn.count,R.QUESTIONS.length);
  assert.equal(b.rematchT,a.rematchT);assert.equal(b.pong,null);
  for(const k of ["xp","lvl","moral","energy","sat","hyg","fm","actsToday","visitsToday","actsVisit"])assert.equal(b[k],a[k],k);
  assert.equal(b.journal[0].k,"act");assert.equal(b.journal[0].text,a.journal[0].text);
  assert.ok([...R.pongLines[camp],...HALLOWEEN.pong[camp]].includes(b.journal[0].d.line));
 }
});

test("a purchase reads « name : price, effects », in costume or not",()=>{
 for(const event of ["","halloween"]){
  const S=R.newGame("left",DAY);R.act(S,{type:"buy",key:"soup"},{now:DAY,random:never,event});
  const name=event?HALLOWEEN.shop.soup.left:R.shop.find(i=>i.key==="soup").left;
  assert.ok(S.journal[0].text.startsWith(`${name} : −1 FM, satiété +15`),S.journal[0].text);
 }
});
