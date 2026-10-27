/* MarkdownDesk — interface. Analyse dans core.js (MdCore) ; textes dans LouvreI18n (appli sans argent).
   L'aperçu est construit nœud par nœud (createElement + textContent) : jamais d'innerHTML. */
(() => {
  'use strict';
  const C = window.MdCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-markdowndesk-v1';
  const ACTIVE = 'louvre-markdowndesk-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  let docs = [], activeId = null, readOnly = false;
  let dirty = false, timer = null, previewTimer = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return docs.find((d) => d.id === activeId) || null; }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); docs = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }

  // --- Aperçu : arbre -> éléments DOM (textes posés avec textContent, liens revérifiés)
  const ALIGN = { start: 'start', end: 'end', center: 'center' };
  function inline(nodes, parent) {
    for (const n of nodes) {
      if (n.t === 'text') parent.append(document.createTextNode(n.v));
      else if (n.t === 'code') parent.append(el('code', '', n.v));
      else if (n.t === 'br') parent.append(el('br'));
      else if (n.t === 'em' || n.t === 'strong' || n.t === 'del') { const x = el(n.t); inline(n.c, x); parent.append(x); }
      else if (n.t === 'link') {
        const href = C.safeUrl(n.href);
        if (!href) { inline(n.c, parent); continue; }
        const a = el('a'); a.href = href; a.rel = 'noopener noreferrer'; a.target = '_blank'; inline(n.c, a); parent.append(a);
      }
    }
  }
  function blocks(list, parent, tight = false) {
    for (const b of list) {
      if (b.t === 'p') { if (tight) inline(b.c, parent); else { const p = el('p'); inline(b.c, p); parent.append(p); } }
      else if (b.t === 'h') { const h = el('h' + Math.min(6, Math.max(1, b.level))); inline(b.c, h); parent.append(h); }
      else if (b.t === 'hr') parent.append(el('hr'));
      else if (b.t === 'code') { const pre = el('pre'), code = el('code', '', b.text); pre.append(code); parent.append(pre); }
      else if (b.t === 'quote') { const q = el('blockquote'); blocks(b.c, q); parent.append(q); }
      else if (b.t === 'ul' || b.t === 'ol') {
        const l = el(b.t); if (b.t === 'ol' && b.start !== 1) l.start = b.start;
        for (const it of b.items) { const li = el('li'); blocks(it, li, true); l.append(li); }
        parent.append(l);
      } else if (b.t === 'table') {
        const wrap = el('div', 'tbl-wrap'), table = el('table'), thead = el('thead'), hr = el('tr'), tbody = el('tbody');
        const cell = (tag, c, k) => { const x = el(tag); if (b.align[k]) x.style.textAlign = ALIGN[b.align[k]]; inline(c, x); return x; };
        b.head.forEach((c, k) => hr.append(cell('th', c, k))); thead.append(hr);
        for (const r of b.rows) { const tr = el('tr'); r.forEach((c, k) => tr.append(cell('td', c, k))); tbody.append(tr); }
        table.append(thead, tbody); wrap.append(table); parent.append(wrap);
      }
    }
  }
  function renderPreview() {
    const box = $('preview'), body = $('editor').value;
    const s = C.stats(body);
    $('stats').textContent = t('stats', { n: s.words, chars: L.number(s.chars) });
    if (!body.trim()) { box.replaceChildren(el('p', 'empty', t('preview.empty'))); return; }
    const frag = document.createDocumentFragment();
    blocks(C.parse(body), frag);
    box.replaceChildren(frag);
  }

  // --- Enregistrement différé de la saisie
  function stateText() { $('save-state').textContent = readOnly ? t('save.readonly') : dirty ? t('save.pending') : t('save.done'); }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!dirty) return true;
    const cur = active(); if (!cur) return true;
    try {
      const doc = C.makeDoc({ title: $('doc-title').value.trim() || t('doc.untitled'), body: $('editor').value, updated: today() }, cur.id);
      if (save(docs.map((d) => (d.id === cur.id ? doc : d)))) { dirty = false; renderDocs(); }
    } catch (e) { say('docs-status', errText(e), 'error'); }
    stateText();
    return !dirty;
  }
  function onEdit() {
    dirty = true; stateText();
    clearTimeout(timer); timer = setTimeout(flush, 500);
    clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120);
  }

  function renderDocs() {
    const sel = $('doc-select');
    const sorted = [...docs].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.title.localeCompare(b.title, L.locale)));
    sel.replaceChildren(...sorted.map((d) => { const o = el('option', '', `${d.title} — ${L.date(d.updated, { day: 'numeric', month: 'short' })}`); o.value = d.id; return o; }));
    if (activeId) sel.value = activeId;
    $('delete-doc').disabled = !active();
    for (const id of ['export-md', 'export-html']) $(id).disabled = !active();
  }
  function loadEditor() { // affiche le document actif dans l'éditeur
    const cur = active();
    $('doc-title').value = cur ? cur.title : '';
    $('editor').value = cur ? cur.body : '';
    $('editor').disabled = $('doc-title').disabled = !cur || readOnly;
    dirty = false; stateText(); renderPreview();
  }
  function createDoc(title, body) {
    if (docs.length >= C.MAX.docs) throw new Error(`err.tooManyDocs|${JSON.stringify({ max: C.MAX.docs })}`);
    const d = C.makeDoc({ title, body, updated: today() }, newId());
    if (!save([...docs, d])) return false;
    activeId = d.id; try { localStorage.setItem(ACTIVE, d.id); } catch (_) { /* confort */ }
    renderDocs(); loadEditor(); return true;
  }

  // --- Événements de l'éditeur
  $('editor').addEventListener('input', onEdit);
  $('doc-title').addEventListener('input', onEdit);
  $('editor').addEventListener('blur', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  // Barre d'outils : entoure la sélection ou préfixe les lignes.
  const WRAP = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'] };
  document.querySelectorAll('.tool').forEach((btn) => btn.addEventListener('click', () => {
    const ta = $('editor'); if (ta.disabled) return;
    const kind = btn.dataset.md, a = ta.selectionStart, b = ta.selectionEnd, sel = ta.value.slice(a, b);
    if (WRAP[kind]) { const [l, r] = WRAP[kind]; ta.setRangeText(l + (sel || t('tool.textPh')) + r, a, b, 'select'); }
    else if (kind === 'link') ta.setRangeText(`[${sel || t('tool.textPh')}](https://)`, a, b, 'end');
    else if (kind === 'table') ta.setRangeText(`\n| ${t('tool.col')} 1 | ${t('tool.col')} 2 |\n|---|---|\n|  |  |\n`, a, b, 'end');
    else {
      const prefix = { heading: '## ', list: '- ', quote: '> ' }[kind];
      const start = ta.value.lastIndexOf('\n', a - 1) + 1;
      const block = ta.value.slice(start, b);
      ta.setRangeText(block.split('\n').map((x) => prefix + x).join('\n'), start, b, 'end');
    }
    ta.focus(); onEdit();
  }));

  // --- Documents
  $('doc-select').addEventListener('change', (e) => { flush(); activeId = e.target.value; try { localStorage.setItem(ACTIVE, activeId); } catch (_) { /* confort */ } renderDocs(); loadEditor(); });
  $('new-doc').addEventListener('click', () => { flush(); try { if (createDoc(t('doc.newDefault', { n: docs.length + 1 }), '')) { $('doc-title').select(); say('docs-status', t('docs.created'), 'ok'); } } catch (e) { say('docs-status', errText(e), 'error'); } });
  $('delete-doc').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.title }))) return;
    clearTimeout(timer); dirty = false;
    if (save(docs.filter((d) => d.id !== cur.id))) { activeId = docs[0] ? docs[0].id : null; renderDocs(); loadEditor(); say('docs-status', t('docs.deleted'), 'ok'); }
  });
  $('sample').addEventListener('click', () => { flush(); try { if (createDoc(t('sample.title'), t('sample.body'))) say('docs-status', t('sample.added'), 'ok'); } catch (e) { say('docs-status', errText(e), 'error'); } });
  $('import-md').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('err.fileBig');
      const text = await file.text();
      const title = file.name.replace(/\.(md|markdown|txt)$/i, '').slice(0, C.MAX.title) || t('doc.untitled');
      flush();
      if (createDoc(title, text)) say('docs-status', t('docs.imported', { name: title }), 'ok');
    } catch (e) { say('docs-status', errText(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-md').addEventListener('click', () => { flush(); const d = active(); if (!d) return; download(C.fileName(d.title, 'md'), d.body, 'text/markdown;charset=utf-8'); say('backup-status', t('export.mdDone'), 'ok'); });
  $('export-html').addEventListener('click', () => {
    flush(); const d = active(); if (!d) return;
    download(C.fileName(d.title, 'html'), C.exportHtml(d, { lang: L.lang, dir: L.dir }), 'text/html;charset=utf-8');
    say('backup-status', t('export.htmlDone'), 'ok');
  });
  $('export').addEventListener('click', () => { flush(); try { download('markdowndesk-backup.json', C.backup(docs), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: docs.length, b: next.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; }
      activeId = next[0] ? next[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; renderDocs(); loadEditor();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('markdowndesk-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) docs = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = docs.some((d) => d.id === last) ? last : (docs[0] ? docs[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  if (!readOnly && !docs.length) { try { createDoc(t('doc.untitled'), ''); } catch (_) { /* stockage bloqué */ } }
  // Changement de langue : on ne recharge pas l'éditeur (la saisie reste), on réaffiche le reste.
  L.onChange(() => { say('docs-status', ''); say('backup-status', ''); renderDocs(); stateText(); renderPreview(); });
  renderDocs(); loadEditor();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
