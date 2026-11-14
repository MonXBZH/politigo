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
