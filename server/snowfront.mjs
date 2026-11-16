// Trêve des confiseurs, the Front de neige: every snowball fight the server replayed adds its score to its player's
// camp, for the year's réveillon; the Front closes at New Year's midnight (server time) and the winning camp's players
// who fought at least once get their bulletins (paid by the server, not here). Also the midnight toast's window.
// Plain node:sqlite; the tables are created here. Every write is a SAVEPOINT: inside the caller's transaction it
// commits or rolls back with it, alone it is its own transaction.
import * as R from "./rules.mjs";

const CAMPS=["left","right"];
const MIN=60e3,TOAST_MS=5*MIN;

export const winnerOf=({left,right})=>left>right?"left":right>left?"right":"tie";

// ---- the calendar, in the server's time zone (R.timeZone()). `at` (POLITIGO_NEWYEAR_AT, a test server only) replaces
// 1 Jan 00:00: then every instant belongs to the same réveillon, the one `at` closes.
let fmt=null,fmtTz="";
function wall(ms){
 if(!fmt||fmtTz!==R.timeZone()){fmtTz=R.timeZone();fmt=new Intl.DateTimeFormat("en-GB",{timeZone:fmtTz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});}
 const o={};for(const x of fmt.formatToParts(ms))if(x.type!=="literal")o[x.type]=Number(x.value);
 return o;
}
// The instant showing that wall time (twice: the offset at the first guess may differ on a DST day).
function wallToUtc(y,mo,d,h=0,mi=0){
 const want=Date.UTC(y,mo-1,d,h,mi);let t=want;
 for(let i=0;i<2;i++){const w=wall(t);t+=want-Date.UTC(w.year,w.month-1,w.day,w.hour,w.minute);}
 return t;
}
const testAt=at=>Number.isFinite(at)?at:null;
// The réveillon an instant belongs to: December counts for its year, January (1 Jan included) for the year before.
export function frontYear(ms,at=null){
 if(testAt(at)!==null)return frontYear(at-1);
 const w=wall(ms);return w.month===1?w.year-1:w.year;
}
// When that year's Front closes: 1 Jan 00:00 of the next year.
export const closingAt=(year,at=null)=>testAt(at)??wallToUtc(year+1,1,1);
// The banner's end: 2 Jan 00:00 (the test instant + 24 h).
const bannerEnd=(year,at=null)=>testAt(at)!==null?at+24*60*MIN:wallToUtc(year+1,1,2);
// on: the toast, 1 Jan 00:00 to 00:05; banner: from 00:05 to 2 Jan 00:00.
export function newYearWindow(ms,at=null){
 const y=frontYear(ms,at),c=closingAt(y,at);
 return {on:ms>=c&&ms<c+TOAST_MS,banner:ms>=c+TOAST_MS&&ms<bannerEnd(y,at)};
}
export const toastEnd=(year,at=null)=>closingAt(year,at)+TOAST_MS;

// ---- the counter. A player is paid for the camp he FOUGHT for (kept with each fight), whatever his camp at the
// closing; one who fought for both camps is paid once if either won. exists(id): false for a deleted player (skipped).
// (campOf(id), the first version's option, still works as "exists": a deleted player has no camp.)
// A fight brings perFight points at most, and a player perDay a server day (whatever the camp): what a script farms
// beyond that is dropped. The day's allowance is spent in the same write as the points (snowfront_daily).
export function createSnowFront(db,{exists,campOf,perFight=120,perDay=400}={}){
 const alive=exists??(campOf?id=>campOf(id)!=null:()=>true);
 db.exec(`CREATE TABLE IF NOT EXISTS snowfront(year INTEGER NOT NULL,camp TEXT NOT NULL,points INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(year,camp));
CREATE TABLE IF NOT EXISTS snowfront_players(year INTEGER NOT NULL,player_id INTEGER NOT NULL,camp TEXT NOT NULL,PRIMARY KEY(year,player_id,camp));
CREATE TABLE IF NOT EXISTS snowfront_results(year INTEGER PRIMARY KEY,winner TEXT NOT NULL,left_pts INTEGER NOT NULL,right_pts INTEGER NOT NULL,t INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS snowfront_daily(day INTEGER NOT NULL,player_id INTEGER NOT NULL,pts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,player_id));`);
 const q={
  addPts:db.prepare("INSERT INTO snowfront(year,camp,points) VALUES(?,?,?) ON CONFLICT(year,camp) DO UPDATE SET points=points+excluded.points"),
  addPlayer:db.prepare("INSERT OR IGNORE INTO snowfront_players(year,player_id,camp) VALUES(?,?,?)"),
  totals:db.prepare("SELECT camp,points FROM snowfront WHERE year=?"),
  winners:db.prepare("SELECT DISTINCT player_id AS id FROM snowfront_players WHERE year=? AND camp IN (?,?) ORDER BY player_id"),
  last:db.prepare("SELECT MAX(year) AS y FROM snowfront"),
  result:db.prepare("SELECT winner,left_pts,right_pts FROM snowfront_results WHERE year=?"),
  close:db.prepare("INSERT INTO snowfront_results(year,winner,left_pts,right_pts,t) VALUES(?,?,?,?,?)"),
  spent:db.prepare("SELECT pts FROM snowfront_daily WHERE day=? AND player_id=?"),
  spend:db.prepare("INSERT INTO snowfront_daily(day,player_id,pts) VALUES(?,?,?) ON CONFLICT(day,player_id) DO UPDATE SET pts=pts+excluded.pts"),
 };
 let sp=0;
 function atomic(fn){
  const name=`snowfront_${++sp}`;db.exec(`SAVEPOINT ${name}`);
  try{const out=fn();db.exec(`RELEASE ${name}`);return out;}
  catch(e){try{db.exec(`ROLLBACK TO ${name}`);db.exec(`RELEASE ${name}`);}catch{}throw e;}
 }
 const okYear=y=>Number.isInteger(y)&&y>=2000&&y<=9999;
 function totals(year){
  const o={left:0,right:0};
  if(!okYear(year))return o;
  for(const r of q.totals.all(year))if(CAMPS.includes(r.camp))o[r.camp]=Number(r.points);
  return o;
 }
 function result(year){
  if(!okYear(year))return null;
  const r=q.result.get(year);return r?{winner:r.winner,left:Number(r.left_pts),right:Number(r.right_pts)}:null;
 }
 // False when nothing was added: an unknown camp, a score that is not a whole number >= 0, a year already closed.
 // day: the server day of the fight (R.dayKey), for the player's daily allowance (without it, only the fight's cap).
 // A fight past the allowance still counts as played (the player is paid if his camp wins), for 0 points.
 // put(): the points really added (null: nothing added); add(): whether it was added.
 function put(year,camp,playerId,points,day=null){
  if(!okYear(year)||!CAMPS.includes(camp)||!Number.isSafeInteger(playerId)||!Number.isSafeInteger(points)||points<0)return null;
  return atomic(()=>{
   if(q.result.get(year))return null;
   let pts=Math.min(points,perFight);
   if(Number.isSafeInteger(day)){
    const left=Math.max(0,perDay-Number(q.spent.get(day,playerId)?.pts??0));
    pts=Math.min(pts,left);q.spend.run(day,playerId,pts);
   }
   q.addPts.run(year,camp,pts);q.addPlayer.run(year,playerId,camp);
   return pts;
  });
 }
 const add=(...a)=>put(...a)!==null;
 // Once per year: the result is kept, and the ids to pay come back only from the call that closed it (the caller pays
 // them in the same transaction, so a crash pays nobody twice). A tie pays both camps.
 function close(year,now=Date.now()){
  if(!okYear(year))throw new RangeError("snowfront: bad year");
  return atomic(()=>{
   const done=result(year);if(done)return {...done,paid:[]};
   const t=totals(year),winner=winnerOf(t),win=winner==="tie"?CAMPS:[winner];
   const paid=q.winners.all(year,win[0],win.at(-1)).map(r=>Number(r.id)).filter(id=>alive(id));
   q.close.run(year,winner,t.left,t.right,now);
   return {winner,left:t.left,right:t.right,paid};
  });
 }
 // The most recent year anybody fought in, when it was never closed (a server down through January); else null.
 function lastOpen(){const y=q.last.get()?.y;return Number.isInteger(y)&&!q.result.get(y)?y:null;}
 return {add,put,totals,result,close,lastOpen};
}
