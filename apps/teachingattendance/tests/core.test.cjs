// Tests métier de TeachingAttendance : appel, taux d'assiduité selon les règles choisies, seuil d'alerte, CSV, liste importée, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const st = (i, name, ref = '') => ({ id: `stud-000${i}`, name, ref });
const se = (i, date, label = '') => ({ id: `sess-000${i}`, date, label });
function klass(settings = {}) {
  let c = C.makeClass({
    id: 'class-0001', name: 'L3 Finance',
    students: [st(1, 'Ana', '2026001'), st(2, 'Bob', '2026002'), st(3, 'Cléo')],
    sessions: [se(3, '2026-09-21', 'TD 3'), se(1, '2026-09-07', 'TD 1'), se(2, '2026-09-14', 'TD 2'), se(4, '2026-09-28', 'TD 4')],
    marks: {}, settings: { threshold: '80', lateCounts: true, excusedNeutral: true, ...settings },
  });
  // Ana : P P R A ; Bob : P E P P ; Cléo : A A P (dernière séance non saisie)
  const plan = { 'stud-0001': ['present', 'present', 'late', 'absent'], 'stud-0002': ['present', 'excused', 'present', 'present'], 'stud-0003': ['absent', 'absent', 'present', null] };
  for (const [sid, list] of Object.entries(plan)) list.forEach((status, k) => { if (status) c = C.mark(c, c.sessions[k].id, sid, status); });
  return c;
}

test('séances triées par date ; seuil saisi en % (dixièmes)', () => {
  assert.deepEqual(klass().sessions.map((s) => s.label), ['TD 1', 'TD 2', 'TD 3', 'TD 4']);
  assert.equal(C.parseThreshold('80'), 800);
  assert.equal(C.parseThreshold('75,5'), 755);
  assert.equal(C.parseThreshold('66.7 %'), 667);
  assert.equal(C.parseThreshold('0'), 0);
  for (const bad of ['', '101', '-5', '80,25', 'abc']) assert.throws(() => C.parseThreshold(bad), /^Error: err\.threshold$/, bad);
});

test('taux d\'assiduité : retard compté présent, excusé neutre (réglages par défaut)', () => {
  const c = klass();
  const ana = C.studentStats(c, 'stud-0001');
  assert.deepEqual([ana.present, ana.late, ana.absent, ana.excused, ana.unmarked], [2, 1, 1, 0, 0]);
  assert.equal(ana.permille, 750); // 3 / 4
  assert.equal(ana.alert, true); // 75 % < 80 %
  const bob = C.studentStats(c, 'stud-0002');
  assert.equal(bob.denom, 3); assert.equal(bob.permille, 1000); assert.equal(bob.alert, false); // l'excuse ne compte pas
  const cleo = C.studentStats(c, 'stud-0003');
  assert.equal(cleo.unmarked, 1); assert.equal(cleo.denom, 3); assert.equal(cleo.permille, 333); assert.equal(cleo.alert, true);
});

test('règles modifiables : retard non compté, excusé compté comme absence', () => {
  const c = klass({ lateCounts: false, excusedNeutral: false });
  assert.equal(C.studentStats(c, 'stud-0001').permille, 500); // 2 / 4
  assert.equal(C.studentStats(c, 'stud-0002').permille, 750); // 3 / 4
});

test('seuil comparé exactement : 2/3 n\'est pas sous 66,6 % mais est sous 66,7 %', () => {
  let c = C.makeClass({ id: 'class-0002', name: 'X', students: [st(1, 'A')], sessions: [se(1, '2026-01-05'), se(2, '2026-01-06'), se(3, '2026-01-07')], marks: {}, settings: { threshold: '66,6', lateCounts: true, excusedNeutral: true } });
  c = C.mark(C.mark(C.mark(c, 'sess-0001', 'stud-0001', 'present'), 'sess-0002', 'stud-0001', 'present'), 'sess-0003', 'stud-0001', 'absent');
  assert.equal(C.studentStats(c, 'stud-0001').alert, false);
  assert.equal(C.studentStats({ ...c, settings: { ...c.settings, threshold: 667 } }, 'stud-0001').alert, true);
  // Aucune séance saisie : pas de taux, pas d'alerte.
  const empty = C.studentStats({ ...c, marks: {} }, 'stud-0001');
  assert.equal(empty.permille, null); assert.equal(empty.alert, false);
  // Seulement des absences excusées (neutres) : pas de taux.
  const exc = C.markAll({ ...c, marks: {} }, 'sess-0001', 'excused');
  assert.equal(C.studentStats(exc, 'stud-0001').permille, null);
});

test('appel : marquer, effacer, tout le monde présent, suppressions en cascade', () => {
  let c = klass();
  c = C.mark(c, 'sess-0004', 'stud-0003', 'late');
  assert.equal(c.marks['sess-0004']['stud-0003'], 'late');
  c = C.mark(c, 'sess-0004', 'stud-0003', null);
  assert.equal(c.marks['sess-0004']['stud-0003'], undefined);
  c = C.markAll(c, 'sess-0004', 'present');
  assert.equal(Object.values(c.marks['sess-0004']).every((s) => s === 'present'), true);
  assert.throws(() => C.mark(c, 'sess-0009', 'stud-0001', 'present'), /err\.marks/);
  assert.throws(() => C.mark(c, 'sess-0001', 'stud-0001', 'sick'), /err\.marks/);
  const noBob = C.removeStudent(c, 'stud-0002');
  assert.ok(Object.values(noBob.marks).every((row) => !('stud-0002' in row)));
  const noS1 = C.removeSession(c, 'sess-0001');
  assert.equal(noS1.marks['sess-0001'], undefined);
  assert.deepEqual(C.makeClass(noS1), noS1);
  const s = C.summary(klass());
  assert.equal(s.alerts, 2);
  assert.deepEqual(s.sessions[3], { session: klass().sessions[3], present: 1, late: 0, absent: 1, excused: 0, unmarked: 1 });
});

test('saisies refusées : doublons, dates, noms, marques inconnues', () => {
  const base = { id: 'class-0003', name: 'Y', students: [], sessions: [], marks: {}, settings: { threshold: 80, lateCounts: true, excusedNeutral: true } };
  assert.throws(() => C.makeClass({ ...base, students: [st(1, 'Ana'), st(2, ' ana ')] }), /err\.duplicateStudent/);
  assert.equal(C.makeClass({ ...base, students: [st(1, 'Ana', '1'), st(2, 'Ana', '2')] }).students.length, 2); // homonymes avec numéros différents
  assert.throws(() => C.makeSession({ id: 'sess-0001', date: '2026-02-30', label: '' }), /err\.date/);
  assert.throws(() => C.makeStudent({ id: 'stud-0001', name: '  ', ref: '' }), /err\.studentName/);
  assert.throws(() => C.makeStudent({ id: 'stud-0001', name: 'A', ref: 'x'.repeat(31) }), /err\.textLong\|\{"max":30\}/);
  assert.throws(() => C.makeClass({ ...base, students: [st(1, 'A')], sessions: [se(1, '2026-01-01')], marks: { 'sess-0001': { 'stud-0001': 'present', 'stud-0009': 'absent' } } }), /err\.marks/);
  assert.throws(() => C.makeClass({ ...base, name: '' }), /err\.className/);
});

test('CSV des absences et du bilan : en-têtes fournis, tri, cellules protégées', () => {
  const c = klass();
  const abs = C.absencesCSV(c).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(abs[0], '"Étudiant";"Numéro";"Date";"Séance";"Statut"');
  assert.deepEqual(abs.slice(1), [
    '"Ana";"2026001";"2026-09-21";"TD 3";"retard"', '"Ana";"2026001";"2026-09-28";"TD 4";"absent"',
    '"Bob";"2026002";"2026-09-14";"TD 2";"excusé"', '"Cléo";"";"2026-09-07";"TD 1";"absent"', '"Cléo";"";"2026-09-14";"TD 2";"absent"',
  ]);
  const sum = C.summaryCSV(c).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(sum[1], '"Ana";"2026001";"4";"2";"1";"1";"0";"75";"oui"');
  assert.equal(sum[3], '"Cléo";"";"3";"1";"0";"2";"0";"33,3";"oui"');
  const en = C.absencesCSV(c, { absences: ['Student', 'ID', 'Date', 'Session', 'Status'], status: { present: 'present', late: 'late', absent: 'absent', excused: 'excused' }, date: (d) => d.split('-').reverse().join('/'), compare: (a, b) => a.localeCompare(b, 'en'), delimiter: ',' });
  assert.ok(en.includes('"Ana","2026001","21/09/2026","TD 3","late"'));
  assert.equal(C.csvCell('@x'), '"\'@x"');
});

test('liste importée : séparateurs, guillemets, en-tête, erreurs', () => {
  assert.deepEqual(C.parseRoster('Nom;Numéro\nAna;2026001\n"Martin; Léa";2026002\nBob\n', true), [{ name: 'Ana', ref: '2026001' }, { name: 'Martin; Léa', ref: '2026002' }, { name: 'Bob', ref: '' }]);
  assert.deepEqual(C.parseRoster('Ana\t1\nBob\t2', false).map((r) => r.ref), ['1', '2']);
  assert.throws(() => C.parseRoster('Ana\n;12', false), /err\.rosterLine\|\{"line":2\}/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const c = klass();
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup([c]))), [c]);
  const ok = JSON.parse(C.backup([c]));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: [c, c] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: [{ ...ok.classes[0], settings: { ...ok.classes[0].settings, threshold: '80' } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: [{ ...ok.classes[0], settings: { ...ok.classes[0].settings, threshold: 1001 } }] }), /err\.threshold/);
  const bad = JSON.parse(JSON.stringify(ok)); bad.classes[0].marks['sess-0001']['stud-0001'] = 'sick';
  assert.throws(() => C.validateBackup(bad), /err\.marks/);
  const bad2 = JSON.parse(JSON.stringify(ok)); bad2.classes[0].sessions[0].extra = 1;
  assert.throws(() => C.validateBackup(bad2), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, classes: Array.from({ length: 31 }, () => ok.classes[0]) }), /err\.tooManyClasses/);
});
