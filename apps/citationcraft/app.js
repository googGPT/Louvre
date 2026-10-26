/* CitationCraft — transactional browser state; never sends citations to a server. */
(()=>{'use strict';
const C=window.CitationCore,by=id=>document.getElementById(id),KEY='louvre-wave2-citationcraft-v1';
const EMPTY={version:1,items:[]};
let library=EMPTY,blocked=false,editing=null,revision=0;
const make=(tag,cls,txt)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(txt!==undefined)e.textContent=String(txt);
 return e;
};
function status(s,error=false){const x=by('feedback');x.textContent=s;x.className=error?'feedback error':'feedback success';}
function persist(candidate,{restore=false}={}){
 if(blocked&&!restore){status('Stockage illisible. Exportez le brut, puis restaurez une sauvegarde valide.',true);return false;}
 try{
  const clean=C.validateLibrary(candidate);
  localStorage.setItem(KEY,JSON.stringify(clean));
  library=clean;if(restore)blocked=false;
  render();return true;
 }catch(e){status('Enregistrement impossible : '+e.message+'. Les références précédentes sont conservées.',true);return false;}
}
function download(name,text,mime){
 const blob=new Blob([text],{type:mime}),u=URL.createObjectURL(blob),a=make('a');
 a.download=name;a.href=u;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),5000);
}
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
 by('form-title').textContent='Ajouter une référence';
 by('save').textContent='Enregistrer la référence';
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
 by('form-title').textContent='Modifier la référence : '+ref.id;
 by('save').textContent='Enregistrer les modifications';
 by('cancel-edit').hidden=false;
 by('ref-title').focus();
}
function render(){
 const list=by('reference-list');list.replaceChildren();
 const query=by('search').value.trim().toLocaleLowerCase('fr');
 const type=by('filter-type').value;
 const shown=library.items.filter(r=>(!type||r.type===type) &&
  (!query||[r.id,r.title,r.authors.join(' '),r.year,r.doi,r.source].join(' ').toLocaleLowerCase('fr').includes(query)));
 by('count').textContent=library.items.length+' / '+C.MAX_ITEMS+' référence(s)';
 by('match-count').textContent=shown.length+' affichée(s)';
 by('warning').hidden=!blocked;
 for(const id of ['save','export-json','export-bib','export-ris','import-trigger','clear-all'])
  by(id).disabled=blocked||(id.startsWith('export')||id==='clear-all'?library.items.length===0:false);
 by('restore-trigger').disabled=false;by('export-raw').hidden=!blocked;
 if(!shown.length)list.append(make('p','empty',library.items.length?'Aucune référence ne correspond aux filtres.':'Votre bibliothèque est vide. Ajoutez une référence ou importez un fichier.'));
 for(const r of shown){
  const card=make('article','reference-card');
  const top=make('div','ref-top');
  top.append(make('strong',null,r.title),make('span','tag',r.type+' · '+(r.year||'s. d.')));
  card.append(top,make('p','ref-meta',r.authors.join(', ')||'Auteur non indiqué'),
   make('p','ref-preview',C.preview(r)));
  if(r.doi)card.append(make('small','doi','DOI : '+r.doi));
  const actions=make('div','ref-actions');
  const edit=make('button','secondary','Modifier');edit.type='button';
  edit.addEventListener('click',()=>loadForm(r));
  const del=make('button','danger','Supprimer');del.type='button';del.disabled=blocked;
  del.addEventListener('click',()=>{
   if(!confirm('Supprimer la référence '+r.id+' ?'))return;
   if(persist({version:1,items:library.items.filter(x=>x.id!==r.id)})){
    if(editing===r.id)resetForm();status('Référence supprimée.');
   }
  });
  actions.append(edit,del);card.append(actions);list.append(card);
 }
}
by('record-form').addEventListener('submit',e=>{
 e.preventDefault();
 try{
  const ref=C.normalize(formValue()),previous=library.items;
  if(editing && !previous.some(x=>x.id===editing))throw Error('Référence modifiée ou disparue depuis la dernière édition');
  const items=editing?previous.map(x=>x.id===editing?ref:x):[...previous,ref];
  if(persist({version:1,items})){resetForm();status('Référence enregistrée localement.');}
 }catch(e){status(e.message,true);}
});
by('cancel-edit').addEventListener('click',resetForm);
by('search').addEventListener('input',render);
by('filter-type').addEventListener('change',render);
by('clear-all').addEventListener('click',()=>{
 if(!library.items.length||!confirm('Effacer toutes les références de cet appareil ? Exportez une sauvegarde avant de continuer.'))return;
 if(persist(EMPTY)){resetForm();status('Bibliothèque vidée.');}
});
for(const [id,type,filename] of [
 ['export-bib','bib','citationcraft-references.bib'],
 ['export-ris','ris','citationcraft-references.ris'],
 ['export-json','json','citationcraft-sauvegarde.json']
]){
 by(id).addEventListener('click',()=>{
  if(blocked)return;
  try{
   const data=type==='bib'?C.emitBib(library):type==='ris'?C.emitRis(library):JSON.stringify(C.validateLibrary(library),null,2);
   download(filename,data,type==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8');
   status('Export '+type.toUpperCase()+' créé à partir de la bibliothèque validée.');
  }catch(e){status('Export impossible : '+e.message,true);}
 });
}
by('export-raw').addEventListener('click',()=>{
 try{download('citationcraft-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain;charset=utf-8');
   status('Copie brute exportée. Conservez ce fichier en privé.');
 }catch(e){status('Sauvegarde brute impossible : '+e.message,true);}
});
function importRequest(restoreOnly=false){
 if(restoreOnly)by('import-format').value='json';
 by('import-file').click();
}
by('import-trigger').addEventListener('click',()=>importRequest(false));
by('restore-trigger').addEventListener('click',()=>importRequest(true));
by('import-file').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const token=++revision;
 try{
  if(file.size>C.MAX_BYTES)throw Error('Fichier supérieur à 512 Ko');
  const raw=await file.text();if(token!==revision)return;
  const kind=by('import-format').value;
  const parsed=kind==='bib'?C.readerBib(raw):kind==='ris'?C.readerRis(raw):
   {library:C.validateLibrary(JSON.parse(raw)),warnings:[]};
  const warnings=parsed.warnings;
  const hint=warnings.length?'\nAttention : '+warnings.length+' champ(s) non pris en charge seront ignorés :\n'+warnings.slice(0,5).join('\n')+(warnings.length>5?'\n…':''):'';
  if(!confirm('Importer '+parsed.library.items.length+' référence(s) depuis '+kind.toUpperCase()+' ?\nMode : '+by('import-mode').value+'.'+hint))return;
  const mode=by('import-mode').value;
  const combined={version:1,items:mode==='replace'?parsed.library.items:[...library.items,...parsed.library.items]};
  if(persist(combined,{restore:blocked})){resetForm();status('Import réussi : '+parsed.library.items.length+' référence(s).'+(warnings.length?' '+warnings.length+' champ(s) ignoré(s) et signalé(s) avant confirmation.':''));}
 }catch(error){if(token===revision)status('Import refusé : '+error.message,true);}
});
window.addEventListener('storage',e=>{
 if(e.key!==KEY)return;
 try{library=e.newValue?C.validateLibrary(JSON.parse(e.newValue)):EMPTY;blocked=false;resetForm();render();status('Bibliothèque actualisée depuis un autre onglet.');}
 catch(error){blocked=true;render();status('Stockage modifié et illisible : restaurer un JSON valide.',true);}
});
try{const raw=localStorage.getItem(KEY);if(raw)library=C.validateLibrary(JSON.parse(raw));}
catch(error){blocked=true;status('Stockage illisible : les données sont verrouillées. Exportez le brut puis restaurez un JSON valide.',true);}
render();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();