/* WardrobeCapsule — interface. Calculs dans core.js (CapsuleCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.CapsuleCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-wardrobecapsule-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  let data = { rules: { ...C.DEFAULT_RULES, targets: { ...C.DEFAULT_RULES.targets }, palette: [] }, items: [] };
  let readOnly = false;
  let editing = null;
  let lastList = [];
  const form = $('item-form');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const catName = (c) => t('cat.' + c), colorName = (c) => t('color.' + c);
  const byId = () => new Map(data.items.map((i) => [i.id, i]));
  const names = (ids) => { const m = byId(); return ids.map((id) => m.get(id).name).join(t('list.sep')); };
  function swatch(color) { const s = el('span', 'sw'); s.style.background = C.COLORS[color].hex; s.setAttribute('aria-hidden', 'true'); return s; }
  function fillSelect(sel, options) {
    const value = sel.value;
    sel.replaceChildren(...options.map(([v, txt]) => { const o = el('option', '', txt); o.value = String(v); return o; }));
    if (options.some((o) => String(o[0]) === value)) sel.value = value;
  }
  function checkGroup(box, name, values, labelOf) { // cases à cocher conservées lors d'un changement de langue
    const was = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
    const first = !box.children.length;
    box.replaceChildren(...values.map((v) => {
      const lab = el('label', 'check'), input = el('input'); input.type = 'checkbox'; input.name = name; input.value = v;
      input.checked = first ? false : was.has(v);
      lab.append(input, el('span', '', labelOf(v))); return lab;
    }));
  }
  const checked = (box) => [...box.querySelectorAll('input:checked')].map((i) => i.value);
  const setChecked = (box, values) => box.querySelectorAll('input').forEach((i) => { i.checked = values.includes(i.value); });

  // ---------- Libellés et listes
  function fillStatic() {
    fillSelect(form.category, C.CATEGORIES.map((c) => [c, catName(c)]));
    fillSelect(form.color, C.COLOR_IDS.map((c) => [c, colorName(c)]));
    fillSelect($('f-season'), [['all', t('filter.allSeasons')], ...C.SEASONS.map((s) => [s, t('season.' + s)])]);
    fillSelect($('f-occasion'), [['all', t('filter.allOccasions')], ...C.OCCASIONS.map((o) => [o, t('occasion.' + o)])]);
    fillSelect($('accents'), Array.from({ length: C.MAX_ACCENTS + 1 }, (_, k) => [k, L.number(k)]));
    checkGroup($('seasons'), 'seasons', C.SEASONS, (s) => t('season.' + s));
    checkGroup($('occasions'), 'occasions', C.OCCASIONS, (o) => t('occasion.' + o));
    // Objectifs : champs créés une fois (valeurs conservées), libellés traduits à chaque fois.
    const box = $('targets');
    if (!box.children.length) {
      for (const c of C.CATEGORIES) {
        const lab = el('label', 'field'), span = el('span'), input = el('input'); input.id = 'target-' + c; input.inputMode = 'numeric'; input.autocomplete = 'off';
        input.addEventListener('change', () => updateRules({ targets: { ...data.rules.targets, [c]: input.value } }, t('rules.saved')));
        lab.append(span, input); box.append(lab);
      }
    }
    for (const c of C.CATEGORIES) $('target-' + c).previousElementSibling.textContent = catName(c);
    // Palette.
    $('palette').replaceChildren(...C.COLOR_IDS.map((c) => {
      const lab = el('label', 'swatch-check'), input = el('input'); input.type = 'checkbox'; input.value = c; input.checked = data.rules.palette.includes(c);
      input.addEventListener('change', () => updateRules({ palette: [...$('palette').querySelectorAll('input:checked')].map((i) => i.value) }, t('rules.paletteSaved')));
      lab.append(input, swatch(c), el('span', '', colorName(c))); return lab;
    }));
    $('neutrals').textContent = t('rules.neutrals', { list: C.COLOR_IDS.filter((c) => C.COLORS[c].neutral).map(colorName).join(t('list.sep')) });
  }
  function renderRules() {
    for (const c of C.CATEGORIES) $('target-' + c).value = String(data.rules.targets[c]);
    $('accents').value = String(data.rules.maxAccents);
    $('palette').querySelectorAll('input').forEach((i) => { i.checked = data.rules.palette.includes(i.value); });
  }
  function updateRules(patch, message) {
    try {
      const rules = C.makeRules({ ...data.rules, ...patch });
      if (save({ ...data, rules })) { say('rules-status', message, 'ok'); renderResults(); }
    } catch (e) { say('rules-status', L.error(e), 'error'); }
  }
  $('accents').addEventListener('change', () => updateRules({ maxAccents: $('accents').value }, t('rules.saved')));

  // ---------- Formulaire
  function resetForm() {
    editing = null; form.name.value = ''; setChecked($('seasons'), []); setChecked($('occasions'), []);
    $('save').textContent = t('btn.add'); $('cancel').hidden = true;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!editing && data.items.length >= C.MAX_ITEMS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_ITEMS })}`);
      const item = C.makeItem({ name: form.name.value, category: form.category.value, color: form.color.value, seasons: checked($('seasons')), occasions: checked($('occasions')) }, editing || newId());
      const was = editing;
      if (!save({ ...data, items: was ? data.items.map((i) => (i.id === item.id ? item : i)) : [...data.items, item] })) return;
      resetForm(); render(); form.name.focus();
      say('form-status', t(was ? 'form.updated' : 'form.added', { name: item.name }), 'ok');
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('cancel').addEventListener('click', () => { resetForm(); say('form-status', ''); });
  function edit(i) {
    editing = i.id; form.name.value = i.name; form.category.value = i.category; form.color.value = i.color;
    setChecked($('seasons'), i.seasons); setChecked($('occasions'), i.occasions);
    $('save').textContent = t('btn.update'); $('cancel').hidden = false;
    say('form-status', t('form.editing', { name: i.name })); form.scrollIntoView({ block: 'start' }); form.name.focus();
  }

  // ---------- Garde-robe
  function renderItems() {
    if (!data.items.length) { $('items').replaceChildren(el('p', 'empty', t('items.empty'))); return; }
    $('items').replaceChildren(...C.CATEGORIES.filter((c) => data.items.some((i) => i.category === c)).map((c) => {
      const g = el('div', 'igroup'), list = data.items.filter((i) => i.category === c).sort((a, b) => a.name.localeCompare(b.name, L.locale));
      g.append(el('h3', '', `${catName(c)} (${L.number(list.length)})`));
      const ul = el('ul', 'ilist');
      for (const i of list) {
        const li = el('li'), txt = el('div', 'txt');
        txt.append(el('b', '', i.name), el('span', '', [colorName(i.color), i.seasons.map((s) => t('season.' + s)).join(t('list.sep')), i.occasions.map((o) => t('occasion.' + o)).join(t('list.sep'))].join(' · ')));
        const acts = el('div', 'acts');
        const ed = el('button', 'btn', t('btn.edit')); ed.type = 'button'; ed.setAttribute('aria-label', t('aria.edit', { name: i.name })); ed.addEventListener('click', () => edit(i));
        const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: i.name }));
        del.addEventListener('click', () => {
          if (!confirm(t('confirm.delete', { name: i.name }))) return;
          if (save({ ...data, items: data.items.filter((x) => x.id !== i.id) })) { if (editing === i.id) resetForm(); render(); say('items-status', t('items.deleted', { name: i.name }), 'ok'); }
        });
        acts.append(ed, del); li.append(swatch(i.color), txt, acts); ul.append(li);
      }
      g.append(ul); return g;
    }));
  }

  // ---------- Tenues et bilan
  const filter = () => ({ season: $('f-season').value || 'all', occasion: $('f-occasion').value || 'all' });
  function outfitCard(ids, cls = '') {
    const m = byId(), li = el('li', 'outfit ' + cls);
    for (const id of ids) { const p = m.get(id), row = el('div', 'piece'); row.append(swatch(p.color), el('b', '', p.name), el('span', '', catName(p.category))); li.append(row); }
    return li;
  }
  function renderResults() {
    const a = C.analyze(data.items, data.rules, filter()), r = a.result;
    lastList = r.list;
    $('count').textContent = t('count.n', { n: r.count, v: L.number(r.count) });
    $('count-detail').textContent = r.count ? t('count.detail', { sets: L.number(r.sets), ones: L.number(r.ones) }) + (r.truncated ? ' ' + t('count.truncated', { max: L.number(C.LIST_CAP) }) : '') : t('count.zero');
    const day = C.ofDay(r, today());
    $('day').replaceChildren(day ? (() => { const ul = el('ul', 'outfits'); const li = outfitCard(day, 'today'); li.prepend(el('p', 'date', L.date(today(), { weekday: 'long', day: 'numeric', month: 'long' }))); ul.append(li); return ul; })() : el('p', 'empty', t('day.none')));
    $('suggestions').replaceChildren(...C.suggest(r, 6).map((o) => outfitCard(o)));
    $('export-csv').disabled = !r.count;
    // Tableau des objectifs.
    const head = el('tr');
    for (const [txt, cls] of [[t('th.category')], [t('th.have'), 'num'], [t('th.target'), 'num'], [t('th.status')]]) head.append(el('th', cls || '', txt));
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const c of C.CATEGORIES) {
      const target = data.rules.targets[c], have = a.have[c], tr = el('tr');
      const status = !target ? t('status.noTarget') : have < target ? t('status.missing', { n: target - have }) : have > target ? t('status.excess', { n: have - target }) : t('status.ok');
      const cls = !target ? '' : have < target ? 'bad' : have > target ? 'warn' : 'good';
      tr.append(el('td', '', catName(c)), el('td', 'num', L.number(have)), el('td', 'num', target ? L.number(target) : '—'), el('td', 'st ' + cls, status));
      tbody.append(tr);
    }
    $('targets-table').replaceChildren(thead, tbody);
    // Manques et pistes.
    const issues = [];
    for (const m of a.missing) issues.push(['bad', t('gap.missing', { cat: catName(m.category), n: m.n })]);
    if (a.outOfPalette.length) issues.push(['warn', t('gap.outPalette', { names: names(a.outOfPalette) })]);
    if (a.orphans.length) issues.push(['warn', t('gap.orphans', { names: names(a.orphans) })]);
    if (a.unfit.length) issues.push(['info', t('gap.unfit', { n: a.unfit.length })]);
    const best = a.gains[0];
    if (best && best.gain > 0) issues.push(['good', t('gap.gain', { cat: catName(best.category), color: colorName(a.neutral), n: best.gain })]);
    issues.push(['info', t('gap.notCounted')]);
    $('issues').replaceChildren(...issues.map(([cls, txt]) => el('li', cls, txt)));
  }
  $('f-season').addEventListener('change', renderResults);
  $('f-occasion').addEventListener('change', renderResults);
  $('export-csv').addEventListener('click', () => {
    if (!lastList.length) return;
    try {
      const csv = C.toCSV(lastList, data.items, { headers: ['csv.n', 'csv.top', 'csv.bottom', 'csv.shoes', 'csv.colors'].map((k) => t(k)), colorLabel: colorName });
      download('wardrobecapsule-outfits.csv', csv, 'text/csv;charset=utf-8'); say('result-status', t('csv.done', { n: lastList.length }), 'ok');
    } catch (e) { say('result-status', L.error(e), 'error'); }
  });

  // ---------- Exemple dans la langue affichée
  $('sample').addEventListener('click', () => {
    if (data.items.length && !confirm(t('sample.confirm'))) return;
    try {
      const all = ['spring', 'summer', 'autumn', 'winter'], mid = ['spring', 'autumn', 'winter'], warm = ['spring', 'summer'];
      const plan = [ // nom, catégorie, couleur, saisons, occasions
        ['tee', 'top', 'white', all, ['casual', 'sport']], ['shirt', 'top', 'blue', all, ['casual', 'work']], ['sweater', 'top', 'grey', mid, ['casual', 'work']],
        ['blouse', 'top', 'burgundy', all, ['work', 'evening']], ['jeans', 'bottom', 'denim', all, ['casual']], ['trousers', 'bottom', 'navy', all, ['work', 'evening', 'casual']],
        ['skirt', 'bottom', 'black', warm, ['work', 'evening']], ['dress', 'onepiece', 'green', warm, ['casual', 'evening']], ['sneakers', 'shoes', 'white', all, ['casual', 'sport']],
        ['loafers', 'shoes', 'brown', all, ['work', 'casual']], ['boots', 'shoes', 'black', ['autumn', 'winter'], ['casual', 'work', 'evening']],
        ['coat', 'outer', 'beige', ['autumn', 'winter'], ['casual', 'work', 'evening']], ['scarf', 'accessory', 'red', ['autumn', 'winter'], ['casual']],
      ];
      const items = plan.map(([k, category, color, seasons, occasions]) => C.makeItem({ name: t('sample.' + k), category, color, seasons, occasions }, newId()));
      const rules = C.makeRules({ targets: { top: 5, bottom: 3, onepiece: 1, shoes: 3, outer: 1, accessory: 2 }, palette: ['black', 'white', 'grey', 'navy', 'beige', 'brown', 'denim', 'blue', 'burgundy', 'green'], maxAccents: 1 });
      if (!save({ rules, items })) return;
      $('f-season').value = 'all'; $('f-occasion').value = 'all';
      resetForm(); renderRules(); fillStatic(); render(); say('form-status', t('sample.done'), 'ok');
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  // ---------- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('wardrobecapsule-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.items.length, b: next.items.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; resetForm(); renderRules(); render();
      say('backup-status', t('backup.restored', { n: next.items.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('wardrobecapsule-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderItems(); renderResults(); }

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillStatic(); resetForm(); renderRules();
  L.onChange(() => { // saisie, cases cochées, filtres et objectifs en cours conservés
    for (const id of ['result-status', 'rules-status', 'form-status', 'items-status', 'backup-status']) say(id, '');
    fillStatic(); $('save').textContent = t(editing ? 'btn.update' : 'btn.add'); render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
