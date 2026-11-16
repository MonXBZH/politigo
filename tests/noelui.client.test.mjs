// Trêve des confiseurs, the screen's pure helpers (web/noelui.mjs): the moment of the season by the server's clock,
// the Advent sheet's grid, the gifts' wording, the year of the vœux and of the welcome toast.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";
import {noelMoment,noelYear,voeuxText,adventCells,adventGiftText,ADVENT_ORDER} from "../web/noelui.mjs";

R.setTimeZone("Europe/Paris");
const paris=(y,mo,d,h=0,mi=0,s=0)=>Date.UTC(y,mo-1,d,h-1,mi,s);   // Paris is UTC+1 in winter
const at=(y,mo,d,h=12)=>({vclock:paris(y,mo,d,h)});
const st=(opened=[],y=2026)=>({advent:{y,opened}});

test("noelMoment: nothing outside the theme, the sleigh on the 24th from 18 h to 6 h, the vœux on the 31st from 20 h",()=>{
 assert.equal(noelMoment(paris(2026,12,24,20),""),"");
 assert.equal(noelMoment(paris(2026,12,24,20),"halloween"),"");
 assert.equal(noelMoment(NaN,"noel"),"");
 assert.equal(noelMoment(paris(2026,12,7,12),"noel"),"day");
 assert.equal(noelMoment(paris(2026,12,24,17,59,59),"noel"),"day");
 assert.equal(noelMoment(paris(2026,12,24,18),"noel"),"eve");
 assert.equal(noelMoment(paris(2026,12,24,23,59),"noel"),"eve");
 assert.equal(noelMoment(paris(2026,12,25,0),"noel"),"eve");
 assert.equal(noelMoment(paris(2026,12,25,5,59,59),"noel"),"eve");
 assert.equal(noelMoment(paris(2026,12,25,6),"noel"),"day");
 assert.equal(noelMoment(paris(2026,12,31,19,59,59),"noel"),"day");
 assert.equal(noelMoment(paris(2026,12,31,20),"noel"),"voeux");
 assert.equal(noelMoment(paris(2026,12,31,23,59,59),"noel"),"voeux");
 assert.equal(noelMoment(paris(2027,1,1,0),"noel"),"day","midnight is Task 9's scene, not the vœux");
 assert.equal(noelMoment(paris(2026,6,15,20),"noel"),"day","forced in June: just the decor");
});

test("noelMoment follows the server's zone, not UTC",()=>{
 // 24 December, 17:30 UTC is 18:30 in Paris (eve) but only 12:30 in New York.
 const ms=Date.UTC(2026,11,24,17,30);
 assert.equal(noelMoment(ms,"noel"),"eve");
 R.setTimeZone("America/New_York");
 try{assert.equal(noelMoment(ms,"noel"),"day");}finally{R.setTimeZone("Europe/Paris");}
});

test("noelYear: the December the theme belongs to (1 January still counts for the year before)",()=>{
 assert.equal(noelYear(paris(2026,12,1,0)),2026);
 assert.equal(noelYear(paris(2026,12,31,23,59)),2026);
 assert.equal(noelYear(paris(2027,1,1,12)),2026);
 assert.equal(noelYear(paris(2027,6,1,12)),2027);
});

test("voeuxText: the year wished is the one coming, worked out at display time",()=>{
 for(const c of ["left","right"]){
  assert.ok(R.NOEL.voeux[c].includes("{annee}"),"the rules keep a token, not a hard-coded year");
  const t=voeuxText(c,paris(2026,12,31,21));
  assert.ok(t.includes("pour 2027"),t);
  assert.ok(!t.includes("{annee}"));
  assert.ok(voeuxText(c,paris(2030,12,31,21)).includes("pour 2031"));
 }
 assert.equal(voeuxText("nobody",paris(2026,12,31,21)),"");
});

test("ADVENT_ORDER: the mockup's shuffled grid, each day once",()=>{
 assert.deepEqual(ADVENT_ORDER,[13,2,21,7,18,10,5,24,15,1,11,20,8,17,3,22,12,6,19,4,23,9,16,14]);
 assert.deepEqual([...ADVENT_ORDER].sort((a,b)=>a-b),Array.from({length:24},(_,i)=>i+1));
});

const stateOf=(cells,d)=>cells.cells.find(c=>c.day===d).state;

test("adventCells: today, opened, missed and later, in the grid's order",()=>{
 const v=adventCells(st([2,5]),"noel",paris(2026,12,7,10));
 assert.deepEqual(v.cells.map(c=>c.day),ADVENT_ORDER);
 assert.equal(stateOf(v,7),"today");
 assert.equal(stateOf(v,2),"open");
 assert.equal(stateOf(v,5),"open");
 assert.equal(stateOf(v,1),"missed");
 assert.equal(stateOf(v,6),"missed");
 assert.equal(stateOf(v,8),"later");
 assert.equal(stateOf(v,24),"later");
 assert.equal(v.over,false);
 assert.equal(v.today,7);
 assert.equal(v.canOpen,true);
});

test("adventCells: today's box already opened is ✓, and nothing can be opened",()=>{
 const v=adventCells(st([7]),"noel",paris(2026,12,7,23,59));
 assert.equal(stateOf(v,7),"open");
 assert.equal(v.canOpen,false);
 // 0 h: a new civil day, a new box (adventBlock's dayKey)
 const w=adventCells(st([7]),"noel",paris(2026,12,8,0));
 assert.equal(stateOf(w,8),"today");
 assert.equal(w.canOpen,true);
});

test("adventCells: last year's opened boxes do not count",()=>{
 const v=adventCells(st([1,2,3],2025),"noel",paris(2026,12,4,9));
 assert.equal(stateOf(v,1),"missed");
 assert.equal(stateOf(v,4),"today");
});

test("adventCells: the 24th is gold until it is opened or missed",()=>{
 const gold=v=>v.cells.find(c=>c.day===24).gold;
 assert.equal(gold(adventCells(st(),"noel",paris(2026,12,3))),true);
 assert.equal(gold(adventCells(st(),"noel",paris(2026,12,24))),true);
 assert.equal(stateOf(adventCells(st(),"noel",paris(2026,12,24)),24),"today");
 assert.equal(gold(adventCells(st([24]),"noel",paris(2026,12,24))),false);
 assert.equal(gold(adventCells(st(),"noel",paris(2026,12,26))),false);
 assert.ok(adventCells(st(),"noel",paris(2026,12,3)).cells.filter(c=>c.gold).length===1);
});

test("adventCells: after the 24th, every box is past and the sheet says « Rendez-vous à la Saint-Sylvestre »",()=>{
 const v=adventCells(st([1,24]),"noel",paris(2026,12,26));
 assert.equal(v.over,true);
 assert.equal(v.canOpen,false);
 assert.equal(v.today,0);
 assert.equal(stateOf(v,24),"open");
 assert.equal(stateOf(v,23),"missed");
 assert.match(v.note,/Rendez-vous à la Saint-Sylvestre/);
 // 1 January (the theme's last day): the year before's calendar, finished
 const j=adventCells(st([1,24],2026),"noel",paris(2027,1,1,10));
 assert.equal(j.over,true);
 assert.equal(stateOf(j,1),"open");
 assert.equal(stateOf(j,2),"missed");
 assert.match(j.note,/décembre prochain/);
});

test("adventCells: outside the theme nothing opens, and a missing state is tolerated",()=>{
 const v=adventCells(st(),"",paris(2026,12,7));
 assert.equal(v.canOpen,false);
 assert.ok(v.note.length>0);
 const w=adventCells({},"noel",paris(2026,12,7));
 assert.equal(stateOf(w,7),"today");
 const forced=adventCells(st(),"noel",paris(2026,6,15));
 assert.equal(forced.canOpen,false);
 assert.ok(forced.cells.every(c=>c.state==="later"));
});

test("adventCells: aria labels say the state, the text is ✓, · or the day",()=>{
 const v=adventCells(st([2]),"noel",paris(2026,12,7));
 const cell=d=>v.cells.find(c=>c.day===d);
 assert.equal(cell(7).label,"Case 7, à ouvrir");assert.equal(cell(7).text,"7");
 assert.equal(cell(2).label,"Case 2, ouverte");assert.equal(cell(2).text,"✓");
 assert.equal(cell(1).label,"Case 1, oubliée");assert.equal(cell(1).text,"·");
 assert.equal(cell(9).label,"Case 9, pas encore");assert.equal(cell(9).text,"9");
});

test("adventCells: matches adventBlock on whether today's box can be opened",()=>{
 for(const [S,ms] of [[st(),paris(2026,12,7)],[st([7]),paris(2026,12,7)],[st(),paris(2026,12,25)],[st(),paris(2027,1,1)]]){
  const s={...S,vclock:ms,advent:S.advent};
  assert.equal(adventCells(S,"noel",ms).canOpen,R.adventBlock(s,"noel")==="",`${new Date(ms).toISOString()}`);
 }
});

test("adventGiftText: a flavour line and what it pays, matching ADVENT; the 24th is the big box; never FM",()=>{
 for(let d=1;d<=24;d++){
  const g=adventGiftText(d),a=R.ADVENT[d-1];
  assert.ok(g.text.length>0&&g.pay.length>0,`day ${d}`);
  assert.ok(!/FM/.test(g.text+g.pay));
  if(a.k==="bulletins")assert.match(g.pay,new RegExp(`\\+${a.n} bulletin`));
  else if(a.k!=="all")assert.match(g.pay,new RegExp(`${R.fxNames[a.k]} \\+${a.n}`));
 }
 assert.match(adventGiftText(24).pay,/\+3 bulletins/);
 assert.match(adventGiftText(24).pay,/\+5/);
 assert.equal(adventGiftText(1).pay,`${R.fxNames.moral} +8`);
 assert.equal(adventGiftText(3).pay,"+1 bulletin");
 assert.equal(adventGiftText(6).pay,"+2 bulletins");
 assert.equal(adventGiftText(0),null);
 assert.equal(adventGiftText(25),null);
});

// ---------------------------------------------------------------- E.T. (homage): the bike crossing the moon
import {etPlan,etProgress,ET_MS} from "../web/noelui.mjs";
const HOUR=3600000,MIN=60000;

test("etPlan: deterministic from the hour index alone",()=>{
 for(let h=0;h<500;h++)assert.deepEqual(etPlan(h),etPlan(h));
 assert.deepEqual(etPlan(493000),etPlan(493000));
 // not all hours alike
 const shapes=new Set(Array.from({length:200},(_,h)=>JSON.stringify(etPlan(h))));
 assert.ok(shapes.size>20);
});

test("etPlan: 0, 1 or 2 sorted passes, whole minutes, before minute 55, at least 10 minutes apart",()=>{
 const base=Math.floor(Date.UTC(2026,11,1)/HOUR);
 for(let h=base;h<base+10000;h++){
  const p=etPlan(h);
  assert.ok(Array.isArray(p)&&p.length<=2,`hour ${h}: ${p}`);
  for(const at of p){assert.ok(Number.isInteger(at)&&at>=0&&at<55*MIN&&at%MIN===0,`hour ${h}: ${at}`);assert.ok(at+ET_MS<HOUR);}
  if(p.length===2){assert.ok(p[0]<p[1]);assert.ok(p[1]-p[0]>=10*MIN,`hour ${h}: ${p}`);}
 }
});

test("etPlan: about 40 % of hours without, 40 % with one, 20 % with two (±3 %)",()=>{
 const n=10000,count=[0,0,0],base=Math.floor(Date.UTC(2026,11,1)/HOUR);
 for(let h=base;h<base+n;h++)count[etPlan(h).length]++;
 const f=count.map(c=>c/n);
 assert.ok(Math.abs(f[0]-0.4)<=0.03,`none ${f[0]}`);
 assert.ok(Math.abs(f[1]-0.4)<=0.03,`one ${f[1]}`);
 assert.ok(Math.abs(f[2]-0.2)<=0.03,`two ${f[2]}`);
});

test("etPlan: odd hour indexes are tolerated",()=>{
 for(const h of [NaN,-1,1.5,Infinity,undefined,"3"])assert.deepEqual(etPlan(h),[]);
});

test("ET_MS: 15 s, from the left edge of the screen to the right one at the validated speed",()=>{assert.equal(ET_MS,15000);});

const hourWith=k=>{const base=Math.floor(Date.UTC(2026,11,1)/HOUR);for(let h=base;;h++)if(etPlan(h).length===k)return h;};

test("etProgress: 0 at the start of a pass, 1 at its end, null just outside",()=>{
 const h=hourWith(1),at=h*HOUR+etPlan(h)[0];
 assert.equal(etProgress(at-1),null);
 assert.equal(etProgress(at),0);
 assert.equal(etProgress(at+ET_MS/2),0.5);
 assert.equal(etProgress(at+ET_MS),1);
 assert.equal(etProgress(at+ET_MS+1),null);
});

test("etProgress: both passes of a two-pass hour, nothing between them; null in a hour without",()=>{
 const h=hourWith(2),[a,b]=etPlan(h);
 for(const at of [a,b]){const ms=h*HOUR+at;for(let s=0;s<=ET_MS;s+=250){const k=etProgress(ms+s);assert.ok(k!==null&&k>=0&&k<=1);}}
 assert.equal(etProgress(h*HOUR+a+ET_MS+MIN),null);
 const z=hourWith(0);
 for(let m=0;m<60;m++)assert.equal(etProgress(z*HOUR+m*MIN+1000),null);
 assert.equal(etProgress(NaN),null);
 assert.equal(etProgress(undefined),null);
});

test("etProgress: over a whole day, on screen a handful of seconds an hour at most",()=>{
 const base=Math.floor(Date.UTC(2026,11,7)/HOUR)*HOUR;let on=0;
 for(let ms=base;ms<base+24*HOUR;ms+=500){const k=etProgress(ms);if(k!==null){assert.ok(k>=0&&k<=1);on++;}}
 assert.ok(on<=24*2*(ET_MS/500+1));
});

// ---------------------------------------------------------------- the midnight toast (Task 9)
import {cheersPhase,cheersNamesLine,frontLine,newYearYear,newYearScreen,CHEERS_MS} from "../web/noelui.mjs";

test("cheersPhase: the 8 s loop, 3-2-1, Minuit, Tchin, the vœux; any number of loops, junk safe",()=>{
 assert.equal(CHEERS_MS,8000);
 const want=[[0,"count3"],[499,"count3"],[500,"count2"],[999,"count2"],[1000,"count1"],[1499,"count1"],[1500,"minuit"],[2199,"minuit"],
  [2200,"tchin"],[3399,"tchin"],[3400,"voeux"],[7999,"voeux"],[8000,"count3"],[16000+2500,"tchin"],[3*8000+5000,"voeux"]];
 for(const [t,p] of want)assert.equal(cheersPhase(t),p,`t=${t}`);
 assert.equal(cheersPhase(-1),"count3");
 assert.equal(cheersPhase(NaN),"count3");
 assert.equal(cheersPhase(undefined),"count3");
 assert.equal(cheersPhase(Infinity),"count3");
});

test("cheersNamesLine: up to 4 names, then the others, in correct French whatever the counts",()=>{
 assert.equal(cheersNamesLine(["Hugo","Camille","Lucie","Marc"],1342),"Hugo, Camille, Lucie, Marc… et 1 342 autres trinquent avec toi");
 assert.equal(cheersNamesLine(["Hugo"],1),"Hugo… et 1 autre trinquent avec toi");
 assert.equal(cheersNamesLine(["Hugo"],0),"Hugo trinque avec toi");
 assert.equal(cheersNamesLine(["Hugo","Camille"],0),"Hugo et Camille trinquent avec toi");
 assert.equal(cheersNamesLine(["Hugo","Camille","Lucie"],0),"Hugo, Camille et Lucie trinquent avec toi");
 assert.equal(cheersNamesLine([],1),"1 autre joueur trinque avec toi");
 assert.equal(cheersNamesLine([],12),"12 autres joueurs trinquent avec toi");
 assert.equal(cheersNamesLine([],0),"Toute la République trinque avec toi");
 assert.equal(cheersNamesLine(null,undefined),"Toute la République trinque avec toi");
 assert.equal(cheersNamesLine(["Hugo","Camille","Lucie","Marc","Inès","Yanis"],0),"Hugo, Camille, Lucie et Marc trinquent avec toi","never more than 4");
 assert.equal(cheersNamesLine(["Hugo",42,"","  ",null,"Inès"],-3),"Hugo et Inès trinquent avec toi","junk dropped, a negative count is 0");
 assert.equal(cheersNamesLine(["Hugo"],2.7),"Hugo… et 2 autres trinquent avec toi");
 assert.equal(cheersNamesLine(["Zoé 🎄","O'Brien <b>"],0),"Zoé 🎄 et O'Brien <b> trinquent avec toi","names are text, kept as they are");
 assert.equal(cheersNamesLine(["x".repeat(80)],0),`${"x".repeat(23)}… trinque avec toi`,"a very long name is cut (with an ellipsis)");
 assert.equal(cheersNamesLine(["Marie-Antoinette de La Rochefoucauld"],0),"Marie-Antoinette de La… trinque avec toi","no space before the ellipsis");
});

test("frontLine: the server's feed wording, or nothing",()=>{
 assert.equal(frontLine({winner:"left",left:30,right:12}),"❄️ Le Front de neige est tombé : la Gauche l'emporte (30 contre 12).");
 assert.equal(frontLine({winner:"right",left:9,right:41}),"❄️ Le Front de neige est tombé : la Droite l'emporte (41 contre 9).");
 assert.equal(frontLine({winner:"tie",left:7,right:7}),"❄️ Le Front de neige est tombé : égalité parfaite, 7 partout.");
 assert.equal(frontLine({winner:"left",left:1284220,right:1251900}),"❄️ Le Front de neige est tombé : la Gauche l'emporte (1 284 220 contre 1 251 900).","grouped with a plain no-break space");
 assert.equal(frontLine({winner:"tie",left:1500,right:1500}),"❄️ Le Front de neige est tombé : égalité parfaite, 1 500 partout.");
 assert.equal(frontLine(null),"");
 assert.equal(frontLine(undefined),"");
 assert.equal(frontLine({winner:"middle",left:1,right:2}),"");
 assert.equal(frontLine({winner:"left",left:"30",right:12}),"");
 assert.equal(frontLine({winner:"left",left:NaN,right:12}),"");
});

test("newYearYear: the year that begins, from 1 January or from a test instant at any date",()=>{
 assert.equal(newYearYear(paris(2027,1,1,0)),2027);
 assert.equal(newYearYear(paris(2027,1,1,0,5)),2027);
 assert.equal(newYearYear(paris(2027,1,1,23,59)),2027);
 assert.equal(newYearYear(paris(2026,12,31,23,59)),2027);
 assert.equal(newYearYear(paris(2026,11,15,14)),2027,"POLITIGO_NEWYEAR_AT in November: the coming year");
 assert.equal(newYearYear(NaN),null);
});

test("newYearScreen: the live scene until `until` unless closed, the replay, the banner",()=>{
 const until=paris(2027,1,1,0,5),ny={names:[],others:0,front:null,until,live:true};
 const base={ny,banner:false,closed:false,replayEnd:0,now:1000,serverMs:until-60000};
 assert.deepEqual(newYearScreen(base),{scene:"live",banner:false});
 assert.deepEqual(newYearScreen({...base,closed:true}),{scene:null,banner:false},"✕: hidden for the session");
 assert.deepEqual(newYearScreen({...base,serverMs:until}),{scene:null,banner:true},"after the five minutes, the banner without waiting for the server");
 assert.deepEqual(newYearScreen({...base,ny:{...ny,live:false},banner:true,serverMs:until+3600e3}),{scene:null,banner:true});
 assert.deepEqual(newYearScreen({...base,ny:{...ny,live:false},banner:true,closed:true,serverMs:until+3600e3}),{scene:null,banner:true},"✕ does not hide the banner");
 assert.deepEqual(newYearScreen({...base,ny:{...ny,live:false},banner:true,replayEnd:5000,now:1000,serverMs:until+60e3}),{scene:"replay",banner:true},"Revoir: two loops, the banner kept (the screen does not jump)");
 assert.deepEqual(newYearScreen({...base,ny:{...ny,live:false},banner:true,replayEnd:5000,now:5000,serverMs:until+60e3}),{scene:null,banner:true});
 assert.deepEqual(newYearScreen({...base,ny:null}),{scene:null,banner:false});
 assert.deepEqual(newYearScreen({...base,ny:null,banner:true}),{scene:null,banner:false},"no newYear, no banner");
 assert.deepEqual(newYearScreen({...base,ny:{...ny,until:"x"}}),{scene:null,banner:false});
});

test("the midnight scene redraws at about 30 fps, never with reduced motion",async()=>{
 const {nyFrameDue,NY_FRAME_MS}=await import("../web/noelui.mjs");
 assert.equal(NY_FRAME_MS,33);
 assert.equal(nyFrameDue("live",false,1033,1000),true);
 assert.equal(nyFrameDue("live",false,1032,1000),false,"not before 33 ms");
 assert.equal(nyFrameDue("replay",false,2000,1000),true);
 assert.equal(nyFrameDue("live",true,5000,1000),false,"reduced motion: the idle pace only");
 assert.equal(nyFrameDue(null,false,5000,1000),false);
});

import {cheersAnnounce} from "../web/noelui.mjs";
test("cheersAnnounce: the midnight scene's words for a screen reader, once, plain text",()=>{
 assert.equal(cheersAnnounce({names:["Hugo"],others:0,year:2027}),"Minuit ! Bonne année 2027 ! Hugo trinque avec toi");
 assert.equal(cheersAnnounce({}),"Minuit ! Bonne année ! Toute la République trinque avec toi");
 const s=cheersAnnounce({names:["Hugo"],others:2,front:{winner:"left",left:1200,right:900},year:2027});
 assert.ok(s.startsWith("Minuit ! Bonne année 2027 ! Hugo… et 2 autres trinquent avec toi"));
 assert.ok(s.includes("Front de neige")&&!s.includes("❄"));
});
