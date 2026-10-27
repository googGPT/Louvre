/* PetCareLog — interface. Calculs dans core.js (PetCore) ; textes, dates et montants dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.PetCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-petcarelog-v1';
  const ACTIVE = 'louvre-petcarelog-active'; // animal affiché (simple confort)
  const SVG = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const svg = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v)); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  let data = C.emptyData();
  let readOnly = false;
  let activeId = null;
  let editingPet = false;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { pets: next.pets, cares: next.cares, appts: next.appts, weights: next.weights, expenses: next.expenses }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const active = () => data.pets.find((p) => p.id === activeId) || null;
  const petName = (id) => { const p = data.pets.find((x) => x.id === id); return p ? p.name : '?'; };
  const sortedPets = () => [...data.pets].sort((a, b) => a.name.localeCompare(b.name, L.locale));
  const careName = (c) => (c.label ? `${t('type.' + c.type)} · ${c.label}` : t('type.' + c.type));
  const kg = (g) => `${L.number(g / 1000, { maximumFractionDigits: 3 })} kg`;
  const shortDate = (d) => L.date(d, { day: 'numeric', month: 'short', year: 'numeric' });
  function relText(days) { return days < 0 ? t('rel.late', { n: -days }) : days === 0 ? t('rel.today') : t('rel.in', { n: days }); }
  function setActive(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (e) { /* confort seulement */ } }
  // Remplit un menu de valeurs traduites en gardant la valeur choisie.
  function fillSelect(sel, values, label) {
    const cur = sel.value;
    sel.replaceChildren(...values.map((v) => { const o = el('option', '', label(v)); o.value = v; return o; }));
    if (values.includes(cur)) sel.value = cur;
  }
  function buildSelects() {
    fillSelect($('care-type'), C.CARE_TYPES, (v) => t('type.' + v));
    const n = Number($('care-form').every.value) || 1;
    fillSelect($('care-unit'), C.UNITS, (v) => t('unit.' + v, { n }));
    fillSelect($('exp-cat'), C.EXPENSE_CATS, (v) => t('cat.' + v));
  }
  $('care-form').every.addEventListener('input', () => fillSelect($('care-unit'), C.UNITS, (v) => t('unit.' + v, { n: Number($('care-form').every.value) || 1 })));

  // ---------- Animaux
  function renderPets() {
    const tabs = $('pet-tabs');
    if (!data.pets.length) { tabs.replaceChildren(el('p', 'empty', t('pets.empty'))); }
    else tabs.replaceChildren(...sortedPets().map((p) => {
      const b = el('button', 'tab', p.name); b.type = 'button'; b.setAttribute('aria-pressed', String(p.id === activeId));
      b.addEventListener('click', () => { setActive(p.id); if (editingPet) resetPetForm(); render(); });
      return b;
    }));
    $('pet-area').hidden = !active();
    $('edit-pet').disabled = $('delete-pet').disabled = !active();
    for (const id of ['who-care', 'who-weight']) $(id).textContent = active() ? `— ${active().name}` : '';
  }
  function resetPetForm() { editingPet = false; $('pet-form').reset(); $('save-pet').textContent = t('btn.addPet'); $('cancel-pet').hidden = true; }
  $('pet-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const pet = C.makePet({ name: f.name.value, species: f.species.value, birth: f.birth.value }, editingPet ? activeId : newId());
      if (data.pets.some((p) => p.id !== pet.id && p.name.toLocaleLowerCase(L.locale) === pet.name.toLocaleLowerCase(L.locale))) throw new Error('err.petExists');
      if (!save(C.upsert(data, 'pets', pet))) return;
      say('pet-status', t(editingPet ? 'pet.updated' : 'pet.added', { name: pet.name }), 'ok');
      setActive(pet.id); resetPetForm(); render();
    } catch (e) { say('pet-status', L.error(e), 'error'); }
  });
  $('edit-pet').addEventListener('click', () => {
    const p = active(); if (!p) return;
    const f = $('pet-form'); f.name.value = p.name; f.species.value = p.species; f.birth.value = p.birth;
    editingPet = true; $('save-pet').textContent = t('btn.updatePet'); $('cancel-pet').hidden = false; f.name.focus();
  });
  $('cancel-pet').addEventListener('click', () => { resetPetForm(); say('pet-status', ''); });
  $('delete-pet').addEventListener('click', () => {
    const p = active(); if (!p) return;
    const n = ['cares', 'appts', 'weights', 'expenses'].reduce((a, k) => a + data[k].filter((x) => x.petId === p.id).length, 0);
    if (!confirm(t('pet.confirmDelete', { name: p.name, n }))) return;
    if (!save(C.removePet(data, p.id))) return;
    resetPetForm(); setActive(sortedPets()[0] ? sortedPets()[0].id : null); render();
    say('pet-status', t('pet.deleted', { name: p.name }), 'ok');
  });

  // ---------- Soins et rendez-vous
  function renderCares() {
    const p = active(); if (!p) return;
    const today = todayDay(), list = C.caresFor(data.cares, p.id, today);
    if (!list.length) { $('cares').replaceChildren(el('li', 'empty', t('care.empty'))); }
    else $('cares').replaceChildren(...list.map((c) => {
      const li = el('li', 'state-' + c.state), txt = el('div', 'txt');
      txt.append(el('b', '', careName(c)));
      txt.append(el('span', 'rel', `${t('care.next', { date: shortDate(c.next) })} · ${relText(c.days)}`));
      txt.append(el('span', '', `${t('care.every', { n: L.number(c.every), unit: t('unit.' + c.unit, { n: c.every }) })} · ${t('care.last', { date: shortDate(c.last) })}`));
      const acts = el('div', 'acts');
      const done = el('button', 'btn small good', t('btn.done')); done.type = 'button'; done.setAttribute('aria-label', t('aria.done', { care: careName(c) }));
      done.addEventListener('click', () => {
        try {
          const cur = data.cares.find((x) => x.id === c.id), next = C.markCareDone(cur, today, today);
          if (save(C.upsert(data, 'cares', next))) { render(); say('care-status', t('care.done', { care: careName(c), date: shortDate(C.nextDue(next)) }), 'ok'); }
        } catch (e) { say('care-status', L.error(e), 'error'); }
      });
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: careName(c) }));
      del.addEventListener('click', () => { if (confirm(t('care.confirmDelete', { care: careName(c) })) && save(C.removeItem(data, 'cares', c.id))) { render(); say('care-status', t('care.deleted'), 'ok'); } });
      acts.append(done, del); li.append(txt, acts); return li;
    }));
    const { upcoming, past } = C.apptsFor(data.appts, p.id, today);
    const rows = [...upcoming, ...past.slice(0, 5)];
    if (!rows.length) { $('appts').replaceChildren(el('li', 'empty', t('appt.empty'))); return; }
    $('appts').replaceChildren(...rows.map((a) => {
      const isPast = C.dayDiff(a.date, today) < 0, li = el('li', isPast ? 'past' : ''), txt = el('div', 'txt');
      txt.append(el('b', '', a.title));
      const when = L.date(a.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + (a.time ? ` · ${a.time}` : '');
      txt.append(el('span', '', [when, a.place, isPast ? t('appt.past') : relText(C.dayDiff(a.date, today))].filter(Boolean).join(' · ')));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: a.title }));
      del.addEventListener('click', () => { if (save(C.removeItem(data, 'appts', a.id))) { render(); say('appt-status', t('appt.deleted'), 'ok'); } });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  $('care-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const c = C.makeCare({ petId: activeId, type: f.type.value, label: f.label.value, every: f.every.value, unit: f.unit.value, last: f.last.value || todayDay(), note: '' }, newId(), data.pets, todayDay());
      if (!save(C.upsert(data, 'cares', c))) return;
      say('care-status', t('care.added', { care: careName(c), date: shortDate(C.nextDue(c)) }), 'ok');
      f.label.value = ''; f.last.value = ''; render();
    } catch (e) { say('care-status', L.error(e), 'error'); }
  });
  $('appt-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const a = C.makeAppt({ petId: activeId, title: f.title.value, date: f.date.value, time: f.time.value, place: f.place.value }, newId(), data.pets);
      if (!save(C.upsert(data, 'appts', a))) return;
      say('appt-status', t('appt.added', { title: a.title, date: L.date(a.date) }), 'ok');
      f.reset(); render();
    } catch (e) { say('appt-status', L.error(e), 'error'); }
  });

  // ---------- Poids
  function renderWeight() {
    const p = active(); if (!p) return;
    const series = C.weightSeries(data.weights, p.id), st = C.weightStats(series);
    const kpi = (label, value) => { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    $('weight-kpis').replaceChildren(...(st ? [
      kpi(t('weight.last'), kg(st.last.grams)),
      kpi(t('weight.change'), `${st.changeGrams > 0 ? '+' : ''}${kg(st.changeGrams)} (${st.changePermil > 0 ? '+' : ''}${L.number(st.changePermil / 10)} %)`),
      kpi(t('weight.range'), `${kg(st.minGrams)} – ${kg(st.maxGrams)}`),
    ] : []));
    renderChart(series);
    const rows = [...series].reverse().slice(0, 100);
    if (!rows.length) { $('weights').replaceChildren(el('li', 'empty', t('weight.empty'))); return; }
    $('weights').replaceChildren(...rows.map((w) => {
      const li = el('li'), txt = el('div', 'txt'); txt.append(el('b', '', kg(w.grams)), el('span', '', L.date(w.date)));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: `${kg(w.grams)} — ${L.date(w.date)}` }));
      del.addEventListener('click', () => { if (save(C.removeItem(data, 'weights', w.id))) { render(); say('weight-status', t('weight.deleted'), 'ok'); } });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  function renderChart(series) {
    const box = $('chart');
    if (series.length < 2) { box.replaceChildren(el('p', 'empty', t('weight.needTwo'))); return; }
    const W = Math.round(Math.max(300, Math.min(960, box.clientWidth - 18))), H = 220, pad = { left: 70, right: 16, top: 14, bottom: 34 }; // pixels réels : texte lisible
    const g = C.chartGeometry(series, W, H, pad);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', direction: 'ltr', class: 'chart-svg' });
    root.setAttribute('aria-label', t('weight.chart', { name: active().name, n: series.length, first: kg(series[0].grams), last: kg(series[series.length - 1].grams) }));
    for (const tk of g.ticks) {
      root.append(svg('line', { x1: pad.left, x2: W - pad.right, y1: tk.y, y2: tk.y, class: 'grid' }));
      const lab = svg('text', { x: pad.left - 8, y: tk.y + 4, 'text-anchor': 'end', class: 'axis' }); lab.textContent = kg(tk.grams); root.append(lab);
    }
    const d0 = svg('text', { x: pad.left, y: H - 10, 'text-anchor': 'start', class: 'axis' }); d0.textContent = shortDate(series[0].date);
    const d1 = svg('text', { x: W - pad.right, y: H - 10, 'text-anchor': 'end', class: 'axis' }); d1.textContent = shortDate(series[series.length - 1].date);
    root.append(d0, d1, svg('polyline', { points: g.points.map((pt) => `${pt.x},${pt.y}`).join(' '), class: 'line' }));
    for (const pt of g.points) {
      const c = svg('circle', { cx: pt.x, cy: pt.y, r: 5, class: 'dot' });
      const tip = svg('title'); tip.textContent = `${L.date(pt.date)} : ${kg(pt.grams)}`; c.append(tip); root.append(c);
    }
    box.replaceChildren(root);
  }
  $('weight-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      const w = C.makeWeight({ petId: activeId, date: f.date.value || todayDay(), value: f.value.value, unit: f.unit.value }, newId(), data.pets, todayDay());
      if (!save(C.upsert(data, 'weights', w))) return;
      say('weight-status', t('weight.added', { w: kg(w.grams), date: L.date(w.date) }), 'ok');
      f.value.value = ''; render();
    } catch (e) { say('weight-status', L.error(e), 'error'); }
  });

  // ---------- Dépenses
  function renderExpenses() {
    $('cur-symbol').textContent = L.currencySymbol();
    const pets = sortedPets();
    fillSelect($('exp-pet'), pets.map((p) => p.id), petName);
    if (activeId && pets.some((p) => p.id === activeId) && !$('exp-form').dataset.touched) $('exp-pet').value = activeId;
    $('add-exp').disabled = !pets.length;
    const ys = C.years(data.expenses), ysel = $('exp-year'), ycur = ysel.value;
    const yAll = el('option', '', t('exp.allYears')); yAll.value = '';
    ysel.replaceChildren(yAll, ...ys.map((y) => { const o = el('option', '', y); o.value = y; return o; }));
    ysel.value = ys.includes(ycur) ? ycur : '';
    const psel = $('exp-filter'), pcur = psel.value;
    const pAll = el('option', '', t('exp.allPets')); pAll.value = '';
    psel.replaceChildren(pAll, ...pets.map((p) => { const o = el('option', '', p.name); o.value = p.id; return o; }));
    psel.value = pets.some((p) => p.id === pcur) ? pcur : '';
    const filter = { year: ysel.value || null, petId: psel.value || null };
    const tot = C.expenseTotals(data.expenses, filter);
    $('exp-total').textContent = t('exp.total', { amount: L.money(tot.total), n: tot.count });
    const bars = (box, entries, label) => {
      const max = Math.max(1, ...entries.map(([, v]) => v));
      if (!entries.length) { box.replaceChildren(el('li', 'empty', '—')); return; }
      box.replaceChildren(...entries.map(([k, v]) => {
        const li = el('li'), head = el('div', 'bar-head'); head.append(el('span', '', label(k)), el('b', '', L.money(v)));
        const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.max(2, Math.round(100 * v / max)) + '%'; bar.append(fill);
        li.append(head, bar); return li;
      }));
    };
    bars($('by-cat'), Object.entries(tot.byCategory).sort((a, b) => b[1] - a[1]), (k) => t('cat.' + k));
    bars($('by-pet'), Object.entries(tot.byPet).sort((a, b) => b[1] - a[1]), petName);
    const rows = data.expenses.filter((e) => (!filter.petId || e.petId === filter.petId) && (!filter.year || e.date.startsWith(filter.year)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 200);
    if (!rows.length) { $('expenses').replaceChildren(el('li', 'empty', t('exp.empty'))); return; }
    $('expenses').replaceChildren(...rows.map((e) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', `${L.money(e.cents)} — ${t('cat.' + e.category)}`), el('span', '', [L.date(e.date), petName(e.petId), e.label].filter(Boolean).join(' · ')));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: `${L.money(e.cents)} — ${L.date(e.date)}` }));
      del.addEventListener('click', () => { if (save(C.removeItem(data, 'expenses', e.id))) { render(); say('exp-status', t('exp.deleted'), 'ok'); } });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
  }
  $('exp-pet').addEventListener('change', () => { $('exp-form').dataset.touched = '1'; });
  $('exp-year').addEventListener('change', renderExpenses);
  $('exp-filter').addEventListener('change', renderExpenses);
  $('exp-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (!f.pet.value) throw new Error('err.petUnknown');
      const e = C.makeExpense({ petId: f.pet.value, date: f.date.value || todayDay(), category: f.category.value, amount: f.amount.value, label: f.label.value }, newId(), data.pets);
      if (!save(C.upsert(data, 'expenses', e))) return;
      say('exp-status', t('exp.added', { amount: L.money(e.cents), name: petName(e.petId) }), 'ok');
      f.amount.value = ''; f.label.value = ''; render();
    } catch (e) { say('exp-status', L.error(e), 'error'); }
  });

  function render() {
    if (!active()) setActive(sortedPets()[0] ? sortedPets()[0].id : null);
    renderPets(); renderCares(); renderWeight(); renderExpenses();
    $('export-ics').disabled = !data.cares.length && !data.appts.length;
    $('export-exp').disabled = !data.expenses.length; $('export-weights').disabled = !data.weights.length;
  }

  // ---------- Exemple dans la langue affichée (valeurs de démonstration)
  $('sample').addEventListener('click', () => {
    if (data.pets.length && !confirm(t('sample.confirm'))) return;
    try {
      const today = todayDay(), ago = (n) => C.addDays(today, -n);
      const dog = C.makePet({ name: t('sample.dog'), species: t('sample.dogSpecies'), birth: C.addDays(today, -4 * 365) }, newId());
      const cat = C.makePet({ name: t('sample.cat'), species: t('sample.catSpecies'), birth: '' }, newId());
      const pets = [dog, cat];
      let next = { ...C.emptyData(), pets };
      const add = (list, item) => { next = C.upsert(next, list, item); };
      add('cares', C.makeCare({ petId: dog.id, type: 'vaccine', label: t('sample.vaccine'), every: '1', unit: 'year', last: C.addMonths(today, -11), note: '' }, newId(), pets, today));
      add('cares', C.makeCare({ petId: dog.id, type: 'deworm', label: '', every: '13', unit: 'week', last: ago(96), note: '' }, newId(), pets, today));
      add('cares', C.makeCare({ petId: cat.id, type: 'grooming', label: '', every: '6', unit: 'week', last: ago(20), note: '' }, newId(), pets, today));
      add('appts', C.makeAppt({ petId: dog.id, title: t('sample.checkup'), date: C.addDays(today, 12), time: '10:30', place: t('sample.clinic') }, newId(), pets));
      [[180, '11.2'], [120, '11.9'], [60, '12.4'], [10, '12.1']].forEach(([d, v]) => add('weights', C.makeWeight({ petId: dog.id, date: ago(d), value: v, unit: 'kg' }, newId(), pets, today)));
      [[90, '3.9'], [5, '4.15']].forEach(([d, v]) => add('weights', C.makeWeight({ petId: cat.id, date: ago(d), value: v, unit: 'kg' }, newId(), pets, today)));
      [[dog, 40, 'food', '54.90'], [dog, 25, 'vet', '68'], [cat, 15, 'food', '32.50'], [cat, 3, 'grooming', '25'], [dog, 2, 'gear', '19.99']]
        .forEach(([p, d, category, amount]) => add('expenses', C.makeExpense({ petId: p.id, date: ago(d), category, amount, label: '' }, newId(), pets)));
      if (!save(next)) return;
      setActive(dog.id); resetPetForm(); render(); say('pet-status', t('sample.done'), 'ok');
    } catch (e) { say('pet-status', L.error(e), 'error'); }
  });

  // ---------- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const decimal = () => (L.number(1.5).includes(',') ? 'comma' : 'dot');
  $('export-ics').addEventListener('click', () => {
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const out = C.toICS(data, todayDay(), Number($('horizon').value), stamp, { care: (c) => `${careName(c)} — ${petName(c.petId)}`, appt: (a) => `${a.title} — ${petName(a.petId)}` });
      download('petcarelog.ics', out.text, 'text/calendar;charset=utf-8');
      say('export-status', t('ics.done', { n: out.count }), 'ok');
    } catch (e) { say('export-status', L.error(e), 'error'); }
  });
  $('export-exp').addEventListener('click', () => {
    try {
      const csv = C.expensesCSV(data.expenses, { headers: [t('csv.date'), t('csv.pet'), t('csv.category'), t('csv.label'), t('csv.amount', { cur: L.currency })], petName, catLabel: (c) => t('cat.' + c), decimal: decimal() });
      download('petcarelog-expenses.csv', csv, 'text/csv;charset=utf-8'); say('export-status', t('csv.done'), 'ok');
    } catch (e) { say('export-status', L.error(e), 'error'); }
  });
  $('export-weights').addEventListener('click', () => {
    try {
      const csv = C.weightsCSV(data.weights, { headers: [t('csv.date'), t('csv.pet'), t('csv.weight')], petName, decimal: decimal() });
      download('petcarelog-weights.csv', csv, 'text/csv;charset=utf-8'); say('export-status', t('csv.done'), 'ok');
    } catch (e) { say('export-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('petcarelog-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('err.fileBig');
      let parsed; try { parsed = JSON.parse(await file.text()); } catch (e) { throw new Error('err.json'); }
      const next = C.validateData(parsed);
      if (!confirm(t('backup.confirm', { a: data.pets.length, b: next.pets.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true; setActive(null); resetPetForm(); render();
      say('backup-status', t('backup.restored', { n: next.pets.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('petcarelog-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
    activeId = localStorage.getItem(ACTIVE);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  buildSelects();
  L.onChange(() => { // la saisie en cours est conservée ; seuls les libellés changent
    for (const id of ['pet-status', 'care-status', 'appt-status', 'weight-status', 'exp-status', 'export-status', 'backup-status']) say(id, '');
    $('save-pet').textContent = t(editingPet ? 'btn.updatePet' : 'btn.addPet');
    buildSelects(); render();
  });
  render();
  let resizeTimer = null; // la courbe suit la largeur réelle de l'écran
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (active()) renderChart(C.weightSeries(data.weights, activeId)); }, 150); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
