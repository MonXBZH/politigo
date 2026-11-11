// PolitiGo admin page: vanilla, one module, no innerHTML with data (every text goes through textContent / text nodes).
// Talks only to admin/server.mjs: JSON POSTs with the X-PolitiGo-Admin header, the session cookie does the rest.
const $=s=>document.querySelector(s);
// h("tag",{class,onclick,...},...children): strings become text nodes, never markup.
function h(tag,props,...kids){
 const e=document.createElement(tag);
 for(const [k,v] of Object.entries(props||{})){
  if(v==null||v===false)continue;
  if(k==="class")e.className=v;
  else if(k.startsWith("on"))e.addEventListener(k.slice(2),v);
  else if(k==="dataset")Object.assign(e.dataset,v);
  else if(k in e&&typeof e[k]!=="object"&&k!=="list")e[k]=v;
  else e.setAttribute(k,v===true?"":String(v));
 }
 for(const c of kids.flat(Infinity))if(c!=null&&c!==false)e.append(c instanceof Node?c:String(c));
 // A form field always has an id (browsers flag one without id or name; a <label for> needs it anyway).
 if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)&&!e.id&&!e.name)e.id=`f-${++fieldSeq}`;
 return e;
}
let fieldSeq=0;
// <label for> a field (made by h(), so it has an id); a group of boxes gets a plain heading (.lbl) instead.
const lab=(text,field)=>h("label",{for:field.id},text);
const lbl=text=>h("span",{class:"lbl"},text);
const CAMP={left:"Gauche",right:"Droite"};
const fmt=t=>t?new Date(t).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"}):"—";
const fmtDay=t=>t?new Date(t).toLocaleDateString("fr-FR"):"—";
function ago(t){
 if(!t)return "jamais";const s=Math.max(0,(Date.now()-t)/1000);
 return s<60?"à l'instant":s<3600?`il y a ${Math.floor(s/60)} min`:s<86400?`il y a ${Math.floor(s/3600)} h`:`il y a ${Math.floor(s/86400)} j`;
}
// Versions in one format everywhere: "1.7.3" (a release, or the x.y.z of "v1.7.3-3-gabc1234"), never a "v".
const ver=v=>{if(v==null||v==="")return null;const t=String(v),m=/^v?(\d+\.\d+\.\d+)/.exec(t);return m?m[1]:t.replace(/^v(?=\d)/,"");};
const pct=x=>x==null?"—":`${Math.round(x*100)} %`;
const bytes=n=>n==null?"—":n<1024?`${n} o`:n<1048576?`${(n/1024).toFixed(1)} Ko`:n<1073741824?`${(n/1048576).toFixed(1)} Mo`:`${(n/1073741824).toFixed(1)} Go`;
const dur=s=>{if(s==null)return "—";s=Math.floor(s);const d=Math.floor(s/86400),hh=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d} j ${hh} h`:hh?`${hh} h ${m} min`:`${m} min`;};
const campBadge=c=>c?h("span",{class:`badge ${c}`},CAMP[c]||c):null;
const who=a=>typeof a==="string"?a:a?.name??"?";
// Raw values from the API, in French.
const DUEL_STATUS={c_play:"le lanceur joue",pending:"en attente du défié",d_play:"le défié joue",done:"terminé",refused:"refusé",expired:"expiré",void:"annulé",annulled:"annulé, gains rendus"};
const DUEL_RES={win:"victoire",loss:"défaite",tie:"égalité",chicken:"refusé ou sans réponse"};
const EVENT={halloween:"Halloween"};
const VIA={cli:"console",web:"web",schedule:"planif."};
const FEED_KIND={announce:"annonce",duel:"duel",mythic:"mythique",ultra:"ultra rare",transfuge:"transfuge",baton:"duel du Bâton"};
const BATON_STATUS={invited:"invitation en direct",live:"en direct",c_play:"le lanceur joue",b_wait:"en attente du porteur",b_play:"le porteur joue",scheduled:"rediffusion prévue",
 done:"terminé",held:"à valider",void:"annulé",annulled:"annulé par l'organisation",forfeit:"porteur sans réponse"};
const RARITY={commun:"Commun",rare:"Rare",epique:"Épique",legendaire:"Légendaire",ultra:"Ultra rare",mythique:"Mythique"};
// The two chat rooms, each switched on by the admin (closed by default).
const chatState=r=>!r?"—":r.global&&r.camp?"Tous les salons":r.global?"Pour tous":r.camp?"De camp":"Fermé";
const tr=(map,v)=>v==null?"—":map[v]??String(v);
// The admin log's "Par": the channel, and the moderator's name when one acted (the owner's own actions: no name).
const byWho=(via,by)=>by?`${tr(VIA,via)} · modo ${by}`:tr(VIA,via);

// ===================================================================== API
class Unauthorized extends Error{}
async function api(path,body={}){
 const r=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1"},body:JSON.stringify(body)});
 if(r.status===401&&path!=="/api/login"){showLogin();throw new Unauthorized("Session expirée.");}
 let j=null;try{j=await r.json();}catch{}
 if(!r.ok||!j?.ok)throw new Error(j?.error||`Erreur ${r.status}`);
 return j;
}
// ===================================================================== who is signed in
// The owner sees everything; a moderator only the panels (sees) and actions (can) the owner gave, on their servers.
// The page only hides what is not theirs: admin/server.mjs refuses it anyway.
let me={role:"owner"};
const owner=()=>me.role==="owner";
const sees=p=>owner()||!!me.panels?.includes(p);
const can=a=>owner()||!!me.actions?.includes(a);
const isMe=id=>!owner()&&id!=null&&me.self?.[cur]===id;   // their own player account on this server: no action on it
const OWNER_ONLY=new Set(["reglages","sauvegarde","modos","parties"]);

// ===================================================================== game servers
// Every game action goes to /api/s/<server>/...: the server is part of the URL, chosen in the top bar and remembered.
let servers=[],cur=null;
const SKEY="politigo-admin-server";
const store={get(){try{return localStorage.getItem(SKEY);}catch{return null;}},set(v){try{localStorage.setItem(SKEY,v);}catch{}}};
const curSrv=()=>servers.find(s=>s.id===cur);
const srvName=()=>curSrv()?.name||"?";
const multi=()=>servers.length>1;
const sp=a=>`/api/s/${encodeURIComponent(cur)}/${a}`;
const call=(cmd,args={})=>api(sp("call"),{cmd,...args});
// Renewed parties (the owner's view of /api/parties): still listed, unreachable until they come back with the new token.
let waitToken=new Set();
const renewing=p=>p.state==="pending"&&!!p.firstSeen;
const noteParties=list=>{waitToken=new Set(list.filter(renewing).map(p=>p.id));};
async function loadServers(full=false){
 const r=await api("/api/servers",{full});
 servers=r.servers;
 if(owner()&&servers.some(s=>!s.up))await partiesGet().then(x=>noteParties(x.parties||[]),()=>{});else waitToken=new Set();
 if(!servers.some(s=>s.id===cur))cur=servers.some(s=>s.id===store.get())?store.get():servers[0]?.id;
 drawSwitcher();
 return servers;
}
function pickServer(id){
 if(id===cur)return;
 cur=id;store.set(id);$("#dlg").open&&$("#dlg-cancel").click();   // a question about the previous server never applies to the new one
 drawSwitcher();
 if(route().id==="apercu")location.hash="#tableau";else render();
}
function drawSwitcher(){
 const box=$("#srv"),s=curSrv(),dot=x=>h("i",{class:`dot ${x?.up?"up":"down"}`,title:x?.up?"joignable":"injoignable"});
 if(!multi()){box.replaceChildren(dot(s),h("span",{class:"name"},s?.name||""));return;}
 const sel=h("select",{"aria-label":"Partie",onchange:e=>pickServer(e.target.value)},servers.map(x=>{const v=x.up?ver(x.release||x.version):null;
  return h("option",{value:x.id,selected:x.id===cur},`${x.name}${v?` · ${v}`:""}${x.up?"":waitToken.has(x.id)?" (injoignable, en attente du nouveau jeton)":" (injoignable)"}`);}));
 box.replaceChildren(dot(s),sel);
}
setInterval(()=>{if(!document.hidden&&!$("#app").hidden&&route().id!=="apercu")loadServers().catch(()=>{});},15000);
// A file answer (backup): fetched as a blob, then handed to the browser as a download.
async function download(path,body={}){
 const r=await fetch(path.startsWith("/")?path:sp(path),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1"},body:JSON.stringify(body)});
 if(r.status===401){showLogin();throw new Unauthorized("Session expirée.");}
 if(!r.ok){let j=null;try{j=await r.json();}catch{}throw new Error(j?.error||`Erreur ${r.status}`);}
 const name=/filename="([^"]+)"/.exec(r.headers.get("content-disposition")||"")?.[1]||"politigo.bin";
 const blob=await r.blob(),url=URL.createObjectURL(blob),a=h("a",{href:url,download:name});
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30e3);
 return {name,size:blob.size};
}

// ===================================================================== toast, dialogs
let toastT;
function toast(msg,bad=false){const t=$("#toast");t.textContent=msg;t.classList.toggle("bad",bad);t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),bad?6000:3500);}
const fail=e=>{if(!(e instanceof Unauthorized))toast(e.message||String(e),true);};
// One <dialog> for every question; resolves with the OK value (or null when cancelled / Escape).
// Every question names the game (the "partie") it acts on ("Suspendre le compte sur « Prod » ?"), so nothing hits the wrong game.
// value() may be async; undefined keeps the dialog open (a field to fix). Without a cancel button, Escape does nothing:
// what such a dialog shows (a password, a token) is shown once and must not vanish by a stray key.
function dialog({title,body=[],ok="Confirmer",cancel="Annuler",danger=false,value=()=>true,focus,server=true,wide=false}){
 const d=$("#dlg"),okB=$("#dlg-ok"),noB=$("#dlg-cancel"),name=srvName();
 $("#dlg-title").textContent=!server?title:/ \?$/.test(title)?title.replace(/ \?$/,` sur « ${name} » ?`):`${title} · « ${name} »`;
 $("#dlg-body").replaceChildren(server?h("span",{class:"srv-tag dlg-srv"},`Partie : ${name}`):"",...[body].flat().filter(b=>b!=null&&b!==false).map(b=>typeof b==="string"?h("p",{},b):b));
 okB.textContent=ok;okB.className=`btn ${danger?"danger":"go"}`;noB.textContent=cancel;noB.hidden=cancel===null;d.classList.toggle("wide",!!wide);
 return new Promise(res=>{
  let busy=false;
  const done=v=>{okB.onclick=noB.onclick=d.oncancel=null;okB.disabled=noB.disabled=false;d.close();res(v);};
  okB.onclick=async()=>{if(busy)return;busy=true;okB.disabled=noB.disabled=true;let v;try{v=await value();}finally{busy=false;okB.disabled=noB.disabled=false;}if(v!==undefined)done(v);};
  noB.onclick=()=>{if(!busy)done(null);};d.oncancel=e=>{e.preventDefault();if(!busy&&cancel!==null)done(null);};
  d.showModal();(focus||(danger?noB:okB)).focus();
 });
}
const confirmBox=(title,text,ok="Confirmer",danger=true)=>dialog({title,body:text,ok,danger}).then(v=>v===true);
async function promptBox(title,label,init=""){
 const inp=h("input",{type:"text",value:init,maxLength:200});
 inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#dlg-ok").click();}});
 const v=await dialog({title,body:[lab(label,inp),inp],ok:"Valider",value:()=>inp.value.trim(),focus:inp});
 return v||null;
}
async function copy(text,inp){if(await copyText(text))toast("Copié !");else{inp?.select();toast("Copie impossible : sélectionne le texte.",true);}}
function secretBox(title,intro,secret,server=true){
 const inp=h("input",{type:"text",value:secret,readOnly:true,spellcheck:false,"aria-label":"Secret"});
 inp.addEventListener("focus",()=>inp.select());
 return dialog({title,body:[intro,h("div",{class:"secret"},inp,h("button",{class:"btn small",type:"button",onclick:()=>copy(secret,inp)},"Copier")),
  h("p",{class:"muted small"},"Il n'est affiché qu'une fois : transmets-le par un canal privé.")],ok:"J'ai noté",cancel:null,focus:inp,server});
}
// Runs an action button: disabled while it runs, toast on the outcome, then refresh.
async function act(btn,fn,okMsg,after=render){
 if(btn)btn.disabled=true;
 try{const r=await fn();if(r!==false){if(okMsg)toast(typeof okMsg==="function"?okMsg(r):okMsg);await after?.();}}
 catch(e){fail(e);}
 finally{if(btn?.isConnected)btn.disabled=false;}
}

// ===================================================================== login
function showLogin(){stopRefresh();stopAlerts();me={role:"owner"};$("#app").hidden=true;$("#login").hidden=false;$("#login-pw").value="";setTimeout(()=>$(($("#login-name").value?"#login-pw":"#login-name")).focus(),0);}
async function showApp(){
 try{me=await api("/api/me");}catch(e){if(e instanceof Unauthorized)return;me={role:"mod",panels:[],actions:[]};fail(e);}   // unknown: the least
 $("#login").hidden=true;$("#app").hidden=false;
 const w=$("#who");w.hidden=owner();w.textContent=owner()?"":`Modo · ${me.name}`;
 try{await loadServers();}catch(e){fail(e);}
 if(sees("traiter"))startAlerts();
 if(!location.hash||route().id!==location.hash.slice(1).split("/")[0])location.hash=`#${route().id}`;
 buildNav();await render();
}
$("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();const btn=e.submitter||$("#login-form .btn"),err=$("#login-err");err.textContent="";btn.disabled=true;
 try{await api("/api/login",{name:$("#login-name").value.trim(),password:$("#login-pw").value});await showApp();}
 catch(x){err.textContent=x.message;$("#login-pw").select();}
 finally{btn.disabled=false;}
});
$("#logout").addEventListener("click",async()=>{try{await api("/api/logout");}catch{}showLogin();});

// ===================================================================== navigation
const SECTIONS=[
 ["apercu","Vue d'ensemble",viewOverview],["tableau","Tableau de bord",viewDashboard],["traiter","À traiter",viewAlerts],["joueurs","Joueurs",viewPlayers],["annonces","Annonces",viewAnnounces],["events","Events",viewEvents],
 ["chat","Chat",viewChat],["fil","Fil",viewFeed],["duels","Duels",viewDuels],["reglages","Réglages",viewSettings],
 ["sauvegarde","Sauvegarde",viewBackup],["bots","Détection de bots",viewBots],["journal","Journal d'admin",viewAudit],["modos","Modérateurs",viewMods],
 ["parties","Parties",viewParties],
];
// With a single server the overview is skipped altogether; a moderator only gets their panels.
const sections=()=>SECTIONS.filter(([k])=>k==="apercu"?multi():OWNER_ONLY.has(k)?owner():sees(k));
const route=()=>{const [s,...rest]=location.hash.slice(1).split("/"),list=sections(),ok=list.some(x=>x[0]===s);return {id:ok?s:list[0]?.[0]??"apercu",arg:ok?rest.join("/"):""};};
function buildNav(){
 const {id}=route();
 $("#nav").replaceChildren(...sections().map(([k,label])=>h("a",{href:`#${k}`,"aria-current":k===id?"page":null},label)));
 drawAlertCount();
}
let refreshT=null,renderSeq=0;
const stopRefresh=()=>{clearInterval(refreshT);refreshT=null;};
async function render(){
 const {id,arg}=route(),seq=++renderSeq,view=$("#view");stopRefresh();
 // A section that is not theirs (#parties for a moderator, an old link): the address follows the panel shown.
 if(location.hash.slice(1).split("/")[0]!==id)history.replaceState(null,"",`#${id}`);
 for(const a of $("#nav").children){if(a.getAttribute("href")===`#${id}`)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");}
 const fn=sections().find(x=>x[0]===id)?.[2]??(()=>h("div",{class:"card"},empty("Aucun panneau ne t'est ouvert : demande à l'organisateur.")));
 try{
  const nodes=await fn(arg);
  if(seq!==renderSeq)return;   // a newer navigation won the race
  view.replaceChildren(...[nodes].flat(Infinity).filter(x=>x!=null&&x!==false));   // an absent block (null, false) is not text
 }catch(e){
  if(e instanceof Unauthorized||seq!==renderSeq)return;
  view.replaceChildren(h("div",{class:"card"},h("h2",{},"Impossible de charger"),h("p",{class:"err"},e.message),h("button",{class:"btn",type:"button",onclick:render},"Réessayer")));
 }
}
window.addEventListener("hashchange",()=>{render().then(()=>$("#view").focus({preventScroll:true}));});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&route().id==="tableau"&&!$("#app").hidden)render();});
// ===================================================================== À traiter (every game server)
// Polled every 20 s on every server, the page hidden or not: the count heads the menu and the tab's title, a new item
// chimes (sound on) and, the console in the background, shows a system notification (HTTPS or localhost only: browsers
// refuse it on plain http). "Vu" files an item away on its game server, for every console.
const ALERT_MS=20000,KIND={chat:"Chat",duel:"Duel",bot:"Bot",suspect:"Comptes",mythic:"Mythique",baton:"Duel du Bâton",abandoned:"Abandon",backup:"Sauvegarde",link:"Liaison"},BASE_TITLE=document.title,SOUND_KEY="politigo-admin-sound";
// A "Liaison" alert, the owner's alone: a party's token tried by another machine (key link:<party id>:<instance>), the
// link certificate made anew (link-cert:<short fingerprint>) or the list of parties unreadable: all open #parties.
const linkAlert=a=>a.kind==="link"||String(a.key||"").startsWith("link:")||String(a.key||"").startsWith("link-");
const linkCertAlert=a=>String(a.key||"").startsWith("link-cert:");
const linkParty=a=>{const k=String(a.key||"");return k.startsWith("link:")?k.split(":")[1]||"":"";};
const alertLink=a=>linkAlert(a)?`#parties/${linkParty(a)}`.replace(/\/$/,""):a.kind==="chat"?"#chat":a.kind==="suspect"?"#duels":a.kind==="abandoned"?"#joueurs/abandonnes":a.kind==="backup"?"#sauvegarde":`#joueurs/${a.ref}`;
let alerts=new Map(),alertsKnown=null,alertsT=null,audio=null;   // server id -> {items,acked,error}; "server|key" seen so far (null: first poll)
const soundOn=()=>{try{return localStorage.getItem(SOUND_KEY)!=="off";}catch{return true;}};
const notifiable=()=>window.isSecureContext&&"Notification" in window;
// Browsers only let a page play sound after a gesture: the context is made (or woken) by the first click or key.
const unlockAudio=()=>{try{audio??=new AudioContext();if(audio.state==="suspended")audio.resume();}catch{}};
for(const ev of ["pointerdown","keydown"])document.addEventListener(ev,unlockAudio);
function chime(){
 if(!soundOn()||!audio)return;
 try{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;
  o.frequency.setValueAtTime(880,t);o.frequency.setValueAtTime(1320,t+0.12);
  g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.15,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+0.35);
  o.connect(g).connect(audio.destination);o.start(t);o.stop(t+0.4);}catch{}
}
const alertCount=()=>[...alerts.values()].reduce((n,s)=>n+s.items.length,0);
function drawAlertCount(){
 const n=alertCount(),a=$('#nav a[href="#traiter"]');
 document.title=n?`(${n}) ${BASE_TITLE}`:BASE_TITLE;
 if(a)a.replaceChildren("À traiter",...(n?[h("span",{class:"badge bad"},String(n))]:[]));
}
const srvCall=(id,cmd,args={})=>api(`/api/s/${encodeURIComponent(id)}/call`,{cmd,...args});
async function pollAlerts(redraw=true){
 const next=new Map(await Promise.all(servers.map(s=>srvCall(s.id,"alerts").then(r=>[s.id,{items:r.items||[],acked:r.acked||0}],
  e=>[s.id,{items:alerts.get(s.id)?.items||[],acked:alerts.get(s.id)?.acked||0,error:e.message}]))));   // a server out for a moment keeps its list: no flood when it is back
 if($("#app").hidden)return;
 const keys=[...next].flatMap(([id,s])=>s.items.map(a=>[`${id}|${a.key}`,id,a])),before=alertCount();
 const fresh=alertsKnown?keys.filter(([k])=>!alertsKnown.has(k)):[];
 alertsKnown=new Set(keys.map(([k])=>k));alerts=next;drawAlertCount();
 if(fresh.length)announceAlerts(fresh.map(([,id,a])=>({id,a})));
 if(redraw&&(fresh.length||alertCount()!==before)&&route().id==="traiter"&&!document.hidden&&!$("#dlg").open)render();
}
function announceAlerts(fresh){
 chime();
 const {id,a}=fresh[0],more=fresh.length>1?` (et ${fresh.length-1} autre${fresh.length>2?"s":""})`:"",where=multi()?` · ${servers.find(s=>s.id===id)?.name||id}`:"";
 if(notifiable()&&Notification.permission==="granted"&&(document.hidden||!document.hasFocus())){
  try{const n=new Notification(`PolitiGo · à traiter${where}`,{body:a.title+more,tag:"politigo-admin",renotify:true});
   n.onclick=()=>{window.focus();location.hash="#traiter";n.close();};return;}catch{}   // no page notifications here (Android Chrome): the toast says it
 }
 toast(`À traiter${where} : ${a.title}${more}`);
}
// What an alert says; a "Liaison" one also quotes the start of the instance that tried the token (its key's third part)
// when the text does not, and a regenerated certificate keeps its meaning even with an older server's empty text.
const alertTitle=a=>a.title||(linkCertAlert(a)?"Certificat de liaison régénéré":"");
function alertDetail(a){
 if(linkCertAlert(a))return a.detail||"Certificat de liaison régénéré : chaque partie doit recevoir la nouvelle empreinte (POLITIGO_ADMIN_TLS), page Parties.";
 const k=String(a.key||"");if(!k.startsWith("link:"))return a.detail||null;
 const inst=k.split(":").slice(2).join(":"),d=a.detail||"";
 return inst&&!d.includes(inst.slice(0,8))?`${d}${d?" ":""}Instance : ${inst.slice(0,8)}…`:d||null;
}
function startAlerts(){stopAlerts();pollAlerts().catch(()=>{});alertsT=setInterval(()=>pollAlerts().catch(()=>{}),ALERT_MS);}
function stopAlerts(){clearInterval(alertsT);alertsT=null;alerts=new Map();alertsKnown=null;drawAlertCount();}
async function viewAlerts(){
 await pollAlerts(false);
 const ack=(id,keys,btn)=>act(btn,async()=>{for(let i=0;i<keys.length;i+=50)await srvCall(id,"alerts-ack",{keys:keys.slice(i,i+50)});},keys.length>1?"Tout est marqué comme vu.":"Marqué comme vu.");
 const open=(id,a)=>{if(id!==cur){cur=id;store.set(id);drawSwitcher();}location.hash=alertLink(a);};
 const perm=!notifiable()?h("p",{class:"muted small"},"Notifications système : seulement quand la console est en HTTPS (Nginx Proxy Manager) ou ouverte sur localhost. Ici : compteur, titre de l'onglet et son.")
  :Notification.permission==="granted"?h("p",{class:"muted small"},"Notifications système activées sur ce navigateur : elles s'affichent quand la console est en arrière-plan.")
  :Notification.permission==="denied"?h("p",{class:"muted small"},"Notifications bloquées pour cette console : autorise-les dans les réglages du site (le cadenas à côté de l'adresse).")
  :h("div",{class:"btn-row"},h("button",{class:"btn small go",type:"button",onclick:async()=>{try{await Notification.requestPermission();}catch{}render();}},"Activer les notifications système"));
 const snd=h("label",{class:"btn-row"},h("input",{type:"checkbox",checked:soundOn(),onchange:e=>{try{localStorage.setItem(SOUND_KEY,e.target.checked?"on":"off");}catch{}unlockAudio();chime();}}),"Son à chaque nouvelle alerte");
 const blocks=servers.map(s=>{
  const st=alerts.get(s.id)||{items:[],acked:0},items=st.items;
  return h("div",{class:"card"},
   h("div",{class:"btn-row"},h("h2",{},multi()?s.name:"Alertes"),items.filter(a=>!a.noAck).length>1&&can("alerts-ack")?h("button",{class:"btn small",type:"button",onclick:e=>ack(s.id,items.filter(a=>!a.noAck).map(a=>a.key),e.currentTarget)},"Tout marquer comme vu"):null),
   st.error?h("p",{class:"err"},st.error):null,
   items.length?h("div",{class:"list"},items.map(a=>h("div",{class:"alert-item"},
    h("div",{class:"btn-row"},h("span",{class:`badge ${a.kind==="chat"?"warn":a.kind==="mythic"||a.kind==="baton"?"mythic":"bad"}`},linkAlert(a)?"Liaison":KIND[a.kind]||a.kind),h("b",{},alertTitle(a)),a.t?h("span",{class:"muted small"},fmt(a.t)):null),
    alertDetail(a)?h("p",{class:"wrap muted small"},alertDetail(a)):null,
    h("div",{class:"btn-row"},sees(alertLink(a).slice(1).split("/")[0])?h("button",{class:"btn small go",type:"button",onclick:()=>open(s.id,a)},"Ouvrir"):null,
     can("alerts-ack")&&!a.noAck&&h("button",{class:"btn small",type:"button",onclick:e=>ack(s.id,[a.key],e.currentTarget)},"Vu"))))):empty("Rien à traiter."),
   st.acked?h("p",{class:"muted small"},`${st.acked} déjà vue${st.acked>1?"s":""} : elle${st.acked>1?"s":""} ne compte${st.acked>1?"nt":""} plus pendant 30 jours.`):null);
 });
 return [h("div",{class:"view-head"},h("h1",{},"À traiter"),h("div",{class:"btn-row"},h("span",{class:"muted small"},"vérifié toutes les 20 s, sur toutes les parties"),refreshBtn())),
  h("div",{class:"card"},h("h2",{},"Me prévenir"),snd,perm,
   h("p",{class:"muted small"},"Signalements du chat, duels signalés par l'anti-triche, joueurs au score de bot élevé (50/100 et plus), groupes de duels suspects, gain d'un objet mythique et comptes qui semblent abandonnés."+(owner()?" Pour l'organisateur seul : sauvegardes en échec et, sous Liaison, jetons de partie essayés par une autre machine, certificat de liaison régénéré et liste des parties illisible.":""))),
  ...blocks];
}

// The current game server's name heads every page.
const srvTag=()=>h("span",{class:"srv-tag",title:"Partie"},h("i",{class:`dot ${curSrv()?.up?"up":"down"}`}),srvName());
const head=(title,...extra)=>h("div",{class:"view-head"},h("div",{class:"btn-row"},h("h1",{},title),srvTag()),h("div",{class:"btn-row"},extra));
const refreshBtn=()=>h("button",{class:"btn small",type:"button",onclick:e=>act(e.currentTarget,render)},"Actualiser");
const empty=t=>h("p",{class:"empty"},t);

// ===================================================================== invite code, one click away
// Masked by default ("politigo-••••"), an eye to reveal it, "Copier" that says "Copié !" for 2 s.
const maskCode=c=>{const i=c.indexOf("-");return (i>0&&i<c.length-1?c.slice(0,i+1):"")+"••••";};
function inviteWidget(inv){
 if(!inv)return h("p",{class:"muted small"},"Code d'invitation indisponible.");
 if(!inv.open||!inv.code)return h("div",{class:"invite"},h("span",{class:"badge bad"},"Inscriptions fermées"));
 let shown=false;
 const code=h("code",{class:"invite-code"},maskCode(inv.code));
 const eye=h("button",{class:"btn small icon",type:"button","aria-label":"Afficher le code","aria-pressed":"false",onclick:e=>{
  e.stopPropagation();shown=!shown;code.textContent=shown?inv.code:maskCode(inv.code);
  eye.setAttribute("aria-pressed",String(shown));eye.setAttribute("aria-label",shown?"Masquer le code":"Afficher le code");eye.textContent=shown?"🙈":"👁";}},"👁");
 const cp=h("button",{class:"btn small go",type:"button",onclick:async e=>{
  e.stopPropagation();
  if(await copyText(inv.code)){cp.textContent="Copié !";clearTimeout(cp.t);cp.t=setTimeout(()=>{cp.textContent="Copier";},2000);}
  else toast("Copie impossible : affiche le code et sélectionne-le.",true);}},"Copier");
 return h("div",{class:"invite"},h("span",{class:"muted small"},"Code d'invitation"),code,eye,cp);
}
// Clipboard API (HTTPS or localhost), else the old hidden-textarea route (inside the open dialog: a modal one makes
// the rest of the page inert).
async function copyText(text){
 try{await navigator.clipboard.writeText(text);return true;}
 catch{const t=h("textarea",{value:text,readOnly:true,class:"offscreen"});($("#dlg").open?$("#dlg"):document.body).append(t);t.select();let ok=false;try{ok=document.execCommand("copy");}catch{}t.remove();return ok;}
}

// ===================================================================== Vue d'ensemble (several servers)
const enter=id=>{cur=id;store.set(id);drawSwitcher();location.hash="#tableau";};
async function viewOverview(){
 await loadServers(true);
 refreshT=setInterval(()=>{if(!document.hidden&&route().id==="apercu")render();},15000);
 const kv=(...pairs)=>h("dl",{class:"kv"},pairs.flatMap(([k,v])=>[h("dt",{},k),h("dd",{},v==null?"—":String(v))]));
 return [
  h("div",{class:"view-head"},h("h1",{},"Vue d'ensemble"),h("div",{class:"btn-row"},h("span",{class:"muted small"},"actualisée toutes les 15 s"),refreshBtn())),
  h("div",{class:"grid wide"},servers.map(s=>h("div",{class:`card srv-card${s.up?"":" down"}`,onclick:e=>{if(!e.target.closest("button"))enter(s.id);}},
   h("h2",{},h("i",{class:`dot ${s.up?"up":"down"}`}),h("button",{class:"linkish",type:"button",onclick:()=>enter(s.id)},s.name)),
   s.up&&can("invite")?inviteWidget(s.invite):null,
   s.up?kv(["Version",ver(s.release||s.version)],["Joueurs",s.players],["Connectés",s.online],["Actifs 24 h",s.active24h],["Chat",chatState(s.chatRooms)],["Signalements chat",s.chatReports],
    ["Prochaine annonce",s.nextAnnounce?`${fmt(s.nextAnnounce.t)} : ${s.nextAnnounce.text}`:"aucune"])
   :h("p",{class:"err"},`Injoignable : ${waitToken.has(s.id)?"en attente du nouveau jeton (renouvelé page Parties)":s.error||"pas de réponse"}`)))),
  owner()?h("div",{class:"card"},h("h2",{},"Ajouter une partie"),h("p",{class:"muted small"},
   "Une autre stack ou une autre machine se rattache par le réseau : page ",h("a",{href:"#parties"},"Parties"),", « Ajouter une partie », puis trois lignes à coller dans sa stack. "+
   "Ancien mode, toujours possible sur la même machine : monter le volume du socket d'administration de l'autre stack "+
   "(volume externe, par exemple politigo-test_politigo-admin-sock sur /run/politigo-test), l'ajouter à POLITIGO_ADMIN_SERVERS "+
   "(« Prod=/run/politigo/admin.sock;Test=/run/politigo-test/admin.sock ») et redémarrer le conteneur admin.")):null,
 ];
}

// ===================================================================== Tableau de bord
async function viewDashboard(){
 const [s,l,inv]=await Promise.all([call("stats"),call("list"),can("invite")?call("invite-get").catch(()=>null):null]);
 const online=l.players.filter(p=>p.online);
 const stat=(v,k)=>h("div",{class:"card stat"},h("div",{class:"v"},v??"—"),h("div",{class:"k"},k));
 const ch=s.chat||{};
 // Auto-refresh every 15 s while this page stays open and visible.
 refreshT=setInterval(()=>{if(!document.hidden&&route().id==="tableau")render();},15000);
 return [
  head("Tableau de bord",h("span",{class:"muted small"},"actualisé toutes les 15 s"),refreshBtn()),
  can("invite")?h("div",{class:"card"},inviteWidget(inv&&{code:inv.invite||null,open:!!inv.open&&!!inv.invite})):null,
  h("div",{class:"grid"},
   stat(s.players,"joueurs inscrits"),stat(s.online,"connectés maintenant"),stat(s.active24h,"actifs sur 24 h"),stat(s.active7d,"actifs sur 7 jours"),
   stat(s.suspended,"suspendus"),stat(s.pushSubs,"abonnements notifications"),stat(s.registrations?(s.registrations.open?"ouvertes":"fermées"):"—","inscriptions"),stat(chatState(s.chatRooms),"chat"),
   stat(s.event?(s.event.current?tr(EVENT,s.event.current):"aucun"):"—",`événement (mode ${{auto:"automatique",off:"désactivé",halloween:"forcé"}[s.event?.mode]??"?"})`)),
  h("div",{class:"grid wide"},
   h("div",{class:"card"},h("h2",{},"Partie"),h("dl",{class:"kv"},
    h("dt",{},"Version"),h("dd",{title:s.version||""},ver(s.release||s.version)??"?"),
    h("dt",{},"En route depuis"),h("dd",{},dur(s.uptimeS)),h("dt",{},"Base de données"),h("dd",{},bytes(s.dbBytes)))),
   h("div",{class:"card"},h("h2",{},"Chat"),Object.keys(ch).length?h("dl",{class:"kv"},
    h("dt",{},"Messages (7 jours)"),h("dd",{},String(ch.messages7d??"—")),h("dt",{},"Images"),h("dd",{},String(ch.media??"—")),
    h("dt",{},"Espace des images"),h("dd",{},bytes(ch.mediaBytes)),
    h("dt",{},"Signalements en attente"),h("dd",{},ch.reportsOpen>0?h("a",{class:"badge bad",href:"#chat"},`${ch.reportsOpen} à traiter →`):String(ch.reportsOpen??"—")))
    :empty("Pas de statistiques de chat."))),
  h("div",{class:"card"},h("h2",{},`Connectés (${online.length})`),
   online.length?h("ul",{class:"list"},online.map(playerRow)):empty("Personne en ligne pour l'instant.")),
 ];
}

// ===================================================================== Joueurs
function dots(p){
 return h("span",{class:"dots"},h("i",{class:`dot${p.online?" on":""}`,title:p.online?"en ligne":"hors ligne"}),
  p.suspended?h("i",{class:"dot sus",title:"suspendu"}):null,p.chatMutedUntil>Date.now()?h("i",{class:"dot mute",title:"chat coupé"}):null);
}
// "Vu": the player's own last visit (lastSeen), never the time the server last saved their game (updated).
function playerRow(p){
 return h("li",{},h("button",{class:"row",type:"button",onclick:()=>{location.hash=`#joueurs/${p.id}`;}},
  dots(p),h("span",{class:"grow"},h("b",{},p.name),h("div",{class:"meta"},`niv. ${p.lvl??"?"} · ${p.lastSeen?`vu ${ago(p.lastSeen)}`:"jamais vu"} · inscrit le ${fmtDay(p.created)}`)),campBadge(p.camp)));
}
let playerFilter="";
async function viewPlayers(arg){
 if(arg==="abandonnes")return viewAbandoned();
 if(arg)return viewPlayer(+arg);
 const [{players},gone]=await Promise.all([call("list"),call("abandoned-list").catch(()=>({items:[]}))]);
 const list=h("ul",{class:"list"}),count=h("span",{class:"muted small"});
 const fold=s=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 const draw=()=>{
  const q=fold(playerFilter.trim()),rows=players.filter(p=>!q||fold(p.name).includes(q)).sort((a,b)=>(b.online-a.online)||((b.lastSeen??0)-(a.lastSeen??0)));
  list.replaceChildren(...(rows.length?rows.map(playerRow):[empty("Aucun joueur.")]));count.textContent=`${rows.length} / ${players.length}`;
 };
 const search=h("input",{type:"search",placeholder:"Rechercher un pseudo…",value:playerFilter,"aria-label":"Rechercher un pseudo",oninput:e=>{playerFilter=e.target.value;draw();}});
 draw();
 return [head("Joueurs",count,h("a",{class:"btn small",href:"#joueurs/abandonnes"},`Comptes abandonnés (${gone.items.length})`),refreshBtn()),h("div",{class:"card"},search,
  h("div",{class:"legend"},h("span",{},h("i",{class:"dot on"}),"en ligne"),h("span",{},h("i",{class:"dot sus"}),"suspendu"),h("span",{},h("i",{class:"dot mute"}),"chat coupé")),
  list)];
}
// Deleting an account: for good, so the name is typed again. p: {id, name, isMod, baton}.
async function deleteAccount(btn,p,done){
 const inp=h("input",{type:"text",maxLength:40,autocomplete:"off"});
 const warn=[p.baton?"Il porte le Bâton de feu : le Bâton retourne dans l'urne.":null].filter(Boolean);
 const v=await dialog({title:"Supprimer le compte ?",body:[`Le compte de ${p.name} est supprimé pour de bon : progression, garde-robe et lignes du fil. Son pseudo reste bloqué 24 h.`,...warn,lab(`Retape le pseudo pour confirmer : ${p.name}`,inp),inp],ok:"Supprimer",danger:true,value:()=>inp.value,focus:inp});
 if(v==null)return;
 if(v!==p.name){toast("Le pseudo ne correspond pas : rien n'a été supprimé.",true);return;}
 act(btn,()=>call("player-delete",{id:p.id,confirm:v}),`Compte de ${p.name} supprimé.`,done);
}
// A moderator's own account: not even the owner deletes it while they are one (their console access stands on it).
const mayDelete=p=>can("player-delete")&&!p.isMod;
async function viewAbandoned(){
 const {items}=await call("abandoned-list");
 const row=x=>h("tr",{},h("td",{},h("a",{href:`#joueurs/${x.id}`},x.name),x.baton?h("span",{class:"badge mythic"},"🔥 Bâton"):null,x.isMod?h("span",{class:"badge warn"},"modo"):null),
  h("td",{},h("div",{class:"btn-row"},
   mayDelete(x)?h("button",{class:"btn small danger",type:"button",onclick:e=>deleteAccount(e.currentTarget,x,render)},"Supprimer"):null,
   can("alerts-ack")?h("button",{class:"btn small",type:"button",onclick:e=>act(e.currentTarget,()=>call("abandoned-ignore",{id:x.id}),`${x.name} ignoré, jusqu'à son retour.`)},"Ignorer"):null)),
  h("td",{},campBadge(x.camp)),
  h("td",{class:"nowrap"},`${fmt(x.lastSeen)} (${ago(x.lastSeen)})`),h("td",{},String(x.idleDeaths)),h("td",{},String(x.best)),h("td",{},String(x.flame)));
 return [head("Comptes abandonnés",h("a",{class:"btn small",href:"#joueurs"},"← Joueurs"),refreshBtn()),
  h("div",{class:"card"},h("p",{class:"muted small"},"3 morts d'affilée sans jouer et 5 jours sans connexion. Rien n'est supprimé tout seul. Les comptes protégés n'apparaissent pas."),
   items.length?h("div",{class:"table-wrap"},h("table",{},h("thead",{},h("tr",{},["Joueur","","Camp","Dernière connexion","Morts d'affilée","Meilleur niveau","Flamme"].map(t=>h("th",{},t)))),h("tbody",{},items.map(row)))):empty("Aucun compte abandonné."))];
}
const GAUGES=[["form","Forme"],["sat","Satiété"],["moral","Moral"],["energy","Énergie"],["hyg","Hygiène"]];
async function viewPlayer(id){
 const {player:p}=await call("player",{id});
 const by={id:p.id},muted=p.chatMutedUntil>Date.now();
 const muteSel=h("select",{"aria-label":"Durée"},[[1,"1 heure"],[24,"24 heures"],[72,"3 jours"],[168,"7 jours"],[720,"30 jours"]].map(([v,t])=>h("option",{value:v},t)));
 const btn=(label,cls,fn)=>h("button",{class:`btn small ${cls||""}`,type:"button",onclick:e=>fn(e.currentTarget)},label);
 const locked=p.protected&&!owner(),self=isMe(p.id)||locked,ok=a=>can(a)&&!self;
 const actions=h("div",{class:"btn-row"},
  self?h("p",{class:"muted small"},locked?"Compte protégé par l'organisateur : aucune action possible dessus.":"C'est ton propre compte : aucune action possible dessus."):null,
  ok("signout")&&btn("Déconnecter partout","",b=>confirmBox("Déconnecter partout ?",`${p.name} sera déconnecté de tous ses appareils.`,"Déconnecter").then(ok=>ok&&act(b,()=>call("signout",by),"Sessions fermées."))),
  ok("reset-password")&&btn("Réinitialiser le mot de passe","danger",b=>confirmBox("Réinitialiser le mot de passe ?",`Un nouveau mot de passe est généré pour ${p.name} ; ses sessions sont fermées partout.`,"Réinitialiser").then(ok=>ok&&act(b,
   async()=>{const r=await api(sp("reset-password"),{name:p.name});await secretBox("Nouveau mot de passe",`Mot de passe de ${r.name} :`,r.password);},null))),
  ok("unlock")&&btn("Débloquer la connexion","",b=>act(b,()=>call("unlock",{name:p.name}),r=>`Essais de connexion remis à zéro (${r.cleared??0}).`)),
  ok("rename")&&btn("Renommer","",async b=>{const n=await promptBox("Renommer",`Nouveau pseudo pour ${p.name}`,p.name);if(n&&n!==p.name)act(b,()=>call("rename",{...by,newName:n}),r=>`Renommé en ${r.name}.`);}),
  !ok("suspend")?null:p.suspended?btn("Réactiver le compte","",b=>confirmBox("Réactiver ?",`${p.name} pourra se reconnecter ; son compagnon reprend sans rattrapage du temps passé.`,"Réactiver",false).then(ok=>ok&&act(b,()=>call("suspend",{...by,on:false}),"Compte réactivé.")))
   :btn("Suspendre","danger",b=>confirmBox("Suspendre le compte ?",`${p.name} est déconnecté, ne peut plus se connecter, disparaît du classement ; son compagnon est figé et ses duels ouverts sont annulés.`,"Suspendre").then(ok=>ok&&act(b,()=>call("suspend",{...by,on:true}),"Compte suspendu."))));
 const chat=h("div",{class:"btn-row"},muted?h("span",{class:"badge warn"},`chat coupé jusqu'au ${fmt(p.chatMutedUntil)}`):h("span",{class:"muted small"},"Chat autorisé"),ok("chat-mute")&&muteSel,
  ok("chat-mute")&&btn("Couper le chat","danger",b=>{const hrs=+muteSel.value;confirmBox("Couper le chat ?",`${p.name} ne pourra plus écrire dans le chat pendant ${muteSel.selectedOptions[0].textContent}.`,"Couper").then(ok=>ok&&act(b,()=>call("chat-mute",{...by,hours:hrs}),"Chat coupé."));}),
  muted&&ok("chat-mute")?btn("Rétablir le chat","",b=>act(b,()=>call("chat-mute",{...by,hours:0}),"Chat rétabli.")):null);
 const kv=(...pairs)=>h("dl",{class:"kv"},pairs.filter(Boolean).flatMap(([k,v])=>[h("dt",{},k),h("dd",{},v??"—")]));
 // At the bottom of the file: the protection is the owner's, and a protected account must be freed before it can go.
 const account={...p,baton:!!p.wardrobe?.baton},del=ok("player-delete")&&mayDelete(account);
 const sensitive=(owner()||del)?h("div",{class:"card"},h("h2",{},"Zone sensible"),h("div",{class:"btn-row"},
  owner()?btn(p.protected?"Retirer la protection":"Protéger le compte","",b=>act(b,()=>call("player-protect",{...by,on:!p.protected}),p.protected?"Protection retirée.":"Compte protégé : aucun modo ne peut plus agir dessus.")):null,
  del&&!p.protected?btn("Supprimer le compte","danger",b=>deleteAccount(b,account,()=>{location.hash="#joueurs";})):null),
  p.protected&&owner()?h("p",{class:"muted small"},"Retire la protection pour pouvoir supprimer ce compte."):null,
  p.isMod&&owner()?h("p",{class:"muted small"},"Compte d'un modérateur : retire-le d'abord des modérateurs (page Modérateurs) pour pouvoir le supprimer."):null):null;
 return [
  h("div",{class:"view-head"},h("div",{class:"btn-row"},h("a",{class:"btn small",href:"#joueurs"},"← Joueurs"),h("h1",{},p.name),srvTag(),campBadge(p.camp),dots(p),p.suspended?h("span",{class:"badge bad"},"suspendu"):null,p.protected?h("span",{class:"badge good"},"Protégé"):null),refreshBtn()),
  h("div",{class:"card"},h("h2",{},"Actions"),actions,h("h2",{class:"sub"},"Chat"),chat),
  h("div",{class:"grid wide"},
   h("div",{class:"card"},h("h2",{},"Compte"),kv(["Identifiant",String(p.id)],["Camp",CAMP[p.camp]||p.camp],["Candidat",p.candidate],["Inscrit le",fmt(p.created)],["Vu",p.lastSeen?`${fmt(p.lastSeen)} (${ago(p.lastSeen)})`:"jamais"],
    ["En ligne",p.online?"oui":"non"],["Sessions",String(p.sessions??"—")],["Abonnements notif.",String(p.pushSubs??"—")],["Suspendu",p.suspended?"oui":"non"],
    ["Nouveautés vues",p.seenVersion||"jamais"],p.mythicBlock?["Bâton de feu",`non éligible au Bâton de feu : ${p.mythicBlock}`]:null)),
   h("div",{class:"card"},h("h2",{},"Partie"),kv(["Niveau",String(p.lvl??"—")],["XP",String(p.xp??"—")],["Score",String(p.score??"—")],["Fonds (FM)",String(p.fm??"—")],["Morts",String(p.deaths??"—")],["Morts d'affilée sans jouer",String(p.idleDeaths??"—")],
    ...GAUGES.map(([k,l])=>[l,p[k]==null?"—":typeof p[k]==="number"?String(Math.round(p[k])):String(p[k])])))),
  wardrobeCard(p),
  batonCard(p,self),
  h("div",{class:"card"},h("h2",{},"Derniers duels"),p.duels?.length?h("div",{class:"table-wrap"},h("table",{},
   h("thead",{},h("tr",{},["Date","Contre","Rôle","Statut","Résultat","Signaux",""].map(t=>h("th",{},t)))),
   h("tbody",{},p.duels.map(d=>h("tr",{},h("td",{class:"nowrap"},fmt(d.created)),h("td",{},who(d.vs)),h("td",{},d.role==="challenger"?"lanceur":d.role==="defender"?"défié":d.role??"—"),
    h("td",{},tr(DUEL_STATUS,d.status)),h("td",{},tr(DUEL_RES,d.res)),h("td",{},flagBadges(d.flags)||"—"),
    h("td",{},d.status==="done"&&d.id!=null&&!self?annulBtn({id:d.id,label:`${p.name} contre ${who(d.vs)}`}):null)))))):empty("Aucun duel.")),
  p.games&&!p.activity?.games?h("div",{class:"card"},h("h2",{},"Mini-jeux (14 jours)"),gamesTable(p.games)):null,
  h("div",{class:"card"},h("h2",{},"Activité et mini-jeux (14 jours)"),p.activity?botReport(p.activity,false):empty("Pas de rapport d'activité.")),
  sensitive,
 ];
}

// The player's cosmetics (Garde-robe): never money nor XP, just what they own and wear. The owner alone can put the
// mythic staff back in the urn (a win to undo after a cheat, say).
function wardrobeCard(p){
 const w=p.wardrobe;if(!w)return null;
 const name=x=>x?`${x.name}${x.rarity?` (${RARITY[x.rarity]||x.rarity})`:""}`:"rien";
 const counts=Object.entries(RARITY).map(([k,l])=>[l,w.own.filter(x=>x.rarity===k).length]).filter(([,n])=>n);
 const reset=owner()&&w.baton?h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Remettre le Bâton dans l'urne ?",
  `${p.name} perd le Bâton de feu des Apprix ; il redevient gagnable au tirage par tous les joueurs.`,"Remettre dans l'urne").then(ok=>ok&&act(b,()=>call("mythic-reset"),"Le Bâton est de retour dans l'urne."));}},"Remettre le Bâton dans l'urne"):null;
 return h("div",{class:"card"},h("div",{class:"btn-row"},h("h2",{},"Garde-robe"),w.baton?h("span",{class:"badge mythic"},"🔥 Porteur du Bâton de feu"):null),
  h("dl",{class:"kv"},[["Flamme",String(w.flame)],["Bulletins",String(w.bulletins)],["Confettis",String(w.confetti)],["Tirages",String(w.draws)],
   ["Objets possédés",`${w.own.length}${counts.length?` (${counts.map(([l,n])=>`${l} ${n}`).join(", ")})`:""}`],["Tenue portée",name(w.worn?.outfit)],["Objet porté",name(w.worn?.object)]]
   .flatMap(([k,v])=>[h("dt",{},k),h("dd",{},v)])),
  w.own.length?h("p",{class:"wrap muted small"},w.own.map(x=>x.name).join(" · ")):null,
  reset?h("div",{class:"btn-row"},reset):null);
}

// The player's duels for the Bâton: a held one (the anti-cheat flagged a part) waits for a judgement, with the right
// to annul duels: accepted, its result applies (the staff may move); rejected, nothing moves.
function batonCard(p,self){
 const list=p.batonDuels||[];if(!list.length)return null;
 const judge=(d,accept)=>h("button",{class:`btn small ${accept?"go":"danger"}`,type:"button",onclick:e=>{const b=e.currentTarget;
  confirmBox(accept?"Valider ce duel du Bâton ?":"Annuler ce duel du Bâton ?",accept?`Duel #${d.id} : son résultat s'applique tel quel, le Bâton peut changer de mains.`:`Duel #${d.id} : annulé, le Bâton reste où il est.`,accept?"Valider":"Annuler le duel")
   .then(ok=>ok&&act(b,()=>call("baton-judge",{id:d.id,accept}),accept?"Duel validé.":"Duel annulé."));}},accept?"Valider le résultat":"Annuler (rien ne bouge)");
 return h("div",{class:"card"},h("h2",{},"Duels du Bâton"),h("div",{class:"table-wrap"},h("table",{},
  h("thead",{},h("tr",{},["Date","Contre","Rôle","Mode","Statut","Résultat","Signaux",""].map(t=>h("th",{},t)))),
  h("tbody",{},list.map(d=>h("tr",{},h("td",{class:"nowrap"},fmt(d.created)),h("td",{},who(d.vs)),h("td",{},d.role==="challenger"?"lanceur":"porteur"),
   h("td",{},d.mode==="live"?"en direct":"en différé"),h("td",{},tr(BATON_STATUS,d.status)),h("td",{},tr(DUEL_RES,d.res)),
   h("td",{},flagBadges((d.flags||[]).map(x=>({...x,name:`${x.name}, manche ${x.n+1}`})))||"—"),
   h("td",{},d.status==="held"&&can("duel-annul")&&!self?h("div",{class:"btn-row"},judge(d,true),judge(d,false)):null)))))));
}

// ===================================================================== Annonces
const ANNOUNCE_MAX=240;
// Mirrors the server's cleaning (announce() in server.mjs) so the preview and the counter tell the truth.
const cleanAnnounce=s=>s.normalize("NFC").replace(/[\p{Cc}؜​‌‎‏‪-‮⁠⁦-⁩﻿]/gu," ").replace(/\s+/g," ").trim();
function targetPicker(names){
 const sel=h("select",{"aria-label":"Destinataires"},h("option",{value:"all"},"Tout le monde"),h("option",{value:"left"},"Le camp de gauche"),h("option",{value:"right"},"Le camp de droite"),h("option",{value:"player"},"Un joueur"));
 const dl=h("datalist",{id:`names-${Math.random().toString(36).slice(2)}`},names.map(n=>h("option",{value:n})));
 const name=h("input",{type:"text",placeholder:"Pseudo",maxLength:40,hidden:true,"aria-label":"Pseudo du joueur"});name.setAttribute("list",dl.id);
 sel.addEventListener("change",()=>{name.hidden=sel.value!=="player";if(!name.hidden)name.focus();});
 const get=()=>{
  if(sel.value==="player"){const n=name.value.trim();if(!n)throw new Error("Indique le pseudo du joueur.");return {kind:"player",name:n};}
  return sel.value==="all"?{kind:"all"}:{kind:"camp",camp:sel.value};
 };
 const label=t=>t.kind==="all"?"tout le monde":t.kind==="camp"?`le camp de ${t.camp==="left"?"gauche":"droite"}`:t.name;
 return {sel,node:h("div",{class:"field-row"},sel,name,dl),get,label,reset:()=>{sel.value="all";name.value="";name.hidden=true;}};
}
function composer(){
 const ta=h("textarea",{rows:3,maxLength:400,placeholder:"Texte de l'annonce (texte brut, 240 caractères au plus)","aria-label":"Texte de l'annonce"});
 const counter=h("div",{class:"counter"}),prev=h("p",{});
 const upd=()=>{const t=cleanAnnounce(ta.value);counter.textContent=`${t.length} / ${ANNOUNCE_MAX}`;counter.classList.toggle("over",t.length>ANNOUNCE_MAX);prev.textContent=t||"…";};
 ta.addEventListener("input",upd);upd();
 return {ta,counter,preview:h("div",{class:"preview","aria-label":"Aperçu"},h("div",{},h("b",{},"Annonce officielle"),prev)),
  text:()=>{const t=cleanAnnounce(ta.value);if(!t||t.length>ANNOUNCE_MAX)throw new Error(`L'annonce doit faire 1 à ${ANNOUNCE_MAX} caractères.`);return t;},clear:()=>{ta.value="";upd();}};
}
const DAYS=["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
function ruleText(s){
 if(s.kind==="once")return `une fois, le ${fmt(s.at)}`;
 const d=s.kind==="weekly"?` (${[...(s.days||[])].sort((a,b)=>((a+6)%7)-((b+6)%7)).map(x=>DAYS[x]).join(" ")})`:"";
 return `${s.kind==="daily"?"tous les jours":"chaque semaine"} à ${s.time}${d}${s.until?`, jusqu'au ${fmtDay(s.until)}`:""}`;
}
async function viewAnnounces(){
 const [{players},{schedules},hist]=await Promise.all([call("list"),call("schedule-list"),call("announce-history")]);
 const names=players.map(p=>p.name);
 // Send now
 const c1=composer(),t1=targetPicker(names);
 const send=h("button",{class:"btn go",type:"button",onclick:async e=>{
  let text,t;try{text=c1.text();t=t1.get();}catch(x){return toast(x.message,true);}
  if(!await confirmBox("Envoyer l'annonce ?",[`À ${t1.label(t)} :`,h("p",{class:"preview"},text)],"Envoyer",false))return;
  const args=t.kind==="player"?{text,to:t.name}:t.kind==="camp"?{text,camp:t.camp}:{text};
  act(e.currentTarget,()=>call("announce",args),r=>r.name?`Envoyée à ${r.name} : ${r.live?"à l'écran":"pas connecté"}, ${r.pushed?"notifié":"pas de notification"}.`
   :`Envoyée : ${r.live} à l'écran, ${r.push?`${r.pushed} par notification`:"notifications désactivées"}.`,async()=>{c1.clear();t1.reset();await render();});
 }},"Envoyer maintenant");
 // Schedule
 const c2=composer(),t2=targetPicker(names);
 const kindSel=h("select",{"aria-label":"Fréquence"},h("option",{value:"once"},"Une fois"),h("option",{value:"daily"},"Tous les jours"),h("option",{value:"weekly"},"Certains jours de la semaine"));
 const at=h("input",{type:"datetime-local","aria-label":"Date et heure"}),time=h("input",{type:"time",value:"12:00","aria-label":"Heure (fuseau du jeu)"});
 const until=h("input",{type:"date","aria-label":"Jusqu'au (facultatif)"});
 const dayBoxes=[1,2,3,4,5,6,0].map(d=>h("input",{type:"checkbox",value:d}));
 const days=h("div",{class:"days"},dayBoxes.map((b,i)=>h("label",{class:"check"},b,["lun.","mar.","mer.","jeu.","ven.","sam.","dim."][i])));
 const onceBox=h("div",{},lab("Date et heure (heure de ce navigateur)",at),at);
 const repBox=h("div",{},h("div",{class:"field-row"},h("div",{},lab("Heure (fuseau du jeu, Paris)",time),time),h("div",{},lab("Jusqu'au (facultatif, inclus)",until),until)),h("div",{hidden:true},lbl("Jours"),days));
 const showKind=()=>{onceBox.hidden=kindSel.value!=="once";repBox.hidden=kindSel.value==="once";repBox.lastChild.hidden=kindSel.value!=="weekly";};
 kindSel.addEventListener("change",showKind);showKind();
 const plan=h("button",{class:"btn go",type:"button",onclick:e=>{
  let b;
  try{
   b={text:c2.text(),target:t2.get(),kind:kindSel.value};
   if(b.kind==="once"){const t=at.value?new Date(at.value).getTime():NaN;if(!(t>Date.now()))throw new Error("Choisis une date et une heure à venir.");b.at=t;}
   else{
    if(!/^\d{2}:\d{2}$/.test(time.value))throw new Error("Choisis une heure.");b.time=time.value;
    if(b.kind==="weekly"){b.days=dayBoxes.filter(x=>x.checked).map(x=>+x.value);if(!b.days.length)throw new Error("Coche au moins un jour.");}
    b.until=until.value?new Date(`${until.value}T23:59:59`).getTime():null;
   }
  }catch(x){return toast(x.message,true);}
  act(e.currentTarget,()=>call("schedule-add",b),"Annonce planifiée.");
 }},"Planifier");
 const schedRows=schedules.length?h("ul",{class:"list"},schedules.map(s=>{
  const tog=h("input",{type:"checkbox",checked:!!s.enabled,disabled:!can("announce"),"aria-label":"Active",onchange:e=>act(null,()=>call("schedule-toggle",{id:s.id,enabled:e.target.checked}),e.target.checked?"Planification activée.":"Planification en pause.")});
  const tg=s.target||{};
  return h("li",{class:"row"},h("label",{class:"check"},tog),h("span",{class:"grow"},h("div",{},s.text),
   h("div",{class:"meta"},`${ruleText(s)} · pour ${tg.kind==="camp"?`le camp de ${tg.camp==="left"?"gauche":"droite"}`:tg.kind==="player"?tg.name:"tout le monde"} · prochaine : ${s.enabled&&s.next?fmt(s.next):"—"} · dernière : ${fmt(s.last)}`)),
   can("announce")&&h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer cette planification ?",s.text,"Supprimer").then(ok=>ok&&act(b,()=>call("schedule-delete",{id:s.id}),"Planification supprimée."));}},"Supprimer"));
 })):empty("Aucune annonce planifiée.");
 const items=hist.items||[];
 return [
  head("Annonces",refreshBtn()),
  can("announce")&&h("div",{class:"grid wide"},
   h("div",{class:"card"},h("h2",{},"Envoyer maintenant"),lab("Destinataires",t1.sel),t1.node,lab("Texte",c1.ta),c1.ta,c1.counter,lbl("Aperçu"),c1.preview,
    h("p",{class:"muted small"},"Bandeau sur les écrans ouverts (jamais en pleine partie), notification aux abonnés et, envoyée à tous, une ligne dans le fil."),h("div",{class:"btn-row"},send)),
   h("div",{class:"card"},h("h2",{},"Planifier"),lab("Destinataires",t2.sel),t2.node,lab("Texte",c2.ta),c2.ta,c2.counter,c2.preview,
    lab("Fréquence",kindSel),kindSel,onceBox,repBox,h("div",{class:"btn-row"},plan))),
  h("div",{class:"card"},h("h2",{},"Planifiées"),schedRows),
  h("div",{class:"card"},h("h2",{},"Historique"),items.length?h("div",{class:"table-wrap"},h("table",{},
   h("thead",{},h("tr",{},["Date","Par","Pour","Texte"].map(t=>h("th",{},t)))),
   h("tbody",{},items.map(i=>h("tr",{},h("td",{class:"nowrap"},fmt(i.t)),h("td",{},byWho(i.via,i.by)),h("td",{},i.target||"tous"),h("td",{class:"wrap"},i.text??"")))))):empty("Aucune annonce envoyée.")),
 ];
}

// ===================================================================== Events
const EV_WHO={all:"Tout le monde",left:"La gauche",right:"La droite"},EV_REP={"":"",day:"Chaque jour",week:"Chaque semaine"};
const EV_HOURS=[[1,"1 h"],[2,"2 h"],[4,"4 h"],[12,"12 h"],[24,"24 h"],[72,"3 jours"],[168,"7 jours (maximum)"]];
const localInput=t=>new Date(t-new Date(t).getTimezoneOffset()*6e4).toISOString().slice(0,16);
async function viewEvents(){
 const {items,types,games,reminds,tokens}=await call("events-list"),H=36e5;
 let editing=null,lastType=null,seenTimer=0,seenRun=0;
 const typeSel=h("select",{id:"ev-type",onchange:()=>typeChanged()},Object.entries(types).map(([k,t])=>h("option",{value:k},t.label)));
 const desc=h("p",{class:"muted small"}),name=h("input",{type:"text",id:"ev-name",maxLength:50,oninput:()=>texts()}),msg=h("textarea",{id:"ev-msg",maxLength:160}),params=h("div",{onchange:()=>texts()});
 const start=h("input",{type:"datetime-local",id:"ev-start",onchange:()=>texts()}),len=h("select",{id:"ev-len",onchange:()=>texts()},EV_HOURS.map(([v,t])=>h("option",{value:v},t)));
 const rep=h("select",{id:"ev-rep",onchange:()=>texts()},h("option",{value:""},"Une seule fois"),h("option",{value:"day"},"Chaque jour"),h("option",{value:"week"},"Chaque semaine"));
 const who=h("select",{id:"ev-who"},Object.entries(EV_WHO).map(([k,t])=>h("option",{value:k},t)));
 const push=h("input",{type:"checkbox",checked:true,onchange:()=>texts()}),title=h("h2",{},"Nouvel événement");
 // The announcements: the prepared texts fill the boxes; the server stores a text only when it differs from them.
 const annBox=h("textarea",{id:"ev-ann",maxLength:240,oninput:()=>texts()}),remBox=h("textarea",{id:"ev-rem",maxLength:240,oninput:()=>texts()});
 const remChecks=reminds.map(([m,t])=>[h("input",{type:"checkbox",onchange:()=>texts()}),m,t]);
 const dayNote=h("p",{class:"muted small",hidden:true},"Sur une série quotidienne, le rappel 1 jour ne part que pour la première édition.");
 const annSeen=h("p",{class:"ev-seen"}),remSeen=h("p",{class:"ev-seen"}),seenBad=h("p",{class:"ev-bad small",role:"alert",hidden:true});
 const restore=(box,key)=>h("button",{class:"btn small",type:"button",onclick:()=>{box.value=types[typeSel.value][key];texts();}},"Rétablir le texte préfait");
 const annPart=h("div",{},h("label",{for:"ev-ann"},"Texte de l'annonce"),annBox,h("div",{class:"btn-row"},restore(annBox,"ann")),annSeen);
 const remPart=h("div",{},h("label",{for:"ev-rem"},"Texte des rappels"),remBox,h("div",{class:"btn-row"},restore(remBox,"rem")),remSeen);
 const picked=()=>remChecks.filter(([c])=>c.checked).map(([,m])=>m);
 // What will go out, as the server words it (the summary and the times are its own), a moment after the last key.
 function texts(){
  dayNote.hidden=!(rep.value==="day"&&picked().includes(1440));
  annPart.hidden=!push.checked;remPart.hidden=!picked().length;
  clearTimeout(seenTimer);const run=++seenRun;
  seenTimer=setTimeout(async()=>{
   const t=new Date(start.value).getTime();if(!Number.isSafeInteger(t))return;
   try{
    const r=await call("event-preview",{type:typeSel.value,name:name.value,params:readParams(),starts:t,ends:t+Number(len.value)*H,ann:annBox.value,rtext:remBox.value});
    if(run!==seenRun)return;
    annSeen.textContent=`Aperçu : ${r.ann}`;remSeen.textContent=`Aperçu, 15 minutes avant : ${r.remind}`;seenBad.hidden=true;
   }catch(e){if(run!==seenRun)return;seenBad.textContent=e.message;seenBad.hidden=false;}
  },300);
 }
 function drawParams(p){
  const t=types[typeSel.value];
  params.replaceChildren(...t.params.flatMap(f=>f.games
   ?[lbl(f.label),...games.map(([k,n])=>h("label",{class:"check"},h("input",{type:"checkbox","data-game":k,checked:p?p[f.k].includes(k):true}),n))]
   :(sel=>[lab(f.label,sel),sel])(h("select",{"data-k":f.k,"aria-label":f.label},f.opts.map(([v,n])=>h("option",{value:String(v),selected:String(p?.[f.k]??f.def)===String(v)},n))))));
 }
 function typeChanged(){
  const t=types[typeSel.value],was=types[lastType];desc.textContent=t.desc;name.value=t.label;msg.value=t.msg;drawParams();
  if(!was||annBox.value===was.ann)annBox.value=t.ann;   // a text written by hand stays
  if(!was||remBox.value===was.rem)remBox.value=t.rem;
  lastType=typeSel.value;texts();
 }
 function readParams(){
  const p={};for(const s of params.querySelectorAll("select"))p[s.dataset.k]=s.value==="all"?"all":Number(s.value);
  const g=[...params.querySelectorAll("[data-game]")];if(g.length)p.games=g.filter(c=>c.checked).map(c=>c.dataset.game);
  return p;
 }
 const plan=h("button",{class:"btn go",type:"button",onclick:e=>save(e.currentTarget,false)},"Programmer");
 const nowBtn=h("button",{class:"btn",type:"button",onclick:e=>save(e.currentTarget,true)},"Lancer maintenant");
 const cancel=h("button",{class:"btn",type:"button",hidden:true,onclick:()=>reset()},"Annuler");
 function reset(){editing=null;title.textContent="Nouvel événement";plan.textContent="Programmer";cancel.hidden=true;nowBtn.hidden=false;start.value=localInput(Date.now()+H);len.value="2";rep.value="";who.value="all";push.checked=true;for(const [c] of remChecks)c.checked=false;lastType=null;typeSel.selectedIndex=0;typeChanged();}
 function fill(e,edit){
  editing=edit?e:null;typeSel.value=e.type;desc.textContent=types[e.type].desc;name.value=e.name;msg.value=e.msg;drawParams(e.params);
  start.value=localInput(edit?e.starts:Date.now()+H);const hrs=(e.ends-e.starts)/H;len.value=String((EV_HOURS.find(([v])=>v>=hrs)??EV_HOURS.at(-1))[0]);
  rep.value=e.rep;who.value=e.who;push.checked=e.push;for(const [c,m] of remChecks)c.checked=e.reminds.includes(m);
  annBox.value=e.ann??types[e.type].ann;remBox.value=e.rtext??types[e.type].rem;lastType=e.type;texts();
  title.textContent=edit?`Modifier « ${e.name} »`:`Dupliquer « ${e.name} »`;plan.textContent=edit?"Enregistrer":"Programmer";nowBtn.hidden=edit;cancel.hidden=false;
  title.scrollIntoView({behavior:"smooth",block:"center"});
 }
 function save(btn,launch){
  const t=new Date(start.value).getTime(),base=launch?Date.now():t;
  act(btn,()=>call("event-save",{...(editing?{id:editing.id}:{}),type:typeSel.value,name:name.value,msg:msg.value,params:readParams(),starts:base,ends:base+Number(len.value)*H,who:who.value,rep:rep.value,push:push.checked,ann:annBox.value,rtext:remBox.value,reminds:picked(),now:launch}),
   launch?"Événement lancé.":editing?"Événement modifié.":"Événement programmé.");
 }
 const row=e=>h("div",{class:"ev"},
  h("div",{class:"btn-row"},h("b",{},e.name),e.state==="on"?h("span",{class:"badge good"},"En cours"):e.state==="soon"?h("span",{class:"badge warn"},"Programmé"):null,
   e.who!=="all"?h("span",{class:"badge"},EV_WHO[e.who]):null,e.rep?h("span",{class:"badge"},EV_REP[e.rep]):null),
  h("p",{class:"muted small"},`${e.summary} · ${fmt(e.starts)} → ${fmt(e.ends)}${e.by?` · par ${e.by}`:""}${e.stopped?" · arrêté avant la fin":""}`),
  e.push||e.reminds.length?h("p",{class:"muted small"},[e.push?"Annonce au début":null,e.reminds.length?`Rappels : ${e.reminds.map(m=>reminds.find(r=>r[0]===m)?.[1]).join(", ")}`:null].filter(Boolean).join(" · ")):null,
  h("div",{class:"btn-row"},
   e.state==="on"&&can("events-run")?h("button",{class:"btn small danger",type:"button",onclick:ev=>{const b=ev.currentTarget;confirmBox(`Arrêter « ${e.name} » ?`,"L'événement s'arrête pour tous les joueurs. Les parties et les missions déjà lancées gardent leur bonus.","Arrêter").then(ok=>ok&&act(b,()=>call("event-stop",{id:e.id}),"Événement arrêté."));}},"Arrêter"):null,
   e.state==="soon"&&can("events-run")?h("button",{class:"btn small go",type:"button",onclick:ev=>act(ev.currentTarget,()=>call("event-start",{id:e.id}),"Événement lancé.")},"Lancer maintenant"):null,
   e.state==="soon"&&can("events-edit")?h("button",{class:"btn small",type:"button",onclick:()=>fill(e,true)},"Modifier"):null,
   e.state==="soon"&&can("events-delete")?h("button",{class:"btn small danger",type:"button",onclick:ev=>{const b=ev.currentTarget;confirmBox(`Supprimer « ${e.name} » ?`,e.rep?"La série s'arrête avec cet événement.":"Il ne sera pas lancé.","Supprimer").then(ok=>ok&&act(b,()=>call("event-delete",{id:e.id}),"Événement supprimé."));}},"Supprimer"):null,
   can("events-edit")?h("button",{class:"btn small",type:"button",onclick:()=>fill(e,false)},"Dupliquer"):null));
 const part=(t,s,none,sort)=>{const l=items.filter(e=>e.state===s).sort(sort);return h("div",{class:"card"},h("h2",{},t),l.length?l.map(row):empty(none));};
 const up=(a,b)=>a.starts-b.starts;
 const form=can("events-edit")&&h("div",{class:"card"},title,h("label",{for:"ev-type"},"Type"),typeSel,desc,h("label",{for:"ev-name"},"Nom vu par les joueurs"),name,h("label",{for:"ev-msg"},"Message du bandeau"),msg,params,
  h("label",{for:"ev-start"},"Début (heure de ce navigateur)"),start,h("label",{for:"ev-len"},"Durée"),len,h("label",{for:"ev-rep"},"Répétition"),rep,h("label",{for:"ev-who"},"Pour qui"),who,
  h("h3",{},"Annonces"),h("label",{class:"check"},push,"Annonce au début (notification, et fil si l'événement vise tout le monde)"),annPart,
  h("p",{class:"muted small"},"Rappels avant le début :"),remChecks.map(([c,,t])=>h("label",{class:"check"},c,`${t} avant`)),dayNote,remPart,
  h("p",{class:"muted small"},`Remplacés à l'envoi : ${tokens.map(t=>`{${t}}`).join(", ")}.`),seenBad,
  h("div",{class:"btn-row"},plan,can("events-run")?nowBtn:null,cancel));
 reset();
 return [head("Events",refreshBtn()),h("div",{class:"grid wide"},h("div",{},part("En cours","on","Aucun événement en cours.",up),part("À venir","soon","Rien de programmé.",up)),form),
  part("Passés","past","Aucun événement passé.",(a,b)=>b.ends-a.ends)];
}

// ===================================================================== Chat
const IMG_TYPES=["image/gif","image/png","image/jpeg","image/webp"];
// A reported image is fetched only on demand (chat-media), checked, and shown through a data: URL (CSP img-src data:).
async function showMedia(btn,media){
 const r=await call("chat-media",{id:media.id});
 if(!IMG_TYPES.includes(r.type)||typeof r.data!=="string"||!/^[A-Za-z0-9+/]*={0,2}$/.test(r.data))throw new Error("Image illisible.");
 btn.replaceWith(h("img",{class:"reported",src:`data:${r.type};base64,${r.data}`,alt:"Image signalée",referrerPolicy:"no-referrer"}));
}
const ROOM={global:"salon Tous",left:"salon Gauche",right:"salon Droite"};
// Reported messages first, then every room at once (both camps included), refreshed every 10 s: the newest at the bottom,
// older ones on demand. Delete and mute when allowed, never on one's own messages.
const ROOM_FILTER=[["","Tous les salons"],["global","Pour tous"],["left","Gauche"],["right","Droite"]];
let chatRoom="";
function chatActions(m,after){
 if(isMe(m.authorId))return null;
 const author=who(m.author),target=m.authorId!=null?{id:m.authorId}:{name:author};
 const hrs=h("select",{class:"inline","aria-label":"Durée"},[[24,"24 h"],[72,"3 jours"],[168,"7 jours"],[720,"30 jours"]].map(([v,t])=>h("option",{value:v},t)));
 const del=can("chat-delete")&&h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer ce message ?","Il disparaît des écrans de tous les joueurs.","Supprimer").then(ok=>ok&&act(b,()=>call("chat-delete",{id:m.id}),"Message supprimé.",after));}},"Supprimer");
 const mute=can("chat-mute")&&[hrs,h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox(`Couper le chat de ${author} ?`,`${author} ne pourra plus écrire pendant ${hrs.selectedOptions[0].textContent}.`,"Couper").then(ok=>ok&&act(b,()=>call("chat-mute",{...target,hours:+hrs.value}),"Chat de l'auteur coupé.",after));}},"Couper son chat")];
 return del||mute?h("div",{class:"btn-row"},del,mute):null;
}
const mediaBtn=m=>m.media?h("button",{class:"btn small",type:"button",onclick:e=>act(e.currentTarget,()=>showMedia(e.currentTarget,m.media),null,null)},`Voir l'image (${m.media.type||"image"})`):null;
const authorLink=m=>sees("joueurs")&&m.authorId!=null?h("a",{href:`#joueurs/${m.authorId}`},h("b",{},who(m.author))):h("b",{},who(m.author));
async function viewChat(){
 const [{items},st]=await Promise.all([call("chat-reports"),call("stats")]);
 const rooms=st.chatRooms||{},state=(on,label)=>h("span",{class:`badge ${on?"good":""}`},`${label} : ${on?"ouvert":"fermé"}`);
 // The live feed: drawn once, then topped up in place (the scroll position stays where the reader left it).
 const box=h("ol",{class:"chat-feed","aria-live":"off"}),more=h("button",{class:"btn small",type:"button"},"Messages plus anciens");
 let msgs=[],full=false;
 const atBottom=()=>box.scrollHeight-box.scrollTop-box.clientHeight<40;
 const row=m=>h("li",{class:`chat-line${m.reports?" reported":""}`},
  h("div",{class:"btn-row"},h("span",{class:"muted small nowrap"},fmt(m.t)),h("span",{class:`badge ${m.room==="global"?"":m.room}`},ROOM[m.room]||m.room),authorLink(m),
   m.reports?h("span",{class:"badge bad"},`${m.reports} signalement${m.reports>1?"s":""}`):null),
  m.text?h("p",{class:"wrap msg"},m.text):null,mediaBtn(m),chatActions(m,()=>load(true)));
 const draw=(stick)=>{const keep=box.scrollHeight-box.scrollTop;box.replaceChildren(...(msgs.length?msgs.map(row):[h("li",{class:"empty"},"Aucun message.")]));
  // The first drawing happens before the box is on the page: the scroll is set once it is laid out.
  const place=()=>{box.scrollTop=stick?box.scrollHeight:box.scrollHeight-keep;};place();if(!box.isConnected)requestAnimationFrame(place);
  more.hidden=full||!msgs.length;};
 async function load(reset=false,older=false){
  const r=await call("chat-feed",{limit:100,room:chatRoom,...(older&&msgs.length?{before:msgs[0].id}:{})});
  const stick=!older&&(reset||atBottom());
  if(older){full=r.items.length<100;msgs=[...r.items,...msgs];}
  else if(reset)msgs=r.items;
  else{const min=r.items[0]?.id??Infinity;msgs=[...msgs.filter(m=>m.id<min),...r.items];}   // the latest page replaces what it covers: deletions show
  draw(stick);
 }
 more.addEventListener("click",e=>act(e.currentTarget,()=>load(false,true),null,null));
 const filter=h("select",{class:"inline","aria-label":"Salon",onchange:e=>{chatRoom=e.target.value;full=false;load(true).catch(fail);}},ROOM_FILTER.map(([v,t])=>h("option",{value:v,selected:v===chatRoom},t)));
 await load(true);
 refreshT=setInterval(()=>{if(!document.hidden&&route().id==="chat")load().catch(()=>{});},10000);
 return [head("Chat",h("span",{class:"muted small"},"actualisé toutes les 10 s"),refreshBtn()),
  h("div",{class:"card"},h("h2",{},"Salons"),h("div",{class:"btn-row"},state(rooms.global,"Pour tous"),state(rooms.camp,"De camp (gauche et droite)"),
   owner()?h("a",{class:"btn small",href:"#reglages"},"Ouvrir ou fermer →"):null)),
  h("div",{class:"card"},h("h2",{},`Messages signalés (${items.length})`),
   items.length?h("div",{class:"list"},items.map(m=>h("div",{class:"alert-item"},
    h("div",{class:"btn-row"},authorLink(m),h("span",{class:`badge ${m.room==="global"?"":m.room}`},ROOM[m.room]||m.room),
     h("span",{class:"badge bad"},`${m.reports} signalement${m.reports>1?"s":""}`),h("span",{class:"muted small"},fmt(m.t))),
    h("p",{class:"wrap msg"},m.text||(m.media?"":"(vide)")),mediaBtn(m),
    h("p",{class:"muted small"},`Signalé par : ${(m.reporters||[]).join(", ")||"—"}`),chatActions(m,render)))):empty("Aucun message signalé.")),
  h("div",{class:"card"},h("div",{class:"btn-row"},h("h2",{},"Tous les messages"),filter),h("p",{class:"muted small"},"Tous les salons, les deux camps compris ; le plus récent en bas. Les messages restent 7 jours."),
   more,box)];
}

// ===================================================================== Fil
async function viewFeed(){
 const {items}=await call("feed-list",{limit:200});
 return [head("Fil de la République",refreshBtn()),h("div",{class:"card"},items.length?h("div",{class:"table-wrap"},h("table",{},
  h("thead",{},h("tr",{},["Date","Joueur","Type","Texte",""].map(t=>h("th",{},t)))),
  h("tbody",{},items.map(i=>h("tr",{},h("td",{class:"nowrap"},fmt(i.t)),h("td",{},i.player),h("td",{},tr(FEED_KIND,i.kind)),h("td",{class:"wrap"},i.text),
   h("td",{},can("feed-delete")&&h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer cette ligne du fil ?",`${i.player} : ${i.text}`,"Supprimer").then(ok=>ok&&act(b,()=>call("feed-delete",{id:i.id}),"Ligne supprimée."));}},"Supprimer"))))))):empty("Le fil est vide."))];
}

// ===================================================================== Duels
async function viewDuels(){
 const [{items},sus]=await Promise.all([call("duels-list"),call("duels-suspects").catch(e=>({error:e.message}))]);
 const susItems=Array.isArray(sus.items)?sus.items:Array.isArray(sus.suspects)?sus.suspects:[];
 const ids=x=>(Array.isArray(x.duels)?x.duels:[]).map(d=>typeof d==="object"?d:{id:d}).filter(d=>d.id!=null);
 return [head("Duels",refreshBtn()),
  h("div",{class:"card"},h("h2",{},"Duels ouverts"),items.length?h("div",{class:"table-wrap"},h("table",{},
   h("thead",{},h("tr",{},["Lancé","Lanceur","Défié","Statut","Expire","Signaux",""].map(t=>h("th",{},t)))),
   h("tbody",{},items.map(d=>h("tr",{},h("td",{class:"nowrap"},fmt(d.created)),h("td",{},who(d.challenger)),h("td",{},who(d.defender)),h("td",{},tr(DUEL_STATUS,d.status)),h("td",{class:"nowrap"},fmt(d.expires)),
    h("td",{},flagBadges(d.flags)||"—"),
    h("td",{},d.status==="done"?annulBtn({id:d.id,label:`${who(d.challenger)} contre ${who(d.defender)}`})
     :can("duel-cancel")&&h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Annuler ce duel ?",`${who(d.challenger)} contre ${who(d.defender)} : annulé sans effet sur les jauges.`,"Annuler le duel").then(ok=>ok&&act(b,()=>call("duel-cancel",{id:d.id}),"Duel annulé."));}},"Annuler")))))))
   :empty("Aucun duel ouvert.")),
  h("div",{class:"card"},h("h2",{},"Duels suspects"),
   h("p",{class:"muted small"},"Indices de comptes multiples sur 30 jours : comptes créés à quelques minutes d'écart qui s'affrontent, tours synchronisés, toujours le même perdant. Un indice n'est pas une preuve : ouvre la fiche des joueurs pour annuler un duel terminé et rendre ses gains."),
   sus.error?h("p",{class:"err"},sus.error):susItems.length?h("div",{class:"list"},susItems.map(x=>h("div",{class:"row"},h("span",{class:"grow"},
    h("div",{},(Array.isArray(x.names)?x.names:[]).map((n,i)=>[i?" · ":"",Array.isArray(x.ids)&&x.ids[i]!=null?h("a",{href:`#joueurs/${x.ids[i]}`},h("b",{},String(n))):h("b",{},String(n))]),
     typeof x.duels==="number"?h("span",{class:"muted small"},` — ${x.duels} duel${x.duels>1?"s":""} en 30 jours`):null),
    Array.isArray(x.reasons)&&x.reasons.length?h("ul",{class:"reasons"},x.reasons.map(r=>h("li",{},String(r)))):null,
    ids(x).length?h("div",{class:"btn-row"},ids(x).map(d=>[h("span",{class:"muted small"},`#${d.id}${d.status?` ${tr(DUEL_STATUS,d.status)}`:""}`),d.status==null||d.status==="done"?annulBtn(d):null])):null))))
   :empty("Aucun duel suspect.")),
 ];
}

// ===================================================================== Réglages
// Two independent switches, saved on change; opening a room asks first (naming the server), closing does not.
function chatSettings(rooms){
 if(!rooms)return h("div",{class:"card"},h("h2",{},"Chat"),empty("Cette partie ne gère pas encore l'ouverture du chat."));
 const box=(key,label,ask)=>{
  const c=h("input",{type:"checkbox",checked:!!rooms[key],onchange:async()=>{
   const on=c.checked;
   if(on&&!await confirmBox(ask,"Les joueurs concernés pourront écrire et envoyer des images tout de suite.","Ouvrir",false)){c.checked=false;return;}
   c.disabled=true;
   try{const r=await call("chat-set",{[key]:on});Object.assign(rooms,r.chat||{[key]:on});toast(`${label} : ${on?"ouvert":"fermé"}.`);}
   catch(e){c.checked=!on;fail(e);}
   finally{c.disabled=false;}
  }});
  return h("label",{class:"check"},c,label);
 };
 return h("div",{class:"card"},h("h2",{},"Chat"),
  h("div",{},box("global","Chat pour tous","Ouvrir le chat pour tous ?"),box("camp","Chat de camp","Ouvrir le chat de camp ?")),
  h("p",{class:"muted small"},"Désactivé par défaut ; les joueurs ne peuvent pas l'activer eux-mêmes. Les messages existants sont conservés et réapparaissent à la réouverture."));
}
async function viewSettings(){
 const [inv,s]=await Promise.all([call("invite-get"),call("stats")]);
 const open=s.registrations?.open??inv.open,code=h("input",{type:"text",readOnly:true,value:inv.invite||"(aucun)",spellcheck:false,"aria-label":"Code d'invitation"});
 const SRC={env:"variable POLITIGO_INVITE",file:"généré au premier démarrage",admin:"régénéré depuis cette page"};
 const ev=h("select",{"aria-label":"Mode événement"},[["auto","Automatique (Halloween les 31 oct. et 1er nov.)"],["off","Désactivé"],["halloween","Halloween forcé"]].map(([v,t])=>h("option",{value:v,selected:s.event?.mode===v},t)));
 return [head("Réglages",refreshBtn()),h("div",{class:"grid wide"},
  h("div",{class:"card"},h("h2",{},"Code d'invitation"),h("div",{class:"secret"},code,h("button",{class:"btn small",type:"button",onclick:()=>copy(code.value,code)},"Copier")),
   h("p",{class:"muted small"},`Source : ${SRC[inv.source]||inv.source||"?"}.`),
   h("div",{class:"btn-row"},h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Régénérer le code ?","L'ancien code ne marchera plus pour s'inscrire (les comptes existants ne changent pas).","Régénérer").then(ok=>ok&&act(b,()=>call("invite-regenerate"),"Nouveau code créé."));}},"Régénérer"))),
  h("div",{class:"card"},h("h2",{},"Inscriptions"),h("p",{},open?h("span",{class:"badge good"},"ouvertes"):h("span",{class:"badge bad"},"fermées")),
   h("p",{class:"muted small"},"Fermées : personne ne peut créer de compte, même avec le code."),
   h("div",{class:"btn-row"},h("button",{class:`btn small ${open?"danger":"go"}`,type:"button",onclick:e=>{const b=e.currentTarget;
    (open?confirmBox("Fermer les inscriptions ?","Plus aucun compte ne pourra être créé.","Fermer"):Promise.resolve(true)).then(ok=>ok&&act(b,()=>call("registrations-set",{open:!open}),open?"Inscriptions fermées.":"Inscriptions ouvertes."));}},open?"Fermer les inscriptions":"Ouvrir les inscriptions"))),
  chatSettings(s.chatRooms),
  h("div",{class:"card"},h("h2",{},"Événement saisonnier"),h("p",{class:"muted small"},`En cours : ${s.event?.current?tr(EVENT,s.event.current):"aucun"}.`),ev,
   h("div",{class:"btn-row"},h("button",{class:"btn small go",type:"button",onclick:e=>act(e.currentTarget,()=>call("event-set",{mode:ev.value}),"Mode d'événement appliqué : les écrans changent tout de suite.")},"Appliquer"))))];
}

// ===================================================================== Sauvegarde
// The automatic backups live in the admin volume, for every game server at once: a list, the settings, and what failed.
const BK_FREQ=[["quotidienne","Quotidienne","chaque jour"],["hebdomadaire","Hebdomadaire","le lundi"],["mensuelle","Mensuelle","le 1er du mois"]],BK_LABEL={quotidienne:"Quotidienne",hebdomadaire:"Hebdomadaire",mensuelle:"Mensuelle",manuelle:"Manuelle"};
// A removed party's folder (removed:true): its files stay listed, downloadable and deletable, nothing else.
function backupFiles(s,removed=false){
 const get=(name,label)=>h("button",{class:"btn small",type:"button",onclick:e=>act(e.currentTarget,()=>download("/api/backups/download",{server:s.id,name}),r=>`${r.name} téléchargé (${bytes(r.size)}).`,null)},label);
 const row=f=>h("tr",{},h("td",{},BK_LABEL[f.freq]),h("td",{},fmt(f.t)),h("td",{},bytes(f.size)),h("td",{},h("div",{class:"btn-row"},get(f.name,"Télécharger"),
  h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer cette sauvegarde ?",`${f.name} sera effacée pour de bon.`,"Supprimer").then(ok=>ok&&act(b,()=>api("/api/backups/delete",{server:s.id,name:f.name}),"Sauvegarde supprimée."));}},"Supprimer"))));
 return h("div",{class:`card${removed?" removed":""}`},h("div",{class:"btn-row"},h("h2",{},removed?(s.name&&s.name!==s.id?s.name:`Partie retirée (${s.id})`):multi()?s.name:"Sauvegardes gardées"),
  removed&&s.name&&s.name!==s.id?h("span",{class:"badge"},`Partie retirée (${s.id})`):null,s.vapid?get("vapid.json","Télécharger vapid.json"):removed?null:h("span",{class:"muted small"},"Pas encore de copie de vapid.json")),
  s.files.length?h("div",{class:"table-wrap"},h("table",{},h("thead",{},h("tr",{},["Type","Date","Taille",""].map(t=>h("th",{},t)))),h("tbody",{},s.files.map(row)))):empty("Aucune sauvegarde pour l'instant."));
}
async function viewBackup(){
 const s=await api("/api/backups/list"),dl=(path,label)=>h("button",{class:"btn go",type:"button",onclick:e=>act(e.currentTarget,()=>download(path),r=>`${r.name} téléchargé (${bytes(r.size)}).`,null)},label);
 const hour=h("select",{id:"bk-hour"},Array.from({length:24},(_,i)=>h("option",{value:String(i),selected:i===s.config.hour},`${i} h`)));
 const rows=BK_FREQ.map(([k,label,when])=>{
  const on=h("input",{type:"checkbox",checked:s.config[k].on}),keep=h("input",{class:"bk-keep",type:"number",min:"1",max:"90",value:String(s.config[k].keep),"aria-label":`${label} : nombre gardé`});
  return {k,on,keep,el:h("div",{class:"btn-row"},h("label",{class:"check"},on,`${label} (${when})`),keep,h("span",{class:"muted small"},`gardées · prochaine : ${fmt(s.next[k])}`))};
 });
 const saveBtn=h("button",{class:"btn go",type:"button",onclick:e=>act(e.currentTarget,()=>api("/api/backups/save",{config:{hour:Number(hour.value),...Object.fromEntries(rows.map(r=>[r.k,{on:r.on.checked,keep:Number(r.keep.value)}]))}}),"Réglages enregistrés.")},"Enregistrer");
 const runBtn=h("button",{class:"btn",type:"button",disabled:s.running,onclick:e=>act(e.currentTarget,()=>api("/api/backups/run"),r=>{const ko=r.results.filter(x=>!x.ok).length;return ko?`${ko} partie${ko>1?"s":""} en échec : voir ci-dessous.`:"Sauvegarde faite.";})},"Sauvegarder maintenant");
 const live=s.servers.filter(x=>!x.removed),gone=s.servers.filter(x=>x.removed);
 const failed=live.filter(x=>x.failure).map(x=>h("div",{class:"card"},h("span",{class:"badge bad"},"Échec"),h("b",{},` ${multi()?`${x.name} : `:""}la dernière sauvegarde a échoué, le ${fmt(x.failure.t)}`),h("p",{class:"err"},x.failure.error)));
 const auto=h("div",{class:"card"},h("h2",{},"Sauvegardes automatiques"),
  h("p",{class:"muted small"},`Dans le volume politigo-admin-data (/data-admin/backups), pour toutes les parties, avec une copie de vapid.json. Une sauvegarde manquée pendant un arrêt est prise au redémarrage. Dernière réussite : ${fmt(s.lastSuccess)}. Place utilisée : ${bytes(s.total)}${s.disk?`, libre : ${bytes(s.disk.free)}`:""}.`),
  h("label",{for:"bk-hour"},"Heure (celle du conteneur)"),hour,rows.map(r=>r.el),h("div",{class:"btn-row"},saveBtn,runBtn),
  h("p",{class:"muted small"},"Les 5 dernières sauvegardes manuelles sont gardées. Les images du chat (chat-media) ne sont pas incluses, et ces copies restent sur la même machine que le jeu : télécharges-en une de temps en temps."));
 return [head("Sauvegarde",refreshBtn()),h("div",{class:"grid wide"},
  h("div",{class:"card"},h("h2",{},"Base de données"),h("p",{class:"muted small"},"Une copie cohérente de la base (VACUUM INTO), prise à chaud, téléchargée puis effacée de la machine de la partie. Elle contient les empreintes des mots de passe : garde-la en lieu sûr."),
   h("div",{class:"btn-row"},dl("backup","Télécharger la base (.db)"))),
  h("div",{class:"card"},h("h2",{},"Clé des notifications"),h("p",{class:"muted small"},"vapid.json : sans elle, une base restaurée perd tous les abonnements aux notifications. C'est une clé privée : ne la partage jamais."),
   h("div",{class:"btn-row"},dl("backup-vapid","Télécharger vapid.json")))),
  ...failed,auto,...live.map(x=>backupFiles(x)),
  gone.length?[h("h2",{class:"section"},"Parties retirées"),h("p",{class:"muted small"},"Leurs sauvegardes restent dans le volume de la console : téléchargeables, ou à supprimer quand tu n'en veux plus. Plus de sauvegarde automatique ni manuelle pour elles."),
   ...gone.map(x=>backupFiles(x,true))]:null];
}

// ===================================================================== Détection de bots
function bars(byHour){
 const max=Math.max(1,...byHour);
 // Heights through the CSSOM: allowed by the CSP, unlike style attributes in markup.
 const wrap=h("div",{class:"bars",role:"img","aria-label":`Actions par heure : ${byHour.map((n,i)=>`${i} h ${n}`).join(", ")}`},byHour.map((n,i)=>{const b=h("i",{class:i>=1&&i<6?"night":"",title:`${i} h : ${n}`});b.style.height=`${n/max*100}%`;return b;}));
 return [wrap,h("div",{class:"hours","aria-hidden":"true"},byHour.map((_,i)=>h("span",{},i%3===0?String(i):"")))];
}
// ===================================================================== mini-games, flags, suspect duels (anti-cheat data)
const GAME={debate:"Débat chrono",duel:"Duels",pong:"Pong",manif:"Cortège",cortege:"Cortège",epervier:"Épervier"};
const FLAG={plafond:"au plafond",trop_rapide:"trop rapide",zero_erreur:"zéro erreur",rythme_regulier:"rythme régulier"};
// Flags come as strings, as a {flag:count} tally (bot report), or per duel side ({side,name,flags}).
const flagText=x=>typeof x==="string"?tr(FLAG,x):x&&typeof x==="object"&&Array.isArray(x.flags)?`${x.name??x.side??"?"} : ${x.flags.map(f=>tr(FLAG,f)).join(", ")}`:String(x);
function flagBadges(f){
 const list=Array.isArray(f)?f.map(flagText):f&&typeof f==="object"?Object.entries(f).map(([k,n])=>`${tr(FLAG,k)} ×${n}`):[];
 return list.length?h("span",{class:"flags"},list.map(t=>h("span",{class:"badge bad"},t))):null;
}
const num=v=>typeof v==="number"&&Number.isFinite(v)?String(Math.round(v*10)/10):v==null?"—":String(v);
// A histogram of scores, if the server sends one (array of counts): same CSSOM bars as the hours chart.
function histo(counts,label){
 if(counts&&!Array.isArray(counts))counts=counts.counts;   // {max,counts}: ten bins from 0 to the game's maximum
 if(!Array.isArray(counts)||!counts.length||!counts.every(n=>typeof n==="number"))return null;
 const max=Math.max(1,...counts);
 return h("div",{class:"bars histo",role:"img","aria-label":`${label} : ${counts.join(", ")}`},counts.map((n,i)=>{const b=h("i",{title:`tranche ${i+1} : ${n}`});b.style.height=`${n/max*100}%`;return b;}));
}
function gamesTable(games){
 const rows=games&&typeof games==="object"?Object.entries(games).filter(([,g])=>g&&typeof g==="object"):[];
 if(!rows.length)return empty("Aucune partie enregistrée.");
 return h("div",{class:"table-wrap"},h("table",{},
  h("thead",{},h("tr",{},["Jeu","Parties","Moyenne","Max","Bonus max","Au plus tôt","Régularité (CV)","Scores"].map(t=>h("th",{},t)))),
  h("tbody",{},rows.map(([k,g])=>h("tr",{},h("td",{},tr(GAME,k),flagBadges(g.flags)),h("td",{},num(g.n)),h("td",{},num(g.avg)),h("td",{},num(g.max)),
   h("td",{class:g.capShare>=0.8?"hot":""},pct(g.capShare)),h("td",{class:g.fastShare>0.5?"hot":""},pct(g.fastShare)),h("td",{class:g.cv!=null&&g.cv<0.1&&g.n>=10?"hot":""},g.cv==null?"—":g.cv.toFixed(2)),
   h("td",{},histo(g.hist,`Répartition des scores, ${tr(GAME,k)}`)||"—"))))));
}
const annulBtn=d=>!can("duel-annul")?null:h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;
 confirmBox("Annuler ce duel et rendre les gains ?",`Duel #${d.id}${d.label?` (${d.label})`:""} : ses gains d'XP, de moral et d'énergie sont repris aux deux joueurs, le résultat est effacé.`,"Annuler et rendre les gains")
  .then(ok=>ok&&act(b,()=>call("duel-annul",{id:d.id}),"Duel annulé, gains rendus."));}},"Annuler ce duel (rendre les gains)");

// The actions logged, in plain words (anything else shows under its own name).
const KIND_LABEL={pongStart:"Pong lancé",pongEnd:"Pong terminé",missionStart:"Mission lancée",missionReport:"Rapport de mission",mailAnswer:"Courrier",draw:"Tirage",exchange:"Échange",wear:"Garde-robe",buy:"Achat",pet:"Caresse",light:"Lumière",
 "debate:next":"Débat","duel:challenge":"Duel lancé","duel:accept":"Duel accepté","duel:refuse":"Duel refusé"};
// Reaction delays measured by the server (median), and the families the signals come from.
const LAG_LABEL={mail:"lettre → réponse",mission:"fin de mission → rapport",visit:"ouverture → visite",draw:"minuit → tirage gratuit",duel:"défi → acceptation"};
const FAMILY_LABEL={rythme:"rythme",client:"client",jeu:"mini-jeux"};
const durS=s=>s<90?`${s} s`:s<5400?`${Math.round(s/60)} min`:`${Math.round(s/3600)} h`;
function botReport(r,withName=true){
 const lvl=r.alert?"bad":r.score>=30?"warn":"good",lags=Object.entries(r.lags||{}).filter(([,v])=>v);
 return h("div",{},
  h("div",{class:"btn-row"},withName?h("a",{href:`#joueurs/${r.id}`},h("b",{},r.name)):null,h("span",{class:`badge ${lvl}`},`score ${r.score??0}/100`),
   (r.families||[]).map(f=>h("span",{class:"badge"},FAMILY_LABEL[f]??f)),r.alert?h("span",{class:"badge bad"},"alerte"):null,h("span",{class:"muted small"},`${r.actions14d??0} actions sur 14 j`)),
  h("p",{class:"muted small"},"Indices, pas preuves : l'alerte demande au moins deux familles d'indices (rythme, client, mini-jeux)."),
  h("div",{class:"metrics"},[["sans écran ouvert",pct(r.noLiveShare)],["hors navigateur",pct(r.nonBrowserShare)],["la nuit (1 h-6 h)",pct(r.nightShare)],["écart médian",r.medianGapS==null?"—":`${Math.round(r.medianGapS)} s`],["régularité (CV)",r.gapCv==null?"—":r.gapCv.toFixed(2)]]
   .map(([k,v])=>h("span",{},`${k} : `,h("b",{},v)))),
  lags.length?h("div",{class:"metrics"},lags.map(([k,v])=>h("span",{},`${LAG_LABEL[k]??k} : `,h("b",{},durS(v.medS)),` (${v.n})`))):null,
  r.reasons?.length?h("ul",{class:"reasons"},r.reasons.map(x=>h("li",{},x))):null,
  r.kinds?.length?h("div",{class:"metrics"},r.kinds.map(k=>h("span",{},`${KIND_LABEL[k.kind]??k.kind} : `,h("b",{},String(k.n)),k.off?` (${k.off} hors navigateur)`:""))):null,
  Array.isArray(r.byHour)&&r.byHour.length===24?bars(r.byHour):null,
  flagBadges(r.gameFlags),
  r.games&&Object.keys(r.games).length?[h("h3",{class:"sub"},"Mini-jeux"),gamesTable(r.games)]:null);
}
async function viewBots(){
 const {items}=await call("bots");
 return [head("Détection de bots",refreshBtn()),
  h("p",{class:"muted small"},"Indices sur 14 jours, jamais une preuve, et rien n'est sanctionné tout seul. Trois familles : le rythme (délais de réaction mesurés par le jeu et comparés aux autres joueurs, visites, pauses), le client (hors navigateur, sans écran ouvert, nouveautés jamais ouvertes) et les mini-jeux (résultats invraisemblables, scores trop constants, parties au plus tôt permis). Une alerte demande au moins deux familles ; la nuit ne compte qu'avec un autre indice. Le détail des points est dans chaque rapport. Aucune adresse IP n'est conservée. Heures dans le fuseau du jeu."),
  items.length?h("div",{class:"grid wide"},items.map(r=>h("div",{class:"card"},botReport(r)))):h("div",{class:"card"},empty("Aucune activité enregistrée."))];
}

// ===================================================================== Journal d'admin
async function viewAudit(){
 const {items}=await call("audit",{limit:500});
 return [head("Journal d'admin",refreshBtn()),h("div",{class:"card"},items.length?h("div",{class:"table-wrap"},h("table",{},
  h("thead",{},h("tr",{},["Date","Par","Commande","Cible","Détail"].map(t=>h("th",{},t)))),
  h("tbody",{},items.map(i=>h("tr",{},h("td",{class:"nowrap"},fmt(i.t)),h("td",{},byWho(i.via,i.actor)),h("td",{},h("code",{},i.cmd)),h("td",{},i.target||"—"),h("td",{class:"wrap"},i.detail||"")))))):empty("Aucune action enregistrée."))];
}

// ===================================================================== Modérateurs (the owner only)
// A moderator is a player picked on one server; the owner checks their panels, actions and servers (a profile fills
// the boxes). Their password (openssl rand -base64 20) is shown once, to be copied and handed over privately.
function rightsForm(cat,init){
 const boxes=(list,on)=>list.map(([id,label])=>h("label",{class:"check"},h("input",{type:"checkbox",value:id,checked:on.includes(id)}),label));
 const pan=h("div",{class:"checks"},boxes(cat.panels,init.panels)),act_=h("div",{class:"checks"},boxes(cat.actions,init.actions));
 const srv=h("div",{class:"checks"},cat.servers.map(s=>h("label",{class:"check"},h("input",{type:"checkbox",value:s.id,checked:init.servers.includes(s.id)||s.id===init.home,disabled:s.id===init.home}),s.name)));
 const vals=box=>[...box.querySelectorAll("input:checked")].map(i=>i.value);
 const set=(box,on)=>{for(const i of box.querySelectorAll("input"))i.checked=on.includes(i.value);};
 const preset=h("select",{"aria-label":"Profil",onchange:()=>{const p=cat.presets.find(x=>x.id===preset.value);if(p){set(pan,p.panels);set(act_,p.actions);}}},
  h("option",{value:""},"Personnalisé"),cat.presets.map(p=>h("option",{value:p.id},p.label)));
 for(const box of [pan,act_])box.addEventListener("change",()=>{preset.value="";});
 const setHome=id=>{init.home=id;for(const i of srv.querySelectorAll("input")){i.disabled=i.value===id;if(i.disabled)i.checked=true;}};
 return {setHome,get:()=>({panels:vals(pan),actions:vals(act_),servers:vals(srv)}),
  node:h("div",{},lab("Profil",preset),preset,h("h3",{class:"sub"},"Panneaux visibles"),pan,h("h3",{class:"sub"},"Actions permises"),act_,
   cat.servers.length>1?[h("h3",{class:"sub"},"Parties accessibles"),srv]:null,
   h("p",{class:"muted small"},"Toujours réservés à l'organisateur : Réglages, Sauvegarde, régénération du code d'invitation et gestion des modérateurs. Un modérateur n'agit jamais sur son propre compte."))};
}
const modApi=(a,b={})=>api(`/api/mods${a?`/${a}`:""}`,b);
const showModPass=(r,title)=>secretBox(title,`Identifiant : ${r.name ?? r.mod?.name}. Il se connecte à cette console avec ce pseudo et ce mot de passe :`,r.password,false);
async function viewMods(){
 const cat=await modApi(""),srvName_=id=>cat.servers.find(s=>s.id===id)?.name||id;
 const label=(list,ids)=>ids.map(id=>list.find(x=>x[0]===id)?.[1]??id).join(", ")||"aucune";
 // Add: a server, then one of its players.
 const srvSel=h("select",{"aria-label":"Partie du joueur"},cat.servers.map(s=>h("option",{value:s.id,selected:s.id===cur},s.name)));
 const pSel=h("select",{"aria-label":"Joueur"});
 const form=rightsForm(cat,{panels:cat.presets[0].panels,actions:cat.presets[0].actions,servers:[],home:srvSel.value});
 const loadPlayers=async()=>{
  pSel.replaceChildren(h("option",{value:""},"Chargement…"));form.setHome(srvSel.value);
  try{const {players}=await srvCall(srvSel.value,"list");const taken=new Set(cat.mods.map(m=>m.name.toLowerCase()));
   pSel.replaceChildren(h("option",{value:""},"Choisis un joueur…"),...players.filter(p=>!taken.has(p.name.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(p=>h("option",{value:p.id},p.name)));}
  catch(e){pSel.replaceChildren(h("option",{value:""},"Partie injoignable"));fail(e);}
 };
 srvSel.addEventListener("change",loadPlayers);loadPlayers();
 const create=h("button",{class:"btn go",type:"button",onclick:e=>{
  if(!pSel.value)return toast("Choisis un joueur.",true);
  act(e.currentTarget,async()=>{const r=await modApi("save",{server:srvSel.value,player:+pSel.value,...form.get()});await showModPass(r,"Modérateur créé");},null);
 }},"Créer et générer le mot de passe");
 const card=m=>{
  const edit=rightsForm(cat,{...m}),box=h("div",{hidden:true},edit.node,h("div",{class:"btn-row"},
   h("button",{class:"btn go small",type:"button",onclick:e=>act(e.currentTarget,()=>modApi("save",{id:m.id,...edit.get()}),"Droits enregistrés : ses sessions sont fermées.")},"Enregistrer"),
   h("button",{class:"btn small",type:"button",onclick:()=>{box.hidden=true;}},"Fermer")));
  return h("div",{class:"card"},
   h("div",{class:"btn-row"},h("h2",{},m.name),h("span",{class:"muted small"},`joueur de ${srvName_(m.home)}`),
    m.account&&!m.account.ok?h("span",{class:"badge bad"},"compte de jeu introuvable"):null),
   // Their account as it stands now: gone, or renamed outside this console (no rights there until removed and added again).
   m.account&&!m.account.ok?h("p",{class:"err small"},m.account.name?`Ce compte s'appelle maintenant ${m.account.name} (renommé hors de cette console, ou base restaurée) : aucun droit sur ${srvName_(m.home)}. Retire ce modérateur puis ajoute-le de nouveau.`
    :`Son compte de joueur n'existe plus sur ${srvName_(m.home)} : aucun droit sur cette partie. Retire ce modérateur.`):null,
   h("dl",{class:"kv"},h("dt",{},"Panneaux"),h("dd",{},label(cat.panels,m.panels)),h("dt",{},"Actions"),h("dd",{},label(cat.actions,m.actions)),
    cat.servers.length>1?[h("dt",{},"Parties accessibles"),h("dd",{},m.servers.map(srvName_).join(", "))]:null,
    h("dt",{},"Créé le"),h("dd",{},fmt(m.created)),h("dt",{},"Dernière connexion"),h("dd",{},m.lastLogin?`${fmt(m.lastLogin)} (${ago(m.lastLogin)})`:"jamais")),
   h("div",{class:"btn-row"},
    h("button",{class:"btn small",type:"button",onclick:()=>{box.hidden=!box.hidden;}},"Modifier les droits"),
    h("button",{class:"btn small",type:"button",onclick:e=>{const b=e.currentTarget;dialog({title:`Nouveau mot de passe pour ${m.name} ?`,body:"L'ancien ne marchera plus et ses sessions sont fermées.",ok:"Générer",server:false})
     .then(ok=>ok&&act(b,async()=>showModPass(await modApi("password",{id:m.id}),"Nouveau mot de passe"),null,null));}},"Nouveau mot de passe"),
    h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;dialog({title:`Retirer ${m.name} des modérateurs ?`,body:"Son accès à la console est coupé tout de suite. Son compte de joueur ne change pas.",ok:"Retirer",danger:true,server:false})
     .then(ok=>ok&&act(b,()=>modApi("delete",{id:m.id}),"Modérateur retiré."));}},"Retirer")),
   box);
 };
 return [h("div",{class:"view-head"},h("h1",{},"Modérateurs"),refreshBtn()),
  h("div",{class:"card"},h("h2",{},"Ajouter un modérateur"),
   h("div",{class:"field-row"},cat.servers.length>1?h("div",{},lab("Partie",srvSel),srvSel):null,h("div",{},lab("Joueur",pSel),pSel)),
   form.node,h("div",{class:"btn-row"},create)),
  ...(cat.mods.length?cat.mods.map(card):[h("div",{class:"card"},empty("Aucun modérateur pour l'instant."))])];
}

// ===================================================================== Parties (the owner only)
// The games linked to this console: the main one by its local socket, the others over the network (TLS link, see
// admin/link.mjs). GET /api/parties lists them; POST adds one, renews its token or removes it. The three env lines
// (address, certificate fingerprint, token) come back once, are shown once and never kept by this page.
const LINK_ENV=["POLITIGO_ADMIN_URL","POLITIGO_ADMIN_TLS","POLITIGO_ADMIN_TOKEN"];
const fold=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const partyName=p=>p.announced||p.label||p.id;
const since=t=>{const s=Math.max(0,(Date.now()-t)/1000);return s<3600?`${Math.max(1,Math.floor(s/60))} min`:s<86400?`${Math.floor(s/3600)} h ${String(Math.floor(s%3600/60)).padStart(2,"0")}`:`${Math.floor(s/86400)} j`;};
async function partiesGet(){
 const r=await fetch("/api/parties",{method:"GET",credentials:"same-origin",headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1"}});
 if(r.status===401){showLogin();throw new Unauthorized("Session expirée.");}
 let j=null;try{j=await r.json();}catch{}
 if(!r.ok||!j?.ok)throw new Error(j?.error||`Erreur ${r.status}`);
 return j;
}
// parties.json unreadable (set aside by the console): add, renew and remove answer 409 « Liste des parties illisible : … »
// until it is repaired. The page learns it from that answer (or from a GET that says it: broken) and locks the three.
let partiesBroken=null;
const BROKEN_RE=/^Liste des parties illisible/;
const partiesPost=b=>api("/api/parties",b).catch(e=>{if(BROKEN_RE.test(e.message||"")){partiesBroken=e.message;if(route().id==="parties")render();}throw e;});
// Listening asked (POLITIGO_ADMIN_LINK=on) but not open (port taken, certificate unreadable…): listen.up false, listen.error.
const listenDown=L=>!!L.on&&L.up===false;
// A copy button that says "Copié !" for 2 s; without any clipboard (plain http), the text itself is selected instead.
function copyBtn(text,label="Copier",cls="btn small",sel=null){
 const b=h("button",{class:cls,type:"button",onclick:async e=>{
  e.stopPropagation();
  if(await copyText(text)){b.textContent="Copié !";clearTimeout(b.t);b.t=setTimeout(()=>{b.textContent=label;},2000);return;}
  if(sel){try{const r=document.createRange();r.selectNodeContents(sel);const s=getSelection();s.removeAllRanges();s.addRange(r);}catch{}}
  toast(sel?"Copie impossible ici : le texte est sélectionné, copie-le à la main.":"Copie impossible : sélectionne le texte.",true);}},label);
 return b;
}
const copyLine=(line,cls="")=>{const c=h("code",{},line);return h("div",{class:`envline${cls?` ${cls}`:""}`},c,copyBtn(line,"Copier","btn small",c));};
// The published address is not one another machine can use (0.0.0.0, ::, empty, 127.0.0.1 behind a proxy): the API
// sends url:null or needsHost:true, and the page asks for the host's IP, visibly, in the lines to paste too.
const HOST_HOLE="<IP de cette machine>";
const needsHost=L=>!!L.needsHost||!L.url||/</.test(L.url);
const linkUrl=L=>needsHost(L)?`${HOST_HOLE}:${L.port||8091}`:L.url;
const hostHelp=()=>h("p",{class:"hint warn"},h("b",{},"Adresse à compléter : "),`l'écoute est publiée sur une adresse que les autres machines ne peuvent pas joindre. Remplace ${HOST_HOLE} par l'IP de l'hôte de la console dans POLITIGO_ADMIN_URL, ou règle POLITIGO_ADMIN_LINK_BIND (facultative) sur l'IP interne de l'hôte dans la stack principale.`);
function linesDialog(name,env,L,renew=false){
 const hole=needsHost(L)||!env?.POLITIGO_ADMIN_URL||/</.test(env.POLITIGO_ADMIN_URL);
 const val=k=>k==="POLITIGO_ADMIN_URL"&&hole?(env?.[k]&&/</.test(env[k])?env[k]:linkUrl(L)):env?.[k]??"";
 const lines=LINK_ENV.map(k=>`${k}=${val(k)}`),block=lines.join("\n"),all=h("code",{class:"offscreen"},block);
 return dialog({title:renew?`Nouveau jeton · « ${name} »`:`Partie « ${name} » ajoutée`,ok:"C'est noté",cancel:null,server:false,wide:true,body:[
  renew?"L'ancien jeton ne marche plus. Remplace la ligne du jeton dans les variables de la stack de cette partie :":"Colle ces trois lignes dans les variables d'environnement de la stack de cette partie :",
  h("div",{class:"env"},lines.map((l,i)=>copyLine(l,i===0&&hole?"hole":renew&&i===2?"hl":""))),
  hole?hostHelp():null,
  renew?h("p",{class:"small accent"},"Seule la ligne POLITIGO_ADMIN_TOKEN change ; les deux autres sont rappelées pour mémoire."):null,
  h("div",{class:"btn-row tight"},copyBtn(block,"Copier les trois lignes","btn small go",all),all),
  h("ol",{class:"steps"},
   h("li",{},"Portainer → Stacks → la stack de la partie."),
   h("li",{},"Environment variables → Advanced mode, colle les lignes à la suite des autres."),
   h("li",{},"Update the stack (le workflow GitOps ne change pas)."),
  ),
  h("p",{class:"muted small"},"Affiché une seule fois : la console ne garde pas le jeton en clair. Il se lie à la première machine qui s'en sert ; une autre machine qui l'essaie ensuite est refusée."),
 ]});
}
// After a change: the top switcher and the parties page both follow.
const partiesChanged=async()=>{try{await loadServers();}catch{}if(route().id==="parties")await render();};
async function addParty(list,L){
 const inp=h("input",{type:"text",maxLength:40,placeholder:"par exemple : Soirée bureau",autocomplete:"off",spellcheck:false});
 const err=h("p",{class:"err small",role:"alert"});
 inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#dlg-ok").click();}});
 const r=await dialog({title:"Ajouter une partie",ok:"Créer le jeton",focus:inp,server:false,body:[
  lab("Nom indicatif",inp),inp,err,
  h("p",{class:"muted small"},"Il sert à reconnaître la partie ici en attendant sa première connexion ; ensuite, le nom affiché est celui de sa variable POLITIGO_SERVER_NAME."),
 ],value:async()=>{
  const v=inp.value.trim();err.textContent="";
  if(!v){err.textContent="Donne un nom à la partie.";inp.focus();return undefined;}
  if(list.some(p=>fold(p.label)===fold(v)||fold(p.announced)===fold(v))){err.textContent=`Une partie s'appelle déjà « ${v} ».`;inp.focus();return undefined;}
  try{return await partiesPost({action:"add",label:v});}
  catch(e){if(e instanceof Unauthorized)return null;err.textContent=e.message;inp.focus();return undefined;}}});
 if(!r)return;
 const name=r.party?.label||inp.value.trim();
 partiesChanged();
 await linesDialog(name,r.env,L);
 toast(`« ${name} » attend sa première connexion.`);
}
async function renewParty(p,L,btn){
 const name=partyName(p);
 const ok=await dialog({title:`Renouveler le jeton de « ${name} » ?`,ok:"Renouveler",danger:true,server:false,body:[
  "L'ancien jeton cesse de marcher tout de suite : la partie se déconnecte jusqu'à ce que la nouvelle ligne soit collée dans sa stack.",
  "Le nouveau jeton se liera à la première machine qui s'en servira.",
 ]});
 if(ok!==true)return;
 await act(btn,async()=>{const r=await partiesPost({action:"renew",id:p.id});partiesChanged();await linesDialog(name,r.env,L,true);},`Jeton de « ${name} » renouvelé.`,null);
}
async function removeParty(p,btn){
 const name=partyName(p);
 const ok=await dialog({title:`Retirer la partie « ${name} » ?`,ok:"Retirer",danger:true,server:false,body:[
  `La console oublie « ${name} » et son jeton cesse de marcher. La partie elle-même continue de tourner : retire aussi les trois variables de sa stack.`,
  "Les sauvegardes déjà faites restent dans le volume de la console (Sauvegarde). Les modérateurs qui y avaient accès le perdent.",
 ]});
 if(ok!==true)return;
 await act(btn,()=>partiesPost({action:"remove",id:p.id}),`« ${name} » retirée. Ses sauvegardes sont gardées.`,partiesChanged);
}
// The card's state: [dot, badge class, badge text, card class]. "closed" is the page's own: a network party while the
// console's listening is off cannot come back, whatever it was.
function partyState(p,L){
 if(p.local){const up=servers.find(s=>s.id===p.id)?.up!==false;return up?["up","good","En ligne",""]:["down","bad","Injoignable","down"];}
 if((!L.on||listenDown(L))&&p.state!=="pending")return ["down","bad","Écoute fermée","down"];
 switch(p.state){
  case "online":return ["up","good","En ligne",""];
  case "offline":return ["down","bad",p.lastSeen?`Injoignable depuis ${since(p.lastSeen)}`:"Injoignable","down"];
  case "pending":return renewing(p)?["down","warn","Injoignable, en attente du nouveau jeton","wait"]:["wait","warn","En attente de première connexion","wait"];
  case "refused-version":return ["down","bad","Version trop ancienne","down"];
  default:return ["wait","warn",String(p.state||"?"),"wait"];
 }
}
const kvl=pairs=>h("dl",{class:"kv"},pairs.filter(Boolean).flatMap(([k,v])=>[h("dt",{},k),h("dd",{},v==null||v===""?"—":v)]));
function backupText(b){
 if(!b)return "—";
 return b.ok?h("span",{},h("span",{class:"badge good"},"OK")," ",fmt(b.t))
  :h("span",{},h("span",{class:"badge bad"},"Échec")," ",b.error||"sauvegarde impossible",h("br",{}),h("span",{class:"muted small"},`le ${fmt(b.t)}`));
}
function waitHelp(url,open=false){
 return h("details",{class:"help",open},h("summary",{},"Rien n'arrive ?"),h("ul",{},
  h("li",{},"Les trois lignes sont bien dans les variables de la stack de la partie, puis « Update the stack »."),
  h("li",{},h("b",{},"Empreinte TLS : "),"si les logs du conteneur api de la partie disent « empreinte du certificat différente », recopie POLITIGO_ADMIN_TLS depuis le bloc « Écoute des parties » ci-dessus. La console, elle, ne voit rien arriver."),
  h("li",{},h("b",{},"Connexion refusée ou délai dépassé : "),`la machine de la partie ne joint pas ${url}. Vérifie l'adresse, le port publié du conteneur admin et le pare-feu.`),
  h("li",{},h("b",{},"Jeton refusé : "),"le jeton a été renouvelé ou la partie retirée. Renouvelle-le ici."),
  h("li",{},h("b",{},"Partie antérieure à 1.7.3 : "),"elle ignore ces variables. Mets son image à jour."),
 ));
}
function partyCard(p,L,locals,focus){
 const [dot,bcls,blabel,ccls]=partyState(p,L),url=linkUrl(L),name=partyName(p);
 const closed=!p.local&&(!L.on||listenDown(L))&&p.state!=="pending";
 const refused=p.refused&&p.state!=="refused-version"&&p.state!=="pending"?p.refused:null;
 const badges=h("div",{class:"badges"},
  h("span",{class:"badge"},p.local?"Socket local":"Réseau · TLS"),
  h("span",{class:`badge ${bcls}`},blabel),
  refused?h("span",{class:"badge bad"},"Jeton refusé à une autre machine"):null);
 const title=h("h2",{},h("i",{class:`dot ${dot}`}),h("span",{class:"pname"},name));
 const alias=!p.local&&p.announced&&p.label&&fold(p.announced)!==fold(p.label)?h("p",{class:"muted small alias"},`ajoutée sous « ${p.label} », annoncée comme « ${p.announced} » (POLITIGO_SERVER_NAME)`):null;
 let body;
 // "Dernier contact": the time of the last frame received from the party (pings included), so a few seconds ago while it
 // is online, and the moment the link went quiet once it is not.
 const last=p.local?"en continu (socket)":p.lastSeen?`${fmt(p.lastSeen)} (${ago(p.lastSeen)})`:null;
 if(renewing(p)){
  body=[kvl([["Version",ver(p.version)],["Adresse vue",p.addr?`${p.addr} (avant le nouveau jeton)`:null],["Dernier contact",last],["Dernière sauvegarde",backupText(p.backup)]]),
   h("p",{class:"hint warn"},h("b",{},"Jeton renouvelé : "),`en attente du nouveau jeton. La partie reste dans le sélecteur du haut, injoignable, avec ses droits de modérateurs et ses sauvegardes, jusqu'à ce qu'elle se reconnecte à ${url} avec la nouvelle ligne POLITIGO_ADMIN_TOKEN.`),waitHelp(url,focus)];
 }else if(p.state==="pending"){
  body=[kvl([p.created?["Jeton créé",`${fmt(p.created)} (${ago(p.created)})`]:null,["Adresse vue","pas encore de connexion"]]),
   h("p",{class:"hint warn"},`Attend que la partie se connecte à ${url} avec son jeton. Rien n'est encore arrivé.`),waitHelp(url,focus)];
 }else{
  body=[kvl([
   ["Version",ver(p.version)],
   ["Adresse vue",p.addr],
   [p.local?"Liaison":"Dernier contact",last],
   ["Joueurs",p.players!=null?String(p.players):null],
   ["Dernière sauvegarde",backupText(p.backup)],
  ])];
  if(closed)body.push(h("p",{class:"hint bad"},h("b",{},"Écoute fermée : "),"la console n'accepte plus les parties réseau, celle-ci ne peut pas se connecter. Voir en haut de page pour rouvrir l'écoute."));
  else if(p.state==="offline")body.push(h("p",{class:"hint bad"},h("b",{},"Injoignable : "),`la liaison est coupée${p.lastSeen?` (dernier contact le ${fmt(p.lastSeen)}, ${ago(p.lastSeen)})`:""}. La partie est arrêtée ou ne joint plus ${url} (machine éteinte, réseau, pare-feu). Elle se reconnecte seule quand elle revient ; ses pages et la sauvegarde nocturne l'attendent.`));
  else if(p.state==="refused-version"){const t=p.refused?.t||p.lastSeen;
   body.push(h("p",{class:"hint bad"},h("b",{},"Version trop ancienne : "),`la partie s'est présentée${t?` ${ago(t)}`:""}${p.version?` en ${ver(p.version)}`:""} ; la liaison demande 1.7.3 ou plus. Connexion refusée. Mets à jour son image (Portainer → Update the stack avec « Re-pull image »), elle se reconnectera seule.`));}
  if(p.local&&servers.find(s=>s.id===p.id)?.up===false)body.push(h("p",{class:"hint bad"},h("b",{},"Injoignable : "),"le socket local ne répond pas. Le conteneur api de cette partie est-il démarré ?"));
  if(refused)body.push(h("p",{class:"hint bad"},h("b",{},"Jeton refusé à une autre machine : "),`${refused.addr||"Une autre machine"} a essayé ce jeton ${ago(refused.t)}. Refusé : la partie liée${p.addr?` (${p.addr})`:""} reste ${p.state==="online"&&!closed?"connectée":"la seule autorisée"}. Si c'est une copie de la stack, donne-lui son propre jeton (« Ajouter une partie ») ; si le jeton a fuité, renouvelle-le.`));
 }
 const acts=p.local?h("p",{class:"muted small acts"},locals>1?"Partie branchée par un socket local (POLITIGO_ADMIN_SERVERS) : non retirable ici.":"Partie principale, branchée par le socket local : non retirable.")
  :h("div",{class:"btn-row"},h("button",{class:"btn small",type:"button",disabled:!!partiesBroken,onclick:e=>renewParty(p,L,e.currentTarget)},"Renouveler le jeton"),h("button",{class:"btn small danger",type:"button",disabled:!!partiesBroken,onclick:e=>removeParty(p,e.currentTarget)},"Retirer la partie"));
 return h("div",{class:`card party${ccls?` ${ccls}`:""}${focus?" focus":""}`,id:`party-${p.id}`},title,alias,badges,body,acts);
}
function listenCard(L,n){
 const url=linkUrl(L),fp=L.fingerprint||"",cu=h("code",{},url),cf=h("code",{},fp||"—");
 return h("div",{class:"card"},h("h2",{},"Écoute des parties"),
  h("div",{class:"badges"},h("span",{class:"badge good"},"Ouverte"),h("span",{class:"badge"},`${n} partie${n>1?"s":""} réseau`)),
  kvl([["Adresse à joindre",h("span",{class:"fp"},cu,copyBtn(url,"Copier","btn small",cu))],
   ["Empreinte du certificat",h("span",{class:"fp"},cf,fp?copyBtn(fp,"Copier","btn small",cf):null)],
   ["Certificat",L.certCreated?`généré par la console le ${fmt(L.certCreated)}, gardé dans son volume`:"gardé dans le volume de la console"]]),
  needsHost(L)?hostHelp():null,
  h("p",{class:"muted small top-gap"},"Écoute sur POLITIGO_ADMIN_BIND, port POLITIGO_ADMIN_LINK_PORT. Liaison chiffrée (TLS) : chaque partie vérifie l'empreinte avant d'envoyer son jeton."));
}
// POLITIGO_ADMIN_LINK=on but the listener did not open: the reason (listen.error), and no party can be added.
function downCard(L){
 return h("div",{class:"card notice bad",role:"alert"},h("h2",{},"Écoute demandée mais fermée"),
  h("div",{class:"badges"},h("span",{class:"badge bad"},"Fermée"),h("span",{class:"badge"},`port ${L.port||8091}`)),
  h("p",{class:"err wrap"},L.error||"L'écoute n'a pas pu s'ouvrir."),
  h("p",{class:"muted small"},"POLITIGO_ADMIN_LINK=on est bien là, mais la console n'écoute pas : aucune partie réseau ne peut se connecter et « Ajouter une partie » est bloqué. Regarde les logs du conteneur admin (port déjà pris, certificat illisible dans son volume…), corrige, puis redémarre-le."),
  L.fingerprint?kvl([["Empreinte du certificat",h("span",{class:"fp"},h("code",{},L.fingerprint))]]):null);
}
function closedCard(L){
 const lines=["COMPOSE_PROFILES=admin","POLITIGO_ADMIN_LINK=on",`POLITIGO_ADMIN_BIND=${L.bind||"<IP de cette machine>"}`,`POLITIGO_ADMIN_LINK_PORT=${L.port||8091}`];
 return h("div",{class:"card notice"},h("h2",{},"Écoute des parties fermée"),
  h("p",{class:"small"},"La console ne gère pour l'instant que la partie principale, par le socket local. Pour lui rattacher d'autres parties (autres stacks, autres machines), ouvre l'écoute dans la stack principale :"),
  h("div",{class:"env"},lines.map((l,i)=>copyLine(l,i===1?"hl":""))),
  h("ol",{class:"steps"},
   h("li",{},"COMPOSE_PROFILES=admin est déjà là puisque la console tourne."),
   h("li",{},`Ajoute POLITIGO_ADMIN_LINK=on. POLITIGO_ADMIN_BIND sert aussi à la console : garde ta valeur. Le port ${L.port||8091} est ${L.port&&L.port!==8091?"celui de POLITIGO_ADMIN_LINK_PORT":"celui par défaut"}.`),
   h("li",{},"Update the stack. Le certificat est généré au démarrage et le bouton « Ajouter une partie » apparaît ici."),
  ));
}
// Between two refreshes: a first connection and a lost party are told by a toast (the page open).
let partiesSeen=null;
function partiesNews(list){
 const before=partiesSeen;partiesSeen=new Map(list.map(p=>[p.id,p.state]));
 if(!before)return;
 for(const p of list){
  const was=before.get(p.id);if(!was||was===p.state||p.local)continue;
  if(p.state==="online"&&was!=="offline")toast(`« ${partyName(p)} » est connectée (${[ver(p.version),p.addr].filter(Boolean).join(", ")||"liaison établie"}).`);
  else if(p.state==="offline"&&was==="online")toast(`« ${partyName(p)} » est injoignable.`,true);
 }
}
async function viewParties(arg){
 const r=await partiesGet(),L=r.listen||{on:false},list=r.parties||[];
 if(typeof r.broken==="string"&&r.broken)partiesBroken=r.broken;else if(r.broken===false)partiesBroken=null;
 partiesNews(list);noteParties(list);
 const canAdd=!listenDown(L)&&!partiesBroken;
 refreshT=setInterval(()=>{if(!document.hidden&&route().id==="parties"&&!$("#dlg").open)render();},15000);
 const n=list.filter(p=>!p.local).length,locals=list.filter(p=>p.local).length;
 if(arg)setTimeout(()=>document.getElementById(`party-${arg}`)?.scrollIntoView({block:"start",behavior:"smooth"}),0);
 return [
  h("div",{class:"view-head"},h("h1",{},"Parties"),h("div",{class:"btn-row tight"},h("span",{class:"muted small"},"actualisée toutes les 15 s"),refreshBtn(),
   L.on?h("button",{class:"btn go",type:"button",disabled:!canAdd,title:canAdd?null:partiesBroken?"Liste des parties illisible":"Écoute demandée mais fermée",onclick:()=>addParty(list,L)},"Ajouter une partie"):null)),
  partiesBroken?h("div",{class:"card notice bad",role:"alert"},h("h2",{},"Liste des parties illisible"),h("p",{class:"err wrap"},partiesBroken),
   h("p",{class:"muted small"},"La console a mis le fichier parties.json de côté (parties.json.corrupt-<date>, dans son volume) : ajouter, renouveler et retirer sont bloqués tant qu'il n'est pas réparé ou retiré, puis la console redémarrée.")):null,
  !L.on?closedCard(L):listenDown(L)?downCard(L):listenCard(L,n),
  list.length?h("div",{class:"grid wide parties"},list.map(p=>partyCard(p,L,locals,p.id===arg))):h("div",{class:"card"},empty("Aucune partie pour l'instant.")),
  h("p",{class:"muted small"},"Les parties en attente ou refusées n'apparaissent pas dans le sélecteur du haut ni dans les droits des modérateurs. Une partie dont le jeton vient d'être renouvelé y reste, injoignable, jusqu'à son retour. Cette page est réservée à l'organisateur."),
 ];
}

// ===================================================================== start
(async()=>{
 try{const r=await fetch("/api/session",{credentials:"same-origin"}).then(r=>r.json());if(r.authed)await showApp();else showLogin();}
 catch{showLogin();}
})();
