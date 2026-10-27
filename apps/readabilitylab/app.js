/* ReadabilityLab — interface. Découpage, mesures et formules dans core.js (ReadCore) ; textes dans LouvreI18n.
   Le texte saisi n'est envoyé nulle part : il est analysé et enregistré dans ce navigateur. */
(() => {
  'use strict';
  const C = window.ReadCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue de l'interface (pas d'argent ici)
  const t = L.t;
  const KEY = 'louvre-readabilitylab-v1'; // clé de stockage local
  const ACTIVE = 'louvre-readabilitylab-active'; // texte affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let state = { settings: { ...C.DEFAULTS }, docs: [] }; // réglages et textes enregistrés
  let activeId = null; // texte affiché
  let readOnly = false; // stockage illisible : aucune écriture
  let saveTimer = null, analyzeTimer = null; // enregistrement et analyse différés pendant la frappe
  let result = null; // dernière analyse

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const active = () => state.docs.find((d) => d.id === activeId) || null;
  const uiTextLang = () => (C.TEXT_LANGS.includes(L.lang) ? L.lang : 'other');

  function save(next) {
    if (readOnly) { say('text-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); state = next; return true; }
    catch (e) { say('text-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }
  // Enregistrement différé : forcé avant tout changement de texte, création, suppression, export et à la fermeture.
  function flush() { if (!saveTimer) return true; clearTimeout(saveTimer); saveTimer = null; return save(state); }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; save(state); }, 400); }
  function setDoc(patch) { // modifie le texte affiché en mémoire (validé), puis enregistrement différé
    const cur = active(); if (!cur) return;
    const next = C.makeDoc({ ...cur, ...patch });
    state = { ...state, docs: state.docs.map((d) => (d.id === cur.id ? next : d)) };
    scheduleSave();
  }
  function ensureDoc() {
    if (active()) return true;
    if (state.docs.length) { setActive(state.docs[0].id); return true; }
    const d = C.makeDoc({ id: newId(), name: t('doc.defaultName'), lang: uiTextLang(), text: '' });
    if (!save({ ...state, docs: [d] })) return false;
    setActive(d.id); return true;
  }
  function setActive(id) { activeId = id; try { localStorage.setItem(ACTIVE, id || ''); } catch (_) { /* confort seulement */ } }

  // --- Affichage
  function renderDocs() {
    const sel = $('doc-select');
    sel.replaceChildren(...state.docs.map((d) => { const o = el('option', '', d.name); o.value = d.id; return o; }));
    if (!state.docs.length) { const o = el('option', '', t('doc.none')); o.value = ''; sel.append(o); }
    sel.value = activeId || '';
    $('rename-doc').disabled = $('delete-doc').disabled = !active();
    const ls = $('text-lang'), keep = ls.value;
    ls.replaceChildren(...C.TEXT_LANGS.map((l) => { const o = el('option', '', t('tl.' + l)); o.value = l; return o; }));
    const cur = active();
    ls.value = cur ? cur.lang : (keep || uiTextLang());
    const ta = $('text');
    if (cur && ta.value !== cur.text) ta.value = cur.text;
    if (document.activeElement !== $('long-sentence')) $('long-sentence').value = state.settings.longSentence;
    if (document.activeElement !== $('long-word')) $('long-word').value = state.settings.longWord;
  }

  function kpi(label, value) { const d = el('div', 'kpi'); d.append(el('span', '', label), el('strong', '', value)); return d; }
  function renderResults() {
    const text = $('text').value, lang = $('text-lang').value || uiTextLang();
    $('counter').textContent = t('counter', { n: L.number(text.length), max: L.number(C.LIMITS.text) });
    try { result = C.analyze(text, lang, state.settings); } catch (e) { result = null; say('text-status', L.error(e), 'error'); }
    const r = result;
    const dash = '—';
    const k = $('kpis');
    if (!r || !r.words) {
      k.replaceChildren(el('p', 'empty', t('stats.empty')));
      $('dist').replaceChildren(); $('formulas').replaceChildren(el('p', 'empty', t('formulas.empty')));
      $('long-list').replaceChildren(el('li', 'empty', t('long.empty')));
      $('long-words').replaceChildren(); $('long-words-pct').textContent = ''; $('repeats').replaceChildren(); $('doubled').textContent = '';
      $('export-csv').disabled = true; return;
    }
    $('export-csv').disabled = false;
    k.replaceChildren(
      kpi(t('k.sentences'), L.number(r.sentences.length)), kpi(t('k.words'), L.number(r.words)),
      kpi(t('k.avg'), L.number(r.avgWords)), kpi(t('k.median'), L.number(r.median)),
      kpi(t('k.max'), L.number(r.max)), kpi(t('k.long'), L.number(r.longSentences.length)),
      kpi(t('k.letters'), L.number(r.avgLetters)), kpi(t('k.syllables'), r.avgSyllables === null ? dash : L.number(r.avgSyllables)),
      kpi(t('k.paragraphs'), L.number(r.paragraphs)), kpi(t('k.chars'), L.number(r.charsNoSpaces)));
    const most = Math.max(1, ...r.distribution.map((b) => b.count));
    $('dist').replaceChildren(...r.distribution.map((b) => {
      const row = el('div', 'drow'), bar = el('div', 'dbar'), fill = el('i');
      fill.style.width = Math.round(100 * b.count / most) + '%';
      if (b.from > r.settings.longSentence || (b.to !== null && b.to > r.settings.longSentence)) fill.className = 'over';
      bar.append(fill);
      row.append(el('span', 'dlabel', b.to === null ? t('dist.more', { n: b.from }) : t('dist.range', { a: b.from, b: b.to })), bar, el('b', '', L.number(b.count)));
      return row;
    }));
    renderFormulas(r);
    const list = $('long-list');
    list.replaceChildren(...(r.longSentences.length ? r.longSentences.slice(0, 50).map((i) => {
      const s = r.sentences[i], li = el('li'), b = el('button', 'sent');
      b.type = 'button';
      b.append(el('b', '', t('long.item', { n: i + 1, w: s.words })), el('span', '', s.text.length > 220 ? s.text.slice(0, 220) + '…' : s.text));
      b.addEventListener('click', () => { const ta = $('text'); ta.focus(); ta.setSelectionRange(s.start, s.end); say('text-status', t('long.selected', { n: i + 1 }), 'ok'); });
      li.append(b); return li;
    }) : [el('li', 'empty', t('long.none', { n: r.settings.longSentence }))]));
    $('long-words-pct').textContent = t('words.pct', { pct: L.number(r.longWordPct), n: r.settings.longWord });
    $('long-words').replaceChildren(...(r.longWords.length ? r.longWords.map((w) => el('li', '', w.count > 1 ? `${w.word} ×${w.count}` : w.word)) : [el('li', 'empty', t('words.none'))]));
    $('repeats').replaceChildren(...(r.repeats.length ? r.repeats.map((w) => el('li', '', `${w.word} ×${w.count}`)) : [el('li', 'empty', t('rep.none'))]));
    $('doubled').textContent = r.doubled.length ? t('rep.doubled', { list: r.doubled.slice(0, 8).map((d) => t('rep.doubledItem', { w: d.word, n: d.sentence + 1 })).join(t('list.sep')) }) : '';
  }

  function renderFormulas(r) {
    const box = $('formulas'), parts = [];
    if (!r.formulas.length) {
      parts.push(el('p', 'note', t(r.lang === 'ar' ? 'formulas.noneAr' : 'formulas.none', { lang: t('tl.' + r.lang) })));
    } else {
      for (const f of r.formulas) {
        const card = el('div', 'formula'), head = el('div', 'fhead');
        head.append(el('b', '', t('formula.' + f.id)), el('strong', 'fvalue', L.number(f.value)));
        card.append(head);
        card.append(el('span', 'fband', f.kind === 'grade' ? t('formula.gradeNote', { v: L.number(f.value) }) : t('band.' + f.band)));
        card.append(el('span', 'ffor', t('formula.' + f.id + '.for')));
        parts.push(card);
      }
      parts.push(el('p', 'note', t(r.formulas.some((f) => f.id === 'gulpease') ? 'formulas.lettersNote' : 'formulas.syllableNote')));
      if (r.short) parts.push(el('p', 'note warn', t('formulas.short', { n: r.words })));
    }
    box.replaceChildren(...parts);
  }
  function renderFormulaList() {
    $('formula-list').replaceChildren(...C.FORMULAS.map((f) => el('li', '', `${t('formula.' + f.id)} — ${t('formula.' + f.id + '.for')}`)));
  }

  function render() { renderDocs(); renderFormulaList(); renderResults(); }

  // --- Saisie
  $('text').addEventListener('input', () => {
    clearTimeout(analyzeTimer); analyzeTimer = setTimeout(renderResults, 150); // l'analyse suit la frappe, même sans enregistrement
    try {
      if (!active()) { const lang = $('text-lang').value || uiTextLang(); if (ensureDoc()) { setDoc({ text: $('text').value, lang }); renderDocs(); } }
      else setDoc({ text: $('text').value });
    } catch (e) { say('text-status', L.error(e), 'error'); }
  });
  $('text-lang').addEventListener('change', (e) => {
    if (active()) { setDoc({ lang: e.target.value }); flush(); }
    renderResults();
  });
  for (const [id, key] of [['long-sentence', 'longSentence'], ['long-word', 'longWord']]) {
    $(id).addEventListener('change', (e) => {
      try {
        const v = C.parseThreshold(e.target.value, key);
        flush();
        if (save({ ...state, settings: { ...state.settings, [key]: v } })) { say('text-status', t('settings.saved'), 'ok'); renderResults(); }
      } catch (err) { say('text-status', L.error(err), 'error'); e.target.value = state.settings[key]; }
    });
  }

  // --- Textes enregistrés
  $('doc-select').addEventListener('change', (e) => { flush(); setActive(e.target.value); say('text-status', ''); render(); });
  function addDoc(name, lang, text) {
    if (state.docs.length >= C.LIMITS.docs) throw new Error(`err.docsMany|${JSON.stringify({ max: C.LIMITS.docs })}`);
    const d = C.makeDoc({ id: newId(), name, lang, text });
    if (!flush() && !readOnly) return false;
    if (!save({ ...state, docs: [...state.docs, d] })) return false;
    setActive(d.id); return true;
  }
  $('new-doc').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('doc.newDefault', { n: state.docs.length + 1 }));
    if (name === null) return;
    try { if (addDoc(name, $('text-lang').value || uiTextLang(), '')) { render(); $('text').focus(); } } catch (e) { say('text-status', L.error(e), 'error'); }
  });
  $('rename-doc').addEventListener('click', () => {
    const cur = active(); if (!cur) return;
    const name = prompt(t('prompt.rename'), cur.name);
    if (name === null) return;
    try { flush(); const d = C.makeDoc({ ...active(), name }); if (save({ ...state, docs: state.docs.map((x) => (x.id === d.id ? d : x)) })) render(); } catch (e) { say('text-status', L.error(e), 'error'); }
  });
  $('delete-doc').addEventListener('click', () => {
    const cur = active(); if (!cur || !confirm(t('confirm.delete', { name: cur.name }))) return;
    flush();
    if (save({ ...state, docs: state.docs.filter((d) => d.id !== cur.id) })) { setActive(state.docs[0] ? state.docs[0].id : null); if (!active()) $('text').value = ''; render(); }
  });
  // Exemple : un texte de démonstration dans la langue affichée (nouveau texte, rien n'est remplacé).
  $('sample').addEventListener('click', () => {
    try { if (addDoc(t('sample.name'), uiTextLang(), t('sample.text'))) { render(); say('text-status', t('sample.added'), 'ok'); } }
    catch (e) { say('text-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    flush();
    if (!result) return;
    const head = [t('csv.n'), t('csv.words'), t('csv.chars'), t('csv.long'), t('csv.sentence')];
    download('readabilitylab-sentences.csv', C.sentencesCSV(result, head, [t('csv.yes'), t('csv.no')]), 'text/csv');
    say('backup-status', t('csv.done'), 'ok');
  });
  $('export').addEventListener('click', () => {
    try { flush(); download('readabilitylab-backup.json', C.backup(state), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 4_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: state.docs.length, b: next.docs.length }))) return;
      clearTimeout(saveTimer); saveTimer = null; // la sauvegarde remplace tout : la frappe en attente est abandonnée volontairement
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      setActive(next.docs[0] ? next.docs[0].id : null);
      $('warning').hidden = true; $('export-raw').hidden = true; if (!active()) $('text').value = ''; render();
      say('backup-status', t('backup.restored', { n: next.docs.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (_) { /* illisible */ } download('readabilitylab-raw-storage.txt', raw, 'text/plain'); });

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = C.validateBackup(JSON.parse(raw));
    const last = localStorage.getItem(ACTIVE);
    activeId = state.docs.some((d) => d.id === last) ? last : (state.docs[0] ? state.docs[0].id : null);
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  L.onChange(() => { say('text-status', ''); say('backup-status', ''); render(); }); // nouvelle langue : on réaffiche, la saisie reste
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
