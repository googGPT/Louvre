/* PriorityMatrix — logique pure : matrice urgence × importance (Eisenhower) à critères explicites.
   Urgence : calculée depuis l'échéance et un seuil en jours saisi par l'utilisateur, ou fixée à la main.
   Importance : choisie par l'utilisateur. Dates en jours civils « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ matrices: 50, tasks: 200, title: 120, notes: 500, name: 60, threshold: 365 });
  const URGENCY = Object.freeze(['auto', 'urgent', 'not']);
  // q1 urgent + important (faire), q2 important (planifier), q3 urgent (déléguer), q4 ni l'un ni l'autre (abandonner ou plus tard).
  const QUADRANTS = Object.freeze({ q1: { urgent: true, important: true }, q2: { urgent: false, important: true }, q3: { urgent: true, important: false }, q4: { urgent: false, important: false } });

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('err.id'); return id; }
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    if (y < 1900 || y > 2200 || m < 1 || m > 12) return false;
    return d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  const utc = (day) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  // Nombre de jours civils de `from` à `to` (négatif si `to` est passé).
  function daysBetween(from, to) { return Math.round((utc(to) - utc(from)) / 86400000); }
  function addDays(day, n) { return new Date(utc(day) + n * 86400000).toISOString().slice(0, 10); }
  function text(v, max, key, required = true) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(key);
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(key);
    if (s.length > max) fail('err.tooLong', { max });
    return s;
  }
  // Seuil d'urgence en jours (0 = seulement le jour même ou dépassé).
  function parseThreshold(v) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,3}$/.test(s) || Number(s) > MAX.threshold) fail('err.threshold', { max: MAX.threshold });
    return Number(s);
  }

  function makeTask(input, id) {
    const due = input.due === undefined || input.due === null ? '' : input.due;
    if (due !== '' && !isDay(due)) fail('err.due');
    const urgency = input.urgency === undefined ? 'auto' : input.urgency;
    if (!URGENCY.includes(urgency)) fail('err.urgency');
    if (typeof input.important !== 'boolean') fail('err.importance');
    if (input.done !== undefined && typeof input.done !== 'boolean') fail('err.backup');
    const notes = input.notes === undefined ? '' : input.notes;
    if (typeof notes !== 'string') fail('err.notes');
    if (notes.length > MAX.notes) fail('err.tooLong', { max: MAX.notes });
    return { id: checkId(id), title: text(input.title, MAX.title, 'err.titleRequired'), due, urgency, important: input.important, done: input.done === true, notes: notes.trim() };
  }
  function makeMatrix(input, id) {
    return { id: checkId(id), name: text(input.name, MAX.name, 'err.nameRequired'), threshold: parseThreshold(input.threshold), tasks: input.tasks || [] };
  }

  // --- Classement : chaque tâche reçoit une urgence (avec sa raison), une importance et un quadrant.
  function classify(task, today, threshold) {
    const daysLeft = task.due ? daysBetween(today, task.due) : null;
    let urgent, reason;
    if (task.urgency === 'urgent') { urgent = true; reason = 'manual'; }
    else if (task.urgency === 'not') { urgent = false; reason = 'manual'; }
    else if (daysLeft === null) { urgent = false; reason = 'noDue'; }
    else { urgent = daysLeft <= threshold; reason = 'due'; }
    const quadrant = urgent ? (task.important ? 'q1' : 'q3') : (task.important ? 'q2' : 'q4');
    return { urgent, important: task.important, quadrant, daysLeft, reason, overdue: daysLeft !== null && daysLeft < 0 };
  }
  // Glisser une tâche dans un quadrant : l'importance suit ; l'urgence repasse en automatique
  // si le calcul donne déjà le bon résultat, sinon elle est fixée à la main.
  function placeIn(task, quadrant, today, threshold) {
    const q = QUADRANTS[quadrant];
    if (!q) fail('err.quadrant');
    const auto = classify({ ...task, urgency: 'auto' }, today, threshold).urgent;
    const urgency = auto === q.urgent ? 'auto' : (q.urgent ? 'urgent' : 'not');
    return { ...task, important: q.important, urgency };
  }
  // Déplacement au clavier dans la grille : gauche/droite change l'urgence, haut/bas l'importance.
  function neighbour(quadrant, dir) {
    const q = QUADRANTS[quadrant];
    if (!q) fail('err.quadrant');
    let { urgent, important } = q;
    if (dir === 'left') urgent = true; else if (dir === 'right') urgent = false;
    else if (dir === 'up') important = true; else if (dir === 'down') important = false;
    else fail('err.direction');
    return Object.keys(QUADRANTS).find((k) => QUADRANTS[k].urgent === urgent && QUADRANTS[k].important === important);
  }
  // Listes d'actions par quadrant : tâches ouvertes, échéance la plus proche d'abord (sans échéance à la fin).
  function matrix(m, today, locale) {
    const out = { q1: [], q2: [], q3: [], q4: [], done: [] };
    for (const task of m.tasks) {
      const c = classify(task, today, m.threshold);
      (task.done ? out.done : out[c.quadrant]).push({ ...task, ...c, importance: task.important });
    }
    const cmp = (a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || a.title.localeCompare(b.title, locale);
    for (const k of Object.keys(out)) out[k].sort(cmp);
    return out;
  }
  function summary(m, today) {
    const x = matrix(m, today);
    return { q1: x.q1.length, q2: x.q2.length, q3: x.q3.length, q4: x.q4.length, done: x.done.length, overdue: m.tasks.filter((t) => !t.done && classify(t, today, m.threshold).overdue).length };
  }

  // --- Exports. `lab` fournit les libellés traduits.
  function csvCell(v) {
    let s = String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // un nombre (ex. -2 jours) reste un nombre
    return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(m, today, lab) {
    const x = matrix(m, today);
    const rows = [lab.head];
    for (const k of ['q1', 'q2', 'q3', 'q4', 'done']) {
      for (const t of x[k]) rows.push([lab.quadrant(k), t.title, t.due, t.daysLeft === null ? '' : t.daysLeft, lab.yesNo(t.urgent), lab.yesNo(t.important), lab.reason(t.reason), t.notes]);
    }
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function toMarkdown(m, today, lab) {
    const x = matrix(m, today);
    const line = (s) => String(s).replace(/\s*\n\s*/g, ' ');
    const out = [`# ${line(m.name)}`, '', lab.rule(m.threshold, today), ''];
    for (const k of ['q1', 'q2', 'q3', 'q4']) {
      out.push(`## ${lab.quadrant(k)}`, '');
      if (!x[k].length) out.push(`- ${lab.none}`);
      for (const t of x[k]) out.push(`- [ ] ${line(t.title)}${t.due ? ` — ${lab.due(t)}` : ''}`);
      out.push('');
    }
    if (x.done.length) { out.push(`## ${lab.quadrant('done')}`, '', ...x.done.map((t) => `- [x] ${line(t.title)}`), ''); }
    return out.join('\n').trimEnd() + '\n';
  }

  // --- Sauvegarde
  function uniq(list) { if (new Set(list.map((x) => x.id)).size !== list.length) fail('err.backup'); return list; }
  function validateMatrix(m) {
    if (!isObj(m) || !keysAre(m, ['id', 'name', 'threshold', 'tasks']) || !Array.isArray(m.tasks) || !Number.isSafeInteger(m.threshold)) fail('err.backup');
    if (m.tasks.length > MAX.tasks) fail('err.tooManyTasks', { max: MAX.tasks });
    const tasks = uniq(m.tasks.map((t) => {
      if (!isObj(t) || !keysAre(t, ['id', 'title', 'due', 'urgency', 'important', 'done', 'notes']) || typeof t.done !== 'boolean') fail('err.backup');
      return makeTask(t, t.id);
    }));
    return makeMatrix({ name: m.name, threshold: String(m.threshold), tasks }, m.id);
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'prioritymatrix' || data.version !== VERSION || !Array.isArray(data.matrices)) fail('err.notBackup');
    if (data.matrices.length > MAX.matrices) fail('err.tooManyMatrices', { max: MAX.matrices });
    return uniq(data.matrices.map(validateMatrix));
  }
  function backup(matrices) { return JSON.stringify({ app: 'prioritymatrix', version: VERSION, matrices: validateBackup({ app: 'prioritymatrix', version: VERSION, matrices }) }, null, 2); }

  root.PriorityCore = Object.freeze({
    VERSION, MAX, URGENCY, QUADRANTS, isDay, daysBetween, addDays, parseThreshold, makeTask, makeMatrix,
    classify, placeIn, neighbour, matrix, summary, toCSV, toMarkdown, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PriorityCore;
})(typeof window === 'undefined' ? globalThis : window);
