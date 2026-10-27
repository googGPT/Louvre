// Tests métier de DebtStrategy : saisies, intérêts mensuels, avalanche et boule de neige, budget insuffisant, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const debt = (name, balance, rate, min) => C.makeDebt({ name, balance, rate, min }, `debt-${String(++n).padStart(4, '0')}`);

test('saisies : montants en centimes, taux en points de base', () => {
  assert.equal(C.parseCents('1 250,50'), 125050);
  assert.equal(C.parseRate('19,99'), 1999);
  assert.equal(C.parseRate('0'), 0);
  assert.equal(C.parseRate('100'), 10000);
  assert.equal(C.parseRate('7.5 %'), 750);
  for (const bad of ['100.01', '-1', 'abc', '', '1.234']) assert.throws(() => C.parseRate(bad), /err\.rate/);
  assert.throws(() => debt('X', '0', '5', '10'), /err\.balance/);
  assert.throws(() => debt('X', '100', '5', '0'), /err\.min/);
  assert.throws(() => debt(' ', '100', '5', '10'), /err\.nameRequired/);
  assert.throws(() => C.makePlan({ budget: '100', startMonth: '2026-13' }), /err\.month/);
});

test('une dette : échéancier exact au centime', () => {
  // 1 000,00 à 12 % : 10,00 d'intérêts le premier mois, budget 300,00.
  const d = debt('Carte', '1000', '12', '100');
  const r = C.simulate([d], 30000, 'avalanche', '2026-11');
  assert.equal(r.ok, true);
  assert.deepEqual(r.schedule.map((m) => m.interestCents), [1000, 710, 417, 121]);
  assert.deepEqual(r.schedule.map((m) => m.balanceCents), [71000, 41710, 12127, 0]);
  assert.deepEqual(r.schedule.map((m) => m.paymentCents), [30000, 30000, 30000, 12248]);
  assert.equal(r.months, 4);
  assert.equal(r.endMonth, '2027-02'); // passage d'année
  assert.equal(r.totalInterestCents, 2248);
  assert.equal(r.totalPaidCents, 102248);
  assert.deepEqual(r.payoffs.map((p) => p.month), ['2027-02']);
});

test('taux nul : simple division du solde', () => {
  const r = C.simulate([debt('Ami', '1000', '0', '100')], 10000, 'snowball', '2026-01');
  assert.equal(r.months, 10);
  assert.equal(r.totalInterestCents, 0);
});

test('avalanche et boule de neige : ordres différents, l\'avalanche paie moins d\'intérêts', () => {
  const small = debt('Petit prêt', '500', '5', '25'), card = debt('Carte', '2000', '20', '50');
  assert.deepEqual(C.order([small, card], 'avalanche').map((d) => d.name), ['Carte', 'Petit prêt']);
  assert.deepEqual(C.order([small, card], 'snowball').map((d) => d.name), ['Petit prêt', 'Carte']);
  const cmp = C.compare([small, card], 30000, '2026-11');
  const { avalanche: a, snowball: s } = cmp;
  assert.equal(a.ok && s.ok, true);
  assert.equal(s.payoffs[0].name, 'Petit prêt'); // première victoire rapide
  assert.equal(a.payoffs[0].name, 'Carte');
  assert.ok(a.totalInterestCents < s.totalInterestCents);
  assert.equal(cmp.interestGapCents, s.totalInterestCents - a.totalInterestCents);
  for (const r of [a, s]) {
    // Tout ce qui est payé = soldes de départ + intérêts ; le budget est respecté chaque mois.
    assert.equal(r.totalPaidCents, 250000 + r.totalInterestCents);
    assert.ok(r.schedule.every((m) => m.paymentCents <= 30000));
    assert.ok(r.schedule.slice(0, -1).every((m) => m.paymentCents === 30000));
    assert.ok(r.schedule.every((m) => m.rows.every((x) => x.balanceCents >= 0)));
  }
});

test('le minimum libéré par une dette soldée repart vers la suivante', () => {
  const a = debt('A', '100', '0', '50'), b = debt('B', '1000', '0', '50');
  const r = C.simulate([a, b], 10000, 'snowball', '2026-01');
  const paid = (m, d) => r.schedule[m].rows.find((x) => x.id === d.id).paymentCents;
  assert.deepEqual([paid(0, a), paid(0, b)], [5000, 5000]); // minimums seulement : rien de plus à répartir
  assert.deepEqual([paid(1, a), paid(1, b)], [5000, 5000]); // A soldée au mois 2
  assert.deepEqual(r.schedule[1].paidOff, [a.id]);
  assert.equal(r.schedule[2].rows.length, 1); // A n'apparaît plus
  assert.equal(paid(2, b), 10000); // le minimum de A s'ajoute à B
  assert.equal(r.months, 11);
});

test('budget insuffisant : minimums, intérêts, durée excessive', () => {
  const a = debt('A', '1000', '10', '50'), b = debt('B', '1000', '10', '25');
  assert.deepEqual(C.simulate([a, b], 5000, 'avalanche', '2026-01'), { ok: false, strategy: 'avalanche', reason: 'minimums', needCents: 7500 });
  const big = debt('Gros', '10000', '24', '1'); // 200,00 d'intérêts le premier mois
  const r = C.simulate([big], 15000, 'avalanche', '2026-01');
  assert.equal(r.reason, 'interest');
  assert.equal(r.needCents, 20001);
  const slow = debt('Lent', '100000', '12', '1'); // 1 000,00 d'intérêts par mois, 1 000,01 payés
  assert.equal(C.simulate([slow], 100001, 'snowball', '2026-01').reason, 'tooLong');
  const cmp = C.compare([slow], 100001, '2026-01');
  assert.equal(cmp.interestGapCents, null);
  assert.throws(() => C.simulate([], 1000, 'avalanche', '2026-01'), /err\.noDebts/);
  assert.throws(() => C.simulate([a], 0, 'avalanche', '2026-01'), /err\.budget/);
  assert.throws(() => C.simulate([a], 1000, 'autre', '2026-01'), /err\.strategy/);
});

test('CSV : une ligne par dette et par mois, formules neutralisées', () => {
  const d = debt('=Carte', '1000', '12', '100');
  const r = C.simulate([d], 30000, 'avalanche', '2026-11');
  const csv = C.scheduleCsv(r, [d], ['Mois', 'Dette', 'Intérêts', 'Paiement', 'Restant']);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[1], '"2026-11";"\'=Carte";"10.00";"300.00";"710.00"');
  assert.equal(lines[4], '"2027-02";"\'=Carte";"1.21";"122.48";"0.00"');
  assert.throws(() => C.scheduleCsv({ ok: false }, [d], ['a', 'b', 'c', 'd', 'e']), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const st = { budgetCents: 30000, startMonth: '2026-11', strategy: 'snowball', debts: [debt('Carte', '2000', '19,99', '50'), debt('Auto', '8000', '4.5', '180')] };
  const json = JSON.parse(C.backup(st));
  assert.deepEqual(C.validateBackup(json), st);
  assert.throws(() => C.validateBackup({ ...json, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...json, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, strategy: 'random' }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, budgetCents: -1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, startMonth: '2026-1' }), /err\.month/);
  assert.throws(() => C.validateBackup({ ...json, debts: [{ ...json.debts[0], rateBp: 10001 }] }), /err\.rate/);
  assert.throws(() => C.validateBackup({ ...json, debts: [{ ...json.debts[0], minCents: 1.5 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, debts: [json.debts[0], json.debts[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, debts: Array(21).fill(json.debts[0]) }), /err\.tooMany/);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(C.emptyState('2026-11')))), C.emptyState('2026-11'));
});
