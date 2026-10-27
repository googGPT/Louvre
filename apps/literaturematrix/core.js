/* LiteratureMatrix — logique pure : matrice de revue de littérature (articles × colonnes d'analyse).
   Validation stricte des saisies, filtres, tri, repérage des cellules vides, exports CSV et Markdown, sauvegarde. */
(function (root) {
  'use strict';

  const VERSION = 1;
  // Colonnes d'analyse fixes (libellés traduits par l'interface) ; l'utilisateur peut en ajouter d'autres.
  const BUILTIN = Object.freeze(['question', 'method', 'data', 'results', 'limits']);
  const MAX_PAPERS = 500, MAX_CUSTOM = 12, MAX_CELL = 2000, MAX_AUTHORS = 300, MAX_TITLE = 300, MAX_JOURNAL = 200, MAX_LABEL = 40;
  const MIN_YEAR = 1500, MAX_YEAR = 2100;
  const ID = /^[a-z0-9-]{6,64}$/i;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');

  // Texte comparable : minuscules, sans accents ni espaces superflus (recherche et tri des doublons).
  function fold(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  function text(v, max, errKey, required) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(errKey);
    const s = v.replace(/\r\n?/g, '\n').trim();
    if (required && !s) fail(errKey + 'Required');
    if (s.length > max) fail('err.tooLong', { max });
    return s;
  }
  function parseYear(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{4}$/.test(s)) fail('err.year', { min: MIN_YEAR, max: MAX_YEAR });
    const y = Number(s);
    if (y < MIN_YEAR || y > MAX_YEAR) fail('err.year', { min: MIN_YEAR, max: MAX_YEAR });
    return y;
  }
  // DOI facultatif : « 10.xxxx/… » ; on accepte une adresse doi.org collée et on la réduit au DOI.
  function parseDoi(v) {
    let s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) return '';
    s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    if (!/^10\.\d{4,9}\/\S{1,200}$/.test(s)) fail('err.doi');
    return s;
  }

  // --- Colonnes personnalisées
  function makeColumn(label, id) {
    if (typeof id !== 'string' || !/^c-[a-z0-9-]{4,60}$/i.test(id)) fail('err.id');
    return { id, label: text(label, MAX_LABEL, 'err.label', true) };
  }
  function addColumn(custom, label, id) {
    if (custom.length >= MAX_CUSTOM) fail('err.tooManyColumns', { max: MAX_CUSTOM });
    const col = makeColumn(label, id);
    if (custom.some((c) => fold(c.label) === fold(col.label))) fail('err.labelDuplicate');
    return [...custom, col];
  }
  function renameColumn(custom, id, label) {
    const col = makeColumn(label, id);
    if (!custom.some((c) => c.id === id)) fail('err.id');
    if (custom.some((c) => c.id !== id && fold(c.label) === fold(col.label))) fail('err.labelDuplicate');
    return custom.map((c) => (c.id === id ? col : c));
  }
  // Supprimer une colonne efface aussi ses cellules dans chaque article.
  function removeColumn(custom, papers, id) {
    return {
      custom: custom.filter((c) => c.id !== id),
      papers: papers.map((p) => { const cells = { ...p.cells }; delete cells[id]; return { ...p, cells }; }),
    };
  }
  const columnIds = (custom) => [...BUILTIN, ...custom.map((c) => c.id)];

  // --- Articles
  function makePaper(input, id, custom) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (!isObj(input)) fail('err.backup');
    const ids = columnIds(custom);
    const cells = {};
    const given = isObj(input.cells) ? input.cells : {};
    for (const k of Object.keys(given)) if (!ids.includes(k)) fail('err.unknownColumn');
    for (const k of ids) {
      const v = text(given[k], MAX_CELL, 'err.cell', false);
      if (v) cells[k] = v; // seules les cellules remplies sont stockées
    }
    return {
      id,
      authors: text(input.authors, MAX_AUTHORS, 'err.authors', true),
      year: parseYear(input.year),
      title: text(input.title, MAX_TITLE, 'err.title', false),
      journal: text(input.journal, MAX_JOURNAL, 'err.journal', false),
      doi: parseDoi(input.doi),
      cells,
    };
  }
  // Doublon probable : même DOI, ou mêmes premiers auteurs, année et titre.
  function findDuplicate(papers, paper) {
    return papers.find((p) => p.id !== paper.id && ((paper.doi && fold(p.doi) === fold(paper.doi)) ||
      (p.year === paper.year && fold(p.authors) === fold(paper.authors) && fold(p.title) === fold(paper.title)))) || null;
  }

  // Nom court pour une citation : « Fama (1970) », « Fama & French (1993) », « Fama et al. (2015) ».
  function surname(author) {
    const a = author.trim();
    if (/[,،]/.test(a)) return a.split(/[,،]/)[0].trim(); // virgule latine ou arabe
    const parts = a.split(/\s+/);
    return parts[parts.length - 1];
  }
  function shortCite(paper) {
    const list = paper.authors.split(/[;؛]|\s+&\s+|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    const names = list.map(surname);
    const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} et al.`;
    return `${who} (${paper.year})`;
  }

  // --- Cellules vides
  function isEmpty(paper, colId) { return !(paper.cells[colId] && paper.cells[colId].trim()); }
  function gaps(papers, custom) {
    const ids = columnIds(custom);
    const perColumn = Object.fromEntries(ids.map((k) => [k, 0]));
    let empty = 0;
    const perPaper = {};
    for (const p of papers) {
      let n = 0;
      for (const k of ids) if (isEmpty(p, k)) { perColumn[k] += 1; n += 1; }
      perPaper[p.id] = n; empty += n;
    }
    const total = papers.length * ids.length;
    return { total, empty, filled: total - empty, completeness: total ? Math.round(1000 * (total - empty) / total) / 10 : 0, perColumn, perPaper };
  }

  // --- Filtres : texte (sans accents), années, cellules vides ('*' = au moins une ; sinon l'identifiant de colonne).
  function filterPapers(papers, custom, f = {}) {
    const q = f.q ? fold(f.q) : '';
    const words = q ? q.split(' ') : [];
    const from = f.from ? parseYear(f.from) : null, to = f.to ? parseYear(f.to) : null;
    if (from !== null && to !== null && from > to) fail('err.yearRange');
    const ids = columnIds(custom);
    if (f.gap && f.gap !== '*' && !ids.includes(f.gap)) fail('err.unknownColumn');
    return papers.filter((p) => {
      if (from !== null && p.year < from) return false;
      if (to !== null && p.year > to) return false;
      if (f.gap === '*' && !ids.some((k) => isEmpty(p, k))) return false;
      if (f.gap && f.gap !== '*' && !isEmpty(p, f.gap)) return false;
      if (words.length) {
        const hay = fold([p.authors, p.year, p.title, p.journal, p.doi, ...Object.values(p.cells)].join(' '));
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }

  // --- Tri : par champ bibliographique ou par colonne ; les cellules vides restent toujours en bas.
  const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function sortPapers(papers, key, dir = 'asc', compare = defaultCompare) {
    const sign = dir === 'desc' ? -1 : 1;
    const value = (p) => (key === 'year' ? p.year : key === 'authors' || key === 'title' || key === 'journal' ? p[key] : (p.cells[key] || ''));
    return [...papers].sort((a, b) => {
      const va = value(a), vb = value(b);
      const ea = va === '', eb = vb === '';
      if (ea !== eb) return ea ? 1 : -1;
      const c = key === 'year' ? va - vb : compare(String(va), String(vb));
      return sign * c || compare(a.authors, b.authors) || a.year - b.year;
    });
  }

  // --- Exports. Les en-têtes sont fournis par l'interface (traduits).
  // CSV (RFC 4180) : guillemets doublés ; un « ' » neutralise les débuts de formule (=, +, -, @) pour les tableurs.
  function csvCell(v) {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function rowsFor(papers, custom) {
    const ids = columnIds(custom);
    return papers.map((p) => [p.authors, String(p.year), p.title, p.journal, p.doi, ...ids.map((k) => p.cells[k] || '')]);
  }
  function toCSV(papers, custom, headers, sep = ',') {
    if (sep !== ',' && sep !== ';') fail('err.sep');
    if (!Array.isArray(headers) || headers.length !== 5 + columnIds(custom).length) fail('err.headers');
    return [headers, ...rowsFor(papers, custom)].map((r) => r.map(csvCell).join(sep)).join('\r\n') + '\r\n';
  }
  function mdCell(v) { return String(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>'); }
  function toMarkdown(papers, custom, headers, title) {
    if (!Array.isArray(headers) || headers.length !== 5 + columnIds(custom).length) fail('err.headers');
    const lines = [];
    if (title) lines.push(`# ${mdCell(title)}`, '');
    lines.push(`| ${headers.map(mdCell).join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`);
    for (const r of rowsFor(papers, custom)) lines.push(`| ${r.map(mdCell).join(' | ')} |`);
    return lines.join('\n') + '\n';
  }

  // --- Sauvegarde : { app, version, columns: [colonnes personnalisées], papers }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'literaturematrix' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'columns', 'papers']) || !Array.isArray(data.columns) || !Array.isArray(data.papers)) fail('err.backup');
    if (data.columns.length > MAX_CUSTOM) fail('err.tooManyColumns', { max: MAX_CUSTOM });
    if (data.papers.length > MAX_PAPERS) fail('err.tooMany', { max: MAX_PAPERS });
    let custom = [];
    for (const c of data.columns) {
      if (!isObj(c) || !keysAre(c, ['id', 'label'])) fail('err.backup');
      if (custom.some((x) => x.id === c.id)) fail('err.backup');
      custom = addColumn(custom, c.label, c.id);
    }
    const papers = data.papers.map((p) => {
      if (!isObj(p) || !keysAre(p, ['id', 'authors', 'year', 'title', 'journal', 'doi', 'cells']) || !Number.isInteger(p.year) || !isObj(p.cells)) fail('err.backup');
      for (const v of Object.values(p.cells)) if (typeof v !== 'string') fail('err.backup');
      return makePaper(p, p.id, custom);
    });
    if (new Set(papers.map((p) => p.id)).size !== papers.length) fail('err.backup');
    return { custom, papers };
  }
  function backup(custom, papers) {
    const data = { app: 'literaturematrix', version: VERSION, columns: custom, papers };
    const ok = validateBackup(JSON.parse(JSON.stringify(data)));
    return JSON.stringify({ app: 'literaturematrix', version: VERSION, columns: ok.custom, papers: ok.papers }, null, 2);
  }

  root.LitCore = Object.freeze({
    VERSION, BUILTIN, MAX_PAPERS, MAX_CUSTOM, MAX_CELL, fold, parseYear, parseDoi, makeColumn, addColumn, renameColumn, removeColumn, columnIds,
    makePaper, findDuplicate, shortCite, isEmpty, gaps, filterPapers, sortPapers, csvCell, toCSV, toMarkdown, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.LitCore;
})(typeof window === 'undefined' ? globalThis : window);
