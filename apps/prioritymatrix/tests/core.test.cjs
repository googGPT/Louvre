// Tests métier de PriorityMatrix : urgence calculée selon le seuil, classement, déplacements, exports, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = () => `id-${String(++n).padStart(6, '0')}`;
const task = (title, extra = {}) => C.makeTask({ title, important: true, ...extra }, id());
const TODAY = '2026-03-10';

test('saisies : seuil, échéance, urgence, importance', () => {
  assert.equal(C.parseThreshold('0'), 0); assert.equal(C.parseThreshold(' 7 '), 7);
  for (const bad of ['', '-1', '2.5', '366', 'abc']) assert.throws(() => C.parseThreshold(bad), /err\.threshold/);
  assert.throws(() => task('X', { due: '2026-02-29' }), /err\.due/);
  assert.throws(() => task('X', { urgency: 'bientôt' }), /err\.urgency/);
  assert.throws(() => C.makeTask({ title: 'X' }, id()), /err\.importance/);
  assert.throws(() => task(' '), /err\.titleRequired/);
  assert.throws(() => C.makeMatrix({ name: 'M', threshold: '400' }, id()), /err\.threshold/);
  assert.equal(C.daysBetween('2024-02-28', '2024-03-01'), 2);
  assert.equal(C.daysBetween('2026-03-29', '2026-03-30'), 1); // changement d'heure sans effet
});

test('urgence calculée : échéance dans le seuil, dépassée, sans échéance, manuelle', () => {
  const c = (t, thr = 3) => C.classify(t, TODAY, thr);
  assert.deepEqual(c(task('A', { due: '2026-03-13' })), { urgent: true, important: true, quadrant: 'q1', daysLeft: 3, reason: 'due', overdue: false });
  assert.equal(c(task('A', { due: '2026-03-14' })).urgent, false); // 4 jours > seuil 3
  assert.equal(c(task('A', { due: '2026-03-14' }), 4).urgent, true);
  assert.deepEqual([c(task('A', { due: '2026-03-08' })).urgent, c(task('A', { due: '2026-03-08' })).overdue], [true, true]);
  assert.equal(c(task('A', { due: '2026-03-10' }), 0).urgent, true); // seuil 0 : le jour même
  assert.deepEqual([c(task('A')).urgent, c(task('A')).reason], [false, 'noDue']);
  assert.deepEqual([c(task('A', { urgency: 'urgent' })).quadrant, c(task('A', { urgency: 'urgent' })).reason], ['q1', 'manual']);
  assert.equal(c(task('A', { due: '2026-03-01', urgency: 'not', important: false })).quadrant, 'q4');
  assert.equal(c(task('A', { due: '2026-03-11', important: false })).quadrant, 'q3');
});

test('placer dans un quadrant : urgence automatique gardée si elle concorde, sinon manuelle', () => {
  const t = task('A', { due: '2026-03-11' }); // urgent automatiquement (1 jour)
  assert.deepEqual(C.placeIn(t, 'q3', TODAY, 3), { ...t, important: false, urgency: 'auto' });
  assert.deepEqual(C.placeIn(t, 'q2', TODAY, 3), { ...t, important: true, urgency: 'not' });
  const free = task('B');
  assert.equal(C.placeIn(free, 'q1', TODAY, 3).urgency, 'urgent');
  assert.equal(C.placeIn({ ...free, urgency: 'urgent' }, 'q2', TODAY, 3).urgency, 'auto');
  assert.throws(() => C.placeIn(t, 'q9', TODAY, 3), /err\.quadrant/);
  assert.equal(C.neighbour('q1', 'right'), 'q2');
  assert.equal(C.neighbour('q1', 'down'), 'q3');
  assert.equal(C.neighbour('q4', 'left'), 'q3');
  assert.equal(C.neighbour('q4', 'up'), 'q2');
  assert.equal(C.neighbour('q1', 'left'), 'q1');
  assert.throws(() => C.neighbour('q1', 'nord'), /err\.direction/);
});

test('listes d\'actions : tri par échéance, tâches faites à part, résumé', () => {
  const m = C.makeMatrix({ name: 'Semaine', threshold: '2', tasks: [
    task('Rapport', { due: '2026-03-11' }), task('Budget', { due: '2026-03-09' }), task('Formation', { due: '2026-04-01' }),
    task('Veille'), task('Courriels', { important: false, urgency: 'urgent' }), task('Classement', { important: false }),
    task('Ancien', { done: true, due: '2026-03-01' }),
  ] }, id());
  const x = C.matrix(m, TODAY, 'fr');
  assert.deepEqual(x.q1.map((t) => t.title), ['Budget', 'Rapport']);
  assert.deepEqual(x.q2.map((t) => t.title), ['Formation', 'Veille']);
  assert.deepEqual(x.q3.map((t) => t.title), ['Courriels']);
  assert.deepEqual(x.q4.map((t) => t.title), ['Classement']);
  assert.deepEqual(x.done.map((t) => t.title), ['Ancien']);
  assert.deepEqual(C.summary(m, TODAY), { q1: 2, q2: 2, q3: 1, q4: 1, done: 1, overdue: 1 });
});

const LAB = {
  head: ['Quadrant', 'Tâche', 'Échéance', 'Jours restants', 'Urgente', 'Importante', 'Urgence', 'Notes'],
  quadrant: (k) => ({ q1: 'Faire', q2: 'Planifier', q3: 'Déléguer', q4: 'Abandonner', done: 'Fait' })[k],
  yesNo: (b) => (b ? 'oui' : 'non'), reason: (r) => r, none: 'aucune',
  rule: (n) => `Urgent à ${n} jours ou moins.`, due: (t) => `${t.due} (${t.daysLeft} j)`,
};
test('exports CSV et Markdown', () => {
  const m = C.makeMatrix({ name: 'Semaine', threshold: '2', tasks: [task('=Rapport', { due: '2026-03-11', notes: 'a, b' }), task('Veille', { important: false }), task('Fini', { done: true })] }, id());
  const csv = C.toCSV(m, TODAY, LAB);
  assert.ok(csv.startsWith('﻿Quadrant,Tâche,Échéance,Jours restants,Urgente,Importante,Urgence,Notes\r\n'));
  assert.match(csv, /Faire,'=Rapport,2026-03-11,1,oui,oui,due,"a, b"\r\n/);
  assert.match(csv, /Abandonner,Veille,,,non,non,noDue,\r\n/);
  assert.match(csv, /Fait,Fini,,,non,oui,noDue,\r\n$/);
  const late = C.makeMatrix({ name: 'L', threshold: '0', tasks: [task('Retard', { due: '2026-03-08' })] }, id());
  assert.match(C.toCSV(late, TODAY, LAB), /Faire,Retard,2026-03-08,-2,oui,oui,due,/); // nombre négatif non préfixé
  const md = C.toMarkdown(m, TODAY, LAB);
  assert.match(md, /^# Semaine\n\nUrgent à 2 jours ou moins\.\n\n## Faire\n\n- \[ \] =Rapport — 2026-03-11 \(1 j\)\n/);
  assert.match(md, /## Planifier\n\n- aucune\n/);
  assert.match(md, /## Fait\n\n- \[x\] Fini\n$/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const m = C.makeMatrix({ name: 'M', threshold: '3', tasks: [task('A', { due: '2026-03-11', urgency: 'not', notes: 'n' })] }, id());
  const list = [m];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(list))), list);
  const ok = { app: 'prioritymatrix', version: 1, matrices: list };
  const clone = () => JSON.parse(JSON.stringify(ok));
  assert.throws(() => C.validateBackup({ ...ok, app: 'x' }), /err\.notBackup/);
  let x = clone(); x.matrices[0].threshold = '3'; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.matrices[0].tasks[0].important = 'oui'; assert.throws(() => C.validateBackup(x), /err\.importance/);
  x = clone(); x.matrices[0].tasks[0].urgency = 'x'; assert.throws(() => C.validateBackup(x), /err\.urgency/);
  x = clone(); delete x.matrices[0].tasks[0].done; assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.matrices[0].tasks.push(x.matrices[0].tasks[0]); assert.throws(() => C.validateBackup(x), /err\.backup/);
  x = clone(); x.matrices[0].threshold = 999; assert.throws(() => C.validateBackup(x), /err\.threshold/);
});
