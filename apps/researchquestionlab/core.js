/* ResearchQuestionLab — logique pure : structure d'un projet de recherche (problème, lacune, questions,
   variables, hypothèses, cadre) et liste de contrôle calculée. Aucun contenu n'est généré : l'outil vérifie
   seulement la structure de ce que l'utilisateur écrit. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const GAP_TYPES = Object.freeze(['empirical', 'theoretical', 'methodological', 'population', 'contextual', 'contradictory']);
  const Q_KINDS = Object.freeze(['descriptive', 'comparative', 'relational', 'causal', 'exploratory']);
  const ROLES = Object.freeze(['dependent', 'independent', 'moderator', 'mediator', 'control']);
  const DIRECTIONS = Object.freeze(['positive', 'negative', 'difference', 'nondirectional']);
  const MANUAL = Object.freeze(['dataAccess', 'ethics', 'feasible']); // points confirmés par l'utilisateur
  const NEEDS_HYPOTHESIS = Object.freeze(['comparative', 'relational', 'causal']); // questions qui appellent une hypothèse testable
  const LIMITS = Object.freeze({ projects: 30, questions: 10, variables: 30, hypotheses: 20, title: 120, long: 3000, short: 300, name: 80 });
  const MIN_YEAR = 1800, MAX_YEAR = 2100;
  const ID = /^[a-z0-9-]{6,64}$/i;
  const FIELDS = ['id', 'title', 'problem', 'gap', 'gapType', 'objective', 'questions', 'variables', 'hypotheses', 'population', 'unit', 'periodStart', 'periodEnd', 'dataSource', 'method', 'checks'];

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const checkId = (id) => { if (typeof id !== 'string' || !ID.test(id)) fail('err.id'); return id; };
  function text(v, max, errKey, required) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.text');
    const s = v.replace(/\r\n?/g, '\n').trim();
    if (required && !s) fail(errKey);
    if (s.length > max) fail('err.tooLong', { max });
    return s;
  }
  function oneOf(v, list, errKey, allowEmpty) {
    if (allowEmpty && (v === '' || v === undefined || v === null)) return '';
    if (!list.includes(v)) fail(errKey);
    return v;
  }
  function year(v) {
    if (v === '' || v === undefined || v === null) return null;
    const s = String(v).trim();
    if (!/^\d{4}$/.test(s) || Number(s) < MIN_YEAR || Number(s) > MAX_YEAR) fail('err.year', { min: MIN_YEAR, max: MAX_YEAR });
    return Number(s);
  }

  // --- Éléments
  function makeQuestion(input, id) {
    if (!isObj(input)) fail('err.backup');
    return { id: checkId(id), text: text(input.text, LIMITS.short, 'err.questionRequired', true), kind: oneOf(input.kind, Q_KINDS, 'err.kind') };
  }
  function makeVariable(input, id) {
    if (!isObj(input)) fail('err.backup');
    return {
      id: checkId(id), name: text(input.name, LIMITS.name, 'err.nameRequired', true), role: oneOf(input.role, ROLES, 'err.role'),
      measure: text(input.measure, LIMITS.short, '', false), source: text(input.source, LIMITS.short, '', false),
    };
  }
  function makeHypothesis(input, id, project) {
    if (!isObj(input)) fail('err.backup');
    const h = {
      id: checkId(id), questionId: String(input.questionId || ''), ivId: String(input.ivId || ''), dvId: String(input.dvId || ''),
      direction: oneOf(input.direction, DIRECTIONS, 'err.direction'), text: text(input.text, LIMITS.short, 'err.hypothesisRequired', true),
    };
    if (!project.questions.some((q) => q.id === h.questionId)) fail('err.hypothesisQuestion');
    if (h.ivId && !project.variables.some((v) => v.id === h.ivId)) fail('err.unknownVariable');
    if (h.dvId && !project.variables.some((v) => v.id === h.dvId)) fail('err.unknownVariable');
    if (h.ivId && h.ivId === h.dvId) fail('err.sameVariable');
    return h;
  }

  function emptyProject(id, title) {
    return makeProject({ title }, id);
  }
  // Projet complet validé champ par champ ; les références entre éléments doivent exister.
  function makeProject(input, id) {
    if (!isObj(input)) fail('err.backup');
    const checks = {};
    const given = isObj(input.checks) ? input.checks : {};
    for (const k of Object.keys(given)) if (!MANUAL.includes(k) || typeof given[k] !== 'boolean') fail('err.backup');
    for (const k of MANUAL) checks[k] = given[k] === true;
    const arr = (v, max, key) => { const a = v === undefined ? [] : v; if (!Array.isArray(a)) fail('err.backup'); if (a.length > max) fail(key, { max }); return a; };
    const p = {
      id: checkId(id),
      title: text(input.title, LIMITS.title, 'err.titleRequired', true),
      problem: text(input.problem, LIMITS.long, '', false),
      gap: text(input.gap, LIMITS.long, '', false),
      gapType: oneOf(input.gapType, GAP_TYPES, 'err.gapType', true),
      objective: text(input.objective, LIMITS.long, '', false),
      questions: [], variables: [], hypotheses: [],
      population: text(input.population, LIMITS.short, '', false),
      unit: text(input.unit, LIMITS.short, '', false),
      periodStart: year(input.periodStart),
      periodEnd: year(input.periodEnd),
      dataSource: text(input.dataSource, LIMITS.short, '', false),
      method: text(input.method, LIMITS.short, '', false),
      checks,
    };
    if (p.periodStart !== null && p.periodEnd !== null && p.periodStart > p.periodEnd) fail('err.period');
    p.questions = arr(input.questions, LIMITS.questions, 'err.tooManyQuestions').map((q) => makeQuestion(q, q && q.id));
    p.variables = arr(input.variables, LIMITS.variables, 'err.tooManyVariables').map((v) => makeVariable(v, v && v.id));
    p.hypotheses = arr(input.hypotheses, LIMITS.hypotheses, 'err.tooManyHypotheses').map((h) => makeHypothesis(h, h && h.id, p));
    for (const list of [p.questions, p.variables, p.hypotheses]) if (new Set(list.map((x) => x.id)).size !== list.length) fail('err.backup');
    if (p.variables.some((v, i) => p.variables.findIndex((w) => w.name.toLowerCase() === v.name.toLowerCase()) !== i)) fail('err.variableDuplicate');
    return p;
  }

  // --- Modifications (renvoient un nouveau projet validé)
  const update = (p, patch) => makeProject({ ...p, ...patch }, p.id);
  function upsert(list, item) { return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]; }
  function saveQuestion(p, input, id) { return update(p, { questions: upsert(p.questions, makeQuestion(input, id)) }); }
  function saveVariable(p, input, id) { return update(p, { variables: upsert(p.variables, makeVariable(input, id)) }); }
  function saveHypothesis(p, input, id) { return update(p, { hypotheses: upsert(p.hypotheses, makeHypothesis(input, id, p)) }); }
  // Supprimer une question supprime ses hypothèses ; supprimer une variable la retire des hypothèses (lien à refaire).
  function removeQuestion(p, id) { return update(p, { questions: p.questions.filter((q) => q.id !== id), hypotheses: p.hypotheses.filter((h) => h.questionId !== id) }); }
  function removeVariable(p, id) {
    return update(p, {
      variables: p.variables.filter((v) => v.id !== id),
      hypotheses: p.hypotheses.map((h) => ({ ...h, ivId: h.ivId === id ? '' : h.ivId, dvId: h.dvId === id ? '' : h.dvId })),
    });
  }
  function removeHypothesis(p, id) { return update(p, { hypotheses: p.hypotheses.filter((h) => h.id !== id) }); }

  // --- Liste de contrôle : chaque point vaut ok, todo (manquant) ou warn (présent mais à revoir).
  const isQuestion = (s) => /[?？؟]\s*$/.test(s);
  function checklist(p) {
    const items = [];
    const add = (key, status, params) => items.push(params ? { key, status, params } : { key, status });
    const needH = p.questions.filter((q) => NEEDS_HYPOTHESIS.includes(q.kind));
    const roleIds = (roles) => p.variables.filter((v) => roles.includes(v.role)).map((v) => v.id);
    add('problem', p.problem.length >= 40 ? 'ok' : p.problem ? 'warn' : 'todo');
    add('gap', p.gap && p.gapType ? 'ok' : p.gap || p.gapType ? 'warn' : 'todo');
    add('objective', p.objective ? 'ok' : 'todo');
    add('questions', !p.questions.length ? 'todo' : p.questions.length > 5 ? 'warn' : 'ok', { n: p.questions.length });
    const notQ = p.questions.filter((q) => !isQuestion(q.text)).length;
    add('questionForm', !p.questions.length ? 'todo' : notQ ? 'warn' : 'ok', { n: notQ });
    add('dependent', roleIds(['dependent']).length ? 'ok' : 'todo');
    add('independent', roleIds(['independent']).length ? 'ok' : needH.length ? 'todo' : p.variables.length ? 'ok' : 'todo');
    const noMeasure = p.variables.filter((v) => !v.measure).length;
    add('measures', !p.variables.length ? 'todo' : noMeasure ? 'warn' : 'ok', { n: noMeasure });
    const noSource = p.variables.filter((v) => !v.source).length;
    add('sources', !p.variables.length ? 'todo' : noSource ? 'warn' : 'ok', { n: noSource });
    const withoutH = needH.filter((q) => !p.hypotheses.some((h) => h.questionId === q.id)).length;
    add('hypotheses', !needH.length ? 'ok' : withoutH ? 'todo' : 'ok', { n: withoutH });
    // Une hypothèse testable relie une cause (indépendante, modératrice, médiatrice) à une variable dépendante.
    const dv = roleIds(['dependent']), iv = roleIds(['independent', 'moderator', 'mediator']);
    const badLinks = p.hypotheses.filter((h) => !iv.includes(h.ivId) || !dv.includes(h.dvId)).length;
    add('hypothesisLinks', !p.hypotheses.length ? (needH.length ? 'todo' : 'ok') : badLinks ? 'warn' : 'ok', { n: badLinks });
    const unused = p.variables.filter((v) => v.role !== 'control' && !p.hypotheses.some((h) => h.ivId === v.id || h.dvId === v.id)).length;
    add('unusedVariables', !p.hypotheses.length || !unused ? 'ok' : 'warn', { n: unused });
    add('population', p.population ? 'ok' : 'todo');
    add('unit', p.unit ? 'ok' : 'todo');
    add('period', p.periodStart !== null && p.periodEnd !== null ? 'ok' : p.periodStart !== null || p.periodEnd !== null ? 'warn' : 'todo');
    add('dataSource', p.dataSource ? 'ok' : 'todo');
    add('method', p.method ? 'ok' : 'todo');
    for (const k of MANUAL) add(k, p.checks[k] ? 'ok' : 'todo');
    const ok = items.filter((i) => i.status === 'ok').length;
    return { items, ok, total: items.length, pct: Math.round(100 * ok / items.length) };
  }

  // --- Export Markdown : tr(clé, params) fournit les textes traduits (titres, libellés des listes).
  function toMarkdown(p, tr) {
    const out = [`# ${p.title}`, ''];
    const section = (key, body) => { out.push(`## ${tr(key)}`, '', body || `_${tr('md.empty')}_`, ''); };
    section('md.problem', p.problem);
    section('md.gap', p.gap ? (p.gapType ? `**${tr('gap.' + p.gapType)}** — ${p.gap}` : p.gap) : '');
    section('md.objective', p.objective);
    const qNum = (id) => p.questions.findIndex((q) => q.id === id) + 1;
    const vName = (id) => (p.variables.find((v) => v.id === id) || {}).name || '?';
    section('md.questions', p.questions.map((q, i) => `${i + 1}. **Q${i + 1}** (${tr('kind.' + q.kind)}) ${q.text}`).join('\n'));
    section('md.variables', p.variables.length ? [`| ${tr('md.var')} | ${tr('md.role')} | ${tr('md.measure')} | ${tr('md.source')} |`, '| --- | --- | --- | --- |',
      ...p.variables.map((v) => `| ${[v.name, tr('role.' + v.role), v.measure, v.source].map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`)].join('\n') : '');
    section('md.hypotheses', p.hypotheses.map((h, i) => `- **H${i + 1}** (Q${qNum(h.questionId)}) ${h.text}  \n  ${h.ivId ? vName(h.ivId) : '?'} → ${h.dvId ? vName(h.dvId) : '?'} · ${tr('dir.' + h.direction)}`).join('\n'));
    const period = p.periodStart !== null || p.periodEnd !== null ? `${p.periodStart ?? '?'}–${p.periodEnd ?? '?'}` : '';
    section('md.design', [['md.population', p.population], ['md.unit', p.unit], ['md.period', period], ['md.dataSource', p.dataSource], ['md.method', p.method]]
      .map(([k, v]) => `- **${tr(k)}** : ${v || '—'}`).join('\n'));
    const c = checklist(p);
    section('md.checklist', [`${tr('md.score', { ok: c.ok, total: c.total })}`, '', ...c.items.map((i) => `- [${i.status === 'ok' ? 'x' : ' '}] ${tr('chk.' + i.key)}${i.status === 'warn' ? ` (${tr('status.warn')})` : ''}`)].join('\n'));
    return out.join('\n').replace(/\n+$/, '\n');
  }

  // --- Sauvegarde : { app, version, projects }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'researchquestionlab' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'projects']) || !Array.isArray(data.projects)) fail('err.backup');
    if (data.projects.length > LIMITS.projects) fail('err.tooManyProjects', { max: LIMITS.projects });
    const projects = data.projects.map((p) => {
      if (!isObj(p) || !keysAre(p, FIELDS)) fail('err.backup');
      for (const q of p.questions || []) if (!isObj(q) || !keysAre(q, ['id', 'text', 'kind'])) fail('err.backup');
      for (const v of p.variables || []) if (!isObj(v) || !keysAre(v, ['id', 'name', 'role', 'measure', 'source'])) fail('err.backup');
      for (const h of p.hypotheses || []) if (!isObj(h) || !keysAre(h, ['id', 'questionId', 'ivId', 'dvId', 'direction', 'text'])) fail('err.backup');
      if ((p.periodStart !== null && !Number.isInteger(p.periodStart)) || (p.periodEnd !== null && !Number.isInteger(p.periodEnd))) fail('err.backup');
      return makeProject(p, p.id);
    });
    if (new Set(projects.map((p) => p.id)).size !== projects.length) fail('err.backup');
    return projects;
  }
  function backup(projects) { return JSON.stringify({ app: 'researchquestionlab', version: VERSION, projects: validateBackup({ app: 'researchquestionlab', version: VERSION, projects: JSON.parse(JSON.stringify(projects)) }) }, null, 2); }

  root.RQCore = Object.freeze({
    VERSION, GAP_TYPES, Q_KINDS, ROLES, DIRECTIONS, MANUAL, NEEDS_HYPOTHESIS, LIMITS, emptyProject, makeProject, update,
    saveQuestion, saveVariable, saveHypothesis, removeQuestion, removeVariable, removeHypothesis, checklist, toMarkdown, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RQCore;
})(typeof window === 'undefined' ? globalThis : window);
