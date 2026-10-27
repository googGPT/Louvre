/* SampleSizeCalc — interface. Calculs dans core.js (SampleCore) ; textes et nombres dans LouvreI18n. */
(() => {
  'use strict';
  const C = window.SampleCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue et traductions
  const t = L.t;
  const KEY = 'louvre-samplesizecalc-v1'; // clé de stockage local
  const TAB = 'louvre-samplesizecalc-tab'; // calcul affiché (simple confort)
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
  const newId = () => 'sc-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* confort seulement */ } };

  let scenarios = []; // scénarios enregistrés
  let readOnly = false; // stockage illisible : aucune écriture
  let kind = C.KINDS.includes(safeGet(TAB)) ? safeGet(TAB) : 'one';
  let current = null; // dernier résultat valide affiché

  function say(id, text, kind_ = '') { const n = $(id); n.textContent = text; n.className = 'status' + (kind_ ? ' ' + kind_ : ''); }
  const fmt = (x, d = 2) => L.number(x, { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const fmtFix = (x, d) => L.number(x, { maximumFractionDigits: d, minimumFractionDigits: d });
  const int = (x) => L.number(x, { maximumFractionDigits: 0 });
  const pct = (x) => L.number(x / 100, { style: 'percent', maximumFractionDigits: 2 }); // « 95 % », « 95% »… selon la langue

  function save(next) {
    if (readOnly) { say('backup-status', t('storage.readonly'), 'error'); return false; }
    try { localStorage.setItem(KEY, C.backup(next)); scenarios = next; return true; }
    catch (e) { say('backup-status', t('storage.fail', { msg: L.error(e) }), 'error'); return false; }
  }

  // --- Lecture des champs : chaque champ a sa propre clé d'erreur traduite.
  const v = (id) => $(id).value;
  function readInputs(k) {
    const P = C.parseNum;
    if (k === 'one') return { confidence: P(v('one-confidence'), 'err.confidence'), margin: P(v('one-margin'), 'err.margin'), p: P(v('one-p'), 'err.p'), population: P(v('one-population'), 'err.population', { allowEmpty: true }), response: P(v('one-response'), 'err.response'), deff: P(v('one-deff'), 'err.deff') };
    if (k === 'margin') return { confidence: P(v('m-confidence'), 'err.confidence'), p: P(v('m-p'), 'err.p'), population: P(v('m-population'), 'err.population', { allowEmpty: true }), deff: P(v('m-deff'), 'err.deff'), n: P(v('m-n'), 'err.n') };
    return { p1: P(v('t-p1'), 'err.p1'), p2: P(v('t-p2'), 'err.p2'), alpha: P(v('t-alpha'), 'err.alpha'), power: P(v('t-power'), 'err.power'), sides: Number(v('t-sides')), cc: $('t-cc').checked, response: P(v('t-response'), 'err.response') };
  }
  // Remplit les champs à partir d'hypothèses (scénario chargé ou exemple).
  function fillInputs(k, i) {
    const s = (x) => (x === null ? '' : String(x));
    if (k === 'one') { $('one-confidence').value = s(i.confidence); $('one-margin').value = s(i.margin); $('one-p').value = s(i.p); $('one-population').value = s(i.population); $('one-response').value = s(i.response); $('one-deff').value = s(i.deff); }
    else if (k === 'margin') { $('m-confidence').value = s(i.confidence); $('m-p').value = s(i.p); $('m-population').value = s(i.population); $('m-deff').value = s(i.deff); $('m-n').value = s(i.n); }
    else { $('t-p1').value = s(i.p1); $('t-p2').value = s(i.p2); $('t-alpha').value = s(i.alpha); $('t-power').value = s(i.power); $('t-sides').value = s(i.sides); $('t-cc').checked = i.cc; $('t-response').value = s(i.response); }
  }

  // --- Affichage du résultat et des étapes (formules en écriture de gauche à droite, nombres selon la langue)
  function step(label, formula, value) {
    const li = el('li'); li.append(el('span', 'lbl', label));
    const code = el('code', '', formula); code.dir = 'ltr'; li.append(code);
    if (value !== undefined) { const b = el('b', 'val', value); b.dir = 'ltr'; li.append(b); }
    return li;
  }
  function big(main, sub) { const d = el('div', 'big'); d.append(el('strong', '', main), el('span', '', sub)); return d; }
  function renderResult() {
    const box = $('result'), steps = $('steps'), warns = $('warns');
    let r;
    try { r = C.compute(kind, readInputs(kind)); say('calc-status', ''); }
    catch (e) { current = null; box.replaceChildren(el('p', 'empty', t('result.invalid'))); steps.replaceChildren(); warns.replaceChildren(); say('calc-status', L.error(e), 'error'); $('save').disabled = true; return; }
    current = r; $('save').disabled = false;
    const i = r.inputs, list = [], parts = [];
    if (r.kind === 'one') {
      parts.push(big(int(r.n), t('res.completes', { n: r.n })));
      if (i.response < 100) parts.push(big(int(r.contacts), t('res.contacts', { n: r.contacts, rate: pct(i.response) })));
      parts.push(el('p', 'hint', t('res.oneMeaning', { conf: pct(i.confidence), margin: fmt(i.margin), p: pct(i.p) })));
      list.push(step(t('step.z'), `z = Φ⁻¹(1 − α/2) = Φ⁻¹(${fmt(1 - (1 - i.confidence / 100) / 2, 6)})`, fmtFix(r.z, 4)));
      list.push(step(t('step.n0'), `n₀ = z² · p(1 − p) / e² = ${fmtFix(r.z, 4)}² × ${fmt(i.p / 100, 4)} × ${fmt(1 - i.p / 100, 4)} / ${fmt(i.margin / 100, 4)}²`, fmt(r.n0)));
      if (i.deff !== 1) list.push(step(t('step.deff'), `n₁ = n₀ × deff = ${fmt(r.n0)} × ${fmt(i.deff)}`, fmt(r.nDeff)));
      if (r.nFpc !== null) list.push(step(t('step.fpc'), `n = n₁ / (1 + (n₁ − 1) / N) = ${fmt(r.nDeff)} / (1 + (${fmt(r.nDeff)} − 1) / ${int(i.population)})`, fmt(r.nFpc)));
      list.push(step(t('step.round'), '⌈n⌉', int(r.n)));
      if (i.response < 100) list.push(step(t('step.contacts'), `${int(r.n)} / ${fmt(i.response / 100, 4)} = ${fmt(r.n / (i.response / 100))}`, int(r.contacts)));
    } else if (r.kind === 'margin') {
      parts.push(big(`± ${fmt(r.margin)}`, t('res.marginPoints')));
      parts.push(el('p', 'hint', t('res.interval', { conf: pct(i.confidence), low: pct(r.low), high: pct(r.high), p: pct(i.p), n: i.n })));
      list.push(step(t('step.z'), `z = Φ⁻¹(${fmt(1 - (1 - i.confidence / 100) / 2, 6)})`, fmtFix(r.z, 4)));
      list.push(step(t('step.se'), `√(deff · p(1 − p) / n) = √(${fmt(i.deff)} × ${fmt(i.p / 100, 4)} × ${fmt(1 - i.p / 100, 4)} / ${int(i.n)})`, fmt(r.se, 5)));
      if (i.population !== null) list.push(step(t('step.fpcFactor'), `√((N − n) / (N − 1)) = √((${int(i.population)} − ${int(i.n)}) / (${int(i.population)} − 1))`, fmt(r.fpc, 5)));
      list.push(step(t('step.margin'), `e = z × SE${i.population !== null ? ' × fpc' : ''} × 100`, `± ${fmt(r.margin)}`));
    } else {
      parts.push(big(int(r.perGroup), t('res.perGroup', { n: r.perGroup })));
      parts.push(big(int(r.total), t('res.total', { n: r.total })));
      if (i.response < 100) parts.push(big(int(r.contactsTotal), t('res.contactsTwo', { n: r.contactsTotal, g: int(r.contactsPerGroup), rate: pct(i.response) })));
      parts.push(el('p', 'hint', t('res.twoMeaning', { p1: pct(i.p1), p2: pct(i.p2), power: pct(i.power), alpha: pct(i.alpha), test: t(i.sides === 2 ? 'sides.two' : 'sides.one') })));
      const a = i.p1 / 100, b = i.p2 / 100;
      list.push(step(t('step.zAlpha'), `z₁₋α${i.sides === 2 ? '/2' : ''} = Φ⁻¹(${fmt(1 - i.alpha / 100 / i.sides, 6)})`, fmtFix(r.zA, 4)));
      list.push(step(t('step.zBeta'), `z₁₋β = Φ⁻¹(${fmt(i.power / 100, 6)})`, fmtFix(r.zB, 4)));
      list.push(step(t('step.pbar'), `p̄ = (p₁ + p₂) / 2 = (${fmt(a, 4)} + ${fmt(b, 4)}) / 2`, fmt(r.bar, 4)));
      list.push(step(t('step.nTwo'), `n = [z₁₋α·√(2p̄q̄) + z₁₋β·√(p₁q₁ + p₂q₂)]² / (p₁ − p₂)²`, fmt(r.nRaw)));
      if (i.cc) list.push(step(t('step.cc'), `n′ = n/4 · [1 + √(1 + 4 / (n·|p₁ − p₂|))]²`, fmt(r.nCc)));
      list.push(step(t('step.round'), i.cc ? '⌈n′⌉' : '⌈n⌉', int(r.perGroup)));
      if (i.response < 100) list.push(step(t('step.contacts'), `${int(r.perGroup)} / ${fmt(i.response / 100, 4)}`, int(r.contactsPerGroup)));
    }
    box.replaceChildren(...parts);
    steps.replaceChildren(...list);
    warns.replaceChildren(...r.warnings.map((w) => el('li', '', t(w))));
  }

  // --- Onglets (flèches gauche/droite, inversées en arabe)
  function showTab(k, focus = false) {
    kind = k; safeSet(TAB, k);
    document.querySelectorAll('.tab').forEach((b) => { const on = b.dataset.kind === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    document.querySelectorAll('form.calc').forEach((f) => { f.hidden = f.dataset.kind !== k; });
    renderResult();
  }
  document.querySelectorAll('.tab').forEach((b) => {
    b.addEventListener('click', () => showTab(b.dataset.kind));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const step_ = (e.key === 'ArrowRight' ? 1 : -1) * (L.dir === 'rtl' ? -1 : 1);
      const i = (C.KINDS.indexOf(kind) + step_ + C.KINDS.length) % C.KINDS.length;
      showTab(C.KINDS[i], true); e.preventDefault();
    });
  });
  document.querySelectorAll('form.calc').forEach((f) => {
    f.addEventListener('input', renderResult); f.addEventListener('change', renderResult);
    f.addEventListener('submit', (e) => e.preventDefault());
  });

  // --- Scénarios
  function summary(s) {
    const i = s.inputs, N = i.population === null || i.population === undefined ? t('sum.infinite') : int(i.population);
    if (s.kind === 'one') return t('sum.one', { conf: pct(i.confidence), margin: fmt(i.margin), p: pct(i.p), N, rate: pct(i.response), deff: fmt(i.deff) });
    if (s.kind === 'margin') return t('sum.margin', { n: int(i.n), conf: pct(i.confidence), p: pct(i.p), N, deff: fmt(i.deff) });
    return t('sum.two', { p1: pct(i.p1), p2: pct(i.p2), alpha: pct(i.alpha), power: pct(i.power), test: t(i.sides === 2 ? 'sides.two' : 'sides.one'), cc: i.cc ? t('sum.cc') : '', rate: pct(i.response) });
  }
  function headline(s) {
    const r = C.compute(s.kind, s.inputs);
    if (r.kind === 'one') return [`${int(r.n)} ${t('res.completes', { n: r.n })}`, int(r.contacts)];
    if (r.kind === 'margin') return [`± ${fmt(r.margin)} ${t('res.marginPoints')}`, ''];
    return [`${int(r.perGroup)} ${t('res.perGroup', { n: r.perGroup })} · ${int(r.total)} ${t('res.total', { n: r.total })}`, int(r.contactsTotal)];
  }
  function renderScenarios() {
    const ul = $('scenarios');
    if (!scenarios.length) { ul.replaceChildren(el('li', 'empty', t('saved.empty'))); return; }
    ul.replaceChildren(...scenarios.map((s) => {
      const li = el('li'), txt = el('div', 'txt');
      txt.append(el('b', '', s.name), el('span', 'tag', t('tab.' + s.kind)), el('span', '', headline(s)[0]), el('span', 'muted', summary(s)));
      const acts = el('div', 'acts');
      const load = el('button', 'btn small', t('btn.load')); load.type = 'button'; load.setAttribute('aria-label', t('aria.load', { name: s.name }));
      load.addEventListener('click', () => { fillInputs(s.kind, s.inputs); showTab(s.kind); say('save-status', t('saved.loaded', { name: s.name }), 'ok'); });
      const del = el('button', 'btn small', t('btn.remove')); del.type = 'button'; del.setAttribute('aria-label', t('aria.remove', { name: s.name }));
      del.addEventListener('click', () => { if (confirm(t('confirm.remove', { name: s.name })) && save(scenarios.filter((x) => x.id !== s.id))) { renderScenarios(); say('backup-status', t('saved.removed', { name: s.name }), 'ok'); } });
      acts.append(load, del); li.append(txt, acts); return li;
    }));
  }
  function defaultName(k, i) {
    if (k === 'one') return t('name.one', { conf: pct(i.confidence), margin: fmt(i.margin) });
    if (k === 'margin') return t('name.margin', { n: int(i.n) });
    return t('name.two', { p1: pct(i.p1), p2: pct(i.p2) });
  }
  $('save').addEventListener('click', () => {
    if (!current) return;
    if (scenarios.length >= C.LIMITS.scenarios) { say('save-status', t('err.tooMany', { max: C.LIMITS.scenarios }), 'error'); return; }
    const name = prompt(t('prompt.name'), defaultName(kind, current.inputs)); if (name === null) return;
    try {
      const s = C.makeScenario({ id: newId(), name, kind, inputs: current.inputs });
      if (save([...scenarios, s])) { renderScenarios(); say('save-status', t('saved.added', { name: s.name }), 'ok'); }
    } catch (e) { say('save-status', L.error(e), 'error'); }
  });
  // Exemple : trois scénarios réalistes, nommés dans la langue affichée.
  $('sample').addEventListener('click', () => {
    const ex = [
      ['one', { confidence: 95, margin: 5, p: 50, population: 12000, response: 35, deff: 1 }, t('sample.one')],
      ['margin', { confidence: 95, p: 40, population: 12000, deff: 1, n: 250 }, t('sample.margin')],
      ['two', { p1: 30, p2: 40, alpha: 5, power: 80, sides: 2, cc: false, response: 80 }, t('sample.two')],
    ];
    try {
      const list = ex.map(([k, i, name]) => C.makeScenario({ id: newId(), name, kind: k, inputs: i }));
      if (scenarios.length + list.length > C.LIMITS.scenarios) throw new Error(`err.tooMany|${JSON.stringify({ max: C.LIMITS.scenarios })}`);
      for (const [k, i] of ex) fillInputs(k, i);
      showTab('one');
      if (save([...scenarios, ...list])) { renderScenarios(); say('save-status', t('sample.added'), 'ok'); }
    } catch (e) { say('save-status', L.error(e), 'error'); }
  });

  // --- Exports
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('export-csv').addEventListener('click', () => {
    try {
      const head = ['name', 'kind', 'hypotheses', 'result', 'contacts'].map((k) => t('csv.' + k));
      const rows = scenarios.map((s) => { const [res, contacts] = headline(s); return [s.name, t('tab.' + s.kind), summary(s), res, contacts]; });
      download('sample-size-scenarios.csv', '﻿' + C.toCSV([head, ...rows], $('csv-sep').value), 'text/csv;charset=utf-8');
      say('backup-status', t('export.csvDone', { n: rows.length }), 'ok');
    } catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('export').addEventListener('click', () => {
    try { download('samplesizecalc-backup.json', C.backup(scenarios), 'application/json'); say('backup-status', t('backup.done'), 'ok'); }
    catch (e) { say('backup-status', L.error(e), 'error'); }
  });
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('err.fileBig');
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('err.backup'); }
      const next = C.validateBackup(data);
      if (!confirm(t('backup.confirm', { a: scenarios.length, b: next.length }))) return;
      const wasReadOnly = readOnly; readOnly = false;
      if (!save(next)) { readOnly = wasReadOnly; return; } // échec : on garde la protection
      $('warning').hidden = true; $('export-raw').hidden = true; renderScenarios();
      say('backup-status', t('backup.restored', { n: next.length }), 'ok');
    } catch (e) { say('backup-status', t('backup.refused', { msg: L.error(e) }), 'error'); }
  });
  $('export-raw').addEventListener('click', () => download('samplesizecalc-raw-storage.txt', safeGet(KEY) || '', 'text/plain'));

  // --- Démarrage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) scenarios = C.validateBackup(JSON.parse(raw));
  } catch (e) {
    readOnly = true; scenarios = []; $('warning').hidden = false; $('export-raw').hidden = false;
  }
  L.onChange(() => { for (const id of ['save-status', 'backup-status']) say(id, ''); renderResult(); renderScenarios(); }); // nouvelle langue : on réaffiche
  showTab(kind);
  renderScenarios();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
