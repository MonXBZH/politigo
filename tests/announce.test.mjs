// The organiser's announcements (node admin.mjs announce): a real server and the real CLI, pushes caught by
// tests/stub-fetch.mjs (nothing leaves the machine). Banner on the open screens, push to the subscribed devices
// (held during a game), and a line in the public feed when it goes to everyone.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,client,until,sleep,keys,FCM,INVITE,PW} from "./server-helpers.mjs";

const PORT=3925,ADMIN=process.env.ADMIN||"/app/admin.mjs";
let proc,LOG,SOCK;
before(async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgan-"));LOG=join(dir,"fetch.log");SOCK=join(dir,"admin.sock");writeFileSync(LOG,"");
 proc=await boot(PORT,dir,{NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG,POLITIGO_ADMIN_SOCKET:SOCK});
});
after(async()=>{await stop(proc);});

const fetched=()=>readFileSync(LOG,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l).url);
const pushes=ep=>fetched().filter(u=>u===FCM+ep).length;
const subscribe=async(c,ep)=>assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+ep,keys:keys()})).status,200);
function admin(...args){
 return new Promise((ok,ko)=>{
  const p=spawn("node",[ADMIN,...args],{env:{...process.env,POLITIGO_ADMIN_SOCKET:SOCK},stdio:["ignore","pipe","pipe"]});
  let stdout="",stderr="";p.stdout.on("data",d=>{stdout+=d;});p.stderr.on("data",d=>{stderr+=d;});
  const t=setTimeout(()=>{p.kill();ko(new Error("admin CLI timed out"));},15e3);
  p.on("exit",code=>{clearTimeout(t);ok({code,stdout,stderr});});
 });
}
function stream(c){
 const ac=new AbortController(),events=[];
 fetch(`http://127.0.0.1:${PORT}/events`,{headers:{Cookie:c.cookie},signal:ac.signal}).then(async r=>{
  const dec=new TextDecoder();let buf="";
  for await(const chunk of r.body){
   buf+=dec.decode(chunk,{stream:true});let i;
   while((i=buf.indexOf("\n\n"))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);
    const ev=/^event: (.*)$/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev)events.push({ev,data:data&&JSON.parse(data)});}
  }
 }).catch(()=>{});
 return {events,close:()=>ac.abort()};
}
const got=(s,ev)=>s.events.filter(e=>e.ev===ev).map(e=>e.data);

test("announce to everyone: banner on the open screens, a push to each subscriber, a line in the feed",async t=>{
 const a=await player(PORT,"Écoute A"),b=await player(PORT,"Abonné B"),c=await player(PORT,"Absent C");
 await subscribe(b,"abonne-b");
 const sa=stream(a);t.after(()=>sa.close());await until(()=>got(sa,"me").length);
 const r=await admin("announce","  Maintenance ce soir   à 22 h\u0007 ! ");
 assert.equal(r.code,0,r.stderr);
 assert.match(r.stdout,/Annonce envoyée à tous : 1 joueur\(s\) à l'écran, 1 par notification/);
 assert.ok(await until(()=>got(sa,"announce").length),"the open screen gets the banner");
 assert.deepEqual(got(sa,"announce")[0],{text:"Maintenance ce soir à 22 h !"},"spaces folded, control characters dropped");
 const line=await until(()=>got(sa,"feed").flat().find(e=>e.kind==="announce"));
 assert.equal(line.player,"Annonce officielle");assert.equal(line.text,"Maintenance ce soir à 22 h !");
 assert.ok(await until(()=>pushes("abonne-b")===1),"the subscriber is pushed");
 // A screen opened later finds it in the feed.
 const sc=stream(c);t.after(()=>sc.close());
 assert.ok(await until(()=>got(sc,"feedInit")[0]?.some(e=>e.kind==="announce")));
});

test("announce --to: only that player, nothing in the public feed; a player in a game gets the push after it",async t=>{
 const d=await player(PORT,"Destinataire"),o=await player(PORT,"Autre O");
 await subscribe(d,"destinataire");
 const so=stream(o),sd=stream(d);t.after(()=>{so.close();sd.close();});
 await until(()=>got(so,"me").length&&got(sd,"me").length);
 const pg=await d.call("POST","/api/action",{type:"pongStart"});assert.equal(pg.status,200);
 const r=await admin("announce","Bravo pour ton mandat","--to","destinataire");   // found like a login: case does not matter
 assert.equal(r.code,0,r.stderr);
 assert.match(r.stdout,/Annonce envoyée à Destinataire : à l'écran maintenant, notification envoyée/);
 assert.ok(await until(()=>got(sd,"announce").length));
 await sleep(400);
 assert.equal(got(so,"announce").length,0,"nobody else");
 assert.ok(!got(so,"feed").flat().some(e=>e.kind==="announce"),"a private message stays out of the feed");
 assert.equal(pushes("destinataire"),0,"held during the Pong");
 await sleep(2000);   // the Pong minimum length
 assert.equal((await d.call("POST","/api/action",{type:"pongEnd",score:1,id:pg.json.game.id})).status,200);
 assert.ok(await until(()=>pushes("destinataire")===1),"pushed once the Pong is over");
});

test("announce: a player neither on screen nor subscribed is reported; bad input is refused",async()=>{
 await player(PORT,"Injoignable");
 const r=await admin("announce","Coucou","--to","Injoignable");
 assert.equal(r.code,0,r.stderr);
 assert.match(r.stdout,/pas connecté, pas de notification/);assert.match(r.stdout,/il ne verra pas ce message/);
 const unknown=await admin("announce","Coucou","--to","Personne Ici");
 assert.notEqual(unknown.code,0);assert.match(unknown.stderr,/introuvable/i);
 const unquoted=await admin("announce","Deux","mots");
 assert.equal(unquoted.code,2);assert.match(unquoted.stderr,/guillemets/);
 for(const text of ["   ","\u0007\u0008","x".repeat(241)]){
  const bad=await admin("announce",text);
  assert.notEqual(bad.code,0,JSON.stringify(text));assert.match(bad.stderr,/1 à 240 caractères/);
 }
 assert.equal((await admin("announce","x".repeat(240))).code,0,"240 is accepted");
});

test("announce: invisible characters are dropped (emoji joiners kept), a text may start with --",async t=>{
 const v=await player(PORT,"Lecteur V"),sv=stream(v);t.after(()=>sv.close());await until(()=>got(sv,"me").length);
 assert.equal((await admin("announce","Al​l‮o﻿ 👨‍👩‍👧")).code,0);
 assert.equal((await admin("announce","--- Maintenance ---")).code,0);
 assert.ok(await until(()=>got(sv,"announce").length===2));
 assert.deepEqual(got(sv,"announce").map(x=>x.text),["Al l o 👨‍👩‍👧","--- Maintenance ---"]);
});

test("the name the announcements sign with is reserved, in any case, accents or punctuation",async()=>{
 for(const name of ["Annonce officielle","annonce.OFFICIELLE","Annoncé Officiel","Annonce_Officielle"]){
  const c=client(PORT),r=await c.call("POST","/api/register",{name,password:PW,invite:INVITE,camp:"left"});
  assert.equal(r.status,400,name);assert.match(r.json.error,/réservé/);
 }
 await player(PORT,"Annonceur Fou");   // a near name is fine
});
