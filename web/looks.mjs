// The wardrobe's drawings (Tombola / Loterie): outfits and objects on the companion's 64x64 sprite grid (app.js
// sprite()). Pure canvas code, no DOM at load: the names, rarities and pools live in wardrobe.mjs, only the looks here.
// An outfit recolours the body (coat, shirt, tie) and adds layers: sky (behind everything), back (capes, mantles),
// front (vests, sashes, over the body, under the head), head (hats) and fx (particles, over everything).
// An object is drawn in the raised hand, in place of the personal item's prop: draw(c,x,y,t), x,y = the prop's anchor.
const rect=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
const K="#202330",PAPER="#f2e8cd",GOLD="#f4c84a",GOLD_D="#b88a1e",BLUE="#2f5fb4",RED="#d42a2a",WHITE="#f4f1ea";
const wave=(t,i,amp=1,speed=260)=>Math.sin(t/speed+i*0.55)*amp;
const blinkOn=(t,ms=250)=>Math.floor((t||0)/ms)%2===1;
// Deterministic sparks: n points rising in a column band, from the clock only (no state to keep).
function sparks(c,t,n,colors,{x0=10,x1=54,y0=8,y1=58,speed=900,size=1}={}){
 for(let i=0;i<n;i++){
  const k=(i*7919)%997/997,life=((t/speed)+k)%1,x=x0+((i*37)%(x1-x0))+Math.sin(t/300+i)*2,y=y1-(y1-y0)*life;
  if(life>0.85&&i%2)continue;
  rect(c,x,y,size,size,colors[i%colors.length]);
 }
}
// Small pixel emblems: a five-pointed star, the hammer and sickle, a fleur-de-lis, a rose.
function star5(c,x,y,col){rect(c,x+2,y,1,1,col);rect(c,x,y+1,5,1,col);rect(c,x+1,y+2,3,1,col);rect(c,x+1,y+3,1,1,col);rect(c,x+3,y+3,1,1,col);}
function hammerSickle(c,x,y,col=GOLD){
 for(const [dx,dy] of [[3,0],[4,1],[5,2],[5,3],[4,4],[3,5],[2,5],[1,4]])rect(c,x+dx,y+dy,1,1,col);   // the sickle's blade
 rect(c,x,y+5,1,2,col);                                                                            // its handle
 for(let i=0;i<5;i++)rect(c,x+1+i,y+6-i,1,1,col);rect(c,x+4,y,3,2,col);                           // the hammer
}
function lys(c,x,y){rect(c,x+1,y,1,3,GOLD);rect(c,x,y+1,1,2,GOLD);rect(c,x+2,y+1,1,2,GOLD);rect(c,x,y+3,3,1,GOLD);rect(c,x+1,y+4,1,1,GOLD);}
function rose(c,x,y){rect(c,x,y,3,3,"#ef6c89");rect(c,x+1,y+1,1,1,"#bc3f68");rect(c,x+1,y+3,1,3,"#6bac73");rect(c,x+2,y+4,1,1,"#6bac73");}
// A legendary object glints now and then.
const glint=(c,x,y,t)=>{if(blinkOn(t))rect(c,x,y,1,1,"#ffffff");};

// ===================================================================== outfits (ids: wardrobe.mjs ITEMS)
export const OUTFIT_LOOKS={
 // ---------------------------------------------------------------- left
 camarade:{coat:"#6d6a58",shirt:"#6d6a58",tie:null,
  back(c,t){   // the red flag worn as a cape: it widens from the shoulders and blows back to the left, its edge rippling
   const edge=y=>{const d=y-35,w=18+d*0.9;return [32-w/2-d*0.95+wave(t,y,0.6+d*0.12,220),w];};
   for(let y=35;y<58;y++){const [x,w]=edge(y);rect(c,x,y,w,1,(y+Math.floor(t/220))%4===0?"#a4141f":"#c41a28");rect(c,x,y,1,1,"#6e0d14");}
   for(let x=0;x<30;x++)rect(c,2+x+wave(t,x,1.4,200),58+Math.round(wave(t,x*2,1.2,160)),1,1,"#6e0d14");
   const [ex]=edge(46);hammerSickle(c,Math.round(ex+3),42);star5(c,Math.round(edge(38)[0]+5),36,GOLD);
  },
  front(c){   // the greatcoat: red collar tabs, two rows of gold buttons, belt with a star buckle, a long hem
   rect(c,23,52,18,4,"#6d6a58");rect(c,23,55,18,1,"#4f4c3e");rect(c,31,46,2,10,"#4f4c3e");
   rect(c,24,37,4,3,"#c41a28");rect(c,36,37,4,3,"#c41a28");
   for(const y of [40,43,50]){rect(c,27,y,1,1,GOLD);rect(c,36,y,1,1,GOLD);}
   rect(c,22,46,20,2,"#4a3622");rect(c,31,46,2,2,GOLD);
  },
  head(c){   // the ushanka: fur, ear flaps down, the red star in front
   rect(c,20,7,25,9,"#7d6a55");rect(c,22,5,21,3,"#8e7a62");rect(c,20,13,25,3,"#6a5844");
   rect(c,19,15,4,12,"#7d6a55");rect(c,42,15,4,12,"#7d6a55");rect(c,19,26,4,1,"#6a5844");rect(c,42,26,4,1,"#6a5844");
   for(const x of [22,27,33,38])rect(c,x,6,2,1,"#9c8870");
   star5(c,30,9,"#d42a2a");
  },
  fx(c,t){
   sparks(c,t,10,["#ffb347","#ff7a1a","#ffe08a"],{speed:1100});
   for(let i=0;i<4;i++){const life=((t/2000)+i*0.27)%1;star5(c,8+((i*41)%46),58-life*52,i%2?"#d42a2a":"#ff4a3a");}   // red stars rising
   for(let i=0;i<10;i++){const y=((t/45)+i*31)%64,x=((i*53)+Math.sin(t/500+i)*3+64)%64;rect(c,x,y,1,1,"#f4f7ff");}   // Moscow snow
  }
 },
 frontpop:{coat:"#e9e2cf",shirt:"#e9e2cf",tie:null,
  front(c){rect(c,26,37,2,17,"#5a4632");rect(c,36,37,2,17,"#5a4632");rect(c,30,37,4,2,"#e9b38e");rect(c,24,51,16,3,"#4d5566");
   rect(c,6,46,12,9,"#8a5a32");rect(c,6,46,12,1,"#6b4426");rect(c,10,44,4,2,"#6b4426");rect(c,8,49,8,1,"#c9a06a");},   // the suitcase, by the feet
  head(c){rect(c,21,10,23,6,"#7c6a58");rect(c,22,9,19,2,"#8e7c68");rect(c,36,14,9,2,"#5f4f40");rect(c,30,10,2,1,"#5f4f40");}
 },
 rivegauche:{coat:"#7a5a3a",shirt:"#1d1d22",tie:null,
  front(c){for(let x=25;x<40;x+=2)rect(c,x,38,1,14,"#6a4c30");rect(c,27,31,11,6,"#1d1d22");rect(c,26,34,4,18,"#d8c8a0");rect(c,26,40,4,1,"#b84a3a");rect(c,26,46,4,1,"#b84a3a");
   rect(c,36,29,4,2,"#5a3a24");rect(c,39,27,3,3,"#3a2616");}
 },
 chasuble:{
  front(c){rect(c,23,38,18,14,"#e0312f");rect(c,29,38,6,4,"#b8232a");
   for(const [x,y,col] of [[25,42,"#ffd23f"],[34,41,"#ffffff"],[27,47,"#3fb37f"],[36,46,"#ffd23f"],[31,49,"#ffffff"]])rect(c,x,y,3,3,col);
   rect(c,31,35,1,6,"#9aa3b0");rect(c,30,40,4,2,"#cfd6df");}
 },
 cheminot:{coat:"#1e2a4a",shirt:"#e8e2d0",tie:"#1e2a4a",
  front(c){for(const y of [39,43,47])rect(c,26,y,2,2,GOLD);for(const y of [39,43,47])rect(c,36,y,2,2,GOLD);},
  head(c){rect(c,22,8,21,7,"#1e2a4a");rect(c,21,14,23,2,"#141c33");rect(c,22,12,21,1,GOLD);rect(c,30,9,4,2,GOLD);}
 },
 cycliste:{
  front(c){rect(c,23,38,18,14,"#c8f04a");rect(c,23,43,18,2,"#c9d3dc");rect(c,23,48,18,2,"#c9d3dc");rect(c,8,47,8,8,"#2e6f5a");rect(c,8,47,8,2,"#225546");},
  head(c){rect(c,21,8,23,8,"#3fb37f");rect(c,23,6,19,3,"#3fb37f");for(const x of [26,31,36])rect(c,x,8,3,2,"#1e5e44");rect(c,21,15,23,1,"#1e5e44");}
 },
 bleutravail:{coat:"#3a5d9c",shirt:"#3a5d9c",tie:null,
  front(c){rect(c,25,40,5,4,"#2c4a80");rect(c,25,40,5,1,"#5a7cba");rect(c,18,47,5,3,"#e9b38e");rect(c,42,47,5,3,"#e9b38e");}
 },
 bobhuma:{coat:"#26262c",shirt:"#26262c",tie:null,
  front(c){rect(c,29,41,6,5,"#d42a2a");rect(c,31,42,2,3,"#ffd23f");},
  head(c){rect(c,23,9,19,6,"#d42a2a");rect(c,19,14,27,3,"#d42a2a");rect(c,19,16,27,1,"#a51e1e");}
 },
 mariniere:{coat:"#f4f1ea",shirt:"#f4f1ea",tie:null,
  front(c){for(let y=38;y<53;y+=3){rect(c,24,y,16,1,"#1f3b78");rect(c,18,y+1,5,1,"#1f3b78");rect(c,42,y+1,5,1,"#1f3b78");}}
 },
 kway:{coat:"#3f9d5a",shirt:"#3f9d5a",tie:null,
  front(c){rect(c,31,37,2,16,"#2a6b3c");},
  head(c){rect(c,20,11,25,4,"#3f9d5a");rect(c,20,11,3,20,"#3f9d5a");rect(c,42,11,3,20,"#3f9d5a");rect(c,20,30,25,3,"#3f9d5a");rect(c,23,14,19,1,"#2a6b3c");}
 },
 // ---------------------------------------------------------------- both camps
 giletjaune:{   // over the élu's own coat: fluo yellow, two reflective bands, marker scribbles (« Macron démission ! », illegible at 64 px)
  front(c){rect(c,23,38,18,14,"#e6f02a");rect(c,29,38,6,3,"#c9d41c");rect(c,23,44,18,2,"#c9d3dc");rect(c,23,49,18,2,"#c9d3dc");
   for(const [x,y,w] of [[25,40,4],[34,40,5],[25,42,3],[30,42,5],[26,47,6],[34,47,4]])rect(c,x,y,w,1,"#1d1d22");rect(c,31,38,2,14,"#d0da20");}
 },
 // ---------------------------------------------------------------- right
 sacre:{coat:"#efe7d2",shirt:"#efe7d2",tie:null,
  sky(c){   // a soft glow behind the head, so the light seems to come down on him
   const g=c.createRadialGradient(32,10,0,32,10,30);g.addColorStop(0,"rgba(255,244,200,.55)");g.addColorStop(1,"rgba(255,244,200,0)");c.fillStyle=g;c.fillRect(0,0,64,44);
  },
  back(c,t){   // the royal mantle: royal blue, sown with gold fleurs-de-lis, ermine edges, the train sweeping to the right
   const sway=wave(t,0,1.2,500);
   for(let y=33;y<62;y++){const l=16-(y-33)*0.25,r=48+(y-33)*0.45+(y>50?(y-50)*0.9+sway:0);rect(c,l,y,r-l,1,y%4===0?"#1a3796":"#1f3fa8");rect(c,l,y,2,1,"#f7f4ee");rect(c,r-2,y,2,1,"#f7f4ee");}
   rect(c,14,60,52,2,"#f7f4ee");for(let x=15;x<64;x+=4)rect(c,x,60,1,1,K);for(let y=36;y<60;y+=4)rect(c,16,y,1,1,K);
   for(const [x,y] of [[18,38],[45,41],[19,48],[48,50],[24,55],[54,56]])lys(c,x,y);
  },
  front(c){
   rect(c,22,37,3,3,GOLD);rect(c,39,37,3,3,GOLD);rect(c,21,36,5,1,GOLD_D);rect(c,38,36,5,1,GOLD_D);   // épaulettes
   for(let i=0;i<14;i++)rect(c,25+i,38+i,2,2,"#3f8ee8");   // the cordon bleu of the Saint-Esprit
   rect(c,35,47,5,1,"#ffffff");rect(c,37,45,1,5,"#ffffff");rect(c,36,46,3,3,"#ffffff");rect(c,37,47,1,1,GOLD);   // its cross
   for(let y=39;y<53;y+=3)rect(c,31,y,2,1,GOLD_D);},
  head(c){   // a royal crown: gold band with gems, five fleurons
   rect(c,22,10,21,4,GOLD);rect(c,22,13,21,1,GOLD_D);
   for(const x of [22,27,31,35,40]){rect(c,x,7,3,3,GOLD);rect(c,x+1,6,1,1,GOLD);}
   rect(c,25,11,2,2,"#d42a2a");rect(c,31,11,3,2,"#2f5fb4");rect(c,38,11,2,2,"#d42a2a");
  },
  fx(c,t){   // the beam from the sky lights him up (added light), the halo above the crown, light falling gently
   const a=0.16+0.06*Math.sin(t/600);c.globalCompositeOperation="lighter";
   for(let y=0;y<62;y++){const w=12+y*0.75;c.fillStyle=`rgba(255,236,170,${(a*(1-y/110)).toFixed(3)})`;c.fillRect(Math.round(32-w/2),y,Math.round(w),1);}
   for(let i=-2;i<=2;i++){const k=0.12+0.1*Math.sin(t/400+i*1.7);c.fillStyle=`rgba(255,250,225,${k.toFixed(3)})`;for(let y=0;y<50;y++)c.fillRect(Math.round(32+i*(2+y*0.16)),y,1,1);}
   c.globalCompositeOperation="source-over";
   c.strokeStyle=`rgba(255,226,120,${(0.7+0.25*Math.sin(t/300)).toFixed(3)})`;c.lineWidth=1;c.beginPath();c.ellipse(32.5,3.5,9,2,0,0,Math.PI*2);c.stroke();
   for(let i=0;i<12;i++){const life=((t/2600)+i*0.083)%1,x=18+((i*29)%28)+Math.sin(t/700+i)*2,y=life*56;rect(c,x,y,1,1,i%3?"#fff6d0":GOLD);}
  }
 },
 general58:{coat:"#6b6a3c",shirt:"#d8d2b0",tie:"#3a3a24",
  front(c){rect(c,24,40,5,3,"#58572f");rect(c,35,40,5,3,"#58572f");rect(c,19,50,4,4,"#f4f1ea");rect(c,43,50,4,4,"#f4f1ea");for(const y of [44,48])rect(c,31,y,2,2,GOLD);},
  head(c){rect(c,23,6,19,10,"#6b6a3c");rect(c,23,6,19,2,"#58572f");rect(c,21,14,23,2,"#2a2a1c");rect(c,23,11,19,2,GOLD);rect(c,28,8,2,2,GOLD);rect(c,34,8,2,2,GOLD);}
 },
 venerie:{coat:"#b0242c",shirt:"#f4f1ea",tie:"#f4f1ea",
  front(c){rect(c,24,37,4,5,K);rect(c,36,37,4,5,K);for(const y of [43,47])rect(c,31,y,2,2,GOLD);
   c.strokeStyle=GOLD;c.lineWidth=2;c.beginPath();c.arc(14,44,7,0,Math.PI*2);c.stroke();rect(c,19,40,5,2,GOLD);},   // the horn, over the shoulder
  head(c){rect(c,22,7,21,9,"#16161c");rect(c,24,5,17,3,"#16161c");rect(c,21,15,23,1,"#16161c");rect(c,30,7,3,1,"#3a3a46");}
 },
 troispieces:{coat:"#3a3d45",shirt:"#f1e9da",tie:"#7a2a3a",
  front(c){rect(c,27,42,10,9,"#4b4f59");rect(c,35,40,3,2,"#f4f1ea");c.strokeStyle=GOLD;c.lineWidth=1;c.beginPath();c.moveTo(28,47);c.quadraticCurveTo(31,50,35,47);c.stroke();}
 },
 golfeur:{coat:"#e8e2d0",shirt:"#ffffff",tie:null,
  front(c){rect(c,23,38,18,14,"#2e5e8c");for(let i=0;i<3;i++)for(let j=0;j<2;j++){const x=25+i*6,y=40+j*6;rect(c,x+2,y,2,2,"#e6c84a");rect(c,x,y+2,2,2,"#e6c84a");rect(c,x+4,y+2,2,2,"#e6c84a");rect(c,x+2,y+4,2,2,"#e6c84a");}rect(c,43,50,4,4,"#ffffff");},
  head(c){rect(c,22,9,21,6,"#9a8f78");rect(c,34,13,11,2,"#7a705c");}
 },
 panama:{coat:"#f2eddf",shirt:"#bcd7ee",tie:null,
  front(c){rect(c,25,38,3,10,"#e2dccb");rect(c,36,38,3,10,"#e2dccb");},
  head(c){rect(c,23,7,19,8,"#ead9a8");rect(c,18,14,29,2,"#ead9a8");rect(c,23,12,19,2,"#2a2a33");
   for(const x of [25,34]){rect(c,x,21,6,3,"#0d0d12");}rect(c,31,21,3,1,"#0d0d12");}
 },
 pullepaules:{coat:"#8fb3d9",shirt:"#8fb3d9",tie:null,
  front(c){rect(c,20,36,25,4,"#b8323a");rect(c,29,39,6,4,"#b8323a");rect(c,30,43,2,5,"#9c2830");rect(c,33,43,2,4,"#9c2830");rect(c,24,51,16,3,"#d9c49a");}
 },
 doudoune:{coat:"#a9c7e8",shirt:"#a9c7e8",tie:null,
  front(c){rect(c,23,38,18,14,"#1f2a44");for(const y of [41,44,47,50])rect(c,23,y,18,1,"#2f3d5e");rect(c,31,38,2,14,"#9aa3b0");}
 },
 chasse:{coat:"#4f5a3a",shirt:"#d8d0b8",tie:null,
  front(c){rect(c,24,37,4,4,"#6b4426");rect(c,36,37,4,4,"#6b4426");rect(c,25,46,5,4,"#434d31");rect(c,34,46,5,4,"#434d31");}
 },
 blazer:{coat:"#1e2c55",shirt:"#f4f1ea",tie:"#8badd2",
  front(c){for(const y of [42,46])rect(c,27,y,2,2,GOLD);rect(c,35,40,4,4,"#f4f1ea");rect(c,36,41,2,2,"#b8323a");}
 }
};

// ===================================================================== the Bâton de feu
// A dark wooden staff wrapped in punk tape, living flames on top, sparks flying off. big: a scale for the legend.
export function baton(c,x,y,t,big=1){
 t=t||0;
 const r=(a,b,w,h,col)=>rect(c,x+a*big,y+b*big,w*big,h*big,col);
 r(1,-14,2,22,"#4a2a16");r(1,-14,1,22,"#6b3d20");                     // the staff
 for(const b of [-10,-4,2])r(0,b,4,2,"#1d1d22");r(0,-7,4,1,"#d42a2a");    // tape bands, a red one
 const f=Math.floor(t/90)%4;
 const tongues=[[0,-19,4,6],[1,-23-f%2,2,5],[-1,-21+(f>1?1:0),2,4],[3,-21-(f===2?1:0),2,4]];
 for(const [a,b,w,h] of tongues)r(a,b,w,h,"#ff6a1a");
 r(0,-18,4,3,"#ffb347");r(1,-20-f%2,2,3,"#ffd23f");r(1,-17,2,2,"#fff3b0");
 for(let i=0;i<3;i++){const life=((t/700)+i*0.33)%1;r(1+Math.sin(t/150+i*2)*3,-22-life*10,1,1,i%2?"#ffd23f":"#ff6a1a");}
}

// ===================================================================== objects (ids: wardrobe.mjs ITEMS)
// A party card (the transfuge's): the camp it shows, not the camp of whoever holds it.
function partyCard(c,x,y,t,side){
 if(side==="right"){rect(c,x-5,y-11,15,10,"#1f3b78");rect(c,x-5,y-11,5,10,BLUE);rect(c,x,y-11,5,10,WHITE);rect(c,x+5,y-11,5,10,RED);rect(c,x-5,y-3,15,2,"#16224a");rect(c,x-3,y-9,1,1,GOLD);}
 else{rect(c,x-5,y-11,15,10,"#c41a28");rect(c,x-5,y-11,15,1,"#e8475a");rose(c,x-3,y-10);rect(c,x+2,y-8,6,1,"#ffe0e6");rect(c,x+2,y-6,5,1,"#ffe0e6");rect(c,x-5,y-3,15,2,"#8e1520");}
 rect(c,x-5,y-1,15,1,"#00000040");rect(c,x-1,y-1,3,4,"#e9b38e");   // a thumb holding it
 glint(c,x+10,y-12,t);
}
export const OBJECT_LOOKS={
 // ---------------------------------------------------------------- both camps
 megaphone(c,x,y){rect(c,x-2,y-6,4,5,"#e8e2d0");rect(c,x+2,y-9,6,11,"#d42a2a");rect(c,x+8,y-11,2,15,"#a51e1e");rect(c,x-1,y-1,2,4,K);},
 cocarde(c,x,y){rect(c,x-1,y-2,2,6,BLUE);rect(c,x+3,y-2,2,6,RED);rect(c,x-3,y-12,10,10,BLUE);rect(c,x-1,y-10,6,6,WHITE);rect(c,x+1,y-8,2,2,RED);rect(c,x-3,y-12,10,1,"#4a7ad0");},
 baguette(c,x,y){rect(c,x,y-17,4,22,"#d9a35f");rect(c,x+1,y-18,2,1,"#d9a35f");rect(c,x,y-17,1,22,"#e9c07a");for(let i=0;i<4;i++)rect(c,x+1,y-15+i*5,2,2,"#a8703a");rect(c,x-1,y-2,6,3,"#e9b38e");},
 parapluie(c,x,y){
  rect(c,x+2,y-12,1,15,K);rect(c,x,y+3,3,1,K);rect(c,x,y+2,1,1,K);                                   // the shaft, its hook
  for(let i=0;i<4;i++)rect(c,x+2-2-i*2,y-16+i,5+i*4,1,i%2?"#25427a":"#2f5fb4");                      // the canopy, widening
  rect(c,x-6,y-12,17,2,"#2f5fb4");for(const dx of [-6,-1,4,9])rect(c,x+dx,y-10,2,1,"#25427a");rect(c,x+2,y-18,1,2,K);
 },
 bulletin(c,x,y){rect(c,x-5,y-15,15,17,PAPER);rect(c,x-5,y-15,15,1,"#ffffff");rect(c,x+9,y-15,1,17,"#d8cdb0");
  rect(c,x-3,y-12,11,1,"#685a67");rect(c,x-3,y-9,8,1,"#685a67");
  rect(c,x-3,y-6,5,5,"#685a67");rect(c,x-2,y-5,3,3,PAPER);rect(c,x-2,y-5,1,1,RED);rect(c,x,y-5,1,1,RED);rect(c,x-1,y-4,1,1,RED);rect(c,x-2,y-3,1,1,RED);rect(c,x,y-3,1,1,RED);   // the box, its cross
  rect(c,x+4,y-5,4,1,"#685a67");rect(c,x+4,y-3,3,1,"#685a67");rect(c,x-1,y,4,3,"#e9b38e");},
 microtv(c,x,y){rect(c,x,y-6,2,12,K);rect(c,x-2,y-11,6,6,"#aeb4c3");rect(c,x-3,y-5,8,3,"#2f5fb4");rect(c,x-2,y-4,6,1,"#ffffff");},
 selfie(c,x,y,t){rect(c,x+1,y-14,1,18,"#9aa3b0");rect(c,x,y,3,4,K);rect(c,x-2,y-22,7,10,K);rect(c,x-1,y-21,5,7,"#5fb4ff");rect(c,x,y-19,3,2,"#e9b38e");if(Math.floor((t||0)/900)%4===0)rect(c,x+2,y-23,1,1,"#ffffff");},
 sondage(c,x,y){rect(c,x-5,y-14,15,15,PAPER);rect(c,x-5,y-14,15,1,"#ffffff");rect(c,x-4,y-2,13,1,"#685a67");
  for(const [i,h] of [[0,9],[1,7],[2,4],[3,2]])rect(c,x-3+i*3,y-2-h,2,h,i<2?"#5f8fd0":"#d42a2a");   // the bars, falling
  rect(c,x+6,y-12,1,5,RED);rect(c,x+5,y-8,3,1,RED);rect(c,x+6,y-7,1,1,RED);rect(c,x-1,y,4,3,"#e9b38e");},
 urne(c,x,y){rect(c,x-5,y-10,15,13,"#bfe3ff88");rect(c,x-5,y-10,15,1,"#ffffff");rect(c,x-1,y-11,6,2,K);rect(c,x-3,y-4,4,5,PAPER);rect(c,x+3,y-6,4,7,PAPER);rect(c,x-5,y+2,15,2,"#2f5fb4");rect(c,x,y+2,5,2,"#ffffff");rect(c,x+5,y+2,5,2,"#d42a2a");},
 megasaucisse(c,x,y,t){const s=Math.round(wave(t||0,0,1,300));   // foam: it wobbles
  rect(c,x-1+s,y-19,6,2,"#d86a4a");rect(c,x-2+s,y-17,8,8,"#c8553a");rect(c,x-2,y-9,8,10,"#c8553a");rect(c,x-1,y+1,6,2,"#b0442e");
  rect(c,x-1+s,y-16,2,6,"#e88a6a");rect(c,x-1,y-8,2,6,"#e88a6a");for(const [dx,dy] of [[3,-14],[1,-6],[4,-3]])rect(c,x+dx,y+dy,1,1,"#ffd0b8");rect(c,x-2,y-1,8,1,"#8e3a24");},
 cle(c,x,y,t){rect(c,x,y-12,6,6,GOLD);rect(c,x+2,y-10,2,2,"#7a5a10");rect(c,x+2,y-6,2,12,GOLD);rect(c,x+4,y+2,3,2,GOLD);rect(c,x+4,y-1,2,2,GOLD);glint(c,x+7,y-13,t);},
 echarpe(c,x,y,t){   // the presidential sash: across the chest, from the left shoulder to the right hip, its tassel in gold
  for(let i=0;i<16;i++){rect(c,x-22+i,y-6+i,2,1,BLUE);rect(c,x-22+i,y-5+i,2,1,WHITE);rect(c,x-22+i,y-4+i,2,1,RED);}
  rect(c,x-7,y+9,3,2,GOLD);rect(c,x-7,y+11,1,3,GOLD_D);rect(c,x-5,y+11,1,3,GOLD_D);rect(c,x-6,y+11,1,4,GOLD);glint(c,x-8,y+8,t);
 },
 baton(c,x,y,t){baton(c,x,y,t);},
 // ---------------------------------------------------------------- left
 merguez(c,x,y){rect(c,x-4,y-4,14,5,"#e8c08a");rect(c,x-3,y-6,12,3,"#9c3b22");rect(c,x-1,y-6,1,3,"#6e2414");rect(c,x+4,y-6,1,3,"#6e2414");rect(c,x+2,y-10,1,3,"#dfe6f0");},
 brassard(c,x,y){rect(c,x-4,y-1,5,4,"#d42a2a");rect(c,x-4,y-1,5,1,"#a51e1e");rect(c,x-3,y,3,1,"#ffffff");rect(c,x-3,y+2,2,1,"#ffd23f");rect(c,x+1,y-3,6,5,"#d42a2a");rect(c,x+2,y-2,4,1,"#ffffff");rect(c,x+1,y+2,1,3,"#8a6a44");},   // on the arm, a pennant in hand
 tract(c,x,y){rect(c,x-3,y-9,10,10,PAPER);rect(c,x-2,y-10,4,1,PAPER);rect(c,x+5,y-1,3,2,PAPER);rect(c,x+1,y-9,1,10,"#d8cdb0");rect(c,x-3,y-4,10,1,"#d8cdb0");
  rect(c,x-2,y-8,7,1,RED);rect(c,x-2,y-6,5,1,"#685a67");rect(c,x-2,y-2,6,1,"#685a67");rect(c,x-1,y,4,3,"#e9b38e");},
 fumigene(c,x,y,t){rect(c,x,y-6,3,10,"#d8d2c0");rect(c,x-1,y-8,5,3,"#ff3b2f");for(let i=0;i<4;i++)rect(c,x-2+Math.sin((t||0)/200+i)*3,y-12-i*4,5-i,4-i/2,["#ff6b5acc","#ff8a7aaa","#ffb0a888","#ffd0cc66"][i]);},
 banderole(c,x,y,t){   // « Retraite à 60 ans » on a pole: the « 60 » in big red pixels
  rect(c,x+2,y-24,1,28,"#8a6a44");const s=Math.round(wave(t||0,0,0.6,240));
  rect(c,x+3,y-24+s,12,10,WHITE);rect(c,x+3,y-24+s,12,1,RED);rect(c,x+3,y-15+s,12,1,RED);
  const d=(dx,dy,w,h)=>rect(c,x+dx,y+dy+s,w,h,RED);
  d(5,-22,3,1);d(5,-22,1,5);d(5,-20,3,1);d(7,-20,1,3);d(5,-18,3,1);    // 6
  d(10,-22,3,1);d(10,-22,1,5);d(12,-22,1,5);d(10,-18,3,1);             // 0
  rect(c,x+1,y,3,3,"#e9b38e");
 },
 velocargo(c,x,y){c.strokeStyle="#2e6f5a";c.lineWidth=1;for(const dx of [-4,8]){c.beginPath();c.arc(x+dx+0.5,y+4.5,3,0,Math.PI*2);c.stroke();}
  rect(c,x-7,y-4,8,6,"#b8895a");rect(c,x-7,y-4,8,1,"#9a6e44");rect(c,x-4,y-6,2,2,"#83c678");                                  // the box, a leek in it
  c.beginPath();c.moveTo(x+1,y+2);c.lineTo(x+8,y+4);c.lineTo(x+6,y-3);c.lineTo(x+1,y+2);c.stroke();rect(c,x+5,y-4,3,1,K);rect(c,x+1,y-7,1,4,K);rect(c,x,y-7,3,1,K);},
 capital(c,x,y){rect(c,x-2,y-11,11,14,"#b8232a");rect(c,x-2,y-11,2,14,"#7a161c");rect(c,x+1,y-8,6,1,GOLD);rect(c,x+1,y-5,5,1,GOLD);},
 drapeaurouge(c,x,y,t){rect(c,x+1,y-24,1,28,"#8a6a44");rect(c,x,y-25,3,1,GOLD);
  for(let col=0;col<14;col++){const dy=Math.round(wave(t||0,col,1,180));rect(c,x+2+col,y-23+dy,1,10,col%5===4?"#a4141f":"#c41a28");}
  const dy=Math.round(wave(t||0,2,1,180));hammerSickle(c,x+4,y-22+dy);star5(c,x+3,y-23+dy,GOLD);rect(c,x,y,3,3,"#e9b38e");},
 marteau(c,x,y,t){rect(c,x+1,y-6,2,12,"#8a5a32");rect(c,x-3,y-11,11,5,GOLD);rect(c,x-3,y-11,11,1,"#fff3b0");glint(c,x+9,y-12,t);},
 grossesaucisse(c,x,y,t){   // held up like a microphone: grill marks, a drip of sauce, a puff of steam
  rect(c,x,y-1,3,6,"#e9b38e");rect(c,x-2,y-18,7,18,"#a8442a");rect(c,x-1,y-19,5,1,"#a8442a");rect(c,x-1,y,5,1,"#7a2e1a");rect(c,x-1,y-17,2,14,"#c8603c");
  for(const dy of [-15,-11,-7,-3])rect(c,x-2,y+dy,7,1,"#5a1e10");rect(c,x+4,y-9,1,3,"#e8c040");rect(c,x+4,y-6,1,1,"#e8c040");
  const k=Math.floor((t||0)/400)%2;rect(c,x+1+k,y-23,1,3,"#dfe6f0");rect(c,x+3-k,y-25,1,2,"#dfe6f0");},
 transfugeL(c,x,y,t){partyCard(c,x,y,t,"right");},   // the left player's: the card of the right
 // ---------------------------------------------------------------- right
 croissant(c,x,y){rect(c,x-4,y-4,14,5,"#d9a35f");rect(c,x-2,y-6,10,2,"#e9c07a");rect(c,x-5,y-2,2,3,"#c48a44");rect(c,x+9,y-2,2,3,"#c48a44");for(const dx of [0,3,6])rect(c,x+dx,y-4,1,4,"#a8703a");},
 mallette(c,x,y){rect(c,x,y-8,5,2,K);rect(c,x,y-8,1,3,K);rect(c,x+4,y-8,1,3,K);rect(c,x-5,y-5,15,11,"#4a3022");rect(c,x-5,y-5,15,1,"#6b4632");rect(c,x-5,y,15,1,"#3a2418");rect(c,x+1,y-1,3,3,GOLD);},
 codecivil(c,x,y){rect(c,x-3,y-12,11,15,"#b8232a");rect(c,x-3,y-12,2,15,"#7a161c");rect(c,x,y-9,6,1,GOLD);rect(c,x,y-7,6,1,GOLD);rect(c,x+1,y-4,4,1,"#f2d27a");rect(c,x+8,y-11,1,13,PAPER);},
 painchoc(c,x,y){rect(c,x-4,y-6,14,8,"#d9a35f");rect(c,x-4,y-6,14,2,"#e9c07a");rect(c,x-1,y-3,2,5,"#4a2a18");rect(c,x+5,y-3,2,5,"#4a2a18");},
 golf(c,x,y){rect(c,x+1,y-16,3,6,K);rect(c,x+2,y-10,1,18,"#c9d3dc");rect(c,x+2,y+8,6,2,"#9aa3b0");rect(c,x+6,y+7,2,1,"#c9d3dc");rect(c,x+10,y+11,2,2,"#ffffff");},
 calculatrice(c,x,y,t){rect(c,x-3,y-13,12,16,"#3a3d45");rect(c,x-1,y-11,8,4,"#c6e4c4");
  rect(c,x,y-10,1,2,RED);for(let i=0;i<3;i++)rect(c,x+2+i*2,y-10,1,2,RED);if(blinkOn(t,400))rect(c,x-1,y-9,1,1,RED);   // «−000», the debt ticking
  for(let i=0;i<9;i++)rect(c,x-1+(i%3)*3,y-5+Math.floor(i/3)*2.5,2,1,i===8?RED:"#aeb4c3");},
 karcher(c,x,y,t){rect(c,x-4,y-4,8,7,"#f2d230");rect(c,x-4,y-4,8,1,"#1d1d22");rect(c,x+2,y-8,2,5,K);rect(c,x+3,y-9,8,2,K);for(let i=0;i<3;i++)rect(c,x+11+i*2,y-9+Math.sin((t||0)/120+i)*1,1,1,"#9bd6ff");},
 tricolore(c,x,y,t){rect(c,x+1,y-26,1,30,"#8a6a44");rect(c,x,y-27,3,2,GOLD);
  for(let col=0;col<15;col++){const dy=Math.round(wave(t||0,col,1.2,200));rect(c,x+2+col,y-25+dy,1,12,col<5?BLUE:col<10?WHITE:RED);}
  rect(c,x,y,3,3,"#e9b38e");},
 sceptre(c,x,y,t){rect(c,x+1,y-8,2,16,GOLD);rect(c,x-1,y-13,6,6,"#2f5fb4");rect(c,x+1,y-15,2,3,GOLD);rect(c,x,y-11,4,1,"#ffffff");glint(c,x+6,y-15,t);},
 transfugeR(c,x,y,t){partyCard(c,x,y,t,"left");}    // the right player's: the card of the left
};

export const hasLook=id=>Object.hasOwn(OUTFIT_LOOKS,id)||Object.hasOwn(OBJECT_LOOKS,id);
export const outfitLook=id=>typeof id==="string"&&Object.hasOwn(OUTFIT_LOOKS,id)?OUTFIT_LOOKS[id]:null;
// Draws the object in the hand; false when there is none to draw (the personal prop then stays).
export function drawObject(c,id,x,y,t){
 if(typeof id!=="string"||!Object.hasOwn(OBJECT_LOOKS,id))return false;
 OBJECT_LOOKS[id](c,x,y,t||0);return true;
}
// The body's colours under an outfit: coat, shirt, tie (an outfit's tie:null takes the tie off).
export function dressColors(O,p,shirt="#f1e9da"){
 return {coat:O?.coat||p.coat,shirt:O?.shirt||shirt,tie:O&&"tie" in O?O.tie:p.tie};
}
