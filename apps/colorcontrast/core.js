/* ColorContrast v2 — calcul WCAG 2.x sans dépendances ni navigateur. */
(function(root){'use strict';
const MAX=100,MAX_BYTES=300000,THRESHOLDS=Object.freeze({aaNormal:4.5,aaaNormal:7,aaLarge:3,aaaLarge:4.5});
function normalize(hex){
 if(typeof hex!=='string'||!/^#?(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex))
  throw Error('Couleur HEX invalide');
 let h=hex.replace('#','').toUpperCase();
 if(h.length===3)h=[...h].map(k=>k+k).join('');
 return '#'+h;
}
function rgb(hex){const h=normalize(hex).slice(1);return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
function fromRgb(c){
 if(!Array.isArray(c)||c.length!==3||c.some(v=>!Number.isInteger(v)||v<0||v>255))
  throw Error('Canaux RVB invalides');
 return '#'+c.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function luminance(hex){
 const [r,g,b]=rgb(hex).map(v=>{const s=v/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;});
 return 0.2126*r+0.7152*g+0.0722*b;
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
function wcag(a,b){
 const ratio=contrast(a,b);
 return {ratio,aaNormal:ratio>=4.5,aaaNormal:ratio>=7,aaLarge:ratio>=3,aaaLarge:ratio>=4.5};
}
function bestOn(bg){
 const black=contrast('#000000',bg),white=contrast('#FFFFFF',bg);
 return black>=white?{hex:'#000000',ratio:black}:{hex:'#FFFFFF',ratio:white};
}
/* Recherche sur 256 pas RVB en direction du noir ou du blanc.
   Ne garantit pas la meilleure couleur perceptuelle parmi toutes les nuances possibles. */
function suggestForeground(fg,bg,target=4.5){
 const source=rgb(fg),background=normalize(bg);
 if(![3,4.5,7].includes(target))throw Error('Seuil inconnu');
 const original=fromRgb(source),originalRatio=contrast(original,background);
 if(originalRatio>=target)return {hex:original,ratio:originalRatio,changed:false,target,reachable:true};
 const options=[];
 for(const end of [0,255]){
  const endpoint=fromRgb([end,end,end]);
  if(contrast(endpoint,background)<target)continue;
  const interpolate=step=>fromRgb(source.map(v=>Math.round(v+(end-v)*step/255)));
  let low=0,high=255;
  while(low<high){
   const mid=Math.floor((low+high)/2);
   if(contrast(interpolate(mid),background)>=target)high=mid;
   else low=mid+1;
  }
  const hex=interpolate(low);
  const channels=rgb(hex);
  const distance=channels.reduce((sum,v,i)=>sum+(v-source[i])**2,0);
  options.push({hex,ratio:contrast(hex,background),changed:true,target,distance});
 }
 if(!options.length){
  const candidate=bestOn(background);
  return {hex:candidate.hex,ratio:candidate.ratio,changed:candidate.hex!==original,target,reachable:false};
 }
 options.sort((a,b)=>a.distance-b.distance||b.ratio-a.ratio);
 const {distance,...result}=options[0];return {...result,reachable:true};
}
function validateBackup(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.version!==1||
  !Array.isArray(data.pairs)||data.pairs.length>MAX||
  Object.keys(data).some(k=>!['version','pairs'].includes(k)))throw Error('Sauvegarde invalide');
 const pairs=data.pairs.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||
   Object.keys(x).some(k=>!['fg','bg'].includes(k)))throw Error('Palette invalide');
  return {fg:normalize(x.fg),bg:normalize(x.bg)};
 });
 const result={version:1,pairs};
 if(JSON.stringify(result).length>MAX_BYTES)throw Error('Sauvegarde trop volumineuse');
 return result;
}
function summarize(pairs){
 const valid=validateBackup({version:1,pairs}).pairs;
 const groups={total:valid.length,aaNormal:0,aaaNormal:0,aaLarge:0,aaaLarge:0};
 for(const item of valid){
  const x=wcag(item.fg,item.bg);
  for(const key of Object.keys(THRESHOLDS))if(x[key])groups[key]++;
 }
 return groups;
}
function cssSnippet(fg,bg){
 return 'color: '+normalize(fg)+';\nbackground-color: '+normalize(bg)+';';
}
root.ContrastCore=Object.freeze({MAX,MAX_BYTES,THRESHOLDS,normalize,rgb,fromRgb,luminance,contrast,wcag,bestOn,suggestForeground,validateBackup,summarize,cssSnippet});
if(typeof module!=='undefined'&&module.exports)module.exports=root.ContrastCore;
})(typeof window==='undefined'?globalThis:window);
