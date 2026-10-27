/* Louvre — mécanisme multilingue commun à toutes les applis.
   Source unique : shared/louvre-i18n.js. Une copie identique est placée dans chaque appli
   multilingue (apps/<slug>/louvre-i18n.js) par scripts/sync_shared.py, pour fonctionner hors ligne.

   Fonctionnement :
   - chaque appli fournit ses textes dans messages.js : window.LouvreMessages = { fr: {...}, en: {...}, ... } ;
   - la langue est choisie dans le menu (mémorisée pour toutes les applis Louvre), sinon déduite du navigateur ;
   - la devise est choisie séparément (une langue ne dit pas dans quel pays on vit) ;
   - les éléments HTML portant data-i18n="clé" sont traduits automatiquement ;
   - les nombres, dates et montants suivent les conventions de la langue (Intl). */
(function (root) {
  'use strict';

  const LANGS = Object.freeze({ // code -> nom affiché dans sa propre langue, sens d'écriture, locale Intl
    fr: { name: 'Français', dir: 'ltr', locale: 'fr-FR' },
    en: { name: 'English', dir: 'ltr', locale: 'en-GB' },
    es: { name: 'Español', dir: 'ltr', locale: 'es-ES' },
    ar: { name: 'العربية', dir: 'rtl', locale: 'ar-u-nu-latn' }, // chiffres latins, usuels au Maghreb
    pt: { name: 'Português', dir: 'ltr', locale: 'pt-PT' },
    de: { name: 'Deutsch', dir: 'ltr', locale: 'de-DE' },
    it: { name: 'Italiano', dir: 'ltr', locale: 'it-IT' },
  });
  const CURRENCIES = Object.freeze(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'MAD', 'TND', 'DZD', 'XOF', 'XAF', 'BRL', 'MXN', 'AED', 'SAR', 'EGP']);
  // Devises sans centimes affichés (montants stockés en centimes quand même).
  const ZERO_DECIMALS = new Set(['XOF', 'XAF']);
  // Pays -> devise, pour une première proposition raisonnable.
  const REGION_CURRENCY = { US: 'USD', GB: 'GBP', CH: 'CHF', CA: 'CAD', MA: 'MAD', TN: 'TND', DZ: 'DZD', SN: 'XOF', CI: 'XOF', ML: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF', NE: 'XOF', CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', BR: 'BRL', MX: 'MXN', AE: 'AED', SA: 'SAR', EG: 'EGP' };
  const LANG_KEY = 'louvre-lang', CURRENCY_KEY = 'louvre-currency';

  function safeGet(key) { try { return root.localStorage ? root.localStorage.getItem(key) : null; } catch (e) { return null; } }
  function safeSet(key, value) { try { if (root.localStorage) root.localStorage.setItem(key, value); } catch (e) { /* confort seulement */ } }
  function navLangs() { const n = root.navigator || {}; return (n.languages && n.languages.length ? n.languages : [n.language || 'fr']).map(String); }

  // Choix de la langue : ?lang=xx dans l'adresse, puis choix mémorisé, puis navigateur, puis anglais.
  function detectLang() {
    try { const q = new URL(root.location.href).searchParams.get('lang'); if (q && LANGS[q]) return q; } catch (e) { /* hors navigateur */ }
    const saved = safeGet(LANG_KEY); if (saved && LANGS[saved]) return saved;
    for (const l of navLangs()) { const base = l.toLowerCase().split('-')[0]; if (LANGS[base]) return base; }
    return 'en';
  }
  function detectCurrency() {
    const saved = safeGet(CURRENCY_KEY); if (saved && CURRENCIES.includes(saved)) return saved;
    for (const l of navLangs()) { const region = (l.split('-')[1] || '').toUpperCase(); if (REGION_CURRENCY[region]) return REGION_CURRENCY[region]; }
    return 'EUR';
  }

  let messages = {}, lang = 'fr', currency = 'EUR';
  const listeners = [];
  const missing = new Set(); // clés absentes (utile aux tests)

  // Traduction : t('cle', {n: 3}) remplace {n}. Repli sur le français, puis sur la clé elle-même.
  function t(key, params) {
    let s = messages[lang] && messages[lang][key];
    if (s === undefined) { missing.add(`${lang}:${key}`); s = (messages.fr && messages.fr[key]) !== undefined ? messages.fr[key] : key; }
    if (typeof s === 'object' && s !== null) s = plural(s, params && params.n); // { one: '…', other: '…' }
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? String(params[k]) : m));
  }
  // Pluriel selon les règles de la langue (Intl.PluralRules gère 1 / plusieurs, et les formes arabes).
  function plural(forms, n) {
    const cat = new Intl.PluralRules(LANGS[lang].locale).select(Number(n) || 0);
    return forms[cat] !== undefined ? forms[cat] : forms.other;
  }
  // Une erreur levée par core.js porte une clé (« price.invalid ») ou « clé|{"param":1} ».
  function error(err) {
    const msg = err && err.message ? err.message : String(err);
    const [key, json] = msg.split('|');
    let params; try { params = json ? JSON.parse(json) : undefined; } catch (e) { params = undefined; }
    const has = (messages[lang] && messages[lang][key] !== undefined) || (messages.fr && messages.fr[key] !== undefined);
    return has ? t(key, params) : msg;
  }

  const locale = () => LANGS[lang].locale;
  function number(n, opts) { return new Intl.NumberFormat(locale(), opts).format(n); }
  // opts.currency force une devise (ex. règle légale en euros) : les décimales suivent cette devise-là.
  function money(cents, opts = {}) {
    const cur = opts.currency || currency, digits = ZERO_DECIMALS.has(cur) ? 0 : 2;
    return new Intl.NumberFormat(locale(), { style: 'currency', minimumFractionDigits: digits, maximumFractionDigits: digits, ...opts, currency: cur }).format(cents / 100);
  }
  function currencySymbol() {
    const part = new Intl.NumberFormat(locale(), { style: 'currency', currency }).formatToParts(1).find((p) => p.type === 'currency');
    return part ? part.value : currency;
  }
  // Jour civil « AAAA-MM-JJ » affiché selon la langue (midi : aucun décalage de fuseau possible).
  function date(day, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString(locale(), opts);
  }

  // Traduit les éléments marqués dans la page.
  function apply(scope) {
    const doc = root.document; if (!doc) return;
    const base = scope || doc;
    base.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    base.querySelectorAll('[data-i18n-attr]').forEach((el) => { // « placeholder:cle; aria-label:cle2 »
      for (const pair of el.dataset.i18nAttr.split(';')) { const [attr, key] = pair.split(':').map((s) => s.trim()); if (attr && key) el.setAttribute(attr, t(key)); }
    });
    if (!scope) {
      doc.documentElement.lang = lang;
      doc.documentElement.dir = LANGS[lang].dir;
      const title = messages[lang] && messages[lang]['meta.title'];
      if (title) doc.title = title;
      const desc = doc.querySelector('meta[name="description"]'); const d = messages[lang] && messages[lang]['meta.description'];
      if (desc && d) desc.setAttribute('content', d);
    }
  }

  // Menus « langue » et « devise » placés dans tout élément [data-louvre-locale].
  function buildPicker() {
    const doc = root.document; if (!doc) return;
    doc.querySelectorAll('[data-louvre-locale]').forEach((host) => {
      host.classList.add('louvre-locale');
      host.replaceChildren();
      const mk = (id, label, options, value, onChange) => {
        const wrap = doc.createElement('label'); wrap.className = 'louvre-locale-item';
        const span = doc.createElement('span'); span.className = 'louvre-visually-hidden'; span.textContent = label;
        const sel = doc.createElement('select'); sel.id = id;
        for (const [v, text] of options) { const o = doc.createElement('option'); o.value = v; o.textContent = text; sel.append(o); }
        sel.value = value; sel.addEventListener('change', () => onChange(sel.value));
        wrap.append(span, sel); host.append(wrap);
      };
      mk('louvre-lang', 'Language / Langue', Object.entries(LANGS).map(([k, v]) => [k, v.name]), lang, setLang);
      if (host.dataset.louvreLocale !== 'lang-only') mk('louvre-currency', t('locale.currency'), CURRENCIES.map((c) => [c, c]), currency, setCurrency);
    });
  }

  function notify() { for (const fn of listeners) { try { fn(); } catch (e) { if (root.console) root.console.error(e); } } }
  function setLang(l) { if (!LANGS[l]) return; lang = l; safeSet(LANG_KEY, l); apply(); buildPicker(); notify(); }
  function setCurrency(c) { if (!CURRENCIES.includes(c)) return; currency = c; safeSet(CURRENCY_KEY, c); notify(); }

  // Démarrage : appelé par l'appli avec ses messages, avant son premier affichage.
  function init(appMessages) {
    messages = appMessages || {};
    lang = detectLang(); currency = detectCurrency();
    apply(); buildPicker();
    return api;
  }
  function onChange(fn) { listeners.push(fn); }

  const api = {
    LANGS, CURRENCIES, init, t, error, number, money, currencySymbol, date, apply, onChange, setLang, setCurrency,
    get lang() { return lang; }, get currency() { return currency; }, get locale() { return locale(); },
    get dir() { return LANGS[lang].dir; }, missing: () => [...missing],
  };
  root.LouvreI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
