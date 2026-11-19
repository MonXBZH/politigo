// La Nuit du collage over HTTP: the gate, the brush (start, stop), the four outcomes with their XP and journal line,
// the quota, two pastes in a row on one cell, forged stops, an expired attempt, a new wall, the live event, suspension.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,PW,player,sleep,until} from "./server-helpers.mjs";
import * as R from "../web/rules.mjs";
import {brushQuality,cellLabel,wallXp,isWallNight,QUALITY_LABEL,WALL_CELLS,BRUSH_MS,DAILY_QUOTA} from "../web/wall.mjs";

const T=120000,it=(name,fn)=>test(name,{timeout:T},fn);
const WP=18961;
let dir,SOCK,srv;
const admAt=(sock,obj)=>new Promise((ok,ko)=>{
 const c=createConnection(sock);let text="";
 c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
 c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
 c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
});
const env=d=>({POLITIGO_ADMIN_SOCKET:join(d,"admin.sock")});
// A player of the level the wall asks (3), on a given server.
async function colleur(port,sock,name,camp="left",lvl=3){
 const c=await player(port,name,camp);
 if(lvl>1)assert.equal((await admAt(sock,{cmd:"give",name,lvl})).ok,true);
 return c;
}
const cp=(name,camp)=>colleur(WP,SOCK,name,camp);
const view=async c=>{const r=await c.call("GET","/api/wall");assert.equal(r.status,200,JSON.stringify(r.json));return r.json;};
const me=async c=>(await c.call("GET","/api/me")).json;
const start=(c,g)=>c.call("POST","/api/wall",{op:"start",g});
const stopAt=(c,id,ms)=>c.call("POST","/api/wall",{op:"stop",id,ms});
// The first stop time (from 260 ms, or later) giving that quality with this seed.
function msFor(seed,q,from=260){for(let ms=from;ms<BRUSH_MS-50;ms+=10)if(brushQuality(seed,ms)===q)return ms;throw new Error(`no ${q} for seed ${seed}`);}
// One poster of the wanted quality on g: started, waited for as long as a human would hold the brush, stopped.
async function paste(c,g,q="bacle"){
 const s=await start(c,g);assert.equal(s.status,200,JSON.stringify(s.json));
 const ms=q==="bacle"?BRUSH_MS:msFor(s.json.seed,q);
 if(q!=="bacle")await sleep(Math.max(0,ms-600));
 const r=await stopAt(c,s.json.id,ms);assert.equal(r.status,200,JSON.stringify(r.json));
 return r.json;
}
const hour=()=>R.hodOf(Math.floor(Date.now()/R.H));
const WORD={posee:"posée",rafraichie:"rafraîchie",abimee:"abîmée",prise:"prise"};
const lineOf=(outcome,g,q,xp)=>`${isWallNight(hour())?"Nuit du collage":"Collage"} : affiche ${WORD[outcome]} en ${cellLabel(g)} (${QUALITY_LABEL[q]}, +${xp} XP).`;
// The XP, the journal line: what one paste must leave on the paster's game.
async function checkPaste(c,g,q,outcome){
 const x0=(await me(c)).state.xp;
 const r=await paste(c,g,q);
 assert.equal(r.quality,q);assert.equal(r.outcome,outcome);
 const xp=wallXp(q,hour());assert.equal(r.xp,xp);
 const S=(await me(c)).state;
 assert.equal(S.xp-x0,xp,"the XP lands");
 assert.equal(S.journal[0].k,"wall");assert.equal(S.journal[0].text,lineOf(outcome,g,q,xp));
 return r;
}
const GONE="Ce coup de pinceau n'est plus valable.";

before(async()=>{dir=mkdtempSync(join(tmpdir(),"wall-"));SOCK=join(dir,"admin.sock");srv=await boot(WP,dir,env(dir));});
after(async()=>{await stop(srv);});

it("the gate: level 2 refused with the copy, anyone may look, the knob is quiet at its default",async()=>{
 assert.doesNotMatch(srv.err+srv.out,/Collage test setting/);
 const c=await colleur(WP,SOCK,"Novice Colle","left",2);
 const v=await view(c);
 assert.equal(v.cells.length,WALL_CELLS);assert.equal(v.walls,1);assert.equal(v.left,DAILY_QUOTA);assert.equal(v.attempt,null);
 assert.deepEqual(v.counts,{left:0,right:0});assert.deepEqual(v.active,{left:0,right:0});assert.deepEqual(v.volunteers,{left:0,right:0});
 assert.equal(v.title,null);assert.ok(Number.isFinite(v.now)&&v.closesAt>v.now&&v.closesAt-v.now<=25*R.H);
 const r=await start(c,0);assert.equal(r.status,422);assert.equal(r.json.error,"La Nuit du collage s'ouvre au niveau 3.");
 assert.equal((await me(c)).wallLeft,DAILY_QUOTA);
 assert.equal((await c.call("GET","/api/wall")).status,200);
 const anon=await fetch(`http://127.0.0.1:${WP}/api/wall`);assert.equal(anon.status,401);
});

it("a pose, a refresh, an attack −1, a capture: XP and journal line each",async()=>{
 const a=await cp("Ana Colle","left"),b=await cp("Bruno Colle","right");
 const g=5;
 let r=await checkPaste(a,g,"bon","posee");
 assert.deepEqual({camp:r.cell.camp,sol:r.cell.sol,name:r.cell.name},{camp:"left",sol:2,name:"Ana Colle"});assert.equal(r.left,DAILY_QUOTA-1);
 r=await checkPaste(a,g,"parfait","rafraichie");assert.equal(r.cell.sol,3);
 r=await checkPaste(b,g,"bacle","abimee");assert.equal(r.cell.sol,2);assert.equal(r.cell.camp,"left");
 r=await checkPaste(b,g,"bacle","abimee");assert.equal(r.cell.sol,1);
 r=await checkPaste(b,g,"bon","prise");
 assert.deepEqual({camp:r.cell.camp,sol:r.cell.sol,name:r.cell.name,takenFrom:r.cell.takenFrom},{camp:"right",sol:2,name:"Bruno Colle",takenFrom:"left"});
 const v=await view(a);assert.equal(v.cells[g].camp,"right");assert.equal(v.counts.right>=1,true);
 assert.equal(v.active.left>=1&&v.active.right>=1,true);
 assert.equal((await me(b)).wallLeft,DAILY_QUOTA-3);
});

it("quota: 5 posters a day, then 422",async()=>{
 const c=await cp("Cinq Colle","left");
 for(let k=0;k<DAILY_QUOTA;k++){const r=await paste(c,10+k);assert.equal(r.left,DAILY_QUOTA-1-k);}
 const r=await start(c,20);assert.equal(r.status,422);assert.equal(r.json.error,"Plus d'affiche aujourd'hui : reviens demain.");
 assert.equal((await view(c)).left,0);assert.equal((await me(c)).wallLeft,0);
});

it("two pastes on the same cell apply in order",async()=>{
 const a=await cp("Ordre Gauche","left"),b=await cp("Ordre Droite","right"),c=await cp("Ordre Droite Bis","right");
 const g=30;await paste(a,g,"bacle");
 const sb=await start(b,g),sc=await start(c,g);assert.equal(sb.status,200);assert.equal(sc.status,200);
 const [rb,rc]=await Promise.all([stopAt(b,sb.json.id,BRUSH_MS),stopAt(c,sc.json.id,BRUSH_MS)]);
 assert.equal(rb.status,200);assert.equal(rc.status,200);
 assert.deepEqual([rb.json.outcome,rc.json.outcome].sort(),["prise","rafraichie"],"the second sees the first's capture");
 const cell=(await view(a)).cells[g];
 assert.equal(cell.camp,"right");assert.equal(cell.sol,1);assert.equal(cell.takenFrom,"left");
 const last=rb.json.outcome==="rafraichie"?"Ordre Droite":"Ordre Droite Bis";
 assert.equal(cell.name,last,"the last colleur is the last paste");
});

it("forged stops never paste twice nor parfait",async()=>{
 const a=await cp("Faussaire Un","left"),o=await cp("Faussaire Deux","left");
 // perfect but later than what really elapsed (+1 s), perfect + 5 s, negative, NaN (null in JSON), a string
 const forged=[seed=>msFor(seed,"parfait",1200),seed=>msFor(seed,"parfait")+5000,()=>-1,()=>null,()=>"800"];
 for(const [k,f] of forged.entries()){
  const g=35+k,s=await start(a,g);assert.equal(s.status,200,JSON.stringify(s.json));
  const perfect=msFor(s.json.seed,"parfait"),ms=f(s.json.seed);
  const r=await stopAt(a,s.json.id,ms);assert.equal(r.status,200,JSON.stringify(r.json));
  assert.equal(r.json.quality,"bacle",`forged ${k}`);assert.equal(r.json.cell.sol,1);
  // a second stop on the same attempt: refused, no second paste
  const again=await stopAt(a,s.json.id,perfect);assert.equal(again.status,409);assert.equal(again.json.error,GONE);
  if(k===1){
   // someone else's attempt id: refused, and his own attempt is untouched
   const so=await start(o,40);assert.equal(so.status,200);
   const f2=await stopAt(a,so.json.id,500);assert.equal(f2.status,409);assert.equal(f2.json.error,GONE);
   const mine=await stopAt(o,so.json.id,BRUSH_MS);assert.equal(mine.status,200);
  }
 }
 assert.equal((await view(a)).left,0,"five stops, five posters");
 const unknown=await stopAt(o,"nimportequoi",500);assert.equal(unknown.status,409);assert.equal(unknown.json.error,GONE);
});

it("one attempt at a time; the cell must exist",async()=>{
 const a=await cp("Pinceau Seul","left");
 for(const g of [-1,WALL_CELLS,1.5,"3",null]){const r=await start(a,g);assert.equal(r.status,400,`g=${g}`);}
 const s=await start(a,1);assert.equal(s.status,200);
 assert.ok(typeof s.json.id==="string"&&Number.isSafeInteger(s.json.seed)&&Number.isFinite(s.json.t0));
 const v=await view(a);assert.deepEqual(v.attempt,{id:s.json.id,seed:s.json.seed,g:1,t0:s.json.t0});assert.equal(v.left,DAILY_QUOTA-1);
 const r=await start(a,2);assert.equal(r.status,409);assert.equal(r.json.error,"Un coup de pinceau est déjà en cours.");
 assert.equal((await stopAt(a,s.json.id,BRUSH_MS)).status,200);
 assert.equal((await view(a)).attempt,null);
});

it("an expired attempt pastes nothing and still used the quota",async()=>{
 const a=await cp("Lent Colle","left");
 const s=await start(a,44);assert.equal(s.status,200);
 await sleep(10_600);
 const r=await stopAt(a,s.json.id,1000);assert.equal(r.status,409);assert.equal(r.json.error,GONE);
 const v=await view(a);assert.equal(v.cells[44],null,"nothing pasted");assert.equal(v.left,DAILY_QUOTA-1);assert.equal(v.attempt,null);
 // never stopped at all: the poster is spent as well, once
 const s2=await start(a,45);assert.equal(s2.status,200);
 await sleep(10_600);
 assert.equal((await view(a)).left,DAILY_QUOTA-2);assert.equal((await view(a)).cells[45],null);
});

it("the live event: another client hears the wall change (coalesced)",async()=>{
 const a=await cp("Direct Gauche","left"),b=await cp("Direct Droite","right");
 const ac=new AbortController(),events=[];
 fetch(`http://127.0.0.1:${WP}/events`,{headers:{Cookie:b.cookie},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}}
 }).catch(()=>{});
 try{
  await until(()=>events.some(e=>e.ev==="me"));
  assert.equal(typeof events.find(e=>e.ev==="me").data.wallLeft,"number");
  await paste(a,47);await paste(a,46);
  const got=await until(()=>events.find(e=>e.ev==="wall"&&e.data.cells[47]?.name==="Direct Gauche"&&e.data.cells[46]),6000);
  assert.ok(got,"a wall event arrives");
  assert.equal(events.filter(e=>e.ev==="wall").length,1,"the two pastes ride one event");
  assert.ok(Number.isInteger(got.data.walls)&&got.data.counts.left>=2);
 }finally{ac.abort();}
});

it("filling wall 1 opens wall 2; a deleted colleur's posters stay as « ancien élu »",async()=>{
 const d=mkdtempSync(join(tmpdir(),"wall-")),port=18962,sock=join(d,"admin.sock");
 let s=await boot(port,d,env(d));
 try{
  const a=await colleur(port,sock,"Dernier Colle","left");
  await stop(s);
  const db=new DatabaseSync(join(d,"t.db"));
  const put=db.prepare("INSERT INTO wall_cells(g,camp,by,name,vol,sol,at,motif) VALUES(?,?,NULL,'X',0,2,?,0)");
  for(let g=0;g<WALL_CELLS-1;g++)put.run(g,g%2?"left":"right",Date.now());
  db.close();
  s=await boot(port,d,env(d));
  const r=await paste(a,WALL_CELLS-1);
  assert.equal(r.outcome,"posee");assert.equal(r.opened,1);
  const v=await view(a);assert.equal(v.walls,2);assert.equal(v.cells.length,2*WALL_CELLS);
  const r2=await paste(a,WALL_CELLS);assert.equal(r2.opened,undefined);
  // the account goes: its posters stay, nameless
  assert.equal((await a.call("DELETE","/api/account",{password:PW})).status,200);
  const b=await colleur(port,sock,"Temoin Colle","right");
  const w=await view(b);
  assert.equal(w.cells[WALL_CELLS-1].name,"ancien élu");assert.equal(w.cells[WALL_CELLS-1].by,null);
  assert.deepEqual(w.active,{left:0,right:0},"his day rows went with him");
 }finally{await stop(s);}
});

it("a suspended player can neither look nor paste; the knob lowers the level and is said",async()=>{
 const d=mkdtempSync(join(tmpdir(),"wall-")),port=18963,sock=join(d,"admin.sock");
 const s=await boot(port,d,{...env(d),POLITIGO_WALL_MIN_LEVEL:"1"});
 try{
  assert.match(s.err+s.out,/Collage test setting active: level 1\+/);
  const c=await player(port,"Suspendu Colle","left");
  const st=await start(c,0);assert.equal(st.status,200,"level 1 may paste here");
  assert.equal((await admAt(sock,{cmd:"suspend",name:"Suspendu Colle",on:true})).ok,true);
  const r=await stopAt(c,st.json.id,BRUSH_MS);assert.ok([401,403].includes(r.status),String(r.status));
  assert.ok([401,403].includes((await start(c,1)).status));
  assert.ok([401,403].includes((await c.call("GET","/api/wall")).status));
  const o=await player(port,"Voisin Colle","right");
  assert.equal((await view(o)).cells[0],null,"nothing pasted");
 }finally{await stop(s);}
});
