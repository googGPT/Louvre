/* MeetingMinutes — logique pure : ordre du jour minuté, dépassements, décisions, actions et leur suivi,
   compte rendu Markdown et échéances .ics. Dates en jours civils « AAAA-MM-JJ », heures « HH:MM »,
   durées prévues en minutes entières, temps passé en secondes entières. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ meetings: 300, participants: 50, items: 40, decisions: 100, actions: 150, title: 120, text: 300, name: 80, notes: 5000, minutes: 480, duration: 720 });
  const PRESENCE = Object.freeze(['present', 'excused', 'absent']);

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('err.id'); return id; }

  // --- Jours civils et heures
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (y < 1900 || y > 2200 || m < 1 || m > 12) return false;
    return d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.toISOString().slice(0, 10);
  }
  function isTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  // Heure de début + décalage en minutes -> « HH:MM » et nombre de jours de report (réunion après minuit).
  function clock(start, offset) {
    const total = toMin(start) + offset;
    const m = ((total % 1440) + 1440) % 1440;
    return { time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, dayOffset: Math.floor(total / 1440) };
  }

  // --- Saisies
  function cleanText(v, max, key, required = true) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(key);
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(key);
    if (s.length > max) fail('err.tooLong', { max });
    return s;
  }
  function parseInt1(v, min, max, key) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,4}$/.test(s)) fail(key, { min, max });
    const n = Number(s);
    if (n < min || n > max) fail(key, { min, max });
    return n;
  }
  const parseMinutes = (v) => parseInt1(v, 1, MAX.minutes, 'err.minutes');
  const parseDuration = (v) => parseInt1(v, 5, MAX.duration, 'err.duration');
  // Temps passé saisi à la main, en minutes entières (0 = remise à zéro) -> secondes.
  const parseSpent = (v) => parseInt1(v, 0, MAX.minutes, 'err.spentInput') * 60;
  function checkDay(v, key = 'err.date') { if (!isDay(v)) fail(key); return v; }

  function makeParticipant(input, id) {
    const presence = input.presence === undefined ? 'present' : input.presence;
    if (!PRESENCE.includes(presence)) fail('err.presence');
    return { id: checkId(id), name: cleanText(input.name, MAX.name, 'err.nameRequired'), presence };
  }
  function makeItem(input, id) {
    const notes = input.notes === undefined ? '' : input.notes;
    if (typeof notes !== 'string') fail('err.notes');
    if (notes.length > MAX.notes) fail('err.notesLong', { max: MAX.notes });
    const spentSec = input.spentSec === undefined ? 0 : input.spentSec;
    if (!Number.isSafeInteger(spentSec) || spentSec < 0 || spentSec > 86400) fail('err.spent');
    return { id: checkId(id), title: cleanText(input.title, MAX.title, 'err.itemRequired'), minutes: parseMinutes(input.minutes), notes, spentSec };
  }
  function makeDecision(input, id) {
    const itemId = input.itemId === undefined || input.itemId === '' ? null : input.itemId;
    if (itemId !== null) checkId(itemId);
    return { id: checkId(id), text: cleanText(input.text, MAX.text, 'err.decisionRequired'), itemId };
  }
  function makeAction(input, id) {
    const itemId = input.itemId === undefined || input.itemId === '' ? null : input.itemId;
    if (itemId !== null) checkId(itemId);
    const due = input.due === undefined || input.due === null ? '' : input.due;
    if (due !== '') checkDay(due, 'err.due');
    if (input.done !== undefined && typeof input.done !== 'boolean') fail('err.backup');
    return { id: checkId(id), text: cleanText(input.text, MAX.text, 'err.actionRequired'), owner: cleanText(input.owner, MAX.name, 'err.owner', false), due, done: input.done === true, itemId };
  }
  function makeMeeting(input, id) {
    const start = input.start === undefined ? '09:00' : input.start;
    if (!isTime(start)) fail('err.time');
    return {
      id: checkId(id), title: cleanText(input.title, MAX.title, 'err.titleRequired'), date: checkDay(input.date),
      start, duration: parseDuration(input.duration === undefined ? 60 : input.duration),
      participants: input.participants || [], items: input.items || [], decisions: input.decisions || [], actions: input.actions || [],
    };
  }

  // Déplace un point de l'ordre du jour d'une position (delta -1 ou +1) ; renvoie un nouveau tableau.
  function moveItem(items, id, delta) {
    const i = items.findIndex((x) => x.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return items.slice();
    const out = items.slice(); [out[i], out[j]] = [out[j], out[i]]; return out;
  }

  // --- Minutage : horaires prévus, temps passé, dépassements et heure de fin projetée.
  function schedule(meeting) {
    let at = 0, forecastSec = 0, spentSec = 0;
    const rows = meeting.items.map((it) => {
      const row = { id: it.id, title: it.title, plannedMin: it.minutes, startMin: at, endMin: at + it.minutes, spentSec: it.spentSec, overSec: Math.max(0, it.spentSec - it.minutes * 60), started: it.spentSec > 0 };
      at += it.minutes; spentSec += it.spentSec;
      forecastSec += it.spentSec > 0 ? it.spentSec : it.minutes * 60; // non commencé : durée prévue
      return row;
    });
    const plannedMin = at;
    const forecastMin = Math.ceil(forecastSec / 60);
    return {
      rows, plannedMin, spentSec, forecastMin,
      planOverMin: Math.max(0, plannedMin - meeting.duration), // l'ordre du jour ne tient pas dans la durée prévue
      forecastOverMin: Math.max(0, forecastMin - meeting.duration), // retard projeté à ce rythme
      slackMin: Math.max(0, meeting.duration - plannedMin),
      plannedEnd: clock(meeting.start, meeting.duration), forecastEnd: clock(meeting.start, forecastMin),
    };
  }

  // --- Suivi des actions d'une réunion à l'autre
  const order = (m) => `${m.date}T${m.start}`;
  // Actions non soldées des réunions antérieures (date puis heure), avec retard éventuel à la date de la réunion.
  function pendingActions(meetings, meetingId) {
    const cur = meetings.find((m) => m.id === meetingId);
    if (!cur) return [];
    const out = [];
    for (const m of meetings) {
      if (m.id === cur.id || order(m) >= order(cur)) continue;
      for (const a of m.actions) if (!a.done) out.push({ meetingId: m.id, meetingTitle: m.title, meetingDate: m.date, action: a, overdue: a.due !== '' && a.due < cur.date });
    }
    return out.sort((x, y) => (x.action.due || '9999-99-99').localeCompare(y.action.due || '9999-99-99') || x.meetingDate.localeCompare(y.meetingDate));
  }
  function actionStats(actions, onDay) {
    let open = 0, done = 0, overdue = 0;
    for (const a of actions) { if (a.done) done += 1; else { open += 1; if (a.due && a.due < onDay) overdue += 1; } }
    return { open, done, overdue };
  }
  // Prépare la réunion suivante : mêmes participants (présents) et mêmes points, sans notes ni temps passé.
  function nextMeeting(meeting, date, makeId) {
    checkDay(date);
    return makeMeeting({
      title: meeting.title, date, start: meeting.start, duration: meeting.duration,
      participants: meeting.participants.map((p) => makeParticipant({ name: p.name }, makeId())),
      items: meeting.items.map((it) => makeItem({ title: it.title, minutes: it.minutes }, makeId())),
    }, makeId());
  }

  // --- Compte rendu Markdown. `lab` fournit les libellés traduits et les formats (date, durée).
  const DEFAULT_LAB = {
    minutes: 'Compte rendu', date: (d) => d, time: 'Horaire', participants: 'Participants', present: 'Présents', excused: 'Excusés', absent: 'Absents',
    agenda: 'Ordre du jour', planned: 'prévu', spent: 'passé', notes: 'Notes', decisions: 'Décisions', actions: 'Actions',
    action: 'Action', owner: 'Responsable', due: 'Échéance', status: 'Statut', open: 'À faire', done: 'Fait', none: '—',
    pending: 'Suivi des actions précédentes', from: 'Réunion', overdue: 'en retard', dur: (sec) => `${Math.round(sec / 60)} min`, min: (n) => `${n} min`,
  };
  const cell = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const line = (s) => String(s).replace(/\s*\n\s*/g, ' ');
  function toMarkdown(meeting, pending = [], lab = DEFAULT_LAB) {
    const L = { ...DEFAULT_LAB, ...lab };
    const s = schedule(meeting);
    const out = [`# ${line(meeting.title)}`, '', `**${L.minutes}** · ${L.date(meeting.date)} · ${L.time} ${meeting.start}–${s.plannedEnd.time}`, ''];
    if (meeting.participants.length) {
      out.push(`## ${L.participants}`, '');
      for (const k of PRESENCE) {
        const names = meeting.participants.filter((p) => p.presence === k).map((p) => line(p.name));
        if (names.length) out.push(`- **${L[k]}** : ${names.join(', ')}`);
      }
      out.push('');
    }
    if (meeting.items.length) {
      out.push(`## ${L.agenda}`, '');
      meeting.items.forEach((it, i) => {
        const r = s.rows[i];
        const spent = it.spentSec > 0 ? ` · ${L.spent} ${L.dur(it.spentSec)}` : '';
        out.push(`### ${i + 1}. ${line(it.title)}`, '', `*${clock(meeting.start, r.startMin).time} · ${L.planned} ${L.min(it.minutes)}${spent}*`, '');
        if (it.notes.trim()) out.push(it.notes.trim(), '');
        const dec = meeting.decisions.filter((d) => d.itemId === it.id);
        if (dec.length) { out.push(`**${L.decisions}**`, '', ...dec.map((d) => `- ${line(d.text)}`), ''); }
      });
    }
    const loose = meeting.decisions.filter((d) => !d.itemId || !meeting.items.some((it) => it.id === d.itemId));
    if (loose.length) out.push(`## ${L.decisions}`, '', ...loose.map((d) => `- ${line(d.text)}`), '');
    const table = (rows, withFrom) => {
      const head = [L.action, L.owner, L.due, L.status].concat(withFrom ? [L.from] : []);
      const t = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
      for (const r of rows) {
        const a = r.action || r;
        const status = a.done ? L.done : (r.overdue ? `${L.open} (${L.overdue})` : L.open);
        const cols = [a.text, a.owner || L.none, a.due ? L.date(a.due) : L.none, status].concat(withFrom ? [`${r.meetingTitle} (${L.date(r.meetingDate)})`] : []);
        t.push(`| ${cols.map(cell).join(' | ')} |`);
      }
      return t;
    };
    if (meeting.actions.length) out.push(`## ${L.actions}`, '', ...table(meeting.actions.map((a) => ({ action: a, overdue: false })), false), '');
    if (pending.length) out.push(`## ${L.pending}`, '', ...table(pending, true), '');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  // --- Échéances (.ics, RFC 5545) : un événement d'une journée par action ouverte datée.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(text) { // lignes de 75 octets au plus
    const out = []; let cur = '';
    const enc = new TextEncoder();
    for (const ch of text) { if (enc.encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  const DEFAULT_ICS = { summary: (a) => a.owner ? `${a.text} (${a.owner})` : a.text, describe: (m) => `${m.title} · ${m.date}` };
  // entries : [{ action, meeting }] ; seules les actions ouvertes avec échéance sont exportées.
  function toICS(entries, stamp, text = DEFAULT_ICS) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//MeetingMinutes//FR', 'CALSCALE:GREGORIAN'];
    let n = 0;
    for (const { action: a, meeting: m } of entries) {
      if (a.done || !a.due) continue;
      n += 1;
      lines.push('BEGIN:VEVENT', `UID:${a.id}@meetingminutes.louvre`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${a.due.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(a.due, 1).replace(/-/g, '')}`,
        fold(`SUMMARY:${icsEscape(text.summary(a))}`), fold(`DESCRIPTION:${icsEscape(text.describe(m))}`), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    if (!n) fail('err.noDue');
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde : chaque champ est revalidé avant toute écriture.
  function uniq(list) { if (new Set(list.map((x) => x.id)).size !== list.length) fail('err.backup'); return list; }
  function validateMeeting(m) {
    if (!isObj(m) || !keysAre(m, ['id', 'title', 'date', 'start', 'duration', 'participants', 'items', 'decisions', 'actions'])) fail('err.backup');
    for (const k of ['participants', 'items', 'decisions', 'actions']) if (!Array.isArray(m[k]) || m[k].length > MAX[k]) fail('err.backup');
    if (!Number.isSafeInteger(m.duration)) fail('err.backup');
    const participants = uniq(m.participants.map((p) => { if (!isObj(p) || !keysAre(p, ['id', 'name', 'presence'])) fail('err.backup'); return makeParticipant(p, p.id); }));
    const items = uniq(m.items.map((it) => {
      if (!isObj(it) || !keysAre(it, ['id', 'title', 'minutes', 'notes', 'spentSec']) || !Number.isSafeInteger(it.minutes)) fail('err.backup');
      return makeItem(it, it.id);
    }));
    const ids = new Set(items.map((i) => i.id));
    const linked = (x) => { if (x.itemId !== null && !ids.has(x.itemId)) fail('err.backup'); return x; };
    const decisions = uniq(m.decisions.map((d) => { if (!isObj(d) || !keysAre(d, ['id', 'text', 'itemId'])) fail('err.backup'); return linked(makeDecision(d, d.id)); }));
    const actions = uniq(m.actions.map((a) => {
      if (!isObj(a) || !keysAre(a, ['id', 'text', 'owner', 'due', 'done', 'itemId']) || typeof a.done !== 'boolean') fail('err.backup');
      return linked(makeAction(a, a.id));
    }));
    return makeMeeting({ ...m, duration: String(m.duration), participants, items, decisions, actions }, m.id);
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'meetingminutes' || data.version !== VERSION || !Array.isArray(data.meetings)) fail('err.notBackup');
    if (data.meetings.length > MAX.meetings) fail('err.tooManyMeetings', { max: MAX.meetings });
    return uniq(data.meetings.map(validateMeeting));
  }
  function backup(meetings) { return JSON.stringify({ app: 'meetingminutes', version: VERSION, meetings: validateBackup({ app: 'meetingminutes', version: VERSION, meetings }) }, null, 2); }

  root.MeetCore = Object.freeze({
    VERSION, MAX, PRESENCE, isDay, addDays, isTime, clock, parseMinutes, parseDuration, parseSpent,
    makeParticipant, makeItem, makeDecision, makeAction, makeMeeting, moveItem, schedule,
    pendingActions, actionStats, nextMeeting, toMarkdown, toICS, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MeetCore;
})(typeof window === 'undefined' ? globalThis : window);
