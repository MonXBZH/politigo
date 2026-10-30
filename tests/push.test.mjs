// Web Push unit tests: RFC 8291 encryption, the VAPID token, and the push-service allowlist (node --test).
import {test} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {mkdtempSync,statSync,readFileSync,writeFileSync,mkdirSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const P=await import(process.env.PUSH||"/app/push.mjs");
const B=s=>Buffer.from(s,"base64url");
const DIR=mkdtempSync(join(tmpdir(),"pgp-"));
const quiet={error:()=>{}};

// RFC 8291, section 5 and appendix A: the example message, byte for byte.
const RFC={
 plaintext:"V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
 asPrivate:"yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
 uaPublic:"BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
 auth:"BTBZMqHH6r4Tts7J_aSIgg",salt:"DGv6ra1nlYgDCS1FRnbzlw",
 header:"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
 ciphertext:"8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
 message:"DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
};
test("RFC 8291 example vector",()=>{
 const out=P.encrypt(B(RFC.plaintext),{p256dh:RFC.uaPublic,auth:RFC.auth},{salt:B(RFC.salt),asPrivate:B(RFC.asPrivate)});
 assert.deepEqual(out,Buffer.concat([B(RFC.header),B(RFC.ciphertext)]));
 assert.equal(out.toString("base64url"),RFC.message);
});

// What the browser does on its side (RFC 8291 decryption), to check a real message end to end.
function decrypt(body,uaEcdh,auth){
 const salt=body.subarray(0,16),idlen=body[20],as=body.subarray(21,21+idlen),ct=body.subarray(21+idlen),ua=uaEcdh.getPublicKey();
 const hk=(ikm,s,info,n)=>Buffer.from(crypto.hkdfSync("sha256",ikm,s,info,n));
 const ikm=hk(uaEcdh.computeSecret(as),auth,Buffer.concat([Buffer.from("WebPush: info\0"),ua,as]),32);
 const d=crypto.createDecipheriv("aes-128-gcm",hk(ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16),hk(ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
 d.setAuthTag(ct.subarray(-16));
 const pt=Buffer.concat([d.update(ct.subarray(0,-16)),d.final()]);
 assert.equal(pt.at(-1),2,"last-record delimiter");
 return pt.subarray(0,-1).toString();
}
test("a sent message: encrypted for the browser, signed by the server, with the right headers",async()=>{
 const vapid=P.loadVapid(join(DIR,"v1.json"),quiet),ua=crypto.createECDH("prime256v1");ua.generateKeys();
 const auth=crypto.randomBytes(16),sub={endpoint:"https://fcm.googleapis.com/fcm/send/abc",p256dh:ua.getPublicKey().toString("base64url"),auth:auth.toString("base64url")};
 const payload={title:"Défi reçu !",body:"Alice te défie au Débat chrono. Tu as 24 h pour relever le défi.",tag:"duel-1",url:"/"};
 let seen=null;
 const status=await P.sendPush(sub,payload,{vapid,contact:"mailto:admin@example.org",now:Date.UTC(2026,0,1),fetch:async(url,o)=>{seen={url,o};return new Response(null,{status:201});}});
 assert.equal(status,201);assert.equal(seen.url,sub.endpoint);
 const h=seen.o.headers;
 assert.equal(h.TTL,"86400");assert.equal(h["Content-Encoding"],"aes128gcm");assert.equal(h.Urgency,"normal");assert.equal(h["Content-Type"],"application/octet-stream");
 assert.equal(seen.o.redirect,"error");assert.ok(seen.o.signal instanceof AbortSignal);
 assert.ok(seen.o.body.length<3072,"small payload");
 assert.deepEqual(JSON.parse(decrypt(seen.o.body,ua,auth)),payload);
 // The VAPID token verifies with the public key the browser subscribed with.
 const m=/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h.Authorization);
 assert.ok(m,h.Authorization);assert.equal(m[4],vapid.publicKey);
 assert.deepEqual(JSON.parse(B(m[1]).toString()),{typ:"JWT",alg:"ES256"});
 const claims=JSON.parse(B(m[2]).toString());
 assert.deepEqual(claims,{aud:"https://fcm.googleapis.com",exp:Date.UTC(2026,0,1)/1000+12*3600,sub:"mailto:admin@example.org"});
 const pk=B(vapid.publicKey),pub=crypto.createPublicKey({key:{kty:"EC",crv:"P-256",x:pk.subarray(1,33).toString("base64url"),y:pk.subarray(33).toString("base64url")},format:"jwk"});
 assert.equal(B(m[3]).length,64,"raw r||s signature");
 assert.ok(crypto.verify("sha256",Buffer.from(m[1]+"."+m[2]),{key:pub,dsaEncoding:"ieee-p1363"},B(m[3])));
 assert.ok(!crypto.verify("sha256",Buffer.from(m[1]+"."+m[2]+"x"),{key:pub,dsaEncoding:"ieee-p1363"},B(m[3])));
 // Gone subscriptions are reported as such; a forbidden endpoint is never fetched.
 assert.equal(await P.sendPush(sub,payload,{vapid,contact:"mailto:a@b.c",fetch:async()=>new Response(null,{status:410})}),410);
 await assert.rejects(P.sendPush({...sub,endpoint:"https://evil.com/x"},payload,{vapid,contact:"mailto:a@b.c",fetch:async()=>{throw new Error("fetched!");}}),/not allowed/);
});

test("the VAPID key is made once, kept private, and reused",()=>{
 const f=join(DIR,"v2.json"),a=P.loadVapid(f,quiet);
 assert.equal(statSync(f).mode&0o777,0o600);
 assert.equal(B(a.publicKey).length,65);
 assert.equal(P.loadVapid(f,quiet).publicKey,a.publicKey,"same key after a restart");
 writeFileSync(f,"{not json");
 const b=P.loadVapid(f,quiet);assert.notEqual(b.publicKey,a.publicKey,"a broken file gives a temporary key");
 assert.equal(readFileSync(f,"utf8"),"{not json","…and is left untouched, for a repair by hand");
 // An unwritable directory keeps the key in memory instead of failing.
 const ro=join(DIR,"ro");mkdirSync(ro);chmodSync(ro,0o500);
 const errors=[];const c=P.loadVapid(join(ro,"vapid.json"),{error:m=>errors.push(m)});
 assert.equal(B(c.publicKey).length,65);
 if(process.getuid?.()!==0)assert.match(errors.join(" "),/NOT saved/);
});

test("only the browsers' push services are accepted as endpoints",()=>{
 for(const ok of ["https://fcm.googleapis.com/fcm/send/abc","https://updates.push.services.mozilla.com/wpush/v2/x","https://web.push.apple.com/QK",
  "https://api.push.apple.com/x","https://wns2-par02p.notify.windows.com/w/?token=x"])assert.equal(P.validEndpoint(ok),true,ok);
 for(const bad of ["http://fcm.googleapis.com/x","https://evil.com/x","https://fcm.googleapis.com.evil.com/x","https://user:pass@fcm.googleapis.com/x",
  "https://fcm.googleapis.com:8443/x","https://127.0.0.1/x","https://[::1]/x","https://10.0.0.1/fcm","https://push.apple.com/x","https://.push.apple.com/x",
  "https://evilnotify.windows.com/x","https://fcm.googleapis.com/"+"x".repeat(1000),"ftp://fcm.googleapis.com/x","",null,42,{}])
  assert.equal(P.validEndpoint(bad),false,String(bad).slice(0,60));
 // An explicit default port is the default port: the URL parser drops it.
 assert.equal(P.validEndpoint("https://fcm.googleapis.com:443/x"),true);
});

test("browser keys must be a real P-256 point and a 16-byte secret",()=>{
 const e=crypto.createECDH("prime256v1");e.generateKeys();
 const good={p256dh:e.getPublicKey().toString("base64url"),auth:crypto.randomBytes(16).toString("base64url")};
 assert.deepEqual(P.validKeys(good),good);
 assert.deepEqual(P.validKeys({p256dh:good.p256dh+"=",auth:good.auth+"=="}),good,"padding tolerated");
 for(const bad of [null,"x",{},{...good,auth:crypto.randomBytes(15).toString("base64url")},{...good,p256dh:e.getPublicKey(null,"compressed").toString("base64url")},
  {...good,p256dh:Buffer.alloc(65,4).toString("base64url")},{...good,p256dh:"a+b/"},{...good,p256dh:12}])
  assert.equal(P.validKeys(bad),null,JSON.stringify(bad));
});
