/* ShiftLedger v2 — affichage local, sauvegardes transactionnelles, éditions et alertes. Textes et formats : LouvreI18n (messages.js). */
(()=>{'use strict';
const C=window.ShiftCore,by=id=>document.getElementById(id),KEY='louvre-wave2-shiftledger-v1';
const DEFAULT={version:1,shifts:[],params:{rate:15,threshold:8,multiplier:1.25}};
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue, devise, traductions
let state=DEFAULT,blocked=false,editing=null,lastFeedback=null;
const hours=m=>t('fmt.hm',{h:L.number(Math.floor(m/60)),m:String(m%60).padStart(2,'0')});
const money=c=>L.money(c); // devise choisie (taux saisi par l'utilisateur : aucune règle légale en euros)
const day=d=>L.date(d,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
// Erreur du cœur (« err.number|{"field":"rate",...} ») traduite, nom du champ compris.
function errText(err){
 if(err instanceof SyntaxError)return t('err.json');
 const msg=err&&err.message?err.message:String(err),[key,json]=msg.split('|');
 let params;try{params=json?JSON.parse(json):undefined;}catch(e){params=undefined;}
 if(params&&params.field)params={...params,field:t('field.'+params.field)};
 return L.error(params?key+'|'+JSON.stringify(params):key);
}
// Message d'état : clé + paramètres, retraduit si la langue change ; msgErr = erreur à traduire.
function feedback(key,params={},error=false){lastFeedback={key,params,error};showFeedback();}
function showFeedback(){
 const e=by('message');if(!lastFeedback){e.textContent='';return;}
 const {key,params,error}=lastFeedback,p={...params};
 if(p.msgErr){p.msg=errText(p.msgErr);delete p.msgErr;}
 e.textContent=key==='err'?p.msg:t(key,p);e.className=error?'message error':'message success';
}
const fail=err=>feedback('err',{msgErr:err},true);
function setParameters(){for(const k of ['rate','threshold','multiplier'])by(k).value=state.params[k];}
function commit(next,{restore=false}={}){
 if(blocked&&!restore){feedback('status.blockedCommit',{},true);return false;}
 try{
  const normalized=C.backup(next);
  localStorage.setItem(KEY,JSON.stringify(normalized));
  state=normalized;
  if(restore)blocked=false;
  return true;
 }catch(error){feedback('status.saveFail',{msgErr:error},true);return false;}
}
function resetForm(){
 editing=null;by('form').reset();by('date').value=C.todayKey();
 by('start').value='09:00';by('end').value='17:30';by('break').value='30';
 by('cancel-edit').hidden=true;saveLabel();
}
function editShift(s){
 if(blocked)return;
 editing=s.id;
 for(const k of ['date','start','end','label'])by(k).value=s[k];
 by('break').value=s.breakMinutes;
 by('cancel-edit').hidden=false;saveLabel();
 by('form').scrollIntoView({behavior:'smooth',block:'start'});
}
function saveLabel(){by('add').textContent=t(editing?'btn.update':'btn.save');}
function render(){
 const calc=C.compute(state.shifts,state.params);
 by('cur-symbol').textContent=L.currencySymbol();
 by('hours').textContent=hours(calc.total);
 by('shifts-count').textContent=state.shifts.length?t('count.n',{n:state.shifts.length}):t('count.none');
 by('pay').textContent=money(calc.grossCents);
 by('normal').textContent=hours(calc.normal);
 by('overtime').textContent=hours(calc.overtime);
 by('break-total').textContent=hours(calc.breakMinutes);
 by('overnight-total').textContent=L.number(calc.overnightCount);
 by('warning').hidden=!blocked;
 by('add').disabled=blocked;
 by('cancel-edit').disabled=blocked;
 for(const k of ['rate','threshold','multiplier'])by(k).disabled=blocked;
 const days=by('day-list');days.replaceChildren();
 for(const d of calc.days){
  const row=node('div','day-entry');
  row.append(node('strong',null,day(d.date)),node('span',null,t('day.row',{total:hours(d.total),overtime:hours(d.overtime)})));
  days.append(row);
 }
 if(!calc.days.length)days.append(node('p','empty',t('days.empty')));
 const warnings=C.overlapWarnings(state.shifts);
 const alert=by('overlap-warning');
 alert.hidden=warnings.length===0;
 if(warnings.length)alert.textContent=t('overlap',{n:warnings.length});
 const fold=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(L.locale);
 const query=fold(by('search').value).trim();
 const month=by('month-filter').value;
 const visible=state.shifts.filter(s=>(!month||s.date.startsWith(month))&&
  (!query||fold(s.label+' '+s.date+' '+day(s.date)+' '+s.start+' '+s.end).includes(query)));
 by('visible-count').textContent=t('visible',{shown:L.number(visible.length),n:state.shifts.length});
 const list=by('list');list.replaceChildren();
 if(!visible.length)list.append(node('p','empty',t(state.shifts.length?'empty.filtered':'empty.none')));
 for(const s of visible.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.start.localeCompare(a.start))){
  const item=C.shift(s),row=node('article','entry'),main=node('div','entry-main'),title=node('strong',null,s.label||t('entry.noLabel'));
  const meta=node('span',null,t(item.overnight?'entry.metaNext':'entry.meta',{date:day(s.date),start:s.start,end:s.end,break:L.number(s.breakMinutes)}));
  main.append(title,meta);
  const aside=node('aside');aside.append(node('b',null,hours(item.minutes)));
  const edit=node('button','outline',t('btn.edit')),del=node('button','danger',t('btn.delete'));
  edit.type=del.type='button';edit.disabled=del.disabled=blocked;
  edit.addEventListener('click',()=>editShift(s));
  del.addEventListener('click',()=>{
   if(!confirm(t('confirm.delete')))return;
   const next={...state,shifts:state.shifts.filter(x=>x.id!==s.id)};
   if(commit(next)){
    if(editing===s.id)resetForm();
    render();feedback('status.deleted');
   }
  });
  aside.append(edit,del);row.append(main,aside);list.append(row);
 }
}
function download(name,type,contents){
 const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
by('form').addEventListener('submit',event=>{
 event.preventDefault();
 if(blocked){feedback('status.blockedSubmit',{},true);return;}
 try{
  if(by('break').value==='')throw Error('err.breakRequired');
  const raw={id:editing||'s_'+crypto.randomUUID(),date:by('date').value,
   start:by('start').value,end:by('end').value,breakMinutes:Number(by('break').value),label:by('label').value};
  const {minutes,grossMinutes,overnight,...s}=C.shift(raw);
  const next={...state,shifts:editing?state.shifts.map(v=>v.id===editing?s:v):[...state.shifts,s]};
  if(commit(next)){const wasEditing=Boolean(editing);resetForm();render();feedback(wasEditing?'status.updated':'status.saved');}
 }catch(error){fail(error);}
});
by('cancel-edit').addEventListener('click',resetForm);
for(const k of ['rate','threshold','multiplier']){
 by(k).addEventListener('change',()=>{
  try{
   if(blocked)throw Error('err.damaged');
   if(['rate','threshold','multiplier'].some(x=>by(x).value===''))throw Error('err.paramsIncomplete');
   const next={...state,params:C.params({
    rate:Number(by('rate').value),threshold:Number(by('threshold').value),multiplier:Number(by('multiplier').value)})};
   if(commit(next)){render();feedback('status.params');}
   else setParameters();
  }catch(error){setParameters();fail(error);}
 });
}
for(const id of ['search','month-filter'])by(id).addEventListener('input',render);
by('clear-filters').addEventListener('click',()=>{by('search').value='';by('month-filter').value='';render();});
by('export').addEventListener('click',()=>{
 if(blocked){feedback('status.exportBlocked',{},true);return;}
 try{download('shiftledger-sauvegarde.json','application/json',JSON.stringify(C.backup(state),null,2));feedback('status.exported');}
 catch(error){fail(error);}
});
by('csv').addEventListener('click',()=>{
 try{
  const header=['csv.date','csv.start','csv.end','csv.break','csv.net','csv.label'].map(k=>t(k));
  download('shiftledger-services.csv','text/csv;charset=utf-8',C.csv(state.shifts,header));feedback('status.csv');
 }catch(error){fail(error);}
});
by('export-raw').addEventListener('click',()=>{
 try{download('shiftledger-stockage-brut.txt','text/plain',localStorage.getItem(KEY)||'');feedback('status.raw');}
 catch(error){feedback('status.rawFail',{msgErr:error},true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async event=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>C.MAX_BYTES)throw Error('err.fileBig');
  const restored=C.backup(JSON.parse(await file.text()));
  if(!confirm(t('confirm.import',{a:L.number(state.shifts.length),b:L.number(restored.shifts.length)})))return;
  if(commit(restored,{restore:true})){
   resetForm();setParameters();by('search').value='';by('month-filter').value='';
   render();feedback('status.restored');
  }
 }catch(error){feedback('status.importRefused',{msgErr:error},true);}
});
window.addEventListener('storage',event=>{
 if(event.key!==KEY)return;
 try{state=event.newValue?C.backup(JSON.parse(event.newValue)):DEFAULT;blocked=false;resetForm();setParameters();render();feedback('status.otherTab');}
 catch(error){blocked=true;render();feedback('status.otherTabBad',{},true);}
});
try{const saved=localStorage.getItem(KEY);if(saved)state=C.backup(JSON.parse(saved));}
catch(error){blocked=true;feedback('status.corrupt',{},true);}
resetForm();setParameters();render();
// Changement de langue ou de devise : réaffichage sans toucher à la saisie en cours ni aux données.
L.onChange(()=>{saveLabel();render();showFeedback();});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
