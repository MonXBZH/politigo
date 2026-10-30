// Extra edge-case tests for the shared game rules (node --test, no dependency).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {H,XP,shop,DOUBLE}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris (winter, UTC+1)
const at=(h)=>MIDNIGHT+h*H;
const noRandom=()=>0.99;                          // never rolls a stress, rematch always loses
function game(camp="left",h=10){return R.newGame(camp,at(h));}
const play=(S,a,h,random=noRandom)=>R.act(S,a,{now:at(h),random});
const full=S=>{S.sat=S.moral=S.energy=S.hyg=100;return S;};
const zeroed=S=>{S.sat=S.moral=S.energy=S.hyg=0;return S;};
const lcg=seed=>{let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2**32;};};
const gauges=["sat","moral","energy","hyg"];

// ------------------------------------------------------------------ A1
test("A1 a 30-day offline gap keeps every gauge in [0,100], numbers finite, level >= 1",()=>{
 for(const [name,rnd] of [["noRandom",noRandom],["lcg",lcg(7)],["always stress",()=>0]]){
  const S=game();
  R.advance(S,at(10)+30*24*H,1,rnd);
  for(const g of gauges)assert.ok(S[g]>=0&&S[g]<=100,`${name}: ${g}=${S[g]}`);
  for(const [k,v] of Object.entries(S))if(typeof v==="number")assert.ok(Number.isFinite(v),`${name}: ${k} not finite`);
  assert.ok(S.lvl>=1&&S.lvl<=100);assert.ok(S.fm>=0&&S.fm<=R.ECO.cap);
 }
 // same thing in daily steps
 const S=game();
 for(let d=1;d<=30;d++){
  R.advance(S,at(10)+d*24*H,1,lcg(d));
  for(const g of gauges)assert.ok(S[g]>=0&&S[g]<=100);
  assert.ok(Number.isFinite(S.xp)&&S.lvl>=1);
 }
});

// ------------------------------------------------------------------ A2
test("A2 a death resets in place and keeps the record",()=>{
 const S=game();const ref=S;
 S.equipped={"Olivier Faure":1};S.bestStreak=7;S.best=12;S.fm=50;S.sleeping=true;S.pong={t:at(10)};S.rematchT=at(10);
 S.lvl=12;S.xp=R.xpFloor(12);zeroed(S);
 const r=R.advance(S,at(10)+13*H,1,noRandom);
 assert.equal(r,true);
 assert.strictEqual(S,ref,"same object identity");
 assert.equal(S.deaths,1);assert.equal(S.sleeping,false);assert.equal(S.pong,null);
 assert.deepEqual(S.equipped,{"Olivier Faure":1});assert.equal(S.bestStreak,7);assert.equal(S.best,12);
 assert.equal(S.fm,10);assert.equal(S.lvl,1);assert.equal(S.xp,0);assert.equal(S.rematchT,-1);assert.equal(S.zero,0);
 assert.equal(S.streak,0);assert.equal(S.form,"Excellente");
 assert.equal(S.journal.filter(j=>j.k==="death").length,1);
 assert.equal(S.journal[0].k,"death");assert.equal(S.journal[0].d.reason,"neglect");
 assert.equal(S.journal[0].d.name,"Raphaël Glucksmann","lvl 12 = stage 1");
 assert.equal(S.journal.at(-1).k,"new","the history survives");
});

// ------------------------------------------------------------------ A3
test("A3 death happens at exactly the configured zero-hours threshold, not one hour before",()=>{
 const S=game();zeroed(S);
 for(let i=1;i<XP.deathHours;i++){
  R.advance(S,at(10+i),1,noRandom);
  assert.equal(S.deaths,0,`still alive after ${i} h`);assert.equal(S.zero,i);
 }
 R.advance(S,at(10+XP.deathHours),1,noRandom);
 assert.equal(S.deaths,1,"dead on the 12th hour");
});

// ------------------------------------------------------------------ A4
test("A4 one long advance never chains several deaths",()=>{
 const S=game();
 R.advance(S,at(10)+60*24*H,1,noRandom);
 assert.equal(S.deaths,1);
 assert.equal(S.journal.filter(j=>j.k==="death").length,1);
 R.advance(S,at(10)+60*24*H+H,1,noRandom);
 assert.equal(S.deaths,1,"a fresh candidate does not die in the next hour");
});

// ------------------------------------------------------------------ A5
test("A5 no stress at night, during a nap, nor while a gauge sits at zero, even when the dice say yes",()=>{
 const stresses=S=>S.journal.filter(j=>j.k==="stress").length;
 const N=game("left",0);full(N);R.advance(N,at(6),1,()=>0);
 assert.equal(stresses(N),0,"night");
 const Z=game();zeroed(Z);R.advance(Z,at(15),1,()=>0);
 assert.equal(stresses(Z),0,"zero > 0");
 const P=game();full(P);P.sleeping=true;P.energy=10;R.advance(P,at(12),1,()=>0);
 assert.equal(stresses(P),0,"nap");
 const D=game();full(D);R.advance(D,at(12),1,()=>0);
 assert.ok(stresses(D)>0,"control: a healthy daytime hour does stress with random=0");
});

// ------------------------------------------------------------------ A6
test("A6 same seeded random gives the exact same state after 24 h of debates and rematches",()=>{
 const run=()=>{
  const rnd=lcg(2026),S=game("right",10);
  play(S,{type:"debate"},10,rnd);play(S,{type:"rematch"},10.3,rnd);
  play(S,{type:"buy",key:"soup"},11,rnd);play(S,{type:"debate"},12.5,rnd);play(S,{type:"rematch"},12.9,rnd);
  R.advance(S,at(34),1,rnd);
  play(S,{type:"debate"},35,rnd);play(S,{type:"rematch"},35.2,rnd);
  return S;
 };
 const a=run(),b=run();
 assert.ok(a.journal.length>5);
 assert.deepEqual(a,b);
});

// ------------------------------------------------------------------ A7
test("A7 a clock going backwards or NaN never throws and vclock never decreases",()=>{
 const S=game();
 play(S,{type:"buy",key:"soup"},12);
 const v=S.vclock;
 for(const now of [at(5),at(0),NaN,undefined,Infinity,-Infinity,null,"x"]){
  assert.doesNotThrow(()=>R.act(S,{type:"pet"},{now,random:noRandom}));
  assert.ok(Number.isFinite(S.vclock));assert.ok(S.vclock>=v,`vclock fell with now=${String(now)}`);
 }
 assert.equal(R.advance(S,NaN,1,noRandom),false);
});

// A rewound clock followed by a normal reading must not replay the gap (12h -> 8h -> 12.5h is +0.5h, not +4.5h).
test("going backwards then forwards does not replay real time twice",()=>{
 const S=game();
 play(S,{type:"pet"},12);play(S,{type:"pet"},8);play(S,{type:"pet"},12.5);
 assert.ok(S.vclock<=at(12.5),`vclock ran ${(S.vclock-at(12.5))/H} h ahead of the real clock`);
});

// ------------------------------------------------------------------ A8
test("A8 buy: not enough FM, bread once per hour, coffee cap per day, refused at night and asleep",()=>{
 const S=game();S.fm=0;
 let r=play(S,{type:"buy",key:"soup"},10);
 assert.equal(r.ok,false);assert.match(r.error,/Il manque \d+ FM\./);
 S.fm=0;
 assert.equal(play(S,{type:"buy",key:"bread"},10.1).ok,true,"bread is free");assert.equal(S.fm,0);
 r=play(S,{type:"buy",key:"bread"},10.5);assert.equal(r.ok,false);assert.match(r.error,/Déjà servi/);
 assert.equal(play(S,{type:"buy",key:"bread"},11).ok,true,"next hour");
 assert.equal(play(S,{type:"buy"},11).ok,false);
 assert.match(play(S,{type:"buy",key:"__proto__"},11).error,/Article inconnu/);

 const C=game();C.fm=50;
 for(const h of [10,10.1,10.2])assert.ok(play(C,{type:"buy",key:"coffee"},h).ok);
 assert.equal(C.coffees,3);
 const fm=C.fm;
 r=play(C,{type:"buy",key:"coffee"},10.3);assert.equal(r.ok,false);assert.match(r.error,/Trois cafés/);assert.equal(C.fm,fm);
 assert.ok(play(C,{type:"buy",key:"coffee"},34).ok,"the cap renews the next day");assert.equal(C.coffees,1);

 const N=game("left",2);
 r=play(N,{type:"buy",key:"soup"},2);assert.equal(r.ok,false);assert.match(r.error,/dort/);assert.equal(N.fm,10);
 const A=game();play(A,{type:"light"},10);assert.ok(A.sleeping);
 r=play(A,{type:"buy",key:"bread"},10.1);assert.equal(r.ok,false);assert.match(r.error,/sieste/);
});

test("A8 pet: once per hour, refused at night and during a nap",()=>{
 const S=game();
 let r=play(S,{type:"pet"},10);assert.equal(r.ok,true);assert.equal(r.petted,true);
 const m=S.moral;
 r=play(S,{type:"pet"},10.5);assert.equal(r.ok,true);assert.equal(r.petted,false);assert.equal(S.moral,m);
 assert.equal(play(S,{type:"pet"},11).petted,true);
 const N=game("left",3);r=play(N,{type:"pet"},3);assert.equal(r.ok,false);assert.match(r.error,/dort/);
 const A=game();play(A,{type:"light"},10);
 r=play(A,{type:"pet"},10.2);assert.equal(r.ok,false);assert.match(r.error,/sieste/);
});

test("A8 light: refused at night, toggles a nap on and off",()=>{
 const N=game("left",1);
 const r=play(N,{type:"light"},1);assert.equal(r.ok,false);assert.match(r.error,/nuit/);assert.equal(N.sleeping,false);
 const S=game();
 const on=play(S,{type:"light"},10);assert.deepEqual([on.ok,on.on],[true,true]);assert.equal(S.sleeping,true);
 S.energy=10;
 const off=play(S,{type:"light"},10.1);assert.deepEqual([off.ok,off.on,off.grumpy],[true,false,true]);
 const E=game();full(E);play(E,{type:"light"},10);full(E);
 const calm=play(E,{type:"light"},10.1);assert.equal(calm.grumpy,false);
});

test("A8 equip: only 0 and 1 are valid, everything else is refused without side effects",()=>{
 const S=game();
 for(const i of [2,-1,"1","0",undefined,null,0.5,NaN,1.0000001,[1],true]){
  const r=play(S,{type:"equip",i},10);
  assert.equal(r.ok,false,`i=${String(i)}`);assert.match(r.error,/Objet inconnu/);
 }
 assert.deepEqual(S.equipped,{});
 assert.ok(play(S,{type:"equip",i:1},10).ok);assert.equal(S.equipped["Olivier Faure"],1);
 assert.equal(R.look(S).prop,"puzzle");
 assert.ok(play(S,{type:"equip",i:0},10).ok);assert.deepEqual(S.equipped,{});assert.equal(R.look(S).prop,"rose");
});

test("A8 pongStart: refused at night and when tired, and it cancels the pending rematch",()=>{
 const N=game("left",3);
 assert.match(play(N,{type:"pongStart"},3).error,/Chut/);assert.equal(N.pong,null);
 const T=game();T.energy=19;
 assert.match(play(T,{type:"pongStart"},10).error,/fatigué/);assert.equal(T.pong,null);
 const S=game();
 assert.ok(play(S,{type:"debate"},10).ok);assert.ok(S.rematchT>=0);
 assert.ok(play(S,{type:"pongStart"},10.2).ok);
 assert.equal(S.rematchT,-1);assert.ok(S.pong);
 const r=play(S,{type:"rematch"},10.3);assert.equal(r.ok,false);assert.match(r.error,/juste après un débat/);
});

test("A8 unknown or null actions answer 'Action inconnue.' without throwing",()=>{
 const S=game();
 for(const a of [null,undefined,{},{type:5},{type:"nope"},{type:"__proto__"},"buy",42,[],{type:null},{type:"BUY"}]){
  let r;assert.doesNotThrow(()=>{r=play(S,a,10);},`a=${JSON.stringify(a)}`);
  assert.deepEqual(r,{ok:false,error:"Action inconnue."});
 }
});

test("A8 restart with a bad camp is refused",()=>{
 const S=game();
 for(const camp of [undefined,null,"centre","__proto__","toString",0]){
  const r=play(S,{type:"restart",camp},10);assert.equal(r.ok,false);assert.match(r.error,/Camp inconnu/);
 }
 assert.equal(S.deaths,0);
});

// ------------------------------------------------------------------ A9
test("A9 rematch is refused at night and asleep, and its window is [0, 1h)",()=>{
 const N=game("left",2);N.rematchT=N.vclock;
 assert.match(R.rematchBlock(N),/Chut/);assert.match(play(N,{type:"rematch"},2.1).error,/Chut/);
 const A=game();play(A,{type:"debate"},10);play(A,{type:"light"},10.1);
 assert.match(play(A,{type:"rematch"},10.2).error,/sieste/);

 const heads=()=>0.1;
 const S=game();play(S,{type:"debate"},10);
 const t0=S.rematchT;assert.equal(t0,at(10));
 const r=R.act(S,{type:"rematch"},{now:t0+H-1,random:heads});
 assert.ok(r.ok);assert.equal(r.win,true);assert.equal(S.rematchT,-1);
 assert.equal(play(S,{type:"rematch"},10.99,heads).ok,false,"only once");

 const E=game();play(E,{type:"debate"},10);
 const e=R.act(E,{type:"rematch"},{now:at(10)+H,random:heads});
 assert.equal(e.ok,false);assert.match(e.error,/juste après un débat/);
 const F=game();play(F,{type:"debate"},10);
 assert.equal(F.rematchT,at(10));
 assert.equal(R.rematchBlock({...F,vclock:at(10)+H-1}),"");assert.notEqual(R.rematchBlock({...F,vclock:at(10)+H}),"");
});

test("A9 rematch: heads restores moral and energy (capped), tails hits twice as hard",()=>{
 const S=game();play(S,{type:"debate"},10);
 S.moral=50;S.energy=50;
 const w=play(S,{type:"rematch"},10.1,()=>0.1);
 assert.equal(w.win,true);assert.equal(S.moral,50+DOUBLE.moral);assert.equal(S.energy,50+DOUBLE.energy);
 const T=game();play(T,{type:"debate"},10);T.moral=50;
 const l=play(T,{type:"rematch"},10.1,()=>0.9);
 assert.equal(l.win,false);assert.equal(T.moral,50-R.STRESS_HIT*DOUBLE.stressFactor);
 assert.equal(T.journal[0].k,"stress");assert.equal(T.journal[0].d.factor,2);
 const C=game();play(C,{type:"debate"},10);C.moral=95;C.energy=99;
 play(C,{type:"rematch"},10.1,()=>0.1);assert.equal(C.moral,100);assert.equal(C.energy,100);
});

// ------------------------------------------------------------------ A10
test("A10 visits: 8 a day, 2 h apart, reset on a new day",()=>{
 const S=game("left",6);
 const buy=(h,key="bread")=>{full(S);S.fm=50;return play(S,{type:"buy",key},h);};
 let paid=0;
 for(let h=6;h<=20;h+=2){const r=buy(h);assert.ok(r.ok);if(r.visit)paid++;}
 assert.equal(paid,XP.visitsPerDay);assert.equal(R.visitsToday(S),8);
 const r9=buy(22);assert.ok(r9.ok);assert.equal(r9.visit,false,"9th visit of the day pays nothing");
 assert.equal(R.visitsToday(S),8);
 assert.equal(R.visitsToday({...S,vclock:at(30)}),0,"read-only view already sees the new day");
 const n=buy(30);assert.equal(n.visit,true);assert.equal(R.visitsToday(S),1);
});

test("A10 visit gap: 1h59 apart pays once, an exact 2 h hour-gap pays twice",()=>{
 const S=game();S.fm=50;
 const v1=play(S,{type:"buy",key:"soup"},10);assert.equal(v1.visit,true);
 const xp=S.xp;
 const v2=play(S,{type:"buy",key:"soup"},11.99);assert.equal(v2.visit,false);
 assert.ok(S.xp-xp<XP.visit);
 const v3=play(S,{type:"buy",key:"soup"},12);assert.equal(v3.visit,true);
});

// ------------------------------------------------------------------ A11
test("A11 the daily activity cap reports its own message",()=>{
 const S=game("left",6);
 let n=0;
 for(const h of [6,6.1,8,8.1,10,10.1,12,12.1]){full(S);const r=play(S,{type:"debate"},h);assert.ok(r.ok,`debate at ${h}`);n++;}
 assert.equal(n,XP.actsPerDay);assert.equal(R.actsToday(S),8);
 full(S);
 const r=play(S,{type:"debate"},14);
 assert.equal(r.ok,false);assert.match(r.error,/Huit activités par jour/);
 full(S);assert.match(play(S,{type:"pongStart"},14.1).error,/Huit activités/);
 full(S);assert.ok(play(S,{type:"debate"},30).ok,"new day, new allowance");assert.equal(R.actsToday(S),1);
});

// ------------------------------------------------------------------ A12
test("A12 level never exceeds 100 and XP never falls below the level floor",()=>{
 const S=game();S.lvl=99;S.best=99;S.xp=R.xpFloor(100)-1;
 play(S,{type:"debate"},10);
 assert.equal(S.lvl,100);
 for(let d=0;d<20;d++){full(S);S.fm=50;play(S,{type:"debate"},12+d*24);play(S,{type:"debate"},12.1+d*24);}
 R.advance(S,at(12)+300*24*H,1,lcg(5));
 assert.ok(S.lvl<=100||S.deaths>0);
 const L=game();L.lvl=100;L.best=100;L.xp=1e6;full(L);
 for(let i=1;i<=20;i++){full(L);R.advance(L,at(10+i),1,noRandom);assert.equal(L.lvl,100);}

 const P=game();P.lvl=20;P.best=20;P.xp=R.xpFloor(20)+1;zeroed(P);
 for(let i=1;i<=6;i++){R.advance(P,at(10+i),1,noRandom);assert.ok(P.xp>=R.xpFloor(20),`xp ${P.xp}`);}
 assert.equal(P.xp,R.xpFloor(20));assert.equal(P.lvl,20);
});

// ------------------------------------------------------------------ A13
test("A13 form and streak transitions follow the worst gauge",()=>{
 const tick=(set)=>{const S=game();full(S);set(S);R.advance(S,at(11),1,noRandom);return S;};
 let S=tick(()=>{});
 assert.deepEqual([S.form,S.mult,S.streak,S.neg],["Excellente",1.25,1,0]);
 S=tick(s=>{s.sat=60;s.streak=5;s.neg=2;});
 assert.deepEqual([S.form,S.mult,S.streak,S.neg],["Correcte",1,0,0]);
 S=tick(s=>{s.sat=30;});
 assert.deepEqual([S.form,S.mult,S.streak,S.neg],["Négligée",0.5,0,1]);
 S=tick(s=>{s.sat=10;s.streak=9;});
 assert.deepEqual([S.form,S.mult,S.streak,S.zero],["Abandonnée",-0.5,0,1]);

 S=game();full(S);S.sat=30;
 R.advance(S,at(11),1,noRandom);R.advance(S,at(12),1,noRandom);
 assert.equal(S.neg,2);assert.ok(Math.abs(S.mult-0.45)<1e-9);

 // streak accumulates, bestStreak is kept when it breaks
 const T=game();
 for(let i=1;i<=5;i++){full(T);R.advance(T,at(10+i),1,noRandom);}
 assert.equal(T.streak,5);assert.equal(T.bestStreak,5);
 T.sat=40;R.advance(T,at(16),1,noRandom);
 assert.equal(T.streak,0);assert.equal(T.bestStreak,5);

 // streak bonus is capped at +25 %
 const C=game();C.lvl=50;C.best=50;C.xp=R.xpFloor(50);full(C);C.streak=100;
 R.advance(C,at(11),1,noRandom);
 assert.ok(Math.abs(C.xp-R.xpFloor(50)-XP.base*1.25*(1+XP.streakCap))<1e-9);
});

// ------------------------------------------------------------------ A14
test("A14 sanitize: prototype pollution is impossible",()=>{
 const evil=JSON.parse('{"__proto__":{"polluted":1}}');
 const S=game();S.equipped=JSON.parse('{"__proto__":{"polluted":1},"constructor":1,"Olivier Faure":1}');
 S.journal[0].d=evil;
 const o=R.sanitize(JSON.parse(JSON.stringify(S)),at(10));
 assert.equal(({}).polluted,undefined);assert.equal(Object.prototype.polluted,undefined);
 assert.deepEqual(o.equipped,{"Olivier Faure":1});
 assert.equal(Object.getPrototypeOf(o.equipped),Object.prototype);
 assert.equal(({}).polluted,undefined);
});

test("A14 sanitize: bad clocks, future lastReal and rematchT are clamped",()=>{
 const now=at(10),base=()=>JSON.parse(JSON.stringify(game()));
 for(const v of [NaN,Infinity,-Infinity,"x",null,{},-5]){
  const s=base();s.vclock=v;const o=R.sanitize(s,now);
  assert.ok(Number.isFinite(o.vclock)&&o.vclock>=0,`vclock=${String(v)}`);
  assert.ok(Number.isFinite(o.hourIdx)&&Math.floor(o.vclock/H)-o.hourIdx<=24*366);
 }
 let s=base();s.lastReal=now+1e12;assert.ok(R.sanitize(s,now).lastReal<=now);
 s=base();s.vclock=at(10);s.rematchT=at(10)+1e12;assert.equal(R.sanitize(s,now).rematchT,at(10));
 s=base();s.rematchT=-1e9;assert.equal(R.sanitize(s,now).rematchT,-1);
 s=base();s.rematchT=NaN;assert.equal(R.sanitize(s,now).rematchT,-1);
 s=base();s.hourIdx=0;assert.ok(Math.floor(R.sanitize(s,now).vclock/H)-R.sanitize(s,now).hourIdx<=24*366);
});

test("A14 sanitize: journal truncation and jn",()=>{
 const now=at(10);
 const s=JSON.parse(JSON.stringify(game()));
 s.journal=Array.from({length:100},(_,i)=>({n:100-i,t:i,k:"k".repeat(50),text:"x".repeat(1000),d:i%2?{a:"y".repeat(500)}:{a:1}}));
 s.journal.push(null,{n:"1",t:1,k:"a",text:"b"},{n:1,t:1,k:5,text:"b"},{n:1,t:1,k:"a",text:7});
 s.jn=0;
 const o=R.sanitize(s,now);
 assert.equal(o.journal.length,40);
 for(const j of o.journal){assert.equal(j.k.length,12);assert.equal(j.text.length,300);}
 assert.ok(o.journal.every((j,i)=>i%2===1?j.d===undefined||JSON.stringify(j.d).length<400:true));
 assert.ok(o.journal.filter(j=>j.d&&j.d.a&&j.d.a.length>=400).length===0,"oversized d dropped");
 assert.equal(o.jn,100,"jn catches up with the biggest kept n");
 for(const jn of [NaN,-3,"a",null])
  {const t=JSON.parse(JSON.stringify(s));t.jn=jn;assert.ok(R.sanitize(t,now).jn>=100);}
 const p=JSON.parse(JSON.stringify(game()));p.journal=[{n:7,t:1,k:"a",text:"b"}];p.jn=2;
 assert.equal(R.sanitize(p,now).jn,7);
 p.jn=50;assert.equal(R.sanitize(p,now).jn,50);
});

test("A14 sanitize: journal is not an array, ranges are enforced",()=>{
 const now=at(10);
 const s={v:2,camp:"left",sat:500,moral:-3,energy:"x",hyg:NaN,fm:1e9,lvl:1e9,best:-4,xp:-9,streak:-1,deaths:2.6,mult:50,form:"Zzz",
  visitsToday:999,equipped:{"Olivier Faure":2,"Marine Le Pen":1,"Nobody":1},sleeping:"yes",pong:{t:Infinity}};
 const o=R.sanitize(s,now);
 assert.deepEqual([o.sat,o.moral,o.energy,o.hyg],[100,0,80,80]);
 assert.equal(o.fm,R.ECO.cap);assert.equal(o.lvl,100);assert.ok(o.best>=o.lvl&&o.best<=100);
 assert.ok(o.xp>=R.xpFloor(100));assert.equal(o.streak,0);assert.equal(o.deaths,3);
 assert.equal(o.mult,1.25);assert.equal(o.form,"Correcte");assert.equal(o.visitsToday,50);
 assert.deepEqual(o.equipped,{"Marine Le Pen":1});assert.equal(o.sleeping,false);assert.equal(o.pong,null);
 assert.deepEqual(o.journal,[]);
 assert.equal(R.sanitize({...s,v:1},now),null);assert.equal(R.sanitize(undefined,now),null);
});

test("A14 sanitize is idempotent and survives a JSON round trip of a played state",()=>{
 const S=game("right",10);S.fm=60;
 const rnd=lcg(99);
 play(S,{type:"buy",key:"coffee"},10,rnd);play(S,{type:"debate"},10.2,rnd);play(S,{type:"rematch"},10.3,rnd);
 play(S,{type:"equip",i:1},10.4,rnd);play(S,{type:"pongStart"},12.5,rnd);play(S,{type:"light"},12.6,rnd);
 R.advance(S,at(20),1,rnd);
 const now=S.lastReal;
 const once=R.sanitize(S,now);
 assert.deepEqual(R.sanitize(once,now),once);
 assert.deepEqual(R.sanitize(JSON.parse(JSON.stringify(S)),now),S);
 assert.deepEqual(JSON.parse(JSON.stringify(once)),once);
 for(const bad of [{v:2,camp:"left"},{v:2,camp:"right",xp:1e30,lvl:50,journal:[{n:1,t:2,k:"a",text:"b",d:{z:1}}]},
  {v:2,camp:"left",vclock:NaN,xp:"9"}]){
  const o=R.sanitize(bad,at(10));assert.deepEqual(R.sanitize(o,at(10)),o);
 }
});

// ------------------------------------------------------------------ A15
test("A15 journal invariants hold under heavy use and after a death",()=>{
 const S=game();
 const check=()=>{
  assert.ok(S.journal.length<=40);
  assert.equal(S.jn,S.journal[0].n);
  for(let i=1;i<S.journal.length;i++)assert.ok(S.journal[i-1].n>S.journal[i].n,"n strictly decreasing");
  assert.equal(new Set(S.journal.map(j=>j.n)).size,S.journal.length);
 };
 for(let i=0;i<70;i++){play(S,{type:"equip",i:i%2},10);}
 check();assert.equal(S.journal.length,40);assert.ok(S.jn>=70);
 const before=S.journal.slice(0,5).map(j=>j.n);
 play(S,{type:"restart",camp:"right"},10.5);
 check();assert.equal(S.journal[0].k,"death");
 assert.deepEqual(S.journal.slice(1,6).map(j=>j.n),before,"older entries survive the death");
 for(let i=0;i<60;i++)play(S,{type:"equip",i:i%2},11);
 check();
 R.advance(S,at(11)+40*24*H,1,lcg(3));check();
});

// ------------------------------------------------------------------ A16
test("A16 restart: same camp allowed, counters reset, record kept, 1 h cooldown also after neglect",()=>{
 const S=game();
 S.lvl=30;S.best=30;S.xp=R.xpFloor(30)+3;S.streak=4;S.bestStreak=9;S.fm=70;S.visitsToday=3;S.actsToday=4;S.coffees=2;
 S.equipped={"Olivier Faure":1};
 const r=play(S,{type:"restart",camp:"left"},10);
 assert.ok(r.ok);assert.equal(S.camp,"left");assert.equal(S.deaths,1);
 assert.deepEqual([S.lvl,S.xp,S.fm,S.streak,S.visitsToday,S.actsToday,S.coffees,S.zero,S.neg],[1,0,10,0,0,0,0,0,0]);
 assert.equal(S.best,30);assert.equal(S.bestStreak,9);assert.deepEqual(S.equipped,{"Olivier Faure":1});
 assert.equal(S.journal[0].d.reason,"resign");assert.equal(S.journal[0].d.camp,"left");
 assert.equal(R.score(S),Math.max(0,Math.round(0+18-150)));

 const N=game();zeroed(N);
 R.advance(N,at(23),1,noRandom);
 assert.equal(N.deaths,1);
 const f=play(N,{type:"restart",camp:"right"},23.5);assert.equal(f.ok,false);assert.match(f.error,/Une démission par heure/);
 assert.equal(N.deaths,1);assert.equal(N.camp,"left");
 assert.ok(play(N,{type:"restart",camp:"right"},24).ok,"exactly one hour later");
 assert.equal(N.camp,"right");assert.equal(N.deaths,2);
});

// ------------------------------------------------------------------ A17
test("A17 dayKey across the spring DST change of 2026-03-29 in Paris",()=>{
 const i0=Date.UTC(2026,2,28,23)/H;            // 00:00 on the 29th, Paris
 assert.equal(R.dayKey(i0-1),20260328);
 assert.equal(R.dayKey(i0),20260329);
 assert.equal(R.hodOf(i0),0);assert.equal(R.hodOf(i0+1),1);assert.equal(R.hodOf(i0+2),3,"2 h does not exist that day");
 assert.equal(R.dayKey(i0+22),20260329);           // 23:00 local
 assert.equal(R.dayKey(i0+23),20260330);           // 00:00 local, the day only lasted 23 h
 assert.equal(R.hodOf(i0+23),0);
 // autumn: the 25 h day
 const j0=Date.UTC(2026,9,24,22)/H;                // 00:00 on 25 Oct, Paris (UTC+2)
 assert.equal(R.dayKey(j0),20261025);assert.equal(R.dayKey(j0+24),20261025);assert.equal(R.dayKey(j0+25),20261026);
});

test("A17 isNight boundaries at 5 / 6 h and the whole night",()=>{
 const S={vclock:at(5)+H-1};assert.equal(R.isNight(S),true);
 S.vclock=at(6);assert.equal(R.isNight(S),false);
 S.vclock=at(6)-1;assert.equal(R.isNight(S),true);
 S.vclock=at(0);assert.equal(R.isNight(S),true);
 S.vclock=at(24)-1;assert.equal(R.isNight(S),false);
 S.vclock=at(24);assert.equal(R.isNight(S),true);
 assert.equal(R.isAsleep({vclock:at(12),sleeping:true}),true);assert.equal(R.isAsleep({vclock:at(12),sleeping:false}),false);
 R.setTimeZone("UTC");
 try{assert.equal(R.isNight({vclock:Date.UTC(2026,0,5,5,59)}),true);assert.equal(R.isNight({vclock:Date.UTC(2026,0,5,6,0)}),false);}
 finally{R.setTimeZone("Europe/Paris");}
});

test("A17 stage bounds, xp curve and the Philippe look",()=>{
 assert.deepEqual([0,1,9,10,19,20,89,90,99,100,1000].map(R.stage),[0,0,0,1,1,2,8,9,9,9,9]);
 assert.equal(R.xpFloor(1),0);
 for(let L=1;L<100;L++)assert.ok(Math.abs(R.xpFloor(L+1)-R.xpFloor(L)-R.xpCost(L))<1e-9);
 assert.equal(R.clamp(-5),0);assert.equal(R.clamp(500),100);assert.equal(R.clamp(42),42);
 const S={camp:"right",equipped:{}};
 const p=R.people.right.find(x=>x.name==="Édouard Philippe");
 const exp=lvl=>R.lookFor(S,p,lvl);
 assert.equal(exp(29).beard,true);assert.equal(exp(29).hair,"#554137");
 assert.equal(exp(30).hair,"#554137");assert.equal(exp(32).beardColor,"#c3c4c6");
 assert.equal(exp(34).hair,"#c3c4c6");assert.equal(exp(36).beard,false);
 assert.equal(exp(38).style,"bald");assert.equal(exp(100).style,"bald");
 assert.equal(exp(30).prop,"lighthouse");
 assert.equal(R.lookFor({camp:"right",equipped:{"Édouard Philippe":1}},p,30).prop,"gloves");
 const o=R.people.left[0];assert.equal(R.lookFor({camp:"left",equipped:{}},o,1).style,o.style);
});

test("A17 data integrity: people, stresses, personal items, shop",()=>{
 const names=[];
 for(const camp of R.CAMPS){
  assert.equal(R.people[camp].length,10);
  for(const p of R.people[camp]){
   names.push(p.name);assert.equal(p.side,camp);
   assert.equal(R.stresses[p.name]?.length,2,`${p.name} stresses`);
   assert.equal(R.personalItems[p.name]?.length,2,`${p.name} items`);
   for(const s of R.stresses[p.name])for(const k of ["trigger","line","ref"])assert.ok(typeof s[k]==="string"&&s[k].length>0);
   for(const it of R.personalItems[p.name])assert.ok(it.name&&it.prop);
  }
 }
 assert.equal(new Set(names).size,names.length,"no duplicate name");
 assert.deepEqual(Object.keys(R.stresses).sort(),[...names].sort());
 assert.deepEqual(Object.keys(R.personalItems).sort(),[...names].sort());
 assert.deepEqual(R.CAMPS,["left","right"]);
 const keys=shop.map(i=>i.key);assert.equal(new Set(keys).size,keys.length,"unique shop keys");
 for(const it of shop){
  assert.ok(Number.isInteger(it.price)&&it.price>=0);assert.ok(it.left&&it.right);
  for(const [k,v] of Object.entries(it.fx)){assert.ok(k in R.fxNames);assert.ok(Number.isFinite(v));}
  assert.ok(R.fxText(it.fx).length>0);
 }
 assert.equal(R.pongLines.left.length,R.pongLines.right.length);
 assert.equal(R.person({camp:"left",lvl:100}).name,"Jean-Luc Mélenchon");
 assert.equal(R.personByName({camp:"left",lvl:1},"Nobody").name,"Olivier Faure");
});

test("the resignation cooldown survives a journal flooded with forty other entries",()=>{
 const S=game();
 assert.ok(play(S,{type:"restart",camp:"left"},10).ok);
 for(let i=0;i<41;i++)play(S,{type:"equip",i:i%2},10.1);
 assert.ok(!S.journal.some(j=>j.k==="death"),"the death entry scrolled out of the journal");
 const r=play(S,{type:"restart",camp:"right"},10.2);assert.equal(r.ok,false);assert.match(r.error,/Une démission par heure/);
 // An old save without diedAt takes the date from its journal.
 const old=game();play(old,{type:"restart",camp:"left"},10);delete old.diedAt;
 assert.equal(R.sanitize(JSON.parse(JSON.stringify(old)),at(10.1)).diedAt,old.journal[0].t);
});

test("the mandate day follows the calendar: day 2 starts at midnight, not 24 h after the birth",()=>{
 const S=R.newGame("left",at(15));                                   // born at 15:00
 assert.equal(R.mandateDay(S,at(15)),1);assert.equal(R.mandateDay(S,at(23.99)),1);
 assert.equal(R.mandateDay(S,at(24)),2,"midnight");assert.equal(R.mandateDay(S,at(32.5)),2,"8:30 the next morning");
 assert.equal(R.mandateDay(S,at(24*7+0.5)),8);
 assert.equal(R.mandateDay(S),1,"defaults to the state's own clock");
 const late=R.newGame("right",at(23.98));assert.equal(R.mandateDay(late,at(24.01)),2,"born a minute before midnight");
 assert.equal(R.mandateDay(S,at(10)),1,"never below 1, even with a clock behind the birth");
});

test("the mandate day survives the daylight-saving changes and follows the game's time zone",()=>{
 // Paris: summer time starts on 2026-03-29 (02:00 → 03:00) and ends on 2026-10-25 (03:00 → 02:00).
 const spring=R.newGame("left",Date.UTC(2026,2,28,14)),autumn=R.newGame("left",Date.UTC(2026,9,24,14));
 assert.equal(R.mandateDay(spring,Date.UTC(2026,2,28,23,30)),2,"00:30 summer time on the 29th");
 assert.equal(R.mandateDay(spring,Date.UTC(2026,2,29,21,59)),2);assert.equal(R.mandateDay(spring,Date.UTC(2026,2,29,22,0)),3);
 assert.equal(R.mandateDay(autumn,Date.UTC(2026,9,24,22,0)),2);assert.equal(R.mandateDay(autumn,Date.UTC(2026,9,25,22,59)),2);
 assert.equal(R.mandateDay(autumn,Date.UTC(2026,9,25,23,0)),3,"midnight in winter time");
 R.setTimeZone("America/New_York");
 try{assert.equal(R.mandateDay(R.newGame("left",Date.UTC(2026,0,5,4)),Date.UTC(2026,0,5,5)),2,"23:00 → 00:00 in New York");}
 finally{R.setTimeZone("Europe/Paris");}
});
