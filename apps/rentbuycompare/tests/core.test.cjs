// Tests métier de RentBuyCompare : saisies, prêt amorti, loyers indexés, placement de l'apport, revalorisation,
// coûts nets cumulés, point d'équilibre, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const BASE = { price: '100000', down: '20000', fees: '0', loanRate: '0', loanYears: '10', charges: '0', maintenance: '0', costGrowth: '0', rent: '500', rentGrowth: '0', appreciation: '0', invest: '0', horizon: '10' };
const params = (o) => C.makeParams({ ...BASE, ...o });

test('saisies : montants, taux signés, durées', () => {
  assert.equal(C.parseCents('250 000,50', 'price'), 25000050);
  assert.equal(C.parseCents('', 'fees'), 0);
  assert.throws(() => C.parseCents('', 'price', { required: true }), /^Error: err\.required\|\{"field":"price"\}/);
  assert.throws(() => C.parseCents('-5', 'fees'), /err\.amount/);
  assert.throws(() => C.parseCents('1,234', 'fees'), /err\.amount/);
  assert.equal(C.parseRate('3,5', 'loanRate'), 350);
  assert.equal(C.parseRate('-1.5 %', 'appreciation'), -150);
  assert.equal(C.parseRate('-0', 'appreciation'), 0);
  for (const bad of ['31', '-21', '3.555', 'abc']) assert.throws(() => C.parseRate(bad, 'invest'), /err\.rate/);
  assert.throws(() => C.parseRate('-1', 'loanRate', 0, 2000), /err\.rate/);
  assert.throws(() => params({ loanYears: '0' }), /err\.years/);
  assert.throws(() => params({ horizon: '41' }), /err\.years\|\{"field":"horizon","max":40\}/);
  assert.throws(() => params({ price: '0' }), /err\.pricePositive/);
  assert.throws(() => params({ rent: '0' }), /err\.rentPositive/);
  assert.throws(() => params({ down: '100000.01' }), /err\.downTooBig/);
  assert.throws(() => params({ loanRate: '25' }), /err\.rate/);
  assert.throws(() => C.makeParams(null), /err\.params/);
});

test('prêt amortissable : mensualité classique et solde nul à l\'échéance', () => {
  assert.equal(C.monthlyPayment(21800000, 350, 240), 126431); // 218 000 à 3,5 % sur 20 ans : 1 264,31 par mois
  assert.equal(C.monthlyPayment(0, 350, 240), 0);
  const r = C.simulate(params({ price: '250000', down: '50000', fees: '18000', loanRate: '3.5', loanYears: '20', horizon: '20' }));
  assert.equal(r.loanCents, 21800000); // prix + frais − apport
  assert.equal(r.paymentCents, 126431);
  assert.equal(r.final.balanceCents, 0);
  assert.equal(r.final.paidCum - r.final.interestCum, 21800000); // le capital remboursé est exactement l'emprunt
});

test('petit prêt à taux zéro amortissable malgré un arrondi à zéro de la mensualité', () => {
  const p = params({ price: '100000', down: '99999.99', loanYears: '40', horizon: '40', loanRate: '0' });
  const r = C.simulate(p);
  assert.equal(r.loanCents, 1);
  assert.equal(r.paymentCents, 1);
  assert.equal(r.final.balanceCents, 0);
  assert.equal(r.final.paidCum - r.final.interestCum, r.loanCents);
});

test('très petit prêt : la mensualité doit couvrir intérêts et amortissement', () => {
  const p = params({ price: '100000', down: '99999.70', loanRate: '20', loanYears: '40', horizon: '40' });
  const r = C.simulate(p);
  assert.equal(r.loanCents, 30);
  assert.equal(r.paymentCents, 2);
  assert.equal(r.final.balanceCents, 0);
  assert.equal(r.final.paidCum - r.final.interestCum, r.loanCents);
});

test('à taux nuls et sans frais, acheter ne coûte rien : la location est plus chère dès la 1re année', () => {
  const r = C.simulate(params({}));
  assert.equal(r.paymentCents, 66667); // 80 000 / 120 mois, dernière échéance ajustée
  assert.equal(r.final.paidCum, 8000000);
  assert.deepEqual(r.years.map((y) => y.ownerNet), new Array(11).fill(0));
  assert.equal(r.years[1].renterNet, 600000);
  assert.equal(r.final.renterNet, 6000000);
  assert.equal(r.breakEven, 1);
  assert.equal(r.winner, 'buy');
});

test('frais d\'achat, charges et entretien : coûts de l\'achat ; année 0 = frais', () => {
  const r = C.simulate(params({ fees: '8000', down: '28000', charges: '1200', maintenance: '600', costGrowth: '10', horizon: '2' }));
  assert.equal(r.years[0].ownerNet, 800000);
  assert.equal(r.years[1].ownerCostsCum, 180000);
  assert.equal(r.years[2].ownerCostsCum, 180000 + 198000); // indexé de 10 % la 2e année
  assert.equal(r.years[2].ownerNet, 800000 + 378000);
});

test('loyers indexés chaque année et placement de l\'apport capitalisé chaque mois', () => {
  const r = C.simulate(params({ rent: '1000', rentGrowth: '10', down: '10000', invest: '12', horizon: '2' }));
  assert.equal(r.years[2].rentCum, 1200000 + 1320000);
  assert.equal(r.years[1].investCents, 1126825); // 10 000 × 1,01^12, arrondi chaque mois
  assert.equal(r.years[1].renterNet, 1200000 - 126825);
  const neg = C.simulate(params({ down: '10000', invest: '-12', horizon: '1' }));
  assert.ok(neg.years[1].investCents < 1000000 && neg.years[1].renterNet > 600000); // un rendement négatif renchérit la location
});

test('revalorisation du bien (positive ou négative) et horizon plus court que le prêt', () => {
  const up = C.simulate(params({ appreciation: '10', horizon: '2' }));
  assert.deepEqual(up.years.map((y) => y.valueCents), [10000000, 11000000, 12100000]);
  assert.equal(up.final.ownerNet, -2100000); // plus-value latente (sans frais de revente)
  const down = C.simulate(params({ appreciation: '-5', horizon: '1', loanRate: '4' }));
  assert.equal(down.years[1].valueCents, 9500000);
  assert.ok(down.final.balanceCents > 0); // capital restant dû déduit de la valeur
  assert.equal(down.final.equityCents, down.final.valueCents - down.final.balanceCents);
  assert.equal(down.final.ownerNet, 2000000 + down.final.paidCum - down.final.equityCents);
});

test('point d\'équilibre : première année à partir de laquelle l\'achat reste moins coûteux', () => {
  const r = C.simulate(params({ price: '250000', down: '50000', fees: '18000', loanRate: '3.5', loanYears: '20', charges: '1800', maintenance: '1500', costGrowth: '2', rent: '900', rentGrowth: '1.5', appreciation: '1', invest: '3', horizon: '25' }));
  assert.equal(r.breakEven, 8);
  assert.ok(r.years[7].diff < 0 && r.years.slice(8).every((y) => y.diff >= 0));
  const never = C.simulate(params({ fees: '30000', down: '50000', rent: '200', loanRate: '5', horizon: '5' }));
  assert.equal(never.breakEven, null);
  assert.equal(never.winner, 'rent');
});

test('CSV : en-têtes fournis, une ligne par année, valeurs en décimal', () => {
  const r = C.simulate(params({ horizon: '2' }));
  const labels = Object.fromEntries(C.COLUMNS.map((c) => [c, c === 'year' ? 'Année' : '=' + c]));
  const lines = C.yearlyCsv(r, labels).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[0].startsWith('"Année";"\'=rentCum"'), lines[0]); // pas de formule de tableur
  assert.equal(lines[2].split(';')[1], '"6000.00"');
  assert.throws(() => C.yearlyCsv(r, { year: 'x' }), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const p = params({ appreciation: '-1.25', invest: '2.5', fees: '7000.10', down: '27000.10' });
  const state = { params: p };
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(state))), state);
  assert.deepEqual(C.validateBackup({ app: 'rentbuycompare', version: 1, params: null }), { params: null });
  const ok = { app: 'rentbuycompare', version: 1, params: p };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, params: { ...p, extra: 1 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, params: { ...p, priceCents: 1.5 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, params: { ...p, rentCents: -1 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, params: { ...p, horizonYears: 99 } }), /err\.years/);
  assert.throws(() => C.validateBackup({ ...ok, params: { ...p, downCents: p.priceCents * 2 } }), /err\.downTooBig/);
  assert.throws(() => C.validateBackup([]), /err\.backup/);
});
