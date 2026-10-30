// Tests for web/politest.mjs, the political test for the undecided (sign-up and resignation): the drawing of the
// questions, the verdict and the random camp (node --test, no server, no DOM).
import {test} from "node:test";
import assert from "node:assert/strict";
import {TEST_QUESTIONS,TEST_SIZE,TEST_KINDS,drawTest,verdict,randomCamp} from "../web/politest.mjs";

// A small seeded generator (an LCG), so that a draw can be replayed.
const lcg=seed=>{let s=seed>>>0;return ()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32;};
const fixed=v=>()=>v;
const kinds=(l,r,n)=>[...Array(l).fill("left"),...Array(r).fill("right"),...Array(n).fill("none")];

test("every question has a question and three non-empty answers short enough for a button",()=>{
 assert.ok(TEST_QUESTIONS.length>=TEST_SIZE);
 for(const q of TEST_QUESTIONS){
  assert.equal(q.length,4,q[0]);
  for(const s of q)assert.ok(typeof s==="string"&&s.trim().length>0,q[0]);
  for(const a of q.slice(1))assert.ok(a.length<=60,`answer too long for a button (${a.length}): ${a}`);
  assert.equal(new Set(q.slice(1)).size,3,`two identical answers: ${q[0]}`);
 }
 assert.equal(new Set(TEST_QUESTIONS.map(q=>q[0])).size,TEST_QUESTIONS.length,"duplicate question");
 assert.deepEqual(TEST_KINDS,["left","right","none"]);
});

test("drawTest: five distinct questions, each answer kind exactly once, answers kept with their kind",()=>{
 for(let seed=1;seed<=300;seed++){
  const t=drawTest(lcg(seed));
  assert.equal(t.length,TEST_SIZE);
  assert.equal(new Set(t.map(x=>x.q)).size,TEST_SIZE);
  for(const {q,answers} of t){
   const src=TEST_QUESTIONS.find(x=>x[0]===q);assert.ok(src,q);
   assert.equal(answers.length,3);
   assert.deepEqual(answers.map(a=>a.kind).sort(),[...TEST_KINDS].sort());
   for(const a of answers)assert.equal(a.text,src[1+TEST_KINDS.indexOf(a.kind)]);
  }
 }
});

test("drawTest: deterministic with a seeded random, varied across seeds, n respected",()=>{
 assert.deepEqual(drawTest(lcg(42)),drawTest(lcg(42)));
 const firsts=new Set(),orders=new Set();
 for(let seed=1;seed<=200;seed++){const t=drawTest(lcg(seed));firsts.add(t[0].q);orders.add(t[0].answers.map(a=>a.kind).join());}
 assert.ok(firsts.size>TEST_QUESTIONS.length/2,"first question barely varies");
 assert.equal(orders.size,6,"answers are not shuffled into every order");
 assert.equal(drawTest(lcg(7),3).length,3);
 assert.equal(drawTest(lcg(7),TEST_QUESTIONS.length).length,TEST_QUESTIONS.length);
 assert.equal(drawTest().length,TEST_SIZE);              // Math.random by default
});

test("verdict: 5-0 for each camp",()=>{
 const l=verdict(kinds(5,0,0),fixed(0.9)),r=verdict(kinds(0,5,0),fixed(0.1));
 assert.deepEqual({...l,line:undefined},{camp:"left",left:5,right:0,none:0,tie:false,line:undefined});
 assert.deepEqual({...r,line:undefined},{camp:"right",left:0,right:5,none:0,tie:false,line:undefined});
 assert.match(l.line,/Huma/);assert.match(r.line,/Vosges/);
});

test("verdict: 4-1 and 4 with a way out are 'sans hésiter', 3-2 and 3 with ways out are 'plutôt'",()=>{
 assert.match(verdict(kinds(4,1,0)).line,/bien à gauche/);
 assert.match(verdict(kinds(1,4,0)).line,/ancré à droite/);
 assert.match(verdict(kinds(4,0,1)).line,/bien à gauche/);
 const a=verdict(kinds(3,2,0)),b=verdict(kinds(2,3,0)),c=verdict(kinds(3,0,2));
 assert.equal(a.camp,"left");assert.match(a.line,/Plutôt à gauche/);
 assert.equal(b.camp,"right");assert.match(b.line,/Plutôt à droite/);
 assert.equal(c.camp,"left");assert.equal(c.none,2);assert.match(c.line,/Plutôt à gauche/);
 // Mostly beside the point: a single answer is only a slight lean.
 for(const [k,camp] of [[kinds(1,0,4),"left"],[kinds(0,1,4),"right"]]){
  const v=verdict(k);assert.equal(v.camp,camp);assert.match(v.line,camp==="left"?/léger penchant à gauche/:/léger penchant à droite/);
 }
 assert.match(verdict(kinds(2,0,3)).line,/Plutôt à gauche/);
 // Order does not matter.
 assert.deepEqual(verdict(["right","left","none","right","left"],fixed(0.2)),verdict(kinds(2,2,1),fixed(0.2)));
});

test("verdict: a tie (ways out count for nobody) is a coin toss, and says so",()=>{
 for(const k of [kinds(2,2,1),kinds(1,1,3),kinds(0,0,5)]){
  const lo=verdict(k,fixed(0.1)),hi=verdict(k,fixed(0.9));
  assert.equal(lo.tie,true);assert.equal(hi.tie,true);
  assert.equal(lo.camp,"left");assert.equal(hi.camp,"right");
  assert.match(lo.line,/hasard/);assert.equal(lo.line,hi.line);
  assert.equal(lo.left+lo.right+lo.none,5);
 }
 const v=verdict(kinds(0,0,5),fixed(0.4));assert.equal(v.none,5);
 // A decided verdict never draws.
 let drew=0;verdict(kinds(3,1,1),()=>{drew++;return 0.5;});assert.equal(drew,0);
});

test("verdict: counts add up for every possible test",()=>{
 for(let l=0;l<=5;l++)for(let r=0;l+r<=5;r++){
  const v=verdict(kinds(l,r,5-l-r),fixed(0.3));
  assert.deepEqual([v.left,v.right,v.none],[l,r,5-l-r]);
  assert.equal(v.tie,l===r);
  if(l!==r)assert.equal(v.camp,l>r?"left":"right");
  assert.ok(typeof v.line==="string"&&v.line.length>0);
 }
});

test("randomCamp: both camps, roughly half each",()=>{
 assert.equal(randomCamp(fixed(0)),"left");assert.equal(randomCamp(fixed(0.999)),"right");
 const rnd=lcg(2026);let left=0;const n=10000;
 for(let i=0;i<n;i++)if(randomCamp(rnd)==="left")left++;
 assert.ok(left>n*0.45&&left<n*0.55,`left ${left}/${n}`);
 // The boundary, deterministic: below one half is left, from one half up is right.
 assert.equal(randomCamp(fixed(0.49)),"left");assert.equal(randomCamp(fixed(0.4999999)),"left");
 assert.equal(randomCamp(fixed(0.5)),"right");
 // Math.random by default, still one of the two camps.
 assert.ok(["left","right"].includes(randomCamp()));
});

test("verdict: fewer than five answers, or unknown kinds, never throw and still name a camp",()=>{
 for(const k of [[],["left"],["right","none"],["left","left","right"],["none","none"]]){
  const v=verdict(k,fixed(0.2));
  assert.ok(["left","right"].includes(v.camp),JSON.stringify(k));
  assert.equal(v.left+v.right+v.none,k.length);
  assert.ok(typeof v.line==="string"&&v.line.length>0);
 }
 assert.equal(verdict([],fixed(0.2)).tie,true);assert.equal(verdict([],fixed(0.2)).camp,"left");
 assert.equal(verdict(["left"]).camp,"left");assert.equal(verdict(["right","none"]).camp,"right");
 // Kinds the test never produces count as ways out, not as a camp.
 const odd=verdict(["left","bogus",null,undefined,42],fixed(0.9));
 assert.deepEqual([odd.camp,odd.left,odd.right,odd.none,odd.tie],["left",1,0,4,false]);
 const none=verdict(["?","?"],fixed(0.9));assert.equal(none.tie,true);assert.equal(none.camp,"right");
});
