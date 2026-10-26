'use strict';
(()=>{
 const L=AppLogic,storageKey='louvre-factory:travelday:v1';const $=id=>document.getElementById(id);
 const form=$('record-form'),fields=$('fields'),status=$('status');let records=[],activeId=null,readOnly=false;
 const make=(tag,cls='',content)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=String(content);return el};
 function tell(s,error=false){status.textContent=s;status.className=error?'status error':'status'}
 function fileDownload(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 function save(next,repair=false){if(readOnly&&!repair){tell('Stockage illisible : restaurez une sauvegarde valide.',true);return false}try{const validated=L.validateBackup({app:'travelday',version:1,records:next});localStorage.setItem(storageKey,L.backup(validated));records=validated;readOnly=false;$('warning').hidden=true;return true}catch(e){tell('Enregistrement impossible : '+e.message,true);return false}}
 function getFilter(){return $('day-filter').value}function selected(){return records.filter(r=>getFilter()==='all'||r.day===getFilter())}
 function render(){const previous=getFilter(),days=[...new Set(records.map(r=>r.day))].sort();$('day-filter').replaceChildren(new Option('Toutes les dates','all'),...days.map(day=>new Option(day,day)));$('day-filter').value=days.includes(previous)?previous:'all';
  const result=L.analyze(records,getFilter(),Number($('buffer').value));const summary=$('summary');summary.replaceChildren(...result.kpis.map(([label,value])=>{const box=make('div','stat');box.append(make('span','',label),make('strong','',value));return box}));
  $('notes').replaceChildren(...result.notes.map(n=>make('p','',n)));
  const byday=$('day-summary');byday.replaceChildren(...Object.entries(result.perDay).filter(([d])=>getFilter()==='all'||d===getFilter()).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,v])=>{const row=make('div','day-line');row.append(make('strong','',d),make('span','',v.count+' activité(s) · '+L.eur(v.costCents)));return row}));
  if(!byday.children.length)byday.append(make('p','muted','Aucune journée enregistrée.'));
  $('conflicts').replaceChildren(...(result.conflicts.length?result.conflicts.map(p=>make('li','',p.firstName+' ↔ '+p.secondName+' : '+p.minutes+' min de chevauchement')):[make('li','empty','Aucun chevauchement détecté.') ]));
  $('gaps').replaceChildren(...(result.gaps.length?result.gaps.map(p=>make('li','',p.after+' → '+p.before+' : seulement '+p.minutes+' min de marge')):[make('li','empty','Pas de transition courte selon la marge choisie.') ]));
  const q=$('search').value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(), shown=result.items.filter(x=>Object.values(x.record).some(v=>String(v).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q)));
  $('counter').textContent='('+shown.length+')';$('items').replaceChildren();if(!shown.length)$('items').append(make('p','empty-state','Aucune étape pour cette recherche.'));
  for(const x of shown){const r=x.record,card=make('article','item'+(result.conflictIds.includes(r.id)?' conflict':''));card.dataset.recordId=r.id;
   const times=make('div','time-band');times.append(make('span','',r.day+' · '+r.start+' → '+r.end+(x.overnight?' (+1 jour)':'')),make('span','pill',L.minutesLabel(x.duration)));
   card.append(times,make('h3','',r.place));const details=make('div','meta',r.category+' · '+L.eur(x.costCents)+(r.notes?' · '+r.notes:''));card.append(details);
   if(result.conflictIds.includes(r.id))card.append(make('span','pill warn','Chevauchement'));
   const bar=make('div','item-actions'),edit=make('button','secondary small','Modifier'),del=make('button','danger small','Supprimer');edit.type=del.type='button';edit.addEventListener('click',()=>editRecord(r));del.addEventListener('click',()=>{if(confirm('Supprimer cette étape ?')&&save(records.filter(z=>z.id!==r.id))){render();tell('Étape supprimée.')}});bar.append(edit,del);card.append(bar);$('items').append(card)}
 }
 function formRecord(){const r={id:activeId||'preview1234'};for(const f of L.SPEC.fields){const input=form.elements.namedItem(f.key);r[f.key]=f.type==='number'?Number(input.value):input.value}return L.normalizeRecord(r)}
 function preview(){const el=$('preview');try{const r=formRecord(),x=L.interval(r),rest=records.filter(a=>a.id!==activeId),analysis=L.analyze([...rest,r]);const n=analysis.conflicts.filter(p=>p.first===r.id||p.second===r.id).length;el.className=n?'preview warn':'preview';el.textContent=L.minutesLabel(x.duration)+' · '+L.eur(x.costCents)+(x.overnight?' · arrivée le lendemain':'')+(n?' · Attention : '+n+' conflit(s) avec le programme':' · Aucun chevauchement');}catch(e){el.className='preview';el.textContent='Complétez la date, les horaires et le coût pour voir un aperçu.'}}
 function reset(){activeId=null;form.reset();form.elements.namedItem('day').value=L.dayKey();form.elements.namedItem('category').value='Activité';$('save-button').textContent='Ajouter au programme';$('cancel-edit').hidden=true;preview()}
 function editRecord(r){activeId=r.id;for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=r[f.key];$('save-button').textContent='Enregistrer les modifications';$('cancel-edit').hidden=false;preview();form.scrollIntoView({behavior:'smooth',block:'start'})}
 function initForm(){for(const f of L.SPEC.fields){const wide=['day','place','notes'].includes(f.key);const label=make('label','field'+(wide?' wide':''));label.append(make('span','',f.label));let input;
   if(f.type==='select'){input=make('select');for(const o of f.options)input.append(new Option(o,o))}
   else if(f.type==='optionalText'){input=make('textarea');input.rows=2;input.maxLength=360}
   else {input=make('input');input.type=f.type;if(f.type==='number'){input.min='0';input.max='1000000';input.step='0.01';}else input.maxLength=160;}
   input.name=f.key;input.required=f.type!=='optionalText';label.append(input);fields.append(label)}
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  form.addEventListener('submit',e=>{e.preventDefault();if(readOnly){tell('Restaurez une sauvegarde avant toute modification.',true);return}try{const draft=formRecord();draft.id=activeId||crypto.randomUUID().replace(/-/g,'').slice(0,24);const valid=L.normalizeRecord(draft);const next=activeId?records.map(r=>r.id===activeId?valid:r):[...records,valid];if(save(next)){reset();render();tell('Étape enregistrée localement.')}}catch(e){tell(e.message,true)}});
  $('cancel-edit').addEventListener('click',reset);reset();}
 function filename(ext){return 'travelday-'+(getFilter()==='all'?'toutes-dates':getFilter())+'.'+ext}
 $('day-filter').addEventListener('change',()=>{render();preview()});$('buffer').addEventListener('change',render);$('search').addEventListener('input',render);
 $('export').addEventListener('click',()=>{try{fileDownload('travelday-sauvegarde.json',L.backup(records),'application/json');tell('Sauvegarde JSON complète prête.')}catch(e){tell(e.message,true)}});
 $('csv').addEventListener('click',()=>{fileDownload(filename('csv'),L.toCsv(selected()),'text/csv;charset=utf-8');tell('Export CSV de la sélection prêt.')} );
 $('ics').addEventListener('click',()=>{fileDownload(filename('ics'),L.toIcs(selected()),'text/calendar;charset=utf-8');tell('ICS prêt. Les heures sont flottantes : importez dans le fuseau du voyage.')} );
 $('print').addEventListener('click',()=>window.print());
 $('export-raw').addEventListener('click',()=>{fileDownload('travelday-stockage-original.txt',localStorage.getItem(storageKey)||'','text/plain');tell('Copie du stockage brut téléchargée : ne la publiez pas.')} );
 $('sample').addEventListener('click',()=>{if(readOnly){tell('Restaurez les données avant de modifier.',true);return}if(records.length&&!confirm('Ajouter trois activités de démonstration à vos données existantes ?'))return;const day=L.dayKey(),seed=[['Café et petit-déjeuner','08:30','09:15',12,'Repas'],['Visite du musée','09:30','11:30',19,'Visite'],['Déjeuner en ville','12:00','13:00',24,'Repas']].map(([place,start,end,cost,category],i)=>({id:'demo'+crypto.randomUUID().replace(/-/g,'').slice(0,22),day,place,start,end,cost,category,notes:''}));if(save([...records,...seed])){render();tell('Programme exemple ajouté.')}});
 $('import').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{if(f.size>L.STORAGE_LIMIT)throw Error('Fichier trop volumineux');const data=L.validateBackup(JSON.parse(await f.text()));if(!confirm('Remplacer '+records.length+' étape(s) par '+data.length+' étape(s) validée(s) ?'))return;
    // A rejected/failed write leaves the existing raw storage untouched.
    if(save(data,true)){reset();$('search').value='';$('day-filter').value='all';render();tell('Sauvegarde restaurée.')}}catch(err){tell('Import refusé : '+err.message,true)}});
 try{const saved=localStorage.getItem(storageKey);if(saved)records=L.validateBackup(JSON.parse(saved))}catch(e){readOnly=true;$('warning').hidden=false;tell('Stockage illisible : données conservées sans écrasement.',true)}
 initForm();render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();