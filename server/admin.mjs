// PolitiGo administration, run inside the API container (docker exec, or the Portainer console):
//   node admin.mjs list                            the players
//   node admin.mjs reset-password <pseudo>         a strong password is generated and printed once
//   node admin.mjs reset-password <pseudo> --stdin the password is typed (hidden) or piped in
//   node admin.mjs unlock <pseudo>                 forgets the failed login attempts on that name
// It talks to the running server over its admin socket (POLITIGO_ADMIN_SOCKET), so the server itself hashes the
// password, signs the player out everywhere and clears the login counters: no restart, no second database writer.
import net from "node:net";
import crypto from "node:crypto";

const SOCKET=process.env.POLITIGO_ADMIN_SOCKET||"/tmp/politigo-admin.sock";
const USAGE="Usage : node admin.mjs list | reset-password <pseudo> [--stdin] | unlock <pseudo>";
const fail=(msg,code=1)=>{console.error(msg);process.exit(code);};
const check=r=>{if(!r?.ok)fail(r?.error||"Échec.");return r;};

function call(req){
 return new Promise((ok,ko)=>{
  const s=net.createConnection(SOCKET);let buf="";
  s.setEncoding("utf8");
  s.setTimeout(15000,()=>{s.destroy();ko(new Error("pas de réponse du serveur en 15 s"));});
  s.on("connect",()=>s.write(JSON.stringify(req)+"\n"));
  s.on("data",d=>{buf+=d;if(buf.length>1e6)s.destroy(new Error("réponse trop grosse"));});
  s.on("end",()=>{try{ok(JSON.parse(buf));}catch{ko(new Error("réponse illisible du serveur"));}});
  s.on("error",ko);
 });
}
// 18 characters from an alphabet without look-alikes (no 0/O, 1/l/I): about 104 bits, drawn without modulo bias.
function generate(){
 const A="abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789",max=Math.floor(256/A.length)*A.length;let s="";
 while(s.length<18)for(const b of crypto.randomBytes(32))if(b<max&&s.length<18)s+=A[b%A.length];
 return s;
}
// Typed at a terminal: nothing is echoed. Ctrl+C gives up without changing anything.
function askHidden(prompt){
 return new Promise(ok=>{
  const i=process.stdin;let s="";process.stderr.write(prompt);
  i.setRawMode(true);i.setEncoding("utf8");i.resume();
  const on=chunk=>{for(const c of chunk){
   if(c==="\r"||c==="\n"){i.setRawMode(false);i.pause();i.off("data",on);process.stderr.write("\n");return ok(s);}
   if(c==="\u0003"){i.setRawMode(false);process.stderr.write("\n");process.exit(130);}
   if(c==="\u007f"||c==="\b")s=s.slice(0,-1);else if(c>=" "&&s.length<=200)s+=c;   // one too many is enough to be refused below
  }};
  i.on("data",on);
 });
}
async function readStdin(){
 let s="";process.stdin.setEncoding("utf8");
 for await(const c of process.stdin){s+=c;if(s.length>1000)fail("Mot de passe trop long, rien n'a changé.");}
 return s.replace(/\r?\n$/,"");
}
const day=t=>t?new Date(t).toLocaleDateString("fr-FR"):"?";

const [cmd,name,...rest]=process.argv.slice(2);
if(name?.startsWith("--"))fail(USAGE,2);   // "reset-password --stdin Alice": the pseudo comes first
try{
 if(cmd==="list"&&name===undefined){
  const {players}=check(await call({cmd}));
  if(!players.length)console.log("Aucun joueur.");
  for(const p of players)console.log(`${p.name}  (inscrit le ${day(p.created)}, vu le ${day(p.updated)})`);
 }
 else if(cmd==="unlock"&&name&&!rest.length){
  const r=check(await call({cmd,name}));
  console.log(`Essais de connexion remis à zéro pour ${r.name}.`);
 }
 else if(cmd==="reset-password"&&name){
  // A password on the command line shows in the process list and stays in the shell history (and in docker's).
  if(rest.length&&!(rest.length===1&&rest[0]==="--stdin"))
   fail("Refusé : ne passe jamais le mot de passe en argument (visible des autres processus et gardé dans l'historique).\n"+
    "Sans rien, un mot de passe est généré ; avec --stdin, tu le tapes (masqué) ou tu l'envoies sur l'entrée standard.",2);
  const typed=rest[0]==="--stdin";
  let pw;
  if(!typed)pw=generate();
  else if(process.stdin.isTTY){
   pw=await askHidden("Nouveau mot de passe : ");
   if(await askHidden("Confirme-le : ")!==pw)fail("Les deux saisies diffèrent, rien n'a changé.");
  }
  else if(!(pw=await readStdin()))fail("Aucun mot de passe reçu sur l'entrée standard (docker exec sans -i ?), rien n'a changé.");
  if(pw.length<8||pw.length>200)fail("Mot de passe : 8 à 200 caractères, rien n'a changé.");
  const r=check(await call({cmd,name,password:pw}));
  console.log(`Mot de passe réinitialisé pour ${r.name} : sessions fermées partout, essais de connexion remis à zéro.`);
  if(!typed){console.log(`Nouveau mot de passe : ${pw}`);console.log("Transmets-le par un canal privé : il n'est affiché qu'une fois.");}
 }
 else fail(USAGE,2);
}catch(e){
 fail(e.code==="ENOENT"||e.code==="ECONNREFUSED"?`Serveur injoignable sur ${SOCKET} : le serveur tourne-t-il, avec POLITIGO_ADMIN_SOCKET différent de "off" ?`
  :e.code==="EACCES"?`Accès refusé à ${SOCKET} : lance la commande en tant qu'utilisateur node (docker exec -u node ...).`
  :`Erreur : ${e.message}`);
}
