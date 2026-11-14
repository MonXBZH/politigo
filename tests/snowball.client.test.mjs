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
