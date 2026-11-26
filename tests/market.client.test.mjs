// Tests for the shared trading rules (web/market.mjs): pure, no DOM, no server (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as M from "../web/market.mjs";

const st=(own=[],o={})=>({lvl:10,wardrobe:{own:[...own],dup:[],worn:{outfit:null,object:null},bulletins:0,...o}});

test("MARKET constants",()=>{
 assert.deepEqual(M.MARKET,{maxItems:3,maxListings:3,maxOffers:5,perDay:3,maxBulletins:20,minAgeMs:3*864e5,awayMs:14*864e5,excluded:["mythique"]});
});

test("tradable: commun and ultra yes, mythique/unknown no",()=>{
 assert.equal(M.tradable("bleutravail"),true);assert.equal(M.tradable("megaphone"),true);
 assert.equal(M.tradable("camarade"),true);assert.equal(M.tradable("baton"),false);
 assert.equal(M.tradable("nope"),false);assert.equal(M.tradable(undefined),false);assert.equal(M.tradable("toString"),false);
});

test("cleanGive",()=>{
 assert.deepEqual(M.cleanGive({items:["megaphone","megaphone"]}),{items:["megaphone"],bulletins:0});
 assert.equal(M.cleanGive({items:["megaphone","cocarde","baguette","bobhuma"]}),null);
 assert.equal(M.cleanGive({items:["megaphone"],bulletins:21}),null);
 assert.deepEqual(M.cleanGive({items:["megaphone"],bulletins:20}),{items:["megaphone"],bulletins:20});
 assert.equal(M.cleanGive({items:[],bulletins:5}),null);
 assert.deepEqual(M.cleanGive({items:[],bulletins:5},{needItem:false}),{items:[],bulletins:5});
 assert.equal(M.cleanGive({items:["baton"]}),null);
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
 assert.equal(M.cleanWant({kind:"items",items:["baton"]}),null);
 assert.equal(M.cleanWant({kind:"items",items:["megaphone"],bulletins:21}),null);
 assert.deepEqual(M.cleanWant({kind:"rarity",rarity:"rare",slot:"outfit",bulletins:3}),{kind:"rarity",rarity:"rare",slot:"outfit",bulletins:3});
 assert.ok(M.cleanWant({kind:"rarity",rarity:"ultra",slot:"any",bulletins:0}));
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
 assert.deepEqual(M.dupes(S,["megaphone","cocarde"]),[]);
});

test("applyTrade empties the worn slot of a given item",()=>{
 const A=st(["bleutravail","megaphone"],{bulletins:5}),B=st(["cocarde"],{bulletins:1});
 A.wardrobe.worn={outfit:"bleutravail",object:"megaphone"};B.wardrobe.worn={outfit:null,object:"cocarde"};
 M.applyTrade(A,{items:["bleutravail"],bulletins:2},B,{items:[],bulletins:1});
 assert.deepEqual(A.wardrobe.own,["megaphone"]);assert.equal(A.wardrobe.worn.outfit,null);assert.equal(A.wardrobe.worn.object,"megaphone");
 assert.deepEqual(B.wardrobe.own.sort(),["bleutravail","cocarde"]);assert.deepEqual(B.wardrobe.worn,{outfit:null,object:"cocarde"});
 assert.equal(A.wardrobe.bulletins,5-2+1);assert.equal(B.wardrobe.bulletins,1+2-1);
});

test("1.10.0 : on reçoit une pièce qu'on a en 1 exemplaire (2e copie), refusé à 2",()=>{
 const A=st(["megaphone"]),B=st(["cocarde"]);
 M.applyTrade(A,{items:["megaphone"],bulletins:0},B,{items:[],bulletins:0});
 assert.deepEqual(B.wardrobe.own,["cocarde","megaphone"]);
 const G=st(["megaphone"]),H=st(["megaphone"]);
 M.applyTrade(G,{items:["megaphone"],bulletins:0},H,{items:[],bulletins:0});
 assert.deepEqual([H.wardrobe.own,H.wardrobe.dup],[["megaphone"],["megaphone"]]);
 assert.deepEqual([G.wardrobe.own,G.wardrobe.dup],[[],[]]);
 const X=st(["megaphone"]),Y=st(["megaphone"],{dup:["megaphone"]});
 assert.throws(()=>M.applyTrade(X,{items:["megaphone"],bulletins:0},Y,{items:[],bulletins:0}),/déjà possédé/);
});
test("1.10.0 : céder une pièce qu'on a en double la garde (et la tenue portée) ; céder la dernière l'ôte",()=>{
 const A=st(["bleutravail","megaphone"],{dup:["bleutravail"]}),B=st(["cocarde"]);
 A.wardrobe.worn={outfit:"bleutravail",object:"megaphone"};
 M.applyTrade(A,{items:["bleutravail","megaphone"],bulletins:0},B,{items:[],bulletins:0});
 assert.deepEqual(A.wardrobe.own,["bleutravail"]);assert.deepEqual(A.wardrobe.dup,[]);
 assert.deepEqual(A.wardrobe.worn,{outfit:"bleutravail",object:null});
});
test("1.10.0 : dupes ne signale que les pièces à 2 exemplaires",()=>{
 assert.deepEqual(M.dupes(st(["megaphone","cocarde"],{dup:["cocarde"]}),["megaphone","cocarde","bleutravail"]),["cocarde"]);
});

test("applyTrade throws on dupe or missing and leaves both states untouched",()=>{
 const A=st(["megaphone"],{bulletins:1}),B=st(["megaphone","cocarde"],{dup:["megaphone"]});
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

test("applyTrade refuses malformed gives and a same-state trade, before any mutation",()=>{
 const mk=()=>[st(["megaphone","camarade","cocarde"],{bulletins:5}),st(["bleutravail"],{bulletins:5})];
 const e=(a,b)=>({items:[],bulletins:0,...a}),ok={items:[],bulletins:0};
 const bad=[
  [{items:["baton"],bulletins:0},ok],               // mythic
  [{items:["megaphone","megaphone"],bulletins:0},ok], // duplicated id
  [{items:[],bulletins:-5},ok],[{items:[],bulletins:1.5},ok],[{items:[],bulletins:NaN},ok],[{items:[],bulletins:21},ok],
  [{items:["nope"],bulletins:0},ok],[{items:["megaphone","cocarde","camarade","x"],bulletins:0},ok],
  [ok,{items:["bleutravail","bleutravail"],bulletins:0}],
 ];
 for(const [ga,gb] of bad){
  const [A,B]=mk(),a0=structuredClone(A),b0=structuredClone(B);
  assert.throws(()=>M.applyTrade(A,ga,B,gb),{message:"Échange invalide."});
  assert.deepEqual(A,a0);assert.deepEqual(B,b0);
 }
 const [A]=mk(),a0=structuredClone(A);
 assert.throws(()=>M.applyTrade(A,{items:["megaphone"],bulletins:0},A,{items:["cocarde"],bulletins:0}),{message:"Échange invalide."});
 assert.deepEqual(A,a0);
});

test("applyTrade: an item a side both gives and receives is a dupe",()=>{
 const A=st(["megaphone"],{dup:["megaphone"]}),B=st(["megaphone"],{dup:["megaphone"]}),a0=structuredClone(A),b0=structuredClone(B);
 assert.throws(()=>M.applyTrade(A,{items:["megaphone"],bulletins:0},B,{items:["megaphone"],bulletins:0}),Error);
 assert.deepEqual(A,a0);assert.deepEqual(B,b0);
});

test("tradeBlock fails closed on non-numeric age or count",()=>{
 const o={minLevel:5,ageMs:10*864e5,today:0};
 for(const v of [NaN,undefined,null,"9999999999",Infinity*0])
  assert.equal(M.tradeBlock(st(),{...o,ageMs:v}),"Ton compte est trop récent pour la Brocante.");
 for(const v of [NaN,undefined,null,"0"])
  assert.equal(M.tradeBlock(st(),{...o,today:v}),"3 échanges aujourd'hui : reviens demain.");
});

test("cleanWant: check only when strictly true, never on an offer",()=>{
 const w={kind:"items",items:["megaphone"],bulletins:0};
 assert.equal(M.cleanWant({...w,check:true}).check,true);
 assert.ok(!("check" in M.cleanWant({...w,check:"oui"})));assert.ok(!("check" in M.cleanWant(w)));
 assert.equal(M.cleanWant({kind:"rarity",rarity:"rare",slot:"any",bulletins:0,check:true}).check,true);
 assert.equal(M.cleanWant({kind:"bulletins",bulletins:2,check:true}).check,true);
 assert.deepEqual(M.cleanWant({kind:"offer",check:true}),{kind:"offer"});
});

test("ultra: dupes counts a held ultra, a trade refuses it, a given ultra leaves own and worn",()=>{
 assert.deepEqual(M.dupes(st(["camarade"]),["camarade","megaphone"]),["camarade"]);
 assert.deepEqual(M.dupes(st([]),["camarade"]),[]);
 const A=st(["camarade"]),B=st(["camarade"]),a0=structuredClone(A),b0=structuredClone(B);
 assert.throws(()=>M.applyTrade(A,{items:["camarade"],bulletins:0},B,{items:[],bulletins:0}),/déjà possédé/);
 assert.deepEqual([A,B],[a0,b0]);
 const C=st(["camarade"],{worn:{outfit:"camarade",object:null}}),D=st([]);
 M.applyTrade(C,{items:["camarade"],bulletins:0},D,{items:[],bulletins:0});
 assert.deepEqual([C.wardrobe.own,C.wardrobe.worn.outfit,D.wardrobe.own],[[],null,["camarade"]]);
});
