// Tests métier de TransitCompare : saisies, totaux, correspondances, coût généralisé, classement, bascule, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const seg = (mode, minutes, wait = 0, cost = '0', label = '') => ({ mode, minutesText: String(minutes), waitText: String(wait), costText: cost, label });
const route = (name, id, segs) => C.makeRoute(name, id, segs.map((s) => C.makeSegment(s)));
const prefs = (vot, walk = '1', wait = '1', pen = '0') => C.makePrefs({ vot, walkWeight: walk, waitWeight: wait, transferMinutes: pen });

const busMetro = route('Bus + métro', 'route-0001', [seg('walk', 6), seg('bus', 18, 6, '1,90', '12'), seg('metro', 9, 3, '0'), seg('walk', 4)]);
const car = route('Voiture', 'route-0002', [seg('car', 24, 0, '4.80'), seg('walk', 3)]);
const bike = route('Vélo', 'route-0003', [seg('bike', 32)]);
const train = route('Train', 'route-0004', [seg('walk', 10), seg('train', 20, 8, '3,10'), seg('walk', 7)]);

test('saisies : prix en centimes (0 permis), minutes entières, pondérations à une décimale', () => {
  assert.equal(C.parseCents('1,90'), 190);
  assert.equal(C.parseCents(''), 0);
  assert.equal(C.parseCents('0'), 0);
  for (const bad of ['1,999', '-1', 'abc', '1.2.3']) assert.throws(() => C.parseCents(bad), /^Error: err\.cost$/);
  assert.equal(C.parseWeight('1,5'), 15);
  assert.equal(C.parseWeight('0'), 0);
  for (const bad of ['5.5', '1.25', '', '-1', 'x']) assert.throws(() => C.parseWeight(bad), /err\.weight/);
  assert.throws(() => C.makeSegment(seg('walk', 0)), /err\.minutes\|\{"min":1,"max":1440\}/);
  assert.throws(() => C.makeSegment(seg('walk', 1441)), /err\.minutes/);
  assert.throws(() => C.makeSegment(seg('walk', '2.5')), /err\.minutes/);
  assert.throws(() => C.makeSegment(seg('bus', 10, 601)), /err\.wait/);
  assert.throws(() => C.makeSegment(seg('rocket', 10)), /err\.mode/);
  assert.throws(() => C.makeSegment(seg('bus', 10, 0, '0', 'x'.repeat(41))), /err\.labelLong\|\{"max":40\}/);
  assert.throws(() => C.makeRoute(' ', 'route-0099'), /err\.routeName/);
  assert.throws(() => C.makePrefs({ vot: '12', walkWeight: '1', waitWeight: '1', transferMinutes: '121' }), /err\.penalty/);
  assert.deepEqual(prefs('12,50', '1,5', '2', '5'), { votCents: 1250, walkWeight: 15, waitWeight: 20, transferMinutes: 5 });
});

test('totaux et correspondances : la marche ne compte pas comme une montée', () => {
  assert.deepEqual(C.totals(busMetro), { walkMinutes: 10, rideMinutes: 27, waitMinutes: 9, totalMinutes: 46, costCents: 190, transfers: 1, segments: 4 });
  assert.equal(C.totals(car).transfers, 0);
  assert.equal(C.totals(route('Trois', 'route-0010', [seg('bike', 5), seg('train', 30, 5, '4'), seg('walk', 2), seg('bus', 7, 4, '1')])).transfers, 2);
  assert.deepEqual(C.totals(C.makeRoute('Vide', 'route-0011')), { walkMinutes: 0, rideMinutes: 0, waitMinutes: 0, totalMinutes: 0, costCents: 0, transfers: 0, segments: 0 });
});

test('coût généralisé exact : parts prix + temps + correspondances', () => {
  const p = prefs('12', '1.5', '1.5', '5');
  const s = C.score(busMetro, p);
  // dixièmes de minute : 270 (véhicule) + 15×10 (marche) + 15×9 (attente) + 10×5×1 (pénalité) = 605
  assert.equal(s.weightedTenths, 605);
  assert.equal(s.moneyCents, 190);
  assert.equal(s.timeCents, 1110); // 1200 × 555 / 600
  assert.equal(s.transferCents, 100); // 5 min à 12/h
  assert.equal(s.scoreCents, 1400);
  // Valeur du temps nulle : seul le prix compte.
  assert.equal(C.score(busMetro, prefs('0')).scoreCents, 190);
});

test('classement expliqué et valeur du temps de bascule', () => {
  const p = prefs('12', '1.5', '1.5', '5');
  const r = C.rank([busMetro, car, bike, train], p, 'fr');
  assert.deepEqual(r.rows.map((x) => x.name), ['Vélo', 'Voiture', 'Bus + métro', 'Train']);
  assert.deepEqual(r.rows.map((x) => x.scoreCents), [640, 1050, 1400, 1460]);
  assert.equal(r.rows[1].deltaMinutes, -5);
  assert.equal(r.rows[1].deltaCostCents, 480);
  // Vélo (0, 320 dixièmes) devant Voiture (480, 285) : la voiture gagne si le temps vaut plus de 480×600/35 = 8228,57 centimes/h.
  assert.deepEqual(r.pivot, { kind: 'above', votCents: 8229 });
  const r2 = C.rank([busMetro, car, bike, train], prefs('100'), 'fr'); // 100/h : la voiture passe devant
  assert.equal(r2.rows[0].name, 'Voiture');
  assert.equal(r2.pivot.kind, 'below'); // le vélo repasserait devant en dessous d'un seuil
  assert.equal(r2.pivot.votCents, 5760); // voiture 480 + 270 dixièmes ; vélo 0 + 320 : 480 × 600 / 50
  // Domination : moins cher et plus rapide.
  const fast = route('Direct', 'route-0020', [seg('bus', 10, 0, '1')]), slow = route('Lent', 'route-0021', [seg('bus', 40, 0, '3')]);
  assert.equal(C.rank([slow, fast], prefs('10')).pivot.kind, 'dominant');
  // Égalité parfaite.
  const twin = route('Jumeau', 'route-0022', [seg('tram', 10, 0, '1')]);
  assert.equal(C.rank([fast, twin], prefs('10')).pivot.kind, 'equal');
  // Égalité de score départagée par la durée, puis le nom.
  const r3 = C.rank([route('B', 'route-0030', [seg('bus', 10)]), route('A', 'route-0031', [seg('bus', 10)])], prefs('0'));
  assert.deepEqual(r3.rows.map((x) => x.name), ['A', 'B']);
  // Les itinéraires sans segment sont signalés, pas classés.
  const r4 = C.rank([fast, C.makeRoute('Vide', 'route-0040')], prefs('10'));
  assert.equal(r4.rows.length, 1); assert.equal(r4.empty, 1); assert.equal(r4.pivot, null);
});

test('segments : ajout, limites, retrait, déplacement', () => {
  let r = C.makeRoute('R', 'route-0050');
  for (let i = 0; i < C.MAX_SEGMENTS; i += 1) r = C.addSegment(r, seg('walk', i + 1));
  assert.throws(() => C.addSegment(r, seg('walk', 1)), /err\.tooManySegments\|\{"max":12\}/);
  r = C.removeSegment(r, 0);
  assert.equal(r.segments[0].minutes, 2);
  r = C.moveSegment(r, 0, 1);
  assert.deepEqual(r.segments.slice(0, 2).map((s) => s.minutes), [3, 2]);
  assert.equal(C.moveSegment(r, 0, -1), r); // hors limites : inchangé
  assert.throws(() => C.removeSegment(r, 99), /err\.segment/);
});

test('CSV : en-têtes fournis, séparateur décimal, protection contre les formules', () => {
  const r = C.rank([route('=HACK', 'route-0060', [seg('bus', 10, 0, '1,50')]), route('Vélo; rapide', 'route-0061', [seg('bike', 12)])], prefs('6'));
  const h = ['#', 'Route', 'Tot', 'Ride', 'Walk', 'Wait', 'Tr', 'Cost', 'Time', 'Score'];
  const csv = C.rankingCSV(r, { headers: h, decimal: 'comma' });
  assert.ok(csv.startsWith('﻿#;Route;Tot;Ride;Walk;Wait;Tr;Cost;Time;Score\r\n'));
  assert.ok(csv.includes('1;"Vélo; rapide";12;12;0;0;0;0,00;1,20;1,20\r\n'), csv);
  assert.ok(csv.includes("2;'=HACK;10;10;0;0;0;1,50;1,00;2,50\r\n"), csv);
  assert.ok(C.rankingCSV(r, { headers: h, decimal: 'dot' }).includes(';1.50;1.00;2.50'));
  assert.throws(() => C.rankingCSV(r, { headers: ['a'], decimal: 'dot' }), /err\.headers/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { prefs: prefs('12', '1.5', '2', '5'), trips: [C.makeTrip('Domicile → travail', 'trip-0001', [busMetro, car])] };
  const back = JSON.parse(C.backup(data));
  assert.equal(back.app, 'transitcompare'); assert.equal(back.version, 1);
  assert.deepEqual(C.validateData(back), data);
  const ok = () => JSON.parse(C.backup(data));
  assert.throws(() => C.validateData({ ...ok(), app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok(), version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok(), extra: 1 }), /err\.backup/);
  const b1 = ok(); b1.trips[0].routes[0].segments[0].minutes = 1.5; assert.throws(() => C.validateData(b1), /err\.backup/);
  const b2 = ok(); b2.trips[0].routes[0].segments[0].mode = 'rocket'; assert.throws(() => C.validateData(b2), /err\.mode/);
  const b3 = ok(); b3.trips[0].routes[1].id = b3.trips[0].routes[0].id; assert.throws(() => C.validateData(b3), /err\.backup/);
  const b4 = ok(); b4.prefs.walkWeight = 51; assert.throws(() => C.validateData(b4), /err\.backup/);
  const b5 = ok(); b5.trips[0].routes[0].segments[0].costCents = -1; assert.throws(() => C.validateData(b5), /err\.cost/);
  const b6 = ok(); b6.trips[0].routes[0].extra = true; assert.throws(() => C.validateData(b6), /err\.backup/);
  const b7 = ok(); b7.trips[0].name = ''; assert.throws(() => C.validateData(b7), /err\.tripName/);
  const b8 = ok(); b8.trips = Array.from({ length: 101 }, (_, i) => ({ id: `trip-${1000 + i}`, name: 'T', routes: [] })); assert.throws(() => C.validateData(b8), /err\.tooManyTrips/);
  const b9 = ok(); b9.trips[0].routes = Array.from({ length: 9 }, (_, i) => ({ id: `route-${2000 + i}`, name: 'R', segments: [] })); assert.throws(() => C.validateData(b9), /err\.tooManyRoutes/);
  assert.deepEqual(C.validateData({ app: 'transitcompare', version: 1, prefs: C.defaultPrefs(), trips: [] }), C.emptyData());
});
