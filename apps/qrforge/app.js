/* QRForge UI: no network, remote code, persistence, or hidden link opening. Texts via LouvreI18n (messages.js). */
(()=>{'use strict';
const C=window.QRForgeCore,by=id=>document.getElementById(id);
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue et traductions (le contenu encodé ne dépend jamais de la langue)
let result=null,previewUrl=null,nonce=0;
const modeFields={text:'text-fields',url:'url-fields',wifi:'wifi-fields',email:'email-fields',telephone:'telephone-fields'};
function status(message,error=false){const e=by('status');e.className=error?'status error':'status success';e.textContent=message;}
function source(){
 const kind=by('kind').value;
 return {kind,text:by('content-text').value,url:by('content-url').value,
  ssid:by('ssid').value,password:by('wifi-password').value,security:by('security').value,
  email:by('email').value,telephone:by('telephone').value};
}
function options(){return {ecc:by('ecc').value,margin:Number(by('margin').value),
 scale:Number(by('scale').value),dark:by('dark').value,light:by('light').value};}
function releasePreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}}
function invalidate(){
 nonce++;result=null;releasePreview();
 by('download-svg').disabled=true;by('download-png').disabled=true;
 by('preview').removeAttribute('src');by('preview').hidden=true;
 by('placeholder').hidden=false;by('result-info').textContent='';
}
function refreshFields(){
 for(const [kind,id] of Object.entries(modeFields))by(id).hidden=kind!==by('kind').value;
 by('wifi-password-wrapper').hidden=by('security').value==='nopass';
}
function render(){
 invalidate();
 try{
  const item=C.matrix(source(),options());
  const svg=C.svg(item,t('svg.label'));
  const blob=new Blob([svg],{type:'image/svg+xml'});
  previewUrl=URL.createObjectURL(blob);
  by('preview').src=previewUrl;
  by('preview').hidden=false;by('placeholder').hidden=true;
  by('download-svg').disabled=false;by('download-png').disabled=false;
  by('result-info').textContent=t('res.info',{size:L.number(item.size),bytes:L.number(item.bytes),ecc:item.options.ecc,px:L.number((item.size+2*item.options.margin)*item.options.scale)});
  result=item;status(t('st.generated'));
 }catch(e){status(L.error(e),true);}
}
function download(blob,name){
 const u=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=u;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),4000);
}
by('download-svg').addEventListener('click',()=>{
 if(!result)return;
 download(new Blob([C.svg(result,t('svg.label'))],{type:'image/svg+xml'}),'qrforge-code.svg');
 status(t('st.svg'));
});
by('download-png').addEventListener('click',()=>{
 if(!result)return;
 const token=nonce,canvas=document.createElement('canvas');
 try{
  C.pngCanvas(result,canvas);
  canvas.toBlob(blob=>{
   canvas.width=0;canvas.height=0;
   if(token!==nonce)return;
   if(!blob||blob.type!=='image/png'){status(t('st.pngFail'),true);return;}
   download(blob,'qrforge-code.png');status(t('st.png'));
  },'image/png');
 }catch(e){status(L.error(e),true);}
});
const controls=['content-text','content-url','ssid','wifi-password','security','email','telephone','ecc','margin','scale','dark','light','kind'];
for(const id of controls){const element=by(id);
 element.addEventListener(id==='kind'||id==='ecc'||id==='security'?'change':'input',()=>{
  refreshFields();render();
 });
 if(['margin','scale'].includes(id))element.addEventListener('change',render);
}
function toggleLabel(){by('toggle-password').textContent=by('wifi-password').type==='text'?t('btn.hidePassword'):t('btn.showPassword');}
by('toggle-password').addEventListener('click',()=>{
 const input=by('wifi-password'),visible=input.type==='text';
 input.type=visible?'password':'text';
 toggleLabel();
 by('toggle-password').setAttribute('aria-pressed',String(!visible));
});
by('security').addEventListener('change',()=>{
 if(by('security').value==='nopass')status(t('st.openNetwork'));
});
by('swap-colors').addEventListener('click',()=>{
 const dark=by('dark').value;by('dark').value=by('light').value;by('light').value=dark;
 render();
});
by('reset').addEventListener('click',()=>{
 by('kind').value='url';
 by('content-text').value='';by('content-url').value='https://example.com';
 by('ssid').value='';by('wifi-password').value='';by('security').value='WPA';
 by('wifi-password').type='password';toggleLabel();by('toggle-password').setAttribute('aria-pressed','false');
 by('email').value='';by('telephone').value='';
 by('ecc').value='M';by('margin').value='4';by('scale').value='10';
 by('dark').value='#102B43';by('light').value='#FFFFFF';
 refreshFields();render();
});
window.addEventListener('pagehide',()=>{nonce++;releasePreview();});
// Nouvelle langue : libellés et messages réaffichés ; champs saisis et QR (contenu encodé) inchangés.
L.onChange(()=>{toggleLabel();render();});
toggleLabel();refreshFields();render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();