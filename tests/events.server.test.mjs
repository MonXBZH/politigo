// Timed events on a real server: the console's commands and their checks, the announcements (once only, across a
// restart), the effects on a player's actions, the camps, a series, the duels' limit.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until,sleep,keys,FCM} from "./server-helpers.mjs";

const PORT=3993,H=36e5;
let dir,LOG,SOCK,proc,db,left,right;
const env=()=>({NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG,POLITIGO_ADMIN_SOCKET:SOCK});
const pushes=ep=>readFileSync(LOG,"utf8").split("\n").filter(Boolean).filter(l=>JSON.parse(l).url===FCM+ep).length;
const me=async c=>(await c.call("GET","/api/me")).json;
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const save=(o={})=>{const s=Date.now()+H;return adm({cmd:"event-save",type:"soldes",name:"Soldes",msg:"Tout à moitié prix.",params:{off:50},starts:s,ends:s+2*H,who:"all",rep:"",push:false,remind:false,...o});};
const live=(o={})=>save({now:true,...o});
const clear=async()=>{for(const e of (await adm({cmd:"events-list"})).items){if(e.state==="on")await adm({cmd:"event-stop",id:e.id});if(e.state==="soon")await adm({cmd:"event-delete",id:e.id});}await sleep(1100);};

before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pgev-"));LOG=join(dir,"fetch.log");SOCK=join(dir,"admin.sock");writeFileSync(LOG,"");
 proc=await boot(PORT,dir,env());
 left=await player(PORT,"Gauchiste","left");right=await player(PORT,"Droitier","right");
 for(const [c,ep] of [[left,"ev-left"],[right,"ev-right"]])assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+ep,keys:keys()})).status,200);
 db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
});
after(async()=>{try{db.close();}catch{}await stop(proc);});

test("event-save refuses what is not on offer",async()=>{
 const now=Date.now();
 for(const bad of [{type:"zz"},{params:{off:90}},{name:""},{name:"x".repeat(51)},{msg:""},{who:"centre"},{rep:"month"},{starts:now-H,ends:now+H},{starts:now+H,ends:now+H+1000},{starts:now+H,ends:now+H+8*864e5},
  {rep:"day",starts:now+H,ends:now+H+30*H},{starts:"demain"}]){
  const r=await save(bad);assert.equal(r.ok,false,JSON.stringify(bad));
 }
 assert.deepEqual((await adm({cmd:"events-list"})).items,[]);
});

test("planned, changed, started, stopped: each step in its state, and in the admin log",async()=>{
 const a=await save();assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.event.state,"soon");assert.equal(a.event.summary,"Buvette et Soins −50 %");
 assert.deepEqual((await me(left)).events,[],"not public before it starts");
 const e=await save({id:a.event.id,name:"Grandes soldes",params:{off:25}});assert.equal(e.event.name,"Grandes soldes");assert.equal(e.event.params.off,25);
 const len=a.event.ends-a.event.starts,s=await adm({cmd:"event-start",id:a.event.id});assert.equal(s.event.state,"on");assert.equal(s.event.ends-s.event.starts,len);
 assert.equal((await save({id:a.event.id})).ok,false,"a running event is not changed");assert.equal((await adm({cmd:"event-delete",id:a.event.id})).ok,false);assert.equal((await adm({cmd:"event-start",id:a.event.id})).ok,false);
 const ev=(await me(left)).events;assert.equal(ev.length,1);assert.deepEqual(Object.keys(ev[0]).sort(),["ends","id","msg","name","params","starts","type","who"],"nothing of the console");
 const t=await adm({cmd:"event-stop",id:a.event.id});assert.equal(t.event.state,"past");assert.equal(t.event.stopped,true);
 assert.deepEqual((await me(left)).events,[]);assert.equal((await adm({cmd:"event-stop",id:a.event.id})).ok,false);
 const b=await save();assert.equal((await adm({cmd:"event-delete",id:b.event.id})).ok,true);assert.equal((await adm({cmd:"event-delete",id:999})).ok,false);
 const log=(await adm({cmd:"audit"})).items.map(x=>x.cmd);for(const c of ["event-create","event-edit","event-start","event-stop","event-delete"])assert.ok(log.includes(c),c);
});

test("a sale reaches the buyer of the right camp only, at once, and the server's price is what counts",async()=>{
 await clear();await live({who:"left",params:{off:50}});
 const fm=c=>me(c).then(m=>m.state.fm),soup=async c=>c.call("POST","/api/action",{type:"buy",key:"soup"});
 const a=await fm(left),b=await fm(right);
 assert.equal((await soup(left)).status,200);assert.equal((await soup(right)).status,200);
 const paid=a-await fm(left),full=b-await fm(right);assert.ok(paid<full||full===1,`${paid} against ${full}`);
 assert.equal((await me(right)).events.length,1,"the list is public: the browser filters it by camp");
});

test("the start is announced once to the camp concerned, not again after a restart",async()=>{
 await clear();const n0=pushes("ev-left"),r0=pushes("ev-right");
 await live({who:"left",push:true,name:"Nuit rouge",msg:"Camarades !"});
 assert.ok(await until(()=>pushes("ev-left")===n0+1,3000),"the left is told");assert.equal(pushes("ev-right"),r0,"not the right");
 await stop(proc);proc=await boot(PORT,dir,env());await sleep(1500);
 assert.equal(pushes("ev-left"),n0+1,"a restart repeats nothing");
 assert.equal((await me(left)).events.length,1,"the event survives the restart");
});

test("a reminder 15 minutes before, once; everyone's event reaches the feed",async()=>{
 await clear();const n0=pushes("ev-right"),s=Date.now()+10*60e3;
 await save({who:"all",remind:true,starts:s,ends:s+H,name:"Bientôt"});
 assert.ok(await until(()=>pushes("ev-right")===n0+1,3000));await sleep(1200);assert.equal(pushes("ev-right"),n0+1,"once");
 await live({push:true,name:"Tout de suite",msg:"Pour tous."});
 assert.ok(await until(async()=>(await left.call("GET","/api/board")).json.feed.some(f=>f.text==="🎉 Tout de suite : Pour tous.")));
});

test("a series plans its next run when one ends, a stopped run included",async()=>{
 await clear();
 const a=await live({rep:"week",name:"Rendez-vous"});assert.equal((await adm({cmd:"event-stop",id:a.event.id})).ok,true);
 const next=(await adm({cmd:"events-list"})).items.find(e=>e.state==="soon"&&e.name==="Rendez-vous");
 assert.ok(next,"the next one");assert.equal(next.rep,"week");assert.ok(Math.abs(next.starts-(a.event.starts+7*864e5))<=H+1000,"a week later, DST aside");assert.equal(next.ends-next.starts,a.event.ends-a.event.starts);
});

test("the duels' daily limit follows the event",async()=>{
 await clear();const before=(await left.call("GET","/api/duels")).json.perDay;
 await live({type:"duels",params:{extra:5,mult:2}});
 assert.equal((await left.call("GET","/api/duels")).json.perDay,before+5);
});
