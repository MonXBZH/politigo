// La Nuit du collage, the storage (server/wallstore.mjs): cells, colleurs, nights, titles, on a throwaway database.
import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {WALL_CELLS,HOUR,weekOf} from "../web/wall.mjs";

const WS=await import(process.env.WALLDB||"/app/wallstore.mjs");
const NOW=Date.UTC(2026,10,18,12);
const fresh=()=>{const db=new DatabaseSync(":memory:");return {db,W:WS.createWall(db)};};
const cell=(o={})=>({camp:"left",by:1,name:"Ana",vol:false,sol:2,at:NOW,motif:7,...o});

test("a new wall is one empty wall and a cell round-trips",()=>{
 const {W}=fresh();
 const c=W.cells(NOW);
 assert.equal(c.length,WALL_CELLS);assert.ok(c.every(x=>x===null));
 const p=cell(),q=cell({camp:"right",by:null,name:null,vol:true,sol:1,takenFrom:"left",takenAt:NOW-5,motif:99});
 W.paste(3,p);W.paste(10,q);
 const r=W.cells(NOW);
 assert.deepEqual(r[3],p);assert.deepEqual(r[10],q);assert.equal(r[4],null);
 assert.equal("takenFrom" in r[3],false);
});

test("cells(now) frees a 48 h poster and persists it",()=>{
 const {W}=fresh();
 W.paste(0,cell({at:NOW-48*HOUR}));W.paste(1,cell({at:NOW-47*HOUR}));
 const r=W.cells(NOW);
 assert.equal(r[0],null);assert.ok(r[1]);
 assert.equal(W.cells(NOW)[0],null);   // stays freed
});

test("a full wall opens the next, an emptied last wall disappears",()=>{
 const {W}=fresh();
 W.setCells(Array.from({length:WALL_CELLS},(_,i)=>cell({motif:i})));
 assert.equal(W.cells(NOW).length,2*WALL_CELLS);
 W.paste(WALL_CELLS+2,cell({at:NOW-HOUR}));
 assert.equal(W.cells(NOW).length,2*WALL_CELLS);
 W.paste(WALL_CELLS+2,cell({at:NOW-49*HOUR}));
 assert.equal(W.cells(NOW).length,2*WALL_CELLS);   // wall 1 is still full: the next wall stays open
 const r=W.cells(NOW+49*HOUR);                       // everything expired: wall 1 always exists
 assert.equal(r.length,WALL_CELLS);assert.ok(r.every(x=>x===null));
 assert.equal(W.cells(NOW).length,WALL_CELLS);        // and it was stored
});

test("setCells replaces everything, nulls included",()=>{
 const {W}=fresh();
 W.paste(5,cell());
 const a=W.cells(NOW).slice();a[5]=null;a[6]=cell({by:2,name:"Bob"});
 W.setCells(a);
 const r=W.cells(NOW);
 assert.equal(r[5],null);assert.equal(r[6].by,2);
});

test("noteColleur twice keeps one row and sums; active counts distinct humans per camp",()=>{
 const {W,db}=fresh();
 W.noteColleur(20261118,1,"left",true,NOW);
 W.noteColleur(20261118,1,"left",false,NOW+1);
 W.noteColleur(20261118,2,"left",false,NOW);
 W.noteColleur(20261118,3,"right",true,NOW);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM wall_days WHERE day=20261118 AND player_id=1").get().n,1);
 const row=db.prepare("SELECT pasted,useful,reached_at FROM wall_days WHERE player_id=1").get();
 assert.deepEqual([row.pasted,row.useful,row.reached_at],[2,1,NOW]);
 assert.deepEqual(W.active(20261118),{left:2,right:1});
 assert.deepEqual(W.active(20261117),{left:0,right:0});
 assert.deepEqual(W.colleurs(20261118,"left"),[1,2]);
 assert.deepEqual(W.colleurs(20261118,"right"),[3]);
});

test("volunteer budget accumulates per day and camp",()=>{
 const {W}=fresh();
 assert.equal(W.volunteerUsed(20261118,"left"),0);
 W.addVolunteerUsed(20261118,"left",2);W.addVolunteerUsed(20261118,"left",3);
 assert.equal(W.volunteerUsed(20261118,"left"),5);
 assert.equal(W.volunteerUsed(20261118,"right"),0);
});

test("closeNight then nightClosed, lastClosedDay and history",()=>{
 const {W}=fresh();
 assert.equal(W.nightClosed(20261117),false);assert.equal(W.lastClosedDay(),null);
 W.closeNight(20261117,{left:10,right:4,winners:["left"],paid:3});
 W.closeNight(20261118,{left:5,right:5,winners:["left","right"],paid:6});
 assert.equal(W.nightClosed(20261117),true);assert.equal(W.nightClosed(20261116),false);
 assert.equal(W.lastClosedDay(),20261118);
 const h=W.history(10);
 assert.equal(h.length,2);
 assert.deepEqual([h[0].day,h[0].left,h[0].right,h[0].winners,h[0].paid],[20261118,5,5,["left","right"],6]);
 assert.equal(W.history(1).length,1);
});

test("week orders by useful desc then reachedAt asc, summing the week's days only",()=>{
 const {W}=fresh();
 // 2026-11-16 is a Monday, 2026-11-22 the Sunday; 2026-11-23 starts the next week.
 const wk=weekOf(20261118);
 assert.equal(weekOf(20261116),wk);assert.equal(weekOf(20261122),wk);assert.notEqual(weekOf(20261123),wk);
 W.noteColleur(20261116,1,"left",true,NOW);
 W.noteColleur(20261117,1,"left",true,NOW+10);
 W.noteColleur(20261117,2,"right",true,NOW+5);
 W.noteColleur(20261118,2,"right",true,NOW+20);
 W.noteColleur(20261118,3,"right",true,NOW+1);
 W.noteColleur(20261118,4,"left",false,NOW);
 W.noteColleur(20261123,5,"left",true,NOW);
 assert.deepEqual(W.week(wk),[
  {playerId:1,useful:2,reachedAt:NOW+10},
  {playerId:2,useful:2,reachedAt:NOW+20},
  {playerId:3,useful:1,reachedAt:NOW+1}]);
 assert.deepEqual(W.week(wk+5),[]);
});

test("title is the previous week's, shown the following week",()=>{
 const {W}=fresh();
 const wk=weekOf(20261118);
 assert.equal(W.title(NOW),null);
 W.setTitle(wk,7);
 assert.equal(W.title(NOW),null);   // same week: not yet
 assert.deepEqual(W.title(NOW+7*24*HOUR),{playerId:7,weekKey:wk});
 assert.equal(W.title(NOW+14*24*HOUR),null);
});

test("removePlayer keeps posters as « ancien élu » and deletes day and title rows",()=>{
 const {W,db}=fresh();
 W.paste(0,cell({by:1,name:"Ana"}));W.paste(1,cell({by:2,name:"Bob"}));
 W.noteColleur(20261118,1,"left",true,NOW);W.noteColleur(20261118,2,"left",true,NOW);
 W.setTitle(weekOf(20261118),1);
 W.removePlayer(1);
 const r=W.cells(NOW);
 assert.equal(r[0].by,null);assert.equal(r[0].name,"ancien élu");assert.equal(r[0].camp,"left");
 assert.equal(r[1].by,2);assert.equal(r[1].name,"Bob");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM wall_days WHERE player_id=1").get().n,0);
 assert.deepEqual(W.colleurs(20261118,"left"),[2]);
 assert.equal(W.title(NOW+7*24*HOUR),null);
});
