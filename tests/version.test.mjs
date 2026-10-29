// Version tests: POLITIGO_VERSION is sanitized and exposed only to authenticated players (node --test).
// Each case boots its own server process (ports 3960-3963), same layout as server.test.mjs.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const INVITE="code-secret-de-test-123";
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
let DIR;
function boot(port,extra={}){
 const env={...process.env,PORT:String(port),DB_PATH:join(DIR,`${port}-${Date.now()}.db`),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(code));});
}
const stop=p=>new Promise(r=>{p.on("exit",r);p.kill();});
before(()=>{DIR=mkdtempSync(join(tmpdir(),"pgv-"));});
after(()=>{});

function client(base,ip){
 let cookie="";
 const call=async(method,path,body)=>{
  const r=await fetch(base+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {call,get cookie(){return cookie;}};
}
const reg=(c,name)=>c.call("POST","/api/register",{name,password:"motdepasse1",invite:INVITE,camp:"left"});

// Boots a server, registers a player, and returns every place the version shows up.
async function probe(port,version,ip){
 const p=await boot(port,{POLITIGO_VERSION:version});
 try{
  const base=`http://127.0.0.1:${port}`,c=client(base,ip);
  const r=await reg(c,"Vera");assert.equal(r.status,201,"registration works");
  const me=await c.call("GET","/api/me");assert.equal(me.status,200);
  const login=await client(base,ip).call("POST","/api/login",{name:"Vera",password:"motdepasse1"});
  const res=await fetch(base+"/events",{headers:{Cookie:c.cookie,"X-Forwarded-For":ip}});
  const reader=res.body.getReader();let text="",sse=null;
  const deadline=Date.now()+5000;
  while(!sse&&Date.now()<deadline){
   const {value,done}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);
   const m=text.match(/event: me\ndata: (.*)\n\n/);if(m)sse=JSON.parse(m[1]);
  }
  await reader.cancel().catch(()=>{});
  const health=await client(base,ip).call("GET","/api/health");
  return {register:r.json.version,me:me.json.version,login:login.json&&login.json.version,sse:sse&&sse.version,health:health.json,out:p.out};
 }finally{await stop(p);}
}

test("a clean POLITIGO_VERSION is exposed in register, login, /api/me, the SSE me event and the startup log",async()=>{
 const v="v1.2.1-3-gabc1234";
 const r=await probe(3960,v,"10.9.0.1");
 assert.equal(r.register,v);assert.equal(r.login,v);assert.equal(r.me,v);assert.equal(r.sse,v);
 assert.ok(r.out.includes(v),"startup log mentions the version");
});

test("a missing POLITIGO_VERSION falls back to dev",async()=>{
 const r=await probe(3961,undefined,"10.9.0.2");
 assert.equal(r.register,"dev");assert.equal(r.login,"dev");assert.equal(r.me,"dev");assert.equal(r.sse,"dev");
});

test("hostile POLITIGO_VERSION values all become dev",async()=>{
 const bad=["v1.2.1<script>","a".repeat(41),"1.2 3","v1\n2",""];
 for(const [i,v] of bad.entries()){
  const r=await probe(3962,v,`10.9.1.${i+1}`);
  const tag=JSON.stringify(v);
  assert.equal(r.register,"dev",`register ${tag}`);assert.equal(r.me,"dev",`me ${tag}`);assert.equal(r.sse,"dev",`sse ${tag}`);
  assert.ok(!r.out.includes("<script>"),`log ${tag}`);
 }
});

test("a 40-character version is still accepted",async()=>{
 const v="a".repeat(40);
 const r=await probe(3962,v,"10.9.2.1");
 assert.equal(r.me,v);
});

test("/api/health never exposes the version",async()=>{
 const r=await probe(3963,"v1.2.1-3-gabc1234","10.9.3.1");
 assert.deepEqual(r.health,{ok:true});
});
