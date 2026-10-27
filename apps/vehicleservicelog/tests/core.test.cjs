// Tests métier de VehicleServiceLog : saisies, compteur cohérent, rythme et estimation, échéances km/mois (premier atteint),
// rappels, coûts, CSV, .ics, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const T = '2026-10-27';
const clio = C.makeVehicle({ name: 'Clio', note: 'diesel' }, 'veh-00001');
const V = [clio];
const sch = (over, id) => C.makeSchedule({ vehicleId: clio.id, name: 'Vidange', everyKmText: '15000', everyMonthsText: '12', baseDate: '2025-04-10', baseKmText: '20000', ...over }, id, V, T);
const oil = sch({}, 'sch-00001');
const tyres = sch({ name: 'Pneus', everyKmText: '20000', everyMonthsText: '', baseDate: '2025-12-01', baseKmText: '17000' }, 'sch-00002');
const insp = sch({ name: 'Contrôle', everyKmText: '', everyMonthsText: '24', baseDate: '2024-09-01', baseKmText: '10000' }, 'sch-00003');
const S = [oil, tyres, insp];
const srv = C.makeService({ vehicleId: clio.id, scheduleId: oil.id, label: '', date: '2026-04-10', kmText: '33 000', amount: '89,90', note: 'Garage' }, 'srv-00001', V, S, T);
const r1 = C.makeReading({ vehicleId: clio.id, date: '2026-01-10', kmText: '30000' }, 'rd-000001', V, T);
const r2 = C.makeReading({ vehicleId: clio.id, date: '2026-10-10', kmText: '36400' }, 'rd-000002', V, T);
const data = () => ({ settings: C.defaultSettings(), vehicles: V, schedules: S, services: [srv], readings: [r1, r2] });

test('saisies : km entiers, coût en centimes, intervalle km et/ou mois obligatoire, dates passées', () => {
  assert.equal(C.parseKm('45 200'), 45200);
  for (const bad of ['45.200', '-1', '', '12345678', 'abc']) assert.throws(() => C.parseKm(bad), /err\.km/);
  assert.equal(C.parseCents('89,90'), 8990);
  assert.equal(C.parseCents(''), 0);
  assert.throws(() => C.parseCents('1,999'), /err\.amount/);
  assert.equal(srv.km, 33000); assert.equal(srv.cents, 8990);
  assert.deepEqual([tyres.everyKm, tyres.everyMonths, insp.everyKm, insp.everyMonths], [20000, 0, 0, 24]);
  assert.throws(() => sch({ everyKmText: '', everyMonthsText: '' }, 'sch-00009'), /err\.everyNone/);
  assert.throws(() => sch({ everyMonthsText: '241' }, 'sch-00009'), /err\.everyMonths\|\{"max":240\}/);
  assert.throws(() => sch({ baseDate: '2026-10-28' }, 'sch-00009'), /err\.baseFuture/);
  assert.throws(() => sch({ name: ' ' }, 'sch-00009'), /err\.scheduleName/);
  assert.throws(() => C.makeService({ vehicleId: clio.id, scheduleId: '', label: '', date: T, kmText: '1' }, 'srv-00009', V, S, T), /err\.serviceLabel/);
  assert.throws(() => C.makeService({ vehicleId: clio.id, scheduleId: 'sch-99999', label: 'x', date: T, kmText: '1' }, 'srv-00009', V, S, T), /err\.scheduleUnknown/);
  assert.throws(() => C.makeService({ vehicleId: clio.id, scheduleId: '', label: 'x', date: '2026-10-28', kmText: '1' }, 'srv-00009', V, S, T), /err\.dateFuture/);
  assert.throws(() => C.makeService({ vehicleId: clio.id, scheduleId: '', label: 'x', date: '2026-02-30', kmText: '1' }, 'srv-00009', V, S, T), /err\.date/);
  assert.throws(() => C.makeVehicle({ name: '' }, 'veh-00009'), /err\.vehicleName/);
  assert.throws(() => C.makeReading({ vehicleId: 'veh-99999', date: T, kmText: '1' }, 'rd-000009', V, T), /err\.vehicleUnknown/);
});

test('compteur : un kilométrage ne recule pas', () => {
  const pts = C.odometerPoints(data(), clio.id);
  assert.deepEqual(pts.map((p) => p.km), [30000, 33000, 36400]);
  C.checkOdometer(pts, '2026-06-01', 34000); // entre deux points : accepté
  assert.throws(() => C.checkOdometer(pts, '2026-06-01', 32000), /err\.kmBelow\|\{"km":33000,"date":"2026-04-10"\}/);
  assert.throws(() => C.checkOdometer(pts, '2026-06-01', 37000), /err\.kmAbove\|\{"km":36400,"date":"2026-10-10"\}/);
  C.checkOdometer(pts, '2026-04-10', 33000); // même jour, même valeur
});

test('rythme observé et kilométrage estimé à la date du jour', () => {
  const pts = C.odometerPoints(data(), clio.id);
  assert.deepEqual(C.pace(pts), { km: 6400, days: 273, perYear: 8557, from: '2026-01-10', to: '2026-10-10' });
  const est = C.estimateKm(pts, T); // 36 400 + 6 400 × 17 / 273 = 36 798,5 -> 36 799
  assert.equal(est.km, 36799); assert.equal(est.since, 17); assert.equal(est.estimated, true);
  assert.equal(C.estimateKm(pts, '2026-10-10').km, 36400);
  assert.equal(C.pace([pts[0], { date: '2026-01-14', km: 30100 }]), null); // moins de 7 jours : pas de rythme
  assert.equal(C.estimateKm([pts[0]], T).km, 30000); // un seul point : pas d'extrapolation
  assert.equal(C.estimateKm([], T), null);
});

test('échéances : le premier seuil atteint (temps ou km) fixe la date effective', () => {
  const d = data(), st = (s) => C.scheduleStatus(s, d, T, d.settings);
  const a = st(oil); // repart de l'intervention du 10/04/2026 à 33 000 km
  assert.deepEqual(a.last, { date: '2026-04-10', km: 33000, fromService: true });
  assert.equal(a.dueDate, '2027-04-10'); assert.equal(a.dueKm, 48000);
  assert.equal(a.remainingDays, 165); assert.equal(a.remainingKm, 11201);
  assert.equal(a.kmDate, '2028-02-17'); // 11 600 km à 6 400 km / 273 j -> 495 jours après le 10/10/2026
  assert.equal(a.effectiveDate, '2027-04-10'); assert.equal(a.reason, 'time'); assert.equal(a.state, 'ok');
  const b = st(tyres); // km seulement : 37 000 - 36 799 = 201 km
  assert.equal(b.remainingKm, 201); assert.equal(b.kmDate, '2026-11-05'); assert.equal(b.reason, 'km'); assert.equal(b.state, 'soon');
  const c = st(insp); // mois seulement : 01/09/2024 + 24 mois = 01/09/2026, 56 jours de retard
  assert.equal(c.dueDate, '2026-09-01'); assert.equal(c.remainingDays, -56); assert.equal(c.state, 'late');
  // Le kilométrage arrive avant la date : raison « km », même si la date est lointaine.
  const fast = sch({ name: 'Courroie', everyKmText: '4000', everyMonthsText: '60', baseDate: '2026-01-10', baseKmText: '30000' }, 'sch-00004');
  const f = C.scheduleStatus(fast, d, T, d.settings);
  assert.equal(f.dueKm, 34000); assert.equal(f.remainingKm, -2799); assert.equal(f.state, 'late'); assert.equal(f.reason, 'km');
  // Seuils « bientôt » réglables.
  assert.equal(C.scheduleStatus(tyres, d, T, { soonDays: 0, soonKm: 100 }).state, 'ok');
  // Mois ancrés en fin de mois.
  assert.equal(C.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(C.addMonths('2024-02-29', 12), '2025-02-28');
  // Échéance du jour.
  const today = sch({ name: 'Jour', everyKmText: '', everyMonthsText: '1', baseDate: '2026-09-27', baseKmText: '1' }, 'sch-00005');
  assert.equal(C.scheduleStatus(today, d, T, d.settings).state, 'today');
});

test('rappels triés par urgence, coûts et coût pour 100 km', () => {
  const d = data();
  assert.deepEqual(C.reminders(d, T, d.settings).map((r) => r.schedule.name), ['Contrôle', 'Pneus', 'Vidange']);
  assert.deepEqual(C.reminders(d, T, d.settings, 'veh-00002'), []);
  const cost = C.costSummary(d, clio.id);
  assert.deepEqual(cost, { total: 8990, count: 1, byYear: { 2026: 8990 }, spanKm: 6400, per100KmCents: 140 });
});

test('suppressions : une échéance supprimée détache ses interventions ; un véhicule emporte ses données', () => {
  const d = C.removeItem(data(), 'schedules', oil.id);
  assert.equal(d.schedules.length, 2);
  assert.deepEqual([d.services[0].scheduleId, d.services[0].label], ['', 'Vidange']);
  const e = C.removeVehicle(data(), clio.id);
  assert.deepEqual([e.vehicles.length, e.schedules.length, e.services.length, e.readings.length], [0, 0, 0, 0]);
  let x = C.emptyData();
  x = C.upsert(x, 'vehicles', clio);
  assert.throws(() => { let y = x; for (let i = 0; i < 20; i += 1) y = C.upsert(y, 'vehicles', C.makeVehicle({ name: 'V' + i }, `veh-1${String(i).padStart(4, '0')}`)); }, /err\.tooMany\|\{"max":20\}/);
});

test('CSV et agenda .ics', () => {
  const d = data();
  const evil = C.makeService({ vehicleId: clio.id, scheduleId: '', label: '=SOMME(A1)', date: '2026-05-02', kmText: '34000', amount: '', note: 'a;b' }, 'srv-00002', V, S, T);
  const csv = C.servicesCSV({ ...d, services: [srv, evil] }, { headers: ['Date', 'Véhicule', 'Km', 'Intervention', 'Échéance', 'Coût', 'Note'], decimal: 'comma', vehicleName: () => 'Clio', scheduleName: () => 'Vidange' });
  assert.ok(csv.startsWith('﻿Date;Véhicule;Km;Intervention;Échéance;Coût;Note\r\n'));
  assert.ok(csv.includes('2026-04-10;Clio;33000;;Vidange;89,90;Garage\r\n'), csv);
  assert.ok(csv.includes("2026-05-02;Clio;34000;'=SOMME(A1);;0,00;\"a;b\"\r\n"), csv);
  assert.throws(() => C.servicesCSV(d, { headers: [], decimal: 'dot', vehicleName: String, scheduleName: String }), /err\.headers/);
  const list = C.reminders(d, T, d.settings);
  const out = C.toICS(list, T, '20261027T080000Z', 30, { summary: (r) => `${r.schedule.name}, Clio`, description: () => 'x' });
  assert.equal(out.count, 3);
  assert.ok(out.text.includes('DTSTART;VALUE=DATE:20261027\r\n'), 'retard : placé aujourd\'hui');
  assert.ok(out.text.includes('DTSTART;VALUE=DATE:20261105\r\n'));
  assert.ok(out.text.includes('DTSTART;VALUE=DATE:20270410\r\n'));
  assert.ok(out.text.includes('SUMMARY:Pneus\\, Clio\r\n'));
  assert.ok(out.text.includes('TRIGGER:-P30D'));
  assert.ok(!C.toICS(list, T, '20261027T080000Z', 0, { summary: () => 's', description: () => 'd' }).text.includes('VALARM'));
  assert.throws(() => C.toICS(list, T, 'bad', 1, { summary: String, description: String }), /err\.stamp/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const d = data();
  const back = JSON.parse(C.backup(d));
  assert.equal(back.app, 'vehicleservicelog');
  assert.deepEqual(C.validateData(back), d);
  const ok = () => JSON.parse(C.backup(d));
  assert.throws(() => C.validateData({ ...ok(), app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok(), extra: [] }), /err\.backup/);
  const b1 = ok(); b1.services[0].km = 1.5; assert.throws(() => C.validateData(b1), /err\.backup/);
  const b2 = ok(); b2.services[0].scheduleId = 'sch-99999'; assert.throws(() => C.validateData(b2), /err\.scheduleUnknown/);
  const b3 = ok(); b3.readings[0].vehicleId = 'veh-99999'; assert.throws(() => C.validateData(b3), /err\.vehicleUnknown/);
  const b4 = ok(); b4.schedules[0].everyKm = 0; b4.schedules[0].everyMonths = 0; assert.throws(() => C.validateData(b4), /err\.everyNone/);
  const b5 = ok(); b5.readings[1].id = b5.readings[0].id; assert.throws(() => C.validateData(b5), /err\.backup/);
  const b6 = ok(); b6.settings.soonDays = 999; assert.throws(() => C.validateData(b6), /err\.soonDays/);
  const b7 = ok(); b7.services[0].cents = -1; assert.throws(() => C.validateData(b7), /err\.backup/);
  const b8 = ok(); b8.services[0].date = '2026-13-01'; assert.throws(() => C.validateData(b8), /err\.date/);
  assert.deepEqual(C.validateData({ app: 'vehicleservicelog', version: 1, ...C.emptyData() }), C.emptyData());
});
