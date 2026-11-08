// The letterbox (1.7.1, web/activities.mjs): letters on a calendar of their own, a box of 3, at most 2 bulletins a
// day from the mail, a Flamme still in reach with 3 or 4 visits, and 1.7.0 states carried over (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";
import * as A from "../web/activities.mjs";

const {H}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris on 2026-01-05 (winter, UTC+1)
const D1=20260105,D2=20260106;
const at=h=>MIDNIGHT+h*H;
const never=()=>0.99;
const full=S=>{S.sat=S.moral=S.energy=S.hyg=100;return S;};
function game(camp="left",h=10){const S=R.newGame(camp,at(h));R.advance(S,at(h),1,never);return full(S);}
const play=(S,a,h,random=never)=>R.act(S,a,{now:at(h),random});
const slotH=(S,i,d=D1)=>A.mailSlot(S.mail.cal,d,i)/60+(d===D2?24:0);   // slot i of day d, in hours from D1's midnight
const answerAll=(S,h)=>{let n=0;while(S.mail.letter){assert.ok(play(S,{type:"mailAnswer",id:S.mail.letter.id,choice:0},h).ok);n++;}return n;};

test("the calendar: 22 letters from 7:00, about every 45 min, the same for a seed and a day, another one elsewhere",()=>{
 for(const seed of [0,1,12345,2**32-1]){
  const s=Array.from({length:A.MAIL.slots},(_,i)=>A.mailSlot(seed,D1,i));
  assert.ok(s[0]>=7*60&&s.at(-1)<23*60+15,"7:00 to 23:15");
  for(let i=1;i<s.length;i++){const g=s[i]-s[i-1];assert.ok(g>=15&&g<=75,`gap ${g}`);}
  assert.deepEqual(s,Array.from({length:A.MAIL.slots},(_,i)=>A.mailSlot(seed,D1,i)),"deterministic");
  assert.equal(A.mailDue(seed,D1,7*60-1),0);assert.equal(A.mailDue(seed,D1,24*60-1),A.MAIL.slots);
  assert.equal(A.mailDue(seed,D1,s[3]),4);assert.equal(A.mailDue(seed,D1,s[3]-1),3);
 }
 const days=[D1,D2].map(d=>Array.from({length:A.MAIL.slots},(_,i)=>A.mailSlot(7,d,i)).join());
 assert.notEqual(days[0],days[1],"each day its own");
 assert.notEqual(Array.from({length:8},(_,i)=>A.mailSlot(7,D1,i)).join(),Array.from({length:8},(_,i)=>A.mailSlot(8,D1,i)).join(),"each player its own");
 const a=R.newGame("left",at(10)),b=R.newGame("left",at(10)+1234);assert.ok(Number.isInteger(a.mail.cal));assert.notEqual(a.mail.cal,b.mail.cal);
});

test("letters come on time answered or not, the box holds 3, the next ones are lost; answering empties it one at a time",()=>{
 const S=game("left",6);assert.equal(S.mail.k,0);
 R.advance(S,at(6.99),1,never);assert.equal(A.lettersWaiting(S),0,"nothing before 7:00");
 R.advance(S,at(slotH(S,0))-1,1,never);assert.equal(S.mail.letter,null,"not before its minute");
 R.advance(S,at(slotH(S,0)),1,never);assert.equal(A.lettersWaiting(S),1);assert.equal(S.mail.letter.t,at(slotH(S,0)));
 R.advance(S,at(slotH(S,2)),1,never);assert.equal(A.lettersWaiting(S),3,"unanswered, they pile up");
 assert.deepEqual(S.mail.queue.map(q=>q.t),[at(slotH(S,1)),at(slotH(S,2))],"each with its own time");
 const ids=[S.mail.letter.id,...S.mail.queue.map(q=>q.id)];assert.equal(new Set(ids).size,3,"no twins");
 assert.ok(ids.every(id=>A.LETTERS.left.some(l=>l.id===id)));
 R.advance(S,at(slotH(S,5)),1,never);assert.equal(A.lettersWaiting(S),3,"full: the next ones are lost");assert.equal(S.mail.k,6);
 const head=S.mail.queue[0].id;
 assert.ok(play(S,{type:"mailAnswer",id:S.mail.letter.id,choice:0},slotH(S,5)).ok);
 assert.equal(A.lettersWaiting(S),2);assert.equal(S.mail.letter.id,head,"the next one shows");
 assert.match(play(S,{type:"mailAnswer",id:S.mail.queue[0].id,choice:0},slotH(S,5)).error,/Pas de lettre/,"the one shown first");
 assert.equal(answerAll(S,slotH(S,5)),2);assert.equal(A.lettersWaiting(S),0);
 R.advance(S,at(slotH(S,6)),1,never);assert.equal(A.lettersWaiting(S),1,"the calendar goes on");
});

test("a day's letters not seen before midnight are in the box in the morning, then the new day's",()=>{
 const S=game("right",22);answerAll(S,22);assert.equal(A.lettersWaiting(S),0);const k=S.mail.k;assert.ok(k<A.MAIL.slots);
 R.advance(S,at(24+6.5),1,never);
 assert.equal(A.lettersWaiting(S),Math.min(3,A.MAIL.slots-k));assert.ok(S.mail.letter.t<at(24),"yesterday's");
 assert.equal(S.mail.sd,D2);assert.equal(S.mail.k,0);
 const N=game("right",23.5);assert.equal(N.mail.k,A.MAIL.slots);
 R.advance(N,at(24+6.9),1,never);assert.equal(N.mail.letter,null,"quiet at night");
 R.advance(N,at(slotH(N,0,D2)),1,never);assert.ok(N.mail.letter);assert.ok(A.LETTERS.right.some(l=>l.id===N.mail.letter.id));
});

test("the mail pays at most 2 bulletins a day, every 3rd letter; the gauges always; the cap restarts at midnight",()=>{
 const S=game("left",10);S.goals.list=[];const b0=S.wardrobe.bulletins;
 const one=h=>{S.mail.letter={id:"l_velo",t:at(h)};S.moral=50;const r=play(S,{type:"mailAnswer",id:"l_velo",choice:0},h);assert.equal(S.moral,56,"its gauges");return r.bulletin;};
 const paid=[];for(let n=1;n<=12;n++)paid.push(one(10));
 assert.deepEqual(paid.map((b,i)=>b?i+1:0).filter(Boolean),[3,6],"the 3rd and 6th only");
 assert.equal(S.wardrobe.bulletins,b0+2);assert.equal(S.mail.b,2);assert.equal(A.mailBulletinsLeft(S),0);
 assert.doesNotMatch(S.journal[0].text,/bulletin/);
 R.advance(S,at(24+8),1,never);full(S);S.goals.list=[];assert.equal(A.mailBulletinsLeft(S),2,"a new day");
 const p2=[];for(let n=1;n<=3;n++)p2.push(one(24+8));assert.deepEqual(p2,[false,false,true]);
});

test("the Flamme's 3 letters and the letters3 goal, with 3 or 4 visits a day",()=>{
 for(const [seedAt,visits] of [[10,[9,14,20]],[10.3,[8,12,16,21]],[11,[9.5,13,18]],[12.7,[8.2,12.5,17,22]]]){
  const S=R.newGame("left",at(seedAt-24));R.advance(S,at(seedAt-24),1,never);   // born the day before
  for(let h=seedAt-24;h<6;h++){full(S);R.advance(S,at(h),1,never);}
  R.advance(S,at(6),1,never);S.goals.list=[{id:"letters3",n:0,done:false},{id:"visits3",n:0,done:false},{id:"care2",n:0,done:false}];S.flame.log.letters=0;
  answerAll(S,6);S.flame.log.letters=0;S.goals.list[0].n=0;   // the night's letters from the day before do not count
  let n=0;for(const h of visits){full(S);R.advance(S,at(h),1,never);n+=answerAll(S,h);}
  assert.ok(n>=3,`${n} letters with visits at ${visits}`);assert.ok(S.flame.log.letters>=A.FLAME.lettersMin);assert.ok(S.goals.list[0].done,"letters3");
 }
});

test("a death or a resignation keeps the box and its calendar; a camp change drops the other camp's letters",()=>{
 const S=game("left",10);S.mail.letter={id:"l_velo",t:at(10)};S.mail.queue=[{id:"l_isf",t:at(10)}];S.mail.b=2;S.mail.n=7;
 const seed=S.mail.cal,k=S.mail.k;
 assert.ok(play(S,{type:"restart",camp:"left"},10.2).ok);
 assert.equal(S.mail.cal,seed);assert.equal(S.mail.k,k);assert.equal(S.mail.b,2);assert.equal(S.mail.n,7);assert.equal(A.lettersWaiting(S),2);
 assert.ok(play(S,{type:"restart",camp:"right"},11.5).ok);
 assert.equal(S.mail.cal,seed);assert.equal(A.lettersWaiting(S),0,"left letters for a right player: dropped");assert.deepEqual(S.mail.queue,[]);
});

test("a 1.7.0 state: its letter and counters kept, the calendar starts now, past bulletins count against the cap",()=>{
 const S=game("left",10),old=structuredClone(S);
 old.mail={next:at(10.6),letter:{id:"l_velo",t:at(9.9)},day:D1,n:4};
 const o=R.sanitize(old,at(10));
 assert.deepEqual(o.mail.letter,{id:"l_velo",t:at(9.9)});assert.deepEqual(o.mail.queue,[]);
 assert.equal(o.mail.n,4);assert.equal(o.mail.b,1,"the 3rd letter's bulletin");assert.equal(o.mail.day,D1);
 assert.ok(Number.isInteger(o.mail.cal));assert.equal(o.mail.sd,D1);assert.equal(o.mail.k,A.mailDue(o.mail.cal,D1,600));
 R.advance(o,at(10),1,never);assert.equal(A.lettersWaiting(o),1,"no burst of the morning's letters");
 o.goals.list=[];full(o);
 const b=o.wardrobe.bulletins;assert.ok(play(o,{type:"mailAnswer",id:"l_velo",choice:0},10).ok);
 o.mail.letter={id:"l_isf",t:at(10)};assert.equal(play(o,{type:"mailAnswer",id:"l_isf",choice:0},10).bulletin,true,"the 6th: the 2nd of the day");
 o.mail.n=8;o.mail.letter={id:"l_isf",t:at(10)};assert.equal(play(o,{type:"mailAnswer",id:"l_isf",choice:0},10).bulletin,false,"the 9th: over the cap");
 assert.equal(o.wardrobe.bulletins,b+1);
 const many=structuredClone(S);many.mail={letter:null,day:D1,n:20};assert.equal(R.sanitize(many,at(10)).mail.b,6,"bounded");
 // Malformed: twins, the other camp, junk, more than 3, a bad seed and calendar.
 const bad=structuredClone(S);
 bad.mail={cal:-1,sd:"x",k:99,letter:{id:"r_dette",t:at(10)},queue:[{id:"l_velo",t:at(10)},{id:"l_velo",t:at(10)},null,"l_isf",{id:"l_isf",t:at(10)+9*H},{id:"l_smic",t:-5},{id:"l_greve",t:at(9)}],day:D1,n:2,b:"2"};
 const c=R.sanitize(bad,at(10)).mail;
 assert.deepEqual([c.letter,...c.queue],[{id:"l_velo",t:at(10)},{id:"l_isf",t:at(10)},{id:"l_smic",t:0}],"3 at most, no twins, times bounded");
 assert.ok(Number.isInteger(c.cal)&&c.cal>=0);assert.equal(c.sd,D1);assert.equal(c.k,A.mailDue(c.cal,D1,600));assert.equal(c.b,0);
 const K=structuredClone(S);K.mail.k=99;assert.equal(R.sanitize(K,at(10)).mail.k,A.MAIL.slots);
 assert.equal(JSON.stringify(R.sanitize(structuredClone(S),at(10)).mail),JSON.stringify(S.mail),"a 1.7.1 state is kept as it is");
});
