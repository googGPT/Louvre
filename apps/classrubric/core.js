/* ClassRubric — logique pure : grilles critériées (critères, niveaux, pondérations), note sur un barème choisi,
   statistiques de classe, export CSV et sauvegarde. Aucune dépendance au navigateur.
   La note est calculée en fractions exactes (BigInt) puis arrondie une seule fois au pas choisi. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({ rubrics: 50, criteria: 20, levelsMin: 2, levelsMax: 6, evaluations: 2000, name: 80, descriptor: 300, comment: 1000, weight: 100, points: 100, scale: 1000 });
  // Pas d'arrondi de la note finale, en centièmes de point (« 0.5 » = au demi-point le plus proche).
  const STEPS = Object.freeze({ '1': 100, '0.5': 50, '0.25': 25, '0.1': 10, '0.01': 1 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | »).
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; }

  // Texte obligatoire (ou facultatif) borné en longueur.
  function cleanText(v, max, requiredKey, longKey) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail(requiredKey || longKey);
    const s = v.trim();
    if (requiredKey && !s) fail(requiredKey);
    if (s.length > max) fail(longKey, { max });
    return s;
  }
  // Entier saisi (« 3 », 3) borné ; refuse « 2,5 », « -1 », « abc ».
  function cleanInt(v, min, max, key) {
    const s = typeof v === 'number' ? String(v) : String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,7}$/.test(s)) fail(key, { min, max });
    const n = Number(s);
    if (n < min || n > max) fail(key, { min, max });
    return n;
  }

  // --- Modèle
  function makeLevel(input) {
    if (!isObj(input)) fail('err.backup');
    return {
      id: checkId(input.id),
      label: cleanText(input.label, LIMITS.name, 'err.levelLabel', 'err.textLong'),
      points: cleanInt(input.points, 0, LIMITS.points, 'err.points'),
      descriptor: cleanText(input.descriptor, LIMITS.descriptor, null, 'err.textLong'),
    };
  }
  function makeCriterion(input) {
    if (!isObj(input) || !Array.isArray(input.levels)) fail('err.backup');
    const name = cleanText(input.name, LIMITS.name, 'err.criterionName', 'err.textLong');
    const weight = cleanInt(input.weight, 1, LIMITS.weight, 'err.weight');
    if (input.levels.length < LIMITS.levelsMin || input.levels.length > LIMITS.levelsMax) fail('err.levelCount', { min: LIMITS.levelsMin, max: LIMITS.levelsMax });
    const levels = input.levels.map(makeLevel);
    if (new Set(levels.map((l) => l.id)).size !== levels.length) fail('err.id');
    if (Math.max(...levels.map((l) => l.points)) <= 0) fail('err.levelMax');
    return { id: checkId(input.id), name, weight, levels };
  }
  function makeRubric(input) {
    if (!isObj(input)) fail('err.backup');
    const criteria = input.criteria === undefined ? [] : input.criteria;
    if (!Array.isArray(criteria)) fail('err.backup');
    if (criteria.length > LIMITS.criteria) fail('err.tooManyCriteria', { max: LIMITS.criteria });
    const step = input.step === undefined ? '0.5' : String(input.step);
    if (!Object.prototype.hasOwnProperty.call(STEPS, step)) fail('err.step');
    const list = criteria.map(makeCriterion);
    if (new Set(list.map((c) => c.id)).size !== list.length) fail('err.id');
    return {
      id: checkId(input.id),
      name: cleanText(input.name, LIMITS.name, 'err.rubricName', 'err.textLong'),
      scale: cleanInt(input.scale === undefined ? 20 : input.scale, 1, LIMITS.scale, 'err.scale'),
      step, criteria: list,
    };
  }
  // Une copie évaluée : un niveau choisi (ou aucun) par critère de la grille.
  function makeEvaluation(input, rubric) {
    if (!isObj(input)) fail('err.backup');
    const choices = input.choices === undefined ? {} : input.choices;
    if (!isObj(choices)) fail('err.backup');
    const out = {};
    for (const [cid, lid] of Object.entries(choices)) {
      const c = rubric.criteria.find((x) => x.id === cid);
      if (!c || typeof lid !== 'string' || !c.levels.some((l) => l.id === lid)) fail('err.choice');
      out[cid] = lid;
    }
    return {
      id: checkId(input.id), rubricId: rubric.id,
      student: cleanText(input.student, LIMITS.name, 'err.student', 'err.textLong'),
      choices: out, comment: cleanText(input.comment, LIMITS.comment, null, 'err.textLong'),
    };
  }
  // Après modification de la grille : retire les choix qui ne correspondent plus à un niveau existant.
  function prune(evaluation, rubric) {
    const choices = {};
    for (const c of rubric.criteria) {
      const lid = evaluation.choices[c.id];
      if (lid && c.levels.some((l) => l.id === lid)) choices[c.id] = lid;
    }
    return { ...evaluation, choices };
  }

  // --- Calcul de la note
  const maxPoints = (c) => Math.max(...c.levels.map((l) => l.points));
  const big = (n) => BigInt(n);
  function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a < 0n ? -a : a; }
  // Arrondi au plus proche (demi vers le haut) de a / b pour a ≥ 0, b > 0.
  const roundDiv = (a, b) => (2n * a + b) / (2n * b);

  // Note = barème × Σ(poids × points obtenus / points max) / Σ poids, arrondie au pas choisi.
  function evaluate(rubric, choices) {
    const rows = [], missing = [];
    let num = 0n, den = 1n, totalWeight = 0;
    for (const c of rubric.criteria) {
      totalWeight += c.weight;
      const level = c.levels.find((l) => l.id === (choices || {})[c.id]);
      const max = maxPoints(c);
      if (!level) { missing.push(c.id); rows.push({ criterionId: c.id, level: null, max, weight: c.weight, shareH: null }); continue; }
      // num/den += poids × points / max (fraction réduite à chaque étape)
      num = num * big(max) + big(c.weight * level.points) * den; den *= big(max);
      const g = gcd(num, den); if (g > 1n) { num /= g; den /= g; }
      rows.push({ criterionId: c.id, level, max, weight: c.weight, shareH: 0 }); // part calculée plus bas
    }
    const complete = rubric.criteria.length > 0 && missing.length === 0;
    let scoreH = null;
    if (complete) {
      const stepH = STEPS[rubric.step];
      const units = roundDiv(big(rubric.scale * 100) * num, den * big(totalWeight) * big(stepH));
      scoreH = Number(units) * stepH; // note en centièmes de point (1450 = 14,50)
    }
    // Part de la note apportée par chaque critère noté, en centièmes de point (affichage seulement).
    for (const r of rows) if (r.shareH !== null) r.shareH = Number(roundDiv(big(rubric.scale * 100 * r.weight * r.level.points), big(r.max * totalWeight)));
    return { complete, missing, rows, scoreH, totalWeight };
  }

  // --- Statistiques de la classe (copies complètes seulement)
  function stats(rubric, evaluations) {
    const own = evaluations.filter((e) => e.rubricId === rubric.id);
    const results = own.map((e) => ({ e, r: evaluate(rubric, e.choices) }));
    const done = results.filter((x) => x.r.complete);
    const scores = done.map((x) => x.r.scoreH).sort((a, b) => a - b);
    const n = scores.length;
    const sum = scores.reduce((a, b) => a + b, 0);
    const median = !n ? null : n % 2 ? scores[(n - 1) / 2] : Math.round((scores[n / 2 - 1] + scores[n / 2]) / 2);
    // Réussite moyenne par critère : moyenne de points/max sur les copies où le critère est noté, en pour mille.
    const byCriterion = rubric.criteria.map((c) => {
      const max = maxPoints(c);
      const pts = results.map((x) => x.r.rows.find((row) => row.criterionId === c.id)).filter((row) => row && row.level).map((row) => row.level.points);
      return { criterionId: c.id, count: pts.length, permille: pts.length ? Math.round(1000 * pts.reduce((a, b) => a + b, 0) / (pts.length * max)) : null };
    });
    return { total: own.length, complete: n, incomplete: own.length - n, meanH: n ? Math.round(sum / n) : null, medianH: median, minH: n ? scores[0] : null, maxH: n ? scores[n - 1] : null, byCriterion };
  }

  // --- Export CSV (une ligne par copie). `texts` fournit les en-têtes traduits et le format des nombres.
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // un tableur n'exécutera pas une formule importée
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const DEFAULT_TEXTS = {
    head: { student: 'Étudiant', score: 'Note', scale: 'Barème', status: 'Statut', comment: 'Commentaire' },
    complete: 'complète', incomplete: 'incomplète', delimiter: ';',
    number: (n) => String(n).replace('.', ','), compare: (a, b) => a.localeCompare(b, 'fr'),
  };
  function csv(rubric, evaluations, texts = DEFAULT_TEXTS) {
    const d = texts.delimiter === ',' ? ',' : ';';
    const head = [texts.head.student, ...rubric.criteria.map((c) => `${c.name} (×${c.weight})`), texts.head.score, texts.head.scale, texts.head.status, texts.head.comment];
    const rows = evaluations.filter((e) => e.rubricId === rubric.id).slice().sort((a, b) => texts.compare(a.student, b.student)).map((e) => {
      const r = evaluate(rubric, e.choices);
      return [e.student, ...r.rows.map((row) => (row.level ? `${row.level.label} (${row.level.points}/${row.max})` : '')),
        r.complete ? texts.number(r.scoreH / 100) : '', rubric.scale, r.complete ? texts.complete : texts.incomplete, e.comment];
    });
    return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(d)).join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'classrubric' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'rubrics', 'evaluations']) || !Array.isArray(data.rubrics) || !Array.isArray(data.evaluations)) fail('err.backup');
    if (data.rubrics.length > LIMITS.rubrics) fail('err.tooManyRubrics', { max: LIMITS.rubrics });
    if (data.evaluations.length > LIMITS.evaluations) fail('err.tooManyEvaluations', { max: LIMITS.evaluations });
    const rubrics = data.rubrics.map((r) => {
      if (!isObj(r) || !keysAre(r, ['id', 'name', 'scale', 'step', 'criteria']) || !Array.isArray(r.criteria)) fail('err.backup');
      if (typeof r.scale !== 'number' || typeof r.step !== 'string') fail('err.backup');
      for (const c of r.criteria) {
        if (!isObj(c) || !keysAre(c, ['id', 'name', 'weight', 'levels']) || typeof c.weight !== 'number' || !Array.isArray(c.levels)) fail('err.backup');
        for (const l of c.levels) if (!isObj(l) || !keysAre(l, ['id', 'label', 'points', 'descriptor']) || typeof l.points !== 'number') fail('err.backup');
      }
      return makeRubric(r);
    });
    if (new Set(rubrics.map((r) => r.id)).size !== rubrics.length) fail('err.backup');
    const evaluations = data.evaluations.map((e) => {
      if (!isObj(e) || !keysAre(e, ['id', 'rubricId', 'student', 'choices', 'comment'])) fail('err.backup');
      const rubric = rubrics.find((r) => r.id === e.rubricId);
      if (!rubric) fail('err.backup');
      return makeEvaluation(e, rubric);
    });
    if (new Set(evaluations.map((e) => e.id)).size !== evaluations.length) fail('err.backup');
    return { rubrics, evaluations };
  }
  function backup(state) {
    const clean = validateBackup({ app: 'classrubric', version: VERSION, rubrics: state.rubrics, evaluations: state.evaluations });
    return JSON.stringify({ app: 'classrubric', version: VERSION, ...clean }, null, 2);
  }

  root.RubricCore = Object.freeze({ VERSION, LIMITS, STEPS, makeLevel, makeCriterion, makeRubric, makeEvaluation, prune, maxPoints, evaluate, stats, csv, csvCell, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RubricCore;
})(typeof window === 'undefined' ? globalThis : window);
