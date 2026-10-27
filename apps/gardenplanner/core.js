/* GardenPlanner — logique pure : parcelles en grille, cultures placées sur des cases, semis / plantation / récolte
   (dates saisies ou délais saisis en jours à partir du semis), occupation des cases dans le temps, calendrier des tâches,
   rotation (même famille sur la même parcelle l'année précédente) et export .ics.
   Aucune donnée agronomique : dates, délais et familles sont saisis par l'utilisateur.
   Dates en jours civils « AAAA-MM-JJ » (calculs en UTC) ; dimensions en cases entières, taille de case en cm. */
(function (root) {
  'use strict';

  const VERSION = 1;
  // Familles botaniques proposées au choix (l'utilisateur décide) ; « other » ne déclenche aucune alerte de rotation.
  const FAMILIES = Object.freeze(['solanaceae', 'brassicaceae', 'fabaceae', 'cucurbitaceae', 'apiaceae', 'amaryllidaceae', 'asteraceae', 'amaranthaceae', 'poaceae', 'other']);
  const KINDS = Object.freeze(['sow', 'plant', 'harvest', 'harvestEnd']); // tâches du calendrier
  const MAX_BEDS = 30, MAX_CROPS = 1000, MAX_NAME = 40, MAX_NOTE = 200, MAX_SIDE = 20, MIN_CELL = 10, MAX_CELL = 500;
  const MAX_PLANT_DAYS = 365, MAX_HARVEST_DAYS = 730, MAX_ICS_EVENTS = 3000;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');

  // --- Jours civils
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function toUTC(day) { if (!isDay(day)) fail('err.date'); const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function addDays(day, n) { return new Date(toUTC(day) + n * 86400000).toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((toUTC(a) - toUTC(b)) / 86400000); }
  const yearOf = (day) => Number(day.slice(0, 4));

  // --- Saisies
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function text(v, max, required, keyRequired, keyLong) {
    if (v === undefined || v === null) v = '';
    if (typeof v !== 'string') fail('err.backup');
    const s = v.replace(/\s+/g, ' ').trim();
    if (required && !s) fail(keyRequired);
    if (s.length > max) fail(keyLong, { max });
    return s;
  }
  function int(v, min, max, key, params) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!/^\d{1,4}$/.test(s)) fail(key, params);
    const n = Number(s);
    if (n < min || n > max) fail(key, params);
    return n;
  }

  // Parcelle : grille de cols × rows cases carrées de cellCm centimètres de côté.
  function makeBed(input, id) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    const name = text(input.name, MAX_NAME, true, 'err.bedName', 'err.nameLong');
    const cols = int(input.cols, 1, MAX_SIDE, 'err.side', { max: MAX_SIDE });
    const rows = int(input.rows, 1, MAX_SIDE, 'err.side', { max: MAX_SIDE });
    const cellCm = int(input.cellCm, MIN_CELL, MAX_CELL, 'err.cell', { min: MIN_CELL, max: MAX_CELL });
    return { id, name, cols, rows, cellCm };
  }
  const bedAreaCm2 = (bed) => bed.cols * bed.rows * bed.cellCm * bed.cellCm;

  // Une étape est saisie soit par une date, soit par un délai en jours après le semis ; elle est stockée en délai.
  function offset(step, sow, max, keyBase) {
    if (!isPlain(step) || step.mode === 'none') return null;
    if (step.mode === 'date') {
      if (!isDay(step.value)) fail(keyBase + 'Date');
      const n = dayDiff(step.value, sow);
      if (n < 0) fail(keyBase + 'BeforeSow');
      if (n > max) fail(keyBase + 'Days', { max });
      return n;
    }
    if (step.mode === 'days') return int(step.value, 0, max, keyBase + 'Days', { max });
    return fail('err.backup');
  }
  // input : { bedId, name, family, x, y, w, h (cases, à partir de 1), sow, plant:{mode,value}, harvest:{mode,value}, harvestEnd:{mode,value}, note }
  function makeCrop(input, id, beds) {
    checkId(id);
    if (!isPlain(input)) fail('err.backup');
    const bed = beds.find((b) => b.id === input.bedId);
    if (!bed) fail('err.bedUnknown');
    const name = text(input.name, MAX_NAME, true, 'err.cropName', 'err.nameLong');
    if (!FAMILIES.includes(input.family)) fail('err.family');
    const x = int(input.x, 1, bed.cols, 'err.cellPos', { cols: bed.cols, rows: bed.rows });
    const y = int(input.y, 1, bed.rows, 'err.cellPos', { cols: bed.cols, rows: bed.rows });
    const w = int(input.w, 1, MAX_SIDE, 'err.size');
    const h = int(input.h, 1, MAX_SIDE, 'err.size');
    if (x + w - 1 > bed.cols || y + h - 1 > bed.rows) fail('err.outside', { cols: bed.cols, rows: bed.rows });
    if (!isDay(input.sow)) fail('err.sow');
    const plantDays = offset(input.plant, input.sow, MAX_PLANT_DAYS, 'err.plant');
    const harvestDays = offset(input.harvest, input.sow, MAX_HARVEST_DAYS, 'err.harvest');
    if (harvestDays === null) fail('err.harvestRequired');
    if (plantDays !== null && harvestDays <= plantDays) fail('err.harvestBeforePlant');
    if (plantDays === null && harvestDays === 0) fail('err.harvestDays', { max: MAX_HARVEST_DAYS });
    const harvestEndDays = offset(input.harvestEnd, input.sow, MAX_HARVEST_DAYS, 'err.harvestEnd');
    if (harvestEndDays !== null && harvestEndDays < harvestDays) fail('err.harvestEndBefore');
    const done = Array.isArray(input.done) ? [...new Set(input.done)] : [];
    if (done.some((k) => !KINDS.includes(k))) fail('err.backup');
    return { id, bedId: bed.id, name, family: input.family, x, y, w, h, sow: input.sow, plantDays, harvestDays, harvestEndDays,
      note: text(input.note, MAX_NOTE, false, '', 'err.noteLong'), done: KINDS.filter((k) => done.includes(k)) };
  }

  // Dates de la culture. La parcelle est occupée de la plantation (ou du semis s'il est direct) à la fin de récolte.
  function cropDates(c) {
    const plant = c.plantDays === null ? null : addDays(c.sow, c.plantDays);
    const harvest = addDays(c.sow, c.harvestDays);
    const harvestEnd = c.harvestEndDays === null ? null : addDays(c.sow, c.harvestEndDays);
    const start = plant || c.sow, end = harvestEnd || harvest;
    return { sow: c.sow, plant, harvest, harvestEnd, start, end, year: yearOf(start) };
  }
  const cropAreaCm2 = (c, bed) => c.w * c.h * bed.cellCm * bed.cellCm;
  function rectsOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function periodsOverlap(a, b) { const A = cropDates(a), B = cropDates(b); return A.start <= B.end && B.start <= A.end; }
  // Cultures qui occupent les mêmes cases en même temps (les successions sur une même case restent possibles).
  function conflicts(crops, crop) { return crops.filter((c) => c.id !== crop.id && c.bedId === crop.bedId && rectsOverlap(c, crop) && periodsOverlap(c, crop)); }
  function upsertCrop(data, crop) {
    const exists = data.crops.some((c) => c.id === crop.id);
    if (!exists && data.crops.length >= MAX_CROPS) fail('err.tooManyCrops', { max: MAX_CROPS });
    const clash = conflicts(data.crops, crop);
    if (clash.length) fail('err.overlap', { name: clash[0].name });
    return { ...data, crops: exists ? data.crops.map((c) => (c.id === crop.id ? crop : c)) : [...data.crops, crop] };
  }
  function upsertBed(data, bed) {
    const exists = data.beds.some((b) => b.id === bed.id);
    if (!exists && data.beds.length >= MAX_BEDS) fail('err.tooManyBeds', { max: MAX_BEDS });
    // Une parcelle réduite ne doit laisser aucune culture hors de la grille.
    if (data.crops.some((c) => c.bedId === bed.id && (c.x + c.w - 1 > bed.cols || c.y + c.h - 1 > bed.rows))) fail('err.shrink');
    return { ...data, beds: exists ? data.beds.map((b) => (b.id === bed.id ? bed : b)) : [...data.beds, bed] };
  }
  function removeBed(data, id) { return { beds: data.beds.filter((b) => b.id !== id), crops: data.crops.filter((c) => c.bedId !== id) }; }
  function removeCrop(data, id) { return { ...data, crops: data.crops.filter((c) => c.id !== id) }; }
  function toggleDone(crop, kind) {
    if (!KINDS.includes(kind)) fail('err.kind');
    const done = crop.done.includes(kind) ? crop.done.filter((k) => k !== kind) : [...crop.done, kind];
    return { ...crop, done: KINDS.filter((k) => done.includes(k)) };
  }

  // Cultures présentes sur la parcelle pendant l'année `year` (occupation qui touche cette année).
  function cropsInYear(crops, bedId, year) {
    return crops.filter((c) => { const d = cropDates(c); return c.bedId === bedId && yearOf(d.start) <= year && yearOf(d.end) >= year; });
  }
  // Grille : pour chaque case, les identifiants des cultures de l'année (plusieurs = successions).
  function grid(bed, crops, year) {
    const cells = Array.from({ length: bed.rows }, () => Array.from({ length: bed.cols }, () => []));
    for (const c of cropsInYear(crops, bed.id, year).sort((a, b) => (cropDates(a).start < cropDates(b).start ? -1 : 1))) {
      for (let r = c.y; r < c.y + c.h; r += 1) for (let k = c.x; k < c.x + c.w; k += 1) cells[r - 1][k - 1].push(c.id);
    }
    return cells;
  }
  // Rotation : même famille (hors « autre ») sur la même parcelle l'année précédente. `cells` : les cases se recouvrent-elles ?
  function rotationWarnings(crops, crop) {
    if (crop.family === 'other') return [];
    const year = cropDates(crop).year;
    return crops.filter((c) => c.id !== crop.id && c.bedId === crop.bedId && c.family === crop.family && cropDates(c).year === year - 1)
      .map((c) => ({ crop: c, cells: rectsOverlap(c, crop) }));
  }
  // Calendrier des tâches entre deux jours inclus, triées par date.
  function tasks(crops, from, to) {
    const out = [];
    for (const c of crops) {
      const d = cropDates(c);
      for (const kind of KINDS) {
        const day = d[kind];
        if (day && day >= from && day <= to) out.push({ day, kind, crop: c, done: c.done.includes(kind) });
      }
    }
    return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.crop.name < b.crop.name ? -1 : 1)));
  }
  function monthBounds(month) { // « AAAA-MM »
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month) || !isDay(month + '-01')) fail('err.date');
    const [y, m] = month.split('-').map(Number);
    return { from: month + '-01', to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` };
  }
  function addMonth(month, n) { const [y, m] = month.split('-').map(Number); const i = y * 12 + m - 1 + n; return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; }

  // --- Export agenda (.ics) : une journée par tâche non faite de l'année choisie.
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) {
    const out = []; let cur = '';
    for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
    out.push(cur); return out.join('\r\n');
  }
  function toICS(crops, beds, year, stamp, txt) {
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) fail('err.stamp');
    if (!Number.isInteger(year) || year < 1970 || year > 2200) fail('err.year');
    if (!txt || typeof txt.summary !== 'function' || typeof txt.description !== 'function') fail('err.icsText');
    const list = tasks(crops, `${year}-01-01`, `${year}-12-31`).filter((x) => !x.done);
    if (list.length > MAX_ICS_EVENTS) fail('err.icsTooMany', { max: MAX_ICS_EVENTS });
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvre//GardenPlanner//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const x of list) {
      const bed = beds.find((b) => b.id === x.crop.bedId), d8 = x.day.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${x.crop.id}-${x.kind}@gardenplanner.louvre`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8}`,
        `DTEND;VALUE=DATE:${addDays(x.day, 1).replace(/-/g, '')}`, fold(`SUMMARY:${icsEscape(txt.summary(x.kind, x.crop, bed))}`),
        fold(`DESCRIPTION:${icsEscape(txt.description(x.kind, x.crop, bed))}`), 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n') + '\r\n', count: list.length };
  }

  // --- Sauvegarde
  const CROP_KEYS = ['id', 'bedId', 'name', 'family', 'x', 'y', 'w', 'h', 'sow', 'plantDays', 'harvestDays', 'harvestEndDays', 'note', 'done'];
  const asStep = (n) => (n === null ? { mode: 'none' } : { mode: 'days', value: String(n) });
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'gardenplanner' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'beds', 'crops']) || !Array.isArray(data.beds) || !Array.isArray(data.crops)) fail('err.backup');
    if (data.beds.length > MAX_BEDS) fail('err.tooManyBeds', { max: MAX_BEDS });
    if (data.crops.length > MAX_CROPS) fail('err.tooManyCrops', { max: MAX_CROPS });
    const beds = data.beds.map((b) => {
      if (!isPlain(b) || !sameKeys(b, ['id', 'name', 'cols', 'rows', 'cellCm']) || ![b.cols, b.rows, b.cellCm].every(Number.isInteger)) fail('err.backup');
      return makeBed(b, b.id);
    });
    let clean = { beds, crops: [] };
    for (const c of data.crops) {
      if (!isPlain(c) || !sameKeys(c, CROP_KEYS) || !Array.isArray(c.done)) fail('err.backup');
      if (![c.x, c.y, c.w, c.h, c.harvestDays].every(Number.isInteger) || ![c.plantDays, c.harvestEndDays].every((v) => v === null || Number.isInteger(v))) fail('err.backup');
      const crop = makeCrop({ ...c, x: String(c.x), y: String(c.y), w: String(c.w), h: String(c.h),
        plant: asStep(c.plantDays), harvest: asStep(c.harvestDays), harvestEnd: asStep(c.harvestEndDays) }, c.id, beds);
      if (clean.crops.some((x) => x.id === crop.id)) fail('err.backup');
      clean = upsertCrop(clean, crop); // refuse aussi les chevauchements
    }
    const ids = [...beds.map((b) => b.id), ...clean.crops.map((c) => c.id)];
    if (new Set(ids).size !== ids.length) fail('err.backup');
    return clean;
  }
  function backup(data) {
    const clean = validateData({ app: 'gardenplanner', version: VERSION, beds: data.beds, crops: data.crops });
    return JSON.stringify({ app: 'gardenplanner', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, FAMILIES, KINDS, MAX_BEDS, MAX_CROPS, MAX_SIDE, MIN_CELL, MAX_CELL, MAX_PLANT_DAYS, MAX_HARVEST_DAYS,
    isDay, addDays, dayDiff, makeBed, bedAreaCm2, makeCrop, cropDates, cropAreaCm2, rectsOverlap, conflicts, upsertCrop, upsertBed,
    removeBed, removeCrop, toggleDone, cropsInYear, grid, rotationWarnings, tasks, monthBounds, addMonth, toICS, validateData, backup,
  };
  root.GardenCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GardenCore;
})(typeof window === 'undefined' ? globalThis : window);
