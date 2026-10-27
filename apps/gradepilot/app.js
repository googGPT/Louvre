/* GradePilot v2 : stockage transactionnel, scénarios et interface locale.
   Échelle française sur 20 (logique inchangée) ; textes dans messages.js, nombres via LouvreI18n. */
(()=>{'use strict';
const C=window.GradeCore,KEY='louvre-wave2-gradepilot-v1';
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t,MSG=window.LouvreMessages;
const by=id=>document.getElementById(id);
let state={version:1,grades:[]},editing=null,blocked=false,lastSay=null;
const fmt=n=>L.number(n,{minimumFractionDigits:2,maximumFractionDigits:2});
const on20=n=>t('score',{v:fmt(n)});
// Erreurs du moteur en clés (« err.number|{"field":"score"} ») : le code de champ est traduit aussi.
function errText(e){const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');let p;try{p=json?JSON.parse(json):undefined;}catch(_){p=undefined;}
 if(p&&p.field!==undefined&&MSG.fr['fld.'+p.field]!==undefined)p.field=t('fld.'+p.field);return L.error(Error(p?key+'|'+JSON.stringify(p):key));}
// Le dernier message est mémorisé comme fonction : il est retraduit si la langue change.
function say(message,error=false){lastSay=typeof message==='function'?{message,error}:null;const p=by('feedback');p.textContent=typeof message==='function'?message():message;p.className=error?'feedback error':'feedback success';}
function node(tag,cls,text){const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=String(text);return element;}
function commit(next,{recovery=false}={}){
 if(blocked&&!recovery){say(()=>t('msg.corrupt'),true);return false;}
 try{
  const clean=C.validateState(next);
  localStorage.setItem(KEY,JSON.stringify(clean));
  state=clean;
  if(recovery)blocked=false;
  by('warning').hidden=!blocked;
  return true;
 }catch(error){say(t('msg.saveFail',{msg:errText(error)}),true);return false;}
}
function download(name,contents,mime='application/json'){
 const url=URL.createObjectURL(new Blob([contents],{type:mime})),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function saveLabel(){by('save').textContent=t(editing?'btn.saveEdit':'btn.add');}
function resetForm(){editing=null;by('grade-form').reset();by('weight').value='1';saveLabel();by('cancel-edit').hidden=true;}
function forecast(){
 const target=Number(by('target').value),weight=Number(by('nextweight').value),preview=Number(by('whatif-score').value);
 const required=by('required'),message=by('feasibility'),range=by('forecast-range'),whatif=by('whatif-average');
 try{
  if(!by('target').value||!by('nextweight').value||!by('whatif-score').value)throw Error('err.missing');
  const r=C.requirement(state.grades,target,weight);
  const min=C.minimumScore(state.grades,target,weight);
  if(r.status==='already'){
   required.textContent=on20(0);message.textContent=t('goal.already');
  }else if(r.status==='impossible'){
   required.textContent=t('goal.over');message.textContent=t('goal.impossible');
  }else{
   required.textContent=on20(min);
   message.textContent=t('goal.possible',{target:on20(target)});
  }
  range.textContent=t('goal.range',{min:fmt(r.minAverage),max:fmt(r.maxAverage)});
  whatif.textContent=on20(C.projectedAverage(state.grades,preview,weight));
  by('target-mark').style.width=(Math.max(0,Math.min(20,target))*5)+'%';
 }catch(error){
  required.textContent='—';message.textContent=t('goal.invalid');
  range.textContent='';whatif.textContent='—';
 }
}
function render(){
 const list=by('grade-list'),average=C.weightedAverage(state.grades);
 by('count').textContent=t('count',{n:state.grades.length});
 by('average').textContent=average===null?'—':on20(average);
 by('average-caption').textContent=t(average===null?'avg.empty':'avg.caption');
 by('warning').hidden=!blocked;
 list.replaceChildren();
 const query=by('search').value.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('fr').trim();
 let count=0;
 for(const g of state.grades){
  if(query&&!g.label.normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('fr').includes(query))continue;
  count++;
  const row=node('article','grade-row'),body=node('div','grade-info');
  body.append(node('strong',null,g.label),node('small',null,t('row.weight',{v:fmt(g.coefficient)})));
  const score=node('span','grade-score',on20(g.score));
  const actions=node('div','row-actions');
  const edit=node('button',null,t('btn.edit')),del=node('button','danger',t('btn.delete'));
  for(const button of [edit,del])button.type='button';
  edit.disabled=del.disabled=blocked;
  edit.addEventListener('click',()=>{
   editing=g.id;by('label').value=g.label;by('grade').value=g.score;by('weight').value=g.coefficient;
   saveLabel();by('cancel-edit').hidden=false;
   by('label').focus();
  });
  del.addEventListener('click',()=>{
   if(!confirm(t('confirm.delete')))return;
   if(commit({version:1,grades:state.grades.filter(item=>item.id!==g.id)})){
    if(editing===g.id)resetForm();
    render();say(()=>t('msg.deleted'));
   }
  });
  actions.append(edit,del);row.append(body,score,actions);list.append(row);
 }
 by('list-status').textContent=t('list.status',{count,n:state.grades.length});
 if(!count)list.append(node('p','empty',t(state.grades.length?'list.noMatch':'list.empty')));
 by('save').disabled=blocked;by('reset').disabled=blocked;
 forecast();
}
by('grade-form').addEventListener('submit',event=>{
 event.preventDefault();
 if(blocked){say(()=>t('msg.corruptEdit'),true);return;}
 try{
  if(!by('grade').value||!by('weight').value)throw Error('err.required');
  const obj=C.grade({id:editing||'g_'+crypto.randomUUID(),label:by('label').value,
   score:Number(by('grade').value),coefficient:Number(by('weight').value)});
  const next=editing?state.grades.map(g=>g.id===editing?obj:g):[...state.grades,obj];
  if(commit({version:1,grades:next})){resetForm();render();say(()=>t('msg.saved'));}
 }catch(error){say(errText(error),true);}
});
by('cancel-edit').addEventListener('click',resetForm);
for(const id of ['target','nextweight','whatif-score'])by(id).addEventListener('input',forecast);
by('search').addEventListener('input',render);
by('export').addEventListener('click',()=>{
 if(blocked){say(()=>t('msg.exportBlocked'),true);return;}
 try{download('gradepilot-backup.json',JSON.stringify(C.validateState(state),null,2));say(()=>t('msg.exported'));}
 catch(error){say(errText(error),true);}
});
by('export-csv').addEventListener('click',()=>{
 try{download('gradepilot-notes.csv',C.toCSV(state.grades,['csv.label','csv.grade','csv.weight'].map(k=>t(k))),'text/csv;charset=utf-8');say(()=>t('msg.csv'));}
 catch(error){say(errText(error),true);}
});
by('export-raw').addEventListener('click',()=>{
 try{download('gradepilot-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');say(()=>t('msg.raw'));}
 catch(error){say(t('msg.rawFail',{msg:errText(error)}),true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async(event)=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>C.MAX_BYTES)throw Error('err.fileBig');
  const next=C.validateState(JSON.parse(await file.text()));
  if(!confirm(t('confirm.restore',{n:next.grades.length})))return;
  if(commit(next,{recovery:true})){resetForm();by('search').value='';render();say(()=>t('msg.restored'));}
 }catch(error){say(t('msg.importRefused',{msg:errText(error)}),true);}
});
by('reset').addEventListener('click',()=>{
 if(blocked){say(()=>t('msg.resetBlocked'),true);return;}
 if(!confirm(t('confirm.reset')))return;
 if(commit({version:1,grades:[]})){resetForm();render();say(()=>t('msg.reset'));}
});
window.addEventListener('storage',event=>{
 if(event.key!==KEY)return;
 try{state=event.newValue?C.validateState(JSON.parse(event.newValue)):{version:1,grades:[]};blocked=false;resetForm();render();say(()=>t('msg.synced'));}
 catch(error){blocked=true;render();say(()=>t('msg.externalBad'),true);}
});
try{const raw=localStorage.getItem(KEY);if(raw)state=C.validateState(JSON.parse(raw));}
catch(error){blocked=true;say(()=>t('msg.unreadable'),true);}
saveLabel();render();
// Nouvelle langue : textes régénérés ; les saisies (note, objectif, recherche) restent telles quelles.
L.onChange(()=>{saveLabel();render();if(lastSay)say(lastSay.message,lastSay.error);else say('');});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
