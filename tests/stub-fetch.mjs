// Preloaded into a test server (NODE_OPTIONS="--import /w/tests/stub-fetch.mjs"): replaces fetch so that push
// messages never leave the machine. The endpoint's path says what the "push service" answers:
//  .../status-NNN  -> an HTTP NNN response
//  .../throw       -> a network error (fetch rejects)
//  .../slow        -> a 201, five seconds later
//  anything else   -> a 201
// Every call is appended (one JSON line: url, t) to the file named by STUB_FETCH_LOG, when set.
import {appendFileSync} from "node:fs";

const LOG=process.env.STUB_FETCH_LOG||"";
globalThis.fetch=async(input,opts={})=>{
 const url=String(input?.url??input);
 if(LOG){try{appendFileSync(LOG,JSON.stringify({url,t:Date.now()})+"\n");}catch{}}
 let path="";try{path=new URL(url).pathname;}catch{}
 if(/\/throw$/.test(path))throw new TypeError("fetch failed (stub)");
 if(/\/slow$/.test(path))await new Promise(r=>setTimeout(r,5000));
 const m=/\/status-(\d{3})$/.exec(path);
 return new Response(null,{status:m?Number(m[1]):201});
};
