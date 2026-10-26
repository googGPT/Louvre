/* EventCount 2.0 — pure browser-independent domain functions. No external services. */
'use strict';
const AppLogic = (() => {
  const SPEC = Object.freeze({
    slug: 'eventcount', title: 'EventCount', subtitle: 'Organisez les réponses et le budget de vos invités',
    fields: [
      {key:'event',label:'Événement',type:'text',sample:'Anniversaire'},
      {key:'guest',label:'Invité ou groupe',type:'text',sample:'Camille'},
      {key:'reply',label:'Réponse',type:'select',options:['oui','peut-être','non'],sample:'oui'},
      {key:'seats',label:'Personnes incluses',type:'number',sample:2},
      {key:'cost',label:'Budget par personne (€)',type:'number',sample:20}
    ], description:'Suivi local des RSVP et du budget, par événement'
  });
  const MAX = 500, STORAGE_LIMIT = 900000;
  const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
  const text = v => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 160 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
  const key = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
  const dayKey = (d = new Date()) => {const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())};
  function validDate(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);const day=new Date(y,m-1,d,12);return day.getFullYear()===y&&day.getMonth()+1===m&&day.getDate()===d}
  function toDay(v){const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d,12)}
  function diffDays(a,b){if(!validDate(a)||!validDate(b))throw Error('Date invalide');return Math.round((toDay(a)-toDay(b))/86400000)}
  function addDays(v,n){if(!validDate(v)||!Number.isInteger(n)||Math.abs(n)>36500)throw Error('Date ou durée invalide');let d=toDay(v);d.setDate(d.getDate()+n);return dayKey(d)}
  const eur = cents => (cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  function normalizeRecord(o){
    if(!plain(o)||typeof o.id!=='string'||!/^[A-Za-z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant invalide');
    for(const k of ['event','guest'])if(!text(o[k]))throw Error('Nom de l’événement ou de l’invité invalide');
    if(!SPEC.fields[2].options.includes(o.reply))throw Error('Réponse inconnue');
    if(!Number.isSafeInteger(o.seats)||o.seats<1||o.seats>10000)throw Error('Personnes incluses : entier de 1 à 10 000');
    if(typeof o.cost!=='number'||!Number.isFinite(o.cost)||o.cost<0||o.cost>100000||Math.round(o.cost*100)!==o.cost*100 && Math.abs(Math.round(o.cost*100)-o.cost*100)>1e-7)throw Error('Budget par personne : euros, deux décimales maximum');
    return {id:o.id,event:o.event.trim(),guest:o.guest.trim(),reply:o.reply,seats:o.seats,cost:o.cost};
  }
  function validateBackup(o){
    if(!plain(o)||o.app!=='eventcount'||o.version!==1||!Array.isArray(o.records)||o.records.length>MAX)throw Error('Sauvegarde EventCount incompatible ou trop volumineuse');
    if(JSON.stringify(o).length>STORAGE_LIMIT)throw Error('Sauvegarde supérieure à 900 Ko');
    const ids=new Set();return o.records.map(x=>{const r=normalizeRecord(x);if(ids.has(r.id))throw Error('Identifiant d’invité en double');ids.add(r.id);return r});
  }
  function backup(records){let clean=validateBackup({app:'eventcount',version:1,records});return JSON.stringify({app:'eventcount',version:1,exportedAt:new Date().toISOString(),records:clean},null,2)}
  function makeEvents(records){
    const events=new Map();for(const row of records){const k=key(row.event);let group=events.get(k);if(!group){group={key:k,name:row.event,rows:[]};events.set(k,group)}group.rows.push(row)}
    return [...events.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  }
  function findDuplicate(records, proposed, exceptId=null){const e=key(proposed.event),g=key(proposed.guest);return records.find(r=>r.id!==exceptId&&key(r.event)===e&&key(r.guest)===g)||null}
  function sumGroup(rows){
    const counts={confirmed:0,possible:0,declined:0,confirmedGroups:0,pendingGroups:0,declinedGroups:0};let confirmedCents=0,potentialCents=0;
    for(const r of rows){const cents=Math.round(r.cost*100)*r.seats;if(!Number.isSafeInteger(cents))throw Error('Budget cumulé hors limites');
      if(r.reply==='oui'){counts.confirmed+=r.seats;counts.confirmedGroups++;confirmedCents+=cents}
      else if(r.reply==='peut-être'){counts.possible+=r.seats;counts.pendingGroups++;potentialCents+=cents}
      else{counts.declined+=r.seats;counts.declinedGroups++}
    }
    const totalCents=confirmedCents+potentialCents;
    if(!Number.isSafeInteger(totalCents))throw Error('Total budgétaire hors limites');
    return {...counts,groups:rows.length,confirmedCents,potentialCents,maxCents:totalCents};
  }
  function compute(records,today=dayKey(),selected='all'){
    if(!validDate(today))throw Error('Date du jour invalide');
    if(!Array.isArray(records)||records.length>MAX)throw Error('Nombre d’enregistrements invalide');
    const data=records.map(normalizeRecord),groups=makeEvents(data),filter=selected==='all'?data:(groups.find(g=>g.key===selected)?.rows||[]),s=sumGroup(filter);
    const duplicates=[],seen=new Set();for(const r of data){const composite=key(r.event)+'\u0000'+key(r.guest);if(seen.has(composite))duplicates.push(r.event+' : '+r.guest);seen.add(composite)}
    const summary=groups.map(g=>({key:g.key,name:g.name,...sumGroup(g.rows)}));
    const notes=['Le budget minimum inclut uniquement les réponses « oui » ; le maximum ajoute les « peut-être ». Les refus n’entrent pas dans le budget.',...((selected==='all'&&groups.length>1)?['Vue globale : plusieurs événements additionnés. Sélectionnez un événement pour son budget isolé.']:[]),...(duplicates.length?['Doublons d’invités détectés (même événement) : '+[...new Set(duplicates)].join(' ; ')+'.']:[])];
    const rows=filter.filter(r=>r.reply!=='non').slice().sort((a,b)=>({oui:0,'peut-être':1,non:2}[a.reply]-{oui:0,'peut-être':1,non:2}[b.reply])||a.guest.localeCompare(b.guest,'fr')).slice(0,25).map(r=>r.guest+' · '+r.reply+' · '+r.seats+' pers. · '+eur(Math.round(r.cost*100)*r.seats));
    return {kpis:[['Personnes confirmées',String(s.confirmed)],['Personnes possibles',String(s.possible)],['Coût confirmé estimé',eur(s.confirmedCents)],['Budget maximal envisagé',eur(s.maxCents)],['Sans réponse ferme',String(s.pendingGroups)],['Refus',String(s.declinedGroups)]],notes,rows,totals:s,events:summary,duplicates,selected,records:filter};
  }
  function csv(records){
    const columns=['Événement','Invité / groupe','Réponse','Nombre de personnes','Budget unitaire (€)','Budget groupe (€)'];
    const escape=v=>{let s=String(v);if(/^[\s\uFEFF]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
    return '\uFEFF'+[columns,...records.map(r=>[r.event,r.guest,r.reply,r.seats,r.cost.toFixed(2),(r.seats*r.cost).toFixed(2)])].map(x=>x.map(escape).join(';')).join('\r\n');
  }
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,diffDays,addDays,eur,key,normalizeRecord,validateBackup,backup,makeEvents,findDuplicate,sumGroup,compute,csv});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;