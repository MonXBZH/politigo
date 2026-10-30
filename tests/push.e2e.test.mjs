// Web Push end to end: a real server whose fetch is stubbed (tests/stub-fetch.mjs, nothing leaves the machine), so the
// push service's answers can be chosen per endpoint. Which subscriptions are forgotten, that a failing or slow push
// never delays a request, the endpoint's canonical spelling, the unsubscribe rate limit, a damaged VAPID file.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,picksFor,until,sleep,keys,FCM} from "./server-helpers.mjs";

const STUB="--import /w/tests/stub-fetch.mjs";
function server(port,{damaged=false}={}){
 const dir=mkdtempSync(join(tmpdir(),"pgpe-")),log=join(dir,"fetch.log");
 writeFileSync(log,"");
 if(damaged)writeFileSync(join(dir,"vapid.json"),"{not json");
 return {port,dir,log,async start(){this.proc=await boot(port,dir,{NODE_OPTIONS:STUB,STUB_FETCH_LOG:log});this.db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});}};
}
const fetched=s=>readFileSync(s.log,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l).url);
const subsOf=(s,name)=>s.db.prepare("SELECT endpoint FROM push_subs WHERE player_id=(SELECT id FROM players WHERE name=?) ORDER BY id").all(name).map(r=>r.endpoint);
const subscribe=(c,endpoint)=>c.call("POST","/api/push/subscribe",{endpoint,keys:keys()});
// a challenges b and plays a valid turn: the defender is notified. Returns the submit's answer and how long it took.
async function challenge(s,a,b){
 const ch=await a.call("POST","/api/duel",{op:"challenge",name:b.name});assert.equal(ch.status,200,JSON.stringify(ch.json));
 s.db.prepare("UPDATE duels SET c_started=c_started-2300 WHERE id=?").run(ch.json.duel.id);
 const t=Date.now(),r=await a.call("POST","/api/duel",{op:"submit",id:ch.json.duel.id,picks:picksFor(ch.json.duel.seed,a.camp)});
 return {r,ms:Date.now()-t};
}

const S=server(3914),T=server(3916,{damaged:true});
before(async()=>{await Promise.all([S.start(),T.start()]);});
after(async()=>{for(const s of [S,T]){try{s.db.close();}catch{}await stop(s.proc);}});

test("gone subscriptions (401, 403, 404, 410) are forgotten; 201, 429 and 500 are kept",async()=>{
 const p=S.port,c=await player(p,"Pousseur"),d1=await player(p,"Notifié Un"),d2=await player(p,"Notifié Deux");
 // Five devices at most per player: the seven answers are split over two defenders.
 const one=[201,410,404,401],two=[403,500,429];
 for(const st of one)assert.equal((await subscribe(d1,FCM+"status-"+st)).status,200);
 for(const st of two)assert.equal((await subscribe(d2,FCM+"status-"+st)).status,200);
 for(const d of [d1,d2]){const {r}=await challenge(S,c,d);assert.equal(r.status,200,JSON.stringify(r.json));}
 const all=[...one,...two].map(st=>FCM+"status-"+st);
 assert.ok(await until(()=>all.every(u=>fetched(S).includes(u))),"every subscription was pushed to: "+fetched(S).join(" "));
 assert.ok(await until(()=>subsOf(S,"Notifié Un").length===1&&subsOf(S,"Notifié Deux").length===2),JSON.stringify([subsOf(S,"Notifié Un"),subsOf(S,"Notifié Deux")]));
 await sleep(300);   // and nothing else goes later
 assert.deepEqual(subsOf(S,"Notifié Un"),[FCM+"status-201"]);
 assert.deepEqual(subsOf(S,"Notifié Deux"),[FCM+"status-500",FCM+"status-429"]);
 assert.ok(fetched(S).every(u=>u.startsWith(FCM)),"only the push service is called");
});

test("a push that throws or hangs never delays nor breaks the request, and the subscription is kept",async()=>{
 const p=S.port,c=await player(p,"Pressé Push"),d=await player(p,"Lointain");
 assert.equal((await subscribe(d,FCM+"throw")).status,200);
 assert.equal((await subscribe(d,FCM+"slow")).status,200);
 const {r,ms}=await challenge(S,c,d);
 assert.equal(r.status,200,JSON.stringify(r.json));
 assert.ok(ms<2000,`the submit took ${ms} ms`);
 assert.ok(await until(()=>[FCM+"throw",FCM+"slow"].every(u=>fetched(S).includes(u))));
 await sleep(300);
 assert.deepEqual(subsOf(S,"Lointain"),[FCM+"throw",FCM+"slow"]);
 const t=Date.now();assert.equal((await c.call("GET","/api/health")).status,200);assert.ok(Date.now()-t<1000);
});

test("endpoints are kept in one canonical spelling: host case and :443 do not make a second row",async()=>{
 const p=S.port,a=await player(p,"Canon"),b=await player(p,"Canonne");
 const upper="https://FCM.GOOGLEAPIS.COM:443/fcm/send/canon",lower=FCM+"canon";
 assert.equal((await subscribe(a,upper)).status,200);
 assert.deepEqual(subsOf(S,"Canon"),[lower]);
 assert.equal((await subscribe(a,lower)).status,200);
 assert.deepEqual(subsOf(S,"Canon"),[lower],"the same browser, one row");
 assert.equal((await subscribe(b,"https://fcm.googleapis.com:443/fcm/send/canon")).status,200);
 assert.deepEqual(subsOf(S,"Canon"),[]);assert.deepEqual(subsOf(S,"Canonne"),[lower],"it follows the new player");
 assert.equal((await b.call("POST","/api/push/unsubscribe",{endpoint:upper})).status,200);
 assert.deepEqual(subsOf(S,"Canonne"),[],"unsubscribed in any spelling");
});

test("unsubscribe has its own rate limit and refuses garbage with 400",async()=>{
 const p=S.port,a=await player(p,"Abonné Fou");
 for(let i=0;i<20;i++)assert.equal((await subscribe(a,FCM+"rl"+i)).status,200,`subscribe ${i+1}`);
 assert.equal((await subscribe(a,FCM+"rl-extra")).status,429);
 assert.equal(subsOf(S,"Abonné Fou").length,5);
 // Subscribing used up its bucket: unsubscribing still works.
 assert.equal((await a.call("POST","/api/push/unsubscribe",{endpoint:FCM+"rl19"})).status,200);
 assert.ok(!subsOf(S,"Abonné Fou").includes(FCM+"rl19"));
 for(const endpoint of [42,null,"not a url",{},"x".repeat(1001)]){
  const r=await a.call("POST","/api/push/unsubscribe",{endpoint});
  assert.equal(r.status,400,String(endpoint).slice(0,30));assert.equal(r.json.error,"Abonnement inconnu.");
 }
 assert.equal((await a.call("POST","/api/push/unsubscribe",{})).status,400);
 assert.equal(subsOf(S,"Abonné Fou").length,4);
});

test("a damaged vapid.json: a temporary key, and only 404/410 forget a subscription (401/403 are kept)",async()=>{
 const p=T.port,c=await player(p,"Clé Cassée"),d=await player(p,"Gardé");
 assert.equal(readFileSync(join(T.dir,"vapid.json"),"utf8"),"{not json","the file is left for a repair by hand");
 assert.equal(typeof (await d.call("GET","/api/duels")).json.pushKey,"string");
 for(const st of [401,403,404,410])assert.equal((await subscribe(d,FCM+"status-"+st)).status,200);
 const {r}=await challenge(T,c,d);assert.equal(r.status,200);
 assert.ok(await until(()=>subsOf(T,"Gardé").length===2),JSON.stringify(subsOf(T,"Gardé")));
 await sleep(300);
 assert.deepEqual(subsOf(T,"Gardé"),[FCM+"status-401",FCM+"status-403"]);
 assert.equal(fetched(T).length,4);
});
