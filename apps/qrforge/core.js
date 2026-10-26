/* QRForge core: validates payloads and renders QR matrices locally. */
(function(root){'use strict';
const QR = (typeof module!=='undefined'&&module.exports)?require('./vendor/qrcode.js'):root.qrcode;
if(!QR||!QR.stringToBytesFuncs||!QR.stringToBytesFuncs['UTF-8'])throw Error('Encodeur QR non disponible');
QR.stringToBytes=QR.stringToBytesFuncs['UTF-8'];
const MAX_BYTES=1800,MAX_TEXT=1600;
const levels=Object.freeze(['L','M','Q','H']);
const kinds=Object.freeze(['text','url','wifi','email','telephone']);
const encoder=new TextEncoder();
function error(s){throw Error(s);}
function text(s,label,max=MAX_TEXT){
 if(typeof s!=='string'||!s.trim())error(label+' requis');
 if(s.length>max)error(label+' trop long');
 return s;
}
function bytes(s){return encoder.encode(s).length;}
function wifiEscape(s){return s.replace(/[\\;,:"]/g,'\\$&');}
function payload(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||!kinds.includes(v.kind))error('Type de contenu invalide');
 let out;
 if(v.kind==='text'){out=text(v.text,'Texte');}
 else if(v.kind==='url'){
  const s=text(v.url,'Adresse web',1200).trim();let url;
  try{url=new URL(s);}catch(e){error('URL invalide : utilisez une adresse https:// ou http://');}
  if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)
   error('URL refusée : HTTP(S) uniquement, sans identifiants intégrés');
  out=url.href;
 }else if(v.kind==='email'){
  const s=text(v.email,'Adresse e-mail',254).trim();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s))error('Adresse e-mail invalide');
  out='mailto:'+s;
 }else if(v.kind==='telephone'){
  const s=text(v.telephone,'Numéro de téléphone',32).trim();
  if(!/^\+?[0-9][0-9(). \-]{2,30}$/.test(s))error('Numéro invalide');
  out='tel:'+s.replace(/[(). \-]/g,'');
 }else{
  const ssid=text(v.ssid,'Nom du réseau Wi-Fi',80);
  if(bytes(ssid)>32)error('Nom Wi-Fi limité à 32 octets UTF-8');
  if(!['WPA','nopass'].includes(v.security))error('Sécurité Wi-Fi invalide');
  if(v.security==='WPA'){
   const password=text(v.password,'Mot de passe Wi-Fi',64);
   if(password.length<8||password.length>63)error('Mot de passe Wi-Fi : 8 à 63 caractères');
   out='WIFI:T:WPA;S:'+wifiEscape(ssid)+';P:'+wifiEscape(password)+';;';
  }else out='WIFI:T:nopass;S:'+wifiEscape(ssid)+';;';
 }
 if(bytes(out)>MAX_BYTES)error('Contenu trop long pour cette application (1 800 octets maximum)');
 return out;
}
function color(value){
 if(typeof value!=='string'||!/^#[\da-fA-F]{6}$/.test(value))error('Couleur HEX invalide');
 return value.toUpperCase();
}
function lum(hex){
 const c=[1,3,5].map(i=>parseInt(color(hex).slice(i,i+2),16)/255)
   .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function config(data){
 if(!data||typeof data!=='object'||Array.isArray(data))error('Paramètres invalides');
 const {ecc,margin,dark,light,scale}=data;
 if(!levels.includes(ecc))error('Correction d’erreurs invalide');
 if(!Number.isInteger(margin)||margin<4||margin>10)error('Marge : 4 à 10 modules');
 if(!Number.isInteger(scale)||scale<4||scale>16)error('Échelle PNG : 4 à 16 pixels par module');
 const a=color(dark),b=color(light);
 const al=lum(a),bl=lum(b),ratio=(bl+.05)/(al+.05);
 if(al>=bl||ratio<4.5)error('Utilisez des modules foncés sur un fond clair, avec un contraste ≥ 4,5:1');
 return {ecc,margin,scale,dark:a,light:b,contrast:ratio};
}
function matrix(data,options){
 const p=payload(data),cfg=config(options);
 let qr;
 try{qr=QR(0,cfg.ecc);qr.addData(p,'Byte');qr.make();}
 catch(e){error('Contenu trop volumineux pour le niveau '+cfg.ecc+' : réduisez le texte ou choisissez L/M');}
 const size=qr.getModuleCount();
 if(!Number.isInteger(size)||size<21||size>177)error('Dimension QR invalide');
 return {qr,size,payload:p,bytes:bytes(p),options:cfg};
}
function svg(result){
 const {qr,size,options}=result,{margin,dark,light}=options;
 const total=size+2*margin;let path='';
 for(let y=0;y<size;y++){
  let x=0;
  while(x<size){
   if(!qr.isDark(y,x)){x++;continue;}
   const start=x;
   while(x<size&&qr.isDark(y,x))x++;
   path+='M'+(start+margin)+' '+(y+margin)+'h'+(x-start)+'v1H'+(start+margin)+'z';
  }
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+total+' '+total+'" width="'+total*8+'" height="'+total*8+'" shape-rendering="crispEdges" role="img" aria-label="Code QR">'
 +'<rect width="'+total+'" height="'+total+'" fill="'+light+'"/>'
 +'<path fill="'+dark+'" d="'+path+'"/></svg>';
}
function pngCanvas(result,canvas){
 const {qr,size,options}=result,{margin,scale,dark,light}=options;
 if(!canvas||typeof canvas.getContext!=='function')error('Canvas indisponible');
 const total=(size+margin*2)*scale;
 canvas.width=total;canvas.height=total;
 const ctx=canvas.getContext('2d',{alpha:false});
 if(!ctx)error('Dessin PNG indisponible');
 ctx.fillStyle=light;ctx.fillRect(0,0,total,total);
 ctx.fillStyle=dark;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)
  if(qr.isDark(y,x))ctx.fillRect((x+margin)*scale,(y+margin)*scale,scale,scale);
 return total;
}
root.QRForgeCore=Object.freeze({MAX_BYTES,MAX_TEXT,kinds,levels,payload,wifiEscape,bytes,color,lum,config,matrix,svg,pngCanvas});
if(typeof module!=='undefined'&&module.exports)module.exports=root.QRForgeCore;
})(typeof window==='undefined'?globalThis:window);
