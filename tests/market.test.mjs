// La Brocante, the storage (server/market.mjs): listings, offers, trades and the daily count, on a throwaway database.
import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {dayKey} from "../web/rules.mjs";

const MK=await import(process.env.MARKETDB||"/app/marketstore.mjs");
const H=3600e3,NOW=Date.UTC(2026,10,18,12);
const fresh=()=>{const db=new DatabaseSync(":memory:");return {db,M:MK.createMarket(db)};};
const G={items:["a1"]},W={items:["b1"]};

test("list, read and withdraw by the owner only",()=>{
 const {M}=fresh();
 const id=M.list(1,G,W,NOW);
 assert.equal(typeof id,"number");
 const l=M.listing(id);
 assert.deepEqual([l.player_id,l.status,l.created],[1,"open",NOW]);
 assert.deepEqual(l.give,G);assert.deepEqual(l.want,W);
 assert.equal(M.listing(999),null);
 assert.equal(M.openListings().length,1);
 assert.equal(M.openCount(1),1);assert.equal(M.openCount(2),0);
 assert.equal(M.withdraw(id,2,NOW),false);
 assert.equal(M.listing(id).status,"open");
 assert.equal(M.withdraw(id,1,NOW),true);
 assert.equal(M.withdraw(id,1,NOW),false);
 assert.equal(M.listing(id).status,"withdrawn");
 assert.equal(M.openListings().length,0);
 assert.equal(M.mine(1).length,1);
});

test("offer lifecycle: pending, counts, setOffer only from pending",()=>{
 const {M}=fresh();
 const l=M.list(1,G,W,NOW),o=M.offer(l,2,{items:["b1"]},NOW+1);
 assert.deepEqual(M.offerOf(o).give,{items:["b1"]});
 assert.equal(M.offerOf(o).status,"pending");
 assert.equal(M.offersOn(l).length,1);assert.equal(M.offersBy(2).length,1);assert.equal(M.offersBy(1).length,0);
 assert.equal(M.pendingCount(2),1);assert.equal(M.pendingOn(l,2),1);assert.equal(M.pendingOn(l,3),0);
 assert.equal(M.setOffer(o,"refused"),true);
 assert.equal(M.setOffer(o,"withdrawn"),false);
 assert.equal(M.offerOf(o).status,"refused");
 assert.equal(M.pendingCount(2),0);
});

test("trade closes the others and counts both players for the day",()=>{
 const {db,M}=fresh();
 const l=M.list(1,G,W,NOW),o1=M.offer(l,2,{items:["b1"]},NOW),o2=M.offer(l,3,{items:["c1"]},NOW);
 db.exec("BEGIN");
 const t=M.trade({listingId:l,offerId:o1,aId:1,bId:2,aGave:G,bGave:{items:["b1"]},sameNet:true,now:NOW});
 db.exec("COMMIT");
 assert.equal(M.listing(l).status,"traded");
 assert.equal(M.offerOf(o1).status,"accepted");assert.equal(M.offerOf(o2).status,"closed");
 const d=dayKey(Math.floor(NOW/H));
 assert.deepEqual([M.today(1,d),M.today(2,d),M.today(3,d)],[1,1,0]);
 const r=M.recent(10);
 assert.equal(r.length,1);assert.equal(r[0].id,t);
 assert.deepEqual(r[0].a_gave,G);assert.deepEqual(r[0].b_gave,{items:["b1"]});assert.equal(r[0].same_net,1);
 M.trade({listingId:M.list(1,G,W,NOW),offerId:null,aId:1,bId:2,aGave:G,bGave:W,sameNet:false,now:NOW});
 assert.equal(M.today(1,d),2);
});

test("trade can be rolled back by the caller",()=>{
 const {db,M}=fresh();
 const l=M.list(1,G,W,NOW);
 db.exec("BEGIN");
 M.trade({listingId:l,offerId:null,aId:1,bId:2,aGave:G,bGave:W,sameNet:false,now:NOW});
 db.exec("ROLLBACK");
 assert.equal(M.listing(l).status,"open");assert.equal(M.recent(5).length,0);
});

test("closeUsing closes only that player's matching rows",()=>{
 const {M}=fresh();
 const l1=M.list(1,{items:["a1"]},W,NOW),l2=M.list(1,{items:["a2"]},W,NOW),l3=M.list(2,{items:["a1"]},W,NOW);
 const o1=M.offer(l3,1,{items:["a1","a3"]},NOW),o2=M.offer(l3,1,{items:["a4"]},NOW),o3=M.offer(l1,2,{items:["a1"]},NOW);
 const r=M.closeUsing(1,["a1"]);
 assert.deepEqual(r,{listings:[l1],offers:[o1]});
 assert.equal(M.listing(l1).status,"closed");assert.equal(M.listing(l2).status,"open");assert.equal(M.listing(l3).status,"open");
 assert.equal(M.offerOf(o1).status,"closed");assert.equal(M.offerOf(o2).status,"pending");assert.equal(M.offerOf(o3).status,"closed");// pending offer on the closed listing l1
 assert.deepEqual(M.closeUsing(1,[]),{listings:[],offers:[]});
});

test("removePlayer closes their listings and offers, and offers on their listings",()=>{
 const {M}=fresh();
 const l1=M.list(1,G,W,NOW),l2=M.list(2,G,W,NOW);
 const o1=M.offer(l2,1,W,NOW),o2=M.offer(l1,2,W,NOW),o3=M.offer(l2,3,W,NOW);
 M.removePlayer(1);
 assert.equal(M.listing(l1).status,"closed");assert.equal(M.listing(l2).status,"open");
 assert.equal(M.offerOf(o1).status,"closed");assert.equal(M.offerOf(o2).status,"closed");assert.equal(M.offerOf(o3).status,"pending");
 assert.equal(M.openCount(1),0);
});

test("creating the module twice on one database is idempotent",()=>{
 const db=new DatabaseSync(":memory:");
 const a=MK.createMarket(db),id=a.list(1,G,W,NOW),b=MK.createMarket(db);
 assert.equal(b.listing(id).status,"open");
});

const rows=(db,t)=>db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const tr=(l,o)=>({listingId:l,offerId:o,aId:1,bId:2,aGave:G,bGave:W,sameNet:false,now:NOW});
const refuses=(db,M,l,o)=>{
 assert.throws(()=>M.trade(tr(l,o)),Error);
 assert.equal(rows(db,"market_trades"),0);assert.equal(rows(db,"market_daily"),0);
};

test("trade refuses a withdrawn, closed or already traded listing, writing nothing",()=>{
 const {db,M}=fresh();
 const w=M.list(1,G,W,NOW);M.withdraw(w,1);refuses(db,M,w,null);
 const c=M.list(1,G,W,NOW);M.closeUsing(1,["a1"]);refuses(db,M,c,null);
 const t=M.list(1,{items:["z"]},W,NOW);
 M.trade(tr(t,null));
 const n=rows(db,"market_trades");
 assert.throws(()=>M.trade(tr(t,null)),Error);
 assert.equal(rows(db,"market_trades"),n);assert.equal(M.today(1,dayKey(Math.floor(NOW/H))),1);
});

test("trade refuses a non-pending offer or one of another listing, leaving the listing open",()=>{
 const {db,M}=fresh();
 const l=M.list(1,G,W,NOW),l2=M.list(1,G,W,NOW);
 const o=M.offer(l,2,W,NOW);M.setOffer(o,"refused");
 refuses(db,M,l,o);
 const o2=M.offer(l2,2,W,NOW);
 refuses(db,M,l,o2);
 assert.equal(M.listing(l).status,"open");assert.equal(M.offerOf(o2).status,"pending");
});

test("withdraw and closeUsing close the pending offers on the listings they close",()=>{
 const {M}=fresh();
 const l1=M.list(1,{items:["a1"]},W,NOW),l2=M.list(1,{items:["a2"]},W,NOW);
 const o1=M.offer(l1,2,W,NOW),o2=M.offer(l2,2,W,NOW);
 assert.equal(M.withdraw(l1,1),true);
 assert.equal(M.offerOf(o1).status,"closed");assert.equal(M.offerOf(o2).status,"pending");
 M.closeUsing(1,["a2"]);
 assert.equal(M.offerOf(o2).status,"closed");
 assert.equal(M.withdraw(l1,2),false);
});

test("bounded reads: open listings of a player, pending offers on a listing, offers by a player capped",()=>{
 const {M}=fresh();
 const l1=M.list(1,{items:["a1"]},W,NOW),l2=M.list(1,{items:["a2"]},W,NOW);M.withdraw(l2,1);
 assert.deepEqual(M.openOf(1).map(l=>l.id),[l1]);assert.deepEqual(M.openOf(1)[0].give,{items:["a1"]});
 const p=M.offer(l1,2,W,NOW),r=M.offer(l1,3,W,NOW);M.setOffer(r,"refused");
 assert.deepEqual(M.pendingOffersOn(l1).map(o=>o.id),[p]);
 // 30 decided offers and one old pending one: the pending one always, then the latest decided, newest first
 const old=M.offer(l1,9,W,NOW);
 const ids=[];for(let i=0;i<30;i++){const o=M.offer(l1,9,W,NOW+i);M.setOffer(o,"withdrawn");ids.push(o);}
 const by=M.offersBy(9,20);
 assert.equal(by.length,21);assert.ok(by.some(o=>o.id===old));
 assert.deepEqual(by.filter(o=>o.id!==old).map(o=>o.id),ids.slice(-20).reverse());
 assert.equal(M.offersBy(9).length,21,"20 by default");
 // a player's offers on one listing (newest first), refused count, created times since a moment
 assert.equal(M.offersOf(l1,9).length,20,"bounded");assert.equal(M.offersOf(l1,9)[0].id,ids.at(-1));
 assert.equal(M.refusedOn(l1,3),1);assert.equal(M.refusedOn(l1,2),0);
 assert.equal(M.createdSince(9,NOW+25).length,5);
});

test("purge: decided offers and dead listings older than the cut go, trades and traded listings stay",()=>{
 const {db,M}=fresh();
 const OLD=NOW-40*864e5,CUT=NOW-30*864e5;
 const lw=M.list(1,{items:["a1"]},W,OLD);M.withdraw(lw,1);
 const lc=M.list(1,{items:["a2"]},W,OLD);M.closeUsing(1,["a2"]);
 const lo=M.list(1,{items:["a3"]},W,OLD);                       // open: stays
 const lt=M.list(1,{items:["a4"]},W,OLD),ot=M.offer(lt,2,W,OLD),ox=M.offer(lt,3,W,OLD);
 db.exec("BEGIN");M.trade({listingId:lt,offerId:ot,aId:1,bId:2,aGave:{items:["a4"]},bGave:W,now:OLD});db.exec("COMMIT");   // ox closed
 const op=M.offer(lo,4,W,OLD),or=M.offer(lo,5,W,OLD);M.setOffer(or,"refused");
 const fresh1=M.offer(lo,6,W,NOW);M.setOffer(fresh1,"withdrawn");   // recent: stays
 const n=M.purge(CUT);
 assert.equal(M.listing(lw),null);assert.equal(M.listing(lc),null);
 assert.ok(M.listing(lo));assert.ok(M.listing(lt),"a traded listing stays (history)");
 assert.equal(M.offerOf(ox),null);assert.ok(M.offerOf(or),"a refusal on a listing still open stays (it blocks a re-offer)");
 assert.ok(M.offerOf(ot),"the accepted offer stays");assert.ok(M.offerOf(op),"pending stays");assert.ok(M.offerOf(fresh1),"recent stays");
 assert.equal(M.recent(10).length,1,"trades are never purged");
 assert.equal(M.today(1,dayKey(Math.floor(OLD/H))),0,"old daily counts go");
 assert.deepEqual(n,{listings:2,offers:1,daily:2});
});

test("purge: a new listing never reuses a purged id nor sees its offers",()=>{
 const {M}=fresh();
 const OLD=NOW-40*864e5,CUT=NOW-30*864e5;
 M.list(1,{items:["a1"]},W,OLD);
 const gone=M.list(1,{items:["a2"]},W,OLD);                          // the highest id, purged below
 const late=M.offer(gone,7,W,NOW);M.setOffer(late,"refused");       // decided recently, on that old listing
 const ol=M.offer(999999,8,W,OLD);M.setOffer(ol,"withdrawn");        // the highest offer id, purged too
 M.withdraw(gone,1);
 M.purge(CUT);
 assert.equal(M.listing(gone),null);assert.equal(M.offerOf(late),null,"the offers of a purged listing go with it");
 const next=M.list(2,{items:["a3"]},W,NOW);
 assert.ok(next>gone,`listing id ${next} reused (purged ${gone})`);
 assert.equal(M.offersOf(next,7).length,0);assert.equal(M.refusedOn(next,7),0);assert.equal(M.pendingOffersOn(next).length,0);
 assert.ok(M.offer(next,9,W,NOW)>ol,"offer ids are never reused either");
});

test("purge: a refused offer on a listing still open survives, closed and withdrawn ones on it too",()=>{
 const {M}=fresh();
 const OLD=NOW-40*864e5;
 const l=M.list(1,{items:["a1"]},W,OLD),r=M.offer(l,2,W,OLD),w=M.offer(l,3,W,OLD);M.setOffer(r,"refused");M.setOffer(w,"withdrawn");
 M.purge(NOW-30*864e5);
 assert.ok(M.offerOf(r));assert.ok(M.offerOf(w));assert.equal(M.refusedOn(l,2),1);
});
