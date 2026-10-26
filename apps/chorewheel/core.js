/* ChoreWheel v2 — pure domain functions, no network dependencies. */
'use strict';
const AppLogic = (() => {
  const SPEC = Object.freeze({slug:'chorewheel',title:'ChoreWheel',fields:[
    {key:'chore',label:'Tâche',type:'text'},
    {key:'person',label:'Responsable',type:'text'},
    {key:'room',label:'Pièce ou zone',type:'text',optional:true},
    {key:'last',label:'Dernière réalisation',type:'date'},
    {key:'every',label:'Fréquence (jours)',type:'number'},
    {key:'minutes',label:'Durée prévue (minutes)',type:'number'}
  ]});
  const MAX=500,STORAGE_LIMIT=900000,MAX_HISTORY=100;
  const owns=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);if(y<1900||y>2100)return false;const t=new Date(Date.UTC(y,m-1,d,12));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;}
  function dayKey(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function dayUTC(s){if(!validDate(s))throw Error('Date invalide');const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d,12);}
  function diffDays(a,b){return Math.round((dayUTC(a)-dayUTC(b))/86400000);}
  function addDays(s,n){if(!Number.isInteger(n)||Math.abs(n)>100000)throw Error('Intervalle invalide');const t=new Date(dayUTC(s)+n*86400000);return t.toISOString().slice(0,10);}
  function norm(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim().replace(/\s+/g,' ');}
  function text(v,name,max=100,optional=false){if(typeof v!=='string'||v.length>max||(!optional&&!v.trim())||/[\u0000-\u001f]/.test(v))throw Error(name+' invalide ('+max+' caractères maximum)');return v.trim();}
  function normalizeRecord(o){
    if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[A-Za-z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant de tâche invalide');
    const out={id:o.id,chore:text(o.chore,'Tâche'),person:text(o.person,'Responsable'),room:text(o.room===undefined?'':o.room,'Pièce ou zone',70,true),last:o.last,every:o.every,minutes:o.minutes,history:o.history===undefined?[]:o.history};
    if(!validDate(out.last))throw Error('Date de dernière réalisation invalide');
    if(!Number.isSafeInteger(out.every)||out.every<1||out.every>3650)throw Error('Fréquence : entier de 1 à 3650 jours');
    if(!Number.isSafeInteger(out.minutes)||out.minutes<1||out.minutes>1440)throw Error('Durée : entier de 1 à 1440 minutes');
    if(!Array.isArray(out.history)||out.history.length>MAX_HISTORY||out.history.some(x=>!validDate(x))||new Set(out.history).size!==out.history.length)throw Error('Historique invalide');
    out.history=[...out.history].sort();
    return out;
  }
  function validateBackup(data){
    if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)throw Error('Sauvegarde incompatible');
    const seen=new Set();const result=data.records.map(r=>{const o=normalizeRecord(r);if(seen.has(o.id))throw Error('Identifiants en double');seen.add(o.id);return o;});
    if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop volumineuse');return result;
  }
  function backup(records){const clean=validateBackup({app:SPEC.slug,version:1,records});const data=JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:clean},null,2);if(data.length>STORAGE_LIMIT)throw Error('Sauvegarde trop volumineuse');return data;}
  function statusOf(r,today){const d=addDays(r.last,r.every),days=diffDays(d,today);return {next:d,days,state:days<0?'late':days===0?'today':days<=7?'soon':'later'};}
  function markDone(row,today){if(!validDate(today))throw Error('Date invalide');const r=normalizeRecord(row);if(today<r.last)throw Error('La date du jour précède la dernière réalisation déclarée. Corrigez la fiche.');
    const h=[...new Set([...r.history,today])].sort().slice(-MAX_HISTORY);return {...r,last:today,history:h};}
  function normalizePeople(records){const names=new Map();for(const r of records){const key=norm(r.person);if(!names.has(key))names.set(key,r.person);}return names;}
  function workload(records){const groups=new Map();for(const r of records){const key=norm(r.person);const z=groups.get(key)||{person:r.person,weekly:0,tasks:0,minutesCycle:0};z.weekly+=r.minutes*7/r.every;z.tasks++;z.minutesCycle+=r.minutes;groups.set(key,z);}return [...groups.values()].sort((a,b)=>b.weekly-a.weekly||a.person.localeCompare(b.person,'fr'));}
  function summary(records,today=dayKey()){
    if(!validDate(today))throw Error('Date de référence invalide');const a=records.map(normalizeRecord);
    const entries=a.map(r=>({...r,...statusOf(r,today)})).sort((x,y)=>x.next.localeCompare(y.next)||x.chore.localeCompare(y.chore,'fr'));
    const late=entries.filter(r=>r.state==='late'),due=entries.filter(r=>r.days<=0),todayCount=entries.filter(r=>r.days===0).length,soon=entries.filter(r=>r.days>0&&r.days<=7).length,completed=a.filter(r=>r.history.includes(today));
    const people=workload(a);return {entries,people,late:late.length,due:due.length,today:todayCount,soon,completed:completed.length,count:a.length,weeklyMinutes:people.reduce((n,r)=>n+r.weekly,0),rows:[...entries.slice(0,12).map(r=>`${r.next} · ${r.chore} (${r.person})`),...people.map(p=>`${p.person} : ${p.weekly.toFixed(1)} min/semaine estimées`)],kpis:[['En retard',String(late.length)],['À faire maintenant',String(due.length)],['Terminées aujourd’hui',String(completed.length)],['À venir sous 7 jours',String(soon)]],notes:['La charge hebdomadaire est une estimation calculée : durée prévue × 7 / fréquence. Elle ne mesure pas le temps effectivement passé.']};
  }
  function compute(records,today=dayKey()){return summary(records,today);}
  function csv(records,today=dayKey()){
    const data=summary(records,today);const escape=v=>'"'+String(v).replace(/"/g,'""').replace(/^[=+\-@\t\r]/,"'$&")+'"';
    const head=['Tâche','Responsable','Pièce','Dernière réalisation','Fréquence (jours)','Durée prévue (min)','Prochaine échéance','Statut','Charge hebdomadaire estimée (min)'];
    return '\ufeff'+[head,...data.entries.map(r=>[r.chore,r.person,r.room,r.last,r.every,r.minutes,r.next,r.state,(r.minutes*7/r.every).toFixed(1)])].map(row=>row.map(escape).join(';')).join('\r\n');
  }
  function ics(records,today=dayKey()){
    const a=summary(records,today).entries;
    function esc(v){return String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
    const stamp=dayKey().replace(/-/g,'')+'T120000Z';const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ChoreWheel//Local Chores//FR','CALSCALE:GREGORIAN'];
    for(const r of a){const start=r.next.replace(/-/g,'');lines.push('BEGIN:VEVENT','UID:'+r.id+'@chorewheel.local','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+start,'SUMMARY:'+esc(r.chore+' — '+r.person),'DESCRIPTION:'+esc('Pièce : '+(r.room||'non précisée')+' ; '+r.minutes+' min estimées'),'RRULE:FREQ=DAILY;INTERVAL='+r.every,'END:VEVENT');}
    lines.push('END:VCALENDAR');return lines.join('\r\n')+'\r\n';
  }
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,MAX_HISTORY,validDate,dayKey,diffDays,addDays,norm,normalizeRecord,validateBackup,backup,statusOf,markDone,workload,summary,compute,csv,ics});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;