/* SizeMatch v2 — interface et stockage navigateur isolés de core.js ; textes et nombres via LouvreI18n (messages.js) */
'use strict';
(()=>{
const L=AppLogic,KEY='louvre-factory:sizematch:v1';
const I=window.LouvreI18n.init(window.LouvreMessages),tr=I.t; // langue et traductions
// Catégories : valeurs internes françaises (filtres, calculs) ; noms traduits à l'affichage.
const DIM_KEYS={distance:'distance',masse:'mass',volume:'volume','température':'temp'};
const dimName=d=>tr('dim.'+(DIM_KEYS[d]||'distance'));
const unitName=u=>tr('unit.'+L.UNITS[u].key);
const fmt=v=>L.formatValue(v,I.locale);
const err=e=>I.error(e);
let records=[],editing=null,readOnly=false;
const $=s=>document.getElementById(s);
const form=$('record-form');
const status=$('status');
const t=(tag,className,value)=>{const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=String(value);return el;};
const normalizeSearch=v=>String(v).toLocaleLowerCase(I.locale).normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
function tell(message,bad=false){status.textContent=message;status.className=bad?'error':'';}
function download(filename,content,type){const u=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=u;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function write(next){if(readOnly){tell(tr('st.damaged'),true);return false;}try{const json=L.backup(next);localStorage.setItem(KEY,json);records=L.validateBackup(JSON.parse(json));return true;}catch(e){tell(tr('st.writeFail',{msg:err(e)}),true);return false;}}
function fields(){return {id:editing||crypto.randomUUID().replaceAll('-','').slice(0,24),name:$('name').value,value:$('value').value.trim()===''?NaN:Number($('value').value),from:$('from').value,to:$('to').value};}
function units(group,keepFrom,keepTo){
  const list=L.GROUPS[group];const from=$('from'),to=$('to');
  function fill(select,selected){select.replaceChildren(...list.map(unit=>{const o=t('option',null,unitName(unit));o.value=unit;return o;}));if(list.includes(selected))select.value=selected;}
  fill(from,keepFrom||list[0]);fill(to,keepTo||list[1]||list[0]);
  refresh();
}
function refresh(){
 const box=$('result-box'),number=$('result-number'),unit=$('result-unit'),hint=$('result-hint');
 try{const f=fields(),y=L.convert(f.value,f.from,f.to);box.classList.remove('error');number.textContent=fmt(y);unit.textContent=f.to;hint.textContent=fmt(f.value)+' '+f.from+' = '+fmt(y)+' '+f.to;return y;}
 catch(e){box.classList.add('error');number.textContent=err(e);unit.textContent='';hint.textContent=tr('result.hint');return null;}
}
function setSaveLabel(){$('save-button').textContent=editing?tr('btn.update'):tr('btn.save');}
function reset(){editing=null;form.reset();$('category').value='distance';units('distance','km','mile');setSaveLabel();$('cancel-edit').hidden=true;}
function edit(r){editing=r.id;$('name').value=r.name;$('value').value=String(r.value);$('category').value=L.category(r.from);units(L.category(r.from),r.from,r.to);setSaveLabel();$('cancel-edit').hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});}
function render(){
 const overview=L.compute(records),summary=$('summary');summary.replaceChildren();for(const [label,value] of overview.kpis){const box=t('div','stat');box.append(t('span','stat-label',tr(label)),t('strong','stat-value',I.number(Number(value))));summary.append(box);}
 const query=normalizeSearch($('search').value),filter=$('filter').value;
 // La recherche porte aussi sur le nom traduit de la catégorie.
 const visible=records.filter(r=>(filter==='all'||L.category(r.from)===filter)&&normalizeSearch([r.name,r.from,r.to,L.category(r.from),dimName(L.category(r.from))].join(' ')).includes(query));
 $('counter').textContent=tr('hist.count',{n:visible.length});
 const items=$('items');items.replaceChildren();
 if(!visible.length){items.append(t('p','empty',records.length?tr('hist.noMatch'):tr('hist.empty')));return;}
 for(const r of visible.slice().reverse()){
  const card=t('article','item');card.append(t('h3',null,r.name),t('p',null,fmt(r.value)+' '+r.from+' →'));
  card.append(t('p','converted',fmt(L.convert(r.value,r.from,r.to))+' '+r.to));
  const actions=t('div','item-actions'),button=(label,cls,fn)=>{const b=t('button',cls,label);b.type='button';b.addEventListener('click',fn);actions.append(b);};
  button(tr('btn.edit'),'secondary',()=>edit(r));
  button(tr('btn.copy'),'secondary',()=>copyText(fmt(L.convert(r.value,r.from,r.to))+' '+r.to));
  button(tr('btn.delete'),'danger',()=>{if(confirm(tr('confirm.delete'))&&write(records.filter(x=>x.id!==r.id))){if(editing===r.id)reset();render();tell(tr('st.deleted'))}});
  card.append(actions);items.append(card);
 }
}
async function copyText(s){try{await navigator.clipboard.writeText(s);tell(tr('st.copied'));}catch(_){tell(tr('st.copyFail'),true);}}
$('category').addEventListener('change',()=>units($('category').value));
$('from').addEventListener('change',()=>{const group=L.category($('from').value);if(L.category($('to').value)!==group)units(group,$('from').value);refresh();});
$('to').addEventListener('change',refresh);
$('value').addEventListener('input',refresh);
$('swap').addEventListener('click',()=>{const from=$('from').value,to=$('to').value;$('from').value=to;$('to').value=from;refresh();});
$('copy').addEventListener('click',()=>{const result=refresh();if(result!==null)copyText(fmt(result)+' '+$('to').value);else tell(tr('st.nothingToCopy'),true);});
form.addEventListener('submit',event=>{event.preventDefault();if(readOnly){tell(tr('st.unreadable'),true);return;}try{const item=L.normalizeRecord(fields());let next=editing?records.map(x=>x.id===editing?item:x):[...records,item];if(next.length>L.MAX)throw Error('err.limit|'+JSON.stringify({max:L.MAX}));if(write(next)){reset();render();tell(tr('st.saved'))}}catch(e){tell(err(e),true);}});
$('cancel-edit').addEventListener('click',reset);
for(const preset of document.querySelectorAll('[data-preset]'))preset.addEventListener('click',()=>{const p={'km-mile':[10,'km','mile'],'c-f':[-10,'°C','°F'],'kg-lb':[2,'kg','lb'],'l-gal':[3,'L','gal US']}[preset.dataset.preset];$('category').value=L.category(p[1]);units(L.category(p[1]),p[1],p[2]);$('value').value=String(p[0]);$('name').value=preset.textContent;refresh();});
$('search').addEventListener('input',render);$('filter').addEventListener('change',render);
$('export').addEventListener('click',()=>{try{download('sizematch-backup.json',L.backup(records),'application/json');tell(tr('st.jsonDone'))}catch(e){tell(err(e),true)}});
// CSV : titres et catégories dans la langue choisie ; virgule décimale si la langue l'utilise.
$('export-csv').addEventListener('click',()=>{try{const decimal=I.number(1.5).includes(',')?',':'.';download('sizematch-conversions.csv',L.toCSV(records,{headers:['name','value','from','converted','to','category'].map(k=>tr('csv.'+k)),catName:dimName,decimal}),'text/csv;charset=utf-8');tell(tr('st.csvDone'))}catch(e){tell(err(e),true)}});
$('export-raw').addEventListener('click',()=>{download('sizematch-raw-storage.txt',localStorage.getItem(KEY)||'','text/plain');tell(tr('st.rawDone'));});
$('import').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');let data;try{data=JSON.parse(await file.text())}catch(_){throw Error('err.json')}const restored=L.validateBackup(data);if(!confirm(tr('confirm.restore',{a:records.length,b:restored.length})))return;const wasReadOnly=readOnly;readOnly=false;if(write(restored)){$('warning').hidden=true;reset();$('search').value='';$('filter').value='all';render();tell(tr('st.restored'));}else readOnly=wasReadOnly;}catch(e){tell(tr('st.importRefused',{msg:err(e)}),true);}});
try{const saved=localStorage.getItem(KEY);if(saved)records=L.validateBackup(JSON.parse(saved));}catch(e){readOnly=true;$('warning').hidden=false;tell(tr('st.unreadableRaw'),true);}
units('distance','km','mile');setSaveLabel();render();
// Nouvelle langue : noms d'unités, résultat et historique réaffichés ; valeur, unités et nom saisis conservés.
I.onChange(()=>{const g=$('category').value,f=$('from').value,to=$('to').value;units(g,f,to);setSaveLabel();render();tell('');});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
