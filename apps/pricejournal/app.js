/* PriceJournal — interface. Calculs dans core.js (PriceJournalCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.PriceJournalCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-pricejournal-v1'; // clé de stockage local
  const ACTIVE = 'louvre-pricejournal-active'; // produit affiché (simple confort)
  const COLORS = ['#a61e4d', '#1c7ed6', '#e8590c', '#2f9e44', '#7048e8', '#0c8599']; // un ton par magasin, lisible en clair et en sombre
  const GREY = '#868e96';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const sv = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v)); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const form = $('entry-form');

  let state = { entries: [] };
  let activeKey = null; // produit affiché
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function setActive(key) { activeKey = key; try { localStorage.setItem(ACTIVE, key || ''); } catch (_) { /* confort seulement */ } }
  // Jour civil local « AAAA-MM-JJ » (décalé de n jours).
  function today(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  const unitLabel = (u) => (u === 'piece' ? t('unit.piece') : u === 'l' ? 'L' : u);
  const perLabel = (per) => t('per.' + per);
  const perUnit = (cents, per) => `${L.money(cents)}/${perLabel(per)}`;
  const shortDate = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const pct = (v) => L.number(v / 100, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  function format(e) {
    const one = `${L.number(e.qty)} ${unitLabel(e.unit)}`;
    return e.count > 1 ? t('format.pack', { count: e.count, qty: one }) : one;
  }
  const dayNum = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) / 86400000; };

  // --- Sélecteur de produits et listes de suggestions
  function renderLists(prods) {
    const sel = $('product-select');
    sel.replaceChildren(...prods.map((p) => { const o = el('option', '', `${p.name} (${L.number(p.count)})`); o.value = p.key; return o; }));
    sel.disabled = !prods.length;
    if (activeKey) sel.value = activeKey;
    $('product-list').replaceChildren(...prods.map((p) => { const o = el('option'); o.value = p.name; return o; }));
    const stores = [...new Set(state.entries.map((e) => e.store))].sort((a, b) => a.localeCompare(b, L.locale));
    $('store-list').replaceChildren(...stores.map((s) => { const o = el('option'); o.value = s; return o; }));
  }
  function storeColor(a, store) {
    const names = [...new Set(a.entries.map((e) => e.store.toLowerCase()))].sort();
    return COLORS[Math.max(0, names.indexOf(store.toLowerCase())) % COLORS.length];
  }

  // --- Résumé du produit affiché
  function renderSummary(a) {
    const box = $('summary');
    if (!a) { box.replaceChildren(el('p', 'empty', t('trend.empty'))); return; }
    const kpis = el('div', 'kpis');
    const kpi = (label, value, sub, cls = '') => { const k = el('div', 'kpi ' + cls); k.append(el('span', '', label), el('strong', '', value)); if (sub) k.append(el('small', '', sub)); return k; };
    kpis.append(
      kpi(t('kpi.last'), perUnit(a.last.unitPriceCents, a.per), t('kpi.at', { store: a.last.store, date: shortDate(a.last.date) })),
      kpi(t('kpi.variation'), a.variationPct === null ? '—' : pct(a.variationPct), a.variationPct === null ? t('kpi.single') : t('kpi.since', { date: shortDate(a.first.date) }), a.variationPct > 0 ? 'up' : a.variationPct < 0 ? 'down' : ''),
      kpi(t('kpi.best'), perUnit(a.best.unitPriceCents, a.per), t('kpi.at', { store: a.best.store, date: shortDate(a.best.date) }), 'good'),
      kpi(t('kpi.count'), L.number(a.entries.length), t('kpi.range', { a: shortDate(a.first.date), b: shortDate(a.last.date) })),
    );
    const out = [kpis];
    if (a.entries.length > 1) out.push(el('p', 'verdict', a.lastVsBestPct > 0 ? t('verdict.above', { pct: L.number(a.lastVsBestPct / 100, { style: 'percent', maximumFractionDigits: 1 }), price: perUnit(a.best.unitPriceCents, a.per), store: a.best.store }) : t('verdict.best')));
    if (a.byStore.length > 1) {
      const p = el('p', 'note'); p.textContent = t('stores.last') + ' ' + a.byStore.map((e) => `${e.store} ${perUnit(e.unitPriceCents, a.per)}`).join(' · ');
      out.push(p);
    }
    box.replaceChildren(...out);
  }

  // Graphique SVG autonome : prix unitaire dans le temps, une ligne par magasin ; meilleur prix entouré.
  function chartSvg(a, W = 640) {
    const H = W < 500 ? 230 : 260, pl = 58, pr = 16, pt = 16, pb = 30;
    const xs = a.entries.map((e) => dayNum(e.date)), x0 = Math.min(...xs), x1 = Math.max(...xs), span = x1 - x0;
    const vals = a.entries.map((e) => e.unitPriceCents);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(1, (hi - lo) * 0.15 || hi * 0.1); lo = Math.max(0, lo - pad); hi += pad;
    const x = (d) => (span ? pl + (W - pl - pr) * (dayNum(d) - x0) / span : (pl + W - pr) / 2), y = (v) => pt + (H - pt - pb) * (hi - v) / (hi - lo);
    const svg = sv('svg', { xmlns: SVGNS, viewBox: `0 0 ${W} ${H}`, role: 'img', direction: 'ltr', 'font-family': 'system-ui, sans-serif', 'font-size': 12 });
    svg.setAttribute('aria-label', t('chart.aria', { name: a.name, per: perLabel(a.per), n: a.entries.length }));
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4;
      svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: GREY, 'stroke-opacity': 0.3 }));
      const tx = sv('text', { x: pl - 6, y: y(v) + 4, 'text-anchor': 'end', fill: GREY }); tx.textContent = L.number(v / 100, { maximumFractionDigits: 2, minimumFractionDigits: 2 }); svg.append(tx);
    }
    const ticks = span ? [a.first.date, a.last.date] : [a.first.date];
    ticks.forEach((d, i) => { const tx = sv('text', { x: x(d), y: H - 10, 'text-anchor': !span ? 'middle' : i === 0 ? 'start' : 'end', fill: GREY }); tx.textContent = shortDate(d); svg.append(tx); });
    const groups = new Map();
    for (const e of a.entries) { const k = e.store.toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    for (const list of groups.values()) {
      const color = storeColor(a, list[0].store);
      if (list.length > 1) svg.append(sv('polyline', { points: list.map((e) => `${x(e.date).toFixed(1)},${y(e.unitPriceCents).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      for (const e of list) svg.append(sv('circle', { cx: x(e.date).toFixed(1), cy: y(e.unitPriceCents).toFixed(1), r: 4, fill: color }));
    }
    svg.append(sv('circle', { cx: x(a.best.date).toFixed(1), cy: y(a.best.unitPriceCents).toFixed(1), r: 9, fill: 'none', stroke: '#2f9e44', 'stroke-width': 2.5 }));
    return svg;
  }
  function renderChart(a) {
    $('chart-box').hidden = !a;
    $('svg').disabled = !a;
    if (!a) return;
    const w = Math.round(Math.min(640, Math.max(280, $('chart').clientWidth || 640)));
    $('chart').replaceChildren(chartSvg(a, w));
    const seen = new Set(), items = [];
    for (const e of a.entries) {
      const k = e.store.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      const s = el('span'), i = el('i'); i.style.background = storeColor(a, e.store); s.append(i, document.createTextNode(e.store)); items.push(s);
    }
    const b = el('span'), ring = el('i', 'ring'); b.append(ring, document.createTextNode(t('chart.best'))); items.push(b);
    $('legend').replaceChildren(...items);
  }

  // --- Relevés du produit affiché (du plus récent au plus ancien)
  function renderEntries(a) {
    const box = $('entries');
    if (!a) { box.replaceChildren(); return; }
    const scroll = el('div', 'scroll'), table = el('table', 'log'), head = el('tr');
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', t('entries.title'));
    for (const [txt, cls] of [[t('th.date'), ''], [t('th.store'), ''], [t('th.format'), 'hide-s'], [t('th.price'), 'num hide-s'], [`${L.currencySymbol()}/${perLabel(a.per)}`, 'num'], ['', '']]) head.append(el('th', cls, txt));
    const thead = el('thead'), tbody = el('tbody'); thead.append(head);
    for (const e of [...a.entries].reverse()) {
      const tr = el('tr', e.id === a.best.id ? 'best' : '');
      const del = el('button', 'btn del', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { store: e.store, date: shortDate(e.date) }));
      del.addEventListener('click', () => { if (save({ entries: state.entries.filter((x) => x.id !== e.id) })) { say('form-status', t('entry.removed'), 'ok'); render(); } });
      const delTd = el('td'); delTd.append(del);
      tr.append(el('td', 'nowrap', L.date(e.date, { day: '2-digit', month: '2-digit', year: 'numeric' })), el('td', 'store', e.store), el('td', 'hide-s nowrap', format(e)), el('td', 'num hide-s', L.money(e.priceCents)), el('td', 'num up', L.money(e.unitPriceCents)), delTd);
      tbody.append(tr);
    }
    table.append(thead, tbody); scroll.append(table);
    box.replaceChildren(el('h3', '', t('entries.title')), scroll);
  }

  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    const prods = C.products(state.entries, L.locale);
    if (!prods.some((p) => p.key === activeKey)) setActive(prods[0] ? prods[0].key : null);
    renderLists(prods);
    const a = activeKey ? C.analyze(state.entries, activeKey) : null;
    renderSummary(a); renderChart(a); renderEntries(a);
    $('csv').disabled = !state.entries.length;
  }

  // --- Ajout d'un relevé
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const e = C.makeEntry({ product: form.product.value, store: form.store.value, date: form.date.value, price: form.price.value, qty: form.qty.value, unit: form.unit.value, count: form.count.value }, newId());
      const next = C.addEntry(state.entries, e);
      if (!save({ entries: next })) return;
      const added = next[next.length - 1];
      setActive(C.productKey(added.product));
      say('form-status', t('entry.added', { name: added.product, price: perUnit(C.unitPriceCents(added), C.PER[C.UNITS[added.unit].dim].unit) }), 'ok');
      form.price.value = ''; form.price.focus(); // produit, magasin et date restent pour le relevé suivant
      render();
    } catch (err) {
      const [key, json] = String(err.message).split('|');
      if (key === 'err.dimMismatch') { const p = JSON.parse(json); say('form-status', t(key, { dim: t('dim.' + p.dim) }), 'error'); }
      else say('form-status', L.error(err), 'error');
    }
  });
  $('product-select').addEventListener('change', (e) => { setActive(e.target.value); render(); });

  // --- Exemple (dans la langue affichée ; prix purement illustratifs, dates récentes)
  $('sample').addEventListener('click', () => {
    try {
      const coffee = t('sample.coffee'), a = t('sample.storeA'), b = t('sample.storeB');
      const rows = [[a, -150, '3.10', '250'], [b, -120, '5.90', '500'], [a, -90, '3.25', '250'], [b, -60, '6.20', '500'], [a, -30, '3.40', '250'], [a, -2, '3.45', '250']];
      let next = state.entries;
      for (const [store, d, price, qty] of rows) next = C.addEntry(next, C.makeEntry({ product: coffee, store, date: today(d), price, qty, unit: 'g', count: '1' }, newId()));
      if (!save({ entries: next })) return;
      setActive(C.productKey(next[next.length - 1].product)); render();
      say('form-status', t('sample.added'), 'ok');
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv').addEventListener('click', () => {
    try {
      const cur = ` (${L.currency})`;
      const labels = { date: t('th.date'), product: t('f.product'), store: t('th.store'), price: t('th.price') + cur, qty: t('f.qty'), unit: t('f.unit'), count: t('csv.count'), unitPrice: t('csv.unitPrice') + cur, per: t('csv.per') };
      download('pricejournal-entries.csv', C.entriesCsv(state.entries, labels, (u) => (u === 'piece' ? t('per.piece') : unitLabel(u))), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('svg').addEventListener('click', () => {
    try {
      const a = activeKey ? C.analyze(state.entries, activeKey) : null; if (!a) throw new Error('err.csv');
      const svg = chartSvg(a), title = sv('title'); title.textContent = t('chart.aria', { name: a.name, per: perLabel(a.per), n: a.entries.length }); svg.prepend(title);
      download('pricejournal-chart.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg), 'image/svg+xml');
      say('backup-status', t('svg.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('pricejournal-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.entries.length, b: next.entries.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.entries.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('pricejournal-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  form.date.value = today();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  try { activeKey = localStorage.getItem(ACTIVE) || null; } catch (_) { activeKey = null; }
  // Nouvelle langue ou devise : on réaffiche sans toucher à la saisie en cours.
  L.onChange(() => { say('form-status', ''); say('backup-status', ''); render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
