// More duel tests on a real server: the daily cap on paid wins, exactly-once resolution under racing requests,
// the sweep's time boundaries, the daily challenge count across days, and malformed debate requests (node --test).
// Clocks are moved by backdating database columns (c_started, d_started, expires, rday, sday), never by sleeping.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";
import {boot,stop,client,player as reg,debateTurn,until,sleep,dayNow,yesterday,DUEL_TURN_MS} from "./server-helpers.mjs";

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
// A challenge with a played turn (through /api/debate): pending, waiting for the defender.
async function challenged(a,b,opts={}){
 const ch=await duel(a,{op:"challenge",name:b.name});assert.equal(ch.status,200,JSON.stringify(ch.json));
 const {id}=ch.json.duel;
 const end=await debateTurn(a,id,opts);
 assert.equal(end.status,200,JSON.stringify(end.json));assert.equal(end.json.result.status,"pending");
 return {id};
}
async function accepted(b,id){assert.equal((await duel(b,{op:"accept",id})).status,200);}
// a beats b 3 to 0. Returns a's state just before and just after the result lands.
async function win(a,b){
 const {id}=await challenged(a,b);await accepted(b,id);
 const before=await state(a);
 const r=await debateTurn(b,id,{wrong:[0,1,2]});
 assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.result.res,"loss");
 return {id,before,after:await state(a)};
}

test("paid wins: the 4th win of the day pays nothing at all, and pays again once the earlier wins are yesterday's",async()=>{
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
 assert.doesNotMatch(top.text,/XP|moral \+|énergie \+/,top.text);
 assert.equal(duelEntries(w1.after).length,duelEntries(w1.before).length+1);
 if(w1.after.hourIdx===w1.before.hourIdx){   // no game hour ticked in between: the deltas are exact
  assert.equal(w1.after.xp,w1.before.xp,"no XP for an unpaid win");
  assert.equal(w1.after.moral,w1.before.moral,"nor moral");
  assert.equal(w1.after.energy,w1.before.energy,"nor energy");
 }else assert.ok(w1.after.xp-w1.before.xp<R.DUEL.win.xp);

 // The earlier wins move to yesterday: today's count drops to zero, the next win pays the full 40 XP.
 DB.prepare(`UPDATE duels SET rday=? WHERE id IN (${seeded.join(",")})`).run(yesterday());
 const w2=await win(a,c);
 assert.equal(row(w2.id).paid,1);
 assert.match(w2.after.journal.find(j=>j.k==="duel").text,new RegExp(`\\+${R.DUEL.win.xp} XP`));
 if(w2.after.hourIdx===w2.before.hourIdx)assert.equal(w2.after.xp-w2.before.xp,R.DUEL.win.xp,"exactly the win XP, level-up or not");
 else assert.ok(w2.after.xp-w2.before.xp>=R.DUEL.win.xp);
});

test("exactly once: the defender's turn ending in racing requests (and the sweep) resolves the duel once",async()=>{
 const a=await player("Course A"),b=await player("Course B","right");
 const {id}=await challenged(a,b,{wrong:[0,1,2]});   // a scores 0
 await accepted(b,id);
 const sa=await state(a),sb=await state(b);
 const next=()=>b.call("POST","/api/debate",{op:"next",ref:id});
 const first=await debateTurn(b,id,{n:1});   // 1 right answer, then the clock runs out
 const late=await Promise.all([next(),next()]);
 const ok=[first,...late].filter(r=>r.status===200&&r.json.done);
 assert.ok(ok.length<=1,JSON.stringify([first,...late].map(r=>r.json)));
 assert.ok(late.every(r=>r.status===422),"over once resolved");
 if(ok.length)assert.equal(ok[0].json.result.res,"win");
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

test("malformed debate requests are 400/422, never a 500, and change nothing; old picks are 410",async()=>{
 const x=await player("Bricoleur"),y=await player("Banc");
 const ch=await duel(x,{op:"challenge",name:y.name});const id=ch.json.duel.id;
 const deb=async body=>{await sleep(180);return x.call("POST","/api/debate",body);};   // under 6 a second
 assert.equal((await duel(x,{op:"submit",id,picks:[[0,0]]})).status,410);
 for(const ref of [null,"1",1.5,-1,{},[id],"duel"])assert.equal((await deb({op:"next",ref})).status,422,JSON.stringify(ref));
 for(const op of [undefined,"submit","NEXT",1])assert.equal((await deb({op,ref:id})).status,400,String(op));
 await sleep(1100);   // 6 requests a second at most
 const q=await deb({op:"next",ref:id});assert.equal(q.status,200);
 await sleep(650);
 for(const choice of [3,-1,"0",0.5,true])assert.equal((await deb({op:"next",ref:id,choice})).status,400,JSON.stringify(choice));
 const t=JSON.parse(row(id).turn);assert.equal(t.st.idx,0);assert.equal(t.st.points+t.st.errors,0,"nothing counted");
 assert.ok(!JSON.stringify(q.json).includes("seed"),"no seed in the reply");
 assert.equal((await client(PORT).call("GET","/api/health")).status,200);
});
