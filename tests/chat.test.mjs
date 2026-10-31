// Chat (server/chat.mjs) on a real server: rooms per camp, live events per recipient, images, reports, deletion,
// mutes, retention. The database is touched directly (node:sqlite) to backdate rows or mute, as an admin would.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import {boot,stop,player,until,PW} from "./server-helpers.mjs";

const PORT=3888,BASE=`http://127.0.0.1:${PORT}`;
let proc,DB,DIR;
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pgchat-"));proc=await boot(PORT,DIR,{POLITIGO_CHAT:"on"});DB=new DatabaseSync(join(DIR,"t.db"),{timeout:5000});});
after(async()=>{try{DB.close();}catch{}await stop(proc);});

const GIF=Buffer.from("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b","hex");
const PNG=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==","base64");
const say=(c,room,text,media)=>c.call("POST","/api/chat",{room,text,...(media?{media}:{})});
const list=(c,room,before)=>c.call("GET",`/api/chat?room=${room}${before?`&before=${before}`:""}`);
const upload=async(c,bytes,type="image/gif")=>{
 const r=await fetch(`${BASE}/api/chat/media`,{method:"POST",headers:{"Content-Type":type,Cookie:c.cookie},body:bytes});
 let json=null;try{json=await r.json();}catch{}return {status:r.status,json};
};
const media=(c,id)=>fetch(`${BASE}/api/chat/media/${id}`,{headers:{Cookie:c.cookie}});
const idOf=name=>DB.prepare("SELECT id FROM players WHERE name=?").get(name).id;
function stream(c){
 const ac=new AbortController(),events=[];
 fetch(`${BASE}/events`,{headers:{Cookie:c.cookie},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
 }).catch(()=>{});
 return {events,close:()=>ac.abort(),of:ev=>events.filter(e=>e.ev===ev).map(e=>e.data)};
}

test("rooms: global for all, camp for its camp only; mine and room per recipient; unread counts and read marks",async t=>{
 const L1=await player(PORT,"Gauche Un","left"),L2=await player(PORT,"Gauche Deux","left"),R1=await player(PORT,"Droite Un","right");
 const open=[];t.after(()=>{for(const s of open)s.close();});
 const s1=stream(L1),s2=stream(L2),sr=stream(R1);open.push(s1,s2,sr);
 assert.ok(await until(()=>[s1,s2,sr].every(s=>s.of("chatUnread").length)));
 assert.deepEqual(s2.of("chatUnread")[0],{global:0,camp:0});
 const g=await say(L1,"global","Bonjour tout le monde"),c=await say(L1,"camp","Entre nous, la gauche");
 assert.equal(g.status,200,JSON.stringify(g.json));assert.equal(c.status,200);
 assert.equal(g.json.message.mine,true);assert.equal(c.json.message.room,"camp");
 assert.deepEqual(g.json.message.author,{name:"Gauche Un",camp:"left",online:true});
 assert.equal(DB.prepare("SELECT room FROM chat_messages WHERE id=?").get(c.json.message.id).room,"left","stored under the real camp");
 // HTTP
 const rg=await list(R1,"global"),rc=await list(R1,"camp"),lc=await list(L2,"camp");
 assert.deepEqual(rg.json.messages.map(m=>m.text),["Bonjour tout le monde"]);
 assert.equal(rg.json.messages[0].mine,false);
 assert.deepEqual(rc.json.messages,[],"the right does not read the left's room");
 assert.deepEqual(lc.json.messages.map(m=>[m.text,m.room,m.mine]),[["Entre nous, la gauche","camp",false]]);
 assert.equal((await list(L1,"camp")).json.messages[0].mine,true);
 assert.deepEqual(lc.json.unread,{global:1,camp:1});assert.deepEqual(rc.json.unread,{global:1,camp:0});
 assert.equal(lc.json.mutedUntil,null);assert.equal(lc.json.lastRead,0);
 assert.equal((await list(L1,"autre")).status,400);
 // SSE
 assert.ok(await until(()=>s2.of("chat").length===2&&sr.of("chat").length>=1&&s1.of("chat").length===2));
 assert.deepEqual(s2.of("chat").map(e=>[e.room,e.message.room,e.message.mine,e.message.text]),[["global","global",false,"Bonjour tout le monde"],["camp","camp",false,"Entre nous, la gauche"]]);
 assert.deepEqual(s1.of("chat").map(e=>e.message.mine),[true,true]);
 await new Promise(r=>setTimeout(r,200));
 assert.deepEqual(sr.of("chat").map(e=>e.message.text),["Bonjour tout le monde"],"no camp message reaches the other camp");
 // A new stream is told the unread counts; a read mark updates every screen of that player.
 const s2b=stream(L2);open.push(s2b);
 assert.ok(await until(()=>s2b.of("chatUnread").length));assert.deepEqual(s2b.of("chatUnread")[0],{global:1,camp:1});
 const rd=await L2.call("POST","/api/chat/read",{room:"global",id:g.json.message.id});
 assert.equal(rd.status,200);assert.deepEqual(rd.json.unread,{global:0,camp:1});
 assert.ok(await until(()=>s2.of("chatUnread").some(u=>u.global===0&&u.camp===1)));
 assert.equal((await list(L2,"global")).json.lastRead,g.json.message.id);
 // Marking the future read is capped at the room's last message.
 await L2.call("POST","/api/chat/read",{room:"camp",id:10**9});
 assert.equal((await list(L2,"camp")).json.lastRead,c.json.message.id);
 assert.equal((await L2.call("POST","/api/chat/read",{room:"x",id:1})).status,400);
});

test("text: cleaned, 500 characters at most, never empty without an image; 8 messages per 20 s",async()=>{
 const a=await player(PORT,"Bavard","left");
 const r=await say(a,"global","  a\u202eb\u200bc\u0007\r\n \n\n\n\nd 👨\u200d👩\u200d👧  ");
 assert.equal(r.status,200);assert.equal(r.json.message.text,"abc\n\nd 👨\u200d👩\u200d👧");
 assert.equal((await say(a,"global","é".repeat(500))).status,200);
 const long=await say(a,"global","x".repeat(501));assert.equal(long.status,400);assert.match(long.json.error,/500/);
 assert.equal((await say(a,"global"," \n\u200b ")).status,400);
 assert.equal((await say(a,"global",42)).status,400);
 assert.equal((await say(a,"salon","x")).status,400);
 const b=await player(PORT,"Mitrailleur","right");let codes=[];
 for(let i=0;i<9;i++)codes.push((await say(b,"global","n°"+i)).status);
 assert.deepEqual(codes,[200,200,200,200,200,200,200,200,429]);
});

test("pages: 50 newest, oldest first; before= gives the older page",async()=>{
 const a=await player(PORT,"Archiviste","right"),id=idOf("Archiviste"),now=Date.now();
 const ins=DB.prepare("INSERT INTO chat_messages(room,player_id,t,text) VALUES('right',?,?,?)");
 for(let i=0;i<60;i++)ins.run(id,now,"page "+i);
 const p1=(await list(a,"camp")).json.messages;
 assert.equal(p1.length,50);assert.equal(p1[0].text,"page 10");assert.equal(p1.at(-1).text,"page 59");
 const p2=(await list(a,"camp",p1[0].id)).json.messages;
 assert.deepEqual(p2.map(m=>m.text),Array.from({length:10},(_,i)=>"page "+i));
 assert.equal((await list(a,"camp","abc")).status,400);
});

test("images: sniffed by their bytes, 2 MB at most, served strictly, only to those who may see them",async()=>{
 const L=await player(PORT,"Photographe","left"),L2=await player(PORT,"Voisin","left"),R=await player(PORT,"Curieux","right");
 const gif=await upload(L,GIF);assert.equal(gif.status,200,JSON.stringify(gif.json));assert.equal(gif.json.type,"image/gif");
 assert.match(gif.json.id,/^[A-Za-z0-9_-]{22}$/);
 const fake=await upload(L,PNG,"image/gif");assert.equal(fake.json.type,"image/png","the bytes win over the claimed type");
 assert.equal((await upload(L,Buffer.from("<svg onload=alert(1)>"),"image/png")).status,415);
 assert.equal((await upload(L,GIF,"text/plain")).status,415);
 const big=Buffer.alloc(2*1024*1024+1);GIF.copy(big);
 assert.equal((await upload(L,big)).status,413);
 assert.equal((await upload({cookie:""},GIF)).status,401);
 // Unattached: only the uploader sees it.
 assert.equal((await media(L,gif.json.id)).status,200);assert.equal((await media(L2,gif.json.id)).status,404);
 const m=await say(L,"camp","",gif.json.id);assert.equal(m.status,200,JSON.stringify(m.json));
 assert.deepEqual(m.json.message.media,{id:gif.json.id,type:"image/gif"});assert.equal(m.json.message.text,"");
 assert.equal((await say(L,"global","encore",gif.json.id)).status,400,"one image, one message");
 assert.equal((await say(L2,"global","volée",fake.json.id)).status,400,"someone else's image");
 const r=await media(L2,gif.json.id);
 assert.equal(r.status,200);assert.equal(r.headers.get("content-type"),"image/gif");
 assert.equal(r.headers.get("x-content-type-options"),"nosniff");
 assert.equal(r.headers.get("content-security-policy"),"default-src 'none'; sandbox");
 assert.equal(r.headers.get("cache-control"),"private, max-age=3600","a deleted image does not linger in browsers");
 assert.deepEqual(Buffer.from(await r.arrayBuffer()),GIF);
 assert.equal((await media(R,gif.json.id)).status,404,"the other camp's room");
 assert.equal((await media(R,"../../t.db")).status,404);
 const g=await say(L,"global","pour tous",fake.json.id);assert.equal(g.status,200);
 const rp=await media(R,fake.json.id);assert.equal(rp.status,200);assert.equal(rp.headers.get("content-type"),"image/png");
 const files=readdirSync(join(DIR,"chat-media"));assert.ok(files.includes(gif.json.id)&&files.includes(fake.json.id));
 // Three images waiting for their message at most; one posted frees a place.
 const H=await player(PORT,"Hamster","right"),ups=[];
 for(let i=0;i<3;i++)ups.push(await upload(H,GIF));
 assert.deepEqual(ups.map(u=>u.status),[200,200,200]);
 const full=await upload(H,GIF);assert.equal(full.status,429);assert.equal(full.json.error,"Envoie d'abord les images déjà préparées.");
 assert.equal((await say(H,"camp","",ups[0].json.id)).status,200);
 assert.equal((await upload(H,GIF)).status,200);
});

test("reports, own deletion, mutes",async t=>{
 const a=await player(PORT,"Auteur","left"),b=await player(PORT,"Lecteur","left"),r=await player(PORT,"Lointain","right");
 const open=[];t.after(()=>{for(const s of open)s.close();});
 const m=(await say(a,"camp","message douteux")).json.message;
 assert.equal((await a.call("POST","/api/chat/report",{id:m.id})).status,422);
 assert.equal((await b.call("POST","/api/chat/report",{id:m.id})).status,200);
 assert.equal((await b.call("POST","/api/chat/report",{id:m.id})).status,200);
 assert.equal((await r.call("POST","/api/chat/report",{id:m.id})).status,404,"cannot see it");
 assert.equal(DB.prepare("SELECT COUNT(*) AS n FROM chat_reports WHERE message_id=?").get(m.id).n,1);
 // Deletion: own only, removed for everyone watching, its image gone.
 const up=await upload(a,GIF),withImg=(await say(a,"camp","avec image",up.json.id)).json.message;
 const sb=stream(b);open.push(sb);await until(()=>sb.of("chatUnread").length);
 assert.equal((await b.call("POST","/api/chat/delete",{id:withImg.id})).status,403);
 assert.equal((await a.call("POST","/api/chat/delete",{id:withImg.id})).status,200);
 assert.ok(await until(()=>sb.of("chatDel").some(d=>d.id===withImg.id)));
 assert.ok(!(await list(b,"camp")).json.messages.some(x=>x.id===withImg.id));
 assert.equal((await media(a,up.json.id)).status,404);
 assert.equal((await a.call("POST","/api/chat/delete",{id:withImg.id})).status,404);
 // Muted: refused with the date, and said in the room view.
 const until_=Date.now()+3600e3;DB.prepare("INSERT INTO chat_mutes(player_id,until) VALUES(?,?)").run(idOf("Auteur"),until_);
 const mu=await say(a,"global","je parle");assert.equal(mu.status,403);assert.match(mu.json.error,/^Tu es privé de chat jusqu'au .+\d\d:\d\d\.$/);
 assert.equal((await list(a,"global")).json.mutedUntil,until_);
 const mup=await upload(a,GIF);assert.equal(mup.status,403);assert.match(mup.json.error,/^Tu es privé de chat jusqu'au /);
 DB.prepare("UPDATE chat_mutes SET until=? WHERE player_id=?").run(Date.now()-1,idOf("Auteur"));
 assert.equal((await say(a,"global","je reparle")).status,200);
});

test("retention: 7-day-old messages and their images go, unattached images after 1 h; a deleted account's messages go",async()=>{
 const a=await player(PORT,"Ancien","left"),b=await player(PORT,"Passant","left");
 const up=await upload(a,GIF),old=(await say(a,"global","vieux message",up.json.id)).json.message;
 const loose=await upload(a,PNG);
 DB.prepare("UPDATE chat_messages SET t=t-? WHERE id=?").run(8*864e5,old.id);
 DB.prepare("UPDATE chat_media SET t=t-? WHERE id=?").run(2*3600e3,loose.json.id);
 assert.ok(await until(async()=>!(await list(b,"global")).json.messages.some(x=>x.id===old.id)),"purged by the sweep");
 assert.ok(await until(async()=>(await media(a,up.json.id)).status===404&&(await media(a,loose.json.id)).status===404));
 assert.ok(!readdirSync(join(DIR,"chat-media")).includes(up.json.id));
 // A deleted account takes its messages and images with it.
 const g=await player(PORT,"Partant","right"),gi=await upload(g,GIF),gm=(await say(g,"global","au revoir",gi.json.id)).json.message;
 assert.equal((await g.call("DELETE","/api/account",{password:PW})).status,200);
 assert.ok(!(await list(b,"global")).json.messages.some(x=>x.id===gm.id));
 assert.equal(DB.prepare("SELECT COUNT(*) AS n FROM chat_media WHERE id=?").get(gi.json.id).n,0);
 assert.ok(await until(()=>!readdirSync(join(DIR,"chat-media")).includes(gi.json.id)));
});

// Direct unit calls: the admin view of an image and the deletion hook the server calls before removing a player.
test("admin.media gives a posted image as base64; beforePlayerDelete tells the open screens",async()=>{
 const {createChat}=await import(process.env.CHAT||"/app/chat.mjs");
 const dir=mkdtempSync(join(tmpdir(),"pgchatu-")),db=new DatabaseSync(join(dir,"u.db"));
 db.exec("PRAGMA foreign_keys=ON;CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO players(id,name) VALUES(1,'Un'),(2,'Deux');");
 const players=new Map([[1,{id:1,name:"Un",state:{camp:"left"}}],[2,{id:2,name:"Deux",state:{camp:"right"}}]]);
 const sent=[],clients=new Set([{res:"r1",playerId:1},{res:"r2",playerId:2}]);
 const chat=createChat({db,dataDir:dir,players,clients,sse:(res,ev,data)=>sent.push([res,ev,data]),auth(){},limited:()=>false,HttpError:Error,send(){},readJson(){},checkOrigin(){},clientIp(){}});
 const {writeFileSync}=await import("node:fs"),id="A".repeat(22),loose="B".repeat(22);
 for(const m of [id,loose]){writeFileSync(join(dir,"chat-media",m),GIF);db.prepare("INSERT INTO chat_media(id,player_id,t,type,bytes,used) VALUES(?,1,?,'image/gif',?,1)").run(m,Date.now(),GIF.length);}
 db.prepare("INSERT INTO chat_messages(room,player_id,t,text,media) VALUES('global',1,?,'',?)").run(Date.now(),id);
 db.prepare("INSERT INTO chat_messages(room,player_id,t,text) VALUES('left',1,?,'x')").run(Date.now());
 assert.deepEqual(chat.admin.media(id),{type:"image/gif",data:GIF.toString("base64")});
 assert.equal(chat.admin.media(loose),null,"not on any live message");
 assert.equal(chat.admin.media("../u.db"),null);
 const after=chat.beforePlayerDelete(1);db.prepare("DELETE FROM players WHERE id=1").run();chat.playerDeleted(1);after();
 assert.deepEqual(sent.filter(s=>s[1]==="chatDel").map(s=>[s[0],s[2].id]).sort(),[["r1",1],["r1",2],["r2",1]],"the camp message only to its camp");
 assert.equal(chat.admin.media(id),null);db.close();
});

// The rooms the organisation opens, switched live: route() driven directly with fake plumbing.
test("rooms switched off: refused, silent and unread 0; switched back on: history is back",async()=>{
 const {createChat}=await import(process.env.CHAT||"/app/chat.mjs");
 const dir=mkdtempSync(join(tmpdir(),"pgchatr-")),db=new DatabaseSync(join(dir,"r.db"));
 db.exec("PRAGMA foreign_keys=ON;CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO players(id,name) VALUES(1,'Un'),(2,'Deux'),(3,'Trois');");
 const players=new Map([[1,{id:1,name:"Un",state:{camp:"left"}}],[2,{id:2,name:"Deux",state:{camp:"left"}}],[3,{id:3,name:"Trois",state:{camp:"right"}}]]);
 const sent=[],clients=new Set([1,2,3].map(id=>({res:"r"+id,playerId:id})));
 class HttpError extends Error{constructor(s,m){super(m);this.status=s;}}
 let open={global:false,camp:false};
 const chat=createChat({db,dataDir:dir,players,clients,sse:(res,ev,data)=>sent.push({res,ev,data}),auth:req=>players.get(req.pid),limited:()=>false,HttpError,
  send:(res,status,body)=>{res.status=status;res.body=body;},readJson:async req=>req.body,checkOrigin(){},clientIp(){},rooms:()=>open});
 // One call: {status, body, headers}; a refusal comes back as its status and message.
 async function call(pid,method,path,body,{url=path,headers={},raw}={}){
  const req=raw?Object.assign(Readable.from([raw]),{pid,url,headers}):{pid,url,headers,body},res={writeHead(s,h){this.status=s;this.headers=h;},end(){}};
  try{assert.equal(await chat.route(req,res,path,method),true);}catch(e){if(!(e instanceof HttpError))throw e;return {status:e.status,body:{error:e.message}};}
  return {status:res.status,body:res.body,headers:res.headers};
 }
 const get=(pid,room)=>call(pid,"GET","/api/chat",undefined,{url:`/api/chat?room=${room}`});
 const CLOSED="Ce salon de discussion est fermé pour le moment.";
 const now=Date.now(),ins=db.prepare("INSERT INTO chat_messages(room,player_id,t,text,media) VALUES(?,?,?,?,?)");
 const mid="M".repeat(22);db.prepare("INSERT INTO chat_media(id,player_id,t,type,bytes,used) VALUES(?,1,?,'image/gif',?,1)").run(mid,now,GIF.length);
 (await import("node:fs")).writeFileSync(join(dir,"chat-media",mid),GIF);
 const g=Number(ins.run("global",1,now,"tous",null).lastInsertRowid),c=Number(ins.run("left",1,now,"gauche",mid).lastInsertRowid);
 // Everything closed (also the default when no rooms() is given).
 for(const r of [await get(2,"global"),await get(2,"camp"),await call(2,"POST","/api/chat",{room:"global",text:"x"}),await call(2,"POST","/api/chat",{room:"camp",text:"x"}),
  await call(2,"POST","/api/chat/report",{id:g}),await call(1,"POST","/api/chat/delete",{id:c}),await call(2,"POST","/api/chat/read",{room:"camp",id:c}),
  await call(1,"POST","/api/chat/media",undefined,{headers:{"content-type":"image/gif"},raw:GIF})])assert.deepEqual([r.status,r.body.error],[403,CLOSED]);
 assert.equal((await call(2,"GET",`/api/chat/media/${mid}`)).status,404);assert.equal((await call(1,"GET",`/api/chat/media/${mid}`)).status,404);
 chat.onStream({res:"r2"},players.get(2));assert.deepEqual(sent.pop(),{res:"r2",ev:"chatUnread",data:{global:0,camp:0}});
 // Global open, camps closed.
 open={global:true,camp:false};
 const gl=await get(2,"global");assert.equal(gl.status,200);assert.deepEqual(gl.body.messages.map(m=>m.text),["tous"]);
 assert.deepEqual(gl.body.unread,{global:1,camp:0});assert.deepEqual(gl.body.rooms,{global:true,camp:false});
 assert.equal((await get(2,"camp")).status,403);
 assert.equal((await call(2,"GET",`/api/chat/media/${mid}`)).status,404,"posted in a closed room");
 sent.length=0;
 assert.equal((await call(3,"POST","/api/chat",{room:"global",text:"salut"})).status,200);
 assert.deepEqual(sent.filter(s=>s.ev==="chat").map(s=>s.res).sort(),["r1","r2","r3"]);
 const up=await call(3,"POST","/api/chat/media",undefined,{headers:{"content-type":"image/png"},raw:PNG});assert.equal(up.status,200);
 assert.equal((await call(3,"GET",`/api/chat/media/${up.body.id}`)).status,200,"one's own upload while a room is open");
 // Camps reopened: the history is back, the image too, and live events flow for the camp room.
 open={global:true,camp:true};
 const cp=await get(2,"camp");assert.equal(cp.status,200);assert.deepEqual(cp.body.messages.map(m=>m.text),["gauche"]);assert.equal(cp.body.unread.camp,1);
 const img=await call(2,"GET",`/api/chat/media/${mid}`);assert.equal(img.status,200);assert.equal(img.headers["Content-Type"],"image/gif");
 assert.equal((await call(3,"GET",`/api/chat/media/${mid}`)).status,404,"still not the other camp's");
 // Camps closed again, global still open: camp messages make no live event and no unread count.
 open={global:true,camp:false};sent.length=0;
 ins.run("left",2,Date.now(),"en douce",null);
 assert.equal((await call(1,"POST","/api/chat/read",{room:"global",id:g})).status,200);
 assert.deepEqual(sent.filter(s=>s.ev==="chatUnread").map(s=>s.data),[{global:1,camp:0}]);
 assert.equal((await call(1,"POST","/api/chat",{room:"camp",text:"x"})).status,403);
 assert.equal(sent.filter(s=>s.ev==="chat").length,0);
 // Admin functions work whatever the switches.
 open={global:false,camp:false};
 assert.equal(chat.admin.deleteMessage(c),true);assert.equal(chat.admin.stats().messages7d,3);
 db.close();
});

// Image bombs: crafted headers only (a few dozen bytes claiming huge sizes or many frames).
const pngOf=(w,h)=>{const b=Buffer.from(PNG);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;};
const gifOf=(w,h,frames=1)=>{
 const head=Buffer.from("474946383961","hex"),scr=Buffer.alloc(7);scr.writeUInt16LE(w,0);scr.writeUInt16LE(h,2);
 const frame=Buffer.from("21f90400000000002c000000000100010000020244010" + "0","hex");
 return Buffer.concat([head,scr,...Array(frames).fill(frame),Buffer.from([0x3b])]);
};
const jpegOf=(w,h)=>{const sof=Buffer.from("ffc0001108000000000301220002110103110100","hex");sof.writeUInt16BE(h,5);sof.writeUInt16BE(w,7);
 return Buffer.concat([Buffer.from("ffd8ffe000104a46494600010100000100010000","hex"),sof,Buffer.from("ffda000c03010002110311003f00ffd9","hex")]);};
const chunk=(id,data)=>{const h=Buffer.alloc(8);h.write(id,0,"latin1");h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,data.length&1?Buffer.alloc(1):Buffer.alloc(0)]);};
const riff=chunks=>{const body=Buffer.concat([Buffer.from("WEBP","latin1"),...chunks]),h=Buffer.alloc(8);h.write("RIFF",0,"latin1");h.writeUInt32LE(body.length,4);return Buffer.concat([h,body]);};
const vp8=(w,h)=>{const d=Buffer.alloc(10);d[3]=0x9d;d[4]=0x01;d[5]=0x2a;d.writeUInt16LE(w,6);d.writeUInt16LE(h,8);return chunk("VP8 ",d);};
const vp8l=(w,h)=>{const d=Buffer.alloc(5);d[0]=0x2f;d.writeUInt32LE(((w-1)|((h-1)<<14))>>>0,1);return chunk("VP8L",d);};
const vp8x=(w,h,anim=false)=>{const d=Buffer.alloc(10);d[0]=anim?2:0;d.writeUIntLE(w-1,4,3);d.writeUIntLE(h-1,7,3);return chunk("VP8X",d);};

test("imageInfo reads the sizes and frames each format declares; bombs are refused",async()=>{
 const {imageInfo:I,imageRefusal:bad}=await import(process.env.CHAT||"/app/chat.mjs");
 assert.deepEqual(I(PNG,"image/png"),{w:1,h:1,frames:1});assert.deepEqual(I(GIF,"image/gif"),{w:1,h:1,frames:1});
 assert.deepEqual(I(pngOf(5000,5000),"image/png"),{w:5000,h:5000,frames:1});
 assert.deepEqual(I(gifOf(10,20,7),"image/gif"),{w:10,h:20,frames:7});
 assert.deepEqual(I(jpegOf(640,480),"image/jpeg"),{w:640,h:480,frames:1});
 assert.deepEqual(I(riff([vp8(300,200)]),"image/webp"),{w:300,h:200,frames:1});
 assert.deepEqual(I(riff([vp8l(1234,567)]),"image/webp"),{w:1234,h:567,frames:1});
 assert.deepEqual(I(riff([vp8x(4000,3000,true),...Array(5).fill(chunk("ANMF",Buffer.alloc(16)))]),"image/webp"),{w:4000,h:3000,frames:5});
 const TOO_BIG="Image trop grande (25 mégapixels au plus).",TOO_LONG="Animation trop longue (300 images au plus).";
 assert.equal(bad(pngOf(5000,5000),"image/png"),null,"exactly 25 megapixels");
 for(const [b,t] of [[pngOf(5001,5000),"image/png"],[pngOf(10001,1),"image/png"],[gifOf(65535,65535),"image/gif"],[jpegOf(6000,6000),"image/jpeg"],
  [riff([vp8x(16777216,1)]),"image/webp"],[riff([vp8(16383,16383)]),"image/webp"],[riff([vp8l(16384,2000)]),"image/webp"]])assert.deepEqual(bad(b,t),[422,TOO_BIG],t);
 // A GIF frame bigger than its logical screen counts too.
 const sneaky=gifOf(1,1);sneaky.writeUInt16LE(9000,13+8+5);sneaky.writeUInt16LE(9000,13+8+7);assert.deepEqual(bad(sneaky,"image/gif"),[422,TOO_BIG]);
 assert.equal(bad(gifOf(1,1,300),"image/gif"),null);assert.deepEqual(bad(gifOf(1,1,301),"image/gif"),[422,TOO_LONG]);
 assert.deepEqual(bad(riff([vp8x(10,10,true),...Array(301).fill(chunk("ANMF",Buffer.alloc(16)))]),"image/webp"),[422,TOO_LONG]);
 for(const [b,t] of [[PNG.subarray(0,20),"image/png"],[Buffer.from("ffd8ffd9","hex"),"image/jpeg"],[riff([chunk("XXXX",Buffer.alloc(4))]),"image/webp"],[pngOf(0,5),"image/png"]])
  assert.equal(bad(b,t)?.[0],415,t);
});

test("uploads: crafted bombs answer 422, a real-size image still goes",async()=>{
 const a=await player(PORT,"Artificier","left");
 for(const [b,t] of [[pngOf(20000,20000),"image/png"],[gifOf(1,1,301),"image/gif"],[jpegOf(9000,9000),"image/jpeg"]]){
  const r=await upload(a,b,t);assert.equal(r.status,422,t);assert.match(r.json.error,/^(Image trop grande|Animation trop longue)/);
 }
 const ok=await upload(a,jpegOf(1920,1080),"image/jpeg");assert.equal(ok.status,200);assert.equal(ok.json.type,"image/jpeg");
 // Zalgo in a message: 2 marks at most per letter.
 const M=String.fromCharCode(0x301,0x302,0x303,0x304,0x305);
 assert.equal((await say(a,"global","h"+M.repeat(20)+"é")).json.message.text,"h"+M.slice(0,2)+"é");
});
