/* ExpenseClassifier — interface. Calculs dans core.js (ExpenseCore) ; textes et formats dans LouvreI18n.
   Le relevé est lu localement (FileReader / texte collé) : aucune requête réseau. */
(() => {
  'use strict';
  const C = window.ExpenseCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-expenseclassifier-v1'; // clé de stockage local
  const MAX_FILE = 2_000_000; // 2 Mo : bien au-delà d'un relevé annuel
  const MAX_LINES_SHOWN = 300;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let data = { categories: [], rules: [], transactions: [] }; // tout ce qui est enregistré
  let readOnly = false; // stockage illisible : aucune écriture
  let rows = null; // lignes du fichier en cours d'analyse (pas encore importées)

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const localDecimal = () => (L.number(1.5).includes(',') ? 'comma' : 'dot'); // décimale usuelle de la langue affichée
  const catName = (id) => { const c = data.categories.find((x) => x.id === id); return c ? c.name : t('cat.none'); };
  const byName = (a, b) => a.name.localeCompare(b.name, L.locale);

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // ---------- 1. Import : analyse, réglages, aperçu
  const COLS = ['date', 'label', 'amount', 'debit', 'credit'];
  function headerCells() { return rows && $('has-header').checked ? (rows.find((r) => r.some((c) => String(c).trim())) || []) : []; }
  function fillColumnSelects() {
    const width = Math.max(0, ...(rows || []).map((r) => r.length)), head = headerCells();
    for (const k of COLS) {
      const sel = $('col-' + k), keep = sel.value;
      const opts = [];
      if (k === 'debit' || k === 'credit') { const o = el('option', '', t('map.none')); o.value = '-1'; opts.push(o); }
      for (let i = 0; i < width; i++) {
        const name = String(head[i] || '').trim();
        const o = el('option', '', name ? t('map.colNamed', { n: i + 1, name: name.slice(0, 30) }) : t('map.col', { n: i + 1 })); o.value = String(i); opts.push(o);
      }
      sel.replaceChildren(...opts);
      if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
    }
  }
  function mapping() {
    const v = (k) => Number($('col-' + k).value);
    const split = $('amount-mode').value === 'split';
    return { date: v('date'), label: v('label'), amount: split ? -1 : v('amount'), debit: split ? v('debit') : -1, credit: split ? v('credit') : -1 };
  }
  function setMapping(map) {
    const split = map.amount < 0 && (map.debit >= 0 || map.credit >= 0);
    $('amount-mode').value = split ? 'split' : 'single';
    for (const k of COLS) if (map[k] >= 0 || k === 'debit' || k === 'credit') $('col-' + k).value = String(map[k]);
  }
  function renderPreview() {
    if (!rows) return;
    const split = $('amount-mode').value === 'split';
    $('f-amount').hidden = split; $('f-debit').hidden = !split; $('f-credit').hidden = !split;
    const map = mapping(), role = {};
    for (const k of COLS) if (map[k] >= 0) role[map[k]] = t('map.' + k);
    const width = Math.max(0, ...rows.map((r) => r.length));
    const body = rows.filter((r) => r.some((c) => String(c).trim())).slice($('has-header').checked ? 1 : 0, 6);
    const thead = el('thead'), tr = el('tr');
    for (let i = 0; i < width; i++) tr.append(el('th', role[i] ? 'mapped' : '', role[i] || t('map.col', { n: i + 1 })));
    thead.append(tr);
    const tbody = el('tbody');
    for (const r of body) { const line = el('tr'); for (let i = 0; i < width; i++) line.append(el('td', role[i] ? 'mapped' : '', String(r[i] ?? '').slice(0, 60))); tbody.append(line); }
    $('preview').replaceChildren(thead, tbody);
    const n = rows.filter((r) => r.some((c) => String(c).trim())).length - ($('has-header').checked ? 1 : 0);
    $('do-import').textContent = t('btn.importN', { n: Math.max(0, n) });
  }
  function detectFromRows(redetectDecimal) {
    if (redetectDecimal) $('decimal').value = C.detectDecimal(rows.flat()) || localDecimal();
    $('has-header').checked = C.detectHeader(rows, $('decimal').value);
    const map = C.detectColumns(rows, { hasHeader: $('has-header').checked, decimal: $('decimal').value });
    fillColumnSelects(); setMapping(map);
    const dateValues = rows.slice($('has-header').checked ? 1 : 0).map((r) => (map.date >= 0 ? r[map.date] : '')).filter((v) => String(v || '').trim()).slice(0, 200);
    const formats = C.detectDateFormats(dateValues);
    if (formats.length) $('datefmt').value = formats[0];
    $('date-hint').hidden = !(formats.includes('dmy') && formats.includes('mdy'));
  }
  function analyze(text, delim) {
    $('row-errors').replaceChildren();
    if (!String(text).trim()) { say('import-status', t('import.empty'), 'error'); return false; }
    try {
      const d = delim || C.detectDelimiter(text);
      rows = C.parseCSV(text, d);
      $('delim').value = d;
      if (!rows.some((r) => r.some((c) => String(c).trim()))) throw new Error('err.noRows');
      detectFromRows(true);
      $('settings').hidden = false;
      renderPreview();
      say('import-status', t('import.analyzed'), 'ok');
      return true;
    } catch (e) { rows = null; $('settings').hidden = true; say('import-status', L.error(e), 'error'); return false; }
  }
  function opts() { return { hasHeader: $('has-header').checked, decimal: $('decimal').value, dateFormat: $('datefmt').value, map: mapping() }; }
  function showRowErrors(res) {
    $('row-errors').replaceChildren(...res.errors.slice(0, 10).map((e) => el('li', '', t('import.lineError', { line: e.line, msg: t(e.key) }))));
    if (res.errorCount > 10) $('row-errors').append(el('li', '', t('import.moreErrors', { n: res.errorCount - 10 })));
  }

  $('pick-file').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_FILE) throw new Error('err.fileBig');
      const buf = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } // UTF-8 d'abord
      catch (e) { text = new TextDecoder('windows-1252').decode(buf); } // anciens exports bancaires (accents Windows)
      $('csv-text').value = text;
      analyze(text);
    } catch (e) { say('import-status', L.error(e), 'error'); }
  });
  $('analyze').addEventListener('click', () => analyze($('csv-text').value));
  $('delim').addEventListener('change', () => { try { rows = C.parseCSV($('csv-text').value, $('delim').value); detectFromRows(false); renderPreview(); } catch (e) { say('import-status', L.error(e), 'error'); } });
  $('has-header').addEventListener('change', () => { fillColumnSelects(); renderPreview(); });
  for (const id of ['decimal', 'datefmt', 'amount-mode', 'col-date', 'col-label', 'col-amount', 'col-debit', 'col-credit']) $(id).addEventListener('change', renderPreview);

  $('do-import').addEventListener('click', () => {
    if (!rows) return;
    try {
      const res = C.buildTransactions(rows, opts());
      showRowErrors(res);
      if (!res.transactions.length) { say('import-status', t('import.none'), 'error'); return; }
      if (data.transactions.length && !confirm(t('import.confirm', { a: data.transactions.length, b: res.transactions.length }))) return;
      if (!save({ ...data, transactions: res.transactions })) return;
      say('import-status', res.errorCount ? t('import.doneErrors', { n: res.transactions.length, e: res.errorCount }) : t('import.done', { n: res.transactions.length }), res.errorCount ? 'warn' : 'ok');
      render();
    } catch (e) { say('import-status', L.error(e), 'error'); }
  });

  // ---------- 2. Catégories et règles
  $('cat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (data.categories.length >= C.MAX_CATS) throw new Error(`err.tooManyCats|${JSON.stringify({ max: C.MAX_CATS })}`);
      const cat = C.makeCategory($('cat-name').value, newId(), data.categories);
      if (!save({ ...data, categories: [...data.categories, cat] })) return;
      $('cat-name').value = '';
      render(); $('rule-cat').value = cat.id;
      say('rule-status', t('cat.added', { name: cat.name }), 'ok');
    } catch (e) { say('rule-status', L.error(e), 'error'); }
  });
  $('rule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!data.categories.length) throw new Error('err.noCategory');
      if (data.rules.length >= C.MAX_RULES) throw new Error(`err.tooManyRules|${JSON.stringify({ max: C.MAX_RULES })}`);
      const rule = C.makeRule({ categoryId: $('rule-cat').value, kind: $('rule-kind').value, value: $('rule-value').value, sign: $('rule-sign').value }, newId(), data.categories);
      if (!save({ ...data, rules: [...data.rules, rule] })) return;
      $('rule-value').value = '';
      const n = C.classify(data.transactions, data.rules).filter((x) => x.ruleId === rule.id).length;
      say('rule-status', t('rule.added', { n }), 'ok');
      render();
    } catch (e) { say('rule-status', L.error(e), 'error'); }
  });
  function ruleText(r) {
    const what = t(r.kind === 'keyword' ? 'rule.descKeyword' : 'rule.descPattern', { value: r.value });
    return r.sign === 'any' ? what : `${what} · ${t('sign.' + r.sign)}`;
  }
  function renderRules(classified) {
    const counts = {};
    for (const x of classified) if (x.ruleId) counts[x.ruleId] = (counts[x.ruleId] || 0) + 1;
    const keep = $('rule-cat').value;
    $('rule-cat').replaceChildren(...data.categories.slice().sort(byName).map((c) => { const o = el('option', '', c.name); o.value = c.id; return o; }));
    if (data.categories.some((c) => c.id === keep)) $('rule-cat').value = keep;
    const catCount = {};
    for (const x of classified) if (x.categoryId) catCount[x.categoryId] = (catCount[x.categoryId] || 0) + 1;
    $('cats').replaceChildren(...data.categories.map((c) => {
      const li = el('li', 'chip'); li.append(el('span', '', `${c.name} (${L.number(catCount[c.id] || 0)})`));
      const del = el('button', 'x', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('cat.remove', { name: c.name }));
      del.addEventListener('click', () => {
        const n = data.rules.filter((r) => r.categoryId === c.id).length;
        if (!confirm(t('cat.confirmRemove', { name: c.name, n }))) return;
        if (save({ ...data, categories: data.categories.filter((x) => x.id !== c.id), rules: data.rules.filter((r) => r.categoryId !== c.id) })) render();
      });
      li.append(del); return li;
    }));
    if (!data.categories.length) $('cats').append(el('li', 'hint', t('cat.empty')));
    const list = $('rules');
    if (!data.rules.length) { list.replaceChildren(el('li', 'empty', t('rules.empty'))); return; }
    list.replaceChildren(...data.rules.map((r, i) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', ruleText(r)));
      const meta = el('span'); meta.append(el('span', 'tag', catName(r.categoryId)), document.createTextNode(' ' + t('rule.count', { n: counts[r.id] || 0 })));
      txt.append(meta);
      const acts = el('div', 'acts');
      const mk = (label, aria, fn, disabled) => { const b = el('button', 'btn', label); b.type = 'button'; b.setAttribute('aria-label', aria); b.disabled = disabled; b.addEventListener('click', fn); return b; };
      acts.append(
        mk('↑', t('rule.up', { n: i + 1 }), () => { if (save({ ...data, rules: C.moveRule(data.rules, r.id, -1) })) render(); }, i === 0),
        mk('↓', t('rule.down', { n: i + 1 }), () => { if (save({ ...data, rules: C.moveRule(data.rules, r.id, 1) })) render(); }, i === data.rules.length - 1),
        mk('✕', t('rule.remove', { n: i + 1 }), () => { if (save({ ...data, rules: data.rules.filter((x) => x.id !== r.id) })) render(); }, false));
      li.append(el('span', 'prio', i + 1), txt, acts); return li;
    }));
  }

  // ---------- 3. Résultats
  function kpi(label, value) { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; }
  function table(id, heads, bodyRows) {
    const thead = el('thead'), tr = el('tr');
    for (const [txt, cls] of heads) tr.append(el('th', cls || '', txt));
    thead.append(tr);
    const tbody = el('tbody'); for (const r of bodyRows) tbody.append(r);
    $(id).replaceChildren(thead, tbody);
  }
  const money = (c) => L.money(c || 0); // || 0 : jamais « -0,00 »
  function renderResults(classified) {
    const s = C.summarize(classified, data.categories);
    const pct = s.total.count ? Math.round(100 * s.total.classifiedCount / s.total.count) : 0;
    $('kpis').replaceChildren(kpi(t('kpi.lines'), L.number(s.total.count)), kpi(t('kpi.classified'), `${L.number(pct)} %`),
      kpi(t('kpi.out'), money(-s.total.outCents || 0)), kpi(t('kpi.in'), money(s.total.inCents)));
    const maxOut = Math.max(1, ...s.categories.map((c) => c.outCents));
    table('by-cat', [[t('th.category')], [t('th.count'), 'num'], [t('th.out'), 'num'], [t('th.in'), 'num hide-s'], [t('th.net'), 'num'], ['', 'hide-s']],
      s.categories.map((c) => {
        const tr = el('tr', c.categoryId ? '' : 'muted');
        const bar = el('td', 'hide-s'), b = el('div', 'bar'), fill = el('i'); fill.style.width = Math.round(100 * c.outCents / maxOut) + '%'; b.append(fill); bar.append(b);
        tr.append(el('td', '', catName(c.categoryId)), el('td', 'num', L.number(c.count)), el('td', 'num', money(-c.outCents || 0)), el('td', 'num hide-s', money(c.inCents)), el('td', 'num strong', money(c.netCents)), bar);
        return tr;
      }));
    if (!s.categories.length) $('by-cat').replaceChildren(el('caption', 'empty', t('results.empty')));
    const cols = s.categories.map((c) => c.categoryId);
    table('by-month', [[t('th.month')], [t('th.out'), 'num'], [t('th.in'), 'num'], [t('th.net'), 'num'], ...cols.map((id) => [catName(id), 'num'])],
      s.months.map((m) => {
        const tr = el('tr');
        tr.append(el('td', 'nowrap', L.date(m.month + '-01', { month: 'short', year: 'numeric' })), el('td', 'num', money(-m.outCents || 0)), el('td', 'num', money(m.inCents)), el('td', 'num strong', money(m.netCents)),
          ...cols.map((id) => el('td', 'num', m.byCat[id || ''] ? money(m.byCat[id || '']) : '—')));
        return tr;
      }));
    if (!s.months.length) $('by-month').replaceChildren();
    // Filtre des opérations (valeur conservée lors d'un changement de langue).
    const keep = $('filter').value || 'all';
    const options = [['all', t('filter.all')], ['none', t('filter.none')], ...data.categories.slice().sort(byName).map((c) => [c.id, c.name])];
    $('filter').replaceChildren(...options.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    $('filter').value = options.some((o) => o[0] === keep) ? keep : 'all';
    const f = $('filter').value;
    const shown = classified.filter((x) => (f === 'all' ? true : f === 'none' ? !x.categoryId : x.categoryId === f));
    table('lines', [[t('th.date')], [t('th.label')], [t('th.amount'), 'num'], [t('th.category')]],
      shown.slice(0, MAX_LINES_SHOWN).map((x) => {
        const tr = el('tr'), cat = el('td');
        if (x.categoryId) cat.append(el('span', 'tag', catName(x.categoryId)));
        else {
          const b = el('button', 'btn mini', t('btn.makeRule')); b.type = 'button'; b.setAttribute('aria-label', t('aria.makeRule', { label: x.label }));
          b.addEventListener('click', () => prefillRule(x)); cat.append(b);
        }
        tr.append(el('td', 'nowrap', L.date(x.date, { day: 'numeric', month: 'short', year: '2-digit' })), el('td', 'label', x.label), el('td', 'num ' + (x.cents < 0 ? 'neg' : 'pos'), money(x.cents)), cat);
        return tr;
      }));
    if (!shown.length) $('lines').replaceChildren(el('caption', 'empty', t(data.transactions.length ? 'results.noneFiltered' : 'results.empty')));
    $('lines-more').hidden = shown.length <= MAX_LINES_SHOWN;
    $('lines-more').textContent = t('results.more', { shown: MAX_LINES_SHOWN, n: shown.length });
    $('export-csv').disabled = $('clear').disabled = !data.transactions.length;
  }
  // Raccourci : une ligne non classée pré-remplit une règle (libellé sans chiffres ni dates).
  function prefillRule(x) {
    $('rule-kind').value = 'keyword';
    $('rule-sign').value = x.cents < 0 ? 'out' : 'in';
    $('rule-value').value = x.label.replace(/[0-9][0-9/.:,-]*/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || x.label.slice(0, 40);
    if (!data.categories.length) { say('rule-status', t('err.noCategory'), 'error'); $('cat-name').focus(); }
    else { say('rule-status', t('rule.prefilled'), 'ok'); $('rule-cat').focus(); }
    $('rule-form').scrollIntoView({ block: 'center' });
  }
  $('filter').addEventListener('change', () => renderResults(C.classify(data.transactions, data.rules)));

  function render() {
    const classified = C.classify(data.transactions, data.rules);
    renderRules(classified); renderResults(classified);
  }

  // ---------- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      const csv = C.toCSV(C.classify(data.transactions, data.rules), {
        headers: ['csv.date', 'csv.label', 'csv.amount', 'csv.category', 'csv.month'].map((k) => t(k)), decimal: localDecimal(), categoryName: catName,
      });
      download('expenseclassifier.csv', csv, 'text/csv;charset=utf-8');
      say('backup-status', t('csv.done', { n: data.transactions.length }), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('expenseclassifier-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_FILE * 2) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.transactions.length, b: next.transactions.length, r: next.rules.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.transactions.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('expenseclassifier-raw-storage.txt', raw, 'text/plain'); });
  $('clear').addEventListener('click', () => {
    if (!data.transactions.length || !confirm(t('clear.confirm', { n: data.transactions.length }))) return;
    if (save({ ...data, transactions: [] })) { render(); say('backup-status', t('clear.done'), 'ok'); }
  });

  // ---------- Exemple dans la langue affichée : relevé des deux derniers mois, catégories et règles.
  $('sample').addEventListener('click', () => {
    if ((data.transactions.length || data.rules.length || data.categories.length) && !confirm(t('sample.confirm'))) return;
    const dec = localDecimal(), delim = dec === 'comma' ? ';' : ',';
    const now = new Date();
    const month = (back) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return [d.getFullYear(), d.getMonth() + 1]; };
    const day = ([y, m], d) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    const amount = (c) => C.formatAmount(c, dec);
    const plan = [['rent', -72000, 1], ['grocery', -6450, 3, true], ['fuel', -5890, 5, true], ['leisure', -1599, 10], ['grocery', -4320, 15, true], ['other', -2500, 20], ['salary', 215000, 28]];
    const lines = [[t('csv.date'), t('csv.label'), t('csv.amount')].join(delim)];
    for (const back of [2, 1]) {
      for (const [k, cents, d, card] of plan) {
        const m = month(back), label = t('sample.l.' + k) + (card ? ` ${String(d).padStart(2, '0')}/${String(m[1]).padStart(2, '0')}` : '');
        lines.push([day(m, d), label, amount(cents + (back === 1 && k === 'grocery' ? -730 : 0))].join(delim));
      }
    }
    const text = lines.join('\n');
    $('csv-text').value = text;
    if (!analyze(text)) return;
    try {
      const categories = [], rules = [];
      for (const [k, kind, sign] of [['rent', 'keyword', 'out'], ['grocery', 'keyword', 'out'], ['fuel', 'pattern', 'out'], ['salary', 'keyword', 'in'], ['leisure', 'keyword', 'out']]) {
        const cat = C.makeCategory(t('sample.c.' + k), newId(), categories); categories.push(cat);
        rules.push(C.makeRule({ categoryId: cat.id, kind, value: t('sample.r.' + k), sign }, newId(), categories));
      }
      const res = C.buildTransactions(rows, opts());
      if (!save({ categories, rules, transactions: res.transactions })) return;
      render();
      say('import-status', t('sample.done', { n: res.transactions.length }), 'ok');
    } catch (e) { say('import-status', L.error(e), 'error'); }
  });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { // nouvelle langue ou devise : on réaffiche sans toucher à la saisie
    for (const id of ['import-status', 'rule-status', 'backup-status']) say(id, '');
    $('row-errors').replaceChildren();
    if (rows) { fillColumnSelects(); renderPreview(); }
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
