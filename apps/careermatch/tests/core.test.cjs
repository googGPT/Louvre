// Tests métier de CareerMatch : normalisation, mots vides par langue, termes présents/absents, couverture, expressions, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const base = (o) => ({ name: 'Test', lang: 'fr', cv: '', offer: '', phrases: [], ignore: [], foldPlurals: true, top: 0, ...o });
const keys = (list) => list.map((x) => x.key);

test('mots : élisions, outils techniques, nombres et ponctuation', () => {
  assert.deepEqual(C.words("L'analyse d'un portefeuille en C++, C#, Node.js et R : 2024."), ['analyse', 'un', 'portefeuille', 'en', 'C++', 'C#', 'Node.js', 'et', 'R', '2024']);
  assert.deepEqual(C.tokens("L'analyse des données en Python (2024) et SQL.", 'fr').map((t) => t.key), ['analyse', 'donnee', 'python', 'sql']);
  assert.deepEqual(C.tokens('Expérience EXPERIENCE expériences', 'fr').map((t) => t.key), ['experience', 'experience', 'experience']);
});

test('mots vides selon la langue du texte', () => {
  assert.deepEqual(C.tokens('The analysis of the data and the models', 'en').map((t) => t.key), ['analysis', 'data', 'model']);
  assert.deepEqual(C.tokens('Análisis de los datos con modelos', 'es').map((t) => t.key), ['analisis', 'dato', 'modelo']);
  assert.deepEqual(C.tokens('Analyse der Daten und für Modelle', 'de').map((t) => t.key), ['analyse', 'daten', 'modelle']);
  assert.deepEqual(C.tokens('Analisi dei dati per la finanza', 'it').map((t) => t.key), ['analisi', 'dati', 'finanza']);
  assert.deepEqual(C.tokens('Análise dos dados para a empresa', 'pt').map((t) => t.key), ['analise', 'dado', 'empresa']);
  // Arabe : voyelles brèves et alifs normalisés, article « ال » retiré, mots vides ignorés.
  assert.deepEqual(C.tokens('تحليل البيانات في المالية وإدارة المخاطر', 'ar').map((t) => t.key), ['تحليل', 'بيانات', 'ماليه', 'واداره', 'مخاطر']);
  assert.deepEqual(C.tokens('والمخاطر وExcel وظيفة', 'ar').map((t) => [t.key, t.surface]), [['مخاطر', 'والمخاطر'], ['excel', 'Excel'], ['وظيفه', 'وظيفة']]);
  assert.equal(C.fold('أَحمد', 'ar'), 'احمد');
  assert.throws(() => C.tokens('x', 'nl'), /err\.lang/);
});

test('pluriels légers, désactivables', () => {
  assert.equal(C.stem('companies', 'en'), 'company');
  assert.equal(C.stem('bureaux', 'fr'), 'bureau');
  assert.equal(C.stem('analysis', 'en'), 'analysis'); // terminaison -is conservée
  assert.equal(C.stem('process', 'en'), 'process'); // -ss conservé
  assert.deepEqual(C.tokens('modèles', 'fr', { fold: false }).map((t) => t.key), ['modeles']);
});

test('analyse : termes présents et absents, couverture simple et pondérée', () => {
  const r = C.analyze(base({
    offer: 'Analyste financier : Python, SQL, Python avancé. Modélisation financière et reporting. Anglais courant.',
    cv: 'Analyste junior. Python et Excel. Reporting mensuel, modèles financiers.',
  }));
  const by = Object.fromEntries(r.terms.map((x) => [x.key, x]));
  assert.equal(by.python.offer, 2); assert.equal(by.python.cv, 1);
  assert.equal(by.financier.offer, 1); assert.equal(by.financier.cv, 1); // « financiers » ramené au singulier
  assert.equal(by.sql.cv, 0);
  assert.equal(r.terms[0].key, 'python'); // le plus fréquent dans l'offre d'abord
  assert.deepEqual(keys(r.present).sort(), ['analyste', 'financier', 'python', 'reporting']);
  assert.equal(r.terms.length, 10);
  assert.equal(r.coverage, 40); // 4 termes sur 10
  assert.equal(r.weighted, 45.5); // 5 occurrences sur 11
  assert.equal(by.modelisation.term, 'modélisation'); // forme écrite affichée, pas la forme normalisée
});

test('analyse : limite aux N premiers termes, termes ignorés, expressions', () => {
  const offer = 'gestion gestion gestion projet projet budget équipe équipe client';
  const r = C.analyze(base({ offer, cv: 'Gestion de projet et budget', top: 20, ignore: ['client'], phrases: ['gestion de projet', 'conduite du changement'] }));
  assert.deepEqual(keys(r.terms), ['gestion', 'projet', 'equipe', 'budget']); // fréquence, puis ordre des formes écrites (code par défaut ; l'interface trie selon la langue)
  assert.ok(!keys(r.terms).includes('client'));
  assert.deepEqual(r.phrases, [{ phrase: 'gestion de projet', inOffer: false, inCV: true }, { phrase: 'conduite du changement', inOffer: false, inCV: false }]);
  const r2 = C.analyze(base({ offer: 'Gestion de projets complexes', cv: 'gestion de projet', phrases: ['Gestion de projet'] }));
  assert.deepEqual(r2.phrases[0], { phrase: 'Gestion de projet', inOffer: true, inCV: true }); // pluriel ramené
  const fr = (a, b) => a.localeCompare(b, 'fr');
  assert.deepEqual(C.analyze(base({ offer: 'zèbre étude abeille', cv: '' }), fr).terms.map((x) => x.term), ['abeille', 'étude', 'zèbre']);
});

test('textes vides : aucune division par zéro', () => {
  const r = C.analyze(base({}));
  assert.deepEqual([r.terms.length, r.coverage, r.weighted], [0, 0, 0]);
});

test('validation des comparaisons et listes nettoyées', () => {
  const c = C.makeComparison(base({ name: '  Offre A ', phrases: 'gestion de projet\n\n  Gestion  de projet \nSQL' }), 'cmp-000001');
  assert.equal(c.name, 'Offre A');
  assert.deepEqual(c.phrases, ['gestion de projet', 'SQL']); // doublons et lignes vides retirés
  assert.throws(() => C.makeComparison(base({ name: ' ' }), 'cmp-000002'), /err\.nameRequired/);
  assert.throws(() => C.makeComparison(base({ lang: 'xx' }), 'cmp-000003'), /err\.lang/);
  assert.throws(() => C.makeComparison(base({ top: 7 }), 'cmp-000004'), /err\.top/);
  assert.throws(() => C.makeComparison(base({ cv: 'x'.repeat(C.LIMITS.text + 1) }), 'cmp-000005'), /^Error: err\.textLong\|\{"max":50000\}$/);
  assert.throws(() => C.makeComparison(base({ phrases: Array.from({ length: 31 }, (_, i) => `p${i}`) }), 'cmp-000006'), /err\.tooManyPhrases/);
  assert.throws(() => C.makeComparison(base({ phrases: ['x'.repeat(61)] }), 'cmp-000007'), /err\.itemLong/);
});

test('export CSV : en-têtes et statuts fournis ; un mot ne peut pas commencer une formule', () => {
  const r = C.analyze(base({ offer: 'Python =SOMME python', cv: 'python' }));
  const csv = C.termsCSV(r, ['Terme', 'Offre', 'CV', 'Statut'], { present: 'présent', missing: 'absent' });
  assert.equal(csv, 'Terme,Offre,CV,Statut\r\npython,2,1,présent\r\nsomme,1,0,absent\r\n'); // « = » n'appartient à aucun mot
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const list = [C.makeComparison(base({ name: 'A', cv: 'cv', offer: 'offre', phrases: ['x'], ignore: ['y'], top: 50, foldPlurals: false }), 'cmp-000010')];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(list))), list);
  const ok = { app: 'careermatch', version: 1, comparisons: list };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, comparisons: [{ ...list[0], foldPlurals: 'oui' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, comparisons: [{ ...list[0], top: '20' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, comparisons: [{ ...list[0], phrases: [1] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, comparisons: [list[0], list[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, comparisons: [{ ...list[0], hack: 1 }] }), /err\.backup/);
});
