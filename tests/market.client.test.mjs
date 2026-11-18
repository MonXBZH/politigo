// Tests for the shared trading rules (web/market.mjs): pure, no DOM, no server (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as M from "../web/market.mjs";

const st=(own=[],o={})=>({lvl:10,wardrobe:{own:[...own],worn:{outfit:null,object:null},bulletins:0,...o}});

test("MARKET constants",()=>{
 assert.deepEqual(M.MARKET,{maxItems:3,maxListings:3,maxOffers:5,perDay:3,maxBulletins:20,minAgeMs:3*864e5,awayMs:14*864e5,excluded:["ultra","mythique"]});
});

test("tradable: commun yes, ultra/mythique/unknown no",()=>{
 assert.equal(M.tradable("bleutravail"),true);assert.equal(M.tradable("megaphone"),true);
 assert.equal(M.tradable("camarade"),false);assert.equal(M.tradable("baton"),false);
 assert.equal(M.tradable("nope"),false);assert.equal(M.tradable(undefined),false);assert.equal(M.tradable("toString"),false);
});

test("cleanGive",()=>{
 assert.deepEqual(M.cleanGive({items:["megaphone","megaphone"]}),{items:["megaphone"],bulletins:0});
 assert.equal(M.cleanGive({items:["megaphone","cocarde","baguette","bobhuma"]}),null);
 assert.equal(M.cleanGive({items:["megaphone"],bulletins:21}),null);
 assert.deepEqual(M.cleanGive({items:["megaphone"],bulletins:20}),{items:["megaphone"],bulletins:20});
 assert.equal(M.cleanGive({items:[],bulletins:5}),null);
 assert.deepEqual(M.cleanGive({items:[],bulletins:5},{needItem:false}),{items:[],bulletins:5});
 assert.equal(M.cleanGive({items:["camarade"]}),null);
 assert.equal(M.cleanGive({items:["baton"],bulletins:0},{needItem:false}),null);
 assert.equal(M.cleanGive({items:["megaphone"],bulletins:1.5}),null);
 assert.equal(M.cleanGive({items:["megaphone"],bulletins:-1}),null);
 assert.equal(M.cleanGive(null),null);assert.equal(M.cleanGive("x"),null);assert.equal(M.cleanGive({items:"megaphone"}),null);
});

test("cleanWant",()=>{
 assert.deepEqual(M.cleanWant({kind:"items",items:["megaphone","megaphone"],bulletins:2}),{kind:"items",items:["megaphone"],bulletins:2});
 assert.deepEqual(M.cleanWant({kind:"items",items:["megaphone"]}),{kind:"items",items:["megaphone"],bulletins:0});
 assert.equal(M.cleanWant({kind:"items",items:[],bulletins:0}),null);
 assert.equal(M.cleanWant({kind:"items",items:["megaphone","cocarde","baguette","bobhuma"]}),null);
 assert.equal(M.cleanWant({kind:"items",items:["camarade"]}),null);
 assert.equal(M.cleanWant({kind:"items",items:["megaphone"],bulletins:21}),null);
 assert.deepEqual(M.cleanWant({kind:"rarity",rarity:"rare",slot:"outfit",bulletins:3}),{kind:"rarity",rarity:"rare",slot:"outfit",bulletins:3});
 assert.equal(M.cleanWant({kind:"rarity",rarity:"ultra",slot:"any",bulletins:0}),null);
 assert.equal(M.cleanWant({kind:"rarity",rarity:"mythique",slot:"any",bulletins:0}),null);
 assert.equal(M.cleanWant({kind:"rarity",rarity:"zzz",slot:"any",bulletins:0}),null);
 assert.equal(M.cleanWant({kind:"rarity",rarity:"rare",slot:"hat",bulletins:0}),null);
 assert.deepEqual(M.cleanWant({kind:"bulletins",bulletins:1}),{kind:"bulletins",bulletins:1});
 assert.equal(M.cleanWant({kind:"bulletins",bulletins:0}),null);
 assert.equal(M.cleanWant({kind:"bulletins",bulletins:21}),null);
 assert.deepEqual(M.cleanWant({kind:"offer",junk:1}),{kind:"offer"});
 assert.equal(M.cleanWant({kind:"x"}),null);assert.equal(M.cleanWant(null),null);
});

test("satisfies",()=>{
 const g=(items,bulletins=0)=>({items,bulletins});
 const wi={kind:"items",items:["megaphone","cocarde"],bulletins:2};
 assert.equal(M.satisfies(wi,g(["cocarde","megaphone"],2)),true);
 assert.equal(M.satisfies(wi,g(["cocarde","megaphone"],3)),false);
 assert.equal(M.satisfies(wi,g(["cocarde"],2)),false);
 assert.equal(M.satisfies(wi,g(["cocarde","megaphone","baguette"],2)),false);
 const wr={kind:"rarity",rarity:"commun",slot:"outfit",bulletins:1};
 assert.equal(M.satisfies(wr,g(["bleutravail"],1)),true);
 assert.equal(M.satisfies(wr,g(["megaphone"],1)),false);   // wrong slot
 assert.equal(M.satisfies(wr,g(["chasuble"],1)),false);    // wrong rarity
 assert.equal(M.satisfies(wr,g(["bleutravail"],0)),false);
 assert.equal(M.satisfies(wr,g(["bleutravail","bobhuma"],1)),false);
 assert.equal(M.satisfies({...wr,slot:"any"},g(["megaphone"],1)),true);
 assert.equal(M.satisfies({kind:"bulletins",bulletins:4},g([],4)),true);
 assert.equal(M.satisfies({kind:"bulletins",bulletins:4},g([],5)),false);
 assert.equal(M.satisfies({kind:"bulletins",bulletins:4},g(["megaphone"],4)),false);
 assert.equal(M.satisfies({kind:"offer"},g(["megaphone"],0)),false);
});

test("missing and dupes",()=>{
 const S=st(["megaphone"],{bulletins:2});
 assert.equal(M.missing(S,{items:["megaphone"],bulletins:2}),"");
 assert.match(M.missing(S,{items:["cocarde"],bulletins:0}),/^Il te manque : .*Cocarde/i);
 assert.equal(M.missing(S,{items:[],bulletins:3}),"Il te manque 3 bulletins");
 assert.equal(M.missing(S,{items:[],bulletins:0}),"");
 assert.deepEqual(M.dupes(S,["megaphone","cocarde"]),["megaphone"]);
});

test("applyTrade empties the worn slot of a given item",()=>{
 const A=st(["bleutravail","megaphone"],{bulletins:5}),B=st(["cocarde"],{bulletins:1});
 A.wardrobe.worn={outfit:"bleutravail",object:"megaphone"};B.wardrobe.worn={outfit:null,object:"cocarde"};
 M.applyTrade(A,{items:["bleutravail"],bulletins:2},B,{items:[],bulletins:1});
 assert.deepEqual(A.wardrobe.own,["megaphone"]);assert.equal(A.wardrobe.worn.outfit,null);assert.equal(A.wardrobe.worn.object,"megaphone");
 assert.deepEqual(B.wardrobe.own.sort(),["bleutravail","cocarde"]);assert.deepEqual(B.wardrobe.worn,{outfit:null,object:"cocarde"});
 assert.equal(A.wardrobe.bulletins,5-2+1);assert.equal(B.wardrobe.bulletins,1+2-1);
});

test("applyTrade throws on dupe or missing and leaves both states untouched",()=>{
 const A=st(["megaphone"],{bulletins:1}),B=st(["megaphone","cocarde"]);
 const a0=structuredClone(A),b0=structuredClone(B);
 assert.throws(()=>M.applyTrade(A,{items:["megaphone"],bulletins:0},B,{items:["cocarde"],bulletins:0}),Error);
 assert.throws(()=>M.applyTrade(A,{items:[],bulletins:2},B,{items:[],bulletins:0}),Error);
 assert.throws(()=>M.applyTrade(A,{items:["cocarde"],bulletins:0},B,{items:[],bulletins:0}),Error);
 assert.deepEqual(A,a0);assert.deepEqual(B,b0);
});

test("tradeBlock",()=>{
 const o={minLevel:5,ageMs:10*864e5,today:0};
 assert.equal(M.tradeBlock(st(),o),"");
 assert.equal(M.tradeBlock({lvl:4},o),"Échanges à partir du niveau 5.");
 assert.equal(M.tradeBlock(st(),{...o,ageMs:2*864e5}),"Ton compte est trop récent pour la Brocante.");
 assert.equal(M.tradeBlock(st(),{...o,today:3}),"3 échanges aujourd'hui : reviens demain.");
 assert.equal(M.tradeBlock(st(),{...o,today:2}),"");
});
