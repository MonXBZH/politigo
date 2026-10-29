// PolitiGo game server: accounts, the authoritative game clock, the leaderboard and the live feed.
// No dependency outside Node itself (node:http, node:sqlite, node:crypto).
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import {promisify} from "node:util";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,writeFileSync,lstatSync,unlinkSync,chmodSync} from "node:fs";
import {dirname,join} from "node:path";
import * as R from "./rules.mjs";

const env=process.env;
const PORT=Number(env.PORT||3000);
// Baked into the image from git describe; anything that is not a plain version string is shown as "dev".
const VERSION=/^[0-9A-Za-z._+-]{1,40}$/.test(env.POLITIGO_VERSION||"")?env.POLITIGO_VERSION:"dev";
const DB_PATH=env.DB_PATH||"/data/politigo.db";
// Invite code: POLITIGO_INVITE, "off" to close registrations, or unset for a code generated once and kept next to
// the database (same code across restarts and image updates; delete the file and restart for a new one).
const INVITE_FILE=join(dirname(DB_PATH),"invite.txt");
let INVITE=(env.POLITIGO_INVITE||"").trim(),INVITE_GENERATED=false;
if(INVITE.toLowerCase()==="off")INVITE="";
else if(INVITE){
 // A short or example invite code would open the game to anyone who reads the repository: refuse to start.
 if(INVITE.length<16||INVITE==="change-moi-en-un-code-long"){
  console.error("POLITIGO_INVITE is too weak: use at least 16 random characters (and not the example value).");process.exit(1);
 }
}else{
 try{INVITE=readFileSync(INVITE_FILE,"utf8").trim();}catch(e){if(e.code!=="ENOENT")console.error(`${INVITE_FILE}: ${e.message}`);}
 if(INVITE.length<16){
  INVITE="politigo-"+crypto.randomBytes(12).toString("base64url");
  // An unwritable volume must not take the game down: the code then just changes at every start (and says so).
  try{writeFileSync(INVITE_FILE,INVITE+"\n",{mode:0o600});}
  catch(e){console.error(`Invite code NOT saved (${e.message}): it will change at the next start. Set POLITIGO_INVITE to keep one.`);}
 }
 INVITE_GENERATED=true;
}
const SPEED=Math.max(1,Math.min(3600,Number(env.POLITIGO_SPEED)||1));   // >1 only on a test server
const COOKIE_SECURE=env.COOKIE_SECURE!=="0";
// Proxies in front of us that append to X-Forwarded-For: the site's reverse proxy + this stack's nginx.
const PROXY_HOPS=Math.max(0,Number(env.PROXY_HOPS??2));
const SWEEP_MS=Number(env.SWEEP_MS||30000);
const MAX_PLAYERS=Math.max(1,Number(env.MAX_PLAYERS)||50);   // a leaked invite code cannot flood the database
const SESSION_DAYS=90,BODY_LIMIT=4096,FEED_KEEP=200,SESSIONS_PER_PLAYER=10,SSE_PER_PLAYER=3,SSE_TOTAL=300;
// The __Host- prefix makes the browser refuse the cookie unless it is Secure, host-only and Path=/.
const COOKIE=COOKIE_SECURE?"__Host-pg_session":"pg_session";
R.setTimeZone(env.POLITIGO_TZ||"Europe/Paris");

// ===================================================================== STORAGE
// A short wait rather than an immediate "database is locked" when another process (a backup, a maintenance
// command) holds the file for a moment.
const db=new DatabaseSync(DB_PATH,{timeout:5000});
db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,pass TEXT NOT NULL,
 created INTEGER NOT NULL,state TEXT NOT NULL,score INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,seen_version TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feed(id INTEGER PRIMARY KEY,t INTEGER NOT NULL,player TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL);`);
// Databases from before the changelog lack the column: NULL means "has read nothing yet".
// Another process starting on the same file at the same moment may have added it first: that is fine too.
if(!db.prepare("PRAGMA table_info(players)").all().some(c=>c.name==="seen_version")){
 try{db.exec("ALTER TABLE players ADD COLUMN seen_version TEXT");}catch(e){if(!/duplicate column/i.test(e.message))throw e;}
}
const RELEASE=R.releaseOf(VERSION);   // "1.3.0" for v1.3.0-3-gabc1234, null on a dev server
const q={
 insertPlayer:db.prepare("INSERT INTO players(name,name_key,pass,created,state,score,updated,seen_version) VALUES(?,?,?,?,?,?,?,?)"),
 savePlayer:db.prepare("UPDATE players SET state=?,score=?,updated=? WHERE id=?"),
 playerByKey:db.prepare("SELECT id,pass FROM players WHERE name_key=?"),
 deletePlayer:db.prepare("DELETE FROM players WHERE id=?"),
 allPlayers:db.prepare("SELECT id,name,state,seen_version FROM players"),
 insertSession:db.prepare("INSERT INTO sessions(token_hash,player_id,expires) VALUES(?,?,?)"),
 session:db.prepare("SELECT player_id FROM sessions WHERE token_hash=? AND expires>?"),
 deleteSession:db.prepare("DELETE FROM sessions WHERE token_hash=?"),
 purgeSessions:db.prepare("DELETE FROM sessions WHERE expires<=?"),
 trimSessions:db.prepare("DELETE FROM sessions WHERE player_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE player_id=? ORDER BY expires DESC LIMIT ?)"),
 countPlayers:db.prepare("SELECT COUNT(*) AS n FROM players"),
 setSeen:db.prepare("UPDATE players SET seen_version=? WHERE id=?"),
 setKey:db.prepare("UPDATE players SET name_key=? WHERE id=?"),
 setPass:db.prepare("UPDATE players SET pass=? WHERE id=?"),
 deleteSessionsOf:db.prepare("DELETE FROM sessions WHERE player_id=?"),
 listPlayers:db.prepare("SELECT name,created,updated FROM players ORDER BY name_key"),
 insertFeed:db.prepare("INSERT INTO feed(t,player,kind,text) VALUES(?,?,?,?)"),
 recentFeed:db.prepare("SELECT t,player,kind,text FROM feed ORDER BY id DESC LIMIT ?"),
 trimFeed:db.prepare("DELETE FROM feed WHERE id<=(SELECT id FROM feed ORDER BY id DESC LIMIT 1 OFFSET ?)"),
};

// Players live in memory (a group of friends, not a nation); every change is written through.
// After a downtime every clock is put back on the real hour, skipping (not playing) the time the server was
// off: day and night stay true, and nobody's companion dies or even gets hungry because of a maintenance.
const players=new Map();
// The host clock is checked against the last save before any game clock moves: a container started before its
// time sync must neither throw every game into the future nor, once corrected, replay hours (and kill).
// Refusing to start is safe: the container is restarted until the clock is right, and no game is touched.
{
 const newest=Number(db.prepare("SELECT MAX(updated) AS t FROM players").get().t)||0,off=newest?Date.now()-newest:0;
 if(env.POLITIGO_TRUST_CLOCK!=="1"&&(off<-5*60e3||off>366*864e5)){
  console.error(`Host clock looks wrong: it says ${new Date().toISOString()}, the last save was at ${new Date(newest).toISOString()}. `+
   "Not starting, so that no game clock is damaged. Fix the server's time sync (or set POLITIGO_TRUST_CLOCK=1 if this date is right).");
  process.exit(1);
 }
}
{
 const now=Date.now();let resynced=0,longest=0;
 for(const row of q.allPlayers.all()){
  let state=null,why="",camp="left";
  try{const raw=JSON.parse(row.state);if(R.CAMPS.includes(raw?.camp))camp=raw.camp;state=R.sanitize(raw,now);}catch(e){why=e.message;}
  if(!state){
   // The unreadable row is kept aside before the fresh game overwrites it, so a bug never silently erases a game.
   const backup=join(dirname(DB_PATH),`state-${row.id}-${now}.bad.json`);
   try{writeFileSync(backup,row.state,{mode:0o600});}catch{}
   console.error(`player ${row.id}: unreadable state (${why||"rejected"}), saved to ${backup}, restarting their game`);
   state=R.newGame(camp,now);
  }
  try{
   const skipped=R.resync(state,now);if(skipped>0){resynced++;longest=Math.max(longest,skipped);}
   if(skipped>7*864e5)console.log(`player ${row.id}: ${Math.round(skipped/864e5)} days skipped`);
   // Ahead of real time on a real-time server: left as is (no replay), but said, since it should not happen.
   if(SPEED===1&&state.vclock-now>10*60e3)console.error(`player ${row.id}: game clock ${Math.round((state.vclock-now)/60e3)} min ahead of real time`);
  }catch(e){console.error(`player ${row.id}: clock not resynced`,e);state.lastReal=now;}
  players.set(row.id,{id:row.id,name:row.name,state,seen:row.seen_version??null});
 }
 if(longest>=60000)console.log(`Clocks back on the real hour: ${resynced} player(s), up to ${Math.round(longest/60000)} min skipped, gauges untouched.`);
}
function persist(p){q.savePlayer.run(JSON.stringify(p.state),R.score(p.state),Date.now(),p.id);p.saved=Date.now();}
// A change runs on a copy and only replaces the live state once it is written: a failed write (full disk)
// leaves memory and database in step, and the player simply sees an error. The clock merely moving on
// (no new hour, nothing logged) stays in memory, and is written at least every few minutes.
const SAVE_EVERY=5*60*1000;
function update(p,fn){
 const before=p.state,jn=before.jn;p.state=structuredClone(before);
 let out;
 try{
  out=fn(p.state);
  if(out===false&&p.state.jn===jn){if(Date.now()-(p.saved||0)>SAVE_EVERY)persist(p);return out;}
  persist(p);
 }catch(e){p.state=before;throw e;}
 try{const feed=newFeedEntries(p,jn);if(feed.length)broadcast("feed",feed);pushMe(p);publishBoard();}
 catch(e){console.error(`player ${p.id}: announce failed`,e);}
 return out;
}

// ===================================================================== SECURITY HELPERS
const sha256=s=>crypto.createHash("sha256").update(s).digest("hex");
const SCRYPT={N:1<<15,r:8,p:1,maxmem:64*1024*1024};
// Asynchronous scrypt: a login (~100 ms of hashing) never freezes the game clock or the live streams.
const scryptRaw=promisify(crypto.scrypt);
// Each hash takes 32 MB: a burst of logins from many addresses is turned away instead of exhausting memory.
let hashing=0;
async function scrypt(...args){
 if(hashing>=16)throw new HttpError(503,"Serveur occupé, réessaie dans un instant.");
 hashing++;try{return await scryptRaw(...args);}finally{hashing--;}
}
async function hashPassword(pw){
 const salt=crypto.randomBytes(16);
 return `scrypt$${salt.toString("base64")}$${(await scrypt(pw,salt,64,SCRYPT)).toString("base64")}`;
}
const DUMMY_HASH=await hashPassword("timing-equaliser");
async function checkPassword(pw,stored){
 const [kind,salt,hash]=String(stored).split("$");
 if(kind!=="scrypt"||!salt||!hash)return false;
 const got=await scrypt(pw,Buffer.from(salt,"base64"),64,SCRYPT),want=Buffer.from(hash,"base64");
 return got.length===want.length&&crypto.timingSafeEqual(got,want);
}
const sameSecret=(a,b)=>crypto.timingSafeEqual(Buffer.from(sha256(a)),Buffer.from(sha256(b)));
// Names: 3 to 20 Latin letters (accents welcome), digits, spaces, dots, dashes or underscores; starts and ends
// with a letter or digit. Latin only, so that a Cyrillic "о" cannot pass for an "o" on the leaderboard.
const NAME_RE=/^[\p{Script=Latin}\p{Nd}][\p{Script=Latin}\p{Nd} ._-]{1,18}[\p{Script=Latin}\p{Nd}]$/u;
const cleanName=n=>typeof n==="string"?n.normalize("NFC").trim().replace(/\s+/g," "):"";
// The uniqueness key ignores case and accents: "Chloé" and "chloe" are the same player.
const nameKey=n=>n.normalize("NFKD").replace(/\p{M}/gu,"").toLocaleLowerCase("fr");
// Keys written by an older version are brought up to date (a clash keeps the older key).
for(const p of players.values()){try{q.setKey.run(nameKey(p.name),p.id);}catch(e){console.error(`player ${p.id}: name key not updated (${e.message})`);}}

// The client address is the entry the site's reverse proxy appended (spoofed entries sit before it).
// A shorter chain than expected means a proxy was skipped: fall back to the socket, never to a client-written entry.
function clientIp(req){
 const parts=String(req.headers["x-forwarded-for"]||"").split(",").map(s=>s.trim()).filter(Boolean);
 return (PROXY_HOPS&&parts.length>=PROXY_HOPS?parts[parts.length-PROXY_HOPS]:null)||req.socket.remoteAddress||"?";
}
const buckets=new Map();
function limited(key,max,windowMs){
 const now=Date.now();let b=buckets.get(key);
 if(!b||b.reset<=now){b={count:0,reset:now+windowMs};buckets.set(key,b);}
 return ++b.count>max;
}
setInterval(()=>{const now=Date.now();for(const [k,b] of buckets)if(b.reset<=now)buckets.delete(k);q.purgeSessions.run(now);},10*60*1000).unref();

// ===================================================================== HTTP PLUMBING
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function send(res,status,body,headers={}){
 const data=JSON.stringify(body);
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers});
 res.end(data);
}
// Cross-site requests are refused twice over: SameSite=Lax cookies, and POSTs must be JSON from our own origin.
async function readJson(req){
 if(!String(req.headers["content-type"]||"").startsWith("application/json"))throw new HttpError(415,"JSON attendu.");
 // The Origin must name this site. A proxy that forwards Host without its port (nginx's $host) is accepted
 // as long as the host name itself matches.
 const origin=req.headers.origin;
 if(origin){
  let o=null;try{o=new URL(origin);}catch{}
  const host=String(req.headers.host||"");
  if(!o||!(o.host===host||(!host.includes(":")&&o.hostname===host)))throw new HttpError(403,"Origine refusée.");
 }
 let size=0;const chunks=[];
 for await(const c of req){size+=c.length;if(size>BODY_LIMIT)throw new HttpError(413,"Requête trop grosse.");chunks.push(c);}
 try{const v=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");if(!v||typeof v!=="object"||Array.isArray(v))throw 0;return v;}
 catch{throw new HttpError(400,"JSON invalide.");}
}
function cookies(req){
 const out={};for(const part of String(req.headers.cookie||"").split(";")){const i=part.indexOf("=");if(i>0)out[part.slice(0,i).trim()]=part.slice(i+1).trim();}return out;
}
function sessionCookie(token,maxAge){
 return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE?"; Secure":""}`;
}
function startSession(playerId){
 const token=crypto.randomBytes(32).toString("base64url");
 q.insertSession.run(sha256(token),playerId,Date.now()+SESSION_DAYS*864e5);
 q.trimSessions.run(playerId,playerId,SESSIONS_PER_PLAYER);          // the oldest devices are signed out
 return sessionCookie(token,SESSION_DAYS*86400);
}
function auth(req){
 const token=cookies(req)[COOKIE];
 const row=token&&q.session.get(sha256(token),Date.now());
 const p=row&&players.get(row.player_id);
 if(!p)throw new HttpError(401,"Connexion requise.");
 return p;
}

// ===================================================================== GAME: TICKS, FEED, LEADERBOARD
const FEED_KINDS=new Set(["new","evolve","legend","death","stress","pong","mini"]);
function newFeedEntries(p,jnBefore){
 const fresh=p.state.journal.filter(j=>j.n>jnBefore&&FEED_KINDS.has(j.k)&&(j.k!=="pong"||j.d?.score>=8)&&(j.k!=="mini"||j.d?.great===true)).reverse();
 const out=[];
 for(const j of fresh){const e={t:Date.now(),player:p.name,kind:j.k,text:j.text};q.insertFeed.run(e.t,e.player,e.kind,e.text);out.push(e);}
 if(out.length)q.trimFeed.run(FEED_KEEP);
 return out;
}
function boardRows(){
 return [...players.values()].map(p=>{const S=p.state;return {
  name:p.name,camp:S.camp,candidate:R.person(S).name,lvl:S.lvl,score:R.score(S),form:S.form,
  streak:S.streak,bestStreak:S.bestStreak,deaths:S.deaths,asleep:R.isAsleep(S)};})
 .sort((a,b)=>b.score-a.score||b.lvl-a.lvl||a.name.localeCompare(b.name,"fr"));
}
const clients=new Set();         // live SSE connections: {res, playerId}
let lastBoard="";
// A stream that broke or was ended is skipped: one dead socket never takes the server down.
function sse(res,event,data){
 if(res.writableEnded||res.destroyed)return;
 try{res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch{res.destroy();}
}
function closeStream(c){clearInterval(c.ping);clients.delete(c);if(!c.res.writableEnded)c.res.end();}
function broadcast(event,data){for(const c of clients)sse(c.res,event,data);}
function pushMe(p){const data=mePayload(p);for(const c of clients)if(c.playerId===p.id)sse(c.res,"me",data);}
function publishBoard(force=false){
 const rows=boardRows(),json=JSON.stringify(rows);
 if(force||json!==lastBoard){lastBoard=json;broadcast("board",rows);}
}
function mePayload(p){return {name:p.name,state:p.state,speed:SPEED,tz:R.timeZone(),serverNow:Date.now(),version:VERSION,release:RELEASE,seenVersion:p.seen??null};}
// The clock runs for everyone, connected or not: needs drain and deaths happen while the page is closed.
setInterval(()=>{
 const now=Date.now();
 for(const p of players.values()){
  // One broken player (or a full disk) is logged and skipped; it must not stop everyone else's clock.
  try{update(p,S=>R.advance(S,now,SPEED,Math.random));}
  catch(e){console.error(`sweep, player ${p.id}:`,e);}
 }
 lastSweep=now;
},SWEEP_MS).unref();
let lastSweep=Date.now();

// ===================================================================== ROUTES
async function route(req,res){
 // Only the path matters, and an odd request target ("//", "//host") is just not found, never a 500.
 let path="";try{path=new URL(req.url,"http://x").pathname;}catch{}
 const method=req.method;
 // Healthy means the database answers and the game clock still ticks, not merely that the process is up.
 if(path==="/api/health"&&method==="GET"){
  db.prepare("SELECT 1").get();
  if(Date.now()-lastSweep>Math.max(SWEEP_MS*4,60000))throw new HttpError(503,"Horloge du jeu arrêtée.");
  return send(res,200,{ok:true});
 }

 if(path==="/api/register"&&method==="POST"){
  const ip=clientIp(req);if(limited("reg:"+ip,5,3600e3))throw new HttpError(429,"Trop d'inscriptions depuis cette adresse, réessaie plus tard.");
  const b=await readJson(req);
  if(!INVITE)throw new HttpError(403,"Les inscriptions sont fermées.");
  if(typeof b.invite!=="string"||!sameSecret(b.invite.trim(),INVITE))throw new HttpError(403,"Code d'invitation incorrect.");
  const name=cleanName(b.name);
  if(!NAME_RE.test(name))throw new HttpError(400,"Pseudo : 3 à 20 caractères (lettres, chiffres, espace, . _ -).");
  if(typeof b.password!=="string"||b.password.length<8||b.password.length>200)throw new HttpError(400,"Mot de passe : 8 caractères minimum.");
  if(!R.CAMPS.includes(b.camp))throw new HttpError(400,"Choisis une collection.");
  if(q.countPlayers.get().n>=MAX_PLAYERS)throw new HttpError(403,"La partie est complète.");
  if(q.playerByKey.get(nameKey(name)))throw new HttpError(409,"Ce pseudo est déjà pris.");
  const pass=await hashPassword(b.password);
  // Checked again after the hashing pause: of two sign-ups racing for one name (or the last seat), the second loses.
  if(q.playerByKey.get(nameKey(name)))throw new HttpError(409,"Ce pseudo est déjà pris.");
  if(q.countPlayers.get().n>=MAX_PLAYERS)throw new HttpError(403,"La partie est complète.");
  const now=Date.now(),state=R.newGame(b.camp,now);
  const {lastInsertRowid}=q.insertPlayer.run(name,nameKey(name),pass,now,JSON.stringify(state),R.score(state),now,RELEASE);
  const p={id:Number(lastInsertRowid),name,state,seen:RELEASE};players.set(p.id,p);   // a new player has nothing to catch up on
  // The account exists from here on: a failed announcement must not turn the sign-up into an error.
  try{const feed=newFeedEntries(p,0);if(feed.length)broadcast("feed",feed);publishBoard();}catch(e){console.error("register: announce failed",e);}
  return send(res,201,mePayload(p),{"Set-Cookie":startSession(p.id)});
 }
 if(path==="/api/login"&&method==="POST"){
  const ip=clientIp(req);const b=await readJson(req);
  const name=cleanName(b.name).slice(0,40),key=nameKey(name);   // bounded: the name is part of rate-limit keys
  // Per address, per address+name, and a looser per-name cap against guessing from many addresses:
  // a stranger can no longer lock a friend out with ten wrong passwords.
  if(limited("login:"+ip,10,900e3)||limited("login-ipname:"+ip+"|"+key,5,900e3)||limited("login-name:"+key,50,900e3))
   throw new HttpError(429,"Trop de tentatives, réessaie dans un quart d'heure.");
  const row=q.playerByKey.get(key),pw=typeof b.password==="string"?b.password.slice(0,200):"";
  const okPw=await checkPassword(pw,row?row.pass:DUMMY_HASH);   // same cost whether the name exists or not
  // A password reset that landed during the hashing pause wins: the old password no longer opens a session.
  const p=row&&players.get(row.id);
  if(!p||!okPw||q.playerByKey.get(key)?.pass!==row.pass)throw new HttpError(401,"Pseudo ou mot de passe incorrect.");
  return send(res,200,mePayload(p),{"Set-Cookie":startSession(p.id)});
 }
 if(path==="/api/logout"&&method==="POST"){
  await readJson(req);const token=cookies(req)[COOKIE];if(token)q.deleteSession.run(sha256(token));
  return send(res,200,{ok:true},{"Set-Cookie":sessionCookie("",0)});
 }
 if(path==="/api/me"&&method==="GET"){
  const p=auth(req);
  update(p,S=>R.advance(S,Date.now(),SPEED,Math.random));
  return send(res,200,mePayload(p));
 }
 // The client never chooses the version: it only says "I read it", and the server records its own release.
 if(path==="/api/changelog/seen"&&method==="POST"){
  const p=auth(req);if(limited("seen:"+p.id,20,600e3))throw new HttpError(429,"Doucement : réessaie dans un instant.");
  await readJson(req);
  if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");   // deleted while the body was arriving
  if(RELEASE){q.setSeen.run(RELEASE,p.id);p.seen=RELEASE;}
  return send(res,200,{ok:true,seenVersion:p.seen??null});
 }
 if(path==="/api/action"&&method==="POST"){
  const p=auth(req);if(limited("act:"+p.id,40,10e3))throw new HttpError(429,"Doucement : trop d'actions d'un coup.");
  const b=await readJson(req);
  if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");   // deleted while the body was arriving
  const r=update(p,S=>R.act(S,b,{now:Date.now(),speed:SPEED,random:Math.random}));
  return send(res,r.ok?200:422,{...r,me:mePayload(p)});
 }
 if(path==="/api/board"&&method==="GET"){
  auth(req);return send(res,200,{board:boardRows(),feed:q.recentFeed.all(40)});
 }
 if(path==="/api/account"&&method==="DELETE"){
  const p=auth(req);
  if(limited("del:"+p.id,5,900e3))throw new HttpError(429,"Trop de tentatives, réessaie dans un quart d'heure.");
  const b=await readJson(req);
  const row=q.playerByKey.get(nameKey(p.name));
  if(!row||!await checkPassword(typeof b.password==="string"?b.password.slice(0,200):"",row.pass))throw new HttpError(401,"Mot de passe incorrect.");
  q.deletePlayer.run(p.id);players.delete(p.id);
  for(const c of [...clients])if(c.playerId===p.id)closeStream(c);
  publishBoard();
  return send(res,200,{ok:true},{"Set-Cookie":sessionCookie("",0)});
 }
 if(path==="/events"&&method==="GET"){
  const p=auth(req);
  if(clients.size>=SSE_TOTAL)throw new HttpError(503,"Serveur plein, réessaie dans un instant.");
  // A few tabs or devices per player; one more pushes out that player's oldest stream, which is told to stay
  // closed (a plain end would make the browser reconnect and push out the next one, forever).
  const mine=[...clients].filter(c=>c.playerId===p.id);
  if(mine.length>=SSE_PER_PLAYER){sse(mine[0].res,"bye",0);closeStream(mine[0]);}
  res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-store","X-Accel-Buffering":"no"});
  res.on("error",()=>{});
  res.write("retry: 5000\n\n");
  const c={res,playerId:p.id,ping:null};clients.add(c);
  sse(res,"me",mePayload(p));sse(res,"board",boardRows());sse(res,"feedInit",q.recentFeed.all(40));   // newest first
  c.ping=setInterval(()=>sse(res,"ping",0),25000);
  req.on("close",()=>closeStream(c));
  return;
 }
 throw new HttpError(404,"Introuvable.");
}

const server=http.createServer((req,res)=>{
 route(req,res).catch(e=>{
  if(!(e instanceof HttpError))console.error(e);
  if(!res.headersSent)send(res,e instanceof HttpError?e.status:500,{ok:false,error:e instanceof HttpError?e.message:"Erreur interne."});
  else res.end();
 });
});
server.headersTimeout=15000;server.requestTimeout=15000;

// ===================================================================== ADMIN SOCKET
// In-container administration (node admin.mjs ...): a Unix socket, never a network port, so only someone who can
// already run a command inside this container (docker exec, the Portainer console) reaches it. Mode 0600 keeps it
// to the "node" user and root. The server does the work itself: no second writer on the database, no restart.
const ADMIN_SOCKET=env.POLITIGO_ADMIN_SOCKET==="off"?"":(env.POLITIGO_ADMIN_SOCKET||"/tmp/politigo-admin.sock");
const ADMIN_LIMIT=4096,ADMIN_TIMEOUT=5000;
// Forgets the login counters a name has run into: the name itself, each address+name pair, and the addresses
// that tried it (an address also locked out by other names is merely given a fresh quarter of an hour).
function unlockName(key){
 let n=0;const ips=new Set();
 for(const k of [...buckets.keys()]){
  if(k==="login-name:"+key){buckets.delete(k);n++;}
  else if(k.startsWith("login-ipname:")&&k.endsWith("|"+key)){ips.add(k.slice(13,-key.length-1));buckets.delete(k);n++;}
 }
 for(const ip of ips)if(buckets.delete("login:"+ip))n++;
 return n;
}
// Found the way a login finds it: case and accents do not matter.
function adminPlayer(name){
 const row=typeof name==="string"&&q.playerByKey.get(nameKey(cleanName(name).slice(0,40)));
 const p=row&&players.get(row.id);
 if(!p)throw new HttpError(404,`Joueur introuvable : ${typeof name==="string"?cleanName(name).slice(0,40):"?"}`);
 return p;
}
async function adminCommand(b){
 if(b.cmd==="list")return {players:q.listPlayers.all()};
 if(b.cmd==="unlock"){
  const p=adminPlayer(b.name),cleared=unlockName(nameKey(p.name));
  console.log(`admin: login counters cleared for player ${p.id}`);
  return {name:p.name,cleared};
 }
 if(b.cmd==="reset-password"){
  const p=adminPlayer(b.name);
  if(typeof b.password!=="string"||b.password.length<8||b.password.length>200)throw new HttpError(400,"Mot de passe : 8 à 200 caractères.");
  const pass=await hashPassword(b.password);
  if(!players.has(p.id))throw new HttpError(404,"Ce joueur a supprimé son compte entre-temps.");
  // Every device is signed out: whoever knew the old password (or held a session) is out as well.
  db.exec("BEGIN");
  try{q.setPass.run(pass,p.id);q.deleteSessionsOf.run(p.id);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}
  for(const c of [...clients])if(c.playerId===p.id)closeStream(c);
  const cleared=unlockName(nameKey(p.name));
  console.log(`admin: password reset for player ${p.id}, sessions revoked`);
  return {name:p.name,cleared};
 }
 throw new HttpError(400,"Commande inconnue.");
}
let admin=null;
function startAdmin(){
 if(!ADMIN_SOCKET)return;
 // A socket left by a crash is replaced; anything else at that path is someone else's file and is not touched.
 try{
  let st=null;try{st=lstatSync(ADMIN_SOCKET);}catch(e){if(e.code!=="ENOENT")throw e;}
  if(st&&!st.isSocket())throw new Error(`${ADMIN_SOCKET} exists and is not a socket, left untouched`);
  if(st)unlinkSync(ADMIN_SOCKET);
 }catch(e){console.error(`admin socket disabled: ${e.message}`);return;}
 // Half-open: a client that sends its line then closes its side (echo ... | nc -U) still gets the answer.
 admin=net.createServer({allowHalfOpen:true},sock=>{
  // One small JSON line in, one line out, within a few seconds: a stuck or chatty client is simply cut off.
  sock.setEncoding("utf8");sock.setTimeout(ADMIN_TIMEOUT,()=>sock.destroy());sock.on("error",()=>{});
  let buf="",started=false,done=false;
  const reply=o=>{if(!done){done=true;sock.end(JSON.stringify(o)+"\n");}};
  sock.on("end",()=>{if(!started)reply({ok:false,error:"Requête incomplète."});});
  sock.on("data",d=>{
   // Bytes arriving while the command runs are ignored: one line runs one command, once.
   if(started||done)return;
   buf+=d;
   const i=buf.indexOf("\n");
   if(i<0?buf.length>ADMIN_LIMIT:i>ADMIN_LIMIT)return reply({ok:false,error:"Requête trop grosse."});
   if(i<0)return;
   started=true;
   let b=null;try{b=JSON.parse(buf.slice(0,i));}catch{}
   if(!b||typeof b!=="object"||Array.isArray(b))return reply({ok:false,error:"JSON invalide."});
   adminCommand(b).then(r=>reply({ok:true,...r}),e=>{
    if(!(e instanceof HttpError))console.error("admin:",e);
    reply({ok:false,error:e instanceof HttpError?e.message:"Erreur interne."});
   });
  });
 });
 admin.maxConnections=4;
 // Created 0600 from the start (no window where it is world-writable), then the usual mask is put back.
 const mask=process.umask(0o177);
 admin.on("error",e=>{process.umask(mask);console.error(`admin socket disabled: ${e.message}`);admin=null;});
 admin.listen(ADMIN_SOCKET,()=>{process.umask(mask);try{chmodSync(ADMIN_SOCKET,0o600);}catch{}});
}
function stopAdmin(){if(!admin)return;try{admin.close();}catch{}try{unlinkSync(ADMIN_SOCKET);}catch{}admin=null;}
startAdmin();
// Logged on every start, so log rotation never loses it.
if(INVITE_GENERATED)console.log(`Invite code: ${INVITE} (generated, kept in ${INVITE_FILE}; delete that file and restart for a new one)`);
server.listen(PORT,()=>console.log(`PolitiGo API ${VERSION} on :${PORT} (speed x${SPEED}, ${players.size} players, registrations ${INVITE?"open with invite":"closed"})`));
// A bug that escapes every handler is logged with its stack, then the container restarts the process cleanly.
// Every clock is written as it stands before leaving, so a restart never sets anyone's game time back.
function saveAll(){for(const p of players.values()){try{persist(p);}catch(e){console.error(`saving player ${p.id}:`,e);}}}
for(const ev of ["unhandledRejection","uncaughtException"])process.on(ev,e=>{console.error(`${ev}:`,e);saveAll();stopAdmin();try{db.close();}catch{}process.exit(1);});
function shutdown(code){try{db.close();}catch(e){console.error("closing the database:",e);}process.exit(code);}
for(const sig of ["SIGTERM","SIGINT"])process.on(sig,()=>{
 stopAdmin();
 for(const c of [...clients])closeStream(c);
 saveAll();
 server.close(()=>shutdown(0));
 setTimeout(()=>{console.error("shutdown: connections still open after 3 s, forcing exit");shutdown(0);},3000).unref();
});
