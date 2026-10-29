// Writes docs/SOURCES.md from the game data in web/rules.mjs: every companion, its look, its personal items and
// the public facts its "casseroles" (stress events) wink at. Run it again whenever a character or a fact changes:
//   docker run --rm -v "$PWD:/w" -w /w node:24-alpine node tools/make-sources.mjs
import {writeFileSync} from "node:fs";
import * as R from "../web/rules.mjs";

const camps={left:"Collection gauche",right:"Collection droite"};
const cell=s=>String(s).replace(/\|/g,"\\|");
let md=`# Sources et références

> Fichier généré par \`tools/make-sources.mjs\` à partir de \`web/rules.mjs\` : ne pas l'éditer à la main.

PolitiGo est une **satire**. Les répliques sont **inventées ou librement adaptées**, jamais des citations exactes ; chaque « casserole » (source de stress d'un personnage) fait un
clin d'œil à un **fait public**, rappelé ci-dessous. Quand une procédure judiciaire est évoquée, c'est avec son **stade exact**
au moment de l'écriture, et **la présomption d'innocence s'applique** à toute personne qui n'a pas été définitivement condamnée.

Une erreur, un fait dépassé, une procédure qui a évolué ? Ouvre une *issue* : la correction passe avant tout le reste.

`;
for(const side of R.CAMPS){
 md+=`## ${camps[side]}\n\n`;
 R.people[side].forEach((p,i)=>{
  const from=i===0?1:i*10,to=i===9?100:i*10+9;
  md+=`### ${p.name} — niveaux ${from} à ${to}\n\n${p.detail}\n\n`;
  md+=`Objets personnels : ${R.personalItems[p.name].map(it=>it.name).join(" · ")}\n\n`;
  md+=`| Casserole | Réplique (inventée ou librement adaptée) | Fait public évoqué |\n|---|---|---|\n`;
  for(const s of R.stresses[p.name])md+=`| ${cell(s.trigger)} | « ${cell(s.line)} » | ${cell(s.ref)} |\n`;
  md+="\n";
 });
}
writeFileSync(new URL("../docs/SOURCES.md",import.meta.url),md);
console.log("docs/SOURCES.md written");
