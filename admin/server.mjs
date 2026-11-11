// PolitiGo admin interface (optional container): a password-protected web page that drives the API through its admin
// Unix socket (same protocol as admin.mjs, via:"web"). It holds no game data itself: no database, no second writer.
// Plain Node, no npm dependency. Everything a browser receives carries a strict CSP; every state-changing call is a
// JSON POST with a custom header from the same origin (CSRF), behind a session cookie (HttpOnly, SameSite=Strict).
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import {dirname,basename,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createBackups} from "./backups.mjs";
import {createLink,fold,cleanName,cleanVersion,cleanPlayers} from "./link.mjs";

const env=process.env;
const PORT=+env.PORT||8090,DATA=env.ADMIN_DATA||"/data-admin";
const UI=env.ADMIN_UI||join(dirname(fileURLToPath(import.meta.url)),"ui");
const PROXY_HOPS=Math.max(0,Math.min(5,+env.ADMIN_PROXY_HOPS||0)),FORCE_SECURE=env.ADMIN_COOKIE_SECURE==="1";
const SESSION_MS=12*3600e3,OWNER_SESSIONS=20,MOD_SESSIONS=5,BODY_MAX=16*1024,REPLY_MAX=8*1024*1024,SOCKET_REQ_MAX=4096;
const COOKIE="politigo_admin",WINDOW=15*60e3,IP_TRIES=5,ALL_TRIES=30,MOD_RATE=30;

class HttpError extends Error{constructor(status,msg,headers){super(msg);this.status=status;this.headers=headers;}}

// ===================================================================== game servers
// Several games on one Docker host, one admin socket each (mounted volumes): POLITIGO_ADMIN_SERVERS="Prod=/run/a/admin.sock;Test=/run/b/admin.sock".
// Deploy-time config only. Unset: one server on POLITIGO_ADMIN_SOCKET, named by its own stats reply (POLITIGO_SERVER_NAME).
const slug=s=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);
function parseServers(raw){
 if(!raw?.trim())return [{id:"jeu",name:null,socket:env.POLITIGO_ADMIN_SOCKET||"/run/politigo/admin.sock"}];
 const list=[],seen=new Set();
 for(const part of raw.split(";").map(s=>s.trim()).filter(Boolean)){
  const i=part.indexOf("="),name=i>0?part.slice(0,i).trim():"",socket=i>0?part.slice(i+1).trim():"";
  if(!name||name.length>40||!socket.startsWith("/"))throw new Error(`POLITIGO_ADMIN_SERVERS: "${part}" must be Name=/absolute/socket/path (name up to 40 characters)`);
  const id=slug(name)||`serveur-${list.length+1}`;
  if(seen.has(id))throw new Error(`POLITIGO_ADMIN_SERVERS: two servers named "${name}" (names must differ once accents and case are ignored)`);
  seen.add(id);list.push({id,name,socket});
 }
 if(!list.length)throw new Error("POLITIGO_ADMIN_SERVERS lists no server");
 return list;
}
let SERVERS;
try{SERVERS=parseServers(env.POLITIGO_ADMIN_SERVERS);}catch(e){console.error(`${e.message}: refusing to start.`);process.exit(1);}
for(const s of SERVERS){s.dir=resolve(dirname(s.socket));s.label=s.name;}   // label: the configured name, else the last one the API gave
const serverById=id=>{const s=SERVERS.find(x=>x.id===id);if(!s)throw new HttpError(404,"Partie inconnue.");return s;};

// ===================================================================== parties over the network (link.mjs)
// Extra games connect TO this console (POLITIGO_ADMIN_LINK=on). Once bound to its machine, a party is one more entry
// of SERVERS (link:true), added and removed while running; one still waiting for its first connection is not.
// In the container the listener is always on 8091; POLITIGO_ADMIN_LINK_PORT is the host's side, shown to the owner.
const LINK_ON=env.POLITIGO_ADMIN_LINK==="on",LINK_PORT=+env.POLITIGO_ADMIN_LINK_PORT||8091,LINK_LISTEN=+env.ADMIN_LINK_LISTEN||8091;   // ADMIN_LINK_LISTEN: tests only
// POLITIGO_ADMIN_LINK_BIND: the host address the link port is published on (the compose passes LINK_BIND, else
// POLITIGO_ADMIN_BIND, else 0.0.0.0). An address no other machine can use (any, loopback): url null, the page asks
// for "<IP de cette machine>".
const LINK_BIND=(env.POLITIGO_ADMIN_LINK_BIND||"").trim(),INCOMING=join(DATA,"link","incoming");   // streamed backups land here (0600), then go
const linkUrl=()=>LINK_BIND&&!/^(0\.0\.0\.0|::|\[::\]|127\.\d+\.\d+\.\d+|::1|\[::1\]|localhost)$/i.test(LINK_BIND)?`${LINK_BIND.includes(":")&&!LINK_BIND.startsWith("[")?`[${LINK_BIND}]`:LINK_BIND}:${LINK_PORT}`:null;
const linkServer=p=>({id:p.id,name:null,label:partyName(p.id,p.announced),link:true,socket:null,dir:INCOMING});
// A party's name as shown: what it announced (cleaned), else the owner's label; a name another game already uses
// (a local game, another party) comes with the id, "Nom (p-xxxx)": a party cannot pass for another one.
function partyName(id,announced){
 const parties=LINK.list(),p=parties.find(x=>x.id===id),n=cleanName(announced)??p?.announced??p?.label??id,k=fold(n);
 const clash=SERVERS.some(s=>!s.link&&fold(s.label||"PolitiGo")===k)||parties.some(x=>x.id!==id&&(fold(x.label)===k||(x.announced&&fold(x.announced)===k)));
 return clash?`${n} (${id})`:n;
}
const LINK=createLink({root:DATA,Err:HttpError,taken:id=>SERVERS.some(s=>s.id===id&&!s.link),
 pingMs:+env.ADMIN_LINK_PING_MS||20e3,deadMs:+env.ADMIN_LINK_DEAD_MS||60e3,helloMs:+env.ADMIN_LINK_HELLO_MS||10e3,
 backupMs:+env.ADMIN_LINK_BACKUP_MS||undefined,rateMs:+env.ADMIN_LINK_RATE_MS||undefined,   // tests only
 onLink:p=>{if(!SERVERS.some(s=>s.id===p.id)){SERVERS.push(linkServer(p));health=null;}},
 onLeave:id=>{const i=SERVERS.findIndex(s=>s.id===id&&s.link);if(i>=0){SERVERS.splice(i,1);health=null;links.clear();}}});
for(const p of LINK.linked()){
 if(SERVERS.some(s=>s.id===p.id)){console.error(`admin link: party ${p.id} has the id of a configured server: left out`);continue;}
 SERVERS.push(linkServer(p));
}
// Leftovers of a transfer cut by a restart.
try{fs.mkdirSync(INCOMING,{recursive:true,mode:0o700});for(const n of fs.readdirSync(INCOMING))if(/^backup-\d+\.db(-shm|-wal|-journal)?$/.test(n))fs.rmSync(join(INCOMING,n),{force:true});}catch{}

// ===================================================================== password
// 18 characters from an alphabet without look-alikes, drawn without modulo bias (same as admin.mjs generate()).
function generate(){
 const A="abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789",max=Math.floor(256/A.length)*A.length;let s="";
 while(s.length<18)for(const b of crypto.randomBytes(32))if(b<max&&s.length<18)s+=A[b%A.length];
 return s;
}
const SCRYPT={N:16384,r:8,p:1};
const scrypt=(pw,salt,o=SCRYPT)=>new Promise((ok,ko)=>crypto.scrypt(pw.normalize("NFC"),salt,32,{...o,maxmem:64*1024*1024},(e,k)=>e?ko(e):ok(k)));
async function hashPass(pw){const salt=crypto.randomBytes(16),k=await scrypt(pw,salt);return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString("base64")}:${k.toString("base64")}`;}
async function checkPass(pw,stored){
 const [tag,N,r,p,salt,key]=stored.split(":");
 if(tag!=="scrypt"||!key)return false;
 const want=Buffer.from(key,"base64"),got=await scrypt(pw,Buffer.from(salt,"base64"),{N:+N,r:+r,p:+p});
 return got.length===want.length&&crypto.timingSafeEqual(got,want);
}
// The env password wins; otherwise a hash kept in the admin volume, created once from a generated password that is
// printed once (only its hash is stored, so a copy of the volume does not reveal it).
let PASS_HASH,GENERATED=false;
if(env.POLITIGO_ADMIN_PASSWORD){
 if([...env.POLITIGO_ADMIN_PASSWORD].length<12){console.error("POLITIGO_ADMIN_PASSWORD must be at least 12 characters: refusing to start.");process.exit(1);}
 PASS_HASH=await hashPass(env.POLITIGO_ADMIN_PASSWORD);
}else{
 const file=join(DATA,"admin-pass");
 try{PASS_HASH=fs.readFileSync(file,"utf8").trim();}catch(e){if(e.code!=="ENOENT"){console.error(`reading ${file}: ${e.message}`);process.exit(1);}}
 if(PASS_HASH)GENERATED=true;   // a generated password, kept from an earlier start
 if(PASS_HASH&&!PASS_HASH.startsWith("scrypt:")){console.error(`${file} is not a password hash: delete it and restart for a new password.`);process.exit(1);}
 if(!PASS_HASH){
  GENERATED=true;
  const pw=generate();PASS_HASH=await hashPass(pw);let kept=true;
  try{fs.writeFileSync(file,PASS_HASH+"\n",{mode:0o600,flag:"wx"});}catch(e){kept=false;console.error(`cannot keep the admin password hash in ${file} (${e.message}): this password only lasts until the next restart.`);}
  console.log("==================================================================");
  console.log(`Admin password (generated, shown ONCE): ${pw}`);
  console.log(kept?`Only its hash is kept (${file}). Lost? Delete that file and restart, or set POLITIGO_ADMIN_PASSWORD (12+ characters).`
   :"Set POLITIGO_ADMIN_PASSWORD (12+ characters) or give the container a writable /data-admin volume.");
  console.log("==================================================================");
 }
}

// A hash no password matches, checked for an unknown moderator name: a wrong name costs the same time as a wrong password.
const DUMMY_HASH=await hashPass(generate());

// ===================================================================== moderators
// Players the owner trusts with part of the console: picked among a game server's players, given panels (what they see)
// and actions (what they may do), on the servers checked. Kept in the admin volume (moderators.json: scrypt hashes
// only). A password is 20 random bytes in base64 (openssl rand -base64 20), shown once. The owner alone manages them,
// and keeps Réglages, Sauvegarde and the invite code's regeneration.
const PANELS=[["tableau","Tableau de bord"],["traiter","À traiter"],["joueurs","Joueurs"],["annonces","Annonces"],["events","Events"],["chat","Chat"],["fil","Fil"],
 ["duels","Duels"],["bots","Détection de bots"],["journal","Journal d'admin"]];
const ACTIONS=[["chat-delete","Supprimer un message du chat"],["chat-mute","Couper le chat d'un joueur"],["signout","Déconnecter un joueur"],
 ["rename","Renommer un joueur"],["suspend","Suspendre ou réactiver un compte"],["unlock","Débloquer la connexion d'un joueur"],
 ["reset-password","Réinitialiser le mot de passe d'un joueur"],["announce","Envoyer et planifier des annonces"],["feed-delete","Supprimer une ligne du fil"],
 ["duel-cancel","Annuler un duel en cours"],["duel-annul","Annuler un duel terminé (rendre les gains), arbitrer un duel du Bâton"],["alerts-ack","Marquer une alerte comme vue, ignorer un compte abandonné"],["player-delete","Supprimer un joueur"],
 ["events-edit","Créer et modifier un événement"],["events-run","Lancer et arrêter un événement"],["events-delete","Supprimer un événement"],
 ["invite","Voir et copier le code d'invitation"]];
const PANEL_IDS=PANELS.map(x=>x[0]),ACTION_IDS=ACTIONS.map(x=>x[0]);
const PRESETS=[{id:"chat",label:"Modo chat",panels:["traiter","chat"],actions:["chat-delete","chat-mute","alerts-ack"]},
 {id:"events",label:"Modo événements",panels:["events","annonces"],actions:["events-edit","events-run","events-delete","announce"]},
 {id:"full",label:"Modo complet",panels:PANEL_IDS,actions:ACTION_IDS.filter(a=>a!=="invite"&&a!=="player-delete")}];   // the code and deleting a player stay out unless checked
// What each command asks of a moderator: one of these panels (p:) or actions (a:). Not listed: the owner's alone.
const NEEDS={stats:PANEL_IDS.map(p=>"p:"+p),list:["p:tableau","p:joueurs","p:annonces"],player:["p:joueurs"],
 "schedule-list":["p:annonces"],"events-list":["p:events"],"event-save":["a:events-edit"],"event-preview":["a:events-edit"],"event-start":["a:events-run"],"event-stop":["a:events-run"],"event-delete":["a:events-delete"],"announce-history":["p:annonces"],"feed-list":["p:fil"],"duels-list":["p:duels"],"duels-suspects":["p:duels"],
 bots:["p:bots"],"chat-reports":["p:chat"],"chat-feed":["p:chat"],"chat-media":["p:chat"],alerts:["p:traiter"],audit:["p:journal"],"invite-get":["a:invite"],
 signout:["a:signout"],rename:["a:rename"],suspend:["a:suspend"],unlock:["a:unlock"],announce:["a:announce"],"schedule-add":["a:announce"],
 "schedule-delete":["a:announce"],"schedule-toggle":["a:announce"],"feed-delete":["a:feed-delete"],"duel-cancel":["a:duel-cancel"],
 "duel-annul":["a:duel-annul"],"baton-judge":["a:duel-annul"],"chat-delete":["a:chat-delete"],"chat-mute":["a:chat-mute"],"alerts-ack":["a:alerts-ack"],"reset-password":["a:reset-password"],
 "player-delete":["a:player-delete"],"abandoned-list":["p:joueurs","p:traiter"],"abandoned-ignore":["a:alerts-ack"]};   // player-protect: not listed, the owner's alone
const WRITES=c=>c!=="invite-get"&&c!=="event-preview"&&(NEEDS[c]||[]).some(n=>n.startsWith("a:"));   // what changes the game: rate-limited for moderators
const may=(mod,cmd)=>!mod||(NEEDS[cmd]||[]).some(n=>n.startsWith("p:")?mod.panels.includes(n.slice(2)):mod.actions.includes(n.slice(2)));
const modKey=s=>String(s).normalize("NFC").trim().toLowerCase();
const MODS_FILE=join(DATA,"moderators.json"),MODS_MAX=50;
let MODS=[];
try{const v=JSON.parse(fs.readFileSync(MODS_FILE,"utf8"));if(Array.isArray(v))MODS=v.filter(m=>m&&typeof m.id==="string"&&typeof m.hash==="string"&&m.hash.startsWith("scrypt:"));}
catch(e){if(e.code!=="ENOENT")console.error(`reading ${MODS_FILE}: ${e.message} (no moderator can log in until it is fixed)`);}
function saveMods(){
 const tmp=MODS_FILE+".tmp";
 try{fs.writeFileSync(tmp,JSON.stringify(MODS,null,1)+"\n",{mode:0o600});fs.renameSync(tmp,MODS_FILE);}
 catch(e){console.error(`writing ${MODS_FILE}: ${e.message}`);throw new HttpError(500,"Impossible d'enregistrer les modérateurs (volume /data-admin en lecture seule ?).");}
}
const modView=m=>({id:m.id,name:m.name,home:m.home,servers:m.servers,panels:m.panels,actions:m.actions,created:m.created,lastLogin:m.lastLogin??null});
const modPassword=()=>crypto.randomBytes(20).toString("base64");
// The name their account on a server had when it was linked (or renamed from this console): names[server], else the login name.
const linkName=(m,srvId)=>m.names?.[srvId]??m.key;

// ===================================================================== API socket
// One JSON line out, one JSON reply back (admin protocol). Replies can be big (lists, audit): capped at 8 MB.
// At most 4 calls at once per server: the API accepts 8 admin connections, the console (node admin.mjs) keeps the rest.
// The others wait their turn, within the same overall timeout.
const SOCK_SLOTS=4;
function slot(srv,deadline){
 srv.busy??=0;srv.queue??=[];
 if(srv.busy<SOCK_SLOTS){srv.busy++;return Promise.resolve();}
 return new Promise((ok,ko)=>{
  const w={ok,t:setTimeout(()=>{srv.queue.splice(srv.queue.indexOf(w),1);ko(new HttpError(504,"L'API est occupée, réessaie."));},Math.max(0,deadline-Date.now()))};
  srv.queue.push(w);
 });
}
function release(srv){const w=srv.queue.shift();if(w){clearTimeout(w.t);w.ok();}else srv.busy--;}   // a waiter inherits the slot
async function sock(srv,req,timeout=15000){
 const body={...req,via:"web"},line=JSON.stringify(body);   // a moderator's by/self come in req, set here, never from the page
 if(Buffer.byteLength(line)>=SOCKET_REQ_MAX)throw new HttpError(413,"Requête trop grosse pour l'API.");
 const deadline=Date.now()+timeout;
 await slot(srv,deadline);
 try{
  if(!srv.link)return await sockOnce(srv,line,Math.max(1,deadline-Date.now()));
  // A party over the network: the same object, through link.mjs; a backup comes back as a file of our own.
  let file=null;if(req.cmd==="backup"){fs.mkdirSync(srv.dir,{recursive:true,mode:0o700});file=join(srv.dir,`backup-${Date.now()}${crypto.randomInt(1e9)}.db`);}
  return await LINK.request(srv.id,body,{timeout:Math.max(1,deadline-Date.now()),file});
 }finally{release(srv);}
}
function sockOnce(srv,line,timeout){
 return new Promise((ok,ko)=>{
  const s=net.createConnection(srv.socket),chunks=[];let n=0;
  s.setTimeout(timeout,()=>s.destroy(new HttpError(504,"L'API ne répond pas.")));
  s.on("connect",()=>s.write(line+"\n"));
  s.on("data",d=>{n+=d.length;if(n>REPLY_MAX)return s.destroy(new HttpError(502,"Réponse de l'API trop grosse."));chunks.push(d);});
  s.on("end",()=>{try{ok(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{ko(new HttpError(502,"Réponse illisible de l'API."));}});
  s.on("error",e=>ko(e instanceof HttpError?e:new HttpError(502,e.code==="ENOENT"||e.code==="ECONNREFUSED"?"API injoignable (socket d'administration absent).":
   e.code==="EACCES"?"Accès refusé au socket d'administration.":"API injoignable.")));
 });
}
async function cmd(srv,req,timeout){const r=await sock(srv,req,timeout);if(!r||r.ok!==true)throw new HttpError(422,r?.error||"Échec.");return r;}
// One line per server for the switcher, the overview (full: open chat reports, next scheduled announcement) and /health.
// release: the game's version as "1.7.3" (version: the same, kept for older pages). waiting: a party whose token was
// renewed, until it comes back with the new one.
// A party over the network is never waited for: its line comes from memory, refreshed in the background (all of it,
// full included) when older than LINK_STATUS_MS, one refresh at a time per party; a fresh answer is waited for
// LINK_STATUS_WAIT at most, else the last one known is given. Only the local socket keeps its 4 s.
const LINK_STATUS_MS=env.ADMIN_LINK_STATUS_MS!=null?+env.ADMIN_LINK_STATUS_MS:5e3,LINK_STATUS_WAIT=250;   // tests may shorten it
const ONLY_FULL=["invite","chatReports","nextAnnounce"];
async function status(srv,full=false){
 if(!srv.link)return probe(srv,full);
 const waiting=!LINK.list().find(p=>p.id===srv.id)?.instance?{waiting:true}:{};
 if(!LINK.live(srv.id)){srv.cached=null;return {id:srv.id,name:srv.label||"PolitiGo",up:false,...waiting,error:"Partie injoignable (liaison coupée)."};}
 if(!srv.cached||Date.now()-srv.cached.t>=LINK_STATUS_MS){
  srv.refresh??=probe(srv,true).then(o=>{if(LINK.live(srv.id))srv.cached={t:Date.now(),o};}).finally(()=>{srv.refresh=null;});
  let t;await Promise.race([srv.refresh,new Promise(r=>{t=setTimeout(r,LINK_STATUS_WAIT);})]).finally(()=>clearTimeout(t));
 }
 // Not known yet (its first answer is late): what its hello said.
 const p=LINK.list().find(x=>x.id===srv.id),o={...(srv.cached?.o??{id:srv.id,name:srv.label||"PolitiGo",up:true,...waiting,version:p?.version??null,release:p?.version??null,players:LINK.runtime(srv.id).players})};
 if(!full)for(const k of ONLY_FULL)delete o[k];
 return o;
}
// What a game answers, typed: short strings, whole numbers, or null (a party is not trusted with anything else).
const shortText=(v,max=100)=>typeof v==="string"&&v.length<=max&&!/\p{C}/u.test(v)?v:null;
const roomsOf=v=>v&&typeof v==="object"&&!Array.isArray(v)?{global:v.global===true,camp:v.camp===true}:null;
async function probe(srv,full=false){
 const waiting=srv.link&&!LINK.list().find(p=>p.id===srv.id)?.instance?{waiting:true}:{};
 try{
  const s=await cmd(srv,{cmd:"stats"},4000);
  // What a game says of itself is shown cleaned (a party is not trusted with markup, bidi tricks or another's name).
  if(srv.link)srv.label=partyName(srv.id,s.name);else if(!srv.name&&cleanName(s.name))srv.label=cleanName(s.name);
  const num=v=>Number.isSafeInteger(v)&&v>=0?v:null;
  const release=cleanVersion(s.version);
  const o={id:srv.id,name:srv.label||"PolitiGo",up:true,...waiting,version:release,release,players:num(s.players),online:num(s.online),active24h:num(s.active24h),chatRooms:roomsOf(s.chatRooms)};
  srv.seen={t:Date.now(),players:cleanPlayers(s.players),version:o.version};   // for the Parties page, read without any call
  if(full){
   const [rep,sch,inv]=await Promise.allSettled([cmd(srv,{cmd:"chat-reports"},4000),cmd(srv,{cmd:"schedule-list"},4000),cmd(srv,{cmd:"invite-get"},4000)]);
   const code=inv.status==="fulfilled"?shortText(inv.value.invite):null;
   o.invite=inv.status==="fulfilled"?{code,open:inv.value.open===true&&!!code}:null;   // sessions only: the copy button
   o.chatReports=rep.status==="fulfilled"?Array.isArray(rep.value.items)?rep.value.items.length:0:null;
   const next=sch.status==="fulfilled"&&Array.isArray(sch.value.schedules)?sch.value.schedules.filter(x=>x&&x.enabled&&Number.isSafeInteger(x.next)).sort((a,b)=>a.next-b.next)[0]:null;
   o.nextAnnounce=next?{t:next.next,text:String(next.text).slice(0,80)}:null;
  }
  return o;
 }catch(e){return {id:srv.id,name:srv.label||"PolitiGo",up:false,...waiting,error:e.message};}
}
// A moderator's rights on a server stand on their own account there: the same id, still carrying the name it was
// linked with. Deleted, renamed outside this console, or that id now someone else's (a restored base): no rights there.
// No account of theirs on that server: nothing to check. Kept 30 s; any rename, deletion or moderator change clears it.
const LINK_MS=env.ADMIN_LINK_CACHE_MS!=null?+env.ADMIN_LINK_CACHE_MS:30e3,links=new Map();   // tests shorten it   // `${mod}:${server}` -> {t, ok, name: the account's current name}
async function linkOf(m,srv){
 const id=m.players?.[srv.id];if(!Number.isSafeInteger(id))return {ok:true,name:null};
 const k=`${m.id}:${srv.id}`,c=links.get(k);if(c&&Date.now()-c.t<LINK_MS)return c;
 let p=null;
 try{p=(await cmd(srv,{cmd:"player",id},6000)).player;}
 catch(e){if(e.status!==422||!/^Joueur introuvable/.test(e.message))throw e;}   // only "unknown player" means gone; any other failure is not cached as such
 const v={t:Date.now(),ok:!!p&&p.id===id&&modKey(p.name)===linkName(m,srv.id),name:p?.name??null};
 links.set(k,v);return v;
}
const LINK_GONE="Ton compte de joueur dans cette partie n'existe plus ou a changé de pseudo : la console ne t'y donne plus aucun droit. Vois avec l'organisateur.";
// The servers among list where that moderator keeps their rights (one that does not answer stays: its calls fail anyway).
// quick (/api/servers): a party over the network that is slow to say gets the benefit of the doubt (as one that fails),
// its answer still lands in the cache; every call to it checks again.
const usable=async(m,list,quick=false)=>(await Promise.all(list.map(async s=>{try{
 const l=linkOf(m,s);if(!quick||!s.link)return (await l).ok?s:null;
 l.catch(()=>{});let t;const r=await Promise.race([l,new Promise(ok=>{t=setTimeout(ok,LINK_STATUS_WAIT,null);})]).finally(()=>clearTimeout(t));
 return !r||r.ok?s:null;}catch{return s;}}))).filter(Boolean);
// Writes per moderator: 30 a minute at most (a flood would push the evidence out of the admin log). The owner is not limited.
const rates=new Map();
function rate(m){
 const now=Date.now(),l=(rates.get(m.id)||[]).filter(t=>now-t<60e3);rates.set(m.id,l);
 if(l.length>=MOD_RATE)throw new HttpError(429,`Trop d'actions d'affilée : ${MOD_RATE} par minute au plus. Réessaie dans un instant.`,{"Retry-After":String(Math.max(1,Math.ceil((l[0]+60e3-now)/1000)))});
 l.push(now);
}
// A moderator's account renamed from this console: the link follows, and on their home server so does their login
// name (unless another moderator already logs in with it: then the old one stays, the link still follows).
function renamed(srv,id,oldName,newName){
 let changed=false;
 for(const m of MODS){
  const pid=m.players?.[srv.id];
  if(!Number.isSafeInteger(pid)||(id!=null&&pid!==id)||modKey(oldName)!==linkName(m,srv.id))continue;
  (m.names??={})[srv.id]=modKey(newName);changed=true;
  if(srv.id===m.home){
   if(MODS.some(x=>x!==m&&x.key===modKey(newName)))console.warn(`admin web: moderator ${m.name} renamed ${newName} in the game, but that login name is taken: they keep logging in as ${m.name}`);
   else{for(const sid of Object.keys(m.players||{}))m.names[sid]??=m.key;m.name=newName;m.key=modKey(newName);}   // their other accounts keep the name they were linked with
  }
 }
 links.clear();
 if(changed)try{saveMods();}catch{}
}
// A line in the game's admin log, on each server named (the moderators' management happens here, not in the API).
function note(ids,detail){
 for(const id of new Set(ids)){const s=SERVERS.find(x=>x.id===id);if(s)cmd(s,{cmd:"backup-note",detail:detail.slice(0,300)},4000).catch(e=>console.error(`admin web: log line on ${id}: ${e.message}`));}
}

// What the page may ask, with the fields passed through: anything else is dropped before reaching the socket.
const WHO=["name","id"];
const CMDS={
 stats:[],list:[],player:WHO,signout:WHO,rename:[...WHO,"newName"],suspend:[...WHO,"on"],unlock:WHO,
 announce:["text","to","camp"],"events-list":[],"event-save":["id","type","name","msg","params","starts","ends","who","rep","push","ann","rtext","reminds","now"],"event-preview":["type","name","params","starts","ends","ann","rtext"],"event-start":["id"],"event-stop":["id"],"event-delete":["id"],"schedule-list":[],"schedule-add":["text","target","kind","at","time","days","until"],
 "schedule-delete":["id"],"schedule-toggle":["id","enabled"],"announce-history":[],"feed-list":["limit"],"feed-delete":["id"],
 "duels-list":[],"duel-cancel":["id"],"duels-suspects":[],"duel-annul":["id"],"baton-judge":["id","accept"],alerts:[],"alerts-ack":["keys"],"invite-get":[],"invite-regenerate":[],"registrations-set":["open"],"event-set":["mode"],
 bots:[],"chat-reports":[],"chat-feed":["before","limit","room"],"chat-media":["id"],"chat-delete":["id"],"chat-mute":[...WHO,"hours"],"chat-set":["global","camp"],audit:["limit"],
 "mythic-reset":[],   // the owner's alone: not in NEEDS, so no moderator profile can ever grant it
 "player-delete":[...WHO,"confirm"],"player-protect":[...WHO,"on"],"abandoned-list":[],"abandoned-ignore":["id"],
};
const pick=(b,keys)=>Object.fromEntries(keys.filter(k=>b[k]!==undefined).map(k=>[k,b[k]]));

// ===================================================================== sessions, login limits
const sessions=new Map();   // sha256(token) -> {exp, mod: a moderator's id, or null for the owner}: the cookie value itself is never kept
const tokenKey=t=>crypto.createHash("sha256").update(t).digest("base64");
function cookies(req){const o={};for(const part of (req.headers.cookie||"").split(";")){const i=part.indexOf("=");if(i>0)o[part.slice(0,i).trim()]=part.slice(i+1).trim();}return o;}
// The session and who holds it ({key, mod}: mod is the moderator's current record, null for the owner). A moderator
// removed meanwhile has no session left.
function session(req){
 const t=cookies(req)[COOKIE];if(!t||t.length>100)return null;
 const k=tokenKey(t),s=sessions.get(k);
 if(!s||s.exp<Date.now()){sessions.delete(k);return null;}
 const mod=s.mod?MODS.find(m=>m.id===s.mod):null;
 if(s.mod&&!mod){sessions.delete(k);return null;}
 return {key:k,mod};
}
const dropSessionsOf=id=>{for(const [k,s] of sessions)if(s.mod===id)sessions.delete(k);};
const secure=req=>FORCE_SECURE||/^https\b/i.test(req.headers["x-forwarded-proto"]||"");
const setCookie=(req,v,age)=>`${COOKIE}=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure(req)?"; Secure":""}`;
// Behind a reverse proxy (ADMIN_PROXY_HOPS=1 for Nginx Proxy Manager), the address that proxy appended; else the peer.
function clientIp(req){
 const peer=req.socket.remoteAddress||"?";if(!PROXY_HOPS)return peer;
 const list=String(req.headers["x-forwarded-for"]||"").split(",").map(s=>s.trim()).filter(Boolean);
 return list[list.length-PROXY_HOPS]||peer;
}
// Failed logins only: 5 per address and 30 in all per quarter of an hour (the global cap bounds scrypt work and guessing).
const fails=new Map(),inflight=new Set();
const bucket=k=>{let b=fails.get(k);if(!b||b.reset<Date.now())fails.set(k,b={n:0,reset:Date.now()+WINDOW});return b;};
setInterval(()=>{const now=Date.now();for(const [k,s] of sessions)if(s.exp<now)sessions.delete(k);for(const [k,b] of fails)if(b.reset<now)fails.delete(k);},60e3).unref();

// ===================================================================== HTTP plumbing
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const BASE_HEADERS={"Content-Security-Policy":CSP,"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer",
 "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=()","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin"};
function send(res,status,obj,headers={}){
 const body=JSON.stringify(obj);
 res.writeHead(status,{...BASE_HEADERS,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Content-Length":Buffer.byteLength(body),...headers});
 res.end(body);
}
function readJson(req){
 return new Promise((ok,ko)=>{
  if(+req.headers["content-length"]>BODY_MAX)return ko(new HttpError(413,"Requête trop grosse."));
  const chunks=[];let n=0;
  req.on("data",d=>{n+=d.length;if(n>BODY_MAX){req.destroy();ko(new HttpError(413,"Requête trop grosse."));}else chunks.push(d);});
  req.on("end",()=>{let b=null;try{b=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}catch{}
   if(!b||typeof b!=="object"||Array.isArray(b))return ko(new HttpError(400,"JSON invalide."));ok(b);});
  req.on("error",ko);
 });
}
// CSRF: a JSON body and a custom header both force a CORS preflight a foreign page cannot pass, and the Origin must be
// this very host (browsers always send it on a POST from a script).
function csrf(req){
 if(req.headers["x-politigo-admin"]!=="1"||!/^application\/json\s*(;|$)/i.test(req.headers["content-type"]||""))throw new HttpError(403,"Requête refusée.");
 let host=null;try{host=new URL(req.headers.origin).host;}catch{}
 if(!host||host!==req.headers.host)throw new HttpError(403,"Origine refusée.");
 const site=req.headers["sec-fetch-site"];if(site&&site!=="same-origin")throw new HttpError(403,"Origine refusée.");
}
// The page's files, read once: a fixed map, so no request path ever reaches the file system.
const TYPES={html:"text/html; charset=utf-8",js:"text/javascript; charset=utf-8",css:"text/css; charset=utf-8",svg:"image/svg+xml"};
const STATIC=new Map();
for(const [route,file] of [["/","index.html"],["/admin.js","admin.js"],["/admin.css","admin.css"],["/favicon.svg","favicon.svg"]]){
 try{const body=fs.readFileSync(join(UI,file));STATIC.set(route,{body,type:TYPES[file.split(".").pop()],etag:`"${crypto.createHash("sha256").update(body).digest("base64url").slice(0,22)}"`});}
 catch(e){if(file!=="favicon.svg"){console.error(`admin UI file missing: ${file}`);process.exit(1);}}
}

// ===================================================================== backup download
// The API writes backup-<ts>.db next to ITS socket, under ITS own path (/run/politigo/... even when this container
// mounts that volume elsewhere, /run/politigo-test): only the file name is kept, checked, and looked for in exactly
// that server's directory here. Nothing outside it is ever read.
const BACKUP_NAME=/^backup-\d+\.db$/;
function backupPath(srv,r){
 const name=typeof r.path==="string"?basename(r.path):"";
 if(!BACKUP_NAME.test(name))throw new HttpError(502,"Chemin de sauvegarde inattendu.");
 return join(srv.dir,name);
}
// A copy the API could not finish (a full disk) leaves a partial backup-<ts>.db and its -journal next to the socket:
// gone when older than 10 minutes, or at once for a journal whose base is gone. Only those names, only plain files.
async function sweepSocketDir(srv){
 let names=[];try{names=await fs.promises.readdir(srv.dir);}catch{return;}
 for(const n of names){
  const m=/^(backup-\d+\.db)(-journal)?$/.exec(n);if(!m)continue;
  try{const st=await fs.promises.lstat(join(srv.dir,n));
   if(st.isFile()&&(Date.now()-st.mtimeMs>10*60e3||(m[2]&&!names.includes(m[1]))))await fs.promises.unlink(join(srv.dir,n));}catch{}
 }
}
// The API's copy, with a cause the owner can act on when it fails for want of room next to the socket.
async function takeBackup(srv,req,timeout){
 try{return await cmd(srv,req,timeout);}
 catch(e){
  if(e.status!==422)throw e;
  if(srv.link)throw new HttpError(502,`Copie de la base refusée par la partie (${e.message}). Détail dans les journaux de son conteneur api.`);
  let free=null;try{const s=await fs.promises.statfs(srv.dir);free=s.bavail*s.bsize;}catch{}
  await sweepSocketDir(srv);
  if(free!=null&&free<64*1024*1024)throw new HttpError(507,`Copie de la base impossible : le volume du socket d'administration est presque plein (${(free/1048576).toFixed(1)} Mo libres).`);
  throw new HttpError(502,`Copie de la base refusée par la partie (${e.message}). Détail dans les journaux de l'API.`);
 }
}
const stamp=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
async function sendBackup(srv,res){
 const p=backupPath(srv,await takeBackup(srv,{cmd:"backup"}));sweepSocketDir(srv);
 let fh;
 try{
  fh=await fs.promises.open(p,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  const st=await fh.stat();if(!st.isFile())throw new HttpError(502,"Sauvegarde illisible.");
  res.writeHead(200,{...BASE_HEADERS,"Content-Type":"application/vnd.sqlite3","Content-Length":st.size,"Cache-Control":"no-store",
   "Content-Disposition":`attachment; filename="politigo-${srv.id}-${stamp()}.db"`});
  // A client that drops mid-download: the read stream is destroyed before the descriptor closes (finally), then the file goes.
  await new Promise((ok,ko)=>{const s=fh.createReadStream({autoClose:false});s.on("error",ko);res.on("close",()=>{s.destroy();ok();});s.pipe(res);});
 }finally{await fh?.close().catch(()=>{});fs.promises.unlink(p).catch(()=>{});}
 console.log(`admin web: database backup downloaded (${srv.id})`);
}
// The automatic backups (backups.mjs), kept in the admin volume. A big base takes time to copy: the API gets two minutes.
const BACKUP_TICK=env.ADMIN_BACKUP_TICK_MS!=null?+env.ADMIN_BACKUP_TICK_MS:60e3;   // 0: off (tests)
const BACKUPS=createBackups({root:DATA,servers:SERVERS,Err:HttpError,partyMs:+env.ADMIN_BACKUP_PARTY_MS||undefined,   // tests only
 take:async srv=>{const r=await takeBackup(srv,{cmd:"backup",vapid:true},120e3);sweepSocketDir(srv);return {path:backupPath(srv,r),vapid:r.vapid};},
 note:(srv,detail)=>cmd(srv,{cmd:"backup-note",detail},4000)});
if(BACKUP_TICK>0)setInterval(()=>BACKUPS.tick().catch(e=>console.error("backups:",e)),BACKUP_TICK).unref();
async function backupsRoute(res,path,b){
 if(path==="/api/backups/list")return send(res,200,{ok:true,...BACKUPS.status(),disk:await BACKUPS.disk()});
 if(path==="/api/backups/save")return send(res,200,{ok:true,config:await BACKUPS.saveConfig(b.config)});
 if(path==="/api/backups/run")return send(res,200,{ok:true,results:await BACKUPS.runNow()});
 if(path==="/api/backups/delete"){await BACKUPS.remove(b.server,b.name);return send(res,200,{ok:true});}
 if(path!=="/api/backups/download")throw new HttpError(404,"Introuvable.");
 const {fh,size,name}=await BACKUPS.open(b.server,b.name);
 try{
  res.writeHead(200,{...BASE_HEADERS,"Content-Type":name.endsWith(".json")?"application/json; charset=utf-8":"application/vnd.sqlite3","Content-Length":size,"Cache-Control":"no-store",
   "Content-Disposition":`attachment; filename="politigo-${b.server}-${name}"`});
  await new Promise((ok,ko)=>{const s=fh.createReadStream({autoClose:false});s.on("error",ko);res.on("close",()=>{s.destroy();ok();});s.pipe(res);});
 }finally{await fh.close().catch(()=>{});}
}
async function sendVapid(srv,res){
 const r=await takeBackup(srv,{cmd:"backup",vapid:true});
 fs.promises.unlink(backupPath(srv,r)).catch(()=>{});   // only the key was wanted: the database copy goes at once
 if(!r.vapid||typeof r.vapid!=="object")throw new HttpError(404,"Pas de vapid.json pour cette partie (notifications désactivées ?).");
 const body=JSON.stringify(r.vapid,null,1);
 res.writeHead(200,{...BASE_HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body),"Cache-Control":"no-store",
  "Content-Disposition":`attachment; filename="vapid-${srv.id}-${stamp()}.json"`});
 res.end(body);
 console.log(`admin web: vapid.json downloaded (${srv.id})`);
}

// ===================================================================== moderators' management (the owner only)
// /api/mods: the list and what can be granted; save: create (a player of one server) or change; password: a new one;
// delete. Any change of rights or password closes that moderator's sessions at once.
// A player looked up for a moderator's link: null when that server says there is none; a server that does not answer
// is an error (a missing answer must never be kept as "no account there").
async function playerOn(srv,q){try{return (await cmd(srv,{cmd:"player",...q},6000)).player;}catch(e){if(e.status===422)return null;throw e;}}
const ids=(v,all)=>Array.isArray(v)?[...new Set(v.filter(x=>all.includes(x)))]:[];
const rights=r=>`panneaux : ${r.panels.join(", ")} ; actions : ${r.actions.join(", ")||"aucune"} ; parties : ${r.servers.join(", ")}`;
async function modsRoute(res,path,b){
 if(path==="/api/mods"){
  // Their home account as it stands now: its current name, or gone (no rights there until the owner sorts it out).
  const mods=await Promise.all(MODS.map(async x=>{const srv=SERVERS.find(s=>s.id===x.home);let account=null;
   if(srv)try{const l=await linkOf(x,srv);account={ok:l.ok,name:l.name};}catch{}
   return {...modView(x),account};}));
  return send(res,200,{ok:true,mods,panels:PANELS,actions:ACTIONS,presets:PRESETS,servers:SERVERS.map(s=>({id:s.id,name:s.label||s.name||"PolitiGo"}))});
 }
 const m=/^\/api\/mods\/(save|password|delete)$/.exec(path);if(!m)throw new HttpError(404,"Introuvable.");
 const old=typeof b.id==="string"?MODS.find(x=>x.id===b.id):null;
 if(m[1]!=="save"&&!old)throw new HttpError(404,"Modérateur introuvable.");
 if(m[1]==="delete"){
  MODS=MODS.filter(x=>x!==old);saveMods();dropSessionsOf(old.id);links.clear();console.log(`admin web: moderator ${old.name} removed`);
  note(old.servers,`Modérateur retiré : ${old.name}.`);
  return send(res,200,{ok:true});
 }
 if(m[1]==="password"){
  const password=modPassword();old.hash=await hashPass(password);saveMods();dropSessionsOf(old.id);
  console.log(`admin web: new password for moderator ${old.name}`);note(old.servers,`Nouveau mot de passe généré pour le modérateur ${old.name}.`);
  return send(res,200,{ok:true,name:old.name,password});
 }
 const panels=ids(b.panels,PANEL_IDS),actions=ids(b.actions,ACTION_IDS);
 if(!panels.length)throw new HttpError(400,"Coche au moins un panneau.");
 let rec=old;
 if(!rec){
  if(MODS.length>=MODS_MAX)throw new HttpError(400,`${MODS_MAX} modérateurs au plus.`);
  const home=serverById(typeof b.server==="string"?b.server:"");
  const p=Number.isSafeInteger(b.player)?await playerOn(home,{id:b.player}):null;
  if(!p)throw new HttpError(404,"Joueur introuvable dans cette partie.");
  if(MODS.some(x=>x.key===modKey(p.name)))throw new HttpError(409,`${p.name} est déjà modérateur.`);
  rec={id:crypto.randomBytes(8).toString("hex"),name:p.name,key:modKey(p.name),home:home.id,players:{[home.id]:p.id},created:Date.now()};
 }
 const servers=[...new Set([rec.home,...ids(b.servers,SERVERS.map(s=>s.id))])];
 // On the other servers, their own account (same name) is found once, so that it stays out of their reach there too.
 // A server that does not answer: refused, rather than kept as "no account there" for good.
 const found={};
 for(const id of servers)if(!(id in rec.players)){
  const p=await playerOn(serverById(id),{name:rec.name}).catch(()=>{throw new HttpError(502,`Partie ${id} injoignable : réessaie quand elle répond.`);});
  found[id]=p?{id:p.id,key:modKey(p.name)}:null;
 }
 const before=old?{servers:[...old.servers]}:null;
 for(const [id,p] of Object.entries(found)){rec.players[id]=p?.id??null;if(p)(rec.names??={})[id]=p.key;}
 Object.assign(rec,{servers,panels,actions});
 let password=null;
 if(!old){password=modPassword();rec.hash=await hashPass(password);MODS.push(rec);}
 saveMods();if(old)dropSessionsOf(old.id);links.clear();
 console.log(`admin web: moderator ${rec.name} ${old?"updated":"created"} (${servers.join(", ")})`);
 note([...servers,...(before?.servers||[])],old?`Droits du modérateur ${rec.name} modifiés (${rights(rec)}).`:`Modérateur ajouté : ${rec.name} (${rights(rec)}).`);
 return send(res,200,{ok:true,mod:modView(rec),...(password?{password}:{})});
}

// ===================================================================== parties (the owner only)
// GET (or POST without action) /api/parties: the listener and every party, the local ones first; POST add / renew /
// remove. The token is shown once in env and never kept nor logged here: parties.json holds only its SHA-256.
const linkCert=(create=false)=>{try{return LINK.cert({create});}catch(e){console.error(`admin link: certificate: ${e.message}`);if(create)throw new HttpError(500,"Certificat de liaison impossible à créer dans /data-admin/link.");return null;}};
// on: asked for (POLITIGO_ADMIN_LINK=on); up: really listening; error: why not.
let LINK_ERROR=null;
const listenView=()=>{const c=linkCert(),up=LINK_ON&&LINK.listening();return {on:LINK_ON,up,error:LINK_ON&&!up?LINK_ERROR??"L'écoute des parties n'est pas ouverte.":null,bind:LINK_BIND||null,port:LINK_PORT,url:linkUrl(),fingerprint:c?.fingerprint??null,certCreated:c?.created??null};};
const envOf=token=>({POLITIGO_ADMIN_URL:linkUrl()??`<IP de cette machine>:${LINK_PORT}`,POLITIGO_ADMIN_TLS:linkCert(true).fingerprint,POLITIGO_ADMIN_TOKEN:token});
// A line in the main game's admin log (the first local socket), never with the token.
const noteMain=detail=>{const m=SERVERS.find(s=>!s.link);if(m)note([m.id],detail);};
function lastBackup(all,id){
 const s=all.find(x=>x.id===id);if(!s)return null;
 if(s.failure)return {t:s.failure.t,ok:false,error:s.failure.error};
 const t=Math.max(0,...Object.values(s.last).map(v=>v??0));return t?{t,ok:true,error:null}:null;
}
// The "Liaison" alert: that party's token presented by another machine (the owner's alone, until "Vu").
function linkAlert(id){
 const p=LINK.list().find(x=>x.id===id);if(!p?.refused)return null;const r=p.refused;
 return {key:`link:${p.id}:${r.instance}`,kind:"link",t:r.t,ref:null,ids:[],title:`Jeton de « ${partyName(p.id,p.announced)} » essayé par une autre machine`,
  detail:`${r.addr} (instance ${String(r.instance).slice(0,8)}…) a présenté le jeton de cette partie : refusé. La partie liée${p.addr?` (${p.addr})`:""} reste connectée. Si c'est une copie de la stack, donne-lui son propre jeton ; sinon renouvelle le jeton.`};
}
// The console's own Liaison alerts (parties.json unreadable, certificate regenerated): in the main game's À traiter.
const mainServer=()=>SERVERS.find(s=>!s.link)??SERVERS[0];
const consoleAlerts=srv=>srv===mainServer()?LINK.alerts():[];
// From memory only (no call to the party): what its hello and its last stats reply said.
function partyView(p,all){
 const live=LINK.live(p.id),r=LINK.runtime(p.id),old=!live&&r.tooOld;
 const state=!p.instance?(old?"refused-version":"pending"):live?"online":old?"refused-version":"offline";
 const seen=SERVERS.find(s=>s.id===p.id)?.seen,players=live?seen?.players??r.players:r.players;
 return {id:p.id,label:p.label,announced:p.announced?partyName(p.id,p.announced):null,local:false,created:p.created,state,version:old?r.tooOld.version:p.version,addr:old?r.tooOld.addr:p.addr,
  firstSeen:p.firstSeen,lastSeen:live?r.rx:old?r.tooOld.t:p.lastSeen,players:players??null,backup:lastBackup(all,p.id),refused:p.refused?{t:p.refused.t,addr:p.refused.addr}:null};
}
async function partiesRoute(res,b){
 const all=BACKUPS.status().servers,action=b.action??"list",id=typeof b.id==="string"?b.id:"";
 if(action==="list"){
  const local=await Promise.all(SERVERS.filter(s=>!s.link).map(async s=>{const st=await status(s);
   return {id:s.id,label:st.name,announced:st.name,local:true,created:null,state:"local",up:st.up,version:st.version??null,addr:`socket ${s.socket}`,firstSeen:null,
    lastSeen:st.up?Date.now():null,players:st.players??null,backup:lastBackup(all,s.id),refused:null};}));   // the local socket only: no network call
  const remote=LINK.list().map(p=>partyView(p,all));
  return send(res,200,{ok:true,listen:listenView(),broken:LINK.broken(),parties:[...local,...remote]});
 }
 if(action==="add"){
  if(!LINK_ON)throw new HttpError(409,"L'écoute des parties est fermée : ajoute POLITIGO_ADMIN_LINK=on à la stack de la console, puis redéploie-la.");
  if(!LINK.listening())throw new HttpError(409,`L'écoute des parties ne fonctionne pas : ${listenView().error}`);
  const label=typeof b.label==="string"?b.label:"";
  if(SERVERS.some(s=>!s.link&&s.label&&fold(s.label)===fold(label)))throw new HttpError(409,`Une partie s'appelle déjà « ${label.trim()} ».`);
  const {party,token}=LINK.add(label),env=envOf(token);
  console.log(`admin web: party ${party.id} added (${party.label})`);noteMain(`Partie ajoutée : ${party.label} (${party.id}).`);
  return send(res,200,{ok:true,party:partyView(party,all),env});
 }
 if(action==="renew"){
  const {party,token}=LINK.renew(id),env=envOf(token),name=partyName(party.id,party.announced);
  console.log(`admin web: token of party ${party.id} renewed`);noteMain(`Jeton de la partie ${name} (${party.id}) renouvelé : l'ancien ne sert plus.`);
  return send(res,200,{ok:true,party:partyView(party,all),env});
 }
 if(action==="remove"){
  const p=LINK.remove(id);
  console.log(`admin web: party ${p.id} removed`);noteMain(`Partie retirée : ${cleanName(p.announced)??p.label} (${p.id}).`);
  return send(res,200,{ok:true});
 }
 throw new HttpError(400,"Action inconnue.");
}

// ===================================================================== routes
let health=null;
const HEALTH_MS=env.ADMIN_HEALTH_CACHE_MS!=null?+env.ADMIN_HEALTH_CACHE_MS:10e3;   // tests shorten it
async function route(req,res,path){
 if(req.method==="GET"){
  // No auth, no secrets, not even the games' names: which server ids answer (a container healthcheck or an uptime probe).
  // Cached 10 s (the promise itself, so a burst of probes costs one round of calls): unauthenticated, it must not tie up the sockets.
  if(path==="/health"){
   if(!health||health.t<Date.now()-HEALTH_MS)health={t:Date.now(),p:Promise.all(SERVERS.map(s=>status(s))).then(l=>({up:l.some(s=>s.up),servers:l.map(s=>({id:s.id,up:s.up}))}))};
   const r=await health.p;
   return send(res,r.up?200:503,{ok:r.up,servers:r.servers});
  }
  const f=STATIC.get(path==="/index.html"?"/":path);
  if(f){
   if(req.headers["if-none-match"]===f.etag){res.writeHead(304,{...BASE_HEADERS,ETag:f.etag});return res.end();}
   res.writeHead(200,{...BASE_HEADERS,"Content-Type":f.type,"Content-Length":f.body.length,"Cache-Control":"no-cache",ETag:f.etag});return res.end(f.body);
  }
  if(path==="/api/session")return send(res,200,{ok:true,authed:!!session(req)});
  if(path==="/api/parties"){const ses=session(req);if(!ses)throw new HttpError(401,"Session expirée, reconnecte-toi.");if(ses.mod)throw new HttpError(403,"Réservé à l'organisateur.");return partiesRoute(res,{});}
  throw new HttpError(404,"Introuvable.");
 }
 if(req.method!=="POST"||!path.startsWith("/api/"))throw new HttpError(path.startsWith("/api/")?405:404,"Introuvable.");
 csrf(req);
 const b=await readJson(req);
 if(path==="/api/login"){
  const ip=clientIp(req),bi=bucket("ip:"+ip),ball=bucket("all");
  if(bi.n>=IP_TRIES||ball.n>=ALL_TRIES)return send(res,429,{ok:false,error:"Trop d'essais, réessaie dans un quart d'heure."},{"Retry-After":String(Math.ceil(((bi.n>=IP_TRIES?bi:ball).reset-Date.now())/1000))});
  // One check at a time per address and 3 in all, and the try is counted BEFORE the slow scrypt (refunded on success):
  // parallel requests cannot slip past the limit while the first ones are still being checked.
  if(inflight.has(ip)||inflight.size>=3)return send(res,429,{ok:false,error:"Une connexion est déjà en cours de vérification, patiente."},{"Retry-After":"2"});
  const pw=typeof b.password==="string"&&b.password.length<=200?b.password:"";
  // No name: the owner. A name: that moderator (an unknown one is checked against a dummy hash, same time, same answer).
  const name=typeof b.name==="string"?b.name.slice(0,60).trim():"",mod=name?MODS.find(m=>m.key===modKey(name))??null:null;
  bi.n++;ball.n++;inflight.add(ip);
  let good=false;try{good=!!pw&&await checkPass(pw,name?mod?.hash??DUMMY_HASH:PASS_HASH)&&(!name||!!mod);}finally{inflight.delete(ip);}
  if(!good){console.log(`admin web: failed login from ${ip}`);return send(res,401,{ok:false,error:name?"Pseudo ou mot de passe incorrect.":"Mot de passe incorrect."});}
  bi.n--;ball.n--;
  // A moderator whose own account is gone (or no longer theirs) on every server open to them has nothing left here.
  if(mod){
   const list=await usable(mod,SERVERS.filter(s=>mod.servers.includes(s.id)));
   if(!list.length){console.log(`admin web: login refused for moderator ${mod.name} (player account gone)`);return send(res,403,{ok:false,error:LINK_GONE});}
  }
  const t=crypto.randomBytes(32).toString("base64url"),who=mod?.id??null,cap=mod?MOD_SESSIONS:OWNER_SESSIONS;
  // A cap per account, oldest first: one account's logins never close another's sessions (a moderator, the owner's).
  const theirs=[...sessions].filter(([,s])=>s.mod===who).map(([k])=>k);
  for(const k of theirs.slice(0,Math.max(0,theirs.length-cap+1)))sessions.delete(k);
  sessions.set(tokenKey(t),{exp:Date.now()+SESSION_MS,mod:who});
  if(mod){mod.lastLogin=Date.now();try{saveMods();}catch{}}
  console.log(`admin web: login from ${ip}${mod?` (moderator ${mod.name})`:""}`);
  return send(res,200,{ok:true},{"Set-Cookie":setCookie(req,t,SESSION_MS/1000)});
 }
 const ses=session(req);
 if(path==="/api/logout"){if(ses)sessions.delete(ses.key);return send(res,200,{ok:true},{"Set-Cookie":setCookie(req,"",0)});}
 if(!ses)throw new HttpError(401,"Session expirée, reconnecte-toi.");
 const mod=ses.mod,mine=SERVERS.filter(s=>!mod||mod.servers.includes(s.id));
 if(path==="/api/me")return send(res,200,{ok:true,...(mod?{role:"mod",name:mod.name,panels:mod.panels,actions:mod.actions,self:mod.players}:{role:"owner"})});
 if(path==="/api/servers"){
  const list=await Promise.all((mod?await usable(mod,mine,true):mine).map(s=>status(s,b.full===true)));
  // What a panel would show, only to whoever has that panel.
  if(mod)for(const s of list){
   if(!mod.actions.includes("invite"))delete s.invite;
   if(!mod.panels.includes("annonces"))delete s.nextAnnounce;
   if(!mod.panels.includes("chat"))delete s.chatReports;
  }
  return send(res,200,{ok:true,servers:list});
 }
 if(path.startsWith("/api/mods")){if(mod)throw new HttpError(403,"Réservé à l'organisateur.");return modsRoute(res,path,b);}
 if(path==="/api/parties"){if(mod)throw new HttpError(403,"Réservé à l'organisateur.");return partiesRoute(res,b);}
 if(path.startsWith("/api/backups")){if(mod)throw new HttpError(403,"Réservé à l'organisateur.");return backupsRoute(res,path,b);}
 // Every game action names its server in the path: /api/s/<id>/<action>.
 const m=/^\/api\/s\/([a-z0-9-]{1,40})\/([a-z-]{1,30})$/.exec(path);
 if(!m)throw new HttpError(404,"Introuvable.");
 const srv=serverById(m[1]),action=m[2];
 if(mod&&!mod.servers.includes(srv.id))throw new HttpError(403,"Cette partie ne t'est pas ouverte.");
 if(mod&&!(await linkOf(mod,srv)).ok)throw new HttpError(403,LINK_GONE);
 const denied=()=>new HttpError(403,"Action non autorisée pour ton rôle.");
 // A moderator's name signs the game's admin log, and their own account there is out of their reach.
 const actor=mod?{by:mod.name,...(Number.isSafeInteger(mod.players?.[srv.id])?{self:mod.players[srv.id]}:{})}:{};
 if(action==="call"){
  const keys=Object.hasOwn(CMDS,b.cmd)?CMDS[b.cmd]:null;
  if(!keys)throw new HttpError(400,"Commande inconnue.");
  if(!may(mod,b.cmd)||(mod&&!NEEDS[b.cmd]))throw denied();
  if(b.cmd==="event-save"&&b.now===true&&!may(mod,"event-start"))throw denied();   // saving and launching at once takes both rights
  // The moderators' accounts on this server: known here alone, sent by this process, never by the page, with every
  // moderator's command so that none reaches another moderator's account.
  const modIds=MODS.map(m=>m.players?.[srv.id]).filter(Number.isSafeInteger);
  // A moderator's own account is not deleted, not even by the owner: their console access stands on it. Moderator first.
  if(b.cmd==="player-delete"){
   const id=Number.isSafeInteger(b.id)?b.id:typeof b.name==="string"?(await playerOn(srv,{name:b.name}))?.id:null;
   const m=Number.isSafeInteger(id)?MODS.find(x=>x.players?.[srv.id]===id):null;
   if(m&&!mod)throw new HttpError(409,`Ce compte est celui du modérateur ${m.name} : retire-le d'abord des modérateurs (page Modérateurs), puis supprime le compte.`);
  }
  if(mod&&WRITES(b.cmd))rate(mod);
  // "Vu" on a Liaison alert is handled here (the game knows nothing of it), by the owner alone.
  const linkKey=k=>typeof k==="string"&&/^link[:-]/.test(k);
  if(b.cmd==="alerts-ack"&&Array.isArray(b.keys)&&b.keys.some(linkKey)){
   const pre=`link:${srv.id}:`;
   if(!mod)for(const k of b.keys){
    if(typeof k==="string"&&k.startsWith(pre)&&LINK.ack(srv.id,k.slice(pre.length)))console.log(`admin web: link alert of party ${srv.id} seen`);
    if(typeof k==="string"&&k.startsWith("link-cert:")&&LINK.ackCert(k))console.log("admin web: regenerated certificate alert seen");
   }
   b.keys=b.keys.filter(k=>!linkKey(k));
   if(!b.keys.length)return send(res,200,{ok:true});
  }
  const {ok,...r}=await cmd(srv,{cmd:b.cmd,...pick(b,keys),...actor,...(mod?{mods:modIds}:{})})
   .catch(e=>{if(b.cmd==="alerts"&&!mod&&(BACKUPS.alert(srv.id)||linkAlert(srv.id)||consoleAlerts(srv).length))return {ok:true,items:[],acked:0};throw e;});   // a game server down is the likeliest cause: its backup alert must still show
  if(b.cmd==="rename"&&r.name)renamed(srv,Number.isSafeInteger(b.id)?b.id:null,r.old,r.name);
  if(b.cmd==="player-delete")links.clear();
  if(srv.link&&!(NEEDS[b.cmd]&&!WRITES(b.cmd)))srv.cached=null;   // anything but a known read: the next /api/servers asks the party again (its invite code, its chat...)
  if(b.cmd==="player"&&r.player)r.player.isMod=modIds.includes(r.player.id);
  if(b.cmd==="abandoned-list")for(const x of r.items||[])x.isMod=modIds.includes(x.id);
  if(b.cmd==="alerts"&&!mod){const a=[...consoleAlerts(srv),linkAlert(srv.id),BACKUPS.alert(srv.id)].filter(Boolean);if(a.length)r.items=[...a,...(r.items||[])];}   // the owner's alone, and it stays until a backup works
  return send(res,200,{ok,...r});
 }
 // The new password is drawn here, sent once to the API and shown once to the admin: it is never logged nor kept.
 if(action==="reset-password"){
  if(!may(mod,"reset-password"))throw denied();
  if(mod)rate(mod);
  const mods=MODS.map(m=>m.players?.[srv.id]).filter(Number.isSafeInteger);   // another moderator's account is out of reach
  const password=generate(),r=await cmd(srv,{cmd:"reset-password",...pick(b,WHO),password,...actor,...(mod?{mods}:{})});
  return send(res,200,{ok:true,name:r.name,password});
 }
 if(mod)throw new HttpError(403,"Réservé à l'organisateur.");   // backups
 if(action==="backup")return sendBackup(srv,res);
 if(action==="backup-vapid")return sendVapid(srv,res);
 throw new HttpError(404,"Introuvable.");
}

const server=http.createServer(async(req,res)=>{
 let path;try{path=new URL(req.url,"http://x").pathname;}catch{path="";}
 try{await route(req,res,path);}
 catch(e){
  if(!(e instanceof HttpError))console.error("admin web:",e);
  if(res.headersSent)return res.destroy();
  send(res,e instanceof HttpError?e.status:500,{ok:false,error:e instanceof HttpError?e.message:"Erreur interne."},e instanceof HttpError&&e.headers||{});
 }
});
server.headersTimeout=15000;server.requestTimeout=60000;   // a backup download can take a moment
const HOST=env.ADMIN_HOST||"0.0.0.0";
if(LINK_ON){
 try{
  await LINK.listen(LINK_LISTEN,HOST);
  console.log(`admin link: parties welcome on ${HOST}:${LINK_LISTEN} (to paste: POLITIGO_ADMIN_URL=${linkUrl()??`<IP de cette machine>:${LINK_PORT}`}), certificate SHA-256 ${linkCert().fingerprint}`);
 }catch(e){
  LINK_ERROR=`le port de liaison ${LINK_LISTEN} du conteneur ne s'ouvre pas (${e.code||e.message}) : aucune partie ne peut se connecter. Vérifie qu'aucun autre service ne l'occupe, puis redémarre la console.`;
  console.error(`admin link: cannot listen on ${HOST}:${LINK_LISTEN} (${e.message}): no party can connect`);
 }
}else if(LINK.list().length)console.log(`admin link: closed (POLITIGO_ADMIN_LINK is not "on"): the ${LINK.list().length} network parties cannot connect`);
server.listen(PORT,HOST,()=>{
 // The owner wants LAN access (0.0.0.0 by default), but a generated password on an open address deserves a loud reminder.
 if(GENERATED&&!/^(127\.|::1$|localhost$)/.test(HOST)){
  console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.warn(`WARNING: the admin page listens on ${HOST}:${PORT} with a GENERATED password (POLITIGO_ADMIN_PASSWORD is not set).`);
  console.warn("Anyone who can reach this port can try it. Keep the published port on your LAN (POLITIGO_ADMIN_BIND, firewall),");
  console.warn("never on a host facing the internet without a reverse proxy with HTTPS; or set your own long POLITIGO_ADMIN_PASSWORD.");
  console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
 }
 console.log(`PolitiGo admin on :${PORT} (${SERVERS.map(s=>s.link?`${s.label||s.id}=liaison`:`${s.name||s.id}=${s.socket}`).join(", ")}${PROXY_HOPS?`, proxy hops ${PROXY_HOPS}`:""})`);
});
for(const sig of ["SIGTERM","SIGINT"])process.on(sig,()=>{LINK.close();server.close();process.exit(0);});
