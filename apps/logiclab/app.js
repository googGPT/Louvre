/* LogicLab — interface. Calculs dans core.js (LogicCore) ; textes dans LouvreI18n (appli sans argent). */
(() => {
  'use strict';
  const C = window.LogicCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-logiclab-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let prefs = { notation: 'symbols', order: 'falseFirst' }, draft = { a: '', b: '' }, saved = [], readOnly = false;
  let res = null; // dernière analyse valide
  let dirty = false, saveTimer = null, renderTimer = null, lastInput = 'expr-a';

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function params(e) { const json = String(e && e.message || '').split('|')[1]; try { return json ? JSON.parse(json) : {}; } catch (_) { return {}; } }
  function save(next = {}) {
    const state = { prefs: next.prefs || prefs, draft: next.draft || draft, saved: next.saved || saved };
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(state)); ({ prefs, draft, saved } = state); return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }

  // --- Brouillon enregistré en différé (forcé avant enregistrement, suppression, chargement, export et fermeture)
  function stateText() { $('save-state').textContent = readOnly ? t('save.readonly') : dirty ? t('save.pending') : t('save.done'); }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty) return true;
    if (save({ draft: { a: $('expr-a').value, b: $('expr-b').value } })) dirty = false;
    stateText(); return !dirty;
  }
  function onEdit() {
    dirty = true; stateText();
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500);
    clearTimeout(renderTimer); renderTimer = setTimeout(render, 120);
  }

  // --- Analyse et affichage
  const KIND_CLASS = { tautology: 'verdict', contradiction: 'verdict bad', contingent: 'verdict neutral' };
  function showError(which, e, text) {
    const v = $('verdict-a');
    v.className = 'verdict bad'; v.textContent = `${t('err.in', { which })} ${errText(e)}`;
    const p = params(e);
    if (p.pos) { const c = $('caret'); c.hidden = false; c.textContent = text + '\n' + ' '.repeat(Math.max(0, [...text.slice(0, p.pos - 1)].length)) + '^'; }
  }
  function render() {
    clearTimeout(renderTimer); renderTimer = null;
    const a = $('expr-a').value, b = $('expr-b').value;
    $('caret').hidden = true; $('read-as').textContent = ''; $('verdict-b').textContent = ''; $('verdict-b').className = 'verdict top-gap'; $('diff').replaceChildren();
    res = null;
    if (!a.trim()) {
      $('verdict-a').className = 'verdict neutral'; $('verdict-a').textContent = t('result.empty');
      renderTable(); renderForms(); return;
    }
    try { C.parse(a); } catch (e) { showError('A', e, a); renderTable(); renderForms(); return; }
    if (b.trim()) { try { C.parse(b); } catch (e) { showError('B', e, b); renderTable(); renderForms(); return; } }
    try { res = C.analyze(a, b, prefs.notation); } catch (e) { showError('A + B', e, a); renderTable(); renderForms(); return; }
    const k = res.classA;
    $('verdict-a').className = KIND_CLASS[k.kind];
    $('verdict-a').textContent = `${t('kind.' + k.kind)} ${t('models', { n: k.models, rows: L.number(k.rows), count: L.number(k.models) })}`;
    $('read-as').textContent = t('result.readAs', { expr: res.textA, n: res.vars.length, vars: res.vars.join(', ') || '—' });
    if (res.b) {
      const B = res.b, vb = $('verdict-b');
      if (B.equivalent) { vb.className = 'verdict top-gap'; vb.textContent = t('eq.yes'); }
      else {
        vb.className = 'verdict top-gap bad';
        const rel = B.aImpB ? ' ' + t('eq.aImpB') : B.bImpA ? ' ' + t('eq.bImpA') : '';
        vb.textContent = t('eq.no', { n: B.differ, count: L.number(B.differ), rows: L.number(k.rows) }) + rel;
        $('diff').replaceChildren(...B.diff.map((d) => el('li', 'code', `${res.vars.map((v) => `${v} = ${d.values[v]}`).join(', ')}  →  A = ${d.a}, B = ${d.b}`)));
      }
    }
    renderTable(); renderForms();
  }

  function renderTable() {
    const wrap = $('table-wrap'), note = $('table-note');
    note.textContent = '';
    $('export-csv').disabled = $('print').disabled = !res;
    if (!res) { wrap.replaceChildren(el('p', 'empty', t('table.none'))); return; }
    const n = res.vars.length, R = res.vecA.length;
    const subs = $('show-subs').checked ? res.subs.filter((s) => s.text !== res.textA) : [];
    const cols = [...res.vars.map((v) => ({ head: v, cls: 'var' })), ...subs.map((s) => ({ head: s.text, vec: s.vec, cls: 'sub' })), { head: 'A', title: res.textA, vec: res.vecA, cls: 'main' }];
    if (res.b) cols.push({ head: 'B', title: res.b.textB, vec: res.b.vec, cls: 'main b' });
    const table = el('table', 'truth'), thead = el('thead'), hr = el('tr');
    for (const c of cols) { const th = el('th', c.cls, c.head); th.scope = 'col'; if (c.title) th.title = c.title; hr.append(th); }
    thead.append(hr);
    const tbody = el('tbody'), frag = document.createDocumentFragment();
    let shown = 0;
    for (let i = 0; i < R; i++) {
      const r = prefs.order === 'trueFirst' ? R - 1 - i : i;
      if ($('only-true').checked && !res.vecA[r]) continue;
      const tr = el('tr');
      if (res.b && res.vecA[r] !== res.b.vec[r]) tr.className = 'differs';
      cols.forEach((c, k) => { const x = k < n ? C.bit(r, k, n) : c.vec[r]; tr.append(el('td', `${c.cls} v${x}`, x)); });
      frag.append(tr); shown++;
    }
    tbody.append(frag); table.append(thead, tbody);
    wrap.replaceChildren(table);
    note.textContent = t('table.note', { n: shown, count: L.number(shown), rows: L.number(R), a: res.textA }) + (res.b ? ' ' + t('table.noteB', { b: res.b.textB }) : '') +
      (res.subs.length >= C.LIMITS.columns && $('show-subs').checked ? ' ' + t('table.subsCut', { max: C.LIMITS.columns }) : '');
  }

  function renderForms() {
    const box = $('forms');
    if (!res) { box.replaceChildren(el('p', 'empty', t('forms.none'))); return; }
    const f = res.forms;
    const items = [
      ['forms.dnf', f.dnf, f.dnfGreedy, 'dnf'], ['forms.cnf', f.cnf, f.cnfGreedy, 'cnf'],
      ['forms.canonDnf', f.canonDnf, false, 'canonDnf'], ['forms.canonCnf', f.canonCnf, false, 'canonCnf'],
    ];
    box.replaceChildren(...items.map(([key, text, greedy, id]) => {
      const d = el('div', 'form-item'); d.dataset.form = id;
      d.append(el('h3', '', t(key)), el('pre', 'form code', text));
      if (greedy) d.append(el('p', 'hint', t('forms.greedy')));
      const use = el('button', 'btn small', t('btn.useAsB')); use.type = 'button';
      use.addEventListener('click', () => { $('expr-b').value = text.length > C.LIMITS.expr ? '' : text; if (text.length > C.LIMITS.expr) { say('expr-status', t('err.tooLong', { max: C.LIMITS.expr }), 'error'); return; } onEdit(); render(); say('expr-status', t('forms.used'), 'ok'); });
      d.append(use); return d;
    }));
    box.prepend(el('p', 'hint', t('forms.hint', { vars: f.vars.join(', ') || '—' })));
  }

  // --- Saisie
  for (const id of ['expr-a', 'expr-b']) {
    $(id).addEventListener('input', onEdit);
    $(id).addEventListener('focus', () => { lastInput = id; });
    $(id).addEventListener('blur', flush);
  }
  document.querySelectorAll('.sym').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(lastInput);
    const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? input.value.length;
    const ins = btn.dataset.ins, pad = /[∧∨⊕→↔]/.test(ins) ? ` ${ins} ` : ins;
    if (input.value.length + pad.length > C.LIMITS.expr) return;
    input.setRangeText(pad, a, b, 'end'); input.focus(); onEdit();
  }));
  $('notation').addEventListener('change', (e) => { const p = { ...prefs, notation: e.target.value }; if (readOnly) prefs = p; else if (!save({ prefs: p })) return; render(); });
  $('order').addEventListener('change', (e) => { const p = { ...prefs, order: e.target.value }; if (readOnly) prefs = p; else if (!save({ prefs: p })) return; renderTable(); });
  $('show-subs').addEventListener('change', renderTable);
  $('only-true').addEventListener('change', renderTable);
  $('clear').addEventListener('click', () => { $('expr-a').value = ''; $('expr-b').value = ''; onEdit(); flush(); render(); $('expr-a').focus(); });

  // --- Expressions enregistrées
  function renderSaved() {
    const ul = $('saved');
    if (!saved.length) { ul.replaceChildren(el('li', 'none', t('saved.none'))); return; }
    const list = saved.slice().sort((x, y) => x.name.localeCompare(y.name, L.locale));
    ul.replaceChildren(...list.map((s) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', s.name), el('span', 'code ltr', s.b ? `A : ${s.a}   ·   B : ${s.b}` : s.a));
      const acts = el('div', 'acts');
      const load = el('button', 'btn small', t('btn.load')); load.type = 'button'; load.setAttribute('aria-label', t('aria.load', { name: s.name }));
      load.addEventListener('click', () => { flush(); $('expr-a').value = s.a; $('expr-b').value = s.b; dirty = true; flush(); render(); say('expr-status', t('saved.loaded', { name: s.name }), 'ok'); });
      const del = el('button', 'btn small danger', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: s.name }));
      del.addEventListener('click', () => { if (!confirm(t('confirm.delete', { name: s.name }))) return; flush(); if (save({ saved: saved.filter((x) => x.id !== s.id) })) { renderSaved(); say('expr-status', t('saved.deleted'), 'ok'); } });
      acts.append(load, del); li.append(txt, acts); return li;
    }));
  }
  $('expr-form').addEventListener('submit', (e) => {
    e.preventDefault();
    flush();
    try {
      if (saved.length >= C.LIMITS.saved) throw new Error(`err.tooManySaved|${JSON.stringify({ max: C.LIMITS.saved })}`);
      C.makeSaved({ name: 'x', a: $('expr-a').value, b: $('expr-b').value }, 'check-0000'); // vérifie avant de demander un nom
      const name = prompt(t('prompt.name'), t('saved.default', { n: saved.length + 1 }));
      if (name === null) return;
      const s = C.makeSaved({ name, a: $('expr-a').value, b: $('expr-b').value }, newId());
      if (save({ saved: [...saved, s] })) { renderSaved(); say('expr-status', t('saved.done', { name: s.name }), 'ok'); }
    } catch (err) { say('expr-status', errText(err), 'error'); }
  });
  $('sample').addEventListener('click', () => {
    flush();
    const ex = [['sample.deMorgan', '¬(p ∧ q)', '¬p ∨ ¬q'], ['sample.modusPonens', '((p → q) ∧ p) → q', ''], ['sample.contraposition', 'p → q', '¬q → ¬p'],
      ['sample.converse', 'p → q', 'q → p'], ['sample.distributivity', 'p ∧ (q ∨ r)', '(p ∧ q) ∨ (p ∧ r)']];
    try {
      const add = ex.map(([k, a, b]) => C.makeSaved({ name: t(k), a, b }, newId())).slice(0, Math.max(0, C.LIMITS.saved - saved.length));
      if (!save({ saved: [...saved, ...add] })) return;
      $('expr-a').value = ex[0][1]; $('expr-b').value = ex[0][2]; dirty = true; flush();
      renderSaved(); render(); say('expr-status', t('sample.added', { n: add.length }), 'ok');
    } catch (err) { say('expr-status', errText(err), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    if (!res) return;
    const headers = [...res.vars, t('csv.a', { expr: res.textA })];
    if (res.b) headers.push(t('csv.b', { expr: res.b.textB }));
    download('logiclab-table.csv', C.truthCSV(res, headers, prefs.order), 'text/csv;charset=utf-8');
    say('expr-status', t('csv.done'), 'ok');
  });
  $('print').addEventListener('click', () => { if (res) window.print(); });
  $('export').addEventListener('click', () => { flush(); try { download('logiclab-backup.json', C.backup({ prefs, draft, saved }), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: saved.length, b: next.saved.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      dirty = false; clearTimeout(saveTimer);
      $('warning').hidden = true; $('export-raw').hidden = true;
      loadInputs(); renderSaved(); render(); stateText();
      say('backup-status', t('backup.restored', { n: next.saved.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('logiclab-raw-storage.txt', raw, 'text/plain'); });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  function loadInputs() { $('expr-a').value = draft.a; $('expr-b').value = draft.b; $('notation').value = prefs.notation; $('order').value = prefs.order; }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) ({ prefs, draft, saved } = C.validateBackup(JSON.parse(raw)));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  loadInputs();
  // Changement de langue : la saisie reste, on retraduit les résultats.
  L.onChange(() => { say('expr-status', ''); say('backup-status', ''); stateText(); renderSaved(); render(); });
  stateText(); renderSaved(); render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
