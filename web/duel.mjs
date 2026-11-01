// Le Duel du Bâton, « le Bras de fer des Cendres »: a rhythm tug-of-war for the Bâton de feu, shared by the server
// (the referee: it deals the chart, keeps both players' presses and runs this same simulation) and the browser (which
// draws it, live, against a ghost or as a replay). Pure: no clock, no randomness but the seeded chart.
// Player 0 is the challenger, player 1 the bearer. The flame runs along the staff from −1 (it burns the bearer: the
// challenger takes the round) to +1 (it burns the challenger). The two players never touch each other's notes, so
// running both recordings through sim() gives the very duel they would have played side by side: that is what makes
// the deferred duel (one plays now, the other within 48 h against his ghost, then a replay for everyone) fair.
export const BD={
 round:45000,lead:1500,perfect:60,good:140,early:320,lanes:2,rounds:3,wins:2,
 push:{p:0.07,g:0.04,miss:0.02,stray:0.03},comboMax:30,comboDiv:60,
 lookahead:3000,countdown:3500,pause:3000,maxPresses:400,
 // who may play, and when (the server's rules; the browser shows them)
 minFlame:200,keepFlame:150,warnFlame:200,respiteMs:3*864e5,weekMs:7*864e5,answerMs:48*36e5,inviteMs:5*6e4,
 soloMs:20*6e4,playMs:20*6e4,replayHour:21,replayLead:30*6e4,spectatorDelay:3000,
 cheers:["fire","swords","horns","clap","saucisse","mega-saucisse"]
};

// A seeded generator (mulberry32): the same seed gives the same chart on the server and in every browser.
export function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// The chart of one round: one note at a time, never two together, on a tempo rising from 120 to 165 BPM; mostly the
// downbeats, a few off-beats as the round heats up. notes: [[t,lane],...] by time; beats: [t,...] (the kick drum).
export function chart(seed){
 const r=rng(seed),notes=[],beats=[];let t=1600,i=0,last=-1;
 while(t<BD.round-600){
  const k=t/BD.round,step=60000/(120+45*k)/2,down=i%2===0;
  if(down)beats.push(Math.round(t));
  if(r()<(down?0.75:0.06+0.18*k)){
   let lane=Math.floor(r()*BD.lanes);if(lane===last&&r()<0.4)lane=1-lane;
   notes.push([Math.round(t),lane]);last=lane;
  }
  t+=step;i++;
 }
 return {notes,beats};
}
// Each round has its own chart, all drawn from the duel's seed.
export const roundSeed=(seed,n)=>(seed^Math.imul(n+1,0x9E3779B1))>>>0;

// A list of presses as received: [[t,lane],...], t in ms from the round's start, by time. Anything else is refused
// whole (null): an honest page never sends it.
export function cleanPresses(list,max=BD.maxPresses){
 if(!Array.isArray(list)||list.length>max)return null;
 let last=-1;const out=[];
 for(const x of list){
  if(!Array.isArray(x)||x.length!==2)return null;
  const [t,lane]=x;
  if(!Number.isFinite(t)||t<0||t>BD.round+BD.good||t<last||(lane!==0&&lane!==1))return null;
  out.push([Math.round(t),lane]);last=t;
 }
 return out;
}

// One round, refereed: both players' presses and the notes they miss, in time order (a press before a miss due at
// the same instant, the challenger before the bearer), up to `upTo` ms or until the flame burns somebody.
// solo: the challenger alone, playing his part of a deferred duel (judged, but nothing pushes the flame).
// Returns {f, over:null|{w,t,how:"flame"|"time"}, res:[[...],[...]] ("p"|"g"|"m"|null per note), stats:[{p,g,m,x,e,best,combo,offs}]}.
export function sim(notes,presses,{upTo=BD.round,solo=false}={}){
 const n=notes.length,res=[new Array(n).fill(null),new Array(n).fill(null)],who=solo?[0]:[0,1];
 const st=[0,1].map(()=>({p:0,g:0,m:0,x:0,e:0,best:0,combo:0,offs:[]}));
 let f=0,over=null;
 const end=Math.min(upTo,BD.round);
 const push=(pi,amt,t)=>{
  if(solo||over)return;
  f=Math.max(-1,Math.min(1,f+(pi===0?-1:1)*amt*(1+Math.min(st[pi].combo,BD.comboMax)/BD.comboDiv)));
  if(f<=-1)over={w:0,t,how:"flame"};else if(f>=1)over={w:1,t,how:"flame"};
 };
 // the events: every press, and for every note the instant it is lost if nobody played it
 const ev=[];
 for(const pi of who){
  for(const [t,lane] of presses[pi]||[])if(t<=end)ev.push([t,0,pi,lane]);
  notes.forEach(([t],k)=>{if(t+BD.good<end)ev.push([t+BD.good+0.5,1,pi,k]);});
 }
 ev.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
 for(const [t,kind,pi,x] of ev){
  if(over)break;
  const s=st[pi],r=res[pi];
  if(kind===1){if(r[x]==null){r[x]="m";s.m++;s.combo=0;push(1-pi,BD.push.miss,t);}continue;}
  // the nearest note of that lane still in play
  let best=-1,bd=Infinity;
  for(let k=0;k<n;k++){const [nt,nl]=notes[k];if(nl!==x||r[k]!=null)continue;const d=Math.abs(nt-t);if(d<bd){bd=d;best=k;}if(nt>t+BD.early)break;}
  if(best>=0&&bd<=BD.good){
   const g=bd<=BD.perfect?"p":"g";r[best]=g;s[g]++;s.combo++;s.best=Math.max(s.best,s.combo);s.offs.push(t-notes[best][0]);
   push(pi,BD.push[g],t);continue;
  }
  // No spamming: a press too early burns the coming note (lost like a miss); any press beside the notes breaks the
  // combo and gives the other side nearly half a good note.
  s.combo=0;
  const early=notes.findIndex(([nt,nl],k)=>nl===x&&r[k]==null&&nt-t>BD.good&&nt-t<=BD.early);
  if(early>=0){r[early]="m";s.m++;s.e++;push(1-pi,BD.push.miss,t);}else s.x++;
  push(1-pi,BD.push.stray,t);
 }
 // where the flame stands at the whistle loses; a perfect tie goes to the bearer
 if(!over&&!solo&&upTo>=BD.round)over={w:f<0?0:1,t:BD.round,how:"time"};
 return {f,over,res,stats:st};
}

// What the anti-cheat sees in one player's round (sim() stats, that player's presses): a metronome (hits spread
// less than a human can manage), near-perfect play, or a burst no thumb can produce. Counted on the notes really
// played: a perfect script burns its rival within ten seconds, long before a full round's worth of notes.
export function flagsOf(stats,presses,notes){
 const out=[],hits=stats.offs.length,judged=stats.p+stats.g+stats.m;
 if(hits>=10){const m=stats.offs.reduce((a,b)=>a+b,0)/hits,sd=Math.sqrt(stats.offs.reduce((a,b)=>a+(b-m)**2,0)/hits);if(sd<8)out.push("métronome");}
 if(judged>=40&&stats.p>=0.97*judged)out.push("sans faute");
 for(let i=0,j=0;i<presses.length;i++){while(presses[i][0]-presses[j][0]>1000)j++;if(i-j+1>14){out.push("rafale");break;}}
 return out;
}

// A whole duel from its recordings: rounds are played until somebody has two (a deferred challenger plays all three:
// he cannot know which ones will count). rounds: [{c:[presses], b:[presses]}, ...]. Returns
// {rounds:[{n,over,f}], wins:[c,b], winner:0|1|null (null: not decided by these rounds)}.
export function verdict(seed,rounds){
 const out=[],wins=[0,0];
 for(let n=0;n<rounds.length&&wins[0]<BD.wins&&wins[1]<BD.wins;n++){
  const {notes}=chart(roundSeed(seed,n)),r=sim(notes,[rounds[n].c||[],rounds[n].b||[]]);
  out.push({n,over:r.over,f:r.f});wins[r.over.w]++;
 }
 return {rounds:out,wins,winner:wins[0]>=BD.wins?0:wins[1]>=BD.wins?1:null};
}

// The replay's running order, in ms from its start: for each round played, a countdown, the round (cut short when the
// flame burned somebody), a pause. Everyone watching sees the same moment: position = now − replay start.
export function timeline(v){
 let t=0;const rounds=v.rounds.map(r=>{const start=t+BD.countdown,end=start+r.over.t;t=end+BD.pause;return {n:r.n,start,end};});
 return {rounds,total:t};
}
