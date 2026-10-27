/* ClassRubric — interface. Calculs dans core.js (RubricCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.RubricCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-classrubric-v1'; // clé de stockage local
  const ACTIVE = 'louvre-classrubric-active'; // grille affichée (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let state = { rubrics: [], evaluations: [] };
  let rubricId = null, evalId = null; // grille et copie affichées
  const openCrit = new Set(); // critères dépliés dans l'éditeur
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const rubric = () => state.rubrics.find((r) => r.id === rubricId) || null;
  const evaluation = () => state.evaluations.find((e) => e.id === evalId && e.rubricId === rubricId) || null;
  const pts = (h) => L.number(h / 100, { maximumFractionDigits: 2 }); // centièmes de point -> « 14,5 »
  const byName = (a, b) => a.student.localeCompare(b.student, L.locale);

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = C.validateBackup(JSON.parse(C.backup(next))); return true; }
    catch (e) { say('grid-status', L.error(e), 'error'); return false; }
  }
  // Remplace la grille active ; les copies sont nettoyées des niveaux qui n'existent plus.
  function saveRubric(next) {
    return save({ rubrics: state.rubrics.map((r) => (r.id === next.id ? next : r)), evaluations: state.evaluations.map((e) => (e.rubricId === next.id ? C.prune(e, next) : e)) });
  }
  function ensureRubric() {
    if (rubric()) return true;
    if (state.rubrics.length) { rubricId = state.rubrics[0].id; return true; }
    if (state.rubrics.length >= C.LIMITS.rubrics) return false;
    const first = C.makeRubric({ id: newId(), name: t('rubric.defaultName'), scale: 20, step: '0.5', criteria: [] });
    if (!save({ ...state, rubrics: [first] })) return false;
    rubricId = first.id; return true;
  }
  function defaultCriterion(n) {
    return { id: newId(), name: t('crit.newName', { n }), weight: 1, levels: [0, 1, 2, 3].map((p) => ({ id: newId(), label: t('lvl.d' + p), points: p, descriptor: '' })) };
  }

  // --- Éditeur de grille
  function input(keep, value, cls, attrs = {}) {
    const n = el(attrs.multiline ? 'textarea' : 'input', cls); n.value = String(value); n.dataset.keep = keep;
    for (const [k, v] of Object.entries(attrs)) if (k !== 'multiline') n.setAttribute(k, v);
    return n;
  }
  function labelled(text, control, cls = 'field') { const l = el('label', cls); l.append(el('span', '', text), control); return l; }
  function iconBtn(symbol, label, action) { const b = el('button', 'btn icon', symbol); b.type = 'button'; b.dataset.action = action; b.setAttribute('aria-label', label); b.title = label; return b; }

  function renderEditor() {
    const r = rubric(), box = $('criteria');
    $('scale').value = r ? String(r.scale) : '20'; $('step').value = r ? r.step : '0.5';
    $('scale').disabled = $('step').disabled = !r;
    if (!r || !r.criteria.length) { box.replaceChildren(el('p', 'empty', t('crit.empty'))); return; }
    box.replaceChildren(...r.criteria.map((c, i) => {
      // Carte repliable : le résumé suffit pour relire la grille, on déplie pour modifier.
      const card = el('details', 'crit'); card.dataset.id = c.id; card.open = openCrit.has(c.id);
      const sum = el('summary'); sum.append(el('b', '', t('crit.legend', { n: i + 1, name: c.name })), el('small', '', t('crit.summary', { w: L.number(c.weight), n: c.levels.length })));
      card.append(sum);
      card.addEventListener('toggle', () => { if (card.open) openCrit.add(c.id); else openCrit.delete(c.id); });
      const head = el('div', 'crit-head');
      head.append(labelled(t('f.criterion'), input(`c:${c.id}:name`, c.name, '', { 'data-f': 'name', maxlength: '80' }), 'field grow'),
        labelled(t('f.weight'), input(`c:${c.id}:weight`, c.weight, '', { 'data-f': 'weight', inputmode: 'numeric', maxlength: '3' }), 'field small'));
      const acts = el('div', 'acts');
      const up = iconBtn('↑', t('aria.up', { name: c.name }), 'up'); up.disabled = i === 0;
      const down = iconBtn('↓', t('aria.down', { name: c.name }), 'down'); down.disabled = i === r.criteria.length - 1;
      acts.append(up, down, iconBtn('✕', t('aria.removeCrit', { name: c.name }), 'remove-crit'));
      head.append(acts);
      const levels = el('div', 'levels');
      c.levels.forEach((l, j) => {
        const row = el('div', 'lvl'); row.dataset.lid = l.id;
        row.append(labelled(t('f.level', { n: j + 1 }), input(`l:${c.id}:${l.id}:label`, l.label, '', { 'data-f': 'label', maxlength: '80' })),
          labelled(t('f.points'), input(`l:${c.id}:${l.id}:points`, l.points, '', { 'data-f': 'points', inputmode: 'numeric', maxlength: '3' }), 'field small'),
          labelled(t('f.descriptor'), input(`l:${c.id}:${l.id}:descriptor`, l.descriptor, '', { 'data-f': 'descriptor', maxlength: '300', multiline: true, rows: '2' }), 'field desc'));
        const del = iconBtn('✕', t('aria.removeLevel', { name: l.label }), 'remove-level'); del.disabled = c.levels.length <= C.LIMITS.levelsMin;
        row.append(del); levels.append(row);
      });
      const add = el('button', 'btn', t('btn.addLevel')); add.type = 'button'; add.dataset.action = 'add-level'; add.disabled = c.levels.length >= C.LIMITS.levelsMax;
      card.append(head, levels, add);
      return card;
    }));
  }
  // Lit un critère depuis ses champs (validation stricte par le moteur).
  function readCriterion(card) {
    const val = (sel, root = card) => root.querySelector(`[data-f="${sel}"]`).value;
    const head = card.querySelector('.crit-head');
    return {
      id: card.dataset.id, name: val('name', head), weight: val('weight', head),
      levels: [...card.querySelectorAll('.lvl')].map((row) => ({ id: row.dataset.lid, label: val('label', row), points: val('points', row), descriptor: val('descriptor', row) })),
    };
  }
  function commitCriterion(card, target) {
    const r = rubric(); if (!r) return;
    try {
      const c = C.makeCriterion(readCriterion(card));
      card.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
      if (saveRubric({ ...r, criteria: r.criteria.map((x) => (x.id === c.id ? c : x)) })) { say('grid-status', t('crit.saved', { name: c.name }), 'ok'); renderEval(); renderResults(); renderSelects(); }
    } catch (e) { if (target) target.setAttribute('aria-invalid', 'true'); say('grid-status', L.error(e), 'error'); }
  }
  $('criteria').addEventListener('change', (e) => { const card = e.target.closest('.crit'); if (card) commitCriterion(card, e.target); });
  $('criteria').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const r = rubric(), card = b.closest('.crit'); if (!r || !card) return;
    const i = r.criteria.findIndex((c) => c.id === card.dataset.id), c = r.criteria[i];
    let criteria = r.criteria.slice();
    try {
      switch (b.dataset.action) {
        case 'up': case 'down': {
          const j = b.dataset.action === 'up' ? i - 1 : i + 1;
          [criteria[i], criteria[j]] = [criteria[j], criteria[i]]; break;
        }
        case 'remove-crit': {
          const used = state.evaluations.filter((ev) => ev.rubricId === r.id && ev.choices[c.id]).length;
          if (!confirm(t('confirm.removeCrit', { name: c.name, n: used }))) return;
          criteria.splice(i, 1); break;
        }
        case 'add-level': {
          const read = readCriterion(card);
          const maxPts = Math.max(0, ...read.levels.map((l) => Number(l.points) || 0));
          read.levels.push({ id: newId(), label: t('lvl.new'), points: Math.min(C.LIMITS.points, maxPts + 1), descriptor: '' });
          criteria[i] = C.makeCriterion(read); break;
        }
        case 'remove-level': {
          const read = readCriterion(card), lid = b.closest('.lvl').dataset.lid;
          read.levels = read.levels.filter((l) => l.id !== lid);
          criteria[i] = C.makeCriterion(read); break;
        }
        default: return;
      }
      if (saveRubric(C.makeRubric({ ...r, criteria }))) { say('grid-status', ''); render(); }
    } catch (err) { say('grid-status', L.error(err), 'error'); }
  });
  $('add-criterion').addEventListener('click', () => {
    try {
      if (!ensureRubric()) return;
      const r = rubric();
      if (r.criteria.length >= C.LIMITS.criteria) throw new Error(`err.tooManyCriteria|${JSON.stringify({ max: C.LIMITS.criteria })}`);
      const c = C.makeCriterion(defaultCriterion(r.criteria.length + 1));
      openCrit.add(c.id);
      if (saveRubric({ ...r, criteria: [...r.criteria, c] })) { render(); say('grid-status', t('crit.added'), 'ok'); const f = $('criteria').querySelector(`.crit[data-id="${c.id}"] input`); if (f) f.focus(); }
    } catch (e) { say('grid-status', L.error(e), 'error'); }
  });
  function commitSettings() {
    const r = rubric(); if (!r) return;
    try { const next = C.makeRubric({ ...r, scale: $('scale').value, step: $('step').value }); $('scale').removeAttribute('aria-invalid'); if (saveRubric(next)) { say('grid-status', t('settings.saved'), 'ok'); renderEval(); renderResults(); } }
    catch (e) { $('scale').setAttribute('aria-invalid', 'true'); say('grid-status', L.error(e), 'error'); }
  }
  $('scale').addEventListener('change', commitSettings);
  $('step').addEventListener('change', commitSettings);

  // --- Sélecteurs de grille et de copie
  function renderSelects() {
    const sel = $('rubric-select');
    sel.replaceChildren(...state.rubrics.map((r) => { const o = el('option', '', `${r.name} (${state.evaluations.filter((e) => e.rubricId === r.id).length})`); o.value = r.id; return o; }));
    if (!state.rubrics.length) { const o = el('option', '', t('rubric.none')); o.value = ''; sel.append(o); }
    sel.value = rubricId || '';
    $('rename-rubric').disabled = $('dup-rubric').disabled = $('delete-rubric').disabled = !rubric();
    const evs = state.evaluations.filter((e) => e.rubricId === rubricId).sort(byName);
    const es = $('eval-select');
    const none = el('option', '', evs.length ? t('eval.choose') : t('eval.none')); none.value = '';
    es.replaceChildren(none, ...evs.map((e) => { const o = el('option', '', e.student); o.value = e.id; return o; }));
    es.value = evaluation() ? evalId : '';
    $('print-eval').disabled = $('delete-eval').disabled = !evaluation();
  }

  // --- Évaluation d'une copie
  function scoreText(r, res) { return res.complete ? t('score.value', { score: pts(res.scoreH), scale: L.number(r.scale) }) : t('score.incomplete', { n: res.missing.length, scale: L.number(r.scale) }); }
  function renderEval() {
    const r = rubric(), ev = evaluation(), box = $('eval-grid');
    $('comment-wrap').hidden = !ev; $('score').hidden = !ev;
    if (!r || !r.criteria.length) { box.replaceChildren(el('p', 'empty', t('eval.needGrid'))); return; }
    if (!ev) { box.replaceChildren(el('p', 'empty', t('eval.needCopy'))); return; }
    const res = C.evaluate(r, ev.choices);
    const score = $('score'); score.replaceChildren(el('span', 'who', ev.student), el('strong', '', scoreText(r, res)));
    score.className = 'score' + (res.complete ? ' done' : '');
    if (document.activeElement !== $('comment')) $('comment').value = ev.comment;
    box.replaceChildren(...r.criteria.map((c, i) => {
      const row = res.rows[i];
      const fs = el('fieldset', 'ecrit');
      const lg = el('legend'); lg.append(el('span', '', c.name), el('small', '', ` ×${L.number(c.weight)}`));
      if (row.level) lg.append(el('small', 'share', ' · ' + t('eval.share', { pts: pts(row.shareH) })));
      fs.append(lg);
      const choices = el('div', 'choices');
      for (const l of c.levels) {
        const lab = el('label', 'choice'), radio = el('input');
        radio.type = 'radio'; radio.name = `ev-${c.id}`; radio.value = l.id; radio.checked = ev.choices[c.id] === l.id; radio.dataset.cid = c.id;
        const body = el('span', 'body'); body.append(el('b', '', l.label), el('span', 'pts', t('eval.points', { p: L.number(l.points), max: L.number(row.max) })));
        if (l.descriptor) body.append(el('span', 'desc', l.descriptor));
        lab.append(radio, body); choices.append(lab);
      }
      fs.append(choices); return fs;
    }));
  }
  function updateEval(mutator, okText) {
    const r = rubric(), ev = evaluation(); if (!r || !ev) return false;
    try {
      const next = C.makeEvaluation(mutator(ev), r);
      if (!save({ ...state, evaluations: state.evaluations.map((e) => (e.id === ev.id ? next : e)) })) return false;
      if (okText) say('eval-status', okText, 'ok');
      return true;
    } catch (e) { say('eval-status', L.error(e), 'error'); return false; }
  }
  $('eval-grid').addEventListener('change', (e) => {
    const radio = e.target; if (radio.type !== 'radio') return;
    if (updateEval((ev) => ({ ...ev, choices: { ...ev.choices, [radio.dataset.cid]: radio.value } }))) {
      const r = rubric(), res = C.evaluate(r, evaluation().choices);
      renderEval(); renderResults(); renderSelects();
      say('eval-status', res.complete ? t('eval.done', { name: evaluation().student, score: scoreText(r, res) }) : '', 'ok');
      const again = $('eval-grid').querySelector(`input[name="${radio.name}"][value="${radio.value}"]`); if (again) again.focus();
    }
  });
  $('comment').addEventListener('change', () => { if (updateEval((ev) => ({ ...ev, comment: $('comment').value }), t('eval.commentSaved'))) renderResults(); });
  $('eval-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (!ensureRubric()) return;
      const r = rubric();
      if (!r.criteria.length) throw new Error('err.noCriteria');
      if (state.evaluations.length >= C.LIMITS.evaluations) throw new Error(`err.tooManyEvaluations|${JSON.stringify({ max: C.LIMITS.evaluations })}`);
      const ev = C.makeEvaluation({ id: newId(), student: $('student').value, choices: {}, comment: '' }, r);
      if (!save({ ...state, evaluations: [...state.evaluations, ev] })) return;
      evalId = ev.id; $('student').value = '';
      render(); say('eval-status', t('eval.created', { name: ev.student }), 'ok');
      const first = $('eval-grid').querySelector('input[type=radio]'); if (first) first.focus();
    } catch (err) { say('eval-status', L.error(err), 'error'); }
  });
  $('eval-select').addEventListener('change', (e) => { evalId = e.target.value || null; say('eval-status', ''); render(); });
  $('delete-eval').addEventListener('click', () => {
    const ev = evaluation(); if (!ev || !confirm(t('confirm.deleteEval', { name: ev.student }))) return;
    if (save({ ...state, evaluations: state.evaluations.filter((e) => e.id !== ev.id) })) { evalId = null; render(); say('eval-status', t('eval.deleted'), 'ok'); }
  });

  // --- Résultats de la classe
  function renderResults() {
    const r = rubric(), tbody = $('results').querySelector('tbody'), kpis = $('kpis'), cs = $('crit-stats');
    const evs = r ? state.evaluations.filter((e) => e.rubricId === r.id).sort(byName) : [];
    $('export-csv').disabled = !evs.length;
    if (!r || !evs.length) { tbody.replaceChildren(); kpis.replaceChildren(el('p', 'empty', t('results.empty'))); cs.replaceChildren(); return; }
    const s = C.stats(r, state.evaluations), of = (h) => (h === null ? '—' : `${pts(h)} / ${L.number(r.scale)}`);
    const kpi = (label, value) => { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; };
    kpis.replaceChildren(kpi(t('kpi.graded'), `${L.number(s.complete)} / ${L.number(s.total)}`), kpi(t('kpi.mean'), of(s.meanH)), kpi(t('kpi.median'), of(s.medianH)),
      kpi(t('kpi.range'), s.minH === null ? '—' : `${pts(s.minH)} – ${pts(s.maxH)}`));
    cs.replaceChildren(...r.criteria.map((c, i) => {
      const b = s.byCriterion[i], li = el('li');
      const pct = b.permille === null ? null : b.permille / 10;
      li.append(el('span', 'name', c.name), el('span', 'num', pct === null ? '—' : `${L.number(pct, { maximumFractionDigits: 1 })} %`));
      const bar = el('div', 'bar'), fill = el('i'); fill.style.width = `${pct === null ? 0 : Math.max(2, pct)}%`; bar.append(fill); li.append(bar);
      return li;
    }));
    tbody.replaceChildren(...evs.map((e) => {
      const res = C.evaluate(r, e.choices), tr = el('tr', e.id === evalId ? 'current' : '');
      const open = el('button', 'btn small', t('btn.open')); open.type = 'button'; open.setAttribute('aria-label', t('aria.open', { name: e.student }));
      open.addEventListener('click', () => { evalId = e.id; render(); $('eval-grid').scrollIntoView({ block: 'start' }); });
      const act = el('td'); act.append(open);
      tr.append(el('td', '', e.student), el('td', 'num', res.complete ? pts(res.scoreH) : '—'), el('td', res.complete ? 'ok' : 'muted', res.complete ? t('status.complete') : t('status.incomplete', { n: res.missing.length })), act);
      return tr;
    }));
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'grille';
  $('export-csv').addEventListener('click', () => {
    const r = rubric(); if (!r) return;
    const texts = {
      head: { student: t('th.student'), score: t('th.score'), scale: t('csv.scale'), status: t('th.status'), comment: t('f.comment') },
      complete: t('csv.complete'), incomplete: t('csv.incomplete'), delimiter: L.lang === 'en' ? ',' : ';',
      number: (n) => L.number(n, { maximumFractionDigits: 2, useGrouping: false }), compare: (a, b) => a.localeCompare(b, L.locale),
    };
    download(`classrubric-${fileName(r.name)}.csv`, C.csv(r, state.evaluations, texts), 'text/csv;charset=utf-8');
    say('results-status', t('csv.done'), 'ok');
  });

  // --- Impression : grille vierge ou copie notée (niveaux choisis surlignés)
  function renderPrint(withEval) {
    const r = rubric(), ev = withEval ? evaluation() : null, area = $('print-area');
    if (!r) return false;
    const res = ev ? C.evaluate(r, ev.choices) : null;
    const head = [el('h1', '', r.name), el('p', '', t('print.scale', { scale: L.number(r.scale), step: t('step.' + r.step) }))];
    if (ev) head.push(el('p', 'who', `${t('f.student')} : ${ev.student} — ${scoreText(r, res)}`));
    const width = Math.max(0, ...r.criteria.map((c) => c.levels.length));
    const table = el('table', 'print-table'), tb = el('tbody');
    for (const c of r.criteria) {
      const tr = el('tr'), th = el('th'); th.append(el('b', '', c.name), el('small', '', ` ×${L.number(c.weight)}`)); tr.append(th);
      for (let j = 0; j < width; j += 1) {
        const l = c.levels[j], td = el('td', l && ev && ev.choices[c.id] === l.id ? 'sel' : '');
        if (l) { td.append(el('b', '', (td.className ? '✓ ' : '') + l.label), el('small', '', ` (${L.number(l.points)})`)); if (l.descriptor) td.append(el('div', '', l.descriptor)); }
        tr.append(td);
      }
      tb.append(tr);
    }
    table.append(tb);
    area.replaceChildren(...head, table);
    if (ev && ev.comment) area.append(el('p', 'comment', `${t('f.comment')} : ${ev.comment}`));
    area.append(el('p', 'foot', t('hint.formula')));
    return true;
  }
  $('print-grid').addEventListener('click', () => { if (renderPrint(false)) window.print(); else say('grid-status', t('eval.needGrid'), 'error'); });
  $('print-eval').addEventListener('click', () => { if (renderPrint(true)) window.print(); });

  // --- Grilles
  $('rubric-select').addEventListener('change', (e) => { rubricId = e.target.value || null; evalId = null; try { localStorage.setItem(ACTIVE, rubricId || ''); } catch (_) { /* confort */ } render(); });
  $('new-rubric').addEventListener('click', () => {
    if (state.rubrics.length >= C.LIMITS.rubrics) { say('grid-status', t('err.tooManyRubrics', { max: C.LIMITS.rubrics }), 'error'); return; }
    const name = prompt(t('prompt.new'), t('rubric.newDefault', { n: state.rubrics.length + 1 }));
    if (name === null) return;
    try { const r = C.makeRubric({ id: newId(), name, scale: 20, step: '0.5', criteria: [] }); if (save({ ...state, rubrics: [...state.rubrics, r] })) { rubricId = r.id; evalId = null; render(); } } catch (e) { say('grid-status', L.error(e), 'error'); }
  });
  $('rename-rubric').addEventListener('click', () => {
    const r = rubric(); if (!r) return;
    const name = prompt(t('prompt.rename'), r.name);
    if (name === null) return;
    try { if (saveRubric(C.makeRubric({ ...r, name }))) render(); } catch (e) { say('grid-status', L.error(e), 'error'); }
  });
  $('dup-rubric').addEventListener('click', () => {
    const r = rubric(); if (!r) return;
    if (state.rubrics.length >= C.LIMITS.rubrics) { say('grid-status', t('err.tooManyRubrics', { max: C.LIMITS.rubrics }), 'error'); return; }
    try {
      const copy = C.makeRubric({ ...r, id: newId(), name: t('rubric.copyName', { name: r.name }).slice(0, C.LIMITS.name), criteria: r.criteria.map((c) => ({ ...c, id: newId(), levels: c.levels.map((l) => ({ ...l, id: newId() })) })) });
      if (save({ ...state, rubrics: [...state.rubrics, copy] })) { rubricId = copy.id; evalId = null; render(); say('grid-status', t('rubric.duplicated'), 'ok'); }
    } catch (e) { say('grid-status', L.error(e), 'error'); }
  });
  $('delete-rubric').addEventListener('click', () => {
    const r = rubric(); if (!r) return;
    const n = state.evaluations.filter((e) => e.rubricId === r.id).length;
    if (!confirm(t('confirm.deleteRubric', { name: r.name, n }))) return;
    if (save({ rubrics: state.rubrics.filter((x) => x.id !== r.id), evaluations: state.evaluations.filter((e) => e.rubricId !== r.id) })) { rubricId = state.rubrics[0] ? state.rubrics[0].id : null; evalId = null; render(); }
  });

  // --- Exemple (dans la langue affichée)
  $('sample').addEventListener('click', () => {
    try {
      if (state.rubrics.length >= C.LIMITS.rubrics) throw new Error(`err.tooManyRubrics|${JSON.stringify({ max: C.LIMITS.rubrics })}`);
      const spec = [['c1', 3], ['c2', 2], ['c3', 2], ['c4', 1]];
      const criteria = spec.map(([k, w]) => ({ id: newId(), name: t(`sample.${k}`), weight: w, levels: [0, 1, 2, 3].map((p) => ({ id: newId(), label: t('lvl.d' + p), points: p, descriptor: t(`sample.${k}.${p}`) })) }));
      const r = C.makeRubric({ id: newId(), name: t('sample.rubric'), scale: 20, step: '0.5', criteria });
      const picks = [[3, 2, 3, 2], [1, 2, 1, 3], [2, 1, null, null]];
      const names = t('sample.students').split(',');
      const evs = picks.map((p, i) => {
        const choices = {}; p.forEach((lv, k) => { if (lv !== null) choices[criteria[k].id] = r.criteria[k].levels[lv].id; });
        return C.makeEvaluation({ id: newId(), student: names[i].trim(), choices, comment: '' }, r);
      });
      if (save({ rubrics: [...state.rubrics, r], evaluations: [...state.evaluations, ...evs].slice(0, C.LIMITS.evaluations) })) {
        rubricId = r.id; evalId = evs[0].id; render(); say('grid-status', t('sample.added'), 'ok');
      }
    } catch (e) { say('grid-status', L.error(e), 'error'); }
  });

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('classrubric-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.rubrics.length, b: next.rubrics.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      rubricId = next.rubrics[0] ? next.rubrics[0].id : null; evalId = null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.rubrics.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('classrubric-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderSelects(); renderEditor(); renderEval(); renderResults(); }
  // Changement de langue : on réaffiche sans perdre ce qui est en cours de saisie (valeurs non encore validées).
  function preserve(fn) {
    const kept = new Map([...document.querySelectorAll('[data-keep]')].map((n) => [n.dataset.keep, n.value]));
    const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.keep : null;
    fn();
    document.querySelectorAll('[data-keep]').forEach((n) => { if (kept.has(n.dataset.keep)) n.value = kept.get(n.dataset.keep); });
    if (focused) { const f = document.querySelector(`[data-keep="${CSS.escape(focused)}"]`); if (f) f.focus(); }
  }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    rubricId = state.rubrics.some((r) => r.id === last) ? last : (state.rubrics[0] ? state.rubrics[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => preserve(() => { for (const id of ['grid-status', 'eval-status', 'results-status', 'backup-status']) say(id, ''); render(); }));
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
