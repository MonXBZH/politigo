// Chat (server/chat.mjs) on a real server: rooms per camp, live events per recipient, images, reports, deletion,
// mutes, retention. The database is touched directly (node:sqlite) to backdate rows or mute, as an admin would.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until,PW} from "./server-helpers.mjs";

const PORT=3888,BASE=`http://127.0.0.1:${PORT}`;
let proc,DB,DIR;
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pgchat-"));proc=await boot(PORT,DIR);DB=new DatabaseSync(join(DIR,"t.db"),{timeout:5000});});
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
