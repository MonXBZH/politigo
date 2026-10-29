// Admin socket tests: a real server on a temporary database, administered through the Unix socket and the admin.mjs CLI (node --test).
// Run inside the API image layout: server.mjs, rules.mjs and admin.mjs side by side.
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,statSync,existsSync,writeFileSync,readFileSync} from "node:fs";
import {createConnection} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";

const INVITE="code-secret-de-test-123",ADMIN=process.env.ADMIN||"/app/admin.mjs",PW="motdepasse1";
// The server runs in a time zone where it is early afternoon right now: daytime-only actions are always testable.
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
const DIR=mkdtempSync(join(tmpdir(),"pga-"));
let seq=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function boot(port,sock,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(DIR,`${port}.db`),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,POLITIGO_ADMIN_SOCKET:sock,...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";p.gone=false;
 p.on("exit",()=>{p.gone=true;});
 p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(new Error("server exited "+code+": "+p.err)));});
}
const stop=(p,sig="SIGTERM")=>new Promise(r=>{if(p.gone)return r();p.on("exit",r);p.kill(sig);});

// One server per test, with its own port, database file and socket.
async function setup(port,{sock,extra}={}){
 const d=mkdtempSync(join(DIR,"s"+(seq++)+"-"));
 sock=sock??join(d,"admin.sock");
 const db=join(d,"t.db"),p=await boot(port,sock,{DB_PATH:db,...extra});
 return {p,sock,db,port,base:`http://127.0.0.1:${port}`};
}

// A tiny cookie-keeping client per player.
function client(S,ip="10.0.0.1"){
 let cookie="";
 const call=async(method,path,body,headers={})=>{
  const r=await fetch(S.base+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip,...headers},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json,headers:r.headers};
 };
 return {call,get cookie(){return cookie;}};
}
const reg=(c,name,extra={})=>c.call("POST","/api/register",{name,password:PW,invite:INVITE,camp:"left",...extra});
const login=(S,ip,name,password)=>client(S,ip).call("POST","/api/login",{name,password});

// Runs the CLI and collects stdout, stderr and the exit code.
function runAdmin(S,args,{input,env}={}){
 return new Promise((ok,ko)=>{
  const p=spawn("node",[ADMIN,...args],{env:{...process.env,POLITIGO_ADMIN_SOCKET:S.sock,...env},stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="";
  p.stdout.on("data",d=>{stdout+=d;});p.stderr.on("data",d=>{stderr+=d;});
  p.stdin.on("error",()=>{});
  if(input!==undefined)p.stdin.write(input);
  p.stdin.end();
  const t=setTimeout(()=>{p.kill();ko(new Error("admin CLI timed out"));},15e3);
  p.on("exit",code=>{clearTimeout(t);ok({code,stdout,stderr});});
 });
}
// Raw protocol: sends the payload as is, resolves with the reply text ("" when closed without reply).
function rawAdmin(sock,payload){
 return new Promise((ok,ko)=>{
  const c=createConnection(sock);let text="";
  const t=setTimeout(()=>{c.destroy();ko(new Error("admin socket did not answer or close"));},5e3);
  const done=()=>{clearTimeout(t);ok(text);};
  c.on("data",d=>{text+=d;});c.on("close",done);c.on("error",()=>{});
  c.on("connect",()=>{c.write(payload);});
 });
}
const rawJson=async(sock,obj)=>JSON.parse((await rawAdmin(sock,JSON.stringify(obj)+"\n")).trim());
const newPassword=r=>(r.stdout.match(/^Nouveau mot de passe : (.+)$/m)||[])[1]?.trim();
// Fires failed logins until the lockout answers 429 (5 per address+name, the 6th is refused).
async function lockOut(S,ip,name){
 for(let i=0;i<5;i++)assert.equal((await login(S,ip,name,"mauvais"+i)).status,401);
 assert.equal((await login(S,ip,name,PW)).status,429,"locked out even with the right password");
}

test("the admin socket is created with mode 0600, and 'off' disables it",async()=>{
 const S=await setup(3950);
 try{
  const st=statSync(S.sock);
  assert.ok(st.isSocket());assert.equal(st.mode&0o777,0o600);
 }finally{await stop(S.p);}
 const sock=join(DIR,"never.sock");
 const O=await setup(3951,{sock:"off"});
 try{
  assert.ok(!existsSync("off"));assert.ok(!existsSync(sock));
  const r=await runAdmin({sock:"off"},["list"]);
  assert.equal(r.code,1);assert.ok(r.stderr.trim().length>0);
 }finally{await stop(O.p);}
});

test("the CLI lists registered players and the raw reply never carries password hashes",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.1.0.1"),"Alice");await reg(client(S,"10.1.0.2"),"Bob");
  const r=await runAdmin(S,["list"]);
  assert.equal(r.code,0);assert.match(r.stdout,/Alice/);assert.match(r.stdout,/Bob/);
  const raw=await rawAdmin(S.sock,'{"cmd":"list"}\n');
  assert.ok(!raw.includes("scrypt$"));
  const j=JSON.parse(raw.trim());
  assert.equal(j.ok,true);assert.deepEqual(j.players.map(p=>p.name).sort(),["Alice","Bob"]);
  for(const p of j.players){assert.ok("created" in p&&"updated" in p);assert.deepEqual(Object.keys(p).sort(),["created","name","updated"]);}
 }finally{await stop(S.p);}
});

test("resetting with a generated password swaps the credentials, revokes sessions and keeps the game",async()=>{
 const S=await setup(3950);
 try{
  const c=client(S,"10.2.0.1");await reg(c,"Alice");
  const before=(await c.call("GET","/api/me")).json;
  const r=await runAdmin(S,["reset-password","Alice"]);
  assert.equal(r.code,0);
  const pw=newPassword(r);
  assert.ok(pw&&pw.length>=16,"a strong generated password is printed");
  assert.equal((await login(S,"10.2.0.2","Alice",PW)).status,401);
  assert.equal((await c.call("GET","/api/me")).status,401,"the old session is revoked");
  const again=client(S,"10.2.0.3");
  assert.equal((await again.call("POST","/api/login",{name:"Alice",password:pw})).status,200);
  const me=(await again.call("GET","/api/me")).json;
  assert.equal(me.name,before.name);assert.equal(me.state.lvl,before.state.lvl);
 }finally{await stop(S.p);}
});

test("the reset finds the player regardless of case and accents",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.3.0.1"),"Chloé");
  const r=await runAdmin(S,["reset-password","chloe","--stdin"],{input:"nouveau-secret-42\n"});
  assert.equal(r.code,0);
  assert.equal((await login(S,"10.3.0.2","Chloé",PW)).status,401);
  assert.equal((await login(S,"10.3.0.3","Chloé","nouveau-secret-42")).status,200);
  const raw=await rawJson(S.sock,{cmd:"reset-password",name:"CHLOÉ",password:"encore-un-autre-1"});
  assert.equal(raw.ok,true);assert.equal(raw.name,"Chloé");
 }finally{await stop(S.p);}
});

test("--stdin reads the password without echoing it, and refuses a too short one",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.4.0.1"),"Alice");
  const short=await runAdmin(S,["reset-password","Alice","--stdin"],{input:"court\n"});
  assert.equal(short.code,1);assert.ok(short.stderr.trim().length>0);
  assert.equal((await login(S,"10.4.0.2","Alice",PW)).status,200,"old password still works");
  const ok=await runAdmin(S,["reset-password","Alice","--stdin"],{input:"mot-de-passe-stdin\r\n"});
  assert.equal(ok.code,0);assert.ok(!ok.stdout.includes("mot-de-passe-stdin"));
  assert.equal((await login(S,"10.4.0.3","Alice","mot-de-passe-stdin")).status,200,"CRLF is stripped");
  assert.equal((await login(S,"10.4.0.4","Alice",PW)).status,401);
 }finally{await stop(S.p);}
});

test("a password given as an argument is refused and nothing changes",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.5.0.1"),"Alice");
  const r=await runAdmin(S,["reset-password","Alice","nouveau-secret-42"]);
  assert.equal(r.code,2);assert.ok(r.stderr.trim().length>0);
  assert.ok(!r.stdout.includes("nouveau-secret-42"));
  assert.equal((await login(S,"10.5.0.2","Alice",PW)).status,200);
  assert.equal((await login(S,"10.5.0.3","Alice","nouveau-secret-42")).status,401);
 }finally{await stop(S.p);}
});

test("unknown players exit 1 with 'introuvable', and usage errors exit 2",async()=>{
 const S=await setup(3950);
 try{
  for(const args of [["unlock","Fantome"],["reset-password","Fantome"]]){
   const r=await runAdmin(S,args);
   assert.equal(r.code,1,args.join(" "));assert.match(r.stderr,/introuvable/i);
  }
  const r=await runAdmin(S,["reset-password","Fantome","--stdin"],{input:"mot-de-passe-long\n"});
  assert.equal(r.code,1);assert.match(r.stderr,/introuvable/i);
  const none=await runAdmin(S,[]);assert.equal(none.code,2);assert.ok(none.stderr.trim().length>0);
  const bad=await runAdmin(S,["exploser"]);assert.equal(bad.code,2);assert.ok(bad.stderr.trim().length>0);
  const noName=await runAdmin(S,["unlock"]);assert.equal(noName.code,2);
 }finally{await stop(S.p);}
});

test("unlock lifts a brute-force lockout immediately",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.6.0.1"),"Alice");
  await lockOut(S,"10.6.0.9","Alice");
  const r=await runAdmin(S,["unlock","Alice"]);
  assert.equal(r.code,0);
  assert.equal((await login(S,"10.6.0.9","Alice",PW)).status,200);
  const raw=await rawJson(S.sock,{cmd:"unlock",name:"alice"});
  assert.equal(raw.ok,true);assert.equal(raw.name,"Alice");assert.equal(typeof raw.cleared,"number");
 }finally{await stop(S.p);}
});

test("a password reset also clears the lockout",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.7.0.1"),"Alice");
  await lockOut(S,"10.7.0.9","Alice");
  const r=await runAdmin(S,["reset-password","Alice","--stdin"],{input:"mot-de-passe-neuf\n"});
  assert.equal(r.code,0);
  assert.equal((await login(S,"10.7.0.9","Alice","mot-de-passe-neuf")).status,200);
 }finally{await stop(S.p);}
});

test("an open event stream of the player is closed by the reset",async()=>{
 const S=await setup(3950);
 try{
  const c=client(S,"10.8.0.1");await reg(c,"Alice");
  const ac=new AbortController();
  const res=await fetch(S.base+"/events",{headers:{Cookie:c.cookie,"X-Forwarded-For":"10.8.0.1"},signal:ac.signal});
  assert.equal(res.status,200);
  // Drain the stream in the background; it resolves when the server ends it.
  const ended=(async()=>{try{const rd=res.body.getReader();for(;;){const {done}=await rd.read();if(done)return "closed";}}catch{return "closed";}})();
  await sleep(200);
  const r=await runAdmin(S,["reset-password","Alice","--stdin"],{input:"mot-de-passe-neuf\n"});
  assert.equal(r.code,0);
  const outcome=await Promise.race([ended,sleep(3000).then(()=>"open")]);
  ac.abort();
  assert.equal(outcome,"closed","the stream ended within 3 s");
 }finally{await stop(S.p);}
});

test("the raw protocol rejects bad input and survives oversized requests",async()=>{
 const S=await setup(3950);
 try{
  const bad=JSON.parse((await rawAdmin(S.sock,"ceci n'est pas du json\n")).trim());
  assert.equal(bad.ok,false);assert.ok(bad.error);
  const unk=await rawJson(S.sock,{cmd:"formater-le-disque"});
  assert.equal(unk.ok,false);
  // The server checks the password itself, whatever the client: too short and too long are refused, nothing changes.
  await reg(client(S,"10.8.0.1"),"Alice");
  for(const password of ["court","x".repeat(201),12345678]){
   const r=await rawJson(S.sock,{cmd:"reset-password",name:"Alice",password});
   assert.equal(r.ok,false);assert.match(r.error,/8 à 200/);
  }
  assert.equal((await login(S,"10.8.0.2","Alice",PW)).status,200,"the password is unchanged");
  const huge=await rawAdmin(S.sock,"x".repeat(5000));   // resolves only once the server closed the connection
  assert.equal(JSON.parse(huge.trim()).ok,false);
  const longLine=await rawAdmin(S.sock,JSON.stringify({cmd:"list",pad:"x".repeat(5000)})+"\n");
  assert.equal(JSON.parse(longLine.trim()).ok,false,"a line over 4096 bytes is refused even with its newline");
  const h=await fetch(S.base+"/api/health");assert.equal(h.status,200);
  assert.equal((await rawJson(S.sock,{cmd:"list"})).ok,true,"the socket still serves requests");
 }finally{await stop(S.p);}
});

test("a stale socket left by a crash is replaced, a regular file in the way is respected",async()=>{
 const S=await setup(3950);
 let S2,S3;
 try{
  await reg(client(S,"10.9.0.1"),"Alice");
  await stop(S.p,"SIGKILL");
  assert.ok(existsSync(S.sock),"a killed server leaves its socket behind");
  S2=await boot(3950,S.sock,{DB_PATH:S.db});
  assert.ok(statSync(S.sock).isSocket());
  const r=await runAdmin(S,["list"]);
  assert.equal(r.code,0);assert.match(r.stdout,/Alice/);
 }finally{await stop(S.p);if(S2)await stop(S2);}
 const file=join(DIR,"not-a-socket");writeFileSync(file,"precious");
 try{
  S3=await boot(3951,file);
  for(let i=0;i<20&&!/admin socket/i.test(S3.err);i++)await sleep(100);
  assert.match(S3.err,/admin socket/i);
  assert.equal(readFileSync(file,"utf8"),"precious");
  assert.equal((await fetch(`http://127.0.0.1:3951/api/health`)).status,200);
  const r=await runAdmin({sock:file},["list"]);
  assert.equal(r.code,1);
 }finally{if(S3)await stop(S3);}
});

test("SIGTERM removes the socket file",async()=>{
 const S=await setup(3950);
 try{
  assert.ok(existsSync(S.sock));
  await stop(S.p,"SIGTERM");
  assert.ok(!existsSync(S.sock));
  const r=await runAdmin(S,["list"]);
  assert.equal(r.code,1);assert.ok(r.stderr.trim().length>0);
 }finally{await stop(S.p,"SIGKILL");}
});

test("a hand-made client is answered once: half-closed sends get their reply, extra bytes never rerun the command",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.7.0.1"),"Alice");
  // echo '...' | nc -U: the line, then the client closes its side at once.
  const half=await new Promise((ok,ko)=>{
   const c=createConnection(S.sock);let text="";
   c.on("data",d=>{text+=d;});c.on("close",()=>ok(text));c.on("error",ko);
   c.on("connect",()=>c.end(JSON.stringify({cmd:"list"})+"\n"));
  });
  assert.equal(JSON.parse(half.trim()).ok,true);
  // A reset followed by more bytes while it hashes: one reply, one reset (one log line).
  const twice=await new Promise((ok,ko)=>{
   const c=createConnection(S.sock);let text="";
   c.on("data",d=>{text+=d;});c.on("close",()=>ok(text));c.on("error",ko);
   c.on("connect",()=>{c.write(JSON.stringify({cmd:"reset-password",name:"Alice",password:"nouveau-mdp-1"})+"\n");setTimeout(()=>c.write("\n\n"),20);});
  });
  assert.equal(twice.trim().split("\n").length,1);assert.equal(JSON.parse(twice).ok,true);
  await sleep(300);
  assert.equal(S.p.out.match(/password reset for player/g).length,1,"the reset ran exactly once");
  assert.equal((await login(S,"10.7.0.2","Alice","nouveau-mdp-1")).status,200);
  // A connection closed before any full line gets a refusal, and changes nothing.
  const cut=await new Promise((ok,ko)=>{
   const c=createConnection(S.sock);let text="";
   c.on("data",d=>{text+=d;});c.on("close",()=>ok(text));c.on("error",ko);
   c.on("connect",()=>c.end('{"cmd":"list"'));
  });
  assert.equal(JSON.parse(cut.trim()).ok,false);
 }finally{await stop(S.p);}
});

test("the CLI explains an empty stdin and a misplaced flag",async()=>{
 const S=await setup(3950);
 try{
  await reg(client(S,"10.6.0.1"),"Alice");
  const empty=await runAdmin(S,["reset-password","Alice","--stdin"],{input:""});
  assert.equal(empty.code,1);assert.match(empty.stderr,/entrée standard/);
  const flag=await runAdmin(S,["reset-password","--stdin","Alice"]);
  assert.equal(flag.code,2);assert.match(flag.stderr,/Usage/);
  assert.equal((await login(S,"10.6.0.2","Alice",PW)).status,200,"nothing changed");
 }finally{await stop(S.p);}
});
