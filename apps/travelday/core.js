/* TravelDay v2 — calculs métiers purs. Journées civiles, sans fuseau horaire imposé. */
'use strict';
const AppLogic=(()=>{
 const SPEC={slug:'travelday',title:'TravelDay',fields:[
  // Libellés dans messages.js (field.<clé>). Les catégories restent stockées en français (compatibilité
  // des sauvegardes) et sont traduites à l'affichage par l'interface.
  {key:'day',type:'date'}, {key:'place',type:'text'},
  {key:'start',type:'time'}, {key:'end',type:'time'},
  {key:'cost',type:'number'}, {key:'category',type:'select',options:['Visite','Transport','Repas','Hébergement','Activité','Autre']},
  {key:'notes',type:'optionalText'}
 ]};
 const MAX=500,STORAGE_LIMIT=900000,MAX_COST=1000000;
 const pad=n=>String(n).padStart(2,'0');
 // Erreurs sous forme de clés traduisibles par l'interface : « err.cle » ou « err.cle|{…} ».
 const fail=(key,params)=>{throw Error(params?key+'|'+JSON.stringify(params):key)};
 const dayKey=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);if(y<1900||y>2200)return false;const dt=new Date(Date.UTC(y,m-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;}
 function toDay(s){if(!validDate(s))fail('err.date');return new Date(`${s}T12:00:00Z`)}
 function addDays(s,n){const d=toDay(s);if(!Number.isInteger(n)||Math.abs(n)>10000)fail('err.offset');d.setUTCDate(d.getUTCDate()+n);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
 function diffDays(a,b){return Math.round((toDay(a).getTime()-toDay(b).getTime())/86400000)}
 function timeMinutes(s){if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))fail('err.time');return Number(s.slice(0,2))*60+Number(s.slice(3,5))}
 function moneyCents(cost){if(typeof cost!=='number'||!Number.isFinite(cost)||cost<0||cost>MAX_COST)fail('err.cost');const cents=Math.round((cost+Number.EPSILON)*100);if(!Number.isSafeInteger(cents))fail('err.cost');return cents;}
 function normalizeRecord(r){if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(r.id))fail('err.id');
  const out={id:r.id};
  if(!validDate(r.day))fail('err.day');out.day=r.day;
  if(typeof r.place!=='string'||!r.place.trim()||r.place.length>160)fail('err.place',{max:160});out.place=r.place.trim();
  const start=timeMinutes(r.start),end=timeMinutes(r.end);if(start===end)fail('err.sameTime');out.start=r.start;out.end=r.end;
  moneyCents(r.cost);out.cost=r.cost;
  const category=r.category===undefined?'Activité':r.category;
  if(!SPEC.fields[5].options.includes(category))fail('err.category');out.category=category;
  const notes=r.notes===undefined?'':r.notes;
  if(typeof notes!=='string'||notes.length>360)fail('err.notes',{max:360});out.notes=notes.trim();return out;
 }
 function normalizeAll(records){if(!Array.isArray(records)||records.length>MAX)fail('err.tooMany',{max:MAX});const ids=new Set();return records.map(raw=>{const r=normalizeRecord(raw);if(ids.has(r.id))fail('err.dupId');ids.add(r.id);return r;});}
 function validateBackup(o){if(!o||typeof o!=='object'||o.app!==SPEC.slug||o.version!==1||!Array.isArray(o.records))fail('err.backup');if(JSON.stringify(o).length>STORAGE_LIMIT)fail('err.backupBig');return normalizeAll(o.records);}
 function backup(records){return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:normalizeAll(records)},null,2);}
 function utcDayMinutes(day){return Math.floor(Date.parse(`${day}T00:00:00Z`)/60000)}
 function interval(record){const r=normalizeRecord(record),s=utcDayMinutes(r.day)+timeMinutes(r.start),finish=timeMinutes(r.end),end=utcDayMinutes(r.day)+finish+(finish<timeMinutes(r.start)?1440:0);return {id:r.id,record:r,start:s,end,duration:end-s,overnight:finish<timeMinutes(r.start),costCents:moneyCents(r.cost)};}
 function conflictsOf(items){const pairs=[],ids=new Set();for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
   const a=items[i],b=items[j],overlap=Math.min(a.end,b.end)-Math.max(a.start,b.start);
   if(overlap>0){pairs.push({first:a.id,second:b.id,minutes:overlap,firstName:a.record.place,secondName:b.record.place});ids.add(a.id);ids.add(b.id)}
  }return {pairs,ids:[...ids]};}
 function analyze(records, selectedDay='all',buffer=15){const data=normalizeAll(records);if(selectedDay!=='all'&&!validDate(selectedDay))fail('err.filterDay');if(!Number.isInteger(buffer)||buffer<0||buffer>180)fail('err.buffer',{max:180});
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
  // Indicateurs bruts (clé de libellé, valeur, type) : l'interface les traduit et les formate.
  return {kpis:[['kpi.count',visible.length,'count'],['kpi.budget',cents,'money'],['kpi.conflicts',conflicts.length,'count'],['kpi.duration',minutes,'minutes'],['kpi.gaps',gaps.length,'count']],
   notes:['note.local','note.overnight'],
   items:visible,days,perDay,conflicts,conflictIds:[...conflictIds],gaps,totalCents:cents,totalMinutes:minutes,allCount:items.length};
 }
 const compute=(records,today=dayKey(),day='all',buffer=15)=>{if(!validDate(today))fail('err.refDate');return analyze(records,day,buffer)};
 function csvCell(s){let v=String(s??'');if(/^[\s\t\r\n]*[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
 // Libellés du CSV fournis par l'interface (langue et devise choisies) ; français et euro par défaut.
 const CSV_FR=Object.freeze({cols:['Date','Activité','Début','Fin','Lendemain','Durée (min)','Catégorie','Budget (EUR)','Notes'],yes:'oui',no:'non',category:c=>c});
 function toCsv(records,labels=CSV_FR){const items=normalizeAll(records),cols=labels.cols;const rows=items.map(r=>{const i=interval(r);return [r.day,r.place,r.start,r.end,i.overnight?labels.yes:labels.no,i.duration,labels.category(r.category),String((i.costCents/100).toFixed(2)),r.notes].map(csvCell).join(';')});return '\uFEFF'+[cols.map(csvCell).join(';'),...rows].join('\r\n');}
 function icsEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
 function icsStamp(day,time){return day.replace(/-/g,'')+'T'+time.replace(':','')+'00'}
 // Description de chaque événement fournie par l'interface (traduite, montant dans la devise choisie).
 function toIcs(records,describe=(r)=>r.category+(r.notes?' — '+r.notes:'')){const items=normalizeAll(records),rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Louvre//TravelDay v2//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];for(const r of items){const d=interval(r);const until=d.overnight?addDays(r.day,1):r.day;rows.push('BEGIN:VEVENT','UID:'+r.id+'@travelday.local','DTSTAMP:20261026T000000Z','DTSTART:'+icsStamp(r.day,r.start),'DTEND:'+icsStamp(until,r.end),'SUMMARY:'+icsEscape(r.place),'DESCRIPTION:'+icsEscape(describe(r,d.costCents)),'END:VEVENT')}rows.push('END:VCALENDAR');return rows.join('\r\n')+'\r\n';}
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,addDays,diffDays,validDate,timeMinutes,moneyCents,normalizeRecord,validateBackup,backup,interval,analyze,compute,toCsv,toIcs});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;