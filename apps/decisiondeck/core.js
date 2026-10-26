/* DecisionDeck — moteur pur, indépendant du navigateur. */
'use strict';
const AppLogic=(()=>{
 const SPEC={"slug":"decisiondeck","title":"DecisionDeck","subtitle":"Comparer des options avec critères","fields":[{"key":"option","label":"Option","type":"text","sample":"Option A"},{"key":"criterion","label":"Critère","type":"text","sample":"Prix"},{"key":"weight","label":"Poids du critère","type":"number","sample":3},{"key":"score","label":"Score / 10","type":"number","sample":8}],"description":"Décider avec scores pondérés et transparents"};
 const MAX=500,STORAGE_LIMIT=900000;
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 function eur(n){return (n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
 function domainValidate(o){if(o.score>10||o.weight<=0)throw Error('Score entre 0 et 10, poids positif');}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant invalide');const out={id:o.id};for(const field of SPEC.fields){const v=o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)throw Error(field.label+' doit être un nombre positif fini');out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))throw Error(field.label+' : date invalide');out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)throw Error(field.label+' : UTC invalide');out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error(field.label+' : heure invalide');out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))throw Error(field.label+' : choix invalide');out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)throw Error(field.label+' : texte requis (160 caractères maximum)');out[field.key]=v.trim();}}domainValidate(out);return out;}
 function validateBackup(data){if(!data||typeof data!=='object'||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)throw Error('Sauvegarde incompatible ou trop volumineuse');const ids=new Set();const items=data.records.map(o=>{const item=normalizeRecord(o);if(ids.has(item.id))throw Error('Identifiant dupliqué');ids.add(item.id);return item});if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop grande');return items;}
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2);}
 function compute(records,today=dayKey()){if(!validDate(today))throw Error('Date du jour invalide');const data=records.map(normalizeRecord);return summarize(data,today);}
 function summarize(records,today){
  const matrix=new Map(), criteria=new Map(), allCriteria=new Set();
  const messages=[];
  for(const r of records){
   allCriteria.add(r.criterion);
   let group=matrix.get(r.option);
   if(!group){group=new Map();matrix.set(r.option,group)}
   if(group.has(r.criterion)){messages.push('Doublon : '+r.option+' / '+r.criterion);continue}
   group.set(r.criterion,r);
   if(!criteria.has(r.criterion))criteria.set(r.criterion,r.weight);
   else if(criteria.get(r.criterion)!==r.weight)messages.push('Poids incohérents pour « '+r.criterion+' » : utilisez le même poids pour chaque option.');
  }
  const required=[...allCriteria];
  for(const [name,group] of matrix){
   const missing=required.filter(c=>!group.has(c));
   if(missing.length)messages.push('« '+name+' » : critères manquants : '+missing.join(', ')+'.');
  }
  const comparable=messages.length===0;
  const ranking=comparable?[...matrix].map(([name,group])=>{
   let sum=0,w=0;
   for(const criterion of required){const r=group.get(criterion);sum+=r.score*r.weight;w+=r.weight}
   return{name,score:w?sum/w:0}
  }).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'fr')):[];
  return {
   kpis:[['Options',String(matrix.size)],['Meilleure note',ranking.length?ranking[0].score.toFixed(2)+'/10':'—']],
   notes: comparable?['Classement comparable : chaque option possède les mêmes critères et chaque critère conserve le même poids.']:[
    'Classement suspendu : les options doivent être notées sur les mêmes critères, avec des poids identiques par critère.',
    ...[...new Set(messages)]
   ],
   rows:ranking.map((x,i)=>(i+1)+'. '+x.name+' : '+x.score.toFixed(2)+'/10')
  };
 }
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,eur,normalizeRecord,validateBackup,backup,compute});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
