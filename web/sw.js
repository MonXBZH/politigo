// PolitiGo service worker: duel notifications (Web Push), nothing else. No fetch handler and no cache: the game
// stays online-only and a redeploy is visible at once. Registered by app.js only when the player turns them on.
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));

const ORIGIN=self.location.origin;
// A link from a push is only ever followed inside the game: anything else (another site, garbage) opens the home.
function sameOrigin(u){try{const x=new URL(u,ORIGIN);return x.origin===ORIGIN?x.href:ORIGIN+"/";}catch{return ORIGIN+"/";}}
const text=(v,max,def)=>typeof v==="string"&&v.trim()?v.trim().slice(0,max):def;
const windows=()=>self.clients.matchAll({type:"window",includeUncontrolled:true});

self.addEventListener("push",e=>{
 let d={};
 try{const v=e.data?e.data.json():null;if(v&&typeof v==="object")d=v;}catch{}   // missing or not JSON: a generic notice
 const title=text(d.title,80,"PolitiGo"),body=text(d.body,240,"Du nouveau dans tes duels."),tag=text(d.tag,64,"politigo-duel"),url=sameOrigin(text(d.url,500,"/"));
 // Always shown, even with the game on screen (it toasts the same news): Safari may revoke a subscription whose
 // pushes show nothing. The tag makes it replace the page's own notice for the same duel instead of stacking.
 e.waitUntil(self.registration.showNotification(title,{body,tag,data:{url}}));
});

self.addEventListener("notificationclick",e=>{
 e.notification.close();
 const url=sameOrigin(e.notification.data?.url||"/");
 e.waitUntil(windows().then(async list=>{
  const c=list.find(w=>w.url.startsWith(ORIGIN+"/"));
  if(c){try{return await c.focus();}catch{}}
  return self.clients.openWindow(url);
 }));
});
