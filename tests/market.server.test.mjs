// La Brocante, server side: the same-network fingerprint (one HMAC of the last address, never the address itself),
// then the market over HTTP: listings, trades (atomic, one winner in a race), offers, gates, hooks, pushes, the feed.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,writeFileSync,statSync} from "node:fs";
import {createConnection} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,PW,INVITE,player,sleep,until,keys,FCM} from "./server-helpers.mjs";
import {ITEMS} from "../web/wardrobe.mjs";

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
  assert.equal(db2.prepare("SELECT count(*) n FROM settings WHERE key='netkey'").get().n,0,"never in the database");
  db2.close();
  // the key: a file next to the database, 64 hex, readable by its owner alone, the same across the restart
  const key=readFileSync(join(dir,"netkey.txt"),"utf8").trim();assert.match(key,/^[0-9a-f]{64}$/);
  assert.equal(statSync(join(dir,"netkey.txt")).mode&0o777,0o600);
  // IPv6: one /64 is one network; an IPv4-mapped address is its IPv4
  for(const [n,ip] of [["Six Un","2001:db8:7:8::1"],["Six Deux","2001:db8:7:8:ffff::2"],["Six Trois","2001:db8:7:9::1"],["Mappe Bro","::ffff:10.9.0.2"]])await signup(port,n,ip);
  const db3=new DatabaseSync(join(dir,"t.db"));
  const fp3=n=>db3.prepare("SELECT net_fp FROM players WHERE name=?").get(n).net_fp;
  assert.equal(fp3("Six Un"),fp3("Six Deux"));assert.notEqual(fp3("Six Un"),fp3("Six Trois"));assert.match(fp3("Six Un"),/^[0-9a-f]{64}$/);
  assert.equal(fp3("Mappe Bro"),fc,"::ffff:10.9.0.2 is 10.9.0.2");
  db3.close();
 }finally{await stop(srv);}
});

it("net fingerprint: a legacy NULL row loads as empty and is filled at the next login; a legacy netkey row is deleted",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"market-")),port=18932;
 let srv=await boot(port,dir);
 try{
  await signup(port,"Old Timer","10.9.1.1");await stop(srv);
  const db=new DatabaseSync(join(dir,"t.db"));db.prepare("UPDATE players SET net_fp=NULL WHERE name=?").run("Old Timer");
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('netkey',?)").run("ab".repeat(32));db.close();   // where the key used to be
  const key=readFileSync(join(dir,"netkey.txt"),"utf8");
  srv=await boot(port,dir);
  const l=from(port,"10.9.1.1");assert.equal((await l.call("POST","/api/login",{name:"Old Timer",password:PW})).status,200);
  const db2=new DatabaseSync(join(dir,"t.db"));
  assert.match(db2.prepare("SELECT net_fp FROM players WHERE name=?").get("Old Timer").net_fp,/^[0-9a-f]{64}$/);
  assert.equal(db2.prepare("SELECT count(*) n FROM settings WHERE key='netkey'").get().n,0,"the legacy row is gone");
  assert.equal(readFileSync(join(dir,"netkey.txt"),"utf8"),key,"the key is not remade");
  db2.close();
 }finally{await stop(srv);}
});

// ===================================================================== LA BROCANTE OVER HTTP
// One shared server for most scenarios (fresh players each time: 10 market requests a minute and 3 trades a day per
// player); the ones that need another setting or a restart boot their own. Items are given through the admin socket.
const MP=18933,NAME=Object.fromEntries(Object.entries(ITEMS).map(([id,it])=>[id,it.name]));
let mdir,SOCK,msrv;
const menv=(dir,extra={})=>({POLITIGO_MARKET_MIN_AGE_H:"0",POLITIGO_ADMIN_SOCKET:join(dir,"admin.sock"),NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:join(dir,"fetch.log"),...extra});
function admAt(sock,obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(sock);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const adm=obj=>admAt(SOCK,obj);
async function stock(sock,name,items=[],bulletins=0,wear=[]){
 for(const item of items){const r=await admAt(sock,{cmd:"give",name,item,...(wear.includes(item)?{wear:true}:{})});assert.equal(r.ok,true,JSON.stringify(r));}
 if(bulletins){const r=await admAt(sock,{cmd:"give",name,bulletins});assert.equal(r.ok,true,JSON.stringify(r));}
}
// A player on the shared server with these items and bulletins.
async function mp(name,camp="left",items=[],bulletins=0,wear=[]){const c=await player(MP,name,camp);await stock(SOCK,name,items,bulletins,wear);return c;}
const mk=(c,op,b={})=>c.call("POST","/api/market",{op,...b});
const view=async c=>{const r=await c.call("GET","/api/market");assert.equal(r.status,200,JSON.stringify(r.json));return r.json;};
const meOf=async c=>(await c.call("GET","/api/me")).json;
const wr=async c=>(await meOf(c)).state.wardrobe;
const listOk=async(c,give,want)=>{const r=await mk(c,"list",{give,want});assert.equal(r.status,200,JSON.stringify(r.json));assert.ok(Number.isSafeInteger(r.json.id));return r.json.id;};
const refused=(r,status,msg)=>{
 assert.equal(r.status,status,JSON.stringify(r.json));if(msg!==undefined)assert.equal(r.json.error,msg);
 assert.ok(!/ultra|mythique|bâton/i.test(r.json.error),"no spoiler");
};
const GONE_L="Cette annonce n'est plus disponible.",GONE_O="Cette offre n'est plus disponible.";
const feedOf=async c=>(await c.call("GET","/api/board")).json.feed;
const pushLog=dir=>{try{return readFileSync(join(dir,"fetch.log"),"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l).url);}catch{return [];}};
const epOf=c=>`m-${c.name.replace(/\W/g,"")}`;
const subscribe=async c=>assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+epOf(c),keys:keys()})).status,200);
function stream(port,c){
 const ac=new AbortController(),events=[];
 fetch(`http://127.0.0.1:${port}/events`,{headers:{Cookie:c.cookie},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
 }).catch(()=>{});
 return {events,close:()=>ac.abort()};
}
// Rewrites the stored rows while that server is down.
function editDb(dir,fn){const db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});try{fn(db);}finally{db.close();}}
const editState=(db,name,fn)=>{const S=JSON.parse(db.prepare("SELECT state FROM players WHERE name=?").get(name).state);fn(S);db.prepare("UPDATE players SET state=? WHERE name=?").run(JSON.stringify(S),name);};

before(async()=>{mdir=mkdtempSync(join(tmpdir(),"market-"));SOCK=join(mdir,"admin.sock");writeFileSync(join(mdir,"fetch.log"),"");msrv=await boot(MP,mdir,menv(mdir));});
after(async()=>{await stop(msrv);});

it("list, take: the trade moves items and bulletins, both journals, cross-camp feed line",async()=>{
 const a=await mp("Camille Bro","left",["chasuble"],0,["chasuble"]),b=await mp("Hugo Bro","right",["pantalonrouge"],10);
 const a0=await wr(a),b0=await wr(b);assert.equal(a0.worn.outfit,"chasuble");
 const id=await listOk(a,{items:["chasuble"],bulletins:0},{kind:"items",items:["pantalonrouge"],bulletins:4});
 const vb=await view(b),seen=vb.board.find(l=>l.id===id);
 assert.deepEqual(seen.author,{name:"Camille Bro",camp:"left"});assert.equal(seen.mine,false);
 assert.deepEqual(seen.give,{items:["chasuble"],bulletins:0});assert.equal(seen.want.kind,"items");
 assert.equal(vb.block,"");assert.equal(vb.today,0);
 const va=await view(a);assert.ok(!va.board.some(l=>l.id===id),"not on my own board");assert.equal(va.mine.find(l=>l.id===id).mine,true);
 const r=await mk(b,"take",{id,give:{items:["pantalonrouge"],bulletins:4}});
 assert.equal(r.status,200,JSON.stringify(r.json));
 const a1=await wr(a),b1=await wr(b);
 assert.ok(a1.own.includes("pantalonrouge")&&!a1.own.includes("chasuble"));assert.equal(a1.worn.outfit,null,"it leaves the giver's character");
 assert.equal(a1.bulletins,a0.bulletins+4);
 assert.ok(b1.own.includes("chasuble")&&!b1.own.includes("pantalonrouge"));assert.equal(b1.bulletins,b0.bulletins-4);assert.notEqual(b1.worn.outfit,"chasuble");
 const ja=(await meOf(a)).state.journal[0],jb=(await meOf(b)).state.journal[0];
 assert.equal(ja.k,"market");assert.ok(ja.text.includes(NAME.chasuble)&&ja.text.includes(NAME.pantalonrouge)&&ja.text.includes("Hugo Bro"),ja.text);
 assert.equal(jb.k,"market");assert.ok(jb.text.includes(NAME.chasuble)&&jb.text.includes("Camille Bro"),jb.text);
 const line=(await feedOf(b)).find(e=>e.kind==="market"&&e.player==="Camille Bro");
 assert.ok(line&&line.text.startsWith("🔄")&&line.text.includes("Hugo Bro")&&line.text.includes(NAME.chasuble),JSON.stringify(line));
 assert.ok(!(await view(b)).board.some(l=>l.id===id),"traded: off the board");
 assert.equal((await view(a)).today,1);assert.equal((await view(b)).today,1);
 refused(await mk(b,"take",{id,give:{items:[],bulletins:4}}),409,GONE_L);
});

it("same camp: no feed line",async()=>{
 const a=await mp("Gauche Un","left",["cheminot","bleutravail"]),b=await mp("Gauche Deux","left",["kway","bleutravail"]);
 const id=await listOk(a,{items:["cheminot"]},{kind:"rarity",rarity:"commun",slot:"outfit",bulletins:0});
 refused(await mk(b,"take",{id,give:{items:["megaphone"]}}),422);   // not what it asks for
 refused(await mk(b,"take",{id,give:{items:["bleutravail"]}}),422,"Échange impossible : objet déjà possédé.");   // the author has it: not said which
 const r=await mk(b,"take",{id,give:{items:["kway"],bulletins:0}});assert.equal(r.status,200,JSON.stringify(r.json));
 assert.ok((await wr(b)).own.includes("cheminot"));
 assert.ok(!(await feedOf(a)).some(e=>e.kind==="market"&&(e.player==="Gauche Un"||e.text.includes("Gauche Deux"))));
});

it("refused gives",async()=>{
 const c=await mp("Vitrine Pleine","left",["camarade","megaphone","cocarde","baguette","parapluie"],30);
 refused(await mk(c,"list",{give:{items:["camarade"]},want:{kind:"offer"}}),422,"Certains objets très rares ne s'échangent pas.");
 refused(await mk(c,"list",{give:{items:["megaphone","cocarde","baguette","parapluie"]},want:{kind:"offer"}}),422,"Choisis de 1 à 3 objets.");
 refused(await mk(c,"list",{give:{items:["megaphone"],bulletins:21},want:{kind:"offer"}}),422,"Bulletins : de 0 à 20 par côté.");
 refused(await mk(c,"list",{give:{items:[],bulletins:5},want:{kind:"offer"}}),422,"Choisis de 1 à 3 objets.");
 await listOk(c,{items:["megaphone"]},{kind:"offer"});
 refused(await mk(c,"list",{give:{items:["megaphone","cocarde"]},want:{kind:"offer"}}),422,`Déjà en vitrine dans une autre annonce : ${NAME.megaphone}.`);
 await listOk(c,{items:["cocarde"]},{kind:"bulletins",bulletins:3});
 await listOk(c,{items:["baguette"],bulletins:2},{kind:"rarity",rarity:"rare",slot:"any",bulletins:0});
 refused(await mk(c,"list",{give:{items:["parapluie"]},want:{kind:"offer"}}),422,"3 annonces ouvertes au plus : retires-en une d'abord.");
 assert.equal((await view(c)).mine.length,3);
});

it("gates: level, account age, 3 trades a day, suspended",async()=>{
 // A server at the real rules: level 5, accounts 3 days old.
 const dir=mkdtempSync(join(tmpdir(),"market-")),port=18934,sock=join(dir,"admin.sock");
 const srv=await boot(port,dir,{...menv(dir),POLITIGO_DUEL_MIN_LEVEL:"5",POLITIGO_MARKET_MIN_AGE_H:undefined});
 try{
  assert.doesNotMatch(srv.err+srv.out,/Brocante test setting/);
  const n=await player(port,"Novice Bro");await stock(sock,"Novice Bro",["megaphone"]);
  refused(await mk(n,"list",{give:{items:["megaphone"]},want:{kind:"offer"}}),403,"Échanges à partir du niveau 5.");
  assert.equal((await admAt(sock,{cmd:"give",name:"Novice Bro",lvl:5})).ok,true);
  refused(await mk(n,"list",{give:{items:["megaphone"]},want:{kind:"offer"}}),403,"Ton compte est trop récent pour la Brocante.");
  assert.equal((await view(n)).block,"Ton compte est trop récent pour la Brocante.");   // anyone may look
 }finally{await stop(srv);}
 assert.match(msrv.err+msrv.out,/Brocante test setting active/);
 // 3 trades a day: x lists three, two are taken, x takes one elsewhere; x's third listing is hidden, x is stopped.
 const x=await mp("Trois Fois","left",["megaphone","cocarde","baguette"],5),t1=await mp("Preneur Un","right",[],5),t2=await mp("Preneur Deux","right",[],5),t3=await mp("Preneur Trois","right",[],5);
 const o=await mp("Autre Vitrine","right",["croissant"]);
 const l1=await listOk(x,{items:["megaphone"]},{kind:"bulletins",bulletins:1}),l2=await listOk(x,{items:["cocarde"]},{kind:"bulletins",bulletins:1}),l3=await listOk(x,{items:["baguette"]},{kind:"bulletins",bulletins:1});
 const lo=await listOk(o,{items:["croissant"]},{kind:"bulletins",bulletins:1});
 assert.equal((await mk(t1,"take",{id:l1,give:{items:[],bulletins:1}})).status,200);
 assert.equal((await mk(t2,"take",{id:l2,give:{items:[],bulletins:1}})).status,200);
 assert.equal((await mk(x,"take",{id:lo,give:{items:[],bulletins:1}})).status,200);
 const vx=await view(x);assert.equal(vx.today,3);assert.equal(vx.block,"3 échanges aujourd'hui : reviens demain.");
 assert.ok(!(await view(t3)).board.some(l=>l.id===l3),"hidden while its author is at the day's limit");
 refused(await mk(t3,"take",{id:l3,give:{items:[],bulletins:1}}),409,GONE_L);   // hidden: the same answer as a gone one
 refused(await mk(x,"list",{give:{items:["croissant"]},want:{kind:"offer"}}),403,"3 échanges aujourd'hui : reviens demain.");
 // a suspended player may not even look
 const s=await mp("Suspendu Bro");assert.equal((await adm({cmd:"suspend",name:"Suspendu Bro",on:true})).ok,true);
 const g=await s.call("GET","/api/market");assert.ok([401,403].includes(g.status),String(g.status));
});

it("two takers, one trade",async()=>{
 const a=await mp("Vendeur Seul","left",["chasuble"]),b=await mp("Rapide Un","right",[],3),c=await mp("Rapide Deux","right",[],3);
 const id=await listOk(a,{items:["chasuble"]},{kind:"bulletins",bulletins:3});
 const rs=await Promise.all([b,c].map(p=>mk(p,"take",{id,give:{items:[],bulletins:3}})));
 assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);refused(rs.find(r=>r.status===409),409,GONE_L);
 const wb=await wr(b),wc=await wr(c),wa=await wr(a);
 assert.equal([wb,wc].filter(w=>w.own.includes("chasuble")).length,1,"exactly one copy moved");
 assert.ok(!wa.own.includes("chasuble"));assert.equal(wa.bulletins,3,"paid once");assert.equal(wb.bulletins+wc.bulletins,3);
 // the author accepts an offer while someone takes the listing: one wins, the other gets the clean 409
 const d=await mp("Vendeur Double","left",["cheminot"]),e=await mp("Offrant Course","right",["loden"]),f=await mp("Preneur Course","right",[],2);
 const id2=await listOk(d,{items:["cheminot"]},{kind:"bulletins",bulletins:2});
 const off=await mk(e,"offer",{id:id2,give:{items:["loden"]}});assert.equal(off.status,200,JSON.stringify(off.json));
 const rs2=await Promise.all([mk(d,"accept",{id:off.json.id}),mk(f,"take",{id:id2,give:{items:[],bulletins:2}})]);
 assert.deepEqual(rs2.map(r=>r.status).sort(),[200,409]);refused(rs2.find(r=>r.status===409),409,GONE_L);
 const we=await wr(e),wf=await wr(f),wd=await wr(d);
 assert.equal([we,wf].filter(w=>w.own.includes("cheminot")).length,1);assert.ok(!wd.own.includes("cheminot"));
 assert.equal((await view(d)).today,1,"one trade counted");
});

it("author below the level: listing hidden, take refused",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"market-")),port=18935,sock=join(dir,"admin.sock"),env=menv(dir,{POLITIGO_DUEL_MIN_LEVEL:"5"});
 let srv=await boot(port,dir,env);
 try{
  const a=await player(port,"Auteur Mort"),b=await player(port,"Preneur Vif","right");
  await stock(sock,"Auteur Mort",["chasuble"]);await stock(sock,"Preneur Vif",[],5);
  for(const n of ["Auteur Mort","Preneur Vif"])assert.equal((await admAt(sock,{cmd:"give",name:n,lvl:5})).ok,true);
  const id=await listOk(a,{items:["chasuble"]},{kind:"bulletins",bulletins:2});
  assert.ok((await view(b)).board.some(l=>l.id===id));
  await stop(srv);
  editDb(dir,db=>editState(db,"Auteur Mort",S=>{S.lvl=1;S.best=1;S.xp=0;}));   // a political death: back to level 1
  srv=await boot(port,dir,env);
  assert.ok(!(await view(b)).board.some(l=>l.id===id),"hidden");
  assert.ok((await view(a)).mine.some(l=>l.id===id),"not closed: still the author's");
  refused(await mk(b,"take",{id,give:{items:[],bulletins:2}}),409,GONE_L);   // hidden: never says why (no state oracle)
  assert.ok(!(await wr(b)).own.includes("chasuble"));
  assert.equal((await admAt(sock,{cmd:"give",name:"Auteur Mort",lvl:5})).ok,true);
  assert.ok((await view(b)).board.some(l=>l.id===id),"back at level 5");
  assert.equal((await mk(b,"take",{id,give:{items:[],bulletins:2}})).status,200);
 }finally{await stop(srv);}
});

it("offer, accept / refuse, push sent",async()=>{
 const a=await mp("Vitrine Offre","left",["chasuble"]),b=await mp("Offrant Bon","right",["loden"]),c=await mp("Offrant Refus","right",["doudoune"],2);
 for(const p of [a,b,c])await subscribe(p);
 const pushes=p=>pushLog(mdir).filter(u=>u===FCM+epOf(p)).length;
 const sa=stream(MP,a);await sleep(300);
 try{
  const id=await listOk(a,{items:["chasuble"]},{kind:"offer"});
  refused(await mk(a,"offer",{id,give:{items:["chasuble"]}}),422,"C'est ta propre annonce.");
  refused(await mk(b,"take",{id,give:{items:["loden"]}}),422,"Cette annonce attend des offres : fais une offre.");
  const pa=pushes(a),ob=await mk(b,"offer",{id,give:{items:["loden"],bulletins:0}});assert.equal(ob.status,200,JSON.stringify(ob.json));
  assert.ok(await until(()=>pushes(a)>pa),"the author is pushed");
  assert.ok(await until(()=>sa.events.some(e=>e.ev==="market")),"and told live");
  refused(await mk(b,"offer",{id,give:{items:["loden"]}}),409,"Tu as déjà une offre en attente sur cette annonce.");
  const oc=await mk(c,"offer",{id,give:{items:["doudoune"],bulletins:2}});assert.equal(oc.status,200);
  const mine=(await view(a)).mine.find(l=>l.id===id);
  assert.deepEqual(mine.offers.map(o=>o.from),[{name:"Offrant Bon",camp:"right"},{name:"Offrant Refus",camp:"right"}]);
  assert.deepEqual(mine.offers[1].give,{items:["doudoune"],bulletins:2});
  refused(await mk(b,"refuse",{id:oc.json.id}),409,GONE_O);   // only the author decides; same answer as a missing one
  refused(await mk(b,"accept",{id:oc.json.id}),409,GONE_O);
  refused(await mk(b,"accept",{id:99999999}),409,GONE_O);
  const pc=pushes(c);assert.equal((await mk(a,"refuse",{id:oc.json.id})).status,200);
  assert.ok(await until(()=>pushes(c)>pc),"the offerer is pushed on a refusal");
  assert.equal((await view(c)).offers.find(o=>o.id===oc.json.id).status,"refused");
  refused(await mk(c,"offer",{id,give:{items:["doudoune"]}}),422,"Ton offre sur cette annonce a déjà été refusée.");
  refused(await mk(c,"unoffer",{id:ob.json.id}),409,GONE_O);   // someone else's offer
  const pb=pushes(b),acc=await mk(a,"accept",{id:ob.json.id});assert.equal(acc.status,200,JSON.stringify(acc.json));
  assert.ok(await until(()=>pushes(b)>pb),"the offerer is pushed on an acceptance");
  assert.ok((await wr(a)).own.includes("loden"));assert.ok((await wr(b)).own.includes("chasuble"));
  const vb=await view(b),mo=vb.offers.find(o=>o.id===ob.json.id);
  assert.equal(mo.status,"accepted");assert.equal(mo.listingId,id);assert.deepEqual(mo.listing.author,{name:"Vitrine Offre",camp:"left"});
 }finally{sa.close();}
});

it("accept fails cleanly when the offer no longer holds",async()=>{
 const a=await mp("Vitrine Stable","left",["chasuble"]),b=await mp("Offrant Chanceux","right",["loden"]);
 const c=await mp("Offrant Fauche","right",["doudoune"],5),d=await mp("Offrant Final","right",["blazer"]),s=await mp("Vendeur Annexe","left",["tract"]);
 const id=await listOk(a,{items:["chasuble"]},{kind:"offer"});
 const ob=await mk(b,"offer",{id,give:{items:["loden"]}});assert.equal(ob.status,200);
 const oc=await mk(c,"offer",{id,give:{items:["doudoune"],bulletins:5}});assert.equal(oc.status,200);
 // b now owns the listed item (a draw, a gift): accepting is refused, the offer closes, the listing stays open
 await stock(SOCK,"Offrant Chanceux",["chasuble"]);
 refused(await mk(a,"accept",{id:ob.json.id}),409,`L'offre ne tient plus : Offrant Chanceux a déjà ${NAME.chasuble}.`);
 assert.equal((await view(b)).offers.find(o=>o.id===ob.json.id).status,"closed");
 // c spent the offered bulletins elsewhere: refused too
 const ls=await listOk(s,{items:["tract"]},{kind:"bulletins",bulletins:5});
 assert.equal((await mk(c,"take",{id:ls,give:{items:[],bulletins:5}})).status,200);
 refused(await mk(a,"accept",{id:oc.json.id}),409,"L'offre ne tient plus : Offrant Fauche n'a plus ce qu'il proposait.");
 assert.equal((await view(c)).offers.find(o=>o.id===oc.json.id).status,"closed");
 const wa=await wr(a);assert.ok(wa.own.includes("chasuble")&&!wa.own.includes("loden")&&!wa.own.includes("doudoune"),"nothing moved");
 assert.ok((await view(a)).mine.some(l=>l.id===id),"the listing stays open");
 assert.equal((await view(a)).today,0,"no trade counted");
 const od=await mk(d,"offer",{id,give:{items:["blazer"]}});assert.equal(od.status,200);
 assert.equal((await mk(a,"accept",{id:od.json.id})).status,200,"a good offer still goes through");
});

it("a listing its author can no longer honour is hidden and refused",async()=>{
 const a=await mp("Vitrine Vide","left",["megaphone"],2),b=await mp("Preneur Decu","right",["loden"]);
 const id=await listOk(a,{items:["megaphone"],bulletins:2},{kind:"items",items:["loden"],bulletins:0});
 assert.ok((await view(b)).board.some(l=>l.id===id));
 const dr=await a.call("POST","/api/action",{type:"draw",pay:"bulletin"});assert.equal(dr.status,200,JSON.stringify(dr.json));   // one bulletin spent
 assert.ok(!(await view(b)).board.some(l=>l.id===id),"hidden");
 refused(await mk(b,"take",{id,give:{items:["loden"]}}),409,GONE_L);
 refused(await mk(b,"offer",{id,give:{items:["loden"]}}),409,GONE_L);
 assert.ok((await wr(b)).own.includes("loden"),"nothing moved");
});

it("offer limits: one push a day per listing, 5 pending, 10 a day; someone else's listing",async()=>{
 const a1=await mp("Lot Un","left",["megaphone","cocarde","baguette"]),a2=await mp("Lot Deux","left",["parapluie","tract","sifflet"]),o=await mp("Offrant Zele","right",["loden"]);
 await subscribe(a1);const pushes=()=>pushLog(mdir).filter(u=>u===FCM+epOf(a1)).length;
 const ls=[];for(const [c,it] of [[a1,"megaphone"],[a1,"cocarde"],[a1,"baguette"],[a2,"parapluie"],[a2,"tract"],[a2,"sifflet"]])ls.push(await listOk(c,{items:[it]},{kind:"offer"}));
 const p0=pushes(),o1=await mk(o,"offer",{id:ls[0],give:{items:["loden"]}});assert.equal(o1.status,200);
 assert.ok(await until(()=>pushes()>p0),"the first offer is pushed");
 assert.equal((await mk(o,"unoffer",{id:o1.json.id})).status,200);
 assert.equal((await mk(o,"offer",{id:ls[0],give:{items:["loden"]}})).status,200);
 await sleep(500);assert.equal(pushes(),p0+1,"offer, withdraw, offer again: pushed once");
 for(let i=1;i<5;i++)assert.equal((await mk(o,"offer",{id:ls[i],give:{items:["loden"]}})).status,200);
 refused(await mk(o,"offer",{id:ls[5],give:{items:["loden"]}}),422,"5 offres en attente au plus.");
 refused(await mk(o,"withdraw",{id:ls[5]}),409,GONE_L);   // someone else's listing: the same answer as a missing one
 // 6 offers made today; 4 more (withdrawn) and the next one is refused, whatever the pending count
 editDb(mdir,db=>{const id=db.prepare("SELECT id FROM players WHERE name=?").get("Offrant Zele").id;
  for(let i=0;i<4;i++)db.prepare("INSERT INTO market_offers(listing_id,player_id,give,created,status) VALUES(999999,?,?,?,'withdrawn')").run(id,JSON.stringify({items:["loden"],bulletins:0}),Date.now());});
 refused(await mk(o,"offer",{id:ls[5],give:{items:["loden"]}}),422,"10 offres par jour au plus : reviens demain.");
});

it("board refresh: one trailing live event for a burst of changes",async()=>{
 const w=await mp("Guetteur Bro"),x=await mp("Rafale Bro","left",["megaphone","cocarde"]);
 await sleep(3300);   // what earlier scenarios changed has been told
 const s=stream(MP,w),boards=()=>s.events.filter(e=>e.ev==="market"&&e.data?.kind==="board").length;await sleep(300);
 try{
  await listOk(x,{items:["megaphone"]},{kind:"offer"});await listOk(x,{items:["cocarde"]},{kind:"offer"});
  await sleep(300);assert.equal(boards(),0,"not at once");
  assert.ok(await until(()=>boards()>=1,4000));await sleep(500);assert.equal(boards(),1,"two listings, one event");
 }finally{s.close();}
});

it("deleted author and offerer",async()=>{
 const a=await mp("Partant Bro","left",["chasuble","megaphone"]),b=await mp("Restant Bro","right",["loden","croissant"]),c=await mp("Temoin Bro","right",["doudoune"]),d=await mp("Fuyard Bro","right",["blazer"]);
 const la=await listOk(a,{items:["chasuble"]},{kind:"offer"}),lb=await listOk(b,{items:["loden"]},{kind:"offer"});
 const ob=await mk(b,"offer",{id:la,give:{items:["croissant"]}}),oc=await mk(c,"offer",{id:la,give:{items:["doudoune"]}});
 const oa=await mk(a,"offer",{id:lb,give:{items:["megaphone"]}}),od=await mk(d,"offer",{id:lb,give:{items:["blazer"]}});
 for(const r of [ob,oc,oa,od])assert.equal(r.status,200,JSON.stringify(r.json));
 assert.equal((await a.call("DELETE","/api/account",{password:PW})).status,200);
 assert.ok(!(await view(c)).board.some(l=>l.id===la),"its listings disappear");
 assert.equal((await view(c)).offers.find(o=>o.id===oc.json.id).status,"closed");
 assert.equal((await view(b)).offers.find(o=>o.id===ob.json.id).status,"closed");
 assert.ok(!(await view(b)).mine.find(l=>l.id===lb).offers.some(o=>o.id===oa.json.id),"its offers close");
 refused(await mk(b,"accept",{id:oa.json.id}),409,GONE_O);
 assert.equal((await d.call("DELETE","/api/account",{password:PW})).status,200);
 refused(await mk(b,"accept",{id:od.json.id}),409,GONE_O);
 assert.equal((await b.call("GET","/api/health")).status,200,"no crash");
 assert.ok((await view(b)).mine.some(l=>l.id===lb),"the other side's listing stays open");
 assert.ok((await wr(b)).own.includes("loden"));
});

it("away 14 days: hidden, back when seen",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"market-")),port=18936,sock=join(dir,"admin.sock");
 let srv=await boot(port,dir,menv(dir));
 try{
  const a=await player(port,"Absent Bro"),b=await player(port,"Present Bro","right");
  await stock(sock,"Absent Bro",["chasuble"]);await stock(sock,"Present Bro",[],2);
  const id=await listOk(a,{items:["chasuble"]},{kind:"bulletins",bulletins:2});
  await stop(srv);
  editDb(dir,db=>db.prepare("UPDATE players SET last_seen=? WHERE name=?").run(Date.now()-15*864e5,"Absent Bro"));
  srv=await boot(port,dir,menv(dir));
  assert.ok(!(await view(b)).board.some(l=>l.id===id),"hidden");
  refused(await mk(b,"take",{id,give:{items:[],bulletins:2}}),409,GONE_L);
  await meOf(a);   // back
  assert.ok((await view(b)).board.some(l=>l.id===id),"back when seen");
 }finally{await stop(srv);}
});

it("marketNew counts only others' visible listings since the last visit",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"market-")),port=18937,sock=join(dir,"admin.sock");
 let srv=await boot(port,dir,menv(dir));
 try{
  const a=await player(port,"Visiteur Bro"),b=await player(port,"Deposant Bro","right"),s=await player(port,"Cache Bro","right");
  await stock(sock,"Deposant Bro",["loden","doudoune"]);await stock(sock,"Visiteur Bro",["megaphone"]);await stock(sock,"Cache Bro",["blazer"]);
  await listOk(b,{items:["loden"]},{kind:"offer"});
  assert.equal((await meOf(a)).marketNew,1,"never visited: everything is new");
  assert.equal((await view(a)).newCount,1);
  const upd=()=>{let u;editDb(dir,db=>{u=db.prepare("SELECT updated FROM players WHERE name=?").get("Visiteur Bro").updated;});return u;};
  const u1=upd();await sleep(20);await view(a);assert.equal(upd(),u1,"a visit within 30 s is not written again");
  assert.equal((await meOf(a)).marketNew,0,"seen");
  await view(b);await sleep(5);
  await listOk(b,{items:["doudoune"]},{kind:"offer"});await listOk(a,{items:["megaphone"]},{kind:"offer"});await listOk(s,{items:["blazer"]},{kind:"offer"});
  assert.equal((await admAt(sock,{cmd:"suspend",name:"Cache Bro",on:true})).ok,true);   // hidden: not counted
  assert.equal((await meOf(a)).marketNew,1,"one new by another, visible");
  assert.equal((await meOf(b)).marketNew,1,"b sees a's, not its own");
  await view(a);await stop(srv);srv=await boot(port,dir,menv(dir));
  // the last visit (kept in memory, written by the clean stop's saveAll) survives the restart
  assert.equal((await meOf(a)).marketNew,0,"the last visit survives a restart");
 }finally{await stop(srv);}
});

it("marketListed: my items in my open listings, in /api/me; gone when withdrawn or traded",async()=>{
 const a=await mp("Vitrine Bro","left",["cocarde","tract","sifflet"]),b=await mp("Chineur Bro","right",["loden"]);
 assert.deepEqual((await meOf(a)).marketListed,[],"nothing listed yet");
 const l1=await listOk(a,{items:["cocarde","tract"]},{kind:"offer"}),l2=await listOk(a,{items:["sifflet"]},{kind:"items",items:["loden"],bulletins:0});
 assert.deepEqual([...(await meOf(a)).marketListed].sort(),["cocarde","sifflet","tract"]);
 assert.deepEqual((await meOf(b)).marketListed,[],"never someone else's");
 assert.equal((await mk(a,"withdraw",{id:l1})).status,200);
 assert.deepEqual((await meOf(a)).marketListed,["sifflet"]);
 assert.equal((await mk(b,"take",{id:l2,give:{items:["loden"],bulletins:0}})).status,200);
 assert.deepEqual((await meOf(a)).marketListed,[],"traded: out of the window");
});

it("same network flag stored on the trade",async()=>{
 const a=from(MP,"10.9.5.1"),b=from(MP,"10.9.5.1"),c=from(MP,"10.9.5.2");
 for(const [cl,n] of [[a,"Meme Box A"],[b,"Meme Box B"],[c,"Autre Box C"]]){const r=await cl.call("POST","/api/register",{name:n,password:PW,invite:INVITE,camp:"left"});assert.equal(r.status,201,r.text);}
 await stock(SOCK,"Meme Box A",["megaphone","cocarde"]);await stock(SOCK,"Meme Box B",[],2);await stock(SOCK,"Autre Box C",[],2);
 const l1=(await mk(a,"list",{give:{items:["megaphone"]},want:{kind:"bulletins",bulletins:1}})).json.id,l2=(await mk(a,"list",{give:{items:["cocarde"]},want:{kind:"bulletins",bulletins:1}})).json.id;
 assert.equal((await mk(b,"take",{id:l1,give:{items:[],bulletins:1}})).status,200);
 assert.equal((await mk(c,"take",{id:l2,give:{items:[],bulletins:1}})).status,200);
 const db=new DatabaseSync(join(mdir,"t.db"),{timeout:5000});
 try{
  const row=id=>db.prepare("SELECT same_net FROM market_trades WHERE listing_id=?").get(id).same_net;
  assert.equal(row(l1),1);assert.equal(row(l2),0);
 }finally{db.close();}
 const r=await b.call("GET","/api/market");assert.equal(r.status,200);assert.ok(!/same_?net|net_?fp|10\.9\.5/i.test(r.text),"never in an answer");
});

// ===================================================================== THE CONSOLE'S BROCANTE (market-list, market-withdraw)
it("market-list: trades, open listings with their offers, repeated pairs; never an address nor a fingerprint",async()=>{
 const a=from(MP,"10.9.6.1"),b=from(MP,"10.9.6.1"),c=from(MP,"10.9.6.2");
 for(const [cl,n,camp] of [[a,"Paire Alpha","left"],[b,"Paire Beta","right"],[c,"Paire Gamma","right"]]){const r=await cl.call("POST","/api/register",{name:n,password:PW,invite:INVITE,camp});assert.equal(r.status,201,r.text);}
 await stock(SOCK,"Paire Alpha",["megaphone","cocarde","baguette"]);await stock(SOCK,"Paire Beta",["loden"],3);await stock(SOCK,"Paire Gamma",["kway"],3);
 const L=async(it)=>(await mk(a,"list",{give:{items:[it]},want:{kind:"bulletins",bulletins:1}})).json.id;
 const l1=await L("megaphone"),l2=await L("cocarde"),l3=await L("baguette");
 assert.equal((await mk(b,"take",{id:l1,give:{items:[],bulletins:1}})).status,200);
 assert.equal((await mk(b,"take",{id:l2,give:{items:[],bulletins:1}})).status,200);
 assert.equal((await mk(c,"take",{id:l3,give:{items:[],bulletins:1}})).status,200);
 const open=await listOk(b,{items:["loden"]},{kind:"offer"});
 assert.equal((await mk(c,"offer",{id:open,give:{items:["kway"],bulletins:2}})).status,200);
 const r=await adm({cmd:"market-list"});assert.equal(r.ok,true,JSON.stringify(r));
 const t=r.trades.find(x=>x.id&&x.a.name==="Paire Alpha"&&x.b.name==="Paire Gamma");
 assert.ok(t,JSON.stringify(r.trades));
 assert.deepEqual(Object.keys(t).sort(),["a","aGave","b","bGave","created","id","sameNet"]);
 assert.deepEqual(t.a,{name:"Paire Alpha",camp:"left"});assert.deepEqual(t.b,{name:"Paire Gamma",camp:"right"});
 assert.equal(t.sameNet,false);assert.deepEqual(t.aGave.items,["baguette"]);assert.equal(t.bGave.bulletins,1);
 assert.ok(r.trades.filter(x=>x.a.name==="Paire Alpha"&&x.b.name==="Paire Beta"&&x.sameNet===true).length===2);
 const li=r.listings.find(x=>x.id===open);
 assert.deepEqual(Object.keys(li).sort(),["author","created","give","id","offers","want"]);
 assert.deepEqual(li.author,{name:"Paire Beta",camp:"right"});assert.equal(li.offers,1);assert.equal(li.give.items[0],"loden");
 assert.ok(!r.listings.some(x=>x.id===l1),"a traded listing is no longer open");
 const pairs=r.pairs.filter(x=>[x.a.name,x.b.name].includes("Paire Alpha"));
 assert.equal(pairs.length,1,"only the pair with two trades");
 assert.deepEqual([pairs[0].a.name,pairs[0].b.name].sort(),["Paire Alpha","Paire Beta"]);assert.equal(pairs[0].n,2);assert.equal(pairs[0].sameNet,true);
 assert.deepEqual(Object.keys(pairs[0]).sort(),["a","b","n","sameNet"]);
 assert.ok(r.pairs.length<=20&&r.pairs.every((x,i,s)=>!i||s[i-1].n>=x.n));
 const text=JSON.stringify(r);assert.ok(!/net_?fp|netFp|10\.9\.6|"ip"|"net"|[0-9a-f]{64}/i.test(text),"no address, no fingerprint");
});

it("market-withdraw: closes the listing and its pending offers, tells the author, is audited; refuses a traded or unknown one",async()=>{
 const a=await mp("Retrait Auteur","left",["blazer"]),o=await mp("Retrait Offrant","right",["cheminot"],5);
 const id=await listOk(a,{items:["blazer"]},{kind:"offer"});
 assert.equal((await mk(o,"offer",{id,give:{items:["cheminot"],bulletins:2}})).status,200);
 assert.equal((await adm({cmd:"market-withdraw"})).ok,false);
 assert.equal((await adm({cmd:"market-withdraw",id:999999})).ok,false);
 const r=await adm({cmd:"market-withdraw",id,via:"web"});assert.equal(r.ok,true,JSON.stringify(r));
 assert.ok(!(await view(o)).board.some(l=>l.id===id),"off the board");
 assert.ok(!(await view(a)).mine.some(l=>l.id===id),"gone from the author's own listings");
 assert.equal((await view(o)).offers.find(x=>x.listingId===id).status,"closed","the pending offer is closed");
 assert.equal((await meOf(a)).state.journal[0].text,"Ton annonce a été retirée par l'organisation.");
 assert.equal((await meOf(a)).state.journal[0].k,"market");
 const row=(await adm({cmd:"audit"})).items.find(x=>x.cmd==="market-withdraw");assert.ok(row&&row.target==="Retrait Auteur",JSON.stringify(row));
 assert.equal((await adm({cmd:"market-withdraw",id})).ok,false,"already withdrawn");
 const l2=await listOk(a,{items:["blazer"]},{kind:"bulletins",bulletins:1});
 assert.equal((await mk(o,"take",{id:l2,give:{items:[],bulletins:1}})).status,200);
 assert.equal((await adm({cmd:"market-withdraw",id:l2})).ok,false,"a traded listing stays as it is");
 // a moderator may not act on a protected account's listing
 const p=await mp("Retrait Protege","left",["kway"]);const lp=await listOk(p,{items:["kway"]},{kind:"offer"});
 assert.equal((await adm({cmd:"player-protect",name:"Retrait Protege",on:true})).ok,true);
 assert.match((await adm({cmd:"market-withdraw",id:lp,by:"Modo"})).error,/protégé/);
 assert.equal((await adm({cmd:"market-withdraw",id:lp})).ok,true,"the owner may");
});
