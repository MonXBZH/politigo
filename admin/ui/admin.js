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
 return e;
}
const CAMP={left:"Gauche",right:"Droite"};
const fmt=t=>t?new Date(t).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"}):"—";
const fmtDay=t=>t?new Date(t).toLocaleDateString("fr-FR"):"—";
function ago(t){
 if(!t)return "jamais";const s=Math.max(0,(Date.now()-t)/1000);
 return s<60?"à l'instant":s<3600?`il y a ${Math.floor(s/60)} min`:s<86400?`il y a ${Math.floor(s/3600)} h`:`il y a ${Math.floor(s/86400)} j`;
}
const pct=x=>x==null?"—":`${Math.round(x*100)} %`;
const bytes=n=>n==null?"—":n<1024?`${n} o`:n<1048576?`${(n/1024).toFixed(1)} Ko`:`${(n/1048576).toFixed(1)} Mo`;
const dur=s=>{if(s==null)return "—";s=Math.floor(s);const d=Math.floor(s/86400),hh=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d} j ${hh} h`:hh?`${hh} h ${m} min`:`${m} min`;};
const campBadge=c=>c?h("span",{class:`badge ${c}`},CAMP[c]||c):null;
const who=a=>typeof a==="string"?a:a?.name??"?";
// Raw values from the API, in French.
const DUEL_STATUS={c_play:"le lanceur joue",pending:"en attente du défié",d_play:"le défié joue",done:"terminé",refused:"refusé",expired:"expiré",void:"annulé",annulled:"annulé, gains rendus"};
const DUEL_RES={win:"victoire",loss:"défaite",tie:"égalité",chicken:"refusé ou sans réponse"};
const EVENT={halloween:"Halloween"};
const VIA={cli:"console",web:"web",schedule:"planif."};
const FEED_KIND={announce:"annonce",duel:"duel"};
// The two chat rooms, each switched on by the admin (closed by default).
const chatState=r=>!r?"—":r.global&&r.camp?"Tous les salons":r.global?"Pour tous":r.camp?"De camp":"Fermé";
const tr=(map,v)=>v==null?"—":map[v]??String(v);

// ===================================================================== API
class Unauthorized extends Error{}
async function api(path,body={}){
 const r=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1"},body:JSON.stringify(body)});
 if(r.status===401&&path!=="/api/login"){showLogin();throw new Unauthorized("Session expirée.");}
 let j=null;try{j=await r.json();}catch{}
 if(!r.ok||!j?.ok)throw new Error(j?.error||`Erreur ${r.status}`);
 return j;
}
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
async function loadServers(full=false){
 const r=await api("/api/servers",{full});
 servers=r.servers;
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
 const sel=h("select",{"aria-label":"Serveur de jeu",onchange:e=>pickServer(e.target.value)},servers.map(x=>h("option",{value:x.id,selected:x.id===cur},`${x.name}${x.up?"":" (injoignable)"}`)));
 box.replaceChildren(dot(s),sel);
}
setInterval(()=>{if(!document.hidden&&!$("#app").hidden&&route().id!=="apercu")loadServers().catch(()=>{});},15000);
// A file answer (backup): fetched as a blob, then handed to the browser as a download.
async function download(path,body={}){
 const r=await fetch(sp(path),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-PolitiGo-Admin":"1"},body:JSON.stringify(body)});
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
// Every question names the game server it acts on ("Suspendre le compte sur « Prod » ?"), so nothing hits the wrong game.
function dialog({title,body=[],ok="Confirmer",cancel="Annuler",danger=false,value=()=>true,focus}){
 const d=$("#dlg"),okB=$("#dlg-ok"),noB=$("#dlg-cancel"),name=srvName();
 $("#dlg-title").textContent=/ \?$/.test(title)?title.replace(/ \?$/,` sur « ${name} » ?`):`${title} · « ${name} »`;
 $("#dlg-body").replaceChildren(h("span",{class:"srv-tag dlg-srv"},`Serveur : ${name}`),...[body].flat().map(b=>typeof b==="string"?h("p",{},b):b));
 okB.textContent=ok;okB.className=`btn ${danger?"danger":"go"}`;noB.textContent=cancel;noB.hidden=cancel===null;
 return new Promise(res=>{
  const done=v=>{okB.onclick=noB.onclick=d.oncancel=null;d.close();res(v);};
  okB.onclick=()=>done(value());noB.onclick=()=>done(null);d.oncancel=e=>{e.preventDefault();done(null);};
  d.showModal();(focus||(danger?noB:okB)).focus();
 });
}
const confirmBox=(title,text,ok="Confirmer",danger=true)=>dialog({title,body:text,ok,danger}).then(v=>v===true);
async function promptBox(title,label,init=""){
 const inp=h("input",{type:"text",value:init,maxLength:200});
 inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("#dlg-ok").click();}});
 const v=await dialog({title,body:[h("label",{},label),inp],ok:"Valider",value:()=>inp.value.trim(),focus:inp});
 return v||null;
}
async function copy(text,inp){if(await copyText(text))toast("Copié !");else{inp?.select();toast("Copie impossible : sélectionne le texte.",true);}}
function secretBox(title,intro,secret){
 const inp=h("input",{type:"text",value:secret,readOnly:true,spellcheck:false,"aria-label":"Secret"});
 inp.addEventListener("focus",()=>inp.select());
 return dialog({title,body:[intro,h("div",{class:"secret"},inp,h("button",{class:"btn small",type:"button",onclick:()=>copy(secret,inp)},"Copier")),
  h("p",{class:"muted small"},"Il n'est affiché qu'une fois : transmets-le par un canal privé.")],ok:"J'ai noté",cancel:null,focus:inp});
}
// Runs an action button: disabled while it runs, toast on the outcome, then refresh.
async function act(btn,fn,okMsg,after=render){
 if(btn)btn.disabled=true;
 try{const r=await fn();if(r!==false){if(okMsg)toast(typeof okMsg==="function"?okMsg(r):okMsg);await after?.();}}
 catch(e){fail(e);}
 finally{if(btn?.isConnected)btn.disabled=false;}
}

// ===================================================================== login
function showLogin(){stopRefresh();$("#app").hidden=true;$("#login").hidden=false;$("#login-pw").value="";setTimeout(()=>$("#login-pw").focus(),0);}
async function showApp(){
 $("#login").hidden=true;$("#app").hidden=false;
 try{await loadServers();}catch(e){fail(e);}
 if(!location.hash)location.hash=multi()?"#apercu":"#tableau";
 buildNav();await render();
}
$("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();const btn=e.submitter||$("#login-form .btn"),err=$("#login-err");err.textContent="";btn.disabled=true;
 try{await api("/api/login",{password:$("#login-pw").value});await showApp();}
 catch(x){err.textContent=x.message;$("#login-pw").select();}
 finally{btn.disabled=false;}
});
$("#logout").addEventListener("click",async()=>{try{await api("/api/logout");}catch{}showLogin();});

// ===================================================================== navigation
const SECTIONS=[
 ["apercu","Vue d'ensemble",viewOverview],["tableau","Tableau de bord",viewDashboard],["joueurs","Joueurs",viewPlayers],["annonces","Annonces",viewAnnounces],
 ["chat","Chat",viewChat],["fil","Fil",viewFeed],["duels","Duels",viewDuels],["reglages","Réglages",viewSettings],
 ["sauvegarde","Sauvegarde",viewBackup],["bots","Détection de bots",viewBots],["journal","Journal d'admin",viewAudit],
];
// With a single server the overview is skipped altogether.
const sections=()=>SECTIONS.filter(x=>x[0]!=="apercu"||multi());
const route=()=>{const [s,...rest]=location.hash.slice(1).split("/");return {id:sections().some(x=>x[0]===s)?s:multi()?"apercu":"tableau",arg:rest.join("/")};};
function buildNav(){
 const {id}=route();
 $("#nav").replaceChildren(...sections().map(([k,label])=>h("a",{href:`#${k}`,"aria-current":k===id?"page":null},label)));
}
let refreshT=null,renderSeq=0;
const stopRefresh=()=>{clearInterval(refreshT);refreshT=null;};
async function render(){
 const {id,arg}=route(),seq=++renderSeq,view=$("#view");stopRefresh();
 for(const a of $("#nav").children){if(a.getAttribute("href")===`#${id}`)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");}
 const fn=SECTIONS.find(x=>x[0]===id)[2];
 try{
  const nodes=await fn(arg);
  if(seq!==renderSeq)return;   // a newer navigation won the race
  view.replaceChildren(...[nodes].flat());
 }catch(e){
  if(e instanceof Unauthorized||seq!==renderSeq)return;
  view.replaceChildren(h("div",{class:"card"},h("h2",{},"Impossible de charger"),h("p",{class:"err"},e.message),h("button",{class:"btn",type:"button",onclick:render},"Réessayer")));
 }
}
window.addEventListener("hashchange",()=>{render().then(()=>$("#view").focus({preventScroll:true}));});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&route().id==="tableau"&&!$("#app").hidden)render();});
// The current game server's name heads every page.
const srvTag=()=>h("span",{class:"srv-tag",title:"Serveur de jeu"},h("i",{class:`dot ${curSrv()?.up?"up":"down"}`}),srvName());
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
// Clipboard API (HTTPS or localhost), else the old hidden-textarea route.
async function copyText(text){
 try{await navigator.clipboard.writeText(text);return true;}
 catch{const t=h("textarea",{value:text,readOnly:true,class:"offscreen"});document.body.append(t);t.select();let ok=false;try{ok=document.execCommand("copy");}catch{}t.remove();return ok;}
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
   s.up?inviteWidget(s.invite):null,
   s.up?kv(["Version",s.version],["Joueurs",s.players],["Connectés",s.online],["Actifs 24 h",s.active24h],["Chat",chatState(s.chatRooms)],["Signalements chat",s.chatReports],
    ["Prochaine annonce",s.nextAnnounce?`${fmt(s.nextAnnounce.t)} : ${s.nextAnnounce.text}`:"aucune"])
   :h("p",{class:"err"},`Injoignable : ${s.error||"pas de réponse"}`)))),
  h("div",{class:"card"},h("h2",{},"Ajouter un serveur"),h("p",{class:"muted small"},
   "La liste vient de la configuration du conteneur admin, pas de cette page : monte le volume du socket d'administration de l'autre pile "+
   "(volume externe, par exemple politigo-test_politigo-admin-sock sur /run/politigo-test), puis ajoute-le à POLITIGO_ADMIN_SERVERS "+
   "(« Prod=/run/politigo/admin.sock;Test=/run/politigo-test/admin.sock ») et redémarre le conteneur admin.")),
 ];
}

// ===================================================================== Tableau de bord
async function viewDashboard(){
 const [s,l,inv]=await Promise.all([call("stats"),call("list"),call("invite-get").catch(()=>null)]);
 const online=l.players.filter(p=>p.online);
 const stat=(v,k)=>h("div",{class:"card stat"},h("div",{class:"v"},v??"—"),h("div",{class:"k"},k));
 const ch=s.chat||{};
 // Auto-refresh every 15 s while this page stays open and visible.
 refreshT=setInterval(()=>{if(!document.hidden&&route().id==="tableau")render();},15000);
 return [
  head("Tableau de bord",h("span",{class:"muted small"},"actualisé toutes les 15 s"),refreshBtn()),
  h("div",{class:"card"},inviteWidget(inv&&{code:inv.invite||null,open:!!inv.open&&!!inv.invite})),
  h("div",{class:"grid"},
   stat(s.players,"joueurs inscrits"),stat(s.online,"connectés maintenant"),stat(s.active24h,"actifs sur 24 h"),stat(s.active7d,"actifs sur 7 jours"),
   stat(s.suspended,"suspendus"),stat(s.pushSubs,"abonnements notifications"),stat(s.registrations?(s.registrations.open?"ouvertes":"fermées"):"—","inscriptions"),stat(chatState(s.chatRooms),"chat"),
   stat(s.event?(s.event.current?tr(EVENT,s.event.current):"aucun"):"—",`événement (mode ${{auto:"automatique",off:"désactivé",halloween:"forcé"}[s.event?.mode]??"?"})`)),
  h("div",{class:"grid wide"},
   h("div",{class:"card"},h("h2",{},"Serveur"),h("dl",{class:"kv"},
    h("dt",{},"Version"),h("dd",{},`${s.version??"?"}${s.release&&s.release!==s.version?` (${s.release})`:""}`),
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
function playerRow(p){
 return h("li",{},h("button",{class:"row",type:"button",onclick:()=>{location.hash=`#joueurs/${p.id}`;}},
  dots(p),h("span",{class:"grow"},h("b",{},p.name),h("div",{class:"meta"},`niv. ${p.lvl??"?"} · vu ${ago(p.updated)} · inscrit le ${fmtDay(p.created)}`)),campBadge(p.camp)));
}
let playerFilter="";
async function viewPlayers(arg){
 if(arg)return viewPlayer(+arg);
 const {players}=await call("list");
 const list=h("ul",{class:"list"}),count=h("span",{class:"muted small"});
 const fold=s=>s.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase();
 const draw=()=>{
  const q=fold(playerFilter.trim()),rows=players.filter(p=>!q||fold(p.name).includes(q)).sort((a,b)=>(b.online-a.online)||(b.updated-a.updated));
  list.replaceChildren(...(rows.length?rows.map(playerRow):[empty("Aucun joueur.")]));count.textContent=`${rows.length} / ${players.length}`;
 };
 const search=h("input",{type:"search",placeholder:"Rechercher un pseudo…",value:playerFilter,"aria-label":"Rechercher un pseudo",oninput:e=>{playerFilter=e.target.value;draw();}});
 draw();
 return [head("Joueurs",count,refreshBtn()),h("div",{class:"card"},search,
  h("div",{class:"legend"},h("span",{},h("i",{class:"dot on"}),"en ligne"),h("span",{},h("i",{class:"dot sus"}),"suspendu"),h("span",{},h("i",{class:"dot mute"}),"chat coupé")),
  list)];
}
const GAUGES=[["form","Forme"],["sat","Satiété"],["moral","Moral"],["energy","Énergie"],["hyg","Hygiène"]];
async function viewPlayer(id){
 const {player:p}=await call("player",{id});
 const by={id:p.id},muted=p.chatMutedUntil>Date.now();
 const muteSel=h("select",{"aria-label":"Durée"},[[1,"1 heure"],[24,"24 heures"],[72,"3 jours"],[168,"7 jours"],[720,"30 jours"]].map(([v,t])=>h("option",{value:v},t)));
 const btn=(label,cls,fn)=>h("button",{class:`btn small ${cls||""}`,type:"button",onclick:e=>fn(e.currentTarget)},label);
 const actions=h("div",{class:"btn-row"},
  btn("Déconnecter partout","",b=>confirmBox("Déconnecter partout ?",`${p.name} sera déconnecté de tous ses appareils.`,"Déconnecter").then(ok=>ok&&act(b,()=>call("signout",by),"Sessions fermées."))),
  btn("Réinitialiser le mot de passe","danger",b=>confirmBox("Réinitialiser le mot de passe ?",`Un nouveau mot de passe est généré pour ${p.name} ; ses sessions sont fermées partout.`,"Réinitialiser").then(ok=>ok&&act(b,
   async()=>{const r=await api(sp("reset-password"),{name:p.name});await secretBox("Nouveau mot de passe",`Mot de passe de ${r.name} :`,r.password);},null))),
  btn("Débloquer la connexion","",b=>act(b,()=>call("unlock",{name:p.name}),r=>`Essais de connexion remis à zéro (${r.cleared??0}).`)),
  btn("Renommer","",async b=>{const n=await promptBox("Renommer",`Nouveau pseudo pour ${p.name}`,p.name);if(n&&n!==p.name)act(b,()=>call("rename",{...by,newName:n}),r=>`Renommé en ${r.name}.`);}),
  p.suspended?btn("Réactiver le compte","",b=>confirmBox("Réactiver ?",`${p.name} pourra se reconnecter ; son compagnon reprend sans rattrapage du temps passé.`,"Réactiver",false).then(ok=>ok&&act(b,()=>call("suspend",{...by,on:false}),"Compte réactivé.")))
   :btn("Suspendre","danger",b=>confirmBox("Suspendre le compte ?",`${p.name} est déconnecté, ne peut plus se connecter, disparaît du classement ; son compagnon est figé et ses duels ouverts sont annulés.`,"Suspendre").then(ok=>ok&&act(b,()=>call("suspend",{...by,on:true}),"Compte suspendu."))));
 const chat=h("div",{class:"btn-row"},muted?h("span",{class:"badge warn"},`chat coupé jusqu'au ${fmt(p.chatMutedUntil)}`):h("span",{class:"muted small"},"Chat autorisé"),muteSel,
  btn("Couper le chat","danger",b=>{const hrs=+muteSel.value;confirmBox("Couper le chat ?",`${p.name} ne pourra plus écrire dans le chat pendant ${muteSel.selectedOptions[0].textContent}.`,"Couper").then(ok=>ok&&act(b,()=>call("chat-mute",{...by,hours:hrs}),"Chat coupé."));}),
  muted?btn("Rétablir le chat","",b=>act(b,()=>call("chat-mute",{...by,hours:0}),"Chat rétabli.")):null);
 const kv=(...pairs)=>h("dl",{class:"kv"},pairs.filter(Boolean).flatMap(([k,v])=>[h("dt",{},k),h("dd",{},v??"—")]));
 return [
  h("div",{class:"view-head"},h("div",{class:"btn-row"},h("a",{class:"btn small",href:"#joueurs"},"← Joueurs"),h("h1",{},p.name),srvTag(),campBadge(p.camp),dots(p),p.suspended?h("span",{class:"badge bad"},"suspendu"):null),refreshBtn()),
  h("div",{class:"card"},h("h2",{},"Actions"),actions,h("h2",{class:"sub"},"Chat"),chat),
  h("div",{class:"grid wide"},
   h("div",{class:"card"},h("h2",{},"Compte"),kv(["Identifiant",String(p.id)],["Camp",CAMP[p.camp]||p.camp],["Candidat",p.candidate],["Inscrit le",fmt(p.created)],["Vu",`${fmt(p.updated)} (${ago(p.updated)})`],
    ["En ligne",p.online?"oui":"non"],["Sessions",String(p.sessions??"—")],["Abonnements notif.",String(p.pushSubs??"—")],["Suspendu",p.suspended?"oui":"non"])),
   h("div",{class:"card"},h("h2",{},"Partie"),kv(["Niveau",String(p.lvl??"—")],["XP",String(p.xp??"—")],["Score",String(p.score??"—")],["Fonds (FM)",String(p.fm??"—")],["Morts",String(p.deaths??"—")],
    ...GAUGES.map(([k,l])=>[l,p[k]==null?"—":String(Math.round(p[k]))])))),
  h("div",{class:"card"},h("h2",{},"Derniers duels"),p.duels?.length?h("div",{class:"table-wrap"},h("table",{},
   h("thead",{},h("tr",{},["Date","Contre","Rôle","Statut","Résultat","Signaux",""].map(t=>h("th",{},t)))),
   h("tbody",{},p.duels.map(d=>h("tr",{},h("td",{class:"nowrap"},fmt(d.created)),h("td",{},who(d.vs)),h("td",{},d.role==="challenger"?"lanceur":d.role==="defender"?"défié":d.role??"—"),
    h("td",{},tr(DUEL_STATUS,d.status)),h("td",{},tr(DUEL_RES,d.res)),h("td",{},flagBadges(d.flags)||"—"),
    h("td",{},d.status==="done"&&d.id!=null?annulBtn({id:d.id,label:`${p.name} contre ${who(d.vs)}`}):null)))))):empty("Aucun duel.")),
  p.games&&!p.activity?.games?h("div",{class:"card"},h("h2",{},"Mini-jeux (14 jours)"),gamesTable(p.games)):null,
  h("div",{class:"card"},h("h2",{},"Activité et mini-jeux (14 jours)"),p.activity?botReport(p.activity,false):empty("Pas de rapport d'activité.")),
 ];
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
 return {node:h("div",{class:"field-row"},sel,name,dl),get,label,reset:()=>{sel.value="all";name.value="";name.hidden=true;}};
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
 const onceBox=h("div",{},h("label",{},"Date et heure (heure de ce navigateur)"),at);
 const repBox=h("div",{},h("div",{class:"field-row"},h("div",{},h("label",{},"Heure (fuseau du jeu, Paris)"),time),h("div",{},h("label",{},"Jusqu'au (facultatif, inclus)"),until)),h("div",{hidden:true},h("label",{},"Jours"),days));
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
  const tog=h("input",{type:"checkbox",checked:!!s.enabled,"aria-label":"Active",onchange:e=>act(null,()=>call("schedule-toggle",{id:s.id,enabled:e.target.checked}),e.target.checked?"Planification activée.":"Planification en pause.")});
  const tg=s.target||{};
  return h("li",{class:"row"},h("label",{class:"check"},tog),h("span",{class:"grow"},h("div",{},s.text),
   h("div",{class:"meta"},`${ruleText(s)} · pour ${tg.kind==="camp"?`le camp de ${tg.camp==="left"?"gauche":"droite"}`:tg.kind==="player"?tg.name:"tout le monde"} · prochaine : ${s.enabled&&s.next?fmt(s.next):"—"} · dernière : ${fmt(s.last)}`)),
   h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer cette planification ?",s.text,"Supprimer").then(ok=>ok&&act(b,()=>call("schedule-delete",{id:s.id}),"Planification supprimée."));}},"Supprimer"));
 })):empty("Aucune annonce planifiée.");
 const items=hist.items||[];
 return [
  head("Annonces",refreshBtn()),
  h("div",{class:"grid wide"},
   h("div",{class:"card"},h("h2",{},"Envoyer maintenant"),h("label",{},"Destinataires"),t1.node,h("label",{},"Texte"),c1.ta,c1.counter,h("label",{},"Aperçu"),c1.preview,
    h("p",{class:"muted small"},"Bandeau sur les écrans ouverts (jamais en pleine partie), notification aux abonnés et, envoyée à tous, une ligne dans le fil."),h("div",{class:"btn-row"},send)),
   h("div",{class:"card"},h("h2",{},"Planifier"),h("label",{},"Destinataires"),t2.node,h("label",{},"Texte"),c2.ta,c2.counter,c2.preview,
    h("label",{},"Fréquence"),kindSel,onceBox,repBox,h("div",{class:"btn-row"},plan))),
  h("div",{class:"card"},h("h2",{},"Planifiées"),schedRows),
  h("div",{class:"card"},h("h2",{},"Historique"),items.length?h("div",{class:"table-wrap"},h("table",{},
   h("thead",{},h("tr",{},["Date","Par","Pour","Texte"].map(t=>h("th",{},t)))),
   h("tbody",{},items.map(i=>h("tr",{},h("td",{class:"nowrap"},fmt(i.t)),h("td",{},tr(VIA,i.via)),h("td",{},i.target||"tous"),h("td",{class:"wrap"},i.text??"")))))):empty("Aucune annonce envoyée.")),
 ];
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
async function viewChat(){
 const [{items},st]=await Promise.all([call("chat-reports"),call("stats")]);
 const closed=st.chatRooms&&!st.chatRooms.global&&!st.chatRooms.camp;
 return [head("Chat · messages signalés",refreshBtn()),
  closed?h("div",{class:"card notice"},h("b",{},"Le chat est fermé : "),"les signalements restent consultables. ",h("a",{href:"#reglages"},"Réglages →")):null,items.length?h("div",{class:"list"},items.map(m=>{
  const author=who(m.author),hrs=h("select",{"aria-label":"Durée"},[[24,"24 h"],[72,"3 jours"],[168,"7 jours"],[720,"30 jours"]].map(([v,t])=>h("option",{value:v},t)));
  const target=m.authorId!=null?{id:m.authorId}:{name:author};
  return h("div",{class:"card"},
   h("div",{class:"btn-row"},h("b",{},author),h("span",{class:`badge ${m.room==="global"?"":m.room}`},ROOM[m.room]||m.room),
    h("span",{class:"badge bad"},`${m.reports} signalement${m.reports>1?"s":""}`),h("span",{class:"muted small"},fmt(m.t))),
   h("p",{class:"wrap msg"},m.text||(m.media?"":"(vide)")),
   m.media?h("button",{class:"btn small",type:"button",onclick:e=>act(e.currentTarget,()=>showMedia(e.currentTarget,m.media),null,null)},`Voir l'image jointe (${m.media.type||"image"})`):null,
   h("p",{class:"muted small"},`Signalé par : ${(m.reporters||[]).join(", ")||"—"}`),
   h("div",{class:"btn-row"},
    h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer ce message ?","Il disparaît des écrans de tous les joueurs.","Supprimer").then(ok=>ok&&act(b,()=>call("chat-delete",{id:m.id}),"Message supprimé."));}},"Supprimer le message"),
    hrs,h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox(`Couper le chat de ${author} ?`,`${author} ne pourra plus écrire pendant ${hrs.selectedOptions[0].textContent}.`,"Couper").then(ok=>ok&&act(b,()=>call("chat-mute",{...target,hours:+hrs.value}),"Chat de l'auteur coupé."));}},"Couper le chat de l'auteur")));
 })):h("div",{class:"card"},empty("Aucun message signalé."))];
}

// ===================================================================== Fil
async function viewFeed(){
 const {items}=await call("feed-list",{limit:200});
 return [head("Fil de la République",refreshBtn()),h("div",{class:"card"},items.length?h("div",{class:"table-wrap"},h("table",{},
  h("thead",{},h("tr",{},["Date","Joueur","Type","Texte",""].map(t=>h("th",{},t)))),
  h("tbody",{},items.map(i=>h("tr",{},h("td",{class:"nowrap"},fmt(i.t)),h("td",{},i.player),h("td",{},tr(FEED_KIND,i.kind)),h("td",{class:"wrap"},i.text),
   h("td",{},h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Supprimer cette ligne du fil ?",`${i.player} : ${i.text}`,"Supprimer").then(ok=>ok&&act(b,()=>call("feed-delete",{id:i.id}),"Ligne supprimée."));}},"Supprimer"))))))):empty("Le fil est vide."))];
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
     :h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;confirmBox("Annuler ce duel ?",`${who(d.challenger)} contre ${who(d.defender)} : annulé sans effet sur les jauges.`,"Annuler le duel").then(ok=>ok&&act(b,()=>call("duel-cancel",{id:d.id}),"Duel annulé."));}},"Annuler")))))))
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
 if(!rooms)return h("div",{class:"card"},h("h2",{},"Chat"),empty("Ce serveur ne gère pas encore l'ouverture du chat."));
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
function viewBackup(){
 const dl=(path,label)=>h("button",{class:"btn go",type:"button",onclick:e=>act(e.currentTarget,()=>download(path),r=>`${r.name} téléchargé (${bytes(r.size)}).`,null)},label);
 return [head("Sauvegarde"),h("div",{class:"grid wide"},
  h("div",{class:"card"},h("h2",{},"Base de données"),h("p",{class:"muted small"},"Une copie cohérente de la base (VACUUM INTO), prise à chaud, téléchargée puis effacée du serveur. Elle contient les empreintes des mots de passe : garde-la en lieu sûr."),
   h("div",{class:"btn-row"},dl("backup","Télécharger la base (.db)"))),
  h("div",{class:"card"},h("h2",{},"Clé des notifications"),h("p",{class:"muted small"},"vapid.json : sans elle, une base restaurée perd tous les abonnements aux notifications. C'est une clé privée : ne la partage jamais."),
   h("div",{class:"btn-row"},dl("backup-vapid","Télécharger vapid.json"))))];
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
const annulBtn=d=>h("button",{class:"btn small danger",type:"button",onclick:e=>{const b=e.currentTarget;
 confirmBox("Annuler ce duel et rendre les gains ?",`Duel #${d.id}${d.label?` (${d.label})`:""} : ses gains d'XP, de moral et d'énergie sont repris aux deux joueurs, le résultat est effacé.`,"Annuler et rendre les gains")
  .then(ok=>ok&&act(b,()=>call("duel-annul",{id:d.id}),"Duel annulé, gains rendus."));}},"Annuler ce duel (rendre les gains)");

function botReport(r,withName=true){
 const lvl=r.score>=60?"bad":r.score>=30?"warn":"good";
 return h("div",{},
  h("div",{class:"btn-row"},withName?h("a",{href:`#joueurs/${r.id}`},h("b",{},r.name)):null,h("span",{class:`badge ${lvl}`},`score ${r.score??0}/100`),h("span",{class:"muted small"},`${r.actions14d??0} actions sur 14 j`)),
  h("div",{class:"metrics"},[["sans écran ouvert",pct(r.noLiveShare)],["hors navigateur",pct(r.nonBrowserShare)],["la nuit (1 h-6 h)",pct(r.nightShare)],["écart médian",r.medianGapS==null?"—":`${Math.round(r.medianGapS)} s`],["régularité (CV)",r.gapCv==null?"—":r.gapCv.toFixed(2)]]
   .map(([k,v])=>h("span",{},`${k} : `,h("b",{},v)))),
  r.reasons?.length?h("ul",{class:"reasons"},r.reasons.map(x=>h("li",{},x))):null,
  Array.isArray(r.byHour)&&r.byHour.length===24?bars(r.byHour):null,
  flagBadges(r.gameFlags),
  r.games&&Object.keys(r.games).length?[h("h3",{class:"sub"},"Mini-jeux"),gamesTable(r.games)]:null);
}
async function viewBots(){
 const {items}=await call("bots");
 return [head("Détection de bots",refreshBtn()),
  h("p",{class:"muted small"},"Indices sur 14 jours, jamais une preuve. Les mini-jeux pèsent le plus (résultats invraisemblables, bonus maximal presque à chaque partie, scores trop constants, parties envoyées au plus tôt permis), puis le client (hors navigateur, sans écran ouvert), la nuit et le rythme des actions. Le détail des points est dans chaque rapport. Aucune adresse IP n'est conservée. Heures dans le fuseau du jeu."),
  items.length?h("div",{class:"grid wide"},items.map(r=>h("div",{class:"card"},botReport(r)))):h("div",{class:"card"},empty("Aucune activité enregistrée."))];
}

// ===================================================================== Journal d'admin
async function viewAudit(){
 const {items}=await call("audit",{limit:500});
 return [head("Journal d'admin",refreshBtn()),h("div",{class:"card"},items.length?h("div",{class:"table-wrap"},h("table",{},
  h("thead",{},h("tr",{},["Date","Par","Commande","Cible","Détail"].map(t=>h("th",{},t)))),
  h("tbody",{},items.map(i=>h("tr",{},h("td",{class:"nowrap"},fmt(i.t)),h("td",{},VIA[i.via]||i.via||"—"),h("td",{},h("code",{},i.cmd)),h("td",{},i.target||"—"),h("td",{class:"wrap"},i.detail||"")))))):empty("Aucune action enregistrée."))];
}

// ===================================================================== start
(async()=>{
 try{const r=await fetch("/api/session",{credentials:"same-origin"}).then(r=>r.json());if(r.authed)await showApp();else showLogin();}
 catch{showLogin();}
})();
