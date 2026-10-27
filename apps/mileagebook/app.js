/* Browser interface: no external requests or remote user data. */
'use strict';
(()=>{
  const L=AppLogic, SPEC=L.SPEC,KEY='louvre-factory:mileagebook:v1';
  const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue, devise, traductions et formats
  // Valeurs enregistrées (en français, inchangées) -> clés de traduction pour l'affichage.
  const CAT_KEYS={'Non précisé':'none','Professionnel':'pro','Personnel':'personal','Autre':'other'};
  const optionLabel=(key,v)=>key==='paid'?t('paid.'+v):key==='category'?t('cat.'+(CAT_KEYS[v]||'other')):v;
  const fieldLabel=key=>t('field.'+key,{cur:I.currencySymbol()});
  const kmText=v=>t('km',{v:I.number(v,{maximumFractionDigits:3})});
  const rateText=v=>t('perKm',{v:I.money(Math.round(v*1e6)/1e4,{minimumFractionDigits:I.currency==='XOF'||I.currency==='XAF'?0:2,maximumFractionDigits:4})}); // taux saisi : jusqu'à 4 décimales
  // Erreur du cœur : clé|{"field":"km"} -> nom du champ traduit avant mise en forme.
  function errText(e){const m=String(e&&e.message||e),[k,j]=m.split('|');if(j){try{const p=JSON.parse(j);if(p.field)p.field=fieldLabel(p.field);return I.error(new Error(k+'|'+JSON.stringify(p)))}catch(_){}}return I.error(e)}
  const $=id=>document.getElementById(id),form=$('record-form');
  let records=[],activeId=null,readOnly=false;
  function node(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e}
  function put(el,value){el.textContent=String(value);return el}
  // Message d'état : texte ou fonction (retraduit si la langue change).
  let lastTell=null;
  function tell(s,err=false){lastTell={s,err};put($('status'),typeof s==='function'?s():s);$('status').className=err?'status error':'status'}
  const tellKey=(key,params,err=false)=>tell(()=>t(key,params),err);
  const tellErr=(key,e)=>tell(()=>key?t(key,{msg:errText(e)}):errText(e),true);
  function download(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
  function save(next){if(readOnly){tellKey('st.readonly',null,true);return false}try{const b=L.backup(next);localStorage.setItem(KEY,b);records=L.validateBackup(JSON.parse(b));return true}catch(e){tellErr('st.saveFail',e);return false}}
  function fields(){for(const f of SPEC.fields){const label=node('label','field');const caption=put(node('span'),fieldLabel(f.key));caption.dataset.field=f.key;label.append(caption);let input;if(f.type==='select'){input=node('select');for(const o of f.options){const option=node('option');option.value=o;put(option,optionLabel(f.key,o));input.append(option)}if(f.optional)input.value='Non précisé';}else{input=node('input');input.type=f.type;if(f.type==='number'){input.step=f.key==='km'?'0.001':'0.0001';input.min='0';input.max=f.key==='km'?'100000':'1000'}else if(f.type==='text')input.maxLength=160;}input.name=f.key;input.required=!f.optional;input.autocomplete='off';if(f.type==='date')input.value=L.dayKey();label.append(input);$('fields').append(label)}form.addEventListener('input',preview);form.addEventListener('change',preview)}
  function formData(){const d={id:activeId||'preview001'};for(const f of SPEC.fields){const val=form.elements.namedItem(f.key).value;d[f.key]=f.type==='number'?(val===''?NaN:Number(val)):val;}return L.normalizeRecord(d)}
  function preview(){try{const r=formData();put($('live-preview'),t('preview.est',{amount:I.money(L.tripCents(r)),km:I.number(r.km,{maximumFractionDigits:3}),rate:rateText(r.rate)}))}catch(e){put($('live-preview'),t('preview.hint'))}}
  // Libellés du formulaire (langue ou devise changée) : seuls les textes changent, jamais les valeurs saisies.
  function relabel(){for(const c of $('fields').querySelectorAll('[data-field]'))put(c,fieldLabel(c.dataset.field));for(const key of ['paid','category'])for(const o of form.elements.namedItem(key).options)put(o,optionLabel(key,o.value));saveLabel()}
  function saveLabel(){put($('save-button'),t(activeId?'btn.update':'btn.save'))}
  function reset(){activeId=null;form.reset();form.elements.namedItem('day').value=L.dayKey();form.elements.namedItem('category').value='Non précisé';form.elements.namedItem('paid').value='non';saveLabel();$('cancel-edit').hidden=true;preview()}
  function edit(r){activeId=r.id;for(const f of SPEC.fields)form.elements.namedItem(f.key).value=r[f.key]??'';saveLabel();$('cancel-edit').hidden=false;preview();form.scrollIntoView({block:'start',behavior:'smooth'})}
  function filters(){return {year:$('year').value,month:$('month').value,status:$('paid-filter').value,query:$('search').value}}
  function refreshYears(){const previous=$('year').value,years=[...new Set(records.map(r=>r.day.slice(0,4)))].sort().reverse(),el=$('year');el.replaceChildren();const all=node('option');all.value='';put(all,t('year.all'));el.append(all);for(const y of years){const x=node('option');x.value=y;put(x,y);el.append(x)}el.value=years.includes(previous)?previous:'';}
  function render(){const data=L.compute(records,filters());$('summary').replaceChildren();for(const k of data.kpis){const val=k.type==='money'?I.money(k.value):k.type==='km'?kmText(k.value):I.number(k.value);const card=node('div','stat');card.append(put(node('span'),t(k.key)),put(node('strong'),val));$('summary').append(card)}
    const months=$('monthly');months.replaceChildren();if(!data.monthly.length)months.append(put(node('p','footnote'),t('monthly.empty')));else{const max=Math.max(1,...data.monthly.map(x=>x.totalCents));for(const m of data.monthly.slice(0,12)){const row=node('div','month-row'),date=put(node('span'),I.date(m.month+'-01',{month:'short',year:'numeric'})),track=node('div','track'),fill=node('div','fill');fill.style.width=(m.totalCents/max*100).toFixed(1)+'%';track.append(fill);row.append(date,track,put(node('strong'),I.money(m.totalCents)));months.append(row)}}
    put($('counter'),t('counter',{n:data.rows.length}));const list=$('items');list.replaceChildren();if(!data.rows.length)list.append(put(node('div','empty'),t('items.empty')));
    for(const r of data.rows){const card=node('article','item');card.dataset.recordId=r.id;const h=put(node('h3'),r.purpose),info=node('div','item-info');for(const v of [I.date(r.day,{day:'numeric',month:'short',year:'numeric'}),kmText(r.km),optionLabel('category',r.category),r.vehicle,r.origin&&r.destination?t('route',{from:r.origin,to:r.destination}):r.origin||r.destination].filter(Boolean))info.append(put(node('span','tag'),v));card.append(h,info);
      const amount=node('div','amount');amount.append(put(node('strong'),I.money(L.tripCents(r))),put(node('span',r.paid==='oui'?'paid':'unpaid'),t(r.paid==='oui'?'status.paid':'status.unpaid')));card.append(amount);
      const bar=node('div','item-buttons'),paid=node('button','outline small'),editB=node('button','outline small'),del=node('button','outline small');
      for(const b of [paid,editB,del])b.type='button';put(paid,t(r.paid==='oui'?'btn.markUnpaid':'btn.markPaid'));put(editB,t('btn.edit'));put(del,t('btn.delete'));
      paid.disabled=readOnly;editB.disabled=readOnly;del.disabled=readOnly;
      paid.addEventListener('click',()=>{if(save(records.map(x=>x.id===r.id?L.setPaid(x,r.paid==='oui'?'non':'oui'):x))){refreshYears();render();tellKey('st.statusUpdated')}});
      editB.addEventListener('click',()=>edit(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&save(records.filter(x=>x.id!==r.id))){refreshYears();render();tellKey('st.deleted')}});
      bar.append(paid,editB,del);card.append(bar);list.append(card);
    }
  }
  fields();form.addEventListener('submit',e=>{e.preventDefault();if(readOnly){tellKey('st.readonlyImport',null,true);return}try{const obj=formData();if(!activeId&&records.length>=L.MAX)throw Error('err.max|'+JSON.stringify({max:L.MAX}));const duplicate=L.findDuplicates(records,obj,activeId);if(duplicate.length&&!confirm(t('confirm.duplicate')))return;const valid={...obj,id:activeId||crypto.randomUUID().replaceAll('-','')};const next=activeId?records.map(r=>r.id===activeId?valid:r):[...records,valid];if(save(next)){reset();refreshYears();render();tellKey('st.saved')}}catch(err){tellErr(null,err)}});
  $('cancel-edit').addEventListener('click',reset);
  for(const id of ['search','year','month','paid-filter'])$(id).addEventListener(id==='search'||id==='month'?'input':'change',render);
  $('clear-filters').addEventListener('click',()=>{$('search').value='';$('year').value='';$('month').value='';$('paid-filter').value='tous';render()});
  $('export-csv').addEventListener('click',()=>{try{const arr=L.compute(records,filters()).rows;const decimal=I.number(1.5).replace(/\d/g,'')||',';download('mileagebook-releve.csv',L.toCSV(arr,{header:t('csv.header',{cur:I.currency}).split(';'),decimal,label:optionLabel}),'text/csv;charset=utf-8');tellKey('st.csv',{n:arr.length})}catch(e){tellErr(null,e)}});
  $('export').addEventListener('click',()=>{try{download('mileagebook-sauvegarde.json',L.backup(records),'application/json');tellKey('st.json')}catch(e){tellErr(null,e)}});
  $('export-raw').addEventListener('click',()=>{download('mileagebook-donnees-brutes.txt',localStorage.getItem(KEY)||'','text/plain');tellKey('st.raw')});
  $('import').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');const valid=L.validateBackup(JSON.parse(await file.text()));if(!confirm(t('confirm.import',{a:I.number(records.length),b:I.number(valid.length)})))return;const oldReadOnly=readOnly;readOnly=false;if(save(valid)){reset();refreshYears();$('search').value='';$('month').value='';$('paid-filter').value='tous';render();$('warning').hidden=true;tellKey('st.restored')}else readOnly=oldReadOnly;}catch(err){tellErr('st.importRefused',err)}});
  try{const existing=localStorage.getItem(KEY);if(existing)records=L.validateBackup(JSON.parse(existing))}catch(e){readOnly=true;$('warning').hidden=false;tellKey('st.corrupt',null,true)}
  reset();refreshYears();render();
  // Nouvelle langue ou devise : libellés, montants et dates retraduits ; saisie, filtres et mode édition conservés.
  I.onChange(()=>{relabel();refreshYears();render();preview();if(lastTell)tell(lastTell.s,lastTell.err)});
  if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();