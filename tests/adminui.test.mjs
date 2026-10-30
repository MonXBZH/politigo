// The optional admin container (admin/server.mjs) against two real API servers, one admin socket each: login, rate
// limits, CSRF, per-server routing (an action on one game never touches the other), backup streaming, health.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readdirSync,writeFileSync,existsSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,client,until,sleep,PW} from "./server-helpers.mjs";

const API1=3944,API2=3945,ADMIN=3946,ADMIN_GEN=3947,PASS="mot-de-passe-admin-tres-long";
const SERVER=process.env.ADMIN_SERVER||"/w/admin/server.mjs";
let api1,api2,adm,dir1,dir2,S1,S2;

function startAdmin(port,extra){
 const env={...process.env,PORT:String(port),ADMIN_DATA:mkdtempSync(join(tmpdir(),"pgad-")),...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[SERVER],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});p.dataDir=env.ADMIN_DATA;
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo admin on/.test(p.out))ok(p);});p.on("exit",c=>ko(new Error("admin exited "+c+": "+p.err)));});
}
before(async()=>{
 dir1=mkdtempSync(join(tmpdir(),"pga1-"));dir2=mkdtempSync(join(tmpdir(),"pga2-"));S1=join(dir1,"admin.sock");S2=join(dir2,"admin.sock");
 [api1,api2]=await Promise.all([boot(API1,dir1,{POLITIGO_ADMIN_SOCKET:S1,POLITIGO_SERVER_NAME:"Prod"}),boot(API2,dir2,{POLITIGO_ADMIN_SOCKET:S2})]);
 await until(()=>existsSync(S1)&&existsSync(S2));
 adm=await startAdmin(ADMIN,{POLITIGO_ADMIN_SERVERS:`Prod=${S1};Test é=${S2}`,POLITIGO_ADMIN_PASSWORD:PASS,ADMIN_PROXY_HOPS:"1",ADMIN_HEALTH_CACHE_MS:"400"});
});
after(async()=>{await Promise.all([stop(api1),stop(api2),stop(adm)]);});

let ipSeq=0;
// A browser-like caller: same-origin Origin, the CSRF header, JSON; each one from its own address (X-Forwarded-For).
function browser(port=ADMIN){
 let cookie="";const ip=`10.9.0.${++ipSeq}`;
 const req=async(path,body={},{headers={},raw=false}={})=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method:"POST",body:JSON.stringify(body),
   headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1",Origin:`http://127.0.0.1:${port}`,"X-Forwarded-For":ip,...(cookie?{Cookie:cookie}:{}),...headers}});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  if(raw)return r;
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json,headers:r.headers,set};
 };
 return {req,login:(password=PASS)=>req("/api/login",{password}),call:(srv,cmd,args={})=>req(`/api/s/${srv}/call`,{cmd,...args})};
}

test("the page is served with a strict CSP, the API is closed without a session",async()=>{
 const r=await fetch(`http://127.0.0.1:${ADMIN}/`);
 assert.equal(r.status,200);assert.match(r.headers.get("content-type"),/text\/html/);
 const csp=r.headers.get("content-security-policy");
 assert.match(csp,/default-src 'none'/);assert.match(csp,/script-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);assert.doesNotMatch(csp,/unsafe-inline/);
 assert.equal(r.headers.get("x-content-type-options"),"nosniff");assert.equal(r.headers.get("referrer-policy"),"no-referrer");
 assert.match(await r.text(),/<script type="module" src="\/admin.js">/);
 const js=await fetch(`http://127.0.0.1:${ADMIN}/admin.js`);assert.equal(js.status,200);assert.match(js.headers.get("content-type"),/javascript/);
 for(const p of ["/../server.mjs","/ui/admin.js","/%2e%2e/server.mjs","/admin.js%2f..","/server.mjs"])assert.equal((await fetch(`http://127.0.0.1:${ADMIN}${p}`)).status,404,p);
 const b=browser();
 assert.equal((await b.call("prod","stats")).status,401);
 assert.equal((await b.req("/api/servers")).status,401);
 assert.equal((await fetch(`http://127.0.0.1:${ADMIN}/api/session`).then(r=>r.json())).authed,false);
});

test("CSRF: the custom header, a JSON body and the same Origin are all required, even to log in",async()=>{
 const b=browser();
 assert.equal((await b.req("/api/login",{password:PASS},{headers:{"X-PolitiGo-Admin":""}})).status,403);
 assert.equal((await b.req("/api/login",{password:PASS},{headers:{Origin:"https://evil.example"}})).status,403);
 assert.equal((await b.req("/api/login",{password:PASS},{headers:{"Content-Type":"text/plain"}})).status,403);
 assert.equal((await b.req("/api/login",{password:PASS},{headers:{"Sec-Fetch-Site":"cross-site"}})).status,403);
 assert.equal((await b.login()).status,200);
 assert.equal((await b.req("/api/s/prod/call",{cmd:"stats"},{headers:{Origin:"http://other:1"}})).status,403,"a session does not lift the check");
 const big=await b.req("/api/s/prod/call",{cmd:"stats",pad:"x".repeat(20000)});
 assert.equal(big.status,413);
});

test("wrong passwords: 401, then 429 for that address after 5; another address still logs in, with a strict cookie",async()=>{
 const bad=browser();
 for(let i=0;i<5;i++)assert.equal((await bad.login("pas le bon mot de passe")).status,401);
 const r=await bad.login();assert.equal(r.status,429,"even the right password waits");assert.ok(+r.headers.get("retry-after")>0);
 const good=browser(),ok=await good.login();
 assert.equal(ok.status,200);
 assert.match(ok.set,/HttpOnly/);assert.match(ok.set,/SameSite=Strict/);assert.doesNotMatch(ok.set,/Secure/);
 const sec=browser(),s=await sec.req("/api/login",{password:PASS},{headers:{"X-Forwarded-Proto":"https"}});
 assert.match(s.set,/; Secure/,"Secure behind an HTTPS proxy");
 assert.equal((await good.req("/api/logout")).status,200);
 assert.equal((await good.call("prod","stats")).status,401,"logged out");
});

test("parallel wrong logins from one address: at most 5 are checked, the rest get 429",async()=>{
 const b=browser(),rs=await Promise.all(Array.from({length:10},()=>b.login("toujours pas le bon")));
 const codes=rs.map(r=>r.status);
 assert.ok(codes.filter(c=>c===401).length<=5,codes.join());
 assert.ok(codes.includes(429),codes.join());
 // One at a time: the burst got a single check through; sequential tries then run into the 5-per-address cap.
 const n=codes.filter(c=>c===401).length;
 for(let i=n;i<5;i++)assert.equal((await b.login("toujours pas le bon")).status,401);
 assert.equal((await b.login()).status,429,"the address is now locked, even with the right password");
});

test("a burst of calls waits for socket slots instead of failing (at most 4 at once per server)",async()=>{
 const b=browser();await b.login();
 const rs=await Promise.all(Array.from({length:16},()=>b.call("prod","stats")));
 assert.deepEqual([...new Set(rs.map(r=>r.status))],[200]);
});

test("several servers: listed with their names, unknown id 404, actions routed to the right game only",async()=>{
 const b=browser();assert.equal((await b.login()).status,200);
 const list=(await b.req("/api/servers",{full:true})).json.servers;
 assert.deepEqual(list.map(s=>[s.id,s.name,s.up]),[["prod","Prod",true],["test-e","Test é",true]]);
 assert.equal(typeof list[0].chatReports,"number");
 assert.equal(list[0].invite.open,true);assert.equal(typeof list[0].invite.code,"string");
 assert.equal((await b.call("nope","stats")).status,404);
 assert.equal((await b.call("prod","drop-everything")).status,400,"only known commands pass");
 const st=await b.call("prod","stats");assert.equal(st.status,200,JSON.stringify(st.json));assert.equal(st.json.players,0);

 // The same pseudo on both games; only the "Test é" one gets a new password.
 await player(API1,"Alice");await player(API2,"Alice");await player(API2,"Bob Deux");
 const r=await b.req("/api/s/test-e/reset-password",{name:"alice"});
 assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.name,"Alice");assert.match(r.json.password,/^[a-km-zA-HJ-NP-Z2-9]{18}$/);
 assert.equal((await client(API2).call("POST","/api/login",{name:"Alice",password:r.json.password})).status,200,"new password on Test");
 assert.equal((await client(API2).call("POST","/api/login",{name:"Alice",password:PW})).status,401,"old one gone on Test");
 assert.equal((await client(API1).call("POST","/api/login",{name:"Alice",password:PW})).status,200,"Prod untouched");
 assert.equal((await b.call("prod","list")).json.players.length,1);
 assert.equal((await b.call("test-e","list")).json.players.length,2);

 const a=await b.call("test-e","announce",{text:"Maintenance du serveur de test à 22 h"});
 assert.equal(a.status,200,JSON.stringify(a.json));
 const feed=n=>b.call(n,"feed-list",{limit:50}).then(r=>r.json.items.filter(i=>i.kind==="announce").length);
 assert.equal(await feed("test-e"),1);assert.equal(await feed("prod"),0,"the other game's feed stays clean");
 const audit=(await b.call("test-e","audit")).json.items;
 assert.ok(audit.some(i=>i.cmd==="announce"&&i.via==="web"),"logged as a web action");
});

test("backup: server 2's database is streamed as a SQLite file, then removed from its socket directory",async()=>{
 const b=browser();await b.login();
 const r=await b.req("/api/s/test-e/backup",{},{raw:true});
 assert.equal(r.status,200);assert.match(r.headers.get("content-disposition"),/attachment; filename="politigo-test-e-.*\.db"/);
 const buf=Buffer.from(await r.arrayBuffer());
 assert.equal(buf.subarray(0,16).toString("latin1"),"SQLite format 3\0");
 const f=join(mkdtempSync(join(tmpdir(),"pgab-")),"b.db");writeFileSync(f,buf);
 const db=new DatabaseSync(f,{readOnly:true});
 assert.deepEqual(db.prepare("SELECT name FROM players ORDER BY name").all().map(x=>x.name),["Alice","Bob Deux"],"server 2's players, not server 1's");
 db.close();
 assert.ok(await until(()=>!readdirSync(dir2).some(n=>n.startsWith("backup-"))),"the copy is deleted after the download");
 assert.ok(!readdirSync(dir1).some(n=>n.startsWith("backup-")),"nothing written next to the other socket");
});

test("a generated password: printed once in the logs, only its hash kept, the single server named by its stats",async()=>{
 const p=await startAdmin(ADMIN_GEN,{POLITIGO_ADMIN_SOCKET:S1,POLITIGO_ADMIN_PASSWORD:undefined,POLITIGO_ADMIN_SERVERS:undefined});
 try{
  const pw=/Admin password \(generated, shown ONCE\): (\S+)/.exec(p.out)?.[1];
  assert.match(pw,/^[a-km-zA-HJ-NP-Z2-9]{18}$/);
  const {readFileSync}=await import("node:fs"),stored=readFileSync(join(p.dataDir,"admin-pass"),"utf8");
  assert.match(stored,/^scrypt:/);assert.ok(!stored.includes(pw));
  const b=browser(ADMIN_GEN);assert.equal((await b.login(pw)).status,200);
  const list=(await b.req("/api/servers")).json.servers;
  assert.deepEqual(list.map(s=>[s.id,s.name,s.up]),[["jeu","Prod",true]]);
  await stop(p);
  const again=await startAdmin(ADMIN_GEN,{POLITIGO_ADMIN_SOCKET:S1,POLITIGO_ADMIN_PASSWORD:undefined,POLITIGO_ADMIN_SERVERS:undefined,ADMIN_DATA:p.dataDir});
  assert.doesNotMatch(again.out,/Admin password/,"not printed again");
  assert.equal((await browser(ADMIN_GEN).login(pw)).status,200,"the same password still works");
  await stop(again);
 }finally{await stop(p);}
 const short=await startAdmin(ADMIN_GEN,{POLITIGO_ADMIN_PASSWORD:"trop-court"}).then(()=>null,e=>e);
 assert.match(String(short),/at least 12 characters/);
});

test("health: 200 while one server answers, with each server's state; 503 when none does",async()=>{
 let h=await fetch(`http://127.0.0.1:${ADMIN}/health`);
 assert.equal(h.status,200);assert.deepEqual((await h.json()).servers.map(s=>s.up),[true,true]);
 await stop(api2);
 h=await fetch(`http://127.0.0.1:${ADMIN}/health`);
 assert.deepEqual((await h.json()).servers.map(s=>s.up),[true,true],"cached for a moment: probes do not hit the sockets");
 await sleep(500);
 h=await fetch(`http://127.0.0.1:${ADMIN}/health`);
 assert.equal(h.status,200);const j=await h.json();
 assert.deepEqual(j.servers.map(s=>[s.id,s.up]),[["prod",true],["test-e",false]]);
 const b=browser();await b.login();
 const down=await b.call("test-e","stats");assert.equal(down.status,502);assert.match(down.json.error,/injoignable/i);
 assert.equal((await b.call("prod","stats")).status,200,"the other game still works");
 await stop(api1);await sleep(500);
 assert.equal((await fetch(`http://127.0.0.1:${ADMIN}/health`)).status,503);
});
