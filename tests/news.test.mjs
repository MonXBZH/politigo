// What's new (web/changelog.mjs): which entries a player sees after an update, and the entries themselves (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import {CHANGELOG,missedEntries,latestEntry} from "../web/changelog.mjs";
import {releaseOf,cmpRelease} from "../web/rules.mjs";

const fake=[{version:"1.5.0"},{version:"1.4.1"},{version:"1.4.0"},{version:"1.3.0"}];
// missedEntries reads the real CHANGELOG: swapped in place for the duration of a test.
function withLog(entries,fn){const saved=CHANGELOG.splice(0,CHANGELOG.length,...entries);try{fn();}finally{CHANGELOG.splice(0,CHANGELOG.length,...saved);}}

test("every entry is well formed, newest first, with French text and a real date",()=>{
 assert.ok(CHANGELOG.length>=1);
 const versions=CHANGELOG.map(e=>e.version);
 assert.equal(new Set(versions).size,versions.length,"no version twice");
 for(let i=0;i<CHANGELOG.length;i++){
  const e=CHANGELOG[i];
  assert.equal(releaseOf(e.version),e.version,`${e.version} is a plain release number (no "v")`);
  assert.match(e.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(Number.isFinite(Date.parse(e.date)));
  assert.ok(Array.isArray(e.added)&&Array.isArray(e.fixed)&&Array.isArray(e.changed??[]),`${e.version}: lists only`);
  assert.ok(e.added.length+(e.changed??[]).length+e.fixed.length>0,`${e.version} says something`);
  for(const t of [...e.added,...(e.changed??[]),...e.fixed])assert.ok(typeof t==="string"&&t.length>10&&t.length<400);
  if(i)assert.ok(cmpRelease(CHANGELOG[i-1].version,e.version)>0,"newest first");
 }
});

test("a player sees each release he missed once, newest first, and never one ahead of the server",()=>withLog(fake,()=>{
 assert.deepEqual(missedEntries("1.3.0","1.5.0").map(e=>e.version),["1.5.0","1.4.1","1.4.0"]);
 assert.deepEqual(missedEntries("1.4.1","1.5.0").map(e=>e.version),["1.5.0"]);
 assert.deepEqual(missedEntries("1.5.0","1.5.0"),[],"already read");
 assert.deepEqual(missedEntries("1.3.0","1.4.0").map(e=>e.version),["1.4.0"],"an entry written ahead of the tag waits for it");
 assert.deepEqual(missedEntries("1.5.0","1.4.0"),[],"a server rolled back shows nothing");
 assert.deepEqual(missedEntries("1.4.5","1.5.0").map(e=>e.version),["1.5.0"],"a release without an entry is fine");
}));

test("an account that never read anything sees only the current release; a dev server shows nothing",()=>withLog(fake,()=>{
 assert.deepEqual(missedEntries(null,"1.5.0").map(e=>e.version),["1.5.0"]);
 assert.deepEqual(missedEntries(null,"1.4.5"),[],"no entry for this release, no history dump");
 assert.deepEqual(missedEntries("1.3.0",null),[]);assert.deepEqual(missedEntries(null,null),[]);
}));

test("the on-demand button shows this release's entry, or the newest one it knows",()=>withLog(fake,()=>{
 assert.equal(latestEntry("1.4.1").version,"1.4.1");
 assert.equal(latestEntry("1.4.5").version,"1.4.1","a release without an entry: the one before");
 assert.equal(latestEntry(null).version,"1.5.0","dev server: the newest");
 assert.equal(latestEntry("1.0.0").version,"1.5.0","older than everything: still something to show");
}));
