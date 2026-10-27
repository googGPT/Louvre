/* SavingsProjection — interface. Calculs dans core.js (SavingsCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.SavingsCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-savingsprojection-v1'; // clé de stockage local
  const COLORS = ['#7048e8', '#1c7ed6', '#e8590c', '#2f9e44', '#d6336c']; // un ton par scénario, lisible en clair et en sombre
  const GREY = '#868e96';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const sv = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v)); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const toInput = (cents) => (cents / 100).toFixed(2);

  let state = C.emptyState(); // { plan, scenarios }
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const rate = (bp) => L.number(bp / 10000, { style: 'percent', maximumFractionDigits: 2 }); // « 3,5 % », « 3.5% »…
  const label = (r) => `${r.name} (${rate(r.rateBp)})`;

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function fillPlan() {
    const f = $('plan-form'), p = state.plan;
    if (!p) return;
    f.initial.value = p.initialCents ? toInput(p.initialCents) : '';
    f.contribution.value = p.contributionCents ? toInput(p.contributionCents) : '';
    f.frequency.value = p.frequency; f.timing.value = p.timing; f.years.value = String(p.years);
    f.target.value = p.targetCents ? toInput(p.targetCents) : '';
  }
  // Couleur d'un scénario : selon son rang (du taux le plus bas au plus haut).
  function colorOf(id) {
    const sorted = [...state.scenarios].sort((a, b) => a.rateBp - b.rateBp || (a.name < b.name ? -1 : 1));
    return COLORS[Math.max(0, sorted.findIndex((s) => s.id === id)) % COLORS.length];
  }
  function results() { return state.plan && state.scenarios.length ? C.compare(state.plan, state.scenarios) : null; }

  function renderScenarios() {
    const list = $('scen-list');
    if (!state.scenarios.length) { list.replaceChildren(el('li', 'empty', t('scen.empty'))); return; }
    list.replaceChildren(...[...state.scenarios].sort((a, b) => a.rateBp - b.rateBp).map((s) => {
      const li = el('li'), dot = el('i', 'dot'), txt = el('div', 'txt');
      dot.style.background = colorOf(s.id); dot.setAttribute('aria-hidden', 'true');
      txt.append(el('b', '', s.name), el('span', '', t('scen.line', { rate: rate(s.rateBp) })));
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { name: s.name }));
      del.addEventListener('click', () => { if (save({ ...state, scenarios: state.scenarios.filter((x) => x.id !== s.id) })) render(); });
      li.append(dot, txt, del); return li;
    }));
  }

  function goalText(r) {
    if (!state.plan.targetCents) return null;
    if (r.targetMonth === null) return [t('goal.no', { amount: L.money(state.plan.targetCents) }), 'goal no'];
    if (r.targetMonth === 0) return [t('goal.already'), 'goal'];
    const n = r.targetMonth / 12;
    return [t('goal.after', { n, y: L.number(n, { maximumFractionDigits: 1 }) }), 'goal'];
  }

  function renderCards(rs) {
    const box = $('cards');
    if (!state.plan) { box.replaceChildren(el('p', 'empty', t('result.noPlan'))); return; }
    if (!rs) { box.replaceChildren(el('p', 'empty', t('result.noScenario'))); return; }
    box.replaceChildren(...rs.map((r) => {
      const c = el('article', 'card'); c.style.borderTopColor = colorOf(r.id);
      c.append(el('h3', '', label(r)), el('div', 'big', L.money(r.finalCents)));
      const dl = el('dl');
      for (const [k, v] of [['card.contributed', L.money(r.contributedCents)], ['card.interest', L.money(r.interestCents)]]) {
        const d = el('div'); d.append(el('dt', '', t(k)), el('dd', '', v)); dl.append(d);
      }
      c.append(el('p', 'note', t('card.after', { n: state.plan.years })), dl);
      const g = goalText(r); if (g) c.append(el('p', g[1], g[0]));
      return c;
    }));
  }

  // Graphique SVG autonome (couleurs explicites, donc exportable tel quel).
  // W : largeur en pixels (celle du conteneur à l'écran, 640 à l'export) pour garder un texte lisible sur mobile.
  function chartSvg(rs, W = 640) {
    const H = W < 500 ? 240 : 270, pl = 58, pr = 14, pt = 14, pb = 30, years = state.plan.years;
    const values = rs.flatMap((r) => r.years.map((y) => y.balanceCents)).concat([state.plan.initialCents, state.plan.targetCents, rs[0].contributedCents]);
    const max = Math.max(1, ...values) * 1.05;
    const x = (yr) => pl + (W - pl - pr) * yr / years, y = (v) => pt + (H - pt - pb) * (1 - v / max);
    const svg = sv('svg', { xmlns: SVGNS, viewBox: `0 0 ${W} ${H}`, role: 'img', direction: 'ltr', 'font-family': 'system-ui, sans-serif', 'font-size': 12 });
    svg.setAttribute('aria-label', t('chart.aria', { n: rs.length, years }));
    for (let k = 0; k <= 4; k++) { // grille et graduations
      const v = max * k / 4;
      svg.append(sv('line', { x1: pl, x2: W - pr, y1: y(v), y2: y(v), stroke: GREY, 'stroke-opacity': 0.3 }));
      const tx = sv('text', { x: pl - 6, y: y(v) + 4, 'text-anchor': 'end', fill: GREY }); tx.textContent = L.number(v / 100, { notation: 'compact', maximumFractionDigits: 1 }); svg.append(tx);
    }
    const ticks = [...new Set([0, Math.round(years / 2), years])];
    for (const yr of ticks) { const tx = sv('text', { x: x(yr), y: H - 10, 'text-anchor': yr === 0 ? 'start' : yr === years ? 'end' : 'middle', fill: GREY }); tx.textContent = t('chart.year', { n: yr }); svg.append(tx); }
    const line = (pts, color, extra) => svg.append(sv('polyline', { points: pts.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', ...extra }));
    if (state.plan.targetCents) line([[0, state.plan.targetCents], [years, state.plan.targetCents]], GREY, { 'stroke-width': 1.5, 'stroke-dasharray': '2 4' });
    line([[0, state.plan.initialCents], ...rs[0].years.map((v) => [v.year, v.contributedCents])], GREY, { 'stroke-dasharray': '6 4', 'stroke-width': 2 });
    for (const r of rs) line([[0, state.plan.initialCents], ...r.years.map((v) => [v.year, v.balanceCents])], colorOf(r.id));
    return svg;
  }

  function renderChart(rs) {
    $('chart-box').hidden = !rs;
    $('svg').disabled = $('csv').disabled = !rs;
    if (!rs) return;
    const w = Math.round(Math.min(640, Math.max(280, $('chart').clientWidth || 640)));
    $('chart').replaceChildren(chartSvg(rs, w));
    const items = rs.map((r) => { const s = el('span'), i = el('i'); i.style.background = colorOf(r.id); s.append(i, document.createTextNode(label(r))); return s; });
    const c = el('span'), i = el('i', 'dash'); c.append(i, document.createTextNode(t('chart.contributed'))); items.push(c);
    if (state.plan.targetCents) { const g = el('span'), j = el('i', 'dash'); g.append(j, document.createTextNode(t('chart.target', { amount: L.money(state.plan.targetCents) }))); items.push(g); }
    $('legend').replaceChildren(...items);
  }

  function renderYears(rs) {
    const box = $('years');
    if (!rs) { box.replaceChildren(el('p', 'empty', t('years.empty'))); return; }
    const scroll = el('div', 'scroll'), table = el('table', 'years'), head = el('tr');
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', t('years.title'));
    for (const txt of [t('th.year'), t('th.contributed'), ...rs.map(label)]) head.append(el('th', '', txt));
    const thead = el('thead'), tbody = el('tbody'); thead.append(head);
    rs[0].years.forEach((yr, i) => {
      const tr = el('tr');
      tr.append(el('td', '', L.number(yr.year)), el('td', '', L.money(yr.contributedCents)), ...rs.map((r) => el('td', '', L.money(r.years[i].balanceCents))));
      tbody.append(tr);
    });
    table.append(thead, tbody); scroll.append(table); box.replaceChildren(scroll);
  }

  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    renderScenarios();
    const rs = results();
    renderCards(rs); renderChart(rs); renderYears(rs);
  }

  // --- Plan
  $('plan-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const plan = C.makePlan({ initial: f.initial.value, contribution: f.contribution.value, frequency: f.frequency.value, timing: f.timing.value, years: f.years.value, target: f.target.value });
      if (!save({ ...state, plan })) return;
      say('plan-status', state.scenarios.length ? t('plan.saved') : t('plan.savedNoScenario'), 'ok');
      render();
    } catch (e) { say('plan-status', L.error(e), 'error'); }
  });

  // --- Scénarios
  $('scen-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (state.scenarios.length >= C.MAX_SCENARIOS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_SCENARIOS })}`);
      const s = C.makeScenario({ name: f.name.value, rate: f.rate.value }, newId());
      if (!save({ ...state, scenarios: [...state.scenarios, s] })) return;
      say('scen-status', t('scen.added', { name: s.name }), 'ok');
      f.name.value = ''; f.rate.value = ''; f.name.focus();
      render();
    } catch (e) { say('scen-status', L.error(e), 'error'); }
  });

  // --- Exemple (dans la langue affichée ; taux purement illustratifs)
  $('sample').addEventListener('click', () => {
    if ((state.plan || state.scenarios.length) && !confirm(t('confirm.sample'))) return;
    try {
      const plan = C.makePlan({ initial: '2000', contribution: '150', frequency: 'monthly', timing: 'end', years: '15', target: '40000' });
      const scenarios = [['sample.low', '1'], ['sample.mid', '3'], ['sample.high', '5']].map(([k, r]) => C.makeScenario({ name: t(k), rate: r }, newId()));
      if (!save({ plan, scenarios })) return;
      fillPlan(); render();
      say('plan-status', t('sample.added'), 'ok');
    } catch (e) { say('plan-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv').addEventListener('click', () => {
    try {
      const rs = results(); if (!rs) throw new Error('err.csv');
      download('savingsprojection-years.csv', C.yearlyCsv(rs, { year: t('th.year'), contributed: t('csv.contributed', { cur: L.currency }), scenario: (r) => `${label(r)} (${L.currency})` }), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('svg').addEventListener('click', () => {
    try {
      const rs = results(); if (!rs) throw new Error('err.csv');
      const svg = chartSvg(rs), title = sv('title'); title.textContent = t('chart.aria', { n: rs.length, years: state.plan.years }); svg.prepend(title);
      download('savingsprojection-chart.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg), 'image/svg+xml');
      say('backup-status', t('svg.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('savingsprojection-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.scenarios.length, b: next.scenarios.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true;
      fillPlan(); render();
      say('backup-status', t('backup.restored', { n: next.scenarios.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('savingsprojection-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { ['plan-status', 'scen-status', 'backup-status'].forEach((id) => say(id, '')); render(); }); // nouvelle langue ou devise
  fillPlan(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
