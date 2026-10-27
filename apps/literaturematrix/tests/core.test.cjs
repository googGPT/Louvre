// Tests métier de LiteratureMatrix : saisie validée, colonnes, cellules vides, filtres, tri, exports, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const nid = () => `paper-${String(++n).padStart(4, '0')}`;
const paper = (authors, year, cells = {}, extra = {}, custom = []) => C.makePaper({ authors, year: String(year), title: extra.title || '', journal: extra.journal || '', doi: extra.doi || '', cells }, nid(), custom);

test('un article valide est nettoyé ; les cellules vides ne sont pas stockées', () => {
  const p = paper('  Fama, E. F.; French, K. R. ', 1993, { question: ' Facteurs de risque ', method: '   ' }, { journal: 'Journal of Financial Economics', doi: 'https://doi.org/10.1016/0304-405X(93)90023-5' });
  assert.equal(p.authors, 'Fama, E. F.; French, K. R.');
  assert.equal(p.year, 1993);
  assert.equal(p.doi, '10.1016/0304-405X(93)90023-5');
  assert.deepEqual(p.cells, { question: 'Facteurs de risque' });
});

test('saisies refusées avec une clé d\'erreur traduisible', () => {
  assert.throws(() => paper(' ', 2020), /^Error: err\.authorsRequired$/);
  for (const y of ['20', '1499', '2101', '2020.5', 'abcd', '']) assert.throws(() => paper('A', y), /^Error: err\.year\|/);
  assert.throws(() => paper('A', 2020, {}, { doi: 'doi.org/abc' }), /err\.doi/);
  assert.throws(() => paper('A', 2020, { inconnue: 'x' }), /err\.unknownColumn/);
  assert.throws(() => paper('A', 2020, { results: 'x'.repeat(C.MAX_CELL + 1) }), /^Error: err\.tooLong\|\{"max":2000\}$/);
  assert.throws(() => C.makePaper({ authors: 'A', year: '2020' }, 'bad id'), /err\.id/);
});

test('citation courte : un, deux, trois auteurs et plus', () => {
  assert.equal(C.shortCite(paper('Fama, E. F.', 1970)), 'Fama (1970)');
  assert.equal(C.shortCite(paper('Eugene Fama; Kenneth French', 1993)), 'Fama & French (1993)');
  assert.equal(C.shortCite(paper('Jensen, M. and Meckling, W.', 1976)), 'Jensen & Meckling (1976)');
  assert.equal(C.shortCite(paper('Hou, K.; Xue, C.; Zhang, L.', 2015)), 'Hou et al. (2015)');
  assert.equal(C.shortCite(paper('مثال، أ.؛ نموذج، ب.', 2019)), 'مثال & نموذج (2019)'); // ponctuation arabe
});

test('colonnes personnalisées : ajout, doublon, limite, renommage, suppression des cellules', () => {
  let custom = C.addColumn([], 'Pays', 'c-pays-01');
  assert.throws(() => C.addColumn(custom, '  pays ', 'c-pays-02'), /err\.labelDuplicate/);
  assert.throws(() => C.addColumn(custom, ' ', 'c-vide-01'), /err\.labelRequired/);
  custom = C.addColumn(custom, 'Théorie', 'c-theo-01');
  assert.deepEqual(C.columnIds(custom), ['question', 'method', 'data', 'results', 'limits', 'c-pays-01', 'c-theo-01']);
  custom = C.renameColumn(custom, 'c-theo-01', 'Cadre théorique');
  assert.equal(custom[1].label, 'Cadre théorique');
  assert.throws(() => C.renameColumn(custom, 'c-theo-01', 'PAYS'), /err\.labelDuplicate/);
  const p = paper('A', 2020, { 'c-pays-01': 'France', question: 'Q' }, {}, custom);
  const after = C.removeColumn(custom, [p], 'c-pays-01');
  assert.equal(after.custom.length, 1);
  assert.deepEqual(after.papers[0].cells, { question: 'Q' });
  let many = [];
  for (let i = 0; i < C.MAX_CUSTOM; i += 1) many = C.addColumn(many, `Col ${i}`, `c-col-${String(i).padStart(4, '0')}`);
  assert.throws(() => C.addColumn(many, 'Une de trop', 'c-trop-01'), /^Error: err\.tooManyColumns\|\{"max":12\}$/);
});

test('cellules vides : comptage par colonne, par article et taux de complétude', () => {
  const a = paper('A', 2020, { question: 'q', method: 'm', data: 'd', results: 'r', limits: 'l' });
  const b = paper('B', 2021, { question: 'q', results: 'r' });
  const g = C.gaps([a, b], []);
  assert.equal(g.total, 10);
  assert.equal(g.empty, 3);
  assert.equal(g.completeness, 70);
  assert.deepEqual(g.perColumn, { question: 0, method: 1, data: 1, results: 0, limits: 1 });
  assert.deepEqual(g.perPaper, { [a.id]: 0, [b.id]: 3 });
  assert.equal(C.gaps([], []).completeness, 0);
});

test('filtres : texte sans accents, années, cellules vides', () => {
  const list = [
    paper('Ammari, A.', 2023, { method: 'Panel à effets fixes', data: 'S&P 500' }, { journal: 'Finance Research Letters' }),
    paper('Smith, J.', 2015, { method: 'Étude d\'événement', limits: 'Petit échantillon' }),
    paper('Dupont, M.', 2019, { question: 'ESG et coût du capital' }),
  ];
  const names = (r) => r.map((p) => p.authors);
  assert.deepEqual(names(C.filterPapers(list, [], { q: 'etude EVENEMENT' })), ['Smith, J.']);
  assert.deepEqual(names(C.filterPapers(list, [], { q: 'panel 500' })), ['Ammari, A.']);
  assert.deepEqual(names(C.filterPapers(list, [], { from: '2016', to: '2023' })), ['Ammari, A.', 'Dupont, M.']);
  assert.deepEqual(names(C.filterPapers(list, [], { gap: 'limits' })), ['Ammari, A.', 'Dupont, M.']);
  assert.equal(C.filterPapers(list, [], { gap: '*' }).length, 3);
  assert.throws(() => C.filterPapers(list, [], { from: '2020', to: '2010' }), /err\.yearRange/);
  assert.throws(() => C.filterPapers(list, [], { gap: 'nope' }), /err\.unknownColumn/);
});

test('tri : année, auteurs, colonne ; les cellules vides restent en bas dans les deux sens', () => {
  const list = [paper('Zeta', 2010, { method: 'B' }), paper('Alpha', 2020), paper('Mu', 2000, { method: 'A' })];
  assert.deepEqual(C.sortPapers(list, 'year').map((p) => p.year), [2000, 2010, 2020]);
  assert.deepEqual(C.sortPapers(list, 'year', 'desc').map((p) => p.year), [2020, 2010, 2000]);
  assert.deepEqual(C.sortPapers(list, 'authors').map((p) => p.authors), ['Alpha', 'Mu', 'Zeta']);
  assert.deepEqual(C.sortPapers(list, 'method').map((p) => p.authors), ['Mu', 'Zeta', 'Alpha']);
  assert.deepEqual(C.sortPapers(list, 'method', 'desc').map((p) => p.authors), ['Zeta', 'Mu', 'Alpha']);
  const fr = (a, b) => a.localeCompare(b, 'fr');
  assert.deepEqual(C.sortPapers([paper('Élise', 2001), paper('Eric', 2001), paper('Zoé', 2001)], 'authors', 'asc', fr).map((p) => p.authors), ['Élise', 'Eric', 'Zoé']);
});

test('export CSV : en-têtes fournis, guillemets, retours à la ligne, protection des formules', () => {
  const p = paper('Doe, J.; Roe, R.', 2022, { question: 'Effet "taille", ou pas ?', results: '=SOMME(A1)\nsecond', limits: '-0,3' });
  const headers = ['Authors', 'Year', 'Title', 'Journal', 'DOI', 'Q', 'M', 'D', 'R', 'L'];
  const csv = C.toCSV([p], [], headers);
  assert.equal(csv, 'Authors,Year,Title,Journal,DOI,Q,M,D,R,L\r\n"Doe, J.; Roe, R.",2022,,,,"Effet ""taille"", ou pas ?",,,"\'=SOMME(A1)\nsecond","\'-0,3"\r\n');
  assert.ok(C.toCSV([p], [], headers, ';').startsWith('Authors;Year;'));
  assert.throws(() => C.toCSV([p], [], headers.slice(1)), /err\.headers/);
  assert.throws(() => C.toCSV([p], [], headers, '|'), /err\.sep/);
});

test('export Markdown : tableau, barres verticales échappées, retours à la ligne en <br>', () => {
  const p = paper('A | B', 2020, { question: 'ligne 1\nligne 2' });
  const md = C.toMarkdown([p], [], ['Au', 'Y', 'T', 'J', 'DOI', 'Q', 'M', 'D', 'R', 'L'], 'Revue');
  assert.equal(md, '# Revue\n\n| Au | Y | T | J | DOI | Q | M | D | R | L |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| A \\| B | 2020 |  |  |  | ligne 1<br>ligne 2 |  |  |  |  |\n');
});

test('doublons probables : même DOI ou mêmes auteurs, année et titre', () => {
  const a = paper('Fama, E.', 1970, {}, { title: 'Efficient Capital Markets', doi: '10.2307/2325486' });
  assert.ok(C.findDuplicate([a], paper('Autre', 1999, {}, { doi: '10.2307/2325486' })));
  assert.ok(C.findDuplicate([a], paper('fama, e.', 1970, {}, { title: 'efficient capital markets' })));
  assert.equal(C.findDuplicate([a], paper('Fama, E.', 1971, {}, { title: 'Efficient Capital Markets' })), null);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const custom = C.addColumn([], 'Pays', 'c-pays-01');
  const papers = [paper('A', 2020, { question: 'Q', 'c-pays-01': 'FR' }, { doi: '10.1000/xyz' }, custom), paper('B', 2021, {}, {}, custom)];
  const back = C.validateBackup(JSON.parse(C.backup(custom, papers)));
  assert.deepEqual(back, { custom, papers });
  const ok = { app: 'literaturematrix', version: 1, columns: custom, papers };
  assert.throws(() => C.validateBackup({ ...ok, app: 'pricelens' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, papers: [{ ...papers[0], year: '2020' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, papers: [{ ...papers[0], cells: { question: 5 } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, papers: [{ ...papers[0], cells: { 'c-autre-01': 'x' } }] }), /err\.unknownColumn/);
  assert.throws(() => C.validateBackup({ ...ok, papers: [papers[0], papers[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, columns: [custom[0], custom[0]] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, papers: [{ ...papers[0], hack: true }] }), /err\.backup/);
  assert.throws(() => C.validateBackup([]), /err\.backup/);
});
