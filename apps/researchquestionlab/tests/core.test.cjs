// Tests métier de ResearchQuestionLab : validation, références entre éléments, liste de contrôle, Markdown, sauvegardes.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

let n = 0;
const nid = (p) => `${p}-${String(++n).padStart(4, '0')}`;
const tr = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key); // traduction factice : la clé elle-même

function sample() {
  let p = C.emptyProject('proj-0001', 'ESG et coût du capital');
  p = C.update(p, {
    problem: 'Les investisseurs intègrent-ils réellement la durabilité dans le prix du risque ?',
    gap: 'Peu d\'études hors États-Unis', gapType: 'population', objective: 'Mesurer l\'effet des notes ESG',
    population: 'Entreprises cotées européennes', unit: 'Entreprise-année', periodStart: '2015', periodEnd: '2024', dataSource: 'Base commerciale', method: 'Panel à effets fixes',
  });
  p = C.saveQuestion(p, { text: 'Les notes ESG réduisent-elles le coût des fonds propres ?', kind: 'causal' }, 'q-000001');
  p = C.saveVariable(p, { name: 'Coût des fonds propres', role: 'dependent', measure: 'Modèle implicite', source: 'Prévisions d\'analystes' }, 'v-000001');
  p = C.saveVariable(p, { name: 'Note ESG', role: 'independent', measure: 'Score 0–100', source: 'Fournisseur ESG' }, 'v-000002');
  p = C.saveVariable(p, { name: 'Taille', role: 'control', measure: 'log(actif total)', source: 'Comptes annuels' }, 'v-000003');
  p = C.saveHypothesis(p, { questionId: 'q-000001', ivId: 'v-000002', dvId: 'v-000001', direction: 'negative', text: 'Une note ESG plus élevée est associée à un coût des fonds propres plus faible.' }, 'h-000001');
  return p;
}

test('projet vide : titre obligatoire, valeurs par défaut sûres', () => {
  const p = C.emptyProject('proj-0002', '  Mon projet ');
  assert.equal(p.title, 'Mon projet');
  assert.deepEqual(p.checks, { dataAccess: false, ethics: false, feasible: false });
  assert.equal(p.periodStart, null);
  assert.throws(() => C.emptyProject('proj-0003', ' '), /^Error: err\.titleRequired$/);
  assert.throws(() => C.emptyProject('x', 'A'), /err\.id/);
});

test('saisies refusées : énumérations, années, période inversée, longueurs, doublons', () => {
  const p = C.emptyProject('proj-0004', 'P');
  assert.throws(() => C.update(p, { gapType: 'autre' }), /err\.gapType/);
  assert.throws(() => C.update(p, { periodStart: '15' }), /^Error: err\.year\|\{"min":1800,"max":2100\}$/);
  assert.throws(() => C.update(p, { periodStart: '2024', periodEnd: '2015' }), /err\.period/);
  assert.throws(() => C.update(p, { problem: 'x'.repeat(3001) }), /^Error: err\.tooLong\|\{"max":3000\}$/);
  assert.throws(() => C.saveQuestion(p, { text: ' ', kind: 'causal' }, nid('q')), /err\.questionRequired/);
  assert.throws(() => C.saveQuestion(p, { text: 'Q ?', kind: 'magique' }, nid('q')), /err\.kind/);
  assert.throws(() => C.saveVariable(p, { name: 'X', role: 'cause' }, nid('v')), /err\.role/);
  const v = C.saveVariable(p, { name: 'Taille', role: 'control' }, nid('v'));
  assert.throws(() => C.saveVariable(v, { name: 'taille', role: 'dependent' }, nid('v')), /err\.variableDuplicate/);
  let many = p;
  for (let i = 0; i < C.LIMITS.questions; i += 1) many = C.saveQuestion(many, { text: `Q${i} ?`, kind: 'descriptive' }, nid('q'));
  assert.throws(() => C.saveQuestion(many, { text: 'Une de trop ?', kind: 'descriptive' }, nid('q')), /^Error: err\.tooManyQuestions\|\{"max":10\}$/);
});

test('hypothèses : question existante, variables existantes et distinctes', () => {
  const p = sample();
  assert.throws(() => C.saveHypothesis(p, { questionId: 'q-inconnue', ivId: '', dvId: '', direction: 'positive', text: 'H' }, nid('h')), /err\.hypothesisQuestion/);
  assert.throws(() => C.saveHypothesis(p, { questionId: 'q-000001', ivId: 'v-999999', dvId: '', direction: 'positive', text: 'H' }, nid('h')), /err\.unknownVariable/);
  assert.throws(() => C.saveHypothesis(p, { questionId: 'q-000001', ivId: 'v-000001', dvId: 'v-000001', direction: 'positive', text: 'H' }, nid('h')), /err\.sameVariable/);
  assert.throws(() => C.saveHypothesis(p, { questionId: 'q-000001', ivId: '', dvId: '', direction: 'bof', text: 'H' }, nid('h')), /err\.direction/);
  // Modifier un élément existant le remplace au lieu de l'ajouter.
  const edited = C.saveHypothesis(p, { questionId: 'q-000001', ivId: 'v-000002', dvId: 'v-000001', direction: 'positive', text: 'Autre sens' }, 'h-000001');
  assert.equal(edited.hypotheses.length, 1);
  assert.equal(edited.hypotheses[0].direction, 'positive');
});

test('suppressions en cascade : question -> hypothèses ; variable -> liens à refaire', () => {
  const p = sample();
  assert.equal(C.removeQuestion(p, 'q-000001').hypotheses.length, 0);
  const noIv = C.removeVariable(p, 'v-000002');
  assert.equal(noIv.variables.length, 2);
  assert.equal(noIv.hypotheses[0].ivId, '');
  const c = C.checklist(noIv).items.find((i) => i.key === 'hypothesisLinks');
  assert.deepEqual(c, { key: 'hypothesisLinks', status: 'warn', params: { n: 1 } });
});

test('liste de contrôle : projet vide, puis projet complet', () => {
  const empty = C.checklist(C.emptyProject('proj-0005', 'Vide'));
  assert.equal(empty.total, 20);
  assert.deepEqual(empty.items.filter((i) => i.status === 'ok').map((i) => i.key), ['hypotheses', 'hypothesisLinks', 'unusedVariables']);
  const full = sample();
  const c = C.checklist(full);
  const notOk = c.items.filter((i) => i.status !== 'ok').map((i) => i.key);
  assert.deepEqual(notOk, ['dataAccess', 'ethics', 'feasible']); // seuls les points à confirmer soi-même restent
  const done = C.checklist(C.update(full, { checks: { dataAccess: true, ethics: true, feasible: true } }));
  assert.equal(done.ok, done.total);
  assert.equal(done.pct, 100);
});

test('liste de contrôle : formes de question, variables non mesurées, hypothèses manquantes', () => {
  let p = sample();
  p = C.saveQuestion(p, { text: 'Effet de la taille du conseil', kind: 'relational' }, 'q-000002'); // pas de « ? » et pas d'hypothèse
  p = C.saveVariable(p, { name: 'Taille du conseil', role: 'independent', measure: '', source: '' }, 'v-000004');
  const by = Object.fromEntries(C.checklist(p).items.map((i) => [i.key, i]));
  assert.deepEqual(by.questionForm, { key: 'questionForm', status: 'warn', params: { n: 1 } });
  assert.deepEqual(by.measures, { key: 'measures', status: 'warn', params: { n: 1 } });
  assert.deepEqual(by.sources, { key: 'sources', status: 'warn', params: { n: 1 } });
  assert.deepEqual(by.hypotheses, { key: 'hypotheses', status: 'todo', params: { n: 1 } });
  assert.deepEqual(by.unusedVariables, { key: 'unusedVariables', status: 'warn', params: { n: 1 } }); // la taille (contrôle) ne compte pas
  // Le point d'interrogation arabe est reconnu.
  const ar = C.saveQuestion(C.emptyProject('proj-0006', 'ع'), { text: 'هل تؤثر الحوكمة في الأداء؟', kind: 'descriptive' }, 'q-000003');
  assert.equal(C.checklist(ar).items.find((i) => i.key === 'questionForm').status, 'ok');
  // Une période à moitié remplie est à revoir ; une question descriptive n'exige pas d'hypothèse.
  assert.equal(C.checklist(C.update(ar, { periodStart: '2010' })).items.find((i) => i.key === 'period').status, 'warn');
  assert.equal(C.checklist(ar).items.find((i) => i.key === 'hypotheses').status, 'ok');
});

test('export Markdown : sections, tableau des variables, hypothèses reliées, cases cochées', () => {
  const md = C.toMarkdown(sample(), tr);
  assert.ok(md.startsWith('# ESG et coût du capital\n\n## md.problem\n\nLes investisseurs'));
  assert.ok(md.includes('**gap.population** — Peu d\'études hors États-Unis'));
  assert.ok(md.includes('1. **Q1** (kind.causal) Les notes ESG réduisent-elles le coût des fonds propres ?'));
  assert.ok(md.includes('| Note ESG | role.independent | Score 0–100 | Fournisseur ESG |'));
  assert.ok(md.includes('- **H1** (Q1) Une note ESG plus élevée'));
  assert.ok(md.includes('Note ESG → Coût des fonds propres · dir.negative'));
  assert.ok(md.includes('- **md.period** : 2015–2024'));
  assert.ok(md.includes('md.score{"ok":17,"total":20}'));
  assert.ok(md.includes('- [x] chk.problem') && md.includes('- [ ] chk.ethics'));
  assert.ok(C.toMarkdown(C.emptyProject('proj-0007', 'Vide'), tr).includes('_md.empty_'));
});

test('sauvegarde : aller-retour exact et contenus refusés', () => {
  const projects = [sample(), C.emptyProject('proj-0008', 'Second')];
  assert.deepEqual(C.validateBackup(JSON.parse(C.backup(projects))), projects);
  const ok = { app: 'researchquestionlab', version: 1, projects };
  const p0 = projects[0];
  assert.throws(() => C.validateBackup({ ...ok, app: 'autre' }), /err\.notBackup/);
  assert.throws(() => C.validateBackup({ ...ok, extra: 1 }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...p0, extra: 1 }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...p0, periodStart: '2015' }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...p0, checks: { ethics: 'oui' } }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...p0, hypotheses: [{ ...p0.hypotheses[0], questionId: 'q-perdue' }] }] }), /err\.hypothesisQuestion/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [{ ...p0, variables: [{ ...p0.variables[0], hack: 1 }] }] }), /err\.backup/);
  assert.throws(() => C.validateBackup({ ...ok, projects: [p0, p0] }), /err\.backup/);
});
