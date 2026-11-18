// La Brocante: the pure trading rules shared by the server and the browser (no clock, no DOM, no I/O).
import {ITEMS,RARITIES} from "./wardrobe.mjs";

export const MARKET={maxItems:3,maxListings:3,maxOffers:5,perDay:3,maxBulletins:20,minAgeMs:3*864e5,awayMs:14*864e5,excluded:["ultra","mythique"]};
const SLOTS=["outfit","object","any"];
const has=Object.prototype.hasOwnProperty;
// An item that can change hands: it exists and its rarity is not excluded.
export const tradable=id=>typeof id==="string"&&has.call(ITEMS,id)&&!MARKET.excluded.includes(ITEMS[id].rarity);
const bul=(v,min)=>Number.isInteger(v)&&v>=min&&v<=MARKET.maxBulletins;
const ids=(a,min)=>{
 if(!Array.isArray(a))return null;const u=[...new Set(a)];
 return u.length>=min&&u.length<=MARKET.maxItems&&u.every(tradable)?u:null;
};

export function cleanGive(x,{needItem=true}={}){
 if(!x||typeof x!=="object")return null;
 const items=ids(x.items,needItem?1:0),bulletins=x.bulletins??0;
 return items&&bul(bulletins,0)?{items,bulletins}:null;
}
export function cleanWant(x){
 if(!x||typeof x!=="object")return null;
 const b=x.bulletins??0;
 switch(x.kind){
  case "items":{const items=ids(x.items,1);return items&&bul(b,0)?{kind:"items",items,bulletins:b}:null;}
  case "rarity":return RARITIES.includes(x.rarity)&&!MARKET.excluded.includes(x.rarity)&&SLOTS.includes(x.slot)&&bul(b,0)?{kind:"rarity",rarity:x.rarity,slot:x.slot,bulletins:b}:null;
  case "bulletins":return bul(b,1)?{kind:"bulletins",bulletins:b}:null;
  case "offer":return {kind:"offer"};
 }
 return null;
}

// Does this give answer what the listing asks for?
export function satisfies(want,give){
 if(!want||!give)return false;
 switch(want.kind){
  case "items":return give.bulletins===want.bulletins&&give.items.length===want.items.length&&want.items.every(i=>give.items.includes(i));
  case "rarity":{
   if(give.bulletins!==want.bulletins||give.items.length!==1)return false;
   const it=ITEMS[give.items[0]];return !!it&&it.rarity===want.rarity&&(want.slot==="any"||it.kind===want.slot);
  }
  case "bulletins":return give.items.length===0&&give.bulletins===want.bulletins;
 }
 return false;
}

// "" when S holds everything the give asks for, else the French reason.
export function missing(S,give){
 const W=S.wardrobe,lack=give.items.filter(i=>!W.own.includes(i));
 if(lack.length)return `Il te manque : ${lack.map(i=>ITEMS[i]?.name??i).join(", ")}`;
 if(give.bulletins>W.bulletins)return `Il te manque ${give.bulletins} bulletins`;
 return "";
}
export const dupes=(S,list)=>list.filter(i=>S.wardrobe.own.includes(i));

// The referee: everything is validated before anything moves (well-formed gives, two states, holdings, no dupe received).
export function applyTrade(Sa,aGives,Sb,bGives){
 const same=(g,c)=>!!g&&!!c&&g.items.length===c.items.length&&g.items.every((x,i)=>x===c.items[i])&&g.bulletins===c.bulletins;
 if(Sa===Sb||!same(aGives,cleanGive(aGives,{needItem:false}))||!same(bGives,cleanGive(bGives,{needItem:false})))throw new Error("Échange invalide.");
 const ma=missing(Sa,aGives)||missing(Sb,bGives);if(ma)throw new Error(ma);
 if(dupes(Sb,aGives.items).length||dupes(Sa,bGives.items).length)throw new Error("Objet déjà possédé");
 const move=(S,out,inn,bOut,bIn)=>{
  const W=S.wardrobe;W.own=W.own.filter(i=>!out.includes(i));
  for(const k of ["outfit","object"])if(out.includes(W.worn[k]))W.worn[k]=null;
  W.own.push(...inn);W.bulletins+=bIn-bOut;
 };
 move(Sa,aGives.items,bGives.items,aGives.bulletins,bGives.bulletins);
 move(Sb,bGives.items,aGives.items,bGives.bulletins,aGives.bulletins);
}

// "" when the player may trade now, else the French reason (account age and today's count come from the caller).
export function tradeBlock(S,{minLevel,ageMs,today}){
 if((S.lvl|0)<minLevel)return `Échanges à partir du niveau ${minLevel}.`;
 if(!(typeof ageMs==="number"&&ageMs>=MARKET.minAgeMs))return "Ton compte est trop récent pour la Brocante.";
 if(!(typeof today==="number"&&today<MARKET.perDay))return `${MARKET.perDay} échanges aujourd'hui : reviens demain.`;
 return "";
}
