'use strict';
(()=>{
 const L=AppLogic,storageKey='louvre-factory:travelday:v1';const $=id=>document.getElementById(id);
 const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue, devise et traductions
 // Catégories stockées en français (compatibilité des sauvegardes) -> clé de traduction.
 const CAT_KEYS={'Visite':'visit','Transport':'transport','Repas':'meal','Hébergement':'lodging','Activité':'activity','Autre':'other'};
 const catName=c=>t('cat.'+(CAT_KEYS[c]||'other'));
 const form=$('record-form'),fields=$('fields'),status=$('status');let records=[],activeId=null,readOnly=false;
 const make=(tag,cls='',content)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=String(content);return el};
 const money=c=>I.money(c); // montant saisi, affiché dans la devise choisie
 const duration=n=>t('duration',{h:Math.floor(n/60),m:String(n%60).padStart(2,'0')});
 const dayLabel=d=>I.date(d,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
 const arrow=()=>I.dir==='rtl'?'←':'→'; // flèche dans le sens de lecture
 const fold=s=>String(s).toLocaleLowerCase(I.lang).normalize('NFD').replace(/[̀-ͯ]/g,'');
 function tell(s,error=false){status.textContent=s;status.className=error?'status error':'status'}
 function fileDownload(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 function save(next,repair=false){if(readOnly&&!repair){tell(t('status.readonly'),true);return false}try{const validated=L.validateBackup({app:'travelday',version:1,records:next});localStorage.setItem(storageKey,L.backup(validated));records=validated;readOnly=false;$('warning').hidden=true;return true}catch(e){tell(t('status.saveFail',{msg:I.error(e)}),true);return false}}
 function getFilter(){return $('day-filter').value}function selected(){return records.filter(r=>getFilter()==='all'||r.day===getFilter())}
 function kpiValue([,v,kind]){return kind==='money'?money(v):kind==='minutes'?duration(v):I.number(v)}
 function render(){const previous=getFilter(),days=[...new Set(records.map(r=>r.day))].sort();$('day-filter').replaceChildren(new Option(t('dash.allDays'),'all'),...days.map(day=>new Option(dayLabel(day),day)));$('day-filter').value=days.includes(previous)?previous:'all';
  const result=L.analyze(records,getFilter(),Number($('buffer').value));const summary=$('summary');summary.replaceChildren(...result.kpis.map(k=>{const box=make('div','stat');box.append(make('span','',t(k[0])),make('strong','',kpiValue(k)));return box}));
  $('notes').replaceChildren(...result.notes.map(n=>make('p','',t(n))));
  const byday=$('day-summary');byday.replaceChildren(...Object.entries(result.perDay).filter(([d])=>getFilter()==='all'||d===getFilter()).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,v])=>{const row=make('div','day-line');row.append(make('strong','',dayLabel(d)),make('span','',t('day.line',{n:v.count,cost:money(v.costCents)})));return row}));
  if(!byday.children.length)byday.append(make('p','muted',t('day.none')));
  $('conflicts').replaceChildren(...(result.conflicts.length?result.conflicts.map(p=>make('li','',t('alert.conflict',{a:p.firstName,b:p.secondName,n:p.minutes}))):[make('li','empty',t('alert.noConflict'))]));
  $('gaps').replaceChildren(...(result.gaps.length?result.gaps.map(p=>make('li','',t('alert.gap',{a:p.after,arrow:arrow(),b:p.before,n:p.minutes}))):[make('li','empty',t('alert.noGap'))]));
  const q=fold($('search').value).trim(), shown=result.items.filter(x=>Object.entries(x.record).some(([k,v])=>fold(v).includes(q)||(k==='category'&&fold(catName(v)).includes(q))));
  $('counter').textContent='('+I.number(shown.length)+')';$('items').replaceChildren();if(!shown.length)$('items').append(make('p','empty-state',t('list.empty')));
  for(const x of shown){const r=x.record,card=make('article','item'+(result.conflictIds.includes(r.id)?' conflict':''));card.dataset.recordId=r.id;
   const times=make('div','time-band');times.append(make('span','',dayLabel(r.day)+' · '+r.start+' '+arrow()+' '+r.end+(x.overnight?' '+t('item.nextDay'):'')),make('span','pill',duration(x.duration)));
   card.append(times,make('h3','',r.place));const details=make('div','meta',catName(r.category)+' · '+money(x.costCents)+(r.notes?' · '+r.notes:''));card.append(details);
   if(result.conflictIds.includes(r.id))card.append(make('span','pill warn',t('item.overlap')));
   const bar=make('div','item-actions'),edit=make('button','secondary small',t('btn.edit')),del=make('button','danger small',t('btn.delete'));edit.type=del.type='button';edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm(t('confirm.delete'))&&save(records.filter(z=>z.id!==r.id))){render();tell(t('status.deleted'))}});bar.append(edit,del);card.append(bar);$('items').append(card)}
 }
 function formRecord(){const r={id:activeId||'preview1234'};for(const f of L.SPEC.fields){const input=form.elements.namedItem(f.key);r[f.key]=f.type==='number'?Number(input.value):input.value}return L.normalizeRecord(r)}
 function preview(){const el=$('preview');try{const r=formRecord(),x=L.interval(r),rest=records.filter(a=>a.id!==activeId),analysis=L.analyze([...rest,r]);const n=analysis.conflicts.filter(p=>p.first===r.id||p.second===r.id).length;el.className=n?'preview warn':'preview';el.textContent=duration(x.duration)+' · '+money(x.costCents)+(x.overnight?' · '+t('preview.overnight'):'')+' · '+(n?t('preview.conflicts',{n}):t('preview.noConflict'));}catch(e){el.className='preview';el.textContent=t('preview.incomplete')}}
 function labelButtons(){$('save-button').textContent=t(activeId?'btn.saveEdit':'btn.add');$('cancel-edit').hidden=!activeId}
 function reset(){activeId=null;form.reset();form.elements.namedItem('day').value=L.dayKey();form.elements.namedItem('category').value='Activité';labelButtons();preview()}
 function editRecord(r){activeId=r.id;for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=r[f.key];labelButtons();preview();form.scrollIntoView({behavior:'smooth',block:'start'})}
 const fieldLabels=[]; // [élément, clé] : retraduits au changement de langue ou de devise
 function labelFields(){for(const [span,key] of fieldLabels)span.textContent=t('field.'+key,{cur:I.currencySymbol()});for(const o of form.elements.namedItem('category').options)o.textContent=catName(o.value)}
 function initForm(){for(const f of L.SPEC.fields){const wide=['day','place','notes'].includes(f.key);const label=make('label','field'+(wide?' wide':''));const span=make('span','');fieldLabels.push([span,f.key]);label.append(span);let input;
   if(f.type==='select'){input=make('select');for(const o of f.options)input.append(new Option(o,o))}
   else if(f.type==='optionalText'){input=make('textarea');input.rows=2;input.maxLength=360}
   else {input=make('input');input.type=f.type;if(f.type==='number'){input.min='0';input.max='1000000';input.step='0.01';}else input.maxLength=160;}
   input.name=f.key;input.required=f.type!=='optionalText';label.append(input);fields.append(label)}
  labelFields();
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  form.addEventListener('submit',e=>{e.preventDefault();if(readOnly){tell(t('status.restoreFirst'),true);return}try{const draft=formRecord();draft.id=activeId||crypto.randomUUID().replace(/-/g,'').slice(0,24);const valid=L.normalizeRecord(draft);const next=activeId?records.map(r=>r.id===activeId?valid:r):[...records,valid];if(save(next)){reset();render();tell(t('status.saved'))}}catch(e){tell(I.error(e),true)}});
  $('cancel-edit').addEventListener('click',reset);reset();}
 function filename(ext){return 'travelday-'+(getFilter()==='all'?t('file.allDays'):getFilter())+'.'+ext}
 // Libellés des exports dans la langue et la devise choisies (les données restent identiques).
 const csvLabels=()=>({cols:['date','place','start','end','nextDay','minutes','category','budget','notes'].map(k=>t('csv.'+k,{cur:I.currency})),yes:t('csv.yes'),no:t('csv.no'),category:catName});
 const icsDescribe=(r,cents)=>t('ics.description',{category:catName(r.category),cost:money(cents)})+(r.notes?' — '+r.notes:'');
 $('day-filter').addEventListener('change',()=>{render();preview()});$('buffer').addEventListener('change',render);$('search').addEventListener('input',render);
 $('export').addEventListener('click',()=>{try{fileDownload(t('file.backup'),L.backup(records),'application/json');tell(t('status.json'))}catch(e){tell(I.error(e),true)}});
 $('csv').addEventListener('click',()=>{fileDownload(filename('csv'),L.toCsv(selected(),csvLabels()),'text/csv;charset=utf-8');tell(t('status.csv'))} );
 $('ics').addEventListener('click',()=>{fileDownload(filename('ics'),L.toIcs(selected(),icsDescribe),'text/calendar;charset=utf-8');tell(t('status.ics'))} );
 $('print').addEventListener('click',()=>window.print());
 $('export-raw').addEventListener('click',()=>{fileDownload(t('file.raw'),localStorage.getItem(storageKey)||'','text/plain');tell(t('status.raw'))} );
 $('sample').addEventListener('click',()=>{if(readOnly){tell(t('status.restoreFirst'),true);return}if(records.length&&!confirm(t('confirm.sample')))return;const day=L.dayKey(),seed=[['sample.breakfast','08:30','09:15',12,'Repas'],['sample.museum','09:30','11:30',19,'Visite'],['sample.lunch','12:00','13:00',24,'Repas']].map(([key,start,end,cost,category])=>({id:'demo'+crypto.randomUUID().replace(/-/g,'').slice(0,22),day,place:t(key),start,end,cost,category,notes:''}));if(save([...records,...seed])){render();tell(t('status.sample'))}});
 $('import').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.size>L.STORAGE_LIMIT)throw Error('err.fileBig');let parsed;try{parsed=JSON.parse(await f.text())}catch(x){throw Error('err.json')}const data=L.validateBackup(parsed);if(!confirm(t('confirm.restore',{n:records.length,m:data.length})))return;
    // A rejected/failed write leaves the existing raw storage untouched.
    if(save(data,true)){reset();$('search').value='';$('day-filter').value='all';render();tell(t('status.restored'))}}catch(err){tell(t('status.importFail',{msg:I.error(err)}),true)}});
 try{const saved=localStorage.getItem(storageKey);if(saved)records=L.validateBackup(JSON.parse(saved))}catch(e){readOnly=true;$('warning').hidden=false;tell(t('status.locked'),true)}
 initForm();render();
 // Changement de langue ou de devise : écran retraduit, saisie et données intactes.
 I.onChange(()=>{labelFields();labelButtons();render();preview()});
 if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
