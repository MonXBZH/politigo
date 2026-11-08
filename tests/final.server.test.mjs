// The last fixes of the 1.7.1 audit, on real servers (ports 3830-3835): the console's player list says when each
// player was last seen; a backup the API cannot finish (a full volume, a missing folder) leaves nothing behind and
// says why, and the leftovers of an older one go; the Bâton duel tells its two players when their round started (a
// reload on another device); a moderator never reaches another moderator's account, messages or feed lines, through the
// real console, and an API that does not answer is not taken for a deleted account; names that pass for the organiser.
// The full volume is the container's own /dev/shm (a 64 MB tmpfs), filled up to a few kilobytes.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import net from "node:net";
import {mkdtempSync,readdirSync,writeFileSync,existsSync,utimesSync,renameSync,unlinkSync,statfsSync,rmSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,client,until,INVITE,PW} from "./server-helpers.mjs";
import {BD} from "../web/duel.mjs";

const API=3830,ADMIN=3832,FULL=3833,DUEL=3834,ADMIN2=3835,K=20,PASS="mot-de-passe-admin-tres-long";
const SERVER=process.env.ADMIN_SERVER||"/w/admin/server.mjs";
const SHM="/dev/shm",HAS_SHM=(()=>{try{return statfsSync(SHM).blocks>0;}catch{return false;}})();
let api,full,duelApi,adm,adm2,dbDir,sockDir,shmDir,S1,S3,filler;
const apiEnv=()=>({POLITIGO_ADMIN_SOCKET:S1,POLITIGO_SERVER_NAME:"Prod",POLITIGO_CHAT:"on"});

function startAdmin(port,extra){
 const env={...process.env,PORT:String(port),ADMIN_DATA:mkdtempSync(join(tmpdir(),"pgfn-")),ADMIN_BACKUP_TICK_MS:"0",ADMIN_LINK_CACHE_MS:"0",...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];   // undefined: the console's own default
 const p=spawn("node",[SERVER],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo admin on/.test(p.out))ok(p);});p.on("exit",c=>ko(new Error("admin exited "+c+": "+p.err)));});
}
const old=(f,min)=>{const t=(Date.now()-min*60e3)/1000;utimesSync(f,t,t);};
before(async()=>{
 dbDir=mkdtempSync(join(tmpdir(),"pgfn1-"));sockDir=mkdtempSync(join(tmpdir(),"pgfn2-"));S1=join(sockDir,"admin.sock");
 api=await boot(API,dbDir,apiEnv());
 const servers=[`Prod=${S1}`];
 if(HAS_SHM){
  // Leftovers of copies cut short before this boot: the first sweep's chores take the old ones away.
  shmDir=mkdtempSync(join(SHM,"pgfn-"));S3=join(shmDir,"admin.sock");
  for(const f of ["backup-1000.db-journal","backup-1001.db","backup-x.db-journal","autre.txt"]){writeFileSync(join(shmDir,f),"j");old(join(shmDir,f),20);}
  writeFileSync(join(shmDir,"backup-1002.db-journal"),"j");   // a copy perhaps still running: too young
  full=await boot(FULL,mkdtempSync(join(tmpdir(),"pgfn3-")),{POLITIGO_ADMIN_SOCKET:S3,POLITIGO_SERVER_NAME:"Plein"});
  servers.push(`Plein=${S3}`);
 }
 await until(()=>existsSync(S1)&&(!S3||existsSync(S3)));
 adm=await startAdmin(ADMIN,{POLITIGO_ADMIN_SERVERS:servers.join(";"),POLITIGO_ADMIN_PASSWORD:PASS,ADMIN_PROXY_HOPS:"1"});
});
after(async()=>{
 if(filler)try{unlinkSync(filler);}catch{}
 await Promise.all([stop(api),full&&stop(full),duelApi&&stop(duelApi),stop(adm),adm2&&stop(adm2)].filter(Boolean));
 if(shmDir)rmSync(shmDir,{recursive:true,force:true});
});

let ipSeq=0;
function browser(port=ADMIN){
 let cookie="";const ip=`10.8.3.${++ipSeq}`;
 const req=async(path,body={},raw=false)=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method:"POST",body:JSON.stringify(body),
   headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1",Origin:`http://127.0.0.1:${port}`,"X-Forwarded-For":ip,...(cookie?{Cookie:cookie}:{})}});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  if(raw)return r;
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json,headers:r.headers};
 };
 return {req,login:(o={password:PASS})=>req("/api/login",o),call:(srv,cmd,a={})=>req(`/api/s/${srv}/call`,{cmd,...a})};
}
const owner=async(port)=>{const b=browser(port);assert.equal((await b.login()).status,200);return b;};
const raw=(sock,req)=>new Promise((ok,ko)=>{const s=net.createConnection(sock);let d="";s.on("connect",()=>s.write(JSON.stringify(req)+"\n"));s.on("data",x=>{d+=x;});s.on("end",()=>{try{ok(JSON.parse(d));}catch(e){ko(e);}});s.on("error",ko);});
const copies=dir=>readdirSync(dir).filter(f=>/^backup-\d+\.db/.test(f));

test("list: each player's last visit (lastSeen), not the time their game was last saved",async()=>{
 const b=await owner();await player(API,"Vu Ancien");
 const seen=Date.now()-3*864e5;
 await stop(api);
 const db=new DatabaseSync(join(dbDir,"t.db"));db.prepare("UPDATE players SET last_seen=? WHERE name='Vu Ancien'").run(seen);db.close();
 api=await boot(API,dbDir,apiEnv());await until(()=>existsSync(S1));
 const l=await b.call("prod","list");assert.equal(l.status,200,JSON.stringify(l.json));
 const row=l.json.players.find(p=>p.name==="Vu Ancien");
 assert.equal(row.lastSeen,seen);assert.notEqual(row.updated,seen);
 assert.ok(l.json.players.every(p=>"lastSeen" in p));
 assert.equal((await b.call("prod","player",{id:row.id})).json.player.lastSeen,seen,"the sheet says the same");
});

test("a backup the API cannot write in a missing folder: nothing left, a readable 507 cause",async()=>{
 // The socket's folder replaced by a plain file; the socket itself still answers from where it went.
 const moved=sockDir+"-ailleurs";renameSync(sockDir,moved);writeFileSync(sockDir,"pas un dossier");
 try{
  const r=await raw(join(moved,"admin.sock"),{cmd:"backup"});
  assert.equal(r.ok,false);assert.equal(r.error,"Sauvegarde impossible : la copie de la base a échoué (voir les journaux de l'API).");
  assert.match(api.err,/backup:/,"the cause is in the API's logs");
 }finally{unlinkSync(sockDir);renameSync(moved,sockDir);}
 assert.deepEqual(copies(sockDir),[]);
 const ok=await raw(S1,{cmd:"backup"});assert.equal(ok.ok,true,JSON.stringify(ok));unlinkSync(ok.path);
});

test("a full volume next to the socket: the partial copy goes at once, the API and the console say the volume is full",{skip:!HAS_SHM&&"no /dev/shm here"},async()=>{
 // The first sweep's chores: old partial copies and journals gone, a young journal and any other name kept.
 assert.ok(await until(()=>!existsSync(join(shmDir,"backup-1000.db-journal"))&&!existsSync(join(shmDir,"backup-1001.db"))),"old leftovers purged: "+readdirSync(shmDir));
 for(const f of ["backup-1002.db-journal","backup-x.db-journal","autre.txt"])assert.ok(existsSync(join(shmDir,f)),f+" stays");
 unlinkSync(join(shmDir,"backup-1002.db-journal"));
 const p=await player(FULL,"Plein Un");for(let i=0;i<5;i++)await p.call("GET","/api/me");
 // Fill the tmpfs up to 16 KB: enough for nothing but the copy's first pages.
 const s=statfsSync(shmDir);filler=join(shmDir,"filler");writeFileSync(filler,Buffer.alloc(Number(s.bavail)*s.bsize-16384));
 const r=await raw(S3,{cmd:"backup"});
 assert.equal(r.ok,false);assert.equal(r.error,"Sauvegarde impossible : le volume du socket d'administration est plein.");
 assert.deepEqual(copies(shmDir),[],"no partial copy, no journal");
 // The console: a 507 that names the volume, nothing left behind either.
 const b=await owner(),c=await b.req("/api/s/plein/backup");
 assert.equal(c.status,507,JSON.stringify(c.json));assert.match(c.json.error,/volume du socket d'administration est presque plein \(0\.\d Mo libres\)/);
 assert.deepEqual(copies(shmDir),[]);
 // Room again: the backup works.
 unlinkSync(filler);filler=null;
 const again=await b.req("/api/s/plein/backup",{},true);assert.equal(again.status,200);
 assert.equal(Buffer.from(await again.arrayBuffer()).subarray(0,15).toString(),"SQLite format 3");
 assert.ok(await until(()=>copies(shmDir).length===0),"the downloaded copy goes too");
});

test("duelPublic: roundStart, the start of the round under way, for the challenger and the bearer alone",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgfn4-")),env={POLITIGO_BATON_SPEED:String(K)};
 duelApi=await boot(DUEL,dir,env);
 const A=await player(DUEL,"Porteur Final","left"),C=await player(DUEL,"Defi Final","right"),W=await player(DUEL,"Temoin Final");
 await stop(duelApi);
 const db=new DatabaseSync(join(dir,"t.db"));
 const edit=(name,fn)=>{const r=db.prepare("SELECT state FROM players WHERE name=?").get(name),S=JSON.parse(r.state);fn(S);db.prepare("UPDATE players SET state=? WHERE name=?").run(JSON.stringify(S),name);};
 edit(C.name,S=>{S.flame.pts=400;});edit(A.name,S=>{S.flame.pts=400;if(!S.wardrobe.own.includes("baton"))S.wardrobe.own.push("baton");});
 db.prepare("INSERT INTO mythics(item,player_id,t,deaths,warned) VALUES('baton',(SELECT id FROM players WHERE name=?),?,0,0)").run(A.name,Date.now());db.close();
 duelApi=await boot(DUEL,dir,env);
 const duel=async c=>(await c.call("GET","/api/me")).json.baton.duel,bat=(c,b)=>c.call("POST","/api/baton",b);
 const ch=await bat(C,{op:"challenge"});assert.equal(ch.status,200,JSON.stringify(ch.json));
 const id=ch.json.duel.id;assert.equal(ch.json.baton.duel.status,"c_play","the bearer is away: deferred");
 assert.equal((await duel(C)).roundStart,null,"not started");
 // The challenger's three rounds, alone; each one's start is told to both players, never to anyone else.
 for(let n=0;n<BD.rounds;n++){
  const r=await bat(C,{op:"ready",id});assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.round.n,n);
  const start=r.json.round.start,dc=await duel(C),da=await duel(A),dw=await duel(W);
  assert.equal(dc.n,n);assert.equal(dc.roundStart,start,"a reload, here or elsewhere, knows the round runs");
  assert.equal(da.roundStart,start);assert.equal(da.role,"bearer");
  assert.ok(dw&&!("roundStart" in dw),"a spectator is not told");
  assert.equal((await bat(C,{op:"ready",id})).json.round.start,start,"ready again: the same round");
  // Nobody presses: the whistle ends the round ((round+3 s)/K later), then the start is no longer given.
  assert.ok(await until(async()=>{const d=await duel(C);return d.roundStart===null&&(d.n>n||d.status==="b_wait");},(BD.round+3000)/K+4000),`round ${n} over`);
 }
 assert.equal((await duel(C)).status,"b_wait");
 // The bearer's part: her own rounds start afresh.
 const rb=await bat(A,{op:"ready",id});assert.equal(rb.status,200,JSON.stringify(rb.json));
 const db2=await duel(A);assert.equal(db2.status,"b_play");assert.equal(db2.n,0);assert.equal(db2.roundStart,rb.json.round.start);
 assert.ok(!("roundStart" in await duel(W)));
});

test("a moderator's commands never reach another moderator's account (the console sends their ids); the owner's do",async()=>{
 const b=await owner();
 const pl={};for(const n of ["Modo Un","Modo Deux","Joueur Lambda","Joueur Autre"])pl[n]=await player(API,n);
 const list=(await b.call("prod","list")).json.players,idOf=n=>list.find(p=>p.name===n).id;
 const save=async(name,actions)=>{const r=await b.req("/api/mods/save",{server:"prod",player:idOf(name),panels:["joueurs","traiter"],actions,servers:[]});assert.equal(r.status,200,JSON.stringify(r.json));return r.json.password;};
 const ALL=["rename","suspend","signout","chat-mute","reset-password","unlock","alerts-ack","player-delete","chat-delete","feed-delete"];
 const pw=await save("Modo Un",ALL);await save("Modo Deux",["chat-mute"]);
 const m=browser();assert.equal((await m.login({name:"Modo Un",password:pw})).status,200);
 const two=idOf("Modo Deux");
 const on=(id,name)=>[["rename",{id,newName:"Nouveau Nom"}],["suspend",{id,on:true}],["signout",{id}],["chat-mute",{name,hours:1}],
  ["unlock",{id}],["abandoned-ignore",{id}],["player-delete",{id,confirm:name}]];
 for(const [cmd,a] of on(two,"Modo Deux")){
  const r=await m.call("prod",cmd,a);
  assert.equal(r.status,422,cmd);assert.equal(r.json.error,"Action impossible sur le compte d'un modérateur.",cmd);
 }
 const rp=await m.req("/api/s/prod/reset-password",{name:"Modo Deux"});
 assert.notEqual(rp.status,200);assert.equal(rp.json.error,"Action impossible sur le compte d'un modérateur.");
 // The page cannot clear the list: the console's own ids are what the API reads.
 assert.equal((await m.call("prod","rename",{id:two,newName:"Nouveau Nom",mods:[]})).json.error,"Action impossible sur le compte d'un modérateur.");
 assert.equal((await b.call("prod","player",{id:two})).json.player.name,"Modo Deux","untouched");
 // What a moderator owns: their chat messages and their lines in the public feed (guard, feed-delete).
 const say=async n=>{const r=await pl[n].call("POST","/api/chat",{room:"global",text:`Bonjour de ${n}`});assert.equal(r.status,200,JSON.stringify(r.json));return r.json.message.id;};
 const db=new DatabaseSync(join(dbDir,"t.db"),{timeout:5000});
 const line=n=>Number(db.prepare("INSERT INTO feed(t,player,kind,text) VALUES(?,?,'duel',?)").run(Date.now(),n,`${n} défie quelqu'un au Débat chrono.`).lastInsertRowid);
 const msg2=await say("Modo Deux"),feed2=line("Modo Deux"),msgL=await say("Joueur Lambda"),feedL=line("Joueur Lambda");db.close();
 for(const [cmd,id] of [["chat-delete",msg2],["feed-delete",feed2]]){
  const r=await m.call("prod",cmd,{id});assert.equal(r.status,422,cmd);assert.equal(r.json.error,"Action impossible sur le compte d'un modérateur.",cmd);
 }
 assert.ok((await b.call("prod","feed-list",{limit:50})).json.items.some(x=>x.id===feed2),"the line stays");
 assert.equal((await m.call("prod","chat-delete",{id:msgL})).status,200);assert.equal((await m.call("prod","feed-delete",{id:feedL})).status,200);
 assert.equal((await b.call("prod","chat-delete",{id:msg2})).status,200,"the owner may");assert.equal((await b.call("prod","feed-delete",{id:feed2})).status,200);
 // An ordinary player: every one of those passes.
 const lam=idOf("Joueur Lambda");
 for(const [cmd,a] of on(lam,"Joueur Lambda").filter(([c])=>c!=="player-delete"&&c!=="rename"))assert.equal((await m.call("prod",cmd,a)).status,200,cmd);
 assert.equal((await m.call("prod","suspend",{id:lam,on:false})).status,200);
 assert.equal((await m.req("/api/s/prod/reset-password",{name:"Joueur Lambda"})).status,200);
 assert.equal((await m.call("prod","rename",{id:lam,newName:"Joueur Renomme"})).status,200);
 assert.equal((await m.call("prod","player-delete",{id:idOf("Joueur Autre"),confirm:"Joueur Autre"})).status,200);
 // The owner may act on a moderator's account (deleting it aside: see adminfix.server.test.mjs).
 assert.equal((await b.call("prod","chat-mute",{name:"Modo Deux",hours:0})).status,200);
 assert.equal((await b.req("/api/s/prod/reset-password",{name:"Modo Deux"})).status,200);
 assert.equal((await b.call("prod","rename",{id:two,newName:"Modo Deux Bis"})).status,200);
 // Modo Deux, renamed by the owner, is still a moderator: still out of Modo Un's reach.
 assert.equal((await m.call("prod","signout",{id:two})).json.error,"Action impossible sur le compte d'un modérateur.");
});

test("names that pass for the organiser's « Annonce officielle » are refused, lookalikes and order aside; neighbours pass",async()=>{
 const reg=name=>client(API).call("POST","/api/register",{name,password:PW,invite:INVITE,camp:"left"});
 for(const name of ["4nnonce Offici3l","Annonces Officielles","Officiel annonce","Annoŋce 0fficielle"]){
  const r=await reg(name);assert.equal(r.status,400,name);assert.equal(r.json.error,"Ce pseudo est réservé à l'organisation.",name);
 }
 for(const name of ["Annonceur officieux","Officier Lili","Lionel 01"])assert.equal((await reg(name)).status,201,name);
 // The console's rename holds the same line.
 const b=await owner(),id=(await b.call("prod","list")).json.players.find(p=>p.name==="Lionel 01").id;
 const r=await b.call("prod","rename",{id,newName:"Officiel annonce"});assert.equal(r.status,422);assert.equal(r.json.error,"Ce pseudo est réservé à l'organisation.");
});

// Last: it stops the API. A console that keeps its links 30 s (the default), as in production.
test("an API that does not answer is not taken for a moderator's deleted account, nor kept as such once back",async()=>{
 adm2=await startAdmin(ADMIN2,{POLITIGO_ADMIN_SERVERS:`Prod=${S1}`,POLITIGO_ADMIN_PASSWORD:PASS,ADMIN_PROXY_HOPS:"1",ADMIN_LINK_CACHE_MS:undefined});
 const b=await owner(ADMIN2);await player(API,"Modo Panne");
 const id=(await b.call("prod","list")).json.players.find(p=>p.name==="Modo Panne").id;
 const s=await b.req("/api/mods/save",{server:"prod",player:id,panels:["joueurs"],actions:[],servers:[]});assert.equal(s.status,200,JSON.stringify(s.json));
 await stop(api);
 try{
  const m=browser(ADMIN2),lg=await m.login({name:"Modo Panne",password:s.json.password});
  assert.equal(lg.status,200,"the login does not say the account is gone: "+JSON.stringify(lg.json));
  const down=await m.call("prod","list");assert.equal(down.status,502,JSON.stringify(down.json));assert.match(down.json.error,/API injoignable/);
  api=await boot(API,dbDir,apiEnv());await until(()=>existsSync(S1));
  const up=await m.call("prod","list");assert.equal(up.status,200,"back at once, no « compte disparu » kept: "+JSON.stringify(up.json));
  assert.deepEqual((await b.req("/api/mods")).json.mods.find(x=>x.name==="Modo Panne").account,{ok:true,name:"Modo Panne"});
 }finally{if(api.exitCode!==null)api=await boot(API,dbDir,apiEnv());}
});
