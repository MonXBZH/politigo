// Who left the game: a life with no action of the player's counts as an idle death, whatever the passive XP it earned.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";

const H=R.H,t0=Date.UTC(2026,10,2,8),never=()=>0.5;
const idle=(S,from,hours)=>{let n=from;for(let i=0;i<hours;i++)R.advance(S,t0+(++n)*H,1,never);return n;};

test("a companion left alone earns passive XP, and its deaths still count as idle",()=>{
 const S=R.freshState("left",t0);let h=0,xp=0;
 while(S.deaths<3){h=idle(S,h,1);xp=Math.max(xp,S.xp);}
 assert.ok(xp>0,"the hour tick pays XP on its own");assert.equal(S.idleDeaths,3);
});

test("a life with an action of the player's is not idle, and starts the count over",()=>{
 const S=R.freshState("left",t0);let h=0;
 while(S.deaths<2)h=idle(S,h,1);
 assert.equal(S.idleDeaths,2);
 S.played=true;
 while(S.deaths<3)h=idle(S,h,1);
 assert.equal(S.idleDeaths,0,"played, then neglected");assert.equal(S.played,false,"a new life");
 while(S.deaths<4)h=idle(S,h,1);
 assert.equal(S.idleDeaths,1);
});

test("an accepted action marks the life as played, a refused one does not; a resignation is not an idle death",()=>{
 const S=R.freshState("left",t0+10*H);S.idleDeaths=2;
 assert.equal(R.act(S,{type:"rien"},{now:t0+10*H,random:never}).ok,false);assert.equal(S.played,false);
 assert.ok(R.act(S,{type:"buy",key:"soup"},{now:t0+10*H,random:never}).ok);assert.equal(S.played,true);
 const T=R.freshState("left",t0+10*H);T.idleDeaths=2;
 assert.ok(R.act(T,{type:"restart",camp:"left"},{now:t0+10*H,random:never}).ok);assert.equal(T.idleDeaths,0);
});

test("a player back at the game is no longer counted idle: an accepted action ends the run, a refused one does not",()=>{
 const S=R.freshState("left",t0+10*H);S.idleDeaths=3;
 assert.equal(R.act(S,{type:"rien"},{now:t0+10*H,random:never}).ok,false);assert.equal(S.idleDeaths,3);
 assert.ok(R.act(S,{type:"buy",key:"soup"},{now:t0+10*H,random:never}).ok);assert.equal(S.idleDeaths,0);assert.equal(S.played,true);
});

test("the skipped time is told by its cause: a server maintenance, or a suspension",()=>{
 const S=R.freshState("left",t0),T=R.freshState("left",t0);
 R.resync(S,t0+5*H);assert.match(S.journal[0].text,/^Maintenance du serveur \(5 h\)/);
 R.resync(T,t0+5*H,"suspension");assert.match(T.journal[0].text,/^Compte suspendu \(5 h\)/);assert.doesNotMatch(T.journal[0].text,/Maintenance/);
});

test("sanitize keeps the count; a life from before the count is taken as played",()=>{
 const S=R.freshState("left",t0);S.idleDeaths=4;
 const o=R.sanitize(JSON.parse(JSON.stringify(S)),t0);assert.equal(o.idleDeaths,4);assert.equal(o.played,false);
 delete S.played;delete S.idleDeaths;
 const old=R.sanitize(JSON.parse(JSON.stringify(S)),t0);assert.equal(old.idleDeaths,0);assert.equal(old.played,true);
 assert.equal(R.sanitize({...JSON.parse(JSON.stringify(S)),idleDeaths:"x"},t0).idleDeaths,0);
});

test("a resignation opens a life nobody played yet: left there, its deaths count",()=>{
 const S=R.freshState("left",t0+10*H);
 assert.ok(R.act(S,{type:"buy",key:"soup"},{now:t0+10*H,random:never}).ok);
 assert.ok(R.act(S,{type:"restart",camp:"right"},{now:t0+10*H,random:never}).ok);assert.equal(S.played,false);
 idle(S,10,30);assert.equal(S.idleDeaths,1,"the first death after it counts");
});
