/* InvoiceCanvas browser adapter — user text is always inserted with textContent.
   Texts come from messages.js (LouvreI18n). French invoicing/VAT model: amounts always in euros. */
(()=>{'use strict';
const C=window.InvoiceCore,by=id=>document.getElementById(id);
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t;
const KEY='louvre-wave2-invoicecanvas-v1';
let library=C.empty,baseline=null,blocked=false,currentId=null,locked=false,dirty=false,revision=0;
const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=String(txt);return node;};
const input=(id)=>by(id).value;
// French VAT rules: euros whatever the currency chosen elsewhere in Louvre (2 decimals forced: the global currency may have none).
const eur=c=>L.money(c,{currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
const pct=v=>L.number(Number(v)/100,{style:'percent',maximumFractionDigits:2});
const qty=v=>L.number(Number(v),{maximumFractionDigits:3});
const day=d=>L.date(d);
// Core errors are keys (« err.decimals|{"field":"unitPrice"} ») : the field code is translated too.
function errText(e){
 const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');
 let p;try{p=json?JSON.parse(json):undefined;}catch(_){p=undefined;}
 if(p&&p.field!==undefined){const fk='fld.'+p.field;if(window.LouvreMessages.fr[fk]!==undefined)p.field=t(fk);}
 return L.error(Error(p?key+'|'+JSON.stringify(p):key));
}
function feedback(s,error=false){const e=by('feedback');e.textContent=s;e.className=error?'feedback error':'feedback success';}
function dateToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function newId(){return 'doc-'+(crypto.randomUUID?.()||('fallback-'+Date.now()+'-'+Math.floor(Math.random()*1e6)));}
function line(x={label:'',quantity:'1',unitPrice:'0.00',vatRate:'20.00'}){
 const row=el('div','line-row');
 for(const [name,key,ph] of [['label','line.label','ph.line'],['quantity','line.qty','ph.qty'],['unitPrice','line.price','ph.price'],['vatRate','line.vat','ph.vatRate']]){
  const label=el('label',name==='label'?'wide':''),span=el('span',null,t(key)),field=el('input');
  span.dataset.i18n=key; // re-translated by LouvreI18n.apply() on language change, input kept
  field.type='text';field.dataset.field=name;field.value=x[name]??'';
  field.placeholder=t(ph);field.setAttribute('aria-label',t(key));field.dataset.i18nAttr='placeholder:'+ph+';aria-label:'+key;
  field.maxLength=name==='label'?300:20;
  label.append(span,field);row.append(label);
 }
 const remove=el('button','line-remove',t('btn.removeLine'));remove.type='button';remove.setAttribute('aria-label',t('aria.removeLine'));
 remove.dataset.i18n='btn.removeLine';remove.dataset.i18nAttr='aria-label:aria.removeLine';
 remove.addEventListener('click',()=>{
  if(locked||blocked)return;
  if(by('line-items').children.length===1){feedback(t('msg.keepOne'),true);return;}
  row.remove();changed();
 });
 row.append(remove);by('line-items').append(row);
}
function getRows(){return Array.from(by('line-items').children).map(row=>{
 const value={};for(const f of row.querySelectorAll('[data-field]'))value[f.dataset.field]=f.value;return value;
});}
function readForm(){
 return C.draft({
  id:currentId,type:input('type'),status:locked?'locked':'draft',
  number:locked?library.documents.find(x=>x.id===currentId)?.number:null,
  issueDate:input('issueDate'),serviceDate:input('serviceDate'),dueDate:input('dueDate'),
  seller:{name:input('seller-name'),address:input('seller-address'),siren:input('seller-siren'),vat:input('seller-vat')},
  buyer:{name:input('buyer-name'),address:input('buyer-address'),siren:input('buyer-siren'),vat:input('buyer-vat')},
  purchaseOrder:input('purchaseOrder'),nature:input('nature'),deliveryAddress:input('deliveryAddress'),
  conditions:input('conditions'),exemption:input('exemption'),notes:input('notes'),items:getRows()
 });
}
function setForm(d){
 for(const [k,v] of Object.entries({
  type:d.type,issueDate:d.issueDate,serviceDate:d.serviceDate,dueDate:d.dueDate,
  'seller-name':d.seller.name,'seller-address':d.seller.address,'seller-siren':d.seller.siren,'seller-vat':d.seller.vat,
  'buyer-name':d.buyer.name,'buyer-address':d.buyer.address,'buyer-siren':d.buyer.siren,'buyer-vat':d.buyer.vat,
  purchaseOrder:d.purchaseOrder,nature:d.nature,deliveryAddress:d.deliveryAddress,conditions:d.conditions,exemption:d.exemption,notes:d.notes
 }))by(k).value=v;
 by('line-items').replaceChildren();for(const x of d.items)line(x);
}
function toggle(){
 for(const control of by('editor-form').querySelectorAll('input,select,textarea,button')){
  if(control.id==='new')continue;
  control.disabled=blocked||locked;
 }
 by('add-line').disabled=blocked||locked;
 by('export-json').disabled=blocked||!library.documents.length;
 by('import-trigger').disabled=false;
 by('raw-export').hidden=!blocked;
 by('warning').hidden=!blocked;
}
function fresh(force=false){
 if(dirty&&!force&&!confirm(t('confirm.leave')))return;
 currentId=newId();locked=false;dirty=false;
 by('editor-form').reset();
 by('issueDate').value=dateToday();by('type').value='quote';by('nature').value='';
 by('line-items').replaceChildren();line();
 toggle();preview();feedback(t('msg.new'));
}
function transaction(next,restore=false){
 if(blocked&&!restore){feedback(t('msg.blocked'),true);return false;}
 try{
  const s=C.store(next),current=localStorage.getItem(KEY);
  if(!restore&&current!==baseline){blocked=true;toggle();feedback(t('msg.otherTab'),true);return false;}
  const encoded=JSON.stringify(s);
  localStorage.setItem(KEY,encoded);baseline=encoded;library=s;blocked=false;dirty=false;revision++;
  renderArchives();toggle();return true;
 }catch(e){feedback(t('msg.writeFail',{msg:errText(e)}),true);return false;}
}
function save(){
 try{
  const d=readForm();if(d.status!=='draft'){feedback(t('msg.lockedCopy'),true);return;}
  if(transaction(C.put(library,d))){preview();feedback(t('msg.saved'));}
 }catch(e){feedback(t('msg.draftInvalid',{msg:errText(e)}),true);}
}
function lock(){
 if(!confirm(t('confirm.lock')))return;
 try{
  const d=readForm();if(d.status!=='draft')throw Error('err.alreadyLocked');
  const committed=C.lock(C.put(library,d),d.id);
  if(transaction(committed)){locked=true;toggle();preview();feedback(t('msg.locked'));}
 }catch(e){feedback(t('msg.lockRefused',{msg:errText(e)}),true);}
}
function showLines(parent,rows){
 const table=el('table','bill-table');
 const h=el('thead'),tr=el('tr');
 for(const heading of ['th.label','th.qty','th.unit','th.vat','th.ht','th.ttc'])tr.append(el('th',null,t(heading)));
 h.append(tr);table.append(h);
 const body=el('tbody');
 for(const l of rows){
  const row=el('tr');
  for(const x of [l.label,qty(l.quantity),eur(C.fixed(l.unitPrice,2,10000000,'unitPrice')),pct(l.vatRate),eur(l.ht),eur(l.ttc)])
   row.append(el('td',null,x));
  body.append(row);
 }
 table.append(body);parent.replaceChildren(table);
}
function preview(){
 try{
  const doc=readForm(),result=C.compute(doc);
  by('print-type').textContent=t(doc.type==='quote'?'doc.quote':'doc.invoice');
  by('print-number').textContent=doc.status==='locked'?doc.number:t('doc.draftNumber');
  const part=v=>[v.name,v.address,v.siren?t('party.siren',{v:v.siren}):'',v.vat?t('party.vat',{v:v.vat}):''].filter(Boolean).join('\n');
  by('print-seller').textContent=part(doc.seller)||t('seller.missing');
  by('print-buyer').textContent=part(doc.buyer)||t('buyer.missing');
  by('print-dates').textContent=[t('dates.issue',{d:day(doc.issueDate)}),doc.serviceDate?t('dates.service',{d:day(doc.serviceDate)}):'',
   doc.dueDate?t('dates.due',{d:day(doc.dueDate)}):'',doc.purchaseOrder?t('dates.po',{v:doc.purchaseOrder}):''].filter(Boolean).join(' · ');
  showLines(by('print-items'),result.lines);
  by('print-ht').textContent=eur(result.ht);by('print-vat').textContent=eur(result.vat);
  by('print-ttc').textContent=eur(result.ttc);
  by('print-tax').textContent=t('tax.summary',{list:result.vatSummary.map(x=>t('tax.item',{rate:pct(x.rate),ht:eur(x.ht),vat:eur(x.vat)})).join(' · ')});
  const mentions=[];
  for(const [key,value] of [['m.nature',doc.nature?t('nature.'+doc.nature):''],['m.delivery',doc.deliveryAddress],['m.exemption',doc.exemption],
   ['m.conditions',doc.conditions],['m.notes',doc.notes]])if(value)mentions.push(t(key,{v:value}));
  by('print-mentions').replaceChildren(...mentions.map(s=>el('p',null,s)));
  by('print').disabled=blocked;by('print-sheet').classList.remove('invalid');
  return true;
 }catch(e){
  by('print').disabled=true;by('print-sheet').classList.add('invalid');
  by('print-items').replaceChildren(el('p','preview-empty',t('preview.invalid',{msg:errText(e)})));
  by('print-ht').textContent='—';by('print-vat').textContent='—';by('print-ttc').textContent='—';
  by('print-tax').textContent='';by('print-mentions').replaceChildren();
  return false;
 }
}
function changed(){
 if(locked||blocked)return;
 dirty=true;revision++;preview();
}
function openDoc(id){
 if(dirty&&!confirm(t('confirm.open')))return;
 const d=library.documents.find(x=>x.id===id);if(!d)return;
 currentId=d.id;locked=d.status==='locked';dirty=false;
 setForm(d);toggle();preview();feedback(t(locked?'msg.loadedLocked':'msg.loadedDraft'));
}
function renderArchives(){
 const box=by('documents');box.replaceChildren();
 if(!library.documents.length)box.append(el('p','empty',t('archives.empty')));
 for(const d of [...library.documents].reverse()){
  const card=el('div','archive-card');
  const info=el('div');info.append(el('strong',null,d.number||t('archive.draft')),el('p',null,
   [t(d.type==='invoice'?'opt.invoice':'opt.quote'),day(d.issueDate),d.buyer.name||t('archive.noClient'),eur(C.compute(d).ttc)].join(' · ')));
  const actions=el('div','archive-actions'),open=el('button','secondary',t('btn.open'));open.type='button';
  open.addEventListener('click',()=>openDoc(d.id));actions.append(open);
  if(d.status==='draft'){
   const del=el('button','danger',t('btn.delete'));del.type='button';
   del.addEventListener('click',()=>{
    if(!confirm(t('confirm.delete')))return;
    try{if(transaction(C.remove(library,d.id))){
      if(currentId===d.id)fresh(true);feedback(t('msg.deleted'));
    }}catch(e){feedback(errText(e),true);}
   });actions.append(del);
  }
  card.append(info,actions);box.append(card);
 }
}
function exportBlob(name,content){
 const blob=new Blob([content],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=el('a');a.download=name;a.href=url;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
by('save').addEventListener('click',save);by('lock').addEventListener('click',lock);
by('new').addEventListener('click',()=>fresh());
by('add-line').addEventListener('click',()=>{
 if(by('line-items').children.length>=C.MAX_ITEMS){feedback(t('msg.maxLines',{max:C.MAX_ITEMS}),true);return;}
 line();changed();
});
by('editor-form').addEventListener('input',changed);
by('editor-form').addEventListener('change',changed);
by('line-items').addEventListener('input',changed);
by('print').addEventListener('click',()=>{
 if(preview())window.print();
});
by('export-json').addEventListener('click',()=>{
 if(blocked)return;
 try{exportBlob('invoicecanvas-sauvegarde.json',JSON.stringify(C.store(library),null,2));feedback(t('msg.exported'));}
 catch(e){feedback(t('msg.exportFail',{msg:errText(e)}),true);}
});
by('raw-export').addEventListener('click',()=>{
 try{exportBlob('invoicecanvas-stockage-brut.json.txt',localStorage.getItem(KEY)||'');feedback(t('msg.rawExported'));}
 catch(e){feedback(errText(e),true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async(e)=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const token=++revision;
 try{
  if(file.size>C.MAX_STORAGE)throw Error('err.fileBig');
  const s=await file.text();if(token!==revision)return;
  const restored=C.store(JSON.parse(s));
  if(!confirm(t('confirm.restore',{n:restored.documents.length})))return;
  if(transaction(restored,true)){fresh(true);feedback(t('msg.restored'));}
 }catch(err){if(token===revision)feedback(t('msg.restoreRefused',{msg:errText(err)}),true);}
});
window.addEventListener('storage',e=>{
 if(e.key!==KEY)return;
 revision++;
 try{
  library=e.newValue?C.store(JSON.parse(e.newValue)):C.empty;baseline=e.newValue;blocked=false;dirty=false;
  renderArchives();toggle();fresh(true);feedback(t('msg.syncedTab'));
 }catch(err){blocked=true;toggle();feedback(t('msg.externalBad'),true);}
});
try{
 const s=localStorage.getItem(KEY);if(s){library=C.store(JSON.parse(s));baseline=s;}
}catch(e){blocked=true;feedback(t('msg.corrupt'),true);}
renderArchives();fresh(true);
if(blocked)feedback(t('msg.corruptStart'),true);
// New language: static texts are re-translated by LouvreI18n.apply(); the form (and its lines) is kept as typed.
L.onChange(()=>{feedback(blocked?t('msg.corruptStart'):'',blocked);preview();renderArchives();});
if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
