/* LiteratureMatrix — interface. Calculs et validations dans core.js (LitCore) ; textes dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.LitCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-literaturematrix-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = (p = '') => p + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const cmp = (a, b) => a.localeCompare(b, L.locale, { sensitivity: 'base', numeric: true }); // tri selon la langue affichée

  let custom = []; // colonnes personnalisées
  let papers = []; // articles
  let readOnly = false; // stockage illisible : aucune écriture
  let editing = null; // identifiant de l'article en cours de modification
  let sort = { key: 'year', dir: 'asc' };

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const colLabel = (id) => (C.BUILTIN.includes(id) ? t('col.' + id) : (custom.find((c) => c.id === id) || {}).label || id);

  function save(nextCustom, nextPapers) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(nextCustom, nextPapers)); custom = nextCustom; papers = nextPapers; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // --- Champs du formulaire : une zone de texte par colonne ; la saisie est conservée lors d'un nouveau rendu.
  function renderCellFields() {
    const box = $('cell-fields');
    const old = {};
    box.querySelectorAll('textarea[data-col]').forEach((ta) => { old[ta.dataset.col] = ta.value; });
    box.replaceChildren(...C.columnIds(custom).map((id) => {
      const lab = el('label', 'field'), span = el('span', '', colLabel(id)), ta = el('textarea');
      ta.dataset.col = id; ta.maxLength = C.MAX_CELL; ta.rows = 2; ta.value = old[id] || '';
      if (C.BUILTIN.includes(id)) ta.placeholder = t('ph.' + id);
      lab.append(span, ta); return lab;
    }));
  }
  function readForm() {
    const f = $('paper-form'), cells = {};
    f.querySelectorAll('textarea[data-col]').forEach((ta) => { cells[ta.dataset.col] = ta.value; });
    return { authors: f.authors.value, year: f.year.value, title: f.title.value, journal: f.journal.value, doi: f.doi.value, cells };
  }
  function clearForm() {
    const f = $('paper-form');
    for (const n of ['authors', 'year', 'title', 'journal', 'doi']) f[n].value = '';
    f.querySelectorAll('textarea[data-col]').forEach((ta) => { ta.value = ''; });
    editing = null; renderFormMode();
  }
  function renderFormMode() {
    $('h-form').textContent = t(editing ? 'form.editTitle' : 'form.title');
    $('save-paper').textContent = t(editing ? 'btn.update' : 'btn.add');
    $('cancel-edit').hidden = !editing;
  }

  // --- Colonnes
  function renderColumns() {
    const items = C.columnIds(custom).map((id) => {
      const li = el('li'), name = el('span', 'name', colLabel(id));
      li.append(name);
      if (C.BUILTIN.includes(id)) { li.append(el('span', 'tag', t('cols.base'))); return li; }
      const acts = el('div', 'acts');
      const mk = (label, aria, fn) => { const b = el('button', 'btn small', label); b.type = 'button'; b.setAttribute('aria-label', t(aria, { name: colLabel(id) })); b.addEventListener('click', fn); acts.append(b); };
      mk(t('btn.rename'), 'aria.renameCol', () => renameCol(id));
      mk(t('btn.delete'), 'aria.deleteCol', () => deleteCol(id));
      li.append(acts); return li;
    });
    $('cols').replaceChildren(...items);
    $('add-col').disabled = custom.length >= C.MAX_CUSTOM;
  }
  function renameCol(id) {
    const cur = custom.find((c) => c.id === id); if (!cur) return;
    const label = prompt(t('prompt.renameCol'), cur.label);
    if (label === null) return;
    try { if (save(C.renameColumn(custom, id, label), papers)) { render(); say('col-status', t('cols.renamed'), 'ok'); } }
    catch (e) { say('col-status', L.error(e), 'error'); }
  }
  function deleteCol(id) {
    const filled = papers.filter((p) => !C.isEmpty(p, id)).length;
    if (!confirm(t('confirm.deleteCol', { name: colLabel(id), n: filled }))) return;
    const next = C.removeColumn(custom, papers, id);
    if (save(next.custom, next.papers)) { if (sort.key === id) sort = { key: 'year', dir: 'asc' }; render(); say('col-status', t('cols.deleted'), 'ok'); }
  }
  $('col-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const next = C.addColumn(custom, $('col-label').value, newId('c-'));
      if (save(next, papers)) { $('col-label').value = ''; render(); say('col-status', t('cols.added', { name: next[next.length - 1].label }), 'ok'); }
    } catch (err) { say('col-status', L.error(err), 'error'); }
  });

  // --- Matrice
  function currentFilter() { return { q: $('flt-q').value, from: $('flt-from').value.trim(), to: $('flt-to').value.trim(), gap: $('flt-gap').value }; }
  function visiblePapers() {
    let list;
    try { list = C.filterPapers(papers, custom, currentFilter()); say('filter-status', ''); }
    catch (e) { say('filter-status', L.error(e), 'error'); list = C.filterPapers(papers, custom, { q: $('flt-q').value, gap: $('flt-gap').value }); }
    return C.sortPapers(list, sort.key, sort.dir, cmp);
  }
  function renderGapSelect() {
    const sel = $('flt-gap'), cur = sel.value, g = C.gaps(papers, custom);
    const opts = [['', t('flt.gapAll')], ['*', t('flt.gapAny')], ...C.columnIds(custom).map((id) => [id, t('flt.gapIn', { name: colLabel(id), n: g.perColumn[id] })])];
    sel.replaceChildren(...opts.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    sel.value = opts.some(([v]) => v === cur) ? cur : '';
  }
  function sortButton(key, label) {
    const th = el('th'), b = el('button', 'sort', label);
    b.type = 'button';
    const on = sort.key === key;
    th.setAttribute('aria-sort', on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    if (on) b.append(el('span', 'arrow', sort.dir === 'asc' ? ' ▲' : ' ▼'));
    b.setAttribute('aria-label', t('aria.sort', { name: label }));
    b.addEventListener('click', () => { sort = on ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }; renderMatrix(); });
    th.append(b); return th;
  }
  function renderMatrix() {
    const g = C.gaps(papers, custom);
    $('k-papers').textContent = L.number(papers.length);
    $('k-empty').textContent = L.number(g.empty);
    $('k-complete').textContent = papers.length ? `${L.number(g.completeness)} %` : '—';
    const table = $('matrix');
    if (!papers.length) { table.replaceChildren(); $('matrix-scroll').replaceChildren(table, el('p', 'empty', t('matrix.empty'))); return; }
    $('matrix-scroll').replaceChildren(table);
    const list = visiblePapers();
    const ids = C.columnIds(custom);
    const head = el('tr');
    head.append(sortButton('authors', t('th.reference')), sortButton('year', t('f.year')), ...ids.map((id) => sortButton(id, colLabel(id))), el('th', '', ''));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const p of list) {
      const tr = el('tr');
      const ref = el('td', 'ref'), cite = el('b', '', C.shortCite(p));
      ref.append(cite);
      if (p.title) ref.append(el('span', 'ttl', p.title));
      if (p.journal) ref.append(el('span', 'jr', p.journal));
      if (p.doi) { const d = el('span', 'doi', 'DOI ' + p.doi); d.dir = 'ltr'; ref.append(d); }
      tr.append(ref, el('td', 'num', p.year));
      for (const id of ids) {
        if (C.isEmpty(p, id)) { const td = el('td', 'gap'); td.append(el('span', 'gap-tag', t('cell.empty'))); tr.append(td); }
        else tr.append(el('td', 'cell', p.cells[id]));
      }
      const acts = el('td', 'acts');
      const mk = (label, aria, fn) => { const b = el('button', 'btn small', label); b.type = 'button'; b.setAttribute('aria-label', t(aria, { name: C.shortCite(p) })); b.addEventListener('click', fn); acts.append(b); };
      mk(t('btn.edit'), 'aria.edit', () => startEdit(p.id));
      mk(t('btn.delete'), 'aria.delete', () => removePaper(p.id));
      tr.append(acts); tbody.append(tr);
    }
    if (!list.length) { const tr = el('tr'), td = el('td', 'empty', t('matrix.noMatch')); td.colSpan = ids.length + 3; tr.append(td); tbody.append(tr); }
    table.replaceChildren(thead, tbody);
    if (!$('filter-status').classList.contains('error')) say('filter-status', list.length === papers.length ? '' : t('flt.shown', { n: list.length, total: papers.length }));
  }
  function render() { renderCellFields(); renderFormMode(); renderColumns(); renderGapSelect(); renderMatrix(); }

  function startEdit(id) {
    const p = papers.find((x) => x.id === id); if (!p) return;
    const f = $('paper-form');
    editing = id; renderFormMode();
    f.authors.value = p.authors; f.year.value = String(p.year); f.title.value = p.title; f.journal.value = p.journal; f.doi.value = p.doi;
    f.querySelectorAll('textarea[data-col]').forEach((ta) => { ta.value = p.cells[ta.dataset.col] || ''; });
    f.authors.focus();
    say('form-status', t('form.editing', { name: C.shortCite(p) }));
  }
  function removePaper(id) {
    const p = papers.find((x) => x.id === id); if (!p || !confirm(t('confirm.delete', { name: C.shortCite(p) }))) return;
    if (save(custom, papers.filter((x) => x.id !== id))) { if (editing === id) clearForm(); render(); say('form-status', t('form.deleted', { name: C.shortCite(p) }), 'ok'); }
  }

  $('paper-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!editing && papers.length >= C.MAX_PAPERS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_PAPERS })}`);
      const p = C.makePaper(readForm(), editing || newId(), custom);
      const dup = C.findDuplicate(papers, p);
      if (dup && !confirm(t('confirm.duplicate', { name: C.shortCite(dup) }))) return;
      const next = editing ? papers.map((x) => (x.id === editing ? p : x)) : [...papers, p];
      const wasEditing = !!editing;
      if (!save(custom, next)) return;
      clearForm(); render();
      say('form-status', t(wasEditing ? 'form.updated' : 'form.added', { name: C.shortCite(p) }), 'ok');
      $('paper-form').authors.focus();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('cancel-edit').addEventListener('click', () => { clearForm(); say('form-status', ''); });

  // Exemple : trois articles FICTIFS (signalés comme tels), rédigés dans la langue affichée, avec des cellules vides.
  $('sample').addEventListener('click', () => {
    try {
      if (papers.length + 3 > C.MAX_PAPERS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_PAPERS })}`);
      const j = t('sample.journal');
      const samples = [
        { authors: t('sample.a1'), year: '2019', title: t('sample.t1'), journal: j, cells: { question: t('sample.q1'), method: t('sample.m1'), data: t('sample.d1'), results: t('sample.r1'), limits: t('sample.l1') } },
        { authors: t('sample.a2'), year: '2022', title: t('sample.t2'), journal: j, cells: { question: t('sample.q2'), method: t('sample.m2'), results: t('sample.r2') } },
        { authors: t('sample.a3'), year: '2024', title: t('sample.t3'), journal: j, cells: { question: t('sample.q3'), data: t('sample.d3') } },
      ].map((s) => C.makePaper(s, newId(), custom));
      if (save(custom, [...papers, ...samples])) { render(); say('form-status', t('form.sampleAdded'), 'ok'); }
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  for (const id of ['flt-q', 'flt-from', 'flt-to']) $(id).addEventListener('input', renderMatrix);
  $('flt-gap').addEventListener('change', renderMatrix);

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const headers = () => [t('f.authors'), t('f.year'), t('f.title'), t('f.journal'), t('th.doi'), ...C.columnIds(custom).map(colLabel)];
  $('export-csv').addEventListener('click', () => {
    const list = visiblePapers();
    if (!list.length) { say('backup-status', t('export.none'), 'error'); return; }
    try { download('literature-matrix.csv', '\uFEFF' + C.toCSV(list, custom, headers(), $('csv-sep').value), 'text/csv;charset=utf-8'); say('backup-status', t('export.csvDone', { n: list.length }), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export-md').addEventListener('click', () => {
    const list = visiblePapers();
    if (!list.length) { say('backup-status', t('export.none'), 'error'); return; }
    try { download('literature-matrix.md', C.toMarkdown(list, custom, headers(), t('md.title')), 'text/markdown;charset=utf-8'); say('backup-status', t('export.mdDone', { n: list.length }), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('literaturematrix-backup.json', C.backup(custom, papers), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: papers.length, b: next.papers.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next.custom, next.papers)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true; clearForm(); render();
      say('backup-status', t('backup.restored', { n: next.papers.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('literaturematrix-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = C.validateBackup(JSON.parse(raw)); custom = d.custom; papers = d.papers; }
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { say('form-status', ''); say('col-status', ''); say('backup-status', ''); render(); }); // nouvelle langue : on réaffiche sans perdre la saisie
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
