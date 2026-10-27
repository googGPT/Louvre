/* CoursePlanner — logique pure : séances (objectifs, activités, durées), contrôle du volume horaire,
   calendrier des séances (jours de cours, fermetures saisies), export .ics et sauvegarde.
   Durées en minutes entières ; dates en jours civils « AAAA-MM-JJ » (calcul en UTC, sans piège d'heure d'été). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ courses: 30, sessions: 200, activities: 20, closures: 100, name: 80, title: 120, objectives: 1000, label: 120, sessionMinutes: 720, courseMinutes: 120000, spanDays: 1100 });
  const ID = /^[a-z0-9-]{6,64}$/i;
  const DAY_MS = 86400000;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }
  function cleanText(v, max, requiredKey) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.trim();
    if (requiredKey && !s) fail(requiredKey);
    if (s.length > max) fail('err.textLong', { max });
    return s;
  }

  // --- Durées : « 1h30 », « 1 h 30 », « 1:30 », « 2h », « 45 min », « 1,5 » (heures) -> minutes entières.
  function parseDuration(value, max = LIMITS.sessionMinutes, key = 'err.duration') {
    if (typeof value === 'number') { if (!Number.isInteger(value) || value <= 0 || value > max) fail(key, { max: max / 60 }); return value; }
    const s = String(value === undefined || value === null ? '' : value).trim().toLowerCase().replace(/\s+/g, '');
    let minutes = null, m;
    if ((m = s.match(/^(\d{1,4})(?:h|:)(\d{1,2})?(?:min|m)?$/))) {
      if (m[2] !== undefined && Number(m[2]) > 59) fail(key, { max: max / 60 });
      minutes = Number(m[1]) * 60 + Number(m[2] || 0);
    } else if ((m = s.match(/^(\d{1,5})(?:min|mn|m)$/))) {
      minutes = Number(m[1]);
    } else if ((m = s.match(/^(\d{1,4})(?:[.,](\d{1,2}))?$/))) { // heures décimales
      const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0; // centièmes d'heure
      const total = Number(m[1]) * 6000 + frac * 60; // en centièmes de minute
      if (total % 100) fail('err.durationMinutes'); // 1,01 h n'est pas un nombre entier de minutes
      minutes = total / 100;
    }
    if (minutes === null || minutes <= 0 || minutes > max) fail(key, { max: max / 60 });
    return minutes;
  }

  // --- Jours civils
  function parseDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, mo, d] = s.split('-').map(Number);
    const t = Date.UTC(y, mo - 1, d), back = new Date(t);
    if (y < 2000 || y > 2100 || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return t;
  }
  function checkDay(s, key = 'err.date') { if (parseDay(s) === null) fail(key); return s; }
  const fromTime = (t) => new Date(t).toISOString().slice(0, 10);
  function addDays(day, n) { return fromTime(parseDay(day) + n * DAY_MS); }
  function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / DAY_MS); }
  function isoWeekday(day) { const d = new Date(parseDay(day)).getUTCDay(); return d === 0 ? 7 : d; } // lundi = 1 … dimanche = 7
  function checkTime(s) { if (typeof s !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) fail('err.time'); return s; }
  const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // --- Modèle
  function makeActivity(input) {
    if (!isObj(input)) fail('err.backup');
    return { id: checkId(input.id), label: cleanText(input.label, LIMITS.label, 'err.activityLabel'), minutes: parseDuration(input.minutes) };
  }
  function makeSession(input) {
    if (!isObj(input)) fail('err.backup');
    const acts = input.activities === undefined ? [] : input.activities;
    if (!Array.isArray(acts)) fail('err.backup');
    if (acts.length > LIMITS.activities) fail('err.tooManyActivities', { max: LIMITS.activities });
    const activities = acts.map(makeActivity);
    if (new Set(activities.map((a) => a.id)).size !== activities.length) fail('err.id');
    return {
      id: checkId(input.id), title: cleanText(input.title, LIMITS.title, 'err.sessionTitle'), minutes: parseDuration(input.minutes),
      objectives: cleanText(input.objectives, LIMITS.objectives), activities,
    };
  }
  function makeClosure(input) {
    if (!isObj(input)) fail('err.backup');
    const from = checkDay(input.from), to = checkDay(input.to === undefined || input.to === '' ? input.from : input.to);
    if (to < from) fail('err.closureOrder');
    if (diffDays(from, to) > 366) fail('err.closureLong');
    return { id: checkId(input.id), from, to, label: cleanText(input.label, LIMITS.label) };
  }
  // Calendrier : période, créneaux hebdomadaires (un par jour de semaine au plus), fermetures.
  function makeCalendar(input) {
    if (!isObj(input)) fail('err.backup');
    const start = checkDay(input.start, 'err.start'), end = checkDay(input.end, 'err.end');
    if (end < start) fail('err.periodOrder');
    if (diffDays(start, end) > LIMITS.spanDays) fail('err.periodLong', { max: LIMITS.spanDays });
    if (!Array.isArray(input.slots) || !Array.isArray(input.closures || [])) fail('err.backup');
    const slots = input.slots.map((s) => {
      if (!isObj(s) || !Number.isInteger(s.weekday) || s.weekday < 1 || s.weekday > 7) fail('err.backup');
      return { weekday: s.weekday, time: checkTime(s.time) };
    }).sort((a, b) => a.weekday - b.weekday);
    if (new Set(slots.map((s) => s.weekday)).size !== slots.length) fail('err.backup');
    const closures = (input.closures || []).map(makeClosure);
    if (closures.length > LIMITS.closures) fail('err.tooManyClosures', { max: LIMITS.closures });
    if (new Set(closures.map((c) => c.id)).size !== closures.length) fail('err.id');
    closures.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    return { start, end, slots, closures };
  }
  function makeCourse(input) {
    if (!isObj(input)) fail('err.backup');
    const sess = input.sessions === undefined ? [] : input.sessions;
    if (!Array.isArray(sess)) fail('err.backup');
    if (sess.length > LIMITS.sessions) fail('err.tooManySessions', { max: LIMITS.sessions });
    const sessions = sess.map(makeSession);
    if (new Set(sessions.map((s) => s.id)).size !== sessions.length) fail('err.id');
    return {
      id: checkId(input.id), name: cleanText(input.name, LIMITS.name, 'err.courseName'),
      plannedMinutes: parseDuration(input.plannedMinutes, LIMITS.courseMinutes, 'err.volume'),
      calendar: makeCalendar(input.calendar), sessions,
    };
  }

  // --- Volume horaire : total des séances face au volume prévu ; activités face à la durée de chaque séance.
  function totals(course) {
    const total = course.sessions.reduce((a, s) => a + s.minutes, 0);
    const sessions = course.sessions.map((s) => {
      const act = s.activities.reduce((a, x) => a + x.minutes, 0);
      return { id: s.id, minutes: s.minutes, activities: act, gap: act - s.minutes }; // gap > 0 : activités trop longues
    });
    return { total, planned: course.plannedMinutes, diff: total - course.plannedMinutes, status: total === course.plannedMinutes ? 'exact' : total < course.plannedMinutes ? 'under' : 'over', sessions };
  }

  // --- Dates des séances
  function closedBy(day, closures) { return closures.find((c) => c.from <= day && day <= c.to) || null; }
  // Jours de cours disponibles : jours de semaine choisis, hors fermetures, entre début et fin inclus.
  function availableDays(cal) {
    const times = new Map(cal.slots.map((s) => [s.weekday, s.time]));
    const out = [];
    if (!times.size) return out;
    for (let d = cal.start; d <= cal.end; d = addDays(d, 1)) {
      if (times.has(isoWeekday(d)) && !closedBy(d, cal.closures)) out.push({ date: d, time: times.get(isoWeekday(d)) });
    }
    return out;
  }
  // Les séances prennent, dans l'ordre, les jours disponibles successifs (une séance par jour de cours).
  function schedule(course) {
    const days = availableDays(course.calendar);
    const rows = course.sessions.map((s, i) => {
      const slot = days[i];
      if (!slot) return { id: s.id, index: i + 1, date: null };
      const startMin = toMin(slot.time), endMin = startMin + s.minutes;
      return { id: s.id, index: i + 1, date: slot.date, start: slot.time, end: hhmm(endMin % 1440), endDate: addDays(slot.date, Math.floor(endMin / 1440)) };
    });
    const skipped = []; // jours de cours tombant pendant une fermeture (pour information)
    const times = new Set(course.calendar.slots.map((s) => s.weekday));
    for (const c of course.calendar.closures) {
      for (let d = c.from < course.calendar.start ? course.calendar.start : c.from; d <= c.to && d <= course.calendar.end; d = addDays(d, 1)) if (times.has(isoWeekday(d))) skipped.push(d);
    }
    return { rows, available: days.length, unscheduled: rows.filter((r) => !r.date).length, spare: Math.max(0, days.length - rows.length), skipped: [...new Set(skipped)].sort() };
  }

  // --- Export agenda (.ics, RFC 5545) : heures « flottantes » (heure locale de l'appareil qui importe).
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { // lignes de 75 octets au plus
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  const DEFAULT_TEXT = {
    summary: (course, s, n) => `${course.name} — Séance ${n} : ${s.title}`,
    description: (s) => [s.objectives, ...s.activities.map((a) => `• ${a.label} (${a.minutes} min)`)].filter(Boolean).join('\n'),
  };
  function toICS(course, stamp, text = DEFAULT_TEXT) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const plan = schedule(course);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//CoursePlanner//FR', 'CALSCALE:GREGORIAN'];
    course.sessions.forEach((s, i) => {
      const r = plan.rows[i]; if (!r.date) return;
      const dt = (day, time) => `${day.replace(/-/g, '')}T${time.replace(':', '')}00`;
      lines.push('BEGIN:VEVENT', `UID:${s.id}@courseplanner.louvre`, `DTSTAMP:${stamp}`, `DTSTART:${dt(r.date, r.start)}`, `DTEND:${dt(r.endDate, r.end)}`,
        fold(`SUMMARY:${icsEscape(text.summary(course, s, r.index))}`));
      const desc = text.description(s);
      if (desc) lines.push(fold(`DESCRIPTION:${icsEscape(desc)}`));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'courseplanner' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'courses']) || !Array.isArray(data.courses)) fail('err.backup');
    if (data.courses.length > LIMITS.courses) fail('err.tooManyCourses', { max: LIMITS.courses });
    const courses = data.courses.map((c) => {
      if (!isObj(c) || !keysAre(c, ['id', 'name', 'plannedMinutes', 'calendar', 'sessions']) || typeof c.plannedMinutes !== 'number') fail('err.backup');
      if (!isObj(c.calendar) || !keysAre(c.calendar, ['start', 'end', 'slots', 'closures']) || !Array.isArray(c.calendar.closures) || !Array.isArray(c.sessions)) fail('err.backup');
      for (const s of c.calendar.slots || []) if (!isObj(s) || !keysAre(s, ['weekday', 'time'])) fail('err.backup');
      for (const x of c.calendar.closures) if (!isObj(x) || !keysAre(x, ['id', 'from', 'to', 'label'])) fail('err.backup');
      for (const s of c.sessions) {
        if (!isObj(s) || !keysAre(s, ['id', 'title', 'minutes', 'objectives', 'activities']) || typeof s.minutes !== 'number' || !Array.isArray(s.activities)) fail('err.backup');
        for (const a of s.activities) if (!isObj(a) || !keysAre(a, ['id', 'label', 'minutes']) || typeof a.minutes !== 'number') fail('err.backup');
      }
      return makeCourse(c);
    });
    if (new Set(courses.map((c) => c.id)).size !== courses.length) fail('err.backup');
    return courses;
  }
  function backup(courses) { return JSON.stringify({ app: 'courseplanner', version: VERSION, courses: validateBackup({ app: 'courseplanner', version: VERSION, courses }) }, null, 2); }

  root.CourseCore = Object.freeze({ VERSION, LIMITS, parseDuration, parseDay, addDays, diffDays, isoWeekday, makeActivity, makeSession, makeClosure, makeCalendar, makeCourse, totals, availableDays, schedule, toICS, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CourseCore;
})(typeof window === 'undefined' ? globalThis : window);
