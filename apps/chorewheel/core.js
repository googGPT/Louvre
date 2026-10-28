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
  // Errors carry a translation key (+ JSON parameters after « | »), translated by the interface (messages.js).
  const fail=(key,params)=>{throw Error(params?key+'|'+JSON.stringify(params):key);};
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);if(y<1900||y>2100)return false;const t=new Date(Date.UTC(y,m-1,d,12));return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d;}
  function dayKey(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function dayUTC(s){if(!validDate(s))fail('err.date');const [y,m,d]=s.split('-').map(Number);return Date.UTC(y,m-1,d,12);}
  function diffDays(a,b){return Math.round((dayUTC(a)-dayUTC(b))/86400000);}
  function addDays(s,n){if(!Number.isInteger(n)||Math.abs(n)>100000)fail('err.interval');const t=new Date(dayUTC(s)+n*86400000);return t.toISOString().slice(0,10);}
  function norm(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim().replace(/\s+/g,' ');}
  function text(v,name,max=100,optional=false){if(typeof v!=='string'||v.length>max||(!optional&&!v.trim())||/[\u0000-\u001f]/.test(v))fail('err.text',{field:name,max});return v.trim();}
  function normalizeRecord(o){
    if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[A-Za-z0-9_-]{4,80}$/.test(o.id))fail('err.id');
    const out={id:o.id,chore:text(o.chore,'chore'),person:text(o.person,'person'),room:text(o.room===undefined?'':o.room,'room',70,true),last:o.last,every:o.every,minutes:o.minutes,history:o.history===undefined?[]:o.history};
    if(!validDate(out.last))fail('err.last');
    if(!Number.isSafeInteger(out.every)||out.every<1||out.every>3650)fail('err.every',{max:3650});
    if(!Number.isSafeInteger(out.minutes)||out.minutes<1||out.minutes>1440)fail('err.minutes',{max:1440});
    if(!Array.isArray(out.history)||out.history.length>MAX_HISTORY||out.history.some(x=>!validDate(x))||new Set(out.history).size!==out.history.length)fail('err.history');
    out.history=[...out.history].sort();
    return out;
  }
  function validateBackup(data){
    if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)fail('err.backup');
    if(Object.keys(data).some(k=>!['app','version','records','exportedAt'].includes(k))||(owns(data,'exportedAt')&&typeof data.exportedAt!=='string'))fail('err.backup');
    const seen=new Set();const result=data.records.map(r=>{const o=normalizeRecord(r);if(seen.has(o.id))fail('err.dupId');seen.add(o.id);return o;});
    if(JSON.stringify(data).length>STORAGE_LIMIT)fail('err.tooBig');return result;
  }
  function backup(records){const clean=validateBackup({app:SPEC.slug,version:1,records});const data=JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:clean},null,2);if(data.length>STORAGE_LIMIT)fail('err.tooBig');return data;}
  function statusOf(r,today){const d=addDays(r.last,r.every),days=diffDays(d,today);return {next:d,days,state:days<0?'late':days===0?'today':days<=7?'soon':'later'};}
  function markDone(row,today){if(!validDate(today))fail('err.date');const r=normalizeRecord(row);if(today<r.last)fail('err.before');
    const h=[...new Set([...r.history,today])].sort().slice(-MAX_HISTORY);return {...r,last:today,history:h};}
  function normalizePeople(records){const names=new Map();for(const r of records){const key=norm(r.person);if(!names.has(key))names.set(key,r.person);}return names;}
  function workload(records,locale='fr'){const groups=new Map();for(const r of records){const key=norm(r.person);const z=groups.get(key)||{person:r.person,weekly:0,tasks:0,minutesCycle:0};z.weekly+=r.minutes*7/r.every;z.tasks++;z.minutesCycle+=r.minutes;groups.set(key,z);}return [...groups.values()].sort((a,b)=>b.weekly-a.weekly||a.person.localeCompare(b.person,locale));}
  function summary(records,today=dayKey(),locale='fr'){
    if(!validDate(today))fail('err.refDate');const a=records.map(normalizeRecord);
    const entries=a.map(r=>({...r,...statusOf(r,today)})).sort((x,y)=>x.next.localeCompare(y.next)||x.chore.localeCompare(y.chore,locale));
    const late=entries.filter(r=>r.state==='late'),due=entries.filter(r=>r.days<=0),todayCount=entries.filter(r=>r.days===0).length,soon=entries.filter(r=>r.days>0&&r.days<=7).length,completed=a.filter(r=>r.history.includes(today));
    const people=workload(a,locale);return {entries,people,late:late.length,due:due.length,today:todayCount,soon,completed:completed.length,count:a.length,weeklyMinutes:people.reduce((n,r)=>n+r.weekly,0)};
  }
  function compute(records,today=dayKey(),locale='fr'){return summary(records,today,locale);}
  // Generated files: the interface passes translated texts (French by default, as in earlier versions).
  const CSV_FR={head:['Tâche','Responsable','Pièce','Dernière réalisation','Fréquence (jours)','Durée prévue (min)','Prochaine échéance','Statut','Charge hebdomadaire estimée (min)'],state:s=>s,locale:'fr'};
  function csv(records,today=dayKey(),texts=CSV_FR){
    const data=summary(records,today,texts.locale||'fr');const escape=v=>'"'+String(v).replace(/"/g,'""').replace(/^[=+\-@\t\r]/,"'$&")+'"';
    const head=texts.head;
    return '\ufeff'+[head,...data.entries.map(r=>[r.chore,r.person,r.room,r.last,r.every,r.minutes,r.next,texts.state(r.state),(r.minutes*7/r.every).toFixed(1)])].map(row=>row.map(escape).join(';')).join('\r\n');
  }
  const ICS_FR={desc:r=>'Pièce : '+(r.room||'non précisée')+' ; '+r.minutes+' min estimées',lang:'FR'};
  function ics(records,today=dayKey(),texts=ICS_FR){
    const a=summary(records,today).entries;
    function esc(v){return String(v).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
    const stamp=dayKey().replace(/-/g,'')+'T120000Z';const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ChoreWheel//Local Chores//'+(texts.lang||'FR'),'CALSCALE:GREGORIAN'];
    for(const r of a){const start=r.next.replace(/-/g,'');lines.push('BEGIN:VEVENT','UID:'+r.id+'@chorewheel.local','DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+start,'SUMMARY:'+esc(r.chore+' — '+r.person),'DESCRIPTION:'+esc(texts.desc(r)),'RRULE:FREQ=DAILY;INTERVAL='+r.every,'END:VEVENT');}
    // RFC 5545: repli des lignes à 75 octets UTF-8, sans couper un caractère.
    const fold=line=>{
      let part='',bytes=0;const out=[];
      for(const ch of line){
        const cp=ch.codePointAt(0),len=cp<128?1:cp<2048?2:cp<65536?3:4;
        if(bytes+len>75){out.push(part);part=' ';bytes=1;}
        part+=ch;bytes+=len;
      }
      out.push(part);return out;
    };
    lines.push('END:VCALENDAR');return lines.flatMap(fold).join('\r\n')+'\r\n';
  }
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,MAX_HISTORY,validDate,dayKey,diffDays,addDays,norm,normalizeRecord,validateBackup,backup,statusOf,markDone,workload,summary,compute,csv,ics});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;