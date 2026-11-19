// The Collage screen (web/wallui.mjs): the pure pieces behind the « wall » sheet in app.js. The wall's drawing on a mock
// 2D context, what the info panel and the result card say, the navigation line, the gauge, the Jeux tile, the keys,
// and the sheet's state reducer (live updates never move the selection nor stop the brush). node --test, no DOM.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as U from "../web/wallui.mjs";
import * as W from "../web/wall.mjs";

const H=W.HOUR,now=1000*H,C=W.WALL_CELLS;
const P=(camp,sol,ageHours,name="Mathis",extra={})=>({camp,by:name?7:null,name,vol:false,sol,at:now-ageHours*H,motif:5,...extra});
const ME={name:"Camille",camp:"left"};
// A 2D context that records every pixel written: fillRect and drawImage, with the clip in force (save/restore).
function mockCtx(){
 const ops=[];let clip=null;const stack=[];
 return {ops,fillStyle:"#000",imageSmoothingEnabled:true,
  fillRect(x,y,w,h){ops.push({x,y,w,h,col:this.fillStyle,clip});},
  drawImage(){ops.push({img:true});},
  save(){stack.push(clip);},restore(){clip=stack.pop()??null;},beginPath(){},rect(x,y,w,h){clip={x,y,w,h};},clip(){}};
}

// ---------------------------------------------------------------- navLabel
test("navLabel: the wall on view, the count of walls and its score",()=>{
 const cells=[...Array(C).fill(0).map(()=>P("left",2,1)),...Array(26).fill(0).map(()=>P("left",2,1)),...Array(14).fill(0).map(()=>P("right",2,1)),...Array(8).fill(null),...Array(C).fill(null)];
 assert.equal(U.navLabel(cells,1,now),"Mur 2 / 3 · G 26 · D 14");
 assert.equal(U.navLabel(cells,0,now),"Mur 1 / 3 · G 48 · D 0");
 assert.equal(U.navLabel(Array(C).fill(null),0,now),"Mur 1 / 1 · G 0 · D 0");
 const old=[P("right",3,49),...Array(C-1).fill(null)];
 assert.equal(U.navLabel(old,0,now),"Mur 1 / 1 · G 0 · D 0","an expired poster counts as empty");
});

// ---------------------------------------------------------------- cellInfo
test("cellInfo: who pasted it, how long ago, its solidity and wear, what a paste would do",()=>{
 const l=U.cellInfo(P("right",3,5,"Mathis"),now,ME);
 assert.equal(l[0],"Affiche de la Droite");
 assert.ok(l.includes("Collée par Mathis il y a 5 h"),l.join(" | "));
 assert.ok(l.includes("Solidité 3/3 · nette"));
 assert.ok(l.some(t=>t.startsWith("Libérée dans 43 h")));
 assert.ok(l.includes("Coller ici : −1 point (elle résiste encore à 2 collages)."));
 assert.ok(U.cellInfo(P("left",1,30,"Camille"),now,ME).includes("Collée par toi il y a 30 h"));
 assert.ok(U.cellInfo(P("left",1,30,"Camille"),now,ME).includes("Solidité 1/3 · pâlie"));
 assert.ok(U.cellInfo(P("left",1,30,"Léa"),now,ME).some(t=>t.startsWith("Coller ici : la rafraîchir")));
 assert.ok(U.cellInfo(P("right",1,45),now,ME).includes("Solidité 1/3 · déchirée"));
 assert.ok(U.cellInfo(P("right",1,45),now,ME).includes("Coller ici : elle tombe, la case passe à ton camp."));
 const vol=U.cellInfo(P("right",2,2,null,{vol:true}),now,ME);
 assert.ok(vol.includes("Bénévole · collée il y a 2 h"),vol.join(" | "));
 const gone=U.cellInfo(P("right",2,2,"ancien élu",{by:null}),now,ME);
 assert.ok(gone.includes("Collée par un ancien élu il y a 2 h"),gone.join(" | "));
 assert.deepEqual(U.cellInfo(null,now,ME).slice(0,1),["Case libre"]);
 assert.deepEqual(U.cellInfo(P("left",3,48.5),now,ME).slice(0,1),["Case libre"],"an expired poster is a free cell");
 const lost=U.cellInfo(P("right",2,3,"Mathis",{takenFrom:"left",takenAt:now-3*H}),now,ME);
 assert.ok(lost.includes("Prise à la Gauche il y a 3 h."));
 assert.ok(!U.cellInfo(P("right",2,30,"Mathis",{takenFrom:"left",takenAt:now-30*H}),now,ME).some(t=>t.startsWith("Prise")),"an old capture is not news");
 assert.ok(U.cellInfo(P("right",2,0.5),now,ME).includes("Collée par Mathis il y a 30 min"));
});
test("dur: minutes, hours and minutes, hours",()=>{
 assert.equal(U.dur(5*60e3),"5 min");assert.equal(U.dur(0),"1 min");
 assert.equal(U.dur(90*60e3),"1 h 30");assert.equal(U.dur(5*H),"5 h");assert.equal(U.dur(43.2*H),"43 h");
});

// ---------------------------------------------------------------- the gauge
test("gaugeX is the brush position, in percent of the gauge",()=>{
 for(const seed of [0,1,42,123456,2**32-1])for(const ms of [0,250,777,1500,2999,3000,5000])
  assert.equal(U.gaugeX(seed,ms),W.brushPos(seed,ms)*100);
});

// ---------------------------------------------------------------- the drawing
test("every motif × wear stage draws inside its own cell, and only there",()=>{
 assert.equal(U.MOTIFS.length,8);assert.equal(U.CW,137);assert.equal(U.CH,103);
 for(let m=0;m<8;m++)for(const [age,stage] of [[1,"nette"],[30,"palie"],[45,"dechiree"]])for(const vol of [false,true]){
  const cell={...P(m<4?"left":"right",1+m%3,age,vol?null:"X",{vol}),motif:m%4};
  assert.equal(W.wearStage(cell,now),stage);
  const c=mockCtx(),ox=1+3*U.CELL,oy=1+2*U.CELL;U.drawPoster(c,ox,oy,cell,now);
  assert.ok(c.ops.length>20,`motif ${m} ${stage} draws`);
  for(const o of c.ops)assert.ok(o.x>=ox&&o.y>=oy&&o.x+o.w<=ox+U.ART&&o.y+o.h<=oy+U.ART,`motif ${m} ${stage}: ${JSON.stringify(o)} outside`);
 }
 assert.equal(U.motifIndex({camp:"left",motif:6}),2);assert.equal(U.motifIndex({camp:"right",motif:6}),6);
 assert.equal(U.motifIndex({camp:"right"}),4,"no motif: the camp's first");
});
test("wear changes the colours, never the solidity bars; a volunteer has its gold corner",()=>{
 const cols=cell=>{const c=mockCtx();U.drawPoster(c,0,0,cell,now);return c.ops;};
 const fresh=cols(P("left",2,1)),pale=cols(P("left",2,30));
 assert.notEqual(fresh[0].col,pale[0].col,"the paper fades");
 const pips=ops=>ops.filter(o=>o.y===14&&o.w===2&&o.h===2).map(o=>o.col===U.PIP_ON);
 assert.deepEqual(pips(fresh),[true,true,false]);assert.deepEqual(pips(pale),[true,true,false]);
 assert.deepEqual(pips(cols(P("left",3,45))),[true,true,true]);
 assert.ok(cols(P("left",2,1,null,{vol:true})).some(o=>o.col==="#ffd23f"),"volunteer corner");
 assert.ok(!cols(P("left",2,1,"ancien élu",{by:null})).some(o=>o.col==="#ffd23f"),"a deleted player's poster is no volunteer's");
});
test("drawWall: the wall on view only, the selection framed, an unrolling poster clipped to its cell",()=>{
 const cells=[...Array(C).fill(null),P("left",2,1),...Array(C-1).fill(null)];
 const c=mockCtx();U.drawWall(c,cells,1,now,{sel:C+9});
 for(const o of c.ops)if(!o.img)assert.ok(o.x>=0&&o.y>=0&&o.x+o.w<=U.CW&&o.y+o.h<=U.CH,JSON.stringify(o));
 assert.ok(c.ops.some(o=>o.col===U.SEL_COL&&o.x===U.CELL&&o.y===U.CELL),"frame around B2");
 const d=mockCtx();U.drawWall(d,cells,0,now,{sel:C+9});
 assert.ok(!d.ops.some(o=>o.col===U.SEL_COL),"the selection is on another wall");
 const e=mockCtx();U.drawWall(e,cells,1,now,{unroll:{g:C,prev:null,p:0.5}});
 assert.ok(e.ops.some(o=>o.clip&&o.clip.h===8&&o.clip.x===1&&o.clip.y===1),"half the poster");
 const f=mockCtx();U.drawWall(f,cells,1,now,{flash:new Set([C+2]),flashOn:true});
 assert.ok(f.ops.some(o=>o.col===U.FLASH_COL));
 const g=mockCtx();U.drawWall(g,cells,1,now,{bg:{}});
 assert.ok(g.ops[0].img,"a ready brick wall is copied, not redrawn");assert.ok(!g.ops.some(o=>o.col==="#1d1619"&&o.w===U.CW));
 const b=mockCtx();U.drawBricks(b);
 for(const o of b.ops.slice(1))assert.equal(o.col,U.brickColor(o.x,o.y),"the bricks match brickColor");
});
test("cellAt: a point on the canvas to a cell of the wall, the gaps and borders around to none",()=>{
 assert.equal(U.cellAt(1.5/U.CW,1.5/U.CH),0);
 assert.equal(U.cellAt((1+7*U.CELL+8)/U.CW,(1+5*U.CELL+8)/U.CH),47);
 assert.equal(U.cellAt(0.2/U.CW,0.5),-1);assert.equal(U.cellAt(1.2,0.5),-1);assert.equal(U.cellAt(0.5,-0.1),-1);
});

// ---------------------------------------------------------------- the keys
test("moveSel: arrows stay inside the wall on view, Home and End go to the row's ends",()=>{
 assert.equal(U.moveSel(null,1,"ArrowRight"),C+1,"no selection yet: from the first cell");
 assert.equal(U.moveSel(C,1,"ArrowLeft"),C);assert.equal(U.moveSel(C,1,"ArrowUp"),C);
 assert.equal(U.moveSel(C+7,1,"ArrowRight"),C+7);assert.equal(U.moveSel(C+7,1,"ArrowDown"),C+15);
 assert.equal(U.moveSel(C+47,1,"ArrowDown"),C+47);
 assert.equal(U.moveSel(C+10,1,"Home"),C+8);assert.equal(U.moveSel(C+10,1,"End"),C+15);
 assert.equal(U.moveSel(5,1,"ArrowRight"),C+6,"a selection on another wall moves on the wall on view");
 assert.equal(U.moveSel(5,0,"Enter"),null,"not a move");
});

// ---------------------------------------------------------------- the reducer
const data=(o={})=>({cells:[...Array(C).fill(0).map(()=>P("left",2,1)),P("right",2,1),...Array(C-1).fill(null)],walls:2,counts:{left:48,right:1},left:4,active:{left:1,right:1},volunteers:{left:0,right:0},attempt:null,title:null,closesAt:now+5*H,now,...o});
test("wallState: the first load opens on the first wall with room, selects its first free cell",()=>{
 const s=U.wallState(null,{type:"load",data:data(),now});
 assert.equal(s.view,1);assert.equal(s.sel,C+1);assert.equal(s.left,4);assert.equal(s.walls,2);assert.equal(s.brush,null);
 const again=U.wallState({...s,view:0,sel:3},{type:"load",data:data(),now});
 assert.equal(again.view,0,"a reload keeps the wall on view");assert.equal(again.sel,3);
});
test("wall updates during a brush keep selection and focus",()=>{
 let s=U.wallState(null,{type:"load",data:data(),now});
 s=U.wallState(s,{type:"select",g:C+5});
 s=U.wallState(s,{type:"start",brush:{id:"a",seed:9,g:C+5,t0:100}});
 const b=s.brush,cells=data().cells.slice();cells[C+20]=P("right",3,0);
 const t=U.wallState(s,{type:"live",cells,counts:{left:48,right:2},walls:2,now});
 assert.equal(t.sel,C+5);assert.equal(t.view,1);assert.equal(t.brush,b,"the very same brush");
 assert.equal(t.counts.right,2);assert.equal(t.cells[C+20].camp,"right");
 const u=U.wallState(t,{type:"load",data:data({counts:{left:48,right:3}}),now});
 assert.equal(u.brush,b,"a reload neither");assert.equal(u.sel,C+5);
 assert.equal(U.wallState(t,{type:"view",d:-1}),t,"no wall change mid-brush");
 assert.equal(U.wallState(t,{type:"select",g:3}),t,"no other cell mid-brush");
 assert.equal(U.wallState(t,{type:"key",key:"ArrowLeft"}),t);
});
test("wallState: a wall vanishing under the view moves it back, the selection with it",()=>{
 let s=U.wallState(null,{type:"load",data:data(),now});s=U.wallState(s,{type:"select",g:C+30});
 const t=U.wallState(s,{type:"live",cells:Array(C).fill(null),counts:{left:0,right:0},walls:1,now});
 assert.equal(t.view,0);assert.equal(t.sel,30);
});
test("wallState: view, select, key, start, stop, fail",()=>{
 let s=U.wallState(null,{type:"load",data:data(),now});
 assert.equal(U.wallState(s,{type:"view",d:1}),s,"no wall after the last");
 s=U.wallState(s,{type:"view",d:-1});assert.equal(s.view,0);assert.equal(s.sel,1,"the selection follows, same place");
 s=U.wallState(s,{type:"key",key:"ArrowDown"});assert.equal(s.sel,9);
 s=U.wallState(s,{type:"select",g:C+2});assert.equal(s.view,1,"selecting shows its wall");
 s=U.wallState(s,{type:"start",brush:{id:"a",seed:1,g:C+2,t0:0}});assert.equal(s.result,null);
 const cell=P("left",3,0,"Camille");
 const r={quality:"parfait",outcome:"posee",g:C+2,cell,xp:14,left:3,ms:1200};
 s=U.wallState(s,{type:"stop",res:r});
 assert.equal(s.brush,null);assert.equal(s.left,3);assert.equal(s.cells[C+2],cell);assert.equal(s.result.res,r);assert.equal(s.result.prev,null);
 const full=U.wallState(s,{type:"stop",res:{...r,opened:2}});assert.equal(full.cells.length,3*C,"the next wall opens at once");
 const f=U.wallState(U.wallState(s,{type:"start",brush:{id:"b",seed:1,g:C+2,t0:0}}),{type:"fail"});
 assert.equal(f.brush,null);
});
test("changedCells: what a live update changed on the walls",()=>{
 const a=data().cells,b=a.slice();b[3]={...b[3],sol:3};b[C+4]=P("right",1,0);
 assert.deepEqual(U.changedCells(a,b),[3,C+4]);
 assert.deepEqual(U.changedCells(a,a.slice(0,C)),[]);
 assert.deepEqual(U.changedCells(null,a),[]);
});

// ---------------------------------------------------------------- texts
test("resultLines: the quality, what happened to the cell, the XP",()=>{
 const n="mur 2, C1",g=C+2;
 assert.deepEqual(U.resultLines({quality:"parfait",outcome:"posee",g,cell:{sol:3},xp:14},null),["Parfait !",`Affiche posée en ${n}, solidité 3.`,"+14 XP"]);
 assert.equal(U.resultLines({quality:"bon",outcome:"rafraichie",g,cell:{sol:2},xp:10},{sol:2})[1],`Affiche de ton camp rafraîchie en ${n} : son âge repart de zéro, solidité 2 → 2.`);
 assert.equal(U.resultLines({quality:"bacle",outcome:"abimee",g,cell:{sol:2},xp:5,ms:3000},null)[0],"Bâclé… (pinceau arrêté tout seul à 3 s)");
 assert.equal(U.resultLines({quality:"bacle",outcome:"abimee",g,cell:{sol:2},xp:5},null)[1],`−1 point à l'affiche adverse en ${n} : il lui reste 2 (encore 2 collages pour la prendre).`);
 assert.equal(U.resultLines({quality:"bon",outcome:"prise",g,cell:{sol:2,camp:"right"},xp:15},null)[1],`Case prise ! ${n} passe à la Droite, ton affiche a une solidité de 2.`);
 assert.equal(U.resultLines({quality:"bon",outcome:"posee",g,cell:{sol:2},xp:10,opened:2},null)[3],"Le mur 2 est plein : le mur 3 s'ouvre !");
});
test("quotaText and tile: the posters left, the day and night names, the night hint",()=>{
 assert.equal(U.quotaText(3),"Il te reste 3 affiches aujourd'hui");assert.equal(U.quotaText(1),"Il te reste 1 affiche aujourd'hui");
 assert.equal(U.quotaText(0),"Plus d'affiche aujourd'hui : reviens demain.");
 const day=U.tile({counts:{left:26,right:14},left:5,hour:14,lvl:10});
 assert.equal(day.title,"🖌️ Collage");assert.equal(day.night,false);
 assert.equal(day.sub,"Gauche 26 · Droite 14 · 5 affiches à coller · XP ×1,5 la nuit");assert.equal(day.side,"5 ›");
 const night=U.tile({counts:null,left:0,hour:23,lvl:10});
 assert.equal(night.title,"🖌️ La Nuit du collage");assert.equal(night.night,true);
 assert.equal(night.sub,"Plus d'affiche aujourd'hui · XP ×1,5 cette nuit");assert.equal(night.side,"›");
 assert.equal(U.tile({counts:null,left:5,hour:9,lvl:2}).sub,"Dès le niveau 3 : colle les affiches de ton camp sur le mur commun.");
 assert.equal(U.nightHint(21),"🌙 XP ×1,5 cette nuit");assert.equal(U.nightHint(12),"XP ×1,5 la nuit (20 h – 8 h)");
});
