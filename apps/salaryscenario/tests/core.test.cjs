// Tests métier de SalaryScenario : saisies, brut annuel (mensuel × versements ou annuel), primes, retenues en % sur le brut
// ou sur le net intermédiaire, retenues fixes, net annuel et mensuel, comparaison, CSV, sauvegardes. Aucun barème intégré.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const sc = (o) => C.makeScenario({ name: 'Offre', gross: '3000', period: 'month', payments: '12', bonus: '', lines: [], ...o }, `scen-${String(++n).padStart(4, '0')}`);
const LINES = [
  { label: 'Cotisations', kind: 'rate', value: '20', base: 'gross' },
  { label: 'Retenue', kind: 'rate', value: '10', base: 'net' },
  { label: 'Mutuelle', kind: 'fixed', value: '50', base: 'gross' },
];

test('saisies : montants, taux, versements, lignes', () => {
  assert.equal(C.parseCents('3 000,50', 'err.gross'), 300050);
  assert.equal(C.parseRate('7,5 %'), 750);
  assert.throws(() => C.parseRate('100.01', 3), /^Error: err\.rate\|\{"n":3\}/);
  assert.throws(() => sc({ gross: '' }), /err\.gross/);
  assert.throws(() => sc({ gross: '0' }), /err\.gross/);
  assert.throws(() => sc({ payments: '0' }), /err\.payments/);
  assert.throws(() => sc({ payments: '25' }), /err\.payments/);
  assert.throws(() => sc({ period: 'week' }), /err\.period/);
  assert.throws(() => sc({ name: ' ' }), /err\.nameRequired/);
  assert.throws(() => sc({ lines: [LINES[0], { label: '', kind: 'rate', value: '1', base: 'gross' }] }), /err\.lineLabel\|\{"n":2\}/);
  assert.throws(() => sc({ lines: [{ label: 'X', kind: 'rate', value: 'abc', base: 'gross' }] }), /err\.rate\|\{"n":1\}/);
  assert.throws(() => sc({ lines: [{ label: 'X', kind: 'rate', value: '1', base: 'autre' }] }), /err\.base/);
  assert.throws(() => sc({ lines: [{ label: 'X', kind: 'fixed', value: '', base: 'gross' }] }), /err\.fixed\|\{"n":1\}/);
  assert.throws(() => sc({ lines: new Array(11).fill(LINES[0]) }), /err\.tooManyLines/);
  assert.equal(sc({ period: 'year', payments: 'ignoré' }).payments, 12); // nombre de versements sans objet pour un brut annuel
});

test('décomposition : retenues sur le brut, sur le net intermédiaire et fixes', () => {
  const r = C.compute(sc({ bonus: '1200', lines: LINES }));
  assert.equal(r.annualGross, 3720000); // 3 000 × 12 + 1 200
  assert.deepEqual(r.lines.map((l) => l.annualCents), [744000, 297600, 60000]); // 20 % du brut ; 10 % de (brut − 20 %) ; 50 × 12
  assert.equal(r.intermediate, 2976000);
  assert.equal(r.deductions, 1101600);
  assert.equal(r.annualNet, 2618400);
  assert.equal(r.monthlyNet, 218200);
  assert.equal(r.perPaymentNet, 211161); // 3 000 × net / brut
  assert.equal(r.effectiveBp, 2961); // 29,61 % du brut
});

test('brut annuel, versements multiples et absence de retenues', () => {
  const y = C.compute(sc({ period: 'year', gross: '40000' }));
  assert.deepEqual([y.annualGross, y.annualNet, y.monthlyNet, y.perPaymentNet, y.effectiveBp], [4000000, 4000000, 333333, null, 0]);
  const m13 = C.compute(sc({ payments: '13', lines: [LINES[0]] }));
  assert.equal(m13.annualGross, 3900000);
  assert.equal(m13.annualNet, 3120000);
  assert.equal(m13.perPaymentNet, 240000);
});

test('retenues incohérentes refusées', () => {
  assert.throws(() => sc({ lines: [{ label: 'A', kind: 'rate', value: '60', base: 'gross' }, { label: 'B', kind: 'rate', value: '50', base: 'gross' }] }), /err\.overGross/);
  assert.throws(() => sc({ lines: [{ label: 'A', kind: 'fixed', value: '3001', base: 'gross' }] }), /err\.negativeNet/);
  assert.equal(C.compute(sc({ lines: [{ label: 'Tout', kind: 'rate', value: '100', base: 'gross' }] })).annualNet, 0);
});

test('comparaison : net annuel décroissant et écart avec le meilleur', () => {
  const rows = C.compare([sc({ name: 'Actuel', lines: LINES }), sc({ name: 'Nouveau', gross: '3300', lines: LINES }), sc({ name: 'Annuel', period: 'year', gross: '30000', lines: [LINES[0]] })]);
  assert.deepEqual(rows.map((r) => r.name), ['Nouveau', 'Actuel', 'Annuel']);
  assert.deepEqual(rows.map((r) => r.annualNet), [2791200, 2532000, 2400000]);
  assert.deepEqual(rows.map((r) => r.gapToBest), [0, 259200, 391200]);
});

test('CSV : format long, retenues en négatif, pas de formule', () => {
  const rows = C.compare([sc({ name: '=Offre', lines: [LINES[0]] })]);
  const labels = { scenario: 'S', item: 'Poste', annual: 'An', monthly: 'Mois', gross: 'Brut', deductions: 'Retenues', net: 'Net' };
  const lines = C.breakdownCsv(rows, labels).replace('﻿', '').trim().split('\r\n');
  assert.deepEqual(lines, [
    '"S";"Poste";"An";"Mois"',
    '"\'=Offre";"Brut";"36000.00";"3000.00"',
    '"\'=Offre";"Cotisations";"-7200.00";"-600.00"',
    '"\'=Offre";"Retenues";"-7200.00";"-600.00"',
    '"\'=Offre";"Net";"28800.00";"2400.00"',
  ]);
  assert.throws(() => C.breakdownCsv([], labels), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const scenarios = [sc({ bonus: '1200.50', lines: LINES }), sc({ period: 'year', gross: '42000' })];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup({ scenarios }))), { scenarios });
  const ok = { app: 'salaryscenario', version: 1, scenarios };
  assert.throws(() => C.validateBackup({ ...ok, app: 'freelancerate' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, more: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...scenarios[0], grossCents: 1.5 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...scenarios[1], payments: 13 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...scenarios[0], lines: [{ ...scenarios[0].lines[0], value: 20000 }] }] }), /err\.rate/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [{ ...scenarios[0], lines: [{ ...scenarios[0].lines[0], x: 1 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: [scenarios[0], scenarios[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, scenarios: new Array(9).fill(scenarios[0]) }), /err\.tooMany/);
});
