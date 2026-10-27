/* SurveyComposer — interface. Logique dans core.js (SurveyCore) ; textes dans LouvreI18n.
   Les textes destinés aux répondants (aperçu, version imprimable) suivent la langue du questionnaire. */
(() => {
  'use strict';
  const C = window.SurveyCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue de l'interface et traductions
  const t = L.t;
  const KEY = 'louvre-surveycomposer-v1'; // clé de stockage local
  const ACTIVE = 'louvre-surveycomposer-active'; // questionnaire affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = (p) => p + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* confort seulement */ } };

  let surveys = []; // questionnaires enregistrés
  let activeId = null; // questionnaire affiché
  let readOnly = false; // stockage illisible : aucune écriture
  let editingId = null; // question en cours de modification (null : nouvelle question)
  let answers = {}; // réponses de l'aperçu, en mémoire seulement (jamais enregistrées ni envoyées)

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const active = () => surveys.find((s) => s.id === activeId) || null;

  // Traduction dans une autre langue que celle de l'interface (langue du questionnaire).
  function tIn(lang) {
    const M = window.LouvreMessages;
    return (key, params) => {
      let s = (M[lang] && M[lang][key]) !== undefined ? M[lang][key] : (M.fr[key] !== undefined ? M.fr[key] : key);
      return String(s).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? String(params[k]) : m));
    };
  }
  const fmtIn = (lang) => (n) => new Intl.NumberFormat(L.LANGS[lang].locale, { maximumFractionDigits: 6 }).format(n);

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); surveys = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Applique une opération du moteur au questionnaire affiché ; renvoie true si c'est enregistré.
  function change(fn, statusId) {
    const cur = active(); if (!cur) return false;
    try { const next = fn(cur); return save(surveys.map((s) => (s.id === cur.id ? next : s))); }
    catch (e) { say(statusId, L.error(e), 'error'); return false; }
  }

  // --- Menus déroulants : valeur choisie conservée lors d'un changement de langue
  function options(sel, list) {
    const cur = sel.value;
    sel.replaceChildren(...list.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    if (list.some(([v]) => v === cur)) sel.value = cur;
  }
  const short = (s, n = 50) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function renderSurveyBar() {
    options($('survey-select'), surveys.map((s) => [s.id, `${s.title} (${C.orderedQuestions(s).length})`]));
    if (activeId) $('survey-select').value = activeId;
    const cur = active();
    for (const b of ['rename-survey', 'delete-survey']) $(b).disabled = !cur;
    $('editor').hidden = !cur;
    $('no-survey').hidden = !!cur;
    options($('survey-lang'), C.LANGS.map((l) => [l, L.LANGS[l].name]));
    if (cur) $('survey-lang').value = cur.lang;
  }
  // Champs du questionnaire : remplis seulement au changement de questionnaire (une saisie en cours n'est pas écrasée).
  function fillSurveyFields() {
    const cur = active();
    $('survey-title').value = cur ? cur.title : '';
    $('survey-intro').value = cur ? cur.intro : '';
    answers = {};
    resetForm();
  }

  // --- Structure : sections et questions
  function typeLabel(q) { return t('type.' + q.type) + (q.type === 'likert' ? ` ${q.scale.points}` : ''); }
  function condText(s, q) {
    const c = q.condition; if (!c) return '';
    const ref = C.orderedQuestions(s).find((x) => x.id === c.question);
    let val = '';
    if (c.op !== 'answered') { const o = ref.options && ref.options.find((x) => x.value === c.value); val = o ? `« ${o.label} »` : L.number(c.value); }
    return t('cond.tag', { ref: ref.code, cond: t('op.' + c.op, { value: val }) });
  }
  function iconBtn(text, label, onClick, disabled = false) {
    const b = el('button', 'btn small', text); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.disabled = disabled;
    b.addEventListener('click', onClick); return b;
  }
  function renderStructure() {
    const s = active(), box = $('sections');
    if (!s) { box.replaceChildren(); return; }
    box.replaceChildren(...s.sections.map((sec, si) => {
      const wrap = el('section', 'sec'), head = el('div', 'sec-head');
      head.append(el('h3', '', sec.title));
      const acts = el('div', 'acts');
      acts.append(
        iconBtn('✎', t('aria.renameSection', { name: sec.title }), () => renameSection(sec)),
        iconBtn('↑', t('aria.upSection', { name: sec.title }), () => { if (change((x) => C.moveSection(x, sec.id, -1), 'structure-status')) render(); }, si === 0),
        iconBtn('↓', t('aria.downSection', { name: sec.title }), () => { if (change((x) => C.moveSection(x, sec.id, 1), 'structure-status')) render(); }, si === s.sections.length - 1),
        iconBtn('✕', t('aria.deleteSection', { name: sec.title }), () => { if (confirm(t('confirm.deleteSection', { name: sec.title })) && change((x) => C.deleteSection(x, sec.id), 'structure-status')) { say('structure-status', ''); render(); } }));
      head.append(acts); wrap.append(head);
      const ul = el('ul', 'qlist');
      if (!sec.questions.length) ul.append(el('li', 'empty small', t('sec.empty')));
      sec.questions.forEach((q, qi) => {
        const li = el('li', editingId === q.id ? 'editing' : ''), txt = el('div', 'txt');
        txt.append(el('b', '', `${q.code} · ${q.text}`));
        const tags = el('div', 'tags');
        tags.append(el('span', 'tag', typeLabel(q)));
        if (q.required) tags.append(el('span', 'tag req', t('tag.required')));
        if (q.condition) tags.append(el('span', 'tag cond', condText(s, q)));
        if (q.type === 'likert' && q.scale.reversed) tags.append(el('span', 'tag', t('tag.reversed')));
        txt.append(tags);
        const a = el('div', 'acts');
        a.append(
          iconBtn('✎', t('aria.edit', { code: q.code }), () => startEdit(q.id)),
          iconBtn('↑', t('aria.up', { code: q.code }), () => { if (change((x) => C.moveQuestion(x, q.id, -1), 'structure-status')) render(); }, qi === 0),
          iconBtn('↓', t('aria.down', { code: q.code }), () => { if (change((x) => C.moveQuestion(x, q.id, 1), 'structure-status')) render(); }, qi === sec.questions.length - 1),
          iconBtn('✕', t('aria.delete', { code: q.code }), () => {
            if (!confirm(t('confirm.deleteQuestion', { code: q.code }))) return;
            if (change((x) => C.deleteQuestion(x, q.id), 'structure-status')) { if (editingId === q.id) resetForm(); delete answers[q.id]; say('structure-status', t('q.deleted', { code: q.code }), 'ok'); render(); }
          }));
        li.append(txt, a); ul.append(li);
      });
      wrap.append(ul); return wrap;
    }));
  }
  function renameSection(sec) {
    const name = prompt(t('prompt.section'), sec.title); if (name === null) return;
    if (change((x) => C.renameSection(x, sec.id, name), 'structure-status')) render();
  }

  // --- Formulaire de question
  const f = () => $('q-form');
  function showTypeFields() {
    const type = f().type.value;
    document.querySelectorAll('[data-for]').forEach((n) => { n.hidden = !n.dataset.for.split(' ').includes(type); });
    $('mid-hint').hidden = type !== 'likert' || Number(f().points.value) % 2 === 1;
    f().midLabel.disabled = Number(f().points.value) % 2 === 0;
  }
  function renderFormSelects() {
    const s = active(); if (!s) return;
    options(f().section, s.sections.map((sec) => [sec.id, sec.title]));
    options(f().type, C.TYPES.map((x) => [x, t('type.' + x)]));
    options(f().points, Array.from({ length: 10 }, (_, i) => [String(i + 2), String(i + 2)]));
    options(f().start, [['1', t('start.one')], ['0', t('start.zero')]]);
    options(f().decimals, ['0', '1', '2', '3', '4'].map((d) => [d, d]));
    // Conditions : seulement les questions situées avant celle en cours (ou toutes, pour une nouvelle question).
    const qs = C.orderedQuestions(s), stop = editingId ? qs.findIndex((q) => q.id === editingId) : qs.length;
    options(f().condQuestion, [['', t('cond.none')], ...qs.slice(0, stop < 0 ? qs.length : stop).map((q) => [q.id, `${q.code} · ${short(q.text, 40)}`])]);
    renderCondFields();
    f().code.placeholder = editingId ? '' : C.nextCode(s);
  }
  function renderCondFields() {
    const s = active(), ref = s && C.orderedQuestions(s).find((q) => q.id === f().condQuestion.value);
    $('cond-detail').hidden = !ref;
    if (!ref) return;
    options(f().condOp, C.OPS[ref.type].map((op) => [op, t('opname.' + op)]));
    const needs = f().condOp.value !== 'answered';
    const choices = ref.options ? ref.options.map((o) => [String(o.value), `${o.value} · ${o.label}`]) : ref.scale ? C.scaleValues(ref.scale).map((v) => [String(v), String(v)]) : null;
    $('cond-value-sel-wrap').hidden = !needs || !choices;
    $('cond-value-num-wrap').hidden = !needs || !!choices;
    if (choices) options(f().condValueSel, choices);
  }
  function resetForm() {
    editingId = null;
    const form = f();
    form.reset();
    form.points.value = '5';
    $('q-form-title').textContent = t('form.newTitle');
    $('save-q').textContent = t('btn.addQuestion');
    $('cancel-q').hidden = true;
    renderFormSelects(); showTypeFields();
  }
  function startEdit(qid) {
    const s = active(), sec = s.sections.find((x) => x.questions.some((q) => q.id === qid)), q = sec.questions.find((x) => x.id === qid);
    editingId = qid;
    f().reset();
    renderFormSelects();
    const form = f();
    form.section.value = sec.id; form.type.value = q.type; form.code.value = q.code; form.text.value = q.text; form.help.value = q.help; form.required.checked = q.required;
    form.options.value = q.options ? C.optionsToText(q.options) : '';
    if (q.scale) { form.points.value = String(q.scale.points); form.start.value = String(q.scale.start); form.minLabel.value = q.scale.minLabel; form.midLabel.value = q.scale.midLabel; form.maxLabel.value = q.scale.maxLabel; form.reversed.checked = q.scale.reversed; }
    if (q.range) { form.min.value = q.range.min === null ? '' : String(q.range.min); form.max.value = q.range.max === null ? '' : String(q.range.max); form.decimals.value = String(q.range.decimals); form.unit.value = q.range.unit; }
    if (q.type === 'text') form.long.checked = q.long;
    form.condQuestion.value = q.condition ? q.condition.question : '';
    renderCondFields();
    if (q.condition) {
      form.condOp.value = q.condition.op; renderCondFields();
      if (q.condition.value !== null) { form.condValueSel.value = String(q.condition.value); form.condValueNum.value = String(q.condition.value); }
    }
    $('q-form-title').textContent = t('form.editTitle', { code: q.code });
    $('save-q').textContent = t('btn.saveQuestion');
    $('cancel-q').hidden = false;
    showTypeFields(); renderStructure();
    say('form-status', '');
    form.text.focus();
  }
  f().type.addEventListener('change', showTypeFields);
  f().points.addEventListener('change', showTypeFields);
  f().condQuestion.addEventListener('change', renderCondFields);
  f().condOp.addEventListener('change', renderCondFields);
  $('cancel-q').addEventListener('click', () => { resetForm(); renderStructure(); say('form-status', ''); });
  f().addEventListener('submit', (event) => {
    event.preventDefault();
    const s = active(); if (!s) return;
    const form = f();
    try {
      const condHasChoices = !$('cond-value-sel-wrap').hidden;
      const q = C.questionFromForm({
        type: form.type.value, code: form.code.value.trim() || (editingId ? '' : C.nextCode(s)), text: form.text.value, help: form.help.value, required: form.required.checked,
        options: form.options.value, points: form.points.value, start: form.start.value, minLabel: form.minLabel.value, midLabel: form.points.value % 2 ? form.midLabel.value : '', maxLabel: form.maxLabel.value, reversed: form.reversed.checked,
        min: form.min.value, max: form.max.value, decimals: form.decimals.value, unit: form.unit.value, long: form.long.checked,
        condQuestion: form.condQuestion.value, condOp: form.condOp.value, condValue: condHasChoices ? form.condValueSel.value : form.condValueNum.value,
      }, editingId || newId('q-'));
      const wasEdit = !!editingId;
      if (!change((x) => C.putQuestion(x, form.section.value, q), 'form-status')) return;
      say('form-status', t(wasEdit ? 'q.updated' : 'q.added', { code: q.code }), 'ok');
      const keepSection = form.section.value, keepType = form.type.value;
      resetForm();
      form.section.value = keepSection; form.type.value = keepType; showTypeFields();
      render();
      form.text.focus();
    } catch (e) { say('form-status', L.error(e), 'error'); }
  });

  // --- Contrôle de qualité
  function renderQuality() {
    const s = active(), ul = $('quality');
    if (!s) { ul.replaceChildren(); return; }
    const issues = C.quality(s);
    $('quality-summary').textContent = issues.length ? t('qc.count', { n: issues.length }) : t('qc.none');
    ul.replaceChildren(...issues.map((i) => {
      const li = el('li', i.level);
      li.append(el('span', 'lvl', t('lvl.' + i.level)));
      const txt = el('span', '', t(i.key, i.params));
      if (i.detail) txt.append(el('span', 'detail', ' ' + i.detail.map((d) => t('qc.scaleGroup', { points: d.points, start: d.start, codes: d.codes.join(', ') })).join(' · ')));
      li.append(txt);
      if (i.id) { const b = iconBtn(t('btn.fix'), t('aria.edit', { code: (C.orderedQuestions(s).find((q) => q.id === i.id) || {}).code || '' }), () => startEdit(i.id)); li.append(b); }
      return li;
    }));
  }

  // --- Aperçu interactif (langue du questionnaire ; réponses en mémoire seulement)
  function renderPreview() {
    const s = active(), box = $('preview');
    if (!s) { box.replaceChildren(); return; }
    const tr = tIn(s.lang);
    box.lang = s.lang; box.dir = L.LANGS[s.lang].dir;
    const parts = [el('h3', 'pv-title', s.title)];
    if (s.intro) parts.push(el('p', 'pv-intro', s.intro));
    if (!C.orderedQuestions(s).length) parts.push(el('p', 'empty', t('preview.empty')));
    let n = 0;
    for (const sec of s.sections) {
      if (!sec.questions.length) continue;
      parts.push(el('h4', 'pv-sec', sec.title));
      for (const q of sec.questions) {
        n++;
        const fs = el('fieldset', 'pv-q'); fs.dataset.qid = q.id;
        const lg = el('legend', '', `${n}. ${q.text}`);
        if (q.required) { const star = el('span', 'star', ' *'); star.title = tr('pv.required'); lg.append(star); }
        fs.append(lg);
        if (q.help) fs.append(el('p', 'pv-help', q.help));
        fs.append(answerWidget(q, tr, s.lang));
        fs.append(el('p', 'pv-err'));
        parts.push(fs);
      }
    }
    parts.push(el('p', 'pv-note', tr('pv.requiredNote')));
    box.replaceChildren(...parts);
    applyVisibility();
  }
  function answerWidget(q, tr, lang) {
    const name = 'pv-' + q.id, wrap = el('div', 'pv-a');
    const radio = (type, value, label, checked) => {
      const lab = el('label', 'pv-opt'), inp = el('input'); inp.type = type; inp.name = name; inp.value = String(value); inp.checked = checked;
      lab.append(inp, el('span', '', label)); return lab;
    };
    if (q.type === 'single' || q.type === 'multiple') {
      wrap.append(el('p', 'pv-help', tr(q.type === 'single' ? 'print.one' : 'print.many')));
      const cur = answers[q.id];
      for (const o of q.options) wrap.append(radio(q.type === 'single' ? 'radio' : 'checkbox', o.value, o.label, q.type === 'single' ? cur === o.value : Array.isArray(cur) && cur.includes(o.value)));
      wrap.addEventListener('change', () => {
        const checked = [...wrap.querySelectorAll('input:checked')].map((i) => Number(i.value));
        answers[q.id] = q.type === 'single' ? (checked.length ? checked[0] : null) : checked;
        applyVisibility();
      });
    } else if (q.type === 'likert') {
      const row = el('div', 'pv-likert');
      C.scaleValues(q.scale).forEach((v, i, all) => {
        const lab = i === 0 ? q.scale.minLabel : i === all.length - 1 ? q.scale.maxLabel : (q.scale.midLabel && i === (all.length - 1) / 2 ? q.scale.midLabel : '');
        const opt = radio('radio', v, String(v), answers[q.id] === v); opt.classList.add('lk');
        if (lab) opt.append(el('small', '', lab));
        row.append(opt);
      });
      wrap.append(row);
      wrap.addEventListener('change', () => { const c = wrap.querySelector('input:checked'); answers[q.id] = c ? Number(c.value) : null; applyVisibility(); });
    } else if (q.type === 'number') {
      const inp = el('input'); inp.inputMode = 'decimal'; inp.name = name; inp.setAttribute('aria-label', q.text); inp.dir = 'ltr';
      if (typeof answers[q.id] === 'number') inp.value = fmtIn(lang)(answers[q.id]).replace(/\s/g, '');
      const r = q.range, lim = [];
      if (r.min !== null) lim.push(tr('print.min', { v: fmtIn(lang)(r.min) }));
      if (r.max !== null) lim.push(tr('print.max', { v: fmtIn(lang)(r.max) }));
      const line = el('div', 'pv-num'); line.append(inp); if (r.unit) line.append(el('span', '', r.unit));
      wrap.append(line); if (lim.length) wrap.append(el('p', 'pv-help', lim.join(', ')));
      inp.addEventListener('input', () => {
        let v = null;
        try { v = C.parseNumber(inp.value, 'err.number', { allowEmpty: true }); } catch (_) { v = NaN; }
        answers[q.id] = v; applyVisibility();
      });
    } else {
      const inp = el(q.long ? 'textarea' : 'input'); inp.name = name; inp.maxLength = C.LIMITS.answer; inp.setAttribute('aria-label', q.text);
      inp.value = typeof answers[q.id] === 'string' ? answers[q.id] : '';
      inp.addEventListener('input', () => { answers[q.id] = inp.value; applyVisibility(); });
      wrap.append(inp);
    }
    return wrap;
  }
  function applyVisibility() {
    const s = active(); if (!s) return;
    const vis = C.visibleIds(s, answers);
    document.querySelectorAll('#preview .pv-q').forEach((fs) => { fs.hidden = !vis.has(fs.dataset.qid); });
    const total = C.orderedQuestions(s).length;
    $('preview-count').textContent = t('preview.count', { n: vis.size, total });
  }
  $('check-answers').addEventListener('click', () => {
    const s = active(); if (!s) return;
    const tr = tIn(s.lang);
    document.querySelectorAll('#preview .pv-err').forEach((p) => { p.textContent = ''; });
    const problems = C.checkAnswers(s, Object.fromEntries(Object.entries(answers).filter(([, v]) => !(typeof v === 'number' && Number.isNaN(v)))));
    for (const [qid, v] of Object.entries(answers)) if (typeof v === 'number' && Number.isNaN(v)) problems.push({ id: qid, key: 'ans.number' });
    for (const p of problems) { const fs = document.querySelector(`#preview .pv-q[data-qid="${p.id}"] .pv-err`); if (fs) fs.textContent = tr(p.key, p.params); }
    if (problems.length) say('preview-status', t('preview.problems', { n: problems.length }), 'error');
    else say('preview-status', t('preview.ok', { n: Object.keys(C.cleanAnswers(s, answers)).length }), 'ok');
  });
  $('reset-answers').addEventListener('click', () => { answers = {}; renderPreview(); say('preview-status', ''); });

  function render() { renderSurveyBar(); renderStructure(); renderFormSelects(); showTypeFields(); renderQuality(); renderPreview(); }

  // --- Questionnaires : création, renommage, suppression, réglages
  function createSurvey(title) {
    if (surveys.length >= C.LIMITS.surveys) throw new Error(`err.surveysMany|${JSON.stringify({ max: C.LIMITS.surveys })}`);
    const s = C.newSurvey(title, newId('s-'), L.lang, t('sec.defaultTitle'), newId('sec-'));
    if (!save([...surveys, s])) return null;
    activeId = s.id; safeSet(ACTIVE, activeId); return s;
  }
  $('new-survey').addEventListener('click', () => {
    const name = prompt(t('prompt.newSurvey'), t('survey.newDefault', { n: surveys.length + 1 })); if (name === null) return;
    try { if (createSurvey(name)) { fillSurveyFields(); render(); say('survey-status', t('survey.created'), 'ok'); } } catch (e) { say('survey-status', L.error(e), 'error'); }
  });
  $('rename-survey').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.renameSurvey'), cur.title); if (name === null) return;
    if (change((x) => C.update(x, { title: name }), 'survey-status')) { $('survey-title').value = active().title; render(); }
  });
  $('delete-survey').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.deleteSurvey', { name: cur.title, n: C.orderedQuestions(cur).length }))) return;
    if (save(surveys.filter((s) => s.id !== cur.id))) { activeId = surveys[0] ? surveys[0].id : null; fillSurveyFields(); render(); }
  });
  $('survey-select').addEventListener('change', (e) => { activeId = e.target.value; safeSet(ACTIVE, activeId); fillSurveyFields(); render(); });
  $('survey-title').addEventListener('input', () => { if (change((x) => C.update(x, { title: $('survey-title').value }), 'survey-status')) { say('survey-status', ''); renderSurveyBar(); renderPreview(); } });
  $('survey-intro').addEventListener('input', () => { if (change((x) => C.update(x, { intro: $('survey-intro').value }), 'survey-status')) { say('survey-status', ''); renderPreview(); } });
  $('survey-lang').addEventListener('change', () => { if (change((x) => C.update(x, { lang: $('survey-lang').value }), 'survey-status')) render(); });
  $('add-section').addEventListener('click', () => {
    const name = prompt(t('prompt.section'), t('sec.newDefault', { n: active().sections.length + 1 })); if (name === null) return;
    if (change((x) => C.addSection(x, name, newId('sec-')), 'structure-status')) { say('structure-status', t('sec.added', { name: name.trim() }), 'ok'); render(); }
  });

  // --- Exemple (généré dans la langue affichée, avec deux défauts volontaires pour le contrôle de qualité)
  $('sample').addEventListener('click', () => {
    try {
      const s0 = createSurvey(t('sample.title')); if (!s0) return;
      let s = C.update(s0, { intro: t('sample.intro') });
      const sec1 = s.sections[0].id, sec2 = newId('sec-');
      s = C.renameSection(s, sec1, t('sample.sec1'));
      s = C.addSection(s, t('sample.sec2'), sec2);
      const q = {};
      const put = (sec, key, form) => { q[key] = newId('q-'); s = C.putQuestion(s, sec, C.questionFromForm({ code: C.nextCode(s), ...form }, q[key])); };
      const agree = { minLabel: t('sample.disagree'), maxLabel: t('sample.agree') };
      put(sec1, 'status', { type: 'single', text: t('sample.q1'), options: t('sample.q1opts'), required: true });
      put(sec1, 'year', { type: 'number', text: t('sample.q2'), min: '1', max: '8', decimals: '0', required: true, condQuestion: q.status, condOp: 'eq', condValue: '1' });
      put(sec1, 'tools', { type: 'multiple', text: t('sample.q3'), options: t('sample.q3opts') });
      put(sec2, 'l1', { type: 'likert', text: t('sample.q4'), points: '5', start: '1', ...agree, required: true });
      put(sec2, 'l2', { type: 'likert', text: t('sample.q5'), points: '5', start: '1', ...agree, required: true });
      put(sec2, 'l3', { type: 'likert', text: t('sample.q6'), points: '7', start: '1', ...agree });
      put(sec2, 'why', { type: 'text', text: t('sample.q7'), long: true, condQuestion: q.l1, condOp: 'lte', condValue: '2' });
      if (!save(surveys.map((x) => (x.id === s.id ? s : x)))) return;
      fillSurveyFields(); render();
      say('survey-status', t('sample.added'), 'ok');
    } catch (e) { say('survey-status', L.error(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileBase = (s) => (C.normalize(s.title).replace(/\s+/g, '-').slice(0, 40) || 'survey');
  $('export-csv').addEventListener('click', () => {
    const s = active(); if (!s) return;
    try {
      const yes = t('csv.yes'), no = t('csv.no');
      const head = ['section', 'code', 'question', 'type', 'value', 'label', 'required', 'condition', 'note'].map((k) => t('csv.' + k));
      const rows = C.codebook(s).map((r) => {
        let note = '';
        if (r.note === 'reversed') note = t('csv.noteReversed');
        else if (r.note === 'range') { const parts = []; if (r.range.min !== null) parts.push(`min ${r.range.min}`); if (r.range.max !== null) parts.push(`max ${r.range.max}`); parts.push(t('csv.decimals', { n: r.range.decimals })); if (r.range.unit) parts.push(r.range.unit); note = parts.join(' ; '); }
        else if (r.note === 'long') note = t('csv.noteLong');
        else if (r.note === 'short') note = t('csv.noteShort');
        const cond = r.condition ? `${r.condition.ref} ${t('opsym.' + r.condition.op)}${r.condition.value !== null ? ' ' + r.condition.value : ''}` : '';
        return [r.section, r.code, r.text, t('type.' + r.type), r.value, r.label, r.required ? yes : no, cond, note];
      });
      download(`${fileBase(s)}-codebook.csv`, '﻿' + C.toCSV([head, ...rows], $('csv-sep').value), 'text/csv;charset=utf-8');
      say('export-status', t('export.csvDone', { n: rows.length }), 'ok');
    } catch (e) { say('export-status', L.error(e), 'error'); }
  });
  const printableText = (s) => C.printable(s, tIn(s.lang), fmtIn(s.lang));
  $('export-txt').addEventListener('click', () => {
    const s = active(); if (!s) return;
    download(`${fileBase(s)}.txt`, printableText(s), 'text/plain;charset=utf-8');
    say('export-status', t('export.txtDone'), 'ok');
  });
  $('print').addEventListener('click', () => {
    const s = active(); if (!s) return;
    const area = $('print-area'); area.lang = s.lang; area.dir = L.LANGS[s.lang].dir;
    area.textContent = printableText(s);
    window.print();
  });
  $('export').addEventListener('click', () => {
    try { download('surveycomposer-backup.json', C.backup(surveys), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: surveys.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      activeId = next[0] ? next[0].id : null; safeSet(ACTIVE, activeId || '');
      $('warning').hidden = true; $('export-raw').hidden = true;
      fillSurveyFields(); render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('surveycomposer-raw-storage.txt', safeGet(KEY) || '', 'text/plain'));

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) surveys = C.validateBackup(JSON.parse(raw));
    const last = safeGet(ACTIVE);
    activeId = surveys.some((s) => s.id === last) ? last : (surveys[0] ? surveys[0].id : null);
  } catch (e) {
    readOnly = true; surveys = []; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const id of ['survey-status', 'structure-status', 'form-status', 'preview-status', 'export-status']) say(id, ''); render(); if (!editingId) { $('q-form-title').textContent = t('form.newTitle'); $('save-q').textContent = t('btn.addQuestion'); } else { $('q-form-title').textContent = t('form.editTitle', { code: f().code.value }); $('save-q').textContent = t('btn.saveQuestion'); } });
  fillSurveyFields();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
