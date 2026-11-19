// La Nuit du collage, storage: the rows only. The walls' cells (one flat array, see web/wall.mjs: a cell is a row, an empty
// cell has no row), who pasted each day (the active colleurs, the weekly score), the volunteers' daily budget, the closed
// nights and the weekly titles. Who may do what is the server's business. Plain node:sqlite; the tables are created here.
// Never BEGINs: the caller's transaction wraps what must be atomic. In the image it sits next to web/wall.mjs
// (the rules, /app/wall.mjs) and web/rules.mjs under their own names.
import * as R from "./rules.mjs";
import {settleWalls,weekOf,WALL_CELLS,MAX_WALLS} from "./wall.mjs";

const js=s=>{try{return JSON.parse(s);}catch{return null;}};
const dayOf=now=>R.dayKey(Math.floor(now/R.H));
const key=ms=>{const d=new Date(ms);return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();};
// The first and last day keys (YYYYMMDD) of a Monday-start week index (day 4 since 1970-01-01 is a Monday).
const weekDays=w=>[key((w*7+4)*864e5),key((w*7+10)*864e5)];
const toCell=r=>{
 const c={camp:r.camp,by:r.by,name:r.name,vol:!!r.vol,sol:r.sol,at:r.at,motif:r.motif};
 if(r.taken_from!=null){c.takenFrom=r.taken_from;c.takenAt=r.taken_at;}
 return c;
};

export function createWall(db){
 db.exec(`CREATE TABLE IF NOT EXISTS wall_cells(g INTEGER PRIMARY KEY,camp TEXT,by INTEGER,name TEXT,vol INTEGER,sol INTEGER,at INTEGER,taken_from TEXT,taken_at INTEGER,motif INTEGER);
CREATE TABLE IF NOT EXISTS wall_days(day INTEGER NOT NULL,player_id INTEGER NOT NULL,camp TEXT NOT NULL,pasted INTEGER NOT NULL DEFAULT 0,useful INTEGER NOT NULL DEFAULT 0,reached_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,player_id));
CREATE TABLE IF NOT EXISTS wall_vol(day INTEGER NOT NULL,camp TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,camp));
CREATE TABLE IF NOT EXISTS wall_nights(day INTEGER PRIMARY KEY,left_n INTEGER NOT NULL,right_n INTEGER NOT NULL,winners TEXT NOT NULL,paid INTEGER NOT NULL DEFAULT 0,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wall_titles(week INTEGER PRIMARY KEY,player_id INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wall_days_p ON wall_days(player_id);`);
 const q={
  all:db.prepare("SELECT * FROM wall_cells ORDER BY g"),
  put:db.prepare("INSERT OR REPLACE INTO wall_cells(g,camp,by,name,vol,sol,at,taken_from,taken_at,motif) VALUES(?,?,?,?,?,?,?,?,?,?)"),
  del:db.prepare("DELETE FROM wall_cells WHERE g=?"),
  clear:db.prepare("DELETE FROM wall_cells"),
  orphan:db.prepare("UPDATE wall_cells SET by=NULL,name='ancien élu' WHERE by=?"),
  note:db.prepare(`INSERT INTO wall_days(day,player_id,camp,pasted,useful,reached_at) VALUES(?,?,?,1,?,?)
   ON CONFLICT(day,player_id) DO UPDATE SET pasted=pasted+1,useful=useful+excluded.useful,reached_at=CASE WHEN excluded.useful>0 THEN excluded.reached_at ELSE reached_at END`),
  active:db.prepare("SELECT camp,COUNT(*) AS n FROM wall_days WHERE day=? GROUP BY camp"),
  who:db.prepare("SELECT player_id FROM wall_days WHERE day=? AND camp=? ORDER BY player_id"),
  vol:db.prepare("SELECT used FROM wall_vol WHERE day=? AND camp=?"),
  addVol:db.prepare("INSERT INTO wall_vol(day,camp,used) VALUES(?,?,?) ON CONFLICT(day,camp) DO UPDATE SET used=used+excluded.used"),
  night:db.prepare("SELECT 1 AS x FROM wall_nights WHERE day=?"),
  closeN:db.prepare("INSERT OR REPLACE INTO wall_nights(day,left_n,right_n,winners,paid,at) VALUES(?,?,?,?,?,?)"),
  last:db.prepare("SELECT MAX(day) AS d FROM wall_nights"),
  hist:db.prepare("SELECT * FROM wall_nights ORDER BY day DESC LIMIT ?"),
  week:db.prepare(`SELECT player_id,SUM(useful) AS useful,MAX(CASE WHEN useful>0 THEN reached_at END) AS reached_at FROM wall_days
   WHERE day BETWEEN ? AND ? GROUP BY player_id HAVING SUM(useful)>0 ORDER BY useful DESC,reached_at ASC,player_id ASC`),
  setT:db.prepare("INSERT OR REPLACE INTO wall_titles(week,player_id) VALUES(?,?)"),
  getT:db.prepare("SELECT player_id FROM wall_titles WHERE week=?"),
  delD:db.prepare("DELETE FROM wall_days WHERE player_id=?"),
  delT:db.prepare("DELETE FROM wall_titles WHERE player_id=?"),
 };
 // The stored cells as one flat array, as long as the last stored row needs; padded to whole walls.
 const load=()=>{
  const rows=q.all.all(),n=rows.length?Math.min(MAX_WALLS,Math.ceil((rows[rows.length-1].g+1)/WALL_CELLS))*WALL_CELLS:0,a=Array(n).fill(null);
  for(const r of rows)if(r.g<n&&r.camp!=null)a[r.g]=toCell(r);
  return a;
 };
 const write=c=>q.put.run(c.g,c.camp,c.by??null,c.name??null,c.vol?1:0,c.sol,c.at,c.takenFrom??null,c.takenAt??null,c.motif??0);
 const setCells=cells=>{
  q.clear.run();
  cells.forEach((c,g)=>{if(c)write({...c,g});});
 };
 return {
  // The settled walls at `now` (expired posters freed, walls opened or closed); the settled result is stored if it changed.
  cells(now){
   const before=load(),next=settleWalls(before,now).cells;
   if(JSON.stringify(before)!==JSON.stringify(next))setCells(next);
   return next;
  },
  paste(g,cell){if(cell)write({...cell,g});else q.del.run(g);},
  setCells,
  // One paste of a human colleur on a day: counted once more, and `useful` (a pose or a capture) for the weekly title.
  noteColleur(day,playerId,camp,useful,now){q.note.run(day,playerId,camp,useful?1:0,useful?now:0);},
  active(day){
   const o={left:0,right:0};
   for(const r of q.active.all(day))if(r.camp in o)o[r.camp]=r.n;
   return o;
  },
  colleurs:(day,camp)=>q.who.all(day,camp).map(r=>r.player_id),
  volunteerUsed:(day,camp)=>q.vol.get(day,camp)?.used??0,
  addVolunteerUsed(day,camp,n){q.addVol.run(day,camp,n|0);},
  nightClosed:day=>!!q.night.get(day),
  closeNight(day,{left,right,winners,paid}){q.closeN.run(day,left,right,JSON.stringify(winners??[]),paid|0,Date.now());},
  lastClosedDay:()=>q.last.get().d??null,
  // The weekly ranking: players with at least one useful paste that week, most first, the earliest to the score on a tie.
  week(weekKey){
   const [a,b]=weekDays(weekKey);
   return q.week.all(a,b).map(r=>({playerId:r.player_id,useful:r.useful,reachedAt:r.reached_at}));
  },
  setTitle(weekKey,playerId){q.setT.run(weekKey,playerId);},
  // The title worn now: the one of the week before the current one.
  title(now){
   const weekKey=weekOf(dayOf(now))-1,r=q.getT.get(weekKey);
   return r?{playerId:r.player_id,weekKey}:null;
  },
  // A deleted player: his posters stay (by null, « ancien élu »), his day and title rows go.
  removePlayer(playerId){q.orphan.run(playerId);q.delD.run(playerId);q.delT.run(playerId);},
  history:(limit=30)=>q.hist.all(Math.max(1,Math.min(500,limit|0))).map(r=>({day:r.day,left:r.left_n,right:r.right_n,winners:js(r.winners)??[],paid:r.paid,at:r.at})),
 };
}
