(function(root){'use strict';
function normalize(hex){if(typeof hex!=='string'||!/^#?(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex))throw Error('Couleur HEX invalide');let h=hex.replace('#','').toUpperCase();if(h.length===3)h=h.split('').map(s=>s+s).join('');return '#'+h;}
function rgb(hex){const h=normalize(hex).slice(1);return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
function luminance(hex){const c=rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function wcag(a,b){const ratio=contrast(a,b);return{ratio,aaNormal:ratio>=4.5,aaaNormal:ratio>=7,aaLarge:ratio>=3,aaaLarge:ratio>=4.5};}
function bestOn(bg){const black=contrast('#000000',bg),white=contrast('#FFFFFF',bg);return black>=white?{hex:'#000000',ratio:black}:{hex:'#FFFFFF',ratio:white};}
function validateBackup(x){if(!x||typeof x!=='object'||Array.isArray(x)||x.version!==1||!Array.isArray(x.pairs)||x.pairs.length>100||Object.keys(x).some(k=>!['version','pairs'].includes(k)))throw Error('Sauvegarde invalide');let pairs=x.pairs.map(v=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['fg','bg'].includes(k)))throw Error('Palette invalide');return{fg:normalize(v.fg),bg:normalize(v.bg)}});return{version:1,pairs};}
root.ContrastCore={normalize,rgb,luminance,contrast,wcag,bestOn,validateBackup};if(typeof module!=='undefined'&&module.exports)module.exports=root.ContrastCore;
})(typeof window==='undefined'?globalThis:window);
