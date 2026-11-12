// The network link (admin/link.mjs, 1.7.3): the hand-written certificate, the hello and its refusals, the limits,
// the heartbeat, requests multiplexed over one connection, a backup streamed in pieces, revocation; then the console
// (admin/server.mjs) with a fake main game on its Unix socket and fake network parties: /api/parties for the owner
// alone, a party waiting for its first connection kept out of /api/servers and of the moderators' rights, a linked one
// driven like a socket, its backups, the "Liaison" alert; then the fixes after the pentest (Avenant 1): limits counted
// from the raw TCP connection, a valid token never refused for its address, lines and their memory, a backup given up
// (cancel), the announced data cleaned; then the last ones: 64 not yet authenticated in all, big answers within their
// own budget, the admin volume's reserve, /api/servers never waiting for a mute party, what a party answers typed.
// Ports 3875-3886.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import tls from "node:tls";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {der,makeCert,certificate,createLink,newToken} from "../admin/link.mjs";

const SERVER=process.env.ADMIN_SERVER||"/w/admin/server.mjs",PASS="mot-de-passe-admin-tres-long";
const P={unit:3875,limits:3876,beat:3877,admin:3878,link:3879,closed:3880,drip:3882,budget:3883,raw:3884,taken:3886};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,ms=4000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await f())return true;await sleep(25);}return false;};
// Every wait of these tests is bounded: a promise that does not settle in time fails the test instead of hanging the suite.
const within=(p,ms,what)=>{let t;return Promise.race([p,new Promise((_,ko)=>{t=setTimeout(()=>ko(new Error(`${what}: nothing after ${ms} ms`)),ms);})]).finally(()=>clearTimeout(t));};
const tmp=p=>fs.mkdtempSync(join(tmpdir(),p));
class Err extends Error{constructor(status,msg){super(msg);this.status=status;}}
const quiet={log:()=>{},warn:()=>{}};

// A fake party: TLS without checking the chain, the fingerprint read before anything is sent, then the hello. It answers
// the pings and runs each req through handlers[cmd] (a returned undefined: no answer).
function party(port,{token,instance=crypto.randomUUID(),v=1,name="Distante",version="1.7.3",handlers={},localAddress,pong=true,raw=false}={}){
 return within(new Promise((ok,ko)=>{
  const s=tls.connect({host:"127.0.0.1",port,rejectUnauthorized:false,minVersion:"TLSv1.3",...(localAddress?{localAddress}:{})},()=>{
   s.fp=s.getPeerCertificate().fingerprint256;s.proto=s.getProtocol();
   if(!raw)s.write(JSON.stringify({t:"hello",v,token,instance,name,version,players:3})+"\n");
   ok(s);
  });
  const closed=new Promise(r=>s.on("close",r));
  s.frames=[];s.reqs=[];s.instance=instance;Object.defineProperty(s,"done",{get:()=>within(closed,8000,"connection close")});s.on("error",e=>{if(!s.fp)ko(e);});
  s.on("close",()=>{if(!s.fp)ko(new Error("closed before TLS"));});
  let buf="";
  s.on("data",d=>{buf+=d;let i;while((i=buf.indexOf("\n"))>=0){
   const m=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);s.frames.push(m);s.emit("frame",m);
   if(m.t==="ping"&&pong)s.write('{"t":"pong"}\n');
   if(m.t==="req"){s.reqs.push(m);const h=handlers[m.body.cmd];
    Promise.resolve(h?h(m.body,s,m.id):{ok:false,error:"Commande inconnue."}).then(body=>{if(body!==undefined&&!s.destroyed)s.write(JSON.stringify({t:"res",id:m.id,body})+"\n");});}
  }});
 }),8000,"TLS connect");
}
const frame=(s,t,ms=6000)=>within(new Promise(r=>{const f=s.frames.find(x=>x.t===t);if(f)return r(f);s.on("frame",function h(m){if(m.t===t){s.off("frame",h);r(m);}});}),ms,`frame ${t}`);
const answer=s=>within(new Promise(r=>{const f=s.frames.find(x=>x.t==="welcome"||x.t==="refused");if(f)return r(f);s.on("frame",function h(m){if(m.t==="welcome"||m.t==="refused"){s.off("frame",h);r(m);}});}),6000,"welcome or refused");
// Pieces of 256 KiB at most, then the res with size and hash (what the API side does after VACUUM INTO).
async function stream(s,id,data,{lie=false}={}){
 for(let o=0;o<data.length;o+=256*1024)s.write(JSON.stringify({t:"chunk",id,data:data.subarray(o,o+256*1024).toString("base64")})+"\n");
 return {ok:true,stream:true,bytes:data.length,sha256:lie?"0".repeat(64):crypto.createHash("sha256").update(data).digest("hex")};
}
function sqliteBase(rows=2){
 const f=join(tmp("pgl-db-"),"b.db"),d=new DatabaseSync(f);
 d.exec("CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT,pad BLOB)");
 const st=d.prepare("INSERT INTO players(name,pad) VALUES(?,?)");for(let i=0;i<rows;i++)st.run("p"+i,crypto.randomBytes(4000));
 d.close();return fs.readFileSync(f);
}

// ===================================================================== the certificate
test("DER: minimal positive integers, OIDs, both kinds of dates",()=>{
 assert.deepEqual([...der.int(2)],[2,1,2]);assert.deepEqual([...der.int(128)],[2,2,0,128]);assert.deepEqual([...der.int(Buffer.from([0,0,5]))],[2,1,5]);
 assert.deepEqual([...der.oid("1.2.840.10045.4.3.2")],[6,8,0x2a,0x86,0x48,0xce,0x3d,4,3,2]);
 assert.equal(der.time(Date.UTC(2046,0,2,3,4,5))[0],0x17);assert.equal(der.time(Date.UTC(2051,0,1))[0],0x18);
 assert.equal(der.time(Date.UTC(2046,0,2,3,4,5)).subarray(2).toString(),"460102030405Z");
 const long=der.octets(Buffer.alloc(300));assert.deepEqual([...long.subarray(0,4)],[4,0x82,1,44]);
});

test("the certificate Node can read, verify and serve over TLS 1.3",async()=>{
 const c=makeCert(),x=new crypto.X509Certificate(c.cert);
 assert.equal(x.subject,"CN=PolitiGo admin");assert.equal(x.issuer,"CN=PolitiGo admin");
 assert.equal(x.verify(x.publicKey),true,"self-signed, ecdsa-with-SHA256");
 assert.equal(x.publicKey.asymmetricKeyDetails.namedCurve,"prime256v1");assert.equal(x.ca,false);
 assert.ok(x.checkPrivateKey(crypto.createPrivateKey(c.key)));
 const years=(new Date(x.validTo)-new Date(x.validFrom))/(365.25*864e5);assert.ok(years>19.9&&years<20.1,String(years));
 assert.match(x.fingerprint256,/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
 const srv=tls.createServer({key:c.key,cert:c.cert,minVersion:"TLSv1.3"},s=>s.end("ok\n"));
 await new Promise(r=>srv.listen(P.unit,"127.0.0.1",r));
 try{
  const s=await party(P.unit,{raw:true});
  assert.equal(s.proto,"TLSv1.3");assert.equal(s.fp,x.fingerprint256);s.destroy();
  await assert.rejects(new Promise((ok,ko)=>{const s=tls.connect({host:"127.0.0.1",port:P.unit,rejectUnauthorized:false,maxVersion:"TLSv1.2"},ok);s.on("error",ko);}),"TLS 1.2 refused");
 }finally{srv.close();}
});

test("kept in link/: key 0600, the same fingerprint at every start, a new one only when unreadable",()=>{
 const dir=join(tmp("pgl-c-"),"link"),a=certificate(dir,{log:()=>{}}),b=certificate(dir,{log:()=>{}});
 assert.equal(a.fingerprint,b.fingerprint,"stable");assert.equal(fs.statSync(join(dir,"key.pem")).mode&0o777,0o600);
 assert.ok(Math.abs(a.created-Date.now())<5000);
 assert.equal(certificate(join(dir,"none"),{create:false}),null,"create:false only reads");
 fs.writeFileSync(join(dir,"cert.pem"),"abîmé");let said="";
 const c=certificate(dir,{log:m=>{said+=m;}});assert.notEqual(c.fingerprint,a.fingerprint);assert.match(said,/unreadable/);
 assert.equal(certificate(dir,{log:()=>{}}).fingerprint,c.fingerprint);
});

// ===================================================================== the protocol, in process
let L,root,linked=[],left=[];
before(async()=>{
 root=tmp("pgl-u-");
 L=createLink({root,Err,...quiet,helloMs:300,pingMs:100,deadMs:600,onLink:p=>linked.push(p.id),onLeave:id=>left.push(id)});
 await L.listen(P.unit+10,"127.0.0.1");   // 3885
});
after(()=>L.close());
const U=P.unit+10;

test("hello: an unknown token, the right one, then another machine with it (refused, recorded), the same machine again",async()=>{
 const {party:p,token}=L.add("Salon");assert.match(token,/^pgk_[A-Za-z0-9_-]{43}$/);assert.match(p.id,/^p-[0-9a-f]{8}$/);
 const file=fs.readFileSync(join(root,"parties.json"),"utf8");assert.ok(!file.includes(token),"never in clear");assert.ok(file.includes(crypto.createHash("sha256").update(token).digest("hex")));
 assert.equal(fs.statSync(join(root,"parties.json")).mode&0o777,0o600);
 const bad=await party(U,{token:newToken(),localAddress:"127.0.0.21"});assert.deepEqual(await answer(bad),{t:"refused",reason:"token",msg:(await answer(bad)).msg});await bad.done;
 const a=await party(U,{token,name:"Salon de Simon"});assert.deepEqual(await answer(a),{t:"welcome",id:p.id});
 assert.deepEqual(linked,[p.id]);assert.equal(L.live(p.id),true);
 const q=L.list().find(x=>x.id===p.id);assert.equal(q.instance,a.instance);assert.equal(q.announced,"Salon de Simon");assert.equal(q.version,"1.7.3");assert.equal(q.addr,"127.0.0.1");assert.ok(q.firstSeen);
 const other=await party(U,{token});const r=await answer(other);assert.equal(r.reason,"instance");assert.match(r.msg,/autre machine/);await other.done;
 const rec=L.list().find(x=>x.id===p.id).refused;assert.equal(rec.instance,other.instance);assert.equal(rec.addr,"127.0.0.1");
 assert.equal(L.live(p.id),true,"the linked one stays");
 const again=await party(U,{token,instance:a.instance});assert.equal((await answer(again)).t,"welcome");
 await a.done;assert.equal(L.live(p.id),true,"the restart replaced the old link");assert.deepEqual(linked,[p.id],"bound once");
 assert.equal(L.ack(p.id,other.instance),true);assert.equal(L.list().find(x=>x.id===p.id).refused,null);
 again.destroy();
});

test("hello: a protocol too old is refused as such, a garbled one is cut",async()=>{
 const {party:p,token}=L.add("Vieille");
 const old=await party(U,{token,v:0,version:"1.7.2"});const r=await answer(old);assert.equal(r.reason,"version");assert.equal(r.msg,"Partie trop ancienne : 1.7.3 au moins.");
 assert.deepEqual({version:L.runtime(p.id).tooOld.version,instance:L.list().find(x=>x.id===p.id).instance},{version:"1.7.2",instance:null});
 const none=await party(U,{raw:true});none.write(JSON.stringify({t:"hello",token,instance:crypto.randomUUID(),name:"x",version:"1.7.2"})+"\n");assert.equal((await answer(none)).reason,"version","no v at all");
 const junk=await party(U,{raw:true,localAddress:"127.0.0.22"});junk.write("pas du json\n");await junk.done;assert.equal(junk.frames.length,0);
});

test("10 s without a hello (300 ms here) and an oversized line: cut",async()=>{
 const t0=Date.now(),mute=await party(U,{raw:true,localAddress:"127.0.0.23"});await mute.done;
 const took=Date.now()-t0;assert.ok(took>=250&&took<3000,String(took));
 const big=await party(U,{raw:true,localAddress:"127.0.0.24"});big.write("x".repeat(5000));await big.done;assert.equal(big.frames.length,0,"4 KiB before the hello");
 const {party:p,token}=L.add("Grosse");const s=await party(U,{token});await answer(s);
 s.write(JSON.stringify({t:"pong",pad:"y".repeat(512*1024)})+"\n");await sleep(100);assert.equal(L.live(p.id),true,"512 KiB once linked");
 s.write("z".repeat(1024*1024+1));await s.done;assert.equal(L.live(p.id),false,"over 1 MiB");
});

test("requests multiplexed on one link: answers out of order each reach their caller; a dropped link fails them",async()=>{
 const {party:p,token}=L.add("Multi");
 const slow={stats:async()=>{await sleep(200);return {ok:true,which:"stats"};},list:()=>({ok:true,which:"list"}),never:()=>undefined};
 const s=await party(U,{token,handlers:slow});await answer(s);
 const order=[];
 const [a,b]=await Promise.all([L.request(p.id,{cmd:"stats",via:"web"}).then(r=>{order.push("stats");return r;}),L.request(p.id,{cmd:"list",via:"web"}).then(r=>{order.push("list");return r;})]);
 assert.deepEqual([a.which,b.which,order],["stats","list",["list","stats"]]);
 assert.deepEqual(s.reqs.map(r=>r.body),[{cmd:"stats",via:"web"},{cmd:"list",via:"web"}],"exactly the socket's object");
 await assert.rejects(L.request(p.id,{cmd:"never"},{timeout:150}),e=>e.status===504);
 const pend=L.request(p.id,{cmd:"never"},{timeout:5000});s.destroy();
 await assert.rejects(pend,e=>e.status===502&&e.message==="Partie injoignable (liaison coupée).");
 await assert.rejects(L.request(p.id,{cmd:"stats"}),e=>e.status===502);
});

test("a backup streamed in pieces: size and SHA-256 checked, 0600; a wrong hash leaves nothing",async()=>{
 const {party:p,token}=L.add("Sauvée"),data=crypto.randomBytes(700*1024);let lie=false;
 const s=await party(U,{token,handlers:{backup:(b,s,id)=>stream(s,id,data,{lie})}});await answer(s);
 const dir=tmp("pgl-in-"),f=join(dir,"backup-1.db");
 const r=await L.request(p.id,{cmd:"backup"},{file:f});
 assert.equal(r.path,f);assert.equal(r.bytes,data.length);assert.ok(fs.readFileSync(f).equals(data));assert.equal(fs.statSync(f).mode&0o777,0o600);
 assert.ok(s.frames.filter(x=>x.t==="req").length===1);
 lie=true;const g=join(dir,"backup-2.db");
 await assert.rejects(L.request(p.id,{cmd:"backup"},{file:g}),e=>e.status===502&&/abîmée/.test(e.message));
 assert.ok(await until(()=>!fs.existsSync(g)),"the bad copy is gone");
 // A refusal of the game itself passes as such, without a file.
 const h=join(dir,"backup-3.db");s.removeAllListeners("frame");
 const no=await party(U,{token,instance:s.instance,handlers:{backup:()=>({ok:false,error:"disque plein"})}});await answer(no);
 assert.deepEqual(await L.request(p.id,{cmd:"backup"},{file:h}),{ok:false,error:"disque plein"});assert.ok(await until(()=>!fs.existsSync(h)));
 no.destroy();
});

test("revocation: a renewed token closes the link and the old token stops; a removed party too",async()=>{
 const {party:p,token}=L.add("Révoquée"),s=await party(U,{token});await answer(s);
 const {token:t2}=L.renew(p.id);await s.done;assert.equal(L.live(p.id),false);assert.ok(!left.includes(p.id),"renewed: still a party of the console");
 assert.ok(L.linked().some(x=>x.id===p.id),"kept among the servers until it comes back");
 assert.equal(L.list().find(x=>x.id===p.id).instance,null,"waits for its first connection again");assert.ok(L.list().find(x=>x.id===p.id).firstSeen,"firstSeen kept");
 const old=await party(U,{token,localAddress:"127.0.0.25"});assert.equal((await answer(old)).reason,"token");
 const n=await party(U,{token:t2});assert.equal((await answer(n)).t,"welcome");
 L.remove(p.id);await n.done;assert.equal(L.list().some(x=>x.id===p.id),false);assert.ok(left.includes(p.id),"removed: gone");
 const gone=await party(U,{token:t2,localAddress:"127.0.0.25"});assert.equal((await answer(gone)).reason,"token");
});

test("parties: 20 at most, labels unique without case or accents",()=>{
 const r2=tmp("pgl-n-"),l=createLink({root:r2,Err,...quiet});
 l.add("Été");assert.throws(()=>l.add(" ete "),e=>e.status===409);assert.throws(()=>l.add(""),e=>e.status===400);assert.throws(()=>l.add("x".repeat(41)),e=>e.status===400);
 for(let i=1;i<20;i++)l.add("Partie "+i);assert.throws(()=>l.add("Une de trop"),e=>e.status===400&&/20 parties/.test(e.message));
 l.close();
 const back=createLink({root:r2,Err,...quiet});assert.equal(back.list().length,20,"kept");back.close();
});

test("limits: 3 not yet authenticated per address, the next one cut before TLS; four addresses holding theirs leave room for a real party (64 in all)",async()=>{
 const l=createLink({root:tmp("pgl-l-"),Err,...quiet,helloMs:5000});await l.listen(P.limits,"127.0.0.1");const held=[];
 try{
  for(let i=0;i<3;i++)held.push(await party(P.limits,{raw:true,localAddress:"127.0.0.31"}));
  await assert.rejects(party(P.limits,{raw:true,localAddress:"127.0.0.31"}),"the 4th of that address: closed before TLS");
  for(const a of ["127.0.0.32","127.0.0.33","127.0.0.34"])for(let i=0;i<3;i++)held.push(await party(P.limits,{raw:true,localAddress:a}));
  const {token}=l.add("Bonne");
  const ok=await party(P.limits,{token,localAddress:"127.0.0.35"});assert.equal((await answer(ok)).t,"welcome","12 mute connections from 4 addresses: a real party still gets in");ok.destroy();
  for(const s of held)s.destroy();await sleep(150);
  const again=await party(P.limits,{token,instance:ok.instance,localAddress:"127.0.0.31"});assert.equal((await answer(again)).t,"welcome","room again once they are gone");again.destroy();
 }finally{for(const s of held)s.destroy();l.close();}
});

test("heartbeat: a ping every period; a party that answers stays, a silent one is cut",async()=>{
 const l=createLink({root:tmp("pgl-b-"),Err,...quiet,pingMs:80,deadMs:400});await l.listen(P.beat,"127.0.0.1");
 try{
  const a=l.add("Vive"),b=l.add("Muette");
  const sa=await party(P.beat,{token:a.token}),sb=await party(P.beat,{token:b.token,pong:false});await answer(sa);await answer(sb);
  await sb.done;assert.ok(sb.frames.filter(x=>x.t==="ping").length>=2);
  assert.ok(await until(()=>!l.live(b.party.id)));assert.equal(l.live(a.party.id),true);assert.ok(l.list().find(x=>x.id===b.party.id).lastSeen);
  sa.destroy();
 }finally{l.close();}
});

// ===================================================================== after the pentest (Avenant 1)
test("F1: mute TCP sockets count from the raw connection: the 4th of an address and the 65th in all are cut at once, the others after the hello delay",async()=>{
 const l=createLink({root:tmp("pgl-r-"),Err,...quiet,helloMs:1500});await l.listen(P.raw,"127.0.0.1");
 const mute=a=>{const s=net.connect({host:"127.0.0.1",port:P.raw,localAddress:a}),t0=Date.now();s.on("error",()=>{});s.closedAfter=within(new Promise(r=>s.on("close",()=>r(Date.now()-t0))),5000,"mute socket closed");return s;};
 try{
  const three=[0,1,2].map(()=>mute("127.0.0.41"));await sleep(100);
  const fourth=mute("127.0.0.41");assert.ok(await fourth.closedAfter<300,"the 4th of that address: cut at once");
  for(const s of three){const ms=await s.closedAfter;assert.ok(ms>=1300&&ms<4000,`closed after ${ms} ms`);}
  const many=[];for(let i=0;i<64;i++)many.push(mute(`127.0.0.${50+Math.floor(i/3)}`));await sleep(300);
  const over=mute("127.0.0.90");assert.ok(await over.closedAfter<300,"the 65th: cut at once");
  for(const s of many){const ms=await s.closedAfter;assert.ok(ms>=1000&&ms<4500,`one of the 64 closed after ${ms} ms`);}
  const {token}=l.add("Après");const s=await party(P.raw,{token,localAddress:"127.0.0.41"});assert.equal((await answer(s)).t,"welcome","the address is free again");s.destroy();
 }finally{l.close();}
});

test("F5: only unknown tokens count (30 per address), then busy for them; the right token from that very address still gets in",async()=>{
 for(let i=0;i<30;i++){const s=await party(U,{token:newToken(),localAddress:"127.0.0.36"});assert.equal((await answer(s)).reason,"token",`try ${i}`);await s.done;}
 const over=await party(U,{token:newToken(),localAddress:"127.0.0.36"});const r=await answer(over);assert.equal(r.reason,"busy");assert.match(r.msg,/réessaie plus tard/);await over.done;
 const {party:p,token}=L.add("Après trente faux"),good=await party(U,{token,localAddress:"127.0.0.36"});
 assert.equal((await answer(good)).t,"welcome","a valid token is never refused for its address");assert.equal(L.live(p.id),true);good.destroy();
 // No hello, a line too long: not counted.
 const mute=await party(U,{raw:true,localAddress:"127.0.0.37"});await mute.done;
 const fat=await party(U,{raw:true,localAddress:"127.0.0.37"});fat.write("x".repeat(5000));await fat.done;
 const bad=await party(U,{token:newToken(),localAddress:"127.0.0.37"});assert.equal((await answer(bad)).reason,"token");await bad.done;
});

test("F4: a line of 8 MiB with no request of that id waiting is cut at 1 MiB; an answer to a waiting request may be bigger",async()=>{
 const {party:p,token}=L.add("Lignes");
 const s=await party(U,{token,handlers:{list:()=>({ok:true,pad:"b".repeat(3*1024*1024)})}});await answer(s);
 const r=await L.request(p.id,{cmd:"list"},{timeout:5000});assert.equal(r.pad.length,3*1024*1024,"3 MiB for a waiting request");
 s.write(`{"t":"res","id":99,"body":{"ok":true,"pad":"${"a".repeat(8*1024*1024)}`);await s.done;assert.ok(await until(()=>!L.live(p.id),3000),"cut");   // the console sees the cut a moment after the party
});

test("the lines being read hold 64 MiB at most in all (2.5 MiB here): past it, the greediest connection is cut",async()=>{
 const l=createLink({root:tmp("pgl-m-"),Err,...quiet,budget:2.5*1024*1024});await l.listen(P.budget,"127.0.0.1");
 try{
  const ps=[];for(const n of ["Une","Deux","Trois"]){const {party:p,token}=l.add(n);const s=await party(P.budget,{token});await answer(s);ps.push({p,s});}
  for(const {s} of ps){s.write("x".repeat(900*1024));await sleep(200);}
  assert.ok(await until(()=>ps.filter(x=>l.live(x.p.id)).length===2,3000),"one cut");
  await sleep(200);assert.equal(ps.filter(x=>l.live(x.p.id)).length,2,"the others stay");
  for(const {s} of ps)s.destroy();
 }finally{l.close();}
});

test("F2: a backup dripping bytes is given up (64 KiB/s over 30 s, 300 ms here) with a cancel; 10 min in all (1.5 s here); one at a time; F6: 0 byte is refused",async()=>{
 const l=createLink({root:tmp("pgl-g-"),Err,...quiet,rateMs:300,backupMs:1500});await l.listen(P.drip,"127.0.0.1");
 const dir=tmp("pgl-gi-");let mode="drip";
 const backup=async(b,s,id)=>{
  if(mode==="empty")return {ok:true,stream:true,bytes:0,sha256:crypto.createHash("sha256").update("").digest("hex")};
  if(mode==="silent")return undefined;
  const end=Date.now()+4000;while(mode==="drip"&&!s.destroyed&&Date.now()<end&&!s.frames.some(f=>f.t==="cancel"&&f.id===id)){s.write(JSON.stringify({t:"chunk",id,data:"eA=="})+"\n");await sleep(50);}
  return undefined;
 };
 try{
  const {party:p,token}=l.add("Goutte"),s=await party(P.drip,{token,handlers:{backup}});await answer(s);
  const t0=Date.now(),a=join(dir,"a.db");
  await assert.rejects(within(l.request(p.id,{cmd:"backup"},{timeout:5000,file:a}),3000,"dripping backup"),e=>e.status===504&&/trop lente/.test(e.message));
  assert.ok(Date.now()-t0<1400,"given up at the first window");
  assert.equal((await frame(s,"cancel",2000)).id,s.reqs[0].id,"the party is told to stop");
  assert.ok(await until(()=>!fs.existsSync(a)),"its file gone");
  mode="silent";const t1=Date.now(),b=join(dir,"b.db");
  const first=l.request(p.id,{cmd:"backup"},{timeout:5000,file:b});first.catch(()=>{});
  await assert.rejects(l.request(p.id,{cmd:"backup"},{timeout:5000,file:join(dir,"c.db")}),e=>e.status===409&&/déjà en cours/.test(e.message),"one backup at a time per party");
  assert.equal(fs.existsSync(join(dir,"c.db")),false);
  await assert.rejects(within(first,4000,"silent backup"),e=>e.status===504&&/trop longue/.test(e.message));
  assert.ok(Date.now()-t1>=1400,"the whole delay");
  assert.ok(await until(()=>s.frames.filter(f=>f.t==="cancel").length===2));
  mode="empty";const e=join(dir,"e.db");
  await assert.rejects(within(l.request(p.id,{cmd:"backup"},{timeout:5000,file:e}),3000,"empty backup"),x=>x.status===502&&/vide/.test(x.message));
  assert.ok(await until(()=>!fs.existsSync(e)));
  assert.equal(l.live(p.id),true,"the link itself stays");s.destroy();
 }finally{l.close();}
});

test("N1: answers over 1 MiB hold 32 MiB at most together (3 MiB here), until handled: one more is refused (503), its link stays, room comes back",async()=>{
 const l=createLink({root:tmp("pgl-v-"),Err,...quiet,big:3*1024*1024});await l.listen(P.budget,"127.0.0.1");
 const pad=n=>"a".repeat(n),MiB=1024*1024;let go;const later=new Promise(r=>{go=r;});
 // A: an answer of 2 MiB that stops half way, then ends; B: an answer of 2 MiB at once.
 const half={list:(b,s,id)=>{s.write(`{"t":"res","id":${id},"body":{"ok":true,"pad":"${pad(2*MiB)}`);later.then(()=>s.write('"}}\n'));return undefined;}};
 const whole={list:()=>({ok:true,pad:pad(2*MiB)})};let sa,sb;
 try{
  const a=l.add("Moitié"),b=l.add("Entière");
  sa=await party(P.budget,{token:a.token,handlers:half});sb=await party(P.budget,{token:b.token,handlers:whole});await answer(sa);await answer(sb);
  const ra=l.request(a.party.id,{cmd:"list"},{timeout:8000});ra.catch(()=>{});
  await sleep(400);   // A's 2 MiB are being read
  await assert.rejects(within(l.request(b.party.id,{cmd:"list"},{timeout:8000}),6000,"B refused"),e=>e.status===503&&/trop de grosses réponses/.test(e.message));
  assert.equal(l.live(b.party.id),true,"B's link stays");assert.equal(l.live(a.party.id),true);
  go();const got=await within(ra,6000,"A's answer");assert.equal(got.pad.length,2*MiB,"A's answer arrives whole");
  await sleep(50);const again=await within(l.request(b.party.id,{cmd:"list"},{timeout:8000}),6000,"B again");assert.equal(again.pad.length,2*MiB,"room again once A is handled");
  }finally{go();sa?.destroy();sb?.destroy();l.close();}
});

test("N5: a streamed backup keeps 128 MiB free in the admin volume: refused at once below it, stopped (507, its file gone, cancel) when it falls below",async()=>{
 let free=1e12;
 const l=createLink({root:tmp("pgl-f-"),Err,...quiet,freeSpace:()=>free});await l.listen(P.drip,"127.0.0.1");
 const dir=tmp("pgl-fi-"),piece=Buffer.alloc(256*1024,7).toString("base64");
 const backup=async(b,s,id)=>{for(let i=0;i<40&&!s.destroyed&&!s.frames.some(f=>f.t==="cancel"&&f.id===id);i++){s.write(JSON.stringify({t:"chunk",id,data:piece})+"\n");await sleep(60);}return undefined;};
 let s;
 try{
  const {party:p,token}=l.add("Pleine");s=await party(P.drip,{token,handlers:{backup}});await answer(s);
  free=100*1024*1024;const a=join(dir,"a.db");
  await assert.rejects(l.request(p.id,{cmd:"backup"},{timeout:5000,file:a}),e=>e.status===507&&/moins de 128 Mio libres/.test(e.message));
  assert.equal(fs.existsSync(a),false,"nothing written");
  free=1e12;const b=join(dir,"b.db");
  const run=l.request(p.id,{cmd:"backup"},{timeout:5000,file:b});run.catch(()=>{});
  assert.ok(await until(()=>fs.existsSync(b)&&fs.statSync(b).size>0,3000),"the pieces flow");
  free=128*1024*1024+1000;
  await assert.rejects(within(run,4000,"backup stopped"),e=>e.status===507&&/Espace libre insuffisant/.test(e.message));
  assert.ok(await until(()=>!fs.existsSync(b)),"its file gone");
  assert.ok((await frame(s,"cancel",2000)).id>0,"the party is told to stop");
  assert.equal(l.live(p.id),true,"the link stays");
 }finally{s?.destroy();l.close();}
});

test("what a party announces is cleaned: a name without control nor bidi characters, a short version without v, players 0..1e6",async()=>{
 const {party:p,token}=L.add("Annonces");
 const s=await party(U,{token,name:"‮evil\u0007  Name‏",version:"v1.7.3"});await answer(s);
 let q=L.list().find(x=>x.id===p.id);assert.deepEqual([q.announced,q.version,L.runtime(p.id).players],["evil Name","1.7.3",3]);
 s.destroy();await s.done;
 const t=await party(U,{token,raw:true});t.write(JSON.stringify({t:"hello",v:1,token,instance:s.instance,name:"\u0000\u0001",version:"<b>9</b>",players:-5})+"\n");assert.equal((await answer(t)).t,"welcome");
 q=L.list().find(x=>x.id===p.id);assert.deepEqual([q.announced,q.version,L.runtime(p.id).players],[null,null,null]);
 t.destroy();await t.done;
 const u=await party(U,{token,raw:true});u.write(JSON.stringify({t:"hello",v:1,token,instance:s.instance,name:"x".repeat(60),version:"1".repeat(33),players:1e6+1})+"\n");await answer(u);
 q=L.list().find(x=>x.id===p.id);assert.deepEqual([q.announced.length,q.version,L.runtime(p.id).players],[40,null,null]);u.destroy();
});

test("lastSeen: the time of the last frame received, not of the disconnection",async()=>{
 const {party:p,token}=L.add("Vue"),s=await party(U,{token,pong:false});await answer(s);
 await sleep(50);s.write('{"t":"inconnue"}\n');await sleep(100);const t=Date.now();await sleep(250);s.destroy();await s.done;
 assert.ok(await until(()=>!L.live(p.id)));
 const seen=L.list().find(x=>x.id===p.id).lastSeen;assert.ok(seen<=t&&seen>=t-250,`${seen} vs ${t}`);
});

test("F8: an unreadable parties.json is set aside, a Liaison alert says so, and no change is made until it is repaired or deleted",()=>{
 const r=tmp("pgl-k-");fs.writeFileSync(join(r,"parties.json"),"{cassé");
 const l=createLink({root:r,Err,...quiet});
 const aside=fs.readdirSync(r).find(n=>/^parties\.json\.corrupt-/.test(n));assert.ok(aside,"set aside");assert.equal(fs.existsSync(join(r,"parties.json")),false);
 const a=l.alerts().find(x=>x.key.startsWith("link-file:"));assert.ok(a);assert.equal(a.kind,"link");assert.ok(a.detail.includes(aside));
 assert.throws(()=>l.add("Nouvelle"),e=>e.status===409&&/^Liste des parties illisible : /.test(e.message));
 assert.match(l.broken(),/^Liste des parties illisible/);
 fs.unlinkSync(join(r,aside));
 assert.equal(l.broken(),false);assert.equal(l.alerts().length,0);
 const {party:p}=l.add("Nouvelle");l.close();
 // Repaired: the list set aside, put back as parties.json.
 const good=fs.readFileSync(join(r,"parties.json"),"utf8");fs.writeFileSync(join(r,"parties.json"),"[[");
 const back=[];const l2=createLink({root:r,Err,...quiet,onLink:x=>back.push(x.id)});
 const aside2=fs.readdirSync(r).find(n=>/^parties\.json\.corrupt-/.test(n));assert.throws(()=>l2.renew(p.id),e=>e.status===409);
 fs.rmSync(join(r,aside2));fs.writeFileSync(join(r,"parties.json"),good);
 assert.equal(l2.renew(p.id).party.id,p.id,"the repaired list is taken back");assert.equal(l2.list().length,1);l2.close();
 assert.equal(fs.readdirSync(r).filter(n=>n.includes(".tmp-")).length,0);
});

test("a certificate regenerated while parties exist: a Liaison alert until Vu, kept across restarts; none at a first start",()=>{
 const r=tmp("pgl-z-"),l=createLink({root:r,Err,...quiet});l.cert({create:true});l.add("Ancienne");
 assert.equal(l.alerts().length,0,"a first start");l.close();
 fs.rmSync(join(r,"link","cert.pem"));
 const l2=createLink({root:r,Err,...quiet}),c=l2.cert({create:true});
 const a=l2.alerts().find(x=>x.key.startsWith("link-cert:"));assert.ok(a,"shown");assert.equal(a.kind,"link");
 assert.equal(a.title,"Certificat de liaison régénéré : chaque partie doit recevoir la nouvelle empreinte (POLITIGO_ADMIN_TLS)");assert.ok(a.detail.includes(c.fingerprint));
 l2.close();const l3=createLink({root:r,Err,...quiet});assert.ok(l3.alerts().some(x=>x.key===a.key),"kept across a restart");
 assert.equal(l3.ackCert("link-cert:autre"),false);assert.equal(l3.ackCert(a.key),true);assert.equal(l3.alerts().length,0);l3.close();
 const l4=createLink({root:r,Err,...quiet});assert.equal(l4.alerts().length,0,"Vu stays");l4.close();
});

// ===================================================================== the console
let adm,DATA,SOCK,mainSrv,notes=[];
function fakeMain(path){
 const reply=m=>m.cmd==="stats"?{ok:true,name:"Principale",version:"1.7.3",players:5,online:1}
  :m.cmd==="backup-note"?(notes.push(m.detail),{ok:true})
  :m.cmd==="player"?(m.id===7||String(m.name).toLowerCase()==="modo"?{ok:true,player:{id:7,name:"Modo"}}:{ok:false,error:"Joueur introuvable."})
  :m.cmd==="alerts"?{ok:true,items:[],acked:0}:{ok:true};
 return new Promise(ok=>{const s=net.createServer(c=>{let b="";c.on("data",d=>{b+=d;const i=b.indexOf("\n");if(i>=0)c.end(JSON.stringify(reply(JSON.parse(b.slice(0,i)))));});c.on("error",()=>{});});s.listen(path,()=>ok(s));});
}
function startAdmin(port,extra={}){
 const env={...process.env,PORT:String(port),ADMIN_HOST:"127.0.0.1",ADMIN_DATA:DATA,POLITIGO_ADMIN_SOCKET:SOCK,POLITIGO_ADMIN_PASSWORD:PASS,ADMIN_BACKUP_TICK_MS:"0",ADMIN_LINK_CACHE_MS:"0",...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[SERVER],{env,stdio:["ignore","pipe","pipe"]});p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});
 return within(new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo admin on/.test(p.out))ok(p);});p.on("exit",c=>ko(new Error("admin exited "+c+": "+p.err)));}),20000,"admin start").catch(e=>{p.kill("SIGKILL");throw e;});
}
const stop=p=>new Promise(r=>{if(!p||p.exitCode!==null)return r();p.on("exit",r);p.kill("SIGTERM");setTimeout(()=>{p.kill("SIGKILL");r();},5000).unref();});
function browser(port=P.admin){
 let cookie="";
 const req=async(path,body={},{method="POST",raw=false}={})=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,signal:AbortSignal.timeout(20000),...(method==="POST"?{body:JSON.stringify(body)}:{}),
   headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1",Origin:`http://127.0.0.1:${port}`,...(cookie?{Cookie:cookie}:{})}});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  if(raw)return r;let json=null;try{json=await r.json();}catch{}return {status:r.status,json};
 };
 return {req,login:(o={password:PASS})=>req("/api/login",o),parties:()=>req("/api/parties",{},{method:"GET"}),post:b=>req("/api/parties",b),call:(srv,cmd,a={})=>req(`/api/s/${srv}/call`,{cmd,...a})};
}
const owner=async(port)=>{const b=browser(port);assert.equal((await b.login()).status,200);return b;};
before(async()=>{
 DATA=tmp("pgl-d-");SOCK=join(tmp("pgl-s-"),"admin.sock");mainSrv=await fakeMain(SOCK);
 adm=await startAdmin(P.admin,{POLITIGO_ADMIN_LINK:"on",ADMIN_LINK_LISTEN:String(P.link),POLITIGO_ADMIN_LINK_BIND:"192.168.1.20",POLITIGO_ADMIN_LINK_PORT:"8091",ADMIN_LINK_PING_MS:"200"});
});
after(async()=>{await stop(adm);mainSrv?.close();});

const DIST={stats:()=>({ok:true,name:"Distante",version:"1.7.3",players:3,online:0}),player:()=>({ok:false,error:"Joueur introuvable."}),alerts:()=>({ok:true,items:[],acked:0})};
let mod=null,P1=null,T1=null,S1=null;

test("console: the listener in the startup log and in /api/parties, for the owner alone",async()=>{
 assert.match(adm.out,/admin link: parties welcome on 127\.0\.0\.1:3879 \(to paste: POLITIGO_ADMIN_URL=192\.168\.1\.20:8091\), certificate SHA-256 ([0-9A-F]{2}:){31}[0-9A-F]{2}/);
 const none=browser();assert.equal((await none.parties()).status,401);assert.equal((await none.post({action:"add",label:"x"})).status,401);
 const b=await owner(),r=await b.parties();
 assert.equal(r.status,200);const L0=r.json.listen;
 assert.deepEqual({on:L0.on,up:L0.up,error:L0.error,bind:L0.bind,port:L0.port,url:L0.url},{on:true,up:true,error:null,bind:"192.168.1.20",port:8091,url:"192.168.1.20:8091"});
 assert.equal(r.json.broken,false);
 const s=await party(P.link,{raw:true});assert.equal(L0.fingerprint,s.fp,"the certificate served");s.destroy();
 assert.equal(fs.statSync(join(DATA,"link","key.pem")).mode&0o777,0o600);assert.ok(L0.certCreated>0);
 assert.equal(r.json.parties.length,1);
 assert.deepEqual(({...r.json.parties[0],lastSeen:0}),{id:"jeu",label:"Principale",announced:"Principale",local:true,created:null,state:"local",up:true,version:"1.7.3",addr:`socket ${SOCK}`,firstSeen:null,lastSeen:0,players:5,backup:null,refused:null});
});

test("console: add gives the three lines once, never keeps nor logs the token; a pending party stays out of the servers",async()=>{
 const b=await owner(),r=await b.post({action:"add",label:"Soirée bureau"});
 assert.equal(r.status,200,JSON.stringify(r.json));
 const {POLITIGO_ADMIN_URL,POLITIGO_ADMIN_TLS,POLITIGO_ADMIN_TOKEN}=r.json.env;
 assert.equal(POLITIGO_ADMIN_URL,"192.168.1.20:8091");assert.equal(POLITIGO_ADMIN_TLS,(await b.parties()).json.listen.fingerprint);assert.match(POLITIGO_ADMIN_TOKEN,/^pgk_/);
 assert.deepEqual(Object.keys(r.json.env).sort(),["POLITIGO_ADMIN_TLS","POLITIGO_ADMIN_TOKEN","POLITIGO_ADMIN_URL"]);
 P1=r.json.party;T1=POLITIGO_ADMIN_TOKEN;assert.equal(P1.state,"pending");assert.ok(Math.abs(P1.created-Date.now())<5000);assert.equal(P1.firstSeen,null);assert.equal(P1.label,"Soirée bureau");
 assert.equal(JSON.stringify(P1).includes("pgk_"),false);assert.equal("tokenHash" in P1,false);
 const list=(await b.parties()).json.parties;assert.equal(list.find(p=>p.id===P1.id).state,"pending");assert.ok(!JSON.stringify(list).includes(T1));assert.ok(!JSON.stringify(list).includes("tokenHash"));
 assert.equal((await b.post({action:"add",label:"soiree BUREAU"})).status,409);assert.equal((await b.post({action:"add",label:"principale"})).status,409,"nor a local game's name");
 assert.equal((await b.post({action:"add",label:""})).status,400);assert.equal((await b.post({action:"nope"})).status,400);
 assert.ok(!fs.readFileSync(join(DATA,"parties.json"),"utf8").includes(T1));assert.equal(fs.statSync(join(DATA,"parties.json")).mode&0o777,0o600);
 assert.ok(await until(()=>notes.some(n=>/^Partie ajoutée : Soirée bureau/.test(n))),"in the main game's admin log");
 assert.ok(!notes.join().includes("pgk_"));
 assert.deepEqual((await b.req("/api/servers")).json.servers.map(s=>s.id),["jeu"],"pending: not a server");
 assert.equal((await b.call(P1.id,"stats")).status,404);
 // A moderator: no access to the parties, and a pending party cannot be granted.
 const m=await b.req("/api/mods/save",{player:7,server:"jeu",panels:["traiter","tableau"],actions:[],servers:["jeu",P1.id]});
 assert.equal(m.status,200,JSON.stringify(m.json));assert.deepEqual(m.json.mod.servers,["jeu"]);
 assert.deepEqual((await b.req("/api/mods")).json.servers.map(s=>s.id),["jeu"]);
 mod={name:m.json.mod.name,password:m.json.password,id:m.json.mod.id};
 const mb=browser();assert.equal((await mb.login(mod)).status,200);
 assert.equal((await mb.parties()).status,403);assert.equal((await mb.post({action:"add",label:"Pirate"})).status,403);assert.equal((await mb.post({})).status,403);
 assert.deepEqual((await mb.req("/api/servers")).json.servers.map(s=>s.id),["jeu"]);
});

test("console: once linked, the party is a server driven over the link, several calls at once",async()=>{
 const b=await owner();
 S1=await party(P.link,{token:T1,name:"Bureau 2e",handlers:{...DIST,list:async()=>{await sleep(150);return {ok:true,players:[{id:1,name:"Loin"}]};}}});
 assert.deepEqual(await answer(S1),{t:"welcome",id:P1.id});
 assert.ok(await until(async()=>(await b.req("/api/servers")).json.servers.some(s=>s.id===P1.id)));
 const s=(await b.req("/api/servers")).json.servers.find(x=>x.id===P1.id);assert.deepEqual({up:s.up,name:s.name,version:s.version,players:s.players},{up:true,name:"Distante",version:"1.7.3",players:3});
 const [l,st]=await Promise.all([b.call(P1.id,"list"),b.call(P1.id,"stats")]);
 assert.equal(l.json.players[0].name,"Loin");assert.equal(st.json.name,"Distante");
 const seen=S1.reqs.map(r=>r.body).find(x=>x.cmd==="list");assert.deepEqual(seen,{cmd:"list",via:"web"},"the very object the socket gets");
 const v=(await b.parties()).json.parties.find(p=>p.id===P1.id);
 assert.deepEqual({state:v.state,announced:v.announced,label:v.label,addr:v.addr,version:v.version,players:v.players},{state:"online",announced:"Bureau 2e",label:"Soirée bureau",addr:"127.0.0.1",version:"1.7.3",players:3});
 assert.ok(v.firstSeen&&v.lastSeen);
 // Granted to the moderator now; their servers list shows it.
 const m=await b.req("/api/mods/save",{id:mod.id,panels:["traiter","tableau"],actions:[],servers:["jeu",P1.id]});
 assert.equal(m.status,200,JSON.stringify(m.json));assert.deepEqual(m.json.mod.servers,["jeu",P1.id]);
 const mb=browser();assert.equal((await mb.login(mod)).status,200);
 assert.deepEqual((await mb.req("/api/servers")).json.servers.map(s=>s.id),["jeu",P1.id]);
 const mine=S1.reqs.map(r=>r.body).filter(x=>x.cmd==="stats").pop();assert.equal(mine.via,"web");
});

test("console: backups of a linked party, streamed, checked, kept in backups/<id>/, downloaded",async()=>{
 const b=await owner(),base=sqliteBase(40);
 S1.removeAllListeners("frame");
 const handlers={...DIST,backup:(body,s,id)=>stream(s,id,base).then(r=>({...r,vapid:body.vapid?{publicKey:"pub",privateKey:"priv"}:undefined}))};
 const s=await party(P.link,{token:T1,instance:S1.instance,name:"Bureau 2e",handlers});assert.equal((await answer(s)).t,"welcome");await S1.done;S1=s;
 const run=await b.req("/api/backups/run");assert.equal(run.status,200);
 assert.deepEqual(run.json.results.find(x=>x.id===P1.id),{id:P1.id,ok:true});
 const dir=join(DATA,"backups",P1.id),f=fs.readdirSync(dir).find(x=>/^manuelle-.*\.db$/.test(x));
 assert.ok(fs.readFileSync(join(dir,f)).equals(base),"the same bytes");assert.equal(fs.statSync(join(dir,f)).mode&0o777,0o600);
 assert.ok(fs.existsSync(join(dir,"vapid.json")));
 assert.deepEqual(fs.readdirSync(join(DATA,"link","incoming")),[],"the transfer file is gone");
 const r=await b.req(`/api/s/${P1.id}/backup`,{},{raw:true});assert.equal(r.status,200);
 assert.match(r.headers.get("content-disposition"),new RegExp(`politigo-${P1.id}-`));assert.ok(Buffer.from(await r.arrayBuffer()).equals(base));
 assert.ok(await until(()=>fs.readdirSync(join(DATA,"link","incoming")).length===0));
 const v=(await b.parties()).json.parties.find(p=>p.id===P1.id);assert.equal(v.backup.ok,true);assert.ok(v.backup.t>0);
});

test("console: the same token from another machine: refused, a Liaison alert for the owner alone, Vu files it",async()=>{
 const b=await owner(),thief=await party(P.link,{token:T1});
 assert.equal((await answer(thief)).reason,"instance");await thief.done;
 const a=(await b.call(P1.id,"alerts")).json.items.find(x=>x.kind==="link");
 assert.ok(a,"shown");assert.equal(a.key,`link:${P1.id}:${thief.instance}`);assert.match(a.title,/^Jeton de « Bureau 2e » essayé par une autre machine$/);assert.ok(a.detail.startsWith(`127.0.0.1 (instance ${thief.instance.slice(0,8)}…) a présenté le jeton`),a.detail);
 const v=(await b.parties()).json.parties.find(p=>p.id===P1.id);assert.equal(v.state,"online");assert.equal(v.refused.addr,"127.0.0.1");assert.equal("instance" in v.refused,false);
 const mb=browser();assert.equal((await mb.login(mod)).status,200);
 assert.equal((await mb.call(P1.id,"alerts")).json.items.filter(x=>x.kind==="link").length,0,"not for a moderator");
 assert.equal((await b.call(P1.id,"alerts-ack",{keys:[a.key]})).status,200);
 assert.equal((await b.call(P1.id,"alerts")).json.items.filter(x=>x.kind==="link").length,0);
 assert.equal(S1.reqs.some(r=>r.body.cmd==="alerts-ack"),false,"the game never sees that key");
 assert.match(adm.out,/token of party p-[0-9a-f]{8} was presented by another machine/);
});

test("console: a link cut leaves the party offline (up:false); renewing closes the link, the party stays (waiting); removed, its backups stay",async()=>{
 const b=await owner();
 S1.destroy();
 assert.ok(await until(async()=>(await b.parties()).json.parties.find(p=>p.id===P1.id).state==="offline"));
 const s=(await b.req("/api/servers")).json.servers.find(x=>x.id===P1.id);assert.equal(s.up,false);assert.match(s.error,/Partie injoignable \(liaison coupée\)/);
 assert.equal((await b.call(P1.id,"stats")).status,502);
 const back=await party(P.link,{token:T1,instance:S1.instance,handlers:DIST});assert.equal((await answer(back)).t,"welcome");
 const r=await b.post({action:"renew",id:P1.id});assert.equal(r.status,200);
 const T2=r.json.env.POLITIGO_ADMIN_TOKEN;assert.notEqual(T2,T1);assert.equal(r.json.party.state,"pending");assert.ok(r.json.party.firstSeen>0,"renewed, not new: firstSeen kept");
 await back.done;
 const w=(await b.req("/api/servers")).json.servers.find(x=>x.id===P1.id);
 assert.deepEqual({up:w?.up,waiting:w?.waiting},{up:false,waiting:true},"renewed: still a server, down, waiting for the new token");
 const mb=browser();assert.equal((await mb.login(mod)).status,200);
 assert.deepEqual((await mb.req("/api/servers")).json.servers.map(s=>[s.id,!!s.waiting]),[["jeu",false],[P1.id,true]],"the moderator keeps the party, waiting");
 assert.ok((await b.req("/api/backups/list")).json.servers.some(x=>x.id===P1.id&&!x.removed&&x.files.length>0),"its backups still listed");
 const old=await party(P.link,{token:T1});assert.equal((await answer(old)).reason,"token");
 const n=await party(P.link,{token:T2,handlers:DIST});assert.equal((await answer(n)).t,"welcome");
 assert.equal((await b.post({action:"remove",id:P1.id})).status,200);await n.done;
 assert.equal((await b.parties()).json.parties.some(p=>p.id===P1.id),false);
 assert.equal((await b.post({action:"remove",id:P1.id})).status,404);
 // Removed: its backups stay, listed under "Partie retirée", downloadable and deletable by the owner alone.
 const gone=(await b.req("/api/backups/list")).json.servers.find(x=>x.id===P1.id);
 assert.equal(gone?.name,`Partie retirée (${P1.id})`);assert.equal(gone.removed,true);assert.ok(gone.files.length>0);
 const f=gone.files[0].name,dl=await b.req("/api/backups/download",{server:P1.id,name:f},{raw:true});
 assert.equal(dl.status,200);assert.ok(Buffer.from(await dl.arrayBuffer()).equals(fs.readFileSync(join(DATA,"backups",P1.id,f))));
 assert.equal((await mb.req("/api/backups/download",{server:P1.id,name:f})).status,403,"not for a moderator");
 assert.equal((await mb.req("/api/backups/delete",{server:P1.id,name:f})).status,403);
 assert.equal((await b.req("/api/backups/delete",{server:P1.id,name:f})).status,200);assert.equal(fs.existsSync(join(DATA,"backups",P1.id,f)),false);
 assert.equal((await b.req("/api/backups/download",{server:"p-00000000",name:f})).status,404,"an unknown id stays unknown");
 assert.ok(await until(()=>notes.some(n=>/^Jeton de la partie .* renouvelé/.test(n))&&notes.some(n=>/^Partie retirée : /.test(n))));
 for(const t of [T1,T2]){assert.ok(!adm.out.includes(t)&&!adm.err.includes(t),"never logged");assert.ok(!notes.join().includes(t));}
 assert.ok(!fs.readFileSync(join(DATA,"parties.json"),"utf8").includes("pgk_"));
});

test("console: a linked party is back after a restart, the fingerprint unchanged",async()=>{
 const b=await owner(),fp=(await b.parties()).json.listen.fingerprint,r=await b.post({action:"add",label:"Durable"});
 const s=await party(P.link,{token:r.json.env.POLITIGO_ADMIN_TOKEN,name:"Durable",handlers:DIST});await answer(s);
 await stop(adm);await s.done;
 adm=await startAdmin(P.admin,{POLITIGO_ADMIN_LINK:"on",ADMIN_LINK_LISTEN:String(P.link),POLITIGO_ADMIN_LINK_BIND:"0.0.0.0",ADMIN_LINK_PING_MS:"200"});
 const b2=await owner(),j=(await b2.parties()).json;
 assert.equal(j.listen.fingerprint,fp,"stable");assert.equal(j.listen.url,null,"0.0.0.0: to be completed by the owner");
 assert.equal(j.parties.find(p=>p.id===r.json.party.id).state,"offline");
 assert.ok((await b2.req("/api/servers")).json.servers.some(x=>x.id===r.json.party.id&&x.up===false),"linked but not connected: listed, down");
 assert.match(adm.out,/PolitiGo admin on :3878 \(.*Durable=liaison/);
 const s2=await party(P.link,{token:r.json.env.POLITIGO_ADMIN_TOKEN,instance:s.instance,handlers:DIST});assert.equal((await answer(s2)).t,"welcome");
 assert.equal((await b2.post({action:"add",label:"Une autre"})).json.env.POLITIGO_ADMIN_URL,"<IP de cette machine>:8091");
 s2.destroy();
});

test("F7: a party cannot pass for another game: its name cleaned and given its id when taken, versions shown as 1.7.3; the page reads no party",async()=>{
 const b=await owner(),r=await b.post({action:"add",label:"Imposteur"});assert.equal(r.status,200);const id=r.json.party.id;
 let slow=false;
 const h={...DIST,stats:()=>slow?undefined:{ok:true,name:"Principale‮",version:"v1.7.3",players:-4,online:1}};
 const s=await party(P.link,{token:r.json.env.POLITIGO_ADMIN_TOKEN,name:"principale",version:"v1.7.3",handlers:h});assert.equal((await answer(s)).t,"welcome");
 const list=(await b.req("/api/servers")).json.servers,me=list.find(x=>x.id===id),main=list.find(x=>x.id==="jeu");
 assert.deepEqual({name:me.name,version:me.version,release:me.release,players:me.players},{name:`Principale (${id})`,version:"1.7.3",release:"1.7.3",players:null});
 assert.deepEqual({name:main.name,release:main.release,version:main.version},{name:"Principale",release:"1.7.3",version:"1.7.3"},"release for the local game too");
 const v=(await b.parties()).json.parties.find(x=>x.id===id);assert.equal(v.announced,`principale (${id})`);assert.equal(v.version,"1.7.3");
 // GET /api/parties from memory: a party that does not answer costs nothing, and gets no call.
 slow=true;const n=s.reqs.length,t0=Date.now(),g=await b.parties();
 assert.equal(g.status,200);assert.ok(Date.now()-t0<1500,`${Date.now()-t0} ms`);assert.equal(s.reqs.length,n,"no request to the party");
 assert.equal(g.json.parties.find(x=>x.id===id).state,"online");
 assert.equal((await b.post({action:"remove",id})).status,200);await s.done;
});

test("F9c: /api/servers never waits for a mute party: its line comes from memory, refreshed in the background",async()=>{
 const b=await owner(),mute={...DIST,stats:()=>undefined,"chat-reports":()=>undefined,"schedule-list":()=>undefined,"invite-get":()=>undefined},ids=[],socks=[];
 try{
  for(const n of ["Muette 1","Muette 2","Muette 3"]){
   const r=await b.post({action:"add",label:n});assert.equal(r.status,200);ids.push(r.json.party.id);
   const s=await party(P.link,{token:r.json.env.POLITIGO_ADMIN_TOKEN,name:n,handlers:mute});assert.equal((await answer(s)).t,"welcome");socks.push(s);
  }
  for(const full of [false,true,false,true]){
   const t0=Date.now(),r=await b.req("/api/servers",{full});const ms=Date.now()-t0;
   assert.equal(r.status,200);assert.ok(ms<1500,`/api/servers full=${full} with 3 mute parties: ${ms} ms`);
   for(const id of ids)assert.ok(r.json.servers.some(s=>s.id===id),"each mute party listed");
   assert.equal(r.json.servers.find(s=>s.id==="jeu").up,true,"the local game answers");
  }
 }finally{for(const id of ids)await b.post({action:"remove",id});for(const s of socks)s.destroy();}
});

test("what a party answers is typed: chatRooms {global, camp} or null, the invite code a short string or null; a change asks again",async()=>{
 const b=await owner(),odd=await b.post({action:"add",label:"Bizarre"}),oid=odd.json.party.id;let shape="bad";
 const h={...DIST,stats:()=>({ok:true,name:"Bizarre",version:"1.7.3",players:2,chatRooms:shape==="bad"?"<script>":{global:true,camp:"oui",x:"y".repeat(9000)}}),
  "invite-get":()=>({ok:true,open:true,invite:shape==="bad"?{a:1}:"politigo-abcdefghijklmnop"}),"invite-regenerate":()=>({ok:true,invite:"politigo-abcdefghijklmnop"}),
  "chat-reports":()=>({ok:true,items:"xxxx"}),"schedule-list":()=>({ok:true,schedules:"x"})};
 const so=await party(P.link,{token:odd.json.env.POLITIGO_ADMIN_TOKEN,name:"Bizarre",handlers:h});assert.equal((await answer(so)).t,"welcome");
 try{
  const o=(await b.req("/api/servers",{full:true})).json.servers.find(s=>s.id===oid);
  assert.deepEqual({rooms:o.chatRooms,invite:o.invite,reports:o.chatReports,next:o.nextAnnounce,up:o.up},{rooms:null,invite:{code:null,open:false},reports:0,next:null,up:true});
  shape="good";assert.equal((await b.call(oid,"invite-regenerate")).status,200,"a change: the next list asks again");
  const g=(await b.req("/api/servers",{full:true})).json.servers.find(s=>s.id===oid);
  assert.deepEqual({rooms:g.chatRooms,invite:g.invite},{rooms:{global:true,camp:false},invite:{code:"politigo-abcdefghijklmnop",open:true}});
  assert.equal("invite" in (await b.req("/api/servers")).json.servers.find(s=>s.id===oid),false,"the full fields only when asked");
 }finally{await b.post({action:"remove",id:oid});so.destroy();}
});

test("console: the listener asked for but not open: listen.up false with its error, and Ajouter refused (409)",async()=>{
 const hog=net.createServer(()=>{});await new Promise(r=>hog.listen(P.taken,"127.0.0.1",r));
 const d=tmp("pgl-t-"),p=await startAdmin(P.closed,{ADMIN_DATA:d,POLITIGO_ADMIN_LINK:"on",ADMIN_LINK_LISTEN:String(P.taken)});
 try{
  const b=await owner(P.closed),j=(await b.parties()).json;
  assert.equal(j.listen.on,true);assert.equal(j.listen.up,false);assert.match(j.listen.error,/3886.*EADDRINUSE/);
  const r=await b.post({action:"add",label:"Impossible"});assert.equal(r.status,409);assert.match(r.json.error,/^L'écoute des parties ne fonctionne pas : /);
  assert.equal(fs.existsSync(join(d,"parties.json")),false);
 }finally{await stop(p);hog.close();}
});

test("console: parties.json unreadable: broken on the page, a Liaison alert on the main game, changes refused (409)",async()=>{
 const d=tmp("pgl-b2-");fs.writeFileSync(join(d,"parties.json"),"pas du json");
 const p=await startAdmin(P.closed,{ADMIN_DATA:d,POLITIGO_ADMIN_LINK:"on",ADMIN_LINK_LISTEN:String(P.closed+1)});
 try{
  const b=await owner(P.closed),j=(await b.parties()).json;
  assert.match(j.broken,/^Liste des parties illisible : \/data-admin\/parties\.json\.corrupt-/);
  const r=await b.post({action:"add",label:"Bloquée"});assert.equal(r.status,409);assert.match(r.json.error,/^Liste des parties illisible/);
  const a=(await b.call("jeu","alerts")).json.items.find(x=>x.key.startsWith("link-file:"));assert.ok(a);assert.equal(a.kind,"link");assert.equal(a.noAck,true);
  for(const n of fs.readdirSync(d))if(n.startsWith("parties.json.corrupt-"))fs.rmSync(join(d,n));
  assert.equal((await b.parties()).json.broken,false);assert.equal((await b.post({action:"add",label:"Débloquée"})).status,200);
 }finally{await stop(p);}
});

test("console: the listener closed, no party can be added (409) and nothing listens",async()=>{
 const d=tmp("pgl-c2-"),p=await startAdmin(P.closed,{ADMIN_DATA:d,ADMIN_LINK_LISTEN:String(P.closed+1)});
 try{
  const b=await owner(P.closed),j=(await b.parties()).json;
  assert.equal(j.listen.on,false);assert.equal(j.listen.fingerprint,null);
  const r=await b.post({action:"add",label:"Refusée"});assert.equal(r.status,409);assert.match(r.json.error,/POLITIGO_ADMIN_LINK=on/);
  await assert.rejects(party(P.closed+1,{raw:true}));
  assert.equal(fs.existsSync(join(d,"link","key.pem")),false,"no certificate made for nothing");
 }finally{await stop(p);}
});
