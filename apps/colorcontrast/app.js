/* ColorContrast v2 — atelier client, favoris transactionnels et rétablissement sûr. */
(()=>{'use strict';
const C=window.ContrastCore,by=id=>document.getElementById(id),KEY='louvre-wave2-colorcontrast-v1';
const DEFAULT={version:1,pairs:[]};
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue et traductions
let palette=DEFAULT,blocked=false,fg='#0C2430',bg='#F5F4EA',lastMessage=null;
const ratioText=(r,d=4)=>L.number(r,{minimumFractionDigits:d,maximumFractionDigits:d})+':1'; // affichage seulement
function errText(e){if(e instanceof SyntaxError)return t('err.json');return L.error(e);}
// Message d'état : clé + paramètres, retraduit si la langue change ; msgErr = erreur à traduire.
function message(key,params={},error=false){lastMessage=key?{key,params,error}:null;showMessage();}
function showMessage(){
 const el=by('message');if(!lastMessage){el.textContent='';return;}
 const {key,params,error}=lastMessage,p={...params};
 if(p.msgErr){p.msg=errText(p.msgErr);delete p.msgErr;}
 el.textContent=key==='err'?p.msg:t(key,p);el.className=error?'message error':'message success';
}
const fail=e=>message('err',{msgErr:e},true);
function node(tag,cls,content){const e=document.createElement(tag);if(cls)e.className=cls;if(content!==undefined)e.textContent=String(content);return e;}
function save(next,{restore=false}={}){
 if(blocked&&!restore){message('status.blockedSave',{},true);return false;}
 try{
  const clean=C.validateBackup(next);
  localStorage.setItem(KEY,JSON.stringify(clean));
  palette=clean;
  if(restore)blocked=false;
  return true;
 }catch(e){message('status.saveFail',{msgErr:e},true);return false;}
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
 by('ratio').textContent=ratioText(analysis.ratio);
 by('ratio-exact').textContent=t('ratio.exact',{status:t(analysis.aaNormal?'ratio.aaOk':'ratio.aaNo')});
 for(const [id,pass] of [['aa-normal',analysis.aaNormal],['aaa-normal',analysis.aaaNormal],['aa-large',analysis.aaLarge],['aaa-large',analysis.aaaLarge]]){
  const el=by(id);el.className='check '+(pass?'ok':'fail');
  el.querySelector('strong').textContent=t(pass?'check.pass':'check.fail');
 }
 const best=C.bestOn(bg);
 by('suggested').textContent=best.hex;
 by('suggested-ratio').textContent=ratioText(best.ratio);
 by('suggested-swatch').style.backgroundColor=bg;
 by('suggested-swatch').style.color=best.hex;
 by('suggested-swatch').textContent='Aa';
 const target=Number(by('target-ratio').value),suggestion=C.suggestForeground(fg,bg,target);
 by('adjusted').textContent=suggestion.hex;
 by('adjusted-ratio').textContent=ratioText(suggestion.ratio);
 by('adjusted-swatch').style.backgroundColor=bg;
 by('adjusted-swatch').style.color=suggestion.hex;
 by('adjusted-swatch').textContent='Aa';
 by('adjusted-reason').textContent=t(!suggestion.reachable?'reason.unreachable':suggestion.changed?'reason.changed':'reason.ok');
 by('use-adjusted').disabled=!suggestion.changed||!suggestion.reachable;
 by('css-output').value=C.cssSnippet(fg,bg);
 renderSaved();
}
function renderSaved(){
 const list=by('saved-list');list.replaceChildren();
 by('warning').hidden=!blocked;by('save-pair').disabled=blocked;
 const stats=C.summarize(palette.pairs);
 by('saved-count').textContent=t('saved.count',{n:stats.total,max:L.number(C.MAX)});
 by('saved-aa').textContent=t('saved.aa',{n:stats.aaNormal});
 if(!palette.pairs.length)list.append(node('p','empty',t('saved.empty')));
 palette.pairs.forEach((entry,index)=>{
  const row=node('div','saved');
  const swatch=node('span','saved-preview','Aa');
  swatch.style.color=entry.fg;swatch.style.backgroundColor=entry.bg;
  const apply=node('button','saved-apply',entry.fg+' / '+entry.bg);apply.dir='ltr';
  apply.type='button';apply.addEventListener('click',()=>{fg=entry.fg;bg=entry.bg;show();message('status.applied');});
  const result=C.wcag(entry.fg,entry.bg);
  const ratio=node('span','saved-ratio',ratioText(result.ratio,2)+' · '+(result.aaNormal?'AA ✓':'AA ✕'));
  const remove=node('button','remove',t('btn.delete'));remove.type='button';remove.disabled=blocked;
  remove.setAttribute('aria-label',t('aria.deletePair',{fg:entry.fg,bg:entry.bg}));
  remove.addEventListener('click',()=>{
   if(!confirm(t('confirm.delete')))return;
   if(save({version:1,pairs:palette.pairs.filter((_,i)=>i!==index)})){
    renderSaved();message('status.deleted');
   }
  });
  row.append(swatch,apply,ratio,remove);list.append(row);
 });
}
function setColor(kind,value){
 try{
  const hex=C.normalize(value);
  if(kind==='fg')fg=hex;else bg=hex;
  message(null);show();
 }catch(e){message('err.color',{},true);show();}
}
for(const [field,picker,kind] of [
 ['foreground','foreground-picker','fg'],['background','background-picker','bg']]){
 by(field).addEventListener('change',()=>setColor(kind,by(field).value));
 by(picker).addEventListener('input',()=>setColor(kind,by(picker).value));
}
by('target-ratio').addEventListener('change',show);
by('swap').addEventListener('click',()=>{[fg,bg]=[bg,fg];show();});
by('use-suggestion').addEventListener('click',()=>{fg=C.bestOn(bg).hex;show();message('status.bestApplied');});
by('use-adjusted').addEventListener('click',()=>{
 fg=C.suggestForeground(fg,bg,Number(by('target-ratio').value)).hex;
 show();message('status.adjustedApplied');
});
by('save-pair').addEventListener('click',()=>{
 if(blocked){message('status.blockedPair',{},true);return;}
 if(palette.pairs.length>=C.MAX){message('status.limit',{max:L.number(C.MAX)},true);return;}
 const pair={fg,bg};
 if(palette.pairs.some(x=>x.fg===pair.fg&&x.bg===pair.bg)){
  message('status.duplicate',{},true);return;
 }
 if(save({version:1,pairs:[...palette.pairs,pair]})){
  renderSaved();message('status.pairSaved');
 }
});
by('export').addEventListener('click',()=>{
 if(blocked){message('status.exportBlocked',{},true);return;}
 try{download('colorcontrast-palettes.json',JSON.stringify(C.validateBackup(palette),null,2),'application/json');message('status.exported');}
 catch(e){fail(e);}
});
by('export-raw').addEventListener('click',()=>{
 try{download('colorcontrast-stockage-brut.txt',localStorage.getItem(KEY)||'','text/plain');message('status.raw');}
 catch(e){message('status.rawFail',{msgErr:e},true);}
});
by('import-trigger').addEventListener('click',()=>by('import-file').click());
by('import-file').addEventListener('change',async(event)=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{
  if(file.size>C.MAX_BYTES)throw Error('err.fileBig');
  const imported=C.validateBackup(JSON.parse(await file.text()));
  if(!confirm(t('confirm.import',{a:L.number(palette.pairs.length),b:L.number(imported.pairs.length)})))return;
  if(save(imported,{restore:true})){show();message('status.restored');}
 }catch(e){message('status.importRefused',{msgErr:e},true);}
});
by('copy-css').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(C.cssSnippet(fg,bg));message('status.cssCopied');}
 catch(e){message('status.cssFail',{},true);}
});
window.addEventListener('storage',event=>{
 if(event.key!==KEY)return;
 try{palette=event.newValue?C.validateBackup(JSON.parse(event.newValue)):DEFAULT;blocked=false;show();message('status.otherTab');}
 catch(e){blocked=true;show();message('status.otherTabBad',{},true);}
});
try{const raw=localStorage.getItem(KEY);if(raw)palette=C.validateBackup(JSON.parse(raw));}
catch(e){blocked=true;message('status.corrupt',{},true);}
show();
// Changement de langue : réaffichage complet ; couleurs en cours et favoris intacts.
L.onChange(()=>{show();showMessage();});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
