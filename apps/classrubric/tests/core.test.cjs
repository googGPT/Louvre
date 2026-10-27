// Tests métier de ClassRubric : modèle de grille, calcul exact de la note, statistiques, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

// Critère à niveaux 0..max (points entiers), identifiants lisibles.
function crit(id, name, weight, points) {
  return { id: `crit-${id}`, name, weight, levels: points.map((p, i) => ({ id: `lvl-${id}-${i}`, label: `N${i}`, points: p, descriptor: '' })) };
}
const rubric = (extra = {}) => C.makeRubric({ id: 'rubric-0001', name: 'Exposé', scale: 20, step: '0.5', criteria: [crit('a', 'Contenu', 3, [0, 1, 2, 3]), crit('b', 'Structure', 2, [0, 1, 2, 3]), crit('c', 'Temps', 1, [0, 1, 2, 3, 4])], ...extra });
const pick = (a, b, c) => ({ 'crit-a': `lvl-a-${a}`, 'crit-b': `lvl-b-${b}`, 'crit-c': `lvl-c-${c}` });

test('note pondérée : barème × Σ(poids × points/max) / Σ poids, arrondie au pas choisi', () => {
  const r = rubric();
  // 3×2/3 + 2×3/3 + 1×1/4 = 4,25 ; 4,25/6 × 20 = 14,1666…
  assert.equal(C.evaluate(r, pick(2, 3, 1)).scoreH, 1400); // au demi-point le plus proche
  assert.equal(C.evaluate({ ...r, step: '0.01' }, pick(2, 3, 1)).scoreH, 1417);
  assert.equal(C.evaluate({ ...r, step: '1' }, pick(2, 3, 1)).scoreH, 1400);
  assert.equal(C.evaluate({ ...r, scale: 100, step: '0.1' }, pick(2, 3, 1)).scoreH, 7080); // 70,833… -> 70,8
  assert.equal(C.evaluate(r, pick(3, 3, 4)).scoreH, 2000);
  assert.equal(C.evaluate(r, pick(0, 0, 0)).scoreH, 0);
});

test('arrondi exact (sans flottant) : une moitié exacte monte', () => {
  const one = (step) => C.makeRubric({ id: 'rubric-0002', name: 'X', scale: 20, step, criteria: [{ id: 'crit-x', name: 'X', weight: 1, levels: [{ id: 'lvl-x-0', label: 'a', points: 0, descriptor: '' }, { id: 'lvl-x-1', label: 'b', points: 57, descriptor: '' }, { id: 'lvl-x-2', label: 'c', points: 80, descriptor: '' }] }] });
  // 57/80 × 20 = 14,25 exactement
  assert.equal(C.evaluate(one('0.5'), { 'crit-x': 'lvl-x-1' }).scoreH, 1450);
  assert.equal(C.evaluate(one('0.1'), { 'crit-x': 'lvl-x-1' }).scoreH, 1430);
  assert.equal(C.evaluate(one('0.25'), { 'crit-x': 'lvl-x-1' }).scoreH, 1425);
  // Cas où le calcul flottant échoue : 1,005 × 100 n'est pas exactement 100,5 en virgule flottante.
  const f = C.makeRubric({ id: 'rubric-0003', name: 'F', scale: 201, step: '0.01', criteria: [{ id: 'crit-f', name: 'F', weight: 1, levels: [{ id: 'lvl-f-0', label: 'a', points: 0, descriptor: '' }, { id: 'lvl-f-1', label: 'b', points: 1, descriptor: '' }, { id: 'lvl-f-2', label: 'c', points: 40, descriptor: '' }] }] });
  assert.equal(C.evaluate(f, { 'crit-f': 'lvl-f-1' }).scoreH, 503); // 201/40 = 5,025 -> 5,03
});

test('copie incomplète : pas de note, critères manquants listés ; parts de note par critère', () => {
  const r = rubric();
  const res = C.evaluate(r, { 'crit-a': 'lvl-a-3' });
  assert.equal(res.complete, false);
  assert.equal(res.scoreH, null);
  assert.deepEqual(res.missing, ['crit-b', 'crit-c']);
  assert.equal(res.rows[0].shareH, 1000); // 3/3 × 3/6 × 20 = 10 points
  assert.equal(C.evaluate({ ...r, criteria: [] }, {}).complete, false); // grille vide
});

test('grille refusée : poids, niveaux, points, barème, pas, noms', () => {
  assert.throws(() => rubric({ scale: 0 }), /^Error: err\.scale/);
  assert.throws(() => rubric({ scale: '20,5' }), /err\.scale/);
  assert.throws(() => rubric({ step: '0.3' }), /err\.step/);
  assert.throws(() => rubric({ name: '  ' }), /err\.rubricName/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 0, [0, 1])), /err\.weight/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 101, [0, 1])), /err\.weight/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 1, [1])), /err\.levelCount\|\{"min":2,"max":6\}/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 1, [0, 1, 2, 3, 4, 5, 6])), /err\.levelCount/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 1, [0, 0])), /err\.levelMax/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 1, [0, -1])), /err\.points/);
  assert.throws(() => C.makeCriterion(crit('z', 'Z', 1, [0, 1.5])), /err\.points/);
  assert.throws(() => C.makeCriterion({ ...crit('z', '', 1, [0, 1]) }), /err\.criterionName/);
  assert.throws(() => C.makeCriterion({ ...crit('z', 'x'.repeat(81), 1, [0, 1]) }), /err\.textLong\|\{"max":80\}/);
  const dup = crit('z', 'Z', 1, [0, 1]); dup.levels[1].id = dup.levels[0].id;
  assert.throws(() => C.makeCriterion(dup), /err\.id/);
  assert.throws(() => rubric({ criteria: Array.from({ length: 21 }, (_, i) => crit(`k${i}`, 'K', 1, [0, 1])) }), /err\.tooManyCriteria/);
});

test('copie : choix vérifiés contre la grille, nettoyés après modification de la grille', () => {
  const r = rubric();
  assert.throws(() => C.makeEvaluation({ id: 'eval-0001', student: 'Ana', choices: { 'crit-a': 'lvl-b-1' } }, r), /err\.choice/);
  assert.throws(() => C.makeEvaluation({ id: 'eval-0001', student: ' ', choices: {} }, r), /err\.student/);
  const e = C.makeEvaluation({ id: 'eval-0001', student: ' Ana ', choices: pick(1, 2, 3), comment: 'Bien' }, r);
  assert.equal(e.student, 'Ana');
  const smaller = { ...r, criteria: [r.criteria[0], { ...r.criteria[1], levels: r.criteria[1].levels.slice(0, 2) }] };
  assert.deepEqual(C.prune(e, smaller).choices, { 'crit-a': 'lvl-a-1' }); // critère retiré, niveau supprimé
});

test('statistiques : moyenne, médiane, extrêmes, réussite par critère', () => {
  const r = rubric({ step: '0.01' });
  const evs = [pick(3, 3, 4), pick(0, 0, 0), pick(2, 3, 1), { 'crit-a': 'lvl-a-3' }].map((choices, i) => C.makeEvaluation({ id: `eval-000${i}`, student: `S${i}`, choices }, r));
  const s = C.stats(r, evs);
  assert.equal(s.total, 4); assert.equal(s.complete, 3); assert.equal(s.incomplete, 1);
  assert.equal(s.meanH, Math.round((2000 + 0 + 1417) / 3));
  assert.equal(s.medianH, 1417); assert.equal(s.minH, 0); assert.equal(s.maxH, 2000);
  // Contenu : 3,0,2,3 sur 3 -> 8/12
  assert.equal(s.byCriterion[0].permille, 667);
  assert.equal(s.byCriterion[2].count, 3);
  const two = C.stats(r, evs.slice(0, 2));
  assert.equal(two.medianH, 1000);
  assert.equal(C.stats(r, []).meanH, null);
});

test('CSV : en-têtes fournis, cellules protégées contre les formules, tri par nom', () => {
  const r = rubric();
  const evs = [C.makeEvaluation({ id: 'eval-0002', student: 'Zoé', choices: pick(2, 3, 1), comment: '=SOMME(A1)' }, r), C.makeEvaluation({ id: 'eval-0001', student: 'Ali', choices: {} }, r)];
  const out = C.csv(r, evs);
  const lines = out.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], '"Étudiant";"Contenu (×3)";"Structure (×2)";"Temps (×1)";"Note";"Barème";"Statut";"Commentaire"');
  assert.match(lines[1], /^"Ali";"";"";"";"";"20";"incomplète";""$/);
  assert.match(lines[2], /^"Zoé";"N2 \(2\/3\)";"N3 \(3\/3\)";"N1 \(1\/4\)";"14";"20";"complète";"'=SOMME\(A1\)"$/);
  const en = C.csv(r, evs, { head: { student: 'Student', score: 'Score', scale: 'Out of', status: 'Status', comment: 'Comment' }, complete: 'complete', incomplete: 'incomplete', delimiter: ',', number: String, compare: (a, b) => a.localeCompare(b, 'en') });
  assert.ok(en.includes('"Student","Contenu (×3)"'));
  assert.equal(C.csvCell('-5'), '"\'-5"');
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const r = rubric();
  const e = C.makeEvaluation({ id: 'eval-0001', student: 'Ana', choices: pick(1, 2, 3), comment: '' }, r);
  const state = { rubrics: [r], evaluations: [e] };
  const back = C.validateBackup(JSON.parse(C.backup(state)));
  assert.deepEqual(back, state);
  const ok = JSON.parse(C.backup(state));
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup([]), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, rubrics: [{ ...ok.rubrics[0], scale: '20' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, rubrics: [ok.rubrics[0], ok.rubrics[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, evaluations: [{ ...ok.evaluations[0], rubricId: 'rubric-9999' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, evaluations: [{ ...ok.evaluations[0], choices: { 'crit-a': 'lvl-zz' } }] }), /err\.choice/);
  assert.throws(() => C.validateBackup({ ...ok, evaluations: [ok.evaluations[0], ok.evaluations[0]] }), /err\.backup/);
  const badLevel = JSON.parse(JSON.stringify(ok)); badLevel.rubrics[0].criteria[0].levels[0].hack = 1;
  assert.throws(() => C.validateBackup(badLevel), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, evaluations: Array.from({ length: 2001 }, () => ok.evaluations[0]) }), /err\.tooManyEvaluations/);
});
