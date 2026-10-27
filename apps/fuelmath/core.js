/* FuelMath — moteur pur, indépendant du navigateur. */
'use strict';
const AppLogic=(()=>{
 const SPEC={"slug":"fuelmath","title":"FuelMath","subtitle":"Estimer un trajet automobile","fields":[{"key":"route","label":"Trajet","type":"text","sample":"Exemple"},{"key":"km","label":"Distance (km)","type":"number","sample":180},{"key":"litres","label":"Consommation (L/100 km)","type":"number","sample":6.2},{"key":"price","label":"Prix du litre (€)","type":"number","sample":1.8},{"key":"people","label":"Personnes dans le véhicule (conducteur inclus)","type":"number","sample":2},{"key":"tolls","label":"Péages (€)","type":"number","sample":0},{"key":"parking","label":"Stationnement (€)","type":"number","sample":0},{"key":"returnTrip","label":"Type de trajet","type":"select","options":["Aller simple","Aller-retour"],"sample":"Aller simple"}],"description":"Estimer carburant et partage entre passagers"};
 const MAX=500,STORAGE_LIMIT=900000;
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 // Erreurs : clé de traduction (messages.js), paramètres JSON après « | » (field = clé du champ, traduite par l'interface).
 const fail=(key,params)=>{throw Error(params?key+'|'+JSON.stringify(params):key)};
 function domainValidate(o){
  if(!Number.isInteger(o.people)||o.people<1||o.people>100)fail('err.people');
  if(o.km<=0||o.km>100000)fail('err.km');
  if(o.litres<=0||o.litres>100)fail('err.litres');
  if(o.price<=0||o.price>100)fail('err.price');
  if(o.tolls>100000||o.parking>100000)fail('err.extras');
}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))fail('err.id');const out={id:o.id};for(const field of SPEC.fields){const v=(o[field.key]===undefined&&field.key==='tolls')?0:(o[field.key]===undefined&&field.key==='parking')?0:(o[field.key]===undefined&&field.key==='returnTrip')?'Aller simple':o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)fail('err.number',{field:field.key});out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail('err.date',{field:field.key});out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))fail('err.choice',{field:field.key});out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)fail('err.text',{field:field.key,max:160});out[field.key]=v.trim();}}domainValidate(out);return out;}
 function validateBackup(data){if(!data||typeof data!=='object'||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)fail('err.backup');const ids=new Set();const items=data.records.map(o=>{const item=normalizeRecord(o);if(ids.has(item.id))fail('err.duplicateId');ids.add(item.id);return item});if(JSON.stringify(data).length>STORAGE_LIMIT)fail('err.tooBig');return items;}
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2);}
 function compute(records,today=dayKey()){if(!validDate(today))fail('err.today');const data=records.map(normalizeRecord);return summarize(data,today);}
 function tripCostCents(r){
  // km × (L / 100 km) × (€/L) × 100 = valeur en centimes.
  const cents=Math.round(r.km*r.litres*r.price);
  if(!Number.isSafeInteger(cents)||cents<0)fail('err.cost');
  return cents;
 }
 function splitCents(totalCents,people){
  if(!Number.isSafeInteger(totalCents)||totalCents<0||!Number.isInteger(people)||people<1||people>100)fail('err.split');
  const base=Math.floor(totalCents/people),extra=totalCents%people;
  return {high:base+(extra>0?1:0),highCount:extra,low:base,lowCount:people-extra};
 }
 function tripDetails(input){
  const r=normalizeRecord(input),factor=r.returnTrip==='Aller-retour'?2:1;
  const distance=r.km*factor;
  const fuelLiters=distance*r.litres/100;
  const fuelCents=Math.round(distance*r.litres*r.price);
  // Les péages et le stationnement saisis concernent l'ensemble du déplacement.
  const extrasCents=Math.round(r.tolls*100)+Math.round(r.parking*100);
  const totalCents=fuelCents+extrasCents;
  if(!Number.isSafeInteger(totalCents)||totalCents<0)fail('err.cost');
  return {distance,fuelLiters,fuelCents,extrasCents,totalCents,people:r.people,split:splitCents(totalCents,r.people)};
 }
 function summarize(records,today){
  const details=records.map(tripDetails);
  const total=details.reduce((s,x)=>s+x.totalCents,0);
  const fuel=details.reduce((s,x)=>s+x.fuelCents,0);
  const liters=details.reduce((s,x)=>s+x.fuelLiters,0);
  const distance=details.reduce((s,x)=>s+x.distance,0);
  // Valeurs brutes : l'interface les met en forme (langue, devise) ; textes désignés par des clés de traduction.
  const rows=records.map((r,i)=>({route:r.route,...details[i]}));
  return {kpis:[{key:'kpi.total',value:total,type:'money'},{key:'kpi.fuel',value:fuel,type:'money'},{key:'kpi.liters',value:liters,type:'liters'},{key:'kpi.distance',value:distance,type:'km'},{key:'kpi.perKm',value:distance?Math.round(total/distance):null,type:'moneyPerKm'}],notes:['note.people','note.estimate','note.cents'],rows:rows.slice(0,25)};
 }
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,normalizeRecord,validateBackup,backup,compute,tripCostCents,splitCents,tripDetails});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
