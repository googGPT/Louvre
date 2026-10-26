/* DecisionDeck v2 — deterministic, offline multicriteria decisions. */
'use strict';
const AppLogic = (() => {
 const SPEC = {slug:'decisiondeck',title:'DecisionDeck',subtitle:'Comparer des options avec critères',fields:[{key:'option',label:'Option',type:'text',sample:'Option A'},{key:'criterion',label:'Critère',type:'text',sample:'Prix'},{key:'weight',label:'Poids du critère',type:'number',sample:3},{key:'score',label:'Score / 10',type:'number',sample:8}],description:'Décider avec scores pondérés et transparents'};
 const MAX=500,STORAGE_LIMIT=900000;
 const normalizeName=s=>String(s).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/\s+/g,' ');
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
 function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d}
 function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}
 function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000)}
 function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+Number(n));return dayKey(d)}
 function eur(n){return (n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
 function normalizeRecord(o){
  if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant invalide');
  const result={id:o.id};
  for(const key of ['option','criterion']){if(typeof o[key]!=='string'||!o[key].trim()||o[key].length>160||/[\u0000-\u001f]/.test(o[key]))throw Error(key+' : texte valide requis (160 caractères maximum)');result[key]=o[key].trim().replace(/\s+/g,' ')}
  if(typeof o.weight!=='number'||!Number.isFinite(o.weight)||o.weight<=0||o.weight>1000)throw Error('Poids strictement positif, maximum 1000');
  if(typeof o.score!=='number'||!Number.isFinite(o.score)||o.score<0||o.score>10)throw Error('Score compris entre 0 et 10');
  result.weight=o.weight;result.score=o.score;return result;
 }
 function validateBackup(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)throw Error('Sauvegarde incompatible ou trop volumineuse');
  const ids=new Set();const result=data.records.map(r=>{const v=normalizeRecord(r);if(ids.has(v.id))throw Error('Identifiant en double');ids.add(v.id);return v});
  if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop grande');return result;
 }
 function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2)}
 function analyze(records){
  const issues=[],options=new Map(),criteria=new Map(),duplicateIssues=new Set(),weightsIssues=new Set();
  for(const r of records){
   const ok=normalizeName(r.option),ck=normalizeName(r.criterion);
   if(!options.has(ok))options.set(ok,{name:r.option,values:new Map()});
   if(!criteria.has(ck))criteria.set(ck,{name:r.criterion,weight:r.weight});
   if(!options.get(ok).values.has(ck))options.get(ok).values.set(ck,r);
   else duplicateIssues.add('Doublon : '+options.get(ok).name+' / '+criteria.get(ck).name);
   if(Math.abs(criteria.get(ck).weight-r.weight)>1e-9)weightsIssues.add('Poids incohérents pour « '+criteria.get(ck).name+' » : utilisez le même poids pour chaque option.');
  }
  issues.push(...duplicateIssues,...weightsIssues);
  for(const entry of options.values()){
   const missing=[...criteria].filter(([key])=>!entry.values.has(key)).map(([,value])=>value.name);
   if(missing.length)issues.push('« '+entry.name+' » : critères manquants : '+missing.join(', ')+'.');
  }
  const criterionList=[...criteria].map(([key,value])=>({key,...value}));
  const weightTotal=criterionList.reduce((s,c)=>s+c.weight,0);
  const matrix=[...options].map(([key,opt])=>({key,name:opt.name,entries:criterionList.map(c=>{
   const row=opt.values.get(c.key);return {criterion:c.name,weight:c.weight,score:row?.score??null,contribution:row?row.score*c.weight/weightTotal:null};
  })}));
  const comparable=issues.length===0&&criterionList.length>0&&matrix.length>0;
  const ranking=comparable?matrix.map(r=>({name:r.name,key:r.key,score:r.entries.reduce((s,e)=>s+e.score*e.weight,0)/weightTotal,parts:r.entries})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'fr')):[];
  // One-at-a-time weight stress test: halve or double each criterion, keeping scores unchanged.
  const sensitivity=[];
  if(comparable&&ranking.length>=2){
   for(const c of criterionList){const affected=[];for(const multiplier of [0.5,2]){
    const sorted=ranking.map(r=>({name:r.name,score:r.parts.reduce((s,p)=>s+p.score*p.weight*(normalizeName(p.criterion)===c.key?multiplier:1),0)/(weightTotal+(multiplier-1)*c.weight)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'fr'));
    if(sorted[0].name!==ranking[0].name)affected.push((multiplier===2?'×2':'÷2')+' → '+sorted[0].name);
   }if(affected.length)sensitivity.push('« '+c.name+' » : '+affected.join('; '));
   }
  }
  const kpis=[['Options',String(matrix.length)],['Meilleure note',ranking.length?ranking[0].score.toFixed(2)+'/10':'—'],['Critères',String(criterionList.length)],['Comparabilité',comparable?'Validée':'À compléter']];
  const notes=comparable?[matrix.length===1?'Une seule option : ajoutez une alternative pour comparer.':'Classement comparable : mêmes critères et mêmes poids pour chaque option.','Toutes les notes doivent être orientées de façon identique : 10 = meilleur résultat, même pour le prix.',sensitivity.length?'Le premier rang change dans certains scénarios de pondération.':'Le premier rang reste identique lorsque chaque poids est divisé par deux ou doublé séparément (test limité).']:[
   'Classement suspendu : les options doivent être notées sur les mêmes critères, avec des poids identiques par critère.',...issues];
  const rows=ranking.map((r,i)=>(i+1)+'. '+r.name+' : '+r.score.toFixed(2)+'/10');
  return {kpis,notes,rows,issues,comparable,criteria:criterionList,matrix,ranking,sensitivity};
 }
 function compute(records,today=dayKey()){if(!validDate(today))throw Error('Date invalide');if(!Array.isArray(records)||records.length>MAX)throw Error('Nombre de fiches invalide');return analyze(records.map(normalizeRecord))}
 function csvCell(s){let value=String(s??'');if(/^[\s]*[=+@\-\t\r]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"'}
 function reportCSV(records){const r=compute(records);const heads=['Option','Critère','Poids','Note / 10','Contribution pondérée','Classement disponible'];const matrix=new Map(r.ranking.map((v,i)=>[v.key,i+1]));const total=r.criteria.reduce((s,c)=>s+c.weight,0);const recordsOut=records.map(normalizeRecord).map(v=>[v.option,v.criterion,v.weight,v.score,total?(v.score*v.weight/total).toFixed(4):'',r.comparable?matrix.get(normalizeName(v.option)):'Non comparable']);return '\uFEFF'+[heads,...recordsOut].map(row=>row.map(csvCell).join(';')).join('\r\n')}
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,eur,normalizeName,normalizeRecord,validateBackup,backup,compute,reportCSV});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;