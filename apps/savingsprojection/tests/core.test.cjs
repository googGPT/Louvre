// Tests métier de SavingsProjection : saisies, capitalisation mensuelle, périodicité, début/fin de période, objectif, scénarios, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const sc = (name, rate) => C.makeScenario({ name, rate }, `scen-${String(++n).padStart(4, '0')}`);
const plan = (o) => C.makePlan({ initial: '0', contribution: '0', frequency: 'monthly', timing: 'end', years: '1', target: '', ...o });

test('saisies : montants, taux signés, plan', () => {
  assert.equal(C.parseCents('1 500,50', 'err.initial'), 150050);
  assert.equal(C.parseCents('', 'err.initial'), 0);
  assert.throws(() => C.parseCents('-5', 'err.initial'), /err\.initial/);
  assert.equal(C.parseRate('3,5'), 350);
  assert.equal(C.parseRate('-1.5 %'), -150);
  assert.equal(C.parseRate('-0'), 0);
  for (const bad of ['31', '-21', '3.555', 'abc', '']) assert.throws(() => C.parseRate(bad), /err\.rate/);
  assert.throws(() => plan({}), /err\.nothing/);
  assert.throws(() => plan({ initial: '1', years: '0' }), /err\.years/);
  assert.throws(() => plan({ initial: '1', years: '61' }), /err\.years/);
  assert.throws(() => plan({ initial: '1', frequency: 'weekly' }), /err\.frequency/);
  assert.throws(() => plan({ initial: '1', timing: 'middle' }), /err\.timing/);
  assert.throws(() => sc(' ', '1'), /err\.nameRequired/);
});

test('taux nul : le solde est la somme des versements', () => {
  const r = C.project(plan({ initial: '1000', contribution: '100', years: '2' }), sc('Zéro', '0'));
  assert.deepEqual(r.years.map((y) => y.contributedCents), [220000, 340000]);
  assert.equal(r.finalCents, 340000);
  assert.equal(r.interestCents, 0);
});

test('capitalisation mensuelle, arrondie au centime chaque mois', () => {
  // 100,00 à 12 % : 1 % par mois ; 11267 centimes au lieu de 11268,25 sans arrondi.
  const r = C.project(plan({ initial: '100' }), sc('Douze', '12'));
  assert.equal(r.finalCents, 11267);
  assert.ok(Math.abs(r.finalCents - 10000 * 1.01 ** 12) < 12);
  assert.equal(r.interestCents, 1267);
  assert.equal(r.years[0].yearInterestCents, 1267);
  // Taux négatif : le solde baisse sans devenir négatif.
  const neg = C.project(plan({ initial: '100', years: '30' }), sc('Baisse', '-12'));
  assert.equal(neg.years[0].balanceCents < 10000, true);
  assert.ok(neg.finalCents >= 0);
  assert.equal(C.monthlyInterest(10050, -1200), -101); // -100,5 arrondi symétriquement
});

test('versement en début ou en fin de période ; trimestriel et annuel', () => {
  const start = C.project(plan({ contribution: '100', timing: 'start' }), sc('D', '12'));
  const end = C.project(plan({ contribution: '100', timing: 'end' }), sc('F', '12'));
  assert.ok(start.finalCents > end.finalCents); // l'argent versé plus tôt travaille plus longtemps
  assert.equal(start.contributedCents, end.contributedCents);
  // Fin de période, un mois : 100 versés, aucun intérêt ; début de période : 1 d'intérêts dès le premier mois.
  const months = (o) => C.project(plan({ contribution: '100', ...o }), sc('X', '12'));
  assert.equal(months({ timing: 'end' }).years[0].contributedCents, 120000);
  const q = C.project(plan({ contribution: '300', frequency: 'quarterly', years: '2' }), sc('Q', '0'));
  assert.deepEqual(q.years.map((y) => y.contributedCents), [120000, 240000]);
  const y = C.project(plan({ contribution: '1000', frequency: 'yearly', timing: 'start', years: '3' }), sc('A', '0'));
  assert.deepEqual(y.years.map((x) => x.contributedCents), [100000, 200000, 300000]);
  const one = C.project(plan({ contribution: '100', timing: 'start' }), sc('S', '12'));
  assert.equal(one.years[0].interestCents > 0, true);
});

test('objectif : premier mois où il est atteint, ou jamais', () => {
  assert.equal(C.project(plan({ contribution: '100', target: '1000' }), sc('Z', '0')).targetMonth, 10);
  assert.equal(C.project(plan({ contribution: '100', target: '5000' }), sc('Z', '0')).targetMonth, null);
  assert.equal(C.project(plan({ initial: '2000', target: '1000' }), sc('Z', '0')).targetMonth, 0); // déjà atteint
  assert.equal(C.project(plan({ contribution: '100' }), sc('Z', '0')).targetMonth, null); // pas d'objectif
});

test('scénarios comparés du plus prudent au plus optimiste', () => {
  const p = plan({ initial: '5000', contribution: '200', years: '10' });
  const rs = C.compare(p, [sc('Haute', '5'), sc('Basse', '1'), sc('Moyenne', '3')]);
  assert.deepEqual(rs.map((r) => r.name), ['Basse', 'Moyenne', 'Haute']);
  assert.ok(rs[0].finalCents < rs[1].finalCents && rs[1].finalCents < rs[2].finalCents);
  assert.ok(rs.every((r) => r.contributedCents === 500000 + 120 * 20000 && r.years.length === 10));
  assert.ok(rs.every((r) => r.finalCents === r.contributedCents + r.interestCents));
  assert.throws(() => C.compare(p, []), /err\.noScenario/);
});

test('CSV annuel : une colonne par scénario', () => {
  const rs = C.compare(plan({ initial: '100', years: '2' }), [sc('+Haute', '12'), sc('Nulle', '0')]);
  const csv = C.yearlyCsv(rs, { year: 'Année', contributed: 'Versé', scenario: (r) => `${r.name} (${r.rateBp / 100} %)` });
  const lines = csv.trim().split('\r\n');
  assert.ok(csv.startsWith('\uFEFF')); // BOM : accents lus correctement par les tableurs
  assert.equal(lines[0], '"Année";"Versé";"Nulle (0 %)";"\'+Haute (12 %)"');
  assert.equal(lines[1], '"1";"100.00";"100.00";"112.67"');
  assert.equal(lines.length, 3);
  assert.throws(() => C.yearlyCsv([], { year: 'a', contributed: 'b' }), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const st = { plan: plan({ initial: '5000', contribution: '150', frequency: 'quarterly', timing: 'start', years: '20', target: '30000' }), scenarios: [sc('Basse', '-1'), sc('Haute', '4,25')] };
  const json = JSON.parse(C.backup(st));
  assert.deepEqual(C.validateBackup(json), st);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(C.emptyState()))), C.emptyState());
  assert.throws(() => C.validateBackup({ ...json, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...json, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, plan: { ...json.plan, years: 70 } }), /err\.years/);
  assert.throws(() => C.validateBackup({ ...json, plan: { ...json.plan, initialCents: -1 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, plan: { ...json.plan, frequency: 'daily' } }), /err\.frequency/);
  assert.throws(() => C.validateBackup({ ...json, scenarios: [{ ...json.scenarios[0], rateBp: 5000 }] }), /err\.rate/);
  assert.throws(() => C.validateBackup({ ...json, scenarios: [json.scenarios[0], json.scenarios[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, scenarios: Array(6).fill(json.scenarios[0]) }), /err\.tooMany/);
});
