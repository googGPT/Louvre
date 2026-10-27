/* GoalLadder v2 : interface spécifique, stockage local validé et récupération sûre. Textes et formats : LouvreI18n. */
'use strict';
(()=>{
 const L=AppLogic,KEY='louvre-factory:goalladder:v1';
 const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue et traductions (pas d'argent : menu langue seul)
 // Valeurs enregistrées en français (compatibilité des sauvegardes) -> clés de traduction pour l'affichage.
 const VALUE_KEYS={done:{non:'opt.no',oui:'opt.yes'},priority:{haute:'prio.high',normale:'prio.normal',basse:'prio.low'}};
 const valueName=(key,v)=>t(VALUE_KEYS[key][v]);
 const $=id=>document.getElementById(id);
 const form=$('record-form'),status=$('status'),list=$('items');
 let records=[],editing=null,readOnly=false,lastStatus=null;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 const day=d=>I.date(d,{day:'numeric',month:'short',year:'numeric'});
 // msg : fonction qui produit le texte, appelée à nouveau après un changement de langue.
 function tell(msg,error=false){lastStatus={msg,error};status.textContent=msg();status.className=error?'status error':'status';}
 const errText=e=>e instanceof SyntaxError?t('err.backup'):I.error(e);
 function download(name,contents,type){
   const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');
   a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
 }
 function save(next,{recover=false}={}){
   if(readOnly&&!recover){tell(()=>t('storage.readonly'),true);return false;}
   try{
     const text=L.backup(next);
     localStorage.setItem(KEY,text);
     records=L.validateBackup(JSON.parse(text));
     if(recover){readOnly=false;$('warning').hidden=true;}
     return true;
   }catch(err){
     tell(()=>t('storage.fail',{msg:I.error(err)}),true);
     return false;
   }
 }
 function getFields(){
   const obj={id:editing||crypto.randomUUID().replaceAll('-','').slice(0,24)};
   for(const f of L.SPEC.fields)obj[f.key]=form.elements.namedItem(f.key).value;
   return L.normalizeRecord(obj);
 }
 function saveLabel(){$('save-button').textContent=editing?t('btn.saveEdit'):t('btn.add');}
 function reset(){
   editing=null;form.reset();
   form.elements.namedItem('due').value=L.addDays(L.dayKey(),7);
   saveLabel();
   $('cancel-edit').hidden=true;
 }
 function edit(record){
   if(readOnly)return;
   editing=record.id;
   for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=record[f.key];
   saveLabel();
   $('cancel-edit').hidden=false;
   form.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function changeStatus(record){
   if(readOnly)return;
   const changed={...record,done:record.done==='oui'?'non':'oui'};
   if(save(records.map(r=>r.id===record.id?changed:r))){
     if(editing===record.id)form.elements.namedItem('done').value=changed.done;
     render();tell(changed.done==='oui'?()=>t('status.done'):()=>t('status.reopened'));
   }
 }
 function statusLabel(record){
   const kind=L.recordStatus(record),days=L.diffDays(record.due,L.dayKey());
   if(kind==='done')return [t('chip.done'),'done'];
   if(kind==='overdue')return [t('chip.overdue',{n:Math.abs(days)}),'overdue'];
   if(kind==='soon')return [days===0?t('chip.today'):t('chip.in',{n:days}),'soon'];
   return [t('chip.in',{n:days}),'future'];
 }
 function renderProgress(goals){
   const container=$('goal-progress');container.replaceChildren();
   if(!goals.length){container.append(el('p','empty',t('progress.empty')));return;}
   for(const g of goals){
     const card=el('article','goal-card'),top=el('div','goal-head'),h=el('h3',null,g.name);
     top.append(h,el('strong',null,I.number(g.progress/100,{style:'percent'})));
     const bar=el('progress');bar.value=g.progress;bar.max=100;bar.setAttribute('aria-label',t('aria.progress',{name:g.name}));
     const details=el('p','goal-details',t('goal.details',{done:I.number(g.done),total:I.number(g.total)})+' · '+t('goal.overdue',{n:g.overdue})+' · '+t('goal.soon',{n:g.soon}));
     card.append(top,bar,details);
     if(g.nextDue)card.append(el('p','goal-due',t('goal.next',{date:day(g.nextDue)})));
     container.append(card);
   }
 }
 function render(){
   const data=L.compute(records,L.dayKey(),I.locale),summary=$('summary');summary.replaceChildren();
   for(const [name,value] of data.kpis){
     const s=el('div','stat');s.append(el('span','stat-label',t(name)),el('strong','stat-value',value));summary.append(s);
   }
   renderProgress(data.goalStats);
   const shown=L.filterRecords(records,{query:$('search').value,status:$('filter-status').value,sort:$('sort').value,describe:r=>valueName('priority',r.priority)});
   $('counter').textContent=t('counter',{shown:I.number(shown.length),n:records.length});
   list.replaceChildren();
   saveLabel();
   if(!shown.length){list.append(el('p','empty',records.length?t('items.noMatch'):t('items.empty')));return;}
   for(const record of shown){
     const card=el('article','item'),top=el('div','item-top'),title=el('div','item-title');
     title.append(el('p','item-goal',record.goal),el('h3',null,record.milestone));
     const [label,kind]=statusLabel(record),chip=el('span','chip chip-'+kind,label);
     top.append(title,chip);
     const info=el('p','item-meta',t('item.meta',{date:day(record.due),priority:valueName('priority',record.priority)}));
     const actions=el('div','item-actions');
     function button(label,cls,fn){
       const b=el('button',cls,label);b.type='button';b.disabled=readOnly;b.addEventListener('click',fn);actions.append(b);
     }
     button(t('btn.edit'),'outline small',()=>edit(record));
     button(t('btn.delete'),'danger small',()=>{
       if(!confirm(t('confirm.delete')))return;
       if(save(records.filter(r=>r.id!==record.id))){
         if(editing===record.id)reset();
         render();tell(()=>t('status.deleted'));
       }
     });
     button(record.done==='oui'?t('btn.reopen'):t('btn.markDone'),'outline small',()=>changeStatus(record));
     card.append(top,info,actions);list.append(card);
   }
 }
 function initForm(){
   const container=$('fields');
   for(const f of L.SPEC.fields){
     // data-i18n : libellés et options retraduits automatiquement quand la langue change.
     const label=el('label','field'),caption=el('span',null,t(f.label));caption.dataset.i18n=f.label;let input;
     if(f.type==='select'){
       input=el('select');
       for(const value of f.options){const opt=el('option',null,valueName(f.key,value));opt.value=value;opt.dataset.i18n=VALUE_KEYS[f.key][value];input.append(opt);}
     }else{input=el('input');input.type=f.type;input.maxLength=160;}
     input.name=f.key;input.required=true;input.autocomplete='off';label.append(caption,input);container.append(label);
   }
   reset();
   form.addEventListener('submit',e=>{
     e.preventDefault();
     if(readOnly){tell(()=>t('storage.readonlyForm'),true);return;}
     try{
       const record=getFields();
       const next=editing?records.map(r=>r.id===editing?record:r):[...records,record];
       if(next.length>L.MAX)throw Error('err.limit|'+JSON.stringify({max:L.MAX}));
       if(save(next)){reset();render();tell(()=>t('status.saved'));}
     }catch(err){tell(()=>I.error(err),true);}
   });
   $('cancel-edit').addEventListener('click',reset);
 }
 $('search').addEventListener('input',render);
 $('filter-status').addEventListener('change',render);
 $('sort').addEventListener('change',render);
 $('export').addEventListener('click',()=>{
   try{download('goalladder-backup.json',L.backup(records),'application/json');tell(()=>t('status.backup'));}
   catch(err){tell(()=>I.error(err),true);}
 });
 $('export-csv').addEventListener('click',()=>{
   try{
     const header=['f.goal','f.milestone','f.due','csv.done','f.priority'].map(k=>t(k));
     download('goalladder-milestones.csv',L.toCSV(records,{header,value:valueName}),'text/csv;charset=utf-8');tell(()=>t('status.csv'));
   }catch(err){tell(()=>I.error(err),true);}
 });
 $('export-raw').addEventListener('click',()=>{
   try{download('goalladder-raw-storage.txt',localStorage.getItem(KEY)||'','text/plain');tell(()=>t('status.raw'));}
   catch(err){tell(()=>t('status.rawFail',{msg:I.error(err)}),true);}
 });
 $('import').addEventListener('change',async e=>{
   const file=e.target.files?.[0];e.target.value='';if(!file)return;
   try{
     if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');
     const restored=L.validateBackup(JSON.parse(await file.text()));
     if(!confirm(t('confirm.restore',{a:records.length,b:restored.length})))return;
     if(save(restored,{recover:true})){
       reset();$('search').value='';$('filter-status').value='all';$('sort').value='due';
       render();tell(()=>t('status.restored'));
     }
   }catch(err){tell(()=>t('status.importRefused',{msg:errText(err)}),true);}
 });
 try{
   const raw=localStorage.getItem(KEY);
   if(raw)records=L.validateBackup(JSON.parse(raw));
 }catch(err){
   readOnly=true;$('warning').hidden=false;
   tell(()=>t('storage.unreadable'),true);
 }
 initForm();render();
 // Nouvelle langue : réaffichage complet ; les champs du formulaire gardent leur saisie.
 I.onChange(()=>{render();if(lastStatus)tell(lastStatus.msg,lastStatus.error);});
 if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
