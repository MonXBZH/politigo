// Admin operations over the socket (1.5.0): what the admin interface and the CLI drive. A real server on a temporary
// database, administered through its Unix socket; the database is also opened read/write from here to age schedules.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,statSync,existsSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {boot,stop,player,client,until,sleep,INVITE,PW,DAY_TZ} from "./server-helpers.mjs";

const PORT=3957,SPEED_PORT=3958,ADMIN=process.env.ADMIN||"/app/admin.mjs";
let proc,DIR,SOCK;
before(async()=>{
 DIR=mkdtempSync(join(tmpdir(),"pgops-"));SOCK=join(DIR,"admin.sock");
 proc=await boot(PORT,DIR,{POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_SERVER_NAME:"Serveur  des\tamis"});
});
after(async()=>{await stop(proc);});

function adm(obj,sock=SOCK){
 return new Promise((ok,ko)=>{
  const c=createConnection(sock);let text="";
  const t=setTimeout(()=>{c.destroy();ko(new Error("admin socket did not answer"));},8e3);
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{clearTimeout(t);try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const ok=async(obj,sock)=>{const r=await adm(obj,sock);assert.equal(r.ok,true,JSON.stringify(r));return r;};
function cli(...args){
 return new Promise((res,ko)=>{
  const p=spawn("node",[ADMIN,...args],{env:{...process.env,POLITIGO_ADMIN_SOCKET:SOCK},stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="";p.stdout.on("data",d=>{stdout+=d;});p.stderr.on("data",d=>{stderr+=d;});
  const t=setTimeout(()=>{p.kill();ko(new Error("admin CLI timed out"));},15e3);
  p.on("exit",code=>{clearTimeout(t);res({code,stdout,stderr});});
 });
}
function stream(c,port=PORT,ua){
 const ac=new AbortController(),events=[],s={events,closed:false,close:()=>ac.abort()};
 fetch(`http://127.0.0.1:${port}/events`,{headers:{Cookie:c.cookie,...(ua?{"User-Agent":ua}:{})},signal:ac.signal}).then(async r=>{
  s.status=r.status;
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
  s.closed=true;
 }).catch(()=>{s.closed=true;});
 return s;
}
const got=(s,ev)=>s.events.filter(e=>e.ev===ev).map(e=>e.data);
const loginAs=(name,password=PW,port=PORT)=>client(port).call("POST","/api/login",{name,password});
const audits=async()=>(await ok({cmd:"audit",limit:500})).items;
const BROWSER="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const WALL=tz=>new Intl.DateTimeFormat("en-GB",{timeZone:tz,hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"});
const wallOf=(ms,tz=DAY_TZ)=>{const o={};for(const x of WALL(tz).formatToParts(ms))o[x.type]=x.value;return o;};
const WEEKDAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

test("stats, list and the player sheet",async()=>{
 const a=await player(PORT,"Statistique");
 const s=await ok({cmd:"stats",via:"web"});
 assert.equal(s.name,"Serveur des amis","the server name is sanitised");
 for(const k of ["players","online","active24h","active7d","pushSubs","uptimeS","dbBytes","suspended"])assert.equal(typeof s[k],"number",k);
 assert.ok(s.players>=1&&s.dbBytes>0);
 assert.equal(s.event.mode,"auto");assert.equal(s.registrations.open,true);assert.equal(typeof s.chat,"object");
 const l=(await ok({cmd:"list"})).players.find(p=>p.name==="Statistique");
 assert.equal(l.camp,"left");assert.equal(l.lvl,1);assert.equal(l.suspended,false);assert.equal(l.online,false);assert.equal(l.chatMutedUntil,null);
 const byId=(await ok({cmd:"player",id:l.id})).player,byName=(await ok({cmd:"player",name:"STATISTIQUE"})).player;
 assert.equal(byId.id,byName.id);
 for(const k of ["candidate","xp","score","form","sat","moral","energy","hyg","fm","deaths","sessions","pushSubs","duels","activity"])assert.ok(k in byId,k);
 assert.equal(byId.sessions,1);assert.ok(!JSON.stringify(byId).includes("scrypt$"));
 assert.equal((await adm({cmd:"player",id:999999})).ok,false);
 const r=await cli("stats");assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/Serveur des amis/);assert.match(r.stdout,/Inscriptions : ouvertes/);
 await a.call("GET","/api/me");
});

test("signout closes every session and stream",async()=>{
 const a=await player(PORT,"Sortant");const s=stream(a);await until(()=>got(s,"me").length);
 assert.deepEqual(await ok({cmd:"signout",name:"sortant"}),{ok:true,name:"Sortant"});
 assert.ok(await until(()=>s.closed),"stream closed");
 assert.equal((await a.call("GET","/api/me")).status,401);
 assert.equal((await loginAs("Sortant")).status,200,"the password still works");
});

test("rename: the register rules apply, the new name logs in, screens are told",async()=>{
 const a=await player(PORT,"Ancien Nom");await player(PORT,"Pris Deja");
 const s=stream(a);await until(()=>got(s,"me").length);
 for(const [newName,re] of [["x",/3 à 20/],["Annonce officielle",/réservé/],["pris déjà",/déjà pris/]]){
  const r=await adm({cmd:"rename",name:"Ancien Nom",newName});assert.equal(r.ok,false,newName);assert.match(r.error,re);
 }
 assert.deepEqual(await ok({cmd:"rename",name:"ancien nom",newName:"  Nouveau   Nom "}),{ok:true,name:"Nouveau Nom",old:"Ancien Nom"});
 assert.ok(await until(()=>got(s,"me").some(m=>m.name==="Nouveau Nom")));
 assert.equal((await loginAs("Nouveau Nom")).status,200);assert.equal((await loginAs("Ancien Nom")).status,401);
 await ok({cmd:"rename",name:"Nouveau Nom",newName:"nouveau nom"});   // a change of case of one's own name is fine
 s.close();
});

test("suspension: login refused, hidden from board and opponents, open duels voided, then reinstated",async()=>{
 const a=await player(PORT,"Suspect"),b=await player(PORT,"Temoin","right");
 const ch=await b.call("POST","/api/duel",{op:"challenge",name:"Suspect"});assert.equal(ch.status,200,JSON.stringify(ch.json));
 const sa=stream(a),sb=stream(b);await until(()=>got(sa,"me").length&&got(sb,"me").length);
 const duelsBefore=(await ok({cmd:"duels-list"})).items.filter(d=>d.defender==="Suspect");assert.equal(duelsBefore.length,1);
 assert.deepEqual(await ok({cmd:"suspend",name:"Suspect",on:true,via:"web"}),{ok:true,name:"Suspect",suspended:true});
 assert.ok(await until(()=>sa.closed),"stream closed at suspension");
 assert.equal((await a.call("GET","/api/me")).status,401,"sessions deleted");
 const li=await loginAs("Suspect");assert.equal(li.status,403);assert.match(li.json.error,/suspendu/);
 assert.equal((await loginAs("Suspect","mauvais-mdp")).status,401,"a wrong password still says nothing more");
 const board=(await b.call("GET","/api/board")).json.board;assert.ok(!board.some(r=>r.name==="Suspect"));
 const duels=(await b.call("GET","/api/duels")).json;assert.ok(!duels.opponents.some(o=>o.name==="Suspect"));
 assert.equal((await b.call("POST","/api/duel",{op:"challenge",name:"Suspect"})).status,422);
 assert.equal((await ok({cmd:"duels-list"})).items.filter(d=>d.defender==="Suspect").length,0,"open duel voided");
 assert.ok(await until(()=>got(sb,"duel").some(d=>d.kind==="void")),"the other player is told");
 const st=await ok({cmd:"stats"});assert.ok(st.suspended>=1);
 assert.equal((await ok({cmd:"list"})).players.find(p=>p.name==="Suspect").suspended,true);
 await ok({cmd:"suspend",name:"Suspect",on:false});
 const back=client(PORT),r=await back.call("POST","/api/login",{name:"Suspect",password:PW});assert.equal(r.status,200);
 assert.ok((await b.call("GET","/api/board")).json.board.some(x=>x.name==="Suspect"));
 sb.close();
});

test("a suspended companion's clock is frozen, and reinstating it plays no time",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgops-speed-")),sock=join(dir,"admin.sock");
 const p=await boot(SPEED_PORT,dir,{POLITIGO_ADMIN_SOCKET:sock,POLITIGO_SPEED:"3600",POLITIGO_TZ:"Europe/Paris"});
 try{
  await player(SPEED_PORT,"Gele");await player(SPEED_PORT,"Vivant");
  const snap=async n=>{const x=(await ok({cmd:"player",name:n},sock)).player;return JSON.stringify([x.sat,x.moral,x.energy,x.hyg,x.fm,x.xp,x.deaths]);};
  await ok({cmd:"suspend",name:"Gele",on:true},sock);
  const g0=await snap("Gele"),v0=await snap("Vivant");
  await sleep(2500);   // two and a half game hours
  assert.equal(await snap("Gele"),g0,"nothing moved while suspended");
  assert.notEqual(await snap("Vivant"),v0,"the clock runs for the others");
  await ok({cmd:"suspend",name:"Gele",on:false},sock);
  assert.equal(await snap("Gele"),g0,"the suspension is skipped, not replayed");
  // DST-safe daily schedule in a real zone: the next run shows 09:00 on the Paris clock.
  const d=(await ok({cmd:"schedule-add",text:"Bonjour",target:{kind:"all"},kind:"daily",time:"09:00"},sock)).schedule;
  const w=wallOf(d.next,"Europe/Paris");assert.equal(`${w.hour}:${w.minute}`,"09:00");
  assert.ok(d.next>Date.now()&&d.next-Date.now()<=25*3600e3);
 }finally{await stop(p);}
});

test("event-set reaches the open screens' me payload",async()=>{
 const a=await player(PORT,"Citrouille");const s=stream(a);await until(()=>got(s,"me").length);
 assert.equal(got(s,"me")[0].event,"auto");
 const r=await ok({cmd:"event-set",mode:"halloween"});assert.deepEqual(r.event,{mode:"halloween",current:"halloween"});
 assert.ok(await until(()=>got(s,"me").some(m=>m.event==="halloween")),"pushed at once");
 assert.equal((await a.call("GET","/api/me")).json.event,"halloween");
 assert.equal((await adm({cmd:"event-set",mode:"noel"})).ok,false);
 await ok({cmd:"event-set",mode:"auto"});s.close();
});

test("announce to a camp: that camp's screens only, no public feed line; the CLI's --camp",async()=>{
 const g=await player(PORT,"Gauche Un","left"),d=await player(PORT,"Droite Un","right");
 const sg=stream(g),sd=stream(d);await until(()=>got(sg,"me").length&&got(sd,"me").length);
 const r=await ok({cmd:"announce",text:"Réunion de la gauche",camp:"left"});assert.equal(r.camp,"left");assert.equal(r.name,null);
 assert.ok(await until(()=>got(sg,"announce").length));
 await sleep(400);
 assert.equal(got(sd,"announce").length,0,"not the other camp");
 for(const s of [sg,sd])assert.ok(!got(s,"feed").flat().some(e=>e.kind==="announce"),"no feed line for a camp");
 assert.ok(!(await ok({cmd:"feed-list"})).items.some(e=>e.text==="Réunion de la gauche"));
 const c=await cli("announce","Réunion de la droite","--camp","droite");assert.equal(c.code,0,c.stderr);assert.match(c.stdout,/Annonce envoyée à la droite/);
 assert.ok(await until(()=>got(sd,"announce").length));assert.equal(got(sg,"announce").length,1);
 assert.equal((await cli("announce","x","--camp","centre")).code,2);
 const h=(await ok({cmd:"announce-history"})).items;
 assert.deepEqual(h.slice(0,2).map(x=>[x.via,x.target,x.text]),[["cli","droite","Réunion de la droite"],["cli","gauche","Réunion de la gauche"]]);
 sg.close();sd.close();
});

test("schedules: validation, once fires in the sweep, daily and weekly next runs, late runs skipped",async()=>{
 const a=await player(PORT,"Auditeur");const s=stream(a);await until(()=>got(s,"me").length);
 const now=Date.now();
 for(const bad of [{kind:"once",at:now-1000},{kind:"daily",time:"25:00"},{kind:"weekly",time:"10:00",days:[]},{kind:"monthly"},
  {kind:"once",at:now+60e3,target:{kind:"camp",camp:"centre"}},{kind:"daily",time:"10:00",until:now-1}]){
  const r=await adm({cmd:"schedule-add",text:"Test",target:{kind:"all"},...bad});assert.equal(r.ok,false,JSON.stringify(bad));
 }
 const once=(await ok({cmd:"schedule-add",text:"Rappel unique",target:{kind:"player",name:"auditeur"},kind:"once",at:now+800})).schedule;
 assert.deepEqual(once.target,{kind:"player",name:"Auditeur"});assert.equal(once.next,now+800);assert.equal(once.enabled,true);
 assert.ok(await until(()=>got(s,"announce").some(x=>x.text==="Rappel unique"),5000),"sent by the sweep");
 const after1=(await ok({cmd:"schedule-list"})).schedules.find(x=>x.id===once.id);
 assert.equal(after1.enabled,false);assert.ok(after1.last>=now);
 // Daily, two hours from now (rounded to the minute) on the game's clock.
 const w=wallOf(now+2*3600e3),time=`${w.hour}:${w.minute}`;
 const daily=(await ok({cmd:"schedule-add",text:"Rappel du jour",target:{kind:"all"},kind:"daily",time})).schedule;
 assert.ok(daily.next>now+2*3600e3-61e3&&daily.next<=now+2*3600e3,`${daily.next-now}`);
 const day=(WEEKDAYS.indexOf(wallOf(now).weekday)+2)%7;
 const weekly=(await ok({cmd:"schedule-add",text:"Rappel hebdo",target:{kind:"camp",camp:"left"},kind:"weekly",time:"10:00",days:[day]})).schedule;
 assert.equal(wallOf(weekly.next).weekday,WEEKDAYS[day]);assert.equal(`${wallOf(weekly.next).hour}:${wallOf(weekly.next).minute}`,"10:00");
 assert.deepEqual(weekly.days,[day]);
 // Time travel by the database: one run just due, one missed two hours ago.
 const db=new DatabaseSync(join(DIR,"t.db"),{timeout:5000});
 try{
  db.prepare("UPDATE schedules SET next=? WHERE id=?").run(Date.now()-1000,daily.id);
  db.prepare("UPDATE schedules SET next=? WHERE id=?").run(Date.now()-2*3600e3,weekly.id);
 }finally{db.close();}
 assert.ok(await until(()=>got(s,"announce").some(x=>x.text==="Rappel du jour"),5000));
 await sleep(600);
 assert.ok(!got(s,"announce").some(x=>x.text==="Rappel hebdo"),"a run missed by more than 30 min is not sent late");
 const list=(await ok({cmd:"schedule-list"})).schedules;
 const d2=list.find(x=>x.id===daily.id),w2=list.find(x=>x.id===weekly.id);
 assert.ok(d2.enabled&&d2.last>now);assert.equal(d2.next,daily.next,"the next run is the same wall time, still ahead");
 assert.ok(w2.enabled&&w2.next>Date.now()&&w2.last===null);
 await ok({cmd:"schedule-toggle",id:daily.id,enabled:false});
 assert.equal((await ok({cmd:"schedule-list"})).schedules.find(x=>x.id===daily.id).enabled,false);
 assert.equal((await adm({cmd:"schedule-toggle",id:once.id,enabled:true})).ok,false,"a once in the past cannot be switched back on");
 await ok({cmd:"schedule-delete",id:weekly.id});
 assert.ok(!(await ok({cmd:"schedule-list"})).schedules.some(x=>x.id===weekly.id));
 assert.equal((await adm({cmd:"schedule-delete",id:weekly.id})).ok,false);
 const h=(await ok({cmd:"announce-history"})).items.filter(x=>x.via==="schedule").map(x=>x.text);
 assert.ok(h.includes("Rappel unique")&&h.includes("Rappel du jour"));
 s.close();
});

test("backup: a readable SQLite copy next to the socket, private, with vapid.json on request",async()=>{
 const r=await ok({cmd:"backup",vapid:true});
 assert.equal(dirname(r.path),DIR);assert.match(r.path,/backup-\d+\.db$/);
 const st=statSync(r.path);assert.equal(st.size,r.bytes);assert.equal(st.mode&0o777,0o600);
 assert.equal(readFileSync(r.path).subarray(0,16).toString("latin1"),"SQLite format 3\0");
 const copy=new DatabaseSync(r.path,{readOnly:true});
 try{assert.ok(copy.prepare("SELECT COUNT(*) AS n FROM players").get().n>=5);}finally{copy.close();}
 assert.equal(typeof r.vapid,"object");assert.ok(r.vapid.publicKey||Object.keys(r.vapid).length);
 const plain=await ok({cmd:"backup"});assert.ok(!("vapid" in plain));
 assert.ok(existsSync(plain.path));
});

test("activity log and bot report: a headless script stands out from a player at their screen",async()=>{
 const bot=await player(PORT,"Robot Zelé"),human=await player(PORT,"Humaine");
 for(let i=0;i<8;i++){
  await fetch(`http://127.0.0.1:${PORT}/api/action`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:bot.cookie,"User-Agent":"curl/8.5.0"},body:JSON.stringify({type:"rien"})});
 }
 await bot.call("POST","/api/duel",{op:"accept",id:999999});
 const sh=stream(human,PORT,BROWSER);await until(()=>got(sh,"me").length);
 for(let i=0;i<8;i++){
  await fetch(`http://127.0.0.1:${PORT}/api/action`,{method:"POST",headers:{"Content-Type":"application/json",Cookie:human.cookie,"User-Agent":BROWSER},body:JSON.stringify({type:"rien"})});
 }
 const items=(await ok({cmd:"bots"})).items;
 const rb=items.find(x=>x.name==="Robot Zelé"),rh=items.find(x=>x.name==="Humaine");
 assert.equal(rb.actions14d,9,"8 actions and 1 duel request");assert.equal(rb.noLiveShare,1);assert.ok(rb.nonBrowserShare>0.8);
 assert.ok(rb.score>=40,JSON.stringify(rb));assert.ok(rb.reasons.some(x=>/sans écran/.test(x)));assert.ok(rb.reasons.some(x=>/curl/.test(x)));
 assert.equal(rh.score,0,JSON.stringify(rh));assert.equal(rh.noLiveShare,0);assert.equal(rh.nonBrowserShare,0);
 assert.equal(rh.byHour.reduce((a,b)=>a+b,0),8);assert.equal(rh.byHour.length,24);
 assert.ok(items.indexOf(rb)<items.indexOf(rh),"most suspicious first");
 const sheet=(await ok({cmd:"player",name:"Robot Zelé"})).player;assert.equal(sheet.activity.score,rb.score);
 sh.close();
});

test("feed-delete refreshes every screen; duel-cancel voids an open duel without touching gauges",async()=>{
 const a=await player(PORT,"Duelliste A"),b=await player(PORT,"Duelliste B","right");
 const sa=stream(a);await until(()=>got(sa,"feedInit").length);
 const items=(await ok({cmd:"feed-list",limit:5})).items;assert.ok(items.length&&items.every(x=>Number.isInteger(x.id)));
 const victim=items[0];
 await ok({cmd:"feed-delete",id:victim.id});
 assert.ok(await until(()=>got(sa,"feedInit").length>=2));
 assert.ok(!got(sa,"feedInit").at(-1).some(e=>e.id===victim.id));
 assert.equal((await adm({cmd:"feed-delete",id:victim.id})).ok,false);
 const ch=await a.call("POST","/api/duel",{op:"challenge",name:"Duelliste B"});assert.equal(ch.status,200);
 const before=(await ok({cmd:"player",name:"Duelliste A"})).player;
 const open=(await ok({cmd:"duels-list"})).items.find(d=>d.id===ch.json.duel.id);
 assert.deepEqual([open.challenger,open.defender,open.status],["Duelliste A","Duelliste B","c_play"]);
 await ok({cmd:"duel-cancel",id:open.id});
 assert.ok(await until(()=>got(sa,"duel").some(d=>d.id===open.id&&d.kind==="void")));
 assert.ok(!(await ok({cmd:"duels-list"})).items.some(d=>d.id===open.id));
 const afterP=(await ok({cmd:"player",name:"Duelliste A"})).player;
 assert.equal(afterP.moral,before.moral);assert.equal(afterP.duels[0].status,"void");
 assert.equal((await adm({cmd:"duel-cancel",id:open.id})).ok,false);
 sa.close();
});

test("chat rooms: off by default, each switched on its own, screens told at once; the CLI's chat",async()=>{
 const a=await player(PORT,"Causeur");const s=stream(a);await until(()=>got(s,"me").length);
 assert.deepEqual(got(s,"me")[0].chat,{global:false,camp:false});
 assert.deepEqual((await ok({cmd:"stats"})).chatRooms,{global:false,camp:false});
 for(const bad of [{},{global:"oui"},{camp:1},{global:true,camp:null}])assert.equal((await adm({cmd:"chat-set",...bad})).ok,false,JSON.stringify(bad));
 assert.deepEqual((await ok({cmd:"chat-set",global:true,via:"web"})).chat,{global:true,camp:false});
 assert.ok(await until(()=>got(s,"me").some(m=>m.chat?.global===true&&m.chat.camp===false)));
 assert.deepEqual((await ok({cmd:"chat-set",camp:true})).chat,{global:true,camp:true});
 assert.deepEqual((await ok({cmd:"chat-set",global:false})).chat,{global:false,camp:true});
 assert.deepEqual((await a.call("GET","/api/me")).json.chat,{global:false,camp:true});
 let c=await cli("chat");assert.equal(c.code,0,c.stderr);assert.match(c.stdout,/pour tous : fermé · chat de camp : ouvert/);
 c=await cli("chat","on");assert.equal(c.code,0,c.stderr);assert.deepEqual((await ok({cmd:"stats"})).chatRooms,{global:true,camp:true});
 c=await cli("chat","off","--camp");assert.match(c.stdout,/pour tous : ouvert · chat de camp : fermé/);
 c=await cli("chat","off","--global");assert.deepEqual((await ok({cmd:"stats"})).chatRooms,{global:false,camp:false});
 assert.equal((await cli("chat","peut-etre")).code,2);assert.equal((await cli("chat","on","--partout")).code,2);
 const rows=(await audits()).filter(x=>x.cmd==="chat-set").map(x=>x.detail);
 assert.ok(rows.includes("Chat pour tous activé")&&rows.includes("Chat de camp désactivé"));
 s.close();
});

test("POLITIGO_CHAT only sets the starting point",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgops-chat-")),sock=join(dir,"admin.sock");
 let p=await boot(SPEED_PORT,dir,{POLITIGO_ADMIN_SOCKET:sock,POLITIGO_CHAT:"camp"});
 try{
  assert.deepEqual((await ok({cmd:"stats"},sock)).chatRooms,{global:false,camp:true});
  await ok({cmd:"chat-set",camp:false},sock);
 }finally{await stop(p);}
 p=await boot(SPEED_PORT,dir,{POLITIGO_ADMIN_SOCKET:sock,POLITIGO_CHAT:"on"});
 try{assert.deepEqual((await ok({cmd:"stats"},sock)).chatRooms,{global:true,camp:false},"the saved choice wins, the env fills the rest");}
 finally{await stop(p);}
});

test("chat hooks: reports, delete and mute go through chat.admin",async()=>{
 await player(PORT,"Bavard");
 assert.ok(Array.isArray((await ok({cmd:"chat-reports"})).items));
 assert.equal((await adm({cmd:"chat-delete",id:987654})).ok,false);
 assert.equal((await adm({cmd:"chat-media",id:"AAAAAAAAAAAAAAAAAAAAAA"})).ok,false);
 const m=await ok({cmd:"chat-mute",name:"Bavard",hours:2});assert.equal(m.name,"Bavard");assert.ok(m.until>Date.now()+3600e3);
 assert.equal((await ok({cmd:"chat-mute",name:"Bavard",hours:0})).until,null);
 assert.equal((await adm({cmd:"chat-mute",name:"Bavard",hours:-1})).ok,false);
});

// Last but one: the regenerated code no longer matches the helpers' INVITE.
test("registrations closed, the invite regenerated, the CLI's invite command; players never see the code",async()=>{
 const a=await player(PORT,"Parrain");
 assert.equal((await a.call("GET","/api/invite")).status,404,"no in-game route for the code");
 assert.deepEqual(await ok({cmd:"invite-get"}),{ok:true,invite:INVITE,source:"env",open:true});
 let c=await cli("invite");assert.equal(c.code,0,c.stderr);assert.ok(c.stdout.includes(INVITE));
 assert.equal((await client(PORT).call("POST","/api/register",{name:"Filleul Un",password:PW,invite:INVITE,camp:"left"})).status,201);
 await ok({cmd:"registrations-set",open:false});
 const closed=await client(PORT).call("POST","/api/register",{name:"Refuse",password:PW,invite:INVITE,camp:"left"});
 assert.equal(closed.status,403);assert.match(closed.json.error,/inscriptions sont fermées/);
 assert.equal((await ok({cmd:"stats"})).registrations.open,false);assert.equal((await ok({cmd:"invite-get"})).open,false);
 c=await cli("invite");assert.equal(c.code,0,c.stderr);assert.match(c.stdout,/Inscriptions fermées/);
 await ok({cmd:"registrations-set",open:true});
 const {invite}=await ok({cmd:"invite-regenerate",via:"web"});
 assert.match(invite,/^politigo-[\w-]{16}$/);
 assert.deepEqual(await ok({cmd:"invite-get"}),{ok:true,invite,source:"admin",open:true});
 c=await cli("invite");assert.ok(c.stdout.includes(invite));assert.ok(!c.stdout.includes(INVITE));
 assert.equal((await client(PORT).call("POST","/api/register",{name:"Ancien Code",password:PW,invite:INVITE,camp:"left"})).status,403);
 assert.equal((await client(PORT).call("POST","/api/register",{name:"Nouveau Code",password:PW,invite,camp:"right"})).status,201);
 assert.ok(!JSON.stringify(await audits()).includes(invite),"the code never lands in the admin log");
});

test("the admin log records every mutating command, never a password",async()=>{
 await ok({cmd:"reset-password",name:"Bavard",password:"secret-tres-long-1",via:"web"});
 const items=await audits(),cmds=new Set(items.map(x=>x.cmd));
 for(const c of ["signout","rename","suspend","announce","schedule-add","schedule-toggle","schedule-delete","feed-delete","duel-cancel",
  "invite-regenerate","registrations-set","event-set","backup","chat-mute","reset-password"])assert.ok(cmds.has(c),c);
 assert.ok(!JSON.stringify(items).includes("secret-tres-long-1"));
 const reset=items.find(x=>x.cmd==="reset-password");assert.equal(reset.via,"web");assert.equal(reset.target,"Bavard");
 assert.ok(items.some(x=>x.via==="cli"));
 for(const x of items)assert.deepEqual(Object.keys(x).sort(),["cmd","detail","t","target","via"]);
 assert.equal((await ok({cmd:"audit",limit:2})).items.length,2);
});
