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
  // key : nom de l'unité traduit par l'interface (messages.js, unit.<key>).
  // 1 inch = 0,0254 m (définition internationale) ; 1 mile = 1609,344 m.
  const UNITS = Object.freeze({
    km: {dim:'distance',factor:1000,key:'km'},
    mile:{dim:'distance',factor:1609.344,key:'mile'},
    m:{dim:'distance',factor:1,key:'m'},
    ft:{dim:'distance',factor:0.3048,key:'ft'},
    cm:{dim:'distance',factor:0.01,key:'cm'},
    mm:{dim:'distance',factor:0.001,key:'mm'},
    in:{dim:'distance',factor:0.0254,key:'in'},
    yd:{dim:'distance',factor:0.9144,key:'yd'},
    kg:{dim:'masse',factor:1,key:'kg'},
    lb:{dim:'masse',factor:0.45359237,key:'lb'},
    g:{dim:'masse',factor:0.001,key:'g'},
    oz:{dim:'masse',factor:0.028349523125,key:'oz'},
    L:{dim:'volume',factor:1,key:'l'},
    mL:{dim:'volume',factor:0.001,key:'ml'},
    'gal US':{dim:'volume',factor:3.785411784,key:'galUS'},
    'fl oz US':{dim:'volume',factor:0.0295735295625,key:'flozUS'},
    '°C':{dim:'température',key:'c'},
    '°F':{dim:'température',key:'f'},
    K:{dim:'température',key:'k'}
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
  function assertNumber(value){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>100000000)throw Error('err.number');}
  function category(unit){if(!Object.hasOwn(UNITS,unit))throw Error('err.unknownUnit|'+JSON.stringify({unit:String(unit)}));return UNITS[unit].dim;}
  function toKelvin(v,unit){return unit==='°C'?v+273.15:unit==='°F'?(v+459.67)*5/9:v;}
  function fromKelvin(k,unit){return unit==='°C'?k-273.15:unit==='°F'?k*9/5-459.67:k;}
  function convert(value,from,to){
    assertNumber(value);
    const dim=category(from);
    if(category(to)!==dim)throw Error('err.sameCategory');
    let answer;
    if(dim==='température'){
      // Contrôle des bornes dans l'unité source : aucune tolérance permettant
      // d'accepter des températures physiques négatives en kelvins.
      if((from==='K'&&value<0)||(from==='°C'&&value< -273.15)||(from==='°F'&&value< -459.67))
        throw Error('err.absoluteZero');
      const kelvin=toKelvin(value,from);
      // Celsius ↔ Fahrenheit utilise une transformation affine directe :
      // évite l'erreur flottante d'un aller-retour artificiel via Kelvin
      // (par exemple −20 °C doit produire exactement −4 °F dans le CSV).
      if(from==='°C'&&to==='°F')answer=value*9/5+32;
      else if(from==='°F'&&to==='°C')answer=(value-32)*5/9;
      else if(from===to)answer=value;
      else answer=fromKelvin(kelvin,to);
      // Ne jamais écraser une température valide proche de zéro :
      // 1e-13 K et -1e-13 °C doivent rester inchangés si les unités sont identiques.
    } else {
      if(value<0)throw Error('err.negative');
      answer=value*UNITS[from].factor/UNITS[to].factor;
    }
    if(!Number.isFinite(answer))throw Error('err.overflow');
    return answer;
  }
  // locale : langue d'affichage (séparateurs décimaux et de milliers).
  function formatValue(value,locale='fr-FR'){
    if(!Number.isFinite(value))throw Error('err.display');
    if(value===0)return '0';
    const a=Math.abs(value);
    if(a<0.00000001||a>=1000000000)return value.toExponential(8).replace('e+','e');
    return new Intl.NumberFormat(locale,{maximumSignificantDigits:9,useGrouping:true}).format(value);
  }
  function normalizeRecord(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!/^[A-Za-z0-9_-]{4,80}$/.test(raw.id))throw Error('err.id');
    if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>160)throw Error('err.name');
    assertNumber(raw.value);
    const dim=category(raw.from);
    if(category(raw.to)!==dim)throw Error('err.sameCategory');
    convert(raw.value,raw.from,raw.to);
    return {id:raw.id,name:raw.name.trim(),value:raw.value,from:raw.from,to:raw.to};
  }
  function validateBackup(json){
    if(!json||typeof json!=='object'||Array.isArray(json)||json.app!=='sizematch'||json.version!==1||!Array.isArray(json.records)||json.records.length>MAX)throw Error('err.backup');
    if(JSON.stringify(json).length>STORAGE_LIMIT)throw Error('err.backupBig');
    const used=new Set();return json.records.map(o=>{const n=normalizeRecord(o);if(used.has(n.id))throw Error('err.duplicate');used.add(n.id);return n;});
  }
  function backup(records){const r=validateBackup({app:'sizematch',version:1,records});return JSON.stringify({app:'sizematch',version:1,exportedAt:new Date().toISOString(),records:r},null,2);}
  function compute(records,today=dayKey()){
    if(!validDate(today))throw Error('err.date');
    const r=validateBackup({app:'sizematch',version:1,records});
    const types=new Set(r.map(x=>category(x.from)));
    // kpis : [clé de traduction, valeur] ; l'interface traduit le libellé.
    return {kpis:[['kpi.conversions',String(r.length)],['kpi.compatible',String(r.length)],['kpi.categories',String(types.size)]],
      rows:r.slice(-20).reverse().map(x=>x.name+' : '+formatValue(x.value)+' '+x.from+' → '+formatValue(convert(x.value,x.from,x.to))+' '+x.to)};
  }
  // Les mesures numériques demeurent des nombres dans Excel (y compris les négatives).
  // Seules les chaînes peuvent contenir une formule hostile ; elles sont protégées.
  function csvCell(v,decimal=','){
    if(typeof v==='number'){
      if(!Number.isFinite(v))throw Error('err.csvNumber');
      return String(v).replace('.',decimal); // virgule décimale (Excel français, allemand…) ou point ; séparateur CSV « ; »
    }
    const value=String(v);
    const safe=/^[\s]*[=+@\-\t\r]/.test(value)?"'"+value:value;
    return '"'+safe.replaceAll('"','""')+'"';
  }
  // opts (fourni par l'interface) : headers = 6 titres de colonnes, catName = nom affiché d'une catégorie, decimal = ',' ou '.'.
  function toCSV(records,opts){if(!opts||!Array.isArray(opts.headers)||opts.headers.length!==6)throw Error('err.csvHeaders');const decimal=opts.decimal==='.'?'.':',',catName=opts.catName||(c=>c);const r=validateBackup({app:'sizematch',version:1,records});let rows=[opts.headers];for(const item of r){rows.push([item.name,item.value,item.from,convert(item.value,item.from,item.to),item.to,catName(category(item.from))])}return '\uFEFF'+rows.map(row=>row.map(v=>csvCell(v,decimal)).join(';')).join('\r\n');}
  return Object.freeze({SPEC,MAX,STORAGE_LIMIT,UNITS,GROUPS,dayKey,validDate,diffDays,addDays,category,convert,formatValue,normalizeRecord,validateBackup,backup,compute,toCSV});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=AppLogic;