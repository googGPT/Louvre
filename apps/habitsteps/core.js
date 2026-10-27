/* HabitSteps — logique pure du suivi d'habitudes : pointages, séries, taux de régularité.
   Objectif quotidien (chaque jour) ou hebdomadaire (N fois par semaine, semaines du lundi au dimanche). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX_HABITS = 50, MAX_NAME = 60, MAX_CHECKS = 3700; // ~10 ans de pointages quotidiens
  const HISTORY_DAYS = 400; // on peut pointer jusqu'à ~13 mois en arrière

  // Erreurs sous forme de clés traduisibles par l'interface : « err.cle » ou « err.cle|{…} ».
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const pad = (n) => String(n).padStart(2, '0');

  // --- Dates (jours civils, calculs en UTC pour éviter les changements d'heure)
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function dayKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function toUTC(day) { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function fromUTC(t) { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  function addDays(day, n) { return fromUTC(toUTC(day) + n * 86400000); }
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); } // de a vers b
  function weekStart(day) { const dow = (new Date(toUTC(day)).getUTCDay() + 6) % 7; return addDays(day, -dow); } // lundi

  // --- Habitudes
  function cleanName(v) {
    const name = typeof v === 'string' ? v.trim() : '';
    if (!name) fail('err.nameRequired');
    if (name.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return name;
  }
  function cleanGoal(goal) {
    if (!goal || typeof goal !== 'object') fail('err.goal');
    if (goal.type === 'daily') return { type: 'daily' };
    if (goal.type === 'weekly') {
      const times = Number(goal.times);
      if (!Number.isInteger(times) || times < 1 || times > 7) fail('err.weeklyTimes', { min: 1, max: 7 });
      return { type: 'weekly', times };
    }
    return fail('err.goalType');
  }
  function makeHabit(input, today, id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('err.id');
    if (!isDay(today)) fail('err.today');
    return { id, name: cleanName(input.name), goal: cleanGoal(input.goal), created: today, archived: false, checks: [] };
  }

  // Pointer / dépointer un jour (pas dans le futur, pas plus de ~13 mois en arrière).
  function toggle(habit, day, today) {
    if (!isDay(day) || !isDay(today)) fail('err.date');
    if (day > today) fail('err.future');
    if (diffDays(day, today) > HISTORY_DAYS) fail('err.tooOld');
    const has = habit.checks.includes(day);
    const checks = has ? habit.checks.filter((d) => d !== day) : [...habit.checks, day].sort();
    if (checks.length > MAX_CHECKS) fail('err.tooManyChecks');
    // Pointer avant la date de création recule la date de début (rattrapage d'un oubli).
    return { ...habit, checks, created: !has && day < habit.created ? day : habit.created };
  }

  // Série en cours et meilleure série. Une période pas encore réussie (aujourd'hui / cette semaine)
  // n'interrompt pas la série : elle est « en jeu ».
  function streaks(habit, today) {
    const set = new Set(habit.checks);
    if (habit.goal.type === 'daily') {
      let current = 0, day = set.has(today) ? today : addDays(today, -1);
      while (set.has(day)) { current += 1; day = addDays(day, -1); }
      let best = 0, run = 0, prev = null;
      for (const d of habit.checks) { run = prev && diffDays(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
      return { current, best, unit: 'day' }; // unité : code traduit par l'interface
    }
    // Hebdomadaire : comptage des pointages par semaine.
    const perWeek = new Map();
    for (const d of habit.checks) { const w = weekStart(d); perWeek.set(w, (perWeek.get(w) || 0) + 1); }
    const ok = (w) => (perWeek.get(w) || 0) >= habit.goal.times;
    const thisWeek = weekStart(today);
    let current = 0, w = ok(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    while (ok(w)) { current += 1; w = addDays(w, -7); }
    let best = 0, run = 0, prev = null;
    for (const wk of [...perWeek.keys()].filter(ok).sort()) { run = prev && diffDays(prev, wk) === 7 ? run + 1 : 1; best = Math.max(best, run); prev = wk; }
    return { current, best, unit: 'week' };
  }

  // Régularité récente : jours réussis sur 30 jours (quotidien) ou semaines réussies sur 8 (hebdo),
  // en ne comptant que les périodes depuis la création de l'habitude.
  function rate(habit, today) {
    const set = new Set(habit.checks);
    if (habit.goal.type === 'daily') {
      const span = Math.min(30, diffDays(habit.created, today) + 1);
      let done = 0;
      for (let i = 0; i < span; i += 1) if (set.has(addDays(today, -i))) done += 1;
      return { done, total: span, pct: span ? Math.round(1000 * done / span) / 10 : 0 };
    }
    const thisWeek = weekStart(today), first = weekStart(habit.created);
    const weeks = Math.min(8, diffDays(first, thisWeek) / 7 + 1);
    let done = 0;
    for (let i = 0; i < weeks; i += 1) {
      const w = addDays(thisWeek, -7 * i);
      const n = habit.checks.filter((d) => d >= w && d <= addDays(w, 6)).length;
      if (n >= habit.goal.times) done += 1;
    }
    return { done, total: weeks, pct: weeks ? Math.round(1000 * done / weeks) / 10 : 0 };
  }

  // Progression de la semaine en cours (pour l'objectif hebdomadaire).
  function weekProgress(habit, today) {
    const w = weekStart(today);
    return habit.checks.filter((d) => d >= w && d <= today).length;
  }

  // Grille de régularité : `weeks` semaines (lundi -> dimanche), la dernière contenant aujourd'hui.
  function grid(habit, today, weeks = 12) {
    const set = new Set(habit.checks), start = addDays(weekStart(today), -7 * (weeks - 1)), cols = [];
    for (let c = 0; c < weeks; c += 1) {
      const col = [];
      for (let r = 0; r < 7; r += 1) {
        const day = addDays(start, 7 * c + r);
        col.push({ day, done: set.has(day), future: day > today });
      }
      cols.push(col);
    }
    return cols;
  }

  // --- Sauvegarde
  function validateHabit(h) {
    if (!h || typeof h !== 'object' || Array.isArray(h)) fail('err.habit');
    if (Object.keys(h).sort().join(',') !== 'archived,checks,created,goal,id,name') fail('err.fields');
    if (typeof h.id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(h.id)) fail('err.id');
    if (typeof h.archived !== 'boolean' || !isDay(h.created) || !Array.isArray(h.checks) || h.checks.length > MAX_CHECKS) fail('err.habit');
    const goal = cleanGoal(h.goal);
    if (Object.keys(h.goal).length !== Object.keys(goal).length) fail('err.goal');
    for (let i = 0; i < h.checks.length; i += 1) {
      if (!isDay(h.checks[i]) || h.checks[i] < h.created || (i && h.checks[i] <= h.checks[i - 1])) fail('err.checks');
    }
    return { id: h.id, name: cleanName(h.name), goal, created: h.created, archived: h.archived, checks: [...h.checks] };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'habitsteps' || data.version !== VERSION || !Array.isArray(data.habits)) fail('err.notBackup');
    if (data.habits.length > MAX_HABITS) fail('err.tooMany', { max: MAX_HABITS });
    const habits = data.habits.map(validateHabit);
    if (new Set(habits.map((h) => h.id)).size !== habits.length) fail('err.duplicate');
    return habits;
  }
  function backup(habits) { return JSON.stringify({ app: 'habitsteps', version: VERSION, habits: validateBackup({ app: 'habitsteps', version: VERSION, habits }) }, null, 2); }

  root.HabitCore = Object.freeze({ VERSION, MAX_HABITS, isDay, dayKey, addDays, diffDays, weekStart, makeHabit, toggle, streaks, rate, weekProgress, grid, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HabitCore;
})(typeof window === 'undefined' ? globalThis : window);
