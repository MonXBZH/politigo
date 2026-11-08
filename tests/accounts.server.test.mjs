// Deleting a player from the console, protected accounts, and the accounts that look abandoned, on a real server,
// through its admin socket: a moderator's calls carry by/self/mods, as admin/server.mjs sets them.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import {createConnection} from "node:net";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,player,client,sleep,PW,INVITE} from "./server-helpers.mjs";

const PORT=3992,DAY=864e5;
let dir,SOCK,proc,db;
const env=()=>({POLITIGO_ADMIN_SOCKET:SOCK});
function adm(obj){
 return new Promise((ok,ko)=>{
  const c=createConnection(SOCK);let text="";
  c.setEncoding("utf8");c.on("data",d=>{text+=d;});c.on("error",ko);
  c.on("close",()=>{try{ok(JSON.parse(text));}catch{ko(new Error("bad reply: "+text));}});
  c.on("connect",()=>c.write(JSON.stringify(obj)+"\n"));
 });
}
const mod=(o,extra={})=>adm({...o,by:"Modo",...extra});
const idOf=name=>db.prepare("SELECT id FROM players WHERE name=?").get(name)?.id;
const rowOf=id=>db.prepare("SELECT * FROM players WHERE id=?").get(id);
const me=async c=>(await c.call("GET","/api/me")).json;
// Ages accounts with the server stopped: its memory is loaded from the database at boot.
async function aged(list){
 await stop(proc);
 for(const [id,days,deaths] of list){
  const S=JSON.parse(rowOf(id).state);S.idleDeaths=deaths;
  db.prepare("UPDATE players SET state=?,last_seen=? WHERE id=?").run(JSON.stringify(S),Date.now()-days*DAY,id);
 }
 proc=await boot(PORT,dir,env());
}

before(async()=>{
 dir=mkdtempSync(join(tmpdir(),"pgac-"));SOCK=join(dir,"admin.sock");
 proc=await boot(PORT,dir,env());
 db=new DatabaseSync(join(dir,"t.db"),{timeout:5000});
});
after(async()=>{try{db.close();}catch{}await stop(proc);});

test("player-delete wants the exact name; then the account, its sessions and feed lines are gone, and the log says who",async()=>{
 const a=await player(PORT,"Partant","left"),id=idOf("Partant");
 assert.equal((await adm({cmd:"player-delete",id})).ok,false);
 assert.equal((await adm({cmd:"player-delete",id,confirm:"partant"})).ok,false,"the exact name, case included");
 assert.equal((await me(a)).name,"Partant");
 const r=await mod({cmd:"player-delete",id,confirm:"Partant"});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(rowOf(id),undefined);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE player_id=?").get(id).n,0);
 assert.equal((await a.call("GET","/api/me")).status,401,"signed out at once");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM feed WHERE player=?").get("Partant").n,0);
 const log=(await adm({cmd:"audit"})).items.find(x=>x.cmd==="player-delete");assert.equal(log.target,"Partant");assert.equal(log.actor,"Modo");
 assert.equal((await adm({cmd:"player-delete",id,confirm:"Partant"})).ok,false,"already gone");
 const c=client(PORT);assert.equal((await c.call("POST","/api/register",{name:"Partant",password:PW,camp:"left",invite:INVITE})).status,409,"the name is held a day");
});

test("a moderator cannot delete their own account nor another moderator's; the owner can",async()=>{
 await player(PORT,"ModoA","left");await player(PORT,"ModoB","right");
 const a=idOf("ModoA"),b=idOf("ModoB");
 assert.match((await mod({cmd:"player-delete",id:a,confirm:"ModoA"},{self:a,mods:[a,b]})).error,/propre compte/);
 assert.match((await mod({cmd:"player-delete",id:b,confirm:"ModoB"},{self:a,mods:[a,b]})).error,/modérateur/);
 assert.ok(rowOf(b));
 assert.equal((await adm({cmd:"player-delete",id:b,confirm:"ModoB"})).ok,true);
});

test("player-protect is the owner's: a moderator is refused, even with no account of their own",async()=>{
 await player(PORT,"Proprio","left");const id=idOf("Proprio");
 assert.match((await mod({cmd:"player-protect",id,on:true})).error,/organisateur/);
 assert.equal((await adm({cmd:"player-protect",id,on:"oui"})).ok,false);
 assert.equal((await adm({cmd:"player-protect",id,on:true})).ok,true);
 assert.equal((await adm({cmd:"player",id})).player.protected,true);assert.equal(rowOf(id).protected,1);
 assert.equal((await mod({cmd:"player-protect",id,on:false})).ok,false);
});

test("no moderator command touches a protected account, the password route to deleting it included",async()=>{
 const id=idOf("Proprio"),who={id},password="nouveau-mot-de-passe";
 const other=await player(PORT,"Voisin","right"),oid=idOf("Voisin"),pass=rowOf(id).pass;
 for(const c of [{cmd:"player-delete",...who,confirm:"Proprio"},{cmd:"reset-password",...who,password},{cmd:"reset-password",name:"proprio",password},{cmd:"signout",...who},{cmd:"rename",...who,newName:"Autre"},
  {cmd:"suspend",...who,on:true},{cmd:"unlock",...who},{cmd:"chat-mute",...who,hours:1},{cmd:"announce",text:"Coucou",to:"Proprio"},{cmd:"announce",text:"Coucou",to:id},
  {cmd:"schedule-add",text:"Coucou",target:{kind:"player",name:"Proprio"},kind:"daily",time:"10:00"}]){
  const r=await mod(c);assert.equal(r.ok,false,c.cmd);assert.match(r.error,/protégé/,c.cmd);
 }
 const row=rowOf(id);
 assert.equal(row.name,"Proprio");assert.equal(row.suspended,0);assert.equal(row.pass,pass,"the password did not move");
 // Duels and feed lines of the protected account too.
 const t=Date.now(),ins=db.prepare("INSERT INTO duels(game,challenger,defender,seed,status,created) VALUES('debate',?,?,1,?,?)");
 const open=Number(ins.run(id,oid,"pending",t).lastInsertRowid),done=Number(ins.run(oid,id,"done",t).lastInsertRowid);
 assert.match((await mod({cmd:"duel-cancel",id:open})).error,/protégé/);assert.match((await mod({cmd:"duel-annul",id:done})).error,/protégé/);
 const line=Number(db.prepare("INSERT INTO feed(t,player,kind,text) VALUES(?,?,?,?)").run(t,"Proprio","new","Bonjour").lastInsertRowid);
 assert.match((await mod({cmd:"feed-delete",id:line})).error,/protégé/);
 // The owner keeps every right, and moderators the others.
 assert.equal((await adm({cmd:"feed-delete",id:line})).ok,true);
 assert.equal((await adm({cmd:"unlock",...who})).ok,true);
 assert.equal((await mod({cmd:"unlock",id:oid})).ok,true);
 assert.equal((await me(other)).name,"Voisin");
 assert.equal((await mod({cmd:"player",...who})).player.name,"Proprio","reading the file stays open");
 db.prepare("DELETE FROM duels WHERE id IN (?,?)").run(open,done);
});

test("the owner lifts the protection before deleting; the flag survives a restart",async()=>{
 const id=idOf("Proprio");
 await stop(proc);proc=await boot(PORT,dir,env());
 assert.equal((await adm({cmd:"player",id})).player.protected,true);
 const r=await adm({cmd:"player-delete",id,confirm:"Proprio"});assert.equal(r.ok,false);assert.match(r.error,/protection/i);
 assert.ok(rowOf(id));
 assert.equal((await adm({cmd:"player-protect",id,on:false})).ok,true);
 assert.equal((await adm({cmd:"player-delete",id,confirm:"Proprio"})).ok,true);
});

test("a player's own deletion works as before",async()=>{
 const c=await player(PORT,"Lui","left"),id=idOf("Lui");
 assert.equal((await c.call("DELETE","/api/account",{password:"mauvais"})).status,401);
 assert.equal((await c.call("DELETE","/api/account",{password:PW})).status,200);assert.equal(rowOf(id),undefined);
});

test("last_seen: set at sign-up, in no player payload, and written at most hourly",async()=>{
 const c=await player(PORT,"Revu","left"),id=idOf("Revu"),t=rowOf(id).last_seen;
 assert.ok(Math.abs(Date.now()-t)<60e3,String(t));
 const m=await me(c);assert.ok(!/last_?seen/i.test(JSON.stringify(m)));
 assert.ok(!/last_?seen/i.test(JSON.stringify((await c.call("GET","/api/board")).json)));
 await sleep(30);await me(c);assert.equal(rowOf(id).last_seen,t);
 assert.ok((await adm({cmd:"player",id})).player.lastSeen>0);
});

test("abandoned: three idle deaths and five days away, both; the protected, the ignored and the returned stay out",async()=>{
 const names=["Parti","Recent","PeuMort","Garde","Moi"],cs={};
 for(const n of names)cs[n]=await player(PORT,n,"left");
 const id=Object.fromEntries(names.map(n=>[n,idOf(n)]));
 assert.equal((await adm({cmd:"player-protect",id:id.Garde,on:true})).ok,true);
 await aged([[id.Parti,6,3],[id.Recent,4,9],[id.PeuMort,9,2],[id.Garde,9,9],[id.Moi,9,3]]);
 const list=async o=>(await adm({cmd:"abandoned-list",...o})).items;
 const l=await list();assert.deepEqual(l.map(x=>x.name),["Moi","Parti"],"the longest gone first");
 const x=l.find(y=>y.name==="Parti");
 assert.deepEqual(Object.keys(x).sort(),["baton","best","camp","flame","id","idleDeaths","lastSeen","name"]);assert.equal(x.idleDeaths,3);assert.equal(x.baton,false);
 assert.ok(!(await list({by:"Moi",self:id.Moi})).some(y=>y.id===id.Moi),"a moderator's own account stays out");
 // One grouped alert; a moderator's own account is out of the count.
 const al=async o=>(await adm({cmd:"alerts",...o})).items.filter(a=>a.kind==="abandoned");
 const a=await al();assert.equal(a.length,1);assert.equal(a[0].key,"abandoned:2");assert.match(a[0].title,/^2 comptes semblent abandonnés/);assert.deepEqual(a[0].ids,[]);
 assert.equal((await al({by:"Moi",self:id.Moi}))[0].key,"abandoned:1");assert.match((await al({by:"Moi",self:id.Moi}))[0].title,/^1 compte semble abandonné/);
 // Filed away, it stays so while the list does not grow.
 assert.equal((await adm({cmd:"alerts-ack",keys:[a[0].key]})).ok,true);assert.deepEqual(await al(),[]);
 // Ignored: out of the list; refused on a protected account for a moderator.
 assert.equal((await mod({cmd:"abandoned-ignore",id:id.Moi})).ok,true);
 assert.equal(rowOf(id.Moi).abandon_ignored,1);
 assert.deepEqual((await list()).map(y=>y.name),["Parti"]);assert.deepEqual(await al(),[],"fewer than filed away: nothing new");
 assert.match((await mod({cmd:"abandoned-ignore",id:id.Garde})).error,/protégé/);
 // Back in the game: last_seen moves on and the ignore goes.
 await me(cs.Moi);assert.equal(rowOf(id.Moi).abandon_ignored,0);assert.ok(Date.now()-rowOf(id.Moi).last_seen<60e3);
 await me(cs.Parti);assert.deepEqual(await list(),[]);
 assert.ok(rowOf(id.Parti),"nothing is deleted on its own");
 // A longer list than the one filed away comes back.
 await aged([[id.Parti,6,3],[id.Moi,6,3],[id.PeuMort,9,3]]);
 assert.equal((await al()).length,1,"more than filed away");
});

test("a player with an open stream is never listed, whatever the dates say",async()=>{
 const c=await player(PORT,"Ecoute","left"),id=idOf("Ecoute");
 await aged([[id,9,3]]);
 assert.ok((await adm({cmd:"abandoned-list"})).items.some(x=>x.id===id));
 const stopIt=new AbortController();
 await fetch(`http://127.0.0.1:${PORT}/events`,{headers:{Cookie:c.cookie,"X-Forwarded-For":"10.7.200.1"},signal:stopIt.signal});
 assert.ok(!(await adm({cmd:"abandoned-list"})).items.some(x=>x.id===id));
 stopIt.abort();
});

test("an id is never given twice, a restart included: a moderator's record cannot come to name a stranger",async()=>{
 const a=await player(PORT,"Dernier","left"),id=idOf("Dernier");
 assert.equal(id,db.prepare("SELECT MAX(id) m FROM players").get().m);
 assert.equal((await adm({cmd:"player-delete",id,confirm:"Dernier"})).ok,true);
 await player(PORT,"Suivant","left");assert.ok(idOf("Suivant")>id,"at once");
 const b=idOf("Suivant");assert.equal((await adm({cmd:"player-delete",id:b,confirm:"Suivant"})).ok,true);
 await stop(proc);proc=await boot(PORT,dir,env());
 await player(PORT,"Apres","left");assert.ok(idOf("Apres")>b,"after a restart");
 assert.ok(a);
});

test("alerts-ack: only a plain count for the abandoned, and no more than there are",async()=>{
 const acks=()=>db.prepare("SELECT key FROM admin_acks WHERE key LIKE 'abandoned:%'").all().map(r=>r.key);
 db.prepare("DELETE FROM admin_acks WHERE key LIKE 'abandoned:%'").run();
 assert.equal((await adm({cmd:"alerts-ack",keys:["abandoned:1-1"]})).ok,false);assert.equal((await adm({cmd:"alerts-ack",keys:["abandoned:1234567"]})).ok,false);
 const n=(await adm({cmd:"abandoned-list"})).items.length;
 assert.equal((await adm({cmd:"alerts-ack",keys:["abandoned:9999"]})).ok,true);
 assert.deepEqual(acks(),[`abandoned:${n}`],"kept at the real count");
 const c=await player(PORT,"Nouveau","left"),id=idOf("Nouveau");assert.ok(c);
 await aged([[id,9,3]]);
 assert.ok((await adm({cmd:"alerts"})).items.some(a=>a.kind==="abandoned"),"one more than filed away comes back");
});
