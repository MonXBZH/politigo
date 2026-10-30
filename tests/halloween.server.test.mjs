// Seasonal event on a real server: POLITIGO_EVENT (halloween / off / invalid / empty) reaches /api/me and the actions
// (node --test). The server runs in a zone where it is early afternoon (server-helpers): the candidate is awake.
import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as R from "../web/rules.mjs";
import {boot,stop,player} from "./server-helpers.mjs";

const dir=()=>mkdtempSync(join(tmpdir(),"pgh-"));
async function withServer(port,event,fn){
 const p=await boot(port,dir(),{POLITIGO_EVENT:event});
 try{await fn(p);}finally{await stop(p);}
 return p;
}

test("POLITIGO_EVENT=halloween: payload, one treat a day, the shop in costume",async()=>{
 const p=await withServer(3965,"halloween",async()=>{
  const c=await player(3965,"Citrouille","left");
  const me=await c.call("GET","/api/me");
  assert.equal(me.status,200);assert.equal(me.json.event,"halloween");
  assert.equal(R.isAsleep(me.json.state),false,"the test zone keeps him awake");
  const before=me.json.state.moral;
  const t=await c.call("POST","/api/action",{type:"treat"});
  assert.equal(t.status,200,JSON.stringify(t.json));assert.equal(t.json.ok,true);
  assert.equal(t.json.me.event,"halloween");
  const S=t.json.me.state;
  assert.equal(S.moral,Math.min(100,before+R.HALLOWEEN.treat.moral));
  assert.equal(S.journal[0].k,"treat");assert.ok(R.HALLOWEEN.treat.lines.left.includes(S.journal[0].d.line));
  assert.equal(S.treatDay,R.dayKey(R.curIdx(S)));
  const again=await c.call("POST","/api/action",{type:"treat"});
  assert.equal(again.status,422);assert.equal(again.json.ok,false);assert.equal(again.json.error,"Déjà servi aujourd'hui : reviens demain.");
  assert.equal(again.json.me.state.moral,S.moral);
  // The shop: costume name, same price.
  const fm=S.fm;
  const b=await c.call("POST","/api/action",{type:"buy",key:"soup"});
  assert.equal(b.status,200,JSON.stringify(b.json));
  const j=b.json.me.state.journal[0];
  assert.equal(j.k,"buy");assert.ok(j.text.startsWith(R.HALLOWEEN.shop.soup.left+" :"),j.text);
  assert.equal(b.json.me.state.fm,fm-R.shop.find(i=>i.key==="soup").price);
  // The right camp too.
  const d=await player(3965,"Chauve-souris","right");
  const bd=await d.call("POST","/api/action",{type:"buy",key:"bread"});
  assert.equal(bd.status,200,JSON.stringify(bd.json));
  assert.ok(bd.json.me.state.journal[0].text.startsWith(R.HALLOWEEN.shop.bread.right+" :"));
 });
 assert.match(p.err,/Seasonal event forced: halloween/);
 assert.doesNotMatch(p.err,/POLITIGO_EVENT must be/);
});

test("POLITIGO_EVENT=off: payload off, no treat, the normal shop",async()=>{
 await withServer(3966,"off",async()=>{
  const c=await player(3966,"Toussaint","right");
  const me=await c.call("GET","/api/me");
  assert.equal(me.json.event,"off");
  const t=await c.call("POST","/api/action",{type:"treat"});
  assert.equal(t.status,422);assert.equal(t.json.error,"Plus de bonbons : Halloween est fini.");
  assert.equal(t.json.me.state.treatDay,-1);
  const b=await c.call("POST","/api/action",{type:"buy",key:"soup"});
  assert.equal(b.status,200,JSON.stringify(b.json));
  assert.ok(b.json.me.state.journal[0].text.startsWith(R.shop.find(i=>i.key==="soup").right+" :"));
 });
});

test("POLITIGO_EVENT invalid: the server starts anyway, logs it and follows the calendar",async()=>{
 const p=await withServer(3967,"bogus",async()=>{
  const c=await player(3967,"Fantome","left");
  const me=await c.call("GET","/api/me");
  assert.equal(me.status,200);assert.equal(me.json.event,"auto");
 });
 assert.match(p.err,/POLITIGO_EVENT must be one of auto, off, halloween: using auto\./);
});

test("POLITIGO_EVENT empty (the compose default): auto, silently",async()=>{
 const p=await withServer(3968,"",async()=>{
  const c=await player(3968,"Sorciere","right");
  const me=await c.call("GET","/api/me");
  assert.equal(me.json.event,"auto");
  // Whatever today's date, the treat follows the calendar in the server's zone.
  const t=await c.call("POST","/api/action",{type:"treat"});
  assert.equal(t.status,R.eventAt(Date.now())==="halloween"?200:422,JSON.stringify(t.json));
 });
 assert.doesNotMatch(p.err,/POLITIGO_EVENT|Seasonal event/,p.err);
});
