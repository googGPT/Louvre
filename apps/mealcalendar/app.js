/* MealCalendar — interface. Calculs dans core.js (MealCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.MealCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-mealcalendar-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const UNIT_ORDER = ['g', 'kg', 'ml', 'cl', 'l', 'tsp', 'tbsp', 'piece'];

  let data = { dishes: [], plans: [] };
  let readOnly = false;
  let week = C.weekStart(todayDay()); // semaine affichée
  let editing = null; // identifiant du plat en cours de modification

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const unitLabel = (u) => t('unit.' + u);
  const qtyText = (value, unit) => `${L.number(value, { maximumFractionDigits: 3 })} ${unitLabel(unit)}`;
  const plan = () => data.plans.find((p) => p.week === week) || C.emptyPlan(week);
  const byName = (a, b) => a.name.localeCompare(b.name, L.locale);

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Remplace le menu de la semaine affichée ; au-delà de la limite, les semaines les plus anciennes sont oubliées.
  function savePlan(p) {
    let plans = data.plans.filter((x) => x.week !== p.week);
    if (p.slots.length || p.checked.length) plans.push(p);
    plans.sort((a, b) => (a.week < b.week ? -1 : 1));
    while (plans.length > C.MAX_PLANS) plans.shift();
    return save({ ...data, plans });
  }

  // ---------- Semaine
  function renderWeek() {
    const days = C.weekDays(week);
    $('week-label').textContent = t('week.label', { start: L.date(days[0], { day: 'numeric', month: 'short' }), end: L.date(days[6], { day: 'numeric', month: 'short', year: 'numeric' }) });
    const p = plan(), dishes = data.dishes.slice().sort(byName);
    $('no-dish').hidden = data.dishes.length > 0;
    $('clear-week').disabled = !p.slots.length;
    const today = todayDay();
    $('days').replaceChildren(...days.map((day, i) => {
      const card = el('article', 'day' + (day === today ? ' today' : ''));
      const dayName = L.date(day, { weekday: 'long', day: 'numeric', month: 'short' });
      card.append(el('h3', '', dayName));
      for (const meal of C.MEALS) {
        const slot = p.slots.find((s) => s.day === i && s.meal === meal);
        const row = el('div', slot ? 'slot has-dish' : 'slot');
        const lab = el('span', 'meal', t('meal.' + meal));
        const sel = el('select'); sel.setAttribute('aria-label', t('aria.slot', { meal: t('meal.' + meal), day: dayName }));
        const none = el('option', '', t('slot.none')); none.value = ''; sel.append(none);
        for (const d of dishes) { const o = el('option', '', d.name); o.value = d.id; sel.append(o); }
        sel.value = slot ? slot.dishId : '';
        const ppl = el('input', 'ppl'); ppl.inputMode = 'numeric'; ppl.value = slot ? slot.people : ''; ppl.hidden = !slot;
        ppl.setAttribute('aria-label', t('aria.people', { meal: t('meal.' + meal), day: dayName }));
        const unit = el('span', 'ppl-unit', t('slot.people')); unit.hidden = !slot;
        sel.addEventListener('change', () => {
          const dish = data.dishes.find((d) => d.id === sel.value);
          setSlot(i, meal, sel.value || null, dish ? dish.servings : 0);
        });
        ppl.addEventListener('change', () => setSlot(i, meal, sel.value, ppl.value));
        row.append(lab, sel, ppl, unit); card.append(row);
      }
      return card;
    }));
  }
  function setSlot(day, meal, dishId, n) {
    try { if (savePlan(C.setSlot(plan(), day, meal, dishId, n, data.dishes))) { say('week-status', ''); render(); } }
    catch (e) { say('week-status', L.error(e), 'error'); render(); }
  }
  $('prev').addEventListener('click', () => { week = C.addDays(week, -7); say('week-status', ''); render(); });
  $('next').addEventListener('click', () => { week = C.addDays(week, 7); say('week-status', ''); render(); });
  $('today').addEventListener('click', () => { week = C.weekStart(todayDay()); render(); });
  $('clear-week').addEventListener('click', () => {
    if (!plan().slots.length || !confirm(t('week.confirmClear'))) return;
    if (savePlan({ ...plan(), slots: [], checked: [] })) { render(); say('week-status', t('week.cleared'), 'ok'); }
  });

  // ---------- Liste de courses
  function shopItems() { return C.shoppingList(plan(), data.dishes).sort(byName); }
  function renderShop() {
    const p = plan(), items = shopItems();
    const done = items.filter((it) => p.checked.includes(it.key)).length;
    $('shop-count').textContent = items.length ? t('shop.count', { done, n: items.length }) : '';
    $('export-csv').disabled = $('print').disabled = $('uncheck').disabled = !items.length;
    if (!items.length) { $('shop').replaceChildren(el('li', 'empty', t('shop.empty'))); return; }
    $('shop').replaceChildren(...items.map((it) => {
      const q = C.displayQty(it), checked = p.checked.includes(it.key);
      const li = el('li', checked ? 'done' : ''), lab = el('label');
      const box = el('input'); box.type = 'checkbox'; box.checked = checked;
      box.addEventListener('change', () => {
        const cur = plan();
        const next = box.checked ? [...new Set([...cur.checked, it.key])] : cur.checked.filter((k) => k !== it.key);
        if (savePlan({ ...cur, checked: next })) renderShop(); else box.checked = !box.checked;
      });
      const txt = el('span', 'txt'); txt.append(el('b', '', it.name), el('span', 'qty', qtyText(q.value, q.unit)));
      txt.append(el('small', '', it.dishes.join(' · ')));
      lab.append(box, txt); li.append(lab); return li;
    }));
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      const csv = C.shoppingCSV(shopItems(), {
        headers: ['csv.ingredient', 'csv.qty', 'csv.unit', 'csv.checked', 'csv.dishes'].map((k) => t(k)), unitLabel,
        decimal: L.number(1.5).includes(',') ? 'comma' : 'dot', yes: t('csv.yes'), no: t('csv.no'), checked: plan().checked,
      });
      download(`mealcalendar-${week}.csv`, csv, 'text/csv;charset=utf-8');
      say('shop-status', t('shop.exported'), 'ok');
    } catch (e) { say('shop-status', L.error(e), 'error'); }
  });
  $('print').addEventListener('click', () => window.print());
  $('uncheck').addEventListener('click', () => { if (savePlan({ ...plan(), checked: [] })) renderShop(); });

  // ---------- Plats : formulaire avec lignes d'ingrédients
  function ingRow(ing = { name: '', qty: '', unit: 'g' }) {
    const row = el('div', 'ing');
    const name = el('input'); name.maxLength = 60; name.className = 'ing-name'; name.value = ing.name;
    name.setAttribute('data-i18n-attr', 'aria-label:ing.name;placeholder:ing.namePh');
    const qty = el('input'); qty.inputMode = 'decimal'; qty.className = 'ing-qty'; qty.value = ing.qty === '' ? '' : String(ing.qty);
    qty.setAttribute('data-i18n-attr', 'aria-label:ing.qty;placeholder:ing.qtyPh');
    const unit = el('select'); unit.className = 'ing-unit'; unit.setAttribute('data-i18n-attr', 'aria-label:ing.unit');
    for (const u of UNIT_ORDER) { const o = el('option'); o.value = u; o.setAttribute('data-i18n', 'unit.' + u); unit.append(o); }
    unit.value = ing.unit;
    const del = el('button', 'btn icon', '✕'); del.type = 'button'; del.setAttribute('data-i18n-attr', 'aria-label:ing.remove;title:ing.remove');
    del.addEventListener('click', () => { row.remove(); if (!$('ing-rows').children.length) $('ing-rows').append(ingRow()); });
    row.append(name, qty, unit, del);
    L.apply(row); // traduit les attributs de la nouvelle ligne
    return row;
  }
  function resetForm() {
    editing = null;
    const f = $('dish-form'); f.name.value = ''; f.servings.value = '4';
    $('ing-rows').replaceChildren(ingRow(), ingRow(), ingRow());
    $('cancel-edit').hidden = true; $('save-dish').textContent = t('btn.saveDish');
  }
  $('add-ing').addEventListener('click', () => {
    if ($('ing-rows').children.length >= C.MAX_INGREDIENTS) { say('dish-status', t('err.tooManyIngredients', { max: C.MAX_INGREDIENTS }), 'error'); return; }
    const row = ingRow(); $('ing-rows').append(row); row.querySelector('input').focus();
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); say('dish-status', ''); });
  $('dish-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      // Lignes entièrement vides ignorées ; une ligne à moitié remplie est une erreur (jamais devinée).
      const ingredients = [...$('ing-rows').children].map((r) => ({ name: r.querySelector('.ing-name').value, qty: r.querySelector('.ing-qty').value, unit: r.querySelector('.ing-unit').value }))
        .filter((i) => i.name.trim() || String(i.qty).trim());
      if (!editing && data.dishes.length >= C.MAX_DISHES) throw new Error(`err.tooManyDishes|${JSON.stringify({ max: C.MAX_DISHES })}`);
      const dish = C.makeDish({ name: f.name.value, servings: f.servings.value, ingredients }, editing || newId());
      if (data.dishes.some((d) => d.id !== dish.id && C.norm(d.name) === C.norm(dish.name))) throw new Error('err.dishExists');
      const dishes = editing ? data.dishes.map((d) => (d.id === editing ? dish : d)) : [...data.dishes, dish];
      if (!save({ ...data, dishes })) return;
      say('dish-status', t(editing ? 'dish.updated' : 'dish.added', { name: dish.name }), 'ok');
      resetForm(); render();
    } catch (e) { say('dish-status', L.error(e), 'error'); }
  });
  function renderDishes() {
    const list = $('dishes');
    if (!data.dishes.length) { list.replaceChildren(el('li', 'empty', t('dish.empty'))); return; }
    list.replaceChildren(...data.dishes.slice().sort(byName).map((d) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', d.name), el('span', '', t('dish.meta', { n: d.servings, k: d.ingredients.length })));
      txt.append(el('span', 'ings-line', d.ingredients.map((i) => `${i.name} ${qtyText(i.qty, i.unit)}`).join(' · ')));
      const acts = el('div', 'acts');
      const edit = el('button', 'btn', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: d.name }));
      edit.addEventListener('click', () => {
        editing = d.id; const f = $('dish-form'); f.name.value = d.name; f.servings.value = String(d.servings);
        $('ing-rows').replaceChildren(...d.ingredients.map((i) => ingRow(i)));
        $('cancel-edit').hidden = false; $('save-dish').textContent = t('btn.updateDish');
        say('dish-status', t('dish.editing', { name: d.name })); f.name.focus();
      });
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: d.name }));
      del.addEventListener('click', () => {
        const n = C.countUses(data.plans, d.id);
        if (!confirm(t('dish.confirmDelete', { name: d.name, n }))) return;
        if (save(C.removeDish(data, d.id))) { if (editing === d.id) resetForm(); render(); say('dish-status', t('dish.deleted', { name: d.name }), 'ok'); }
      });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }

  function render() { renderWeek(); renderShop(); renderDishes(); }

  // ---------- Exemple dans la langue affichée
  $('sample').addEventListener('click', () => {
    if ((data.dishes.length || data.plans.length) && !confirm(t('sample.confirm'))) return;
    try {
      const i = (k, qty, unit) => ({ name: t('sample.i.' + k), qty, unit });
      const mk = (k, servings, ings) => C.makeDish({ name: t('sample.d.' + k), servings, ingredients: ings }, newId());
      const porridge = mk('porridge', 1, [i('oats', '50', 'g'), i('milk', '20', 'cl'), i('honey', '1', 'tsp')]);
      const pasta = mk('pasta', 4, [i('pasta', '400', 'g'), i('tomatoes', '800', 'g'), i('onion', '1', 'piece'), i('oil', '2', 'tbsp')]);
      const salad = mk('salad', 2, [i('lentils', '150', 'g'), i('onion', '0.5', 'piece'), i('oil', '1', 'tbsp'), i('vinegar', '1', 'tbsp')]);
      const omelette = mk('omelette', 2, [i('eggs', '4', 'piece'), i('mushrooms', '200', 'g'), i('milk', '5', 'cl')]);
      const dishes = [porridge, pasta, salad, omelette];
      week = C.weekStart(todayDay());
      let p = C.emptyPlan(week);
      for (let d = 0; d < 5; d++) p = C.setSlot(p, d, 'breakfast', porridge.id, 2, dishes);
      for (const [d, meal, dish, n] of [[0, 'lunch', pasta, 4], [2, 'lunch', salad, 2], [4, 'lunch', pasta, 2], [1, 'dinner', omelette, 2], [3, 'dinner', salad, 2], [5, 'dinner', omelette, 4]]) p = C.setSlot(p, d, meal, dish.id, n, dishes);
      if (!save({ dishes, plans: [p] })) return;
      resetForm(); render(); say('week-status', t('sample.done'), 'ok');
    } catch (e) { say('week-status', L.error(e), 'error'); }
  });

  // ---------- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('mealcalendar-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.dishes.length, b: next.dishes.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; resetForm(); render();
      say('backup-status', t('backup.restored', { n: next.dishes.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('mealcalendar-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  resetForm();
  L.onChange(() => { // la saisie du formulaire (lignes d'ingrédients comprises) est conservée
    for (const id of ['week-status', 'shop-status', 'dish-status', 'backup-status']) say(id, '');
    $('save-dish').textContent = t(editing ? 'btn.updateDish' : 'btn.saveDish');
    render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
