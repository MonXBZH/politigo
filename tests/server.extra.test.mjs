// Extra server tests: persistence, downtime, config, limits, sweep clock, SSE (node --test, no dependency).
// Same layout as server.test.mjs: server.mjs and rules.mjs side by side (SERVER env or /app/server.mjs).
// Ports 3980-3986 are used here (3995-3999 belong to server.test.mjs).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {request} from "node:http";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";

const INVITE="code-secret-de-test-123",H=3600000;
const P={main:3980,persist:3981,max:3982,off:3983,sweep:3984,config:3985,board:3986};
// A time zone where it is early afternoon right now: daytime-only actions are always testable.
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
let DIR,main;
const dbOf=name=>join(DIR,name+".db");

function boot(port,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:dbOf("p"+port),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";
 p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(code));});
}
const stop=p=>new Promise(r=>{if(p.exitCode!==null||p.signalCode)return r();p.on("exit",r);p.kill();});
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pg-extra-"));main=await boot(P.main,{DB_PATH:dbOf("main")});});
after(()=>main&&main.kill("SIGTERM"));

// A fresh client address per use: the per-IP rate limits never interfere between tests.
let ipn=0;const ip=()=>{ipn++;return `10.${50+((ipn>>16)&63)}.${(ipn>>8)&255}.${ipn&255}`;};

function client(addr=ip(),port=P.main){
 let cookie="";
 const call=async(method,path,body,headers={})=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":addr,...headers},
   body:body===undefined?undefined:typeof body==="string"?body:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json,headers:r.headers};
 };
 return {call,get cookie(){return cookie;},set cookie(v){cookie=v;}};
}
const reg=(c,name,extra={})=>c.call("POST","/api/register",{name,password:"motdepasse1",invite:INVITE,camp:"left",...extra});
const login=(c,name,password="motdepasse1")=>c.call("POST","/api/login",{name,password});
// Replays a raw cookie on a fresh client: the session must be dead on the server, not just forgotten by the client.
const replay=(cookie,port=P.main,path="/api/me")=>client(ip(),port).call("GET",path,undefined,{Cookie:cookie});
// Registers a player and returns a client that holds the session.
async function player(name,port=P.main,extra={}){const c=client(ip(),port);const r=await reg(c,name,extra);assert.equal(r.status,201,`register ${name}: ${JSON.stringify(r.json)}`);return c;}
const strip=s=>{const {vclock,lastReal,...rest}=s;return rest;};
const until=async(fn,ms=10000,step=50)=>{const end=Date.now()+ms;for(;;){const v=await fn();if(v)return v;if(Date.now()>end)return null;await new Promise(r=>setTimeout(r,step));}};

// Live stream collector: parsed events accumulate in `events`.
async function stream(port,cookie,addr=ip()){
 const ac=new AbortController();
 const r=await fetch(`http://127.0.0.1:${port}/events`,{headers:{Cookie:cookie,"X-Forwarded-For":addr},signal:ac.signal});
 const events=[];
 if(r.status!==200){ac.abort();return {status:r.status,events,close(){}};}
 (async()=>{
  try{
   const dec=new TextDecoder();let buf="";
   for await(const chunk of r.body){
    buf+=dec.decode(chunk,{stream:true});let i;
    while((i=buf.indexOf("\n\n"))>=0){
     const block=buf.slice(0,i);buf=buf.slice(i+2);
     const ev=/^event: (.*)$/m.exec(block),d=/^data: (.*)$/m.exec(block);
     if(ev)events.push({event:ev[1],data:d?JSON.parse(d[1]):null});
    }
   }
  }catch{}
 })();
 return {status:200,events,close:()=>ac.abort(),waitFor:(pred,ms=10000)=>until(()=>events.find(pred),ms)};
}

// Raw request through node:http, so that odd paths reach the server untouched.
const raw=(port,path,method="GET")=>new Promise((ok,ko)=>{
 const r=request({host:"127.0.0.1",port,path,method,headers:{"X-Forwarded-For":ip()}},res=>{let b="";res.on("data",d=>{b+=d;});res.on("end",()=>ok({status:res.statusCode,headers:res.headers,body:b}));});
 r.on("error",ko);r.end();
});

// ------------------------------------------------------------------ B1
test("B1 state, journal, feed and the old cookie survive a restart",async()=>{
 const db=dbOf("b1");let p=await boot(P.persist,{DB_PATH:db});
 let c,before_;
 try{
  c=await player("Persy",P.persist);
  const act=await c.call("POST","/api/action",{type:"debate"});assert.equal(act.status,200);
  before_=(await c.call("GET","/api/me")).json;
  assert.ok(before_.state.xp>0);assert.equal(before_.state.journal[0].k,"act");
 }finally{await stop(p);}
 p=await boot(P.persist,{DB_PATH:db});
 try{
  const me=await c.call("GET","/api/me");
  assert.equal(me.status,200,"the cookie issued before the restart still works");
  assert.equal(me.json.name,"Persy");
  assert.equal(me.json.state.xp,before_.state.xp);assert.equal(me.json.state.lvl,before_.state.lvl);
  assert.equal(me.json.state.fm,before_.state.fm);
  assert.deepEqual(me.json.state.journal.map(j=>j.text),before_.state.journal.map(j=>j.text));
  const b=await c.call("GET","/api/board");
  assert.ok(b.json.board.some(r=>r.name==="Persy"));
  assert.ok(b.json.feed.some(f=>f.player==="Persy"&&f.kind==="new"),"the feed table persisted too");
  assert.equal((await login(client(),"persy")).status,401,"(different port client defaults to main: no such player there)");
  assert.equal((await login(client(ip(),P.persist),"persy")).status,200,"the password hash persisted");
 }finally{await stop(p);}
});

// ------------------------------------------------------------------ B2
test("B2 a downtime is skipped: back on the real hour, nobody dies, nothing on the public feed",async()=>{
 const db=dbOf("b2");let p=await boot(P.persist,{DB_PATH:db});
 let c;
 try{c=await player("Rebased",P.persist);}finally{await stop(p);}
 const d=new DatabaseSync(db);
 const row=d.prepare("SELECT state FROM players WHERE name='Rebased'").get(),s=JSON.parse(row.state);
 s.vclock=s.lastReal=Date.now()-48*H;s.hourIdx=Math.floor(s.vclock/H);   // two days of downtime
 for(const k of ["sat","moral","energy","hyg"])s[k]=0;
 s.zero=0;
 d.prepare("UPDATE players SET state=? WHERE name='Rebased'").run(JSON.stringify(s));d.close();
 p=await boot(P.persist,{DB_PATH:db});
 try{
  await new Promise(r=>setTimeout(r,700));      // a few sweeps
  const me=await c.call("GET","/api/me"),now=Date.now(),st=me.json.state;
  assert.equal(me.status,200);
  assert.equal(st.deaths,0);
  assert.ok(!st.journal.some(j=>j.k==="death"));
  assert.ok(Math.abs(st.vclock-now)<60000,"the game clock is back on the real hour");
  assert.ok(st.hourIdx>=Math.floor(now/H)-1);
  const sync=st.journal.find(j=>j.k==="sync");
  assert.ok(sync&&Math.abs(sync.d.skipped-48*H)<60000,"one sync entry tells the downtime");
  assert.match(p.out,/Clocks back on the real hour/);
  const board=await c.call("GET","/api/board");
  assert.ok(!board.json.feed.some(f=>f.kind==="sync"),"a maintenance is not news for the group");
 }finally{await stop(p);}
});

// ------------------------------------------------------------------ B3
test("B3 corrupt stored states: the server starts, garbage restarts the game, absurd values are clamped",async()=>{
 const db=dbOf("b3");let p=await boot(P.persist,{DB_PATH:db});
 let a,b,c;
 try{a=await player("Garbage",P.persist);b=await player("Absurd",P.persist);c=await player("WrongCamp",P.persist);}finally{await stop(p);}
 const d=new DatabaseSync(db);
 d.prepare("UPDATE players SET state='garbage' WHERE name='Garbage'").run();
 const s=JSON.parse(d.prepare("SELECT state FROM players WHERE name='Absurd'").get().state);
 s.lvl=999;s.xp=1e12;s.sat=500;s.moral=-40;s.fm=1e9;s.deaths=-5;
 d.prepare("UPDATE players SET state=? WHERE name='Absurd'").run(JSON.stringify(s));
 d.prepare("UPDATE players SET state=? WHERE name='WrongCamp'").run('{"v":2,"camp":"nowhere"}');
 d.close();
 p=await boot(P.persist,{DB_PATH:db});
 try{
  assert.match(p.err,/unreadable state/);
  const ga=await a.call("GET","/api/me");
  assert.equal(ga.status,200);assert.equal(ga.json.state.lvl,1);assert.equal(ga.json.state.deaths,0);
  assert.ok(ga.json.state.journal.some(j=>j.k==="new"),"a fresh game was started");
  const ab=(await b.call("GET","/api/me")).json.state;
  assert.equal(ab.lvl,100);
  for(const k of ["sat","moral","energy","hyg"])assert.ok(ab[k]>=0&&ab[k]<=100,k);
  assert.ok(ab.fm<=99&&ab.fm>=0);assert.ok(ab.deaths>=0);assert.ok(Number.isFinite(ab.xp));
  const wc=(await c.call("GET","/api/me")).json.state;
  assert.equal(wc.lvl,1);assert.ok(["left","right"].includes(wc.camp));
  const board=(await a.call("GET","/api/board")).json.board;
  assert.equal(board.length,3);assert.ok(board.every(r=>r.lvl>=1&&r.lvl<=100));
 }finally{await stop(p);}
});

// ------------------------------------------------------------------ B4
test("B4 MAX_PLAYERS caps the game and deleting an account frees a slot",async()=>{
 const p=await boot(P.max,{MAX_PLAYERS:"2"});
 try{
  const a=await player("Slot A",P.max);await player("Slot B",P.max);
  const r=await reg(client(ip(),P.max),"Slot C");
  assert.equal(r.status,403);assert.match(r.json.error,/complète/);
  assert.equal((await a.call("DELETE","/api/account",{password:"motdepasse1"})).status,200);
  assert.equal((await reg(client(ip(),P.max),"Slot C")).status,201);
  assert.equal((await reg(client(ip(),P.max),"Slot D")).status,403,"full again");
 }finally{await stop(p);}
});

// ------------------------------------------------------------------ B5
test("B5 registration validation matrix",async()=>{
 const st=async(name,extra)=>(await reg(client(),name,extra)).status;
 assert.equal(await st("N".repeat(20)),201,"20 characters");
 assert.equal(await st("N".repeat(21)),400,"21 characters");
 assert.equal(await st("ab"),400,"2 characters");
 assert.equal(await st("abc"),201,"3 characters");
 assert.equal(await st("Pw seven",{password:"1234567"}),400,"password 7");
 assert.equal(await st("Pw eight",{password:"12345678"}),201,"password 8");
 assert.equal(await st("Pw twohundred",{password:"x".repeat(200)}),201,"password 200");
 assert.equal(await st("Pw twohundred1",{password:"x".repeat(201)}),400,"password 201");
 assert.equal(await st("Pw empty",{password:""}),400);
 // Non-string types: refused with 4xx, never a 500.
 for(const name of [123,null,["Typed"],{n:1},true])assert.equal(await st(name),400,"name "+JSON.stringify(name));
 for(const password of [12345678,null,["motdepasse1"],{},true])assert.equal(await st("Typed pw",{password}),400,"password "+JSON.stringify(password));
 for(const invite of [123,null,[INVITE],{}])assert.equal(await st("Typed inv",{invite}),403,"invite "+JSON.stringify(invite));
 for(const camp of [1,null,["left"],"centre",undefined,"__proto__"])assert.equal(await st("Typed camp",{camp}),400,"camp "+JSON.stringify(camp));
 // Trimming and collapsing.
 const t=await reg(client(),"   Trim   Me   ");assert.equal(t.status,201);assert.equal(t.json.name,"Trim Me");
 const i=await reg(client(),"Inner \t  spaces     here");assert.equal(i.status,201);assert.equal(i.json.name,"Inner spaces here");
 assert.equal(await st("trim me"),409,"collapsed name clashes with the stored one");
 assert.equal(await st("TRIM    ME"),409);
 assert.equal(await st(" "+"x".repeat(19)+" "),201,"trimmed to 19 characters");
 assert.equal(await st("a"+" ".repeat(30)+"b"+"c".repeat(18)),400,"collapsed to 22 characters");
 assert.equal(await st("-bad"),400,"must start with a letter or digit");
 assert.equal(await st("bad-"),400,"must end with a letter or digit");
});

// ------------------------------------------------------------------ B6
test("B6 closed registrations (POLITIGO_INVITE=off) and the per-IP hourly limit",async()=>{
 const p=await boot(P.off,{POLITIGO_INVITE:"  OFF  "});
 try{
  const r=await reg(client(ip(),P.off),"Closed");
  assert.equal(r.status,403);assert.match(r.json.error,/fermées/);
  assert.equal((await reg(client(ip(),P.off),"Closed",{invite:""})).status,403);
  assert.ok(!/Invite code/.test(p.out));
 }finally{await stop(p);}
 const addr=ip();let last;const codes=[];
 for(let n=0;n<6;n++){last=await reg(client(addr),"Limit"+n,{invite:"faux"});codes.push(last.status);}
 assert.deepEqual(codes,[403,403,403,429,429,429],"3 sign-ups an hour per address");
 assert.match(last.json.error,/inscriptions/);
 assert.equal((await reg(client(addr),"Limit9")).status,429,"a valid sign-up from a limited address is refused too");
 assert.equal((await reg(client(),"Limit9")).status,201,"another address is unaffected");
});

// ------------------------------------------------------------------ B7
test("B7 login: no user enumeration, malformed types are 401, limits are per IP+name",async()=>{
 await player("Logan");
 const unknown=await login(client(),"NoSuchPerson","wrongwrong1"),wrong=await login(client(),"Logan","wrongwrong1");
 assert.equal(unknown.status,401);assert.equal(wrong.status,401);
 assert.deepEqual(unknown.json,wrong.json,"identical bodies");
 assert.equal(unknown.headers.get("set-cookie"),null);assert.equal(wrong.headers.get("set-cookie"),null);
 const bodies=[{name:"Logan",password:123456789},{name:"Logan",password:null},{name:"Logan",password:["motdepasse1"]},{name:"Logan",password:{}},
  {name:"Logan"},{name:123,password:"motdepasse1"},{name:null,password:"motdepasse1"},{name:["Logan"],password:"motdepasse1"},
  {name:{},password:"motdepasse1"},{password:"motdepasse1"},{},{name:"Logan",password:""}];
 for(const b of bodies){const r=await client().call("POST","/api/login",b);assert.equal(r.status,401,JSON.stringify(b));}
 // Limits.
 const addr=ip(),codes=[];
 for(let n=0;n<6;n++)codes.push((await login(client(addr),"Logan","nope"+n)).status);
 assert.deepEqual(codes,[401,401,401,401,401,429]);
 assert.equal((await login(client(addr),"Logan")).status,429,"even the right password is refused while limited");
 assert.equal((await login(client(addr),"Nobody")).status,401,"another name from the same address is still just wrong");
 assert.equal((await login(client(),"Logan")).status,200,"the real player logs in from elsewhere");
});

// ------------------------------------------------------------------ B8
test("B8 sessions: capped at 10 per player, logout is idempotent and JSON-only",async()=>{
 const first=await player("Multi");const cookies=[first.cookie];
 for(let n=0;n<10;n++){const c=client();assert.equal((await login(c,"Multi")).status,200);cookies.push(c.cookie);}
 assert.equal((await replay(cookies[0])).status,401,"the oldest session was signed out");
 for(const ck of cookies.slice(1))assert.equal((await replay(ck)).status,200);
 const db=new DatabaseSync(dbOf("main"));
 assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE player_id=(SELECT id FROM players WHERE name='Multi')").get().n,10);db.close();

 const out=await client().call("POST","/api/logout",{});
 assert.equal(out.status,200);assert.deepEqual(out.json,{ok:true});
 assert.match(out.headers.get("set-cookie"),/Max-Age=0/);
 const bad=await client().call("POST","/api/logout","hello",{"Content-Type":"text/plain"});
 assert.equal(bad.status,415);
 const noType=await client().call("POST","/api/logout",undefined);
 assert.equal(noType.status,415);
 assert.equal((await replay(cookies[1])).status,200,"a failed logout kills nothing");
});

// ------------------------------------------------------------------ B10
test("B10 action responses: ok / refused shape, and me matches GET /api/me",async()=>{
 const c=await player("Actor");
 const ok=await c.call("POST","/api/action",{type:"pet"});
 assert.equal(ok.status,200);assert.equal(ok.json.ok,true);assert.equal(ok.json.petted,true);
 assert.deepEqual(Object.keys(ok.json.me).sort(),["chat","event","name","release","seenVersion","serverNow","speed","state","tz","version"]);
 assert.equal(ok.json.me.name,"Actor");assert.equal(ok.json.me.speed,1);assert.equal(ok.json.me.tz,DAY_TZ);
 assert.ok(Math.abs(ok.json.me.serverNow-Date.now())<60000);
 const again=await c.call("POST","/api/action",{type:"pet"});
 assert.equal(again.status,200);assert.equal(again.json.petted,false,"already petted this hour");
 const no=await c.call("POST","/api/action",{type:"buy",key:"caviar"});
 assert.equal(no.status,422);assert.equal(no.json.ok,false);assert.equal(typeof no.json.error,"string");assert.ok(no.json.error.length>0);
 assert.deepEqual(Object.keys(no.json.me).sort(),["chat","event","name","release","seenVersion","serverNow","speed","state","tz","version"]);
 const me=await c.call("GET","/api/me");
 assert.deepEqual(strip(me.json.state),strip(no.json.me.state));
 assert.equal(me.json.name,no.json.me.name);assert.equal(me.json.tz,no.json.me.tz);assert.equal(me.json.speed,no.json.me.speed);
 const deb=await c.call("POST","/api/action",{type:"debate"});
 assert.equal(deb.status,200);assert.equal(typeof deb.json.visit,"boolean");
 assert.deepEqual(strip((await c.call("GET","/api/me")).json.state),strip(deb.json.me.state));
 assert.equal((await client().call("POST","/api/action",{type:"pet"})).status,401,"no session, no action");
});

// ------------------------------------------------------------------ B11
test("B11 account deletion",async()=>{
 const c=await player("Delia"),watcher=await player("Delia Watcher");
 const other=client();assert.equal((await login(other,"Delia")).status,200);
 const db=new DatabaseSync(dbOf("main"));
 const id=db.prepare("SELECT id FROM players WHERE name='Delia'").get().id;
 const sessions=()=>db.prepare("SELECT COUNT(*) n FROM sessions WHERE player_id=?").get(id).n;
 assert.equal(sessions(),2);
 assert.equal((await c.call("DELETE","/api/account",{})).status,401,"missing password");
 assert.equal((await c.call("DELETE","/api/account",{password:12345678})).status,401,"numeric password");
 assert.equal((await c.call("DELETE","/api/account",{password:["motdepasse1"]})).status,401,"array password");
 assert.equal((await c.call("DELETE","/api/account",{password:"faux"})).status,401);
 assert.equal((await client().call("DELETE","/api/account",{password:"motdepasse1"})).status,401,"no session");
 assert.equal((await c.call("GET","/api/me")).status,200,"still there");
 assert.equal(sessions(),2);
 const del=await c.call("DELETE","/api/account",{password:"motdepasse1"});
 assert.equal(del.status,200);assert.match(del.headers.get("set-cookie"),/Max-Age=0/);
 assert.equal(sessions(),0,"sessions rows are gone");
 assert.equal(db.prepare("SELECT COUNT(*) n FROM players WHERE id=?").get(id).n,0);db.close();
 assert.equal((await replay(other.cookie)).status,401);
 const board=(await watcher.call("GET","/api/board")).json.board.map(r=>r.name);
 assert.ok(!board.includes("Delia"));assert.ok(board.includes("Delia Watcher"));
 // The name waits a day (deleting and signing up again must not reset the duel limits), then is free again.
 const soon=await reg(client(),"delia");
 assert.equal(soon.status,409);assert.equal(soon.json.error,"Ce pseudo vient d'être libéré, réessaie demain.");
 const tdb=new DatabaseSync(dbOf("main"),{timeout:5000});tdb.prepare("UPDATE tombstones SET deleted=deleted-864e5-1000").run();tdb.close();
 const again=await reg(client(),"Delia");
 assert.equal(again.status,201,"the name is free again after a day");
 assert.equal(again.json.state.lvl,1);
 assert.equal((await login(client(),"Delia")).status,200);
});

// ------------------------------------------------------------------ B12
test("B12 board: at most 40 feed entries newest first, ties broken by name",async()=>{
 const p=await boot(P.board);
 try{
  const names=Array.from({length:44},(_,n)=>`Cand ${String(n).padStart(2,"0")}`);
  for(let i=0;i<names.length;i+=4)await Promise.all(names.slice(i,i+4).map(n=>player(n,P.board)));
  await player("zed",P.board);await player("Bob",P.board);await player("alice",P.board);
  const last=await player("Éric",P.board);
  const b=(await last.call("GET","/api/board")).json;
  assert.equal(b.board.length,48);
  assert.equal(b.feed.length,40,"capped at 40");
  assert.equal(b.feed[0].player,"Éric","newest first");
  assert.equal(b.feed[1].player,"alice");assert.equal(b.feed[2].player,"Bob");assert.equal(b.feed[3].player,"zed");
  for(let i=1;i<b.feed.length;i++)assert.ok(b.feed[i-1].t>=b.feed[i].t,"time never increases down the feed");
  assert.ok(b.board.every(r=>r.score===0&&r.lvl===1),"everybody ties");
  const order=b.board.map(r=>r.name);
  assert.deepEqual(order,[...order].sort((x,y)=>x.localeCompare(y,"fr")),"ties sorted by name");
  assert.ok(order.indexOf("alice")<order.indexOf("Bob")&&order.indexOf("Bob")<order.indexOf("zed"),"alphabetical, not ASCII");
 }finally{await stop(p);}
});

// ------------------------------------------------------------------ B13
test("B13 live stream: others see a restart in the feed and on the board; /events needs a session",async()=>{
 const a=await player("Streamer A"),b=await player("Streamer B");
 assert.equal((await stream(P.main,"")).status,401);
 assert.equal((await stream(P.main,"pg_session=garbage")).status,401);
 const s=await stream(P.main,b.cookie);
 try{
  assert.equal(s.status,200);
  assert.ok(await s.waitFor(e=>e.event==="feedInit"),"initial snapshot arrives");
  const mark=s.events.length;
  const r=await a.call("POST","/api/action",{type:"restart",camp:"right"});
  assert.equal(r.status,200);
  const feed=await s.waitFor(e=>e.event==="feed"&&e.data.some(f=>f.player==="Streamer A"&&f.kind==="death"));
  assert.ok(feed,"the death is pushed to the other player");
  const board=await s.waitFor(e=>e.event==="board"&&e.data.some(x=>x.name==="Streamer A"&&x.deaths===1&&x.camp==="right"));
  assert.ok(board,"the board is pushed");
  assert.ok(s.events.indexOf(feed)>=mark);
  assert.ok(!s.events.some(e=>e.event==="me"&&e.data.name==="Streamer A"),"private state goes only to its owner");
 }finally{s.close();}
});

// ------------------------------------------------------------------ B14
test("B14 the sweep runs the clock and kills neglected players with no request at all",async()=>{
 const db=dbOf("b14");let p=await boot(P.sweep,{DB_PATH:db});
 let watcher,slacker;
 try{watcher=await player("Watcher",P.sweep);slacker=await player("Slacker",P.sweep);}finally{await stop(p);}
 const d=new DatabaseSync(db);
 const s=JSON.parse(d.prepare("SELECT state FROM players WHERE name='Slacker'").get().state);
 for(const k of ["sat","moral","energy","hyg"])s[k]=0;
 s.zero=0;
 d.prepare("UPDATE players SET state=? WHERE name='Slacker'").run(JSON.stringify(s));d.close();
 // 3600x: one game hour per real second, sweeps every 200 ms. Twelve hours at zero kill a player.
 p=await boot(P.sweep,{DB_PATH:db,POLITIGO_SPEED:"3600",SWEEP_MS:"200"});
 const live=await stream(P.sweep,watcher.cookie);
 try{
  assert.equal(live.status,200);
  const first=await live.waitFor(e=>e.event==="me");
  assert.ok(first);const v0=first.data.state.vclock;
  assert.equal(first.data.speed,3600);
  const later=await live.waitFor(e=>e.event==="me"&&e.data.state.vclock-v0>=2*H,20000);
  assert.ok(later,"the virtual clock advanced by itself (no HTTP request was made)");
  const death=await live.waitFor(e=>e.event==="feed"&&e.data.some(f=>f.player==="Slacker"&&f.kind==="death"),60000);
  assert.ok(death,"the neglected player died during a sweep");
  const row=(await watcher.call("GET","/api/board")).json;
  const sl=row.board.find(r=>r.name==="Slacker");
  assert.equal(sl.deaths,1);
  assert.ok(row.feed.some(f=>f.player==="Slacker"&&f.kind==="death"),"and the death is in the stored feed");
  const me=(await slacker.call("GET","/api/me")).json.state;
  assert.ok(me.deaths>=1);
  const dj=me.journal.find(j=>j.k==="death");assert.ok(dj);assert.equal(dj.d.reason,"neglect");
 }finally{live.close();await stop(p);}
});

// ------------------------------------------------------------------ B15
test("B15 configuration: time zone, invite length, trimming, invite.txt",async()=>{
 const code=await boot(P.config,{DB_PATH:dbOf("b15a"),POLITIGO_TZ:"Not/AZone"}).then(()=>null,c=>c);
 assert.ok(typeof code==="number"&&code!==0,"invalid POLITIGO_TZ: non-zero exit, got "+code);

 const ok16="abcdefghijklmnop",short15="abcdefghijklmno";
 assert.equal(ok16.length,16);assert.equal(short15.length,15);
 let p=await boot(P.config,{DB_PATH:dbOf("b15b"),POLITIGO_INVITE:ok16});
 try{
  assert.equal((await reg(client(ip(),P.config),"Sixteen",{invite:ok16})).status,201);
  assert.equal((await reg(client(ip(),P.config),"Sixteen B",{invite:short15})).status,403);
 }finally{await stop(p);}
 assert.equal(await boot(P.config,{DB_PATH:dbOf("b15c"),POLITIGO_INVITE:short15}).then(()=>null,c=>c),1,"15 characters refused");
 assert.equal(await boot(P.config,{DB_PATH:dbOf("b15d"),POLITIGO_INVITE:"   "+short15+"   "}).then(()=>null,c=>c),1,"padding does not count");

 p=await boot(P.config,{DB_PATH:dbOf("b15e"),POLITIGO_INVITE:"   "+ok16+"\t"});
 try{
  assert.equal((await reg(client(ip(),P.config),"Padded",{invite:ok16})).status,201,"surrounding whitespace is trimmed");
  assert.equal((await reg(client(ip(),P.config),"Padded B",{invite:"  "+ok16+"  "})).status,201,"and so is the submitted code");
 }finally{await stop(p);}

 // invite.txt: a too-short file is replaced, a good one is kept (and trimmed).
 const dir=mkdtempSync(join(tmpdir(),"pg-inv2-")),file=join(dir,"invite.txt"),logged=q=>q.out.match(/Invite code: (\S+)/)?.[1];
 writeFileSync(file,"short\n");
 p=await boot(P.config,{DB_PATH:join(dir,"i.db"),POLITIGO_INVITE:undefined});
 let fresh;
 try{
  fresh=logged(p);assert.ok(fresh&&fresh.length>=16&&fresh!=="short");
  assert.equal(readFileSync(file,"utf8").trim(),fresh);
 }finally{await stop(p);}
 writeFileSync(file,"  0123456789abcdef  \n");
 p=await boot(P.config,{DB_PATH:join(dir,"i.db"),POLITIGO_INVITE:undefined});
 try{
  assert.equal(logged(p),undefined,"a kept code is not printed again");assert.ok(!p.out.includes("0123456789abcdef"));
  assert.match(p.out,/Code d'invitation : voir .*invite\.txt ou la console d'admin/);
  assert.equal((await reg(client(ip(),P.config),"FromFile",{invite:"0123456789abcdef"})).status,201);
 }finally{await stop(p);}
 writeFileSync(file,"");
 p=await boot(P.config,{DB_PATH:join(dir,"i.db"),POLITIGO_INVITE:undefined});
 try{assert.ok(logged(p)&&logged(p).length>=16,"an empty file is replaced");}finally{await stop(p);}
});

// ------------------------------------------------------------------ B16
test("B16 routing: JSON 404s, wrong methods, no-store, malformed URLs",async()=>{
 const c=client();
 const nf=await c.call("GET","/api/nope");
 assert.equal(nf.status,404);assert.equal(nf.json.ok,false);assert.equal(typeof nf.json.error,"string");
 for(const [m,path,body] of [["GET","/api/register"],["GET","/api/login"],["GET","/api/logout"],["POST","/api/health",{}],["POST","/api/me",{}],
  ["DELETE","/api/me"],["PUT","/api/action",{}],["GET","/api/action"],["POST","/api/board",{}],["GET","/api/account"],["POST","/events",{}],["GET","/"],["GET","/api"],["GET","/api/health/"]]){
  const r=await c.call(m,path,body);
  assert.equal(r.status,404,`${m} ${path}`);assert.equal(r.json?.ok,false,`${m} ${path}`);
 }
 for(const [m,path] of [["GET","/api/health"],["GET","/api/nope"],["GET","/api/me"],["POST","/api/login"]]){
  const r=await c.call(m,path,m==="POST"?{}:undefined);
  assert.equal(r.headers.get("cache-control"),"no-store",`${m} ${path} -> ${r.status}`);
  assert.match(r.headers.get("content-type"),/^application\/json/);
 }
 for(const path of ["/%E0%A4%A","/%","/api/%zz","/api/me?x=%zz","/%00","/api/../../etc/passwd","/"+"a".repeat(5000),"/api/me?"+"q=1&".repeat(500)]){
  const r=await raw(P.main,path);
  assert.ok([400,401,404,414,431].includes(r.status),`${path.slice(0,20)} -> ${r.status}`);
  if(r.status===404)assert.equal(JSON.parse(r.body).ok,false);
 }
 const r=await raw(P.main,"//");   // an empty-host request target is just not found, never a 500
 assert.equal(r.status,404,"'//' got "+r.status);
 assert.equal((await raw(P.main,"/api/health")).status,200,"the server is still alive");
 assert.equal((await c.call("GET","/api/health")).json.ok,true);
});

// ------------------------------------------------------------------ B17
test("B17 cookie parsing: extra cookies are fine, garbage tokens are 401 and never 500",async()=>{
 const c=await player("Cookie Jar");const token=c.cookie.split("=").slice(1).join("=");
 const name="pg_session";
 for(const header of [c.cookie,`a=b; ${c.cookie}; z=1`,`${c.cookie};`,`x=1;${c.cookie}`,`  a = b ;   ${name} = ${token}`.replace(/ = /g,"="),`flag; ${c.cookie}`]){
  const r=await client().call("GET","/api/me",undefined,{Cookie:header});
  assert.equal(r.status,200,header.slice(0,40));assert.equal(r.json.name,"Cookie Jar");
 }
 for(const header of [`${name}=garbage`,`${name}=`,`${name}`,`${name}=%%%`,`${name}=a=b=c`,`${name}=${"x".repeat(8000)}`,`${name}=${token}x`,`x${name}=${token}`,
  "a=b; c=d",";;;",`=${token}`,`${name}=${token.slice(1)}`,`${name}=${token.toUpperCase()}`]){
  const r=await client().call("GET","/api/me",undefined,{Cookie:header});
  assert.equal(r.status,401,header.slice(0,40));assert.equal(r.json.ok,false);
 }
 assert.equal((await c.call("GET","/api/me")).status,200,"the real session is untouched");
 assert.equal((await client().call("POST","/api/action",{type:"pet"},{Cookie:`${name}=garbage`})).status,401);
});
