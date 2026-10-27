// Tests métier de TravelPackingWeight : conversions, totaux, dépassements, propositions de déplacement, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
function trip(limits, bags, items) {
  const t = { ...C.makeTrip('Lisbonne', id()), limits: C.makeLimits(limits, 'kg') };
  t.bags = bags.map(([name, type, tare]) => C.makeBag({ name, type, tare }, id(), 'kg'));
  const byName = Object.fromEntries(t.bags.map((b) => [b.name, b.id]));
  t.items = items.map(([name, kg, qty, bag, fixed = false]) => C.makeItem({ name, weight: kg, qty, bagId: byName[bag], fixed }, id(), 'kg'));
  return t;
}

test('conversions de poids exactes, arrondies au gramme', () => {
  assert.equal(C.toGrams('1,5', 'kg', 'err.weight', 1e6), 1500);
  assert.equal(C.toGrams('250', 'g', 'err.weight', 1e6), 250);
  assert.equal(C.toGrams('50', 'lb', 'err.weight', 1e6), 22680); // 22 679,6 g
  assert.equal(C.toGrams('16', 'oz', 'err.weight', 1e6), 454);
  assert.equal(C.toGrams('', 'kg', 'err.limit', 1e6, true), 0); // limite non saisie
  for (const bad of ['', '-1', '1,2345', 'abc', '0']) assert.throws(() => C.toGrams(bad, 'kg', 'err.weight', 1e6), /err\.weight/);
  assert.throws(() => C.toGrams('1', 'stone', 'err.weight', 1e6), /err\.unit/);
  assert.throws(() => C.toGrams('101', 'kg', 'err.weight', 100000), /err\.weight/);
  assert.equal(C.parseQty(''), 1);
  assert.throws(() => C.parseQty('0'), /err\.qty/);
  assert.throws(() => C.parseQty('1.5'), /err\.qty/);
});

test('poids total par bagage (tare comprise) et dépassements', () => {
  const t = trip({ cabin: '8', checked: '23', personal: '' }, [['Valise', 'checked', '4'], ['Cabine', 'cabin', '2,5'], ['Sac', 'personal', '0,5']],
    [['Jean', '0,7', '3', 'Valise'], ['Chaussures', '1,2', '1', 'Cabine'], ['Ordinateur', '2', '1', 'Cabine'], ['Livre', '0,4', '5', 'Cabine'], ['Trousse', '0,3', '1', 'Sac']]);
  const [valise, cabine, sac] = C.totals(t);
  assert.deepEqual([valise.totalG, valise.excessG, valise.spareG], [6100, 0, 16900]);
  assert.deepEqual([cabine.totalG, cabine.limitG, cabine.excessG], [7700, 8000, 0]);
  assert.deepEqual([sac.totalG, sac.limitG, sac.excessG, sac.spareG], [800, 0, 0, null]); // pas de limite saisie
  const s = C.summary(t);
  assert.equal(s.totalG, 14600); assert.equal(s.overweight, 0);
});

test('déplacement proposé : la plus petite unité qui résorbe l\'excès, vers le bagage le mieux ajusté', () => {
  const t = trip({ cabin: '8', checked: '23', personal: '' }, [['Valise', 'checked', '4'], ['Cabine', 'cabin', '2,5']],
    [['Jean', '0,7', '3', 'Valise'], ['Ordinateur', '2', '1', 'Cabine', true], ['Livre', '0,4', '5', 'Cabine'], ['Pull', '0,6', '2', 'Cabine'], ['Trousse', '1', '1', 'Cabine']]);
  // Cabine : 2,5 + 2 + 2 + 1,2 + 1 = 8,7 kg pour 8 kg -> excès 0,7 kg : la trousse (1 kg) suffit seule.
  assert.equal(C.totals(t)[1].excessG, 700);
  const r = C.suggestMoves(t);
  assert.deepEqual(r.moves.map((m) => [m.name, m.qty]), [['Trousse', 1]]);
  assert.equal(r.moves[0].to, t.bags[0].id);
  assert.deepEqual(r.unresolved, []);
  assert.ok(r.after.every((b) => !b.limitG || b.totalG <= b.limitG));
  const fixed = C.applyMoves(t, r.moves, id);
  assert.equal(C.summary(fixed).overweight, 0);
  assert.equal(C.summary(fixed).totalG, C.summary(t).totalG); // rien ne disparaît
});

test('plusieurs unités : on déplace les plus lourdes d\'abord, objets « à garder » exclus', () => {
  const t = trip({ cabin: '7', checked: '23', personal: '3' }, [['Cabine', 'cabin', '2'], ['Valise', 'checked', '4'], ['Sac', 'personal', '0,5']],
    [['Ordinateur', '2,5', '1', 'Cabine', true], ['Livre', '0,5', '6', 'Cabine'], ['Pull', '0,6', '1', 'Valise']]);
  // Cabine : 2 + 2,5 + 3 = 7,5 kg pour 7 -> excès 0,5 : un livre suffit.
  let r = C.suggestMoves(t);
  assert.deepEqual(r.moves.map((m) => [m.name, m.qty]), [['Livre', 1]]);
  assert.equal(r.moves[0].to, t.bags[2].id); // le sac (2,5 kg de marge) est mieux ajusté que la valise (18,4 kg)
  // Excès de 2,2 kg : aucune unité seule ne suffit, on enchaîne les livres.
  const t2 = { ...t, limits: { ...t.limits, cabin: 5300 } };
  r = C.suggestMoves(t2);
  assert.equal(r.moves.reduce((s, m) => s + m.qty, 0), 5); // 5 × 0,5 kg >= 2,2 kg
  assert.ok(!r.moves.some((m) => m.name === 'Ordinateur'));
  const applied = C.applyMoves(t2, r.moves, id);
  assert.equal(C.summary(applied).overweight, 0);
  assert.equal(applied.items.filter((i) => i.name === 'Livre').reduce((s, i) => s + i.qty, 0), 6);
});

test('dépassement impossible à résorber : signalé', () => {
  const t = trip({ cabin: '7', checked: '', personal: '' }, [['Cabine', 'cabin', '2']], [['Matériel', '6', '1', 'Cabine']]);
  const r = C.suggestMoves(t);
  assert.deepEqual(r.moves, []);
  assert.deepEqual(r.unresolved.map((u) => u.excessG), [1000]);
  // Objet à garder + capacité insuffisante ailleurs.
  const t2 = trip({ cabin: '7', checked: '5', personal: '' }, [['Cabine', 'cabin', '2'], ['Valise', 'checked', '4']], [['Matériel', '6', '1', 'Cabine', true]]);
  assert.equal(C.suggestMoves(t2).unresolved.length, 1);
});

test('applyMoves refuse un déplacement périmé', () => {
  const t = trip({ cabin: '7', checked: '23', personal: '' }, [['Cabine', 'cabin', '2'], ['Valise', 'checked', '4']], [['Livre', '0,5', '12', 'Cabine']]);
  const r = C.suggestMoves(t);
  assert.ok(r.moves.length);
  assert.throws(() => C.applyMoves({ ...t, items: [] }, r.moves, id), /err\.moveStale/);
});

test('saisies refusées', () => {
  assert.throws(() => C.makeBag({ name: 'X', type: 'trunk' }, id(), 'kg'), /err\.type/);
  assert.throws(() => C.makeBag({ name: '', type: 'cabin' }, id(), 'kg'), /err\.nameRequired/);
  assert.throws(() => C.makeBag({ name: 'X', type: 'cabin', tare: '31' }, id(), 'kg'), /err\.tare/);
  assert.throws(() => C.makeItem({ name: 'X', weight: '1', qty: '1', bagId: 'x' }, id(), 'kg'), /err\.id/);
  assert.throws(() => C.makeLimits({ cabin: 'beaucoup' }, 'kg'), /err\.limit/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const t = trip({ cabin: '8', checked: '23', personal: '' }, [['Valise', 'checked', '4']], [['Jean', '0,7', '3', 'Valise', true]]);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([t]))), [t]);
  const ok = { app: 'travelpackingweight', version: 1, trips: [t] };
  assert.throws(() => C.validateBackup({ ...ok, app: 'trippack' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, more: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, items: [{ ...t.items[0], bagId: 'id-unknown' }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, items: [{ ...t.items[0], weightG: 0 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, limits: { cabin: -1, checked: 0, personal: 0 } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, bags: [{ ...t.bags[0], type: 'x' }] }] }), /err\.type/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [t, t] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: Array(31).fill(t) }), /err\.tooManyTrips/);
});
