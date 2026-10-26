const test=require('node:test'),assert=require('node:assert/strict');const L=require('../core.js'),base={"id":"sample0001","goal":"Exemple","milestone":"Exemple","due":"2026-11-10","done":"non","priority":"haute"},today='2026-11-01';
const mk=(changes={})=>({...base,...changes});
test('application correcte et indépendante',()=>{assert.equal(L.SPEC.slug,'goalladder');assert.equal(L.SPEC.fields.length,5)});
test('accepte une fiche conforme',()=>{assert.deepEqual(L.normalizeRecord(base),base)});
test('refuse null, array, champ absent',()=>{assert.throws(()=>L.normalizeRecord(null));assert.throws(()=>L.normalizeRecord([]));for(const f of L.SPEC.fields){const x=mk();delete x[f.key];assert.throws(()=>L.normalizeRecord(x),f.key)}});
test('refuse injection de nombres invalides',()=>{for(const f of L.SPEC.fields.filter(x=>x.type==='number'))for(const bad of [NaN,Infinity,-1,'42'])assert.throws(()=>L.normalizeRecord(mk({[f.key]:bad})));});
test('export/import JSON et version',()=>{const b=L.backup([base]);const arr=L.validateBackup(JSON.parse(b));assert.equal(arr.length,1);assert.equal(arr[0].id,base.id);assert.throws(()=>L.validateBackup({...JSON.parse(b),version:8}))});
test('import d’une autre application refusé',()=>{assert.throws(()=>L.validateBackup({app:'invalid',version:1,records:[base]}))});
test('identifiants uniques et maximum 500',()=>{assert.throws(()=>L.validateBackup({app:L.SPEC.slug,version:1,records:[base,base]}));assert.throws(()=>L.validateBackup({app:L.SPEC.slug,version:1,records:Array(501).fill(base)}))});
test('métriques métier calculables sans réseau',()=>{const r=L.compute([base],today);assert.ok(Array.isArray(r.kpis));assert.ok(r.kpis.length>0);assert.ok(Array.isArray(r.rows));assert.ok(r.notes.length>0)});
test('calcul stable et source intacte',()=>{const before=JSON.stringify(base),a=L.compute([base],today),b=L.compute([base],today);assert.deepEqual(a,b);assert.equal(JSON.stringify(base),before)});
test('dates réelles et changement d’heure',()=>{assert.equal(L.diffDays('2026-03-30','2026-03-29'),1);assert.equal(L.addDays('2026-03-28',2),'2026-03-30')});
test('entrée non fiable ne peut générer HTML dans les vues',()=>{assert.equal(typeof L.normalizeRecord(mk({[L.SPEC.fields.find(f=>f.type==='text')?.key || 'id']:'<script>alert(1)</script>'})).id,'string')});

test('résultat métier concret',()=>{const m=L.compute([base],'2026-11-08');assert.equal(m.kpis[2][1],'1');assert.ok(m.rows[0].includes('0 %'))});

test('noms spéciaux sans collision de prototype',()=>{
 const records=[mk({id:'id_0001',goal:'__proto__'}),mk({id:'id_0002',goal:'constructor'}),mk({id:'id_0003',goal:'toString'})];
 const result=L.compute(records,today);
 assert.equal(result.kpis[0][1],'3');
 assert.deepEqual(result.goalStats.map(g=>g.total),[1,1,1]);
 assert.ok(result.goalStats.every(g=>Number.isFinite(g.progress)));
});
test('étapes en retard séparées des 7 prochains jours',()=>{
 const records=[
  mk({id:'id_0001',due:'2026-10-31'}),
  mk({id:'id_0002',due:'2026-11-01'}),
  mk({id:'id_0003',due:'2026-11-08'}),
  mk({id:'id_0004',due:'2026-11-09'})
 ];
 const s=L.compute(records,today);
 assert.deepEqual(s.kpis.map(k=>k[1]),['1','0','2','1']);
 assert.equal(s.goalStats[0].overdue,1);
 assert.equal(s.goalStats[0].soon,2);
});
test('terminée ne peut être comptée en retard',()=>{
 const r=L.compute([mk({done:'oui',due:'2026-10-01'})],today);
 assert.equal(r.kpis[1][1],'1');
 assert.equal(r.kpis[2][1],'0');
 assert.equal(r.kpis[3][1],'0');
 assert.equal(r.goalStats[0].progress,100);
 assert.equal(r.goalStats[0].nextDue,null);
});
test('statuts déterministes',()=>{
 assert.equal(L.recordStatus(mk({due:'2026-10-31'}),today),'overdue');
 assert.equal(L.recordStatus(mk({due:'2026-11-01'}),today),'soon');
 assert.equal(L.recordStatus(mk({due:'2026-11-08'}),today),'soon');
 assert.equal(L.recordStatus(mk({due:'2026-11-09'}),today),'future');
 assert.equal(L.recordStatus(mk({due:'2026-10-10',done:'oui'}),today),'done');
});
test('recherche insensible aux accents et tri par priorité',()=>{
 const r=[
 mk({id:'id_0001',goal:'Écriture',priority:'basse'}),
 mk({id:'id_0002',goal:'ECRITURE',priority:'haute'}),
 mk({id:'id_0003',goal:'Lecture',priority:'normale'})
 ];
 assert.deepEqual(L.filterRecords(r,{query:'ecriture',sort:'priority',today}).map(x=>x.id),['id_0002','id_0001']);
});
test('tri par échéance et récent',()=>{
 const r=[mk({id:'id_0001',due:'2026-11-10'}),mk({id:'id_0002',due:'2026-11-08'})];
 assert.deepEqual(L.filterRecords(r,{today}).map(x=>x.id),['id_0002','id_0001']);
 assert.deepEqual(L.filterRecords(r,{today,sort:'recent'}).map(x=>x.id),['id_0002','id_0001']);
});
test('filtre en retard, sous sept jours, terminé et à faire',()=>{
 const r=[
 mk({id:'id_0001',due:'2026-10-01'}),
 mk({id:'id_0002',due:'2026-11-04'}),
 mk({id:'id_0003',due:'2026-11-04',done:'oui'})
 ];
 for(const [status,id] of [['overdue','id_0001'],['soon','id_0002'],['done','id_0003']])
  assert.deepEqual(L.filterRecords(r,{status,today}).map(x=>x.id),[id]);
 assert.equal(L.filterRecords(r,{status:'todo',today}).length,2);
});
test('filtre invalide refusé',()=>{
 assert.throws(()=>L.filterRecords([base],{status:'unknown',today}));
 assert.throws(()=>L.filterRecords([base],{sort:'random',today}));
});
test('compute refuse les doublons et la capacité dépassée',()=>{
 assert.throws(()=>L.compute([base,base],today));
 assert.throws(()=>L.compute(Array(501).fill(base),today));
});
test('dates calendaires strictes, année ancienne et bissextile',()=>{
 assert.equal(L.validDate('2028-02-29'),true);
 assert.equal(L.validDate('2026-02-29'),false);
 assert.equal(L.validDate('0099-12-31'),true);
 assert.equal(L.validDate('0000-01-01'),false);
 assert.equal(L.diffDays('2026-10-26','2026-10-25'),1);
 assert.equal(L.addDays('2028-02-28',1),'2028-02-29');
});
test('sauvegarde ancienne version inchangée et capacité 500',()=>{
 assert.equal(JSON.parse(L.backup([base])).version,1);
 const legacy={app:'goalladder',version:1,records:[base]};
 assert.deepEqual(L.validateBackup(legacy),[base]);
});
test('export CSV neutralise les formules et conserve les guillemets',()=>{
 const csv=L.toCSV([mk({goal:'=HYPERLINK("https://test")',milestone:'Réunion "A"; B'})]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.match(csv,/"'=HYPERLINK/);
 assert.match(csv,/"Réunion ""A""; B"/);
 assert.match(csv,/"Échéance"/);
});
test('CSV protège les préfixes dangereux commençant par espace',()=>{
 const csv=L.toCSV([mk({goal:'   @SUM(1)',milestone:'-cmd'})]);
 assert.match(csv,/"'   @SUM/);
 assert.match(csv,/"'-cmd"/);
});
test('le calcul ne modifie aucune fiche source',()=>{
 const b=JSON.stringify(base);
 L.compute([base],today);L.filterRecords([base],{today});
 assert.equal(JSON.stringify(base),b);
});
