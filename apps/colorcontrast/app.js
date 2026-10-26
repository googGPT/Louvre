/* ColorContrast v2 — atelier client, favoris transactionnels et rétablissement sûr. */
(()=>{'use strict';
const C=window.ContrastCore,by=id=>document.getElementById(id),KEY='louvre-wave2-colorcontrast-v1';
const DEFAULT={version:1,pairs:[]};
let palette=DEFAULT,blocked=false,fg='#0C2430',bg='#F5F4EA';
function message(text,error=false){const el=by('message');el.textContent=text;el.className=error?'message error':'message success';}
function node(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=String(content);return e;}
function save(next,{restore=false}={}){
 if(blocked&&!restore){message('Stockage illisible : exportez le brut puis restaurez un JSON valide.',true);return false;}
 try{
  const clean=C.validateBackup(next);
  localStorage.setItem(KEY,JSON.stringify(clean));
  palette=clean;
  if(restore)blocked=false;
  return true;
 }catch(e){message('Enregistrement impossible : '+e.message+'. Aucune modification mémorisée.',true);return false;}
}
function download(name,text,type){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function show(){
 fg=C.normalize(fg);bg=C.normalize(bg);
 by('foreground').value=fg;by('background').value=bg;
 by('foreground-picker').value=fg;by('background-picker').value=bg;
 const sample=by('sample');sample.style.color=fg;sample.style.backgroundColor=bg;
 const analysis=C.wcag(fg,bg);
 // L'étiquette est indicative ; les booléens se calculent sur le ratio non arrondi.
 by('ratio').textContent=analysis.ratio.toFixed(4)+':1';
 by('ratio-exact').textContent='Tests effectués sans arrondir · '+(analysis.aaNormal?'AA texte standard atteint':'AA texte standard non atteint');
 for(const [id,pass] of [['aa-normal',analysis.aaNormal],['aaa-normal',analysis.aaaNormal],['aa-large',analysis.aaLarge],['aaa-large',analysis.aaaLarge]]){
  const el=by(id);el.className='check '+(pass?'ok':'fail');
  el.querySelector('strong').textContent=pass?'Conforme':'Insuffisant';
 }
 const best=C.bestOn(bg);
 by('suggested').textContent=best.hex;
 by('suggested-ratio').textContent=best.ratio.toFixed(4)+':1';
 by('suggested-swatch').style.backgroundColor=bg;
 by('suggested-swatch').style.color=best.hex;
 by('suggested-swatch').textContent='Aa';
 const target=Number(by('target-ratio').value),suggestion=C.suggestForeground(fg,bg,target);
 by('adjusted').textContent=suggestion.hex;
 by('adjusted-ratio').textContent=suggestion.ratio.toFixed(4)+':1';
 by('adjusted-swatch').style.backgroundColor=bg;
 by('adjusted-swatch').style.color=suggestion.hex;
 by('adjusted-swatch').textContent='Aa';
 by('adjusted-reason').textContent=!suggestion.reachable?
  'Seuil inaccessible avec un texte HEX opaque sur ce fond fixe, même en noir ou en blanc. Modifiez aussi le fond.':
  suggestion.changed?'Ajustement des canaux RVB vers le noir ou le blanc pour atteindre le seuil choisi.':
  'La couleur actuelle atteint déjà le seuil choisi.';
 by('use-adjusted').disabled=!suggestion.changed||!suggestion.reachable;
 by('css-output').value=C.cssSnippet(fg,bg);
 renderSaved();
}
function renderSaved(){
 const list=by('saved-list');list.replaceChildren();
 by('warning').hidden=!blocked;by('save-pair').disabled=blocked;
 const stats=C.summarize(palette.pairs);
 by('saved-count').textContent=stats.total+' / 100 combinaisons';
 by('saved-aa').textContent=stats.aaNormal+' conformes AA standard';
 if(!palette.pairs.length)list.append(node('p','empty','Aucune combinaison enregistrée.'));
 palette.pairs.forEach((entry,index)=>{
  const row=node('div','saved');
  const swatch=node('span','saved-preview','Aa');
  swatch.style.color=entry.fg;swatch.style.backgroundColor=entry.bg;
  const apply=node('button','saved-apply',entry.fg+' / '+entry.bg);
  apply.type='button';apply.addEventListener('click',()=>{fg=entry.fg;bg=entry.bg;show();message('Combinaison appliquée.');});
  const result=C.wcag(entry.fg,entry.bg);
  const ratio=node('span','saved-ratio',result.ratio.toFixed(2)+':1 · '+(result.aaNormal?'AA ✓':'AA ✕'));
  const remove=node('button','remove','Supprimer');remove.type='button';remove.disabled=blocked;
  remove.setAttribute('aria-label','Supprimer la palette '+entry.fg+' sur '+entry.bg);
  remove.addEventListener('click',()=>{
   if(!confirm('Supprimer cette combinaison enregistrée ?'))return;
   if(save({version:1,pairs:palette.pairs.filter((_,i)=>i!==index)})){
    renderSaved();message('Combinaison supprimée.');
   }
  });
  row.append(swatch,apply,ratio,remove);list.append(row);
 });
}
function setColor(kind,value){
 try{
  const hex=C.normalize(value);
  if(kind==='fg')fg=hex;else bg=hex;
  message('');show();
 }catch(e){message('Couleur invalide : saisissez #RGB ou #RRGGBB.',true);show();}
}
for(const [field,picker,kind] of [
 ['foreground','foreground-picker','fg'],['background','background-picker','bg']]){
 by(field).addEventListener('change',()=>setColor(kind,by(field).value));
 by(picker).addEventListener('input',()=>setColor(kind,by(picker).value));
}
by('target-ratio').addEventListener('change',show);
by('swap').addEventListener('click',()=>{[fg,bg]=[bg,fg];show();});
by('use-suggestion').addEventListener('click',()=>{fg=C.bestOn(bg).hex;show();message('Texte noir ou blanc appliqué.');});
by('use-adjusted').addEventListener('click',()=>{
 fg=C.suggestForeground(fg,bg,Number(by('target-ratio').value)).hex;
 show();message('Couleur de texte ajustée au contraste demandé.');
});
by('save-pair').addEventListener('click',()=>{
 if(blocked){message('Sauvegarde illisible : restauration requise.',true);return;}
 if(palette.pairs.length>=C.MAX){message('Limite de 100 combinaisons atteinte.',true);return;}
 const pair={fg,bg};
 if(palette.pairs.some(x=>x.fg===pair.fg&&x.bg===pair.bg)){
  message('Cette combinaison figure déjà dans les favoris.',true);return;
 }
 if(save({version:1,pairs:[...palette.pairs,pair]})){
  renderSaved();message('Combinaison enregistrée.');
 }
});
by('export').addEventListener('click',()=>{
 if(blocked){message('Stockage illisible : exportez la copie brute plutôt qu’un JSON vide.',true);return;}
 try{download('colorcontrast-palettes.json',JSON.stringify(C.validateBackup(palette),null,2),'application/json');message('Sauvegarde JSON téléchargée.');}
 catch(e){message(e.message,true);}
});
by('export-raw').addEventListener('click',()=>{
 try{download('colorcontrast-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');message('Copie brute téléchargée : conservez-la en privé.');}
 catch(e){message('Copie brute indisponible : '+e.message,true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async(event)=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>C.MAX_BYTES)throw Error('Fichier trop volumineux');
  const imported=C.validateBackup(JSON.parse(await file.text()));
  if(!confirm('Remplacer les '+palette.pairs.length+' combinaisons par '+imported.pairs.length+' combinaisons validées ?'))return;
  if(save(imported,{restore:true})){show();message('Sauvegarde JSON restaurée.');}
 }catch(e){message('Import rejeté : '+e.message,true);}
});
by('copy-css').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(C.cssSnippet(fg,bg));message('Déclarations CSS copiées.');}
 catch(e){message('Copie automatique indisponible : sélectionnez le bloc CSS pour le copier.',true);}
});
window.addEventListener('storage',event=>{
 if(event.key!==KEY)return;
 try{palette=event.newValue?C.validateBackup(JSON.parse(event.newValue)):DEFAULT;blocked=false;show();message('Favoris actualisés depuis un autre onglet.');}
 catch(e){blocked=true;show();message('Nouvelles données invalides depuis un autre onglet : import requis.',true);}
});
try{const raw=localStorage.getItem(KEY);if(raw)palette=C.validateBackup(JSON.parse(raw));}
catch(e){blocked=true;message('Sauvegarde illisible : elle ne sera pas écrasée. Exportez la copie brute.',true);}
show();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
