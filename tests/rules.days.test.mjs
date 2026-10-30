// Daily limits follow the calendar day in Paris: they reset at local midnight, on the 23 h day of 2026-03-29 and the
// 25 h day of 2026-10-25 too, not 24 h after the previous midnight (node --test, rules only).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const {H,XP}=R;
R.setTimeZone("Europe/Paris");
const never=()=>0.99;   // never rolls a stress
const full=S=>{S.sat=S.moral=S.energy=S.hyg=100;return S;};
const act=(S,type,now)=>{full(S);return R.act(S,{type},{now,random:never});};
// Eight activities (and four paying visits) between 14:00 and 21:00 local, two per two-hour visit.
function busyDay(S,localUtc){
 for(const h of [14,16,18,20])for(let k=0;k<2;k++){
  const r=act(S,"pongStart",localUtc(h,k*10));assert.ok(r.ok,`${h}:${k*10} ${r.error}`);
 }
 assert.equal(R.actsToday(S),XP.actsPerDay);assert.equal(R.visitsToday(S),4);
}

const cases={
 // Summer time starts at 02:00 on the 29th: from then on Paris is UTC+2, and that day has 23 hours.
 spring:{day:20260329,next:20260330,midnight:Date.UTC(2026,2,28,23),local:(h,m=0)=>Date.UTC(2026,2,29,h-2,m),hours:23},
 // Summer time ends at 03:00 on the 25th: from then on Paris is UTC+1, and that day has 25 hours.
 autumn:{day:20261025,next:20261026,midnight:Date.UTC(2026,9,24,22),local:(h,m=0)=>Date.UTC(2026,9,25,h-1,m),hours:25}
};

for(const [name,c] of Object.entries(cases)){
 test(`daily limits, ${name} DST day: blocked at 23:30, reset at 00:30, playable again at 06:30`,()=>{
  const next=(h,m=0)=>c.local(24+h,m);   // the next day, still on the same offset
  assert.equal(next(0)-c.midnight,c.hours*H,"the day really has "+c.hours+" hours");
  const S=R.newGame("left",c.local(13));
  busyDay(S,c.local);
  // 23:30: still the same day, the ninth activity is refused (on the 25 h day this is 24.5 h after midnight).
  const late=c.local(23,30);
  assert.equal(R.dayKey(Math.floor(late/H)),c.day);
  const r=act(S,"debate",late);assert.equal(r.ok,false);assert.equal(r.error,"Huit activités par jour maximum.");
  // 00:30 the next day (on the 23 h day only 23.5 h after the last midnight): the counters are back to zero.
  const after=next(0,30);
  R.advance(S,after,1,never);
  assert.equal(R.dayKey(Math.floor(after/H)),c.next);
  assert.equal(R.actsToday(S),0);assert.equal(R.visitsToday(S),0);
  assert.notEqual(R.activityBlock(full(S)),"Huit activités par jour maximum.");
  assert.equal(R.activityBlock(S),"Chut, il dort.","only the night stands in the way");
  // 06:30: an activity and a paying visit again.
  const morning=act(S,"pongStart",next(6,30));
  assert.ok(morning.ok,morning.error);assert.equal(morning.visit,true);
  assert.equal(R.actsToday(S),1);assert.equal(R.visitsToday(S),1);
  assert.equal(S.visitDay,c.next);
 });
}

test("dayKey changes exactly at local midnight on both DST days (hour by hour)",()=>{
 for(const c of Object.values(cases)){
  const i0=c.midnight/H;
  assert.equal(R.dayKey(i0-1),c.day-1);
  for(let k=0;k<c.hours;k++)assert.equal(R.dayKey(i0+k),c.day,`hour ${k}`);
  assert.equal(R.dayKey(i0+c.hours),c.next);
 }
});
