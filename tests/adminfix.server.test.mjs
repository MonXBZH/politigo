// Fixes after the 1.7.1 audit, through the real console and two real game servers: a second server mounted under
// another path can be backed up; a moderator's rights stand on their own game account (deleted, renamed elsewhere:
// none left; renamed from the console: followed); moderators' writes are rate-limited; sessions are capped per account;
// the moderators' management is in the admin log; /api/servers only tells a moderator what their panels show.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import net from "node:net";
import {mkdtempSync,readdirSync,writeFileSync,existsSync,symlinkSync,utimesSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until} from "./server-helpers.mjs";

const API1=3800,API2=3803,ADMIN=3806,PASS="mot-de-passe-admin-tres-long";
const SERVER=process.env.ADMIN_SERVER||"/w/admin/server.mjs";
let api1,api2,adm,dir1,dir2,S1,S2,link;

function startAdmin(port,extra){
 const env={...process.env,PORT:String(port),ADMIN_DATA:mkdtempSync(join(tmpdir(),"pgfx-")),ADMIN_BACKUP_TICK_MS:"0",ADMIN_LINK_CACHE_MS:"0",...extra};
 const p=spawn("node",[SERVER],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo admin on/.test(p.out))ok(p);});p.on("exit",c=>ko(new Error("admin exited "+c+": "+p.err)));});
}
before(async()=>{
 dir1=mkdtempSync(join(tmpdir(),"pgf1-"));dir2=mkdtempSync(join(tmpdir(),"pgf2-"));S1=join(dir1,"admin.sock");S2=join(dir2,"admin.sock");
 // The Test stack's socket volume, mounted in the admin container under another path than the API's own.
 link=join(mkdtempSync(join(tmpdir(),"pgfl-")),"politigo-test");symlinkSync(dir2,link);
 [api1,api2]=await Promise.all([boot(API1,dir1,{POLITIGO_ADMIN_SOCKET:S1,POLITIGO_SERVER_NAME:"Prod"}),boot(API2,dir2,{POLITIGO_ADMIN_SOCKET:S2,POLITIGO_SERVER_NAME:"Test"})]);
 await until(()=>existsSync(S1)&&existsSync(S2));
 adm=await startAdmin(ADMIN,{POLITIGO_ADMIN_SERVERS:`Prod=${S1};Test=${join(link,"admin.sock")}`,POLITIGO_ADMIN_PASSWORD:PASS,ADMIN_PROXY_HOPS:"1"});
});
after(async()=>{await Promise.all([stop(api1),stop(api2),stop(adm)]);});

let ipSeq=0;
function browser(){
 let cookie="";const ip=`10.8.0.${++ipSeq}`;
 const req=async(path,body={},raw=false)=>{
  const r=await fetch(`http://127.0.0.1:${ADMIN}${path}`,{method:"POST",body:JSON.stringify(body),
   headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1",Origin:`http://127.0.0.1:${ADMIN}`,"X-Forwarded-For":ip,...(cookie?{Cookie:cookie}:{})}});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  if(raw)return r;
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json,headers:r.headers};
 };
 return {req,login:(o={password:PASS})=>req("/api/login",o),call:(srv,cmd,a={})=>req(`/api/s/${srv}/call`,{cmd,...a})};
}
const owner=async()=>{const b=browser();assert.equal((await b.login()).status,200);return b;};
// The game's own admin socket, as the command line uses it: what happens outside the console.
const raw=(sock,req)=>new Promise((ok,ko)=>{const s=net.createConnection(sock);let d="";s.on("connect",()=>s.write(JSON.stringify(req)+"\n"));s.on("data",x=>{d+=x;});s.on("end",()=>{try{ok(JSON.parse(d));}catch(e){ko(e);}});s.on("error",ko);});
async function makeMod(b,srv,name,o={}){
 const id=(await b.call(srv,"list")).json.players.find(p=>p.name===name).id;
 const r=await b.req("/api/mods/save",{server:srv,player:id,panels:o.panels??["joueurs","tableau"],actions:o.actions??["chat-mute","rename"],servers:o.servers??[]});
 assert.equal(r.status,200,JSON.stringify(r.json));return {id,mod:r.json.mod,password:r.json.password};
}
const modLogin=async(name,password)=>{const m=browser();const r=await m.login({name,password});return {m,r};};

test("a second server mounted under another path: backed up by hand, on the schedule's button, and its key",async()=>{
 const b=await owner();
 // Leftovers of a copy the API could not finish (a full disk): an old partial base, a journal without its base.
 writeFileSync(join(dir2,"backup-1000.db"),"partiel");const old=(Date.now()-3600e3)/1000;utimesSync(join(dir2,"backup-1000.db"),old,old);
 writeFileSync(join(dir2,"backup-1001.db-journal"),"j");writeFileSync(join(dir2,"backup-x.txt"),"a moi");
 const r=await b.req("/api/s/test/backup",{},true);
 assert.equal(r.status,200,await r.clone().text());
 assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,15).toString(),"SQLite format 3");
 const run=await b.req("/api/backups/run");assert.deepEqual(run.json.results,[{id:"prod",ok:true},{id:"test",ok:true}]);
 assert.ok(await until(()=>!readdirSync(dir2).some(f=>/^backup-\d+\.db(-journal)?$/.test(f))),"the API's copies and the leftovers are gone: "+readdirSync(dir2));
 assert.ok(existsSync(join(dir2,"backup-x.txt")),"any other name stays");
 assert.ok([200,404].includes((await b.req("/api/s/test/backup-vapid")).status),"its key, or no key: never a path error");
});

test("a moderator's own account: not deleted under them, renamed from the console it follows, renamed or deleted elsewhere no rights left",async()=>{
 const b=await owner();await player(API1,"Modo Lien");await player(API1,"Cible Lien","right");
 const {id,mod,password}=await makeMod(b,"prod","Modo Lien");
 let {m,r}=await modLogin("Modo Lien",password);assert.equal(r.status,200);
 const del=await b.call("prod","player-delete",{id,confirm:"Modo Lien"});
 assert.equal(del.status,409);assert.match(del.json.error,/modérateur Modo Lien/);
 // Renamed from the console: the link and the login name follow.
 assert.equal((await b.call("prod","rename",{id,newName:"Modo Renomme"})).status,200);
 assert.equal((await b.req("/api/mods")).json.mods.find(x=>x.id===mod.id).name,"Modo Renomme");
 assert.equal((await m.req("/api/me")).json.name,"Modo Renomme");
 assert.equal((await m.call("prod","list")).status,200,"still their rights");
 assert.equal((await modLogin("Modo Lien",password)).r.status,401,"the old name no longer logs in");
 ({m,r}=await modLogin("Modo Renomme",password));assert.equal(r.status,200);
 // Renamed outside the console: no longer the account the console knows.
 assert.equal((await raw(S1,{cmd:"rename",id,newName:"Modo Ailleurs"})).ok,true);
 const gone=await m.call("prod","list");assert.equal(gone.status,403);assert.match(gone.json.error,/n'existe plus ou a changé/);
 assert.equal((await m.req("/api/s/prod/reset-password",{name:"Cible Lien"})).status,403);
 assert.equal((await m.req("/api/servers")).json.servers.length,0,"not listed either");
 const card=(await b.req("/api/mods")).json.mods.find(x=>x.id===mod.id);assert.deepEqual(card.account,{ok:false,name:"Modo Ailleurs"});
 const again=await modLogin("Modo Renomme",password);assert.equal(again.r.status,403,"nothing left: the login says why");
 // Deleted outside the console (the command line): gone.
 assert.equal((await raw(S1,{cmd:"player-delete",id,confirm:"Modo Ailleurs"})).ok,true);
 assert.deepEqual((await b.req("/api/mods")).json.mods.find(x=>x.id===mod.id).account,{ok:false,name:null});
 assert.equal((await m.call("prod","stats")).status,403);
 assert.equal((await b.req("/api/mods/delete",{id:mod.id})).status,200);
});

test("the same id given to someone else (a restored base): a stranger is not taken for the moderator",async()=>{
 const b=await owner();await player(API2,"Modo Test");
 const {id,password}=await makeMod(b,"test","Modo Test",{servers:["prod"]});
 const {m}=await modLogin("Modo Test",password);
 assert.equal((await m.call("test","list")).status,200);
 // As after a restore: the account is gone and its number now carries another name.
 assert.equal((await raw(S2,{cmd:"rename",id,newName:"Inconnu Six"})).ok,true);
 assert.equal((await m.call("test","list")).status,403);
 assert.equal((await m.call("prod","list")).status,200,"no account of theirs on Prod: their rights there stand");
});

test("a moderator's writes: 30 a minute at most, then a readable 429; reads and the owner are not limited",async()=>{
 const b=await owner();await player(API1,"Modo Rafale");await player(API1,"Cible Rafale");
 const {password}=await makeMod(b,"prod","Modo Rafale",{actions:["chat-mute"]});
 const {m}=await modLogin("Modo Rafale",password);
 for(let i=0;i<30;i++)assert.equal((await m.call("prod","chat-mute",{name:"Cible Rafale",hours:0})).status,200,`write ${i+1}`);
 const r=await m.call("prod","chat-mute",{name:"Cible Rafale",hours:0});
 assert.equal(r.status,429);assert.match(r.json.error,/30 par minute/);assert.ok(+r.headers.get("retry-after")>0);
 assert.equal((await m.call("prod","list")).status,200,"a read still passes");
 for(let i=0;i<35;i++)assert.equal((await b.call("prod","chat-mute",{name:"Cible Rafale",hours:0})).status,200,`owner ${i+1}`);
});

test("sessions are capped per account: a moderator's logins close their own oldest, never the owner's",async()=>{
 const b=await owner();await player(API1,"Modo Session");
 const {password}=await makeMod(b,"prod","Modo Session");
 const first=(await modLogin("Modo Session",password)).m;assert.equal((await first.req("/api/me")).status,200);
 const later=[];for(let i=0;i<5;i++){const x=await modLogin("Modo Session",password);assert.equal(x.r.status,200);later.push(x.m);}
 assert.equal((await first.req("/api/me")).status,401,"their oldest one is closed");
 for(const x of later)assert.equal((await x.req("/api/me")).status,200);
 assert.equal((await b.req("/api/me")).status,200,"the owner's stays");
});

test("the moderators' management is in the admin log, without the password",async()=>{
 const b=await owner();await player(API1,"Modo Journal");
 const {mod,password}=await makeMod(b,"prod","Modo Journal");
 assert.equal((await b.req("/api/mods/save",{id:mod.id,panels:["chat"],actions:["chat-delete"]})).status,200);
 const pw=(await b.req("/api/mods/password",{id:mod.id})).json.password;
 assert.equal((await b.req("/api/mods/delete",{id:mod.id})).status,200);
 const lines=await until(async()=>{const l=(await b.call("prod","audit",{limit:500})).json.items.filter(x=>x.cmd==="backup-note"&&/Modo Journal/.test(x.detail));return l.length>=4&&l;});
 assert.ok(lines,"four lines");
 const text=lines.map(x=>x.detail).join("\n");
 for(const re of [/Modérateur ajouté : Modo Journal \(panneaux : joueurs, tableau ; actions : chat-mute, rename/,/Droits du modérateur Modo Journal modifiés \(panneaux : chat ; actions : chat-delete/,/Nouveau mot de passe généré pour le modérateur Modo Journal/,/Modérateur retiré : Modo Journal/])assert.match(text,re);
 assert.ok(!text.includes(password)&&!text.includes(pw),"never a password");
});

test("/api/servers full: the next announcement and the chat reports only with their panels",async()=>{
 const b=await owner();await player(API1,"Modo Tableau");await player(API1,"Modo Annonces");
 const own=(await b.req("/api/servers",{full:true})).json.servers[0];assert.ok("nextAnnounce" in own&&"chatReports" in own);
 const t=await makeMod(b,"prod","Modo Tableau",{panels:["tableau"],actions:[]});
 const s1=(await (await modLogin("Modo Tableau",t.password)).m.req("/api/servers",{full:true})).json.servers[0];
 assert.equal(s1.up,true);assert.ok(!("nextAnnounce" in s1),"no announcements panel");assert.ok(!("chatReports" in s1),"no chat panel");
 const a=await makeMod(b,"prod","Modo Annonces",{panels:["annonces","chat"],actions:[]});
 const s2=(await (await modLogin("Modo Annonces",a.password)).m.req("/api/servers",{full:true})).json.servers[0];
 assert.ok("nextAnnounce" in s2&&"chatReports" in s2);
});
