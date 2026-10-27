const test=require('node:test'),a=require('node:assert/strict'),C=require('../core.js');
const cfg={ecc:'M',margin:4,scale:10,dark:'#102B43',light:'#FFFFFF'};
const payload=(kind,values)=>C.payload({kind,...values});
test('texte intact',()=>a.equal(payload('text',{text:'Bonjour'}),'Bonjour'));
test('Unicode préservé',()=>a.equal(payload('text',{text:'Éléphant 🎉'}),'Éléphant 🎉'));
test('sauts de ligne préservés',()=>a.equal(payload('text',{text:'A\nB'}),'A\nB'));
test('texte vide rejeté',()=>{for(const s of ['',null,'  '])a.throws(()=>payload('text',{text:s}));});
test('texte 1601 caractères rejeté',()=>a.throws(()=>payload('text',{text:'a'.repeat(1601)})));
test('limite 1800 octets UTF-8',()=>a.throws(()=>payload('text',{text:'é'.repeat(1000)})));
test('emoji codé sur 4 octets',()=>a.equal(C.bytes('🎉'),4));
test('schéma et type invalide rejetés',()=>{for(const x of [null,{},[],{kind:'script'}])a.throws(()=>C.payload(x));});
test('HTTPS complet',()=>a.equal(payload('url',{url:'https://example.com/a?x=1'}),'https://example.com/a?x=1'));
test('URL sans protocole rejetée',()=>a.throws(()=>payload('url',{url:'example.com'})));
test('schémas URL dangereux rejetés',()=>{for(const x of ['javascript:alert(1)','data:text/plain,a','file:///tmp'])a.throws(()=>payload('url',{url:x}));});
test('authentification URL intégrée rejetée',()=>a.throws(()=>payload('url',{url:'https://bob:secret@example.com'})));
test('HTTP explicite permis',()=>a.equal(payload('url',{url:'http://example.com/'}),'http://example.com/'));
test('Unicode URL normalisé',()=>a.equal(payload('url',{url:'https://exemple.fr/été'}),'https://exemple.fr/%C3%A9t%C3%A9'));
test('e-mail mailto',()=>a.equal(payload('email',{email:'a@example.org'}),'mailto:a@example.org'));
test('e-mail invalide refusé',()=>{for(const x of ['abc','a@@b.fr','a b@foo.fr'])a.throws(()=>payload('email',{email:x}));});
test('téléphone international nettoyé',()=>a.equal(payload('telephone',{telephone:'+33 6 12 34 56 78'}),'tel:+33612345678'));
test('injection dans le numéro rejetée',()=>a.throws(()=>payload('telephone',{telephone:'123;alert'})));
test('séparateurs et caractères Wi-Fi échappés',()=>{
 const p=payload('wifi',{ssid:'A;B,C:D"E\\F',security:'WPA',password:'s;ecure:pass'});
 a.equal(p,'WIFI:T:WPA;S:A\\;B\\,C\\:D\\"E\\\\F;P:s\\;ecure\\:pass;;');
});
test('Wi-Fi ouvert sans mot de passe',()=>a.equal(payload('wifi',{ssid:'WifiPublic',security:'nopass'}),'WIFI:T:nopass;S:WifiPublic;;'));
test('mot de passe court refusé',()=>a.throws(()=>payload('wifi',{ssid:'x',security:'WPA',password:'1234567'})));
test('SSID plus de 32 octets refusé',()=>a.throws(()=>payload('wifi',{ssid:'é'.repeat(17),security:'nopass'})));
test('chiffrement Wi-Fi non pris en charge refusé',()=>a.throws(()=>payload('wifi',{ssid:'x',security:'WEP'})));
test('HEX canonical',()=>a.equal(C.color('#aAbbCc'),'#AABBCC'));
test('injection CSS refusée',()=>a.throws(()=>C.color('red;background:url(x)')));
test('contraste validé',()=>a.ok(C.config(cfg).contrast>=4.5));
test('couleurs inversées refusées',()=>a.throws(()=>C.config({...cfg,dark:'#FFFFFF',light:'#102B43'})));
test('contraste trop faible refusé',()=>a.throws(()=>C.config({...cfg,dark:'#888888',light:'#999999'})));
test('marge < 4 refusée',()=>a.throws(()=>C.config({...cfg,margin:3})));
test('échelle PNG hors bornes refusée',()=>{for(const scale of [3,17,5.5,NaN])a.throws(()=>C.config({...cfg,scale}));});
test('4 niveaux ECC acceptés',()=>{for(const ecc of C.levels)a.doesNotThrow(()=>C.config({...cfg,ecc}));});
test('taille QR 21..177 modules',()=>{
 const m=C.matrix({kind:'text',text:'Bonjour'},cfg);
 a.ok(m.size>=21&&m.size<=177&&m.size%4===1);
});
test('3 motifs de repérage QR',()=>{
 const m=C.matrix({kind:'text',text:'Hello'},cfg);
 for(const [x,y] of [[0,0],[m.size-7,0],[0,m.size-7]])
  for(let dy=0;dy<7;dy++)for(let dx=0;dx<7;dx++){
   const expected=(dx===0||dy===0||dx===6||dy===6)||(dx>=2&&dx<=4&&dy>=2&&dy<=4);
   a.equal(m.qr.isDark(y+dy,x+dx),expected);
  }
});
test('SVG non injectable',()=>{
 const s=C.svg(C.matrix({kind:'text',text:'<script>alert(1)</script>'},cfg));
 a.ok(s.startsWith('<svg')&&s.includes('<path'));a.ok(!s.includes('alert(1)'));
});
test('quiet zone incluse dans viewBox',()=>{
 const m=C.matrix({kind:'text',text:'OK'},cfg);
 a.ok(C.svg(m).includes('viewBox="0 0 '+(m.size+8)+' '+(m.size+8)+'"'));
});
test('matrice déterministe',()=>{
 const m=()=>C.svg(C.matrix({kind:'text',text:'HELLO'},cfg));a.equal(m(),m());
});
test('grand contenu augmente taille QR',()=>{
 const m=t=>C.matrix({kind:'text',text:t},cfg).size;
 a.ok(m('A'.repeat(450))>m('A'));
});
test('niveau H non plus petit que L',()=>{
 const q=ecc=>C.matrix({kind:'text',text:'A'.repeat(150)},{...cfg,ecc}).size;
 a.ok(q('H')>=q('L'));
});
test('données trop longues en H refusées',()=>a.throws(()=>C.matrix({kind:'text',text:'a'.repeat(1600)},{...cfg,ecc:'H'})));
test('Canvas absent refusé',()=>a.throws(()=>C.pngCanvas(C.matrix({kind:'text',text:'OK'},cfg),null)));
test('erreurs sous forme de clés de traduction',()=>{
 a.throws(()=>payload('wifi',{ssid:'',security:'nopass'}),/^Error: err\.required\.ssid$/);
 a.throws(()=>C.config({...cfg,dark:'#FFFFFF',light:'#102B43'}),/^Error: err\.contrast$/);
 a.throws(()=>C.matrix({kind:'text',text:'a'.repeat(1600)},{...cfg,ecc:'H'}),/^Error: err\.tooBig\|\{"ecc":"H"\}$/);
});
test('nom accessible du SVG traduit et échappé, dessin identique',()=>{
 const m=C.matrix({kind:'text',text:'OK'},cfg),fr=C.svg(m,'Code QR'),en=C.svg(m,'QR <code>');
 a.ok(fr.includes('aria-label="Code QR"'));a.ok(en.includes('aria-label="QR &lt;code&gt;"'));
 a.equal(fr.replace(/aria-label="[^"]*"/,''),en.replace(/aria-label="[^"]*"/,''));
});
