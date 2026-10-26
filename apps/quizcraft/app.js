/* QuizCraft v2 — navigateur, sauvegardes et entraînement. */
'use strict';
(()=>{
 const L=AppLogic,KEY='louvre-factory:quizcraft:v1';
 const $=id=>document.getElementById(id);
 const form=$('record-form'),status=$('status');
 let records=[],editing=null,readOnly=false,session=null;
 const node=(tag,cls,text)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
 };
 function tell(message,error=false){status.textContent=message;status.className=error?'status error':'status';}
 function download(filename,text,type){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
 }
 function save(next,{recover=false}={}){
  if(readOnly&&!recover){tell('Stockage illisible. Restaurez un JSON valide avant toute écriture.',true);return false;}
  try{
   const text=L.backup(next);
   localStorage.setItem(KEY,text);
   records=L.validateBackup(JSON.parse(text));
   if(recover){readOnly=false;$('warning').hidden=true;}
   return true;
  }catch(err){tell('Enregistrement impossible : '+err.message,true);return false;}
 }
 function reset(){
  editing=null;form.reset();$('save-button').textContent='Ajouter la question';$('cancel-edit').hidden=true;
 }
 function edit(r){
  if(readOnly)return;
  editing=r.id;
  for(const f of L.SPEC.fields)form.elements.namedItem(f.key).value=r[f.key];
  $('save-button').textContent='Enregistrer les modifications';
  $('cancel-edit').hidden=false;
  form.scrollIntoView({behavior:'smooth',block:'start'});
 }
 function mark(r,mastered){
  if(readOnly)return false;
  const next=records.map(x=>x.id===r.id?{...x,mastered}:x);
  if(!save(next))return false;
  if(editing===r.id)form.elements.namedItem('mastered').value=mastered;
  render();tell(mastered==='oui'?'Question marquée maîtrisée.':'Question marquée à revoir.');
  return true;
 }
 function renderStats(){
  const result=L.compute(records),sum=$('summary');sum.replaceChildren();
  for(const [key,value] of result.kpis){
   const box=node('div','stat');
   box.append(node('span','stat-label',key),node('strong','stat-value',value));sum.append(box);
  }
  const progress=$('theme-progress');progress.replaceChildren();
  if(!result.categories.length)progress.append(node('p','empty','Ajoutez des questions pour suivre votre progression.'));
  for(const g of result.categories){
   const box=node('div','theme-card'),top=node('div','theme-heading');
   top.append(node('strong',null,g.category),node('span',null,g.mastered+'/'+g.total+' · '+g.percent+' %'));
   const bar=node('progress');bar.max=100;bar.value=g.percent;bar.setAttribute('aria-label','Progression du thème '+g.category);
   box.append(top,bar);progress.append(box);
  }
 }
 function currentFilter(){
  return {query:$('search').value,category:$('category-filter').value,mastered:$('mastery-filter').value,
   difficulty:$('difficulty-filter').value,order:$('sort').value};
 }
 function populateCategories(){
  const select=$('category-filter'),prior=select.value;
  const names=[...new Set(records.map(x=>x.category))].sort((a,b)=>a.localeCompare(b,'fr'));
  select.replaceChildren();
  const all=node('option',null,'Tous les thèmes');all.value='all';select.append(all);
  for(const name of names){const opt=node('option',null,name);opt.value=name;select.append(opt);}
  select.value=names.includes(prior)?prior:'all';
 }
 function renderCards(){
  const list=$('items'),shown=L.filterRecords(records,currentFilter());
  list.replaceChildren();$('counter').textContent=shown.length+' / '+records.length+' questions';
  if(!shown.length){list.append(node('p','empty',records.length?'Aucune question ne correspond aux filtres.':'Votre banque de questions est vide.'));return;}
  for(const r of shown){
   const card=node('article','item');
   const header=node('div','item-top'),intro=node('div','item-intro');
   intro.append(node('p','item-category',r.category),node('h3',null,r.question));
   const chip=node('span','chip '+(r.mastered==='oui'?'chip-success':'chip-pending'),r.mastered==='oui'?'Maîtrisée':'À revoir');
   header.append(intro,chip);
   const meta=node('p','meta','Difficulté : '+r.difficulty);
   const answer=node('div','answer');answer.hidden=true;
   answer.append(node('span','answer-heading','Réponse attendue'),node('p',null,r.answer));
   const actions=node('div','item-actions');
   function button(text,style,click,disabled=false){
    const b=node('button',style,text);b.type='button';b.disabled=disabled;b.addEventListener('click',click);actions.append(b);return b;
   }
   const reveal=button('Révéler la réponse','outline small',()=>{
    answer.hidden=!answer.hidden;reveal.textContent=answer.hidden?'Révéler la réponse':'Masquer la réponse';
    reveal.setAttribute('aria-expanded',String(!answer.hidden));
   });
   reveal.setAttribute('aria-expanded','false');
   button('Je connais','outline small',()=>mark(r,'oui'),readOnly||r.mastered==='oui');
   button('À retravailler','outline small',()=>mark(r,'non'),readOnly||r.mastered==='non');
   button('Modifier','outline small',()=>edit(r),readOnly);
   button('Supprimer','danger small',()=>{
    if(!confirm('Supprimer cette question ?'))return;
    if(save(records.filter(x=>x.id!==r.id))){if(editing===r.id)reset();render();tell('Question supprimée.');}
   },readOnly);
   card.append(header,meta,answer,actions);list.append(card);
  }
 }
 function render(){populateCategories();renderQuizCategories();renderStats();renderCards();$('start-quiz').disabled=!records.length;}
 function initForm(){
  const fields=$('fields');
  for(const f of L.SPEC.fields){
   const wrap=node('label','field');
   wrap.append(node('span',null,f.label));
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
  reset();
  form.addEventListener('submit',event=>{
   event.preventDefault();
   if(readOnly){tell('Stockage illisible : restaurez un JSON valide.',true);return;}
   try{
    const raw={id:editing||crypto.randomUUID().replaceAll('-','').slice(0,24)};
    for(const f of L.SPEC.fields)raw[f.key]=form.elements.namedItem(f.key).value;
    const valid=L.normalizeRecord(raw);
    const next=editing?records.map(r=>r.id===editing?valid:r):[...records,valid];
    if(next.length>L.MAX)throw Error('Limite de '+L.MAX+' questions atteinte');
    if(save(next)){reset();render();tell('Question enregistrée localement.');}
   }catch(err){tell(err.message,true);}
  });
  $('cancel-edit').addEventListener('click',reset);
 }
 function sessionRender(){
  const box=$('quiz-body'),label=$('quiz-status');box.replaceChildren();
  if(!session){$('quiz-panel').hidden=true;return;}
  $('quiz-panel').hidden=false;
  if(session.cursor>=session.deck.length){
   label.textContent='Session terminée';
   box.append(node('h3',null,'Résultat : '+session.correct+' / '+session.deck.length),
    node('p','muted','Score d’auto-évaluation : réponses évaluées par vous, sans correction automatique.'));
   const again=node('button','secondary','Nouvelle session');again.type='button';again.addEventListener('click',startQuiz);box.append(again);
   return;
  }
  const current=session.deck[session.cursor];
  label.textContent='Question '+(session.cursor+1)+' / '+session.deck.length+' · '+session.correct+' correcte(s)';
  box.append(node('p','item-category',current.category+' · '+current.difficulty),node('h3',null,current.question));
  if(!session.revealed){
   const b=node('button','outline','Afficher la réponse');
   b.type='button';b.addEventListener('click',()=>{session.revealed=true;sessionRender();});box.append(b);
  }else{
   const answer=node('div','answer');answer.append(node('span','answer-heading','Réponse attendue'),node('p',null,current.answer));box.append(answer);
   const actions=node('div','quiz-actions');
   for(const [caption,correct] of [['J’ai répondu juste',true],['Je dois réviser',false]]){
    const b=node('button',correct?'primary':'outline',caption);b.type='button';
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
    mastered:$('quiz-unmastered').checked?'non':'all'});
   if(!pool.length){tell('Aucune question disponible avec ces critères.',true);return;}
   const deck=L.makeDeck(pool,{count:Number($('quiz-count').value)});
   session={deck,cursor:0,correct:0,revealed:false};sessionRender();
   $('quiz-panel').scrollIntoView({behavior:'smooth',block:'start'});
   tell('Session lancée : '+deck.length+' questions.');
  }catch(err){tell(err.message,true);}
 }
 function renderQuizCategories(){
  const select=$('quiz-category'),old=select.value;
  select.replaceChildren();const any=node('option',null,'Tous les thèmes');any.value='all';select.append(any);
  for(const cat of [...new Set(records.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,'fr'))){
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
  try{download('quizcraft-sauvegarde.json',L.backup(records),'application/json');tell('Sauvegarde JSON téléchargée.');}
  catch(err){tell(err.message,true);}
 });
 $('export-csv').addEventListener('click',()=>{
  try{download('quizcraft-questions.csv',L.toCSV(records),'text/csv;charset=utf-8');tell('CSV exporté. Utilisez le JSON pour restaurer.');}
  catch(err){tell(err.message,true);}
 });
 $('export-raw').addEventListener('click',()=>{
  try{download('quizcraft-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');tell('Copie brute téléchargée : ne la publiez pas.');}
  catch(err){tell('Copie brute impossible : '+err.message,true);}
 });
 $('import').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{
   if(file.size>L.STORAGE_LIMIT)throw Error('Fichier trop volumineux');
   const restored=L.validateBackup(JSON.parse(await file.text()));
   if(!confirm('Remplacer les '+records.length+' fiches par '+restored.length+' fiches validées ?'))return;
   if(save(restored,{recover:true})){
    session=null;sessionRender();reset();
    $('search').value='';$('category-filter').value='all';$('mastery-filter').value='all';$('difficulty-filter').value='all';
    render();renderQuizCategories();tell('Sauvegarde JSON restaurée.');
   }
  }catch(err){tell('Import refusé : '+err.message,true);}
 });
 try{
  const text=localStorage.getItem(KEY);
  if(text)records=L.validateBackup(JSON.parse(text));
 }catch(err){
  readOnly=true;$('warning').hidden=false;
  tell('Stockage local illisible : aucune écriture autorisée. Exportez la copie brute et restaurez un JSON valide.',true);
 }
 initForm();render();renderQuizCategories();
 if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
