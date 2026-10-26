/* InvoiceCanvas browser adapter — user text is always inserted with textContent. */
(()=>{'use strict';
const C=window.InvoiceCore,by=id=>document.getElementById(id);
const KEY='louvre-wave2-invoicecanvas-v1';
let library=C.empty,baseline=null,blocked=false,currentId=null,locked=false,dirty=false,revision=0;
const el=(tag,cls,txt)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=String(txt);return node;};
const input=(id)=>by(id).value;
function feedback(s,error=false){const e=by('feedback');e.textContent=s;e.className=error?'feedback error':'feedback success';}
function dateToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function newId(){return 'doc-'+(crypto.randomUUID?.()||('fallback-'+Date.now()+'-'+Math.floor(Math.random()*1e6)));}
function line(x={label:'',quantity:'1',unitPrice:'0.00',vatRate:'20.00'}){
 const row=el('div','line-row');
 for(const [name,title,type] of [['label','Désignation','text'],['quantity','Quantité','text'],['unitPrice','Prix HT (€)','text'],['vatRate','TVA (%)','text']]){
  const label=el('label',name==='label'?'wide':'',title),field=el('input');
  field.type=type;field.dataset.field=name;field.value=x[name]??'';
  field.placeholder=name==='label'?'Prestation ou produit':name==='vatRate'?'20,00':name==='quantity'?'1,000':'0,00';
  field.setAttribute('aria-label',title);
  field.maxLength=name==='label'?300:20;
  label.append(field);row.append(label);
 }
 const remove=el('button','line-remove','Supprimer');remove.type='button';remove.setAttribute('aria-label','Supprimer cette ligne');
 remove.addEventListener('click',()=>{
  if(locked||blocked)return;
  if(by('line-items').children.length===1){feedback('Conservez au moins une ligne.',true);return;}
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
 if(dirty&&!force&&!confirm('Quitter ce document sans enregistrer les dernières modifications ?'))return;
 currentId=newId();locked=false;dirty=false;
 by('editor-form').reset();
 by('issueDate').value=dateToday();by('type').value='quote';by('nature').value='';
 by('line-items').replaceChildren();line();
 toggle();preview();feedback('Nouveau brouillon. Aucun numéro n’est attribué avant verrouillage.');
}
function transaction(next,restore=false){
 if(blocked&&!restore){feedback('Stockage bloqué : restaurez un JSON valide.',true);return false;}
 try{
  const s=C.store(next),current=localStorage.getItem(KEY);
  if(!restore&&current!==baseline){blocked=true;toggle();feedback('Bibliothèque modifiée dans un autre onglet. Rechargez ou restaurez pour éviter tout conflit.',true);return false;}
  const encoded=JSON.stringify(s);
  localStorage.setItem(KEY,encoded);baseline=encoded;library=s;blocked=false;dirty=false;revision++;
  renderArchives();toggle();return true;
 }catch(e){feedback('Écriture refusée : '+e.message+'. Les anciennes données restent inchangées.',true);return false;}
}
function save(){
 try{
  const d=readForm();if(d.status!=='draft'){feedback('Copie verrouillée : créez un nouveau brouillon.',true);return;}
  if(transaction(C.put(library,d))){preview();feedback('Brouillon enregistré sur cet appareil. Exportez une sauvegarde régulièrement.');}
 }catch(e){feedback('Brouillon invalide : '+e.message,true);}
}
function lock(){
 if(!confirm('Verrouiller une copie numérotée ? Elle ne pourra plus être modifiée ou supprimée dans l’application. La numérotation locale n’est pas une garantie réglementaire multi-appareils.'))return;
 try{
  const d=readForm();if(d.status!=='draft')throw Error('Document déjà verrouillé');
  const committed=C.lock(C.put(library,d),d.id);
  if(transaction(committed)){locked=true;toggle();preview();feedback('Copie verrouillée et numérotée localement : vérifiez sa conformité avant toute utilisation officielle.');}
 }catch(e){feedback('Verrouillage refusé : '+e.message,true);}
}
function showLines(parent,rows){
 const table=el('table','bill-table');
 const h=el('thead'),tr=el('tr');
 for(const heading of ['Désignation','Qté','PU HT','TVA','Total HT','Total TTC'])tr.append(el('th',null,heading));
 h.append(tr);table.append(h);
 const body=el('tbody');
 for(const l of rows){
  const row=el('tr');
  for(const x of [l.label,l.quantity,C.money(C.fixed(l.unitPrice,2,10000000,'Prix HT')),l.vatRate+' %',C.money(l.ht),C.money(l.ttc)])
   row.append(el('td',null,x));
  body.append(row);
 }
 table.append(body);parent.replaceChildren(table);
}
function preview(){
 try{
  const doc=readForm(),result=C.compute(doc);
  by('print-type').textContent=doc.type==='quote'?'DEVIS':'PROJET DE FACTURE';
  by('print-number').textContent=doc.status==='locked'?doc.number:'BROUILLON — aucun numéro attribué';
  const part=v=>[v.name,v.address,v.siren?'SIREN '+v.siren:'',v.vat?'TVA '+v.vat:''].filter(Boolean).join('\n');
  by('print-seller').textContent=part(doc.seller)||'Émetteur à compléter';
  by('print-buyer').textContent=part(doc.buyer)||'Destinataire à compléter';
  by('print-dates').textContent='Émission : '+doc.issueDate+(doc.serviceDate?' · Opération : '+doc.serviceDate:'')+
   (doc.dueDate?' · Échéance : '+doc.dueDate:'')+
   (doc.purchaseOrder?' · Bon de commande : '+doc.purchaseOrder:'');
  showLines(by('print-items'),result.lines);
  by('print-ht').textContent=C.money(result.ht);by('print-vat').textContent=C.money(result.vat);
  by('print-ttc').textContent=C.money(result.ttc);
  by('print-tax').textContent='Détail TVA : '+result.vatSummary.map(x=>x.rate+' % : base '+C.money(x.ht)+' / taxe '+C.money(x.vat)).join(' · ');
  const mentions=[];
  for(const [label,value] of [['Nature',doc.nature],['Livraison',doc.deliveryAddress],['Fondement TVA 0 %',doc.exemption],
   ['Conditions de règlement',doc.conditions],['Mentions supplémentaires',doc.notes]])if(value)mentions.push(label+' : '+value);
  by('print-mentions').replaceChildren(...mentions.map(s=>el('p',null,s)));
  by('print').disabled=blocked;by('print-sheet').classList.remove('invalid');
  return true;
 }catch(e){
  by('print').disabled=true;by('print-sheet').classList.add('invalid');
  by('print-items').replaceChildren(el('p','preview-empty','Complétez les lignes et les dates pour afficher un aperçu valide : '+e.message));
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
 if(dirty&&!confirm('Ouvrir une autre version et perdre les modifications non enregistrées ?'))return;
 const d=library.documents.find(x=>x.id===id);if(!d)return;
 currentId=d.id;locked=d.status==='locked';dirty=false;
 setForm(d);toggle();preview();feedback((locked?'Copie verrouillée':'Brouillon')+' chargé(e) depuis le stockage local.');
}
function renderArchives(){
 const box=by('documents');box.replaceChildren();
 if(!library.documents.length)box.append(el('p','empty','Aucun document enregistré sur cet appareil.'));
 for(const d of [...library.documents].reverse()){
  const card=el('div','archive-card');
  const info=el('div');info.append(el('strong',null,d.number||'BROUILLON'),el('p',null,
   (d.type==='invoice'?'Projet de facture':'Devis')+' · '+d.issueDate+' · '+(d.buyer.name||'Client à compléter')+' · '+C.money(C.compute(d).ttc)));
  const actions=el('div','archive-actions'),open=el('button','secondary','Ouvrir');open.type='button';
  open.addEventListener('click',()=>openDoc(d.id));actions.append(open);
  if(d.status==='draft'){
   const del=el('button','danger','Supprimer');del.type='button';
   del.addEventListener('click',()=>{
    if(!confirm('Supprimer définitivement ce brouillon local ?'))return;
    try{if(transaction(C.remove(library,d.id))){
      if(currentId===d.id)fresh(true);feedback('Brouillon supprimé.');
    }}catch(e){feedback(e.message,true);}
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
 if(by('line-items').children.length>=C.MAX_ITEMS){feedback('Maximum 60 lignes.',true);return;}
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
 try{exportBlob('invoicecanvas-sauvegarde.json',JSON.stringify(C.store(library),null,2));feedback('Sauvegarde JSON téléchargée. Conservez-la en lieu sûr.');}
 catch(e){feedback('Export impossible : '+e.message,true);}
});
by('raw-export').addEventListener('click',()=>{
 try{exportBlob('invoicecanvas-stockage-brut.json.txt',localStorage.getItem(KEY)||'');feedback('Copie brute exportée.');}
 catch(e){feedback(e.message,true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async(e)=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const token=++revision;
 try{
  if(file.size>C.MAX_STORAGE)throw Error('Fichier trop volumineux (700 Ko maximum)');
  const s=await file.text();if(token!==revision)return;
  const restored=C.store(JSON.parse(s));
  if(!confirm('Remplacer la bibliothèque locale par '+restored.documents.length+' document(s) ? Conservez votre sauvegarde actuelle.'))return;
  if(transaction(restored,true)){fresh(true);feedback('Sauvegarde restaurée après validation complète.');}
 }catch(err){if(token===revision)feedback('Restauration refusée : '+err.message,true);}
});
window.addEventListener('storage',e=>{
 if(e.key!==KEY)return;
 revision++;
 try{
  library=e.newValue?C.store(JSON.parse(e.newValue)):C.empty;baseline=e.newValue;blocked=false;dirty=false;
  renderArchives();toggle();fresh(true);feedback('Bibliothèque mise à jour depuis un autre onglet.');
 }catch(err){blocked=true;toggle();feedback('Modification externe illisible : édition bloquée.',true);}
});
try{
 const s=localStorage.getItem(KEY);if(s){library=C.store(JSON.parse(s));baseline=s;}
}catch(e){blocked=true;feedback('Sauvegarde illisible : modifications bloquées. Exportez la copie brute et restaurez un JSON valide.',true);}
renderArchives();fresh(true);
if(blocked)feedback('Sauvegarde locale illisible : restaurez un JSON valide sans écraser l’original.',true);
if('serviceWorker' in navigator && location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();