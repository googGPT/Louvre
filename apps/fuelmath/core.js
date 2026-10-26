/* FuelMath — moteur pur, indépendant du navigateur. */
'use strict';
const AppLogic=(()=>{
 const SPEC={"slug":"fuelmath","title":"FuelMath","subtitle":"Estimer un trajet automobile","fields":[{"key":"route","label":"Trajet","type":"text","sample":"Exemple"},{"key":"km","label":"Distance (km)","type":"number","sample":180},{"key":"litres","label":"Consommation (L/100 km)","type":"number","sample":6.2},{"key":"price","label":"Prix du litre (€)","type":"number","sample":1.8},{"key":"people","label":"Personnes qui partagent (conducteur compris)","type":"number","sample":2}],"description":"Estimer carburant et partage entre passagers"};
 const MAX=500,STORAGE_LIMIT=900000;
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 function eur(n){return (n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
 function domainValidate(o){
  if(!Number.isInteger(o.people)||o.people<1||o.people>100)throw Error('Passagers : nombre entier entre 1 et 100');
  if(o.km<=0||o.km>100000)throw Error('Distance : de 0 à 100 000 km (borne exclue à zéro)');
  if(o.litres<=0||o.litres>100)throw Error('Consommation : de 0 à 100 L/100 km');
  if(o.price<=0||o.price>100)throw Error('Prix : de 0 à 100 € par litre');
}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant invalide');const out={id:o.id};for(const field of SPEC.fields){const v=o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)throw Error(field.label+' doit être un nombre positif fini');out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))throw Error(field.label+' : date invalide');out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)throw Error(field.label+' : UTC invalide');out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error(field.label+' : heure invalide');out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))throw Error(field.label+' : choix invalide');out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)throw Error(field.label+' : texte requis (160 caractères maximum)');out[field.key]=v.trim();}}domainValidate(out);return out;}
 function validateBackup(data){if(!data||typeof data!=='object'||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)throw Error('Sauvegarde incompatible ou trop volumineuse');const ids=new Set();const items=data.records.map(o=>{const item=normalizeRecord(o);if(ids.has(item.id))throw Error('Identifiant dupliqué');ids.add(item.id);return item});if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop grande');return items;}
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2);}
 function compute(records,today=dayKey()){if(!validDate(today))throw Error('Date du jour invalide');const data=records.map(normalizeRecord);return summarize(data,today);}
 function tripCostCents(r){
  // km × (L / 100 km) × (€/L) × 100 = valeur en centimes.
  const cents=Math.round(r.km*r.litres*r.price);
  if(!Number.isSafeInteger(cents)||cents<0)throw Error('Coût calculé hors limites');
  return cents;
 }
 function splitCents(totalCents,people){
  if(!Number.isSafeInteger(totalCents)||totalCents<0||!Number.isInteger(people)||people<1||people>100)throw Error('Partage invalide');
  const base=Math.floor(totalCents/people),extra=totalCents%people;
  return {high:base+(extra>0?1:0),highCount:extra,low:base,lowCount:people-extra};
 }
 function splitLabel(parts){
  if(!parts.highCount)return parts.lowCount+' × '+eur(parts.low);
  if(!parts.lowCount)return parts.highCount+' × '+eur(parts.high);
  return parts.highCount+' × '+eur(parts.high)+' et '+parts.lowCount+' × '+eur(parts.low);
 }
 function summarize(records,today){
  const rows=records.map(r=>{
   const cents=tripCostCents(r),parts=splitCents(cents,r.people);
   return r.route+' : '+eur(cents)+' · partage entre passagers : '+splitLabel(parts);
  });
  const sum=records.reduce((s,r)=>s+tripCostCents(r),0);
  return {kpis:[['Coût estimé',eur(sum)],['Distance totale',records.reduce((s,r)=>s+r.km,0).toFixed(1)+' km']],notes:['Estimation carburant seulement : hors péages, usure, circulation et stationnement.','La répartition inclut toutes les personnes indiquées, conducteur compris. Les centimes restants sont attribués à certaines personnes.'],rows:rows.slice(0,15)};
 }
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,eur,normalizeRecord,validateBackup,backup,compute,tripCostCents,splitCents});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
