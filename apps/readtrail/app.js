/* Interface accessible, aucune dépendance ni connexion réseau. Textes et formats : LouvreI18n. */
'use strict';
(()=>{
const L=AppLogic,C=L.SPEC,storageKey='louvre-factory:'+C.slug+':v1';
const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue et traductions (pas d'argent : menu langue seul)
// États enregistrés en français (compatibilité des sauvegardes) -> clés de traduction pour l'affichage.
const STATUS_KEYS={'en cours':'status.reading','terminé':'status.finished','en pause':'status.paused'};
const statusName=v=>t(STATUS_KEYS[v]||'status.reading');
let records=[],activeId=null,readOnly=false,lastStatus=null;
const $=id=>document.getElementById(id);
const status=$('status'),form=$('record-form'),body=$('items'),summary=$('summary');
// msg : fonction qui produit le texte, rappelée après un changement de langue.
function tell(msg,error=false){lastStatus={msg,error};status.textContent=msg();status.className=error?'status error':'status';}
const errText=e=>e instanceof SyntaxError?t('err.backup'):I.error(e);
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function safeSave(next){if(readOnly){tell(()=>t('storage.readonly'),true);return false;}const txt=L.backup(next);try{localStorage.setItem(storageKey,txt);records=next;return true;}catch(e){tell(()=>t('storage.fail'),true);return false;}}
function textNode(el,s){el.textContent=String(s);return el;}
function node(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
// Valeur d'un champ telle qu'affichée : état traduit, nombres selon la langue.
function shown(field,v){return field.type==='select'?statusName(v):field.type==='number'?I.number(v):String(v);}
function render(){const result=L.compute(records);summary.replaceChildren();for(const [label,value,format] of result.kpis){const card=node('div','stat');card.append(textNode(node('span','stat-label'),t(label)),textNode(node('strong','stat-value'),format==='percent'?I.number(Number(value)/100,{style:'percent'}):I.number(Number(value))));summary.append(card);}const notes=$('notes');notes.replaceChildren(...result.notes.map(n=>textNode(node('p'),t(n))));const rows=$('insights');rows.replaceChildren(...(result.rows.length?result.rows.map(r=>t('row',{title:r.title,pct:I.number(r.pct/100,{style:'percent'})})):[t('rows.empty')]).map(n=>textNode(node('li'),n)));
 const query=$('search').value.toLocaleLowerCase(I.locale).trim(),visible=records.filter(r=>[...Object.values(r),statusName(r.status)].some(x=>String(x).toLocaleLowerCase(I.locale).includes(query)));$('counter').textContent=t('counter',{n:visible.length});body.replaceChildren();
 for(const r of visible.slice().reverse()){const card=node('article','item');const h=node('h3');h.textContent=r[C.fields[0].key];card.append(h);const dl=node('dl');for(const field of C.fields){const dt=node('dt'),dd=node('dd');dt.textContent=t(field.label);dd.textContent=shown(field,r[field.key]);dl.append(dt,dd);}card.append(dl);const bar=node('div','item-actions');const edit=node('button','outline small'),del=node('button','danger small');edit.type=del.type='button';edit.textContent=t('btn.edit');del.textContent=t('btn.delete');edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&safeSave(records.filter(x=>x.id!==r.id))){render();tell(()=>t('status.deleted'))}});bar.append(edit,del);card.append(bar);body.append(card)}
 $('save-button').textContent=activeId?t('btn.update'):t('btn.save');
}
function editRecord(r){activeId=r.id;for(const f of C.fields)form.elements.namedItem(f.key).value=r[f.key];$('save-button').textContent=t('btn.update');$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
function reset(){activeId=null;form.reset();$('save-button').textContent=t('btn.save');$('cancel-edit').hidden=true;}
// data-i18n : libellés et options retraduits automatiquement quand la langue change.
function initForm(){for(const f of C.fields){const outer=node('label','field'),label=node('span');label.textContent=t(f.label);label.dataset.i18n=f.label;let input;if(f.type==='select'){input=node('select');for(const o of f.options){const opt=node('option');opt.value=o;opt.textContent=statusName(o);opt.dataset.i18n=STATUS_KEYS[o];input.append(opt)}}else{input=node('input');input.type=f.type;if(f.type==='number'){input.step='any';input.min='0';input.max='100000000';}else input.maxLength=160;}input.name=f.key;input.required=true;input.autocomplete='off';if(f.type==='date')input.value=L.dayKey();if(f.type==='datetime-local')input.value=L.dayKey()+'T12:00';outer.append(label,input);$('fields').append(outer)}form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tell(()=>t('storage.readonlyForm'),true);return;}try{const o={id:activeId||crypto.randomUUID().replaceAll('-','').slice(0,24)};for(const f of C.fields){const raw=form.elements.namedItem(f.key).value;o[f.key]=f.type==='number'?Number(raw):raw;}const valid=L.normalizeRecord(o);let next=activeId?records.map(x=>x.id===activeId?valid:x):[...records,valid];if(next.length>L.MAX)throw Error('err.limit|'+JSON.stringify({max:L.MAX}));if(safeSave(next)){reset();render();tell(()=>t('status.saved'))}}catch(e){tell(()=>I.error(e),true)}});$('cancel-edit').addEventListener('click',reset);}
$('export').addEventListener('click',()=>{try{download(C.slug+'-backup.json',L.backup(records),'application/json');tell(()=>t('status.exported'))}catch(e){tell(()=>I.error(e),true)}});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');const next=L.validateBackup(JSON.parse(await file.text()));if(!confirm(t('confirm.restore',{a:records.length,b:next.length})))return;const wasReadOnly=readOnly;readOnly=false;if(!safeSave(next))readOnly=wasReadOnly;else{reset();render();tell(()=>t('status.restored'))}}catch(e){tell(()=>t('status.importRefused',{msg:errText(e)}),true)}});
$('export-raw').addEventListener('click',()=>{download(C.slug+'-raw-storage.txt',localStorage.getItem(storageKey)||'','text/plain');tell(()=>t('status.raw'));});
$('search').addEventListener('input',render);
try{const raw=localStorage.getItem(storageKey);if(raw){records=L.validateBackup(JSON.parse(raw))}}catch(e){readOnly=true;tell(()=>t('storage.unreadable'),true);$('warning').hidden=false}
initForm();render();
// Nouvelle langue : réaffichage complet ; la saisie en cours du formulaire est conservée.
I.onChange(()=>{render();if(lastStatus)tell(lastStatus.msg,lastStatus.error);});
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
