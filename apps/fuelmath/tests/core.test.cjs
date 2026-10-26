const test=require('node:test'),assert=require('node:assert/strict');const L=require('../core.js'),base={"id":"sample0001","route":"Exemple","km":180,"litres":6.2,"price":1.8,"people":2,"tolls":0,"parking":0,"returnTrip":"Aller simple"},today='2026-11-01';
const mk=(changes={})=>({...base,...changes});
test('application correcte et indépendante',()=>{assert.equal(L.SPEC.slug,'fuelmath');assert.equal(L.SPEC.fields.length,8)});
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

test('résultat métier concret',()=>{const m=L.compute([base],today);assert.equal(m.kpis[0][1],L.eur(2009));assert.ok(m.rows[0].includes('passager'))});

test('répartition conserve chaque centime pour un nombre pair de passagers',()=>{
 const cost=L.tripCostCents(base);assert.equal(cost,2009);
 const s=L.splitCents(cost,2);
 assert.deepEqual(s,{high:1005,highCount:1,low:1004,lowCount:1});
 assert.equal(s.high*s.highCount+s.low*s.lowCount,cost);
 const rows=L.compute([base],today).rows;
 assert.ok(rows[0].includes('10,05'));assert.ok(rows[0].includes('10,04'));
});
test('répartition égale et résidu pour 3 passagers',()=>{
 const s=L.splitCents(2001,3);
 assert.deepEqual(s,{high:667,highCount:0,low:667,lowCount:3});
 const t=L.splitCents(2000,3);
 assert.equal(t.high*t.highCount+t.low*t.lowCount,2000);
 assert.deepEqual(t,{high:667,highCount:2,low:666,lowCount:1});
});
test('les coûts agrégés résultent de la somme des trajets arrondis',()=>{
 const two=mk({id:'route0002',route:'Petit trajet',km:1,litres:5,price:1.55,people:3});
 assert.equal(L.tripCostCents(two),8);
 const data=L.compute([base,two],today);
 assert.equal(data.kpis[0][1],L.eur(2009+8));
});
test('refuse les valeurs de carburant irréalistes ou numériquement dangereuses',()=>{
 for(const invalid of [{people:0},{people:1.5},{people:101},{km:100001},{litres:101},{price:101}]){
  assert.throws(()=>L.normalizeRecord(mk(invalid)));
 }
 assert.throws(()=>L.splitCents(12,0));
 assert.throws(()=>L.splitCents(Number.MAX_SAFE_INTEGER+1,2));
});

test('sauvegardes v1 historiques compatibles sans nouveaux champs',()=>{
 const old={id:'history001',route:'Ancien trajet',km:180,litres:6.2,price:1.8,people:2};
 const n=L.normalizeRecord(old);
 assert.equal(n.tolls,0);assert.equal(n.parking,0);assert.equal(n.returnTrip,'Aller simple');
 assert.equal(L.validateBackup({app:'fuelmath',version:1,records:[old]})[0].tolls,0);
});
test('détail carburant, péages, parking et aller-retour',()=>{
 const x=L.tripDetails({...base,returnTrip:'Aller-retour',tolls:5.50,parking:2});
 assert.equal(x.distance,360);assert.equal(x.fuelLiters,22.32);
 assert.equal(x.fuelCents,4018);assert.equal(x.extrasCents,750);assert.equal(x.totalCents,4768);
 assert.equal(x.split.high*x.split.highCount+x.split.low*x.split.lowCount,x.totalCents);
});
test('aller-retour ne double pas le parking',()=>{
 const one=L.tripDetails({...base,tolls:3,parking:7});
 const two=L.tripDetails({...base,returnTrip:'Aller-retour',tolls:3,parking:7});
 assert.equal(one.extrasCents,two.extrasCents);assert.equal(two.fuelCents,2*one.fuelCents);
});
test('contrôles des nouvelles entrées',()=>{
 for(const item of [{tolls:-1},{parking:Infinity},{returnTrip:'autre'},{tolls:100001},{parking:100001}])assert.throws(()=>L.normalizeRecord({...base,...item}));
});
