/* LaundryLoad — interface. Regroupement dans core.js (LoadCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.LoadCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-laundryload-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let data = { settings: { ...C.DEFAULT_SETTINGS }, garments: [] };
  let readOnly = false;
  let editing = null;
  const form = $('garment-form');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const kg = (g) => t('unit.kg', { v: L.number(g / 1000, { maximumFractionDigits: 3 }) });
  const deg = (c) => t('unit.celsius', { t: L.number(c) });
  const names = (ids) => { const by = new Map(data.garments.map((g) => [g.id, g.name])); return ids.map((id) => by.get(id)).join(t('list.sep')); };
  const careText = (g) => (g.care === 'machine' ? t('care.machineAt', { t: deg(g.maxC) }) : t('care.' + g.care));

  function fillSelect(sel, options) {
    const value = sel.value;
    sel.replaceChildren(...options.map(([v, txt]) => { const o = el('option', '', txt); o.value = String(v); return o; }));
    if (options.some((o) => String(o[0]) === value)) sel.value = value;
  }
  function fillSelects() {
    fillSelect(form.color, C.COLORS.map((c) => [c, t('color.' + c)]));
    fillSelect(form.material, C.MATERIALS.map((m) => [m, t('material.' + m)]));
    fillSelect(form.care, C.CARES.map((c) => [c, t('care.' + c)]));
    fillSelect(form.maxC, C.TEMPS.map((v) => [v, deg(v)]));
    fillSelect($('gap'), [['', t('gap.none')], ...C.GAPS.map((v) => [v, v === 0 ? t('gap.same') : t('gap.upTo', { t: deg(v) })])]);
    form.maxC.disabled = form.care.value !== 'machine';
  }
  form.care.addEventListener('change', () => { form.maxC.disabled = form.care.value !== 'machine'; });

  // ---------- Réglages (enregistrés à chaque modification)
  function renderSettings() {
    const s = data.settings;
    $('capacity').value = s.capacityG ? String(s.capacityG / 1000) : '';
    $('fill').value = String(s.gentleFillPct);
    $('merge').checked = s.mergeLight;
    $('gap').value = s.tempGapC === null ? '' : String(s.tempGapC);
  }
  function updateSettings(patch, message) {
    try {
      const settings = C.makeSettings({ ...data.settings, ...patch });
      if (save({ ...data, settings })) { say('settings-status', message(settings), 'ok'); renderLoads(); }
    } catch (e) { say('settings-status', L.error(e), 'error'); }
  }
  $('capacity').addEventListener('change', () => {
    const v = $('capacity').value.trim();
    if (!v) { updateSettings({ capacityG: null }, () => t('settings.capacityCleared')); return; }
    try { const g = C.parseCapacity(v); updateSettings({ capacityG: g }, () => t('settings.capacitySet', { cap: kg(g) })); }
    catch (e) { say('settings-status', L.error(e), 'error'); }
  });
  $('fill').addEventListener('change', () => updateSettings({ gentleFillPct: Number($('fill').value.trim()) }, (s) => t('settings.fillSet', { pct: L.number(s.gentleFillPct) })));
  $('merge').addEventListener('change', () => updateSettings({ mergeLight: $('merge').checked }, (s) => t(s.mergeLight ? 'settings.mergeOn' : 'settings.mergeOff')));
  $('gap').addEventListener('change', () => updateSettings({ tempGapC: $('gap').value }, (s) => (s.tempGapC === null ? t('settings.gapNone') : t('settings.gapSet', { t: deg(s.tempGapC) }))));

  // ---------- Formulaire
  function resetForm() {
    editing = null; form.reset(); form.inBasket.checked = true; form.maxC.value = '40'; form.maxC.disabled = false;
    $('save').textContent = t('btn.add'); $('cancel').hidden = true;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      if (!editing && data.garments.length >= C.MAX_GARMENTS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_GARMENTS })}`);
      const g = C.makeGarment({ name: form.name.value, color: form.color.value, material: form.material.value, care: form.care.value, maxC: form.maxC.value,
        weight: form.weight.value, tumble: form.tumble.checked, delicate: form.delicate.checked, inBasket: form.inBasket.checked }, editing || newId());
      const was = editing;
      const garments = was ? data.garments.map((x) => (x.id === g.id ? g : x)) : [...data.garments, g];
      if (!save({ ...data, garments })) return;
      resetForm(); render();
      say('form-status', t(was ? 'form.updated' : 'form.added', { name: g.name }), 'ok'); form.name.focus();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });
  $('cancel').addEventListener('click', () => { resetForm(); say('form-status', ''); });
  function edit(g) {
    editing = g.id;
    form.name.value = g.name; form.color.value = g.color; form.material.value = g.material; form.care.value = g.care;
    form.maxC.value = String(g.maxC || 40); form.maxC.disabled = g.care !== 'machine';
    form.weight.value = String(g.weightG / 1000); form.tumble.checked = g.tumble; form.delicate.checked = g.delicate; form.inBasket.checked = g.inBasket;
    $('save').textContent = t('btn.update'); $('cancel').hidden = false;
    say('form-status', t('form.editing', { name: g.name }));
    form.scrollIntoView({ block: 'start' }); form.name.focus();
  }

  // ---------- Liste des vêtements
  function renderList() {
    const list = data.garments.slice().sort((a, b) => (b.inBasket - a.inBasket) || a.name.localeCompare(b.name, L.locale));
    const n = data.garments.filter((g) => g.inBasket).length;
    $('list-count').textContent = t('list.count', { n: data.garments.length, basket: n });
    $('all-in').disabled = $('all-out').disabled = !data.garments.length;
    if (!list.length) { $('garments').replaceChildren(el('li', 'empty', t('list.empty'))); return; }
    $('garments').replaceChildren(...list.map((g) => {
      const li = el('li', 'g c-' + g.color + (g.inBasket ? '' : ' out'));
      const box = el('input'); box.type = 'checkbox'; box.checked = g.inBasket; box.setAttribute('aria-label', t('aria.basket', { name: g.name }));
      box.addEventListener('change', () => { if (save({ ...data, garments: data.garments.map((x) => (x.id === g.id ? { ...x, inBasket: box.checked } : x)) })) render(); });
      const txt = el('div', 'txt');
      txt.append(el('b', '', g.name));
      const meta = [t('color.' + g.color), t('material.' + g.material), careText(g), kg(g.weightG), t(g.tumble ? 'meta.tumble' : 'meta.air')];
      if (g.delicate) meta.push(t('meta.delicate'));
      txt.append(el('span', '', meta.join(' · ')));
      const acts = el('div', 'acts');
      const ed = el('button', 'btn', t('btn.edit')); ed.type = 'button'; ed.setAttribute('aria-label', t('aria.edit', { name: g.name })); ed.addEventListener('click', () => edit(g));
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: g.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('confirm.delete', { name: g.name }))) return;
        if (save({ ...data, garments: data.garments.filter((x) => x.id !== g.id) })) { if (editing === g.id) resetForm(); render(); say('list-status', t('list.deleted', { name: g.name }), 'ok'); }
      });
      acts.append(ed, del); li.append(box, txt, acts); return li;
    }));
  }
  function setAll(inBasket) { if (save({ ...data, garments: data.garments.map((g) => ({ ...g, inBasket })) })) { render(); say('list-status', t(inBasket ? 'list.allIn' : 'list.allOut'), 'ok'); } }
  $('all-in').addEventListener('click', () => setAll(true));
  $('all-out').addEventListener('click', () => setAll(false));

  // ---------- Charges
  function kpi(label, value) { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; }
  function why(l) {
    const out = [t('why.color.' + l.color), t('why.program.' + l.program)];
    out.push(l.colder.length ? t('why.tempLimited', { t: deg(l.maxC), names: names(l.limitedBy), others: names(l.colder) }) : t('why.tempAll', { t: deg(l.maxC) }));
    if (l.parts > 1) out.push(l.bands > 1 ? t('why.splitTemp', { part: l.part, parts: l.parts, t: deg(data.settings.tempGapC) }) : t('why.splitCap', { part: l.part, parts: l.parts, cap: kg(l.capacityG) }));
    if (l.program !== 'normal' && data.settings.gentleFillPct < 100) out.push(t('why.fill', { pct: L.number(data.settings.gentleFillPct), cap: kg(l.capacityG) }));
    out.push(t('why.dry', { tumble: l.tumble.length ? names(l.tumble) : '—', air: l.air.length ? names(l.air) : '—' }));
    return out;
  }
  let last = null; // dernier plan affiché (pour l'export CSV)
  function renderLoads() {
    last = null;
    $('loads').replaceChildren(); $('excluded').replaceChildren(); $('kpis').replaceChildren();
    $('export-csv').disabled = true;
    if (!data.settings.capacityG) { $('loads').append(el('li', 'empty', t('loads.noCapacity'))); return; }
    const r = C.plan(data.garments, data.settings);
    $('kpis').append(kpi(t('kpi.basket'), L.number(r.inBasket)), kpi(t('kpi.loads'), L.number(r.loads.length)), kpi(t('kpi.weight'), kg(r.totalG)));
    if (!r.loads.length) $('loads').append(el('li', 'empty', t(r.inBasket ? 'loads.noneMachine' : 'loads.empty')));
    r.loads.forEach((l, k) => {
      const li = el('li', 'load c-' + l.color);
      const head = el('div', 'load-head');
      head.append(el('b', '', t('load.title', { n: k + 1 })), el('span', 'pill', t('colorClass.' + l.color)), el('span', 'pill', t('program.' + l.program)), el('span', 'pill temp', t('load.temp', { t: deg(l.maxC) })));
      li.append(head);
      const bar = el('div', 'bar' + (l.over ? ' over' : '')), fill = el('i'); fill.style.width = Math.min(100, l.fillPct) + '%'; bar.append(fill);
      li.append(bar, el('p', 'fillline', t('load.fill', { w: kg(l.weightG), cap: kg(l.capacityG), pct: L.number(l.fillPct) })));
      if (l.over) li.append(el('p', 'alert', t('load.over', { name: names(l.items) })));
      li.append(el('p', 'items', names(l.items)));
      const ul = el('ul', 'why'); for (const w of why(l)) ul.append(el('li', '', w));
      li.append(ul);
      $('loads').append(li);
    });
    if (r.excluded.hand.length) $('excluded').append(el('p', 'excl', t('excl.hand', { names: names(r.excluded.hand) })));
    if (r.excluded.none.length) $('excluded').append(el('p', 'excl', t('excl.none', { names: names(r.excluded.none) })));
    last = r; $('export-csv').disabled = !r.loads.length;
  }
  $('export-csv').addEventListener('click', () => {
    if (!last || !last.loads.length) return;
    try {
      const csv = C.toCSV(last, data.garments, { headers: ['csv.load', 'csv.color', 'csv.program', 'csv.temp', 'csv.garment', 'csv.weight', 'csv.tumble'].map((k) => t(k)),
        colorLabel: (c) => t('colorClass.' + c), programLabel: (p) => t('program.' + p), yes: t('csv.yes'), no: t('csv.no'), decimal: L.number(1.5).includes(',') ? 'comma' : 'dot' });
      download('laundryload-loads.csv', csv, 'text/csv;charset=utf-8'); say('backup-status', t('csv.done'), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });

  // ---------- Exemple dans la langue affichée
  $('sample').addEventListener('click', () => {
    if (data.garments.length && !confirm(t('sample.confirm'))) return;
    try {
      const plan = [ // nom, couleur, matière, lavage, temp, poids kg, sèche-linge, délicat
        ['sheets', 'white', 'cotton', 'machine', 60, '1.2', true, false], ['tshirtW', 'white', 'cotton', 'machine', 40, '0.2', true, false],
        ['towels', 'white', 'cotton', 'machine', 90, '1.8', true, false], ['shirt', 'light', 'cotton', 'machine', 40, '0.3', false, false],
        ['jeans', 'dark', 'cotton', 'machine', 40, '0.8', false, false], ['leggings', 'dark', 'synthetic', 'machine', 30, '0.25', false, false],
        ['hoodie', 'dark', 'blend', 'machine', 30, '0.7', true, false], ['blouse', 'color', 'silk', 'machine', 30, '0.15', false, true],
        ['sweater', 'color', 'wool', 'machine', 30, '0.5', false, false], ['cardigan', 'light', 'wool', 'hand', 0, '0.4', false, true],
        ['tshirtC', 'color', 'cotton', 'machine', 40, '0.2', true, false],
      ];
      const garments = plan.map(([k, color, material, care, maxC, weight, tumble, delicate]) =>
        C.makeGarment({ name: t('sample.' + k), color, material, care, maxC, weight, tumble, delicate, inBasket: true }, newId()));
      if (!save({ settings: { capacityG: 7000, mergeLight: true, tempGapC: 20, gentleFillPct: 50 }, garments })) return;
      resetForm(); renderSettings(); render(); say('form-status', t('sample.done'), 'ok');
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  // ---------- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('laundryload-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.garments.length, b: next.garments.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; resetForm(); renderSettings(); render();
      say('backup-status', t('backup.restored', { n: next.garments.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('laundryload-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderList(); renderLoads(); }

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillSelects(); resetForm(); renderSettings();
  L.onChange(() => { // saisie du formulaire et réglages en cours conservés
    for (const id of ['settings-status', 'form-status', 'list-status', 'backup-status']) say(id, '');
    fillSelects(); $('save').textContent = t(editing ? 'btn.update' : 'btn.add'); render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
