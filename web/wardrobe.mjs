// La Garde-robe: the cosmetic catalogue (outfits and objects) and the Tombola / Loterie draws. Shared by the server
// (which mutates through rules.mjs act) and the browser (which only reads). Cosmetics only: no XP, no FM, no gauge.
// The catalogue at the top is plain data; rules.mjs bindings are only used inside functions (the modules import each
// other, so nothing from rules.mjs may run while this file is being evaluated).
import {dayKey,curIdx,logEntry} from "./rules.mjs";

export const RARITIES=["commun","rare","epique","legendaire","ultra","mythique"];
export const RARITY_LABEL={commun:"Commun",rare:"Rare",epique:"Épique",legendaire:"Légendaire",ultra:"Ultra rare",mythique:"Mythique"};
export const RARITY_COLOR={commun:"#a9b2c2",rare:"#5fb4ff",epique:"#b77bff",legendaire:"#f4c84a",ultra:"#ff5ad1",mythique:"#ff6a1a"};
// kind "outfit" | "object"; pool "all" | "left" | "right"; order inside a rarity = display order.
const O=(pool,rarity,name,desc)=>({kind:"outfit",pool,rarity,name,desc}),B=(pool,rarity,name,desc)=>({kind:"object",pool,rarity,name,desc});
export const ITEMS={
 // ---------------------------------------------------------------- outfits, left
 camarade:O("left","ultra","Le Camarade, 1917","Chapka à étoile rouge, long manteau militaire à pattes de col rouges, cape-drapeau frappée de la faucille et du marteau d'or ; braises, étoiles rouges et neige de Moscou tout autour."),
 frontpop:O("left","epique","Le Front populaire, 1936","Casquette gavroche, chemise ouverte, bretelles, valise des premiers congés payés."),
 rivegauche:O("left","epique","L'intellectuel rive gauche","Col roulé noir, veste en velours côtelé, écharpe longue, pipe éteinte."),
 chasuble:O("left","rare","Chasuble syndicale","Gilet rouge couvert d'autocollants, sifflet autour du cou."),
 cheminot:O("left","rare","Casquette de cheminot vintage","Casquette et vareuse bleu nuit à boutons dorés."),
 cycliste:O("left","rare","Cycliste urbain","Casque, gilet réfléchissant, sacoches."),
 bleutravail:O("left","commun","Bleu de travail","Combinaison bleue, manches retroussées."),
 bobhuma:O("left","commun","Bob de la Fête de l'Huma","Bob rouge, tee-shirt de concert."),
 mariniere:O("left","commun","Marinière made in France","Le clin d'œil à la marinière de 2012."),
 kway:O("left","commun","K-way vert","Capuche relevée, prêt pour la marche climat."),
 communard:O("left","legendaire","Le Communard, 1871","Képi de fédéré, vareuse de la Garde nationale, ceinture rouge : soixante-douze jours de Commune, et Le Temps des cerises pour la suite."),
 mai68:O("left","epique","Mai 68","Béret, parka, écharpe rouge et affiche de l'Atelier populaire : la plage est sous les pavés, paraît-il."),
 sansculotte:O("left","epique","Le Sans-culotte, 1793","Bonnet phrygien, carmagnole, pantalon rayé : pas de culotte, c'était tout le programme."),
 zadiste:O("left","rare","Zadiste de Notre-Dame-des-Landes","Ciré, bonnet, bottes de pluie : l'aéroport a été abandonné en 2018, pas les bottes."),
 hussard:O("left","rare","Hussard noir de la République","Redingote noire, lavallière et ardoise : l'instituteur de l'école laïque, vu par Péguy."),
 blouseblanche:O("left","rare","Blouse blanche en grève","Blouse d'hôpital, « en grève » au marqueur, et le service assuré quand même."),
 teeche:O("left","commun","Tee-shirt du Che","La photo de Korda, 1960, vendue par millions : le capitalisme a bien travaillé."),
 pulllarzac:O("left","commun","Pull du Larzac","Laine du causse, gilet de berger : dix ans de lutte, de 1971 à 1981, contre l'extension du camp."),
 salopette:O("left","commun","Salopette d'AMAP","Salopette, chemise à carreaux, et le poireau du mardi dans la poche."),
 totebag:O("left","commun","Écharpe et tote bag","Écharpe en lin, sac de librairie indépendante, et un essai de 400 pages à finir."),
 // ---------------------------------------------------------------- outfits, right
 sacre:O("right","ultra","Le Sacre de Reims","Manteau bleu roi semé de fleurs de lys d'or et bordé d'hermine, couronne royale, cordon bleu du Saint-Esprit ; une lumière divine descend du ciel sur lui."),
 general58:O("right","epique","Le Général, 1958","Képi à deux étoiles, uniforme kaki, gants : un clin d'œil à la Ve République."),
 venerie:O("right","epique","Vénerie","Redingote rouge de chasse à courre, bombe noire, trompe de chasse."),
 troispieces:O("right","rare","Costume trois pièces","Gris anthracite, pochette, montre à gousset."),
 golfeur:O("right","rare","Golfeur","Gilet à losanges, casquette plate, gant blanc."),
 panama:O("right","rare","Panama de la Côte d'Azur","Panama, costume de lin blanc, lunettes de soleil."),
 pullepaules:O("right","commun","Pull sur les épaules","Polo, pull noué sur les épaules, chino."),
 doudoune:O("right","commun","Doudoune sans manches","La version « start-up nation », chemise bleu ciel."),
 chasse:O("right","commun","Veste de chasse","Veste huilée, col en velours."),
 blazer:O("right","commun","Blazer de club nautique","Boutons dorés, écusson."),
 empereur:O("right","legendaire","L'Empereur, 1804","Bicorne en bataille, redingote grise, main dans le gilet : le soleil d'Austerlitz se lève et les abeilles d'or volent autour de lui."),
 incroyable:O("right","epique","L'Incroyable, 1795","Cravate jusqu'au menton, habit à grands revers, canne noueuse : sous le Directoire, on bannit même le R de Révolution."),
 immortel:O("right","epique","L'Immortel","L'habit vert est noir, brodé de feuilles d'olivier depuis 1801. Bicorne, épée, et immortel jusqu'à nouvel ordre."),
 trader:O("right","rare","Trader de la Défense","Chemise à rayures, bretelles rouges, deux téléphones : un pour acheter, un pour rassurer."),
 agriculteur:O("right","rare","Agriculteur en colère","Cotte verte, casquette de coopérative, et une botte de paille devant la préfecture."),
 casoar:O("right","rare","Casoar de Saint-Cyr","Shako, gants blancs, plumet rouge et blanc depuis 1855 : surtout ne pas dire plumet, on dit casoar."),
 pantalonrouge:O("right","commun","Pantalon rouge","Chino rouge, chemise claire, mocassins à glands : sans chaussettes, de Neuilly à l'île de Ré."),
 loden:O("right","commun","Loden du dimanche","Le manteau vert des grandes occasions, sorti pour la messe de 11 h."),
 serretete:O("right","commun","Serre-tête de Versailles","Serre-tête en velours, col Claudine, petit pull marine : rendez-vous sur le parvis."),
 skicourchevel:O("right","commun","Combi de Courchevel","Combinaison fluo de 1985, masque sur les yeux, forfait à l'élastique : la droite décomplexée, en altitude."),
 // ---------------------------------------------------------------- outfit, both camps (the only shared one)
 giletjaune:O("all","rare","Gilet jaune 2018 · Macron démission !","Le gilet fluo des ronds-points de 2018, « Macron démission ! » écrit au marqueur dans le dos."),
 // ---------------------------------------------------------------- objects, both camps
 megaphone:B("all","commun","Mégaphone","Pour couvrir la voix de l'adversaire, et parfois la sienne."),
 cocarde:B("all","commun","Cocarde","Bleu, blanc, rouge : tout le monde la revendique."),
 baguette:B("all","commun","Baguette","Tradition, bien cuite, patrimoine immatériel de l'Unesco depuis 2022."),
 parapluie:B("all","commun","Parapluie","Contre la pluie, les œufs et les questions de journalistes."),
 bulletin:B("all","commun","Bulletin de vote géant","Il ne rentre dans aucune urne, c'est tout l'intérêt."),
 microtv:B("all","rare","Micro de plateau télé","Un micro-cravate et dix secondes pour placer la petite phrase."),
 selfie:B("all","rare","Perche à selfie","Le bain de foule, vu d'en haut et en story."),
 sondage:B("all","rare","Sondage en chute","Une courbe qui ne demande qu'à remonter. Un jour."),
 urne:B("all","epique","Urne transparente","Obligatoire depuis 1988 : on voit tout, même le vide."),
 megasaucisse:B("all","epique","Méga saucisse en mousse","Le trophée des fêtes de parti, de l'Huma au barbecue de rentrée."),
 cle:B("all","legendaire","Clé de l'Élysée","Elle ouvre le 55, rue du Faubourg-Saint-Honoré. En théorie."),
 echarpe:B("all","legendaire","Écharpe présidentielle","Plutôt l'écharpe tricolore des élus, version grand soir."),
 baton:B("all","mythique","Le Bâton de feu des Apprix","On raconte qu'il ne brûle que dans la main de qui l'a mérité."),
 // ---------------------------------------------------------------- objects, left
 merguez:B("left","commun","Merguez de manif","Grillée sur le parcours, entre République et Nation."),
 brassard:B("left","commun","Brassard syndical","Service d'ordre du cortège, ne pas déranger."),
 tract:B("left","commun","Tract froissé","Distribué à 7 h devant l'usine, relu à 7 h 01."),
 fumigene:B("left","rare","Fumigène rouge","Pour la photo de une, de préférence à contre-jour."),
 banderole:B("left","rare","Banderole « Retraite à 60 ans »","Ressortie à chaque réforme depuis 1982."),
 velocargo:B("left","rare","Vélo cargo miniature","Trois enfants, un chien et le programme du parti."),
 capital:B("left","epique","Le Capital en poche","Livre I, cornée à la page de la plus-value."),
 grossesaucisse:B("left","epique","La grosse saucisse de Fabien Roussel","Un clin d'œil à la parodie musicale façon Linkin Park : la saucisse brandie comme un micro."),
 drapeaurouge:B("left","epique","Drapeau soviétique","Faucille, marteau et nostalgie d'un pays qui n'existe plus depuis 1991."),
 marteau:B("left","legendaire","Marteau doré","Celui de la faucille, plaqué or : la contradiction est assumée."),
 transfugeL:B("left","legendaire","La carte du parti d'en face","Une carte d'adhérent de l'autre camp, glissée dans la poche. Pour voir."),
 rosepantheon:B("left","legendaire","La rose du Panthéon","21 mai 1981 : une rose à la main dans la crypte, et la gauche à l'Élysée pour la première fois sous la Ve."),
 livrerouge:B("left","epique","Le Petit Livre rouge","La lecture obligée des maoïstes de 1968, depuis rangée à côté des regrets."),
 pvreims:B("left","epique","Le procès-verbal de Reims","Novembre 2008 : 42 voix d'écart au premier compte, 102 au dernier, et un parti entier pour commenter."),
 thermos:B("left","rare","Thermos de piquet de grève","Café brûlant, 5 h du matin, devant le dépôt."),
 caissegreve:B("left","rare","Caisse de grève","Une boîte de conserve fendue, qui tient parfois plus longtemps que le gouvernement."),
 touchepas:B("left","rare","Badge « Touche pas à mon pote »","La petite main jaune de 1985, sur tous les blousons des lycées."),
 sifflet:B("left","commun","Sifflet de manif","Deux notes, trois heures de cortège, plus de voix le lendemain."),
 pancarte:B("left","commun","Pancarte en carton","Un carton de pizza, un feutre, et un jeu de mots qui a coûté deux heures de réunion."),
 gourde:B("left","commun","Gourde en inox","Réutilisable, cabossée, couverte d'autocollants, et jamais lavée."),
 doleances:B("left","commun","Cahier de doléances","Écrit en 1789, rouvert en 2019 : on note, on archive, on verra."),
 // ---------------------------------------------------------------- objects, right
 croissant:B("right","commun","Croissant au beurre","Pur beurre, de l'artisan du coin, jamais industriel."),
 mallette:B("right","commun","Mallette","Elle contient des dossiers. Que des dossiers."),
 codecivil:B("right","commun","Code civil","1804, le best-seller de Napoléon."),
 painchoc:B("right","rare","Pain au chocolat","Surtout pas une chocolatine."),
 golf:B("right","rare","Club de golf","Un fer 7 pour les rendez-vous d'affaires."),
 calculatrice:B("right","rare","Calculatrice « dette publique »","Elle affiche 3 000 milliards et refuse d'aller plus loin."),
 karcher:B("right","epique","Kärcher miniature","Le nettoyeur haute pression de 2005, en format de poche."),
 tricolore:B("right","epique","Drapeau tricolore XXL","Pour le meeting, le 14 Juillet et le match de rugby."),
 sceptre:B("right","legendaire","Sceptre de la Ve République","Un pouvoir fort, un sceptre lourd, une Constitution de 1958."),
 transfugeR:B("right","legendaire","La carte du parti d'en face","Une carte d'adhérent de l'autre camp, glissée dans la poche. Pour voir."),
 croixlorraine:B("right","legendaire","La croix de Lorraine","Choisie en juillet 1940 pour la France libre, ici en or : le gaullisme a fait du chemin."),
 micro40:B("right","epique","Micro de la BBC, 1940","18 juin : peu de Français l'ont entendu ce soir-là, beaucoup s'en sont souvenus ensuite."),
 montre50:B("right","epique","La montre des 50 ans","« Si à 50 ans on n'a pas de Rolex… » : février 2009, et la phrase colle encore au poignet."),
 menufouquets:B("right","rare","Menu du Fouquet's","Le soir du 6 mai 2007, la carte a fait plus parler que le discours."),
 housse:B("right","rare","Housse de costume","13 000 euros de costumes offerts, révélés en 2017, rendus depuis : il reste la housse."),
 cigare:B("right","rare","Cigare du banquet","Allumé au dessert, éteint au deuxième tour."),
 chevaliere:B("right","commun","Chevalière","Au petit doigt, gravée d'armoiries que personne n'a vérifiées."),
 figaroplie:B("right","commun","Le journal plié","Sous le bras, ouvert aux pages saumon, celles de la Bourse."),
 champagne:B("right","commun","Coupe de champagne","Tiède et sans bulles à la troisième estimation de 20 h."),
 clevilla:B("right","commun","Clé de la résidence secondaire","À La Baule ou à l'île de Ré, on ne sait plus laquelle.")
};
export const URN_NAME={left:"La Tombola de la Fête",right:"La Loterie du Gala"};
// Odds in %, from the bottom up; pity: the draw count without such a rarity that forces it (epique also counts
// anything better, legendaire counts legendaire and ultra).
export const ODDS={commun:60,rare:28,epique:9.5,legendaire:2,ultra:0.5};
export const PITY={epique:10,legendaire:50,ultra:80};
export const CONFETTI={commun:5,rare:10,epique:25,legendaire:50,ultra:100,mythique:100};
export const EXCHANGE={cost:{commun:100,rare:200,epique:300},rarities:["commun","rare","epique"]};
export const MYTHIC={item:"baton",minDays:21,minFlame:300,base:0.01,step:0.001,per:10,cap:0.03};
const rank=r=>RARITIES.indexOf(r);
const DRAWN=["commun","rare","epique","legendaire","ultra"];
// The items a player of a camp can draw or exchange: the shared ones (pool "all") and the camp's own.
export const inPool=(id,camp)=>{const it=ITEMS[id];return !!it&&it.rarity!=="mythique"&&(it.pool===camp||it.pool==="all");};
export const poolItems=(camp,rarity)=>Object.keys(ITEMS).filter(id=>inPool(id,camp)&&ITEMS[id].rarity===rarity);

export const freshWardrobe=()=>({own:[],worn:{outfit:null,object:null},confetti:0,bulletins:0,freeDay:-1,pity:{epique:0,legendaire:0,ultra:0},draws:0});
// A stored wardrobe re-derived field by field (rules.mjs sanitize).
export function sanitizeWardrobe(w){
 const o=freshWardrobe();if(!w||typeof w!=="object")return o;
 const int=(v,min,max,def)=>Number.isFinite(v)?Math.round(Math.min(max,Math.max(min,v))):def;
 if(Array.isArray(w.own))o.own=[...new Set(w.own.filter(id=>typeof id==="string"&&Object.hasOwn(ITEMS,id)))];
 for(const k of ["outfit","object"]){const id=w.worn?.[k];if(typeof id==="string"&&o.own.includes(id)&&ITEMS[id].kind===k)o.worn[k]=id;}
 o.confetti=int(w.confetti,0,1e6,0);o.bulletins=int(w.bulletins,0,9999,0);o.freeDay=int(w.freeDay,-1,1e9,-1);o.draws=int(w.draws,0,1e9,0);
 if(w.ev&&Array.isArray(w.ev.ids)){const ids=w.ev.ids.filter(i=>Number.isSafeInteger(i)&&i>0).slice(-8);if(ids.length)o.ev={ids,n:int(w.ev.n,0,9,0)};}
 for(const k of Object.keys(PITY))o.pity[k]=int(w.pity?.[k],0,PITY[k]-1,0);
 return o;
}

// ---------- read-only checks ----------
export const freeDrawToday=S=>S.wardrobe.freeDay!==dayKey(curIdx(S));
// Draws events still offer this player (they never roll the mythic): S.wardrobe.ev = {ids, n used}. Overlapping events
// share one allowance, the strongest's: a draw taken under one counts under the others.
const bonusUsed=(S,fx)=>S.wardrobe.ev?.ids.some(id=>fx.free.ids.includes(id))?S.wardrobe.ev.n:0;
export const bonusDraws=(S,fx)=>fx?.free?Math.max(0,fx.free.n-bonusUsed(S,fx)):0;
export function drawBlock(S,pay,fx=null){
 if(pay==="free")return freeDrawToday(S)?"":"Tirage gratuit déjà pris aujourd'hui : reviens demain, ou utilise un bulletin.";
 if(pay==="bonus")return bonusDraws(S,fx)>0?"":"Pas de tirage offert pour l'instant.";
 if(pay==="bulletin")return S.wardrobe.bulletins>=1?"":"Pas de bulletin : missions, courrier et objectifs du jour en rapportent.";
 return "Mode de tirage inconnu.";
}
const mythicOk=(S,m)=>!!m&&m.available===true&&m.clean===true&&Number.isFinite(m.ageDays)&&m.ageDays>=MYTHIC.minDays&&(S.flame?.pts||0)>=MYTHIC.minFlame;
// The chance of the mythic roll on the next draw (0 when not eligible): 1 % at 300 Flamme, +0.1 % per 10, at most 3 %.
export const mythicChance=(S,m)=>mythicOk(S,m)?Math.min(MYTHIC.cap,MYTHIC.base+MYTHIC.step*Math.floor(((S.flame?.pts||0)-MYTHIC.minFlame)/MYTHIC.per)):0;
// The merguez smell and the sparks around the urn: shown exactly when the mythic roll is live.
export const urnHint=(S,opts)=>mythicOk(S,opts?.mythic??opts);
export const owns=(S,id)=>S.wardrobe.own.includes(id);

// ---------- mutations (server side, through rules.mjs act) ----------
function rollRarity(random){
 let x=random()*100;
 for(const r of DRAWN.slice().reverse()){if(x<ODDS[r])return r;x-=ODDS[r];}
 return "commun";
}
function gain(S,id){
 const W=S.wardrobe,it=ITEMS[id],dup=W.own.includes(id),confetti=dup?CONFETTI[it.rarity]:0;
 if(dup)W.confetti=Math.min(1e6,W.confetti+confetti);else W.own.push(id);
 return {dup,confetti};
}
// pay "free" (once per calendar day) or "bulletin". mythic: the server's {available, ageDays, clean, claim}.
export function draw(S,pay,{random=Math.random,mythic=null,fx=null}={}){
 const e=drawBlock(S,pay,fx);if(e)return {ok:false,error:e};
 const W=S.wardrobe,urn=URN_NAME[S.camp];
 if(pay==="free")W.freeDay=dayKey(curIdx(S));
 else if(pay==="bonus"){const n=bonusUsed(S,fx);W.ev={ids:[...new Set([...(n?W.ev.ids:[]),...fx.free.ids])].slice(-8),n:n+1};mythic=null;}
 else W.bulletins--;
 W.draws++;
 // The staff is rolled before anything else and only taken when the server's claim (atomic) says it is still free.
 const p=mythicChance(S,mythic);
 if(p>0&&random()<p&&typeof mythic.claim==="function"&&mythic.claim()===true){
  const id=MYTHIC.item;if(!W.own.includes(id))W.own.push(id);
  logEntry(S,"draw",`${urn} : ${ITEMS[id].name} ! Une lueur orange envahit la salle.`,{id,rarity:"mythique",mythic:true});
  return {ok:true,item:{id,kind:ITEMS[id].kind,rarity:"mythique"},dup:false,confetti:0,mythic:true};
 }
 let r=rollRarity(random);const n={epique:W.pity.epique+1,legendaire:W.pity.legendaire+1,ultra:W.pity.ultra+1};
 if(n.ultra>=PITY.ultra)r="ultra";
 else if(n.legendaire>=PITY.legendaire&&rank(r)<rank("legendaire"))r="legendaire";
 else if(n.epique>=PITY.epique&&rank(r)<rank("epique"))r="epique";
 for(const k of Object.keys(PITY))W.pity[k]=rank(r)>=rank(k)?0:n[k];
 const ids=poolItems(S.camp,r),id=ids[Math.min(ids.length-1,Math.floor(random()*ids.length))],it=ITEMS[id],g=gain(S,id);
 logEntry(S,"draw",`${urn} : ${it.name} (${RARITY_LABEL[r]})${g.dup?`, déjà dans la garde-robe : +${g.confetti} confettis`:" rejoint la garde-robe"}.`,{id,rarity:r,dup:g.dup});
 const out={ok:true,item:{id,kind:it.kind,rarity:r},dup:g.dup,confetti:g.confetti};
 if(id==="transfugeL"||id==="transfugeR")out.transfuge=true;
 return out;
}
// 100 confetti for any missing commun, rare or épique item of the player's pools.
export function exchange(S,id){
 const W=S.wardrobe,it=ITEMS[id];
 if(typeof id!=="string"||!it||!inPool(id,S.camp)||!EXCHANGE.rarities.includes(it.rarity))return {ok:false,error:"Cet objet ne s'échange pas."};
 if(W.own.includes(id))return {ok:false,error:"Déjà dans la garde-robe."};
 const cost=EXCHANGE.cost[it.rarity];
 if(W.confetti<cost)return {ok:false,error:`Il faut ${cost} confettis (tu en as ${W.confetti}).`};
 W.confetti-=cost;W.own.push(id);
 logEntry(S,"draw",`Échange : ${cost} confettis contre ${it.name}.`,{id,rarity:it.rarity,exchange:true});
 return {ok:true,item:{id,kind:it.kind,rarity:it.rarity}};
}
// Wears an owned item of that kind, or takes it off (id null).
export function wear(S,kind,id){
 if(kind!=="outfit"&&kind!=="object")return {ok:false,error:"Emplacement inconnu."};
 if(id===null){S.wardrobe.worn[kind]=null;return {ok:true};}
 if(typeof id!=="string"||!ITEMS[id]||ITEMS[id].kind!==kind)return {ok:false,error:"Objet inconnu."};
 if(!S.wardrobe.own.includes(id))return {ok:false,error:"Pas encore dans ta garde-robe."};
 S.wardrobe.worn[kind]=id;return {ok:true};
}
