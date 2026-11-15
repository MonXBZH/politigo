// Trêve des confiseurs, the Front de neige (server/snowfront.mjs): the camps' snowball counter, closed at New Year's
// midnight (server time), 3 bulletins to the winning camp's players who played; and the midnight toast (one push to
// everyone, `newYear` / `newYearBanner` in /api/me). The module alone on a temporary database, then real servers.
// POLITIGO_NEWYEAR_AT moves "1 Jan 00:00" to a test instant (a dev server only).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,login,until,sleep,keys,FCM,dayNow} from "./server-helpers.mjs";
import {schedule,play,SPOTS,COVER} from "../web/snowball.mjs";
import {snowFlags} from "../web/rules.mjs";

const SF=await import(process.env.SNOWFRONT||"/app/snowfront.mjs");
const T=120000,it=(name,fn)=>test(name,{timeout:T},fn);
// The module's own rules run in their default zone, Europe/Paris: 23:59 there is 22:59 UTC in winter.
const paris=(y,mo,d,h,mi)=>Date.UTC(y,mo-1,d,h-1,mi);
const MIN=60e3;

// camps: the players who still exist (and their camp NOW, which the Front ignores: it pays the camp fought for).
function freshFront(camps={}){
 const db=new DatabaseSync(":memory:");
 return SF.createSnowFront(db,{exists:id=>id in camps});
}

// ---------------------------------------------------------------- the module alone
it("points add up per camp and year",()=>{
 const f=freshFront();
 f.add(2026,"left",1,10);f.add(2026,"left",1,10);f.add(2026,"right",2,7);
 assert.deepEqual(f.totals(2026),{left:20,right:7});
 assert.deepEqual(f.totals(2027),{left:0,right:0});
 // nothing but a camp and a whole, non-negative number of points
 assert.equal(f.add(2026,"centre",3,5),false);
 assert.equal(f.add(2026,"left",3,-4),false);
 assert.equal(f.add(2026,"left",3,Number.NaN),false);
 assert.equal(f.add(2026,"left",3,2.5),false);
 assert.deepEqual(f.totals(2026),{left:20,right:7});
 // a game of 0 points still counts as played
 assert.equal(f.add(2026,"right",5,0),true);
 assert.deepEqual(f.totals(2026),{left:20,right:7});
 assert.equal(f.result(2026),null);
});

it("a fight brings 120 points at most and a player 400 a server day: the excess is dropped, the fight still counts as played",()=>{
 const db=new DatabaseSync(":memory:"),f=SF.createSnowFront(db,{exists:()=>true}),D=20000;
 assert.equal(f.add(2026,"left",1,300,D),true);
 assert.deepEqual(f.totals(2026),{left:120,right:0},"120 a fight");
 f.add(2026,"left",1,120,D);f.add(2026,"left",1,110,D);
 assert.deepEqual(f.totals(2026),{left:350,right:0});
 assert.equal(f.add(2026,"left",1,90,D),true);
 assert.deepEqual(f.totals(2026),{left:400,right:0},"400 a day");
 assert.equal(f.add(2026,"left",1,60,D),true,"a fight past the cap is still played");
 assert.deepEqual(f.totals(2026),{left:400,right:0});
 // another player, another day: their own allowance
 f.add(2026,"right",2,100,D);f.add(2026,"left",1,70,D+1);
 assert.deepEqual(f.totals(2026),{left:470,right:100});
 assert.equal(db.prepare("SELECT pts FROM snowfront_daily WHERE day=? AND player_id=?").get(D,1).pts,400);
 // a camp change the same day does not reopen the allowance
 f.add(2026,"right",1,50,D);assert.deepEqual(f.totals(2026),{left:470,right:100});
 // in the caller's transaction, rolled back with it: the allowance is not spent
 db.exec("BEGIN");f.add(2026,"right",3,120,D);db.exec("ROLLBACK");
 f.add(2026,"right",3,120,D);f.add(2026,"right",3,120,D);f.add(2026,"right",3,120,D);f.add(2026,"right",3,120,D);
 assert.deepEqual(f.totals(2026),{left:470,right:500});
 // put(): the points really added (null: nothing added)
 const g=SF.createSnowFront(new DatabaseSync(":memory:"),{exists:()=>true});
 assert.equal(g.put(2026,"left",1,150,D),120);assert.equal(g.put(2026,"left",1,300,D),120);
 assert.equal(g.put(2026,"left",1,300,D),120);assert.equal(g.put(2026,"left",1,300,D),40);assert.equal(g.put(2026,"left",1,300,D),0);
 assert.equal(g.put(2026,"centre",1,5,D),null);
 // a closed year spends nothing
 f.close(2026);assert.equal(f.add(2026,"left",4,50,D),false);
 assert.equal(db.prepare("SELECT pts FROM snowfront_daily WHERE day=? AND player_id=?").get(D,4),undefined);
});

it("closing pays only those of the winning camp who played, once",()=>{
 const f=freshFront({1:"left",2:"right",3:"left",4:"left"});
 f.add(2026,"left",3,4);f.add(2026,"left",1,6);f.add(2026,"right",2,8);
 const c=f.close(2026);
 assert.deepEqual(c,{winner:"left",left:10,right:8,paid:[1,3]});
 assert.deepEqual(f.close(2026),{winner:"left",left:10,right:8,paid:[]},"a second close pays nobody");
 assert.deepEqual(f.result(2026),{winner:"left",left:10,right:8});
 // closed: a late game no longer moves the counter
 assert.equal(f.add(2026,"right",2,50),false);
 assert.deepEqual(f.totals(2026),{left:10,right:8});
 // a tie pays both camps; a deleted player (no camp any more) is skipped
 const g=freshFront({1:"left",2:"right",3:"left"});
 g.add(2026,"left",1,5);g.add(2026,"right",2,5);g.add(2026,"left",9,0);
 assert.deepEqual(g.close(2026),{winner:"tie",left:5,right:5,paid:[1,2]});
 // the right camp wins: only its players; another year is untouched
 const h=freshFront({1:"left",2:"right"});
 h.add(2026,"left",1,1);h.add(2026,"right",2,3);h.add(2025,"left",1,99);
 assert.deepEqual(h.close(2026),{winner:"right",left:1,right:3,paid:[2]});
 assert.equal(h.result(2025),null);
 // nobody played: a 0-0 tie, nobody to pay
 assert.deepEqual(freshFront().close(2030),{winner:"tie",left:0,right:0,paid:[]});
});

it("a player is paid by the camp he fought for, once, whatever his camp at the closing",()=>{
 // 1 fought on the left then switched to the right; 2 fought on the right; 3 fought for both camps
 const f=freshFront({1:"right",2:"right",3:"left"});
 f.add(2026,"left",1,10);f.add(2026,"right",2,4);f.add(2026,"left",3,1);f.add(2026,"right",3,1);
 assert.deepEqual(f.close(2026),{winner:"left",left:11,right:5,paid:[1,3]});
 const g=freshFront({3:"left"});
 g.add(2026,"left",3,1);g.add(2026,"right",3,1);
 assert.deepEqual(g.close(2026).paid,[3],"a tie pays the two-camp player once");
});

it("lastOpen: the most recent year anybody fought in, while it is not closed",()=>{
 const f=freshFront({1:"left"});
 assert.equal(f.lastOpen(),null);
 f.add(2025,"left",1,3);assert.equal(f.lastOpen(),2025);
 f.add(2026,"left",1,0);assert.equal(f.lastOpen(),2026);
 f.close(2026);assert.equal(f.lastOpen(),null,"only the most recent year is looked at");
});

it("closing in the caller's transaction rolls back with it",()=>{
 const db=new DatabaseSync(":memory:"),f=SF.createSnowFront(db,{campOf:()=>"left"});
 f.add(2026,"left",1,3);
 db.exec("BEGIN");assert.deepEqual(f.close(2026).paid,[1]);db.exec("ROLLBACK");
 assert.equal(f.result(2026),null,"the result went with the rollback");
 assert.deepEqual(f.close(2026).paid,[1],"so the next close pays");
});

it("frontYear and the midnight window",()=>{
 assert.equal(SF.frontYear(paris(2026,12,31,23,59)),2026);
 assert.equal(SF.frontYear(paris(2027,1,1,0,3)),2026);
 assert.equal(SF.frontYear(paris(2026,12,1,0,0)),2026);
 assert.equal(SF.closingAt(2026),paris(2027,1,1,0,0));
 assert.deepEqual(SF.newYearWindow(paris(2026,12,31,23,59)),{on:false,banner:false});
 assert.deepEqual(SF.newYearWindow(paris(2027,1,1,0,0)),{on:true,banner:false});
 assert.deepEqual(SF.newYearWindow(paris(2027,1,1,0,4)),{on:true,banner:false});
 assert.deepEqual(SF.newYearWindow(paris(2027,1,1,0,6)),{on:false,banner:true});
 assert.deepEqual(SF.newYearWindow(paris(2027,1,1,23,59)),{on:false,banner:true});
 assert.deepEqual(SF.newYearWindow(paris(2027,1,2,0,0)),{on:false,banner:false});
 assert.deepEqual(SF.newYearWindow(paris(2027,3,1,12,0)),{on:false,banner:false});
 // the test instant replaces 1 Jan 00:00 everywhere, consistently
 const at=paris(2026,11,14,15,0),y=SF.frontYear(at,at);
 assert.equal(SF.frontYear(at-3600e3,at),y);assert.equal(SF.frontYear(at+3600e3,at),y);
 assert.equal(SF.closingAt(y,at),at);
 assert.deepEqual(SF.newYearWindow(at-1,at),{on:false,banner:false});
 assert.deepEqual(SF.newYearWindow(at,at),{on:true,banner:false});
 assert.deepEqual(SF.newYearWindow(at+5*MIN-1,at),{on:true,banner:false});
 assert.deepEqual(SF.newYearWindow(at+5*MIN,at),{on:false,banner:true});
 assert.deepEqual(SF.newYearWindow(at+24*60*MIN,at),{on:false,banner:false});
});

// ---------------------------------------------------------------- real servers
// Where a fully risen foe's head is, as in snowball.client.test.mjs.
const centre=i=>{const s=SPOTS[i];return {x:s.x,y:Math.round(s.base-(64+COVER)/2*s.k)};};
// A good human fight's first seconds: one ball at each foe (no passer-by) 300 ms after he shows up.
// When those first foes are all passers-by or out of reach (about 1.5 % of the deals), the next foes too, until the
// replay scores: computed from the very seed the server dealt, never a 0-point fight (checked on 200 000 seeds; the
// last tap is at 6.9 s at most).
function goodTaps(seed,camp,upTo=2600){
 const sched=schedule(seed,camp),foes=sched.pops.filter(p=>p.passant===null),tap=p=>({t:Math.round(p.t+300),...centre(p.spot)});
 const taps=foes.filter(p=>p.t+300<=upTo).map(tap);
 for(const p of foes.slice(taps.length)){if(play(sched,taps).score>0)break;taps.push(tap(p));}
 return taps;
}
// How long to play before sending: at least the server's 3 s, and long enough for the last tap (the server takes no
// tap later than the time played + 2 s).
const playFor=taps=>Math.max(3300,Math.max(0,...taps.map(p=>p.t))-1500);
async function start(c){const r=await c.call("POST","/api/action",{type:"snowStart"});assert.equal(r.status,200,JSON.stringify(r.json));return r.json.game;}
async function end(c,game,taps,extra={}){return c.call("POST","/api/action",{type:"miniEnd",id:game.id,taps,...extra});}
const me=async c=>(await c.call("GET","/api/me")).json;
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
const got=(s,ev)=>s.events.filter(e=>e.ev===ev).map(e=>e.data);

const A_PORT=3987;let A;
before(async()=>{A={dir:mkdtempSync(join(tmpdir(),"pgsf-"))};A.proc=await boot(A_PORT,A.dir,{POLITIGO_EVENT:"noel"});});
after(async()=>{if(A?.proc)await stop(A.proc);});
// Last resort: a stream or a child still holding this file's process once every test is done must not hold the run.
after(()=>{setTimeout(()=>{console.error("snowfront.test: handles still open, forced exit");process.exit(process.exitCode??0);},3000).unref();});

it("a fight raises its camp on the Front by the score the server recomputed, never the one sent",async t=>{
 const l=await player(A_PORT,"Front Gauche","left"),r=await player(A_PORT,"Front Droite","right");
 const m0=await me(l);
 assert.deepEqual(m0.snowFront,{left:0,right:0,closed:false});
 assert.equal(m0.newYear,undefined);assert.equal(m0.newYearBanner,undefined);
 const s=stream(A_PORT,r);t.after(()=>s.close());await until(()=>got(s,"me").length);
 const g=await start(l),taps=goodTaps(g.seed,"left"),want=play(schedule(g.seed,"left"),taps).score;
 assert.ok(want>0,"the taps hit");
 await sleep(playFor(taps));
 const e=await end(l,g,taps,{score:999});
 assert.equal(e.status,200,JSON.stringify(e.json));
 assert.deepEqual(e.json.me.snowFront,{left:want,right:0,closed:false});
 assert.equal(e.json.front,true,"the reply says the fight counted");
 assert.equal(e.json.frontPts,want,"and how many points the Front took");
 // the day's allowance is kept with the add (the server day of the fight's start)
 {const db=new DatabaseSync(join(A.dir,"t.db"),{readOnly:true});
  try{assert.deepEqual(db.prepare("SELECT day,pts FROM snowfront_daily").all().map(r=>({...r})),[{day:dayNow(),pts:want}]);}finally{db.close();}}
 assert.deepEqual((await me(r)).snowFront,{left:want,right:0,closed:false},"the same counter for everyone");
 // the open screens hear it through the "snowFront" event (no full me payload for everyone)
 const sf=await until(()=>got(s,"snowFront").at(-1));
 assert.deepEqual(sf,{left:want,right:0,closed:false});
 // a refused fight (malformed taps) adds nothing
 const g2=await start(r);await sleep(3300);
 assert.equal((await end(r,g2,"pas des touches",{score:999})).status,422);
 assert.deepEqual((await me(r)).snowFront,{left:want,right:0,closed:false});
});

it("an honest fast player's 400 taps (over 4 KiB of JSON) are not refused with a 413",async()=>{
 const r=await player(A_PORT,"Front Rapide","left");
 const g=await start(r);
 // the good taps, then misses spread over the time played, up to SNOW.maxTaps
 const taps=goodTaps(g.seed,"left");
 for(let i=0;taps.length<400;i++)taps.push({t:200+i*7,x:233,y:466});
 const body=JSON.stringify({type:"miniEnd",id:g.id,taps});
 assert.ok(body.length>4096&&body.length<16384,`body of ${body.length} bytes`);
 await sleep(playFor(taps));
 const e=await end(r,g,taps);
 assert.notEqual(e.status,413,JSON.stringify(e.json));
 assert.equal(e.status,200,JSON.stringify(e.json));
});

it("a fight flagged as a bot pays its XP but stays out of the Front",async()=>{
 const r=await player(A_PORT,"Front Robot","right");
 const g=await start(r);
 // the good taps, then a burst of taps every 30 ms: "taps_rapides"
 const taps=[...goodTaps(g.seed,"right"),...Array.from({length:60},(_,i)=>({t:3000+i*30,x:20,y:460}))];
 const res=play(schedule(g.seed,"right"),taps);
 assert.ok(res.score>0,"the fight scores");
 assert.ok(snowFlags(taps,res,[]).includes("taps_rapides"),"and is flagged");
 const before=(await me(r)).snowFront;
 await sleep(playFor(taps));
 const e=await end(r,g,taps);
 assert.equal(e.status,200,JSON.stringify(e.json));
 assert.deepEqual(e.json.me.snowFront,before,"not counted");
 assert.equal(e.json.front,false,"and the reply says so");
 assert.equal(e.json.frontPts,0);
});

it("no Front outside the theme; a test instant is refused off a dev server",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pgsf-off-"));
 const p=await boot(3989,dir,{POLITIGO_EVENT:"off"});
 try{const c=await player(3989,"Hors saison");const m=await me(c);assert.equal(m.snowFront,undefined);assert.equal(m.newYear,undefined);}
 finally{await stop(p);}
 await assert.rejects(boot(3990,mkdtempSync(join(tmpdir(),"pgsf-v-")),{POLITIGO_VERSION:"v1.8.0",POLITIGO_NEWYEAR_AT:String(Date.now())}),/server exited 1[\s\S]*POLITIGO_NEWYEAR_AT/);
 await assert.rejects(boot(3990,mkdtempSync(join(tmpdir(),"pgsf-n-")),{POLITIGO_NEWYEAR_AT:"demain"}),/server exited 1[\s\S]*POLITIGO_NEWYEAR_AT/);
 // the raw variable decides: a version the server would show as "dev" is still not "dev"
 await assert.rejects(boot(3990,mkdtempSync(join(tmpdir(),"pgsf-w-")),{POLITIGO_VERSION:"pas une version !",POLITIGO_NEWYEAR_AT:String(Date.now())}),/server exited 1[\s\S]*POLITIGO_NEWYEAR_AT/);
});

test("midnight: one toast push, the Front closes after the fights begun before it, 3 bulletins to the winners, once",{timeout:180000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),"pgsf-ny-")),LOG=join(dir,"fetch.log");writeFileSync(LOG,"");
 const AT=Date.now()+12000,port=3988;
 const env={POLITIGO_EVENT:"noel",POLITIGO_NEWYEAR_AT:String(AT),NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG};
 let p=await boot(port,dir,env);t.after(()=>stop(p));
 const pushes=ep=>readFileSync(LOG,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l).url).filter(u=>u===FCM+ep).length;
 const year=SF.frontYear(AT,AT);
 const L1=await player(port,"Réveillon Un","left"),L2=await player(port,"Réveillon Deux","left"),R1=await player(port,"Réveillon Droit","right"),S=await player(port,"Réveillon Abonné","left");
 assert.equal((await S.call("POST","/api/push/subscribe",{endpoint:FCM+"toast",keys:keys()})).status,200);
 const bulletins=async c=>(await me(c)).state.wardrobe.bulletins;
 const b0={L1:await bulletins(L1),L2:await bulletins(L2),R1:await bulletins(R1),S:await bulletins(S)};
 // two fights begun before midnight
 const g1=await start(L1),g2=await start(R1);
 assert.ok(Date.now()<AT-1000,"started before the test midnight");
 assert.equal((await me(S)).newYear,undefined);
 const taps1=goodTaps(g1.seed,"left"),sc1=play(schedule(g1.seed,"left"),taps1).score;assert.ok(sc1>0);
 // midnight passes: the toast goes out once to the subscriber; the counter shows itself closed
 await until(()=>Date.now()>=AT+300,20000);
 assert.deepEqual((await me(S)).snowFront,{left:0,right:0,closed:true});
 assert.ok(await until(()=>pushes("toast")===1,15000),"the toast is pushed");
 // a sweep tick (10 s) passes while the two fights are still running: the Front waits for them
 await until(()=>Date.now()>=AT+11000,20000);
 const db=new DatabaseSync(join(dir,"t.db"),{readOnly:true});t.after(()=>db.close());
 const setting=k=>db.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value??null;
 assert.equal(setting("newyear_sent"),String(year));
 assert.equal(setting("snowfront_closed"),null,"not closed while a fight begun before midnight is running");
 // they end after midnight and still count (their start decides)
 const e1=await end(L1,g1,taps1),e2=await end(R1,g2,[]);
 assert.equal(e1.status,200,JSON.stringify(e1.json));assert.equal(e2.status,200,JSON.stringify(e2.json));
 assert.deepEqual(e1.json.me.snowFront,{left:sc1,right:0,closed:true});
 // a fight begun after midnight pays its XP but no longer counts, and does not make its player a winner
 const g3=await start(L2),taps3=goodTaps(g3.seed,"left");await sleep(playFor(taps3));
 const e3=await end(L2,g3,taps3);assert.equal(e3.status,200,JSON.stringify(e3.json));
 assert.deepEqual(e3.json.me.snowFront,{left:sc1,right:0,closed:true});
 // the closing tick: the left camp wins, its player who played gets 3 bulletins, nobody else
 assert.ok(await until(()=>setting("snowfront_closed")===String(year),15000),"the Front closes");
 assert.equal(await bulletins(L1),b0.L1+3);
 assert.equal(await bulletins(L2),b0.L2);assert.equal(await bulletins(R1),b0.R1);assert.equal(await bulletins(S),b0.S);
 // the prize is told in the winner's journal, nobody else's
 const prize="❄️ Le Front de neige est tombé : ton camp l'emporte. +3 bulletins.";
 assert.ok((await me(L1)).state.journal.some(j=>j.k==="snowfront"&&j.text===prize),"in the winner's journal");
 assert.ok(!(await me(R1)).state.journal.some(j=>j.k==="snowfront"));
 const line=`❄️ Le Front de neige est tombé : la Gauche l'emporte (${sc1} contre 0).`;
 const feed=async()=>(await S.call("GET","/api/board")).json.feed.filter(e=>e.text===line);
 assert.equal((await feed()).length,1,"one line in the public feed");
 const log=db.prepare("SELECT via,target,detail FROM admin_log WHERE cmd='noel-front'").all();
 assert.equal(log.length,1);assert.equal(log[0].via,"server");assert.match(log[0].detail,new RegExp(`Gauche ${sc1}`));
 // the toast in /api/me: up to 4 names among those online (never oneself), the others seen in the last 24 h
 const s1=stream(port,L2),s2=stream(port,R1),s3=stream(port,S);t.after(()=>{s1.close();s2.close();s3.close();});
 await until(()=>got(s1,"me").length&&got(s2,"me").length&&got(s3,"me").length);await sleep(200);
 const ny=(await me(S)).newYear;
 assert.ok(ny,"the toast is on");
 assert.deepEqual([...ny.names].sort(),["Réveillon Deux","Réveillon Droit"].sort());
 assert.equal(ny.others,1,"Réveillon Un, seen today but not online");
 assert.deepEqual(ny.front,{winner:"left",left:sc1,right:0});
 assert.equal(ny.until,AT+5*MIN);
 assert.equal(ny.live,true,"the toast is live");
 assert.equal((await me(S)).newYearBanner,undefined);
 assert.deepEqual((await me(S)).snowFront,{left:sc1,right:0,closed:true});
 // a restart within the window repeats nothing: no second push, no second payment, no second line
 s1.close();s2.close();s3.close();
 await stop(p);p=await boot(port,dir,env);
 await sleep(11500);
 const L1b=await login(port,"Réveillon Un"),Sb=await login(port,"Réveillon Abonné");
 assert.equal(pushes("toast"),1);
 assert.equal(await bulletins(L1b),b0.L1+3);
 assert.equal((await Sb.call("GET","/api/board")).json.feed.filter(e=>e.text===line).length,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE cmd='noel-front'").get().n,1);
});

it("after the toast's five minutes: newYear stays for the banner's replay (live:false), with newYearBanner",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"pgsf-b-")),AT=Date.now()-6*MIN,port=3997;
 const p=await boot(port,dir,{POLITIGO_EVENT:"noel",POLITIGO_NEWYEAR_AT:String(AT)});t.after(()=>stop(p));
 const a=await player(port,"Bandeau Gauche","left"),b=await player(port,"Bandeau Droite","right");
 const s=stream(port,b);t.after(()=>s.close());await until(()=>got(s,"me").length);
 const m=await me(a);
 assert.equal(m.newYearBanner,true);
 assert.deepEqual(m.newYear,{names:["Bandeau Droite"],others:0,front:null,until:AT+5*MIN,live:false});
});

it("with the season off, no toast at all: no newYear, no banner, no push",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"pgsf-o-")),LOG=join(dir,"fetch.log");writeFileSync(LOG,"");
 const AT=Date.now()+2000,port=3976;
 const p=await boot(port,dir,{POLITIGO_EVENT:"off",POLITIGO_NEWYEAR_AT:String(AT),NODE_OPTIONS:"--import /w/tests/stub-fetch.mjs",STUB_FETCH_LOG:LOG});t.after(()=>stop(p));
 const c=await player(port,"Saison Coupée","left");
 assert.equal((await c.call("POST","/api/push/subscribe",{endpoint:FCM+"off",keys:keys()})).status,200);
 await until(()=>Date.now()>=AT+11000,20000);   // inside the toast's window, a 10 s tick past
 const m=await me(c);
 assert.equal(m.newYear,undefined);assert.equal(m.newYearBanner,undefined);assert.equal(m.snowFront,undefined);
 assert.equal(readFileSync(LOG,"utf8").split("\n").filter(l=>l.includes(FCM+"off")).length,0,"no push attempted");
 const db=new DatabaseSync(join(dir,"t.db"),{readOnly:true});t.after(()=>db.close());
 assert.equal(db.prepare("SELECT value FROM settings WHERE key='newyear_sent'").get(),undefined);
});

it("a Front an earlier year left open (server down through January) is closed at the next tick, once",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"pgsf-s-")),port=3972,env={POLITIGO_EVENT:"noel"};
 let p=await boot(port,dir,env);t.after(()=>stop(p));
 const l=await player(port,"Vieux Front","left");const b0=(await me(l)).state.wardrobe.bulletins;
 await stop(p);
 {const db=new DatabaseSync(join(dir,"t.db"));
  const id=db.prepare("SELECT id FROM players WHERE name=?").get("Vieux Front").id;
  db.exec("INSERT INTO snowfront(year,camp,points) VALUES(2025,'left',7),(2025,'right',2)");
  db.prepare("INSERT INTO snowfront_players(year,player_id,camp) VALUES(2025,?,'left'),(2025,999,'left'),(2025,?,'right')").run(id,id+1);
  db.close();}
 p=await boot(port,dir,env);
 const db=new DatabaseSync(join(dir,"t.db"),{readOnly:true});t.after(()=>db.close());
 assert.ok(await until(()=>db.prepare("SELECT 1 FROM snowfront_results WHERE year=2025").get(),15000),"closed");
 assert.deepEqual({...db.prepare("SELECT winner,left_pts,right_pts FROM snowfront_results WHERE year=2025").get()},{winner:"left",left_pts:7,right_pts:2});
 const l2=await login(port,"Vieux Front");
 assert.equal((await me(l2)).state.wardrobe.bulletins,b0+3);
 const line="❄️ Le Front de neige est tombé : la Gauche l'emporte (7 contre 2).";
 assert.equal((await l2.call("GET","/api/board")).json.feed.filter(e=>e.text===line).length,1);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE cmd='noel-front' AND target='2025'").get().n,1);
});

it("the closing logs the number of players really credited, and the feed line groups its numbers by thousands like the client",async t=>{
 const dir=mkdtempSync(join(tmpdir(),"pgsf-x-")),port=3971,env={POLITIGO_EVENT:"noel"};
 let p=await boot(port,dir,env);
 const a=await player(port,"Crédité Un","left");await player(port,"Crédité Deux","left");await player(port,"Suspendu Neige","left");
 const b0=(await me(a)).state.wardrobe.bulletins;
 await stop(p);
 {const db=new DatabaseSync(join(dir,"t.db"));
  const id=n=>db.prepare("SELECT id FROM players WHERE name=?").get(n).id;
  // two are credited; the third is suspended and the fourth is gone: neither is paid nor counted
  db.exec("INSERT INTO snowfront(year,camp,points) VALUES(2025,'left',1234567),(2025,'right',2000)");
  const ins=db.prepare("INSERT INTO snowfront_players(year,player_id,camp) VALUES(2025,?,'left')");
  for(const n of ["Crédité Un","Crédité Deux","Suspendu Neige"])ins.run(id(n));
  ins.run(999);   // gone
  db.prepare("UPDATE players SET suspended=1 WHERE id=?").run(id("Suspendu Neige"));
  db.close();}
 p=await boot(port,dir,env);t.after(()=>stop(p));
 const db=new DatabaseSync(join(dir,"t.db"),{readOnly:true});t.after(()=>db.close());
 assert.ok(await until(()=>db.prepare("SELECT 1 FROM snowfront_results WHERE year=2025").get(),15000),"closed");
 const l=await login(port,"Crédité Un");
 assert.equal((await me(l)).state.wardrobe.bulletins,b0+3);
 const NB=" ";
 const line=`❄️ Le Front de neige est tombé : la Gauche l'emporte (1${NB}234${NB}567 contre 2${NB}000).`;
 assert.equal((await l.call("GET","/api/board")).json.feed.filter(e=>e.text===line).length,1,"numbers grouped with no-break spaces, as the client's frontLine");
 const log=db.prepare("SELECT detail FROM admin_log WHERE cmd='noel-front' AND target='2025'").get();
 assert.match(log.detail,/à 2 joueurs$/,"the two players really credited, not the suspended nor the gone: "+log.detail);
 assert.match(p.out,/2 player\(s\) paid/);
});
