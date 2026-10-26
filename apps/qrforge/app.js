/* QRForge UI: no network, remote code, persistence, or hidden link opening. */
(()=>{'use strict';
const C=window.QRForgeCore,by=id=>document.getElementById(id);
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
  const svg=C.svg(item);
  const blob=new Blob([svg],{type:'image/svg+xml'});
  previewUrl=URL.createObjectURL(blob);
  by('preview').src=previewUrl;
  by('preview').hidden=false;by('placeholder').hidden=true;
  by('download-svg').disabled=false;by('download-png').disabled=false;
  by('result-info').textContent='QR '+item.size+' × '+item.size+' modules · '+item.bytes+' octets UTF-8 · correction '+item.options.ecc+' · '+(item.size+2*item.options.margin)*item.options.scale+' px (PNG)';
  result=item;status('QR généré localement. Vérifiez son décodage avec un second appareil avant diffusion.');
 }catch(e){status(e.message,true);}
}
function download(blob,name){
 const u=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=u;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(u),4000);
}
by('download-svg').addEventListener('click',()=>{
 if(!result)return;
 download(new Blob([C.svg(result)],{type:'image/svg+xml'}),'qrforge-code.svg');
 status('Fichier SVG téléchargé.');
});
by('download-png').addEventListener('click',()=>{
 if(!result)return;
 const token=nonce,canvas=document.createElement('canvas');
 try{
  C.pngCanvas(result,canvas);
  canvas.toBlob(blob=>{
   canvas.width=0;canvas.height=0;
   if(token!==nonce)return;
   if(!blob||blob.type!=='image/png'){status('Impossible d’exporter en PNG sur ce navigateur.',true);return;}
   download(blob,'qrforge-code.png');status('Fichier PNG téléchargé.');
  },'image/png');
 }catch(e){status(e.message,true);}
});
const controls=['content-text','content-url','ssid','wifi-password','security','email','telephone','ecc','margin','scale','dark','light','kind'];
for(const id of controls){const element=by(id);
 element.addEventListener(id==='kind'||id==='ecc'||id==='security'?'change':'input',()=>{
  refreshFields();render();
 });
 if(['margin','scale'].includes(id))element.addEventListener('change',render);
}
by('security').addEventListener('change',()=>{
 if(by('security').value==='nopass')status('Attention : le réseau déclaré sans mot de passe est un réseau ouvert.');
});
by('swap-colors').addEventListener('click',()=>{
 const dark=by('dark').value;by('dark').value=by('light').value;by('light').value=dark;
 render();
});
by('reset').addEventListener('click',()=>{
 by('kind').value='url';
 by('content-text').value='';by('content-url').value='https://example.com';
 by('ssid').value='';by('wifi-password').value='';by('security').value='WPA';
 by('email').value='';by('telephone').value='';
 by('ecc').value='M';by('margin').value='4';by('scale').value='10';
 by('dark').value='#102B43';by('light').value='#FFFFFF';
 refreshFields();render();
});
window.addEventListener('pagehide',()=>{nonce++;releasePreview();});
refreshFields();render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();