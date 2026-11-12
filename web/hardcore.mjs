// The Bâton de feu's music, synthesised in the browser (Web Audio): no file and nobody's rights. Distorted power
// chords, a bass, a drum kit with toms, a choir-like pad and a lead guitar, in a room. Two users: the legend
// (createSong: an epic piece of its own, slow and wide, looped while it is open) and the Duel du Bâton (createBand:
// the same instruments, fast, on the round's own beats). One switch for both (soundOn / setSound), on unless turned
// off. Nothing touches the browser until the first sound: the module loads in node for its tests.

// ---------------------------------------------------------------- the legend's piece (pure data, tested)
export const BPM=100;   // in eighths: a bar of eight steps lasts 2.4 s
// The chords: the guitar's root (MIDI, 40 = E2) and the pad's voicing.
export const CHORDS={Em:{root:40,pad:[52,55,59,64]},C:{root:36,pad:[48,52,55,60]},D:{root:38,pad:[50,54,57,62]},
 Bm:{root:35,pad:[47,50,54,59]},G:{root:43,pad:[55,59,62,67]}};
const P1=["Em","C","D","Bm"],P2=["Em","C","G","D"];
// The lead, a bar of eight steps each: a note (MIDI) held until the next one, 0 to go on holding.
const LA=[[71,0,0,0,69,0,67,0],[67,0,0,0,64,0,0,0],[66,0,0,0,69,0,0,0],[71,0,0,0,0,0,74,0]];
const LB=[[76,0,0,0,74,0,71,0],[72,0,0,0,71,0,67,0],[67,0,0,0,71,0,74,0],[66,0,0,0,69,0,0,0]];
// The sections, in order; from the end it goes back to the second one (the intro is heard once). drums: toms (a
// slow boom), half (half time), drive (double kick under the theme); gtr: ring (one chord a bar, left to ring),
// chug (open chords and palm mutes); fill: the toms roll down at the end of the section.
export const PIECE=[
 {bars:4,chords:P1,drums:"toms"},
 {bars:4,chords:P2,drums:"half",gtr:"ring",fill:true},
 {bars:8,chords:[...P1,...P2],drums:"drive",gtr:"chug",lead:[...LA,...LB],fill:true},
 {bars:4,chords:P1,drums:"toms",lead:LA},
];
// Bar n of the piece: its section, its place in it (k), its chord.
export function barAt(n){
 const loop=PIECE.slice(1),len=loop.reduce((s,x)=>s+x.bars,0);
 let sec=PIECE[0],k=n;
 if(n>=PIECE[0].bars){k=(n-PIECE[0].bars)%len;for(sec of loop){if(k<sec.bars)break;k-=sec.bars;}}
 return {sec,k,chord:sec.chords[k%sec.chords.length],first:k===0,last:k===sec.bars-1,lead:sec.lead?.[k]||null};
}
const CHUG=["o2",0,"m","m","o2",0,"m","m"];   // o2: an open chord two steps long; m: a palm mute
const FILL=[0,0,0,0,150,125,100,80];         // the toms' pitches rolling down the last half bar
// Everything played on step s (0..7) of bar b.
export function stepAt(b,s){
 const {sec}=b,c=CHORDS[b.chord],fill=sec.fill&&b.last&&s>=4,e={kick:false,snare:false,hat:false,crash:false,tom:0,gtr:null,bass:null,pad:null,lead:null};
 if(s===0)e.pad=c.pad;
 if(fill){e.tom=FILL[s];e.kick=true;}
 else if(sec.drums==="toms"){e.kick=s===0;e.tom=s===0?70:s===5||s===6?95:0;e.crash=s===0&&b.first&&b.k===0&&sec!==PIECE[0];}
 else if(sec.drums==="half"){e.kick=s===0||s===3;e.snare=s===4;e.hat=s%2===0;e.crash=s===0;}
 else if(sec.drums==="drive"){e.kick=true;e.snare=s===4;e.hat=s%2===0;e.crash=s===0&&b.k%2===0;}
 if(sec.gtr==="ring"&&s===0){e.gtr={root:c.root,steps:8,muted:false};e.bass={root:c.root,steps:8};}
 if(sec.gtr==="chug"){const v=CHUG[s];if(v){e.gtr={root:c.root,steps:v==="o2"?2:1,muted:v==="m"};}e.bass={root:c.root,steps:1};}
 if(b.lead?.[s]){let n=1;while(s+n<8&&!b.lead[s+n])n++;e.lead={note:b.lead[s],steps:n};}
 return e;
}

// ---------------------------------------------------------------- the switch
const KEY="politigo.sound",OLD="politigo.duelSound";
export function soundOn(){
 try{const v=localStorage.getItem(KEY);if(v==="1"||v==="0")return v==="1";return localStorage.getItem(OLD)!=="0";}catch{return true;}
}
export function setSound(on){try{localStorage.setItem(KEY,on?"1":"0");}catch{}}

// ---------------------------------------------------------------- the instruments
let ac=null,live=0;   // live: bands still sounding; the context comes back with the page only for them
const bufs=new Map();
// The page's one AudioContext, made on the first sound (a tap or a key: the browser lets it play), paused while the
// page is hidden.
export function audio(){
 if(!ac){
  const C=globalThis.AudioContext||globalThis.webkitAudioContext;ac=new C();
  document.addEventListener("visibilitychange",()=>{if(document.hidden)ac.suspend().catch(()=>{});else if(live>0)ac.resume().catch(()=>{});});
 }
 if(ac.state==="suspended"&&!document.hidden)ac.resume().catch(()=>{});
 return ac;
}
const hz=m=>440*2**((m-69)/12);
// A buffer made once per sample rate: white noise, or a room (sec seconds of decaying noise, darker each side).
function buf(a,kind,sec=1){
 const key=`${kind}${sec}@${a.sampleRate}`;if(bufs.has(key))return bufs.get(key);
 const n=Math.round(a.sampleRate*sec),b=a.createBuffer(kind==="noise"?1:2,n,a.sampleRate);
 for(let ch=0;ch<b.numberOfChannels;ch++){const d=b.getChannelData(ch);let lp=0;
  for(let i=0;i<n;i++){const w=Math.random()*2-1;if(kind==="noise")d[i]=w;else{lp=lp*0.6+w*0.4;d[i]=lp*(1-i/n)**3;}}}
 bufs.set(key,b);return b;
}
// A band playing into its own output (volume 0..1). room: the reverb's length and level. stop(fade): out in fade
// seconds, then silent for good. a: the page's context, or an OfflineAudioContext (to hear it as a file).
export function createBand(volume=0.35,{room=0.9,wet=0.16}={},a=audio()){
 const out=a.createGain();out.gain.value=volume;out.connect(a.destination);const mine=a===ac;if(mine)live++;
 const comp=a.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=4;comp.connect(out);
 const verb=a.createConvolver();verb.buffer=buf(a,"room",room);const wetG=a.createGain();wetG.gain.value=wet;verb.connect(wetG).connect(comp);
 const bus=a.createGain();bus.connect(comp);bus.connect(verb);
 const air=a.createGain(),airWet=a.createGain();air.gain.value=0.5;airWet.gain.value=2;air.connect(comp);air.connect(airWet).connect(verb);   // the pad: twice as much room
 // The guitar: detuned saws pushed hard into a tanh, then a cabinet (a mid push, the fizz cut off).
 const drive=a.createWaveShaper(),curve=new Float32Array(2048);for(let i=0;i<2048;i++){const x=i/1024-1;curve[i]=Math.tanh(x*18)*0.8;}drive.curve=curve;drive.oversample="4x";
 const pre=a.createBiquadFilter();pre.type="highpass";pre.frequency.value=90;
 const mid=a.createBiquadFilter();mid.type="peaking";mid.frequency.value=1400;mid.Q.value=0.9;mid.gain.value=5;
 const cab=a.createBiquadFilter();cab.type="lowpass";cab.frequency.value=4200;cab.Q.value=0.7;
 const gtr=a.createGain();gtr.gain.value=0.32;pre.connect(drive).connect(mid).connect(cab).connect(gtr).connect(bus);
 let stopped=false;
 const env=(g,at,peak,dur,rel=0.03,att=0.004)=>{g.gain.setValueAtTime(0.0001,at);g.gain.linearRampToValueAtTime(peak,at+att);g.gain.setValueAtTime(peak,at+Math.max(att+0.001,dur-rel));g.gain.exponentialRampToValueAtTime(0.0001,at+dur);};
 function osc(type,f,at,dur,dest,detune=0){const o=a.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=detune;o.connect(dest);o.start(at);o.stop(at+dur+0.02);return o;}
 function noiseHit(at,dur,filter,f,peak,q=0.8){
  const s=a.createBufferSource();s.buffer=buf(a,"noise");const fl=a.createBiquadFilter();fl.type=filter;fl.frequency.value=f;fl.Q.value=q;const g=a.createGain();
  g.gain.setValueAtTime(peak,at);g.gain.exponentialRampToValueAtTime(0.0001,at+dur);s.connect(fl).connect(g).connect(bus);s.start(at,Math.random()*0.5);s.stop(at+dur+0.02);
 }
 return {
  kick(at,peak=1){const g=a.createGain();g.connect(bus);g.gain.setValueAtTime(peak,at);g.gain.exponentialRampToValueAtTime(0.0001,at+0.28);
   const o=osc("sine",150,at,0.3,g);o.frequency.setValueAtTime(160,at);o.frequency.exponentialRampToValueAtTime(48,at+0.09);noiseHit(at,0.012,"highpass",3000,0.35*peak);},
  snare(at,peak=0.55){noiseHit(at,0.2,"bandpass",1900,peak,0.7);const g=a.createGain();g.connect(bus);env(g,at,peak*0.5,0.1,0.06);osc("triangle",190,at,0.1,g);},
  hat(at){noiseHit(at,0.035,"highpass",7500,0.16);},
  crash(at){noiseHit(at,1.8,"highpass",4200,0.3);},
  tom(at,f){const g=a.createGain();g.connect(bus);g.gain.setValueAtTime(0.8,at);g.gain.exponentialRampToValueAtTime(0.0001,at+0.6);
   const o=osc("sine",f,at,0.62,g);o.frequency.setValueAtTime(f*1.4,at);o.frequency.exponentialRampToValueAtTime(f*0.75,at+0.4);noiseHit(at,0.05,"lowpass",900,0.25);},
  // A power chord (root, fifth, octave); muted: short and darker, the way a palm on the strings chugs.
  chord(at,root,dur,muted=false){
   const g=a.createGain(),len=muted?Math.min(dur,0.11):dur*0.97;env(g,at,muted?0.5:0.42,len,muted?0.04:Math.min(0.4,len/3));
   const f=a.createBiquadFilter();f.type="lowpass";f.frequency.value=muted?900:6000;g.connect(f).connect(pre);
   for(const st of [0,7,12])for(const d of [-7,7])osc("sawtooth",hz(root+st),at,len,g,d);
  },
  bass(at,root,dur){const g=a.createGain(),f=a.createBiquadFilter();f.type="lowpass";f.frequency.value=650;g.connect(f).connect(bus);env(g,at,0.42,dur*0.95,Math.min(0.3,dur/3));
   osc("sawtooth",hz(root-12),at,dur*0.95,g);osc("square",hz(root-12),at,dur*0.95,g,-4);},
  // A choir-like pad: each note three slow saws, darkened, swelling in and fading out over the next chord.
  pad(at,notes,dur){const g=a.createGain(),f=a.createBiquadFilter();f.type="lowpass";f.frequency.value=1500;f.Q.value=0.5;g.connect(f).connect(air);
   g.gain.setValueAtTime(0.0001,at);g.gain.linearRampToValueAtTime(0.05,at+0.7);g.gain.setValueAtTime(0.05,at+dur);g.gain.linearRampToValueAtTime(0.0001,at+dur+0.9);
   for(const n of notes)for(const d of [-12,0,12])osc("sawtooth",hz(n),at,dur+0.9,g,d);},
  // The lead: a high guitar through the same amp, a slow vibrato once the note is held.
  lead(at,note,dur){const g=a.createGain();env(g,at,0.26,dur*0.98,Math.min(0.25,dur/3),0.02);g.connect(pre);
   const lfo=a.createOscillator(),depth=a.createGain();lfo.frequency.value=5.5;depth.gain.setValueAtTime(0,at);depth.gain.linearRampToValueAtTime(18,at+Math.min(0.6,dur));lfo.connect(depth);lfo.start(at);lfo.stop(at+dur+0.02);
   for(const d of [-5,5]){const o=osc("sawtooth",hz(note),at,dur,g,d);depth.connect(o.detune);}},
  now:()=>a.currentTime,
  stop(fade=0.6){
   if(stopped)return;stopped=true;if(mine)live--;const t=a.currentTime;
   try{out.gain.cancelScheduledValues(t);out.gain.setValueAtTime(out.gain.value,t);out.gain.linearRampToValueAtTime(0,t+fade);}catch{}
   setTimeout(()=>{try{out.disconnect();}catch{}},fade*1000+100);
  },
  get stopped(){return stopped;}
 };
}

// ---------------------------------------------------------------- the legend's player
// start() from a tap; stop() fades it out. A look-ahead scheduler: every 25 ms, the steps of the next 0.3 s.
export function createSong({volume=0.34}={}){
 let band=null,timer=0,next=0,step=0;
 const EIGHTH=60/BPM/2,ROOM={room:2.6,wet:0.3};
 function play(until){
  while(next<until){
   const b=barAt(Math.floor(step/8)),e=stepAt(b,step%8);
   if(e.kick)band.kick(next,e.tom?0.8:1);if(e.snare)band.snare(next);if(e.hat)band.hat(next);if(e.crash)band.crash(next);if(e.tom)band.tom(next,e.tom);
   if(e.pad)band.pad(next,e.pad,8*EIGHTH);
   if(e.gtr)band.chord(next,e.gtr.root,e.gtr.steps*EIGHTH,e.gtr.muted);
   if(e.bass)band.bass(next,e.bass.root,e.bass.steps*EIGHTH);
   if(e.lead)band.lead(next,e.lead.note,e.lead.steps*EIGHTH);
   next+=EIGHTH;step++;
  }
 }
 const pump=()=>{if(band)play(band.now()+0.3);};
 return {
  start(){
   if(band&&!band.stopped)return;
   try{band=createBand(volume,ROOM);next=band.now()+0.08;step=0;pump();timer=setInterval(pump,25);}catch{band=null;}
  },
  stop(fade=1.2){clearInterval(timer);timer=0;band?.stop(fade);band=null;},
  playing:()=>!!band,
  // The first seconds into an OfflineAudioContext (rendered by the caller).
  renderTo(ctx,seconds){band=createBand(volume,ROOM,ctx);next=0.05;step=0;play(seconds);band=null;}
 };
}
