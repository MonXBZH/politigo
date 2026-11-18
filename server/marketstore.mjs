// La Brocante, player trading: the rows only. A listing (what its owner gives, what he wants), offers on it, the trades
// done, and a daily count per player. give/want are already-clean JSON (web/market.mjs cleans, the server checks); who may
// do what is the server's business. Plain node:sqlite; the tables are created here. Never BEGINs: trade() runs inside the
// caller's transaction. In the image it sits next to web/market.mjs (the rules, /app/market.mjs) under its own name.
// Statuses: listing "open"|"traded"|"withdrawn"|"closed"; offer "pending"|"accepted"|"refused"|"closed"|"withdrawn".
import * as R from "./rules.mjs";

const dayOf=now=>R.dayKey(Math.floor(now/R.H));
const js=s=>{try{return JSON.parse(s);}catch{return null;}};
const L=r=>r?{...r,give:js(r.give),want:js(r.want)}:null;
const O=r=>r?{...r,give:js(r.give)}:null;
const T=r=>r?{...r,a_gave:js(r.a_gave),b_gave:js(r.b_gave)}:null;
// The ids of an item list in a give/want value: matched on the id as a whole JSON string, not a substring of another.
const ids=v=>{const out=new Set(),walk=x=>{if(typeof x==="string")out.add(x);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==="object")Object.values(x).forEach(walk);};walk(v);return out;};
// A dead listing older than the cut (?): withdrawn or closed, never traded (a trade keeps its listing for the history).
const DEAD="status IN ('withdrawn','closed') AND created<? AND id NOT IN (SELECT listing_id FROM market_trades)";
const uses=(v,items)=>{const s=ids(v);return items.some(i=>s.has(i));};

export function createMarket(db){
 db.exec(`CREATE TABLE IF NOT EXISTS market_listings(id INTEGER PRIMARY KEY AUTOINCREMENT,player_id INTEGER NOT NULL,give TEXT NOT NULL,want TEXT NOT NULL,
 created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open');
CREATE TABLE IF NOT EXISTS market_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id INTEGER NOT NULL,player_id INTEGER NOT NULL,give TEXT NOT NULL,
 created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS market_trades(id INTEGER PRIMARY KEY,listing_id INTEGER NOT NULL,offer_id INTEGER,a_id INTEGER NOT NULL,b_id INTEGER NOT NULL,
 a_gave TEXT NOT NULL,b_gave TEXT NOT NULL,same_net INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS market_daily(day INTEGER NOT NULL,player_id INTEGER NOT NULL,n INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,player_id));
CREATE INDEX IF NOT EXISTS market_listings_s ON market_listings(status,id);
CREATE INDEX IF NOT EXISTS market_listings_p ON market_listings(player_id,status);
CREATE INDEX IF NOT EXISTS market_offers_l ON market_offers(listing_id,status);
CREATE INDEX IF NOT EXISTS market_offers_p ON market_offers(player_id,status);`);
 const q={
  insL:db.prepare("INSERT INTO market_listings(player_id,give,want,created) VALUES(?,?,?,?)"),
  getL:db.prepare("SELECT * FROM market_listings WHERE id=?"),
  openL:db.prepare("SELECT * FROM market_listings WHERE status='open' ORDER BY id DESC"),
  mineL:db.prepare("SELECT * FROM market_listings WHERE player_id=? ORDER BY id DESC"),
  openOfL:db.prepare("SELECT * FROM market_listings WHERE player_id=? AND status='open' ORDER BY id"),
  setL:db.prepare("UPDATE market_listings SET status=? WHERE id=? AND status='open'"),
  withdraw:db.prepare("UPDATE market_listings SET status='withdrawn' WHERE id=? AND player_id=? AND status='open'"),
  openCount:db.prepare("SELECT COUNT(*) AS n FROM market_listings WHERE player_id=? AND status='open'"),
  insO:db.prepare("INSERT INTO market_offers(listing_id,player_id,give,created) VALUES(?,?,?,?)"),
  getO:db.prepare("SELECT * FROM market_offers WHERE id=?"),
  onO:db.prepare("SELECT * FROM market_offers WHERE listing_id=? ORDER BY id"),
  pendO:db.prepare("SELECT * FROM market_offers WHERE player_id=? AND status='pending' ORDER BY id"),
  setO:db.prepare("UPDATE market_offers SET status=? WHERE id=? AND status='pending'"),
  closeOn:db.prepare("UPDATE market_offers SET status='closed' WHERE listing_id=? AND status='pending'"),
  pendCount:db.prepare("SELECT COUNT(*) AS n FROM market_offers WHERE player_id=? AND status='pending'"),
  pendOn:db.prepare("SELECT COUNT(*) AS n FROM market_offers WHERE listing_id=? AND player_id=? AND status='pending'"),
  insT:db.prepare("INSERT INTO market_trades(listing_id,offer_id,a_id,b_id,a_gave,b_gave,same_net,created) VALUES(?,?,?,?,?,?,?,?)"),
  recent:db.prepare("SELECT * FROM market_trades ORDER BY id DESC LIMIT ?"),
  bump:db.prepare("INSERT INTO market_daily(day,player_id,n) VALUES(?,?,1) ON CONFLICT(day,player_id) DO UPDATE SET n=n+1"),
  today:db.prepare("SELECT n FROM market_daily WHERE day=? AND player_id=?"),
  pendOnL:db.prepare("SELECT * FROM market_offers WHERE listing_id=? AND status='pending' ORDER BY id"),
  byLim:db.prepare("SELECT * FROM market_offers WHERE player_id=? AND (status='pending' OR id IN (SELECT id FROM market_offers WHERE player_id=? ORDER BY id DESC LIMIT ?)) ORDER BY id DESC"),
  ofLP:db.prepare("SELECT * FROM market_offers WHERE listing_id=? AND player_id=? ORDER BY id DESC LIMIT 20"),
  refused:db.prepare("SELECT COUNT(*) AS n FROM market_offers WHERE listing_id=? AND player_id=? AND status='refused'"),
  since:db.prepare("SELECT created FROM market_offers WHERE player_id=? AND created>=? ORDER BY id DESC LIMIT 100"),
  // Decided offers go once their listing is no longer open (a refusal on an open listing still blocks a re-offer).
  purgeO:db.prepare("DELETE FROM market_offers WHERE status IN ('withdrawn','refused','closed') AND created<? AND listing_id NOT IN (SELECT id FROM market_listings WHERE status='open')"),
  purgeOfL:db.prepare(`DELETE FROM market_offers WHERE listing_id IN (SELECT id FROM market_listings WHERE ${DEAD})`),
  purgeL:db.prepare(`DELETE FROM market_listings WHERE ${DEAD}`),
  purgeD:db.prepare("DELETE FROM market_daily WHERE day<?"),
 };
 const closeO=id=>q.setO.run("closed",id).changes>0;
 return {
  list:(playerId,give,want,now=Date.now())=>Number(q.insL.run(playerId,JSON.stringify(give),JSON.stringify(want),now).lastInsertRowid),
  listing:id=>L(q.getL.get(id)),
  openListings:()=>q.openL.all().map(L),
  mine:playerId=>q.mineL.all(playerId).map(L),
  withdraw(id,playerId){
   if(!q.withdraw.run(id,playerId).changes)return false;
   q.closeOn.run(id);return true;
  },
  offer:(listingId,playerId,give,now=Date.now())=>Number(q.insO.run(listingId,playerId,JSON.stringify(give),now).lastInsertRowid),
  offerOf:id=>O(q.getO.get(id)),
  offersOn:listingId=>q.onO.all(listingId).map(O),
  // The player's pending offers and the `limit` latest ones, newest first.
  offersBy:(playerId,limit=20)=>q.byLim.all(playerId,playerId,Math.max(0,limit|0)).map(O),
  openOf:playerId=>q.openOfL.all(playerId).map(L),
  pendingOffersOn:listingId=>q.pendOnL.all(listingId).map(O),
  offersOf:(listingId,playerId)=>q.ofLP.all(listingId,playerId).map(O),   // the latest 20, newest first
  refusedOn:(listingId,playerId)=>q.refused.get(listingId,playerId).n,
  createdSince:(playerId,since)=>q.since.all(playerId,since).map(r=>r.created),
  // Decided rows older than `before` go (offers withdrawn, refused or closed; listings withdrawn or closed and never
  // traded) and the daily counts of older days. Trades, traded listings and accepted offers stay: the admin's history.
  purge(before){
   // A purged listing takes all its offers along: no later row can ever hang on its id (ids are AUTOINCREMENT, never reused).
   const offers=Number(q.purgeOfL.run(before).changes)+Number(q.purgeO.run(before).changes);
   const listings=Number(q.purgeL.run(before).changes),daily=Number(q.purgeD.run(dayOf(before)).changes);
   return {listings,offers,daily};
  },
  setOffer:(id,status)=>q.setO.run(status,id).changes>0,
  // One trade: the listing is traded, the chosen offer accepted, the other pending ones closed, both players counted for the day.
  trade({listingId,offerId=null,aId,bId,aGave,bGave,sameNet=false,now=Date.now()}){
   // Checked before any write: the caller's transaction rolls back on the throw.
   const o=offerId==null?null:q.getO.get(offerId);
   if(q.getL.get(listingId)?.status!=="open")throw new Error("Annonce indisponible.");
   if(offerId!=null&&(o?.listing_id!==listingId||o.status!=="pending"))throw new Error("Offre indisponible.");
   if(q.setL.run("traded",listingId).changes!==1)throw new Error("Annonce indisponible.");
   if(offerId!=null&&q.setO.run("accepted",offerId).changes!==1)throw new Error("Offre indisponible.");
   q.closeOn.run(listingId);
   const day=dayOf(now);q.bump.run(day,aId);q.bump.run(day,bId);
   return Number(q.insT.run(listingId,offerId,aId,bId,JSON.stringify(aGave),JSON.stringify(bGave),sameNet?1:0,now).lastInsertRowid);
  },
  today:(playerId,day)=>q.today.get(day,playerId)?.n??0,
  // The player's open listings / pending offers that hold any of these items are closed (an item left his hands).
  closeUsing(playerId,itemIds){
   const out={listings:[],offers:[]};
   if(!Array.isArray(itemIds)||!itemIds.length)return out;
   for(const l of q.openOfL.all(playerId))if(uses(js(l.give),itemIds)&&q.setL.run("closed",l.id).changes){q.closeOn.run(l.id);out.listings.push(l.id);}
   for(const o of q.pendO.all(playerId))if(uses(js(o.give),itemIds)&&closeO(o.id))out.offers.push(o.id);
   return out;
  },
  // A deleted player: his open listings are closed, his pending offers and the pending offers on his listings too.
  removePlayer(playerId){
   for(const l of q.openOfL.all(playerId)){q.setL.run("closed",l.id);q.closeOn.run(l.id);}
   for(const o of q.pendO.all(playerId))closeO(o.id);
  },
  recent:(limit=50)=>q.recent.all(Math.max(1,Math.min(500,limit|0))).map(T),
  openCount:playerId=>q.openCount.get(playerId).n,
  pendingCount:playerId=>q.pendCount.get(playerId).n,
  pendingOn:(listingId,playerId)=>q.pendOn.get(listingId,playerId).n,
 };
}
