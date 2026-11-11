// The check of a backup (admin/backups.mjs), in a child process: PRAGMA quick_check on a big base takes its time and
// cannot be interrupted from inside Node (a worker's terminate() waits for SQLite), so it runs apart and is killed
// (SIGKILL) when it takes too long. Usage: node verify.mjs <path>; prints {ok} or {ok:false, error} on one line.
// The copy is opened read-only and immutable (file: URI): SQLite writes nothing next to it, no -shm nor -wal.
// Absent node:sqlite: nothing to check with, the size check stands alone.
import {pathToFileURL} from "node:url";

let out;
try{
 const sqlite=await import("node:sqlite").catch(()=>null);
 if(!sqlite)out={ok:true,skipped:true};
 else{
  const u=pathToFileURL(process.argv[2]);u.searchParams.set("immutable","1");
  const db=new sqlite.DatabaseSync(u,{readOnly:true});
  try{
   const r=db.prepare("PRAGMA quick_check").get();if(r?.quick_check!=="ok")throw new Error(`base abîmée (${String(r?.quick_check).slice(0,80)})`);
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='players'").get())throw new Error("table players absente");
  }finally{db.close();}
  out={ok:true};
 }
}catch(e){out={ok:false,error:String(e?.message||e).slice(0,200)};}
process.stdout.write(JSON.stringify(out)+"\n");
