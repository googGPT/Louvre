// Tests métier de FXBudget : devises, taux saisis, conversion exacte et arrondi explicite, restes, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const trip = C.makeTrip({ name: 'Japon', ref: 'EUR', start: '2026-11-01', end: '2026-11-10', budget: '2000', catBudgets: { food: '400', lodging: '900,50' } }, ['EUR', 'USD']);
const jpy = C.makeRate({ currency: 'jpy', dir: 'fromRef', value: '162,35', date: '2026-10-20' }, 'rate-0001', trip); // 1 EUR = 162,35 JPY
const usd = C.makeRate({ currency: 'USD', dir: 'toRef', value: '0.9234', date: '2026-10-20' }, 'rate-0002', trip); // 1 USD = 0,9234 EUR
const exp = (over, id, rates = [jpy, usd]) => C.makeExpense({ date: '2026-11-02', category: 'food', label: '', currency: 'JPY', amount: '1500', ...over }, id, trip, rates);

test('voyage : dates, durée, budgets en centimes', () => {
  assert.deepEqual(trip.catBudgets, { lodging: 90050, transport: null, food: 40000, activities: null, shopping: null, other: null });
  assert.equal(trip.budgetCents, 200000);
  assert.throws(() => C.makeTrip({ ...trip, budget: '100', end: '2026-10-01' }), /err\.endBefore/);
  assert.throws(() => C.makeTrip({ ...trip, budget: '100', end: '2028-01-01' }), /err\.tooLong\|\{"max":366\}/);
  assert.throws(() => C.makeTrip({ ...trip, budget: '' }), /err\.budget/);
  assert.throws(() => C.makeTrip({ ...trip, budget: '10', ref: 'JPY' }, ['EUR', 'USD']), /err\.currency/);
  assert.throws(() => C.makeTrip({ ...trip, budget: '10', name: '' }), /err\.tripName/);
});

test('devises : codes ISO reconnus, décimales propres à chaque devise', () => {
  assert.equal(C.checkCurrency(' usd '), 'USD');
  assert.throws(() => C.checkCurrency('EURO'), /err\.currency/);
  assert.throws(() => C.checkCurrency('ZZZ'), /err\.currency/);
  assert.deepEqual(['EUR', 'JPY', 'TND', 'XOF'].map(C.decimals), [2, 0, 3, 0]);
  assert.equal(C.parseMinor('1500', 'JPY'), 1500);
  assert.equal(C.parseMinor('12,5', 'USD'), 1250);
  assert.equal(C.parseMinor('4.125', 'TND'), 4125);
  assert.throws(() => C.parseMinor('15.5', 'JPY'), /err\.amount\|\{"d":0\}/);
  assert.throws(() => C.parseMinor('1.234', 'USD'), /err\.amount\|\{"d":2\}/);
  assert.throws(() => C.parseMinor('0', 'USD'), /err\.amount/);
});

test('taux : saisis, normalisés, jamais nuls', () => {
  assert.equal(jpy.value, '162.35'); assert.equal(jpy.currency, 'JPY');
  assert.equal(C.parseRate('0007.5000'), '7.5');
  assert.equal(C.parseRate('0.00000001'), '0.00000001');
  for (const bad of ['0', '0.000', '-1', '1.123456789', 'abc', '']) assert.throws(() => C.parseRate(bad), /err\.rate/);
  assert.throws(() => C.makeRate({ currency: 'EUR', dir: 'toRef', value: '1', date: '2026-10-20' }, 'rate-0003', trip), /err\.rateSelf/);
  assert.throws(() => C.makeRate({ currency: 'USD', dir: 'toRef', value: '1', date: '2026-13-01' }, 'rate-0003', trip), /err\.rateDate/);
});

test('conversion exacte, arrondi au centime le plus proche (moitié vers le haut)', () => {
  // 1 500 JPY ÷ 162,35 = 9,2393… EUR -> 9,24 €
  assert.deepEqual(C.convert(1500, 'JPY', 'EUR', jpy), { cents: 924, exact: false });
  // 12,50 USD × 0,9234 = 11,5425 EUR -> 11,54 €
  assert.deepEqual(C.convert(1250, 'USD', 'EUR', usd), { cents: 1154, exact: false });
  // Moitié exacte : 0,05 USD × 0,9 = 0,045 -> 0,05 (vers le haut)
  assert.equal(C.convert(5, 'USD', 'EUR', { dir: 'toRef', value: '0.9' }).cents, 5);
  // Résultat exact signalé : 10 USD × 0,5 = 5,00 €
  assert.deepEqual(C.convert(1000, 'USD', 'EUR', { dir: 'toRef', value: '0.5' }), { cents: 500, exact: true });
  // 3 décimales : 4,125 TND × 0,3 = 1,2375 -> 1,24
  assert.equal(C.convert(4125, 'TND', 'EUR', { dir: 'toRef', value: '0.3' }).cents, 124);
  // Pas de flottant : 0,1 + 0,2 du binaire n'intervient jamais.
  assert.equal(C.convert(10, 'USD', 'EUR', { dir: 'toRef', value: '3' }).cents, 30);
  assert.deepEqual(C.convert(1999, 'EUR', 'EUR', null), { cents: 1999, exact: true });
  assert.throws(() => C.convert(100, 'GBP', 'EUR', null), /err\.noRate\|\{"cur":"GBP"\}/);
  assert.equal(C.divRound(5n, 2n), 3n); assert.equal(C.divRound(7n, 3n), 2n);
});

test('taux applicable : le plus récent avant la dépense, sinon le plus ancien (signalé)', () => {
  const later = C.makeRate({ currency: 'USD', dir: 'toRef', value: '0.95', date: '2026-11-05' }, 'rate-0004', trip);
  const rates = [usd, later];
  assert.equal(C.rateFor(rates, 'USD', '2026-11-04').rate.id, 'rate-0002');
  assert.equal(C.rateFor(rates, 'USD', '2026-11-05').rate.id, 'rate-0004');
  assert.deepEqual(C.rateFor(rates, 'USD', '2026-10-01'), { rate: usd, later: true });
  assert.equal(C.rateFor(rates, 'GBP', '2026-11-01'), null);
  const e = exp({ currency: 'USD', amount: '100', date: '2026-11-06' }, 'exp-00001', rates);
  assert.equal(C.converted(e, trip, rates).cents, 9500);
});

test('dépenses : devise sans taux refusée, catégorie et montant validés', () => {
  assert.throws(() => exp({ currency: 'GBP' }, 'exp-00001'), /err\.noRate\|\{"cur":"GBP"\}/);
  assert.throws(() => exp({ category: 'gifts' }, 'exp-00001'), /err\.category/);
  assert.throws(() => exp({ amount: '15.5' }, 'exp-00001'), /err\.amount\|\{"d":0\}/);
  assert.equal(exp({ currency: 'EUR', amount: '3,20' }, 'exp-00001').minor, 320);
});

test('synthèse : reste global, par catégorie et par jour (arrondi inférieur)', () => {
  const rates = [jpy, usd];
  const data = { trip, rates, expenses: [
    exp({ amount: '1500' }, 'exp-00001'), // 9,24 €
    exp({ currency: 'USD', amount: '12.50', category: 'transport', date: '2026-11-02' }, 'exp-00002'), // 11,54 €
    exp({ currency: 'EUR', amount: '450', category: 'lodging', date: '2026-11-01' }, 'exp-00003'),
    exp({ currency: 'EUR', amount: '20', category: 'other', date: '2026-10-30' }, 'exp-00004'), // avant le départ
  ] };
  const s = C.summary(data, '2026-11-03');
  assert.equal(s.spent, 924 + 1154 + 45000 + 2000);
  assert.equal(s.left, 200000 - 49078);
  assert.deepEqual(s.byCat.food, { spent: 924, budget: 40000, left: 39076 });
  assert.deepEqual(s.byCat.transport, { spent: 1154, budget: null, left: null });
  assert.equal(s.tripDays, 10); assert.equal(s.daysLeft, 8); // du 3 au 10 inclus
  assert.equal(s.perDayLeft, Math.floor(150922 / 8)); // 18 865,25 -> 18 865 centimes
  assert.equal(s.perDayPlanned, 20000);
  assert.deepEqual(s.days.slice(0, 2).map((d) => [d.day, d.spent, d.over]), [['2026-11-01', 45000, true], ['2026-11-02', 2078, false]]);
  assert.deepEqual(s.outside, [{ day: '2026-10-30', spent: 2000 }]);
  assert.equal(s.allocated, 130050); assert.equal(s.overAllocated, false);
  assert.equal(C.summary(data, '2026-10-01').daysLeft, 10);
  assert.equal(C.summary(data, '2026-12-01').perDayLeft, null);
});

test('CSV : montants d\'origine et convertis, taux et sa date, formules neutralisées', () => {
  const data = { trip, rates: [jpy], expenses: [exp({ label: '=Ramen' }, 'exp-00001'), exp({ currency: 'EUR', amount: '3,2', category: 'other', date: '2026-11-01' }, 'exp-00002', [jpy])] };
  const csv = C.toCSV(data, { headers: ['Date', 'Cat', 'Libellé', 'Montant', 'Devise', 'Taux', 'Date du taux', 'Converti', 'Réf'], catLabel: (c) => c, decimal: 'comma', dirText: (r, ref) => `1 ${ref} = ${r.value} ${r.currency}` });
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[1], '2026-11-01;other;;3,20;EUR;;;3,20;EUR');
  assert.equal(lines[2], "2026-11-02;food;'=Ramen;1500;JPY;1 EUR = 162.35 JPY;2026-10-20;9,24;EUR");
  assert.equal(C.minorText(4125, 3, 'dot'), '4.125');
});

test('modifications : devise de référence verrouillée, taux utilisé protégé, doublon refusé', () => {
  let data = { trip, rates: [], expenses: [] };
  data = C.addRate(data, jpy);
  assert.throws(() => C.addRate(data, { ...jpy, id: 'rate-0009' }), /err\.rateExists/);
  assert.throws(() => C.setTrip(data, { ...trip, ref: 'USD' }), /err\.refLocked/);
  data = C.addExpense(data, exp({}, 'exp-00001', data.rates));
  assert.throws(() => C.removeRate(data, jpy.id), /err\.rateUsed\|\{"cur":"JPY"\}/);
  data = C.removeExpense(data, 'exp-00001');
  assert.equal(C.removeRate(data, jpy.id).rates.length, 0);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { trip, rates: [jpy, usd], expenses: [exp({}, 'exp-00001'), exp({ currency: 'USD', amount: '9.99' }, 'exp-00002')] };
  const json = JSON.parse(C.backup(data));
  assert.deepEqual(C.validateData(json), data);
  assert.deepEqual(C.validateData({ app: 'fxbudget', version: 1, trip: null, rates: [], expenses: [] }), { trip: null, rates: [], expenses: [] });
  const bad = (mut) => { const d = JSON.parse(JSON.stringify(json)); mut(d); return d; };
  assert.throws(() => C.validateData({ ...json, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData(bad((d) => { d.extra = 1; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.rates[0].value = 162.35; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.rates[0].value = '162.350'; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.rates.shift(); })), /err\.noRate/);
  assert.throws(() => C.validateData(bad((d) => { d.expenses[0].minor = 1.5; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.expenses[0].currency = 'jpy'; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.trip.catBudgets.toys = 1; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.expenses[1].id = d.expenses[0].id; })), /err\.backup/);
  assert.throws(() => C.validateData(bad((d) => { d.trip = null; })), /err\.backup/);
});
