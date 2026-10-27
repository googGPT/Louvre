/* TextDiff — original bounded LCS implementation, no dependencies or network. */
(function (root) {
  'use strict';
  const MAX_CHARS = 60000;
  const MAX_UNITS = 700;
  const MODES = Object.freeze(['lines', 'words']);

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? key + '|' + JSON.stringify(params) : key); }
  // Un second argument (ancien libellé) est accepté et ignoré : le message ne dépend pas de la langue.
  function validateSource(value) {
    if (typeof value !== 'string') fail('err.text');
    if (value.length > MAX_CHARS) fail('err.tooLong', { max: MAX_CHARS });
    return value;
  }
  function validateOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        !MODES.includes(options.mode) ||
        typeof options.ignoreCase !== 'boolean' ||
        typeof options.ignoreWhitespace !== 'boolean') fail('err.options');
    return { mode: options.mode, ignoreCase: options.ignoreCase, ignoreWhitespace: options.ignoreWhitespace };
  }
  function canonicalNewlines(value) { return value.replace(/\r\n?|\u2028|\u2029/g, '\n'); }
  function tokenize(text, mode) {
    if (!MODES.includes(mode)) fail('err.mode');
    const input = canonicalNewlines(validateSource(text, 'Source'));
    if (input === '') return [];
    const units = mode === 'lines' ? input.split('\n') : (input.match(/\s+|[^\s]+/gu) || []);
    if (units.length > MAX_UNITS) fail(mode === 'lines' ? 'err.tooManyLines' : 'err.tooManyWords', { max: MAX_UNITS });
    return units;
  }
  function comparator(token, opts) {
    let value = token;
    if (opts.ignoreWhitespace) value = opts.mode === 'lines'
      ? value.replace(/\s+/gu, ' ').trim()
      : (/^\s+$/u.test(value) ? ' ' : value);
    if (opts.ignoreCase) value = value.toLowerCase();
    return value;
  }
  function compare(original, revised, rawOptions) {
    validateSource(original, 'Original');
    validateSource(revised, 'Modifié');
    const options = validateOptions(rawOptions);
    const left = tokenize(original, options.mode);
    const right = tokenize(revised, options.mode);
    const a = left.map(t => comparator(t, options));
    const b = right.map(t => comparator(t, options));
    const n = a.length, m = b.length, width = m + 1;
    // 2 * 701² bytes worst case. Never allocate for oversized inputs.
    const lcs = new Uint16Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const off = i * width + j;
        lcs[off] = a[i] === b[j]
          ? 1 + lcs[(i + 1) * width + j + 1]
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
      }
    }
    let i = 0, j = 0, removed = 0, added = 0, unchanged = 0, changeBlocks = 0, changing = false;
    const ops = [];
    while (i < n || j < m) {
      let kind, value, oldIndex = null, newIndex = null;
      if (i < n && j < m && a[i] === b[j]) {
        kind = 'equal'; value = left[i]; oldIndex = ++i; newIndex = ++j;
        unchanged++; changing = false;
      } else if (i < n && (j >= m || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
        kind = 'delete'; value = left[i]; oldIndex = ++i; removed++;
      } else {
        kind = 'insert'; value = right[j]; newIndex = ++j; added++;
      }
      if (kind !== 'equal' && !changing) { changeBlocks++; changing = true; }
      ops.push({ kind, text: value, newText: kind === 'equal' ? right[j - 1] : null, oldIndex, newIndex });
    }
    const total = n + m;
    return {
      options, ops,
      counts: { before: n, after: m, unchanged, removed, added, changeBlocks,
        similarity: total ? Math.round((20000 * unchanged / total)) / 100 : 100 }
    };
  }
  // text : en-tête traduit fourni par l'interface, { title, mode(mode), counts(counts), prefixes }.
  // Les lignes du rapport (préfixes - + ~ et textes entre guillemets) ne dépendent pas de la langue.
  function buildReport(result, text) {
    if (!result || !Array.isArray(result.ops) || !result.counts || !result.options ||
        !MODES.includes(result.options.mode)) fail('err.result');
    if (!text || typeof text.mode !== 'function' || typeof text.counts !== 'function') fail('err.result');
    const h = [String(text.title), text.mode(result.options.mode), text.counts(result.counts), String(text.prefixes), '---'];
    for (const op of result.ops) {
      if (!op || !['equal','delete','insert'].includes(op.kind) || typeof op.text !== 'string') fail('err.result');
      const prefix = op.kind === 'insert' ? '+' : op.kind === 'delete' ? '-' : ' ';
      // JSON quoting guarantees that embedded newlines cannot impersonate report prefixes.
      if (op.kind === 'equal' && op.newText !== op.text)
        h.push('~ ' + JSON.stringify(op.text) + ' => ' + JSON.stringify(op.newText));
      else h.push(prefix + ' ' + JSON.stringify(op.text));
    }
    return h.join('\n') + '\n';
  }
  root.TextDiffCore = Object.freeze({
    MAX_CHARS, MAX_UNITS, MODES, validateSource, validateOptions,
    canonicalNewlines, tokenize, comparator, compare, buildReport
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TextDiffCore;
})(typeof window === 'undefined' ? globalThis : window);
