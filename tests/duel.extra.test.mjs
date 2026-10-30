// More duel tests on a real server: the daily cap on paid wins, exactly-once resolution under racing requests,
// the sweep's time boundaries, the daily challenge count across days, and malformed picks (node --test).
// Clocks are moved by backdating database columns (c_started, d_started, expires, rday, sday), never by sleeping.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";
import {boot,stop,client,player as reg,picksFor,until,sleep,dayNow,yesterday,DUEL_TURN_MS} from "./server-helpers.mjs";

const PORT=3912;
let proc,DB;
before(async()=>{const dir=mkdtempSync(join(tmpdir(),"pgdx-"));proc=await boot(PORT,dir);DB=new DatabaseSync(join(dir,"t.db"),{timeout:5000});});
after(async()=>{try{DB.close();}catch{}await stop(proc);});

const player=(name,camp="left")=>reg(PORT,name,camp);
const duel=(c,body)=>c.call("POST","/api/duel",body);
const find=async(c,id)=>(await c.call("GET","/api/duels")).json.duels.find(d=>d.id===id);
const state=async c=>(await c.call("GET","/api/me")).json.state;
const idOf=name=>DB.prepare("SELECT id FROM players WHERE name=?").get(name).id;
const row=id=>DB.prepare("SELECT * FROM duels WHERE id=?").get(id);
const duelEntries=S=>S.journal.filter(j=>j.k==="duel");
// The 1.3 s countdown plus the last pick, spent in the database instead of waiting.
const backdate=(col,id,ms=2300)=>DB.prepare(`UPDATE duels SET ${col}=${col}-? WHERE id=?`).run(ms,id);
// A challenge with a played turn: pending, waiting for the defender.
async function challenged(a,b,opts={}){
 const ch=await duel(a,{op:"challenge",name:b.name});assert.equal(ch.status,200,JSON.stringify(ch.json));
 const {id,seed}=ch.json.duel;backdate("c_started",id);
 const sub=await duel(a,{op:"submit",id,picks:picksFor(seed,a.camp,opts)});
 assert.equal(sub.status,200,JSON.stringify(sub.json));
 return {id,seed};
}
async function accepted(b,id){
 assert.equal((await duel(b,{op:"accept",id})).status,200);backdate("d_started",id);
}
// a beats b 3 to 0. Returns a's state just before and just after the result lands.
async function win(a,b){
 const {id,seed}=await challenged(a,b);await accepted(b,id);
 const before=await state(a);
 const r=await duel(b,{op:"submit",id,picks:picksFor(seed,b.camp,{wrong:[0,1,2]})});
 assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.res,"loss");
 return {id,before,after:await state(a)};
}

test("paid wins: the 4th win of the day pays gauges but no XP, and pays again once the earlier wins are yesterday's",async()=>{
 const a=await player("Gagneur"),b=await player("Perdant Un","right"),c=await player("Perdant Deux","right");
 const aid=idOf("Gagneur"),bid=idOf("Perdant Un");
 // Three wins already paid today: old enough (created) not to tie the pair, sent on no day (sday).
 const ins=DB.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,c_score,d_score,resolved,winner,paid,rday) VALUES('debate',?,?,1,'done',1,3,0,1,?,1,?)");
 const seeded=[0,1,2].map(()=>Number(ins.run(aid,bid,aid,dayNow()).lastInsertRowid));
 assert.equal(DB.prepare("SELECT COUNT(*) n FROM duels WHERE winner=? AND paid=1 AND rday=?").get(aid,dayNow()).n,3);

 const w1=await win(a,b);
 assert.equal(row(w1.id).paid,0,"a 4th win the same day is not paid");
 assert.equal(row(w1.id).winner,aid);
 const top=w1.after.journal[0];
 assert.equal(top.k,"duel");assert.equal(top.d.res,"win");
 assert.doesNotMatch(top.text,/XP/,top.text);assert.match(top.text,/moral \+/,top.text);
 assert.equal(duelEntries(w1.after).length,duelEntries(w1.before).length+1);
 if(w1.after.hourIdx===w1.before.hourIdx){   // no game hour ticked in between: the deltas are exact
  assert.equal(w1.after.xp,w1.before.xp,"no XP for an unpaid win");
  assert.equal(w1.after.moral,R.clamp(w1.before.moral+R.DUEL.win.moral));
  assert.equal(w1.after.energy,R.clamp(w1.before.energy+R.DUEL.win.energy));
 }else assert.ok(w1.after.xp-w1.before.xp<R.DUEL.win.xp);

 // The earlier wins move to yesterday: today's count drops to zero, the next win pays the full 40 XP.
 DB.prepare(`UPDATE duels SET rday=? WHERE id IN (${seeded.join(",")})`).run(yesterday());
 const w2=await win(a,c);
 assert.equal(row(w2.id).paid,1);
 assert.match(w2.after.journal.find(j=>j.k==="duel").text,new RegExp(`\\+${R.DUEL.win.xp} XP`));
 if(w2.after.hourIdx===w2.before.hourIdx)assert.equal(w2.after.xp-w2.before.xp,R.DUEL.win.xp,"exactly the win XP, level-up or not");
 else assert.ok(w2.after.xp-w2.before.xp>=R.DUEL.win.xp);
});

test("exactly once: two racing submits from the defender resolve the duel once",async()=>{
 const a=await player("Course A"),b=await player("Course B","right");
 const {id,seed}=await challenged(a,b,{wrong:[0,1,2]});   // a scores 0
 await accepted(b,id);
 const sa=await state(a),sb=await state(b);
 const picks=picksFor(seed,"right");
 const rs=await Promise.all([duel(b,{op:"submit",id,picks}),duel(b,{op:"submit",id,picks})]);
 assert.deepEqual(rs.map(r=>r.status).sort(),[200,422],JSON.stringify(rs.map(r=>r.json?.error)));
 assert.equal(rs.find(r=>r.status===200).json.res,"win");
 const sa2=await state(a),sb2=await state(b);
 assert.equal(duelEntries(sa2).length,duelEntries(sa).length+1,"one entry for the challenger");
 assert.equal(duelEntries(sb2).length,duelEntries(sb).length+1,"one entry for the defender");
 if(sb2.hourIdx===sb.hourIdx)assert.equal(sb2.xp-sb.xp,R.DUEL.win.xp,"the win paid once");
 const feed=(await a.call("GET","/api/board")).json.feed.filter(f=>f.text.startsWith("Course B bat Course A"));
 assert.equal(feed.length,1,"told once");
 assert.equal(row(id).status,"done");assert.equal(row(id).winner,idOf("Course B"));
});

test("exactly once: racing refusals, and accept against refuse, give the chicken at most once",async()=>{
 const a=await player("Poule A"),b=await player("Poule B");
 const {id}=await challenged(a,b);
 const s0=await state(a);
 const rs=await Promise.all([duel(b,{op:"refuse",id}),duel(b,{op:"refuse",id})]);
 assert.deepEqual(rs.map(r=>r.status).sort(),[200,422]);
 const s1=await state(a);
 assert.equal(duelEntries(s1).filter(j=>j.d.res==="chicken").length,duelEntries(s0).filter(j=>j.d.res==="chicken").length+1);
 assert.equal(row(id).status,"refused");

 const c=await player("Poule C"),d=await player("Poule D");
 const {id:id2}=await challenged(c,d);
 const t0=await state(c);
 const [acc,ref]=await Promise.all([duel(d,{op:"accept",id:id2}),duel(d,{op:"refuse",id:id2})]);
 assert.deepEqual([acc.status,ref.status].sort(),[200,422]);
 const t1=await state(c),chickens=S=>duelEntries(S).filter(j=>j.d.res==="chicken").length;
 const st=row(id2).status;
 if(ref.status===200){assert.equal(st,"refused");assert.equal(chickens(t1),chickens(t0)+1);}
 else{assert.equal(st,"d_play");assert.equal(chickens(t1),chickens(t0),"accepted: no chicken");}
});

test("sweep boundaries: a turn just inside the limit survives, one past it ends; future expiry waits; closed duels stay closed",async()=>{
 const a=await player("Bord A"),b=await player("Bord B"),c=await player("Bord C"),d=await player("Bord D"),e=await player("Bord E");
 // Defender's turn, 5 s inside the limit: still running after several sweeps (SWEEP_MS=200).
 const {id}=await challenged(a,b);await accepted(b,id);
 DB.prepare("UPDATE duels SET d_started=? WHERE id=?").run(Date.now()-DUEL_TURN_MS+5000,id);
 await sleep(700);
 assert.equal(row(id).status,"d_play");
 DB.prepare("UPDATE duels SET d_started=? WHERE id=?").run(Date.now()-DUEL_TURN_MS-1000,id);
 assert.ok(await until(()=>row(id).status==="done"));
 assert.equal(row(id).d_score,0);
 // Challenger's turn, the same.
 const ch=await duel(c,{op:"challenge",name:d.name});const cid=ch.json.duel.id;
 DB.prepare("UPDATE duels SET c_started=? WHERE id=?").run(Date.now()-DUEL_TURN_MS+5000,cid);
 await sleep(700);
 assert.equal(row(cid).status,"c_play");
 DB.prepare("UPDATE duels SET c_started=? WHERE id=?").run(Date.now()-DUEL_TURN_MS-1000,cid);
 assert.ok(await until(()=>row(cid).status==="void"));
 // A pending challenge expiring in 5 s: still pending.
 const {id:pid}=await challenged(e,a);
 DB.prepare("UPDATE duels SET expires=? WHERE id=?").run(Date.now()+5000,pid);
 await sleep(700);
 assert.equal(row(pid).status,"pending");
 // Refused, then made to look stale in every column: never closed a second time.
 assert.equal((await duel(a,{op:"refuse",id:pid})).status,200);
 const se=await state(e),chickens=S=>duelEntries(S).filter(j=>j.d.res==="chicken").length,n=chickens(se);
 assert.equal(n,1);
 DB.prepare("UPDATE duels SET expires=1,c_started=1,d_started=1 WHERE id IN (?,?)").run(pid,id);
 const sa=await state(a),sb=await state(b);
 await sleep(700);
 assert.equal(row(pid).status,"refused");assert.equal(row(id).status,"done");
 assert.equal(chickens(await state(e)),n,"no second chicken");
 assert.equal(duelEntries(await state(a)).length,duelEntries(sa).length,"a done duel is not resolved again");
 assert.equal(duelEntries(await state(b)).length,duelEntries(sb).length);
});

test("three challenges a day counts today's only: yesterday's do not block, today's do",async()=>{
 const p=await player("Compteur");const t=[];for(let i=1;i<=5;i++)t.push(await player("Compté "+i));
 const pid=idOf("Compteur"),ins=DB.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,resolved,sday,rday) VALUES('debate',?,?,1,'void',1,1,?,?)");
 const seeded=[0,1,2].map(i=>Number(ins.run(pid,idOf(t[i].name),yesterday(),yesterday()).lastInsertRowid));
 assert.equal((await p.call("GET","/api/duels")).json.sent,0);
 assert.equal((await duel(p,{op:"challenge",name:t[3].name})).status,200,"yesterday's three do not count");
 assert.equal((await p.call("GET","/api/duels")).json.sent,1);
 DB.prepare(`UPDATE duels SET sday=? WHERE id IN (${seeded.join(",")})`).run(dayNow());
 const no=await duel(p,{op:"challenge",name:t[4].name});
 assert.equal(no.status,422);assert.equal(no.json.error,"Plus de défis aujourd'hui.");
 assert.equal((await p.call("GET","/api/duels")).json.sent,4);
});

test("malformed picks are refused with 422, never a 500, and void the challenge",async()=>{
 const x=await player("Bricoleur");
 const n=R.DUEL.maxPicks+1;
 const cases={
  object:{},nul:null,number:42,missing:undefined,
  tooMany:Array.from({length:n},(_,k)=>[0,k*300]),
  nanTime:[[0,0],[1,NaN]],                 // JSON turns NaN into null
  negativeTime:[[0,-250]],
  floatTime:[[0,0],[1,300.5]],
  answerOutOfRange:[[3,0]],
  stringAnswer:[["0",0]],
  stringTime:[[0,"0"]],
  gapUnderMin:[[0,0],[1,R.DUEL.minGap-1]],
  timeBackwards:[[0,1000],[1,500]],
  triple:[[0,0,0]],
  notPairs:[0,1,2]
 };
 let i=0;   // 14 cases, 2 calls each: under the 30-a-minute duel limit
 for(const [what,picks] of Object.entries(cases)){
  const y=await player("Banc "+(++i));
  const ch=await duel(x,{op:"challenge",name:y.name});assert.equal(ch.status,200,`${what}: ${JSON.stringify(ch.json)}`);
  const id=ch.json.duel.id;backdate("c_started",id);
  const r=await duel(x,picks===undefined?{op:"submit",id}:{op:"submit",id,picks});
  assert.equal(r.status,422,`${what}: ${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json.ok,false);assert.match(r.json.error,/^Score refusé/,what);
  assert.equal(row(id).status,"void",what);
  DB.prepare("UPDATE duels SET sday=NULL WHERE challenger=?").run(idOf("Bricoleur"));   // the 3-a-day cap is not under test
 }
 // On the defender's side a malformed answer forfeits: 422, the duel is done and lost.
 const a=await player("Banc Attaque"),b=await player("Banc Défense");
 const {id}=await challenged(a,b);await accepted(b,id);
 const r=await duel(b,{op:"submit",id,picks:{bad:true}});
 assert.equal(r.status,422);assert.equal(r.json.ok,false);
 assert.equal(r.json.res,"loss");assert.equal(r.json.mine,0);assert.equal(r.json.theirs,3);
 assert.equal(row(id).status,"done");assert.equal(row(id).winner,idOf("Banc Attaque"));
 assert.equal((await client(PORT).call("GET","/api/health")).status,200);
});
