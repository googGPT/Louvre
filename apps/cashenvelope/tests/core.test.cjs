// Tests métier de CashEnvelope : montants, enveloppes, report d'un mois sur l'autre, alertes, CSV, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const id = (p) => `${p}-${String(++n).padStart(4, '0')}`;
const env = (name, budget, rollover, fromMonth = '2026-09') => C.makeEnvelope({ name, budget, rollover, fromMonth }, id('env'));
function state(envelopes, expenses = [], income = '2000', alertPct = '80') {
  return { settings: C.makeSettings({ income, alertPct }), envelopes, expenses };
}
const spend = (envelopes, envelopeId, day, amount, note = '') => C.makeExpense({ envelopeId, day, amount, note }, id('exp'), envelopes);

test('montants saisis convertis en centimes, saisies ambiguës refusées', () => {
  assert.equal(C.parseCents('1 250,50'), 125050);
  assert.equal(C.parseCents('12.5'), 1250);
  assert.equal(C.parseCents('0', { zero: true }), 0);
  for (const bad of ['12,345', '-3', 'abc', '', '1e3']) assert.throws(() => C.parseCents(bad), /^Error: err\.amount$/);
  assert.throws(() => C.parseCents('0'), /err\.amountPositive/);
  assert.throws(() => C.parseCents('1000000'), /err\.amountBig/);
});

test('jours et mois civils, y compris années bissextiles', () => {
  assert.equal(C.validDay('2028-02-29'), true);
  assert.equal(C.validDay('2026-02-29'), false);
  assert.equal(C.validMonth('2026-13'), false);
  assert.equal(C.addMonths('2026-12', 1), '2027-01');
  assert.equal(C.addMonths('2026-01', -1), '2025-12');
  assert.equal(C.daysInMonth('2028-02'), 29);
  assert.throws(() => C.monthOf('2026-02-30'), /err\.day/);
});

test('répartition du revenu : non réparti et dépassement de répartition', () => {
  const envs = [env('Courses', '400', false), env('Logement', '900', false)];
  const s = C.monthSummary(state(envs, [], '1200'), '2026-10');
  assert.equal(s.allocatedCents, 130000);
  assert.equal(s.unallocatedCents, -10000);
  assert.equal(s.overAllocated, true);
  assert.equal(C.monthSummary(state(envs, [], '1500'), '2026-10').overAllocated, false);
  assert.equal(C.monthSummary(state(envs, [], ''), '2026-10').overAllocated, false); // revenu non saisi
});

test('report : le reste (ou le dépassement) passe au mois suivant seulement si le report est activé', () => {
  const food = env('Courses', '400', true), fun = env('Loisirs', '100', false);
  const envs = [food, fun];
  const xs = [
    spend(envs, food.id, '2026-09-10', '350'), // reste 50 en septembre
    spend(envs, fun.id, '2026-09-12', '30'), // reste 70, perdu (pas de report)
    spend(envs, food.id, '2026-10-02', '500'), // octobre : 400 + 50 = 450 disponibles, 500 dépensés
  ];
  const oct = C.monthSummary(state(envs, xs), '2026-10');
  const f = oct.rows.find((r) => r.id === food.id), l = oct.rows.find((r) => r.id === fun.id);
  assert.equal(f.carryCents, 5000);
  assert.equal(f.availableCents, 45000);
  assert.equal(f.balanceCents, -5000);
  assert.equal(f.status, 'over');
  assert.equal(l.carryCents, 0);
  assert.equal(l.balanceCents, 10000);
  // Novembre : le dépassement d'octobre réduit le budget de novembre.
  const nov = C.monthSummary(state(envs, xs), '2026-11').rows.find((r) => r.id === food.id);
  assert.equal(nov.carryCents, -5000);
  assert.equal(nov.availableCents, 35000);
  // Plusieurs mois sans dépense s'accumulent.
  assert.equal(C.monthSummary(state(envs, xs), '2027-01').rows.find((r) => r.id === food.id).carryCents, -5000 + 40000 + 40000);
});

test('alertes : seuil saisi, dépassement, enveloppe pas encore ouverte', () => {
  const a = env('Transport', '100', false, '2026-10'), b = env('Cadeaux', '50', false, '2026-11');
  const envs = [a, b];
  const xs = [spend(envs, a.id, '2026-10-05', '80')];
  const s = C.monthSummary(state(envs, xs, '2000', '80'), '2026-10');
  assert.deepEqual(s.rows.map((r) => r.name), ['Transport']); // Cadeaux commence en novembre
  assert.equal(s.rows[0].status, 'warn');
  assert.equal(s.rows[0].usedPct, 80);
  assert.equal(C.monthSummary(state(envs, xs, '2000', '90'), '2026-10').rows[0].status, 'ok');
  assert.deepEqual(s.alerts.map((x) => x.status), ['warn']);
  assert.throws(() => spend(envs, b.id, '2026-10-20', '10'), /err\.beforeEnvelope/);
  assert.throws(() => spend(envs, 'env-inconnue', '2026-10-20', '10'), /err\.envelopeUnknown/);
  assert.throws(() => C.makeSettings({ income: '1', alertPct: '0' }), /err\.alertPct/);
  assert.throws(() => C.makeSettings({ income: '1', alertPct: '101' }), /err\.alertPct/);
});

test('dépenses du mois triées et CSV sans formule exécutable', () => {
  const a = env('=Courses', '100', false);
  const envs = [a];
  const xs = [spend(envs, a.id, '2026-10-01', '10', 'pain'), spend(envs, a.id, '2026-10-20', '5,5', '+danger'), spend(envs, a.id, '2026-11-01', '1')];
  const st = state(envs, xs);
  assert.deepEqual(C.monthExpenses(st, '2026-10').map((x) => x.day), ['2026-10-20', '2026-10-01']);
  const csv = C.expensesCsv(st, '2026-10', ['Date', 'Enveloppe', 'Note', 'Montant']);
  assert.ok(csv.startsWith('\uFEFF"Date";"Enveloppe"'));
  assert.ok(csv.includes('"2026-10-20";"\'=Courses";"\'+danger";"5.50"'));
  const sum = C.summaryCsv(C.monthSummary(st, '2026-10'), ['a', 'b', 'c', 'd', 'e', 'f'], (s) => s.toUpperCase());
  assert.ok(sum.includes('"100.00";"0.00";"15.50";"84.50";"OK"'));
  assert.ok(C.summaryCsv(C.monthSummary(state([a], [spend([a], a.id, '2026-10-01', '120')]), '2026-10'), ['a', 'b', 'c', 'd', 'e', 'f']).includes('"-20.00"'));
  assert.throws(() => C.expensesCsv(st, '2026-10', ['x']), /err\.csv/);
});

test('saisies refusées : nom vide ou trop long, note trop longue, identifiant', () => {
  assert.throws(() => env('  ', '10', false), /err\.nameRequired/);
  assert.throws(() => env('x'.repeat(41), '10', false), /err\.nameLong/);
  assert.throws(() => C.makeEnvelope({ name: 'A', budget: '10', fromMonth: '2026-10' }, 'x'), /err\.id/);
  const a = env('A', '10', false);
  assert.throws(() => spend([a], a.id, '2026-10-01', '1', 'n'.repeat(81)), /err\.noteLong/);
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const a = env('Courses', '400', true), b = env('Loisirs', '100', false);
  const st = state([a, b], [spend([a, b], a.id, '2026-10-02', '12,30', 'marché')], '2000', '75');
  const json = JSON.parse(C.backup(st));
  assert.equal(json.app, 'cashenvelope');
  assert.deepEqual(C.validateBackup(json), st);
  const bad = (patch) => assert.throws(() => C.validateBackup({ ...json, ...patch }));
  assert.throws(() => C.validateBackup({ ...json, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...json, version: 2 }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...json, extra: 1 }), /err\.backup/);
  bad({ settings: { incomeCents: -1, alertPct: 80 } });
  bad({ settings: { incomeCents: 100, alertPct: 80.5 } });
  bad({ envelopes: [{ ...json.envelopes[0], rollover: 'oui' }, json.envelopes[1]] });
  bad({ envelopes: [json.envelopes[0], json.envelopes[0]] });
  bad({ expenses: [{ ...json.expenses[0], amountCents: 0 }] });
  bad({ expenses: [{ ...json.expenses[0], envelopeId: 'env-absente' }] });
  bad({ expenses: [{ ...json.expenses[0], day: '2026-02-30' }] });
  bad({ expenses: [{ ...json.expenses[0], day: '2026-08-31' }] }); // avant l'ouverture de l'enveloppe
  assert.throws(() => C.validateBackup({ ...json, envelopes: Array(31).fill(json.envelopes[0]) }), /err\.tooManyEnvelopes/);
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(C.emptyState()))), C.emptyState());
});
