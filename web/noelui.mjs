// Trêve des confiseurs, the screen's side (app.js): what the decor and the Advent sheet need to know, worked out from
// the server's clock in the game's time zone (rules.mjs setTimeZone). No DOM, no canvas: tested on its own.
import {H,dayKey,clockOf,isNoel,NOEL,ADVENT,fxNames} from "./rules.mjs";

const civil=ms=>{const k=dayKey(Math.floor(ms/H));return {y:Math.floor(k/10000),m:Math.floor(k/100)%100,d:k%100};};

// The moment of the season: "" outside the theme, "eve" on 24 December from 18 h to 25 December 6 h (the sleigh),
// "voeux" on 31 December from 20 h to midnight, "day" the rest of the time. Midnight on 1 January is another scene.
export function noelMoment(ms,event){
 if(!isNoel(event)||!Number.isFinite(ms))return "";
 const {m,d}=civil(ms),h=clockOf(ms).hour;
 if(m===12&&((d===24&&h>=18)||(d===25&&h<6)))return "eve";
 if(m===12&&d===31&&h>=20)return "voeux";
 return "day";
}
// The year of the December the theme belongs to: 1 January still counts for the one before.
export function noelYear(ms){const {y,m}=civil(ms);return m===1?y-1:y;}
// The camp's New Year's Eve speech, wishing for the year to come.
export function voeuxText(camp,ms){
 const t=NOEL.voeux[camp];if(!t)return "";
 return t.replaceAll("{annee}",String(noelYear(ms)+1));
}

// The boxes in a shuffled order, as on a real calendar (the validated mockup's).
export const ADVENT_ORDER=Object.freeze([13,2,21,7,18,10,5,24,15,1,11,20,8,17,3,22,12,6,19,4,23,9,16,14]);
const LABEL={today:"à ouvrir",open:"ouverte",missed:"oubliée",later:"pas encore"};
// The sheet's grid at `now` (the game clock, as adventBlock reads it): each box's state (today, open, missed, later),
// the 24th in gold while it may still be opened, whether today's box can be opened, and a line under the grid.
export function adventCells(S,event,now){
 const {y,m,d}=civil(now),theme=isNoel(event);
 // 1 January looks back at the December just gone; any other month (a theme forced by the console) has not begun.
 const year=m===1?y-1:y,today=theme&&m===12&&d<=24?d:0,past=m===12?Math.min(d,25):m===1?25:0;
 const a=S?.advent,opened=new Set(a&&a.y===year&&Array.isArray(a.opened)?a.opened:[]);
 const cells=ADVENT_ORDER.map(day=>{
  const state=opened.has(day)?"open":day===today?"today":day<past?"missed":"later";
  return {day,state,gold:day===24&&(state==="today"||state==="later"),text:state==="open"?"✓":state==="missed"?"·":String(day),label:`Case ${day}, ${LABEL[state]}`};
 });
 const canOpen=today>0&&!opened.has(today),over=m===1||(m===12&&d>24);
 const note=!theme?"Il n'y a pas de calendrier de l'Avent en ce moment."
  :m===1?"Le calendrier est fini : rendez-vous en décembre prochain."
  :over?"Les 24 cases sont passées. Rendez-vous à la Saint-Sylvestre !"
  :m!==12?"Le calendrier s'ouvre le 1er décembre."
  :canOpen?"Touche la case du jour pour l'ouvrir. Une case oubliée reste fermée : reviens chaque jour !"
  :"La case du jour est ouverte : la suivante t'attend demain.";
 return {cells,today:today&&!over?today:0,canOpen,over,note};
}

// What a box holds: a line of flavour and what it pays (rules.mjs ADVENT; gauges or bulletins, never FM).
const FLAVOUR=["Une papillote de la buvette de l'Assemblée.","Un vin chaud offert par un huissier.","Un bulletin glissé dans une chaussette.",
 "Une part de bûche des questeurs.","Un savon parfumé à la cannelle.","Deux bulletins dans une boule à neige."];
export function adventGiftText(day){
 const g=ADVENT[day-1];if(!Number.isInteger(day)||!g)return null;
 if(g.k==="all")return {text:"La grande case du réveillon !",pay:`+${g.bulletins} bulletins, toutes les jauges +${g.n}`};
 const pay=g.k==="bulletins"?`+${g.n} bulletin${g.n>1?"s":""}`:`${fxNames[g.k]} +${g.n}`;
 return {text:FLAVOUR[(day-1)%FLAVOUR.length],pay};
}

// E.T. (homage): a boy's bike crossing the moon, now and then. A draw per hour of the SERVER's clock, so every
// player sees it at the same moment: 0, 1 or 2 passes (40/40/20 %), at whole minutes before minute 55, two passes
// at least 10 minutes apart, ET_MS each. The hour's index alone seeds the draw (mulberry32, as in snowball.mjs).
export const ET_MS=15000;   // from the left edge of the round screen to the right one, at the validated speed
const HOUR_MS=3600000;
function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// The passes of the hour `hourIdx` (Math.floor(ms / 3 600 000)), as offsets in ms from the top of the hour, sorted.
export function etPlan(hourIdx){
 if(!Number.isInteger(hourIdx)||hourIdx<0)return [];
 const r=rng(Math.imul(hourIdx,2654435761)>>>0),a=r();if(a<0.4)return [];
 const m1=Math.floor(r()*50);if(a<0.8)return [m1*60000];
 const m2=(m1+10+Math.floor(r()*35))%55;return [m1*60000,m2*60000].sort((x,y)=>x-y);
}
// How far through a pass the bike is at `serverMs` (0 to 1), or null when it is not flying.
export function etProgress(serverMs){
 if(!Number.isFinite(serverMs))return null;
 const hi=Math.floor(serverMs/HOUR_MS),off=serverMs-hi*HOUR_MS;
 for(const at of etPlan(hi)){const k=(off-at)/ET_MS;if(k>=0&&k<=1)return k;}
 return null;
}
