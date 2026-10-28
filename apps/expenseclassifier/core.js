/* ExpenseClassifier — logique pure : lecture d'un relevé CSV, classement par règles locales, totaux, export.
   Montants en centimes entiers (négatif = débit), dates en jours civils « AAAA-MM-JJ ».
   Rien n'est envoyé nulle part : ces fonctions travaillent uniquement sur le texte fourni. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX_TX = 5000, MAX_CATS = 60, MAX_RULES = 300, MAX_LABEL = 200, MAX_CAT = 40, MAX_RULE = 80, MAX_COLS = 60;
  const MAX_ABS_CENTS = 99999999999; // 999 999 999,99 : au-delà, la ligne est sûrement mal lue
  const DELIMITERS = Object.freeze([';', ',', '\t', '|']);
  const DATE_FORMATS = Object.freeze(['dmy', 'mdy', 'ymd']);
  const KINDS = Object.freeze(['keyword', 'pattern']);
  const SIGNS = Object.freeze(['any', 'out', 'in']);
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');

  // Texte comparable : sans accents, en minuscules, espaces réduits (« Prélèvement  LOYER » -> « prelevement loyer »).
  function norm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // --- Lecture CSV (guillemets doublés, retours à la ligne dans un champ, fins de ligne Windows, BOM).
  function parseCSV(text, delim) {
    if (!DELIMITERS.includes(delim)) fail('err.delimiter');
    const s = String(text).replace(/^\ufeff/, '');
    const rows = [];
    let row = [], field = '', inQuotes = false, started = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQuotes) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
        continue;
      }
      if (c === '"' && !started) { inQuotes = true; started = true; }
      else if (c === delim) { row.push(field); field = ''; started = false; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = ''; started = false;
        if (rows.length > MAX_TX + 1) fail('err.tooManyRows', { max: MAX_TX });
      } else { field += c; started = true; }
    }
    if (inQuotes) fail('err.csvQuote');
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    if (rows.length > MAX_TX + 1) fail('err.tooManyRows', { max: MAX_TX });
    if (rows.some((r) => r.length > MAX_COLS)) fail('err.tooManyCols', { max: MAX_COLS });
    return rows;
  }
  const isBlank = (row) => row.every((c) => !String(c).trim());

  // Séparateur le plus régulier : même nombre de colonnes (au moins 2) sur le plus de lignes possible.
  function detectDelimiter(text) {
    const sample = String(text).replace(/^\ufeff/, '').split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 30).join('\n');
    let best = ';', bestScore = -1;
    for (const d of DELIMITERS) {
      let rows; try { rows = parseCSV(sample, d).filter((r) => !isBlank(r)); } catch (e) { continue; }
      if (!rows.length) continue;
      const counts = {};
      for (const r of rows) counts[r.length] = (counts[r.length] || 0) + 1;
      const [cols, n] = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (Number(cols) < 2) continue;
      const score = n * 100 + Number(cols); // régularité d'abord, puis nombre de colonnes
      if (score > bestScore) { best = d; bestScore = score; }
    }
    return best;
  }

  // --- Montants
  // Retire espaces, symbole ou code de devise et signe ; renvoie { neg, body } ou null.
  function splitAmount(value) {
    let s = String(value).replace(/[\s\u00a0\u202f]/g, '');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } // (12,00) : notation comptable d'un débit
    const cur = /^(?:[€$£¥]|[A-Z]{3})|(?:[€$£¥]|[A-Z]{3})$/g;
    for (let k = 0; k < 3; k++) { // signe et devise peuvent se suivre dans les deux ordres (« -€12 », « €-12 »)
      s = s.replace(cur, '');
      if (/^[+-]/.test(s)) { neg = neg !== (s[0] === '-'); s = s.slice(1); }
      if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); } // « 12,00- » (certaines banques)
    }
    return { neg, body: s };
  }
  // Devine la virgule ou le point décimal à partir des valeurs d'une colonne ; null si aucun indice.
  function detectDecimal(values) {
    let comma = 0, dot = 0;
    for (const v of values) {
      const p = splitAmount(v); if (!p) continue;
      const b = p.body;
      if (/\d\.\d{3},\d{1,2}$/.test(b) || /^\d+,\d{1,2}$/.test(b) || /\d'\d{3},\d{1,2}$/.test(b)) comma++;
      else if (/\d,\d{3}\.\d{1,2}$/.test(b) || /^\d+\.\d{1,2}$/.test(b) || /\d'\d{3}\.\d{1,2}$/.test(b)) dot++;
    }
    if (!comma && !dot) return null;
    return comma >= dot ? 'comma' : 'dot';
  }
  // « -1 234,56 € » -> -123456 (décimale « comma ») ; refuse tout montant ambigu ou à plus de 2 décimales.
  function parseAmount(value, decimal) {
    if (decimal !== 'comma' && decimal !== 'dot') fail('err.decimal');
    const p = splitAmount(value);
    if (!p || !p.body) fail('err.amount');
    const dec = decimal === 'comma' ? ',' : '.', group = decimal === 'comma' ? '.' : ',';
    const g = group === '.' ? '\\.' : ',';
    const re = new RegExp(`^(\\d{1,3}(?:(?:${g}|')\\d{3})+|\\d+)(?:${dec === '.' ? '\\.' : ','}(\\d{1,2}))?$`);
    const m = p.body.match(re);
    if (!m) fail('err.amount');
    const units = Number(m[1].replace(/[.,']/g, ''));
    const cents = units * 100 + Number(((m[2] || '') + '00').slice(0, 2));
    if (!Number.isSafeInteger(cents) || cents > MAX_ABS_CENTS) fail('err.amount');
    return p.neg ? -cents : cents;
  }
  // Centimes -> texte CSV « -12,34 » ou « -12.34 » (sans séparateur de milliers : relisible partout).
  function formatAmount(cents, decimal) {
    const abs = Math.abs(cents), s = `${Math.floor(abs / 100)}${decimal === 'comma' ? ',' : '.'}${String(abs % 100).padStart(2, '0')}`;
    return cents < 0 ? '-' + s : s;
  }

  // --- Dates
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); // jour réel (29 février compris)
  }
  // « 03/10/2026 » (dmy), « 10/03/2026 » (mdy), « 2026-10-03 » (ymd) -> « 2026-10-03 » ; l'heure éventuelle est ignorée.
  function parseDate(value, format) {
    if (!DATE_FORMATS.includes(format)) fail('err.dateFormat');
    const s = String(value).trim().split(/[ T]/)[0];
    let y, m, d;
    if (format === 'ymd' && /^\d{8}$/.test(s)) { y = s.slice(0, 4); m = s.slice(4, 6); d = s.slice(6); }
    else {
      const parts = s.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
      if (!parts) fail('err.date');
      if (format === 'ymd') { [, y, m, d] = parts; if (y.length !== 4) fail('err.date'); }
      else if (format === 'dmy') { [, d, m, y] = parts; } else { [, m, d, y] = parts; }
      if (d.length > 2 || (y.length !== 2 && y.length !== 4)) fail('err.date');
    }
    if (String(y).length === 2) y = '20' + y; // 26 -> 2026 (relevés bancaires récents)
    const day = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!isDay(day)) fail('err.date');
    return day;
  }
  // Formats compatibles avec toutes les valeurs, du plus sûr au moins sûr (ymd, puis dmy, puis mdy).
  function detectDateFormats(values) {
    const vals = values.map((v) => String(v).trim()).filter(Boolean);
    if (!vals.length) return [];
    return ['ymd', 'dmy', 'mdy'].filter((f) => vals.every((v) => { try { parseDate(v, f); return true; } catch (e) { return false; } }));
  }

  // --- Colonnes : d'abord les en-têtes (plusieurs langues), sinon le contenu.
  const HEADER_WORDS = {
    date: ['date', 'fecha', 'data', 'datum', 'buchungstag', 'valuta', 'jour', 'تاريخ'],
    debit: ['debit', 'soll', 'addebit', 'uscit', 'cargo', 'retrait', 'withdrawal', 'paid out', 'saida', 'ausgang', 'مدين'],
    credit: ['credit', 'haben', 'accredit', 'entrat', 'abono', 'deposit', 'paid in', 'entrada', 'eingang', 'دائن'],
    amount: ['montant', 'amount', 'importe', 'valor', 'betrag', 'importo', 'somme', 'sum', 'المبلغ', 'مبلغ'],
    label: ['libelle', 'label', 'description', 'descripcion', 'concepto', 'descricao', 'beschreibung', 'verwendungszweck', 'buchungstext',
      'descrizione', 'causale', 'operation', 'details', 'memo', 'payee', 'intitule', 'motivo', 'bezeichnung', 'narrative', 'البيان', 'وصف'],
  };
  function detectColumns(rows, opts = {}) {
    const decimal = opts.decimal || 'comma';
    const data = rows.filter((r) => !isBlank(r));
    const head = opts.hasHeader && data.length ? data[0].map(norm) : [];
    const body = (opts.hasHeader ? data.slice(1) : data).slice(0, 50);
    const width = Math.max(0, ...data.map((r) => r.length));
    const map = { date: -1, label: -1, amount: -1, debit: -1, credit: -1 };
    const used = new Set();
    for (const field of ['date', 'debit', 'credit', 'amount', 'label']) { // ordre : « débit » avant « montant »
      const i = head.findIndex((h, k) => !used.has(k) && HEADER_WORDS[field].some((w) => h.includes(w)));
      if (i >= 0) { map[field] = i; used.add(i); }
    }
    const col = (k) => body.map((r) => r[k] ?? '').filter((v) => String(v).trim());
    const all = (k, fn) => { const v = col(k); return v.length > 0 && v.every((x) => { try { fn(x); return true; } catch (e) { return false; } }); };
    if (map.date < 0) map.date = [...Array(width).keys()].find((k) => !used.has(k) && detectDateFormats(col(k)).length) ?? -1;
    if (map.date >= 0) used.add(map.date);
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) {
      // dernière colonne entièrement numérique (les relevés mettent souvent le solde après : on garde la première trouvée)
      map.amount = [...Array(width).keys()].find((k) => !used.has(k) && all(k, (x) => parseAmount(x, decimal))) ?? -1;
      if (map.amount >= 0) used.add(map.amount);
    }
    if (map.label < 0) { // colonne de texte la plus longue en moyenne
      let best = -1, bestLen = -1;
      for (let k = 0; k < width; k++) {
        if (used.has(k)) continue;
        const v = col(k), len = v.reduce((a, x) => a + String(x).length, 0) / (v.length || 1);
        if (len > bestLen) { best = k; bestLen = len; }
      }
      map.label = best;
    }
    if (map.amount >= 0) { map.debit = -1; map.credit = -1; }
    return map;
  }
  // Première ligne = en-têtes si aucune de ses cellules n'est une date ni un montant.
  function detectHeader(rows, decimal = 'comma') {
    const first = rows.find((r) => !isBlank(r));
    if (!first) return false;
    return !first.some((c) => {
      if (!String(c).trim()) return false;
      if (detectDateFormats([c]).length) return true;
      try { parseAmount(c, decimal); return true; } catch (e) { return false; }
    });
  }

  // Lignes CSV -> opérations. Les lignes illisibles sont signalées (jamais devinées) ; les lignes vides ignorées.
  function buildTransactions(rows, opts) {
    const { decimal, dateFormat } = opts;
    const map = opts.map || {};
    if (decimal !== 'comma' && decimal !== 'dot') fail('err.decimal');
    if (!DATE_FORMATS.includes(dateFormat)) fail('err.dateFormat');
    const idx = (k) => (Number.isInteger(map[k]) && map[k] >= 0 ? map[k] : -1);
    const split = idx('amount') < 0;
    if (idx('date') < 0 || idx('label') < 0) fail('err.mapMissing');
    if (split ? idx('debit') < 0 && idx('credit') < 0 : false) fail('err.mapMissing');
    const chosen = ['date', 'label', 'amount', 'debit', 'credit'].map(idx).filter((i) => i >= 0);
    if (new Set(chosen).size !== chosen.length) fail('err.mapDuplicate');
    const transactions = [], errors = [];
    let errorCount = 0;
    const report = (line, key) => { errorCount++; if (errors.length < 50) errors.push({ line, key }); };
    for (let i = opts.hasHeader ? 1 : 0; i < rows.length; i++) {
      const r = rows[i], line = i + 1;
      if (isBlank(r)) continue;
      if (Math.max(...chosen) >= r.length) { report(line, 'err.rowShort'); continue; }
      let date, cents;
      try { date = parseDate(r[idx('date')], dateFormat); } catch (e) { report(line, 'err.rowDate'); continue; }
      try {
        if (!split) cents = parseAmount(r[idx('amount')], decimal);
        else {
          const d = idx('debit') >= 0 ? String(r[idx('debit')]).trim() : '', c = idx('credit') >= 0 ? String(r[idx('credit')]).trim() : '';
          if (!d && !c) throw new Error('empty');
          if (d && c) throw new Error('ambiguous debit and credit');
          cents = (c ? Math.abs(parseAmount(c, decimal)) : 0) - (d ? Math.abs(parseAmount(d, decimal)) : 0);
        }
      } catch (e) { report(line, 'err.rowAmount'); continue; }
      if (transactions.length >= MAX_TX) fail('err.tooManyRows', { max: MAX_TX });
      transactions.push({ date, label: String(r[idx('label')]).replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL), cents });
    }
    // Ordre chronologique stable (le relevé peut être du plus récent au plus ancien).
    const sorted = transactions.map((t, k) => [t, k]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map((x) => x[0]);
    return { transactions: sorted, errors, errorCount };
  }

  // --- Catégories et règles
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function makeCategory(name, id, existing = []) {
    checkId(id);
    if (typeof name !== 'string' || !name.trim()) fail('err.catRequired');
    const n = name.replace(/\s+/g, ' ').trim();
    if (n.length > MAX_CAT) fail('err.catLong', { max: MAX_CAT });
    if (existing.some((c) => c.id !== id && norm(c.name) === norm(n))) fail('err.catExists');
    return { id, name: n };
  }
  function makeRule(input, id, categories) {
    checkId(id);
    if (!categories.some((c) => c.id === input.categoryId)) fail('err.ruleCategory');
    if (!KINDS.includes(input.kind)) fail('err.ruleKind');
    if (!SIGNS.includes(input.sign)) fail('err.ruleSign');
    if (typeof input.value !== 'string' || !input.value.trim()) fail('err.ruleRequired');
    const value = input.value.replace(/\s+/g, ' ').trim();
    if (value.length > MAX_RULE) fail('err.ruleLong', { max: MAX_RULE });
    if (input.kind === 'pattern' && !/[^*?]/.test(value) && value !== '*') fail('err.rulePattern');
    return { id, categoryId: input.categoryId, kind: input.kind, value, sign: input.sign };
  }
  // Joker : « * » = n'importe quelle suite, « ? » = un caractère ; sur tout le libellé. Algorithme linéaire (pas d'expression régulière utilisateur).
  function wildcard(pattern, text) {
    let i = 0, j = 0, star = -1, mark = 0;
    while (j < text.length) {
      if (i < pattern.length && (pattern[i] === '?' || pattern[i] === text[j])) { i++; j++; }
      else if (i < pattern.length && pattern[i] === '*') { star = i++; mark = j; }
      else if (star !== -1) { i = star + 1; j = ++mark; }
      else return false;
    }
    while (i < pattern.length && pattern[i] === '*') i++;
    return i === pattern.length;
  }
  function ruleMatches(rule, tx) {
    if (rule.sign === 'out' && !(tx.cents < 0)) return false;
    if (rule.sign === 'in' && !(tx.cents > 0)) return false;
    const label = norm(tx.label), v = norm(rule.value);
    return rule.kind === 'keyword' ? label.includes(v) : wildcard(v, label);
  }
  // Première règle qui correspond (ordre de la liste = priorité) ; null = non classé.
  function classify(transactions, rules) {
    return transactions.map((tx) => {
      const rule = rules.find((r) => ruleMatches(r, tx));
      return { ...tx, categoryId: rule ? rule.categoryId : null, ruleId: rule ? rule.id : null };
    });
  }
  function moveRule(rules, id, delta) {
    const i = rules.findIndex((r) => r.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= rules.length) return rules.slice();
    const next = rules.slice(); [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  // --- Totaux par catégorie et par mois (débits et crédits séparés, solde net).
  function summarize(classified, categories) {
    const blank = () => ({ outCents: 0, inCents: 0, netCents: 0, count: 0 });
    const add = (acc, c) => { acc.count++; acc.netCents += c; if (c < 0) acc.outCents += -c; else acc.inCents += c; };
    const total = blank(), byCat = new Map(), months = new Map();
    for (const tx of classified) {
      add(total, tx.cents);
      const key = tx.categoryId || '';
      if (!byCat.has(key)) byCat.set(key, blank());
      add(byCat.get(key), tx.cents);
      const month = tx.date.slice(0, 7);
      if (!months.has(month)) months.set(month, { month, ...blank(), byCat: {} });
      const m = months.get(month); add(m, tx.cents); m.byCat[key] = (m.byCat[key] || 0) + tx.cents;
    }
    const categoriesOut = categories.filter((c) => byCat.has(c.id)).map((c) => ({ categoryId: c.id, ...byCat.get(c.id) }));
    if (byCat.has('')) categoriesOut.push({ categoryId: null, ...byCat.get('') });
    const classifiedCount = classified.filter((t) => t.categoryId).length;
    return { total: { ...total, classifiedCount }, categories: categoriesOut, months: [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)) };
  }

  // --- Export CSV classé. Les textes commençant par = + - @ sont neutralisés (pas de formule dans un tableur).
  function csvCell(v, delim) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /["\r\n]/.test(s) || s.includes(delim) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(classified, opts) {
    const { headers, decimal, categoryName } = opts;
    const delim = decimal === 'comma' ? ';' : ',';
    if (!Array.isArray(headers) || headers.length !== 5) fail('err.headers');
    const lines = [headers.map((h) => csvCell(h, delim)).join(delim)];
    for (const tx of classified) {
      lines.push([tx.date, csvCell(tx.label, delim), formatAmount(tx.cents, decimal), csvCell(categoryName(tx.categoryId), delim), tx.date.slice(0, 7)].join(delim));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n'; // BOM : accents corrects à l'ouverture dans un tableur
  }

  // --- Sauvegarde
  function validateTransaction(t) {
    if (!isPlain(t) || !sameKeys(t, ['date', 'label', 'cents'])) fail('err.backup');
    if (!isDay(t.date) || typeof t.label !== 'string' || t.label.length > MAX_LABEL) fail('err.backup');
    if (!Number.isSafeInteger(t.cents) || Math.abs(t.cents) > MAX_ABS_CENTS) fail('err.backup');
    return { date: t.date, label: t.label, cents: t.cents };
  }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'expenseclassifier' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'categories', 'rules', 'transactions'])) fail('err.backup');
    if (!Array.isArray(data.categories) || !Array.isArray(data.rules) || !Array.isArray(data.transactions)) fail('err.backup');
    if (data.categories.length > MAX_CATS) fail('err.tooManyCats', { max: MAX_CATS });
    if (data.rules.length > MAX_RULES) fail('err.tooManyRules', { max: MAX_RULES });
    if (data.transactions.length > MAX_TX) fail('err.tooManyRows', { max: MAX_TX });
    const categories = [];
    for (const c of data.categories) {
      if (!isPlain(c) || !sameKeys(c, ['id', 'name'])) fail('err.backup');
      if (categories.some((x) => x.id === c.id)) fail('err.backup');
      categories.push(makeCategory(c.name, c.id, categories));
    }
    const rules = data.rules.map((r) => {
      if (!isPlain(r) || !sameKeys(r, ['id', 'categoryId', 'kind', 'value', 'sign'])) fail('err.backup');
      return makeRule(r, r.id, categories);
    });
    if (new Set(rules.map((r) => r.id)).size !== rules.length) fail('err.backup');
    return { categories, rules, transactions: data.transactions.map(validateTransaction) };
  }
  function backup(data) {
    const clean = validateData({ app: 'expenseclassifier', version: VERSION, ...data });
    return JSON.stringify({ app: 'expenseclassifier', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, MAX_TX, MAX_CATS, MAX_RULES, MAX_LABEL, DELIMITERS, DATE_FORMATS, KINDS, SIGNS,
    norm, parseCSV, detectDelimiter, detectDecimal, parseAmount, formatAmount, isDay, parseDate, detectDateFormats,
    detectColumns, detectHeader, buildTransactions, makeCategory, makeRule, wildcard, ruleMatches, classify, moveRule,
    summarize, toCSV, validateData, backup,
  };
  root.ExpenseCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ExpenseCore;
})(typeof window === 'undefined' ? globalThis : window);
