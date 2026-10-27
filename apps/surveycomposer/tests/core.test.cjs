// Tests métier de SurveyComposer : questions, conditions, contrôle de qualité, dictionnaire des codes, texte imprimable, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = (p = 'q') => `${p}-${String(++n).padStart(6, '0')}`;
const base = () => C.newSurvey('Enquête', id('s'), 'fr', 'Profil', 'sec-000001');
const add = (survey, form, sec = 'sec-000001') => C.putQuestion(survey, sec, C.questionFromForm({ code: C.nextCode(survey), ...form }, form.id || id()));
const likert = (text, points = '5', extra = {}) => ({ type: 'likert', text, points, start: '1', minLabel: 'Pas du tout d\'accord', maxLabel: 'Tout à fait d\'accord', ...extra });

test('options : codes automatiques ou imposés, doublons et nombre minimal refusés', () => {
  assert.deepEqual(C.parseOptions('Oui\nNon\n9 = Ne sait pas'), [{ value: 1, label: 'Oui' }, { value: 2, label: 'Non' }, { value: 9, label: 'Ne sait pas' }]);
  assert.deepEqual(C.parseOptions('0 = Non\n1 = Oui').map((o) => o.value), [0, 1]);
  assert.deepEqual(C.parseOptions('5: A\nB').map((o) => o.value), [5, 6]); // reprend après le plus grand code
  assert.throws(() => C.parseOptions('Oui'), /^Error: err\.optionsFew$/);
  assert.throws(() => C.parseOptions('1 = Oui\n1 = Non'), /err\.optionCodeDup/);
  assert.throws(() => C.parseOptions('Oui\noui'), /err\.optionLabelDup/);
  assert.throws(() => C.parseOptions(Array.from({ length: 51 }, (_, i) => 'x' + i).join('\n')), /err\.optionsMany/);
  assert.equal(C.optionsToText(C.parseOptions('Oui\nNon')), '1 = Oui\n2 = Non');
});

test('questions : validation stricte selon le type', () => {
  let s = base();
  s = add(s, { type: 'single', text: 'Sexe', options: 'Femme\nHomme\nAutre', required: true });
  s = add(s, likert('Je suis satisfait.', '7', { midLabel: 'Neutre' }));
  s = add(s, { type: 'number', text: 'Âge', min: '18', max: '99', decimals: '0', unit: 'ans' });
  s = add(s, { type: 'text', text: 'Commentaires', long: true });
  const qs = C.orderedQuestions(s);
  assert.deepEqual(qs.map((q) => q.code), ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.deepEqual(qs[1].scale, { points: 7, start: 1, minLabel: 'Pas du tout d\'accord', midLabel: 'Neutre', maxLabel: 'Tout à fait d\'accord', reversed: false });
  assert.deepEqual(qs[2].range, { min: 18, max: 99, decimals: 0, unit: 'ans' });
  assert.throws(() => add(s, { type: 'text', text: '  ' }), /err\.textRequired/);
  assert.throws(() => add(s, { type: 'text', text: 'x'.repeat(501) }), /err\.textLong/);
  assert.throws(() => add(s, likert('X', '12')), /err\.points/);
  assert.throws(() => add(s, likert('X', '1')), /err\.points/);
  assert.throws(() => add(s, likert('X', '4', { midLabel: 'Milieu' })), /err\.midEven/);
  assert.throws(() => add(s, { type: 'number', text: 'X', min: '10', max: '5' }), /err\.range/);
  assert.throws(() => add(s, { type: 'number', text: 'X', min: 'abc' }), /err\.number/);
  assert.throws(() => add(s, { type: 'text', text: 'X', code: '1abc' }), /err\.code/);
  assert.throws(() => add(s, { type: 'text', text: 'X', code: 'q1' }), /err\.codeDup/); // insensible à la casse
  assert.throws(() => add(s, { type: 'date', text: 'X' }), /err\.type/);
  assert.equal(C.nextCode(s), 'Q5');
});

test('conditions : seulement vers une question plus haute, opérateur et valeur cohérents', () => {
  let s = base();
  const q1 = id(), q2 = id(), q3 = id();
  s = add(s, { id: q1, type: 'single', text: 'Avez-vous un emploi ?', options: 'Oui\nNon', required: true });
  s = add(s, { id: q2, type: 'multiple', text: 'Moyens de transport', options: 'Voiture\nVélo\nBus' });
  s = add(s, { id: q3, type: 'number', text: 'Heures par semaine', condQuestion: q1, condOp: 'eq', condValue: '1' });
  assert.deepEqual(C.orderedQuestions(s)[2].condition, { question: q1, op: 'eq', value: 1 });
  assert.throws(() => add(s, { type: 'text', text: 'X', condQuestion: q1, condOp: 'gte', condValue: '1' }), /err\.condOp/);
  assert.throws(() => add(s, { type: 'text', text: 'X', condQuestion: q1, condOp: 'eq', condValue: '7' }), /err\.condOption/);
  assert.throws(() => add(s, { type: 'text', text: 'X', condQuestion: q1, condOp: 'eq', condValue: '' }), /err\.condValue/);
  const self = id();
  assert.throws(() => add(s, { id: self, type: 'text', text: 'X', condQuestion: self, condOp: 'answered' }), /err\.condSelf/);
  // Monter Q3 au-dessus de Q1 créerait une condition vers le bas : refusé (donc aucune boucle possible).
  const s2 = C.moveQuestion(s, q3, -1);
  assert.throws(() => C.moveQuestion(s2, q3, -1), /err\.condOrder/);
  // Une question utilisée par une condition ne peut pas être supprimée.
  assert.throws(() => C.deleteQuestion(s, q1), /err\.usedInCondition\|\{"codes":"Q3"\}/);
  assert.equal(C.orderedQuestions(C.deleteQuestion(s, q3)).length, 2);
});

test('visibilité dans l\'aperçu : chaînes de conditions et réponses manquantes', () => {
  let s = base();
  const q1 = id(), q2 = id(), q3 = id(), q4 = id(), q5 = id();
  s = add(s, { id: q1, type: 'single', text: 'Emploi ?', options: 'Oui\nNon', required: true });
  s = add(s, { id: q2, type: 'number', text: 'Heures', min: '0', max: '80', decimals: '1', required: true, condQuestion: q1, condOp: 'eq', condValue: '1' });
  s = add(s, { id: q3, type: 'text', text: 'Heures sup ?', condQuestion: q2, condOp: 'gte', condValue: '40' });
  s = add(s, { id: q4, type: 'multiple', text: 'Transports', options: 'Voiture\nVélo' });
  s = add(s, { id: q5, type: 'text', text: 'Pourquoi pas de vélo ?', condQuestion: q4, condOp: 'excludes', condValue: '2' });
  const vis = (a) => [...C.visibleIds(s, a)].map((x) => C.orderedQuestions(s).find((q) => q.id === x).code);
  assert.deepEqual(vis({}), ['Q1', 'Q4']); // sans réponse, les questions conditionnelles restent masquées
  assert.deepEqual(vis({ [q1]: 1, [q2]: 45 }), ['Q1', 'Q2', 'Q3', 'Q4']);
  assert.deepEqual(vis({ [q1]: 2, [q2]: 45 }), ['Q1', 'Q4']); // Q2 masquée -> Q3 aussi, même avec une ancienne réponse
  assert.deepEqual(vis({ [q4]: [1] }), ['Q1', 'Q4', 'Q5']);
  assert.deepEqual(vis({ [q4]: [1, 2] }), ['Q1', 'Q4']);
  assert.deepEqual(C.checkAnswers(s, {}).map((p) => [p.code, p.key]), [['Q1', 'ans.required']]);
  assert.deepEqual(C.checkAnswers(s, { [q1]: 1 }).map((p) => [p.code, p.key]), [['Q2', 'ans.required']]);
  assert.deepEqual(C.checkAnswers(s, { [q1]: 1, [q2]: 90 }).map((p) => p.key), ['ans.range']);
  assert.deepEqual(C.checkAnswers(s, { [q1]: 1, [q2]: 7.25 }).map((p) => p.key), ['ans.decimals']);
  assert.deepEqual(C.checkAnswers(s, { [q1]: 1, [q2]: 7.5 }), []);
  assert.deepEqual(C.cleanAnswers(s, { [q1]: 2, [q2]: 45, [q4]: [] }), { Q1: 2 }); // réponses masquées ou vides retirées
});

test('contrôle de qualité : doublons, questions doubles, échelles incohérentes', () => {
  let s = base();
  s = add(s, { type: 'single', text: 'Le prix et la qualité vous conviennent-ils ?', options: 'Oui\nNon' });
  s = add(s, likert('J\'aime ce cours.'));
  s = add(s, likert('J\'aime  ce cours !', '7'));
  s = add(s, { type: 'text', text: 'Pourquoi ? Comment ?' });
  s = C.addSection(s, 'Vide', 'sec-000002');
  const keys = C.quality(s).map((i) => i.key);
  assert.ok(keys.includes('qc.duplicate'));
  assert.ok(keys.includes('qc.double'));
  assert.ok(keys.includes('qc.twoMarks'));
  assert.ok(keys.includes('qc.scaleMix'));
  assert.ok(keys.includes('qc.emptySection'));
  const dbl = C.quality(s).find((i) => i.key === 'qc.double');
  assert.deepEqual(dbl.params, { code: 'Q1', word: 'et' });
  const mix = C.quality(s).find((i) => i.key === 'qc.scaleMix');
  assert.deepEqual(mix.detail, [{ points: 5, start: 1, codes: ['Q2'] }, { points: 7, start: 1, codes: ['Q3'] }]);
  // La langue du questionnaire choisit les mots de coordination : « et » n'est pas signalé en anglais, « and » l'est.
  const en = C.update(s, { lang: 'en' });
  assert.ok(!C.quality(en).some((i) => i.key === 'qc.double'));
  const en2 = add(en, { type: 'text', text: 'Is the course clear and useful?' });
  assert.deepEqual(C.quality(en2).find((i) => i.key === 'qc.double').params, { code: 'Q5', word: 'and' });
  // Même nombre de points mais ancrages différents ; item inversé signalé pour recodage.
  let s3 = base();
  s3 = add(s3, likert('A'));
  s3 = add(s3, likert('B', '5', { minLabel: 'Jamais', maxLabel: 'Toujours', reversed: true }));
  const k3 = C.quality(s3).map((i) => i.key);
  assert.deepEqual(k3, ['qc.anchorMix', 'qc.reversed']);
  let s4 = base(); s4 = add(s4, likert('A', '5', { minLabel: '' }));
  assert.deepEqual(C.quality(s4).map((i) => i.key), ['qc.anchorsMissing']);
});

test('dictionnaire des codes et CSV', () => {
  let s = base();
  const q1 = id();
  s = add(s, { id: q1, type: 'single', text: 'Emploi, actuel ?', options: 'Oui\nNon', required: true });
  s = add(s, likert('Satisfaction', '3', { midLabel: 'Neutre', reversed: true }));
  s = add(s, { type: 'number', text: 'Heures', min: '0', max: '', condQuestion: q1, condOp: 'eq', condValue: '1' });
  const rows = C.codebook(s);
  assert.equal(rows.length, 2 + 3 + 1);
  assert.deepEqual(rows.slice(2, 5).map((r) => [r.value, r.label, r.note]), [[1, 'Pas du tout d\'accord', 'reversed'], [2, 'Neutre', 'reversed'], [3, 'Tout à fait d\'accord', 'reversed']]);
  assert.deepEqual(rows[5].condition, { ref: 'Q1', op: 'eq', value: 1 });
  assert.deepEqual(rows[5].range, { min: 0, max: null, decimals: 0, unit: '' });
  assert.equal(C.toCSV([['a', 'b,c', 'd"e'], ['=SUM(A1)', '-5', 'x\ny']]), 'a,"b,c","d""e"\r\n\'=SUM(A1),-5,"x\ny"\r\n');
  assert.equal(C.toCSV([['a;b', 'c']], ';'), '"a;b";c\r\n');
  assert.throws(() => C.toCSV([['a']], '|'), /err\.sep/);
});

test('texte imprimable : numérotation, cases, filtres et bornes', () => {
  let s = base();
  const q1 = id();
  s = C.update(s, { intro: 'Merci de votre aide.' });
  s = add(s, { id: q1, type: 'single', text: 'Emploi ?', options: 'Oui\nNon', required: true });
  s = add(s, { type: 'multiple', text: 'Langues', options: 'FR\nEN' });
  s = add(s, likert('Satisfait', '5', { condQuestion: q1, condOp: 'eq', condValue: '1' }));
  s = add(s, { type: 'number', text: 'Âge', min: '18', max: '', unit: 'ans' });
  const tr = (k, p = {}) => ({ 'print.if': 'Si Q{n} : {cond}', 'op.eq': '= {value}', 'print.one': 'Une seule réponse', 'print.many': 'Plusieurs réponses possibles', 'print.min': 'min {v}', 'print.max': 'max {v}', 'print.required': '* obligatoire' }[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p[x] !== undefined ? p[x] : m));
  const txt = C.printable(s, tr);
  assert.ok(txt.startsWith('ENQUÊTE\n========\n\nMerci de votre aide.\n'));
  assert.ok(txt.includes('1. Emploi ? *\n   Une seule réponse\n   ○ Oui\n   ○ Non\n'));
  assert.ok(txt.includes('2. Langues\n   Plusieurs réponses possibles\n   ☐ FR\n   ☐ EN\n'));
  assert.ok(txt.includes('  [Si Q1 : = « Oui »]\n3. Satisfait\n   1 ○   2 ○   3 ○   4 ○   5 ○\n   (1 = Pas du tout d\'accord ; 5 = Tout à fait d\'accord)\n'));
  assert.ok(txt.includes('4. Âge\n   __________ ans   (min 18)\n'));
  assert.ok(txt.endsWith('* obligatoire\n'));
});

test('sections : ajout, renommage, suppression protégée, déplacement', () => {
  let s = base();
  s = C.addSection(s, 'Avis', 'sec-000002');
  s = C.renameSection(s, 'sec-000002', 'Opinions');
  assert.deepEqual(s.sections.map((x) => x.title), ['Profil', 'Opinions']);
  const q1 = id();
  s = add(s, { id: q1, type: 'single', text: 'A', options: 'Oui\nNon' });
  s = add(s, { type: 'text', text: 'B', condQuestion: q1, condOp: 'answered' }, 'sec-000002');
  assert.throws(() => C.deleteSection(s, 'sec-000001'), /err\.sectionNotEmpty/);
  assert.throws(() => C.moveSection(s, 'sec-000002', -1), /err\.condOrder/); // B passerait avant A
  assert.throws(() => C.renameSection(s, 'sec-000002', ''), /err\.sectionRequired/);
  let t = C.addSection(base(), 'X', 'sec-000003');
  t = C.deleteSection(t, 'sec-000003');
  assert.throws(() => C.deleteSection(t, 'sec-000001'), /err\.lastSection/);
  // Déplacer une question vers une autre section (même identifiant : remplacement).
  const moved = C.putQuestion(s, 'sec-000002', { ...C.orderedQuestions(s)[1] });
  assert.equal(moved.sections[1].questions.length, 1);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  let s = base();
  const q1 = id();
  s = add(s, { id: q1, type: 'single', text: 'Emploi ?', options: 'Oui\nNon', required: true });
  s = add(s, likert('Satisfait', '5', { condQuestion: q1, condOp: 'eq', condValue: '1' }));
  s = add(s, { type: 'number', text: 'Âge', min: '18', max: '99' });
  s = add(s, { type: 'text', text: 'Libre' });
  const surveys = [s];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(surveys))), surveys);
  const ok = { app: 'surveycomposer', version: 1, surveys };
  const q = (i) => s.sections[0].questions[i];
  const withQ = (i, patch) => ({ ...ok, surveys: [{ ...s, sections: [{ ...s.sections[0], questions: s.sections[0].questions.map((x, k) => (k === i ? { ...x, ...patch } : x)) }] }] });
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup(withQ(0, { extra: 1 })), /err\.backup/);
  assert.throws(() => C.validateBackup(withQ(0, { options: [{ value: 1.5, label: 'x' }, { value: 2, label: 'y' }] })), /err\.optionCode/);
  assert.throws(() => C.validateBackup(withQ(1, { scale: { ...q(1).scale, points: 20 } })), /err\.points/);
  assert.throws(() => C.validateBackup(withQ(1, { condition: { question: 'q-zzzzzz', op: 'eq', value: 1 } })), /err\.condOrder/);
  assert.throws(() => C.validateBackup(withQ(2, { range: { ...q(2).range, min: '18' } })), /err\.number/);
  assert.throws(() => C.validateBackup(withQ(3, { long: 'oui' })), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, surveys: [s, s] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, surveys: [{ ...s, lang: 'xx' }] }), /err\.lang/);
  assert.throws(() => C.validateBackup({ ...ok, surveys: Array.from({ length: 51 }, () => s) }), /err\.surveysMany/);
});
