// La Garde-robe and the Tombola / Loterie (web/wardrobe.mjs), through the rules' act (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as R from "../web/rules.mjs";
import * as W from "../web/wardrobe.mjs";

const {H}=R;
R.setTimeZone("Europe/Paris");
const MIDNIGHT=Date.UTC(2026,0,4,23,0);          // 00:00 in Paris on 2026-01-05
const at=h=>MIDNIGHT+h*H;
const never=()=>0.99;                             // a commun every time, and never the mythic roll
function game(camp="left",h=10){const S=R.newGame(camp,at(h));R.advance(S,at(h),1,never);return S;}
const play=(S,a,h=10,random=never,mythic)=>R.act(S,a,{now:at(h),random,mythic});
const seq=(...v)=>{let i=0;return ()=>v[Math.min(i++,v.length-1)];};
const eligible=(extra={})=>{const m={available:true,ageDays:40,clean:true,calls:0,ok:true,...extra};m.claim=()=>{m.calls++;return m.ok;};return m;};

const SPEC={
 left:{ultra:["camarade"],epique:["frontpop","rivegauche"],rare:["chasuble","cheminot","cycliste"],commun:["bleutravail","bobhuma","mariniere","kway"]},
 right:{ultra:["sacre"],epique:["general58","venerie"],rare:["troispieces","golfeur","panama"],commun:["pullepaules","doudoune","chasse","blazer"]},
 objects:{all:"megaphone cocarde baguette parapluie bulletin microtv selfie sondage urne megasaucisse cle echarpe baton",
  left:"merguez brassard tract fumigene banderole velocargo capital grossesaucisse drapeaurouge marteau transfugeL",
  right:"croissant mallette codecivil painchoc golf calculatrice karcher tricolore sceptre transfugeR"}
};

test("the catalogue: every id of the contract, with its kind, pool and rarity",()=>{
 assert.deepEqual(W.RARITIES,["commun","rare","epique","legendaire","ultra","mythique"]);
 for(const r of W.RARITIES){assert.ok(W.RARITY_LABEL[r]);assert.match(W.RARITY_COLOR[r],/^#[0-9a-f]{6}$/);}
 for(const camp of ["left","right"])for(const [r,ids] of Object.entries(SPEC[camp]))for(const id of ids)
  assert.deepEqual([W.ITEMS[id].kind,W.ITEMS[id].pool,W.ITEMS[id].rarity],["outfit",camp,r],id);
 assert.deepEqual([W.ITEMS.giletjaune.kind,W.ITEMS.giletjaune.pool,W.ITEMS.giletjaune.rarity],["outfit","all","rare"]);
 for(const [pool,ids] of Object.entries(SPEC.objects))for(const id of ids.split(" "))assert.equal(W.ITEMS[id]?.kind+W.ITEMS[id]?.pool,"object"+pool,id);
 assert.equal(Object.keys(W.ITEMS).length,21+34);
 assert.equal(W.ITEMS.baton.rarity,"mythique");assert.equal(W.ITEMS.grossesaucisse.rarity,"epique");
 for(const it of Object.values(W.ITEMS)){assert.ok(it.name&&it.desc);}
 assert.equal(W.ITEMS.camarade.name,"Le Camarade, 1917");assert.equal(W.ITEMS.blazer.desc,"Boutons dorés, écusson.");
 assert.ok(!Object.values(W.ITEMS).some(it=>it.kind==="outfit"&&it.rarity==="legendaire"),"no legendary outfit");
});

test("the pools: shared items (the gilet jaune too) and the camp's own, never the other camp's nor the staff",()=>{
 assert.deepEqual(W.poolItems("left","ultra"),["camarade"]);assert.deepEqual(W.poolItems("right","ultra"),["sacre"]);
 for(const camp of ["left","right"]){
  const rare=W.poolItems(camp,"rare");assert.ok(rare.includes("giletjaune"));assert.ok(rare.includes("microtv"));
  for(const r of W.RARITIES)for(const id of W.poolItems(camp,r))assert.ok(["all",camp].includes(W.ITEMS[id].pool));
 }
 assert.ok(!W.poolItems("left","legendaire").includes("transfugeR"));assert.ok(W.poolItems("left","legendaire").includes("transfugeL"));
 assert.deepEqual(W.poolItems("left","mythique"),[]);
});

test("one free draw a calendar day, then a bulletin each",()=>{
 const S=game();
 assert.equal(W.drawBlock(S,"free"),"");
 const r=play(S,{type:"draw",pay:"free"});
 assert.ok(r.ok);assert.equal(r.item.rarity,"commun");assert.equal(r.dup,false);assert.equal(r.confetti,0);assert.ok(S.wardrobe.own.includes(r.item.id));
 assert.equal(S.wardrobe.freeDay,20260105);
 assert.match(play(S,{type:"draw",pay:"free"},11).error,/demain/);
 assert.match(play(S,{type:"draw",pay:"bulletin"},11).error,/Pas de bulletin/);
 assert.match(play(S,{type:"draw",pay:"gold"},11).error,/inconnu/);
 S.wardrobe.bulletins=2;const xp=S.xp,fm=S.fm;
 assert.ok(play(S,{type:"draw",pay:"bulletin"},11).ok);assert.equal(S.wardrobe.bulletins,1);
 assert.equal(S.xp,xp);assert.equal(S.fm,fm,"cosmetics only");
 assert.equal(S.journal[0].k,"draw");assert.match(S.journal[0].text,/Tombola de la Fête/);
 R.advance(S,at(24+8),1,never);assert.equal(W.drawBlock(S,"free"),"","free again the next day");
 const T=game("right");play(T,{type:"draw",pay:"free"});assert.match(T.journal[0].text,/Loterie du Gala/);
});

test("the odds: 60 / 28 / 9.5 / 2 / 0.5 % from the roll",()=>{
 const roll=x=>{const S=game();S.wardrobe.pity={epique:0,legendaire:0,ultra:0};return play(S,{type:"draw",pay:"free"},10,seq(x,0)).item.rarity;};
 assert.equal(roll(0),"ultra");assert.equal(roll(0.0049),"ultra");assert.equal(roll(0.005),"legendaire");
 assert.equal(roll(0.0249),"legendaire");assert.equal(roll(0.025),"epique");assert.equal(roll(0.1199),"epique");
 assert.equal(roll(0.12),"rare");assert.equal(roll(0.3999),"rare");assert.equal(roll(0.4),"commun");assert.equal(roll(0.999),"commun");
 // Over many seeded draws the shares follow the table, pity lifting the upper tiers a little at commun's expense.
 const S=game();S.wardrobe.bulletins=9999;const n={commun:0,rare:0,epique:0,legendaire:0,ultra:0},rnd=R.seeded(42);
 for(let i=0;i<5000;i++)n[play(S,{type:"draw",pay:"bulletin"},10,rnd).item.rarity]++;
 const f=k=>n[k]/5000;
 assert.ok(f("commun")>0.53&&f("commun")<0.6,JSON.stringify(n));assert.ok(Math.abs(f("rare")-0.28)<0.03);
 assert.ok(f("epique")>0.09&&f("epique")<0.16);assert.ok(f("legendaire")>0.015&&f("ultra")>0.004&&f("ultra")<0.02);
});

test("pity: an épique at the 10th draw without one, a légendaire at the 50th, the ultra at the 80th",()=>{
 const S=game();S.wardrobe.bulletins=200;const got=[];
 for(let i=1;i<=80;i++)got.push(play(S,{type:"draw",pay:"bulletin"},10,never).item.rarity);
 assert.deepEqual(got.slice(0,10),[..."ccccccccc"].map(()=>"commun").concat("epique"));
 assert.equal(got[19],"epique");assert.equal(got[49],"legendaire");assert.equal(got[79],"ultra");
 assert.equal(got.filter(r=>r==="epique").length,6,"10, 20, 30, 40, 60, 70");
 assert.deepEqual(S.wardrobe.pity,{epique:0,legendaire:0,ultra:0});assert.equal(S.wardrobe.draws,80);
 assert.ok(S.wardrobe.own.includes("camarade"));
 const T=game();T.wardrobe.bulletins=5;T.wardrobe.pity={epique:3,legendaire:20,ultra:20};
 play(T,{type:"draw",pay:"bulletin"},10,seq(0.1,0));   // an épique rolled resets only the épique counter
 assert.deepEqual(T.wardrobe.pity,{epique:0,legendaire:21,ultra:21});
 play(T,{type:"draw",pay:"bulletin"},10,seq(0.01,0));   // a légendaire resets the two lower counters
 assert.deepEqual(T.wardrobe.pity,{epique:0,legendaire:0,ultra:22});
});

test("a duplicate turns into confetti; 100 confetti buy a missing commun, rare or épique",()=>{
 const S=game();S.wardrobe.bulletins=50;
 const first=play(S,{type:"draw",pay:"bulletin"},10,seq(0.5,0));
 const dup=play(S,{type:"draw",pay:"bulletin"},10,seq(0.5,0));
 assert.equal(dup.item.id,first.item.id);assert.equal(dup.dup,true);assert.equal(dup.confetti,5);assert.equal(S.wardrobe.confetti,5);
 assert.equal(S.wardrobe.own.filter(id=>id===first.item.id).length,1);
 const r=game();r.wardrobe.own=["camarade"];r.wardrobe.pity.ultra=79;r.wardrobe.bulletins=1;
 assert.equal(play(r,{type:"draw",pay:"bulletin"},10,never).confetti,100,"an ultra duplicate is worth 100");
 S.wardrobe.confetti=99;
 assert.match(play(S,{type:"exchange",id:"urne"}).error,/100 confettis/);
 S.wardrobe.confetti=250;
 assert.match(play(S,{type:"exchange",id:"cle"}).error,/ne s'échange pas/,"légendaire");
 assert.match(play(S,{type:"exchange",id:"sacre"}).error,/ne s'échange pas/,"the other camp's");
 assert.match(play(S,{type:"exchange",id:"camarade"}).error,/ne s'échange pas/,"ultra");
 assert.match(play(S,{type:"exchange",id:"baton"}).error,/ne s'échange pas/);
 assert.match(play(S,{type:"exchange",id:first.item.id}).error,/Déjà/);
 const ok=play(S,{type:"exchange",id:"giletjaune"});assert.ok(ok.ok);assert.equal(S.wardrobe.confetti,150);assert.ok(S.wardrobe.own.includes("giletjaune"));
 const T=game("right");T.wardrobe.confetti=100;assert.ok(play(T,{type:"exchange",id:"giletjaune"}).ok,"the gilet jaune is in both camps");
});

test("wear: owned items only, of the right kind; null takes it off",()=>{
 const S=game();S.wardrobe.own=["kway","megaphone"];
 assert.match(play(S,{type:"wear",kind:"outfit",id:"cycliste"}).error,/Pas encore/);
 assert.match(play(S,{type:"wear",kind:"outfit",id:"megaphone"}).error,/inconnu/);
 assert.match(play(S,{type:"wear",kind:"hat",id:"kway"}).error,/Emplacement/);
 assert.ok(play(S,{type:"wear",kind:"outfit",id:"kway"}).ok);assert.ok(play(S,{type:"wear",kind:"object",id:"megaphone"}).ok);
 assert.deepEqual(S.wardrobe.worn,{outfit:"kway",object:"megaphone"});
 assert.ok(play(S,{type:"wear",kind:"outfit",id:null}).ok);assert.equal(S.wardrobe.worn.outfit,null);
 assert.match(play(S,{type:"wear",kind:"object"}).error,/inconnu/,"a missing id is not a removal");
});

test("the transfuge card is flagged in the result",()=>{
 const S=game("right");S.wardrobe.bulletins=1;
 const ids=W.poolItems("right","legendaire"),i=ids.indexOf("transfugeR");
 const r=play(S,{type:"draw",pay:"bulletin"},10,seq(0.01,(i+0.5)/ids.length));
 assert.equal(r.item.id,"transfugeR");assert.equal(r.transfuge,true);
});

test("the mythic roll: only when available, clean, 30 days old and 300 Flamme; the server's claim decides",()=>{
 const S=game();S.flame.pts=300;
 assert.equal(W.mythicChance(S,eligible()),0.01);
 S.flame.pts=355;assert.equal(W.mythicChance(S,eligible()),0.015);
 S.flame.pts=5000;assert.equal(W.mythicChance(S,eligible()),0.03);
 S.flame.pts=299;assert.equal(W.mythicChance(S,eligible()),0);
 S.flame.pts=400;
 for(const m of [null,undefined,eligible({available:false}),eligible({clean:false}),eligible({ageDays:29}),eligible({ageDays:NaN}),{...eligible(),available:"yes"}]){
  assert.equal(W.mythicChance(S,m),0);assert.equal(W.urnHint(S,m),false);
 }
 assert.equal(W.urnHint(S,eligible()),true);assert.equal(W.urnHint(S,{mythic:eligible()}),true);
 // Not eligible: the claim is never called, whatever the roll.
 const off=eligible({ageDays:10});const r0=play(S,{type:"draw",pay:"free"},10,()=>0,off);
 assert.equal(off.calls,0);assert.notEqual(r0.item.id,"baton");
 // Eligible and lucky: the staff, owned but not worn.
 const T=game();T.flame.pts=400;T.wardrobe.own=["megaphone"];T.wardrobe.worn.object="megaphone";const m=eligible();
 const r=play(T,{type:"draw",pay:"free"},10,seq(0.0199,0.99),m);
 assert.equal(m.calls,1);assert.deepEqual(r,{ok:true,item:{id:"baton",kind:"object",rarity:"mythique"},dup:false,confetti:0,mythic:true});
 assert.ok(T.wardrobe.own.includes("baton"));assert.equal(T.wardrobe.worn.object,"megaphone");
 assert.ok(play(T,{type:"wear",kind:"object",id:"baton"}).ok);
 // Lucky but someone else claimed it first: a normal draw.
 const U=game();U.flame.pts=400;const lost=eligible({ok:false});
 const u=play(U,{type:"draw",pay:"free"},10,seq(0,0.99,0),lost);
 assert.equal(lost.calls,1);assert.equal(u.mythic,undefined);assert.equal(u.item.rarity,"commun");assert.ok(!U.wardrobe.own.includes("baton"));
 // Unlucky: no claim.
 const V=game();V.flame.pts=400;const miss=eligible();play(V,{type:"draw",pay:"free"},10,seq(0.0201,0.99),miss);assert.equal(miss.calls,0);
});

test("cosmetics survive a death and a change of camp; sanitize keeps only real, owned, worn-by-kind items",()=>{
 const S=game();S.wardrobe.own=["kway","cocarde"];S.wardrobe.worn={outfit:"kway",object:"cocarde"};S.wardrobe.confetti=40;S.wardrobe.pity.epique=7;
 const w=structuredClone(S.wardrobe);
 assert.ok(play(S,{type:"restart",camp:"right"}).ok);assert.deepEqual(S.wardrobe,w);
 const bad=structuredClone(S);
 bad.wardrobe={own:["kway","kway","nope",3,"__proto__","baton"],worn:{outfit:"cocarde",object:"baton"},confetti:-5,bulletins:1e9,freeDay:"x",pity:{epique:99,legendaire:-1,ultra:"3"},draws:2.6};
 const o=R.sanitize(bad,at(10)).wardrobe;
 assert.deepEqual(o,{own:["kway","baton"],worn:{outfit:null,object:"baton"},confetti:0,bulletins:9999,freeDay:-1,pity:{epique:9,legendaire:0,ultra:0},draws:3});
 assert.deepEqual(R.sanitize({...structuredClone(S),wardrobe:"x"},at(10)).wardrobe,W.freshWardrobe());
});
