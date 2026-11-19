// La Nuit du collage over HTTP: the gate, the brush (start, stop), the four outcomes with their XP and journal line,
// the quota, two pastes in a row on one cell, forged stops, an expired attempt, a new wall, the live event, suspension.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,PW,player,sleep,until,dayNow} from "./server-helpers.mjs";
import * as R from "../web/rules.mjs";
import {brushQuality,cellLabel,wallXp,isWallNight,weekOf,QUALITY_LABEL,WALL_CELLS,WAVE_HOURS,BRUSH_MS,DAILY_QUOTA} from "../web/wall.mjs";

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

it("an expired attempt pastes nothing, still used the quota, and does not make its player active",async()=>{
 const a=await cp("Lent Colle","left");
 const act0=(await view(a)).active;
 const s=await start(a,44);assert.equal(s.status,200);
 await sleep(10_600);
 const r=await stopAt(a,s.json.id,1000);assert.equal(r.status,409);assert.equal(r.json.error,GONE);
 const v=await view(a);assert.equal(v.cells[44],null,"nothing pasted");assert.equal(v.left,DAILY_QUOTA-1);assert.equal(v.attempt,null);
 // never stopped at all: the poster is spent as well, once
 const s2=await start(a,45);assert.equal(s2.status,200);
 await sleep(10_600);
 assert.equal((await view(a)).left,DAILY_QUOTA-2);assert.equal((await view(a)).cells[45],null);
 assert.deepEqual((await view(a)).active,act0,"two lost posters: not an active colleur");
 // a real paste does make him one
 await paste(a,44);
 assert.deepEqual((await view(a)).active,{...act0,left:act0.left+1});
});

it("a stop on a wall that vanished meanwhile pastes nothing, spends the poster, and does not make its player active",async()=>{
 const d=mkdtempSync(join(tmpdir(),"wall-")),port=18964,sock=join(d,"admin.sock");
 let s=await boot(port,d,env(d));
 try{
  const a=await colleur(port,sock,"Mur Perdu","left");
  await stop(s);
  // wall 1 full (nobody's posters), so wall 2 is open and empty
  let db=new DatabaseSync(join(d,"t.db"));
  const put=db.prepare("INSERT INTO wall_cells(g,camp,by,name,vol,sol,at,motif) VALUES(?,?,NULL,'X',0,2,?,0)");
  for(let g=0;g<WALL_CELLS;g++)put.run(g,g%2?"left":"right",Date.now());
  db.close();
  s=await boot(port,d,env(d));
  assert.equal((await view(a)).walls,2);
  const st=await start(a,WALL_CELLS);assert.equal(st.status,200,JSON.stringify(st.json));
  // a poster of wall 1 reaches its 48 h: wall 1 has a hole, the empty wall 2 goes
  db=new DatabaseSync(join(d,"t.db"),{timeout:5000});db.prepare("UPDATE wall_cells SET at=? WHERE g=0").run(Date.now()-49*R.H);db.close();
  const r=await stopAt(a,st.json.id,BRUSH_MS);
  assert.equal(r.status,409);assert.equal(r.json.error,"Ce mur a disparu : l'affiche n'a pas été posée.");
  const v=await view(a);
  assert.equal(v.walls,1);assert.equal(v.left,DAILY_QUOTA-1,"the poster is spent");
  assert.deepEqual(v.active,{left:0,right:0},"not an active colleur");
  await paste(a,0);
  assert.deepEqual((await view(a)).active,{left:1,right:0});
 }finally{await stop(s);}
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

// ===================================================================== the wall tick: the night, the volunteers, the week
// Each case: a server of its own, its players registered, then rows written straight into the stopped database (cells,
// day rows, settings), then booted again. POLITIGO_WALL_CLOSE_AT forces the close of the night of its own day.
const today=()=>dayNow();
const shift=(key,n)=>{const d=new Date(Date.UTC(Math.floor(key/10000),Math.floor(key/100)%100-1,key%100+n));return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();};
// The volunteer wave due now (the index in WAVE_HOURS), -1 before 10 h.
const dueWave=()=>{let i=-1;for(const [k,h] of WAVE_HOURS.entries())if(hour()>=h)i=k;return i;};
const NIGHT_JOURNAL="🖌️ Nuit du collage : ton camp a tenu le mur. +1 bulletin.";
async function seeded(port,names,seed,extra={}){
 const d=mkdtempSync(join(tmpdir(),"wall-"));
 let s=await boot(port,d,env(d));const cs={};
 try{for(const [name,camp] of names){const c=await player(port,name,camp),S=(await me(c)).state;c.b0=S.wardrobe.bulletins;c.x0=S.xp;cs[name]=c;}}
 finally{await stop(s);}
 const db=new DatabaseSync(join(d,"t.db"));
 const id=Object.fromEntries(db.prepare("SELECT id,name FROM players").all().map(r=>[r.name,r.id]));
 const set=(k,v)=>v==null?db.prepare("DELETE FROM settings WHERE key=?").run(k):db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)").run(k,String(v));
 const cell=(g,camp,by=null,vol=0,at=Date.now())=>db.prepare("INSERT OR REPLACE INTO wall_cells(g,camp,by,name,vol,sol,at,motif) VALUES(?,?,?,?,?,2,?,0)").run(g,camp,by,by?"X":null,vol,at);
 const day=(dk,name,camp,{pasted=1,useful=0,reached=0}={})=>db.prepare("INSERT INTO wall_days(day,player_id,camp,pasted,spent,useful,reached_at) VALUES(?,?,?,?,?,?,?)").run(dk,id[name],camp,pasted,Math.max(1,pasted),useful,reached);
 set("wall_wave",`${today()}:${dueWave()}`);   // no volunteer wave unless the case asks for one
 seed({db,id,set,cell,day});db.close();
 s=await boot(port,d,{...env(d),...extra});
 return {get s(){return s;},d,cs,id,open:()=>new DatabaseSync(join(d,"t.db"),{timeout:5000}),restart:async(more=extra)=>{await stop(s);s=await boot(port,d,{...env(d),...more});return s;},stop:()=>stop(s)};
}
const feedOf=async(c,re)=>(await c.call("GET","/api/board")).json.feed.filter(e=>re.test(e.text));
const bulletins=async c=>(await me(c)).state.wardrobe.bulletins-c.b0;
const paidLine=async c=>(await me(c)).state.journal.some(j=>j.text===NIGHT_JOURNAL);
const closeNow=()=>({POLITIGO_WALL_CLOSE_AT:String(Date.now())});

it("the night with both camps: the most cells win, a bulletin to each of the winning camp's colleurs of the day only",async()=>{
 const t=today();
 const x=await seeded(18965,[["Nuit Un","left"],["Nuit Deux","left"],["Nuit Hier","left"],["Nuit Rate","left"],["Nuit Droite","right"]],({cell,day,id})=>{
  cell(0,"left",id["Nuit Un"]);cell(1,"left",id["Nuit Deux"]);cell(2,"left");cell(3,"right",id["Nuit Droite"]);cell(4,"right",null,1);
  day(t,"Nuit Un","left");day(t,"Nuit Deux","left");day(t,"Nuit Droite","right");
  day(shift(t,-1),"Nuit Hier","left");day(t,"Nuit Rate","left",{pasted:0});   // yesterday only; spent but never pasted
 },closeNow());
 try{
  assert.match(x.s.err+x.s.out,/Collage test setting active: night close at /);
  const c=x.cs["Nuit Droite"],line="🖌️ La Gauche a tenu le mur cette nuit (3 cases contre 2).";
  assert.ok(await until(async()=>(await feedOf(c,/tenu le mur/)).length,6000),"the feed line");
  assert.deepEqual((await feedOf(c,/🖌️/)).map(e=>[e.player,e.kind,e.text]),[["PolitiGo","wall",line]]);
  for(const n of ["Nuit Un","Nuit Deux"]){assert.equal(await bulletins(x.cs[n]),1,n);assert.equal(await paidLine(x.cs[n]),true,n);}
  for(const n of ["Nuit Hier","Nuit Rate","Nuit Droite"]){assert.equal(await bulletins(x.cs[n]),0,n);assert.equal(await paidLine(x.cs[n]),false,n);}
  for(const n of ["Nuit Un","Nuit Droite"])assert.equal((await me(x.cs[n])).state.xp,x.cs[n].x0,"no XP at the close");
  const db=x.open();
  try{
   const row=db.prepare("SELECT * FROM wall_nights WHERE day=?").get(t);
   assert.deepEqual({l:row.left_n,r:row.right_n,w:JSON.parse(row.winners),paid:row.paid},{l:3,r:2,w:["left"],paid:2});
   assert.equal(db.prepare("SELECT value FROM settings WHERE key='wall_night_closed'").get().value,String(t));
   const log=db.prepare("SELECT via,target,detail FROM admin_log WHERE cmd='wall-night'").all();
   assert.equal(log.length,1);assert.equal(log[0].via,"server");assert.equal(log[0].target,String(t));assert.match(log[0].detail,/Gauche 3 · Droite 2/);
  }finally{db.close();}
 }finally{await x.stop();}
});

it("the night: a tie shares the wall, a camp alone wins with fewer cells, nobody able to win means no line",async()=>{
 const t=today();
 // a tie with at least one cell each: both camps win
 let x=await seeded(18966,[["Egal Gauche","left"],["Egal Droite","right"]],({cell,day,id})=>{
  cell(0,"left",id["Egal Gauche"]);cell(1,"left");cell(2,"right",id["Egal Droite"]);cell(3,"right");
  day(t,"Egal Gauche","left");day(t,"Egal Droite","right");
 },closeNow());
 try{
  const c=x.cs["Egal Gauche"];
  assert.ok(await until(async()=>(await feedOf(c,/🖌️/)).length,6000));
  assert.deepEqual((await feedOf(c,/🖌️/)).map(e=>e.text),["🖌️ Égalité : la Gauche et la Droite se partagent le mur cette nuit (2 cases chacune)."]);
  assert.equal(await bulletins(c),1);assert.equal(await bulletins(x.cs["Egal Droite"]),1);
 }finally{await x.stop();}
 // only the left pasted today: it wins with fewer cells than the right's old posters
 x=await seeded(18967,[["Seule Gauche","left"],["Absente Droite","right"]],({cell,day,id})=>{
  cell(0,"left",id["Seule Gauche"]);for(const g of [1,2,3])cell(g,"right",id["Absente Droite"]);
  day(t,"Seule Gauche","left");day(shift(t,-1),"Absente Droite","right");
 },closeNow());
 try{
  const c=x.cs["Seule Gauche"];
  assert.ok(await until(async()=>(await feedOf(c,/🖌️/)).length,6000));
  assert.deepEqual((await feedOf(c,/🖌️/)).map(e=>e.text),["🖌️ La Gauche a tenu le mur cette nuit (1 case contre 3) : la Droite n'a pas collé."]);
  assert.equal(await bulletins(c),1);assert.equal(await bulletins(x.cs["Absente Droite"]),0);
 }finally{await x.stop();}
 // the only active camp has no cell left; nobody else pasted: no winner, no line, the night is closed all the same
 x=await seeded(18968,[["Vide Gauche","left"],["Vide Droite","right"]],({cell,day})=>{
  cell(0,"right");cell(1,"right");day(t,"Vide Gauche","left");
 },closeNow());
 try{
  const c=x.cs["Vide Gauche"];
  const closed=()=>{const d=x.open();try{return d.prepare("SELECT winners FROM wall_nights WHERE day=?").get(t)??null;}finally{d.close();}};
  assert.ok(await until(closed,6000),"closed");
  await sleep(400);
  assert.deepEqual(await feedOf(c,/🖌️/),[],"no feed line");
  assert.equal(await bulletins(c),0);
  assert.deepEqual(JSON.parse(closed().winners),[]);
 }finally{await x.stop();}
});

it("missed midnights close once: only the last night is closed, the older ones are skipped and logged",async()=>{
 const t=today(),y=shift(t,-1);
 const x=await seeded(18969,[["Retard Un","left"],["Retard Vieux","left"],["Retard Droite","right"]],({db,cell,day,set,id})=>{
  set("wall_night_closed",shift(t,-4));db.prepare("DELETE FROM wall_nights").run();
  cell(0,"left",id["Retard Un"]);cell(1,"left");cell(2,"right",id["Retard Droite"]);
  day(shift(t,-3),"Retard Vieux","left");day(y,"Retard Un","left");day(y,"Retard Droite","right");
 });
 try{
  const c=x.cs["Retard Droite"],line="🖌️ La Gauche a tenu le mur cette nuit (2 cases contre 1).";
  assert.ok(await until(async()=>(await feedOf(c,/🖌️/)).length,6000));
  assert.equal(await bulletins(x.cs["Retard Un"]),1);assert.equal(await bulletins(x.cs["Retard Vieux"]),0,"an older night is never paid");
  let db=x.open();
  try{
   assert.deepEqual(db.prepare("SELECT day FROM wall_nights ORDER BY day").all().map(r=>r.day),[y]);
   const skip=db.prepare("SELECT via,target,detail FROM admin_log WHERE cmd='wall-night-skip'").all();
   assert.equal(skip.length,1);assert.equal(skip[0].via,"server");assert.match(skip[0].detail,/2 nuits/);
   assert.equal(skip[0].target,`${shift(t,-3)}-${shift(t,-2)}`);
  }finally{db.close();}
  await x.restart();
  await sleep(1000);
  assert.deepEqual((await feedOf(c,/🖌️/)).map(e=>e.text),[line],"closed once across a restart");
  assert.equal(await bulletins(x.cs["Retard Un"]),1);
  db=x.open();try{assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE cmd LIKE 'wall-night%'").get().n,2);}finally{db.close();}
 }finally{await x.stop();}
});

it("a deleted colleur: never paid, his posters still count for his camp; the forced close happens once",async()=>{
 const t=today(),AT=Date.now()+6000;
 const x=await seeded(18970,[["Reste Gauche","left"],["Parti Gauche","left"],["Garde Droite","right"]],({cell,day,id})=>{
  cell(0,"left",id["Parti Gauche"]);cell(1,"left",id["Parti Gauche"]);cell(2,"right",id["Garde Droite"]);
  day(t,"Reste Gauche","left");day(t,"Parti Gauche","left");day(t,"Garde Droite","right");
 },{POLITIGO_WALL_CLOSE_AT:String(AT)});
 try{
  assert.equal((await x.cs["Parti Gauche"].call("DELETE","/api/account",{password:PW})).status,200);
  assert.ok(Date.now()<AT,"deleted before the close");
  const c=x.cs["Garde Droite"];
  assert.ok(await until(async()=>(await feedOf(c,/🖌️/)).length,12000));
  assert.deepEqual((await feedOf(c,/🖌️/)).map(e=>e.text),["🖌️ La Gauche a tenu le mur cette nuit (2 cases contre 1)."]);
  assert.equal(await bulletins(x.cs["Reste Gauche"]),1);
  let db=x.open();try{assert.equal(db.prepare("SELECT paid FROM wall_nights WHERE day=?").get(t).paid,1);}finally{db.close();}
  await x.restart();await sleep(1000);
  assert.equal((await feedOf(c,/🖌️/)).length,1,"the knob closes its night once");
  assert.equal(await bulletins(x.cs["Reste Gauche"]),1);
 }finally{await x.stop();}
});

it("a volunteer wave: min(A − B, B) « bon » posters for the minority, marked vol, no XP, never active; once per wave",async()=>{
 assert.ok(dueWave()>=0,"the test server lives in the early afternoon");
 const t=today(),L=["Vol G1","Vol G2","Vol G3","Vol G4","Vol G5"],Rr=["Vol D1","Vol D2"];
 const x=await seeded(18971,[...L.map(n=>[n,"left"]),...Rr.map(n=>[n,"right"])],({day,set})=>{
  for(const n of L)day(t,n,"left");for(const n of Rr)day(t,n,"right");
  set("wall_wave",null);
 });
 try{
  const c=x.cs["Vol D1"],stored=()=>{const d=x.open();try{return d.prepare("SELECT COUNT(*) AS n FROM wall_cells").get().n;}finally{d.close();}};
  assert.ok(await until(()=>stored()>=2,6000),"the wave pasted");
  await sleep(300);const v=await view(c);
  const posted=v.cells.filter(Boolean);
  assert.equal(posted.length,2,"min(5 − 2, 2) = 2 volunteers, one poster each");
  for(const p of posted)assert.deepEqual({camp:p.camp,vol:p.vol,sol:p.sol,by:p.by,name:p.name},{camp:"right",vol:true,sol:2,by:null,name:null});
  assert.deepEqual(v.active,{left:5,right:2},"volunteers are never active colleurs");
  assert.deepEqual(v.volunteers,{left:0,right:2});
  for(const n of [...L,...Rr])assert.equal((await me(x.cs[n])).state.xp,x.cs[n].x0,`no XP for ${n}`);
  const db=x.open();
  try{
   assert.equal(db.prepare("SELECT used FROM wall_vol WHERE day=? AND camp='right'").get(t).used,2);
   assert.equal(db.prepare("SELECT value FROM settings WHERE key='wall_wave'").get().value,`${t}:${dueWave()}`);
  }finally{db.close();}
  await x.restart();await sleep(1000);
  assert.equal((await view(c)).cells.filter(Boolean).length,2,"once per wave, across a restart");
 }finally{await x.stop();}
});

it("the weekly title: last week's champion in the feed, wallTitle on his board row this week",async()=>{
 const t=today(),last=shift(t,-7),now=Date.now();
 const x=await seeded(18972,[["Ines Colle","left"],["Bob Colle","right"],["Cy Colle","left"]],({day,set})=>{
  day(last,"Ines Colle","left",{pasted:14,useful:14,reached:now-8*864e5});
  day(last,"Bob Colle","right",{pasted:15,useful:14,reached:now-8*864e5+60e3});   // the same score, reached later
  day(last,"Cy Colle","left",{pasted:3,useful:3,reached:now-8*864e5});
  set("wall_week_closed",null);
 });
 try{
  const c=x.cs["Bob Colle"],line="🖌️ Colleur de la semaine : Ines Colle (14 collages utiles).";
  assert.ok(await until(async()=>(await feedOf(c,/Colleur de la semaine/)).length,6000));
  assert.deepEqual((await feedOf(c,/🖌️/)).map(e=>[e.player,e.kind,e.text]),[["PolitiGo","wall",line]]);
  const board=(await c.call("GET","/api/board")).json.board,row=n=>board.find(r=>r.name===n);
  assert.equal(row("Ines Colle").wallTitle,true);
  assert.equal(row("Bob Colle").wallTitle,undefined);assert.equal(row("Cy Colle").wallTitle,undefined);
  assert.deepEqual((await view(c)).title,{name:"Ines Colle",camp:"left"});
  const db=x.open();
  try{
   assert.equal(db.prepare("SELECT player_id FROM wall_titles WHERE week=?").get(weekOf(t)-1).player_id,x.id["Ines Colle"]);
   assert.equal(db.prepare("SELECT value FROM settings WHERE key='wall_week_closed'").get().value,String(weekOf(t)-1));
  }finally{db.close();}
  await x.restart();await sleep(1000);
  assert.equal((await feedOf(c,/Colleur de la semaine/)).length,1,"the week closes once");
 }finally{await x.stop();}
});

it("POLITIGO_WALL_CLOSE_AT is refused on a released image and when it is not an instant",async()=>{
 await assert.rejects(boot(18973,mkdtempSync(join(tmpdir(),"wall-")),{POLITIGO_VERSION:"v1.9.0",POLITIGO_WALL_CLOSE_AT:String(Date.now())}),/server exited 1[\s\S]*POLITIGO_WALL_CLOSE_AT/);
 await assert.rejects(boot(18973,mkdtempSync(join(tmpdir(),"wall-")),{POLITIGO_WALL_CLOSE_AT:"minuit"}),/server exited 1[\s\S]*POLITIGO_WALL_CLOSE_AT/);
});
