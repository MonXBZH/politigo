// Missions, voter mail, daily goals and the Flamme (web/activities.mjs), through the rules' act/advance (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";
import * as A from "../web/activities.mjs";

const {H}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris on 2026-01-05 (winter, UTC+1)
const at=h=>MIDNIGHT+h*H;
const never=()=>0.99;                             // never rolls a stress, a risky mission always fails
const always=()=>0;                               // a risky mission always succeeds
const full=S=>{S.sat=S.moral=S.energy=S.hyg=100;return S;};
function game(camp="left",h=10){const S=R.newGame(camp,at(h));R.advance(S,at(h),1,never);return full(S);}
const play=(S,a,h,random=never)=>R.act(S,a,{now:at(h),random});
const setGoals=(S,ids)=>{S.goals.list=ids.map(id=>({id,n:0,done:false}));};

test("the catalogues: 7 missions with both camps' names, at least 8 letters a camp, at least 6 goals",()=>{
 assert.deepEqual(A.MISSIONS.map(m=>m.id),["tract","ag","piquet","fete","repos","risque","nuit"]);
 for(const m of A.MISSIONS){assert.ok(m.left&&m.right&&m.ms>0);for(const k of Object.keys(m.fx))assert.ok(k in R.fxNames);}
 assert.equal(A.missionOf("nuit").ms,8*H);assert.equal(A.missionOf("tract").ms,H/2);
 const ids=new Set();
 for(const camp of R.CAMPS){
  assert.ok(A.LETTERS[camp].length>=8);
  for(const l of A.LETTERS[camp]){assert.ok(!ids.has(l.id));ids.add(l.id);assert.ok(l.answers.length>=2&&l.answers.length<=3);
   for(const a of l.answers){assert.ok(a.text&&a.reply);for(const [k,v] of Object.entries(a.fx)){assert.ok(k in R.fxNames);assert.ok(Math.abs(v)<=10);}}}
 }
 assert.ok(A.GOALS.length>=6);for(const g of A.GOALS)assert.ok(g.left&&g.right&&g.desc&&Object.keys(g.need).length);
});

test("a fresh game carries the new fields; its 3 goals are drawn at the first advance, from random",()=>{
 const S=R.newGame("right",at(10));
 assert.deepEqual(S.missions,{cur:null,day:20260105,n:0});
 assert.equal(S.mail.letter,null);assert.equal(S.mail.next,at(10)+30*60000);
 assert.equal(S.goals.day,-1);assert.equal(S.flame.pts,0);assert.equal(S.flame.day,20260105);
 const T=structuredClone(S);
 R.advance(S,at(10),1,R.seeded(7));R.advance(T,at(10),1,R.seeded(7));
 assert.equal(S.goals.day,20260105);assert.equal(S.goals.list.length,3);
 assert.equal(new Set(S.goals.list.map(g=>g.id)).size,3);assert.deepEqual(S.goals,T.goals,"same seed, same goals");
 assert.ok(A.goalView(S).every(g=>g.name===A.goalOf(g.id).right&&g.have===0&&g.need>0&&!g.done));
});

test("missions: one at a time, 4 a day, not asleep nor tired, the night one from 20:00 only",()=>{
 const S=game("left",10);
 assert.match(play(S,{type:"missionStart",id:"zz"},10).error,/inconnue/);
 assert.match(A.missionBlock(S,"nuit"),/20 h/);
 const r=play(S,{type:"missionStart",id:"tract"},10);assert.ok(r.ok);assert.equal(S.missions.cur.end,at(10.5));
 assert.match(play(S,{type:"missionStart",id:"ag"},10.1).error,/une mission à la fois/i);
 assert.ok(play(S,{type:"buy",key:"soup"},10.1).ok,"a mission never blocks the rest");
 assert.match(play(S,{type:"missionStart",id:"ag"},10.6).error,/rapport/);
 for(const h of [10.6,11.2,12]){assert.ok(play(S,{type:"missionReport"},h).ok);full(S);assert.ok(play(S,{type:"missionStart",id:"tract"},h).ok);}
 assert.ok(play(S,{type:"missionReport"},12.6).ok);
 assert.equal(A.missionsToday(S),4);assert.match(play(S,{type:"missionStart",id:"tract"},12.7).error,/Quatre/);
 const T=game("left",14);T.energy=10;assert.match(A.missionBlock(T,"tract"),/fatigué/);
 T.energy=60;play(T,{type:"light"},14);assert.match(A.missionBlock(T,"tract"),/sieste/);
 const N=game("left",2);assert.match(A.missionBlock(N,"tract"),/dort/);
 const E=game("left",20);E.energy=5;play(E,{type:"light"},20);
 assert.equal(A.missionBlock(E,"nuit"),"","the night out, even with the light off and tired");
 assert.ok(play(E,{type:"missionStart",id:"nuit"},20).ok);
 const L=game("left",19.9);assert.match(A.missionBlock(L,"nuit"),/20 h/);
 assert.equal(A.missionBlock(game("left",23.9),"nuit"),"");
});

test("missions: the 4 a day restart on the next calendar day",()=>{
 const S=game("left",18);S.missions.n=4;S.missions.day=20260105;
 assert.match(A.missionBlock(S,"tract"),/Quatre/);
 R.advance(S,at(24+8),1,never);full(S);
 assert.equal(A.missionsToday(S),0);assert.equal(A.missionBlock(S,"tract"),"");
});

test("a mission report: only once over, gauges and a bulletin, no XP nor FM",()=>{
 const S=game("left",10);S.moral=50;S.energy=50;
 play(S,{type:"missionStart",id:"ag"},10);
 assert.match(play(S,{type:"missionReport"},10.9).error,/pas finie/);
 assert.equal(A.missionLeft(S),0.1*H);assert.ok(!A.missionReady(S));
 R.advance(S,at(11),1,never);assert.ok(A.missionReady(S));
 const before={xp:S.xp,fm:S.fm,moral:S.moral,sat:S.sat,energy:S.energy,b:S.wardrobe.bulletins};
 const r=play(S,{type:"missionReport"},11);
 assert.deepEqual(r,{ok:true,report:{id:"ag",fx:{moral:10,sat:10,energy:-10},ok:true}});
 assert.equal(S.xp,before.xp);assert.equal(S.fm,before.fm);
 assert.equal(S.moral,before.moral+10);assert.equal(S.sat,before.sat+10);assert.equal(S.energy,before.energy-10);
 assert.equal(S.wardrobe.bulletins,before.b+1);assert.equal(S.flame.log.missions,1);assert.equal(S.missions.cur,null);
 assert.equal(S.journal[0].k,"mission");assert.match(S.journal[0].text,/Bourse du travail/);
 assert.match(play(S,{type:"missionReport"},11).error,/Aucune/);
 // Gauges stay clamped.
 const T=game("right",10);T.moral=95;play(T,{type:"missionStart",id:"tract"},10);R.advance(T,at(10.5),1,never);T.moral=95;
 play(T,{type:"missionReport"},10.5);assert.equal(T.moral,100);assert.match(T.journal[0].text,/marché/);
});

test("the risky mission is drawn at report time: heads a win, tails a flop",()=>{
 const W=game("left",10);play(W,{type:"missionStart",id:"risque"},10);R.advance(W,at(12),1,never);W.moral=W.hyg=50;
 const w=play(W,{type:"missionReport"},12,always);assert.ok(w.report.ok);assert.equal(W.moral,75);assert.equal(W.hyg,50);
 const F=game("right",10);play(F,{type:"missionStart",id:"risque"},10);R.advance(F,at(12),1,never);F.moral=F.hyg=50;
 const f=play(F,{type:"missionReport"},12,never);assert.equal(f.report.ok,false);assert.deepEqual(f.report.fx,{moral:-15,hyg:-10});
 assert.equal(F.moral,35);assert.equal(F.hyg,40);assert.match(F.journal[0].text,/mal tourné/);
});

test("voter mail: a letter comes after the gap, never between 00:00 and 07:00",()=>{
 const S=game("left",10);
 assert.equal(S.mail.letter,null);
 R.advance(S,at(10.4),1,never);assert.equal(S.mail.letter,null);
 R.advance(S,at(10.5),1,never);assert.ok(A.mailWaiting(S));
 assert.ok(A.LETTERS.left.some(l=>l.id===S.mail.letter.id));assert.equal(S.mail.letter.t,at(10.5));
 const id=S.mail.letter.id;R.advance(S,at(11),1,never);assert.equal(S.mail.letter.id,id,"one letter at a time");
 const N=game("right",23);N.mail.next=at(23.5);
 R.advance(N,at(24+1),1,never);assert.equal(N.mail.letter,null,"quiet at night");
 R.advance(N,at(24+6.9),1,never);assert.equal(N.mail.letter,null);
 R.advance(N,at(24+7),1,never);assert.ok(N.mail.letter);assert.ok(A.LETTERS.right.some(l=>l.id===N.mail.letter.id));
});

test("answering a letter: its effect, the next one 30 to 60 min later, a bulletin every 3rd letter of the day",()=>{
 const S=game("left",10);S.mail.next=at(10);R.advance(S,at(10),1,never);
 assert.match(play(S,{type:"mailAnswer",id:"nope",choice:0},10).error,/Pas de lettre/);
 const id=S.mail.letter.id,x=A.letterOf(id);
 assert.match(play(S,{type:"mailAnswer",id,choice:9},10).error,/inconnue/);
 assert.match(play(S,{type:"mailAnswer",id,choice:"0"},10).error,/inconnue/);
 S.moral=S.sat=S.energy=S.hyg=50;
 const xp=S.xp,fm=S.fm,r=play(S,{type:"mailAnswer",id,choice:1},10,()=>0.5);
 assert.ok(r.ok);assert.deepEqual(r.fx,x.answers[1].fx);assert.equal(r.bulletin,false);
 for(const [k,v] of Object.entries(x.answers[1].fx))assert.equal(S[k],50+v);
 assert.equal(S.xp,xp);assert.equal(S.fm,fm);
 assert.equal(S.mail.letter,null);assert.equal(S.mail.next,at(10)+45*60000);
 assert.equal(A.lettersToday(S),1);assert.equal(S.flame.log.letters,1);assert.equal(S.journal[0].k,"mail");assert.match(S.journal[0].text,new RegExp(x.from));
 let h=10;
 for(const n of [2,3]){h+=1.1;R.advance(S,at(h),1,never);const l=S.mail.letter;assert.ok(l,`letter ${n}`);
  const b=S.wardrobe.bulletins,r2=play(S,{type:"mailAnswer",id:l.id,choice:0},h,never);
  assert.equal(r2.bulletin,n===3);assert.equal(S.wardrobe.bulletins,b+(n===3?1:0));}
 assert.ok(S.mail.next-at(h)>=30*60000&&S.mail.next-at(h)<60*60000);
});

test("daily goals: reached by visits, purchases, pets, games, missions and letters; each pays once",()=>{
 const S=game("left",8);setGoals(S,["visits3","care2","pets3"]);
 S.moral=50;
 for(const h of [8,10,12]){full(S);S.moral=50;assert.ok(play(S,{type:"buy",key:"soup"},h).ok);}
 const v=S.goals.list[0];assert.ok(v.done);assert.equal(S.flame.log.hours.length,3);
 assert.ok(S.goals.list[1].done,"3 purchases");
 assert.ok(S.journal.some(j=>j.k==="goal"&&/Militant modèle/.test(j.text)));
 assert.equal(S.wardrobe.bulletins,2);assert.equal(S.flame.log.goals,2);
 for(const h of [13,13.5])play(S,{type:"pet"},h);
 assert.deepEqual(A.goalView(S)[2],{id:"pets3",name:"Câlin solidaire",desc:A.goalOf("pets3").desc,fx:{moral:10},have:1,need:3,done:false},"once an hour");
 play(S,{type:"pet"},14);play(S,{type:"pet"},15);assert.ok(S.goals.list[2].done);
 const b=S.wardrobe.bulletins;play(S,{type:"pet"},16);assert.equal(S.wardrobe.bulletins,b,"a goal pays once");
 // Combo: one mission and one letter.
 const C=game("right",10);setGoals(C,["combo","mission2","minis2"]);C.mail.next=at(10);R.advance(C,at(10),1,never);
 play(C,{type:"mailAnswer",id:C.mail.letter.id,choice:0},10);
 assert.equal(A.goalView(C)[0].have,1);assert.equal(A.goalView(C)[0].need,2);
 play(C,{type:"missionStart",id:"tract"},10);R.advance(C,at(10.5),1,never);play(C,{type:"missionReport"},10.5);
 assert.ok(C.goals.list[0].done);assert.equal(A.goalView(C)[1].have,1);
 // A finished Pong counts as a game.
 full(C);const g=play(C,{type:"pongStart"},11).game;assert.ok(play(C,{type:"pongEnd",id:g.id,score:5},11+10/3600).ok);
 assert.equal(A.goalView(C)[2].have,1);
});

test("a goal reached pays its gauges and a bulletin, never XP nor FM",()=>{
 const S=game("left",10);setGoals(S,["letters3","visits3","care2"]);
 S.mail.next=at(10);R.advance(S,at(10),1,never);S.flame.log.letters=0;
 let h=10;
 for(let n=0;n<3;n++){if(n){h+=1.1;R.advance(S,at(h),1,never);}S.moral=S.hyg=50;const xp=S.xp,fm=S.fm;play(S,{type:"mailAnswer",id:S.mail.letter.id,choice:0},h);
  if(n===2){assert.equal(S.xp,xp);assert.equal(S.fm,fm);}}
 assert.ok(S.goals.list[0].done);assert.equal(S.flame.log.goals,1);
 assert.equal(S.wardrobe.bulletins,2,"the 3rd letter and the goal");
});

test("the Flamme: a day's score, at most 10",()=>{
 const best={hours:[8,10,14,18],min:60,missions:2,letters:3,goals:3};
 assert.equal(A.dayScore(best,3),10);
 assert.equal(A.dayScore({...best,min:49},3),7);
 assert.equal(A.dayScore({...best,hours:[8,10,12,15]},3),8,"4 visits spanning under 8 h");
 assert.equal(A.dayScore({...best,hours:[8,18,20]},3),8,"3 visits only");
 assert.equal(A.dayScore({...best,missions:1,letters:2},2),5);
 assert.equal(A.dayScore({...best,hours:[]},3),0);
});

test("the Flamme scores at the day change, burns 10 % on a day without visit, 25 % on a death",()=>{
 const S=game("left",8);
 for(const h of [8,10,14,18]){full(S);play(S,{type:"buy",key:"soup"},h);full(S);}
 S.flame.log.missions=2;S.flame.log.letters=3;S.flame.log.goals=3;
 R.advance(S,at(23.5),1,never);assert.equal(S.flame.pts,0,"scored only once the day is over");
 R.advance(S,at(24.2),1,never);
 // The night drains the gauges under 50 by 18:00 → no gauge bonus: 3 + 2 + 1 + 1 = 7 (min tracked hourly).
 assert.equal(S.flame.pts,A.dayScore({hours:[8,10,14,18],min:0,missions:2,letters:3,goals:3},3));
 assert.equal(S.flame.day,20260106);assert.deepEqual(S.flame.log.hours,[]);assert.equal(S.goals.day,20260106);
 assert.ok(S.journal.some(j=>j.k==="flame"));
 // A perfect day: gauges kept full at every tick.
 const P=game("left",0.5);P.flame.pts=100;
 for(let h=1;h<=24.2;h+=0.5){full(P);if([8,10,14,18].includes(h))play(P,{type:"buy",key:"soup"},h);else R.advance(P,at(h),1,never);full(P);if(h===23)Object.assign(P.flame.log,{missions:2,letters:3,goals:3});}
 assert.equal(P.flame.pts,110);
 // Idle days: ×0.9 each.
 for(let h=25;h<=24*3+1;h++){full(P);R.advance(P,at(h),1,never);}
 assert.equal(P.flame.pts,Math.round(110*0.9*0.9*100)/100);
 assert.equal(A.flameOf(P),Math.floor(P.flame.pts));
 // A death keeps the cosmetics, burns a quarter of the Flamme, restarts missions, mail and goals.
 const D=game("left",10);D.flame.pts=200;D.wardrobe.own.push("cocarde");D.wardrobe.worn.object="cocarde";D.wardrobe.bulletins=4;
 play(D,{type:"missionStart",id:"repos"},10);D.mail.letter={id:"l_velo",t:at(10)};
 assert.ok(play(D,{type:"restart",camp:"right"},10.2).ok);
 assert.equal(D.flame.pts,150);assert.deepEqual(D.wardrobe.own,["cocarde"]);assert.equal(D.wardrobe.worn.object,"cocarde");assert.equal(D.wardrobe.bulletins,4);
 assert.equal(D.missions.cur,null);assert.equal(D.mail.letter,null);assert.equal(D.goals.list.length,3);assert.equal(D.goals.day,20260105);
});

test("the lowest gauge of the day is tracked at every tick and action",()=>{
 const S=game("left",10);assert.equal(S.flame.log.min,80,"a fresh day starts from the gauges");
 S.energy=40;play(S,{type:"pet"},10.1);assert.equal(S.flame.log.min,40);
 full(S);R.advance(S,at(11),1,never);assert.equal(S.flame.log.min,40,"kept for the day");
});

test("equip takes the hand back from a wardrobe object",()=>{
 const S=game("left",10);S.wardrobe.own.push("megaphone");
 assert.ok(play(S,{type:"wear",kind:"object",id:"megaphone"},10).ok);assert.equal(S.wardrobe.worn.object,"megaphone");
 assert.ok(play(S,{type:"equip",i:1},10).ok);assert.equal(S.wardrobe.worn.object,null);
});

test("sanitize: old states get fresh fields, malformed ones are rebuilt",()=>{
 const S=game("left",10);
 const old=structuredClone(S);for(const k of ["missions","mail","goals","flame","wardrobe"])delete old[k];
 const o=R.sanitize(old,at(10));
 assert.deepEqual(o.missions,{cur:null,day:20260105,n:0});assert.equal(o.goals.day,-1);assert.equal(o.flame.pts,0);assert.deepEqual(o.wardrobe.own,[]);
 const bad=structuredClone(S);
 bad.missions={cur:{id:"tract",start:at(10),end:at(10)+99*H,notified:"yes"},day:"x",n:99};
 bad.mail={next:at(10)+99*H,letter:{id:"r_dette",t:at(10)},day:20260105,n:-4};       // a right letter for a left player
 bad.goals={day:20260105,list:[{id:"visits3",n:99,done:true},{id:"visits3",n:1},{id:"zz",n:1}]};
 bad.flame={pts:-5,day:20260105,log:{hours:[8,"9",30,10.5,12],min:900,missions:"2",letters:3,goals:1e9}};
 const b=R.sanitize(bad,at(10));
 assert.deepEqual(b.missions.cur,{id:"tract",start:at(10),end:at(10.5),notified:false},"the end comes from the catalogue");
 assert.equal(b.missions.day,-1);assert.equal(b.missions.n,4);
 assert.equal(b.mail.next,at(11));assert.equal(b.mail.letter,null);assert.equal(b.mail.n,0);
 assert.deepEqual(b.goals,{day:-1,list:[]},"an incomplete list is drawn again");
 assert.equal(b.flame.pts,0);assert.deepEqual(b.flame.log.hours,[8,12]);assert.equal(b.flame.log.min,100);assert.equal(b.flame.log.missions,0);assert.equal(b.flame.log.goals,99);
 const g=structuredClone(S);g.goals={day:20260105,list:[{id:"visits3",n:99,done:true},{id:"combo",n:7,done:true},{id:"care2",n:1,done:true}]};
 const c=R.sanitize(g,at(10)).goals.list;
 assert.deepEqual(c,[{id:"visits3",n:3,done:true},{id:"combo",n:3,done:true},{id:"care2",n:1,done:false}]);
 const future=structuredClone(S);future.missions.cur={id:"ag",start:at(10)+H,end:0};assert.equal(R.sanitize(future,at(10)).missions.cur,null);
 assert.equal(R.sanitize({...structuredClone(S),missions:{cur:{id:"__proto__",start:0}}},at(10)).missions.cur,null);
});

test("a resignation keeps the day's goals and counters: no fresh goals, no extra missions, so no extra bulletins",()=>{
 const S=game("left",10);
 assert.equal(play(S,{type:"missionStart",id:"tract"},10).ok,true);
 const goals=JSON.stringify(S.goals),n=S.missions.n,before=S.goals.list.map(g=>g.id);
 assert.equal(play(S,{type:"restart",camp:"right"},11).ok,true);
 assert.equal(S.camp,"right");assert.equal(S.missions.cur,null,"the mission in progress is lost");
 assert.deepEqual(S.goals.list.map(g=>g.id),before);assert.equal(JSON.stringify(S.goals),goals);
 assert.equal(S.missions.n,n,"missions started today still count");
});
