/* RepairLedger — logique pure : carnet de réparations d'objets personnels (hors logement).
   Montants en centimes entiers ; dates en jours civils « AAAA-MM-JJ ». Le seuil de remplacement est saisi
   par l'utilisateur (en % du prix d'achat) : l'appli compare, elle ne conseille pas. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const CATEGORIES = Object.freeze(['electronics', 'appliance', 'clothing', 'bike', 'jewelry', 'sports', 'other']);
  const MAX_OBJECTS = 200, MAX_REPAIRS = 2000, MAX_NAME = 60, MAX_PROVIDER = 60, MAX_DESC = 160, MAX_CENTS = 99999999, MAX_PCT = 500, MAX_MONTHS = 120, MAX_REMIND = 365;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  const cmpText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

  // --- Dates (jours civils, calculs en UTC : aucun piège d'heure d'été)
  const pad = (n) => String(n).padStart(2, '0');
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return y >= 1900 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function checkDay(day, key = 'err.date') { if (!isDay(day)) fail(key); return day; }
  const utc = (day) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const fromUTC = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  function dayKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function addDays(day, n) { return fromUTC(utc(day) + n * 86400000); }
  function diffDays(a, b) { return Math.round((utc(b) - utc(a)) / 86400000); } // b - a
  // Ajout de mois avec jour borné : 31 janvier + 1 mois -> 28 (ou 29) février.
  function addMonths(day, months) {
    const [y, m, d] = day.split('-').map(Number);
    const total = (m - 1) + months, ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
  }

  // --- Montants
  // « 89,90 » -> 8990 centimes ; zéro permis pour une réparation gratuite (sous garantie par exemple).
  function parseCents(value, allowZero = false) {
    const s = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) fail('err.amount');
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents === 0 && !allowZero) fail('err.amountPositive');
    return cents;
  }
  function optInt(value, max, key) {
    const s = String(value ?? '').trim();
    if (!s) return null;
    if (!/^\d{1,4}$/.test(s) || Number(s) > max) fail(key, { max });
    return Number(s);
  }

  // --- Objets et réparations
  function makeObject(input, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    const name = clean(input.name);
    if (!name) fail('err.nameRequired');
    if (name.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    if (!CATEGORIES.includes(input.category)) fail('err.category');
    const purchaseDate = input.purchaseDate === null || input.purchaseDate === '' || input.purchaseDate === undefined ? null : checkDay(input.purchaseDate, 'err.purchaseDate');
    const priceCents = 'priceCents' in input ? input.priceCents : (clean(input.price) ? parseCents(input.price) : null);
    if (priceCents !== null && (!Number.isSafeInteger(priceCents) || priceCents <= 0 || priceCents > MAX_CENTS)) fail('err.amount');
    const thresholdPct = 'thresholdPct' in input ? input.thresholdPct : optInt(input.threshold, MAX_PCT, 'err.threshold');
    if (thresholdPct !== null && (!Number.isInteger(thresholdPct) || thresholdPct < 1 || thresholdPct > MAX_PCT)) fail('err.threshold', { max: MAX_PCT });
    if (thresholdPct !== null && priceCents === null) fail('err.thresholdNoPrice');
    return { id, name, category: input.category, purchaseDate, priceCents, thresholdPct };
  }
  function makeRepair(input, id, objects) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    if (!objects.some((o) => o.id === input.objectId)) fail('err.object');
    const date = checkDay(input.date);
    const obj = objects.find((o) => o.id === input.objectId);
    if (obj.purchaseDate && date < obj.purchaseDate) fail('err.beforePurchase');
    const costCents = 'costCents' in input ? input.costCents : parseCents(input.cost, true);
    if (!Number.isSafeInteger(costCents) || costCents < 0 || costCents > MAX_CENTS) fail('err.amount');
    const provider = clean(input.provider), description = clean(input.description);
    if (provider.length > MAX_PROVIDER) fail('err.providerLong', { max: MAX_PROVIDER });
    if (description.length > MAX_DESC) fail('err.descLong', { max: MAX_DESC });
    let warrantyEnd;
    if ('warrantyEnd' in input) warrantyEnd = input.warrantyEnd === null || input.warrantyEnd === '' ? null : checkDay(input.warrantyEnd, 'err.warrantyDate');
    else {
      const months = optInt(input.warrantyMonths, MAX_MONTHS, 'err.months');
      const end = clean(input.warrantyDate);
      if (months !== null && end) fail('err.warrantyBoth');
      warrantyEnd = end ? checkDay(end, 'err.warrantyDate') : (months ? addMonths(date, months) : null);
    }
    if (warrantyEnd !== null && warrantyEnd < date) fail('err.warrantyBefore');
    return { id, objectId: input.objectId, date, costCents, provider, description, warrantyEnd };
  }

  // --- Calculs
  // Bilan d'un objet : coût cumulé, part du prix d'achat, comparaison au seuil saisi.
  function objectSummary(obj, repairs) {
    const own = repairs.filter((r) => r.objectId === obj.id);
    const totalCents = own.reduce((s, r) => s + r.costCents, 0);
    const ratioPct = obj.priceCents ? Math.round(1000 * totalCents / obj.priceCents) / 10 : null;
    const thresholdCents = obj.priceCents && obj.thresholdPct ? Math.round(obj.priceCents * obj.thresholdPct / 100) : null;
    let status = 'none', remainingCents = null;
    if (thresholdCents !== null) {
      status = totalCents >= thresholdCents ? 'reached' : 'below';
      remainingCents = Math.max(0, thresholdCents - totalCents);
    }
    const last = own.slice().sort((a, b) => cmpText(b.date, a.date))[0] || null;
    return { count: own.length, totalCents, ratioPct, thresholdCents, status, remainingCents, lastDate: last ? last.date : null };
  }
  // Garantie d'une réparation à une date : active, expirée ou absente ; jours restants.
  function warrantyState(r, today) {
    if (!r.warrantyEnd) return { state: 'none', days: null };
    const days = diffDays(today, r.warrantyEnd);
    return days >= 0 ? { state: 'active', days } : { state: 'expired', days };
  }
  // Une réparation antérieure du même objet couvrait-elle cette date ? (piste à vérifier auprès du prestataire)
  function coveredBy(repair, repairs) {
    return repairs.filter((p) => p.id !== repair.id && p.objectId === repair.objectId && p.warrantyEnd && p.date <= repair.date && repair.date <= p.warrantyEnd && (p.date < repair.date || cmpText(p.id, repair.id) < 0))
      .sort((a, b) => cmpText(b.date, a.date))[0] || null;
  }
  // Rappels : garanties qui se terminent dans les N jours (aujourd'hui compris), les plus proches d'abord.
  function reminders(repairs, today, days) {
    const until = addDays(today, days);
    return repairs.filter((r) => r.warrantyEnd && r.warrantyEnd >= today && r.warrantyEnd <= until)
      .sort((a, b) => cmpText(a.warrantyEnd, b.warrantyEnd) || cmpText(a.id, b.id))
      .map((r) => ({ repair: r, days: diffDays(today, r.warrantyEnd) }));
  }
  function totals(objects, repairs, today) {
    const year = today.slice(0, 4);
    return {
      totalCents: repairs.reduce((s, r) => s + r.costCents, 0),
      yearCents: repairs.filter((r) => r.date.slice(0, 4) === year).reduce((s, r) => s + r.costCents, 0),
      count: repairs.length,
      active: repairs.filter((r) => r.warrantyEnd && r.warrantyEnd >= today).length,
      reached: objects.filter((o) => objectSummary(o, repairs).status === 'reached').length,
    };
  }

  // --- Exports
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function toCSV(objects, repairs, opts) {
    const { headers, categoryLabel, decimal } = opts;
    if (!Array.isArray(headers) || headers.length !== 7) fail('err.headers');
    const by = new Map(objects.map((o) => [o.id, o]));
    const amount = (c) => (c / 100).toFixed(2).replace('.', decimal === 'comma' ? ',' : '.');
    const lines = [headers.map(csvCell).join(';')];
    for (const r of repairs.slice().sort((a, b) => cmpText(a.date, b.date) || cmpText(a.id, b.id))) {
      const o = by.get(r.objectId);
      lines.push([r.date, csvCell(o.name), csvCell(categoryLabel(o.category)), csvCell(r.provider), csvCell(r.description), amount(r.costCents), r.warrantyEnd || ''].join(';'));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function fold(line) { // lignes de 75 octets au plus (RFC 5545)
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  // Un événement « journée entière » par garantie encore active, avec alarme N jours avant (si N > 0).
  function toICS(objects, repairs, today, stamp, text, remindDays) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    const by = new Map(objects.map((o) => [o.id, o]));
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//RepairLedger//FR', 'CALSCALE:GREGORIAN'];
    for (const r of repairs.filter((x) => x.warrantyEnd && x.warrantyEnd >= today).sort((a, b) => cmpText(a.warrantyEnd, b.warrantyEnd) || cmpText(a.id, b.id))) {
      lines.push('BEGIN:VEVENT', `UID:${r.id}@repairledger.louvre`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${r.warrantyEnd.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(r.warrantyEnd, 1).replace(/-/g, '')}`,
        fold(`SUMMARY:${icsEscape(text.summary(by.get(r.objectId), r))}`), fold(`DESCRIPTION:${icsEscape(text.describe(by.get(r.objectId), r))}`), 'TRANSP:TRANSPARENT');
      if (remindDays > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-P${remindDays}D`, fold(`DESCRIPTION:${icsEscape(text.summary(by.get(r.objectId), r))}`), 'END:VALARM');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function makeSettings(input) {
    const d = typeof input.reminderDays === 'number' ? input.reminderDays : optInt(input.reminderDays, MAX_REMIND, 'err.remind');
    if (d === null || !Number.isInteger(d) || d < 0 || d > MAX_REMIND) fail('err.remind', { max: MAX_REMIND });
    return { reminderDays: d };
  }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'repairledger' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'settings', 'objects', 'repairs']) || !isPlain(data.settings) || !Array.isArray(data.objects) || !Array.isArray(data.repairs)) fail('err.backup');
    if (!sameKeys(data.settings, ['reminderDays']) || typeof data.settings.reminderDays !== 'number') fail('err.backup');
    const settings = makeSettings(data.settings);
    if (data.objects.length > MAX_OBJECTS) fail('err.tooManyObjects', { max: MAX_OBJECTS });
    if (data.repairs.length > MAX_REPAIRS) fail('err.tooManyRepairs', { max: MAX_REPAIRS });
    const objects = data.objects.map((o) => {
      if (!isPlain(o) || !sameKeys(o, ['id', 'name', 'category', 'purchaseDate', 'priceCents', 'thresholdPct'])) fail('err.backup');
      if (typeof o.name !== 'string') fail('err.backup');
      return makeObject(o, o.id);
    });
    if (new Set(objects.map((o) => o.id)).size !== objects.length) fail('err.backup');
    const repairs = data.repairs.map((r) => {
      if (!isPlain(r) || !sameKeys(r, ['id', 'objectId', 'date', 'costCents', 'provider', 'description', 'warrantyEnd'])) fail('err.backup');
      if (typeof r.provider !== 'string' || typeof r.description !== 'string') fail('err.backup');
      return makeRepair(r, r.id, objects);
    });
    if (new Set(repairs.map((r) => r.id)).size !== repairs.length) fail('err.backup');
    return { settings, objects, repairs };
  }
  function backup(data) {
    const v = validateData({ app: 'repairledger', version: VERSION, ...data });
    return JSON.stringify({ app: 'repairledger', version: VERSION, ...v }, null, 2);
  }

  const api = { VERSION, CATEGORIES, MAX_OBJECTS, MAX_REPAIRS, isDay, dayKey, addDays, diffDays, addMonths, parseCents, makeObject, makeRepair, makeSettings,
    objectSummary, warrantyState, coveredBy, reminders, totals, toCSV, toICS, validateData, backup };
  root.RepairCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RepairCore;
})(typeof window === 'undefined' ? globalThis : window);
