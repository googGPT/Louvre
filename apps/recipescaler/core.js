/* RecipeScaler — logique pure : mise à l'échelle d'une recette, conversions d'unités cohérentes, arrondis lisibles.
   Quantités physiques avec unité explicite. Les conversions de cuillères suivent les conventions métriques
   (c. à café = 5 ml, c. à soupe = 15 ml) ; aucune conversion masse <-> volume (la densité dépend de l'ingrédient). */
(function (root) {
  'use strict';

  const VERSION = 1;
  const UNITS = Object.freeze({
    g: { dim: 'mass', factor: 1 }, kg: { dim: 'mass', factor: 1000 },
    ml: { dim: 'volume', factor: 1 }, cl: { dim: 'volume', factor: 10 }, l: { dim: 'volume', factor: 1000 },
    tsp: { dim: 'volume', factor: 5 }, tbsp: { dim: 'volume', factor: 15 },
    piece: { dim: 'count', factor: 1 }, pinch: { dim: 'pinch', factor: 1 }, taste: { dim: 'taste', factor: 0 },
  });
  const MAX_RECIPES = 200, MAX_INGREDIENTS = 60, MAX_TITLE = 80, MAX_NAME = 60, MAX_STEPS = 4000, MAX_SERVINGS = 100, MAX_QTY = 99999;
  const MIN_FACTOR = 0.05, MAX_FACTOR = 50;
  const ID_RE = /^[a-z0-9-]{6,64}$/i;

  function fail(key, params) { throw new Error(params ? `${key}|${JSON.stringify(params)}` : key); }
  const isPlain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (o, keys) => Object.keys(o).sort().join(',') === keys.slice().sort().join(',');

  // « 1,5 », « 0.25 » ou « 1/2 » -> nombre positif (3 décimales au plus).
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
  function servings(v) {
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isInteger(n) || n < 1 || n > MAX_SERVINGS) fail('err.servings', { max: MAX_SERVINGS });
    return n;
  }
  function text(v, max, emptyKey, longKey) {
    if (typeof v !== 'string' || !v.trim()) fail(emptyKey);
    const s = v.replace(/\s+/g, ' ').trim();
    if (s.length > max) fail(longKey, { max });
    return s;
  }

  function makeIngredient(input) {
    if (!isPlain(input)) fail('err.backup');
    if (!Object.prototype.hasOwnProperty.call(UNITS, input.unit)) fail('err.unit');
    const name = text(input.name, MAX_NAME, 'err.ingredientName', 'err.nameLong');
    if (input.unit === 'taste') { // « au goût » : pas de quantité, rien à recalculer
      if (input.qty !== null && input.qty !== undefined && String(input.qty).trim() !== '') fail('err.tasteQty');
      return { name, qty: null, unit: 'taste' };
    }
    return { name, qty: parseQty(input.qty), unit: input.unit };
  }
  function makeRecipe(input, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) fail('err.id');
    const title = text(input.title, MAX_TITLE, 'err.titleRequired', 'err.titleLong');
    const n = servings(input.servings);
    const ings = Array.isArray(input.ingredients) ? input.ingredients : [];
    if (!ings.length) fail('err.noIngredient');
    if (ings.length > MAX_INGREDIENTS) fail('err.tooManyIngredients', { max: MAX_INGREDIENTS });
    const steps = typeof input.steps === 'string' ? input.steps.replace(/\r\n?/g, '\n').trim() : '';
    if (steps.length > MAX_STEPS) fail('err.stepsLong', { max: MAX_STEPS });
    return { id, title, servings: n, ingredients: ings.map(makeIngredient), steps };
  }

  // --- Arrondis lisibles
  const roundTo = (v, step) => Math.round(v / step) * step;
  const clean = (v) => Math.round(v * 1000) / 1000; // arrondi usuel des quantités affichées
  const nonzero = (raw, rounded) => rounded === 0 && raw > 0 ? Number(raw.toPrecision(8)) : clean(rounded);
  function stepFor(v) { return v < 1 ? 0.1 : v < 10 ? 0.5 : v < 100 ? 1 : 5; }
  // Masse ou volume « métrique » : unité la plus lisible, pas d'arrondi selon la grandeur.
  function metric(base, small, big, origin) {
    if (base >= 1000) { const v = base / 1000; return { value: nonzero(v, roundTo(v, v < 10 ? 0.01 : 0.1)), unit: big }; }
    if (origin === 'cl') { const v = base / 10; return { value: nonzero(v, roundTo(v, v < 10 ? 0.5 : 1)), unit: 'cl' }; }
    return { value: nonzero(base, roundTo(base, stepFor(base))), unit: small };
  }
  // Cuillères : moins d'une c. à soupe -> c. à café au quart près ; jusqu'à 4 c. à soupe -> « 1 c. à soupe + 1 c. à café » ; au-delà -> ml.
  function spoons(ml) {
    if (ml < 0.1) return metric(ml, 'ml', 'l', 'ml'); // une fraction infime ne doit pas devenir ¼ de cuillère
    if (ml < 15) { const v = Math.max(0.25, roundTo(ml / 5, 0.25)); return v >= 3 ? { value: 1, unit: 'tbsp' } : { value: clean(v), unit: 'tsp' }; }
    if (ml <= 60) {
      let tb = Math.floor(ml / 15), rest = roundTo((ml - tb * 15) / 5, 0.25);
      if (rest >= 3) { tb++; rest = 0; }
      return rest ? { value: tb, unit: 'tbsp', extra: { value: clean(rest), unit: 'tsp' } } : { value: tb, unit: 'tbsp' };
    }
    return metric(ml, 'ml', 'l', 'ml');
  }
  // Quantité affichée exprimée en unité de base (g, ml, pièce).
  function toBase(q) { return q.value * UNITS[q.unit].factor + (q.extra ? q.extra.value * UNITS[q.extra.unit].factor : 0); }

  // Une ligne recalculée : { name, unit, value, extra?, approx, exact (unité de base), origin }.
  function scaleIngredient(ing, factor) {
    if (!(factor >= MIN_FACTOR && factor <= MAX_FACTOR)) fail('err.factor');
    if (ing.unit === 'taste') return { name: ing.name, unit: 'taste', value: null, approx: false, exact: null, origin: ing };
    const dim = UNITS[ing.unit].dim;
    const exact = ing.qty * UNITS[ing.unit].factor * factor;
    let q;
    if (dim === 'mass') q = metric(exact, 'g', 'kg', ing.unit);
    else if (dim === 'volume') q = ing.unit === 'tsp' || ing.unit === 'tbsp' ? spoons(exact) : metric(exact, 'ml', 'l', ing.unit === 'l' && exact < 1000 ? 'cl' : ing.unit);
    else if (dim === 'count') q = { value: exact < 1 ? Math.max(0.5, roundTo(exact, 0.5)) : Math.round(exact), unit: 'piece' }; // œufs : entiers, ou ½ en dessous de 1
    else q = { value: Math.max(1, Math.round(exact)), unit: 'pinch' };
    const shown = toBase(q);
    return { name: ing.name, ...q, approx: Math.abs(shown - exact) > 1e-6 * Math.max(1, exact), exact: Number(exact.toPrecision(12)), origin: ing };
  }
  function scaleRecipe(recipe, factor) { return recipe.ingredients.map((i) => scaleIngredient(i, factor)); }
  function factorForServings(recipe, target) { return servings(target) / recipe.servings; }
  // « J'ai 300 g de farine » : facteur d'après un ingrédient (même dimension obligatoire).
  function factorFromIngredient(recipe, index, qty, unit) {
    const ing = recipe.ingredients[index];
    if (!ing) fail('err.ingredientPick');
    if (ing.unit === 'taste') fail('err.ingredientTaste');
    if (!Object.prototype.hasOwnProperty.call(UNITS, unit) || UNITS[unit].dim !== UNITS[ing.unit].dim) fail('err.dimMismatch');
    const f = (parseQty(qty) * UNITS[unit].factor) / (ing.qty * UNITS[ing.unit].factor);
    if (!(f >= MIN_FACTOR && f <= MAX_FACTOR)) fail('err.factor');
    return f;
  }

  // --- Sauvegarde
  function validateData(data) {
    if (!isPlain(data)) fail('err.backup');
    if (data.app !== 'recipescaler' || data.version !== VERSION) fail('err.notBackup');
    if (!sameKeys(data, ['app', 'version', 'recipes']) || !Array.isArray(data.recipes)) fail('err.backup');
    if (data.recipes.length > MAX_RECIPES) fail('err.tooManyRecipes', { max: MAX_RECIPES });
    const recipes = data.recipes.map((r) => {
      if (!isPlain(r) || !sameKeys(r, ['id', 'title', 'servings', 'ingredients', 'steps']) || !Array.isArray(r.ingredients) || typeof r.steps !== 'string') fail('err.backup');
      for (const i of r.ingredients) {
        if (!isPlain(i) || !sameKeys(i, ['name', 'qty', 'unit'])) fail('err.backup');
        if (i.unit === 'taste' ? i.qty !== null : typeof i.qty !== 'number' || Math.round(i.qty * 1000) !== i.qty * 1000) fail('err.backup');
      }
      return makeRecipe({ ...r, ingredients: r.ingredients.map((i) => ({ ...i, qty: i.qty === null ? null : String(i.qty) })) }, r.id);
    });
    if (new Set(recipes.map((r) => r.id)).size !== recipes.length) fail('err.backup');
    return { recipes };
  }
  function backup(data) {
    const clean2 = validateData({ app: 'recipescaler', version: VERSION, ...data });
    return JSON.stringify({ app: 'recipescaler', version: VERSION, ...clean2 }, null, 2);
  }

  const api = {
    VERSION, UNITS, MAX_RECIPES, MAX_INGREDIENTS, MAX_SERVINGS, MIN_FACTOR, MAX_FACTOR,
    parseQty, makeRecipe, scaleIngredient, scaleRecipe, factorForServings, factorFromIngredient, validateData, backup,
  };
  root.RecipeCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.RecipeCore;
})(typeof window === 'undefined' ? globalThis : window);
