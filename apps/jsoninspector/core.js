/* JSONInspector — logique pure : analyseur JSON strict (RFC 8259) avec position exacte des erreurs,
   détection des clés dupliquées (que JSON.parse masque en gardant la dernière), nombres imprécis,
   statistiques, chemins JSONPath, formatage fidèle et sauvegarde des documents.
   Fonctionne aussi dans un Web Worker (importScripts) : les gros fichiers n'y bloquent pas la page. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LIMITS = Object.freeze({
    fileBytes: 25_000_000, // fichier ouvert : 25 Mo au plus
    saveChars: 400_000, // texte modifiable et enregistré sur l'appareil ; au-delà : fichier en lecture seule, non enregistré
    totalChars: 2_000_000, // total enregistré
    docs: 30, name: 80, depth: 512, report: 500, page: 200, preview: 20_000,
  });
  const INDENTS = Object.freeze(['2', '4', 'tab']);

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }

  // --- Analyse
  // Un nœud : t (o objet, a tableau, s chaîne, n nombre, b booléen, z null), k (clé ou index),
  // v (valeur ; texte brut pour un nombre), p (parent), c (enfants), at (position), m (masqué par un doublon), u (imprécis).
  const WS = new Set([0x20, 0x09, 0x0a, 0x0d]); // seuls blancs autorisés par JSON
  const STR_RUN = /[^"\\\u0000-\u001f]*/y; // morceau de chaîne sans échappement ni caractère de contrôle
  const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const ESC = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

  class JsonError extends Error {
    constructor(code, at, params) { super(code); this.code = code; this.at = at; this.params = params || null; }
  }

  // Un nombre perd-il de la précision une fois lu par JSON.parse (entier > 2^53, plus de 17 chiffres, dépassement) ?
  function isUnsafeNumber(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return true;
    const mant = raw.replace(/^-/, '').split(/[eE]/)[0];
    if (!/[.eE]/.test(raw) && !Number.isSafeInteger(n)) return true;
    const digits = mant.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
    return digits.length > 17;
  }

  function parse(text) {
    if (typeof text !== 'string') fail('err.input');
    let src = text, bom = false;
    if (src.charCodeAt(0) === 0xfeff) { src = src.slice(1); bom = true; } // marque BOM tolérée (Bloc-notes), signalée
    const nodes = [];
    const dups = [], unsafe = [];
    const keyNames = new Set();
    const st = { objects: 0, arrays: 0, strings: 0, numbers: 0, booleans: 0, nulls: 0, members: 0, maxDepth: 0, maxArray: 0, maxKeys: 0 };
    const len = src.length;
    let i = 0;

    const skip = () => { while (i < len && WS.has(src.charCodeAt(i))) i++; };
    const add = (n) => { n.id = nodes.length; nodes.push(n); return n; };

    function unexpected() {
      if (i >= len) throw new JsonError('unexpectedEnd', i);
      const ch = src[i];
      if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) throw new JsonError('comment', i);
      if (ch === "'") throw new JsonError('singleQuote', i);
      throw new JsonError('unexpectedChar', i, { ch: printable(src.codePointAt(i)) });
    }

    function readString() { // i est sur le guillemet ouvrant
      const start = i; i++;
      let out = '';
      for (;;) {
        STR_RUN.lastIndex = i; STR_RUN.exec(src);
        if (STR_RUN.lastIndex > i) { out += src.slice(i, STR_RUN.lastIndex); i = STR_RUN.lastIndex; }
        if (i >= len) throw new JsonError('unterminatedString', start);
        const c = src.charCodeAt(i);
        if (c === 0x22) { i++; return out; }
        if (c < 0x20) throw new JsonError(c === 0x0a ? 'newlineInString' : 'controlChar', i);
        // barre oblique inverse
        const e = src[i + 1];
        if (e === 'u') {
          const hex = src.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new JsonError('badUnicode', i);
          out += String.fromCharCode(parseInt(hex, 16)); i += 6;
        } else if (e !== undefined && ESC[e] !== undefined) { out += ESC[e]; i += 2; }
        else if (e === undefined) throw new JsonError('unterminatedString', start);
        else throw new JsonError('badEscape', i, { ch: printable(src.codePointAt(i + 1)) });
      }
    }

    function readNumber(node) {
      const start = i;
      NUM.lastIndex = i;
      const m = NUM.exec(src);
      if (!m) throw new JsonError('badNumber', start);
      i = NUM.lastIndex;
      const next = src[i];
      if (/^-?0$/.test(m[0]) && next !== undefined && next >= '0' && next <= '9') throw new JsonError('leadingZero', start);
      if (next === '.' || next === 'e' || next === 'E' || (next >= '0' && next <= '9')) throw new JsonError('badNumber', start);
      node.v = m[0];
      if (isUnsafeNumber(m[0])) { node.u = true; if (unsafe.length < LIMITS.report) unsafe.push(node.id); else unsafe.over = true; }
      st.numbers++;
    }

    function literal(node) {
      for (const [word, t, v] of [['true', 'b', true], ['false', 'b', false], ['null', 'z', null]]) {
        if (src.startsWith(word, i)) {
          const after = src[i + word.length];
          if (after !== undefined && /[A-Za-z0-9_]/.test(after)) break;
          i += word.length; node.t = t; node.v = v; if (t === 'b') st.booleans++; else st.nulls++; return;
        }
      }
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 40));
      if (m) throw new JsonError('badLiteral', i, { word: m[0].slice(0, 20) });
      unexpected();
    }

    function value(parent, key, depth) {
      skip();
      if (i >= len) throw new JsonError('unexpectedEnd', i);
      const node = add({ t: '', k: key, p: parent, at: i });
      const c = src.charCodeAt(i);
      if (c === 0x7b /* { */ || c === 0x5b /* [ */) {
        if (depth + 1 > LIMITS.depth) throw new JsonError('tooDeep', i, { max: LIMITS.depth });
        if (depth + 1 > st.maxDepth) st.maxDepth = depth + 1;
        node.c = [];
        if (c === 0x7b) { node.t = 'o'; st.objects++; object(node, depth + 1); if (node.c.length > st.maxKeys) st.maxKeys = node.c.length; }
        else { node.t = 'a'; st.arrays++; array(node, depth + 1); if (node.c.length > st.maxArray) st.maxArray = node.c.length; }
      } else if (c === 0x22) { node.t = 's'; node.v = readString(); st.strings++; }
      else if (c === 0x2d || (c >= 0x30 && c <= 0x39)) { node.t = 'n'; readNumber(node); }
      else if (c === 0x2b || c === 0x2e) throw new JsonError('badNumber', i); // « +1 », « .5 »
      else literal(node);
      return node;
    }

    function object(node, depth) {
      i++; // {
      const seen = new Map();
      let comma = i;
      skip();
      if (src[i] === '}') { i++; return; }
      for (;;) {
        skip();
        if (src[i] !== '"') {
          if (src[i] === '}' && node.c.length) throw new JsonError('trailingComma', comma);
          if (i < len && /[A-Za-z_$]/.test(src[i])) throw new JsonError('unquotedKey', i);
          if (src[i] === "'") throw new JsonError('singleQuote', i);
          if (i >= len) throw new JsonError('unexpectedEnd', i);
          throw new JsonError('expectedKey', i);
        }
        const keyAt = i;
        const key = readString();
        skip();
        if (src[i] !== ':') { if (i >= len) throw new JsonError('unexpectedEnd', i); throw new JsonError('expectedColon', i); }
        i++;
        const child = value(node.id, key, depth);
        child.kat = keyAt;
        node.c.push(child.id);
        st.members++; keyNames.add(key);
        if (seen.has(key)) {
          const prev = seen.get(key);
          nodes[prev].m = true; // JSON.parse garderait la dernière valeur : la précédente est masquée
          if (dups.length < LIMITS.report) dups.push({ obj: node.id, key, first: prev, dup: child.id }); else dups.over = true;
        }
        seen.set(key, child.id);
        skip();
        if (src[i] === ',') { comma = i++; continue; }
        if (src[i] === '}') { i++; return; }
        if (i >= len) throw new JsonError('unexpectedEnd', i);
        throw new JsonError('expectedCommaObject', i);
      }
    }

    function array(node, depth) {
      i++; // [
      let comma = i;
      skip();
      if (src[i] === ']') { i++; return; }
      for (;;) {
        skip();
        if (src[i] === ']') throw new JsonError('trailingComma', comma);
        const child = value(node.id, node.c.length, depth);
        node.c.push(child.id);
        skip();
        if (src[i] === ',') { comma = i++; continue; }
        if (src[i] === ']') { i++; return; }
        if (i >= len) throw new JsonError('unexpectedEnd', i);
        throw new JsonError('expectedCommaArray', i);
      }
    }

    const lines = lineStarts(src);
    try {
      skip();
      if (i >= len) throw new JsonError('empty', i);
      value(-1, null, 0);
      skip();
      if (i < len) throw new JsonError('trailingData', i);
    } catch (e) {
      if (!(e instanceof JsonError)) throw e;
      const pos = locate(src, lines, e.at);
      return { ok: false, error: { key: 'err.json.' + e.code, params: e.params, line: pos.line, col: pos.col, offset: e.at + (bom ? 1 : 0), excerpt: excerpt(src, lines, pos.line, e.at) }, bom };
    }
    const stats = {
      ...st, values: nodes.length, uniqueKeys: keyNames.size, duplicates: dups.length, unsafeNumbers: unsafe.length,
      bytes: utf8Bytes(text), lines: lines.length, chars: text.length, bom,
    };
    return { ok: true, nodes, src, lines, dups, unsafe, stats, over: { dups: !!dups.over, unsafe: !!unsafe.over } };
  }

  function printable(cp) {
    if (cp === undefined) return '';
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || cp === 0x2028 || cp === 0x2029 || cp === 0xa0 || cp === 0xfeff) return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    return String.fromCodePoint(cp);
  }
  function utf8Bytes(s) {
    let n = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && k + 1 < s.length && (s.charCodeAt(k + 1) & 0xfc00) === 0xdc00) { n += 4; k++; } else n += 3;
    }
    return n;
  }
  // Débuts de ligne (\n, \r\n ou \r seul) pour convertir une position en ligne/colonne.
  function lineStarts(s) {
    const out = [0];
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      if (c === 0x0a) out.push(k + 1);
      else if (c === 0x0d) { if (s.charCodeAt(k + 1) === 0x0a) k++; out.push(k + 1); }
    }
    return out;
  }
  // Ligne et colonne comptées à partir de 1 ; la colonne compte des caractères (un émoji = 1).
  function lineOf(lines, at) { // recherche dichotomique : numéro de ligne (à partir de 1)
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lines[mid] <= at) lo = mid; else hi = mid - 1; }
    return lo + 1;
  }
  function locate(s, lines, at) {
    const line = lineOf(lines, at), start = lines[line - 1];
    return { line, col: [...s.slice(start, at)].length + 1 };
  }
  function excerpt(s, lines, line, at) { // la ligne fautive, raccourcie autour de l'erreur
    const start = lines[line - 1], end = line < lines.length ? lines[line] : s.length;
    const raw = s.slice(start, end).replace(/[\r\n]+$/, '');
    const rel = at - start, from = Math.max(0, rel - 40);
    const text = raw.slice(from, from + 80).replace(/\t/g, ' ');
    return { text: (from > 0 ? '…' : '') + text + (from + 80 < raw.length ? '…' : ''), caret: [...raw.slice(from, rel)].length + (from > 0 ? 1 : 0) };
  }

  // --- Chemins JSONPath
  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  function segment(node) {
    if (typeof node.k === 'number') return `[${node.k}]`;
    return IDENT.test(node.k) ? `.${node.k}` : `['${node.k.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
  }
  function pathOf(nodes, id) {
    const parts = [];
    for (let n = nodes[id]; n && n.p !== -1; n = nodes[n.p]) parts.push(segment(n));
    return '$' + parts.reverse().join('');
  }
  // « $.a[0]['b c'] » -> segments [« a », 0, « b c »]
  function parsePath(path) {
    const s = String(path).trim();
    if (s.length > 2000 || s[0] !== '$') fail('err.path');
    const out = []; let k = 1;
    while (k < s.length) {
      if (s[k] === '.') {
        const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(k + 1));
        if (!m) fail('err.path');
        out.push(m[0]); k += 1 + m[0].length;
      } else if (s[k] === '[') {
        const q = s[k + 1];
        if (q === "'" || q === '"') {
          let j = k + 2, key = '';
          while (j < s.length && s[j] !== q) { if (s[j] === '\\' && j + 1 < s.length) { key += s[j + 1]; j += 2; } else key += s[j++]; }
          if (s[j] !== q || s[j + 1] !== ']') fail('err.path');
          out.push(key); k = j + 2;
        } else {
          const m = /^\[(\d{1,9})\]/.exec(s.slice(k));
          if (!m) fail('err.path');
          out.push(Number(m[1])); k += m[0].length;
        }
      } else fail('err.path');
    }
    return out;
  }
  // Nœud désigné par un chemin. Avec des clés dupliquées, la valeur retenue est la dernière (comme JSON.parse).
  function resolve(nodes, path) {
    const segs = parsePath(path);
    let id = 0;
    for (const seg of segs) {
      const n = nodes[id];
      if (typeof seg === 'number') {
        if (n.t !== 'a' || seg >= n.c.length) fail('err.pathNotFound');
        id = n.c[seg];
      } else {
        if (n.t !== 'o') fail('err.pathNotFound');
        let found = -1;
        for (const cid of n.c) if (nodes[cid].k === seg) found = cid;
        if (found < 0) fail('err.pathNotFound');
        id = found;
      }
    }
    return id;
  }

  // --- Sortie : formatage fidèle (clés dupliquées conservées, nombres recopiés tels quels)
  function indentUnit(indent) {
    if (indent === 'tab') return '\t';
    if (indent === '2' || indent === 2) return '  ';
    if (indent === '4' || indent === 4) return '    ';
    if (indent === 0 || indent === '0' || indent === '') return '';
    fail('err.indent');
  }
  function serialize(nodes, id, indent, maxChars = Infinity) {
    const unit = indentUnit(indent), nl = unit ? '\n' : '', colon = unit ? ': ' : ':';
    const parts = []; let size = 0, cut = false;
    const push = (s) => { if (size > maxChars) { cut = true; return false; } parts.push(s); size += s.length; return true; };
    function walk(nid, pad) {
      const n = nodes[nid];
      if (n.t === 's') return push(JSON.stringify(n.v));
      if (n.t === 'n') return push(n.v);
      if (n.t === 'b') return push(n.v ? 'true' : 'false');
      if (n.t === 'z') return push('null');
      const [open, close] = n.t === 'o' ? ['{', '}'] : ['[', ']'];
      if (!n.c.length) return push(open + close);
      if (!push(open)) return false;
      const inner = pad + unit;
      for (let k = 0; k < n.c.length; k++) {
        if (!push((k ? ',' : '') + nl + inner)) return false;
        if (n.t === 'o' && !push(JSON.stringify(nodes[n.c[k]].k) + colon)) return false;
        if (walk(n.c[k], inner) === false) return false;
      }
      return push(nl + pad + close);
    }
    walk(id, '');
    const text = parts.join('');
    return { text: cut ? text.slice(0, maxChars) : text, cut };
  }

  // Résumé d'un nœud pour l'arbre (sans renvoyer tout le sous-arbre).
  function summary(nodes, id, lines) {
    const n = nodes[id];
    const out = { id, t: n.t, k: n.k, line: lineOf(lines, n.at), m: !!n.m, u: !!n.u, dupKey: false };
    if (n.c) out.count = n.c.length;
    else if (n.t === 's') { out.preview = n.v.length > 120 ? n.v.slice(0, 120) + '…' : n.v; out.len = n.v.length; }
    else out.preview = n.t === 'n' ? n.v : String(n.v);
    return out;
  }

  // Session d'analyse : garde l'arbre (dans le Worker) et répond aux demandes de l'interface.
  function createSession(text) {
    const r = parse(text);
    if (!r.ok) return { result: { ok: false, error: r.error, bom: r.bom } };
    const { nodes, lines } = r;
    const dupKeys = new Set(r.dups.flatMap((d) => [d.first, d.dup]));
    const sum = (id) => { const s = summary(nodes, id, lines); s.dupKey = dupKeys.has(id); return s; };
    const result = {
      ok: true, stats: r.stats, over: r.over, root: sum(0),
      dups: r.dups.map((d) => ({ path: pathOf(nodes, d.obj), key: d.key, first: d.first, dup: d.dup, firstLine: lineOf(lines, nodes[d.first].kat), line: lineOf(lines, nodes[d.dup].kat) })),
      unsafe: r.unsafe.map((id) => ({ id, path: pathOf(nodes, id), raw: nodes[id].v.length > 60 ? nodes[id].v.slice(0, 60) + '…' : nodes[id].v, line: lineOf(lines, nodes[id].at) })),
    };
    return {
      result,
      children(id, offset = 0, limit = LIMITS.page) {
        const n = nodes[id]; if (!n || !n.c) fail('err.node');
        return { total: n.c.length, items: n.c.slice(offset, offset + limit).map(sum) };
      },
      node(id) { if (!nodes[id]) fail('err.node'); return { ...sum(id), path: pathOf(nodes, id), chain: chain(id) }; },
      chain,
      resolve(path) { return resolve(nodes, path); },
      subtree(id, indent, max = LIMITS.preview) { if (!nodes[id]) fail('err.node'); return serialize(nodes, id, indent, max); },
      format(indent) { return serialize(nodes, 0, indent).text; },
      minify() { return serialize(nodes, 0, 0).text; },
    };
    function chain(id) { // ancêtres de la racine jusqu'au nœud, avec la position de chacun chez son parent
      const out = [];
      for (let n = nodes[id]; n; n = n.p === -1 ? null : nodes[n.p]) out.push({ id: n.id, index: n.p === -1 ? 0 : nodes[n.p].c.indexOf(n.id) });
      return out.reverse();
    }
  }

  // --- Documents enregistrés et sauvegarde
  const ID = /^[a-z0-9-]{6,64}$/i;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  function validDay(d) {
    if (typeof d !== 'string' || !DAY.test(d)) return false;
    const [y, m, dd] = d.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, dd));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === dd;
  }
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    const s = v.trim().replace(/\s+/g, ' ');
    if (s.length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    return s;
  }
  function makeDoc(input, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (typeof input.text !== 'string') fail('err.input');
    if (input.text.length > LIMITS.saveChars) fail('err.tooBigToSave', { max: LIMITS.saveChars });
    if (!validDay(input.updated)) fail('err.date');
    return { id, name: cleanName(input.name), text: input.text, updated: input.updated };
  }
  function makePrefs(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).join(',') !== 'indent' || !INDENTS.includes(p.indent)) fail('err.backup');
    return { indent: p.indent };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('err.backup');
    if (data.app !== 'jsoninspector' || data.version !== VERSION) fail('err.notBackup');
    if (Object.keys(data).sort().join(',') !== 'app,docs,prefs,version' || !Array.isArray(data.docs)) fail('err.backup');
    if (data.docs.length > LIMITS.docs) fail('err.tooManyDocs', { max: LIMITS.docs });
    let total = 0;
    const docs = data.docs.map((d) => {
      if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).sort().join(',') !== 'id,name,text,updated') fail('err.backup');
      const doc = makeDoc(d, d.id);
      total += doc.text.length;
      return doc;
    });
    if (total > LIMITS.totalChars) fail('err.backupBig');
    if (new Set(docs.map((d) => d.id)).size !== docs.length) fail('err.backup');
    return { prefs: makePrefs(data.prefs), docs };
  }
  function backup(state) { const s = validateBackup({ app: 'jsoninspector', version: VERSION, prefs: state.prefs, docs: state.docs }); return JSON.stringify({ app: 'jsoninspector', version: VERSION, prefs: s.prefs, docs: s.docs }, null, 2); }
  // Nom de fichier sûr à partir d'un nom de document.
  function fileName(name, suffix) {
    const base = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';
    return `${base}${suffix}.json`;
  }

  root.JsonCore = Object.freeze({ VERSION, LIMITS, INDENTS, parse, isUnsafeNumber, lineStarts, locate, pathOf, parsePath, resolve, serialize, createSession, makeDoc, makePrefs, validateBackup, backup, fileName, utf8Bytes, validDay });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.JsonCore;
})(typeof window === 'undefined' ? globalThis : window);
