/* DescriptiveStats — logique pure : lecture d'une série numérique (formats décimaux de chaque langue),
   statistiques descriptives, quartiles selon une méthode nommée, histogramme SVG, export CSV, sauvegarde. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX_VALUES = 100000, MAX_SERIES = 50, MAX_NAME = 80, MAX_BINS = 50;
  const METHODS = Object.freeze(['type7', 'type6', 'tukey']); // quartiles : R/NumPy/Excel INC, Excel EXC/SPSS, charnières de Tukey
  const BIN_RULES = Object.freeze(['sturges', 'fd', '5', '10', '20']);
  const DIGITS = Object.freeze([2, 3, 4, 6]);
  // Valeurs reconnues comme manquantes (comparaison sans casse) ; une ligne vide aussi.
  const MISSING = new Set(['na', 'n/a', '#n/a', 'nan', 'null', 'none', 'nd', 'n.d.', 'n/d', 'missing', '.', '-', '—', '?']);
  const ID = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');

  // Chiffres arabes-indiens et persans -> chiffres latins ; séparateurs arabes ; signe moins typographique.
  function normalizeDigits(s) {
    return s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
      .replace(/\u2212/g, '-');
  }
  // Un nombre écrit avec le séparateur décimal choisi (',' ou '.'). L'autre signe n'est admis que
  // comme séparateur de milliers bien placé (1.234,5 ou 1,234.5). Espaces insécables, apostrophe et « \u066C » : milliers.
  function parseNumber(token, decimal) {
    if (decimal !== ',' && decimal !== '.') fail('err.decimal');
    let s = normalizeDigits(String(token).trim()).replace(/\u066B/g, decimal).replace(/[\u00A0\u202F\u2009'\u066C]/g, '');
    const group = decimal === ',' ? '\\.' : ',';
    const dec = decimal === ',' ? ',' : '\\.';
    const re = new RegExp(`^([+-]?)(\\d+|\\d{1,3}(?:${group}\\d{3})+)?(?:${dec}(\\d+))?(?:[eE]([+-]?\\d{1,3}))?$`);
    const m = re.exec(s);
    if (!m || (m[2] === undefined && m[3] === undefined)) return null;
    s = `${m[1]}${(m[2] || '0').replace(new RegExp(group, 'g'), '')}.${m[3] || '0'}${m[4] !== undefined ? 'e' + m[4] : ''}`;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  // Série collée : valeurs séparées par retours à la ligne, tabulations, points-virgules ou espaces.
  // Les lignes vides au milieu des données et les jetons « NA » sont des valeurs manquantes ; le reste illisible est signalé.
  function parseSeries(text, decimal) {
    if (typeof text !== 'string') fail('err.text');
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let offset = 0; // lignes vides retirées au début : les numéros de ligne restent ceux du texte collé
    while (lines.length && !lines[0].trim()) { lines.shift(); offset += 1; }
    const items = [], invalid = [];
    let missing = 0;
    lines.forEach((line, i) => {
      const tokens = line.split(/[\t; ]+/).filter((tk) => tk !== '');
      if (!tokens.length) { items.push(null); missing += 1; return; }
      for (const tk of tokens) {
        if (items.length + invalid.length >= MAX_VALUES) fail('err.tooMany', { max: MAX_VALUES });
        if (MISSING.has(tk.toLowerCase())) { items.push(null); missing += 1; continue; }
        const v = parseNumber(tk, decimal);
        if (v === null) invalid.push({ line: i + 1 + offset, token: tk.slice(0, 30) });
        else items.push(v);
      }
    });
    return { items, values: items.filter((v) => v !== null), missing, invalid };
  }

  // --- CSV d'une ou plusieurs colonnes. Séparateur : tabulation ou point-virgule ; la virgule seulement
  //     si le séparateur décimal est le point (sinon « 1,5 » serait coupé en deux).
  function parseCSV(text, decimal) {
    if (typeof text !== 'string') fail('err.text');
    const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const first = (src.split('\n').find((l) => l.trim()) || '').replace(/"[^"]*"/g, '');
    const count = (c) => first.split(c).length - 1;
    const sep = count('\t') ? '\t' : count(';') ? ';' : decimal === '.' && count(',') ? ',' : null;
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (quoted) {
        if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c;
      } else if (c === '"' && cell === '') quoted = true;
      else if (sep && c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > MAX_VALUES + 1) fail('err.tooMany', { max: MAX_VALUES }); }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const width = Math.max(0, ...rows.map((r) => r.length));
    // Première ligne = en-tête si une de ses cellules n'est ni un nombre ni une valeur manquante.
    const isData = (c) => !c.trim() || MISSING.has(c.trim().toLowerCase()) || parseNumber(c, decimal) !== null;
    const hasHeader = rows.length > 1 && rows[0].some((c) => !isData(c));
    const headers = hasHeader ? rows[0].map((h) => h.trim().slice(0, MAX_NAME)) : [];
    const body = hasHeader ? rows.slice(1) : rows;
    const columns = Array.from({ length: width }, (_, k) => body.map((r) => (r[k] === undefined ? '' : r[k].trim())));
    return { sep, headers, columns };
  }

  // --- Statistiques
  function sortedCopy(values) { return Float64Array.from(values).sort(); }
  // Quantile d'ordre p sur des valeurs triées. type7 : h = (n-1)p ; type6 : h = (n+1)p - 1 (bornes ramenées aux extrêmes).
  function quantile(sorted, p, method) {
    const n = sorted.length;
    if (!n) fail('err.noData');
    if (n === 1) return sorted[0];
    let h;
    if (method === 'type7') h = (n - 1) * p;
    else if (method === 'type6') h = Math.min(n - 1, Math.max(0, (n + 1) * p - 1));
    else fail('err.method');
    const lo = Math.floor(h), frac = h - lo;
    return lo + 1 < n ? sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
  }
  function medianOf(sorted, from, to) { // médiane de sorted[from..to-1]
    const len = to - from, mid = from + Math.floor(len / 2);
    return len % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function quartiles(sorted, method) {
    const n = sorted.length;
    if (!n) fail('err.noData');
    if (method === 'tukey') { // charnières : médianes des moitiés inférieure et supérieure (médiane incluse si n est impair)
      if (n === 1) return [sorted[0], sorted[0]];
      const half = Math.ceil(n / 2);
      return [medianOf(sorted, 0, half), medianOf(sorted, n - half, n)];
    }
    return [quantile(sorted, 0.25, method), quantile(sorted, 0.75, method)];
  }

  function describe(values, method = 'type7') {
    if (!Array.isArray(values) && !(values instanceof Float64Array)) fail('err.noData');
    if (!METHODS.includes(method)) fail('err.method');
    const n = values.length;
    if (!n) fail('err.noData');
    for (const v of values) if (typeof v !== 'number' || !Number.isFinite(v)) fail('err.value');
    const s = sortedCopy(values);
    // Moyenne en deux passes (somme compensée, puis correction) : stable même autour de 1e9.
    let sum = 0, c = 0;
    for (const v of values) { const y = v - c, t = sum + y; c = (t - sum) - y; sum = t; }
    let mean = sum / n, corr = 0;
    for (const v of values) corr += v - mean;
    mean += corr / n;
    let m2 = 0, m3 = 0, m4 = 0;
    for (const v of values) { const d = v - mean, d2 = d * d; m2 += d2; m3 += d2 * d; m4 += d2 * d2; }
    const varPop = m2 / n, varSample = n > 1 ? m2 / (n - 1) : null;
    const sdSample = varSample === null ? null : Math.sqrt(varSample);
    // Asymétrie G1 et aplatissement (excès) G2 « échantillon ajustés » : mêmes formules que SKEW et KURT d'Excel.
    let skewness = null, kurtosis = null;
    if (n >= 3 && m2 > 0) skewness = (n / ((n - 1) * (n - 2))) * (m3 / Math.pow(sdSample, 3));
    if (n >= 4 && m2 > 0) kurtosis = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * (m4 / (varSample * varSample)) - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    const [q1, q3] = quartiles(s, method);
    return {
      n, sum, mean, median: medianOf(s, 0, n),
      varSample, varPop, sdSample, sdPop: Math.sqrt(varPop), sem: sdSample === null ? null : sdSample / Math.sqrt(n),
      min: s[0], max: s[n - 1], range: s[n - 1] - s[0], q1, q3, iqr: q3 - q1, skewness, kurtosis, method,
    };
  }

  // --- Histogramme à classes d'égale largeur (dernière classe fermée à droite).
  function binCount(values, rule) {
    if (!BIN_RULES.includes(rule)) fail('err.bins');
    const n = values.length;
    if (/^\d+$/.test(rule)) return Number(rule);
    const sturges = Math.ceil(Math.log2(n)) + 1;
    if (rule === 'sturges') return Math.min(MAX_BINS, Math.max(1, sturges));
    const s = sortedCopy(values), [q1, q3] = quartiles(s, 'type7'), range = s[n - 1] - s[0];
    const width = 2 * (q3 - q1) / Math.cbrt(n); // Freedman–Diaconis
    if (!(width > 0) || !(range > 0)) return Math.min(MAX_BINS, Math.max(1, sturges));
    return Math.min(MAX_BINS, Math.max(1, Math.ceil(range / width)));
  }
  function histogram(values, rule = 'sturges') {
    if (!values.length) fail('err.noData');
    let min = Infinity, max = -Infinity;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
    const k = max > min ? binCount(values, rule) : 1;
    const width = max > min ? (max - min) / k : 1;
    const counts = new Array(k).fill(0);
    for (const v of values) counts[Math.min(k - 1, Math.floor((v - min) / width))] += 1;
    return counts.map((count, i) => ({ from: min + i * width, to: i === k - 1 ? (max > min ? max : min) : min + (i + 1) * width, count }));
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // SVG autonome (fond blanc, polices système) ; fmt(x) formate les nombres dans la langue affichée.
  function histogramSVG(bins, opts = {}) {
    const fmt = opts.fmt || ((x) => String(x));
    const W = 640, H = 340, L = 52, R = 16, T = opts.title ? 40 : 16, B = 56;
    const maxC = Math.max(1, ...bins.map((b) => b.count));
    const pw = W - L - R, ph = H - T - B, bw = pw / bins.length;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.label || '')}" font-family="system-ui,-apple-system,Segoe UI,sans-serif">`,
      `<rect width="${W}" height="${H}" fill="#ffffff"/>`];
    if (opts.title) out.push(`<text x="${W / 2}" y="24" text-anchor="middle" font-size="15" font-weight="700" fill="#1f2933">${esc(opts.title)}</text>`);
    const ticks = 4;
    for (let i = 0; i <= ticks; i += 1) {
      const v = Math.round((maxC * i) / ticks), y = T + ph - (ph * v) / maxC;
      out.push(`<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e4e7eb"/>`,
        `<text x="${L - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#52606d">${esc(fmt(v))}</text>`);
    }
    bins.forEach((b, i) => {
      const h = (ph * b.count) / maxC, x = L + i * bw;
      out.push(`<rect x="${(x + 1).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#c2410c"><title>${esc(fmt(b.from))} – ${esc(fmt(b.to))} : ${b.count}</title></rect>`);
    });
    const every = Math.ceil(bins.length / 8); // au plus ~9 étiquettes lisibles
    bins.forEach((b, i) => {
      if (i % every === 0) out.push(`<text x="${(L + i * bw).toFixed(1)}" y="${T + ph + 16}" text-anchor="middle" font-size="11" fill="#52606d">${esc(fmt(b.from))}</text>`);
    });
    out.push(`<text x="${W - R}" y="${T + ph + 16}" text-anchor="end" font-size="11" fill="#52606d">${esc(fmt(bins[bins.length - 1].to))}</text>`,
      `<line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" stroke="#52606d"/>`);
    if (opts.xLabel) out.push(`<text x="${L + pw / 2}" y="${H - 14}" text-anchor="middle" font-size="12" fill="#1f2933">${esc(opts.xLabel)}</text>`);
    out.push('</svg>');
    return out.join('');
  }

  // --- Export CSV des résultats : rows = [[libellé, valeur|null], …]. Avec la virgule décimale : « ; » et « 1,5 ».
  function resultsCSV(header, rows, decimal) {
    const sep = decimal === ',' ? ';' : ',';
    const cell = (v) => { const s = String(v); return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const num = (v) => (v === null || v === undefined ? '' : decimal === ',' ? String(v).replace('.', ',') : String(v));
    return [header.map(cell).join(sep), ...rows.map(([label, v]) => `${cell(label)}${sep}${cell(num(v))}`)].join('\r\n') + '\r\n';
  }

  // --- Séries enregistrées et sauvegarde : { app, version, settings, series: [{ id, name, items: [nombre|null] }] }
  const DEFAULT_SETTINGS = Object.freeze({ decimal: ',', method: 'type7', bins: 'sturges', digits: 3 });
  function makeSettings(s) {
    if (!isObj(s) || !keysAre(s, ['decimal', 'method', 'bins', 'digits'])) fail('err.backup');
    if (s.decimal !== ',' && s.decimal !== '.') fail('err.decimal');
    if (!METHODS.includes(s.method)) fail('err.method');
    if (!BIN_RULES.includes(s.bins)) fail('err.bins');
    if (!DIGITS.includes(s.digits)) fail('err.backup');
    return { decimal: s.decimal, method: s.method, bins: s.bins, digits: s.digits };
  }
  function makeSeries(name, items, id) {
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    if (typeof name !== 'string' || !name.trim()) fail('err.nameRequired');
    if (name.trim().length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    if (!Array.isArray(items)) fail('err.backup');
    if (items.length > MAX_VALUES) fail('err.tooMany', { max: MAX_VALUES });
    if (!items.some((v) => v !== null)) fail('err.noData');
    for (const v of items) if (v !== null && (typeof v !== 'number' || !Number.isFinite(v))) fail('err.backup');
    return { id, name: name.trim(), items: items.slice() };
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'descriptivestats' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'settings', 'series']) || !Array.isArray(data.series)) fail('err.backup');
    if (data.series.length > MAX_SERIES) fail('err.tooManySeries', { max: MAX_SERIES });
    const settings = makeSettings(data.settings);
    const series = data.series.map((s) => {
      if (!isObj(s) || !keysAre(s, ['id', 'name', 'items'])) fail('err.backup');
      return makeSeries(s.name, s.items, s.id);
    });
    if (new Set(series.map((s) => s.id)).size !== series.length) fail('err.backup');
    return { settings, series };
  }
  function backup(settings, series) {
    const ok = validateBackup({ app: 'descriptivestats', version: VERSION, settings, series });
    return JSON.stringify({ app: 'descriptivestats', version: VERSION, settings: ok.settings, series: ok.series });
  }
  // Texte d'une série enregistrée, une valeur par ligne, avec le séparateur décimal choisi (« NA » = manquante).
  function seriesText(items, decimal) {
    return items.map((v) => (v === null ? 'NA' : decimal === ',' ? String(v).replace('.', ',') : String(v))).join('\n');
  }

  root.StatsCore = Object.freeze({
    VERSION, MAX_VALUES, MAX_SERIES, METHODS, BIN_RULES, DIGITS, DEFAULT_SETTINGS, parseNumber, parseSeries, parseCSV, quantile, quartiles, describe,
    binCount, histogram, histogramSVG, resultsCSV, makeSettings, makeSeries, validateBackup, backup, seriesText,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.StatsCore;
})(typeof window === 'undefined' ? globalThis : window);
