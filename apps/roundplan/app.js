/* RoundPlan v2 UI and drift-resistant stopwatch, without third-party libraries. Textes et formats : LouvreI18n (messages.js). */
'use strict';
(()=>{
const L=AppLogic, KEY='louvre-factory:roundplan:v1', $=id=>document.getElementById(id);
const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue et traductions
let records=[], editingId=null, readOnly=false, program=L.buildTimeline([]);
let lastMessage=null; // { key, params, error } : retraduit si la langue change
const timer={running:false,elapsed:0,startedAt:0,interval:null,phaseIndex:-1,finished:false,ctx:null};
const form=$('record-form'),status=$('status');
const element=(tag,className='',txt)=>{const e=document.createElement(tag);if(className)e.className=className;if(txt!==undefined)e.textContent=String(txt);return e;};
const num=n=>I.number(n);
// Erreur du cœur (« err.int|{"field":"work","low":1,"high":3600} ») traduite, nom du champ compris.
function errText(err){
 if(err instanceof SyntaxError)return t('err.json');
 const msg=err&&err.message?err.message:String(err),[key,json]=msg.split('|');
 let params;try{params=json?JSON.parse(json):undefined;}catch(e){params=undefined;}
 if(params&&params.field)params={...params,field:t('short.'+params.field)};
 return I.error(params?key+'|'+JSON.stringify(params):key);
}
function message(key,params={},error=false){lastMessage={key,params,error};showMessage();}
function showMessage(){
 if(!lastMessage){status.textContent='';return;}
 const {key,params,error}=lastMessage,p={...params};
 if(p.msgErr){p.msg=errText(p.msgErr);delete p.msgErr;}
 status.textContent=key==='err'?p.msg:t(key,p);status.className=error?'status error':'status';
}
const fail=err=>message('err',{msgErr:err},true);
function download(filename,body,type){const url=URL.createObjectURL(new Blob([body],{type}));const a=element('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function load(){try{const raw=localStorage.getItem(KEY);records=raw?L.validateBackup(JSON.parse(raw)):[];}catch(e){readOnly=true;records=[];$('storage-warning').hidden=false;message('status.loadFail',{},true);}}
function save(next,restore=false){
 if(readOnly&&!restore){message('status.protected',{},true);return false;}
 try{const serialized=L.backup(next);localStorage.setItem(KEY,serialized);records=L.validateBackup(JSON.parse(serialized));readOnly=false;$('storage-warning').hidden=true;resetTimer(false);render();return true;}
 catch(e){message('status.saveFail',{msgErr:e},true);return false;}
}
function buildFields(){const fields=$('fields');for(const f of L.SPEC.fields){const lab=element('label','field'),name=element('span','',''),input=element('input');input.name=f.key;input.type=f.type;input.required=true;input.autocomplete='off';if(f.type==='number'){input.step='1';input.min=f.key==='rest'?'0':'1';input.max=f.key==='work'?'3600':f.key==='rest'?'1800':'100';input.value=String(f.sample);}else{input.maxLength='120';}lab.append(name,input);fields.append(lab);}form.addEventListener('input',preview);labelForm();}
// Libellés du formulaire (retraduits sans toucher aux valeurs saisies).
function labelForm(){for(const f of L.SPEC.fields)form.elements.namedItem(f.key).closest('label').querySelector('span').textContent=t('field.'+f.key);$('form-heading').textContent=t(editingId?'form.edit':'form.add');$('save-button').textContent=editingId?t('btn.saveChanges'):'+ '+t('btn.addEx');preview();}
function formRecord(){const o={id:editingId||crypto.randomUUID().replaceAll('-','').slice(0,24)};for(const f of L.SPEC.fields){const input=form.elements.namedItem(f.key);o[f.key]=f.type==='number'?Number(input.value):input.value;}return L.normalizeRecord(o);}
function preview(){try{const row={id:'preview00'};for(const f of L.SPEC.fields){const input=form.elements.namedItem(f.key);row[f.key]=f.type==='number'?Number(input?.value):input?.value;}const p=L.buildTimeline([row]);$('preview').textContent=t('preview.text',{total:L.formatSeconds(p.totalSeconds),work:L.formatSeconds(p.workSeconds),rest:L.formatSeconds(p.restSeconds)});}catch(e){$('preview').textContent=t('preview.invalid');}}
function resetForm(){editingId=null;form.reset();for(const f of L.SPEC.fields){if(f.type==='number')form.elements.namedItem(f.key).value=String(f.sample);}$('cancel-edit').hidden=true;labelForm();}
function edit(row){editingId=row.id;for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=String(row[f.key]);$('cancel-edit').hidden=false;labelForm();form.scrollIntoView({behavior:'smooth',block:'start'});}
function kpiValue(value,unit){return unit==='min'?t('unit.min',{n:num(value)}):unit==='clock'?L.formatSeconds(value):num(value);}
function render(){program=L.buildTimeline(records);const computed=L.compute(records);const summary=$('summary');summary.replaceChildren();for(const [key,value,unit] of computed.kpis){const card=element('div','stat');card.append(element('span','',t(key)),element('strong','',kpiValue(value,unit)));summary.append(card);}const list=$('insights');list.replaceChildren();for(const r of records)list.append(element('li','',t('insight.row',{name:r.exercise,rounds:num(r.rounds),work:num(r.work),rest:num(r.rest)})));if(!records.length)list.append(element('li','',t('insight.empty')));
 const q=$('search').value.trim().toLocaleLowerCase(I.locale),items=$('items');items.replaceChildren();const visible=records.filter(r=>r.exercise.toLocaleLowerCase(I.locale).includes(q));$('counter').textContent=num(visible.length);
 visible.forEach(r=>{const idx=records.findIndex(x=>x.id===r.id);const card=element('article','item');const head=element('div','item-head');head.append(element('h3','',r.exercise),element('span','item-index','#'+num(idx+1)));card.append(head,element('p','item-meta',t('item.meta',{n:r.rounds,work:num(r.work),rest:num(r.rest),total:L.formatSeconds(r.rounds*r.work+(r.rounds-1)*r.rest)})));const bar=element('div','item-actions');
 const btn=(txt,handler,cls='')=>{const b=element('button',cls,txt);b.type='button';b.addEventListener('click',handler);bar.append(b);return b;};btn(t('btn.edit'),()=>edit(r));btn('↑ '+t('btn.up'),()=>move(idx,-1)).disabled=idx===0;btn('↓ '+t('btn.down'),()=>move(idx,1)).disabled=idx===records.length-1;btn(t('btn.delete'),()=>{if(confirm(t('confirm.delete',{name:r.exercise}))&&save(records.filter(x=>x.id!==r.id))){resetForm();message('status.deleted');}},'danger');card.append(bar);items.append(card);});refreshClock();}
function move(i,delta){const next=records.slice(),j=i+delta;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];if(save(next))message('status.moved');}
function elapsed(){return Math.min(program.totalSeconds,timer.elapsed+(timer.running?(performance.now()-timer.startedAt)/1000:0));}
function updateControls(){const atEnd=timer.finished;const has=program.phases.length>0;$('timer-start').disabled=!has||timer.running||atEnd;$('timer-start').textContent='▶ '+t(timer.elapsed>0?'btn.resume':'btn.start');$('timer-pause').disabled=!timer.running;$('timer-skip').disabled=!has||atEnd||(!timer.running&&timer.elapsed===0);$('timer-reset').disabled=!has||(!timer.running&&!timer.elapsed&&!atEnd);$('timer-state').textContent=t(atEnd?'state.done':timer.running?'state.running':timer.elapsed>0?'state.paused':'state.ready');}
function sound(){if(!$('timer-sound').checked)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;if(!timer.ctx)timer.ctx=new Audio();const ctx=timer.ctx;ctx.resume?.().catch(()=>{});const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=880;gain.gain.value=.08;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.16);}catch(e){/* Audio is optional. */}}
function announce(loc){$('phase-announcement').textContent=loc.finished?t('announce.done'):t('announce.phase',{phase:t('label.'+loc.phase.kind),exercise:loc.phase.exercise,round:num(loc.phase.round),rounds:num(loc.phase.rounds)});}
function refreshClock(){const now=elapsed(),loc=L.locatePhase(program,now);if(loc.index!==timer.phaseIndex){if(timer.phaseIndex!==-1&&timer.running)sound();timer.phaseIndex=loc.index;announce(loc);}
 if(loc.finished&&program.phases.length&&!timer.finished){timer.elapsed=program.totalSeconds;timer.running=false;clearInterval(timer.interval);timer.interval=null;timer.finished=true;message('status.finished');}
 $('phase-type').textContent=t(loc.finished?(program.phases.length?'phase.finished':'phase.ready'):loc.phase.kind==='work'?'phase.work':'phase.rest');$('phase-exercise').textContent=loc.finished?t(program.phases.length?'phase.doneText':'phase.empty'):loc.phase.exercise;$('phase-round').textContent=loc.finished?'':t('phase.round',{round:num(loc.phase.round),rounds:num(loc.phase.rounds)});$('timer-remaining').textContent=L.formatSeconds(loc.remaining);const pct=program.totalSeconds?Math.round(now/program.totalSeconds*100):0;$('total-progress').value=pct;$('progress-text').textContent=I.number(pct/100,{style:'percent'});updateControls();}
function tick(){refreshClock();}
function startTimer(){if(!program.phases.length)return;const p=L.buildTimeline(records);if(p.totalSeconds>0&&!timer.running){program=p;if(timer.finished){timer.elapsed=0;timer.finished=false;}timer.startedAt=performance.now();timer.running=true;timer.phaseIndex=-1;if(timer.interval)clearInterval(timer.interval);timer.interval=setInterval(tick,120);if($('timer-sound').checked){try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio&&!timer.ctx)timer.ctx=new Audio();timer.ctx?.resume?.().catch(()=>{});}catch(e){}}tick();}}
function pauseTimer(){if(!timer.running)return;timer.elapsed=elapsed();timer.running=false;clearInterval(timer.interval);timer.interval=null;refreshClock();}
function resetTimer(showMessage=true){timer.elapsed=0;timer.startedAt=0;timer.running=false;timer.finished=false;timer.phaseIndex=-1;clearInterval(timer.interval);timer.interval=null;if(showMessage)message('status.reset');refreshClock();}
function skipPhase(){if(!program.phases.length)return;const state=L.locatePhase(program,elapsed());if(state.finished)return;timer.elapsed=state.phase.end;if(timer.running)timer.startedAt=performance.now();refreshClock();}
function escapeCSV(value){const str=String(value);return '"'+(/^[\s]*[=+@\-\t\r]/.test(str)?"'":'')+str.replaceAll('"','""')+'"';}
function exportCSV(){try{const p=L.buildTimeline(records),cols=['csv.exercise','csv.round','csv.type','csv.start','csv.duration','csv.end'].map(k=>t(k));const lines=[cols,...p.phases.map(x=>[x.exercise,x.round,t('label.'+x.kind),x.start,x.duration,x.end])];download('roundplan-programme.csv','﻿'+lines.map(row=>row.map(escapeCSV).join(';')).join('\r\n'),'text/csv;charset=utf-8');message('status.csv');}catch(e){fail(e);}}
function init(){buildFields();load();form.addEventListener('submit',e=>{e.preventDefault();if(readOnly){message('status.protectedSubmit',{},true);return;}try{const r=formRecord();const next=editingId?records.map(x=>x.id===editingId?r:x):[...records,r];if(next.length>L.MAX)throw Error('err.max|'+JSON.stringify({max:L.MAX}));L.buildTimeline(next);if(save(next)){resetForm();message('status.saved');}}catch(err){fail(err);}});$('cancel-edit').addEventListener('click',resetForm);
 document.querySelectorAll('.preset').forEach(b=>b.addEventListener('click',()=>{const preset=L.presets[Number(b.dataset.preset)];editingId=null;resetForm();const name=t('preset.'+preset.key);for(const field of L.SPEC.fields)form.elements.namedItem(field.key).value=field.key==='exercise'?name:preset[field.key];preview();message('status.preset',{name});form.scrollIntoView({behavior:'smooth',block:'start'});}));
 $('timer-start').addEventListener('click',startTimer);$('timer-pause').addEventListener('click',pauseTimer);$('timer-reset').addEventListener('click',()=>resetTimer());$('timer-skip').addEventListener('click',skipPhase);window.addEventListener('focus',()=>{if(timer.running)refreshClock();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&timer.running)refreshClock();});
 $('search').addEventListener('input',render);$('export').addEventListener('click',()=>{try{download('roundplan-programme.json',L.backup(records),'application/json');message('status.exported');}catch(e){fail(e);}});
 $('export-csv').addEventListener('click',exportCSV);$('export-raw').addEventListener('click',()=>{try{download('roundplan-stockage-original.txt',localStorage.getItem(KEY)||'','text/plain');message('status.raw');}catch(e){fail(e);}});
 $('import').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');const parsed=L.validateBackup(JSON.parse(await file.text()));L.buildTimeline(parsed);if(!confirm(t('confirm.import',{a:num(records.length),b:num(parsed.length)})))return;const success=save(parsed,true);if(success){resetForm();message('status.restored');}}catch(err){message('status.importRefused',{msgErr:err},true);}});
 // Changement de langue : tout est réaffiché ; saisies, chronomètre et données restent intacts.
 I.onChange(()=>{labelForm();render();const loc=L.locatePhase(program,elapsed());announce(loc);showMessage();});
 render();if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{}));}
 document.addEventListener('DOMContentLoaded',init);
})();
