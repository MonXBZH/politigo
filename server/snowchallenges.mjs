// Trêve des confiseurs, the snowball challenges: a player re-deals one of his validated fights (its seed and score,
// which the server kept) to another, who has 24 h to play it once validated. The best score wins (+10 moral, given by
// the server, not here), a tie is a tie. Never XP, never FM. Plain node:sqlite; the table is created here.
// Statuses: "open", "done", "expired", "cancelled". Who may launch or play which one is the server's business; this
// module only keeps the rows, the daily cap and the one-open-per-pair rule.
import * as R from "./rules.mjs";

const dayOf=now=>R.dayKey(Math.floor(now/R.H));
const int=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const flagsOf=s=>{try{const f=JSON.parse(s||"[]");return Array.isArray(f)?f:[];}catch{return [];}};
const view=r=>r?{id:r.id,challenger:r.challenger,defender:r.defender,seed:r.seed,score:r.score,created:r.created,expires:r.expires,
 status:r.status,dScore:r.d_score??null,dFlags:r.d_score==null?null:flagsOf(r.d_flags),closed:r.closed??null,winner:r.winner??null}:null;

export function createChallenges(db,{perDay=3,ttl=864e5}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS snow_challenges(id INTEGER PRIMARY KEY,challenger INTEGER NOT NULL,defender INTEGER NOT NULL,
 seed INTEGER NOT NULL,score INTEGER NOT NULL,created INTEGER NOT NULL,day INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',
 d_score INTEGER,d_flags TEXT,closed INTEGER,winner INTEGER);
CREATE INDEX IF NOT EXISTS snow_challenges_open ON snow_challenges(status,expires);
CREATE INDEX IF NOT EXISTS snow_challenges_c ON snow_challenges(challenger,day);
CREATE INDEX IF NOT EXISTS snow_challenges_d ON snow_challenges(defender,status);`);
 const q={
  insert:db.prepare("INSERT INTO snow_challenges(challenger,defender,seed,score,created,day,expires) VALUES(?,?,?,?,?,?,?)"),
  get:db.prepare("SELECT * FROM snow_challenges WHERE id=?"),
  pair:db.prepare("SELECT 1 FROM snow_challenges WHERE status='open' AND ((challenger=? AND defender=?) OR (challenger=? AND defender=?)) LIMIT 1"),
  today:db.prepare("SELECT COUNT(*) AS n FROM snow_challenges WHERE challenger=? AND day=?"),
  finish:db.prepare("UPDATE snow_challenges SET status='done',d_score=?,d_flags=?,closed=?,winner=? WHERE id=? AND status='open'"),
  dueIds:db.prepare("SELECT id FROM snow_challenges WHERE status='open' AND expires<=? ORDER BY id"),
  ofIds:db.prepare("SELECT id FROM snow_challenges WHERE status='open' AND (challenger=? OR defender=?) ORDER BY id"),
  openIds:db.prepare("SELECT id FROM snow_challenges WHERE status='open' ORDER BY id"),
  close:db.prepare("UPDATE snow_challenges SET status=?,closed=? WHERE id=? AND status='open'"),
  received:db.prepare("SELECT * FROM snow_challenges WHERE defender=? AND status='open' AND expires>? ORDER BY id DESC"),
  sent:db.prepare("SELECT * FROM snow_challenges WHERE challenger=? AND (status='open' OR closed>=?) ORDER BY id DESC"),
  recent:db.prepare("SELECT * FROM snow_challenges ORDER BY id DESC LIMIT ?"),
  purge:db.prepare("DELETE FROM snow_challenges WHERE status<>'open' AND closed<?"),
 };
 // Every open one in `ids` gets `status`; returns those that really changed (a twin call closes nothing twice).
 const closeAll=(ids,status,now)=>ids.filter(id=>q.close.run(status,now,id).changes>0);
 return {
  open({challenger,defender,seed,score,now=Date.now()}){
   if(!int(challenger)||!int(defender))throw new Error("Joueur introuvable.");
   if(!int(seed,2**32-1)||!int(score)||!Number.isFinite(now))throw new Error("Défi invalide.");
   if(challenger===defender)throw new Error("Pas toi-même.");
   if(q.pair.get(challenger,defender,defender,challenger))throw new Error("Déjà un défi ouvert avec ce joueur.");
   const day=dayOf(now);
   if(q.today.get(challenger,day).n>=perDay)throw new Error(`${perDay} défis par jour.`);
   const {lastInsertRowid}=q.insert.run(challenger,defender,seed,score,now,day,now+ttl);
   return {id:Number(lastInsertRowid)};
  },
  get:id=>int(id)?view(q.get.get(id)):null,
  // Received: open and not past its time. Sent: open, or closed within ttl (its result).
  forDefender:(id,now=Date.now())=>q.received.all(id,now).map(view),
  forChallenger:(id,now=Date.now())=>q.sent.all(id,now-ttl).map(view),
  // The defender's score against the challenger's (flags: the defender's game, for the admin). null: not open.
  finish(id,defenderScore,now=Date.now(),flags=[]){
   const r=int(id)&&q.get.get(id);
   if(!r||r.status!=="open"||!int(defenderScore))return null;
   const tie=defenderScore===r.score,winner=tie?null:defenderScore>r.score?r.defender:r.challenger;
   const f=JSON.stringify((Array.isArray(flags)?flags:[]).filter(x=>typeof x==="string").map(x=>x.slice(0,24)).slice(0,8));
   if(!q.finish.run(defenderScore,f,now,winner,id).changes)return null;
   return {winner,tie};
  },
  expire:(now=Date.now())=>closeAll(q.dueIds.all(now).map(r=>r.id),"expired",now),
  cancelOf:(playerId,now=Date.now())=>closeAll(q.ofIds.all(playerId,playerId).map(r=>r.id),"cancelled",now),
  cancelAll:(now=Date.now())=>closeAll(q.openIds.all().map(r=>r.id),"cancelled",now),
  recent:(limit=50)=>q.recent.all(Math.max(1,Math.min(500,limit|0))).map(view),
  purge:cut=>q.purge.run(cut).changes,
 };
}
