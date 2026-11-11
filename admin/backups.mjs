// Automatic backups of the game databases, kept in the admin volume: <root>/backups/<server id>/<frequency>-<date>.db,
// next to a copy of that server's vapid.json. The API writes the consistent copy (VACUUM INTO) next to its socket; this
// module copies it through a temporary file, checks it, then renames it, and always removes the API's file. Rotation
// only follows a success, and only touches names this module writes: a failure can never cost a good backup.
// Hours are those of the container (TZ). The game data stays out of the logs: only sizes, names and errors are told.
import fs from "node:fs";
import {randomBytes} from "node:crypto";
import {join,basename} from "node:path";
import {pipeline} from "node:stream/promises";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

export const FREQS=["quotidienne","hebdomadaire","mensuelle"],MANUAL="manuelle",MANUAL_KEEP=5,KEEP_MAX=90;
export const DEFAULTS={hour:4,quotidienne:{on:true,keep:7},hebdomadaire:{on:true,keep:4},mensuelle:{on:true,keep:12}};
const FILE=/^(quotidienne|hebdomadaire|mensuelle|manuelle)-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.db$/,TEMP=/^(quotidienne|hebdomadaire|mensuelle|manuelle)-\d{4}-\d{2}-\d{2}-\d{4}\.db\.tmp-[0-9a-f]+(-shm|-wal|-journal)?$/;
const VAPID="vapid.json",RETRY_MS=30*60e3,PARTY_MS=20*60e3,PARALLEL=3,ID=/^[a-z0-9-]{1,40}$/,MARGIN_MIN=16*1024*1024,PRIVATE=0o600,PRIVATE_DIR=0o700;

// The last time a frequency was due at t, and the next one. Built from local dates: a clock change moves no appointment.
export function lastSlot(freq,hour,t){
 const d=new Date(t),y=d.getFullYear(),m=d.getMonth(),day=d.getDate();
 if(freq==="mensuelle"){const s=new Date(y,m,1,hour).getTime();return s<=t?s:new Date(y,m-1,1,hour).getTime();}
 if(freq==="hebdomadaire"){const mon=day-(d.getDay()+6)%7,s=new Date(y,m,mon,hour).getTime();return s<=t?s:new Date(y,m,mon-7,hour).getTime();}
 const s=new Date(y,m,day,hour).getTime();return s<=t?s:new Date(y,m,day-1,hour).getTime();
}
export function nextSlot(freq,hour,t){
 const d=new Date(lastSlot(freq,hour,t)),y=d.getFullYear(),m=d.getMonth(),day=d.getDate();
 return (freq==="mensuelle"?new Date(y,m+1,1,hour):new Date(y,m,day+(freq==="hebdomadaire"?7:1),hour)).getTime();
}
// The settings as sent, checked: only what is on offer, or null.
export function cleanConfig(c){
 if(!c||typeof c!=="object"||!Number.isInteger(c.hour)||c.hour<0||c.hour>23)return null;
 const out={hour:c.hour};
 for(const f of FREQS){
  const x=c[f];if(!x||typeof x.on!=="boolean"||!Number.isInteger(x.keep)||x.keep<1||x.keep>KEEP_MAX)return null;
  out[f]={on:x.on,keep:x.keep};
 }
 return out;
}
const two=n=>String(n).padStart(2,"0");
const stamp=t=>{const d=new Date(t);return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;};
const whenOf=m=>new Date(+m[2],+m[3]-1,+m[4],+m[5],+m[6]).getTime();
const tempName=p=>`${p}.tmp-${randomBytes(6).toString("hex")}`;
const size=n=>`${(n/1048576).toFixed(1)} Mo`;
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,"utf8"));}catch{return null;}};
async function writeJson(file,v){
 const tmp=tempName(file);
 try{await fs.promises.writeFile(tmp,JSON.stringify(v,null,1),{mode:PRIVATE,flag:"wx"});await fs.promises.rename(tmp,file);}
 catch(e){await fs.promises.unlink(tmp).catch(()=>{});throw e;}
}
const disk=async dir=>{const s=await fs.promises.statfs(dir);return {free:s.bavail*s.bsize,total:s.blocks*s.bsize};};
// A base that opens, passes SQLite's own check and holds the players: checked in a child process (verify.mjs), within
// 5 minutes, so that the console keeps answering while a big base is read. Past the delay the process is killed
// (SIGKILL: SQLite cannot be stopped from inside), and one check runs at a time: the next one starts only once the
// previous process has exited. onStart(pid): for the tests.
const VERIFY=fileURLToPath(new URL("./verify.mjs",import.meta.url)),VERIFY_MS=5*60e3;
const human=ms=>ms>=60e3?`${Math.round(ms/60e3)} min`:`${Math.ceil(ms/1000)} s`;
let checking=Promise.resolve();
export function verify(path,{timeout=VERIFY_MS,onStart}={}){
 const check=()=>new Promise((ok,ko)=>{
  let done=false,late=false,out="",c;
  const end=(f,v)=>{if(done)return;done=true;clearTimeout(t);f(v);};
  const t=setTimeout(()=>{late=true;c?.kill("SIGKILL");},timeout);
  try{c=spawn(process.execPath,[VERIFY,path],{stdio:["ignore","pipe","ignore"],env:{NODE_NO_WARNINGS:"1"}});}catch(e){return end(ko,e);}
  if(c.pid)onStart?.(c.pid);
  c.stdout.setEncoding("utf8");c.stdout.on("data",d=>{if(out.length<4096)out+=d;});
  c.on("error",e=>{if(!c.pid)end(ko,e);});   // not even started: no exit will come
  c.on("close",(code,sig)=>{
   if(late)return end(ko,new Error(`vérification trop longue (plus de ${human(timeout)})`));
   let m=null;try{m=JSON.parse(out);}catch{}
   m?.ok===true?end(ok):end(ko,new Error(m?.error||`vérification interrompue (${sig||`code ${code}`})`));
  });
 });
 const p=checking.then(check,check);checking=p.catch(()=>{});
 return p;
}
// A wait given up after ms (the work behind it goes on, but the others no longer wait for it).
const settle=(p,ms,msg)=>{let t;return Promise.race([p,new Promise((_,ko)=>{t=setTimeout(()=>ko(new Error(msg)),ms);})]).finally(()=>clearTimeout(t));};

// take(srv): {path, vapid?}, the API's copy. note(srv,text): a line in that game's admin log. Err(status,message): the
// caller's HTTP error. partyMs: the most one server's backup may hold the others back; parallel: how many servers are
// backed up at once. now, freeSpace, verifyMs can be replaced by the tests.
export function createBackups({root,servers,take,note,Err,now=Date.now,freeSpace=disk,retryMs=RETRY_MS,log=console.error,partyMs=PARTY_MS,verifyMs=VERIFY_MS,parallel=PARALLEL}){
 const base=join(root,"backups"),confFile=join(root,"backups.json"),stateFile=join(root,"backups-state.json");
 let conf=cleanConfig(readJson(confFile))??structuredClone(DEFAULTS);
 const saved=readJson(stateFile),state={last:saved?.last&&typeof saved.last==="object"?saved.last:{},fail:saved?.fail&&typeof saved.fail==="object"?saved.fail:{}};
 let running=false,booked=0;const slow=new Set();   // slow: servers whose last try outlived partyMs and still runs; booked: room promised to the copies under way
 const dirOf=srv=>join(base,srv.id);
 // The folders of servers no longer there (a party removed): their backups stay listed and can be downloaded.
 function orphans(){
  let l=[];try{l=fs.readdirSync(base,{withFileTypes:true});}catch{return [];}
  return l.filter(d=>d.isDirectory()&&ID.test(d.name)&&!servers.some(s=>s.id===d.name)).map(d=>({id:d.name,removed:true}));
 }
 const server=id=>{const s=servers.find(x=>x.id===id)??(typeof id==="string"?orphans().find(x=>x.id===id):null);if(!s)throw new Err(404,"Partie inconnue.");return s;};
 const tell=(srv,text)=>srv.removed?Promise.resolve():Promise.resolve().then(()=>note(srv,text)).catch(e=>log(`backups: log line for ${srv.id} failed: ${e.message}`));
 const saveState=()=>writeJson(stateFile,state).catch(e=>log(`backups: state not saved: ${e.message}`));
 function files(srv){
  let names=[];try{names=fs.readdirSync(dirOf(srv));}catch{return [];}
  const out=[];
  for(const name of names){
   const m=FILE.exec(name);if(!m)continue;
   try{const st=fs.lstatSync(join(dirOf(srv),name));if(st.isFile())out.push({name,freq:m[1],t:whenOf(m),size:st.size});}catch{}
  }
  return out.sort((a,b)=>b.t-a.t||(a.name<b.name?-1:1));
 }
 // The last success: what the state says, or the newest file when the state was lost. A date still to come (a clock
 // that ran ahead, then was put right) counts for nothing: it would hold every appointment back until that day.
 function lastOf(srv,list=files(srv)){
  const o={},cap=now()+60e3,ok=v=>typeof v==="number"&&v<=cap?v:0;
  for(const f of [...FREQS,MANUAL])o[f]=Math.max(ok(state.last[srv.id]?.[f]),ok(list.find(x=>x.freq===f&&x.t<=cap)?.t))||null;
  return o;
 }
 const keepOf=f=>f===MANUAL?MANUAL_KEEP:conf[f].keep;
 // The file just written always stays, even when names dated in the future (a wrong clock) sort before it.
 async function rotate(srv,freq,fresh){
  const old=files(srv).filter(x=>x.freq===freq&&x.name!==fresh).slice(Math.max(0,keepOf(freq)-1));
  for(const f of old)await fs.promises.unlink(join(dirOf(srv),f.name)).catch(e=>log(`backups: ${f.name} not removed: ${e.message}`));
 }
 async function sweep(dir){for(const n of await fs.promises.readdir(dir))if(TEMP.test(n))await fs.promises.unlink(join(dir,n)).catch(()=>{});}
 async function copy(src,tmp){
  const fh=await fs.promises.open(src,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try{
   const st=await fh.stat();if(!st.isFile()||!st.size)throw new Error("copie de l'API illisible");
   await pipeline(fh.createReadStream({autoClose:false}),fs.createWriteStream(tmp,{flags:"wx",mode:PRIVATE}));
   return st.size;
  }finally{await fh.close().catch(()=>{});}
 }
 async function sync(path){const fh=await fs.promises.open(path,"r+");try{await fh.sync();}finally{await fh.close().catch(()=>{});}}
 // One copy of the base serves every frequency due.
 async function one(srv,freqs){
  const dir=dirOf(srv),t=now();
  await fs.promises.mkdir(dir,{recursive:true,mode:PRIVATE_DIR});await fs.promises.chmod(base,PRIVATE_DIR);await fs.promises.chmod(dir,PRIVATE_DIR);
  await sweep(dir);
  const {path,vapid}=await take(srv),temps=[];
  let bytes=0,want=0;
  try{
   // Several servers at once: the room the others' copies were promised is not free.
   const need=(await fs.promises.stat(path)).size,room=(await freeSpace(dir)).free-booked,w=need*freqs.length+Math.max(MARGIN_MIN,need/10);
   if(room<w)throw new Error(`espace insuffisant : ${size(w)} nécessaires, ${size(Math.max(0,room))} libres`);
   want=w;booked+=want;
   const first=tempName(join(dir,`${freqs[0]}-${stamp(t)}.db`));temps.push(first);
   bytes=await copy(path,first);
   if((await fs.promises.stat(first)).size!==bytes)throw new Error("copie incomplète");
   await verify(first,{timeout:verifyMs});await sync(first);
   for(const f of freqs.slice(1)){
    const tmp=tempName(join(dir,`${f}-${stamp(t)}.db`));temps.push(tmp);
    await fs.promises.copyFile(first,tmp,fs.constants.COPYFILE_EXCL);await fs.promises.chmod(tmp,PRIVATE);await sync(tmp);
   }
   for(const [i,f] of freqs.entries())await fs.promises.rename(temps[i],join(dir,`${f}-${stamp(t)}.db`));
   temps.length=0;
   if(vapid&&typeof vapid==="object")await writeJson(join(dir,VAPID),vapid);
  }finally{
   booked-=want;
   await fs.promises.unlink(path).catch(()=>{});
   for(const x of temps)await fs.promises.unlink(x).catch(()=>{});
  }
  state.last[srv.id]={...state.last[srv.id]};for(const f of freqs)state.last[srv.id][f]=t;
  delete state.fail[srv.id];
  for(const f of freqs)await rotate(srv,f,`${f}-${stamp(t)}.db`);
  await tell(srv,`Sauvegarde ${freqs.join(", ")} : ${size(bytes)}.`);
 }
 // A few servers at once (PARALLEL): a slow one no longer delays the whole list; each keeps its own delay.
 async function attempt({srv,freqs}){
  try{
   if(slow.has(srv.id))throw new Error("la sauvegarde précédente de cette partie n'est pas encore finie");
   const job=one(srv,freqs);job.catch(()=>{});
   await settle(job,partyMs,`délai dépassé (${human(partyMs)}) : la partie répond trop lentement, les autres passent`).catch(e=>{
    slow.add(srv.id);job.finally(()=>slow.delete(srv.id)).catch(()=>{});throw e;});
   return {id:srv.id,ok:true};
  }
  catch(e){
   const error=(e?.code==="ENOSPC"?"disque plein dans le volume de la console (/data-admin) : libère de la place ou garde moins de sauvegardes":String(e?.message||e)).slice(0,200);
   state.fail[srv.id]={t:now(),error,freqs};
   log(`backups: ${srv.id}: ${error}`);await tell(srv,`Sauvegarde ${freqs.join(", ")} en échec.`);   // the admin log is open to moderators: the cause stays in the logs and the owner's alert
   return {id:srv.id,ok:false,error};
  }
 }
 async function run(plan){
  const out=[];let next=0;
  const lane=async()=>{while(next<plan.length){const i=next++;out[i]=await attempt(plan[i]);}};
  await Promise.all(Array.from({length:Math.min(parallel,plan.length)},lane));
  await saveState();
  return out;
 }
 const locked=async fn=>{running=true;try{return await fn();}finally{running=false;}};
 return {
  config:()=>structuredClone(conf),
  async saveConfig(c){
   const clean=cleanConfig(c);if(!clean)throw new Err(400,`Réglages : heure de 0 à 23, de 1 à ${KEEP_MAX} sauvegardes gardées.`);
   try{await writeJson(confFile,clean);}
   catch(e){log(`backups: settings not saved: ${e.message}`);throw new Err(500,e.code==="ENOSPC"?"Réglages non enregistrés : le disque de la console est plein (volume /data-admin).":"Réglages non enregistrés : le volume /data-admin n'accepte pas l'écriture.");}
   conf=clean;
   const text=`Réglages des sauvegardes : ${clean.hour} h, ${FREQS.map(f=>`${f} ${clean[f].on?clean[f].keep:"non"}`).join(", ")}.`;
   for(const s of servers)await tell(s,text);
   return structuredClone(conf);
  },
  // Every minute: what is due, at most once per server; a server that failed waits before the next try.
  async tick(){
   if(running)return;
   const t=now(),plan=[];
   for(const srv of servers){
    if(slow.has(srv.id))continue;
    const f=state.fail[srv.id];if(f&&t-f.t<retryMs&&t>=f.t)continue;
    const last=lastOf(srv),freqs=FREQS.filter(x=>conf[x].on&&(last[x]??0)<lastSlot(x,conf.hour,t));
    if(freqs.length)plan.push({srv,freqs});
   }
   if(plan.length)await locked(()=>run(plan));
  },
  async runNow(){
   if(running)throw new Err(409,"Une sauvegarde est déjà en cours.");
   return locked(()=>run(servers.map(srv=>({srv,freqs:[MANUAL]}))));
  },
  status(){
   const t=now(),list=[...servers,...orphans()].map(s=>{
    const l=files(s);
    return {id:s.id,name:s.removed?`Partie retirée (${s.id})`:s.label||s.id,...(s.removed?{removed:true}:{}),files:l,last:lastOf(s,l),
     failure:!s.removed&&state.fail[s.id]?{t:state.fail[s.id].t,error:state.fail[s.id].error}:null,vapid:fs.existsSync(join(dirOf(s),VAPID))};
   });
   return {config:structuredClone(conf),running,next:Object.fromEntries(FREQS.map(f=>[f,conf[f].on?nextSlot(f,conf.hour,t):null])),servers:list,
    total:list.flatMap(s=>s.files).reduce((n,f)=>n+f.size,0),lastSuccess:Math.max(0,...list.flatMap(s=>Object.values(s.last).map(v=>v??0)))||null};
  },
  disk:()=>freeSpace(fs.existsSync(base)?base:root).catch(()=>null),
  // An item for À traiter, the owner's only, as long as the last try of that server failed.
  alert(id){
   const f=state.fail[id];
   return f?{key:`backup:${id}:${f.t}`,kind:"backup",t:f.t,ref:null,ids:[],title:"La sauvegarde automatique a échoué",detail:f.error,noAck:true}:null;
  },
  // A name from a request: never a path, only what this module writes, in that server's own folder.
  async open(id,name){
   const srv=server(id);if(typeof name!=="string"||basename(name)!==name||!(FILE.test(name)||name===VAPID))throw new Err(400,"Nom de sauvegarde invalide.");
   let fh;
   try{
    fh=await fs.promises.open(join(dirOf(srv),name),fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const st=await fh.stat();if(!st.isFile())throw new Error("not a file");
    return {fh,size:st.size,name};
   }catch{await fh?.close().catch(()=>{});throw new Err(404,"Sauvegarde introuvable.");}
  },
  async remove(id,name){
   const srv=server(id);if(typeof name!=="string"||basename(name)!==name||!FILE.test(name))throw new Err(400,"Nom de sauvegarde invalide.");
   try{await fs.promises.unlink(join(dirOf(srv),name));}catch{throw new Err(404,"Sauvegarde introuvable.");}
   await tell(srv,`Sauvegarde supprimée : ${name}.`);
  }
 };
}
