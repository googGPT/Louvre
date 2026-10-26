/* GoalLadder v2 : contrats, progression et échéances, sans dépendance navigateur. */
'use strict';
const AppLogic=(()=>{
  const SPEC=Object.freeze({
    slug:'goalladder',title:'GoalLadder',subtitle:'Découper un objectif en étapes',
    description:'Suivre les jalons terminés et les échéances',
    fields:[
      {key:'goal',label:'Objectif',type:'text',sample:'Réussir mon mémoire'},
      {key:'milestone',label:'Étape',type:'text',sample:'Finaliser la bibliographie'},
      {key:'due',label:'Échéance',type:'date',sample:'2026-11-10'},
      {key:'done',label:'Terminée ?',type:'select',options:['non','oui'],sample:'non'},
      {key:'priority',label:'Priorité',type:'select',options:['haute','normale','basse'],sample:'haute'}
    ]
  });
  const MAX=500,STORAGE_LIMIT=900000;
  const PRIORITIES=Object.freeze({haute:0,normale:1,basse:2});
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
    if(!validDate(a)||!validDate(b))throw Error('Date invalide');
    return Math.round((dateUTC(a).getTime()-dateUTC(b).getTime())/86400000);
  }
  function addDays(s,n){
    if(!validDate(s)||!Number.isSafeInteger(n)||Math.abs(n)>100000)throw Error('Décalage de date invalide');
    const d=dateUTC(s);d.setUTCDate(d.getUTCDate()+n);
    return String(d.getUTCFullYear()).padStart(4,'0')+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }
  function eur(n){return (n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});}
  function normalizeRecord(r){
    if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(r.id))
      throw Error('Identifiant invalide');
    const out={id:r.id};
    for(const f of SPEC.fields){
      const v=r[f.key];
      if(f.type==='text'){
        if(typeof v!=='string'||!v.trim()||v.length>160)throw Error(f.label+' : texte requis (160 caractères maximum)');
        out[f.key]=v.trim();
      }else if(f.type==='date'){
        if(!validDate(v))throw Error(f.label+' : date invalide');
        out[f.key]=v;
      }else if(f.type==='select'){
        if(!f.options.includes(v))throw Error(f.label+' : choix invalide');
        out[f.key]=v;
      }
    }
    return out;
  }
  function validateBackup(data){
    if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||
       !Array.isArray(data.records)||data.records.length>MAX)
      throw Error('Sauvegarde incompatible ou nombre de fiches dépassé');
    if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop volumineuse');
    const ids=new Set();
    return data.records.map(raw=>{
      const item=normalizeRecord(raw);
      if(ids.has(item.id))throw Error('Identifiant dupliqué');
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
  function compute(records,today=dayKey()){
    if(!validDate(today))throw Error('Date du jour invalide');
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
    })).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
    return {
      kpis:[['Objectifs',String(groups.size)],['Étapes terminées',String(done)],
        ['À faire sous 7 jours',String(soon)],['En retard',String(overdue)]],
      notes:['Chaque étape a le même poids dans la progression de son objectif. Les échéances passées sont comptées séparément.'],
      goalStats,
      rows:goalStats.map(g=>g.name+' : '+g.progress+' % · '+g.done+'/'+g.total+' terminées · '+g.overdue+' en retard')
    };
  }
  function fold(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();}
  function filterRecords(records,{query='',status='all',sort='due',today=dayKey()}={}){
    if(!['all','todo','done','soon','overdue'].includes(status)||!['due','priority','recent'].includes(sort))
      throw Error('Filtre ou ordre invalide');
    if(!validDate(today))throw Error('Date du jour invalide');
    const needle=fold(query),items=validateBackup({app:SPEC.slug,version:1,records});
    return items.map((item,index)=>({item,index})).filter(({item})=>{
      const current=recordStatus(item,today);
      if(status==='done'&&current!=='done')return false;
      if(status==='todo'&&current==='done')return false;
      if(status==='soon'&&current!=='soon')return false;
      if(status==='overdue'&&current!=='overdue')return false;
      return fold(item.goal+' '+item.milestone+' '+item.priority+' '+item.due).includes(needle);
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
  function toCSV(records){
    const items=validateBackup({app:SPEC.slug,version:1,records});
    const rows=[['Objectif','Étape','Échéance','Terminée','Priorité']];
    for(const r of items)rows.push([r.goal,r.milestone,r.due,r.done,r.priority]);
    return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
  }
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,validDate,diffDays,addDays,eur,
    normalizeRecord,validateBackup,backup,recordStatus,compute,filterRecords,toCSV});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
