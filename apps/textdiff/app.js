/* TextDiff browser adapter. All user content is displayed with textContent. */
(() => {
  'use strict';
  const C = window.TextDiffCore, by = id => document.getElementById(id);
  const L = window.LouvreI18n.init(window.LouvreMessages), t = L.t; // langue et traductions (pas d'argent : menu langue seul)
  let current = null, revision = 0, lastMessage = null;
  const node = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  // s : fonction qui produit le texte (rappelée après un changement de langue) ou texte déjà prêt.
  function message(s, error = false) {
    const e = by('feedback');
    lastMessage = { s, error };
    e.textContent = typeof s === 'function' ? s() : s;
    e.className = error ? 'feedback error' : 'feedback success';
  }
  function clear() {
    current = null;
    by('export').disabled = true;
    by('copy').disabled = true;
    by('result').replaceChildren();
    for (const id of ['stat-original','stat-revised','stat-add','stat-remove','stat-blocks','stat-similarity'])
      by(id).textContent = '—';
    by('result-meta').textContent = t('result.idle');
  }
  function invalidate() {
    revision++;by('compare').disabled = false;clear();
    message(() => t('msg.stale'));
  }
  function settings() {
    return { mode: by('mode').value, ignoreCase: by('ignore-case').checked,
      ignoreWhitespace: by('ignore-whitespace').checked };
  }
  function render(result) {
    const counts = result.counts, box = by('result');
    box.replaceChildren();
    by('stat-original').textContent = counts.before;
    by('stat-revised').textContent = counts.after;
    by('stat-add').textContent = counts.added;
    by('stat-remove').textContent = counts.removed;
    by('stat-blocks').textContent = counts.changeBlocks;
    by('stat-similarity').textContent = L.number(counts.similarity / 100, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lineMode = result.options.mode === 'lines';
    by('result-meta').textContent = (lineMode ? t('meta.lines') : t('meta.words')) +
      ' · ' + t('meta.aligned', { n: result.ops.length }) + ' · ' + t('meta.ignored');
    if (lineMode) {
      const table = node('table','diff-table');
      const head = node('thead'), header = node('tr');
      for (const title of [t('th.before'),t('th.original'),t('th.after'),t('th.revised')])
        header.append(node('th',null,title));
      head.append(header);table.append(head);
      const body = node('tbody');
      for (const op of result.ops) {
        const tr = node('tr','diff-'+op.kind);
        tr.append(node('td','number',op.oldIndex === null ? '' : op.oldIndex));
        const before = node('td','cell-text',op.kind === 'insert' ? '' : op.text), after = node('td','cell-text',op.kind === 'delete' ? '' : op.kind === 'equal' ? op.newText : op.text);
        before.dir = after.dir = 'auto'; // texte de l'utilisateur : sens d'écriture selon son contenu
        tr.append(before);
        tr.append(node('td','number',op.newIndex === null ? '' : op.newIndex));
        tr.append(after);
        body.append(tr);
      }
      table.append(body);box.append(table);
    } else {
      const wrap = node('div','word-panes');
      for (const side of ['before','after']) {
        const panel = node('section','word-pane');
        panel.append(node('h3',null,side === 'before' ? t('th.original') : t('th.revised')));
        const pre = node('div','word-content'); pre.dir = 'auto';
        for (const op of result.ops) {
          if (side === 'before' && op.kind === 'insert') continue;
          if (side === 'after' && op.kind === 'delete') continue;
          pre.append(node('span','diff-'+op.kind,side === 'after' && op.kind === 'equal' ? op.newText : op.text));
        }
        panel.append(pre);wrap.append(panel);
      }
      box.append(wrap);
    }
    if (!result.ops.length) box.append(node('p','empty',t('result.empty')));
    else if (!counts.changeBlocks) box.prepend(node('p','identical',t('result.identical')));
    current = result;by('export').disabled = false;by('copy').disabled = false;
  }
  function run() {
    clear();
    try {
      const result = C.compare(by('original').value,by('revised').value,settings());
      render(result);
      const n = result.counts.changeBlocks;
      message(() => (n ? t('msg.blocks', { n }) : t('msg.noDiff')));
    } catch (e) {
      clear();message(() => t('msg.compareFail', { msg: L.error(e) }),true);
    }
  }
  function download(blob,name) {
    const url = URL.createObjectURL(blob);
    const link = node('a');link.href = url;link.download = name;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  by('compare').addEventListener('click',run);
  by('swap').addEventListener('click',() => {
    const left = by('original').value;
    by('original').value = by('revised').value;
    by('revised').value = left;
    invalidate();run();
  });
  by('example').addEventListener('click',() => {
    by('original').value = t('example.original');
    by('revised').value = t('example.revised');
    by('mode').value='lines';by('ignore-case').checked=false;by('ignore-whitespace').checked=false;
    invalidate();run();
  });
  by('reset').addEventListener('click',() => {
    by('original').value = '';by('revised').value = '';
    by('file-original').value='';by('file-revised').value='';
    by('mode').value='lines';by('ignore-case').checked=false;by('ignore-whitespace').checked=false;
    invalidate();message(() => t('msg.reset'));
  });
  for (const id of ['original','revised']) by(id).addEventListener('input',invalidate);
  for (const id of ['mode','ignore-case','ignore-whitespace']) by(id).addEventListener('change',invalidate);
  for (const [id,target] of [['file-original','original'],['file-revised','revised']]) {
    by(id).addEventListener('change', async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const token = ++revision;clear();by('compare').disabled=true;
      try {
        if (file.size > C.MAX_CHARS * 4) throw Error('err.fileBig');
        const text = await file.text();
        if (token !== revision) return;
        C.validateSource(text);
        by(target).value = text.replace(/^\uFEFF/,'');
        message(() => t('msg.fileLoaded', { name: file.name }));
      } catch(e) {
        if (token===revision) message(() => t('msg.importFail', { msg: L.error(e) }),true);
      } finally {
        if (token===revision) by('compare').disabled=false;
      }
    });
  }
  // En-tête du rapport dans la langue choisie (le corps du rapport ne dépend pas de la langue).
  const reportText = () => ({
    title: t('report.title'),
    mode: (m) => t('report.mode', { mode: m === 'lines' ? t('report.lines') : t('report.words') }),
    counts: (c) => t('report.counts', { unchanged: c.unchanged, added: c.added, removed: c.removed, blocks: c.changeBlocks }),
    prefixes: t('report.prefixes'),
  });
  by('export').addEventListener('click',() => {
    if (!current) return;
    try {
      const report = C.buildReport(current, reportText());
      download(new Blob([report],{type:'text/plain;charset=utf-8'}),'textdiff-report.txt');
      message(() => t('msg.exported'));
    } catch (e) {message(() => L.error(e),true);}
  });
  by('copy').addEventListener('click',async() => {
    if (!current) return;
    const report = C.buildReport(current, reportText());
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw Error('clipboard');
      await navigator.clipboard.writeText(report);
      message(() => t('msg.copied'));
    } catch(e) {
      message(() => t('msg.copyFail'),true);
    }
  });
  // Nouvelle langue : le résultat affiché et le dernier message sont retraduits ; les textes saisis ne bougent pas.
  L.onChange(() => {
    if (current) render(current); else by('result-meta').textContent = t('result.idle');
    if (lastMessage) message(lastMessage.s, lastMessage.error);
  });
  clear();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
