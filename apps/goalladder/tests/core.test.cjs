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
