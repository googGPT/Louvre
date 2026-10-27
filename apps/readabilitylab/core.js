/* ReadabilityLab — logique pure : découpage en phrases et en mots (abréviations, nombres décimaux, ponctuation arabe),
   statistiques de longueur, phrases et mots longs, répétitions, et formules de lisibilité limitées à la langue pour
   laquelle chacune a été conçue. Le comptage de syllabes est une approximation orthographique (règles simples). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const TEXT_LANGS = Object.freeze(['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'other']); // langue du texte (≠ langue de l'interface)
  const LIMITS = Object.freeze({ docs: 30, text: 50000, name: 80 });
  const RANGES = Object.freeze({ longSentence: [5, 100], longWord: [6, 40] });
  const DEFAULTS = Object.freeze({ longSentence: 25, longWord: 12 });
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => isObj(o) && Object.keys(o).sort().join(',') === [...list].sort().join(',');

  // --- Abréviations qui ne terminent jamais une phrase (titres, renvois). Les autres (etc., usw.) sont gérées
  // par la règle « minuscule ensuite » : « etc. et » ne coupe pas, « etc. Puis » coupe.
  const ABBR = Object.freeze({
    fr: ['m', 'mm', 'mme', 'mmes', 'mlle', 'dr', 'pr', 'me', 'st', 'ste', 'p', 'pp', 'ex', 'cf', 'env', 'vol', 'chap', 'fig', 'éd', 'av', 'bd', 'n°', 'no', 'art', 'max', 'min', 'hab'],
    en: ['mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'jr', 'sr', 'vs', 'e.g', 'i.e', 'no', 'fig', 'p', 'pp', 'vol', 'approx', 'dept', 'mt', 'cf', 'ch', 'eq', 'al'],
    es: ['sr', 'sra', 'srta', 'dr', 'dra', 'd', 'dña', 'ud', 'uds', 'p', 'pág', 'págs', 'núm', 'n', 'art', 'ej', 'vol', 'cap', 'fig', 'av', 'prof', 'aprox'],
    de: ['z', 'd', 'u', 'o', 'hr', 'fr', 'dr', 'prof', 'z.b', 'd.h', 'u.a', 'bzw', 'ca', 'nr', 's', 'vgl', 'ggf', 'evtl', 'inkl', 'bspw', 'str', 'abs', 'abb', 'bd', 'max', 'min', 'hrsg'],
    it: ['sig', 'sigg', 'sig.ra', 'dott', 'dott.ssa', 'prof', 'avv', 'ing', 'p', 'pag', 'pagg', 'es', 'cfr', 'n', 'art', 'vol', 'cap', 'fig', 'ecc'],
    pt: ['sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'p', 'pág', 'n', 'nº', 'ex', 'art', 'vol', 'cap', 'fig', 'av', 'cf', 'aprox'],
    ar: [], other: ['dr', 'prof', 'mr', 'mrs', 'e.g', 'i.e', 'vs', 'no', 'p', 'pp', 'fig'],
  });
  // Élisions séparées en deux mots (l'école → l' + école), comme le font la plupart des comptages en français et en italien.
  const ELISION = Object.freeze({
    fr: new Set(['l', 'd', 'j', 'm', 'n', 's', 't', 'c', 'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu']),
    it: new Set(['l', 'd', 'un', 'dell', 'dall', 'nell', 'sull', 'all', 'quell', 'bell', 'c', 's', 'm', 't', 'v', 'n']),
  });
  // Mots-outils ignorés dans les répétitions (listes courtes, volontairement non exhaustives).
  const STOP = Object.freeze({
    fr: 'alors aussi autre avec avoir cela cette comme dans depuis donc elle elles entre être fait leur leurs mais même nous notre nous pour plus sans selon sont sous tout tous toute toutes très vous votre ainsi avait était cest dont encore entre peut quand quel quelle',
    en: 'about after also been before being both could does each from have into more most much must only other over same should some such than that their them then there these they this those through very were what when where which while will with would your',
    es: 'ante aunque cada como con contra cual cuando desde donde durante esta este esto estos entre hacia hasta mientras muy nada otra otro para pero poco porque sobre según también tanto todo todos tras pues sino sus había fueron ellos ellas',
    de: 'aber alle allem allen aller alles also auch auf aus bei beim bis dass dein deine dem den denn der des die dies diese diesem diesen dieser durch eine einem einen einer eines euer für gegen haben hatte hier ihre ihren ihr ist mich mit nach nicht noch nur oder ohne sein seine sich sind über unter vom von vor war waren weil wenn werden wie wird wurde zum zur',
    it: 'anche alla alle allo agli ancora come con contro dalla dalle degli della delle dello dove dopo ecco essere fino loro molto nella nelle negli nello noi però perché più poco quale quando quella quelle quello questa queste questo sono sotto sulla sulle tutto tutti verso',
    pt: 'ainda além antes após assim aquele aquela cada como com contra desde depois durante ela elas eles entre essa esse esta este isso isto mais mas muito nada nossa nosso para pela pelo pelos pelas porque quando qual quem sem sobre também tanto todo todos uma umas',
    ar: 'التي الذي الذين على إلى من في عن مع هذا هذه ذلك تلك كان كانت هو هي هم أن إن لم لن قد كما بين بعد قبل حتى عند كل أو ثم لا ما',
    other: '',
  });
  const STOPSETS = Object.fromEntries(Object.entries(STOP).map(([k, v]) => [k, new Set(v.split(' ').filter(Boolean))]));

  const CASED = (ch) => ch.toLowerCase() !== ch.toUpperCase();
  const isLower = (ch) => CASED(ch) && ch === ch.toLowerCase();

  // --- Phrases : renvoie [{ start, end, text }] avec les positions exactes dans le texte (pour surligner dans la zone de saisie).
  const TERM = /[.!?؟۔…]+(?:[\s  ]*[»”"'’)\]])*(?=\s|$)/gu;
  function splitSentences(text, lang = 'fr') {
    if (typeof text !== 'string') fail('err.text');
    const abbr = new Set(ABBR[lang] || ABBR.other);
    const cuts = [];
    let m;
    TERM.lastIndex = 0;
    while ((m = TERM.exec(text))) {
      const end = m.index + m[0].length;
      const after = text.slice(end).match(/^\s*([^\s"'«“(\[])?/u);
      const next = after && after[1] ? after[1] : '';
      if (next && isLower(next)) continue; // « etc. et », « ! » dit-il » : la phrase continue
      if (m[0][0] === '.' && m[0].replace(/[\s»”"'’)\]]/g, '') === '.') { // un seul point : abréviation, initiale, numéro de liste ?
        const before = text.slice(0, m.index).match(/(\S+)$/u);
        const tok = before ? before[1].replace(/^[«“"'(\[]+/u, '').toLowerCase() : '';
        if (abbr.has(tok)) continue;
        if (/^\p{Lu}$/u.test(before ? before[1].replace(/^[«“"'(\[]+/u, '') : '')) continue; // initiale : « J. K. Rowling »
        if (/^\d+$/.test(tok)) {
          const lineStart = /(^|\n)[ \t]*$/.test(text.slice(0, m.index - tok.length));
          if (lineStart || lang === 'de') continue; // « 1. Introduction », ordinal allemand « am 3. Mai »
        }
      }
      cuts.push(end);
    }
    // Les lignes vides séparent toujours (titres, paragraphes sans ponctuation finale).
    const para = /\n[ \t]*\n/g;
    while ((m = para.exec(text))) cuts.push(m.index);
    const item = /\n(?=[ \t]*(?:\d{1,3}[.)]|[-•*–])\s)/g; // début d'un élément de liste (« 2. », « - », « • »)
    while ((m = item.exec(text))) cuts.push(m.index);
    const ends = [...new Set(cuts)].sort((a, b) => a - b);
    const out = [];
    let start = 0;
    for (const e of [...ends, text.length]) {
      if (e <= start) continue;
      const raw = text.slice(start, e), lead = raw.length - raw.trimStart().length, body = raw.trim();
      if (body && wordTokens(body, lang).length) out.push({ start: start + lead, end: start + lead + body.length, text: body });
      start = e;
    }
    return out;
  }

  // --- Mots : nombres (3,14 ; 1.000) en un seul mot ; mots composés et apostrophes gardés, sauf élisions fr/it.
  const WORD = /\p{N}+(?:[.,]\p{N}+)+|[\p{L}\p{M}\p{N}]+(?:[’'\-‐][\p{L}\p{M}\p{N}]+)*/gu;
  function wordTokens(text, lang = 'fr') {
    const out = [], el = ELISION[lang];
    for (const m of String(text).matchAll(WORD)) {
      const w = m[0], at = m.index, ap = w.search(/[’']/);
      if (el && ap > 0 && el.has(w.slice(0, ap).toLowerCase())) { out.push({ w: w.slice(0, ap + 1), elided: true, at }, { w: w.slice(ap + 1), elided: false, at: at + ap + 1 }); }
      else out.push({ w, elided: false, at });
    }
    return out;
  }
  const letters = (w) => (w.match(/\p{L}/gu) || []).length;
  const isNumber = (w) => /^\p{N}/u.test(w) && !/\p{L}/u.test(w);

  // --- Syllabes (approximation orthographique). null pour l'arabe et « autre langue » : aucune règle proposée.
  const VOW = { fr: 'aeiouyàâäéèêëîïôöùûüÿœæ', en: 'aeiouy', de: 'aeiouyäöü' };
  const STRONG = new Set('aeoáéóíúâêôãõàèìòùú'); // es / it / pt : voyelles fortes (i, u accentués comptent comme fortes)
  const WEAK = new Set('iuüy');
  function syllables(word, lang) {
    if (lang === 'ar' || lang === 'other') return null;
    let w = word.toLowerCase().normalize('NFC').replace(/[^\p{L}]/gu, '');
    if (!w) return 1; // nombre : compté pour une syllabe (approximation)
    if (lang === 'en') {
      if (w.length <= 3) return 1;
      w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
      return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length);
    }
    if (lang === 'fr' || lang === 'de') {
      const re = new RegExp(`[${VOW[lang]}]+`, 'g');
      let n = (w.match(re) || []).length;
      if (lang === 'fr' && n > 1 && /[^aeiouyàâäéèêëîïôöùûü](e|es)$/.test(w)) n--; // e muet final : « table », « tables »
      return Math.max(1, n);
    }
    // es, it, pt : une voyelle forte après une forte ouvre une nouvelle syllabe (hiatus) ; les faibles forment diphtongue.
    if (w === 'y') return 1;
    let n = 0, prev = '';
    for (let i = 0; i < w.length; i++) {
      const ch = w[i], strong = STRONG.has(ch), weak = WEAK.has(ch) && !(ch === 'y' && i < w.length - 1);
      if (!strong && !weak) { prev = ''; continue; }
      if (!prev) n++;
      else if (strong && prev === 'S' && !(lang === 'pt' && 'ãõ'.includes(w[i - 1]) && 'oe'.includes(ch))) n++; // « não » : diphtongue nasale
      prev = strong ? 'S' : 'W';
    }
    return Math.max(1, n);
  }
  function elidedSyllables(w, lang) { // l' = 0 ; jusqu' = 1 ; dell' = 1
    const base = w.replace(/[’']$/, '').toLowerCase().replace(/qu$/, '');
    return base ? (base.match(/[aeiouàâéèêîôù]+/g) || []).length : 0;
  }

  // --- Formules : chacune n'est proposée que pour la langue de sa conception (références dans le README).
  const FLESCH_BANDS = [[90, 'veryEasy'], [80, 'easy'], [70, 'fairlyEasy'], [60, 'standard'], [50, 'fairlyDifficult'], [30, 'difficult'], [-Infinity, 'veryDifficult']];
  const GULPEASE_BANDS = [[80, 'g80'], [60, 'g60'], [40, 'g40'], [-Infinity, 'g0']];
  const band = (bands, v) => bands.find(([min]) => v >= min)[1];
  const FORMULAS = Object.freeze([
    { id: 'flesch', lang: 'en', kind: 'score', needs: 'syllables', f: (s) => 206.835 - 1.015 * s.asl - 84.6 * s.asw, bands: FLESCH_BANDS },
    { id: 'fk', lang: 'en', kind: 'grade', needs: 'syllables', f: (s) => 0.39 * s.asl + 11.8 * s.asw - 15.59 },
    { id: 'kandel', lang: 'fr', kind: 'score', needs: 'syllables', f: (s) => 207 - 1.015 * s.asl - 73.6 * s.asw, bands: FLESCH_BANDS },
    { id: 'huerta', lang: 'es', kind: 'score', needs: 'syllables', f: (s) => 206.84 - 0.60 * (100 * s.asw) - 1.02 * (100 / s.asl), bands: FLESCH_BANDS },
    { id: 'amstad', lang: 'de', kind: 'score', needs: 'syllables', f: (s) => 180 - s.asl - 58.5 * s.asw, bands: FLESCH_BANDS },
    { id: 'martins', lang: 'pt', kind: 'score', needs: 'syllables', f: (s) => 248.835 - 1.015 * s.asl - 84.6 * s.asw, bands: FLESCH_BANDS },
    { id: 'gulpease', lang: 'it', kind: 'score', needs: 'letters', f: (s) => 89 + (300 * s.sentences - 10 * s.letters) / s.words, bands: GULPEASE_BANDS },
  ]);
  const formulasFor = (lang) => FORMULAS.filter((f) => f.lang === lang);

  // --- Réglages
  function cleanSettings(s) {
    if (!keysAre(s, ['longSentence', 'longWord'])) fail('err.backup');
    for (const k of ['longSentence', 'longWord']) {
      const [lo, hi] = RANGES[k];
      if (!Number.isInteger(s[k]) || s[k] < lo || s[k] > hi) fail('err.' + k, { min: lo, max: hi });
    }
    return { longSentence: s.longSentence, longWord: s.longWord };
  }
  // Saisie d'un seuil (texte du champ) -> entier validé.
  function parseThreshold(value, key) {
    const s = String(value).trim(), [lo, hi] = RANGES[key];
    if (!/^\d{1,3}$/.test(s) || Number(s) < lo || Number(s) > hi) fail('err.' + key, { min: lo, max: hi });
    return Number(s);
  }

  // --- Analyse complète
  function median(sorted) { if (!sorted.length) return 0; const m = sorted.length >> 1; return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2; }
  const r1 = (x) => Math.round(x * 10) / 10;
  function analyze(text, lang = 'fr', settings = DEFAULTS) {
    if (typeof text !== 'string') fail('err.text');
    if (text.length > LIMITS.text) fail('err.textLong', { max: LIMITS.text });
    if (!TEXT_LANGS.includes(lang)) fail('err.lang');
    const st = cleanSettings(settings);
    const stop = STOPSETS[lang];
    const sents = splitSentences(text, lang);
    let nWords = 0, nLetters = 0, nSyll = 0;
    const freq = new Map(), longW = new Map(), doubled = [];
    const sentences = sents.map((s, i) => {
      const toks = wordTokens(s.text, lang);
      let prev = '', prevEnd = 0;
      for (const { w, elided, at } of toks) {
        const gap = s.text.slice(prevEnd, at); prevEnd = at + w.length;
        nLetters += letters(w);
        const syl = elided ? elidedSyllables(w, lang) : syllables(w, lang);
        if (syl !== null) nSyll += syl;
        if (elided || isNumber(w)) { prev = ''; continue; }
        const key = w.toLocaleLowerCase(lang === 'other' ? undefined : lang);
        if (key === prev && /^\s+$/.test(gap)) doubled.push({ word: w, sentence: i }); // « les les » ; pas « oui, oui »
        prev = key;
        if (letters(w) >= st.longWord) longW.set(key, (longW.get(key) || 0) + 1);
        if (letters(w) >= (lang === 'ar' ? 3 : 4) && !stop.has(key)) freq.set(key, (freq.get(key) || 0) + 1);
      }
      nWords += toks.length;
      return { start: s.start, end: s.end, text: s.text, words: toks.length, chars: s.text.length, long: toks.length > st.longSentence };
    });
    const lengths = sentences.map((s) => s.words).sort((a, b) => a - b);
    const BUCKETS = [[1, 10], [11, 20], [21, 30], [31, 40], [41, Infinity]];
    const longWordsTotal = [...longW.values()].reduce((a, b) => a + b, 0);
    const stats = { sentences: sentences.length, words: nWords, letters: nLetters, syllables: nSyll, asl: sentences.length ? nWords / sentences.length : 0, asw: nWords ? nSyll / nWords : 0 };
    const formulas = nWords && sentences.length ? formulasFor(lang).map((f) => {
      const value = r1(f.f(stats));
      return { id: f.id, kind: f.kind, value, band: f.bands ? band(f.bands, value) : null };
    }) : [];
    return {
      lang,
      chars: text.length,
      charsNoSpaces: text.replace(/\s/g, '').length,
      paragraphs: text.split(/\n[ \t]*\n/).filter((p) => wordTokens(p, lang).length).length,
      sentences,
      words: nWords,
      letters: nLetters,
      syllables: syllablesSupported(lang) ? nSyll : null,
      avgWords: r1(stats.asl),
      avgLetters: nWords ? r1(nLetters / nWords) : 0,
      avgSyllables: syllablesSupported(lang) && nWords ? Math.round(100 * stats.asw) / 100 : null,
      median: median(lengths),
      max: lengths.length ? lengths[lengths.length - 1] : 0,
      distribution: BUCKETS.map(([from, to]) => ({ from, to: to === Infinity ? null : to, count: lengths.filter((n) => n >= from && n <= to).length })),
      longSentences: sentences.map((s, i) => (s.long ? i : -1)).filter((i) => i >= 0),
      longWords: [...longW.entries()].sort((a, b) => b[0].length - a[0].length || b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 15).map(([word, count]) => ({ word, count })),
      longWordPct: nWords ? r1(100 * longWordsTotal / nWords) : 0,
      repeats: [...freq.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([word, count]) => ({ word, count })),
      doubled,
      formulas,
      short: nWords < 100, // les formules sont peu fiables sur un texte court
      settings: st,
    };
  }
  const syllablesSupported = (lang) => lang !== 'ar' && lang !== 'other';

  // --- CSV des phrases (en-têtes fournis traduits ; protection contre les formules de tableur).
  function csvCell(v) {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function sentencesCSV(result, head, yesNo) {
    const rows = result.sentences.map((s, i) => [i + 1, s.words, s.chars, s.long ? yesNo[0] : yesNo[1], s.text.replace(/\s+/g, ' ')]);
    return '﻿' + [head, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
  }

  // --- Documents et sauvegarde
  function cleanName(v) {
    if (typeof v !== 'string' || !v.trim()) fail('err.nameRequired');
    if (v.trim().length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    return v.trim();
  }
  function makeDoc(d) {
    if (!keysAre(d, ['id', 'lang', 'name', 'text'])) fail('err.backup');
    if (typeof d.id !== 'string' || !ID_RE.test(d.id)) fail('err.id');
    if (!TEXT_LANGS.includes(d.lang)) fail('err.lang');
    if (typeof d.text !== 'string') fail('err.backup');
    if (d.text.length > LIMITS.text) fail('err.textLong', { max: LIMITS.text });
    return { id: d.id, name: cleanName(d.name), lang: d.lang, text: d.text };
  }
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'readabilitylab' || data.version !== VERSION || !Array.isArray(data.docs)) fail('err.notBackup');
    if (!keysAre(data, ['app', 'docs', 'settings', 'version'])) fail('err.backup');
    if (data.docs.length > LIMITS.docs) fail('err.docsMany', { max: LIMITS.docs });
    const docs = data.docs.map(makeDoc);
    if (new Set(docs.map((d) => d.id)).size !== docs.length) fail('err.backup');
    return { settings: cleanSettings(data.settings), docs };
  }
  function backup(state) { return JSON.stringify({ app: 'readabilitylab', version: VERSION, ...validateBackup({ app: 'readabilitylab', version: VERSION, settings: state.settings, docs: state.docs }) }, null, 2); }

  root.ReadCore = Object.freeze({
    VERSION, TEXT_LANGS, LIMITS, RANGES, DEFAULTS, FORMULAS, formulasFor, splitSentences, wordTokens, syllables, syllablesSupported,
    analyze, parseThreshold, cleanSettings, sentencesCSV, makeDoc, validateBackup, backup,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ReadCore;
})(typeof window === 'undefined' ? globalThis : window);
