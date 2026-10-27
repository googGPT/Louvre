/* InvoiceCanvas: deterministic integer-cent estimates, local drafts and immutable snapshots.
   No legal or fiscal certification; deliberate exclusions documented in README. */
(function(root){'use strict';
const MAX_DOCUMENTS=120,MAX_ITEMS=60,MAX_STORAGE=700000,MAX_TEXT=3000;
const TYPES=Object.freeze(['quote','invoice']);
const FIELDS=Object.freeze(['id','type','status','number','issueDate','serviceDate','dueDate','seller','buyer','purchaseOrder','nature','deliveryAddress','conditions','exemption','notes','items']);
const COMPANY=Object.freeze(['name','address','siren','vat']);
const ITEM=Object.freeze(['label','quantity','unitPrice','vatRate']);
const enc=new TextEncoder();
// Errors carry a translation key, optionally followed by JSON parameters after « | » ({field} is a field code
// translated by the interface): e.g. err.decimals|{"field":"unitPrice"}.
function fail(key,params){throw Error(params?key+'|'+JSON.stringify(params):key);}
function str(v,label,required=false,max=MAX_TEXT){
 if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(v))fail('err.text',{field:label});
 const t=v.trim();if(required&&!t)fail('err.required',{field:label});return t;
}
function fixed(v,places,max,label){
 if(typeof v!=='string'||!new RegExp('^\\d{1,6}(?:[.,]\\d{1,'+places+'})?$').test(v.trim()))fail('err.decimals',{field:label});
 const p=v.trim().replace(',','.').split('.');
 const n=Number(p[0])*10**places+Number((p[1]||'').padEnd(places,'0'));
 if(!Number.isSafeInteger(n)||n>max)fail('err.range',{field:label});
 return n;
}
function plain(value,scale){return (value/scale).toFixed(Math.log10(scale));}
function date(value,label,required=false){
 if(value===''&&!required)return '';
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('err.dateFormat',{field:label});
 const [y,m,d]=value.split('-').map(Number);
 const x=new Date(Date.UTC(y,m-1,d));
 if(x.getUTCFullYear()!==y||x.getUTCMonth()!==m-1||x.getUTCDate()!==d||y<2000||y>2100)fail('err.dateInvalid',{field:label});
 return value;
}
function entity(v,label){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!COMPANY.includes(k)))fail('err.entity',{field:label});
 const out={};
 for(const key of COMPANY)out[key]=str(v[key]??'',label+'.'+key);
 if(out.siren&&!/^\d{9}$/.test(out.siren))fail('err.siren',{field:label});
 return out;
}
function item(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!ITEM.includes(k)))fail('err.line');
 const label=str(raw.label,'label',true,300);
 const quantity=plain(fixed(raw.quantity,3,1000000,'quantity'),1000);
 if(Number(quantity)===0)fail('err.qtyPositive');
 const unitPrice=plain(fixed(raw.unitPrice,2,10000000,'unitPrice'),100);
 const vatRate=plain(fixed(raw.vatRate,2,10000,'vatRate'),100);
 return {label,quantity,unitPrice,vatRate};
}
function draft(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!FIELDS.includes(k)))fail('err.document');
 if(typeof raw.id!=='string'||!/^doc-[a-zA-Z0-9-]{6,80}$/.test(raw.id))fail('err.docId');
 if(!TYPES.includes(raw.type)||!['draft','locked'].includes(raw.status))fail('err.typeStatus');
 if(!Array.isArray(raw.items)||!raw.items.length||raw.items.length>MAX_ITEMS)fail('err.lineCount',{max:MAX_ITEMS});
 const issueDate=date(raw.issueDate,'issueDate',true);
 const serviceDate=date(raw.serviceDate||'','serviceDate');
 const dueDate=date(raw.dueDate||'','dueDate');
 if(dueDate&&dueDate<issueDate)fail('err.dueBefore');
 const out={id:raw.id,type:raw.type,status:raw.status,number:raw.number,issueDate,serviceDate,dueDate,
  seller:entity(raw.seller,'seller'),buyer:entity(raw.buyer,'buyer'),
  purchaseOrder:str(raw.purchaseOrder??'','purchaseOrder',false,120),
  nature:str(raw.nature??'','nature',false,40),
  deliveryAddress:str(raw.deliveryAddress??'','deliveryAddress'),
  conditions:str(raw.conditions??'','conditions'),
  exemption:str(raw.exemption??'','exemption'),
  notes:str(raw.notes??'','notes'),items:raw.items.map(item)};
 if(!['goods','services','mixed',''].includes(out.nature))fail('err.nature');
 if(out.status==='draft'&&out.number!==null)fail('err.draftNumber');
 if(out.status==='locked'&&!/^((?:F|D)-\d{4}-\d{4})$/.test(out.number||''))fail('err.lockedNumber');
 if(out.status==='locked'){
  if(!out.seller.name||!out.seller.address||!out.buyer.name||!out.buyer.address||!out.serviceDate||!out.dueDate||!out.conditions||!out.nature)
   fail('err.lockRequired');
  if(out.type==='invoice'&&!out.seller.siren)fail('err.sirenRequired');
  if(out.items.some(x=>Number(x.vatRate)===0)&&!out.exemption)
   fail('err.zeroVat');
  const prefix=out.type==='invoice'?'F':'D';
  if(!out.number.startsWith(prefix+'-'+issueDate.slice(0,4)+'-'))fail('err.numberMismatch');
 }
 compute(out);
 return out;
}
function compute(raw){
 if(!raw||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>MAX_ITEMS)fail('err.lines');
 let totalHT=0,totalVAT=0;const rates=new Map();
 const lines=raw.items.map((v,i)=>{
  const x=item(v);
  const q=fixed(x.quantity,3,1000000,'quantity');
  const unit=fixed(x.unitPrice,2,10000000,'unitPrice');
  const rate=fixed(x.vatRate,2,10000,'vatRate');
  // Maximum per-line product 10^13 < Number.MAX_SAFE_INTEGER. Half-up to cents.
  const ht=Math.floor((q*unit+500)/1000);
  const vat=Math.floor((ht*rate+5000)/10000);
  if(!Number.isSafeInteger(ht)||!Number.isSafeInteger(vat))fail('err.tooLarge');
  totalHT+=ht;totalVAT+=vat;
  if(totalHT>1e10||totalVAT>1e10)fail('err.totalLimit');
  const key=x.vatRate;const previous=rates.get(key)||{rate:key,ht:0,vat:0};
  previous.ht+=ht;previous.vat+=vat;rates.set(key,previous);
  return {label:x.label,quantity:x.quantity,unitPrice:x.unitPrice,vatRate:key,ht,vat,ttc:ht+vat,index:i+1};
 });
 return {lines,ht:totalHT,vat:totalVAT,ttc:totalHT+totalVAT,vatSummary:[...rates.values()].sort((a,b)=>Number(a.rate)-Number(b.rate))};
}
function store(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||!Array.isArray(value.documents)||Object.keys(value).some(k=>!['version','documents'].includes(k)))fail('err.backup');
 if(value.documents.length>MAX_DOCUMENTS)fail('err.maxDocs',{max:MAX_DOCUMENTS});
 const ids=new Set(),seqs=new Map(),result=[];
 for(const source of value.documents){
  const d=draft(source);
  if(ids.has(d.id))fail('err.dupId');ids.add(d.id);
  if(d.status==='locked'){
   const [prefix,year,n]=d.number.split('-');const key=prefix+'-'+year;
   const existing=seqs.get(key)||new Map();
   const seq=Number(n);
   if(seq<1||existing.has(seq))fail('err.dupNumber',{number:d.number});
   existing.set(seq,d.issueDate);seqs.set(key,existing);
  }
  result.push(d);
 }
 for(const [series,nums] of seqs){
  const sorted=[...nums].sort((a,b)=>a[0]-b[0]);let previous='';
  sorted.forEach(([n,d],i)=>{
   if(n!==i+1)fail('err.gap',{series});
   if(previous&&d<previous)fail('err.chrono',{series});
   previous=d;
  });
 }
 const clean={version:1,documents:result};
 if(enc.encode(JSON.stringify(clean)).length>MAX_STORAGE)fail('err.backupBig');
 return clean;
}
function put(existing,newDoc){
 const old=store(existing),d=draft(newDoc);const at=old.documents.findIndex(x=>x.id===d.id);
 if(d.status!=='draft')fail('err.lockedSave');
 if(at>=0&&old.documents[at].status==='locked')fail('err.lockedEdit');
 const documents=[...old.documents];
 if(at>=0)documents[at]=d;else documents.push(d);
 return store({version:1,documents});
}
function remove(existing,id){
 const old=store(existing),found=old.documents.find(d=>d.id===id);
 if(!found)fail('err.notFound');
 if(found.status==='locked')fail('err.lockedDelete');
 return store({version:1,documents:old.documents.filter(d=>d.id!==id)});
}
function lock(existing,id){
 const old=store(existing);const d=old.documents.find(x=>x.id===id);
 if(!d||d.status!=='draft')fail('err.noDraft');
 const year=d.issueDate.slice(0,4),prefix=d.type==='invoice'?'F':'D';
 const prior=old.documents.filter(x=>x.status==='locked'&&x.type===d.type);
 const latest=prior.reduce((m,x)=>x.issueDate>m?x.issueDate:m,'');
 if(latest&&d.issueDate<latest)fail('err.backdate');
 const relevant=prior.filter(x=>x.number.startsWith(prefix+'-'+year+'-'));
 const number=prefix+'-'+year+'-'+String(relevant.length+1).padStart(4,'0');
 const locked=draft({...d,status:'locked',number});
 return store({version:1,documents:old.documents.map(x=>x.id===id?locked:x)});
}
// Legacy French formatter kept for API compatibility (tests); the interface formats amounts with LouvreI18n.money in euros.
function money(cents){
 if(!Number.isSafeInteger(cents)||cents<0)fail('err.cents');
 return (cents/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
}
const empty=Object.freeze({version:1,documents:[]});
root.InvoiceCore=Object.freeze({MAX_DOCUMENTS,MAX_ITEMS,MAX_STORAGE,TYPES,empty,fixed,plain,date,item,draft,compute,store,put,remove,lock,money});
if(typeof module!=='undefined'&&module.exports)module.exports=root.InvoiceCore;
})(typeof window==='undefined'?globalThis:window);
