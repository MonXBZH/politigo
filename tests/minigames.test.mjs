// Tests for the browser mini-games (Débat chrono, Le Cortège, L'Épervier): rules level, then over HTTP (node --test).
// Ports 3940-3942 are reserved here (3940 is used).
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";

const {H,XP,MINI,MINI_RULES}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris (winter, UTC+1)
const at=h=>MIDNIGHT+h*H;
const noRandom=()=>0.99;
const game=(camp="left",h=10)=>R.newGame(camp,at(h));
const play=(S,a,h,random=noRandom)=>R.act(S,a,{now:at(h),random});
const playMs=(S,a,h,ms)=>R.act(S,a,{now:at(h)+ms,random:noRandom});
const full=S=>{S.sat=S.moral=S.energy=S.hyg=100;return S;};
// Starts a Manif at 10 h and ends it `ms` later with `score` (and the game's own id).
function run(camp,ms,score){
 const S=game(camp),s=play(S,{type:"manifStart"},10);assert.ok(s.ok);
 const xp0=S.xp,r=playMs(S,{type:"miniEnd",score,id:s.game.id},10,ms);
 return {S,r,gain:S.xp-xp0};
}

test("the contract: one mini-game per camp plus the debate, with the agreed numbers",()=>{
 assert.deepEqual(Object.keys(MINI),["debate","cortege","epervier"]);
 assert.deepEqual(MINI_RULES,{minSeconds:3,graceSeconds:75,tolerance:0.5});
 assert.deepEqual([R.PONG_RULES.bonusCap,MINI.debate.bonusCap,MINI.cortege.bonusCap,MINI.epervier.bonusCap],[10,20,30,30]);
 assert.deepEqual([MINI.debate.maxScore,R.PONG_RULES.maxScore,MINI.cortege.maxScore,MINI.epervier.maxScore],[30,25,250,60],"hard caps");
 for(const k of ["cortege","epervier"]){
  assert.equal(Math.floor(MINI[k].great*MINI[k].bonusRate),MINI[k].bonusCap,`${k}: full bonus at the great score`);
  assert.ok(MINI[k].great<MINI[k].suspect&&MINI[k].suspect<MINI[k].maxScore,`${k}: great < suspect < cap`);
 }
 assert.equal(R.manifGame({camp:"left"}),"cortege");assert.equal(R.manifGame({camp:"right"}),"epervier");
 assert.equal(game().mini,null);
});

test("manifStart picks the camp's game, deals a seed and an id, and costs like an activity",()=>{
 for(const [camp,k] of [["left","cortege"],["right","epervier"]]){
  const S=game(camp),e0=S.energy,m0=S.moral;
  const r=play(S,{type:"manifStart"},10);
  assert.ok(r.ok);assert.equal(r.game.k,k);assert.equal(r.visit,true);
  assert.ok(Number.isInteger(r.game.seed)&&r.game.seed>=0&&r.game.seed<2**32);assert.match(r.game.id,/^[0-9a-z]{1,16}$/);
  assert.deepEqual(S.mini,{k,t:at(10),seed:r.game.seed,id:r.game.id});assert.equal(S.pong,null);assert.equal(S.rematchT,-1);
  assert.equal(S.xp,XP.visit+XP.activity,"visit + activity");
  assert.equal(S.energy,e0-8);assert.equal(S.moral,Math.min(100,m0+10));assert.equal(R.actsToday(S),1);
  assert.deepEqual(S.journal[0].d,{kind:"manif",game:k,visit:true});
  assert.equal(S.journal[0].text,`${MINI[k].label} : +${XP.activity} XP, visite +${XP.visit} XP.`);
 }
 const S=game();play(S,{type:"manifStart"},10);
 const r=play(S,{type:"manifStart"},10.1);assert.ok(r.ok);assert.equal(r.visit,false);
 assert.equal(S.journal[0].text,"Le Cortège : +30 XP.");
});

test("manifStart is refused at night, when tired and after 8 activities, and cancels the rematch",()=>{
 const N=game("left",3);
 assert.match(play(N,{type:"manifStart"},3).error,/Chut/);assert.equal(N.mini,null);
 const T=game();T.energy=19;
 assert.match(play(T,{type:"manifStart"},10).error,/fatigué/);assert.equal(T.mini,null);
 const Z=game();Z.sleeping=true;
 assert.match(play(Z,{type:"manifStart"},10).error,/sieste/);
 const S=game();
 for(let i=0;i<8;i++){full(S);assert.ok(play(S,{type:"manifStart"},10+Math.floor(i/2)*2.01+(i%2)*0.1).ok,`activity ${i+1}`);}
 full(S);const r=play(S,{type:"manifStart"},10+4*2.01);
 assert.equal(r.ok,false);assert.match(r.error,/Huit activités|nuit|Chut/);
 const D=game();play(D,{type:"debate"},10);assert.ok(D.rematchT>=0);
 play(D,{type:"manifStart"},10.2);assert.equal(D.rematchT,-1);
});

test("debate keeps the rematch, opens a refereed game without its seed, and drops the Pong",()=>{
 const S=game();play(S,{type:"pongStart"},10);assert.ok(S.pong);
 const r=play(S,{type:"debate"},10.2);
 assert.ok(r.ok);assert.deepEqual(S.mini,{k:"debate",t:at(10.2),id:r.game.id});assert.equal(S.pong,null);
 assert.deepEqual(r.game,{k:"debate",id:r.game.id},"no seed for the browser");
 assert.ok(r.turn&&r.turn.id===r.game.id&&r.turn.camp==="left","the server's turn");
 assert.ok(!Object.keys(r).includes("turn")&&!("turn" in JSON.parse(JSON.stringify({...r}))),"the turn never reaches a reply");
 assert.ok(S.rematchT>=0);assert.ok(play(S,{type:"rematch"},10.3).ok,"rematch still offered");
 assert.match(S.journal.find(j=>j.k==="act").text,/^Débat chrono : \+30 XP, énergie −8, moral \+10/);
 assert.equal(S.journal.find(j=>j.k==="act").d.kind,"debate");
});

test("pongStart clears the mini-game, and debate and manif clear the Pong",()=>{
 const S=game();play(S,{type:"manifStart"},10);assert.ok(S.mini);
 const p=play(S,{type:"pongStart"},10.1);assert.equal(S.mini,null);assert.deepEqual(S.pong,{t:at(10.1),seed:p.game.seed,id:p.game.id});
 assert.equal(p.game.k,"pong");
 const T=game();play(T,{type:"pongStart"},10);play(T,{type:"manifStart"},10.1);assert.equal(T.pong,null);assert.ok(T.mini);
 const D=game();play(D,{type:"pongStart"},10);play(D,{type:"debate"},10.1);assert.equal(D.pong,null);assert.equal(D.mini.k,"debate");
});

test("miniEnd without a game fails; a result cannot be replayed; the debate's score never comes from the browser",()=>{
 const S=game();
 assert.deepEqual(play(S,{type:"miniEnd",score:5},10),{ok:false,error:"Aucune partie en cours."});
 const s=play(S,{type:"manifStart"},10);
 assert.ok(playMs(S,{type:"miniEnd",score:5,id:s.game.id},10,10000).ok);assert.equal(S.mini,null);
 assert.equal(playMs(S,{type:"miniEnd",score:5,id:s.game.id},10,11000).error,"Aucune partie en cours.");
 assert.equal(playMs(S,{type:"pongEnd",score:5},10,11000).error,"Aucun débat en cours.");
 const D=game(),d=play(D,{type:"debate"},10);
 const r=playMs(D,{type:"miniEnd",score:5,id:d.game.id},10,16000);
 assert.equal(r.ok,false);assert.equal(r.error,"Score refusé.");assert.equal(D.mini,null,"consumed");
 assert.deepEqual(r.audit.flags,["hors_arbitre"]);
});

test("a score that is too fast, too early, over the cap, malformed or for another game is refused and consumes it",()=>{
 // Épervier: 2 a second over the time played (+0.5 s of tolerance): 5 s allows ceil(11)+1 = 12.
 let x=run("right",5000,13);assert.equal(x.r.error,"Score refusé.");assert.equal(x.gain,0);assert.equal(x.S.mini,null);
 assert.deepEqual(x.r.audit.flags,["trop_rapide"]);
 assert.equal(playMs(x.S,{type:"miniEnd",score:1},10,12000).ok,false,"no second chance after a refusal");
 x=run("right",5000,12);assert.ok(x.r.ok,"the limit itself passes");
 for(const score of [2.5,-1,"12",null,undefined,NaN,Infinity,[12],{},true]){
  const y=run("left",30000,score);
  assert.equal(y.r.ok,false,`score=${String(score)}`);assert.equal(y.r.error,"Score refusé.");assert.equal(y.S.mini,null);assert.equal(y.gain,0);
  assert.deepEqual(y.r.audit.flags,["invalide"]);assert.equal(y.r.audit.score,Number.isInteger(score)?score:null);
 }
 x=run("left",2900,1);assert.equal(x.r.ok,false,"under 3 s");
 x=run("left",3000,1);assert.ok(x.r.ok,"exactly 3 s");
 x=run("left",30000,251);assert.equal(x.r.ok,false,"above the Cortège's cap");assert.deepEqual(x.r.audit.flags,["plafond"]);
 x=run("right",35000,61);assert.equal(x.r.ok,false,"above the Épervier's cap");
 x=run("left",10000,86);assert.equal(x.r.ok,false,"10 s of Cortège allows ceil(10.5*8)+1 = 85");
 x=run("left",10000,85);assert.ok(x.r.ok);
 // The waiting time never raises the cap: 75 s after a Cortège start is still 30 s of play.
 x=run("left",75000,242);assert.equal(x.r.ok,false,"30 s of Cortège allows 241, however long the wait");
 x=run("left",75000,241);assert.ok(x.r.ok);
 // The wrong id (or none) is refused even with a sensible score.
 for(const id of [undefined,"","zzzz",5]){
  const S=game("right");play(S,{type:"manifStart"},10);
  const r=playMs(S,{type:"miniEnd",score:3,id},10,20000);
  assert.equal(r.ok,false);assert.deepEqual(r.audit.flags,["id_inconnu"]);assert.equal(S.mini,null);
 }
});

test("valid scores give the right capped bonus for each game, with an audit",()=>{
 const cases=[["left",30000,124,30],["left",30000,50,12],["left",30000,3,0],["left",30000,4,1],["left",30000,119,29],
  ["right",35000,6,12],["right",35000,14,28],["right",35000,16,30],["right",35000,0,0]];
 for(const [camp,ms,score,bonus] of cases){
  const {S,r,gain}=run(camp,ms,score);
  assert.ok(r.ok,`${camp} ${score}`);assert.equal(r.bonus,bonus,`${camp} ${score}`);assert.equal(gain,bonus);
  assert.equal(r.game,R.manifGame(S));
  assert.deepEqual(r.audit,{game:R.manifGame(S),score,secs:ms/1000,flags:[]});
  assert.ok(!Object.keys(r).includes("audit"),"the audit stays on the server");
 }
 // Near the cap: paid, but flagged for the admin.
 const {r}=run("left",30000,MINI.cortege.suspect);assert.ok(r.ok);assert.deepEqual(r.audit.flags,["plafond"]);
});

test("the journal text and the great flag",()=>{
 let {S}=run("left",30000,120);
 assert.equal(S.journal[0].text,"Le Cortège : score 120, bonus de terrain +30 XP.");assert.equal(S.journal[0].d.great,true);
 ({S}=run("left",30000,119));assert.equal(S.journal[0].d.great,false);
 ({S}=run("left",30000,MINI.cortege.suspect));assert.equal(S.journal[0].d.great,false,"a flagged score is never announced");
 ({S}=run("right",35000,1));
 assert.equal(S.journal[0].text,"L'Épervier : 1 point, bonus d'ordre public +2 XP.");
 ({S}=run("right",35000,15));
 assert.equal(S.journal[0].text,"L'Épervier : 15 points, bonus d'ordre public +30 XP.");assert.equal(S.journal[0].d.great,true);
 ({S}=run("right",35000,14));assert.equal(S.journal[0].d.great,false);
});

test("an abandoned mini-game expires after its duration plus the grace period",()=>{
 for(const [camp,start,k] of [["left","debate","debate"],["left","manifStart","cortege"],["right","manifStart","epervier"]]){
  const S=game(camp);play(S,{type:start},10);
  const limit=(MINI[k].ms/1000+MINI_RULES.graceSeconds)*1000;
  R.advance(S,at(10)+limit,1,noRandom);assert.ok(S.mini,`${k} still valid at the limit`);
  R.advance(S,at(10)+limit+1,1,noRandom);assert.equal(S.mini,null,`${k} expired`);
 }
 const S=game();play(S,{type:"debate"},10);
 R.resync(S,at(10)+(15+75)*1000+1);assert.equal(S.mini,null,"resync drops it too");
 const T=game();const t=play(T,{type:"manifStart"},10);
 assert.equal(playMs(T,{type:"miniEnd",score:5,id:t.game.id},10,106000).error,"Aucune partie en cours.","act() advances first");
});

test("sanitize keeps a valid mini-game (seed, id) and drops anything else",()=>{
 const now=at(10),base=R.newGame("left",now);
 for(const k of Object.keys(MINI))assert.deepEqual(R.sanitize({...base,mini:{k,t:now-1000}},now).mini,{k,t:now-1000});
 assert.deepEqual(R.sanitize({...base,mini:{k:"debate",t:now,extra:1,id:"abc1"}},now).mini,{k:"debate",t:now,id:"abc1"},"only k, t, seed and id survive");
 assert.deepEqual(R.sanitize({...base,mini:{k:"cortege",t:now,seed:-1,id:"<x>"}},now).mini,{k:"cortege",t:now},"bad seed and id dropped");
 assert.deepEqual(R.sanitize({...base,pong:{t:now,seed:7,id:"p1",x:1}},now).pong,{t:now,seed:7,id:"p1"});
 for(const bad of [{k:"__proto__",t:1},{k:"debate",t:"x"},{k:"pong",t:1},{k:"toString",t:1},{k:"debate"},{k:5,t:1},"debate",[],null,undefined,{t:1}])
  assert.equal(R.sanitize({...base,mini:bad},now).mini,null,JSON.stringify(bad));
 assert.equal(R.sanitize({...base},now).mini,null);
 const S=game();play(S,{type:"manifStart"},10);
 assert.deepEqual(R.sanitize(JSON.parse(JSON.stringify(S)),at(10)).mini,S.mini,"JSON round trip");
});

test("a death clears the mini-game",()=>{
 const S=game();play(S,{type:"debate"},10);assert.ok(S.mini);
 S.sat=S.moral=S.energy=S.hyg=0;
 R.advance(S,at(10)+13*H,1,noRandom);
 assert.equal(S.deaths,1);assert.equal(S.mini,null);
 const T=game();play(T,{type:"manifStart"},10);
 assert.ok(play(T,{type:"restart",camp:"right"},12).ok);assert.equal(T.mini,null);
});

test("a great score is announced at most once per game hour, the bonus is still paid",()=>{
 const S=game("right");
 let s=play(S,{type:"manifStart"},10);assert.ok(R.act(S,{type:"miniEnd",score:15,id:s.game.id},{now:at(10)+36000,random:noRandom}).ok);
 assert.equal(S.journal[0].d.great,true);
 s=play(S,{type:"manifStart"},10.1);const xp0=S.xp;assert.ok(R.act(S,{type:"miniEnd",score:16,id:s.game.id},{now:at(10.1)+36000,random:noRandom}).ok);
 assert.equal(S.journal[0].d.great,false,"a second one within the hour stays private");assert.equal(S.xp-xp0,30);
 full(S);s=play(S,{type:"manifStart"},12.2);assert.ok(R.act(S,{type:"miniEnd",score:15,id:s.game.id},{now:at(12.2)+36000,random:noRandom}).ok);
 assert.equal(S.journal[0].d.great,true,"an hour later it is announced again");
});

// ------------------------------------------------------------------ over HTTP
const INVITE="code-secret-de-test-123",PORT=3940,BASE=`http://127.0.0.1:${PORT}`;
const off=((14-new Date().getUTCHours()+36)%24)-12,DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
let DIR,proc;
function boot(port){
 const env={...process.env,PORT:String(port),DB_PATH:join(DIR,`${port}.db`),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",
  PROXY_HOPS:"1",SWEEP_MS:"200",POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ};
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(code));});
}
before(async()=>{DIR=mkdtempSync(join(tmpdir(),"pg-mini-"));proc=await boot(PORT);});
after(()=>proc.kill("SIGTERM"));
function client(ip){
 let cookie="";
 const call=async(method,path,body)=>{
  const r=await fetch(BASE+path,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {call,act:a=>call("POST","/api/action",a)};
}
const signUp=async(ip,name,camp)=>{const c=client(ip);await c.call("POST","/api/register",{name,password:"motdepasse1",invite:INVITE,camp});return c;};

test("over HTTP: an impossible or too-early score is refused, and the game is consumed",async()=>{
 const c=await signUp("10.4.0.1","Mina","left");
 assert.equal((await c.act({type:"miniEnd",score:1})).status,422,"no game started");
 const s=await c.act({type:"manifStart"});assert.equal(s.status,200);assert.equal(s.json.game.k,"cortege");
 assert.ok(Number.isInteger(s.json.game.seed));assert.equal(typeof s.json.game.id,"string");
 const bad=await c.act({type:"miniEnd",score:400,id:s.json.game.id});
 assert.equal(bad.status,422);assert.equal(bad.json.error,"Score refusé.");assert.equal(bad.json.audit,undefined,"no audit for the browser");
 const d=await c.act({type:"debate"});assert.equal(d.status,200);
 assert.equal(d.json.game.seed,undefined,"the debate's seed stays on the server");assert.equal(d.json.turn,undefined);
 const early=await c.act({type:"miniEnd",score:1,id:d.json.game.id});
 assert.equal(early.status,422,"the debate is refereed, its score never sent");
 assert.equal((await c.act({type:"miniEnd",score:1})).status,422,"consumed");
});

test("over HTTP: a great score reaches the public feed, a small one does not",async()=>{
 const great=await signUp("10.4.0.2","Grande","right"),small=await signUp("10.4.0.3","Petit","right");
 const a=await great.act({type:"manifStart"}),b=await small.act({type:"manifStart"});
 assert.equal(a.status,200);assert.equal(b.status,200);
 await new Promise(r=>setTimeout(r,7200));   // 15 Épervier points need 7 s at a human pace
 const g=await great.act({type:"miniEnd",score:15,id:a.json.game.id}),p=await small.act({type:"miniEnd",score:3,id:b.json.game.id});
 assert.equal(g.status,200);assert.equal(g.json.bonus,30);assert.equal(p.status,200);assert.equal(p.json.bonus,6);
 const feed=(await great.call("GET","/api/board")).json.feed;
 const mine=feed.filter(f=>f.kind==="mini");
 assert.ok(mine.some(f=>f.player==="Grande"&&/^L'Épervier : 15 points/.test(f.text)),"great score published");
 assert.ok(!mine.some(f=>f.player==="Petit"),"small score stays private");
});
