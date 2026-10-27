/* CareerMatch — logique pure : comparaison LEXICALE d'un CV et d'une offre d'emploi, hors ligne.
   Mots normalisés (minuscules, sans accents), mots vides retirés selon la langue, termes présents ou absents,
   taux de couverture. Ce n'est ni une prédiction ni un avis de recrutement : seulement un décompte de mots. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const LANGS = Object.freeze(['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']);
  const TOPS = Object.freeze([0, 20, 50]); // 0 = tous les termes de l'offre
  const LIMITS = Object.freeze({ comparisons: 20, text: 50000, name: 80, phrases: 30, phrase: 60, ignore: 100 });
  const ID = /^[a-z0-9-]{6,64}$/i;

  // Mots vides (déjà sans accents, comme après normalisation). Listes courtes et générales, à compléter par « termes ignorés ».
  const STOP_SRC = {
    fr: 'a au aux avec ce ces cet cette ci comme dans de des du elle elles en est et etre eu il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sont sur ta te tes toi ton tu un une vos votre vous y ete etes avoir ont avez avons sera seront sont fait faire plus moins tres tout tous toute toutes autre autres aussi ainsi alors apres avant chez dont donc entre lors meme non oui peu peut peuvent puis quand quel quelle quelles quels sans selon si sous tant tel telle vers via chaque cela celle celui ceux ici la-bas leurs etc afin car or ni lequel laquelle',
    en: 'a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself also etc via within across per may must shall',
    es: 'a al algo algunos ante antes como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos fue ha han hasta hay la las le les lo los mas me mi mis muy ni no nos nosotros o os otra otras otro otros para pero poco por porque que quien se sea ser si sin sobre su sus tambien te tiene tienen todo todos tu tus un una uno unos usted y ya cada segun tras etc asi',
    ar: 'في من على الى عن مع هذا هذه ذلك تلك التي الذي الذين او ام ثم كما لكن بل قد لقد كان كانت يكون تكون هو هي هم هن انا نحن انت انتم كل بعض غير بين عند حتى اذا ان لا لم لن ما ماذا متى اين كيف هل و ف ب ل ك او اي ايضا حيث خلال ضمن لدى لدي منذ نحو وفق عبر الا اما',
    pt: 'a ao aos as com como da das de dela dele deles do dos e ela elas ele eles em entre era essa essas esse esses esta estas este estes eu foi ha isso isto ja la lhe mais mas me mesmo meu minha muito na nas nao nem no nos nossa nosso num numa o os ou para pela pelas pelo pelos por qual quando que quem se sem ser seu seus sua suas tambem te tem ter um uma umas uns voce cada segundo apos etc assim sobre',
    de: 'aber alle allem allen aller alles als also am an auch auf aus bei bin bis bist da damit dann das dass dem den der des dessen die dies diese diesem diesen dieser dieses doch dort du durch ein eine einem einen einer eines er es fur hat hatte hier ich ihr ihre im in ins ist ja jede jedem jeden jeder jedes kann kein keine mit muss nach nicht noch nur ob oder ohne sehr sein seine sich sie sind so uber um und uns unser unter vom von vor war waren was weil wenn werden wie wir wird wo zu zum zur sowie bzw etc sowohl',
    it: 'a ad al alla alle allo agli ai anche che chi ci come con cui da dal dalla dalle dei del della delle dello di e ed era essere fra gli ha hanno il in io la le lei li lo loro lui ma mi molto ne nei nel nella nelle noi non nostro o per piu poco quale quando quello questa queste questo se sei si sia sono su sua sue sui sul sulla suo tra tu tutti tutto un una uno voi vostro ogni secondo dopo etc cosi',
  };
  const STOP = Object.fromEntries(Object.entries(STOP_SRC).map(([k, v]) => [k, new Set(v.split(/\s+/))]));

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keysAre = (o, list) => Object.keys(o).sort().join(',') === [...list].sort().join(',');
  const checkLang = (l) => { if (!LANGS.includes(l)) fail('err.lang'); return l; };

  // Forme comparable d'un mot : minuscules, sans accents ; en arabe sans voyelles brèves ni tatwil, alifs unifiés.
  function fold(word, lang) {
    let w = word.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036F]/g, '');
    if (lang === 'ar') w = w.replace(/[\u064B-\u0655\u0670\u0640]/g, '').replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647'); // NFKD a déjà séparé les hamzas
    if (lang === 'ar') w = w.replace(/^و(?=[a-z])/, ''); // « وExcel » : conjonction collée à un mot latin
    return w.replace(/ß/g, 'ss');
  }
  // Pluriels et articles, de façon volontairement légère (les deux textes reçoivent le même traitement).
  function stem(w, lang) {
    if (lang === 'ar') { // « وال », « بال », « فال », « كال » puis « ال » : préfixes courants retirés
      if (w.length > 5 && /^[وبفك]ال/.test(w)) return w.slice(3);
      return w.length > 4 && w.startsWith('ال') ? w.slice(2) : w;
    }
    if (lang === 'en' && w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (lang === 'fr' && w.length > 4 && /(au|eu)x$/.test(w)) return w.slice(0, -1);
    if (['fr', 'en', 'es', 'pt'].includes(lang) && w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }
  // Découpe en mots ; garde « c++ », « c# », « node.js », « e-mail » ; enlève les élisions (l', d', qu').
  function words(text) {
    const out = [];
    const re = /[\p{L}\p{N}][\p{L}\p{N}\p{M}+#.'’-]*/gu;
    let m;
    while ((m = re.exec(text))) {
      let w = m[0].replace(/[.'’-]+$/, '');
      const mixed = /^(\p{Script=Arabic}+)(\p{Script=Latin}.*)$/u.exec(w); // « وExcel » : deux mots collés
      if (mixed) { out.push(mixed[1]); w = mixed[2]; }
      const el = /^(\p{L}{1,2})['’](.+)$/u.exec(w);
      if (el) w = el[2];
      out.push(w);
    }
    return out;
  }
  // Jetons d'un texte : { key (forme comparable), surface (forme écrite) }, sans les mots vides ni les nombres seuls.
  function tokens(text, lang, opts = {}) {
    checkLang(lang);
    const stop = STOP[lang], ignore = opts.ignore || new Set();
    const out = [];
    for (const surface of words(text)) {
      const f = fold(surface, lang);
      if (/^[\d.,+#-]+$/.test(f)) continue; // nombres seuls (années, montants)
      if (f.length < 2 && !/[+#]/.test(f)) continue;
      if (stop.has(f)) continue;
      const key = opts.fold === false ? f : stem(f, lang);
      if (ignore.has(key) || ignore.has(f)) continue;
      out.push({ key, surface });
    }
    return out;
  }
  // Suite de formes comparables, mots vides compris (pour reconnaître une expression telle que « gestion de projet »).
  function sequence(text, lang, foldPlurals) { return words(text).map((w) => { const f = fold(w, lang); return foldPlurals === false ? f : stem(f, lang); }); }
  function containsSeq(hay, needle) {
    if (!needle.length) return false;
    outer: for (let i = 0; i + needle.length <= hay.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) if (hay[i + j] !== needle[j]) continue outer;
      return true;
    }
    return false;
  }

  // --- Analyse
  const defaultCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function analyze(input, compare = defaultCompare) {
    const c = makeComparison(input, input.id || 'tmp-000000');
    const ignore = new Set(c.ignore.flatMap((x) => tokens(x, c.lang, { fold: c.foldPlurals }).map((tk) => tk.key)).concat(c.ignore.map((x) => fold(x, c.lang))));
    const offerTok = tokens(c.offer, c.lang, { fold: c.foldPlurals, ignore });
    const cvTok = tokens(c.cv, c.lang, { fold: c.foldPlurals, ignore });
    const offer = new Map();
    for (const { key, surface } of offerTok) {
      const e = offer.get(key) || { key, count: 0, forms: new Map() };
      e.count += 1; e.forms.set(surface.toLowerCase(), (e.forms.get(surface.toLowerCase()) || 0) + 1);
      offer.set(key, e);
    }
    const cv = new Map();
    for (const { key } of cvTok) cv.set(key, (cv.get(key) || 0) + 1);
    let terms = [...offer.values()].map((e) => {
      const term = [...e.forms.entries()].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))[0][0]; // forme la plus fréquente dans l'offre
      return { key: e.key, term, offer: e.count, cv: cv.get(e.key) || 0 };
    }).sort((a, b) => b.offer - a.offer || compare(a.term, b.term));
    if (c.top) terms = terms.slice(0, c.top);
    const present = terms.filter((x) => x.cv > 0), missing = terms.filter((x) => x.cv === 0);
    const total = terms.reduce((s, x) => s + x.offer, 0), got = present.reduce((s, x) => s + x.offer, 0);
    const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 0);
    const offerSeq = sequence(c.offer, c.lang, c.foldPlurals), cvSeq = sequence(c.cv, c.lang, c.foldPlurals);
    const phrases = c.phrases.map((ph) => { const s = sequence(ph, c.lang, c.foldPlurals); return { phrase: ph, inOffer: containsSeq(offerSeq, s), inCV: containsSeq(cvSeq, s) }; });
    return {
      terms, present, missing, coverage: pct(present.length, terms.length), weighted: pct(got, total), phrases,
      words: { offer: offerTok.length, cv: cvTok.length },
    };
  }

  // --- Comparaisons enregistrées
  function cleanList(v, maxItems, maxLen, errKey) {
    const list = typeof v === 'string' ? v.split(/\r?\n/) : v === undefined ? [] : v;
    if (!Array.isArray(list)) fail('err.backup');
    const seen = new Set(), out = [];
    for (const raw of list) {
      if (typeof raw !== 'string') fail('err.backup');
      const s = raw.trim().replace(/\s+/g, ' ');
      if (!s) continue;
      if (s.length > maxLen) fail('err.itemLong', { max: maxLen });
      if (seen.has(s.toLowerCase())) continue;
      seen.add(s.toLowerCase()); out.push(s);
    }
    if (out.length > maxItems) fail(errKey, { max: maxItems });
    return out;
  }
  function makeComparison(input, id) {
    if (!isObj(input)) fail('err.backup');
    if (typeof id !== 'string' || !ID.test(id)) fail('err.id');
    const text = (v) => { if (v === undefined) return ''; if (typeof v !== 'string') fail('err.backup'); if (v.length > LIMITS.text) fail('err.textLong', { max: LIMITS.text }); return v.replace(/\r\n?/g, '\n'); };
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) fail('err.nameRequired');
    if (name.length > LIMITS.name) fail('err.nameLong', { max: LIMITS.name });
    const top = input.top === undefined ? 0 : Number(input.top);
    if (!TOPS.includes(top)) fail('err.top');
    if (input.foldPlurals !== undefined && typeof input.foldPlurals !== 'boolean') fail('err.backup');
    return {
      id, name, lang: checkLang(input.lang), cv: text(input.cv), offer: text(input.offer),
      phrases: cleanList(input.phrases, LIMITS.phrases, LIMITS.phrase, 'err.tooManyPhrases'),
      ignore: cleanList(input.ignore, LIMITS.ignore, LIMITS.phrase, 'err.tooManyIgnored'),
      foldPlurals: input.foldPlurals !== false, top,
    };
  }
  // Export CSV des termes : en-têtes et statuts fournis par l'interface (traduits) ; débuts de formule neutralisés.
  function termsCSV(result, header, statusLabel) {
    const cell = (v) => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [header, ...result.terms.map((x) => [x.term, x.offer, x.cv, x.cv > 0 ? statusLabel.present : statusLabel.missing])].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  const FIELDS = ['id', 'name', 'lang', 'cv', 'offer', 'phrases', 'ignore', 'foldPlurals', 'top'];
  function validateBackup(data) {
    if (!isObj(data)) fail('err.backup');
    if (data.app !== 'careermatch' || data.version !== VERSION) fail('err.notBackup');
    if (!keysAre(data, ['app', 'version', 'comparisons']) || !Array.isArray(data.comparisons)) fail('err.backup');
    if (data.comparisons.length > LIMITS.comparisons) fail('err.tooMany', { max: LIMITS.comparisons });
    const list = data.comparisons.map((c) => {
      if (!isObj(c) || !keysAre(c, FIELDS) || typeof c.foldPlurals !== 'boolean' || !Number.isInteger(c.top)) fail('err.backup');
      return makeComparison(c, c.id);
    });
    if (new Set(list.map((c) => c.id)).size !== list.length) fail('err.backup');
    return list;
  }
  function backup(list) { return JSON.stringify({ app: 'careermatch', version: VERSION, comparisons: validateBackup({ app: 'careermatch', version: VERSION, comparisons: JSON.parse(JSON.stringify(list)) }) }); }

  root.MatchCore = Object.freeze({ VERSION, LANGS, TOPS, LIMITS, STOP, fold, stem, words, tokens, analyze, makeComparison, termsCSV, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MatchCore;
})(typeof window === 'undefined' ? globalThis : window);
