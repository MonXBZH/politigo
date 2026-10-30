// "Passer son test politique": for the undecided, at sign-up and at a restart. Five questions drawn from the pool,
// three answers each (the left's, the right's, and an absurd way out that counts for nobody); the majority suggests
// a camp, which the player is free to refuse. Café-du-commerce caricatures, as unfair to both sides: no gameplay
// effect, only a suggestion. Pure module (no DOM), shared with the tests.

// Each question: the left answer, the right answer, the way out.
export const TEST_QUESTIONS=[
 ["Un milliardaire s'offre un troisième yacht. Ta réaction ?","On le nationalise, avec l'équipage","Bravo, il fait vivre les chantiers navals","Je demande à monter à bord"],
 ["La police évacue une ZAD.","Violences policières : tous dans la rue !","Enfin un peu d'ordre républicain","Je vends des crêpes aux deux camps"],
 ["Ton voisin touche le RSA et fait la grasse matinée.","C'est son droit : la honte, c'est la pauvreté","Quinze heures d'activité par semaine, minimum","Je lui demande s'il reste de la place sous la couette"],
 ["Les frontières de la France ?","Une terre d'accueil, c'est notre histoire","On reprend le contrôle, point final","On les repeint en fluo pour mieux les voir"],
 ["Grève SNCF le jour de ton départ en vacances.","Je soutiens les cheminots, même à pied","Service minimum obligatoire, et vite","Je pars en trottinette jusqu'à Biarritz"],
 ["L'héritage de papy et ses trois appartements ?","Taxé à 100 % au-delà d'un plafond","Zéro droit de succession : c'est la famille","Je lègue tout au chat"],
 ["Une éolienne au fond de ton jardin ?","Oui, et des panneaux solaires sur l'église","Plutôt une centrale nucléaire bien de chez nous","Seulement si elle fait ventilateur l'été"],
 ["Le drapeau tricolore dans chaque salle de classe ?","Plutôt des cours d'écologie et d'égalité","Oui, avec La Marseillaise chaque matin","Seulement s'il sert de nappe à la cantine"],
 ["Les 35 heures ?","Trop ! Passons à 32","Retour aux 39, voire plus","Je travaille 35 minutes, c'est déjà bien"],
 ["Un patron du CAC 40 gagne 400 SMIC par an.","Salaire maximum, tout de suite","Il crée de la richesse : laissez-le tranquille","Je lui demande un prêt"],
 ["Des manifestants cassent la vitrine d'une banque.","La vraie violence, c'est le système","Comparution immédiate et prison ferme","Je récupère les stylos de l'agence"],
 ["Le service militaire ?","Un service civique, et sans fusil","Obligatoire, en rangers et au garde-à-vous","Seulement pour les pigeons"],
 ["Les fonctionnaires ?","On en embauche 500 000","On en supprime 500 000","On les clone, pour voir"],
 ["La fraude ?","Traquer l'évasion fiscale des riches","Traquer la fraude aux allocations","Tricher au Monopoly"]
];
export const TEST_SIZE=5;
// What each answer of a question is, in TEST_QUESTIONS order.
export const TEST_KINDS=["left","right","none"];

const shuffle=(a,random)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
// A test: TEST_SIZE different questions in random order, each with its answers shuffled.
// Every item: {q, answers:[{text, kind}]}.
export function drawTest(random=Math.random,n=TEST_SIZE){
 return shuffle(TEST_QUESTIONS.map((_,i)=>i),random).slice(0,n).map(i=>{
  const [q,...texts]=TEST_QUESTIONS[i];
  return {q,answers:shuffle(texts.map((text,k)=>({text,kind:TEST_KINDS[k]})),random)};
 });
}
// The verdict from the kinds picked ("left", "right" or "none"). A tie (the way out counts for nobody) is settled
// by a coin toss, and said so.
export function verdict(kinds,random=Math.random){
 const left=kinds.filter(k=>k==="left").length,right=kinds.filter(k=>k==="right").length,tie=left===right;
 const camp=tie?(random()<0.5?"left":"right"):left>right?"left":"right";
 const mine=camp==="left"?left:right,n=kinds.length;
 const line=tie?"Parfaitement au centre : le hasard va trancher pour toi."
  // Mostly the way out: one or two answers are only a hint, not a conviction.
  :mine*2<=n-mine?(camp==="left"?"Surtout à côté de la plaque… avec un léger penchant à gauche.":"Surtout à côté de la plaque… avec un léger penchant à droite.")
  :mine===n?(camp==="left"?"Plus rouge que le drapeau de la Fête de l'Huma.":"Plus bleu que la ligne bleue des Vosges.")
  :mine>=n-1?(camp==="left"?"Le cœur bien à gauche, sans hésiter.":"Solidement ancré à droite, sans trembler.")
  :(camp==="left"?"Plutôt à gauche… avec quelques arrière-pensées.":"Plutôt à droite… mais tu doutes parfois.");
 return {camp,left,right,none:n-left-right,tie,line};
}
// The random choice for the undecided who skip the test as well.
export const randomCamp=(random=Math.random)=>random()<0.5?"left":"right";
