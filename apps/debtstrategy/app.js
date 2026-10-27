/* DebtStrategy — interface. Calculs dans core.js (DebtCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.DebtCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-debtstrategy-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pad = (n) => String(n).padStart(2, '0');
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const toInput = (cents) => (cents / 100).toFixed(2);

  let state = C.emptyState(C.addMonths(thisMonth(), 1)); // premier paiement : le mois prochain
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const monthLabel = (m) => L.date(m + '-01', { month: 'long', year: 'numeric' });
  const shortMonth = (m) => L.date(m + '-01', { month: 'short', year: 'numeric' });
  const rate = (bp) => L.number(bp / 100, { maximumFractionDigits: 2 });
  const names = () => new Map(state.debts.map((d) => [d.id, d.name]));

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function fillPlan() {
    const f = $('plan-form');
    f.budget.value = state.budgetCents ? toInput(state.budgetCents) : '';
    f.start.value = state.startMonth;
    $('strategy').value = state.strategy;
  }

  // Résultat courant (ou null si les données ne permettent pas encore de calculer).
  function result() {
    if (!state.debts.length || !state.budgetCents) return null;
    return C.compare(state.debts, state.budgetCents, state.startMonth);
  }

  function renderDebts() {
    const list = $('debt-list');
    if (!state.debts.length) { list.replaceChildren(el('li', 'empty', t('debts.empty'))); return; }
    list.replaceChildren(...state.debts.map((d) => {
      const li = el('li'), txt = el('div', 'txt'), acts = el('div', 'acts');
      txt.append(el('b', '', d.name), el('span', '', t('debt.line', { balance: L.money(d.balanceCents), rate: rate(d.rateBp), min: L.money(d.minCents) })));
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.title = t('btn.remove'); del.setAttribute('aria-label', t('aria.remove', { name: d.name }));
      del.addEventListener('click', () => { if (confirm(t('confirm.remove', { name: d.name })) && save({ ...state, debts: state.debts.filter((x) => x.id !== d.id) })) render(); });
      acts.append(del); li.append(txt, acts); return li;
    }));
  }

  function failText(r) {
    if (r.reason === 'minimums') return t('fail.minimums', { amount: L.money(r.needCents) });
    if (r.reason === 'interest') return t('fail.interest', { amount: L.money(r.needCents) });
    return t('fail.tooLong', { years: C.MAX_MONTHS / 12 });
  }

  function card(r, best) {
    const box = el('article', 'card' + (best ? ' best' : '')), h = el('h3', '', t('s.' + r.strategy));
    if (best) h.append(el('span', 'pill', t('pill.best')));
    box.append(h, el('p', 'rule', t('rule.' + r.strategy)));
    if (!r.ok) { box.append(el('p', 'alert', failText(r))); return box; }
    const facts = el('dl', 'facts');
    for (const [k, v] of [['fact.end', monthLabel(r.endMonth)], ['fact.duration', t('months', { n: r.months })], ['fact.interest', L.money(r.totalInterestCents)], ['fact.paid', L.money(r.totalPaidCents)]]) {
      const d = el('div'); d.append(el('dt', '', t(k)), el('dd', '', v)); facts.append(d);
    }
    const ol = el('ol', 'payoffs');
    for (const p of r.payoffs) ol.append(el('li', '', t('payoff', { name: p.name, month: monthLabel(p.month) })));
    box.append(facts, el('b', '', t('fact.order')), ol);
    return box;
  }

  function renderCompare(cmp) {
    const box = $('compare');
    if (!state.debts.length) { box.replaceChildren(el('p', 'empty', t('cmp.noDebts'))); return; }
    if (!state.budgetCents) { box.replaceChildren(el('p', 'empty', t('cmp.noBudget'))); return; }
    const nodes = [];
    const minTotal = state.debts.reduce((s, d) => s + d.minCents, 0);
    if (cmp.avalanche.reason === 'minimums') nodes.push(el('p', 'alert', failText(cmp.avalanche)));
    const gap = cmp.interestGapCents;
    const cards = el('div', 'cards');
    cards.append(card(cmp.avalanche, gap > 0), card(cmp.snowball, gap < 0));
    if (cmp.avalanche.reason !== 'minimums') nodes.push(cards);
    if (gap !== null) {
      const parts = [];
      if (gap > 0) parts.push(t('verdict.avalanche', { amount: L.money(gap) }));
      else if (gap < 0) parts.push(t('verdict.snowball', { amount: L.money(-gap) }));
      else parts.push(t('verdict.same'));
      if (cmp.monthsGap > 0) parts.push(t('verdict.sooner', { n: cmp.monthsGap }));
      else if (cmp.monthsGap < 0) parts.push(t('verdict.soonerSnowball', { n: -cmp.monthsGap }));
      const first = cmp.snowball.payoffs[0], firstA = cmp.avalanche.payoffs[0];
      if (first && firstA && first.n < firstA.n) parts.push(t('verdict.firstWin', { name: first.name, month: monthLabel(first.month) }));
      parts.push(t('verdict.extra', { amount: L.money(state.budgetCents - minTotal) }));
      nodes.push(el('p', 'verdict', parts.join(' ')));
    }
    box.replaceChildren(...nodes);
  }

  function renderSchedule(cmp) {
    const box = $('sched');
    const r = cmp && cmp[state.strategy];
    $('csv').disabled = !(r && r.ok);
    if (!r || !r.ok) { box.replaceChildren(el('p', 'empty', t('sched.empty'))); return; }
    const nm = names();
    const scroll = el('div', 'scroll'), table = el('table', 'sched'), head = el('tr');
    scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', t('sched.title'));
    for (const [txt, cls] of [[t('th.month'), ''], [t('th.payment'), 'num'], [t('th.interest'), 'num hide-s'], [t('th.balance'), 'num'], [t('th.paidOff'), '']]) head.append(el('th', cls, txt));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const m of r.schedule) {
      const tr = el('tr', m.paidOff.length ? 'done' : '');
      tr.append(el('td', '', shortMonth(m.month)), el('td', 'num', L.money(m.paymentCents)), el('td', 'num hide-s', L.money(m.interestCents)), el('td', 'num', L.money(m.balanceCents)),
        el('td', 'who', m.paidOff.map((id) => nm.get(id)).join(', ')));
      tbody.append(tr);
    }
    table.append(thead, tbody); scroll.append(table); box.replaceChildren(scroll);
  }

  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    renderDebts();
    let cmp = null;
    try { cmp = result(); } catch (e) { say('plan-status', L.error(e), 'error'); }
    renderCompare(cmp || { avalanche: {}, snowball: {}, interestGapCents: null });
    renderSchedule(cmp);
  }

  // --- Dettes
  $('debt-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (state.debts.length >= C.MAX_DEBTS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_DEBTS })}`);
      const d = C.makeDebt({ name: f.name.value, balance: f.balance.value, rate: f.rate.value, min: f.min.value }, newId());
      if (!save({ ...state, debts: [...state.debts, d] })) return;
      say('debt-status', t('debt.added', { name: d.name }), 'ok');
      f.name.value = ''; f.balance.value = ''; f.rate.value = ''; f.min.value = ''; f.name.focus();
      render();
    } catch (e) { say('debt-status', L.error(e), 'error'); }
  });

  // --- Budget et premier mois
  $('plan-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const plan = C.makePlan({ budget: f.budget.value, startMonth: f.start.value });
      if (!plan.budgetCents) throw new Error('err.budget');
      if (!save({ ...state, ...plan })) return;
      say('plan-status', t('plan.saved'), 'ok');
      render();
    } catch (e) { say('plan-status', L.error(e), 'error'); }
  });
  $('strategy').addEventListener('change', (e) => {
    const next = { ...state, strategy: e.target.value };
    if (readOnly) state = next; else if (!save(next)) return; // simple affichage : pas besoin d'écrire en mode protégé
    render();
  });

  // --- Exemple (dans la langue affichée)
  $('sample').addEventListener('click', () => {
    if (state.debts.length && !confirm(t('confirm.sample'))) return;
    try {
      const debts = [['sample.card', '2400', '19.9', '60'], ['sample.car', '6800', '5.9', '190'], ['sample.personal', '1200', '9.5', '50'], ['sample.overdraft', '450', '15', '25']]
        .map(([k, balance, r, min]) => C.makeDebt({ name: t(k), balance, rate: r, min }, newId()));
      if (!save({ ...state, debts, budgetCents: 60000, startMonth: C.addMonths(thisMonth(), 1) })) return;
      fillPlan(); render();
      say('debt-status', t('sample.added'), 'ok');
    } catch (e) { say('debt-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv').addEventListener('click', () => {
    try {
      const r = result(); if (!r) throw new Error('err.csv');
      const head = ['csv.month', 'csv.debt', 'csv.interest', 'csv.payment', 'csv.balance'].map((k) => t(k, { cur: L.currency }));
      download(`debtstrategy-${state.strategy}.csv`, C.scheduleCsv(r[state.strategy], state.debts, head), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('debtstrategy-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.debts.length, b: next.debts.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true;
      fillPlan(); render();
      say('backup-status', t('backup.restored', { n: next.debts.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('debtstrategy-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { ['debt-status', 'plan-status', 'backup-status'].forEach((id) => say(id, '')); render(); }); // nouvelle langue ou devise
  fillPlan(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
