/* SurveyComposer — logique pure : structure d'un questionnaire, conditions d'affichage,
   contrôle de qualité, dictionnaire des codes, texte imprimable et sauvegarde.
   Aucune réponse n'est collectée ni envoyée : l'aperçu garde les réponses en mémoire seulement. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const TYPES = Object.freeze(['single', 'multiple', 'likert', 'text', 'number']);
  const LANGS = Object.freeze(['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']); // langue du questionnaire (pas de l'interface)
  // Opérateurs de condition permis selon le type de la question dont dépend l'affichage.
  const OPS = Object.freeze({
    single: ['eq', 'neq', 'answered'],
    multiple: ['includes', 'excludes', 'answered'],
    likert: ['eq', 'neq', 'gte', 'lte', 'answered'],
    number: ['eq', 'neq', 'gte', 'lte', 'answered'],
    text: ['answered'],
  });
  const LIMITS = Object.freeze({ surveys: 50, sections: 30, questions: 300, options: 50, title: 120, intro: 1000, text: 500, help: 300, label: 120, unit: 20, answer: 2000 });
  // Mots de coordination qui signalent souvent une question « double » (deux sujets en une seule question).
  const CONJUNCTIONS = Object.freeze({
    fr: ['et', 'ou'], en: ['and', 'or'], es: ['y', 'e', 'o', 'u'], pt: ['e', 'ou'],
    de: ['und', 'oder', 'sowie'], it: ['e', 'ed', 'o', 'oppure'], ar: ['و', 'أو'],
  });
  const ID_RE = /^[a-z0-9-]{6,64}$/i;
  const CODE_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/; // nom de variable accepté par SPSS, R, Stata

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function keysAre(o, list) { return isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(','); }

  function cleanText(v, max, errKey, { required = true } = {}) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\r\n?/g, '\n').trim();
    if (required && !s) fail(errKey + 'Required');
    if (s.length > max) fail(errKey + 'Long', { max });
    return s;
  }
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }

  // Nombre décimal saisi (« 2,5 » ou « 2.5 » ou « -3 ») ; vide -> null si autorisé.
  function parseNumber(value, errKey = 'err.number', { allowEmpty = false } = {}) {
    const s = String(value === undefined || value === null ? '' : value).trim().replace(/\s/g, '').replace(',', '.');
    if (!s) { if (allowEmpty) return null; fail(errKey); }
    if (!/^-?\d{1,9}(\.\d{1,6})?$/.test(s)) fail(errKey);
    return Number(s);
  }
  function parseIntStrict(value, min, max, errKey) {
    const s = String(value === undefined || value === null ? '' : value).trim();
    if (!/^-?\d{1,6}$/.test(s)) fail(errKey, { min, max });
    const n = Number(s);
    if (n < min || n > max) fail(errKey, { min, max });
    return n;
  }

  // Options « une par ligne » ; « 9 = Ne sait pas » fixe le code, sinon codes 1, 2, 3… (suite du plus grand code).
  function parseOptions(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    let next = 1;
    for (const line of lines) {
      const m = /^(-?\d{1,4})\s*[=:]\s*(.+)$/.exec(line);
      let value, label;
      if (m) { value = Number(m[1]); label = m[2].trim(); } else { value = next; label = line; }
      out.push({ value, label });
      next = Math.max(next, value + 1);
    }
    return validateOptions(out);
  }
  function validateOptions(options) {
    if (!Array.isArray(options)) fail('err.backup');
    if (options.length < 2) fail('err.optionsFew');
    if (options.length > LIMITS.options) fail('err.optionsMany', { max: LIMITS.options });
    const seenV = new Set(), seenL = new Set();
    return options.map((o) => {
      if (!keysAre(o, ['label', 'value'])) fail('err.backup');
      if (!Number.isInteger(o.value) || o.value < -9999 || o.value > 9999) fail('err.optionCode');
      const label = cleanText(o.label, LIMITS.label, 'err.option');
      if (seenV.has(o.value)) fail('err.optionCodeDup', { code: o.value });
      const norm = normalize(label);
      if (seenL.has(norm)) fail('err.optionLabelDup', { label });
      seenV.add(o.value); seenL.add(norm);
      return { value: o.value, label };
    });
  }
  const optionsToText = (options) => options.map((o) => `${o.value} = ${o.label}`).join('\n');

  // Échelle de Likert : nombre de points, premier code, libellés d'ancrage, item inversé.
  function validateScale(s) {
    if (!keysAre(s, ['maxLabel', 'midLabel', 'minLabel', 'points', 'reversed', 'start'])) fail('err.backup');
    if (!Number.isInteger(s.points) || s.points < 2 || s.points > 11) fail('err.points', { min: 2, max: 11 });
    if (s.start !== 0 && s.start !== 1) fail('err.start');
    if (typeof s.reversed !== 'boolean') fail('err.backup');
    const midLabel = cleanText(s.midLabel, LIMITS.label, 'err.anchor', { required: false });
    if (midLabel && s.points % 2 === 0) fail('err.midEven');
    return { points: s.points, start: s.start, minLabel: cleanText(s.minLabel, LIMITS.label, 'err.anchor', { required: false }), midLabel, maxLabel: cleanText(s.maxLabel, LIMITS.label, 'err.anchor', { required: false }), reversed: s.reversed };
  }
  const scaleValues = (s) => Array.from({ length: s.points }, (_, i) => s.start + i);

  function validateRange(r) {
    if (!keysAre(r, ['decimals', 'max', 'min', 'unit'])) fail('err.backup');
    for (const k of ['min', 'max']) if (r[k] !== null && (typeof r[k] !== 'number' || !Number.isFinite(r[k]) || Math.abs(r[k]) > 1e9)) fail('err.number');
    if (r.min !== null && r.max !== null && r.min >= r.max) fail('err.range');
    if (!Number.isInteger(r.decimals) || r.decimals < 0 || r.decimals > 4) fail('err.decimals', { min: 0, max: 4 });
    return { min: r.min, max: r.max, decimals: r.decimals, unit: cleanText(r.unit, LIMITS.unit, 'err.unit', { required: false }) };
  }

  // Question complète : structure stricte selon le type (aucun champ en trop).
  function makeQuestion(q) {
    if (!isObj(q)) fail('err.backup');
    checkId(q.id);
    if (!TYPES.includes(q.type)) fail('err.type');
    const extra = { single: 'options', multiple: 'options', likert: 'scale', number: 'range', text: 'long' }[q.type];
    if (!keysAre(q, ['code', 'condition', 'help', 'id', 'required', 'text', 'type', extra])) fail('err.backup');
    if (typeof q.code !== 'string' || !CODE_RE.test(q.code)) fail('err.code');
    if (typeof q.required !== 'boolean') fail('err.backup');
    const out = { id: q.id, code: q.code, text: cleanText(q.text, LIMITS.text, 'err.text'), help: cleanText(q.help, LIMITS.help, 'err.help', { required: false }), type: q.type, required: q.required, condition: null };
    if (q.condition !== null) {
      if (!keysAre(q.condition, ['op', 'question', 'value'])) fail('err.backup');
      checkId(q.condition.question);
      out.condition = { question: q.condition.question, op: String(q.condition.op), value: q.condition.value };
    }
    if (extra === 'options') out.options = validateOptions(q.options);
    else if (extra === 'scale') out.scale = validateScale(q.scale);
    else if (extra === 'range') out.range = validateRange(q.range);
    else { if (typeof q.long !== 'boolean') fail('err.backup'); out.long = q.long; }
    return out;
  }

  // Champs du formulaire (texte) -> question structurée. La condition est vérifiée plus tard, avec le questionnaire.
  function questionFromForm(f, id) {
    const type = f.type;
    if (!TYPES.includes(type)) fail('err.type');
    const q = { id, code: String(f.code || '').trim(), text: f.text, help: f.help || '', type, required: !!f.required, condition: null };
    if (f.condQuestion) {
      const op = String(f.condOp || '');
      let value = null;
      if (op !== 'answered') value = parseNumber(f.condValue, 'err.condValue');
      q.condition = { question: f.condQuestion, op, value };
    }
    if (type === 'single' || type === 'multiple') q.options = parseOptions(f.options);
    else if (type === 'likert') q.scale = { points: parseIntStrict(f.points, 2, 11, 'err.points'), start: f.start === '0' || f.start === 0 ? 0 : 1, minLabel: f.minLabel || '', midLabel: f.midLabel || '', maxLabel: f.maxLabel || '', reversed: !!f.reversed };
    else if (type === 'number') q.range = { min: parseNumber(f.min, 'err.number', { allowEmpty: true }), max: parseNumber(f.max, 'err.number', { allowEmpty: true }), decimals: parseIntStrict(f.decimals === undefined || f.decimals === '' ? '0' : f.decimals, 0, 4, 'err.decimals'), unit: f.unit || '' };
    else q.long = !!f.long;
    return q;
  }

  // --- Questionnaire
  function makeSection(s) {
    if (!keysAre(s, ['id', 'questions', 'title'])) fail('err.backup');
    if (!Array.isArray(s.questions)) fail('err.backup');
    return { id: checkId(s.id), title: cleanText(s.title, LIMITS.title, 'err.section'), questions: s.questions.map(makeQuestion) };
  }
  const orderedQuestions = (survey) => survey.sections.flatMap((s) => s.questions);

  // Vérifie l'ensemble : codes uniques, conditions vers une question PLUS HAUTE (donc jamais de boucle), valeurs cohérentes.
  function checkConditions(survey) {
    const seen = new Map(); // questions déjà rencontrées, dans l'ordre du questionnaire
    for (const q of orderedQuestions(survey)) {
      const c = q.condition;
      if (c) {
        const ref = seen.get(c.question);
        if (!ref) fail(c.question === q.id ? 'err.condSelf' : 'err.condOrder', { code: q.code });
        if (!OPS[ref.type].includes(c.op)) fail('err.condOp', { code: q.code });
        if (c.op === 'answered') { if (c.value !== null) fail('err.backup'); }
        else {
          if (typeof c.value !== 'number' || !Number.isFinite(c.value)) fail('err.condValue');
          if ((ref.type === 'single' || ref.type === 'multiple') && !ref.options.some((o) => o.value === c.value)) fail('err.condOption', { code: q.code, ref: ref.code });
          if (ref.type === 'likert' && !scaleValues(ref.scale).includes(c.value)) fail('err.condScale', { code: q.code, ref: ref.code });
        }
      }
      seen.set(q.id, q);
    }
  }
  function makeSurvey(s) {
    if (!keysAre(s, ['id', 'intro', 'lang', 'sections', 'title'])) fail('err.backup');
    if (!LANGS.includes(s.lang)) fail('err.lang');
    if (!Array.isArray(s.sections)) fail('err.backup');
    if (s.sections.length > LIMITS.sections) fail('err.sectionsMany', { max: LIMITS.sections });
    const survey = { id: checkId(s.id), title: cleanText(s.title, LIMITS.title, 'err.title'), intro: cleanText(s.intro, LIMITS.intro, 'err.intro', { required: false }), lang: s.lang, sections: s.sections.map(makeSection) };
    const qs = orderedQuestions(survey);
    if (qs.length > LIMITS.questions) fail('err.questionsMany', { max: LIMITS.questions });
    const ids = new Set(survey.sections.map((x) => x.id).concat(qs.map((q) => q.id)));
    if (ids.size !== survey.sections.length + qs.length) fail('err.backup');
    const codes = new Set();
    for (const q of qs) { const k = q.code.toLowerCase(); if (codes.has(k)) fail('err.codeDup', { code: q.code }); codes.add(k); }
    checkConditions(survey);
    return survey;
  }
  function newSurvey(title, id, lang, firstSectionTitle, sectionId) {
    return makeSurvey({ id, title, intro: '', lang, sections: [{ id: sectionId, title: firstSectionTitle, questions: [] }] });
  }
  // Code libre suivant (Q1, Q2…), sans collision avec les codes existants.
  function nextCode(survey) {
    const used = new Set(orderedQuestions(survey).map((q) => q.code.toLowerCase()));
    let i = orderedQuestions(survey).length + 1;
    while (used.has('q' + i)) i++;
    return 'Q' + i;
  }

  // Opérations : chacune renvoie un NOUVEAU questionnaire entièrement revalidé (ou lève une erreur, rien n'est modifié).
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function update(survey, patch) {
    const s = clone(survey);
    for (const k of ['title', 'intro', 'lang']) if (own(patch, k)) s[k] = patch[k];
    return makeSurvey(s);
  }
  function addSection(survey, title, id) {
    if (survey.sections.length >= LIMITS.sections) fail('err.sectionsMany', { max: LIMITS.sections });
    const s = clone(survey); s.sections.push({ id, title, questions: [] }); return makeSurvey(s);
  }
  function renameSection(survey, sectionId, title) {
    const s = clone(survey); const sec = s.sections.find((x) => x.id === sectionId); if (!sec) fail('err.notFound');
    sec.title = title; return makeSurvey(s);
  }
  function deleteSection(survey, sectionId) {
    const s = clone(survey); const sec = s.sections.find((x) => x.id === sectionId); if (!sec) fail('err.notFound');
    if (s.sections.length === 1) fail('err.lastSection');
    if (sec.questions.length) fail('err.sectionNotEmpty');
    s.sections = s.sections.filter((x) => x.id !== sectionId); return makeSurvey(s);
  }
  function moveSection(survey, sectionId, delta) {
    const s = clone(survey); const i = s.sections.findIndex((x) => x.id === sectionId); const j = i + delta;
    if (i < 0) fail('err.notFound'); if (j < 0 || j >= s.sections.length) return survey;
    [s.sections[i], s.sections[j]] = [s.sections[j], s.sections[i]];
    return makeSurvey(s); // refusé si une condition pointerait alors vers une question plus bas
  }
  // Ajoute ou remplace une question (même identifiant) dans la section voulue.
  function putQuestion(survey, sectionId, question) {
    const s = clone(survey);
    const target = s.sections.find((x) => x.id === sectionId); if (!target) fail('err.notFound');
    let replaced = false;
    for (const sec of s.sections) {
      const i = sec.questions.findIndex((q) => q.id === question.id);
      if (i < 0) continue;
      replaced = true;
      if (sec === target) sec.questions[i] = question; else { sec.questions.splice(i, 1); target.questions.push(question); }
    }
    if (!replaced) {
      if (orderedQuestions(s).length >= LIMITS.questions) fail('err.questionsMany', { max: LIMITS.questions });
      target.questions.push(question);
    }
    return makeSurvey(s);
  }
  function moveQuestion(survey, questionId, delta) {
    const s = clone(survey);
    const flat = []; s.sections.forEach((sec, si) => sec.questions.forEach((q, qi) => flat.push({ si, qi, q })));
    const k = flat.findIndex((x) => x.q.id === questionId); if (k < 0) fail('err.notFound');
    const sec = s.sections[flat[k].si], i = flat[k].qi, j = i + delta;
    if (j < 0 || j >= sec.questions.length) return survey; // on ne change pas de section par ce biais
    [sec.questions[i], sec.questions[j]] = [sec.questions[j], sec.questions[i]];
    return makeSurvey(s);
  }
  function deleteQuestion(survey, questionId) {
    const users = orderedQuestions(survey).filter((q) => q.condition && q.condition.question === questionId);
    if (users.length) fail('err.usedInCondition', { codes: users.map((q) => q.code).join(', ') });
    const s = clone(survey);
    for (const sec of s.sections) sec.questions = sec.questions.filter((q) => q.id !== questionId);
    return makeSurvey(s);
  }

  // --- Conditions d'affichage (aperçu). Réponse : code (choix unique, Likert), liste de codes (multiple), nombre ou texte.
  function isAnswered(q, a) {
    if (a === undefined || a === null) return false;
    if (q.type === 'multiple') return Array.isArray(a) && a.length > 0;
    if (q.type === 'text') return typeof a === 'string' && a.trim() !== '';
    return typeof a === 'number' && Number.isFinite(a);
  }
  function testCondition(c, ref, a) {
    if (!isAnswered(ref, a)) return false; // sans réponse : la question dépendante reste masquée
    switch (c.op) {
      case 'answered': return true;
      case 'eq': return a === c.value;
      case 'neq': return a !== c.value;
      case 'gte': return a >= c.value;
      case 'lte': return a <= c.value;
      case 'includes': return a.includes(c.value);
      case 'excludes': return !a.includes(c.value);
      default: return false;
    }
  }
  // Identifiants des questions visibles, dans l'ordre. Une question masquée masque aussi celles qui en dépendent.
  function visibleIds(survey, answers) {
    const visible = new Set(), byId = new Map();
    for (const q of orderedQuestions(survey)) {
      byId.set(q.id, q);
      const c = q.condition;
      if (!c || (visible.has(c.question) && testCondition(c, byId.get(c.question), answers[c.question]))) visible.add(q.id);
    }
    return visible;
  }
  // Contrôle des réponses de l'aperçu : obligatoires manquantes, nombres hors bornes ou trop de décimales.
  function checkAnswers(survey, answers) {
    const vis = visibleIds(survey, answers), problems = [];
    for (const q of orderedQuestions(survey)) {
      if (!vis.has(q.id)) continue;
      const a = answers[q.id];
      if (!isAnswered(q, a)) { if (q.required) problems.push({ id: q.id, code: q.code, key: 'ans.required' }); continue; }
      if (q.type === 'number') {
        const r = q.range;
        if ((r.min !== null && a < r.min) || (r.max !== null && a > r.max)) problems.push({ id: q.id, code: q.code, key: 'ans.range' });
        else if (Math.round(a * 10 ** r.decimals) / 10 ** r.decimals !== a) problems.push({ id: q.id, code: q.code, key: 'ans.decimals', params: { n: r.decimals } });
      }
      if (q.type === 'text' && a.length > LIMITS.answer) problems.push({ id: q.id, code: q.code, key: 'ans.long' });
    }
    return problems;
  }
  // Réponses de l'aperçu sans les questions masquées (ce que contiendrait une ligne de données).
  function cleanAnswers(survey, answers) {
    const vis = visibleIds(survey, answers), out = {};
    for (const q of orderedQuestions(survey)) if (vis.has(q.id) && isAnswered(q, answers[q.id])) out[q.code] = answers[q.id];
    return out;
  }

  // --- Contrôle de qualité (heuristiques : des signaux à vérifier, pas des verdicts)
  function normalize(s) {
    return String(s).normalize('NFD').replace(/[̀-ًͯ-ْ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  const words = (s) => String(s).toLowerCase().split(/[^\p{L}\p{M}\p{N}'’]+/u).filter(Boolean);
  function quality(survey) {
    const issues = [];
    const qs = orderedQuestions(survey);
    const conj = CONJUNCTIONS[survey.lang] || [];
    // Doublons : même texte une fois accents, ponctuation et casse retirés.
    const seen = new Map();
    for (const q of qs) {
      const k = normalize(q.text);
      if (seen.has(k)) issues.push({ level: 'warn', key: 'qc.duplicate', params: { a: seen.get(k).code, b: q.code }, id: q.id });
      else seen.set(k, q);
    }
    for (const q of qs) {
      // Question double : un mot de coordination ou plusieurs points d'interrogation.
      const w = words(q.text).find((x) => conj.includes(x));
      if (w) issues.push({ level: 'warn', key: 'qc.double', params: { code: q.code, word: w }, id: q.id });
      else if ((q.text.match(/[?؟]/g) || []).length > 1) issues.push({ level: 'warn', key: 'qc.twoMarks', params: { code: q.code }, id: q.id });
      if (q.text.length > 140) issues.push({ level: 'info', key: 'qc.long', params: { code: q.code, n: q.text.length }, id: q.id });
      if (q.type === 'likert' && (!q.scale.minLabel || !q.scale.maxLabel)) issues.push({ level: 'warn', key: 'qc.anchorsMissing', params: { code: q.code }, id: q.id });
      if (q.condition) {
        const ref = qs.find((x) => x.id === q.condition.question);
        if (ref && !ref.required) issues.push({ level: 'info', key: 'qc.condOptional', params: { code: q.code, ref: ref.code }, id: q.id });
      }
    }
    // Échelles incohérentes dans une même section (une batterie d'items doit garder la même échelle).
    const sig = (s) => `${s.points}|${s.start}`;
    const anchors = (s) => `${normalize(s.minLabel)}|${normalize(s.midLabel)}|${normalize(s.maxLabel)}`;
    const allSigs = new Set();
    for (const sec of survey.sections) {
      if (!sec.questions.length) { issues.push({ level: 'warn', key: 'qc.emptySection', params: { section: sec.title } }); continue; }
      const lk = sec.questions.filter((q) => q.type === 'likert');
      lk.forEach((q) => allSigs.add(q.scale.points));
      if (lk.length < 2) continue;
      const groups = new Map();
      for (const q of lk) { const k = sig(q.scale); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
      if (groups.size > 1) {
        const detail = [...groups.values()].map((g) => ({ points: g[0].scale.points, start: g[0].scale.start, codes: g.map((q) => q.code) }));
        issues.push({ level: 'warn', key: 'qc.scaleMix', params: { section: sec.title }, detail });
        continue;
      }
      if (new Set(lk.map((q) => anchors(q.scale))).size > 1) issues.push({ level: 'warn', key: 'qc.anchorMix', params: { section: sec.title, codes: lk.map((q) => q.code).join(', ') } });
      const rev = lk.filter((q) => q.scale.reversed);
      if (rev.length) issues.push({ level: 'info', key: 'qc.reversed', params: { codes: rev.map((q) => q.code).join(', ') } });
    }
    if (allSigs.size > 1) issues.push({ level: 'info', key: 'qc.scaleSurvey', params: { list: [...allSigs].sort((a, b) => a - b).join(', ') } });
    return issues;
  }

  // --- Dictionnaire des codes : une ligne par valeur codée (l'interface traduit types, opérateurs et oui/non).
  function codebook(survey) {
    const rows = [], byId = new Map(orderedQuestions(survey).map((q) => [q.id, q]));
    for (const sec of survey.sections) {
      for (const q of sec.questions) {
        const base = { section: sec.title, code: q.code, text: q.text, type: q.type, required: q.required, condition: q.condition ? { ref: byId.get(q.condition.question).code, op: q.condition.op, value: q.condition.value } : null };
        if (q.options) q.options.forEach((o) => rows.push({ ...base, value: o.value, label: o.label, note: '' }));
        else if (q.scale) scaleValues(q.scale).forEach((v, i, all) => {
          const label = i === 0 ? q.scale.minLabel : i === all.length - 1 ? q.scale.maxLabel : (q.scale.midLabel && i === (all.length - 1) / 2 ? q.scale.midLabel : '');
          rows.push({ ...base, value: v, label, note: q.scale.reversed ? 'reversed' : '' });
        });
        else if (q.range) rows.push({ ...base, value: '', label: '', note: 'range', range: q.range });
        else rows.push({ ...base, value: '', label: '', note: q.long ? 'long' : 'short' });
      }
    }
    return rows;
  }
  // CSV (RFC 4180) : guillemets doublés, champs entre guillemets si besoin ; neutralise les formules de tableur.
  function csvCell(v, sep) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(rows, sep = ',') {
    if (sep !== ',' && sep !== ';' && sep !== '\t') fail('err.sep');
    return rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join('\r\n') + '\r\n';
  }

  // --- Texte imprimable. tr(clé, paramètres) fournit les consignes dans la langue du questionnaire.
  function printable(survey, tr, fmtNumber = String) {
    const out = [], qs = orderedQuestions(survey), num = new Map(qs.map((q, i) => [q.id, i + 1]));
    out.push(survey.title.toUpperCase(), '='.repeat(Math.min(60, Math.max(8, survey.title.length))));
    if (survey.intro) out.push('', survey.intro);
    for (const sec of survey.sections) {
      out.push('', '', sec.title, '-'.repeat(Math.min(60, Math.max(4, sec.title.length))));
      for (const q of sec.questions) {
        out.push('');
        if (q.condition) {
          const ref = qs.find((x) => x.id === q.condition.question);
          let val = '';
          if (q.condition.op !== 'answered') {
            const opt = ref.options && ref.options.find((o) => o.value === q.condition.value);
            val = opt ? `« ${opt.label} »` : fmtNumber(q.condition.value);
          }
          out.push(`  [${tr('print.if', { n: num.get(ref.id), cond: tr('op.' + q.condition.op, { value: val }) })}]`);
        }
        out.push(`${num.get(q.id)}. ${q.text}${q.required ? ' *' : ''}`);
        if (q.help) out.push(`   (${q.help})`);
        if (q.type === 'single' || q.type === 'multiple') {
          out.push(`   ${tr(q.type === 'single' ? 'print.one' : 'print.many')}`);
          for (const o of q.options) out.push(`   ${q.type === 'single' ? '○' : '☐'} ${o.label}`);
        } else if (q.type === 'likert') {
          out.push('   ' + scaleValues(q.scale).map((v) => `${v} ○`).join('   '));
          const ends = [];
          if (q.scale.minLabel) ends.push(`${q.scale.start} = ${q.scale.minLabel}`);
          if (q.scale.midLabel) ends.push(`${q.scale.start + (q.scale.points - 1) / 2} = ${q.scale.midLabel}`);
          if (q.scale.maxLabel) ends.push(`${q.scale.start + q.scale.points - 1} = ${q.scale.maxLabel}`);
          if (ends.length) out.push(`   (${ends.join(' ; ')})`);
        } else if (q.type === 'number') {
          const r = q.range, lim = [];
          if (r.min !== null) lim.push(tr('print.min', { v: fmtNumber(r.min) }));
          if (r.max !== null) lim.push(tr('print.max', { v: fmtNumber(r.max) }));
          out.push(`   __________ ${r.unit}${lim.length ? `   (${lim.join(', ')})` : ''}`.replace(/\s+$/, ''));
        } else {
          out.push('   ' + '_'.repeat(50));
          if (q.long) out.push('   ' + '_'.repeat(50), '   ' + '_'.repeat(50));
        }
      }
    }
    out.push('', '', tr('print.required'));
    return out.join('\n') + '\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'surveycomposer' || data.version !== VERSION || !Array.isArray(data.surveys)) fail('err.notBackup');
    if (!keysAre(data, ['app', 'surveys', 'version'])) fail('err.backup');
    if (data.surveys.length > LIMITS.surveys) fail('err.surveysMany', { max: LIMITS.surveys });
    const surveys = data.surveys.map(makeSurvey);
    if (new Set(surveys.map((s) => s.id)).size !== surveys.length) fail('err.backup');
    return surveys;
  }
  function backup(surveys) { return JSON.stringify({ app: 'surveycomposer', version: VERSION, surveys: validateBackup({ app: 'surveycomposer', version: VERSION, surveys }) }, null, 2); }

  root.SurveyCore = Object.freeze({
    VERSION, TYPES, LANGS, OPS, LIMITS, CONJUNCTIONS, parseNumber, parseOptions, optionsToText, scaleValues, makeQuestion, questionFromForm,
    makeSurvey, newSurvey, nextCode, orderedQuestions, update, addSection, renameSection, deleteSection, moveSection, putQuestion, moveQuestion, deleteQuestion,
    isAnswered, visibleIds, checkAnswers, cleanAnswers, quality, normalize, codebook, toCSV, printable, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SurveyCore;
})(typeof window === 'undefined' ? globalThis : window);
