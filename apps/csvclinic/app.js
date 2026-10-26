/* CSVClinic v2 — explicit lifecycle: edits invalidate processed CSV immediately. */
(()=>{'use strict';
const C=window.CSVCore,by=id=>document.getElementById(id);
let result=null,revision=0,importing=false;
function message(value,error=false){
 const e=by('feedback');e.className=error?'feedback error':'feedback success';
 e.textContent=value;
}
function blank(){
 result=null;by('download').disabled=true;
 for(const id of ['before','after','removed'])by(id).textContent='—';
 by('cols').textContent='En attente d’analyse';
 const table=by('preview-table');table.tHead.replaceChildren();table.tBodies[0].replaceChildren();
 const tr=document.createElement('tr'),td=document.createElement('td');
 td.textContent='Lancez l’analyse pour afficher un aperçu fiable.';tr.append(td);table.tBodies[0].append(tr);
 by('output-info').textContent='';
}
function invalidate(){
 revision++;blank();
 if(!importing)message('Source ou réglages modifiés : relancez l’analyse pour télécharger le fichier à jour.');
}
function draw(res){
 by('before').textContent=String(res.before);
 by('after').textContent=String(res.after);
 by('removed').textContent=String(res.removed);
 by('cols').textContent=res.rows[0].length+' colonne(s) · séparateur '+(res.delimiter==='\t'?'TAB':res.delimiter);
 const table=by('preview-table'),thead=table.tHead,tbody=table.tBodies[0];
 thead.replaceChildren();tbody.replaceChildren();
 const head=document.createElement('tr');
 for(const h of res.rows[0]){const th=document.createElement('th');th.textContent=h;head.append(th);}
 thead.append(head);
 for(const row of res.rows.slice(1,51)){
  const tr=document.createElement('tr');
  for(const value of row){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  tbody.append(tr);
 }
 const note=res.after>50?'Aperçu limité aux 50 premières lignes. ':'';
 by('output-info').textContent=note+(res.blankKeys?'Attention : '+res.blankKeys+' identifiant(s) vides conservés, non dédupliqués. ':'')+
  'Évitez la suppression par première colonne lorsque cet identifiant n’est pas unique.';
 by('download').disabled=false;
}
by('source').addEventListener('input',()=>{importing=false;by('run').disabled=false;invalidate();});
for(const id of ['delimiter','dedupe','trim'])by(id).addEventListener('change',invalidate);
by('source-file').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const token=++revision;importing=true;by('run').disabled=true;blank();
 try{
  if(file.size>C.MAX_SOURCE_BYTES)throw Error('Fichier trop volumineux (1 Mo maximum)');
  const data=await file.text();
  if(token!==revision)return; // Another selection or user edit superseded this read.
  if(C.utf8Size(data)>C.MAX_SOURCE_BYTES)throw Error('Fichier décodé trop volumineux');
  by('source').value=data;
  message('Fichier chargé localement : lancez l’analyse.');
 }catch(error){
  if(token===revision)message('Import refusé : '+error.message,true);
 }finally{if(token===revision){importing=false;by('run').disabled=false;}}
});
by('run').addEventListener('click',()=>{
 blank();
 try{
  const delim=by('delimiter').value==='tab'?'\t':by('delimiter').value;
  const parsed=C.parse(by('source').value,delim);
  result=C.normalizeTable(parsed,{dedupe:by('dedupe').value,trim:by('trim').checked});
  // Verify the full export up front, including size and quoting.
  C.stringify(result.rows,result.delimiter);
  draw(result);
  message('Analyse terminée : '+result.before+' lignes, '+result.removed+' doublon(s) supprimé(s).');
 }catch(e){blank();message('Analyse refusée : '+e.message,true);}
});
by('download').addEventListener('click',()=>{
 if(!result)return;
 try{
  const csv=C.stringify(result.rows,result.delimiter),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.download='csvclinic-nettoye.csv';a.href=url;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  message('Export créé. Les cellules présentant un risque de formule reçoivent une apostrophe de protection.');
 }catch(e){message('Téléchargement refusé : '+e.message,true);}
});
blank();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();