// Network link to the admin console (1.7.3): an extra game server (another stack, another machine) dials the console's
// link port and answers its commands there, exactly as the local Unix socket does. The game never opens a port of its
// own: it is the client. TLS 1.3 against the console's self-signed certificate, pinned by its SHA-256 fingerprint and
// checked before a single byte of ours goes out. One JSON message per line. The token is never logged.
import tls from "node:tls";
import net from "node:net";
import crypto from "node:crypto";
import {readFileSync,writeFileSync,unlinkSync} from "node:fs";
import {open} from "node:fs/promises";

// LINE_MAX: what the console may send (its requests are small); REPLY_MAX: one answer's body, as much as over the local socket.
export const LINE_MAX=1<<20,REPLY_MAX=8*1024*1024,CHUNK=256*1024,MAX_INFLIGHT=8,BACKUP_MAX=2*1024**3;
const VARS=["POLITIGO_ADMIN_URL","POLITIGO_ADMIN_TLS","POLITIGO_ADMIN_TOKEN"];
const WAIT_REASONS=["token","instance","version"];   // retried only after the long wait: trying sooner changes nothing
// Text from the console, before it reaches a log: no control or bidi character can fake or hide a line.
const clean=(v,n)=>String(v??"").replace(/[\p{Cc}\p{Cf}]/gu," ").slice(0,n);
const num=(v,def)=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:def;};

// "AB:CD:..." or "abcd...": the same fingerprint either way.
export const normFp=s=>String(s??"").replace(/[\s:]/g,"").toUpperCase();
const colons=s=>normFp(s).replace(/(..)(?=.)/g,"$1:");
// Constant time: both sides hashed first, so the lengths always match.
export function sameFp(a,b){
 const h=s=>crypto.createHash("sha256").update(normFp(s)).digest();
 return crypto.timingSafeEqual(h(a),h(b));
}

// null: no link configured. {error}: a partial or malformed setup, said plainly (the token itself is never repeated).
// Otherwise the link's settings. ADMIN_LINK_*_MS are test knobs only (shorter delays).
export function linkConfig(env){
 const val=k=>String(env[k]??"").trim(),set=VARS.filter(val);
 if(!set.length)return null;
 const off=" Pas de liaison avec la console (le jeu tourne normalement).";
 if(set.length<3)return {error:`configuration incomplète : ${VARS.filter(k=>!set.includes(k)).join(" et ")} manquante (il faut POLITIGO_ADMIN_URL, POLITIGO_ADMIN_TLS et POLITIGO_ADMIN_TOKEN, toutes trois copiées depuis la console, page Parties).${off}`};
 const m=/^(?:\[([0-9A-Fa-f:.]+)\]|([A-Za-z0-9.-]+)):(\d{1,5})$/.exec(val("POLITIGO_ADMIN_URL"));
 const port=m?Number(m[3]):0;
 if(!m||port<1||port>65535||(m[1]&&net.isIP(m[1])!==6))return {error:`POLITIGO_ADMIN_URL invalide : attendu hôte:port (exemple 192.168.1.10:8091).${off}`};
 const fp=normFp(val("POLITIGO_ADMIN_TLS"));
 if(!/^[0-9A-F]{64}$/.test(fp))return {error:`POLITIGO_ADMIN_TLS invalide : attendu l'empreinte SHA-256 affichée par la console (64 chiffres hexadécimaux, avec ou sans « : »).${off}`};
 const token=val("POLITIGO_ADMIN_TOKEN");
 if(!/^pgk_[A-Za-z0-9_-]{16,200}$/.test(token))return {error:`POLITIGO_ADMIN_TOKEN invalide : le jeton commence par pgk_ (copie-le tel quel depuis la console).${off}`};
 return {host:m[1]||m[2],port,fp,token,
  retryMin:num(env.ADMIN_LINK_RETRY_MS,2000),retryMax:60000,wait:num(env.ADMIN_LINK_WAIT_MS,10*6e4),idle:num(env.ADMIN_LINK_IDLE_MS,60000),helloWait:10000};
}

// This game's lasting identity for the console: a random UUID made once, kept 0600 next to the database.
export function instanceId(file,log=console){
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
 try{const s=readFileSync(file,"utf8").trim();if(UUID.test(s))return s;}
 catch(e){if(e.code!=="ENOENT")log.error(`[admin-link] ${file} illisible (${e.message}) : nouvel identifiant.`);}
 const id=crypto.randomUUID();
 try{writeFileSync(file,id+"\n",{mode:0o600});}
 catch(e){log.error(`[admin-link] identifiant de partie NON enregistré (${e.message}) : il changera au prochain démarrage et la console refusera la partie.`);}
 return id;
}

const human=ms=>ms>=6e4?`${Math.round(ms/6e4)} min`:`${Math.max(1,Math.round(ms/1000))} s`;

// exec(body) runs one admin command exactly as the socket does and resolves with the socket's reply object.
// A backup ({ok:true,path,bytes}) is streamed from that file, which is then deleted whatever happens.
export function startLink(cfg,{instance,info,exec,limit=Infinity,log=console}){
 const where=`${cfg.host.includes(":")?`[${cfg.host}]`:cfg.host}:${cfg.port}`;
 let conn=null,timer=null,stopped=false,attempt=0,state="",backingUp=false;   // one backup at a time for this game
 // One log per change of state, never one per try.
 const say=(key,line,err=false)=>{if(key===state)return;state=key;(err?log.error:log.info)(`[admin-link] ${line}`);};
 log.info(`[admin-link] liaison vers la console ${where} activée (instance ${instance}).`);

 function later(ms){clearTimeout(timer);if(!stopped)timer=setTimeout(dial,ms);}
 const backoff=()=>{const base=Math.min(cfg.retryMax,cfg.retryMin*2**Math.min(attempt++,10));return Math.round(base*(0.75+Math.random()*0.5));};

 function dial(){
  if(stopped)return;
  const c={up:false,closing:null,queue:[],running:0,why:null,jobs:new Map()};   // jobs: id → {cancelled} of the running requests
  conn=c;
  const sock=c.sock=tls.connect({host:cfg.host,port:cfg.port,rejectUnauthorized:false,minVersion:"TLSv1.3",...(net.isIP(cfg.host)?{}:{servername:cfg.host})});
  sock.setNoDelay(true);sock.setKeepAlive(true,30000);
  let wait=setTimeout(()=>{c.why="pas de réponse de la console";sock.destroy();},cfg.helloWait);
  // Anything received, a ping most often, proves the console is there; nothing for cfg.idle cuts the link.
  const idle=setTimeout(()=>{c.why="plus de nouvelles de la console";sock.destroy();},cfg.idle);
  const alive=()=>idle.refresh();
  sock.on("error",e=>{c.why??=e.code||e.message;});
  sock.on("secureConnect",()=>{
   const got=sock.getPeerCertificate()?.fingerprint256||"";
   if(!got||!sameFp(got,cfg.fp)){
    c.closing="fingerprint";sock.destroy();
    say("fingerprint",`empreinte du certificat différente : attendu ${colons(cfg.fp)}, reçu ${got||"aucun certificat"}. Vérifie POLITIGO_ADMIN_TLS (copiée depuis la console). Nouvel essai dans ${human(cfg.wait)}.`,true);
    return;
   }
   alive();
   const i=info();
   send(c,{t:"hello",v:1,token:cfg.token,instance,name:i.name,version:i.version,players:i.players});
  });
  sock.setEncoding("utf8");
  let buf="";
  sock.on("data",d=>{
   alive();buf+=d;
   let i;
   while((i=buf.indexOf("\n"))>=0){
    const line=buf.slice(0,i);buf=buf.slice(i+1);
    if(i>LINE_MAX){c.why="message trop gros";return sock.destroy();}
    let m=null;try{m=JSON.parse(line);}catch{}
    if(m&&typeof m==="object")onMessage(c,m);
    if(sock.destroyed)return;
   }
   if(buf.length>LINE_MAX){c.why="message trop gros";sock.destroy();}
  });
  sock.on("close",()=>{
   clearTimeout(wait);clearTimeout(idle);
   c.queue.length=0;
   if(conn===c)conn=null;
   if(stopped)return;
   if(c.closing==="fingerprint")return later(cfg.wait);
   if(c.closing==="refused")return later(c.refusedWait);
   say("down",c.up?`liaison coupée (${c.why||"fermée par la console"}) : reconnexion automatique.`:`console ${where} injoignable (${c.why||"connexion fermée"}) : nouvelles tentatives régulières.`,true);
   later(backoff());
  });
  c.welcome=()=>{clearTimeout(wait);wait=null;};
 }

 function onMessage(c,m){
  if(m.t==="ping"){if(c.up)send(c,{t:"pong"});return;}
  if(m.t==="welcome"&&!c.up){
   c.up=true;attempt=0;c.welcome();
   say("up",`liée à la console ${where}${typeof m.id==="string"?` (partie ${clean(m.id,40)})`:""}.`);
   return;
  }
  if(m.t==="refused"&&!c.up){
   const reason=clean(m.reason,20),text=clean(m.msg,200);
   c.closing="refused";c.refusedWait=WAIT_REASONS.includes(reason)?cfg.wait:backoff();
   say("refused:"+reason,`refusée par la console (${reason||"?"}${text?` : ${text}`:""}). Nouvel essai dans ${human(c.refusedWait)}.`,true);
   c.welcome();c.sock.destroy();
   return;
  }
  if(m.t==="req"&&c.up&&Number.isSafeInteger(m.id)){
   c.queue.push(m);pump(c);
  }
  // The console gave up on a request: a waiting one is dropped, a running one sends nothing more (a backup stops its
  // chunks and deletes its copy). Any other message is ignored.
  if(m.t==="cancel"&&c.up&&Number.isSafeInteger(m.id)){
   const k=c.queue.findIndex(q=>q.id===m.id);if(k>=0)c.queue.splice(k,1);
   const j=c.jobs.get(m.id);if(j)j.cancelled=true;
  }
 }

 // At most MAX_INFLIGHT commands at once; the others wait in order.
 function pump(c){
  while(c.running<MAX_INFLIGHT&&c.queue.length&&!c.sock.destroyed){
   const m=c.queue.shift(),job={cancelled:false};c.running++;c.jobs.set(m.id,job);
   run(c,m,job).catch(e=>log.error(`[admin-link] requête ${m.id} : ${e?.message||e}`))
    .finally(()=>{if(c.jobs.get(m.id)===job)c.jobs.delete(m.id);c.running--;pump(c);});
  }
 }
 async function run(c,{id,body},job){
  // The socket's own checks: an object, and no bigger than one socket line.
  let r;
  if(!body||typeof body!=="object"||Array.isArray(body))r={ok:false,error:"JSON invalide."};
  else if(JSON.stringify(body).length>limit)r={ok:false,error:"Requête trop grosse."};
  else if(body.cmd!=="backup")r=await exec(body);
  else if(backingUp)r={ok:false,error:"Une sauvegarde est déjà en cours."};
  else{
   backingUp=true;
   try{r=await exec(body);if(r?.ok&&typeof r.path==="string")return await stream(c,id,r,job);}
   finally{backingUp=false;}
  }
  if(job.cancelled)return;
  // Up to REPLY_MAX for the answer itself (the console takes the line with a little room for its envelope).
  if(Buffer.byteLength(JSON.stringify(r)??"")>REPLY_MAX)r={ok:false,error:"Réponse trop grosse pour la liaison (8 Mio au plus)."};
  await send(c,{t:"res",id,body:r});
 }
 // The backup file goes in base64 chunks, then its size and sha256 for the console to check; deleted in every case.
 async function stream(c,id,r,job){
  let fh=null;
  try{
   fh=await open(r.path,"r");
   const size=(await fh.stat()).size;
   if(size>BACKUP_MAX)return await send(c,{t:"res",id,body:{ok:false,error:"Sauvegarde trop grosse pour la liaison (2 Gio au plus)."}});
   const hash=crypto.createHash("sha256"),buf=Buffer.alloc(CHUNK);let bytes=0;
   for(;;){
    if(c.sock.destroyed||job.cancelled)return;
    const {bytesRead}=await fh.read(buf,0,CHUNK,null);if(!bytesRead)break;
    const part=buf.subarray(0,bytesRead);hash.update(part);bytes+=bytesRead;
    await send(c,{t:"chunk",id,data:part.toString("base64")});
   }
   if(job.cancelled)return;
   const out={ok:true,stream:true,bytes,sha256:hash.digest("hex")};
   if(r.vapid!==undefined)out.vapid=r.vapid;
   await send(c,{t:"res",id,body:out});
  }catch(e){
   log.error(`[admin-link] envoi de la sauvegarde impossible : ${e?.message||e}`);
   if(!job.cancelled)await send(c,{t:"res",id,body:{ok:false,error:"Sauvegarde : envoi par la liaison impossible (voir les journaux de la partie)."}});
  }finally{
   try{await fh?.close();}catch{}
   for(const f of [r.path,r.path+"-journal"])try{unlinkSync(f);}catch{}
  }
 }
 // Resolves once the line is taken (or the socket is gone): a big backup never piles up in memory.
 function send(c,o){
  const s=c.sock;if(s.destroyed)return Promise.resolve();
  return new Promise(ok=>{
   if(s.write(JSON.stringify(o)+"\n"))return ok();
   const done=()=>{s.off("drain",done);s.off("close",done);ok();};
   s.on("drain",done);s.on("close",done);
  });
 }

 dial();
 return {
  get up(){return !!conn?.up;},
  stop(){
   if(stopped)return;stopped=true;clearTimeout(timer);
   if(conn){conn.sock.end();const s=conn.sock;setTimeout(()=>s.destroy(),500).unref();}
   log.info("[admin-link] liaison arrêtée.");
  },
 };
}
