// Tests métier de PaintEstimator : surfaces, ouvertures, litres, combinaison de pots, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
const can = (volume, price) => C.makeCan({ volume, price }, id());
function project(rooms, cans, settings = { coats: '2', coverage: '10', margin: '0' }) {
  return { ...C.makeProject('Appartement', id()), ...C.makeSettings(settings), rooms, cans };
}

test('saisies décimales converties en entiers exacts', () => {
  assert.equal(C.parseScaled('2,5', 2, 'err.x', 0, 1e9), 250);
  assert.equal(C.parseScaled(' 12.34 ', 2, 'err.x', 0, 1e9), 1234);
  assert.equal(C.parseScaled('0.75', 3, 'err.x', 0, 1e9), 750);
  for (const bad of ['', 'abc', '1,234', '-2', '1e3', '2,,5']) assert.throws(() => C.parseScaled(bad, 2, 'err.x', 0, 1e9), /^Error: err\.x$/);
});

test('surface des murs : périmètre × hauteur moins portes et fenêtres, plafond ajouté', () => {
  const door = C.makeOpening({ kind: 'door', width: '0,83', height: '2,04', count: '1' }, id());
  const win = C.makeOpening({ kind: 'window', width: '1,2', height: '1,35', count: '2' }, id());
  const room = C.makeRoom({ name: 'Salon', perimeter: '18', height: '2,5', ceiling: '20' }, id(), [door, win]);
  const a = C.roomAreas(room);
  assert.equal(a.wallCm2, 450000); // 45 m²
  assert.equal(a.openingsCm2, 83 * 204 + 2 * 120 * 135); // 1,6932 + 3,24 m²
  assert.equal(a.netCm2, 450000 - 16932 - 32400); // 40,0668 m²
  assert.equal(a.totalCm2, a.netCm2 + 200000);
});

test('ouvertures plus grandes que les murs ou plus hautes que la pièce : refusées', () => {
  const big = C.makeOpening({ kind: 'other', width: '10', height: '2', count: '3' }, id());
  assert.throws(() => C.roomAreas(C.makeRoom({ name: 'Couloir', perimeter: '10', height: '2,5' }, id(), [big])), /err\.openingsTooBig\|\{"room":"Couloir"\}/);
  const tall = C.makeOpening({ kind: 'window', width: '1', height: '3', count: '1' }, id());
  assert.throws(() => C.roomAreas(C.makeRoom({ name: 'Bureau', perimeter: '12', height: '2,5' }, id(), [tall])), /err\.openingTooHigh/);
});

test('litres : surface × couches ÷ rendement, arrondi au ml supérieur, puis marge', () => {
  assert.equal(C.needMl(100000, 2, 100), 2000); // 10 m² × 2 couches ÷ 10 m²/L = 2 L
  assert.equal(C.needMl(100001, 1, 120), 834); // 10,0001 m² ÷ 12 m²/L = 0,83334 L -> 834 ml
  assert.equal(C.needMl(100000, 2, 0), null); // rendement non saisi : pas d'invention
  assert.equal(C.withMargin(2000, 10), 2200);
  assert.equal(C.withMargin(1001, 5), 1052); // 1 051,05 -> 1 052
});

test('meilleure combinaison : coût minimal, puis moindre surplus, puis moins de pots', () => {
  const small = can('2,5', '29,90'), big = can('10', '89,00');
  // 12 L : 10 + 2,5 = 118,90 (moins cher que 5 × 2,5 = 149,50 ou 2 × 10 = 178,00)
  let r = C.bestCombination(12000, [small, big]);
  assert.equal(r.totalCents, 11890); assert.equal(r.totalMl, 12500); assert.equal(r.leftoverMl, 500); assert.equal(r.count, 2);
  assert.deepEqual(r.items.map((x) => [x.volumeMl, x.qty]), [[10000, 1], [2500, 1]]);
  // 18 L : 2 × 10 = 178,00 est moins cher que 10 + 4 × 2,5 = 208,60
  r = C.bestCombination(18000, [small, big]);
  assert.deepEqual(r.items.map((x) => [x.volumeMl, x.qty]), [[10000, 2]]);
  // Un grand pot peu cher bat les petits même avec plus de surplus.
  r = C.bestCombination(3000, [can('1', '15'), can('5', '30')]);
  assert.deepEqual(r.items.map((x) => [x.volumeMl, x.qty]), [[5000, 1]]);
  // À coût égal, le moindre surplus gagne : 2 × 0,75 L (1,5 L) contre 1 × 2 L, tous deux à 20 €.
  r = C.bestCombination(1500, [can('0,75', '10'), can('2', '20')]);
  assert.deepEqual(r.items.map((x) => [x.volumeMl, x.qty]), [[750, 2]]);
  assert.equal(r.leftoverMl, 0);
  // À coût et volume égaux, le moins de pots gagne : 1 × 2 L à 20 € contre 2 × 1 L à 10 €.
  r = C.bestCombination(2000, [can('1', '10'), can('2', '20')]);
  assert.equal(r.count, 1);
  assert.equal(C.bestCombination(1000, []), null);
  assert.deepEqual(C.bestCombination(3000000, [small]), { tooBig: true });
  assert.equal(C.bestCombination(0, [small]).count, 0);
});

test('la combinaison exacte bat toute contenance unique', () => {
  const cans = [can('0,5', '9'), can('2,5', '31'), can('10', '99')];
  for (let need = 100; need <= 30000; need += 700) {
    const best = C.bestCombination(need, cans);
    assert.ok(best.totalMl >= need);
    for (const s of C.singleSize(need, cans)) assert.ok(best.totalCents <= s.totalCents, `besoin ${need}`);
  }
});

test('estimation complète d\'un projet', () => {
  const room = C.makeRoom({ name: 'Chambre', perimeter: '14', height: '2,5' }, id(), [C.makeOpening({ kind: 'door', width: '1', height: '2', count: '1' }, id())]);
  const e = C.estimate(project([room], [can('2,5', '25'), can('10', '80')], { coats: '2', coverage: '11', margin: '10' }));
  assert.equal(e.totalCm2, 330000); // 35 - 2 = 33 m²
  assert.equal(e.paintedCm2, 660000);
  assert.equal(e.rawMl, 6000); // 33 × 2 ÷ 11 = 6 L
  assert.equal(e.needMl, 6600);
  assert.equal(e.combo.totalCents, 7500); // 3 × 2,5 L = 75 € (moins cher que 10 L à 80 €)
  assert.equal(e.singles[0].totalCents, 7500);
  const unset = C.estimate({ ...project([room], []), coverage10: 0 });
  assert.equal(unset.needMl, null); assert.equal(unset.combo, null);
});

test('saisies refusées', () => {
  assert.throws(() => C.makeSettings({ coats: '0', coverage: '10' }), /err\.coats/);
  assert.throws(() => C.makeSettings({ coats: '2', coverage: '0,5' }), /err\.coverage/);
  assert.throws(() => C.makeSettings({ coats: '2', coverage: '10', margin: '60' }), /err\.margin/);
  assert.throws(() => C.makeRoom({ name: '', perimeter: '10', height: '2' }, id()), /err\.nameRequired/);
  assert.throws(() => C.makeRoom({ name: 'x'.repeat(61), perimeter: '10', height: '2' }, id()), /err\.nameLong/);
  assert.throws(() => C.makeRoom({ name: 'A', perimeter: '0', height: '2' }, id()), /err\.perimeter/);
  assert.throws(() => C.makeRoom({ name: 'A', perimeter: '10', height: '25' }, id()), /err\.height/);
  assert.throws(() => C.makeOpening({ kind: 'porte', width: '1', height: '2' }, id()), /err\.kind/);
  assert.throws(() => C.makeOpening({ kind: 'door', width: '1', height: '2', count: '1.5' }, id()), /err\.count/);
  assert.throws(() => C.makeCan({ volume: '0', price: '10' }, id()), /err\.volume/);
  assert.throws(() => C.makeCan({ volume: '2,5', price: '0' }, id()), /err\.price/);
  assert.throws(() => C.makeCan({ volume: '2,5', price: '10' }, 'x'), /err\.id/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const room = C.makeRoom({ name: 'Salon', perimeter: '18', height: '2,5', ceiling: '20,25' }, id(), [C.makeOpening({ kind: 'window', width: '1,2', height: '1,35', count: '2' }, id())]);
  const projects = [project([room], [can('2,5', '29,90')])];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(projects))), projects);
  const ok = { app: 'paintestimator', version: 1, projects };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...projects[0], coats: 0 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...projects[0], cans: [{ ...projects[0].cans[0], priceCents: 1.5 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...projects[0], rooms: [{ ...room, openings: [{ ...room.openings[0], kind: 'x' }] }] }] }), /err\.kind/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...projects[0], rooms: [{ ...room, name: '<b>' + 'x'.repeat(80) }] }] }), /err\.nameLong/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [projects[0], projects[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: Array(51).fill(projects[0]) }), /err\.tooManyProjects/);
  assert.throws(() => C.validateBackup(null), /err\.backup/);
});

test('CSV : BOM, séparateur point-virgule, formules neutralisées', () => {
  const csv = C.toCsv([['Pièce', 'Surface'], ['=SOMME(A1)', '12,5'], ['Salon "nord"', '3']]);
  assert.ok(csv.startsWith('﻿"Pièce";"Surface"\r\n'));
  assert.ok(csv.includes('"\'=SOMME(A1)"'));
  assert.ok(csv.includes('"Salon ""nord"""'));
});
