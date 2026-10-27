/* Interface accessible, aucune dépendance ni connexion réseau. Calculs dans core.js ; textes et formats dans LouvreI18n. */
'use strict';
(()=>{
const L=AppLogic,C=L.SPEC,storageKey='louvre-factory:'+C.slug+':v1';
const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue, traductions et formats (appli sans argent)
let records=[],activeId=null,readOnly=false;
const $=id=>document.getElementById(id);
const status=$('status'),form=$('record-form'),body=$('items'),summary=$('summary');
// Valeurs enregistrées (« oui » / « non », inchangées) -> clés de traduction pour l'affichage.
const YES_NO={oui:'yes',non:'no'};
const fieldLabel=key=>t('field.'+key);
function display(field,v){if(field.key==='completed')return t(YES_NO[v]||'no');if(field.type==='date')return I.date(v,{day:'numeric',month:'short',year:'numeric'});return field.type==='number'?I.number(v):String(v);}
// Erreur du cœur : clé|{"field":"day"} -> nom du champ traduit avant mise en forme.
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
function render(){const result=L.compute(records);summary.replaceChildren();for(const k of result.kpis){const value=k.digits?I.number(k.value,{minimumFractionDigits:k.digits,maximumFractionDigits:k.digits}):I.number(k.value);const card=node('div','stat');card.append(textNode(node('span','stat-label'),t(k.key)),textNode(node('strong','stat-value'),value));summary.append(card);}
 $('notes').replaceChildren(...result.notes.map(n=>textNode(node('p'),t(n))));
 const lines=result.rows.map(r=>t('row',{task:r.task,minutes:t('min',{v:I.number(r.minutes)})}));
 $('insights').replaceChildren(...(lines.length?lines:[t('details.empty')]).map(n=>textNode(node('li'),n)));
 const query=$('search').value.toLocaleLowerCase(I.locale).trim(),visible=records.filter(r=>Object.values(r).some(x=>String(x).toLocaleLowerCase(I.locale).includes(query)));$('counter').textContent=t('counter',{n:visible.length});body.replaceChildren();
 for(const r of visible.slice().reverse()){const card=node('article','item');const h=node('h3');h.textContent=r[C.fields[0].key];card.append(h);const dl=node('dl');for(const field of C.fields){const dt=node('dt'),dd=node('dd');dt.textContent=fieldLabel(field.key);dd.textContent=display(field,r[field.key]);dl.append(dt,dd);}card.append(dl);
  const bar=node('div','item-actions');const edit=node('button','outline small'),del=node('button','danger small');edit.type=del.type='button';edit.textContent=t('btn.edit');del.textContent=t('btn.delete');edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&safeSave(records.filter(x=>x.id!==r.id))){render();tellKey('st.deleted')}});bar.append(edit,del);card.append(bar);body.append(card)}
}
function saveLabel(){$('save-button').textContent=t(activeId?'btn.update':'btn.save');}
function editRecord(r){activeId=r.id;for(const f of C.fields)form.elements.namedItem(f.key).value=r[f.key];saveLabel();$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
function reset(){activeId=null;form.reset();saveLabel();$('cancel-edit').hidden=true;}
// Libellés du formulaire (langue changée) : seuls les textes changent, jamais les valeurs saisies.
function relabel(){for(const c of $('fields').querySelectorAll('[data-field]'))c.textContent=fieldLabel(c.dataset.field);for(const o of form.elements.namedItem('completed').options)o.textContent=t(YES_NO[o.value]);saveLabel();}
function initForm(){for(const f of C.fields){const outer=node('label','field'),label=node('span');label.textContent=fieldLabel(f.key);label.dataset.field=f.key;let input;if(f.type==='select'){input=node('select');for(const o of f.options){const opt=node('option');opt.value=o;opt.textContent=t(YES_NO[o]);input.append(opt)}}else{input=node('input');input.type=f.type;if(f.type==='number'){input.step='any';input.min='0';input.max='100000000';}else input.maxLength=160;}input.name=f.key;input.required=true;input.autocomplete='off';if(f.type==='date')input.value=L.dayKey();outer.append(label,input);$('fields').append(outer)}
 form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tellKey('st.locked',null,true);return;}try{const o={id:activeId||crypto.randomUUID().replaceAll('-','').slice(0,24)};for(const f of C.fields){const raw=form.elements.namedItem(f.key).value;o[f.key]=f.type==='number'?Number(raw):raw;}const valid=L.normalizeRecord(o);const next=activeId?records.map(x=>x.id===activeId?valid:x):[...records,valid];if(next.length>L.MAX)throw Error('err.capacity|'+JSON.stringify({max:L.MAX}));if(safeSave(next)){reset();render();tellKey('st.saved')}}catch(e){tellErr(null,e)}});
 $('cancel-edit').addEventListener('click',reset);}
$('export').addEventListener('click',()=>{try{download(C.slug+'-sauvegarde.json',L.backup(records),'application/json');tellKey('st.json')}catch(e){tellErr(null,e)}});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');const next=L.validateBackup(JSON.parse(await file.text()));if(!confirm(t('confirm.import',{a:I.number(records.length),b:I.number(next.length)})))return;const wasReadOnly=readOnly;readOnly=false;if(!safeSave(next))readOnly=wasReadOnly;else{reset();render();tellKey('st.restored')}}catch(e){tellErr('st.importRefused',e)}});
$('export-raw').addEventListener('click',()=>{download(C.slug+'-stockage-original.txt',localStorage.getItem(storageKey)||'','text/plain');tellKey('st.raw');});
$('search').addEventListener('input',render);
try{const raw=localStorage.getItem(storageKey);if(raw){records=L.validateBackup(JSON.parse(raw))}}catch(e){readOnly=true;tellKey('st.unreadable',null,true);$('warning').hidden=false}
initForm();saveLabel();render();
// Nouvelle langue : libellés, dates et nombres retraduits ; saisie et mode édition conservés.
I.onChange(()=>{relabel();render();if(lastTell)tell(lastTell.message,lastTell.error)});
if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
