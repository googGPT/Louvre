/* TextDiff browser adapter. All user content is displayed with textContent. */
(() => {
  'use strict';
  const C = window.TextDiffCore, by = id => document.getElementById(id);
  let current = null, revision = 0;
  const node = (tag, className, text) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = String(text);
    return e;
  };
  function message(s, error = false) {
    const e = by('feedback');
    e.textContent = s;
    e.className = error ? 'feedback error' : 'feedback success';
  }
  function clear() {
    current = null;
    by('export').disabled = true;
    by('copy').disabled = true;
    by('result').replaceChildren();
    for (const id of ['stat-original','stat-revised','stat-add','stat-remove','stat-blocks','stat-similarity'])
      by(id).textContent = '—';
    by('result-meta').textContent = 'Lancez une comparaison pour afficher les modifications.';
  }
  function invalidate() {
    revision++;by('compare').disabled = false;clear();
    message('Textes ou paramètres modifiés : relancez la comparaison pour actualiser le rapport.');
  }
  function settings() {
    return { mode: by('mode').value, ignoreCase: by('ignore-case').checked,
      ignoreWhitespace: by('ignore-whitespace').checked };
  }
  function render(result) {
    const counts = result.counts, box = by('result');
    by('stat-original').textContent = counts.before;
    by('stat-revised').textContent = counts.after;
    by('stat-add').textContent = counts.added;
    by('stat-remove').textContent = counts.removed;
    by('stat-blocks').textContent = counts.changeBlocks;
    by('stat-similarity').textContent = counts.similarity.toFixed(2).replace('.',',') + ' %';
    const lineMode = result.options.mode === 'lines';
    by('result-meta').textContent = (lineMode ? 'Comparaison par lignes' : 'Comparaison par mots et espaces') +
      ' · ' + result.ops.length + ' unités alignées · ' +
      'les comparaisons ignorées conservent les textes originaux dans le rendu.';
    if (lineMode) {
      const table = node('table','diff-table');
      const head = node('thead'), header = node('tr');
      for (const title of ['N° avant','Texte d’origine','N° après','Texte modifié'])
        header.append(node('th',null,title));
      head.append(header);table.append(head);
      const body = node('tbody');
      for (const op of result.ops) {
        const tr = node('tr','diff-'+op.kind);
        tr.append(node('td','number',op.oldIndex === null ? '' : op.oldIndex));
        tr.append(node('td','cell-text',op.kind === 'insert' ? '' : op.text));
        tr.append(node('td','number',op.newIndex === null ? '' : op.newIndex));
        tr.append(node('td','cell-text',op.kind === 'delete' ? '' : op.kind === 'equal' ? op.newText : op.text));
        body.append(tr);
      }
      table.append(body);box.append(table);
    } else {
      const wrap = node('div','word-panes');
      for (const side of ['before','after']) {
        const panel = node('section','word-pane');
        panel.append(node('h3',null,side === 'before' ? 'Texte d’origine' : 'Texte modifié'));
        const pre = node('div','word-content');
        for (const op of result.ops) {
          if (side === 'before' && op.kind === 'insert') continue;
          if (side === 'after' && op.kind === 'delete') continue;
          pre.append(node('span','diff-'+op.kind,side === 'after' && op.kind === 'equal' ? op.newText : op.text));
        }
        panel.append(pre);wrap.append(panel);
      }
      box.append(wrap);
    }
    if (!result.ops.length) box.append(node('p','empty','Les deux textes sont vides.'));
    else if (!counts.changeBlocks) box.prepend(node('p','identical','Aucune différence selon les options sélectionnées.'));
    current = result;by('export').disabled = false;by('copy').disabled = false;
  }
  function run() {
    clear();
    try {
      const result = C.compare(by('original').value,by('revised').value,settings());
      render(result);
      message(result.counts.changeBlocks
        ? result.counts.changeBlocks+' bloc(s) modifié(s) détecté(s).'
        : 'Aucune différence détectée selon les options de comparaison.');
    } catch (e) {
      clear();message('Comparaison impossible : '+e.message,true);
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
    by('original').value = 'Bonjour le monde !\nCommande : 8\nStatut : en attente\nMerci.';
    by('revised').value = 'Bonjour le monde !\nCommande : 12\nStatut : confirmée\nMerci.\nLivraison demain.';
    by('mode').value='lines';by('ignore-case').checked=false;by('ignore-whitespace').checked=false;
    invalidate();run();
  });
  by('reset').addEventListener('click',() => {
    by('original').value = '';by('revised').value = '';
    by('file-original').value='';by('file-revised').value='';
    by('mode').value='lines';by('ignore-case').checked=false;by('ignore-whitespace').checked=false;
    invalidate();message('Textes et résultats effacés de cette page.');
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
        if (file.size > C.MAX_CHARS * 4) throw Error('Fichier trop volumineux (240 Ko maximum)');
        const text = await file.text();
        if (token !== revision) return;
        C.validateSource(text,'Fichier');
        by(target).value = text.replace(/^\uFEFF/,'');
        message('Fichier chargé localement : '+file.name+'. Relancez la comparaison.');
      } catch(e) {
        if (token===revision) message('Import impossible : '+e.message,true);
      } finally {
        if (token===revision) by('compare').disabled=false;
      }
    });
  }
  by('export').addEventListener('click',() => {
    if (!current) return;
    try {
      const report = C.buildReport(current);
      download(new Blob([report],{type:'text/plain;charset=utf-8'}),'textdiff-rapport.txt');
      message('Rapport TXT téléchargé (ce rapport n’est pas un patch Git).');
    } catch (e) {message(e.message,true);}
  });
  by('copy').addEventListener('click',async() => {
    if (!current) return;
    const report = C.buildReport(current);
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText)
        throw Error('Presse-papiers indisponible dans ce contexte');
      await navigator.clipboard.writeText(report);
      message('Rapport copié dans le presse-papiers.');
    } catch(e) {
      message('Copie indisponible. Utilisez le téléchargement TXT.',true);
    }
  });
  clear();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http'))
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
