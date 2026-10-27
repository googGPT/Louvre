/* MarkdownDesk — logique pure : analyseur Markdown maison et documents.
   Sécurité : l'analyseur produit un arbre (AST) de nœuds connus ; aucun HTML saisi n'est jamais interprété.
   Le rendu HTML (export) échappe tout texte et tout attribut ; les liens n'acceptent que http(s) et mailto.
   L'interface construit l'aperçu avec createElement/textContent à partir du même arbre. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ docs: 100, title: 120, body: 200000, depth: 6, url: 2000 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }

  // --- Liens : seuls http://, https:// et mailto: passent ; aucun espace, caractère de contrôle ni guillemet.
  function safeUrl(raw) {
    if (typeof raw !== 'string') return null;
    const u = raw.trim();
    if (!u || u.length > MAX.url) return null;
    if (/[\u0000- \u007f-\u009f"'<>`\\]/.test(u)) return null; // espaces, contrôles, guillemets, chevrons
    if (/^https?:\/\/[^/?#]+/i.test(u)) return u;
    if (/^mailto:[^@\s]+@[^@\s]+$/i.test(u)) return u;
    return null; // javascript:, data:, vbscript:, liens relatifs… refusés
  }

  // --- Analyse en ligne (emphase, code, liens)
  const PUNCT = '\\`*_{}[]()#+-.!|~>';
  function parseInline(src, depth = 0) {
    const out = [];
    let pairs = null;
    const noClose = new Set(); // délimiteurs déjà cherchés sans succès : inutile de rechercher plus loin (évite un coût quadratique)
    let buf = '';
    const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
    const push = (node) => { flush(); out.push(node); };
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      // Échappement : \* donne un astérisque littéral ; « \ » en fin de ligne force un retour à la ligne.
      if (c === '\\' && i + 1 < src.length) {
        if (src[i + 1] === '\n') { push({ t: 'br' }); i += 2; continue; }
        if (PUNCT.includes(src[i + 1])) { buf += src[i + 1]; i += 2; continue; }
      }
      if (c === '\n') { // deux espaces avant un saut de ligne = retour à la ligne forcé
        if (/ {2,}$/.test(buf)) { buf = buf.replace(/ +$/, ''); push({ t: 'br' }); } else buf = buf.replace(/ +$/, '') + ' ';
        i++; while (src[i] === ' ') i++; continue;
      }
      if (c === '`') { // code en ligne : même nombre d'accents graves pour fermer
        let n = 0; while (src[i + n] === '`') n++;
        const fence = '`'.repeat(n);
        let end = noClose.has(fence) ? -1 : src.indexOf(fence, i + n);
        while (end > -1 && src[end + n] === '`') { let k = end; while (src[k] === '`') k++; end = src.indexOf(fence, k); } // fermeture de même longueur exacte
        if (end === -1) noClose.add(fence);
        if (end > -1) { push({ t: 'code', v: src.slice(i + n, end).replace(/\n/g, ' ').replace(/^ (.+) $/, '$1') }); i = end + n; continue; }
        buf += fence; i += n; continue;
      }
      if (c === '<') { // lien automatique <https://…> ; sinon un « < » est du texte
        const end = src.slice(i, i + MAX.url + 2).indexOf('>') > -1 ? i + src.slice(i, i + MAX.url + 2).indexOf('>') : -1;
        const href = end > -1 ? safeUrl(src.slice(i + 1, end)) : null;
        if (href) { push({ t: 'link', href, c: [{ t: 'text', v: href.replace(/^mailto:/i, '') }] }); i = end + 1; continue; }
        buf += c; i++; continue;
      }
      if (c === '[' || (c === '!' && src[i + 1] === '[')) { // [texte](url) ou ![alt](url)
        const img = c === '!', open = img ? i + 1 : i;
        pairs = pairs || pairUp(src); // paires [] et () calculées une fois, en temps linéaire
        const close = pairs.get(open) ?? -1;
        if (close > -1 && src[close + 1] === '(') {
          const pe = pairs.get(close + 1) ?? -1, end = pe > -1 && pe - close <= MAX.url + 200 ? pe : -1; // parenthèses équilibrées
          if (end > -1) {
            const label = src.slice(open + 1, close);
            const target = src.slice(close + 2, end).trim().replace(/\s+"[^"]*"$/, ''); // titre facultatif ignoré
            const href = safeUrl(target);
            const inner = depth < MAX.depth ? parseInline(label, depth + 1) : [{ t: 'text', v: label }];
            if (img) push({ t: 'text', v: label }); // pas d'image chargée : on garde le texte alternatif
            else if (href) push({ t: 'link', href, c: inner.filter((n) => n.t !== 'link') });
            else { flush(); out.push(...inner); } // lien refusé : le texte reste, sans lien
            i = end + 1; continue;
          }
        }
        buf += c; i++; continue;
      }
      if ((c === '*' || c === '_' || c === '~') && depth < MAX.depth) {
        let n = 0; while (src[i + n] === c && n < 3) n++;
        if (c === '~' && n !== 2) { buf += src.slice(i, i + n); i += n; continue; }
        const prev = i > 0 ? src[i - 1] : ' ';
        if (c === '_' && /[\p{L}\p{N}]/u.test(prev)) { buf += src.slice(i, i + n); i += n; continue; } // snake_case reste du texte
        const delim = c.repeat(n), after = src[i + n];
        if (after && after !== ' ' && after !== '\n') {
          const end = noClose.has(delim) ? -1 : findClose(src, i + n, delim, c);
          if (end === -1) noClose.add(delim);
          if (end > -1) {
            const inner = parseInline(src.slice(i + n, end), depth + 1);
            const node = c === '~' ? { t: 'del', c: inner } : n === 1 ? { t: 'em', c: inner } : n === 2 ? { t: 'strong', c: inner } : { t: 'strong', c: [{ t: 'em', c: inner }] };
            push(node); i = end + n; continue;
          }
        }
        buf += delim; i += n; continue;
      }
      buf += c; i++;
    }
    flush();
    return out;
  }
  // Associe chaque [ à son ] et chaque ( à sa ) (imbrication respectée, \ échappe) ; libellé de lien limité à 1 000 caractères.
  function pairUp(s) {
    const map = new Map(), sq = [], pa = [];
    for (let j = 0; j < s.length; j++) {
      const ch = s[j];
      if (ch === '\\') { j++; continue; }
      if (ch === '[') sq.push(j);
      else if (ch === ']' && sq.length) { const o = sq.pop(); if (j - o <= 1000) map.set(o, j); }
      else if (ch === '(') pa.push(j);
      else if (ch === ')' && pa.length) map.set(pa.pop(), j);
    }
    return map;
  }
  function findClose(s, from, delim, ch) {
    for (let j = from + 1; j <= s.length - delim.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '`') { const e = s.indexOf('`', j + 1); if (e > -1) { j = e; continue; } }
      if (s.startsWith(delim, j) && s[j - 1] !== ' ' && s[j + delim.length] !== ch && s[j - 1] !== ch) {
        if (ch === '_' && /[\p{L}\p{N}]/u.test(s[j + delim.length] || '')) continue;
        return j;
      }
    }
    return -1;
  }

  // --- Analyse des blocs
  const RE = {
    fence: /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]{0,20})?.*$/,
    heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
    hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
    quote: /^ {0,3}> ?(.*)$/,
    item: /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]+(.*)$/,
    emptyItem: /^( {0,3})([-*+]|\d{1,9}[.)])[ \t]*$/,
    tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
  };
  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = []; let cur = '';
    for (let j = 0; j < s.length; j++) {
      if (s[j] === '\\' && s[j + 1] === '|') { cur += '|'; j++; continue; }
      if (s[j] === '|') { cells.push(cur.trim()); cur = ''; continue; }
      cur += s[j];
    }
    cells.push(cur.trim());
    return cells;
  }
  const startsBlock = (l) => RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.item.test(l);

  function parseBlocks(lines, depth = 0) {
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = RE.fence.exec(line)) && depth < MAX.depth + 2) { // bloc de code : contenu brut, jamais interprété
        const fence = m[1], body = [];
        i++;
        while (i < lines.length && !new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
        i++;
        blocks.push({ t: 'code', lang: m[2] || '', text: body.join('\n') });
        continue;
      }
      if (RE.hr.test(line)) { blocks.push({ t: 'hr' }); i++; continue; }
      if ((m = RE.heading.exec(line))) { blocks.push({ t: 'h', level: m[1].length, c: parseInline(m[2] || '') }); i++; continue; }
      if (RE.quote.test(line)) {
        const inner = [];
        while (i < lines.length && (m = RE.quote.exec(lines[i]))) { inner.push(m[1]); i++; }
        blocks.push(depth < MAX.depth ? { t: 'quote', c: parseBlocks(inner, depth + 1) } : { t: 'p', c: parseInline(inner.join('\n')) });
        continue;
      }
      if ((m = RE.item.exec(line))) {
        const ordered = /\d/.test(m[2]), start = ordered ? Math.min(Number.parseInt(m[2], 10), 999999999) : 1, items = [];
        while (i < lines.length && (m = RE.item.exec(lines[i])) && /\d/.test(m[2]) === ordered) {
          const body = [m[3]];
          i++;
          while (i < lines.length) { // lignes suivantes indentées = contenu de l'élément (sous-listes comprises)
            const l = lines[i];
            if (/^(?: {2,}|\t)/.test(l)) { body.push(l.replace(/^(?: {2,4}|\t)/, '')); i++; continue; }
            if (!l.trim() && i + 1 < lines.length && /^(?: {2,}|\t)\S/.test(lines[i + 1])) { body.push(''); i++; continue; }
            if (l.trim() && !startsBlock(l) && body[body.length - 1] !== '' && !RE.item.test(l)) { body.push(l); i++; continue; } // suite paresseuse
            break;
          }
          items.push(depth < MAX.depth ? parseBlocks(body, depth + 1) : [{ t: 'p', c: parseInline(body.join('\n')) }]);
          if (i < lines.length && !lines[i].trim() && i + 1 < lines.length && RE.item.test(lines[i + 1])) i++; // liste aérée
        }
        blocks.push(ordered ? { t: 'ol', start, items } : { t: 'ul', items });
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
        const head = splitRow(line), cols = head.length;
        const align = splitRow(lines[i + 1]).slice(0, cols).map((s) => (s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'end' : s.startsWith(':') ? 'start' : ''));
        while (align.length < cols) align.push('');
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          const cells = splitRow(lines[i]).slice(0, cols);
          while (cells.length < cols) cells.push('');
          rows.push(cells.map((x) => parseInline(x))); i++;
        }
        blocks.push({ t: 'table', align, head: head.map((x) => parseInline(x)), rows });
        continue;
      }
      const para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]))) para.push(lines[i++]);
      blocks.push({ t: 'p', c: parseInline(para.join('\n').trim()) });
    }
    return blocks;
  }
  function parse(md) {
    if (typeof md !== 'string') fail('err.body');
    return parseBlocks(md.replace(/\r\n?/g, '\n').replace(/\u0000/g, '�').split('\n'));
  }

  // --- Rendu HTML échappé (export autonome)
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ESC[ch]);
  function inlineHtml(nodes) {
    return nodes.map((n) => {
      switch (n.t) {
        case 'text': return esc(n.v);
        case 'code': return `<code>${esc(n.v)}</code>`;
        case 'br': return '<br>';
        case 'em': return `<em>${inlineHtml(n.c)}</em>`;
        case 'strong': return `<strong>${inlineHtml(n.c)}</strong>`;
        case 'del': return `<del>${inlineHtml(n.c)}</del>`;
        case 'link': { const href = safeUrl(n.href); return href ? `<a href="${esc(href)}" rel="noopener noreferrer">${inlineHtml(n.c)}</a>` : inlineHtml(n.c); }
        default: return '';
      }
    }).join('');
  }
  const ALIGN = { start: 'left', end: 'right', center: 'center' };
  function toHtml(blocks, tight = false) {
    return blocks.map((b) => {
      switch (b.t) {
        case 'h': return `<h${b.level}>${inlineHtml(b.c)}</h${b.level}>`;
        case 'p': return tight ? inlineHtml(b.c) : `<p>${inlineHtml(b.c)}</p>`;
        case 'hr': return '<hr>';
        case 'code': return `<pre><code${b.lang ? ` class="language-${esc(b.lang)}"` : ''}>${esc(b.text)}</code></pre>`;
        case 'quote': return `<blockquote>${toHtml(b.c)}</blockquote>`;
        case 'ul': case 'ol': {
          const start = b.t === 'ol' && b.start !== 1 ? ` start="${Number(b.start)}"` : '';
          return `<${b.t}${start}>${b.items.map((it) => `<li>${toHtml(it, true)}</li>`).join('')}</${b.t}>`;
        }
        case 'table': {
          const cell = (tag, c, k) => `<${tag}${b.align[k] ? ` style="text-align:${ALIGN[b.align[k]]}"` : ''}>${inlineHtml(c)}</${tag}>`;
          return `<table><thead><tr>${b.head.map((c, k) => cell('th', c, k)).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, k) => cell('td', c, k)).join('')}</tr>`).join('')}</tbody></table>`;
        }
        default: return '';
      }
    }).join(tight ? '' : '\n');
  }
  // Page HTML autonome : CSP stricte (aucun script, aucune ressource externe), styles intégrés.
  function exportHtml(doc, opts = {}) {
    const lang = /^[a-z]{2}$/.test(opts.lang || '') ? opts.lang : 'fr', dir = opts.dir === 'rtl' ? 'rtl' : 'ltr';
    const css = 'body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2328}pre{background:#f4f4f5;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,monospace}blockquote{margin:0;padding:0 1rem;border-inline-start:4px solid #d0d7de;color:#57606a}table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:6px 10px}img{display:none}';
    return `<!doctype html>\n<html lang="${lang}" dir="${dir}">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(doc.title)}</title>\n<style>${css}</style>\n</head>\n<body>\n${toHtml(parse(doc.body))}\n</body>\n</html>\n`;
  }

  // --- Statistiques et plan
  function plainText(nodes) { return nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.c ? plainText(n.c) : ' ')).join(''); }
  function outline(blocks) { return blocks.filter((b) => b.t === 'h').map((b) => ({ level: b.level, text: plainText(b.c) })); }
  function stats(body) {
    const words = (body.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
    return { chars: [...body].length, words, lines: body ? body.split('\n').length : 0 };
  }

  // --- Documents et sauvegarde
  function checkDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('err.date');
    const [y, m, d] = s.split('-').map(Number), dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) fail('err.date');
    return s;
  }
  function makeDoc(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (typeof input.title !== 'string' || !input.title.trim()) fail('err.titleRequired');
    if (input.title.trim().length > MAX.title) fail('err.titleLong', { max: MAX.title });
    if (typeof input.body !== 'string') fail('err.body');
    if (input.body.length > MAX.body) fail('err.bodyLong', { max: MAX.body });
    return { id, title: input.title.trim(), body: input.body, updated: checkDay(input.updated) };
  }
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'markdowndesk' || data.version !== VERSION || !Array.isArray(data.docs)) fail('err.notBackup');
    if (keys(data) !== 'app,docs,version') fail('err.backup');
    if (data.docs.length > MAX.docs) fail('err.tooManyDocs', { max: MAX.docs });
    const docs = data.docs.map((d) => { if (keys(d) !== 'body,id,title,updated') fail('err.backup'); return makeDoc(d, d.id); });
    if (new Set(docs.map((d) => d.id)).size !== docs.length) fail('err.backup');
    return docs;
  }
  function backup(docs) { return JSON.stringify({ app: 'markdowndesk', version: VERSION, docs: validateBackup({ app: 'markdowndesk', version: VERSION, docs }) }, null, 2); }
  // Nom de fichier sûr à partir du titre.
  function fileName(title, ext) {
    const base = String(title).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
    return `${base || 'document'}.${ext}`;
  }

  root.MdCore = Object.freeze({ VERSION, MAX, safeUrl, parseInline, parse, toHtml, exportHtml, outline, plainText, stats, makeDoc, validateBackup, backup, fileName, esc });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MdCore;
})(typeof window === 'undefined' ? globalThis : window);
