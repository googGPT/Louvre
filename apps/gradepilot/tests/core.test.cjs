const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js');
const one={id:'abcd',label:'Finance',score:16,coefficient:2};
const grade=(patch={})=>({...one,...patch});
const saved=grades=>({version:1,grades});
test('moyenne pondérée 16×2 et 10×1 : 14',()=>assert.equal(C.weightedAverage([one,grade({id:'defg',score:10,coefficient:1})]),14));
test('moyenne absente sans notes',()=>assert.equal(C.weightedAverage([]),null));
test('projection 10 coef 2, note 14 coef 2 donne 12',()=>assert.equal(C.projectedAverage([grade({score:10})],14,2),12));
test('projection vide revient à la note future',()=>assert.equal(C.projectedAverage([],16,2),16));
test('note requise objectif 12',()=>assert.equal(C.requirement([grade({score:10})],12,2).required,14));
test('objectif inatteignable avec une seule évaluation',()=>{
 const r=C.requirement([grade({score:0})],20,1);
 assert.equal(r.status,'impossible');assert.equal(r.feasible,false);assert.ok(r.required>20);
 assert.equal(C.minimumScore([grade({score:0})],20,1),null);
});
test('objectif déjà acquis même avec zéro',()=>{
 const r=C.requirement([grade({score:20})],5,1);
 assert.equal(r.status,'already');assert.equal(r.feasible,true);
 assert.equal(C.minimumScore([grade({score:20})],5,1),0);
});
test('objectif 0 sans note est déjà atteint',()=>assert.equal(C.requirement([],0,1).status,'already'));
test('objectif possible sans historique',()=>assert.equal(C.requirement([],12,1).required,12));
test('objectif exactement accessible à 20',()=>{
 const r=C.requirement([grade({score:10})],15,2);
 assert.equal(r.status,'possible');assert.equal(C.minimumScore([grade({score:10})],15,2),20);
});
test('seuil arrondi au centième supérieur et non au plus proche',()=>{
 const grades=[grade({score:12,coefficient:3})];
 const req=C.requirement(grades,13,7);
 const min=C.minimumScore(grades,13,7);
 assert.ok(min>=req.required);
 assert.ok(min-req.required<=0.0100000001);
 assert.ok(C.projectedAverage(grades,min,7)>=13-1e-9);
 if(min>=.01)assert.ok(C.projectedAverage(grades,min-.01,7)<13+1e-9);
});
test('seuil exactement entier et arrondi stable',()=>{
 assert.equal(C.minimumScore([grade({score:10})],12,2),14);
 assert.equal(C.minimumScore([],10,1),10);
});
test('borne score 0 et 20 acceptée',()=>{
 assert.doesNotThrow(()=>C.grade(grade({score:0})));
 assert.doesNotThrow(()=>C.grade(grade({score:20})));
});
test('note négative, supérieure et infinie rejetée',()=>{
 for(const value of [-1,21,NaN,Infinity,'16'])assert.throws(()=>C.grade(grade({score:value})));
});
test('coefficient 0 ou négatif refusé',()=>{
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>C.grade(grade({coefficient:value})));
});
test('coefficient max 100 accepté et 101 rejeté',()=>{
 assert.doesNotThrow(()=>C.grade(grade({coefficient:100})));
 assert.throws(()=>C.grade(grade({coefficient:101})));
});
test('libellé vide, trop long ou non chaîne refusé',()=>{
 for(const value of ['', ' '.repeat(5),'X'.repeat(65),null])assert.throws(()=>C.grade(grade({label:value})));
});
test('espaces du libellé normalisés',()=>assert.equal(C.grade(grade({label:'  Finance  '})).label,'Finance'));
test('champs supplémentaires rejetés',()=>assert.throws(()=>C.grade({...one,script:'x'})));
test('ID invalide refusé',()=>assert.throws(()=>C.grade(grade({id:'<'+'x'}))));
test('sauvegarde v1 inchangée acceptée',()=>assert.deepEqual(C.validateState(saved([one])),saved([one])));
test('liste vide v1 admise',()=>assert.deepEqual(C.validateState(saved([])),saved([])));
test('rejet des doublons',()=>assert.throws(()=>C.validateState(saved([one,one]))));
test('rejet de format non valide',()=>{
 for(const value of [null,[],{},saved('incorrect'),{...saved([one]),version:2},{...saved([one]),extra:true}])
  assert.throws(()=>C.validateState(value));
});
test('limite 200 notes',()=>{
 const grades=Array.from({length:200},(_,i)=>grade({id:'g_'+String(i).padStart(3,'0')}));
 assert.doesNotThrow(()=>C.validateState(saved(grades)));
 assert.throws(()=>C.validateState(saved([...grades,grade({id:'extra123'})])));
});
test('weightedAverage rejette des notes non validées',()=>assert.throws(()=>C.weightedAverage([grade({score:200})])));
test('requirement rejette des notes non validées',()=>assert.throws(()=>C.requirement([grade({coefficient:-1})],12,2)));
test('objectif 21 et négatif rejetés',()=>{
 for(const value of [-1,21,NaN,Infinity])assert.throws(()=>C.requirement([one],value,2));
});
test('coefficient futur nul et infini rejetés',()=>{
 for(const value of [0,-1,101,Infinity,NaN])assert.throws(()=>C.requirement([one],12,value));
});
test('note scénario hors limites rejetée',()=>{
 for(const value of [-.1,20.1,NaN])assert.throws(()=>C.projectedAverage([one],value,2));
});
test('minimumScore rejette précision invalide',()=>{
 for(const value of [-1,4,1.5])assert.throws(()=>C.minimumScore([one],12,2,value));
});
test('fourchette de projection croissante',()=>{
 const x=C.requirement([one],12,2);
 assert.ok(x.minAverage<=x.maxAverage);
 assert.equal(x.minAverage,C.projectedAverage([one],0,2));
 assert.equal(x.maxAverage,C.projectedAverage([one],20,2));
});
test('calculs ne modifient pas les fiches',()=>{
 const before=JSON.stringify(one);C.weightedAverage([one]);C.requirement([one],12,2);C.toCSV([one]);
 assert.equal(JSON.stringify(one),before);
});
test('CSV UTF8 BOM, séparateur point-virgule et valeurs',()=>{
 const text=C.toCSV([one]);assert.ok(text.startsWith('\uFEFF'));
 assert.match(text,/"Évaluation";"Note \/20";"Coefficient"/);
 assert.match(text,/"Finance";"16";"2"/);
});
test('CSV protège formules et échappement guillemets',()=>{
 const text=C.toCSV([grade({label:'=HYPERLINK("https://example.invalid")'})]);
 assert.match(text,/"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
});
test('CSV protège aussi les signes moins',()=>{
 const text=C.toCSV([grade({label:' -1+1'})]);assert.match(text,/"'-1\+1"/);
});
