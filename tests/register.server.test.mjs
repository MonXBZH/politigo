// The sign-up limits per address (1.7.1): only wrong invite codes count against guessing, a typo in the form costs
// nothing, friends behind one box all get in, and a wider cap on successful sign-ups slows down a farm of accounts.
// The rule « à la main » is said on the sign-up screen and in the guide; the form checks its fields before sending.
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {boot,stop,INVITE,PW} from "./server-helpers.mjs";
import {HELP,signupProblem} from "../web/help.mjs";

const PORT=3850;
let proc;
before(async()=>{proc=await boot(PORT,mkdtempSync(join(tmpdir(),"pg-reg-")));});
after(()=>stop(proc));
const reg=async(ip,body)=>{const r=await fetch(`http://127.0.0.1:${PORT}/api/register`,{method:"POST",headers:{"Content-Type":"application/json","X-Forwarded-For":ip},
 body:JSON.stringify({password:PW,invite:INVITE,camp:"left",...body})});return {status:r.status,error:(await r.json()).error};};

test("typos in the form do not count: three mistakes, then a valid sign-up goes through",async()=>{
 const ip="10.85.0.1";
 assert.equal((await reg(ip,{name:"ab"})).status,400);
 assert.equal((await reg(ip,{name:"Émoji😀test"})).status,400);
 assert.equal((await reg(ip,{name:"Typo Un",password:"court"})).status,400);
 assert.equal((await reg(ip,{name:"Annonce officielle"})).status,400);
 assert.equal((await reg(ip,{name:"Typo Un"})).status,201);
 assert.equal((await reg(ip,{name:"Typo Un"})).status,409,"name taken: an error, not a limit");
 assert.equal((await reg(ip,{name:"Typo Deux"})).status,201);
});

test("four friends behind the same box all sign up within the hour",async()=>{
 const ip="10.85.0.2";
 for(const name of ["Ami Un","Ami Deux","Ami Trois","Ami Quatre"])assert.equal((await reg(ip,{name})).status,201,name);
});

test("wrong invite codes are limited per address: past 5 the address waits, even with the right code, and is told how long",async()=>{
 const ip="10.85.0.3";
 for(let i=0;i<5;i++){const r=await reg(ip,{name:"Devin "+"abcde"[i],invite:"politigo-mauvais-code-"+i});assert.equal(r.status,403,String(i));assert.match(r.error,/Code d'invitation incorrect/);}
 const r=await reg(ip,{name:"Devin Ok"});
 assert.equal(r.status,429);assert.match(r.error,/codes d'invitation faux/);assert.match(r.error,/\d+ min/);
 // another address is not concerned
 assert.equal((await reg("10.85.0.4",{name:"Voisin Ok"})).status,201);
});

test("an empty invite code is not a guess and says what is missing",async()=>{
 const ip="10.85.0.5";
 for(let i=0;i<7;i++){const r=await reg(ip,{name:"Vide "+"abcdefg"[i],invite:""});assert.equal(r.status,403);assert.match(r.error,/Entre le code d'invitation/);}
 assert.equal((await reg(ip,{name:"Vide Ok"})).status,201);
});

test("successful sign-ups per address are capped at 4 an hour, with the delay said",async()=>{
 const ip="10.85.0.6";
 for(let i=0;i<4;i++)assert.equal((await reg(ip,{name:"Ferme "+"abcd"[i]})).status,201,String(i));
 const r=await reg(ip,{name:"Ferme e"});
 assert.equal(r.status,429);assert.match(r.error,/Trop d'inscriptions depuis cette adresse/);assert.match(r.error,/\d+ min/);
 assert.equal((await reg(ip,{name:"ab"})).status,429,"once full, the address waits");
});

test("the form checks its fields before sending (an empty form no longer answers « Code d'invitation incorrect »)",()=>{
 const ok={name:"Chloé",password:PW,invite:INVITE};
 assert.equal(signupProblem(ok),"");
 assert.match(signupProblem({name:"",password:"",invite:""}),/^Choisis un pseudo/);
 assert.match(signupProblem({...ok,name:"  ab "}),/^Pseudo : 3 à 20 caractères/);
 assert.match(signupProblem({...ok,name:"x".repeat(21)}),/^Pseudo : 3 à 20 caractères/);
 assert.match(signupProblem({...ok,password:""}),/^Mot de passe : 8 caractères minimum/);
 assert.match(signupProblem({...ok,password:"1234567"}),/^Mot de passe : 8 caractères minimum/);
 assert.match(signupProblem({...ok,invite:"   "}),/^Entre le code d'invitation/);
});

test("the rule « à la main » is in the guide and on the sign-up screen",()=>{
 const help=JSON.stringify(HELP);
 for(const w of [/à la main/,/script/,/robot/,/second compte/,/Les robots ne votent pas/,/en parle d'abord avec toi/])assert.match(help,w);
 const html=readFileSync(new URL("../web/index.html",import.meta.url),"utf8");
 const form=html.slice(html.indexOf('id="form-register"'),html.indexOf("</form>",html.indexOf('id="form-register"')));
 for(const w of [/à la main/,/robot/,/second compte/])assert.match(form,w);
});
