/* GardenPlanner — interface. Calculs dans core.js (GardenCore) ; textes et dates dans LouvreI18n.
   Chaque modification est enregistrée immédiatement (aucun enregistrement différé). */
(() => {
  'use strict';
  const C = window.GardenCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-gardenplanner-v1';
  const ACTIVE = 'louvre-gardenplanner-active'; // parcelle affichée (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const todayDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const STEPS = ['plant', 'harvest', 'harvestEnd'];

  let data = { beds: [], crops: [] };
  let readOnly = false;
  let bedId = null;
  let year = Number(todayDay().slice(0, 4));
  let month = todayDay().slice(0, 7);
  let editingBed = false, editingCrop = null;
  const cf = $('crop-form'), bf = $('bed-form');

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = { beds: next.beds, crops: next.crops }; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const bed = () => data.beds.find((b) => b.id === bedId) || null;
  const bedName = (id) => { const b = data.beds.find((x) => x.id === id); return b ? b.name : '?'; };
  const sortedBeds = () => [...data.beds].sort((a, b) => a.name.localeCompare(b.name, L.locale));
  const m2 = (cm2) => `${L.number(cm2 / 10000, { maximumFractionDigits: 2 })} m²`;
  const shortDate = (d) => L.date(d, { day: 'numeric', month: 'short' });
  function setBed(id) { bedId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (e) { /* confort seulement */ } }

  // ---------- Parcelles et grille
  function renderBeds() {
    if (!bed()) setBed(sortedBeds()[0] ? sortedBeds()[0].id : null);
    $('year-label').textContent = L.number(year, { useGrouping: false });
    const sel = $('bed-select');
    sel.replaceChildren(...sortedBeds().map((b) => { const o = el('option', '', b.name); o.value = b.id; return o; }));
    sel.value = bedId || '';
    sel.disabled = $('edit-bed').disabled = $('delete-bed').disabled = !bed();
    $('no-bed').hidden = !!bed(); $('bed-view').hidden = !bed(); $('crop-panel').hidden = !bed();
    $('export-ics').textContent = t('btn.ics', { year: L.number(year, { useGrouping: false }) });
    $('export-ics').disabled = !data.crops.length;
    if (!data.beds.length) $('bed-add').open = true;
    const b = bed(); if (!b) return;
    const list = C.cropsInYear(data.crops, b.id, year);
    $('bed-meta').textContent = t('bed.meta', { cols: b.cols, rows: b.rows, cell: L.number(b.cellCm), area: m2(C.bedAreaCm2(b)), n: list.length });
    const cells = C.grid(b, data.crops, year), byId = Object.fromEntries(list.map((c) => [c.id, c]));
    const garden = $('garden');
    garden.style.gridTemplateColumns = `repeat(${b.cols}, minmax(0, 1fr))`;
    garden.replaceChildren();
    for (let r = 0; r < b.rows; r += 1) for (let k = 0; k < b.cols; k += 1) {
      const ids = cells[r][k], first = ids.length ? byId[ids[0]] : null;
      const cell = el('button', 'cell' + (first ? ' fam-' + first.family : ''), first ? first.name.slice(0, 2) : '');
      cell.type = 'button';
      if (ids.length > 1) cell.append(el('sup', '', ids.length));
      const names = ids.map((id) => byId[id].name).join(', ');
      cell.setAttribute('aria-label', t('grid.cell', { x: k + 1, y: r + 1, what: names || t('grid.free') }));
      cell.title = cell.getAttribute('aria-label');
      cell.addEventListener('click', () => { cf.x.value = String(k + 1); cf.y.value = String(r + 1); say('crop-status', t('crop.cellChosen', { x: k + 1, y: r + 1 })); cf.name.focus(); });
      garden.append(cell);
    }
    renderCrops(list, b);
  }
  function stepsText(c) {
    const d = C.cropDates(c);
    const parts = [t('kind.sow') + ' ' + shortDate(d.sow)];
    if (d.plant) parts.push(t('kind.plant') + ' ' + shortDate(d.plant));
    parts.push(t('kind.harvest') + ' ' + shortDate(d.harvest) + (d.harvestEnd ? ' – ' + shortDate(d.harvestEnd) : ''));
    return parts.join(' · ');
  }
  function renderCrops(list, b) {
    const box = $('crops');
    if (!list.length) { box.replaceChildren(el('li', 'empty', t('crops.empty'))); return; }
    box.replaceChildren(...list.sort((x, y) => (C.cropDates(x).start < C.cropDates(y).start ? -1 : 1)).map((c) => {
      const li = el('li'), txt = el('div', 'txt'), head = el('b');
      head.append(el('i', 'swatch fam-' + c.family), document.createTextNode(c.name));
      txt.append(head, el('span', '', `${t('fam.' + c.family)} · ${t('crop.cells', { x: c.x, y: c.y, w: c.w, h: c.h, area: m2(C.cropAreaCm2(c, b)) })}`));
      txt.append(el('span', '', stepsText(c)));
      if (c.note) txt.append(el('span', 'note', c.note));
      for (const w of C.rotationWarnings(data.crops, c)) {
        txt.append(el('span', 'warn', t(w.cells ? 'rot.cells' : 'rot.bed', { name: w.crop.name, year: L.number(C.cropDates(w.crop).year, { useGrouping: false }) })));
      }
      const acts = el('div', 'acts');
      const edit = el('button', 'btn small', t('btn.edit')); edit.type = 'button'; edit.setAttribute('aria-label', t('aria.edit', { name: c.name }));
      edit.addEventListener('click', () => fillCrop(c));
      const del = el('button', 'btn small', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: c.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('crop.confirmDelete', { name: c.name }))) return;
        if (save(C.removeCrop(data, c.id))) { if (editingCrop === c.id) resetCrop(); render(); say('crop-status', t('crop.deleted', { name: c.name }), 'ok'); }
      });
      acts.append(edit, del); li.append(txt, acts); return li;
    }));
  }
  $('bed-select').addEventListener('change', (e) => { setBed(e.target.value); resetCrop(); render(); });
  $('year-prev').addEventListener('click', () => { year -= 1; render(); });
  $('year-next').addEventListener('click', () => { year += 1; render(); });
  function resetBed() { editingBed = false; bf.reset(); $('save-bed').textContent = t('btn.saveBed'); $('bed-summary').textContent = t('bed.add'); $('cancel-bed').hidden = true; }
  bf.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const b = C.makeBed({ name: bf.name.value, cols: bf.cols.value, rows: bf.rows.value, cellCm: bf.cellCm.value }, editingBed ? bedId : newId());
      if (data.beds.some((x) => x.id !== b.id && x.name.toLocaleLowerCase(L.locale) === b.name.toLocaleLowerCase(L.locale))) throw new Error('err.bedExists');
      if (!save(C.upsertBed(data, b))) return;
      say('bed-status', t(editingBed ? 'bed.updated' : 'bed.added', { name: b.name }), 'ok');
      setBed(b.id); resetBed(); $('bed-add').open = false; render();
    } catch (e) { say('bed-status', L.error(e), 'error'); }
  });
  $('edit-bed').addEventListener('click', () => {
    const b = bed(); if (!b) return;
    editingBed = true; bf.name.value = b.name; bf.cols.value = String(b.cols); bf.rows.value = String(b.rows); bf.cellCm.value = String(b.cellCm);
    $('save-bed').textContent = t('btn.updateBed'); $('bed-summary').textContent = t('bed.editing', { name: b.name }); $('cancel-bed').hidden = false;
    $('bed-add').open = true; bf.name.focus();
  });
  $('cancel-bed').addEventListener('click', () => { resetBed(); say('bed-status', ''); });
  $('delete-bed').addEventListener('click', () => {
    const b = bed(); if (!b) return;
    const n = data.crops.filter((c) => c.bedId === b.id).length;
    if (!confirm(t('bed.confirmDelete', { name: b.name, n }))) return;
    if (!save(C.removeBed(data, b.id))) return;
    setBed(null); resetBed(); resetCrop(); render(); say('bed-status', t('bed.deleted', { name: b.name }), 'ok');
  });

  // ---------- Formulaire de culture
  function buildFamilies() {
    const sel = $('family'), cur = sel.value || 'solanaceae';
    sel.replaceChildren(...C.FAMILIES.map((f) => { const o = el('option', '', t('fam.' + f)); o.value = f; return o; }));
    sel.value = cur;
  }
  function syncSteps() { // affiche le champ date ou le champ délai selon le mode choisi
    for (const s of STEPS) {
      const mode = cf[s + '-mode'].value;
      cf[s + '-date'].hidden = mode !== 'date'; cf[s + '-days'].hidden = mode !== 'days';
    }
  }
  for (const s of STEPS) cf[s + '-mode'].addEventListener('change', syncSteps);
  const step = (s) => { const mode = cf[s + '-mode'].value; return { mode, value: mode === 'date' ? cf[s + '-date'].value : cf[s + '-days'].value }; };
  function resetCrop() {
    editingCrop = null;
    const keep = { x: cf.x.value, y: cf.y.value };
    cf.reset(); cf.x.value = keep.x || '1'; cf.y.value = keep.y || '1';
    cf.sow.value = todayDay(); syncSteps();
    $('save-crop').textContent = t('btn.saveCrop'); $('cancel-crop').hidden = true;
  }
  function fillCrop(c) {
    editingCrop = c.id;
    cf.name.value = c.name; cf.family.value = c.family; cf.note.value = c.note;
    cf.x.value = String(c.x); cf.y.value = String(c.y); cf.w.value = String(c.w); cf.h.value = String(c.h); cf.sow.value = c.sow;
    const set = (s, days) => { cf[s + '-mode'].value = days === null ? 'none' : 'days'; cf[s + '-days'].value = days === null ? '' : String(days); cf[s + '-date'].value = days === null ? '' : C.addDays(c.sow, days); };
    set('plant', c.plantDays); set('harvest', c.harvestDays); set('harvestEnd', c.harvestEndDays);
    syncSteps();
    $('save-crop').textContent = t('btn.updateCrop'); $('cancel-crop').hidden = false;
    say('crop-status', t('crop.editing', { name: c.name })); cf.name.focus();
  }
  $('cancel-crop').addEventListener('click', () => { resetCrop(); say('crop-status', ''); });
  cf.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const old = editingCrop ? data.crops.find((c) => c.id === editingCrop) : null;
      const crop = C.makeCrop({ bedId, name: cf.name.value, family: cf.family.value, x: cf.x.value, y: cf.y.value, w: cf.w.value, h: cf.h.value,
        sow: cf.sow.value, plant: step('plant'), harvest: step('harvest'), harvestEnd: step('harvestEnd'), note: cf.note.value, done: old ? old.done : [] }, editingCrop || newId(), data.beds);
      if (!save(C.upsertCrop(data, crop))) return;
      const cy = C.cropDates(crop).year; if (cy !== year) year = cy; // la culture est visible l'année où elle occupe la parcelle
      const warn = C.rotationWarnings(data.crops, crop);
      say('crop-status', t(editingCrop ? 'crop.updated' : 'crop.added', { name: crop.name }) + (warn.length ? ' ' + t('rot.short', { name: warn[0].crop.name }) : ''), warn.length ? 'warn' : 'ok');
      resetCrop(); render();
    } catch (e) { say('crop-status', L.error(e), 'error'); }
  });

  // ---------- Calendrier du mois
  function renderTasks() {
    const { from, to } = C.monthBounds(month);
    $('month-label').textContent = L.date(from, { month: 'long', year: 'numeric' });
    const list = C.tasks(data.crops, from, to);
    if (!list.length) { $('tasks').replaceChildren(el('li', 'empty', t('tasks.empty'))); return; }
    const today = todayDay();
    $('tasks').replaceChildren(...list.map((x) => {
      const late = !x.done && x.day < today;
      const li = el('li', (x.done ? 'done' : '') + (late ? ' late' : '')), lab = el('label', 'check');
      const box = el('input'); box.type = 'checkbox'; box.checked = x.done;
      box.addEventListener('change', () => {
        const cur = data.crops.find((c) => c.id === x.crop.id);
        if (save(C.upsertCrop(data, C.toggleDone(cur, x.kind)))) { render(); say('task-status', t(box.checked ? 'task.done' : 'task.undone', { kind: t('kind.' + x.kind), name: x.crop.name }), 'ok'); }
        else box.checked = !box.checked;
      });
      const txt = el('span', 'txt');
      txt.append(el('b', '', `${L.date(x.day, { weekday: 'short', day: 'numeric' })} — ${t('kind.' + x.kind)} : ${x.crop.name}`));
      txt.append(el('span', '', [bedName(x.crop.bedId), late ? t('task.late') : ''].filter(Boolean).join(' · ')));
      lab.append(box, txt); li.append(lab); return li;
    }));
  }
  $('month-prev').addEventListener('click', () => { month = C.addMonth(month, -1); renderTasks(); });
  $('month-next').addEventListener('click', () => { month = C.addMonth(month, 1); renderTasks(); });

  function render() { renderBeds(); renderTasks(); }

  // ---------- Exemple dans la langue affichée (dates et délais de démonstration)
  $('sample').addEventListener('click', () => {
    if (data.beds.length && !confirm(t('sample.confirm'))) return;
    try {
      const y = Number(todayDay().slice(0, 4));
      const b1 = C.makeBed({ name: t('sample.bed1'), cols: '6', rows: '4', cellCm: '30' }, newId());
      const b2 = C.makeBed({ name: t('sample.bed2'), cols: '4', rows: '2', cellCm: '40' }, newId());
      let next = { beds: [b1, b2], crops: [] };
      const add = (b, k, family, x, yy, w, h, sow, plant, harvest, end) => {
        const stepOf = (v) => (v === null ? { mode: 'none' } : { mode: 'days', value: String(v) });
        next = C.upsertCrop(next, C.makeCrop({ bedId: b.id, name: t('sample.' + k), family, x: String(x), y: String(yy), w: String(w), h: String(h), sow, plant: stepOf(plant), harvest: stepOf(harvest), harvestEnd: stepOf(end), note: '' }, newId(), next.beds));
      };
      add(b1, 'potato', 'solanaceae', 1, 1, 3, 2, `${y - 1}-04-01`, null, 100, null);
      add(b1, 'tomato', 'solanaceae', 1, 1, 2, 2, `${y}-03-01`, 60, 140, 200);
      add(b1, 'lettuce', 'asteraceae', 3, 1, 2, 1, `${y}-03-15`, 21, 70, 85);
      add(b1, 'carrot', 'apiaceae', 5, 1, 2, 4, `${y}-04-01`, null, 90, 120);
      add(b1, 'radish', 'brassicaceae', 1, 4, 4, 1, `${y}-04-10`, null, 30, 40);
      add(b2, 'bean', 'fabaceae', 1, 1, 4, 2, `${y}-05-10`, null, 70, 100);
      if (!save(next)) return;
      setBed(b1.id); year = y; $('bed-add').open = false; resetBed(); resetCrop(); render(); say('bed-status', t('sample.done'), 'ok');
    } catch (e) { say('bed-status', L.error(e), 'error'); }
  });

  // ---------- Export et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-ics').addEventListener('click', () => {
    try {
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const out = C.toICS(data.crops, data.beds, year, stamp, {
        summary: (kind, c, b) => `${t('kind.' + kind)} — ${c.name} (${b ? b.name : '?'})`,
        description: (kind, c) => `${t('fam.' + c.family)} · ${t('ics.cells', { x: c.x, y: c.y, w: c.w, h: c.h })} · GardenPlanner`,
      });
      download(`gardenplanner-${year}.ics`, out.text, 'text/calendar;charset=utf-8');
      say('ics-status', t('ics.done', { n: out.count }), 'ok');
    } catch (e) { say('ics-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('gardenplanner-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
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
      if (!confirm(t('backup.confirm', { a: data.beds.length, b: next.beds.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true; setBed(null); resetBed(); resetCrop(); render();
      say('backup-status', t('backup.restored', { n: next.beds.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('gardenplanner-raw-storage.txt', raw, 'text/plain'); });

  // ---------- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
    bedId = localStorage.getItem(ACTIVE);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  buildFamilies(); resetCrop();
  L.onChange(() => { // la saisie en cours est conservée
    for (const id of ['bed-status', 'crop-status', 'task-status', 'ics-status', 'backup-status']) say(id, '');
    $('save-crop').textContent = t(editingCrop ? 'btn.updateCrop' : 'btn.saveCrop');
    $('save-bed').textContent = t(editingBed ? 'btn.updateBed' : 'btn.saveBed');
    $('bed-summary').textContent = editingBed && bed() ? t('bed.editing', { name: bed().name }) : t('bed.add');
    buildFamilies(); render();
  });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
