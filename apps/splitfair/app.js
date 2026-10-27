/* Interface accessible, aucune dépendance ni connexion réseau. Textes : messages.js ; montants : LouvreI18n.money (devise choisie). */
'use strict';
(()=>{
const L=AppLogic,C=L.SPEC,storageKey='louvre-factory:'+C.slug+':v1';
const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t,MSG=window.LouvreMessages;
let records=[],activeId=null,readOnly=false;
const $=id=>document.getElementById(id);
const status=$('status'),form=$('record-form'),body=$('items'),summary=$('summary');
const money=cents=>I.money(cents);
const fieldLabel=key=>t('fld.'+key,{cur:I.currencySymbol()});
// Erreurs du moteur en clés (« err.number|{"field":"amount"} ») : le nom du champ est traduit aussi.
function errText(e){const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');let p;try{p=json?JSON.parse(json):undefined;}catch(_){p=undefined;}
 if(p&&p.field!==undefined&&MSG.fr['fld.'+p.field]!==undefined)p.field=fieldLabel(p.field);return I.error(Error(p?key+'|'+JSON.stringify(p):key));}
function tell(message,error=false){status.textContent=message;status.className=error?'status error':'status';}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function safeSave(next){if(readOnly){tell(t('msg.corrupt'),true);return false;}const txt=L.backup(next);try{localStorage.setItem(storageKey,txt);records=next;return true;}catch(e){tell(t('msg.quota'),true);return false;}}
function textNode(el,s){el.textContent=String(s);return el;}
function node(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
const display=(field,value)=>field.type==='number'?money(Math.round(value*100)):String(value);
function render(){const result=L.compute(records);summary.replaceChildren();for(const k of result.kpis){const card=node('div','stat');card.append(textNode(node('span','stat-label'),t(k.key)),textNode(node('strong','stat-value'),k.money?money(k.value):I.number(k.value)));summary.append(card);}const notes=$('notes');notes.replaceChildren(...result.notes.map(n=>textNode(node('p'),t(n.key))));const rows=$('insights');rows.replaceChildren(...(result.rows.length?result.rows.map(r=>t('row',{from:r.from,to:r.to,money:money(r.cents)})):[t('rows.empty')]).map(n=>textNode(node('li'),n)));
 const query=$('search').value.toLocaleLowerCase(I.locale).trim(),visible=records.filter(r=>Object.values(r).some(x=>String(x).toLocaleLowerCase(I.locale).includes(query)));$('counter').textContent=t('count',{n:visible.length});body.replaceChildren();
 for(const r of visible.slice().reverse()){const card=node('article','item');const h=node('h3');h.textContent=r[C.fields[0].key];card.append(h);const dl=node('dl');for(const field of C.fields){const dt=node('dt'),dd=node('dd');dt.textContent=fieldLabel(field.key);dd.textContent=display(field,r[field.key]);dl.append(dt,dd);}card.append(dl);const bar=node('div','item-actions');const edit=node('button','outline small'),del=node('button','danger small');edit.type=del.type='button';edit.textContent=t('btn.edit');del.textContent=t('btn.delete');edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&safeSave(records.filter(x=>x.id!==r.id))){render();tell(t('msg.deleted'))}});bar.append(edit,del);card.append(bar);body.append(card)}
}
function saveLabel(){$('save-button').textContent=t(activeId?'btn.update':'btn.save');}
function fieldLabels(){for(const f of C.fields){const span=$('label-'+f.key);if(span)span.textContent=fieldLabel(f.key);const input=form.elements.namedItem(f.key);if(input&&f.key==='people')input.placeholder=t('ph.people');}}
function editRecord(r){activeId=r.id;for(const f of C.fields)form.elements.namedItem(f.key).value=r[f.key];saveLabel();$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
function reset(){activeId=null;form.reset();saveLabel();$('cancel-edit').hidden=true;}
function initForm(){for(const f of C.fields){const outer=node('label','field'),label=node('span');label.id='label-'+f.key;let input;if(f.type==='select'){input=node('select');for(const o of f.options){const opt=node('option');opt.value=o;opt.textContent=o;input.append(opt)}}else{input=node('input');input.type=f.type;if(f.type==='number'){input.step='any';input.min='0';input.max='100000000';}else input.maxLength=160;}input.name=f.key;input.required=true;input.autocomplete='off';if(f.type==='date')input.value=L.dayKey();if(f.type==='datetime-local')input.value=L.dayKey()+'T12:00';outer.append(label,input);$('fields').append(outer)}fieldLabels();saveLabel();
 form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tell(t('msg.corruptEdit'),true);return;}try{const o={id:activeId||crypto.randomUUID().replaceAll('-','').slice(0,24)};for(const f of C.fields){let raw=form.elements.namedItem(f.key).value;if(f.key==='people')raw=raw.replace(/،/g,',');o[f.key]=f.type==='number'?Number(raw):raw;}const valid=L.normalizeRecord(o);let next=activeId?records.map(x=>x.id===activeId?valid:x):[...records,valid];if(next.length>L.MAX)throw Error('err.max|'+JSON.stringify({max:L.MAX}));if(safeSave(next)){reset();render();tell(t('msg.saved'))}}catch(e){tell(errText(e),true)}});$('cancel-edit').addEventListener('click',reset);}
$('export').addEventListener('click',()=>{try{download(C.slug+'-sauvegarde.json',L.backup(records),'application/json');tell(t('msg.exported'))}catch(e){tell(errText(e),true)}});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');const next=L.validateBackup(JSON.parse(await file.text()));if(!confirm(t('confirm.restore',{a:records.length,n:next.length})))return;const wasReadOnly=readOnly;readOnly=false;if(!safeSave(next))readOnly=wasReadOnly;else{reset();render();tell(t('msg.restored'))}}catch(e){tell(t('msg.importRefused',{msg:errText(e)}),true)}});
$('export-raw').addEventListener('click',()=>{download(C.slug+'-stockage-original.txt',localStorage.getItem(storageKey)||'','text/plain');tell(t('msg.raw'));});
$('search').addEventListener('input',render);
try{const raw=localStorage.getItem(storageKey);if(raw){records=L.validateBackup(JSON.parse(raw))}}catch(e){readOnly=true;tell(t('msg.unreadable'),true);$('warning').hidden=false}
initForm();render();
// Nouvelle langue ou devise : libellés et résultats régénérés, saisie en cours conservée.
I.onChange(()=>{fieldLabels();saveLabel();render();tell(readOnly?t('msg.unreadable'):'',readOnly);});
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
