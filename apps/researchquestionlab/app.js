/* ResearchQuestionLab — interface. Validation et liste de contrôle dans core.js (RQCore) ; textes dans LouvreI18n.
   L'outil ne rédige rien à la place de l'utilisateur : il guide et vérifie la structure. */
(() => {
  'use strict';
  const C = window.RQCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-researchquestionlab-v1'; // clé de stockage local
  const ACTIVE = 'louvre-researchquestionlab-active'; // projet affiché (confort)
  const STEP = 'louvre-researchquestionlab-step'; // étape affichée (confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = (p) => p + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* confort seulement */ } };
  // Étape où se corrige chaque point de la liste de contrôle.
  const CHK_STEP = { problem: 1, gap: 2, objective: 3, questions: 3, questionForm: 3, dependent: 4, independent: 4, measures: 4, sources: 4, hypotheses: 5, hypothesisLinks: 5, unusedVariables: 5, population: 6, unit: 6, period: 6, dataSource: 6, method: 6, dataAccess: 6, ethics: 6, feasible: 6 };

  let projects = [];
  let activeId = null;
  let readOnly = false;
  let step = Math.min(7, Math.max(1, Number(safeGet(STEP)) || 1));
  const editing = { q: null, v: null, h: null }; // élément en cours de modification dans chaque formulaire

  function say(id, text, kind = '') { const n = typeof id === 'string' ? $(id) : id; n.textContent = text; n.className = n.className.replace(/\s*\b(ok|error)\b/g, '') + (kind ? ' ' + kind : ''); }
  const active = () => projects.find((p) => p.id === activeId) || null;
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); projects = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  const replace = (p) => save(projects.map((x) => (x.id === p.id ? p : x)));
  const qLabel = (p, id) => { const i = p.questions.findIndex((q) => q.id === id); return i < 0 ? '?' : `Q${i + 1}`; };
  const vName = (p, id) => (p.variables.find((v) => v.id === id) || {}).name || t('h.toLink');

  // --- Menus déroulants (les valeurs choisies sont conservées lors d'un changement de langue)
  function options(sel, list, keep = true) {
    const cur = sel.value;
    sel.replaceChildren(...list.map(([v, txt]) => { const o = el('option', '', txt); o.value = v; return o; }));
    if (keep && list.some(([v]) => v === cur)) sel.value = cur;
  }
  function renderSelects() {
    const p = active();
    options($('gap-type'), [['', t('gap.none')], ...C.GAP_TYPES.map((g) => [g, t('gap.' + g)])]);
    if (p) $('gap-type').value = p.gapType;
    $('gap-help').textContent = p && p.gapType ? t('gaphelp.' + p.gapType) : t('gaphelp.none');
    options($('q-kind'), C.Q_KINDS.map((k) => [k, t('kind.' + k)]));
    $('kind-help').textContent = t('kindhelp.' + $('q-kind').value);
    options($('v-role'), C.ROLES.map((r) => [r, t('role.' + r)]));
    options($('h-dir'), C.DIRECTIONS.map((d) => [d, t('dir.' + d)]));
    const qs = p ? p.questions : [], vs = p ? p.variables : [];
    options($('h-question'), qs.map((q, i) => [q.id, `Q${i + 1} · ${q.text.length > 60 ? q.text.slice(0, 57) + '…' : q.text}`]));
    const vOpt = (v) => [v.id, `${v.name} (${t('role.' + v.role)})`];
    options($('h-iv'), [['', t('h.toLink')], ...vs.filter((v) => v.role !== 'dependent').map(vOpt)]);
    options($('h-dv'), [['', t('h.toLink')], ...vs.filter((v) => v.role === 'dependent').map(vOpt)]);
  }

  // --- Champs liés au projet : remplis seulement au changement de projet (une saisie en cours n'est jamais écrasée).
  function fillFields() {
    const p = active();
    document.querySelectorAll('[data-field]').forEach((inp) => { const v = p ? p[inp.dataset.field] : ''; inp.value = v === null || v === undefined ? '' : String(v); });
    document.querySelectorAll('[data-check]').forEach((box) => { box.checked = !!(p && p.checks[box.dataset.check]); });
    document.querySelectorAll('.fstat').forEach((n) => say(n, ''));
    for (const k of ['q', 'v', 'h']) resetForm(k);
  }
  document.querySelectorAll('[data-field]').forEach((inp) => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
    const p = active(), st = inp.closest('.step').querySelector('.fstat');
    if (!p) return;
    try {
      // Les deux années de la période sont relues ensemble : une saisie refusée un instant (début > fin) n'est pas perdue.
      const patch = inp.dataset.field.startsWith('period')
        ? { periodStart: document.querySelector('[data-field=periodStart]').value, periodEnd: document.querySelector('[data-field=periodEnd]').value }
        : { [inp.dataset.field]: inp.value };
      if (replace(C.update(p, patch))) { say(st, ''); renderAfterEdit(); }
    } catch (e) { say(st, L.error(e), 'error'); }
  }));
  document.querySelectorAll('[data-check]').forEach((box) => box.addEventListener('change', () => {
    const p = active(); if (!p) return;
    try { if (replace(C.update(p, { checks: { ...p.checks, [box.dataset.check]: box.checked } }))) renderAfterEdit(); else box.checked = !box.checked; }
    catch (e) { say('field-status', L.error(e), 'error'); }
  }));
  $('q-kind').addEventListener('change', () => { $('kind-help').textContent = t('kindhelp.' + $('q-kind').value); });

  // --- Listes : questions, variables, hypothèses
  function item(title, lines, tag, onEdit, onDelete, name) {
    const li = el('li'), txt = el('div', 'txt');
    txt.append(el('b', '', title));
    for (const l of lines) if (l) txt.append(el('span', '', l));
    if (tag) txt.append(el('span', 'tag', tag));
    const acts = el('div', 'acts');
    for (const [label, aria, fn] of [[t('btn.edit'), 'aria.edit', onEdit], [t('btn.delete'), 'aria.delete', onDelete]]) {
      const b = el('button', 'btn', label); b.type = 'button'; b.setAttribute('aria-label', t(aria, { name })); b.addEventListener('click', fn); acts.append(b);
    }
    li.append(txt, acts); return li;
  }
  function renderLists() {
    const p = active();
    const qs = p ? p.questions : [], vs = p ? p.variables : [], hs = p ? p.hypotheses : [];
    $('questions').replaceChildren(...(qs.length ? qs.map((q, i) => item(`Q${i + 1}`, [q.text], t('kind.' + q.kind), () => editQ(q), () => delQ(q), `Q${i + 1}`)) : [el('li', 'empty', t('q.none'))]));
    $('variables').replaceChildren(...(vs.length ? vs.map((v) => item(v.name, [`${t('f.vMeasure')} : ${v.measure || t('v.toDefine')}`, `${t('f.vSource')} : ${v.source || t('v.toDefine')}`], t('role.' + v.role), () => editV(v), () => delV(v), v.name)) : [el('li', 'empty', t('v.none'))]));
    $('hypotheses').replaceChildren(...(hs.length ? hs.map((h, i) => item(`H${i + 1} (${qLabel(p, h.questionId)})`, [h.text, `${vName(p, h.ivId)} → ${vName(p, h.dvId)}`], t('dir.' + h.direction), () => editH(h), () => delH(h), `H${i + 1}`)) : [el('li', 'empty', t('h.none'))]));
  }

  const FORM = { q: ['q-form', 'q-save', 'q-cancel', 'q-form-title', 'q-status'], v: ['v-form', 'v-save', 'v-cancel', 'v-form-title', 'v-status'], h: ['h-form', 'h-save', 'h-cancel', 'h-form-title', 'h-status'] };
  function formMode(k) {
    const [, saveBtn, cancel, title] = FORM[k];
    $(saveBtn).textContent = t(editing[k] ? 'btn.saveEdit' : { q: 'btn.addQ', v: 'btn.addV', h: 'btn.addH' }[k]);
    $(title).textContent = t(editing[k] ? `${k}.edit` : `${k}.add`);
    $(cancel).hidden = !editing[k];
  }
  function resetForm(k) {
    const f = $(FORM[k][0]);
    f.querySelectorAll('input, textarea').forEach((n) => { n.value = ''; });
    editing[k] = null; formMode(k);
  }
  function loadForm(k, obj) {
    const f = $(FORM[k][0]);
    editing[k] = obj.id; formMode(k);
    for (const [name, value] of Object.entries(obj)) if (f.elements[name]) f.elements[name].value = value;
    f.querySelector('textarea, input').focus();
  }
  const editQ = (q) => { loadForm('q', q); $('kind-help').textContent = t('kindhelp.' + q.kind); };
  const editV = (v) => loadForm('v', v);
  const editH = (h) => loadForm('h', h);
  function remove(k, fn, msg, okKey) {
    const p = active(); if (!p || !confirm(msg)) return;
    try { if (replace(fn(p))) { if (editing[k]) resetForm(k); renderAfterEdit(); say(FORM[k][4], t(okKey), 'ok'); } }
    catch (e) { say(FORM[k][4], L.error(e), 'error'); }
  }
  const delQ = (q) => remove('q', (p) => C.removeQuestion(p, q.id), t('confirm.deleteQ', { n: active().hypotheses.filter((h) => h.questionId === q.id).length }), 'q.deleted');
  const delV = (v) => remove('v', (p) => C.removeVariable(p, v.id), t('confirm.deleteV', { name: v.name, n: active().hypotheses.filter((h) => h.ivId === v.id || h.dvId === v.id).length }), 'v.deleted');
  const delH = (h) => remove('h', (p) => C.removeHypothesis(p, h.id), t('confirm.deleteH'), 'h.deleted');

  function bindForm(k, saver, prefix, okKey) {
    $(FORM[k][0]).addEventListener('submit', (e) => {
      e.preventDefault();
      const p = active(), f = e.currentTarget;
      if (!p) { say(FORM[k][4], t('project.none'), 'error'); return; }
      const input = {};
      for (const n of f.elements) if (n.name) input[n.name] = n.value;
      try {
        const wasEditing = !!editing[k];
        if (!replace(saver(p, input, editing[k] || newId(prefix)))) return;
        resetForm(k); renderAfterEdit();
        say(FORM[k][4], t(wasEditing ? 'item.updated' : okKey), 'ok');
        f.querySelector('textarea, input').focus();
      } catch (err) { say(FORM[k][4], L.error(err), 'error'); }
    });
    $(FORM[k][2]).addEventListener('click', () => { resetForm(k); say(FORM[k][4], ''); });
  }
  bindForm('q', C.saveQuestion, 'q-', 'q.added');
  bindForm('v', C.saveVariable, 'v-', 'v.added');
  bindForm('h', C.saveHypothesis, 'h-', 'h.added');

  // --- Liste de contrôle et progression
  function renderChecklist() {
    const p = active();
    if (!p) { $('checklist').replaceChildren(); $('score').textContent = ''; $('progress-bar').style.width = '0'; $('progress-text').textContent = ''; return; }
    const c = C.checklist(p);
    $('progress-bar').style.width = c.pct + '%';
    $('progress-text').textContent = t('progress', { ok: c.ok, total: c.total, pct: L.number(c.pct) });
    $('score').textContent = t('score', { ok: c.ok, total: c.total });
    $('checklist').replaceChildren(...c.items.map((i) => {
      const li = el('li', i.status), icon = el('span', 'icon', i.status === 'ok' ? '✓' : i.status === 'warn' ? '!' : '○');
      icon.setAttribute('aria-hidden', 'true');
      const txt = el('div', 'txt');
      txt.append(el('b', '', t('chk.' + i.key)), el('span', 'state', t('status.' + i.status)));
      if (i.status !== 'ok') txt.append(el('span', '', t('chkd.' + i.key)));
      if (i.status !== 'ok' && i.params && i.params.n > 0) txt.append(el('span', 'count', t('chkn.' + i.key, i.params)));
      const go = el('button', 'btn small', t('btn.goStep', { n: CHK_STEP[i.key] }));
      go.type = 'button'; go.setAttribute('aria-label', t('aria.goStep', { n: CHK_STEP[i.key], name: t('chk.' + i.key) }));
      go.addEventListener('click', () => showStep(CHK_STEP[i.key], true));
      li.append(icon, txt);
      if (i.status !== 'ok') li.append(go);
      return li;
    }));
  }

  // --- Étapes
  function showStep(n, focus) {
    step = n; safeSet(STEP, String(n));
    renderSteps();
    if (focus) { const h = $('h-step' + n); h.tabIndex = -1; h.focus(); }
  }
  function renderSteps() {
    const has = !!active();
    $('no-project').hidden = has;
    for (let i = 1; i <= 7; i += 1) $('step-' + i).hidden = !has || i !== step;
    document.querySelectorAll('#steps button').forEach((b) => { if (Number(b.dataset.step) === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); b.disabled = !has; });
    $('stepnav').hidden = !has;
    $('prev').disabled = step === 1; $('next').disabled = step === 7;
  }
  document.querySelectorAll('#steps button').forEach((b) => b.addEventListener('click', () => showStep(Number(b.dataset.step), true)));
  $('prev').addEventListener('click', () => showStep(Math.max(1, step - 1), true));
  $('next').addEventListener('click', () => showStep(Math.min(7, step + 1), true));

  // --- Projets
  function renderProjects() {
    const sel = $('project-select');
    sel.replaceChildren(...projects.map((p) => { const o = el('option', '', p.title); o.value = p.id; return o; }));
    if (activeId) sel.value = activeId;
    sel.disabled = !projects.length;
    $('rename-project').disabled = $('delete-project').disabled = !active();
  }
  function renderAfterEdit() { renderProjects(); renderSelects(); renderLists(); renderChecklist(); }
  function render() { for (const k of ['q', 'v', 'h']) formMode(k); renderAfterEdit(); renderSteps(); }
  function select(id) { activeId = id; if (id) safeSet(ACTIVE, id); fillFields(); render(); }

  $('project-select').addEventListener('change', (e) => select(e.target.value));
  $('new-project').addEventListener('click', () => {
    const title = prompt(t('prompt.new'), t('project.defaultName', { n: projects.length + 1 }));
    if (title === null) return;
    try {
      if (projects.length >= C.LIMITS.projects) throw new Error(`err.tooManyProjects|${JSON.stringify({ max: C.LIMITS.projects })}`);
      const p = C.emptyProject(newId('p-'), title);
      if (save([...projects, p])) { step = 1; select(p.id); say('project-status', t('project.created'), 'ok'); }
    } catch (e) { say('project-status', L.error(e), 'error'); }
  });
  $('rename-project').addEventListener('click', () => {
    const p = active(); if (!p) return;
    const title = prompt(t('prompt.rename'), p.title);
    if (title === null) return;
    try { if (replace(C.update(p, { title }))) { fillFields(); render(); } } catch (e) { say('project-status', L.error(e), 'error'); }
  });
  $('delete-project').addEventListener('click', () => {
    const p = active(); if (!p || !confirm(t('confirm.deleteProject', { name: p.title }))) return;
    if (save(projects.filter((x) => x.id !== p.id))) select(projects[0] ? projects[0].id : null);
  });

  // Exemple : un projet complet de démonstration, rédigé dans la langue affichée.
  $('sample').addEventListener('click', () => {
    try {
      if (projects.length >= C.LIMITS.projects) throw new Error(`err.tooManyProjects|${JSON.stringify({ max: C.LIMITS.projects })}`);
      let p = C.emptyProject(newId('p-'), t('sample.title'));
      p = C.update(p, { problem: t('sample.problem'), gap: t('sample.gap'), gapType: 'population', objective: t('sample.objective'),
        population: t('sample.population'), unit: t('sample.unit'), periodStart: '2015', periodEnd: '2024', dataSource: t('sample.dataSource'), method: t('sample.method') });
      const q1 = newId('q-'), q2 = newId('q-'), dv = newId('v-'), iv = newId('v-'), mod = newId('v-'), ctl = newId('v-');
      p = C.saveQuestion(p, { text: t('sample.q1'), kind: 'causal' }, q1);
      p = C.saveQuestion(p, { text: t('sample.q2'), kind: 'relational' }, q2);
      p = C.saveVariable(p, { name: t('sample.v1'), role: 'dependent', measure: t('sample.m1'), source: t('sample.s1') }, dv);
      p = C.saveVariable(p, { name: t('sample.v2'), role: 'independent', measure: t('sample.m2'), source: t('sample.s2') }, iv);
      p = C.saveVariable(p, { name: t('sample.v3'), role: 'moderator', measure: t('sample.m3'), source: '' }, mod);
      p = C.saveVariable(p, { name: t('sample.v4'), role: 'control', measure: t('sample.m4'), source: t('sample.s4') }, ctl);
      p = C.saveHypothesis(p, { questionId: q1, ivId: iv, dvId: dv, direction: 'negative', text: t('sample.h1') }, newId('h-'));
      if (save([...projects, p])) { step = 7; select(p.id); say('project-status', t('project.sampleAdded'), 'ok'); }
    } catch (e) { say('project-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-md').addEventListener('click', () => {
    const p = active(); if (!p) return;
    try { download('research-question.md', C.toMarkdown(p, t), 'text/markdown;charset=utf-8'); say('md-status', t('md.done'), 'ok'); }
    catch (e) { say('md-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('researchquestionlab-backup.json', C.backup(projects), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: projects.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true;
      select(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('researchquestionlab-raw-storage.txt', safeGet(KEY) || '', 'text/plain'));

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) projects = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  const last = safeGet(ACTIVE);
  activeId = projects.some((p) => p.id === last) ? last : (projects[0] ? projects[0].id : null);
  L.onChange(() => { for (const id of ['project-status', 'backup-status', 'md-status']) say(id, ''); render(); }); // nouvelle langue : la saisie en cours reste en place
  fillFields(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
