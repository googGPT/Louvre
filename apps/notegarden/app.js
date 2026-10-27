/* NoteGarden — interface. Logique dans core.js (NoteCore) ; textes dans LouvreI18n (appli sans argent).
   L'affichage est construit nœud par nœud (createElement + textContent) : jamais d'innerHTML. */
(() => {
  'use strict';
  const C = window.NoteCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-notegarden-v1';
  const ACTIVE = 'louvre-notegarden-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  let notes = [], activeId = null, readOnly = false;
  let dirty = false, titleDirty = false, timer = null, previewTimer = null, searchTimer = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return notes.find((n) => n.id === activeId) || null; }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function save(next) {
    if (readOnly) { say('note-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); notes = next; return true; }
    catch (e) { say('note-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function remember(id) { try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort seulement */ } }

  // --- Enregistrement : texte et étiquettes en différé ; le titre à la validation (renommage + liens).
  function stateText() { $('save-state').textContent = readOnly ? t('save.readonly') : (dirty || titleDirty) ? t('save.pending') : t('save.done'); }
  function commitTitle() {
    titleDirty = false;
    const cur = active(); if (!cur) return true;
    const wanted = $('note-title').value;
    if (C.normTitle(wanted) === cur.title) { $('note-title').value = cur.title; return true; }
    try {
      const r = C.renameNote(notes, cur.id, wanted, today());
      if (!save(r.notes)) return false;
      $('note-title').value = active().title;
      say('note-status', r.links ? t('rename.links', { n: r.links, notes: r.changed }) : t('rename.done'), 'ok');
      return true;
    } catch (e) { say('note-status', errText(e), 'error'); return false; }
  }
  function flush() {
    clearTimeout(timer); timer = null;
    const cur = active();
    if (!cur) { dirty = titleDirty = false; return true; }
    let ok = true;
    if (dirty) {
      let tags = cur.tags;
      try { tags = C.parseTags($('note-tags').value); } catch (e) { say('note-status', errText(e), 'error'); ok = false; }
      try { if (save(C.updateNote(notes, cur.id, { body: $('note-body').value, tags }, today()))) dirty = false; else ok = false; }
      catch (e) { say('note-status', errText(e), 'error'); ok = false; dirty = false; }
    }
    if (titleDirty) ok = commitTitle() && ok;
    stateText(); paint();
    return ok;
  }
  // Un enregistrement déclenché par la perte de focus (appui sur un bouton de la liste, par exemple) ne doit pas
  // redessiner la liste entre l'appui et le relâchement : le clic serait perdu. On attend donc la fin du geste.
  let pointerBusy = false, paintPending = false;
  function paint() {
    if (pointerBusy) { paintPending = true; return; }
    paintPending = false; renderList(); renderBacklinks(); renderPreview();
  }
  document.addEventListener('pointerdown', () => { pointerBusy = true; }, true);
  document.addEventListener('click', () => { pointerBusy = false; }, true); // avant les gestionnaires du bouton cliqué
  document.addEventListener('pointerup', () => setTimeout(() => { pointerBusy = false; if (paintPending) paint(); }, 0), true);
  document.addEventListener('pointercancel', () => { pointerBusy = false; if (paintPending) paint(); }, true);

  function onEdit() {
    dirty = true; stateText();
    clearTimeout(timer); timer = setTimeout(flush, 500);
    clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120);
  }

  // --- Affichage d'une note : arbre -> éléments DOM ; les liens internes sont des boutons.
  function wikiLink(node) {
    const target = C.resolve(notes, node.target);
    const b = el('button', target ? 'wikilink' : 'wikilink missing', node.label);
    b.type = 'button';
    b.title = target ? t('link.open', { title: target.title }) : t('link.create', { title: node.target });
    b.addEventListener('click', () => followLink(node.target));
    return b;
  }
  function inline(nodes, parent) {
    for (const n of nodes) {
      if (n.t === 'text') parent.append(document.createTextNode(n.v));
      else if (n.t === 'code') parent.append(el('code', '', n.v));
      else if (n.t === 'strong' || n.t === 'em') { const x = el(n.t); inline(n.c, x); parent.append(x); }
      else if (n.t === 'link') parent.append(wikiLink(n));
    }
  }
  function lines(list, parent) { list.forEach((ln, k) => { if (k) parent.append(el('br')); inline(ln, parent); }); }
  function renderPreview() {
    clearTimeout(previewTimer);
    const box = $('preview'), cur = active();
    if (!cur) { box.replaceChildren(el('p', 'empty', t('preview.none'))); return; }
    const body = $('note-body').value;
    if (!body.trim()) { box.replaceChildren(el('p', 'empty', t('preview.empty'))); return; }
    const frag = document.createDocumentFragment();
    for (const b of C.parse(body)) {
      if (b.t === 'h') { const h = el('h' + (b.level + 2)); inline(b.c, h); frag.append(h); }
      else if (b.t === 'p') { const p = el('p'); lines(b.lines, p); frag.append(p); }
      else if (b.t === 'quote') { const q = el('blockquote'); lines(b.lines, q); frag.append(q); }
      else if (b.t === 'ul') { const u = el('ul'); for (const it of b.items) { const li = el('li'); inline(it, li); u.append(li); } frag.append(u); }
      else if (b.t === 'code') { const pre = el('pre'); pre.append(el('code', '', b.text)); frag.append(pre); }
    }
    box.replaceChildren(frag);
  }

  function renderBacklinks() {
    const ul = $('backlinks'), cur = active();
    if (!cur) { ul.replaceChildren(el('li', 'empty', t('back.none'))); return; }
    const back = C.backlinks(notes, cur).sort((a, b) => a.note.title.localeCompare(b.note.title, L.locale));
    if (!back.length) { ul.replaceChildren(el('li', 'empty', t('back.empty'))); return; }
    ul.replaceChildren(...back.map((b) => {
      const li = el('li'), btn = el('button', 'linkish', b.note.title);
      btn.type = 'button'; btn.addEventListener('click', () => openNote(b.note.id));
      li.append(btn, el('span', 'count', t('back.count', { n: b.count })), el('span', 'ctx', b.context));
      return li;
    }));
  }

  function renderTags() {
    const sel = $('tag-filter'), keep = sel.value;
    const tags = C.tagCounts(notes).sort((a, b) => a.tag.localeCompare(b.tag, L.locale));
    const all = el('option', '', t('filter.all')); all.value = '';
    sel.replaceChildren(all, ...tags.map((x) => { const o = el('option', '', `#${x.tag} (${L.number(x.n)})`); o.value = x.tag; return o; }));
    sel.value = tags.some((x) => x.tag === keep) ? keep : '';
  }
  function snippetEl(s) {
    const p = el('span', 'snippet');
    p.append(document.createTextNode(s.before), el('mark', '', s.match), document.createTextNode(s.after));
    return p;
  }
  function renderList() {
    renderTags();
    const q = $('search').value.trim(), tag = $('tag-filter').value, onlyOrphans = $('only-orphans').checked;
    const incoming = C.incomingCounts(notes);
    let rows;
    if (q) rows = C.search(notes, q);
    else rows = [...notes].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.title.localeCompare(b.title, L.locale))).map((note) => ({ note, snippet: null }));
    if (tag) rows = rows.filter((r) => r.note.tags.includes(tag));
    if (onlyOrphans) rows = rows.filter((r) => incoming.get(r.note.id) === 0);
    const orphanCount = [...incoming.values()].filter((v) => v === 0).length;
    $('summary').textContent = `${t('summary.notes', { n: notes.length })} · ${t('summary.orphans', { n: orphanCount })}`;
    const ul = $('note-list');
    if (!rows.length) ul.replaceChildren(el('li', 'empty', notes.length ? t('list.noMatch') : t('list.empty')));
    else ul.replaceChildren(...rows.map(({ note, snippet }) => {
      const li = el('li'), b = el('button', 'note-btn' + (note.id === activeId ? ' current' : ''));
      b.type = 'button';
      if (note.id === activeId) b.setAttribute('aria-current', 'true');
      b.append(el('b', '', note.title));
      const n = incoming.get(note.id) || 0;
      b.append(el('span', 'meta', `${L.date(note.updated, { day: 'numeric', month: 'short', year: 'numeric' })} · ${n ? t('list.backlinks', { n }) : t('list.orphan')}`));
      if (note.tags.length) b.append(el('span', 'tags', note.tags.map((x) => '#' + x).join(' ')));
      if (snippet) b.append(snippetEl(snippet));
      b.addEventListener('click', () => openNote(note.id));
      li.append(b); return li;
    }));
    const want = C.wanted(notes).sort((a, b) => b.count - a.count || a.target.localeCompare(b.target, L.locale));
    $('wanted-box').hidden = !want.length;
    $('wanted').replaceChildren(...want.slice(0, 40).map((w) => {
      const li = el('li'), b = el('button', 'chip', `${w.target} (${L.number(w.count)})`);
      b.type = 'button'; b.title = t('link.create', { title: w.target });
      b.addEventListener('click', () => followLink(w.target));
      li.append(b); return li;
    }));
    for (const id of ['export-zip', 'export-md', 'export']) $(id).disabled = !notes.length;
  }

  function loadEditor() {
    const cur = active();
    $('no-note').hidden = !!cur; $('editor-box').hidden = !cur;
    $('note-title').value = cur ? cur.title : '';
    $('note-tags').value = cur ? cur.tags.join(', ') : '';
    $('note-body').value = cur ? cur.body : '';
    for (const id of ['note-title', 'note-tags', 'note-body', 'delete-note']) $(id).disabled = !cur || readOnly;
    dirty = titleDirty = false; stateText(); renderPreview(); renderBacklinks();
  }
  function openNote(id) {
    flush(); // un titre refusé est abandonné : l'éditeur se recharge avec la note choisie
    activeId = id; remember(id); loadEditor(); renderList();
    $('note-body').focus();
  }
  function createNote(title, body = '', tags = '') {
    const d = today();
    const next = C.addNote(notes, { title, body, tags, created: d, updated: d }, newId());
    if (!save(next)) return null;
    return next[next.length - 1];
  }
  function followLink(target) {
    flush();
    const found = C.resolve(notes, target);
    if (found) { openNote(found.id); return; }
    try {
      const n = createNote(target);
      if (!n) return;
      activeId = n.id; remember(n.id); loadEditor(); renderList();
      say('note-status', t('note.createdFromLink', { title: n.title }), 'ok');
      $('note-body').focus();
    } catch (e) { say('note-status', errText(e), 'error'); }
  }

  // --- Événements
  $('note-body').addEventListener('input', onEdit);
  $('note-tags').addEventListener('input', onEdit);
  $('note-title').addEventListener('input', () => { titleDirty = true; stateText(); });
  $('note-title').addEventListener('change', () => { if (titleDirty) flush(); });
  $('note-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); flush(); } });
  // Pas d'enregistrement au « blur » : il redessinerait la liste entre l'appui et le relâchement d'un clic.
  // Chaque changement de note, création, suppression ou export force l'enregistrement (flush) à la place.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderList, 150); });
  $('tag-filter').addEventListener('change', renderList);
  $('only-orphans').addEventListener('change', renderList);

  $('new-note').addEventListener('click', () => {
    flush();
    try {
      let k = notes.length + 1, title = t('note.newDefault', { n: k });
      while (C.resolve(notes, title)) title = t('note.newDefault', { n: ++k });
      const n = createNote(title);
      if (!n) return;
      activeId = n.id; remember(n.id); loadEditor(); renderList();
      $('note-title').select(); $('note-title').focus();
      say('note-status', t('note.created'), 'ok');
    } catch (e) { say('note-status', errText(e), 'error'); }
  });
  $('delete-note').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const back = C.backlinks(notes, cur).length;
    if (!confirm(back ? t('confirm.deleteLinked', { title: cur.title, n: back }) : t('confirm.delete', { title: cur.title }))) return;
    clearTimeout(timer); dirty = titleDirty = false;
    if (save(C.deleteNote(notes, cur.id))) { activeId = notes[0] ? notes[0].id : null; remember(activeId); loadEditor(); renderList(); say('note-status', t('note.deleted'), 'ok'); }
  });

  // Exemple : quatre notes reliées, dans la langue affichée (les titres déjà pris sont conservés tels quels).
  $('sample').addEventListener('click', () => {
    flush();
    try {
      const T = [1, 2, 3, 4].map((i) => t('sample.t' + i));
      const specs = [
        [T[0], t('sample.b1', { a: T[1], b: T[2], c: T[3] }), t('sample.tags1')],
        [T[1], t('sample.b2', { a: T[2], b: t('sample.wanted') }), t('sample.tags2')],
        [T[2], t('sample.b3', { a: T[1] }), t('sample.tags3')],
        [T[3], t('sample.b4', { a: T[0] }), t('sample.tags4')],
      ];
      let next = notes, firstId = null;
      const d = today();
      for (const [title, body, tags] of specs) {
        if (C.resolve(next, title)) continue;
        next = C.addNote(next, { title, body, tags, created: d, updated: d }, newId());
        firstId = firstId || next[next.length - 1].id;
      }
      if (next === notes) { say('list-status', t('sample.exists'), 'ok'); return; }
      if (!save(next)) return;
      activeId = firstId; remember(firstId); loadEditor(); renderList();
      say('list-status', t('sample.added'), 'ok');
    } catch (e) { say('list-status', errText(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const sortedNotes = () => [...notes].sort((a, b) => a.title.localeCompare(b.title, L.locale));
  $('export-zip').addEventListener('click', () => {
    flush(); if (!notes.length) return;
    download('notegarden-notes.zip', C.zip(C.noteFiles(sortedNotes())), 'application/zip');
    say('backup-status', t('export.zipDone', { n: notes.length }), 'ok');
  });
  $('export-md').addEventListener('click', () => {
    flush(); if (!notes.length) return;
    download('notegarden-notes.md', C.combinedMarkdown(sortedNotes()), 'text/markdown;charset=utf-8');
    say('backup-status', t('export.mdDone', { n: notes.length }), 'ok');
  });
  $('export').addEventListener('click', () => {
    flush();
    try { download('notegarden-backup.json', C.backup(notes), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 30_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: notes.length, b: next.length }))) return;
      flush();
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      activeId = next[0] ? next[0].id : null; remember(activeId);
      $('warning').hidden = true; $('export-raw').hidden = true;
      for (const id of ['new-note', 'sample']) $(id).disabled = false;
      loadEditor(); renderList();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('notegarden-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) notes = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = notes.some((n) => n.id === last) ? last : (notes[0] ? notes[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  for (const id of ['new-note', 'sample']) $(id).disabled = readOnly;
  // Changement de langue : la saisie en cours reste dans les champs ; on réaffiche le reste.
  L.onChange(() => { say('list-status', ''); say('backup-status', ''); say('note-status', ''); stateText(); renderList(); renderPreview(); renderBacklinks(); });
  loadEditor(); renderList();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
