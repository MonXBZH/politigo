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
import * as P from "./push.mjs";

const env=process.env;
process.umask(0o077);
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
// Duel eligibility. The two knobs exist for tests (fresh level-1 accounts) and can only LOWER the rules' values.
const knob=(v,def)=>{const n=Number(v);return v!==undefined&&v!==""&&Number.isFinite(n)&&n>=0?Math.min(def,n):def;};
const DUEL_MIN_LEVEL=knob(env.POLITIGO_DUEL_MIN_LEVEL,R.DUEL.minLevel),DUEL_MIN_AGE=knob(env.POLITIGO_DUEL_MIN_AGE_H,R.DUEL.minAgeMs/R.H)*R.H;
// Said at every start: a test setting left on a real server opens duels to fresh accounts (and to alts).
if(DUEL_MIN_LEVEL!==R.DUEL.minLevel||DUEL_MIN_AGE!==R.DUEL.minAgeMs)console.warn(`Duel test settings active: level ${DUEL_MIN_LEVEL}+, accounts ${DUEL_MIN_AGE/R.H} h old+ (normal: ${R.DUEL.minLevel}, ${R.DUEL.minAgeMs/R.H} h).`);
// A turn is void past the debate, its countdown and the same grace as the solo mini-games.
const DUEL_TURN_MS=R.MINI.debate.ms+R.DEBATE.intro+R.MINI_RULES.graceSeconds*1000;
// Web Push: on unless POLITIGO_PUSH=off. The contact goes into every VAPID token, so a push service can reach the admin.
const PUSH_ON=env.POLITIGO_PUSH!=="off",PUSH_DEFAULT_CONTACT="https://github.com/MonXBZH/politigo";
let PUSH_CONTACT=(env.POLITIGO_PUSH_CONTACT||"").trim()||PUSH_DEFAULT_CONTACT;
if(!/^(mailto:|https:\/\/)[^\s]{3,200}$/.test(PUSH_CONTACT)){console.error("POLITIGO_PUSH_CONTACT must be a mailto: or https:// URL: using the default.");PUSH_CONTACT=PUSH_DEFAULT_CONTACT;}

// ===================================================================== STORAGE
// A short wait rather than an immediate "database is locked" when another process (a backup, a maintenance
// command) holds the file for a moment.
const db=new DatabaseSync(DB_PATH,{timeout:5000});
// A database created by an older version (before the umask) is made private too; another owner's file is left alone.
for(const f of [DB_PATH,DB_PATH+"-wal",DB_PATH+"-shm"]){try{chmodSync(f,0o600);}catch{}}
db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,pass TEXT NOT NULL,
 created INTEGER NOT NULL,state TEXT NOT NULL,score INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,seen_version TEXT);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feed(id INTEGER PRIMARY KEY,t INTEGER NOT NULL,player TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS duels(id INTEGER PRIMARY KEY,game TEXT NOT NULL,
 challenger INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,defender INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 seed INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,c_started INTEGER,c_score INTEGER,d_started INTEGER,d_score INTEGER,
 expires INTEGER,resolved INTEGER,winner INTEGER,paid INTEGER NOT NULL DEFAULT 0,sday INTEGER,rday INTEGER);
CREATE INDEX IF NOT EXISTS duels_challenger ON duels(challenger);
CREATE INDEX IF NOT EXISTS duels_defender ON duels(defender);
CREATE INDEX IF NOT EXISTS duels_status ON duels(status);
CREATE TABLE IF NOT EXISTS push_subs(id INTEGER PRIMARY KEY,player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_subs_player ON push_subs(player_id);`);
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
 allPlayers:db.prepare("SELECT id,name,created,state,seen_version FROM players"),
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
 insertDuel:db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,c_started,sday) VALUES(?,?,?,?,'c_play',?,?,?)"),
 duel:db.prepare("SELECT * FROM duels WHERE id=?"),
 // Open ones first, then the newest: the list never hides a duel waiting for an answer. The defender only hears of
 // a duel once the challenger has a score (one still being played, or voided, was never sent).
 duelsOf:db.prepare("SELECT * FROM duels WHERE challenger=? OR (defender=? AND status NOT IN ('c_play','void')) ORDER BY status IN ('c_play','pending','d_play') DESC,id DESC LIMIT 20"),
 // What limits a new challenge: open duels and those created within the window, in either direction.
 recentDuelsOf:db.prepare("SELECT challenger,defender,status FROM duels WHERE (challenger=? OR defender=?) AND (status IN ('c_play','pending','d_play') OR created>?)"),
 sentOn:db.prepare("SELECT COUNT(*) AS n FROM duels WHERE challenger=? AND sday=?"),
 paidWinsOn:db.prepare("SELECT COUNT(*) AS n FROM duels WHERE winner=? AND paid=1 AND rday=?"),
 duelPending:db.prepare("UPDATE duels SET status='pending',c_score=?,expires=? WHERE id=? AND status='c_play'"),
 duelAccept:db.prepare("UPDATE duels SET status='d_play',d_started=? WHERE id=? AND status='pending'"),
 duelClose:db.prepare("UPDATE duels SET status=?,resolved=?,rday=? WHERE id=? AND status=?"),
 duelDone:db.prepare("UPDATE duels SET status='done',d_score=?,resolved=?,winner=?,paid=?,rday=? WHERE id=? AND status='d_play'"),
 staleDuels:db.prepare("SELECT * FROM duels WHERE (status='c_play' AND c_started<?) OR (status='d_play' AND d_started<?) OR (status='pending' AND expires<=?)"),
 upsertSub:db.prepare("INSERT INTO push_subs(player_id,endpoint,p256dh,auth,created) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET player_id=excluded.player_id,p256dh=excluded.p256dh,auth=excluded.auth,created=excluded.created"),
 trimSubs:db.prepare("DELETE FROM push_subs WHERE player_id=? AND id NOT IN (SELECT id FROM push_subs WHERE player_id=? ORDER BY created DESC,id DESC LIMIT ?)"),
 deleteSub:db.prepare("DELETE FROM push_subs WHERE endpoint=? AND player_id=?"),
 deleteSubId:db.prepare("DELETE FROM push_subs WHERE id=?"),
 subsOf:db.prepare("SELECT id,endpoint,p256dh,auth FROM push_subs WHERE player_id=?"),
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
   try{writeFileSync(backup,row.state,{mode:0o600});}
   catch(e){console.error(`player ${row.id}: unreadable state (${why||"rejected"}) and NO backup possible (${e.message}): left untouched, not loaded (this player cannot sign in until it is repaired)`);continue;}
   console.error(`player ${row.id}: unreadable state (${why||"rejected"}), saved to ${backup}, restarting their game`);
   state=R.newGame(camp,now);
  }
  try{
   const skipped=R.resync(state,now);if(skipped>0){resynced++;longest=Math.max(longest,skipped);}
   if(skipped>7*864e5)console.log(`player ${row.id}: ${Math.round(skipped/864e5)} days skipped`);
   // Ahead of real time on a real-time server: left as is (no replay), but said, since it should not happen.
   if(SPEED===1&&state.vclock-now>10*60e3)console.error(`player ${row.id}: game clock ${Math.round((state.vclock-now)/60e3)} min ahead of real time`);
  }catch(e){console.error(`player ${row.id}: clock not resynced`,e);state.lastReal=now;}
  players.set(row.id,{id:row.id,name:row.name,created:row.created,state,seen:row.seen_version??null});
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
 if(hashing>=6)throw new HttpError(503,"Serveur occupé, réessaie dans un instant.");
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
// Latin-1 and Latin Extended-A letters only, without the dotless ı, ĸ, ŉ and the long ſ: the IPA and small-capital
// lookalikes ("Mɑrine", "Marıne") are refused.
const NAME_RE=/^[A-Za-z0-9À-ÖØ-öø-ÿĀ-İĲ-ķĹ-ňŊ-ž][A-Za-z0-9À-ÖØ-öø-ÿĀ-İĲ-ķĹ-ňŊ-ž ._-]{1,18}[A-Za-z0-9À-ÖØ-öø-ÿĀ-İĲ-ķĹ-ňŊ-ž]$/u;
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
 if(!/^application\/json\s*(;|$)/i.test(String(req.headers["content-type"]||"")))throw new HttpError(415,"JSON attendu.");
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
 try{sweepDuels(now);}catch(e){console.error("sweep, duels:",e);}
 lastSweep=now;
},SWEEP_MS).unref();
let lastSweep=Date.now();

// ===================================================================== DUELS AND NOTIFICATIONS
// The key is made once and kept next to the database: browsers subscribed with it keep working across restarts.
const VAPID_FILE=join(dirname(DB_PATH),"vapid.json");
let VAPID=null;
if(PUSH_ON){try{VAPID=P.loadVapid(VAPID_FILE);}catch(e){console.error(`notifications disabled: ${e.message}`);}}
// Fire and forget: a slow, failing or vanished push service never delays nor breaks a request.
function notify(playerId,payload){
 if(!VAPID)return;
 let subs=[];try{subs=q.subsOf.all(playerId);}catch(e){console.error(`push, player ${playerId}: ${e.message}`);return;}
 for(const s of subs){
  P.sendPush(s,payload,{vapid:VAPID,contact:PUSH_CONTACT})
   .then(st=>{if((VAPID.temp?[404,410]:[401,403,404,410]).includes(st))q.deleteSubId.run(s.id);else if(st>=400)console.error(`push, player ${playerId}: status ${st}`);})
   .catch(e=>console.error(`push, player ${playerId}: ${e.message}`));
 }
}
const OPEN_DUEL=new Set(["c_play","pending","d_play"]);
const dayNow=now=>R.dayKey(Math.floor(now/R.H));
const nameOf=id=>players.get(id)?.name??"?";
// Only the two players hear about their duel; each is told the other's name and their own role.
function duelEvent(d,kind,to){
 for(const id of to){const mine=id===d.challenger,data={id:d.id,kind,role:mine?"challenger":"defender",vs:nameOf(mine?d.defender:d.challenger)};for(const c of clients)if(c.playerId===id)sse(c.res,"duel",data);}
}
// Duel news goes straight to the public feed (the journal's "duel" entries are private: they show the gauges).
function duelFeed(player,text){
 try{const e={t:Date.now(),player,kind:"duel",text};q.insertFeed.run(e.t,e.player,e.kind,e.text);q.trimFeed.run(FEED_KEEP);broadcast("feed",[e]);}
 catch(e){console.error("duel feed:",e);}
}
// An outcome lands like any other change: clock brought up to date, written, pushed to the player's screens.
// A player who deleted their account in the meantime is simply skipped.
function duelFx(id,res,opts,now){
 const pl=players.get(id);if(!pl)return;
 try{update(pl,S=>{R.advance(S,now,SPEED,Math.random);return R.duelApply(S,res,opts);});}
 catch(e){console.error(`duel result "${res}" NOT applied to player ${id} (the duel itself is closed):`,e);}
}
// The rules' own check (asleep, level), at the level this server is configured for.
const playBlock=S=>R.duelBlock(S,DUEL_MIN_LEVEL);
// Why this player cannot challenge anybody right now ("" when they can).
function selfWhy(p,now){
 return playBlock(p.state)||(now-p.created<DUEL_MIN_AGE?"Ton compte est trop récent pour les duels":"")
  ||(q.sentOn.get(p.id,dayNow(now)).n>=R.DUEL.perDay?"Plus de défis aujourd'hui":"");
}
// The players p is already tied to: an open duel, or one started within the window, in either direction.
function duelTies(p,now){
 const open=new Set(),recent=new Set();
 for(const d of q.recentDuelsOf.all(p.id,p.id,now-R.DUEL.window)){const o=d.challenger===p.id?d.defender:d.challenger;(OPEN_DUEL.has(d.status)?open:recent).add(o);}
 return {open,recent};
}
function targetWhy(o,ties,now){
 if(o.state.lvl<DUEL_MIN_LEVEL)return `Niveau ${DUEL_MIN_LEVEL} minimum`;
 if(now-o.created<DUEL_MIN_AGE)return "Compte trop récent";
 if(ties.open.has(o.id))return "Duel déjà en cours";
 if(ties.recent.has(o.id))return "Déjà un duel entre vous il y a moins de 24 h";
 return "";
}
function duelOpponents(p,now){
 const self=selfWhy(p,now),ties=duelTies(p,now);
 return [...players.values()].filter(o=>o.id!==p.id).map(o=>{const S=o.state,why=self||targetWhy(o,ties,now);
  return {name:o.name,camp:S.camp,lvl:S.lvl,candidate:R.person(S).name,ok:!why,why};}).sort((a,b)=>a.name.localeCompare(b.name,"fr"));
}
// One duel as its player sees it. The challenger's score stays hidden from the defender until the end.
function duelView(d,me){
 const mineC=d.challenger===me,done=d.status==="done";
 const res=done?(d.winner===null?"tie":d.winner===me?"win":"loss"):mineC&&(d.status==="refused"||d.status==="expired")?"chicken":null;
 return {id:d.id,role:mineC?"challenger":"defender",vs:nameOf(mineC?d.defender:d.challenger),status:d.status,
  mine:(mineC?d.c_score:d.d_score)??null,theirs:done?(mineC?d.d_score:d.c_score)??null:null,res,created:d.created,expires:d.expires??null};
}
// The defender has played (or forfeited with 0): scores compared, both candidates changed, the feed told.
// Returns the result from the defender's view, or null when the duel was already over.
function resolveDuel(d,dScore,now){
 const c=d.c_score??0,w=c>dScore?d.challenger:dScore>c?d.defender:null,day=dayNow(now);
 const paid=w!==null&&q.paidWinsOn.get(w,day).n<R.DUEL.paidWins?1:0;
 if(!q.duelDone.run(dScore,now,w,paid,day,d.id).changes)return null;
 const cn=nameOf(d.challenger),dn=nameOf(d.defender),view=id=>w===null?"tie":w===id?"win":"loss";
 duelFx(d.challenger,view(d.challenger),{vs:dn,mine:c,theirs:dScore,paid:!!paid},now);
 duelFx(d.defender,view(d.defender),{vs:cn,mine:dScore,theirs:c,paid:!!paid},now);
 duelFeed(w===d.defender?dn:cn,w===null?`Match nul entre ${cn} et ${dn} au Débat chrono, ${c} partout.`
  :w===d.challenger?`${cn} bat ${dn} au Débat chrono, ${c} à ${dScore}.`:`${dn} bat ${cn} au Débat chrono, ${dScore} à ${c}.`);
 duelEvent(d,"resolved",[d.challenger,d.defender]);
 notify(d.challenger,{title:"Duel terminé",tag:`duel-${d.id}`,url:"/",body:w===null?`${dn} a relevé ton défi : match nul, ${c} partout.`
  :w===d.challenger?`${dn} a relevé ton défi : tu gagnes ${c} à ${dScore} !`:`${dn} a relevé ton défi : tu perds ${c} à ${dScore}.`});
 return view(d.defender);
}
// Refused or left to expire: the challenger keeps a small consolation, the defender's game is untouched.
function closeDuel(d,status,now){
 if(!q.duelClose.run(status,now,dayNow(now),d.id,"pending").changes)return false;
 duelFx(d.challenger,"chicken",{vs:nameOf(d.defender)},now);
 duelEvent(d,status,[d.challenger,d.defender]);
 notify(d.challenger,{title:"Duel terminé",tag:`duel-${d.id}`,url:"/",body:`${nameOf(d.defender)} ${status==="refused"?"a esquivé":"n'a pas répondu à"} ton défi : moral +${R.DUEL.chicken.moral}.`});
 return true;
}
// Turns nobody finished and challenges nobody answered are closed by the clock.
function sweepDuels(now){
 const cut=now-DUEL_TURN_MS;
 for(const d of q.staleDuels.all(cut,cut,now)){
  try{
   if(d.status==="c_play"){if(q.duelClose.run("void",now,dayNow(now),d.id,"c_play").changes)duelEvent(d,"void",[d.challenger]);}
   else if(d.status==="d_play")resolveDuel(d,0,now);
   else closeDuel(d,"expired",now);
  }catch(e){console.error(`sweep, duel ${d.id}:`,e);}
 }
}
async function duelRoute(req,res){
 const p=auth(req);if(limited("duel:"+p.id,30,60e3))throw new HttpError(429,"Doucement : trop de duels d'un coup.");
 const b=await readJson(req);
 if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");   // deleted while the body was arriving
 const now=Date.now(),refuse=m=>new HttpError(422,m.endsWith(".")?m:m+".");
 if(b.op==="challenge"){
  update(p,S=>R.advance(S,now,SPEED,Math.random));
  const row=typeof b.name==="string"&&q.playerByKey.get(nameKey(cleanName(b.name).slice(0,40))),o=row&&players.get(row.id);
  if(!o||o.id===p.id)throw refuse("Adversaire introuvable.");
  const why=selfWhy(p,now)||targetWhy(o,duelTies(p,now),now);if(why)throw refuse(why);
  const seed=crypto.randomInt(0,2**32),{lastInsertRowid}=q.insertDuel.run(R.DUEL.game,p.id,o.id,seed,now,now,dayNow(now));
  return send(res,200,{ok:true,duel:{id:Number(lastInsertRowid),seed},me:mePayload(p)});
 }
 if(!["accept","refuse","submit"].includes(b.op))throw new HttpError(400,"Opération inconnue.");
 const d=Number.isSafeInteger(b.id)&&q.duel.get(b.id);
 if(!d||(d.challenger!==p.id&&d.defender!==p.id))throw refuse("Duel introuvable.");
 if(b.op==="accept"||b.op==="refuse"){
  if(d.defender!==p.id||d.status!=="pending")throw refuse("Ce défi n'attend pas ta réponse.");
  if(b.op==="refuse"){closeDuel(d,"refused",now);return send(res,200,{ok:true,me:mePayload(p)});}
  if(now>=d.expires){closeDuel(d,"expired",now);throw refuse("Ce défi a expiré.");}
  update(p,S=>R.advance(S,now,SPEED,Math.random));
  const e=playBlock(p.state);if(e)throw refuse(e);
  q.duelAccept.run(now,d.id);
  return send(res,200,{ok:true,duel:{id:d.id,seed:d.seed},me:mePayload(p)});
 }
 // Submit: the picks are replayed on the server's own deal, for the camp the player is in now.
 const mineC=d.challenger===p.id;
 if(d.status!==(mineC?"c_play":"d_play"))throw refuse("Ce n'est pas ton tour de jouer.");
 const el=now-(mineC?d.c_started:d.d_started),r=R.replayDebate(d.seed,p.state.camp,b.picks);
 // Play starts after the countdown: the last pick cannot land sooner. The human-pace cap counts the 15 s of play at
 // most: waiting before sending must not raise it.
 const play=el-R.DEBATE.intro,valid=!!r&&play>=r.last&&el<=DUEL_TURN_MS&&r.points<=Math.ceil(Math.max(0,Math.min(play,R.MINI.debate.ms))/1000*R.MINI.debate.perSecond)+1;
 if(mineC){
  // A refused score voids the challenge: nobody was told yet, and nothing changes for anyone.
  if(!valid){if(q.duelClose.run("void",now,dayNow(now),d.id,"c_play").changes)duelEvent(d,"void",[p.id]);throw refuse("Score refusé : le défi est annulé.");}
  q.duelPending.run(r.points,now+R.DUEL.window,d.id);
  const dn=nameOf(d.defender);
  duelFeed(p.name,`${p.name} défie ${dn} au Débat chrono.`);
  duelEvent(d,"challenged",[d.defender]);
  notify(d.defender,{title:"Défi reçu !",body:`${p.name} te défie au Débat chrono. Tu as 24 h pour relever le défi.`,tag:`duel-${d.id}`,url:"/"});
  return send(res,200,{ok:true,score:r.points,errors:r.errors,status:"pending",mine:r.points,theirs:null,res:null,me:mePayload(p)});
 }
 // The defender's refused score counts as 0: a broken or forged answer forfeits instead of stalling the duel.
 const out=resolveDuel(d,valid?r.points:0,now);
 // Said plainly: the duel is over and lost, it cannot be sent again.
 if(!valid)return send(res,422,{ok:false,error:"Score refusé ou envoyé trop tard : duel perdu par forfait.",res:out,mine:0,theirs:d.c_score??0,me:mePayload(p)});
 return send(res,200,{ok:true,score:r.points,errors:r.errors,status:"done",mine:r.points,theirs:d.c_score??0,res:out,me:mePayload(p)});
}
async function pushRoute(req,res,path){
 const p=auth(req),off=path==="/api/push/unsubscribe";
 if(limited((off?"unpush:":"push:")+p.id,20,600e3))throw new HttpError(429,"Doucement : réessaie dans un instant.");
 const b=await readJson(req);
 if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");   // deleted while the body was arriving
 // Endpoints are stored in one spelling (case, default port), so one browser is one row.
 const ep=P.canonicalEndpoint(b.endpoint);
 // Unsubscribing always works (even with notifications turned off since): only the caller's own row goes.
 if(off){if(!ep)throw new HttpError(400,"Abonnement inconnu.");q.deleteSub.run(ep,p.id);return send(res,200,{ok:true});}
 if(!VAPID)throw new HttpError(404,"Notifications désactivées sur ce serveur.");
 const keys=P.validKeys(b.keys);
 if(!P.validEndpoint(ep)||!keys)throw new HttpError(400,"Abonnement refusé.");
 // An endpoint belongs to one browser: signed in as someone else, it follows the new player. Five devices at most.
 q.upsertSub.run(p.id,ep,keys.p256dh,keys.auth,Date.now());q.trimSubs.run(p.id,p.id,5);
 return send(res,200,{ok:true});
}

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
  const p={id:Number(lastInsertRowid),name,created:now,state,seen:RELEASE};players.set(p.id,p);   // a new player has nothing to catch up on
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
 if(path==="/api/duels"&&method==="GET"){
  const p=auth(req),now=Date.now();
  return send(res,200,{ok:true,duels:q.duelsOf.all(p.id,p.id).sort((a,b)=>b.id-a.id).map(d=>duelView(d,p.id)),opponents:duelOpponents(p,now),
   sent:q.sentOn.get(p.id,dayNow(now)).n,perDay:R.DUEL.perDay,minLevel:DUEL_MIN_LEVEL,pushKey:VAPID?.publicKey??null});
 }
 if(path==="/api/duel"&&method==="POST")return duelRoute(req,res);
 if((path==="/api/push/subscribe"||path==="/api/push/unsubscribe")&&method==="POST")return pushRoute(req,res,path);
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
