/* QuizCraft v2 : validation, synthèse et sessions sans navigateur. */
'use strict';
const AppLogic=(()=>{
 const SPEC=Object.freeze({slug:'quizcraft',title:'QuizCraft',subtitle:'Créer et réviser des mini-quiz personnels',
  description:'Fiches de questions et auto-évaluation',
  fields:[
   {key:'question',label:'Question',type:'text',sample:'Quelle est la capitale du Japon ?'},
   {key:'answer',label:'Réponse attendue',type:'text',sample:'Tokyo'},
   {key:'category',label:'Thème',type:'text',sample:'Géographie'},
   {key:'difficulty',label:'Difficulté',type:'select',options:['facile','moyen','difficile'],sample:'facile'},
   {key:'mastered',label:'Maîtrisée ?',type:'select',options:['non','oui'],sample:'non'}]});
 const MAX=500,STORAGE_LIMIT=900000;
 const DIFFICULTY=Object.freeze({facile:0,moyen:1,difficile:2});
 function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());}
 function validDate(s){
  if(typeof s!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const [y,m,day]=s.split('-').map(Number);
  if(y<1||m<1||m>12||day<1||day>31)return false;
  const date=new Date(0);date.setFullYear(y,m-1,day);date.setHours(12,0,0,0);
  return date.getFullYear()===y&&date.getMonth()+1===m&&date.getDate()===day;
 }
 function diffDays(a,b){
  if(!validDate(a)||!validDate(b))throw Error('Date invalide');
  const utc=s=>{const [y,m,d]=s.split('-').map(Number),x=new Date(0);x.setUTCFullYear(y,m-1,d);x.setUTCHours(12,0,0,0);return x.getTime();};
  return Math.round((utc(a)-utc(b))/86400000);
 }
 function addDays(s,n){
  if(!validDate(s)||!Number.isSafeInteger(n)||Math.abs(n)>100000)throw Error('Décalage de date invalide');
  const [y,m,d]=s.split('-').map(Number),x=new Date(0);
  x.setUTCFullYear(y,m-1,d+n);x.setUTCHours(12,0,0,0);
  return String(x.getUTCFullYear()).padStart(4,'0')+'-'+String(x.getUTCMonth()+1).padStart(2,'0')+'-'+String(x.getUTCDate()).padStart(2,'0');
 }
 function eur(cents){return (cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});}
 function normalizeRecord(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!/^[A-Za-z0-9_-]{4,80}$/.test(raw.id))throw Error('Identifiant invalide');
  const out={id:raw.id};
  for(const f of SPEC.fields){
   const v=raw[f.key];
   if(f.type==='select'){
    if(!f.options.includes(v))throw Error(f.label+' : choix invalide');
    out[f.key]=v;
   }else{
    const max=f.key==='category'?160:1200;
    if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(f.label+' : texte requis ('+max+' caractères maximum)');
    out[f.key]=v.trim();
   }
  }
  return out;
 }
 function validateBackup(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||
     !Array.isArray(data.records)||data.records.length>MAX)throw Error('Sauvegarde incompatible ou limite de fiches atteinte');
  if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop volumineuse');
  const ids=new Set();
  return data.records.map(r=>{const item=normalizeRecord(r);if(ids.has(item.id))throw Error('Identifiant dupliqué');ids.add(item.id);return item;});
 }
 function backup(records){
  const r=validateBackup({app:SPEC.slug,version:1,records});
  const text=JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:r},null,2);
  if(text.length>STORAGE_LIMIT)throw Error('Sauvegarde JSON trop volumineuse');
  return text;
 }
 function fold(v){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();}
 function filterRecords(records,{query='',category='all',mastered='all',difficulty='all',order='recent'}={}){
  if(!['all','oui','non'].includes(mastered)||!['all','facile','moyen','difficile'].includes(difficulty)||
     !['recent','difficulty','category'].includes(order)||typeof query!=='string'||typeof category!=='string')
   throw Error('Filtre invalide');
  const items=validateBackup({app:SPEC.slug,version:1,records});
  const needle=fold(query),needleCat=fold(category);
  return items.map((item,index)=>({item,index})).filter(({item})=>
   (category==='all'||fold(item.category)===needleCat)&&(mastered==='all'||item.mastered===mastered)&&
   (difficulty==='all'||item.difficulty===difficulty)&&
   fold(item.question+' '+item.answer+' '+item.category).includes(needle)
  ).sort((a,b)=>{
    if(order==='recent')return b.index-a.index;
    if(order==='difficulty')return DIFFICULTY[b.item.difficulty]-DIFFICULTY[a.item.difficulty]||a.index-b.index;
    return a.item.category.localeCompare(b.item.category,'fr')||a.index-b.index;
  }).map(x=>x.item);
 }
 function compute(records,today=dayKey()){
  if(!validDate(today))throw Error('Date du jour invalide');
  const list=validateBackup({app:SPEC.slug,version:1,records});
  const groups=new Map();let mastered=0;
  for(const r of list){
   if(r.mastered==='oui')mastered++;
   let group=groups.get(r.category);
   if(!group){group={category:r.category,total:0,mastered:0};groups.set(r.category,group);}
   group.total++;
   if(r.mastered==='oui')group.mastered++;
  }
  const categories=[...groups.values()].map(g=>({...g,percent:Math.round(100*g.mastered/g.total)}))
   .sort((a,b)=>a.category.localeCompare(b.category,'fr'));
  return {
   kpis:[['Questions',String(list.length)],['Maîtrisées',String(mastered)],['À revoir',String(list.length-mastered)],
    ['Progression',list.length?Math.round(100*mastered/list.length)+' %':'0 %']],
   notes:['La maîtrise est déclarée par l’utilisateur : aucun contrôle automatique des réponses libres.'],
   categories,rows:categories.map(g=>g.category+' : '+g.mastered+'/'+g.total+' maîtrisées')
  };
 }
 function makeDeck(records,{count=10,unmasteredOnly=false,random=Math.random}={}){
  if(!Number.isSafeInteger(count)||count<1||count>MAX||typeof random!=='function')throw Error('Taille de quiz invalide');
  const data=validateBackup({app:SPEC.slug,version:1,records})
   .filter(x=>!unmasteredOnly||x.mastered==='non').slice();
  for(let i=data.length-1;i>0;i--){
   const val=random();
   if(typeof val!=='number'||!Number.isFinite(val)||val<0||val>=1)throw Error('Mélange aléatoire invalide');
   const j=Math.floor(val*(i+1));[data[i],data[j]]=[data[j],data[i]];
  }
  return data.slice(0,count);
 }
 function csvCell(value){
  const raw=String(value),safe=/^\s*[=+@\-\t\r\n]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replaceAll('"','""')+'"';
 }
 function toCSV(records){
  const list=validateBackup({app:SPEC.slug,version:1,records});
  const rows=[['Question','Réponse','Thème','Difficulté','Maîtrisée']];
  for(const x of list)rows.push([x.question,x.answer,x.category,x.difficulty,x.mastered]);
  return '\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
 }
 return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,validDate,diffDays,addDays,eur,
  normalizeRecord,validateBackup,backup,compute,filterRecords,makeDeck,toCSV});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;
