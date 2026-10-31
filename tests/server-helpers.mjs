// Shared plumbing for the tests that drive a real server over HTTP (the pattern of duel.test.mjs): boot a server
// on a temporary database, a cookie-keeping client per player from its own address, a debate played the way a browser
// plays it (one question at a time, through /api/debate).
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import crypto from "node:crypto";
import {join} from "node:path";
import * as R from "../web/rules.mjs";

export const INVITE="code-secret-de-test-123",PW="motdepasse1";
// The server runs in a time zone where it is early afternoon right now: daytime-only actions are always testable.
const off=((14-new Date().getUTCHours()+36)%24)-12;
export const DAY_TZ=off>=0?`Etc/GMT-${off}`:`Etc/GMT+${-off}`;
R.setTimeZone(DAY_TZ);   // this process computes day keys exactly as the server does
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const dayNow=(now=Date.now())=>R.dayKey(Math.floor(now/R.H));
export const yesterday=(now=Date.now())=>R.dayKey(Math.floor(now/R.H)-24);
// The server's own turn limit (server.mjs: DUEL_TURN_MS).
export const DUEL_TURN_MS=R.MINI.debate.ms+R.DEBATE.intro+R.MINI_RULES.graceSeconds*1000;

export function boot(port,dir,extra={},db="t.db"){
 const env={...process.env,PORT:String(port),DB_PATH:join(dir,db),POLITIGO_INVITE:INVITE,COOKIE_SECURE:"0",PROXY_HOPS:"1",SWEEP_MS:"200",PRESENCE_MS:"50",BOARD_MS:"50",POLITIGO_DEBATE_MS:"3000",
  POLITIGO_SPEED:"1",POLITIGO_TZ:DAY_TZ,POLITIGO_ADMIN_SOCKET:"off",POLITIGO_DUEL_MIN_LEVEL:"1",POLITIGO_DUEL_MIN_AGE_H:"0",MAX_PLAYERS:"500",...extra};
 for(const k of Object.keys(env))if(env[k]===undefined)delete env[k];
 const p=spawn("node",[process.env.SERVER||"/app/server.mjs"],{env,stdio:["ignore","pipe","pipe"]});
 p.out="";p.err="";p.stderr.on("data",d=>{p.err+=d;});
 return new Promise((ok,ko)=>{p.stdout.on("data",d=>{p.out+=d;if(/PolitiGo API/.test(p.out))ok(p);});p.on("exit",code=>ko(new Error("server exited "+code+": "+p.err)));});
}
export const stop=p=>new Promise(r=>{if(p.exitCode!==null)return r();p.on("exit",r);p.kill("SIGTERM");});

let ipSeq=0;
export function client(port){
 let cookie="";const ip=`10.7.${ipSeq>>8}.${ipSeq++&255}`;
 const call=async(method,path,body)=>{
  const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{...(body!==undefined?{"Content-Type":"application/json"}:{}),...(cookie?{Cookie:cookie}:{}),"X-Forwarded-For":ip},
   body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get("set-cookie");if(set)cookie=set.split(";")[0].endsWith("=")?"":set.split(";")[0];
  let json=null;try{json=await r.json();}catch{}
  return {status:r.status,json};
 };
 return {call,port,get cookie(){return cookie;}};
}
export async function player(port,name,camp="left"){
 const c=client(port),r=await c.call("POST","/api/register",{name,password:PW,invite:INVITE,camp});
 assert.equal(r.status,201,JSON.stringify(r.json));c.name=name;c.camp=camp;return c;
}
export async function login(port,name){
 const c=client(port),r=await c.call("POST","/api/login",{name,password:PW});
 assert.equal(r.status,200,JSON.stringify(r.json));c.name=name;return c;
}
// The answer of a given kind ("left", "right", "decoy") among those shown: what anyone (or a script) reading the
// public questions can work out. The server's pace and cap are what keep that honest.
export function answerOf(q,kind){
 const row=[...R.QUESTIONS,...R.HALLOWEEN.questions].find(x=>x[0]===q.text);
 return q.answers.indexOf(row[1+R.ANSWER_KINDS.indexOf(kind)]);
}
// A debate turn ("solo" or a duel id): n answers, right for the camp unless listed in wrong, gap ms apart (a human
// takes more than the 600 ms the server requires), then the clock runs out. Returns the last reply.
export async function debateTurn(c,ref,{n=3,wrong=[],gap=620,camp=c.camp}={}){
 const next=body=>c.call("POST","/api/debate",{op:"next",ref,...body});
 let r=await next({});
 for(let k=0;k<n&&r.status===200&&!r.json.done;k++){await sleep(gap);r=await next({choice:answerOf(r.json.q,wrong.includes(k)?"decoy":camp)});}
 while(r.status===200&&!r.json.done){await sleep(Math.min(3000,r.json.leftMs+30));const t=Date.now();r=await next({});r.ms=Date.now()-t;}
 return r;
}
export async function until(fn,ms=3000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await sleep(50);}return null;}
// Valid browser keys, made the way a browser makes them.
export const keys=()=>({p256dh:crypto.createECDH("prime256v1").generateKeys().toString("base64url"),auth:crypto.randomBytes(16).toString("base64url")});
export const FCM="https://fcm.googleapis.com/fcm/send/";
