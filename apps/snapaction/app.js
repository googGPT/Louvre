/* SnapAction offline-first UI and IndexedDB adapter; no telemetry, no remote API. */
(() => {
  'use strict';
  const core=window.SnapCore;
  const $=id=>document.getElementById(id);
  const DB_NAME='snapaction-local-v1';
  const DB_STORE='tasks';
  let db=null,tasks=[],view='inbox',selectedImage=null,editingId=null,installEvent=null;
  const seenNotifications=new Set();
  const FR_DATE=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const el={form:$('new-task-form'),title:$('quick-text'),due:$('due-local'),priority:$('priority'),repeat:$('repeat'),file:$('image-file'),list:$('task-list'),preview:$('parse-preview')};
  function formatDate(iso){return iso?FR_DATE.format(new Date(iso)):'Sans échéance';}
  function localInput(iso){if(!iso)return '';const d=new Date(iso);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+'T'+[String(d.getHours()).padStart(2,'0'),String(d.getMinutes()).padStart(2,'0')].join(':');}
  function fromLocal(s){if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString():null;}
  function toast(msg){const target=$('toast');target.textContent=msg;target.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>target.hidden=true,4500);}
  function storageError(message='Le stockage local est momentanément indisponible.'){$('storage-warning').hidden=false;toast(message);}
  function openDb(){return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB absent'));return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(DB_STORE))d.createObjectStore(DB_STORE,{keyPath:'id'});};
    req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>reject(req.error||new Error('IndexedDB inaccessible'));
    req.onblocked=()=>reject(new Error('Stockage bloqué par un autre onglet'));
  });}
  function allRecords(){return new Promise((resolve,reject)=>{
    if(!db){reject(new Error('Stockage non initialisé'));return;}
    const tx=db.transaction(DB_STORE,'readonly'),req=tx.objectStore(DB_STORE).getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);
  });}
  function writeRecords(items, removeIds=[], clear=false){return new Promise((resolve,reject)=>{
    if(!db){reject(new Error('Stockage non initialisé'));return;}
    const tx=db.transaction(DB_STORE,'readwrite'),store=tx.objectStore(DB_STORE);
    if(clear)store.clear();
    for(const id of removeIds)store.delete(id);
    for(const task of items)store.put(task);
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Écriture impossible'));
    tx.onabort=()=>reject(tx.error||new Error('Transaction annulée'));
  });}
  async function refresh(){try{const list=await allRecords();const valid=list.filter(core.validTask);if(valid.length!==list.length)storageError('Certaines actions stockées sont illisibles. Elles sont préservées mais non affichées.');tasks=valid;render();}catch(e){storageError();}}
  async function change(items,removed=[],clear=false){try{await writeRecords(items,removed,clear);await refresh();return true;}catch(e){storageError('Écriture impossible. Exportez votre sauvegarde avant tout nettoyage.');return false;}}
  const titles={inbox:'Toutes les actions',today:"Aujourd'hui & retards",upcoming:'Prochainement',done:'Terminées'};
  function render(){
    const s=core.statistics(tasks);$('metric-open').textContent=s.open;$('metric-today').textContent=s.today;$('metric-late').textContent=s.overdue;$('metric-done').textContent=s.completed;
    $('count-inbox').textContent=s.open;$('count-today').textContent=s.today+s.overdue-tasks.filter(t=>!t.completedAt&&t.dueAt&&new Date(t.dueAt).toDateString()===new Date().toDateString()&&Date.parse(t.dueAt)<Date.now()).length;
    $('list-heading').textContent=titles[view];
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    const filtered=core.filterTasks(tasks,view,$('search').value);
    el.list.replaceChildren();
    if(!filtered.length){const box=document.createElement('div');box.className='empty';const icon=document.createElement('div');icon.className='empty-icon';icon.textContent=view==='done'?'✓':'✧';const heading=document.createElement('strong');heading.textContent=view==='done'?'Aucune action terminée':'Votre espace est prêt';const p=document.createElement('p');p.textContent=view==='done'?'Chaque petite tâche accomplie compte.':'Créez votre première action juste au-dessus.';box.append(icon,heading,p);el.list.append(box);return;}
    for(const t of filtered){
      const row=document.createElement('article');row.className='task-row'+(t.completedAt?' done':'');row.dataset.id=t.id;
      const check=document.createElement('button');check.className='check-task'+(t.completedAt?' checked':'');check.type='button';check.dataset.action='toggle';check.title=t.completedAt?'Remettre en cours':'Marquer comme terminée';check.setAttribute('aria-label',check.title);check.textContent='✓';
      const body=document.createElement('div');body.className='task-body';const title=document.createElement('h3');title.textContent=t.title;
      const meta=document.createElement('div');meta.className='task-meta';const date=document.createElement('span');date.textContent=formatDate(t.dueAt);meta.append(date);
      if(t.dueAt&&!t.completedAt&&Date.parse(t.dueAt)<Date.now()){const tag=document.createElement('span');tag.className='pill late';tag.textContent='En retard';meta.append(tag);}
      if(t.priority==='high'){const tag=document.createElement('span');tag.className='pill important';tag.textContent='Prioritaire';meta.append(tag);}
      if(t.repeat!=='none'){const tag=document.createElement('span');tag.className='pill';tag.textContent={daily:'Chaque jour',weekly:'Chaque semaine',monthly:'Chaque mois'}[t.repeat];meta.append(tag);}
      if(t.image){const tag=document.createElement('span');tag.className='pill';tag.textContent='▧ Capture';meta.append(tag);}
      body.append(title,meta);
      const buttons=document.createElement('div');buttons.className='task-buttons';
      for(const item of [{action:'edit',text:'✎',name:'Modifier'},{action:'image',text:'▧',name:'Afficher la capture',show:!!t.image},{action:'snooze',text:'↷',name:'Reporter d’un jour',show:!t.completedAt&&!!t.dueAt}]){if(item.show===false)continue;const btn=document.createElement('button');btn.type='button';btn.className='icon-button';btn.textContent=item.text;btn.title=item.name;btn.setAttribute('aria-label',item.name);btn.dataset.action=item.action;buttons.append(btn);}
      row.append(check,body,buttons);el.list.append(row);
    }
  }
  function preview(){
    const val=el.title.value.trim();const parsed=core.parseCommand(val);
    if(parsed.dueAt && !el.due.dataset.manual){el.due.value=localInput(parsed.dueAt);el.due.dataset.auto='1';}
    if(!parsed.dueAt && el.due.dataset.auto==='1'&&!el.due.dataset.manual){el.due.value='';delete el.due.dataset.auto;}
    el.preview.textContent=parsed.dueAt ? '✧ Date suggérée : '+formatDate(parsed.dueAt)+(parsed.inferred?' (heure proposée à vérifier)':'')+' · Modifiable avant enregistrement.' : '✧ Astuce : « demain 14h », « lundi 9h », « dans 2 heures » ou « 28/10 à 16h ». Sans date, la tâche reste dans votre liste.';
  }
  async function compressImage(file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4*1024*1024)throw new Error('Image PNG/JPEG/WebP, 4 Mo maximum.');
    const bitmap=await createImageBitmap(file);const max=1000,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
    const result=c.toDataURL('image/jpeg',.7);
    if(result.length>1600000)throw new Error('Image trop volumineuse après compression.');
    return result;
  }
  async function addTask(e){e.preventDefault();if(!db){storageError();return;}
    const button=$('create-button');button.disabled=true;
    try{
      const now=new Date();const dueAt=fromLocal(el.due.value);if(el.due.value&&!dueAt)throw new Error('Date invalide.');
      if(el.repeat.value!=='none'&&!dueAt)throw new Error('Choisissez une échéance pour répéter une tâche.');
      const task=core.createTask({title:el.title.value,dueAt,priority:el.priority.value,repeat:el.repeat.value,image:selectedImage},now,crypto.randomUUID());
      if(await change([task])){
        el.form.reset();selectedImage=null;$('image-label').textContent='Facultatif · photo ou capture';delete el.due.dataset.manual;delete el.due.dataset.auto;preview();view='inbox';render();toast('Action enregistrée sur cet appareil.');
      }
    }catch(err){toast(err.message||'Impossible de créer cette action.');}finally{button.disabled=false;}
  }
  async function rowClick(e){const btn=e.target.closest('button[data-action]');if(!btn)return;
    const row=btn.closest('.task-row'),t=tasks.find(x=>x.id===row?.dataset.id);if(!t)return;
    const now=new Date();
    if(btn.dataset.action==='toggle'){
      try{const done=!t.completedAt;const updated=core.changeStatus(t,done,now);const changes=[updated];
        if(done&&t.repeat!=='none'&&t.dueAt){let next=core.nextDue(t.dueAt,t.repeat);let count=0;while(next&&Date.parse(next)<=now.getTime()&&count++<400)next=core.nextDue(next,t.repeat);
          if(next&&Date.parse(next)>now.getTime())changes.push(core.createTask({title:t.title,note:t.note,priority:t.priority,repeat:t.repeat,dueAt:next,image:t.image},now,crypto.randomUUID()));
        }
        if(await change(changes))toast(done?'Bien joué, action terminée !':'Action remise en cours.');
      }catch(err){toast(err.message);}
    }
    if(btn.dataset.action==='edit')openEdit(t);
    if(btn.dataset.action==='image'&&t.image){$('full-image').src=t.image;$('image-dialog').showModal();}
    if(btn.dataset.action==='snooze'&&t.dueAt){const d=new Date(Math.max(now.getTime(),Date.parse(t.dueAt)));d.setDate(d.getDate()+1);const later={...t,dueAt:d.toISOString(),updatedAt:now.toISOString()};if(await change([later]))toast('Action reportée d’un jour.');}
  }
  function openEdit(t){editingId=t.id;$('edit-title-input').value=t.title;$('edit-note').value=t.note;$('edit-date').value=localInput(t.dueAt);$('edit-priority').value=t.priority;$('edit-repeat').value=t.repeat;$('edit-dialog').showModal();}
  async function saveEdit(e){e.preventDefault();const t=tasks.find(x=>x.id===editingId);if(!t)return;
    try{const now=new Date();const due=fromLocal($('edit-date').value);if($('edit-repeat').value!=='none'&&!due)throw new Error('Choisissez une échéance pour la répétition.');
      const updated={...t,title:$('edit-title-input').value.trim(),note:$('edit-note').value.trim(),dueAt:due,priority:$('edit-priority').value,repeat:$('edit-repeat').value,updatedAt:now.toISOString()};
      if(!core.validTask(updated))throw new Error('Vérifiez les informations saisies.');
      if(await change([updated])){$('edit-dialog').close();toast('Action mise à jour.');}
    }catch(err){toast(err.message||'Impossible de modifier.');}
  }
  function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function exportJson(){try{if(!db)throw new Error('Stockage inaccessible.');const content=JSON.stringify(core.backup(await allRecords()),null,2);download('snapaction-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json',content,'application/json');toast('Sauvegarde téléchargée. Conservez-la en lieu sûr.');}catch(e){toast('Sauvegarde impossible : '+e.message);}}
  async function importJson(file){if(!file)return;if(file.size>9*1024*1024){toast('Sauvegarde trop volumineuse (9 Mo maximum).');return;}
    try{const payload=JSON.parse(await file.text());const incoming=core.validateBackup(payload);
      if(!db)throw new Error('Le stockage du navigateur est inaccessible.');
      if(!window.confirm('Restaurer '+incoming.length+' actions ? Cette opération remplace les actions actuelles. Sauvegardez-les d’abord.'))return;
      if(await change(incoming,[],true)){view='inbox';render();toast(incoming.length+' actions restaurées.');}
    }catch(e){toast('Fichier refusé : '+e.message);}
  }
  async function requestNotifications(){
    if(!('Notification' in window)){toast('Notifications non prises en charge ici. Utilisez l’export calendrier.');return;}
    try{const permission=await Notification.requestPermission();toast(permission==='granted'?'Alertes activées tant que l’application est ouverte.':'Notifications non autorisées. Export calendrier disponible.');}
    catch(e){toast('Impossible de demander cette autorisation.');}
  }
  function checkReminders(){
    if(document.visibilityState==='hidden'||!('Notification' in window)||Notification.permission!=='granted')return;
    const now=Date.now();for(const t of tasks){if(t.completedAt||!t.dueAt||seenNotifications.has(t.id))continue;
      const ms=Date.parse(t.dueAt);if(ms<=now && ms>now-86400000){try{new Notification('SnapAction — rappel',{body:t.title,tag:'snapaction-'+t.id,icon:'./icon.svg'});seenNotifications.add(t.id);}catch(e){/* optional browser feature */}}
    }
  }
  async function initialize(){
    $('today-label').textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
    try{db=await openDb();$('storage-warning').hidden=true;await refresh();}catch(e){storageError('Le stockage local est bloqué : les tâches ne peuvent pas être conservées.');}
    preview();
    setInterval(()=>{if(!db)return;render();checkReminders();},60000);
    if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  el.title.addEventListener('input',preview);
  el.due.addEventListener('input',()=>{el.due.dataset.manual='1';delete el.due.dataset.auto;});
  el.form.addEventListener('submit',addTask);
  el.file.addEventListener('change',async()=>{
    try{if(el.file.files.length){selectedImage=await compressImage(el.file.files[0]);$('image-label').textContent='Capture prête (compressée localement)';}else selectedImage=null;}
    catch(e){selectedImage=null;el.file.value='';$('image-label').textContent='Image non retenue';toast(e.message);}
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;render();document.querySelector('.task-panel').scrollIntoView({block:'start',behavior:'smooth'});}));
  $('search').addEventListener('input',render);el.list.addEventListener('click',rowClick);
  $('edit-form').addEventListener('submit',saveEdit);
  $('close-edit').addEventListener('click',()=>$('edit-dialog').close());
  $('close-image').addEventListener('click',()=>$('image-dialog').close());
  $('delete-action').addEventListener('click',async()=>{if(!editingId)return;const t=tasks.find(x=>x.id===editingId);if(t&&window.confirm('Supprimer définitivement « '+t.title+' » ?')){if(await change([],[editingId])){$('edit-dialog').close();toast('Action supprimée.');}}});
  $('export-json').addEventListener('click',exportJson);
  $('export-calendar').addEventListener('click',()=>{download('snapaction-echeances.ics',core.exportIcs(tasks),'text/calendar;charset=utf-8');toast('Calendrier exporté. Importez-le dans votre agenda pour des rappels fiables.');});
  $('import-trigger').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async()=>{await importJson($('import-file').files[0]);$('import-file').value='';});
  $('retry-storage').addEventListener('click',async()=>{try{if(db)db.close();db=await openDb();$('storage-warning').hidden=true;await refresh();toast('Stockage à nouveau accessible.');}catch(e){storageError();}});
  $('notice-btn').addEventListener('click',requestNotifications);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('install-btn').hidden=false;});
  $('install-btn').addEventListener('click',async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice;installEvent=null;$('install-btn').hidden=true;});
  document.addEventListener('visibilitychange',checkReminders);
  initialize();
})();