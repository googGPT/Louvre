/* GiftNest — logique pure : personnes, occasions, cadeaux, budgets et compte à rebours.
   Montants en centimes entiers ; dates en jours civils « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const VERSION = 1;
  const STATUSES = Object.freeze(['idée', 'acheté', 'offert']); // cycle de vie d'un cadeau
  const LIMITS = Object.freeze({ people: 100, occasions: 100, gifts: 1000, name: 60, title: 100 });

  // Les erreurs portent une clé de traduction (et des paramètres JSON après « | ») : l'interface les traduit.
  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const pad = (n) => String(n).padStart(2, '0');

  // --- Dates
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function dayKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function toUTC(day) { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }

  // Prochaine date d'une occasion : les occasions annuelles (anniversaires, Noël) reviennent chaque année ;
  // un 29 février est fêté le 28 les années non bissextiles.
  function nextDate(occasion, today) {
    if (!occasion.yearly) return occasion.date;
    const [, m, d] = occasion.date.split('-').map(Number);
    const ty = Number(today.slice(0, 4));
    for (const y of [ty, ty + 1]) {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const day = `${y}-${pad(m)}-${pad(m === 2 && d === 29 && !leap ? 28 : d)}`;
      if (day >= today) return day;
    }
    return null; // inatteignable
  }
  function daysUntil(occasion, today) { const n = nextDate(occasion, today); return n ? diffDays(today, n) : null; }

  // --- Saisie
  function parseCents(value) {
    if (value === '' || value === undefined || value === null) return 0; // prix inconnu = 0
    const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) fail('err.amount');
    const [a, b = ''] = s.split('.');
    return Number(a) * 100 + Number((b + '00').slice(0, 2));
  }
  const checkId = (id) => { if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('err.id'); return id; };
  // field : 'name', 'occName' ou 'title' -> clés err.<field>Required et err.<field>Long.
  function text(v, field, max) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) fail(`err.${field}Required`);
    if (s.length > max) fail(`err.${field}Long`, { max });
    return s;
  }
  function makePerson(input, id) {
    const budgetCents = typeof input.budgetCents === 'number' ? input.budgetCents : parseCents(input.budget);
    if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > 99999999) fail('err.budget');
    return { id: checkId(id), name: text(input.name, 'name', LIMITS.name), budgetCents };
  }
  function makeOccasion(input, id) {
    if (!isDay(input.date)) fail('err.date');
    return { id: checkId(id), name: text(input.name, 'occName', LIMITS.name), date: input.date, yearly: input.yearly === true };
  }
  function makeGift(input, id, data) {
    if (!data.people.some((p) => p.id === input.personId)) fail('err.person');
    if (input.occasionId !== null && !data.occasions.some((o) => o.id === input.occasionId)) fail('err.occasion');
    if (!STATUSES.includes(input.status)) fail('err.status');
    const priceCents = typeof input.priceCents === 'number' ? input.priceCents : parseCents(input.price);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 99999999) fail('err.price');
    return { id: checkId(id), personId: input.personId, occasionId: input.occasionId, title: text(input.title, 'title', LIMITS.title), priceCents, status: input.status };
  }
  function advance(gift) { // idée -> acheté -> offert -> idée
    return { ...gift, status: STATUSES[(STATUSES.indexOf(gift.status) + 1) % STATUSES.length] };
  }

  // --- Calculs
  // Dépensé = cadeaux achetés ou offerts ; prévu = idées pas encore achetées.
  function personTotals(data, personId) {
    const gifts = data.gifts.filter((g) => g.personId === personId);
    const spent = gifts.filter((g) => g.status !== 'idée').reduce((s, g) => s + g.priceCents, 0);
    const planned = gifts.filter((g) => g.status === 'idée').reduce((s, g) => s + g.priceCents, 0);
    const budget = (data.people.find((p) => p.id === personId) || {}).budgetCents || 0;
    return { count: gifts.length, spent, planned, budget, remaining: budget ? budget - spent : null, over: budget > 0 && spent > budget, overIfAll: budget > 0 && spent + planned > budget };
  }
  // Occasions à venir, la plus proche d'abord, avec les cadeaux associés.
  // locale : langue de l'interface, pour l'ordre alphabétique à date égale.
  function upcoming(data, today, horizon = 366, locale = 'fr') {
    return data.occasions
      .map((o) => ({ occasion: o, date: nextDate(o, today), days: daysUntil(o, today) }))
      .filter((x) => x.days !== null && x.days >= 0 && x.days <= horizon)
      .sort((a, b) => a.days - b.days || a.occasion.name.localeCompare(b.occasion.name, locale))
      .map((x) => {
        const gifts = data.gifts.filter((g) => g.occasionId === x.occasion.id);
        return { ...x, gifts, ready: gifts.filter((g) => g.status !== 'idée').length, ideas: gifts.filter((g) => g.status === 'idée').length };
      });
  }
  function summary(data) {
    const spent = data.gifts.filter((g) => g.status !== 'idée').reduce((s, g) => s + g.priceCents, 0);
    const planned = data.gifts.filter((g) => g.status === 'idée').reduce((s, g) => s + g.priceCents, 0);
    const budget = data.people.reduce((s, p) => s + p.budgetCents, 0);
    return { spent, planned, budget, ideas: data.gifts.filter((g) => g.status === 'idée').length, toWrap: data.gifts.filter((g) => g.status === 'acheté').length, given: data.gifts.filter((g) => g.status === 'offert').length };
  }

  // Supprimer une personne supprime ses cadeaux ; supprimer une occasion détache ses cadeaux.
  function removePerson(data, id) { return { ...data, people: data.people.filter((p) => p.id !== id), gifts: data.gifts.filter((g) => g.personId !== id) }; }
  function removeOccasion(data, id) { return { ...data, occasions: data.occasions.filter((o) => o.id !== id), gifts: data.gifts.map((g) => (g.occasionId === id ? { ...g, occasionId: null } : g)) }; }

  // --- Sauvegarde
  const empty = () => ({ people: [], occasions: [], gifts: [] });
  function exact(obj, keys) { if (!obj || typeof obj !== 'object' || Array.isArray(obj) || Object.keys(obj).sort().join(',') !== keys) fail('err.fields'); }
  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('err.backup');
    if (raw.app !== 'giftnest' || raw.version !== VERSION) fail('err.notBackup');
    if (Object.keys(raw).sort().join(',') !== 'app,gifts,occasions,people,version') fail('err.backup');
    for (const k of ['people', 'occasions', 'gifts']) if (!Array.isArray(raw[k]) || raw[k].length > LIMITS[k]) fail('err.backup');
    const data = empty();
    for (const p of raw.people) { exact(p, 'budgetCents,id,name'); data.people.push(makePerson(p, p.id)); }
    for (const o of raw.occasions) { exact(o, 'date,id,name,yearly'); if (typeof o.yearly !== 'boolean') fail('err.backup'); data.occasions.push(makeOccasion(o, o.id)); }
    for (const g of raw.gifts) { exact(g, 'id,occasionId,personId,priceCents,status,title'); data.gifts.push(makeGift(g, g.id, data)); }
    const ids = [...data.people, ...data.occasions, ...data.gifts].map((x) => x.id);
    if (new Set(ids).size !== ids.length) fail('err.duplicate');
    return data;
  }
  function backup(data) { return JSON.stringify({ app: 'giftnest', version: VERSION, ...validateBackup({ app: 'giftnest', version: VERSION, ...data }) }, null, 2); }

  root.GiftCore = Object.freeze({ VERSION, STATUSES, LIMITS, isDay, dayKey, diffDays, nextDate, daysUntil, parseCents, makePerson, makeOccasion, makeGift, advance, personTotals, upcoming, summary, removePerson, removeOccasion, empty, validateBackup, backup });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GiftCore;
})(typeof window === 'undefined' ? globalThis : window);
