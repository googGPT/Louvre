// Tests métier de MealCalendar : quantités, plats, semaines, liste de courses agrégée, export, sauvegarde.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

const pasta = C.makeDish({ name: 'Pâtes tomate', servings: '4', ingredients: [
  { name: 'Pâtes', qty: '500', unit: 'g' }, { name: 'Tomates concassées', qty: '0,8', unit: 'kg' },
  { name: 'Oignon', qty: '1', unit: 'piece' }, { name: "Huile d'olive", qty: '2', unit: 'tbsp' }] }, 'dish-0001');
const salad = C.makeDish({ name: 'Salade de lentilles', servings: '2', ingredients: [
  { name: 'Lentilles', qty: '150', unit: 'g' }, { name: 'oignon ', qty: '1/2', unit: 'piece' }, { name: 'HUILE D\u2019OLIVE', qty: '1', unit: 'tbsp' },
  { name: 'Huile d\'olive', qty: '1', unit: 'tsp' }, { name: 'Oignon', qty: '20', unit: 'g' }] }, 'dish-0002');
const porridge = C.makeDish({ name: 'Porridge', servings: '1', ingredients: [{ name: 'Lait', qty: '25', unit: 'cl' }, { name: 'Avoine', qty: '40', unit: 'g' }] }, 'dish-0003');
const dishes = [pasta, salad, porridge];

test('quantités : décimales, virgule, fractions ; refus des valeurs absurdes', () => {
  assert.equal(C.parseQty('1,5'), 1.5);
  assert.equal(C.parseQty('1/3'), 0.333);
  assert.equal(C.parseQty(' 250 '), 250);
  for (const bad of ['0', '-1', 'abc', '1/0', '1.2345', '', '100000']) assert.throws(() => C.parseQty(bad), /^Error: err\.qty$/, bad);
  assert.equal(C.baseMilli(1.5, 'kg'), 1500000);
  assert.equal(C.baseMilli(2, 'tbsp'), 30000); // 2 × 15 ml
});

test('plats : validations strictes', () => {
  assert.equal(pasta.servings, 4);
  assert.deepEqual(pasta.ingredients[1], { name: 'Tomates concassées', qty: 0.8, unit: 'kg' });
  assert.throws(() => C.makeDish({ name: 'X', servings: 2, ingredients: [] }, 'dish-0009'), /err\.noIngredient/);
  assert.throws(() => C.makeDish({ name: ' ', servings: 2, ingredients: [{ name: 'a', qty: '1', unit: 'g' }] }, 'dish-0009'), /err\.nameRequired/);
  assert.throws(() => C.makeDish({ name: 'X', servings: 0, ingredients: [{ name: 'a', qty: '1', unit: 'g' }] }, 'dish-0009'), /err\.people/);
  assert.throws(() => C.makeDish({ name: 'X', servings: 2.5, ingredients: [{ name: 'a', qty: '1', unit: 'g' }] }, 'dish-0009'), /err\.people/);
  assert.throws(() => C.makeDish({ name: 'X', servings: 2, ingredients: [{ name: 'a', qty: '1', unit: 'oz' }] }, 'dish-0009'), /err\.unit/);
  assert.throws(() => C.makeDish({ name: 'X', servings: 2, ingredients: [{ name: '', qty: '1', unit: 'g' }] }, 'dish-0009'), /err\.ingredientName/);
  assert.throws(() => C.makeDish({ name: 'X'.repeat(61), servings: 2, ingredients: [{ name: 'a', qty: '1', unit: 'g' }] }, 'dish-0009'), /err\.nameLong/);
  assert.throws(() => C.makeDish({ name: 'X', servings: 2, ingredients: Array(41).fill({ name: 'a', qty: '1', unit: 'g' }) }, 'dish-0009'), /err\.tooManyIngredients/);
});

test('semaines : lundi, changement d\'heure et fin d\'année sans décalage', () => {
  assert.equal(C.weekStart('2026-10-25'), '2026-10-19'); // dimanche du passage à l'heure d'hiver
  assert.equal(C.weekStart('2026-10-26'), '2026-10-26');
  assert.equal(C.addDays('2026-12-28', 7), '2027-01-04');
  assert.deepEqual(C.weekDays('2026-03-23').slice(5), ['2026-03-28', '2026-03-29']);
  assert.throws(() => C.emptyPlan('2026-10-27'), /err\.week/);
  assert.throws(() => C.weekStart('2026-02-30'), /err\.date/);
});

test('menus : placer, remplacer, retirer un plat', () => {
  let plan = C.emptyPlan('2026-10-26');
  plan = C.setSlot(plan, 2, 'dinner', 'dish-0001', 4, dishes);
  plan = C.setSlot(plan, 0, 'lunch', 'dish-0002', 2, dishes);
  plan = C.setSlot(plan, 0, 'lunch', 'dish-0001', 3, dishes); // remplace
  assert.deepEqual(plan.slots.map((s) => [s.day, s.meal, s.dishId, s.people]), [[0, 'lunch', 'dish-0001', 3], [2, 'dinner', 'dish-0001', 4]]);
  assert.equal(C.setSlot(plan, 0, 'lunch', null, 0, dishes).slots.length, 1);
  assert.throws(() => C.setSlot(plan, 7, 'lunch', 'dish-0001', 2, dishes), /err\.slot/);
  assert.throws(() => C.setSlot(plan, 1, 'brunch', 'dish-0001', 2, dishes), /err\.slot/);
  assert.throws(() => C.setSlot(plan, 1, 'lunch', 'dish-9999', 2, dishes), /err\.dishUnknown/);
  assert.throws(() => C.setSlot(plan, 1, 'lunch', 'dish-0001', 51, dishes), /err\.people/);
});

test('liste de courses : mêmes ingrédients additionnés, unités converties, portions recalculées', () => {
  let plan = C.emptyPlan('2026-10-26');
  plan = C.setSlot(plan, 0, 'lunch', 'dish-0001', 2, dishes); // demi-recette de pâtes
  plan = C.setSlot(plan, 1, 'dinner', 'dish-0002', 4, dishes); // salade doublée
  for (let d = 0; d < 5; d++) plan = C.setSlot(plan, d, 'breakfast', 'dish-0003', 2, dishes);
  const items = C.shoppingList(plan, dishes);
  const get = (name, dim) => items.find((i) => i.key === `${C.norm(name)}|${dim}`);
  // Oignon en pièces : 1 × 2/4 + 0,5 × 4/2 = 1,5 ; oignon en grammes : ligne séparée (unités incompatibles).
  assert.deepEqual(C.displayQty(get('oignon', 'count')), { value: 1.5, unit: 'piece' });
  assert.deepEqual(C.displayQty(get('oignon', 'mass')), { value: 40, unit: 'g' });
  // Huile : 2 c. à soupe × 2/4 = 15 ml ; salade × 2 : (1 c. à soupe + 1 c. à café) × 2 = 40 ml ; total 55 ml, même avec deux apostrophes différentes.
  assert.equal(items.filter((i) => C.norm(i.name).startsWith('huile')).length, 1);
  assert.deepEqual(C.displayQty(get("huile d'olive", 'volume')), { value: 55, unit: 'ml' });
  // Lait : 25 cl × 2 personnes × 5 jours = 2,5 L, affiché en cl (unité unique d'origine).
  assert.deepEqual(C.displayQty(get('lait', 'volume')), { value: 250, unit: 'cl' });
  assert.deepEqual(C.displayQty(get('pates', 'mass')), { value: 250, unit: 'g' });
  assert.deepEqual(C.displayQty(get('tomates concassees', 'mass')), { value: 0.4, unit: 'kg' });
  assert.deepEqual(get('avoine', 'mass').dishes, ['Porridge']);
  assert.deepEqual(C.displayQty({ dim: 'mass', milli: 1200000, units: ['g'] }), { value: 1.2, unit: 'kg' }); // dès 1 kg
  assert.deepEqual(C.displayQty({ dim: 'volume', milli: 1500000, units: ['ml'] }), { value: 1.5, unit: 'l' });
  // Unités mélangées : conversion vers g/kg ou ml/L.
  assert.deepEqual(C.displayQty({ dim: 'volume', milli: 55000, units: ['tbsp', 'tsp'] }), { value: 55, unit: 'ml' });
  assert.deepEqual(C.displayQty({ dim: 'mass', milli: 1250000, units: ['g', 'kg'] }), { value: 1.25, unit: 'kg' });
  assert.deepEqual(C.displayQty({ dim: 'volume', milli: 2500000, units: ['ml', 'cl'] }), { value: 2.5, unit: 'l' });
});

test('mêmes apostrophes : huile additionnée sur une seule ligne', () => {
  const a = C.makeDish({ name: 'A', servings: 1, ingredients: [{ name: "Huile d'olive", qty: '2', unit: 'tbsp' }] }, 'dish-0010');
  const b = C.makeDish({ name: 'B', servings: 1, ingredients: [{ name: "huile d'olive", qty: '1', unit: 'tsp' }, { name: "Huile d'Olive", qty: '10', unit: 'ml' }] }, 'dish-0011');
  let plan = C.setSlot(C.setSlot(C.emptyPlan('2026-10-26'), 0, 'lunch', a.id, 1, [a, b]), 0, 'dinner', b.id, 1, [a, b]);
  const items = C.shoppingList(plan, [a, b]);
  assert.equal(items.length, 1);
  assert.deepEqual(C.displayQty(items[0]), { value: 45, unit: 'ml' }); // 30 + 5 + 10
  assert.deepEqual(items[0].dishes, ['A', 'B']);
});

test('export CSV : en-têtes et unités traduits, décimale choisie, case cochée', () => {
  let plan = C.setSlot(C.emptyPlan('2026-10-26'), 0, 'lunch', 'dish-0001', 2, dishes);
  const items = C.shoppingList(plan, dishes);
  const csv = C.shoppingCSV(items, { headers: ['Ingrédient', 'Quantité', 'Unité', 'Coché', 'Plats'], unitLabel: (u) => ({ piece: 'pièce(s)', tbsp: 'c. à soupe' }[u] || u), decimal: 'comma', yes: 'oui', no: 'non', checked: [C.ingredientKey('Oignon', 'piece')] });
  assert.ok(csv.startsWith('\ufeffIngrédient;Quantité;Unité;Coché;Plats\r\n'));
  assert.ok(csv.includes('Oignon;0,5;pièce(s);oui;Pâtes tomate\r\n'), csv);
  assert.ok(csv.includes('Tomates concassées;0,4;kg;non;Pâtes tomate'), csv);
  assert.ok(csv.includes("Huile d'olive;1;c. à soupe;non"), csv);
});

test('suppression d\'un plat : retiré des menus', () => {
  const plan = C.setSlot(C.setSlot(C.emptyPlan('2026-10-26'), 0, 'lunch', 'dish-0001', 2, dishes), 1, 'lunch', 'dish-0002', 2, dishes);
  assert.equal(C.countUses([plan], 'dish-0001'), 1);
  const next = C.removeDish({ dishes, plans: [plan] }, 'dish-0001');
  assert.deepEqual(next.dishes.map((d) => d.id), ['dish-0002', 'dish-0003']);
  assert.deepEqual(next.plans[0].slots.map((s) => s.dishId), ['dish-0002']);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const plan = { ...C.setSlot(C.emptyPlan('2026-10-26'), 0, 'lunch', 'dish-0001', 2, dishes), checked: ['oignon|count'] };
  const data = { dishes, plans: [plan] };
  assert.deepEqual(C.validateData(JSON.parse(C.backup(data))), data);
  const ok = { app: 'mealcalendar', version: 1, ...data };
  assert.throws(() => C.validateData({ ...ok, app: 'x' }), /err\.notBackup/);
  assert.throws(() => C.validateData({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, plans: [{ ...plan, week: '2026-10-27' }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, plans: [plan, plan] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, plans: [{ ...plan, slots: [{ ...plan.slots[0], dishId: 'dish-9999' }] }] }), /err\.dishUnknown/);
  assert.throws(() => C.validateData({ ...ok, plans: [{ ...plan, slots: [plan.slots[0], plan.slots[0]] }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, dishes: [{ ...pasta, ingredients: [{ name: 'x', qty: '1', unit: 'g' }] }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, dishes: [{ ...pasta, ingredients: [{ name: 'x', qty: 0.0001, unit: 'g' }] }] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, dishes: [pasta, pasta] }), /err\.backup/);
  assert.throws(() => C.validateData({ ...ok, dishes: [{ ...pasta, servings: 0 }] }), /err\.people/);
});
