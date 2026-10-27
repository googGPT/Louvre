/* FridgeFirst UI/persistence boundary. Domain and recipe ranking live in core.js. */
(()=>{
'use strict';
const C=window.FridgeCore;
let L=null,t=(k)=>k; // LouvreI18n : langue, traductions et formats (initialisé au démarrage)
const KEY='fridgefirst-local-v1';
// Valeurs enregistrées (en français, à ne pas modifier) -> clés de traduction pour l'affichage.
const CAT_KEYS={'légume':'vegetable','fruit':'fruit','protéine':'protein','féculent':'starch','laitier':'dairy','autre':'other'};
const PLACE_KEYS={'frigo':'frigo','congélateur':'freezer','placard':'cupboard'};
const UNIT_KEYS={'pièce':'unit.piece','portion':'unit.portion'};
const ACTION_KEYS={'consommé':'action.consumed','jeté':'action.discarded'};
const FOOD_KEYS={'tomate':'tomato','œuf':'egg','fromage':'cheese','pain':'bread','riz':'rice','pâtes':'pasta','carotte':'carrot','courgette':'zucchini','oignon':'onion','pomme':'apple','banane':'banana','lait':'milk','yaourt':'yogurt','poulet':'chicken','poisson':'fish','pomme de terre':'potato','champignon':'mushroom','épinard':'spinach','salade':'lettuce','concombre':'cucumber','citron':'lemon','fraise':'strawberry','avocat':'avocado','thon':'tuna','lentille':'lentil','haricot':'bean','beurre':'butter','crème':'cream','farine':'flour','huile':'oil','ail':'garlic','pois chiche':'chickpea','brocoli':'broccoli','poivron':'pepper','maïs':'corn','flocon d’avoine':'oats'};
const catName=(c)=>t('cat.'+(CAT_KEYS[c]||'other'));
const placeName=(p)=>t('place.'+(PLACE_KEYS[p]||'frigo'));
const unitName=(u)=>UNIT_KEYS[u]?t(UNIT_KEYS[u]):u;
const foodVariants=(n,lang)=>{const k=FOOD_KEYS[n];if(!k)return [n];const m=(window.LouvreMessages[lang]||{})['food.'+k];return m?m.split('|'):[n];};
const foodName=(n)=>foodVariants(n,L.lang)[0]; // nom d'ingrédient du catalogue dans la langue affichée
let aliases={}; // nom saisi (toutes langues, normalisé) -> nom du catalogue
function buildAliases(){aliases={};const langs=Object.keys(L.LANGS).filter(l=>l!==L.lang).concat(L.lang);for(const lang of langs)for(const [n] of C.FOOD)for(const v of foodVariants(n,lang))aliases[C.norm(v)]=n;}
let storageMsg=null; // message d'erreur de stockage affiché (fonction : retraduit si la langue change)
let state=C.empty(), view='inventaire', editId=null, blocked=false, toastTimeout;
const $=(s)=>document.querySelector(s), $$=(s)=>[...document.querySelectorAll(s)];
function esc(v){return String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function displayDate(v){return L.date(v,{day:'numeric',month:'short',year:'numeric'});}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.add('hidden'),3600);}
function showError(message){blocked=true;storageMsg=message||null;$('#storage-error').classList.remove('hidden');$('#storage-msg').textContent=storageMsg?storageMsg():t('storage.text');}
function clearError(){blocked=false;storageMsg=null;$('#storage-error').classList.add('hidden');}
function read(){try{const v=localStorage.getItem(KEY);if(!v){localStorage.setItem(KEY,JSON.stringify(C.empty()));state=C.empty();clearError();return;}state=C.validateBackup(JSON.parse(v));clearError();}catch(e){showError(()=>t('storage.load'));state=C.empty();}}
function commit(transform){if(blocked){toast(t('toast.blocked'));return false;}try{const next=C.validateBackup(transform(JSON.parse(JSON.stringify(state))));localStorage.setItem(KEY,JSON.stringify(next));state=next;render();return true;}catch(e){showError(()=>t('storage.save',{msg:e.message?L.error(e):t('storage.title')}));return false;}}
function storeImported(next){try{const valid=C.validateBackup(next);localStorage.setItem(KEY,JSON.stringify(valid));state=valid;clearError();render();return true;}catch(e){showError(()=>t('storage.import',{msg:L.error(e)}));return false;}}
function itemState(i,today){const s=C.status(i,today),days=C.daysTo(i.expiry,today);return {status:s,label:days<0?t('chip.past'):days===0?t('chip.today'):days===1?t('chip.tomorrow'):t('chip.days',{n:days})};}
function setView(v){view=v;$$('.page-view').forEach(el=>el.classList.toggle('hidden',el.id!==`view-${v}`));$$('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===v));render();window.scrollTo({top:0,behavior:'instant'});}
function renderInventory(today){const a=C.analytics(state.items,state.history,today);$('#stat-stock').textContent=a.current;$('#stat-urgent').textContent=a.urgent;$('#stat-expired').textContent=a.expired;$('#hero-count').textContent=L.number(a.urgent);$('#hero-unit').textContent=t('hero.unit',{n:a.urgent});$('#hero-caption').textContent=a.current===0?t('hero.empty'):a.urgent===0?t('hero.none'):t('hero.caption',{n:a.urgent});
  $('#inventory-count').textContent=a.current;
  const search=C.norm($('#search').value||''),place=$('#filter-place').value,urgency=$('#filter-urgency').value;
  const list=state.items.filter(i=>(!search||C.norm(i.name).includes(search))&&(place==='all'||i.place===place)&&(urgency==='all'||(urgency==='urgent'&&['urgent','bientôt'].includes(C.status(i,today)))||C.status(i,today)===urgency));
  list.sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.name.localeCompare(b.name,L.locale));
  const el=$('#inventory-list');
  if(!list.length){el.innerHTML=`<div class="empty-state"><span>🥬</span><strong>${esc(t('inv.emptyTitle'))}</strong><p>${esc(t('inv.emptyText'))}</p></div>`;return;}
  el.innerHTML=list.map(i=>{const s=itemState(i,today);return `<article class="food-row" data-id="${esc(i.id)}"><div class="food-ident"><span class="food-emoji">${C.guess(i.name,aliases).emoji}</span><div><strong title="${esc(i.name)}">${esc(i.name)}</strong><small>${esc(catName(i.category))}</small></div></div><div class="quantity">${esc(L.number(i.quantity))} <small>${esc(unitName(i.unit))}</small></div><span class="place">${i.place==='frigo'?'🧊':i.place==='congélateur'?'❄️':'🪑'} ${esc(placeName(i.place))}</span><div class="date-cell"><span class="date-chip ${esc(s.status)}" title="${esc(displayDate(i.expiry))}">${esc(s.label)}</span></div><div class="row-actions"><button type="button" data-action="consume" title="${esc(t('act.consume'))}" aria-label="${esc(t('act.consumeAria',{name:i.name}))}">✓</button><button type="button" data-action="discard" title="${esc(t('act.discard'))}" aria-label="${esc(t('act.discardAria',{name:i.name}))}">↗</button><button type="button" data-action="edit" aria-label="${esc(t('act.editAria',{name:i.name}))}">✎</button><button type="button" data-action="remove" class="trash" aria-label="${esc(t('act.removeAria',{name:i.name}))}">×</button></div></article>`}).join('');
}
function renderRecipes(today){const ready=$('#recipe-ready').checked;const rec=C.recipeSuggestions(state.items,today,aliases).filter(r=>!ready||r.ready);$('#recipe-result-count').textContent=t('rec.count',{n:rec.length});const el=$('#recipe-list');if(!rec.length){el.innerHTML=`<div class="empty-state"><span>👩‍🍳</span><strong>${esc(t('rec.emptyTitle'))}</strong><p>${esc(t('rec.emptyText'))}</p></div>`;return;}
  el.innerHTML=rec.map(r=>`<article class="recipe-card" data-recipe="${esc(r.id)}"><div class="recipe-top"><div class="recipe-art">${r.emoji}</div><div><h3>${esc(t('r.'+r.id))}</h3><p>${esc(t('rec.meta',{mins:L.number(r.mins),have:L.number(r.have.length),total:L.number(r.ingredients.length)}))}</p></div></div><div class="recipe-tags">${r.have.map(x=>`<span class="recipe-tag">✓ ${esc(foodName(x))}</span>`).join('')}${r.missing.map(x=>`<span class="recipe-tag missing">＋ ${esc(foodName(x))}</span>`).join('')}</div><div class="recipe-meter"><div style="width:${Math.round(r.ratio*100)}%"></div></div><div class="recipe-footer"><span>${esc(r.ready?t('rec.allIn'):t('rec.missing',{n:r.missing.length}))}</span><button type="button" data-recipe-add="${esc(r.id)}" ${r.ready?'disabled':''}>${esc(r.ready?t('rec.ready'):t('rec.addMissing'))}</button></div><details class="recipe-steps"${openSteps.has(r.id)?' open':''}><summary>${esc(t('rec.steps'))}</summary><ol>${[1,2,3].map(n=>`<li>${esc(t(`r.${r.id}.${n}`))}</li>`).join('')}</ol></details></article>`).join('');
}
function renderShopping(){const open=state.shopping.filter(s=>!s.checked).length;$('#shopping-count').textContent=L.number(open);const el=$('#shopping-list');if(!state.shopping.length){el.innerHTML=`<div class="empty-state"><span>🛒</span><strong>${esc(t('shop.emptyTitle'))}</strong><p>${esc(t('shop.emptyText'))}</p></div>`;return;}
  el.innerHTML=[...state.shopping].sort((a,b)=>Number(a.checked)-Number(b.checked)).map(s=>`<div class="shop-item ${s.checked?'done':''}" data-shop="${esc(s.id)}"><label><input type="checkbox" data-shop-check="${esc(s.id)}" ${s.checked?'checked':''}><span>${esc(s.name)}</span></label><button type="button" data-shop-delete="${esc(s.id)}" aria-label="${esc(t('act.removeAria',{name:s.name}))}">×</button></div>`).join('');}
function renderHistory(today){const a=C.analytics(state.items,state.history,today);$('#stat-consumed').textContent=a.consumed;$('#stat-wasted').textContent=a.discarded;$('#stat-bilan-stock').textContent=a.current;const el=$('#history-list');if(!state.history.length){el.innerHTML=`<div class="empty-state"><span>🌱</span><strong>${esc(t('hist.emptyTitle'))}</strong><p>${esc(t('hist.emptyText'))}</p></div>`;return;}el.innerHTML=[...state.history].reverse().slice(0,100).map(h=>`<div class="history-item"><div><strong>${esc(h.name)}</strong><br><small>${esc(t('hist.line',{date:displayDate(h.date),qty:L.number(h.quantity)}))}</small></div><span class="history-action ${h.action==='jeté'?'wasted':''}">${esc(t(ACTION_KEYS[h.action]))}</span></div>`).join('');}
function render(){const today=C.todayLocal();$('#today-label').textContent=L.date(today,{weekday:'long',day:'numeric',month:'long',year:'numeric'});renderInventory(today);renderRecipes(today);renderShopping();renderHistory(today);}
function dialog(id){const el=document.getElementById(id);if(el.open)return;el.showModal();}
function closeDialog(id){const el=document.getElementById(id);if(el.open)el.close();}
function openItem(id=null){editId=id;const item=id?state.items.find(i=>i.id===id):null;if(id&&!item)return;$('#item-form').reset();$('#dialog-title').textContent=item?t('dlg.edit'):t('btn.addFood');$('#form-error').textContent='';$('#item-name').value=item?.name||'';$('#item-quantity').value=item?.quantity||1;$('#item-unit').value=item?.unit||'pièce';$('#item-category').value=item?.category||'légume';$('#item-place').value=item?.place||'frigo';$('#item-expiry').value=item?.expiry||C.addDays(C.todayLocal(),4);dialog('item-dialog');}
let confirmation=null;
function confirmDialog(title,body,fn){confirmation=fn;$('#confirm-title').textContent=title;$('#confirm-text').textContent=body;dialog('confirm-dialog');}
function exportFile(name,blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function exportBackup(){try{if(blocked){toast(t('toast.exportBlocked'));return;}exportFile('fridgefirst-sauvegarde-'+C.todayLocal()+'.json',new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'}));toast(t('toast.backup'));}catch(e){toast(t('toast.exportFail'));}}
function fillFoodList(){$('#food-list').replaceChildren(...C.FOOD.map(([n])=>{const o=document.createElement('option');o.value=foodName(n);return o;}));}
function setOffline(){$('#offline-indicator').textContent=navigator.onLine?t('top.local'):t('top.offline');}
const openSteps=new Set(); // préparations dépliées (conservées quand l'écran est retraduit)
function init(){L=window.LouvreI18n.init(window.LouvreMessages);t=L.t;buildAliases();read();fillFoodList();
  $('#recipe-list').addEventListener('toggle',e=>{const d=e.target.closest&&e.target.closest('details.recipe-steps');if(!d)return;const id=d.closest('[data-recipe]').dataset.recipe;if(d.open)openSteps.add(id);else openSteps.delete(id);},true);
  L.onChange(()=>{buildAliases();fillFoodList();setOffline();if(blocked)$('#storage-msg').textContent=storageMsg?storageMsg():t('storage.text');render();}); // nouvelle langue : on retraduit sans toucher aux saisies
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('#hero-recipes').addEventListener('click',()=>setView('recettes'));
  $('#open-add').addEventListener('click',()=>openItem());$('#open-add-hero').addEventListener('click',()=>openItem());
  $('#item-name').addEventListener('input',()=>{if(editId)return;const guess=C.guess($('#item-name').value,aliases);$('#item-category').value=guess.category;});
  $$('#search,#filter-place,#filter-urgency').forEach(e=>e.addEventListener('input',render));$('#recipe-ready').addEventListener('change',render);
  $('#item-form').addEventListener('submit',e=>{e.preventDefault();const day=C.todayLocal(),name=C.cleanName($('#item-name').value), quantity=Number($('#item-quantity').value);const old=editId?state.items.find(i=>i.id===editId):null;
    const item={id:old?.id||C.id(),name,quantity,unit:$('#item-unit').value,category:$('#item-category').value,place:$('#item-place').value,expiry:$('#item-expiry').value,createdAt:old?.createdAt||day};
    if(!C.validItem(item)){$('#form-error').textContent=t('f.error');return;}
    const done=commit(s=>{if(old)s.items=s.items.map(x=>x.id===old.id?item:x);else {if(s.items.length>=1000)throw Error('err.full|{"max":1000}');s.items.push(item);}return s;});if(done){closeDialog('item-dialog');toast(old?t('toast.edited'):t('toast.added'));}
  });
  $('#inventory-list').addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;const id=btn.closest('[data-id]')?.dataset.id,item=state.items.find(x=>x.id===id);if(!item)return;const action=btn.dataset.action;if(action==='edit')return openItem(id);
    const act=action==='consume'?'consommé':null;
    if(act)confirmDialog(t('cfm.consumeT'),t('cfm.consume',{name:item.name}),()=>{if(commit(s=>{s.items=s.items.filter(x=>x.id!==id);if(s.history.length>=3000)throw Error('err.historyFull');s.history.push({id:C.id(),name:item.name,quantity:item.quantity,action:'consommé',date:C.todayLocal()});return s;}))toast(t('toast.consumed'));});
    else if(action==='discard')confirmDialog(t('cfm.discardT'),t('cfm.discard',{name:item.name}),()=>{if(commit(s=>{s.items=s.items.filter(x=>x.id!==id);if(s.history.length>=3000)throw Error('err.historyFull');s.history.push({id:C.id(),name:item.name,quantity:item.quantity,action:'jeté',date:C.todayLocal()});return s;}))toast(t('toast.discarded'));});
    else if(action==='remove')confirmDialog(t('cfm.removeT'),t('cfm.remove',{name:item.name}),()=>{if(commit(s=>{s.items=s.items.filter(x=>x.id!==id);return s;}))toast(t('toast.removed'));});
  });
  $('#confirm-yes').addEventListener('click',()=>{const fn=confirmation;confirmation=null;closeDialog('confirm-dialog');if(fn)fn();});
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
  $('#recipe-list').addEventListener('click',e=>{const btn=e.target.closest('button[data-recipe-add]');if(!btn)return;const r=C.recipeSuggestions(state.items,C.todayLocal(),aliases).find(x=>x.id===btn.dataset.recipeAdd);if(!r||!r.missing.length)return;let added=0;if(commit(s=>{for(const name of r.missing){if(s.shopping.some(x=>C.canon(x.name,aliases)===C.canon(name,aliases)))continue;if(s.shopping.length>=500)throw Error('err.shopFull');s.shopping.push({id:C.id(),name:foodName(name),checked:false});added++;}return s;})){toast(added?t('toast.shopAddedN',{n:added}):t('toast.shopAlready'));setView('courses');}});
  $('#shopping-form').addEventListener('submit',e=>{e.preventDefault();const name=C.cleanName($('#shopping-name').value);if(!name)return;const ok=commit(s=>{if(s.shopping.some(x=>C.canon(x.name,aliases)===C.canon(name,aliases)))throw Error('err.shopDup');if(s.shopping.length>=500)throw Error('err.shopFull');s.shopping.push({id:C.id(),name,checked:false});return s;});if(ok){$('#shopping-name').value='';toast(t('toast.shopAdded'));}});
  $('#shopping-list').addEventListener('change',e=>{const box=e.target.closest('input[data-shop-check]');if(!box)return;commit(s=>{const i=s.shopping.find(x=>x.id===box.dataset.shopCheck);if(i)i.checked=box.checked;return s;});});
  $('#shopping-list').addEventListener('click',e=>{const btn=e.target.closest('button[data-shop-delete]');if(!btn)return;commit(s=>{s.shopping=s.shopping.filter(x=>x.id!==btn.dataset.shopDelete);return s;});});
  $('#print-shopping').addEventListener('click',()=>window.print());$('#export-btn').addEventListener('click',exportBackup);$('#import-btn').addEventListener('click',()=>$('#import-input').click());
  $('#import-input').addEventListener('change',async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>1024*1024){toast(t('toast.importBig'));return;}try{const data=C.validateBackup(JSON.parse(await f.text()));confirmDialog(t('cfm.restoreT'),t('cfm.restore',{a:L.number(state.items.length),b:L.number(data.items.length)}),()=>{if(storeImported(data))toast(t('toast.restored'));});}catch(err){toast(t('toast.importRefused',{msg:L.error(err)}));}});
  $('#retry-storage').addEventListener('click',()=>{read();render();if(!blocked)toast(t('toast.storageOk'));});
  window.addEventListener('storage',ev=>{if(ev.key===KEY){read();render();}});
  window.addEventListener('online',setOffline);window.addEventListener('offline',setOffline);setOffline();
  if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();