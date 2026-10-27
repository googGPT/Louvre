/* DescriptiveStats — interface. Calculs dans core.js (StatsCore) ; textes et formats de nombres dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.StatsCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-descriptivestats-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => 's-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  // Séparateur décimal habituel de la langue affichée (l'arabe utilise ici les chiffres latins et le point).
  const langDecimal = () => (['en', 'ar'].includes(L.lang) ? '.' : ',');
  const STATS = ['n', 'missing', 'mean', 'median', 'sdSample', 'sdPop', 'varSample', 'varPop', 'min', 'max', 'range', 'q1', 'q3', 'iqr', 'skewness', 'kurtosis', 'sem', 'sum'];

  let settings = { ...C.DEFAULT_SETTINGS, decimal: langDecimal() };
  let series = []; // séries enregistrées
  let readOnly = false;
  let csv = null; // dernier CSV importé (pour choisir la colonne)
  let current = null; // { parsed, stats } de la saisie en cours

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(nextSettings, nextSeries, quiet) {
    if (readOnly) { if (!quiet) say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(nextSettings, nextSeries)); settings = nextSettings; series = nextSeries; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Réglage modifié : appliqué tout de suite, enregistré si possible (en mode protégé, rien n'est écrit).
  function setSetting(key, value) {
    const next = { ...settings, [key]: value };
    if (!save(next, series, true)) settings = next;
    compute();
  }
  const fmt = (v) => L.number(v, { maximumFractionDigits: settings.digits });

  // --- Analyse de la saisie en cours
  function compute() {
    let parsed;
    try { parsed = C.parseSeries($('values').value, settings.decimal); }
    catch (e) { current = null; say('parse-status', L.error(e), 'error'); renderResults(); return; }
    const parts = [];
    if (parsed.values.length || parsed.missing || parsed.invalid.length) parts.push(t('parse.read', { n: parsed.values.length }));
    if (parsed.missing) parts.push(t('parse.missing', { n: parsed.missing }));
    if (parsed.invalid.length) {
      const list = parsed.invalid.slice(0, 5).map((x) => t('parse.line', { token: x.token, line: x.line })).join(', ') + (parsed.invalid.length > 5 ? ` ${t('parse.more', { n: parsed.invalid.length - 5 })}` : '');
      parts.push(t('parse.invalid', { n: parsed.invalid.length, list }));
    }
    say('parse-status', parts.join(' '), parsed.invalid.length ? 'error' : '');
    current = { parsed, stats: parsed.values.length ? C.describe(parsed.values, settings.method) : null };
    renderResults();
  }

  function renderResults() {
    const box = $('results');
    $('method-help').textContent = t('methodhelp.' + settings.method);
    if (!current || !current.stats) {
      box.replaceChildren(el('p', 'empty', t('results.empty')));
      $('hist').replaceChildren(el('p', 'empty', t('hist.none')));
      return;
    }
    const s = { ...current.stats, missing: current.parsed.missing };
    const table = el('table', 'stats'), thead = el('thead'), hr = el('tr');
    hr.append(el('th', '', t('th.stat')), el('th', 'num', t('th.value')));
    thead.append(hr);
    const tbody = el('tbody');
    for (const k of STATS) {
      const tr = el('tr'), v = s[k];
      tr.dataset.stat = k;
      const label = k === 'q1' || k === 'q3' || k === 'iqr' ? `${t('stat.' + k)} (${t('method.short.' + settings.method)})` : t('stat.' + k);
      const td = el('td', 'num', v === null ? '—' : k === 'n' || k === 'missing' ? L.number(v) : fmt(v));
      if (v === null) td.title = t('na.reason');
      tr.append(el('th', '', label), td);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.replaceChildren(table);
    renderHistogram();
  }
  function histSVG() {
    const vals = current.parsed.values, name = $('series-name').value.trim();
    return C.histogramSVG(C.histogram(vals, settings.bins), {
      fmt: (x) => L.number(x, { maximumFractionDigits: 2 }), title: name || t('hist.title'), label: t('hist.aria', { n: vals.length }), xLabel: t('hist.x'),
    });
  }
  function renderHistogram() { $('hist').innerHTML = histSVG(); } // SVG construit par le moteur : tous les textes y sont échappés

  // --- Menus traduits
  function renderSelects() {
    const keep = (sel, opts, value) => { sel.replaceChildren(...opts.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; })); sel.value = value; };
    keep($('method'), C.METHODS.map((m) => [m, t('method.' + m)]), settings.method);
    keep($('bins'), C.BIN_RULES.map((b) => [b, /^\d+$/.test(b) ? t('bins.n', { n: b }) : t('bins.' + b)]), settings.bins);
    $('decimal').value = settings.decimal;
    $('digits').value = String(settings.digits);
    if (csv && csv.columns.length > 1) keep($('column'), csv.columns.map((_, k) => [String(k), csv.headers[k] || t('col.n', { n: k + 1 })]), $('column').value || '0');
  }
  function renderSaved() {
    $('saved').replaceChildren(...(series.length ? series.map((s) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', s.name), el('span', '', t('saved.count', { n: s.items.filter((v) => v !== null).length })));
      const acts = el('div', 'acts');
      const mk = (label, aria, fn) => { const b = el('button', 'btn', label); b.type = 'button'; b.setAttribute('aria-label', t(aria, { name: s.name })); b.addEventListener('click', fn); acts.append(b); };
      mk(t('btn.load'), 'aria.load', () => loadSeries(s));
      mk(t('btn.delete'), 'aria.delete', () => deleteSeries(s));
      li.append(txt, acts); return li;
    }) : [el('li', 'empty', t('saved.none'))]));
  }
  function render() { renderSelects(); renderSaved(); compute(); }

  // --- Saisie
  let timer = null;
  $('values').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(compute, 150); });
  $('series-name').addEventListener('input', () => { if (current && current.stats) renderHistogram(); });
  $('decimal').addEventListener('change', (e) => setSetting('decimal', e.target.value));
  $('method').addEventListener('change', (e) => setSetting('method', e.target.value));
  $('bins').addEventListener('change', (e) => setSetting('bins', e.target.value));
  $('digits').addEventListener('change', (e) => setSetting('digits', Number(e.target.value)));

  function fillFromColumn(k) {
    $('values').value = csv.columns[k].map((c) => (c === '' ? 'NA' : c)).join('\n'); // cellule vide du CSV = valeur manquante
    if (csv.headers[k]) $('series-name').value = csv.headers[k];
    compute();
  }
  $('csv-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('err.fileBig');
      const parsed = C.parseCSV(await file.text(), settings.decimal);
      if (!parsed.columns.length || !parsed.columns.some((c) => c.length)) throw new Error('err.csvEmpty');
      csv = parsed;
      // Colonne proposée : la première qui contient au moins un nombre lisible.
      const first = Math.max(0, csv.columns.findIndex((col) => col.some((c) => C.parseNumber(c, settings.decimal) !== null)));
      $('column-field').hidden = csv.columns.length < 2;
      renderSelects(); $('column').value = String(first);
      if (!csv.headers[first]) $('series-name').value = file.name.replace(/\.[^.]+$/, '').slice(0, 80);
      fillFromColumn(first);
      say('data-status', t('csv.loaded', { name: file.name, n: csv.columns.length }), 'ok');
    } catch (e) { say('data-status', L.error(e), 'error'); }
  });
  $('column').addEventListener('change', (e) => { if (csv) fillFromColumn(Number(e.target.value)); });

  // Exemple : 24 rendements mensuels fictifs (en %), dont une valeur manquante, écrits avec le séparateur choisi.
  $('sample').addEventListener('click', () => {
    const raw = [1.2, -0.8, 2.5, 0.4, -1.9, 3.1, 0.7, -0.3, 1.8, -2.6, 0.9, 1.4, 4.2, -0.5, 0, 2.2, -1.1, 1.6, 0.3, -3.4, 2.8, 1.1, null, 0.6];
    $('values').value = C.seriesText(raw, settings.decimal);
    $('series-name').value = t('sample.name');
    csv = null; $('column-field').hidden = true;
    compute();
    say('data-status', t('sample.added'), 'ok');
  });
  $('clear').addEventListener('click', () => { $('values').value = ''; $('series-name').value = ''; csv = null; $('column-field').hidden = true; compute(); say('data-status', t('data.cleared')); $('values').focus(); });

  // --- Séries enregistrées
  $('save-series').addEventListener('click', () => {
    try {
      if (!current || !current.stats) throw new Error('err.noData');
      if (series.length >= C.MAX_SERIES) throw new Error(`err.tooManySeries|${JSON.stringify({ max: C.MAX_SERIES })}`);
      const s = C.makeSeries($('series-name').value.trim() || t('series.unnamed', { n: series.length + 1 }), current.parsed.items, newId());
      if (save(settings, [...series, s])) { renderSaved(); say('data-status', t('data.saved', { name: s.name }), 'ok'); }
    } catch (e) { say('data-status', L.error(e), 'error'); }
  });
  function loadSeries(s) {
    $('values').value = C.seriesText(s.items, settings.decimal);
    $('series-name').value = s.name;
    csv = null; $('column-field').hidden = true;
    compute(); say('data-status', t('data.loaded', { name: s.name }), 'ok');
  }
  function deleteSeries(s) {
    if (!confirm(t('confirm.delete', { name: s.name }))) return;
    if (save(settings, series.filter((x) => x.id !== s.id))) { renderSaved(); say('backup-status', t('data.deleted'), 'ok'); }
  }

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    if (!current || !current.stats) { say('results-status', t('err.noData'), 'error'); return; }
    const s = { ...current.stats, missing: current.parsed.missing };
    const rows = STATS.map((k) => [k === 'q1' || k === 'q3' || k === 'iqr' ? `${t('stat.' + k)} (${t('method.short.' + settings.method)})` : t('stat.' + k), s[k]]);
    download('descriptive-stats.csv', '\uFEFF' + C.resultsCSV([t('th.stat'), t('th.value')], rows, settings.decimal), 'text/csv;charset=utf-8');
    say('results-status', t('results.done'), 'ok');
  });
  $('export-svg').addEventListener('click', () => {
    if (!current || !current.stats) { say('results-status', t('err.noData'), 'error'); return; }
    download('histogram.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + histSVG(), 'image/svg+xml');
    say('results-status', t('svg.done'), 'ok');
  });
  $('export').addEventListener('click', () => {
    try { download('descriptivestats-backup.json', C.backup(settings, series), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: series.length, b: next.series.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next.settings, next.series)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.series.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('descriptivestats-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = C.validateBackup(JSON.parse(raw)); settings = d.settings; series = d.series; }
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue : on réaffiche ; le séparateur décimal suit la langue seulement si rien n'est saisi (sinon la série changerait de sens).
  L.onChange(() => {
    if (!$('values').value.trim() && settings.decimal !== langDecimal()) { const next = { ...settings, decimal: langDecimal() }; if (!save(next, series, true)) settings = next; }
    for (const id of ['data-status', 'results-status', 'backup-status']) say(id, '');
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
