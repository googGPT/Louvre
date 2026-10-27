/* QuizCraft v2 — navigateur, sauvegardes et entraînement. Textes et formats dans LouvreI18n (messages.js). */
'use strict';
(()=>{
 const L=AppLogic,KEY='louvre-factory:quizcraft:v1';
 const I=window.LouvreI18n.init(window.LouvreMessages),t=I.t; // langue et traductions
 const $=id=>document.getElementById(id);
 const form=$('record-form'),status=$('status');
 let records=[],editing=null,readOnly=false,session=null,importToken=0;
 let lastStatus=null; // dernier message : { key, params, error } pour le retraduire si la langue change
 const node=(tag,cls,text)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
 };
 // Libellé affiché d'une valeur stockée (« facile », « oui »…) : les données gardent leurs valeurs v1.
 const choice=(field,value)=>t((field==='difficulty'?'diff.':'mastered.')+value);
 const pct=n=>I.number(n/100,{style:'percent'});
 // Erreur du cœur (« err.text|{"field":"question","max":1200} ») traduite, nom du champ compris.
 function errText(err){
  if(err instanceof SyntaxError)return t('err.json');
  const msg=err&&err.message?err.message:String(err),[key,json]=msg.split('|');
  let params;try{params=json?JSON.parse(json):undefined;}catch(e){params=undefined;}
  if(params&&params.field)params={...params,field:t('field.'+params.field)};
  if(params&&params.max!==undefined)params={...params,max:I.number(params.max)};
  return I.error(params?key+'|'+JSON.stringify(params):key);
 }
 // Message d'état : clé + paramètres ; « msgErr » est une erreur à traduire au moment de l'affichage.
 function tell(key,params={},error=false){lastStatus={key,params,error};showStatus();}
 function showStatus(){
  if(!lastStatus){status.textContent='';return;}
  const {key,params,error}=lastStatus,p={...params};
  if(p.msgErr){p.msg=errText(p.msgErr);delete p.msgErr;}
  status.textContent=key==='err'?p.msg:t(key,p);status.className=error?'status error':'status';
 }
 const fail=err=>tell('err',{msgErr:err},true);
 function download(filename,text,type){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
 }
 function save(next,{recover=false}={}){
  if(readOnly&&!recover){tell('status.readonlySave',{},true);return false;}
  try{
   const text=L.backup(next);
   localStorage.setItem(KEY,text);
   records=L.validateBackup(JSON.parse(text));
   if(recover){readOnly=false;$('warning').hidden=true;}
   return true;
  }catch(err){tell('status.saveFail',{msgErr:err},true);return false;}
 }
 function saveLabel(){$('save-button').textContent=t(editing?'btn.saveEdit':'btn.add');}
 function reset(){
  editing=null;form.reset();saveLabel();$('cancel-edit').hidden=true;
 }
 function edit(r){
  if(readOnly)return;
  editing=r.id;
  for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=r[f.key];
  saveLabel();
  $('cancel-edit').hidden=false;
  form.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function mark(r,mastered){
  if(readOnly)return false;
  const next=records.map(x=>x.id===r.id?{...x,mastered}:x);
  if(!save(next))return false;
  if(editing===r.id)form.elements.namedItem('mastered').value=mastered;
  render();tell(mastered==='oui'?'status.masteredYes':'status.masteredNo');
  return true;
 }
 function renderStats(){
  const result=L.compute(records,undefined,I.locale),sum=$('summary');sum.replaceChildren();
  for(const [key,value] of result.kpis){
   const box=node('div','stat');
   box.append(node('span','stat-label',t(key)),node('strong','stat-value',key==='kpi.progress'?pct(value):I.number(value)));sum.append(box);
  }
  const progress=$('theme-progress');progress.replaceChildren();
  if(!result.categories.length)progress.append(node('p','empty',t('empty.themes')));
  for(const g of result.categories){
   const box=node('div','theme-card'),top=node('div','theme-heading');
   top.append(node('strong',null,g.category),node('span',null,t('theme.count',{mastered:I.number(g.mastered),total:I.number(g.total),pct:pct(g.percent)})));
   const bar=node('progress');bar.max=100;bar.value=g.percent;bar.setAttribute('aria-label',t('aria.themeProgress',{name:g.category}));
   box.append(top,bar);progress.append(box);
  }
 }
 function currentFilter(){
  return {query:$('search').value,category:$('category-filter').value,mastered:$('mastery-filter').value,
   difficulty:$('difficulty-filter').value,order:$('sort').value,locale:I.locale};
 }
 const themes=()=>[...new Set(records.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,I.locale));
 function populateCategories(){
  const select=$('category-filter'),prior=select.value;
  const names=themes();
  select.replaceChildren();
  const all=node('option',null,t('quiz.allThemes'));all.value='all';select.append(all);
  for(const name of names){const opt=node('option',null,name);opt.value=name;select.append(opt);}
  select.value=names.includes(prior)?prior:'all';
 }
 function renderCards(){
  const list=$('items'),shown=L.filterRecords(records,currentFilter());
  list.replaceChildren();$('counter').textContent=t('lib.counter',{shown:I.number(shown.length),n:records.length});
  if(!shown.length){list.append(node('p','empty',t(records.length?'empty.filtered':'empty.bank')));return;}
  for(const r of shown){
   const card=node('article','item');
   const header=node('div','item-top'),intro=node('div','item-intro');
   intro.append(node('p','item-category',r.category),node('h3',null,r.question));
   const chip=node('span','chip '+(r.mastered==='oui'?'chip-success':'chip-pending'),t(r.mastered==='oui'?'chip.mastered':'chip.review'));
   header.append(intro,chip);
   const meta=node('p','meta',t('meta.difficulty',{level:choice('difficulty',r.difficulty)}));
   const answer=node('div','answer');answer.hidden=true;
   answer.append(node('span','answer-heading',t('field.answer')),node('p',null,r.answer));
   const actions=node('div','item-actions');
   function button(text,style,click,disabled=false){
    const b=node('button',style,text);b.type='button';b.disabled=disabled;b.addEventListener('click',click);actions.append(b);return b;
   }
   const reveal=button(t('btn.reveal'),'outline small',()=>{
    answer.hidden=!answer.hidden;reveal.textContent=t(answer.hidden?'btn.reveal':'btn.hide');
    reveal.setAttribute('aria-expanded',String(!answer.hidden));
   });
   reveal.setAttribute('aria-expanded','false');
   button(t('btn.know'),'outline small',()=>mark(r,'oui'),readOnly||r.mastered==='oui');
   button(t('btn.rework'),'outline small',()=>mark(r,'non'),readOnly||r.mastered==='non');
   button(t('btn.edit'),'outline small',()=>edit(r),readOnly);
   button(t('btn.delete'),'danger small',()=>{
    if(!confirm(t('confirm.delete')))return;
    if(save(records.filter(x=>x.id!==r.id))){if(editing===r.id)reset();render();tell('status.deleted');}
   },readOnly);
   card.append(header,meta,answer,actions);list.append(card);
  }
 }
 function render(){populateCategories();renderQuizCategories();renderStats();renderCards();$('start-quiz').disabled=!records.length;}
 // Libellés du formulaire et des choix (retraduits sans toucher aux valeurs saisies).
 function labelForm(){
  for(const f of L.SPEC.fields){
   const field=form.elements.namedItem(f.key);
   field.closest('label').querySelector('span').textContent=t('field.'+f.key);
   if(f.type==='select')for(const opt of field.options)opt.textContent=choice(f.key,opt.value);
  }
  for(const opt of $('quiz-count').options)opt.textContent=t('quiz.max',{n:I.number(Number(opt.value))});
  saveLabel();
 }
 function initForm(){
  const fields=$('fields');
  for(const f of L.SPEC.fields){
   const wrap=node('label','field');
   wrap.append(node('span',null,''));
   let field;
   if(f.type==='select'){
    field=node('select');
    for(const value of f.options){const opt=node('option',null,value);opt.value=value;field.append(opt);}
   }else{
    field=node(f.key==='answer'?'textarea':'input');
    if(f.key!=='answer')field.type='text';
    field.maxLength=f.key==='category'?160:1200;
    if(f.key==='answer')field.rows=3;
   }
   field.name=f.key;field.required=true;field.autocomplete='off';wrap.append(field);fields.append(wrap);
  }
  reset();labelForm();
  form.addEventListener('submit',event=>{
   event.preventDefault();
   if(readOnly){tell('status.readonlySubmit',{},true);return;}
   try{
    const raw={id:editing||crypto.randomUUID().replaceAll('-','').slice(0,24)};
    for(const f of L.SPEC.fields)raw[f.key]=form.elements.namedItem(f.key).value;
    const valid=L.normalizeRecord(raw);
    const next=editing?records.map(r=>r.id===editing?valid:r):[...records,valid];
    if(next.length>L.MAX)throw Error('err.limit|'+JSON.stringify({max:L.MAX}));
    if(save(next)){reset();render();tell('status.saved');}
   }catch(err){fail(err);}
  });
  $('cancel-edit').addEventListener('click',reset);
 }
 function sessionRender(){
  const box=$('quiz-body'),label=$('quiz-status');box.replaceChildren();
  if(!session){$('quiz-panel').hidden=true;return;}
  $('quiz-panel').hidden=false;
  if(session.cursor>=session.deck.length){
   label.textContent=t('quiz.done');
   box.append(node('h3',null,t('quiz.result',{correct:I.number(session.correct),total:I.number(session.deck.length)})),
    node('p','muted',t('quiz.selfNote')));
   const again=node('button','secondary',t('btn.again'));again.type='button';again.addEventListener('click',startQuiz);box.append(again);
   return;
  }
  const current=session.deck[session.cursor];
  label.textContent=t('quiz.progress',{i:I.number(session.cursor+1),total:I.number(session.deck.length),n:session.correct});
  box.append(node('p','item-category',current.category+' · '+choice('difficulty',current.difficulty)),node('h3',null,current.question));
  if(!session.revealed){
   const b=node('button','outline',t('btn.show'));
   b.type='button';b.addEventListener('click',()=>{session.revealed=true;sessionRender();});box.append(b);
  }else{
   const answer=node('div','answer');answer.append(node('span','answer-heading',t('field.answer')),node('p',null,current.answer));box.append(answer);
   const actions=node('div','quiz-actions');
   for(const [caption,correct] of [['btn.right',true],['btn.wrong',false]]){
    const b=node('button',correct?'primary':'outline',t(caption));b.type='button';
    b.disabled=readOnly;
    b.addEventListener('click',()=>{
     // On n'avance pas si la mise à jour persistante a échoué.
     if(!mark(current,correct?'oui':'non'))return;
     if(correct)session.correct++;
     session.cursor++;session.revealed=false;sessionRender();
    });actions.append(b);
   }
   box.append(actions);
  }
 }
 function startQuiz(){
  try{
   const pool=L.filterRecords(records,{category:$('quiz-category').value,
    mastered:$('quiz-unmastered').checked?'non':'all',locale:I.locale});
   if(!pool.length){tell('status.noPool',{},true);return;}
   const deck=L.makeDeck(pool,{count:Number($('quiz-count').value)});
   session={deck,cursor:0,correct:0,revealed:false};sessionRender();
   $('quiz-panel').scrollIntoView({behavior:'smooth',block:'start'});
   tell('status.started',{n:deck.length});
  }catch(err){fail(err);}
 }
 function renderQuizCategories(){
  const select=$('quiz-category'),old=select.value;
  select.replaceChildren();const any=node('option',null,t('quiz.allThemes'));any.value='all';select.append(any);
  for(const cat of themes()){
   const o=node('option',null,cat);o.value=cat;select.append(o);
  }
  select.value=[...select.options].some(x=>x.value===old)?old:'all';
 }
 $('start-quiz').addEventListener('click',startQuiz);
 $('close-quiz').addEventListener('click',()=>{session=null;sessionRender();});
 for(const id of ['search','category-filter','mastery-filter','difficulty-filter','sort']){
  $(id).addEventListener(id==='search'?'input':'change',renderCards);
 }
 $('export').addEventListener('click',()=>{
  try{download('quizcraft-sauvegarde.json',L.backup(records),'application/json');tell('status.exported');}
  catch(err){fail(err);}
 });
 $('export-csv').addEventListener('click',()=>{
  try{
   const header=[t('field.question'),t('csv.answer'),t('field.category'),t('field.difficulty'),t('csv.mastered')];
   download('quizcraft-questions.csv',L.toCSV(records,{header,label:choice}),'text/csv;charset=utf-8');tell('status.csv');
  }catch(err){fail(err);}
 });
 $('export-raw').addEventListener('click',()=>{
  try{download('quizcraft-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');tell('status.raw');}
  catch(err){tell('status.rawFail',{msgErr:err},true);}
 });
 $('import').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  const token=++importToken;
  try{
   const before=localStorage.getItem(KEY);
   if(file.size>L.STORAGE_LIMIT)throw Error('err.fileBig');
   const restored=L.validateBackup(JSON.parse(await file.text()));
   if(token!==importToken)return; // Ignore a superseded asynchronous file read.
   if(localStorage.getItem(KEY)!==before)throw Error('err.changedRead');
   if(!confirm(t('confirm.import',{a:I.number(records.length),b:I.number(restored.length)})))return;
   if(token!==importToken||localStorage.getItem(KEY)!==before)throw Error('err.changedImport');
   if(save(restored,{recover:true})){
    session=null;sessionRender();reset();
    $('search').value='';$('category-filter').value='all';$('mastery-filter').value='all';$('difficulty-filter').value='all';
    render();renderQuizCategories();tell('status.restored');
   }
  }catch(err){if(token===importToken)tell('status.importRefused',{msgErr:err},true);}
 });
 try{
  const text=localStorage.getItem(KEY);
  if(text)records=L.validateBackup(JSON.parse(text));
 }catch(err){
  readOnly=true;$('warning').hidden=false;
  tell('status.corrupt',{},true);
 }
 initForm();render();renderQuizCategories();
 // Changement de langue : libellés, cartes, session et message réaffichés ; saisies et données intactes.
 I.onChange(()=>{labelForm();render();sessionRender();showStatus();});
 if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
