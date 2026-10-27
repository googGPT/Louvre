// Tests métier de ReadabilityLab : phrases, mots, syllabes, mesures, formules par langue, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const S = (text, lang) => C.splitSentences(text, lang).map((s) => s.text);

test('phrases : abréviations, initiales, décimaux, ponctuation intérieure', () => {
  assert.deepEqual(S('M. Dupont paie 3,14 € à 9 h. Il part ! « Vraiment ? » dit-elle. J. K. Rowling écrit, etc. et voilà. Fin…', 'fr'),
    ['M. Dupont paie 3,14 € à 9 h.', 'Il part !', '« Vraiment ? » dit-elle.', 'J. K. Rowling écrit, etc. et voilà.', 'Fin…']);
  assert.deepEqual(S('Mr. Smith paid $3.50, e.g. for tea. Then he slept. Is it ok? Yes!', 'en'), ['Mr. Smith paid $3.50, e.g. for tea.', 'Then he slept.', 'Is it ok?', 'Yes!']);
  assert.deepEqual(S('Am 3. Mai kam er, z. B. mit dem Zug. Dann ging er.', 'de'), ['Am 3. Mai kam er, z. B. mit dem Zug.', 'Dann ging er.']);
  assert.deepEqual(S('¿Qué tal? El Sr. García llegó.', 'es'), ['¿Qué tal?', 'El Sr. García llegó.']);
  assert.deepEqual(S('Voir example.com ou 1.000 pages. Ensuite, on lit.', 'fr'), ['Voir example.com ou 1.000 pages.', 'Ensuite, on lit.']);
});

test('phrases : ponctuation arabe, titres, listes, positions exactes', () => {
  assert.deepEqual(S('هل أنت بخير؟ نعم، أنا بخير. شكرًا؛ إلى اللقاء!', 'ar'), ['هل أنت بخير؟', 'نعم، أنا بخير.', 'شكرًا؛ إلى اللقاء!']);
  assert.deepEqual(S('Titre sans point\n\n1. Introduction\n2. Méthode\n- un point\nTexte. Suite.', 'fr'),
    ['Titre sans point', '1. Introduction', '2. Méthode', '- un point\nTexte.', 'Suite.']);
  const text = '  Un. Deux trois.  ';
  for (const s of C.splitSentences(text, 'fr')) assert.equal(text.slice(s.start, s.end), s.text);
  assert.deepEqual(S('... — !', 'fr'), []); // pas de mot, pas de phrase
  assert.throws(() => C.splitSentences(42, 'fr'), /err\.text/);
});

test('mots : nombres d\'un seul tenant, composés, élisions fr/it seulement', () => {
  assert.deepEqual(C.wordTokens("L'école d'aujourd'hui coûte 3,5 % de plus.", 'fr').map((t) => t.w), ["L'", 'école', "d'", "aujourd'hui", 'coûte', '3,5', 'de', 'plus']);
  assert.deepEqual(C.wordTokens("Don't stop well-known 1,000.5", 'en').map((t) => t.w), ["Don't", 'stop', 'well-known', '1,000.5']);
  assert.deepEqual(C.wordTokens("dell'anno", 'it').map((t) => t.w), ["dell'", 'anno']);
  assert.equal(C.wordTokens('بسم الله الرحمن', 'ar').length, 3);
});

test('syllabes : approximations par langue ; aucune pour l\'arabe ni « autre »', () => {
  const cases = { en: { the: 1, beautiful: 3, readability: 5, table: 2 }, fr: { table: 1, école: 2, maison: 2, tables: 1 }, es: { poesía: 4, ciudad: 2, país: 2, que: 1 }, pt: { não: 1, coração: 3 }, it: { buono: 2, casa: 2 }, de: { Schönheit: 2, Haus: 1 } };
  for (const [lang, words] of Object.entries(cases)) for (const [w, n] of Object.entries(words)) {
    if (lang === 'en' && w === 'beautiful') { assert.ok([3, 4].includes(C.syllables(w, lang)), w); continue; } // règle approximative
    assert.equal(C.syllables(w, lang), n, `${lang} ${w}`);
  }
  assert.equal(C.syllables('كتاب', 'ar'), null);
  assert.equal(C.syllables('word', 'other'), null);
});

test('mesures : moyenne, médiane, maximum, distribution, phrases et mots longs, répétitions, doublons', () => {
  const long = 'Then ' + Array.from({ length: 28 }, (_, i) => 'w' + 'abcdefghijklmnopqrstuvwxyzab'[i]).join(' ') + ' end.'; // 30 mots tous différents
  const text = `Short one. Two words here. ${long}\n\nThe the report about reports. Report report report, report again.`;
  const r = C.analyze(text, 'en', { longSentence: 25, longWord: 7 });
  assert.deepEqual(r.sentences.map((s) => s.words), [2, 3, 30, 5, 5]);
  assert.equal(r.words, 45);
  assert.equal(r.avgWords, 9);
  assert.equal(r.median, 5);
  assert.equal(r.max, 30);
  assert.deepEqual(r.longSentences, [2]);
  assert.deepEqual(r.distribution.map((b) => b.count), [4, 0, 1, 0, 0]);
  assert.equal(r.paragraphs, 2);
  assert.deepEqual(r.doubled.map((d) => [d.word, d.sentence]), [['the', 3], ['report', 4], ['report', 4]]);
  assert.deepEqual(r.repeats, [{ word: 'report', count: 5 }]); // « reports » n'est pas regroupé (pas de lemmatisation)
  assert.deepEqual(r.longWords, [{ word: 'reports', count: 1 }]);
  assert.equal(r.short, true);
  // Seuils réglables : la même phrase n'est plus longue avec un seuil de 30.
  assert.deepEqual(C.analyze(text, 'en', { longSentence: 30, longWord: 7 }).longSentences, []);
  const empty = C.analyze('', 'fr', C.DEFAULTS);
  assert.equal(empty.words, 0); assert.deepEqual(empty.formulas, []);
});

test('formules : seulement pour la langue de conception, valeurs exactes', () => {
  // Texte anglais contrôlé : 2 phrases, 10 mots d'une syllabe.
  const en = C.analyze('The cat sat on the mat. A dog ran home.', 'en', C.DEFAULTS);
  assert.equal(en.words, 10);
  assert.equal(en.syllables, 10);
  const fl = en.formulas.find((f) => f.id === 'flesch'), fk = en.formulas.find((f) => f.id === 'fk');
  assert.equal(fl.value, Math.round((206.835 - 1.015 * 5 - 84.6 * 1) * 10) / 10); // 117,2
  assert.equal(fl.band, 'veryEasy');
  assert.equal(fk.value, Math.round((0.39 * 5 + 11.8 - 15.59) * 10) / 10);
  assert.deepEqual(C.formulasFor('fr').map((f) => f.id), ['kandel']);
  assert.deepEqual(C.formulasFor('es').map((f) => f.id), ['huerta']);
  assert.deepEqual(C.formulasFor('de').map((f) => f.id), ['amstad']);
  assert.deepEqual(C.formulasFor('pt').map((f) => f.id), ['martins']);
  assert.deepEqual(C.formulasFor('it').map((f) => f.id), ['gulpease']);
  assert.deepEqual(C.formulasFor('ar'), []);
  assert.deepEqual(C.formulasFor('other'), []);
  // Le même texte déclaré dans une autre langue n'utilise pas Flesch.
  assert.deepEqual(C.analyze('The cat sat on the mat. A dog ran home.', 'other', C.DEFAULTS).formulas, []);
  const ar = C.analyze('هل أنت بخير؟ نعم، أنا بخير.', 'ar', C.DEFAULTS);
  assert.equal(ar.syllables, null); assert.equal(ar.avgSyllables, null); assert.deepEqual(ar.formulas, []);
  assert.equal(ar.sentences.length, 2);
  // Gulpease : 89 + (300 × phrases − 10 × lettres) / mots.
  const it = C.analyze('Il gatto dorme. Il cane abbaia forte.', 'it', C.DEFAULTS);
  assert.equal(it.formulas[0].value, Math.round((89 + (300 * 2 - 10 * 29) / 7) * 10) / 10);
  // Kandel-Moles, Amstad, Fernández Huerta, Martins : constantes de chaque formule.
  const fr = C.analyze('Le chat dort. Il fait beau.', 'fr', C.DEFAULTS); // 6 mots, 2 phrases, 6 syllabes
  assert.equal(fr.formulas[0].value, Math.round((207 - 1.015 * 3 - 73.6 * fr.syllables / 6) * 10) / 10);
  const de = C.analyze('Die Katze schläft. Der Hund bellt.', 'de', C.DEFAULTS);
  assert.equal(de.formulas[0].value, Math.round((180 - 3 - 58.5 * de.syllables / 6) * 10) / 10);
  const es = C.analyze('El gato duerme. El perro ladra.', 'es', C.DEFAULTS);
  assert.equal(es.formulas[0].value, Math.round((206.84 - 0.6 * 100 * es.syllables / 6 - 1.02 * 100 * 2 / 6) * 10) / 10);
  const pt = C.analyze('O gato dorme. O cão ladra.', 'pt', C.DEFAULTS);
  assert.equal(pt.formulas[0].value, Math.round((248.835 - 1.015 * 3 - 84.6 * pt.syllables / 6) * 10) / 10);
});

test('saisies refusées : seuils, langue, longueur du texte', () => {
  assert.equal(C.parseThreshold(' 30 ', 'longSentence'), 30);
  for (const bad of ['4', '101', 'abc', '2.5', '']) assert.throws(() => C.parseThreshold(bad, 'longSentence'), /^Error: err\.longSentence\|\{"min":5,"max":100\}/);
  assert.throws(() => C.parseThreshold('5', 'longWord'), /err\.longWord/);
  assert.throws(() => C.analyze('x', 'xx', C.DEFAULTS), /err\.lang/);
  assert.throws(() => C.analyze('x'.repeat(C.LIMITS.text + 1), 'fr', C.DEFAULTS), /err\.textLong/);
  assert.throws(() => C.analyze('x', 'fr', { longSentence: 25 }), /err\.backup/);
});

test('CSV des phrases : en-têtes fournis, guillemets, protection contre les formules', () => {
  const r = C.analyze('=SUM(A1) est "cité". Deuxième phrase ici.', 'fr', { longSentence: 5, longWord: 12 });
  const csv = C.sentencesCSV(r, ['N°', 'Mots', 'Caractères', 'Longue', 'Phrase'], ['oui', 'non']);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.ok(csv.startsWith('﻿'));
  assert.equal(lines[0], '"N°";"Mots";"Caractères";"Longue";"Phrase"');
  assert.equal(lines[1], '"1";"4";"20";"non";"\'=SUM(A1) est ""cité""."');
  assert.equal(lines.length, 3);
});

test('sauvegarde : aller-retour exact et contenus refusés champ par champ', () => {
  const state = { settings: { longSentence: 30, longWord: 10 }, docs: [C.makeDoc({ id: 'doc-0001', name: ' Rapport ', lang: 'fr', text: 'Un texte.' }), C.makeDoc({ id: 'doc-0002', name: 'نص', lang: 'ar', text: '' })] };
  assert.equal(state.docs[0].name, 'Rapport');
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(state))), state);
  const ok = { app: 'readabilitylab', version: 1, ...state };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: true }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { longSentence: 300, longWord: 10 } }), /err\.longSentence/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...state.docs[0], lang: 'xx' }] }), /err\.lang/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...state.docs[0], text: 5 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...state.docs[0], text: 'x'.repeat(50001) }] }), /err\.textLong/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...state.docs[0], name: '' }] }), /err\.nameRequired/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...state.docs[0], id: 'x' }] }), /err\.id/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [state.docs[0], state.docs[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, docs: [{ ...state.docs[0], extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, docs: Array.from({ length: 31 }, (_, i) => ({ ...state.docs[0], id: `doc-${1000 + i}` })) }), /err\.docsMany/);
});
