// Tests métier de PriceJournal : saisies, dates civiles, prix unitaires, regroupement par produit, évolution, variation,
// meilleur prix, dernier prix par magasin, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const entry = (product, store, date, price, qty, unit, count = '1') => C.makeEntry({ product, store, date, price, qty, unit, count }, `entry-${String(++n).padStart(4, '0')}`);
const build = (list) => list.reduce((acc, e) => C.addEntry(acc, e), []);

test('saisies : prix, contenance, lot, jours civils', () => {
  assert.equal(C.parseCents('2,49'), 249);
  for (const bad of ['0', '2,499', '-1', 'x']) assert.throws(() => C.parseCents(bad), /err\.price/);
  assert.equal(C.parseQty('0,75'), 0.75);
  assert.throws(() => C.parseQty('0'), /err\.qty/);
  assert.equal(C.parseCount(''), 1);
  assert.throws(() => C.parseCount('0'), /err\.count/);
  assert.equal(C.parseDay('2024-02-29'), '2024-02-29');
  for (const bad of ['2023-02-29', '2024-13-01', '24-01-01', '1989-12-31', '2024-1-5', '']) assert.throws(() => C.parseDay(bad), /err\.date/);
  assert.throws(() => entry(' ', 'A', '2024-01-01', '1', '1', 'kg'), /err\.productRequired/);
  assert.throws(() => entry('Café', '', '2024-01-01', '1', '1', 'kg'), /err\.storeRequired/);
  assert.throws(() => entry('x'.repeat(61), 'A', '2024-01-01', '1', '1', 'kg'), /err\.productLong\|\{"max":60\}/);
  assert.throws(() => entry('Café', 'A', '2024-01-01', '1', '1', 'oz'), /err\.unit/);
});

test('prix unitaire au kg, au litre, à la pièce', () => {
  assert.equal(C.unitPriceCents(entry('Café', 'A', '2024-01-01', '3,10', '250', 'g')), 1240);
  assert.equal(C.unitPriceCents(entry('Lait', 'A', '2024-01-01', '6,30', '1', 'l', '6')), 105);
  assert.equal(C.unitPriceCents(entry('Œufs', 'A', '2024-01-01', '3,30', '12', 'piece')), 28);
});

test('regroupement par produit (casse ignorée) et refus d\'une unité incompatible', () => {
  const list = build([entry('Café', 'A', '2024-01-01', '3', '250', 'g'), entry('café', 'B', '2024-01-02', '6', '0.5', 'kg'), entry('Lait', 'A', '2024-01-01', '1', '1', 'l')]);
  assert.equal(list[1].product, 'Café'); // nom du premier relevé conservé
  assert.deepEqual(C.products(list).map((p) => [p.name, p.count, p.dim]), [['Café', 2, 'mass'], ['Lait', 1, 'volume']]);
  assert.throws(() => C.addEntry(list, entry('CAFÉ', 'A', '2024-02-01', '3', '1', 'piece')), /err\.dimMismatch\|\{"dim":"mass"\}/);
});

test('évolution : ordre chronologique, variation, meilleur prix, dernier prix par magasin', () => {
  const list = build([
    entry('Café', 'Marché', '2024-03-01', '3,30', '250', 'g'), // 13,20 €/kg
    entry('Café', 'Super A', '2024-01-01', '3,00', '250', 'g'), // 12,00 €/kg (premier)
    entry('Café', 'Super A', '2024-02-01', '5,50', '500', 'g'), // 11,00 €/kg (meilleur)
    entry('Café', 'Super A', '2024-04-01', '3,45', '250', 'g'), // 13,80 €/kg (dernier)
  ]);
  const a = C.analyze(list, C.productKey('café'));
  assert.deepEqual(a.entries.map((e) => e.date), ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01']);
  assert.deepEqual(a.entries.map((e) => e.unitPriceCents), [1200, 1100, 1320, 1380]);
  assert.equal(a.per, 'kg');
  assert.equal(a.variationPct, 15); // 13,80 / 12,00 − 1
  assert.equal(a.best.date, '2024-02-01');
  assert.equal(a.worst.date, '2024-04-01');
  assert.equal(a.lastVsBestPct, 25.5); // 13,80 / 11,00 − 1 = 25,45… %
  assert.deepEqual(a.byStore.map((e) => [e.store, e.unitPriceCents]), [['Marché', 1320], ['Super A', 1380]]);
  assert.equal(C.analyze(list, 'inconnu'), null);
});

test('variation exacte (sans arrondi intermédiaire) et relevé unique', () => {
  const one = C.analyze(build([entry('Pain', 'B', '2024-05-01', '1,20', '1', 'piece')]), 'pain');
  assert.equal(one.variationPct, null);
  assert.equal(one.lastVsBestPct, 0);
  // À date égale, l'ordre de saisie départage ; baisse de prix -> variation négative.
  const down = C.analyze(build([entry('Riz', 'A', '2024-05-01', '2', '1', 'kg'), entry('Riz', 'A', '2024-05-01', '1,50', '1', 'kg')]), 'riz');
  assert.equal(down.variationPct, -25);
  assert.equal(down.best.priceCents, 150);
});

test('comparaison exacte de grands lots : meilleur prix préservé malgré arrondis flottants', () => {
  const a = entry('Lot', 'A', '2026-01-01', '999999.89', '405555.511', 'piece', '999');
  const b = entry('Lot', 'B', '2026-01-02', '999999.71', '405555.438', 'piece', '999');
  const first = C.analyze(build([a, b]), 'lot');
  const reversed = C.analyze(build([b, a]), 'lot');
  assert.equal(first.best.store, 'B');
  assert.equal(reversed.best.store, 'B');
  assert.deepEqual(first.byStore.map((x) => x.store), ['B', 'A']);
});

test('la quantité maximale est cohérente avec la validation des sauvegardes', () => {
  assert.throws(() => C.parseQty('999999.001'), /err\.qty/);
  assert.equal(C.parseQty('999999'), 999999);
});

test('CSV : tous les relevés, en-têtes et unités traduits, pas de formule', () => {
  const list = build([entry('=Café', 'A', '2024-02-01', '3', '250', 'g'), entry('Lait', 'B', '2024-01-01', '6,30', '1', 'l', '6')]);
  const labels = Object.fromEntries(C.COLUMNS.map((c) => [c, c.toUpperCase()]));
  const lines = C.entriesCsv(list, labels, (u) => (u === 'l' ? 'L' : u)).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], '"DATE";"PRODUCT";"STORE";"PRICE";"QTY";"UNIT";"COUNT";"UNITPRICE";"PER"');
  assert.equal(lines[1], '"2024-01-01";"Lait";"B";"6.30";"1";"L";"6";"1.05";"L"');
  assert.equal(lines[2], '"2024-02-01";"\'=Café";"A";"3.00";"250";"g";"1";"12.00";"kg"');
  assert.throws(() => C.entriesCsv([], labels), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const entries = build([entry('Café', 'A', '2024-01-01', '3', '250', 'g'), entry('Lait', 'B', '2024-01-02', '1,05', '1.5', 'l', '2')]);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup({ entries }))), { entries });
  const ok = { app: 'pricejournal', version: 1, entries };
  assert.throws(() => C.validateBackup({ ...ok, app: 'pricelens' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, more: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...entries[0], date: '2024-02-30' }] }), /err\.date/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...entries[0], priceCents: 0 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...entries[0], qty: 1.23456 }] }), /err\.qty/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...entries[0], x: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [entries[0], entries[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [entries[0], { ...entries[1], id: 'entry-9999', product: 'café', unit: 'l' }] }), /err\.dimMismatch/);
});
