// Network link (1.7.3): extra games ("parties": other Docker stacks, other machines) connect TO this console over TLS
// and are driven exactly as through a local admin socket. No API exposes a port: the game opens the connection.
// Protocol v1, one JSON frame per line: hello -> welcome|refused, then req/res (several in flight), chunk (a backup
// streamed in base64 pieces), ping/pong. The certificate is self-signed ECDSA P-256, written here by hand in DER (Node
// can sign but not build a certificate); the games pin its SHA-256 fingerprint (POLITIGO_ADMIN_TLS).
// Tokens are kept only as SHA-256 hashes (parties.json), never in clear, never logged. Plain Node, no npm dependency.
import tls from "node:tls";
import crypto from "node:crypto";
import fs from "node:fs";
import {join,dirname} from "node:path";

// Lines: 4 KiB before the hello, 1 MiB after; a "res" may reach 8 MiB (+ its frame) only when a request of that id is
// waiting on that very connection (admin/server.mjs REPLY_MAX). All lines being read hold 64 MiB at most together, and
// the answers over 1 MiB, from their first byte until they are parsed and handed over, 32 MiB at most together (BIG).
export const PROTOCOL=1,PARTIES_MAX=20,LINE_MAX=1024*1024,RES_MAX=8*1024*1024+4096,HELLO_LINE_MAX=4096,LINES_BUDGET=64*1024*1024,BIG_BUDGET=32*1024*1024;
// A streamed backup stops (507) when the admin volume would keep less than RESERVE free.
export const CHUNK_MAX=256*1024,BACKUP_MAX=2*1024**3,BACKUP_MS=10*60e3,RATE_WINDOW=30e3,RATE_MIN=64*1024,RESERVE=128*1024*1024;
export const UNAUTH_MAX=64,UNAUTH_PER_ADDR=3,FAILS_MAX=30,FAILS_WINDOW=15*60e3;
const CN="PolitiGo admin",YEARS=20,DOWN="Partie injoignable (liaison coupée).";
const BUSY="La console reçoit déjà trop de grosses réponses : réessaie dans un instant.";
const LOW=`Espace libre insuffisant dans le volume de la console (/data-admin) : moins de ${RESERVE/1048576} Mio libres, sauvegarde abandonnée. Libère de la place ou garde moins de sauvegardes.`;
const statfree=dir=>{const s=fs.statfsSync(dir);return s.bavail*s.bsize;};

// ===================================================================== DER, the least X.509 needs
const derLen=n=>{if(n<128)return Buffer.from([n]);const b=[];while(n>0){b.unshift(n&255);n=Math.floor(n/256);}return Buffer.from([0x80|b.length,...b]);};
const tlv=(tag,body)=>Buffer.concat([Buffer.from([tag]),derLen(body.length),body]);
const two=n=>String(n).padStart(2,"0");
export const der={
 seq:(...p)=>tlv(0x30,Buffer.concat(p)),
 set:(...p)=>tlv(0x31,Buffer.concat(p)),
 // Big-endian, minimal, positive (a leading 0 when the top bit is set).
 int:v=>{let b;if(typeof v==="number"){const h=v.toString(16);b=Buffer.from(h.length%2?"0"+h:h,"hex");}else b=Buffer.from(v);
  let i=0;while(i<b.length-1&&b[i]===0&&!(b[i+1]&0x80))i++;b=b.subarray(i);return tlv(0x02,b[0]&0x80?Buffer.concat([Buffer.from([0]),b]):b);},
 oid:s=>{const a=s.split(".").map(Number),out=[40*a[0]+a[1]];
  for(const n of a.slice(2)){const b=[n&127];let v=Math.floor(n/128);while(v>0){b.unshift(0x80|(v&127));v=Math.floor(v/128);}out.push(...b);}
  return tlv(0x06,Buffer.from(out));},
 bits:b=>tlv(0x03,Buffer.concat([Buffer.from([0]),b])),
 octets:b=>tlv(0x04,b),
 bool:v=>tlv(0x01,Buffer.from([v?0xff:0])),
 utf8:s=>tlv(0x0c,Buffer.from(s,"utf8")),
 // UTCTime up to 2049, GeneralizedTime from 2050 (RFC 5280 4.1.2.5), whole seconds, Zulu.
 time:t=>{const d=new Date(t),y=d.getUTCFullYear(),rest=`${two(d.getUTCMonth()+1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}${two(d.getUTCSeconds())}Z`;
  return y>=1950&&y<2050?tlv(0x17,Buffer.from(two(y%100)+rest)):tlv(0x18,Buffer.from(String(y)+rest));},
 ctx:(n,body)=>tlv(0xa0+n,body),
};
const pem=(label,b)=>`-----BEGIN ${label}-----\n${b.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;

// A key and a self-signed certificate: v3, random positive serial, CN "PolitiGo admin", valid 20 years, basicConstraints
// CA:false (critical), signed ecdsa-with-SHA256.
export function makeCert(t=Date.now()){
 const {privateKey,publicKey}=crypto.generateKeyPairSync("ec",{namedCurve:"P-256"});
 const alg=der.seq(der.oid("1.2.840.10045.4.3.2")),name=der.seq(der.set(der.seq(der.oid("2.5.4.3"),der.utf8(CN))));
 const serial=crypto.randomBytes(16);serial[0]=(serial[0]&0x7f)|0x01;
 const from=Math.floor(t/1000)*1000,to=new Date(from);to.setUTCFullYear(to.getUTCFullYear()+YEARS);
 const tbs=der.seq(der.ctx(0,der.int(2)),der.int(serial),alg,name,der.seq(der.time(from),der.time(to.getTime())),name,
  publicKey.export({type:"spki",format:"der"}),der.ctx(3,der.seq(der.seq(der.oid("2.5.29.19"),der.bool(true),der.octets(der.seq())))));
 const sig=crypto.sign("sha256",tbs,{key:privateKey,dsaEncoding:"der"});
 return {key:privateKey.export({type:"pkcs8",format:"pem"}),cert:pem("CERTIFICATE",der.seq(tbs,alg,der.bits(sig)))};
}
const certInfo=(key,cert)=>{
 const x=new crypto.X509Certificate(cert);
 if(!x.checkPrivateKey(crypto.createPrivateKey(key)))throw new Error("the key does not match the certificate");
 return {key,cert,fingerprint:x.fingerprint256,created:(x.validFromDate??new Date(x.validFrom)).getTime()};
};
// Written whole or not at all: a temporary file, flushed to the disk (fsync), then renamed.
function writeAtomic(file,text,mode){
 const tmp=`${file}.tmp-${crypto.randomBytes(6).toString("hex")}`;let fd=null;
 try{fd=fs.openSync(tmp,"wx",mode);fs.writeSync(fd,text);fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(tmp,file);}
 catch(e){if(fd!=null)try{fs.closeSync(fd);}catch{}try{fs.unlinkSync(tmp);}catch{}throw e;}
}
// dir/key.pem (0600) and dir/cert.pem, kept: made only when missing or unreadable (the fingerprint the games pinned
// must not change at every start). create:false only reads. regenerated: a certificate the parties may have pinned
// was lost (a file left, unreadable, or parties already known): they all need the new fingerprint.
export function certificate(dir,{create=true,log=console.error,known=false}={}){
 const kf=join(dir,"key.pem"),cf=join(dir,"cert.pem");let regenerated=false;
 try{return certInfo(fs.readFileSync(kf,"utf8"),fs.readFileSync(cf,"utf8"));}
 catch(e){
  if(!create)return null;
  if(e.code!=="ENOENT"||fs.existsSync(kf)||fs.existsSync(cf)||known){regenerated=true;log(`admin link: certificate in ${dir} unreadable or missing (${e.message}): a new one is made, every party needs the new POLITIGO_ADMIN_TLS`);}
 }
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const c=makeCert();writeAtomic(kf,c.key,0o600);writeAtomic(cf,c.cert,0o644);
 return {...certInfo(c.key,c.cert),regenerated};
}

// ===================================================================== tokens, parties.json, what a party announces
export const newToken=()=>"pgk_"+crypto.randomBytes(32).toString("base64url");
const tokenHash=t=>crypto.createHash("sha256").update(String(t)).digest("hex");
export const fold=s=>String(s).normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().trim();
// No control, format (bidi) or unassigned characters, spaces collapsed, 1 to max characters; else null.
const text=(v,max)=>{if(typeof v!=="string")return null;const s=v.replace(/\p{C}/gu,"").replace(/\s+/g," ").trim();return s?[...s].slice(0,max).join("").trim():null;};
export const cleanName=v=>text(v,40);
// "1.7.3" everywhere: a leading v dropped, a short plain string or nothing.
export const cleanVersion=v=>{if(typeof v!=="string")return null;const s=v.trim().replace(/^v(?=\d)/i,"");return /^[\w.+-]{1,32}$/.test(s)?s:null;};
export const cleanPlayers=v=>Number.isInteger(v)&&v>=0&&v<=1e6?v:null;
const FIELDS=["id","label","tokenHash","instance","created","announced","version","addr","firstSeen","lastSeen","refused"];
const valid=p=>p&&typeof p.id==="string"&&/^p-[0-9a-f]{8}$/.test(p.id)&&typeof p.label==="string"&&typeof p.tokenHash==="string"&&/^[0-9a-f]{64}$/.test(p.tokenHash);
const addrOf=s=>String(s.remoteAddress||"?").replace(/^::ffff:/,"");

// root: the admin volume (parties.json there, the certificate in root/link). Err(status,message): the caller's HTTP
// error. listen() opens the listener. onLink(party) when a party is bound to its first machine (or comes back with a
// repaired parties.json), onLeave(id) when removed. Hooks for the tests: now, pingMs, deadMs, helloMs, backupMs,
// rateMs (the window the throughput is measured on), budget (bytes of lines being read, all connections), big (bytes
// of answers over 1 MiB being read or handled), freeSpace(dir) (bytes free there) and reserve (what must stay free).
export function createLink({root,Err,log=console.log,warn=console.error,onLink=()=>{},onLeave=()=>{},taken=()=>false,
 now=Date.now,pingMs=20e3,deadMs=60e3,helloMs=10e3,backupMs=BACKUP_MS,rateMs=RATE_WINDOW,budget=LINES_BUDGET,big=BIG_BUDGET,
 freeSpace=statfree,reserve=RESERVE}){
 const file=join(root,"parties.json"),dir=join(root,"link"),certFlag=join(dir,"cert-new.json");
 let list=[],cert=null,server=null,closing=false,broken=null;   // broken: {name, t, error}: parties.json could not be read
 const load=()=>{const v=JSON.parse(fs.readFileSync(file,"utf8"));if(!Array.isArray(v))throw new Error("ce n'est pas une liste");return v.filter(valid).map(p=>Object.fromEntries(FIELDS.map(k=>[k,p[k]??null])));};
 // An unreadable list is set aside (never overwritten by an empty one), and every change refused until it is dealt with.
 function setAside(e){
  const name=`parties.json.corrupt-${new Date(now()).toISOString().replace(/[:.]/g,"-")}`;let kept=name;
  try{fs.renameSync(file,join(root,name));}catch{kept="parties.json";}
  broken={name:kept,t:now(),error:String(e.message).slice(0,120)};
  warn(`reading ${file}: ${e.message}: set aside as ${kept}, no party can connect until it is repaired (renamed parties.json) or deleted`);
 }
 try{list=load();}catch(e){if(e.code!=="ENOENT")setAside(e);}
 const BROKEN=()=>new Err(409,`Liste des parties illisible : /data-admin/${broken.name}. Répare-la et renomme-la parties.json, ou supprime-la, puis réessaie.`);
 // The set-aside file gone: the repaired list (if any) is taken back, else an empty one starts.
 function writable(){
  if(!broken)return;
  if(broken.name!=="parties.json"&&fs.existsSync(join(root,broken.name)))throw BROKEN();
  try{list=load();}catch(e){if(e.code!=="ENOENT"){if(broken.name!=="parties.json")setAside(e);throw BROKEN();}list=[];}
  broken=null;log(`admin link: parties.json readable again (${list.length} parties)`);
  for(const p of list)if(p.instance||p.firstSeen)onLink({...p});
 }
 function save(){
  try{writeAtomic(file,JSON.stringify(list,null,1)+"\n",0o600);}
  catch(e){warn(`writing ${file}: ${e.message}`);throw new Err(500,"Impossible d'enregistrer les parties (volume /data-admin en lecture seule ?).");}
 }
 const quiet=()=>{if(!broken)try{save();}catch{}};
 const conns=new Map(),runtime=new Map(),saving=new Set();   // party id -> live connection; -> {players, tooOld}; ids with a backup under way
 const rt=id=>{let r=runtime.get(id);if(!r)runtime.set(id,r={players:null,tooOld:null});return r;};
 const byId=id=>{const p=list.find(x=>x.id===id);if(!p)throw new Err(404,"Partie inconnue.");return p;};
 // Every hash compared, in constant time: the time taken says nothing about which one is closest.
 function byToken(token){
  const h=Buffer.from(tokenHash(token),"hex");let hit=null;
  for(const p of list)if(crypto.timingSafeEqual(h,Buffer.from(p.tokenHash,"hex"))&&!hit)hit=p;
  return hit;
 }
 function drop(id){const c=conns.get(id);if(c){conns.delete(id);c.sock.destroy();fail(c,new Err(502,DOWN));}}

 // ------------------------------------------------------------------- the certificate, its alert
 let certNew;   // {fingerprint, t} once a certificate was regenerated, until "Vu" (kept in link/cert-new.json); false: none
 const readFlag=()=>{try{const v=JSON.parse(fs.readFileSync(certFlag,"utf8"));return typeof v?.fingerprint==="string"?v:null;}catch{return null;}};
 const shortFp=fp=>fp.replace(/:/g,"").slice(0,16).toLowerCase();
 function getCert(create){
  if(cert)return cert;
  cert=certificate(dir,{create,log:warn,known:list.length>0});
  if(cert?.regenerated){certNew={fingerprint:cert.fingerprint,t:now()};try{writeAtomic(certFlag,JSON.stringify(certNew),0o600);}catch(e){warn(`admin link: ${e.message}`);}}
  return cert;
 }

 // ------------------------------------------------------------------- requests over a live link
 function finish(c,rid,err,body){
  const p=c.pending.get(rid);if(!p)return;
  c.pending.delete(rid);clearTimeout(p.t);clearTimeout(p.total);clearInterval(p.rate);
  if(p.fd!=null){try{fs.closeSync(p.fd);}catch{}p.fd=null;}
  if(p.file){
   saving.delete(c.id);
   if(!err&&body?.ok===true){
    if(!p.bytes)err=new Err(502,"Sauvegarde vide reçue de la partie (0 octet) : réessaie.");
    else if(body.stream!==true||body.bytes!==p.bytes||body.sha256!==p.hash.digest("hex"))err=new Err(502,"Sauvegarde reçue incomplète ou abîmée : réessaie.");
   }
   if(err||body?.ok!==true)fs.promises.unlink(p.file).catch(()=>{});   // the game's own refusal (a full disk...) passes as such
   else body={...body,path:p.file};
  }
  err?p.ko(err):p.ok(body);
 }
 function fail(c,err){for(const rid of [...c.pending.keys()])finish(c,rid,err);}
 // Given up here (too long, too slow): the game is told to stop sending and to drop its copy (cancel).
 function abandon(c,rid,err){
  if(!c.pending.has(rid))return;
  finish(c,rid,err);
  if(!c.sock.destroyed)c.sock.write(JSON.stringify({t:"cancel",id:rid})+"\n");
 }
 // body: exactly what would go to the socket. file: where a streamed backup lands (0600, created here). The timeout
 // restarts with every piece received, within 10 minutes in all; once the pieces flow, less than 64 KiB/s over 30 s
 // gives up too (a game dripping bytes never holds a backup for ever). One backup at a time per party.
 function request(id,body,{timeout=15000,file=null}={}){
  const c=conns.get(id);if(!c)return Promise.reject(new Err(502,DOWN));
  if(file&&saving.has(id))return Promise.reject(new Err(409,"Une sauvegarde de cette partie est déjà en cours : réessaie quand elle est finie."));
  return new Promise((ok,ko)=>{
   const rid=++c.seq,p={ok,ko,file,fd:null,bytes:0,mark:0,hash:null,t:null,total:null,rate:null};
   if(file){
    let free=Infinity;try{free=freeSpace(dirname(file));}catch{}
    if(free<reserve)return ko(new Err(507,LOW));
    try{p.fd=fs.openSync(file,"wx",0o600);p.hash=crypto.createHash("sha256");}catch(e){return ko(new Err(507,`Sauvegarde impossible dans /data-admin (${e.code||e.message}).`));}
    saving.add(id);
    p.total=setTimeout(()=>abandon(c,rid,new Err(504,`Sauvegarde trop longue (${Math.round(backupMs/60e3)||1} min au plus) : réessaie plus tard.`)),backupMs);
   }
   p.arm=()=>{clearTimeout(p.t);p.t=setTimeout(()=>abandon(c,rid,new Err(504,"L'API ne répond pas.")),timeout);};
   p.arm();c.pending.set(rid,p);
   c.sock.write(JSON.stringify({t:"req",id:rid,body})+"\n");
  });
 }
 function chunk(c,m){
  const p=c.pending.get(m.id);if(!p)return;   // a request already given up: its pieces are dropped
  if(!p.file||typeof m.data!=="string")return abandon(c,m.id,new Err(502,"Réponse inattendue de la partie."));
  const b=Buffer.from(m.data,"base64");
  if(b.length>CHUNK_MAX||p.bytes+b.length>BACKUP_MAX){finish(c,m.id,new Err(502,"Sauvegarde trop grosse (2 Gio au plus)."));return c.sock.destroy();}
  // The admin volume keeps its reserve: a backup that would eat into it stops, its file goes (finish), the game is told.
  let free=Infinity;try{free=freeSpace(dirname(p.file));}catch{}
  if(free-b.length<reserve){warn(`admin link: backup of party ${c.id} stopped: less than ${reserve/1048576} MiB would stay free in ${dirname(p.file)}`);return abandon(c,m.id,new Err(507,LOW));}
  try{fs.writeSync(p.fd,b);}catch(e){return abandon(c,m.id,new Err(507,e.code==="ENOSPC"?"Disque plein dans le volume de la console (/data-admin).":`Écriture de la sauvegarde impossible (${e.code||e.message}).`));}
  p.hash.update(b);p.bytes+=b.length;p.arm();
  if(!p.rate)p.rate=setInterval(()=>{
   if(p.bytes-p.mark<RATE_MIN*rateMs/1000)return abandon(c,m.id,new Err(504,"Sauvegarde trop lente (moins de 64 Kio/s) : réessaie plus tard."));
   p.mark=p.bytes;
  },rateMs);
 }

 // ------------------------------------------------------------------- connections
 // Not yet authenticated: counted from the raw TCP connection (before TLS), 10 in all and 3 per address, each with
 // helloMs to bring its hello. Failed hellos: only unknown tokens count (30 per address and 15 min), then "busy" for
 // unknown tokens; a valid token is never refused for its address.
 const raw=new Map(),perAddr=new Map(),fails=new Map();   // `${addr}|${port}` -> free()
 const bucket=a=>{let b=fails.get(a);if(!b||b.reset<=now())fails.set(a,b={n:0,reset:now()+FAILS_WINDOW});return b;};
 const refuse=(s,reason,msg)=>{try{s.end(JSON.stringify({t:"refused",reason,msg})+"\n");}catch{}setTimeout(()=>s.destroy(),1000).unref();};
 const freeRaw=s=>raw.get(`${addrOf(s)}|${s.remotePort}`)?.();
 function onRaw(r){
  const addr=addrOf(r),key=`${addr}|${r.remotePort}`;
  r.on("error",()=>{});
  if(closing||raw.size>=UNAUTH_MAX||(perAddr.get(addr)||0)>=UNAUTH_PER_ADDR)return r.destroy();
  perAddr.set(addr,(perAddr.get(addr)||0)+1);
  const t=setTimeout(()=>{log(`admin link: no hello from ${addr} within ${helloMs/1000} s`);r.destroy();},helloMs);
  const free=()=>{if(raw.get(key)!==free)return;raw.delete(key);clearTimeout(t);const n=perAddr.get(addr)-1;if(n>0)perAddr.set(addr,n);else perAddr.delete(addr);};
  free.sock=r;raw.set(key,free);r.on("close",free);
 }
 function onSocket(s){
  const addr=addrOf(s);
  s.on("error",()=>{});
  if(closing)return refuse(s,"closed","La console ferme l'écoute des parties.");
  let c=null;
  s.on("close",()=>{freeRaw(s);if(c)left(c);});
  lines(s,head=>!c?HELLO_LINE_MAX:resFor(c,head)?RES_MAX:LINE_MAX,()=>{log(`admin link: line too long from ${c?`party ${c.id}`:addr}: connection closed`);s.destroy();},line=>{
   let m=null;try{m=JSON.parse(line);}catch{}
   if(c){c.rx=now();return frame(c,m);}
   if(!m||typeof m!=="object"||m.t!=="hello"||typeof m.token!=="string"||m.token.length>200)return s.destroy();
   const p=byToken(m.token);
   if(!p){
    const b=bucket(addr);
    if(b.n>=FAILS_MAX)return refuse(s,"busy","Trop d'essais depuis cette adresse : réessaie plus tard.");
    b.n++;log(`admin link: unknown token from ${addr}`);
    return refuse(s,"token","Jeton refusé par la console : recopie POLITIGO_ADMIN_TOKEN depuis la page Parties.");
   }
   const t=now(),version=cleanVersion(m.version);freeRaw(s);
   if(!Number.isInteger(m.v)||m.v<PROTOCOL){
    Object.assign(rt(p.id),{tooOld:{t,version,addr}});log(`admin link: party ${p.id} refused (protocol too old, version ${version||"?"}, from ${addr})`);
    return refuse(s,"version","Partie trop ancienne : 1.7.3 au moins.");
   }
   const instance=typeof m.instance==="string"&&/^[A-Za-z0-9-]{8,64}$/.test(m.instance)?m.instance:null;
   if(!instance)return s.destroy();
   if(p.instance&&p.instance!==instance){
    p.refused={t,addr,instance};quiet();
    log(`admin link: the token of party ${p.id} was presented by another machine (${addr}, instance ${instance.slice(0,8)}): refused`);
    return refuse(s,"instance","Ce jeton est déjà lié à une autre machine : demande un jeton propre à cette partie (console, page Parties, « Ajouter une partie »).");
   }
   const first=!p.instance;
   Object.assign(p,{instance,announced:cleanName(m.name),version,addr,firstSeen:p.firstSeen??t,lastSeen:t});
   Object.assign(rt(p.id),{tooOld:null,players:cleanPlayers(m.players)});
   const old=conns.get(p.id);
   c={id:p.id,sock:s,pending:new Map(),seq:0,rx:t};conns.set(p.id,c);
   if(old){old.sock.destroy();fail(old,new Err(502,DOWN));}   // the same machine again (a restart): the new link wins
   quiet();s.write(JSON.stringify({t:"welcome",id:p.id})+"\n");
   log(`admin link: party ${p.id} connected from ${addr} (${p.announced||p.label}, ${version||"?"})${old?", replacing its previous link":""}`);
   if(first)onLink({...p});
  },head=>{const id=resId(head);if(c&&id!=null)finish(c,id,new Err(503,BUSY));});
 }
 // The start of a line: a "res" for a request this connection still waits for may be as big as a socket reply.
 const resId=head=>{const m=/^\{"t":"res","id":(\d{1,15}),/.exec(head.toString("latin1"));return m?+m[1]:null;};
 const resFor=(c,head)=>{const id=resId(head);return id!=null&&c.pending.has(id);};
 function frame(c,m){
  if(!m||typeof m!=="object")return;
  if(m.t==="res"&&Number.isSafeInteger(m.id))return finish(c,m.id,null,m.body&&typeof m.body==="object"?m.body:{ok:false,error:"Réponse illisible de la partie."});
  if(m.t==="chunk"&&Number.isSafeInteger(m.id))return chunk(c,m);
  // pong, and anything else (an unknown frame is ignored): c.rx is all a frame does
 }
 function left(c){
  fail(c,new Err(502,DOWN));
  if(conns.get(c.id)!==c)return;
  conns.delete(c.id);
  const p=list.find(x=>x.id===c.id);if(p){p.lastSeen=c.rx;quiet();log(`admin link: party ${p.id} disconnected`);}
 }
 // Lines up to max(head) bytes (the newline aside; head: the line's first 64 bytes); a longer one cuts the connection
 // (tooLong). The bytes held by unfinished lines of every connection stay under budget: past it, the greediest goes.
 // A line past LINE_MAX (an answer to a waiting request) also books its bytes in bigHeld, from then until it is
 // parsed and handed over (the turn after each()): past big, that answer is refused (tooBig), the rest of its line
 // skipped without being kept, and the connection stays.
 const readers=new Set();let held=0,bigHeld=0;
 function lines(s,max,tooLong,each,tooBig=()=>{}){
  const r={size:0,cut:null,big:0,skip:false};let parts=[],head=Buffer.alloc(0);
  const reset=()=>{held-=r.size;r.size=0;parts=[];head=Buffer.alloc(0);};
  const unbook=()=>{bigHeld-=r.big;r.big=0;};
  r.cut=()=>{reset();unbook();s.destroy();};readers.add(r);
  s.on("close",()=>{reset();unbook();readers.delete(r);});
  s.on("data",d=>{
   while(d.length&&!s.destroyed){
    const i=d.indexOf(10),piece=i===-1?d:d.subarray(0,i);
    if(r.skip){if(i===-1)return;r.skip=false;d=d.subarray(i+1);continue;}
    if(head.length<64)head=Buffer.concat([head,piece.subarray(0,64-head.length)]);
    if(r.size+piece.length>max(head)){reset();unbook();return tooLong();}
    if(r.size+piece.length>LINE_MAX){
     const add=r.big?piece.length:r.size+piece.length;
     if(bigHeld+add>big){
      const h=head;reset();unbook();
      log(`admin link: ${Math.round(bigHeld/1048576)} MiB of big answers being handled: one more is refused`);tooBig(h);
      if(i===-1){r.skip=true;return;}
      d=d.subarray(i+1);continue;
     }
     bigHeld+=add;r.big+=add;
    }
    if(i===-1){
     parts.push(piece);r.size+=piece.length;held+=piece.length;
     if(held>budget){let top=r;for(const x of readers)if(x.size>top.size)top=x;log(`admin link: ${Math.round(held/1048576)} MiB of lines being read: the greediest connection is cut`);top.cut();}
     return;
    }
    const line=Buffer.concat([...parts,piece]).toString("utf8"),booked=r.big;reset();r.big=0;d=d.subarray(i+1);
    try{each(line);}finally{if(booked)setImmediate(()=>{bigHeld-=booked;});}
   }
  });
 }
 const beat=setInterval(()=>{
  const t=now();
  for(const c of conns.values()){if(t-c.rx>deadMs){log(`admin link: party ${c.id} silent for ${Math.round(deadMs/1000)} s: connection closed`);c.sock.destroy();}else c.sock.write('{"t":"ping"}\n');}
  for(const [a,b] of fails)if(b.reset<=t)fails.delete(a);
 },pingMs);beat.unref();

 // ------------------------------------------------------------------- management
 function issue(p){const token=newToken();p.tokenHash=tokenHash(token);return token;}
 return {
  cert:({create=false}={})=>getCert(create),
  list:()=>list.map(p=>({...p})),
  // Among the servers: bound once to a machine (a renewed token keeps its place until the party comes back).
  linked:()=>list.filter(p=>p.instance||p.firstSeen).map(p=>({...p})),
  live:id=>conns.has(id),
  runtime:id=>({...rt(id),rx:conns.get(id)?.rx??null}),
  listening:()=>!!server?.listening,
  // false, or why the parties cannot be changed (parties.json unreadable and set aside).
  broken:()=>{if(broken)try{writable();}catch{}return broken?BROKEN().message:false;},
  add(label){
   writable();
   const l=text(label,40);
   if(!l||[...String(label).trim()].length>40)throw new Err(400,"Nom de la partie : de 1 à 40 caractères.");
   if(list.length>=PARTIES_MAX)throw new Err(400,`${PARTIES_MAX} parties au plus.`);
   if(list.some(p=>fold(p.label)===fold(l)||(p.announced&&fold(p.announced)===fold(l))))throw new Err(409,`Une partie s'appelle déjà « ${l} ».`);
   let id;do id="p-"+crypto.randomBytes(4).toString("hex");while(list.some(p=>p.id===id)||taken(id));
   const p={id,label:l,tokenHash:"",instance:null,created:now(),announced:null,version:null,addr:null,firstSeen:null,lastSeen:null,refused:null};
   const token=issue(p);list.push(p);
   try{save();}catch(e){list.pop();throw e;}
   return {party:{...p},token};
  },
  // A new token: the old one stops at once (its link too), and the new one binds to the first machine that brings it.
  // The party stays among the servers (down) until then: the moderators' rights and its backups stay with it.
  renew(id){
   writable();
   const p=byId(id),before={...p},token=issue(p);
   Object.assign(p,{instance:null,refused:null});   // firstSeen stays: the page tells "new token" from "never connected"
   try{save();}catch(e){Object.assign(p,before);throw e;}
   drop(id);runtime.delete(id);
   return {party:{...p},token};
  },
  remove(id){
   writable();
   const p=byId(id),i=list.indexOf(p);list.splice(i,1);
   try{save();}catch(e){list.splice(i,0,p);throw e;}
   drop(id);runtime.delete(id);onLeave(id);
   return {...p};
  },
  // "Vu" on the Liaison alert.
  ack(id,instance){const p=list.find(x=>x.id===id);if(p?.refused&&(!instance||p.refused.instance===instance)){p.refused=null;quiet();return true;}return false;},
  // The console's own Liaison alerts (the owner's): an unreadable parties.json (as long as it is not dealt with), a
  // regenerated certificate (until "Vu", kept across restarts).
  alerts(){
   if(broken)try{writable();}catch{}
   certNew??=readFlag()??false;
   const out=[];
   if(broken)out.push({key:`link-file:${broken.t}`,kind:"link",t:broken.t,ref:null,ids:[],noAck:true,title:"Liste des parties illisible",
    detail:`/data-admin/parties.json était illisible (${broken.error}) : mise de côté sous ${broken.name}. Aucune partie réseau ne peut se connecter, et ajouter, renouveler ou retirer une partie est refusé tant qu'elle n'est pas réparée (renommée parties.json) ou supprimée.`});
   if(certNew)out.push({key:`link-cert:${shortFp(certNew.fingerprint)}`,kind:"link",t:certNew.t,ref:null,ids:[],
    title:"Certificat de liaison régénéré : chaque partie doit recevoir la nouvelle empreinte (POLITIGO_ADMIN_TLS)",
    detail:`Nouvelle empreinte : ${certNew.fingerprint}. Recopie-la dans POLITIGO_ADMIN_TLS de chaque partie (page Parties), puis redéploie-la.`});
   return out;
  },
  ackCert(key){
   certNew??=readFlag()??false;
   if(!certNew||key!==`link-cert:${shortFp(certNew.fingerprint)}`)return false;
   certNew=false;try{fs.unlinkSync(certFlag);}catch{}return true;
  },
  request,
  listen(port,host){
   getCert(true);
   server=tls.createServer({key:cert.key,cert:cert.cert,minVersion:"TLSv1.3",handshakeTimeout:helloMs},onSocket);
   server.on("connection",onRaw);
   server.on("tlsClientError",(e,s)=>s.destroy());
   server.maxConnections=PARTIES_MAX+UNAUTH_MAX+10;
   return new Promise((ok,ko)=>{server.once("error",ko);server.listen(port,host,()=>{server.off("error",ko);server.on("error",e=>warn(`admin link: ${e.message}`));ok(server.address());});});
  },
  close(){closing=true;clearInterval(beat);server?.close();for(const id of [...conns.keys()])drop(id);for(const f of [...raw.values()]){f();f.sock.destroy();}},
 };
}
