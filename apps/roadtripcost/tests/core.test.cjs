// Tests métier de RoadTripCost : unités, carburant, frais, partage au centime près, sauvegardes, CSV.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
function trip(cons = '6,5', price = '1,859') {
  const t = { ...C.makeTrip('Test', id()), ...C.makeVehicle({ consumption: cons, consUnit: 'l100', price, priceUnit: 'l' }) };
  t.passengers = ['Ana', 'Bea', 'Cid'].map((p) => C.makePassenger(p, id()));
  return t;
}
const stage = (t, input) => C.makeStage({ distUnit: 'km', priceUnit: 'l', ...input }, id(), t.passengers);

test('conversions d\'unités exactes', () => {
  assert.equal(C.toMeters('245', 'km'), 245000);
  assert.equal(C.toMeters('100', 'mi'), 160934);
  assert.equal(C.toMeters('0,1', 'km'), 100);
  assert.equal(C.toMlPer100('6,5', 'l100'), 6500);
  assert.equal(C.toMlPer100('20', 'kml'), 5000); // 20 km/L = 5 L/100 km
  assert.equal(C.toMlPer100('30', 'mpgus'), 7840); // 235,215 / 30
  assert.equal(C.toMlPer100('40', 'mpguk'), 7062); // 282,481 / 40
  assert.equal(C.toPriceMillis('1.859', 'l'), 1859);
  assert.equal(C.toPriceMillis('3.50', 'galus'), 925); // 3,50 / 3,785 L
  assert.equal(C.parseCents('21,30'), 2130);
  assert.equal(C.parseCents(''), 0);
});

test('carburant d\'une étape : distance × consommation × prix, arrondi au centime', () => {
  const t = trip();
  const c = C.stageCost(t, stage(t, { name: 'A', distance: '245' }));
  assert.equal(c.fuelMl, 15925); // 15,925 L
  assert.equal(c.fuelCents, 2960); // 15,925 × 1,859 = 29,604…
  assert.equal(c.totalCents, 2960);
  // Prix propre à l'étape.
  const own = C.stageCost(t, stage(t, { name: 'B', distance: '100', price: '2' }));
  assert.equal(own.fuelCents, 1300);
  assert.equal(own.priceMillis, 2000);
});

test('frais de l\'étape et partage exact entre passagers', () => {
  const t = trip();
  t.stages = [stage(t, { name: 'A', distance: '245', tolls: '21,30', meals: '48' }), stage(t, { name: 'B', distance: '100', lodging: '100', riders: [t.passengers[0].id, t.passengers[1].id] })];
  const s = C.summary(t);
  assert.equal(s.stages[0].totalCents, 2960 + 2130 + 4800);
  assert.deepEqual(Object.values(s.stages[0].shares), [3297, 3297, 3296]); // 98,90 / 3
  assert.deepEqual(s.stages[1].riders, [t.passengers[0].id, t.passengers[1].id]);
  assert.equal(s.stages[1].totalCents, 1208 + 10000);
  const [ana, bea, cid] = s.people;
  assert.equal(ana.cents + bea.cents + cid.cents, s.totalCents); // aucun centime perdu
  assert.equal(cid.cents, 3296);
  assert.equal(cid.stages, 1);
  assert.equal(Math.abs(ana.cents - bea.cents) <= 1, true);
  assert.deepEqual(s.byCat, { fuelCents: 2960 + 1208, tollsCents: 2130, lodgingCents: 10000, mealsCents: 4800, otherCents: 0 });
  assert.equal(s.distanceM, 345000);
  assert.equal(s.perKmCents, Math.round(s.totalCents / 345));
  assert.equal(s.ready, true);
});

test('les centimes restants tournent d\'une étape à l\'autre', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(C.split(100, ids, 0), { a: 34, b: 33, c: 33 });
  assert.deepEqual(C.split(100, ids, 1), { a: 33, b: 34, c: 33 });
  assert.deepEqual(C.split(101, ids, 2), { a: 34, b: 33, c: 34 });
  assert.deepEqual(C.split(5, [], 0), {});
  const t = trip();
  t.stages = [1, 2, 3].map((i) => stage(t, { name: `S${i}`, distance: '1', other: '1' })); // 1,00 € + carburant par étape
  const s = C.summary(t);
  const spread = Math.max(...s.people.map((p) => p.cents)) - Math.min(...s.people.map((p) => p.cents));
  assert.ok(spread <= 1, spread);
});

test('passagers : « tous » par défaut, sélection, aucun passager', () => {
  const t = trip();
  const all = stage(t, { name: 'A', distance: '10', riders: t.passengers.map((p) => p.id) });
  assert.equal(all.riders, null); // tous cochés = tous (y compris ceux ajoutés plus tard)
  assert.throws(() => stage(t, { name: 'A', distance: '10', riders: [] }), /err\.noRider/);
  assert.throws(() => stage(t, { name: 'A', distance: '10', riders: ['inconnu'] }), /err\.id/);
  const alone = { ...trip(), passengers: [] };
  alone.stages = [C.makeStage({ name: 'Solo', distance: '50', distUnit: 'km', tolls: '5' }, id(), [])];
  const s = C.summary(alone);
  assert.equal(s.unshared, s.totalCents);
  assert.deepEqual(s.people, []);
});

test('voiture non renseignée : carburant à zéro, signalé', () => {
  const t = { ...C.makeTrip('X', id()), passengers: [] };
  t.stages = [C.makeStage({ name: 'A', distance: '100', distUnit: 'km', tolls: '10' }, id(), [])];
  const s = C.summary(t);
  assert.equal(s.ready, false);
  assert.equal(s.byCat.fuelCents, 0);
  assert.equal(s.totalCents, 1000);
});

test('saisies refusées', () => {
  const t = trip();
  assert.throws(() => C.toMlPer100('0', 'l100'), /err\.consumption/);
  assert.throws(() => C.toMlPer100('80', 'l100'), /err\.consumption/);
  assert.throws(() => C.toMlPer100('6', 'gal'), /err\.unit/);
  assert.throws(() => C.toPriceMillis('-1', 'l'), /err\.price/);
  assert.throws(() => C.toPriceMillis('1.8599', 'l'), /err\.price/);
  assert.throws(() => stage(t, { name: 'A', distance: '0' }), /err\.distance/);
  assert.throws(() => stage(t, { name: 'A', distance: '6000' }), /err\.distance/);
  assert.throws(() => stage(t, { name: '', distance: '10' }), /err\.stageRequired/);
  assert.throws(() => stage(t, { name: 'A', distance: '10', tolls: '1,234' }), /err\.amount/);
  assert.throws(() => stage(t, { name: 'A', distance: '10', meals: '-5' }), /err\.amount/);
  assert.throws(() => C.makePassenger(' ', id()), /err\.passengerRequired/);
  assert.throws(() => C.makePassenger('x'.repeat(61), id()), /^Error: err\.nameLong\|\{"max":60\}$/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const t = trip();
  t.stages = [stage(t, { name: 'A', distance: '245', tolls: '21,30' }), stage(t, { name: 'B', distance: '80', price: '1,7', riders: [t.passengers[2].id] })];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([t]))), [t]);
  const ok = { app: 'roadtripcost', version: 1, trips: [t] };
  assert.throws(() => C.validateBackup([]), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, app: 'fuelmath' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, more: true }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, consMl: 100 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, stages: [{ ...t.stages[0], tollsCents: -1 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, stages: [{ ...t.stages[0], tollsCents: 1.5 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, stages: [{ ...t.stages[1], riders: ['id-inconnu'] }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, stages: [{ ...t.stages[1], riders: [] }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, passengers: [...t.passengers, t.passengers[0]] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, trips: [{ ...t, passengers: Array(21).fill(0).map(() => C.makePassenger('P', id())) }] }), /err\.tooManyPassengers/);
  assert.throws(() => C.validateBackup({ ...ok, trips: Array(31).fill(t) }), /err\.tooManyTrips/);
});

test('CSV : BOM, séparateur « ; », cellules protégées contre les formules', () => {
  const csv = C.toCsv([['Étape', 'Total'], ['=1+1', '12,50'], ['a "b"', '']]);
  assert.ok(csv.startsWith('﻿"Étape";"Total"\r\n'));
  assert.ok(csv.includes('"\'=1+1";"12,50"'));
  assert.ok(csv.includes('"a ""b""";""'));
});
