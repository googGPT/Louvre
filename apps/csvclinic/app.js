/* CSVClinic v2 — explicit lifecycle: edits invalidate processed CSV immediately. Texts via LouvreI18n (messages.js);
   the parsing and the exported CSV never depend on the interface language. */
(()=>{'use strict';
const C=window.CSVCore,by=id=>document.getElementById(id);
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue et traductions
let result=null,revision=0,importing=false,lastMessage=null;
// Le dernier message est gardé sous forme de clé (paramètres calculés par une fonction) : il est retraduit si la langue change.
function message(key,params,error=false){
 lastMessage=[key,params,error];
 const e=by('feedback');e.className=error?'feedback error':'feedback success';
 e.textContent=t(key,typeof params==='function'?params():params);
}
function blank(){
 result=null;by('download').disabled=true;
 for(const id of ['before','after','removed'])by(id).textContent='—';
 by('cols').textContent=t('res.waiting');
 const table=by('preview-table');table.tHead.replaceChildren();table.tBodies[0].replaceChildren();
 const tr=document.createElement('tr'),td=document.createElement('td');
 td.textContent=t('res.empty');tr.append(td);table.tBodies[0].append(tr);
 by('output-info').textContent='';
}
function invalidate(){
 revision++;blank();
 if(!importing)message('msg.changed');
}
function delimiterName(d){return d==='\t'?t('delim.tabShort'):d;}
function draw(res){
 by('before').textContent=L.number(res.before);
 by('after').textContent=L.number(res.after);
 by('removed').textContent=L.number(res.removed);
 by('cols').textContent=t('res.cols',{n:res.rows[0].length,delimiter:delimiterName(res.delimiter)});
 const table=by('preview-table'),thead=table.tHead,tbody=table.tBodies[0];
 thead.replaceChildren();tbody.replaceChildren();
 const head=document.createElement('tr');
 for(const h of res.rows[0]){const th=document.createElement('th');th.textContent=h;th.dir='auto';head.append(th);}
 thead.append(head);
 for(const row of res.rows.slice(1,51)){
  const tr=document.createElement('tr');
  for(const value of row){const td=document.createElement('td');td.textContent=value;td.dir='auto';tr.append(td);}
  tbody.append(tr);
 }
 const parts=[];
 if(res.after>50)parts.push(t('info.limited'));
 if(res.blankKeys)parts.push(t('info.blankKeys',{n:res.blankKeys}));
 parts.push(t('info.firstColumn'));
 by('output-info').textContent=parts.join(' ');
 by('download').disabled=false;
}
by('source').addEventListener('input',()=>{importing=false;by('run').disabled=false;invalidate();});
for(const id of ['delimiter','dedupe','trim'])by(id).addEventListener('change',invalidate);
by('source-file').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const token=++revision;importing=true;by('run').disabled=true;blank();
 try{
  if(file.size>C.MAX_SOURCE_BYTES)throw Error('err.fileBig');
  const data=await file.text();
  if(token!==revision)return; // Another selection or user edit superseded this read.
  if(C.utf8Size(data)>C.MAX_SOURCE_BYTES)throw Error('err.decodedBig');
  by('source').value=data;
  message('msg.loaded');
 }catch(error){
  if(token===revision)message('msg.importRefused',()=>({msg:L.error(error)}),true);
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
  const done=result;message('msg.done',()=>({rows:t('msg.rows',{n:done.before}),dups:t('msg.dups',{n:done.removed})}));
 }catch(e){blank();message('msg.refused',()=>({msg:L.error(e)}),true);}
});
by('download').addEventListener('click',()=>{
 if(!result)return;
 try{
  const csv=C.stringify(result.rows,result.delimiter),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.download='csvclinic-clean.csv';a.href=url;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  message('msg.exported');
 }catch(e){message('msg.downloadRefused',()=>({msg:L.error(e)}),true);}
});
// Nouvelle langue : textes réaffichés ; source, réglages et résultat déjà calculé conservés.
L.onChange(()=>{
 if(result)draw(result);else blank();
 if(lastMessage)message(...lastMessage);
});
blank();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
