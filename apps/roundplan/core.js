/* RoundPlan v2: local, deterministic workout scheduling. No remote dependencies. */
'use strict';
const AppLogic = (() => {
  const SPEC={slug:'roundplan',title:'RoundPlan',subtitle:'Planifier et chronométrer des séances fractionnées',fields:[
    {key:'exercise',label:'Exercice',type:'text',sample:'Burpees'},
    {key:'work',label:'Effort (secondes)',type:'number',sample:40},
    {key:'rest',label:'Repos (secondes)',type:'number',sample:20},
    {key:'rounds',label:'Nombre de rounds',type:'number',sample:6}
  ]};
  const MAX=500, STORAGE_LIMIT=900000, MAX_SESSION_SECONDS=24*3600;
  function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
  function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
  function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
  function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
  function eur(n){return (n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
  const assertInt=(v,low,high,label)=>{if(!Number.isSafeInteger(v)||v<low||v>high)throw Error(label+` : entier de ${low} à ${high} requis`);};
  function normalizeRecord(record){
    if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(record.id))throw Error('Identifiant invalide');
    const keys=['id','exercise','work','rest','rounds'];if(Object.keys(record).some(k=>!keys.includes(k)))throw Error('Champ inattendu dans une fiche');
    if(typeof record.exercise!=='string'||!record.exercise.trim()||record.exercise.length>120||/[\u0000-\u001f]/.test(record.exercise))throw Error('Nom d’exercice incorrect');
    assertInt(record.work,1,3600,'Effort');assertInt(record.rest,0,1800,'Repos');assertInt(record.rounds,1,100,'Rounds');
    const total=record.rounds*record.work+(record.rounds-1)*record.rest;
    if(total>MAX_SESSION_SECONDS)throw Error('Exercice trop long : maximum 24 heures');
    return {id:record.id,exercise:record.exercise.trim(),work:record.work,rest:record.rest,rounds:record.rounds};
  }
  function validateBackup(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj)||obj.app!==SPEC.slug||obj.version!==1||!Array.isArray(obj.records)||obj.records.length>MAX)throw Error('Sauvegarde incompatible ou trop volumineuse');
    if(Object.keys(obj).some(k=>!['app','version','exportedAt','records'].includes(k)))throw Error('Champ de sauvegarde inconnu');
    const ids=new Set(),records=obj.records.map(row=>{const x=normalizeRecord(row);if(ids.has(x.id))throw Error('Identifiant dupliqué');ids.add(x.id);return x});
    if(JSON.stringify(obj).length>STORAGE_LIMIT)throw Error('Fichier de sauvegarde trop volumineux');
    return records;
  }
  function backup(records){const rows=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:rows},null,2)}
  function formatSeconds(s){if(!Number.isFinite(s)||s<0)throw Error('Temps incorrect');const n=Math.ceil(s);const h=Math.floor(n/3600),m=Math.floor(n%3600/60),sec=n%60;return h?h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'):m+':'+String(sec).padStart(2,'0')}
  function buildTimeline(records){
    if(!Array.isArray(records)||records.length>MAX)throw Error('Programme invalide');
    const phases=[],normalized=records.map(normalizeRecord);let elapsed=0,totalRounds=0,workSeconds=0,restSeconds=0;
    for(let index=0;index<normalized.length;index++){
      const row=normalized[index];totalRounds+=row.rounds;
      for(let round=1;round<=row.rounds;round++){
        const effort={kind:'work',label:'Effort',exercise:row.exercise,exerciseIndex:index,round,rounds:row.rounds,duration:row.work,start:elapsed,end:elapsed+row.work};
        phases.push(effort);elapsed=effort.end;workSeconds+=row.work;
        if(round<row.rounds&&row.rest>0){const rest={kind:'rest',label:'Récupération',exercise:row.exercise,exerciseIndex:index,round,rounds:row.rounds,duration:row.rest,start:elapsed,end:elapsed+row.rest};phases.push(rest);elapsed=rest.end;restSeconds+=row.rest;}
      }
    }
    if(elapsed>MAX_SESSION_SECONDS)throw Error('Programme de plus de 24 h : réduisez les exercices');
    return {phases,totalSeconds:elapsed,totalRounds,workSeconds,restSeconds,exercises:normalized.length};
  }
  function locatePhase(program,seconds){
    if(!program||!Array.isArray(program.phases)||!Number.isFinite(program.totalSeconds)||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0)throw Error('État du chronomètre invalide');
    if(seconds>=program.totalSeconds||!program.phases.length)return {finished:true,index:program.phases.length,phase:null,remaining:0,elapsed:program.totalSeconds,progress:1};
    let lo=0,hi=program.phases.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(seconds>=program.phases[mid].end)lo=mid+1;else hi=mid;}
    const phase=program.phases[lo];return {finished:false,index:lo,phase,remaining:Math.max(0,Math.ceil(phase.end-seconds)),elapsed:seconds,progress:program.totalSeconds?seconds/program.totalSeconds:1};
  }
  function compute(records,today=dayKey()){
    if(!validDate(today))throw Error('Date du jour invalide');
    const p=buildTimeline(records);
    return {kpis:[['Durée programmée',Math.ceil(p.totalSeconds/60)+' min'],['Rounds',String(p.totalRounds)],['Exercices',String(p.exercises)],['Effort',formatSeconds(p.workSeconds)],['Repos',formatSeconds(p.restSeconds)]],
      notes:['Aucun repos après le dernier round d’un exercice. Les exercices s’enchaînent directement : ajoutez un bloc de récupération si besoin.','Minuterie à déclencher manuellement. Elle continue à mesurer le temps écoulé si l’onglet est en arrière-plan, mais le navigateur peut retarder les signaux visuels ou sonores.'],
      rows:records.map(r=>normalizeRecord(r)).map(r=>r.exercise+' : '+r.rounds+' × '+r.work+' s / '+r.rest+' s repos')};
  }
  const presets=[
    {name:'Tabata',exercise:'Tabata libre',work:20,rest:10,rounds:8},
    {name:'HIIT',exercise:'Intervalles HIIT',work:40,rest:20,rounds:6},
    {name:'Mobilité',exercise:'Mobilité',work:45,rest:15,rounds:5}
  ];
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,MAX_SESSION_SECONDS,presets,dayKey,validDate,diffDays,addDays,eur,normalizeRecord,validateBackup,backup,formatSeconds,buildTimeline,locatePhase,compute});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;