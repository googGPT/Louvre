// Tests métier de PriceLens : saisie des prix, prix unitaires, classement, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const item = (name, price, qty, unit, count = '1') => C.makeItem({ name, price, qty, unit, count }, `item-${String(++n).padStart(4, '0')}`);

test('prix saisis en euros, convertis en centimes sans erreur d\'arrondi', () => {
  assert.equal(C.parseCents('2,49'), 249);
  assert.equal(C.parseCents('2.5'), 250);
  assert.equal(C.parseCents(' 1 299,90 '), 129990);
  for (const bad of ['2,499', '-1', 'abc', '0', '0,00', '']) assert.throws(() => C.parseCents(bad), /^Error: err\.price/);
});

test('prix au kilo, au litre et à la pièce', () => {
  assert.equal(C.unitPriceCents(item('Riz 500 g', '1,29', '500', 'g')), 258); // 2,58 €/kg
  assert.equal(C.unitPriceCents(item('Riz 1 kg', '2,19', '1', 'kg')), 219);
  assert.equal(C.unitPriceCents(item('Sachets', '1,89', '125', 'g', '4')), 378); // 4 × 125 g = 500 g
  assert.equal(C.unitPriceCents(item('Soda', '3,60', '33', 'cl', '6')), 182); // 6 × 33 cl = 1,98 L
  assert.equal(C.unitPriceCents(item('Œufs', '3,30', '12', 'piece')), 28); // 0,275 € arrondi à 0,28 €
});

test('classement du moins cher au plus cher, écarts et économie', () => {
  const { groups, mixed } = C.compare([
    item('500 g', '1,29', '500', 'g'), item('1 kg', '2,19', '1', 'kg'),
    item('4 × 125 g', '1,89', '125', 'g', '4'), item('5 kg', '9,90', '5', 'kg'),
  ]);
  assert.equal(mixed, false);
  const g = groups[0];
  assert.equal(g.per, 'kg'); // l'interface affiche « €/kg », « $/kg »… selon la devise
  assert.deepEqual(g.rows.map((r) => r.name), ['5 kg', '1 kg', '500 g', '4 × 125 g']);
  assert.deepEqual(g.rows.map((r) => r.unitPriceCents), [198, 219, 258, 378]);
  assert.equal(g.rows[1].vsBest, 10.6); // (2,19 - 1,98) / 1,98
  assert.equal(g.savingPct, 47.6); // (3,78 - 1,98) / 3,78
  assert.equal(g.rows[3].ratio, 1);
});

test('le classement utilise le prix exact, pas le prix arrondi', () => {
  // Les deux affichent 3,00 €/kg, mais B (333,4 g) est très légèrement moins cher que A (333 g).
  const a = item('A', '1,00', '333', 'g'), b = item('B', '1,00', '333.4', 'g');
  assert.equal(C.unitPriceCents(a), C.unitPriceCents(b));
  assert.deepEqual(C.compare([a, b]).groups[0].rows.map((r) => r.name), ['B', 'A']);
});

test('masses, volumes et pièces sont classés séparément', () => {
  const { groups, mixed } = C.compare([item('Lait', '1,10', '1', 'l'), item('Farine', '0,95', '1', 'kg'), item('Lait 6×', '5,94', '1', 'l', '6')]);
  assert.equal(mixed, true);
  assert.deepEqual(groups.map((g) => g.dim), ['masse', 'volume']);
  assert.deepEqual(groups[1].rows.map((r) => r.unitPriceCents), [99, 110]);
});

test('saisies refusées : unité inconnue, lot non entier, nom vide', () => {
  assert.throws(() => item('X', '1', '1', 'oz'), /err\.unit/);
  assert.throws(() => item('X', '1', '1', 'g', '1.5'), /err\.count/);
  assert.throws(() => item(' ', '1', '1', 'g'), /err\.nameRequired/);
  assert.throws(() => item('X', '1', '0', 'g'), /err\.qty/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const lists = [C.makeList('Courses', 'list-0001', [item('Riz', '2,19', '1', 'kg'), item('Soda', '3,60', '33', 'cl', '6')])];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(lists))), lists);
  const ok = { app: 'pricelens', version: 1, lists };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, lists: [{ ...lists[0], extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, lists: [{ ...lists[0], items: [{ ...lists[0].items[0], unit: 'oz' }] }] }), /err\.unit/);
  assert.throws(() => C.validateBackup({ ...ok, lists: [{ ...lists[0], items: [{ ...lists[0].items[0], priceCents: -5 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, lists: [lists[0], lists[0]] }), /err\.backup/);
});
