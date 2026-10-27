/* JetLagPlanner — interface. Calculs dans core.js (JetCore) ; textes, dates et nombres dans LouvreI18n (appli sans argent). */
(() => {
  'use strict';
  const C = window.JetCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-jetlagplanner-v1';
  const ACTIVE = 'louvre-jetlagplanner-active';
  const SVG = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = String(txt); return n; };
  const sv = (tag, attrs = {}, txt) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (txt !== undefined) n.textContent = String(txt); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const STATUSES = ['plan-status', 'form-status', 'res-status', 'backup-status'];
  const FIELDS = ['name', 'homeZone', 'destZone', 'departure', 'bedtime', 'wake', 'stepMin', 'direction', 'before', 'after'];

  let plans = [], activeId = null, readOnly = false;

  function say(id, txt, kind = '') { const n = $(id); n.textContent = txt; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return plans.find((x) => x.id === activeId) || null; }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); plans = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  function guard(statusId, fn) { try { fn(); } catch (e) { say(statusId, e instanceof SyntaxError ? t('err.backup') : L.error(e), 'error'); } }
  function remember() { try { localStorage.setItem(ACTIVE, activeId || ''); } catch (_) { /* confort */ } }

  // --- Formats
  function dur(min) {
    const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60;
    if (!h) return t('dur.m', { m });
    return m ? t('dur.hm', { h, m: String(m).padStart(2, '0') }) : t('dur.h', { h });
  }
  const signed = (min) => (min ? `${min > 0 ? '+' : '−'}${dur(min)}` : dur(0));
  const dayLabel = (k) => (k < 0 ? t('day.minus', { n: -k }) : k === 0 ? t('day.zero') : t('day.plus', { n: k }));
  const dayIn = (zone, ms) => C.dayAt(ms, zone); // date du calendrier dans un fuseau, « AAAA-MM-JJ »

  // --- Affichage
  function renderPlans() {
    const sel = $('plan-select');
    sel.replaceChildren(...plans.map((x) => { const o = el('option', '', x.name); o.value = x.id; return o; }));
    const o = el('option', '', t('plan.new')); o.value = ''; sel.append(o);
    sel.value = activeId || '';
    $('delete-plan').disabled = !active();
  }
  function renderForm() {
    const f = $('plan-form'), p = active();
    for (const k of FIELDS) {
      if (!p) f[k].value = k === 'direction' ? 'auto' : '';
      else if (k === 'bedtime' || k === 'wake') f[k].value = C.clock(p[k]);
      else f[k].value = String(p[k]);
    }
  }
  function clockFace(zone, role, now) {
    const box = el('div', 'clock'), min = C.clockAt(now, zone);
    const svg = sv('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': t('aria.clock', { zone, time: C.clock(min) }) });
    svg.append(sv('circle', { cx: 50, cy: 50, r: 46, class: 'face' }));
    for (let i = 0; i < 12; i += 1) { const a = i * Math.PI / 6; svg.append(sv('line', { x1: 50 + 38 * Math.sin(a), y1: 50 - 38 * Math.cos(a), x2: 50 + 42 * Math.sin(a), y2: 50 - 42 * Math.cos(a), class: 'tick' })); }
    const ha = ((min % 720) / 720) * 2 * Math.PI, ma = ((min % 60) / 60) * 2 * Math.PI;
    svg.append(sv('line', { x1: 50, y1: 50, x2: 50 + 22 * Math.sin(ha), y2: 50 - 22 * Math.cos(ha), class: 'hand hour' }), sv('line', { x1: 50, y1: 50, x2: 50 + 34 * Math.sin(ma), y2: 50 - 34 * Math.cos(ma), class: 'hand min' }), sv('circle', { cx: 50, cy: 50, r: 4, class: 'pin' }));
    box.append(el('span', 'role', role), svg, el('b', '', C.clock(min)), el('span', '', L.date(dayIn(zone, now), { weekday: 'long', day: 'numeric', month: 'long' })), el('span', '', zone));
    return box;
  }
  function renderClocks() {
    const p = active(), now = Date.now();
    $('clocks-empty').hidden = !!p;
    $('clocks').replaceChildren(...(p ? [clockFace(p.homeZone, t('clock.home'), now), clockFace(p.destZone, t('clock.dest'), now)] : []));
  }
  // Graphique : une ligne par jour, axe 0-24 h à l'heure de destination.
  function chart(p, s) {
    const X0 = 84, W = 560, ROW = 26, TOP = 30, H = TOP + s.days.length * ROW + 10;
    const x = (min) => X0 + (min / 1440) * W;
    const svg = sv('svg', { xmlns: SVG, viewBox: `0 0 ${X0 + W + 18} ${H}`, role: 'img', 'font-family': 'system-ui, sans-serif', 'font-size': 12, fill: 'currentColor' });
    svg.append(sv('title', {}, t('chart.title', { home: p.homeZone, dest: p.destZone })));
    for (let h = 0; h <= 24; h += 3) {
      svg.append(sv('line', { x1: x(h * 60), y1: TOP - 6, x2: x(h * 60), y2: H - 10, stroke: '#8c86a8', 'stroke-opacity': 0.35 }));
      svg.append(sv('text', { x: x(h * 60), y: TOP - 12, 'text-anchor': 'middle', 'font-size': 11 }, C.clock(h * 60)));
    }
    s.days.forEach((d, i) => {
      const y = TOP + i * ROW;
      if (d.k === 0) svg.append(sv('rect', { x: 0, y: y, width: X0 + W + 10, height: ROW, fill: '#7950f2', 'fill-opacity': 0.08 }));
      svg.append(sv('text', { x: 4, y: y + ROW / 2 + 4, 'font-weight': d.k === 0 ? 700 : 400 }, dayLabel(d.k)));
      for (const [a, b] of C.segments(s.targetDest.bed, s.targetDest.wake)) svg.append(sv('rect', { x: x(a), y: y + 3, width: x(b) - x(a), height: ROW - 6, rx: 4, fill: 'none', stroke: '#e8590c', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
      for (const [a, b] of C.segments(d.bedDest, d.wakeDest)) svg.append(sv('rect', { x: x(a), y: y + 7, width: x(b) - x(a), height: ROW - 14, rx: 3, fill: '#7950f2', class: 'bar' }));
    });
    return svg;
  }
  function renderResult() {
    const p = active(), has = !!p;
    $('res-empty').hidden = has; $('days-table').hidden = !has; $('legend').hidden = !has; $('summary').hidden = !has; $('export-svg').disabled = !has; $('export-ics').disabled = !has;
    for (const k of ['k-diff', 'k-shift', 'k-days', 'k-reached']) $(k).textContent = '—';
    if (!has) { $('chart').replaceChildren(); $('days-table').querySelector('tbody').replaceChildren(); return; }
    const s = C.schedule(p);
    $('k-diff').textContent = signed(s.diff);
    $('k-shift').textContent = s.direction === 'none' ? t('shift.none') : t(s.direction === 'advance' ? 'shift.advance' : 'shift.delay', { d: dur(Math.abs(s.shift)) });
    $('k-days').textContent = s.neededDays === null ? '∞' : L.number(s.neededDays);
    $('k-reached').textContent = s.reachedOn === null ? t('reached.no') : dayLabel(s.reachedOn);
    const sum = $('summary');
    if (s.direction === 'none') { sum.className = 'verdict'; sum.textContent = t('summary.none'); }
    else if (s.neededDays === null) { sum.className = 'verdict warn'; sum.textContent = t('summary.zero', { d: dur(s.remainingEnd) }); }
    else if (s.reachedOn !== null) { sum.className = 'verdict'; sum.textContent = t('summary.ok', { day: dayLabel(s.reachedOn), step: dur(p.stepMin) }); }
    else { sum.className = 'verdict warn'; sum.textContent = t('summary.short', { d: dur(s.remainingEnd), n: s.neededDays }); }
    $('chart').replaceChildren(chart(p, s));
    $('days-table').querySelector('tbody').replaceChildren(...s.days.map((d) => {
      const tr = el('tr');
      const day = el('td', 'k', dayLabel(d.k)); day.append(el('br'), el('small', '', L.date(d.date, { weekday: 'short', day: 'numeric', month: 'short' })));
      const home = el('td', d.where === 'home' ? 'here' : '', t('range', { a: C.clock(d.bedHome), b: C.clock(d.wakeHome) }));
      const dest = el('td', d.where === 'dest' ? 'here' : '', t('range', { a: C.clock(d.bedDest), b: C.clock(d.wakeDest) }));
      tr.append(day, home, dest, el('td', 'num', d.remaining ? dur(d.remaining) : '✓'));
      return tr;
    }));
  }
  // withForm = false : changement de langue, la saisie en cours est conservée.
  function render(withForm = true) { renderPlans(); if (withForm) renderForm(); renderClocks(); renderResult(); }

  // --- Formulaire
  $('plan-form').addEventListener('submit', (ev) => {
    ev.preventDefault(); const f = ev.currentTarget;
    guard('form-status', () => {
      const input = {}; for (const k of FIELDS) input[k] = f[k].value;
      const cur = active();
      const p = C.makePlan(input, cur ? cur.id : newId());
      if (!cur && plans.length >= C.MAX.plans) throw new Error(`err.tooManyPlans|${JSON.stringify({ max: C.MAX.plans })}`);
      if (!save(cur ? plans.map((x) => (x.id === cur.id ? p : x)) : [...plans, p])) return;
      activeId = p.id; remember(); render();
      say('form-status', t('plan.saved', { name: p.name }), 'ok');
    });
  });
  $('plan-select').addEventListener('change', (e) => { activeId = e.target.value || null; remember(); render(); });
  $('new-plan').addEventListener('click', () => { activeId = null; render(); $('plan-form').name.focus(); say('plan-status', t('plan.newHint')); });
  $('delete-plan').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name }))) return;
    if (save(plans.filter((x) => x.id !== cur.id))) { activeId = plans[0] ? plans[0].id : null; remember(); render(); }
  });
  // Exemple généré dans la langue affichée : Paris -> Tokyo dans trois semaines, 1 h par jour.
  $('sample').addEventListener('click', () => guard('plan-status', () => {
    if (plans.length >= C.MAX.plans) throw new Error(`err.tooManyPlans|${JSON.stringify({ max: C.MAX.plans })}`);
    const d = new Date(Date.now() + 21 * 86400000), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const p = C.makePlan({ name: t('sample.name'), homeZone: 'Europe/Paris', destZone: 'Asia/Tokyo', departure: day, bedtime: '23:00', wake: '07:00', stepMin: '60', direction: 'auto', before: '3', after: '5' }, newId());
    if (save([...plans, p])) { activeId = p.id; remember(); render(); say('plan-status', t('sample.added'), 'ok'); }
  }));

  // --- Exports
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-svg').addEventListener('click', () => guard('res-status', () => {
    const svg = $('chart').querySelector('svg'); if (!svg) return;
    const copy = svg.cloneNode(true);
    copy.setAttribute('style', 'color:#221a3d;background:#ffffff'); // fichier autonome : couleurs fixes, fond blanc
    copy.insertBefore(sv('rect', { width: '100%', height: '100%', fill: '#ffffff' }), copy.querySelector('title').nextSibling);
    download('jetlagplanner.svg', '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(copy), 'image/svg+xml');
    say('res-status', t('svg.done'), 'ok');
  }));
  // Agenda : une nuit par jour, en heure UTC (l'agenda l'affiche dans le fuseau de l'appareil).
  $('export-ics').addEventListener('click', () => guard('res-status', () => {
    const p = active(); if (!p) return;
    const s = C.schedule(p), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const text = {
      summary: (d) => t('ics.summary', { day: dayLabel(d.k) }),
      description: (d) => [
        t('ics.home', { zone: p.homeZone, range: t('range', { a: C.clock(d.bedHome), b: C.clock(d.wakeHome) }) }),
        t('ics.dest', { zone: p.destZone, range: t('range', { a: C.clock(d.bedDest), b: C.clock(d.wakeDest) }) }),
        t('ics.note'),
      ].join('\n'),
    };
    download('jetlagplanner.ics', C.toICS(p, s, stamp, text), 'text/calendar');
    say('res-status', t('ics.done', { n: s.days.length }), 'ok');
  }));
  $('export').addEventListener('click', () => guard('backup-status', () => { download('jetlagplanner-backup.json', C.backup(plans), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }));
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: plans.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : on garde la protection
      activeId = next[0] ? next[0].id : null; remember();
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: e instanceof SyntaxError ? t('err.backup') : L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('jetlagplanner-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try { const list = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []; $('zones').replaceChildren(...list.map((z) => { const o = el('option'); o.value = z; return o; })); } catch (_) { /* saisie libre */ }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) plans = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = plans.some((x) => x.id === last) ? last : (plans[0] ? plans[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const s of STATUSES) say(s, ''); render(false); });
  render();
  setInterval(renderClocks, 20000); // les deux horloges avancent
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
