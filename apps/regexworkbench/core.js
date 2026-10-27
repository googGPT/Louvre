/* RegexWorkbench — logique pure : compilation, exécution, remplacement, explication, bibliothèque.
   L'exécution (execute) est appelée dans worker.js : une expression à retour arrière catastrophique ne bloque
   jamais la page, l'interface arrête le Worker au-delà du délai maximal. La page ne fait que compiler
   l'expression (vérification de syntaxe, sans parcours du texte) et l'expliquer. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX = Object.freeze({ pattern: 2000, text: 200000, replacement: 2000, matches: 10000, output: 2000000, items: 200, name: 80 });
  const FLAGS = Object.freeze(['g', 'i', 'm', 's', 'u', 'y']);
  const TIMEOUT = Object.freeze({ min: 100, max: 10000, def: 1000 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }

  // --- Drapeaux : sous-ensemble de « gimsuy », dans un ordre canonique.
  function cleanFlags(f) {
    if (typeof f !== 'string') fail('err.flags');
    for (const c of f) if (!FLAGS.includes(c)) fail('err.flags');
    if (new Set(f).size !== f.length) fail('err.flags');
    return FLAGS.filter((c) => f.includes(c)).join('');
  }
  // Compilation seule (aucun texte parcouru) : sûre dans la page.
  function compile(pattern, flags) {
    if (typeof pattern !== 'string') fail('err.pattern');
    if (!pattern.length) fail('err.patternEmpty');
    if (pattern.length > MAX.pattern) fail('err.patternLong', { max: MAX.pattern });
    const f = cleanFlags(flags);
    try { return new RegExp(pattern, f); }
    catch (e) { fail('err.syntax', { msg: String(e && e.message ? e.message : e).replace(/^Invalid regular expression: /, '').slice(0, 200) }); }
  }
  function parseTimeout(v) {
    const s = String(v).trim();
    if (!/^\d{1,5}$/.test(s)) fail('err.timeout', TIMEOUT);
    const n = Number(s);
    if (n < TIMEOUT.min || n > TIMEOUT.max) fail('err.timeout', TIMEOUT);
    return n;
  }

  // --- Remplacement : même règle que String.prototype.replace ($$, $&, $`, $', $1…$99, $<nom>), recalculée ici
  // pour savoir quels morceaux du résultat proviennent du remplacement (surlignage de l'aperçu).
  function expand(tpl, m, text) {
    const groups = m.length - 1, named = m.groups;
    let out = '', i = 0;
    while (i < tpl.length) {
      const c = tpl[i];
      if (c !== '$' || i + 1 >= tpl.length) { out += c; i++; continue; }
      const n = tpl[i + 1];
      if (n === '$') { out += '$'; i += 2; continue; }
      if (n === '&') { out += m[0]; i += 2; continue; }
      if (n === '`') { out += text.slice(0, m.index); i += 2; continue; }
      if (n === "'") { out += text.slice(m.index + m[0].length); i += 2; continue; }
      if (n >= '0' && n <= '9') {
        const two = tpl[i + 2] >= '0' && tpl[i + 2] <= '9' ? Number(n + tpl[i + 2]) : -1;
        if (two >= 1 && two <= groups) { out += m[two] === undefined ? '' : m[two]; i += 3; continue; }
        const one = Number(n);
        if (one >= 1 && one <= groups) { out += m[one] === undefined ? '' : m[one]; i += 2; continue; }
        out += '$'; i++; continue;
      }
      if (n === '<' && named !== undefined) {
        const end = tpl.indexOf('>', i + 2);
        if (end === -1) { out += '$<'; i += 2; continue; }
        const v = named[tpl.slice(i + 2, end)];
        out += v === undefined ? '' : v; i = end + 1; continue;
      }
      out += '$'; i++;
    }
    return out;
  }

  // Avance après une correspondance vide (en tenant compte des paires de substitution en mode Unicode).
  function advance(text, i, unicode) {
    if (unicode && i < text.length - 1) { const a = text.charCodeAt(i), b = text.charCodeAt(i + 1); if (a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff) return i + 2; }
    return i + 1;
  }

  // Exécution complète (dans le Worker) : correspondances, groupes (positions comprises), remplacement.
  function execute(req) {
    const { pattern, flags, text } = req;
    const replacement = req.replacement === undefined || req.replacement === null ? null : req.replacement;
    if (typeof text !== 'string') fail('err.text');
    if (text.length > MAX.text) fail('err.textLong', { max: MAX.text });
    if (replacement !== null && (typeof replacement !== 'string' || replacement.length > MAX.replacement)) fail('err.replacementLong', { max: MAX.replacement });
    const f = compile(pattern, flags).flags;
    const max = Math.min(MAX.matches, Number.isInteger(req.maxMatches) && req.maxMatches > 0 ? req.maxMatches : MAX.matches);
    const re = new RegExp(pattern, f + 'd'); // « d » : positions des groupes
    const names = groupNames(pattern);
    const global = f.includes('g'), unicode = f.includes('u');
    const matches = [], raw = [];
    let truncated = false;
    re.lastIndex = 0;
    for (;;) {
      const m = re.exec(text);
      if (!m) break;
      raw.push(m);
      const groups = [];
      for (let n = 1; n < m.length; n++) {
        const pos = m.indices[n];
        groups.push({ n, name: names[n] || null, value: m[n] === undefined ? null : m[n], start: pos ? pos[0] : null, end: pos ? pos[1] : null });
      }
      matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups });
      if (!global) break;
      if (m[0] === '') re.lastIndex = advance(text, re.lastIndex, unicode);
      if (matches.length >= max) { truncated = re.exec(text) !== null; break; }
    }
    let output = null;
    if (replacement !== null) {
      output = []; let pos = 0, size = 0;
      for (const m of raw) {
        const keep = text.slice(pos, m.index), rep = expand(replacement, m, text);
        size += keep.length + rep.length;
        if (size > MAX.output) fail('err.outputBig');
        if (keep) output.push({ t: 'keep', v: keep });
        output.push({ t: 'rep', v: rep });
        pos = m.index + m[0].length;
      }
      if (pos < text.length) output.push({ t: 'keep', v: text.slice(pos) });
    }
    return { flags: f, count: matches.length, truncated, matches, groupCount: new RegExp(`(?:${pattern})|`, f).exec('').length - 1, output };
  }
  function outputText(segments) { return segments ? segments.map((s) => s.v).join('') : ''; }

  // --- Explication : découpe l'expression en éléments, chacun avec une clé de traduction et ses paramètres.
  const QUANT = /^\{(\d{1,5})(,(\d{0,5}))?\}/;
  function explain(pattern, flags = '') {
    const tokens = [], warnings = [];
    const src = String(pattern), f = String(flags);
    const unicode = f.includes('u');
    let i = 0, depth = 0, groupN = 0, lit = '';
    const stack = [];
    let last = null; // dernier élément quantifiable : { kind, hasQuant }
    const push = (tok) => { tokens.push({ depth, ...tok }); };
    const flushLit = () => { if (lit) { push({ src: lit, key: 'ex.literal', params: { c: lit } }); last = { kind: 'atom' }; lit = ''; } };
    const atom = (tok) => { flushLit(); push(tok); last = { kind: 'atom' }; };
    while (i < src.length) {
      const c = src[i];
      if (c === '\\' && i + 1 < src.length) {
        const n = src[i + 1];
        const simple = { d: 'ex.digit', D: 'ex.notDigit', w: 'ex.word', W: 'ex.notWord', s: 'ex.space', S: 'ex.notSpace', n: 'ex.newline', t: 'ex.tab', r: 'ex.cr', f: 'ex.other', v: 'ex.other' };
        if (n === 'b' || n === 'B') { flushLit(); push({ src: '\\' + n, key: n === 'b' ? 'ex.boundary' : 'ex.notBoundary', params: {} }); last = null; i += 2; continue; }
        if (simple[n]) { atom({ src: '\\' + n, key: simple[n], params: { c: '\\' + n } }); i += 2; continue; }
        if (n >= '1' && n <= '9') { let j = i + 1; while (j < src.length && src[j] >= '0' && src[j] <= '9') j++; atom({ src: src.slice(i, j), key: 'ex.backref', params: { n: Number(src.slice(i + 1, j)) } }); i = j; continue; }
        if (n === 'k' && src[i + 2] === '<') { const e = src.indexOf('>', i + 3); if (e > -1) { atom({ src: src.slice(i, e + 1), key: 'ex.backrefName', params: { name: src.slice(i + 3, e) } }); i = e + 1; continue; } }
        if ((n === 'p' || n === 'P') && src[i + 2] === '{' && unicode) { const e = src.indexOf('}', i + 3); if (e > -1) { atom({ src: src.slice(i, e + 1), key: n === 'p' ? 'ex.prop' : 'ex.notProp', params: { p: src.slice(i + 3, e) } }); i = e + 1; continue; } }
        let m;
        if ((m = /^\\u\{([0-9a-fA-F]{1,6})\}/.exec(src.slice(i, i + 10))) || (m = /^\\u([0-9a-fA-F]{4})/.exec(src.slice(i, i + 6))) || (m = /^\\x([0-9a-fA-F]{2})/.exec(src.slice(i, i + 4)))) {
          atom({ src: m[0], key: 'ex.unicode', params: { hex: m[1].toUpperCase().padStart(4, '0') } }); i += m[0].length; continue;
        }
        if (n === '0') { atom({ src: '\\0', key: 'ex.nul', params: {} }); i += 2; continue; }
        if (n === 'c' && /[a-zA-Z]/.test(src[i + 2] || '')) { atom({ src: src.slice(i, i + 3), key: 'ex.other', params: { c: src.slice(i, i + 3) } }); i += 3; continue; }
        lit += n; i += 2; continue; // caractère spécial échappé : pris littéralement
      }
      if (c === '[') {
        let j = i + 1;
        const neg = src[j] === '^'; if (neg) j++;
        const start = j;
        while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; }
        const set = src.slice(start, j);
        const tokSrc = src.slice(i, j + 1);
        if (!set) atom({ src: tokSrc, key: neg ? 'ex.anyAll' : 'ex.never', params: {} });
        else atom({ src: tokSrc, key: neg ? 'ex.notClass' : 'ex.class', params: { set } });
        i = j + 1; continue;
      }
      if (c === '(') {
        flushLit();
        let key, params = {}, len = 1, m;
        if (src.startsWith('(?:', i)) { key = 'ex.nonCapture'; len = 3; }
        else if (src.startsWith('(?=', i)) { key = 'ex.lookahead'; len = 3; }
        else if (src.startsWith('(?!', i)) { key = 'ex.negLookahead'; len = 3; }
        else if (src.startsWith('(?<=', i)) { key = 'ex.lookbehind'; len = 4; }
        else if (src.startsWith('(?<!', i)) { key = 'ex.negLookbehind'; len = 4; }
        else if ((m = /^\(\?<([\p{L}\p{Nl}$_][\p{L}\p{N}$_‌‍]*)>/u.exec(src.slice(i, i + 200)))) { key = 'ex.named'; params = { name: m[1], n: ++groupN }; len = m[0].length; }
        else { key = 'ex.group'; params = { n: ++groupN }; }
        push({ src: src.slice(i, i + len), key, params });
        stack.push({ hasQuant: false });
        depth++; last = null; i += len; continue;
      }
      if (c === ')') {
        flushLit();
        const g = stack.pop() || { hasQuant: false };
        depth = Math.max(0, depth - 1);
        push({ src: ')', key: 'ex.groupEnd', params: {} });
        if (g.hasQuant && stack.length) stack[stack.length - 1].hasQuant = true;
        last = { kind: 'group', hasQuant: g.hasQuant };
        i++; continue;
      }
      if (c === '|') { flushLit(); push({ src: '|', key: 'ex.alt', params: {} }); last = null; i++; continue; }
      if (c === '.') { atom({ src: '.', key: f.includes('s') ? 'ex.anyAll' : 'ex.any', params: {} }); i++; continue; }
      if (c === '^' || c === '$') { flushLit(); push({ src: c, key: (c === '^' ? 'ex.start' : 'ex.end') + (f.includes('m') ? 'Line' : ''), params: {} }); last = null; i++; continue; }
      let q = null, len = 1;
      if (c === '*') q = { key: 'ex.q.star', params: {}, unbounded: true };
      else if (c === '+') q = { key: 'ex.q.plus', params: {}, unbounded: true };
      else if (c === '?') q = { key: 'ex.q.opt', params: {}, unbounded: false };
      else if (c === '{') {
        const m = QUANT.exec(src.slice(i, i + 16));
        if (m) {
          len = m[0].length;
          if (!m[2]) q = { key: 'ex.q.exact', params: { n: Number(m[1]) }, unbounded: false };
          else if (m[3] === '') q = { key: 'ex.q.min', params: { n: Number(m[1]) }, unbounded: true };
          else q = { key: 'ex.q.range', params: { n: Number(m[1]), m: Number(m[3]) }, unbounded: Number(m[3]) > 1 };
        }
      }
      if (q) {
        if (lit) { // le quantificateur ne porte que sur le dernier caractère du texte littéral
          const chars = [...lit], lastChar = chars.pop();
          lit = chars.join(''); flushLit(); lit = lastChar; flushLit();
        }
        const lazy = src[i + len] === '?';
        const prevGroup = last && last.kind === 'group' ? last : null;
        if (prevGroup && prevGroup.hasQuant && q.unbounded && !warnings.includes('warn.nested')) warnings.push('warn.nested');
        if (q.unbounded && stack.length) stack[stack.length - 1].hasQuant = true;
        push({ src: src.slice(i, i + len + (lazy ? 1 : 0)), key: q.key, params: q.params, lazy });
        last = null; i += len + (lazy ? 1 : 0); continue;
      }
      lit += c; i++;
    }
    flushLit();
    return { tokens, warnings, groups: groupN };
  }
  // Noms des groupes par numéro (n° -> nom), d'après l'explication.
  function groupNames(pattern) {
    const out = {};
    for (const tk of explain(pattern).tokens) if (tk.key === 'ex.named') out[tk.params.n] = tk.params.name;
    return out;
  }
  const FLAG_KEYS = Object.freeze({ g: 'flag.g', i: 'flag.i', m: 'flag.m', s: 'flag.s', u: 'flag.u', y: 'flag.y' });

  // --- Bibliothèque et sauvegarde
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    if (v.trim().length > MAX.name) fail('err.nameLong', { max: MAX.name });
    return v.trim();
  }
  function makeItem(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const flags = cleanFlags(input.flags || '');
    compile(input.pattern, flags);
    const replacement = typeof input.replacement === 'string' ? input.replacement : '';
    if (replacement.length > MAX.replacement) fail('err.replacementLong', { max: MAX.replacement });
    return { id, name: cleanName(input.name), pattern: input.pattern, flags, replacement };
  }
  function addItem(items, input, id) {
    if (items.length >= MAX.items) fail('err.tooMany', { max: MAX.items });
    const item = makeItem(input, id);
    const same = items.find((x) => x.name.toLowerCase() === item.name.toLowerCase());
    if (same) return items.map((x) => (x.id === same.id ? { ...item, id: same.id } : x)); // même nom : mise à jour
    return [...items, item];
  }
  function makeDraft(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) fail('err.backup');
    const { pattern, flags, text, replacement } = d;
    if (typeof pattern !== 'string' || pattern.length > MAX.pattern) fail('err.patternLong', { max: MAX.pattern });
    if (typeof text !== 'string' || text.length > MAX.text) fail('err.textLong', { max: MAX.text });
    if (typeof replacement !== 'string' || replacement.length > MAX.replacement) fail('err.replacementLong', { max: MAX.replacement });
    return { pattern, flags: cleanFlags(flags), text, replacement };
  }
  const EMPTY_DRAFT = Object.freeze({ pattern: '', flags: 'g', text: '', replacement: '' });
  const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : '');
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'regexworkbench' || data.version !== VERSION) fail('err.notBackup');
    if (keys(data) !== 'app,draft,items,timeoutMs,version' || !Array.isArray(data.items)) fail('err.backup');
    if (data.items.length > MAX.items) fail('err.tooMany', { max: MAX.items });
    const items = data.items.map((it) => {
      if (keys(it) !== 'flags,id,name,pattern,replacement') fail('err.backup');
      const x = makeItem(it, it.id);
      if (x.flags !== it.flags || x.name !== it.name) fail('err.backup');
      return x;
    });
    if (new Set(items.map((x) => x.id)).size !== items.length) fail('err.backup');
    if (keys(data.draft) !== 'flags,pattern,replacement,text') fail('err.backup');
    if (!Number.isInteger(data.timeoutMs)) fail('err.backup');
    return { items, draft: makeDraft(data.draft), timeoutMs: parseTimeout(data.timeoutMs) };
  }
  function backup(state) {
    const s = validateBackup({ app: 'regexworkbench', version: VERSION, ...state });
    return JSON.stringify({ app: 'regexworkbench', version: VERSION, items: s.items, draft: s.draft, timeoutMs: s.timeoutMs }, null, 2);
  }

  root.RegexCore = Object.freeze({ VERSION, MAX, FLAGS, FLAG_KEYS, TIMEOUT, EMPTY_DRAFT, cleanFlags, compile, parseTimeout, expand, execute, outputText, explain, groupNames, makeItem, addItem, makeDraft, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RegexCore;
})(typeof self !== 'undefined' ? self : typeof window === 'undefined' ? globalThis : window);
