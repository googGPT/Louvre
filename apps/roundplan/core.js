/* RoundPlan v2: local, deterministic workout scheduling. No remote dependencies.
   Erreurs levées sous forme de clés traduites par l'interface (messages.js) : « err.int|{"field":"work","low":1,"high":3600} ». */
'use strict';
const AppLogic = (() => {
  const SPEC={slug:'roundplan',title:'RoundPlan',subtitle:'Planifier et chronométrer des séances fractionnées',fields:[
    {key:'exercise',type:'text',sample:'Burpees'}, // libellés affichés : messages « field.<key> »
    {key:'work',type:'number',sample:40},
    {key:'rest',type:'number',sample:20},
    {key:'rounds',type:'number',sample:6}
  ]};
  const fail=(key,params)=>{throw Error(params?key+'|'+JSON.stringify(params):key);};
  const MAX=500, STORAGE_LIMIT=900000, MAX_SESSION_SECONDS=24*3600;
  function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
  function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
  function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
  function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
  const assertInt=(v,low,high,field)=>{if(!Number.isSafeInteger(v)||v<low||v>high)fail('err.int',{field,low,high});};
  function normalizeRecord(record){
    if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(record.id))fail('err.id');
    const keys=['id','exercise','work','rest','rounds'];if(Object.keys(record).some(k=>!keys.includes(k)))fail('err.field');
    if(typeof record.exercise!=='string'||!record.exercise.trim()||record.exercise.length>120||/[\u0000-\u001f]/.test(record.exercise))fail('err.name');
    assertInt(record.work,1,3600,'work');assertInt(record.rest,0,1800,'rest');assertInt(record.rounds,1,100,'rounds');
    const total=record.rounds*record.work+(record.rounds-1)*record.rest;
    if(total>MAX_SESSION_SECONDS)fail('err.tooLong');
    return {id:record.id,exercise:record.exercise.trim(),work:record.work,rest:record.rest,rounds:record.rounds};
  }
  function validateBackup(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj)||obj.app!==SPEC.slug||obj.version!==1||!Array.isArray(obj.records)||obj.records.length>MAX)fail('err.backup');
    if(Object.keys(obj).some(k=>!['app','version','exportedAt','records'].includes(k)))fail('err.backupField');
    // Les anciennes sauvegardes sans exportedAt restent compatibles.
    if(Object.prototype.hasOwnProperty.call(obj,'exportedAt')){
      const t=obj.exportedAt;
      if(typeof t!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(t)||!Number.isFinite(Date.parse(t))||new Date(Date.parse(t)).toISOString()!==t)fail('err.backup');
    }
    const ids=new Set(),records=obj.records.map(row=>{const x=normalizeRecord(row);if(ids.has(x.id))fail('err.dup');ids.add(x.id);return x});
    if(JSON.stringify(obj).length>STORAGE_LIMIT)fail('err.fileBig');
    return records;
  }
  function backup(records){const rows=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:rows},null,2)}
  function formatSeconds(s){if(!Number.isFinite(s)||s<0)fail('err.time');const n=Math.ceil(s);const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;return h?h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):m+':'+String(sec).padStart(2,'0')}
  function buildTimeline(records){
    if(!Array.isArray(records)||records.length>MAX)fail('err.program');
    const phases=[],normalized=records.map(normalizeRecord);let elapsed=0,totalRounds=0,workSeconds=0,restSeconds=0;
    for(let index=0;index<normalized.length;index++){
      const row=normalized[index];totalRounds+=row.rounds;
      for(let round=1;round<=row.rounds;round++){
        const effort={kind:'work',exercise:row.exercise,exerciseIndex:index,round,rounds:row.rounds,duration:row.work,start:elapsed,end:elapsed+row.work};
        phases.push(effort);elapsed=effort.end;workSeconds+=row.work;
        if(round<row.rounds&&row.rest>0){const rest={kind:'rest',exercise:row.exercise,exerciseIndex:index,round,rounds:row.rounds,duration:row.rest,start:elapsed,end:elapsed+row.rest};phases.push(rest);elapsed=rest.end;restSeconds+=row.rest;}
      }
    }
    if(elapsed>MAX_SESSION_SECONDS)fail('err.program24');
    return {phases,totalSeconds:elapsed,totalRounds,workSeconds,restSeconds,exercises:normalized.length};
  }
  function locatePhase(program,seconds){
    if(!program||!Array.isArray(program.phases)||!Number.isFinite(program.totalSeconds)||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)fail('err.timer');
    if(seconds>=program.totalSeconds||!program.phases.length)return {finished:true,index:program.phases.length,phase:null,remaining:0,elapsed:program.totalSeconds,progress:1};
    let lo=0,hi=program.phases.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(seconds>=program.phases[mid].end)lo=mid+1;else hi=mid;}
    const phase=program.phases[lo];return {finished:false,index:lo,phase,remaining:Math.max(0,Math.ceil(phase.end-seconds)),elapsed:seconds,progress:program.totalSeconds?seconds/program.totalSeconds:1};
  }
  // Indicateurs en nombres : [clé du libellé, valeur, unité] ; l'interface les met en forme et les traduit.
  function compute(records,today=dayKey()){
    if(!validDate(today))fail('err.today');
    const p=buildTimeline(records);
    return {kpis:[['kpi.duration',Math.ceil(p.totalSeconds/60),'min'],['kpi.rounds',p.totalRounds,'count'],['kpi.exercises',p.exercises,'count'],['kpi.work',p.workSeconds,'clock'],['kpi.rest',p.restSeconds,'clock']]};
  }
  const presets=[ // nom de l'exercice proposé : messages « preset.<key> »
    {key:'tabata',work:20,rest:10,rounds:8},
    {key:'hiit',work:40,rest:20,rounds:6},
    {key:'mobility',work:45,rest:15,rounds:5}
  ];
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,MAX_SESSION_SECONDS,presets,dayKey,validDate,diffDays,addDays,normalizeRecord,validateBackup,backup,formatSeconds,buildTimeline,locatePhase,compute});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;