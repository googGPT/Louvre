// Tests métier de RecipeScaler : saisie, mise à l'échelle, conversions, arrondis, ingrédients à l'unité, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const crepes = C.makeRecipe({ title: 'Crêpes', servings: '4', steps: 'Mélanger.\r\nCuire.', ingredients: [
  { name: 'Farine', qty: '250', unit: 'g' }, { name: 'Œufs', qty: '4', unit: 'piece' }, { name: 'Lait', qty: '50', unit: 'cl' },
  { name: 'Beurre', qty: '50', unit: 'g' }, { name: 'Sucre', qty: '1', unit: 'tbsp' }, { name: 'Sel', qty: '1', unit: 'pinch' },
  { name: 'Vanille', qty: '', unit: 'taste' }] }, 'recipe-0001');
const brief = (r) => ({ value: r.value, unit: r.unit, ...(r.extra ? { extra: r.extra } : {}), approx: r.approx });

test('saisie : quantités, portions, « au goût », validations', () => {
  assert.equal(crepes.steps, 'Mélanger.\nCuire.');
  assert.deepEqual(crepes.ingredients[6], { name: 'Vanille', qty: null, unit: 'taste' });
  assert.equal(C.parseQty('1/4'), 0.25);
  for (const bad of ['0', '-2', 'deux', '1/0', '0,0001']) assert.throws(() => C.parseQty(bad), /^Error: err\.qty$/, bad);
  const base = { title: 'X', servings: 2, ingredients: [{ name: 'a', qty: '1', unit: 'g' }] };
  assert.throws(() => C.makeRecipe({ ...base, title: '' }, 'recipe-0009'), /err\.titleRequired/);
  assert.throws(() => C.makeRecipe({ ...base, servings: 0 }, 'recipe-0009'), /err\.servings/);
  assert.throws(() => C.makeRecipe({ ...base, servings: 101 }, 'recipe-0009'), /err\.servings/);
  assert.throws(() => C.makeRecipe({ ...base, ingredients: [] }, 'recipe-0009'), /err\.noIngredient/);
  assert.throws(() => C.makeRecipe({ ...base, ingredients: [{ name: 'a', qty: '1', unit: 'cup' }] }, 'recipe-0009'), /err\.unit/);
  assert.throws(() => C.makeRecipe({ ...base, ingredients: [{ name: 'a', qty: '2', unit: 'taste' }] }, 'recipe-0009'), /err\.tasteQty/);
  assert.throws(() => C.makeRecipe({ ...base, ingredients: [{ name: ' ', qty: '2', unit: 'g' }] }, 'recipe-0009'), /err\.ingredientName/);
  assert.throws(() => C.makeRecipe({ ...base, steps: 'x'.repeat(4001) }, 'recipe-0009'), /err\.stepsLong/);
});

test('de 4 à 6 portions : règle de trois, cuillères recomposées, pincées entières', () => {
  const out = C.scaleRecipe(crepes, C.factorForServings(crepes, 6)).map(brief);
  assert.deepEqual(out, [
    { value: 375, unit: 'g', approx: false },
    { value: 6, unit: 'piece', approx: false },
    { value: 75, unit: 'cl', approx: false },
    { value: 75, unit: 'g', approx: false },
    { value: 1, unit: 'tbsp', extra: { value: 1.5, unit: 'tsp' }, approx: false }, // 22,5 ml = 1 c. à soupe + 1,5 c. à café
    { value: 2, unit: 'pinch', approx: true }, // 1,5 pincée -> 2
    { value: null, unit: 'taste', approx: false },
  ]);
});

test('œufs : entiers au-dessus de 1, ½ en dessous ; valeur exacte conservée', () => {
  const eggs = { name: 'Œufs', qty: 3, unit: 'piece' };
  assert.deepEqual(brief(C.scaleIngredient(eggs, 5 / 4)), { value: 4, unit: 'piece', approx: true }); // 3,75
  assert.equal(C.scaleIngredient(eggs, 5 / 4).exact, 3.75);
  assert.deepEqual(brief(C.scaleIngredient({ name: 'Œuf', qty: 1, unit: 'piece' }, 1 / 4)), { value: 0.5, unit: 'piece', approx: true });
  assert.deepEqual(brief(C.scaleIngredient({ name: 'Œuf', qty: 1, unit: 'piece' }, 1 / 2)), { value: 0.5, unit: 'piece', approx: false });
});

test('conversions cohérentes g/kg, ml/cl/L, c. à café / c. à soupe', () => {
  const f = (qty, unit, factor) => brief(C.scaleIngredient({ name: 'x', qty, unit }, factor));
  assert.deepEqual(f(400, 'g', 3), { value: 1.2, unit: 'kg', approx: false });
  assert.deepEqual(f(1.5, 'kg', 0.5), { value: 750, unit: 'g', approx: false });
  assert.deepEqual(f(333, 'g', 1), { value: 335, unit: 'g', approx: true }); // pas de 5 g au-dessus de 100 g
  assert.deepEqual(f(7, 'g', 1 / 3), { value: 2.5, unit: 'g', approx: true }); // levure : demi-gramme près
  assert.deepEqual(f(1, 'l', 0.5), { value: 50, unit: 'cl', approx: false });
  assert.deepEqual(f(80, 'cl', 2), { value: 1.6, unit: 'l', approx: false });
  assert.deepEqual(f(250, 'ml', 6), { value: 1.5, unit: 'l', approx: false });
  assert.deepEqual(f(2, 'tsp', 1.5), { value: 1, unit: 'tbsp', approx: false }); // 3 c. à café = 1 c. à soupe
  assert.deepEqual(f(1, 'tbsp', 0.5), { value: 1.5, unit: 'tsp', approx: false });
  assert.deepEqual(f(1, 'tsp', 0.1), { value: 0.25, unit: 'tsp', approx: true }); // jamais zéro
  assert.deepEqual(f(2, 'tbsp', 2), { value: 4, unit: 'tbsp', approx: false });
  assert.deepEqual(f(3, 'tbsp', 2), { value: 90, unit: 'ml', approx: false }); // au-delà de 4 c. à soupe : ml
  assert.deepEqual(f(2, 'pinch', 0.25), { value: 1, unit: 'pinch', approx: true });
  assert.throws(() => C.scaleIngredient({ name: 'x', qty: 1, unit: 'g' }, 0), /err\.factor/);
  assert.throws(() => C.scaleIngredient({ name: 'x', qty: 1, unit: 'g' }, 51), /err\.factor/);
});

test('facteur d\'après un ingrédient disponible', () => {
  assert.equal(C.factorFromIngredient(crepes, 0, '0,5', 'kg'), 2); // 500 g de farine pour 250 g
  assert.equal(C.factorFromIngredient(crepes, 2, '25', 'cl'), 0.5);
  assert.equal(C.factorFromIngredient(crepes, 1, '3', 'piece'), 0.75);
  assert.throws(() => C.factorFromIngredient(crepes, 0, '1', 'l'), /err\.dimMismatch/); // pas de conversion masse <-> volume
  assert.throws(() => C.factorFromIngredient(crepes, 6, '1', 'g'), /err\.ingredientTaste/);
  assert.throws(() => C.factorFromIngredient(crepes, 9, '1', 'g'), /err\.ingredientPick/);
  assert.throws(() => C.factorFromIngredient(crepes, 0, '1', 'g'), /err\.factor/);
  assert.throws(() => C.factorForServings(crepes, 0), /err\.servings/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const data = { recipes: [crepes] };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'recipescaler', version: 1, recipes: [crepes] };
  assert.throws(() => C.validateData({ ...ok, app: 'mealcalendar' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, more: true }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, recipes: [crepes, crepes] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, recipes: [{ ...crepes, ingredients: [{ name: 'x', qty: '1', unit: 'g' }] }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, recipes: [{ ...crepes, ingredients: [{ name: 'x', qty: 2, unit: 'taste' }] }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, recipes: [{ ...crepes, steps: null }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, recipes: [{ ...crepes, servings: 1.5 }] }), /err\.servings/);
  assert.throws(() => C.validateData([]), /err\.backup/);
});
