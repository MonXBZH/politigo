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

const env=process.env;
const PORT=+env.PORT||8090,DATA=env.ADMIN_DATA||"/data-admin";
const UI=env.ADMIN_UI||join(dirname(fileURLToPath(import.meta.url)),"ui");
const PROXY_HOPS=Math.max(0,Math.min(5,+env.ADMIN_PROXY_HOPS||0)),FORCE_SECURE=env.ADMIN_COOKIE_SECURE==="1";
const SESSION_MS=12*3600e3,MAX_SESSIONS=50,BODY_MAX=16*1024,REPLY_MAX=8*1024*1024,SOCKET_REQ_MAX=4096;
const COOKIE="politigo_admin",WINDOW=15*60e3,IP_TRIES=5,ALL_TRIES=30;

class HttpError extends Error{constructor(status,msg){super(msg);this.status=status;}}

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
const serverById=id=>{const s=SERVERS.find(x=>x.id===id);if(!s)throw new HttpError(404,"Serveur inconnu.");return s;};

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
const PANELS=[["tableau","Tableau de bord"],["traiter","À traiter"],["joueurs","Joueurs"],["annonces","Annonces"],["chat","Chat"],["fil","Fil"],
 ["duels","Duels"],["bots","Détection de bots"],["journal","Journal d'admin"]];
const ACTIONS=[["chat-delete","Supprimer un message du chat"],["chat-mute","Couper le chat d'un joueur"],["signout","Déconnecter un joueur"],
 ["rename","Renommer un joueur"],["suspend","Suspendre ou réactiver un compte"],["unlock","Débloquer la connexion d'un joueur"],
 ["reset-password","Réinitialiser le mot de passe d'un joueur"],["announce","Envoyer et planifier des annonces"],["feed-delete","Supprimer une ligne du fil"],
 ["duel-cancel","Annuler un duel en cours"],["duel-annul","Annuler un duel terminé (rendre les gains)"],["alerts-ack","Marquer une alerte comme vue"],
 ["invite","Voir et copier le code d'invitation"]];
const PANEL_IDS=PANELS.map(x=>x[0]),ACTION_IDS=ACTIONS.map(x=>x[0]);
const PRESETS=[{id:"chat",label:"Modo chat",panels:["traiter","chat"],actions:["chat-delete","chat-mute","alerts-ack"]},
 {id:"full",label:"Modo complet",panels:PANEL_IDS,actions:ACTION_IDS.filter(a=>a!=="invite")}];   // the code stays out of a player's hands unless checked
// What each command asks of a moderator: one of these panels (p:) or actions (a:). Not listed: the owner's alone.
const NEEDS={stats:PANEL_IDS.map(p=>"p:"+p),list:["p:tableau","p:joueurs","p:annonces"],player:["p:joueurs"],
 "schedule-list":["p:annonces"],"announce-history":["p:annonces"],"feed-list":["p:fil"],"duels-list":["p:duels"],"duels-suspects":["p:duels"],
 bots:["p:bots"],"chat-reports":["p:chat"],"chat-feed":["p:chat"],"chat-media":["p:chat"],alerts:["p:traiter"],audit:["p:journal"],"invite-get":["a:invite"],
 signout:["a:signout"],rename:["a:rename"],suspend:["a:suspend"],unlock:["a:unlock"],announce:["a:announce"],"schedule-add":["a:announce"],
 "schedule-delete":["a:announce"],"schedule-toggle":["a:announce"],"feed-delete":["a:feed-delete"],"duel-cancel":["a:duel-cancel"],
 "duel-annul":["a:duel-annul"],"chat-delete":["a:chat-delete"],"chat-mute":["a:chat-mute"],"alerts-ack":["a:alerts-ack"],"reset-password":["a:reset-password"]};
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
 const line=JSON.stringify({...req,via:"web"});   // a moderator's by/self come in req, set here, never from the page
 if(Buffer.byteLength(line)>=SOCKET_REQ_MAX)throw new HttpError(413,"Requête trop grosse pour l'API.");
 const deadline=Date.now()+timeout;
 await slot(srv,deadline);
 try{return await sockOnce(srv,line,Math.max(1,deadline-Date.now()));}finally{release(srv);}
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
async function status(srv,full=false){
 try{
  const s=await cmd(srv,{cmd:"stats"},4000);
  if(!srv.name&&typeof s.name==="string"&&s.name.trim())srv.label=s.name.trim().slice(0,40);
  const o={id:srv.id,name:srv.label||"PolitiGo",up:true,version:s.version??null,players:s.players??null,online:s.online??null,active24h:s.active24h??null,chatRooms:s.chatRooms??null};
  if(full){
   const [rep,sch,inv]=await Promise.allSettled([cmd(srv,{cmd:"chat-reports"},4000),cmd(srv,{cmd:"schedule-list"},4000),cmd(srv,{cmd:"invite-get"},4000)]);
   o.invite=inv.status==="fulfilled"?{code:inv.value.invite||null,open:!!inv.value.open&&!!inv.value.invite}:null;   // sessions only: the copy button
   o.chatReports=rep.status==="fulfilled"?rep.value.items?.length??0:null;
   const next=sch.status==="fulfilled"?(sch.value.schedules||[]).filter(x=>x.enabled&&x.next).sort((a,b)=>a.next-b.next)[0]:null;
   o.nextAnnounce=next?{t:next.next,text:String(next.text).slice(0,80)}:null;
  }
  return o;
 }catch(e){return {id:srv.id,name:srv.label||"PolitiGo",up:false,error:e.message};}
}

// What the page may ask, with the fields passed through: anything else is dropped before reaching the socket.
const WHO=["name","id"];
const CMDS={
 stats:[],list:[],player:WHO,signout:WHO,rename:[...WHO,"newName"],suspend:[...WHO,"on"],unlock:WHO,
 announce:["text","to","camp"],"schedule-list":[],"schedule-add":["text","target","kind","at","time","days","until"],
 "schedule-delete":["id"],"schedule-toggle":["id","enabled"],"announce-history":[],"feed-list":["limit"],"feed-delete":["id"],
 "duels-list":[],"duel-cancel":["id"],"duels-suspects":[],"duel-annul":["id"],alerts:[],"alerts-ack":["keys"],"invite-get":[],"invite-regenerate":[],"registrations-set":["open"],"event-set":["mode"],
 bots:[],"chat-reports":[],"chat-feed":["before","limit","room"],"chat-media":["id"],"chat-delete":["id"],"chat-mute":[...WHO,"hours"],"chat-set":["global","camp"],audit:["limit"],
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
// The API writes backup-<ts>.db next to ITS socket; only such a name in exactly that server's directory is read, then removed.
function backupPath(srv,r){
 const p=typeof r.path==="string"?resolve(r.path):"";
 if(!p||dirname(p)!==srv.dir||!/^backup-\d+\.db$/.test(basename(p)))throw new HttpError(502,"Chemin de sauvegarde inattendu.");
 return p;
}
const stamp=()=>new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
async function sendBackup(srv,res){
 const p=backupPath(srv,await cmd(srv,{cmd:"backup"}));
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
async function sendVapid(srv,res){
 const r=await cmd(srv,{cmd:"backup",vapid:true});
 fs.promises.unlink(backupPath(srv,r)).catch(()=>{});   // only the key was wanted: the database copy goes at once
 if(!r.vapid||typeof r.vapid!=="object")throw new HttpError(404,"Pas de vapid.json sur ce serveur (notifications désactivées ?).");
 const body=JSON.stringify(r.vapid,null,1);
 res.writeHead(200,{...BASE_HEADERS,"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body),"Cache-Control":"no-store",
  "Content-Disposition":`attachment; filename="vapid-${srv.id}-${stamp()}.json"`});
 res.end(body);
 console.log(`admin web: vapid.json downloaded (${srv.id})`);
}

// ===================================================================== moderators' management (the owner only)
// /api/mods: the list and what can be granted; save: create (a player of one server) or change; password: a new one;
// delete. Any change of rights or password closes that moderator's sessions at once.
async function playerOn(srv,q){try{return (await cmd(srv,{cmd:"player",...q},6000)).player;}catch{return null;}}
const ids=(v,all)=>Array.isArray(v)?[...new Set(v.filter(x=>all.includes(x)))]:[];
async function modsRoute(res,path,b){
 if(path==="/api/mods")return send(res,200,{ok:true,mods:MODS.map(modView),panels:PANELS,actions:ACTIONS,presets:PRESETS,
  servers:SERVERS.map(s=>({id:s.id,name:s.label||s.name||"PolitiGo"}))});
 const m=/^\/api\/mods\/(save|password|delete)$/.exec(path);if(!m)throw new HttpError(404,"Introuvable.");
 const old=typeof b.id==="string"?MODS.find(x=>x.id===b.id):null;
 if(m[1]!=="save"&&!old)throw new HttpError(404,"Modérateur introuvable.");
 if(m[1]==="delete"){MODS=MODS.filter(x=>x!==old);saveMods();dropSessionsOf(old.id);console.log(`admin web: moderator ${old.name} removed`);return send(res,200,{ok:true});}
 if(m[1]==="password"){
  const password=modPassword();old.hash=await hashPass(password);saveMods();dropSessionsOf(old.id);
  console.log(`admin web: new password for moderator ${old.name}`);
  return send(res,200,{ok:true,name:old.name,password});
 }
 const panels=ids(b.panels,PANEL_IDS),actions=ids(b.actions,ACTION_IDS);
 if(!panels.length)throw new HttpError(400,"Coche au moins un panneau.");
 let rec=old;
 if(!rec){
  if(MODS.length>=MODS_MAX)throw new HttpError(400,`${MODS_MAX} modérateurs au plus.`);
  const home=serverById(typeof b.server==="string"?b.server:"");
  const p=Number.isSafeInteger(b.player)?await playerOn(home,{id:b.player}):null;
  if(!p)throw new HttpError(404,"Joueur introuvable sur ce serveur.");
  if(MODS.some(x=>x.key===modKey(p.name)))throw new HttpError(409,`${p.name} est déjà modérateur.`);
  rec={id:crypto.randomBytes(8).toString("hex"),name:p.name,key:modKey(p.name),home:home.id,players:{[home.id]:p.id},created:Date.now()};
 }
 const servers=[...new Set([rec.home,...ids(b.servers,SERVERS.map(s=>s.id))])];
 // On the other servers, their own account (same name) is found once, so that it stays out of their reach there too.
 for(const id of servers)if(!(id in rec.players)){const p=await playerOn(serverById(id),{name:rec.name});rec.players[id]=p?.id??null;}
 Object.assign(rec,{servers,panels,actions});
 let password=null;
 if(!old){password=modPassword();rec.hash=await hashPass(password);MODS.push(rec);}
 saveMods();if(old)dropSessionsOf(old.id);
 console.log(`admin web: moderator ${rec.name} ${old?"updated":"created"} (${servers.join(", ")})`);
 return send(res,200,{ok:true,mod:modView(rec),...(password?{password}:{})});
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
  const t=crypto.randomBytes(32).toString("base64url");
  if(sessions.size>=MAX_SESSIONS)sessions.delete(sessions.keys().next().value);   // oldest first
  sessions.set(tokenKey(t),{exp:Date.now()+SESSION_MS,mod:mod?.id??null});
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
  const list=await Promise.all(mine.map(s=>status(s,b.full===true)));
  if(mod&&!mod.actions.includes("invite"))for(const s of list)delete s.invite;
  return send(res,200,{ok:true,servers:list});
 }
 if(path.startsWith("/api/mods")){if(mod)throw new HttpError(403,"Réservé à l'organisateur.");return modsRoute(res,path,b);}
 // Every game action names its server in the path: /api/s/<id>/<action>.
 const m=/^\/api\/s\/([a-z0-9-]{1,40})\/([a-z-]{1,30})$/.exec(path);
 if(!m)throw new HttpError(404,"Introuvable.");
 const srv=serverById(m[1]),action=m[2];
 if(mod&&!mod.servers.includes(srv.id))throw new HttpError(403,"Ce serveur ne t'est pas ouvert.");
 const denied=()=>new HttpError(403,"Action non autorisée pour ton rôle.");
 // A moderator's name signs the game's admin log, and their own account there is out of their reach.
 const actor=mod?{by:mod.name,...(Number.isSafeInteger(mod.players?.[srv.id])?{self:mod.players[srv.id]}:{})}:{};
 if(action==="call"){
  const keys=Object.hasOwn(CMDS,b.cmd)?CMDS[b.cmd]:null;
  if(!keys)throw new HttpError(400,"Commande inconnue.");
  if(!may(mod,b.cmd)||(mod&&!NEEDS[b.cmd]))throw denied();
  const {ok,...r}=await cmd(srv,{cmd:b.cmd,...pick(b,keys),...actor});
  return send(res,200,{ok,...r});
 }
 // The new password is drawn here, sent once to the API and shown once to the admin: it is never logged nor kept.
 if(action==="reset-password"){
  if(!may(mod,"reset-password"))throw denied();
  const password=generate(),r=await cmd(srv,{cmd:"reset-password",...pick(b,WHO),password,...actor});
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
  send(res,e instanceof HttpError?e.status:500,{ok:false,error:e instanceof HttpError?e.message:"Erreur interne."});
 }
});
server.headersTimeout=15000;server.requestTimeout=60000;   // a backup download can take a moment
const HOST=env.ADMIN_HOST||"0.0.0.0";
server.listen(PORT,HOST,()=>{
 // The owner wants LAN access (0.0.0.0 by default), but a generated password on an open address deserves a loud reminder.
 if(GENERATED&&!/^(127\.|::1$|localhost$)/.test(HOST)){
  console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.warn(`WARNING: the admin page listens on ${HOST}:${PORT} with a GENERATED password (POLITIGO_ADMIN_PASSWORD is not set).`);
  console.warn("Anyone who can reach this port can try it. Keep the published port on your LAN (POLITIGO_ADMIN_BIND, firewall),");
  console.warn("never on a host facing the internet without a reverse proxy with HTTPS; or set your own long POLITIGO_ADMIN_PASSWORD.");
  console.warn("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
 }
 console.log(`PolitiGo admin on :${PORT} (${SERVERS.map(s=>`${s.name||s.id}=${s.socket}`).join(", ")}${PROXY_HOPS?`, proxy hops ${PROXY_HOPS}`:""})`);
});
for(const sig of ["SIGTERM","SIGINT"])process.on(sig,()=>{server.close();process.exit(0);});
