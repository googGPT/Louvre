/* SnapAction pure domain, no browser dependencies. MIT-style original implementation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SnapCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const MAX_TASKS = 2000;
  const MAX_IMAGE_CHARS = 1600000;
  const DAY = 86400000;
  const DAYNAMES = { dimanche:0,lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6 };
  const PRIORITIES = ['normal','high'];
  const REPEATS = ['none','daily','weekly','monthly'];
  function isObj(v){return v !== null && typeof v==='object' && !Array.isArray(v);}
  function exactKeys(v, allowed){return isObj(v)&&Object.keys(v).every(k=>allowed.includes(k));}
  function isoDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString()===v;}
  function validDue(v){return v===null || isoDate(v);}
  function validImage(v){return v===null || (typeof v==='string' && v.length<=MAX_IMAGE_CHARS && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v));}
  function validTask(t){
    const keys=['id','title','note','dueAt','createdAt','updatedAt','completedAt','priority','repeat','image'];
    return exactKeys(t,keys) && keys.every(k=>Object.hasOwn(t,k)) &&
      typeof t.id==='string' && /^[a-zA-Z0-9-]{12,80}$/.test(t.id) &&
      typeof t.title==='string' && t.title.trim().length>0 && t.title.length<=180 &&
      typeof t.note==='string' && t.note.length<=2000 &&
      validDue(t.dueAt) && isoDate(t.createdAt) && isoDate(t.updatedAt) && validDue(t.completedAt) &&
      PRIORITIES.includes(t.priority) && REPEATS.includes(t.repeat) && validImage(t.image) &&
      (t.completedAt===null || t.completedAt>=t.createdAt);
  }
  function cleanTitle(v){return String(v||'').trim().replace(/\s+/g,' ');}
  function createTask(data, now=new Date(), uid){
    const title=cleanTitle(data.title);
    if(!title||title.length>180) throw new Error('Le titre doit contenir entre 1 et 180 caractères.');
    const task={
      id:uid||('task-'+now.getTime()+'-'+Math.floor(Math.random()*1e9)),title,
      note:String(data.note||'').trim(),
      dueAt:data.dueAt||null,createdAt:now.toISOString(),updatedAt:now.toISOString(),
      completedAt:null,priority:data.priority||'normal',repeat:data.repeat||'none',image:data.image||null
    };
    if(!validTask(task)) throw new Error('Les données de la tâche sont invalides.');
    return task;
  }
  function localDate(y,m,d,h=9,min=0){
    const x=new Date(y,m-1,d,h,min,0,0);
    return x.getFullYear()===y && x.getMonth()+1===m && x.getDate()===d && x.getHours()===h && x.getMinutes()===min ? x : null;
  }
  function parseCommand(input, now=new Date()){
    if(typeof input!=='string') return {dueAt:null,reason:'',inferred:false};
    const text=input.toLowerCase().normalize('NFC');
    if(text.length>2000) return {dueAt:null,reason:'',inferred:false};
    const relative=text.match(/\bdans\s+(\d{1,3})\s*(minutes?|mins?|heures?|hrs?|jours?)\b/i);
    if(relative){
      const n=Number(relative[1]),unit=relative[2];
      if(n<1) return {dueAt:null,reason:'',inferred:false};
      const ms=unit.startsWith('j')?n*DAY:unit.startsWith('h')?n*3600000:n*60000;
      return {dueAt:new Date(now.getTime()+ms).toISOString(),reason:'Délai relatif détecté',inferred:false};
    }
    const tm=text.match(/(?:\b(?:à|vers)\s*)?\b([01]?\d|2[0-3])\s*(?:h\s*([0-5]?\d)?|:([0-5]\d))\b/i);
    const hasTime=Boolean(tm);
    let h=hasTime?Number(tm[1]):9,minute=hasTime?Number(tm[2]??tm[3]??0):0;
    let target=null,reason='',inferred=!hasTime;
    const isoMatch=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    const frMatch=text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
    if(isoMatch){target=localDate(Number(isoMatch[1]),Number(isoMatch[2]),Number(isoMatch[3]),h,minute);reason='Date explicite reconnue';}
    else if(frMatch){
      const d=Number(frMatch[1]),m=Number(frMatch[2]);let y=frMatch[3]?Number(frMatch[3]):now.getFullYear();
      target=localDate(y,m,d,h,minute);
      if(target && !frMatch[3] && target<now) target=localDate(y+1,m,d,h,minute);
      reason='Date explicite reconnue';
    }
    else if(/\baprès-demain\b/.test(text)){target=new Date(now.getFullYear(),now.getMonth(),now.getDate()+2,h,minute);reason='Après-demain reconnu';}
    else if(/\bdemain\b/.test(text)){target=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,h,minute);reason='Demain reconnu';}
    else if(/\baujourd['’]hui\b/.test(text)){target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,minute);reason="Aujourd'hui reconnu";}
    else {
      const dayMatch=text.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?\b/);
      if(dayMatch){
        let step=(DAYNAMES[dayMatch[1]]-now.getDay()+7)%7;
        if(step===0 || (step===0 && /prochain/.test(dayMatch[0]))) step=7;
        target=new Date(now.getFullYear(),now.getMonth(),now.getDate()+step,h,minute);
        if(target<=now) target.setDate(target.getDate()+7);
        reason='Jour de semaine reconnu';
      } else if(hasTime){
        target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,minute);
        if(target<=now) target.setDate(target.getDate()+1);
        reason='Heure seule : aujourd’hui ou demain';
        inferred=true;
      }
    }
    return {dueAt:target&&!Number.isNaN(target.getTime())?target.toISOString():null,reason:target?reason:'',inferred:target?inferred:false};
  }
  function nextDue(dueAt, repeat){
    if(!isoDate(dueAt) || repeat==='none') return null;
    const d=new Date(dueAt);const orig=d.getDate();
    if(repeat==='daily')d.setDate(d.getDate()+1);
    else if(repeat==='weekly')d.setDate(d.getDate()+7);
    else if(repeat==='monthly'){
      d.setDate(1);d.setMonth(d.getMonth()+1);
      const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
      d.setDate(Math.min(orig,last));
    }else return null;
    return d.toISOString();
  }
  function changeStatus(t, completed, now=new Date()){
    if(!validTask(t)) throw new Error('Tâche invalide.');
    const updated={...t,completedAt:completed?now.toISOString():null,updatedAt:now.toISOString()};
    if(!validTask(updated))throw new Error('Horodatage incohérent.');
    return updated;
  }
  function statistics(tasks, now=new Date()){
    const open=tasks.filter(t=>!t.completedAt), completed=tasks.filter(t=>!!t.completedAt);
    const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
    return {total:tasks.length,open:open.length,completed:completed.length,
      today:open.filter(t=>t.dueAt&&Date.parse(t.dueAt)>=start&&Date.parse(t.dueAt)<end).length,
      overdue:open.filter(t=>t.dueAt&&Date.parse(t.dueAt)<now.getTime()).length};
  }
  function filterTasks(tasks, mode, query='', now=new Date()){
    const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).getTime();
    const q=String(query).trim().toLocaleLowerCase('fr');
    return tasks.filter(t=>{
      const due=t.dueAt?Date.parse(t.dueAt):null;
      const view=mode==='done'?Boolean(t.completedAt):!t.completedAt && (mode==='today'?due!==null&&due<end : mode==='upcoming'?due!==null&&due>=end:true);
      return view && (!q || (t.title+' '+t.note).toLocaleLowerCase('fr').includes(q));
    }).sort((a,b)=>{
      if(a.priority!==b.priority)return a.priority==='high'?-1:1;
      if(a.dueAt===null && b.dueAt!==null)return 1;
      if(b.dueAt===null && a.dueAt!==null)return -1;
      return (a.dueAt||a.createdAt).localeCompare(b.dueAt||b.createdAt);
    });
  }
  function validateBackup(o){
    if(!exactKeys(o,['version','createdAt','tasks']) || o.version!==VERSION || !isoDate(o.createdAt) || !Array.isArray(o.tasks) || o.tasks.length>MAX_TASKS)throw new Error('Format de sauvegarde non reconnu.');
    const ids=new Set();
    for(const t of o.tasks){
      if(!validTask(t)||ids.has(t.id))throw new Error('Tâche incorrecte ou identifiant répété.');
      ids.add(t.id);
    }
    return o.tasks;
  }
  function backup(tasks,now=new Date()){const result={version:VERSION,createdAt:now.toISOString(),tasks};validateBackup(result);return result;}
  function escapeIcs(v){return String(v).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');}
  function exportIcs(tasks){
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SnapAction//Local Reminders//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const task of tasks){if(!validTask(task)||!task.dueAt||task.completedAt)continue;
      const start=task.dueAt.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      lines.push('BEGIN:VEVENT','UID:'+escapeIcs(task.id)+'@snapaction.local','DTSTAMP:'+start,'DTSTART:'+start,'SUMMARY:'+escapeIcs(task.title),'DESCRIPTION:'+escapeIcs(task.note),'END:VEVENT');
    }
    return lines.concat('END:VCALENDAR','').join('\r\n');
  }
  return {VERSION,MAX_TASKS,validTask,createTask,parseCommand,nextDue,changeStatus,statistics,filterTasks,validateBackup,backup,exportIcs};
});