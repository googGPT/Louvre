/* BillCalendar — logique pure des factures et abonnements récurrents.
   Dates en jours civils « AAAA-MM-JJ » ; montants en centimes entiers. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const FREQUENCIES = Object.freeze({
    weekly: { label: 'Chaque semaine', months: 0, perYear: 52 },
    monthly: { label: 'Chaque mois', months: 1, perYear: 12 },
    quarterly: { label: 'Chaque trimestre', months: 3, perYear: 4 },
    yearly: { label: 'Chaque année', months: 12, perYear: 1 },
  });
  const CATEGORIES = Object.freeze(['Logement', 'Énergie', 'Télécom', 'Assurance', 'Abonnement', 'Transport', 'Santé', 'Impôts', 'Autre']);
  const MAX_BILLS = 300, MAX_NAME = 60;

  function fail(m) { throw new Error(m); }

  // --- Dates
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function dayKey(date = new Date()) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function parts(day) { return day.split('-').map(Number); }
  function fromUTC(t) { const d = new Date(t); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
  function addDays(day, n) { const [y, m, d] = parts(day); return fromUTC(Date.UTC(y, m - 1, d + n)); }
  function lastDayOfMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m : 1 à 12
  // Ajoute k mois à partir de la date de départ, en gardant le jour d'ancrage (31 -> fin de mois).
  function addMonthsAnchored(start, k) {
    const [y, m, d] = parts(start);
    const total = (y * 12 + (m - 1)) + k, ny = Math.floor(total / 12), nm = (total % 12) + 1;
    return `${ny}-${pad(nm)}-${pad(Math.min(d, lastDayOfMonth(ny, nm)))}`;
  }

  // n-ième échéance (n = 0 pour la première).
  function occurrence(bill, n) {
    const f = FREQUENCIES[bill.frequency];
    return f.months ? addMonthsAnchored(bill.start, n * f.months) : addDays(bill.start, 7 * n);
  }

  // Toutes les échéances comprises entre from et to (inclus).
  function occurrencesBetween(bill, from, to) {
    if (!bill.active || bill.start > to) return [];
    const out = [];
    let n = 0;
    if (bill.start < from) { // saute directement près de « from » pour rester rapide
      const f = FREQUENCIES[bill.frequency];
      const [y1, m1, d1] = parts(bill.start), [y2, m2, d2] = parts(from);
      n = f.months ? Math.max(0, Math.floor(((y2 - y1) * 12 + (m2 - m1)) / f.months) - 1)
        : Math.max(0, Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (7 * 86400000)) - 1);
    }
    for (let guard = 0; guard < 2000; guard += 1, n += 1) {
      const day = occurrence(bill, n);
      if (day > to) break;
      if (day >= from) out.push(day);
    }
    return out;
  }

  function nextDue(bill, today) {
    if (!bill.active) return null;
    return occurrencesBetween(bill, today, addDays(today, 400))[0] || null;
  }

  // Coût mensuel moyen (pour comparer un abonnement annuel et un abonnement mensuel).
  function monthlyEquivalentCents(bill) { return Math.round(bill.amountCents * FREQUENCIES[bill.frequency].perYear / 12); }
  function yearlyCents(bill) { return bill.amountCents * FREQUENCIES[bill.frequency].perYear; }

  // Échéances d'un mois civil, triées par date, avec le total.
  function month(bills, year, monthNumber) {
    const from = `${year}-${pad(monthNumber)}-01`, to = `${year}-${pad(monthNumber)}-${pad(lastDayOfMonth(year, monthNumber))}`;
    const items = [];
    for (const b of bills) for (const day of occurrencesBetween(b, from, to)) items.push({ day, bill: b });
    items.sort((a, b) => a.day.localeCompare(b.day) || a.bill.name.localeCompare(b.bill.name, 'fr'));
    return { from, to, items, totalCents: items.reduce((s, x) => s + x.bill.amountCents, 0) };
  }

  function upcoming(bills, today, days = 30) {
    const to = addDays(today, days - 1), items = [];
    for (const b of bills) for (const day of occurrencesBetween(b, today, to)) items.push({ day, bill: b });
    items.sort((a, b) => a.day.localeCompare(b.day) || a.bill.name.localeCompare(b.bill.name, 'fr'));
    return { items, totalCents: items.reduce((s, x) => s + x.bill.amountCents, 0) };
  }

  function summary(bills, today) {
    const active = bills.filter((b) => b.active);
    const byCategory = {};
    for (const b of active) byCategory[b.category] = (byCategory[b.category] || 0) + monthlyEquivalentCents(b);
    return {
      active: active.length,
      paused: bills.length - active.length,
      monthlyCents: active.reduce((s, b) => s + monthlyEquivalentCents(b), 0),
      yearlyCents: active.reduce((s, b) => s + yearlyCents(b), 0),
      next30Cents: upcoming(active, today, 30).totalCents,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
    };
  }

  // --- Saisie
  function parseCents(value) {
    const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) fail('Montant invalide (ex. 12,99)');
    const [a, b = ''] = s.split('.');
    const cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
    if (cents <= 0) fail('Le montant doit être positif');
    return cents;
  }
  function makeBill(input, id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('Identifiant invalide');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) fail('Nom obligatoire');
    if (name.length > MAX_NAME) fail(`Nom trop long (${MAX_NAME} caractères au plus)`);
    if (!Object.prototype.hasOwnProperty.call(FREQUENCIES, input.frequency)) fail('Fréquence inconnue');
    if (!isDay(input.start)) fail('Date de première échéance invalide');
    if (!CATEGORIES.includes(input.category)) fail('Catégorie inconnue');
    const amountCents = typeof input.amountCents === 'number' ? input.amountCents : parseCents(input.amount);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 999999999) fail('Montant invalide');
    return { id, name, amountCents, frequency: input.frequency, start: input.start, category: input.category, active: input.active !== false };
  }

  // --- Export agenda (.ics, RFC 5545) : une série récurrente par facture active.
  function icsEscape(s) { return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
  function fold(line) { // lignes de 75 octets au plus
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  function rrule(bill) {
    const [, m, d] = parts(bill.start);
    switch (bill.frequency) {
      case 'weekly': return 'FREQ=WEEKLY';
      case 'yearly': return d >= 29 && m === 2 ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1' : 'FREQ=YEARLY';
      default: {
        const interval = bill.frequency === 'quarterly' ? ';INTERVAL=3' : '';
        if (d < 29) return `FREQ=MONTHLY${interval}`;
        // Jour 29-31 : « le dernier jour disponible parmi 28..d » (31 janvier -> 28 ou 29 février).
        const days = []; for (let x = 28; x <= d; x += 1) days.push(x);
        return `FREQ=MONTHLY${interval};BYMONTHDAY=${days.join(',')};BYSETPOS=-1`;
      }
    }
  }
  function toICS(bills, stamp) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('Horodatage invalide');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//BillCalendar//FR', 'CALSCALE:GREGORIAN'];
    for (const b of bills.filter((x) => x.active)) {
      const start = b.start.replace(/-/g, ''), end = addDays(b.start, 1).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${b.id}@billcalendar.louvre`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `RRULE:${rrule(b)}`,
        fold(`SUMMARY:${icsEscape(`${b.name} — ${(b.amountCents / 100).toFixed(2).replace('.', ',')} €`)}`),
        fold(`DESCRIPTION:${icsEscape(`${b.category} · ${FREQUENCIES[b.frequency].label}`)}`),
        'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  // --- Sauvegarde
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Sauvegarde illisible');
    if (data.app !== 'billcalendar' || data.version !== VERSION || !Array.isArray(data.bills)) fail('Ce fichier n\'est pas une sauvegarde BillCalendar');
    if (data.bills.length > MAX_BILLS) fail(`Trop de factures (${MAX_BILLS} au plus)`);
    const bills = data.bills.map((b) => {
      if (!b || typeof b !== 'object' || Array.isArray(b)) fail('Facture invalide');
      if (Object.keys(b).sort().join(',') !== 'active,amountCents,category,frequency,id,name,start') fail('Champs de facture inattendus');
      if (typeof b.active !== 'boolean') fail('Statut de facture invalide');
      return makeBill(b, b.id);
    });
    if (new Set(bills.map((b) => b.id)).size !== bills.length) fail('Factures en double');
    return bills;
  }
  function backup(bills) { return JSON.stringify({ app: 'billcalendar', version: VERSION, bills: validateBackup({ app: 'billcalendar', version: VERSION, bills }) }, null, 2); }

  function eur(cents) { return (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }

  root.BillCore = Object.freeze({ VERSION, FREQUENCIES, CATEGORIES, MAX_BILLS, isDay, dayKey, addDays, addMonthsAnchored, lastDayOfMonth, occurrence, occurrencesBetween, nextDue, monthlyEquivalentCents, yearlyCents, month, upcoming, summary, parseCents, makeBill, rrule, toICS, validateBackup, backup, eur });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BillCore;
})(typeof window === 'undefined' ? globalThis : window);
