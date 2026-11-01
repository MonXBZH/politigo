// Tests for the wardrobe's drawings (web/looks.mjs) and the legend's pure parts (web/legend.mjs): node --test, no DOM.
import {test} from "node:test";
import assert from "node:assert/strict";
import * as L from "../web/looks.mjs";
import * as G from "../web/legend.mjs";
import * as W from "../web/wardrobe.mjs";

// A 2D context that records every rectangle: enough for the pixel art (gradients and paths are no-ops).
function mockCtx(){
 const rects=[];
 const base={rects,fillStyle:"",strokeStyle:"",lineWidth:1,globalAlpha:1,globalCompositeOperation:"source-over",
  fillRect(x,y,w,h){rects.push([x,y,w,h,this.fillStyle]);},createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})};
 return new Proxy(base,{get:(o,k)=>k in o?o[k]:()=>{}});
}
const SPEC_IDS=["camarade","frontpop","rivegauche","chasuble","cheminot","cycliste","bleutravail","bobhuma","mariniere","kway",
 "sacre","general58","venerie","troispieces","golfeur","panama","pullepaules","doudoune","chasse","blazer","giletjaune",
 "megaphone","cocarde","baguette","parapluie","bulletin","microtv","selfie","sondage","urne","megasaucisse","cle","echarpe","baton",
 "merguez","brassard","tract","fumigene","banderole","velocargo","capital","drapeaurouge","marteau","transfugeL","grossesaucisse",
 "croissant","mallette","codecivil","painchoc","golf","calculatrice","karcher","tricolore","sceptre","transfugeR"];

test("every catalogue id (wardrobe.mjs ITEMS and the spec's list) has a drawing",()=>{
 for(const id of [...Object.keys(W.ITEMS),...SPEC_IDS])assert.ok(L.hasLook(id),`no look for ${id}`);
 for(const [id,it] of Object.entries(W.ITEMS))assert.ok(it.kind==="outfit"?!!L.outfitLook(id):Object.hasOwn(L.OBJECT_LOOKS,id),`${id}: drawn as the wrong kind`);
 assert.equal(L.hasLook("nope"),false);assert.equal(L.hasLook("constructor"),false);assert.equal(L.outfitLook("toString"),null);
});

test("every object draws inside the 64x64 grid, hand raised or not, at any time",()=>{
 for(const id of Object.keys(L.OBJECT_LOOKS))for(const lift of [0,5,9])for(const t of [0,137,999,4321]){
  const c=mockCtx();assert.equal(L.drawObject(c,id,46,43-lift,t),true);assert.ok(c.rects.length>0,id);
  for(const [x,y,w,h] of c.rects)assert.ok(x>=-1&&y>=-1&&x+w<=65&&y+h<=65,`${id} draws out of the grid at ${x},${y} (lift ${lift})`);
 }
 const c=mockCtx();assert.equal(L.drawObject(c,"nope",46,43,0),false);assert.equal(L.drawObject(c,null,46,43,0),false);assert.equal(c.rects.length,0);
});

test("every outfit layer runs without throwing and draws something",()=>{
 for(const [id,O] of Object.entries(L.OUTFIT_LOOKS)){
  const layers=["sky","back","front","head","fx"].filter(k=>typeof O[k]==="function");
  assert.ok(layers.length||O.coat,`${id} changes nothing`);
  for(const k of layers)for(const t of [0,500,12345]){const c=mockCtx();O[k](c,t);assert.ok(c.rects.length>0,`${id}.${k}`);}
 }
});

test("dressColors: an outfit recolours coat and shirt, its tie:null takes the tie off, no outfit keeps the élu's own",()=>{
 const p={coat:"#111",tie:"#e15f66"};
 assert.deepEqual(L.dressColors(null,p),{coat:"#111",shirt:"#f1e9da",tie:"#e15f66"});
 assert.deepEqual(L.dressColors(L.outfitLook("camarade"),p),{coat:"#6d6a58",shirt:"#6d6a58",tie:null});
 assert.deepEqual(L.dressColors(L.outfitLook("chasuble"),p),{coat:"#111",shirt:"#f1e9da",tie:"#e15f66"});   // a vest over his own suit
 assert.equal(L.dressColors(L.outfitLook("venerie"),p).tie,"#f4f1ea");
});

test("the transfuge cards show the other camp's card",()=>{
 const reds=id=>{const c=mockCtx();L.drawObject(c,id,46,43,0);return c.rects.map(r=>r[4]);};
 assert.ok(reds("transfugeL").includes("#1f3b78"),"the left player's card is the right's (blue)");
 assert.ok(reds("transfugeR").includes("#c41a28"),"the right player's card is the left's (red)");
});

test("the legend: 14 pictures, a caption each but the title, bold runs split without any HTML",()=>{
 assert.equal(G.SLIDES.length,14);
 assert.equal(G.SLIDES[0][1],"");for(const [draw,cap] of G.SLIDES.slice(1)){assert.equal(typeof draw,"function");assert.ok(cap.length>20);}
 assert.deepEqual(G.captionParts("a <b>b</b> c"),[{b:false,text:"a "},{b:true,text:"b"},{b:false,text:" c"}]);
 assert.deepEqual(G.captionParts("<b>x</b>"),[{b:true,text:"x"}]);
 for(const [,cap] of G.SLIDES)assert.ok(!/[<>]/.test(G.captionText(cap)),"a stray tag in a caption");
 assert.match(G.captionText(G.SLIDES[12][1]),/C'est lui qui te choisit\./);
});

test("every legend picture draws, animated and still (reduced motion)",()=>{
 for(let i=0;i<G.SLIDES.length;i++)for(const [t,red] of [[0,false],[2500,false],[9000,false],[0,true]]){const c=mockCtx();G.drawSlide(c,i,t,red);assert.ok(c.rects.length>0,`picture ${i+1}`);}
});

test("no spoiler: the staff's name only lives in the catalogue and the legend",()=>{
 assert.equal(W.ITEMS.baton.rarity,"mythique");assert.equal(W.ITEMS.baton.kind,"object");
 assert.ok(!W.poolItems("left","mythique").length&&!W.poolItems("right","mythique").length,"the staff is never in a regular pool");
});
