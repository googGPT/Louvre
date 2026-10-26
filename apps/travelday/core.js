/* TravelDay v2 — calculs métiers purs. Journées civiles, sans fuseau horaire imposé. */
'use strict';
const AppLogic=(()=>{
 const SPEC={slug:'travelday',title:'TravelDay',fields:[
  {key:'day',label:'Jour',type:'date'}, {key:'place',label:'Lieu ou activité',type:'text'},
  {key:'start',label:'Début',type:'time'}, {key:'end',label:'Fin',type:'time'},
  {key:'cost',label:'Coût prévu (€)',type:'number'}, {key:'category',label:'Catégorie',type:'select',options:['Visite','Transport','Repas','Hébergement','Activité','Autre']},
  {key:'notes',label:'Notes (facultatif)',type:'optionalText'}
 ]};
 const MAX=500,STORAGE_LIMIT=900000,MAX_COST=1000000;
 const pad=n=>String(n).padStart(2,'0');
 const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);if(y<1900||y>2200)return false;const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;}
 function toDay(s){if(!validDate(s))throw Error('Date invalide');return new Date(`${s}T12:00:00Z`)}
 function addDays(s,n){const d=toDay(s);if(!Number.isInteger(n)||Math.abs(n)>10000)throw Error('Décalage invalide');d.setUTCDate(d.getUTCDate()+n);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
 function diffDays(a,b){return Math.round((toDay(a).getTime()-toDay(b).getTime())/86400000)}
 function timeMinutes(s){if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Heure incorrecte : HH:MM attendue');return Number(s.slice(0,2))*60+Number(s.slice(3,5))}
 function minutesLabel(n){return Math.floor(n/60)+' h '+pad(n%60)}
 function eur(cents){if(!Number.isSafeInteger(cents))throw Error('Montant hors limites');return (cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});}
 function moneyCents(cost){if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0||cost>MAX_COST)throw Error('Coût entre 0 et 1 000 000 €');const cents=Math.round((cost+Number.EPSILON)*100);if(!Number.isSafeInteger(cents))throw Error('Coût hors limites');return cents;}
 function normalizeRecord(r){if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(r.id))throw Error('Identifiant invalide');
  const out={id:r.id};
  if(!validDate(r.day))throw Error('Jour invalide');out.day=r.day;
  if(typeof r.place!=='string'||!r.place.trim()||r.place.length>160)throw Error('Activité requise (160 caractères maximum)');out.place=r.place.trim();
  const start=timeMinutes(r.start),end=timeMinutes(r.end);if(start===end)throw Error('Heure de début et de fin identiques : durée nulle ou 24 h non autorisée');out.start=r.start;out.end=r.end;
  moneyCents(r.cost);out.cost=r.cost;
  const category=r.category===undefined?'Activité':r.category;
  if(!SPEC.fields[5].options.includes(category))throw Error('Catégorie invalide');out.category=category;
  const notes=r.notes===undefined?'':r.notes;
  if(typeof notes!=='string'||notes.length>360)throw Error('Notes limitées à 360 caractères');out.notes=notes.trim();return out;
 }
 function normalizeAll(records){if(!Array.isArray(records)||records.length>MAX)throw Error('Trop de fiches (500 maximum)');const ids=new Set();return records.map(raw=>{const r=normalizeRecord(raw);if(ids.has(r.id))throw Error('Identifiant dupliqué');ids.add(r.id);return r;});}
 function validateBackup(o){if(!o||typeof o!=='object'||o.app!==SPEC.slug||o.version!==1||!Array.isArray(o.records))throw Error('Sauvegarde incompatible ou version incorrecte');if(JSON.stringify(o).length>STORAGE_LIMIT)throw Error('Sauvegarde trop volumineuse');return normalizeAll(o.records);}
 function backup(records){return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:normalizeAll(records)},null,2);}
 function utcDayMinutes(day){return Math.floor(Date.parse(`${day}T00:00:00Z`)/60000)}
 function interval(record){const r=normalizeRecord(record),s=utcDayMinutes(r.day)+timeMinutes(r.start),finish=timeMinutes(r.end),end=utcDayMinutes(r.day)+finish+(finish<timeMinutes(r.start)?1440:0);return {id:r.id,record:r,start:s,end,duration:end-s,overnight:finish<timeMinutes(r.start),costCents:moneyCents(r.cost)};}
 function conflictsOf(items){const pairs=[],ids=new Set();for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const a=items[i],b=items[j],overlap=Math.min(a.end,b.end)-Math.max(a.start,b.start);
   if(overlap>0){pairs.push({first:a.id,second:b.id,minutes:overlap,firstName:a.record.place,secondName:b.record.place});ids.add(a.id);ids.add(b.id)}
  }return {pairs,ids:[...ids]};}
 function analyze(records, selectedDay='all',buffer=15){const data=normalizeAll(records);if(selectedDay!=='all'&&!validDate(selectedDay))throw Error('Jour filtré invalide');if(!Number.isInteger(buffer)||buffer<0||buffer>180)throw Error('Marge de transfert de 0 à 180 minutes');
  const items=data.map(interval).sort((a,b)=>a.start-b.start||a.end-b.end||a.id.localeCompare(b.id));const days=[...new Set(data.map(r=>r.day))].sort();
  // Visible activities start on selected day; overnight entries may also overlap entries from next day.
  const visible=items.filter(x=>selectedDay==='all'||x.record.day===selectedDay);
  const pairsAll=conflictsOf(items).pairs;const ids=new Set(visible.map(x=>x.id));
  const conflicts=pairsAll.filter(p=>selectedDay==='all'||ids.has(p.first)||ids.has(p.second));
  const conflictIds=new Set(conflicts.flatMap(p=>[p.first,p.second]));
  const gaps=[];const perDay={};for(const x of items){const r=x.record,p=perDay[r.day]??={costCents:0,minutes:0,count:0};p.costCents+=x.costCents;p.minutes+=x.duration;p.count++}
  // Only sequential activities sharing one civil start day; overlapping items never yield false gaps.
  const groups={};for(const x of items)(groups[x.record.day]??=[]).push(x);
  for(const [day,arr] of Object.entries(groups)){let latest=arr[0];for(let i=1;i<arr.length;i++){
   const next=arr[i],space=next.start-latest.end;
   if(space>=0&&space<buffer&&(selectedDay==='all'||day===selectedDay))gaps.push({day,after:latest.record.place,before:next.record.place,minutes:space});
   if(next.end>latest.end)latest=next;
  }}
  const cents=visible.reduce((s,x)=>s+x.costCents,0),minutes=visible.reduce((s,x)=>s+x.duration,0);
  return {kpis:[['Activités',String(visible.length)],['Budget prévu',eur(cents)],['Chevauchements',String(conflicts.length)],['Durée des activités',minutesLabel(minutes)],['Transitions courtes',String(gaps.length)]],
   notes:['Heures locales saisies manuellement : aucun fuseau, réservation ni temps de trajet réel n’est vérifié.','Une fin avant le début signifie une activité se terminant le lendemain. La marge de transfert est un simple avertissement, pas un calcul d’itinéraire.'],
   rows:visible.map(x=>`${x.record.day} · ${x.record.start}–${x.record.end}${x.overnight?' (+1 jour)':''} · ${x.record.place} · ${eur(x.costCents)}`),
   items:visible,days,perDay,conflicts,conflictIds:[...conflictIds],gaps,totalCents:cents,totalMinutes:minutes,allCount:items.length};
 }
 const compute=(records,today=dayKey(),day='all',buffer=15)=>{if(!validDate(today))throw Error('Date de référence invalide');return analyze(records,day,buffer)};
 function csvCell(s){let v=String(s??'');if(/^[\s\t\r\n]*[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
 function toCsv(records){const items=normalizeAll(records),cols=['Date','Activité','Début','Fin','Lendemain','Durée (min)','Catégorie','Budget (EUR)','Notes'];const rows=items.map(r=>{const i=interval(r);return [r.day,r.place,r.start,r.end,i.overnight?'oui':'non',i.duration,(r.category),String((i.costCents/100).toFixed(2)),r.notes].map(csvCell).join(';')});return '\uFEFF'+[cols.map(csvCell).join(';'),...rows].join('\r\n');}
 function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
 function icsStamp(day,time){return day.replace(/-/g,'')+'T'+time.replace(':','')+'00'}
 function toIcs(records){const items=normalizeAll(records),rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Louvre//TravelDay v2//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];for(const r of items){const d=interval(r);const until=d.overnight?addDays(r.day,1):r.day;rows.push('BEGIN:VEVENT','UID:'+r.id+'@travelday.local','DTSTAMP:20261026T000000Z','DTSTART:'+icsStamp(r.day,r.start),'DTEND:'+icsStamp(until,r.end),'SUMMARY:'+icsEscape(r.place),'DESCRIPTION:'+icsEscape((r.category+' — Coût estimé '+eur(d.costCents)+(r.notes?' — '+r.notes:''))),'END:VEVENT')}rows.push('END:VCALENDAR');return rows.join('\r\n')+'\r\n';}
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,addDays,diffDays,validDate,timeMinutes,minutesLabel,eur,moneyCents,normalizeRecord,validateBackup,backup,interval,analyze,compute,toCsv,toIcs});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;