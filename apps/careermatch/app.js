/* CareerMatch — interface. Comparaison lexicale dans core.js (MatchCore) ; textes dans LouvreI18n.
   Rappel affiché en permanence : un décompte de mots n'est ni une prédiction ni un avis de recrutement. */
(() => {
  'use strict';
  const C = window.MatchCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-careermatch-v1'; // clé de stockage local
  const ACTIVE = 'louvre-careermatch-active'; // comparaison affichée (confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => 'c-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* confort seulement */ } };
  const cmp = (a, b) => a.localeCompare(b, L.locale);

  let list = []; // comparaisons enregistrées
  let activeId = null;
  let readOnly = false;
  let result = null; // dernière analyse affichée

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  const active = () => list.find((c) => c.id === activeId) || null;
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); list = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // --- Formulaire <-> comparaison
  function readForm(base) {
    return { ...base, cv: $('cv').value, offer: $('offer').value, lang: $('text-lang').value, foldPlurals: $('fold').checked,
      top: Number($('top').value), phrases: $('phrases').value, ignore: $('ignore').value };
  }
  function fillForm() {
    const c = active();
    $('cv').value = c ? c.cv : ''; $('offer').value = c ? c.offer : '';
    $('text-lang').value = c ? c.lang : L.lang; $('fold').checked = c ? c.foldPlurals : true; $('top').value = String(c ? c.top : 0);
    $('phrases').value = c ? c.phrases.join('\n') : ''; $('ignore').value = c ? c.ignore.join('\n') : '';
  }
  // Première saisie sans comparaison : on en crée une (les textes collés ne sont jamais perdus).
  function current() {
    const c = active();
    if (c) return c;
    return { id: newId(), name: t('cmp.defaultName', { n: list.length + 1 }), lang: $('text-lang').value };
  }
  let timer = null;
  function onEdit() { clearTimeout(timer); timer = setTimeout(() => { timer = null; commit(); }, 250); }
  function commit() {
    let c;
    try { const base = current(); c = C.makeComparison(readForm(base), base.id); say('form-status', ''); }
    catch (e) { say('form-status', L.error(e), 'error'); analyzeNow(); return; }
    const exists = list.some((x) => x.id === c.id);
    if (!exists && list.length >= C.LIMITS.comparisons) { say('form-status', t('err.tooMany', { max: C.LIMITS.comparisons }), 'error'); analyzeNow(); return; }
    if (save(exists ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c])) { activeId = c.id; safeSet(ACTIVE, c.id); renderList(); }
    analyzeNow();
  }
  for (const id of ['cv', 'offer', 'phrases', 'ignore']) $(id).addEventListener('input', onEdit);
  for (const id of ['text-lang', 'top', 'fold']) $(id).addEventListener('change', commit);

  // --- Analyse et affichage (toujours calculée sur la saisie affichée, même si elle n'a pas pu être enregistrée)
  function analyzeNow() {
    try { result = C.analyze({ ...readForm({ name: 'x' }), id: 'tmp-000000' }, cmp); }
    catch (e) { result = null; say('form-status', L.error(e), 'error'); }
    renderResult();
  }
  function chip(x, kind) {
    const li = el('li', kind), b = el('span', 'term', x.term), n = el('span', 'n', kind === 'present' ? `${x.offer} / ${x.cv}` : String(x.offer));
    b.setAttribute('lang', $('text-lang').value);
    li.title = t('chip.counts', { offer: x.offer, cv: x.cv });
    n.setAttribute('aria-label', t('chip.counts', { offer: x.offer, cv: x.cv }));
    li.append(b, n); return li;
  }
  function renderResult() {
    const r = result;
    $('cv-words').textContent = r ? t('words', { n: r.words.cv }) : '';
    $('offer-words').textContent = r ? t('words', { n: r.words.offer }) : '';
    const has = !!(r && r.terms.length);
    $('res').hidden = !has; $('res-empty').hidden = has;
    if (!has) return;
    $('k-coverage').textContent = `${L.number(r.coverage)} %`;
    $('k-weighted').textContent = `${L.number(r.weighted)} %`;
    $('k-present').textContent = L.number(r.present.length);
    $('k-missing').textContent = L.number(r.missing.length);
    $('res-explain').textContent = t('res.explain', { present: r.present.length, total: r.terms.length, pct: L.number(r.coverage) });
    $('missing').replaceChildren(...(r.missing.length ? r.missing.map((x) => chip(x, 'missing')) : [el('li', 'none', t('res.noneMissing'))]));
    $('present').replaceChildren(...(r.present.length ? r.present.map((x) => chip(x, 'present')) : [el('li', 'none', t('res.nonePresent'))]));
    $('phr-box').hidden = !r.phrases.length;
    $('phrases-res').replaceChildren(...r.phrases.map((p) => {
      const li = el('li'), name = el('b', '', p.phrase);
      name.setAttribute('lang', $('text-lang').value);
      li.append(name, el('span', p.inOffer ? 'yes' : 'no', `${t('phr.offer')} : ${t(p.inOffer ? 'phr.yes' : 'phr.no')}`), el('span', p.inCV ? 'yes' : 'no', `${t('phr.cv')} : ${t(p.inCV ? 'phr.yes' : 'phr.no')}`));
      return li;
    }));
  }

  // --- Menus et liste des comparaisons
  function renderSelects() {
    const tl = $('text-lang'), cur = tl.value || (active() ? active().lang : L.lang);
    tl.replaceChildren(...C.LANGS.map((l) => { const o = el('option', '', L.LANGS[l].name); o.value = l; return o; }));
    tl.value = cur;
    const top = $('top'), curTop = top.value || '0';
    top.replaceChildren(...C.TOPS.map((n) => { const o = el('option', '', n ? t('top.n', { n }) : t('top.all')); o.value = String(n); return o; }));
    top.value = curTop;
  }
  function renderList() {
    const sel = $('cmp-select');
    sel.replaceChildren(...list.map((c) => { const o = el('option', '', c.name); o.value = c.id; return o; }));
    if (activeId) sel.value = activeId;
    sel.disabled = !list.length;
    $('rename-cmp').disabled = $('delete-cmp').disabled = !active();
  }
  function render() { renderSelects(); renderList(); analyzeNow(); }
  // Enregistre tout de suite une saisie encore en attente (changement de comparaison, fermeture de la page).
  function flush() { if (timer) { clearTimeout(timer); timer = null; commit(); } }
  window.addEventListener('pagehide', flush);
  function select(id) { flush(); activeId = id; if (id) safeSet(ACTIVE, id); fillForm(); render(); }

  $('cmp-select').addEventListener('change', (e) => select(e.target.value));
  $('new-cmp').addEventListener('click', () => {
    const name = prompt(t('prompt.new'), t('cmp.defaultName', { n: list.length + 1 }));
    if (name === null) return;
    try {
      if (list.length >= C.LIMITS.comparisons) throw new Error(`err.tooMany|${JSON.stringify({ max: C.LIMITS.comparisons })}`);
      // Nouvelle offre, même CV : le CV courant est repris, l'offre est vide.
      const c = C.makeComparison({ ...readForm({}), name, offer: '', phrases: [], ignore: $('ignore').value }, newId());
      if (save([...list, c])) { select(c.id); say('cmp-status', t('cmp.created'), 'ok'); $('offer').focus(); }
    } catch (e) { say('cmp-status', L.error(e), 'error'); }
  });
  $('rename-cmp').addEventListener('click', () => {
    const c = active(); if (!c) return;
    const name = prompt(t('prompt.rename'), c.name);
    if (name === null) return;
    try { const fixed = C.makeComparison({ ...c, name }, c.id); if (save(list.map((x) => (x.id === c.id ? fixed : x)))) renderList(); } catch (e) { say('cmp-status', L.error(e), 'error'); }
  });
  $('delete-cmp').addEventListener('click', () => {
    const c = active(); if (!c || !confirm(t('confirm.delete', { name: c.name }))) return;
    if (save(list.filter((x) => x.id !== c.id))) select(list[0] ? list[0].id : null);
  });
  // Exemple : un CV et une offre fictifs rédigés dans la langue affichée.
  $('sample').addEventListener('click', () => {
    try {
      if (list.length >= C.LIMITS.comparisons) throw new Error(`err.tooMany|${JSON.stringify({ max: C.LIMITS.comparisons })}`);
      const c = C.makeComparison({ name: t('sample.name'), lang: L.lang, cv: t('sample.cv'), offer: t('sample.offer'), phrases: t('sample.phrases'), ignore: [], foldPlurals: true, top: 0 }, newId());
      if (save([...list, c])) { select(c.id); say('cmp-status', t('sample.added'), 'ok'); }
    } catch (e) { say('cmp-status', L.error(e), 'error'); }
  });

  // --- Exports et sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    if (!result || !result.terms.length) { say('res-status', t('csv.none'), 'error'); return; }
    download('careermatch-terms.csv', '\uFEFF' + C.termsCSV(result, [t('csv.term'), t('csv.offer'), t('csv.cv'), t('csv.status')], { present: t('st.present'), missing: t('st.missing') }), 'text/csv;charset=utf-8');
    say('res-status', t('csv.done'), 'ok');
  });
  $('export').addEventListener('click', () => {
    try { download('careermatch-backup.json', C.backup(list), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('err.fileBig');
      const next = C.validateBackup(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: list.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : la protection reste active
      $('warning').hidden = true; $('export-raw').hidden = true;
      select(next[0] ? next[0].id : null);
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('careermatch-raw-storage.txt', safeGet(KEY) || '', 'text/plain'));

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) list = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  const last = safeGet(ACTIVE);
  activeId = list.some((c) => c.id === last) ? last : (list[0] ? list[0].id : null);
  renderSelects(); fillForm();
  L.onChange(() => { for (const id of ['cmp-status', 'form-status', 'res-status', 'backup-status']) say(id, ''); render(); }); // la saisie reste en place
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
