// Tests métier de HomeEnergyLog : relevés, périodes, répartition par mois, comparaison, anomalies, coûts, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
const reading = (day, value, reset = false) => C.makeReading({ day, value, reset }, id());
function meter(rows, price = '0,2516', kind = 'electricity', unit = 'kWh') {
  let m = C.makeMeter({ name: 'Linky', kind, unit, price }, id());
  for (const [day, value, reset] of rows) m = C.addReading(m, reading(day, value, reset));
  return m;
}

test('dates civiles et index saisis', () => {
  assert.equal(C.parseDay('2024-02-29'), '2024-02-29');
  for (const bad of ['2023-02-29', '2024-13-01', '24-01-01', '', '2024-1-1']) assert.throws(() => C.parseDay(bad), /err\.date/);
  assert.equal(C.dayNum('2024-03-31') - C.dayNum('2024-03-30'), 1); // changement d'heure sans effet
  assert.equal(C.nextMonth('2024-12-01'), '2025-01-01');
  assert.equal(C.parseIndex('12 345,678'), 12345678);
  assert.equal(C.parsePrice('0,2516'), 2516);
  assert.throws(() => C.parseIndex('-1'), /err\.value/);
  assert.throws(() => C.parseIndex('1,2345'), /err\.value/);
  assert.throws(() => C.parsePrice('0'), /err\.unitPrice/);
});

test('consommation entre relevés, moyenne par jour et coût', () => {
  const m = meter([['2025-01-01', '1000'], ['2025-01-31', '1300'], ['2025-03-02', '1630']]);
  const ps = C.periods(m);
  assert.equal(ps.length, 2);
  assert.deepEqual([ps[0].days, ps[0].milli, ps[0].perDayMilli], [30, 300000, 10000]); // 300 kWh en 30 j = 10 kWh/j
  assert.equal(ps[0].costCents, 7548); // 300 × 0,2516 = 75,48
  assert.equal(ps[1].days, 30); // 31 janv. -> 2 mars (février 28 j)
  assert.equal(C.costCents(1, 2516), 0); // 0,001 kWh -> 0,0002516 -> 0 centime
  assert.equal(C.costCents(1000, 50), 1); // 1 unité × 0,005 -> 0,5 centime arrondi à 1
  assert.equal(C.costCents(1000, 0), null); // prix non saisi : pas de coût inventé
  const s = C.summary(m);
  assert.equal(s.milli, 630000); assert.equal(s.days, 60); assert.equal(s.perDayMilli, 10500); assert.equal(s.anomalies, 0);
});

test('répartition par mois civil au prorata des jours', () => {
  const m = meter([['2025-01-16', '0'], ['2025-02-15', '300']]); // 30 jours, 10 kWh/j
  const months = C.monthly(m);
  assert.deepEqual(months.map((x) => [x.month, x.milli, x.coveredDays, x.complete]), [['2025-01', 160000, 16, false], ['2025-02', 140000, 14, false]]);
  assert.equal(months.reduce((s, x) => s + x.milli, 0), 300000);
});

test('relevé inférieur au précédent : refusé à la saisie, signalé si importé, accepté si compteur remplacé', () => {
  const m = meter([['2025-01-01', '5000'], ['2025-02-01', '5200']]);
  assert.throws(() => C.addReading(m, reading('2025-03-01', '5100')), /err\.decrease\|\{"day":"2025-02-01","value":5200\}/);
  assert.throws(() => C.addReading(m, reading('2025-01-15', '5300')), /err\.decreaseNext/);
  assert.throws(() => C.addReading(m, reading('2025-02-01', '5300')), /err\.duplicateDay/);
  const replaced = C.addReading(m, reading('2025-03-01', '12', true));
  assert.deepEqual(C.periods(replaced).map((p) => p.status), ['ok', 'reset']);
  const next = C.addReading(replaced, reading('2025-03-31', '312'));
  assert.equal(C.summary(next).milli, 500000); // 200 + 300, la période du remplacement est ignorée
  // Données importées avec une baisse : anomalie détectée, consommation non comptée.
  const imported = { ...m, readings: [...m.readings, C.makeReading({ day: '2025-03-01', value: '5100' }, id())] };
  const ps = C.periods(imported);
  assert.equal(ps[1].status, 'decrease'); assert.equal(ps[1].milli, null);
  assert.equal(C.summary(imported).anomalies, 1);
});

test('comparaison de deux périodes par moyenne journalière', () => {
  const m = meter([['2024-01-01', '0'], ['2024-01-31', '600'], ['2025-01-01', '5000'], ['2025-01-31', '5450']]);
  const r = C.compare(m, { from: '2024-01-01', to: '2024-01-31' }, { from: '2025-01-01', to: '2025-01-31' });
  assert.equal(r.a.milli, 600000); assert.equal(r.b.milli, 450000);
  assert.equal(r.diffPct, -25);
  assert.equal(r.a.complete, true);
  assert.throws(() => C.compare(m, { from: '2024-02-01', to: '2024-01-01' }, { from: '2025-01-01', to: '2025-01-31' }), /err\.range/);
  assert.throws(() => C.compare(m, { from: '2030-01-01', to: '2030-02-01' }, { from: '2025-01-01', to: '2025-01-31' }), /err\.noData/);
  const partial = C.consumptionBetween(m, '2025-01-20', '2025-02-10'); // au-delà du dernier relevé
  assert.equal(partial.coveredDays, 11); assert.equal(partial.complete, false); assert.equal(partial.milli, 165000);
});

test('compteurs : types et unités contrôlés', () => {
  assert.equal(C.makeMeter({ name: 'Gaz', kind: 'gas', unit: 'm3' }, id()).price1e4, 0);
  assert.throws(() => C.makeMeter({ name: 'Eau', kind: 'water', unit: 'kWh' }, id()), /err\.unit/);
  assert.throws(() => C.makeMeter({ name: 'X', kind: 'fuel', unit: 'L' }, id()), /err\.kind/);
  assert.throws(() => C.makeMeter({ name: ' ', kind: 'water', unit: 'L' }, id()), /err\.nameRequired/);
  assert.throws(() => C.makeMeter({ name: 'x'.repeat(41), kind: 'water', unit: 'L' }, id()), /err\.nameLong/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const meters = [meter([['2025-01-01', '1000,5'], ['2025-02-01', '1100'], ['2025-03-01', '3', true]]), meter([['2025-01-01', '10']], '', 'water', 'm3')];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(meters))), meters);
  const ok = { app: 'homeenergylog', version: 1, meters };
  assert.throws(() => C.validateBackup({ ...ok, app: 'pricelens' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: true }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, meters: [{ ...meters[0], price1e4: -1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, meters: [{ ...meters[0], readings: [{ ...meters[0].readings[0], day: '2025-02-30' }] }] }), /err\.date/);
  assert.throws(() => C.validateBackup({ ...ok, meters: [{ ...meters[0], readings: [meters[0].readings[0], { ...meters[0].readings[1], day: '2025-01-01' }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, meters: [{ ...meters[0], readings: [{ ...meters[0].readings[0], reset: 'oui' }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, meters: [meters[0], meters[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, meters: Array(11).fill(meters[1]) }), /err\.tooManyMeters/);
});

test('un relevé existant reste modifiable après 2000 relevés',()=>{
  const start=C.dayNum('2020-01-01');
  const rows=Array.from({length:C.MAX.readings},(_,i)=>({
    id:'read-'+String(i).padStart(5,'0'),day:C.numDay(start+i),valueMilli:i*1000,reset:false
  }));
  const meter={...C.makeMeter({name:'Linky',kind:'electricity',unit:'kWh'},'meter-0001'),readings:rows};
  const updated=C.addReading(meter,{...rows[1000],valueMilli:1000500});
  assert.equal(updated.readings.length,2000);
  assert.equal(updated.readings.find(r=>r.id===rows[1000].id).valueMilli,1000500);
  assert.equal(updated.readings.filter(r=>r.id===rows[1000].id).length,1);
  assert.throws(()=>C.addReading(meter,{id:'read-new01',day:C.numDay(start+2000),valueMilli:2000000,reset:false}),/err\.tooManyReadings/);
});

test('CSV protégé contre les formules', () => {
  const csv = C.toCsv([['Date', 'Index'], ['-12', '+3']]);
  assert.ok(csv.startsWith('﻿"Date";"Index"'));
  assert.ok(csv.includes('"\'-12";"\'+3"'));
});
