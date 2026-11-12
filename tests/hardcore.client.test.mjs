// The Bâton's music (web/hardcore.mjs): the legend's piece and the sound switch. The sound itself needs a browser.
import {test} from "node:test";
import assert from "node:assert/strict";
import {BPM,PIECE,CHORDS,barAt,stepAt,soundOn,setSound} from "../web/hardcore.mjs";

const loop=PIECE.slice(1).reduce((s,x)=>s+x.bars,0);

test("the piece: slow (a bar lasts 2.4 s), the intro heard once, then its sections loop forever",()=>{
 assert.equal(BPM,100);
 assert.equal(barAt(0).sec,PIECE[0]);assert.equal(barAt(PIECE[0].bars).sec,PIECE[1]);
 for(let n=PIECE[0].bars;n<PIECE[0].bars+loop;n++){const a=barAt(n),b=barAt(n+loop);assert.equal(a.sec,b.sec);assert.equal(a.k,b.k);assert.equal(a.chord,b.chord);}
 for(let n=0;n<3*loop;n++){const b=barAt(n);assert.ok(CHORDS[b.chord],`bar ${n}: ${b.chord}`);if(b.lead)assert.equal(b.lead.length,8);}
});

test("each bar: the pad on its first step; the theme with guitar, bass and lead; the intro without guitar",()=>{
 for(let n=0;n<2*loop;n++){
  const b=barAt(n),steps=[...Array(8)].map((_,s)=>stepAt(b,s));
  assert.deepEqual(steps[0].pad,CHORDS[b.chord].pad);assert.ok(steps.slice(1).every(e=>!e.pad));
  if(!b.sec.gtr)assert.ok(steps.every(e=>!e.gtr));
  for(const e of steps)if(e.lead)assert.ok(e.lead.steps>=1&&e.lead.note>=60&&e.lead.note<=80);
 }
 const theme=barAt(PIECE[0].bars+PIECE[1].bars),t=[...Array(8)].map((_,s)=>stepAt(theme,s));
 assert.equal(theme.sec.drums,"drive");assert.ok(t.every(e=>e.kick),"the double kick");assert.ok(t[0].crash&&t[4].snare);
 assert.ok(t.some(e=>e.gtr?.muted)&&t.some(e=>e.gtr&&!e.gtr.muted));assert.ok(t[0].lead);
});

test("a section with a fill ends with the toms rolling down",()=>{
 const n=PIECE[0].bars+PIECE[1].bars-1,b=barAt(n);assert.ok(b.last&&b.sec.fill);
 const toms=[4,5,6,7].map(s=>stepAt(b,s).tom);assert.ok(toms.every(Boolean));assert.deepEqual([...toms].sort((x,y)=>y-x),toms);
});

test("the switch: on unless turned off, the duel's old « off » kept, and nothing breaks without storage",()=>{
 const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
 try{
  assert.equal(soundOn(),true,"on by default");
  store.set("politigo.duelSound","0");assert.equal(soundOn(),false,"the duel's sound turned off before stays off");
  setSound(true);assert.equal(soundOn(),true);setSound(false);assert.equal(soundOn(),false);
  globalThis.localStorage={getItem(){throw new Error("blocked");},setItem(){throw new Error("blocked");}};
  assert.equal(soundOn(),true);setSound(false);
 }finally{delete globalThis.localStorage;}
});
