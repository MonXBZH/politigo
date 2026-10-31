// Anti-cheat and hardening on a real server (1.5.0): the server-paced debate (no seed ever leaves the server, answers
// faster than 600 ms are ignored, 20 points at most whatever the script), the duel rules (defender's daily wins,
// annulment by the admin, multi-account signals), the mini-game audit in the bot report, and the server's own limits
// (scrypt line, coalesced boards, MAX_PLAYERS race, streams per address, purges) (node --test).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";
import {boot,stop,client,player as reg,login as signin,debateTurn,answerOf,until,sleep,dayNow,PW,INVITE} from "./server-helpers.mjs";

// A: the usual test server (3 s debates); B: real 15 s debates; C: boards at most once a second, 8 seats.
const A={port:3973},B={port:3974},C={port:3975};
async function start(s,extra={}){
 s.dir=mkdtempSync(join(tmpdir(),"pgac-"));s.sock=join(s.dir,"admin.sock");
 s.proc=await boot(s.port,s.dir,{POLITIGO_ADMIN_SOCKET:s.sock,...extra});
 s.db=new DatabaseSync(join(s.dir,"t.db"),{timeout:5000});
}
before(async()=>{await Promise.all([start(A),start(B,{POLITIGO_DEBATE_MS:undefined}),start(C,{BOARD_MS:"1000",MAX_PLAYERS:"8"})]);});
after(async()=>{for(const s of [A,B,C]){try{s.db.close();}catch{}await stop(s.proc);}});

function adm(s,obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(s.sock);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const ok=async(s,obj)=>{const r=await adm(s,obj);assert.equal(r.ok,true,JSON.stringify(r));return r;};
const player=(s,name,camp="left")=>reg(s.port,name,camp);
const duel=(c,body)=>c.call("POST","/api/duel",body);
const debate=(c,body)=>c.call("POST","/api/debate",{op:"next",...body});
const state=async c=>(await c.call("GET","/api/me")).json.state;
const idOf=(s,name)=>s.db.prepare("SELECT id FROM players WHERE name=?").get(name).id;
// The live stream of one player (from a chosen address), collected in the background.
function stream(c,ip){
 const ac=new AbortController(),events=[],s={events,status:null,close:()=>ac.abort()};
 s.ready=fetch(`http://127.0.0.1:${c.port}/events`,{headers:{Cookie:c.cookie,...(ip?{"X-Forwarded-For":ip}:{})},signal:ac.signal}).then(async r=>{
  s.status=r.status;if(r.status!==200)return;
  (async()=>{const dec=new TextDecoder();let buf="";
   try{for await(const chunk of r.body){
    buf+=dec.decode(chunk,{stream:true});let i;
    while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
     const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data,t:Date.now()});}
   }}catch{}})();
 }).catch(()=>{});
 return s;
}
// Plays a whole turn as a script that knows every answer: one right answer 605 ms after each question (just over
// the server's 600 ms), until the clock stops it. Returns the final reply and the number of answers sent.
async function script(c,ref){
 let r=await debate(c,{ref}),sent=0;
 while(r.status===200&&!r.json.done){await sleep(605);r=await debate(c,{ref,choice:answerOf(r.json.q,c.camp)});sent++;}
 return {r,sent};
}

test("no seed anywhere: start replies, /api/me, the live stream, challenge, accept and every debate reply",async()=>{
 const a=await player(A,"Fouineur"),b=await player(A,"Fouiné","right");
 const sa=stream(a);await sa.ready;
 const all=[];
 const keep=r=>{all.push(JSON.stringify(r.json));return r;};
 const st=keep(await a.call("POST","/api/action",{type:"debate"}));assert.equal(st.status,200,JSON.stringify(st.json));
 assert.deepEqual(Object.keys(st.json.game).sort(),["id","k"]);
 keep(await a.call("GET","/api/me"));
 let r=keep(await debate(a,{ref:"solo"}));
 while(!r.json.done){await sleep(620);r=keep(await debate(a,{ref:"solo",choice:answerOf(r.json.q,"left")}));}
 assert.equal(r.json.result.ok,true,JSON.stringify(r.json));
 const ch=keep(await duel(a,{op:"challenge",name:b.name})),id=ch.json.duel.id;
 r=keep(await debate(a,{ref:id}));
 while(!r.json.done){await sleep(620);r=keep(await debate(a,{ref:id,choice:answerOf(r.json.q,"left")}));}
 keep(await duel(b,{op:"accept",id}));
 r=keep(await debate(b,{ref:id}));
 while(!r.json.done){await sleep(620);r=keep(await debate(b,{ref:id,choice:answerOf(r.json.q,"right")}));}
 await sleep(200);sa.close();
 for(const e of sa.events)all.push(e.data||"");
 const seed=String(A.db.prepare("SELECT seed FROM duels WHERE id=?").get(id).seed);
 for(const j of all){assert.ok(!/"seed"/.test(j),j.slice(0,200));assert.ok(!j.includes(seed),"the duel's seed value never appears");}
 assert.ok(!/"order"/.test(all.join("")),"nor the answers' order");
});

test("an answer faster than 600 ms is ignored, flagged, and the same question stays",async()=>{
 const a=await player(A,"Pressé");
 assert.equal((await a.call("POST","/api/action",{type:"debate"})).status,200);
 const q=await debate(a,{ref:"solo"});
 const fast=await debate(a,{ref:"solo",choice:answerOf(q.json.q,"left")});
 assert.equal(fast.status,200);assert.equal(fast.json.ignored,true);assert.equal(fast.json.points,0);assert.equal(fast.json.right,null);
 assert.deepEqual(fast.json.q,q.json.q,"the same question, its clock not reset");
 await sleep(620);
 const slow=await debate(a,{ref:"solo",choice:answerOf(q.json.q,"left")});
 assert.equal(slow.json.right,true);assert.equal(slow.json.points,1);assert.notEqual(slow.json.q.idx,q.json.q.idx);
 let r=slow;while(!r.json.done){await sleep(Math.min(3000,r.json.leftMs+50));r=await debate(a,{ref:"solo"});}
 assert.equal(r.json.result.score,1);
 const row=A.db.prepare("SELECT * FROM mini_scores WHERE player_id=? AND game='debate'").get(idOf(A,"Pressé"));
 assert.ok(JSON.parse(row.flags).includes("trop_rapide"),row.flags);assert.equal(row.score,1);
 assert.equal((await debate(a,{ref:"solo"})).status,422,"the game is over");
 assert.equal((await a.call("POST","/api/action",{type:"miniEnd",score:20})).status,422,"no score taken from the browser");
});

test("a scripted perfect run cannot score more than 20, solo or duel, and is flagged",async()=>{
 const a=await player(B,"Script Solo"),c=await player(B,"Script Duel"),d=await player(B,"Cible Duel");
 assert.equal((await a.call("POST","/api/action",{type:"debate"})).status,200);
 const ch=await duel(c,{op:"challenge",name:d.name}),id=ch.json.duel.id;
 const [solo,du]=await Promise.all([script(a,"solo"),script(c,id)]);
 assert.ok(solo.sent>20&&du.sent>20,`more than 20 right answers sent (${solo.sent}, ${du.sent})`);
 assert.equal(solo.r.json.result.score,R.DEBATE.maxPoints);assert.ok(solo.r.json.result.bonus<=R.MINI.debate.bonusCap);
 assert.equal(du.r.json.result.score,R.DEBATE.maxPoints);assert.equal(du.r.json.result.status,"pending");
 const ms=B.db.prepare("SELECT * FROM mini_scores WHERE player_id=?").get(idOf(B,"Script Solo"));
 assert.equal(ms.score,20);for(const f of ["plafond","zero_erreur"])assert.ok(JSON.parse(ms.flags).includes(f),ms.flags);
 const flags=JSON.parse(B.db.prepare("SELECT flags FROM duels WHERE id=?").get(id).flags);
 assert.equal(flags[0].side,"c");assert.equal(flags[0].name,"Script Duel");assert.ok(flags[0].flags.includes("plafond"));
 const log=(await ok(B,{cmd:"audit"})).items.find(x=>x.cmd==="duel-flag");
 assert.equal(log.via,"server");assert.equal(log.target,`#${id}`);assert.match(log.detail,new RegExp(`duel #${id} signalé : Script Duel \\(.*plafond`));
 const listed=(await ok(B,{cmd:"duels-list"})).items.find(x=>x.id===id);assert.deepEqual(listed.flags,flags);
 const sheet=(await ok(B,{cmd:"player",name:"Script Duel"})).player;assert.deepEqual(sheet.duels.find(x=>x.id===id).flags,flags);
 const bot=(await ok(B,{cmd:"bots"})).items.find(x=>x.name==="Script Solo");
 assert.ok(bot.reasons.some(x=>/invraisemblables.*plafond/.test(x)),JSON.stringify(bot.reasons));assert.equal(bot.games.debate.n,1);
});

test("a turn's state survives a restart: resumed, never replayed",async()=>{
 // On B (15 s turns): the restart fits well within the turn.
 const a=await player(B,"Redémarreur"),b=await player(B,"Patient Redémarrage");
 const ch=await duel(a,{op:"challenge",name:b.name}),id=ch.json.duel.id;
 let r=await debate(a,{ref:id});await sleep(620);
 r=await debate(a,{ref:id,choice:answerOf(r.json.q,"left")});assert.equal(r.json.points,1);
 const shown=r.json.q;
 await stop(B.proc);B.proc=await boot(B.port,B.dir,{POLITIGO_ADMIN_SOCKET:B.sock,POLITIGO_DEBATE_MS:undefined});
 const a2=await signin(B.port,"Redémarreur");a2.camp="left";
 const again=await debate(a2,{ref:id});
 assert.equal(again.status,200,JSON.stringify(again.json));assert.equal(again.json.points,1,"the point scored before is kept");
 assert.deepEqual(again.json.q,shown,"the same question, not a new deal");
});

test("defender's wins: past 3 a day a defence pays nothing at all",async()=>{
 const x=await player(A,"Rempart","right"),y=await player(A,"Assaillant");
 const xid=idOf(A,"Rempart"),filler=idOf(A,"Fouineur");
 const ins=A.db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,c_score,d_score,resolved,winner,paid,rday) VALUES('debate',?,?,1,'done',1,0,3,1,?,0,?)");
 for(let i=0;i<3;i++)ins.run(filler,xid,xid,dayNow());   // three wins as the defender today, none of them paid
 const ch=await duel(y,{op:"challenge",name:x.name}),id=ch.json.duel.id;
 assert.equal((await debateTurn(y,id,{wrong:[0,1,2]})).json.result.mine,0);
 assert.equal((await duel(x,{op:"accept",id})).status,200);
 const before=await state(x);
 const end=await debateTurn(x,id);
 assert.equal(end.json.result.res,"win");
 const row=A.db.prepare("SELECT paid,winner FROM duels WHERE id=?").get(id);assert.equal(row.winner,xid);assert.equal(row.paid,0);
 const after=await state(x);
 if(after.hourIdx===before.hourIdx){assert.equal(after.xp,before.xp);assert.equal(after.moral,before.moral);assert.equal(after.energy,before.energy);}
});

test("duel-annul takes back a finished duel's effects on both sides",async()=>{
 const a=await player(A,"Annulé A"),b=await player(A,"Annulé B","right");
 const ch=await duel(a,{op:"challenge",name:b.name}),id=ch.json.duel.id;
 assert.equal((await debateTurn(a,id)).json.result.mine,3);
 assert.equal((await duel(b,{op:"accept",id})).status,200);
 const pa=await state(a),pb=await state(b);
 const end=await debateTurn(b,id,{wrong:[0,1,2]});assert.equal(end.json.result.res,"loss");
 const wa=await state(a),wb=await state(b);
 assert.ok(wa.xp>pa.xp&&wb.moral<pb.moral,"the duel changed both");
 assert.equal((await adm(A,{cmd:"duel-annul",id:999999})).ok,false);
 const r=await ok(A,{cmd:"duel-annul",id,via:"web"});
 assert.equal(r.status,"annulled");assert.deepEqual(r.reversed.sort(),["Annulé A","Annulé B"]);
 const na=await state(a),nb=await state(b);
 for(const [p,n] of [[pa,na],[pb,nb]])if(n.hourIdx===p.hourIdx)for(const k of ["xp","lvl","moral","energy"])assert.equal(n[k],p[k],k);
 assert.equal(na.journal[0].d.res,"annulled");
 assert.equal(A.db.prepare("SELECT status FROM duels WHERE id=?").get(id).status,"annulled");
 assert.equal((await adm(A,{cmd:"duel-annul",id})).ok,false,"once");
 const log=(await ok(A,{cmd:"audit"})).items.find(x=>x.cmd==="duel-annul");assert.equal(log.target,`#${id}`);assert.equal(log.via,"web");
});

test("duel-annul on a suspended cheater keeps their clock frozen: the suspension is not played",async()=>{
 const a=await player(A,"Gelé A"),b=await player(A,"Gelé B","right");
 const ch=await duel(a,{op:"challenge",name:b.name}),id=ch.json.duel.id;
 await debateTurn(a,id);assert.equal((await duel(b,{op:"accept",id})).status,200);
 assert.equal((await debateTurn(b,id,{wrong:[0,1,2]})).json.result.res,"loss");
 await ok(A,{cmd:"suspend",name:"Gelé A",on:true});
 const frozenAt=Date.now();   // the clock stopped at most here (a bare clock move stays in memory: compare with the time)
 await sleep(300);
 assert.deepEqual((await ok(A,{cmd:"duel-annul",id})).reversed.sort(),["Gelé A","Gelé B"]);
 const after=JSON.parse(A.db.prepare("SELECT state FROM players WHERE name=?").get("Gelé A").state);
 assert.ok(after.lastReal<=frozenAt,"no time played during the suspension");assert.equal(after.journal[0].d.res,"annulled");
 await ok(A,{cmd:"suspend",name:"Gelé A",on:false});
});

test("duels-suspects: fresh accounts dueling each other, lightning hand-overs, a lopsided pair",async()=>{
 const p1=await player(A,"Main"),p2=await player(A,"Alt");
 const m=idOf(A,"Main"),al=idOf(A,"Alt"),now=Date.now();
 const ins=A.db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,c_score,d_score,resolved,winner,paid,c_done,d_started) VALUES('debate',?,?,1,'done',?,0,3,?,?,1,?,?)");
 const ids=[0,1,2].map(i=>Number(ins.run(al,m,now-1e5+i,now,m,now-5e4+i,now-5e4+i+800).lastInsertRowid));
 const s=(await ok(A,{cmd:"duels-suspects"})).suspects.find(x=>x.names.includes("Main")&&x.names.includes("Alt"));
 assert.ok(s,"the pair is listed");
 assert.deepEqual(s.duels.sort((x,y)=>x-y),ids);
 assert.ok(s.reasons.some(x=>/Comptes créés/.test(x)));assert.ok(s.reasons.some(x=>/moins de 2 s/.test(x)));
 assert.ok(s.reasons.some(x=>/Alt a perdu 3 fois contre Main/.test(x)),JSON.stringify(s.reasons));
 assert.ok((await ok(A,{cmd:"bots"})).suspects.some(x=>x.names.includes("Alt")));
 assert.ok((await ok(A,{cmd:"player",name:"Alt"})).player.suspects.length>=1);
 assert.ok(p1&&p2);
});

test("duels-suspects: one duel a day per pair does not hide a farm of alts beaten one after the other",async()=>{
 const w=await player(A,"Fermier");const alts=[];for(const n of ["Poule 1","Poule 2","Poule 3"])alts.push(await player(A,n,"right"));
 const wid=idOf(A,"Fermier"),now=Date.now();
 // Each alt losing once at 1 point, the winner taking over 3 s after the alt's turn (too slow for the 2 s rule):
 // per pair, nothing past the accounts' age; across rivals, the farm.
 const ins=A.db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,c_score,d_score,resolved,winner,paid,c_done,d_started) VALUES('debate',?,?,1,'done',?,1,20,?,?,1,?,?)");
 const ids=["Poule 1","Poule 2","Poule 3"].map((n,i)=>Number(ins.run(idOf(A,n),wid,now-3e5+i*864e4,now,wid,now-2e5+i,now-2e5+i+3000).lastInsertRowid));
 const s=(await ok(A,{cmd:"duels-suspects"})).suspects.find(x=>x.names.length===4&&x.names[0]==="Fermier");
 assert.ok(s,"the farmer is listed with every alt");
 assert.deepEqual([...s.names].sort(),["Fermier","Poule 1","Poule 2","Poule 3"]);assert.deepEqual(s.duels.sort((x,y)=>x-y),ids);
 assert.ok(s.reasons.some(x=>/Fermier a gagné 3 duels contre 3 rivaux différents/.test(x)),JSON.stringify(s.reasons));
 assert.ok(w&&alts.length===3);
});

test("mini-game audit: every end is kept, and game signals weigh in the bot report",async()=>{
 const a=await player(A,"Robot Joueur");
 const ps=await a.call("POST","/api/action",{type:"pongStart"});
 const end=await a.call("POST","/api/action",{type:"pongEnd",score:30,id:ps.json.game.id});
 assert.equal(end.status,422);assert.ok(!("audit" in end.json),"the audit stays on the server");
 const pid=idOf(A,"Robot Joueur");
 const row=A.db.prepare("SELECT * FROM mini_scores WHERE player_id=? AND game='pong'").get(pid);assert.ok(row,"a refused end is kept too");
 // Ten Cortèges at the full bonus, all the same score, each sent at the earliest moment the pace cap allows.
 const ins=A.db.prepare("INSERT INTO mini_scores(player_id,t,game,score,secs,errors,flags) VALUES(?,?,'cortege',200,25,NULL,'[]')");
 for(let i=0;i<10;i++)ins.run(pid,Date.now()-i*6e5);
 const bot=(await ok(A,{cmd:"bots"})).items.find(x=>x.name==="Robot Joueur");
 assert.equal(bot.games.cortege.n,10);assert.equal(bot.games.cortege.capShare,1);assert.equal(bot.games.cortege.hist.counts.reduce((x,y)=>x+y,0),10);
 for(const re of [/bonus maximal/,/trop constants/,/au plus tôt/,/invraisemblables/])assert.ok(bot.reasons.some(x=>re.test(x)),`${re} in ${JSON.stringify(bot.reasons)}`);
 assert.ok(bot.score>=95,JSON.stringify(bot));
 const sheet=(await ok(A,{cmd:"player",name:"Robot Joueur"})).player;assert.equal(sheet.activity.games.cortege.n,10);assert.equal(sheet.activity.score,bot.score);
});

test("a deleted account takes its feed lines, and its name waits a day",async()=>{
 const a=await player(A,"Éphémère");
 const feed=async()=>(await a.call("GET","/api/board")).json.feed;
 assert.ok((await feed()).some(f=>f.player==="Éphémère"));
 const w=await player(A,"Témoin Feed");
 assert.equal((await a.call("DELETE","/api/account",{password:PW})).status,200);
 assert.ok(!(await w.call("GET","/api/board")).json.feed.some(f=>f.player==="Éphémère"));
 const again=await client(A.port).call("POST","/api/register",{name:"ephemere",password:PW,invite:INVITE,camp:"left"});
 assert.equal(again.status,409);assert.match(again.json.error,/vient d'être libéré/);
});

test("streams: twelve per address at most, whatever the accounts",async()=>{
 const ps=[];for(let i=0;i<5;i++)ps.push(await player(A,"Flux "+i));
 const ip="10.66.0.1",open=[];
 for(let i=0;i<4;i++)for(let k=0;k<3;k++){const s=stream(ps[i],ip);await s.ready;assert.equal(s.status,200);open.push(s);}
 const no=stream(ps[4],ip);await no.ready;assert.equal(no.status,429);
 const other=stream(ps[4],"10.66.0.2");await other.ready;assert.equal(other.status,200,"another address is fine");
 for(const s of [...open,other])s.close();
});

test("the scrypt line: ten logins at once all get in, three from one address one after the other",async()=>{
 await player(A,"Foule");
 const many=await Promise.all(Array.from({length:10},()=>client(A.port).call("POST","/api/login",{name:"Foule",password:PW})));
 assert.deepEqual(many.map(r=>r.status),Array(10).fill(200));
 const one=client(A.port);
 const same=await Promise.all([0,1,2].map(()=>one.call("POST","/api/login",{name:"Foule",password:PW})));
 assert.deepEqual(same.map(r=>r.status),[200,200,200]);
});

test("boards are coalesced: five sign-ups in a burst make at most two boards",async()=>{
 const w=await player(C,"Guetteur");
 const s=stream(w);await s.ready;await sleep(1500);   // its own arrival settled
 const n0=s.events.filter(e=>e.ev==="board").length;
 await Promise.all([0,1,2,3,4].map(i=>player(C,"Rafale "+i)));
 await sleep(2500);s.close();
 const boards=s.events.filter(e=>e.ev==="board").slice(n0);
 assert.ok(boards.length>=1&&boards.length<=2,`${boards.length} boards`);
 assert.equal(JSON.parse(boards.at(-1).data).length,6,"the last one has everybody");
});

test("MAX_PLAYERS: racing sign-ups for the last seats make exactly that many accounts",async()=>{
 const n=C.db.prepare("SELECT COUNT(*) n FROM players").get().n;assert.equal(n,6);
 const rs=await Promise.all([0,1,2,3,4].map(i=>client(C.port).call("POST","/api/register",{name:"Siège "+i,password:PW,invite:INVITE,camp:"left"})));
 assert.equal(rs.filter(r=>r.status===201).length,2,JSON.stringify(rs.map(r=>r.status)));
 assert.ok(rs.filter(r=>r.status!==201).every(r=>r.status===403&&/complète/.test(r.json.error)));
 assert.equal(C.db.prepare("SELECT COUNT(*) n FROM players").get().n,8);
});

test("chores purge closed duels past 30 days, old audits and tombstones; open duels stay",async()=>{
 const x=idOf(B,"Script Solo"),y=idOf(B,"Cible Duel"),old=Date.now()-31*864e5;
 const ins=B.db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,resolved) VALUES('debate',?,?,1,?,?,?)");
 const gone=Number(ins.run(x,y,"done",old,old).lastInsertRowid),kept=Number(ins.run(x,y,"pending",old,null).lastInsertRowid);
 B.db.prepare("UPDATE duels SET expires=? WHERE id=?").run(Date.now()+864e5,kept);
 B.db.prepare("INSERT INTO mini_scores(player_id,t,game,score,secs,errors,flags) VALUES(?,?,'pong',1,3,NULL,'[]')").run(x,Date.now()-15*864e5);
 B.db.prepare("INSERT INTO tombstones(name_key,created,deleted) VALUES('vieux',1,?)").run(Date.now()-8*864e5);
 await stop(B.proc);B.proc=await boot(B.port,B.dir,{POLITIGO_ADMIN_SOCKET:B.sock,POLITIGO_DEBATE_MS:undefined});   // chores run at the first sweep
 assert.ok(await until(()=>!B.db.prepare("SELECT 1 FROM duels WHERE id=?").get(gone)));
 assert.ok(B.db.prepare("SELECT 1 FROM duels WHERE id=?").get(kept),"an open duel stays");
 assert.equal(B.db.prepare("SELECT COUNT(*) n FROM mini_scores WHERE t<?").get(Date.now()-14*864e5).n,0);
 assert.equal(B.db.prepare("SELECT COUNT(*) n FROM tombstones WHERE name_key='vieux'").get().n,0);
});
