// Changelog tests: release parsing in rules.mjs, and the seen_version column, /api/me fields and /api/changelog/seen route (node --test).
// Each case boots its own server process (ports 3930-3934).
import {test,before} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";

const INVITE="code-secret-de-test-123";
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
let DIR;
function boot(port,db,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(DIR,db),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(code));});
}
const stop=p=>new Promise(r=>{p.on("exit",r);p.kill();});
before(()=>{DIR=mkdtempSync(join(tmpdir(),"pgc-"));});

function client(port,ip){
 let cookie="";
 const call=async(method,path,body,headers={})=>{
  const r=await fetch(`http://127.0.0.1:${port}`+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip,...headers},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {call};
}
const reg=(c,name)=>c.call("POST","/api/register",{name,password:"motdepasse1",invite:INVITE,camp:"left"});
const login=(c,name)=>c.call("POST","/api/login",{name,password:"motdepasse1"});

test("releaseOf: tags, git-describe suffixes and non-releases",()=>{
 const ok={"v1.3.0":"1.3.0","1.3.0":"1.3.0","v1.3.0-3-gabc1234":"1.3.0","v01.02.03":"1.2.3"};
 for(const [v,r] of Object.entries(ok))assert.equal(R.releaseOf(v),r,v);
 for(const v of ["dev","",null,undefined,"1.3","v1.3.0.4","x1.3.0","1.3.0 ","12345.1.1"])assert.equal(R.releaseOf(v),null,String(v));
});

test("cmpRelease orders numerically, not as text",()=>{
 assert.ok(R.cmpRelease("1.10.0","1.9.2")>0);assert.ok(R.cmpRelease("1.9.2","1.10.0")<0);
 assert.ok(R.cmpRelease("2.0.0","1.99.99")>0);assert.ok(R.cmpRelease("1.2.3","1.2.4")<0);
 assert.equal(R.cmpRelease("1.3.0","1.3.0"),0);
 assert.deepEqual(["1.10.0","1.2.0","1.9.2"].sort(R.cmpRelease),["1.2.0","1.9.2","1.10.0"]);
});

test("a tagged server exposes its release and a new player starts up to date",async()=>{
 const p=await boot(3930,"a.db",{POLITIGO_VERSION:"v1.3.0"});
 try{
  const c=client(3930,"10.8.0.1"),r=await reg(c,"Alma");
  assert.equal(r.status,201);assert.equal(r.json.release,"1.3.0");assert.equal(r.json.seenVersion,"1.3.0");
  const me=await c.call("GET","/api/me");
  assert.equal(me.json.release,"1.3.0");assert.equal(me.json.seenVersion,"1.3.0");
  const lg=await login(client(3930,"10.8.0.1"),"Alma");
  assert.equal(lg.json.seenVersion,"1.3.0");
 }finally{await stop(p);}
});

test("an old database gains seen_version (NULL), then the player marks the release as read and it survives restarts",async()=>{
 const dev=await boot(3931,"old.db");
 try{assert.equal((await reg(client(3931,"10.8.1.1"),"Vieux")).status,201);}finally{await stop(dev);}
 // Simulate a database from before the feature.
 const d=new DatabaseSync(join(DIR,"old.db"));d.exec("ALTER TABLE players DROP COLUMN seen_version");
 assert.ok(!d.prepare("PRAGMA table_info(players)").all().some(c=>c.name==="seen_version"));d.close();

 let p=await boot(3931,"old.db",{POLITIGO_VERSION:"v1.3.0"});
 try{
  const c=client(3931,"10.8.1.2");
  const lg=await login(c,"Vieux");assert.equal(lg.status,200);
  assert.equal(lg.json.seenVersion,null);assert.equal(lg.json.release,"1.3.0");
  assert.equal((await c.call("GET","/api/me")).json.seenVersion,null);
  const s=await c.call("POST","/api/changelog/seen",{version:"9.9.9"});   // the body is ignored
  assert.equal(s.status,200);assert.deepEqual(s.json,{ok:true,seenVersion:"1.3.0"});
  assert.equal((await c.call("GET","/api/me")).json.seenVersion,"1.3.0");
 }finally{await stop(p);}

 p=await boot(3931,"old.db",{POLITIGO_VERSION:"v1.3.0"});
 try{
  const lg=await login(client(3931,"10.8.1.3"),"Vieux");
  assert.equal(lg.json.seenVersion,"1.3.0");
 }finally{await stop(p);}

 p=await boot(3931,"old.db",{POLITIGO_VERSION:"v1.4.0-2-gdeadbee"});
 try{
  const lg=await login(client(3931,"10.8.1.4"),"Vieux");
  assert.equal(lg.json.release,"1.4.0");assert.equal(lg.json.seenVersion,"1.3.0");
 }finally{await stop(p);}
});

test("a dev server has no release: nothing to mark, seenVersion stays null",async()=>{
 const p=await boot(3932,"dev.db");
 try{
  const c=client(3932,"10.8.2.1"),r=await reg(c,"Devi");
  assert.equal(r.json.release,null);assert.equal(r.json.seenVersion,null);
  const s=await c.call("POST","/api/changelog/seen",{});
  assert.equal(s.status,200);assert.deepEqual(s.json,{ok:true,seenVersion:null});
  assert.equal((await c.call("GET","/api/me")).json.seenVersion,null);
 }finally{await stop(p);}
});

test("/api/changelog/seen refuses anonymous callers, foreign origins and GET",async()=>{
 const p=await boot(3933,"guard.db",{POLITIGO_VERSION:"v1.3.0"});
 try{
  const anon=client(3933,"10.8.3.1");
  assert.equal((await anon.call("POST","/api/changelog/seen",{})).status,401);
  const c=client(3933,"10.8.3.2");await reg(c,"Garde");
  assert.equal((await c.call("POST","/api/changelog/seen",{},{Origin:"https://evil.example"})).status,403);
  assert.equal((await c.call("GET","/api/changelog/seen")).status,404);
  assert.equal((await c.call("POST","/api/changelog/seen",{})).status,200);
 }finally{await stop(p);}
});

test("/api/changelog/seen is limited to 20 calls per 10 minutes",async()=>{
 const p=await boot(3934,"rate.db",{POLITIGO_VERSION:"v1.3.0"});
 try{
  const c=client(3934,"10.8.4.1");await reg(c,"Rapide");
  for(let i=0;i<20;i++)assert.equal((await c.call("POST","/api/changelog/seen",{})).status,200,`call ${i+1}`);
  const r=await c.call("POST","/api/changelog/seen",{});
  assert.equal(r.status,429);assert.equal(r.json.error,"Doucement : réessaie dans un instant.");
 }finally{await stop(p);}
});
