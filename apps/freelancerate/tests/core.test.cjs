// Tests métier de FreelanceRate : saisies, temps facturable, chiffre d'affaires requis, tarifs, test d'un tarif, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const charge = (name, amount, period) => C.makeCharge({ name, amount, period }, `chg-${String(++n).padStart(4, '0')}`);
const profile = (o) => C.makeProfile({ targetNet: '30000', contrib: '', tax: '', daysPerWeek: '5', weeksOff: '2', daysOff: '0', billablePct: '100', hours: '7', ...o });

test('saisies : taux en points de base, temps de travail, refus', () => {
  assert.equal(C.parseRate('22,5', 'err.contrib'), 2250);
  assert.equal(C.parseRate('', 'err.contrib'), 0);
  assert.throws(() => C.parseRate('95', 'err.contrib'), /err\.contrib/);
  assert.throws(() => C.parseRate('-1', 'err.contrib'), /err\.contrib/);
  assert.throws(() => profile({ targetNet: '0' }), /err\.targetNet/);
  assert.throws(() => profile({ hours: '0.5' }), /err\.hours/);
  assert.throws(() => profile({ hours: '7.555' }), /err\.hours/);
  assert.throws(() => profile({ billablePct: '0' }), /err\.billablePct/);
  assert.throws(() => profile({ daysPerWeek: '8' }), /err\.daysPerWeek/);
  assert.throws(() => profile({ daysPerWeek: '1', weeksOff: '51', daysOff: '2' }), /err\.noDays/);
  assert.throws(() => charge('Loyer', '0', 'month'), /err\.chargeAmount/);
  assert.throws(() => charge('Loyer', '10', 'week'), /err\.period/);
  assert.throws(() => charge(' ', '10', 'month'), /err\.nameRequired/);
});

test('sans prélèvement ni charge : le tarif divise le revenu par le temps facturé', () => {
  const r = C.compute(profile({}), []);
  assert.equal(r.workingDays, 250); // 50 semaines × 5 jours
  assert.equal(r.turnoverCents, 3000000);
  assert.equal(r.dayRateCents, 12000);
  assert.equal(r.hourRateCents, 1715); // 120 / 7 = 17,142… arrondi au centime supérieur
  assert.equal(r.netCents, 3000000);
});

test('charges mensuelles et annuelles, prélèvement sur le chiffre d\'affaires', () => {
  const ch = [charge('Logiciel', '250', 'month'), charge('Assurance', '3000', 'year')];
  assert.equal(C.annualCharges(ch), 600000);
  const r = C.compute(profile({ contrib: '20' }), ch);
  assert.equal(r.turnoverCents, 4500000); // (30 000 + 6 000) / 0,8
  assert.equal(r.contribCents, 900000);
  assert.equal(r.profitCents, 3000000);
  assert.equal(r.netCents, 3000000);
  assert.equal(r.monthlyTurnoverCents, 375000);
});

test('prélèvement sur le bénéfice : net atteint, à deux centimes près au plus', () => {
  const ch = [charge('Divers', '6000', 'year')];
  const r = C.compute(profile({ contrib: '20', tax: '10' }), ch);
  assert.equal(r.turnoverCents, 4916667); // (30 000 / 0,9 + 6 000) / 0,8 = 49 166,666…
  assert.ok(r.netCents >= 3000000 && r.netCents - 3000000 <= 2, r.netCents);
  assert.equal(r.contribCents + r.chargesCents + r.taxCents + r.netCents, r.turnoverCents);
});

test('temps facturable partiel et heures par jour', () => {
  const p = profile({ weeksOff: '5', daysOff: '10', billablePct: '70', hours: '7.5' });
  const r = C.compute(p, []);
  assert.equal(r.workingDays, 225); // 47 × 5 − 10
  assert.equal(r.billableDays, 157.5);
  assert.equal(r.billableHours, 1181.25);
  assert.equal(r.dayRateCents, Math.ceil(3000000 / 157.5)); // 190,48
  assert.equal(r.dayRateCents, 19048);
  assert.equal(r.hourRateCents, 2540); // 190,48 / 7,5 = 25,397… -> 25,40
});

test('tester un tarif : le tarif calculé suffit, un tarif plus bas non', () => {
  const p = profile({ contrib: '22', tax: '11', weeksOff: '6', billablePct: '65' });
  const ch = [charge('Coworking', '180', 'month'), charge('Comptable', '1200', 'year')];
  const r = C.compute(p, ch);
  assert.ok(C.checkDayRate(p, ch, r.dayRateCents).gapCents >= 0);
  assert.ok(C.checkDayRate(p, ch, r.dayRateCents - 100).gapCents < 0);
  const low = C.checkDayRate(p, ch, 100); // 1,00 par jour : bénéfice négatif, aucun prélèvement sur le bénéfice
  assert.ok(low.profitCents < 0 && low.taxCents === 0);
  assert.throws(() => C.checkDayRate(p, ch, 0), /err\.testRate/);
});

test('grands montants : calcul exact sans perte de précision', () => {
  const r = C.compute(profile({ targetNet: '9999999', contrib: '45', tax: '45' }), [charge('Gros', '9999999', 'year')]);
  assert.ok(Number.isSafeInteger(r.turnoverCents));
  assert.ok(r.netCents >= 999999900);
});

test('CSV du calcul : libellés traduits, charges en négatif', () => {
  const ch = [charge('=Logiciel', '10', 'month')];
  const r = C.compute(profile({ contrib: '20' }), ch);
  const labels = { head: ['Poste', 'Montant'], turnover: 'CA', contrib: 'Prélèvements CA', charges: 'Charges', profit: 'Bénéfice', tax: 'Prélèvements bénéfice', net: 'Net', dayRate: 'TJM', hourRate: 'Horaire', billableDays: 'Jours' };
  const lines = C.resultCsv(r, ch, labels).trim().split('\r\n');
  assert.equal(lines.length, 11);
  assert.equal(lines[3], '"Charges";"-120.00"');
  assert.equal(lines[10], '"\'=Logiciel";"-120.00"');
  assert.throws(() => C.resultCsv(r, ch, { head: ['x'] }), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const st = { profile: profile({ contrib: '21.2', tax: '8', hours: '7.25' }), charges: [charge('Logiciel', '29,90', 'month'), charge('Assurance', '450', 'year')] };
  const json = JSON.parse(C.backup(st));
  assert.deepEqual(C.validateBackup(json), st);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(C.emptyState()))), C.emptyState());
  assert.throws(() => C.validateBackup({ ...json, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...json, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, profile: { ...json.profile, contribBp: 9500 } }), /err\.contrib/);
  assert.throws(() => C.validateBackup({ ...json, profile: { ...json.profile, daysPerWeek: 1.5 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, charges: [{ ...json.charges[0], period: 'week' }] }), /err\.period/);
  assert.throws(() => C.validateBackup({ ...json, charges: [json.charges[0], json.charges[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...json, charges: Array(41).fill(json.charges[0]) }), /err\.tooMany/);
});
