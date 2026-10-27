/* Interface accessible, aucune dépendance ni connexion réseau. Calculs dans core.js ; textes et formats dans LouvreI18n. */
'use strict';
(()=>{
const L=AppLogic,C=L.SPEC,storageKey='louvre-factory:'+C.slug+':v1';
const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue, devise, traductions et formats
let records=[],activeId=null,readOnly=false;
const $=id=>document.getElementById(id);
const status=$('status'),form=$('record-form'),body=$('items'),summary=$('summary');
// Valeurs enregistrées (en français, inchangées) -> clés de traduction pour l'affichage.
const TRIP_KEYS={'Aller simple':'trip.oneWay','Aller-retour':'trip.return'};
const MONEY_FIELDS=['price','tolls','parking']; // saisis dans la devise choisie
const fieldLabel=key=>t('field.'+key,{cur:I.currencySymbol()});
const money=c=>I.money(c);
const unitMoney=v=>{const z=I.currency==='XOF'||I.currency==='XAF'?0:2;return I.money(Math.round(v*1e5)/1e3,{minimumFractionDigits:z,maximumFractionDigits:Math.max(z,3)})}; // prix saisi (jusqu'à 3 décimales)
const km=v=>t('unit.km',{v:I.number(v,{minimumFractionDigits:1,maximumFractionDigits:1})});
const liters=v=>t('unit.l',{v:I.number(v,{minimumFractionDigits:2,maximumFractionDigits:2})});
function splitText(s){ // « 1 × 10,05 € et 1 × 10,04 € »
 if(s.highCount&&s.lowCount)return t('split.two',{a:I.number(s.highCount),x:money(s.high),b:I.number(s.lowCount),y:money(s.low)});
 return s.highCount?t('split.one',{n:I.number(s.highCount),x:money(s.high)}):t('split.one',{n:I.number(s.lowCount),x:money(s.low)});
}
function display(field,v){if(field.key==='returnTrip')return t(TRIP_KEYS[v]||'trip.oneWay');if(MONEY_FIELDS.includes(field.key))return unitMoney(v);return field.type==='number'?I.number(v):String(v);}
// Erreur du cœur : clé|{"field":"km"} -> nom du champ traduit avant mise en forme.
function errText(e){const m=String(e&&e.message||e),[k,j]=m.split('|');if(j){try{const p=JSON.parse(j);if(p.field)p.field=fieldLabel(p.field);return I.error(new Error(k+'|'+JSON.stringify(p)))}catch(_){}}return I.error(e)}
// Message d'état : texte ou fonction (retraduit si la langue change).
let lastTell=null;
function tell(message,error=false){lastTell={message,error};status.textContent=typeof message==='function'?message():message;status.className=error?'status error':'status';}
const tellKey=(key,params,error=false)=>tell(()=>t(key,params),error);
const tellErr=(key,e)=>tell(()=>key?t(key,{msg:errText(e)}):errText(e),true);
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function safeSave(next){if(readOnly){tellKey('st.readonly',null,true);return false;}const txt=L.backup(next);try{localStorage.setItem(storageKey,txt);records=next;return true;}catch(e){tellKey('st.quota',null,true);return false;}}
function textNode(el,s){el.textContent=String(s);return el;}
function node(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
function kpiValue(k){if(k.type==='money')return money(k.value);if(k.type==='liters')return liters(k.value);if(k.type==='km')return km(k.value);return k.value===null?'—':t('perKm',{v:money(k.value)});}
function render(){const result=L.compute(records);summary.replaceChildren();for(const k of result.kpis){const card=node('div','stat');card.append(textNode(node('span','stat-label'),t(k.key)),textNode(node('strong','stat-value'),kpiValue(k)));summary.append(card);}
 $('notes').replaceChildren(...result.notes.map(n=>textNode(node('p'),t(n))));
 const lines=result.rows.map(r=>t('row',{route:r.route,total:money(r.totalCents),km:km(r.distance),liters:liters(r.fuelLiters),split:splitText(r.split)}));
 $('insights').replaceChildren(...(lines.length?lines:[t('details.empty')]).map(n=>textNode(node('li'),n)));
 const query=$('search').value.toLocaleLowerCase(I.locale).trim(),visible=records.filter(r=>Object.values(r).some(x=>String(x).toLocaleLowerCase(I.locale).includes(query)));$('counter').textContent=t('counter',{n:visible.length});body.replaceChildren();
 for(const r of visible.slice().reverse()){const card=node('article','item');const h=node('h3');h.textContent=r[C.fields[0].key];card.append(h);const dl=node('dl');for(const field of C.fields){const dt=node('dt'),dd=node('dd');dt.textContent=fieldLabel(field.key);dd.textContent=display(field,r[field.key]);dl.append(dt,dd);}card.append(dl);
  const bar=node('div','item-actions');const edit=node('button','outline small'),del=node('button','danger small');edit.type=del.type='button';edit.textContent=t('btn.edit');del.textContent=t('btn.delete');edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&safeSave(records.filter(x=>x.id!==r.id))){render();tellKey('st.deleted')}});bar.append(edit,del);card.append(bar);body.append(card)}
}
function saveLabel(){$('save-button').textContent=t(activeId?'btn.update':'btn.save');}
function editRecord(r){activeId=r.id;for(const f of C.fields)form.elements.namedItem(f.key).value=r[f.key]??(f.type==='number'?0:'Aller simple');preview();saveLabel();$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
function reset(){activeId=null;form.reset();saveLabel();$('cancel-edit').hidden=true;preview();}
function preview(){const target=$('estimate-preview');if(!target)return;try{const r={id:'preview0001'};for(const f of C.fields){const raw=form.elements.namedItem(f.key)?.value;r[f.key]=f.type==='number'?Number(raw):raw;}const d=L.tripDetails(r);target.textContent=t('preview.est',{total:money(d.totalCents),liters:liters(d.fuelLiters),km:km(d.distance),people:t('people',{n:d.people}),split:splitText(d.split)});}catch(e){target.textContent=t('preview.hint');}}
// Libellés du formulaire (langue ou devise changée) : seuls les textes changent, jamais les valeurs saisies.
function relabel(){for(const c of $('fields').querySelectorAll('[data-field]'))c.textContent=fieldLabel(c.dataset.field);for(const o of form.elements.namedItem('returnTrip').options)o.textContent=t(TRIP_KEYS[o.value]);saveLabel();}
function initForm(){for(const f of C.fields){const outer=node('label','field'),label=node('span');label.textContent=fieldLabel(f.key);label.dataset.field=f.key;let input;if(f.type==='select'){input=node('select');for(const o of f.options){const opt=node('option');opt.value=o;opt.textContent=t(TRIP_KEYS[o]);input.append(opt)}}else{input=node('input');input.type=f.type;if(f.type==='number'){input.step='any';input.min='0';input.max='100000000';if(f.key==='tolls'||f.key==='parking')input.defaultValue='0';}else input.maxLength=160;}input.name=f.key;input.required=true;input.autocomplete='off';outer.append(label,input);$('fields').append(outer)}
 form.addEventListener('input',preview);form.addEventListener('change',preview);
 form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tellKey('st.locked',null,true);return;}try{const o={id:activeId||crypto.randomUUID().replaceAll('-','').slice(0,24)};for(const f of C.fields){const raw=form.elements.namedItem(f.key).value;o[f.key]=f.type==='number'?Number(raw):raw;}const valid=L.normalizeRecord(o);const next=activeId?records.map(x=>x.id===activeId?valid:x):[...records,valid];if(next.length>L.MAX)throw Error('err.capacity|'+JSON.stringify({max:L.MAX}));if(safeSave(next)){reset();render();tellKey('st.saved')}}catch(e){tellErr(null,e)}});
 $('cancel-edit').addEventListener('click',reset);}
$('export-csv').addEventListener('click',()=>{const cols=t('csv.cols',{cur:I.currency}).split(';');const quote=s=>'"'+String(s).replaceAll('"','""')+'"';const rows=records.map(r=>{const d=L.tripDetails(r);return [r.route,d.distance,d.fuelLiters,d.fuelCents/100,d.extrasCents/100,d.totalCents/100,d.people].map(quote).join(';')});download('fuelmath-trajets.csv','﻿'+[cols.map(quote).join(';'),...rows].join('\r\n'),'text/csv;charset=utf-8');tellKey('st.csv');});
$('export').addEventListener('click',()=>{try{download(C.slug+'-sauvegarde.json',L.backup(records),'application/json');tellKey('st.json')}catch(e){tellErr(null,e)}});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');const next=L.validateBackup(JSON.parse(await file.text()));if(!confirm(t('confirm.import',{a:I.number(records.length),b:I.number(next.length)})))return;const wasReadOnly=readOnly;readOnly=false;if(!safeSave(next))readOnly=wasReadOnly;else{reset();render();tellKey('st.restored')}}catch(e){tellErr('st.importRefused',e)}});
$('export-raw').addEventListener('click',()=>{download(C.slug+'-stockage-original.txt',localStorage.getItem(storageKey)||'','text/plain');tellKey('st.raw');});
$('search').addEventListener('input',render);
try{const raw=localStorage.getItem(storageKey);if(raw){records=L.validateBackup(JSON.parse(raw))}}catch(e){readOnly=true;tellKey('st.unreadable',null,true);$('warning').hidden=false}
initForm();saveLabel();preview();render();
// Nouvelle langue ou devise : libellés, montants et nombres retraduits ; saisie et mode édition conservés.
I.onChange(()=>{relabel();preview();render();if(lastTell)tell(lastTell.message,lastTell.error)});
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
