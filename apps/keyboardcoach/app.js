/* KeyboardCoach browser adapter: no keystroke or practice-text persistence. */
(()=>{'use strict';
const C=window.KeyboardCore,by=id=>document.getElementById(id),stamp=()=>performance.now();
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue de l'interface, traductions et formats
const round=(n,d=1)=>L.number(n,{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=(n)=>L.number(n/100,{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2}); // 12,5 -> « 12,50 % » / « 12.50% »
const secs=(n)=>t('unit.s',{v:round(n,1)});
const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
let session=null,recorded=false,composing=false,history={version:1,records:[]},historyBaseline=null,historyBlocked=false;
// Message d'état mémorisé sous forme de fonction : il est retraduit si la langue change.
let lastFeedback=null;
function feedback(text,error=false){lastFeedback={text,error};const e=by('feedback');e.textContent=typeof text==='function'?text():text;e.className=error===null?'feedback':error?'feedback error':'feedback success';}
const say=(key,params,error=false)=>feedback(()=>t(key,params),error);
function selectedPassage(){return C.passage(by('passage').value);}
function setPassages(preserve){
 const list=C.PASSAGES.filter(p=>p.lang===by('language').value&&p.level===by('level').value);
 const old=preserve?by('passage').value:'';
 by('passage').replaceChildren();
 for(const item of list){const option=make('option',null,item.title);option.value=item.id;option.lang=item.lang;by('passage').append(option);}
 if(list.some(item=>item.id===old))by('passage').value=old;
}
function status(){return session?session.mode:'idle';}
function controls(){
 const mode=status(),active=mode==='ready'||mode==='running'||mode==='paused';
 for(const id of ['language','level','duration','passage'])by(id).disabled=active;
 by('typing').disabled=!active||mode==='paused';
 by('start').disabled=active;
 by('start').textContent=mode==='finished'?t('btn.newSession'):t('btn.start');
 by('pause').disabled=!(mode==='running'||mode==='paused');
 by('pause').textContent=mode==='paused'?t('btn.resume'):t('btn.pause');
 by('restart').disabled=false;
 by('session-state').textContent=t('state.'+mode);
 by('session-state').dataset.mode=mode;
}
function target(){
 const paragraph=by('target');paragraph.replaceChildren();
 const exercise=session?C.passage(session.id):selectedPassage();
 by('passage-title').textContent=exercise.title;
 // Le texte d'exercice garde sa propre langue et son sens d'écriture, quelle que soit la langue de l'interface.
 const dir=exercise.lang==='ar'?'rtl':'ltr';
 for(const node of [paragraph,by('passage-title'),by('typing')]){node.lang=exercise.lang;node.dir=dir;}
 paragraph.setAttribute('aria-label',exercise.text);
 const chars=C.codepoints(exercise.text),typed=C.codepoints(session?.typed||'');
 for(let i=0;i<chars.length;i++){
  const span=make('span',i>=typed.length?'pending':typed[i]===chars[i]?'correct':'incorrect',chars[i]);
  span.setAttribute('aria-hidden','true');
  if(i===typed.length&&session?.mode!=='finished')span.classList.add('cursor');
  paragraph.append(span);
 }
}
function display(){
 const s=session;
 const stats=s?C.metrics(s,stamp()):null;
 const duration=Number(by('duration').value);
 by('time-left').textContent=secs((stats?stats.remainingMs:duration*1000)/1000);
 by('gross-wpm').textContent=round(stats?.rawWpm||0,1);
 by('net-wpm').textContent=round(stats?.netWpm||0,1);
 by('accuracy').textContent=pct(stats?.accuracy||0);
 by('errors').textContent=L.number(stats?.errors||0);
 by('completion').textContent=pct(stats?.progress||0);
 const done=stats?.progress||0;
 by('progress-fill').style.width=done+'%';
 by('progress').setAttribute('aria-valuenow',String(Math.round(done)));
 controls();target();
}
function begin(){
 session=C.create(by('passage').value,Number(by('duration').value));recorded=false;composing=false;
 by('typing').value='';by('finish-summary').hidden=true;
 display();by('typing').focus({preventScroll:true});
 say('fb.go');
}
function abandon(){session=null;recorded=false;composing=false;by('typing').value='';by('finish-summary').hidden=true;display();}
function endOnce(){
 if(!session||session.mode!=='finished'||recorded)return;
 recorded=true;
 const m=C.metrics(session,stamp());
 summary=m;drawSummary();
 by('typing').disabled=true;
 say(m.remaining===0?'fb.full':'fb.timeUp');
 if(by('save-history').checked&&!historyBlocked){
  try{
   const record=C.record(session,stamp(),Date.now());
   const actual=localStorage.getItem(C.HISTORY_KEY);
   if(actual!==historyBaseline)throw Error('err.otherTab');
   const next=C.appendHistory(history,record),encoded=JSON.stringify(next);
   localStorage.setItem(C.HISTORY_KEY,encoded);
   historyBaseline=encoded;history=next;drawHistory();
  }catch(e){feedback(()=>t('fb.histFail',{msg:L.error(e)}),true);}
 }
}
function onEntry(){
 if(composing||!session||!['ready','running'].includes(session.mode))return;
 const max=C.codepoints(C.passage(session.id).text).length;
 const actual=C.codepoints(by('typing').value);
 let trimmed=actual.slice(0,max).join('');
 if(actual.length>max){by('typing').value=trimmed;say('fb.overflow',null,true);}
 try{
  const next=C.input(session,trimmed,stamp());
  if(next===session&&session.mode==='running')return;
  session=next;display();endOnce();
 }catch(e){
  by('typing').value=session.typed;feedback(()=>t('fb.refused',{msg:L.error(e)}),true);
 }
}
by('typing').addEventListener('input',onEntry);
by('typing').addEventListener('compositionstart',()=>{composing=true;});
by('typing').addEventListener('compositionend',()=>{composing=false;onEntry();});
by('typing').addEventListener('paste',event=>{event.preventDefault();say('fb.paste',null,true);});
by('typing').addEventListener('drop',event=>{event.preventDefault();say('fb.drop',null,true);});
by('typing').addEventListener('beforeinput',event=>{
 if(['insertFromPaste','insertFromDrop','insertReplacementText'].includes(event.inputType)){
  event.preventDefault();say('fb.insert',null,true);
 }
});
by('start').addEventListener('click',begin);
by('restart').addEventListener('click',begin);
by('pause').addEventListener('click',()=>{
 if(!session)return;
 if(session.mode==='running'){session=C.pause(session,stamp());say('fb.paused');}
 else if(session.mode==='paused'){session=C.resume(session,stamp());say('fb.resumed');}
 display();if(session.mode==='running')by('typing').focus({preventScroll:true});
});
by('another').addEventListener('click',()=>{
 const ids=Array.from(by('passage').options).map(x=>x.value),at=ids.indexOf(by('passage').value);
 if(!by('passage').disabled)by('passage').value=ids[(at+1)%ids.length];
 else{
  abandon();by('passage').value=ids[(at+1)%ids.length];
 }
 begin();
});
for(const id of ['language','level'])by(id).addEventListener('change',()=>{
 abandon();setPassages(false);display();
});
for(const id of ['duration','passage'])by(id).addEventListener('change',()=>{abandon();});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&session?.mode==='running'){
  session=C.pause(session,stamp());display();say('fb.hidden');
 }
});
window.setInterval(()=>{
 if(session?.mode==='running'){
  session=C.tick(session,stamp());
  display();endOnce();
 }
},100);
function drawHistory(){
 const table=by('history-rows');table.replaceChildren();
 by('history-warning').hidden=!historyBlocked;
 by('save-history').disabled=historyBlocked;
 by('raw-history').hidden=!historyBlocked;
 by('export-history').disabled=historyBlocked||history.records.length===0;
 by('clear-history').disabled=!historyBlocked&&history.records.length===0;
 if(historyBlocked){const row=make('tr');const cell=make('td',null,t('hist.invalid'));cell.colSpan=5;row.append(cell);table.append(row);return;}
 if(!history.records.length){const row=make('tr');const cell=make('td',null,t('hist.empty'));cell.colSpan=5;row.append(cell);table.append(row);return;}
 for(const entry of [...history.records].reverse()){
  const row=make('tr');
  const d=new Date(entry.at),day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const ex=C.passage(entry.id);
  for(const text of [L.date(day,{day:'numeric',month:'numeric',year:'numeric'}),ex.title,
   secs(entry.elapsedMs/1000),round(entry.netWpm,1),pct(entry.accuracy)]){const cell=make('td',null,text);if(text===ex.title){cell.lang=ex.lang;cell.dir='auto';}row.append(cell);}
  table.append(row);
 }
}
function download(name,text,mime){
 const url=URL.createObjectURL(new Blob([text],{type:mime})),a=make('a');a.href=url;a.download=name;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
by('export-history').addEventListener('click',()=>{
 if(historyBlocked)return;
 try{download('keyboardcoach-resultats.csv',C.csv(history,t('csv.header')),'text/csv;charset=utf-8');say('fb.csv');}
 catch(e){feedback(()=>t('fb.exportFail',{msg:L.error(e)}),true);}
});
by('raw-history').addEventListener('click',()=>{
 try{download('keyboardcoach-donnees-brutes.txt',localStorage.getItem(C.HISTORY_KEY)||'','text/plain;charset=utf-8');say('fb.raw');}
 catch(e){feedback(()=>t('fb.rawFail',{msg:L.error(e)}),true);}
});
by('clear-history').addEventListener('click',()=>{
 if(!confirm(t('confirm.clear')))return;
 try{localStorage.removeItem(C.HISTORY_KEY);history={version:1,records:[]};historyBaseline=null;historyBlocked=false;drawHistory();say('fb.cleared');}
 catch(e){feedback(()=>t('fb.clearFail',{msg:L.error(e)}),true);}
});
window.addEventListener('storage',e=>{
 if(e.key!==C.HISTORY_KEY)return;
 try{
  history=e.newValue?C.history(JSON.parse(e.newValue)):{version:1,records:[]};
  historyBaseline=e.newValue;historyBlocked=false;drawHistory();
 }catch(error){historyBlocked=true;by('save-history').checked=false;drawHistory();say('fb.histChanged',null,true);}
});
// Menus traduits : durées (pluriel), langues des textes (noms dans leur propre langue).
function staticTexts(){
 for(const o of by('duration').options)o.textContent=t('dur',{n:Number(o.value)});
 const sel=by('language'),keep=sel.value;
 sel.replaceChildren(...C.LANGS.map(code=>{const o=make('option',null,L.LANGS[code].name);o.value=code;o.lang=code;return o;}));
 if(keep)sel.value=keep;
}
let summary=null; // dernier bilan affiché
function drawSummary(){
 const result=by('finish-summary');
 if(!summary||result.hidden&&!recorded)return;
 const m=summary;result.hidden=false;result.replaceChildren();
 result.append(make('strong',null,t('sum.title',{wpm:round(m.netWpm,1)})),
  make('p',null,t('sum.text',{correct:L.number(m.correct),typed:L.number(m.typed),acc:pct(m.accuracy),secs:round(m.elapsedMs/1000,1)})));
}
staticTexts();
by('language').value=C.LANGS.includes(L.lang)?L.lang:'fr'; // premier texte proposé dans la langue de l'interface
setPassages(false);
feedback(()=>t('fb.intro'),null); // consigne initiale (style neutre)
// Changement de langue de l'interface : tout est retraduit ; la séance, la saisie et le texte choisi sont conservés.
L.onChange(()=>{staticTexts();display();drawHistory();if(!by('finish-summary').hidden)drawSummary();if(lastFeedback)feedback(lastFeedback.text,lastFeedback.error);});
try{
 historyBaseline=localStorage.getItem(C.HISTORY_KEY);
 if(historyBaseline)history=C.history(JSON.parse(historyBaseline));
}catch(e){historyBlocked=true;say('fb.histCorrupt',null,true);}
drawHistory();display();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();