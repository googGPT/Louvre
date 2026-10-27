/* TeachingAttendance — logique pure : liste d'étudiants, séances datées, appel (présent, absent, retard, excusé),
   taux d'assiduité selon des règles choisies par l'enseignant, seuil d'alerte, exports CSV et sauvegarde.
   Les taux sont comparés au seuil en entiers (pas d'arrondi avant comparaison). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ classes: 30, students: 500, sessions: 300, name: 80, ref: 30, label: 80 });
  const STATUSES = Object.freeze(['present', 'late', 'absent', 'excused']);
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanText(v, max, requiredKey) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.trim().replace(/\s+/g, ' ');
    if (requiredKey && !s) fail(requiredKey);
    if (s.length > max) fail('err.textLong', { max });
    return s;
  }
  function checkDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('err.date');
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    if (y < 2000 || y > 2100 || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) fail('err.date');
    return s;
  }
  // Seuil saisi en % (« 80 », « 75,5 ») -> dixièmes de pour cent entiers (800, 755).
  function parseThreshold(v) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000) return v;
    const s = String(v === undefined || v === null ? '' : v).trim().replace(',', '.').replace(/\s*%$/, '');
    if (!/^\d{1,3}(\.\d)?$/.test(s)) fail('err.threshold');
    const tenths = Math.round(Number(s) * 10);
    if (tenths > 1000) fail('err.threshold');
    return tenths;
  }

  // --- Modèle
  function makeStudent(input) {
    if (!isObj(input)) fail('err.backup');
    return { id: checkId(input.id), name: cleanText(input.name, LIMITS.name, 'err.studentName'), ref: cleanText(input.ref, LIMITS.ref) };
  }
  function makeSession(input) {
    if (!isObj(input)) fail('err.backup');
    return { id: checkId(input.id), date: checkDay(input.date), label: cleanText(input.label, LIMITS.label) };
  }
  function makeSettings(input) {
    if (!isObj(input) || typeof input.lateCounts !== 'boolean' || typeof input.excusedNeutral !== 'boolean') fail('err.backup');
    return { threshold: parseThreshold(input.threshold), lateCounts: input.lateCounts, excusedNeutral: input.excusedNeutral };
  }
  const identity = (s) => `${s.name.normalize('NFC').toLowerCase()}|${s.ref.toLowerCase()}`;
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  function makeClass(input) {
    if (!isObj(input)) fail('err.backup');
    const st = input.students || [], se = input.sessions || [], marks = input.marks === undefined ? {} : input.marks;
    if (!Array.isArray(st) || !Array.isArray(se) || !isObj(marks)) fail('err.backup');
    if (st.length > LIMITS.students) fail('err.tooManyStudents', { max: LIMITS.students });
    if (se.length > LIMITS.sessions) fail('err.tooManySessions', { max: LIMITS.sessions });
    const students = st.map(makeStudent);
    if (new Set(students.map((s) => s.id)).size !== students.length) fail('err.id');
    const seen = new Set();
    for (const s of students) { const k = identity(s); if (seen.has(k)) fail('err.duplicateStudent', { name: s.name }); seen.add(k); }
    const sessions = se.map(makeSession).sort(byDate); // tri stable : ordre de saisie conservé pour un même jour
    if (new Set(sessions.map((s) => s.id)).size !== sessions.length) fail('err.id');
    const sIds = new Set(sessions.map((s) => s.id)), stIds = new Set(students.map((s) => s.id));
    const clean = {};
    for (const [sid, row] of Object.entries(marks)) {
      if (!sIds.has(sid) || !isObj(row)) fail('err.marks');
      const out = {};
      for (const [stid, status] of Object.entries(row)) {
        if (!stIds.has(stid) || !STATUSES.includes(status)) fail('err.marks');
        out[stid] = status;
      }
      if (Object.keys(out).length) clean[sid] = out;
    }
    return { id: checkId(input.id), name: cleanText(input.name, LIMITS.name, 'err.className'), students, sessions, marks: clean, settings: makeSettings(input.settings) };
  }
  // Retire un étudiant ou une séance et les marques correspondantes.
  function removeStudent(cls, studentId) {
    const marks = {};
    for (const [sid, row] of Object.entries(cls.marks)) { const r = { ...row }; delete r[studentId]; if (Object.keys(r).length) marks[sid] = r; }
    return { ...cls, students: cls.students.filter((s) => s.id !== studentId), marks };
  }
  function removeSession(cls, sessionId) { const marks = { ...cls.marks }; delete marks[sessionId]; return { ...cls, sessions: cls.sessions.filter((s) => s.id !== sessionId), marks }; }
  // Marque (ou efface avec status = null) la présence d'un étudiant à une séance.
  function mark(cls, sessionId, studentId, status) {
    if (!cls.sessions.some((s) => s.id === sessionId) || !cls.students.some((s) => s.id === studentId)) fail('err.marks');
    if (status !== null && !STATUSES.includes(status)) fail('err.marks');
    const row = { ...(cls.marks[sessionId] || {}) };
    if (status === null) delete row[studentId]; else row[studentId] = status;
    const marks = { ...cls.marks, [sessionId]: row };
    if (!Object.keys(row).length) delete marks[sessionId];
    return { ...cls, marks };
  }
  function markAll(cls, sessionId, status) {
    let next = cls;
    for (const s of cls.students) next = mark(next, sessionId, s.id, status);
    return next;
  }

  // --- Assiduité
  // Taux = (présents + retards si « retard compte comme présent ») ÷ (séances saisies − excusées si « excusé neutre »).
  function studentStats(cls, studentId) {
    const c = { present: 0, late: 0, absent: 0, excused: 0, unmarked: 0 };
    for (const s of cls.sessions) { const st = (cls.marks[s.id] || {})[studentId]; if (st) c[st] += 1; else c.unmarked += 1; }
    const recorded = c.present + c.late + c.absent + c.excused;
    const attended = c.present + (cls.settings.lateCounts ? c.late : 0);
    const denom = recorded - (cls.settings.excusedNeutral ? c.excused : 0);
    const permille = denom ? Math.round((1000 * attended) / denom) : null;
    // Alerte : attended / denom < seuil (dixièmes de %), comparé en entiers.
    const alert = denom > 0 && attended * 1000 < cls.settings.threshold * denom;
    return { ...c, recorded, attended, denom, permille, alert };
  }
  function summary(cls) {
    const rows = cls.students.map((s) => ({ student: s, ...studentStats(cls, s.id) }));
    const sessions = cls.sessions.map((se) => {
      const row = cls.marks[se.id] || {}, c = { present: 0, late: 0, absent: 0, excused: 0 };
      for (const st of Object.values(row)) c[st] += 1;
      return { session: se, ...c, unmarked: cls.students.length - Object.keys(row).length };
    });
    return { rows, sessions, alerts: rows.filter((r) => r.alert).length };
  }

  // --- Exports CSV (en-têtes et libellés fournis par l'interface)
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = {
    absences: ['Étudiant', 'Numéro', 'Date', 'Séance', 'Statut'],
    summary: ['Étudiant', 'Numéro', 'Séances saisies', 'Présent', 'Retard', 'Absent', 'Excusé', 'Assiduité (%)', 'Alerte'],
    status: { present: 'présent', late: 'retard', absent: 'absent', excused: 'excusé' }, yes: 'oui', no: 'non',
    date: (d) => d, number: (n) => String(n).replace('.', ','), compare: (a, b) => a.localeCompare(b, 'fr'), delimiter: ';',
  };
  const joinCSV = (rows, d) => '﻿' + rows.map((r) => r.map(csvCell).join(d === ',' ? ',' : ';')).join('\r\n') + '\r\n';
  // Une ligne par absence, retard ou absence excusée.
  function absencesCSV(cls, texts = DEFAULT_TEXTS) {
    const students = cls.students.slice().sort((a, b) => texts.compare(a.name, b.name));
    const rows = [];
    for (const s of students) for (const se of cls.sessions) {
      const st = (cls.marks[se.id] || {})[s.id];
      if (st && st !== 'present') rows.push([s.name, s.ref, texts.date(se.date), se.label, texts.status[st]]);
    }
    return joinCSV([texts.absences, ...rows], texts.delimiter);
  }
  function summaryCSV(cls, texts = DEFAULT_TEXTS) {
    const rows = summary(cls).rows.slice().sort((a, b) => texts.compare(a.student.name, b.student.name))
      .map((r) => [r.student.name, r.student.ref, r.recorded, r.present, r.late, r.absent, r.excused, r.permille === null ? '' : texts.number(r.permille / 10), r.alert ? texts.yes : texts.no]);
    return joinCSV([texts.summary, ...rows], texts.delimiter);
  }

  // --- Liste importée : « Nom » ou « Nom;Numéro » (séparateur ; , ou tabulation, guillemets acceptés).
  function parseCSV(text) {
    const src = String(text).replace(/^﻿/, '');
    const sample = src.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
    const d = sample.some((l) => l.includes('\t')) ? '\t' : sample.some((l) => l.includes(';')) ? ';' : ',';
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch; }
      else if (ch === '"' && cell === '') quoted = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  function parseRoster(text, hasHeader) {
    if (String(text).length > 200000) fail('err.fileBig');
    const rows = parseCSV(text).slice(hasHeader ? 1 : 0);
    if (rows.length > LIMITS.students) fail('err.tooManyStudents', { max: LIMITS.students });
    return rows.map((r, i) => {
      const line = i + 1 + (hasHeader ? 1 : 0);
      const name = (r[0] || '').trim().replace(/\s+/g, ' '), ref = (r[1] || '').trim();
      if (!name) fail('err.rosterLine', { line });
      if (name.length > LIMITS.name || ref.length > LIMITS.ref) fail('err.rosterLong', { line });
      return { name, ref };
    });
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'teachingattendance' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'classes']) || !Array.isArray(data.classes)) fail('err.backup');
    if (data.classes.length > LIMITS.classes) fail('err.tooManyClasses', { max: LIMITS.classes });
    const classes = data.classes.map((c) => {
      if (!isObj(c) || !keysAre(c, ['id', 'name', 'students', 'sessions', 'marks', 'settings']) || !Array.isArray(c.students) || !Array.isArray(c.sessions)) fail('err.backup');
      if (!isObj(c.settings) || !keysAre(c.settings, ['threshold', 'lateCounts', 'excusedNeutral']) || typeof c.settings.threshold !== 'number') fail('err.backup');
      for (const s of c.students) if (!isObj(s) || !keysAre(s, ['id', 'name', 'ref'])) fail('err.backup');
      for (const s of c.sessions) if (!isObj(s) || !keysAre(s, ['id', 'date', 'label'])) fail('err.backup');
      return makeClass(c);
    });
    if (new Set(classes.map((c) => c.id)).size !== classes.length) fail('err.backup');
    return classes;
  }
  function backup(classes) { return JSON.stringify({ app: 'teachingattendance', version: VERSION, classes: validateBackup({ app: 'teachingattendance', version: VERSION, classes }) }, null, 2); }

  root.AttendanceCore = Object.freeze({ VERSION, LIMITS, STATUSES, parseThreshold, makeStudent, makeSession, makeSettings, makeClass, removeStudent, removeSession, mark, markAll, studentStats, summary, absencesCSV, summaryCSV, csvCell, parseCSV, parseRoster, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.AttendanceCore;
})(typeof window === 'undefined' ? globalThis : window);
