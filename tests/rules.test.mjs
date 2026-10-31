// Game rules, tested directly against the shared module (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {H,XP,shop,stresses}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris (winter, UTC+1)
const at=(h)=>MIDNIGHT+h*H;                      // real time h hours after that midnight
const item=k=>shop.find(i=>i.key===k);
const noRandom=()=>0.99;                          // never rolls a stress
function game(camp="left",h=10){const S=R.newGame(camp,at(h));return S;}
const play=(S,a,h,random=noRandom)=>R.act(S,a,{now:at(h),random});

test("a new game starts at level 1 with 10 FM and a journal entry",()=>{
 const S=game();
 assert.equal(S.lvl,1);assert.equal(S.fm,10);assert.equal(S.journal[0].k,"new");
});

test("buying costs FM, feeds, and the first purchase of a visit pays visit XP once",()=>{
 const S=game();
 const r=play(S,{type:"buy",key:"soup"},10);
 assert.ok(r.ok);assert.equal(S.fm,9);assert.equal(S.sat,95);assert.equal(S.xp,XP.visit);
 play(S,{type:"buy",key:"soup"},10.5);assert.equal(S.xp,XP.visit,"same visit, no second visit XP");
 assert.equal(play(S,{type:"buy",key:"nope"},10.5).ok,false);
});

test("activities: two per visit, renewed after 2 h, refused when tired",()=>{
 const S=game();
 assert.ok(play(S,{type:"debate"},10).ok);assert.ok(play(S,{type:"debate"},10.2).ok);
 assert.match(play(S,{type:"debate"},10.4).error,/Deux activités/);
 assert.ok(play(S,{type:"debate"},12.1).ok,"allowance renews after 2 h");
 S.energy=10;assert.match(R.activityBlock(S),/fatigué/);
});

test("night and naps: nothing can be bought or played, free bread included",()=>{
 const S=game("left",2);
 assert.ok(shop.every(it=>/6 h/.test(R.itemBlock(S,it))));
 assert.equal(play(S,{type:"buy",key:"bread"},2).ok,false);
 const D=game("left",14);D.energy=40;
 assert.ok(play(D,{type:"light"},14).ok);assert.ok(D.sleeping);
 assert.ok(shop.every(it=>/sieste/.test(R.itemBlock(D,it))));
 assert.match(R.activityBlock(D),/sieste/);
 const xp0=D.xp;R.advance(D,at(15),1,noRandom);
 assert.equal(D.energy,55,"a nap recharges 15 energy per hour");
 assert.ok(D.xp-xp0>0&&D.xp-xp0<=XP.base*1.25*0.5*1.26,"a nap halves passive XP");
 assert.ok(play(D,{type:"light"},15).ok);assert.ok(!D.sleeping);assert.ok(D.moral<80,"woken while tired: grumpy");
 D.energy=90;play(D,{type:"light"},15.1);R.advance(D,at(16.2),1,noRandom);
 assert.ok(!D.sleeping,"he wakes up by himself once rested");assert.equal(D.journal.find(j=>j.k==="wake")?.k,"wake");
});

test("neglect kills after 12 h at zero and restarts at level 1, keeping the record",()=>{
 const S=game();S.lvl=S.best=20;S.xp=R.xpFloor(20);S.sat=S.moral=S.energy=S.hyg=0;
 R.advance(S,at(10+13),1,noRandom);
 assert.equal(S.deaths,1);assert.equal(S.lvl,1);assert.equal(S.fm,10);assert.equal(S.best,20);
 assert.equal(S.journal[0].k,"death");assert.equal(S.journal[0].d.reason,"neglect");
});

test("resigning counts as a death and can switch camp",()=>{
 const S=game();
 assert.ok(play(S,{type:"restart",camp:"right"},10).ok);
 assert.equal(S.deaths,1);assert.equal(S.camp,"right");assert.equal(R.person(S).name,"Valérie Pécresse");
 assert.equal(play(S,{type:"restart",camp:"centre"},10).ok,false);
 assert.match(play(S,{type:"restart",camp:"left"},10.5).error,/Une démission par heure/,"the feed cannot be flooded with deaths");
 assert.ok(play(S,{type:"restart",camp:"left"},11.1).ok);
});

test("hostile saved shapes never produce a NaN, a crash or a year-long replay",()=>{
 const now=at(10);
 for(const bad of [null,[],"x",{v:1},{v:2,camp:"__proto__"},{v:2,camp:"left",journal:"x",equipped:[],pong:{t:"a"},xp:"9",lvl:{},hourIdx:0}]){
  const s=R.sanitize(bad,now);
  if(s){assert.ok(Number.isFinite(s.xp)&&s.lvl>=1&&Array.isArray(s.journal));assert.ok(Number.isFinite(R.score(s)));
   assert.ok(Math.floor(s.vclock/H)-s.hourIdx<=24*366,"at most a year of hours to replay");}
 }
 const S=game();R.advance(S,NaN,1,noRandom);assert.ok(Number.isFinite(S.vclock),"a bad clock reading is ignored");
 assert.throws(()=>R.setTimeZone("Mars/Olympus"));R.setTimeZone("Europe/Paris");
});

test("the Pong result is checked by the server",()=>{
 const S=game();
 assert.equal(play(S,{type:"pongEnd",score:5},10).ok,false,"no game started");
 assert.ok(play(S,{type:"pongStart"},10).ok);
 assert.equal(R.act(S,{type:"pongEnd",score:30},{now:at(10)+5000}).ok,false,"30 returns in 5 s is impossible");
 play(S,{type:"pongStart"},10.01);
 assert.equal(R.act(S,{type:"pongEnd",score:2.5},{now:at(10.01)+20000}).ok,false,"non-integer score");
 const p=play(S,{type:"pongStart"},12.1);
 const xp0=S.xp,r=R.act(S,{type:"pongEnd",score:12,id:p.game.id},{now:at(12.1)+21000});
 assert.ok(r.ok);assert.equal(r.bonus,10,"bonus capped at 10");assert.equal(S.xp-xp0,10);
 play(S,{type:"pongStart"},14.2);R.advance(S,at(14.2)+120000,1,noRandom);
 assert.equal(S.pong,null,"an abandoned Pong expires");
});

test("level-ups, evolutions and the coronation are journaled for the browser and the feed",()=>{
 const S=game();
 S.lvl=5;S.xp=R.xpFloor(6)-1;play(S,{type:"debate"},10);
 const lv=S.journal.find(j=>j.k==="level");
 assert.ok(lv&&lv.d.lvl===S.lvl&&S.lvl>=6,"one entry per gain, naming the level reached");
 S.lvl=9;S.xp=R.xpFloor(10)-1;play(S,{type:"debate"},10.1);
 const ev=S.journal.find(j=>j.k==="evolve");
 assert.deepEqual([ev.d.from,ev.d.to,ev.d.lvl],["Olivier Faure","Raphaël Glucksmann",S.lvl]);assert.ok(S.lvl>=10);
 S.lvl=99;S.xp=R.xpFloor(100)-1;play(S,{type:"debate"},12.2);
 assert.equal(S.journal.find(j=>j.k==="legend")?.d.name,"Jean-Luc Mélenchon");
});

test("stresses come from the companion's own record",()=>{
 const S=game();let roll=0;const rnd=()=>[0.01,0][roll++%2];
 R.advance(S,at(11),1,rnd);
 const e=S.journal.find(j=>j.k==="stress");
 assert.ok(e);assert.equal(e.d.name,"Olivier Faure");assert.ok(stresses[e.d.name][e.d.i]);
});

test("the stress risk grows as the moral sinks",()=>{
 const S=game();
 S.moral=100;assert.equal(R.stressChance(S),XP.stressMin);
 S.moral=0;assert.equal(R.stressChance(S),XP.stressMax);
 S.moral=50;assert.ok(R.stressChance(S)>XP.stressMin&&R.stressChance(S)<XP.stressMax);
});

test("quitte ou double: only right after a debate, once, heads restores, tails stresses twice as hard",()=>{
 const S=game();
 assert.match(play(S,{type:"rematch"},10).error,/juste après un débat/);
 play(S,{type:"debate"},10);
 const m0=S.moral,e0=S.energy,acts=S.actsToday;
 assert.ok(play(S,{type:"rematch"},10.1,()=>0.1).ok);
 assert.equal(S.moral,Math.min(100,m0+R.DOUBLE.moral));assert.equal(S.energy,Math.min(100,e0+R.DOUBLE.energy));
 assert.equal(S.actsToday,acts,"the rematch does not use up an activity");
 assert.match(play(S,{type:"rematch"},10.2).error,/juste après/,"once per debate");
 const T=game();play(T,{type:"debate"},10);T.moral=60;
 assert.ok(play(T,{type:"rematch"},10.1,()=>0.7).ok);
 const e=T.journal.find(j=>j.k==="stress");
 assert.equal(e.d.factor,2);assert.ok(T.moral<=50,"a doubled stress costs 10 moral");
 const U=game();play(U,{type:"debate"},10);
 assert.match(play(U,{type:"rematch"},11.1).error,/juste après/,"the offer lapses after an hour");
});

test("a stored state is sanitized: nothing malformed or impossible survives",()=>{
 const now=at(10);
 assert.equal(R.sanitize({v:2,camp:"centre"},now),null);
 assert.equal(R.sanitize("garbage",now),null);
 assert.equal(R.sanitize({v:1,camp:"left"},now),null,"old local saves are not accepted");
 const t=R.sanitize({v:2,camp:"right",lvl:999,fm:-5,sat:"x",sleeping:"yes",equipped:{"Marine Le Pen":7,"Éric Ciotti":1},
  journal:[{n:1,t:1,k:"buy",text:"a"},{t:"x"},null]},now);
 assert.equal(t.lvl,100);assert.equal(t.fm,0);assert.equal(t.sat,80);assert.equal(t.sleeping,false);
 assert.ok(!("Marine Le Pen" in t.equipped));assert.equal(t.equipped["Éric Ciotti"],1);
 assert.equal(t.journal.length,1);
});

test("combined score rewards progress and regularity, punishes deaths",()=>{
 const S=game();S.xp=1000;S.bestStreak=50;S.deaths=0;assert.equal(R.score(S),1100);
 S.deaths=2;assert.equal(R.score(S),800);S.xp=0;S.bestStreak=0;assert.equal(R.score(S),0,"never negative");
});

// The balance the whole design rests on, replayed through the real action path.
function simulate(visitHours,activities){
 const S=R.newGame("left",MIDNIGHT);let day100=null;
 for(let h=1;h<=24*60&&!day100;h++){
  R.advance(S,at(h),1,Math.random);
  const hod=R.hodOf(R.curIdx(S));
  if(!visitHours.includes(hod))continue;
  for(let k=0;k<activities;k++)play(S,{type:"debate"},h);
  const t=hod===visitHours.at(-1)?95:75,buy=k=>play(S,{type:"buy",key:k},h).ok;
  while(S.sat<t&&S.fm>=1&&buy(S.fm>=3?"meal":"soup"));
  while(S.hyg<t&&buy("soap"));
  while(S.moral<t&&S.fm>=2&&buy(S.fm>=4?"garden":"snack"));
  while(S.energy<t&&(buy("coffee")||buy("rest")));
  if(S.fm>=30)buy("banquet");
  if(S.lvl>=100)day100=h/24;
 }
 return {day100,deaths:S.deaths};
}
test("balance: 6 visits and 6 activities a day reach level 100 around day 15, without dying",()=>{
 const r=simulate([6,9,12,15,18,21],1);
 assert.ok(r.day100>13&&r.day100<17,`got day ${r.day100}`);assert.equal(r.deaths,0);
});
test("balance: 3 visits a day survive but progress much more slowly",()=>{
 const r=simulate([8,14,21],0);
 assert.equal(r.deaths,0);assert.ok(!r.day100||r.day100>30,`got day ${r.day100}`);
});
