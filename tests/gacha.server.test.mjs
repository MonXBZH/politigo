// The Garde-robe on a real server (1.6.0): the Bâton de feu des Apprix is claimed once and only once however many
// eligible draws race for it, its win reaches the feed, every open screen, every other subscriber and the admin's
// alerts; the owner alone puts it back in the urn, a deleted bearer frees it; the board carries what the portraits
// wear and the duel record; a finished mission is pushed once. Pushes are caught by tests/stub-fetch.mjs.
// Eligibility (a month-old account, 300+ Flamme) is written into the database between two boots of the same server.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until,sleep,keys,FCM,PW} from "./server-helpers.mjs";
import {ITEMS} from "../web/wardrobe.mjs";

const PORT=3991,H=10;   // H eligible players: 30 draws each at 3 % leave a winner-less round once in a thousand
let dir,LOG,SOCK,proc,db;
const env=()=>({NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG,POLITIGO_ADMIN_SOCKET:SOCK});
const fetched=()=>readFileSync(LOG,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l).url);
const pushes=ep=>fetched().filter(u=>u===FCM+ep).length;
const subscribe=async(c,ep)=>assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+ep,keys:keys()})).status,200);
const me=async c=>(await c.call("GET","/api/me")).json;
const idOf=name=>db.prepare("SELECT id FROM players WHERE name=?").get(name).id;
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
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
// Rewrites a stored game while the server is down (it loads every game at start).
function edit(name,fn,row={}){
 const r=db.prepare("SELECT state FROM players WHERE name=?").get(name),S=JSON.parse(r.state);fn(S);
 db.prepare("UPDATE players SET state=? WHERE name=?").run(JSON.stringify(S),name);
 if(row.created)db.prepare("UPDATE players SET created=? WHERE name=?").run(row.created,name);
}
// Every eligible player draws `n` times at once, in rounds (the action limit is 40 per 10 s) until somebody wins.
async function drawUntilWin(list,n=30){
 const all=[];
 for(let round=0;round<4;round++){
  if(round)await sleep(10500);
  const res=await Promise.all(list.flatMap(c=>Array.from({length:n},()=>c.call("POST","/api/action",{type:"draw",pay:"bulletin"}).then(r=>({c,r})))));
  all.push(...res);
  if(res.some(x=>x.r.json?.mythic))break;
 }
 return all;
}

let hs=[],obs,mis,winner,draws;
before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pgga-"));LOG=join(dir,"fetch.log");SOCK=join(dir,"admin.sock");writeFileSync(LOG,"");
 proc=await boot(PORT,dir,env());
 for(let i=0;i<H;i++)hs.push(await player(PORT,`Héritier ${i}`,i%2?"right":"left"));
 obs=await player(PORT,"Témoin");mis=await player(PORT,"Missionnaire","right");
 for(const c of [...hs,obs,mis])await subscribe(c,`g-${c.name.replace(/\W/g,"")}`);
 const r=await mis.call("POST","/api/action",{type:"missionStart",id:"tract"});
 assert.equal(r.status,200,JSON.stringify(r.json));assert.ok(!r.json.me.state.missions.cur.notified);
 await stop(proc);
 // A month-old account and a bright Flamme for the heirs; the mission started two hours ago.
 db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
 const old=Date.now()-40*864e5;
 for(const c of hs)edit(c.name,S=>{S.flame.pts=500;S.wardrobe.bulletins=500;},{created:old});
 edit(mis.name,S=>{S.missions.cur.start-=2*3600e3;S.missions.cur.end-=2*3600e3;});
 proc=await boot(PORT,dir,env());
});
after(async()=>{try{db.close();}catch{}await stop(proc);});

test("a finished mission is pushed once, then marked as told",async()=>{
 assert.ok(await until(()=>pushes("g-Missionnaire")===1,8000),"the sweep pushes the report");
 assert.ok(await until(async()=>(await me(mis)).state.missions.cur?.notified===true,8000),"notified kept in the game");
 await sleep(800);
 assert.equal(pushes("g-Missionnaire"),1,"only once");
 const r=await mis.call("POST","/api/action",{type:"missionReport"});
 assert.equal(r.status,200,JSON.stringify(r.json));assert.ok(r.json.report,"the report reaches the page");
});

test("the urn hint shows for the eligible only",async()=>{
 assert.equal((await me(hs[0])).urnHint,true);
 assert.equal((await me(obs)).urnHint,false,"a fresh account");
});

test("the Bâton is claimed exactly once, even with dozens of eligible draws at once",async t=>{
 const so=stream(obs);t.after(()=>so.close());await until(()=>got(so,"me").length);
 draws=await drawUntilWin(hs);
 const ok=draws.filter(x=>x.r.status===200);
 assert.ok(ok.length>=H*20,`draws went through (${ok.length}, statuses ${[...new Set(draws.map(x=>x.r.status))]})`);
 const wins=ok.filter(x=>x.r.json.mythic);
 assert.equal(wins.length,1,"one win, whatever the race");
 winner=wins[0].c;
 assert.deepEqual(wins[0].r.json.item,{id:"baton",kind:"object",rarity:"mythique"});
 assert.ok(wins[0].r.json.me.state.wardrobe.own.includes("baton"));
 const owners=[];for(const c of hs)if((await me(c)).state.wardrobe.own.includes("baton"))owners.push(c.name);
 assert.deepEqual(owners,[winner.name]);
 assert.deepEqual(db.prepare("SELECT item,player_id FROM mythics").all().map(r=>({...r})),[{item:"baton",player_id:idOf(winner.name)}]);
 // No draw ever says more than the rules give.
 for(const x of ok)assert.deepEqual(Object.keys(x.r.json).filter(k=>!["ok","item","dup","confetti","mythic","transfuge","me"].includes(k)),[]);
 // The win, everywhere: the feed, every open screen, every other subscriber, never the winner's own devices.
 assert.ok(await until(()=>got(so,"mythic").length),"the open screens are told");
 assert.deepEqual(got(so,"mythic")[0],{name:winner.name,camp:winner.camp});
 const line=await until(()=>got(so,"feed").flat().find(e=>e.kind==="mythic"));
 assert.equal(line.player,winner.name);assert.equal(line.text,"🔥 brandit désormais le Bâton de feu des Apprix.");
 const others=[...hs.filter(c=>c!==winner),obs].map(c=>`g-${c.name.replace(/\W/g,"")}`);
 assert.ok(await until(()=>others.every(ep=>pushes(ep)===1)),"every other subscriber is pushed");
 assert.ok(await until(()=>pushes("g-Missionnaire")===2),"the mission player too");
 assert.equal(pushes(`g-${winner.name.replace(/\W/g,"")}`),0,"not the winner");
 assert.equal((await me(hs.find(c=>c!==winner))).urnHint,false,"the staff gone, no more hint");
 // The ultra rares and the other party's cards announce themselves.
 const feed=(await obs.call("GET","/api/board")).json.feed;
 for(const x of ok.filter(x=>x.r.json.item?.rarity==="ultra"))assert.ok(feed.some(e=>e.kind==="ultra"&&e.player===x.c.name&&/Soviet suprême|sacrer à Reims/.test(e.text)),"ultra line");
 for(const x of ok.filter(x=>x.r.json.transfuge))assert.ok(feed.some(e=>e.kind==="transfuge"&&e.player===x.c.name),"transfuge line");
 // Nobody else can claim it now.
 const more=await Promise.all(hs.filter(c=>c!==winner).slice(0,4).flatMap(c=>Array.from({length:5},()=>c.call("POST","/api/action",{type:"draw",pay:"bulletin"}))));
 assert.ok(more.every(r=>r.status!==200||!r.json.mythic));
});

test("the admin sees the win, the owner alone puts it back",async()=>{
 const id=idOf(winner.name),key=`mythic:baton:${id}`;
 const al=await adm({cmd:"alerts"});assert.equal(al.ok,true,JSON.stringify(al));
 const a=al.items.find(x=>x.key===key);
 assert.ok(a,JSON.stringify(al.items));assert.equal(a.kind,"mythic");assert.deepEqual(a.ids,[id]);
 assert.equal(a.title,`${winner.name} a gagné le Bâton de feu`);assert.match(a.detail,/^Flamme \d+ · compte de 4\d jours · score de bot \d+\/100$/);
 assert.equal((await adm({cmd:"alerts-ack",keys:[key]})).ok,true,"its key is a valid alert key");
 assert.ok(!(await adm({cmd:"alerts"})).items.some(x=>x.key===key));
 const pd=(await adm({cmd:"player",id})).player.wardrobe;
 assert.equal(pd.baton,true);assert.ok(pd.own.some(x=>x.id==="baton"&&x.name==="Le Bâton de feu des Apprix"&&x.rarity==="mythique"));
 assert.equal(pd.flame,500);
 const log=(await adm({cmd:"audit"})).items;
 assert.ok(log.some(x=>x.cmd==="mythic"&&x.via==="server"&&x.target===winner.name));
 // Worn, it shows on the board.
 assert.equal((await winner.call("POST","/api/action",{type:"wear",kind:"object",id:"baton"})).status,200);
 assert.ok(await until(async()=>(await obs.call("GET","/api/board")).json.board.find(r=>r.name===winner.name)?.object==="baton"));
 // A moderator's signed request never runs it, the owner's does.
 const mod=await adm({cmd:"mythic-reset",by:"Modo"});assert.equal(mod.ok,false);assert.match(mod.error,/organisateur/);
 const r=await adm({cmd:"mythic-reset"});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.name,winner.name);
 const w=(await me(winner)).state.wardrobe;
 assert.ok(!w.own.includes("baton"));assert.equal(w.worn.object,null);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mythics").get().n,0);
 assert.equal((await adm({cmd:"mythic-reset"})).ok,false,"already in the urn");
 assert.ok((await adm({cmd:"audit"})).items.some(x=>x.cmd==="mythic-reset"&&x.target===winner.name));
 assert.equal((await me(winner)).urnHint,true,"back in the urn: the hint is back");
});

test("a bearer who deletes their account frees the staff",async()=>{
 await sleep(10500);   // the action limit of the last round
 const list=hs.filter(c=>c!==winner);
 const res=await drawUntilWin(list);
 const w=res.find(x=>x.r.json?.mythic);assert.ok(w,"won again");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mythics").get().n,1);
 assert.equal((await w.c.call("DELETE","/api/account",{password:PW})).status,200);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mythics").get().n,0,"back in the urn");
 assert.equal((await me(list.find(c=>c!==w.c))).urnHint,true);
});

test("board rows: worn outfit and object, duels won and lost in one pass",async()=>{
 const [a,b]=hs.filter(c=>db.prepare("SELECT 1 FROM players WHERE name=?").get(c.name)),ia=idOf(a.name),ib=idOf(b.name),now=Date.now();
 const ins=db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created,winner,c_score,d_score) VALUES('debate',?,?,1,?,?,?,5,3)");
 ins.run(ia,ib,"done",now,ia);ins.run(ib,ia,"done",now,ia);ins.run(ib,ia,"done",now,ib);
 ins.run(ia,ib,"annulled",now,ia);ins.run(ia,ib,"done",now,null);   // an annulled win and a tie count for nobody
 const outfit=(await me(a)).state.wardrobe.own.find(id=>ITEMS[id]?.kind==="outfit");
 if(outfit)assert.equal((await a.call("POST","/api/action",{type:"wear",kind:"outfit",id:outfit})).status,200);
 const rows=(await obs.call("GET","/api/board")).json.board,ra=rows.find(r=>r.name===a.name),rb=rows.find(r=>r.name===b.name);
 assert.deepEqual([ra.dw,ra.dl,rb.dw,rb.dl],[2,1,1,2]);
 assert.equal(ra.outfit,outfit??null);
 for(const r of rows)for(const k of ["outfit","object","dw","dl"])assert.ok(k in r,`${k} on every row`);
 assert.equal(rows.find(r=>r.name==="Témoin").dw,0);
});
