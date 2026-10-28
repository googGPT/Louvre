// Tests métier d'ExpenseClassifier : lecture CSV, montants, dates, colonnes, règles, totaux, export, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../core.js');

const cats = [C.makeCategory('Logement', 'cat-0001'), C.makeCategory('Courses', 'cat-0002'), C.makeCategory('Revenus', 'cat-0003')];
const rule = (id, categoryId, kind, value, sign = 'any') => C.makeRule({ categoryId, kind, value, sign }, id, cats);

test('CSV : guillemets, séparateur dans un champ, retour à la ligne, BOM et fins de ligne Windows', () => {
  const rows = C.parseCSV('\ufeffDate;Libellé;Montant\r\n01/10/2026;"CB ""CAFÉ""; centre";-3,50\r\n02/10/2026;"VIR\nSALAIRE";2 100,00\r\n', ';');
  assert.deepEqual(rows, [['Date', 'Libellé', 'Montant'], ['01/10/2026', 'CB "CAFÉ"; centre', '-3,50'], ['02/10/2026', 'VIR\nSALAIRE', '2 100,00']]);
  assert.throws(() => C.parseCSV('a;"b', ';'), /^Error: err\.csvQuote$/);
  assert.throws(() => C.parseCSV('a;b', ':'), /err\.delimiter/);
  assert.throws(() => C.parseCSV('x\n'.repeat(C.MAX_TX + 3), ';'), /err\.tooManyRows/);
});

test('détection du séparateur', () => {
  assert.equal(C.detectDelimiter('Date;Libellé;Montant\n01/10/2026;CB, café;-3,50\n02/10/2026;Loyer;-700,00'), ';');
  assert.equal(C.detectDelimiter('Date,Description,Amount\n2026-10-01,"Coffee; shop",-3.50\n2026-10-02,Rent,-700.00'), ',');
  assert.equal(C.detectDelimiter('Datum\tText\tBetrag\n01.10.2026\tMiete\t-700,00'), '\t');
});

test('montants : virgule ou point décimal, milliers, signes, devises, notation comptable', () => {
  assert.equal(C.parseAmount('-1 234,56 €', 'comma'), -123456);
  assert.equal(C.parseAmount('1.234,5', 'comma'), 123450);
  assert.equal(C.parseAmount('12,00-', 'comma'), -1200);
  assert.equal(C.parseAmount('(45,10)', 'comma'), -4510);
  assert.equal(C.parseAmount('-$1,234.56', 'dot'), -123456);
  assert.equal(C.parseAmount("1'234.50 CHF", 'dot'), 123450);
  assert.equal(C.parseAmount('+700', 'dot'), 70000);
  assert.equal(C.parseAmount('1\u202f000,00', 'comma'), 100000);
  for (const bad of ['', 'abc', '12,345', '1.23.4', '12.50', '1,2,3']) assert.throws(() => C.parseAmount(bad, 'comma'), /^Error: err\.amount$/, bad);
  assert.throws(() => C.parseAmount('12,50', 'dot'), /err\.amount/);
  assert.throws(() => C.parseAmount('1', 'x'), /err\.decimal/);
  assert.equal(C.formatAmount(-123456, 'comma'), '-1234,56');
  assert.equal(C.formatAmount(5, 'dot'), '0.05');
  assert.equal(C.detectDecimal(['-3,50', '1.234,56', '700']), 'comma');
  assert.equal(C.detectDecimal(['-3.50', '1,234.56']), 'dot');
  assert.equal(C.detectDecimal(['700', '1 200']), null);
});

test('dates : trois formats, années sur 2 chiffres, jours impossibles refusés', () => {
  assert.equal(C.parseDate('03/10/2026', 'dmy'), '2026-10-03');
  assert.equal(C.parseDate('10/03/2026', 'mdy'), '2026-10-03');
  assert.equal(C.parseDate('2026-10-03 14:05', 'ymd'), '2026-10-03');
  assert.equal(C.parseDate('20261003', 'ymd'), '2026-10-03');
  assert.equal(C.parseDate('3.10.26', 'dmy'), '2026-10-03');
  assert.equal(C.parseDate('29/02/2028', 'dmy'), '2028-02-29');
  for (const bad of ['29/02/2026', '31/04/2026', '2026/13/01', 'hier', '']) assert.throws(() => C.parseDate(bad, bad.startsWith('2026') ? 'ymd' : 'dmy'), /^Error: err\.date$/, bad);
  assert.deepEqual(C.detectDateFormats(['03/10/2026', '25/10/2026']), ['dmy']);
  assert.deepEqual(C.detectDateFormats(['03/10/2026', '04/10/2026']), ['dmy', 'mdy']); // ambigu : l'utilisateur choisit
  assert.deepEqual(C.detectDateFormats(['2026-10-03']), ['ymd']);
});

test('colonnes et en-tête devinés ; colonnes débit / crédit séparées', () => {
  const rows = C.parseCSV('Date opération;Libellé;Débit;Crédit;Solde\n01/10/2026;LOYER;700,00;;1 300,00\n02/10/2026;SALAIRE;;2 000,00;3 300,00', ';');
  assert.equal(C.detectHeader(rows), true);
  const map = C.detectColumns(rows, { hasHeader: true, decimal: 'comma' });
  assert.deepEqual(map, { date: 0, label: 1, amount: -1, debit: 2, credit: 3 });
  const res = C.buildTransactions(rows, { hasHeader: true, decimal: 'comma', dateFormat: 'dmy', map });
  assert.deepEqual(res.transactions.map((t) => t.cents), [-70000, 200000]);
  const raw = C.parseCSV('2026-10-02,Coffee shop,-3.50\n2026-10-01,Rent,-700.00', ',');
  assert.equal(C.detectHeader(raw, 'dot'), false);
  assert.deepEqual(C.detectColumns(raw, { hasHeader: false, decimal: 'dot' }), { date: 0, label: 1, amount: 2, debit: -1, credit: -1 });
});

test('import : lignes illisibles signalées avec leur numéro, lignes vides ignorées, tri chronologique', () => {
  const rows = C.parseCSV('Date;Libellé;Montant\n05/10/2026;B;-2,00\n\n01/10/2026;A;-1,00\n32/10/2026;X;1\n02/10/2026;Y;abc\n03/10/2026', ';');
  const res = C.buildTransactions(rows, { hasHeader: true, decimal: 'comma', dateFormat: 'dmy', map: { date: 0, label: 1, amount: 2 } });
  assert.deepEqual(res.transactions.map((t) => t.label), ['A', 'B']);
  assert.equal(res.errorCount, 3);
  assert.deepEqual(res.errors, [{ line: 5, key: 'err.rowDate' }, { line: 6, key: 'err.rowAmount' }, { line: 7, key: 'err.rowShort' }]);
  assert.throws(() => C.buildTransactions(rows, { hasHeader: true, decimal: 'comma', dateFormat: 'dmy', map: { date: 0, label: 0, amount: 2 } }), /err\.mapDuplicate/);
  assert.throws(() => C.buildTransactions(rows, { hasHeader: true, decimal: 'comma', dateFormat: 'dmy', map: { date: 0, amount: 2 } }), /err\.mapMissing/);
});

test('règles : mot-clé sans accents ni casse, joker, sens, priorité', () => {
  const tx = [
    { date: '2026-10-01', label: 'PRLV Loyer octobre', cents: -70000 },
    { date: '2026-10-02', label: 'CB SUPERMARCHÉ CENTRE 01/10', cents: -4520 },
    { date: '2026-10-03', label: 'VIR SALAIRE', cents: 210000 },
    { date: '2026-10-04', label: 'CB SUPERMARCHE REMBOURSEMENT', cents: 1200 },
    { date: '2026-10-05', label: 'Retrait DAB', cents: -4000 },
  ];
  const rules = [rule('rule-0001', 'cat-0001', 'keyword', 'LOYER'), rule('rule-0002', 'cat-0002', 'pattern', 'cb supermarche*', 'out'), rule('rule-0003', 'cat-0003', 'keyword', 'vir', 'in')];
  const out = C.classify(tx, rules);
  assert.deepEqual(out.map((t) => t.categoryId), ['cat-0001', 'cat-0002', 'cat-0003', null, null]);
  assert.equal(out[1].ruleId, 'rule-0002');
  // Priorité : la règle placée en premier gagne.
  const broad = rule('rule-0004', 'cat-0002', 'pattern', '*');
  assert.equal(C.classify(tx, [broad, ...rules])[0].categoryId, 'cat-0002');
  assert.equal(C.classify(tx, C.moveRule([broad, ...rules], 'rule-0004', 1))[0].categoryId, 'cat-0001');
  assert.equal(C.wildcard('a*b?d', 'axxbcd'), true);
  assert.equal(C.wildcard('a*b?d', 'axxbd'), false);
  assert.equal(C.wildcard('*'.repeat(40) + 'z', 'a'.repeat(200)), false); // pas d'explosion du temps de calcul
  assert.throws(() => rule('rule-0009', 'cat-0099', 'keyword', 'x'), /err\.ruleCategory/);
  assert.throws(() => rule('rule-0009', 'cat-0001', 'regex', 'x'), /err\.ruleKind/);
  assert.throws(() => rule('rule-0009', 'cat-0001', 'keyword', '  '), /err\.ruleRequired/);
  assert.throws(() => rule('rule-0009', 'cat-0001', 'pattern', '**?'), /err\.rulePattern/);
  assert.throws(() => rule('rule-0009', 'cat-0001', 'keyword', 'x'.repeat(81)), /err\.ruleLong/);
  assert.throws(() => C.makeCategory(' logement ', 'cat-0009', cats), /err\.catExists/);
  assert.throws(() => C.makeCategory('', 'cat-0009', cats), /err\.catRequired/);
});

test('totaux par catégorie et par mois, débits et crédits séparés', () => {
  const tx = [
    { date: '2026-09-30', label: 'LOYER', cents: -70000 },
    { date: '2026-10-01', label: 'LOYER', cents: -70000 },
    { date: '2026-10-02', label: 'SUPERMARCHE', cents: -4520 },
    { date: '2026-10-03', label: 'SUPERMARCHE avoir', cents: 1200 },
    { date: '2026-10-04', label: 'divers', cents: -999 },
  ];
  const s = C.summarize(C.classify(tx, [rule('rule-0001', 'cat-0001', 'keyword', 'loyer'), rule('rule-0002', 'cat-0002', 'keyword', 'supermarche')]), cats);
  assert.deepEqual(s.total, { outCents: 145519, inCents: 1200, netCents: -144319, count: 5, classifiedCount: 4 });
  assert.deepEqual(s.categories.map((c) => [c.categoryId, c.outCents, c.inCents, c.netCents, c.count]),
    [['cat-0001', 140000, 0, -140000, 2], ['cat-0002', 4520, 1200, -3320, 2], [null, 999, 0, -999, 1]]);
  assert.deepEqual(s.months.map((m) => [m.month, m.netCents, m.byCat['cat-0001']]), [['2026-09', -70000, -70000], ['2026-10', -74319, -70000]]);
});

test('export CSV : en-têtes fournis, décimale choisie, formules neutralisées', () => {
  const rows = C.classify([{ date: '2026-10-01', label: '=HYPERLINK("x")', cents: -350 }, { date: '2026-10-02', label: 'Café; bar', cents: 1000 }], [rule('rule-0001', 'cat-0002', 'keyword', 'cafe')]);
  const csv = C.toCSV(rows, { headers: ['Date', 'Libellé', 'Montant', 'Catégorie', 'Mois'], decimal: 'comma', categoryName: (id) => (id ? 'Courses' : 'Non classé') });
  assert.equal(csv, '\ufeffDate;Libellé;Montant;Catégorie;Mois\r\n2026-10-01;"\'=HYPERLINK(""x"")";-3,50;Non classé;2026-10\r\n2026-10-02;"Café; bar";10,00;Courses;2026-10\r\n');
  assert.ok(C.toCSV(rows, { headers: ['a', 'b', 'c', 'd', 'e'], decimal: 'dot', categoryName: () => '' }).includes('2026-10-01,"\'=HYPERLINK(""x"")",-3.50,,2026-10'));
});

test('import à colonnes débit/crédit : une ligne portant les deux montants est refusée', () => {
  const rows = [['Date', 'Libellé', 'Débit', 'Crédit'], ['01/10/2026', 'Correction ambiguë', '10,00', '20,00'], ['02/10/2026', 'Loyer', '100,00', '']];
  const r = C.buildTransactions(rows, { decimal: 'comma', dateFormat: 'dmy', hasHeader: true, map: { date: 0, label: 1, debit: 2, credit: 3 } });
  assert.equal(r.errorCount, 1);
  assert.deepEqual(r.errors, [{ line: 2, key: 'err.rowAmount' }]);
  assert.deepEqual(r.transactions.map((t) => t.cents), [-10000]);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { categories: cats, rules: [rule('rule-0001', 'cat-0001', 'keyword', 'loyer', 'out')], transactions: [{ date: '2026-10-01', label: 'LOYER', cents: -70000 }] };
  const back = C.validateData(JSON.parse(C.backup(data)));
  assert.deepEqual(back, data);
  const ok = { app: 'expenseclassifier', version: 1, ...data };
  assert.throws(() => C.validateData({ ...ok, app: 'pricelens' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, transactions: [{ date: '2026-02-30', label: 'x', cents: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, transactions: [{ date: '2026-02-03', label: 'x', cents: 1.5 }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, rules: [{ ...data.rules[0], categoryId: 'cat-9999' }] }), /err\.ruleCategory/);
  assert.throws(() => C.validateData({ ...ok, rules: [data.rules[0], data.rules[0]] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, categories: [cats[0], { id: 'cat-0005', name: 'LOGEMENT' }] }), /err\.catExists/);
  assert.throws(() => C.validateData({ ...ok, categories: [{ ...cats[0], color: 'red' }] }), /err\.backup/);
  assert.throws(() => C.validateData(null), /err\.backup/);
});

test('exemple : dans chaque langue, chaque règle de démonstration classe bien son libellé', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'messages.js'), 'utf8'), sandbox);
  const M = sandbox.window.LouvreMessages;
  const pairs = [['rent', 'keyword', 'out'], ['grocery', 'keyword', 'out'], ['fuel', 'pattern', 'out'], ['salary', 'keyword', 'in'], ['leisure', 'keyword', 'out']];
  for (const lang of Object.keys(M)) {
    const local = [C.makeCategory('x', 'cat-0100')];
    for (const [k, kind, sign] of pairs) {
      const r = C.makeRule({ categoryId: 'cat-0100', kind, value: M[lang][`sample.r.${k}`], sign }, 'rule-0100', local);
      assert.ok(C.ruleMatches(r, { label: M[lang][`sample.l.${k}`] + ' 05/10', cents: sign === 'in' ? 100 : -100 }), `${lang} ${k}`);
    }
    assert.ok(!pairs.some(([k, kind, sign]) => C.ruleMatches(C.makeRule({ categoryId: 'cat-0100', kind, value: M[lang][`sample.r.${k}`], sign: 'any' }, 'rule-0100', local), { label: M[lang]['sample.l.other'], cents: -1 })), `${lang} other`);
  }
});
