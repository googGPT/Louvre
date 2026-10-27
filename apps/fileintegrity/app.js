/* FileIntegrity — interface. Calcul dans core.js (IntegrityCore) ; textes et nombres dans LouvreI18n (messages.js). */
(()=>{'use strict';
const C=window.IntegrityCore,by=id=>document.getElementById(id);
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue et traductions
let file=null,hash=null;
// État affiché, gardé sous forme de clés pour être retraduit si la langue change.
const view={digest:'digest.waiting',comparison:'cmp.start',cmpClass:'',message:null,error:false};
function paint(){
 const d=by('digest');d.textContent=hash&&view.digest==='hash'?hash:t(view.digest);d.classList.toggle('hash',Boolean(hash&&view.digest==='hash'));
 const c=by('comparison');const mark=view.cmpClass==='pass'?'✓ ':view.cmpClass==='fail'?'✕ ':'';c.textContent=mark+t(view.comparison);c.className='comparison'+(view.cmpClass?' '+view.cmpClass:'');
 const m=by('message');m.textContent=!view.message?'':view.message instanceof Error?L.error(view.message):t(view.message);m.style.color=view.error?'#ffaaaa':'#85ebcb';
 if(file){by('filename').textContent=file.name;by('filesize').textContent=t('size.kb',{n:L.number(file.size/1024,{minimumFractionDigits:1,maximumFractionDigits:1})});}
}
function message(v,error){view.message=v;view.error=Boolean(error);paint();}
function setFile(f){try{C.validateFile(f);file=f;hash=null;by('filebox').hidden=false;by('calculate').disabled=false;by('copy').disabled=true;by('download').disabled=true;view.digest='digest.ready';view.comparison='cmp.ready';view.cmpClass='';message(null,false)}catch(err){file=null;hash=null;by('calculate').disabled=true;message(err,true)}}
by('file').addEventListener('change',e=>{if(e.target.files.length)setFile(e.target.files[0])});const drop=by('dropzone');for(const name of ['dragover','dragenter'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('drag')});for(const name of ['dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('drag')});drop.addEventListener('drop',e=>{if(e.dataTransfer.files.length)setFile(e.dataTransfer.files[0])});
function showComparison(expected){if(!expected){view.comparison='cmp.noRef';view.cmpClass='';}else{const same=C.compare(hash,expected);view.comparison=same?'cmp.match':'cmp.diff';view.cmpClass=same?'pass':'fail';}}
async function calculate(){if(!file)return;try{C.validateFile(file);const expected=by('expected').value.trim();if(expected)C.normalizeHash(expected);by('calculate').disabled=true;view.digest='digest.running';paint();const content=await file.arrayBuffer();hash=await C.digest(content,window.crypto?.subtle);view.digest='hash';by('copy').disabled=false;by('download').disabled=false;showComparison(expected);message('status.done',false);}catch(err){hash=null;view.digest='digest.failed';message(err,true)}finally{by('calculate').disabled=false}}
by('calculate').addEventListener('click',calculate);by('expected').addEventListener('change',()=>{if(hash){const expected=by('expected').value.trim();try{if(expected)showComparison(expected);else{view.comparison='cmp.cleared';view.cmpClass='';}message(null,false)}catch(err){message(err,true)}}});
by('copy').addEventListener('click',async()=>{if(!hash)return;try{await navigator.clipboard.writeText(hash);message('status.copied',false)}catch(e){message('status.copyFail',true)}});by('download').addEventListener('click',()=>{if(!hash||!file)return;const text=hash+'  '+file.name.replace(/[\r\n]/g,' ')+'\n';const blob=new Blob([text],{type:'text/plain'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='empreinte.sha256';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000)});
L.onChange(paint); // changement de langue : textes retraduits, fichier, empreinte et saisie conservés
paint();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
