/* GoalLadder v2 : interface spécifique, stockage local validé et récupération sûre. */
'use strict';
(()=>{
 const L=AppLogic,KEY='louvre-factory:goalladder:v1';
 const $=id=>document.getElementById(id);
 const form=$('record-form'),status=$('status'),list=$('items');
 let records=[],editing=null,readOnly=false;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 function tell(message,error=false){status.textContent=message;status.className=error?'status error':'status';}
 function download(name,contents,type){
   const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');
   a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
 }
 function save(next,{recover=false}={}){
   if(readOnly&&!recover){tell('Stockage illisible : exportez la copie brute ou restaurez un JSON valide.',true);return false;}
   try{
     const text=L.backup(next);
     localStorage.setItem(KEY,text);
     records=L.validateBackup(JSON.parse(text));
     if(recover){readOnly=false;$('warning').hidden=true;}
     return true;
   }catch(err){
     tell('Enregistrement impossible : '+err.message,true);
     return false;
   }
 }
 function getFields(){
   const obj={id:editing||crypto.randomUUID().replaceAll('-','').slice(0,24)};
   for(const f of L.SPEC.fields)obj[f.key]=form.elements.namedItem(f.key).value;
   return L.normalizeRecord(obj);
 }
 function reset(){
   editing=null;form.reset();
   form.elements.namedItem('due').value=L.addDays(L.dayKey(),7);
   $('save-button').textContent='Ajouter cette étape';
   $('cancel-edit').hidden=true;
 }
 function edit(record){
   if(readOnly)return;
   editing=record.id;
   for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=record[f.key];
   $('save-button').textContent='Enregistrer les modifications';
   $('cancel-edit').hidden=false;
   form.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function changeStatus(record){
   if(readOnly)return;
   const changed={...record,done:record.done==='oui'?'non':'oui'};
   if(save(records.map(r=>r.id===record.id?changed:r))){
     if(editing===record.id)form.elements.namedItem('done').value=changed.done;
     render();tell(changed.done==='oui'?'Étape terminée.':'Étape réouverte.');
   }
 }
 function statusLabel(record){
   const kind=L.recordStatus(record),days=L.diffDays(record.due,L.dayKey());
   if(kind==='done')return ['Terminée','done'];
   if(kind==='overdue')return ['En retard de '+Math.abs(days)+' j','overdue'];
   if(kind==='soon')return [days===0?"Aujourd'hui":'Dans '+days+' j','soon'];
   return ['Dans '+days+' j','future'];
 }
 function renderProgress(goals){
   const container=$('goal-progress');container.replaceChildren();
   if(!goals.length){container.append(el('p','empty','Créez une première étape pour visualiser votre progression.'));return;}
   for(const g of goals){
     const card=el('article','goal-card'),top=el('div','goal-head'),h=el('h3',null,g.name);
     top.append(h,el('strong',null,g.progress+' %'));
     const bar=el('progress');bar.value=g.progress;bar.max=100;bar.setAttribute('aria-label','Progression de '+g.name);
     const details=el('p','goal-details',g.done+'/'+g.total+' étapes terminées · '+g.overdue+' en retard · '+g.soon+' à faire sous 7 jours');
     card.append(top,bar,details);
     if(g.nextDue)card.append(el('p','goal-due','Prochaine échéance ouverte : '+g.nextDue));
     container.append(card);
   }
 }
 function render(){
   const data=L.compute(records),summary=$('summary');summary.replaceChildren();
   for(const [name,value] of data.kpis){
     const s=el('div','stat');s.append(el('span','stat-label',name),el('strong','stat-value',value));summary.append(s);
   }
   renderProgress(data.goalStats);
   const shown=L.filterRecords(records,{query:$('search').value,status:$('filter-status').value,sort:$('sort').value});
   $('counter').textContent=shown.length+' / '+records.length+' étapes';
   list.replaceChildren();
   if(!shown.length){list.append(el('p','empty',records.length?'Aucune étape ne correspond à vos filtres.':'Aucune étape enregistrée. Commencez par définir votre objectif.'));return;}
   for(const record of shown){
     const card=el('article','item'),top=el('div','item-top'),title=el('div','item-title');
     title.append(el('p','item-goal',record.goal),el('h3',null,record.milestone));
     const [label,kind]=statusLabel(record),chip=el('span','chip chip-'+kind,label);
     top.append(title,chip);
     const info=el('p','item-meta','Échéance : '+record.due+' · Priorité : '+record.priority);
     const actions=el('div','item-actions');
     function button(label,cls,fn){
       const b=el('button',cls,label);b.type='button';b.disabled=readOnly;b.addEventListener('click',fn);actions.append(b);
     }
     button('Modifier','outline small',()=>edit(record));
     button('Supprimer','danger small',()=>{
       if(!confirm('Supprimer cette étape ?'))return;
       if(save(records.filter(r=>r.id!==record.id))){
         if(editing===record.id)reset();
         render();tell('Étape supprimée.');
       }
     });
     button(record.done==='oui'?'Rouvrir':'Marquer terminée','outline small',()=>changeStatus(record));
     card.append(top,info,actions);list.append(card);
   }
 }
 function initForm(){
   const container=$('fields');
   for(const f of L.SPEC.fields){
     const label=el('label','field'),caption=el('span',null,f.label);let input;
     if(f.type==='select'){
       input=el('select');
       for(const value of f.options){const opt=el('option',null,value);opt.value=value;input.append(opt);}
     }else{input=el('input');input.type=f.type;input.maxLength=160;}
     input.name=f.key;input.required=true;input.autocomplete='off';label.append(caption,input);container.append(label);
   }
   reset();
   form.addEventListener('submit',e=>{
     e.preventDefault();
     if(readOnly){tell('Stockage illisible. Restaurez une sauvegarde JSON valide avant toute modification.',true);return;}
     try{
       const record=getFields();
       const next=editing?records.map(r=>r.id===editing?record:r):[...records,record];
       if(next.length>L.MAX)throw Error('Limite de '+L.MAX+' étapes atteinte');
       if(save(next)){reset();render();tell('Étape enregistrée sur cet appareil.');}
     }catch(err){tell(err.message,true);}
   });
   $('cancel-edit').addEventListener('click',reset);
 }
 $('search').addEventListener('input',render);
 $('filter-status').addEventListener('change',render);
 $('sort').addEventListener('change',render);
 $('export').addEventListener('click',()=>{
   try{download('goalladder-sauvegarde.json',L.backup(records),'application/json');tell('Sauvegarde JSON téléchargée.');}
   catch(err){tell(err.message,true);}
 });
 $('export-csv').addEventListener('click',()=>{
   try{download('goalladder-etapes.csv',L.toCSV(records),'text/csv;charset=utf-8');tell('CSV exporté (JSON nécessaire pour restaurer).');}
   catch(err){tell(err.message,true);}
 });
 $('export-raw').addEventListener('click',()=>{
   try{download('goalladder-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');tell('Copie brute téléchargée : ne la partagez pas.');}
   catch(err){tell('Impossible de lire le stockage : '+err.message,true);}
 });
 $('import').addEventListener('change',async e=>{
   const file=e.target.files?.[0];e.target.value='';if(!file)return;
   try{
     if(file.size>L.STORAGE_LIMIT)throw Error('Fichier trop volumineux');
     const restored=L.validateBackup(JSON.parse(await file.text()));
     if(!confirm('Remplacer '+records.length+' étape(s) par '+restored.length+' étape(s) vérifiées ?'))return;
     if(save(restored,{recover:true})){
       reset();$('search').value='';$('filter-status').value='all';$('sort').value='due';
       render();tell('Historique restauré depuis le JSON.');
     }
   }catch(err){tell('Import refusé : '+err.message,true);}
 });
 try{
   const raw=localStorage.getItem(KEY);
   if(raw)records=L.validateBackup(JSON.parse(raw));
 }catch(err){
   readOnly=true;$('warning').hidden=false;
   tell('Stockage illisible : aucune donnée n’a été écrasée. Exportez la copie brute, puis restaurez un JSON valide.',true);
 }
 initForm();render();
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
