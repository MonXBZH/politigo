// The admin commands after the 1.7.1 audit, on a real server through its admin socket: the log that a flood cannot
// empty, another moderator's account, the right to launch an event, the protection that a rename does not lift,
// a series that keeps its time (launched early, across the spring DST gap), the clearer refusals.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until} from "./server-helpers.mjs";

const PORT=3820,H=36e5;
let dir,SOCK,proc,db;
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const mod=(o,extra={})=>adm({...o,by:"Modo",...extra});
const idOf=name=>db.prepare("SELECT id FROM players WHERE name=?").get(name)?.id;
const save=(o={},as=adm)=>{const s=Date.now()+H;return as({cmd:"event-save",type:"soldes",name:"Soldes",msg:"Tout à moitié prix.",params:{off:50},starts:s,ends:s+2*H,who:"all",rep:"",push:false,reminds:[],...o});};

before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pgcf-"));SOCK=join(dir,"admin.sock");
 proc=await boot(PORT,dir,{POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_TZ:"Europe/Paris"});
 db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
});
after(async()=>{try{db.close();}catch{}await stop(proc);});

test("the same command repeated is one row ×N; a flood of small ones never pushes a suspension out of the log",async()=>{
 await player(PORT,"Muet","left");await player(PORT,"Fautif","right");const id=idOf("Muet");
 for(let i=0;i<25;i++)assert.equal((await mod({cmd:"chat-mute",id,hours:0})).ok,true);
 const rows=(await adm({cmd:"audit",limit:500})).items.filter(x=>x.cmd==="chat-mute"&&x.target==="Muet");
 assert.equal(rows.length,1,"one row");assert.equal(rows[0].detail,"Chat rétabli (×25)");assert.equal(rows[0].actor,"Modo");
 assert.equal((await mod({cmd:"suspend",id:idOf("Fautif"),on:true})).ok,true);
 // 1200 small rows after it (written straight in: the socket would take a while), then one more through the server.
 const ins=db.prepare("INSERT INTO admin_log(t,via,cmd,target,detail,actor) VALUES(?,?,?,?,?,?)"),t=Date.now();
 db.exec("BEGIN");for(let i=0;i<1200;i++)ins.run(t,"web","chat-mute","Muet",i%2?"Chat rétabli":"Chat coupé 1 h","Modo");db.exec("COMMIT");
 assert.equal((await mod({cmd:"chat-mute",id,hours:2})).ok,true);
 assert.ok(db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE cmd='chat-mute'").get().n<=1000,"the small ones are trimmed");
 const items=(await adm({cmd:"audit",limit:500})).items,s=items.find(x=>x.cmd==="suspend");
 assert.ok(s,"the suspension is still shown");assert.equal(s.target,"Fautif");assert.equal(s.detail,"Compte suspendu");
 assert.equal(items.length,500,"the limit holds, a fifth of it kept for the weighty rows");assert.ok(items.every((x,i)=>!i||items[i-1].t>=x.t),"newest first");
});

test("a moderator cannot act on another moderator's game account; the owner can",async()=>{
 await player(PORT,"Collegue","left");const c=idOf("Collegue"),mods=[c];
 for(const o of [{cmd:"rename",newName:"Renomme"},{cmd:"suspend",on:true},{cmd:"signout"},{cmd:"chat-mute",hours:1},{cmd:"reset-password",password:"nouveaumotdepasse"},
  {cmd:"unlock"},{cmd:"abandoned-ignore"},{cmd:"player-delete",confirm:"Collegue"}]){
  const r=await mod({...o,id:c},{mods});assert.equal(r.ok,false,o.cmd);assert.match(r.error,/modérateur/,o.cmd);
 }
 assert.equal(db.prepare("SELECT name,suspended FROM players WHERE id=?").get(c).name,"Collegue");
 assert.equal((await adm({cmd:"signout",id:c,mods})).ok,true,"the owner");
 assert.equal((await mod({cmd:"signout",id:idOf("Muet")},{mods})).ok,true,"a player who is not one");
});

test("with events-edit alone, a start already reached does not launch the event; the owner keeps the minute of grace",async()=>{
 const now=Date.now();
 const r=await save({starts:now,ends:now+H},mod);assert.equal(r.ok,false);assert.match(r.error,/Lancer maintenant/);
 // Nor a second (or a minute) away: a moderator plans 5 minutes ahead at least.
 for(const ahead of [1000,60e3,4*6e4]){const s=await save({starts:now+ahead,ends:now+ahead+H},mod);assert.equal(s.ok,false,`${ahead} ms ahead`);assert.match(s.error,/5 minutes/);}
 const a=await save({},mod);assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.event.state,"soon");
 const e=await save({id:a.event.id,starts:Date.now()-1000,ends:Date.now()+H},mod);assert.equal(e.ok,false,"nor by moving a planned one");
 assert.equal((await adm({cmd:"events-list"})).items.find(x=>x.id===a.event.id).state,"soon");
 const o=await save({starts:Date.now()-1000,ends:Date.now()+H});assert.equal(o.ok,true,"the owner");assert.equal(o.event.state,"on");
 for(const x of (await adm({cmd:"events-list"})).items){if(x.state==="on")await adm({cmd:"event-stop",id:x.id});if(x.state==="soon")await adm({cmd:"event-delete",id:x.id});}
});

test("a feed line stays protected once its author is renamed; alerts-ack and planned announcements follow the protection",async()=>{
 await player(PORT,"Proto","left");const id=idOf("Proto");
 assert.equal((await adm({cmd:"player-protect",id,on:true})).ok,true);
 const line=Number(db.prepare("INSERT INTO feed(t,player,kind,text) VALUES(?,?,?,?)").run(Date.now(),"Proto","level","Proto passe niveau 2").lastInsertRowid);
 assert.equal((await adm({cmd:"rename",id,newName:"Proto2"})).ok,true);
 assert.equal(db.prepare("SELECT player FROM feed WHERE id=?").get(line).player,"Proto2","the line follows the name");
 const f=await mod({cmd:"feed-delete",id:line});assert.equal(f.ok,false);assert.match(f.error,/protégé/);
 // An alert about the protected account: shown to a moderator without the button, refused if sent anyway; logged when filed.
 // Proto's Flamme is 0: any sweep (every 200 ms) may send the staff back to the urn and the alert with it. The checks
 // count only when the row was still there after them (a released row never comes back by itself): else again.
 const key=`mythic:baton:${id}`,still=()=>!!db.prepare("SELECT 1 FROM mythics WHERE item='baton' AND player_id=?").get(id);
 let seen,byMod,byOwner,log;
 for(let i=0;;i++){
  assert.ok(i<20,"the staff stays long enough once in 20 tries");
  db.prepare("DELETE FROM admin_acks WHERE key=?").run(key);   // filed by the owner in a try that did not count
  db.prepare("INSERT OR REPLACE INTO mythics(item,player_id,t) VALUES('baton',?,?)").run(id,Date.now());
  seen=(await mod({cmd:"alerts"})).items.find(x=>x.key===key);
  byMod=await mod({cmd:"alerts-ack",keys:[key]});byOwner=await adm({cmd:"alerts-ack",keys:[key]});
  log=(await adm({cmd:"audit"})).items.find(x=>x.cmd==="alerts-ack");
  if(still())break;
 }
 assert.ok(seen,"the moderator sees it");assert.equal(seen.noAck,true);
 assert.equal(byMod.ok,false);
 assert.equal(byOwner.ok,true,"the owner");
 assert.ok(log,"logged");assert.match(log.detail,/Proto2 a gagné le Bâton de feu/);
 db.prepare("DELETE FROM mythics WHERE item='baton'").run();
 const s=await adm({cmd:"schedule-add",text:"Pour toi",target:{kind:"player",id},kind:"daily",time:"10:00"});assert.equal(s.ok,true,JSON.stringify(s));
 const sid=(await adm({cmd:"schedule-list"})).schedules.at(-1).id;
 assert.equal((await mod({cmd:"schedule-toggle",id:sid,enabled:false})).ok,false);assert.equal((await mod({cmd:"schedule-delete",id:sid})).ok,false);
 assert.equal((await adm({cmd:"schedule-delete",id:sid})).ok,true);
});

test("a series launched early keeps its time, and the spring DST gap does not move it for good (Europe/Paris)",async()=>{
 // 27/03/2027 at 02:30 in Paris (01:30Z); the night after, 02:30 does not exist: that run is at 03:30, the next ones at 02:30 again.
 const s=Date.UTC(2027,2,27,1,30),a=await save({rep:"day",starts:s,ends:s+H,name:"Nuit blanche"});assert.equal(a.ok,true,JSON.stringify(a));
 const next=async id=>{assert.equal((await adm({cmd:"event-start",id})).ok,true);assert.equal((await adm({cmd:"event-stop",id})).ok,true);
  return (await adm({cmd:"events-list"})).items.find(x=>x.state==="soon"&&x.name==="Nuit blanche");};
 const b=await next(a.event.id);assert.equal(b.starts,Date.UTC(2027,2,28,1,30),"03:30 CEST, the gap");assert.equal(b.ends-b.starts,H);
 const c=await next(b.id);assert.equal(c.starts,Date.UTC(2027,2,29,0,30),"02:30 CEST again");
 assert.equal((await adm({cmd:"event-delete",id:c.id})).ok,true);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'eventSlot:%'").get().n,0,"nothing left behind");
});

test("refusals that say what is wrong: 24 h repeated daily, no mini-game ticked, a mute without a duration",async()=>{
 const s=Date.now()+H;
 const d=await save({rep:"day",starts:s,ends:s+24*H});assert.equal(d.ok,false,"as long as the gap: the next day would be skipped");
 for(const cmd of ["event-save","event-preview"]){
  const r=await save({cmd,type:"xp",params:{mult:2,games:[]}});assert.equal(r.ok,false);assert.equal(r.error,"Choisis au moins un mini-jeu.");
 }
 assert.equal((await save({type:"zz"})).error,"Type ou réglages de l'événement non valables.");
 const id=idOf("Muet");assert.equal((await adm({cmd:"chat-mute",id,hours:5})).ok,true);
 for(const hours of ["",null,undefined," "]){const r=await adm({cmd:"chat-mute",id,hours});assert.equal(r.ok,false,JSON.stringify(hours));}
 const p=(await adm({cmd:"list"})).players.find(x=>x.id===id);assert.ok(p.chatMutedUntil>Date.now(),"still muted");
});

test("{delai} in the start announcement says 0 minute, not 1",async()=>{
 const s=Date.now()+H;
 const r=await save({cmd:"event-preview",ann:"{nom} dans {delai}",starts:s,ends:s+H});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.ann,"Soldes dans 0 minute");
 const live=await save({now:true,push:true,ann:"{nom} part dans {delai}",name:"Tout de suite"});assert.equal(live.ok,true,JSON.stringify(live));
 assert.ok(await until(()=>db.prepare("SELECT text FROM feed WHERE text LIKE 'Tout de suite part%'").get()?.text==="Tout de suite part dans 0 minute"));
 await adm({cmd:"event-stop",id:live.event.id});
});
