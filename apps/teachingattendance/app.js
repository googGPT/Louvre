/* TeachingAttendance — interface. Calculs dans core.js (AttendanceCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.AttendanceCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-teachingattendance-v1'; // clé de stockage local
  const ACTIVE = 'louvre-teachingattendance-active'; // classe affichée (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const DEFAULT_SETTINGS = { threshold: 800, lateCounts: true, excusedNeutral: true };
  const SAMPLE_NAMES = ['Ana', 'Bilal', 'Chloé', 'David', 'Emma', 'Farid', 'Giulia', 'Hugo', 'Inès', 'Jonas', 'Kenza', 'Léo'];

  let classes = [];
  let classId = null, sessionId = null; // classe et séance affichées
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cls = () => classes.find((c) => c.id === classId) || null;
  const session = () => { const c = cls(); return c ? c.sessions.find((s) => s.id === sessionId) || null : null; };
  const byName = (a, b) => a.name.localeCompare(b.name, L.locale);
  const day = (d) => L.date(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const pct = (permille) => (permille === null ? '—' : `${L.number(permille / 10, { maximumFractionDigits: 1 })} %`);
  const sessionName = (s) => (s.label ? `${day(s.date)} — ${s.label}` : day(s.date));

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); classes = C.validateBackup(JSON.parse(localStorage.getItem(KEY))); return true; }
    catch (e) { say('class-status', L.error(e), 'error'); return false; }
  }
  function saveClass(next) { const valid = C.makeClass(next); return save(classes.map((c) => (c.id === valid.id ? valid : c))); }
  function ensureClass() {
    if (cls()) return true;
    if (classes.length) { classId = classes[0].id; return true; }
    const first = C.makeClass({ id: newId(), name: t('class.defaultName'), students: [], sessions: [], marks: {}, settings: DEFAULT_SETTINGS });
    if (!save([first])) return false;
    classId = first.id; return true;
  }
  // Séance proposée : la plus récente qui n'est pas dans le futur, sinon la première.
  function pickSession(c) {
    if (!c || !c.sessions.length) return null;
    if (c.sessions.some((s) => s.id === sessionId)) return sessionId;
    const past = c.sessions.filter((s) => s.date <= today());
    return (past.length ? past[past.length - 1] : c.sessions[0]).id;
  }

  // --- Classes
  function renderClasses() {
    const sel = $('class-select');
    sel.replaceChildren(...classes.map((c) => { const o = el('option', '', `${c.name} (${c.students.length})`); o.value = c.id; return o; }));
    if (!classes.length) { const o = el('option', '', t('class.none')); o.value = ''; sel.append(o); }
    sel.value = classId || '';
    $('rename-class').disabled = $('delete-class').disabled = !cls();
  }
  $('class-select').addEventListener('change', (e) => { classId = e.target.value || null; sessionId = null; try { localStorage.setItem(ACTIVE, classId || ''); } catch (_) { /* confort */ } render(); });
  $('new-class').addEventListener('click', () => {
    if (classes.length >= C.LIMITS.classes) { say('class-status', t('err.tooManyClasses', { max: C.LIMITS.classes }), 'error'); return; }
    const name = prompt(t('prompt.new'), t('class.newDefault', { n: classes.length + 1 }));
    if (name === null) return;
    try { const c = C.makeClass({ id: newId(), name, students: [], sessions: [], marks: {}, settings: DEFAULT_SETTINGS }); if (save([...classes, c])) { classId = c.id; sessionId = null; render(); } } catch (e) { say('class-status', L.error(e), 'error'); }
  });
  $('rename-class').addEventListener('click', () => {
    const c = cls(); if (!c) return;
    const name = prompt(t('prompt.rename'), c.name);
    if (name === null) return;
    try { if (saveClass({ ...c, name })) render(); } catch (e) { say('class-status', L.error(e), 'error'); }
  });
  $('delete-class').addEventListener('click', () => {
    const c = cls(); if (!c || !confirm(t('confirm.deleteClass', { name: c.name, n: c.sessions.length }))) return;
    if (save(classes.filter((x) => x.id !== c.id))) { classId = classes[0] ? classes[0].id : null; sessionId = null; render(); }
  });

  // --- Étudiants
  function renderStudents() {
    const c = cls(), list = $('students');
    $('student-count').textContent = t('students.count', { n: c ? c.students.length : 0 });
    if (!c || !c.students.length) { list.replaceChildren(el('li', 'empty', t('students.empty'))); return; }
    list.replaceChildren(...c.students.slice().sort(byName).map((s) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', s.name)); if (s.ref) txt.append(el('span', '', s.ref));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeStudent', { name: s.name }));
      del.addEventListener('click', () => {
        const cur = cls(); if (!cur) return;
        const marked = cur.sessions.filter((se) => (cur.marks[se.id] || {})[s.id]).length;
        if (marked && !confirm(t('confirm.removeStudent', { name: s.name, n: marked }))) return;
        try { if (saveClass(C.removeStudent(cur, s.id))) { say('student-status', t('students.removed', { name: s.name }), 'ok'); render(); } } catch (e) { say('student-status', L.error(e), 'error'); }
      });
      li.append(txt, del); return li;
    }));
  }
  function addStudents(list) {
    if (!ensureClass()) return false;
    const c = cls();
    if (c.students.length + list.length > C.LIMITS.students) throw new Error(`err.tooManyStudents|${JSON.stringify({ max: C.LIMITS.students })}`);
    return saveClass({ ...c, students: [...c.students, ...list.map((s) => C.makeStudent({ id: newId(), name: s.name, ref: s.ref }))] });
  }
  $('student-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try { if (addStudents([{ name: f.name.value, ref: f.ref.value }])) { say('student-status', t('students.added', { name: f.name.value.trim() }), 'ok'); f.name.value = ''; f.ref.value = ''; f.name.focus(); render(); } }
    catch (err) { say('student-status', L.error(err), 'error'); }
  });
  $('roster-import').addEventListener('click', () => {
    try {
      const list = C.parseRoster($('roster-text').value, $('roster-header').checked);
      if (!list.length) throw new Error('err.rosterEmpty');
      if (addStudents(list)) { $('roster-text').value = ''; say('student-status', t('students.imported', { n: list.length }), 'ok'); render(); }
    } catch (err) { say('student-status', L.error(err), 'error'); }
  });
  $('roster-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 200000) { say('student-status', t('err.fileBig'), 'error'); return; }
    $('roster-text').value = await file.text();
    say('student-status', t('import.loaded', { name: file.name }), 'ok');
  });

  // --- Séances et appel
  $('session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      if (!ensureClass()) return;
      const c = cls();
      if (c.sessions.length >= C.LIMITS.sessions) throw new Error(`err.tooManySessions|${JSON.stringify({ max: C.LIMITS.sessions })}`);
      const s = C.makeSession({ id: newId(), date: f.date.value, label: f.label.value });
      if (saveClass({ ...c, sessions: [...c.sessions, s] })) { sessionId = s.id; f.label.value = ''; say('session-status', t('session.added', { name: sessionName(s) }), 'ok'); render(); }
    } catch (err) { say('session-status', L.error(err), 'error'); }
  });
  $('session-select').addEventListener('change', (e) => { sessionId = e.target.value || null; say('roll-status', ''); render(); });
  function renderRoll() {
    const c = cls(), sel = $('session-select'), roll = $('roll');
    sessionId = pickSession(c);
    const sessions = c ? c.sessions : [];
    sel.replaceChildren(...sessions.map((s) => { const o = el('option', '', sessionName(s)); o.value = s.id; return o; }));
    if (!sessions.length) { const o = el('option', '', t('roll.noSession')); o.value = ''; sel.append(o); }
    sel.value = sessionId || '';
    const se = session();
    $('all-present').disabled = $('clear-marks').disabled = $('delete-session').disabled = !se || !c.students.length;
    $('delete-session').disabled = !se;
    if (!se) { $('session-stats').textContent = ''; roll.replaceChildren(el('li', 'empty', t('roll.empty'))); return; }
    if (!c.students.length) { $('session-stats').textContent = ''; roll.replaceChildren(el('li', 'empty', t('students.empty'))); return; }
    const row = c.marks[se.id] || {}, counts = { present: 0, late: 0, absent: 0, excused: 0 };
    for (const v of Object.values(row)) counts[v] += 1;
    $('session-stats').textContent = t('roll.stats', { p: counts.present, l: counts.late, a: counts.absent, e: counts.excused, u: c.students.length - Object.keys(row).length });
    roll.replaceChildren(...c.students.slice().sort(byName).map((s) => {
      const li = el('li', row[s.id] ? 'st-' + row[s.id] : ''), who = el('div', 'who');
      who.append(el('b', '', s.name)); if (s.ref) who.append(el('span', '', s.ref));
      const group = el('div', 'seg'); group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', t('aria.status', { name: s.name }));
      for (const st of C.STATUSES) {
        const lab = el('label', 'opt ' + st), r = el('input');
        r.type = 'radio'; r.name = `m-${s.id}`; r.value = st; r.checked = row[s.id] === st; r.dataset.sid = s.id;
        lab.append(r, el('span', '', t('status.' + st))); group.append(lab);
      }
      li.append(who, group); return li;
    }));
  }
  $('roll').addEventListener('change', (e) => {
    const r = e.target; if (r.type !== 'radio') return;
    const c = cls(), se = session(); if (!c || !se) return;
    try {
      if (saveClass(C.mark(c, se.id, r.dataset.sid, r.value))) {
        renderRoll(); renderSummary();
        const again = $('roll').querySelector(`input[name="${CSS.escape(r.name)}"][value="${r.value}"]`); if (again) again.focus();
      }
    } catch (err) { say('roll-status', L.error(err), 'error'); }
  });
  $('all-present').addEventListener('click', () => {
    const c = cls(), se = session(); if (!c || !se) return;
    const done = Object.keys(c.marks[se.id] || {}).length;
    if (done && !confirm(t('confirm.allPresent', { n: done }))) return;
    try { if (saveClass(C.markAll(c, se.id, 'present'))) { say('roll-status', t('roll.allPresent'), 'ok'); render(); } } catch (e) { say('roll-status', L.error(e), 'error'); }
  });
  $('clear-marks').addEventListener('click', () => {
    const c = cls(), se = session(); if (!c || !se || !confirm(t('confirm.clearMarks', { name: sessionName(se) }))) return;
    try { if (saveClass(C.markAll(c, se.id, null))) { say('roll-status', t('roll.cleared'), 'ok'); render(); } } catch (e) { say('roll-status', L.error(e), 'error'); }
  });
  $('delete-session').addEventListener('click', () => {
    const c = cls(), se = session(); if (!c || !se || !confirm(t('confirm.deleteSession', { name: sessionName(se) }))) return;
    try { if (saveClass(C.removeSession(c, se.id))) { sessionId = null; say('roll-status', t('session.deleted'), 'ok'); render(); } } catch (e) { say('roll-status', L.error(e), 'error'); }
  });

  // --- Assiduité
  function renderSummary() {
    const c = cls(), s = c ? c.settings : DEFAULT_SETTINGS, tbody = $('summary').querySelector('tbody');
    if (document.activeElement !== $('threshold')) $('threshold').value = String(s.threshold / 10).replace('.', L.number(1.5).includes(',') ? ',' : '.'); // relu par parseThreshold (« , » ou « . »)
    $('late-counts').checked = s.lateCounts; $('excused-neutral').checked = s.excusedNeutral;
    $('formula').textContent = t('formula', { num: s.lateCounts ? t('formula.numLate') : t('formula.num'), den: s.excusedNeutral ? t('formula.denExc') : t('formula.den') });
    const has = c && c.students.length;
    $('export-absences').disabled = $('export-summary').disabled = !has || !c.sessions.length;
    if (!has) { $('kpis').replaceChildren(); tbody.replaceChildren(); return; }
    const sum = C.summary(c);
    const kpi = (label, value, cls2 = '') => { const d = el('div', 'kpi ' + cls2); d.append(el('span', '', label), el('strong', '', value)); return d; };
    const marked = sum.rows.filter((r) => r.denom > 0);
    const avg = marked.length ? Math.round(marked.reduce((a, r) => a + r.permille, 0) / marked.length) : null;
    $('kpis').replaceChildren(kpi(t('kpi.sessions'), L.number(c.sessions.length)), kpi(t('kpi.mean'), pct(avg)),
      kpi(t('kpi.alerts', { threshold: L.number(s.threshold / 10, { maximumFractionDigits: 1 }) }), L.number(sum.alerts), sum.alerts ? 'alert' : ''));
    // Étudiants sous le seuil en premier, puis ordre alphabétique.
    tbody.replaceChildren(...sum.rows.slice().sort((a, b) => (b.alert - a.alert) || byName(a.student, b.student)).map((r) => {
      const tr = el('tr', r.alert ? 'alert' : ''), name = el('td');
      name.append(el('span', '', r.student.name));
      if (r.alert) name.append(el('span', 'pill', t('pill.alert')));
      tr.append(name, el('td', 'num rate', pct(r.permille)), el('td', 'num', L.number(r.present)), el('td', 'num', L.number(r.late)), el('td', 'num', L.number(r.absent)), el('td', 'num', L.number(r.excused)));
      return tr;
    }));
  }
  function commitSettings(patch, target) {
    if (!ensureClass()) return;
    const c = cls();
    try {
      if (saveClass({ ...c, settings: { ...c.settings, ...patch } })) { if (target) target.removeAttribute('aria-invalid'); say('settings-status', t('settings.saved'), 'ok'); renderSummary(); }
    } catch (e) { if (target) target.setAttribute('aria-invalid', 'true'); say('settings-status', L.error(e), 'error'); }
  }
  $('threshold').addEventListener('change', () => commitSettings({ threshold: $('threshold').value }, $('threshold')));
  $('late-counts').addEventListener('change', () => commitSettings({ lateCounts: $('late-counts').checked }));
  $('excused-neutral').addEventListener('change', () => commitSettings({ excusedNeutral: $('excused-neutral').checked }));

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'classe';
  const csvTexts = () => ({
    absences: [t('th.student'), t('csv.ref'), t('f.date'), t('csv.session'), t('csv.status')],
    summary: [t('th.student'), t('csv.ref'), t('csv.recorded'), t('status.present'), t('status.late'), t('status.absent'), t('status.excused'), t('csv.rate'), t('csv.alert')],
    status: Object.fromEntries(C.STATUSES.map((s) => [s, t('status.' + s)])), yes: t('csv.yes'), no: t('csv.no'),
    date: (d) => L.date(d, { day: '2-digit', month: '2-digit', year: 'numeric' }), number: (n) => L.number(n, { maximumFractionDigits: 1, useGrouping: false }),
    compare: (a, b) => a.localeCompare(b, L.locale), delimiter: L.lang === 'en' ? ',' : ';',
  });
  $('export-absences').addEventListener('click', () => { const c = cls(); if (!c) return; download(`absences-${fileName(c.name)}.csv`, C.absencesCSV(c, csvTexts()), 'text/csv;charset=utf-8'); say('summary-status', t('csv.done'), 'ok'); });
  $('export-summary').addEventListener('click', () => { const c = cls(); if (!c) return; download(`assiduite-${fileName(c.name)}.csv`, C.summaryCSV(c, csvTexts()), 'text/csv;charset=utf-8'); say('summary-status', t('csv.done'), 'ok'); });

  // --- Exemple (dans la langue affichée) : 12 étudiants, 6 séances hebdomadaires jusqu'à aujourd'hui
  $('sample').addEventListener('click', () => {
    try {
      if (classes.length >= C.LIMITS.classes) throw new Error(`err.tooManyClasses|${JSON.stringify({ max: C.LIMITS.classes })}`);
      const students = SAMPLE_NAMES.map((name, i) => ({ id: newId(), name, ref: String(2026001 + i) }));
      const base = new Date(); base.setHours(12, 0, 0, 0);
      const sessions = [5, 4, 3, 2, 1, 0].map((w, i) => { const d = new Date(base); d.setDate(d.getDate() - 7 * w); return { id: newId(), date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, label: t('sample.session', { n: i + 1 }) }; });
      // Motif reproductible : surtout des présences, quelques retards et excuses ; deux étudiants souvent absents (alertes).
      const pattern = ['present', 'present', 'present', 'present', 'late', 'present', 'absent', 'present', 'present', 'excused', 'present', 'present'];
      let c = C.makeClass({ id: newId(), name: t('sample.class'), students, sessions, marks: {}, settings: DEFAULT_SETTINGS });
      students.forEach((s, i) => sessions.forEach((se, k) => { const st = (i === 2 || i === 7) && k % 2 === 0 ? 'absent' : pattern[(i * 5 + k * 7 + i * k) % pattern.length]; c = C.mark(c, se.id, s.id, st); }));
      if (save([...classes, c])) { classId = c.id; sessionId = null; render(); say('class-status', t('sample.added'), 'ok'); }
    } catch (e) { say('class-status', L.error(e), 'error'); }
  });

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('teachingattendance-backup.json', C.backup(classes), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: classes.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      classId = next[0] ? next[0].id : null; sessionId = null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('teachingattendance-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderClasses(); renderStudents(); renderRoll(); renderSummary(); }
  // Changement de langue : on réaffiche sans perdre ce qui est en cours de saisie.
  function preserve(fn) {
    const kept = new Map([...document.querySelectorAll('[data-keep]')].map((n) => [n.dataset.keep, n.type === 'checkbox' ? n.checked : n.value]));
    fn();
    document.querySelectorAll('[data-keep]').forEach((n) => { if (!kept.has(n.dataset.keep)) return; if (n.type === 'checkbox') n.checked = kept.get(n.dataset.keep); else n.value = kept.get(n.dataset.keep); });
  }

  // --- Démarrage
  $('session-form').date.value = today();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) classes = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    classId = classes.some((c) => c.id === last) ? last : (classes[0] ? classes[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => preserve(() => { for (const id of ['class-status', 'student-status', 'session-status', 'roll-status', 'settings-status', 'summary-status', 'backup-status']) say(id, ''); render(); }));
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
