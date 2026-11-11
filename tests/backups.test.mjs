// The automatic backups (admin/backups.mjs) on a real file system, with a fake game server: the schedule, the catch-up
// after a stop, the rotation, what a failure must never destroy, the names a request may use.
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync,statSync,symlinkSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {rmSync,promises as fsp} from "node:fs";
import {randomBytes} from "node:crypto";
import {createBackups,lastSlot,nextSlot,cleanConfig,DEFAULTS,verify} from "../admin/backups.mjs";

class Err extends Error{constructor(status,msg){super(msg);this.status=status;}}
const at=(y,m,d,h=0,min=0)=>new Date(y,m-1,d,h,min).getTime();
const MON=at(2026,11,2,10);   // a Monday, 2 November 2026, 10:00
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Bounded waits: a promise that does not settle in time fails the test instead of hanging the suite.
const within=(p,ms,what)=>{let t;return Promise.race([p,new Promise((_,ko)=>{t=setTimeout(()=>ko(new Error(`${what}: nothing after ${ms} ms`)),ms);})]).finally(()=>clearTimeout(t));};

function goodDb(path){const d=new DatabaseSync(path);d.exec("CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO players(name) VALUES('Camille')");d.close();}
function rig(o={}){
 const root=mkdtempSync(join(tmpdir(),"pgbk-")),src=mkdtempSync(join(tmpdir(),"pgsrc-"));
 const servers=o.servers??[{id:"prod",label:"Prod"},{id:"test",label:"Test"}],t={now:o.now??MON},calls=[],notes=[],down=new Set();
 const make=()=>({root,servers,Err,now:()=>t.now,retryMs:1800e3,
  take:async srv=>{calls.push(srv.id);if(down.has(srv.id))throw new Error("API injoignable.");const path=join(src,`backup-${calls.length}.db`);(o.write??goodDb)(path);return {path,vapid:o.vapid===false?undefined:{publicKey:"pub",privateKey:"secret"}};},
  note:async(srv,text)=>{notes.push([srv.id,text]);},freeSpace:o.freeSpace,log:()=>{}});
 return {root,src,t,calls,notes,down,make,b:createBackups(make()),dir:id=>join(root,"backups",id),files:id=>{try{return readdirSync(join(root,"backups",id)).sort();}catch{return [];}}};
}

test("slots: the day at the hour, the Monday, the 1st, in the container's time",()=>{
 assert.equal(lastSlot("quotidienne",4,at(2026,11,4,10)),at(2026,11,4,4));
 assert.equal(lastSlot("quotidienne",4,at(2026,11,4,3)),at(2026,11,3,4));
 assert.equal(lastSlot("hebdomadaire",4,at(2026,11,4,10)),at(2026,11,2,4),"the Monday of the week");
 assert.equal(lastSlot("hebdomadaire",4,at(2026,11,2,3)),at(2026,10,26,4),"Monday before the hour: the one before");
 assert.equal(lastSlot("mensuelle",4,at(2026,11,20)),at(2026,11,1,4));
 assert.equal(lastSlot("mensuelle",4,at(2026,1,1,3)),at(2025,12,1,4),"across a year");
 assert.equal(nextSlot("quotidienne",4,at(2026,11,4,10)),at(2026,11,5,4));
 assert.equal(nextSlot("hebdomadaire",4,at(2026,11,4,10)),at(2026,11,9,4));
 assert.equal(nextSlot("mensuelle",4,at(2026,12,20)),at(2027,1,1,4));
 assert.equal(nextSlot("quotidienne",4,at(2026,3,28,10)),at(2026,3,29,4),"the night the clocks change");
});

test("the settings: defaults, and only what is on offer",()=>{
 assert.deepEqual(DEFAULTS,{hour:4,quotidienne:{on:true,keep:7},hebdomadaire:{on:true,keep:4},mensuelle:{on:true,keep:12}});
 assert.deepEqual(cleanConfig({...DEFAULTS,hour:23}).hour,23);
 for(const bad of [null,{},{...DEFAULTS,hour:24},{...DEFAULTS,hour:"4"},{...DEFAULTS,quotidienne:{on:"oui",keep:7}},{...DEFAULTS,mensuelle:{on:true,keep:0}},{...DEFAULTS,mensuelle:{on:true,keep:91}},{...DEFAULTS,hebdomadaire:{on:true,keep:1.5}}])
  assert.equal(cleanConfig(bad),null,JSON.stringify(bad));
 const r=rig();
 assert.deepEqual(r.b.config(),DEFAULTS);
 assert.rejects(r.b.saveConfig({hour:99}),e=>e.status===400);
});

test("saved settings survive a restart, in a private file; a broken file falls back on the defaults",async()=>{
 const r=rig(),want={...DEFAULTS,hour:2,quotidienne:{on:false,keep:3}};
 await r.b.saveConfig(want);
 assert.deepEqual(createBackups(r.make()).config(),want);
 assert.equal(statSync(join(r.root,"backups.json")).mode&0o777,0o600);
 assert.equal(readdirSync(r.root).filter(f=>f.includes(".tmp")).length,0,"written through a temporary file");
 assert.ok(r.notes.some(([,t])=>/Réglages/.test(t)),"logged");
 writeFileSync(join(r.root,"backups.json"),"{cassé");
 assert.deepEqual(createBackups(r.make()).config(),DEFAULTS);
});

test("a first start takes each frequency once, for every server, from one copy of the base",async()=>{
 const r=rig();await r.b.tick();
 assert.deepEqual([...r.calls].sort(),["prod","test"],"one call per server");
 for(const id of ["prod","test"]){
  assert.deepEqual(r.files(id),["hebdomadaire-2026-11-02-1000.db","mensuelle-2026-11-02-1000.db","quotidienne-2026-11-02-1000.db","vapid.json"]);
  for(const f of r.files(id))assert.equal(statSync(join(r.dir(id),f)).mode&0o777,0o600,f);
  assert.equal(statSync(r.dir(id)).mode&0o777,0o700);
 }
 const d=new DatabaseSync(join(r.dir("prod"),"quotidienne-2026-11-02-1000.db"),{readOnly:true});
 assert.equal(d.prepare("SELECT name FROM players").get().name,"Camille");d.close();
 assert.deepEqual(JSON.parse(readFileSync(join(r.dir("prod"),"vapid.json"),"utf8")),{publicKey:"pub",privateKey:"secret"});
 assert.deepEqual(readdirSync(r.src),[],"the API's file is always removed");
 assert.ok(r.notes.some(([id,t])=>id==="prod"&&/quotidienne/.test(t)),"logged");
});

test("nothing twice: not on the next tick, not after a restart; the next day takes the daily only",async()=>{
 const r=rig();await r.b.tick();const n=r.calls.length;
 await r.b.tick();assert.equal(r.calls.length,n);
 const again=createBackups(r.make());await again.tick();assert.equal(r.calls.length,n,"a restart repeats nothing");
 r.t.now=at(2026,11,3,4,1);await again.tick();
 assert.equal(r.calls.length,n+2);
 assert.ok(r.files("prod").includes("quotidienne-2026-11-03-0401.db"));
 assert.ok(!r.files("prod").includes("hebdomadaire-2026-11-03-0401.db"));
});

test("a missed run is caught up once at the restart; the state lost, the files still tell",async()=>{
 const r=rig();await r.b.tick();const n=r.calls.length;
 r.t.now=at(2026,11,5,12);
 const back=createBackups(r.make());await back.tick();await back.tick();
 assert.equal(r.calls.length,n+2,"three missed days: one catch-up per server");
 assert.equal(r.files("prod").filter(f=>f.startsWith("quotidienne")).length,2);
 writeFileSync(join(r.root,"backups-state.json"),"{cassé");
 const lost=createBackups(r.make());await lost.tick();
 assert.equal(r.calls.length,n+2,"the newest file counts as the last success");
});

test("a frequency turned off is not taken, and its files stay",async()=>{
 const r=rig();await r.b.tick();const before=r.files("prod");
 await r.b.saveConfig({...DEFAULTS,quotidienne:{on:false,keep:1}});
 r.t.now=at(2026,11,3,5);await r.b.tick();
 assert.deepEqual(r.files("prod"),before);
});

test("the rotation keeps the newest, only after a success, and only touches its own frequency's names",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}]});
 await r.b.saveConfig({...DEFAULTS,quotidienne:{on:true,keep:2}});await r.b.tick();
 writeFileSync(join(r.dir("prod"),"a-garder.db"),"mine");writeFileSync(join(r.dir("prod"),"quotidienne-vieux.db"),"mine");
 for(const d of [3,4,5]){r.t.now=at(2026,11,d,5);await r.b.tick();}
 const daily=r.files("prod").filter(f=>/^quotidienne-\d/.test(f));
 assert.deepEqual(daily,["quotidienne-2026-11-04-0500.db","quotidienne-2026-11-05-0500.db"]);
 assert.ok(r.files("prod").includes("a-garder.db"));assert.ok(r.files("prod").includes("quotidienne-vieux.db"));
 assert.ok(r.files("prod").includes("hebdomadaire-2026-11-02-1000.db"));
 r.down.add("prod");r.t.now=at(2026,11,6,5);await r.b.tick();r.t.now=at(2026,11,7,5);await r.b.tick();
 assert.deepEqual(r.files("prod").filter(f=>/^quotidienne-\d/.test(f)),daily,"a failure removes nothing");
});

test("one server down: the others go on, the failure shows, is retried after a pause, and clears on success",async()=>{
 const r=rig();r.down.add("prod");await r.b.tick();
 assert.equal(r.files("prod").length,0);assert.equal(r.files("test").length,4);
 const s=r.b.status().servers.find(x=>x.id==="prod");assert.match(s.failure.error,/injoignable/);assert.equal(s.failure.t,MON);
 assert.ok(r.notes.some(([id,t])=>id==="prod"&&/en échec\.$/.test(t)),"the admin log says it failed");assert.ok(!r.notes.some(([,t])=>/injoignable/.test(t)),"and no more: moderators read that log");
 const a=r.b.alert("prod");assert.equal(a.kind,"backup");assert.ok(a.key&&a.title&&a.detail);assert.equal(r.b.alert("test"),null);
 const n=r.calls.length;r.t.now+=600e3;await r.b.tick();assert.equal(r.calls.length,n,"no retry every minute");
 r.t.now+=1800e3;r.down.delete("prod");await r.b.tick();
 assert.equal(r.calls.length,n+1);assert.equal(r.files("prod").length,4);
 assert.equal(r.b.status().servers.find(x=>x.id==="prod").failure,null);assert.equal(r.b.alert("prod"),null);
});

test("a file that is not a sound database is refused, and the API's file still goes",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}],write:p=>writeFileSync(p,"ceci n'est pas une base".repeat(200))});
 await r.b.tick();
 assert.deepEqual(r.files("prod"),[]);assert.deepEqual(readdirSync(r.src),[]);assert.ok(r.b.status().servers[0].failure);
 const empty=rig({servers:[{id:"prod",label:"Prod"}],write:p=>{const d=new DatabaseSync(p);d.exec("CREATE TABLE autre(x)");d.close();}});
 await empty.b.tick();
 assert.deepEqual(empty.files("prod"),[],"no players table: not a PolitiGo base");assert.match(empty.b.status().servers[0].failure.error,/table/i);
});

test("not enough room: nothing is written, the failure says so, the existing backups stay",async()=>{
 const space={free:1e12,total:2e12},r=rig({servers:[{id:"prod",label:"Prod"}],freeSpace:async()=>space});
 await r.b.tick();const before=r.files("prod");
 space.free=1000;r.t.now=at(2026,11,3,5);await r.b.tick();
 assert.deepEqual(r.files("prod"),before);assert.match(r.b.status().servers[0].failure.error,/espace/i);assert.deepEqual(readdirSync(r.src),[]);
 assert.equal(readdirSync(r.dir("prod")).filter(f=>f.includes(".tmp")).length,0);
});

test("no vapid.json on the server: the backup is taken, an older copy stays",async()=>{
 const r=rig({vapid:false,servers:[{id:"prod",label:"Prod"}]});await r.b.tick();
 assert.ok(!r.files("prod").includes("vapid.json"));assert.equal(r.b.status().servers[0].vapid,false);
 assert.equal(r.b.status().servers[0].failure,null);
});

test("by hand: its own frequency, five kept, one at a time",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}]});await r.b.tick();const auto=r.b.status().servers[0].last.quotidienne;
 for(let i=0;i<7;i++){r.t.now+=60e3;const o=await r.b.runNow();assert.deepEqual(o,[{id:"prod",ok:true}]);}
 assert.equal(r.files("prod").filter(f=>f.startsWith("manuelle-")).length,5);
 assert.equal(r.b.status().servers[0].last.quotidienne,auto,"it does not stand in for the schedule");
 const a=r.b.runNow(),b=r.b.runNow().catch(e=>e);assert.equal((await b).status,409);await a;
 assert.equal(r.b.status().running,false);
});

test("a run that finds another one going waits for the next tick",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}]}),a=r.b.runNow();await r.b.tick();await a;
 assert.equal(r.calls.length,1);await r.b.tick();assert.equal(r.calls.length,2);
});

test("the status gives what the panel needs",async()=>{
 const r=rig({freeSpace:async()=>({free:5e12,total:9e12})});await r.b.tick();const s=r.b.status();
 assert.deepEqual(s.config,DEFAULTS);assert.equal(s.next.quotidienne,at(2026,11,3,4));assert.equal(s.next.hebdomadaire,at(2026,11,9,4));assert.equal(s.next.mensuelle,at(2026,12,1,4));
 assert.equal(s.servers.length,2);const p=s.servers[0];
 assert.equal(p.files.length,3);assert.deepEqual(Object.keys(p.files[0]).sort(),["freq","name","size","t"]);assert.equal(p.files[0].t,MON);assert.equal(p.vapid,true);
 assert.equal(s.total,s.servers.flatMap(x=>x.files).reduce((n,f)=>n+f.size,0));
 assert.equal(s.lastSuccess,MON);
});

test("a name from a request never leaves the server's folder and is never a path",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}]});await r.b.tick();
 writeFileSync(join(r.root,"admin-pass"),"secret");writeFileSync(join(r.dir("prod"),"autre.db"),"x");
 const name="quotidienne-2026-11-02-1000.db";
 for(const bad of ["../../admin-pass","..\\admin-pass","/etc/passwd","autre.db","quotidienne-2026-11-02-1000.db/","quotidienne-2026-11-02-1000.db\0.txt","quotidienne-2026-11-02-1000.db.tmp","",null,42,{},["x"]]){
  await assert.rejects(r.b.remove("prod",bad),e=>e.status===400,String(bad));
  await assert.rejects(r.b.open("prod",bad),e=>e.status===400,String(bad));
 }
 for(const srv of ["..","../prod","inconnu",null]){await assert.rejects(r.b.remove(srv,name),e=>e.status===404,String(srv));await assert.rejects(r.b.open(srv,name),e=>e.status===404,String(srv));}
 await assert.rejects(r.b.remove("prod","vapid.json"),e=>e.status===400,"the key is not deleted from here");
 await assert.rejects(r.b.remove("prod","manuelle-2026-01-01-0000.db"),e=>e.status===404);
 const link="manuelle-2026-01-01-0000.db";symlinkSync(join(r.root,"admin-pass"),join(r.dir("prod"),link));
 await assert.rejects(r.b.open("prod",link),e=>e.status===404,"a link is not followed");
 const f=await r.b.open("prod",name);assert.ok(f.size>0);await f.fh.close();
 const v=await r.b.open("prod","vapid.json");await v.fh.close();
 await r.b.remove("prod",name);assert.ok(!existsSync(join(r.dir("prod"),name)));
 assert.ok(r.notes.some(([,t])=>t.includes(name)),"logged");
});

test("a clock that ran ahead then was put right: the schedule goes on, and the new backup survives the rotation",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}],now:at(2028,5,10,10)});
 await r.b.saveConfig({...DEFAULTS,quotidienne:{on:true,keep:2}});await r.b.tick();
 assert.ok(r.files("prod").includes("quotidienne-2028-05-10-1000.db"));
 r.t.now=at(2026,11,3,5);const n=r.calls.length;
 await createBackups(r.make()).tick();
 assert.equal(r.calls.length,n+1,"a date to come does not hold the appointments back");
 assert.ok(r.files("prod").includes("quotidienne-2026-11-03-0500.db"),"kept, even with a file dated 2028 sorted before it");
 const s=createBackups(r.make()).status().servers[0];assert.equal(s.last.quotidienne,at(2026,11,3,5));
 r.t.now=at(2026,11,4,5);const b=createBackups(r.make());await b.tick();
 assert.ok(r.files("prod").includes("quotidienne-2026-11-04-0500.db"));
});

test("settings that cannot be written: a readable 500, and the old settings stay",async()=>{
 const r=rig();mkdirSync(join(r.root,"backups.json","bloque"),{recursive:true});
 const e=await r.b.saveConfig({...DEFAULTS,hour:2}).catch(x=>x);
 assert.equal(e.status,500);assert.match(e.message,/Réglages non enregistrés/);
 assert.equal(r.b.config().hour,4);
});

test("leftovers of a stop in the middle of a copy go at the next start",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}]});mkdirSync(r.dir("prod"),{recursive:true});
 writeFileSync(join(r.dir("prod"),"quotidienne-2026-11-01-0400.db.tmp-123"),"half");writeFileSync(join(r.dir("prod"),"a-moi.tmp"),"mine");
 await createBackups(r.make()).tick();
 assert.deepEqual(r.files("prod").filter(f=>f.includes("tmp")),["a-moi.tmp"]);
});

test("F3, N2: a big base is checked in a child process: the console keeps answering meanwhile; past its delay the process is killed, one check at a time",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgbig-")),big=join(dir,"big.db");
 try{
  const d=new DatabaseSync(big);
  d.exec("PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT);CREATE TABLE junk(id INTEGER PRIMARY KEY,a TEXT,b BLOB);CREATE INDEX ja ON junk(a)");
  const ins=d.prepare("INSERT INTO junk(a,b) VALUES(?,?)"),blob=randomBytes(1000);d.exec("BEGIN");for(let i=0;i<60000;i++)ins.run(randomBytes(100).toString("hex"),blob);d.exec("COMMIT");d.close();
  // What the check costs here when run on the main thread: the main loop must never stop that long.
  let t=Date.now();const c=new DatabaseSync(big,{readOnly:true});c.prepare("PRAGMA quick_check").get();c.close();const inline=Date.now()-t;
  const r=rig({servers:[{id:"prod",label:"Prod"}]}),b=createBackups({...r.make(),take:async()=>{const path=join(r.src,"b.db");await fsp.copyFile(big,path);return {path};}});
  let gap=0,last=Date.now();const beat=setInterval(()=>{const n=Date.now();gap=Math.max(gap,n-last);last=n;},5);
  try{const out=await within(b.runNow(),60000,"backup of a big base");assert.equal(out[0].ok,true,JSON.stringify(out));}finally{clearInterval(beat);}
  assert.ok(gap<Math.max(40,inline*0.6),`the main loop stopped ${gap} ms (the check alone takes ${inline} ms)`);
  await assert.rejects(verify(big,{timeout:1}),/vérification trop longue/);
  await assert.rejects(verify(join(dir,"absent.db")),e=>e instanceof Error);
  // N2: a process of its own, gone (SIGKILL) as soon as the check gives up; the next one starts once it has exited.
  const pids=[];
  await assert.rejects(within(verify(big,{timeout:150,onStart:pid=>pids.push(pid)}),10000,"a check past its delay"),/vérification trop longue/);
  assert.equal(pids.length,1,"a child process");assert.throws(()=>process.kill(pids[0],0),e=>e.code==="ESRCH","killed and gone once given up");
  const seen=[];let firstAlive=null;
  const v1=verify(big,{timeout:150,onStart:pid=>seen.push(pid)}),v2=verify(big,{timeout:150,onStart:pid=>{try{process.kill(seen[0],0);firstAlive=true;}catch{firstAlive=false;}seen.push(pid);}});
  await within(Promise.allSettled([v1,v2]),10000,"two checks");
  assert.equal(seen.length,2);assert.equal(firstAlive,false,"the second check starts once the first process has exited");
  await within(verify(big),60000,"a check with its full delay");
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test("a slow or unreachable server never holds the others' backups: each has its delay, and is not taken twice meanwhile",async()=>{
 const r=rig(),base=r.make();let release;const hang=new Promise(ok=>{release=ok;});
 const b=createBackups({...base,partyMs:1000,take:async srv=>{if(srv.id==="prod"){r.calls.push("prod-hang");await hang;throw new Error("trop tard");}return base.take(srv);}});
 try{
  const t0=Date.now(),out=await within(b.runNow(),6000,"a run with a server that hangs");
  assert.ok(Date.now()-t0<4000);assert.match(out.find(x=>x.id==="prod").error,/délai dépassé/);assert.equal(out.find(x=>x.id==="test").ok,true,"the other one is taken");
  const again=await within(b.runNow(),6000,"a second run");assert.match(again.find(x=>x.id==="prod").error,/pas encore finie/);assert.equal(again.find(x=>x.id==="test").ok,true);
  r.t.now+=86400e3;const n=r.calls.length;await within(b.tick(),3000,"a tick");assert.equal(r.calls.filter(x=>x==="prod-hang").length,1,"not asked again while it runs");assert.ok(r.calls.length>n);
 }finally{release();}
 await sleep(50);
 const third=await within(b.runNow(),3000,"a run once it is over");assert.match(third.find(x=>x.id==="prod").error,/trop tard/);
});

test("the backups of a server no longer there (a party removed) stay listed, downloadable and deletable, never taken again",async()=>{
 const r=rig({servers:[{id:"prod",label:"Prod"}]});await r.b.tick();
 const old=r.dir("p-0badc0de"),name="manuelle-2026-11-01-1000.db";mkdirSync(old,{recursive:true});writeFileSync(join(old,name),"base");
 mkdirSync(join(r.root,"backups","Pas Un Id"));symlinkSync(r.dir("prod"),join(r.root,"backups","lien"));
 const s=r.b.status().servers;
 assert.deepEqual(s.map(x=>[x.id,x.name,!!x.removed]),[["prod","Prod",false],["p-0badc0de","Partie retirée (p-0badc0de)",true]]);
 assert.equal(s[1].files[0].name,name);assert.equal(s[1].failure,null);
 const f=await r.b.open("p-0badc0de",name);assert.equal(f.size,4);await f.fh.close();
 await assert.rejects(r.b.open("lien",name),e=>e.status===404,"a link is not a removed server");
 await assert.rejects(r.b.open("p-0badc0de","../prod/"+name),e=>e.status===400);
 const n=r.notes.length;await r.b.remove("p-0badc0de",name);assert.ok(!existsSync(join(old,name)));assert.equal(r.notes.length,n,"no game to log it in");
 const t=r.calls.length;await r.b.runNow();assert.equal(r.calls.length,t+1,"never taken again");
});

test("N3: a copy in WAL mode is checked immutable: no -shm nor -wal next to the backups; leftovers of a stop go, theirs included",async()=>{
 const wal=p=>{const d=new DatabaseSync(p);d.exec("PRAGMA journal_mode=WAL;CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO players(name) VALUES('Camille')");d.close();};
 const r=rig({servers:[{id:"prod",label:"Prod"}],write:wal});await r.b.tick();
 assert.deepEqual(r.files("prod"),["hebdomadaire-2026-11-02-1000.db","mensuelle-2026-11-02-1000.db","quotidienne-2026-11-02-1000.db","vapid.json"],"nothing written next to the copy");
 for(const x of ["-wal","-shm","-journal",""])writeFileSync(join(r.dir("prod"),`quotidienne-2026-11-01-0400.db.tmp-1a2b${x}`),"half");
 writeFileSync(join(r.dir("prod"),"quotidienne-2026-11-01-0400.db-wal"),"not ours");
 r.t.now=at(2026,11,3,5);await r.b.tick();
 assert.deepEqual(r.files("prod").filter(f=>/tmp|-wal|-shm|-journal/.test(f)),["quotidienne-2026-11-01-0400.db-wal"],"only this module's leftovers go");
});

test("N4: several servers backed up at once (3 at most): a slow one no longer holds the list back",async()=>{
 const ids=["a","b","c","d","e","f"],r=rig({servers:ids.map(id=>({id,label:id.toUpperCase()}))}),base=r.make();let now=0,max=0;
 const b=createBackups({...base,take:async srv=>{now++;max=Math.max(max,now);try{await sleep(800);return await base.take(srv);}finally{now--;}}});
 const t0=Date.now(),out=await within(b.runNow(),20000,"a run of six servers");
 assert.deepEqual(out.map(x=>x.id),ids,"results in the servers' order");assert.ok(out.every(x=>x.ok),JSON.stringify(out));
 assert.equal(max,3,"three at once, no more");assert.ok(Date.now()-t0<4000,`${Date.now()-t0} ms (one after the other: 4.8 s at least)`);
 for(const id of ids)assert.equal(r.files(id).filter(f=>f.startsWith("manuelle-")).length,1);
});
