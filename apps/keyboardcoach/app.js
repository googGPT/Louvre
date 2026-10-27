/* KeyboardCoach browser adapter: no keystroke or practice-text persistence. */
(()=>{'use strict';
const C=window.KeyboardCore,by=id=>document.getElementById(id),stamp=()=>performance.now();
const round=(n,d=1)=>n.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});
const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
let session=null,recorded=false,composing=false,history={version:1,records:[]},historyBaseline=null,historyBlocked=false;
function feedback(s,error=false){const e=by('feedback');e.textContent=s;e.className=error?'feedback error':'feedback success';}
function selectedPassage(){return C.passage(by('passage').value);}
function setPassages(preserve){
 const list=C.PASSAGES.filter(p=>p.lang===by('language').value&&p.level===by('level').value);
 const old=preserve?by('passage').value:'';
 by('passage').replaceChildren();
 for(const item of list){const option=make('option',null,item.title);option.value=item.id;by('passage').append(option);}
 if(list.some(item=>item.id===old))by('passage').value=old;
}
function status(){return session?session.mode:'idle';}
function controls(){
 const mode=status(),active=mode==='ready'||mode==='running'||mode==='paused';
 for(const id of ['language','level','duration','passage'])by(id).disabled=active;
 by('typing').disabled=!active||mode==='paused';
 by('start').disabled=active;
 by('start').textContent=mode==='finished'?'Nouvelle séance':'Commencer';
 by('pause').disabled=!(mode==='running'||mode==='paused');
 by('pause').textContent=mode==='paused'?'Reprendre':'Pause';
 by('restart').disabled=false;
 const labels={idle:'À préparer',ready:'Prêt à saisir',running:'En cours',paused:'En pause',finished:'Terminé'};
 by('session-state').textContent=labels[mode];
 by('session-state').dataset.mode=mode;
}
function target(){
 const paragraph=by('target');paragraph.replaceChildren();
 const exercise=session?C.passage(session.id):selectedPassage();
 by('passage-title').textContent=exercise.title;
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
 by('time-left').textContent=round((stats?stats.remainingMs:duration*1000)/1000,1)+' s';
 by('gross-wpm').textContent=round(stats?.rawWpm||0,1);
 by('net-wpm').textContent=round(stats?.netWpm||0,1);
 by('accuracy').textContent=round(stats?.accuracy||0,2)+' %';
 by('errors').textContent=String(stats?.errors||0);
 by('completion').textContent=round(stats?.progress||0,2)+' %';
 const pct=stats?.progress||0;
 by('progress-fill').style.width=pct+'%';
 by('progress').setAttribute('aria-valuenow',String(Math.round(pct)));
 controls();target();
}
function begin(){
 session=C.create(by('passage').value,Number(by('duration').value));recorded=false;composing=false;
 by('typing').value='';by('finish-summary').hidden=true;
 display();by('typing').focus({preventScroll:true});
 feedback('Tapez le texte. Le chronomètre démarre avec la première saisie.');
}
function abandon(){session=null;recorded=false;composing=false;by('typing').value='';by('finish-summary').hidden=true;display();}
function endOnce(){
 if(!session||session.mode!=='finished'||recorded)return;
 recorded=true;
 const m=C.metrics(session,stamp()),result=by('finish-summary');
 result.hidden=false;result.replaceChildren();
 result.append(make('strong',null,'Séance terminée · '+round(m.netWpm,1)+' mots/min corrigés'),
  make('p',null,m.correct+' caractères corrects sur '+m.typed+' saisis · '+round(m.accuracy,2)+' % de précision · '+round(m.elapsedMs/1000,1)+' s actives.'));
 by('typing').disabled=true;
 feedback(m.remaining===0?'Texte intégral saisi. Vérifiez la précision et les erreurs affichées.':'Temps écoulé ou séance terminée. Lancez un nouveau test pour progresser.');
 if(by('save-history').checked&&!historyBlocked){
  try{
   const record=C.record(session,stamp(),Date.now());
   const actual=localStorage.getItem(C.HISTORY_KEY);
   if(actual!==historyBaseline)throw Error('L’historique a changé dans un autre onglet ; aucune écriture risquée.');
   const next=C.appendHistory(history,record),encoded=JSON.stringify(next);
   localStorage.setItem(C.HISTORY_KEY,encoded);
   historyBaseline=encoded;history=next;drawHistory();
  }catch(e){feedback('Séance terminée mais historique non enregistré : '+e.message,true);}
 }
}
function onEntry(){
 if(composing||!session||!['ready','running'].includes(session.mode))return;
 const max=C.codepoints(C.passage(session.id).text).length;
 const actual=C.codepoints(by('typing').value);
 let trimmed=actual.slice(0,max).join('');
 if(actual.length>max){by('typing').value=trimmed;feedback('Texte intégral atteint ; les caractères supplémentaires sont ignorés.',true);}
 try{
  const next=C.input(session,trimmed,stamp());
  if(next===session&&session.mode==='running')return;
  session=next;display();endOnce();
 }catch(e){
  by('typing').value=session.typed;feedback('Saisie refusée : '+e.message,true);
 }
}
by('typing').addEventListener('input',onEntry);
by('typing').addEventListener('compositionstart',()=>{composing=true;});
by('typing').addEventListener('compositionend',()=>{composing=false;onEntry();});
by('typing').addEventListener('paste',event=>{event.preventDefault();feedback('Coller est désactivé pour mesurer une frappe réelle.',true);});
by('typing').addEventListener('drop',event=>{event.preventDefault();feedback('Glisser-déposer de texte désactivé pendant le test.',true);});
by('typing').addEventListener('beforeinput',event=>{
 if(['insertFromPaste','insertFromDrop','insertReplacementText'].includes(event.inputType)){
  event.preventDefault();feedback('Insertion automatique désactivée pendant le test.',true);
 }
});
by('start').addEventListener('click',begin);
by('restart').addEventListener('click',begin);
by('pause').addEventListener('click',()=>{
 if(!session)return;
 if(session.mode==='running'){session=C.pause(session,stamp());feedback('Chronomètre en pause. Cliquez sur « Reprendre » pour continuer.');}
 else if(session.mode==='paused'){session=C.resume(session,stamp());feedback('Séance reprise.');}
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
  session=C.pause(session,stamp());display();feedback('La page a été masquée : chronomètre automatiquement mis en pause. Reprenez manuellement.');
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
 if(historyBlocked){const row=make('tr');const cell=make('td',null,'Historique invalide : exportez les données brutes ou effacez-les volontairement.');cell.colSpan=5;row.append(cell);table.append(row);return;}
 if(!history.records.length){const row=make('tr');const cell=make('td',null,'Aucune séance sauvegardée.');cell.colSpan=5;row.append(cell);table.append(row);return;}
 for(const entry of [...history.records].reverse()){
  const row=make('tr');
  for(const text of [new Date(entry.at).toLocaleDateString('fr-FR'),C.passage(entry.id).title,
   round(entry.elapsedMs/1000,1)+' s',round(entry.netWpm,1),round(entry.accuracy,2)+' %'])row.append(make('td',null,text));
  table.append(row);
 }
}
function download(name,text,mime){
 const url=URL.createObjectURL(new Blob([text],{type:mime})),a=make('a');a.href=url;a.download=name;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
by('export-history').addEventListener('click',()=>{
 if(historyBlocked)return;
 try{download('keyboardcoach-resultats.csv',C.csv(history),'text/csv;charset=utf-8');feedback('Historique CSV téléchargé.');}
 catch(e){feedback('Export impossible : '+e.message,true);}
});
by('raw-history').addEventListener('click',()=>{
 try{download('keyboardcoach-donnees-brutes.txt',localStorage.getItem(C.HISTORY_KEY)||'','text/plain;charset=utf-8');feedback('Copie brute enregistrée.');}
 catch(e){feedback('Copie brute indisponible : '+e.message,true);}
});
by('clear-history').addEventListener('click',()=>{
 if(!confirm('Effacer définitivement les statistiques de frappe conservées sur cet appareil ?'))return;
 try{localStorage.removeItem(C.HISTORY_KEY);history={version:1,records:[]};historyBaseline=null;historyBlocked=false;drawHistory();feedback('Historique local effacé.');}
 catch(e){feedback('Effacement impossible : '+e.message,true);}
});
window.addEventListener('storage',e=>{
 if(e.key!==C.HISTORY_KEY)return;
 try{
  history=e.newValue?C.history(JSON.parse(e.newValue)):{version:1,records:[]};
  historyBaseline=e.newValue;historyBlocked=false;drawHistory();
 }catch(error){historyBlocked=true;by('save-history').checked=false;drawHistory();feedback('Historique modifié et illisible : sauvegarde désactivée.',true);}
});
setPassages(false);
try{
 historyBaseline=localStorage.getItem(C.HISTORY_KEY);
 if(historyBaseline)history=C.history(JSON.parse(historyBaseline));
}catch(e){historyBlocked=true;feedback('Historique corrompu : sauvegarde désactivée jusqu’à effacement.',true);}
drawHistory();display();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();