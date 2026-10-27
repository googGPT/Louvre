/* RoomSketch browser adapter. Plans validated before save or render. Texts: messages.js (LouvreI18n). */
(()=>{'use strict';
const C=window.RoomCore,$=id=>document.getElementById(id),KEY='louvre-wave2-roomsketch-v1',NS='http://www.w3.org/2000/svg';
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t,MSG=window.LouvreMessages;
const fmt=n=>L.number(n,{minimumFractionDigits:2,maximumFractionDigits:2});
const cm=n=>L.number(n);
// Input ids -> field codes of the core (translated as fld.<code>).
const FIELD={'room-width':'roomWidth','room-depth':'roomDepth','edit-x':'x','edit-y':'y','edit-width':'width','edit-depth':'depth'};
const int=(id,min,max)=>{const v=$(id).value;if(!/^\d+$/.test(v))throw Error('err.positiveInt|'+JSON.stringify({field:FIELD[id]}));return C.integer(Number(v),FIELD[id],min,max);};
// Stored default names stay French (PRESETS) for compatibility; they are translated on display only.
const isDefaultName=(kind,label)=>label===C.PRESETS[kind].label||Object.values(MSG).some(m=>m['kind.'+kind]===label);
const nameOf=(label,kind)=>kind&&C.PRESETS[kind]&&isDefaultName(kind,label)?t('kind.'+kind):label;
const display=o=>nameOf(o.label,o.kind);
function errText(e){
 const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');
 let p;try{p=json?JSON.parse(json):undefined;}catch(_){p=undefined;}
 if(p){
  if(p.field!==undefined&&MSG.fr['fld.'+p.field]!==undefined)p.field=t('fld.'+p.field);
  if(p.name!==undefined)p.name=nameOf(p.name,p.kind);
  if(p.a!==undefined)p.a=nameOf(p.a,p.ak);
  if(p.b!==undefined)p.b=nameOf(p.b,p.bk);
 }
 return L.error(Error(p?key+'|'+JSON.stringify(p):key));
}
const mk=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=String(txt);return n;};
const shape=(tag,attrs={},txt)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(txt!==undefined)n.textContent=String(txt);return n;};
let state=C.empty(),baseline=null,blocked=false,selected=null,revision=0,drag=null;
function message(s,error=false){$('feedback').className=error?'feedback error':'feedback success';$('feedback').textContent=s;}
function current(){return localStorage.getItem(KEY);}
function commit(next){
 if(blocked){message(t('msg.locked'),true);return false;}
 try{
  const clean=C.validate(next);
  if(current()!==baseline){blocked=true;render();message(t('msg.otherChange'),true);return false;}
  const text=JSON.stringify(clean);
  localStorage.setItem(KEY,text);baseline=text;state=clean;revision++;render();return true;
 }catch(e){message(t('msg.changeRefused',{msg:errText(e)}),true);return false;}
}
function restore(next){
 try{
  const clean=C.validate(next),text=JSON.stringify(clean);
  localStorage.setItem(KEY,text);state=clean;baseline=text;blocked=false;selected=null;revision++;render();return true;
 }catch(e){message(t('msg.restoreRefused',{msg:errText(e)}),true);return false;}
}
function controls(){
 const o=state.objects.find(x=>x.id===selected);
 if(!o)selected=null;
 for(const id of ['room-width','room-depth','resize-room','furniture-kind','add-furniture','reset-plan','edit-x','edit-y','edit-width','edit-depth','edit-label','apply-furniture','rotate-furniture','remove-furniture']){
  const needs= id.startsWith('edit-')||['apply-furniture','rotate-furniture','remove-furniture'].includes(id);
  $(id).disabled=blocked||(needs&&!o);
 }
 for(const id of ['export-svg','export-json','print-plan'])$(id).disabled=blocked;
 $('import-plan').disabled=false;$('raw-export').hidden=!blocked;$('warning').hidden=!blocked;
}
function coordinates(ev){
 const svg=$('plan-view'),p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;
 const m=svg.getScreenCTM();if(!m)throw Error('err.ctm');
 return p.matrixTransform(m.inverse());
}
function paint(){
 const r=state.room,svg=$('plan-view');svg.setAttribute('viewBox','0 0 '+r.width+' '+r.depth);
 const all=[shape('title',{},t('svg.roomTitle',{w:cm(r.width),d:cm(r.depth)})),
  shape('desc',{},t('svg.roomDesc',{n:state.objects.length})),
  shape('rect',{x:0,y:0,width:r.width,height:r.depth,fill:'#fbfdfc'})];
 if($('grid-visual').checked){
  for(let x=0;x<=r.width;x+=50)all.push(shape('line',{x1:x,y1:0,x2:x,y2:r.depth,stroke:'#dce9ec','stroke-width':1,'pointer-events':'none'}));
  for(let y=0;y<=r.depth;y+=50)all.push(shape('line',{x1:0,y1:y,x2:r.width,y2:y,stroke:'#dce9ec','stroke-width':1,'pointer-events':'none'}));
 }
 all.push(shape('rect',{x:1,y:1,width:r.width-2,height:r.depth-2,fill:'none',stroke:'#244d60','stroke-width':3,'pointer-events':'none'}));
 for(const o of state.objects){
  const b=C.bounds(o),active=selected===o.id,name=display(o);
  const g=shape('g',{'data-id':o.id,role:'button','aria-label':t('aria.item',{name,x:cm(o.x),y:cm(o.y),w:cm(b.width),d:cm(b.depth)})});
  g.append(shape('rect',{x:b.x,y:b.y,width:b.width,height:b.depth,rx:4,
   fill:C.PRESETS[o.kind].color,stroke:active?'#147bb5':'#476577','stroke-width':active?5:2,cursor:'grab'}),
   shape('text',{x:b.x+b.width/2,y:b.y+b.depth/2,'text-anchor':'middle','dominant-baseline':'central',
    'font-size':Math.min(16,Math.max(10,Math.floor(b.width/8))),fill:'#243849','pointer-events':'none'},name),
   shape('text',{x:b.x+b.width/2,y:b.y+b.depth/2+18,'text-anchor':'middle','font-size':10,fill:'#3c5d71','pointer-events':'none'},
    t('dim.cm',{w:cm(b.width),d:cm(b.depth)})));
  g.addEventListener('pointerdown',ev=>{
   if(ev.button!==0||blocked)return;
   drag={id:o.id,pointerId:ev.pointerId,start:coordinates(ev),before:state,item:o,moved:false};
   selected=o.id;
   // Do not replace the pointerdown target while the pointer is pressed:
   // detaching an SVG group can cause lost capture and pointercancel in Chromium.
   fields();controls();
   for(const group of svg.querySelectorAll('g[data-id]')){
    const rect=group.querySelector('rect'),active=group.getAttribute('data-id')===selected;
    if(rect){rect.setAttribute('stroke',active?'#147bb5':'#476577');rect.setAttribute('stroke-width',active?'5':'2');}
   }
   svg.setPointerCapture(ev.pointerId);
   svg.focus({preventScroll:true});ev.preventDefault();
  });
  all.push(g);
 }
 svg.replaceChildren(...all);
}
// keepInputs: on a language change, the select and notes are re-translated but typed values stay.
function fields(keepInputs=false){
 const select=$('selected-id');select.replaceChildren();
 const blank=mk('option',null,t('sel.none'));blank.value='';select.append(blank);
 for(const o of state.objects){const option=mk('option',null,display(o)+' · '+o.id.slice(-6));option.value=o.id;select.append(option);}
 select.value=selected||'';
 const o=state.objects.find(x=>x.id===selected);
 if(!keepInputs)for(const [id,val] of Object.entries({'edit-x':o?.x??'','edit-y':o?.y??'','edit-width':o?.width??'','edit-depth':o?.depth??'','edit-label':o?display(o):''}))$(id).value=val;
 $('rotation-note').textContent=o?t('note.rotation',{deg:o.rotation}):t('note.select');
}
function stats(){
 const a=C.area(state);
 $('area-room').textContent=t('unit.m2',{v:fmt(a.roomCm2/10000)});
 $('area-filled').textContent=t('unit.m2',{v:fmt(a.occupiedCm2/10000)});
 $('area-free').textContent=t('unit.m2',{v:fmt(a.freeCm2/10000)});
 $('object-count').textContent=L.number(state.objects.length)+' / '+L.number(C.MAX_OBJECTS);
 $('plan-caption').textContent=t('caption',{w:cm(state.room.width),d:cm(state.room.depth),pct:L.number(a.occupiedPercent/100,{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2})});
}
function render(){
 $('room-width').value=state.room.width;$('room-depth').value=state.room.depth;
 if(selected&&!state.objects.some(o=>o.id===selected))selected=null;
 stats();fields();controls();paint();
}
$('resize-room').addEventListener('click',()=>{
 try{const w=int('room-width',200,1500),h=int('room-depth',200,1500);if(commit(C.resizeRoom(state,w,h)))message(t('msg.resized',{w:cm(w),d:cm(h)}));}
 catch(e){message(errText(e),true);}
});
$('add-furniture').addEventListener('click',()=>{
 try{
  const next=C.add(state,$('furniture-kind').value,'obj-'+crypto.randomUUID());
  if(commit(next)){selected=next.objects.at(-1).id;render();message(t('msg.added'));}
 }catch(e){message(t('msg.addRefused',{msg:errText(e)}),true);}
});
$('selected-id').addEventListener('change',ev=>{selected=ev.target.value||null;render();$('plan-view').focus({preventScroll:true});});
$('apply-furniture').addEventListener('click',()=>{
 if(!selected)return;
 try{
  const o=state.objects.find(x=>x.id===selected),typed=$('edit-label').value;
  // A default name shown in any language is stored as the original (French) preset name.
  const label=o&&isDefaultName(o.kind,typed.trim())?C.PRESETS[o.kind].label:typed;
  const next=C.update(state,selected,{x:int('edit-x',0,1500),y:int('edit-y',0,1500),
   width:int('edit-width',20,600),depth:int('edit-depth',20,600),label});
  if(commit(next))message(t('msg.applied'));
 }catch(e){message(t('msg.changeRefused2',{msg:errText(e)}),true);}
});
$('rotate-furniture').addEventListener('click',()=>{
 if(!selected)return;
 try{if(commit(C.rotate(state,selected)))message(t('msg.rotated90'));}
 catch(e){message(t('msg.rotateRefused',{msg:errText(e)}),true);}
});
$('remove-furniture').addEventListener('click',()=>{
 if(!selected||!confirm(t('confirm.remove')))return;
 try{if(commit(C.remove(state,selected))){selected=null;render();message(t('msg.removed'));}}
 catch(e){message(errText(e),true);}
});
$('grid-visual').addEventListener('change',paint);
$('plan-view').addEventListener('pointermove',ev=>{
 if(!drag||ev.pointerId!==drag.pointerId||blocked)return;
 try{
  const p=coordinates(ev),obj=state.objects.find(o=>o.id===drag.id);if(!obj)return;
  let x=Math.round(drag.item.x+p.x-drag.start.x),y=Math.round(drag.item.y+p.y-drag.start.y);
  if($('snap-grid').checked){x=C.snap(x);y=C.snap(y);}
  if(x===obj.x&&y===obj.y)return;
  state=C.update(state,drag.id,{x,y});drag.moved=true;render();
 }catch(e){/* Keep last valid position rather than placing furniture outside walls or through an item. */}
});
function pointerEnd(ev){
 if(!drag||drag.pointerId!==ev.pointerId)return;
 const d=drag;drag=null;
 const svg=$('plan-view');if(svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);
 if(d.moved){const result=state;state=d.before;if(commit(result))message(t('msg.moved'));else render();}
}
$('plan-view').addEventListener('pointerup',pointerEnd);
$('plan-view').addEventListener('pointercancel',ev=>{
 if(!drag||drag.pointerId!==ev.pointerId)return;
 const before=drag.before;drag=null;state=before;render();
});
// The plan keeps physical axes (x to the right) in every language, so arrows are not mirrored in RTL.
$('plan-view').addEventListener('keydown',ev=>{
 if(!selected||blocked)return;
 const delta=ev.shiftKey?1:10,map={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};
 if(Object.hasOwn(map,ev.key)){
  ev.preventDefault();const d=map[ev.key],o=state.objects.find(x=>x.id===selected);
  try{if(commit(C.update(state,selected,{x:o.x+d[0],y:o.y+d[1]})))message(t('msg.keyMoved'));}
  catch(e){message(t('msg.moveRefused',{msg:errText(e)}),true);}
 }else if(ev.key.toLowerCase()==='r'){
  ev.preventDefault();try{if(commit(C.rotate(state,selected)))message(t('msg.rotated'));}
  catch(e){message(t('msg.rotateRefused',{msg:errText(e)}),true);}
 }
});
function download(name,data,mime){
 const url=URL.createObjectURL(new Blob([data],{type:mime})),a=mk('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
$('export-svg').addEventListener('click',()=>{
 if(blocked)return;
 try{
  const texts={title:t('svg.exportTitle'),desc:(r,n)=>t('svg.exportDesc',{w:cm(r.width),d:cm(r.depth),n}),label:display};
  download('roomsketch-plan.svg',C.svg(state,texts),'image/svg+xml;charset=utf-8');message(t('msg.svg'));
 }catch(e){message(errText(e),true);}
});
$('export-json').addEventListener('click',()=>{
 if(blocked)return;try{download('roomsketch-sauvegarde.json',JSON.stringify(C.validate(state),null,2),'application/json;charset=utf-8');message(t('msg.json'));}catch(e){message(errText(e),true);}
});
$('print-plan').addEventListener('click',()=>{if(!blocked)window.print();});
$('reset-plan').addEventListener('click',()=>{
 if(blocked||!confirm(t('confirm.reset')))return;
 if(commit(C.empty())){selected=null;render();message(t('msg.reset'));}
});
$('raw-export').addEventListener('click',()=>{
 try{download('roomsketch-copie-brute.txt',current()||'','text/plain;charset=utf-8');message(t('msg.raw'));}
 catch(e){message(errText(e),true);}
});
$('import-plan').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async ev=>{
 const file=ev.target.files[0];ev.target.value='';if(!file)return;
 const token=++revision;
 try{
  if(file.size>C.MAX_BYTES)throw Error('err.fileBig');
  const raw=await file.text();if(token!==revision)return;
  if(new TextEncoder().encode(raw).length>C.MAX_BYTES)throw Error('err.utf8Big');
  const next=C.validate(JSON.parse(raw));
  if(!confirm(t('confirm.import',{n:next.objects.length})))return;
  if(restore(next))message(t('msg.restored'));
 }catch(e){if(token===revision)message(t('msg.importRefused',{msg:errText(e)}),true);}
});
window.addEventListener('storage',ev=>{
 if(ev.key!==KEY)return;revision++;drag=null;
 try{state=ev.newValue?C.validate(JSON.parse(ev.newValue)):C.empty();baseline=ev.newValue;blocked=false;selected=null;render();message(t('msg.synced'));}
 catch(e){blocked=true;render();message(t('msg.externalBad'),true);}
});
try{const saved=current();if(saved){state=C.validate(JSON.parse(saved));baseline=saved;}}
catch(e){blocked=true;message(t('msg.corrupt'),true);}
render();
if(blocked)message(t('msg.corruptStart'),true);
// New language: re-translate generated texts without touching typed values or the plan.
L.onChange(()=>{message(blocked?t('msg.corruptStart'):'',blocked);stats();fields(true);paint();});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
