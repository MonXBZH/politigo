// Trêve des confiseurs, the snowball fight's engine (web/snowball.mjs): the browser draws it, the server replays the
// player's taps with it to compute the score. Pure, seeded, deterministic.
import {test} from "node:test";
import assert from "node:assert/strict";
import {SNOW,SPOTS,COVER,schedule,validTaps,play,mult,visible,sleighPos} from "../web/snowball.mjs";

const C=233,X0=C+42,Y0=420;
// where the centre of a fully risen foe is, and when a ball thrown at t reaches (x,y)
const centre=i=>{const s=SPOTS[i];return {x:s.x,y:Math.round(s.base-(64+COVER)/2*s.k)};};
const landAt=(t,x,y)=>t+SNOW.fly+SNOW.flyPerPx*Math.sqrt((x-X0)**2+(y-Y0)**2);
const pop=(o)=>({t:1000,spot:0,stay:2000,passant:null,foe:0,throws:false,throwAt:1900,aim:{x:C,y:350},...o});
const noSleigh={sleighs:[]};
// a tap at time t aimed at (x,y)
const tapAt=(t,{x,y})=>({t,x,y});

test("the constants are the brief's",()=>{
 assert.deepEqual(SNOW,{ms:45000,ammo:5,reload:500,fly:280,flyPerPx:0.25,incoming:1000,splat:1100,maxTaps:400,parryPad:16,far:3,near:2,sleigh:15,passant:-5,passChance:0.12});
 assert.equal(COVER,26);
 assert.equal(SPOTS.length,5);
 assert.equal(SPOTS.filter(s=>s.far).length,3);
 for(const s of SPOTS)for(const k of ["x","base","k","far","cover"])assert.ok(k in s);
});

test("the same seed gives the same fight; another seed another one",()=>{
 const a=schedule(42,"left");
 assert.deepEqual(a,schedule(42,"left"));
 assert.notDeepEqual(a,schedule(43,"left"));
 assert.ok(a.pops.length>30);
 for(const p of a.pops){
  assert.ok(p.t>=900&&p.t<=44100,`pop.t ${p.t}`);
  assert.ok(p.spot>=0&&p.spot<SPOTS.length&&Number.isInteger(p.spot));
  assert.ok(p.stay<=1350&&p.stay>=750);
  assert.ok(p.passant===null||p.passant===0||p.passant===1);
  assert.ok(Number.isInteger(p.foe)&&p.foe>=0);
  assert.equal(typeof p.throws,"boolean");
  if(p.passant!==null)assert.equal(p.throws,false);
  assert.equal(p.throwAt,p.t+p.stay*0.45);
  assert.ok(p.aim.x>=C-90&&p.aim.x<=C+90&&p.aim.y>=330&&p.aim.y<=390);
 }
 for(let i=1;i<a.pops.length;i++)assert.ok(a.pops[i].t>a.pops[i-1].t);
 assert.deepEqual(a.sleighs,[{t:14000,dir:1},{t:33000,dir:-1}]);
 // a challenge replays the very same fight, whatever the camps
 assert.deepEqual(schedule(42,"right"),a);
 // some passers-by and some throwers over a few seeds
 const many=[1,2,3,4,5].flatMap(s=>schedule(s,"left").pops);
 assert.ok(many.some(p=>p.passant!==null));
 assert.ok(many.some(p=>p.throws));
});

test("visible: a 140 ms rise, the stay, a 140 ms fall",()=>{
 const p=pop({t:1000,stay:2000});
 assert.equal(visible(p,999),0);
 assert.equal(visible(p,1000),0);
 assert.equal(visible(p,1070),0.5);
 assert.equal(visible(p,1140),1);
 assert.equal(visible(p,3000),1);
 assert.equal(visible(p,3070),0.5);
 assert.equal(visible(p,3140),0);
 assert.equal(visible(p,9000),0);
});

test("mult: x1.5 from 5, x2 from 10, x3 from 15",()=>{
 assert.equal(mult(0),1);assert.equal(mult(4),1);assert.equal(mult(5),1.5);assert.equal(mult(9),1.5);
 assert.equal(mult(10),2);assert.equal(mult(14),2);assert.equal(mult(15),3);assert.equal(mult(99),3);
});

test("a tap on a visible foe scores by depth and the streak multiplies",()=>{
 const sched={pops:[pop({t:1000,spot:0,stay:2000})],...noSleigh};
 const c=centre(0);
 const r=play(sched,[tapAt(1200,c)]);
 assert.ok(landAt(1200,c.x,c.y)<3000);
 assert.equal(r.score,3);assert.equal(r.hits,1);assert.equal(r.thrown,1);assert.equal(r.best,1);
 assert.deepEqual(r.events.map(e=>e.kind),["hit"]);
 assert.equal(r.events[0].pts,3);
 assert.ok(r.events[0].t>1200);
 // a near foe pays 2
 const near=play({pops:[pop({spot:3})],...noSleigh},[tapAt(1200,centre(3))]);
 assert.equal(near.score,2);
 // five far foes in a row: the fifth is worth 3x1.5
 const five={pops:[0,1,2,3,4].map(i=>pop({t:1000+i*3000,spot:i%3,stay:2000})),...noSleigh};
 const r5=play(five,[0,1,2,3,4].map(i=>tapAt(1200+i*3000,centre(i%3))));
 assert.equal(r5.hits,5);assert.equal(r5.best,5);
 assert.equal(r5.score,3+3+3+3+Math.round(3*1.5));
});

test("a foe is hit once, only above the cover and only while at least 55 % visible",()=>{
 const c=centre(0);
 // two balls on the same foe: the second one misses
 const twice=play({pops:[pop()],...noSleigh},[tapAt(1200,c),tapAt(1201,c)]);
 assert.equal(twice.hits,1);assert.equal(twice.score,3);
 assert.deepEqual(twice.events.map(e=>e.kind),["hit","miss"]);
 // the cover hides the legs
 const s=SPOTS[0];
 const low=play({pops:[pop()],...noSleigh},[tapAt(1200,{x:s.x,y:s.base-5})]);
 assert.equal(low.hits,0);
 // just beside the shoulders
 const side=play({pops:[pop()],...noSleigh},[tapAt(1200,{x:Math.ceil(s.x+32*s.k-8)+1,y:c.y})]);
 assert.equal(side.hits,0);
 // gone by the time the ball lands
 const late=play({pops:[pop({stay:300})],...noSleigh},[tapAt(1200,c)]);
 assert.equal(late.hits,0);assert.equal(late.events[0].kind,"miss");
 // still rising: under 55 %
 // still rising: the ball lands at 1065 ms (46 % visible) on the chin, which already shows above the cover
 const chin={x:s.x,y:215};
 assert.ok(chin.y>=s.base-64*s.k*(65/140)&&chin.y<=s.base-COVER*s.k);
 const early=play({pops:[pop({t:1000})],...noSleigh},[tapAt(1065-landAt(0,chin.x,chin.y),chin)]);
 assert.equal(early.hits,0);assert.equal(early.events[0].kind,"miss");
 // the same spot once fully risen is a hit
 assert.equal(play({pops:[pop({t:1000})],...noSleigh},[tapAt(1500-landAt(0,chin.x,chin.y),chin)]).hits,1);
});

test("passers-by cost 5 and break the streak; the sleigh pays 15; a miss breaks the streak",()=>{
 const c=centre(0);
 // a passer-by with nothing scored yet: the score stays at 0
 const p0=play({pops:[pop({passant:1})],...noSleigh},[tapAt(1200,c)]);
 assert.equal(p0.score,0);assert.equal(p0.passHits,1);assert.equal(p0.hits,0);
 assert.equal(p0.events[0].kind,"pass");assert.equal(p0.events[0].pts,-5);
 // two foes then a passer-by then a foe: 3+3, -5, then 3 again on a broken streak
 const seq={pops:[pop({t:1000}),pop({t:4000,spot:1}),pop({t:7000,spot:2,passant:0}),pop({t:10000,spot:0})],...noSleigh};
 const r=play(seq,[tapAt(1200,centre(0)),tapAt(4200,centre(1)),tapAt(7200,centre(2)),tapAt(10200,centre(0))]);
 assert.equal(r.score,3+3-5+3);assert.equal(r.best,2);assert.equal(r.passHits,1);assert.equal(r.hits,3);
 // a miss breaks the streak: 4 hits, a miss, 4 hits -> never the 1.5 multiplier
 const nine={pops:Array.from({length:8},(_,i)=>pop({t:1000+i*3000,spot:i%3})),...noSleigh};
 const taps=[];for(let i=0;i<8;i++){if(i===4)taps.push(tapAt(1200+3.5*3000,{x:233,y:120}));taps.push(tapAt(1200+i*3000,centre(i%3)));}
 const m=play(nine,taps);
 assert.equal(m.hits,8);assert.equal(m.best,4);assert.equal(m.score,24);
 assert.equal(m.events.filter(e=>e.kind==="miss").length,1);
 // the sleigh pays 15, once
 const sl={pops:[],sleighs:[{t:14000,dir:1}]};
 const tt=14000+Math.round(0.5*4500)-500;
 const target=t=>sleighPos({t:14000,dir:1},t);
 // find a tap whose ball lands inside the box
 let hitTap=null;
 for(let x=60;x<=400&&!hitTap;x+=4){const p=target(landAt(tt,x,95));if(p&&x>p.x-70&&x<p.x+50&&95>p.y-20&&95<p.y+30)hitTap={t:tt,x,y:95};}
 assert.ok(hitTap);
 const s1=play(sl,[hitTap,{...hitTap,t:tt+1}]);
 assert.equal(s1.score,15);assert.equal(s1.hits,1);
 assert.deepEqual(s1.events.map(e=>e.kind),["sleigh","miss"]);
 // no sleigh before 14 s
 assert.equal(sleighPos({t:14000,dir:1},13999),null);
 assert.deepEqual(sleighPos({t:14000,dir:1},14000),{x:-80,y:92});
});

test("an incoming ball tapped is parried without ammo; untapped it lands and resets the streak",()=>{
 const aim={x:233,y:350};
 const thrower=pop({t:5000,spot:1,stay:2000,throws:true,throwAt:5900,aim});
 const s=SPOTS[1],x0=s.x,y0=s.base-64*s.k*0.7;
 // tapped halfway: parried, +1, no ammo spent: 5 throws still go out right after
 const half={t:6400,x:Math.round(x0+(aim.x-x0)*0.5),y:Math.round(y0+(aim.y-y0)*0.5)};
 const after=[0,1,2,3,4].map(i=>({t:6401+i,x:20,y:20}));
 const r=play({pops:[thrower],...noSleigh},[half,...after]);
 assert.equal(r.parries,1);assert.equal(r.taken,0);assert.equal(r.score,1);
 assert.equal(r.thrown,5);
 assert.equal(r.events.filter(e=>e.kind==="empty").length,0);
 assert.equal(r.events.find(e=>e.kind==="parry").pts,1);
 // untapped: it lands after 1000 ms, the streak goes back to 0, best is kept, the score does not move
 const two={pops:[pop({t:1000}),thrower,pop({t:9000,spot:0})],...noSleigh};
 const u=play(two,[tapAt(1200,centre(0)),tapAt(9200,centre(0))]);
 assert.equal(u.taken,1);assert.equal(u.best,1);assert.equal(u.score,6);
 const tk=u.events.find(e=>e.kind==="taken");
 assert.equal(tk.t,6900);assert.equal(tk.pts,0);assert.equal(tk.x,aim.x);assert.equal(tk.y,aim.y);
 // a foe hit before his throw never throws
 const shot=play({pops:[thrower],...noSleigh},[tapAt(5200,centre(1))]);
 assert.equal(shot.hits,1);assert.equal(shot.taken,0);
});

test("five balls then a 500 ms reload",()=>{
 const taps=[0,1,2,3,4,5,6].map(i=>({t:1000+i,x:20,y:20}));
 const r=play({pops:[],...noSleigh},taps);
 assert.equal(r.thrown,5);
 assert.equal(r.events.filter(e=>e.kind==="empty").length,2);
 // one ball back 500 ms after the first throw, then one every 500 ms
 const r2=play({pops:[],...noSleigh},[...taps,{t:1499,x:20,y:20},{t:1500,x:20,y:20},{t:1999,x:20,y:20},{t:2000,x:20,y:20}]);
 assert.equal(r2.thrown,7);
 // a long rest refills to 5, never more
 const r3=play({pops:[],...noSleigh},[...taps,...[0,1,2,3,4,5].map(i=>({t:20000+i,x:20,y:20}))]);
 assert.equal(r3.thrown,10);
});

test("validTaps refuses what a browser never sends",()=>{
 const ok={t:10,x:10,y:10};
 assert.equal(validTaps([]),true);
 assert.equal(validTaps([ok,{t:45000,x:466,y:0},{t:0,x:0,y:466}]),true);
 assert.equal(validTaps(Array.from({length:400},()=>ok)),true);
 for(const bad of [null,undefined,{},"taps",42,true,Array.from({length:401},()=>ok),
  [{...ok,t:NaN}],[{...ok,t:-1}],[{...ok,t:45001}],[{...ok,x:500}],[{...ok,y:-3}],[{...ok,t:Infinity}],
  [{...ok,t:"10"}],[{x:10,y:10}],[null],["tap"],[[10,10,10]],[ok,7]])
  assert.equal(validTaps(bad),false,JSON.stringify(bad));
 // a hostile getter never makes it throw
 const evil=[{get t(){throw new Error("boom");},x:1,y:1}];
 assert.equal(validTaps(evil),false);
 // play refuses what validTaps refuses
 assert.throws(()=>play({pops:[],sleighs:[]},[{t:NaN,x:0,y:0}]),RangeError);
});

test("play does not touch the schedule; a ball landing after the whistle does not count",()=>{
 const sched=schedule(7,"left");
 const copy=structuredClone(sched);
 const taps=sched.pops.slice(0,40).map(p=>({t:Math.round(p.t+200),x:SPOTS[p.spot].x,y:centre(p.spot).y}));
 const a=play(sched,taps);
 assert.deepEqual(sched,copy);
 assert.deepEqual(play(sched,taps),a);
 assert.ok(a.score>=0&&a.hits>0);
 const end=play({pops:[pop({t:44500,stay:1350})],...noSleigh},[{t:44990,x:SPOTS[0].x,y:centre(0).y}]);
 assert.equal(end.hits,0);assert.equal(end.thrown,1);
 assert.ok(end.events.every(e=>e.t<=SNOW.ms));
});

test("the order of the taps does not matter, and 400 taps replay in under 50 ms",()=>{
 const sched=schedule(2024,"right");
 let seed=99;const r=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
 const taps=Array.from({length:400},(_,i)=>({t:Math.floor(r()*45001),x:Math.floor(r()*467),y:Math.floor(r()*467)}));
 const sorted=[...taps].sort((a,b)=>a.t-b.t||a.x-b.x||a.y-b.y);
 const shuffled=[...taps].reverse();
 assert.ok(validTaps(taps));
 const a=play(sched,sorted);
 assert.deepEqual(play(sched,taps),a);
 assert.deepEqual(play(sched,shuffled),a);
 assert.ok(a.score>=0);
 play(sched,taps);   // warm-up
 const t0=performance.now();
 play(sched,taps);
 const ms=performance.now()-t0;
 assert.ok(ms<50,`${ms} ms`);
 console.log(`400 taps replayed in ${ms.toFixed(2)} ms`);
});

// ------------------------------------------------------------------ the fight in the rules (Task 4)
import * as R from "../web/rules.mjs";
import {NO_FX} from "../web/events.mjs";

R.setTimeZone("Europe/Paris");
const H=R.H,MIDNIGHT=Date.UTC(2026,11,4,23,0);   // 00:00 in Paris on 5 December (UTC+1)
const at=h=>MIDNIGHT+h*H;
const noRandom=()=>0.99;
const newS=(camp="left",h=10)=>R.newGame(camp,at(h));
const doIt=(S,a,h,{ms=0,event="noel"}={})=>R.act(S,a,{now:at(h)+ms,random:noRandom,event});
// taps that hit the first n standing foes (no passer-by), each aimed at the foe's centre `lead` ms after it appears
function tapsFor(seed,n,lead=300){
 const sched=schedule(seed,"left"),taps=[];let last=-1e9;
 for(const p of sched.pops){
  if(taps.length>=n)break;
  if(p.passant!==null)continue;
  const t=Math.round(p.t+lead);if(t-last<600)continue;
  taps.push({t,...centre(p.spot)});last=t;
 }
 return taps;
}

test("MINI.snowball is the brief's, and the bonus follows it",()=>{
 const m=R.MINI.snowball;
 assert.deepEqual({label:m.label,camp:m.camp,xp:m.xp,ms:m.ms,intro:m.intro,minScore:m.minScore,bonusRate:m.bonusRate,bonusCap:m.bonusCap,great:m.great},
  {label:"Bataille de boules de neige",camp:null,xp:35,ms:45000,intro:0,minScore:10,bonusRate:0.4,bonusCap:35,great:80});
 assert.equal(R.snowBonus(8),0);
 assert.equal(R.snowBonus(9),0);
 assert.equal(R.snowBonus(10),4);
 assert.equal(R.snowBonus(40),16);
 assert.equal(R.snowBonus(200),35);
 assert.equal(R.snowBonus(40,2),32);
});

test("snowStart only during the Trêve, as an activity",()=>{
 const S=newS(),xp0=S.xp;
 const no=doIt(S,{type:"snowStart"},10,{event:""});
 assert.equal(no.ok,false);assert.match(no.error,/seulement pendant la Trêve/);
 assert.equal(S.mini,null);assert.equal(S.xp,xp0);
 const ok=doIt(S,{type:"snowStart"},10);
 assert.equal(ok.ok,true);
 assert.equal(ok.game.k,"snowball");assert.equal(typeof ok.game.id,"string");assert.ok(Number.isInteger(ok.game.seed));
 assert.equal(S.mini.k,"snowball");assert.equal(S.mini.noel,true);assert.equal(S.mini.seed,ok.game.seed);assert.equal(S.mini.t,at(10));
 assert.ok(S.xp-xp0>=35,"the start pays 35 XP");
 assert.equal(R.act(newS(),{type:"snowStart"},{now:at(10),random:noRandom}).ok,false,"no event given: refused");
});

test("snowStart: the event's XP multiplier applies, a challenge brings its seed",()=>{
 const S=newS();
 const fx=()=>({...NO_FX,xp:{...NO_FX.xp,snowball:2}});
 const xp0=S.xp;
 const r=R.act(S,{type:"snowStart",challenge:{id:"c1",seed:777}},{now:at(10),random:noRandom,event:"noel",boost:fx});
 assert.equal(r.ok,true);assert.equal(r.game.seed,777);
 assert.equal(S.mini.ch,"c1");assert.equal(S.mini.x,2);
 assert.ok(S.xp-xp0>=70);
 for(const bad of [{id:"c",seed:-1},{id:"c",seed:1.5},{id:"c",seed:"3"},{id:"c",seed:2**40},{seed:5},{id:"",seed:5},{id:"a b",seed:5},"x"]){
  const T=newS();
  const b=doIt(T,{type:"snowStart",challenge:bad},10);
  assert.equal(b.ok,false,JSON.stringify(bad));assert.equal(T.mini,null);
 }
 const T=newS();assert.equal(doIt(T,{type:"snowStart",challenge:null},10).ok,true);assert.equal(T.mini.ch,undefined);
});

test("miniEnd replays the taps; a score sent is ignored",()=>{
 const S=newS(),s=doIt(S,{type:"snowStart"},10);
 const lazy=doIt(S,{type:"miniEnd",id:s.game.id,taps:[],score:999},10,{ms:45000});
 assert.equal(lazy.ok,true);assert.equal(lazy.result.score,0);assert.equal(lazy.bonus,0);
 assert.equal(lazy.result.events,undefined,"the events stay out of the result");
 assert.equal(S.mini,null);

 const T=newS(),t=doIt(T,{type:"snowStart"},10),taps=tapsFor(t.game.seed,4);
 assert.equal(taps.length,4);
 const want=play(schedule(t.game.seed,"left"),taps);
 assert.ok(want.score>0);
 const r=doIt(T,{type:"miniEnd",id:t.game.id,taps,score:1},10,{ms:45000});
 assert.equal(r.ok,true);
 const {events,...rest}=want;
 assert.deepEqual(r.result,rest);
 assert.equal(r.bonus,R.snowBonus(want.score));
 assert.equal(r.audit.game,"snowball");assert.equal(r.audit.score,want.score);assert.equal(r.audit.seed,t.game.seed);
 assert.equal(r.audit.start,at(10));assert.equal(r.audit.noel,true);assert.deepEqual(r.audit.flags,[]);assert.equal(r.audit.ch,undefined);
 assert.equal(Object.keys(r).includes("audit"),false,"the audit is hidden from the browser");
 assert.match(T.journal[0].text,/^Bataille de boules de neige : \d+ points?, bonus \+\d+ XP\.$/);
 assert.equal(doIt(T,{type:"miniEnd",id:t.game.id,taps},10,{ms:45000}).ok,false,"no replay of a finished game");
});

test("the journal agrees points with the score",()=>{
 const S=newS(),s=doIt(S,{type:"snowStart"},10);
 doIt(S,{type:"miniEnd",id:s.game.id,taps:[]},10,{ms:45000});
 assert.match(S.journal[0].text,/: 0 point, bonus \+0 XP\./);
});

test("the id, the duration and the expiry still count",()=>{
 const A=newS();doIt(A,{type:"snowStart"},10);
 const wrongId=doIt(A,{type:"miniEnd",id:"nope",taps:[]},10,{ms:45000});
 assert.equal(wrongId.ok,false);assert.ok(wrongId.audit.flags.includes("id_inconnu"));
 const S=newS(),s=doIt(S,{type:"snowStart"},10);
 const quick=doIt(S,{type:"miniEnd",id:s.game.id,taps:[]},10,{ms:1000});
 assert.equal(quick.ok,false);assert.equal(S.mini,null);
 const U=newS(),u=doIt(U,{type:"snowStart"},10);
 const late=doIt(U,{type:"miniEnd",id:u.game.id,taps:[]},10,{ms:(45+R.MINI_RULES.graceSeconds)*1000+1000});
 assert.equal(late.ok,false);
});

test("bad taps are refused and the game is consumed",()=>{
 for(const taps of ["x",null,undefined,{length:2},[{t:NaN,x:1,y:1}],[{t:-1,x:1,y:1}],[{t:50000,x:1,y:1}],[{t:1,x:500,y:1}],[null],
  Array.from({length:401},(_,i)=>({t:i*10,x:100,y:100}))]){
  const S=newS(),s=doIt(S,{type:"snowStart"},10),xp0=S.xp;
  const r=doIt(S,{type:"miniEnd",id:s.game.id,taps,score:50},10,{ms:45000});
  assert.equal(r.ok,false);
  assert.equal(S.mini,null);assert.equal(S.xp,xp0);
 }
});

test("a game started during the Trêve still ends after it was switched off",()=>{
 const S=newS(),s=doIt(S,{type:"snowStart"},10);
 const r=doIt(S,{type:"miniEnd",id:s.game.id,taps:tapsFor(s.game.seed,3)},10,{ms:45000,event:""});
 assert.equal(r.ok,true);assert.equal(r.audit.noel,true);
});

test("the challenge id travels to the audit",()=>{
 const S=newS(),s=doIt(S,{type:"snowStart",challenge:{id:"duel42",seed:9}},10);
 const r=doIt(S,{type:"miniEnd",id:s.game.id,taps:[]},10,{ms:45000});
 assert.equal(r.audit.ch,"duel42");assert.equal(r.audit.seed,9);
});

test("bot signals: fast taps, too precise, too quick to react",()=>{
 const run=(seed,taps)=>{const S=newS(),s=doIt(S,{type:"snowStart",challenge:{id:"c",seed}},10),xp0=S.xp;
  const r=doIt(S,{type:"miniEnd",id:s.game.id,taps},10,{ms:45000});return {r,S,xp0};};
 const burst=Array.from({length:25},(_,i)=>({t:2000+i*50,x:233,y:200}));
 const a=run(5,burst);assert.equal(a.r.ok,true);assert.ok(a.r.audit.flags.includes("taps_rapides"));
 const twenty=Array.from({length:20},(_,i)=>({t:2000+i*10,x:233,y:200}));
 assert.ok(!run(5,twenty).r.audit.flags.includes("taps_rapides"),"20 taps are not over 20");
 assert.deepEqual(run(5,tapsFor(5,4)).r.audit.flags,[]);
 // balls that land the moment the foes show: a reflex too quick for anyone
 const sched=schedule(5,"left"),fast=[];let last=-1e9;
 for(const p of sched.pops){if(fast.length>=6)break;if(p.passant!==null)continue;const t=Math.round(p.t-120);if(t-last<600)continue;fast.push({t,...centre(p.spot)});last=t;}
 const f=run(5,fast);assert.ok(f.r.result.hits>=4,"the fast taps do hit");assert.ok(f.r.audit.flags.includes("reflexe"));
 assert.equal(f.r.ok,true,"a flagged game is still paid");assert.equal(f.r.bonus,R.snowBonus(f.r.result.score));assert.equal(f.S.mini,null);
 assert.ok(!run(5,tapsFor(5,6,350)).r.audit.flags.includes("reflexe"));
 const taps=n=>Array.from({length:n},(_,i)=>({t:i*500,x:1,y:1}));
 assert.deepEqual(R.snowFlags(taps(50),{hits:49,thrown:50},[]),["precision"]);
 assert.deepEqual(R.snowFlags(taps(40),{hits:40,thrown:40},[]),[],"40 throws are not over 40");
 assert.deepEqual(R.snowFlags(taps(50),{hits:47,thrown:50},[]),[],"94 % is fine");
 assert.deepEqual(R.snowFlags([],{hits:0,thrown:0},[]),[]);
});

test("a stored snowball game survives sanitize; a forged one carries nothing else",()=>{
 const S=newS();doIt(S,{type:"snowStart",challenge:{id:"c1",seed:12}},10);
 const json=()=>JSON.parse(JSON.stringify(S));
 assert.deepEqual(R.sanitize(json(),at(10)).mini,S.mini);
 assert.equal(S.mini.noel,true);
 const forged=R.sanitize({...json(),mini:{...S.mini,evil:1,noel:"yes",ch:{a:1},x:99,score:5}},at(10));
 assert.deepEqual(Object.keys(forged.mini).sort(),["id","k","seed","t"]);
 assert.equal(R.sanitize({...json(),mini:{k:"snowball",t:S.mini.t,ch:"a b",noel:true}},at(10)).mini.ch,undefined);
 // a manif game never takes the snowball's keys
 const m=R.sanitize({...json(),mini:{k:"cortege",t:S.mini.t,noel:true,ch:"zz"}},at(10)).mini;
 assert.deepEqual(m,{k:"cortege",t:S.mini.t});
});

test("play: hit and pass events say which foe and which tap",()=>{
 const sched={pops:[pop({t:1000,spot:0,stay:2000})],...noSleigh};
 const r=play(sched,[tapAt(1200,centre(0))]);
 assert.equal(r.events[0].kind,"hit");assert.equal(r.events[0].i,0);assert.equal(r.events[0].from,1200);
 const p=play({pops:[pop({passant:0})],...noSleigh},[tapAt(1200,centre(0))]);
 assert.equal(p.events[0].kind,"pass");assert.equal(p.events[0].i,0);assert.equal(p.events[0].from,1200);
});
