const test=require('node:test'),a=require('node:assert/strict'),C=require('../core.js');
const line=(o={})=>({label:'Consulting',quantity:'1.000',unitPrice:'100.00',vatRate:'20.00',...o});
const doc=(o={})=>({id:'doc-unit-test-001',type:'invoice',status:'draft',number:null,issueDate:'2026-10-26',serviceDate:'2026-10-20',dueDate:'2026-11-26',seller:{name:'Société Exemple',address:'Bordeaux, France',siren:'123456789',vat:'FR12345678901'},buyer:{name:'Client',address:'Paris, France',siren:'987654321',vat:''},purchaseOrder:'BC-123',nature:'services',deliveryAddress:'',conditions:'Échéance : 30 jours',exemption:'Base TVA à 0 % le cas échéant',notes:'',items:[line()],...o});
const s=(documents=[])=>({version:1,documents});
const add=(store,o={})=>C.put(store,doc({...o,id:'doc-unit-test-'+String(store.documents.length+1).padStart(3,'0')}));
test('100 € HT à 20 % => 120 € TTC en centimes exacts',()=>{const x=C.compute(doc());a.equal(x.ht,10000);a.equal(x.vat,2000);a.equal(x.ttc,12000);});
test('quantités à trois décimales, demi supérieur',()=>{const r=C.compute(doc({items:[line({quantity:'0.500',unitPrice:'0.01',vatRate:'0'})]}));a.equal(r.ht,1);});
test('TVA arrondie demi-supérieur au centime',()=>{const r=C.compute(doc({items:[line({quantity:'1',unitPrice:'0.10',vatRate:'5.00'})]}));a.equal(r.vat,1);});
test('TVA calculée par ligne et pas en groupe sur total',()=>{const r=C.compute(doc({items:[line({unitPrice:'0.03',vatRate:'20'}),line({unitPrice:'0.03',vatRate:'20'})]}));a.equal(r.ht,6);a.equal(r.vat,2);});
test('TVA à 0 donne TTC identique HT',()=>{const r=C.compute(doc({items:[line({unitPrice:'20.00',vatRate:'0'})]}));a.equal(r.ttc,r.ht);});
test('TVA 5,5 % accepte virgule',()=>{const r=C.compute(doc({items:[line({unitPrice:'100',vatRate:'5,5'})]}));a.equal(r.vat,550);});
test('TVA 10 % et 20 % réparties distinctement',()=>{const r=C.compute(doc({items:[line({vatRate:'10'}),line({vatRate:'20'})]}));a.equal(r.ht,20000);a.equal(r.vat,3000);a.equal(r.vatSummary.length,2);});
test('prix de zéro accepté pour ligne gratuite',()=>a.equal(C.compute(doc({items:[line({unitPrice:'0'})]})).ttc,0));
test('prix à plus de 2 décimales refusé',()=>a.throws(()=>C.compute(doc({items:[line({unitPrice:'0.001'})]})),/décimales/));
test('quantité à plus de 3 décimales refusée',()=>a.throws(()=>C.compute(doc({items:[line({quantity:'0.0001'})]})),/décimales/));
test('quantité zéro refusée',()=>a.throws(()=>C.item(line({quantity:'0'})),/positive/));
test('quantités négatives refusées',()=>a.throws(()=>C.item(line({quantity:'-1'})),/invalides|décimales/));
test('prix négatifs refusés',()=>a.throws(()=>C.item(line({unitPrice:'-10'})),/décimales/));
test('valeurs numériques non textuelles refusées',()=>a.throws(()=>C.item(line({unitPrice:12.34})),/décimales/));
test('NaN et Infinity refusés',()=>{for(const v of ['NaN','Infinity','1e6'])a.throws(()=>C.item(line({quantity:v})));});
test('montant au-delà de 100 millions € refusé',()=>a.throws(()=>C.compute(doc({items:Array(11).fill(line({unitPrice:'100000',quantity:'1000'}))})),/Montant total/));
test('61 lignes refusées',()=>a.throws(()=>C.draft(doc({items:Array(61).fill(line())})),/60 lignes/));
test('aucune ligne refusée',()=>a.throws(()=>C.draft(doc({items:[]})),/1 à 60/));
test('intitulé de ligne vide refusé',()=>a.throws(()=>C.item(line({label:'  '})),/obligatoire/));
test('notes et valeurs HTML préservées comme simple texte',()=>a.equal(C.draft(doc({notes:'<img src=x onerror=alert(1)>'})).notes,'<img src=x onerror=alert(1)>'));
test('schéma document rejette les propriétés inconnues',()=>a.throws(()=>C.draft({...doc(),admin:true}),/Document invalide/));
test('année bissextile valide',()=>a.equal(C.date('2028-02-29','Date',true),'2028-02-29'));
test('date 2026-02-29 impossible',()=>a.throws(()=>C.date('2026-02-29','Date',true),/invalide/));
test('format 2026/10/26 refusé',()=>a.throws(()=>C.date('2026/10/26','Date',true),/AAAA/));
test('échéance antérieure à émission refusée',()=>a.throws(()=>C.draft(doc({dueDate:'2026-10-25'})),/antérieure/));
test('SIREN incomplet refusé',()=>a.throws(()=>C.draft(doc({seller:{...doc().seller,siren:'123'}})),/9 chiffres/));
test('nature non prise en charge refusée',()=>a.throws(()=>C.draft(doc({nature:'transport'})),/Nature/));
test('brouillon avec numéro déjà attribué refusé',()=>a.throws(()=>C.draft(doc({number:'F-2026-0001'})),/brouillon/));
test('une copie verrouillée sans conditions ne passe pas',()=>a.throws(()=>C.draft(doc({status:'locked',number:'F-2026-0001',conditions:''})),/Pour verrouiller/));
test('copie facture verrouillée sans SIREN vendeur est refusée',()=>a.throws(()=>C.draft(doc({status:'locked',number:'F-2026-0001',seller:{...doc().seller,siren:''}})),/SIREN/));
test('TVA 0 sur copie verrouillée requiert une mention',()=>a.throws(()=>C.draft(doc({status:'locked',number:'F-2026-0001',items:[line({vatRate:'0'})],exemption:''})),/TVA à 0/));
test('numéro verrouillé cohérent avec type et année',()=>a.throws(()=>C.draft(doc({status:'locked',number:'D-2026-0001'})),/incohérent/));
test('bibliothèque vide versionnée valide',()=>a.deepEqual(C.store(s()),s()));
test('sauvegardes d’un autre schéma sont rejetées',()=>{for(const v of [null,{},[],{version:2,documents:[]},{version:1,documents:[],other:1}])a.throws(()=>C.store(v));});
test('identifiants dupliqués rejetés',()=>a.throws(()=>C.store(s([doc(),doc()])),/dupliqué/));
test('120 documents acceptés',()=>{
 const docs=Array.from({length:120},(_,i)=>doc({id:'doc-file-'+String(i).padStart(5,'0')}));
 a.equal(C.store(s(docs)).documents.length,120);
});
test('121 documents refusés',()=>a.throws(()=>C.store(s(Array.from({length:121},(_,i)=>doc({id:'doc-file-'+String(i).padStart(5,'0')})))),/120/));
test('enregistrement brouillon conserve ancien si autre id',()=>{
 const a1=add(s()),a2=add(a1,{type:'quote'});a.equal(a2.documents.length,2);a.equal(a1.documents.length,1);
});
test('édition brouillon remplace sans dupliquer',()=>{
 const a1=add(s()),newDoc={...a1.documents[0],notes:'Modifié'};
 const out=C.put(a1,newDoc);a.equal(out.documents.length,1);a.equal(out.documents[0].notes,'Modifié');
});
test('verrouillage crée F-2026-0001 et préserve le HT',()=>{
 const one=add(s()),locked=C.lock(one,one.documents[0].id);
 a.equal(locked.documents[0].number,'F-2026-0001');a.equal(locked.documents[0].status,'locked');a.equal(C.compute(locked.documents[0]).ht,10000);
});
test('deux factures suivent 0001 puis 0002',()=>{
 let x=add(s());x=C.lock(x,x.documents[0].id);
 x=add(x,{issueDate:'2026-10-27'});x=C.lock(x,x.documents[1].id);
 a.deepEqual(x.documents.map(z=>z.number),['F-2026-0001','F-2026-0002']);
});
test('numérotation devis indépendante des factures',()=>{
 let x=add(s());x=C.lock(x,x.documents[0].id);
 x=add(x,{type:'quote'});x=C.lock(x,x.documents[1].id);
 a.deepEqual(x.documents.map(z=>z.number),['F-2026-0001','D-2026-0001']);
});
test('nouvelle année redémarre la série affichée par année',()=>{
 let x=add(s());x=C.lock(x,x.documents[0].id);
 x=add(x,{issueDate:'2027-01-02',serviceDate:'2027-01-01',dueDate:'2027-02-01'});
 x=C.lock(x,x.documents[1].id);a.equal(x.documents[1].number,'F-2027-0001');
});
test('backdating après émission verrouillée refusé',()=>{
 let x=add(s());x=C.lock(x,x.documents[0].id);
 x=add(x,{issueDate:'2026-10-01',dueDate:'2026-11-01'});
 a.throws(()=>C.lock(x,x.documents[1].id),/chronologique/);
});
test('modifier version verrouillée refusé',()=>{
 let x=add(s());x=C.lock(x,x.documents[0].id);
 a.throws(()=>C.put(x,{...x.documents[0],status:'draft',number:null,notes:'fake'}),/verrouillé/);
});
test('supprimer une copie verrouillée refusé',()=>{
 let x=add(s());x=C.lock(x,x.documents[0].id);a.throws(()=>C.remove(x,x.documents[0].id),/verrouillé/);
});
test('supprimer brouillon fonctionne sans modifier l’ancien état',()=>{
 let x=add(s());const d=C.remove(x,x.documents[0].id);a.equal(d.documents.length,0);a.equal(x.documents.length,1);
});
test('suppression inconnue refusée',()=>a.throws(()=>C.remove(s(),'doc-not-found'),/introuvable/));
test('numérotation dupliquée lors de restauration refusée',()=>{
 const a1=C.lock(add(s()),'doc-unit-test-001').documents[0],a2={...a1,id:'doc-copy-02'};
 a.throws(()=>C.store(s([a1,a2])),/dupliquée/);
});
test('numéro manquant dans une série de restauration refusé',()=>{
 const d=C.lock(add(s()),'doc-unit-test-001').documents[0];
 a.throws(()=>C.store(s([{...d,number:'F-2026-0002'}])),/discontinue/);
});
test('série numérotée avec dates inversées refusée',()=>{
 const a1=C.lock(add(s()),'doc-unit-test-001').documents[0];
 const a2={...a1,id:'doc-copy-02',number:'F-2026-0002',issueDate:'2026-10-01'};
 a.throws(()=>C.store(s([a1,a2])),/chronologique/);
});
test('montant formaté correctement en euros français',()=>a.ok(C.money(123456).includes('1')));
test('montant non entier ou négatif refusé',()=>{for(const x of [-1,0.1,NaN])a.throws(()=>C.money(x));});
test('jamais de mutation de la bibliothèque d’origine après verrouillage',()=>{
 const x=add(s());const y=C.lock(x,x.documents[0].id);a.equal(x.documents[0].status,'draft');a.equal(y.documents[0].status,'locked');
});
