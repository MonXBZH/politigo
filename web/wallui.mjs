// Collage / La Nuit du collage on screen: the pure pieces behind the « wall » sheet (app.js). The pixel-art wall drawn on
// any 2D context (1 canvas unit = 1 art pixel), what the info panel, the result card and the Jeux tile say, the keys,
// and the sheet's state reducer. No DOM, no clock, no I/O: the caller passes `now` (server time, ms).
import * as W from "./wall.mjs";

const {WALL_W,WALL_H,WALL_CELLS:C,HOUR,CAMP_NAME}=W;
export const CELL=17,ART=16;                         // a cell = a 16×16 poster + a 1 px gap
export const CW=WALL_W*CELL+1,CH=WALL_H*CELL+1;      // one 8×6 wall: 137 × 103
export const PIP_ON="#fff2c4",SEL_COL="#ffd59a",FLASH_COL="#ffffff",HIT_COL="#ff5a6a";
const WASH="#cfc7b8",GOLD="#ffd23f",DARK="#2a1c05",PAPER="#e9dfc6";
const rect=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x,y,w,h);};
const hex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
const mix=(a,b,t)=>{const A=hex(a),B=hex(b);return "#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("");};
const plural=(n,w,ws=w+"s")=>`${n} ${n>1?ws:w}`;
const frNum=v=>String(v).replace(".",",");

// ---------------------------------------------------------------- the wall behind: dark bricks (4 px rows, 8 px bricks)
const BRICKS=["#3b2a2b","#43302f","#352627"],MORTAR="#1d1619";
export function brickColor(x,y){
 const row=Math.floor(y/4);if(y%4===3)return MORTAR;
 const off=row%2?4:0;if((x+off)%8===7)return MORTAR;
 return BRICKS[W.hash32(row,Math.floor((x+off)/8))%3];
}
// The same bricks as brickColor, a rectangle per brick instead of a pixel at a time.
export function drawBricks(c){
 rect(c,0,0,CW,CH,MORTAR);
 for(let r=0;r*4<CH;r++){
  const y=r*4,h=Math.min(3,CH-y),off=r%2?4:0;
  for(let k=0;8*k-off<CW;k++){const x0=Math.max(0,8*k-off),x1=Math.min(CW,8*k-off+7);if(x1>x0)rect(c,x0,y,x1-x0,h,BRICKS[W.hash32(r,k)%3]);}
 }
}

// ---------------------------------------------------------------- the posters
// Eight motifs on a 14×12 grid (no letters): four per camp. Keys: palette entries; "." = the poster's paper.
export const MOTIFS=[
 {name:"le poing levé",pal:{bg:"#c8283a",f:"#f6dcc0",s:"#d9a98a",d:"#6e1220",a:"#2b2b38",c:"#f2e8cd",band:"#6e1220"},rows:[
  ".....ff.ff....","....fffffff...","...fffsffsfff.","...ffsffsffsf.","...fffffffffs.","..sssssfffffs.",
  "..ffffffsfffs.","...fffffffff..","....ffffffs...","....cccccc....","....aaaaaa....","....aaaaaa...."]},
 {name:"la rose",pal:{bg:"#f4a3b6",a:"#d42a4a",d:"#8a1430",l:"#3f8a4e",band:"#9b2f4c"},rows:[
  "..............",".....aaaa.....","....aadaaa....","...aadaadaa...","...adaddada...","...aaddddaa...",
  "....aaaaaa....","......l...ll..","..ll..l..lll..","..lll.l.ll....","....lll.......","......l......."]},
 {name:"le mégaphone",pal:{bg:"#e2463c",f:"#f2e8cd",d:"#5a1020",band:"#7a1a22"},rows:[
  "..............","..........f...","........fff.f.","......fffff..f","dddfffffffff.f","dddfffffffff.f",
  "......fffff..f","........fff.f.","..........f...","....dd........","....dd........","....ddd......."]},
 {name:"l'étoile",pal:{bg:"#9e1b32",g:"#f4c84a",band:"#5e0f1e"},rows:[
  "......gg......","......gg......",".....gggg.....","gggggggggggggg",".gggggggggggg.","..gggggggggg..",
  "...gggggggg...","...gggggggg...","..gggg..gggg..","..ggg....ggg..",".gg........gg.",".............."]},
 {name:"la cocarde",pal:{bg:"#1b2f6b",b:"#4f86e6",w:"#f4f1ea",r:"#d42a2a",band:"#101d48"},rows:[
  "....bbbbbb....","..bbbbbbbbbb..",".bbbwwwwwwbbb.",".bbwwwwwwwwbb.",".bbwwwrrwwwbb.",".bbwwrrrrwwbb.",
  ".bbwwrrrrwwbb.",".bbwwwrrwwwbb.",".bbbwwwwwwbbb.","..bbbbbbbbbb..","....bb..rr....","...bb....rr..."]},
 {name:"le lys",pal:{bg:"#14275a",g:"#f4c84a",band:"#0b173c"},rows:[
  "......gg......",".....gggg.....",".....gggg.....","..g...gg...g..",".ggg..gg..ggg.","gg.gg.gg.gg.gg",
  "g...gggggg...g","....gggggg....","......gg......","...gggggggg...",".....g..g.....","....gg..gg...."]},
 {name:"Marianne",pal:{bg:"#3d6fd0",w:"#f6e3cf",r:"#d42a2a",k:"#9e1b1b",d:"#1b2f6b",h:"#e8b84a",c:"#f4f1ea",band:"#203f86"},rows:[
  ".....rrrr.....","...rrrrrrrr...","..rrrrrrrrcr..",".rrkrrrrrrrrr.",".r..wwwwrhhhh.","...wwwwwwhhhhh",
  "..wwdwwwwhhhhh",".wwwwwwwwhhhh.","..wwwwwwwhhh..","...rwwwwwhhh..","....wwwwhh....",".....www......"]},
 {name:"la croix de Lorraine",pal:{bg:"#22407e",w:"#f4f1ea",r:"#d42a2a",band:"#132a5a"},rows:[
  "......ww......","...wwwwwwww...","......ww......","......ww......",".wwwwwwwwwwww.","......ww......",
  "......ww......","......ww......","......ww......","......ww......","....wwwwww....","..rrrrrrrrrr.."]}
];
// The cell's motif: one of its camp's four, from the number the server drew at the paste.
export const motifIndex=cell=>(cell.camp==="left"?0:4)+(((cell.motif|0)%4)+4)%4;
const palCache=new Map();
function palette(m,stage){
 const key=`${m}-${stage}`;if(palCache.has(key))return palCache.get(key);
 const t=stage==="palie"?0.45:stage==="dechiree"?0.6:0,p={};
 for(const [k,v] of Object.entries(MOTIFS[m].pal))p[k]=mix(v,WASH,t);
 p.pipOff=mix(p.band,"#000000",0.45);
 palCache.set(key,p);return p;
}
const TEAR_W=[6,4,3,2,1];                    // the torn top-left corner, row by row
const BITES=[[15,8],[15,9],[14,9],[15,10]];  // and a ragged right edge
// One poster at (ox, oy): motif, solidity bars at the bottom, a volunteer's gold corner « b », the tears of a old one.
// Wear only fades and tears: the bars always show the real solidity.
export function drawPoster(c,ox,oy,cell,now,stage=W.wearStage(cell,now)){
 const m=motifIndex(cell),p=palette(m,stage);
 rect(c,ox,oy,ART,ART,p.bg);
 MOTIFS[m].rows.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(row[x]!==".")rect(c,ox+1+x,oy+1+y,1,1,p[row[x]]);});
 rect(c,ox,oy+14,ART,2,p.band);
 for(let k=0;k<3;k++)rect(c,ox+1+k*3,oy+14,2,2,k<cell.sol?PIP_ON:p.pipOff);
 if(cell.vol){
  for(let y=0;y<6;y++){rect(c,ox+10+y,oy+y,6-y,1,GOLD);rect(c,ox+9+y,oy+y,1,1,DARK);}
  rect(c,ox+13,oy+1,1,2,DARK);rect(c,ox+14,oy+2,1,1,DARK);
 }
 if(stage==="dechiree"){
  TEAR_W.forEach((w,y)=>{for(let x=0;x<w;x++)rect(c,ox+x,oy+y,1,1,brickColor(ox+x,oy+y));rect(c,ox+w,oy+y,1,1,PAPER);});
  rect(c,ox,oy+5,1,1,PAPER);
  for(const [x,y] of BITES)rect(c,ox+x,oy+y,1,1,brickColor(ox+x,oy+y));
 }
}
// An empty cell: bricks, sometimes old paper scraps and glue.
export function drawScraps(c,ox,oy,g){
 const k=W.hash32("scrap",g)%5;
 if(k===0){rect(c,ox+2,oy+1,4,1,"#6f6458");rect(c,ox+3,oy+2,2,2,"#6f6458");}
 if(k===1){rect(c,ox+10,oy+11,3,2,"#5e554b");rect(c,ox+11,oy+10,1,1,"#5e554b");}
 if(k===2)rect(c,ox+1,oy+12,5,1,"#5a5046");
}
const frame=(c,ox,oy,col)=>{rect(c,ox-1,oy-1,ART+2,1,col);rect(c,ox-1,oy+ART,ART+2,1,col);rect(c,ox-1,oy-1,1,ART+2,col);rect(c,ox+ART,oy-1,1,ART+2,col);};
export const cellOrigin=i=>[1+(i%WALL_W)*CELL,1+Math.floor(i/WALL_W)*CELL];

// The wall w (0-based) of the flat cells. opts: sel (global index, framed), unroll {g, prev, p 0..1} (the new poster
// unrolls from the top over the previous one), flash (global indexes) with flashOn (framed now), hit (a cell just hit),
// bg (a canvas already holding drawBricks: copied instead of redrawn).
export function drawWall(c,cells,w,now,opts={}){
 if(opts.bg)c.drawImage(opts.bg,0,0);else drawBricks(c);
 const u=opts.unroll;
 for(let i=0;i<C;i++){
  const g=w*C+i,[ox,oy]=cellOrigin(i),cell=W.liveCell(cells[g],now);
  if(u&&u.g===g){
   const p=Math.min(1,Math.max(0,u.p)),h=Math.ceil(p*ART),prev=W.liveCell(u.prev,now);
   if(prev)drawPoster(c,ox,oy,prev,now);else drawScraps(c,ox,oy,g);
   if(cell&&h>0){c.save();c.beginPath();c.rect(ox,oy,ART,h);c.clip();drawPoster(c,ox,oy,cell,now);c.restore();}
   if(p<1&&h>0)rect(c,ox,oy+h-1,ART,1,"#fff6dd");
   continue;
  }
  if(cell)drawPoster(c,ox,oy,cell,now);else drawScraps(c,ox,oy,g);
 }
 const mark=(g,col)=>{if(g!=null&&W.wallOf(g)===w){const [ox,oy]=cellOrigin(g%C);frame(c,ox,oy,col);}};
 if(opts.flashOn&&opts.flash)for(const g of opts.flash)mark(g,FLASH_COL);
 if(opts.hit!=null)mark(opts.hit,HIT_COL);
 mark(opts.sel,SEL_COL);
}
// A point on the canvas (fractions 0..1 of its width and height) to a cell of the wall (0..47), -1 off the posters.
export function cellAt(fx,fy){
 if(!(fx>=0&&fx<1&&fy>=0&&fy<1))return -1;
 const px=fx*CW-1,py=fy*CH-1,x=Math.floor(px/CELL),y=Math.floor(py/CELL);
 if(px<0||py<0||x>=WALL_W||y>=WALL_H)return -1;
 return y*WALL_W+x;
}

// ---------------------------------------------------------------- the gauge
export const gaugeX=(seed,ms)=>W.brushPos(seed,ms)*100;   // the cursor's left, in % of the gauge

// ---------------------------------------------------------------- words
export function dur(ms){const m=Math.max(1,Math.round(ms/60000));return m<60?`${m} min`:m%60&&m<600?`${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")}`:`${Math.floor(m/60)} h`;}
export const STAGE={nette:"nette",palie:"pâlie",dechiree:"déchirée"};
export function navLabel(cells,w,now){
 const s=W.wallScore(cells,w,now);
 return `Mur ${w+1} / ${W.wallCount(cells)} · G ${s.left} · D ${s.right}`;
}
// The info panel's lines for a cell, for me = {name, camp}: the first is its heading.
export function cellInfo(cell,now,me){
 const c=W.liveCell(cell,now);
 if(!c)return ["Case libre","Personne n'y tient d'affiche.","Coller ici : ton affiche s'y pose, avec la solidité de ton coup de pinceau."];
 const ago=dur(now-c.at),camp=CAMP_NAME[c.camp];
 const who=c.vol?`Bénévole · collée il y a ${ago}`:c.name&&c.name===me?.name?`Collée par toi il y a ${ago}`:`Collée par ${c.by==null||!c.name?"un ancien élu":c.name} il y a ${ago}`;
 const lost=c.takenFrom&&Number.isFinite(c.takenAt)&&now-c.takenAt<W.RETAKE_H*HOUR?`Prise à ${CAMP_NAME[c.takenFrom]} il y a ${dur(now-c.takenAt)}.`:null;
 const hint=c.camp===me?.camp?"Coller ici : la rafraîchir (âge à zéro, elle garde la meilleure solidité)."
  :c.sol>1?`Coller ici : −1 point (elle résiste encore à ${plural(c.sol-1,"collage")}).`:"Coller ici : elle tombe, la case passe à ton camp.";
 return [`Affiche de ${camp}`,who,`Solidité ${c.sol}/3 · ${STAGE[W.wearStage(c,now)]}`,`Libérée dans ${dur(W.hoursLeft(c,now)*HOUR)}, sauf si ${camp} la recolle.`,...(lost?[lost]:[]),hint];
}
// One line for a screen reader: « mur 2, C4 : affiche de la Droite, solidité 3 sur 3, nette. »
export function cellSummary(cells,g,now){
 const c=W.liveCell(cells[g],now),n=W.cellLabel(g);
 return c?`${n} : affiche de ${CAMP_NAME[c.camp]}, solidité ${c.sol} sur 3, ${STAGE[W.wearStage(c,now)]}.`:`${n} : case libre.`;
}
export function wallAria(cells,w,now,sel){
 const s=W.wallScore(cells,w,now);
 return `Mur ${w+1} sur ${W.wallCount(cells)} : Gauche ${s.left} cases, Droite ${s.right}, ${s.empty} libres.${sel!=null&&sel<cells.length?` Case choisie : ${cellSummary(cells,sel,now)}`:""}`;
}
const Q_HEAD={parfait:"Parfait !",bon:"Bon coup de pinceau",bacle:"Bâclé…"};
// The result card: [heading, what happened, « +N XP », the wall news…]. res: the stop's answer (+ ms), prev: the cell before.
export function resultLines(res,prev){
 const n=W.cellLabel(res.g),c=res.cell||{},auto=res.ms>=W.BRUSH_MS;
 const what={
  posee:`Affiche posée en ${n}, solidité ${c.sol}.`,
  rafraichie:`Affiche de ton camp rafraîchie en ${n} : son âge repart de zéro${prev?.sol?`, solidité ${prev.sol} → ${c.sol}`:`, solidité ${c.sol}`}.`,
  abimee:`−1 point à l'affiche adverse en ${n} : il lui reste ${c.sol} (encore ${plural(c.sol,"collage")} pour la prendre).`,
  prise:`Case prise ! ${n} passe à ${CAMP_NAME[c.camp]??"ton camp"}, ton affiche a une solidité de ${c.sol}.`}[res.outcome]??"";
 const walls=Number.isInteger(res.opened)?[`Le mur ${res.opened} est plein : le mur ${res.opened+1} s'ouvre !`]:[];
 return [`${Q_HEAD[res.quality]??""}${auto?" (pinceau arrêté tout seul à 3 s)":""}`,what,`+${res.xp|0} XP`,...walls];
}
export const quotaText=left=>left>0?`Il te reste ${plural(left,"affiche")} aujourd'hui`:"Plus d'affiche aujourd'hui : reviens demain.";
export const nightHint=hour=>W.isWallNight(hour)?`🌙 XP ×${frNum(W.WALL_NIGHT.xp)} cette nuit`:`XP ×${frNum(W.WALL_NIGHT.xp)} la nuit (${W.WALL_NIGHT.start} h – ${W.WALL_NIGHT.end} h)`;
export const countdown=ms=>`⏳ ${dur(Math.max(0,ms))} avant minuit`;
// The Jeux sheet's entry: its name follows the Paris hour, the counts when known, the posters left, the night bonus.
export function tile({counts,left,hour,lvl,minLevel=3}){
 const night=W.isWallNight(hour),title=`🖌️ ${W.wallName(hour)}`;
 if((lvl|0)<minLevel)return {title,night,side:"›",sub:`Dès le niveau ${minLevel} : colle les affiches de ton camp sur le mur commun.`};
 const parts=[...(counts?[`Gauche ${counts.left|0} · Droite ${counts.right|0}`]:[]),left>0?`${plural(left,"affiche")} à coller`:"plus d'affiche aujourd'hui",`XP ×${frNum(W.WALL_NIGHT.xp)} ${night?"cette nuit":"la nuit"}`];
 const sub=parts.join(" · ");
 return {title,night,side:left>0?`${left} ›`:"›",sub:sub.charAt(0).toUpperCase()+sub.slice(1)};
}
// The legend's four samples, in my camp's colours.
export const legendCells=(camp,now)=>[
 [{camp,sol:3,at:now-2*HOUR,vol:false,motif:0},"nette (moins de 24 h)"],[{camp,sol:2,at:now-30*HOUR,vol:false,motif:1},"pâlie (24 à 44 h)"],
 [{camp,sol:1,at:now-46*HOUR,vol:false,motif:2},"déchirée (44 à 48 h)"],[{camp,sol:2,at:now-HOUR,vol:true,motif:3},"coin doré : bénévole"]];

// ---------------------------------------------------------------- keys
const MOVES={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],Home:[-99,0],End:[99,0]};
// A key during a brush: "stop" for a fresh press of Space or Enter, "block" for the same keys held down (the Enter
// that started the paste repeats onto « Arrêter le pinceau »: it must not stop it), null for any other key.
export function brushKey(e){
 const k=e.key===" "||e.key==="Enter"||e.code==="Space";
 return !k?null:e.repeat?"block":"stop";
}
// The selection after a key, on the wall on view (w); null when the key is no move.
export function moveSel(sel,w,key){
 const d=MOVES[key];if(!d)return null;
 const i=(sel??0)%C,x=Math.min(WALL_W-1,Math.max(0,i%WALL_W+d[0])),y=Math.min(WALL_H-1,Math.max(0,Math.floor(i/WALL_W)+d[1]));
 return w*C+y*WALL_W+x;
}

// ---------------------------------------------------------------- the sheet's state
// {cells, walls, counts, left, active, volunteers, title, closesAt, view, sel, brush, result}. Live updates and reloads
// replace the walls only: the wall on view, the selection and a brush under way stay (a vanished wall moves the view back).
const firstFree=(cells,w,now)=>{for(let i=0;i<C;i++)if(!W.liveCell(cells[w*C+i],now))return w*C+i;return w*C;};
function clamp(s){
 const n=Math.max(1,s.walls|0),view=Math.min(Math.max(0,s.view|0),n-1);
 const sel=s.sel==null?null:s.sel>=n*C||W.wallOf(s.sel)!==view?view*C+s.sel%C:s.sel;
 return {...s,view,sel};
}
const arr=v=>Array.isArray(v)?v:[];
export function wallState(prev,ev){
 const s=prev;
 switch(ev.type){
  case "load":{
   const d=ev.data,cells=arr(d.cells),walls=d.walls|0||W.wallCount(cells);
   const base={cells,walls,counts:d.counts??{left:0,right:0},left:d.left|0,active:d.active??null,volunteers:d.volunteers??null,title:d.title??null,closesAt:d.closesAt??null};
   if(!s?.cells){const view=W.firstOpenWall(cells,ev.now);return clamp({...base,view,sel:firstFree(cells,view,ev.now),brush:null,result:null});}
   return clamp({...s,...base});
  }
  case "live":{
   const cells=arr(ev.cells);if(!s)return s;
   return clamp({...s,cells,walls:ev.walls|0||W.wallCount(cells),counts:ev.counts??s.counts});
  }
  case "view":{
   if(!s||s.brush)return s;
   const v=s.view+ev.d;if(v<0||v>=s.walls)return s;
   return {...s,view:v,sel:s.sel==null?null:v*C+s.sel%C};
  }
  case "select":{
   if(!s||s.brush||!Number.isInteger(ev.g)||ev.g<0||ev.g>=s.walls*C)return s;
   return {...s,sel:ev.g,view:W.wallOf(ev.g)};
  }
  case "key":{
   if(!s||s.brush)return s;
   const g=moveSel(s.sel,s.view,ev.key);return g==null?s:{...s,sel:g};
  }
  case "start":return {...s,brush:ev.brush,result:null};
  case "stop":{
   const r=ev.res,cells=s.cells.slice();
   if(Number.isInteger(r.opened))while(cells.length<(r.opened+1)*C)cells.push(null);
   const prev=r.g<cells.length?cells[r.g]??null:null;
   if(r.g<cells.length&&r.cell)cells[r.g]=r.cell;
   const counts=ev.now!=null?(({left,right})=>({left,right}))(W.countWall(cells,ev.now)):s.counts;
   return clamp({...s,cells,walls:W.wallCount(cells),counts,left:Number.isFinite(r.left)?r.left:s.left,brush:null,result:{res:r,prev}});
  }
  case "fail":return {...s,brush:null};
 }
 return s;
}
// The cells a live update changed (to flash them), on the walls both sides have.
export function changedCells(a,b){
 if(!Array.isArray(a)||!Array.isArray(b))return [];
 const k=c=>c?`${c.camp}|${c.sol}|${c.at}|${c.name}|${c.vol}`:"";
 const out=[];for(let i=0;i<Math.min(a.length,b.length);i++)if(k(a[i])!==k(b[i]))out.push(i);
 return out;
}
