/* SizeMatch v2 — domaine de conversion et validation, indépendant du navigateur */
'use strict';
const AppLogic = (() => {
  const MAX = 500, STORAGE_LIMIT = 900000;
  const SPEC = Object.freeze({ slug:'sizematch', title:'SizeMatch', description:'Convertir des mesures quotidiennes, hors ligne', fields:[
    {key:'name',label:'Objet ou usage',type:'text',sample:'Balade du dimanche'},
    {key:'value',label:'Valeur à convertir',type:'number',sample:12},
    {key:'from',label:'Unité de départ',type:'select',sample:'km'},
    {key:'to',label:'Unité d’arrivée',type:'select',sample:'mile'}
  ] });
  // Valeurs reconnues : mètre, kilogramme et litre comme unité de référence.
  // 1 inch = 0,0254 m (définition internationale) ; 1 mile = 1609,344 m.
  const UNITS = Object.freeze({
    km: {dim:'distance',factor:1000,label:'Kilomètre (km)'},
    mile:{dim:'distance',factor:1609.344,label:'Mile international (mi)'},
    m:{dim:'distance',factor:1,label:'Mètre (m)'},
    ft:{dim:'distance',factor:0.3048,label:'Pied international (ft)'},
    cm:{dim:'distance',factor:0.01,label:'Centimètre (cm)'},
    mm:{dim:'distance',factor:0.001,label:'Millimètre (mm)'},
    in:{dim:'distance',factor:0.0254,label:'Pouce (in)'},
    yd:{dim:'distance',factor:0.9144,label:'Yard (yd)'},
    kg:{dim:'masse',factor:1,label:'Kilogramme (kg)'},
    lb:{dim:'masse',factor:0.45359237,label:'Livre (lb)'},
    g:{dim:'masse',factor:0.001,label:'Gramme (g)'},
    oz:{dim:'masse',factor:0.028349523125,label:'Once de masse (oz)'},
    L:{dim:'volume',factor:1,label:'Litre (L)'},
    mL:{dim:'volume',factor:0.001,label:'Millilitre (mL)'},
    'gal US':{dim:'volume',factor:3.785411784,label:'Gallon américain (gal US)'},
    'fl oz US':{dim:'volume',factor:0.0295735295625,label:'Once liquide américaine (fl oz US)'},
    '°C':{dim:'température',label:'Degré Celsius (°C)'},
    '°F':{dim:'température',label:'Degré Fahrenheit (°F)'},
    K:{dim:'température',label:'Kelvin (K)'}
  });
  const GROUPS = Object.freeze({
    distance:['km','mile','m','ft','cm','mm','in','yd'],
    masse:['kg','lb','g','oz'],
    volume:['L','mL','gal US','fl oz US'],
    température:['°C','°F','K']
  });
  function dayKey(d=new Date()) {const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate());}
  function validDate(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const [y,m,d]=s.split('-').map(Number);const z=new Date(y,m-1,d,12);return z.getFullYear()===y&&z.getMonth()+1===m&&z.getDate()===d;}
  function toDay(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12);}
  function diffDays(s,t){return Math.round((toDay(s)-toDay(t))/86400000);}
  function addDays(s,n){const d=toDay(s);d.setDate(d.getDate()+n);return dayKey(d);}
  function eur(cents){return (cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});}
  function assertNumber(value){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>100000000)throw Error('La valeur doit être un nombre fini entre -100 000 000 et 100 000 000');}
  function category(unit){if(!Object.hasOwn(UNITS,unit))throw Error('Unité inconnue : '+String(unit));return UNITS[unit].dim;}
  function toKelvin(v,unit){return unit==='°C'?v+273.15:unit==='°F'?(v+459.67)*5/9:v;}
  function fromKelvin(k,unit){return unit==='°C'?k-273.15:unit==='°F'?k*9/5-459.67:k;}
  function convert(value,from,to){
    assertNumber(value);
    const dim=category(from);
    if(category(to)!==dim)throw Error('Les unités doivent appartenir à la même catégorie');
    let answer;
    if(dim==='température'){
      let kelvin=toKelvin(value,from);
      if(kelvin < -1e-10)throw Error('Température sous le zéro absolu');
      if(kelvin<0)kelvin=0;
      answer=fromKelvin(kelvin,to);
      // Corrige les artefacts arithmétiques près de zéro sans modifier les valeurs physiques.
      if(Math.abs(answer)<1e-12)answer=0;
    } else {
      if(value<0)throw Error('Une longueur, masse ou quantité négative est impossible');
      answer=value*UNITS[from].factor/UNITS[to].factor;
    }
    if(!Number.isFinite(answer))throw Error('Conversion numérique hors limites');
    return answer;
  }
  function formatValue(value){
    if(!Number.isFinite(value))throw Error('Valeur à afficher invalide');
    if(value===0)return '0';
    const a=Math.abs(value);
    if(a<0.00000001||a>=1000000000)return value.toExponential(6).replace('e+','e');
    return new Intl.NumberFormat('fr-FR',{maximumSignificantDigits:9,useGrouping:true}).format(value);
  }
  function normalizeRecord(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!/^[A-Za-z0-9_-]{4,80}$/.test(raw.id))throw Error('Identifiant invalide');
    if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>160)throw Error('Nom requis, 160 caractères maximum');
    assertNumber(raw.value);
    const dim=category(raw.from);
    if(category(raw.to)!==dim)throw Error('Choisir deux unités de la même catégorie');
    convert(raw.value,raw.from,raw.to);
    return {id:raw.id,name:raw.name.trim(),value:raw.value,from:raw.from,to:raw.to};
  }
  function validateBackup(json){
    if(!json||typeof json!=='object'||Array.isArray(json)||json.app!=='sizematch'||json.version!==1||!Array.isArray(json.records)||json.records.length>MAX)throw Error('Sauvegarde incompatible (SizeMatch v1 requis)');
    if(JSON.stringify(json).length>STORAGE_LIMIT)throw Error('Sauvegarde trop volumineuse');
    const used=new Set();return json.records.map(o=>{const n=normalizeRecord(o);if(used.has(n.id))throw Error('Identifiant en double');used.add(n.id);return n;});
  }
  function backup(records){const r=validateBackup({app:'sizematch',version:1,records});return JSON.stringify({app:'sizematch',version:1,exportedAt:new Date().toISOString(),records:r},null,2);}
  function compute(records,today=dayKey()){
    if(!validDate(today))throw Error('Date du jour invalide');
    const r=validateBackup({app:'sizematch',version:1,records});
    const types=new Set(r.map(x=>category(x.from)));
    return {kpis:[['Conversions',String(r.length)],['Compatibles',String(r.length)],['Catégories',String(types.size)]],
      notes:['Calculs hors ligne. Facteurs internationaux ou unités américaines explicitement identifiées ; les affichages sont arrondis, pas les valeurs enregistrées.'],
      rows:r.slice(-20).reverse().map(x=>x.name+' : '+formatValue(x.value)+' '+x.from+' → '+formatValue(convert(x.value,x.from,x.to))+' '+x.to)};
  }
  function csvCell(v){const s=String(v);const safe=/^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s;return '"'+safe.replaceAll('"','""')+'"';}
  function toCSV(records){const r=validateBackup({app:'sizematch',version:1,records});let rows=[['Nom','Valeur initiale','Unité initiale','Valeur convertie','Unité cible','Catégorie']];for(const item of r){rows.push([item.name,item.value,item.from,convert(item.value,item.from,item.to),item.to,category(item.from)])}return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');}
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,UNITS,GROUPS,dayKey,validDate,diffDays,addDays,eur,category,convert,formatValue,normalizeRecord,validateBackup,backup,compute,toCSV});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;