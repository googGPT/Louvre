/* PeerFeedbackForm — interface. Calculs dans core.js (PeerCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.PeerCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-peerfeedbackform-v1'; // clé de stockage local
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  const empty = () => ({ settings: { ...C.DEFAULT_SETTINGS }, criteria: [], students: [], ratings: [], teamMarks: {} });
  let state = empty();
  let raterId = null; // évaluateur affiché dans la saisie
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cmp = (a, b) => a.localeCompare(b, L.locale, { sensitivity: 'base', numeric: true });
  const num = (x, digits = 2) => (x === null ? '—' : L.number(x, { maximumFractionDigits: digits }));
  const teamName = (team) => team || t('team.none');
  const student = (id) => state.students.find((s) => s.id === id) || null;
  const sortedStudents = () => state.students.slice().sort((a, b) => cmp(a.team, b.team) || cmp(a.name, b.name));

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { const text = C.backup(next); localStorage.setItem(KEY, text); state = C.validateBackup(JSON.parse(text)); return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Un champ invalide garde la valeur tapée quand on réaffiche (changement de langue, autre saisie).
  function keepInvalid(box, build) {
    const kept = [...box.querySelectorAll('[data-key][aria-invalid=true]')].map((n) => [n.dataset.key, n.value]);
    build();
    for (const [k, v] of kept) { const n = box.querySelector(`[data-key="${k}"]`); if (n) { n.value = v; n.setAttribute('aria-invalid', 'true'); } }
  }
  const iconBtn = (symbol, label, action) => { const b = el('button', 'btn icon', symbol); b.type = 'button'; b.dataset.action = action; b.setAttribute('aria-label', label); b.title = label; return b; };

  // --- Grille : réglages et critères
  function fillSettings() {
    const s = state.settings;
    $('s-title').value = s.title; $('s-min').value = String(s.scaleMin); $('s-max').value = String(s.scaleMax); $('s-markmax').value = String(s.markMax); $('s-self').value = s.self;
    for (const id of ['s-title', 's-min', 's-max', 's-markmax']) $(id).removeAttribute('aria-invalid');
  }
  for (const id of ['s-title', 's-min', 's-max', 's-markmax', 's-self']) {
    $(id).addEventListener('change', () => {
      try {
        const next = C.changeSettings(state, {
          title: $('s-title').value, scaleMin: C.parseInt10($('s-min').value, 0, 10, 'err.scaleMin'),
          scaleMax: C.parseInt10($('s-max').value, 1, C.LIMITS.scaleTop, 'err.scaleMax'), markMax: C.parseInt10($('s-markmax').value, 1, C.LIMITS.markMax, 'err.markMax'), self: $('s-self').value,
        });
        for (const f of ['s-title', 's-min', 's-max', 's-markmax']) $(f).removeAttribute('aria-invalid');
        if (save(next)) { say('grid-status', t('grid.saved'), 'ok'); render(); }
      } catch (e) { if (id !== 's-self') $(id).setAttribute('aria-invalid', 'true'); say('grid-status', L.error(e), 'error'); }
    });
  }
  function renderCriteria() {
    const box = $('criteria');
    keepInvalid(box, () => {
      if (!state.criteria.length) { box.replaceChildren(el('li', 'empty', t('crit.empty'))); return; }
      box.replaceChildren(...state.criteria.map((c, i) => {
        const li = el('li', 'crit'); li.dataset.id = c.id;
        const input = el('input'); input.value = c.name; input.maxLength = 80; input.dataset.key = 'crit:' + c.id;
        input.setAttribute('aria-label', t('aria.critName', { n: i + 1 }));
        input.addEventListener('change', () => {
          try {
            const fixed = C.makeCriterion({ name: input.value }, c.id);
            if (save({ ...state, criteria: state.criteria.map((x) => (x.id === c.id ? fixed : x)) })) { input.removeAttribute('aria-invalid'); say('grid-status', t('crit.renamed', { name: fixed.name }), 'ok'); render(); }
          } catch (e) { input.setAttribute('aria-invalid', 'true'); say('grid-status', L.error(e), 'error'); }
        });
        li.append(el('span', 'num-badge', i + 1), input, iconBtn('✕', t('aria.removeCrit', { name: c.name }), 'remove'));
        return li;
      }));
    });
  }
  $('criteria').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action=remove]'); if (!b) return;
    const c = state.criteria.find((x) => x.id === b.closest('li').dataset.id); if (!c) return;
    if (!confirm(t('confirm.removeCrit', { name: c.name }))) return;
    if (save(C.prune({ ...state, criteria: state.criteria.filter((x) => x.id !== c.id) }))) { say('grid-status', t('crit.removed', { name: c.name })); render(); }
  });
  $('crit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (state.criteria.length >= C.LIMITS.criteria) throw new Error(`err.criteriaMany|${JSON.stringify({ max: C.LIMITS.criteria })}`);
      const c = C.makeCriterion({ name: $('c-name').value }, newId());
      if (!save({ ...state, criteria: [...state.criteria, c] })) return;
      $('c-name').value = ''; $('c-name').focus(); say('grid-status', t('crit.added', { name: c.name }), 'ok'); render();
    } catch (err) { say('grid-status', L.error(err), 'error'); }
  });

  // --- Étudiants
  function renderStudents() {
    const box = $('students'), groups = C.teams(state.students, cmp);
    $('team-list').replaceChildren(...groups.filter(Boolean).map((g) => { const o = el('option'); o.value = g; return o; }));
    if (!state.students.length) { box.replaceChildren(el('p', 'empty', t('students.empty'))); return; }
    box.replaceChildren(...groups.map((g) => {
      const wrap = el('div', 'team');
      wrap.append(el('h3', '', t('team.count', { team: teamName(g), n: C.teammates(state.students, g).length })));
      const ul = el('ul', 'list');
      for (const s of C.teammates(state.students, g).slice().sort((a, b) => cmp(a.name, b.name))) {
        const li = el('li'); li.dataset.id = s.id;
        const p = C.progress(state, s.id), txt = el('div', 'txt');
        txt.append(el('b', '', s.name), el('span', p.expected && p.done === p.expected ? 'tag ok' : 'tag', t('students.progress', { done: p.done, expected: p.expected })));
        const acts = el('div', 'acts'); acts.append(iconBtn('✎', t('aria.rate', { name: s.name }), 'rate'), iconBtn('✕', t('aria.removeStudent', { name: s.name }), 'remove'));
        li.append(txt, acts); ul.append(li);
      }
      wrap.append(ul); return wrap;
    }));
  }
  $('students').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]'); if (!b) return;
    const s = student(b.closest('li').dataset.id); if (!s) return;
    if (b.dataset.action === 'rate') { raterId = s.id; renderEntry(); $('rater').focus(); $('h-entry').scrollIntoView({ block: 'start' }); return; }
    if (!confirm(t('confirm.removeStudent', { name: s.name }))) return;
    if (save(C.prune({ ...state, students: state.students.filter((x) => x.id !== s.id) }))) { if (raterId === s.id) raterId = null; say('students-status', t('students.removed', { name: s.name })); render(); }
  });
  $('stud-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      if (state.students.length >= C.LIMITS.students) throw new Error(`err.studentsMany|${JSON.stringify({ max: C.LIMITS.students })}`);
      const s = C.makeStudent({ name: $('st-name').value, team: $('st-team').value }, newId());
      if (C.teammates(state.students, s.team).length >= C.LIMITS.teamSize) throw new Error(`err.teamSize|${JSON.stringify({ max: C.LIMITS.teamSize })}`);
      if (C.teammates(state.students, s.team).some((x) => cmp(x.name, s.name) === 0)) throw new Error('err.duplicate');
      if (!save({ ...state, students: [...state.students, s] })) return;
      $('st-name').value = ''; $('st-name').focus();
      say('students-status', t('students.added', { name: s.name, team: teamName(s.team) }), 'ok'); if (!raterId) raterId = s.id; render();
    } catch (err) { say('students-status', L.error(err), 'error'); }
  });

  // --- Saisie : un tableau évalués × critères pour l'évaluateur choisi.
  function renderEntry() {
    const sel = $('rater'), list = sortedStudents();
    if (!student(raterId)) raterId = list[0] ? list[0].id : null;
    const byTeam = new Map();
    for (const s of list) { if (!byTeam.has(s.team)) byTeam.set(s.team, []); byTeam.get(s.team).push(s); }
    sel.replaceChildren(...[...byTeam.entries()].map(([g, members]) => {
      const og = el('optgroup'); og.label = teamName(g);
      for (const s of members) { const o = el('option', '', s.name); o.value = s.id; og.append(o); }
      return og;
    }));
    sel.disabled = !list.length; $('next-rater').disabled = list.length < 2;
    if (raterId) sel.value = raterId;
    const box = $('entry'), rater = student(raterId);
    if (!rater || !state.criteria.length) {
      box.replaceChildren(el('p', 'empty', !state.criteria.length ? t('entry.needCriteria') : t('entry.needStudents')));
      $('rater-progress').textContent = ''; return;
    }
    const table = el('table', 'grid-table'), head = el('tr');
    head.append(el('th', '', t('th.ratee')), ...state.criteria.map((c) => el('th', '', c.name)), el('th', '', t('th.state')));
    const tbody = el('tbody');
    for (const s of C.teammates(state.students, rater.team).slice().sort((a, b) => (a.id === rater.id ? -1 : b.id === rater.id ? 1 : cmp(a.name, b.name)))) {
      const isSelf = s.id === rater.id, r = state.ratings.find((x) => x.rater === rater.id && x.ratee === s.id);
      const tr = el('tr', isSelf ? 'self' : ''); tr.dataset.ratee = s.id;
      const name = el('th', ''); name.scope = 'row'; name.append(el('span', '', s.name));
      if (isSelf) name.append(el('small', '', state.settings.self === 'include' ? t('entry.selfIn') : t('entry.selfOut')));
      tr.append(name);
      for (const c of state.criteria) {
        const td = el('td'), sel2 = el('select');
        sel2.dataset.crit = c.id; sel2.setAttribute('aria-label', t('aria.score', { ratee: s.name, crit: c.name }));
        sel2.append(Object.assign(el('option', '', '—'), { value: '' }));
        for (let v = state.settings.scaleMin; v <= state.settings.scaleMax; v += 1) { const o = el('option', '', L.number(v)); o.value = String(v); sel2.append(o); }
        sel2.value = r && r.scores[c.id] !== undefined ? String(r.scores[c.id]) : '';
        td.append(sel2); tr.append(td);
      }
      tr.append(el('td', 'state', r && C.complete(r, state.criteria) ? '✓' : ''));
      tbody.append(tr);
    }
    const thead = el('thead'); thead.append(head); table.append(thead, tbody);
    box.replaceChildren(table);
    renderProgress();
  }
  function renderProgress() {
    const rater = student(raterId); if (!rater) return;
    const p = C.progress(state, rater.id);
    $('rater-progress').textContent = t('entry.progress', { done: p.done, expected: p.expected });
    $('rater-progress').className = 'pill-info' + (p.expected && p.done === p.expected ? ' ok' : '');
  }
  $('rater').addEventListener('change', () => { raterId = $('rater').value; say('entry-status', ''); renderEntry(); });
  $('next-rater').addEventListener('click', () => {
    const list = sortedStudents(), i = list.findIndex((s) => s.id === raterId);
    if (!list.length) return;
    raterId = list[(i + 1) % list.length].id; renderEntry(); say('entry-status', t('entry.now', { name: student(raterId).name })); $('rater').focus();
  });
  $('entry').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-crit]'); if (!sel) return;
    const ratee = sel.closest('tr').dataset.ratee;
    try {
      const ratings = C.setScore(state, raterId, ratee, sel.dataset.crit, sel.value === '' ? null : Number(sel.value));
      if (!save({ ...state, ratings })) return;
      const r = state.ratings.find((x) => x.rater === raterId && x.ratee === ratee);
      sel.closest('tr').querySelector('.state').textContent = r && C.complete(r, state.criteria) ? '✓' : '';
      say('entry-status', t('entry.saved', { rater: student(raterId).name, ratee: student(ratee).name }), 'ok');
      renderProgress(); renderStudents(); renderResults();
    } catch (err) { say('entry-status', L.error(err), 'error'); }
  });

  // --- Résultats par équipe
  function renderResults() {
    const box = $('results'), rows = C.results(state, cmp);
    $('export-csv').disabled = !rows.length;
    keepInvalid(box, () => {
      if (!rows.length || !state.criteria.length) { box.replaceChildren(el('p', 'empty', t('results.empty'))); return; }
      box.replaceChildren(...C.teams(state.students, cmp).map((g, gi) => {
        const w = C.webpa(state, g), wrap = el('div', 'team-result');
        const head = el('div', 'team-head');
        head.append(el('h3', '', teamName(g)));
        const lab = el('label', 'field mark'), inp = el('input');
        inp.dataset.key = 'mark:' + gi; inp.dataset.team = g; inp.inputMode = 'decimal';
        inp.value = state.teamMarks[g] === undefined ? '' : L.number(state.teamMarks[g] / 100, { maximumFractionDigits: 2, useGrouping: false });
        lab.append(el('span', '', t('results.teamMark', { max: state.settings.markMax })), inp); head.append(lab);
        wrap.append(head);
        const info = [t('results.raters', { s: w.submitted, n: w.size })];
        for (const sk of w.skipped) info.push(t('results.skipped.' + sk.reason, { name: student(sk.id).name }));
        wrap.append(el('p', 'hint', info.join(' · ')));
        const table = el('table', 'grid-table results'), hr = el('tr');
        for (const [txt, cls] of [[t('th.student'), ''], [t('th.n'), 'num'], [t('th.mean'), 'num'], [t('th.sd'), 'num'], [t('th.self'), 'num'], [t('th.factor'), 'num'], [t('th.mark'), 'num']]) hr.append(el('th', cls, txt));
        const tb = el('tbody');
        for (const r of rows.filter((x) => x.team === g)) {
          const tr = el('tr'); tr.dataset.id = r.id;
          const nm = el('th'); nm.scope = 'row'; nm.append(el('span', '', r.name));
          if (r.skipped) nm.append(el('small', '', t('results.notCounted')));
          const selfTxt = r.self === null ? '—' : num(r.self) + (r.selfGap === null ? '' : ` (${r.selfGap > 0 ? '+' : ''}${num(r.selfGap)})`);
          tr.append(nm, el('td', 'num', L.number(r.n)), el('td', 'num', num(r.mean)), el('td', 'num', num(r.sd)), el('td', 'num', selfTxt),
            el('td', 'num factor' + (r.factor === null ? '' : r.factor > 1 ? ' up' : r.factor < 1 ? ' down' : ''), num(r.factor, 3)),
            el('td', 'num', r.mark === null ? '—' : `${num(r.mark / 100)} / ${L.number(state.settings.markMax)}`));
          tb.append(tr);
        }
        const th = el('thead'); th.append(hr); table.append(th, tb);
        const sc = el('div', 'scroll'); sc.append(table); wrap.append(sc);
        return wrap;
      }));
    });
  }
  $('results').addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-team]'); if (!inp) return;
    try {
      const h = C.parseMark(inp.value, state.settings.markMax), team = inp.dataset.team;
      const teamMarks = { ...state.teamMarks }; if (h === null) delete teamMarks[team]; else teamMarks[team] = h;
      inp.removeAttribute('aria-invalid');
      if (save({ ...state, teamMarks })) { say('results-status', t('results.markSaved', { team: teamName(team) }), 'ok'); renderResults(); }
    } catch (err) { inp.setAttribute('aria-invalid', 'true'); say('results-status', L.error(err), 'error'); }
  });

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    const texts = {
      head: { team: t('csv.team'), student: t('th.student'), n: t('th.n'), mean: t('th.mean'), sd: t('th.sd'), self: t('th.self'), factor: t('th.factor'), teamMark: t('csv.teamMark'), mark: t('th.mark'), given: t('csv.given') },
      delimiter: L.lang === 'en' ? ',' : ';', number: (n) => L.number(n, { maximumFractionDigits: 3, useGrouping: false }), compare: cmp,
    };
    const csvState = { ...state, students: state.students.map((s) => ({ ...s, team: teamName(s.team) })), teamMarks: Object.fromEntries(Object.entries(state.teamMarks).map(([k, v]) => [teamName(k), v])) };
    download('peerfeedbackform.csv', C.csv(csvState, texts), 'text/csv;charset=utf-8');
    say('results-status', t('csv.done'), 'ok');
  });

  // --- Exemple dans la langue affichée : 2 équipes de 4, 3 critères, une évaluation manquante.
  $('sample').addEventListener('click', () => {
    if (state.students.length && !confirm(t('confirm.sample'))) return;
    try {
      const settings = C.makeSettings({ title: t('sample.title'), scaleMin: 1, scaleMax: 5, self: 'exclude', markMax: 20 });
      const criteria = [1, 2, 3].map((n) => C.makeCriterion({ name: t('sample.c' + n) }, newId()));
      const names = t('sample.names').split(/[,،]/).map((x) => x.trim()).slice(0, 8);
      const students = names.map((name, i) => C.makeStudent({ name, team: t('sample.team', { n: i < 4 ? 1 : 2 }) }, newId()));
      let next = { settings, criteria, students, ratings: [], teamMarks: {} };
      const level = [5, 4, 3, 2, 4, 4, 3, 5]; // contribution « réelle » simulée de chaque étudiant
      students.forEach((rater, i) => {
        if (i === 7) return; // le dernier n'a pas répondu
        students.forEach((ratee, j) => {
          if (rater.team !== ratee.team || i === j) return;
          criteria.forEach((c, k) => { next = { ...next, ratings: C.setScore(next, rater.id, ratee.id, c.id, Math.max(1, Math.min(5, level[j] - ((i + j + k) % 4 === 0 ? 1 : 0)))) }; });
        });
      });
      next = { ...next, teamMarks: { [students[0].team]: 1500, [students[4].team]: 1200 } };
      if (!save(next)) return;
      raterId = students[0].id; fillSettings(); say('sample-status', t('sample.added'), 'ok'); render();
    } catch (err) { say('sample-status', L.error(err), 'error'); }
  });

  function render() { renderCriteria(); renderStudents(); renderEntry(); renderResults(); }

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('peerfeedbackform-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: state.students.length, b: next.students.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; raterId = null; fillSettings(); render();
      say('backup-status', t('backup.restored', { n: next.students.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* rien */ } download('peerfeedbackform-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  fillSettings();
  L.onChange(() => { for (const id of ['sample-status', 'grid-status', 'students-status', 'entry-status', 'results-status', 'backup-status']) say(id, ''); render(); });
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
