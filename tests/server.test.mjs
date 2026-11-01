// Server tests: a real server process on a temporary database, driven over HTTP (node --test).
// Run inside the API image layout: server.mjs and rules.mjs side by side (see tests/run-server.sh).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";

const PORT=3999,BASE=`http://127.0.0.1:${PORT}`,INVITE="code-secret-de-test-123";
// The server runs in a time zone where it is early afternoon right now: daytime-only actions are always testable.
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
let proc,DIR;
function boot(port,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(DIR,`${port}.db`),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(code));});
}
const stop=p=>new Promise(r=>{p.on("exit",r);p.kill();});
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pg-"));proc=await boot(PORT,{DB_PATH:join(DIR,"t.db")});});
after(()=>proc.kill("SIGTERM"));

// A tiny cookie-keeping client per player.
function client(ip="10.0.0.1"){
 let cookie="";
 const call=async(method,path,body,headers={})=>{
  const r=await fetch(BASE+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip,...headers},
   body:body===undefined?undefined:typeof body==="string"?body:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json,headers:r.headers};
 };
 return {call,get cookie(){return cookie;}};
}
const reg=(c,name,extra={})=>c.call("POST","/api/register",{name,password:"motdepasse1",invite:INVITE,camp:"left",...extra});

test("registration needs the invite code, a valid name and a long enough password",async()=>{
 // Each attempt from its own address: every attempt counts towards the 3 an hour per address.
 assert.equal((await reg(client("10.0.0.20"),"Alice",{invite:"faux"})).status,403);
 assert.equal((await reg(client("10.0.0.21"),"a")).status,400);
 assert.equal((await reg(client("10.0.0.22"),"Alice",{password:"court"})).status,400);
 assert.equal((await reg(client("10.0.0.23"),"Alice",{camp:"centre"})).status,400);
 const r=await reg(client("10.0.0.2"),"Alice");
 assert.equal(r.status,201);assert.equal(r.json.state.lvl,1);assert.equal(r.json.name,"Alice");
 assert.equal((await reg(client("10.0.0.3"),"alice")).status,409,"names are unique, case-insensitively");
});

test("the session cookie is HttpOnly and SameSite, and the password is never sent back",async()=>{
 const c=client("10.0.0.4");const r=await reg(c,"Bob");
 const set=r.headers.get("set-cookie");
 assert.match(set,/HttpOnly/);assert.match(set,/SameSite=Lax/);
 assert.ok(!JSON.stringify(r.json).includes("motdepasse1"));
 const me=await c.call("GET","/api/me");assert.equal(me.status,200);assert.equal(me.json.name,"Bob");
 assert.equal((await client().call("GET","/api/me")).status,401,"no cookie, no game");
});

test("login works, wrong passwords are refused, and brute force is rate-limited",async()=>{
 const c=client("10.0.0.5");await reg(c,"Chloé");
 assert.equal((await client("10.0.0.5").call("POST","/api/login",{name:"chloé",password:"motdepasse1"})).status,200);
 const bad=client("10.0.0.6");let last;
 for(let i=0;i<11;i++)last=await bad.call("POST","/api/login",{name:"Chloé",password:"nope"+i});
 assert.equal(last.status,429);
});

test("actions are applied by the server and refused when not allowed",async()=>{
 const c=client("10.0.0.7");await reg(c,"David");
 const ok=await c.call("POST","/api/action",{type:"debate"});
 assert.equal(ok.status,200);assert.ok(ok.json.me.state.xp>0);
 const bad=await c.call("POST","/api/action",{type:"buy",key:"caviar"});
 assert.equal(bad.status,422);assert.ok(bad.json.error);
});

test("a forged Pong score is refused",async()=>{
 const c=client("10.0.0.8");await reg(c,"Emma");
 assert.equal((await c.call("POST","/api/action",{type:"pongEnd",score:1})).status,422,"no end without a start");
 const s1=await c.call("POST","/api/action",{type:"pongStart"});assert.equal(s1.status,200);
 const end=await c.call("POST","/api/action",{type:"pongEnd",score:30,id:s1.json.game.id});
 assert.equal(end.status,422);assert.match(end.json.error,/Score refusé/);
 const s2=await c.call("POST","/api/action",{type:"pongStart"});assert.equal(s2.status,200);
 await new Promise(r=>setTimeout(r,2200));
 const ok=await c.call("POST","/api/action",{type:"pongEnd",score:1,id:s2.json.game.id});assert.equal(ok.status,200,JSON.stringify(ok.json));
 const again=await c.call("POST","/api/action",{type:"pongEnd",score:1,id:s2.json.game.id});
 assert.equal(again.status,422,"a result cannot be replayed");assert.equal(again.json.me.state.xp,ok.json.me.state.xp);
});

test("cross-site writes are refused: JSON only, same origin only",async()=>{
 const c=client("10.0.0.9");await reg(c,"Farid");
 assert.equal((await c.call("POST","/api/action","type=debate",{"Content-Type":"application/x-www-form-urlencoded"})).status,415);
 assert.equal((await c.call("POST","/api/action",{type:"pet"},{Origin:"https://evil.example"})).status,403);
 assert.equal((await c.call("POST","/api/action",{type:"pet"},{Origin:"null"})).status,403,"an opaque origin is refused");
 assert.ok([200,422].includes((await c.call("POST","/api/action",{type:"pet"},{Origin:BASE})).status),"our own origin, port included, is accepted");
 // fetch() cannot forge a Host header, so the port-dropping proxy case goes through node:http.
 const {request}=await import("node:http");
 const status=await new Promise(ok=>{const r=request({host:"127.0.0.1",port:PORT,path:"/api/action",method:"POST",
  headers:{Host:"127.0.0.1",Origin:"https://127.0.0.1","Content-Type":"application/json",Cookie:c.cookie}},res=>{res.resume();ok(res.statusCode);});r.end('{"type":"pet"}');});
 assert.ok([200,422].includes(status),"a proxy that drops the port is accepted");
 assert.equal((await c.call("DELETE","/api/account","password=motdepasse1",{"Content-Type":"text/plain"})).status,415);
 assert.equal((await c.call("GET","/api/me")).status,200,"the account is still there");
 assert.equal((await c.call("POST","/api/action","x".repeat(5000))).status,413);
 assert.equal((await c.call("POST","/api/action","{oops")).status,400);
});

test("the leaderboard ranks players by combined score",async()=>{
 const c=client("10.0.0.10");await reg(c,"Gaëlle");
 const b=await c.call("GET","/api/board");
 assert.equal(b.status,200);
 const names=b.json.board.map(r=>r.name);
 assert.ok(names.includes("Gaëlle")&&names.includes("Alice"));
 const scores=b.json.board.map(r=>r.score);assert.deepEqual(scores,[...scores].sort((x,y)=>y-x));
 assert.ok(b.json.feed.some(f=>f.kind==="new"&&f.player==="Gaëlle"),"joining is announced in the feed");
 assert.ok(!JSON.stringify(b.json).includes("scrypt"),"no password hash leaks");
});

test("the live stream sends the player, the board and the feed",async()=>{
 const c=client("10.0.0.11");await reg(c,"Hugo");
 const r=await fetch(BASE+"/events",{headers:{Cookie:c.cookie,"X-Forwarded-For":"10.0.0.11"}});
 assert.equal(r.headers.get("content-type").split(";")[0],"text/event-stream");
 const reader=r.body.getReader();let text="";
 const deadline=Date.now()+5000;
 while(!(text.includes("event: me")&&text.includes("event: board")&&text.includes("event: feedInit"))){
  const {value,done}=await reader.read();if(done||Date.now()>deadline)break;text+=new TextDecoder().decode(value);
 }
 await reader.cancel();
 assert.ok(text.includes('"name":"Hugo"'));
});

// Opens a live stream and resolves with {done} once the server closes it (or "open" after `wait` ms).
async function stream(c,ip,wait){
 const r=await fetch(BASE+"/events",{headers:{Cookie:c.cookie,"X-Forwarded-For":ip}});
 const reader=r.body.getReader();
 const closed=(async()=>{for(;;){const {done}=await reader.read();if(done)return "closed";}})();
 return {status:r.status,state:()=>Promise.race([closed,new Promise(ok=>setTimeout(()=>ok("open"),wait))]),stop:()=>reader.cancel().catch(()=>{})};
}
test("a player holds at most 3 live streams: a 4th pushes out the oldest",async()=>{
 const c=client("10.0.1.20");await reg(c,"Yann");
 const s=[];for(let i=0;i<4;i++)s.push(await stream(c,"10.0.1.20",300));
 assert.equal(await s[0].state(),"closed");
 for(const x of s.slice(1))assert.equal(await x.state(),"open");
 for(const x of s)await x.stop();
});

// Old cookies are replayed on purpose: the session must be dead on the server, not just forgotten by the browser.
const replay=(cookie,path="/api/me")=>client("10.0.0.99").call("GET",path,undefined,{Cookie:cookie});
test("logout ends the session and account deletion needs the password",async()=>{
 const c=client("10.0.0.12");await reg(c,"Inès");const first=c.cookie;
 const other=client("10.0.0.14");await other.call("POST","/api/login",{name:"Inès",password:"motdepasse1"});const second=other.cookie;
 const live=await stream(c,"10.0.0.12",400);
 assert.equal((await c.call("DELETE","/api/account",{password:"faux"})).status,401);
 assert.equal((await c.call("DELETE","/api/account",{password:"motdepasse1"})).status,200);
 for(const ck of [first,second])assert.equal((await replay(ck)).status,401,"every session of the account is gone");
 assert.equal(await live.state(),"closed","its live stream is closed");

 const b=await client("10.0.0.2").call("POST","/api/login",{name:"Inès",password:"motdepasse1"});
 assert.equal(b.status,401,"the account is gone");
 const d=client("10.0.0.13");await reg(d,"Jules");const old=d.cookie;
 assert.equal((await d.call("POST","/api/logout",{})).status,200);
 assert.equal((await replay(old)).status,401,"logout kills the token on the server");
});

test("an expired session is refused",async()=>{
 const c=client("10.0.1.6");await reg(c,"Odile");
 const db=new DatabaseSync(join(DIR,"t.db"),{timeout:5000});db.exec("UPDATE sessions SET expires=1 WHERE player_id=(SELECT id FROM players WHERE name='Odile')");db.close();
 assert.equal((await c.call("GET","/api/me")).status,401);
});

test("spoofed leading X-Forwarded-For entries do not dodge the registration limit",async()=>{
 let last;for(let i=0;i<6;i++)last=await reg(client(`6.6.6.${i}, 10.9.9.9`),"Spoof"+i,{invite:"faux"});
 assert.equal(last.status,429);
});

test("type-confused actions are refused and never corrupt the state",async()=>{
 const c=client("10.0.1.9");await reg(c,"Rita");
 const bad=[{type:"buy",key:{}},{type:"buy",key:["soup"]},{type:["debate"]},{type:"equip",i:"1"},{type:"equip",i:1.5},
  {type:"restart",camp:["left"]},{type:"restart",camp:"__proto__"},{type:"pongEnd",score:"5"},{type:"pongEnd",score:1e308},{type:"pongEnd",score:-1},{},{type:"rematch"}];
 for(const a of bad)assert.equal((await c.call("POST","/api/action",a)).status,422,JSON.stringify(a));
 for(const raw of ["[]","null","123",'"x"',"[".repeat(3000)])assert.equal((await c.call("POST","/api/action",raw)).status,400,raw.slice(0,10));
 const me=(await c.call("GET","/api/me")).json.state;
 assert.equal(me.lvl,1);assert.equal(me.deaths,0);assert.ok(Number.isFinite(me.xp));
 assert.equal((await client().call("GET","/api/health")).status,200);
});

test("parallel actions cannot beat the per-visit allowance; parallel sign-ups of one name make one account",async()=>{
 const c=client("10.0.1.11");await reg(c,"Tom");
 const rs=await Promise.all(Array.from({length:8},()=>c.call("POST","/api/action",{type:"debate"})));
 assert.equal(rs.filter(r=>r.status===200).length,2);
 const n=await Promise.all(Array.from({length:4},(_,i)=>reg(client(`10.0.2.${i}`),"Twin")));
 assert.equal(n.filter(r=>r.status===201).length,1);assert.ok(n.every(r=>[201,409].includes(r.status)));
});

test("board rows and feed entries expose only public fields, and need a session",async()=>{
 assert.equal((await client("10.0.1.12").call("GET","/api/board")).status,401);
 const c=client("10.0.1.13");await reg(c,"Uma");const b=(await c.call("GET","/api/board")).json;
 const pub=["name","camp","candidate","lvl","score","form","streak","bestStreak","deaths","asleep","online","outfit","object","dw","dl"].sort();   // 1.6.0: the portraits and the duel record
 for(const r of b.board)assert.deepEqual(Object.keys(r).sort(),pub);
 for(const f of b.feed)assert.deepEqual(Object.keys(f).sort(),["id","kind","player","t","text"]);   // id: the admin deletes a line by it
});

test("names: accents and case do not make a new player; look-alike scripts and markup are refused",async()=>{
 assert.equal((await reg(client("10.0.1.15"),"Zoe\u0301")).status,201);
 assert.equal((await reg(client("10.0.1.16"),"ZOÉ")).status,409);
 assert.equal((await reg(client("10.0.1.21"),"zoe")).status,409,"accents are ignored in the uniqueness key");
 assert.equal((await client("10.0.1.17").call("POST","/api/login",{name:"Zoé",password:"motdepasse1"})).status,200);
 for(const [i,n] of ["Zo\u200Bé","<b>xx</b>","😀😀😀","  ","Ѕіmоn"].entries())assert.equal((await reg(client("10.0.1."+(190+i)),n)).status,400,n);
});

test("a wrong password from strangers does not lock the real player out",async()=>{
 const c=client("10.0.1.22");await reg(c,"Victor");
 for(let i=0;i<12;i++)await client(`10.0.3.${i}`).call("POST","/api/login",{name:"Victor",password:"nope"});
 assert.equal((await client("10.0.1.23").call("POST","/api/login",{name:"Victor",password:"motdepasse1"})).status,200);
});

test("cookies are Secure and __Host- by default, and a weak invite code stops the server",async()=>{
 const p=await boot(3998,{COOKIE_SECURE:undefined});
 try{
  const r=await fetch("http://127.0.0.1:3998/api/register",{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":"10.0.1.7"},
   body:JSON.stringify({name:"Paul",password:"motdepasse1",invite:INVITE,camp:"left"})});
  const set=r.headers.get("set-cookie");assert.match(set,/^__Host-pg_session=/);assert.match(set,/; Secure/);
 }finally{p.kill();}
 for(const weak of ["court","change-moi-en-un-code-long"])await assert.rejects(boot(3996,{POLITIGO_INVITE:weak}),code=>code===1,weak);
});

test("without POLITIGO_INVITE a code is generated once, logged only then and kept; off closes registrations",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pg-inv-")),db=join(dir,"i.db"),logged=p=>p.out.match(/Invite code: (\S+)/)?.[1];
 const register=(invite,name)=>fetch("http://127.0.0.1:3995/api/register",{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":"10.0.4.1"},
  body:JSON.stringify({name,password:"motdepasse1",invite,camp:"left"})}).then(r=>r.status);
 let p=await boot(3995,{POLITIGO_INVITE:undefined,DB_PATH:db});
 const code=logged(p);await stop(p);
 assert.match(code,/^politigo-[\w-]{16}$/);
 assert.equal(readFileSync(join(dir,"invite.txt"),"utf8").trim(),code);
 p=await boot(3995,{POLITIGO_INVITE:"",DB_PATH:db});
 try{
  assert.equal(logged(p),undefined,"printed when generated only");assert.ok(!p.out.includes(code));
  assert.match(p.out,/Code d'invitation : voir .*invite\.txt ou la console d'admin/);
  assert.equal(await register("politigo-pas-le-bon-code","Hugo"),403);
  assert.equal(await register(code,"Hugo"),201);
 }finally{await stop(p);}
 p=await boot(3995,{POLITIGO_INVITE:"off",DB_PATH:db});
 try{assert.equal(logged(p),undefined);assert.equal(await register(code,"Ines"),403);}finally{await stop(p);}
});

test("a stream pushed out by a 4th one is told to stay closed (no endless reconnect ping-pong)",async()=>{
 const c=client("10.0.1.40");await reg(c,"Basile");
 const first=await fetch(BASE+"/events",{headers:{Cookie:c.cookie,"X-Forwarded-For":"10.0.1.40"}});
 const text=(async()=>{const rd=first.body.getReader(),dec=new TextDecoder();let all="";for(;;){const {done,value}=await rd.read();if(done)return all;all+=dec.decode(value);}})();
 const more=[];for(let i=0;i<3;i++)more.push(await stream(c,"10.0.1.40",300));
 assert.match(await text,/event: bye/);
 for(const x of more)await x.stop();
});

test("account deletion attempts are rate limited (each one costs a password hash)",async()=>{
 const c=client("10.0.1.41");await reg(c,"Romane");
 const codes=[];for(let i=0;i<6;i++)codes.push((await c.call("DELETE","/api/account",{password:"faux"})).status);
 assert.deepEqual(codes,[401,401,401,401,401,429]);
});

test("health checks the database, and a shutdown writes every clock (a restart never sets game time back)",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pg-stop-")),db=join(dir,"s.db"),url="http://127.0.0.1:3994";
 let p=await boot(3994,{DB_PATH:db,POLITIGO_SPEED:"600"});
 try{
  assert.deepEqual(await (await fetch(url+"/api/health")).json(),{ok:true});
  const r=await fetch(url+"/api/register",{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":"10.0.4.2"},
   body:JSON.stringify({name:"Horloge",password:"motdepasse1",invite:INVITE,camp:"right"})});
  assert.equal(r.status,201);
  await new Promise(ok=>setTimeout(ok,1500));     // ~15 game minutes, kept in memory by the sweep
 }finally{await stop(p);}
 const row=new DatabaseSync(db).prepare("SELECT state FROM players").get(),S=JSON.parse(row.state);
 assert.ok(S.vclock-S.born>=10*60e3,`saved clock only ${(S.vclock-S.born)/60e3} game minutes after sign-up`);
});

test("an unreadable saved game is set aside in a file before the player restarts",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pg-bad-")),db=join(dir,"b.db"),url="http://127.0.0.1:3993";
 let p=await boot(3993,{DB_PATH:db});
 try{
  const r=await fetch(url+"/api/register",{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":"10.0.4.3"},
   body:JSON.stringify({name:"Cassé",password:"motdepasse1",invite:INVITE,camp:"left"})});
  assert.equal(r.status,201);
 }finally{await stop(p);}
 const d=new DatabaseSync(db);d.prepare("UPDATE players SET state='{pas du json'").run();d.close();
 p=await boot(3993,{DB_PATH:db});await stop(p);
 const kept=readdirSync(dir).filter(f=>f.endsWith(".bad.json"));
 assert.equal(kept.length,1);assert.equal(readFileSync(join(dir,kept[0]),"utf8"),"{pas du json");
});
