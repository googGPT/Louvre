/* TripPack — moteur pur, indépendant du navigateur. */
'use strict';
const AppLogic=(()=>{
 // Libellés dans messages.js (field.<clé>, opt.<valeur>). Les valeurs des listes restent stockées en français
 // (compatibilité des sauvegardes) et sont traduites à l'affichage.
 const SPEC={"slug":"trippack","title":"TripPack","fields":[{"key":"item","type":"text","sample":"Exemple"},{"key":"bag","type":"text","sample":"Exemple"},{"key":"quantity","type":"number","sample":2},{"key":"importance","type":"select","options":["essentiel","utile","facultatif"],"sample":"essentiel"},{"key":"packed","type":"select","options":["non","oui"],"sample":"non"}]};
 // Erreurs sous forme de clés traduisibles : « err.cle » ou « err.cle|{…} » (« field » = clé du champ).
 const fail=(key,params)=>{throw Error(params?key+'|'+JSON.stringify(params):key)};
 const MAX=500,STORAGE_LIMIT=900000;
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 function domainValidate(o){return true;}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))fail('err.id');const out={id:o.id};for(const field of SPEC.fields){const v=o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)fail('err.number',{field:field.key});out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)fail('err.datetime',{field:field.key});out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('err.time',{field:field.key});out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))fail('err.choice',{field:field.key});out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)fail('err.text',{field:field.key,max:160});out[field.key]=v.trim();}}domainValidate(out);return out;}
 function validateBackup(data){if(!data||typeof data!=='object'||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)fail('err.backup');const ids=new Set();const items=data.records.map(o=>{const item=normalizeRecord(o);if(ids.has(item.id))fail('err.dupId');ids.add(item.id);return item});if(JSON.stringify(data).length>STORAGE_LIMIT)fail('err.backupBig');return items;}
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2);}
 function compute(records,today=dayKey()){if(!validDate(today))fail('err.today');const data=records.map(normalizeRecord);return summarize(data,today);}
 function summarize(records,today){const w={essentiel:3,utile:2,facultatif:1};const total=records.reduce((s,r)=>s+w[r.importance],0),done=records.filter(r=>r.packed==='oui').reduce((s,r)=>s+w[r.importance],0);// Indicateurs bruts (clé de libellé, valeur, type) et lignes de données : l'interface traduit et formate.
 return{kpis:[['kpi.ready',total?Math.round(100*done/total):0,'percent'],['kpi.left',records.filter(r=>r.packed!=='oui').length,'count'],['kpi.missing',records.filter(r=>r.importance==='essentiel'&&r.packed!=='oui').length,'count']],notes:['note.weight'],rows:records.filter(r=>r.packed!=='oui').slice(0,12).map(r=>({item:r.item,quantity:r.quantity,bag:r.bag}))};}
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,normalizeRecord,validateBackup,backup,compute});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
