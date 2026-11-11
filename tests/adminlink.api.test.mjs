// The game's side of the network link to the admin console (1.7.3): a real game server dials a fake admin over TLS.
// The certificate in tests/fixtures/link-test-*.pem is a throwaway TEST certificate (private key included on purpose,
// self-signed CN=test): it only ever serves this fake admin on 127.0.0.1 and protects nothing.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import tls from "node:tls";
import net from "node:net";
import crypto from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync,existsSync,utimesSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {boot,player,client,until,sleep} from "./server-helpers.mjs";

const FIX=join(dirname(fileURLToPath(import.meta.url)),"fixtures");
const KEY=readFileSync(join(FIX,"link-test-key.pem")),CERT=readFileSync(join(FIX,"link-test-cert.pem"));
const FP=new crypto.X509Certificate(CERT).fingerprint256;   // "AB:CD:..."
const TOKEN="pgk_"+crypto.randomBytes(32).toString("base64url");
const API=3870;
const L=await import(process.env.ADMINLINK||"/app/adminlink.mjs").catch(e=>({missing:e}));
// Every wait is bounded: a test that hangs fails after T instead of blocking the whole run.
const T=30000,it=(name,fn)=>test(name,{timeout:T},fn);
// SIGTERM, then SIGKILL after 5 s: a stuck server never holds the run (stop() alone waits forever).
function halt(p){
 if(!p||p.exitCode!==null||p.signalCode!==null)return Promise.resolve();
 return new Promise(r=>{const k=setTimeout(()=>p.kill("SIGKILL"),5000);p.once("exit",()=>{clearTimeout(k);r();});p.kill("SIGTERM");});
}
const stop=halt;
// Last resort: if anything (a socket, a child, a timer) is still holding this file's process once every test is done,
// it leaves anyway (the timer is unref'd: it only fires when something else would have kept the process alive).
after(()=>{setTimeout(()=>{console.error("adminlink.api.test: handles still open, forced exit");process.exit(process.exitCode??0);},3000).unref();});

// A fake admin console: the TLS listener the link dials, one line of JSON per message.
function fakeAdmin(port){
 const a={conns:[]},byPort=new Map();
 a.srv=tls.createServer({key:KEY,cert:CERT,minVersion:"TLSv1.3"},sock=>{
  // Application data only (bytes: what the game sent once TLS was up).
  const c=byPort.get(sock.remotePort);c.sock=sock;c.send=o=>sock.write(JSON.stringify(o)+"\n");
  sock.setEncoding("utf8");sock.on("error",()=>{});
  let buf="";
  // c.onMsg (optional): called on each message as it is read, to react before the next one (pause, cancel).
  sock.on("data",d=>{c.bytes+=d.length;buf+=d;let i;while((i=buf.indexOf("\n"))>=0){let m=null;try{m=JSON.parse(buf.slice(0,i));}catch{}buf=buf.slice(i+1);if(m){c.msgs.push(m);c.onMsg?.(m);}}});
 });
 // Counted at the TCP level: a client that hangs up during the TLS handshake still shows up.
 a.srv.on("connection",raw=>{const c={raw,sock:null,msgs:[],bytes:0,closed:false};a.conns.push(c);byPort.set(raw.remotePort,c);raw.on("error",()=>{});raw.on("close",()=>{c.closed=true;});});
 a.close=()=>Promise.race([new Promise(r=>{for(const c of a.conns){c.raw.destroy();c.sock?.destroy();}a.srv.close(()=>r());}),sleep(2000)]);
 a.conn=async(n,ms=5000)=>{assert.ok(await until(()=>a.conns.length>n,ms),`connection #${n+1}`);return a.conns[n];};
 return new Promise(ok=>a.srv.listen(port,"127.0.0.1",()=>ok(a)));
}
const msg=async(c,pred,ms=5000)=>{const m=await until(()=>c.msgs.find(pred),ms);assert.ok(m,"message expected");return m;};
// The hello, then the welcome: the link is up.
async function linked(a,n){const c=await a.conn(n);const h=await msg(c,m=>m.t==="hello");c.send({t:"welcome",id:"p-0011aabb"});return {c,h};}
let seq=1;
// One request through the link: its chunks (a backup) and its answer.
async function req(c,body,ms=8000){
 const id=seq++;c.send({t:"req",id,body});
 const res=await msg(c,m=>m.t==="res"&&m.id===id,ms);
 return {body:res.body,chunks:c.msgs.filter(m=>m.t==="chunk"&&m.id===id)};
}
// The same request through the local socket, the way the console sends it today.
const viaSocket=(path,line)=>new Promise((ok,ko)=>{
 const s=net.connect(path);let out="";s.setEncoding("utf8");
 s.setTimeout(5000,()=>{s.destroy();ko(new Error("socket: no answer"));});
 s.on("connect",()=>s.write(line+"\n"));s.on("data",d=>{out+=d;});s.on("end",()=>ok(JSON.parse(out)));s.on("error",ko);
});
const linkEnv=(port,extra={})=>({POLITIGO_ADMIN_URL:`127.0.0.1:${port}`,POLITIGO_ADMIN_TLS:FP,POLITIGO_ADMIN_TOKEN:TOKEN,ADMIN_LINK_RETRY_MS:"100",...extra});
const logs=p=>p.out+p.err;

it("the link module exists",()=>{assert.equal(L.missing,undefined,String(L.missing));});

it("the config: all three variables or nothing; one or two is a clear error that never shows the token",()=>{
 assert.equal(L.linkConfig({}),null);
 const ok=L.linkConfig(linkEnv(3871));assert.equal(ok.host,"127.0.0.1");assert.equal(ok.port,3871);assert.equal(ok.token,TOKEN);
 const half=L.linkConfig({POLITIGO_ADMIN_URL:"admin.lan:8091",POLITIGO_ADMIN_TOKEN:TOKEN});
 assert.match(half.error,/POLITIGO_ADMIN_TLS/);assert.ok(!half.error.includes(TOKEN));
 assert.match(L.linkConfig({...linkEnv(1),POLITIGO_ADMIN_URL:"pas-de-port"}).error,/POLITIGO_ADMIN_URL/);
 assert.match(L.linkConfig({...linkEnv(1),POLITIGO_ADMIN_TLS:"zz"}).error,/POLITIGO_ADMIN_TLS/);
 const bad=L.linkConfig({...linkEnv(1),POLITIGO_ADMIN_TOKEN:"secret-sans-prefixe"});assert.match(bad.error,/POLITIGO_ADMIN_TOKEN/);assert.ok(!bad.error.includes("secret-sans-prefixe"));
 assert.equal(L.linkConfig({...linkEnv(1),POLITIGO_ADMIN_URL:"[::1]:8091"}).host,"::1");
 // Either way of writing the fingerprint.
 assert.ok(L.sameFp(FP,FP.replace(/:/g,"").toLowerCase()));assert.ok(!L.sameFp(FP,"AA".repeat(32)));
});

// ------------------------------------------------------------------ a game server linked to a fake console
let api,adm,dir,SOCK;
before(async()=>{
 if(L.missing)return;
 dir=mkdtempSync(join(tmpdir(),"pglink-"));mkdirSync(join(dir,"sock"));SOCK=join(dir,"sock","admin.sock");
 adm=await fakeAdmin(3871);
 api=await boot(API,dir,{...linkEnv(3871),POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_SERVER_NAME:"Partie liée"});
 await until(()=>{try{statSync(SOCK);return true;}catch{return false;}});
 await player(API,"Lieur","left");
},{timeout:T});
after(async()=>{if(api)await stop(api);if(adm)await adm.close();},{timeout:T});

it("right fingerprint: the hello carries the token, a kept instance, the name, the version and the players",async()=>{
 const {h}=await linked(adm,0);
 assert.deepEqual(Object.keys(h).sort(),["instance","name","players","t","token","v","version"]);
 assert.equal(h.v,1);assert.equal(h.token,TOKEN);assert.equal(h.name,"Partie liée");assert.equal(typeof h.version,"string");
 assert.match(h.instance,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);assert.equal(typeof h.players,"number");
 const f=join(dir,"admin-link-id");assert.equal(readFileSync(f,"utf8").trim(),h.instance);assert.equal(statSync(f).mode&0o777,0o600);
 assert.ok(await until(()=>/\[admin-link\] .*liée/.test(logs(api))),logs(api));
});

it("a request answers exactly what the socket answers, refusals included, with the same actor",async()=>{
 const c=adm.conns[0];
 for(const body of [{cmd:"list"},{cmd:"nope"},{cmd:"mythic-reset",by:"Modo"},{cmd:"backup-note",self:3,detail:"x"},{cmd:"invite-get"}]){
  const s=await viaSocket(SOCK,JSON.stringify(body)),r=await req(c,body);
  assert.deepEqual(r.body,s,JSON.stringify(body));
 }
 assert.deepEqual((await req(c,[1,2])).body,await viaSocket(SOCK,"[1,2]"),"not an object");
 assert.equal((await req(c,{cmd:"mythic-reset",by:"Modo"})).body.ok,false);
});

it("twenty requests at once: every one answered under its own id",async()=>{
 const c=adm.conns[0],ids=[];
 for(let k=0;k<20;k++){const id=seq++;ids.push(id);c.send({t:"req",id,body:{cmd:"list"}});}
 assert.ok(await until(()=>ids.every(id=>c.msgs.some(m=>m.t==="res"&&m.id===id&&m.body.ok===true)),8000),"all answered");
});

it("a backup comes in chunks, intact (size + sha256), and the copy in /data is gone",async()=>{
 const c=adm.conns[0],r=await req(c,{cmd:"backup",vapid:true});
 assert.equal(r.body.ok,true,JSON.stringify(r.body));assert.equal(r.body.stream,true);assert.equal(r.body.path,undefined);
 const data=Buffer.concat(r.chunks.map(m=>Buffer.from(m.data,"base64")));
 assert.ok(r.chunks.length>=1);for(const m of r.chunks)assert.ok(Buffer.from(m.data,"base64").length<=256*1024);
 assert.equal(data.length,r.body.bytes);assert.equal(crypto.createHash("sha256").update(data).digest("hex"),r.body.sha256);
 assert.equal(data.subarray(0,15).toString(),"SQLite format 3");
 assert.ok(await until(()=>!readdirSync(dir).some(f=>/^backup-/.test(f))&&!readdirSync(join(dir,"sock")).some(f=>/^backup-/.test(f))),"temporary copy removed");
 // And the socket's backup still works as before.
 const s=await viaSocket(SOCK,JSON.stringify({cmd:"backup"}));assert.equal(s.ok,true);assert.ok(s.path.startsWith(join(dir,"sock")));
});

it("ping gets pong",async()=>{
 const c=adm.conns[0],n=c.msgs.filter(m=>m.t==="pong").length;
 c.send({t:"ping"});assert.ok(await until(()=>c.msgs.filter(m=>m.t==="pong").length===n+1));
});

it("a cut link comes back by itself, same instance; one log line per change, not one per try",async()=>{
 const first=adm.conns[0];const inst=(await msg(first,m=>m.t==="hello")).instance;
 first.sock.destroy();
 const {c,h}=await linked(adm,1);assert.equal(h.instance,inst);
 assert.equal((await req(c,{cmd:"nope"})).body.error,"Commande inconnue.");
 assert.ok(await until(()=>/\[admin-link\] liaison coupée/.test(logs(api))),logs(api));
 assert.equal((logs(api).match(/\[admin-link\] liaison coupée/g)||[]).length,1);
});

it("SIGTERM: the game stops cleanly, the link is closed, and the token was never logged",async()=>{
 const c=adm.conns.at(-1);
 const code=await new Promise(r=>{if(api.exitCode!==null)return r(api.exitCode);api.on("exit",r);api.kill("SIGTERM");});
 assert.equal(code,0);assert.ok(await until(()=>c.closed),"link closed");
 assert.ok(!logs(api).includes(TOKEN),"token in the logs");assert.ok(!logs(api).includes(TOKEN.slice(4)));
});

// ------------------------------------------------------------------ refusals, wrong certificate, partial setup
it("refused for its token: waits (10 min in production) before trying again, and says so; the instance survives a restart",async()=>{
 const d=mkdtempSync(join(tmpdir(),"pglink2-")),a=await fakeAdmin(3872);
 let p=await boot(API,d,linkEnv(3872,{ADMIN_LINK_WAIT_MS:"1500"}));
 try{
  const c=await a.conn(0),h=await msg(c,m=>m.t==="hello");
  c.send({t:"refused",reason:"token",msg:"Jeton inconnu."});
  assert.ok(await until(()=>c.closed),"closed after the refusal");
  await sleep(900);assert.equal(a.conns.length,1,"no retry before the wait");
  await a.conn(1,4000);
  assert.match(logs(p),/\[admin-link\] refusée par la console/);assert.ok(!logs(p).includes(TOKEN));
  await stop(p);p=await boot(API,d,linkEnv(3872));
  const h2=await msg(await a.conn(2),m=>m.t==="hello");assert.equal(h2.instance,h.instance,"same instance after a restart");
 }finally{await stop(p);await a.close();}
});

it("wrong fingerprint: not one byte sent, a clear log, and a long wait",async()=>{
 const d=mkdtempSync(join(tmpdir(),"pglink3-")),a=await fakeAdmin(3873),want="AA:".repeat(31)+"AA";
 const p=await boot(API,d,linkEnv(3873,{POLITIGO_ADMIN_TLS:want,ADMIN_LINK_WAIT_MS:"60000"}));
 try{
  const c=await a.conn(0);assert.ok(await until(()=>c.closed),"cut");
  assert.equal(c.bytes,0,"nothing sent");
  assert.ok(await until(()=>/\[admin-link\] empreinte du certificat différente : attendu AA:AA/.test(logs(p))),logs(p));
  assert.ok(logs(p).includes(`reçu ${FP}`));
  await sleep(800);assert.equal(a.conns.length,1,"no retry");
  assert.ok(!logs(p).includes(TOKEN));
 }finally{await stop(p);await a.close();}
});

it("one or two variables: a clear error, no link, and the game plays on",async()=>{
 const d=mkdtempSync(join(tmpdir(),"pglink4-")),a=await fakeAdmin(3874);
 const p=await boot(API,d,{POLITIGO_ADMIN_URL:"127.0.0.1:3874",POLITIGO_ADMIN_TOKEN:TOKEN});
 try{
  assert.equal((await client(API).call("GET","/api/health")).status,200);
  await player(API,"Joueur","right");
  assert.match(logs(p),/\[admin-link\] configuration incomplète.*POLITIGO_ADMIN_TLS/);
  await sleep(500);assert.equal(a.conns.length,0);assert.ok(!logs(p).includes(TOKEN));
 }finally{await stop(p);await a.close();}
});

// ------------------------------------------------------------------ the client alone, with a stand-in for the game
function quiet(){const lines=[];return {lines,info:l=>lines.push(l),error:l=>lines.push(l)};}
it("at most 8 requests run at once, the rest wait their turn",async()=>{
 const a=await fakeAdmin(3874),log=quiet();let running=0,peak=0,link=null;const gates=[];
 try{
 link=L.startLink(L.linkConfig(linkEnv(3874)),{instance:crypto.randomUUID(),info:()=>({name:"X",version:"1.7.3",players:0}),log,
  exec:()=>{running++;peak=Math.max(peak,running);return new Promise(r=>gates.push(()=>{running--;r({ok:true,n:1});}));}});
  const {c}=await linked(a,0);
  for(let k=0;k<12;k++)c.send({t:"req",id:1000+k,body:{cmd:"list"}});
  assert.ok(await until(()=>gates.length===8));await sleep(200);assert.equal(gates.length,8);assert.equal(peak,8);
  while(gates.length)gates.shift()();
  assert.ok(await until(()=>{while(gates.length)gates.shift()();return c.msgs.filter(m=>m.t==="res").length===12;}));
  assert.equal(peak,8);
 }finally{link?.stop();await a.close();}
});

it("silence from the console (no ping) cuts the link, which comes back",async()=>{
 const a=await fakeAdmin(3874),log=quiet();let link=null;
 try{
 link=L.startLink(L.linkConfig(linkEnv(3874,{ADMIN_LINK_IDLE_MS:"400"})),{instance:crypto.randomUUID(),info:()=>({name:"X",version:"1.7.3",players:0}),log,exec:async()=>({ok:true})});
  const {c}=await linked(a,0);
  assert.ok(await until(()=>c.closed,3000),"cut after the silence");
  await linked(a,1);
  link.stop();assert.ok(await until(()=>a.conns.every(c=>c.closed)),"stop() closes it");
  assert.ok(log.lines.some(l=>/liaison arrêtée/.test(l)));
 }finally{link?.stop();await a.close();}
});

it("a big backup goes in several chunks of 256 Kio at most, rebuilt intact, and its file is deleted",async()=>{
 const a=await fakeAdmin(3874),d=mkdtempSync(join(tmpdir(),"pglink5-")),f=join(d,"backup-1.db"),data=crypto.randomBytes(700*1024);
 writeFileSync(f,data,{mode:0o600});
 let link=null;
 try{
  link=L.startLink(L.linkConfig(linkEnv(3874)),{instance:crypto.randomUUID(),info:()=>({name:"X",version:"1.7.3",players:0}),log:quiet(),limit:4096,
   exec:async b=>b.cmd==="backup"?{ok:true,path:f,bytes:data.length,vapid:{publicKey:"k"}}:{ok:true}});
  const {c}=await linked(a,0),r=await req(c,{cmd:"backup",vapid:true});
  assert.equal(r.chunks.length,3);assert.deepEqual(Buffer.concat(r.chunks.map(m=>Buffer.from(m.data,"base64"))),data);
  assert.deepEqual(r.body,{ok:true,stream:true,bytes:data.length,sha256:crypto.createHash("sha256").update(data).digest("hex"),vapid:{publicKey:"k"}});
  assert.ok(!existsSync(f),"temporary file deleted");
  assert.deepEqual((await req(c,{cmd:"list",pad:"x".repeat(5000)})).body,{ok:false,error:"Requête trop grosse."});
 }finally{link?.stop();await a.close();}
});

// ------------------------------------------------------------------ Avenant 1: cancel, one backup at a time, big answers
const stand=(exec,extra={})=>L.startLink(L.linkConfig(linkEnv(3874,extra)),{instance:crypto.randomUUID(),info:()=>({name:"X",version:"1.7.3",players:0}),log:quiet(),exec});
const gone=f=>until(()=>!existsSync(f)&&!existsSync(f+"-journal"),3000);

it("cancel: the chunks stop at once, no answer, the copy and its journal are deleted; the link and the next backup still work",async()=>{
 const a=await fakeAdmin(3874),d=mkdtempSync(join(tmpdir(),"pglink6-"));let link=null;
 const big=join(d,"backup-1.db"),early=join(d,"backup-2.db"),next=join(d,"backup-3.db");
 writeFileSync(big,Buffer.alloc(32*1024*1024,7),{mode:0o600});writeFileSync(big+"-journal","j");
 writeFileSync(early,"early");writeFileSync(early+"-journal","j");writeFileSync(next,Buffer.alloc(1000,1));
 const files=[big,early,next];let gate=null;
 try{
  link=stand(async b=>{
   if(b.cmd!=="backup")return {ok:true};
   const path=files.shift();if(path===early)await new Promise(r=>{gate=r;});
   return {ok:true,path,bytes:statSync(path).size};
  });
  const {c}=await linked(a,0);
  // Mid-stream: the console stops reading at the first chunk and cancels; whatever was already on its way is all it gets.
  const id=seq++;let paused=false;
  c.onMsg=m=>{if(m.t==="chunk"&&m.id===id&&!paused){paused=true;c.sock.pause();c.send({t:"cancel",id});}};
  c.send({t:"req",id,body:{cmd:"backup"}});
  assert.ok(await until(()=>paused,5000),"first chunk");
  await sleep(500);c.sock.resume();
  assert.ok(await gone(big),"copy and journal deleted: "+readdirSync(d));
  await sleep(500);
  const n=c.msgs.filter(m=>m.t==="chunk"&&m.id===id).length;
  assert.ok(n<128,`stopped early (${n} chunks of 128)`);
  assert.ok(!c.msgs.some(m=>m.t==="res"&&m.id===id),"no answer after a cancel");
  // Cancelled while the copy is still being made: nothing is sent once it is ready, and it is deleted.
  const id2=seq++;c.send({t:"req",id:id2,body:{cmd:"backup"}});
  assert.ok(await until(()=>gate,3000),"copy started");
  c.send({t:"cancel",id:id2});await sleep(200);gate();
  assert.ok(await gone(early),"early copy deleted");await sleep(300);
  assert.ok(!c.msgs.some(m=>m.id===id2&&(m.t==="res"||m.t==="chunk")),"nothing for a cancelled request");
  // Unknown frames and a cancel for nothing are ignored; the link goes on.
  c.send({t:"quoi",id:5});c.send({t:"cancel",id:999999});c.send({t:"cancel"});
  assert.deepEqual((await req(c,{cmd:"list"})).body,{ok:true});
  const r=await req(c,{cmd:"backup"});assert.equal(r.body.ok,true,JSON.stringify(r.body));assert.equal(r.body.bytes,1000);
  assert.ok(!c.closed);
 }finally{link?.stop();gate?.();await a.close();}
});

it("one backup at a time: a second one while the first runs is refused at once, then backups work again",async()=>{
 const a=await fakeAdmin(3874),d=mkdtempSync(join(tmpdir(),"pglink7-"));let link=null,calls=0;const gates=[];
 try{
  link=stand(async b=>{
   if(b.cmd!=="backup")return {ok:true};
   const path=join(d,`backup-${++calls}.db`);writeFileSync(path,Buffer.alloc(300*1024,calls));
   await new Promise(r=>gates.push(r));return {ok:true,path,bytes:300*1024};
  });
  const {c}=await linked(a,0);
  const id1=seq++,id2=seq++;c.send({t:"req",id:id1,body:{cmd:"backup"}});
  assert.ok(await until(()=>gates.length===1,3000));
  c.send({t:"req",id:id2,body:{cmd:"backup"}});
  const busy=await msg(c,m=>m.t==="res"&&m.id===id2,3000);
  assert.deepEqual(busy.body,{ok:false,error:"Une sauvegarde est déjà en cours."});
  assert.equal(calls,1,"no second copy made");
  gates.shift()();
  const r1=await msg(c,m=>m.t==="res"&&m.id===id1);assert.equal(r1.body.ok,true);
  const p=req(c,{cmd:"backup"});assert.ok(await until(()=>gates.length===1,3000));gates.shift()();
  assert.equal((await p).body.ok,true);assert.equal(calls,2);
 }finally{link?.stop();while(gates.length)gates.shift()();await a.close();}
});

it("an answer up to 8 Mio goes through the link; beyond, a clear refusal",async()=>{
 const a=await fakeAdmin(3874);let link=null;
 try{
  link=stand(async b=>({ok:true,pad:"x".repeat(b.n)}));
  const {c}=await linked(a,0);
  const r=await req(c,{cmd:"list",n:8*1024*1024-64});assert.equal(r.body.ok,true);assert.equal(r.body.pad.length,8*1024*1024-64);
  const t=await req(c,{cmd:"list",n:8*1024*1024});assert.equal(t.body.ok,false);assert.match(t.body.error,/Réponse trop grosse/);
 }finally{link?.stop();await a.close();}
});

it("what the console sends is cleaned of control and bidi characters before it is logged",async()=>{
 const a=await fakeAdmin(3874),log=quiet();let link=null;
 try{
  link=L.startLink(L.linkConfig(linkEnv(3874)),{instance:crypto.randomUUID(),info:()=>({name:"X",version:"1.7.3",players:0}),log,exec:async()=>({ok:true})});
  const c0=await a.conn(0);await msg(c0,m=>m.t==="hello");
  c0.send({t:"refused",reason:"x\u001b[2J‮\n",msg:"m"});
  const c1=await a.conn(1,5000);await msg(c1,m=>m.t==="hello");
  c1.send({t:"welcome",id:"p-1‮⁦\u0007\r\nfaux"});
  assert.ok(await until(()=>log.lines.some(l=>/liée/.test(l))),log.lines.join("\n"));
  assert.ok(log.lines.some(l=>/refusée/.test(l)),log.lines.join("\n"));
  for(const l of log.lines)assert.ok(!/[\p{Cc}\p{Cf}]/u.test(l),JSON.stringify(l));
 }finally{link?.stop();await a.close();}
});

// ------------------------------------------------------------------ leftovers of a stop in the middle of a transfer
function plant(d){
 const old=(Date.now()-20*60e3)/1000;
 for(const f of ["backup-1000.db","backup-1000.db-journal","backup-x.db"]){writeFileSync(join(d,f),"x");utimesSync(join(d,f),old,old);}
 writeFileSync(join(d,"backup-1001.db"),"young");
}
const swept=d=>until(()=>!existsSync(join(d,"backup-1000.db"))&&!existsSync(join(d,"backup-1000.db-journal")),5000);
it("a linked game sweeps old backup copies next to its database at start (no admin socket)",async()=>{
 const d=mkdtempSync(join(tmpdir(),"pglink8-"));plant(d);
 const p=await boot(API,d,linkEnv(3873));
 try{
  assert.ok(await swept(d),"old copies gone: "+readdirSync(d));
  for(const f of ["backup-1001.db","backup-x.db"])assert.ok(existsSync(join(d,f)),f+" stays");
 }finally{await stop(p);}
});
it("the chores sweep the database folder too, link or not",async()=>{
 const d=mkdtempSync(join(tmpdir(),"pglink9-"));plant(d);
 const p=await boot(API,d,{});
 try{
  assert.ok(await swept(d),"old copies gone: "+readdirSync(d));
  for(const f of ["backup-1001.db","backup-x.db"])assert.ok(existsSync(join(d,f)),f+" stays");
 }finally{await stop(p);}
});
