/* MileageBook v2: validation and arithmetic independent of the DOM, network and storage. */
'use strict';
const AppLogic=(()=>{
  const SPEC=Object.freeze({slug:'mileagebook',version:1,title:'MileageBook',fields:[
    {key:'day',label:'Date du trajet',type:'date'},
    {key:'purpose',label:'Motif du déplacement',type:'text'},
    {key:'km',label:'Distance réellement parcourue (km)',type:'number'},
    {key:'rate',label:'Taux personnel (€/km)',type:'number'},
    {key:'paid',label:'Remboursé ?',type:'select',options:['non','oui']},
    {key:'category',label:'Catégorie',type:'select',options:['Non précisé','Professionnel','Personnel','Autre'],optional:true},
    {key:'origin',label:'Départ (facultatif)',type:'text',optional:true},
    {key:'destination',label:'Arrivée (facultative)',type:'text',optional:true},
    {key:'vehicle',label:'Véhicule (facultatif)',type:'text',optional:true}
  ]});
  const MAX=500, STORAGE_LIMIT=900000;
  const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);if(y<1900||y>2100)return false;const n=new Date(Date.UTC(y,m-1,d,12));return n.getUTCFullYear()===y&&n.getUTCMonth()===m-1&&n.getUTCDate()===d}
  function dayKey(d=new Date()){const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())}
  function diffDays(a,b){if(!validDate(a)||!validDate(b))throw Error('Date invalide');return Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000)}
  function addDays(s,n){if(!validDate(s)||!Number.isSafeInteger(n))throw Error('Date invalide');const d=new Date(Date.parse(s+'T12:00:00Z'));d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function eur(cents){if(!Number.isSafeInteger(cents))throw Error('Montant invalide');return(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}
  function normalizeRecord(o){
    if(!o||typeof o!=='object'||Array.isArray(o)||typeof o.id!=='string'||!/^[a-zA-Z0-9_-]{4,80}$/.test(o.id))throw Error('Identifiant invalide');
    const out={id:o.id};
    for(const f of SPEC.fields){let v=o[f.key];
      if(f.optional&&(v===undefined||v===null))v=f.type==='select'?'Non précisé':'';
      if(f.type==='text'){
        if(typeof v!=='string'||v.length>160||(!f.optional&&!v.trim()))throw Error(f.label+' : texte requis (160 caractères max)');
        out[f.key]=v.trim();
      }else if(f.type==='date'){
        if(!validDate(v))throw Error(f.label+' : date impossible');out[f.key]=v;
      }else if(f.type==='number'){
        if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error(f.label+' : nombre fini positif requis');
        const limit=f.key==='km'?100000:f.key==='rate'?1000:100000000;
        if(v>limit)throw Error(f.label+' : valeur trop élevée');
        out[f.key]=v;
      }else if(f.type==='select'){
        if(!f.options.includes(v))throw Error(f.label+' : choix invalide');out[f.key]=v;
      }
    }
    if(out.km<=0)throw Error('La distance doit être supérieure à zéro');
    if(Math.abs(out.km*1000-Math.round(out.km*1000))>1e-7||Math.abs(out.rate*10000-Math.round(out.rate*10000))>1e-7)throw Error('Au maximum trois décimales pour km et quatre pour le taux');
    return out;
  }
  function tripCents(raw){const r=normalizeRecord(raw);const v=Math.round((r.km*r.rate)*100+Number.EPSILON);if(!Number.isSafeInteger(v))throw Error('Montant hors limites');return v}
  function validateBackup(data){
    if(!data||typeof data!=='object'||Array.isArray(data)||data.app!==SPEC.slug||data.version!==1||!Array.isArray(data.records)||data.records.length>MAX)throw Error('Sauvegarde incompatible ou trop volumineuse');
    if(JSON.stringify(data).length>STORAGE_LIMIT)throw Error('Sauvegarde trop grande');
    const seen=new Set();return data.records.map(raw=>{const r=normalizeRecord(raw);if(seen.has(r.id))throw Error('Identifiant dupliqué');seen.add(r.id);return r});
  }
  function backup(records){const valid=validateBackup({app:SPEC.slug,version:1,records});return JSON.stringify({app:SPEC.slug,version:1,exportedAt:new Date().toISOString(),records:valid},null,2)}
  function fold(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr')}
  function findDuplicates(raws,one,ignoreId=null){const r=normalizeRecord(one);return raws.map(normalizeRecord).filter(x=>x.id!==ignoreId&&x.day===r.day&&fold(x.purpose)===fold(r.purpose)&&x.km===r.km&&x.rate===r.rate&&fold(x.origin)===fold(r.origin)&&fold(x.destination)===fold(r.destination));}
  function compute(raws,filter={}){
    const all=raws.map(normalizeRecord);
    const year=filter.year||'',month=filter.month||'',status=filter.status||'tous',query=fold(filter.query||'');
    if(year&&!/^\d{4}$/.test(year))throw Error('Année de filtre invalide');
    if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Mois de filtre invalide');
    if(!['tous','non','oui'].includes(status))throw Error('Statut de filtre invalide');
    const rows=all.filter(r=>(!year||r.day.startsWith(year))&&(!month||r.day.startsWith(month))&&(status==='tous'||r.paid===status)&&(!query||[r.day,r.purpose,r.origin,r.destination,r.vehicle,r.category].some(s=>fold(s).includes(query)))).sort((a,b)=>b.day.localeCompare(a.day)||a.id.localeCompare(b.id));
    let distance=0,totalCents=0,unpaidCents=0,paidCents=0;
    const byMonth={};for(const r of rows){const c=tripCents(r),key=r.day.slice(0,7);distance+=r.km;totalCents+=c;if(r.paid==='non')unpaidCents+=c;else paidCents+=c;const m=byMonth[key]??={month:key,km:0,totalCents:0,unpaidCents:0,count:0};m.km+=r.km;m.totalCents+=c;m.count++;if(r.paid==='non')m.unpaidCents+=c;}
    const monthly=Object.values(byMonth).sort((a,b)=>b.month.localeCompare(a.month));
    return {rows,monthly,totals:{count:rows.length,km:distance,totalCents,unpaidCents,paidCents,notPaid:rows.filter(r=>r.paid==='non').length},kpis:[['Trajets',String(rows.length)],['Distance',distance.toLocaleString('fr-FR',{maximumFractionDigits:3})+' km'],['Montant estimé',eur(totalCents)],['À rembourser (estimé)',eur(unpaidCents)],['Déjà remboursé (estimé)',eur(paidCents)]],notes:['Montants calculés au centime pour chaque trajet avant totalisation. Taux et statut déclarés : aucun calcul de barème officiel.']};
  }
  function csvQuote(value){let s=String(value);if(/^\s*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
  function toCSV(raws){const records=raws.map(normalizeRecord);const header=['Date','Motif','Départ','Arrivée','Véhicule','Catégorie','Kilomètres','Taux EUR/km','Montant EUR','Remboursé'];const csv=[header.map(csvQuote).join(';')];for(const r of records){const fields=[r.day,r.purpose,r.origin,r.destination,r.vehicle,r.category,String(r.km).replace('.',','),String(r.rate).replace('.',','),(tripCents(r)/100).toFixed(2).replace('.',','),r.paid];csv.push(fields.map(csvQuote).join(';'));}return '\uFEFF'+csv.join('\r\n')+'\r\n';}
  function setPaid(raw,paid){const r=normalizeRecord(raw);if(!['oui','non'].includes(paid))throw Error('Statut invalide');return {...r,paid};}
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,dayKey,validDate,diffDays,addDays,eur,fold,normalizeRecord,tripCents,findDuplicates,validateBackup,backup,compute,toCSV,setPaid});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;