import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Exécuter les véritables fonctions embarquées dans index.html, pas une copie.
// La fin UI est remplacée par une exposition temporaire dans le VM du test.
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(appDir, 'index.html'), 'utf8');
const htmlHtm = readFileSync(resolve(appDir, 'index.htm'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
// Mécanisme multilingue et textes, chargés avant le script de la page (comme dans index.html).
const i18n = readFileSync(resolve(appDir, 'louvre-i18n.js'), 'utf8');
const messages = readFileSync(resolve(appDir, 'messages.js'), 'utf8');
const end = '    render();\n    if(!state.configured)settingsOpen();';
const expose = `    globalThis.__test__={validateBackup,calculateBudget,purchaseScenario,defaultState,persist,totals,getState:()=>state,getLocalOK:()=>localOK};`;
assert.ok(script?.includes(end), 'Attendu : fin du script de production');

function contextWith(stored = null, options = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { textContent: '', hidden: true, value: '', classList: {add(){},remove(){},toggle(){}}, addEventListener(){} });
    return elements.get(id);
  }
  const storage = new Map(stored === null ? [] : [['moneyuntil:v1', stored]]);
  let writes = 0;
  const localStorage = {
    getItem(k) {if(options.blocked) throw Error('blocked');return storage.get(k)??null},
    setItem(k,v) {if(options.blocked) throw Error('blocked');writes++;storage.set(k,String(v))}
  };
  const sandbox = {document: {getElementById:element,querySelectorAll(){return []},querySelector(){return null},documentElement:{}},localStorage,
    navigator:{languages:['fr-FR']},crypto:{randomUUID(){return 'generated-id'}},setTimeout(){},clearTimeout(){},Intl,Date,URL,console};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(i18n,sandbox,{timeout:2000});
  vm.runInContext(messages,sandbox,{timeout:2000});
  vm.runInContext(script.replace(end,expose),sandbox,{timeout:2000});
  return {api:sandbox.__test__,storage,element,writes:()=>writes};
}
const initial = () => ({version:1,configured:true,balance:1200,payday:'2026-11-04',reserve:100,currency:'EUR',
  expenses:[{id:'expense1',label:'Course',amount:50,date:'2026-10-25',category:'courses'}],
  bills:[{id:'bill1',label:'Électricité',amount:300,date:'2026-10-29',paid:false}]});
const asOf='2026-10-25';

test('index.htm et index.html : exactement le même code, sans librairie payante', () => {
  assert.equal(html,htmlHtm);
  const sources=[...html.matchAll(/<script\s+src="([^"]+)"/gi)].map(m=>m[1]);
  assert.deepEqual(sources,['./louvre-i18n.js','./messages.js']); // seulement les fichiers locaux du mécanisme multilingue
  assert.ok(!/https:\/\/[^"\s]*\.(js|css)/i.test(html));
});

test('budget libre à 750 € et budget prudent à 75 €/jour sur 10 jours', () => {
  const {api}=contextWith();const b=api.calculateBudget(initial(),asOf);
  assert.equal(b.balance,1150);assert.equal(b.upcoming,300);assert.equal(b.free,750);assert.equal(b.days,10);assert.equal(b.daily,75);
});

test('payer une échéance la déduit une fois et pas deux', () => {
  const {api}=contextWith();const a=initial();const before=api.calculateBudget(a,asOf);a.bills[0].paid=true;
  const after=api.calculateBudget(a,asOf);
  assert.equal(after.balance,850);assert.equal(after.upcoming,0);assert.equal(after.free,before.free);
});

test('les centimes additionnés ne dérivent pas avec les flottants', () => {
  const {api}=contextWith();const a=initial();a.balance=1;a.reserve=0;a.bills=[];
  a.expenses=[0.1,0.2].map((amount,i)=>({id:String(i),label:'Petit achat',amount,date:asOf,category:'autre'}));
  assert.equal(api.calculateBudget(a,asOf).free,0.7);
});

test('le budget quotidien est arrondi vers le bas au centime', () => {
  const {api}=contextWith();const a=initial();a.balance=1;a.reserve=0;a.bills=[];a.expenses=[];
  assert.equal(api.calculateBudget(a,'2026-11-01').daily,0.33);
});

test('les dépenses après la prochaine paie ne sont pas réservées comme échéances', () => {
  const {api}=contextWith();const a=initial();a.bills[0].date='2026-11-15';
  assert.equal(api.calculateBudget(a,asOf).upcoming,0);
});

test('date de paie dépassée : pas de budget quotidien fabriqué', () => {
  const {api}=contextWith();assert.equal(api.calculateBudget(initial(),'2026-11-05').daily,0);
});

test('simulateur : annonce le nouveau budget sans modifier les données', () => {
  const {api}=contextWith();const a=initial();const prior=JSON.stringify(a);
  const p=api.purchaseScenario(a,asOf,45);
  assert.equal(p.remaining,705);assert.equal(p.daily,70.5);assert.equal(JSON.stringify(a),prior);
});

test('simulateur : signale un dépassement et n’accepte pas de montant négatif', () => {
  const {api}=contextWith();const a=initial();
  assert.equal(api.purchaseScenario(a,asOf,1000).remaining,-250);
  assert.equal(api.purchaseScenario(a,asOf,-5),null);
  assert.equal(api.purchaseScenario(a,asOf,1.001),null);
});

test('une sauvegarde v1 existante reste lisible', () => {
  const a=initial(),{api}=contextWith(JSON.stringify(a));
  assert.equal(api.getState().configured,true);
  assert.equal(api.totals().free,750);
});

test('validation : champs inconnus, faux montant et clés de prototype refusés', () => {
  const {api}=contextWith();const a=initial();assert.equal(api.validateBackup(a),true);
  const altered=structuredClone(a);altered.bills[0].someNewField='injected';assert.equal(api.validateBackup(altered),false);
  const altered2=structuredClone(a);altered2.expenses[0].category='__proto__';assert.equal(api.validateBackup(altered2),false);
  const altered3=structuredClone(a);altered3.expenses[0].amount=0.123;assert.equal(api.validateBackup(altered3),false);
});

test('validation : mauvais schéma et date impossible rejetés', () => {
  const {api}=contextWith();const a=initial();a.version=999;assert.equal(api.validateBackup(a),false);
  a.version=1;a.payday='2026-02-30';assert.equal(api.validateBackup(a),false);
});

test('un JSON local corrompu reste intact, pas de réécriture silencieuse', () => {
  const {api,storage,writes,element}=contextWith('{ invalid json');
  assert.equal(api.getLocalOK(),false);
  assert.equal(writes(),0);
  assert.equal(api.persist(),false);
  assert.equal(storage.get('moneyuntil:v1'),'{ invalid json');
  assert.equal(element('storage-alert').hidden,false);
});

test('stockage bloqué : calculs possibles mais avertissement affiché', () => {
  const {api,element}=contextWith(null,{blocked:true});
  assert.equal(api.getLocalOK(),false);
  assert.equal(api.persist(true),false);
  assert.equal(api.calculateBudget(initial(),asOf).daily,75);
  assert.equal(element('storage-alert').hidden,false);
});

test('restauration explicite après JSON corrompu peut rétablir le stockage', () => {
  const {api,storage}=contextWith('corrupted');
  assert.equal(api.persist(),false);
  assert.equal(api.persist(true),true);
  assert.equal(api.getLocalOK(),true);
  assert.equal(JSON.parse(storage.get('moneyuntil:v1')).version,1);
});

test('les erreurs de stockage sont des clés traduites, pas du texte en dur', () => {
  const {element}=contextWith('{ invalid json');
  assert.match(element('storage-alert').textContent,/illisible/);
});

test('une sauvegarde v1 dans une devise d’origine (TND) reste lisible ; une devise inconnue est refusée', () => {
  const {api}=contextWith();const a=initial();a.currency='TND';assert.equal(api.validateBackup(a),true);
  a.currency='XYZ';assert.equal(api.validateBackup(a),false);
});
