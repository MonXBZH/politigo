// Bot detection 1.7.1 on a real server (node --test): reaction delays measured by the server (activity.lag, its
// migration), the bot report v2 (timing signals against the group, two families for an alert, the night and the full
// bonus weighing less), the Bâton duels in the mythic eligibility, and what the admin's player sheet shows.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";
import {boot,stop,player as reg,until,sleep,debateTurn} from "./server-helpers.mjs";

// F: a fast clock (missions and letters in seconds); A: the usual clock, rows written by the test.
const F={port:3840},A={port:3841};
async function start(s,extra={}){
 s.dir=mkdtempSync(join(tmpdir(),"pgbd-"));s.sock=join(s.dir,"admin.sock");
 s.proc=await boot(s.port,s.dir,{POLITIGO_ADMIN_SOCKET:s.sock,...extra});
 s.db=new DatabaseSync(join(s.dir,"t.db"),{timeout:5000});
}
before(async()=>{await Promise.all([start(F,{POLITIGO_SPEED:"600"}),start(A)]);});
after(async()=>{for(const s of [F,A]){try{s.db.close();}catch{}await stop(s.proc);}});

function adm(s,obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(s.sock);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const ok=async(s,obj)=>{const r=await adm(s,obj);assert.equal(r.ok,true,JSON.stringify(r));return r;};
const idOf=(s,name)=>s.db.prepare("SELECT id FROM players WHERE name=?").get(name).id;
const lagOf=(s,id,kind)=>s.db.prepare("SELECT lag FROM activity WHERE player_id=? AND kind=? ORDER BY t DESC LIMIT 1").get(id,kind)?.lag;
const state=async c=>(await c.call("GET","/api/me")).json.state;
// The oldest letter waiting, whatever shape the mail rules keep (one letter, or a box of them).
const letterOf=S=>S.mail?.letter??null;

test("reaction delays: letter, mission report, visit, free draw and duel acceptance, on the server's clock",async()=>{
 const c=await reg(F.port,"Lettres Vite"),id=idOf(F,"Lettres Vite");
 // A visit (the first paid one of the day): its delay runs from the window's opening, never from the client.
 assert.equal((await c.call("POST","/api/action",{type:"buy",key:"bread"})).status,200);
 const v=lagOf(F,id,"buy");assert.ok(Number.isFinite(v)&&v>=0,`visit lag ${v}`);
 // The free draw: from midnight, game clock, in real ms (speed 600).
 assert.equal((await c.call("POST","/api/action",{type:"draw",pay:"free"})).status,200);
 const S0=await state(c),mid=(R.curIdx(S0)-R.hodOf(R.curIdx(S0)))*R.H,d=lagOf(F,id,"draw");
 assert.ok(Math.abs(d-(S0.vclock-mid)/600)<5000,`draw lag ${d} vs ${(S0.vclock-mid)/600}`);
 // A mission of 30 min (3 s here), reported about a second after its end.
 assert.equal((await c.call("POST","/api/action",{type:"missionStart",id:"tract"})).status,200);
 const end=(await state(c)).missions.cur.end;
 assert.ok(await until(async()=>(await state(c)).vclock>=end+600*1000,15000),"mission over");
 assert.equal((await c.call("POST","/api/action",{type:"missionReport"})).status,200);
 const m=lagOf(F,id,"missionReport");assert.ok(m>=800&&m<5000,`mission lag ${m}`);
 // A letter, answered about a second after it came in.
 const l=await until(async()=>letterOf(await state(c)),30000);assert.ok(l,"a letter came");
 await sleep(1000);
 const S1=await state(c),choice=0;
 assert.equal((await c.call("POST","/api/action",{type:"mailAnswer",id:l.id,choice})).status,200,"answered");
 const ml=lagOf(F,id,"mailAnswer");assert.ok(ml>=800&&ml<(S1.vclock-l.t)/600+3000,`mail lag ${ml}`);
 // A letter that waited behind another counts from the previous answer (when it came to the head), not from its slot.
 const two=await until(async()=>{const S=await state(c);return S.mail.queue?.length>=1&&S;},30000);assert.ok(two,"two letters waiting");
 await sleep(2000);
 assert.equal((await c.call("POST","/api/action",{type:"mailAnswer",id:two.mail.letter.id,choice:0})).status,200);
 await sleep(300);
 const S2=await state(c),nx=S2.mail.letter;assert.ok(nx&&(S2.vclock-nx.t)/600>1500,"the second letter came in a while ago");
 assert.equal((await c.call("POST","/api/action",{type:"mailAnswer",id:nx.id,choice:0})).status,200);
 const l2=lagOf(F,id,"mailAnswer");assert.ok(l2>=250&&l2<1200,`queued letter lag ${l2}`);
 // Actions with nothing set off by the server keep no delay.
 assert.equal(lagOf(F,id,"missionStart"),null);
});

test("duel acceptance: the delay since the challenge was sent",async()=>{
 const a=await reg(A.port,"Defi Lanceur"),b=await reg(A.port,"Defi Recu");
 const r=await a.call("POST","/api/duel",{op:"challenge",name:"Defi Recu"});assert.equal(r.status,200,JSON.stringify(r.json));
 await debateTurn(a,r.json.duel.id,{n:1});   // the challenge reaches the defender once the challenger has played
 await sleep(400);
 assert.equal((await b.call("POST","/api/duel",{op:"accept",id:r.json.duel.id})).status,200);
 const l=lagOf(A,idOf(A,"Defi Recu"),"duel:accept");assert.ok(l>=350&&l<5000,`lag ${l}`);
});

// Rows of a whole past day k (1 = yesterday), at hh:mm game time, written straight into the log.
const H=R.H,now0=Date.now(),idx0=Math.floor(now0/H),midnight=(idx0-R.hodOf(idx0))*H;
const at=(k,h,min=0,s=0)=>midnight-k*864e5+h*H+min*6e4+s*1000;
function rows(s,id,list){const ins=s.db.prepare("INSERT INTO activity(player_id,t,kind,live,ua,lag) VALUES(?,?,?,?,?,?)");for(const r of list)ins.run(id,r.t,r.kind,r.live??1,r.ua??"browser",r.lag??null);}
let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};

test("bot report v2: a very active but irregular human is not alerted, a regular script is, a night-owl ace no more",async()=>{
 for(const n of ["Humain Actif","Humain Calme","Script Regulier","Couche Tard"])await reg(A.port,n);
 const hum=idOf(A,"Humain Actif"),calm=idOf(A,"Humain Calme"),bot=idOf(A,"Script Regulier"),owl=idOf(A,"Couche Tard");
 const human=[],quiet=[],script=[],night=[];
 for(let k=1;k<=12;k++){
  // The human: on most days, lots of play, but late mornings, long lunches, a few notification-fast answers.
  const start=7+Math.floor(rnd()*4),gapDay=k%3===0;
  for(let h=start,v=0;h<23&&v<8;h+=2+Math.floor(rnd()*2),v++){
   if(gapDay&&h>=12&&h<17)continue;
   human.push({t:at(k,h,Math.floor(rnd()*50)),kind:"pet",lag:Math.round((60+rnd()*3000)*1000)});
  }
  for(let j=0;j<12;j++)human.push({t:at(k,8+Math.floor(rnd()*14),Math.floor(rnd()*59)),kind:"mailAnswer",lag:Math.round((rnd()<0.2?3+rnd()*6:120+rnd()*3000)*1000)});
  for(let j=0;j<3;j++)human.push({t:at(k,9+j*4,Math.floor(rnd()*59)),kind:"missionReport",lag:Math.round((30+rnd()*3600)*1000)});
  for(let j=0;j<6;j++)quiet.push({t:at(k,10+j*2,Math.floor(rnd()*59)),kind:"mailAnswer",lag:Math.round((600+rnd()*3600)*1000)});
  // The script: every visit right at its window, a letter and a report within seconds, never a pause; not a browser.
  for(let v=0;v<8;v++)script.push({t:at(k,6+v*2,0,3+Math.floor(rnd()*3)),kind:"pet",lag:(3+Math.floor(rnd()*3))*1000,ua:"python-requests"});
  for(let j=0;j<20;j++)script.push({t:at(k,7,j*50,30),kind:"mailAnswer",lag:(2+Math.floor(rnd()*3))*1000,ua:"python-requests"});
  for(let j=0;j<4;j++)script.push({t:at(k,9+j*3,10),kind:"missionReport",lag:(1+Math.floor(rnd()*3))*1000,ua:"python-requests"});
  // The night owl: a regular player of the day... and of the night.
  for(const h of [1,2,3,4,11,15,19,22])night.push({t:at(k,h,Math.floor(rnd()*59)),kind:"pet"});
 }
 rows(A,hum,human.sort((a,b)=>a.t-b.t));rows(A,calm,quiet.sort((a,b)=>a.t-b.t));rows(A,bot,script.sort((a,b)=>a.t-b.t));rows(A,owl,night.sort((a,b)=>a.t-b.t));
 // The night owl is an ace of the Cortège: full bonus, steady scores, never sent at the earliest (it scored 60 before 1.7.1).
 const full=Math.ceil(R.MINI.cortege.bonusCap/R.MINI.cortege.bonusRate),mi=A.db.prepare("INSERT INTO mini_scores(player_id,t,game,score,secs,errors,flags) VALUES(?,?,?,?,?,?,?)");
 for(let k=1;k<=12;k++)mi.run(owl,at(k,2,30),"cortege",full+5+(k%4),60,0,"[]");
 const items=(await ok(A,{cmd:"bots"})).items,of=n=>items.find(x=>x.name===n);
 const h=of("Humain Actif"),s=of("Script Regulier"),o=of("Couche Tard");
 assert.equal(h.alert,false,JSON.stringify(h.reasons));assert.ok(h.score<50,JSON.stringify(h));
 assert.equal(s.alert,true,JSON.stringify(s));assert.ok(s.families.includes("rythme")&&s.families.includes("client"),JSON.stringify(s.families));
 for(const re of [/lettres en \d+ s/,/rapports de mission/,/8 visites sur 8/,/Première visite/,/Aucune pause/])assert.ok(s.reasons.some(x=>re.test(x)),`${re} in ${JSON.stringify(s.reasons)}`);
 assert.ok(s.reasons.some(x=>/les autres joueurs : \d+ min/.test(x)),"compared with the group");
 assert.equal(s.lags.mail.n,240);assert.ok(s.lags.mail.medS<=4);
 assert.equal(o.alert,false,JSON.stringify(o));assert.ok(o.score<50,`${o.score} ${JSON.stringify(o.reasons)}`);
 assert.ok(o.reasons.some(x=>/bonus maximal/.test(x))&&o.reasons.some(x=>/entre 1 h et 6 h/.test(x)));
 const keys=(await ok(A,{cmd:"alerts"})).items.map(x=>x.key);
 assert.ok(keys.includes(`bot:${bot}`));for(const id of [hum,owl,calm])assert.ok(!keys.includes(`bot:${id}`),`no alert for ${id}`);
 // One family alone is never an alert, however high: timing only (a script in a real browser, page open).
 A.db.prepare("UPDATE activity SET ua='browser' WHERE player_id=?").run(bot);
 const sp=(await ok(A,{cmd:"player",name:"Script Regulier"})).player,s2=sp.activity;
 assert.ok(s2.score>=50,JSON.stringify(s2));assert.deepEqual(s2.families,["rythme"]);assert.equal(s2.alert,false);
 // Nor is it enough to keep the account from the rarest draw: the same rule as the alert.
 assert.equal(sp.mythicBlock,null,sp.mythicBlock);
});

test("a flagged Bâton duel keeps its player out of the mythic draw, shown on the sheet; an accepted one does not",async()=>{
 for(const n of ["Baton Triche","Baton Valide","Baton Porteur"])await reg(A.port,n);
 const t=idOf(A,"Baton Triche"),v=idOf(A,"Baton Valide"),b=idOf(A,"Baton Porteur"),now=Date.now();
 const ins=A.db.prepare("INSERT INTO baton_duels(challenger,bearer,seed,mode,status,created,data,flags) VALUES(?,?,1,'live',?,?,'{}',?)");
 const id=Number(ins.run(t,b,"held",now-3600e3,JSON.stringify([{side:"c",name:"Baton Triche",n:1,flags:["métronome"]}])).lastInsertRowid);
 ins.run(v,b,"done",now-3600e3,JSON.stringify([{side:"c",name:"Baton Valide",n:0,flags:["sans faute"]}]));
 const sheet=n=>ok(A,{cmd:"player",name:n}).then(r=>r.player);
 const st=await sheet("Baton Triche");
 assert.match(st.mythicBlock??"",new RegExp(`duel du Bâton #${id} signalé.*métronome`));
 assert.equal((await sheet("Baton Valide")).mythicBlock,null);
 assert.equal((await sheet("Baton Porteur")).mythicBlock,null,"the bearer was not flagged");
});

test("a moderator's own sheet carries no bot report nor eligibility; the version seen is shown",async()=>{
 await reg(A.port,"Modo Lui");const id=idOf(A,"Modo Lui");
 const own=(await ok(A,{cmd:"player",name:"Modo Lui",self:id})).player;
 assert.equal(own.activity,null);assert.equal(own.mythicBlock,null);assert.deepEqual(own.suspects,[]);
 const other=(await ok(A,{cmd:"player",name:"Modo Lui"})).player;
 assert.ok(other.activity&&Number.isFinite(other.activity.score));
 assert.ok("seenVersion" in other);   // null on a dev server (no release)
});

test("activity.lag migration: two servers on an old database at once, and a 1.7.0 insert still works",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgbd-old-")),file=join(dir,"t.db");
 const old=new DatabaseSync(file);
 old.exec("CREATE TABLE activity(player_id INTEGER NOT NULL,t INTEGER NOT NULL,kind TEXT NOT NULL,live INTEGER NOT NULL,ua TEXT NOT NULL);INSERT INTO activity VALUES(1,1,'pet',1,'browser');");old.close();
 const [p1,p2]=await Promise.all([boot(3842,dir),boot(3843,dir)]);
 try{
  const db=new DatabaseSync(file,{timeout:5000});
  assert.ok(db.prepare("PRAGMA table_info(activity)").all().some(c=>c.name==="lag"));
  db.prepare("INSERT INTO activity(player_id,t,kind,live,ua) VALUES(?,?,?,?,?)").run(1,2,"pet",1,"browser");   // 1.7.0's own statement
  assert.deepEqual(db.prepare("SELECT lag FROM activity ORDER BY t").all().map(r=>r.lag),[null,null]);
  db.close();
 }finally{await stop(p1);await stop(p2);}
});

test("news never opened: a weak client hint for a very active old account, none for a recent one",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgbd-seen-")),file=join(dir,"t.db"),sock=join(dir,"admin.sock"),port=3844;
 let p=await boot(port,dir,{POLITIGO_VERSION:"v1.7.0"});
 for(const n of ["Vieux Silencieux","Jamais Vu","Tout Neuf"])await reg(port,n);
 await stop(p);
 const db=new DatabaseSync(file,{timeout:5000}),now=Date.now(),id=n=>db.prepare("SELECT id FROM players WHERE name=?").get(n).id;
 db.prepare("UPDATE players SET created=? WHERE name IN ('Vieux Silencieux','Jamais Vu')").run(now-20*864e5);
 db.prepare("UPDATE players SET seen_version=NULL WHERE name='Jamais Vu'").run();
 db.prepare("INSERT INTO settings(key,value) VALUES('release_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({v:"1.7.1",t:now-10*864e5}));
 const ins=db.prepare("INSERT INTO activity(player_id,t,kind,live,ua) VALUES(?,?,?,?,?)");
 for(const n of ["Vieux Silencieux","Jamais Vu","Tout Neuf"])for(let k=0;k<450;k++)ins.run(id(n),now-(k+1)*1800e3,"pet",1,"browser");   // 400 actions at least (SEEN_ACTIONS)
 db.close();
 p=await boot(port,dir,{POLITIGO_VERSION:"v1.7.1",POLITIGO_ADMIN_SOCKET:sock});
 try{
  const S={sock},sheet=async n=>(await ok(S,{cmd:"player",name:n})).player;
  const a=await sheet("Vieux Silencieux"),j=await sheet("Jamais Vu"),f=await sheet("Tout Neuf");
  assert.equal(a.seenVersion,"1.7.0");assert.equal(j.seenVersion,null);
  assert.ok(a.activity.reasons.some(x=>/jusqu'à la 1\.7\.0 seulement.*1\.7\.1/.test(x)),JSON.stringify(a.activity.reasons));
  assert.ok(j.activity.reasons.some(x=>/jamais ouvert les nouveautés/.test(x)));assert.ok(j.activity.families.includes("client"));
  assert.ok(!f.activity.reasons.some(x=>/nouveautés/.test(x)),"a recent account is left alone");
 }finally{await stop(p);}
});
