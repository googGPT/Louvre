/* GoalLadder v2 : contrats, progression et échéances, sans dépendance navigateur. */
'use strict';
const AppLogic=(()=>{
  const SPEC=Object.freeze({
    // Libellés : clés de traduction (messages.js). Les valeurs des listes (non/oui, haute/normale/basse)
    // restent en français dans les données enregistrées et sont traduites à l'affichage.
    slug:'goalladder',title:'GoalLadder',subtitle:'meta.title',
    description:'meta.description',
    fields:[
      {key:'goal',label:'f.goal',type:'text',sample:'Réussir mon mémoire'},
      {key:'milestone',label:'f.milestone',type:'text',sample:'Finaliser la bibliographie'},
      {key:'due',label:'f.due',type:'date',sample:'2026-11-10'},
      {key:'done',label:'f.done',type:'select',options:['non','oui'],sample:'non'},
      {key:'priority',label:'f.priority',type:'select',options:['haute','normale','basse'],sample:'haute'}
    ]
  });
  const MAX=500,STORAGE_LIMIT=900000;
  const PRIORITIES=Object.freeze({haute:0,normale:1,basse:2});
  // Erreurs : clés de traduction (« err.x » ou « err.x|{json} »), traduites par l'interface.
  const fail=(k,p)=>{throw Error(p?k+'|'+JSON.stringify(p):k);};
  function dayKey(date=new Date()){
    const f=n=>String(n).padStart(2,'0');
    return date.getFullYear()+'-'+f(date.getMonth()+1)+'-'+f(date.getDate());
  }
  function dateUTC(s){
    const [year,month,day]=s.split('-').map(Number);
    const d=new Date(0);
    d.setUTCHours(12,0,0,0);
    d.setUTCFullYear(year,month-1,day);
    return d;
  }
  function validDate(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
    const [y,m,d]=s.split('-').map(Number);
    if(y<1||m<1||m>12||d<1||d>31)return false;
    const z=dateUTC(s);
    return z.getUTCFullYear()===y&&z.getUTCMonth()+1===m&&z.getUTCDate()===d;
  }
  function diffDays(a,b){
    if(!validDate(a)||!validDate(b))fail('err.date');
    return Math.round((dateUTC(a).getTime()-dateUTC(b).getTime())/86400000);
  }
  function addDays(s,n){
    if(!validDate(s)||!Number.isSafeInteger(n)||Math.abs(n)>100000)fail('err.dayShift');
    const d=dateUTC(s);d.setUTCDate(d.getUTCDate()+n);
    return String(d.getUTCFullYear()).padStart(4,'0')+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }
  function normalizeRecord(r){
    if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(r.id))
      fail('err.id');
    const out={id:r.id};
    for(const f of SPEC.fields){
      const v=r[f.key];
      if(f.type==='text'){
        if(typeof v!=='string'||!v.trim()||v.length>160)fail('err.'+f.key,{max:160});
        out[f.key]=v.trim();
      }else if(f.type==='date'){
        if(!validDate(v))fail('err.'+f.key);
        out[f.key]=v;
      }else if(f.type==='select'){
        if(!f.options.includes(v))fail('err.'+f.key);
        out[f.key]=v;
      }
    }
    return out;
  }
  function validateBackup(data){
    if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||
       !Array.isArray(data.records)||data.records.length>MAX)
      fail('err.backup');
    if(JSON.stringify(data).length>STORAGE_LIMIT)fail('err.backupBig');
    const ids=new Set();
    return data.records.map(raw=>{
      const item=normalizeRecord(raw);
      if(ids.has(item.id))fail('err.duplicateId');
      ids.add(item.id);return item;
    });
  }
  function backup(records){
    const clean=validateBackup({app:SPEC.slug,version:1,records});
    return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:clean},null,2);
  }
  function recordStatus(r,today=dayKey()){
    const remaining=diffDays(r.due,today);
    if(r.done==='oui')return 'done';
    if(remaining<0)return 'overdue';
    if(remaining<=7)return 'soon';
    return 'future';
  }
  // locale : langue de l'interface, pour l'ordre alphabétique des objectifs.
  function compute(records,today=dayKey(),locale='fr'){
    if(!validDate(today))fail('err.today');
    const items=validateBackup({app:SPEC.slug,version:1,records});
    // Map protège les noms tels que "constructor", "toString" et "__proto__".
    const groups=new Map();
    let done=0,soon=0,overdue=0;
    for(const item of items){
      let g=groups.get(item.goal);
      if(!g){g={name:item.goal,total:0,done:0,soon:0,overdue:0,nextDue:null};groups.set(item.goal,g);}
      g.total++;
      const state=recordStatus(item,today);
      if(state==='done'){done++;g.done++;}
      else {
        if(g.nextDue===null||item.due<g.nextDue)g.nextDue=item.due;
        if(state==='soon'){soon++;g.soon++;}
        if(state==='overdue'){overdue++;g.overdue++;}
      }
    }
    const goalStats=[...groups.values()].map(g=>({
      ...g,progress:Math.round(100*g.done/g.total)
    })).sort((a,b)=>a.name.localeCompare(b.name,locale));
    return { // libellés et notes : clés de traduction
      kpis:[['kpi.goals',String(groups.size)],['kpi.done',String(done)],
        ['kpi.soon',String(soon)],['kpi.overdue',String(overdue)]],
      notes:['note.weight'],
      goalStats,
      rows:goalStats.map(g=>g.name+' · '+g.progress+' % · '+g.done+'/'+g.total)
    };
  }
  function fold(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();}
  // describe(item) : texte traduit supplémentaire pour la recherche (ex. priorité dans la langue choisie).
  function filterRecords(records,{query='',status='all',sort='due',today=dayKey(),describe=()=>''}={}){
    if(!['all','todo','done','soon','overdue'].includes(status)||!['due','priority','recent'].includes(sort))
      fail('err.filter');
    if(!validDate(today))fail('err.today');
    const needle=fold(query),items=validateBackup({app:SPEC.slug,version:1,records});
    return items.map((item,index)=>({item,index})).filter(({item})=>{
      const current=recordStatus(item,today);
      if(status==='done'&&current!=='done')return false;
      if(status==='todo'&&current==='done')return false;
      if(status==='soon'&&current!=='soon')return false;
      if(status==='overdue'&&current!=='overdue')return false;
      return fold(item.goal+' '+item.milestone+' '+item.priority+' '+item.due+' '+describe(item)).includes(needle);
    }).sort((a,b)=>{
      if(sort==='recent')return b.index-a.index;
      if(sort==='priority')return PRIORITIES[a.item.priority]-PRIORITIES[b.item.priority]||a.item.due.localeCompare(b.item.due)||a.index-b.index;
      return a.item.due.localeCompare(b.item.due)||PRIORITIES[a.item.priority]-PRIORITIES[b.item.priority]||a.index-b.index;
    }).map(x=>x.item);
  }
  function csvCell(s){
    const value=String(s);
    const safe=/^\s*[=+@\-\t\r]/.test(value)?"'"+value:value;
    return '"'+safe.replaceAll('"','""')+'"';
  }
  // text : en-têtes et valeurs traduits fournis par l'interface ; par défaut, ceux d'origine (français).
  function toCSV(records,text={}){
    const items=validateBackup({app:SPEC.slug,version:1,records});
    const header=text.header||['Objectif','Étape','Échéance','Terminée','Priorité'],value=text.value||((key,v)=>v);
    const rows=[header];
    for(const r of items)rows.push([r.goal,r.milestone,r.due,value('done',r.done),value('priority',r.priority)]);
    return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
  }
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,validDate,diffDays,addDays,
    normalizeRecord,validateBackup,backup,recordStatus,compute,filterRecords,toCSV});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
