// Tests métier de NoiseDiary : observations datées, passage de minuit, nuits, statistiques, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const entry = (day, start, end, over = {}) => C.makeEntry({ day, start, end, type: 'music', intensity: '3', source: '', notes: '', ...over }, `obs-${String(++n).padStart(4, '0')}`);
const S = C.DEFAULT_SETTINGS;

test('heures, jours et jours de la semaine', () => {
  assert.equal(C.parseClock('22:30'), 1350);
  assert.equal(C.parseClock('7:05'), 425);
  for (const bad of ['24:00', '22h', '', '12:60']) assert.throws(() => C.parseClock(bad), /^Error: err\.clock/);
  assert.equal(C.weekday('2026-10-26'), 0); // lundi
  assert.equal(C.weekday('2026-11-01'), 6); // dimanche
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2026-03-29', 1), '2026-03-30'); // changement d'heure sans effet sur les jours civils
});

test('durée et passage de minuit', () => {
  assert.equal(C.duration(entry('2026-10-10', '14:00', '15:30')), 90);
  const late = entry('2026-10-10', '23:30', '01:15');
  assert.equal(C.duration(late), 105);
  assert.deepEqual(C.span(late), [1410, 1515]);
  assert.equal(C.duration(entry('2026-10-10', '00:00', '23:59')), 1439);
  assert.throws(() => entry('2026-10-10', '22:00', '22:00'), /err\.sameTime/);
});

test('minutes de nuit : plage 22:00–07:00 par défaut, nuit nommée par son premier jour', () => {
  assert.deepEqual(C.nightOverlap(entry('2026-10-10', '21:00', '23:00'), S), [{ night: '2026-10-10', minutes: 60 }]);
  assert.deepEqual(C.nightOverlap(entry('2026-10-11', '05:00', '08:00'), S), [{ night: '2026-10-10', minutes: 120 }]);
  assert.deepEqual(C.nightOverlap(entry('2026-10-10', '23:30', '01:15'), S), [{ night: '2026-10-10', minutes: 105 }]);
  assert.deepEqual(C.nightOverlap(entry('2026-10-10', '12:00', '18:00'), S), []);
  // Observation de 06:00 à 23:00 : fin de la nuit précédente et début de la suivante.
  assert.deepEqual(C.nightOverlap(entry('2026-10-10', '06:00', '23:00'), S), [{ night: '2026-10-09', minutes: 60 }, { night: '2026-10-10', minutes: 60 }]);
  // Plage réglable, y compris sans passage de minuit.
  const early = C.makeSettings({ nightStart: '01:00', nightEnd: '06:00' });
  assert.deepEqual(C.nightOverlap(entry('2026-10-10', '23:00', '02:00'), early), [{ night: '2026-10-11', minutes: 60 }]);
  assert.throws(() => C.makeSettings({ nightStart: '22:00', nightEnd: '22:00' }), /err\.nightSame/);
  assert.throws(() => C.makeSettings({ nightStart: '25:00', nightEnd: '07:00' }), /err\.nightStart/);
});

test('statistiques : nombre, durée, plages horaires, jours, nuits, types, sources', () => {
  const list = [
    entry('2026-10-09', '23:30', '01:15', { type: 'music', intensity: '4', source: 'Appartement du dessus' }), // vendredi
    entry('2026-10-10', '14:00', '15:30', { type: 'works', intensity: '5', source: 'Chantier rue' }), // samedi
    entry('2026-10-10', '22:15', '22:45', { type: 'music', intensity: '3', source: 'appartement du dessus' }),
    entry('2026-10-12', '07:00', '07:20', { type: 'footsteps', intensity: '1' }), // lundi, juste après la nuit
  ];
  const s = C.stats(list, S, '', '', 'fr');
  assert.equal(s.count, 4);
  assert.equal(s.totalMin, 105 + 90 + 30 + 20);
  assert.equal(s.nightMin, 105 + 30);
  assert.deepEqual(s.nights.map((x) => [x.night, x.minutes]), [['2026-10-09', 105], ['2026-10-10', 30]]);
  assert.equal(s.avgIntensity, 3.3); assert.equal(s.maxIntensity, 5);
  assert.equal(s.byHour[23], 30); assert.equal(s.byHour[0], 60); assert.equal(s.byHour[1], 15);
  assert.equal(s.byHour[14], 60); assert.equal(s.byHour[15], 30); assert.equal(s.byHour[22], 30); assert.equal(s.byHour[7], 20);
  assert.equal(s.byHour.reduce((a, b) => a + b, 0), s.totalMin);
  assert.deepEqual(s.byWeekday.map((w) => w.count), [1, 0, 0, 0, 1, 2, 0]);
  assert.deepEqual(s.byType.map((t) => [t.type, t.count]), [['music', 2], ['works', 1], ['footsteps', 1]]);
  assert.deepEqual(s.sources.map((x) => [x.source, x.count]), [['Appartement du dessus', 2], ['Chantier rue', 1]]); // casse ignorée
  assert.equal(s.daysWithEntries, 3); assert.equal(s.firstDay, '2026-10-09'); assert.equal(s.lastDay, '2026-10-12');
  // Filtrage par période (bornes incluses).
  const f = C.stats(list, S, '2026-10-10', '2026-10-10');
  assert.equal(f.count, 2); assert.equal(f.nightMin, 30);
  assert.equal(C.stats(list, S, '2026-10-11', '').count, 1);
  assert.throws(() => C.stats(list, S, '2026-10-12', '2026-10-01'), /err\.period/);
  assert.throws(() => C.stats(list, S, '2026-13-01', ''), /err\.from/);
  const empty = C.stats([], S, '', '');
  assert.equal(empty.count, 0); assert.equal(empty.avgIntensity, 0); assert.equal(empty.firstDay, null);
});

test('saisies refusées', () => {
  assert.throws(() => entry('2026-02-30', '10:00', '11:00'), /err\.date/);
  assert.throws(() => entry('2026-10-10', '', '11:00'), /err\.start/);
  assert.throws(() => entry('2026-10-10', '10:00', '11:61'), /err\.end/);
  assert.throws(() => entry('2026-10-10', '10:00', '11:00', { type: 'decibels' }), /err\.type/);
  for (const bad of ['0', '6', '2.5', '', 'trois']) assert.throws(() => entry('2026-10-10', '10:00', '11:00', { intensity: bad }), /err\.intensity/);
  assert.throws(() => entry('2026-10-10', '10:00', '11:00', { source: 'x'.repeat(81) }), /err\.sourceLong\|\{"max":80\}/);
  assert.throws(() => entry('2026-10-10', '10:00', '11:00', { notes: 'x'.repeat(501) }), /err\.notesLong/);
  assert.throws(() => entry('2026-10-10', '10:00', '11:00', { notes: 'a\u0000b' }), /err\.notes/);
  assert.equal(entry('2026-10-10', '10:00', '11:00', { notes: '  ligne 1\r\nligne 2 ' }).notes, 'ligne 1\nligne 2');
  assert.throws(() => C.makeEntry({ day: '2026-10-10', start: '10:00', end: '11:00', type: 'music', intensity: '3' }, 'x'), /err\.id/);
});

test('export CSV : en-têtes fournis, jour de fin, minutes de nuit, cellules protégées', () => {
  const list = [entry('2026-10-10', '23:30', '01:15', { source: '=HYPERLINK("x")', notes: 'Basse "forte"; fenêtres fermées' }), entry('2026-10-09', '08:00', '08:30', { type: 'works' })];
  const csv = C.toCSV(list, S, { headers: Array.from({ length: 11 }, (_, i) => `H${i}`), type: (k) => `T:${k}`, weekday: (i) => `W${i}` });
  assert.ok(csv.startsWith('﻿"H0";"H1"'));
  const lines = csv.slice(1).trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '"2026-10-09";"W4";"08:00";"08:30";"2026-10-09";"30";"0";"T:works";"3";"";""'); // tri chronologique
  assert.equal(lines[2], '"2026-10-10";"W5";"23:30";"01:15";"2026-10-11";"105";"105";"T:music";"3";"\'=HYPERLINK(""x"")";"Basse ""forte""; fenêtres fermées"');
  assert.throws(() => C.toCSV(list, S, { headers: [] }), /err\.csv/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const state = { settings: C.makeSettings({ nightStart: '23:00', nightEnd: '06:30' }), entries: [entry('2026-10-10', '23:30', '01:15', { notes: 'a\nb' }), entry('2026-10-11', '10:00', '11:00', { type: 'alarm', intensity: '2' })] };
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(state))), state);
  const ok = JSON.parse(C.backup(state));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { nightStart: 0, nightEnd: 0 } }), /err\.nightSame/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { nightStart: '22:00', nightEnd: 420 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...ok.entries[0], db: 85 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...ok.entries[0], intensity: 9 }] }), /err\.intensity/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...ok.entries[0], start: '23:30' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [{ ...ok.entries[0], source: ' padded ' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: [ok.entries[0], ok.entries[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, entries: Array(2001).fill(ok.entries[0]) }), /err\.tooMany/);
  assert.throws(() => C.validateBackup(null), /err\.backup/);
});
