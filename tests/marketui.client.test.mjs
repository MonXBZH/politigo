// La Brocante on screen (web/marketui.mjs): the pure pieces behind the Brocante sheets in app.js. What a listing card
// says (who, what it gives, what it asks, whether « Troquer » is open and why not), the « Pour moi » tab, what may be
// picked from the wardrobe, the trade's recap, the offer button's state and the catalogue. node --test, no DOM.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as U from "../web/marketui.mjs";

const st=(own=[],o={})=>({lvl:10,camp:"left",wardrobe:{own:[...own],worn:{outfit:null,object:null},bulletins:0,confetti:0,...o}});
const lst=(give,want,o={})=>({id:7,author:{name:"Hugo",camp:"right"},give:{items:give,bulletins:0},want,created:1000,mine:false,...o});

// ---------------------------------------------------------------- wantText
test("wantText: each kind of want, in words",()=>{
 assert.equal(U.wantText({kind:"offer"}),"Faites-moi une offre");
 assert.equal(U.wantText({kind:"bulletins",bulletins:4}),"4 🗳️");
 assert.equal(U.wantText({kind:"rarity",rarity:"rare",slot:"outfit",bulletins:0}),"une tenue Rare");
 assert.equal(U.wantText({kind:"rarity",rarity:"epique",slot:"object",bulletins:3}),"un objet Épique + 3 🗳️");
 assert.equal(U.wantText({kind:"rarity",rarity:"legendaire",slot:"any",bulletins:0}),"une tenue ou un objet Légendaire");
 assert.equal(U.wantText({kind:"items",items:["baguette"],bulletins:0}),"Baguette");
 assert.equal(U.wantText({kind:"items",items:["urne","echarpe"],bulletins:4}),"Urne transparente, Écharpe présidentielle + 4 🗳️");
 assert.equal(U.wantText(null),"");assert.equal(U.wantText({kind:"nope"}),"");
});

// ---------------------------------------------------------------- listingView
test("listingView: who, camp word, the items given with their name, rarity and kind",()=>{
 const v=U.listingView(lst(["pantalonrouge","golf"],{kind:"offer"}),st(),"");
 assert.equal(v.who,"Hugo");assert.equal(v.campTag,"droite");assert.equal(v.camp,"right");
 assert.deepEqual(v.gives,[{id:"pantalonrouge",name:"Pantalon rouge",rarity:"commun",kind:"outfit"},{id:"golf",name:"Club de golf",rarity:"rare",kind:"object"}]);
 assert.equal(v.wantText,"Faites-moi une offre");
 assert.equal(U.listingView(lst(["golf"],{kind:"offer"},{author:{name:"Léa",camp:"left"}}),st(),"").campTag,"gauche");
 assert.equal(U.listingView(lst(["golf"],{kind:"offer"},{author:{name:"?",camp:null}}),st(),"").campTag,"");
});

test("listingView: « Faites-moi une offre » has no Troquer (offers only), and no reason shown",()=>{
 const v=U.listingView(lst(["golf"],{kind:"offer"}),st(["baguette"]),"");
 assert.equal(v.takeOk,false);assert.equal(v.offerOnly,true);assert.equal(v.takeWhy,"");assert.equal(v.needsPick,false);
});

test("listingView: items wanted, held or missing",()=>{
 const want={kind:"items",items:["baguette","cle"],bulletins:0};
 const ok=U.listingView(lst(["golf"],want),st(["baguette","cle"]),"");
 assert.equal(ok.takeOk,true);assert.equal(ok.takeWhy,"");assert.equal(ok.needsPick,false);assert.equal(ok.offerOnly,false);
 const no=U.listingView(lst(["golf"],want),st(["baguette"]),"");
 assert.equal(no.takeOk,false);assert.equal(no.takeWhy,"Il te manque : Clé de l'Élysée");
});

test("listingView: bulletins only, enough or not",()=>{
 const want={kind:"bulletins",bulletins:4};
 assert.equal(U.listingView(lst(["golf"],want),st([],{bulletins:4}),"").takeOk,true);
 const v=U.listingView(lst(["golf"],want),st([],{bulletins:1}),"");
 assert.equal(v.takeOk,false);assert.equal(v.takeWhy,"Il te manque : 3 🗳️");
});

test("listingView: a rarity asks for a pick among the matching tradable items",()=>{
 const want={kind:"rarity",rarity:"rare",slot:"outfit",bulletins:2};
 const v=U.listingView(lst(["golf"],want),st(["chasuble","megaphone"],{bulletins:5}),"");
 assert.equal(v.takeOk,true);assert.equal(v.needsPick,true);
 // no rare outfit: the rarity itself is what is missing; the bulletins short too
 const n=U.listingView(lst(["golf"],want),st(["microtv"],{bulletins:0}),"");
 assert.equal(n.takeOk,false);assert.equal(n.takeWhy,"Il te manque : une tenue Rare, 2 🗳️");
});

test("listingView: the gate comes first, then what would be received twice",()=>{
 const want={kind:"items",items:["baguette"],bulletins:0};
 const v=U.listingView(lst(["golf"],want),st(["baguette"]),"Échanges à partir du niveau 5.");
 assert.equal(v.takeOk,false);assert.equal(v.takeWhy,"Échanges à partir du niveau 5.");
 const d=U.listingView(lst(["golf","pantalonrouge"],want),st(["baguette","golf"]),"");
 assert.equal(d.takeOk,false);assert.equal(d.takeWhy,"Déjà dans ta garde-robe : Club de golf");
 // a listing of offers only never shows the gate as a Troquer reason (no Troquer at all)
 assert.equal(U.listingView(lst(["golf"],{kind:"offer"}),st(),"Échanges à partir du niveau 5.").takeWhy,"");
});

test("listingView: the bulletins a listing gives with its items",()=>{
 const l=lst(["golf"],{kind:"offer"});l.give.bulletins=3;
 assert.equal(U.listingView(l,st(),"").giveBulletins,3);
 assert.equal(U.listingView(lst(["golf"],{kind:"offer"}),st(),"").giveBulletins,0);
});

// ---------------------------------------------------------------- candidates (the rarity pick)
test("candidates: owned, tradable, of the rarity and the slot asked",()=>{
 const S=st(["chasuble","troispieces","microtv","bleutravail","camarade","giletjaune"]);
 assert.deepEqual(U.candidates(S,{kind:"rarity",rarity:"rare",slot:"outfit"}),["chasuble","troispieces","giletjaune"]);
 assert.deepEqual(U.candidates(S,{kind:"rarity",rarity:"rare",slot:"object"}),["microtv"]);
 assert.deepEqual(U.candidates(S,{kind:"rarity",rarity:"rare",slot:"any"}),["chasuble","troispieces","microtv","giletjaune"]);
 assert.deepEqual(U.candidates(S,{kind:"rarity",rarity:"ultra",slot:"any"}),[]);   // never the excluded
 assert.deepEqual(U.candidates(S,{kind:"items",items:["chasuble"]}),[]);
});

// ---------------------------------------------------------------- forMe
test("forMe: only the listings one can take right now (never the offers-only ones)",()=>{
 const S=st(["baguette","chasuble"],{bulletins:2});
 const a=lst(["golf"],{kind:"items",items:["baguette"],bulletins:0},{id:1});
 const b=lst(["golf"],{kind:"items",items:["cle"],bulletins:0},{id:2});
 const c=lst(["golf"],{kind:"offer"},{id:3});
 const d=lst(["fumigene"],{kind:"rarity",rarity:"rare",slot:"outfit",bulletins:0},{id:4});
 const e=lst(["sifflet"],{kind:"bulletins",bulletins:3},{id:5});
 assert.deepEqual(U.forMe([a,b,c,d,e],S,"").map(l=>l.id),[1,4]);
 assert.deepEqual(U.forMe([a,b,c,d,e],S,"Ton compte est trop récent pour la Brocante."),[]);
 assert.deepEqual(U.forMe([],S,""),[]);assert.deepEqual(U.forMe(null,S,""),[]);
});

// ---------------------------------------------------------------- pickable
test("pickable: the deposit greys the excluded and what is already in a listing",()=>{
 const S=st(["chasuble","camarade","baguette","megaphone"]);
 assert.deepEqual(U.pickable(S,"list",["baguette"]),[
  {id:"chasuble",ok:true,why:""},{id:"camarade",ok:false,why:"Ne s'échange pas"},
  {id:"baguette",ok:false,why:"Déjà dans une annonce"},{id:"megaphone",ok:true,why:""}]);
});
test("pickable: an offer only badges what is in a listing (« En vitrine »), the excluded stay greyed",()=>{
 const S=st(["chasuble","camarade","baguette","baton"]);
 assert.deepEqual(U.pickable(S,"offer",new Set(["baguette"])),[
  {id:"chasuble",ok:true,why:""},{id:"camarade",ok:false,why:"Ne s'échange pas"},
  {id:"baguette",ok:true,why:"En vitrine"},{id:"baton",ok:false,why:"Ne s'échange pas"}]);
 assert.deepEqual(U.pickable(st(),"offer",[]),[]);
 assert.deepEqual(U.pickable(S,"list",undefined).map(x=>x.ok),[true,false,true,false]);
});

// ---------------------------------------------------------------- tradeRecap
test("tradeRecap: what I give and receive, the worn piece leaving, a listing that closes",()=>{
 const S=st(["chasuble","baguette"],{bulletins:5,worn:{outfit:"chasuble",object:null}});
 const want={kind:"rarity",rarity:"rare",slot:"outfit",bulletins:2};
 const none=U.tradeRecap(lst(["golf"],want),S,null,[]);
 assert.deepEqual(none.give,{items:[],bulletins:2});assert.equal(none.ready,false);
 const r=U.tradeRecap(lst(["golf"],want),S,"chasuble",["chasuble"]);
 assert.deepEqual(r.give,{items:["chasuble"],bulletins:2});assert.deepEqual(r.get,{items:["golf"],bulletins:0});
 assert.equal(r.ready,true);
 assert.deepEqual(r.worn,["Chasuble syndicale"]);assert.deepEqual(r.closes,["Chasuble syndicale"]);
 // a pick that does not match is not taken
 assert.equal(U.tradeRecap(lst(["golf"],want),S,"baguette",[]).ready,false);
 const it=U.tradeRecap(lst(["golf"],{kind:"items",items:["baguette"],bulletins:0}),S,null,[]);
 assert.deepEqual(it.give,{items:["baguette"],bulletins:0});assert.equal(it.ready,true);assert.deepEqual(it.worn,[]);assert.deepEqual(it.closes,[]);
 const b=U.tradeRecap(lst(["golf"],{kind:"bulletins",bulletins:4}),S,null,[]);
 assert.deepEqual(b.give,{items:[],bulletins:4});assert.equal(b.ready,true);
 assert.equal(U.tradeRecap(lst(["golf"],{kind:"offer"}),S,null,[]).ready,false);
});

// ---------------------------------------------------------------- offerCheck
test("offerCheck: gate, already sent, refused before, received twice, five pending",()=>{
 const l=lst(["golf"],{kind:"offer"},{id:9});
 assert.deepEqual(U.offerCheck(l,st(),[],""),{ok:true,why:"",sent:false});
 assert.deepEqual(U.offerCheck(l,st(),[],"Échanges à partir du niveau 5."),{ok:false,why:"Échanges à partir du niveau 5.",sent:false});
 assert.deepEqual(U.offerCheck(l,st(),[{id:1,listingId:9,status:"pending"}],""),{ok:false,why:"Offre envoyée : en attente de réponse",sent:true});
 assert.deepEqual(U.offerCheck(l,st(),[{id:1,listingId:9,status:"refused"}],""),{ok:false,why:"Ton offre sur cette annonce a été refusée",sent:false});
 assert.deepEqual(U.offerCheck(l,st(["golf"]),[],""),{ok:false,why:"Déjà dans ta garde-robe : Club de golf",sent:false});
 const five=[1,2,3,4,5].map(i=>({id:i,listingId:100+i,status:"pending"}));
 assert.deepEqual(U.offerCheck(l,st(),five,""),{ok:false,why:"5 offres en attente au plus",sent:false});
 // a withdrawn or closed one does not count
 assert.equal(U.offerCheck(l,st(),[{id:1,listingId:9,status:"withdrawn"},{id:2,listingId:9,status:"closed"}],"").ok,true);
});

// ---------------------------------------------------------------- freshIds
test("freshIds: the newCount newest listings of the board",()=>{
 const b=[{id:3,created:30},{id:1,created:10},{id:2,created:20}];
 assert.deepEqual([...U.freshIds(b,2)].sort(),[2,3]);
 assert.deepEqual([...U.freshIds(b,0)],[]);assert.deepEqual([...U.freshIds(b,9)].sort(),[1,2,3]);
 assert.deepEqual([...U.freshIds(null,2)],[]);
});

// ---------------------------------------------------------------- catalogue
test("catalogue: every tradable item not owned, grouped by kind and rarity; never the excluded",()=>{
 const S=st(["baguette"]);
 const g=U.catalogue(S,["megaphone"]);
 assert.deepEqual(g.map(x=>x.label).slice(0,2),["Tenues · Commun","Objets · Commun"]);
 const ids=g.flatMap(x=>x.items.map(i=>i.id));
 assert.ok(!ids.includes("baguette"));assert.ok(!ids.includes("megaphone"));
 for(const bad of ["camarade","sacre","baton"])assert.ok(!ids.includes(bad),bad);
 assert.ok(ids.includes("pantalonrouge")&&ids.includes("chasuble"));   // both camps' items
 const pr=g.flatMap(x=>x.items).find(i=>i.id==="pantalonrouge");assert.equal(pr.label,"Pantalon rouge (droite)");
 assert.equal(g.flatMap(x=>x.items).find(i=>i.id==="cocarde").label,"Cocarde");
 for(const x of g)assert.ok(!/ultra|mythique/i.test(x.label));
});

test("listingView, tradeRecap: a listing whose want is null or missing never throws",()=>{
 for(const want of [null,undefined]){
  const l=lst(["golf"],want);
  const v=U.listingView(l,st(["baguette"]),"");
  assert.equal(v.takeOk,false);assert.equal(v.takeWhy,"Cette annonce n'est plus disponible.");assert.equal(v.wantText,"");assert.equal(v.offerOnly,false);
  assert.equal(U.tradeRecap(l,st(),null,[]).ready,false);
  assert.deepEqual(U.forMe([l],st(),""),[]);
 }
});
