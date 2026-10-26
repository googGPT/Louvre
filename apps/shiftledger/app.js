/* ShiftLedger v2 — affichage local, sauvegardes transactionnelles, éditions et alertes. */
(()=>{'use strict';
const C=window.ShiftCore,by=id=>document.getElementById(id),KEY='louvre-wave2-shiftledger-v1';
const DEFAULT={version:1,shifts:[],params:{rate:15,threshold:8,multiplier:1.25}};
let state=DEFAULT,blocked=false,editing=null;
const hours=m=>Math.floor(m/60)+' h '+String(m%60).padStart(2,'0');
const euro=c=>(c/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
function feedback(message,error=false){const e=by('message');e.textContent=message;e.className=error?'message error':'message success';}
function setParameters(){for(const k of ['rate','threshold','multiplier'])by(k).value=state.params[k];}
function commit(next,{restore=false}={}){
 if(blocked&&!restore){feedback('Stockage endommagé : exportez la copie brute ou restaurez un JSON valide.',true);return false;}
 try{
  const normalized=C.backup(next);
  localStorage.setItem(KEY,JSON.stringify(normalized));
  state=normalized;
  if(restore)blocked=false;
  return true;
 }catch(error){feedback('Enregistrement impossible : '+error.message+'. Les données en mémoire sont inchangées.',true);return false;}
}
function resetForm(){
 editing=null;by('form').reset();by('date').value=C.todayKey();
 by('start').value='09:00';by('end').value='17:30';by('break').value='30';
 by('add').textContent='Enregistrer le service';by('cancel-edit').hidden=true;
}
function editShift(s){
 if(blocked)return;
 editing=s.id;
 for(const k of ['date','start','end','label'])by(k).value=s[k];
 by('break').value=s.breakMinutes;
 by('add').textContent='Mettre à jour le service';by('cancel-edit').hidden=false;
 by('form').scrollIntoView({behavior:'smooth',block:'start'});
}
function render(){
 const calc=C.compute(state.shifts,state.params);
 by('hours').textContent=hours(calc.total);
 by('shifts-count').textContent=state.shifts.length+' service(s)';
 by('pay').textContent=euro(calc.grossCents);
 by('normal').textContent=hours(calc.normal);
 by('overtime').textContent=hours(calc.overtime);
 by('break-total').textContent=hours(calc.breakMinutes);
 by('overnight-total').textContent=String(calc.overnightCount);
 by('warning').hidden=!blocked;
 by('add').disabled=blocked;
 by('cancel-edit').disabled=blocked;
 for(const k of ['rate','threshold','multiplier'])by(k).disabled=blocked;
 const days=by('day-list');days.replaceChildren();
 for(const d of calc.days){
  const row=node('div','day-entry');
  row.append(node('strong',null,d.date),node('span',null,hours(d.total)+' net · '+hours(d.overtime)+' majorées'));
  days.append(row);
 }
 if(!calc.days.length)days.append(node('p','empty','Aucun jour de travail à afficher.'));
 const warnings=C.overlapWarnings(state.shifts);
 const alert=by('overlap-warning');
 alert.hidden=warnings.length===0;
 if(warnings.length)alert.textContent=warnings.length+' chevauchement(s) potentiel(s) entre services : vérifiez les horaires pour éviter un double comptage.';
 const query=by('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
 const month=by('month-filter').value;
 const visible=state.shifts.filter(s=>(!month||s.date.startsWith(month))&&
  (!query||(s.label+' '+s.date+' '+s.start+' '+s.end).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').includes(query)));
 by('visible-count').textContent=visible.length+' / '+state.shifts.length+' service(s)';
 const list=by('list');list.replaceChildren();
 if(!visible.length)list.append(node('p','empty',state.shifts.length?'Aucun service ne correspond aux filtres.':'Aucun service enregistré.'));
 for(const s of visible.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.start.localeCompare(a.start))){
  const item=C.shift(s),row=node('article','entry'),main=node('div','entry-main'),title=node('strong',null,s.label||'Service sans étiquette');
  const meta=node('span',null,s.date+' · '+s.start+' → '+s.end+(item.overnight?' (lendemain)':'')+' · pause '+s.breakMinutes+' min');
  main.append(title,meta);
  const aside=node('aside');aside.append(node('b',null,hours(item.minutes)));
  const edit=node('button','outline','Modifier'),del=node('button','danger','Supprimer');
  edit.type=del.type='button';edit.disabled=del.disabled=blocked;
  edit.addEventListener('click',()=>editShift(s));
  del.addEventListener('click',()=>{
   if(!confirm('Supprimer ce service ?'))return;
   const next={...state,shifts:state.shifts.filter(x=>x.id!==s.id)};
   if(commit(next)){
    if(editing===s.id)resetForm();
    render();feedback('Service supprimé.');
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
 if(blocked){feedback('Restaurez une sauvegarde valide avant toute modification.',true);return;}
 try{
  if(by('break').value==='')throw Error('Pause requise');
  const raw={id:editing||'s_'+crypto.randomUUID(),date:by('date').value,
   start:by('start').value,end:by('end').value,breakMinutes:Number(by('break').value),label:by('label').value};
  const {minutes,grossMinutes,overnight,...s}=C.shift(raw);
  const next={...state,shifts:editing?state.shifts.map(v=>v.id===editing?s:v):[...state.shifts,s]};
  if(commit(next)){const wasEditing=Boolean(editing);resetForm();render();feedback(wasEditing?'Service modifié.':'Service enregistré.');}
 }catch(error){feedback(error.message,true);}
});
by('cancel-edit').addEventListener('click',resetForm);
for(const k of ['rate','threshold','multiplier']){
 by(k).addEventListener('change',()=>{
  try{
   if(blocked)throw Error('Stockage endommagé');
   if(['rate','threshold','multiplier'].some(x=>by(x).value===''))throw Error('Paramètres incomplets');
   const next={...state,params:C.params({
    rate:Number(by('rate').value),threshold:Number(by('threshold').value),multiplier:Number(by('multiplier').value)})};
   if(commit(next)){render();feedback('Paramètres enregistrés et résultats recalculés.');}
   else setParameters();
  }catch(error){setParameters();feedback(error.message,true);}
 });
}
for(const id of ['search','month-filter'])by(id).addEventListener('input',render);
by('clear-filters').addEventListener('click',()=>{by('search').value='';by('month-filter').value='';render();});
by('export').addEventListener('click',()=>{
 if(blocked){feedback('Stockage illisible : utilisez la copie brute plutôt qu’un faux JSON vide.',true);return;}
 try{download('shiftledger-sauvegarde.json','application/json',JSON.stringify(C.backup(state),null,2));feedback('Sauvegarde JSON exportée.');}
 catch(error){feedback(error.message,true);}
});
by('csv').addEventListener('click',()=>{
 try{download('shiftledger-services.csv','text/csv;charset=utf-8',C.csv(state.shifts));feedback('CSV exporté. Seul le JSON permet de restaurer.');}
 catch(error){feedback(error.message,true);}
});
by('export-raw').addEventListener('click',()=>{
 try{download('shiftledger-stockage-brut.txt','text/plain',localStorage.getItem(KEY)||'');feedback('Copie brute exportée, à conserver en privé.');}
 catch(error){feedback('Lecture du stockage impossible : '+error.message,true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async event=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>C.MAX_BYTES)throw Error('Fichier trop volumineux');
  const restored=C.backup(JSON.parse(await file.text()));
  if(!confirm('Remplacer les '+state.shifts.length+' services par '+restored.shifts.length+' services validés ?'))return;
  if(commit(restored,{restore:true})){
   resetForm();setParameters();by('search').value='';by('month-filter').value='';
   render();feedback('Sauvegarde restaurée.');
  }
 }catch(error){feedback('Import refusé : '+error.message,true);}
});
window.addEventListener('storage',event=>{
 if(event.key!==KEY)return;
 try{state=event.newValue?C.backup(JSON.parse(event.newValue)):DEFAULT;blocked=false;resetForm();setParameters();render();feedback('Historique actualisé depuis un autre onglet.');}
 catch(error){blocked=true;render();feedback('Données modifiées et invalides depuis un autre onglet : export brut ou restauration requis.',true);}
});
try{const saved=localStorage.getItem(KEY);if(saved)state=C.backup(JSON.parse(saved));}
catch(error){blocked=true;feedback('Sauvegarde illisible : aucune donnée ne sera écrasée. Exportez sa copie brute.',true);}
resetForm();setParameters();render();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
