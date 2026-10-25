(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReceiptCore = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
  const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
  const MAX_RECORDS = 300;
  const VALID_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  const CATEGORIES = ['Courses', 'Électronique', 'Maison', 'Mode', 'Sport', 'Autre'];
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  function dateMs(s) {
    if (typeof s !== 'string' || !ISO.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (y < 1900 || y > 2200) return null;
    const ms = Date.UTC(y, m - 1, d);
    const v = new Date(ms);
    return v.getUTCFullYear() === y && v.getUTCMonth() === m - 1 && v.getUTCDate() === d ? ms : null;
  }
  function todayLocal(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function daysUntil(iso, today) {
    const a = dateMs(iso), b = dateMs(today);
    return a === null || b === null ? null : Math.round((a - b) / 86400000);
  }
  function eurosToCents(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const s = String(value).trim().replace(',', '.');
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(s)) return null;
    const [a, b = ''] = s.split('.');
    const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
    return Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000 ? n : null;
  }
  function cleanRecord(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const { id, merchant, item, amountCents, purchasedOn, returnBy, warrantyUntil, category, note, photo, photoName } = input;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(id)) return null;
    if (typeof merchant !== 'string' || !merchant.trim() || merchant.trim().length > 90) return null;
    if (typeof item !== 'string' || !item.trim() || item.trim().length > 110) return null;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 1_000_000_000) return null;
    if (dateMs(purchasedOn) === null) return null;
    if (returnBy != null && returnBy !== '' && (dateMs(returnBy) === null || daysUntil(returnBy, purchasedOn) < 0)) return null;
    if (warrantyUntil != null && warrantyUntil !== '' && (dateMs(warrantyUntil) === null || daysUntil(warrantyUntil, purchasedOn) < 0)) return null;
    if (!CATEGORIES.includes(category)) return null;
    if (typeof note !== 'string' || note.length > 1200) return null;
    if (photo != null && (typeof Blob === 'undefined' || !(photo instanceof Blob) || !VALID_MIMES.includes(photo.type) || photo.size > MAX_PHOTO_BYTES || photo.size === 0)) return null;
    if (photoName != null && (typeof photoName !== 'string' || photoName.length > 120)) return null;
    return {
      id, merchant: merchant.trim(), item: item.trim(), amountCents,
      purchasedOn, returnBy: returnBy || '', warrantyUntil: warrantyUntil || '',
      category, note, photo: photo || null, photoName: photoName || ''
    };
  }
  function status(record, today) {
    const ret = record.returnBy ? daysUntil(record.returnBy, today) : null;
    const warr = record.warrantyUntil ? daysUntil(record.warrantyUntil, today) : null;
    return {
      returnDays: ret, warrantyDays: warr,
      returnSoon: ret !== null && ret >= 0 && ret <= 7,
      returnExpired: ret !== null && ret < 0,
      warrantySoon: warr !== null && warr >= 0 && warr <= 30,
      warrantyExpired: warr !== null && warr < 0
    };
  }
  function summarize(records, today) {
    let tracked = 0, returnSoon = 0, warrantySoon = 0;
    for (const record of records) {
      tracked++;
      const s = status(record, today);
      if (s.returnSoon) returnSoon++;
      if (s.warrantySoon) warrantySoon++;
    }
    return { tracked, returnSoon, warrantySoon };
  }
  // Adaptation Louvre : dérivations calculées sans état d'interface dupliqué.
  function upcomingDeadlines(records, today, daysAhead = 30) {
    if (dateMs(today) === null || !Number.isInteger(daysAhead) || daysAhead < 0 || daysAhead > 365) return [];
    const items = [];
    for (const record of records) {
      if (!cleanRecord(record)) continue;
      for (const [kind, due] of [['return', record.returnBy], ['warranty', record.warrantyUntil]]) {
        if (!due) continue;
        const days = daysUntil(due, today);
        if (days !== null && days >= 0 && days <= daysAhead)
          items.push({ recordId: record.id, item: record.item, merchant: record.merchant, kind, due, days });
      }
    }
    return items.sort((a, b) => a.days - b.days || (a.kind === 'return' ? -1 : 1) || a.item.localeCompare(b.item, 'fr'));
  }
  function categoryBreakdown(records, month) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
    const totals = new Map();
    for (const record of records) {
      if (!cleanRecord(record) || record.purchasedOn.slice(0, 7) !== month) continue;
      totals.set(record.category, (totals.get(record.category) || 0) + record.amountCents);
    }
    return [...totals].map(([category, cents]) => ({category, cents}))
      .sort((a, b) => b.cents - a.cents || a.category.localeCompare(b.category, 'fr'));
  }
  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }
  // Export de dates saisies par l'utilisateur. Aucun serveur, aucune notification implicite.
  function calendarIcs(records) {
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Louvre//ReceiptRescue//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    let count = 0;
    for (const r of records) {
      if (!cleanRecord(r)) continue;
      for (const [kind, date] of [['Retour',r.returnBy],['Garantie',r.warrantyUntil]]) {
        if (!date) continue;
        const day = date.replace(/-/g,'');
        // Identifiant déterministe, aucune donnée personnelle envoyée sur Internet.
        const uid = `${r.id}-${kind.toLowerCase()}-${day}@receiptrescue.local`;
        lines.push('BEGIN:VEVENT',`UID:${icsEscape(uid)}`,`DTSTART;VALUE=DATE:${day}`,`SUMMARY:${icsEscape(kind + ' : ' + r.item)}`,`DESCRIPTION:${icsEscape('Magasin : ' + r.merchant + ' — date renseignée dans ReceiptRescue')}`,'END:VEVENT');
        count++;
      }
    }
    lines.push('END:VCALENDAR');
    return { content: lines.join('\r\n') + '\r\n', count };
  }
  function formatMoney(cents, currency = 'EUR') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
  }
  function dateLabel(iso) {
    const ms = dateMs(iso);
    return ms == null ? '—' : new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  }
  function validateBackup(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1 || !Array.isArray(input.records) || input.records.length > MAX_RECORDS) return null;
    if (Object.keys(input).sort().join(',') !== 'records,version') return null;
    const seen = new Set(), records = [];
    for (const v of input.records) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      const allowed = ['id','merchant','item','amountCents','purchasedOn','returnBy','warrantyUntil','category','note','photoData','photoName'];
      if (Object.keys(v).some(k => !allowed.includes(k))) return null;
      const { photoData = null, photoName = '' } = v;
      if (photoData != null && (typeof photoData !== 'string' || photoData.length > MAX_PHOTO_BYTES * 1.4 + 100 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photoData))) return null;
      const r = cleanRecord({ ...v, photo: null });
      if (!r || seen.has(r.id)) return null;
      seen.add(r.id);
      records.push({ ...r, photoData });
    }
    return records;
  }
  return { MAX_PHOTO_BYTES, MAX_BACKUP_BYTES, MAX_RECORDS, VALID_MIMES, CATEGORIES, dateMs, todayLocal, daysUntil, eurosToCents, cleanRecord, status, summarize, formatMoney, dateLabel, validateBackup, upcomingDeadlines, categoryBreakdown, calendarIcs };
});