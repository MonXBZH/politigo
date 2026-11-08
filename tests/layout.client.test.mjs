// Tests for the client fixes of the 1.7.1 browser audit: long names never widen the page (web/style.css), the
// feed's sentences name their player once, a reload in the middle of a Bâton round knows its time, the Tirage du
// peuple speaks of both urns (node --test, no DOM: the style sheet is read as text).
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as B from "../web/batonduel.mjs";
import {BD} from "../web/duel.mjs";
import {EVENT_TYPES} from "../web/events.mjs";

const css=readFileSync(new URL("../web/style.css",import.meta.url),"utf8").replace(/\/\*[^]*?\*\//g,"");
// The declarations of the rule whose selector list is exactly `sel` (outside or inside a media query).
const rules=sel=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].trim().split(/\s*,\s*/).includes(sel)).map(m=>m[2]).join(";");

test("a long name in the feed or a sheet never sets the width of the page (N1)",()=>{
 assert.match(rules(".app"),/grid-template-columns:minmax\(0,1fr\)(;|$)/);         // phone: one column that can shrink
 assert.match(rules(".panel"),/grid-template-columns:minmax\(0,1fr\)/);       // desktop: the cards stay in their 370 px
 assert.match(rules(".journal"),/grid-template-columns:minmax\(0,1fr\)/);
 for(const s of [".journal li",".toast",".duel",".dossier",".bd-ov",".bd-feed li",".sheet-head h2",".stat-head h2"])
  assert.match(rules(s),/overflow-wrap:anywhere/,s);
 for(const s of [".sheet-head>div:first-child",".stat-head h2"])assert.match(rules(s),/min-width:0/,s);
});

test("feedParts: a sentence that names its player shows the name once, in bold where it stands (N5)",()=>{
 const W="WWWWWWWWWWWWWWWWWWWW",J="Jean-Eudë de la Tour";
 assert.deepEqual(B.feedParts({player:W,kind:"duel",text:`${W} défie ${J} au Débat chrono.`}),{pre:"",name:W,post:` défie ${J} au Débat chrono.`});
 assert.deepEqual(B.feedParts({player:J,kind:"baton",text:`⚔️ ${J} défie ${W} pour le Bâton de feu.`}),{pre:"⚔️ ",name:J,post:` défie ${W} pour le Bâton de feu.`});
 const nul=B.feedParts({player:J,kind:"duel",text:`Match nul entre ${W} et ${J} au Débat chrono, 4 partout.`});
 assert.equal(nul.pre+nul.name+nul.post,`Match nul entre ${W} et ${J} au Débat chrono, 4 partout.`);
 // a sentence without the name (the staff's own lines) and the journal's lines keep the name in front
 assert.deepEqual(B.feedParts({player:J,kind:"mythic",text:"🔥 brandit désormais le Bâton de feu des Apprix."}),{pre:"",name:J,post:" · 🔥 brandit désormais le Bâton de feu des Apprix."});
 assert.deepEqual(B.feedParts({player:"Ana",kind:"evolve",text:"Ana grandit : Banane devient député."}),{pre:"",name:"Ana",post:" · Ana grandit : Banane devient député."});
 assert.deepEqual(B.feedParts({player:"",kind:"duel",text:"x"}),{pre:"",name:"",post:" · x"});
 assert.deepEqual(B.feedParts(null),{pre:"",name:"",post:" · "});
});

test("roundLeft: after a reload, the round kept from the server runs on; anything else is not resumed (N4)",()=>{
 const d={id:7,status:"c_play",role:"challenger",n:0},start=1_000_000,saved={id:7,n:0,start};
 assert.equal(B.roundLeft(saved,d,start+25000),BD.round-25000);
 assert.equal(B.roundLeft(saved,d,start-2000),BD.round);                     // still the countdown
 assert.equal(B.roundLeft(saved,d,start+BD.round),null);                       // over
 assert.equal(B.roundLeft(saved,{...d,n:1},start+1000),null);                  // the next round, not started
 assert.equal(B.roundLeft(saved,{...d,id:8},start+1000),null);                 // another duel
 assert.equal(B.roundLeft(saved,{...d,role:"bearer"},start+1000),null);        // c_play is the challenger's part
 assert.equal(B.roundLeft(saved,{...d,status:"b_wait"},start+1000),null);
 assert.equal(B.roundLeft(saved,{...d,status:"b_play",role:"bearer"},start+1000),BD.round-1000);
 assert.equal(B.roundLeft(saved,{...d,status:"live",role:"bearer"},start+1000),BD.round-1000);
 assert.equal(B.roundLeft(null,d,start),null);assert.equal(B.roundLeft({id:7,n:0,start:"x"},d,start),null);assert.equal(B.roundLeft(saved,null,start),null);
});

test("the Tirage du peuple's ready-made banner fits both camps: Tombola on the left, Loterie on the right (N7)",()=>{
 const m=EVENT_TYPES.tirage.msg;
 assert.doesNotMatch(m,/Tombola|Loterie/);assert.match(m,/urne de ton camp/);
});

test("roundLeft: the server's roundStart comes first, on any device; without it the round kept here still counts",()=>{
 const start=2_000_000,d={id:7,status:"c_play",role:"challenger",n:1,roundStart:start};
 assert.equal(B.roundLeft(null,d,start+10000),BD.round-10000);                         // another device: nothing kept here
 assert.equal(B.roundLeft({id:7,n:0,start:1},d,start+10000),BD.round-10000);           // an older round kept here: the server's wins
 assert.equal(B.roundLeft({id:7,n:1,start:start-30000},d,start+10000),BD.round-10000); // a wrong start kept here: the same
 assert.equal(B.roundLeft(null,d,start+BD.round),null);                                // over by the server's clock
 assert.equal(B.roundLeft(null,{...d,role:"bearer"},start),null);                      // not her part, whatever the start
 assert.equal(B.roundLeft(null,{...d,status:"b_wait"},start),null);
 assert.equal(B.roundLeft(null,{...d,status:"b_play",role:"bearer",n:0},start+1000),BD.round-1000);
 // roundStart null (no round under way) or absent (an older server): the round kept here, as before.
 const saved={id:7,n:1,start};
 assert.equal(B.roundLeft(saved,{...d,roundStart:null},start+5000),BD.round-5000);
 const {roundStart,...older}=d;assert.equal(B.roundLeft(saved,older,start+5000),BD.round-5000);
 assert.equal(B.roundLeft(null,{...d,roundStart:null},start+5000),null);
 assert.equal(B.roundLeft(null,{...d,roundStart:"2000000"},start+5000),null,"only a number");
});
