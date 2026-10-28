const test=require('node:test'),assert=require('node:assert/strict');const L=require('../core.js'),base={"id":"sample0001","title":"Exemple","payer":"Alice","people":"Alice, Bob","amount":42},today='2026-11-01';
const mk=(changes={})=>({...base,...changes});
test('application correcte et indépendante',()=>{assert.equal(L.SPEC.slug,'splitfair');assert.equal(L.SPEC.fields.length,4)});
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

test('noms réservés JavaScript : les comptes __proto__, constructor et toString restent distincts',()=>{
  for(const name of ['__proto__','constructor','toString']){
    const out=L.compute([mk({payer:name,people:'Alice, Bob',amount:10})],today);
    assert.equal(out.rows.length,2);
    assert.deepEqual(out.rows.map(r=>r.to),[name,name]);
    assert.equal(out.rows.reduce((s,r)=>s+r.cents,0),1000);
  }
});
test('montants : fractions de centime rejetées plutôt que silencieusement arrondies',()=>{
  for(const amount of [0.001,1.005,2.999])assert.throws(()=>L.normalizeRecord(mk({amount})),/err\.number/);
  assert.equal(L.normalizeRecord(mk({amount:0.01})).amount,0.01);
});
test('résultat métier concret',()=>{const m=L.compute([base],today);assert.equal(m.kpis[0].value,4200);assert.equal(m.kpis[0].money,true);assert.deepEqual(m.rows[0],{from:'Bob',to:'Alice',cents:2100})});
test('erreurs sous forme de clés traduisibles',()=>{assert.throws(()=>L.normalizeRecord(mk({amount:-1})),/^Error: err\.number\|\{"field":"amount"\}$/);assert.throws(()=>L.normalizeRecord(mk({payer:' '})),/^Error: err\.text\|\{"field":"payer","max":160\}$/);assert.throws(()=>L.normalizeRecord(mk({amount:0})),/^Error: err\.domain$/)});
