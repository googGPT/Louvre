/* LaundryDecoder — interface. Logique dans core.js (LaundryCore) ; textes et formats dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.LaundryCore;
  const L = window.LouvreI18n.init(window.LouvreMessages);
  const t = L.t;
  const KEY = 'louvre-laundrydecoder-v1';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  let data = { labels: [] };
  let readOnly = false;
  let chosen = new Set(); // symboles sélectionnés dans le compositeur
  let editing = null; // étiquette enregistrée en cours de modification

  function say(id, text, kind = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind ? ' ' + kind : ''); }
  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); data = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // Pictogramme : SVG fixe produit par core.js, analysé une fois puis cloné (aucun texte saisi dedans).
  const icons = new Map();
  function icon(id) {
    if (!icons.has(id)) icons.set(id, new DOMParser().parseFromString(C.svg(id), 'image/svg+xml').documentElement);
    return document.importNode(icons.get(id), true);
  }

  // --- Textes d'une consigne (fusionnée) et d'un symbole
  const deg = (c) => t('unit.celsius', { t: L.number(c) });
  const withMode = (text, mode) => (mode === 'normal' ? text : t('sum.withMode', { text, mode: t('mode.' + mode) }));
  function familyText(family, m) {
    switch (family) {
      case 'wash': return m.kind === 'none' ? t('sum.wash.none') : m.kind === 'hand' ? t('sum.wash.hand', { t: deg(m.maxC) }) : t('sum.wash.' + m.mode, { t: deg(m.maxC) });
      case 'bleach': return t('sum.bleach.' + m.level);
      case 'tumble': return t('sum.tumble.' + m.level);
      case 'natural': return m.ids.map((id) => t('sum.natural.' + id)).join(' / ');
      case 'iron': return m.maxC ? t('sum.iron.on', { t: deg(m.maxC) }) : t('sum.iron.off');
      case 'dry': return m.kind === 'none' ? t('sum.dry.none') : withMode(t('sum.dry.' + m.solvent), m.mode);
      default: return m.kind === 'none' ? t('sum.wet.none') : withMode(t('sum.wet.pro'), m.mode);
    }
  }
  const symName = (id) => { const r = C.combine([id]); const f = C.SYMBOLS[id].family; return familyText(f, r.families[f]); };
  function symDesc(id) {
    const s = C.SYMBOLS[id];
    let base;
    switch (s.family) {
      case 'wash': base = s.kind === 'machine' ? t('desc.wash.machine', { t: deg(s.maxC) }) : t('desc.wash.' + s.kind, { t: deg(s.maxC || 0) }); break;
      case 'bleach': case 'tumble': base = t(`desc.${s.family}.${s.level}`); break;
      case 'natural': base = t('desc.natural.' + (s.method === 'line' ? (s.drip ? 'lineDrip' : 'line') : (s.drip ? 'flatDrip' : 'flat'))) + (s.shade ? ' ' + t('desc.natural.shade') : ''); break;
      case 'iron': base = s.maxC ? t('desc.iron.' + s.maxC) : t('desc.iron.off'); break;
      case 'dry': base = s.kind === 'none' ? t('desc.dry.none') : t('desc.dry.' + s.solvent); break;
      default: base = s.kind === 'none' ? t('desc.wet.none') : t('desc.wet.pro');
    }
    return s.mode && s.mode !== 'normal' ? `${base} ${t('desc.mode.' + s.mode)}` : base;
  }
  const famName = (f) => t('fam.' + f);
  const catOf = (f) => Object.keys(C.CATEGORIES).find((c) => C.CATEGORIES[c].includes(f));

  // --- Palette de symboles à sélectionner
  function renderPalette() {
    const box = $('palette');
    box.replaceChildren(...Object.entries(C.CATEGORIES).map(([cat, fams]) => {
      const fs = el('fieldset', 'cat'); fs.append(el('legend', '', t('fam.' + cat)));
      for (const f of fams) {
        if (fams.length > 1) fs.append(el('p', 'sub', famName(f)));
        const row = el('div', 'tiles');
        for (const id of C.IDS.filter((x) => C.SYMBOLS[x].family === f)) {
          const b = el('button', 'tile'); b.type = 'button'; b.dataset.sym = id;
          b.setAttribute('aria-pressed', chosen.has(id) ? 'true' : 'false');
          b.setAttribute('aria-label', symName(id)); b.title = symName(id);
          b.append(icon(id));
          b.addEventListener('click', () => { if (chosen.has(id)) chosen.delete(id); else chosen.add(id); renderComposer(); });
          row.append(b);
        }
        fs.append(row);
      }
      return fs;
    }));
  }
  function summaryLines(r) { return C.FAMILIES.filter((f) => r.families[f]).map((f) => t('sum.line', { family: famName(f), text: familyText(f, r.families[f]) })); }
  function renderSummary() {
    const r = C.combine([...chosen]);
    $('chosen').replaceChildren(...(r.empty ? [el('p', 'empty', t('sum.empty'))] : r.ids.map((id) => {
      const b = el('button', 'chip'); b.type = 'button'; b.append(icon(id), el('span', '', symName(id)));
      b.setAttribute('aria-label', t('aria.unselect', { name: symName(id) }));
      b.addEventListener('click', () => { chosen.delete(id); renderComposer(); });
      return b;
    })));
    $('summary').replaceChildren(...C.FAMILIES.filter((f) => r.families[f]).map((f) => {
      const li = el('li'); li.dataset.family = f;
      li.append(el('b', '', famName(f)), el('span', '', familyText(f, r.families[f])));
      return li;
    }));
    const issues = [];
    for (const c of r.conflicts) {
      const text = c.type === 'duplicate' ? t('conf.duplicate', { family: famName(c.family) }) : t('conf.' + c.type);
      issues.push(['conflict', text]);
    }
    for (const w of r.warnings) issues.push(['warn', t('warn.' + w.type)]);
    if (!r.empty) {
      if (r.missing.length) issues.push(['missing', t('sum.missing', { list: r.missing.map(famName).join(t('list.sep')) })]);
      if (!r.conflicts.length) issues.push(['ok', t('sum.noConflict')]);
    }
    $('issues').replaceChildren(...issues.map(([cls, text]) => el('li', cls, text)));
    $('save').textContent = t(editing ? 'btn.update' : 'btn.save');
  }
  function renderComposer() {
    document.querySelectorAll('#palette .tile').forEach((b) => b.setAttribute('aria-pressed', chosen.has(b.dataset.sym) ? 'true' : 'false'));
    renderSummary();
  }

  // --- Étiquettes enregistrées
  function renderSaved() {
    const list = data.labels.slice().sort((a, b) => a.name.localeCompare(b.name, L.locale));
    if (!list.length) { $('saved').replaceChildren(el('li', 'empty', t('saved.empty'))); return; }
    $('saved').replaceChildren(...list.map((l) => {
      const li = el('li', l.id === editing ? 'current' : ''), txt = el('div', 'txt');
      txt.append(el('b', '', l.name));
      const mini = el('div', 'mini'); for (const id of l.symbols) { const i = icon(id); i.setAttribute('role', 'img'); i.setAttribute('aria-label', symName(id)); i.removeAttribute('aria-hidden'); mini.append(i); }
      const r = C.combine(l.symbols);
      txt.append(mini);
      if (r.conflicts.length) txt.append(el('span', 'tag bad', t('saved.conflicts', { n: r.conflicts.length })));
      const acts = el('div', 'acts');
      const open = el('button', 'btn', t('btn.open')); open.type = 'button'; open.setAttribute('aria-label', t('aria.open', { name: l.name }));
      open.addEventListener('click', () => {
        editing = l.id; chosen = new Set(l.symbols); $('label-form').name.value = l.name;
        renderComposer(); renderSaved(); say('label-status', t('label.opened', { name: l.name }), 'ok');
        $('h-summary').scrollIntoView({ block: 'start' });
      });
      const svgBtn = el('button', 'btn', t('btn.svg')); svgBtn.type = 'button'; svgBtn.setAttribute('aria-label', t('aria.svg', { name: l.name }));
      svgBtn.addEventListener('click', () => {
        download(`${slugName(l.name)}.svg`, C.labelSvg(l.symbols, l.name, summaryLines(r), L.dir === 'rtl'), 'image/svg+xml');
        say('saved-status', t('svg.done', { name: l.name }), 'ok');
      });
      const del = el('button', 'btn', t('btn.delete')); del.type = 'button'; del.setAttribute('aria-label', t('aria.delete', { name: l.name }));
      del.addEventListener('click', () => {
        if (!confirm(t('confirm.delete', { name: l.name }))) return;
        if (save({ labels: data.labels.filter((x) => x.id !== l.id) })) { if (editing === l.id) editing = null; render(); say('saved-status', t('label.deleted', { name: l.name }), 'ok'); }
      });
      acts.append(open, svgBtn, del); li.append(txt, acts); return li;
    }));
  }
  const slugName = (s) => C.norm(s).replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'laundrydecoder';

  $('label-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const f = event.currentTarget;
    try {
      if (!editing && data.labels.length >= C.MAX_LABELS) throw new Error(`err.tooMany|${JSON.stringify({ max: C.MAX_LABELS })}`);
      const label = C.makeLabel({ name: f.name.value, symbols: [...chosen] }, editing || newId());
      const labels = editing ? data.labels.map((l) => (l.id === label.id ? label : l)) : [...data.labels, label];
      if (!save({ labels })) return;
      say('label-status', t(editing ? 'label.updated' : 'label.saved', { name: label.name }), 'ok');
      editing = label.id; renderSaved(); renderSummary();
    } catch (e) { say('label-status', L.error(e), 'error'); }
  });
  $('clear').addEventListener('click', () => { editing = null; chosen = new Set(); $('label-form').name.value = ''; renderComposer(); renderSaved(); say('label-status', ''); });

  // --- Dictionnaire
  function renderDict() {
    const ids = C.search($('search').value, (id) => `${famName(C.SYMBOLS[id].family)} ${symName(id)} ${symDesc(id)}`);
    say('dict-status', $('search').value.trim() ? (ids.length ? t('dict.found', { n: ids.length }) : t('dict.none')) : '');
    const box = $('dict'), groups = [];
    for (const cat of Object.keys(C.CATEGORIES)) {
      const inCat = ids.filter((id) => catOf(C.SYMBOLS[id].family) === cat);
      if (!inCat.length) continue;
      const g = el('div', 'dgroup'); g.append(el('h3', '', t('fam.' + cat)));
      const ul = el('ul', 'dlist');
      for (const id of inCat) {
        const li = el('li'); li.dataset.sym = id; const txt = el('div', 'txt');
        txt.append(el('b', '', symName(id)), el('span', '', symDesc(id)));
        li.append(icon(id), txt); ul.append(li);
      }
      g.append(ul); groups.push(g);
    }
    box.replaceChildren(...groups);
  }
  $('search').addEventListener('input', renderDict);

  // --- Exemple dans la langue affichée
  $('sample').addEventListener('click', () => {
    try {
      const plan = [['shirt', ['w40', 'boxy', 'tlow', 'i150', 'dP']], ['sweater', ['whand', 'bno', 'tno', 'nflat', 'i110', 'dPg']], ['jeans', ['w30', 'w40', 'bno', 'tno', 'nline', 'i150', 'dF']]];
      const fresh = plan.map(([k, symbols]) => C.makeLabel({ name: t('sample.' + k), symbols }, newId()));
      const labels = [...data.labels, ...fresh].slice(0, C.MAX_LABELS);
      if (!save({ labels })) return;
      editing = fresh[2].id; chosen = new Set(fresh[2].symbols); $('label-form').name.value = fresh[2].name;
      render(); say('label-status', t('sample.done'), 'ok');
    } catch (e) { say('label-status', L.error(e), 'error'); }
  });

  // --- Sauvegardes
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export').addEventListener('click', () => {
    try { download('laundrydecoder-backup.json', C.backup(data), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('pick-backup').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      const next = C.validateData(JSON.parse(await file.text()));
      if (!confirm(t('backup.confirm', { a: data.labels.length, b: next.labels.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; }
      $('warning').hidden = true; $('export-raw').hidden = true; editing = null; render();
      say('backup-status', t('backup.restored', { n: next.labels.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => { let raw = ''; try { raw = localStorage.getItem(KEY) || ''; } catch (e) { /* illisible */ } download('laundrydecoder-raw-storage.txt', raw, 'text/plain'); });

  function render() { renderPalette(); renderSummary(); renderSaved(); renderDict(); }

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = C.validateData(JSON.parse(raw));
  } catch (e) {
    readOnly = true; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const id of ['label-status', 'saved-status', 'backup-status']) say(id, ''); render(); }); // sélection, nom et recherche conservés
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
