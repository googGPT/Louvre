/* SnapAction offline-first UI and IndexedDB adapter; no telemetry, no remote API. */
(() => {
  'use strict';
  const core=window.SnapCore;
  const L=window.LouvreI18n.init(window.LouvreMessages); // langue de l'interface (pas d'argent ici)
  const t=L.t;
  const $=id=>document.getElementById(id);
  const DB_NAME='snapaction-local-v1';
  const DB_STORE='tasks';
  let db=null,tasks=[],view='inbox',selectedImage=null,editingId=null,installEvent=null,imageState='none';
  const seenNotifications=new Set();
  const el={form:$('new-task-form'),title:$('quick-text'),due:$('due-local'),priority:$('priority'),repeat:$('repeat'),file:$('image-file'),list:$('task-list'),preview:$('parse-preview')};
  // Date et heure dans la langue choisie (L.date ne couvre que les jours civils, d'où toLocaleString).
  function formatDate(iso){return iso?new Date(iso).toLocaleString(L.locale,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):t('task.noDue');}
  function localInput(iso){if(!iso)return '';const d=new Date(iso);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+'T'+[String(d.getHours()).padStart(2,'0'),String(d.getMinutes()).padStart(2,'0')].join(':');}
  function fromLocal(s){if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString():null;}
  const t2=(k,p)=>L.t(k,p); // la boucle d'affichage nomme « t » chaque tâche
  function renderStatic(){const d=new Date();$('today-label').textContent=L.date([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
  function renderImageLabel(){$('image-label').textContent=t({none:'image.none',ready:'image.ready',rejected:'image.rejected'}[imageState]);}
  function toast(msg){const target=$('toast');target.textContent=msg;target.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>target.hidden=true,4500);}
  function storageError(message=t('storage.unavailable')){$('storage-warning').hidden=false;toast(message);}
  function openDb(){return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('err.storage'));return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(DB_STORE))d.createObjectStore(DB_STORE,{keyPath:'id'});};
    req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>reject(req.error||new Error('err.storage'));
    req.onblocked=()=>reject(new Error('err.otherTab'));
  });}
  function allRecords(){return new Promise((resolve,reject)=>{
    if(!db){reject(new Error('err.storage'));return;}
    const tx=db.transaction(DB_STORE,'readonly'),req=tx.objectStore(DB_STORE).getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);
  });}
  function writeRecords(items, removeIds=[], clear=false){return new Promise((resolve,reject)=>{
    if(!db){reject(new Error('err.storage'));return;}
    const tx=db.transaction(DB_STORE,'readwrite'),store=tx.objectStore(DB_STORE);
    if(clear)store.clear();
    for(const id of removeIds)store.delete(id);
    for(const task of items)store.put(task);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('err.write'));
    tx.onabort=()=>reject(tx.error||new Error('err.write'));
  });}
  async function refresh(){try{const list=await allRecords();const valid=list.filter(core.validTask);if(valid.length!==list.length)storageError(t('storage.someUnreadable'));tasks=valid;render();}catch(e){storageError();}}
  async function change(items,removed=[],clear=false){try{await writeRecords(items,removed,clear);await refresh();return true;}catch(e){storageError(t('storage.writeFail'));return false;}}
  function render(){
    const s=core.statistics(tasks);$('metric-open').textContent=s.open;$('metric-today').textContent=s.today;$('metric-late').textContent=s.overdue;$('metric-done').textContent=s.completed;
    $('count-inbox').textContent=s.open;$('count-today').textContent=s.today+s.overdue-tasks.filter(t=>!t.completedAt&&t.dueAt&&new Date(t.dueAt).toDateString()===new Date().toDateString()&&Date.parse(t.dueAt)<Date.now()).length;
    $('list-heading').textContent=t('view.'+view);
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const filtered=core.filterTasks(tasks,view,$('search').value);
    el.list.replaceChildren();
    if(!filtered.length){const box=document.createElement('div');box.className='empty';const icon=document.createElement('div');icon.className='empty-icon';icon.textContent=view==='done'?'✓':'✧';const heading=document.createElement('strong');heading.textContent=t(view==='done'?'empty.doneTitle':'empty.title');const p=document.createElement('p');p.textContent=t(view==='done'?'empty.doneText':'empty.text');box.append(icon,heading,p);el.list.append(box);return;}
    for(const t of filtered){
      const row=document.createElement('article');row.className='task-row'+(t.completedAt?' done':'');row.dataset.id=t.id;
      const check=document.createElement('button');check.className='check-task'+(t.completedAt?' checked':'');check.type='button';check.dataset.action='toggle';check.title=t2(t.completedAt?'task.reopen':'task.complete');check.setAttribute('aria-label',check.title);check.textContent='✓';
      const body=document.createElement('div');body.className='task-body';const title=document.createElement('h3');title.textContent=t.title;
      const meta=document.createElement('div');meta.className='task-meta';const date=document.createElement('span');date.textContent=formatDate(t.dueAt);meta.append(date);
      if(t.dueAt&&!t.completedAt&&Date.parse(t.dueAt)<Date.now()){const tag=document.createElement('span');tag.className='pill late';tag.textContent=t2('task.late');meta.append(tag);}
      if(t.priority==='high'){const tag=document.createElement('span');tag.className='pill important';tag.textContent=t2('task.priority');meta.append(tag);}
      if(t.repeat!=='none'){const tag=document.createElement('span');tag.className='pill';tag.textContent=t2('task.rep.'+t.repeat);meta.append(tag);}
      if(t.image){const tag=document.createElement('span');tag.className='pill';tag.textContent=t2('task.image');meta.append(tag);}
      body.append(title,meta);
      const buttons=document.createElement('div');buttons.className='task-buttons';
      for(const item of [{action:'edit',text:'✎',name:t2('task.edit')},{action:'image',text:'▧',name:t2('task.showImage'),show:!!t.image},{action:'snooze',text:'↷',name:t2('task.snooze'),show:!t.completedAt&&!!t.dueAt}]){if(item.show===false)continue;const btn=document.createElement('button');btn.type='button';btn.className='icon-button';btn.textContent=item.text;btn.title=item.name;btn.setAttribute('aria-label',item.name);btn.dataset.action=item.action;buttons.append(btn);}
      row.append(check,body,buttons);el.list.append(row);
    }
  }
  function preview(){
    const val=el.title.value.trim();const parsed=core.parseCommand(val);
    if(parsed.dueAt && !el.due.dataset.manual){el.due.value=localInput(parsed.dueAt);el.due.dataset.auto='1';}
    if(!parsed.dueAt && el.due.dataset.auto==='1'&&!el.due.dataset.manual){el.due.value='';delete el.due.dataset.auto;}
    el.preview.textContent=parsed.dueAt ? t(parsed.inferred?'preview.dateInferred':'preview.date',{date:formatDate(parsed.dueAt)}) : t('preview.tip');
  }
  async function compressImage(file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4*1024*1024)throw new Error('err.imageType');
    const bitmap=await createImageBitmap(file);const max=1000,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
    const result=c.toDataURL('image/jpeg',.7);
    if(result.length>1600000)throw new Error('err.imageBig');
    return result;
  }
  async function addTask(e){e.preventDefault();if(!db){storageError();return;}
    const button=$('create-button');button.disabled=true;
    try{
      const now=new Date();const dueAt=fromLocal(el.due.value);if(el.due.value&&!dueAt)throw new Error('err.date');
      if(el.repeat.value!=='none'&&!dueAt)throw new Error('err.repeatNeedsDue');
      const task=core.createTask({title:el.title.value,dueAt,priority:el.priority.value,repeat:el.repeat.value,image:selectedImage},now,crypto.randomUUID());
      if(await change([task])){
        el.form.reset();selectedImage=null;imageState='none';renderImageLabel();delete el.due.dataset.manual;delete el.due.dataset.auto;preview();view='inbox';render();toast(t('toast.created'));
      }
    }catch(err){toast(err&&err.message?L.error(err):t('err.create'));}finally{button.disabled=false;}
  }
  async function rowClick(e){const btn=e.target.closest('button[data-action]');if(!btn)return;
    const row=btn.closest('.task-row'),t=tasks.find(x=>x.id===row?.dataset.id);if(!t)return;
    const now=new Date();
    if(btn.dataset.action==='toggle'){
      try{const done=!t.completedAt;const updated=core.changeStatus(t,done,now);const changes=[updated];
        if(done&&t.repeat!=='none'&&t.dueAt){let next=core.nextDue(t.dueAt,t.repeat);let count=0;while(next&&Date.parse(next)<=now.getTime()&&count++<400)next=core.nextDue(next,t.repeat);
          if(next&&Date.parse(next)>now.getTime())changes.push(core.createTask({title:t.title,note:t.note,priority:t.priority,repeat:t.repeat,dueAt:next,image:t.image},now,crypto.randomUUID()));
        }
        if(await change(changes))toast(t2(done?'toast.done':'toast.reopened'));
      }catch(err){toast(L.error(err));}
    }
    if(btn.dataset.action==='edit')openEdit(t);
    if(btn.dataset.action==='image'&&t.image){$('full-image').src=t.image;$('image-dialog').showModal();}
    if(btn.dataset.action==='snooze'&&t.dueAt){const d=new Date(Math.max(now.getTime(),Date.parse(t.dueAt)));d.setDate(d.getDate()+1);const later={...t,dueAt:d.toISOString(),updatedAt:now.toISOString()};if(await change([later]))toast(t2('toast.snoozed'));}
  }
  function openEdit(t){editingId=t.id;$('edit-title-input').value=t.title;$('edit-note').value=t.note;$('edit-date').value=localInput(t.dueAt);$('edit-priority').value=t.priority;$('edit-repeat').value=t.repeat;$('edit-dialog').showModal();}
  async function saveEdit(e){e.preventDefault();const t=tasks.find(x=>x.id===editingId);if(!t)return;
    try{const now=new Date();const due=fromLocal($('edit-date').value);if($('edit-repeat').value!=='none'&&!due)throw new Error('err.repeatNeedsDue');
      const updated={...t,title:$('edit-title-input').value.trim(),note:$('edit-note').value.trim(),dueAt:due,priority:$('edit-priority').value,repeat:$('edit-repeat').value,updatedAt:now.toISOString()};
      if(!core.validTask(updated))throw new Error('err.check');
      if(await change([updated])){$('edit-dialog').close();toast(t2('toast.updated'));}
    }catch(err){toast(err&&err.message?L.error(err):t2('err.edit'));}
  }
  function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function exportJson(){try{if(!db)throw new Error('err.storage');const content=JSON.stringify(core.backup(await allRecords()),null,2);download(t('file.backup',{date:new Date().toISOString().slice(0,10)}),content,'application/json');toast(t('toast.exported'));}catch(e){toast(t('toast.exportFail',{msg:L.error(e)}));}}
  async function importJson(file){if(!file)return;if(file.size>9*1024*1024){toast(t('err.backupBig'));return;}
    try{const payload=JSON.parse(await file.text());const incoming=core.validateBackup(payload);
      if(!db)throw new Error('err.storage');
      if(!window.confirm(t('confirm.restore',{n:incoming.length})))return;
      if(await change(incoming,[],true)){view='inbox';render();toast(t('toast.restored',{n:incoming.length}));}
    }catch(e){toast(t('toast.importFail',{msg:e instanceof SyntaxError?t('err.json'):L.error(e)}));}
  }
  async function requestNotifications(){
    if(!('Notification' in window)){toast(t('notify.unsupported'));return;}
    try{const permission=await Notification.requestPermission();toast(t(permission==='granted'?'notify.granted':'notify.denied'));}
    catch(e){toast(t('notify.fail'));}
  }
  function checkReminders(){
    if(document.visibilityState==='hidden'||!('Notification' in window)||Notification.permission!=='granted')return;
    const now=Date.now();for(const t of tasks){if(t.completedAt||!t.dueAt||seenNotifications.has(t.id))continue;
      const ms=Date.parse(t.dueAt);if(ms<=now && ms>now-86400000){try{new Notification(t('notify.title'),{body:t.title,tag:'snapaction-'+t.id,icon:'./icon.svg'});seenNotifications.add(t.id);}catch(e){/* optional browser feature */}}
    }
  }
  async function initialize(){
    renderStatic();renderImageLabel();
    try{db=await openDb();$('storage-warning').hidden=true;await refresh();}catch(e){storageError(t('storage.blocked'));}
    preview();
    setInterval(()=>{if(!db)return;render();checkReminders();},60000);
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  el.title.addEventListener('input',preview);
  el.due.addEventListener('input',()=>{el.due.dataset.manual='1';delete el.due.dataset.auto;});
  el.form.addEventListener('submit',addTask);
  el.file.addEventListener('change',async()=>{
    try{if(el.file.files.length){selectedImage=await compressImage(el.file.files[0]);imageState='ready';}else{selectedImage=null;imageState='none';}renderImageLabel();}
    catch(e){selectedImage=null;el.file.value='';imageState='rejected';renderImageLabel();toast(L.error(e));}
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();document.querySelector('.task-panel').scrollIntoView({block:'start',behavior:'smooth'});}));
  $('search').addEventListener('input',render);el.list.addEventListener('click',rowClick);
  $('edit-form').addEventListener('submit',saveEdit);
  $('close-edit').addEventListener('click',()=>$('edit-dialog').close());
  $('close-image').addEventListener('click',()=>$('image-dialog').close());
  $('delete-action').addEventListener('click',async()=>{if(!editingId)return;const t=tasks.find(x=>x.id===editingId);if(t&&window.confirm(L.t('confirm.delete',{title:t.title}))){if(await change([],[editingId])){$('edit-dialog').close();toast(L.t('toast.deleted'));}}});
  $('export-json').addEventListener('click',exportJson);
  $('export-calendar').addEventListener('click',()=>{download(t('file.ics'),core.exportIcs(tasks),'text/calendar;charset=utf-8');toast(t('toast.ics'));});
  $('import-trigger').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async()=>{await importJson($('import-file').files[0]);$('import-file').value='';});
  $('retry-storage').addEventListener('click',async()=>{try{if(db)db.close();db=await openDb();$('storage-warning').hidden=true;await refresh();toast(t('toast.storageBack'));}catch(e){storageError();}});
  $('notice-btn').addEventListener('click',requestNotifications);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('install-btn').hidden=false;});
  $('install-btn').addEventListener('click',async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$('install-btn').hidden=true;});
  document.addEventListener('visibilitychange',checkReminders);
  // Changement de langue : on retraduit l'écran sans toucher à la saisie en cours ni aux données.
  L.onChange(()=>{renderStatic();renderImageLabel();preview();render();});
  initialize();
})();