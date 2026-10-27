/* FXBudget — interface. Calculs dans core.js (FXCore) ; textes, dates et montants dans LouvreI18n.
   La devise de référence est enregistrée avec le voyage (donnée), d'où le menu de langue seul.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.FXCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-fxbudget-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let data = { trip: null, rates: [], expenses: [] };
  let readOnly = false;
  const tf = $('trip-form'), rf = $('rate-form'), ef = $('exp-form');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { trip: next.trip, rates: next.rates, expenses: next.expenses }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const ref = () => (data.trip ? data.trip.ref : tf.ref.value || 'EUR');
  const money = (cents) => L.money(cents, { currency: ref() }); // montant de référence (centimes)
  function fmtMinor(minor, cur) { // montant dans sa propre devise, avec ses décimales
    const d = C.decimals(cur);
    try { return new Intl.NumberFormat(L.locale, { style: 'currency', currency: cur, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d); }
    catch (e) { return `${L.number(minor / 10 ** d)} ${cur}`; }
  }
  const rateNum = (v) => L.number(Number(v), { maximumFractionDigits: 8 });
  // « 1 EUR = 162,35 JPY » se lit de gauche à droite, même en arabe (isolat bidirectionnel LRI … PDI).
  const ltr = (s) => (L.dir === 'rtl' ? `\u2066${s}\u2069` : s);
  const rateText = (r, refCur) => ltr(r.dir === 'toRef' ? `1 ${r.currency} = ${rateNum(r.value)} ${refCur}` : `1 ${refCur} = ${rateNum(r.value)} ${r.currency}`);
  const shortDate = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const catLabel = (c) => t('cat.' + c);
  function fillSelect(sel, values, label) {
    const cur = sel.value;
    sel.replaceChildren(...values.map((v) => { const o = el('option', '', label(v)); o.value = v; return o; }));
    if (values.includes(cur)) sel.value = cur;
  }

  // ---------- Voyage
  function buildTripForm() {
    fillSelect(tf.ref, L.CURRENCIES, (c) => c);
    if (!tf.ref.dataset.init) { tf.ref.value = L.currency; tf.ref.dataset.init = '1'; }
    const box = $('cat-inputs');
    if (!box.children.length) {
      for (const c of C.CATEGORIES) {
        const lab = el('label', 'field'), span = el('span'), inp = el('input');
        span.dataset.cat = c; inp.name = 'cat-' + c; inp.inputMode = 'decimal';
        lab.append(span, inp); box.append(lab);
      }
    }
    for (const span of box.querySelectorAll('span[data-cat]')) span.textContent = `${catLabel(span.dataset.cat)} (${ref()})`;
    for (const n of document.querySelectorAll('.ref-code')) n.textContent = ref();
  }
  tf.ref.addEventListener('change', buildTripForm);
  function fillTripForm() {
    const tr = data.trip; if (!tr) return;
    tf.name.value = tr.name; tf.ref.value = tr.ref; tf.start.value = tr.start; tf.end.value = tr.end;
    tf.budget.value = C.minorText(tr.budgetCents, 2, L.number(1.5).includes(',') ? 'comma' : 'dot');
    for (const c of C.CATEGORIES) tf['cat-' + c].value = tr.catBudgets[c] === null ? '' : C.minorText(tr.catBudgets[c], 2, L.number(1.5).includes(',') ? 'comma' : 'dot');
    buildTripForm();
  }
  tf.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const catBudgets = Object.fromEntries(C.CATEGORIES.map((c) => [c, tf['cat-' + c].value]));
      const trip = C.makeTrip({ name: tf.name.value, ref: tf.ref.value, start: tf.start.value, end: tf.end.value, budget: tf.budget.value, catBudgets }, L.CURRENCIES);
      const first = !data.trip;
      if (!save(C.setTrip(data, trip))) return;
      say('trip-status', t(first ? 'trip.created' : 'trip.updated', { name: trip.name }), 'ok');
      render();
    } catch (e) { say('trip-status', L.error(e), 'error'); }
  });
  $('reset').addEventListener('click', () => {
    if (!data.trip || !confirm(t('trip.confirmReset', { name: data.trip.name }))) return;
    if (!save({ trip: null, rates: [], expenses: [] })) return;
    tf.reset(); delete tf.ref.dataset.init; for (const c of C.CATEGORIES) tf['cat-' + c].value = '';
    buildTripForm(); render(); say('trip-status', t('trip.reset'), 'ok');
  });

  // ---------- Synthèse
  function renderSummary() {
    const tr = data.trip, s = C.summary(data, todayDay());
    $('k-budget').textContent = money(tr.budgetCents);
    $('k-spent').textContent = money(s.spent);
    $('k-left').textContent = money(s.left);
    $('kpi-left').classList.toggle('neg', s.left < 0);
    $('k-day').textContent = s.perDayLeft === null ? '—' : money(s.perDayLeft);
    $('k-day-note').textContent = s.perDayLeft === null ? t('sum.over') : t('sum.daysLeft', { n: s.daysLeft });
    $('alloc-note').hidden = !s.overAllocated;
    $('alloc-note').textContent = t('sum.overAllocated', { a: money(s.allocated), b: money(tr.budgetCents) });
    const table = $('cat-table'), head = el('tr');
    for (const [h, cls] of [[t('th.cat'), ''], [t('th.budget'), 'num'], [t('th.spent'), 'num'], [t('th.left'), 'num']]) head.append(el('th', cls, h));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const c of C.CATEGORIES) {
      const v = s.byCat[c]; if (!v.spent && v.budget === null) continue;
      const tr2 = el('tr', v.left !== null && v.left < 0 ? 'neg' : '');
      const name = el('td'); name.append(el('span', '', catLabel(c)));
      if (v.budget) { const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.min(100, Math.round(100 * v.spent / v.budget)) + '%'; bar.append(fill); name.append(bar); }
      tr2.append(name, el('td', 'num', v.budget === null ? '—' : money(v.budget)), el('td', 'num', money(v.spent)), el('td', 'num', v.left === null ? '—' : money(v.left)));
      tbody.append(tr2);
    }
    if (!tbody.children.length) { const r = el('tr'), td = el('td', 'empty', t('sum.noCat')); td.colSpan = 4; r.append(td); tbody.append(r); }
    table.replaceChildren(thead, tbody);
    $('day-note').textContent = t('sum.planned', { amount: money(s.perDayPlanned), n: s.tripDays });
    const max = Math.max(1, s.perDayPlanned, ...s.days.map((d) => d.spent));
    $('days').replaceChildren(...[...s.days, ...s.outside.map((d) => ({ ...d, outside: true }))].map((d) => {
      const li = el('li', (d.over ? 'over' : '') + (d.outside ? ' outside' : '') + (d.day === todayDay() ? ' today' : ''));
      li.append(el('span', 'd', L.date(d.day, { weekday: 'short', day: 'numeric', month: 'short' }) + (d.outside ? ` (${t('sum.outside')})` : '')));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.round(100 * d.spent / max) + '%'; bar.append(fill);
      li.append(bar, el('b', 'num', d.spent ? money(d.spent) : '—'));
      return li;
    }));
  }

  // ---------- Taux
  function buildDir() {
    const cur = (rf.currency.value || '').trim().toUpperCase() || '???';
    const sel = $('rate-dir'), keep = sel.value || 'fromRef';
    sel.replaceChildren(...[['fromRef', ltr(`1 ${ref()} = … ${cur}`)], ['toRef', ltr(`1 ${cur} = … ${ref()}`)]].map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    sel.value = keep;
  }
  rf.currency.addEventListener('input', buildDir);
  function renderRates() {
    const list = [...data.rates].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : a.date < b.date ? 1 : -1));
    if (!list.length) { $('rates').replaceChildren(el('li', 'empty', t('rates.empty'))); return; }
    $('rates').replaceChildren(...list.map((r) => {
      const li = el('li'), txt = el('div', 'txt'); txt.append(el('b', '', rateText(r, data.trip.ref)), el('span', '', t('rates.dated', { date: shortDate(r.date) })));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.deleteRate', { rate: rateText(r, data.trip.ref), date: shortDate(r.date) }));
      del.addEventListener('click', () => {
        try { if (save(C.removeRate(data, r.id))) { render(); say('rate-status', t('rates.deleted'), 'ok'); } }
        catch (e) { say('rate-status', L.error(e), 'error'); }
      });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  rf.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const rate = C.makeRate({ currency: rf.currency.value, dir: rf.dir.value, value: rf.value.value, date: rf.date.value || todayDay() }, newId(), data.trip);
      if (!save(C.addRate(data, rate))) return;
      say('rate-status', t('rates.added', { rate: rateText(rate, data.trip.ref), date: shortDate(rate.date) }), 'ok');
      rf.value.value = ''; render();
      ef.currency.value = rate.currency; updatePreview();
    } catch (e) { say('rate-status', L.error(e), 'error'); }
  });

  // ---------- Dépenses
  function buildExpenseForm() {
    fillSelect($('exp-cat'), C.CATEGORIES, catLabel);
    const curs = data.trip ? [data.trip.ref, ...[...new Set(data.rates.map((r) => r.currency))].sort()] : [];
    fillSelect($('exp-cur'), curs, (c) => c);
  }
  function readExpense(id) { return C.makeExpense({ date: ef.date.value || todayDay(), category: ef.category.value, label: ef.label.value, currency: ef.currency.value, amount: ef.amount.value }, id, data.trip, data.rates); }
  function convText(c) {
    if (!c.rate) return money(c.cents);
    return t(c.later ? 'conv.later' : 'conv.with', { amount: money(c.cents), rate: rateText(c.rate, data.trip.ref), date: shortDate(c.rate.date) });
  }
  function updatePreview() { // aperçu de la conversion pendant la saisie, sans rien enregistrer
    const p = $('preview');
    if (!data.trip || !ef.amount.value.trim()) { p.textContent = ''; return; }
    try { const c = C.converted(readExpense('preview-0000'), data.trip, data.rates); p.textContent = '≈ ' + convText(c); p.className = 'preview span'; }
    catch (e) { p.textContent = L.error(e); p.className = 'preview span error'; }
  }
  for (const n of [ef.amount, ef.currency, ef.date]) { n.addEventListener('input', updatePreview); n.addEventListener('change', updatePreview); }
  ef.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const e = readExpense(newId());
      if (!save(C.addExpense(data, e))) return;
      const c = C.converted(e, data.trip, data.rates);
      say('exp-status', t('exp.added', { amount: fmtMinor(e.minor, e.currency), conv: money(c.cents) }), 'ok');
      ef.amount.value = ''; ef.label.value = ''; render(); ef.amount.focus();
    } catch (e) { say('exp-status', L.error(e), 'error'); }
  });
  function renderExpenses() {
    const list = data.expenses.map((e) => C.converted(e, data.trip, data.rates)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 300);
    if (!list.length) { $('expenses').replaceChildren(el('li', 'empty', t('exp.empty'))); return; }
    $('expenses').replaceChildren(...list.map((c) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', c.currency === data.trip.ref ? money(c.cents) : t('exp.line', { orig: fmtMinor(c.minor, c.currency), conv: money(c.cents) })));
      txt.append(el('span', '', [L.date(c.date), catLabel(c.category), c.label].filter(Boolean).join(' · ')));
      if (c.rate) txt.append(el('span', c.later ? 'warn' : '', t(c.later ? 'conv.laterShort' : 'conv.rate', { rate: rateText(c.rate, data.trip.ref), date: shortDate(c.rate.date) })));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.deleteExp', { amount: fmtMinor(c.minor, c.currency), date: L.date(c.date) }));
      del.addEventListener('click', () => { if (save(C.removeExpense(data, c.id))) { render(); say('exp-status', t('exp.deleted'), 'ok'); } });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }

  function render() {
    $('trip-area').hidden = !data.trip;
    $('reset').disabled = !data.trip;
    $('save-trip').textContent = t(data.trip ? 'btn.updateTrip' : 'btn.saveTrip');
    tf.ref.disabled = !!(data.trip && (data.rates.length || data.expenses.length)); // devise verrouillée dès qu'il y a des taux ou dépenses
    buildTripForm(); buildDir(); buildExpenseForm();
    $('export-csv').disabled = !data.expenses.length;
    if (!data.trip) return;
    renderSummary(); renderRates(); renderExpenses(); updatePreview();
  }

  // ---------- Exemple dans la langue affichée (taux de démonstration, pas des cours réels)
  $('sample').addEventListener('click', () => {
    if (data.trip && !confirm(t('sample.confirm'))) return;
    try {
      const today = todayDay(), start = C.addDays(today, -2), end = C.addDays(today, 7);
      const trip = C.makeTrip({ name: t('sample.trip'), ref: 'EUR', start, end, budget: '2000', catBudgets: { lodging: '900', food: '400', transport: '300', activities: '250' } }, L.CURRENCIES);
      let next = { trip, rates: [], expenses: [] };
      next = C.addRate(next, C.makeRate({ currency: 'JPY', dir: 'fromRef', value: '160', date: C.addDays(today, -10) }, newId(), trip));
      next = C.addRate(next, C.makeRate({ currency: 'USD', dir: 'toRef', value: '0.92', date: C.addDays(today, -10) }, newId(), trip));
      const add = (d, category, currency, amount, k) => { next = C.addExpense(next, C.makeExpense({ date: C.addDays(start, d), category, currency, amount, label: t('sample.' + k) }, newId(), trip, next.rates)); };
      add(0, 'lodging', 'EUR', '480', 'hotel');
      add(0, 'transport', 'JPY', '3200', 'train');
      add(1, 'food', 'JPY', '1500', 'ramen');
      add(1, 'activities', 'JPY', '2000', 'museum');
      add(2, 'shopping', 'USD', '12.50', 'souvenir');
      if (!save(next)) return;
      fillTripForm(); render(); say('trip-status', t('sample.done'), 'ok');
    } catch (e) { say('trip-status', L.error(e), 'error'); }
  });

  // ---------- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      const headers = ['csv.date', 'csv.category', 'csv.label', 'csv.amount', 'csv.currency', 'csv.rate', 'csv.rateDate', 'csv.converted', 'csv.ref'].map((k) => t(k));
      const csv = C.toCSV(data, { headers, catLabel, decimal: L.number(1.5).includes(',') ? 'comma' : 'dot', dirText: (r, refCur) => (r.dir === 'toRef' ? `1 ${r.currency} = ${r.value} ${refCur}` : `1 ${refCur} = ${r.value} ${r.currency}`) });
      download('fxbudget-expenses.csv', csv, 'text/csv;charset=utf-8'); say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('fxbudget-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (e) { throw new Error('err.json'); }
      const next = C.validateData(parsed);
      if (!confirm(t('backup.confirm', { a: data.expenses.length, b: next.expenses.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true; fillTripForm(); render();
      say('backup-status', t('backup.restored', { n: next.expenses.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('fxbudget-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  buildTripForm();
  if (data.trip) fillTripForm(); else { tf.start.value = todayDay(); tf.end.value = C.addDays(todayDay(), 6); }
  L.onChange(() => { // la saisie en cours est conservée ; seuls les libellés et formats changent
    for (const id of ['trip-status', 'rate-status', 'exp-status', 'backup-status']) say(id, '');
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
