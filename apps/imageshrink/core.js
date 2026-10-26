/* ImageShrink — pure image-processing configuration and file safeguards. */
(function(root){'use strict';
const MAX_FILES=10,MAX_FILE_BYTES=20*1024*1024,MAX_BATCH_BYTES=60*1024*1024;
const MAX_SOURCE_PIXELS=40_000_000,MAX_OUTPUT_PIXELS=20_000_000;
const FORMATS=Object.freeze({'image/jpeg':'.jpg','image/webp':'.webp','image/png':'.png'});
function fail(text){throw Error(text);}
function number(value,min,max,label,integer=false){
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail(label+' invalide');
 return value;
}
function settings(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['format','quality','maxWidth','maxHeight'].includes(k)))fail('Réglages invalides');
 if(!Object.hasOwn(FORMATS,raw.format))fail('Format de sortie non pris en charge');
 const quality=number(raw.quality,.3,.95,'Qualité');
 const maxWidth=number(raw.maxWidth,64,6000,'Largeur',true);
 const maxHeight=number(raw.maxHeight,64,6000,'Hauteur',true);
 return {format:raw.format,quality,maxWidth,maxHeight};
}
function dimensions(sourceWidth,sourceHeight,config){
 const w=number(sourceWidth,1,32768,'Largeur source',true),h=number(sourceHeight,1,32768,'Hauteur source',true);
 const c=settings(config);
 if(w*h>MAX_SOURCE_PIXELS)fail('Image trop grande (40 mégapixels maximum)');
 const factor=Math.min(1,c.maxWidth/w,c.maxHeight/h,Math.sqrt(MAX_OUTPUT_PIXELS/(w*h)));
 let width=Math.max(1,Math.round(w*factor)),height=Math.max(1,Math.round(h*factor));
 while(width*height>MAX_OUTPUT_PIXELS){
  if(width>=height)width--;else height--;
 }
 return {width,height,resized:width!==w||height!==h,scale:factor};
}
function validFile(file){
 if(!file||typeof file!=='object')fail('Fichier invalide');
 if(typeof file.name!=='string'||!file.name.trim())fail('Nom de fichier manquant');
 number(file.size,1,MAX_FILE_BYTES,'Taille de fichier',true);
 if(!Object.hasOwn(FORMATS,file.type))fail('Format source non accepté (JPG, PNG, WebP uniquement)');
 return {name:file.name,size:file.size,type:file.type};
}
function validateBatch(files){
 if(!Array.isArray(files)||files.length<1||files.length>MAX_FILES)fail('Choisissez entre 1 et 10 images');
 const out=files.map(validFile);
 if(out.reduce((sum,f)=>sum+f.size,0)>MAX_BATCH_BYTES)fail('Lot trop volumineux (60 Mo maximum)');
 return out;
}
function outputName(name,mime){
 if(!Object.hasOwn(FORMATS,mime))fail('Format cible invalide');
 let base=String(name||'image').split(/[\\/]/).pop().replace(/\.[^.]*$/,'');
 base=base.replace(/[\u0000-\u001F\u007F<>:"|?*]/g,'_').trim().replace(/[. ]+$/,'');
 base=base.slice(0,80)||'image';
 return base+'-imageshrink'+FORMATS[mime];
}
function comparison(original,output){
 number(original,1,MAX_FILE_BYTES,'Taille originale',true);
 number(output,1,MAX_FILE_BYTES*3,'Taille produite',true);
 const bytesSaved=original-output,percentage=bytesSaved/original*100;
 return {bytesSaved,percentage,smaller:bytesSaved>0};
}
function displayBytes(v){
 number(v,0,MAX_FILE_BYTES*3,'Octets');
 if(v<1024)return v+' o';
 if(v<1024*1024)return (v/1024).toFixed(1).replace('.',',')+' Ko';
 return (v/(1024*1024)).toFixed(2).replace('.',',')+' Mo';
}
root.ShrinkCore=Object.freeze({MAX_FILES,MAX_FILE_BYTES,MAX_BATCH_BYTES,MAX_SOURCE_PIXELS,MAX_OUTPUT_PIXELS,FORMATS,settings,dimensions,validFile,validateBatch,outputName,comparison,displayBytes});
if(typeof module!=='undefined'&&module.exports)module.exports=root.ShrinkCore;
})(typeof window==='undefined'?globalThis:window);
