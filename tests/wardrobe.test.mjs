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
 assert.equal(Object.keys(W.ITEMS).length,41+54+35);
 assert.equal(W.ITEMS.baton.rarity,"mythique");assert.equal(W.ITEMS.grossesaucisse.rarity,"epique");
 for(const it of Object.values(W.ITEMS)){assert.ok(it.name&&it.desc);}
 assert.equal(W.ITEMS.camarade.name,"Le Camarade, 1917");assert.equal(W.ITEMS.blazer.desc,"Boutons dorés, écusson.");
 const COUNT={left:{outfit:{commun:10,rare:8,epique:5,legendaire:2},object:{commun:9,rare:8,epique:6,legendaire:5}},
  right:{outfit:{commun:9,rare:8,epique:6,legendaire:2},object:{commun:9,rare:8,epique:5,legendaire:5}},
  all:{outfit:{commun:0,rare:2,epique:1,legendaire:0},object:{commun:7,rare:4,epique:4,legendaire:4}}};
 for(const [camp,kinds] of Object.entries(COUNT))for(const [kind,n] of Object.entries(kinds))for(const [r,c] of Object.entries(n))
  assert.equal(Object.values(W.ITEMS).filter(it=>it.kind===kind&&it.pool===camp&&it.rarity===r).length,c,`${camp} ${kind} ${r}`);
});

test("1.9.0, the satire wave: 35 pieces with their camp, kind and rarity, all drawable from their pools",()=>{
 const WAVE={
  left:{outfit:{legendaire:"hologramme",epique:"caviar",rare:"frondeur sanscravate",commun:"agetudiante bobo"},
   object:{legendaire:"comptesuisse phobie",epique:"rosesfanees",rare:"primairepop nupes",commun:"synthese petition"}},
  right:{outfit:{legendaire:"levallois",epique:"trocadero chouan",rare:"footing manifpourtous",commun:"enarque"},
   object:{legendaire:"bracelet bouclier",epique:"painvole",rare:"lingot courcomptes",commun:"giletquart cartefouquets"}},
  all:{outfit:{epique:"enmemetemps",rare:"marcheur"},object:{legendaire:"dissolution matignon",epique:"art493 homard",rare:"promesse",commun:"elements tweet"}}};
 let n=0;
 for(const [pool,kinds] of Object.entries(WAVE))for(const [kind,rs] of Object.entries(kinds))for(const [r,ids] of Object.entries(rs))for(const id of ids.split(" ")){
  n++;assert.deepEqual([W.ITEMS[id]?.kind,W.ITEMS[id]?.pool,W.ITEMS[id]?.rarity],[kind,pool,r],id);
  for(const camp of pool==="all"?["left","right"]:[pool])assert.ok(W.poolItems(camp,r).includes(id),`${id} drawable by ${camp}`);
  if(pool!=="all")assert.ok(!W.poolItems(pool==="left"?"right":"left",r).includes(id),`${id} stays in its camp`);
 }
 assert.equal(n,35);
 assert.match(W.ITEMS.bracelet.desc,/Sarkozy/);assert.match(W.ITEMS.phobie.desc,/Thévenoud/);
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
 assert.deepEqual(S.wardrobe.pity,{epique:0,legendaire:30,ultra:0},"the ultra leaves the légendaire counter alone");assert.equal(S.wardrobe.draws,80);
 assert.ok(S.wardrobe.own.includes("camarade"));
 const T=game();T.wardrobe.bulletins=5;T.wardrobe.pity={epique:3,legendaire:20,ultra:20};
 play(T,{type:"draw",pay:"bulletin"},10,seq(0.1,0));   // an épique rolled resets only the épique counter
 assert.deepEqual(T.wardrobe.pity,{epique:0,legendaire:21,ultra:21});
 play(T,{type:"draw",pay:"bulletin"},10,seq(0.01,0));   // a légendaire resets the two lower counters
 assert.deepEqual(T.wardrobe.pity,{epique:0,legendaire:0,ultra:22});
});

test("1.9.0: the ultra keeps the légendaire counter, the forced légendaire is a new one while any is missing",()=>{
 const S=game();S.wardrobe.bulletins=5;S.wardrobe.own=["camarade"];S.wardrobe.pity={epique:4,legendaire:30,ultra:79};
 const u=play(S,{type:"draw",pay:"bulletin"},10,never);
 assert.equal(u.item.rarity,"ultra");assert.equal(u.dup,true);
 assert.deepEqual(S.wardrobe.pity,{epique:0,legendaire:31,ultra:0},"an ultra (even a duplicate) resets épique and ultra only");
 const legs=W.poolItems("left","legendaire");assert.ok(legs.length>=10);
 const T=game();T.wardrobe.bulletins=5;T.wardrobe.own=legs.slice(0,-1);T.wardrobe.pity.legendaire=49;
 const g=play(T,{type:"draw",pay:"bulletin"},10,seq(0.99,0));   // the pick would be the first one, owned: the forced draw skips it
 assert.equal(g.item.rarity,"legendaire");assert.equal(g.item.id,legs.at(-1));assert.equal(g.dup,false);
 assert.equal(T.wardrobe.pity.legendaire,0);
 const F=game();F.wardrobe.bulletins=5;F.wardrobe.own=[...legs];F.wardrobe.pity.legendaire=49;
 const d=play(F,{type:"draw",pay:"bulletin"},10,seq(0.99,0));   // all owned: a duplicate, as before
 assert.equal(d.item.rarity,"legendaire");assert.equal(d.item.id,legs[0]);assert.equal(d.dup,true);
 const N=game();N.wardrobe.bulletins=5;N.wardrobe.own=[legs[0]];
 const r=play(N,{type:"draw",pay:"bulletin"},10,seq(0.01,0));   // 1.10.0 : un légendaire de chance est aussi un nouveau
 assert.equal(r.item.id,legs[1]);assert.equal(r.dup,false);
 const P=game();P.wardrobe.bulletins=5;P.wardrobe.pity={epique:0,legendaire:49,ultra:79};
 assert.equal(play(P,{type:"draw",pay:"bulletin"},10,never).item.rarity,"ultra");
 assert.equal(P.wardrobe.pity.legendaire,49,"both due: the ultra first, the légendaire stays due for the next draw");
 assert.equal(play(P,{type:"draw",pay:"bulletin"},10,never).item.rarity,"legendaire");
});

test("a duplicate turns into confetti; 100 confetti buy a missing commun, rare or épique",()=>{
 const S=game();S.wardrobe.bulletins=50;
 const first=play(S,{type:"draw",pay:"bulletin"},10,seq(0.5,0));
 play(S,{type:"draw",pay:"bulletin"},10,seq(0.5,0));   // 1.10.0 : the 2nd copy stacks, the 3rd is confetti
 const dup=play(S,{type:"draw",pay:"bulletin"},10,seq(0.5,0));
 assert.equal(dup.item.id,first.item.id);assert.equal(dup.dup,true);assert.equal(dup.confetti,5);assert.equal(S.wardrobe.confetti,5);
 assert.equal(S.wardrobe.own.filter(id=>id===first.item.id).length,1);
 const r=game();r.wardrobe.own=["camarade"];r.wardrobe.pity.ultra=79;r.wardrobe.bulletins=1;
 assert.equal(play(r,{type:"draw",pay:"bulletin"},10,never).confetti,100,"an ultra duplicate is worth 100");
 assert.deepEqual(W.EXCHANGE.cost,{commun:100,rare:200,epique:300,legendaire:500});
 S.wardrobe.confetti=299;
 assert.match(play(S,{type:"exchange",id:"urne"}).error,/300 confettis/,"épique");
 S.wardrobe.confetti=199;
 assert.match(play(S,{type:"exchange",id:"giletjaune"}).error,/200 confettis/,"rare");
 S.wardrobe.confetti=99;
 assert.match(play(S,{type:"exchange",id:"kway"}).error,/100 confettis/,"commun");
 S.wardrobe.confetti=350;
 assert.match(play(S,{type:"exchange",id:"cle"}).error,/500 confettis/,"légendaire, 1.10.0");
 assert.match(play(S,{type:"exchange",id:"sacre"}).error,/ne s'échange pas/,"the other camp's");
 assert.match(play(S,{type:"exchange",id:"camarade"}).error,/ne s'échange pas/,"ultra");
 assert.match(play(S,{type:"exchange",id:"baton"}).error,/ne s'échange pas/);
 assert.match(play(S,{type:"exchange",id:first.item.id}).error,/Déjà/);
 const ok=play(S,{type:"exchange",id:"giletjaune"});assert.ok(ok.ok);assert.equal(S.wardrobe.confetti,150);assert.ok(S.wardrobe.own.includes("giletjaune"));
 S.wardrobe.confetti=300;assert.ok(play(S,{type:"exchange",id:"urne"}).ok);assert.equal(S.wardrobe.confetti,0);
 S.wardrobe.confetti=100;assert.ok(play(S,{type:"exchange",id:"kway"}).ok);assert.equal(S.wardrobe.confetti,0);
 const T=game("right");T.wardrobe.confetti=200;assert.ok(play(T,{type:"exchange",id:"giletjaune"}).ok,"the gilet jaune is in both camps");
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

test("the mythic roll: only when available, clean, 21 days old and 300 Flamme; the server's claim decides",()=>{
 const S=game();S.flame.pts=300;
 assert.equal(W.mythicChance(S,eligible()),0.01);
 S.flame.pts=355;assert.equal(W.mythicChance(S,eligible()),0.015);
 S.flame.pts=5000;assert.equal(W.mythicChance(S,eligible()),0.03);
 S.flame.pts=299;assert.equal(W.mythicChance(S,eligible()),0);
 S.flame.pts=400;
 for(const m of [null,undefined,eligible({available:false}),eligible({clean:false}),eligible({ageDays:20}),eligible({ageDays:NaN}),{...eligible(),available:"yes"}]){
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
 assert.deepEqual(o,{own:["kway","baton"],worn:{outfit:null,object:"baton"},confetti:0,bulletins:9999,freeDay:-1,pity:{epique:9,legendaire:0,ultra:0},draws:3,dup:[],noStack:[]});
 assert.deepEqual(R.sanitize({...structuredClone(S),wardrobe:"x"},at(10)).wardrobe,W.freshWardrobe());
});

test("1.10.0 : un doublon se cumule (2 au plus), le 3e et les réglés « confettis » donnent des confettis",()=>{
 const S=game();S.wardrobe.bulletins=5;const id=W.poolItems("left","commun")[0];S.wardrobe.own=[id];
 const a=play(S,{type:"draw",pay:"bulletin"},10,seq(0.99,0));
 assert.equal(a.item.id,id);assert.equal(a.dup,true);assert.equal(a.stacked,true);assert.equal(a.confetti,0);
 assert.deepEqual(S.wardrobe.dup,[id]);assert.equal(W.copies(S,id),2);
 const b=play(S,{type:"draw",pay:"bulletin"},10,seq(0.99,0));
 assert.equal(b.stacked,false);assert.equal(b.confetti,5);assert.equal(W.copies(S,id),2);
 const T=game();T.wardrobe.bulletins=5;T.wardrobe.own=[id];T.wardrobe.noStack=[id];
 const c=play(T,{type:"draw",pay:"bulletin"},10,seq(0.99,0));
 assert.equal(c.stacked,false);assert.equal(c.confetti,5);assert.deepEqual(T.wardrobe.dup,[]);
});
test("1.10.0 : un ultra en double reste 100 confettis, jamais cumulé",()=>{
 const S=game();S.wardrobe.bulletins=5;const u=W.poolItems("left","ultra")[0];S.wardrobe.own=[u];S.wardrobe.pity.ultra=79;
 const r=play(S,{type:"draw",pay:"bulletin"},10,never);
 assert.equal(r.item.id,u);assert.equal(r.stacked,false);assert.equal(r.confetti,100);assert.deepEqual(S.wardrobe.dup,[]);
});
test("1.10.0 : revendre un exemplaire, puis tout ; la pièce portée est ôtée quand la dernière part",()=>{
 const S=game();const id=W.poolItems("left","rare").find(i=>W.ITEMS[i].kind==="outfit");
 S.wardrobe.own=[id];S.wardrobe.dup=[id];S.wardrobe.worn.outfit=id;
 const one=play(S,{type:"sell",id,all:false});
 assert.deepEqual(one,{ok:true,n:1,confetti:10,gone:false});assert.equal(S.wardrobe.worn.outfit,id);assert.equal(W.copies(S,id),1);
 S.wardrobe.dup=[id];
 const all=play(S,{type:"sell",id,all:true});
 assert.deepEqual(all,{ok:true,n:2,confetti:20,gone:true});assert.equal(S.wardrobe.worn.outfit,null);assert.equal(W.copies(S,id),0);
 assert.equal(S.wardrobe.confetti,30);
 assert.equal(play(S,{type:"sell",id,all:false}).ok,false,"plus possédée");
 const U=game();const u=W.poolItems("left","ultra")[0];U.wardrobe.own=[u];
 assert.equal(play(U,{type:"sell",id:u,all:false}).ok,false,"un ultra ne se revend pas");
});
test("1.10.0 : le réglage « Doubles en confettis » s'active et se retire, sans toucher au 2e exemplaire",()=>{
 const S=game();const id=W.poolItems("left","epique")[0];S.wardrobe.own=[id];S.wardrobe.dup=[id];
 assert.ok(play(S,{type:"stack",id,on:false}).ok);assert.deepEqual(S.wardrobe.noStack,[id]);assert.deepEqual(S.wardrobe.dup,[id]);
 assert.ok(play(S,{type:"stack",id,on:true}).ok);assert.deepEqual(S.wardrobe.noStack,[]);
 assert.equal(play(S,{type:"stack",id:W.poolItems("left","ultra")[0],on:false}).ok,false);
});
test("1.10.0 : sanitize garde dup ⊂ own et cumulable, noStack cumulable ; une vieille sauvegarde a deux listes vides",()=>{
 const c=W.poolItems("left","commun")[0],r=W.poolItems("left","rare")[0],u=W.poolItems("left","ultra")[0];
 const o=W.sanitizeWardrobe({own:[c,u],dup:[c,c,r,u,"zz"],noStack:[r,u,r,"zz"]});
 assert.deepEqual(o.dup,[c]);assert.deepEqual(o.noStack,[r]);
 const old=W.sanitizeWardrobe({own:[c]});assert.deepEqual(old.dup,[]);assert.deepEqual(old.noStack,[]);
});
test("1.10.0 : la boutique vend un légendaire manquant 500 confettis",()=>{
 const S=game();const l=W.poolItems("left","legendaire")[0];S.wardrobe.confetti=499;
 assert.equal(play(S,{type:"exchange",id:l}).ok,false);
 S.wardrobe.confetti=500;assert.ok(play(S,{type:"exchange",id:l}).ok);assert.equal(S.wardrobe.confetti,0);assert.ok(S.wardrobe.own.includes(l));
});
