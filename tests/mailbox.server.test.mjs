// The letterbox on a real server (1.7.1): letters come on the player's calendar without any answer, the box holds 3,
// an answer shows the next one, and the mail pays its bulletins within the day's cap.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,until} from "./server-helpers.mjs";
import * as A from "../web/activities.mjs";

const PORT=3860;
let dir,proc,c;
const state=async()=>(await c.call("GET","/api/me")).json.state;
// 600×: ten game minutes a second, so a slot of 45 min every 4 to 5 s (the server's clock reads early afternoon).
before(async()=>{dir=mkdtempSync(join(tmpdir(),"pgmail-"));proc=await boot(PORT,dir,{POLITIGO_SPEED:"600"});c=await player(PORT,"Facteur","left");});
after(async()=>{await stop(proc);});

test("the calendar fills the box up to 3 without an answer; answering shows the next; the cap holds",async()=>{
 const S0=await state();
 assert.ok(Number.isInteger(S0.mail.cal));assert.ok(Array.isArray(S0.mail.queue));assert.ok(A.lettersWaiting(S0)<=1,"no burst at sign-up");
 const full=await until(async()=>{const S=await state();assert.ok(A.lettersWaiting(S)<=A.MAIL.box,"never more than 3");return A.lettersWaiting(S)===A.MAIL.box&&S;},40000);
 assert.ok(full,"3 letters came, none answered");
 const ids=[full.mail.letter.id,...full.mail.queue.map(q=>q.id)];assert.equal(new Set(ids).size,3);
 let r=await c.call("POST","/api/action",{type:"mailAnswer",id:ids[1],choice:0});assert.notEqual(r.status,200,"the letter shown first");
 r=await c.call("POST","/api/action",{type:"mailAnswer",id:ids[0],choice:0});assert.equal(r.status,200,JSON.stringify(r.json));
 const S1=await state();assert.equal(S1.mail.letter.id,ids[1],"the next one shows");assert.equal(S1.mail.n,1);
 // Nine letters answered as soon as they show: two bulletins from the mail, never three.
 let n=1;const end=Date.now()+90000;
 while(n<9&&Date.now()<end){
  const S=await state();if(!S.mail.letter){await until(async()=>(await state()).mail.letter,8000);continue;}
  r=await c.call("POST","/api/action",{type:"mailAnswer",id:S.mail.letter.id,choice:0});if(r.status===200)n++;
 }
 const S2=await state();
 assert.ok(n>=9||S2.mail.day!==S1.mail.day,`answered ${n}`);
 assert.ok(S2.mail.b<=A.MAIL.bulletinsPerDay,`mail bulletins ${S2.mail.b}`);
 if(S2.mail.day===S1.mail.day)assert.equal(S2.mail.b,2);
});
