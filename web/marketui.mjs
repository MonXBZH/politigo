// La Brocante on screen: the pure pieces behind the Brocante sheets (app.js). No DOM, no clock, no I/O. The server
// checks everything again: these only say, before a tap, what it would answer.
import {ITEMS,RARITY_LABEL,copies} from "./wardrobe.mjs";
import {MARKET,tradable,dupes} from "./market.mjs";

const TRADE_RARITIES=["commun","rare","epique","legendaire"];
const nm=id=>ITEMS[id]?.name??id;
const campWord=c=>c==="left"?"gauche":c==="right"?"droite":"";
const own=S=>S?.wardrobe?.own??[];
// « une tenue Rare », « un objet Épique », « une tenue ou un objet Légendaire ».
export const kindWord=(slot,rarity)=>{const r=RARITY_LABEL[rarity]??"";return slot==="outfit"?`une tenue ${r}`:slot==="object"?`un objet ${r}`:`une tenue ou un objet ${r}`;};
export const itemView=id=>({id,name:nm(id),rarity:ITEMS[id]?.rarity??"commun",kind:ITEMS[id]?.kind??"object"});

// What a listing asks for, in one line.
export function wantText(w){
 if(!w||typeof w!=="object")return "";
 const chk=w.check===true?" · l'auteur valide":"",plus=w.bulletins?` + ${w.bulletins} 🗳️`:"";
 switch(w.kind){
  case "offer":return "Faites-moi une offre";
  case "bulletins":return `${w.bulletins} 🗳️`+chk;
  case "rarity":return kindWord(w.slot,w.rarity)+plus+chk;
  case "items":return (w.items??[]).map(nm).join(", ")+plus+chk;
 }
 return "";
}

// My items that answer a rarity want: owned, tradable, of that rarity and slot.
export function candidates(S,want){
 if(want?.kind!=="rarity")return [];
 return own(S).filter(id=>tradable(id)&&ITEMS[id].rarity===want.rarity&&(want.slot==="any"||ITEMS[id].kind===want.slot));
}

// A card of the board: who, what it gives, what it asks, and whether « Troquer » is open (else why not).
// block: the server's tradeBlock ("" when I may trade). A listing of offers only has no « Troquer » (offerOnly).
export function listingView(l,S,block){
 const w=l.want??{},gives=(l.give?.items??[]).map(itemView),offerOnly=w.kind==="offer"||w.check===true;
 const v={who:l.author?.name??"?",camp:l.author?.camp??null,campTag:campWord(l.author?.camp),gives,giveBulletins:l.give?.bulletins??0,
  wantText:wantText(w),takeOk:false,takeWhy:"",needsPick:w.kind==="rarity",offerOnly,checked:w.check===true};
 if(offerOnly)return v;
 const why=takeWhy(l,S,block);v.takeOk=!why;v.takeWhy=why;return v;
}
function takeWhy(l,S,block){
 if(block)return block;
 const has=own(S),dup=dupes(S,l.give?.items??[]);
 if(dup.length)return `Déjà au complet : ${dup.map(nm).join(", ")}`;
 const w=l.want??{},lack=[];
 if(!["items","rarity","bulletins"].includes(w.kind))return "Cette annonce n'est plus disponible.";   // unreadable: never taken
 if(w.kind==="items")lack.push(...(w.items??[]).filter(id=>!has.includes(id)).map(nm));
 if(w.kind==="rarity"&&!candidates(S,w).length)lack.push(kindWord(w.slot,w.rarity));
 const bal=S?.wardrobe?.bulletins??0;
 if((w.bulletins??0)>bal)lack.push(`${w.bulletins-bal} 🗳️`);
 return lack.length?`Il te manque : ${lack.join(", ")}`:"";
}

// The « Pour moi » tab: what I can take right now.
export const forMe=(board,S,block)=>(Array.isArray(board)?board:[]).filter(l=>listingView(l,S,block).takeOk);

// My wardrobe as a picker. purpose "list" (a deposit): what is in an open listing is greyed; "offer": only badged
// « En vitrine » (an offer blocks nothing). The excluded rarities are greyed, never named as such.
export function pickable(S,purpose,listedIds){
 const listed=new Set(listedIds??[]);
 return own(S).map(id=>{
  if(!tradable(id))return {id,ok:false,why:"Ne s'échange pas"};
  if(listed.has(id))return purpose==="list"?{id,ok:false,why:"Déjà dans une annonce"}:{id,ok:true,why:"En vitrine"};
  return {id,ok:true,why:""};
 });
}

// « Troquer »: what I give (the items asked, or the one picked for a rarity, and the bulletins), what I receive,
// the pieces I wear that would leave my élu, my listings that would close. ready: the server may be asked.
export function tradeRecap(l,S,pick,listedIds){
 const w=l.want??{},b=w.bulletins??0;
 const items=w.kind==="items"?[...(w.items??[])]:w.kind==="rarity"&&pick&&candidates(S,w).includes(pick)?[pick]:[];
 const give={items,bulletins:w.kind==="offer"?0:b},get={items:[...(l.give?.items??[])],bulletins:l.give?.bulletins??0};
 const wo=S?.wardrobe?.worn??{},listed=new Set(listedIds??[]),last=items.filter(id=>!(S?.wardrobe?.dup??[]).includes(id));   // a piece held twice stays
 const ready=w.kind==="items"||w.kind==="bulletins"||(w.kind==="rarity"&&items.length===1);
 return {give,get,ready,worn:last.filter(id=>wo.outfit===id||wo.object===id).map(nm),closes:last.filter(id=>listed.has(id)).map(nm)};
}

// « Faire une offre »: open, or why not. offers: mine (GET /api/market .offers, {listingId, status}).
export function offerCheck(l,S,offers,block){
 const mine=(Array.isArray(offers)?offers:[]).filter(o=>o.listingId===l.id);
 if(mine.some(o=>o.status==="pending"))return {ok:false,why:"Offre envoyée : en attente de réponse",sent:true};
 if(block)return {ok:false,why:block,sent:false};
 if(mine.some(o=>o.status==="refused"))return {ok:false,why:"Ton offre sur cette annonce a été refusée",sent:false};
 const dup=dupes(S,l.give?.items??[]);
 if(dup.length)return {ok:false,why:`Déjà au complet : ${dup.map(nm).join(", ")}`,sent:false};
 if((offers??[]).filter(o=>o.status==="pending").length>=MARKET.maxOffers)return {ok:false,why:`${MARKET.maxOffers} offres en attente au plus`,sent:false};
 return {ok:true,why:"",sent:false};
}

// The ids of the newCount newest listings (the server counts them, the cards wear « nouveau »).
export function freshIds(board,newCount){
 if(!Array.isArray(board)||!(newCount>0))return new Set();
 return new Set([...board].sort((a,b)=>(b.created??0)-(a.created??0)).slice(0,newCount).map(l=>l.id));
}

// What a deposit may ask for by name: every tradable item not held twice (both camps), by kind and rarity: a 2nd copy
// may be asked. A legendary is never named (it stays a surprise): « une tenue/un objet Légendaire » asks for one.
export function catalogue(S,exclude=[]){
 const have=new Set([...(S?.wardrobe?.dup??[]),...exclude]),out=[];
 for(const r of TRADE_RARITIES)for(const kind of ["outfit","object"]){
  const items=Object.keys(ITEMS).filter(id=>ITEMS[id].rarity===r&&r!=="legendaire"&&ITEMS[id].kind===kind&&tradable(id)&&!have.has(id))
   .map(id=>({id,label:`${nm(id)}${ITEMS[id].pool==="all"?"":` (${campWord(ITEMS[id].pool)})`}`}));
  if(items.length)out.push({label:`${kind==="outfit"?"Tenues":"Objets"} · ${RARITY_LABEL[r]}`,items});
 }
 return out;
}

// The pick sheet's rows (from pickable) filtered by kind / rarity / « doubles only », best rarity first then by name.
const RANK=["mythique","ultra","legendaire","epique","rare","commun"];
export function pickView(rows,{kind="all",rarity="all",dupOnly=false}={},S){
 return rows.filter(r=>(kind==="all"||ITEMS[r.id]?.kind===kind)&&(rarity==="all"||ITEMS[r.id]?.rarity===rarity)&&(!dupOnly||copies(S,r.id)===2))
  .map(r=>({...r,n:copies(S,r.id)}))
  .sort((a,b)=>RANK.indexOf(ITEMS[a.id]?.rarity)-RANK.indexOf(ITEMS[b.id]?.rarity)||nm(a.id).localeCompare(nm(b.id),"fr"));
}
