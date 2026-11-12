// The console's "Parties" page (1.7.3) and the word "partie" everywhere (node --test, no DOM: admin/ui is read as text).
// ADMINUI_DIR points the test at another copy of admin/ui (to see it fail on the previous version).
import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const DIR=process.env.ADMINUI_DIR||fileURLToPath(new URL("../admin/ui/",import.meta.url));
const read=f=>readFileSync(join(DIR,f),"utf8");
const js=read("admin.js"),html=read("index.html"),css=read("admin.css").replace(/\/\*[^]*?\*\//g,"");
// The string and template literals of admin.js (what can reach the screen), comments left out.
const code=js.split("\n").map(l=>l.replace(/^\s*\/\/.*$/,"").replace(/;\s+\/\/ .*$/,";")).join("\n");
const literals=[...code.matchAll(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(m=>m[0]);
const rules=sel=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].trim().split(/\s*,\s*/).includes(sel)).map(m=>m[2]).join(";");

test("the Parties panel: owner only, in the menu right after Modérateurs, on the real routes",()=>{
 assert.match(js,/\["modos","Modérateurs",viewMods\],\s*\["parties","Parties",viewParties\],\s*\];/);
 assert.match(js,/OWNER_ONLY=new Set\(\[[^\]]*"parties"[^\]]*\]\)/);
 assert.match(js,/fetch\("\/api\/parties",\{method:"GET"/,"the list is a GET");
 for(const a of ["add","renew","remove"])assert.match(js,new RegExp(`action:"${a}"`),a);
 for(const k of ["POLITIGO_ADMIN_URL","POLITIGO_ADMIN_TLS","POLITIGO_ADMIN_TOKEN"])assert.ok(js.includes(`"${k}"`),k);
 // every state of the spec has its face, the refusal by another machine is not a state
 for(const s of ['"online"','"offline"','"pending"','"refused-version"'])assert.ok(js.includes(`case ${s}`),s);
 for(const t of ["Écoute des parties","Écoute des parties fermée","Ajouter une partie","Renouveler le jeton","Retirer la partie","Copier les trois lignes",
  "En attente de première connexion","Version trop ancienne","Jeton refusé à une autre machine","Rien n'arrive ?","Socket local","Réseau · TLS",
  "Affiché une seule fois","Seule la ligne POLITIGO_ADMIN_TOKEN change","Partie principale, branchée par le socket local : non retirable.",
  "Les parties en attente ou refusées n'apparaissent pas dans le sélecteur du haut ni dans les droits des modérateurs."])
  assert.ok(js.includes(t),t);
 assert.doesNotMatch(js,/Démo salon|PolitiGo Test|192\.168\.1\./,"no sample data from the maquette");
});

test("an address other machines cannot join (url null or needsHost) asks for the host's IP, in the lines to paste too",()=>{
 assert.match(js,/needsHost=L=>!!L\.needsHost\|\|!L\.url/);
 assert.ok(js.includes('"<IP de cette machine>"'));
 assert.ok(js.includes("POLITIGO_ADMIN_LINK_BIND"));
 assert.match(js,/i===0&&hole\?"hole"/);
 assert.match(rules(".envline.hole"),/dashed/);
});

test("a moderator never reaches #parties: the address falls back to their first panel",()=>{
 assert.match(js,/history\.replaceState\(null,"",`#\$\{id\}`\)/);
 assert.match(js,/arg:ok\?rest\.join\("\/"\):""/,"no argument carried to another panel");
});

test("the « Liaison » alerts of À traiter open the party's card",()=>{
 assert.match(js,/link:"Liaison"/);
 assert.match(js,/startsWith\("link:"\)/);
 assert.match(js,/#parties\/\$\{/);
});

test("lines shown once: Escape does not close a dialog without a cancel button; copying falls back to a selection",()=>{
 assert.match(js,/if\(!busy&&cancel!==null\)done\(null\)/);
 assert.match(js,/selectNodeContents/);
 assert.match(js,/\[body\]\.flat\(\)\.filter\(b=>b!=null&&b!==false\)/,"an absent block (null) is not the text « null »");
 assert.match(js,/\(\$\("#dlg"\)\.open\?\$\("#dlg"\):document\.body\)\.append\(t\)/,"the textarea fallback lives inside the modal dialog");
});

test("the console says « partie », never « serveur », in every visible text",()=>{
 const bad=literals.filter(s=>/serveur/i.test(s));
 assert.deepEqual(bad,[]);
 assert.doesNotMatch(html.replace(/<!--[^]*?-->/g,""),/serveur/i);
 for(const t of ['"aria-label":"Partie"','title:"Partie"','`Partie : ${name}`','"Parties accessibles"','"Partie du joueur"',"sur toutes les parties","pour toutes les parties"])
  assert.ok(js.includes(t),t);
});

test("no inline style (the CSP forbids it) and the page holds at 390 px",()=>{
 assert.doesNotMatch(code,/\bstyle:\s*["`]/);
 assert.match(rules(".envline code"),/min-width:0/);assert.match(rules(".envline code"),/word-break:break-all/);
 assert.match(rules(".envline"),/min-width:0/);
 assert.match(rules(".hint"),/overflow-wrap:anywhere/);
 assert.match(rules(".party h2 .pname"),/overflow-wrap:anywhere/);assert.match(rules(".party h2 .pname"),/min-width:0/);
 assert.match(css,/@media\(max-width:520px\)\{[^}]*\.grid\.wide\.parties\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(rules(".dlg.wide"),/width:min\(92vw,560px\)/);
});

// ---- Avenant 1 (1.7.3 fixes): listening asked but closed, renewed party, removed parties' backups, link alerts,
// one version format, last contact, form fields Chrome can name.
test("listening asked but not open: the error is shown and « Ajouter une partie » is disabled",()=>{
 assert.ok(js.includes("Écoute demandée mais fermée"));
 assert.match(js,/listenDown=L=>!!L\.on&&L\.up===false/);
 assert.match(js,/listenDown\(L\)\?downCard\(L\)/);
 assert.match(js,/L\.error/);
 assert.match(js,/"Ajouter une partie"\)/);
 assert.match(js,/disabled:!canAdd/);
});

test("a renewed party (pending with firstSeen) stays in the switcher as unreachable, waiting for its new token",()=>{
 assert.ok(js.includes("en attente du nouveau jeton"));
 assert.match(js,/renewing=p=>p\.state==="pending"&&!!p\.firstSeen/);
 assert.match(js,/waitToken\.has\(x\.id\)/,"the switcher's option says it");
 assert.match(js,/waitToken\.has\(s\.id\)/,"the overview card says it");
});

test("removed parties keep their backups: listed, downloadable, deletable, no manual run nor settings",()=>{
 assert.ok(js.includes("Parties retirées"));
 assert.match(js,/Partie retirée \(\$\{/);
 assert.match(js,/s\.servers\.filter\(x=>!x\.removed\)/);
 assert.match(js,/s\.servers\.filter\(x=>x\.removed\)/);
 assert.match(js,/backupFiles\(x,true\)/);
});

test("link alerts: a regenerated certificate opens #parties, the instance is quoted, an unreadable list locks the actions",()=>{
 assert.match(js,/startsWith\("link-cert:"\)/);
 assert.ok(js.includes("Certificat de liaison régénéré"));
 assert.match(js,/inst\.slice\(0,8\)/);
 assert.ok(js.includes("Liste des parties illisible"));
 assert.match(js,/partiesBroken/);
 assert.match(js,/disabled:!!partiesBroken/,"renew and remove are locked too");
});

test("versions in one format (1.7.3, no « v »), everywhere",()=>{
 assert.match(js,/const ver=/);
 assert.doesNotMatch(code,/\bv\$\{/,"no « v » glued to a version");
 assert.match(js,/ver\(x\.release\|\|x\.version\)/,"switcher");
 assert.match(js,/\["Version",ver\(s\.release\|\|s\.version\)\]/,"overview");
 assert.match(js,/\["Version",ver\(p\.version\)\]/,"party card");
});

test("last contact: the time of the last frame, one label for every network party",()=>{
 assert.doesNotMatch(js,/"Dernière connexion":"Dernier contact"/);
 assert.match(js,/\["Dernier contact",last\]/);
});

test("every form field has an id (or name) and every label points at a field",()=>{
 assert.match(js,/\/\^\(INPUT\|SELECT\|TEXTAREA\)\$\/\.test\(e\.tagName\)&&!e\.id&&!e\.name/,"h() names a field without id/name");
 // a bare h("label",{},…) names no field: either for:, or a wrapping checkbox label (class check / btn-row)
 const bare=[...code.matchAll(/h\("label",\{([^}]*)\}/g)].map(m=>m[1]).filter(p=>!/\bfor:|class:"(check|btn-row)"/.test(p));
 assert.deepEqual(bare,[]);
 assert.match(css,/label,\.lbl\{/);
 for(const m of html.matchAll(/<(input|select|textarea)\b[^>]*>/g))assert.match(m[0],/\b(id|name)=/,m[0]);
});
