/* RegexWorkbench — interface. Logique dans core.js (RegexCore) ; exécution dans worker.js ; textes dans LouvreI18n.
   La page compile l'expression (syntaxe) et l'explique, mais ne la fait jamais tourner sur le texte : c'est le Worker
   qui le fait, et il est arrêté (terminate) s'il dépasse le délai maximal. Affichage sans innerHTML. */
(() => {
  'use strict';
  const C = window.RegexCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-regexworkbench-v1';
  const SHOW = { highlights: 2000, rows: 300 };
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let state = { items: [], draft: { ...C.EMPTY_DRAFT }, timeoutMs: C.TIMEOUT.def };
  let readOnly = false, dirty = false, saveTimer = null, runTimer = null;
  let last = null; // dernier résultat (ou erreur) affiché : { kind: 'ok' | 'error' | 'timeout' | 'syntax', ... }

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function errText(e) { return e instanceof SyntaxError ? t('err.backup') : L.error(e); }

  // --- Enregistrement (brouillon en différé, bibliothèque et réglages immédiatement)
  function currentDraft() {
    return { pattern: $('pattern').value, flags: C.FLAGS.filter((f) => $('flag-' + f).checked).join(''), text: $('subject').value, replacement: $('replacement').value };
  }
  function save(next) {
    if (readOnly) return false;
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: errText(e) }), 'error'); return false; }
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty || readOnly) { dirty = false; return true; }
    try { const draft = C.makeDraft(currentDraft()); if (save({ ...state, draft })) dirty = false; }
    catch (e) { say('backup-status', errText(e), 'error'); dirty = false; }
    return !dirty;
  }
  function touch() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500); }

  // --- Moteur : un Worker dédié, arrêté et recréé si l'exécution dépasse le délai.
  let worker = null, seq = 0, job = null, killed = 0;
  function startWorker() {
    try {
      worker = new Worker('./worker.js');
      worker.onmessage = (e) => {
        if (!job || e.data.id !== job.id) return;
        const j = job; job = null; clearTimeout(j.timer);
        if (e.data.ok) j.res(e.data.result); else j.rej(new Error(e.data.error));
      };
      worker.onerror = (e) => { e.preventDefault(); if (job) { const j = job; job = null; clearTimeout(j.timer); j.rej(new Error('err.engine')); } };
    } catch (_) { worker = null; }
  }
  function stopWorker() {
    if (worker) worker.terminate();
    worker = null; killed++;
    document.documentElement.dataset.rwStopped = String(killed); // repère pour les tests : nombre d'arrêts
    startWorker();
  }
  function execute(req) {
    return new Promise((res, rej) => {
      if (job) { const j = job; job = null; clearTimeout(j.timer); stopWorker(); j.rej(new Error('cancelled')); } // une exécution plus récente remplace l'ancienne
      if (!worker) startWorker();
      if (!worker) { rej(new Error('err.noWorker')); return; }
      const id = ++seq;
      const timer = setTimeout(() => { if (job && job.id === id) { job = null; stopWorker(); rej(new Error('timeout')); } }, state.timeoutMs);
      job = { id, res, rej, timer };
      worker.postMessage({ id, req });
    });
  }

  // --- Exécution déclenchée par la saisie
  async function run() {
    clearTimeout(runTimer); runTimer = null;
    const d = currentDraft();
    renderExplain(d);
    $('flags-view').textContent = '/' + d.flags;
    if (!d.pattern) { last = { kind: 'empty' }; renderResult(); return; }
    try { C.compile(d.pattern, d.flags); }
    catch (e) { last = { kind: 'syntax', error: e }; renderResult(); return; }
    $('engine').textContent = t('engine.running');
    try {
      const result = await execute({ pattern: d.pattern, flags: d.flags, text: d.text, replacement: d.replacement, maxMatches: C.MAX.matches });
      last = { kind: 'ok', result, text: d.text };
      $('timeout-alert').hidden = true;
    } catch (e) {
      if (e.message === 'cancelled') return; // remplacée par une saisie plus récente
      last = e.message === 'timeout' ? { kind: 'timeout', ms: state.timeoutMs } : { kind: 'error', error: e };
    }
    renderResult();
  }
  function schedule() { clearTimeout(runTimer); runTimer = setTimeout(run, 200); }

  // --- Affichage
  function renderFlags() {
    const box = $('flag-boxes'), keep = box.childElementCount ? currentDraft().flags : state.draft.flags;
    box.replaceChildren(...C.FLAGS.map((f) => {
      const lab = el('label', 'flag'), cb = el('input');
      cb.type = 'checkbox'; cb.id = 'flag-' + f; cb.checked = keep.includes(f);
      cb.addEventListener('change', () => { touch(); schedule(); });
      lab.append(cb, el('code', '', f), el('span', '', t(C.FLAG_KEYS[f])));
      return lab;
    }));
  }
  function renderExplain(d) {
    const ol = $('explain');
    if (!d.pattern) { ol.replaceChildren(el('li', 'empty', t('explain.empty'))); $('explain-warn').hidden = true; $('flag-explain').replaceChildren(); return; }
    const ex = C.explain(d.pattern, d.flags);
    ol.replaceChildren(...ex.tokens.slice(0, 300).map((tk) => {
      const li = el('li'); li.style.paddingInlineStart = Math.min(tk.depth, 8) * 16 + 'px';
      li.append(el('code', '', tk.src), el('span', '', t(tk.key, tk.params) + (tk.lazy ? ' ' + t('ex.lazy') : '')));
      return li;
    }));
    $('explain-warn').hidden = !ex.warnings.length;
    $('explain-warn').textContent = ex.warnings.map((w) => t(w)).join(' ');
    $('flag-explain').replaceChildren(...[...d.flags].map((f) => { const li = el('li'); li.append(el('code', '', f), el('span', '', t(C.FLAG_KEYS[f] + '.long'))); return li; }));
  }
  function highlight(box, text, ranges) { // ranges triées, sans chevauchement : [début, fin, numéro]
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [a, b, k] of ranges) {
      if (a > pos) frag.append(document.createTextNode(text.slice(pos, a)));
      const m = el('mark', a === b ? 'zero' : 'm' + (k % 2), text.slice(a, b));
      m.title = t('hl.match', { n: k + 1 });
      frag.append(m); pos = b;
    }
    if (pos < text.length) frag.append(document.createTextNode(text.slice(pos)));
    if (!text) frag.append(el('span', 'empty', t('text.empty')));
    box.replaceChildren(frag);
  }
  function renderResult() {
    const tbody = $('matches');
    $('engine').textContent = '';
    if (!last || last.kind === 'empty') {
      $('count').textContent = t('res.noPattern'); highlight($('highlight'), $('subject').value, []);
      tbody.replaceChildren(); $('replaced').replaceChildren(el('span', 'empty', t('rep.none'))); say('pattern-status', ''); return;
    }
    if (last.kind === 'syntax' || last.kind === 'error' || last.kind === 'timeout') {
      tbody.replaceChildren(); $('replaced').replaceChildren(el('span', 'empty', t('rep.none')));
      highlight($('highlight'), $('subject').value, []);
      if (last.kind === 'timeout') {
        $('count').textContent = t('res.stopped');
        $('timeout-alert').hidden = false; $('timeout-alert').textContent = t('timeout.alert', { ms: L.number(last.ms) });
        say('pattern-status', t('timeout.short'), 'error');
      } else { $('count').textContent = ''; say('pattern-status', L.error(last.error), 'error'); }
      return;
    }
    const r = last.result, text = last.text;
    say('pattern-status', t('res.ok'), 'ok');
    $('count').textContent = t('res.count', { n: r.count }) + (r.truncated ? ' ' + t('res.truncated', { max: L.number(C.MAX.matches) }) : '') + ' · ' + t('res.groups', { n: r.groupCount });
    highlight($('highlight'), text, r.matches.slice(0, SHOW.highlights).map((m, k) => [m.index, m.end, k]));
    tbody.replaceChildren(...r.matches.slice(0, SHOW.rows).map((m, k) => {
      const tr = el('tr'), g = el('td', 'groups');
      for (const x of m.groups) {
        const row = el('div');
        row.append(el('b', '', x.name ? `${x.n} · ${x.name}` : String(x.n)), document.createTextNode(' '));
        row.append(x.value === null ? el('i', 'none', t('group.none')) : el('code', '', x.value));
        g.append(row);
      }
      if (!m.groups.length) g.append(el('span', 'none', '—'));
      const txt = el('td'); txt.append(m.text ? el('code', '', m.text) : el('i', 'none', t('match.emptyText')));
      tr.append(el('td', 'num', L.number(k + 1)), el('td', 'num', `${L.number(m.index)}–${L.number(m.end)}`), txt, g);
      return tr;
    }));
    if (r.matches.length > SHOW.rows) { const tr = el('tr'), td = el('td', 'more', t('res.more', { n: L.number(r.matches.length - SHOW.rows) })); td.colSpan = 4; tr.append(td); tbody.append(tr); }
    const out = $('replaced'), frag = document.createDocumentFragment();
    if (!r.output || !r.count) frag.append(el('span', 'empty', t('rep.noMatch')));
    else for (const s of r.output) frag.append(s.t === 'rep' ? el('mark', s.v ? 'rep' : 'rep zero', s.v) : document.createTextNode(s.v));
    out.replaceChildren(frag);
  }
  function renderLibrary() {
    const ul = $('library');
    const items = [...state.items].sort((a, b) => a.name.localeCompare(b.name, L.locale));
    if (!items.length) ul.replaceChildren(el('li', 'empty', t('lib.empty')));
    else ul.replaceChildren(...items.map((it) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', it.name), el('code', '', `/${it.pattern}/${it.flags}`));
      if (it.replacement) txt.append(el('span', 'rep-line', `→ ${it.replacement}`));
      const acts = el('div', 'acts'), load = el('button', 'btn small', t('lib.load')), del = el('button', 'btn small', t('lib.delete'));
      load.type = del.type = 'button';
      load.setAttribute('aria-label', t('lib.loadAria', { name: it.name })); del.setAttribute('aria-label', t('lib.deleteAria', { name: it.name }));
      load.addEventListener('click', () => loadItem(it));
      del.addEventListener('click', () => {
        if (!confirm(t('lib.confirmDelete', { name: it.name }))) return;
        flush();
        if (save({ ...state, items: state.items.filter((x) => x.id !== it.id) })) { renderLibrary(); say('lib-status', t('lib.deleted'), 'ok'); }
      });
      acts.append(load, del); li.append(txt, acts); return li;
    }));
    $('lib-save').disabled = readOnly;
  }
  function setDraft(d) {
    $('pattern').value = d.pattern; $('subject').value = d.text; $('replacement').value = d.replacement;
    for (const f of C.FLAGS) $('flag-' + f).checked = d.flags.includes(f);
  }
  function loadItem(it) {
    setDraft({ ...currentDraft(), pattern: it.pattern, flags: it.flags, replacement: it.replacement });
    $('lib-name').value = it.name;
    touch(); flush(); run();
    say('lib-status', t('lib.loaded', { name: it.name }), 'ok');
  }

  // --- Événements
  for (const id of ['pattern', 'subject', 'replacement']) $(id).addEventListener('input', () => { touch(); schedule(); });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  $('lib-save').addEventListener('click', () => {
    flush();
    try {
      const d = currentDraft();
      const next = C.addItem(state.items, { name: $('lib-name').value, pattern: d.pattern, flags: d.flags, replacement: d.replacement }, newId());
      if (readOnly) { say('lib-status', t('storage.readonly'), 'error'); return; }
      if (save({ ...state, items: next })) { renderLibrary(); say('lib-status', t('lib.saved', { name: $('lib-name').value.trim() }), 'ok'); }
    } catch (e) { say('lib-status', errText(e), 'error'); }
  });
  $('timeout').addEventListener('change', () => {
    try {
      const ms = C.parseTimeout($('timeout').value);
      flush();
      if (readOnly) state = { ...state, timeoutMs: ms }; else if (!save({ ...state, timeoutMs: ms })) return;
      say('backup-status', t('set.saved', { ms: L.number(ms) }), 'ok');
    } catch (e) { say('backup-status', errText(e), 'error'); $('timeout').value = state.timeoutMs; }
  });
  $('copy').addEventListener('click', async () => {
    if (!last || last.kind !== 'ok' || !last.result.output) { say('rep-status', t('rep.nothing'), 'error'); return; }
    try { await navigator.clipboard.writeText(C.outputText(last.result.output)); say('rep-status', t('rep.copied'), 'ok'); }
    catch (_) { say('rep-status', t('rep.copyFail'), 'error'); }
  });

  // Exemple : dates ISO avec groupes nommés, dans la langue affichée ; trois expressions dans la bibliothèque.
  $('sample').addEventListener('click', () => {
    setDraft({ pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', flags: 'g', text: t('sample.text'), replacement: t('sample.replacement') });
    touch(); flush(); run();
    if (!readOnly) {
      try {
        let items = state.items;
        items = C.addItem(items, { name: t('sample.lib.date'), pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', flags: 'g', replacement: t('sample.replacement') }, newId());
        items = C.addItem(items, { name: t('sample.lib.email'), pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', flags: 'gi', replacement: '' }, newId());
        items = C.addItem(items, { name: t('sample.lib.trap'), pattern: '^(a+)+$', flags: '', replacement: '' }, newId());
        if (save({ ...state, items })) renderLibrary();
      } catch (e) { say('lib-status', errText(e), 'error'); }
    }
    say('lib-status', t('sample.added'), 'ok');
  });

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    flush();
    try { download('regexworkbench-backup.json', C.backup({ ...state, draft: readOnly ? C.makeDraft(currentDraft()) : state.draft }), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', errText(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 3_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: state.items.length, b: next.items.length }))) return;
      const was = readOnly; readOnly = false;
      if (!save(next)) { readOnly = was; return; } // échec : la protection reste
      dirty = false;
      $('warning').hidden = true; $('export-raw').hidden = true;
      setDraft(next.draft); $('timeout').value = next.timeoutMs; renderLibrary(); run();
      say('backup-status', t('backup.restored', { n: next.items.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: errText(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('regexworkbench-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  renderFlags(); setDraft(state.draft); $('timeout').value = state.timeoutMs;
  startWorker();
  // Changement de langue : les champs gardent leur contenu ; textes, explication et résultats sont réaffichés.
  L.onChange(() => { for (const id of ['lib-status', 'backup-status', 'rep-status']) say(id, ''); renderFlags(); renderLibrary(); renderExplain(currentDraft()); renderResult(); if (last && last.kind === 'timeout') $('timeout-alert').textContent = t('timeout.alert', { ms: L.number(last.ms) }); });
  renderLibrary(); run();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
