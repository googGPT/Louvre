/* GradePilot v2 — calculs purs et validation des sauvegardes historiques. */
(function(root){'use strict';
const MAX=200,MAX_BYTES=500000,EPSILON=1e-9;
// Les erreurs portent une clé de traduction (+ paramètres JSON après « | ») ; {field} est un code de champ traduit par l'interface.
function fail(key,params){throw new Error(params?key+'|'+JSON.stringify(params):key);}
function number(value,min,max,label){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('err.number',{field:label});
 return value;
}
function grade(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).some(k=>!['id','label','score','coefficient'].includes(k)))fail('err.record');
 if(typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{4,60}$/.test(value.id))fail('err.id');
 if(typeof value.label!=='string'||!value.label.trim()||value.label.length>64)fail('err.label');
 number(value.score,0,20,'score');number(value.coefficient,.01,100,'coefficient');
 return {id:value.id,label:value.label.trim(),score:value.score,coefficient:value.coefficient};
}
function validateState(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==1||
  !Array.isArray(raw.grades)||raw.grades.length>MAX||
  Object.keys(raw).some(k=>!['version','grades'].includes(k)))fail('err.format');
 const ids=new Set(),grades=raw.grades.map(item=>{
  const normalized=grade(item);if(ids.has(normalized.id))fail('err.dupId');
  ids.add(normalized.id);return normalized;
 });
 const clean={version:1,grades};
 if(JSON.stringify(clean).length>MAX_BYTES)fail('err.tooBig');
 return clean;
}
function normalizeGrades(grades){return validateState({version:1,grades}).grades;}
function totals(grades){
 const list=normalizeGrades(grades);
 let earned=0,weight=0;
 for(const g of list){earned+=g.score*g.coefficient;weight+=g.coefficient;}
 return {earned,weight};
}
function weightedAverage(grades){
 const t=totals(grades);return t.weight? t.earned/t.weight:null;
}
function projectedAverage(grades,nextScore,nextCoefficient){
 number(nextScore,0,20,'nextScore');
 number(nextCoefficient,.01,100,'nextCoefficient');
 const t=totals(grades);
 return (t.earned+nextScore*nextCoefficient)/(t.weight+nextCoefficient);
}
function requirement(grades,target,nextCoefficient){
 number(target,0,20,'target');number(nextCoefficient,.01,100,'nextCoefficient');
 const t=totals(grades),raw=(target*(t.weight+nextCoefficient)-t.earned)/nextCoefficient;
 const required=Math.abs(raw)<EPSILON?0:raw;
 const status=required<=EPSILON?'already':required>20+EPSILON?'impossible':'possible';
 return {required,feasible:status!=='impossible',status,
  minAverage: t.earned/(t.weight+nextCoefficient),
  maxAverage:(t.earned+20*nextCoefficient)/(t.weight+nextCoefficient)};
}
function minimumScore(grades,target,nextCoefficient,decimals=2){
 if(!Number.isInteger(decimals)||decimals<0||decimals>3)fail('err.precision');
 const result=requirement(grades,target,nextCoefficient);
 if(result.status==='impossible')return null;
 if(result.status==='already')return 0;
 const factor=10**decimals;
 // Arrondir vers le haut évite d'annoncer à tort qu'une note arrondie suffit.
 let rounded=Math.ceil((result.required-1e-10)*factor)/factor;
 if(rounded>20&&result.required<=20+EPSILON)rounded=20;
 return rounded;
}
// En-têtes fournis par l'interface (français par défaut) ; l'échelle reste sur 20.
function toCSV(grades,head=['Évaluation','Note /20','Coefficient']){
 const list=normalizeGrades(grades);
 const cell=v=>{
  const raw=String(v),safe=/^\s*[=+@\-\t\r\n]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replaceAll('"','""')+'"';
 };
 return '\uFEFF'+[head,...list.map(g=>[g.label,g.score,g.coefficient])]
  .map(row=>row.map(cell).join(';')).join('\r\n');
}
root.GradeCore=Object.freeze({MAX,MAX_BYTES,number,grade,validateState,weightedAverage,projectedAverage,requirement,minimumScore,toCSV});
if(typeof module!=='undefined'&&module.exports)module.exports=root.GradeCore;
})(typeof window==='undefined'?globalThis:window);
