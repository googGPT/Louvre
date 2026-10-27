const t=require('node:test'),a=require('node:assert/strict'),C=require('../core.js'),crypto=require('node:crypto');const expected=crypto.createHash('sha256').update('bonjour').digest('hex');
t('SHA-256 connu localement',async()=>a.equal(await C.digest(new TextEncoder().encode('bonjour').buffer,crypto.webcrypto.subtle),expected));
t('refuse mauvaise empreinte',()=>a.throws(()=>C.normalizeHash('abcd')));
t('normalise majuscules SHA256',()=>a.equal(C.normalizeHash(expected.toUpperCase()),expected));
t('comparaison vérifie égalité',()=>a.equal(C.compare(expected,expected.toUpperCase()),true));
t('comparaison détecte différence',()=>a.equal(C.compare(expected,'0'.repeat(64)),false));
t('validation refuse 33 Mo',()=>a.throws(()=>C.validateFile({name:'big',size:33*1024*1024})));
t('validation accepte 32 Mo',()=>a.equal(C.validateFile({name:'max',size:32*1024*1024}),true));
t('validation refuse fichier négatif',()=>a.throws(()=>C.validateFile({name:'bad',size:-1})));
t('validation refuse nom absent',()=>a.throws(()=>C.validateFile({name:'',size:0})));
t('conversion hex 00 ff 1a',()=>a.equal(C.bytesToHex(new Uint8Array([0,255,26]).buffer),'00ff1a'));
t('rejette objet au lieu ArrayBuffer',async()=>a.rejects(C.digest('abc',crypto.webcrypto.subtle)));
t('rejette WebCrypto manquante',async()=>a.rejects(C.digest(new ArrayBuffer(0),null)));
t('rejette empreinte contenant des caractères non-hex',()=>a.throws(()=>C.normalizeHash('z'.repeat(64))));

t('erreurs levées sous forme de clés traduisibles',async()=>{a.throws(()=>C.normalizeHash('abcd'),{message:'err.hashFormat'});a.throws(()=>C.validateFile({name:'big',size:33*1024*1024}),{message:'err.file'});await a.rejects(C.digest(new ArrayBuffer(0),null),{message:'err.crypto'});});
