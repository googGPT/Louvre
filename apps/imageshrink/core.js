/* ImageShrink — pure image-processing configuration and file safeguards. */
(function(root){'use strict';
const MAX_FILES=10,MAX_FILE_BYTES=20*1024*1024,MAX_BATCH_BYTES=60*1024*1024;
const MAX_SOURCE_PIXELS=40_000_000,MAX_OUTPUT_PIXELS=20_000_000;
const FORMATS=Object.freeze({'image/jpeg':'.jpg','image/webp':'.webp','image/png':'.png'});
// Erreurs sous forme de clés traduisibles : « err.cle » ou « err.cle|{…} » ; « field » est un nom de champ.
function fail(key,params){throw Error(params?key+'|'+JSON.stringify(params):key);}
function number(value,min,max,label,integer=false){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail('err.invalid',{field:label});
 return value;
}
function settings(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['format','quality','maxWidth','maxHeight'].includes(k)))fail('err.settings');
 if(!Object.hasOwn(FORMATS,raw.format))fail('err.outFormat');
 const quality=number(raw.quality,.3,.95,'quality');
 const maxWidth=number(raw.maxWidth,64,6000,'width',true);
 const maxHeight=number(raw.maxHeight,64,6000,'height',true);
 return {format:raw.format,quality,maxWidth,maxHeight};
}
function dimensions(sourceWidth,sourceHeight,config){
 const w=number(sourceWidth,1,32768,'sourceWidth',true),h=number(sourceHeight,1,32768,'sourceHeight',true);
 const c=settings(config);
 if(w*h>MAX_SOURCE_PIXELS)fail('err.tooBig',{max:MAX_SOURCE_PIXELS/1e6});
 const factor=Math.min(1,c.maxWidth/w,c.maxHeight/h,Math.sqrt(MAX_OUTPUT_PIXELS/(w*h)));
 let width=Math.max(1,Math.round(w*factor)),height=Math.max(1,Math.round(h*factor));
 while(width*height>MAX_OUTPUT_PIXELS){
  if(width>=height)width--;else height--;
 }
 return {width,height,resized:width!==w||height!==h,scale:factor};
}
function validFile(file){
 if(!file||typeof file!=='object')fail('err.file');
 if(typeof file.name!=='string'||!file.name.trim())fail('err.fileName');
 number(file.size,1,MAX_FILE_BYTES,'fileSize',true);
 if(!Object.hasOwn(FORMATS,file.type))fail('err.srcFormat');
 return {name:file.name,size:file.size,type:file.type};
}
function validateBatch(files){
 if(!Array.isArray(files)||files.length<1||files.length>MAX_FILES)fail('err.count',{max:MAX_FILES});
 const out=files.map(validFile);
 if(out.reduce((sum,f)=>sum+f.size,0)>MAX_BATCH_BYTES)fail('err.batchBig');
 return out;
}
function outputName(name,mime){
 if(!Object.hasOwn(FORMATS,mime))fail('err.target');
 let base=String(name||'image').split(/[\\/]/).pop().replace(/\.[^.]*$/,'');
 base=base.replace(/[\u0000-\u001F\u007F<>:"|?*]/g,'_').trim().replace(/[. ]+$/,'');
 base=base.slice(0,80)||'image';
 return base+'-imageshrink'+FORMATS[mime];
}
function comparison(original,output){
 number(original,1,MAX_FILE_BYTES,'originalSize',true);
 number(output,1,MAX_FILE_BYTES*3,'outputSize',true);
 const bytesSaved=original-output,percentage=bytesSaved/original*100;
 return {bytesSaved,percentage,smaller:bytesSaved>0};
}
// Taille découpée en valeur + unité (o, Ko, Mo) ; l'interface la formate dans la langue choisie.
function byteUnits(v){
 number(v,0,MAX_FILE_BYTES*3,'bytes');
 if(v<1024)return {value:v,unit:'b',digits:0};
 if(v<1024*1024)return {value:v/1024,unit:'kb',digits:1};
 return {value:v/(1024*1024),unit:'mb',digits:2};
}
// Affichage français historique (conservé pour les tests et les usages hors interface).
function displayBytes(v){
 const {value,unit,digits}=byteUnits(v);
 return value.toFixed(digits).replace('.',',')+' '+{b:'o',kb:'Ko',mb:'Mo'}[unit];
}
root.ShrinkCore=Object.freeze({MAX_FILES,MAX_FILE_BYTES,MAX_BATCH_BYTES,MAX_SOURCE_PIXELS,MAX_OUTPUT_PIXELS,FORMATS,settings,dimensions,validFile,validateBatch,outputName,comparison,byteUnits,displayBytes});
if(typeof module!=='undefined'&&module.exports)module.exports=root.ShrinkCore;
})(typeof window==='undefined'?globalThis:window);
