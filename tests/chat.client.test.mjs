// Tests for the browser side of the chat: the pure helpers of web/chat.mjs (node --test, no DOM, no server).
import {test} from "node:test";
import assert from "node:assert/strict";
import * as C from "../web/chat.mjs";

const msg=(id,extra={})=>({id,t:1_700_000_000_000+id*1000,room:"global",author:{name:`J${id}`,camp:"left"},mine:false,text:`m${id}`,media:null,...extra});

test("the module loads without a DOM and exports its constants",()=>{
 assert.deepEqual(C.ROOMS,["global","camp"]);
 assert.equal(C.MAX_TEXT,500);assert.equal(C.MEDIA_MAX,2*1024*1024);
 assert.deepEqual(C.MEDIA_TYPES,["image/gif","image/png","image/jpeg","image/webp"]);
 assert.equal(typeof C.createChat,"function");
});

test("cleanText: NFC, no control/bidi/invisible marks, ZWJ kept, blank lines collapsed, trimmed",()=>{
 assert.equal(C.cleanText("  été  "),"été");
 assert.equal(C.cleanText("a‮b​c⁦d﻿"),"abcd");
 assert.equal(C.cleanText("a\u0007b\u0000c"),"abc");
 assert.equal(C.cleanText("a\tb"),"a b");
 assert.equal(C.cleanText("a\r\nb\rc"),"a\nb\nc");
 assert.equal(C.cleanText("a\n\n\n\n\nb"),"a\n\nb");
 const family="👨‍👩‍👧";assert.equal(C.cleanText(family),family);
 assert.equal(C.cleanText(" \n​\n "),"");
 assert.equal(C.cleanText(42),"");
});

test("textError: empty only with an image, 500 characters at most",()=>{
 assert.match(C.textError("  "),/Écris un message/);
 assert.equal(C.textError("  ",true),"");
 assert.equal(C.textError("salut"),"");
 assert.equal(C.textError("x".repeat(500)),"");
 assert.match(C.textError("x".repeat(501)),/trop long : 501\/500/);
});

test("checkFile: four image types, 2 MB at most, a French reason otherwise",()=>{
 for(const type of C.MEDIA_TYPES)assert.equal(C.checkFile({type,size:1000}),"");
 assert.equal(C.checkFile({type:"IMAGE/GIF",size:10}),"");
 assert.equal(C.checkFile({type:"image/gif",size:C.MEDIA_MAX}),"");
 assert.match(C.checkFile({type:"image/gif",size:C.MEDIA_MAX+1}),/trop lourde \(2,0 Mo\) : 2 Mo au maximum/);
 assert.match(C.checkFile({type:"image/png",size:5*1048576}),/5,0 Mo/);
 assert.match(C.checkFile({type:"image/svg+xml",size:10}),/Format non pris en charge/);
 assert.match(C.checkFile({type:"video/mp4",size:10}),/Format non pris en charge/);
 assert.match(C.checkFile({type:"image/png",size:0}),/vide/);
 assert.match(C.checkFile(null),/illisible/);
});

test("pickImage: the first supported image, else another image (to explain), else null",()=>{
 const txt={type:"text/plain",size:3},gif={type:"image/gif",size:9},svg={type:"image/svg+xml",size:9},png={type:"image/png",size:9};
 assert.equal(C.pickImage([txt,svg,gif,png]),gif);
 assert.equal(C.pickImage([txt,svg]),svg);
 assert.equal(C.pickImage([txt]),null);
 assert.equal(C.pickImage(undefined),null);
 assert.equal(C.pickImage(new Set([png])),png);       // FileList-like iterables
});

test("mediaUrl: only base64url ids the server could have made",()=>{
 assert.equal(C.mediaUrl({id:"AbC-_0123456789xyzABC",type:"image/gif"}),"/api/chat/media/AbC-_0123456789xyzABC");
 assert.equal(C.mediaUrl({id:"../../etc/passwd"}),"");
 assert.equal(C.mediaUrl({id:"a b"}),"");
 assert.equal(C.mediaUrl({id:"short"}),"");
 assert.equal(C.mediaUrl(null),"");assert.equal(C.mediaUrl({id:5}),"");
});

test("roomLabel and badgeText",()=>{
 assert.equal(C.roomLabel("global","left"),"Tous");
 assert.equal(C.roomLabel("camp","left"),"Ma gauche");
 assert.equal(C.roomLabel("camp","right"),"Ma droite");
 assert.equal(C.badgeText(3),"3");assert.equal(C.badgeText(9),"9");assert.equal(C.badgeText(10),"9+");
 assert.equal(C.unreadTotal({global:2,camp:3}),5);assert.equal(C.unreadTotal(null),0);
});

test("enterSends: Enter sends on desktop only; never from an IME, a held key, an emoji panel, or with a modifier",()=>{
 const k=(o={})=>({key:"Enter",shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,isComposing:false,repeat:false,...o});
 assert.equal(C.enterSends(k()),true);
 assert.equal(C.enterSends(k(),{touch:false,sinceIme:Infinity}),true);
 assert.equal(C.enterSends(k({shiftKey:true})),false);
 assert.equal(C.enterSends(k(),{touch:true}),false);
 assert.equal(C.enterSends(k({ctrlKey:true})),false);              // no Ctrl/⌘+Enter shortcut any more
 assert.equal(C.enterSends(k({metaKey:true}),{touch:true}),false);
 assert.equal(C.enterSends(k({altKey:true})),false);
 assert.equal(C.enterSends(k({isComposing:true})),false);
 assert.equal(C.enterSends(k({keyCode:229})),false);
 assert.equal(C.enterSends(k({repeat:true})),false);
 assert.equal(C.enterSends(k(),{sinceIme:120}),false);              // the Enter an emoji panel injects
 assert.equal(C.enterSends(k(),{sinceIme:C.IME_GUARD-1}),false);
 assert.equal(C.enterSends(k(),{sinceIme:C.IME_GUARD}),true);
 assert.equal(C.enterSends(k({key:"a"})),false);
});

test("imeInput: compositions and emoji typed as text arm the Enter guard, plain letters do not",()=>{
 assert.equal(C.imeInput("insertFromComposition","é"),true);
 assert.equal(C.imeInput("insertCompositionText","ka"),true);
 assert.equal(C.imeInput("insertText","🙄"),true);
 assert.equal(C.imeInput("insertText","🇫🇷"),true);
 assert.equal(C.imeInput("insertText","a"),false);
 assert.equal(C.imeInput("insertText",null),false);
 assert.equal(C.imeInput("insertLineBreak",null),false);
 assert.equal(C.imeInput("insertFromPaste","🙄"),false);
});

test("isTouch: coarse without hover, or a touch screen without a fine hovering pointer",()=>{
 assert.equal(C.isTouch({coarseNoHover:true}),true);
 assert.equal(C.isTouch({maxTouchPoints:5,fineHover:false}),true);   // tablet, DeX without mouse
 assert.equal(C.isTouch({maxTouchPoints:10,fineHover:true}),false); // touch laptop with a trackpad
 assert.equal(C.isTouch({maxTouchPoints:0,fineHover:true}),false);
 assert.equal(C.isTouch(),false);
});

test("insertAtCaret: at the caret, over a selection, clamped",()=>{
 assert.deepEqual(C.insertAtCaret("abc",1,1,"🗳️"),{value:"a🗳️bc",caret:1+"🗳️".length});
 assert.deepEqual(C.insertAtCaret("abcdef",1,4,"X"),{value:"aXef",caret:2});
 assert.deepEqual(C.insertAtCaret("abc",undefined,undefined,"!"),{value:"abc!",caret:4});
 assert.deepEqual(C.insertAtCaret("abc",9,12,"!"),{value:"abc!",caret:4});
 assert.deepEqual(C.insertAtCaret("abc",2,1,"!"),{value:"ab!c",caret:3});
});

test("atBottom: within the slack of the end",()=>{
 assert.equal(C.atBottom(500,300,800),true);
 assert.equal(C.atBottom(460,300,800),true);
 assert.equal(C.atBottom(400,300,800),false);
 assert.equal(C.atBottom(0,300,200),true);              // shorter than the box
});

test("fmtTime: today, yesterday, within the week, older (game time zone)",()=>{
 const tz="Europe/Paris",now=Date.UTC(2026,9,30,12,0);   // Friday 30 October 2026, 13:00 in Paris
 assert.equal(C.fmtTime(Date.UTC(2026,9,30,7,5),now,tz),"08:05");
 assert.equal(C.fmtTime(Date.UTC(2026,9,29,20,0),now,tz),"hier 21:00");
 assert.match(C.fmtTime(Date.UTC(2026,9,27,9,30),now,tz),/^mar\.? 10:30$/);
 assert.equal(C.fmtTime(Date.UTC(2026,9,1,9,30),now,tz),"01/10 11:30");
 assert.equal(C.fmtTime(NaN,now,tz),"");
 // Just after midnight in Paris is "today" there even though it is still yesterday in UTC.
 assert.equal(C.fmtTime(Date.UTC(2026,9,29,23,30),now,tz),"00:30");
 assert.match(C.fmtUntil(Date.UTC(2026,9,31,17,0),tz),/samedi 31 octobre.*18:00/);
});

test("validMsg: only well-formed messages are drawn",()=>{
 assert.equal(C.validMsg(msg(1)),true);
 assert.equal(C.validMsg(msg(1,{text:"",media:{id:"abcdefgh12",type:"image/gif"}})),true);
 assert.equal(C.validMsg(msg(1,{text:undefined,media:null})),false);
 assert.equal(C.validMsg(msg(1.5)),false);
 assert.equal(C.validMsg({...msg(1),author:null}),false);
 assert.equal(C.validMsg(null),false);
});

test("mergeMessages: sorted, deduplicated (send answer vs live echo), capped",()=>{
 const a=[msg(1),msg(3)],b=[msg(2),msg(3,{text:"echo"}),{bad:true}];
 const m=C.mergeMessages(a,b);
 assert.deepEqual(m.map(x=>x.id),[1,2,3]);assert.equal(m[2].text,"echo");
 const many=Array.from({length:C.KEEP+10},(_,i)=>msg(i+1));
 const capped=C.mergeMessages([],many);
 assert.equal(capped.length,C.KEEP);assert.equal(capped[0].id,11);assert.equal(capped.at(-1).id,C.KEEP+10);
});

test("mergeMessages: no cap when paging older (keep=Infinity), so before= keeps advancing",()=>{
 const loaded=Array.from({length:C.KEEP},(_,i)=>msg(i+101));
 const older=Array.from({length:50},(_,i)=>msg(i+51));
 const m=C.mergeMessages(older,loaded,Infinity);
 assert.equal(m.length,C.KEEP+50);assert.equal(m[0].id,51);
 assert.equal(C.mergeMessages(older,loaded)[0].id,101);           // the default cap would have dropped that page
});

test("mergeLatest: the fresh page replaces what it covers, older pages stay; a short page is everything",()=>{
 const old=Array.from({length:120},(_,i)=>msg(i+1));
 // Full newest page 71..120 with 100 deleted meanwhile and 121 new: 1..70 stay, 100 is gone.
 const page=Array.from({length:51},(_,i)=>msg(i+71)).filter(m=>m.id!==100);
 const m=C.mergeLatest(old,page,50);
 assert.equal(m.some(x=>x.id===100),false);
 assert.equal(m[0].id,1);assert.equal(m.at(-1).id,121);
 // Never trimmed: pages loaded past KEEP survive a reload.
 const big=Array.from({length:C.KEEP+100},(_,i)=>msg(i+1));
 assert.equal(C.mergeLatest(big,big.slice(-50),50).length,C.KEEP+100);
 // Fewer than a page: the room only holds those.
 assert.deepEqual(C.mergeLatest(old,[msg(200)],50).map(x=>x.id),[200]);
 assert.deepEqual(C.mergeLatest(old,[],50),[]);
});

test("emoji picker: about 80 emojis, political ones included, no duplicates",()=>{
 const all=C.EMOJIS.flatMap(([,l])=>l);
 assert.ok(all.length>=70&&all.length<=100,String(all.length));
 assert.equal(new Set(all).size,all.length);
 for(const e of ["🗳️","🏛️","📢","🎤","🌹","🇫🇷"])assert.ok(all.includes(e),e);
});
