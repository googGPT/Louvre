/* SizeMatch v2 — interface et stockage navigateur isolés de core.js */
'use strict';
(()=>{
const L=AppLogic,KEY='louvre-factory:sizematch:v1';
let records=[],editing=null,readOnly=false;
const $=s=>document.getElementById(s);
const form=$('record-form');
const status=$('status');
const t=(tag,className,value)=>{const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=String(value);return el;};
const normalizeSearch=v=>String(v).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
function tell(message,bad=false){status.textContent=message;status.className=bad?'error':'';}
function download(filename,content,type){const u=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=u;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function write(next){if(readOnly){tell('Stockage endommagé : restaurez un JSON valide avant toute écriture.',true);return false;}try{const json=L.backup(next);localStorage.setItem(KEY,json);records=L.validateBackup(JSON.parse(json));return true;}catch(err){tell('Enregistrement impossible : '+err.message,true);return false;}}
function fields(){return {id:editing||crypto.randomUUID().replaceAll('-','').slice(0,24),name:$('name').value,value:$('value').value.trim()===''?NaN:Number($('value').value),from:$('from').value,to:$('to').value};}
function units(group,keepFrom,keepTo){
  const list=L.GROUPS[group];const from=$('from'),to=$('to');
  function fill(select,selected){select.replaceChildren(...list.map(unit=>{const o=t('option',null,L.UNITS[unit].label);o.value=unit;return o;}));if(list.includes(selected))select.value=selected;}
  fill(from,keepFrom||list[0]);fill(to,keepTo||list[1]||list[0]);
  refresh();
}
function refresh(){
 const box=$('result-box'),number=$('result-number'),unit=$('result-unit'),hint=$('result-hint');
 try{const f=fields(),y=L.convert(f.value,f.from,f.to);box.classList.remove('error');number.textContent=L.formatValue(y);unit.textContent=f.to;hint.textContent=L.formatValue(f.value)+' '+f.from+' = '+L.formatValue(y)+' '+f.to;return y;}
 catch(err){box.classList.add('error');number.textContent=err.message;unit.textContent='';hint.textContent='Choisissez des unités compatibles et une valeur valide.';return null;}
}
function reset(){editing=null;form.reset();$('category').value='distance';units('distance','km','mile');$('save-button').textContent='Enregistrer';$('cancel-edit').hidden=true;}
function edit(r){editing=r.id;$('name').value=r.name;$('value').value=String(r.value);$('category').value=L.category(r.from);units(L.category(r.from),r.from,r.to);$('save-button').textContent='Mettre à jour';$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
function render(){
 const overview=L.compute(records),summary=$('summary');summary.replaceChildren();for(const [label,value] of overview.kpis){const box=t('div','stat');box.append(t('span','stat-label',label),t('strong','stat-value',value));summary.append(box);}
 const query=normalizeSearch($('search').value),filter=$('filter').value;
 const visible=records.filter(r=>(filter==='all'||L.category(r.from)===filter)&&normalizeSearch([r.name,r.from,r.to,L.category(r.from)].join(' ')).includes(query));
 $('counter').textContent=visible.length+' fiche'+(visible.length>1?'s':'');
 const items=$('items');items.replaceChildren();
 if(!visible.length){items.append(t('p','empty',records.length?'Aucun résultat pour ce filtre.':'Votre historique est vide. Convertissez une valeur, puis enregistrez-la.'));return;}
 for(const r of visible.slice().reverse()){
  const card=t('article','item');card.append(t('h3',null,r.name),t('p',null,L.formatValue(r.value)+' '+r.from+' →'));
  card.append(t('p','converted',L.formatValue(L.convert(r.value,r.from,r.to))+' '+r.to));
  const actions=t('div','item-actions'),button=(label,cls,fn)=>{const b=t('button',cls,label);b.type='button';b.addEventListener('click',fn);actions.append(b);};
  button('Modifier','secondary',()=>edit(r));
  button('Copier','secondary',()=>copyText(L.formatValue(L.convert(r.value,r.from,r.to))+' '+r.to));
  button('Supprimer','danger',()=>{if(confirm('Supprimer cette conversion ?')&&write(records.filter(x=>x.id!==r.id))){if(editing===r.id)reset();render();tell('Conversion supprimée.')}});
  card.append(actions);items.append(card);
 }
}
async function copyText(s){try{await navigator.clipboard.writeText(s);tell('Résultat copié.');}catch(_){tell('Copie automatique indisponible : sélectionnez le résultat affiché.',true);}}
$('category').addEventListener('change',()=>units($('category').value));
$('from').addEventListener('change',()=>{const group=L.category($('from').value);if(L.category($('to').value)!==group)units(group,$('from').value);refresh();});
$('to').addEventListener('change',refresh);
$('value').addEventListener('input',refresh);
$('swap').addEventListener('click',()=>{const from=$('from').value,to=$('to').value;$('from').value=to;$('to').value=from;refresh();});
$('copy').addEventListener('click',()=>{const result=refresh();if(result!==null)copyText(L.formatValue(result)+' '+$('to').value);else tell('Aucune valeur valide à copier.',true);});
form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tell('Stockage illisible : restaurez d’abord un JSON valide.',true);return;}try{const item=L.normalizeRecord(fields());let next=editing?records.map(x=>x.id===editing?item:x):[...records,item];if(next.length>L.MAX)throw Error('Limite de '+L.MAX+' conversions atteinte');if(write(next)){reset();render();tell('Conversion enregistrée localement.')}}catch(err){tell(err.message,true);}});
$('cancel-edit').addEventListener('click',reset);
for(const preset of document.querySelectorAll('[data-preset]'))preset.addEventListener('click',()=>{const p={'km-mile':[10,'km','mile'],'c-f':[-10,'°C','°F'],'kg-lb':[2,'kg','lb'],'l-gal':[3,'L','gal US']}[preset.dataset.preset];$('category').value=L.category(p[1]);units(L.category(p[1]),p[1],p[2]);$('value').value=String(p[0]);$('name').value=preset.textContent;refresh();});
$('search').addEventListener('input',render);$('filter').addEventListener('change',render);
$('export').addEventListener('click',()=>{try{download('sizematch-sauvegarde.json',L.backup(records),'application/json');tell('Sauvegarde JSON téléchargée.')}catch(err){tell(err.message,true)}});
$('export-csv').addEventListener('click',()=>{try{download('sizematch-conversions.csv',L.toCSV(records),'text/csv;charset=utf-8');tell('Export CSV généré.')}catch(err){tell(err.message,true)}});
$('export-raw').addEventListener('click',()=>{download('sizematch-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');tell('Copie brute téléchargée — ne la publiez pas.');});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('Fichier trop volumineux');const restored=L.validateBackup(JSON.parse(await file.text()));if(!confirm('Remplacer les '+records.length+' fiches par '+restored.length+' fiches vérifiées ?'))return;const wasReadOnly=readOnly;readOnly=false;if(write(restored)){$('warning').hidden=true;reset();$('search').value='';$('filter').value='all';render();tell('Sauvegarde restaurée.');}else readOnly=wasReadOnly;}catch(err){tell('Import refusé : '+err.message,true);}});
try{const saved=localStorage.getItem(KEY);if(saved)records=L.validateBackup(JSON.parse(saved));}catch(err){readOnly=true;$('warning').hidden=false;tell('Stockage local illisible : sauvegardez la copie brute puis restaurez un JSON valide.',true);}
units('distance','km','mile');render();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();