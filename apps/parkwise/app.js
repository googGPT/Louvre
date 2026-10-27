/* ParkWise — interface. Calculs dans core.js (ParkWiseCore) ; textes, montants et dates via LouvreI18n (messages.js). */
(function(){
'use strict';
const Core=window.ParkWiseCore;
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue, devise et traductions
const KEY='parkwise:v1';
let state=Core.defaultState(),readOnly=false,editingSpot=false,locating=false,warnKey=null;
const $=id=>document.getElementById(id);
const money=c=>L.money(c); // tarifs saisis dans la devise choisie
const err=e=>L.error(e);
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
let toastTimer=null;
function toast(message){const el=$('toast');el.textContent=message;el.hidden=false;if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3700);}
// Avertissement persistant : mémorisé sous forme de clé pour être retraduit au changement de langue.
function warn(key,params){warnKey=[key,params];$('storage-warning').textContent=t(key,params);$('storage-warning').hidden=false;}
function load(){try{const raw=localStorage.getItem(KEY);if(raw){state=Core.validateState(JSON.parse(raw));}}catch(e){readOnly=true;warn('warn.unreadable');}}
function commit(next){if(readOnly){toast(t('toast.protected'));return false;}try{const valid=Core.validateState(next);localStorage.setItem(KEY,JSON.stringify(valid));state=valid;render();return true;}catch(e){warn('warn.writeFail',{msg:err(e)});return false;}}
function button(label,handler,cls='neutral'){const b=node('button','btn '+cls,label);b.type='button';b.addEventListener('click',handler);return b;}
function clear(e){e.replaceChildren();}
// Durées du menu : « 30 min », « 1 h 30 », « 2 heures », « 3 jours »… dans la langue choisie.
function durationLabel(m){if(m<60)return t('dur.minutes',{n:m});if(m>=4320&&m%1440===0)return t('dur.days',{n:m/1440});if(m%60)return t('dur.hm',{h:Math.floor(m/60),m:m%60});return t('dur.hours',{n:m/60});}
function fillSelects(){
  for(const o of $('duration').options)o.textContent=durationLabel(Number(o.value));
  const extra={'0':'vt.priceOnly','5':'vt.balance'};
  for(const o of $('value-time').options){const rate=t('rate.perHour',{price:L.money(Number(o.value)*100,{minimumFractionDigits:0,maximumFractionDigits:0})});o.textContent=extra[o.value]?t(extra[o.value],{rate}):rate;}
  for(const c of document.querySelectorAll('.cur'))c.textContent=L.currencySymbol();
}
function carButtonLabel(){$('save-car').textContent=locating?t('car.locating'):'◎ '+t('btn.saveCar');}
function showCarNote(){$('car-note').value=state.parkingSpot?state.parkingSpot.note:$('car-note').value;}
function render(){const duration=Number($('duration').value),timeValue=Number($('value-time').value),rows=Core.compare(state.spots,duration,timeValue,L.locale);const result=$('results');clear(result);
 if(rows.length===0){result.append(node('div','empty',t('cmp.empty')));}
 rows.forEach((spot,i)=>{const row=node('div','result'+(i===0?' winner':''));const rank=node('span','rank',L.number(i+1));const body=node('div');body.append(node('div','result-title',spot.name));body.append(node('div','result-note',t('cmp.note',{n:spot.walkMinutes,value:money(spot.walkEquivalentCents)})));const amt=node('div','result-cost');amt.append(node('strong','',money(spot.priceCents)));amt.append(node('small','',i===0?t('cmp.best'):t('cmp.score',{value:money(spot.scoreCents)})));row.append(rank,body,amt);result.append(row);});
 const list=$('spots-list');clear(list);if(!state.spots.length)list.append(node('div','empty',t('spots.empty')));
 state.spots.forEach(s=>{const box=node('div','spot');box.append(node('strong','',s.name));box.append(node('p','',s.address||t('spots.noAddress')));
   const parts=[t('rate.perHour',{price:money(s.rateCents)}),t('spots.walk',{n:s.walkMinutes}),t('spots.free',{n:s.freeMinutes})];if(s.capCents)parts.push(t('spots.cap',{price:money(s.capCents)}));
   box.append(node('p','',parts.join(' · ')));const actions=node('div','btnbar');actions.append(button(t('btn.edit'),()=>openForm(s)));actions.append(button(t('btn.delete'),()=>{if(confirm(t('confirm.deleteSpot'))&&commit({...state,spots:state.spots.filter(x=>x.id!==s.id)}))toast(t('toast.spotDeleted'))},'neutral delete'));box.append(actions);list.append(box);});
 const car=$('car-status'),map=$('car-map');if(state.parkingSpot){const p=state.parkingSpot;car.textContent=t('car.saved',{date:new Date(p.savedAt).toLocaleString(L.locale),coords:p.lat.toFixed(5)+', '+p.lon.toFixed(5)})+(p.note?' · '+p.note:'');const url=new URL('https://www.openstreetmap.org/');url.searchParams.set('mlat',p.lat.toFixed(6));url.searchParams.set('mlon',p.lon.toFixed(6));url.hash='map=17/'+p.lat.toFixed(6)+'/'+p.lon.toFixed(6);map.href=url.href;map.hidden=false;}else {car.textContent=t('car.none');map.removeAttribute('href');map.hidden=true;}
}
function openForm(spot=null){const form=$('spot-form');form.reset();$('form-error').textContent='';editingSpot=!!spot;$('dialog-title').textContent=spot?t('dlg.edit'):t('dlg.add');$('spot-id').value=spot?.id||'';if(spot){form.elements.name.value=spot.name;form.elements.address.value=spot.address;form.elements.rate.value=(spot.rateCents/100).toFixed(2);form.elements.entry.value=(spot.entryCents/100).toFixed(2);form.elements.free.value=spot.freeMinutes;form.elements.cap.value=(spot.capCents/100).toFixed(2);form.elements.walk.value=spot.walkMinutes;}else {form.elements.rate.value='2.50';form.elements.entry.value='0';form.elements.free.value='0';form.elements.cap.value='0';form.elements.walk.value='5';}$('spot-dialog').showModal();}
function closeForm(){$('spot-dialog').close();}
$('spot-form').addEventListener('submit',e=>{e.preventDefault();const f=e.currentTarget.elements;try{const id=$('spot-id').value||('p_'+crypto.randomUUID().replaceAll('-',''));const spot=Core.validateSpot({id,name:f.name.value.trim(),address:f.address.value.trim(),rateCents:Core.eurosToCents(f.rate.value),entryCents:Core.eurosToCents(f.entry.value),freeMinutes:Number(f.free.value),capCents:Core.eurosToCents(f.cap.value),walkMinutes:Number(f.walk.value)});const exists=state.spots.some(x=>x.id===id);if(!exists&&state.spots.length>=Core.MAX_SPOTS)throw Error('err.maxSpots|'+JSON.stringify({max:Core.MAX_SPOTS}));const spots=exists?state.spots.map(s=>s.id===id?spot:s):[...state.spots,spot];if(commit({...state,spots})){closeForm();toast(t('toast.spotSaved'));}}catch(ex){$('form-error').textContent=err(ex);}});
$('duration').addEventListener('change',render);$('value-time').addEventListener('change',render);$('new-spot').addEventListener('click',()=>openForm());$('close-dialog').addEventListener('click',closeForm);$('cancel-spot').addEventListener('click',closeForm);
$('save-car').addEventListener('click',()=>{if(!navigator.geolocation){toast(t('toast.noGeo'));return;}if(readOnly){toast(t('toast.protectedShort'));return;}const b=$('save-car');b.disabled=true;locating=true;carButtonLabel();navigator.geolocation.getCurrentPosition(position=>{b.disabled=false;locating=false;carButtonLabel();const {latitude:lat,longitude:lon}=position.coords;const parkingSpot={lat,lon,note:$('car-note').value.trim(),savedAt:new Date().toISOString()};if(commit({...state,parkingSpot})){showCarNote();toast(t('toast.carSaved'));}},error=>{b.disabled=false;locating=false;carButtonLabel();toast(error.code===1?t('toast.geoDenied'):t('toast.geoFail'));},{enableHighAccuracy:true,timeout:14000,maximumAge:0});});
$('forget-car').addEventListener('click',()=>{if(!state.parkingSpot)return;if(confirm(t('confirm.forget'))&&commit({...state,parkingSpot:null}))toast(t('toast.carForgotten'));});
function download(filename,text,mime){const blob=new Blob([text],{type:mime});const url=URL.createObjectURL(blob);const a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').addEventListener('click',()=>{download('parkwise-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json');toast(t('toast.exported'));});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>750000)throw Error('err.fileBig');let data;try{data=JSON.parse(await file.text())}catch(_){throw Error('err.json')}const obj=Core.validateState(data);if(!confirm(t('confirm.restore')))return;if(readOnly)throw Error('err.blocked');if(commit(obj)){showCarNote();toast(t('toast.restored'));}}catch(ex){toast(t('toast.importRefused',{msg:err(ex)}));}});
$('calendar').addEventListener('click',()=>{const answer=prompt(t('prompt.minutes'),'120');if(answer===null)return;const minutes=Number(answer);if(!Number.isInteger(minutes)||minutes<1||minutes>10080){toast(t('toast.badDuration'));return;}const now=new Date(),end=new Date(now.getTime()+minutes*60000);const ics=Core.calendarFile({title:t('ics.title'),location:state.parkingSpot?.note||'',start:now,end});download('parkwise-car-return.ics',ics,'text/calendar;charset=utf-8');toast(t('toast.ics'));});
// Nouvelle langue ou devise : menus, libellés calculés et listes réaffichés ; saisies en cours conservées.
L.onChange(()=>{fillSelects();carButtonLabel();$('dialog-title').textContent=editingSpot?t('dlg.edit'):t('dlg.add');if(warnKey)warn(...warnKey);render();});
load();fillSelects();carButtonLabel();$('dialog-title').textContent=t('dlg.add');showCarNote();render();if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(()=>{}));}
})();
