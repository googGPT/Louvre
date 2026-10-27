/* GroupAllocator — interface. Calculs dans core.js (GroupCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.GroupCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-groupallocator-v1'; // clé de stockage local
  const ACTIVE = 'louvre-groupallocator-active'; // classe affichée (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const DEFAULT_SETTINGS = { mode: 'size', value: 4, balance: false, seed: '1', attrName: '' };
  const SAMPLE_NAMES = ['Ana', 'Bilal', 'Chloé', 'David', 'Emma', 'Farid', 'Giulia', 'Hugo', 'Inès', 'Jonas', 'Kenza', 'Léo', 'Maya', 'Noah', 'Olga', 'Paul', 'Rania', 'Sami'];

  let classes = [];
  let classId = null; // classe affichée
  let readOnly = false; // stockage illisible : aucune écriture

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const cls = () => classes.find((c) => c.id === classId) || null;
  const byName = (a, b) => a.name.localeCompare(b.name, L.locale);
  const nameOf = (c, id) => { const s = c.students.find((x) => x.id === id); return s ? s.name : '?'; };
  const attrTitle = (c) => (c && c.settings.attrName) || t('f.attr');

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); classes = C.validateBackup(JSON.parse(localStorage.getItem(KEY))); return true; }
    catch (e) { say('class-status', L.error(e), 'error'); return false; }
  }
  // Valide la classe modifiée avant d'écrire ; l'erreur (clé traduite) est renvoyée à l'appelant.
  function saveClass(next) { const valid = C.makeClass(next); return save(classes.map((c) => (c.id === valid.id ? valid : c))); }
  function ensureClass() {
    if (cls()) return true;
    if (classes.length) { classId = classes[0].id; return true; }
    const first = C.makeClass({ id: newId(), name: t('class.defaultName'), students: [], constraints: [], settings: DEFAULT_SETTINGS });
    if (!save([first])) return false;
    classId = first.id; return true;
  }

  // --- Classes
  function renderClasses() {
    const sel = $('class-select');
    sel.replaceChildren(...classes.map((c) => { const o = el('option', '', `${c.name} (${c.students.length})`); o.value = c.id; return o; }));
    if (!classes.length) { const o = el('option', '', t('class.none')); o.value = ''; sel.append(o); }
    sel.value = classId || '';
    $('rename-class').disabled = $('delete-class').disabled = !cls();
  }
  $('class-select').addEventListener('change', (e) => { classId = e.target.value || null; try { localStorage.setItem(ACTIVE, classId || ''); } catch (_) { /* confort */ } render(); });
  $('new-class').addEventListener('click', () => {
    if (classes.length >= C.LIMITS.classes) { say('class-status', t('err.tooManyClasses', { max: C.LIMITS.classes }), 'error'); return; }
    const name = prompt(t('prompt.new'), t('class.newDefault', { n: classes.length + 1 }));
    if (name === null) return;
    try { const c = C.makeClass({ id: newId(), name, students: [], constraints: [], settings: DEFAULT_SETTINGS }); if (save([...classes, c])) { classId = c.id; render(); } } catch (e) { say('class-status', L.error(e), 'error'); }
  });
  $('rename-class').addEventListener('click', () => {
    const c = cls(); if (!c) return;
    const name = prompt(t('prompt.rename'), c.name);
    if (name === null) return;
    try { if (saveClass({ ...c, name })) render(); } catch (e) { say('class-status', L.error(e), 'error'); }
  });
  $('delete-class').addEventListener('click', () => {
    const c = cls(); if (!c || !confirm(t('confirm.deleteClass', { name: c.name, n: c.students.length }))) return;
    if (save(classes.filter((x) => x.id !== c.id))) { classId = classes[0] ? classes[0].id : null; render(); }
  });

  // --- Étudiants
  function renderStudents() {
    const c = cls(), list = $('students');
    $('attr-name').value = c ? c.settings.attrName : '';
    $('attr-label-form').textContent = attrTitle(c);
    $('student-count').textContent = t('students.count', { n: c ? c.students.length : 0 });
    $('clear-students').disabled = !c || !c.students.length;
    if (!c || !c.students.length) { list.replaceChildren(el('li', 'empty', t('students.empty'))); return; }
    list.replaceChildren(...c.students.slice().sort(byName).map((s) => {
      const li = el('li', 'chip'); li.append(el('span', 'nm', s.name));
      if (s.attr) li.append(el('span', 'tag', s.attr));
      const del = el('button', 'x', '✕'); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeStudent', { name: s.name })); del.title = t('btn.remove');
      del.addEventListener('click', () => removeStudent(s)); li.append(del); return li;
    }));
  }
  function removeStudent(s) {
    const c = cls(); if (!c) return;
    const linked = c.constraints.filter((x) => x.a === s.id || x.b === s.id).length;
    if (linked && !confirm(t('confirm.removeStudent', { name: s.name, n: linked }))) return;
    try { if (saveClass({ ...c, students: c.students.filter((x) => x.id !== s.id), constraints: c.constraints.filter((x) => x.a !== s.id && x.b !== s.id) })) { say('student-status', t('students.removed', { name: s.name }), 'ok'); render(); } }
    catch (e) { say('student-status', L.error(e), 'error'); }
  }
  function addStudents(list) {
    if (!ensureClass()) return false;
    const c = cls();
    if (c.students.length + list.length > C.LIMITS.students) throw new Error(`err.tooManyStudents|${JSON.stringify({ max: C.LIMITS.students })}`);
    const added = list.map((s) => C.makeStudent({ id: newId(), name: s.name, attr: s.attr }));
    return saveClass({ ...c, students: [...c.students, ...added] });
  }
  $('student-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      if (addStudents([{ name: f.name.value, attr: f.attr.value }])) { say('student-status', t('students.added', { name: f.name.value.trim() }), 'ok'); f.name.value = ''; f.name.focus(); render(); }
    } catch (err) { say('student-status', L.error(err), 'error'); }
  });
  $('roster-import').addEventListener('click', () => {
    try {
      const list = C.parseRoster($('roster-text').value, $('roster-header').checked);
      if (!list.length) throw new Error('err.rosterEmpty');
      if (addStudents(list)) { $('roster-text').value = ''; say('student-status', t('students.imported', { n: list.length }), 'ok'); render(); }
    } catch (err) { say('student-status', L.error(err), 'error'); }
  });
  $('roster-file').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 200000) { say('student-status', t('err.fileBig'), 'error'); return; }
    $('roster-text').value = await file.text();
    say('student-status', t('import.loaded', { name: file.name }), 'ok');
  });
  $('clear-students').addEventListener('click', () => {
    const c = cls(); if (!c || !confirm(t('confirm.clear', { n: c.students.length }))) return;
    try { if (saveClass({ ...c, students: [], constraints: [] })) { say('student-status', t('students.cleared'), 'ok'); render(); } } catch (e) { say('student-status', L.error(e), 'error'); }
  });
  $('attr-name').addEventListener('change', () => commitSettings({ attrName: $('attr-name').value }, $('attr-name')));

  // --- Contraintes
  function renderConstraints() {
    const c = cls(), list = $('constraints');
    const opts = c ? c.students.slice().sort(byName) : [];
    for (const name of ['a', 'b']) {
      const sel = $('constraint-form')[name], prev = sel.value;
      sel.replaceChildren(...opts.map((s) => { const o = el('option', '', s.name); o.value = s.id; return o; }));
      if (opts.some((s) => s.id === prev)) sel.value = prev; else if (name === 'b' && opts[1]) sel.value = opts[1].id;
    }
    $('constraint-form').querySelector('button').disabled = opts.length < 2;
    if (!c || !c.constraints.length) { list.replaceChildren(el('li', 'empty', t('cons.empty'))); return; }
    list.replaceChildren(...c.constraints.map((x) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('span', 'tag ' + x.type, t('type.' + x.type)), el('b', '', t('cons.' + x.type, { a: nameOf(c, x.a), b: nameOf(c, x.b) })));
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.removeConstraint', { a: nameOf(c, x.a), b: nameOf(c, x.b) }));
      del.addEventListener('click', () => { try { if (saveClass({ ...c, constraints: c.constraints.filter((y) => y.id !== x.id) })) { say('constraint-status', t('cons.removed'), 'ok'); render(); } } catch (e) { say('constraint-status', L.error(e), 'error'); } });
      li.append(txt, del); return li;
    }));
  }
  $('constraint-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget, c = cls(); if (!c) return;
    try {
      if (c.constraints.length >= C.LIMITS.constraints) throw new Error(`err.tooManyConstraints|${JSON.stringify({ max: C.LIMITS.constraints })}`);
      const x = C.makeConstraint({ id: newId(), type: f.type.value, a: f.a.value, b: f.b.value }, c.students);
      if (saveClass({ ...c, constraints: [...c.constraints, x] })) { say('constraint-status', t('cons.added'), 'ok'); render(); }
    } catch (err) { say('constraint-status', L.error(err), 'error'); }
  });

  // --- Réglages et groupes
  function commitSettings(patch, target) {
    if (!ensureClass()) return;
    const c = cls();
    try {
      if (saveClass({ ...c, settings: { ...c.settings, ...patch } })) { if (target) target.removeAttribute('aria-invalid'); say('settings-status', ''); render(); }
    } catch (e) { if (target) target.setAttribute('aria-invalid', 'true'); say('settings-status', L.error(e), 'error'); }
  }
  $('mode-size').addEventListener('change', () => commitSettings({ mode: 'size' }));
  $('mode-count').addEventListener('change', () => commitSettings({ mode: 'count' }));
  $('group-value').addEventListener('change', () => commitSettings({ value: $('group-value').value }, $('group-value')));
  $('balance').addEventListener('change', () => commitSettings({ balance: $('balance').checked }));
  $('seed').addEventListener('change', () => commitSettings({ seed: $('seed').value }, $('seed')));
  $('reseed').addEventListener('click', () => { const r = new Uint32Array(1); crypto.getRandomValues(r); commitSettings({ seed: String(r[0] % 1000000) }); say('settings-status', t('seed.new'), 'ok'); });

  function issueText(c, x) {
    switch (x.type) {
      case 'conflict': return t('issue.conflict', { a: nameOf(c, x.a), b: nameOf(c, x.b) });
      case 'blockTooBig': return t('issue.blockTooBig', { names: x.members.map((id) => nameOf(c, id)).join(', '), size: x.size, max: x.max });
      case 'apart': return t('issue.apart', { a: nameOf(c, x.a), b: nameOf(c, x.b), g: x.group });
      case 'overflow': return t('issue.overflow', { g: x.group, size: x.size, cap: x.cap });
      case 'capped': return t('issue.capped', { k: x.k });
      default: return x.type;
    }
  }
  let last = null; // dernier résultat (pour l'export CSV)
  function renderGroups() {
    const c = cls(), s = c ? c.settings : DEFAULT_SETTINGS;
    $('mode-size').checked = s.mode === 'size'; $('mode-count').checked = s.mode === 'count';
    $('value-label').textContent = s.mode === 'size' ? t('f.valueSize') : t('f.valueCount');
    $('group-value').value = String(s.value); $('seed').value = s.seed; $('balance').checked = s.balance;
    $('balance-label').textContent = t('f.balanceNamed', { attr: attrTitle(c) });
    const report = $('report'), box = $('groups');
    last = null; $('export-csv').disabled = true;
    if (!c || !c.students.length) { report.replaceChildren(); report.className = 'report'; box.replaceChildren(el('p', 'empty', t('groups.empty'))); return; }
    const res = C.allocate(c); last = res; $('export-csv').disabled = false;
    const head = el('strong', '', t('groups.summary', { n: res.groups.length, students: c.students.length }));
    const items = res.issues.map((x) => el('li', '', issueText(c, x)));
    const parts = [head];
    if (items.length) { const ul = el('ul'); ul.append(...items); parts.push(el('span', '', t('issue.title', { n: items.length })), ul); }
    else parts.push(el('span', '', c.constraints.length ? t('issue.none') : t('issue.noRules')));
    if (s.balance) {
      if (!res.balance.length) parts.push(el('span', 'muted', t('balance.noValues', { attr: attrTitle(c) })));
      for (const b of res.balance) parts.push(el('span', 'muted', b.min === b.max ? t('balance.even', { value: b.value, n: b.min }) : t('balance.range', { value: b.value, min: b.min, max: b.max })));
    }
    report.replaceChildren(...parts); report.className = 'report ' + (items.length ? 'bad' : 'ok');
    const byId = new Map(c.students.map((x) => [x.id, x]));
    box.replaceChildren(...res.groups.map((g) => {
      const card = el('article', 'group'), h = el('h3');
      h.append(el('span', '', t('group.n', { n: g.index })), el('small', '', `${L.number(g.members.length)} / ${L.number(g.cap)}`));
      const ul = el('ul');
      for (const st of g.members.map((id) => byId.get(id)).sort(byName)) { const li = el('li'); li.append(el('span', '', st.name)); if (st.attr) li.append(el('span', 'tag', st.attr)); ul.append(li); }
      card.append(h, ul); return card;
    }));
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'groupes';
  $('export-csv').addEventListener('click', () => {
    const c = cls(); if (!c || !last) return;
    const texts = { head: [t('csv.group'), t('csv.student'), attrTitle(c)], group: (n) => t('group.n', { n }), delimiter: L.lang === 'en' ? ',' : ';' };
    download(`groupallocator-${fileName(c.name)}.csv`, C.csv(c, last, texts), 'text/csv;charset=utf-8');
    say('groups-status', t('csv.done'), 'ok');
  });

  // --- Exemple (dans la langue affichée)
  $('sample').addEventListener('click', () => {
    try {
      if (classes.length >= C.LIMITS.classes) throw new Error(`err.tooManyClasses|${JSON.stringify({ max: C.LIMITS.classes })}`);
      const attrs = [t('sample.attr1'), t('sample.attr2'), t('sample.attr3')];
      const students = SAMPLE_NAMES.map((name, i) => ({ id: newId(), name, attr: attrs[i % 3] }));
      const constraints = [{ id: newId(), type: 'apart', a: students[0].id, b: students[1].id }, { id: newId(), type: 'together', a: students[2].id, b: students[3].id }];
      const c = C.makeClass({ id: newId(), name: t('sample.class'), students, constraints, settings: { mode: 'size', value: 4, balance: true, seed: '2026', attrName: t('sample.attrName') } });
      if (save([...classes, c])) { classId = c.id; render(); say('class-status', t('sample.added'), 'ok'); }
    } catch (e) { say('class-status', L.error(e), 'error'); }
  });

  // --- Sauvegardes
  $('export').addEventListener('click', () => {
    try { download('groupallocator-backup.json', C.backup(classes), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: classes.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      classId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; render();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('groupallocator-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderClasses(); renderStudents(); renderConstraints(); renderGroups(); }
  // Changement de langue : on réaffiche sans perdre ce qui est en cours de saisie.
  function preserve(fn) {
    const kept = new Map([...document.querySelectorAll('[data-keep]')].map((n) => [n.dataset.keep, n.type === 'checkbox' ? n.checked : n.value]));
    fn();
    document.querySelectorAll('[data-keep]').forEach((n) => { if (!kept.has(n.dataset.keep)) return; if (n.type === 'checkbox') n.checked = kept.get(n.dataset.keep); else n.value = kept.get(n.dataset.keep); });
  }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) classes = C.validateBackup(JSON.parse(raw));
    const lastId = localStorage.getItem(ACTIVE);
    classId = classes.some((c) => c.id === lastId) ? lastId : (classes[0] ? classes[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => preserve(() => { for (const id of ['class-status', 'student-status', 'constraint-status', 'settings-status', 'groups-status', 'backup-status']) say(id, ''); render(); }));
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
