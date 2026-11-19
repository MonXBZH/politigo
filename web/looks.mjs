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
const SKIN="#e9b38e";
const cockade=(c,x,y)=>{rect(c,x,y,5,5,BLUE);rect(c,x+1,y+1,3,3,WHITE);rect(c,x+2,y+2,1,1,RED);};
// Small digits on a 3x5 grid, for the papers (not every digit: only the ones drawn somewhere).
const DIGITS={0:"111101101101111",1:"010110010010111",2:"111001111100111",3:"111001111001111",4:"101101111001001",7:"111001001010010",9:"111101111001111",
 h:"100100110101101",z:"111001010100111"};   // and two letters: the « 7h » of a memo, the « zzz » of a motion
function digit(c,x,y,d,col){const s=DIGITS[d];for(let i=0;i<15;i++)if(s[i]==="1")rect(c,x+i%3,y+Math.floor(i/3),1,1,col);}

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
 },
 // ---------------------------------------------------------------- the 1.7.0 outfits
 communard:{coat:"#27324f",shirt:"#d8d0b8",tie:null,
  sky(c,t){   // the barricade behind him, a red flag on it
   for(const [x0,x1] of [[0,17],[47,64]])for(let y=44;y<60;y+=3)for(let x=x0+((y/3|0)%2)*2;x<x1;x+=5){if(y<50&&(x<5||x>57))continue;rect(c,x,y,4,2,(x+y)%3?"#6d6a72":"#55525c");}
   rect(c,9,14,1,32,"#6b4426");for(let col=0;col<12;col++){const dy=Math.round(wave(t,col,1.2,190));rect(c,10+col,15+dy,1,10,col%4===3?"#a4141f":"#c41a28");}
  },
  front(c){rect(c,27,34,11,4,"#c41a28");rect(c,27,37,11,1,"#a4141f");for(const y of [40,43])for(const x of [27,36])rect(c,x,y,1,1,GOLD);
   rect(c,24,46,16,3,"#c41a28");rect(c,24,48,16,1,"#a4141f");rect(c,38,46,3,8,"#c41a28");},
  head(c){rect(c,24,6,17,3,"#a4141f");rect(c,23,8,19,7,"#27324f");rect(c,23,12,19,1,"#c41a28");rect(c,21,14,23,2,K);rect(c,31,9,3,2,GOLD);},
  fx(c,t){for(let i=0;i<6;i++){const y=((t/38)+i*23)%64,x=(i*47+9+Math.sin(t/500+i)*3+64)%64;rect(c,x,y,2,2,"#c41a28");rect(c,x+1,y-2,1,2,"#4f9a58");}}   // the cherries
 },
 mai68:{coat:"#5f6b4a",shirt:"#e9e2cf",tie:null,
  front(c){rect(c,31,38,2,15,"#4a5439");rect(c,25,45,5,4,"#4a5439");rect(c,34,45,5,4,"#4a5439");rect(c,26,34,13,4,"#c41a28");rect(c,27,37,4,12,"#c41a28");rect(c,27,48,4,1,"#a4141f");
   rect(c,4,33,15,20,PAPER);rect(c,4,33,15,1,"#ffffff");rect(c,6,43,11,7,RED);rect(c,7,38,2,5,RED);rect(c,11,36,2,7,RED);rect(c,15,40,2,3,RED);rect(c,7,35,3,2,"#a9a39a");rect(c,11,33,3,2,"#a9a39a");},
  head(c){rect(c,23,9,19,6,"#1d1d22");rect(c,21,11,6,4,"#1d1d22");rect(c,23,14,19,1,"#34343e");rect(c,32,7,2,2,"#1d1d22");}
 },
 sansculotte:{coat:"#1f3b78",shirt:"#f1e9da",tie:null,
  front(c){rect(c,24,47,16,2,"#c41a28");for(const y of [40,44])for(const x of [27,36])rect(c,x,y,2,1,"#c9b37a");cockade(c,34,39);
   for(const x0 of [24,35]){rect(c,x0,50,6,7,WHITE);for(let x=x0;x<x0+6;x+=2)rect(c,x,50,1,7,RED);}rect(c,30,50,5,4,WHITE);rect(c,31,50,1,4,RED);rect(c,33,50,1,4,RED);},
  head(c){rect(c,23,8,19,7,"#c41a28");rect(c,29,4,14,5,"#c41a28");rect(c,40,6,6,6,"#c41a28");rect(c,43,11,4,3,"#a4141f");rect(c,23,14,19,1,"#a4141f");cockade(c,25,9);}
 },
 zadiste:{coat:"#d9ab2a",shirt:"#d9ab2a",tie:null,
  front(c){rect(c,31,37,2,16,"#b08a1e");for(const y of [40,44,48])rect(c,29,y,2,1,"#6b5512");rect(c,24,45,5,4,"#b08a1e");rect(c,35,45,5,4,"#b08a1e");
   rect(c,24,52,6,7,"#2e6f4a");rect(c,35,52,6,7,"#2e6f4a");rect(c,24,52,6,1,"#4f9a6e");rect(c,35,52,6,1,"#4f9a6e");for(const [x,y] of [[25,57],[37,56],[28,55]])rect(c,x,y,2,1,"#5a4632");},
  head(c){rect(c,23,8,19,8,"#6f6a64");rect(c,23,13,19,3,"#5a5650");for(let x=24;x<42;x+=3)rect(c,x,13,1,3,"#47443f");rect(c,30,6,5,2,"#6f6a64");}
 },
 hussard:{coat:"#1d1d22",shirt:"#f1e9da",tie:"#1d1d22",
  front(c){rect(c,23,52,18,3,"#1d1d22");rect(c,23,54,18,1,"#34343e");rect(c,29,38,6,3,"#f1e9da");rect(c,30,38,4,2,"#34343e");for(const y of [43,47])rect(c,31,y,2,1,"#5a5a66");
   rect(c,5,38,14,12,"#8a6a44");rect(c,6,39,12,10,"#2b3a33");for(const [x,w,y] of [[8,4,41],[8,7,44],[8,5,47]])rect(c,x,y,w,1,"#f4f1ea");rect(c,19,50,4,4,SKIN);rect(c,20,47,1,4,WHITE);}
 },
 blouseblanche:{coat:"#eef2f4",shirt:"#9fd3d0",tie:null,
  front(c){rect(c,24,41,16,6,RED);for(const [x,w] of [[25,3],[29,2],[32,3],[36,3]]){rect(c,x,42,w,1,WHITE);rect(c,x,44,w-1,1,WHITE);}
   rect(c,25,48,5,4,"#d8dde0");rect(c,34,48,5,4,"#d8dde0");rect(c,27,37,1,4,K);rect(c,36,37,1,4,K);rect(c,28,36,8,1,K);rect(c,35,40,3,1,"#aeb4c3");},
  head(c){rect(c,23,9,19,6,"#7fc4c0");rect(c,23,14,19,1,"#5fa3a0");rect(c,26,8,13,2,"#7fc4c0");}
 },
 teeche:{coat:"#b8232a",shirt:"#b8232a",tie:null,
  front(c){rect(c,28,41,8,9,K);rect(c,27,41,10,3,K);rect(c,29,44,6,5,"#b8232a");rect(c,30,48,4,2,K);rect(c,31,42,2,1,GOLD);rect(c,18,46,5,4,SKIN);rect(c,42,46,5,4,SKIN);}
 },
 pulllarzac:{coat:"#b9a98a",shirt:"#b9a98a",tie:null,
  front(c){rect(c,27,34,11,4,"#a3936f");for(let x=26;x<39;x+=3)rect(c,x,38,1,14,"#a3936f");rect(c,24,37,4,16,"#efe7d2");rect(c,36,37,4,16,"#efe7d2");for(const y of [40,44,48]){rect(c,25,y,2,1,"#d6ccb1");rect(c,37,y,2,1,"#d6ccb1");}}
 },
 salopette:{coat:"#c9745a",shirt:"#c9745a",tie:null,
  front(c){for(const y of [39,43,47])rect(c,18,y,5,1,"#a8583f");for(const y of [39,43,47])rect(c,42,y,5,1,"#a8583f");
   rect(c,26,37,2,6,"#3f6f5a");rect(c,36,37,2,6,"#3f6f5a");rect(c,26,42,12,6,"#3f6f5a");rect(c,24,47,16,6,"#3f6f5a");rect(c,27,43,1,1,GOLD);rect(c,36,43,1,1,GOLD);
   rect(c,29,44,6,3,"#315a48");rect(c,31,37,2,8,"#f1ecd9");rect(c,31,34,2,4,"#6bac73");rect(c,30,33,1,3,"#6bac73");rect(c,33,33,1,3,"#6bac73");}
 },
 totebag:{coat:"#3a3f52",shirt:"#e9e2cf",tie:null,
  front(c){rect(c,26,34,13,4,"#cfc3a8");rect(c,27,37,4,12,"#cfc3a8");rect(c,27,48,4,1,"#a89c80");rect(c,16,38,1,9,"#d8cfb8");rect(c,21,38,1,9,"#d8cfb8");rect(c,13,46,12,11,"#ece4d0");rect(c,15,48,8,1,"#b84a3a");rect(c,15,50,6,1,"#685a67");rect(c,15,52,7,1,"#685a67");}
 },
 empereur:{coat:"#8b8d92",shirt:"#f1e9da",tie:null,
  sky(c,t){   // the sun of Austerlitz
   for(let i=0;i<10;i++){const a=i*Math.PI/5+t/2600,r=11+Math.round(wave(t,i,1,300));rect(c,11+Math.cos(a)*r,12+Math.sin(a)*r,2,2,"#ffd98a");}
   rect(c,7,6,9,13,GOLD);rect(c,5,8,13,9,GOLD);rect(c,8,8,4,3,"#fff3b0");
  },
  back(c){rect(c,20,40,24,17,"#77797e");rect(c,20,56,24,1,"#5e6065");},
  front(c){rect(c,27,38,10,15,"#2f5a3a");rect(c,29,38,6,13,"#f4f1ea");rect(c,24,38,3,15,"#a3a5aa");rect(c,37,38,3,15,"#a3a5aa");rect(c,35,40,2,2,"#c41a28");rect(c,35,42,2,1,GOLD);
   rect(c,18,46,7,11,"#77797e");rect(c,18,56,7,1,"#5e6065");rect(c,18,46,7,1,"#6d6f74");rect(c,19,42,12,5,"#8b8d92");rect(c,19,46,12,1,"#6d6f74");rect(c,29,42,4,4,SKIN);   // the hand in the waistcoat, the arm over the coat's skirt
   for(const y of [47,49])rect(c,31,y,2,1,GOLD_D);},
  head(c){rect(c,15,10,35,5,"#16161c");rect(c,19,7,27,4,"#16161c");rect(c,25,4,15,4,"#16161c");rect(c,15,14,35,1,"#34343e");cockade(c,30,6);},
  fx(c,t){for(let i=0;i<7;i++){const y=((t/44)+i*19)%64,x=(i*41+5+Math.sin(t/340+i*2)*4+64)%64,w=blinkOn(t+i*90,140)?"#fff3b0":"#ffd98a";rect(c,x,y,4,2,GOLD);rect(c,x+1,y,1,2,K);rect(c,x+3,y,1,2,K);rect(c,x+1,y-1,2,1,w);}}   // the golden bees
 },
 incroyable:{coat:"#2f6b4f",shirt:"#f4f1ea",tie:null,
  front(c){rect(c,29,40,6,11,"#e6c84a");for(let y=41;y<51;y+=2)rect(c,29,y,6,1,"#c9a93a");rect(c,24,38,6,11,"#3f8a68");rect(c,34,38,6,11,"#3f8a68");rect(c,23,31,19,9,WHITE);rect(c,23,38,19,2,"#d8d2c0");rect(c,30,38,5,4,WHITE);
   rect(c,16,40,2,19,"#6b4426");rect(c,15,38,4,3,"#4a3022");},
  head(c){rect(c,18,10,29,5,"#16161c");rect(c,21,6,23,5,"#16161c");rect(c,18,14,29,1,"#34343e");rect(c,21,15,3,15,"#7a5a3a");rect(c,41,15,3,15,"#7a5a3a");}
 },
 immortel:{coat:"#16171d",shirt:"#f1e9da",tie:"#f1e9da",
  front(c){for(let y=38;y<53;y+=2){rect(c,26+(y%4?1:0),y,2,1,"#4f9a58");rect(c,36-(y%4?1:0),y,2,1,"#4f9a58");}for(const y of [40,44,48]){rect(c,28,y,1,1,GOLD);rect(c,35,y,1,1,GOLD);}
   for(const y of [41,45,49]){rect(c,19,y,3,1,"#4f9a58");rect(c,43,y,3,1,"#4f9a58");}
   for(let i=0;i<13;i++)rect(c,23-i,47+Math.floor(i*0.7),1,1,"#cfd6df");rect(c,22,45,3,5,GOLD);},
  head(c){rect(c,18,10,29,5,"#16161c");rect(c,22,7,21,4,"#16161c");rect(c,27,4,11,4,"#16161c");rect(c,18,14,29,1,"#4f9a58");rect(c,27,4,11,1,"#4f9a58");rect(c,32,8,2,3,GOLD);}
 },
 trader:{coat:"#e4eef8",shirt:"#e4eef8",tie:"#b8323a",
  front(c){for(let x=25;x<40;x+=2)rect(c,x,38,1,15,"#a9c3e0");for(const x of [18,20,22,43,45])rect(c,x,39,1,11,"#a9c3e0");rect(c,31,39,2,11,"#b8323a");rect(c,26,37,2,16,"#c41a28");rect(c,36,37,2,16,"#c41a28");rect(c,24,51,16,3,"#2a2f40");
   rect(c,14,44,5,9,K);rect(c,15,45,3,6,"#5fb4ff");},
  head(c){rect(c,42,20,4,10,K);rect(c,43,21,2,8,"#3a3d45");}
 },
 agriculteur:{coat:"#2f6b3a",shirt:"#e8dfc8",tie:null,
  front(c){rect(c,31,41,2,12,"#25552e");rect(c,25,43,5,5,"#25552e");rect(c,34,43,5,5,"#25552e");rect(c,24,52,6,7,"#3a3024");rect(c,35,52,6,7,"#3a3024");
   rect(c,3,45,16,12,"#d9b95a");for(let y=46;y<57;y+=2)rect(c,3,y,16,1,"#bf9f44");rect(c,8,45,1,12,"#8a6a44");rect(c,14,45,1,12,"#8a6a44");},
  head(c){rect(c,23,9,19,6,"#d9c14a");rect(c,23,9,19,1,"#efd96a");rect(c,20,14,18,2,"#b8a23a");rect(c,29,10,6,3,"#2f6b3a");}
 },
 casoar:{coat:"#1b2742",shirt:"#1b2742",tie:null,
  front(c){rect(c,20,37,6,3,"#d42a2a");rect(c,38,37,6,3,"#d42a2a");for(const y of [40,43,46])rect(c,31,y,2,2,GOLD);rect(c,24,48,16,2,WHITE);rect(c,30,48,4,2,GOLD);
   rect(c,19,50,4,4,WHITE);rect(c,43,50,4,4,WHITE);rect(c,24,52,6,4,"#b0242c");rect(c,35,52,6,4,"#b0242c");},
  head(c){rect(c,24,8,17,7,"#16161c");rect(c,21,14,23,2,K);rect(c,24,12,17,1,GOLD);rect(c,31,9,3,3,GOLD);rect(c,30,6,5,2,"#d42a2a");rect(c,29,3,7,3,WHITE);}
 },
 pantalonrouge:{coat:"#dfe8f2",shirt:"#dfe8f2",tie:null,
  front(c){rect(c,29,37,6,4,"#c9d6e4");rect(c,24,49,16,1,"#6b4426");rect(c,31,49,2,1,GOLD);rect(c,24,50,16,5,"#b0242c");rect(c,24,54,6,3,"#b0242c");rect(c,35,54,6,3,"#b0242c");rect(c,24,57,6,2,"#6b4426");rect(c,35,57,6,2,"#6b4426");rect(c,27,57,1,1,GOLD);rect(c,38,57,1,1,GOLD);}
 },
 loden:{coat:"#3f5a45",shirt:"#f1e9da",tie:"#7a2a3a",
  front(c){rect(c,23,52,18,3,"#3f5a45");rect(c,23,54,18,1,"#2f4635");rect(c,24,37,5,4,"#2f4635");rect(c,35,37,5,4,"#2f4635");rect(c,31,46,2,9,"#2f4635");for(const y of [44,48])for(const x of [27,36])rect(c,x,y,2,2,"#6b4426");}
 },
 serretete:{coat:"#22315a",shirt:"#22315a",tie:null,
  front(c){rect(c,26,37,6,3,WHITE);rect(c,33,37,6,3,WHITE);rect(c,26,39,5,1,"#d8d2c0");rect(c,34,39,5,1,"#d8d2c0");for(const x of [28,31,34,37])rect(c,x-1,42,1,1,"#f4f1ea");for(let x=25;x<40;x+=3)rect(c,x,51,1,2,"#30447a");},
  head(c){rect(c,23,12,19,2,"#b8323a");rect(c,22,14,2,9,"#b8323a");rect(c,41,14,2,9,"#b8323a");rect(c,23,12,19,1,"#d0505a");}
 },
 skicourchevel:{coat:"#27b6c9",shirt:"#27b6c9",tie:null,
  front(c){rect(c,24,40,16,4,"#e8388f");rect(c,24,44,16,2,"#f2d230");rect(c,18,41,5,3,"#e8388f");rect(c,42,41,5,3,"#e8388f");rect(c,31,37,2,16,"#1c8c9b");rect(c,26,47,4,5,WHITE);rect(c,27,48,2,1,"#5fb4ff");rect(c,16,38,1,20,"#aeb4c3");rect(c,14,55,5,1,"#aeb4c3");},
  head(c){rect(c,22,19,21,2,K);rect(c,24,18,17,6,"#f2d230");rect(c,26,19,13,4,"#ff7a1a");rect(c,27,19,5,1,"#ffd0a0");}
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
 transfugeR(c,x,y,t){partyCard(c,x,y,t,"left");}, // the right player's: the card of the left
 // ---------------------------------------------------------------- the 1.7.0 objects
 rosepantheon(c,x,y,t){rect(c,x+1,y-10,1,15,"#3f8a4a");rect(c,x+2,y-6,3,1,"#3f8a4a");rect(c,x+4,y-7,2,2,"#6bac73");rect(c,x-2,y-3,3,1,"#3f8a4a");rect(c,x-3,y-4,2,2,"#6bac73");
   rect(c,x-3,y-18,9,8,"#c41a28");rect(c,x-2,y-19,7,1,"#c41a28");rect(c,x-2,y-10,7,1,"#a4141f");rect(c,x-1,y-17,5,5,"#e0404a");rect(c,x,y-16,3,3,"#a4141f");rect(c,x+1,y-15,1,1,"#ef6c89");
   const f=((t||0)/1600)%1;rect(c,x+6+Math.sin((t||0)/300)*2,y-10+f*16,2,1,"#d42a2a");rect(c,x,y,3,3,SKIN);glint(c,x+6,y-19,t);},
 livrerouge(c,x,y){rect(c,x-3,y-11,11,14,"#c41a28");rect(c,x-3,y-11,2,14,"#8a141c");rect(c,x+8,y-10,1,12,PAPER);star5(c,x+1,y-9,GOLD);rect(c,x,y-3,6,1,GOLD);rect(c,x+1,y-1,4,1,GOLD);rect(c,x-1,y+2,4,3,SKIN);},
 pvreims(c,x,y){rect(c,x-6,y-17,16,20,PAPER);rect(c,x-6,y-17,16,1,"#ffffff");rect(c,x-4,y-15,12,1,"#685a67");rect(c,x-4,y-13,9,1,"#685a67");
   digit(c,x-4,y-10,1,RED);digit(c,x,y-10,0,RED);digit(c,x+4,y-10,2,RED);rect(c,x-4,y-3,8,1,"#685a67");rect(c,x-3,y-1,1,1,"#685a67");rect(c,x,y+2,4,3,SKIN);},
 thermos(c,x,y,t){rect(c,x-1,y-13,7,16,"#3d6fb0");rect(c,x-1,y-13,2,16,"#5a8ccc");rect(c,x-1,y-6,7,1,"#2c5288");rect(c,x,y-16,5,3,"#d8d2c0");rect(c,x+1,y-17,3,1,"#aeb4c3");const k=Math.floor((t||0)/400)%2;rect(c,x+1+k,y-21,1,3,"#dfe6f0");rect(c,x+3-k,y-23,1,2,"#dfe6f0");rect(c,x,y,4,3,SKIN);},
 caissegreve(c,x,y,t){rect(c,x-4,y-11,13,14,"#aeb4c3");rect(c,x-4,y-11,3,14,"#c9d3dc");rect(c,x-4,y-7,13,6,RED);rect(c,x-2,y-5,9,1,WHITE);rect(c,x-2,y-3,6,1,WHITE);rect(c,x-1,y-12,7,1,K);
   const f=((t||0)/1100)%1;if(f<0.6)rect(c,x+1,y-20+f*12,3,3,GOLD);rect(c,x,y+2,4,3,SKIN);},
 touchepas(c,x,y){rect(c,x-3,y-9,11,9,"#f2d230");for(let i=0;i<4;i++)rect(c,x-3+i*3,y-16+(i===0||i===3?2:0),2,8,"#f2d230");rect(c,x+8,y-6,3,2,"#f2d230");rect(c,x+10,y-8,2,3,"#f2d230");rect(c,x-3,y-1,11,1,"#c9a81e");for(const dx of [-1,2,5])rect(c,x+dx,y-9,1,4,"#c9a81e");rect(c,x,y,4,4,SKIN);},
 sifflet(c,x,y,t){rect(c,x-2,y-6,10,5,"#cfd6df");rect(c,x-2,y-6,10,1,"#ffffff");rect(c,x+7,y-8,5,3,"#cfd6df");rect(c,x+1,y-6,2,2,K);rect(c,x+2,y-3,2,2,"#ffd23f");rect(c,x-3,y-1,1,5,RED);if(blinkOn(t,300)){rect(c,x+13,y-10,2,1,"#ffffff");rect(c,x+13,y-7,3,1,"#ffffff");}rect(c,x,y-1,4,3,SKIN);},
 pancarte(c,x,y,t){const s=Math.round(wave(t||0,0,0.7,260));rect(c,x+1,y-12,2,17,"#8a6a44");rect(c,x-6,y-24+s,17,13,"#c9a06a");rect(c,x-6,y-24+s,17,1,"#dcb884");for(const [dx,dy,w] of [[-4,-22,12],[-4,-19,9],[-4,-16,12],[-3,-13,6]])rect(c,x+dx,y+dy+s,w,1,K);rect(c,x,y,4,3,SKIN);},
 gourde(c,x,y){rect(c,x,y-13,6,17,"#9aa3b0");rect(c,x,y-13,2,17,"#c0c8d2");rect(c,x+1,y-16,4,3,K);rect(c,x+2,y-18,2,2,"#3fb37f");rect(c,x+1,y-9,3,3,"#3fb37f");rect(c,x+3,y-4,3,3,RED);rect(c,x,y+1,4,3,SKIN);},
 doleances(c,x,y){rect(c,x-4,y-14,13,17,"#6f8fb0");rect(c,x-4,y-14,2,17,"#4f6b88");rect(c,x-1,y-11,8,6,PAPER);rect(c,x,y-10,6,1,"#685a67");rect(c,x,y-8,4,1,"#685a67");for(const [dx,dy] of [[-1,-3],[3,-2],[6,-1],[1,0]])rect(c,x+dx,y+dy,1,1,"#4f6b88");rect(c,x,y+2,4,3,SKIN);},
 croixlorraine(c,x,y,t){rect(c,x,y-23,4,28,GOLD);rect(c,x,y-23,1,28,"#fff3b0");rect(c,x+3,y-23,1,28,GOLD_D);rect(c,x-3,y-20,10,3,GOLD);rect(c,x-3,y-18,10,1,GOLD_D);rect(c,x-6,y-13,16,3,GOLD);rect(c,x-6,y-11,16,1,GOLD_D);rect(c,x-1,y,6,3,SKIN);glint(c,x+8,y-22,t);glint(c,x-6,y-14,(t||0)+250);},
 micro40(c,x,y,t){rect(c,x-4,y-18,11,12,"#aeb4c3");rect(c,x-4,y-18,11,1,"#dfe6f0");for(let i=0;i<5;i++)rect(c,x-3,y-16+i*2,9,1,"#5a606e");rect(c,x-5,y-14,1,4,K);rect(c,x+7,y-14,1,4,K);rect(c,x,y-6,3,10,K);rect(c,x-2,y-6,7,1,"#5a606e");if(blinkOn(t,500))rect(c,x+5,y-20,2,2,RED);rect(c,x,y,4,3,SKIN);},
 montre50(c,x,y,t){rect(c,x,y-15,6,6,GOLD_D);rect(c,x,y+2,6,6,GOLD_D);for(const dy of [-14,-12,3,5])rect(c,x,y+dy,6,1,GOLD);rect(c,x-3,y-10,12,12,GOLD);rect(c,x-2,y-9,10,10,"#1f5a3a");rect(c,x+2,y-8,2,1,GOLD);const a=(t||0)/1000;rect(c,x+3+Math.cos(a)*3,y-4+Math.sin(a)*3,1,1,WHITE);rect(c,x+2,y-7,1,4,WHITE);rect(c,x+3,y-4,3,1,WHITE);rect(c,x+9,y-5,1,2,GOLD_D);glint(c,x+8,y-10,t);},
 menufouquets(c,x,y){rect(c,x-5,y-16,14,19,"#7a1420");rect(c,x-4,y-15,12,17,"#7a1420");rect(c,x-4,y-15,12,1,GOLD);rect(c,x-4,y+1,12,1,GOLD);rect(c,x-4,y-15,1,17,GOLD);rect(c,x+7,y-15,1,17,GOLD);rect(c,x-1,y-12,6,2,GOLD);rect(c,x-2,y-7,8,1,"#e9c9a0");rect(c,x-2,y-5,6,1,"#e9c9a0");rect(c,x-2,y-3,7,1,"#e9c9a0");rect(c,x,y+2,4,3,SKIN);},
 housse(c,x,y){rect(c,x+1,y-22,2,3,"#aeb4c3");rect(c,x+2,y-23,3,1,"#aeb4c3");rect(c,x-5,y-19,14,26,"#2a2a33");rect(c,x-5,y-19,14,1,"#44444f");rect(c,x+1,y-18,1,24,"#70707e");rect(c,x-2,y-16,3,3,WHITE);rect(c,x+2,y-16,3,3,WHITE);rect(c,x+9,y-12,6,4,PAPER);rect(c,x+10,y-11,4,1,RED);rect(c,x+10,y-9,3,1,"#685a67");},
 cigare(c,x,y,t){rect(c,x-4,y-4,17,4,"#6b4426");rect(c,x-4,y-4,17,1,"#8a5a32");rect(c,x+1,y-4,3,4,GOLD);rect(c,x+2,y-3,1,2,RED);rect(c,x+13,y-4,2,4,"#b9b4aa");if(blinkOn(t,400))rect(c,x+15,y-3,1,2,"#ff7a1a");const k=Math.floor((t||0)/400)%2;rect(c,x+14+k,y-9,1,3,"#dfe6f0");rect(c,x+15-k,y-12,1,2,"#dfe6f0");rect(c,x-1,y-1,4,4,SKIN);},
 chevaliere(c,x,y,t){rect(c,x-2,y-5,9,1,GOLD);rect(c,x-3,y-4,2,7,GOLD);rect(c,x+6,y-4,2,7,GOLD);rect(c,x-2,y+3,9,2,GOLD);rect(c,x-2,y+4,9,1,GOLD_D);rect(c,x-4,y-11,13,6,GOLD);rect(c,x-4,y-6,13,1,GOLD_D);rect(c,x-2,y-10,9,4,GOLD_D);rect(c,x+1,y-9,3,2,GOLD);glint(c,x+8,y-11,t);},
 figaroplie(c,x,y){rect(c,x-5,y-14,15,17,"#f2c4b0");rect(c,x-5,y-14,15,1,"#fbdccd");rect(c,x-3,y-12,11,2,K);rect(c,x-3,y-8,5,5,"#c99a88");for(const dy of [-8,-6,-4])rect(c,x+3,y+dy,5,1,"#8a6a60");rect(c,x-3,y-1,11,1,"#8a6a60");rect(c,x,y+2,4,3,SKIN);},
 champagne(c,x,y,t){rect(c,x-1,y-19,6,12,"#f2d27a");rect(c,x-1,y-19,6,2,"#fff3b0");rect(c,x-2,y-20,1,13,"#ffffff66");rect(c,x+5,y-20,1,13,"#ffffff66");rect(c,x,y-7,4,1,"#ffffff88");rect(c,x+1,y-6,2,8,"#ffffffaa");rect(c,x-1,y+2,6,1,"#ffffffaa");for(let i=0;i<3;i++){const f=(((t||0)/700)+i*0.33)%1;rect(c,x+i*2,y-8-f*10,1,1,"#ffffff");}},
 clevilla(c,x,y){c.strokeStyle="#c9d3dc";c.lineWidth=1;c.beginPath();c.arc(x+2.5,y-8.5,4,0,Math.PI*2);c.stroke();rect(c,x+1,y-5,2,11,"#c9d3dc");rect(c,x+3,y+2,3,1,"#c9d3dc");rect(c,x+3,y+4,2,1,"#c9d3dc");rect(c,x+4,y-5,2,8,"#d9a35f");rect(c,x+6,y-1,2,1,"#d9a35f");rect(c,x-6,y-4,6,7,"#2f5fb4");rect(c,x-4,y-3,1,4,WHITE);rect(c,x-5,y,4,1,"#d9a35f");}
};

// ===================================================================== 1.9.0: the satire wave (ids: wardrobe.mjs ITEMS)
// ---------------------------------------------------------------- left
const OUTFITS_L={
 // ---------------------------------------------------------------- left
 hologramme:{coat:"#2a5f9e",shirt:"#2a5f9e",tie:null,
  sky(c,t){   // the meeting's stage: a blue glow, the projector's cone, and the ghost of the other meeting (Lyon / Aubervilliers)
   const g=c.createRadialGradient(32,34,0,32,34,34);g.addColorStop(0,"rgba(70,170,255,.35)");g.addColorStop(1,"rgba(70,170,255,0)");c.fillStyle=g;c.fillRect(0,0,64,64);
   for(let y=8;y<60;y++){const w=8+(60-y)*0.55;c.fillStyle=`rgba(140,225,255,${(0.05+0.05*(y/60)).toFixed(3)})`;c.fillRect(Math.round(32-w/2),y,Math.round(w),1);}
   const flick=Math.floor(t/130),a=Math.floor(t/1700)%6===5?0:0.2+0.07*Math.sin(t/190),dx=-16+(flick%17===0?2:0);
   if(a>0){const col=`rgba(130,225,255,${a.toFixed(3)})`;c.fillStyle=col;
    for(let y=12;y<59;y+=2){   // the double, drawn on every other line: head, neck, body and arms, legs
     const spans=y<33?[[22,21]]:y<37?[[29,7]]:y<54?[[22,20],[18,4],[42,5]]:[[24,6],[35,6]];
     for(const [x,w] of spans)c.fillRect(x+dx,y,w,1);}
    c.fillStyle=`rgba(20,60,110,${(a*1.6).toFixed(3)})`;c.fillRect(27+dx,22,2,2);c.fillRect(36+dx,22,2,2);c.fillRect(30+dx,29,6,1);}
  },
  front(c){   // the Mao-collar jacket, buttoned to the neck, the lambda pin on the lapel
   rect(c,29,37,6,16,"#2a5f9e");rect(c,28,36,9,2,"#1f4a7e");rect(c,32,38,1,15,"#1f4a7e");for(const y of [40,44,48])rect(c,33,y,1,1,"#cfe8ff");
   rect(c,25,41,4,3,"#1f4a7e");rect(c,25,41,4,1,"#3a78bc");rect(c,36,46,4,3,"#1f4a7e");
   rect(c,36,39,1,1,RED);rect(c,37,40,1,1,RED);rect(c,37,41,1,1,RED);rect(c,36,42,1,1,RED);rect(c,38,42,1,1,RED);   // λ
  },
  fx(c,t){   // all of him is projected light: tinted blue, scanlines, a bright line rolling down, a slice slipping now and then
   c.globalCompositeOperation="source-atop";
   c.fillStyle="rgba(70,190,255,.62)";c.fillRect(0,0,64,64);
   c.fillStyle="rgba(8,30,80,.38)";for(let y=1;y<64;y+=2)c.fillRect(0,y,64,1);
   const band=Math.floor(t/35)%90-12;for(let k=0;k<3;k++){if(band+k<0||band+k>63)continue;c.fillStyle=`rgba(225,250,255,${(0.55-k*0.17).toFixed(2)})`;c.fillRect(0,band+k,64,1);}
   const g=Math.floor(t/120),glitch=g%11===0||g%37===5;
   if(glitch){const y0=15+(g*7)%36,h=1+g%3,sh=g%2?3:-3;
    c.globalCompositeOperation="destination-out";c.fillStyle="rgba(0,0,0,.95)";c.fillRect(0,y0,64,h);
    c.globalCompositeOperation="source-over";const [x0,w]=y0<34?[22,21]:[18,29];
    rect(c,x0+sh,y0,w,h,"rgba(110,215,255,.75)");rect(c,x0+sh+3,y0,4,h,"rgba(230,250,255,.9)");rect(c,x0+sh+w-6,y0,3,h,"rgba(30,90,170,.8)");}
   c.globalCompositeOperation="destination-out";for(let y=55;y<60;y++){c.fillStyle=`rgba(0,0,0,${(0.12+(y-55)*0.15).toFixed(2)})`;c.fillRect(0,y,64,1);}   // the feet dissolve into the beam
   c.globalCompositeOperation="lighter";
   c.fillStyle="rgba(90,200,255,.55)";c.beginPath();c.ellipse(32,60,13,2.2,0,0,Math.PI*2);c.fill();
   rect(c,26,59,12,2,"rgba(150,235,255,.6)");rect(c,30,59,4,1,"#e8fbff");   // the projector's lens
   sparks(c,t,9,["#9fe8ff","#4fc3ff","#e8fbff"],{x0:16,x1:48,y0:8,y1:58,speed:1500});
   c.globalCompositeOperation="source-over";
  }
 },
 caviar:{coat:"#16161c",shirt:"#f4f1ea",tie:null,
  front(c,t){   // the dinner jacket: satin lapels, pleated shirt, bow tie, a red rose in the buttonhole; the mother-of-pearl spoon in the left hand
   for(let y=37;y<47;y++){const d=Math.floor((y-37)/2);rect(c,24+d,y,3,1,"#3a3a48");rect(c,38-d,y,3,1,"#3a3a48");}
   rect(c,31,42,1,1,K);rect(c,31,45,1,1,K);
   rect(c,28,37,3,3,K);rect(c,33,37,3,3,K);rect(c,31,38,2,1,K);rect(c,29,38,1,1,"#3a3a48");rect(c,34,38,1,1,"#3a3a48");   // the bow tie
   rect(c,25,40,3,3,"#c41a28");rect(c,26,41,1,1,"#7a141c");rect(c,25,40,1,1,"#e8475a");rect(c,26,43,1,2,"#3f8a4a");   // the rose
   rect(c,36,44,3,1,WHITE);rect(c,37,43,1,1,WHITE);   // pocket square
   for(let i=0;i<5;i++)rect(c,21-i,50-i,1,1,i%2?"#d9d0e6":"#efe9f4");   // the spoon's handle, nacre
   rect(c,9,44,8,2,"#efe9f4");rect(c,10,46,6,1,"#cfe3ea");rect(c,11,47,4,1,"#d9d0e6");rect(c,9,44,1,1,"#e8d4ec");rect(c,16,44,1,1,"#cfe3ea");   // its bowl
   rect(c,10,42,6,2,"#15151b");rect(c,11,41,4,1,"#15151b");for(const [x,y] of [[11,42],[13,41],[14,43],[12,43]])rect(c,x,y,1,1,"#5a5a70");   // a heap of caviar
   rect(c,19,50,2,2,SKIN);
   const f=((t||0)/2300)%1;if(f<0.5)rect(c,13,46+Math.floor(f*20),1,1,"#15151b");   // a grain falls, nobody bends down
  },
  head(c){   // the mink toque: a tall fluffy drum, its outline tufted
   rect(c,22,5,21,10,"#6b4a36");rect(c,23,4,19,1,"#6b4a36");
   for(let x=22;x<43;x+=2)rect(c,x,3+(x%4?0:1),2,1,"#6b4a36");for(let y=5;y<15;y+=2){rect(c,21,y+(y%4?0:1),1,1,"#6b4a36");rect(c,43,y+(y%4?1:0),1,1,"#5a3c2b");}
   for(let y=6;y<14;y+=3)for(let x=23+(y%2)*2;x<41;x+=4)rect(c,x,y,2,1,"#8a6248");
   rect(c,38,5,4,10,"#5a3c2b");rect(c,22,13,21,2,"#5a3c2b");rect(c,24,5,6,1,"#a07a5c");
  }
 },
 frondeur:{coat:"#60656f",shirt:"#f1e9da",tie:"#c8506a",
  front(c){   // a grey PS suit, the rose pin, and the censure motion folded in the inside pocket, cobwebbed
   for(let y=37;y<47;y++){const d=Math.floor((y-37)/2);rect(c,25+d,y,1,1,"#4a4e57");rect(c,38-d,y,1,1,"#4a4e57");}
   rect(c,24,48,5,1,"#4a4e57");rect(c,35,48,5,1,"#4a4e57");
   rect(c,25,40,2,2,"#d42a2a");rect(c,25,40,1,1,"#ef6c89");rect(c,26,42,1,2,"#3f8a4a");   // the rose
   rect(c,36,38,4,7,"#7a2a3a");   // the jacket open on its lining
   rect(c,36,34,4,9,"#e8dcb0");rect(c,36,37,4,1,"#c9b98a");rect(c,39,34,1,9,"#d6c89a");rect(c,37,35,2,1,RED);rect(c,37,39,2,1,"#8a7a6a");rect(c,37,41,1,1,"#8a7a6a");
   for(const [x,y] of [[35,33],[36,34],[38,33],[40,34],[37,33],[39,35]])rect(c,x,y,1,1,"#dfe6f0bb");   // a cobweb: never filed
   rect(c,35,45,6,1,"#4a4e57");
  }
 },
 sanscravate:{coat:"#4b5568",shirt:"#2e9a4e",tie:null,
  front(c){   // the jacket open on an amateur club's jersey, number 10, the shirt collar out over the lapels
   rect(c,28,37,8,16,"#2e9a4e");rect(c,28,37,1,16,"#25803f");rect(c,35,37,1,16,"#25803f");
   rect(c,30,37,4,2,SKIN);rect(c,31,39,2,1,SKIN);rect(c,29,37,1,2,WHITE);rect(c,34,37,1,2,WHITE);rect(c,30,39,1,1,WHITE);rect(c,33,39,1,1,WHITE);rect(c,31,40,2,1,WHITE);   // the V-neck
   digit(c,29,43,1,WHITE);digit(c,32,43,0,WHITE);
   rect(c,25,36,3,3,WHITE);rect(c,26,39,1,1,WHITE);rect(c,37,36,3,3,WHITE);rect(c,38,39,1,1,WHITE);   // open shirt collar
   rect(c,24,40,3,10,"#3d4657");rect(c,37,40,3,10,"#3d4657");rect(c,28,51,8,2,"#25803f");
  }
 },
 agetudiante:{coat:"#8d94a0",shirt:"#8d94a0",tie:null,
  front(c){   // the faculty hoodie, a keffieh round the neck, the motion n° 47 in the left hand
   rect(c,24,35,17,3,"#7a818d");
   const kf=(x0,y0,w,h)=>{for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)rect(c,x,y,1,1,(Math.floor(x/2)+Math.floor(y/2))%2?"#2a2a33":"#efe9dc");};
   kf(25,33,15,5);kf(27,38,4,8);for(let x=27;x<31;x+=2)rect(c,x,46,1,2,"#efe9dc");rect(c,25,37,15,1,"#00000033");
   rect(c,34,38,1,6,WHITE);rect(c,37,38,1,5,WHITE);rect(c,26,47,13,4,"#7a818d");rect(c,26,47,13,1,"#6a717d");
   rect(c,32,40,6,3,"#1f3b78");rect(c,33,41,1,1,GOLD);rect(c,35,41,2,1,WHITE);   // the faculty crest
   rect(c,12,40,9,12,PAPER);rect(c,12,40,9,1,"#ffffff");
   const g=(x,y,s)=>{for(let i=0;i<15;i++)if(s[i]==="1")rect(c,x+i%3,y+Math.floor(i/3),1,1,RED);};g(13,42,"101101111001001");g(17,42,"111001010010010");   // 47
   for(const [y,w] of [[48,7],[50,5]])rect(c,13,y,w,1,"#685a67");rect(c,19,50,4,3,SKIN);
  }
 },
 bobo:{coat:"#b8323a",shirt:"#b8323a",tie:null,
  front(c){   // the buffalo-check shirt over a white tee, the craft IPA in the left hand, the fixie's pink rim by the feet
   for(const x of [26,30,34,38])rect(c,x,37,2,16,"#5e1a22");for(const y of [40,45,50])rect(c,24,y,16,2,"#5e1a22");
   for(const y of [41,46])rect(c,18,y,5,2,"#5e1a22");rect(c,30,37,4,2,"#f1ecd9");
   c.strokeStyle="#ff5fa8";c.lineWidth=2;c.beginPath();c.arc(8,52,5,0,Math.PI*2);c.stroke();   // the fixie: deep-V pink rim, mint frame, bullhorn bar
   rect(c,7,51,2,2,"#aeb4c3");rect(c,8,47,1,4,"#2fb5a0");rect(c,9,44,1,3,"#2fb5a0");rect(c,10,41,1,3,"#2fb5a0");rect(c,9,40,5,1,K);rect(c,13,39,1,1,K);
   rect(c,19,43,4,8,"#7a4a1e");rect(c,20,39,2,4,"#7a4a1e");rect(c,20,38,2,1,GOLD);rect(c,19,45,4,3,"#9fd8c8");rect(c,20,46,2,1,"#2e6f5a");rect(c,19,43,1,8,"#9a6a3a");   // the IPA
   rect(c,19,50,4,2,SKIN);
  },
  head(c){   // a small fisherman beanie up top, the handlebar moustache
   rect(c,23,7,19,6,"#c9902a");rect(c,22,11,21,3,"#a8761e");for(let x=23;x<43;x+=2)rect(c,x,11,1,3,"#8e6418");rect(c,24,7,8,1,"#ddb04a");
   rect(c,28,27,10,2,"#4a2e1c");rect(c,26,26,2,2,"#4a2e1c");rect(c,25,24,1,2,"#4a2e1c");rect(c,38,26,2,2,"#4a2e1c");rect(c,40,24,1,2,"#4a2e1c");rect(c,29,27,3,1,"#6a4630");
  }
 }
};
// Tiny 3x5 glyphs the shared digit() lacks.
const OBJECTS_L={
 // ---------------------------------------------------------------- left
 comptesuisse(c,x,y,t){   // a little Swiss safe: shut on the flag (« je n'ai pas »), then it swings open on the gold (« je n'ai jamais eu »)
  t=t||0;const open=Math.floor(t/1800)%3===2;
  rect(c,x-5,y-15,16,15,"#7a828f");rect(c,x-5,y-15,16,1,"#aeb4c3");rect(c,x-5,y-1,16,1,"#4f5560");rect(c,x+10,y-15,1,15,"#5a606e");rect(c,x-4,y,2,1,K);rect(c,x+7,y,2,1,K);
  if(!open){rect(c,x-3,y-13,12,11,"#9aa3b0");rect(c,x-3,y-13,12,1,"#c9d3dc");rect(c,x+8,y-13,1,11,"#7a828f");
   rect(c,x-2,y-12,5,5,RED);rect(c,x,y-11,1,3,WHITE);rect(c,x-1,y-10,3,1,WHITE);   // the white cross
   rect(c,x+3,y-9,5,5,"#3a3d45");rect(c,x+4,y-10,3,1,"#3a3d45");rect(c,x+4,y-4,3,1,"#3a3d45");rect(c,x+2,y-8,1,3,"#3a3d45");rect(c,x+8,y-8,1,3,"#3a3d45");   // the round dial
   rect(c,x+4,y-8,3,3,"#dfe6f0");const k=Math.floor(t/350)%4;rect(c,x+5,y-7,1,1,K);rect(c,x+5+[0,1,0,-1][k],y-7+[-1,0,1,0][k],1,1,RED);   // its needle, turning
   rect(c,x-4,y-12,1,2,K);rect(c,x-4,y-5,1,2,K);for(const dx of [-2,0,2])rect(c,x+dx,y-5,1,1,"#c9d3dc");}
  else{rect(c,x-3,y-13,12,11,"#26262e");
   rect(c,x-2,y-5,4,2,GOLD);rect(c,x+3,y-5,4,2,GOLD);rect(c,x,y-7,5,2,GOLD);for(const [dx,dy] of [[-2,-5],[3,-5],[0,-7]])rect(c,x+dx,y+dy,4,1,"#fff3b0");
   for(const [dx,dy] of [[-2,-12],[1,-11],[4,-12],[6,-10],[-1,-9]]){rect(c,x+dx,y+dy,2,2,GOLD);rect(c,x+dx,y+dy,1,1,"#fff3b0");}
   rect(c,x+11,y-14,3,13,"#9aa3b0");rect(c,x+11,y-12,2,4,RED);rect(c,x+11,y-14,3,1,"#c9d3dc");   // the door, swung open on its flag
   const f=(t%1800)/1800;rect(c,x+6,y-2+Math.floor(f*6),2,2,GOLD);}   // a coin slips out
  rect(c,x-1,y+1,4,3,SKIN);glint(c,x+10,y-16,t);
 },
 phobie(c,x,y,t){   // the pile of tax letters, never opened, tied with a red ribbon; it sways, and the top one keeps sliding off
  t=t||0;const hx=x;x+=2;   // the pile stands a little off the face
  for(let i=0;i<8;i++){const yy=y-3-i*3,dx=Math.round(wave(t,0,1,420)*i/4)+(i%3===1?1:i%3===2?-1:0),col=i%3===2?"#e4e8ee":i%2?"#b4c0d0":"#c9d3e0";
   rect(c,x-4+dx,yy,14,3,col);rect(c,x-4+dx,yy+2,14,1,"#8a96a8");rect(c,x+2+dx,yy+1,2,1,"#9aa6b8");   // the envelope, its flap
   if(i%2===0)rect(c,x+6+dx,yy,3,1,RED);else rect(c,x-3+dx,yy,2,2,"#2f5fb4");   // URGENT stamps, the Trésor public logo
   rect(c,x+4+dx,yy,1,3,RED);}   // the ribbon
  const top=Math.round(wave(t,0,1,420)*7/4);rect(c,x+2+top,y-27,2,2,RED);rect(c,x+5+top,y-27,2,2,RED);rect(c,x+4+top,y-26,1,1,"#a51e1e");rect(c,x+3+top,y-25,1,1,RED);rect(c,x+5+top,y-25,1,1,RED);   // the bow
  const life=(t/2600)%1;
  if(life<0.55){const sx=Math.round(life/0.55*7);rect(c,x-3+top+sx,y-30,10,3,"#dfe4ea");rect(c,x-3+top+sx,y-28,10,1,"#8a96a8");rect(c,x+4+top+sx,y-30,2,1,RED);}
  else{const f=(life-0.55)/0.45,yy=y-30+Math.floor(f*32),flip=Math.floor(f*8)%2;
   if(flip){rect(c,x+10,yy,3,8,"#dfe4ea");rect(c,x+12,yy,1,8,"#8a96a8");}else{rect(c,x+8,yy,8,3,"#dfe4ea");rect(c,x+8,yy+2,8,1,"#8a96a8");rect(c,x+13,yy,2,1,RED);}}
  rect(c,hx-1,y,4,3,SKIN);glint(c,x+11,y-24,t);
 },
 rosesfanees(c,x,y,t){   // the PS bouquet, wilted: three roses hanging their heads out of the kraft paper, a petal falling
  t=t||0;
  rect(c,x-1,y-15,1,7,"#7a8a4a");rect(c,x-2,y-16,1,1,"#7a8a4a");rect(c,x-3,y-16,1,1,"#7a8a4a");rect(c,x-6,y-15,4,4,"#8e3040");rect(c,x-5,y-11,2,1,"#5e1e28");rect(c,x-6,y-15,1,1,"#6b4a3a");rect(c,x-4,y-14,1,2,"#5e1e28");   // the left one, head down
  rect(c,x+2,y-20,1,12,"#7a8a4a");rect(c,x+3,y-21,2,1,"#7a8a4a");rect(c,x+5,y-20,1,1,"#7a8a4a");rect(c,x+4,y-19,4,4,"#9a3444");rect(c,x+5,y-15,2,1,"#5e1e28");rect(c,x+7,y-19,1,1,"#6b4a3a");rect(c,x+4,y-18,1,1,"#b8505a");rect(c,x+6,y-18,1,2,"#5e1e28");   // the tall one, bent over
  rect(c,x+5,y-12,1,4,"#7a8a4a");rect(c,x+6,y-13,2,1,"#7a8a4a");rect(c,x+8,y-12,3,4,"#8e3040");rect(c,x+9,y-8,1,1,"#5e1e28");rect(c,x+10,y-12,1,1,"#6b4a3a");   // the third, fallen flat
  rect(c,x-2,y-11,2,1,"#a8a050");rect(c,x+3,y-14,2,1,"#9a8a40");rect(c,x+6,y-10,1,1,"#8a6a3a");   // dry leaves
  for(let k=0;k<10;k++){const w=12-k;rect(c,x-4+Math.ceil(k/2),y-8+k,w,1,k%3===0?"#b8895a":"#c9a06a");}rect(c,x-4,y-8,12,1,"#dcb884");   // the kraft cone
  rect(c,x-2,y-4,8,1,"#c8506a");rect(c,x+1,y-5,2,1,"#c8506a");   // the pink ribbon
  const f=(t/1900)%1;rect(c,x+9+Math.round(Math.sin(t/300)*2),y-8+Math.floor(f*14),2,1,f<0.5?"#8a2e3a":"#6b4a3a");
  rect(c,x,y,4,3,SKIN);
 },
 primairepop(c,x,y,t){   // the ballot for the one single candidate: a big « 1 » on top, seven names below; the cross can't decide
  t=t||0;rect(c,x-6,y-27,17,31,PAPER);rect(c,x-6,y-27,17,1,"#ffffff");rect(c,x+10,y-27,1,31,"#d8cdb0");
  digit(c,x-4,y-25,1,RED);rect(c,x,y-24,8,1,"#685a67");rect(c,x,y-22,6,1,"#685a67");rect(c,x-4,y-19,13,1,"#b8ad90");
  const cols=["#d42a2a","#ef6c89","#3fb37f","#a4141f","#f2a03a","#8a4ab8","#2f9ad0"],pick=Math.floor(t/450)%7;
  for(let i=0;i<7;i++){const ry=y-17+i*3;rect(c,x-4,ry,2,2,cols[i]);rect(c,x-1,ry,4+(i*5)%4,1,"#685a67");rect(c,x+6,ry,3,2,"#685a67");rect(c,x+7,ry,1,1,PAPER);
   if(i===pick){rect(c,x+6,ry,1,1,RED);rect(c,x+8,ry,1,1,RED);rect(c,x+7,ry+1,1,1,RED);}}
  rect(c,x-1,y+3,4,3,SKIN);
 },
 nupes(c,x,y,t){   // the agreement, torn in two and taped back; after each tweet the halves come apart again
  t=t||0;const s=Math.floor(t/1500)%5===4?1:0,tear=r=>x+2+Math.round(Math.sin(r*1.4)*1.2)+Math.floor(r/7);
  const lines={2:[-3,8,"#c41a28"],5:[-3,8,"#685a67"],7:[-3,6,"#685a67"],9:[-3,8,"#685a67"],11:[-3,5,"#685a67"],15:[-4,-1,"#c41a28"],16:[0,2,"#3fb37f"],17:[3,5,"#ef6c89"],14:[6,8,"#8a4ab8"]};
  for(let r=0;r<19;r++){const yy=y-19+r,tx=tear(r);
   rect(c,x-5,yy,tx-(x-5),1,PAPER);rect(c,tx+s,yy,x+10-tx,1,PAPER);rect(c,tx+s,yy,1,1,"#a89c80");rect(c,tx-1,yy,1,1,"#d8cdb0");if(s)rect(c,tx,yy,1,1,"#00000055");
   const L=lines[r];if(L){const a=x+L[0],b=x+L[1];if(a<tx)rect(c,a,yy,Math.min(b,tx-1)-a+1,1,L[2]);if(b>=tx)rect(c,Math.max(a,tx)+s,yy,b-Math.max(a,tx)+1,1,L[2]);}}
  for(const r of [1,8,15]){const tx=tear(r);rect(c,tx-2,y-20+r,5+s,3,"#ead47cd0");rect(c,tx-2,y-20+r,5+s,1,"#fff6d0d0");rect(c,tx-2,y-18+r,5+s,1,"#c9b050d0");}   // the strips of tape
  rect(c,x+9+s,y-19,1,19,"#d8cdb0");rect(c,x-1,y,4,3,SKIN);
 },
 synthese(c,x,y,t){   // eight stapled pages of grey text; nobody read them
  t=t||0;for(let i=3;i>0;i--){rect(c,x-5+i,y-18+i,14,19,i%2?"#d8cdb0":"#e8dfc4");}
  rect(c,x-5,y-18,14,19,PAPER);rect(c,x-5,y-18,14,1,"#ffffff");rect(c,x-4,y-17,3,1,"#8a929e");rect(c,x-4,y-16,1,1,"#8a929e");   // the staple
  rect(c,x-2,y-15,9,2,"#4a4452");
  for(let r=0;r<6;r++)rect(c,x-4,y-11+r*2,[12,11,12,10,12,7][r],1,"#9a94a0");
  for(let i=0;i<3;i++){const f=((t/2400)+i/3)%1;digit(c,x+9+Math.round(f*3)+i,y-21-Math.floor(f*9),"z",`rgba(168,201,255,${(1-f).toFixed(2)})`);}
  rect(c,x-1,y,4,3,SKIN);
 },
 petition(c,x,y,t){   // a clipboard: 1247 at the top, the signatures, two of them the same, one of them Mickey's
  t=t||0;const hx=x;x+=2;rect(c,x-6,y-22,19,24,"#8a5a32");rect(c,x-6,y-22,19,1,"#a8703a");rect(c,x-5,y-20,17,21,PAPER);rect(c,x,y-24,6,3,"#aeb4c3");rect(c,x+1,y-24,4,1,"#dfe6f0");
  digit(c,x-4,y-18,1,RED);digit(c,x,y-18,2,RED);digit(c,x+4,y-18,4,RED);digit(c,x+8,y-18,7,RED);rect(c,x-4,y-12,15,1,"#b8ad90");
  const sig=(sx,sy,col,n=7)=>{for(const [dx,dy] of [[0,1],[1,0],[2,1],[3,0],[4,1],[5,0],[6,1]].slice(0,n))rect(c,sx+dx,sy+dy,1,1,col);};
  sig(x-3,y-10,"#2f5fb4");rect(c,x+6,y-9,4,1,"#685a67");
  sig(x-3,y-7,"#685a67");rect(c,x+6,y-6,4,1,"#685a67");
  sig(x-3,y-4,"#685a67");rect(c,x+6,y-3,4,1,"#685a67");   // the double
  rect(c,x-2,y-1,3,2,K);rect(c,x-3,y-2,2,2,K);rect(c,x+1,y-2,2,2,K);   // Mickey
  sig(x+3,y-1,"#2f5fb4",Math.min(7,1+Math.floor(t/220)%12));   // the 1 248th, being signed
  rect(c,hx-1,y+1,4,3,SKIN);
 }
};
// ---------------------------------------------------------------- right
// Tiny capitals five pixels high, for the NYPD tee (rows of 0/1, the N one pixel wider). Returns the letter's width.
const LETTERS={N:["1001","1101","1011","1001","1001"],Y:["101","101","010","010","010"],P:["110","101","110","100","100"],D:["110","101","101","101","110"]};
function letter(c,x,y,l,col){const s=LETTERS[l];s.forEach((row,j)=>{for(let i=0;i<row.length;i++)if(row[i]==="1")rect(c,x+i,y+j,1,1,col);});return s[0].length;}
// The Manif pour tous' family on its white badge: dad and son in blue, mum and daughter in pink, hands joined.
const FAMILY=[".XX...XX.......",
              ".XX...XX.......",
              "...............",
              "XXXX.XXXX......",
              ".XX..XXXX..X..X",
              ".XX.XXXXXX.....",
              ".XX...XX.XXXXXX",
              ".XX...XX...X..X"];
function family(c,x,y,small){
 if(small){for(const [dx,h] of [[0,5],[2,5],[5,3],[7,3]]){rect(c,x+dx,y+5-h,1,1,WHITE);rect(c,x+dx,y+7-h,1,h-1,WHITE);}rect(c,x,y+3,8,1,WHITE);return;}
 rect(c,x-1,y-1,17,10,WHITE);
 FAMILY.forEach((row,j)=>{for(let i=0;i<row.length;i++)if(row[i]==="X")rect(c,x+i,y+j,1,1,i<4||(i>9&&i<13)?"#3a6fc0":"#d9487f");});
}
const OUTFITS_R={
 // ---------------------------------------------------------------- right
 levallois:{coat:"#2a4c9a",shirt:"#f2b8c6",tie:null,
  sky(c,t){   // Giverny: a half-timbered Normandy watermill, its wheel turning, water lilies on the pond
   rect(c,0,53,21,11,"#4f86b8");for(let x=1;x<20;x+=5)rect(c,x+(Math.floor(t/500)+x)%3,55+(x%3)*3,3,1,"#7fb0dc");
   for(const [x,y] of [[13,61],[16,56],[2,61]]){rect(c,x,y,3,1,"#4f9a58");rect(c,x+1,y-1,1,1,"#ef8aa8");}
   rect(c,3,28,16,25,"#efe6d2");rect(c,3,28,16,1,"#6b4426");rect(c,3,40,16,1,"#6b4426");                       // the walls, their beams
   for(const x of [3,10,18])rect(c,x,28,1,25,"#6b4426");for(let i=0;i<6;i++)rect(c,11+i,41+i*2,1,2,"#6b4426");
   rect(c,12,31,4,5,"#6f9fd8");rect(c,13,31,1,5,"#6b4426");rect(c,12,33,4,1,"#6b4426");                         // a window
   for(let i=0;i<10;i++){rect(c,10-i,18+i,4+2*i,1,i%3===2?"#8a7442":"#a8905a");}rect(c,10,17,4,1,"#6f9a4a");    // the thatch, irises on the ridge
   rect(c,1,38,9,2,"#6b4426");const f=Math.floor(t/120);for(let i=0;i<3;i++)rect(c,2+i,40+((f+i*4)%12),1,2,"#9bc4e8");   // the race, water falling on the wheel
   const a=t/700;   // the wheel: rim, spokes, paddles
   for(let k=0;k<32;k++){const b=k*Math.PI/16;rect(c,7+Math.cos(b)*5,46+Math.sin(b)*5,1,1,"#8a6040");}
   for(let s=0;s<3;s++){const b=a+s*Math.PI/3;for(let r=-4;r<=4;r++)rect(c,7+Math.cos(b)*r,46+Math.sin(b)*r,1,1,"#6b4426");}
   for(let s=0;s<10;s++){const b=a+s*Math.PI/5;for(const r of [6,7])rect(c,7+Math.cos(b)*r,46+Math.sin(b)*r,1,1,"#4a2e1c");}
   rect(c,6,45,2,2,"#2a1a10");
  },
  front(c){   // the double-breasted chalk-stripe, the pink shirt open on a gold chain, the pocket square, the cufflink
   const D="#1c3672";
   for(const x of [25,38])rect(c,x,45,1,8,"#4a72c4");rect(c,29,45,6,8,"#2a4c9a");
   for(let i=0;i<8;i++){rect(c,25+Math.floor(i/2),37+i,3,1,D);rect(c,37-Math.floor(i/2),37+i,3,1,D);}   // the peaked lapels
   rect(c,33,45,1,8,D);for(const [x,y] of [[29,46],[36,46],[29,50],[36,50]])rect(c,x,y,1,1,GOLD);         // the crossing, four gold buttons
   for(const [x,y] of [[29,37],[30,38],[31,39],[34,38],[35,37],[33,39]])rect(c,x,y,1,1,GOLD);rect(c,31,40,3,2,GOLD);rect(c,32,40,1,1,"#fff3b0");
   rect(c,37,42,3,1,"#f2b8c6");rect(c,38,41,1,1,"#f2b8c6");
   rect(c,18,49,5,1,"#f2b8c6");rect(c,20,49,1,1,GOLD);
  },
  head(c,t){   // tinted aviators, gold frame, a shine sliding across now and then
   rect(c,24,20,17,1,GOLD);rect(c,22,21,3,1,GOLD);rect(c,40,21,3,1,GOLD);
   for(const x0 of [25,34]){rect(c,x0,21,6,2,"#5a3420");rect(c,x0,23,6,2,"#8a5a34");rect(c,x0+1,25,4,1,"#a8744a");rect(c,x0,21,1,4,GOLD_D);rect(c,x0+5,21,1,4,GOLD_D);}
   rect(c,31,21,3,1,GOLD);
   const k=Math.floor(t/90)%30;if(k<16&&k!==6&&k!==7&&k!==8)rect(c,25+k,22,1,1,"#ffe8c0");
  },
  fx(c,t){   // banknotes (100, 500, 200) drifting down around him
   for(let i=0;i<6;i++){const y=((t/70)+i*19)%60,x=(i*23+5+Math.sin(t/380+i*2)*4+60)%58,col=["#7fb88a","#b38ad0","#e3b85a"][i%3];
    if(blinkOn(t+i*130,260)){rect(c,x,y,5,2,col);rect(c,x+2,y,1,2,"#ffffff99");}else{rect(c,x+1,y,3,3,col);rect(c,x+2,y+1,1,1,"#ffffff99");}}
  }
 },
 trocadero:{coat:"#b9a072",shirt:"#e8e2d0",tie:"#2a3550",
  front(c,t){   // the soaked trench: wide lapels, storm flap, belt, dark wet patches; the umbrella blown inside out in the left hand
   rect(c,23,52,18,3,"#b9a072");rect(c,23,54,18,1,"#8a7450");
   for(const [x,y,h] of [[25,43,10],[28,49,6],[38,45,8],[35,51,4]])rect(c,x,y,1,h,"#97815a");
   for(let i=0;i<6;i++){rect(c,24+Math.floor(i/2),37+i,3,1,"#a08a5e");rect(c,38-Math.floor(i/2),37+i,3,1,"#a08a5e");}
   rect(c,35,39,5,4,"#a08a5e");rect(c,24,47,16,2,"#8a7450");rect(c,30,47,3,2,"#5a4a30");rect(c,31,47,1,1,"#b9a072");
   for(const [x,y] of [[27,44],[36,44],[27,50],[36,50]])rect(c,x,y,1,1,"#5a4a30");
   const s=wave(t,0,1.6,140);   // the wind pushes the canopy's top
   for(let i=0;i<=27;i++)rect(c,11+Math.round(i*8/27),24+i,1,1,K);
   for(let y=11;y<=23;y++){const hw=Math.round(9*Math.sqrt((23-y)/12)),dx=Math.round(s*(23-y)/12);   // the canopy, a tulip of panels
    for(let x=-hw;x<=hw;x++)rect(c,11+x+dx,y,1,1,Math.floor((x/(hw+0.5)+1)*2.5)%2?"#3a64b0":"#284480");}
   const top=Math.round(s);for(let x=4;x<19;x+=4)rect(c,x+top,10,2,1,"#284480");                                    // the scalloped edge, now on top
   for(const [ex,ey] of [[2,7],[7,5],[11,6],[15,5],[20,7]])for(let k=0;k<=8;k++){const f=k/8,dy=23-ey;if(k>5)rect(c,Math.round(11+(ex-11)*f+s*f*dy/12),Math.round(23-dy*f),1,1,k>6?"#e4e8ee":"#9aa3b0");}   // ribs sticking out
   if(blinkOn(t,180))rect(c,20+top,11,3,2,"#3a64b0");else rect(c,21+top,13,2,3,"#3a64b0");                           // a torn flap
   rect(c,19,50,4,3,SKIN);rect(c,20,53,1,2,K);rect(c,21,55,2,1,K);rect(c,23,54,1,1,K);
  },
  head(c,t){for(let i=0;i<3;i++){const y=14+((t/110)+i*5)%13;rect(c,[24,40,31][i],y,1,2,"#9bc4e8");}},   // drops running down
  fx(c,t){   // the rain, slanted by the wind, splashes on the ground, the hem dripping
   for(let i=0;i<22;i++){const y=((t/8)+i*41)%61,x=((i*29)+60-y*0.35+(t/40))%62;rect(c,x,y,1,2,"#b4d2f0cc");rect(c,x-1,y+2,1,1,"#b4d2f088");}
   for(let i=0;i<4;i++)if(blinkOn(t+i*170,340)){const x=6+i*15;rect(c,x,61,1,1,"#cfe2f5");rect(c,x-1,60,1,1,"#cfe2f5");rect(c,x+1,60,1,1,"#cfe2f5");}
   for(let i=0;i<3;i++){const y=56+((t/70)+i*3)%7;rect(c,26+i*6,y,1,1,"#9bc4e8");}
  }
 },
 chouan:{coat:"#6b5a44",shirt:"#e8e0c8",tie:null,
  front(c){   // the peasant's jacket, horn buttons, a red belt; the Sacred Heart sewn on the chest; sabots; the pitchfork in the left hand
   rect(c,29,37,6,3,"#f4f1ea");rect(c,30,40,4,1,"#d8d2c0");                                                    // the white neckcloth
   for(let i=0;i<7;i++){rect(c,26+Math.floor(i/3),37+i,2,1,"#584a36");rect(c,37-Math.floor(i/3),37+i,2,1,"#584a36");}
   for(const y of [44,47,50])rect(c,28,y,1,1,"#d8c8a0");rect(c,24,48,16,2,"#a4141f");rect(c,24,49,16,1,"#7a0f18");
   rect(c,32,39,8,9,"#d8d2c0");rect(c,33,40,6,7,"#f4f1ea");                                                     // the Sacred Heart: a white patch,
   rect(c,33,42,2,1,RED);rect(c,36,42,2,1,RED);rect(c,33,43,5,2,RED);rect(c,34,45,3,1,RED);rect(c,35,46,1,1,RED);   // the red heart,
   rect(c,35,40,1,3,"#7a0f18");rect(c,34,41,3,1,"#7a0f18");                                                     // the small cross above it
   for(const x0 of [23,35]){rect(c,x0,57,8,2,"#8a5a32");rect(c,x0,57,8,1,"#a8703a");}                           // the sabots
   rect(c,18,17,2,41,"#8a6a44");rect(c,18,17,1,41,"#a88660");                                                     // the pitchfork: its handle,
   rect(c,15,15,8,2,"#7a7f8a");for(const x of [15,18,21])rect(c,x,8,1,7,x===18?"#9aa3b0":"#7a7f8a");for(const x of [15,21])rect(c,x,8,1,1,"#c9d3dc");rect(c,18,7,2,2,"#c9d3dc");   // the iron tines
   rect(c,17,49,6,4,SKIN);rect(c,17,51,6,1,"#c78e76");
  },
  head(c){   // the round black felt hat, wide brim, a white cockade
   rect(c,24,7,17,7,"#1d1d22");rect(c,25,6,15,1,"#1d1d22");rect(c,24,12,17,2,"#4a3a2a");rect(c,17,14,31,2,"#1d1d22");rect(c,17,15,31,1,"#2c2c34");
   rect(c,36,10,4,4,WHITE);rect(c,37,11,2,2,"#d8d2c0");
  }
 },
 footing:{coat:"#9aa3b0",shirt:"#9aa3b0",tie:null,
  front(c){   // the grey NYPD tee, bare forearms, a sweatband, running shorts, bare legs, white sneakers
   rect(c,29,37,6,2,"#7f8896");let lx=24;for(const l of "NYPD")lx+=letter(c,lx,41,l,"#1f2a44")+1;
   rect(c,18,45,5,5,SKIN);rect(c,42,45,5,5,SKIN);rect(c,18,48,5,2,WHITE);rect(c,18,49,5,1,"#2f5fb4");
   rect(c,24,50,16,4,"#1f2a44");rect(c,24,53,6,1,"#1f2a44");rect(c,35,53,6,1,"#1f2a44");rect(c,31,51,2,2,"#16203a");rect(c,24,50,1,4,WHITE);rect(c,39,50,1,4,WHITE);
   rect(c,25,54,4,3,SKIN);rect(c,36,54,4,3,SKIN);
   for(const x0 of [23,35]){rect(c,x0,57,7,2,WHITE);rect(c,x0,58,7,1,"#c9d3dc");rect(c,x0+2,57,2,1,RED);}
  },
  head(c){   // the Ray-Ban wayfarers and the terry headband
   rect(c,23,15,19,2,WHITE);rect(c,23,16,19,1,"#d8dde4");rect(c,31,15,3,2,"#2f5fb4");
   for(const x0 of [25,34]){rect(c,x0,21,6,3,K);rect(c,x0,20,6,1,"#3a3d45");rect(c,x0+1,21,1,1,"#5a606e");}rect(c,31,21,3,1,K);rect(c,23,21,2,1,K);rect(c,40,21,2,1,K);
  },
  fx(c,t){   // he is being filmed: the viewfinder's corners, the REC light, the boom mic dangling in from the top
   const L="#ffffffcc";for(const [x,y,sx,sy] of [[1,1,1,1],[62,1,-1,1],[1,62,1,-1],[62,62,-1,-1]]){rect(c,x,y,1,1,L);rect(c,x+sx,y,1,1,L);rect(c,x+2*sx,y,1,1,L);rect(c,x,y+sy,1,1,L);rect(c,x,y+2*sy,1,1,L);}
   if(blinkOn(t,500))rect(c,4,4,2,2,RED);
   const b=Math.round(wave(t,0,1,700));for(let i=0;i<10;i++)rect(c,3+i,8+Math.round(i*0.3)+(i>5?b:0),1,1,"#3a3d45");
   rect(c,12,10+b,6,4,"#8a8478");rect(c,13,9+b,4,1,"#8a8478");rect(c,12,10+b,6,1,"#a49e92");rect(c,13,14+b,4,1,"#6f6a60");
  }
 },
 manifpourtous:{coat:"#ee8fb5",shirt:"#ee8fb5",tie:null,
  front(c,t){   // the pink hoodie, its blue hood and pocket, the stick family on the chest; the little flag in the left hand
   rect(c,24,35,16,3,"#6fa3dc");rect(c,26,37,12,1,"#5a8cc8");rect(c,27,37,1,2,WHITE);rect(c,36,37,1,2,WHITE);
   rect(c,26,48,12,5,"#d97aa2");rect(c,26,48,12,1,"#c86a92");for(let x=18;x<23;x++)rect(c,x,48,1,1,"#6fa3dc");
   family(c,24,40);
   const s=Math.round(wave(t,0,1,220));rect(c,20,24,1,28,"#8a6a44");
   for(let col=0;col<12;col++){const dy=Math.round(wave(t,col,1,200));rect(c,8+col,25+dy,1,9,col<6?"#ee8fb5":"#6fa3dc");}
   family(c,10,27+s,true);rect(c,19,49,4,4,SKIN);
  }
 },
 enarque:{coat:"#1f2c4f",shirt:"#f4f1ea",tie:"#4a5a7a",
  front(c){   // the navy suit, narrow lapels, a white pocket square; the leather folder tucked under the left arm
   for(let i=0;i<7;i++){rect(c,26+Math.floor(i/3),37+i,2,1,"#16213d");rect(c,37-Math.floor(i/3),37+i,2,1,"#16213d");}
   rect(c,36,42,3,1,WHITE);rect(c,37,41,1,1,WHITE);for(const y of [47,51])rect(c,34,y,1,1,"#3a4a70");
   rect(c,11,41,14,9,"#6b4426");rect(c,11,41,14,1,"#8a5a32");rect(c,11,49,14,1,"#4a3022");rect(c,12,40,9,1,PAPER);rect(c,14,39,5,1,PAPER);
   rect(c,13,44,3,2,GOLD);rect(c,18,41,5,8,"#1f2c4f");rect(c,18,48,5,1,"#16213d");
  },
  head(c){   // thin rectangular glasses
   for(const x0 of [25,34]){rect(c,x0,21,6,1,"#3a3d45");rect(c,x0,24,6,1,"#3a3d45");rect(c,x0,21,1,4,"#3a3d45");rect(c,x0+5,21,1,4,"#3a3d45");rect(c,x0+1,22,1,1,"#dfeaf5");}
   rect(c,31,22,3,1,"#3a3d45");rect(c,23,22,2,1,"#3a3d45");rect(c,40,22,2,1,"#3a3d45");
  }
 }
};
const OBJECTS_R={
 // ---------------------------------------------------------------- right
 bracelet(c,x,y,t){   // the ankle monitor, gold-plated: a fat strap loop held up by its bottom, the box and its LED, the bling twinkling
  const L="#fff3b0";x+=2;
  rect(c,x-3,y-21,9,2,GOLD);rect(c,x-3,y-21,9,1,L);rect(c,x-5,y-19,2,2,GOLD);rect(c,x+6,y-19,2,2,GOLD_D);
  rect(c,x-6,y-17,2,10,GOLD);rect(c,x-6,y-17,1,10,L);rect(c,x+7,y-17,2,10,GOLD_D);
  rect(c,x-5,y-7,2,2,GOLD);rect(c,x+6,y-7,2,2,GOLD_D);rect(c,x-3,y-5,9,2,GOLD);rect(c,x-3,y-4,9,1,GOLD_D);
  for(const dy of [-15,-12,-9])rect(c,x-5,y+dy,1,1,GOLD_D);
  rect(c,x+4,y-17,11,10,GOLD_D);rect(c,x+5,y-16,9,8,GOLD);rect(c,x+5,y-16,9,1,L);rect(c,x+5,y-16,1,8,L);    // the box
  rect(c,x+7,y-14,5,3,"#8a6414");rect(c,x+8,y-13,3,1,GOLD_D);for(const [dx,dy] of [[6,-10],[12,-10]])rect(c,x+dx,y+dy,1,1,GOLD_D);
  rect(c,x+12,y-15,1,1,blinkOn(t,600)?"#3ad35a":"#ff3b2f");
  rect(c,x-1,y-4,5,4,SKIN);rect(c,x-1,y-2,5,1,"#c78e76");
  const ph=Math.floor((t||0)/220)%6;
  [[x-9,y-22],[x+13,y-21],[x-9,y-11],[x+12,y-5],[x+3,y-25],[x+9,y-24]].forEach(([sx,sy],i)=>{if((ph+i)%3)return;
   rect(c,sx,sy+1,3,1,GOLD);rect(c,sx+1,sy,1,3,GOLD);rect(c,sx+1,sy+1,1,1,"#ffffff");});
  glint(c,x+13,y-16,t);
 },
 bouclier(c,x,y,t){   // the tax shield: a heraldic écu, gold rim, blue field, a chief of gold coins, the € in the middle
  const L=x-3,T=y-22;
  for(let r=0;r<23;r++){const ins=r<12?0:Math.round((r-11)*7/11),w=17-2*ins;rect(c,L+ins,T+r,w,1,r===0?"#fff3b0":GOLD);
   if(w>2&&r>0&&r<22)rect(c,L+ins+1,T+r,w-2,1,r<6?"#1f3b78":BLUE);rect(c,L+ins,T+r,1,1,r<12?"#fff3b0":GOLD);rect(c,L+ins+w-1,T+r,1,1,GOLD_D);}
  for(const dx of [3,7,11]){rect(c,L+dx,T+2,2,2,GOLD);rect(c,L+dx,T+3,2,1,GOLD_D);}
  ["..111",".1...","1111.",".1...","1111.",".1...","..111"].forEach((row,j)=>{for(let i=0;i<5;i++)if(row[i]==="1")rect(c,L+6+i,T+8+j,1,1,GOLD);});
  const k=Math.floor((t||0)/70)%46;if(k<22)for(let j=0;j<5;j++){const sx=L+k-j,sy=T+6+j;if(sx>L&&sx<L+16)rect(c,sx,sy,1,1,"#ffffff55");}   // a shine sweeping across
  rect(c,L-1,T+9,2,5,SKIN);rect(c,L-1,T+13,2,1,"#c78e76");
  glint(c,L+15,T,t);
 },
 painvole(c,x,y,t){   // the stolen pain au chocolat: a bite out of its corner, crumbs falling, a black burglar's glove, the alarm going off
  for(let j=-10;j<=-3;j++)for(let i=-4;i<=9;i++){const d=(i-9)**2+(j+11)**2;if(d<10)continue;
   rect(c,x+i,y+j,1,1,d<16?"#f2dcae":j<=-9?"#e9c07a":(i===-1||i===3)&&j>-9?"#c48a44":j===-3?"#b07a3a":"#d9a35f");}
  rect(c,x-5,y-7,1,3,"#4a2a18");rect(c,x+10,y-6,1,3,"#4a2a18");rect(c,x+7,y-6,2,1,"#4a2a18");
  for(let i=0;i<3;i++){const f=(((t||0)/700)+i/3)%1;rect(c,x+7+i,y-5+f*11,1,1,i===1?"#4a2a18":"#e9c07a");}
  rect(c,x-1,y-3,5,4,"#1d1d22");rect(c,x,y-3,1,1,"#3a3d4a");rect(c,x-1,y+1,5,1,"#34343e");
  if(blinkOn(t,300)){rect(c,x+1,y-20,2,5,RED);rect(c,x+1,y-14,2,2,RED);for(const [dx,dy] of [[-4,-19],[-3,-16],[6,-19],[5,-16]])rect(c,x+dx,y+dy,2,1,"#ff6a5a");}
  else rect(c,x+1,y-15,2,1,"#a4141f");
 },
 lingot(c,x,y,t){   // the gold ingot: a trapezoid, its top face lit, the hallmark, a shine sweeping across
  rect(c,x-1,y-11,11,1,"#fff3b0");rect(c,x-2,y-10,13,1,"#ffe58a");rect(c,x-3,y-9,15,1,"#ffe58a");
  rect(c,x-4,y-8,17,6,GOLD);rect(c,x-4,y-8,1,6,GOLD_D);rect(c,x+12,y-8,1,6,GOLD_D);rect(c,x-4,y-3,17,1,GOLD_D);
  rect(c,x+1,y-7,7,3,GOLD_D);rect(c,x+2,y-6,5,1,"#ffe58a");
  const k=Math.floor((t||0)/55)%50;if(k<20)for(let j=0;j<9;j++){const sx=x-4+k-j;if(sx>=x-3+Math.max(0,2-j)&&sx<=x+11-Math.max(0,2-j))rect(c,sx,y-11+j,1,1,"#ffffffbb");}
  rect(c,x,y-2,4,3,SKIN);
 },
 courcomptes(c,x,y,t){   // the Cour des comptes report: a fat grey-blue binder, the red « classé » stamp, dust and a cobweb
  rect(c,x-4,y-18,12,20,"#6f86a0");rect(c,x-4,y-18,2,20,"#4f6680");rect(c,x-4,y-18,12,1,"#8aa0b8");
  rect(c,x+8,y-17,3,19,PAPER);for(let j=-15;j<2;j+=2)rect(c,x+8,y+j,3,1,"#d8cdb0");rect(c,x+8,y+1,3,1,"#4f6680");
  rect(c,x-1,y-15,7,4,PAPER);rect(c,x,y-14,5,1,"#685a67");rect(c,x,y-12,3,1,"#685a67");rect(c,x-1,y-16,2,1,BLUE);rect(c,x+1,y-16,2,1,WHITE);rect(c,x+3,y-16,2,1,RED);
  rect(c,x-2,y-8,10,1,RED);rect(c,x-2,y-4,10,1,RED);rect(c,x-2,y-8,1,5,RED);rect(c,x+7,y-8,1,5,RED);
  for(const [dx,w] of [[0,2],[3,1],[5,1]])rect(c,x+dx,y-6,w,1,RED);
  rect(c,x-3,y-19,11,1,"#b8b2a488");rect(c,x+5,y-19,3,1,"#c9c3b5");
  for(const [dx,dy] of [[8,-19],[9,-20],[10,-21],[11,-19],[11,-21],[11,-20],[9,-19],[10,-19]])rect(c,x+dx,y+dy,1,1,"#e8eaec");   // the cobweb
  for(let i=0;i<3;i++){const f=(((t||0)/2400)+i/3)%1;rect(c,x-5+i*6+Math.sin((t||0)/500+i)*2,y-20-f*5,1,1,"#d8d2c4");}
  rect(c,x,y+1,4,3,SKIN);
 },
 giletquart(c,x,y){   // the navy quilted gilet on its hanger, dangling from the raised hand; the sailing club's anchor on the chest
  rect(c,x+1,y-7,3,1,"#aeb4c3");rect(c,x+3,y-6,1,2,"#aeb4c3");rect(c,x,y-4,5,4,SKIN);rect(c,x,y-2,5,1,"#c78e76");rect(c,x+2,y,1,2,"#aeb4c3");
  for(let i=0;i<4;i++){rect(c,x+2-i*2,y+2+i,2,1,"#c9a06a");rect(c,x+2+i*2,y+2+i,2,1,"#c9a06a");}
  rect(c,x-2,y+4,3,3,"#1f2a44");rect(c,x+4,y+4,3,3,"#1f2a44");rect(c,x-2,y+7,4,1,"#1f2a44");rect(c,x+3,y+7,4,1,"#1f2a44");
  rect(c,x-3,y+8,11,2,"#1f2a44");rect(c,x-4,y+10,13,9,"#1f2a44");
  for(const dy of [9,12,15,18])rect(c,x-4,y+dy,13,1,"#2f3d5e");rect(c,x+2,y+8,1,11,"#9aa3b0");rect(c,x-4,y+18,13,1,"#16203a");
  rect(c,x+5,y+11,1,4,WHITE);rect(c,x+4,y+12,3,1,WHITE);rect(c,x+4,y+14,1,1,WHITE);rect(c,x+6,y+14,1,1,WHITE);
 },
 cartefouquets(c,x,y){   // the Fouquet's loyalty card: burgundy and gold, ten slots, one stamp (May 2007)
  rect(c,x-5,y-12,16,11,"#7a1420");rect(c,x-5,y-12,16,1,GOLD);rect(c,x-5,y-2,16,1,GOLD);rect(c,x-5,y-12,1,11,GOLD);rect(c,x+10,y-12,1,11,GOLD);
  rect(c,x-3,y-10,3,1,GOLD);rect(c,x-3,y-9,2,1,GOLD);rect(c,x-3,y-8,1,1,GOLD);rect(c,x+1,y-10,7,1,"#e9c9a0");rect(c,x+1,y-8,5,1,"#b88a6a");
  for(let j=0;j<2;j++)for(let i=0;i<5;i++){const sx=x-3+i*3,sy=y-6+j*2;rect(c,sx,sy,2,1,i+j===0?GOLD:"#4f0c14");}
  rect(c,x-3,y-6,1,1,"#fff3b0");
  rect(c,x-5,y-1,16,1,"#00000040");rect(c,x-1,y-1,3,4,SKIN);
 }
};
// ---------------------------------------------------------------- both camps
// Tiny 3x5 glyphs that digit() lacks: the 4, 7 and 9 of « 49.3 » and « 7 h », and the h.
const LODEN="#3f5a45",LODEN_D="#2f4635",BLEU="#3a5d9c",BLEU_D="#2c4a80";

// ===================================================================== outfits (both camps)
const OUTFITS_A={
 enmemetemps:{coat:BLEU,shirt:BLEU,tie:null,   // the body in workwear blue (so the raised arm stays blue); the front paints the loden half
  front(c){
   // left half (x<32): the right's Sunday loden, with its long hem, lapel, horn buttons, white cuff, flannel and brogues
   rect(c,24,37,8,16,LODEN);rect(c,23,52,9,3,LODEN);rect(c,23,54,9,1,LODEN_D);rect(c,24,37,5,4,LODEN_D);
   rect(c,18,39,5,12,LODEN);rect(c,18,49,5,1,"#f1e9da");
   rect(c,29,37,3,9,"#f1e9da");rect(c,30,39,2,2,"#5a1e2a");rect(c,30,41,2,9,"#7a2a3a");rect(c,30,50,1,1,"#7a2a3a");   // half a shirt, half a tie, cut at the seam
   for(const y of [43,47])rect(c,26,y,2,2,"#6b4426");
   rect(c,24,54,6,3,"#5a5448");rect(c,24,57,6,2,"#6b4426");rect(c,25,57,2,1,"#9a6a40");
   // right half (x>=32): the left's bleu de travail, open collar, chest pocket, little snaps at other heights, work trousers, boots
   rect(c,32,37,7,2,BLEU_D);rect(c,32,37,2,1,"#e8e2d0");rect(c,34,40,5,4,BLEU_D);rect(c,34,40,5,1,"#5a7cba");
   for(const y of [42,46,50])rect(c,33,y,1,1,"#cfd6df");
   rect(c,32,52,8,1,BLEU_D);rect(c,35,54,6,3,BLEU_D);rect(c,35,57,6,2,"#2a2420");rect(c,39,57,2,1,"#d9ab2a");
   for(let y=37;y<55;y+=2)rect(c,32,y,1,1,"#e8e2d0");   // the seam, stitched right down the middle
  },
  head(c){   // half a Tyrolean felt hat (feather, brim to the left), half a workman's cap (peak to the right)
   rect(c,24,7,8,7,LODEN);rect(c,25,6,7,1,LODEN);rect(c,24,12,8,1,"#7a2a3a");rect(c,19,13,13,2,LODEN_D);
   rect(c,22,5,1,3,"#c9a06a");rect(c,23,8,1,4,"#c9a06a");rect(c,22,8,1,1,"#8a6a44");
   rect(c,32,7,8,1,BLEU);rect(c,32,8,10,6,BLEU);rect(c,32,13,10,1,BLEU_D);rect(c,32,14,13,2,BLEU_D);rect(c,35,9,3,1,"#5a7cba");
   for(let y=6;y<16;y+=2)rect(c,32,y,1,1,"#e8e2d0");
  }
 },
 marcheur:{coat:"#1f2b4d",shirt:"#f4f1ea",tie:null,   // the 2017 start-up look: slim navy suit, open white shirt, the badge, white sneakers
  front(c){
   rect(c,31,37,3,2,SKIN);rect(c,32,39,1,1,SKIN);rect(c,28,37,2,2,WHITE);rect(c,35,37,2,2,WHITE);   // the open collar, no tie
   rect(c,28,39,1,8,"#141c36");rect(c,36,39,1,8,"#141c36");rect(c,29,46,6,1,"#141c36");rect(c,31,48,2,1,"#0d1226");   // slim lapels, one button
   rect(c,37,40,3,1,"#f2d230");rect(c,36,41,5,2,"#f2d230");rect(c,37,43,3,1,"#f2d230");rect(c,37,41,3,2,BLUE);rect(c,38,41,1,1,WHITE);   // the round badge
   rect(c,24,54,6,1,"#1f2b4d");rect(c,35,54,6,1,"#1f2b4d");rect(c,25,55,4,1,SKIN);rect(c,36,55,4,1,SKIN);   // cropped trousers, no socks
   for(const x0 of [23,34]){rect(c,x0,56,8,4,WHITE);rect(c,x0,59,8,1,"#8a909c");rect(c,x0+2,57,4,1,"#c9d3dc");rect(c,x0+6,56,2,1,"#dfe3ea");}   // white sneakers
  }
 }
};

// ===================================================================== objects (both camps)
const OBJECTS_A={
 dissolution(c,x,y,t){   // the big red button on its box, the safety cover flipped up; a finger comes down, presses, and boom
  t=t||0;const ph=(t%2000)/2000;
  const fy=ph<0.5?Math.round(wave(t,0,1,200)):ph<0.6?Math.round((ph-0.5)*50):ph<0.8?5:Math.round((1-ph)*25);   // 0 = up, 5 = pressed
  const down=ph>=0.6&&ph<0.8;
  if(ph>=0.6){const k=(ph-0.6)/0.4,r=3+k*13;   // the shockwave: a ring of sparks widening around the button
   for(let i=0;i<12;i++){const a=i*Math.PI/6;rect(c,x+2+Math.cos(a)*r,y-10+Math.sin(a)*r*0.6,1,1,k<0.5?(i%2?"#fff3b0":GOLD):(i%2?"#ff8a3a":RED));}
  }
  rect(c,x-4,y-6,13,8,"#3a3d45");rect(c,x-4,y-7,13,1,"#5a606e");rect(c,x+8,y-6,1,8,"#2a2c33");   // the box
  for(let i=0;i<12;i+=2){rect(c,x-4+i,y-2,1,2,"#f2d230");rect(c,x-3+i,y-2,1,2,K);}   // hazard stripes
  rect(c,x-4,y-17,2,10,"#bfe3ff88");rect(c,x-4,y-17,1,10,"#ffffffaa");   // the safety cover, open
  rect(c,x-2,y-8,9,1,"#aeb4c3");const d=down?1:0;   // the bezel, the dome (sinks when pressed)
  rect(c,x-1,y-10+d,7,2,down?"#ff3b2f":RED);rect(c,x,y-11+d,5,1,down?"#ff3b2f":RED);rect(c,x+1,y-11+d,2,1,"#ff9a8a");rect(c,x-1,y-9+d,7,1,"#a51e1e");
  const top=y-22+fy;   // the hand of fate comes in from the right, sleeve and cuff, index finger first
  rect(c,x+8,top-1,6,5,"#1f2b4d");rect(c,x+7,top-1,1,5,WHITE);rect(c,x+1,top,6,4,SKIN);rect(c,x+1,top+3,6,1,"#c78e76");rect(c,x+1,top+4,2,3,SKIN);rect(c,x+1,top+6,2,1,"#f2c8b0");
  if(down)for(const [dx,dy,w,h] of [[-7,-12,2,1],[-6,-15,1,2],[9,-9,2,1],[10,-12,1,1],[-7,-8,2,1]])rect(c,x+dx,y+dy,w,h,"#fff3b0");   // the flash
  rect(c,x-1,y+2,5,3,SKIN);   // the hand holding the box
  glint(c,x-5,y-18,t);
 },
 matignon(c,x,y,t){   // a little gilded Louis XV chair on a spring, rocket flames under its feet, bouncing in and out of the hand
  t=t||0;const b=Math.round(Math.abs(Math.sin(t/300))*6),base=y-5-b,f=Math.floor(t/90)%2;   // base = the chair's feet
  if(b>3){rect(c,x-6,base-11,1,5,"#dfe6f0");rect(c,x+10,base-9,1,5,"#dfe6f0");rect(c,x-5,base-4,1,3,"#dfe6f0");}   // speed lines
  for(let yy=base-2;yy<y-1;yy++){const k=(yy-base)&3;rect(c,k===0||k===2?x:k===1?x:x+4,yy,k===0||k===2?5:1,1,k===0||k===2?"#cfd6df":"#8a909c");}   // the spring
  if(b>0)for(const lx of [x-3,x+7]){rect(c,lx-1,base+1,3,2+f,"#ff6a1a");rect(c,lx,base+1,1,2+(1-f),"#ffd23f");}   // the flames
  rect(c,x-1,base-15,7,9,"#b0242c");rect(c,x,base-14,1,7,"#d0404a");rect(c,x+2,base-12,2,3,"#8e1c24");   // the back's velvet, its medallion
  rect(c,x-2,base-15,1,10,GOLD);rect(c,x+6,base-15,1,10,GOLD);rect(c,x-1,base-16,7,1,GOLD);rect(c,x+1,base-17,3,1,GOLD);rect(c,x+2,base-18,1,1,GOLD_D);
  rect(c,x-3,base-6,11,2,"#c41a28");rect(c,x-2,base-6,9,1,"#e0404a");rect(c,x-3,base-4,11,1,GOLD);rect(c,x-1,base-3,7,1,GOLD_D);   // the seat, its carved apron
  for(const [lx,s] of [[x-3,1],[x+7,-1]]){rect(c,lx,base-3,1,2,GOLD);rect(c,lx+s,base-1,1,1,GOLD);rect(c,lx,base,1,1,GOLD_D);}   // cabriole legs
  rect(c,x-1,y-1,6,1,"#5a606e");rect(c,x-1,y,6,3,SKIN);   // the plate in the palm
  glint(c,x+7,base-17,t);
 },
 art493(c,x,y,t){   // the bill held up; the rubber stamp drops on it, thud, and leaves « 49.3 » in red
  t=t||0;const ph=(t%1800)/1800,down=ph>=0.6&&ph<0.8;
  const sb=ph<0.5?y-16+Math.round(wave(t,0,1,240)):ph<0.6?y-16+Math.round((ph-0.5)*100):down?y-5:y-5-Math.round((ph-0.8)*55);   // the stamp's bottom
  const sh=down&&ph<0.66?1:0;   // the paper jolts on impact
  rect(c,x-7,y-16+sh,18,19,PAPER);rect(c,x-7,y-16+sh,18,1,"#ffffff");rect(c,x+10,y-16+sh,1,19,"#d8cdb0");
  rect(c,x-5,y-14+sh,9,1,"#685a67");rect(c,x-5,y-2+sh,12,1,"#685a67");rect(c,x-5,y+sh,8,1,"#685a67");   // the bill's lines
  if(!down){rect(c,x-6,y-12,15,1,RED);rect(c,x-6,y-4,15,1,RED);   // the imprint between two rules
   digit(c,x-5,y-10,4,RED);digit(c,x-1,y-10,9,RED);rect(c,x+3,y-6,1,1,RED);digit(c,x+5,y-10,3,RED);}
  rect(c,x-1,y+3,5,3,SKIN);   // the hand under the bill
  rect(c,x-6,sb-1,15,1,K);rect(c,x-6,sb-5,15,4,"#8a5a32");rect(c,x-6,sb-5,15,1,"#b07a48");rect(c,x-6,sb-2,15,1,"#6b4426");   // rubber, wooden block
  rect(c,x,sb-8,3,3,"#4a3022");rect(c,x-1,sb-12,5,4,"#b0242c");rect(c,x-1,sb-12,5,1,"#d0404a");rect(c,x,sb-11,1,2,"#e0606a");   // neck, red knob
  if(down){for(const [dx,dy,w] of [[-10,-7,2],[-11,-10,2],[11,-7,2],[11,-10,2]])rect(c,x+dx,y+dy,w,1,"#fff3b0");   // the thud
   rect(c,x-9,y-5,1,1,"#cfd6df");rect(c,x+12,y-5,1,1,"#cfd6df");}
 },
 homard(c,x,y,t){   // a big cooked lobster held up by the tail: claws spread and snapping, antennae swaying, still steaming
  t=t||0;const R="#d6402e",RD="#9c2418",RL="#f07a52";
  for(let i=0;i<8;i++){rect(c,x-1-Math.round(i*0.7)+Math.round(wave(t,i,i*0.15,300)),y-18-i,1,1,RD);rect(c,x+4+Math.round(i*0.7)+Math.round(wave(t,i+3,i*0.15,300)),y-18-i,1,1,RD);}   // the antennae
  for(const [px,ph] of [[x-8,0],[x+6,1]]){   // the claws: a palm, two fingers that open and shut
   const open=blinkOn(t+ph*350,350)?1:0,py=y-19;
   rect(c,px,py,4,4,R);rect(c,px,py+3,4,1,RD);rect(c,px+1,py,1,3,RL);
   rect(c,px-open,py-4,2,4,R);rect(c,px+2+open,py-3,2,3,R);rect(c,px-open,py-4,1,1,RL);
   if(!open)rect(c,px+2,py-3,1,3,RD);
  }
  rect(c,x-4,y-15,3,2,R);rect(c,x-5,y-16,2,1,RD);rect(c,x+5,y-15,3,2,R);rect(c,x+7,y-16,2,1,RD);   // the arms
  for(let i=0;i<3;i++){rect(c,x-2,y-12+i*2,1,1,RD);rect(c,x+5,y-12+i*2,1,1,RD);}   // little legs
  rect(c,x-1,y-15,6,9,R);rect(c,x,y-14,1,7,RL);rect(c,x+4,y-15,1,9,RD);rect(c,x,y-17,4,2,R);rect(c,x+1,y-18,2,1,R);   // carapace, head
  rect(c,x,y-17,1,1,K);rect(c,x+3,y-17,1,1,K);
  rect(c,x,y-6,4,5,R);for(const dy of [-5,-3])rect(c,x,y+dy,4,1,RD);   // the tail
  rect(c,x-1,y-2,6,3,SKIN);rect(c,x-1,y,6,1,"#c78e76");rect(c,x-2,y+1,8,2,R);rect(c,x,y+1,1,2,RD);rect(c,x+3,y+1,1,2,RD);   // the fist, the tail fan below
  const k=Math.floor(t/400)%2;rect(c,x+9+k,y-9,1,3,"#dfe6f0");rect(c,x+11-k,y-12,1,2,"#dfe6f0");   // steam
 },
 promesse(c,x,y,t){   // the guarantee certificate: its lines fade away one by one (the seal stays), then it is printed again; fingers crossed
  t=t||0;const life=(t%7000)/7000;
  rect(c,x-6,y-19,16,19,PAPER);rect(c,x-6,y-19,16,1,"#ffffff");rect(c,x+9,y-19,1,19,"#d8cdb0");
  for(const [a,b,w,h] of [[-5,-18,14,1],[-5,-2,14,1],[-5,-18,1,17],[8,-18,1,17]])rect(c,x+a,y+b,w,h,GOLD_D);   // the gilt border
  const ink=(i,col)=>{const f=Math.min(1,Math.max(0,(life-0.2-i*0.1)/0.1));return f>=1?null:col+Math.round((1-f)*255).toString(16).padStart(2,"0");};
  const lines=[[-3,-16,10,2,"#1f3b78"],[-3,-12,10,1,"#685a67"],[-3,-10,8,1,"#685a67"],[-3,-8,10,1,"#685a67"],[-3,-6,6,1,"#685a67"],[-3,-4,5,1,"#1d1d22"]];
  lines.forEach(([dx,dy,w,h,col],i)=>{const cc=ink(i,col);if(cc)rect(c,x+dx,y+dy,w,h,cc);});   // the title, the clauses, the signature
  rect(c,x+3,y-7,2,5,RED);rect(c,x+6,y-7,2,5,RED);rect(c,x+4,y-3,1,1,PAPER);rect(c,x+6,y-3,1,1,PAPER);   // the ribbon's tails
  rect(c,x+3,y-9,5,4,"#c41a28");rect(c,x+4,y-10,3,6,"#c41a28");rect(c,x+4,y-8,3,2,"#e0404a");rect(c,x+5,y-8,1,1,GOLD);   // the wax seal
  rect(c,x-1,y,5,3,SKIN);rect(c,x-1,y-2,1,2,SKIN);rect(c,x,y-3,1,2,SKIN);rect(c,x+1,y-2,1,2,"#c78e76");rect(c,x+2,y-3,1,2,SKIN);rect(c,x+1,y-3,1,1,"#c78e76");   // crossed fingers
 },
 elements(c,x,y,t){   // the A4 sheet sent at 7 h, its copies fanning out behind it, a highlighter going over the key line
  t=t||0;const s=Math.floor(t/500)%3;
  for(let i=2;i>=1;i--){const o=i*2+(i===2?s%2:0);rect(c,x-5+o,y-19-o,14,20,i===2?"#d8d0bc":"#e6dcc2");}   // the photocopies behind
  rect(c,x-5,y-19,14,20,PAPER);rect(c,x-5,y-19,14,1,"#ffffff");rect(c,x+8,y-19,1,20,"#d8cdb0");
  digit(c,x+1,y-17,7,RED);digit(c,x+5,y-17,"h",RED);rect(c,x-3,y-16,4,2,"#1d1d22");   // « 7 h » in the corner, the heading
  const hl=Math.min(9,Math.floor(((t%2400)/2400)*14));if(hl)rect(c,x-2,y-10,hl,3,"#f2e05a");   // the highlighter's stroke
  for(const [dy,w] of [[-12,8],[-9,9],[-6,7],[-3,8]]){rect(c,x-3,y+dy,1,1,"#1d1d22");rect(c,x-1,y+dy,w,1,"#685a67");}   // the bullets
  rect(c,x-3,y-1,4,1,"#685a67");
  rect(c,x-1,y+1,4,3,SKIN);
 },
 tweet(c,x,y,t){   // the phone: the post (2 h), the screenshot's flash (2 h 01), the red cross and the bin (2 h 04); the capture stays
  t=t||0;const ph=(t%3600)/3600,TB="#4aa3e8",shot=ph>=0.32;
  rect(c,x-3,y-22,11,22,K);rect(c,x-2,y-20,9,18,"#eef3f8");rect(c,x+1,y-21,3,1,"#3a3d45");
  rect(c,x-1,y-18,3,2,TB);rect(c,x+1,y-19,2,1,TB);rect(c,x-2,y-19,1,1,TB);rect(c,x+4,y-19,2,1,"#9aa3b0");   // the bird, the clock
  if(ph<0.75){rect(c,x-1,y-16,2,2,"#e0a040");rect(c,x+2,y-16,4,1,K);rect(c,x+2,y-15,3,1,"#9aa3b0");   // the post
   rect(c,x-1,y-13,7,1,"#685a67");rect(c,x-1,y-11,6,1,RED);rect(c,x-1,y-9,4,1,"#685a67");}
  else{rect(c,x-1,y-16,7,1,"#cfd6df");rect(c,x-1,y-9,7,1,"#cfd6df");rect(c,x,y-13,5,1,"#b8c0cc");}   // gone: an empty frame
  if(ph>=0.55&&ph<0.75){for(let i=0;i<7;i++){rect(c,x-1+i,y-16+i,1,1,RED);rect(c,x+5-i,y-16+i,1,1,RED);}   // deleted
   if(blinkOn(t,150)){rect(c,x+4,y-8,2,1,RED);rect(c,x+3,y-7,4,1,RED);rect(c,x+3,y-6,4,4,RED);rect(c,x+4,y-6,1,3,"#a51e1e");}}
  else if(ph>=0.75){rect(c,x+4,y-8,2,1,"#9aa3b0");rect(c,x+3,y-7,4,1,"#9aa3b0");rect(c,x+3,y-6,4,4,"#9aa3b0");}
  if(shot){rect(c,x-2,y-7,4,5,"#9aa3b0");rect(c,x-1,y-6,2,3,WHITE);rect(c,x-1,y-6,1,1,"#e0a040");rect(c,x-1,y-4,2,1,RED);}   // the capture, safe in a corner
  if(ph>=0.25&&ph<0.32){rect(c,x-2,y-20,9,18,"#ffffff");   // the flash
   for(const [dx,dy,w,h] of [[-6,-23,2,1],[-5,-25,1,2],[9,-23,2,1],[9,-25,1,2],[-6,0,2,1],[10,0,2,1]])rect(c,x+dx,y+dy,w,h,"#fff3b0");}
  rect(c,x-1,y,4,3,SKIN);
 }
};
Object.assign(OUTFIT_LOOKS,OUTFITS_L,OUTFITS_R,OUTFITS_A);Object.assign(OBJECT_LOOKS,OBJECTS_L,OBJECTS_R,OBJECTS_A);

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
// The pixel helpers, for the wardrobe's mock-ups (maquette/) and the tests: same palette, same strokes.
export {rect,K,PAPER,GOLD,GOLD_D,BLUE,RED,WHITE,SKIN,wave,blinkOn,glint,sparks,star5,hammerSickle,lys,rose,cockade,digit};
