/* TimelineBuilder — interface. Calendrier, échelle et SVG dans core.js (TimelineCore) ; textes dans LouvreI18n.
   La frise affichée est exactement le SVG exporté : texte échappé par le moteur, analysé par DOMParser (jamais innerHTML). */
(() => {
  'use strict';
  const C = window.TimelineCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-timelinebuilder-v1';
  const ACTIVE = 'louvre-timelinebuilder-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let timelines = [], activeId = null, readOnly = false, editing = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cur = () => timelines.find((x) => x.id === activeId) || null;
  const errText = (e) => (e instanceof SyntaxError ? t('err.backup') : L.error(e));

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); timelines = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function change(fn, statusId) {
    const tl = cur(); if (!tl) return false;
    try { const next = fn(tl); return save(timelines.map((x) => (x.id === tl.id ? next : x))); }
    catch (e) { say(statusId, errText(e), 'error'); return false; }
  }

  // --- Dates affichées : noms de mois de la langue (Intl), ère traduite, années sans séparateur de milliers.
  const monthName = (m, style = 'long') => new Intl.DateTimeFormat(L.locale, { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 15)));
  function yearText(y) { const h = C.fromAstro(y); return h.era === 'bce' ? t('era.bce', { y: h.year }) : t('era.ce', { y: h.year }); }
  function dateText(x) {
    if (x.d) return t('fmt.day', { d: x.d, month: monthName(x.m), year: yearText(x.y) });
    if (x.m) return t('fmt.month', { month: monthName(x.m), year: yearText(x.y) });
    return yearText(x.y);
  }
  const rangeText = (e) => (e.end ? t('fmt.range', { from: dateText(e.start), to: dateText(e.end) }) : dateText(e.start));
  function tickText(k) {
    if (k.unit === 'year') return yearText(k.y);
    if (k.unit === 'month') return monthName(k.m, 'short');
    return t('fmt.tickDay', { d: k.d, month: monthName(k.m, 'short') });
  }

  // --- Affichage
  function renderTimelines() {
    const sel = $('timeline-select');
    sel.replaceChildren(...timelines.map((x) => { const o = el('option', '', `${x.name} (${x.events.length})`); o.value = x.id; return o; }));
    if (activeId) sel.value = activeId;
    for (const id of ['rename-timeline', 'delete-timeline', 'add-track', 'export-svg', 'export-csv']) $(id).disabled = !cur();
  }
  function renderTracks() {
    const tl = cur(), box = $('tracks');
    const sel = $('e-track'), keep = sel.value;
    sel.replaceChildren(...(tl ? tl.tracks.map((k) => { const o = el('option', '', k.name); o.value = k.id; return o; }) : []));
    if (tl && tl.tracks.some((k) => k.id === keep)) sel.value = keep;
    box.replaceChildren(...(tl ? tl.tracks.map((k, i) => {
      const li = el('li'), dot = el('span', 'swatch'); dot.style.background = C.COLORS[i % C.COLORS.length]; dot.setAttribute('aria-hidden', 'true');
      const count = tl.events.filter((e) => e.track === k.id).length;
      const name = el('span', 'tname', `${k.name} (${L.number(count)})`);
      const ren = el('button', 'btn small', '✎'); ren.type = 'button'; ren.setAttribute('aria-label', t('aria.renameTrack', { name: k.name })); ren.title = ren.getAttribute('aria-label'); ren.disabled = readOnly;
      ren.addEventListener('click', () => {
        const name2 = prompt(t('prompt.track'), k.name); if (name2 === null) return;
        if (change((x) => ({ ...x, tracks: x.tracks.map((q) => (q.id === k.id ? C.makeTrack({ name: name2 }, k.id) : q)) }), 'timeline-status')) renderAll();
      });
      const del = el('button', 'btn small', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeTrack', { name: k.name })); del.title = del.getAttribute('aria-label'); del.disabled = readOnly;
      del.addEventListener('click', () => { if (change((x) => C.removeTrack(x, k.id), 'timeline-status')) { renderAll(); say('timeline-status', t('track.removed', { name: k.name }), 'ok'); } });
      li.append(dot, name, ren, del); return li;
    }) : []));
  }
  function months(sel) {
    const keep = sel.value;
    const none = el('option', '', t('month.none')); none.value = '0';
    sel.replaceChildren(none, ...Array.from({ length: 12 }, (_, i) => { const o = el('option', '', monthName(i + 1)); o.value = String(i + 1); return o; }));
    sel.value = keep || '0';
  }
  function renderForm() {
    months($('s-month')); months($('x-month'));
    $('end-set').hidden = !$('e-period').checked;
    $('start-legend').textContent = $('e-period').checked ? t('f.startPeriod') : t('f.start');
    $('h-event').textContent = editing ? t('event.editTitle') : t('event.title');
    $('save-event').textContent = editing ? t('btn.saveEvent') : t('btn.addEvent');
    $('cancel-edit').hidden = !editing;
    for (const n of $('event-form').querySelectorAll('input, select, button')) if (n.id !== 'cancel-edit') n.disabled = !cur() || readOnly;
  }
  function chartWidth() { return Math.max(640, Math.floor($('chart').clientWidth || 640)); }
  function fmt() {
    return {
      desc: (g) => (g.count ? t('svg.desc', { n: g.count, from: yearText(C.civil(g.min).y), to: yearText(C.civil(g.max).y) }) : t('svg.empty')),
      tick: tickText, range: rangeText, emptyTrack: t('track.empty'),
    };
  }
  function svgText() { const tl = cur(); return tl ? C.toSVG(tl, { width: chartWidth() }, fmt()) : ''; }
  function renderChart() {
    const tl = cur(), box = $('chart');
    if (!tl) { box.replaceChildren(); $('chart-info').textContent = ''; return; }
    const doc = new DOMParser().parseFromString(svgText(), 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName !== 'svg') { box.replaceChildren(el('p', 'empty', t('err.render'))); return; }
    box.replaceChildren(document.importNode(svg, true));
    $('chart-info').textContent = tl.events.length ? t('chart.info', { n: tl.events.length }) : t('chart.empty');
  }
  function renderEvents() {
    const tl = cur(), box = $('events');
    if (!tl) { box.replaceChildren(); return; }
    box.replaceChildren(...tl.tracks.map((k, i) => {
      const wrap = el('div', 'group'), h = el('h4', '', k.name); h.style.borderColor = C.COLORS[i % C.COLORS.length];
      const ul = el('ul', 'list');
      const evs = C.sorted(tl.events.filter((e) => e.track === k.id));
      for (const e of evs) {
        const li = el('li'), txt = el('div', 'txt');
        txt.append(el('b', '', e.title), el('span', '', rangeText(e)));
        if (e.note) txt.append(el('span', '', e.note));
        const acts = el('div', 'acts');
        const ed = el('button', 'btn small', '✎'); ed.type = 'button'; ed.setAttribute('aria-label', t('aria.edit', { title: e.title })); ed.title = ed.getAttribute('aria-label'); ed.disabled = readOnly;
        ed.addEventListener('click', () => startEdit(e.id));
        const del = el('button', 'btn small', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('aria.remove', { title: e.title })); del.title = del.getAttribute('aria-label'); del.disabled = readOnly;
        del.addEventListener('click', () => removeEvent(e.id));
        acts.append(ed, del); li.append(txt, acts); ul.append(li);
      }
      if (!evs.length) ul.append(el('li', 'empty', t('track.empty')));
      wrap.append(h, ul); return wrap;
    }));
  }
  function renderAll() { renderTimelines(); renderTracks(); renderForm(); renderChart(); renderEvents(); }

  // --- Événements
  function readDate(prefix) { return C.parseDate({ era: $(`${prefix}-era`).value, year: $(`${prefix}-year`).value, month: $(`${prefix}-month`).value, day: $(`${prefix}-day`).value }); }
  function fillDate(prefix, x) {
    const h = x ? C.fromAstro(x.y) : { era: 'ce', year: '' };
    $(`${prefix}-era`).value = h.era; $(`${prefix}-year`).value = h.year ? String(h.year) : '';
    $(`${prefix}-month`).value = x ? String(x.m) : '0'; $(`${prefix}-day`).value = x && x.d ? String(x.d) : '';
  }
  function resetForm() { editing = null; $('e-title').value = ''; $('e-note').value = ''; $('e-period').checked = false; fillDate('s', null); fillDate('x', null); renderForm(); }
  function startEdit(eventId) {
    const e = cur().events.find((x) => x.id === eventId); if (!e) return;
    editing = eventId;
    $('e-title').value = e.title; $('e-note').value = e.note; $('e-period').checked = !!e.end;
    renderForm(); $('e-track').value = e.track; fillDate('s', e.start); fillDate('x', e.end);
    say('event-status', t('event.editing', { title: e.title })); $('e-title').focus();
  }
  function removeEvent(eventId) {
    const e = cur().events.find((x) => x.id === eventId); if (!e || !confirm(t('confirm.event', { title: e.title }))) return;
    if (change((x) => ({ ...x, events: x.events.filter((q) => q.id !== eventId) }), 'chart-status')) {
      if (editing === eventId) resetForm();
      renderAll(); say('chart-status', t('event.removed', { title: e.title }), 'ok');
    }
  }
  $('e-period').addEventListener('change', renderForm);
  $('event-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const tl = cur(); if (!tl) return;
    try {
      if (!editing && tl.events.length >= C.MAX.events) throw new Error(`err.tooManyEvents|${JSON.stringify({ max: C.MAX.events })}`);
      let start, end = null;
      try { start = readDate('s'); } catch (e) { throw new Error(`err.inStart|${JSON.stringify({ msg: L.error(e) })}`); }
      if ($('e-period').checked) { try { end = readDate('x'); } catch (e) { throw new Error(`err.inEnd|${JSON.stringify({ msg: L.error(e) })}`); } }
      const e = C.makeEvent({ title: $('e-title').value, start, end, track: $('e-track').value, note: $('e-note').value }, editing || newId());
      const was = !!editing;
      if (!change((x) => ({ ...x, events: was ? x.events.map((q) => (q.id === e.id ? e : q)) : [...x.events, e] }), 'event-status')) return;
      resetForm(); renderAll();
      say('event-status', t(was ? 'event.saved' : 'event.added', { title: e.title, date: rangeText(e) }), 'ok');
      $('e-title').focus();
    } catch (err) { say('event-status', errText(err), 'error'); }
  });
  $('cancel-edit').addEventListener('click', () => { resetForm(); say('event-status', ''); });

  // --- Frises et pistes
  function select(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort */ } resetForm(); renderAll(); }
  $('timeline-select').addEventListener('change', (e) => select(e.target.value));
  function addTimeline(tl, msg) {
    if (timelines.length >= C.MAX.timelines) throw new Error(`err.tooManyTimelines|${JSON.stringify({ max: C.MAX.timelines })}`);
    if (!save([...timelines, tl])) return false;
    select(tl.id); say('timeline-status', msg, 'ok'); return true;
  }
  const blank = (name) => C.makeTimeline({ name, tracks: [C.makeTrack({ name: t('track.default') }, newId())] }, newId());
  $('new-timeline').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('timeline.newDefault', { n: timelines.length + 1 }));
    if (name === null) return;
    try { addTimeline(blank(name), t('timeline.created')); } catch (e) { say('timeline-status', errText(e), 'error'); }
  });
  $('rename-timeline').addEventListener('click', () => {
    const tl = cur(); if (!tl) return;
    const name = prompt(t('prompt.rename'), tl.name); if (name === null) return;
    try { const fixed = C.makeTimeline({ ...tl, name }, tl.id); if (save(timelines.map((x) => (x.id === tl.id ? fixed : x)))) renderAll(); } catch (e) { say('timeline-status', errText(e), 'error'); }
  });
  $('delete-timeline').addEventListener('click', () => {
    const tl = cur(); if (!tl || !confirm(t('confirm.timeline', { name: tl.name, n: tl.events.length }))) return;
    if (save(timelines.filter((x) => x.id !== tl.id))) { select(timelines[0] ? timelines[0].id : null); say('timeline-status', t('timeline.deleted'), 'ok'); }
  });
  $('add-track').addEventListener('click', () => {
    const tl = cur(); if (!tl) return;
    if (tl.tracks.length >= C.MAX.tracks) { say('timeline-status', t('err.tooManyTracks', { max: C.MAX.tracks }), 'error'); return; }
    const name = prompt(t('prompt.track'), t('track.newDefault', { n: tl.tracks.length + 1 })); if (name === null) return;
    try {
      const k = C.makeTrack({ name }, newId());
      if (change((x) => ({ ...x, tracks: [...x.tracks, k] }), 'timeline-status')) { renderAll(); $('e-track').value = k.id; say('timeline-status', t('track.added', { name: k.name }), 'ok'); }
    } catch (e) { say('timeline-status', errText(e), 'error'); }
  });
  // Exemple dans la langue affichée : dates historiques usuelles (deux traditionnelles, signalées comme telles).
  $('sample').addEventListener('click', () => {
    try {
      const pol = C.makeTrack({ name: t('sample.t1') }, newId()), cul = C.makeTrack({ name: t('sample.t2') }, newId());
      const D = (era, year, month = 0, day = 0) => C.parseDate({ era, year: String(year), month: String(month), day: String(day) });
      const ev = (key, track, start, end = null) => C.makeEvent({ title: t(`sample.${key}`), track: track.id, start, end, note: t(`sample.${key}.note`) }, newId());
      const events = [
        ev('olympics', cul, D('bce', 776)), ev('rome', pol, D('bce', 753)), ev('empire', pol, D('bce', 27), D('ce', 476)),
        ev('revolution', pol, D('ce', 1789), D('ce', 1799)), ev('bastille', pol, D('ce', 1789, 7, 14)), ev('ww2', pol, D('ce', 1939), D('ce', 1945)),
        ev('moon', cul, D('ce', 1969, 7)), ev('wall', pol, D('ce', 1989, 11, 9)),
      ];
      addTimeline(C.makeTimeline({ name: t('sample.name'), tracks: [pol, cul], events }, newId()), t('sample.added'));
    } catch (e) { say('timeline-status', errText(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'timeline';
  $('export-svg').addEventListener('click', () => {
    const tl = cur(); if (!tl) return;
    download(`${slug(tl.name)}.svg`, '<?xml version="1.0" encoding="UTF-8"?>\n' + C.toSVG(tl, { width: Math.max(960, chartWidth()) }, fmt()), 'image/svg+xml');
    say('chart-status', t('svg.done'), 'ok');
  });
  $('export-csv').addEventListener('click', () => {
    const tl = cur(); if (!tl) return;
    const csv = C.toCSV(tl, { head: [t('csv.track'), t('csv.title'), t('csv.start'), t('csv.end'), t('csv.startText'), t('csv.endText'), t('csv.note')], date: dateText });
    download(`${slug(tl.name)}.csv`, csv, 'text/csv;charset=utf-8');
    say('chart-status', t('csv.done', { n: tl.events.length }), 'ok');
  });
  $('export').addEventListener('click', () => { try { download('timelinebuilder-backup.json', C.backup(timelines), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: timelines.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      $('warning').hidden = true; $('export-raw').hidden = true;
      select(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('timelinebuilder-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) timelines = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = timelines.some((x) => x.id === last) ? last : (timelines[0] ? timelines[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  if (!readOnly && !timelines.length) { try { const tl = blank(t('timeline.defaultName')); if (save([tl])) activeId = tl.id; } catch (_) { /* stockage bloqué */ } }
  let resize = null;
  window.addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(renderChart, 150); });
  // Changement de langue : le formulaire garde sa saisie (mois compris) ; frise, listes et libellés sont réaffichés.
  L.onChange(() => { for (const id of ['timeline-status', 'event-status', 'chart-status', 'backup-status']) say(id, ''); renderAll(); });
  renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
