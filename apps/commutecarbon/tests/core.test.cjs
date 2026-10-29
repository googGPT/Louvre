// Tests métier de CommuteCarbon : saisies (km/mi, facteurs, jours), calculs exacts, partage entre occupants,
// totaux hebdo/mensuel/annuel, comparaison de scénarios, CSV et sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

// Facteurs d'exemple propres aux tests (valeurs arbitraires, pas des références officielles).
const CAR = C.makeFactor({ name: 'Voiture', gPerKm: '200', basis: 'vehicle' }, 'fac-car1');
const TRAIN = C.makeFactor({ name: 'Train', gPerKm: '25,5', basis: 'passenger' }, 'fac-train');
const BIKE = C.makeFactor({ name: 'Vélo', gPerKm: '0', basis: 'passenger' }, 'fac-bike1');
const FACTORS = [CAR, TRAIN, BIKE];
const trip = (o, id = 'trip-0001') => C.makeTrip({ name: 'Travail', distance: '10', unit: 'km', factorId: CAR.id, passengers: '1', roundTrip: true, daysPerWeek: '5', ...o }, id, FACTORS);

test('distances : unité explicite km ou mi, convertie en mètres entiers', () => {
  assert.equal(C.parseDistance('12,5', 'km'), 12500);
  assert.equal(C.parseDistance('10', 'mi'), 16093); // 10 × 1609,344 m
  assert.equal(C.parseDistance('0.1', 'km'), 100);
  assert.equal(C.parseDistance('1000', 'mi'), 1609344);
  assert.equal(C.distanceIn(16093, 'mi'), 10);
  for (const bad of ['', '0', '0,05', '-3', 'abc', '1000.01', '12,345', '1e3']) assert.throws(() => C.parseDistance(bad, 'km'), /^Error: err\.distance/, bad);
  assert.throws(() => C.parseDistance('10', 'miles'), /^Error: err\.unit$/);
  assert.throws(() => C.parseDistance('10', undefined), /^Error: err\.unit$/);
});

test('facteurs : g CO2e/km saisis (0 admis), stockés en mg entiers, base véhicule ou passager', () => {
  assert.equal(C.parseFactor('171,5'), 171500);
  assert.equal(C.parseFactor('0.001'), 1);
  assert.equal(C.parseFactor('0'), 0);
  assert.equal(C.parseFactor('5000'), 5000000);
  for (const bad of ['', '-1', 'x', '5000.001', '1,2345']) assert.throws(() => C.parseFactor(bad), /^Error: err\.factor/, bad);
  assert.deepEqual(TRAIN, { id: 'fac-train', name: 'Train', mgPerKm: 25500, basis: 'passenger' });
  assert.throws(() => C.makeFactor({ name: 'X', gPerKm: '10', basis: 'seat' }, 'fac-xxxx'), /^Error: err\.basis$/);
  assert.throws(() => C.makeFactor({ name: '  ', gPerKm: '10', basis: 'vehicle' }, 'fac-xxxx'), /^Error: err\.nameRequired$/);
  assert.throws(() => C.makeFactor({ name: 'x'.repeat(61), gPerKm: '10', basis: 'vehicle' }, 'fac-xxxx'), /^Error: err\.nameLong\|\{"max":60\}$/);
  assert.throws(() => C.makeFactor({ name: 'X', gPerKm: '10', basis: 'vehicle' }, 'bad id'), /^Error: err\.id$/);
});

test('trajets : mode existant, occupants 1 à 9, jours 1 à 7, aller-retour booléen', () => {
  const t = trip({});
  assert.deepEqual(t, { id: 'trip-0001', name: 'Travail', distanceM: 10000, unit: 'km', factorId: 'fac-car1', passengers: 1, roundTrip: true, daysPerWeek: 5 });
  assert.throws(() => trip({ factorId: 'fac-none' }), /^Error: err\.mode$/);
  assert.throws(() => trip({ passengers: '0' }), /^Error: err\.passengers\|\{"min":1,"max":9\}$/);
  assert.throws(() => trip({ passengers: '10' }), /^Error: err\.passengers/);
  assert.throws(() => trip({ daysPerWeek: '8' }), /^Error: err\.days\|\{"min":1,"max":7\}$/);
  assert.throws(() => trip({ daysPerWeek: '2.5' }), /^Error: err\.days/);
  assert.throws(() => trip({ roundTrip: 'yes' }), /^Error: err\.backup$/);
  assert.throws(() => trip({ name: '' }), /^Error: err\.tripNameRequired$/);
  assert.throws(() => C.parseWeeks('54'), /^Error: err\.weeks\|\{"min":1,"max":53\}$/);
  assert.equal(C.parseWeeks('47'), 47);
});

test('émissions : distance × trajets × jours × facteur, partagé entre occupants pour un facteur véhicule', () => {
  // 10 km × 2 × 5 jours = 100 km/semaine × 200 g = 20 kg/semaine ; × 47 semaines = 940 kg/an.
  const solo = C.tripEmissions(trip({}), CAR, 47);
  assert.deepEqual(solo, { weekMg: 20000000, yearMg: 940000000, metersWeek: 100000 });
  // Covoiturage à 3 : votre part est le tiers (arrondi au mg, sur le total exact).
  const pool = C.tripEmissions(trip({ passengers: '3' }), CAR, 47);
  assert.equal(pool.weekMg, 6666667); assert.equal(pool.yearMg, 313333333);
  // Facteur par passager : le nombre d'occupants n'intervient pas.
  assert.equal(C.tripEmissions(trip({ factorId: TRAIN.id, passengers: '4' }), TRAIN, 47).weekMg, 2550000);
  // Aller simple, 10 mi, 1 jour.
  assert.equal(C.tripEmissions(trip({ distance: '10', unit: 'mi', roundTrip: false, daysPerWeek: '1' }), CAR, 52).weekMg, 3218600); // 16 093 m × 200 g/km
  assert.equal(C.tripEmissions(trip({ factorId: BIKE.id }), BIKE, 52).yearMg, 0);
  // Pire cas autorisé : reste un entier exact (sous 2^53).
  const big = C.makeFactor({ name: 'Max', gPerKm: '5000', basis: 'passenger' }, 'fac-maxx');
  const huge = C.tripEmissions(C.makeTrip({ name: 'Loin', distance: '1000', unit: 'mi', factorId: big.id, passengers: '1', roundTrip: true, daysPerWeek: '7' }, 'trip-huge', [big]), big, 53);
  assert.ok(Number.isSafeInteger(huge.yearMg * 1)); assert.equal(huge.yearMg, 1609344 * 2 * 7 * 5000000 * 53 / 1000);
});

test('scénario : totaux hebdo, mensuel (année / 12), annuel et répartition par mode', () => {
  const s = C.makeScenario({ name: 'Actuel', weeksPerYear: '46', trips: [trip({}), trip({ name: 'Sport', distance: '4', factorId: BIKE.id, daysPerWeek: '2' }, 'trip-0002'), trip({ name: 'Gare', factorId: TRAIN.id, distance: '30', daysPerWeek: '1' }, 'trip-0003')] }, 'sce-0001');
  const tot = C.scenarioTotals(s, FACTORS);
  assert.equal(tot.weekMg, 20000000 + 0 + 1530000); // 60 km × 25,5 g = 1,53 kg
  assert.equal(tot.yearMg, 46 * 21530000);
  assert.equal(tot.monthMg, Math.round(46 * 21530000 / 12));
  assert.equal(tot.metersWeek, 100000 + 16000 + 60000);
  assert.deepEqual(tot.byMode.map((m) => m.factorId), ['fac-car1', 'fac-train', 'fac-bike1']);
  const empty = C.scenarioTotals(C.makeScenario({ name: 'Vide', weeksPerYear: '52' }, 'sce-0002'), FACTORS);
  assert.deepEqual([empty.weekMg, empty.monthMg, empty.yearMg], [0, 0, 0]);
});

test('comparaison : écart annuel et pourcentage par rapport à la référence choisie', () => {
  const a = C.makeScenario({ name: 'Voiture seule', weeksPerYear: '47', trips: [trip({})] }, 'sce-aaaa');
  const b = C.makeScenario({ name: 'Covoiturage', weeksPerYear: '47', trips: [trip({ passengers: '2' })] }, 'sce-bbbb');
  const z = C.makeScenario({ name: 'Vélo', weeksPerYear: '47', trips: [trip({ factorId: BIKE.id })] }, 'sce-zzzz');
  const cmp = C.compare([a, b, z], FACTORS, 'sce-aaaa');
  assert.equal(cmp.refId, 'sce-aaaa');
  assert.deepEqual(cmp.rows.map((r) => [r.diffYearMg, r.diffPct, r.ratio]), [[0, 0, 1], [-470000000, -50, 0.5], [-940000000, -100, 0]]);
  const fromZero = C.compare([a, z], FACTORS, 'sce-zzzz');
  assert.equal(fromZero.rows[0].diffPct, null); // référence nulle : pas de pourcentage
  assert.equal(C.compare([a], FACTORS, 'inconnu').refId, 'sce-aaaa'); // repli sur le premier
  assert.equal(C.compare([], FACTORS, null).refId, null);
  assert.equal(C.factorUses({ scenarios: [a, b, z] }, CAR.id), 2);
});

test('CSV : en-têtes fournis, séparateur selon la décimale, kg à 3 décimales, cellules protégées', () => {
  const s = C.makeScenario({ name: '=Plan', weeksPerYear: '47', trips: [trip({ passengers: '3' })] }, 'sce-0001');
  const text = C.csv({ factors: FACTORS, scenarios: [s] });
  assert.ok(text.startsWith('﻿"Scénario";"Trajet"'));
  const lines = text.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '"\'=Plan";"Travail";"Voiture";"200";"par véhicule-km";"10";"km";"oui";"5";"3";"47";"6,667";"26,111";"313,333"');
  assert.equal(lines[2], '"\'=Plan";"Total";"";"";"";"";"";"";"";"";"47";"6,667";"26,111";"313,333"');
  const en = C.csv({ factors: FACTORS, scenarios: [s] }, { head: ['a'], basis: { vehicle: 'per vehicle-km', passenger: 'per passenger-km' }, yes: 'yes', no: 'no', total: 'Total', decimal: '.' });
  assert.ok(en.includes('"6.667","26.111","313.333"'));
  assert.equal(C.kg(-1500, ','), '-0,002');
  assert.equal(C.kg(0, '.'), '0.000');
});

test('totaux : plusieurs demi-milligrammes sont additionnés avant arrondi final',()=>{
  const tiny=C.makeFactor({name:'Très faible',gPerKm:'0.001',basis:'passenger'},'fac-tiny1');
  const t=(id)=>C.makeTrip({name:'Petite distance',distance:'0.5',unit:'km',factorId:tiny.id,passengers:'1',roundTrip:false,daysPerWeek:'1'},id,[tiny]);
  const s=C.makeScenario({name:'Petites distances',weeksPerYear:'1',trips:[t('trip-tiny1'),t('trip-tiny2')]},'sce-tiny1');
  const total=C.scenarioTotals(s,[tiny]);
  assert.deepEqual(total.trips.map(x=>x.yearMg),[1,1]); // arrondis individuels
  assert.equal(total.weekMg,1);
  assert.equal(total.yearMg,1);
  assert.deepEqual(total.byMode,[{factorId:tiny.id,yearMg:1}]);
  const year=C.scenarioTotals({...s,weeksPerYear:53},[tiny]);
  assert.equal(year.yearMg,53);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const s = C.makeScenario({ name: 'Actuel', weeksPerYear: '47', trips: [trip({}), trip({ unit: 'mi', distance: '7.5' }, 'trip-0002')] }, 'sce-0001');
  const data = { factors: FACTORS, scenarios: [s] };
  const text = C.backup(data);
  const back = C.validateBackup(JSON.parse(text));
  assert.deepEqual(back, data);
  assert.equal(C.backup(back), text);
  const bad = (mut) => { const d = JSON.parse(text); mut(d); return () => C.validateBackup(d); };
  assert.throws(bad((d) => { d.app = 'other'; }), /^Error: err\.notBackup$/);
  assert.throws(bad((d) => { d.version = 2; }), /^Error: err\.notBackup$/);
  assert.throws(bad((d) => { d.extra = 1; }), /^Error: err\.backup$/);
  assert.throws(bad((d) => { d.factors[0].mgPerKm = -1; }), /^Error: err\.factor/);
  assert.throws(bad((d) => { d.factors[0].mgPerKm = '200'; }), /^Error: err\.backup$/);
  assert.throws(bad((d) => { d.factors[1].id = d.factors[0].id; }), /^Error: err\.backup$/);
  assert.throws(bad((d) => { d.scenarios[0].trips[0].factorId = 'fac-gone'; }), /^Error: err\.mode$/);
  assert.throws(bad((d) => { d.scenarios[0].trips[0].distanceM = 5; }), /^Error: err\.distance/);
  assert.throws(bad((d) => { d.scenarios[0].trips[0].passengers = '2'; }), /^Error: err\.backup$/);
  assert.throws(bad((d) => { d.scenarios[0].trips[1].id = d.scenarios[0].trips[0].id; }), /^Error: err\.backup$/);
  assert.throws(bad((d) => { d.scenarios[0].weeksPerYear = 60; }), /^Error: err\.weeks/);
  assert.throws(bad((d) => { d.scenarios[0].trips[0].roundTrip = 1; }), /^Error: err\.backup$/);
  assert.throws(bad((d) => { d.scenarios[0].trips[0].name = 'a\u0007b'; }), /^Error: err\.control$/);
  assert.throws(bad((d) => { d.scenarios = Array.from({ length: 21 }, (_, i) => ({ ...d.scenarios[0], id: `sce-${1000 + i}`, trips: [] })); }), /^Error: err\.scenariosMany/);
  assert.throws(() => C.validateBackup(null), /^Error: err\.backup$/);
  assert.deepEqual(C.validateBackup({ app: 'commutecarbon', version: 1, factors: [], scenarios: [] }), C.emptyData());
});
