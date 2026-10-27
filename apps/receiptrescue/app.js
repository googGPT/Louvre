(() => {
  'use strict';
  const C = window.ReceiptCore;
  const L = window.LouvreI18n.init(window.LouvreMessages); // langue, devise, traductions
  const t = L.t;
  // Les catégories restent enregistrées en français (compatibilité des données) et sont traduites à l'affichage.
  const CAT_KEYS = { 'Électronique': 'electronics', 'Courses': 'groceries', 'Maison': 'home', 'Mode': 'fashion', 'Sport': 'sport', 'Autre': 'other' };
  const catName = c => t('cat.' + (CAT_KEYS[c] || 'other'));
  const day = iso => (C.dateMs(iso) === null ? '—' : L.date(iso, { day: 'numeric', month: 'short', year: 'numeric' }));
  const openIcon = () => (L.dir === 'rtl' ? '↖' : '↗'); // flèche « ouvrir » retournée de droite à gauche
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let db = null;
  let records = [];
  let editingId = null;
  let selectedFilter = 'all';
  let textQuery = '';
  let urls = [];
  let toastTimer;
  let storageFailed = false; // stockage local indisponible : écran d'avertissement
  let formError = null; // dernière erreur du formulaire, retraduite si la langue change
  let photoChosen = null; // fichier photo choisi dans le formulaire (pour le message d'aide)
  const today = () => C.todayLocal();
  function notice(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 5200);
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('err.storage'));
      const request = indexedDB.open('receiptrescue-local-v1', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('records')) database.createObjectStore('records', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('err.storage'));
      request.onblocked = () => reject(new Error('err.blocked'));
    });
  }
  function transaction(operation, mode = 'readonly') {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', mode);
      const store = tx.objectStore('records');
      let value;
      try { const request = operation(store); if (request) request.onsuccess = () => { value = request.result; }; }
      catch (error) { try { tx.abort(); } catch {} reject(error); return; }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('err.storage'));
      tx.onabort = () => reject(tx.error || new Error('err.aborted'));
    });
  }
  const all = () => transaction(store => store.getAll());
  const save = r => transaction(store => store.put(r), 'readwrite');
  const remove = id => transaction(store => store.delete(id), 'readwrite');
  const wipe = () => transaction(store => store.clear(), 'readwrite');
  function replaceAll(newRecords) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      store.clear();
      for (const r of newRecords) store.put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('err.storage'));
      tx.onabort = () => reject(tx.error || new Error('err.aborted'));
    });
  }
  async function refresh() {
    records = (await all()).map(C.cleanRecord).filter(Boolean);
    render();
  }
  function safeNode(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }
  function pill(text, kind = '') { return safeNode('span', 'pill ' + kind, text); }
  function card(record) {
    const st = C.status(record, today());
    const el = safeNode('article', 'purchase-card');
    const top = safeNode('div', 'card-top');
    if (record.photo instanceof Blob) {
      const img = safeNode('img', 'thumb');
      img.alt = t('card.photoAlt', { item: record.item });
      const url = URL.createObjectURL(record.photo);
      urls.push(url);
      img.src = url;
      top.append(img);
    } else top.append(safeNode('div', 'thumb', '▤'));
    const heading = safeNode('div', '');
    heading.append(safeNode('div','card-name',record.item), safeNode('div','card-store',record.merchant));
    top.append(heading);
    el.append(top, safeNode('div', 'card-amount', L.money(record.amountCents)), safeNode('div','card-meta',t('card.bought', { date: day(record.purchasedOn), category: catName(record.category) })));
    const pills = safeNode('div', 'pills');
    const when = n => (n === 0 ? t('days.today') : t('days.left', { n }));
    if (st.returnSoon) pills.append(pill('↺ ' + t('pill.return', { when: when(st.returnDays) }), 'warning'));
    else if (st.returnExpired) pills.append(pill(t('pill.returnExpired'),'expired'));
    else if (record.returnBy) pills.append(pill('↺ ' + t('pill.return', { when: day(record.returnBy) })));
    if (st.warrantySoon) pills.append(pill('✧ ' + t('pill.warranty', { when: when(st.warrantyDays) }), 'warning'));
    else if (st.warrantyExpired) pills.append(pill(t('pill.warrantyExpired'),'expired'));
    else if (record.warrantyUntil) pills.append(pill('✧ ' + t('pill.warranty', { when: day(record.warrantyUntil) })));
    if (!record.warrantyUntil && !record.returnBy) pills.append(pill(t('pill.noDates'),'expired'));
    el.append(pills);
    if (record.note) el.append(safeNode('p','card-meta',record.note.slice(0,150)));
    const actions = safeNode('div', 'card-actions');
    if (record.photo instanceof Blob) {
      const link = safeNode('a','mini-btn',`${openIcon()} ${t('card.view')}`);
      const url = URL.createObjectURL(record.photo); urls.push(url);
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label',t('card.viewAria', { item: record.item }));
      actions.append(link);
    }
    const edit = safeNode('button','mini-btn','✎ ' + t('card.edit')); edit.type = 'button'; edit.addEventListener('click', () => openForm(record));
    const deleteBtn = safeNode('button','mini-btn remove','× ' + t('card.delete')); deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(t('confirm.delete', { item: record.item }))) return;
      try { await remove(record.id); await refresh(); notice(t('toast.deleted')); }
      catch { notice(t('toast.deleteFail')); }
    });
    actions.append(edit, deleteBtn); el.append(actions);
    return el;
  }
  function renderInsights() {
    const upcoming = C.upcomingDeadlines(records, today(), 30, L.locale);
    const deadlineBox = $('#upcoming-list');
    deadlineBox.replaceChildren();
    if (!upcoming.length) deadlineBox.append(safeNode('p','insight-empty',t('up.empty')));
    for (const d of upcoming.slice(0, 8)) {
      const line = safeNode('div','deadline-row');
      const title = safeNode('strong','',`${d.kind === 'return' ? '↺ ' + t('kind.return') : '✧ ' + t('kind.warranty')} · ${d.item}`);
      const context = safeNode('small','',`${d.merchant} · ${day(d.due)}`);
      const desc = safeNode('div','deadline-description');desc.append(title,context);
      line.append(desc,safeNode('span',d.days <= 3 ? 'deadline-urgent' : 'deadline-date',d.days===0?t('days.todayCap'):t('days.left', { n: d.days })));
      deadlineBox.append(line);
    }
    if (upcoming.length > 8) deadlineBox.append(safeNode('p','insight-empty',t('up.more', { n: upcoming.length-8 })));
    const month = $('#analytics-month').value || today().slice(0,7);
    const list = C.categoryBreakdown(records, month);
    const total = list.reduce((n,r) => n+r.cents,0);
    const analyticsBox = $('#analytics-list');analyticsBox.replaceChildren();
    if (!list.length) analyticsBox.append(safeNode('p','insight-empty',t('an.empty')));
    else {
      for (const r of list) {
        const item = safeNode('div','category-row');
        const head=safeNode('div','category-line');
        head.append(safeNode('span','',catName(r.category)),safeNode('strong','',L.money(r.cents)));
        const track=safeNode('div','category-track');
        const fill=safeNode('div','category-fill');fill.style.width=`${Math.round(r.cents/total*100)}%`;
        track.append(fill);item.append(head,track);analyticsBox.append(item);
      }
      analyticsBox.append(safeNode('p','category-total',t('an.total', { total: L.money(total) })));
    }
  }
  function exportCalendar() {
    const result=C.calendarIcs(records,{
      summary:(kind,item)=>t('ics.summary',{kind:t('kind.'+kind),item}),
      description:merchant=>t('ics.description',{merchant})
    });
    if (!result.count) return notice(t('toast.icsNone'));
    const blob=new Blob([result.content],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download='receiptrescue-deadlines.ics';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    notice(t('toast.icsDone', { n: result.count }));
  }
  function render() {
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
    const sum = C.summarize(records, today());
    $('#total-count').textContent = sum.tracked;
    $('#returns-count').textContent = sum.returnSoon;
    $('#warranty-count').textContent = sum.warrantySoon;
    $('#total-badge').textContent = sum.tracked;
    renderInsights();
    const filtered = records.filter(r => {
      const s = C.status(r, today());
      if (selectedFilter === 'returns' && !s.returnSoon) return false;
      if (selectedFilter === 'warranty' && !s.warrantySoon) return false;
      return (r.item + ' ' + r.merchant + ' ' + r.category + ' ' + catName(r.category) + ' ' + r.note).toLocaleLowerCase(L.locale).includes(textQuery);
    }).sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn) || a.item.localeCompare(b.item, L.locale));
    const box = $('#cards');box.replaceChildren(...filtered.map(card));
    const empty = $('#empty-state'); empty.hidden = filtered.length > 0;
    if (!filtered.length) {
      $('#empty-title').textContent = records.length ? t('empty.noMatch') : t('empty.title');
      $('#empty-description').textContent = records.length ? t('empty.noMatchText') : t('empty.text');
      $('#empty-add').hidden = records.length > 0;
    }
  }
  // Textes du formulaire qui dépendent de son état (ajout ou modification, photo choisie, erreur).
  function formTexts() {
    const old = editingId ? records.find(r => r.id === editingId) : null;
    $('#purchase-title').textContent = editingId ? t('form.editTitle') : t('form.addTitle');
    $('#save-purchase').textContent = editingId ? t('form.editSave') : t('form.addSave');
    $('#form-error').textContent = formError ? L.error(formError) : '';
    $('#file-hint').textContent = photoChosen ? t('file.chosen', { name: photoChosen.name, size: L.number(photoChosen.size/1024/1024, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
      : old?.photo ? t('file.existing') : t('file.default');
    $('#cur-symbol').textContent = L.currencySymbol();
  }
  function openForm(record = null) {
    const form = $('#purchase-form'); form.reset();
    editingId = record?.id || null;
    formError = null; photoChosen = null;
    formTexts();
    form.elements.namedItem('item').value = record?.item || '';
    form.elements.merchant.value = record?.merchant || '';
    form.elements.amount.value = record ? (record.amountCents / 100).toFixed(2) : '';
    form.elements.category.value = record?.category || 'Électronique';
    form.elements.purchasedOn.value = record?.purchasedOn || today();
    form.elements.returnBy.value = record?.returnBy || '';
    form.elements.warrantyUntil.value = record?.warrantyUntil || '';
    form.elements.note.value = record?.note || '';
    $('#purchase-dialog').showModal();
    form.elements.namedItem('item').focus();
  }
  async function submitForm(e) {
    e.preventDefault();
    const form = e.currentTarget, fields = form.elements;
    formError = null; $('#form-error').textContent = '';
    const btn = $('#save-purchase');btn.disabled = true;
    try {
      const old = editingId ? records.find(r => r.id === editingId) : null;
      const upload = fields.photo.files[0];
      if (upload && (!C.VALID_MIMES.includes(upload.type) || upload.size > C.MAX_PHOTO_BYTES || upload.size === 0)) throw new Error('err.photo');
      const amountCents = C.eurosToCents(fields.amount.value);
      if (amountCents === null) throw new Error('err.amount');
      const draft = {
        id: old?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        item: fields.namedItem('item').value, merchant: fields.merchant.value, amountCents,
        purchasedOn: fields.purchasedOn.value, returnBy: fields.returnBy.value,
        warrantyUntil: fields.warrantyUntil.value, category: fields.category.value, note: fields.note.value,
        photo: upload || old?.photo || null, photoName: upload?.name || old?.photoName || ''
      };
      const clean = C.cleanRecord(draft);
      if (!clean) throw new Error('err.fields');
      if (records.length >= C.MAX_RECORDS && !old) throw new Error(`err.limit|${JSON.stringify({ max: C.MAX_RECORDS })}`);
      await save(clean);
      $('#purchase-dialog').close();
      await refresh();notice(old ? t('toast.edited') : t('toast.added'));
    } catch (err) { formError = err?.message ? err : new Error('err.save'); $('#form-error').textContent = L.error(formError); }
    finally { btn.disabled = false; }
  }
  function blobToDataURL(blob) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('err.photoRead'));
      reader.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(s) {
    if (!s) return null;
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
    if (!match) throw new Error('err.photoFormat');
    const binary = atob(match[2]);
    if (binary.length > C.MAX_PHOTO_BYTES || binary.length < 1) throw new Error('err.photoBig');
    const bytes = new Uint8Array(binary.length);
    for (let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  }
  async function exportBackup() {
    try {
      const items = await all();
      const exported = [];
      for (const r of items) {
        const {photo,...rest}=r;
        exported.push({ ...rest, photoData: photo instanceof Blob ? await blobToDataURL(photo) : null });
      }
      const text = JSON.stringify({version:1,records:exported},null,2);
      if (new Blob([text]).size > C.MAX_BACKUP_BYTES) throw new Error('err.backupBig');
      const file = new Blob([text],{type:'application/json'});
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');a.href=url;a.download=`receiptrescue-backup-${today()}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      notice(t('toast.backupDone'));
    } catch (error) { notice(error?.message ? L.error(error) : t('err.export')); }
  }
  async function importBackup(file) {
    if (!file || file.size > C.MAX_BACKUP_BYTES || file.size < 10) return notice(t('err.fileBig'));
    try {
      const parsed = JSON.parse(await file.text());
      const list = C.validateBackup(parsed);
      if (!list) throw new Error('err.backup');
      const restored = [];
      for (const r of list) {
        const {photoData, ...rest} = r;
        const photo = dataURLToBlob(photoData);
        const clean = C.cleanRecord({ ...rest, photo });
        if (!clean) throw new Error('err.record');
        restored.push(clean);
      }
      if (!confirm(t('confirm.restore', { a: records.length, b: restored.length }))) return;
      await replaceAll(restored);
      await refresh();
      $('#backup-dialog').close();
      notice(t('toast.restored', { n: restored.length }));
    } catch (err) { notice(t('toast.restoreFail', { msg: err instanceof SyntaxError ? t('err.backup') : (err?.message ? L.error(err) : t('err.backup')) })); }
  }
  function openDialog(id) { $(id).showModal(); }
  function bind() {
    for(const id of ['#add-top','#add-hero','#add-list','#empty-add']) $(id).addEventListener('click',()=>openForm());
    for(const id of ['#nav-backup']) $(id).addEventListener('click',()=>openDialog('#backup-dialog'));
    $('#help-btn').addEventListener('click',()=>openDialog('#help-dialog'));
    $('#export-inline').addEventListener('click',()=>openDialog('#backup-dialog'));
    $('#export-backup').addEventListener('click',exportBackup);
    $('#export-calendar').addEventListener('click',exportCalendar);
    $('#analytics-month').addEventListener('change',renderInsights);
    $('#retry-storage').addEventListener('click',()=>initStorage());
    $('#import-trigger').addEventListener('click',()=>$('#import-file').click());
    $('#import-file').addEventListener('change',async e=>{const file=e.currentTarget.files[0];e.currentTarget.value='';if(file)await importBackup(file)});
    $('#clear-all').addEventListener('click',async()=>{
      if (!confirm(t('confirm.clear1'))) return;
      if (!confirm(t('confirm.clear2'))) return;
      try{await wipe();await refresh();$('#backup-dialog').close();notice(t('toast.cleared'))}catch{notice(t('toast.clearFail'))}
    });
    $('#purchase-form').addEventListener('submit',submitForm);
    $('#photo-input').addEventListener('change',e=>{photoChosen=e.target.files[0]||null;formTexts()});
    $$('.close,[data-close]').forEach(button=>button.addEventListener('click',()=>$('#'+button.dataset.close).close()));
    $('#search-input').addEventListener('input',e=>{textQuery=e.target.value.toLocaleLowerCase(L.locale).trim();render()});
    $$('.filter').forEach(button=>button.addEventListener('click',()=>{
      selectedFilter=button.dataset.filter;
      $$('.filter').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
      render();
    }));
    for(const dialog of $$('dialog')) dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
    window.addEventListener('pagehide',()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[]});
  }
  async function initStorage() {
    try {
      db=await openDatabase();storageFailed=false;await refresh();
      $('#storage-warning').hidden=true;
      for(const id of ['#add-top','#add-hero','#add-list','#export-inline','#nav-backup']) $(id).disabled=false;
    }
    catch {
      storageFailed=true;
      $('#storage-warning').hidden=false;
      renderStorageFailed();
      for(const id of ['#add-top','#add-hero','#add-list','#export-inline','#nav-backup']) $(id).disabled=true;
      notice(t('toast.storageBlocked'));
    }
  }
  function renderStorageFailed() {
    $('#cards').replaceChildren();
    const box=$('#empty-state');box.hidden=false;
    $('#empty-title').textContent=t('empty.storageTitle');
    $('#empty-description').textContent=t('empty.storageText');
    $('#empty-add').hidden=true;
  }
  function init() {
    bind();
    $('#analytics-month').value=today().slice(0,7);
    // Nouvelle langue ou devise : tout est réaffiché, sans toucher au formulaire en cours de saisie.
    L.onChange(()=>{ if (storageFailed) { renderInsights(); renderStorageFailed(); } else render(); formTexts(); });
    formTexts();
    initStorage();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{ /* Le site reste utilisable en ligne. */ });
    }
  }
  init();
})();