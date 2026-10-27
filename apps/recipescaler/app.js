/* RecipeScaler — interface. Calculs dans core.js (RecipeCore) ; textes et formats dans LouvreI18n.
   La recette affichée à droite est toujours celle du formulaire (même non enregistrée) : rien n'est perdu. */
(() => {
  'use strict';
  const C = window.RecipeCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-recipescaler-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const UNIT_ORDER = ['g', 'kg', 'ml', 'cl', 'l', 'tsp', 'tbsp', 'piece', 'pinch', 'taste'];
  const FRACTIONS = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

  let recipes = [];
  let readOnly = false;
  let currentId = null; // recette enregistrée en cours de modification (null = nouvelle)
  let factor = 1; // facteur d'échelle appliqué
  let fromIngredient = false; // facteur issu d'une quantité disponible (et non d'un nombre de portions)

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  // Cuillères, pièces et pincées : fractions usuelles (1 ½) ; sinon nombre selon la langue.
  function num(value, unit) {
    if (['tsp', 'tbsp', 'piece', 'pinch'].includes(unit)) {
      const whole = Math.floor(value), frac = Math.round((value - whole) * 100) / 100;
      if (FRACTIONS[frac]) return whole ? `${L.number(whole)} ${FRACTIONS[frac]}` : FRACTIONS[frac];
    }
    return L.number(value, { maximumFractionDigits: 2 });
  }
  const unitName = (u) => t('unit.' + u);
  function qtyText(q) {
    if (q.unit === 'taste') return unitName('taste');
    const main = `${num(q.value, q.unit)} ${unitName(q.unit)}`;
    return q.extra ? t('qty.plus', { a: main, b: `${num(q.extra.value, q.extra.unit)} ${unitName(q.extra.unit)}` }) : main;
  }
  const original = (i) => (i.unit === 'taste' ? unitName('taste') : `${num(i.qty, i.unit)} ${unitName(i.unit)}`);

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup({ recipes: next })); recipes = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // ---------- Formulaire
  function unitSelect(value, units = UNIT_ORDER) {
    const s = el('select');
    for (const u of units) { const o = el('option'); o.value = u; o.setAttribute('data-i18n', 'unit.' + u); o.textContent = unitName(u); s.append(o); }
    s.value = value; return s;
  }
  function ingRow(ing = { name: '', qty: '', unit: 'g' }) {
    const row = el('div', 'ing');
    const name = el('input', 'ing-name'); name.maxLength = 60; name.value = ing.name; name.setAttribute('data-i18n-attr', 'aria-label:f.ingName;placeholder:f.ingName');
    const qty = el('input', 'ing-qty'); qty.inputMode = 'decimal'; qty.value = ing.qty === null || ing.qty === '' ? '' : String(ing.qty); qty.setAttribute('data-i18n-attr', 'aria-label:f.ingQty;placeholder:f.ingQtyPh');
    const unit = unitSelect(ing.unit); unit.className = 'ing-unit'; unit.setAttribute('data-i18n-attr', 'aria-label:f.ingUnit');
    const syncTaste = () => { qty.disabled = unit.value === 'taste'; if (qty.disabled) qty.value = ''; };
    unit.addEventListener('change', syncTaste); syncTaste();
    const del = el('button', 'btn icon', '✕'); del.type = 'button'; del.setAttribute('data-i18n-attr', 'aria-label:f.ingRemove;title:f.ingRemove');
    del.addEventListener('click', () => { row.remove(); if (!$('ing-rows').children.length) $('ing-rows').append(ingRow()); preview(); });
    row.append(name, qty, unit, del);
    L.apply(row);
    return row;
  }
  function readForm() {
    const f = $('recipe-form');
    const ingredients = [...$('ing-rows').children].map((r) => ({ name: r.querySelector('.ing-name').value, qty: r.querySelector('.ing-qty').value, unit: r.querySelector('.ing-unit').value }))
      .filter((i) => i.name.trim() || String(i.qty).trim()); // lignes vides ignorées
    return { title: f.title.value, servings: f.servings.value, ingredients, steps: f.steps.value };
  }
  function fillForm(r) {
    const f = $('recipe-form');
    f.title.value = r ? r.title : ''; f.servings.value = r ? String(r.servings) : '4'; f.steps.value = r ? r.steps : '';
    $('ing-rows').replaceChildren(...(r ? r.ingredients.map((i) => ingRow(i)) : [ingRow(), ingRow(), ingRow()]));
    $('target').value = r ? String(r.servings) : '4';
    factor = 1; fromIngredient = false;
  }
  function open(id) {
    currentId = id; fillForm(recipes.find((r) => r.id === id) || null);
    $('delete').hidden = !currentId;
    renderSelect(); preview();
  }

  // ---------- Recette adaptée (aperçu en direct)
  function preview() {
    let recipe;
    try { recipe = C.makeRecipe(readForm(), currentId || 'draft-recipe'); }
    catch (e) {
      $('h-scaled').textContent = t('scale.empty'); $('factor').textContent = ''; $('scaled').replaceChildren(); $('steps-box').hidden = true;
      $('print').disabled = $('export-txt').disabled = true;
      if (readForm().ingredients.length || readForm().title.trim()) say('scale-status', L.error(e), 'error'); else say('scale-status', '');
      renderAvail(null); return null;
    }
    if (!fromIngredient) {
      try { factor = C.factorForServings(recipe, $('target').value); say('scale-status', ''); }
      catch (e) { say('scale-status', L.error(e), 'error'); }
    }
    const people = recipe.servings * factor;
    const rounded = Math.round(people * 10) / 10;
    $('h-scaled').textContent = t('scale.heading', { title: recipe.title, n: rounded, shown: L.number(rounded) });
    $('factor').textContent = t('scale.factor', { f: L.number(Math.round(factor * 100) / 100), n: recipe.servings });
    const rows = C.scaleRecipe(recipe, factor);
    const thead = el('thead'), hr = el('tr');
    for (const [txt, cls] of [[t('th.ingredient')], [t('th.original'), 'num hide-s'], [t('th.scaled'), 'num']]) hr.append(el('th', cls || '', txt));
    thead.append(hr);
    const tbody = el('tbody');
    for (const r of rows) {
      const tr = el('tr'), q = el('td', 'num strong');
      q.append(document.createTextNode((r.approx ? '≈ ' : '') + qtyText(r)));
      if (r.approx && (r.unit === 'piece' || r.unit === 'pinch')) q.append(el('small', 'exact', t('scale.exact', { v: L.number(r.exact, { maximumFractionDigits: 2 }) })));
      tr.append(el('td', 'name', r.name), el('td', 'num muted hide-s', original(r.origin)), q);
      tbody.append(tr);
    }
    $('scaled').replaceChildren(thead, tbody);
    $('steps').textContent = recipe.steps; $('steps-box').hidden = !recipe.steps;
    $('print').disabled = $('export-txt').disabled = false;
    renderAvail(recipe);
    return { recipe, rows, rounded };
  }
  function renderAvail(recipe) {
    const sel = $('avail-ing'), keep = sel.value;
    const opts = recipe ? recipe.ingredients.map((i, k) => [k, i]).filter(([, i]) => i.unit !== 'taste') : [];
    sel.replaceChildren(...opts.map(([k, i]) => { const o = el('option', '', i.name); o.value = String(k); return o; }));
    if (opts.some(([k]) => String(k) === keep)) sel.value = keep;
    $('avail-apply').disabled = !opts.length;
    syncAvailUnits(recipe);
  }
  // Unités proposées : celles de même dimension que l'ingrédient choisi (pas de conversion masse <-> volume).
  function syncAvailUnits(recipe) {
    const ing = recipe && recipe.ingredients[Number($('avail-ing').value)];
    const dim = ing ? C.UNITS[ing.unit].dim : 'mass';
    const keep = $('avail-unit').value;
    const units = UNIT_ORDER.filter((u) => C.UNITS[u].dim === dim);
    const s = unitSelect(units.includes(keep) ? keep : (ing ? ing.unit : 'g'), units);
    $('avail-unit').replaceChildren(...s.children); $('avail-unit').value = s.value;
  }
  $('avail-ing').addEventListener('change', () => { try { syncAvailUnits(C.makeRecipe(readForm(), 'draft-recipe')); } catch (e) { /* recette incomplète */ } });
  $('avail-apply').addEventListener('click', () => {
    try {
      const recipe = C.makeRecipe(readForm(), currentId || 'draft-recipe');
      factor = C.factorFromIngredient(recipe, Number($('avail-ing').value), $('avail-qty').value, $('avail-unit').value);
      fromIngredient = true;
      const res = preview();
      $('target').value = String(Math.max(1, Math.round(res.rounded)));
      say('scale-status', t('avail.done', { n: L.number(res.rounded) }), 'ok');
    } catch (e) { say('scale-status', L.error(e), 'error'); }
  });
  function setTarget(v) { $('target').value = String(v); fromIngredient = false; preview(); }
  $('target').addEventListener('input', () => { fromIngredient = false; preview(); });
  $('minus').addEventListener('click', () => { const n = Number($('target').value); setTarget(Number.isInteger(n) && n > 1 ? Math.min(n - 1, C.MAX_SERVINGS) : 1); });
  $('plus').addEventListener('click', () => { const n = Number($('target').value); setTarget(Number.isInteger(n) && n >= 1 ? Math.min(n + 1, C.MAX_SERVINGS) : 1); });
  $('recipe-form').addEventListener('input', () => preview());
  $('recipe-form').addEventListener('change', () => preview());
  $('add-ing').addEventListener('click', () => {
    if ($('ing-rows').children.length >= C.MAX_INGREDIENTS) { say('recipe-status', t('err.tooManyIngredients', { max: C.MAX_INGREDIENTS }), 'error'); return; }
    const row = ingRow(); $('ing-rows').append(row); row.querySelector('input').focus();
  });

  // ---------- Enregistrement
  function renderSelect() {
    const sel = $('recipe-select');
    const none = el('option', '', t('recipe.unsaved')); none.value = '';
    sel.replaceChildren(none, ...recipes.slice().sort((a, b) => a.title.localeCompare(b.title, L.locale)).map((r) => { const o = el('option', '', r.title); o.value = r.id; return o; }));
    sel.value = currentId || '';
  }
  $('recipe-select').addEventListener('change', (e) => { open(e.target.value || null); say('recipe-status', ''); });
  $('new').addEventListener('click', () => { open(null); say('recipe-status', ''); $('recipe-form').title.focus(); });
  $('recipe-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!currentId && recipes.length >= C.MAX_RECIPES) throw new Error(`err.tooManyRecipes|${JSON.stringify({ max: C.MAX_RECIPES })}`);
      const r = C.makeRecipe(readForm(), currentId || newId());
      const next = currentId ? recipes.map((x) => (x.id === r.id ? r : x)) : [...recipes, r];
      if (!save(next)) return;
      say('recipe-status', t(currentId ? 'recipe.updated' : 'recipe.saved', { title: r.title }), 'ok');
      currentId = r.id; $('delete').hidden = false; renderSelect();
    } catch (e) { say('recipe-status', L.error(e), 'error'); }
  });
  $('delete').addEventListener('click', () => {
    const r = recipes.find((x) => x.id === currentId);
    if (!r || !confirm(t('recipe.confirmDelete', { title: r.title }))) return;
    if (save(recipes.filter((x) => x.id !== r.id))) { open(null); say('recipe-status', t('recipe.deleted', { title: r.title }), 'ok'); }
  });

  // ---------- Exemple dans la langue affichée (non enregistré tant qu'on ne clique pas sur Enregistrer)
  $('sample').addEventListener('click', () => {
    const i = (k, qty, unit) => ({ name: t('sample.i.' + k), qty, unit });
    currentId = null;
    fillForm(C.makeRecipe({ title: t('sample.title'), servings: 4, steps: t('sample.steps'), ingredients: [
      i('flour', '250', 'g'), i('eggs', '4', 'piece'), i('milk', '50', 'cl'), i('butter', '50', 'g'), i('sugar', '1', 'tbsp'), i('salt', '1', 'pinch'), { name: t('sample.i.vanilla'), qty: '', unit: 'taste' }] }, 'sample-recipe'));
    $('delete').hidden = true; renderSelect();
    setTarget(6);
    say('recipe-status', t('sample.done'), 'ok');
  });

  // ---------- Impression et export texte
  $('print').addEventListener('click', () => window.print());
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-txt').addEventListener('click', () => {
    const res = preview(); if (!res) return;
    const lines = [$('h-scaled').textContent, '', ...res.rows.map((r) => t('txt.line', { name: r.name, qty: (r.approx ? '≈ ' : '') + qtyText(r) }))];
    if (res.recipe.steps) lines.push('', t('scale.steps'), res.recipe.steps);
    lines.push('', t('scale.note'));
    const slug = res.recipe.title.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'recipe';
    download(`${slug}.txt`, lines.join('\n') + '\n', 'text/plain;charset=utf-8');
    say('scale-status', t('txt.done'), 'ok');
  });

  // ---------- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('recipescaler-backup.json', C.backup({ recipes }), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text())).recipes;
      if (!confirm(t('backup.confirm', { a: recipes.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true;
      open(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('recipescaler-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) recipes = C.validateData(JSON.parse(raw)).recipes;
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  open(null);
  L.onChange(() => { for (const id of ['recipe-status', 'scale-status', 'backup-status']) say(id, ''); renderSelect(); preview(); });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
