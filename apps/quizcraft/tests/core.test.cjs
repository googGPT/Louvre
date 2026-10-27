const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../core.js');
const base={id:'sample0001',question:'Exemple',answer:'Réponse',category:'Finance',
 difficulty:'facile',mastered:'non'};
const mk=(extra={})=>({...base,...extra});
const saved=a=>({app:'quizcraft',version:1,records:a});
test('identité et cinq champs v1 inchangés',()=>{
 assert.equal(L.SPEC.slug,'quizcraft');
 assert.deepEqual(L.SPEC.fields.map(f=>f.key),['question','answer','category','difficulty','mastered']);
});
test('ancienne fiche v1 inchangée et sans mutation',()=>{
 assert.deepEqual(L.normalizeRecord(base),base);
 const raw=JSON.stringify(base);L.compute([base]);assert.equal(JSON.stringify(base),raw);
});
test('validations des types et des champs absents',()=>{
 for(const bad of [null,[],{},'text'])assert.throws(()=>L.normalizeRecord(bad));
 for(const f of L.SPEC.fields){const x=mk();delete x[f.key];assert.throws(()=>L.normalizeRecord(x));}
});
test('question vide et réponse vide refusées',()=>{
 assert.throws(()=>L.normalizeRecord(mk({question:'  '})));
 assert.throws(()=>L.normalizeRecord(mk({answer:''})));
});
test('formats invalides des choix rejetés',()=>{
 assert.throws(()=>L.normalizeRecord(mk({difficulty:'expert'})));
 assert.throws(()=>L.normalizeRecord(mk({mastered:'peut-être'})));
});
test('limite des caractères contrôlée et réponses longues permises',()=>{
 assert.equal(L.normalizeRecord(mk({answer:'a'.repeat(1200)})).answer.length,1200);
 assert.throws(()=>L.normalizeRecord(mk({question:'a'.repeat(1201)})));
 assert.throws(()=>L.normalizeRecord(mk({category:'z'.repeat(161)})));
});
test('contrôle des identifiants malformés',()=>{
 assert.throws(()=>L.normalizeRecord(mk({id:'a'})));
 assert.throws(()=>L.normalizeRecord(mk({id:'<'+'script'+'>'})));
});
test('backup JSON version 1 importable et réversible',()=>{
 const raw=L.backup([base]),parsed=JSON.parse(raw);
 assert.equal(parsed.version,1);
 assert.equal(parsed.app,'quizcraft');
 assert.deepEqual(L.validateBackup(parsed),[base]);
});
test('import rejette format, version, app, records incorrects',()=>{
 for(const obj of [null,[],{},saved(null),{...saved([base]),app:'other'},
 {...saved([base]),version:2}])assert.throws(()=>L.validateBackup(obj));
});
test('import rejette doublons et 501 questions',()=>{
 assert.throws(()=>L.validateBackup(saved([base,base])));
 assert.throws(()=>L.validateBackup(saved(Array.from({length:501},(_,i)=>mk({id:'id'+String(i).padStart(5,'0')})))));
});
test('dimensions de sauvegarde contrôlées',()=>{
 const items=Array.from({length:500},(_,i)=>mk({id:'id'+String(i).padStart(5,'0'),answer:'X'.repeat(1200)}));
 assert.doesNotThrow(()=>L.backup(items));
 const huge=items.map(x=>({...x,question:'Q'.repeat(1200)}));
 assert.throws(()=>L.backup(huge));
});
test('noms des thèmes spéciaux protégés contre prototype pollution',()=>{
 const records=[mk({id:'item_1',category:'__proto__'}),
 mk({id:'item_2',category:'constructor',mastered:'oui'}),
 mk({id:'item_3',category:'toString'})];
 const res=L.compute(records);
 assert.equal(res.kpis[0][1],3);
 assert.equal(res.kpis[1][1],1);
 assert.equal(res.categories.length,3);
 assert.ok(res.categories.every(x=>x.total===1));
});
test('maîtrise agrégée sans confondre difficulté et thème',()=>{
 const rows=[
  mk({id:'item_1',category:'Comptabilité',mastered:'oui'}),
  mk({id:'item_2',category:'Comptabilité',mastered:'non',difficulty:'difficile'}),
  mk({id:'item_3',category:'Économie',mastered:'oui'})];
 const res=L.compute(rows);
 assert.deepEqual(res.kpis.map(x=>x[1]),[3,2,1,67]);
 assert.deepEqual(res.kpis.map(x=>x[0]),['kpi.questions','kpi.mastered','kpi.review','kpi.progress']);
 assert.equal(res.categories.find(x=>x.category==='Comptabilité').percent,50);
});
test('calcul vide : taux 0 sans NaN',()=>{
 const x=L.compute([]);
 assert.deepEqual(x.kpis.map(v=>v[1]),[0,0,0,0]);
 assert.deepEqual(x.categories,[]);
});
test('compute refuse doublons, entrées malformées et date impossible',()=>{
 assert.throws(()=>L.compute([base,base]));
 assert.throws(()=>L.compute([{}]));
 assert.throws(()=>L.compute([],'2026-02-29'));
});
test('date et changement d’heure sans erreur de calcul',()=>{
 assert.equal(L.diffDays('2026-03-30','2026-03-29'),1);
 assert.equal(L.addDays('2026-03-28',2),'2026-03-30');
 assert.equal(L.validDate('2028-02-29'),true);
 assert.equal(L.validDate('2026-02-29'),false);
});
test('filtre sans accents et filtre par maîtrise',()=>{
 const r=[mk({id:'item_1',category:'Économie',mastered:'non'}),
 mk({id:'item_2',category:'Économie',mastered:'oui'}),
 mk({id:'item_3',category:'Finance',mastered:'non'})];
 assert.deepEqual(L.filterRecords(r,{query:'economie',mastered:'non'}).map(x=>x.id),['item_1']);
 assert.equal(L.filterRecords(r,{category:'Économie'}).length,2);
});
test('filtre et tri par difficulté',()=>{
 const r=[mk({id:'item_1',difficulty:'moyen'}),
 mk({id:'item_2',difficulty:'difficile'}),
 mk({id:'item_3',difficulty:'facile'})];
 assert.deepEqual(L.filterRecords(r,{order:'difficulty'}).map(x=>x.id),['item_2','item_1','item_3']);
 assert.equal(L.filterRecords(r,{difficulty:'facile'}).length,1);
});
test('filtre invalide rejeté',()=>{
 assert.throws(()=>L.filterRecords([base],{mastered:'maybe'}));
 assert.throws(()=>L.filterRecords([base],{order:'shuffle'}));
});
test('deck sans mutation et limite nombre',()=>{
 const rows=[mk({id:'item_1'}),mk({id:'item_2'}),mk({id:'item_3'})];
 const copy=JSON.stringify(rows);
 const deck=L.makeDeck(rows,{count:2,random:()=>0});
 assert.equal(deck.length,2);
 assert.equal(JSON.stringify(rows),copy);
 assert.deepEqual(new Set(deck.map(x=>x.id)).size,2);
});
test('deck limité aux notions non maîtrisées',()=>{
 const rows=[mk({id:'item_1',mastered:'oui'}),mk({id:'item_2',mastered:'non'})];
 assert.deepEqual(L.makeDeck(rows,{unmasteredOnly:true}).map(x=>x.id),['item_2']);
 assert.deepEqual(L.makeDeck([rows[0]],{unmasteredOnly:true}),[]);
});
test('deck accepte une quantité supérieure à la banque',()=>{
 assert.equal(L.makeDeck([base],{count:10}).length,1);
});
test('deck contrôle paramètres RNG et quantité',()=>{
 for(const count of [0,501,2.3,NaN])assert.throws(()=>L.makeDeck([base],{count}));
 assert.throws(()=>L.makeDeck([base],{random:null}));
 assert.throws(()=>L.makeDeck([base,mk({id:'item_2'})],{random:()=>1}));
});
test('CSV avec BOM et colonnes correctes',()=>{
 const csv=L.toCSV([base]);assert.ok(csv.startsWith('\uFEFF'));
 assert.match(csv,/"Question";"Réponse";"Thème"/);
 assert.match(csv,/"Exemple";"Réponse";"Finance"/);
});
test('CSV protège formules et guillemets',()=>{
 const csv=L.toCSV([mk({question:'=HYPERLINK("https://x")',answer:'-CMD',category:' @SUM(2)'})]);
 assert.match(csv,/"'=HYPERLINK\(""https:\/\/x""\)"/);
 assert.match(csv,/"'-CMD"/);
 assert.match(csv,/"'@SUM\(2\)"/);
});
test('rendu DOM : données non rendues par innerHTML (contrat à vérifier côté navigateur)',()=>{
 const row=L.normalizeRecord(mk({question:'<script>alert(1)</script>'}));
 assert.equal(row.question,'<script>alert(1)</script>');
});
test('erreurs levées sous forme de clés traduisibles',()=>{
 assert.throws(()=>L.normalizeRecord(mk({question:'  '})),{message:'err.text|{"field":"question","max":1200}'});
 assert.throws(()=>L.normalizeRecord(mk({difficulty:'expert'})),{message:'err.choice|{"field":"difficulty"}'});
 assert.throws(()=>L.normalizeRecord(mk({id:'a'})),/^Error: err\.id$/);
 assert.throws(()=>L.validateBackup(saved([base,base])),/^Error: err\.dup$/);
 assert.throws(()=>L.makeDeck([base],{count:0}),/^Error: err\.deckSize$/);
});
test('CSV : intitulés et choix traduits fournis par l’interface, données inchangées',()=>{
 const csv=L.toCSV([base],{header:['Question','Answer','Topic','Difficulty','Mastered'],label:(k,v)=>k+':'+v});
 assert.match(csv,/"Question";"Answer";"Topic"/);
 assert.match(csv,/"difficulty:facile";"mastered:non"/);
});
test('tri des thèmes selon la langue demandée',()=>{
 const r=[mk({id:'item_1',category:'Zèbre'}),mk({id:'item_2',category:'élan'}),mk({id:'item_3',category:'Avion'})];
 assert.deepEqual(L.compute(r,undefined,'de').categories.map(x=>x.category),['Avion','élan','Zèbre']);
 assert.deepEqual(L.filterRecords(r,{order:'category',locale:'en'}).map(x=>x.id),['item_3','item_2','item_1']);
});
