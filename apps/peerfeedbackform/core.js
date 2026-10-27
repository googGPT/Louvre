/* PeerFeedbackForm — logique pure : grille d'évaluation entre pairs (critères, échelle), saisie évaluateur → évalué,
   agrégation par étudiant (moyenne, écart-type, nombre d'évaluations), coefficient individuel « WebPA », note individuelle,
   export CSV et sauvegarde. Aucune dépendance au navigateur.

   Méthode WebPA (outil d'évaluation par les pairs issu de l'université de Loughborough), telle qu'appliquée ici :
   - pour chaque évaluateur i ayant noté TOUS les membres concernés de son équipe, total s_ij = somme des notes données à j ;
   - part normalisée n_ij = s_ij / Σ_k s_ik (chaque évaluateur distribue exactement 1) ;
   - coefficient f_j = (N / S) × Σ_i n_ij, avec N = taille de l'équipe et S = nombre d'évaluateurs retenus ;
     ainsi la moyenne des coefficients vaut 1 quand tout le monde a répondu ;
   - note individuelle = note de l'équipe × f_j, plafonnée au barème. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ students: 300, criteria: 10, teamSize: 30, name: 80, team: 40, title: 80, scaleTop: 100, markMax: 1000 });
  const SELF = Object.freeze(['exclude', 'include']);

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const isId = (v) => typeof v === 'string' && /^[a-z0-9-]{6,64}$/i.test(v);

  function cleanText(v, max, required, key) {
    if (typeof v !== 'string') fail(key + 'Required');
    const s = v.trim().replace(/\s+/g, ' ');
    if (/[\u0000-\u001f\u007f]/.test(s)) fail('err.control');
    if (required && !s) fail(key + 'Required');
    if (s.length > max) fail(key + 'Long', { max });
    return s;
  }
  function parseInt10(v, low, high, key) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,4}$/.test(s)) fail(key, { low, high });
    const n = Number(s);
    if (n < low || n > high) fail(key, { low, high });
    return n;
  }
  // Note d'équipe « 14,5 » -> 1450 centièmes ; vide -> null.
  function parseMark(v, markMax) {
    const s = String(v === undefined || v === null ? '' : v).trim().replace(',', '.');
    if (!s) return null;
    if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) fail('err.mark', { max: markMax });
    const [a, b = ''] = s.split('.');
    const h = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (h > markMax * 100) fail('err.mark', { max: markMax });
    return h;
  }

  function makeSettings(input) {
    if (!isObj(input)) fail('err.settings');
    const { scaleMin, scaleMax, markMax } = input;
    if (!Number.isSafeInteger(scaleMin) || scaleMin < 0 || scaleMin > 10) fail('err.scaleMin', { low: 0, high: 10 });
    if (!Number.isSafeInteger(scaleMax) || scaleMax <= scaleMin || scaleMax > LIMITS.scaleTop) fail('err.scaleMax', { low: scaleMin + 1, high: LIMITS.scaleTop });
    if (!SELF.includes(input.self)) fail('err.settings');
    if (!Number.isSafeInteger(markMax) || markMax < 1 || markMax > LIMITS.markMax) fail('err.markMax', { low: 1, high: LIMITS.markMax });
    return { title: cleanText(input.title === undefined ? '' : input.title, LIMITS.title, false, 'err.title'), scaleMin, scaleMax, self: input.self, markMax };
  }
  const DEFAULT_SETTINGS = Object.freeze({ title: '', scaleMin: 1, scaleMax: 5, self: 'exclude', markMax: 20 });

  function makeCriterion(input, id) {
    if (!isId(id)) fail('err.id');
    return { id, name: cleanText(input.name, LIMITS.name, true, 'err.criterion') };
  }
  function makeStudent(input, id) {
    if (!isId(id)) fail('err.id');
    return { id, name: cleanText(input.name, LIMITS.name, true, 'err.name'), team: cleanText(input.team === undefined ? '' : input.team, LIMITS.team, false, 'err.team') };
  }
  // Équipes triées ; une équipe vide ("") regroupe les étudiants sans équipe.
  function teams(students, compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    return [...new Set(students.map((s) => s.team))].sort(compare);
  }
  const teammates = (students, team) => students.filter((s) => s.team === team);
  // Personnes qu'un évaluateur doit noter : ses coéquipiers, et lui-même si l'auto-évaluation compte.
  function targets(students, raterId, self) {
    const r = students.find((s) => s.id === raterId);
    if (!r) return [];
    return teammates(students, r.team).filter((s) => s.id !== raterId || self === 'include');
  }

  // Une évaluation : évaluateur → évalué, une note entière par critère (critère absent = pas encore noté).
  function makeRating(input, state) {
    if (!isObj(input) || !isObj(input.scores)) fail('err.backup');
    const rater = state.students.find((s) => s.id === input.rater), ratee = state.students.find((s) => s.id === input.ratee);
    if (!rater || !ratee) fail('err.student');
    if (rater.team !== ratee.team) fail('err.sameTeam');
    const scores = {};
    for (const [cid, v] of Object.entries(input.scores)) {
      if (!state.criteria.some((c) => c.id === cid)) fail('err.criterionUnknown');
      if (!Number.isSafeInteger(v) || v < state.settings.scaleMin || v > state.settings.scaleMax) fail('err.score', { low: state.settings.scaleMin, high: state.settings.scaleMax });
      scores[cid] = v;
    }
    return { rater: rater.id, ratee: ratee.id, scores };
  }
  // Pose (ou efface avec null) une note ; renvoie la nouvelle liste d'évaluations.
  function setScore(state, rater, ratee, criterionId, value) {
    const list = state.ratings.slice();
    const i = list.findIndex((r) => r.rater === rater && r.ratee === ratee);
    const cur = i >= 0 ? list[i] : { rater, ratee, scores: {} };
    const scores = { ...cur.scores };
    if (value === null) delete scores[criterionId]; else scores[criterionId] = value;
    const next = makeRating({ rater, ratee, scores }, state);
    if (i >= 0) { if (Object.keys(scores).length) list[i] = next; else list.splice(i, 1); } else if (Object.keys(scores).length) list.push(next);
    return list;
  }
  const complete = (rating, criteria) => criteria.length > 0 && criteria.every((c) => rating.scores[c.id] !== undefined);
  const ratingMean = (rating, criteria) => criteria.reduce((a, c) => a + rating.scores[c.id], 0) / criteria.length;
  const total = (rating, criteria) => criteria.reduce((a, c) => a + rating.scores[c.id], 0);

  // Avancement d'un évaluateur : nombre de fiches complètes sur le nombre attendu.
  function progress(state, raterId) {
    const want = targets(state.students, raterId, state.settings.self);
    const done = want.filter((s) => { const r = state.ratings.find((x) => x.rater === raterId && x.ratee === s.id); return r && complete(r, state.criteria); }).length;
    return { done, expected: want.length };
  }

  const r2 = (x) => Math.round(x * 100) / 100;
  // Statistiques reçues par un étudiant (évaluations complètes de ses pairs ; la sienne à part).
  function received(state, studentId) {
    const { criteria, settings } = state;
    const all = state.ratings.filter((r) => r.ratee === studentId && complete(r, criteria));
    const own = all.find((r) => r.rater === studentId) || null;
    const counted = all.filter((r) => r.rater !== studentId || settings.self === 'include');
    const means = counted.map((r) => ratingMean(r, criteria));
    const n = means.length;
    const mean = n ? means.reduce((a, b) => a + b, 0) / n : null;
    // Écart-type d'échantillon (n − 1) des moyennes reçues ; non défini pour moins de 2 évaluations.
    const sd = n >= 2 ? Math.sqrt(means.reduce((a, m) => a + (m - mean) ** 2, 0) / (n - 1)) : null;
    const byCriterion = criteria.map((c) => (n ? r2(counted.reduce((a, r) => a + r.scores[c.id], 0) / n) : null));
    const selfMean = own ? r2(ratingMean(own, criteria)) : null;
    const peers = all.filter((r) => r.rater !== studentId).map((r) => ratingMean(r, criteria));
    const peerMean = peers.length ? peers.reduce((a, b) => a + b, 0) / peers.length : null;
    return { n, mean: mean === null ? null : r2(mean), sd: sd === null ? null : r2(sd), byCriterion, self: selfMean, selfGap: selfMean !== null && peerMean !== null ? r2(selfMean - peerMean) : null };
  }

  // Coefficients WebPA d'une équipe. Renvoie aussi les évaluateurs écartés et la raison.
  function webpa(state, team) {
    const members = teammates(state.students, team), N = members.length, { criteria, settings } = state;
    const used = [], skipped = [];
    const sums = new Map(members.map((m) => [m.id, 0]));
    for (const rater of members) {
      const want = targets(state.students, rater.id, settings.self);
      const rows = want.map((s) => state.ratings.find((r) => r.rater === rater.id && r.ratee === s.id));
      if (!want.length || rows.some((r) => !r || !complete(r, criteria))) { skipped.push({ id: rater.id, reason: 'incomplete' }); continue; }
      const totals = rows.map((r) => total(r, criteria)), T = totals.reduce((a, b) => a + b, 0);
      if (T === 0) { skipped.push({ id: rater.id, reason: 'zero' }); continue; }
      want.forEach((s, k) => sums.set(s.id, sums.get(s.id) + totals[k] / T));
      used.push(rater.id);
    }
    const S = used.length;
    const factors = members.map((m) => { const raw = S ? (N / S) * sums.get(m.id) : null; return { id: m.id, raw, factor: raw === null ? null : Math.round(raw * 1000) / 1000 }; });
    return { team, size: N, submitted: S, used, skipped, factors };
  }
  // Note individuelle en centièmes : note d'équipe × coefficient, plafonnée au barème, arrondie au centième.
  function individualMark(teamMarkH, factor, markMax) {
    if (teamMarkH === null || factor === null) return null;
    return Math.min(markMax * 100, Math.round(teamMarkH * factor));
  }

  // Résultats complets, une ligne par étudiant, regroupés par équipe.
  function results(state, compare) {
    const out = [];
    for (const team of teams(state.students, compare)) {
      const w = webpa(state, team), mark = state.teamMarks[team] === undefined ? null : state.teamMarks[team];
      const members = teammates(state.students, team).slice().sort((a, b) => (compare ? compare(a.name, b.name) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const s of members) {
        const f = w.factors.find((x) => x.id === s.id); // coefficient exact pour la note, arrondi au millième pour l'affichage
        out.push({ id: s.id, name: s.name, team, ...received(state, s.id), progress: progress(state, s.id), factor: f.factor, teamMark: mark, mark: individualMark(mark, f.raw, state.settings.markMax), skipped: (w.skipped.find((x) => x.id === s.id) || {}).reason || null });
      }
    }
    return out;
  }

  // --- Export CSV
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = {
    head: { team: 'Équipe', student: 'Étudiant', n: 'Évaluations reçues', mean: 'Moyenne', sd: 'Écart-type', self: 'Auto-évaluation', factor: 'Coefficient WebPA', teamMark: 'Note équipe', mark: 'Note individuelle', given: 'Évaluations données' },
    delimiter: ';', number: (n) => String(n).replace('.', ','), compare: undefined,
  };
  function csv(state, texts = DEFAULT_TEXTS) {
    const d = texts.delimiter === ',' ? ',' : ';', num = (x) => (x === null ? '' : texts.number(x));
    const h = texts.head;
    const head = [h.team, h.student, h.n, h.mean, h.sd, ...state.criteria.map((c) => c.name), h.self, h.given, h.factor, h.teamMark, h.mark];
    const rows = results(state, texts.compare).map((r) => [r.team, r.name, r.n, num(r.mean), num(r.sd), ...r.byCriterion.map(num), num(r.self), `${r.progress.done}/${r.progress.expected}`,
      num(r.factor), r.teamMark === null ? '' : num(r.teamMark / 100), r.mark === null ? '' : num(r.mark / 100)]);
    return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(d)).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'peerfeedbackform' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'settings', 'criteria', 'students', 'ratings', 'teamMarks'])) fail('err.backup');
    if (!isObj(data.settings) || !keysAre(data.settings, ['title', 'scaleMin', 'scaleMax', 'self', 'markMax'])) fail('err.backup');
    const settings = makeSettings(data.settings);
    if (!Array.isArray(data.criteria) || !Array.isArray(data.students) || !Array.isArray(data.ratings) || !isObj(data.teamMarks)) fail('err.backup');
    if (data.criteria.length > LIMITS.criteria) fail('err.criteriaMany', { max: LIMITS.criteria });
    if (data.students.length > LIMITS.students) fail('err.studentsMany', { max: LIMITS.students });
    const criteria = data.criteria.map((c) => { if (!isObj(c) || !keysAre(c, ['id', 'name'])) fail('err.backup'); return makeCriterion(c, c.id); });
    const students = data.students.map((s) => { if (!isObj(s) || !keysAre(s, ['id', 'name', 'team'])) fail('err.backup'); return makeStudent(s, s.id); });
    if (new Set(criteria.map((c) => c.id)).size !== criteria.length || new Set(students.map((s) => s.id)).size !== students.length) fail('err.backup');
    for (const tm of teams(students)) if (teammates(students, tm).length > LIMITS.teamSize) fail('err.teamSize', { max: LIMITS.teamSize });
    const base = { settings, criteria, students };
    const seen = new Set();
    const ratings = data.ratings.map((r) => {
      if (!isObj(r) || !keysAre(r, ['rater', 'ratee', 'scores'])) fail('err.backup');
      const k = r.rater + '>' + r.ratee; if (seen.has(k)) fail('err.backup'); seen.add(k);
      const x = makeRating(r, base); if (!Object.keys(x.scores).length) fail('err.backup'); return x;
    });
    const teamMarks = {}, known = new Set(teams(students));
    for (const [tm, h] of Object.entries(data.teamMarks)) {
      if (!known.has(tm) || !Number.isSafeInteger(h) || h < 0 || h > settings.markMax * 100) fail('err.backup');
      teamMarks[tm] = h;
    }
    return { settings, criteria, students, ratings, teamMarks };
  }
  function backup(state) {
    const clean = validateBackup({ app: 'peerfeedbackform', version: VERSION, settings: state.settings, criteria: state.criteria, students: state.students, ratings: state.ratings, teamMarks: state.teamMarks });
    return JSON.stringify({ app: 'peerfeedbackform', version: VERSION, ...clean }, null, 2);
  }
  // Nettoyage après suppression d'un critère ou d'un étudiant : notes orphelines retirées.
  function prune(state) {
    const cids = new Set(state.criteria.map((c) => c.id)), sids = new Map(state.students.map((s) => [s.id, s.team]));
    const ratings = state.ratings.map((r) => ({ ...r, scores: Object.fromEntries(Object.entries(r.scores).filter(([k]) => cids.has(k))) }))
      .filter((r) => sids.has(r.rater) && sids.has(r.ratee) && sids.get(r.rater) === sids.get(r.ratee) && Object.keys(r.scores).length);
    const live = new Set(sids.values());
    const teamMarks = Object.fromEntries(Object.entries(state.teamMarks).filter(([k]) => live.has(k)));
    return { ...state, ratings, teamMarks };
  }
  // Changement d'échelle refusé si des notes déjà saisies sortiraient de la nouvelle échelle.
  function changeSettings(state, settings) {
    const clean = makeSettings(settings);
    for (const r of state.ratings) for (const v of Object.values(r.scores)) if (v < clean.scaleMin || v > clean.scaleMax) fail('err.scaleConflict');
    for (const h of Object.values(state.teamMarks)) if (h > clean.markMax * 100) fail('err.markConflict');
    return { ...state, settings: clean };
  }

  root.PeerCore = Object.freeze({ VERSION, LIMITS, DEFAULT_SETTINGS, parseInt10, parseMark, makeSettings, makeCriterion, makeStudent, teams, teammates, targets, makeRating, setScore,
    complete, progress, received, webpa, individualMark, results, csv, csvCell, validateBackup, backup, prune, changeSettings });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PeerCore;
})(typeof window === 'undefined' ? globalThis : window);
