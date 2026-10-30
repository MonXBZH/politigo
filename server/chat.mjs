// PolitiGo chat: a global room and one room per camp, text, emoji and images.
// Rooms are stored as "global", "left", "right"; a player only ever sees "global" and "camp" (their CURRENT camp, so a
// player who changes camp simply sees the other room from then on). No dependency outside Node itself.
import crypto from "node:crypto";
import {mkdirSync,readdirSync,unlinkSync,chmodSync,readFileSync} from "node:fs";
import {writeFile,rename,readFile,unlink} from "node:fs/promises";
import {join} from "node:path";

const env=process.env;
const KEEP_MS=7*864e5,ORPHAN_MS=3600e3,PAGE=50,TEXT_MAX=500,UNREAD_CAP=99;
const PENDING_MAX=3,MEDIA_MAX=2*1024*1024,DRAIN_MAX=8*1024*1024;
// Total image storage (300 MB); the knob exists for tests and can only LOWER it.
const STORE_MAX=Math.min(300,Math.max(0,Number(env.POLITIGO_CHAT_STORE_MB)||300))*1024*1024;
const TZ=env.POLITIGO_TZ||"Europe/Paris";
const ID_RE=/^[A-Za-z0-9_-]{22}$/;
// Only these, recognised by their first bytes: the client's Content-Type and file name are never trusted.
function sniff(b){
 if(b.length>=6&&/^GIF8[79]a$/.test(b.toString("latin1",0,6)))return "image/gif";
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return "image/png";
 if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return "image/jpeg";
 if(b.length>=12&&b.toString("latin1",0,4)==="RIFF"&&b.toString("latin1",8,12)==="WEBP")return "image/webp";
 return null;
}
// Plain text: NFC, control characters dropped (newlines kept), bidi and invisible characters dropped (not the joiner
// emoji sequences need), at most one blank line in a row.
export function cleanText(s){
 if(typeof s!=="string")return "";
 return s.normalize("NFC").replace(/\r\n?|[\u2028\u2029]/g,"\n").replace(/\t/g," ")
  .replace(/[\p{Cc}\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu,c=>c==="\n"?c:"")
  .replace(/[ \u00a0]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}
function frDate(t){
 try{return new Date(t).toLocaleString("fr-FR",{timeZone:TZ,day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});}
 catch{return new Date(t).toLocaleString("fr-FR");}
}

export function createChat({db,dataDir,players,clients,sse,auth,limited,HttpError,send,readJson,checkOrigin,rooms}){
 // chat_media has no foreign key: when an account goes, its files must still be found (and deleted) from these rows.
 db.exec(`CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY,room TEXT NOT NULL,player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
 t INTEGER NOT NULL,text TEXT NOT NULL,media TEXT,deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS chat_messages_room ON chat_messages(room,id);
CREATE INDEX IF NOT EXISTS chat_messages_t ON chat_messages(t);
CREATE INDEX IF NOT EXISTS chat_messages_media ON chat_messages(media);
CREATE TABLE IF NOT EXISTS chat_media(id TEXT PRIMARY KEY,player_id INTEGER NOT NULL,t INTEGER NOT NULL,type TEXT NOT NULL,bytes INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat_reports(message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
 reporter_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,t INTEGER NOT NULL,UNIQUE(message_id,reporter_id));
CREATE TABLE IF NOT EXISTS chat_reads(player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,room TEXT NOT NULL,last_id INTEGER NOT NULL,PRIMARY KEY(player_id,room));
CREATE TABLE IF NOT EXISTS chat_mutes(player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,until INTEGER NOT NULL);`);
 const MSG="SELECT m.id,m.room,m.player_id,m.t,m.text,m.media,cm.type AS mtype FROM chat_messages m LEFT JOIN chat_media cm ON cm.id=m.media";
 const q={
  page:db.prepare(`${MSG} WHERE m.room=? AND m.deleted=0 AND m.id<? ORDER BY m.id DESC LIMIT ${PAGE}`),
  msg:db.prepare(`${MSG} WHERE m.id=? AND m.deleted=0`),
  insert:db.prepare("INSERT INTO chat_messages(room,player_id,t,text,media) VALUES(?,?,?,?,?)"),
  softDelete:db.prepare("UPDATE chat_messages SET deleted=1,text='',media=NULL WHERE id=? AND deleted=0"),
  unread:db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM chat_messages WHERE room=? AND id>? AND deleted=0 AND player_id<>? LIMIT ${UNREAD_CAP})`),
  read:db.prepare("SELECT last_id FROM chat_reads WHERE player_id=? AND room=?"),
  markRead:db.prepare("INSERT INTO chat_reads(player_id,room,last_id) VALUES(?,?,?) ON CONFLICT(player_id,room) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)"),
  maxId:db.prepare("SELECT COALESCE(MAX(id),0) AS n FROM chat_messages WHERE room=?"),
  insertMedia:db.prepare("INSERT INTO chat_media(id,player_id,t,type,bytes) VALUES(?,?,?,?,?)"),
  media:db.prepare("SELECT * FROM chat_media WHERE id=?"),
  useMedia:db.prepare("UPDATE chat_media SET used=1 WHERE id=? AND player_id=? AND used=0"),
  deleteMedia:db.prepare("DELETE FROM chat_media WHERE id=?"),
  mediaOf:db.prepare("SELECT id FROM chat_media WHERE player_id=?"),
  liveOf:db.prepare("SELECT id,room FROM chat_messages WHERE player_id=? AND deleted=0"),
  mediaRooms:db.prepare("SELECT room FROM chat_messages WHERE media=? AND deleted=0"),
  pending:db.prepare("SELECT COUNT(*) AS n FROM chat_media WHERE player_id=? AND used=0"),
  stored:db.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(bytes),0) AS bytes FROM chat_media"),
  // Unattached past the hour, an author gone, or no live message left using it (purged, deleted).
  deadMedia:db.prepare(`SELECT id FROM chat_media c WHERE (used=0 AND t<?) OR player_id NOT IN (SELECT id FROM players)
   OR (used=1 AND NOT EXISTS(SELECT 1 FROM chat_messages m WHERE m.media=c.id AND m.deleted=0)) LIMIT 500`),
  purge:db.prepare("DELETE FROM chat_messages WHERE t<?"),
  report:db.prepare("INSERT OR IGNORE INTO chat_reports(message_id,reporter_id,t) VALUES(?,?,?)"),
  reports:db.prepare(`${MSG} WHERE m.deleted=0 AND m.id IN (SELECT message_id FROM chat_reports) ORDER BY (SELECT MAX(t) FROM chat_reports r WHERE r.message_id=m.id) DESC LIMIT 200`),
  reportersOf:db.prepare("SELECT p.name FROM chat_reports r JOIN players p ON p.id=r.reporter_id WHERE r.message_id=? ORDER BY r.t"),
  reportsOpen:db.prepare("SELECT COUNT(DISTINCT r.message_id) AS n FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id AND m.deleted=0"),
  live:db.prepare("SELECT COUNT(*) AS n FROM chat_messages WHERE deleted=0"),
  mute:db.prepare("INSERT INTO chat_mutes(player_id,until) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET until=excluded.until"),
  unmute:db.prepare("DELETE FROM chat_mutes WHERE player_id=?"),
  muted:db.prepare("SELECT until FROM chat_mutes WHERE player_id=?"),
  purgeMutes:db.prepare("DELETE FROM chat_mutes WHERE until<=?"),
  forget:["chat_messages","chat_reports","chat_reads","chat_mutes"].map(t=>db.prepare(`DELETE FROM ${t} WHERE ${t==="chat_reports"?"reporter_id":"player_id"}=?`)),
 };
 const MEDIA_DIR=join(dataDir,"chat-media");
 mkdirSync(MEDIA_DIR,{recursive:true,mode:0o700});try{chmodSync(MEDIA_DIR,0o700);}catch{}
 const fileOf=id=>join(MEDIA_DIR,id);
 // Leftovers of a crash (half-written temp files, files whose row never got written) go at start.
 try{for(const f of readdirSync(MEDIA_DIR))if(!ID_RE.test(f)||!q.media.get(f)){try{unlinkSync(join(MEDIA_DIR,f));}catch{}}}
 catch(e){console.error(`chat media folder: ${e.message}`);}
 const dropFile=id=>unlink(fileOf(id)).catch(e=>{if(e.code!=="ENOENT")console.error(`chat media ${id}: ${e.message}`);});
 function dropMedia(id){if(!id)return;q.deleteMedia.run(id);dropFile(id);}

 const sees=(p,room)=>room==="global"||p.state.camp===room;
 // Which rooms the organisation has opened, read at every use so a switch applies at once. Unknown = closed.
 const opened=()=>{try{const r=rooms?.();return {global:r?.global===true,camp:r?.camp===true};}catch(e){console.error("chat rooms:",e);return {global:false,camp:false};}};
 const isOpen=(o,room)=>room==="global"?o.global:o.camp;   // stored room: "left"/"right" are the camp rooms
 const closed=()=>new HttpError(403,"Ce salon de discussion est fermé pour le moment.");
 const mustOpen=room=>{if(!isOpen(opened(),room))throw closed();};
 const roomFor=(p,r)=>r==="global"?"global":r==="camp"?p.state.camp:null;
 const lastRead=(pid,room)=>q.read.get(pid,room)?.last_id??0;
 const unreadIn=(p,room)=>q.unread.get(room,lastRead(p.id,room),p.id).n;
 const unreadOf=(p,o=opened())=>({global:o.global?unreadIn(p,"global"):0,camp:o.camp?unreadIn(p,p.state.camp):0});
 const mutedUntil=pid=>{const u=q.muted.get(pid)?.until;return u&&u>Date.now()?u:null;};
 // One message as a given player sees it: their own room name, "mine" for them, the author's camp and presence now.
 function view(m,me,online){
  const a=players.get(m.player_id);
  return {id:m.id,t:m.t,room:m.room==="global"?"global":"camp",author:{name:a?.name??"?",camp:a?.state.camp??null,online:online.has(m.player_id)},
   mine:m.player_id===me,text:m.text,media:m.media&&m.mtype?{id:m.media,type:m.mtype}:null};
 }
 const onlineIds=()=>new Set([...clients].map(c=>c.playerId));
 // Each open screen allowed to see the room, told in its own terms.
 function toRoom(room,fn,always=false){
  if(!always&&!isOpen(opened(),room))return;   // a closed room says nothing live (deletions still go out: see softDelete)
  for(const c of clients){const p=players.get(c.playerId);if(p&&sees(p,room))fn(c,p);}
 }
 function softDelete(m){
  if(!q.softDelete.run(m.id).changes)return false;
  dropMedia(m.media);
  toRoom(m.room,c=>sse(c.res,"chatDel",{id:m.id}),true);
  return true;
 }
 const body404=()=>new HttpError(404,"Message introuvable.");
 const msgId=v=>Number.isSafeInteger(v)&&v>0?v:null;
 // Read up to the end, keeping at most 2 MB: an oversized upload is drained (cut off past 8 MB) so the 413 gets through.
 async function readImage(req){
  let size=0,big=false;const chunks=[];
  for await(const c of req){
   size+=c.length;
   if(size>MEDIA_MAX){big=true;chunks.length=0;if(size>DRAIN_MAX){req.destroy();break;}continue;}
   chunks.push(c);
  }
  if(big)throw new HttpError(413,"Image trop lourde : 2 Mo maximum.");
  return Buffer.concat(chunks);
 }

 async function route(req,res,path,method){
  if(path==="/api/chat"&&method==="GET"){
   const p=auth(req);if(limited("chatget:"+p.id,120,60e3))throw new HttpError(429,"Doucement : réessaie dans un instant.");
   const u=new URL(req.url,"http://x"),r=u.searchParams.get("room")||"global",room=roomFor(p,r);
   if(!room)throw new HttpError(400,"Salon inconnu.");
   const o=opened();if(!isOpen(o,room))throw closed();
   const b=u.searchParams.get("before"),before=b==null?Number.MAX_SAFE_INTEGER:Number(b);
   if(!Number.isSafeInteger(before)||before<1)throw new HttpError(400,"Page inconnue.");
   const on=onlineIds();
   return send(res,200,{ok:true,room:r,messages:q.page.all(room,before).reverse().map(m=>view(m,p.id,on)),unread:unreadOf(p,o),rooms:o,mutedUntil:mutedUntil(p.id),lastRead:lastRead(p.id,room)}),true;
  }
  if(path==="/api/chat"&&method==="POST"){
   const p=auth(req);if(limited("chatmsg:"+p.id,8,20e3))throw new HttpError(429,"Doucement : trop de messages d'un coup.");
   const b=await readJson(req);
   if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");   // deleted while the body was arriving
   const until=mutedUntil(p.id);if(until)throw new HttpError(403,`Tu es privé de chat jusqu'au ${frDate(until)}.`);
   const room=roomFor(p,b.room);if(!room)throw new HttpError(400,"Salon inconnu.");
   mustOpen(room);
   const text=cleanText(b.text),media=b.media==null||b.media===""?null:b.media;
   if([...text].length>TEXT_MAX)throw new HttpError(400,`Message : ${TEXT_MAX} caractères maximum.`);
   if(media!==null&&(typeof media!=="string"||!ID_RE.test(media)))throw new HttpError(400,"Image introuvable, renvoie-la.");
   if(!text&&!media)throw new HttpError(400,"Message vide.");
   const now=Date.now();let id;
   // The image is claimed and the message written together: an image goes with one message, of its own uploader.
   db.exec("BEGIN");
   try{
    if(media&&!q.useMedia.run(media,p.id).changes)throw new HttpError(400,"Image introuvable, renvoie-la.");
    id=Number(q.insert.run(room,p.id,now,text,media).lastInsertRowid);db.exec("COMMIT");
   }catch(e){db.exec("ROLLBACK");throw e;}
   const m=q.msg.get(id),on=onlineIds();
   toRoom(room,(c,o)=>sse(c.res,"chat",{room:room==="global"?"global":"camp",message:view(m,o.id,on)}));
   return send(res,200,{ok:true,message:view(m,p.id,on)}),true;
  }
  if(path==="/api/chat/media"&&method==="POST"){
   const p=auth(req);checkOrigin(req);
   {const o=opened();if(!o.global&&!o.camp)throw closed();}
   // image/* cannot be sent cross-site without a preflight (a form can only post text/plain, multipart or urlencoded).
   if(!/^image\/[a-z0-9.+-]+\s*(;|$)/i.test(String(req.headers["content-type"]||"")))throw new HttpError(415,"Image attendue (GIF, PNG, JPEG ou WebP).");
   if(limited("chatup:"+p.id,20,3600e3))throw new HttpError(429,"Trop d'images envoyées, réessaie dans un moment.");
   const until=mutedUntil(p.id);if(until)throw new HttpError(403,`Tu es privé de chat jusqu'au ${frDate(until)}.`);
   // A few images waiting for their message at most: uploads alone cannot fill the disk.
   const tooMany=()=>q.pending.get(p.id).n>=PENDING_MAX;
   if(tooMany())throw new HttpError(429,"Envoie d'abord les images déjà préparées.");
   if(Number(req.headers["content-length"])>DRAIN_MAX){res.setHeader("Connection","close");throw new HttpError(413,"Image trop lourde : 2 Mo maximum.");}
   const buf=await readImage(req),type=sniff(buf);
   if(!type)throw new HttpError(415,"Format non pris en charge : GIF, PNG, JPEG ou WebP.");
   if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");
   // Checked again after the upload pause, and the bytes reserved (the row) in the same synchronous step: parallel
   // uploads can neither pass the per-player limit nor overshoot the storage cap.
   if(tooMany())throw new HttpError(429,"Envoie d'abord les images déjà préparées.");
   if(q.stored.get().bytes+buf.length>STORE_MAX)throw new HttpError(507,"Stockage des images plein, réessaie plus tard.");
   const id=crypto.randomBytes(16).toString("base64url"),tmp=join(MEDIA_DIR,`.tmp-${id}`);
   q.insertMedia.run(id,p.id,Date.now(),type,buf.length);
   // Written aside then renamed: a crash never leaves a half image under a real name.
   try{await writeFile(tmp,buf,{mode:0o600,flag:"wx"});await rename(tmp,fileOf(id));}
   catch(e){unlink(tmp).catch(()=>{});q.deleteMedia.run(id);console.error(`chat media upload: ${e.message}`);throw new HttpError(507,"Stockage des images plein, réessaie plus tard.");}
   return send(res,200,{ok:true,id,type}),true;
  }
  if(path.startsWith("/api/chat/media/")&&method==="GET"){
   const p=auth(req);if(limited("chatimg:"+p.id,600,60e3))throw new HttpError(429,"Doucement : réessaie dans un instant.");
   const id=path.slice(16),m=ID_RE.test(id)&&q.media.get(id);
   // Seen by whoever may read an OPEN room where it was posted (its uploader included), or by its uploader before it is
   // posted while any room is open; anyone else learns nothing (404).
   const o=opened(),posted=m?q.mediaRooms.all(id):[];
   if(!m||!(posted.some(r=>isOpen(o,r.room)&&(sees(p,r.room)||m.player_id===p.id))||(m.player_id===p.id&&!m.used&&(o.global||o.camp))))
    throw new HttpError(404,"Introuvable.");
   let data;try{data=await readFile(fileOf(id));}catch{throw new HttpError(404,"Introuvable.");}
   res.writeHead(200,{"Content-Type":m.type,"Content-Length":data.length,"X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; sandbox","Cache-Control":"private, max-age=3600","Content-Disposition":"inline",
    "Cross-Origin-Resource-Policy":"same-origin"});
   res.end(data);return true;
  }
  if((path==="/api/chat/report"||path==="/api/chat/delete"||path==="/api/chat/read")&&method==="POST"){
   const p=auth(req),op=path.slice(10);
   if(limited(`chat${op}:${p.id}`,op==="read"?120:30,60e3))throw new HttpError(429,"Doucement : réessaie dans un instant.");
   const b=await readJson(req);
   if(!players.has(p.id))throw new HttpError(401,"Connexion requise.");
   if(op==="read"){
    const room=roomFor(p,b.room),id=Number.isSafeInteger(b.id)&&b.id>=0?b.id:null;
    if(!room||id===null)throw new HttpError(400,"Lecture inconnue.");
    mustOpen(room);
    // Never past the room's last message: a client cannot mark the future as read.
    q.markRead.run(p.id,room,Math.min(id,q.maxId.get(room).n));
    const unread=unreadOf(p);for(const c of clients)if(c.playerId===p.id)sse(c.res,"chatUnread",unread);   // the player's other screens too
    return send(res,200,{ok:true,unread}),true;
   }
   const id=msgId(b.id),m=id&&q.msg.get(id);
   if(!m||!sees(p,m.room))throw body404();
   mustOpen(m.room);
   if(op==="report"){
    if(m.player_id===p.id)throw new HttpError(422,"Tu ne peux pas signaler ton propre message.");
    if(q.report.run(m.id,p.id,Date.now()).changes)console.log(`chat: message ${m.id} reported by player ${p.id}`);
    return send(res,200,{ok:true}),true;
   }
   if(m.player_id!==p.id)throw new HttpError(403,"Tu ne peux supprimer que tes propres messages.");
   softDelete(m);
   return send(res,200,{ok:true}),true;
  }
  return false;
 }

 function sweep(now){
  q.purge.run(now-KEEP_MS);q.purgeMutes.run(now);
  for(const {id} of q.deadMedia.all(now-ORPHAN_MS))dropMedia(id);
 }
 function onStream(c,p){sse(c.res,"chatUnread",unreadOf(p));}
 // Called just BEFORE the player row goes (the cascade then takes the messages): returns what tells the open screens.
 function beforePlayerDelete(id){
  const gone=q.liveOf.all(id);
  return ()=>{for(const m of gone)toRoom(m.room,c=>sse(c.res,"chatDel",{id:m.id}),true);};
 }
 // Called once the player row is gone (the foreign keys took the messages): their images follow, rows and files.
 function playerDeleted(id){
  for(const s of q.forget)s.run(id);
  for(const {id:mid} of q.mediaOf.all(id))dropMedia(mid);
 }
 const admin={
  stats(){const s=q.stored.get();return {messages7d:q.live.get().n,media:s.n,mediaBytes:s.bytes,reportsOpen:q.reportsOpen.get().n};},
  reports(){
   return q.reports.all().map(m=>{const rs=q.reportersOf.all(m.id).map(r=>r.name);
    return {id:m.id,t:m.t,room:m.room,author:players.get(m.player_id)?.name??"?",authorId:m.player_id,text:m.text,
     media:m.media&&m.mtype?{id:m.media,type:m.mtype}:null,reports:rs.length,reporters:rs};});
  },
  deleteMessage(id){const m=msgId(Number(id))&&q.msg.get(Number(id));return m?softDelete(m):false;},
  mute(playerId,until){if(until&&until>Date.now())q.mute.run(playerId,Math.floor(until));else q.unmute.run(playerId);},
  mutedUntil,
  // The admin socket has no player session: a reported image travels inside the reply (2 MB at most, 2.7 MB as base64).
  media(id){
   const m=typeof id==="string"&&ID_RE.test(id)&&q.media.get(id);
   if(!m||!q.mediaRooms.all(id).length)return null;
   try{return {type:m.type,data:readFileSync(fileOf(id)).toString("base64")};}catch{return null;}
  },
 };
 return {route,sweep,onStream,beforePlayerDelete,playerDeleted,admin};
}
