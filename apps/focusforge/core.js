/* FocusForge — moteur pur, indépendant du navigateur. */
'use strict';
const AppLogic=(()=>{
 const SPEC={"slug":"focusforge","title":"FocusForge","subtitle":"Mesurer ses sessions de concentration","fields":[{"key":"task","label":"Projet ou activité","type":"text","sample":"Exemple"},{"key":"minutes","label":"Durée (minutes)","type":"number","sample":25},{"key":"day","label":"Jour","type":"date","sample":"2026-11-10"},{"key":"completed","label":"Session terminée","type":"select","options":["oui","non"],"sample":"oui"}],"description":"Suivre les minutes de travail accomplies par projet"};
 const MAX=500,STORAGE_LIMIT=900000;
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 // Erreurs : clé de traduction (messages.js), paramètres JSON après « | » (field = clé du champ, traduite par l'interface).
 const fail=(key,params)=>{throw Error(params?key+'|'+JSON.stringify(params):key)};
 function domainValidate(o){if(!Number.isInteger(o.minutes)||o.minutes<1||o.minutes>1440)fail('err.minutes');}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))fail('err.id');const out={id:o.id};for(const field of SPEC.fields){const v=o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)fail('err.number',{field:field.key});out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))fail('err.choice',{field:field.key});out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)fail('err.text',{field:field.key,max:160});out[field.key]=v.trim();}}domainValidate(out);return out;}
 function validateBackup(data){if(!data||typeof data!=='object'||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)fail('err.backup');const ids=new Set();const items=data.records.map(o=>{const item=normalizeRecord(o);if(ids.has(item.id))fail('err.duplicateId');ids.add(item.id);return item});if(JSON.stringify(data).length>STORAGE_LIMIT)fail('err.tooBig');return items;}
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2);}
 function compute(records,today=dayKey()){if(!validDate(today))fail('err.today');const data=records.map(normalizeRecord);return summarize(data,today);}
 function summarize(records,today){const completed=records.filter(r=>r.completed==='oui');const minutes=completed.reduce((s,r)=>s+r.minutes,0),by={};for(const r of completed)by[r.task]=(by[r.task]||0)+r.minutes;
  // Valeurs brutes et clés de traduction : l'interface met en forme dans la langue choisie.
  return{kpis:[{key:'kpi.minutes',value:Math.round(minutes)},{key:'kpi.sessions',value:completed.length},{key:'kpi.hours',value:minutes/60,digits:1}],notes:['note.completed'],rows:Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([task,m])=>({task,minutes:m}))};}
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,normalizeRecord,validateBackup,backup,compute});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
