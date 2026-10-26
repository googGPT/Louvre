/* InvoiceCanvas: deterministic integer-cent estimates, local drafts and immutable snapshots.
   No legal or fiscal certification; deliberate exclusions documented in README. */
(function(root){'use strict';
const MAX_DOCUMENTS=120,MAX_ITEMS=60,MAX_STORAGE=700000,MAX_TEXT=3000;
const TYPES=Object.freeze(['quote','invoice']);
const FIELDS=Object.freeze(['id','type','status','number','issueDate','serviceDate','dueDate','seller','buyer','purchaseOrder','nature','deliveryAddress','conditions','exemption','notes','items']);
const COMPANY=Object.freeze(['name','address','siren','vat']);
const ITEM=Object.freeze(['label','quantity','unitPrice','vatRate']);
const enc=new TextEncoder();
function fail(message){throw Error(message);}
function str(v,label,required=false,max=MAX_TEXT){
 if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(v))fail(label+' : texte invalide ou trop long');
 const t=v.trim();if(required&&!t)fail(label+' obligatoire');return t;
}
function fixed(v,places,max,label){
 if(typeof v!=='string'||!new RegExp('^\\d{1,6}(?:[.,]\\d{1,'+places+'})?$').test(v.trim()))fail(label+' : décimales invalides');
 const p=v.trim().replace(',','.').split('.');
 const n=Number(p[0])*10**places+Number((p[1]||'').padEnd(places,'0'));
 if(!Number.isSafeInteger(n)||n>max)fail(label+' : valeur hors limites');
 return n;
}
function plain(value,scale){return (value/scale).toFixed(Math.log10(scale));}
function date(value,label,required=false){
 if(value===''&&!required)return '';
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(label+' : date AAAA-MM-JJ requise');
 const [y,m,d]=value.split('-').map(Number);
 const x=new Date(Date.UTC(y,m-1,d));
 if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d||y<2000||y>2100)fail(label+' : date calendaire invalide');
 return value;
}
function entity(v,label){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!COMPANY.includes(k)))fail(label+' : identité invalide');
 const out={};
 for(const key of COMPANY)out[key]=str(v[key]??'',label+' '+key);
 if(out.siren&&!/^\d{9}$/.test(out.siren))fail(label+' : SIREN doit comporter 9 chiffres');
 return out;
}
function item(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!ITEM.includes(k)))fail('Ligne invalide');
 const label=str(raw.label,'Désignation',true,300);
 const quantity=plain(fixed(raw.quantity,3,1000000,'Quantité'),1000);
 if(Number(quantity)===0)fail('Quantité : valeur strictement positive');
 const unitPrice=plain(fixed(raw.unitPrice,2,10000000,'Prix HT'),100);
 const vatRate=plain(fixed(raw.vatRate,2,10000,'TVA'),100);
 return {label,quantity,unitPrice,vatRate};
}
function draft(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!FIELDS.includes(k)))fail('Document invalide');
 if(typeof raw.id!=='string'||!/^doc-[a-zA-Z0-9-]{6,80}$/.test(raw.id))fail('Identifiant de document invalide');
 if(!TYPES.includes(raw.type)||!['draft','locked'].includes(raw.status))fail('Type ou état invalide');
 if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>MAX_ITEMS)fail('Le document doit contenir de 1 à 60 lignes');
 const issueDate=date(raw.issueDate,'Date d’émission',true);
 const serviceDate=date(raw.serviceDate||'','Date de réalisation');
 const dueDate=date(raw.dueDate||'','Date d’échéance');
 if(dueDate&&dueDate<issueDate)fail('Échéance antérieure à la date d’émission');
 const out={id:raw.id,type:raw.type,status:raw.status,number:raw.number,issueDate,serviceDate,dueDate,
  seller:entity(raw.seller,'Vendeur'),buyer:entity(raw.buyer,'Client'),
  purchaseOrder:str(raw.purchaseOrder??'','Bon de commande',false,120),
  nature:str(raw.nature??'','Nature des opérations',false,40),
  deliveryAddress:str(raw.deliveryAddress??'','Adresse de livraison'),
  conditions:str(raw.conditions??'','Conditions de règlement'),
  exemption:str(raw.exemption??'','Justificatif de TVA à 0 %'),
  notes:str(raw.notes??'','Notes'),items:raw.items.map(item)};
 if(!['goods','services','mixed',''].includes(out.nature))fail('Nature des opérations invalide');
 if(out.status==='draft'&&out.number!==null)fail('Un brouillon ne doit pas posséder de numéro attribué');
 if(out.status==='locked'&&!/^((?:F|D)-\d{4}-\d{4})$/.test(out.number||''))fail('Numéro verrouillé invalide');
 if(out.status==='locked'){
  if(!out.seller.name||!out.seller.address||!out.buyer.name||!out.buyer.address||!out.serviceDate||!out.dueDate||!out.conditions||!out.nature)
   fail('Pour verrouiller : identité/adresse des parties, dates, nature et conditions de paiement requises');
  if(out.type==='invoice'&&!out.seller.siren)fail('Facture : SIREN vendeur requis pour ce modèle français');
  if(out.items.some(x=>Number(x.vatRate)===0)&&!out.exemption)
   fail('TVA à 0 % : précisez le fondement ou la mention adaptée à votre régime');
  const prefix=out.type==='invoice'?'F':'D';
  if(!out.number.startsWith(prefix+'-'+issueDate.slice(0,4)+'-'))fail('Numéro incohérent avec type et année');
 }
 compute(out);
 return out;
}
function compute(raw){
 if(!raw||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>MAX_ITEMS)fail('Lignes de document invalides');
 let totalHT=0,totalVAT=0;const rates=new Map();
 const lines=raw.items.map((v,i)=>{
  const x=item(v);
  const q=fixed(x.quantity,3,1000000,'Quantité');
  const unit=fixed(x.unitPrice,2,10000000,'Prix HT');
  const rate=fixed(x.vatRate,2,10000,'TVA');
  // Maximum per-line product 10^13 < Number.MAX_SAFE_INTEGER. Half-up to cents.
  const ht=Math.floor((q*unit+500)/1000);
  const vat=Math.floor((ht*rate+5000)/10000);
  if(!Number.isSafeInteger(ht)||!Number.isSafeInteger(vat))fail('Montant trop important');
  totalHT+=ht;totalVAT+=vat;
  if(totalHT>1e10||totalVAT>1e10)fail('Montant total au-delà de la limite (100 millions €)');
  const key=x.vatRate;const previous=rates.get(key)||{rate:key,ht:0,vat:0};
  previous.ht+=ht;previous.vat+=vat;rates.set(key,previous);
  return {label:x.label,quantity:x.quantity,unitPrice:x.unitPrice,vatRate:key,ht,vat,ttc:ht+vat,index:i+1};
 });
 return {lines,ht:totalHT,vat:totalVAT,ttc:totalHT+totalVAT,vatSummary:[...rates.values()].sort((a,b)=>Number(a.rate)-Number(b.rate))};
}
function store(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!Array.isArray(value.documents)||Object.keys(value).some(k=>!['version','documents'].includes(k)))fail('Sauvegarde v1 invalide');
 if(value.documents.length>MAX_DOCUMENTS)fail('120 documents maximum');
 const ids=new Set(),seqs=new Map(),result=[];
 for(const source of value.documents){
  const d=draft(source);
  if(ids.has(d.id))fail('Identifiant de document dupliqué');ids.add(d.id);
  if(d.status==='locked'){
   const [prefix,year,n]=d.number.split('-');const key=prefix+'-'+year;
   const existing=seqs.get(key)||new Map();
   const seq=Number(n);
   if(seq<1||existing.has(seq))fail('Numérotation dupliquée/invalide : '+d.number);
   existing.set(seq,d.issueDate);seqs.set(key,existing);
  }
  result.push(d);
 }
 for(const [series,nums] of seqs){
  const sorted=[...nums].sort((a,b)=>a[0]-b[0]);let previous='';
  sorted.forEach(([n,d],i)=>{
   if(n!==i+1)fail('Numérotation locale discontinue : '+series);
   if(previous&&d<previous)fail('Date non chronologique dans la série '+series);
   previous=d;
  });
 }
 const clean={version:1,documents:result};
 if(enc.encode(JSON.stringify(clean)).length>MAX_STORAGE)fail('Sauvegarde trop volumineuse (700 Ko)');
 return clean;
}
function put(existing,newDoc){
 const old=store(existing),d=draft(newDoc);const at=old.documents.findIndex(x=>x.id===d.id);
 if(d.status!=='draft')fail('Enregistrement direct d’une version verrouillée interdit');
 if(at>=0&&old.documents[at].status==='locked')fail('Document verrouillé : modification interdite');
 const documents=[...old.documents];
 if(at>=0)documents[at]=d;else documents.push(d);
 return store({version:1,documents});
}
function remove(existing,id){
 const old=store(existing),found=old.documents.find(d=>d.id===id);
 if(!found)fail('Document introuvable');
 if(found.status==='locked')fail('Document verrouillé : suppression interdite');
 return store({version:1,documents:old.documents.filter(d=>d.id!==id)});
}
function lock(existing,id){
 const old=store(existing);const d=old.documents.find(x=>x.id===id);
 if(!d||d.status!=='draft')fail('Brouillon enregistré introuvable');
 const year=d.issueDate.slice(0,4),prefix=d.type==='invoice'?'F':'D';
 const prior=old.documents.filter(x=>x.status==='locked'&&x.type===d.type);
 const latest=prior.reduce((m,x)=>x.issueDate>m?x.issueDate:m,'');
 if(latest&&d.issueDate<latest)fail('Date antérieure à un document verrouillé existant : ordre chronologique refusé');
 const relevant=prior.filter(x=>x.number.startsWith(prefix+'-'+year+'-'));
 const number=prefix+'-'+year+'-'+String(relevant.length+1).padStart(4,'0');
 const locked=draft({...d,status:'locked',number});
 return store({version:1,documents:old.documents.map(x=>x.id===id?locked:x)});
}
function money(cents){
 if(!Number.isSafeInteger(cents)||cents<0)fail('Montant en centimes invalide');
 return (cents/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
}
const empty=Object.freeze({version:1,documents:[]});
root.InvoiceCore=Object.freeze({MAX_DOCUMENTS,MAX_ITEMS,MAX_STORAGE,TYPES,empty,fixed,plain,date,item,draft,compute,store,put,remove,lock,money});
if(typeof module!=='undefined'&&module.exports)module.exports=root.InvoiceCore;
})(typeof window==='undefined'?globalThis:window);
