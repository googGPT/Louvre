/* CashEnvelope — interface. Calculs dans core.js (EnvelopeCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.EnvelopeCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  const KEY = 'louvre-cashenvelope-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pad = (n) => String(n).padStart(2, '0');
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toInput = (cents) => (cents / 100).toFixed(2); // valeur éditable d'un montant

  let state = C.emptyState(); // réglages, enveloppes, dépenses
  let month = todayDay().slice(0, 7); // mois affiché
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const monthLabel = (m) => L.date(m + '-01', { month: 'long', year: 'numeric' });
  const signed = (c) => L.money(c, { signDisplay: 'exceptZero' });

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // Remplit le formulaire des réglages (au démarrage, après un exemple ou une restauration seulement).
  function fillSettings() {
    const f = $('settings-form');
    f.income.value = state.settings.incomeCents ? toInput(state.settings.incomeCents) : '';
    f.alertPct.value = String(state.settings.alertPct);
  }
  // Date proposée pour une dépense : aujourd'hui si c'est le mois affiché, sinon le 1er du mois.
  function defaultDay() { $('exp-form').day.value = todayDay().slice(0, 7) === month ? todayDay() : month + '-01'; }

  function renderEnvelopes() {
    const list = $('env-list');
    if (!state.envelopes.length) { list.replaceChildren(el('li', 'empty', t('env.empty'))); return; }
    const sorted = [...state.envelopes].sort((a, b) => a.name.localeCompare(b.name, L.locale));
    list.replaceChildren(...sorted.map((e) => {
      const li = el('li'), txt = el('div', 'txt'), acts = el('div', 'acts');
      txt.append(el('b', '', e.name));
      txt.append(el('span', '', t('env.line', { budget: L.money(e.budgetCents), from: monthLabel(e.fromMonth) })));
      if (e.rollover) txt.append(el('span', 'tag', t('env.rolloverTag')));
      const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: e.name }));
      edit.addEventListener('click', () => editBudget(e));
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeEnv', { name: e.name })); del.title = t('btn.remove');
      del.addEventListener('click', () => removeEnvelope(e));
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }

  function renderMonth() {
    $('month-label').textContent = monthLabel(month);
    const s = C.monthSummary(state, month);
    const kpis = [];
    const kpi = (label, value, bad) => { const k = el('div', 'kpi' + (bad ? ' bad' : '')); k.append(el('span', '', label), el('strong', '', value)); kpis.push(k); };
    if (s.incomeCents > 0) { kpi(t('kpi.income'), L.money(s.incomeCents)); kpi(t('kpi.unallocated'), L.money(s.unallocatedCents), s.unallocatedCents < 0); }
    kpi(t('kpi.allocated'), L.money(s.allocatedCents));
    kpi(t('kpi.spent'), L.money(s.spentCents));
    kpi(t('kpi.left'), L.money(s.balanceCents), s.balanceCents < 0);
    $('kpis').replaceChildren(...kpis);
    const alerts = [];
    if (s.overAllocated) alerts.push(el('li', 'alloc', t('alert.alloc', { amount: L.money(-s.unallocatedCents) })));
    for (const a of s.alerts) alerts.push(a.status === 'over'
      ? el('li', 'over', t('alert.over', { name: a.name, amount: L.money(-a.balanceCents) }))
      : el('li', 'warn', t('alert.warn', { name: a.name, pct: L.number(a.usedPct) })));
    $('alerts').replaceChildren(...alerts);
    if (!s.rows.length) { $('envs').replaceChildren(el('li', 'empty', t('month.empty'))); return; }
    $('envs').replaceChildren(...s.rows.map((r) => {
      const li = el('li', r.status), head = el('div', 'head'), title = el('b', '', r.name + ' ');
      if (r.status !== 'ok') title.append(el('span', 'tag', t('status.' + r.status)));
      head.append(title, el('span', 'bal', t('env.left', { amount: L.money(r.balanceCents) })));
      const gauge = el('div', 'gauge'), fill = el('i');
      fill.style.width = Math.min(100, Math.max(0, r.usedPct)) + '%';
      gauge.append(fill);
      gauge.setAttribute('role', 'img'); gauge.setAttribute('aria-label', t('aria.gauge', { pct: L.number(r.usedPct) }));
      const meta = r.rollover
        ? t('env.metaCarry', { budget: L.money(r.budgetCents), carry: signed(r.carryCents), spent: L.money(r.spentCents) })
        : t('env.meta', { budget: L.money(r.budgetCents), spent: L.money(r.spentCents) });
      li.append(head, gauge, el('div', 'meta', meta));
      return li;
    }));
  }

  function renderExpenseForm() {
    const sel = $('exp-form').envelope, keep = sel.value;
    const open = state.envelopes.filter((e) => e.fromMonth <= month).sort((a, b) => a.name.localeCompare(b.name, L.locale));
    sel.replaceChildren(...open.map((e) => { const o = el('option', '', e.name); o.value = e.id; return o; }));
    if (open.some((e) => e.id === keep)) sel.value = keep;
    sel.disabled = $('add-exp').disabled = !open.length;
  }

  function renderExpenses() {
    const names = new Map(state.envelopes.map((e) => [e.id, e.name]));
    const xs = C.monthExpenses(state, month);
    if (!xs.length) { $('exp-list').replaceChildren(el('li', 'empty', t('list.empty'))); return; }
    $('exp-list').replaceChildren(...xs.map((x) => {
      const li = el('li'), txt = el('div', 'txt'), acts = el('div', 'acts');
      txt.append(el('b', '', names.get(x.envelopeId) || ''));
      txt.append(el('span', '', [L.date(x.day, { day: 'numeric', month: 'short' }), x.note].filter(Boolean).join(' · ')));
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.title = t('btn.remove');
      del.setAttribute('aria-label', t('aria.removeExp', { amount: L.money(x.amountCents), date: L.date(x.day) }));
      del.addEventListener('click', () => { if (save({ ...state, expenses: state.expenses.filter((y) => y.id !== x.id) })) render(); });
      acts.append(el('span', 'amt', L.money(x.amountCents)), del); li.append(txt, acts); return li;
    }));
  }

  function render() {
    document.querySelectorAll('.cur').forEach((n) => { n.textContent = L.currencySymbol(); });
    renderEnvelopes(); renderMonth(); renderExpenseForm(); renderExpenses();
  }

  // --- Réglages
  $('settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const settings = C.makeSettings({ income: f.income.value, alertPct: f.alertPct.value });
      if (save({ ...state, settings })) { render(); say('settings-status', t('settings.saved'), 'ok'); }
    } catch (e) { say('settings-status', L.error(e), 'error'); }
  });

  // --- Enveloppes
  $('env-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (state.envelopes.length >= C.MAX_ENVELOPES) throw new Error(`err.tooManyEnvelopes|${JSON.stringify({ max: C.MAX_ENVELOPES })}`);
      const e = C.makeEnvelope({ name: f.name.value, budget: f.budget.value, rollover: f.rollover.checked, fromMonth: month }, newId());
      if (state.envelopes.some((x) => x.name.toLocaleLowerCase(L.locale) === e.name.toLocaleLowerCase(L.locale))) throw new Error('err.duplicate');
      if (!save({ ...state, envelopes: [...state.envelopes, e] })) return;
      say('env-status', t('env.added', { name: e.name, from: monthLabel(month) }), 'ok');
      f.name.value = ''; f.budget.value = ''; f.rollover.checked = false; f.name.focus();
      render();
    } catch (e) { say('env-status', L.error(e), 'error'); }
  });
  function editBudget(env) {
    const v = prompt(t('prompt.budget', { name: env.name }), toInput(env.budgetCents));
    if (v === null) return;
    try {
      const fixed = C.makeEnvelope({ name: env.name, budget: v, rollover: env.rollover, fromMonth: env.fromMonth }, env.id);
      if (save({ ...state, envelopes: state.envelopes.map((e) => (e.id === env.id ? fixed : e)) })) { render(); say('env-status', t('env.updated', { name: env.name }), 'ok'); }
    } catch (e) { say('env-status', L.error(e), 'error'); }
  }
  function removeEnvelope(env) {
    const n = state.expenses.filter((x) => x.envelopeId === env.id).length;
    if (!confirm(t('confirm.removeEnv', { name: env.name, n }))) return;
    if (save({ ...state, envelopes: state.envelopes.filter((e) => e.id !== env.id), expenses: state.expenses.filter((x) => x.envelopeId !== env.id) })) render();
  }

  // --- Dépenses
  $('exp-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (state.expenses.length >= C.MAX_EXPENSES) throw new Error(`err.tooManyExpenses|${JSON.stringify({ max: C.MAX_EXPENSES })}`);
      const x = C.makeExpense({ envelopeId: f.envelope.value, day: f.day.value, amount: f.amount.value, note: f.note.value }, newId(), state.envelopes);
      if (!save({ ...state, expenses: [...state.expenses, x] })) return;
      if (x.day.slice(0, 7) !== month) month = x.day.slice(0, 7); // on montre le mois de la dépense
      const env = state.envelopes.find((e) => e.id === x.envelopeId);
      const row = C.monthSummary(state, month).rows.find((r) => r.id === x.envelopeId);
      say('exp-status', t('exp.added', { amount: L.money(x.amountCents), name: env.name, left: L.money(row.balanceCents) }), row.status === 'over' ? 'error' : 'ok');
      f.amount.value = ''; f.note.value = ''; f.amount.focus();
      render();
    } catch (e) { say('exp-status', L.error(e), 'error'); }
  });

  // --- Navigation entre les mois
  function go(m) { month = m; defaultDay(); say('exp-status', ''); render(); }
  $('prev').addEventListener('click', () => go(C.addMonths(month, -1)));
  $('next').addEventListener('click', () => go(C.addMonths(month, 1)));
  $('today').addEventListener('click', () => go(todayDay().slice(0, 7)));

  // --- Exemple (dans la langue affichée)
  $('sample').addEventListener('click', () => {
    if ((state.envelopes.length || state.expenses.length) && !confirm(t('confirm.sample'))) return;
    try {
      const cur = todayDay().slice(0, 7), prev = C.addMonths(cur, -1);
      const defs = [['sample.groceries', '450', true], ['sample.housing', '900', false], ['sample.transport', '120', true], ['sample.leisure', '150', false], ['sample.restaurants', '100', true], ['sample.unexpected', '200', true]];
      const envs = defs.map(([k, budget, rollover]) => C.makeEnvelope({ name: t(k), budget, rollover, fromMonth: prev }, newId()));
      const [food, home, move, fun, eat] = envs;
      const spends = [[food, prev, '03', '120.40', 'sample.noteMarket'], [food, prev, '12', '95.10', ''], [food, prev, '20', '180', ''], [home, prev, '01', '900', 'sample.noteRent'],
        [move, prev, '05', '75', ''], [fun, prev, '14', '80', 'sample.noteCinema'], [eat, prev, '18', '130', ''],
        [food, cur, '01', '88.30', 'sample.noteMarket'], [food, cur, '02', '64.90', ''], [home, cur, '01', '900', 'sample.noteRent'], [move, cur, '02', '60', ''], [fun, cur, '01', '142', ''], [eat, cur, '02', '85', '']];
      const expenses = spends.map(([e, m, d, amount, note]) => C.makeExpense({ envelopeId: e.id, day: `${m}-${d}`, amount, note: note ? t(note) : '' }, newId(), envs));
      const next = { settings: C.makeSettings({ income: '2400', alertPct: '80' }), envelopes: envs, expenses };
      if (!save(next)) return;
      month = cur; fillSettings(); defaultDay(); render();
      say('settings-status', t('sample.added'), 'ok');
    } catch (e) { say('settings-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('csv-summary').addEventListener('click', () => {
    try {
      const head = ['csv.envelope', 'csv.budget', 'csv.carry', 'csv.spent', 'csv.balance', 'csv.status'].map((k) => t(k, { cur: L.currency }));
      download(`cashenvelope-${month}-summary.csv`, C.summaryCsv(C.monthSummary(state, month), head, (s) => t('status.' + s)), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('csv-expenses').addEventListener('click', () => {
    try {
      const head = ['csv.date', 'csv.envelope', 'csv.note', 'csv.amount'].map((k) => t(k, { cur: L.currency }));
      download(`cashenvelope-${month}-expenses.csv`, C.expensesCsv(state, month, head), 'text/csv');
      say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('cashenvelope-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.envelopes.length, b: next.envelopes.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true;
      fillSettings(); render();
      say('backup-status', t('backup.restored', { n: next.envelopes.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => {
    let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien à copier */ }
    download('cashenvelope-raw-storage.txt', raw, 'text/plain');
  });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { ['settings-status', 'env-status', 'exp-status', 'backup-status'].forEach((id) => say(id, '')); render(); }); // nouvelle langue ou devise
  fillSettings(); defaultDay(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
