/* MealCalendar — logique pure : plats (ingrédients et quantités), menus de la semaine, liste de courses agrégée.
   Quantités physiques avec unité explicite ; calculs internes en entiers (millièmes d'unité de base : mg, µl×1000…)
   pour additionner sans erreur d'arrondi. Dates en jours civils « AAAA-MM-JJ ». */
(function (root) {
  'use strict';

  const VERSION = 1;
  // Unités : dimension et facteur vers l'unité de base (g, ml ou pièce).
  // Cuillères : conventions métriques usuelles (c. à café = 5 ml, c. à soupe = 15 ml), rappelées dans l'interface.
  const UNITS = Object.freeze({
    g: { dim: 'mass', factor: 1 }, kg: { dim: 'mass', factor: 1000 },
    ml: { dim: 'volume', factor: 1 }, cl: { dim: 'volume', factor: 10 }, l: { dim: 'volume', factor: 1000 },
    tsp: { dim: 'volume', factor: 5 }, tbsp: { dim: 'volume', factor: 15 },
    piece: { dim: 'count', factor: 1 },
  });
  const MEALS = Object.freeze(['breakfast', 'lunch', 'dinner']);
  const MAX_DISHES = 200, MAX_INGREDIENTS = 40, MAX_PLANS = 104, MAX_NAME = 60, MAX_PEOPLE = 50, MAX_QTY = 99999;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');
  // Nom comparable : sans accents ni casse, apostrophes typographiques unifiées.
  function norm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019`\u00b4]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim(); }

  // « 1,5 », « 0.25 » ou « 1/2 » -> nombre positif à 3 décimales au plus.
  function parseQty(value) {
    const s = String(value).trim().replace(',', '.');
    let n;
    const frac = s.match(/^(\d{1,3})\/(\d{1,3})$/);
    if (frac) { if (Number(frac[2]) === 0) fail('err.qty'); n = Math.round(1000 * Number(frac[1]) / Number(frac[2])) / 1000; }
    else if (/^\d{1,5}(\.\d{1,3})?$/.test(s)) n = Number(s);
    else fail('err.qty');
    if (!(n > 0) || n > MAX_QTY) fail('err.qty');
    return n;
  }
  function cleanName(v, key = 'err.nameRequired') {
    if (typeof v !== 'string' || !v.trim()) fail(key);
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length > MAX_NAME) fail('err.nameLong', { max: MAX_NAME });
    return s;
  }
  function checkId(id) { if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id'); return id; }
  function people(v) {
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isInteger(n) || n < 1 || n > MAX_PEOPLE) fail('err.people', { max: MAX_PEOPLE });
    return n;
  }

  // Quantité en millièmes de l'unité de base (entier) : 1,5 kg -> 1 500 000.
  function baseMilli(qty, unit) { return Math.round(qty * 1000) * UNITS[unit].factor; }

  function makeIngredient(input) {
    if (!isPlain(input)) fail('err.backup');
    if (!Object.prototype.hasOwnProperty.call(UNITS, input.unit)) fail('err.unit');
    return { name: cleanName(input.name, 'err.ingredientName'), qty: parseQty(input.qty), unit: input.unit };
  }
  function makeDish(input, id) {
    checkId(id);
    const name = cleanName(input.name), servings = people(input.servings); // vérifiés dans l'ordre du formulaire
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    if (!ingredients.length) fail('err.noIngredient');
    if (ingredients.length > MAX_INGREDIENTS) fail('err.tooManyIngredients', { max: MAX_INGREDIENTS });
    return { id, name, servings, ingredients: ingredients.map(makeIngredient) };
  }

  // --- Calendrier (jours civils, calculs en UTC pour éviter les pièges d'heure d'été)
  function isDay(day) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const [y, m, d] = day.split('-').map(Number);
    if (y < 1970 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function toUTC(day) { if (!isDay(day)) fail('err.date'); const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); }
  function fromUTC(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(day, n) { return fromUTC(toUTC(day) + n * 86400000); }
  function weekStart(day) { const dow = (new Date(toUTC(day)).getUTCDay() + 6) % 7; return addDays(day, -dow); } // lundi
  function weekDays(week) { return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i)); }

  // --- Menus
  function emptyPlan(week) { if (weekStart(week) !== week) fail('err.week'); return { week, slots: [], checked: [] }; }
  // Place (ou retire, dishId = null) un plat sur un repas ; renvoie un nouveau menu.
  function setSlot(plan, day, meal, dishId, n, dishes) {
    if (!Number.isInteger(day) || day < 0 || day > 6) fail('err.slot');
    if (!MEALS.includes(meal)) fail('err.slot');
    const slots = plan.slots.filter((s) => !(s.day === day && s.meal === meal));
    if (dishId) {
      if (!dishes.some((d) => d.id === dishId)) fail('err.dishUnknown');
      slots.push({ day, meal, dishId, people: people(n) });
      slots.sort((a, b) => a.day - b.day || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
    }
    return { ...plan, slots };
  }

  // --- Liste de courses : même ingrédient (nom sans accents ni casse) et même dimension -> une seule ligne.
  // Les quantités sont ramenées au nombre de personnes de chaque repas (règle de trois sur les portions du plat).
  function ingredientKey(name, unit) { return `${norm(name)}|${UNITS[unit].dim}`; }
  function shoppingList(plan, dishes) {
    const map = new Map(), amounts = new Map();
    // Accumuler exactement les fractions de portion avant l'arrondi final :
    // sinon plusieurs petites portions peuvent se perdre une à une.
    const gcd = (a,b) => { while(b){ const t=a%b; a=b; b=t; } return a; };
    for (const slot of plan.slots) {
      const dish = dishes.find((d) => d.id === slot.dishId);
      if (!dish) continue;
      for (const ing of dish.ingredients) {
        const key = ingredientKey(ing.name, ing.unit);
        if (!map.has(key)) map.set(key, { key, name: ing.name, dim: UNITS[ing.unit].dim, milli: 0, units: [], dishes: [] });
        const item = map.get(key);
        const current = amounts.get(key) || { num:0n, den:1n };
        const numerator = current.num * BigInt(dish.servings) + BigInt(baseMilli(ing.qty, ing.unit)) * BigInt(slot.people) * current.den;
        const denominator = current.den * BigInt(dish.servings);
        const common = gcd(numerator, denominator);
        amounts.set(key, { num:numerator/common, den:denominator/common });
        if (!item.units.includes(ing.unit)) item.units.push(ing.unit);
        if (!item.dishes.includes(dish.name)) item.dishes.push(dish.name);
      }
    }
    return [...map.values()].map((item) => {
      const {num,den} = amounts.get(item.key);
      item.milli = Number((2n*num+den)/(2n*den)); // arrondi une seule fois, au millième d'unité de base
      return item;
    });
  }
  // Quantité lisible : l'unité d'origine si elle est unique, sinon g/kg ou ml/L selon la grandeur.
  function displayQty(item) {
    let unit;
    if (item.units.length === 1) unit = item.units[0];
    else if (item.dim === 'mass') unit = item.milli >= 1000000 ? 'kg' : 'g';
    else if (item.dim === 'volume') unit = item.milli >= 1000000 ? 'l' : 'ml';
    else unit = 'piece';
    if ((unit === 'g' || unit === 'ml') && item.milli >= 1000000) unit = unit === 'g' ? 'kg' : 'l'; // 1 200 g -> 1,2 kg
    const value = item.milli / 1000 / UNITS[unit].factor;
    const digits = Math.min(6, 3 + Math.ceil(Math.log10(UNITS[unit].factor)));
    return { value: Math.round(value * 10 ** digits) / 10 ** digits, unit };
  }

  // --- Export CSV de la liste de courses (en-têtes et libellés d'unité fournis par l'interface, traduits).
  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function shoppingCSV(items, opts) {
    const { headers, unitLabel, decimal, yes, no, checked } = opts;
    if (!Array.isArray(headers) || headers.length !== 5) fail('err.headers');
    const lines = [headers.map(csvCell).join(';')];
    for (const it of items) {
      const q = displayQty(it);
      const num = String(q.value).replace('.', decimal === 'comma' ? ',' : '.');
      lines.push([csvCell(it.name), num, csvCell(unitLabel(q.unit)), checked.includes(it.key) ? yes : no, csvCell(it.dishes.join(', '))].join(';'));
    }
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  // --- Suppression d'un plat : retiré aussi des menus qui l'utilisent.
  function removeDish(data, id) {
    return { dishes: data.dishes.filter((d) => d.id !== id), plans: data.plans.map((p) => ({ ...p, slots: p.slots.filter((s) => s.dishId !== id) })) };
  }
  function countUses(plans, id) { return plans.reduce((a, p) => a + p.slots.filter((s) => s.dishId === id).length, 0); }

  // --- Sauvegarde
  function validateDish(d) {
    if (!isPlain(d) || !sameKeys(d, ['id', 'name', 'servings', 'ingredients'])) fail('err.backup');
    if (!Array.isArray(d.ingredients)) fail('err.backup');
    for (const i of d.ingredients) {
      if (!isPlain(i) || !sameKeys(i, ['name', 'qty', 'unit']) || typeof i.qty !== 'number') fail('err.backup');
      if (Math.round(i.qty * 1000) !== i.qty * 1000) fail('err.backup');
    }
    return makeDish({ name: d.name, servings: d.servings, ingredients: d.ingredients.map((i) => ({ ...i, qty: String(i.qty) })) }, d.id);
  }
  function validatePlan(p, dishes) {
    if (!isPlain(p) || !sameKeys(p, ['week', 'slots', 'checked']) || !Array.isArray(p.slots) || !Array.isArray(p.checked)) fail('err.backup');
    if (!isDay(p.week) || weekStart(p.week) !== p.week) fail('err.backup');
    if (p.slots.length > 7 * MEALS.length || p.checked.length > 500) fail('err.backup');
    let plan = emptyPlan(p.week);
    for (const s of p.slots) {
      if (!isPlain(s) || !sameKeys(s, ['day', 'meal', 'dishId', 'people'])) fail('err.backup');
      if (plan.slots.some((x) => x.day === s.day && x.meal === s.meal)) fail('err.backup');
      plan = setSlot(plan, s.day, s.meal, s.dishId, s.people, dishes);
    }
    if (!p.checked.every((k) => typeof k === 'string' && k.length <= MAX_NAME + 10)) fail('err.backup');
    return { ...plan, checked: [...new Set(p.checked)] };
  }
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'mealcalendar' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'dishes', 'plans']) || !Array.isArray(data.dishes) || !Array.isArray(data.plans)) fail('err.backup');
    if (data.dishes.length > MAX_DISHES) fail('err.tooManyDishes', { max: MAX_DISHES });
    if (data.plans.length > MAX_PLANS) fail('err.backup');
    const dishes = data.dishes.map(validateDish);
    if (new Set(dishes.map((d) => d.id)).size !== dishes.length) fail('err.backup');
    const plans = data.plans.map((p) => validatePlan(p, dishes));
    if (new Set(plans.map((p) => p.week)).size !== plans.length) fail('err.backup');
    return { dishes, plans: plans.sort((a, b) => (a.week < b.week ? -1 : 1)) };
  }
  function backup(data) {
    const clean = validateData({ app: 'mealcalendar', version: VERSION, ...data });
    return JSON.stringify({ app: 'mealcalendar', version: VERSION, ...clean }, null, 2);
  }

  const api = {
    VERSION, UNITS, MEALS, MAX_DISHES, MAX_INGREDIENTS, MAX_PLANS, MAX_PEOPLE,
    norm, parseQty, baseMilli, makeDish, isDay, addDays, weekStart, weekDays, emptyPlan, setSlot,
    ingredientKey, shoppingList, displayQty, shoppingCSV, removeDish, countUses, validateData, backup,
  };
  root.MealCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MealCore;
})(typeof window === 'undefined' ? globalThis : window);
