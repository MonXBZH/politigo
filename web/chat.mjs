// PolitiGo in-game chat (browser side): a "Tous" room and the player's camp room, inside the bottom sheet "chat".
// The top of the file is pure (no DOM: node --test imports it); createChat() builds the UI once, only from app.js,
// and updates it in place: the sheet is never redrawn wholesale, so the composer keeps its focus, caret and text.

// ===================================================================== PURE HELPERS
export const ROOMS=["global","camp"];
export const MAX_TEXT=500,PAGE=50,KEEP=400;
export const MEDIA_MAX=2*1024*1024;
export const MEDIA_TYPES=["image/gif","image/png","image/jpeg","image/webp"];
// ~80 common emojis, a few for political banter; inserted at the caret.
export const EMOJIS=[
 ["Visages",["😀","😂","🤣","😊","😉","😍","😘","😎","🤔","😏","🙄","😬","🤐","😴","😢","😭","😡","🤬","🤯","😱","🥳","😇","🤡","🤓","🫠","😅"]],
 ["Gestes",["👍","👎","👏","🙌","🙏","💪","✌️","🤞","👊","✊","🤝","👋","👀","🫡","🤷","🤦"]],
 ["Politique",["🗳️","🏛️","📢","🎤","🌹","🇫🇷","🇪🇺","⚖️","📜","🗞️","💼","🎙️","🚩","🏳️","🥖","🧀","🍷","🐓","💶","💸","📉","📈"]],
 ["Divers",["❤️","💔","🔥","💯","✨","⭐","🎉","🍾","☕","🍿","💀","👻","🎃","🌍","⚡","🤌"]]
];
// Same spirit as the server's cleaning: NFC, no control characters but the line break, no bidi or invisible marks
// (the zero-width joiner stays: emoji sequences need it), at most 2 combining marks in a row, at most one blank line in a row, trimmed.
export function cleanText(s){
 if(typeof s!=="string")return "";
 return s.normalize("NFC").replace(/\r\n?/g,"\n").replace(/\t/g," ").replace(/[؜​‌‎‏‪-‮⁠⁦-⁩﻿]/g,"")
  .replace(/[^\P{Cc}\n]/gu,"").replace(/(\p{M}{2})\p{M}+/gu,"$1").replace(/\n{3,}/g,"\n\n").trim();
}
// What blocks sending, in French; "" when the message may go.
export function textError(text,hasMedia=false){
 const t=cleanText(text);
 if(!t&&!hasMedia)return "Écris un message ou joins une image.";
 // Counted in code points like the server: an emoji is one character, not two UTF-16 halves.
 const n=[...t].length;
 if(n>MAX_TEXT)return `Message trop long : ${n}/${MAX_TEXT} caractères.`;
 return "";
}
// Checked before any upload: the server says the same, but only after 2 MB went up a phone's connection.
export function checkFile(f){
 if(!f||typeof f!=="object")return "Fichier illisible.";
 if(!MEDIA_TYPES.includes(String(f.type).toLowerCase()))return "Format non pris en charge : seulement des images GIF, PNG, JPEG ou WebP.";
 if(!(f.size>0))return "Image vide ou illisible.";
 if(f.size>MEDIA_MAX)return `Image trop lourde (${(f.size/1048576).toFixed(1).replace(".",",")} Mo) : 2 Mo au maximum.`;
 return "";
}
// The first image among pasted, dropped or keyboard-inserted files (Gboard and iOS GIFs arrive this way); else the
// first file, so that an unsupported one is still explained.
export function pickImage(files){
 const list=[...(files||[])].filter(f=>f&&typeof f==="object");
 return list.find(f=>MEDIA_TYPES.includes(String(f.type).toLowerCase()))||list.find(f=>String(f.type).startsWith("image/"))||null;
}
// Only ids the server could have made (base64url): anything else shows no image rather than a strange URL.
export function mediaUrl(m){return m&&typeof m.id==="string"&&/^[A-Za-z0-9_-]{8,64}$/.test(m.id)?`/api/chat/media/${m.id}`:"";}
export const roomLabel=(room,camp)=>room==="global"?"Tous":camp==="right"?"Ma droite":"Ma gauche";
// Desktop: Enter sends, Shift+Enter breaks the line. Touch: Enter breaks the line, only the button sends.
// Never sent by an Enter that is not really the player's: an IME composition, a held key, or the Enter that emoji
// panels (Win+., touch keyboards, DeX) inject to commit their emoji, within IME_GUARD ms of it (sinceIme).
export const IME_GUARD=500;
export function enterSends(e,{touch=false,sinceIme=Infinity}={}){
 if(e.key!=="Enter"||e.isComposing||e.keyCode===229||e.repeat)return false;
 if(sinceIme<IME_GUARD)return false;
 return !touch&&!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey;
}
// An input that an IME or an emoji panel made (and may follow with a stray Enter).
export function imeInput(inputType,data){
 if(inputType==="insertFromComposition"||inputType==="insertCompositionText")return true;
 return inputType==="insertText"&&typeof data==="string"&&/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(data);
}
// Touch-first device: no hover with a coarse pointer, or a touch screen without any fine hovering pointer (tablets, DeX).
export const isTouch=({coarseNoHover=false,fineHover=false,maxTouchPoints=0}={})=>coarseNoHover||(maxTouchPoints>0&&!fineHover);
export function insertAtCaret(value,start,end,ins){
 const a=Math.max(0,Math.min(start??value.length,value.length)),b=Math.max(a,Math.min(end??a,value.length));
 return {value:value.slice(0,a)+ins+value.slice(b),caret:a+ins.length};
}
export const atBottom=(top,height,scrollHeight,slack=48)=>scrollHeight-top-height<=slack;
export const badgeText=n=>n>9?"9+":String(n);
const dayKey=(t,tz)=>new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(t);
// "14:05" today, "hier 14:05", then "lun. 14:05" within the week (the history keeps 7 days), else "12/10 14:05".
export function fmtTime(t,now,tz="Europe/Paris"){
 if(!Number.isFinite(t))return "";
 const hm=new Intl.DateTimeFormat("fr-FR",{timeZone:tz,hour:"2-digit",minute:"2-digit"}).format(t),k=dayKey(t,tz);
 if(k===dayKey(now,tz))return hm;
 if(k===dayKey(now-86400000,tz))return `hier ${hm}`;
 if(now-t<6*86400000)return `${new Intl.DateTimeFormat("fr-FR",{timeZone:tz,weekday:"short"}).format(t)} ${hm}`;
 return `${new Intl.DateTimeFormat("fr-FR",{timeZone:tz,day:"2-digit",month:"2-digit"}).format(t)} ${hm}`;
}
export function fmtUntil(t,tz="Europe/Paris"){
 return Number.isFinite(t)?new Intl.DateTimeFormat("fr-FR",{timeZone:tz,weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(t):"";
}
// A message as the server sends it, or null: the page only ever draws what passes here.
export function validMsg(m){
 return !!m&&typeof m==="object"&&Number.isInteger(m.id)&&Number.isFinite(m.t)&&typeof m.author?.name==="string"&&(typeof m.text==="string"||!!m.media);
}
// Sorted by id, without duplicates (the answer to a send and its live echo race each other); the newest keep kept.
export function mergeMessages(list,add,keep=KEEP){
 const by=new Map();for(const m of [...list,...add])if(validMsg(m))by.set(m.id,m);
 const all=[...by.values()].sort((a,b)=>a.id-b.id);return all.length>keep?all.slice(-keep):all;
}
// The newest page, fetched again (sheet reopened, stream reconnected): it replaces what it covers, so messages deleted
// meanwhile go away; older pages already loaded stay (never trimmed here). A short page is the whole history.
export function mergeLatest(list,page,limit=PAGE){
 const p=page.filter(validMsg);
 if(p.length<limit)return mergeMessages([],p,Infinity);
 const min=Math.min(...p.map(m=>m.id));
 return mergeMessages(list.filter(m=>m.id<min),p,Infinity);
}
// The rooms the organisation opened (me.chat {global,camp}, both closed by default), in tab order.
export const chatRooms=flags=>ROOMS.filter(k=>flags?.[k]===true);
// The room to show: the current one while it stays open, else the first open one, else none.
export const pickRoom=(current,open)=>open.includes(current)?current:open[0]??null;
export const unreadTotal=u=>(Number(u?.global)||0)+(Number(u?.camp)||0);
const errFor=(status,error)=>status===413?"Image trop lourde : 2 Mo au maximum.":status===415?"Format non pris en charge : seulement des images GIF, PNG, JPEG ou WebP."
 :status===0?"Serveur injoignable : vérifie ta connexion.":error||"Erreur du serveur.";

// ===================================================================== UI (browser only)
// api: app.js api(); sheet: the #sheet element; getCamp/getTz: the player's camp and the game's time zone;
// onBadge(total): the pad button's badge; reduced(): reduced motion.
export function createChat({api,sheet,getCamp,getTz,onBadge,reduced,onClosed=()=>{}}){
 // Asked again at each use: a tablet gains or loses its keyboard and mouse.
 const touch=()=>isTouch({coarseNoHover:matchMedia("(hover:none) and (pointer:coarse)").matches,fineHover:matchMedia("(any-hover:hover) and (any-pointer:fine)").matches,maxTouchPoints:navigator.maxTouchPoints||0});
 const root=document.querySelector("#chat-tpl").content.firstElementChild.cloneNode(true);
 const q=s=>root.querySelector(s);
 const log=q(".chat-log"),listEl=q(".chat-list"),more=q(".chat-more"),pillBtn=q(".chat-pill"),form=q(".chat-form"),ta=q("textarea"),sendBtn=q(".chat-send");
 const emojiBtn=q(".chat-emoji-btn"),picker=q(".chat-emoji"),imgBtn=q(".chat-img-btn"),fileIn=q(".chat-file"),preview=q(".chat-preview"),previewImg=q(".chat-preview img");
 const errEl=q(".chat-error"),statusEl=q(".chat-status"),viewer=q(".chat-viewer"),viewerImg=q(".chat-viewer img"),tabs=[...root.querySelectorAll("[data-room]")],tabBar=q(".chat-tabs"),solo=q(".chat-solo");
 let open=[];                                                  // the rooms open right now (setOpen)
 const fresh=()=>({msgs:[],loaded:false,stale:false,more:true,loading:false,read:0});
 let rooms={global:fresh(),camp:fresh()},unread={global:0,camp:0},room="global",shown=false,campFor=null,pinned=true;
 let pending=null,previewUrl="",sending=false,mutedUntil=null,muteTimer=0,readTimer=0,menuOpen=null,viewerFrom=null,seq=0;
 const els=new Map();                                          // message id → its <li>, for the room on screen

 // ---------- emoji picker (built once) ----------
 for(const [name,list] of EMOJIS){
  const h=Object.assign(document.createElement("p"),{className:"chat-emoji-cat",textContent:name}),grid=document.createElement("div");grid.className="chat-emoji-grid";
  grid.setAttribute("role","group");grid.setAttribute("aria-label",name);
  for(const e of list){const b=Object.assign(document.createElement("button"),{type:"button",textContent:e});b.dataset.emoji=e;grid.append(b);}
  picker.append(h,grid);
 }
 // The textarea keeps the focus (and a phone its keyboard) while the buttons around it are tapped.
 for(const b of [sendBtn,emojiBtn,...picker.querySelectorAll("button")])b.addEventListener("pointerdown",e=>{if(document.activeElement===ta)e.preventDefault();});
 picker.addEventListener("click",e=>{
  const b=e.target.closest("[data-emoji]");if(!b)return;
  const r=insertAtCaret(ta.value,ta.selectionStart,ta.selectionEnd,b.dataset.emoji);ta.value=r.value;ta.setSelectionRange(r.caret,r.caret);grow();say("");
  if(!touch())ta.focus();
 });
 const showPicker=on=>{picker.hidden=!on;emojiBtn.setAttribute("aria-expanded",String(on));if(on&&pinned)toBottom();};
 emojiBtn.addEventListener("click",()=>showPicker(picker.hidden));

 // ---------- composer ----------
 function grow(){ta.style.height="auto";ta.style.height=`${Math.min(ta.scrollHeight+2,132)}px`;}   // CSSOM: allowed by the CSP; ~5 lines at most
 ta.addEventListener("input",()=>{grow();say("");if(pinned)toBottom();});
 let imeAt=0;
 ta.addEventListener("compositionend",()=>{imeAt=performance.now();});
 ta.addEventListener("input",e=>{if(imeInput(e.inputType,e.data))imeAt=performance.now();});
 ta.addEventListener("keydown",e=>{if(enterSends(e,{touch:touch(),sinceIme:performance.now()-imeAt})){e.preventDefault();submit();}});
 form.addEventListener("submit",e=>{e.preventDefault();submit();});
 function say(err,status=""){errEl.textContent=err;statusEl.textContent=status;}
 function attach(f){
  if(!f)return;
  const err=checkFile(f);if(err){say(err);return;}
  clearMedia();pending=f;previewUrl=URL.createObjectURL(f);previewImg.src=previewUrl;preview.hidden=false;say("");
  if(pinned)requestAnimationFrame(toBottom);
 }
 function clearMedia(){pending=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl="";previewImg.removeAttribute("src");preview.hidden=true;fileIn.value="";}
 imgBtn.addEventListener("click",()=>fileIn.click());
 fileIn.addEventListener("change",()=>{attach(fileIn.files?.[0]);fileIn.value="";});
 q(".chat-preview button").addEventListener("click",()=>{clearMedia();ta.focus();});
 // Images pasted from the clipboard, and keyboard GIFs (Gboard, iOS) which arrive as a paste or an input with files.
 ta.addEventListener("paste",e=>{const f=pickImage(e.clipboardData?.files);if(f){e.preventDefault();attach(f);}});
 ta.addEventListener("beforeinput",e=>{const f=pickImage(e.dataTransfer?.files);if(f){e.preventDefault();attach(f);}});
 // Drag and drop (desktop): anywhere on the chat.
 const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes("Files");
 root.addEventListener("dragover",e=>{if(!hasFiles(e))return;e.preventDefault();root.classList.add("drop");});
 root.addEventListener("dragleave",e=>{if(!root.contains(e.relatedTarget))root.classList.remove("drop");});
 root.addEventListener("drop",e=>{if(!hasFiles(e))return;e.preventDefault();root.classList.remove("drop");const f=pickImage(e.dataTransfer.files);if(f)attach(f);else say("Seules les images se glissent ici.");});
 // Raw bytes, not JSON (api() only speaks JSON): the server checks the type from the bytes themselves.
 async function upload(f){
  let r;
  try{r=await fetch("/api/chat/media",{method:"POST",credentials:"same-origin",signal:AbortSignal.timeout(60000),headers:{"Content-Type":f.type},body:f});}
  catch{return {ok:false,error:errFor(0)};}
  let j={};try{const v=await r.json();if(v&&typeof v==="object")j=v;}catch{}
  return r.ok&&j.ok!==false&&typeof j.id==="string"?{ok:true,id:j.id}:{ok:false,error:errFor(r.status,j.error)};
 }
 async function submit(){
  if(sending||muted())return;
  const draft=ta.value,text=cleanText(draft),err=textError(text,!!pending);if(err){say(err);return;}
  sending=true;sendBtn.disabled=true;say("");
  const at=room,who=seq;
  try{
   let media;
   if(pending){const u=await upload(pending);if(who!==seq)return;if(!u.ok){say(u.error);return;}media=u.id;}
   const r=await api("POST","/api/chat",{room:at,text,...(media?{media}:{})});
   if(who!==seq)return;                                      // signed out meanwhile
   // 403: muted, or the room was just closed by the organisation (the state is asked again: it may hide it).
   if(!r.ok){say(r.error);if(r.status===403){if(Number.isFinite(r.mutedUntil))setMuted(r.mutedUntil);else onClosed();}return;}
   if(ta.value===draft){ta.value="";grow();}            // what was typed during the upload stays
   clearMedia();showPicker(false);
   if(validMsg(r.message))add(at,[r.message]);
   pinned=true;toBottom();
  }finally{if(who===seq){sending=false;sendBtn.disabled=muted();}}
 }
 // Muted by the organisation: the composer says until when, and comes back on its own.
 const muted=()=>Number.isFinite(mutedUntil)&&mutedUntil>Date.now();
 function setMuted(t){
  mutedUntil=Number.isFinite(t)?t:null;clearTimeout(muteTimer);
  const on=muted();
  for(const el of [ta,sendBtn,emojiBtn,imgBtn])el.disabled=on;
  root.classList.toggle("muted",on);
  ta.placeholder=on?"Chat coupé pour toi":"Écris un message…";
  if(on){statusEl.textContent=`Tu es privé de chat jusqu'au ${fmtUntil(mutedUntil,getTz())}.`;showPicker(false);muteTimer=setTimeout(()=>setMuted(mutedUntil),Math.min(mutedUntil-Date.now()+500,2**31-1));}
  else if(statusEl.textContent.startsWith("Tu es privé"))statusEl.textContent="";
 }

 // ---------- the message list ----------
 function msgEl(m){
  const li=document.createElement("li");li.className=`chat-msg${m.mine?" mine":""}`;li.dataset.id=m.id;
  const bub=document.createElement("div");bub.className="chat-bubble";
  const meta=document.createElement("div");meta.className="chat-meta";
  if(!m.mine){
   const b=document.createElement("b");b.className=`chat-author ${m.author.camp==="right"?"right":"left"}`;b.textContent=m.author.name;meta.append(b);
   if(typeof m.author.online==="boolean"){const d=document.createElement("span");d.className=`presence ${m.author.online?"on":"off"}`;d.setAttribute("role","img");d.setAttribute("aria-label",m.author.online?"en ligne":"hors ligne");meta.append(d);}
  }else{const b=document.createElement("span");b.className="sr";b.textContent="Toi";meta.append(b);}
  const tm=document.createElement("time");tm.dateTime=new Date(m.t).toISOString();tm.textContent=fmtTime(m.t,Date.now(),getTz());meta.append(tm);
  bub.append(meta);
  if(m.text){const p=document.createElement("p");p.className="chat-text";p.textContent=m.text;bub.append(p);}    // textContent only, never HTML
  const src=mediaUrl(m.media);
  if(src){
   const b=document.createElement("button");b.type="button";b.className="chat-pic";b.setAttribute("aria-label",`Agrandir l'image de ${m.mine?"ton message":m.author.name}`);
   const img=Object.assign(document.createElement("img"),{src,alt:"",loading:"lazy",decoding:"async"});
   img.addEventListener("load",()=>{if(pinned&&shown)toBottom();},{once:true});
   img.addEventListener("error",()=>b.classList.add("broken"),{once:true});
   b.addEventListener("click",()=>openViewer(src,b));b.append(img);bub.append(b);
  }
  const dots=document.createElement("button");dots.type="button";dots.className="chat-more-btn";dots.textContent="⋯";
  dots.setAttribute("aria-label","Actions sur ce message");dots.setAttribute("aria-expanded","false");
  dots.addEventListener("click",()=>toggleMenu(li,m));
  li.append(bub,dots);
  // Long press (touch) or right click: the same menu as "⋯".
  let press=0,x0=0,y0=0;
  bub.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")return;x0=e.clientX;y0=e.clientY;clearTimeout(press);press=setTimeout(()=>{press=0;toggleMenu(li,m,true);},550);});
  bub.addEventListener("pointermove",e=>{if(press&&Math.hypot(e.clientX-x0,e.clientY-y0)>10){clearTimeout(press);press=0;}});
  for(const ev of ["pointerup","pointercancel","pointerleave"])bub.addEventListener(ev,()=>{clearTimeout(press);press=0;});
  bub.addEventListener("contextmenu",e=>{e.preventDefault();toggleMenu(li,m,true);});
  return li;
 }
 function closeMenu(){if(!menuOpen)return;menuOpen.querySelector(".chat-actions")?.remove();menuOpen.querySelector(".chat-more-btn")?.setAttribute("aria-expanded","false");menuOpen=null;}
 function toggleMenu(li,m,open=false){
  const was=menuOpen===li;closeMenu();if(was&&!open)return;
  const box=document.createElement("div");box.className="chat-actions";box.setAttribute("role","group");box.setAttribute("aria-label","Actions sur ce message");
  const act=(label,cls,fn)=>{const b=Object.assign(document.createElement("button"),{type:"button",className:`btn ${cls}`,textContent:label});b.addEventListener("click",fn);return b;};
  if(m.text&&navigator.clipboard)box.append(act("Copier","",()=>{navigator.clipboard.writeText(m.text).then(()=>say("","Message copié."),()=>{});closeMenu();}));
  if(m.mine)box.append(act("Supprimer","danger",async()=>{closeMenu();const r=await api("POST","/api/chat/delete",{id:m.id});if(r.ok)drop(m.id);else say(r.error);}));
  else box.append(act("Signaler","danger",async()=>{closeMenu();const r=await api("POST","/api/chat/report",{id:m.id});if(r.ok)say("","Message signalé : l'organisation va y jeter un œil.");else say(r.error);}));
  li.querySelector(".chat-bubble").append(box);li.querySelector(".chat-more-btn").setAttribute("aria-expanded","true");menuOpen=li;
  box.querySelector("button").focus({preventScroll:true});
  if(li===listEl.lastElementChild&&pinned)toBottom();
 }
 root.addEventListener("pointerdown",e=>{if(menuOpen&&!menuOpen.contains(e.target))closeMenu();});
 // A whole page drawn at once is not read out message by message (role=log): busy while it lands.
 function quietly(){log.setAttribute("aria-busy","true");requestAnimationFrame(()=>requestAnimationFrame(()=>log.removeAttribute("aria-busy")));}
 function drawRoom(){
  closeMenu();els.clear();quietly();
  const r=rooms[room];
  listEl.replaceChildren(...r.msgs.map(m=>{const li=msgEl(m);els.set(m.id,li);return li;}));
  more.textContent=!r.loaded?"Chargement…":r.more?"":"Début de la discussion (les messages restent 7 jours).";
  more.hidden=!more.textContent;
 }
 // New messages for a room: kept in memory, and put in place on screen if it is the room shown.
 function add(at,list){
  // Trimmed (oldest first) only when nobody is reading higher up in this room: pages loaded by scrolling stay.
  const r=rooms[at],all=mergeMessages(r.msgs,list,Infinity),keep=at===room&&shown&&!pinned?Infinity:KEEP;
  if(all.length>keep){r.msgs=all.slice(-keep);r.more=true;}else r.msgs=all;      // trimmed: older pages load again on scroll
  if(at!==room||!shown)return;
  const was=pinned;
  for(const m of list){
   if(!validMsg(m)||els.has(m.id)||!r.msgs.some(x=>x.id===m.id))continue;
   const li=msgEl(m);els.set(m.id,li);
   let next=null;for(const [id,el] of els)if(id>m.id&&(!next||id<Number(next.dataset.id)))next=el;
   listEl.insertBefore(li,next);
  }
  for(const [id,el] of els)if(!r.msgs.some(x=>x.id===id)){el.remove();els.delete(id);}   // trimmed past KEEP
  if(was)toBottom();
 }
 function drop(id){
  for(const k of ROOMS)rooms[k].msgs=rooms[k].msgs.filter(m=>m.id!==id);
  const li=els.get(id);if(li){if(menuOpen===li)menuOpen=null;li.remove();els.delete(id);}
 }
 function toBottom(){log.scrollTop=log.scrollHeight;pinned=true;pillBtn.hidden=true;markRead();}
 pillBtn.addEventListener("click",()=>{log.scrollTo({top:log.scrollHeight,behavior:reduced()?"auto":"smooth"});pinned=true;pillBtn.hidden=true;markRead();});
 log.addEventListener("scroll",()=>{
  pinned=atBottom(log.scrollTop,log.clientHeight,log.scrollHeight);
  if(pinned){pillBtn.hidden=true;markRead();}
  if(log.scrollTop<80)older();
 },{passive:true});
 // Older pages on reaching the top; the messages on screen stay where they were.
 async function older(){
  const at=room,r=rooms[at];
  if(!r.loaded||!r.more||r.loading||!r.msgs.length)return;
  r.loading=true;more.hidden=false;more.textContent="Chargement des messages plus anciens…";
  const who=seq,res=await api("GET",`/api/chat?room=${at}&before=${r.msgs[0].id}`);
  r.loading=false;if(who!==seq)return;
  if(!res.ok){if(at===room){more.textContent=res.error;}return;}
  const page=Array.isArray(res.messages)?res.messages.filter(validMsg):[];
  r.more=page.length>=PAGE;r.msgs=mergeMessages(page,r.msgs,Infinity);
  if(at!==room||!shown)return;
  const h=log.scrollHeight,top=log.scrollTop;
  const first=listEl.firstElementChild;quietly();
  for(const m of page){if(els.has(m.id))continue;const li=msgEl(m);els.set(m.id,li);listEl.insertBefore(li,first);}
  more.textContent=r.more?"":"Début de la discussion (les messages restent 7 jours).";more.hidden=!more.textContent;
  log.scrollTop=top+log.scrollHeight-h;
 }
 async function load(at){
  const r=rooms[at];if(r.loading)return;
  r.loading=true;const first=!r.loaded;
  const who=seq,res=await api("GET",`/api/chat?room=${at}`);
  r.loading=false;if(who!==seq)return;
  if(!res.ok){if(at===room&&shown){more.hidden=false;more.textContent=res.error;}if(res.status===403)onClosed();return;}
  const page=Array.isArray(res.messages)?res.messages:[];
  r.more=page.length<PAGE?false:r.loaded?r.more:true;
  r.msgs=mergeLatest(r.loaded?r.msgs:[],page);r.loaded=true;r.stale=false;
  if(Number.isFinite(res.lastRead))r.read=Math.max(r.read,res.lastRead);
  if(res.unread&&typeof res.unread==="object")setUnread(res.unread);
  setMuted(Number.isFinite(res.mutedUntil)?res.mutedUntil:null);
  // A reload (stream reconnected) leaves a player reading higher up where he was.
  if(at===room&&shown){const top=log.scrollTop,stay=pinned||first;drawRoom();if(stay)toBottom();else log.scrollTop=top;}
 }

 // ---------- read marks and badge ----------
 function setUnread(u){for(const k of ROOMS)if(Number.isFinite(u?.[k]))unread[k]=open.includes(k)?Math.max(0,u[k]):0;badge();}
 function badge(){
  const camp=getCamp();
  for(const b of tabs){
   const k=b.dataset.room,n=unread[k];b.setAttribute("aria-pressed",String(k===room));
   b.querySelector(".chat-tab-name").textContent=roomLabel(k,camp);
   const c=b.querySelector(".chat-count");c.textContent=n?badgeText(n):"";c.hidden=!n;
   b.setAttribute("aria-label",`${roomLabel(k,camp)}${n?`, ${n} non lu${n>1?"s":""}`:""}`);
   b.hidden=!open.includes(k);
  }
  // A single open room: its name as a plain title rather than a one-tab bar.
  tabBar.hidden=open.length<2;solo.hidden=open.length!==1;if(open.length===1)solo.textContent=roomLabel(open[0],camp);
  onBadge(unreadTotal(unread));
 }
 // The room on screen, scrolled to its end, with the page in sight: read up to its last message (debounced).
 function markRead(){
  if(!shown||document.hidden||!pinned)return;
  const r=rooms[room],last=r.msgs.at(-1);
  if(unread[room]){unread[room]=0;badge();}
  if(!r.loaded||!last||last.id<=r.read)return;
  clearTimeout(readTimer);
  const at=room,id=last.id,who=seq;
  readTimer=setTimeout(async()=>{if(who!==seq)return;r.read=Math.max(r.read,id);const res=await api("POST","/api/chat/read",{room:at,id});if(!res.ok&&who===seq)r.read=0;},700);
 }
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)markRead();});

 // ---------- tabs ----------
 for(const b of tabs)b.addEventListener("click",()=>{if(b.dataset.room!==room)showRoom(b.dataset.room);});
 function showRoom(k){
  room=k;pinned=true;pillBtn.hidden=true;badge();drawRoom();toBottom();
  if(!rooms[k].loaded||rooms[k].stale)load(k);
 }
 // A player who changed camp (death, resignation) talks in the other camp's room from then on.
 // Its unread count starts again from the server's (the GET answers it).
 function syncCamp(){
  const c=getCamp();if(c===campFor)return;
  const changed=campFor!==null;campFor=c;rooms.camp=fresh();unread.camp=0;
  if(shown&&room==="camp")showRoom("camp");else{badge();if(changed&&open.includes("camp"))load("camp");}
 }

 // ---------- full-size image ----------
 function openViewer(src,from){viewerFrom=from;viewerImg.src=src;viewer.hidden=false;q(".chat-viewer-close").focus();}
 function closeViewer(){if(viewer.hidden)return;viewer.hidden=true;viewerImg.removeAttribute("src");viewerFrom?.focus();viewerFrom=null;}
 viewer.addEventListener("click",e=>{if(e.target!==viewerImg)closeViewer();});
 // Escape closes what is on top first (image, menu, emojis); the sheet itself only after that.
 root.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  if(!viewer.hidden)closeViewer();else if(menuOpen){const li=menuOpen;closeMenu();li.querySelector(".chat-more-btn")?.focus();}else if(!picker.hidden){showPicker(false);ta.focus();}else return;
  e.preventDefault();e.stopPropagation();
 });

 // ---------- keyboard on phones: the sheet follows the visual viewport, so the composer stays above it ----------
 const vv=window.visualViewport;
 function fit(){if(!vv||!shown)return;sheet.style.setProperty("--vvh",`${vv.height}px`);sheet.style.setProperty("--vvt",`${vv.offsetTop}px`);if(pinned)toBottom();}
 vv?.addEventListener("resize",fit);vv?.addEventListener("scroll",fit);

 return {
  // Called by renderSheet("chat"): the same DOM every time, so a draft survives closing the sheet.
  mount(body,set){
   set("Chat","Entre joueurs · reste courtois");
   body.append(root);shown=true;syncCamp();badge();fit();
   requestAnimationFrame(()=>{showRoom(room);if(!touch()&&!ta.disabled)ta.focus({preventScroll:true});});
  },
  hide(){shown=false;closeMenu();closeViewer();showPicker(false);clearTimeout(readTimer);sheet.style.removeProperty("--vvh");sheet.style.removeProperty("--vvt");},
  // SSE "chat" {room,message}: never a toast nor a sound, only the badge.
  onChat(v){
   if(!v||!open.includes(v.room)||!validMsg(v.message))return;
   syncCamp();
   const r=rooms[v.room],m=v.message,seen=shown&&room===v.room&&pinned&&!document.hidden;
   if(r.loaded)add(v.room,[m]);
   if(!m.mine&&!seen&&m.id>r.read){unread[v.room]++;badge();}
   if(shown&&room===v.room&&!pinned&&!m.mine)pillBtn.hidden=false;
   if(seen)markRead();
  },
  onDel(v){if(Number.isInteger(v?.id))drop(v.id);},
  onUnread(v){if(v&&typeof v==="object"){setUnread(v);if(shown)markRead();}},
  // The live stream (re)connected: what was missed meanwhile is fetched again.
  resync(){for(const k of ROOMS)if(rooms[k].loaded)rooms[k].stale=true;if(shown)load(room);},
  syncCamp,
  // me.chat changed (the organisation opens or closes rooms live): a closed room is emptied and leaves the screen.
  setOpen(flags){
   const now=chatRooms(flags);if(now.join()===open.join())return;
   open=now;
   for(const k of ROOMS)if(!open.includes(k)){rooms[k]=fresh();unread[k]=0;}
   const next=pickRoom(room,open);
   if(next&&next!==room){room=next;if(shown)showRoom(next);}
   badge();
  },
  // Sign-out: nothing of this player's chat stays on the device.
  reset(){
   seq++;open=[];clearTimeout(readTimer);clearTimeout(muteTimer);rooms={global:fresh(),camp:fresh()};unread={global:0,camp:0};room="global";campFor=null;sending=false;sendBtn.disabled=false;
   ta.value="";grow();clearMedia();say("");setMuted(null);closeMenu();closeViewer();showPicker(false);listEl.replaceChildren();els.clear();onBadge(0);
  }
 };
}
