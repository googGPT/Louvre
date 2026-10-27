/* JSONInspector — interface. Analyse dans core.js (JsonCore), exécutée dans worker.js quand c'est possible ;
   textes dans LouvreI18n (appli sans argent). Tout l'affichage passe par textContent : jamais d'innerHTML. */
(() => {
  'use strict';
  const C = window.JsonCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-jsoninspector-v1';
  const ACTIVE = 'louvre-jsoninspector-active';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  let docs = [], prefs = { indent: '2' }, activeId = null, readOnly = false;
  let large = null; // fichier volumineux ouvert en lecture seule : { name, text }
  let dirty = false, saveTimer = null, analyzeTimer = null;
  let result = null; // dernière analyse
  let selectedPath = null, selectedId = null;

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function active() { return docs.find((d) => d.id === activeId) || null; }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }
  function save(nextDocs, nextPrefs = prefs) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup({ docs: nextDocs, prefs: nextPrefs })); docs = nextDocs; prefs = nextPrefs; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  const size = (bytes) => (bytes < 1024 ? t('unit.bytes', { n: L.number(bytes) })
    : bytes < 1048576 ? t('unit.kb', { n: L.number(bytes / 1024, { maximumFractionDigits: 1 }) })
      : t('unit.mb', { n: L.number(bytes / 1048576, { maximumFractionDigits: 1 }) }));

  // --- Moteur : Web Worker (page réactive) ou, à défaut, analyse directe
  let worker = null, seq = 0, local = null;
  const pending = new Map();
  try {
    worker = new Worker('./worker.js');
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; pending.delete(e.data.id); if (e.data.ok) p.res(e.data.result); else p.rej(new Error(e.data.error)); };
    worker.onerror = (e) => { e.preventDefault(); worker = null; for (const p of pending.values()) p.rej(new Error('retry')); pending.clear(); };
  } catch (_) { worker = null; }
  function direct(op, args) {
    return new Promise((res, rej) => setTimeout(() => {
      try { if (op === 'analyze') { local = C.createSession(args[0]); res(local.result); } else if (!local) rej(new Error('err.node')); else res(local[op](...args)); }
      catch (e) { rej(e); }
    }, 0));
  }
  function call(op, ...args) {
    if (!worker) return direct(op, args);
    return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); worker.postMessage({ id, op, args }); })
      .catch((e) => { if (e.message === 'retry') return direct(op, args); throw e; }); // Worker indisponible : on continue sans
  }

  // --- Analyse
  let gen = 0;
  const currentText = () => (large ? large.text : $('editor').value);
  async function analyze() {
    clearTimeout(analyzeTimer); analyzeTimer = null;
    const my = ++gen;
    const busy = setTimeout(() => { if (my === gen) $('busy').hidden = false; }, 120);
    try {
      const r = await call('analyze', currentText());
      if (my !== gen) return;
      result = r; renderAnalysis();
    } catch (e) { if (my === gen) say('doc-status', errText(e), 'error'); }
    finally { clearTimeout(busy); if (my === gen) $('busy').hidden = true; }
  }
  function scheduleAnalyze() { clearTimeout(analyzeTimer); analyzeTimer = setTimeout(analyze, 250); }

  function renderVerdict() {
    const v = $('verdict'), ex = $('excerpt');
    ex.hidden = true;
    if (!result) { v.textContent = ''; v.className = 'verdict top-gap'; return; }
    if (result.ok) {
      const s = result.stats;
      const extra = [s.duplicates ? t('verdict.dups', { n: s.duplicates }) : '', s.unsafeNumbers ? t('verdict.unsafe', { n: s.unsafeNumbers }) : '', s.bom ? t('verdict.bom') : ''].filter(Boolean);
      v.textContent = t('verdict.ok') + (extra.length ? ' ' + extra.join(' ') : '');
      v.className = 'verdict top-gap' + (extra.length ? ' warn' : '');
      return;
    }
    const er = result.error;
    if (er.key === 'err.json.empty') { v.textContent = t('verdict.empty'); v.className = 'verdict top-gap neutral'; return; }
    v.textContent = `${t('verdict.bad', { line: L.number(er.line), col: L.number(er.col) })} ${t(er.key, er.params || undefined)}`;
    v.className = 'verdict top-gap bad';
    ex.hidden = false;
    const num = String(er.line) + ' | ';
    ex.textContent = num + er.excerpt.text + '\n' + ' '.repeat(num.length + er.excerpt.caret) + '^';
  }

  function renderStats() {
    const box = $('kpis');
    if (!result || !result.ok) { box.replaceChildren(el('p', 'empty', t('stats.none'))); return; }
    const s = result.stats;
    const items = [
      ['stats.depth', L.number(s.maxDepth)], ['stats.members', L.number(s.members)], ['stats.uniqueKeys', L.number(s.uniqueKeys)],
      ['stats.values', L.number(s.values)], ['stats.objects', L.number(s.objects)], ['stats.arrays', L.number(s.arrays)],
      ['stats.strings', L.number(s.strings)], ['stats.numbers', L.number(s.numbers)], ['stats.booleans', L.number(s.booleans)],
      ['stats.nulls', L.number(s.nulls)], ['stats.maxArray', L.number(s.maxArray)], ['stats.maxKeys', L.number(s.maxKeys)],
      ['stats.size', size(s.bytes)], ['stats.lines', L.number(s.lines)], ['stats.duplicates', L.number(s.duplicates)], ['stats.unsafe', L.number(s.unsafeNumbers)],
    ];
    box.replaceChildren(...items.map(([k, v]) => { const d = el('div', 'kpi'); d.dataset.k = k; d.append(el('span', '', t(k)), el('strong', '', v)); return d; }));
  }

  function renderReports() {
    const dl = $('dups'), ul = $('unsafe');
    if (!result || !result.ok) { dl.replaceChildren(); ul.replaceChildren(); return; }
    const dups = result.dups;
    dl.replaceChildren(...(dups.length ? dups.map((d) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', 'code', JSON.stringify(d.key)), el('span', '', t('dups.item', { path: d.path, first: L.number(d.firstLine), line: L.number(d.line) })));
      const go = el('button', 'btn small', t('btn.show')); go.type = 'button'; go.setAttribute('aria-label', t('aria.showDup', { key: d.key }));
      go.addEventListener('click', () => reveal(d.first));
      const acts = el('div', 'acts'); acts.append(go); li.append(txt, acts); return li;
    }) : [el('li', 'none', t('dups.none'))]));
    if (result.over.dups) dl.append(el('li', 'none', t('report.more', { max: C.LIMITS.report })));
    ul.replaceChildren(...(result.unsafe.length ? result.unsafe.map((u) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', 'code', u.raw), el('span', '', t('unsafe.item', { path: u.path, line: L.number(u.line), value: String(Number(u.raw.replace('…', ''))) })));
      const go = el('button', 'btn small', t('btn.show')); go.type = 'button'; go.addEventListener('click', () => reveal(u.id));
      const acts = el('div', 'acts'); acts.append(go); li.append(txt, acts); return li;
    }) : [el('li', 'none', t('unsafe.none'))]));
    if (result.over.unsafe) ul.append(el('li', 'none', t('report.more', { max: C.LIMITS.report })));
  }

  // --- Arbre repliable, chargé par morceaux
  const rows = new Map(); // id -> { li, s, loaded, total, open }
  const TYPE = { o: 'type.object', a: 'type.array', s: 'type.string', n: 'type.number', b: 'type.boolean', z: 'type.null' };
  function label(s) {
    if (s.k === null) return '$';
    return typeof s.k === 'number' ? `[${s.k}]` : JSON.stringify(s.k);
  }
  function valueText(s) {
    if (s.t === 'o') return t('tree.keys', { n: s.count, count: L.number(s.count) });
    if (s.t === 'a') return t('tree.items', { n: s.count, count: L.number(s.count) });
    if (s.t === 's') return JSON.stringify(s.preview);
    return s.preview;
  }
  function row(s) {
    const li = el('li', 'node'); li.dataset.id = s.id;
    const line = el('div', 'line');
    if (s.count) {
      const tog = el('button', 'tog', '▸'); tog.type = 'button';
      tog.setAttribute('aria-expanded', 'false'); tog.setAttribute('aria-label', t('tree.toggle', { name: label(s) }));
      tog.addEventListener('click', () => toggle(s.id));
      line.append(tog);
    } else line.append(el('span', 'tog-space'));
    const pick = el('button', 'pick'); pick.type = 'button';
    pick.append(el('span', 'k', label(s)), el('span', 'sep', ': '), el('span', 'v v-' + s.t, valueText(s)));
    pick.setAttribute('aria-label', `${label(s)} — ${t(TYPE[s.t])}`);
    pick.addEventListener('click', () => select(s.id));
    line.append(pick);
    if (s.m) line.append(el('span', 'tag bad', t('tag.masked')));
    else if (s.dupKey) line.append(el('span', 'tag warn', t('tag.dup')));
    if (s.u) line.append(el('span', 'tag warn', t('tag.unsafe')));
    li.append(line);
    if (s.id === selectedId) li.classList.add('selected');
    rows.set(s.id, { li, s, loaded: 0, total: s.count || 0, open: false, kids: null });
    return li;
  }
  function renderTree() {
    rows.clear();
    const box = $('tree');
    if (!result || !result.ok) { box.replaceChildren(el('p', 'empty', t('tree.none'))); return; }
    const ul = el('ul', 'tree-root'); ul.append(row(result.root)); box.replaceChildren(ul);
    if (result.root.count) setOpen(result.root.id, true).catch(() => {}); // racine dépliée d'emblée
  }
  async function loadMore(id, upto = 0) {
    const r = rows.get(id); if (!r) return;
    const my = gen;
    const want = Math.max(C.LIMITS.page, upto + 1 - r.loaded);
    const res = await call('children', id, r.loaded, want);
    if (my !== gen || rows.get(id) !== r) return;
    if (!r.kids) { r.kids = el('ul', 'kids'); r.li.append(r.kids); }
    const more = r.kids.querySelector(':scope > li.more'); if (more) more.remove();
    for (const s of res.items) r.kids.append(row(s));
    r.loaded += res.items.length;
    if (r.loaded < res.total) {
      const li = el('li', 'more'), b = el('button', 'btn small', t('tree.more', { n: Math.min(C.LIMITS.page, res.total - r.loaded), rest: L.number(res.total - r.loaded) }));
      b.type = 'button'; b.addEventListener('click', () => loadMore(id).catch((e) => say('go-status', errText(e), 'error')));
      li.append(b); r.kids.append(li);
    }
  }
  async function setOpen(id, open) {
    const r = rows.get(id); if (!r || !r.s.count) return;
    if (open && !r.loaded) await loadMore(id);
    r.open = open;
    if (r.kids) r.kids.hidden = !open;
    const tog = r.li.querySelector(':scope > .line > .tog');
    tog.setAttribute('aria-expanded', String(open)); tog.textContent = open ? '▾' : '▸';
  }
  function toggle(id) { const r = rows.get(id); if (r) setOpen(id, !r.open).catch((e) => say('go-status', errText(e), 'error')); }

  // Sélection : chemin JSONPath, informations et aperçu de la valeur.
  async function select(id, focus = true) {
    const my = gen;
    try {
      const info = await call('node', id);
      const sub = await call('subtree', id, prefs.indent);
      if (my !== gen) return;
      for (const r of rows.values()) r.li.classList.toggle('selected', r.s.id === id);
      selectedId = id; selectedPath = info.path;
      $('sel-empty').hidden = true; $('sel-box').hidden = false;
      $('sel-path').value = info.path;
      const parts = [t(TYPE[info.t]), t('sel.line', { line: L.number(info.line) })];
      if (info.count !== undefined) parts.push(info.t === 'o' ? t('tree.keys', { n: info.count, count: L.number(info.count) }) : t('tree.items', { n: info.count, count: L.number(info.count) }));
      if (info.len !== undefined) parts.push(t('sel.chars', { n: info.len, count: L.number(info.len) }));
      $('sel-info').textContent = parts.join(' · ');
      $('sel-masked').hidden = !info.m;
      $('sel-value').textContent = sub.text; $('sel-cut').hidden = !sub.cut;
      const r = rows.get(id);
      if (r) say('sel-status', '');
      if (r && focus) { const pick = r.li.querySelector(':scope > .line > .pick'); pick.focus({ preventScroll: true }); pick.scrollIntoView({ block: 'nearest' }); }
    } catch (e) { if (my === gen) say('sel-status', errText(e), 'error'); }
  }
  // Déplie les ancêtres d'un nœud (en chargeant les morceaux nécessaires), puis le sélectionne.
  async function reveal(id, focus = true) {
    const my = gen;
    try {
      const info = await call('node', id);
      const chain = info.chain;
      for (let k = 0; k < chain.length - 1; k++) {
        if (my !== gen) return;
        const r = rows.get(chain[k].id);
        if (!r) return;
        const childIndex = chain[k + 1].index;
        if (childIndex - r.loaded >= C.LIMITS.page * 5) { say('sel-status', t('sel.far'), ''); break; } // trop loin : sélection sans dérouler des milliers de lignes
        if (r.loaded <= childIndex) await loadMore(chain[k].id, childIndex);
        await setOpen(chain[k].id, true);
      }
      await select(id, focus);
    } catch (e) { if (my === gen) say('go-status', errText(e), 'error'); }
  }
  $('go-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!result || !result.ok) { say('go-status', t('tree.none'), 'error'); return; }
    try { const id = await call('resolve', $('go-path').value); say('go-status', ''); await reveal(id); }
    catch (err) { say('go-status', errText(err), 'error'); }
  });
  $('copy-path').addEventListener('click', async () => {
    const input = $('sel-path');
    try { await navigator.clipboard.writeText(input.value); say('sel-status', t('sel.copied'), 'ok'); }
    catch (_) { input.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (__) { ok = false; } say('sel-status', ok ? t('sel.copied') : t('sel.copyFail'), ok ? 'ok' : 'error'); }
  });

  function renderAnalysis() {
    renderVerdict(); renderStats(); renderReports(); renderTree();
    const ok = result && result.ok;
    $('format').disabled = $('minify').disabled = !ok;
    // La sélection survit à une modification si son chemin existe encore.
    const keep = selectedPath; selectedId = null;
    $('sel-box').hidden = true; $('sel-empty').hidden = false;
    if (ok && keep) {
      const my = gen;
      call('resolve', keep).then((id) => { if (my === gen) reveal(id, false); }).catch(() => { selectedPath = null; });
    }
  }

  // --- Enregistrement différé de la saisie (forcé avant tout changement de document, export et fermeture)
  function stateText() {
    const n = $('save-state');
    if (readOnly) n.textContent = t('save.readonly');
    else if (large) n.textContent = t('save.large');
    else if ($('editor').value.length > C.LIMITS.saveChars) n.textContent = t('save.tooBig', { max: L.number(C.LIMITS.saveChars) });
    else n.textContent = dirty ? t('save.pending') : t('save.done');
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty || large) return true;
    const cur = active(); if (!cur) return true;
    const text = $('editor').value;
    if (text.length > C.LIMITS.saveChars) { stateText(); return false; } // trop gros : analysé seulement
    try {
      const doc = C.makeDoc({ name: cur.name, text, updated: today() }, cur.id);
      if (save(docs.map((d) => (d.id === cur.id ? doc : d)))) { dirty = false; renderDocs(); }
    } catch (e) { say('doc-status', errText(e), 'error'); }
    stateText();
    return !dirty;
  }
  function onEdit() {
    dirty = true; stateText();
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500);
    scheduleAnalyze();
  }

  function renderDocs() {
    const sel = $('doc-select');
    const sorted = [...docs].sort((a, b) => a.name.localeCompare(b.name, L.locale));
    const opts = sorted.map((d) => { const o = el('option', '', d.name); o.value = d.id; return o; });
    if (large) { const o = el('option', '', t('doc.largeOption', { name: large.name })); o.value = ''; opts.unshift(o); }
    sel.replaceChildren(...opts);
    sel.value = large ? '' : (activeId || '');
    $('rename-doc').disabled = $('delete-doc').disabled = !active() || !!large || readOnly;
    $('new-doc').disabled = $('sample').disabled = readOnly;
  }
  function loadEditor() {
    const cur = active();
    $('editor').hidden = !!large; $('large').hidden = !large;
    if (large) { $('large-name').textContent = large.name; $('large-size').textContent = `(${size(C.utf8Bytes(large.text))})`; }
    else $('editor').value = cur ? cur.text : '';
    $('editor').disabled = !cur || readOnly;
    dirty = false; stateText();
    selectedPath = null;
    analyze();
  }
  function createDoc(name, text) {
    if (docs.length >= C.LIMITS.docs) throw new Error(`err.tooManyDocs|${JSON.stringify({ max: C.LIMITS.docs })}`);
    const d = C.makeDoc({ name, text, updated: today() }, newId());
    if (!save([...docs, d])) return false;
    large = null; activeId = d.id; try { localStorage.setItem(ACTIVE, d.id); } catch (_) { /* confort */ }
    renderDocs(); loadEditor(); return true;
  }

  $('editor').addEventListener('input', onEdit);
  $('editor').addEventListener('blur', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  $('doc-select').addEventListener('change', (e) => {
    if (!e.target.value) return;
    flush(); large = null; activeId = e.target.value;
    try { localStorage.setItem(ACTIVE, activeId); } catch (_) { /* confort */ }
    renderDocs(); loadEditor();
  });
  $('new-doc').addEventListener('click', () => {
    flush();
    try { if (createDoc(t('doc.newDefault', { n: docs.length + 1 }), '')) { $('editor').focus(); say('doc-status', t('doc.created'), 'ok'); } } catch (e) { say('doc-status', errText(e), 'error'); }
  });
  $('rename-doc').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    flush();
    const name = prompt(t('prompt.rename'), cur.name); if (name === null) return;
    try { const d = C.makeDoc({ name, text: active().text, updated: today() }, cur.id); if (save(docs.map((x) => (x.id === cur.id ? d : x)))) { renderDocs(); say('doc-status', t('doc.renamed'), 'ok'); } }
    catch (e) { say('doc-status', errText(e), 'error'); }
  });
  $('delete-doc').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name }))) return;
    clearTimeout(saveTimer); dirty = false;
    if (save(docs.filter((d) => d.id !== cur.id))) { activeId = docs[0] ? docs[0].id : null; renderDocs(); loadEditor(); say('doc-status', t('doc.deleted'), 'ok'); }
  });
  $('sample').addEventListener('click', () => {
    flush();
    try { if (createDoc(t('sample.name'), t('sample.json'))) say('doc-status', t('sample.added'), 'ok'); } catch (e) { say('doc-status', errText(e), 'error'); }
  });
  $('open-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > C.LIMITS.fileBytes) throw new Error(`err.fileBig|${JSON.stringify({ max: size(C.LIMITS.fileBytes) })}`);
      const text = await file.text();
      const name = file.name.replace(/\.json$/i, '').slice(0, C.LIMITS.name).trim() || t('doc.untitled');
      flush();
      if (text.length <= C.LIMITS.saveChars && !readOnly) { if (createDoc(name, text)) say('doc-status', t('doc.opened', { name }), 'ok'); return; }
      large = { name: file.name.slice(0, 120), text };
      renderDocs(); loadEditor();
      say('doc-status', t('doc.openedLarge', { name: large.name }), 'ok');
    } catch (e) { say('doc-status', errText(e), 'error'); }
  });
  $('large-close').addEventListener('click', () => { large = null; if (!active() && docs[0]) activeId = docs[0].id; renderDocs(); loadEditor(); });

  // --- Formatage, minification, téléchargement
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const docName = () => (large ? large.name.replace(/\.json$/i, '') : (active() ? active().name : 'document'));
  async function rewrite(op) {
    if (!result || !result.ok) { say('doc-status', t('err.invalidJson'), 'error'); return; }
    try {
      const text = op === 'minify' ? await call('minify') : await call('format', prefs.indent);
      const dupNote = result.stats.duplicates ? ' ' + t('format.dupKept') : '';
      if (large || readOnly || text.length > C.LIMITS.saveChars) {
        download(C.fileName(docName(), op === 'minify' ? '.min' : '.formatted'), text, 'application/json');
        say('doc-status', t('format.downloaded') + dupNote, 'ok'); return;
      }
      $('editor').value = text; dirty = true; flush(); analyze();
      say('doc-status', (op === 'minify' ? t('format.minified') : t('format.done')) + dupNote, 'ok');
    } catch (e) { say('doc-status', errText(e), 'error'); }
  }
  $('format').addEventListener('click', () => rewrite('format'));
  $('minify').addEventListener('click', () => rewrite('minify'));
  $('indent').addEventListener('change', (e) => {
    const next = { indent: e.target.value };
    if (readOnly) { prefs = next; } else if (!save(docs, next)) { e.target.value = prefs.indent; return; }
    if (selectedId !== null) select(selectedId, false);
  });
  $('download').addEventListener('click', () => { flush(); download(C.fileName(docName(), ''), currentText(), 'application/json'); say('doc-status', t('download.done'), 'ok'); });

  // --- Sauvegarde
  $('export').addEventListener('click', () => { flush(); try { download('jsoninspector-backup.json', C.backup({ docs, prefs }), 'application/json'); say('backup-status', t('backup.done'), 'ok'); } catch (e) { say('backup-status', errText(e), 'error'); } });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error(`err.fileBig|${JSON.stringify({ max: size(4_000_000) })}`);
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: docs.length, b: next.docs.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next.docs, next.prefs)) { readOnly = was; return; } // échec : la protection reste
      large = null; activeId = next.docs[0] ? next.docs[0].id : null;
      $('warning').hidden = true; $('export-raw').hidden = true; $('indent').value = prefs.indent;
      if (!docs.length) createDoc(t('doc.untitled'), '');
      renderDocs(); loadEditor();
      say('backup-status', t('backup.restored', { n: next.docs.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('jsoninspector-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = C.validateBackup(JSON.parse(raw)); docs = s.docs; prefs = s.prefs; }
    const last = localStorage.getItem(ACTIVE);
    activeId = docs.some((d) => d.id === last) ? last : (docs[0] ? docs[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  $('indent').value = prefs.indent;
  if (!readOnly && !docs.length) { try { createDoc(t('doc.untitled'), ''); } catch (_) { /* stockage bloqué */ } }
  // Changement de langue : la saisie reste dans l'éditeur ; on retraduit l'analyse sans relancer le calcul.
  L.onChange(() => { say('doc-status', ''); say('backup-status', ''); say('go-status', ''); renderDocs(); stateText(); if (result) renderAnalysis(); });
  renderDocs(); loadEditor();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
