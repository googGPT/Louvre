/* ReadTrail — moteur pur, indépendant du navigateur. */
'use strict';
const AppLogic=(()=>{
 // Libellés : clés de traduction (messages.js). Les valeurs d'état restent en français dans les données
 // enregistrées (compatibilité des sauvegardes) et sont traduites à l'affichage.
 const SPEC={"slug":"readtrail","title":"ReadTrail","subtitle":"subtitle","fields":[{"key":"title","label":"f.title","type":"text","sample":"Exemple"},{"key":"total","label":"f.total","type":"number","sample":320},{"key":"read","label":"f.read","type":"number","sample":80},{"key":"status","label":"f.status","type":"select","options":["en cours","terminé","en pause"],"sample":"en cours"}],"description":"meta.description"};
 // Erreurs : clés de traduction (« err.x » ou « err.x|{json} »), traduites par l'interface.
 const fail=(k,p)=>{throw Error(p?k+'|'+JSON.stringify(p):k)};
 const MAX=500,STORAGE_LIMIT=900000;
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 function domainValidate(o){if(o.total<1||o.read>o.total||!Number.isInteger(o.total)||!Number.isInteger(o.read))fail('err.pages');}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))fail('err.id');const out={id:o.id};for(const field of SPEC.fields){const v=o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)fail('err.'+field.key);out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))fail('err.'+field.key);out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)fail('err.'+field.key);out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('err.'+field.key);out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))fail('err.'+field.key);out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)fail('err.'+field.key,{max:160});out[field.key]=v.trim();}}domainValidate(out);return out;}
 function validateBackup(data){if(!data||typeof data!=='object'||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)fail('err.backup');const ids=new Set();const items=data.records.map(o=>{const item=normalizeRecord(o);if(ids.has(item.id))fail('err.duplicateId');ids.add(item.id);return item});if(JSON.stringify(data).length>STORAGE_LIMIT)fail('err.backupBig');return items;}
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2);}
 function compute(records,today=dayKey()){if(!validDate(today))fail('err.today');const data=records.map(normalizeRecord);return summarize(data,today);}
 function summarize(records,today){const total=records.reduce((s,r)=>s+Math.max(0,r.total),0),read=records.reduce((s,r)=>s+Math.min(r.total,r.read),0);// Libellés et notes : clés de traduction ; le 3e élément d'un indicateur indique son format (pourcentage).
 return{kpis:[['kpi.read',String(read)],['kpi.left',String(Math.max(0,total-read))],['kpi.progress',String(total?Math.round(read/total*100):0),'percent']],notes:['note.declarative'],rows:records.slice().sort((a,b)=>b.read/b.total-a.read/a.total).slice(0,12).map(r=>({title:r.title,pct:Math.round(Math.min(1,r.read/r.total)*100)}))};}
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,normalizeRecord,validateBackup,backup,compute});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
