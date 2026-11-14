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
