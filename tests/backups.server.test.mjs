// The automatic backups through the real console and a real game server: a run on the schedule, the owner-only routes,
// the download, the alert, the admin log, and a game server that goes away.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readdirSync,existsSync,statSync,writeFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until} from "./server-helpers.mjs";

const API=3978,ADMIN=3979,PASS="mot-de-passe-admin-tres-long",SERVER=process.env.ADMIN_SERVER||"/w/admin/server.mjs";
let api,adm,dir,SOCK,DATA;
const DB=()=>"quotidienne";

function startAdmin(){
 const env={...process.env,PORT:String(ADMIN),ADMIN_DATA:DATA,POLITIGO_ADMIN_SERVERS:`Prod=${SOCK}`,POLITIGO_ADMIN_PASSWORD:PASS,ADMIN_BACKUP_TICK_MS:"150"};
 const p=spawn("node",[SERVER],{env,stdio:["ignore","pipe","pipe"]});p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo admin on/.test(p.out))ok(p);});p.on("exit",c=>ko(new Error("admin exited "+c+": "+p.err)));});
}
function browser(){
 let cookie="";
 const req=async(path,body={},raw=false)=>{
  const r=await fetch(`http://127.0.0.1:${ADMIN}${path}`,{method:"POST",body:JSON.stringify(body),headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1",Origin:`http://127.0.0.1:${ADMIN}`,...(cookie?{Cookie:cookie}:{})}});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  if(raw)return r;
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {req,login:(o={password:PASS})=>req("/api/login",o),call:(cmd,a={})=>req("/api/s/prod/call",{cmd,...a})};
}
const folder=()=>join(DATA,"backups","prod");
const owner=async()=>{const b=browser();assert.equal((await b.login()).status,200);return b;};

before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pgb1-"));DATA=mkdtempSync(join(tmpdir(),"pgbd-"));SOCK=join(dir,"admin.sock");
 api=await boot(API,dir,{POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_SERVER_NAME:"Prod"});await until(()=>existsSync(SOCK));
 await player(API,"Sauvegardee","left");
 adm=await startAdmin();
});
after(async()=>{await Promise.all([stop(api),stop(adm)]);});

test("the schedule takes the three backups by itself: real bases, private, and nothing left next to the socket",async()=>{
 assert.ok(await until(()=>{try{return readdirSync(folder()).filter(f=>f.endsWith(".db")).length===3;}catch{return false;}},8000),"three backups");
 assert.ok(await until(()=>!readdirSync(dir).some(f=>/^backup-\d+\.db$/.test(f))),"the API's copy is gone");
 const f=readdirSync(folder()).find(x=>x.startsWith(DB()));assert.match(f,/^quotidienne-\d{4}-\d{2}-\d{2}-\d{4}\.db$/);
 assert.equal(statSync(join(folder(),f)).mode&0o777,0o600);assert.equal(statSync(folder()).mode&0o777,0o700);
 const d=new DatabaseSync(join(folder(),f),{readOnly:true});
 assert.equal(d.prepare("SELECT count(*) n FROM players").get().n,1);assert.equal(d.prepare("PRAGMA quick_check").get().quick_check,"ok");d.close();
 const log=(await (await owner()).call("audit")).json.items;
 assert.ok(log.some(x=>x.cmd==="backup-note"&&/^Sauvegarde quotidienne, hebdomadaire, mensuelle : /.test(x.detail)),"told in the admin log");
});

test("the panel's data, the settings, a backup by hand",async()=>{
 const b=await owner(),s=(await b.req("/api/backups/list")).json;
 assert.equal(s.ok,true);assert.equal(s.config.hour,4);assert.equal(s.servers[0].id,"prod");assert.equal(s.servers[0].name,"Prod");assert.equal(s.servers[0].files.length,3);assert.ok(s.total>0);assert.ok(s.disk.free>0);assert.ok(s.next.quotidienne>Date.now());
 const config={...s.config,hour:5,mensuelle:{on:false,keep:2}};
 assert.equal((await b.req("/api/backups/save",{config})).status,200);assert.equal((await b.req("/api/backups/list")).json.config.hour,5);
 assert.equal((await b.req("/api/backups/save",{config:{hour:99}})).status,400);
 const r=await b.req("/api/backups/run");assert.equal(r.status,200);assert.deepEqual(r.json.results,[{id:"prod",ok:true}]);
 assert.ok(readdirSync(folder()).some(f=>f.startsWith("manuelle-")));
});

test("download: the file itself, streamed as an attachment; a bad name stays out",async()=>{
 const b=await owner(),name=readdirSync(folder()).find(f=>f.startsWith("manuelle-"));
 const r=await b.req("/api/backups/download",{server:"prod",name},true);
 assert.equal(r.status,200);assert.match(r.headers.get("content-disposition"),/attachment; filename="politigo-prod-manuelle-/);assert.equal(r.headers.get("cache-control"),"no-store");
 const body=Buffer.from(await r.arrayBuffer());assert.equal(body.length,statSync(join(folder(),name)).size);assert.equal(body.subarray(0,15).toString(),"SQLite format 3");
 const k=await b.req("/api/backups/download",{server:"prod",name:"vapid.json"},true);assert.ok([200,404].includes(k.status));
 for(const bad of ["../../backups.json","../backups-state.json","/etc/passwd","..%2Fbackups.json"])assert.equal((await b.req("/api/backups/download",{server:"prod",name:bad})).status,400,bad);
 assert.equal((await b.req("/api/backups/download",{server:"../..",name})).status,404);
});

test("nothing without the session, nothing for a moderator, and no backup-note from the page",async()=>{
 const none=browser();for(const p of ["list","save","run","delete","download"])assert.equal((await none.req(`/api/backups/${p}`,{})).status,401,p);
 const b=await owner();
 assert.equal((await b.call("backup-note",{detail:"faux"})).status,400,"not on the console's list of commands");
 const list=(await b.call("list")).json.players,id=list[0].id;
 const made=await b.req("/api/mods/save",{player:id,server:"prod",panels:["traiter"],actions:[],servers:["prod"]});
 assert.equal(made.status,200,JSON.stringify(made.json));
 const m=browser();assert.equal((await m.login({name:made.json.mod.name,password:made.json.password})).status,200);
 for(const p of ["list","save","run","delete","download"])assert.equal((await m.req(`/api/backups/${p}`,{})).status,403,p);
});

test("a game server gone: the failure shows in À traiter for the owner alone, and the good backups stay",async()=>{
 const b=await owner(),kept=readdirSync(folder()).filter(f=>f.endsWith(".db")),mods=(await b.req("/api/mods")).json.mods;
 const pw=(await b.req("/api/mods/password",{id:mods[0].id})).json.password;
 // The state says a daily backup never ran, as after a new day: the tick has to try, and the socket is gone.
 await stop(api);
 const r=await b.req("/api/backups/run");assert.equal(r.status,200);assert.equal(r.json.results[0].ok,false);
 assert.match((await b.req("/api/backups/list")).json.servers[0].failure.error,/API|injoignable/);
 assert.deepEqual(readdirSync(folder()).filter(f=>f.endsWith(".db")),kept);
 assert.equal((await b.call("alerts")).json.items[0]?.kind,"backup","shown even with the game server down");
 api=await boot(API,dir,{POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_SERVER_NAME:"Prod"});await until(()=>existsSync(SOCK));
 const a=(await b.call("alerts")).json.items.find(x=>x.kind==="backup");
 assert.ok(a,"the owner sees it");assert.equal(a.noAck,true);
 const m=browser();assert.equal((await m.login({name:mods[0].name,password:pw})).status,200);
 assert.equal((await m.call("alerts")).json.items.filter(x=>x.kind==="backup").length,0,"a moderator does not");
 assert.equal((await b.req("/api/backups/run")).json.results[0].ok,true);
 assert.equal((await b.call("alerts")).json.items.filter(x=>x.kind==="backup").length,0,"gone with the next success");
});

test("a stopped console finds its schedule again, and a deleted backup is gone",async()=>{
 const b=await owner(),name=readdirSync(folder()).find(f=>f.startsWith("manuelle-"));
 assert.equal((await b.req("/api/backups/delete",{server:"prod",name})).status,200);assert.ok(!existsSync(join(folder(),name)));
 assert.equal((await b.req("/api/backups/delete",{server:"prod",name})).status,404);
 assert.equal((await b.req("/api/backups/delete",{server:"prod",name:"vapid.json"})).status,400);
 writeFileSync(join(folder(),"a-moi.txt"),"x");
 const before=readdirSync(folder()).length;
 await stop(adm);adm=await startAdmin();await new Promise(r=>setTimeout(r,600));
 assert.equal(readdirSync(folder()).length,before,"no backup twice after a restart");
});
