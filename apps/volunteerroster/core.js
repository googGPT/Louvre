/* VolunteerRoster — logique pure : bénévoles (disponibilités, compétences, maximum d'heures), postes × créneaux avec besoins,
   affectation automatique déterministe, contrôles (disponibilité, compétence, chevauchement, maximum), trous de couverture,
   planning par personne, export CSV et sauvegarde. Aucune dépendance au navigateur.
   Dates : jours civils « AAAA-MM-JJ » ; heures : minutes depuis minuit (un créneau ne passe pas minuit). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ volunteers: 300, shifts: 500, windows: 30, skills: 10, skill: 40, name: 80, post: 60, title: 80, need: 50, maxMinutes: 7 * 24 * 60, assignments: 5000 });

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const isId = (v) => typeof v === 'string' && /^[a-z0-9-]{6,64}$/i.test(v);
  const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // ordre indépendant de la langue : résultats reproductibles

  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), z = new Date(Date.UTC(y, m - 1, d));
    return y >= 2000 && y <= 2100 && z.getUTCFullYear() === y && z.getUTCMonth() === m - 1 && z.getUTCDate() === d;
  }
  // « 08:30 » -> 510 minutes.
  function parseTime(v) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v === undefined || v === null ? '' : v).trim());
    if (!m) fail('err.time');
    return Number(m[1]) * 60 + Number(m[2]);
  }
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  // Maximum d'heures : « 6 », « 6:30 » ou « 6,5 » -> minutes.
  function parseHours(v) {
    const s = String(v === undefined || v === null ? '' : v).trim().replace(',', '.');
    let min;
    if (/^\d{1,3}$/.test(s)) min = Number(s) * 60;
    else if (/^\d{1,3}:[0-5]\d$/.test(s)) { const [h, m] = s.split(':').map(Number); min = h * 60 + m; }
    else if (/^\d{1,3}\.\d{1,2}$/.test(s)) min = Math.round(Number(s) * 60);
    else fail('err.hours', { max: LIMITS.maxMinutes / 60 });
    if (min < 1 || min > LIMITS.maxMinutes) fail('err.hours', { max: LIMITS.maxMinutes / 60 });
    return min;
  }
  function cleanText(v, max, required, key) {
    if (typeof v !== 'string') fail(key + 'Required');
    const s = v.trim().replace(/\s+/g, ' ');
    if (/[\u0000-\u001f\u007f]/.test(s)) fail('err.control');
    if (required && !s) fail(key + 'Required');
    if (s.length > max) fail(key + 'Long', { max });
    return s;
  }
  const skillKey = (s) => s.normalize('NFC').toLowerCase();
  // « accueil, secours » -> ['accueil', 'secours'] (doublons retirés sans tenir compte de la casse).
  function parseSkills(v) {
    const list = (Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(/[,;،\n]/)).map((x) => cleanText(String(x), LIMITS.skill, false, 'err.skill')).filter(Boolean);
    const out = [], seen = new Set();
    for (const s of list) if (!seen.has(skillKey(s))) { seen.add(skillKey(s)); out.push(s); }
    if (out.length > LIMITS.skills) fail('err.skillsMany', { max: LIMITS.skills });
    return out;
  }
  function makeWindow(input) {
    if (!isObj(input) || !isDay(input.day)) fail('err.day');
    const start = typeof input.start === 'number' ? input.start : parseTime(input.start);
    const end = typeof input.end === 'number' ? input.end : parseTime(input.end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > 1439 || end <= start) fail('err.range');
    return { day: input.day, start, end };
  }
  // Fenêtres triées et fusionnées quand elles se touchent ou se chevauchent.
  function mergeWindows(list) {
    const sorted = list.map(makeWindow).sort((a, b) => byCode(a.day, b.day) || a.start - b.start);
    const out = [];
    for (const w of sorted) {
      const last = out[out.length - 1];
      if (last && last.day === w.day && w.start <= last.end) last.end = Math.max(last.end, w.end); else out.push({ ...w });
    }
    if (out.length > LIMITS.windows) fail('err.windowsMany', { max: LIMITS.windows });
    return out;
  }
  function makeVolunteer(input, id) {
    if (!isId(id)) fail('err.id');
    if (!isObj(input)) fail('err.backup');
    const maxMinutes = typeof input.maxMinutes === 'number' ? input.maxMinutes : parseHours(input.maxHours);
    if (!Number.isSafeInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > LIMITS.maxMinutes) fail('err.hours', { max: LIMITS.maxMinutes / 60 });
    if (!Array.isArray(input.availability)) fail('err.backup');
    return { id, name: cleanText(input.name, LIMITS.name, true, 'err.name'), skills: parseSkills(input.skills), maxMinutes, availability: mergeWindows(input.availability) };
  }
  function makeShift(input, id) {
    if (!isId(id)) fail('err.id');
    if (!isObj(input)) fail('err.backup');
    const w = makeWindow(input);
    const need = typeof input.need === 'number' ? input.need : Number(String(input.need).trim());
    if (!Number.isSafeInteger(need) || need < 1 || need > LIMITS.need || (typeof input.need === 'string' && !/^\d{1,2}$/.test(input.need.trim()))) fail('err.need', { max: LIMITS.need });
    return { id, post: cleanText(input.post, LIMITS.post, true, 'err.post'), ...w, need, skill: cleanText(input.skill === undefined ? '' : input.skill, LIMITS.skill, false, 'err.skill') };
  }

  const len = (s) => s.end - s.start;
  const overlaps = (a, b) => a.day === b.day && a.start < b.end && b.start < a.end;
  const hasSkill = (v, skill) => !skill || v.skills.some((s) => skillKey(s) === skillKey(skill));
  const isAvailable = (v, s) => v.availability.some((w) => w.day === s.day && w.start <= s.start && w.end >= s.end);
  // Peut-on (statiquement) confier ce créneau à ce bénévole ? (compétence, disponibilité, durée)
  function canEver(v, s) { return hasSkill(v, s.skill) && isAvailable(v, s) && len(s) <= v.maxMinutes; }
  function minutesOf(state, volunteerId, assignments = state.assignments) {
    return assignments.filter((a) => a.volunteerId === volunteerId).reduce((sum, a) => { const s = state.shifts.find((x) => x.id === a.shiftId); return sum + (s ? len(s) : 0); }, 0);
  }
  // Raison pour laquelle on ne peut pas ajouter ce bénévole à ce créneau, ou null si c'est possible.
  function blocker(state, volunteerId, shiftId, assignments = state.assignments) {
    const v = state.volunteers.find((x) => x.id === volunteerId), s = state.shifts.find((x) => x.id === shiftId);
    if (!v || !s) return 'unknown';
    if (assignments.some((a) => a.shiftId === shiftId && a.volunteerId === volunteerId)) return 'already';
    if (assignments.filter((a) => a.shiftId === shiftId).length >= s.need) return 'full';
    if (!hasSkill(v, s.skill)) return 'skill';
    if (!isAvailable(v, s)) return 'unavailable';
    const mine = assignments.filter((a) => a.volunteerId === volunteerId).map((a) => state.shifts.find((x) => x.id === a.shiftId)).filter(Boolean);
    if (mine.some((o) => overlaps(o, s))) return 'overlap';
    if (minutesOf(state, volunteerId, assignments) + len(s) > v.maxMinutes) return 'hours';
    return null;
  }
  function assign(state, volunteerId, shiftId, locked = true) {
    const reason = blocker(state, volunteerId, shiftId);
    if (reason) fail('err.assign.' + reason);
    if (state.assignments.length >= LIMITS.assignments) fail('err.assignmentsMany', { max: LIMITS.assignments });
    return [...state.assignments, { shiftId, volunteerId, locked: !!locked }];
  }
  const unassign = (state, volunteerId, shiftId) => state.assignments.filter((a) => !(a.shiftId === shiftId && a.volunteerId === volunteerId));
  const setLock = (state, volunteerId, shiftId, locked) => state.assignments.map((a) => (a.shiftId === shiftId && a.volunteerId === volunteerId ? { ...a, locked: !!locked } : a));

  // Affectation automatique déterministe (glouton) :
  // 1. les affectations verrouillées (manuelles) sont conservées, les autres recalculées ;
  // 2. les créneaux les plus difficiles à pourvoir passent d'abord (moins de candidats possibles), puis par date et heure ;
  // 3. pour chaque place, le candidat retenu est celui qui a le moins de minutes déjà affectées,
  //    puis le moins d'options (on garde les bénévoles polyvalents pour la suite), puis le nom et l'identifiant.
  // Aucune garantie d'optimum : c'est une proposition reproductible, à ajuster à la main.
  function autoAssign(state) {
    let assignments = state.assignments.filter((a) => a.locked);
    const options = new Map(state.volunteers.map((v) => [v.id, state.shifts.filter((s) => canEver(v, s)).length]));
    const scarcity = new Map(state.shifts.map((s) => [s.id, state.volunteers.filter((v) => canEver(v, s)).length]));
    const order = state.shifts.slice().sort((a, b) => scarcity.get(a.id) / a.need - scarcity.get(b.id) / b.need || byCode(a.day, b.day) || a.start - b.start || byCode(a.post, b.post) || byCode(a.id, b.id));
    for (const s of order) {
      while (assignments.filter((a) => a.shiftId === s.id).length < s.need) {
        const cands = state.volunteers.filter((v) => blocker(state, v.id, s.id, assignments) === null);
        if (!cands.length) break;
        cands.sort((a, b) => minutesOf(state, a.id, assignments) - minutesOf(state, b.id, assignments) || options.get(a.id) - options.get(b.id) || byCode(a.name, b.name) || byCode(a.id, b.id));
        assignments = [...assignments, { shiftId: s.id, volunteerId: cands[0].id, locked: false }];
      }
    }
    // Ordre stable : celui des créneaux puis des bénévoles.
    const si = new Map(state.shifts.map((s, i) => [s.id, i])), vi = new Map(state.volunteers.map((v, i) => [v.id, i]));
    return assignments.sort((a, b) => si.get(a.shiftId) - si.get(b.shiftId) || vi.get(a.volunteerId) - vi.get(b.volunteerId));
  }

  // Couverture : une ligne par créneau, avec les places manquantes et leur cause probable.
  function coverage(state) {
    return state.shifts.slice().sort((a, b) => byCode(a.day, b.day) || a.start - b.start || byCode(a.post, b.post) || byCode(a.id, b.id)).map((s) => {
      const who = state.assignments.filter((a) => a.shiftId === s.id);
      const missing = Math.max(0, s.need - who.length);
      const possible = state.volunteers.filter((v) => canEver(v, s)).length;
      return { shift: s, assigned: who, missing, cause: missing ? (possible === 0 ? 'nobody' : 'short') : null };
    });
  }
  function gaps(state) {
    const rows = coverage(state).filter((r) => r.missing);
    return { shifts: rows.length, places: rows.reduce((a, r) => a + r.missing, 0), rows };
  }
  // Planning d'une personne : ses créneaux dans l'ordre, total en minutes.
  function personSchedule(state, volunteerId) {
    const shifts = state.assignments.filter((a) => a.volunteerId === volunteerId).map((a) => ({ ...state.shifts.find((s) => s.id === a.shiftId), locked: a.locked }))
      .sort((a, b) => byCode(a.day, b.day) || a.start - b.start);
    return { shifts, minutes: shifts.reduce((a, s) => a + len(s), 0) };
  }
  // Après modification d'un bénévole ou d'un créneau : on retire les affectations devenues impossibles
  // (verrouillées d'abord examinées, dans l'ordre), et on dit combien ont été retirées.
  function prune(state) {
    let kept = [];
    const sorted = state.assignments.slice().sort((a, b) => Number(b.locked) - Number(a.locked));
    for (const a of sorted) if (blocker(state, a.volunteerId, a.shiftId, kept) === null) kept.push(a);
    const keep = new Set(kept);
    const assignments = state.assignments.filter((a) => keep.has(a));
    return { state: { ...state, assignments }, removed: state.assignments.length - assignments.length };
  }

  // --- Export CSV : une ligne par créneau.
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = { head: ['Date', 'Début', 'Fin', 'Poste', 'Compétence', 'Besoin', 'Affectés', 'Manquants', 'Bénévoles'], delimiter: ';', locked: ' (manuel)' };
  function csv(state, texts = DEFAULT_TEXTS) {
    const d = texts.delimiter === ',' ? ',' : ';';
    const rows = coverage(state).map((r) => [r.shift.day, hhmm(r.shift.start), hhmm(r.shift.end), r.shift.post, r.shift.skill, r.shift.need, r.assigned.length, r.missing,
      r.assigned.map((a) => state.volunteers.find((v) => v.id === a.volunteerId).name + (a.locked ? texts.locked : '')).join(' / ')]);
    return '﻿' + [texts.head, ...rows].map((row) => row.map(csvCell).join(d)).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'volunteerroster' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'title', 'volunteers', 'shifts', 'assignments'])) fail('err.backup');
    const title = cleanText(data.title, LIMITS.title, false, 'err.title');
    if (!Array.isArray(data.volunteers) || !Array.isArray(data.shifts) || !Array.isArray(data.assignments)) fail('err.backup');
    if (data.volunteers.length > LIMITS.volunteers) fail('err.volunteersMany', { max: LIMITS.volunteers });
    if (data.shifts.length > LIMITS.shifts) fail('err.shiftsMany', { max: LIMITS.shifts });
    if (data.assignments.length > LIMITS.assignments) fail('err.assignmentsMany', { max: LIMITS.assignments });
    const volunteers = data.volunteers.map((v) => {
      if (!isObj(v) || !keysAre(v, ['id', 'name', 'skills', 'maxMinutes', 'availability']) || !Array.isArray(v.skills) || !Array.isArray(v.availability)) fail('err.backup');
      for (const w of v.availability) if (!isObj(w) || !keysAre(w, ['day', 'start', 'end'])) fail('err.backup');
      return makeVolunteer(v, v.id);
    });
    const shifts = data.shifts.map((s) => {
      if (!isObj(s) || !keysAre(s, ['id', 'post', 'day', 'start', 'end', 'need', 'skill'])) fail('err.backup');
      return makeShift(s, s.id);
    });
    if (new Set(volunteers.map((v) => v.id)).size !== volunteers.length || new Set(shifts.map((s) => s.id)).size !== shifts.length) fail('err.backup');
    let state = { title, volunteers, shifts, assignments: [] };
    for (const a of data.assignments) {
      if (!isObj(a) || !keysAre(a, ['shiftId', 'volunteerId', 'locked']) || typeof a.locked !== 'boolean') fail('err.backup');
      if (blocker(state, a.volunteerId, a.shiftId) !== null) fail('err.backup'); // affectation incohérente : refusée
      state = { ...state, assignments: [...state.assignments, { shiftId: a.shiftId, volunteerId: a.volunteerId, locked: a.locked }] };
    }
    return state;
  }
  function backup(state) {
    const clean = validateBackup({ app: 'volunteerroster', version: VERSION, title: state.title, volunteers: state.volunteers, shifts: state.shifts, assignments: state.assignments });
    return JSON.stringify({ app: 'volunteerroster', version: VERSION, ...clean }, null, 2);
  }

  root.RosterCore = Object.freeze({ VERSION, LIMITS, isDay, parseTime, hhmm, parseHours, parseSkills, makeWindow, mergeWindows, makeVolunteer, makeShift,
    overlaps, canEver, minutesOf, blocker, assign, unassign, setLock, autoAssign, coverage, gaps, personSchedule, prune, csv, csvCell, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RosterCore;
})(typeof window === 'undefined' ? globalThis : window);
