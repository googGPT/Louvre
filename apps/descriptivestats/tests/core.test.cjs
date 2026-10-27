// Tests métier de DescriptiveStats : lecture des nombres, valeurs de référence, quartiles, histogramme, exports, sauvegardes.
// Valeurs de référence : calculs analytiques exacts, ou numpy 2.5 / scipy 1.18 (scipy.stats.skew/kurtosis avec bias=False,
// équivalents de SKEW et KURT d'Excel ; numpy.quantile method='linear' = type 7, 'weibull' = type 6), calculés hors de l'appli.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

test('nombres saisis selon le séparateur décimal choisi', () => {
  assert.equal(C.parseNumber('2,5', ','), 2.5);
  assert.equal(C.parseNumber('1.234,5', ','), 1234.5);
  assert.equal(C.parseNumber('1 234,5', ','), 1234.5); // espace fine insécable (format français)
  assert.equal(C.parseNumber('2.5', '.'), 2.5);
  assert.equal(C.parseNumber('1,234.5', '.'), 1234.5);
  assert.equal(C.parseNumber("1'234.5", '.'), 1234.5); // apostrophe suisse
  assert.equal(C.parseNumber('-0,5', ','), -0.5);
  assert.equal(C.parseNumber('−3', '.'), -3); // signe moins typographique
  assert.equal(C.parseNumber(',5', ','), 0.5);
  assert.equal(C.parseNumber('1,5e-3', ','), 0.0015);
  assert.equal(C.parseNumber('٣٫٥', '.'), 3.5); // chiffres arabes-indiens et virgule décimale arabe
  for (const [tk, d] of [['1.5', ','], ['1,5', '.'], ['1.23', ','], ['12,34', '.'], ['abc', '.'], ['1..2', '.'], ['', ','], ['+', '.'], ['1e999', '.']]) assert.equal(C.parseNumber(tk, d), null, tk);
  assert.throws(() => C.parseNumber('1', ' '), /err\.decimal/);
});

test('série collée : séparateurs, valeurs manquantes signalées, jetons illisibles listés', () => {
  const r = C.parseSeries('\n3,5\n4\nNA\n\n5;6\t7 8\nabc\n1.5\n\n', ',');
  assert.deepEqual(r.values, [3.5, 4, 5, 6, 7, 8]);
  assert.equal(r.missing, 2); // « NA » et la ligne vide au milieu ; les lignes vides de début et de fin sont ignorées
  assert.deepEqual(r.invalid, [{ line: 7, token: 'abc' }, { line: 8, token: '1.5' }]);
  assert.deepEqual(r.items, [3.5, 4, null, null, 5, 6, 7, 8]);
  assert.deepEqual(C.parseSeries('1.5 2.5\n#N/A', '.').values, [1.5, 2.5]);
  assert.throws(() => C.parseSeries('1\n'.repeat(C.MAX_VALUES + 1), '.'), /err\.tooMany/);
});

test('valeurs de référence : petit échantillon classique', () => {
  const d = C.describe([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(d.n, 8);
  assert.equal(d.mean, 5);
  assert.equal(d.median, 4.5);
  assert.equal(d.sdPop, 2); // exact
  close(d.sdSample, Math.sqrt(32 / 7)); // 2.138089935299395
  close(d.varSample, 32 / 7);
  assert.equal(d.varPop, 4);
  assert.deepEqual([d.min, d.max, d.range], [2, 9, 7]);
  assert.deepEqual([d.q1, d.q3, d.iqr], [4, 5.5, 1.5]);
  close(d.skewness, 0.8184875533567996);
  close(d.kurtosis, 0.9406249999999998);
  close(d.sem, Math.sqrt(32 / 7) / Math.sqrt(8));
});

test('valeurs de référence : valeurs négatives et décimales (n impair)', () => {
  const x = [3.1, -1.2, 0.5, 7.8, 2.2, 2.2, 4.9, -3.3, 10.4, 1.0, 0.0];
  const d = C.describe(x);
  close(d.mean, 2.5090909090909093);
  assert.equal(d.median, 2.2);
  close(d.sdSample, 3.9576393331011217);
  close(d.sdPop, 3.773461045838795);
  close(d.skewness, 0.7470098921220641);
  close(d.kurtosis, 0.37896351162473163);
  close(d.q1, 0.25); close(d.q3, 4);
  const d6 = C.describe(x, 'type6');
  close(d6.q1, 0); close(d6.q3, 4.9);
  const dt = C.describe(x, 'tukey');
  close(dt.q1, 0.25); close(dt.q3, 4);
});

test('quartiles : les trois méthodes diffèrent et sont nommées', () => {
  const s = Float64Array.from([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.deepEqual(C.quartiles(s, 'type7'), [4, 5.5]);
  assert.deepEqual(C.quartiles(s, 'type6'), [4, 6.5]);
  assert.deepEqual(C.quartiles(s, 'tukey'), [4, 6]);
  assert.deepEqual(C.quartiles(Float64Array.from([1, 2, 3, 4]), 'type6'), [1.25, 3.75]);
  assert.throws(() => C.describe([1, 2], 'type9'), /err\.method/);
});

test('stabilité numérique : grandes valeurs proches (résultats analytiques exacts)', () => {
  // c + 0,2 puis 500 paires (c + 0,1 ; c + 0,3) : moyenne c + 0,2 et écart-type d'échantillon 0,1 exactement.
  for (const c0 of [1, 1e6, 1e9]) {
    const x = [c0 + 0.2];
    for (let i = 0; i < 500; i += 1) x.push(c0 + 0.1, c0 + 0.3);
    const d = C.describe(x);
    close(d.mean, c0 + 0.2, 1e-15);
    close(d.sdSample, 0.1, c0 >= 1e9 ? 1e-6 : 1e-9);
  }
  const d = C.describe([1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16]);
  assert.equal(d.varSample, 30);
});

test('cas limites : une valeur, valeurs identiques, aucune donnée', () => {
  const one = C.describe([42]);
  assert.equal(one.varSample, null); assert.equal(one.sdSample, null); assert.equal(one.sem, null);
  assert.equal(one.sdPop, 0); assert.deepEqual([one.q1, one.q3, one.median], [42, 42, 42]);
  assert.equal(one.skewness, null); assert.equal(one.kurtosis, null);
  const same = C.describe([3, 3, 3, 3, 3]);
  assert.equal(same.sdSample, 0); assert.equal(same.skewness, null); assert.equal(same.kurtosis, null);
  assert.equal(C.describe([1, 2, 3]).kurtosis, null); // n < 4
  assert.throws(() => C.describe([]), /err\.noData/);
  assert.throws(() => C.describe([1, NaN]), /err\.value/);
});

test('histogramme : règles de Sturges et Freedman–Diaconis, classes d\'égale largeur', () => {
  const x = Array.from({ length: 100 }, (_, i) => i); // 0..99
  assert.equal(C.binCount(x, 'sturges'), 8); // ceil(log2 100) + 1
  assert.equal(C.binCount(x, 'fd'), 5); // largeur 2 × 49,5 / 100^(1/3) ≈ 21,33
  assert.equal(C.binCount(x, '10'), 10);
  const h = C.histogram(x, '10');
  assert.equal(h.length, 10);
  assert.deepEqual(h.map((b) => b.count), [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  assert.equal(h[9].to, 99); // la valeur maximale tombe dans la dernière classe
  assert.equal(h.reduce((a, b) => a + b.count, 0), 100);
  assert.deepEqual(C.histogram([5, 5, 5]).map((b) => b.count), [3]);
  assert.throws(() => C.binCount(x, '7'), /err\.bins/);
});

test('histogramme SVG : autonome, textes échappés, une barre par classe', () => {
  const svg = C.histogramSVG(C.histogram([1, 2, 2, 3, 3, 3], '5'), { title: 'A < B & "C"', label: 'Histogramme', fmt: (v) => String(v).replace('.', ',') });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('A &lt; B &amp; &quot;C&quot;'));
  assert.equal((svg.match(/fill="#c2410c"/g) || []).length, 5);
  assert.ok(svg.includes('1,4')); // étiquettes formatées par la fonction fournie
  assert.ok(!svg.includes('<script'));
});

test('CSV : colonnes, en-tête détecté, séparateur selon la virgule décimale', () => {
  const a = C.parseCSV('﻿Année;Rendement;Note\n2020;1,5;"a;b"\n2021;NA;c\n2022;-2,25;d\n', ',');
  assert.equal(a.sep, ';');
  assert.deepEqual(a.headers, ['Année', 'Rendement', 'Note']);
  assert.deepEqual(a.columns[1], ['1,5', 'NA', '-2,25']);
  assert.deepEqual(a.columns[2], ['a;b', 'c', 'd']);
  const b = C.parseCSV('1,5\n2,5\n', ','); // virgule décimale : une seule colonne
  assert.equal(b.sep, null); assert.deepEqual(b.columns, [['1,5', '2,5']]); assert.deepEqual(b.headers, []);
  const c = C.parseCSV('x,y\n1.5,2\n3,"4"\n', '.');
  assert.equal(c.sep, ','); assert.deepEqual(c.columns[1], ['2', '4']);
  const out = C.resultsCSV(['Statistique', 'Valeur'], [['Moyenne', 2.5], ['Asymétrie', null]], ',');
  assert.equal(out, 'Statistique;Valeur\r\nMoyenne;2,5\r\nAsymétrie;\r\n');
  assert.equal(C.resultsCSV(['Stat', 'Value'], [['Mean', 2.5]], '.'), 'Stat,Value\r\nMean,2.5\r\n');
});

test('sauvegarde : aller-retour exact, réglages et séries refusés si invalides', () => {
  const settings = { decimal: '.', method: 'type6', bins: 'fd', digits: 4 };
  const series = [C.makeSeries(' Rendements ', [1.5, null, -2], 'series-0001')];
  assert.equal(series[0].name, 'Rendements');
  const back = C.validateBackup(JSON.parse(C.backup(settings, series)));
  assert.deepEqual(back, { settings, series });
  assert.equal(C.seriesText(series[0].items, ','), '1,5\nNA\n-2');
  assert.deepEqual(C.parseSeries(C.seriesText(series[0].items, ','), ',').items, series[0].items); // aller-retour texte
  const ok = { app: 'descriptivestats', version: 1, settings, series };
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { ...settings, decimal: ' ' } }), /err\.decimal/);
  assert.throws(() => C.validateBackup({ ...ok, settings: { ...settings, digits: 9 } }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, series: [{ ...series[0], items: [1, 'x'] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, series: [{ ...series[0], items: [null] }] }), /err\.noData/);
  assert.throws(() => C.validateBackup({ ...ok, series: [series[0], series[0]] }), /err\.backup/);
  assert.throws(() => C.makeSeries(' ', [1], 'series-0002'), /err\.nameRequired/);
});
