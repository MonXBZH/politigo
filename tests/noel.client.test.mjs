// Trêve des confiseurs, the "noel" season: calendar window (1 December to 1 January, Paris) and the costumes.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {NOEL,HALLOWEEN,QUESTIONS,shop,eventAt,itemName,pongLine,debateCount,debateNew,isNoel}=R;
R.setTimeZone("Europe/Paris");
const paris=(y,mo,d,h=0,mi=0,s=0,ms=0)=>Date.UTC(y,mo-1,d,h-1,mi,s,ms);   // Paris is UTC+1 in winter

test("the Trêve des confiseurs follows the server's calendar",()=>{
 assert.equal(eventAt(Date.UTC(2026,10,30,22),"auto"),"");
 assert.equal(eventAt(paris(2026,11,30,23,59,59,999),"auto"),"");
 assert.equal(eventAt(paris(2026,12,1,0,0),"auto"),"noel");
 assert.equal(eventAt(paris(2026,12,25,12),"auto"),"noel");
 assert.equal(eventAt(paris(2027,1,1,23,59),"auto"),"noel");
 assert.equal(eventAt(paris(2027,1,2,0,0),"auto"),"");
 assert.equal(eventAt(paris(2026,10,31,12),"auto"),"halloween");
 const x=paris(2026,6,15,12);
 assert.equal(eventAt(x,"noel"),"noel");
 assert.equal(eventAt(x,"off"),"");
 assert.equal(eventAt(paris(2026,12,10),"off"),"");
 assert.ok(R.EVENT_MODES.includes("noel"));
 assert.equal(isNoel("noel"),true);
 assert.equal(isNoel("halloween"),false);
 assert.equal(isNoel(""),false);
});

test("costumes: same keys, both camps, only the names change",()=>{
 assert.deepEqual(Object.keys(NOEL.shop),Object.keys(HALLOWEEN.shop));
 assert.deepEqual(Object.keys(NOEL.shop).sort(),shop.map(i=>i.key).sort());
 for(const [k,v] of Object.entries(NOEL.shop)){
  assert.ok(v.left&&v.right,k);
 }
 assert.equal(itemName(shop[0],"left","noel"),"Pain d'épices de la coopé");
 assert.equal(itemName(shop[0],"right","noel"),"Brioche du boulanger du village");
 assert.equal(itemName(shop[0],"left","halloween"),HALLOWEEN.shop.bread.left);
 assert.equal(itemName(shop[0],"left",""),shop[0].left);
 assert.ok(NOEL.pong.left.length>=10);
 assert.ok(NOEL.pong.right.length>=10);
 // the two counts below only tell the themes apart while their question lists differ in length
 assert.notEqual(HALLOWEEN.questions.length,NOEL.questions.length);
 assert.equal(debateCount("noel"),QUESTIONS.length+NOEL.questions.length);
 assert.equal(debateCount("halloween"),QUESTIONS.length+HALLOWEEN.questions.length);
 assert.equal(debateCount(""),QUESTIONS.length);
});

test("the theme's texts: sleep, vœux, labels, questions",()=>{
 for(const c of ["left","right"]){assert.ok(NOEL.sleep[c]);assert.ok(NOEL.voeux[c]);}
 assert.deepEqual(NOEL.labels,{missions:{left:"Tournée des marchés de Noël solidaires",right:"Tournée des marchés de Noël du terroir"},
  mail:"Lettres au Père Noël",goals:"Bonnes résolutions",urn:{left:"La Tombola du réveillon",right:"La Loterie du gala de Noël"}});
 for(const q of NOEL.questions){assert.equal(q.length,4);assert.ok(q.every(s=>typeof s==="string"&&s));}
 const all=JSON.stringify(NOEL);
 assert.ok(!/bâton|ultra/i.test(all));
});

test("pongLine in costume draws from the noel lines about half the time",()=>{
 assert.ok(NOEL.pong.left.includes(pongLine("left","noel",()=>0)));
 assert.ok(R.pongLines.left.includes(pongLine("left","noel",()=>0.99)));
 assert.ok(R.pongLines.left.includes(pongLine("left","",()=>0)));
});

test("the solo debate draws its extra questions from the right costume",()=>{
 for(const ev of ["noel","halloween"]){
  const count=debateCount(ev),st=debateNew(5,"left",{count});
  assert.equal(st.count,count);
  const seen=new Set();
  for(let seed=0;seed<400;seed++){
   const s=debateNew(seed,"left",{count});
   const r=R.debateReveal(s,1000);seen.add(r.text);
  }
  const extra=(ev==="noel"?NOEL:HALLOWEEN).questions.map(q=>q[0]);
  const other=(ev==="noel"?HALLOWEEN:NOEL).questions.map(q=>q[0]);
  assert.ok(extra.some(t=>seen.has(t)),ev);
  assert.ok(!other.some(t=>seen.has(t)),ev+" leaks the other costume");
 }
});

// ---------- the Advent calendar
const atAdvent=(y,mo,d,h=10,mi=0)=>{const now=paris(y,mo,d,h,mi),S=R.newGame("left",now);return {S,now};};
const openAt=(S,now,event="noel")=>R.act(S,{type:"advent"},{now,event});

test("advent: today's box once, gauges or bulletins, never FM",()=>{
 const {S,now}=atAdvent(2026,12,7);
 S.moral=50;S.fm=10;const xp=S.xp;
 const gift=R.ADVENT[6];assert.equal(gift.k,"moral");
 const r=openAt(S,now);
 assert.equal(r.ok,true);assert.equal(r.day,7);assert.deepEqual(r.gift,gift);
 assert.equal(S.fm,10);assert.equal(S.moral,50+gift.n);assert.equal(S.xp,xp);
 assert.deepEqual(S.advent,{y:2026,opened:[7]});
 const again=openAt(S,now);
 assert.equal(again.ok,false);assert.match(again.error,/déjà/);
 assert.equal(S.moral,50+gift.n);
 // a bulletins box
 const b=atAdvent(2026,12,3);const before=b.S.wardrobe.bulletins;
 assert.deepEqual(R.ADVENT[2],{k:"bulletins",n:1});
 assert.equal(openAt(b.S,b.now).ok,true);assert.equal(b.S.wardrobe.bulletins,before+1);assert.equal(b.S.fm,10);
 const c=atAdvent(2026,12,6);assert.deepEqual(R.ADVENT[5],{k:"bulletins",n:2});
 c.S.wardrobe.bulletins=9999;openAt(c.S,c.now);assert.equal(c.S.wardrobe.bulletins,9999);
});

test("advent: the table follows the plan",()=>{
 assert.equal(R.ADVENT.length,24);
 const cycle=[["moral",8],["energy",8],["bulletins",1],["sat",8],["hyg",8],["bulletins",2]];
 for(let i=0;i<23;i++)assert.deepEqual(R.ADVENT[i],{k:cycle[i%6][0],n:cycle[i%6][1]},String(i+1));
 assert.deepEqual(R.ADVENT[23],{k:"all",n:5,bulletins:3});
});

test("advent: a missed day stays shut, the 24th pays the big box, nothing after",()=>{
 const a=atAdvent(2026,12,2);assert.equal(openAt(a.S,a.now).ok,true);
 const d5=paris(2026,12,5,10);a.S.vclock=d5;a.S.lastReal=d5;a.S.hourIdx=Math.floor(d5/36e5);
 assert.equal(openAt(a.S,d5).ok,true);
 assert.deepEqual(a.S.advent.opened,[2,5]);
 const {S,now}=atAdvent(2026,12,24);
 S.sat=S.moral=S.energy=S.hyg=98;const b0=S.wardrobe.bulletins;
 const r=openAt(S,now);
 assert.equal(r.ok,true);assert.equal(r.day,24);
 assert.equal(S.wardrobe.bulletins,b0+3);
 for(const k of ["sat","moral","energy","hyg"])assert.equal(S[k],100,k);
 assert.equal(S.fm,10);
 const e=atAdvent(2026,12,25);const late=openAt(e.S,e.now);
 assert.equal(late.ok,false);assert.match(late.error,/Le calendrier est fini/);
 const o=atAdvent(2026,6,15);const no=openAt(o.S,o.now,"");
 assert.equal(no.ok,false);assert.match(no.error,/pas de calendrier/);
 assert.equal(R.adventBlock(o.S,"halloween")!=="",true);
 assert.equal(R.adventBlock(e.S,"noel"),"Le calendrier est fini : rendez-vous à la Saint-Sylvestre.");
 assert.match(R.adventBlock(o.S,"noel"),/pas de calendrier/);   // the theme forced in June: no calendar, not « fini »
 assert.match(R.adventBlock(atAdvent(2027,1,1).S,"noel"),/Le calendrier est fini/);
 assert.match(R.adventBlock(atAdvent(2027,1,2).S,"noel"),/pas de calendrier/);   // forced past the 1st of January
});

test("advent: 23:59 and 00:00 are two days; a new year starts empty",()=>{
 const {S,now}=atAdvent(2026,12,10,23,59);
 assert.equal(openAt(S,now).ok,true);
 assert.equal(openAt(S,now).ok,false);
 const next=paris(2026,12,11,0,0);
 const r=openAt(S,next);
 assert.equal(r.ok,true);assert.equal(r.day,11);
 assert.deepEqual(S.advent.opened,[10,11]);
 const n=atAdvent(2026,12,1);n.S.advent={y:2025,opened:Array.from({length:24},(_,i)=>i+1)};
 const r2=openAt(n.S,n.now);
 assert.equal(r2.ok,true);assert.deepEqual(n.S.advent,{y:2026,opened:[1]});
});

test("sanitize keeps a valid advent and drops a forged one",()=>{
 const now=paris(2026,12,7);
 const base=R.newGame("left",now);
 const clean=(advent)=>R.sanitize({...JSON.parse(JSON.stringify(base)),advent},now).advent;
 assert.deepEqual(clean({y:2026,opened:[1,3,24]}),{y:2026,opened:[1,3,24]});
 assert.deepEqual(clean({y:2026,opened:[0,3,25,3,-1,1.5,"4",null,7]}),{y:2026,opened:[3,7]});
 assert.deepEqual(clean({y:2026.5,opened:[1]}),{y:0,opened:[]});
 assert.deepEqual(clean({y:"2026",opened:[1]}),{y:0,opened:[]});
 assert.deepEqual(clean(undefined),{y:0,opened:[]});
 assert.deepEqual(clean({y:2026,opened:"all"}),{y:2026,opened:[]});
 assert.deepEqual(R.freshState("left",now).advent,{y:0,opened:[]});
});
