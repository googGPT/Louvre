/* RentBuyCompare — interface. Calculs dans core.js (RentBuyCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.RentBuyCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-rentbuycompare-v1'; // clé de stockage local
  const RENT = '#1c7ed6', BUY = '#d9480f', GREY = '#868e96'; // couleurs explicites : le SVG exporté reste lisible
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const sv = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v)); return n; };
  const form = $('form');

  let state = { params: null }; // hypothèses validées et enregistrées
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  // Erreur du moteur : le nom du champ et les bornes sont traduits ici.
  function errText(e) {
    const [key, json] = String(e && e.message ? e.message : e).split('|');
    if (!json) return L.error(e);
    let p; try { p = JSON.parse(json); } catch (_) { return L.error(e); }
    if (p.field) p.field = t('f.' + p.field);
    for (const k of ['min', 'max']) if (typeof p[k] === 'number') p[k] = L.number(p[k]);
    return t(key, p);
  }

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  const readForm = () => Object.fromEntries(Object.values(C.INPUTS).map((n) => [n, form.elements[n].value]));
  function fillForm(p) {
    const v = C.toInputs(p);
    for (const [n, val] of Object.entries(v)) { const short = val.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); form.elements[n].value = short === '0' ? '' : short; }
  }
  const result = () => (state.params ? C.simulate(state.params) : null);

  // --- Résultat : verdict, chiffres clés, graphique
  function renderResult(r) {
    const box = $('result');
    if (!r) { box.replaceChildren(el('p', 'empty', t('result.empty'))); return; }
    const n = state.params.horizonYears, f = r.final;
    const verdict = el('p', 'verdict ' + r.winner);
    verdict.textContent = r.winner === 'equal' ? t('verdict.equal', { n }) : t('verdict.' + r.winner, { n, amount: L.money(Math.abs(f.diff)) });
    const be = el('p', 'be', r.breakEven === null ? t('be.never', { n }) : t('be.year', { n: r.breakEven }));
    const cards = el('div', 'cards');
    const card = (cls, title, amount, lines, explain) => {
      const c = el('article', 'card ' + cls); c.append(el('h3', '', title), el('div', 'big', L.money(amount)));
      const dl = el('dl');
      for (const [k, v] of lines) { const d = el('div'); d.append(el('dt', '', t(k)), el('dd', '', v)); dl.append(d); }
      c.append(dl, el('p', 'note', explain)); return c;
    };
    cards.append(
      card('rent', t('card.renter', { n }), f.renterNet, [['kpi.rentCum', L.money(f.rentCum)], ['kpi.investGain', L.money(f.investCents - state.params.downCents)]], t('explain.renter')),
      card('buy', t('card.owner', { n }), f.ownerNet, [['kpi.loan', L.money(r.loanCents)], ['kpi.payment', t('kpi.perMonth', { amount: L.money(r.paymentCents) })], ['kpi.interest', L.money(f.interestCum)], ['kpi.equity', L.money(f.equityCents)]], t('explain.owner')),
    );
    box.replaceChildren(verdict, be, cards);
  }

  // Graphique SVG autonome : coût net cumulé de chaque choix, de l'année 0 à l'horizon.
  function chartSvg(r, W = 640) {
    const H = W < 500 ? 240 : 270, pl = 58, pr = 14, pt = 14, pb = 30, n = state.params.horizonYears;
    const vals = r.years.flatMap((y) => [y.renterNet, y.ownerNet]);
    let max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    const pad = (max - min || 100) * 0.05; max += pad; if (min < 0) min -= pad;
    const x = (yr) => pl + (W - pl - pr) * yr / n, y = (v) => pt + (H - pt - pb) * (max - v) / (max - min);
    const svg = sv('svg', { xmlns: SVGNS, viewBox: `0 0 ${W} ${H}`, role: 'img', direction: 'ltr', 'font-family': 'system-ui, sans-serif', 'font-size': 12 });
    svg.setAttribute('aria-label', t('chart.aria', { n }));
    for (let k = 0; k <= 4; k++) { // grille et graduations
      const v = min + (max - min) * k / 4;
      svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: GREY, 'stroke-opacity': 0.3 }));
      const tx = sv('text', { x: pl - 6, y: y(v) + 4, 'text-anchor': 'end', fill: GREY }); tx.textContent = L.number(v / 100, { notation: 'compact', maximumFractionDigits: 1 }); svg.append(tx);
    }
    if (min < 0) svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(0), y2: y(0), stroke: GREY, 'stroke-width': 1.5 }));
    for (const yr of [...new Set([0, Math.round(n / 2), n])]) {
      const tx = sv('text', { x: x(yr), y: H - 10, 'text-anchor': yr === 0 ? 'start' : yr === n ? 'end' : 'middle', fill: GREY }); tx.textContent = t('chart.year', { n: yr }); svg.append(tx);
    }
    if (r.breakEven !== null) svg.append(sv('line', { x1: x(r.breakEven), x2: x(r.breakEven), y1: pt, y2: H - pb, stroke: GREY, 'stroke-dasharray': '3 4', 'stroke-width': 1.5 }));
    const line = (key, color) => svg.append(sv('polyline', { points: r.years.map((v) => `${x(v.year).toFixed(1)},${y(v[key]).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    line('renterNet', RENT); line('ownerNet', BUY);
    return svg;
  }
  function renderChart(r) {
    $('chart-box').hidden = !r;
    $('svg').disabled = $('csv').disabled = !r;
    if (!r) return;
    const w = Math.round(Math.min(640, Math.max(280, $('chart').clientWidth || 640)));
    $('chart').replaceChildren(chartSvg(r, w));
    const item = (color, text, cls) => { const s = el('span'), i = el('i', cls || ''); if (color) i.style.background = color; s.append(i, document.createTextNode(text)); return s; };
    const items = [item(RENT, t('chart.renter')), item(BUY, t('chart.owner'))];
    if (r.breakEven !== null) items.push(item(null, t('chart.breakEven', { n: r.breakEven }), 'dash'));
    $('legend').replaceChildren(...items);
  }

  // --- Tableau annuel
  const TABLE = ['year', 'rentCum', 'renterNet', 'paidCum', 'ownerCostsCum', 'valueCents', 'balanceCents', 'ownerNet', 'diff'];
  function renderYears(r) {
    const box = $('years');
    if (!r) { box.replaceChildren(el('p', 'empty', t('years.empty'))); return; }
    const scroll = el('div', 'scroll'), table = el('table', 'years'), head = el('tr');
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', t('years.title'));
    for (const c of TABLE) head.append(el('th', '', t('th.' + c)));
    const thead = el('thead'), tbody = el('tbody'); thead.append(head);
    for (const yr of r.years) {
      const tr = el('tr', r.breakEven !== null && yr.year === r.breakEven ? 'be-row' : '');
      for (const c of TABLE) tr.append(el('td', c === 'diff' ? (yr.diff > 0 ? 'pos' : yr.diff < 0 ? 'neg' : '') : '', c === 'year' ? L.number(yr.year) : L.money(yr[c])));
      tbody.append(tr);
    }
    table.append(thead, tbody); scroll.append(table);
    box.replaceChildren(scroll, el('p', 'note', t('years.diffNote')));
  }

  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    const r = result();
    renderResult(r); renderChart(r); renderYears(r);
  }

  // --- Saisie : recalcul et enregistrement immédiats à chaque frappe valide (aucun délai, donc rien à perdre).
  function compute(fromSubmit) {
    const raw = readForm();
    if (!fromSubmit && Object.values(raw).every((v) => !v.trim())) { say('form-status', ''); return; }
    try {
      const params = C.makeParams(raw);
      if (!save({ params })) return;
      say('form-status', t('form.saved'), 'ok');
      render();
    } catch (e) { say('form-status', errText(e), 'error'); }
  }
  form.addEventListener('input', () => compute(false));
  form.addEventListener('submit', (event) => { event.preventDefault(); compute(true); });

  // --- Exemple (valeurs d'illustration, pas des données de marché)
  $('sample').addEventListener('click', () => {
    if (state.params && !confirm(t('confirm.sample'))) return;
    const s = { price: '250000', down: '50000', fees: '18000', loanRate: '3.5', loanYears: '20', appreciation: '1', charges: '1800', maintenance: '1500', costGrowth: '2', rent: '900', rentGrowth: '1.5', invest: '3', horizon: '25' };
    for (const [k, v] of Object.entries(s)) form.elements[k].value = v;
    compute(true);
    if (state.params) say('form-status', t('sample.added'), 'ok');
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv').addEventListener('click', () => {
    try {
      const r = result(); if (!r) throw new Error('err.csv');
      const labels = Object.fromEntries(C.COLUMNS.map((c) => [c, c === 'year' ? t('th.year') : `${t('th.' + c)} (${L.currency})`]));
      download('rentbuycompare-years.csv', C.yearlyCsv(r, labels), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('svg').addEventListener('click', () => {
    try {
      const r = result(); if (!r) throw new Error('err.csv');
      const svg = chartSvg(r), title = sv('title'); title.textContent = t('chart.aria', { n: state.params.horizonYears }); svg.prepend(title);
      download('rentbuycompare-chart.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg), 'image/svg+xml');
      say('backup-status', t('svg.done'), 'ok');
    } catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('rentbuycompare-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 200_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm'))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true;
      if (next.params) fillForm(next.params); else form.reset();
      render();
      say('backup-status', t('backup.restored'), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('rentbuycompare-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  // Nouvelle langue ou devise : on réaffiche sans toucher à la saisie en cours.
  L.onChange(() => { say('backup-status', ''); if ($('form-status').classList.contains('error')) compute(false); else say('form-status', ''); render(); });
  if (state.params) fillForm(state.params);
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
