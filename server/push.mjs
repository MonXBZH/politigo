// Web Push for PolitiGo: VAPID (RFC 8292) and message encryption (RFC 8291, aes128gcm content coding of RFC 8188).
// Node built-ins only. Nothing here throws into a request handler: the server sends and forgets.
import crypto from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";

const b64u=b=>Buffer.from(b).toString("base64url");
const B64U_RE=/^[A-Za-z0-9_-]+={0,2}$/;
const unb64u=s=>typeof s==="string"&&s.length<=200&&B64U_RE.test(s)?Buffer.from(s.replace(/=+$/,""),"base64url"):null;

// Only the browsers' own push services: the server never posts to an address a player made up (SSRF).
const PUSH_HOSTS=new Set(["fcm.googleapis.com","updates.push.services.mozilla.com","web.push.apple.com"]);
const PUSH_SUFFIXES=[".push.apple.com",".notify.windows.com"];
// The one spelling an endpoint is stored and compared in (host case, default port), or null for garbage.
export function canonicalEndpoint(s){
 if(typeof s!=="string"||s.length>1000)return null;
 try{const h=new URL(s).href;return h.length<=1000?h:null;}catch{return null;}
}
export function validEndpoint(s){
 if(typeof s!=="string"||s.length>1000)return false;
 let u;try{u=new URL(s);}catch{return false;}
 if(u.protocol!=="https:"||u.port!==""||u.username||u.password)return false;
 const h=u.hostname;
 return PUSH_HOSTS.has(h)||PUSH_SUFFIXES.some(x=>h.endsWith(x)&&h.length>x.length);
}
// The browser's keys: a P-256 point (uncompressed, and really on the curve) and a 16-byte secret.
export function validKeys(k){
 if(!k||typeof k!=="object")return null;
 const p256dh=unb64u(k.p256dh),auth=unb64u(k.auth);
 if(!p256dh||p256dh.length!==65||p256dh[0]!==4||!auth||auth.length!==16)return null;
 try{crypto.ECDH.convertKey(p256dh,"prime256v1");}catch{return null;}
 return {p256dh:b64u(p256dh),auth:b64u(auth)};
}

// RFC 8291: one aes128gcm record, the sender's ephemeral key in the header. salt and asPrivate are only passed by
// the test (the RFC's example vector); in use both are fresh for every message.
const hkdf=(ikm,salt,info,len)=>Buffer.from(crypto.hkdfSync("sha256",ikm,salt,info,len));
export function encrypt(plaintext,{p256dh,auth},{salt=crypto.randomBytes(16),asPrivate=null}={}){
 const ua=Buffer.from(p256dh,"base64url"),secret=Buffer.from(auth,"base64url");
 const ecdh=crypto.createECDH("prime256v1");if(asPrivate)ecdh.setPrivateKey(asPrivate);else ecdh.generateKeys();
 const as=ecdh.getPublicKey(),shared=ecdh.computeSecret(ua);
 const ikm=hkdf(shared,secret,Buffer.concat([Buffer.from("WebPush: info\0"),ua,as]),32);
 const cek=hkdf(ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16),nonce=hkdf(ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12);
 const c=crypto.createCipheriv("aes-128-gcm",cek,nonce);
 // 0x02: this is the last (and only) record; no padding.
 const body=Buffer.concat([c.update(Buffer.concat([Buffer.from(plaintext),Buffer.from([2])])),c.final(),c.getAuthTag()]);
 const rs=Buffer.alloc(4);rs.writeUInt32BE(4096);
 return Buffer.concat([salt,rs,Buffer.from([as.length]),as,body]);
}

// The server's VAPID key, made once and kept next to the database (like invite.txt). An unreadable or
// unwritable file never stops the game: the key then lives in memory (subscriptions made with it die at restart).
export function loadVapid(file,log=console){
 const fromPrivate=d=>{const e=crypto.createECDH("prime256v1");e.setPrivateKey(d);const pub=e.getPublicKey();
  const key=crypto.createPrivateKey({key:{kty:"EC",crv:"P-256",d:b64u(d),x:b64u(pub.subarray(1,33)),y:b64u(pub.subarray(33))},format:"jwk"});
  return {publicKey:b64u(pub),key,d};};
 // A file that is there but unreadable or damaged is left untouched (it may come back, or be repaired by hand):
 // a fresh saved key would silently orphan every subscription made with the old one.
 let save=true;
 try{const j=JSON.parse(readFileSync(file,"utf8")),d=unb64u(j?.privateKey);if(d&&d.length===32)return fromPrivate(d);save=false;log.error(`${file}: no usable key, using a temporary one (file left untouched)`);}
 catch(e){if(e.code!=="ENOENT"){save=false;log.error(`${file}: ${e.message}, using a temporary key (file left untouched)`);}}
 const e=crypto.createECDH("prime256v1");e.generateKeys();
 const raw=e.getPrivateKey(),v=fromPrivate(Buffer.concat([Buffer.alloc(32-raw.length),raw]));
 if(save){
  try{writeFileSync(file,JSON.stringify({publicKey:v.publicKey,privateKey:b64u(v.d)})+"\n",{mode:0o600,flag:"wx"});}
  catch(e){log.error(`VAPID key NOT saved (${e.message}): notifications set up before the next restart will stop.`);}
 }
 else v.temp=true;
 return v;
}
// The VAPID token: signed by the server's key for one push service (aud), valid 12 h.
export function vapidAuth(endpoint,vapid,contact,now=Date.now()){
 const enc=o=>b64u(JSON.stringify(o));
 const data=`${enc({typ:"JWT",alg:"ES256"})}.${enc({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:contact})}`;
 const sig=crypto.sign("sha256",Buffer.from(data),{key:vapid.key,dsaEncoding:"ieee-p1363"});
 return `vapid t=${data}.${b64u(sig)}, k=${vapid.publicKey}`;
}
// One message to one subscription. Resolves with the push service's HTTP status (404/410: the subscription is
// gone and should be forgotten); rejects on a network error or the 10 s timeout. fetch is injectable for tests.
export async function sendPush(sub,payload,{vapid,contact,fetch:f=globalThis.fetch,now=Date.now()}){
 if(!validEndpoint(sub.endpoint))throw new Error("endpoint not allowed");
 const body=encrypt(JSON.stringify(payload),sub);
 const r=await f(sub.endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),body,
  headers:{Authorization:vapidAuth(sub.endpoint,vapid,contact,now),TTL:"86400","Content-Encoding":"aes128gcm",Urgency:"normal","Content-Type":"application/octet-stream"}});
 try{await r.body?.cancel();}catch{}
 return r.status;
}
