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
