(function(root){'use strict';
function normalizeHash(text){if(typeof text!=='string')throw Error('Empreinte attendue invalide');const clean=text.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(clean))throw Error('Une empreinte SHA-256 comporte exactement 64 chiffres hexadécimaux.');return clean;}
function validateFile(f){if(!f||typeof f.size!=='number'||!Number.isFinite(f.size)||f.size<0||f.size>32*1024*1024)throw Error('Fichier invalide ou supérieur à 32 Mo');if(typeof f.name!=='string'||!f.name||f.name.length>255)throw Error('Nom de fichier invalide');return true;}
function bytesToHex(b){return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function digest(buffer,subtle){if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>32*1024*1024)throw Error('Données non valides ou trop volumineuses');if(!subtle||typeof subtle.digest!=='function')throw Error('Web Crypto indisponible');return bytesToHex(await subtle.digest('SHA-256',buffer));}
function compare(computed,expected){return normalizeHash(computed)===normalizeHash(expected);}
root.IntegrityCore={normalizeHash,validateFile,bytesToHex,digest,compare};if(typeof module!=='undefined'&&module.exports)module.exports=root.IntegrityCore;
})(typeof window==='undefined'?globalThis:window);
