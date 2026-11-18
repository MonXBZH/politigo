// La Brocante, server side: the same-network fingerprint (one HMAC of the last address, never the address itself).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,PW,INVITE} from "./server-helpers.mjs";

const T=120000,it=(name,fn)=>test(name,{timeout:T},fn);
// A client that writes the address it comes from itself (the server reads the proxy's entry: PROXY_HOPS=1).
function from(port,ip){
 let cookie="";
 return {call:async(method,path,body)=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip},body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  let text=await r.text(),json=null;try{json=JSON.parse(text);}catch{}
  return {status:r.status,json,text};
 }};
}
const signup=async(port,name,ip)=>{const c=from(port,ip),r=await c.call("POST","/api/register",{name,password:PW,invite:INVITE,camp:"left"});assert.equal(r.status,201,r.text);c.reg=r;return c;};

it("net fingerprint: never the raw IP, same network detected",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"market-")),port=18931;
 let srv=await boot(port,dir);
 try{
  const a=await signup(port,"Alice Net","10.9.0.1"),b=await signup(port,"Bob Net","10.9.0.1"),c=await signup(port,"Cleo Net","10.9.0.2");
  const db=new DatabaseSync(join(dir,"t.db"));
  const fp=n=>db.prepare("SELECT net_fp FROM players WHERE name=?").get(n).net_fp;
  const [fa,fb,fc]=["Alice Net","Bob Net","Cleo Net"].map(fp);
  for(const f of [fa,fb,fc]){assert.match(f,/^[0-9a-f]{64}$/);assert.ok(!f.includes("10.9.0.1")&&!f.includes("10.9.0.2"));}
  assert.equal(fa,fb);assert.notEqual(fa,fc);
  // never in an answer: sign-up, /api/me, nor anywhere in the text
  const me=await a.call("GET","/api/me");
  for(const r of [a.reg,me]){assert.ok(!r.text.includes(fa)&&!/net_?fp|netFp/i.test(r.text)&&!r.text.includes("10.9.0.1"));}
  db.close();
  // the key survives a restart: a new login from the same address gives the same fingerprint
  await stop(srv);srv=await boot(port,dir);
  const l=from(port,"10.9.0.1");assert.equal((await l.call("POST","/api/login",{name:"Cleo Net",password:PW})).status,200);
  const db2=new DatabaseSync(join(dir,"t.db"));
  assert.equal(db2.prepare("SELECT net_fp FROM players WHERE name=?").get("Cleo Net").net_fp,fa,"login rewrites the last address");
  assert.equal(db2.prepare("SELECT count(*) n FROM settings WHERE key='netkey'").get().n,1);
  db2.close();
 }finally{await stop(srv);}
});
