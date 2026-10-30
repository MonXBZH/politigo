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
// Starts a mini-game at 10 h and ends it `ms` later with `score`.
function run(camp,start,ms,score){
 const S=game(camp);assert.ok(play(S,{type:start},10).ok);
 const xp0=S.xp,r=playMs(S,{type:"miniEnd",score},10,ms);
 return {S,r,gain:S.xp-xp0};
}

test("the contract: one mini-game per camp plus the debate, with the agreed numbers",()=>{
 assert.deepEqual(Object.keys(MINI),["debate","cortege","epervier"]);
 assert.deepEqual(MINI_RULES,{minSeconds:3,graceSeconds:75});
 assert.deepEqual([R.PONG_RULES.bonusCap,MINI.debate.bonusCap,MINI.cortege.bonusCap,MINI.epervier.bonusCap],[10,20,30,30]);
 for(const k of ["cortege","epervier"])assert.equal(Math.floor(MINI[k].great*MINI[k].bonusRate),MINI[k].bonusCap,`${k}: full bonus at the great score`);
 assert.equal(R.manifGame({camp:"left"}),"cortege");assert.equal(R.manifGame({camp:"right"}),"epervier");
 assert.equal(game().mini,null);
});

test("manifStart picks the camp's game and costs like an activity",()=>{
 for(const [camp,k] of [["left","cortege"],["right","epervier"]]){
  const S=game(camp),e0=S.energy,m0=S.moral;
  const r=play(S,{type:"manifStart"},10);
  assert.ok(r.ok);assert.equal(r.game,k);assert.equal(r.visit,true);
  assert.deepEqual(S.mini,{k,t:at(10)});assert.equal(S.pong,null);assert.equal(S.rematchT,-1);
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

test("debate keeps the rematch, starts the chrono game and drops the Pong",()=>{
 const S=game();play(S,{type:"pongStart"},10);assert.ok(S.pong);
 const r=play(S,{type:"debate"},10.2);
 assert.ok(r.ok);assert.deepEqual(S.mini,{k:"debate",t:at(10.2)});assert.equal(S.pong,null);
 assert.ok(S.rematchT>=0);assert.ok(play(S,{type:"rematch"},10.3).ok,"rematch still offered");
 assert.match(S.journal.find(j=>j.k==="act").text,/^Débat chrono : \+30 XP, énergie −8, moral \+10/);
 assert.equal(S.journal.find(j=>j.k==="act").d.kind,"debate");
});

test("pongStart clears the mini-game, and debate and manif clear the Pong",()=>{
 const S=game();play(S,{type:"manifStart"},10);assert.ok(S.mini);
 play(S,{type:"pongStart"},10.1);assert.equal(S.mini,null);assert.ok(S.pong);
 const T=game();play(T,{type:"pongStart"},10);play(T,{type:"manifStart"},10.1);assert.equal(T.pong,null);assert.ok(T.mini);
 const D=game();play(D,{type:"pongStart"},10);play(D,{type:"debate"},10.1);assert.equal(D.pong,null);assert.equal(D.mini.k,"debate");
});

test("miniEnd without a game fails; a result cannot be replayed",()=>{
 const S=game();
 assert.deepEqual(play(S,{type:"miniEnd",score:5},10),{ok:false,error:"Aucune partie en cours."});
 play(S,{type:"debate"},10);
 assert.ok(playMs(S,{type:"miniEnd",score:5},10,10000).ok);assert.equal(S.mini,null);
 assert.equal(playMs(S,{type:"miniEnd",score:5},10,11000).error,"Aucune partie en cours.");
 assert.equal(playMs(S,{type:"pongEnd",score:5},10,11000).error,"Aucun débat en cours.","pongEnd is unchanged");
});

test("a score that is too fast, too early or malformed is refused and consumes the game",()=>{
 // debate: 2.5 per second -> 10 s allows ceil(25)+1 = 26
 let x=run("left","debate",10000,27);assert.equal(x.r.error,"Score refusé.");assert.equal(x.gain,0);assert.equal(x.S.mini,null);
 assert.equal(playMs(x.S,{type:"miniEnd",score:1},10,12000).ok,false,"no second chance after a refusal");
 x=run("left","debate",10000,26);assert.ok(x.r.ok,"the limit itself passes");
 for(const score of [2.5,-1,61,"12",null,undefined,NaN,Infinity,[12],{},true]){
  const y=run("left","debate",15000,score);
  assert.equal(y.r.ok,false,`score=${String(score)}`);assert.equal(y.r.error,"Score refusé.");assert.equal(y.S.mini,null);assert.equal(y.gain,0);
 }
 x=run("left","debate",2900,1);assert.equal(x.r.ok,false,"under 3 s");
 x=run("left","debate",3000,1);assert.ok(x.r.ok,"exactly 3 s");
 x=run("left","manifStart",30000,401);assert.equal(x.r.ok,false,"above maxScore");
 x=run("right","manifStart",35000,151);assert.equal(x.r.ok,false,"above maxScore");
 x=run("right","manifStart",5000,12);assert.equal(x.r.ok,false,"5 s of Épervier allows 11");
 x=run("left","manifStart",10000,82);assert.equal(x.r.ok,false,"10 s of Cortège allows 81");
 x=run("left","debate",3000,20);assert.equal(x.r.ok,false,"no full debate bonus 3 s after the start");
});

test("valid scores give the right capped bonus for each game",()=>{
 const cases=[["left","debate",15000,12,12],["left","debate",15000,30,20],["left","debate",15000,0,0],["left","debate",15000,1,1],
  ["left","manifStart",30000,124,30],["left","manifStart",30000,50,12],["left","manifStart",30000,3,0],["left","manifStart",30000,4,1],["left","manifStart",30000,119,29],
  ["right","manifStart",35000,6,12],["right","manifStart",35000,14,28],["right","manifStart",35000,16,30],["right","manifStart",35000,0,0]];
 for(const [camp,start,ms,score,bonus] of cases){
  const {S,r,gain}=run(camp,start,ms,score);
  assert.ok(r.ok,`${camp} ${start} ${score}`);assert.equal(r.bonus,bonus,`${camp} ${start} ${score}`);assert.equal(gain,bonus);
  assert.equal(r.game,start==="debate"?"debate":R.manifGame(S));
 }
});

test("the journal text and the great flag",()=>{
 let {S}=run("left","debate",15000,1);
 assert.equal(S.journal[0].text,"Débat chrono : 1 argument dans la ligne, bonus d'éloquence +1 XP.");
 assert.deepEqual(S.journal[0].d,{game:"debate",score:1,bonus:1,great:false});assert.equal(S.journal[0].k,"mini");
 ({S}=run("left","debate",15000,18));
 assert.equal(S.journal[0].text,"Débat chrono : 18 arguments dans la ligne, bonus d'éloquence +18 XP.");assert.equal(S.journal[0].d.great,true);
 ({S}=run("left","debate",15000,17));assert.equal(S.journal[0].d.great,false);
 ({S}=run("left","manifStart",30000,120));
 assert.equal(S.journal[0].text,"Le Cortège : score 120, bonus de terrain +30 XP.");assert.equal(S.journal[0].d.great,true);
 ({S}=run("left","manifStart",30000,119));assert.equal(S.journal[0].d.great,false);
 ({S}=run("right","manifStart",35000,1));
 assert.equal(S.journal[0].text,"L'Épervier : 1 point, bonus d'ordre public +2 XP.");
 ({S}=run("right","manifStart",35000,15));
 assert.equal(S.journal[0].text,"L'Épervier : 15 points, bonus d'ordre public +30 XP.");assert.equal(S.journal[0].d.great,true);
 ({S}=run("right","manifStart",35000,14));assert.equal(S.journal[0].d.great,false);
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
 const T=game();play(T,{type:"debate"},10);
 assert.equal(playMs(T,{type:"miniEnd",score:5},10,91000).error,"Aucune partie en cours.","act() advances first");
});

test("sanitize keeps a valid mini-game and drops anything else",()=>{
 const now=at(10),base=R.newGame("left",now);
 for(const k of Object.keys(MINI))assert.deepEqual(R.sanitize({...base,mini:{k,t:now-1000}},now).mini,{k,t:now-1000});
 assert.deepEqual(R.sanitize({...base,mini:{k:"debate",t:now,extra:1}},now).mini,{k:"debate",t:now},"only k and t survive");
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
 const s=await c.act({type:"manifStart"});assert.equal(s.status,200);assert.equal(s.json.game,"cortege");
 const bad=await c.act({type:"miniEnd",score:400});
 assert.equal(bad.status,422);assert.equal(bad.json.error,"Score refusé.");
 assert.equal((await c.act({type:"debate"})).status,200);
 const early=await c.act({type:"miniEnd",score:1});
 assert.equal(early.status,422);assert.equal(early.json.error,"Score refusé.","under 3 s");
 assert.equal((await c.act({type:"miniEnd",score:1})).status,422,"consumed");
});

test("a great score is announced at most once per game hour, the bonus is still paid",()=>{
 const S=game("left");
 assert.ok(play(S,{type:"debate"},10).ok);assert.ok(playMs(S,{type:"miniEnd",score:18},10,16000).ok);
 assert.equal(S.journal[0].d.great,true);
 assert.ok(play(S,{type:"debate"},10.1).ok);const xp0=S.xp;assert.ok(playMs(S,{type:"miniEnd",score:19},10.1,16000).ok);
 assert.equal(S.journal[0].d.great,false,"a second one within the hour stays private");assert.equal(S.xp-xp0,19);
 full(S);assert.ok(play(S,{type:"debate"},12.2).ok);assert.ok(playMs(S,{type:"miniEnd",score:18},12.2,16000).ok);
 assert.equal(S.journal[0].d.great,true,"an hour later it is announced again");
});

test("over HTTP: a great score reaches the public feed, a small one does not",async()=>{
 const great=await signUp("10.4.0.2","Grande","right"),small=await signUp("10.4.0.3","Petit","right");
 assert.equal((await great.act({type:"manifStart"})).status,200);
 assert.equal((await small.act({type:"manifStart"})).status,200);
 await new Promise(r=>setTimeout(r,7200));   // 15 Épervier points need 7 s at a human pace
 const g=await great.act({type:"miniEnd",score:15}),p=await small.act({type:"miniEnd",score:3});
 assert.equal(g.status,200);assert.equal(g.json.bonus,30);assert.equal(p.status,200);assert.equal(p.json.bonus,6);
 const feed=(await great.call("GET","/api/board")).json.feed;
 const mine=feed.filter(f=>f.kind==="mini");
 assert.ok(mine.some(f=>f.player==="Grande"&&/^L'Épervier : 15 points/.test(f.text)),"great score published");
 assert.ok(!mine.some(f=>f.player==="Petit"),"small score stays private");
});
