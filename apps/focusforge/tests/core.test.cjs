const test=require('node:test'),assert=require('node:assert/strict');const L=require('../core.js'),base={"id":"sample0001","task":"Exemple","minutes":25,"day":"2026-11-10","completed":"oui"},today='2026-11-01';
const mk=(changes={})=>({...base,...changes});
test('application correcte et indépendante',()=>{assert.equal(L.SPEC.slug,'focusforge');assert.equal(L.SPEC.fields.length,4)});
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

test('résultat métier concret',()=>{const m=L.compute([base],today);assert.deepEqual(m.kpis[0],{key:'kpi.minutes',value:25});assert.equal(m.kpis[1].value,1);assert.deepEqual(m.rows,[{task:'Exemple',minutes:25}])});
test('sessions non terminées exclues, heures brutes',()=>{const m=L.compute([base,mk({id:'s0002',minutes:50,completed:'non'}),mk({id:'s0003',task:'Autre',minutes:65})],today);assert.equal(m.kpis[0].value,90);assert.equal(m.kpis[2].value,1.5);assert.deepEqual(m.rows.map(r=>r.task),['Autre','Exemple']);assert.deepEqual(m.notes,['note.completed'])});
test('erreurs sous forme de clés, avec le champ concerné',()=>{assert.throws(()=>L.normalizeRecord(mk({minutes:0})),/^Error: err\.minutes$/);assert.throws(()=>L.normalizeRecord(mk({day:'2026-02-30'})),/err\.date\|\{"field":"day"\}/);assert.throws(()=>L.normalizeRecord(mk({completed:'peut-être'})),/err\.choice/);assert.throws(()=>L.validateBackup({app:'x'}),/err\.backup/)});
