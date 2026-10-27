// Tests métier d'OralPresentationClock : durées, seuils, chronomètre par horodatages, dépassements, déroulé, CSV, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const settings = (over = {}) => C.makeSettings({ ...C.DEFAULT_SETTINGS, presentAlerts: [120, 60], questionsAlerts: [60], ...over });
const passage = (name, n, record = null) => C.makePassage({ name, members: '', record }, `pass-${String(n).padStart(4, '0')}`);

test('durées saisies : minutes, mm:ss, h:mm:ss ; refus des formes ambiguës', () => {
  assert.equal(C.parseDuration('7'), 420);
  assert.equal(C.parseDuration('7:30'), 450);
  assert.equal(C.parseDuration(' 0:45 '), 45);
  assert.equal(C.parseDuration('1:05:00'), 3900);
  for (const bad of ['', '7,5', '7:60', '-1', 'abc', '1:2', '5:00:00']) assert.throws(() => C.parseDuration(bad), /^Error: err\.duration/);
  assert.equal(C.mmss(65), '1:05');
  assert.equal(C.mmss(3725), '1:02:05');
  assert.equal(C.mmss(-7), '-0:07');
  assert.equal(C.parseClock('8:05'), 485);
  assert.equal(C.parseClock(''), null);
  assert.throws(() => C.parseClock('24:00'), /err\.clock/);
});

test('seuils d\'alerte : triés, uniques, strictement inférieurs à la durée', () => {
  assert.deepEqual(C.parseAlerts('1, 2; 0:30', 600), [120, 60, 30]);
  assert.deepEqual(C.parseAlerts('', 600), []);
  assert.throws(() => C.parseAlerts('10', 600), /err\.alertRange/);
  assert.throws(() => C.parseAlerts('1, 1:00', 600), /err\.alertDup/);
  assert.throws(() => C.parseAlerts('1 2 3 4 5 6', 600), /err\.alertsMany/);
  assert.throws(() => C.parseAlerts('0', 600), /err\.alert/);
  assert.throws(() => settings({ questionsSec: 0, questionsAlerts: [30] }), /err\.alertRange/);
  assert.throws(() => settings({ presentSec: 30 }), /err\.presentRange/);
  assert.throws(() => settings({ presentSec: 100, presentAlerts: [120] }), /err\.alertRange/);
});

test('le temps se calcule à partir des horodatages, pauses comprises', () => {
  const t0 = 1_700_000_000_000;
  let run = C.start('pass-0001', t0);
  assert.equal(C.phaseElapsed(run, t0 + 90_000), 90_000); // aucun « tick » nécessaire : un onglet en arrière-plan reste juste
  run = C.pause(run, t0 + 100_000);
  assert.equal(C.phaseElapsed(run, t0 + 500_000), 100_000); // en pause, le temps ne court plus
  assert.equal(C.pause(run, t0 + 600_000), run);
  run = C.resume(run, t0 + 200_000);
  assert.equal(C.phaseElapsed(run, t0 + 230_000), 130_000);
  run = C.toQuestions(run, t0 + 230_000);
  assert.equal(run.phase, 'questions');
  assert.equal(run.presentMs, 130_000);
  assert.equal(C.phaseElapsed(run, t0 + 240_000), 10_000);
  assert.deepEqual(C.finish(run, t0 + 250_000), { startedAt: t0, presentMs: 130_000, questionsMs: 20_000 });
  // Terminer pendant la présentation : pas de questions.
  assert.deepEqual(C.finish(C.start('pass-0001', t0), t0 + 5_000), { startedAt: t0, presentMs: 5_000, questionsMs: 0 });
  // Une horloge reculée ne produit jamais de temps négatif.
  assert.equal(C.phaseElapsed(C.start('pass-0001', t0), t0 - 5_000), 0);
});

test('niveau d\'alerte, temps restant et dépassement', () => {
  const s = settings({ presentSec: 600 });
  const t0 = 1_000_000;
  const run = C.start('pass-0001', t0);
  let st = C.clockState(run, s, t0 + 1);
  assert.equal(st.level, 'ok'); assert.equal(st.remainingSec, 600);
  st = C.clockState(run, s, t0 + 480_000); // 2:00 restantes : premier seuil franchi
  assert.equal(st.level, 'warn'); assert.equal(st.crossed, 1); assert.equal(st.remainingSec, 120);
  st = C.clockState(run, s, t0 + 545_000);
  assert.equal(st.crossed, 2); assert.equal(st.remainingSec, 55);
  st = C.clockState(run, s, t0 + 600_000);
  assert.equal(st.level, 'over'); assert.equal(st.overSec, 0);
  st = C.clockState(run, s, t0 + 683_500);
  assert.equal(st.overSec, 83); assert.equal(st.remainingSec, -83); assert.equal(st.progress, 1);
});

test('franchissements de seuils entre deux affichages (signal sonore)', () => {
  assert.deepEqual(C.crossings(0, 470_000, 600, [120, 60]), []);
  assert.deepEqual(C.crossings(470_000, 481_000, 600, [120, 60]).map((c) => c.sec), [120]);
  // Onglet revenu au premier plan après 3 minutes : seuils 2:00, 1:00 et fin, dans l'ordre.
  assert.deepEqual(C.crossings(470_000, 650_000, 600, [120, 60]).map((c) => c.kind + c.sec), ['alert120', 'alert60', 'end0']);
  assert.deepEqual(C.crossings(650_000, 650_000, 600, [120, 60]), []);
  assert.deepEqual(C.crossings(0, 10_000, 0, []), []); // phase sans durée : aucun signal
});

test('dépassements, déroulé prévu et bilan', () => {
  const s = settings({ presentSec: 600, questionsSec: 300, changeoverSec: 120, startMin: 8 * 60 + 30 });
  assert.deepEqual(C.overrun({ startedAt: 0, presentMs: 659_999, questionsMs: 250_000 }, s), { presentSec: 59, questionsSec: 0, totalSec: 59 });
  const list = [passage('A', 1, { startedAt: 0, presentMs: 700_000, questionsMs: 310_000 }), passage('B', 2, { startedAt: 0, presentMs: 500_000, questionsMs: 100_000 }), passage('C', 3)];
  const plan = C.schedule(list, s);
  assert.deepEqual(plan.map((p) => C.secOfDay(p.startSec)), ['08:30', '08:47', '09:04']);
  assert.equal(C.secOfDay(plan[2].endSec), '09:19');
  const sum = C.summary(list, s);
  assert.equal(sum.done, 2); assert.equal(sum.overCount, 1); assert.equal(sum.overTotalSec, 110); assert.equal(sum.meanUsedSec, 805);
  assert.equal(sum.plannedTotalSec, 3 * 900 + 2 * 120);
  assert.equal(C.schedule(list, settings())[0].startSec, null); // sans heure de début, pas d'horaire
});

test('export CSV : en-têtes, durées, statuts, cellules protégées', () => {
  const s = settings({ presentSec: 600, questionsSec: 300, startMin: 9 * 60 });
  const list = [passage('=Groupe 1', 1, { startedAt: Date.UTC(2026, 9, 27, 9, 2, 5), presentMs: 640_000, questionsMs: 200_000 }), passage('Groupe "2"', 2)];
  const out = C.csv(list, s);
  const lines = out.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0].split(';').length, 10);
  assert.equal(lines[1], '"1";"\'=Groupe 1";"";"09:00";"09:02:05";"10:40";"3:20";"0:40";"0:00";"dépassement"');
  assert.equal(lines[2], '"2";"Groupe ""2""";"";"09:17";"";"";"";"";"";"à venir"');
  assert.ok(C.csv(list, s, { ...{ head: ['a'], done: 'd', over: 'o', pending: 'p', time: () => 'x' }, delimiter: ',' }).includes('"2","Groupe ""2"""'));
});

test('passages : nom obligatoire, longueurs et caractères de contrôle', () => {
  assert.throws(() => passage('  ', 1), /err\.nameRequired/);
  assert.throws(() => passage('x'.repeat(81), 1), /err\.nameLong/);
  assert.throws(() => C.makePassage({ name: 'A', members: 'y'.repeat(201) }, 'pass-0001'), /err\.membersLong/);
  assert.throws(() => passage('A\u0007', 1), /err\.control/);
  assert.throws(() => C.makePassage({ name: 'A' }, 'x'), /err\.id/);
});

test('sauvegarde : aller-retour exact (chronomètre en cours compris) et contenus refusés', () => {
  const list = [passage('A', 1, { startedAt: 5, presentMs: 1000, questionsMs: 0 }), passage('B', 2)];
  const state = { settings: settings({ title: 'Soutenances M2', startMin: 480, sound: true }), passages: list, run: C.pause(C.start('pass-0002', 100), 200) };
  const round = C.validateBackup(JSON.parse(C.backup(state)));
  assert.deepEqual(round, state);
  const ok = JSON.parse(C.backup(state));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, run: { ...ok.run, passageId: 'pass-0001' } }), /err\.backup/); // passage déjà terminé
  assert.throws(() => C.validateBackup({ ...ok, run: { ...ok.run, phase: 'pause' } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, passages: [ok.passages[0], ok.passages[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, passages: [{ ...ok.passages[0], record: { startedAt: -1, presentMs: 0, questionsMs: 0 } }], run: null }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { ...ok.settings, presentSec: 10 } }), /err\.presentRange/);
  assert.throws(() => C.validateBackup({ ...ok, passages: Array.from({ length: 201 }, (_, i) => ({ id: `pass-${String(i).padStart(4, '0')}`, name: 'x', members: '', record: null })), run: null }), /err\.tooMany/);
});
