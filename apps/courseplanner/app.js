/* CoursePlanner — interface. Calculs dans core.js (CourseCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.CourseCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-courseplanner-v1'; // clé de stockage local
  const ACTIVE = 'louvre-courseplanner-active'; // cours affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  let courses = [];
  let courseId = null; // cours affiché
  let readOnly = false; // stockage illisible : aucune écriture
  const openSess = new Set(); // séances dépliées
  const draftTimes = new Map(); // heure saisie pour un jour pas encore coché

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const course = () => courses.find((c) => c.id === courseId) || null;
  // 90 -> « 1 h 30 » ; 120 -> « 2 h » ; 45 -> « 45 min » (selon la langue)
  function dur(min) {
    const h = Math.floor(Math.abs(min) / 60), m = Math.abs(min) % 60;
    if (h && m) return t('dur.hm', { h: L.number(h), m: pad(m) });
    return h ? t('dur.h', { h: L.number(h) }) : t('dur.m', { m: L.number(m) });
  }
  // Valeur des champs de durée : format neutre relu par parseDuration dans toutes les langues (« 1h30 », « 2h », « 45 min »).
  const inDur = (min) => { const h = Math.floor(min / 60), m = min % 60; return h && m ? `${h}h${pad(m)}` : h ? `${h}h` : `${m} min`; };
  const day = (d) => L.date(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const weekdayName = (n) => L.date(C.addDays('2026-09-07', n - 1), { weekday: 'long' }); // 7 sept. 2026 = lundi

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); courses = C.validateBackup(JSON.parse(localStorage.getItem(KEY))); return true; }
    catch (e) { say('course-status', L.error(e), 'error'); return false; }
  }
  function saveCourse(next) { return save(courses.map((c) => (c.id === next.id ? next : c))); }
  function blankCourse(name) {
    const start = today();
    return C.makeCourse({ id: newId(), name, plannedMinutes: 1800, calendar: { start, end: C.addDays(start, 90), slots: [], closures: [] }, sessions: [] });
  }
  function ensureCourse() {
    if (course()) return true;
    if (courses.length) { courseId = courses[0].id; return true; }
    const first = blankCourse(t('course.defaultName'));
    if (!save([first])) return false;
    courseId = first.id; return true;
  }

  // --- Cours et volume
  function renderCourses() {
    const sel = $('course-select');
    sel.replaceChildren(...courses.map((c) => { const o = el('option', '', `${c.name} (${c.sessions.length})`); o.value = c.id; return o; }));
    if (!courses.length) { const o = el('option', '', t('course.none')); o.value = ''; sel.append(o); }
    sel.value = courseId || '';
    $('rename-course').disabled = $('delete-course').disabled = !course();
  }
  function renderVolume() {
    const c = course(), box = $('volume-check');
    $('volume').value = c ? inDur(c.plannedMinutes) : '';
    $('volume').disabled = !c;
    if (!c) { box.replaceChildren(); box.className = 'check'; return; }
    const tt = C.totals(c);
    const msg = tt.status === 'exact' ? t('vol.exact') : tt.status === 'under' ? t('vol.under', { d: dur(-tt.diff) }) : t('vol.over', { d: dur(tt.diff) });
    const bar = el('div', 'bar'), fill = el('i'); fill.style.width = `${Math.min(100, tt.planned ? (100 * tt.total) / tt.planned : 0)}%`; bar.append(fill);
    box.replaceChildren(el('strong', '', t('vol.total', { total: dur(tt.total), planned: dur(tt.planned) })), bar, el('span', '', msg));
    box.className = 'check ' + (tt.status === 'exact' ? 'ok' : tt.status === 'over' ? 'bad' : 'warn');
  }
  $('volume').addEventListener('change', () => {
    const c = course(); if (!c) return;
    try { const next = C.makeCourse({ ...c, plannedMinutes: C.parseDuration($('volume').value, C.LIMITS.courseMinutes, 'err.volume') }); $('volume').removeAttribute('aria-invalid'); if (saveCourse(next)) { say('course-status', t('vol.saved'), 'ok'); renderVolume(); } }
    catch (e) { $('volume').setAttribute('aria-invalid', 'true'); say('course-status', L.error(e), 'error'); }
  });

  // --- Calendrier
  function renderCalendar() {
    const c = course();
    const cal = c ? c.calendar : { start: '', end: '', slots: [], closures: [] };
    $('start').value = cal.start; $('end').value = cal.end;
    $('start').disabled = $('end').disabled = !c;
    const times = new Map(cal.slots.map((s) => [s.weekday, s.time]));
    $('slots').replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map((n) => {
      const row = el('div', 'slot'), lab = el('label', 'check-label'), cb = el('input'), time = el('input');
      cb.type = 'checkbox'; cb.checked = times.has(n); cb.dataset.keep = `slot-on-${n}`; cb.dataset.weekday = String(n); cb.disabled = !c;
      lab.append(cb, el('span', '', weekdayName(n)));
      time.type = 'time'; time.value = times.get(n) || draftTimes.get(n) || '09:00'; time.dataset.keep = `slot-time-${n}`; time.dataset.weekday = String(n); time.disabled = !c;
      time.setAttribute('aria-label', t('aria.slotTime', { day: weekdayName(n) }));
      row.append(lab, time); return row;
    }));
    $('closures').replaceChildren(...cal.closures.map((x) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', x.label || t('closure.noLabel')), el('span', '', x.from === x.to ? day(x.from) : t('closure.range', { from: day(x.from), to: day(x.to) })));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeClosure', { name: x.label || day(x.from) }));
      del.addEventListener('click', () => { const cur = course(); if (cur && saveCourse({ ...cur, calendar: { ...cur.calendar, closures: cur.calendar.closures.filter((y) => y.id !== x.id) } })) { say('cal-status', t('closure.removed'), 'ok'); render(); } });
      const acts = el('div', 'acts'); acts.append(del); li.append(txt, acts); return li;
    }));
    const box = $('cal-summary');
    if (!c) { box.replaceChildren(); box.className = 'check'; return; }
    const plan = C.schedule(c), parts = [el('strong', '', t('cal.available', { n: plan.available }))];
    let kind = 'ok';
    if (!c.calendar.slots.length) { parts.push(el('span', '', t('cal.noSlots'))); kind = 'warn'; }
    else if (plan.unscheduled) { parts.push(el('span', '', t('cal.unscheduled', { n: plan.unscheduled }))); kind = 'bad'; }
    else if (c.sessions.length) {
      const last = plan.rows[plan.rows.length - 1];
      parts.push(el('span', '', t('cal.last', { date: day(last.date) })));
      if (plan.spare) parts.push(el('span', '', t('cal.spare', { n: plan.spare })));
    }
    if (plan.skipped.length) parts.push(el('span', '', t('cal.skipped', { n: plan.skipped.length })));
    box.replaceChildren(...parts); box.className = 'check ' + kind;
  }
  function commitCalendar(target) {
    const c = course(); if (!c) return;
    const slots = [...$('slots').querySelectorAll('input[type=checkbox]')].filter((cb) => cb.checked)
      .map((cb) => ({ weekday: Number(cb.dataset.weekday), time: $('slots').querySelector(`input[type=time][data-weekday="${cb.dataset.weekday}"]`).value }));
    try {
      const calendar = C.makeCalendar({ start: $('start').value, end: $('end').value, slots, closures: c.calendar.closures });
      [$('start'), $('end')].forEach((n) => n.removeAttribute('aria-invalid'));
      if (saveCourse({ ...c, calendar })) { say('cal-status', t('cal.saved'), 'ok'); renderCalendar(); renderSessions(); }
    } catch (e) { if (target) target.setAttribute('aria-invalid', 'true'); say('cal-status', L.error(e), 'error'); }
  }
  $('start').addEventListener('change', (e) => commitCalendar(e.target));
  $('end').addEventListener('change', (e) => commitCalendar(e.target));
  $('slots').addEventListener('change', (e) => { if (e.target.type === 'time' && e.target.value) draftTimes.set(Number(e.target.dataset.weekday), e.target.value); commitCalendar(e.target); });
  $('closure-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      if (!ensureCourse()) return;
      const c = course();
      if (c.calendar.closures.length >= C.LIMITS.closures) throw new Error(`err.tooManyClosures|${JSON.stringify({ max: C.LIMITS.closures })}`);
      const x = C.makeClosure({ id: newId(), from: f.from.value, to: f.to.value, label: f.label.value });
      const calendar = C.makeCalendar({ ...c.calendar, closures: [...c.calendar.closures, x] });
      if (saveCourse({ ...c, calendar })) { f.reset(); say('cal-status', t('closure.added'), 'ok'); render(); }
    } catch (err) { say('cal-status', L.error(err), 'error'); }
  });

  // --- Séances
  function iconBtn(symbol, label, action, disabled) { const b = el('button', 'btn icon', symbol); b.type = 'button'; b.dataset.action = action; b.setAttribute('aria-label', label); b.title = label; b.disabled = !!disabled; return b; }
  function field(label, keep, value, f, attrs = {}) {
    const l = el('label', 'field ' + (attrs.cls || '')), n = el(attrs.multiline ? 'textarea' : 'input');
    n.value = String(value); n.dataset.keep = keep; n.dataset.f = f;
    for (const [k, v] of Object.entries(attrs)) if (!['multiline', 'cls'].includes(k)) n.setAttribute(k, v);
    l.append(el('span', '', label), n); return l;
  }
  function activityCheck(info) {
    if (!info.activities) return { text: t('act.none'), kind: '' };
    if (info.gap === 0) return { text: t('act.exact', { a: dur(info.activities) }), kind: 'ok' };
    return info.gap < 0 ? { text: t('act.under', { a: dur(info.activities), s: dur(info.minutes), d: dur(-info.gap) }), kind: 'warn' }
      : { text: t('act.over', { a: dur(info.activities), s: dur(info.minutes), d: dur(info.gap) }), kind: 'bad' };
  }
  function renderSessions() {
    const c = course(), list = $('sessions');
    if (!c || !c.sessions.length) { list.replaceChildren(el('li', 'empty', t('sess.empty'))); return; }
    const plan = C.schedule(c), tt = C.totals(c);
    list.replaceChildren(...c.sessions.map((s, i) => {
      const r = plan.rows[i], info = tt.sessions[i], chk = activityCheck(info);
      const li = el('li'), card = el('details', 'sess'); card.dataset.id = s.id; card.open = openSess.has(s.id); if (r.date) card.dataset.date = r.date;
      card.addEventListener('toggle', () => { if (card.open) openSess.add(s.id); else openSess.delete(s.id); });
      const sum = el('summary'), when = el('span', 'when' + (r.date ? '' : ' none'));
      when.textContent = r.date ? t('sess.when', { date: day(r.date), start: r.start, end: r.end }) : t('sess.noDate');
      sum.append(el('span', 'num', t('sess.n', { n: i + 1 })), when, el('b', 'ttl', s.title), el('span', 'len', dur(s.minutes)));
      if (chk.kind && chk.kind !== 'ok') sum.append(el('span', 'flag ' + chk.kind, chk.kind === 'bad' ? t('flag.over') : t('flag.under')));
      const body = el('div', 'sess-body');
      const head = el('div', 'sess-head');
      head.append(field(t('f.title'), `s:${s.id}:title`, s.title, 'title', { maxlength: '120', cls: 'grow' }), field(t('f.duration'), `s:${s.id}:minutes`, inDur(s.minutes), 'minutes', { maxlength: '10', cls: 'small' }));
      const acts = el('div', 'acts');
      acts.append(iconBtn('↑', t('aria.up', { name: s.title }), 'up', i === 0), iconBtn('↓', t('aria.down', { name: s.title }), 'down', i === c.sessions.length - 1), iconBtn('✕', t('aria.removeSession', { name: s.title }), 'remove'));
      head.append(acts);
      body.append(head, field(t('f.objectives'), `s:${s.id}:objectives`, s.objectives, 'objectives', { maxlength: '1000', multiline: true, rows: '2', cls: 'full' }));
      const al = el('div', 'activities'); al.append(el('h4', '', t('act.title')));
      s.activities.forEach((a) => {
        const row = el('div', 'act'); row.dataset.aid = a.id;
        row.append(field(t('f.activity'), `a:${s.id}:${a.id}:label`, a.label, 'label', { maxlength: '120', cls: 'grow' }), field(t('f.duration'), `a:${s.id}:${a.id}:minutes`, inDur(a.minutes), 'aminutes', { maxlength: '10', cls: 'small' }),
          iconBtn('✕', t('aria.removeActivity', { name: a.label }), 'remove-act'));
        al.append(row);
      });
      const add = el('button', 'btn small', t('btn.addActivity')); add.type = 'button'; add.dataset.action = 'add-act'; add.disabled = s.activities.length >= C.LIMITS.activities;
      al.append(add, el('p', 'act-check ' + chk.kind, chk.text));
      body.append(al); card.append(sum, body); li.append(card); return li;
    }));
  }
  function readSession(card) {
    const v = (root, f) => root.querySelector(`[data-f="${f}"]`).value;
    const body = card.querySelector('.sess-body');
    return {
      id: card.dataset.id, title: v(body, 'title'), minutes: v(body, 'minutes'), objectives: v(body, 'objectives'),
      activities: [...card.querySelectorAll('.act')].map((row) => ({ id: row.dataset.aid, label: v(row, 'label'), minutes: v(row, 'aminutes') })),
    };
  }
  function replaceSessions(c, sessions, okText) {
    if (saveCourse(C.makeCourse({ ...c, sessions }))) { if (okText) say('session-status', okText, 'ok'); render(); return true; }
    return false;
  }
  $('sessions').addEventListener('change', (e) => {
    const card = e.target.closest('.sess'), c = course(); if (!card || !c) return;
    try {
      const s = C.makeSession(readSession(card));
      card.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
      replaceSessions(c, c.sessions.map((x) => (x.id === s.id ? s : x)), t('sess.saved', { name: s.title }));
    } catch (err) { e.target.setAttribute('aria-invalid', 'true'); say('session-status', L.error(err), 'error'); }
  });
  $('sessions').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const card = b.closest('.sess'), c = course(); if (!card || !c) return;
    const i = c.sessions.findIndex((s) => s.id === card.dataset.id), s = c.sessions[i];
    const sessions = c.sessions.slice();
    try {
      switch (b.dataset.action) {
        case 'up': case 'down': { const j = b.dataset.action === 'up' ? i - 1 : i + 1; [sessions[i], sessions[j]] = [sessions[j], sessions[i]]; break; }
        case 'remove': if (!confirm(t('confirm.removeSession', { name: s.title }))) return; sessions.splice(i, 1); break;
        case 'add-act': { const read = readSession(card); read.activities.push({ id: newId(), label: t('act.new'), minutes: 30 }); sessions[i] = C.makeSession(read); break; }
        case 'remove-act': { const read = readSession(card), aid = b.closest('.act').dataset.aid; read.activities = read.activities.filter((a) => a.id !== aid); sessions[i] = C.makeSession(read); break; }
        default: return;
      }
      replaceSessions(c, sessions, '');
      say('session-status', '');
    } catch (err) { say('session-status', L.error(err), 'error'); }
  });
  $('session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      if (!ensureCourse()) return;
      const c = course();
      if (c.sessions.length >= C.LIMITS.sessions) throw new Error(`err.tooManySessions|${JSON.stringify({ max: C.LIMITS.sessions })}`);
      const s = C.makeSession({ id: newId(), title: f.title.value, minutes: f.duration.value, objectives: f.objectives.value, activities: [] });
      if (replaceSessions(c, [...c.sessions, s], t('sess.added', { name: s.title, d: dur(s.minutes) }))) { f.title.value = ''; f.objectives.value = ''; f.title.focus(); }
    } catch (err) { say('session-status', L.error(err), 'error'); }
  });

  // --- Cours : création, renommage, suppression
  $('course-select').addEventListener('change', (e) => { courseId = e.target.value || null; try { localStorage.setItem(ACTIVE, courseId || ''); } catch (_) { /* confort */ } render(); });
  $('new-course').addEventListener('click', () => {
    if (courses.length >= C.LIMITS.courses) { say('course-status', t('err.tooManyCourses', { max: C.LIMITS.courses }), 'error'); return; }
    const name = prompt(t('prompt.new'), t('course.newDefault', { n: courses.length + 1 }));
    if (name === null) return;
    try { const c = blankCourse(name); if (save([...courses, c])) { courseId = c.id; render(); } } catch (e) { say('course-status', L.error(e), 'error'); }
  });
  $('rename-course').addEventListener('click', () => {
    const c = course(); if (!c) return;
    const name = prompt(t('prompt.rename'), c.name);
    if (name === null) return;
    try { if (saveCourse(C.makeCourse({ ...c, name }))) render(); } catch (e) { say('course-status', L.error(e), 'error'); }
  });
  $('delete-course').addEventListener('click', () => {
    const c = course(); if (!c || !confirm(t('confirm.deleteCourse', { name: c.name, n: c.sessions.length }))) return;
    if (save(courses.filter((x) => x.id !== c.id))) { courseId = courses[0] ? courses[0].id : null; render(); }
  });

  // --- Exemple (dans la langue affichée), daté à partir d'aujourd'hui
  $('sample').addEventListener('click', () => {
    try {
      if (courses.length >= C.LIMITS.courses) throw new Error(`err.tooManyCourses|${JSON.stringify({ max: C.LIMITS.courses })}`);
      const start = today();
      const act = (k, m) => ({ id: newId(), label: t(k), minutes: m });
      const sessions = [1, 2, 3, 4, 5, 6].map((n) => ({ id: newId(), title: t(`sample.s${n}`), minutes: 180, objectives: n <= 2 ? t(`sample.obj${n}`) : '', activities: [] }));
      sessions[0].activities = [act('sample.a1', 90), act('sample.a2', 60), act('sample.a3', 30)];
      sessions[1].activities = [act('sample.a1', 90), act('sample.a2', 60)];
      const c = C.makeCourse({
        id: newId(), name: t('sample.course'), plannedMinutes: 1200,
        calendar: { start, end: C.addDays(start, 119), slots: [{ weekday: 1, time: '09:00' }, { weekday: 4, time: '14:00' }], closures: [{ id: newId(), from: C.addDays(start, 21), to: C.addDays(start, 27), label: t('sample.break') }] },
        sessions,
      });
      if (save([...courses, c])) { courseId = c.id; render(); say('course-status', t('sample.added'), 'ok'); }
    } catch (e) { say('course-status', L.error(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'cours';
  const describe = (s) => [s.objectives, ...s.activities.map((a) => `• ${a.label} (${dur(a.minutes)})`)].filter(Boolean).join('\n');
  $('export-ics').addEventListener('click', () => {
    const c = course(); if (!c) return;
    const plan = C.schedule(c);
    if (plan.rows.every((r) => !r.date)) { say('backup-status', t('ics.nothing'), 'error'); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ics = C.toICS(c, stamp, { summary: (co, s, n) => t('ics.summary', { course: co.name, n, title: s.title }), description: describe });
    download(`courseplanner-${fileName(c.name)}.ics`, ics, 'text/calendar;charset=utf-8');
    say('backup-status', plan.unscheduled ? t('ics.partial', { n: plan.unscheduled }) : t('ics.done'), plan.unscheduled ? 'error' : 'ok');
  });
  $('print-plan').addEventListener('click', () => {
    const c = course(); if (!c) return;
    const plan = C.schedule(c), tt = C.totals(c), area = $('print-area');
    const table = el('table', 'print-table'), head = el('tr');
    for (const h of ['#', t('th.date'), t('th.time'), t('th.session'), t('f.duration')]) head.append(el('th', '', h));
    const thead = el('thead'); thead.append(head);
    const tb = el('tbody');
    c.sessions.forEach((s, i) => {
      const r = plan.rows[i], tr = el('tr'), what = el('td');
      what.append(el('b', '', s.title));
      if (s.objectives) what.append(el('div', '', s.objectives));
      if (s.activities.length) { const ul = el('ul'); for (const a of s.activities) ul.append(el('li', '', `${a.label} — ${dur(a.minutes)}`)); what.append(ul); }
      tr.append(el('td', '', i + 1), el('td', '', r.date ? day(r.date) : t('sess.noDate')), el('td', '', r.date ? `${r.start}–${r.end}` : ''), what, el('td', '', dur(s.minutes)));
      tb.append(tr);
    });
    table.append(thead, tb);
    area.replaceChildren(el('h1', '', c.name), el('p', '', t('vol.total', { total: dur(tt.total), planned: dur(tt.planned) })), table);
    window.print();
  });
  $('export').addEventListener('click', () => {
    try { download('courseplanner-backup.json', C.backup(courses), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: courses.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      courseId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('courseplanner-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderCourses(); renderVolume(); renderCalendar(); renderSessions(); }
  // Changement de langue : on réaffiche sans perdre ce qui est en cours de saisie.
  function preserve(fn) {
    const kept = new Map([...document.querySelectorAll('[data-keep]')].map((n) => [n.dataset.keep, n.type === 'checkbox' ? n.checked : n.value]));
    fn();
    document.querySelectorAll('[data-keep]').forEach((n) => { if (!kept.has(n.dataset.keep)) return; if (n.type === 'checkbox') n.checked = kept.get(n.dataset.keep); else n.value = kept.get(n.dataset.keep); });
  }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) courses = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    courseId = courses.some((c) => c.id === last) ? last : (courses[0] ? courses[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => preserve(() => { for (const id of ['course-status', 'cal-status', 'session-status', 'backup-status']) say(id, ''); render(); }));
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
