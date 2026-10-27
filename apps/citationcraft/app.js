/* CitationCraft — transactional browser state; never sends citations to a server. */
(()=>{'use strict';
const C=window.CitationCore,by=id=>document.getElementById(id),KEY='louvre-wave2-citationcraft-v1';
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue de l'interface (aucun montant)
// Erreur du cœur (« err.cle|{…} ») traduite ; un paramètre « field » est un nom de champ à traduire aussi.
function errText(e){
 const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');
 let params;try{params=json?JSON.parse(json):undefined;}catch(x){params=undefined;}
 if(params&&params.field)params={...params,field:t('field.'+params.field)};
 return /^(err|warn)\./.test(key)?t(key,params):msg;
}
// Mentions conventionnelles de l'aperçu (« s. d. » en français, « n.d. » en anglais…).
const previewLabels=()=>({noAuthor:t('preview.noAuthor'),noDate:t('preview.noDate'),doi:t('preview.doi')});
const EMPTY={version:1,items:[]};
let library=EMPTY,blocked=false,editing=null,revision=0;
const make=(tag,cls,txt)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(txt!==undefined)e.textContent=String(txt);
 return e;
};
function status(s,error=false){const x=by('feedback');x.textContent=s;x.className=error?'feedback error':'feedback success';}
function persist(candidate,{restore=false}={}){
 if(blocked&&!restore){status(t('status.blocked'),true);return false;}
 try{
  const clean=C.validateLibrary(candidate);
  localStorage.setItem(KEY,JSON.stringify(clean));
  library=clean;if(restore)blocked=false;
  render();return true;
 }catch(e){status(t('status.saveFail',{msg:errText(e)}),true);return false;}
}
function download(name,text,mime){
 const blob=new Blob([text],{type:mime}),u=URL.createObjectURL(blob),a=make('a');
 a.download=name;a.href=u;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),5000);
}
// JSON illisible : message traduit plutôt que l'erreur technique du navigateur.
function parseJson(raw){try{return JSON.parse(raw);}catch(e){throw Error('err.json');}}
function formatAuthors(s){return s.split(/\r?\n|;/).map(x=>x.trim()).filter(Boolean);}
function formValue(){
 return {
  id:by('ref-id').value,type:by('ref-type').value,authors:formatAuthors(by('ref-authors').value),
  title:by('ref-title').value,year:by('ref-year').value,
  source:by('ref-source').value,publisher:by('ref-publisher').value,
  volume:by('ref-volume').value,number:by('ref-number').value,pages:by('ref-pages').value,
  doi:by('ref-doi').value,url:by('ref-url').value,note:by('ref-note').value
 };
}
function resetForm(){
 editing=null;by('record-form').reset();
 by('ref-id').value='';by('ref-type').value='article';
 renderFormLabels();
 by('cancel-edit').hidden=true;
}
function loadForm(ref){
 editing=ref.id;
 for(const [field,val] of Object.entries({
  'ref-id':ref.id,'ref-type':ref.type,'ref-authors':ref.authors.join('; '),
  'ref-title':ref.title,'ref-year':ref.year,'ref-source':ref.source,'ref-publisher':ref.publisher,
  'ref-volume':ref.volume,'ref-number':ref.number,'ref-pages':ref.pages,
  'ref-doi':ref.doi,'ref-url':ref.url,'ref-note':ref.note
 }))by(field).value=val;
 renderFormLabels();
 by('cancel-edit').hidden=false;
 by('ref-title').focus();
}
function renderFormLabels(){
 by('form-title').textContent=editing?t('form.editTitle',{id:editing}):t('form.addTitle');
 by('save').textContent=t(editing?'btn.saveEdit':'btn.save');
}
function render(){
 const list=by('reference-list');list.replaceChildren();
 const query=by('search').value.trim().toLocaleLowerCase(L.lang);
 const type=by('filter-type').value;
 const shown=library.items.filter(r=>(!type||r.type===type) &&
  (!query||[r.id,r.title,r.authors.join(' '),r.year,r.doi,r.source].join(' ').toLocaleLowerCase(L.lang).includes(query)));
 by('count').textContent=t('lib.count',{n:library.items.length,max:C.MAX_ITEMS});
 by('match-count').textContent=t('lib.shown',{n:shown.length});
 by('warning').hidden=!blocked;
 for(const id of ['save','export-json','export-bib','export-ris','import-trigger','clear-all'])
  by(id).disabled=blocked||(id.startsWith('export')||id==='clear-all'?library.items.length===0:false);
 by('restore-trigger').disabled=false;by('export-raw').hidden=!blocked;
 if(!shown.length)list.append(make('p','empty',t(library.items.length?'lib.noMatch':'lib.empty')));
 for(const r of shown){
  const card=make('article','reference-card');
  const top=make('div','ref-top');
  top.append(make('strong',null,r.title),make('span','tag',t('tag.'+r.type)+' · '+(r.year||t('preview.noDate'))));
  card.append(top,make('p','ref-meta',r.authors.join(', ')||t('preview.noAuthor')),
   make('p','ref-preview',C.preview(r,previewLabels())));
  if(r.doi)card.append(make('small','doi',t('preview.doi')+r.doi));
  const actions=make('div','ref-actions');
  const edit=make('button','secondary',t('btn.edit'));edit.type='button';
  edit.addEventListener('click',()=>loadForm(r));
  const del=make('button','danger',t('btn.delete'));del.type='button';del.disabled=blocked;
  del.addEventListener('click',()=>{
   if(!confirm(t('confirm.delete',{id:r.id})))return;
   if(persist({version:1,items:library.items.filter(x=>x.id!==r.id)})){
    if(editing===r.id)resetForm();status(t('status.deleted'));
   }
  });
  actions.append(edit,del);card.append(actions);list.append(card);
 }
}
by('record-form').addEventListener('submit',e=>{
 e.preventDefault();
 try{
  const ref=C.normalize(formValue()),previous=library.items;
  if(editing && !previous.some(x=>x.id===editing))throw Error('err.gone');
  const items=editing?previous.map(x=>x.id===editing?ref:x):[...previous,ref];
  if(persist({version:1,items})){resetForm();status(t('status.saved'));}
 }catch(e){status(errText(e),true);}
});
by('cancel-edit').addEventListener('click',resetForm);
by('search').addEventListener('input',render);
by('filter-type').addEventListener('change',render);
by('clear-all').addEventListener('click',()=>{
 if(!library.items.length||!confirm(t('confirm.clear')))return;
 if(persist(EMPTY)){resetForm();status(t('status.cleared'));}
});
for(const [id,type,filename] of [
 ['export-bib','bib','citationcraft-references.bib'],
 ['export-ris','ris','citationcraft-references.ris'],
 ['export-json','json','file.backup']
]){
 by(id).addEventListener('click',()=>{
  if(blocked)return;
  try{
   const data=type==='bib'?C.emitBib(library):type==='ris'?C.emitRis(library):JSON.stringify(C.validateLibrary(library),null,2);
   download(type==='json'?t(filename):filename,data,type==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8');
   status(t('status.exported',{format:type.toUpperCase()}));
  }catch(e){status(t('status.exportFail',{msg:errText(e)}),true);}
 });
}
by('export-raw').addEventListener('click',()=>{
 try{download(t('file.raw'),localStorage.getItem(KEY)||'','text/plain;charset=utf-8');
   status(t('status.rawDone'));
 }catch(e){status(t('status.rawFail',{msg:errText(e)}),true);}
});
function importRequest(restoreOnly=false){
 if(restoreOnly){by('import-format').value='json';by('import-mode').value='replace';}
 by('import-file').click();
}
by('import-trigger').addEventListener('click',()=>importRequest(false));
by('restore-trigger').addEventListener('click',()=>importRequest(true));
by('import-file').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const token=++revision;
 try{
  if(file.size>C.MAX_BYTES)throw Error('err.fileBig');
  const raw=await file.text();if(token!==revision)return;
  const kind=by('import-format').value;
  if(blocked&&(kind!=='json'||by('import-mode').value!=='replace'))throw Error('err.locked');
  const parsed=kind==='bib'?C.readerBib(raw):kind==='ris'?C.readerRis(raw):
   {library:C.validateLibrary(parseJson(raw)),warnings:[]};
  const warnings=parsed.warnings;
  const hint=warnings.length?'\n'+t('import.warnHint',{n:warnings.length})+'\n'+warnings.slice(0,5).map(w=>errText(Error(w))).join('\n')+(warnings.length>5?'\n…':''):'';
  if(!confirm(t('import.confirm',{n:parsed.library.items.length,format:kind.toUpperCase()})+'\n'+t('import.modeLine',{mode:t('import.'+by('import-mode').value)})+hint))return;
  const mode=by('import-mode').value;
  const combined={version:1,items:mode==='replace'?parsed.library.items:[...library.items,...parsed.library.items]};
  if(persist(combined,{restore:blocked})){resetForm();status(t('status.imported',{n:parsed.library.items.length})+(warnings.length?' '+t('status.importWarn',{n:warnings.length}):''));}
 }catch(error){if(token===revision)status(t('status.importFail',{msg:errText(error)}),true);}
});
window.addEventListener('storage',e=>{
 if(e.key!==KEY)return;
 revision++;
 try{library=e.newValue?C.validateLibrary(JSON.parse(e.newValue)):EMPTY;blocked=false;resetForm();render();status(t('status.otherTab'));}
 catch(error){blocked=true;render();status(t('status.otherTabBad'),true);}
});
try{const raw=localStorage.getItem(KEY);if(raw)library=C.validateLibrary(JSON.parse(raw));}
catch(error){blocked=true;status(t('status.locked'),true);}
renderFormLabels();render();
// Changement de langue : textes retraduits, formulaire et bibliothèque intacts.
L.onChange(()=>{renderFormLabels();render();});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();