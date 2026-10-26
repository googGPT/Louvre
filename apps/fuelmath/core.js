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
 function eur(n){return (n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
 function domainValidate(o){
  if(!Number.isInteger(o.people)||o.people<1||o.people>100)throw Error('Passagers : nombre entier entre 1 et 100');
  if(o.km<=0||o.km>100000)throw Error('Distance : de 0 à 100 000 km (borne exclue à zéro)');
  if(o.litres<=0||o.litres>100)throw Error('Consommation : de 0 à 100 L/100 km');
  if(o.price<=0||o.price>100)throw Error('Prix : de 0 à 100 € par litre');
  if(o.tolls>100000||o.parking>100000)throw Error('Frais annexes trop élevés');
}
 function normalizeRecord(o){if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant invalide');const out={id:o.id};for(const field of SPEC.fields){const v=(o[field.key]===undefined&&field.key==='tolls')?0:(o[field.key]===undefined&&field.key==='parking')?0:(o[field.key]===undefined&&field.key==='returnTrip')?'Aller simple':o[field.key];if(field.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000000||v<0)throw Error(field.label+' doit être un nombre positif fini');out[field.key]=v;}else if(field.type==='date'){if(!validDate(v))throw Error(field.label+' : date invalide');out[field.key]=v;}else if(field.type==='datetime-local'){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)||!validDate(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59)throw Error(field.label+' : UTC invalide');out[field.key]=v;}else if(field.type==='time'){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error(field.label+' : heure invalide');out[field.key]=v;}else if(field.type==='select'){if(!field.options.includes(v))throw Error(field.label+' : choix invalide');out[field.key]=v;}else{if(typeof v!=='string'||!v.trim()||v.length>160)throw Error(field.label+' : texte requis (160 caractères maximum)');out[field.key]=v.trim();}}domainValidate(out);return out;}
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
 function tripDetails(input){
  const r=normalizeRecord(input),factor=r.returnTrip==='Aller-retour'?2:1;
  const distance=r.km*factor;
  const fuelLiters=distance*r.litres/100;
  const fuelCents=Math.round(distance*r.litres*r.price);
  // Les péages et le stationnement saisis concernent l'ensemble du déplacement.
  const extrasCents=Math.round(r.tolls*100)+Math.round(r.parking*100);
  const totalCents=fuelCents+extrasCents;
  if(!Number.isSafeInteger(totalCents)||totalCents<0)throw Error('Coût hors limites');
  return {distance,fuelLiters,fuelCents,extrasCents,totalCents,people:r.people,split:splitCents(totalCents,r.people)};
 }
 function summarize(records,today){
  const details=records.map(tripDetails);
  const total=details.reduce((s,x)=>s+x.totalCents,0);
  const fuel=details.reduce((s,x)=>s+x.fuelCents,0);
  const liters=details.reduce((s,x)=>s+x.fuelLiters,0);
  const distance=details.reduce((s,x)=>s+x.distance,0);
  const rows=records.map((r,i)=>r.route+' : '+eur(details[i].totalCents)+' · '+details[i].distance.toFixed(1)+' km · '+details[i].fuelLiters.toFixed(2)+' L · '+splitLabel(details[i].split));
  return {kpis:[['Coût total estimé',eur(total)],['Carburant',eur(fuel)],['Carburant consommé',liters.toFixed(2)+' L'],['Distance totale',distance.toFixed(1)+' km'],['Coût moyen au km',distance?eur(Math.round(total/distance))+'/km':'—']],notes:['Le conducteur est inclus dans le nombre de personnes. La distance est doublée pour un aller-retour, pas les péages et frais de parking saisis.','Coût estimatif : hors entretien, assurance, usure, congestion et variations réelles de consommation.','La somme des contributions en centimes est exactement égale au coût estimé de chaque déplacement.'],rows:rows.slice(0,25)};
 }
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,eur,normalizeRecord,validateBackup,backup,compute,tripCostCents,splitCents,tripDetails});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
