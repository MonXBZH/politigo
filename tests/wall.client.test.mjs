// Tests for the shared wall rules (web/wall.mjs): pure, no DOM, no server (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as W from "../web/wall.mjs";
import {EVENT_GAMES,NO_FX} from "../web/events.mjs";

const H=W.HOUR,now=1000*H,C=W.WALL_CELLS;
const empty=()=>Array(C).fill(null);
const P=(camp,sol,ageHours,by="X",extra={})=>({camp,by,name:by,vol:false,sol,at:now-ageHours*H,motif:7,...extra});
const full=(n,camp="left")=>Array(n*C).fill(0).map(()=>P(camp,2,1));

test("grid and quota",()=>{
 assert.equal(W.WALL_CELLS,48);assert.equal(W.MAX_WALLS,5);assert.equal(W.DAILY_QUOTA,5);
 assert.equal(W.cellName(0),"A1");assert.equal(W.cellName(47),"H6");assert.equal(W.cellName(50),"C1");
 assert.equal(W.wallOf(50),1);assert.equal(W.cellLabel(50),"mur 2, C1");
});

test("brush: deterministic, auto-stop and too-fast stops are bacle, three qualities exist",()=>{
 assert.equal(W.brushPos(42,700),W.brushPos(42,700));
 assert.equal(W.brushQuality(42,W.BRUSH_MS),"bacle");
 assert.equal(W.brushQuality(42,5000),"bacle");
 assert.equal(W.brushQuality(42,100),"bacle");
 assert.equal(W.brushQuality(42,NaN),"bacle");
 for(let s=0;s<20;s++){
  const seen=new Set();for(let ms=W.BRUSH_MIN_MS;ms<W.BRUSH_MS;ms+=5)seen.add(W.brushQuality(s,ms));
  assert.deepEqual([...seen].sort(),["bacle","bon","parfait"],`seed ${s}`);
  assert.ok(Math.abs(W.brushPos(s,0)-0.5)>0.25,"starts near an edge");
 }
 assert.deepEqual([W.SOLIDITY.parfait,W.SOLIDITY.bon,W.SOLIDITY.bacle],[3,2,1]);
 assert.deepEqual([W.XP.parfait,W.XP.bon,W.XP.bacle],[14,10,5]);
 assert.ok(W.brushTimeOk(1200,1300));assert.ok(!W.brushTimeOk(100,1300));assert.ok(!W.brushTimeOk(2900,1000));
});

test("paste effects: pose, refresh, damage, capture",()=>{
 let r=W.pasteEffect(null,{camp:"left",quality:"bon",by:"A",name:"Ann",now,motif:4});
 assert.equal(r.outcome,"posee");
 assert.deepEqual(r.cell,{camp:"left",by:"A",name:"Ann",vol:false,sol:2,at:now,motif:4});
 r=W.pasteEffect(P("left",3,30),{camp:"left",quality:"bacle",by:"B",name:"Bob",now});
 assert.equal(r.outcome,"rafraichie");assert.equal(r.cell.sol,3);assert.equal(r.cell.at,now);
 assert.equal(r.cell.by,"B");assert.equal(r.cell.name,"Bob");assert.equal(r.cell.motif,7);
 r=W.pasteEffect(P("left",1,30),{camp:"left",quality:"parfait",by:"B",now});assert.equal(r.cell.sol,3);
 r=W.pasteEffect(P("right",3,5),{camp:"left",quality:"parfait",by:"A",now});
 assert.equal(r.outcome,"abimee");assert.equal(r.cell.sol,2);assert.equal(r.cell.camp,"right");assert.equal(r.cell.at,now-5*H);
 r=W.pasteEffect(P("right",1,5),{camp:"left",quality:"bacle",by:"A",name:"Ann",now,motif:9});
 assert.equal(r.outcome,"prise");
 assert.deepEqual(r.cell,{camp:"left",by:"A",name:"Ann",vol:false,sol:1,at:now,takenFrom:"right",takenAt:now,motif:9});
 r=W.pasteEffect(null,{camp:"right",quality:"bon",now,vol:true,motif:1});
 assert.deepEqual(r.cell,{camp:"right",by:null,name:null,vol:true,sol:2,at:now,motif:1});
});

test("paste effects: a 3 resists two pastes, expired counts as empty, useful outcomes",()=>{
 let w=empty();w[5]=P("right",3,1);
 for(const o of ["abimee","abimee","prise"]){const x=W.applyPaste(w,5,{camp:"left",quality:"bon",by:"A",now});assert.equal(x.outcome,o);w=x.wall;}
 assert.equal(w[5].camp,"left");
 assert.equal(W.pasteEffect(P("right",3,48),{camp:"left",quality:"bon",now}).outcome,"posee");
 assert.ok(W.isUseful("posee")&&W.isUseful("prise")&&!W.isUseful("rafraichie")&&!W.isUseful("abimee"));
});

test("wear stages and freeing",()=>{
 assert.equal(W.wearStage(P("left",2,0),now),"nette");assert.equal(W.wearStage(P("left",2,23.9),now),"nette");
 assert.equal(W.wearStage(P("left",2,24),now),"palie");assert.equal(W.wearStage(P("left",2,43.9),now),"palie");
 assert.equal(W.wearStage(P("left",2,44),now),"dechiree");assert.equal(W.wearStage(P("left",2,48),now),"libre");
 const w=empty();w[0]=P("left",3,47.9);w[1]=P("left",3,48);
 const f=W.freeExpired(w,now);assert.deepEqual(f.freed,[1]);assert.ok(f.wall[0]&&!f.wall[1]);assert.ok(w[1],"pure");
});

test("wall queue: opening, closing, scoring across walls",()=>{
 const walls=cells=>W.settleWalls(cells,now).cells.length/C;
 assert.equal(walls(full(1)),2,"a full wall opens the next");
 assert.equal(walls(full(2)),3);
 assert.equal(walls(full(5)),5,"at most 5 walls");
 assert.equal(walls(empty()),1,"wall 1 always exists");
 assert.equal(walls([]),1);
 let q=full(1).concat(empty());assert.equal(walls(q),2,"the opened wall stays while wall 1 is full");
 q=full(1);q[3]=null;q=q.concat(empty());assert.equal(walls(q),1,"the last wall goes when it is empty");
 q=empty().concat(full(1));q[C+5]=null;assert.equal(walls(q),2,"an empty wall 1 stays while wall 2 is occupied");
 q=full(1);q[0]=null;q=q.concat(empty(),empty());assert.equal(walls(q),1,"every trailing empty wall goes");
 q=full(1);q[0]=null;q=q.concat(Array(C).fill(null));q[C+2]=P("right",3,47.9);
 assert.equal(walls(q),2);
 const later=W.settleWalls(q,now+0.2*H);assert.equal(later.cells.length,C,"its last poster expires: the wall vanishes");
 assert.deepEqual(later.freed,[C+2]);
 q=W.settleWalls(full(1,"right"),now).cells;
 assert.equal(W.applyPaste(q,7,{camp:"left",quality:"bon",by:"A",now}).outcome,"abimee");
 q=full(1,"left").concat(empty());q[C]=P("right",2,1);q[C+1]=P("right",2,1);
 assert.deepEqual(W.countWall(q,now),{left:48,right:2,empty:46});
 assert.deepEqual(W.wallScore(q,1,now),{left:0,right:2,empty:46});
 assert.equal(W.firstOpenWall(q,now),1);assert.equal(W.firstOpenWall(full(2),now),0);
 q=empty().concat(full(1));assert.equal(W.firstOpenWall(q,now),0);
});

test("night scoring: active colleur rule, ties, line",()=>{
 const n=(l,ri,al,ar)=>W.scoreNight({left:l,right:ri},{left:al,right:ar});
 assert.deepEqual(n(58,41,3,2).winners,["left"]);
 assert.equal(n(58,41,3,2).line,"🖌️ La Gauche a tenu le mur cette nuit (58 cases contre 41).");
 assert.deepEqual(n(40,40,1,1).winners,["left","right"]);
 assert.match(n(40,40,1,1).line,/Égalité/);
 assert.deepEqual(n(0,0,1,1).winners,[]);
 assert.deepEqual(n(10,90,1,0).winners,["left"],"only the camp that pasted can win");
 assert.match(n(10,90,1,0).line,/la Droite n'a pas collé/);
 assert.deepEqual(n(0,90,1,0).winners,[],"...if it holds a cell");
 const none=n(30,60,0,0);assert.deepEqual(none.winners,[]);assert.equal(none.line,null);
});

test("volunteers: count min(A-B,B), prorated budget",()=>{
 assert.deepEqual(W.volunteerCounts({left:7,right:3}),{left:0,right:3});
 assert.deepEqual(W.volunteerCounts({left:6,right:5}),{left:0,right:1});
 assert.deepEqual(W.volunteerCounts({left:2,right:9}),{left:2,right:0});
 assert.deepEqual(W.volunteerCounts({left:5,right:0}),{left:0,right:0});
 assert.deepEqual(W.volunteerCounts({left:4,right:4}),{left:0,right:0});
 let slots=[],total=0;
 for(let i=0;i<W.WAVE_HOURS.length;i++){const p=W.planWave(slots,1,i);slots=p.slots;total+=p.posters;}
 assert.equal(total,5);
 assert.deepEqual(W.planWave([],1,W.WAVE_HOURS.length-1),{slots:[0],posters:1});
 assert.equal(W.planWave([1,1],3,3).posters,3);
});

test("volunteers: target order and deterministic ties",()=>{
 const w=empty().map(()=>P("right",2,1,"Y"));
 w[10]=P("right",1,2,"Y");
 assert.deepEqual(W.pickVolunteerTarget(w,"left",now,1),{idx:10,reason:"attaque"});
 w[20]=null;assert.equal(W.pickVolunteerTarget(w,"left",now,1).reason,"libre");
 w[30]=P("right",3,3,"Y",{takenFrom:"left",takenAt:now-3*H});
 assert.deepEqual(W.pickVolunteerTarget(w,"left",now,1),{idx:30,reason:"reprise"});
 w[31]=P("right",3,30,"Y",{takenFrom:"left",takenAt:now-30*H});
 assert.equal(W.pickVolunteerTarget(w,"left",now,1).idx,30);
 w[40]=P("left",1,2,"Z");
 assert.deepEqual(W.pickVolunteerTarget(w,"left",now,1),{idx:40,reason:"menacee"});
 w[41]=P("left",3,45,"Z");
 assert.equal(W.pickVolunteerTarget(w,"left",now,1).idx,41);
 const e=empty(),picks=new Set();
 for(let s=0;s<30;s++){const a=W.pickVolunteerTarget(e,"left",now,s).idx;assert.equal(W.pickVolunteerTarget(e,"left",now,s).idx,a);picks.add(a);}
 assert.ok(picks.size>5);
 let q=full(1,"left");q[30]=null;q=q.concat(empty());
 assert.deepEqual(W.pickVolunteerTarget(q,"left",now,3),{idx:30,reason:"libre"});
});

test("volunteers: a wave pastes bon, by nobody, and opens the next wall",()=>{
 const v=W.runVolunteers(empty(),{camp:"right",posters:3,now,seed:"d"});
 assert.equal(v.actions.length,3);assert.equal(new Set(v.actions.map(a=>a.idx)).size,3);
 for(const a of v.actions){
  const c=v.wall[a.idx];
  assert.deepEqual({...c,motif:0},{camp:"right",by:null,name:null,vol:true,sol:2,at:now,motif:0});
  assert.ok(Number.isInteger(c.motif));
 }
 assert.deepEqual(W.runVolunteers(empty(),{camp:"right",posters:3,now,seed:"d"}),v,"deterministic");
 let q=full(1,"left");q[30]=null;q=W.settleWalls(q,now).cells;
 const fill=W.runVolunteers(q,{camp:"left",posters:2,now,seed:"s"});
 assert.equal(fill.actions[0].idx,30);assert.equal(W.wallOf(fill.actions[1].idx),1);assert.equal(fill.wall.length,2*C);
});

test("weekly title: poses and captures only, tie goes to the earliest",()=>{
 const ev=[
  {who:"A",at:1,outcome:"posee"},{who:"B",at:2,outcome:"prise"},{who:"A",at:3,outcome:"rafraichie"},
  {who:"A",at:4,outcome:"abimee"},{who:"B",at:5,outcome:"posee"},{who:"A",at:6,outcome:"prise"},{who:null,at:0,outcome:"posee"}];
 assert.deepEqual(W.weeklyChampion(ev),{who:"B",score:2,reachedAt:5});
 assert.equal(W.weeklyChampion([]),null);
});

test("weekOf: Monday-start weeks of the server day key",()=>{
 assert.equal(W.weekOf(20261123),W.weekOf(20261129),"Monday and Sunday of one week");
 assert.equal(W.weekOf(20261119),W.weekOf(20261123-7),"Thursday shares the previous Monday's week");
 assert.equal(W.weekOf(20261122)+1,W.weekOf(20261123),"Sunday and next Monday differ by one");
 assert.equal(W.weekOf(20261201)-W.weekOf(20261124),1,"across a month end");
 assert.equal(W.weekOf(20270104)-W.weekOf(20261228),1,"across a year end");
 assert.equal(W.weekOf(19700105),0);assert.equal(W.weekOf(19700104),-1);
 assert.equal(W.weekOf(20240229),W.weekOf(20240226),"leap day");
});

test("wallBlock: level and quota only",()=>{
 assert.equal(W.wallBlock({lvl:2},{minLevel:3,used:0}),"La Nuit du collage s'ouvre au niveau 3.");
 assert.equal(W.wallBlock({lvl:3},{minLevel:3,used:5}),"Plus d'affiche aujourd'hui : reviens demain.");
 assert.equal(W.wallBlock({lvl:3},{minLevel:3,used:4}),"");
 assert.equal(W.wallBlock({lvl:12},{minLevel:3,used:0}),"");
 assert.equal(W.wallBlock({lvl:2},{minLevel:3,used:9}),"La Nuit du collage s'ouvre au niveau 3.","level first");
});

test("the wall is an event game, without bonus by default",()=>{
 assert.ok(EVENT_GAMES.some(g=>g[0]==="wall"&&g[1]==="Nuit du collage"));
 assert.equal(NO_FX.xp.wall,1);
});

test("module is pure: no clock, no random, no DOM",()=>{
 const src=readFileSync(new URL("../web/wall.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(src,/Date\.now|Math\.random|document\.|window\./);
});
