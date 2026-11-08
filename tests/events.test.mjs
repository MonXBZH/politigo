// Timed events (web/events.mjs): the settings allowed, what runs when, and each effect through the rules (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";
import * as A from "../web/activities.mjs";
import * as W from "../web/wardrobe.mjs";
import * as E from "../web/events.mjs";

const {H}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0),at=h=>MIDNIGHT+h*H,never=()=>0.99;
const full=S=>{S.sat=S.moral=S.energy=S.hyg=100;return S;};
function game(camp="left",h=10){const S=R.newGame(camp,at(h));R.advance(S,at(h),1,never);return full(S);}
const ev=(type,params,o={})=>({id:1,type,params,starts:0,ends:Infinity,who:"all",...o});
const boostOf=(...list)=>()=>E.effectsOf(list,"left",at(10));
const play=(S,a,h,boost,random=never)=>R.act(S,a,{now:at(h),random,boost});

test("the settings: only the values on offer pass",()=>{
 assert.deepEqual(E.cleanParams("xp",{mult:2,games:["pong","zz"],other:1}),{mult:2,games:["pong"]});
 for(const [t,p] of [["xp",{mult:5,games:["pong"]}],["xp",{mult:2,games:[]}],["xp",{mult:2}],["missions",{extra:"2"}],["zz",{}],["__proto__",{}],["soldes",null]])
  assert.equal(E.cleanParams(t,p),null,JSON.stringify([t,p]));
 for(const [k,t] of Object.entries(E.EVENT_TYPES)){
  const p=Object.fromEntries(t.params.map(f=>[f.k,f.games?E.EVENT_GAMES.map(g=>g[0]):f.def]));
  assert.deepEqual(E.cleanParams(k,p),p,k);assert.ok(E.eventSummary({type:k,params:p}).length>3,k);
 }
 assert.ok(!Object.values(E.eventCatalogue()).some(t=>"sum" in t));
});

test("what runs: within its hours, for its camp; two of a kind never add up, different kinds run together",()=>{
 const l=[{id:1,type:"xp",params:{mult:2,games:["pong"]},starts:10,ends:20,who:"all"},{id:2,type:"xp",params:{mult:3,games:["pong","manif"]},starts:10,ends:20,who:"left"},
  {id:3,type:"soldes",params:{off:50},starts:15,ends:20,who:"all"},{id:4,type:"courrier",params:{gap:15},starts:10,ends:20,who:"all"},{id:5,type:"courrier",params:{gap:10},starts:10,ends:20,who:"all"}];
 assert.equal(E.effectsOf(l,"left",9),E.NO_FX);assert.equal(E.effectsOf(l,"left",20),E.NO_FX,"the end is excluded");
 const a=E.effectsOf(l,"left",16),b=E.effectsOf(l,"right",16);
 assert.deepEqual(a.xp,{pong:3,debate:1,manif:3});assert.deepEqual(b.xp,{pong:2,debate:1,manif:1});
 assert.equal(a.off,50);assert.equal(E.effectsOf(l,"left",12).off,0);assert.equal(a.mailGap,10,"the shortest gap");
 assert.deepEqual(E.activeEvents(l,null,16).map(e=>e.id),[1,2,3,4,5]);assert.deepEqual(E.activeEvents(l,"right",16).map(e=>e.id),[1,3,4,5]);
 assert.equal(E.NO_FX.xp.pong,1);
});

test("Double XP: the start and the bonus, kept by a game started during the event, even after it",()=>{
 const S=game("left",10),b=boostOf(ev("xp",{mult:2,games:["pong","manif"]}));
 const xp0=S.xp,r=play(S,{type:"pongStart"},10,b);assert.ok(r.ok);assert.equal(S.pong.x,2);
 assert.equal(S.xp-xp0,R.XP.visit+R.PONG_RULES.xp*2);
 const xp1=S.xp,e=R.act(S,{type:"pongEnd",score:6,id:r.game.id},{now:at(10)+12000,random:never});   // the event is over: no boost passed
 assert.ok(e.ok,JSON.stringify(e));assert.equal(e.bonus,12);assert.equal(S.xp-xp1,12);
 const T=game("left",10),t0=T.xp;play(T,{type:"debate"},10,b);assert.equal(T.mini.x,undefined,"the debate was not chosen");assert.equal(T.xp-t0,R.XP.visit);
 const M=game("left",10),m=play(M,{type:"manifStart"},10,boostOf(ev("xp",{mult:1.5,games:["manif"]})));
 assert.equal(M.mini.x,1.5);assert.deepEqual(Object.keys(R.sanitize(structuredClone(M),at(10)).mini).sort(),["id","k","seed","t","x"]);
 const f=R.act(M,{type:"miniEnd",score:60,id:m.game.id},{now:at(10)+29000,random:never});assert.equal(f.bonus,Math.round(15*1.5));
});

test("Missions libres, Mission express and Pluie de bulletins",()=>{
 const S=game("left",10);S.missions.n=6;
 assert.match(A.missionBlock(S,"tract"),/6 missions/);
 assert.equal(A.missionBlock(S,"tract",E.effectsOf([ev("missions",{extra:"all"})],"left",1)),"");
 assert.equal(A.missionLimit(E.effectsOf([ev("missions",{extra:3})],"left",1)),9);
 S.missions.n=0;
 const b=boostOf(ev("express",{div:2}),ev("bulletins",{mult:2}));
 assert.ok(play(S,{type:"missionStart",id:"repos"},10,b).ok);
 assert.equal(S.missions.cur.end,S.missions.cur.start+2*H,"a 4 h mission in 2 h");assert.equal(S.missions.cur.div,2);assert.equal(S.missions.cur.bm,2);
 const kept=R.sanitize(structuredClone(S),at(10)).missions.cur;assert.equal(kept.end,S.missions.cur.end,"sanitize keeps the shortened mission");assert.equal(kept.bm,2);
 R.advance(S,at(12),1,never);S.goals.list=[];const c=S.wardrobe.bulletins,xp=S.xp;
 const r=R.act(S,{type:"missionReport"},{now:at(12),random:never});   // the event is over
 assert.equal(r.report.bulletins,6,"3 for the long mission, doubled");assert.equal(r.report.xp,30);assert.equal(S.wardrobe.bulletins-c,6);assert.ok(S.xp-xp>=30);
 assert.deepEqual(A.missionPay(S,A.missionOf("ag"),2),{xp:10,bulletins:2,why:""},"the cap doubles too");
 assert.deepEqual(A.missionPay(S,A.missionOf("ag")),{xp:10,bulletins:0,why:"cap"},"back to the usual cap");
});

test("Tirage du peuple: offered once per event, never rolling the mythic",()=>{
 const S=game("left",10),fx=E.effectsOf([ev("tirage",{n:2},{id:7})],"left",1);let claims=0;
 const mythic={available:true,clean:true,ageDays:40,claim(){claims++;return true;}};S.flame.pts=500;
 assert.equal(W.bonusDraws(S,E.NO_FX),0);assert.equal(W.bonusDraws(S,fx),2);
 const b=()=>fx;
 const r=R.act(S,{type:"draw",pay:"bonus"},{now:at(10),random:()=>0,mythic,boost:b});
 assert.ok(r.ok);assert.equal(r.mythic,undefined);assert.equal(claims,0);assert.deepEqual(S.wardrobe.ev,{ids:[7],n:1});assert.equal(W.bonusDraws(S,fx),1);
 assert.ok(R.act(S,{type:"draw",pay:"bonus"},{now:at(10),random:never,boost:b}).ok);
 assert.equal(R.act(S,{type:"draw",pay:"bonus"},{now:at(10),random:never,boost:b}).ok,false,"all used");
 assert.equal(R.act(S,{type:"draw",pay:"bonus"},{now:at(10),random:never}).ok,false,"no event");
 assert.equal(W.freeDrawToday(S),true,"the free draw of the day is untouched");
 assert.equal(W.bonusDraws(S,E.effectsOf([ev("tirage",{n:1},{id:8})],"left",1)),1,"another event offers again");
 assert.deepEqual(W.sanitizeWardrobe({...S.wardrobe,ev:{ids:[7,"x"],n:2}}).ev,{ids:[7],n:2});assert.equal(W.sanitizeWardrobe({...S.wardrobe,ev:{id:"x"}}).ev,undefined);
});

test("Tirage du peuple: overlapping events share the strongest's allowance, before and after the other ends",()=>{
 const A1=ev("tirage",{n:1},{id:1}),B3=ev("tirage",{n:3},{id:2}),only=(...l)=>E.effectsOf(l,"left",1);
 const S=game("left",10),draw=fx=>R.act(S,{type:"draw",pay:"bonus"},{now:at(10),random:never,boost:()=>fx});
 assert.ok(draw(only(A1)).ok);assert.equal(W.bonusDraws(S,only(A1)),0);
 assert.equal(W.bonusDraws(S,only(A1,B3)),2,"3 at most in all, not 1 + 3");
 assert.ok(draw(only(A1,B3)).ok);assert.ok(draw(only(A1,B3)).ok);assert.equal(draw(only(A1,B3)).ok,false);
 assert.equal(W.bonusDraws(S,only(A1)),0,"the first one alone gives nothing back");assert.equal(W.bonusDraws(S,only(B3)),0);
});

test("Soldes: the price falls, never to nothing, and a free item stays free",()=>{
 const fx=E.effectsOf([ev("soldes",{off:50})],"left",1),soup=R.shop.find(i=>i.key==="soup"),bread=R.shop.find(i=>i.key==="bread");
 assert.equal(R.itemPrice(soup,fx),Math.max(1,Math.ceil(soup.price/2)));assert.equal(R.itemPrice(bread,fx),0);assert.equal(R.itemPrice({price:1},fx),1);assert.equal(R.itemPrice(soup),soup.price);
 const S=game("left",10);S.fm=50;S.sat=10;
 assert.ok(play(S,{type:"buy",key:"soup"},10,()=>fx).ok);assert.equal(S.fm,50-R.itemPrice(soup,fx));
 const T=game("left",10),big=R.shop.filter(i=>i.price>=2).at(-1);T.fm=R.itemPrice(big,fx);assert.notEqual(R.itemBlock(T,big),"");assert.ok(!/Il manque/.test(R.itemBlock(T,big,fx)));
});

test("Sac postal: a letter every few minutes on top of the calendar, answered or not, into the box of 3",()=>{
 const S=game("left",10);S.mail.letter=null;S.mail.queue=[];S.mail.k=A.MAIL.slots;   // the calendar is done for the day
 const fx=E.effectsOf([ev("courrier",{gap:10})],"left",1);
 R.advance(S,at(10.1),1,never,()=>fx);assert.ok(S.mail.letter,"one as the event starts");assert.equal(S.mail.next,at(10.1)+10*60000);
 R.advance(S,at(10.1)+5*60000,1,never,()=>fx);assert.equal(A.lettersWaiting(S),1);
 R.advance(S,at(10.1)+10*60000,1,never,()=>fx);assert.equal(A.lettersWaiting(S),2,"not answered, it comes anyway");
 R.advance(S,at(10.1)+20*60000,1,never,()=>fx);R.advance(S,at(10.1)+30*60000,1,never,()=>fx);assert.equal(A.lettersWaiting(S),3,"the box holds 3");
 R.advance(S,at(11),1,never);assert.equal(A.lettersWaiting(S),3,"after the event, the calendar only");
});

test("Sac postal: the mail's bulletins capped at 6 a day instead of 2",()=>{
 const S=game("left",10),fx=E.effectsOf([ev("courrier",{gap:10})],"left",1),b0=S.wardrobe.bulletins;S.goals.list=[];
 const answer=(n,f)=>{S.mail.n=n;S.mail.day=20260105;S.mail.letter={id:"l_velo",t:S.vclock};return play(S,{type:"mailAnswer",id:"l_velo",choice:0},10,()=>f).bulletin;};
 assert.equal(A.mailBulletinsLeft(S,fx),6);assert.equal(A.mailBulletinsLeft(S),2);
 for(let k=1;k<=7;k++)assert.equal(answer(3*k-1,fx),k<=6,`the ${3*k}th letter`);
 assert.equal(S.wardrobe.bulletins,b0+6);assert.equal(A.mailBulletinsLeft(S,fx),0);
 S.mail.b=1;assert.equal(answer(2,E.NO_FX),true,"outside the event, the usual cap");assert.equal(answer(5,E.NO_FX),false);
});

test("Nuit des duels: a win pays more, a loss the same",()=>{
 const S=game("left",10);S.moral=S.energy=50;const xp=S.xp;
 R.duelApply(S,"win",{vs:"Bob",mine:9,theirs:3,mult:2});
 assert.equal(S.xp-xp,R.DUEL.win.xp*2);assert.equal(S.moral,50+R.DUEL.win.moral*2);
 const T=game("left",10);T.moral=T.energy=50;T.lvl=20;T.xp=R.xpFloor(20)+100;const t=T.xp;R.duelApply(T,"loss",{vs:"Bob",mine:3,theirs:9,mult:2});assert.equal(T.xp-t,R.DUEL.loss.xp);
});

test("Immunité parlementaire: the gauges fall slower, the night's rest stays whole, nobody dies; the count resumes after",()=>{
 const fx=E.effectsOf([ev("immunite",{slow:2})],"left",1),day=R.ECO.awake;
 const S=game("left",10);S.sat=S.moral=S.energy=S.hyg=80;R.advance(S,at(11),1,never,()=>fx);
 assert.equal(S.sat,80-Math.ceil(day.sat/2));assert.equal(S.hyg,80-Math.ceil(day.hyg/2));
 const N=game("left",1);N.energy=50;R.advance(N,at(2),1,never,()=>fx);assert.equal(N.energy,50-R.ECO.night.energy,"the night still rests him");
 const D=game("left",10);D.sat=D.moral=D.energy=D.hyg=0;D.zero=11;const deaths=D.deaths;
 R.advance(D,at(16),1,never,()=>fx);assert.equal(D.deaths,deaths);assert.equal(D.zero,11);
 D.sat=D.moral=D.energy=D.hyg=0;R.advance(D,at(17),1,never);assert.equal(D.deaths,deaths+1,"the event is over");
 // Only the hours of the event count: a catch-up over a longer gap asks hour by hour.
 const C=game("left",10);C.sat=C.moral=C.energy=C.hyg=90;const seen=[];R.advance(C,at(13),1,never,t=>{seen.push(t);return E.NO_FX;});
 assert.deepEqual(seen.slice(0,3),[at(11),at(12),at(13)]);
});

test("an event counts for the hours that land while it runs, and not one after",()=>{
 const l=[ev("immunite",{slow:3},{starts:at(10)+45*6e4,ends:at(12)+45*6e4})],fxAt=t=>E.effectsOf(l,"left",t),day=R.ECO.awake;
 const S=game("left",10);S.sat=S.moral=S.energy=S.hyg=90;
 R.advance(S,at(11),1,never,fxAt);assert.equal(S.sat,90-Math.ceil(day.sat/3),"launched at 10:45, it covers 11:00");
 R.advance(S,at(12),1,never,fxAt);assert.equal(S.sat,90-2*Math.ceil(day.sat/3));
 R.advance(S,at(13),1,never,fxAt);assert.equal(S.sat,90-2*Math.ceil(day.sat/3)-day.sat,"over at 12:45: 13:00 is a normal hour");
 const D=game("left",10);D.sat=D.moral=D.energy=D.hyg=0;D.zero=11;const deaths=D.deaths;
 R.advance(D,at(11),1,never,fxAt);assert.equal(D.deaths,deaths,"no death in the first hour of the immunity");
});

test("no event reaches the Flamme or the mythic's odds",()=>{
 const keys=Object.keys(E.NO_FX);assert.ok(!keys.some(k=>/flam|mythic|odds/i.test(k)));
 assert.equal(JSON.stringify(E.eventCatalogue()).includes("Flamme"),false);
});

test("the announcements: every type has its prepared text, within the limit with the longest settings",()=>{
 const combos=(t,p={},i=0)=>{const f=t.params[i];if(!f)return [p];return (f.games?[E.EVENT_GAMES.map(g=>g[0]),["pong"]]:f.opts.map(o=>o[0])).flatMap(v=>combos(t,{...p,[f.k]:v},i+1));};
 const cat=E.eventCatalogue();
 for(const [type,t] of Object.entries(E.EVENT_TYPES)){
  assert.equal(E.badTokens(t.ann),null,type);assert.ok(t.ann.includes("{fin}"),type);assert.equal(cat[type].ann,t.ann);assert.equal(cat[type].rem,E.EVENT_REMIND_TEXT);
  for(const params of combos(t)){const e={type,params,name:"x".repeat(E.EVENT_NAME_MAX)};
   for(const text of [t.ann,E.EVENT_REMIND_TEXT])assert.ok(E.fillEvent(text,E.eventLongest(e)).length<=240,`${type} ${JSON.stringify(params)}`);}
 }
 assert.equal(E.badTokens(E.EVENT_REMIND_TEXT),null);
});

test("the tokens: only the known ones, whole, and a value is never read again",()=>{
 assert.equal(E.badTokens("Rien à remplacer"),null);assert.equal(E.badTokens("{nom} {fin} {debut} {delai} {resume}"),null);
 for(const [t,bad] of [["{nom }","{nom }"],["{Nom}","{Nom}"],["{prix} et {nom}","{prix}"],["{nom","{"],["nom}","}"],["{}","{}"]])assert.equal(E.badTokens(t),bad,t);
 assert.equal(E.fillEvent("{nom} jusqu'à {fin}",{nom:"Le {fin}",fin:"22 h"}),"Le {fin} jusqu'à 22 h");
 const e={type:"soldes",params:{off:50},name:"Soldes"};
 assert.equal(E.eventText(e,"ann"),E.EVENT_TYPES.soldes.ann);assert.equal(E.eventText({...e,ann:"À moi"},"ann"),"À moi");
 assert.equal(E.eventText(e,"remind"),E.EVENT_REMIND_TEXT);assert.equal(E.eventText({...e,rtext:"Bientôt"},"remind"),"Bientôt");
});

test("the times in words: the same day, tomorrow, later, and across a month",()=>{
 const w=(day,hour,minute=0,month=11,year=2026)=>({year,month,day,hour,minute}),ref=w(6,21,40);
 assert.equal(E.eventWhen(w(6,22),ref),"22 h");assert.equal(E.eventWhen(w(6,22,5),ref),"22 h 05");assert.equal(E.eventWhen(w(6,0),ref),"0 h");
 assert.equal(E.eventWhen(w(7,9,30),ref),"demain à 9 h 30");assert.equal(E.eventWhen(w(9,20),ref),"lundi 9 à 20 h");
 assert.equal(E.eventWhen(w(1,8,0,12),w(30,20)),"demain à 8 h");assert.equal(E.eventWhen(w(1,8,0,1,2027),w(31,20,0,12)),"demain à 8 h");
});

test("the delay in words: what is really left, never less than a minute",()=>{
 const m=6e4;
 for(const [ms,t] of [[15*m,"15 minutes"],[15*m-400,"15 minutes"],[60*m,"1 heure"],[60*m-400,"1 heure"],[1440*m,"1 jour"],[1440*m-400,"1 jour"],[30*m,"30 minutes"],[1*m,"1 minute"],[20e3,"1 minute"],[90*m,"1 h 30"],[120*m,"2 heures"],[23*60*m,"23 heures"],[2880*m,"2 jours"]])
  assert.equal(E.eventDelay(ms),t,String(ms));
});

test("the reminders: 15 minutes, 1 hour and 1 day only, sorted, each once",()=>{
 assert.deepEqual(E.cleanReminds([15,1440,60,15]),[1440,60,15]);assert.deepEqual(E.cleanReminds([]),[]);
 for(const bad of [[30],["15"],[15.5],"15",null,{}])assert.equal(E.cleanReminds(bad),null,JSON.stringify(bad));
 assert.deepEqual(E.EVENT_REMINDS.map(r=>r[0]),[15,60,1440]);
});

test("reminders due: together when late, none after the start, none within five minutes of the last, and the legitimate ones are never held",()=>{
 const m=6e4,starts=1e9,e={starts,reminds:[15,60,1440],sent:[]},at=x=>starts-x*m;
 assert.deepEqual(E.dueReminds(e,at(1500)),[]);assert.deepEqual(E.dueReminds(e,at(1440)),[1440]);
 assert.deepEqual(E.dueReminds(e,at(30)),[60,1440],"late: together");assert.deepEqual(E.dueReminds(e,starts),[],"too late");
 assert.deepEqual(E.dueReminds({...e,sent:[1440]},at(60)),[60]);
 assert.deepEqual(E.dueReminds({...e,sent:[1440]},at(60),at(62)),[],"within five minutes: held");
 assert.deepEqual(E.dueReminds({...e,sent:[1440]},at(60),at(65)),[60],"five minutes on");
 assert.deepEqual(E.dueReminds({...e,sent:[1440,60]},at(15),at(60)),[15],"the closest two are 45 minutes apart");
 assert.ok(E.EVENT_REMINDS.every(([x],i,l)=>!i||x-l[i-1][0]>=E.EVENT_REMIND_GAP/m),"no two offered closer than the limit");
});
