/* GradePilot v2 : stockage transactionnel, scénarios et interface locale. */
(()=>{'use strict';
const C=window.GradeCore,KEY='louvre-wave2-gradepilot-v1';
const by=id=>document.getElementById(id);
let state={version:1,grades:[]},editing=null,blocked=false;
const fmt=n=>n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
function say(message,error=false){const p=by('feedback');p.textContent=message;p.className=error?'feedback error':'feedback success';}
function node(tag,cls,text){const element=document.createElement(tag);if(cls)element.className=cls;if(text!==undefined)element.textContent=String(text);return element;}
function commit(next,{recovery=false}={}){
 if(blocked&&!recovery){say('Stockage corrompu : exportez sa copie brute puis restaurez un fichier JSON valide.',true);return false;}
 try{
  const clean=C.validateState(next);
  localStorage.setItem(KEY,JSON.stringify(clean));
  state=clean;
  if(recovery)blocked=false;
  by('warning').hidden=!blocked;
  return true;
 }catch(error){say('Enregistrement impossible : '+error.message+'. Aucune modification locale appliquée.',true);return false;}
}
function download(name,contents,mime='application/json'){
 const url=URL.createObjectURL(new Blob([contents],{type:mime})),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function resetForm(){editing=null;by('grade-form').reset();by('weight').value='1';by('save').textContent='Ajouter la note';by('cancel-edit').hidden=true;}
function forecast(){
 const target=Number(by('target').value),weight=Number(by('nextweight').value),preview=Number(by('whatif-score').value);
 const required=by('required'),message=by('feasibility'),range=by('forecast-range'),whatif=by('whatif-average');
 try{
  if(!by('target').value||!by('nextweight').value||!by('whatif-score').value)throw Error('Champ manquant');
  const r=C.requirement(state.grades,target,weight);
  const min=C.minimumScore(state.grades,target,weight);
  if(r.status==='already'){
   required.textContent='0,00/20';message.textContent='Cible atteinte même avec 0/20 à la prochaine évaluation.';
  }else if(r.status==='impossible'){
   required.textContent='>20/20';message.textContent='Objectif inaccessible avec cette seule évaluation, même en obtenant 20/20.';
  }else{
   required.textContent=fmt(min)+'/20';
   message.textContent='Note minimale arrondie au centième supérieur pour viser '+fmt(target)+'/20.';
  }
  range.textContent='Moyenne possible après cette évaluation : de '+fmt(r.minAverage)+' à '+fmt(r.maxAverage)+'/20.';
  whatif.textContent=fmt(C.projectedAverage(state.grades,preview,weight))+'/20';
  by('target-mark').style.width=(Math.max(0,Math.min(20,target))*5)+'%';
 }catch(error){
  required.textContent='—';message.textContent='Saisissez un objectif, une note simulée (0 à 20) et un coefficient valides.';
  range.textContent='';whatif.textContent='—';
 }
}
function render(){
 const list=by('grade-list'),average=C.weightedAverage(state.grades);
 by('count').textContent=state.grades.length+' note'+(state.grades.length!==1?'s':'');
 by('average').textContent=average===null?'—':fmt(average)+'/20';
 by('average-caption').textContent=average===null?'Ajoutez votre première note':'Calcul pondéré par vos coefficients';
 by('warning').hidden=!blocked;
 list.replaceChildren();
 const query=by('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();
 let count=0;
 for(const g of state.grades){
  if(query&&!g.label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').includes(query))continue;
  count++;
  const row=node('article','grade-row'),body=node('div','grade-info');
  body.append(node('strong',null,g.label),node('small',null,'Coefficient : '+fmt(g.coefficient)));
  const score=node('span','grade-score',fmt(g.score)+'/20');
  const actions=node('div','row-actions');
  const edit=node('button',null,'Modifier'),del=node('button','danger','Supprimer');
  for(const button of [edit,del])button.type='button';
  edit.disabled=del.disabled=blocked;
  edit.addEventListener('click',()=>{
   editing=g.id;by('label').value=g.label;by('grade').value=g.score;by('weight').value=g.coefficient;
   by('save').textContent='Enregistrer les modifications';by('cancel-edit').hidden=false;
   by('label').focus();
  });
  del.addEventListener('click',()=>{
   if(!confirm('Supprimer cette note ?'))return;
   if(commit({version:1,grades:state.grades.filter(item=>item.id!==g.id)})){
    if(editing===g.id)resetForm();
    render();say('Note supprimée.');
   }
  });
  actions.append(edit,del);row.append(body,score,actions);list.append(row);
 }
 by('list-status').textContent=count+' sur '+state.grades.length+' évaluations affichées';
 if(!count)list.append(node('p','empty',state.grades.length?'Aucune évaluation correspondante.':'Aucune note enregistrée.'));
 by('save').disabled=blocked;by('reset').disabled=blocked;
 forecast();
}
by('grade-form').addEventListener('submit',event=>{
 event.preventDefault();
 if(blocked){say('Sauvegarde corrompue : restaurez un JSON valide avant de modifier.',true);return;}
 try{
  if(!by('grade').value||!by('weight').value)throw Error('Note et coefficient requis');
  const obj=C.grade({id:editing||'g_'+crypto.randomUUID(),label:by('label').value,
   score:Number(by('grade').value),coefficient:Number(by('weight').value)});
  const next=editing?state.grades.map(g=>g.id===editing?obj:g):[...state.grades,obj];
  if(commit({version:1,grades:next})){resetForm();render();say('Note enregistrée sur cet appareil.');}
 }catch(error){say(error.message,true);}
});
by('cancel-edit').addEventListener('click',resetForm);
for(const id of ['target','nextweight','whatif-score'])by(id).addEventListener('input',forecast);
by('search').addEventListener('input',render);
by('export').addEventListener('click',()=>{
 if(blocked){say('Sauvegarde illisible : exportez la copie brute, pas un JSON vide.',true);return;}
 try{download('gradepilot-backup.json',JSON.stringify(C.validateState(state),null,2));say('Sauvegarde JSON exportée.');}
 catch(error){say(error.message,true);}
});
by('export-csv').addEventListener('click',()=>{
 try{download('gradepilot-notes.csv',C.toCSV(state.grades),'text/csv;charset=utf-8');say('CSV exporté : utilisez le JSON pour restaurer.');}
 catch(error){say(error.message,true);}
});
by('export-raw').addEventListener('click',()=>{
 try{download('gradepilot-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');say('Copie brute exportée : ne la partagez pas.');}
 catch(error){say('Lecture du stockage impossible : '+error.message,true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async(event)=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>C.MAX_BYTES)throw Error('Fichier trop volumineux');
  const next=C.validateState(JSON.parse(await file.text()));
  if(!confirm('Remplacer les notes locales par '+next.grades.length+' notes validées ?'))return;
  if(commit(next,{recovery:true})){resetForm();by('search').value='';render();say('Sauvegarde restaurée.');}
 }catch(error){say('Import refusé : '+error.message,true);}
});
by('reset').addEventListener('click',()=>{
 if(blocked){say('Stockage corrompu : exportez le brut et restaurez un JSON valide avant tout effacement.',true);return;}
 if(!confirm('Effacer toutes vos notes de cet appareil ?'))return;
 if(commit({version:1,grades:[]})){resetForm();render();say('Notes effacées.');}
});
window.addEventListener('storage',event=>{
 if(event.key!==KEY)return;
 try{state=event.newValue?C.validateState(JSON.parse(event.newValue)):{version:1,grades:[]};blocked=false;resetForm();render();say('Données synchronisées depuis un autre onglet.');}
 catch(error){blocked=true;render();say('Sauvegarde modifiée par un autre onglet et illisible. Importez un JSON valide.',true);}
});
try{const raw=localStorage.getItem(KEY);if(raw)state=C.validateState(JSON.parse(raw));}
catch(error){blocked=true;say('Sauvegarde locale illisible : rien ne sera écrasé. Exportez la copie brute et restaurez un JSON valide.',true);}
render();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
