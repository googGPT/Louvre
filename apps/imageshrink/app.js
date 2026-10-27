/* ImageShrink — in-memory browser pipeline; images never leave this page. */
(()=>{'use strict';
const C=window.ShrinkCore,by=id=>document.getElementById(id);
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue de l'interface (aucun montant)
// Erreur du cœur (« err.cle|{…} ») traduite ; « field » est un nom de champ à traduire aussi.
function errText(e){
 const msg=e&&e.message?e.message:String(e),[key,json]=msg.split('|');
 let params;try{params=json?JSON.parse(json):undefined;}catch(x){params=undefined;}
 if(params&&params.field)params={...params,field:t('field.'+params.field)};
 return /^err\./.test(key)?t(key,params):msg;
}
// Taille lisible dans la langue choisie : « 1,0 Ko », « 1.0 KB », « 1,0 KB »…
function bytes(v){const {value,unit,digits}=C.byteUnits(v);return t('bytes.'+unit,{n:L.number(value,{minimumFractionDigits:digits,maximumFractionDigits:digits})});}
const pct=(v,digits=0)=>L.number(v/100,{style:'percent',minimumFractionDigits:digits,maximumFractionDigits:digits});
const arrow=()=>L.dir==='rtl'?'←':'→'; // flèche dans le sens de lecture
let lastFeedback=null; // dernier message (clé + paramètres), retraduit au changement de langue
let selected=[],results=[],generation=0,processing=false;
const node=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=String(txt);return x;};
function feedback(txt,error=false){const e=by('feedback');e.textContent=txt;e.className=error?'feedback error':'feedback success';lastFeedback=null;}
// Message traduit et mémorisé, pour le retraduire si la langue change.
function say(key,params,error=false){feedback(t(key,params),error);lastFeedback={key,params,error};}
function currentSettings(){return C.settings({format:by('format').value,quality:Number(by('quality').value),maxWidth:Number(by('max-width').value),maxHeight:Number(by('max-height').value)});}
function showSettings(){
 const format=by('format').value;
 const enabled=format!=='image/png';
 by('quality').disabled=!enabled;
 by('quality-output').textContent=enabled?pct(Math.round(Number(by('quality').value)*100)):t('quality.png');
}
function release(list){for(const item of list)if(item.url)URL.revokeObjectURL(item.url);}
function clearResults(){release(results);results=[];renderResults();}
function updateBusy(){
 by('process').disabled=processing||!selected.length;
 by('cancel').hidden=!processing;
 by('select-button').disabled=processing;
 by('file-input').disabled=processing;
 for(const id of ['format','quality','max-width','max-height'])by(id).disabled=processing||(id==='quality'&&by('format').value==='image/png');
 by('reset').disabled=processing;
}
function stop(){
 generation++;
 processing=false;
 clearResults();
 updateBusy();renderInputs();
 say('status.cancelled');
}
function reset(){
 generation++;processing=false;
 release(selected);selected=[];
 clearResults();
 by('file-input').value='';
 renderInputs();updateBusy();
 say('status.reset');
}
function renderInputs(){
 const list=by('input-list');list.replaceChildren();
 by('file-count').textContent=t('files.count',{n:selected.length});
 for(const item of selected){
  const card=node('article','file-card');
  const img=node('img','thumb');img.src=item.url;img.alt=t('alt.preview',{name:item.file.name});
  const main=node('div','file-info');
  main.append(node('strong',null,item.file.name),node('small',null,bytes(item.file.size)+' · '+item.file.type.replace('image/','').toUpperCase()));
  card.append(img,main);list.append(card);
 }
 if(!selected.length)list.append(node('p','empty',t('files.empty',{max:C.MAX_FILES})));
}
function renderResults(){
 const list=by('result-list');list.replaceChildren();
 let sumBefore=0,sumAfter=0;
 for(const entry of results){
  const card=node('article','result-card');
  const img=node('img','result-preview');img.src=entry.url;img.alt=t('alt.result',{name:entry.file.name});
  const details=node('div','result-details');
  details.append(node('strong',null,entry.file.name));
  details.append(node('small',null,t('result.pixels',{from:entry.original.width+' × '+entry.original.height,arrow:arrow(),to:entry.width+' × '+entry.height})));
  details.append(node('small',null,bytes(entry.file.size)+' '+arrow()+' '+bytes(entry.blob.size)));
  const cmp=C.comparison(entry.file.size,entry.blob.size);
  const savings=node('span',cmp.smaller?'savings positive':'savings negative',cmp.smaller?t('result.saved',{pct:pct(-cmp.percentage,1),bytes:bytes(cmp.bytesSaved)}):(cmp.bytesSaved===0?t('result.same'):t('result.bigger',{pct:pct(Math.abs(cmp.percentage),1)})));
  details.append(savings);
  const link=node('a','download',t('btn.download'));
  link.href=entry.url;link.download=C.outputName(entry.file.name,entry.blob.type);link.setAttribute('aria-label',t('aria.download',{name:link.download}));
  card.append(img,details,link);list.append(card);
  sumBefore+=entry.file.size;sumAfter+=entry.blob.size;
 }
 by('summary').textContent=results.length?t('summary',{n:results.length,before:bytes(sumBefore),arrow:arrow(),after:bytes(sumAfter)}):
  t('summary.empty');
}
function accept(files){
 if(processing){say('status.busy',undefined,true);return;}
 try{
  const arr=Array.from(files);
  C.validateBatch(arr);
  const next=arr.map(file=>({file,url:URL.createObjectURL(file)}));
  release(selected);selected=next;
  clearResults();renderInputs();updateBusy();
  say('status.accepted');
 }catch(e){feedback(errText(e),true);}
}
function decode(file){
 if('createImageBitmap' in window){
  return createImageBitmap(file,{imageOrientation:'from-image'}).then(image=>({
   drawable:image,width:image.width,height:image.height,close:()=>image.close()
  }));
 }
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),image=new Image();
  image.onload=()=>resolve({drawable:image,width:image.naturalWidth,height:image.naturalHeight,
   close:()=>{image.src='';URL.revokeObjectURL(url);}});
  image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('err.decode'));};
  image.src=url;
 });
}
async function transform(file,options){
 let decoded,canvas;
 try{
  decoded=await decode(file);
  const dimensions=C.dimensions(decoded.width,decoded.height,options);
  canvas=document.createElement('canvas');
  canvas.width=dimensions.width;canvas.height=dimensions.height;
  const context=canvas.getContext('2d',{alpha:options.format!=='image/jpeg'});
  if(!context)throw Error('err.canvas');
  if(options.format==='image/jpeg'){
   context.fillStyle='#FFFFFF';context.fillRect(0,0,canvas.width,canvas.height);
  }
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(decoded.drawable,0,0,dimensions.width,dimensions.height);
  const blob=await new Promise((resolve,reject)=>{
   try{canvas.toBlob(value=>value?resolve(value):reject(Error('err.encode')),options.format,options.quality);}
   catch(e){reject(e);}
  });
  if(blob.type!==options.format)throw Error('err.exportFormat|'+JSON.stringify({format:options.format}));
  if(!blob.size)throw Error('err.empty');
  return {file,blob,width:dimensions.width,height:dimensions.height,original:{width:decoded.width,height:decoded.height}};
 }finally{
  if(canvas){canvas.width=0;canvas.height=0;}
  if(decoded)decoded.close();
 }
}
async function run(){
 if(processing||!selected.length)return;
 let options;
 try{options=currentSettings();C.validateBatch(selected.map(x=>x.file));}
 catch(e){feedback(errText(e),true);return;}
 const token=++generation;processing=true;clearResults();updateBusy();
 let failures=0;
 try{
  for(let i=0;i<selected.length;i++){
   if(token!==generation)return;
   by('progress').textContent=t('progress',{i:i+1,n:selected.length,name:selected[i].file.name});
   try{
    const produced=await transform(selected[i].file,options);
    if(token!==generation)return;
    produced.url=URL.createObjectURL(produced.blob);
    results.push(produced);renderResults();
   }catch(e){
    if(token!==generation)return;
    failures++;
    feedback(t('status.failed',{name:selected[i].file.name,msg:errText(e)}),true);
   }
  }
  if(token===generation)feedback(t('status.done',{n:results.length})+' '+t('status.failures',{n:failures}),failures>0);
 }finally{
  if(token===generation){processing=false;by('progress').textContent='';updateBusy();}
 }
}
by('file-input').addEventListener('change',event=>{accept(event.target.files);event.target.value='';});
by('select-button').addEventListener('click',()=>by('file-input').click());
const drop=by('dropzone');
drop.addEventListener('dragover',event=>{event.preventDefault();if(!processing)drop.classList.add('dragover');});
drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragover');accept(event.dataTransfer.files);});
for(const id of ['format','max-width','max-height','quality']){
 by(id).addEventListener('change',()=>{
  if(!processing){clearResults();say('status.settings');}
  showSettings();
 });
}
by('quality').addEventListener('input',showSettings);
by('process').addEventListener('click',run);
by('cancel').addEventListener('click',stop);
by('reset').addEventListener('click',reset);
window.addEventListener('pagehide',()=>{generation++;release(selected);release(results);});
showSettings();renderInputs();renderResults();updateBusy();
// Changement de langue : écran retraduit ; images, résultats et réglages conservés.
L.onChange(()=>{showSettings();renderInputs();renderResults();if(lastFeedback)say(lastFeedback.key,lastFeedback.params,lastFeedback.error);});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();