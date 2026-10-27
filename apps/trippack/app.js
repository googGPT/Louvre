/* Interface accessible, aucune dépendance ni connexion réseau. */
'use strict';
(()=>{
const L=AppLogic,C=L.SPEC,storageKey='louvre-factory:'+C.slug+':v1';
const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue de l'interface (pas d'argent ici)
let records=[],activeId=null,readOnly=false;
const $=id=>document.getElementById(id);
const status=$('status'),form=$('record-form'),body=$('items'),summary=$('summary');
// Valeurs de liste stockées en français (compatibilité) -> libellé traduit.
const optLabel=(key,v)=>t('opt.'+key+'.'+v);
const shown=(field,v)=>field.type==='select'?optLabel(field.key,v):field.type==='number'?I.number(v):String(v);
// Erreur du cœur traduite ; « field » est la clé d'un champ, traduite elle aussi.
function errText(e){const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');let params;try{params=json?JSON.parse(json):undefined;}catch(x){params=undefined;}if(params&&params.field)params={...params,field:t('field.'+params.field)};return /^err\./.test(key)?t(key,params):msg;}
function tell(message,error=false){status.textContent=message;status.className=error?'status error':'status';}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function safeSave(next){if(readOnly){tell(t('status.readonly'),true);return false;}const txt=L.backup(next);try{localStorage.setItem(storageKey,txt);records=next;return true;}catch(e){tell(t('status.quota'),true);return false;}}
function textNode(el,v){el.textContent=String(v);return el;}
function node(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
const kpiValue=([,v,kind])=>kind==='percent'?I.number(v/100,{style:'percent'}):I.number(v);
const fold=s=>String(s).toLocaleLowerCase(I.lang);
function render(){const result=L.compute(records);summary.replaceChildren();for(const k of result.kpis){const card=node('div','stat');card.append(textNode(node('span','stat-label'),t(k[0])),textNode(node('strong','stat-value'),kpiValue(k)));summary.append(card);}const notes=$('notes');notes.replaceChildren(...result.notes.map(n=>textNode(node('p'),t(n))));const rows=$('insights');rows.replaceChildren(...(result.rows.length?result.rows.map(r=>t('row',{item:r.item,n:I.number(r.quantity),bag:r.bag})):[t('rows.empty')]).map(n=>textNode(node('li'),n)));
 const query=fold($('search').value).trim(),visible=records.filter(r=>C.fields.some(f=>fold(r[f.key]).includes(query)||(f.type==='select'&&fold(optLabel(f.key,r[f.key])).includes(query))));$('counter').textContent=t('counter',{n:visible.length});body.replaceChildren();
 for(const r of visible.slice().reverse()){const card=node('article','item');const h=node('h3');h.textContent=r[C.fields[0].key];card.append(h);const dl=node('dl');for(const field of C.fields){const dt=node('dt'),dd=node('dd');dt.textContent=t('field.'+field.key);dd.textContent=shown(field,r[field.key]);dl.append(dt,dd);}card.append(dl);const bar=node('div','item-actions');const edit=node('button','outline small'),del=node('button','danger small');edit.type=del.type='button';edit.textContent=t('btn.edit');del.textContent=t('btn.delete');edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&safeSave(records.filter(x=>x.id!==r.id))){render();tell(t('status.deleted'))}});bar.append(edit,del);card.append(bar);body.append(card)}
}
function labelButtons(){$('save-button').textContent=t(activeId?'btn.update':'btn.save');$('cancel-edit').hidden=!activeId;}
function editRecord(r){activeId=r.id;for(const f of C.fields)form.elements.namedItem(f.key).value=r[f.key];labelButtons();form.scrollIntoView({behavior:'smooth',block:'start'});}
function reset(){activeId=null;form.reset();labelButtons();}
const labels=[]; // [élément, champ] retraduits au changement de langue
function labelFields(){for(const [span,f] of labels){span.textContent=t('field.'+f.key);if(f.type==='select')for(const o of form.elements.namedItem(f.key).options)o.textContent=optLabel(f.key,o.value);}}
function initForm(){for(const f of C.fields){const outer=node('label','field'),label=node('span');labels.push([label,f]);let input;if(f.type==='select'){input=node('select');for(const o of f.options){const opt=node('option');opt.value=o;input.append(opt)}}else{input=node('input');input.type=f.type;if(f.type==='number'){input.step='any';input.min='0';input.max='100000000';}else input.maxLength=160;}input.name=f.key;input.required=true;input.autocomplete='off';if(f.type==='date')input.value=L.dayKey();if(f.type==='datetime-local')input.value=L.dayKey()+'T12:00';outer.append(label,input);$('fields').append(outer)}labelFields();form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tell(t('status.restoreFirst'),true);return;}try{const o={id:activeId||crypto.randomUUID().replaceAll('-','').slice(0,24)};for(const f of C.fields){const raw=form.elements.namedItem(f.key).value;o[f.key]=f.type==='number'?Number(raw):raw;}const valid=L.normalizeRecord(o);let next=activeId?records.map(x=>x.id===activeId?valid:x):[...records,valid];if(next.length>L.MAX)throw Error('err.capacity|'+JSON.stringify({max:L.MAX}));if(safeSave(next)){reset();render();tell(t('status.saved'))}}catch(e){tell(errText(e),true)}});$('cancel-edit').addEventListener('click',reset);labelButtons();}
$('export').addEventListener('click',()=>{try{download(t('file.backup'),L.backup(records),'application/json');tell(t('status.exported'))}catch(e){tell(errText(e),true)}});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');let parsed;try{parsed=JSON.parse(await file.text())}catch(x){throw Error('err.json')}const next=L.validateBackup(parsed);if(!confirm(t('confirm.restore',{a:records.length,b:next.length})))return;const wasReadOnly=readOnly;readOnly=false;if(!safeSave(next))readOnly=wasReadOnly;else{reset();render();tell(t('status.restored'))}}catch(e){tell(t('status.importFail',{msg:errText(e)}),true)}});
$('export-raw').addEventListener('click',()=>{download(t('file.raw'),localStorage.getItem(storageKey)||'','text/plain');tell(t('status.raw'));});
$('search').addEventListener('input',render);
try{const raw=localStorage.getItem(storageKey);if(raw){records=L.validateBackup(JSON.parse(raw))}}catch(e){readOnly=true;tell(t('status.locked'),true);$('warning').hidden=false}
initForm();render();
// Changement de langue : écran retraduit, saisie et données intactes.
I.onChange(()=>{labelFields();labelButtons();render();});
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
