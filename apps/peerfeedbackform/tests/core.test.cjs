// Tests métier de PeerFeedbackForm : grille, saisie, agrégation, coefficient WebPA, note individuelle, CSV, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const id = (p, n) => `${p}-${String(n).padStart(4, '0')}`;
function base(self = 'exclude') {
  const settings = C.makeSettings({ ...C.DEFAULT_SETTINGS, self });
  const criteria = [C.makeCriterion({ name: 'Implication' }, id('crit', 1)), C.makeCriterion({ name: 'Qualité' }, id('crit', 2))];
  const students = [['Ana', 'T1'], ['Ben', 'T1'], ['Cleo', 'T1'], ['Dan', 'T2']].map(([name, team], i) => C.makeStudent({ name, team }, id('stud', i + 1)));
  return { settings, criteria, students, ratings: [], teamMarks: {} };
}
const [A, B, Cl, D] = [1, 2, 3, 4].map((n) => id('stud', n));
function rate(state, rater, ratee, a, b) {
  let s = { ...state, ratings: C.setScore(state, rater, ratee, id('crit', 1), a) };
  s = { ...s, ratings: C.setScore(s, rater, ratee, id('crit', 2), b) };
  return s;
}
function team1(self = 'exclude') {
  let s = base(self);
  s = rate(s, A, B, 4, 4); s = rate(s, A, Cl, 2, 2);
  s = rate(s, B, A, 5, 5); s = rate(s, B, Cl, 5, 5);
  s = rate(s, Cl, A, 3, 3); s = rate(s, Cl, B, 3, 3);
  return s;
}

test('réglages : échelle, barème, auto-évaluation', () => {
  assert.throws(() => C.makeSettings({ ...C.DEFAULT_SETTINGS, scaleMax: 1 }), /err\.scaleMax/);
  assert.throws(() => C.makeSettings({ ...C.DEFAULT_SETTINGS, scaleMin: 11 }), /err\.scaleMin/);
  assert.throws(() => C.makeSettings({ ...C.DEFAULT_SETTINGS, self: 'maybe' }), /err\.settings/);
  assert.throws(() => C.makeSettings({ ...C.DEFAULT_SETTINGS, markMax: 0 }), /err\.markMax/);
  assert.equal(C.parseInt10(' 7 ', 0, 10, 'err.x'), 7);
  assert.throws(() => C.parseInt10('7.5', 0, 10, 'err.x'), /err\.x/);
  assert.equal(C.parseMark('14,5', 20), 1450);
  assert.equal(C.parseMark('', 20), null);
  assert.throws(() => C.parseMark('20.01', 20), /err\.mark/);
});

test('saisie : même équipe, note dans l\'échelle, critère connu, effacement', () => {
  const s = base();
  assert.throws(() => C.setScore(s, A, D, id('crit', 1), 3), /err\.sameTeam/);
  assert.throws(() => C.setScore(s, A, B, id('crit', 1), 6), /err\.score/);
  assert.throws(() => C.setScore(s, A, B, id('crit', 9), 3), /err\.criterionUnknown/);
  let r = C.setScore(s, A, B, id('crit', 1), 3);
  assert.equal(r.length, 1);
  r = C.setScore({ ...s, ratings: r }, A, B, id('crit', 1), null);
  assert.equal(r.length, 0); // fiche vide supprimée
  assert.deepEqual(C.targets(s.students, A, 'exclude').map((x) => x.name), ['Ben', 'Cleo']);
  assert.deepEqual(C.targets(s.students, A, 'include').map((x) => x.name), ['Ana', 'Ben', 'Cleo']);
});

test('agrégation par étudiant : moyenne, écart-type (n − 1), nombre, auto-évaluation à part', () => {
  let s = team1();
  s = rate(s, A, A, 5, 5); // auto-évaluation d'Ana, exclue des moyennes
  const a = C.received(s, A);
  assert.equal(a.n, 2); assert.equal(a.mean, 4); assert.equal(a.sd, 1.41); assert.deepEqual(a.byCriterion, [4, 4]);
  assert.equal(a.self, 5); assert.equal(a.selfGap, 1);
  const inc = C.received({ ...s, settings: { ...s.settings, self: 'include' } }, A);
  assert.equal(inc.n, 3); assert.equal(inc.mean, 4.33);
  assert.equal(C.received(s, D).n, 0); assert.equal(C.received(s, D).mean, null); assert.equal(C.received(s, D).sd, null);
  assert.deepEqual(C.progress(s, A), { done: 2, expected: 2 });
});

test('coefficient WebPA : chaque évaluateur distribue 1, moyenne 1 quand tout le monde répond', () => {
  const s = team1();
  const w = C.webpa(s, 'T1');
  assert.equal(w.submitted, 3);
  assert.deepEqual(w.factors.map((f) => f.factor), [1, 1.167, 0.833]); // 1/2+1/2 ; 2/3+1/2 ; 1/3+1/2
  assert.ok(Math.abs(w.factors.reduce((a, f) => a + f.raw, 0) - 3) < 1e-9);
  // Note d'équipe 15/20 : 15,00 ; 17,50 ; 12,50 (coefficient exact, pas arrondi).
  const res = C.results({ ...s, teamMarks: { T1: 1500 } });
  assert.deepEqual(res.filter((r) => r.team === 'T1').map((r) => r.mark), [1500, 1750, 1250]);
  // Plafond au barème.
  assert.equal(C.individualMark(1900, 1.2, 20), 2000);
  assert.equal(C.individualMark(null, 1, 20), null);
});

test('WebPA : évaluateur incomplet ou n\'ayant donné que des zéros écarté, correction N / S', () => {
  let s = team1();
  s = { ...s, ratings: C.setScore(s, Cl, B, id('crit', 2), null) }; // Cleo n'a pas fini
  const w = C.webpa(s, 'T1');
  assert.deepEqual(w.skipped, [{ id: Cl, reason: 'incomplete' }]);
  assert.deepEqual(w.factors.map((f) => f.factor), [0.75, 1, 1.25]); // (3/2) × (1/2 ; 2/3 ; 1/3 + 1/2)
  const z = C.makeSettings({ ...C.DEFAULT_SETTINGS, scaleMin: 0 });
  let s0 = { ...team1(), settings: z };
  s0 = rate(s0, Cl, A, 0, 0); s0 = rate(s0, Cl, B, 0, 0);
  assert.deepEqual(C.webpa(s0, 'T1').skipped, [{ id: Cl, reason: 'zero' }]);
  // Personne n'a répondu : aucun coefficient.
  assert.deepEqual(C.webpa(base(), 'T1').factors.map((f) => f.factor), [null, null, null]);
  // Auto-évaluation incluse : chacun doit aussi se noter pour être retenu.
  const inc = { ...team1(), settings: C.makeSettings({ ...C.DEFAULT_SETTINGS, self: 'include' }) };
  assert.equal(C.webpa(inc, 'T1').submitted, 0);
});

test('changement d\'échelle refusé s\'il rend des notes invalides ; nettoyage après suppression', () => {
  const s = team1();
  assert.throws(() => C.changeSettings(s, { ...s.settings, scaleMax: 4 }), /err\.scaleConflict/);
  assert.equal(C.changeSettings(s, { ...s.settings, scaleMax: 10 }).settings.scaleMax, 10);
  assert.throws(() => C.changeSettings({ ...s, teamMarks: { T1: 1800 } }, { ...s.settings, markMax: 10 }), /err\.markConflict/);
  const pruned = C.prune({ ...s, students: s.students.filter((x) => x.id !== Cl), criteria: s.criteria.slice(0, 1), teamMarks: { T1: 1000, T9: 5 } });
  assert.equal(pruned.ratings.length, 2);
  assert.ok(pruned.ratings.every((r) => Object.keys(r.scores).join() === id('crit', 1)));
  assert.deepEqual(pruned.teamMarks, { T1: 1000 });
});

test('export CSV : en-têtes, nombres, protection des formules', () => {
  const s = team1();
  s.students[1] = { ...s.students[1], name: '=Ben' };
  const lines = C.csv({ ...s, teamMarks: { T1: 1500 } }).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], '"Équipe";"Étudiant";"Évaluations reçues";"Moyenne";"Écart-type";"Implication";"Qualité";"Auto-évaluation";"Évaluations données";"Coefficient WebPA";"Note équipe";"Note individuelle"');
  assert.equal(lines[1], '"T1";"\'=Ben";"2";"3,5";"0,71";"3,5";"3,5";"";"2/2";"1,167";"15";"17,5"');
  assert.equal(lines[4], '"T2";"Dan";"0";"";"";"";"";"";"0/0";"";"";""');
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const s = { ...team1(), teamMarks: { T1: 1500 } };
  const ok = JSON.parse(C.backup(s));
  assert.deepEqual(C.validateBackup(ok), s);
  assert.throws(() => C.validateBackup({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, more: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, ratings: [...ok.ratings, ok.ratings[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, ratings: [{ rater: A, ratee: D, scores: { [id('crit', 1)]: 3 } }] }), /err\.sameTeam/);
  assert.throws(() => C.validateBackup({ ...ok, ratings: [{ rater: A, ratee: B, scores: { [id('crit', 1)]: 9 } }] }), /err\.score/);
  assert.throws(() => C.validateBackup({ ...ok, teamMarks: { T7: 100 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, students: [...ok.students, ok.students[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, students: [{ id: id('s', 9), name: '', team: '' }] }), /err\.nameRequired/);
  const crowd = Array.from({ length: 31 }, (_, i) => ({ id: id('many', i), name: 'S' + i, team: 'X' }));
  assert.throws(() => C.validateBackup({ ...ok, students: crowd, ratings: [], teamMarks: {} }), /err\.teamSize/);
});
