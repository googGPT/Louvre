const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
const approx=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,a+' ≠ '+b);
const sample={fg:'#AABBCC',bg:'#FFFFFF'};
test('contraste noir et blanc exactement 21:1',()=>approx(C.contrast('#000','#fff'),21));
test('deux couleurs identiques ratio 1',()=>assert.equal(C.contrast('#abcdef','#abcdef'),1));
test('contraste symétrique',()=>approx(C.contrast('#123456','#FFFFFF'),C.contrast('#FFFFFF','#123456')));
test('HEX 3 caractères développé en 6 caractères',()=>assert.equal(C.normalize('#AbC'),'#AABBCC'));
test('HEX 6 caractères sans dièse accepté',()=>assert.equal(C.normalize('ab12Cd'),'#AB12CD'));
test('HEX blancs de début/fin refusés',()=>assert.throws(()=>C.normalize(' #fff ')));
test('HEX de 4 et 8 caractères, transparence refusés',()=>{
 for(const c of ['#1234','#12345678','#00000000','rgb(1,2,3)','transparent'])assert.throws(()=>C.normalize(c));
});
test('injection CSS et texte vide refusés',()=>{
 for(const c of ['','red; background:url(x)',null,{},'#00f;'])assert.throws(()=>C.normalize(c));
});
test('conversion RVB et retour HEX',()=>{
 assert.deepEqual(C.rgb('#aabbcc'),[170,187,204]);
 assert.equal(C.fromRgb([1,16,255]),'#0110FF');
});
test('fromRgb refuse canaux fractionnaires et hors bornes',()=>{
 for(const x of [[-1,2,3],[1,256,3],[1.5,2,3],['2',3,4],[1,2]])assert.throws(()=>C.fromRgb(x));
});
test('luminance noir à zéro, blanc à un',()=>{
 assert.equal(C.luminance('#000'),0);assert.equal(C.luminance('#fff'),1);
});
test('luminance primaire rouge selon coefficients sRGB',()=>{
 approx(C.luminance('#ff0000'),.2126);
});
test('seuil AA normal 4.5:1 vérifié SANS arrondir',()=>{
 const actual=C.contrast('#707972','#FFFFFF');
 assert.ok(actual<4.5&&actual>4.499);
 assert.equal(actual.toFixed(2),'4.50');
 assert.equal(C.wcag('#707972','#fff').aaNormal,false);
 assert.equal(C.wcag('#707972','#fff').aaaLarge,false);
});
test('seuil juste au dessus passe',()=>{
 assert.equal(C.wcag('#767676','#fff').aaNormal,true);
});
test('seuils AA et AAA texte normal et grand',()=>{
 const b=C.wcag('#000','#fff');
 assert.deepEqual([b.aaNormal,b.aaaNormal,b.aaLarge,b.aaaLarge],[true,true,true,true]);
 const e=C.wcag('#eee','#fff');
 assert.deepEqual([e.aaNormal,e.aaaNormal,e.aaLarge,e.aaaLarge],[false,false,false,false]);
});
test('fond blanc recommande le noir',()=>assert.equal(C.bestOn('#fff').hex,'#000000'));
test('fond noir recommande le blanc',()=>assert.equal(C.bestOn('#000').hex,'#FFFFFF'));
test('la meilleure couleur offre au moins 4.5:1',()=>{
 for(const c of ['#000','#fff','#767676','#DADADA','#abc','#808080']){
  assert.ok(C.bestOn(c).ratio>=4.5);
 }
});
test('suggestion inchangée pour couleur déjà conforme',()=>{
 const x=C.suggestForeground('#000','#fff',4.5);
 assert.equal(x.hex,'#000000');assert.equal(x.changed,false);assert.equal(x.reachable,true);
});
test('suggestion AA restaure le seuil sans forcer noir ou blanc',()=>{
 const s=C.suggestForeground('#999999','#fff',4.5);
 assert.equal(s.changed,true);assert.equal(s.reachable,true);
 assert.ok(s.ratio>=4.5);
 assert.notEqual(s.hex,'#000000');assert.notEqual(s.hex,'#FFFFFF');
});
test('suggestion AAA 7:1 atteint un seuil mathématiquement possible',()=>{
 const s=C.suggestForeground('#888888','#FFFFFF',7);
 assert.equal(s.reachable,true);assert.ok(s.ratio>=7);
});
test('si AAA inaccessible sur un fond fixe, le signaler sans mentir',()=>{
 const s=C.suggestForeground('#aaaaaa','#777777',7);
 assert.equal(s.reachable,false);assert.ok(s.ratio<7);
 assert.equal(s.hex,C.bestOn('#777777').hex);
});
test('seuil non pris en charge refusé',()=>assert.throws(()=>C.suggestForeground('#aaa','#fff',5)));
test('texte suggéré validé pour les 3 niveaux ou déclaré inaccessible',()=>{
 for(const fg of ['#888','#abc','#123456','#FFFFFF','#000000'])
  for(const bg of ['#808080','#123456','#F5F4EA','#FFFFFF','#000000'])
   for(const t of [3,4.5,7]){
    const x=C.suggestForeground(fg,bg,t);
    assert.equal(C.normalize(x.hex),x.hex);
    approx(C.contrast(x.hex,bg),x.ratio);
    if(x.reachable)assert.ok(x.ratio>=t-1e-12);
   }
});
test('sauvegarde v1 préservée et normalisée',()=>{
 const x=C.validateBackup({version:1,pairs:[{fg:'#abc',bg:'#fff'}]});
 assert.deepEqual(x,{version:1,pairs:[{fg:'#AABBCC',bg:'#FFFFFF'}]});
});
test('sauvegarde historique avec combinaisons répétées reste valide',()=>{
 const x=C.validateBackup({version:1,pairs:[sample,sample]});
 assert.equal(x.pairs.length,2);
});
test('sauvegarde rejette version et champs inconnus',()=>{
 for(const obj of [{version:2,pairs:[]},{version:1,pairs:[],hidden:1}])assert.throws(()=>C.validateBackup(obj));
});
test('sauvegarde rejette entrées malformées',()=>{
 for(const obj of [null,{},[],{version:1,pairs:'invalid'},{version:1,pairs:[{}]},
  {version:1,pairs:[{...sample,html:'a'}]}])assert.throws(()=>C.validateBackup(obj));
});
test('sauvegarde de 100 favoris acceptée, 101 refusée',()=>{
 const arr=Array(100).fill(sample);
 assert.doesNotThrow(()=>C.validateBackup({version:1,pairs:arr}));
 assert.throws(()=>C.validateBackup({version:1,pairs:[...arr,sample]}));
});
test('calculs agrégés de la collection sans mutation',()=>{
 const pairs=[{fg:'#000',bg:'#fff'},{fg:'#aaa',bg:'#fff'}],before=JSON.stringify(pairs);
 const s=C.summarize(pairs);assert.equal(s.total,2);
 assert.equal(s.aaNormal,1);assert.equal(s.aaaNormal,1);
 assert.equal(JSON.stringify(pairs),before);
});
test('collection vide : tous les compteurs à zéro',()=>{
 assert.deepEqual(C.summarize([]),{total:0,aaNormal:0,aaaNormal:0,aaLarge:0,aaaLarge:0});
});
test('CSS sériel canonique',()=>{
 assert.equal(C.cssSnippet('#f00','abcdef'),'color: #FF0000;\nbackground-color: #ABCDEF;');
});
test('CSS refuse valeur arbitraire potentiellement dangereuse',()=>{
 assert.throws(()=>C.cssSnippet('url(javascript:evil)','#fff'));
});
