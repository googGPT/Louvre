(() => {
  'use strict';
  const C = window.ReceiptCore;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  let db = null;
  let records = [];
  let editingId = null;
  let selectedFilter = 'all';
  let textQuery = '';
  let urls = [];
  let toastTimer;
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
      if (!window.indexedDB) return reject(new Error('IndexedDB indisponible'));
      const request = indexedDB.open('receiptrescue-local-v1', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('records')) database.createObjectStore('records', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Stockage inaccessible'));
      request.onblocked = () => reject(new Error('La base est bloquée par un autre onglet'));
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
      tx.onerror = () => reject(tx.error || new Error('Échec du stockage'));
      tx.onabort = () => reject(tx.error || new Error('Opération annulée'));
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
      tx.onerror = () => reject(tx.error || new Error('Échec de la restauration'));
      tx.onabort = () => reject(tx.error || new Error('Restauration annulée'));
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
      img.alt = 'Ticket enregistré pour ' + record.item;
      const url = URL.createObjectURL(record.photo);
      urls.push(url);
      img.src = url;
      top.append(img);
    } else top.append(safeNode('div', 'thumb', '▤'));
    const heading = safeNode('div', '');
    heading.append(safeNode('div','card-name',record.item), safeNode('div','card-store',record.merchant));
    top.append(heading);
    el.append(top, safeNode('div', 'card-amount', C.formatMoney(record.amountCents)), safeNode('div','card-meta',`Acheté le ${C.dateLabel(record.purchasedOn)} · ${record.category}`));
    const pills = safeNode('div', 'pills');
    if (st.returnSoon) pills.append(pill(st.returnDays === 0 ? '↺ Retour : aujourd’hui' : `↺ Retour : J-${st.returnDays}`, 'warning'));
    else if (st.returnExpired) pills.append(pill('Retour indiqué : expiré','expired'));
    else if (record.returnBy) pills.append(pill('↺ Retour : ' + C.dateLabel(record.returnBy)));
    if (st.warrantySoon) pills.append(pill(st.warrantyDays === 0 ? '✧ Garantie : aujourd’hui' : `✧ Garantie : J-${st.warrantyDays}`, 'warning'));
    else if (st.warrantyExpired) pills.append(pill('Garantie indiquée : expirée','expired'));
    else if (record.warrantyUntil) pills.append(pill('✧ Garantie : ' + C.dateLabel(record.warrantyUntil)));
    if (!record.warrantyUntil && !record.returnBy) pills.append(pill('Dates non renseignées','expired'));
    el.append(pills);
    if (record.note) el.append(safeNode('p','card-meta',record.note.slice(0,150)));
    const actions = safeNode('div', 'card-actions');
    if (record.photo instanceof Blob) {
      const link = safeNode('a','mini-btn','↗ Voir ticket');
      const url = URL.createObjectURL(record.photo); urls.push(url);
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label',`Afficher le ticket de ${record.item}`);
      actions.append(link);
    }
    const edit = safeNode('button','mini-btn','✎ Modifier'); edit.type = 'button'; edit.addEventListener('click', () => openForm(record));
    const deleteBtn = safeNode('button','mini-btn remove','× Supprimer'); deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Supprimer « ${record.item} » ainsi que sa photo ? Cette action est irréversible.`)) return;
      try { await remove(record.id); await refresh(); notice('Achat supprimé.'); }
      catch { notice('Suppression impossible. Vérifiez l’espace disponible sur votre appareil.'); }
    });
    actions.append(edit, deleteBtn); el.append(actions);
    return el;
  }
  function renderInsights() {
    const upcoming = C.upcomingDeadlines(records, today(), 30);
    const deadlineBox = $('#upcoming-list');
    deadlineBox.replaceChildren();
    if (!upcoming.length) deadlineBox.append(safeNode('p','insight-empty','Aucune échéance signalée dans les 30 prochains jours.'));
    for (const d of upcoming.slice(0, 8)) {
      const line = safeNode('div','deadline-row');
      const title = safeNode('strong','',`${d.kind === 'return' ? '↺ Retour' : '✧ Garantie'} · ${d.item}`);
      const context = safeNode('small','',`${d.merchant} · ${C.dateLabel(d.due)}`);
      const left = safeNode('div','deadline-description');left.append(title,context);
      line.append(left,safeNode('span',d.days <= 3 ? 'deadline-urgent' : 'deadline-date',d.days===0?'Aujourd’hui':`J-${d.days}`));
      deadlineBox.append(line);
    }
    if (upcoming.length > 8) deadlineBox.append(safeNode('p','insight-empty',`Et ${upcoming.length-8} autres échéances dans votre calendrier.`));
    const month = $('#analytics-month').value || today().slice(0,7);
    const list = C.categoryBreakdown(records, month);
    const total = list.reduce((n,r) => n+r.cents,0);
    const analyticsBox = $('#analytics-list');analyticsBox.replaceChildren();
    if (!list.length) analyticsBox.append(safeNode('p','insight-empty','Aucun achat enregistré pour ce mois.'));
    else {
      for (const r of list) {
        const item = safeNode('div','category-row');
        const head=safeNode('div','category-line');
        head.append(safeNode('span','',r.category),safeNode('strong','',C.formatMoney(r.cents)));
        const track=safeNode('div','category-track');
        const fill=safeNode('div','category-fill');fill.style.width=`${Math.round(r.cents/total*100)}%`;
        track.append(fill);item.append(head,track);analyticsBox.append(item);
      }
      analyticsBox.append(safeNode('p','category-total',`Total : ${C.formatMoney(total)}`));
    }
  }
  function exportCalendar() {
    const result=C.calendarIcs(records);
    if (!result.count) return notice('Ajoutez au moins une échéance de retour ou de garantie.');
    const blob=new Blob([result.content],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url;a.download='receiptrescue-echeances.ics';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    notice(`${result.count} dates exportées. Importez le fichier dans votre calendrier pour recevoir des rappels.`);
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
      return (r.item + ' ' + r.merchant + ' ' + r.category + ' ' + r.note).toLocaleLowerCase('fr-FR').includes(textQuery);
    }).sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn) || a.item.localeCompare(b.item, 'fr'));
    const box = $('#cards');box.replaceChildren(...filtered.map(card));
    const empty = $('#empty-state'); empty.hidden = filtered.length > 0;
    if (!filtered.length) {
      $('#empty-title').textContent = records.length ? 'Aucun achat ne correspond à votre recherche' : 'Votre coffre attend son premier reçu';
      $('#empty-description').textContent = records.length ? 'Essayez un autre mot-clé ou un autre filtre.' : 'Ajoutez votre premier achat pour suivre vos justificatifs et les dates importantes.';
      $('#empty-add').hidden = records.length > 0;
    }
  }
  function openForm(record = null) {
    const form = $('#purchase-form'); form.reset();
    editingId = record?.id || null;
    $('#purchase-title').textContent = record ? 'Modifier un achat' : 'Ajouter un achat';
    $('#save-purchase').textContent = record ? 'Enregistrer les modifications' : 'Enregistrer cet achat';
    $('#form-error').textContent = '';
    $('#file-hint').textContent = record?.photo ? 'Photo déjà enregistrée. Choisir un fichier la remplacera.' : 'Votre photo restera dans ce navigateur.';
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
    $('#form-error').textContent = '';
    const btn = $('#save-purchase');btn.disabled = true;
    try {
      const old = editingId ? records.find(r => r.id === editingId) : null;
      const upload = fields.photo.files[0];
      if (upload && (!C.VALID_MIMES.includes(upload.type) || upload.size > C.MAX_PHOTO_BYTES || upload.size === 0)) throw new Error('Photo non prise en charge : JPEG, PNG ou WebP de 4 Mo maximum.');
      const amountCents = C.eurosToCents(fields.amount.value);
      if (amountCents === null) throw new Error('Indiquez un prix positif avec au maximum deux décimales.');
      const draft = {
        id: old?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
        item: fields.namedItem('item').value, merchant: fields.merchant.value, amountCents,
        purchasedOn: fields.purchasedOn.value, returnBy: fields.returnBy.value,
        warrantyUntil: fields.warrantyUntil.value, category: fields.category.value, note: fields.note.value,
        photo: upload || old?.photo || null, photoName: upload?.name || old?.photoName || ''
      };
      const clean = C.cleanRecord(draft);
      if (!clean) throw new Error('Vérifiez les champs et les dates : les échéances doivent être après l’achat.');
      if (records.length >= C.MAX_RECORDS && !old) throw new Error('Limite de 300 fiches atteinte. Exportez et archivez vos achats.');
      await save(clean);
      $('#purchase-dialog').close();
      await refresh();notice(old ? 'Achat modifié.' : 'Achat ajouté à votre coffre.');
    } catch (err) { $('#form-error').textContent = err?.message || 'Impossible d’enregistrer cette fiche.'; }
    finally { btn.disabled = false; }
  }
  function blobToDataURL(blob) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Photo illisible'));
      reader.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(s) {
    if (!s) return null;
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
    if (!match) throw new Error('Format de photo invalide');
    const binary = atob(match[2]);
    if (binary.length > C.MAX_PHOTO_BYTES || binary.length < 1) throw new Error('Photo trop volumineuse');
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
      if (new Blob([text]).size > C.MAX_BACKUP_BYTES) throw new Error('Sauvegarde trop volumineuse (plus de 32 Mo). Archivez des tickets ou réduisez les photos avant un nouvel export.');
      const file = new Blob([text],{type:'application/json'});
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');a.href=url;a.download=`receiptrescue-sauvegarde-${today()}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      notice('Sauvegarde téléchargée. Conservez-la dans un endroit privé.');
    } catch (error) { notice(error?.message || 'Impossible d’exporter la sauvegarde.'); }
  }
  async function importBackup(file) {
    if (!file || file.size > C.MAX_BACKUP_BYTES || file.size < 10) return notice('Ce fichier est trop volumineux ou illisible (32 Mo maximum).');
    try {
      const parsed = JSON.parse(await file.text());
      const list = C.validateBackup(parsed);
      if (!list) throw new Error('Sauvegarde invalide, inconnue ou altérée.');
      const restored = [];
      for (const r of list) {
        const {photoData, ...rest} = r;
        const photo = dataURLToBlob(photoData);
        const clean = C.cleanRecord({ ...rest, photo });
        if (!clean) throw new Error('Une photo ou une fiche est invalide.');
        restored.push(clean);
      }
      if (!confirm(`Remplacer vos ${records.length} achat(s) actuels par les ${restored.length} achat(s) de ce fichier ? Cette action ne peut pas être annulée.`)) return;
      await replaceAll(restored);
      await refresh();
      $('#backup-dialog').close();
      notice(`${restored.length} achat(s) restauré(s).`);
    } catch (err) { notice('Restauration annulée : ' + (err?.message || 'fichier invalide')); }
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
      if (!confirm('Supprimer définitivement TOUS les achats et tickets de ce navigateur ?')) return;
      if (!confirm('Dernière confirmation : avez-vous sauvegardé vos justificatifs ?')) return;
      try{await wipe();await refresh();$('#backup-dialog').close();notice('Coffre vidé.')}catch{notice('Suppression impossible.')}
    });
    $('#purchase-form').addEventListener('submit',submitForm);
    $('#photo-input').addEventListener('change',e=>{const f=e.target.files[0];$('#file-hint').textContent=f?`Fichier choisi : ${f.name} (${(f.size/1024/1024).toFixed(2)} Mo)`:'Votre photo restera dans ce navigateur.'});
    $$('.close,[data-close]').forEach(button=>button.addEventListener('click',()=>$('#'+button.dataset.close).close()));
    $('#search-input').addEventListener('input',e=>{textQuery=e.target.value.toLocaleLowerCase('fr-FR').trim();render()});
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
      db=await openDatabase();await refresh();
      $('#storage-warning').hidden=true;
      for(const id of ['#add-top','#add-hero','#add-list','#export-inline','#nav-backup']) $(id).disabled=false;
    }
    catch {
      $('#storage-warning').hidden=false;
      $('#cards').replaceChildren();
      const box=$('#empty-state');box.hidden=false;
      $('#empty-title').textContent='Le stockage local est indisponible';
      $('#empty-description').textContent='Autorisez les données du site, désactivez la navigation privée ou utilisez un autre navigateur. Aucune donnée ne part sur un serveur.';
      $('#empty-add').hidden=true;
      for(const id of ['#add-top','#add-hero','#add-list','#export-inline','#nav-backup']) $(id).disabled=true;
      notice('Stockage local bloqué : aucun ticket ne sera enregistré.');
    }
  }
  function init() {
    bind();
    $('#analytics-month').value=today().slice(0,7);
    initStorage();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{ /* Le site reste utilisable en ligne. */ });
    }
  }
  init();
})();