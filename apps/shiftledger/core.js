/* ShiftLedger v2 : heures civiles, rémunération théorique et stockage validé. */
(function(root){'use strict';
const MAX=500,MAX_BYTES=300000;
const n=(v,min,max,msg)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(msg+' invalide');return v;};
function minutes(s){
 if(typeof s!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Heure invalide');
 const [h,m]=s.split(':').map(Number);return 60*h+m;
}
function date(s){
 if(typeof s!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Date invalide');
 const [y,m,d]=s.split('-').map(Number);
 if(y<1||m<1||m>12||d<1||d>31)throw Error('Date invalide');
 const x=new Date(0);x.setUTCFullYear(y,m-1,d);x.setUTCHours(12,0,0,0);
 if(x.getUTCFullYear()!==y||x.getUTCMonth()+1!==m||x.getUTCDate()!==d)throw Error('Date invalide');
 return s;
}
function todayKey(now=new Date()){
 const p=n=>String(n).padStart(2,'0');
 return now.getFullYear()+'-'+p(now.getMonth()+1)+'-'+p(now.getDate());
}
function shift(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||
  Object.keys(v).some(k=>!['id','date','start','end','breakMinutes','label'].includes(k)))throw Error('Service invalide');
 if(typeof v.id!=='string'||!/^s_[a-z0-9-]{6,50}$/i.test(v.id))throw Error('Identifiant invalide');
 date(v.date);const a=minutes(v.start),b=minutes(v.end);
 if(a===b)throw Error('Début et fin identiques : durée de 24 h ambiguë');
 const duration=b>a?b-a:b+1440-a;
 n(v.breakMinutes,0,600,'Pause');
 if(!Number.isInteger(v.breakMinutes)||v.breakMinutes>=duration)throw Error('Pause supérieure ou égale au service');
 if(typeof v.label!=='string'||v.label.length>50)throw Error('Étiquette invalide');
 return {...v,minutes:duration-v.breakMinutes,grossMinutes:duration,overnight:b<a};
}
function params(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||
  Object.keys(p).some(x=>!['rate','threshold','multiplier'].includes(x)))throw Error('Paramètres invalides');
 return {rate:n(p.rate,0,1000,'Taux'),threshold:n(p.threshold,1,24,'Seuil'),multiplier:n(p.multiplier,1,4,'Majoration')};
}
function backup(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1||
  !Array.isArray(input.shifts)||input.shifts.length>MAX||!input.params||
  Object.keys(input).some(x=>!['version','shifts','params'].includes(x)))throw Error('Sauvegarde invalide');
 const p=params(input.params),ids=new Set();
 const shifts=input.shifts.map(raw=>{
  const {minutes,grossMinutes,overnight,...s}=shift(raw);
  if(ids.has(s.id))throw Error('Service dupliqué');
  ids.add(s.id);return s;
 });
 const data={version:1,shifts,params:p};
 if(JSON.stringify(data).length>MAX_BYTES)throw Error('Sauvegarde trop grande');
 return data;
}
function compute(shifts,p){
 // Validation de la liste entière, y compris de l'unicité des identifiants.
 const data=backup({version:1,shifts,params:p});
 const days=new Map();let total=0,grossMinutes=0,breakMinutes=0,overnightCount=0;
 for(const raw of data.shifts){
  const item=shift(raw);
  total+=item.minutes;grossMinutes+=item.grossMinutes;breakMinutes+=item.breakMinutes;
  if(item.overnight)overnightCount++;
  days.set(item.date,(days.get(item.date)||0)+item.minutes);
 }
 const limit=Math.round(data.params.threshold*60);
 let normal=0,overtime=0;
 for(const time of days.values()){normal+=Math.min(time,limit);overtime+=Math.max(0,time-limit);}
 const grossCents=Math.round(((normal+overtime*data.params.multiplier)*data.params.rate/60)*100);
 const dayRows=[...days.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,time])=>({
  date:day,total:time,normal:Math.min(time,limit),overtime:Math.max(0,time-limit)
 }));
 return {total,normal,overtime,grossCents,breakMinutes,grossMinutes,
  overnightCount,days:dayRows,dayCount:days.size};
}
function overlapWarnings(shifts){
 const data=backup({version:1,shifts,params:{rate:0,threshold:8,multiplier:1}});
 const ranges=data.shifts.map(raw=>{
  const s=shift(raw);const [y,m,d]=s.date.split('-').map(Number);
  const base=Date.UTC(y,m-1,d),start=base+minutes(s.start)*60000;
  return {id:s.id,start,end:start+s.grossMinutes*60000};
 }).sort((a,b)=>a.start-b.start);
 const warnings=[];
 for(let i=0;i<ranges.length;i++)for(let j=i+1;j<ranges.length&&ranges[j].start<ranges[i].end;j++){
  if(ranges[j].end>ranges[i].start)warnings.push([ranges[i].id,ranges[j].id]);
 }
 return warnings;
}
function csv(shifts){
 const list=backup({version:1,shifts,params:{rate:0,threshold:8,multiplier:1}}).shifts;
 const cell=value=>{
  const v=String(value),safe=/^\s*[=+@\-\t\r\n]/.test(v)?"'"+v:v;
  return '"'+safe.replaceAll('"','""')+'"';
 };
 const rows=[['Date','Début','Fin','Pause (min)','Heures nettes','Étiquette']];
 for(const s of list)rows.push([s.date,s.start,s.end,s.breakMinutes,(shift(s).minutes/60).toFixed(2),s.label]);
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
root.ShiftCore=Object.freeze({MAX,MAX_BYTES,n,minutes,date,todayKey,shift,params,compute,backup,overlapWarnings,csv});
if(typeof module!=='undefined'&&module.exports)module.exports=root.ShiftCore;
})(typeof window==='undefined'?globalThis:window);
