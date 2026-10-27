// Tests métier de SampleSizeCalc. Valeurs de référence recalculées indépendamment avec SciPy 1.18 (scipy.stats.norm.ppf)
// et valeurs classiques des manuels (385 pour 95 % / ±5 % / p = 50 %, 97 et 388 par groupe pour 40 vs 60 % et 50 vs 60 %).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (±${tol})`);
const one = (o) => C.oneProportion({ confidence: 95, margin: 5, p: 50, population: null, response: 100, deff: 1, ...o });
const two = (o) => C.twoProportions({ p1: 50, p2: 60, alpha: 5, power: 80, sides: 2, cc: false, response: 100, ...o });

test('inverse de la loi normale : valeurs de référence (SciPy) et symétrie', () => {
  const ref = [[0.9, 1.2815515655446004], [0.95, 1.6448536269514722], [0.975, 1.959963984540054], [0.995, 2.5758293035489004], [0.9995, 3.2905267314919255], [0.5, 0], [0.8, 0.8416212335729143], [1e-10, -6.361340902404056]];
  for (const [p, z] of ref) close(C.normInv(p), z, 1e-12, `p=${p}`);
  for (const p of [0.001, 0.02, 0.3, 0.4999]) close(C.normInv(p), -C.normInv(1 - p), 1e-12, `symétrie ${p}`);
  close(C.zFor(95), 1.959963984540054, 1e-12);
  close(C.zFor(99), 2.5758293035489004, 1e-12);
  for (const bad of [0, 1, -0.1, 2, NaN, '0.5']) assert.throws(() => C.normInv(bad), /err\.prob/);
});

test('une proportion : valeurs classiques', () => {
  const r = one();
  close(r.n0, 384.1458820694125, 1e-9);
  assert.equal(r.n, 385);
  assert.equal(one({ margin: 3 }).n, 1068); // 1067,07
  assert.equal(one({ confidence: 99 }).n, 664); // 663,49
  assert.equal(one({ margin: 10 }).n, 97); // 96,04
  assert.equal(one({ confidence: 90 }).n, 271); // 270,55
  assert.equal(one({ p: 20 }).n, 246); // 245,85 : p(1−p) plus petit que 0,25
  assert.equal(one({ p: 80 }).n, 246); // symétrique
});

test('correction pour population finie (Cochran) et effet de plan', () => {
  close(one({ population: 1000 }).nFpc, 277.7334531731876, 1e-9);
  assert.equal(one({ population: 1000 }).n, 278);
  assert.equal(one({ population: 500 }).n, 218); // 217,49 arrondi au-dessus (le tableau de Krejcie & Morgan arrondit à 217)
  assert.equal(one({ population: 100 }).n, 80); // 79,51
  assert.equal(one({ population: 10000 }).n, 370); // 369,97
  const d = one({ deff: 2 });
  close(d.nDeff, 768.291764138825, 1e-9);
  assert.equal(d.n, 769);
  assert.ok(one({ population: 2 }).n <= 2); // jamais plus que la population
});

test('taux de réponse attendu : nombre de personnes à contacter', () => {
  const r = one({ response: 30 });
  assert.equal(r.n, 385);
  assert.equal(r.contacts, 1284); // 385 / 0,30 = 1283,3
  assert.equal(one({ response: 100 }).contacts, 385);
  assert.deepEqual(one({ population: 1000, response: 20 }).warnings, ['warn.contactsOverPopulation']); // 278/0,2 = 1390 > 1000
});

test('avertissements : marge trop large, effectifs faibles', () => {
  assert.deepEqual(one({ p: 3, margin: 5 }).warnings, ['warn.marginWide', 'warn.smallCount']);
  assert.deepEqual(one().warnings, []);
});

test('hypothèses refusées', () => {
  assert.throws(() => one({ confidence: 100 }), /err\.confidence/);
  assert.throws(() => one({ confidence: 40 }), /err\.confidence/);
  assert.throws(() => one({ margin: 0 }), /err\.margin/);
  assert.throws(() => one({ margin: 60 }), /err\.margin/);
  assert.throws(() => one({ p: 0 }), /err\.p$/);
  assert.throws(() => one({ p: 100 }), /err\.p$/);
  assert.throws(() => one({ population: 1.5 }), /err\.population/);
  assert.throws(() => one({ population: 1 }), /err\.population/);
  assert.throws(() => one({ response: 0 }), /err\.response/);
  assert.throws(() => one({ response: 120 }), /err\.response/);
  assert.throws(() => one({ deff: 0.5 }), /err\.deff/);
  assert.equal(C.parseNum(' 2,5 ', 'err.x'), 2.5);
  assert.equal(C.parseNum('1 000', 'err.x'), 1000);
  assert.equal(C.parseNum('', 'err.x', { allowEmpty: true }), null);
  for (const bad of ['', 'abc', '-3', '1e3', '2,5,1']) assert.throws(() => C.parseNum(bad, 'err.x'), /^Error: err\.x$/);
});

test('marge d\'erreur obtenue pour n réponses', () => {
  const m = C.marginFor({ confidence: 95, p: 50, population: null, deff: 1, n: 400 });
  close(m.margin, 4.899909961350135, 1e-9);
  close(m.low, 45.10009003864987, 1e-9);
  const f = C.marginFor({ confidence: 95, p: 50, population: 2000, deff: 1, n: 400 });
  close(f.margin, 4.38370876709984, 1e-9);
  // Cohérence avec le calcul inverse : 385 réponses donnent une marge d'au plus 5 points.
  assert.ok(C.marginFor({ confidence: 95, p: 50, population: null, deff: 1, n: 385 }).margin <= 5);
  assert.ok(C.marginFor({ confidence: 95, p: 50, population: null, deff: 1, n: 384 }).margin > 5);
  assert.throws(() => C.marginFor({ confidence: 95, p: 50, population: 300, deff: 1, n: 400 }), /err\.nOverPopulation/);
  assert.throws(() => C.marginFor({ confidence: 95, p: 50, population: null, deff: 1, n: 1 }), /err\.n$/);
});

test('deux proportions : formule de Fleiss, valeurs de référence', () => {
  close(two().nRaw, 387.33851669903584, 1e-8);
  assert.equal(two().perGroup, 388);
  assert.equal(two().total, 776);
  assert.equal(two({ p1: 40, p2: 60 }).perGroup, 97); // 96,92
  assert.equal(two({ p1: 65, p2: 85 }).perGroup, 73); // 72,39
  assert.equal(two({ p1: 10, p2: 20 }).perGroup, 199); // 198,96
  assert.equal(two({ power: 90 }).perGroup, 519); // 518,04
  assert.equal(two({ sides: 1 }).perGroup, 305); // 304,99
  assert.deepEqual(two({ sides: 1 }).warnings, ['warn.oneSided']);
  close(two({ cc: true }).nCc, 407.0928725063868, 1e-8);
  assert.equal(two({ cc: true }).perGroup, 408);
  assert.equal(two({ p1: 10, p2: 20, cc: true }).perGroup, 219); // 218,51
  assert.equal(two({ p1: 60, p2: 50 }).perGroup, 388); // l'ordre des groupes est indifférent
  const r = two({ response: 50 });
  assert.equal(r.contactsPerGroup, 776);
  assert.equal(r.contactsTotal, 1552);
  assert.throws(() => two({ p2: 50 }), /err\.sameP/);
  assert.throws(() => two({ power: 40 }), /err\.power/);
  assert.throws(() => two({ alpha: 0 }), /err\.alpha/);
  assert.throws(() => two({ sides: 3 }), /err\.sides/);
  assert.throws(() => two({ p1: 0 }), /err\.p1/);
});

test('scénarios : sauvegarde aller-retour et contenus refusés', () => {
  const list = [
    { id: 'sc-000001', name: 'Enquête étudiants', kind: 'one', inputs: { confidence: 95, margin: 5, p: 50, population: 12000, response: 35, deff: 1 } },
    { id: 'sc-000002', name: 'Marge avec 250 réponses', kind: 'margin', inputs: { confidence: 95, p: 50, population: null, deff: 1.5, n: 250 } },
    { id: 'sc-000003', name: 'Essai A/B', kind: 'two', inputs: { p1: 40, p2: 50, alpha: 5, power: 80, sides: 2, cc: true, response: 80 } },
  ];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(list))), list);
  const ok = { app: 'samplesizecalc', version: 1, scenarios: list };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: true }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...list[0], inputs: { ...list[0].inputs, margin: 0 } }] }), /err\.margin/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...list[0], inputs: { ...list[0].inputs, extra: 1 } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...list[0], kind: 'three' }] }), /err\.kind/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...list[0], name: ' ' }] }), /err\.nameRequired/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...list[2], inputs: { ...list[2].inputs, cc: 'oui' } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [list[0], list[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: Array.from({ length: 201 }, (_, i) => ({ ...list[0], id: `sc-${String(i).padStart(6, '0')}` })) }), /err\.tooMany/);
});

test('CSV : guillemets et neutralisation des formules', () => {
  assert.equal(C.toCSV([['a,b', '=1+1', '-5', '"x"']]), '"a,b",\'=1+1,-5,"""x"""\r\n');
  assert.equal(C.toCSV([['1,5', 'b']], ';'), '1,5;b\r\n');
  assert.throws(() => C.toCSV([['a']], '|'), /err\.sep/);
});
