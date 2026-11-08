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

const PORT=3900,H=36e5;
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
const save=(o={})=>{const s=Date.now()+H;return adm({cmd:"event-save",type:"soldes",name:"Soldes",msg:"Tout à moitié prix.",params:{off:50},starts:s,ends:s+2*H,who:"all",rep:"",push:false,reminds:[],...o});};
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
  {rep:"day",starts:now+H,ends:now+H+30*H},{starts:"demain"},
  {reminds:[30]},{reminds:"15"},{ann:"{nom }"},{ann:"Le {prix}"},{rtext:"{delai"},{ann:"x".repeat(241)},{ann:5},{ann:"{resume} ".repeat(20)+"x".repeat(60)}]){
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
 await save({who:"all",reminds:[15],starts:s,ends:s+H,name:"Bientôt"});
 assert.ok(await until(()=>pushes("ev-right")===n0+1,3000));await sleep(1200);assert.equal(pushes("ev-right"),n0+1,"once");
 await live({push:true,name:"Tout de suite",msg:"Pour tous.",ann:"🎉 {nom} : {resume}."});
 assert.ok(await until(async()=>(await left.call("GET","/api/board")).json.feed.some(f=>f.text==="🎉 Tout de suite : Buvette et Soins −50 %.")));
});

test("a series plans its next run when one ends, a stopped run included",async()=>{
 await clear();
 const a=await live({rep:"week",name:"Rendez-vous"});assert.equal((await adm({cmd:"event-stop",id:a.event.id})).ok,true);
 const next=(await adm({cmd:"events-list"})).items.find(e=>e.state==="soon"&&e.name==="Rendez-vous");
 assert.ok(next,"the next one");assert.equal(next.rep,"week");assert.ok(Math.abs(next.starts-(a.event.starts+7*864e5))<=H+1000,"a week later, DST aside");assert.equal(next.ends-next.starts,a.event.ends-a.event.starts);
});

const feedHas=async re=>(await left.call("GET","/api/board")).json.feed.filter(f=>re.test(f.text)).map(f=>f.text);

test("an untouched text stores nothing and follows the type; a written one is kept, and the banner keeps its own message",async()=>{
 await clear();const cat=(await adm({cmd:"events-list"})).types;
 const a=await save({ann:cat.soldes.ann,rtext:cat.soldes.rem,reminds:[15,1440]});assert.equal(a.event.ann,null);assert.equal(a.event.rtext,null);assert.deepEqual(a.event.reminds,[1440,15]);
 const b=await save({id:a.event.id,type:"bulletins",params:{mult:2},ann:"",rtext:null});assert.equal(b.event.ann,null);
 const c=await save({ann:"  Tout   à {resume}  ",rtext:"Dans {delai}"});assert.equal(c.event.ann,"Tout à {resume}");assert.equal(c.event.rtext,"Dans {delai}");
 await live({push:true,name:"Bannière",msg:"Le message du bandeau",ann:"L'annonce de {nom}"});
 assert.ok(await until(async()=>(await feedHas(/L'annonce de Bannière/)).length));
 assert.equal((await feedHas(/message du bandeau/)).length,0,"the banner's text is not the announcement");
 const pub=(await me(left)).events.find(e=>e.name==="Bannière");assert.equal(pub.msg,"Le message du bandeau");assert.deepEqual(Object.keys(pub).sort(),["ends","id","msg","name","params","starts","type","who"]);
});

test("the prepared text speaks of the settings, and of the end in the server's time",async()=>{
 await clear();await live({push:true,type:"duels",params:{extra:5,mult:2},name:"Grande nuit"});
 assert.ok(await until(async()=>(await feedHas(/Grande nuit/)).length));
 const [line]=await feedHas(/Grande nuit/);
 assert.match(line,/^🎉 Grande nuit : \+5 défis, gains ×2 jusqu'à /);assert.doesNotMatch(line,/\{/);
});

test("the preview shows what will go out and refuses what would be refused, without saving anything",async()=>{
 await clear();const s=Date.now()+3*H,base={type:"soldes",name:"Essai",params:{off:25},starts:s,ends:s+H};
 const p=await adm({cmd:"event-preview",...base,ann:"{nom} : {resume}",rtext:"Dans {delai}"});assert.equal(p.ok,true,JSON.stringify(p));assert.equal(p.ann,"Essai : Buvette et Soins −25 %");assert.equal(p.remind,"Dans 15 minutes");
 const d=await adm({cmd:"event-preview",...base});assert.ok(d.ann.startsWith("🎉 Essai : Buvette et Soins −25 %"));assert.doesNotMatch(d.ann+d.remind,/\{/);
 assert.equal((await adm({cmd:"event-preview",...base,ann:"{oups}"})).ok,false);
 assert.deepEqual((await adm({cmd:"events-list"})).items.filter(e=>e.state==="soon"),[]);
 assert.equal((await adm({cmd:"audit"})).items.some(x=>x.cmd==="event-preview"),false);
});

test("several reminders already due go out as one, with the real delay, and the nearer one still comes",async()=>{
 await clear();const n0=pushes("ev-right"),s=Date.now()+30*60e3;
 const a=await save({who:"all",reminds:[1440,60,15],rtext:"Dans {delai} : {nom}",starts:s,ends:s+H,name:"Rafale"});
 assert.ok(await until(()=>pushes("ev-right")===n0+1,3000));await sleep(1300);assert.equal(pushes("ev-right"),n0+1,"one only");
 const said=await feedHas(/Rafale/);assert.equal(said.length,1);assert.match(said[0],/^Dans (29|30) minutes : Rafale$/);
 assert.deepEqual(JSON.parse(db.prepare("SELECT sent FROM events WHERE id=?").get(a.event.id).sent).sort((x,y)=>x-y),[60,1440],"15 minutes is still to come");
 const e=await save({id:a.event.id,name:"Rafale 2",reminds:[60]});assert.equal(e.event.name,"Rafale 2");
 await sleep(1200);assert.equal(pushes("ev-right"),n0+1,"a new date starts the reminders over, but not within five minutes");assert.equal(db.prepare("SELECT sent FROM events WHERE id=?").get(a.event.id).sent,"[]");
});

test("a restart sends no reminder twice",async()=>{
 await clear();const n0=pushes("ev-left"),s=Date.now()+10*60e3;
 await save({reminds:[15],starts:s,ends:s+H,name:"Une fois"});assert.ok(await until(()=>pushes("ev-left")===n0+1,3000));
 await stop(proc);proc=await boot(PORT,dir,env());await sleep(1500);
 assert.equal(pushes("ev-left"),n0+1);
});

test("a series keeps its texts and its reminders, with nothing sent yet for the next run",async()=>{
 await clear();const a=await live({rep:"week",name:"Rituel",ann:"Le {nom}",rtext:"Bientôt {nom}",reminds:[60,15]});
 await adm({cmd:"event-stop",id:a.event.id});
 const next=(await adm({cmd:"events-list"})).items.find(e=>e.state==="soon"&&e.name==="Rituel");
 assert.equal(next.ann,"Le {nom}");assert.equal(next.rtext,"Bientôt {nom}");assert.deepEqual(next.reminds,[60,15]);
 assert.equal(db.prepare("SELECT sent FROM events WHERE id=?").get(next.id).sent,"[]");
});

test("a daily series: the next run's one-day reminder is already past, nothing goes out when it is planned",async()=>{
 await clear();const a=await live({rep:"day",name:"Quotidien",reminds:[1440,60]}),n0=pushes("ev-right");
 await adm({cmd:"event-stop",id:a.event.id});await sleep(1200);
 const next=(await adm({cmd:"events-list"})).items.find(e=>e.state==="soon"&&e.name==="Quotidien");
 assert.deepEqual(JSON.parse(db.prepare("SELECT sent FROM events WHERE id=?").get(next.id).sent),[1440]);
 assert.deepEqual(next.reminds,[1440,60],"still asked");assert.equal(pushes("ev-right"),n0,"nothing sent");
});

test("changing an event repeats no reminder; moving its start allows one, not at once",async()=>{
 await clear();const n0=pushes("ev-right"),s=Date.now()+10*60e3,sent=id=>db.prepare("SELECT sent FROM events WHERE id=?").get(id).sent;
 const a=await save({who:"all",reminds:[15],starts:s,ends:s+H,name:"Une fois"});
 assert.ok(await until(()=>pushes("ev-right")===n0+1,3000));
 assert.equal((await save({id:a.event.id,who:"all",reminds:[15],starts:s,ends:s+H,name:"Une fois, corrigé"})).ok,true);
 await sleep(1200);assert.equal(pushes("ev-right"),n0+1,"a typo is not news");assert.equal(sent(a.event.id),"[15]");
 assert.equal((await save({id:a.event.id,who:"all",reminds:[15],starts:s+60e3,ends:s+60e3+H,name:"Une fois, décalé"})).ok,true);
 await sleep(1200);assert.equal(pushes("ev-right"),n0+1,"not twice within five minutes");assert.equal(sent(a.event.id),"[]","still to go");
});

test("event-preview: dates out of range are refused, cleanly",async()=>{
 const p=o=>adm({cmd:"event-preview",type:"soldes",name:"Soldes",params:{off:50},starts:Date.now()+H,ends:Date.now()+2*H,...o}),far=8.7e15;
 assert.equal((await p({})).ok,true);
 for(const bad of [{starts:far,ends:far+H},{starts:-far,ends:-far+H},{ends:far},{ends:Date.now()}]){const r=await p(bad);assert.equal(r.ok,false,JSON.stringify(bad));assert.match(r.error,/Dates/);}
});

test("the database of 1.7.0: a reminder asked becomes 15 minutes, and one already sent stays sent",async()=>{
 const old=mkdtempSync(join(tmpdir(),"pgev-old-")),o=new DatabaseSync(join(old,"t.db")),s=Date.now()+10*60e3,log=join(old,"fetch.log");writeFileSync(log,"");
 const oldEnv={NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:log,POLITIGO_ADMIN_SOCKET:join(old,"admin.sock")};
 o.exec(`CREATE TABLE events(id INTEGER PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,msg TEXT NOT NULL,params TEXT NOT NULL,starts INTEGER NOT NULL,ends INTEGER NOT NULL,
  who TEXT NOT NULL,rep TEXT NOT NULL,push INTEGER NOT NULL,remind INTEGER NOT NULL,author TEXT,stopped INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL DEFAULT 0,reminded INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);`);
 const add=o.prepare(`INSERT INTO events(type,name,msg,params,starts,ends,who,rep,push,remind,reminded,created) VALUES('soldes',?,'m','{"off":50}',?,?,'all','',0,?,?,1)`);
 add.run("Déjà",s,s+H,1,1);add.run("Pas encore",s+H,s+2*H,1,0);add.run("Sans",s,s+H,0,0);o.close();
 let p=await boot(PORT+1,old,oldEnv);
 try{
  await stop(p);p=await boot(PORT+1,old,oldEnv);   // a second start changes nothing
  const v=new DatabaseSync(join(old,"t.db"),{timeout:5000}),rows=Object.fromEntries(v.prepare("SELECT name,reminds,sent FROM events").all().map(r=>[r.name,[r.reminds,r.sent]]));v.close();
  assert.deepEqual(rows,{"Déjà":["[15]","[15]"],"Pas encore":["[15]","[]"],"Sans":["[]","[]"]});
 }finally{await stop(p);}
});

test("the duels' daily limit follows the event",async()=>{
 await clear();const before=(await left.call("GET","/api/duels")).json.perDay;
 await live({type:"duels",params:{extra:5,mult:2}});
 assert.equal((await left.call("GET","/api/duels")).json.perDay,before+5);
});

test("Sac postal: the letter reaches the open screen by itself, before any action",async()=>{
 await clear();await stop(proc);proc=await boot(PORT,dir,{...env(),POLITIGO_SPEED:"60"});   // the gap of 10 game minutes: 10 s
 assert.equal((await me(left)).state.mail.letter,null);
 const r=await fetch(`http://127.0.0.1:${PORT}/events`,{headers:{Cookie:left.cookie}}),read=r.body.getReader(),text=new TextDecoder();
 await live({type:"courrier",params:{gap:10}});
 let seen="",got=false;const end=Date.now()+25000,timer=setTimeout(()=>read.cancel(),25000);
 while(!got&&Date.now()<end){
  const {value,done}=await read.read();if(done)break;
  seen=(seen+text.decode(value,{stream:true})).slice(-200000);got=/"letter":\{"id"/.test(seen);
 }
 clearTimeout(timer);await read.cancel();assert.ok(got,"pushed without a request from the player");
});
