/* CitationCraft — strict, local, intentionally bounded bibliography interchange. */
(function(root){'use strict';
const MAX_ITEMS=200,MAX_BYTES=512000,MAX_FIELD=4000;
const TYPES=Object.freeze(['article','book','inproceedings','misc']);
const FIELDS=Object.freeze(['id','type','authors','title','year','source','publisher','volume','number','pages','doi','url','note']);
const BIB_FIELDS=Object.freeze({author:'authors',title:'title',year:'year',journal:'source',booktitle:'source',publisher:'publisher',volume:'volume',number:'number',pages:'pages',doi:'doi',url:'url',note:'note'});
const RIS_TYPES=Object.freeze({JOUR:'article',BOOK:'book',CONF:'inproceedings',GEN:'misc'});
const TO_RIS=Object.freeze({article:'JOUR',book:'BOOK',inproceedings:'CONF',misc:'GEN'});
const enc=new TextEncoder();
// Erreurs sous forme de clés traduisibles : « err.cle » ou « err.cle|{"param":…} » (voir messages.js).
function fail(key,params){throw Error(params?key+'|'+JSON.stringify(params):key);}
const code=(key,params)=>key+'|'+JSON.stringify(params); // avertissement traduisible
function bytes(s){return enc.encode(s).length;}
function source(s){if(typeof s!=='string'||bytes(s)>MAX_BYTES)fail('err.fileBig');return s.replace(/^\uFEFF/,'');}
function field(s,name,required=false){
 if(typeof s!=='string'||s.length>MAX_FIELD||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s))fail('err.field',{field:name});
 const t=s.trim();if(required&&!t)fail('err.required',{field:name});return t;
}
function normalize(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!FIELDS.includes(k)))fail('err.refInvalid');
 const id=field(raw.id,'id',true);
 if(!/^[A-Za-z0-9_:-]{1,72}$/.test(id))fail('err.key',{max:72});
 if(!TYPES.includes(raw.type))fail('err.type');
 if(!Array.isArray(raw.authors)||raw.authors.length>30)fail('err.authors',{max:30});
 const authors=raw.authors.map(v=>field(v,'author',true));
 const result={id,type:raw.type,authors,title:field(raw.title,'title',true)};
 for(const key of ['year','source','publisher','volume','number','pages','doi','url','note'])result[key]=field(raw[key]??'',key);
 if(result.year&&!/^\d{4}$/.test(result.year))fail('err.year');
 if(result.doi){
  result.doi=result.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
  if(!/^10\.\d{4,9}\/[^\s<>"]+$/i.test(result.doi))fail('err.doi');
 }
 if(result.url){
  let url;try{url=new URL(result.url);}catch(e){fail('err.url');}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)fail('err.urlProto');
  result.url=url.href;
 }
 return result;
}
function validateLibrary(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1||!Array.isArray(input.items)||Object.keys(input).some(k=>!['version','items'].includes(k)))fail('err.backup');
 if(input.items.length>MAX_ITEMS)fail('err.tooMany',{max:MAX_ITEMS});
 const seen=new Set(),dois=new Set(),items=[];
 for(const raw of input.items){
  const item=normalize(raw),key=item.id.toLowerCase();
  if(seen.has(key))fail('err.dupKey',{id:item.id});
  seen.add(key);
  if(item.doi){
   const d=item.doi.toLowerCase();
   if(dois.has(d))fail('err.dupDoi',{doi:item.doi});
   dois.add(d);
  }
  items.push(item);
 }
 const clean={version:1,items};
 if(bytes(JSON.stringify(clean))>MAX_BYTES)fail('err.libBig');
 return clean;
}
function readerBib(s){
 const value=source(s);let i=0;const warnings=[],items=[];
 const skip=()=>{while(i<value.length&&/\s/.test(value[i]))i++;};
 const ident=()=>{const m=/^[A-Za-z][A-Za-z0-9_-]*/.exec(value.slice(i));if(!m)fail('err.bibIdent',{pos:i});i+=m[0].length;return m[0].toLowerCase();};
 function dataValue(){
  skip();const marker=value[i];let out='';
  if(marker==='{'){
   i++;let depth=1;
   while(i<value.length&&depth){
    const c=value[i++];
    if(c==='\\'&&i<value.length){out+=c+value[i++];continue;}
    if(c==='{'){depth++;out+=c;}
    else if(c==='}'){depth--;if(depth)out+=c;}
    else out+=c;
   }
   if(depth)fail('err.bibBraces');
  }else if(marker==='"'){
   i++;let closed=false;
   while(i<value.length){
    const c=value[i++];
    if(c==='\\'&&i<value.length){out+=c+value[i++];continue;}
    if(c==='"'){closed=true;break;}
    out+=c;
   }
   if(!closed)fail('err.bibQuotes');
  }else{
   // Bare values permitted only for numeric years; @string/macros not interpreted.
   const start=i;
   while(i<value.length&&!/[\s,})]/.test(value[i]))i++;
   out=value.slice(start,i);
   if(!/^\d{4}$/.test(out))fail('err.bibMacro',{value:out});
  }
  return out.trim();
 }
 while(true){
  skip();if(i>=value.length)break;
  if(value[i]!=='@')fail('err.bibAt',{pos:i});
  i++;const type=ident();
  if(!TYPES.includes(type))fail('err.bibType',{type});
  skip();const open=value[i++],close=open==='{'?'}':open==='('?')':null;
  if(!close)fail('err.bibStart');
  skip();const start=i;while(i<value.length&&value[i]!==','&&value[i]!==close)i++;
  const id=value.slice(start,i).trim();if(value[i]!==',')fail('err.bibNoFields',{id});
  i++;
  const raw={id,type,authors:[],title:''};
  const used=new Set();
  while(true){
   skip();if(value[i]===close){i++;break;}
   if(i>=value.length)fail('err.bibUnclosed');
   const name=ident();skip();
   if(value[i++]!=='=')fail('err.bibEquals',{name});
   const v=dataValue();
   if(used.has(name))fail('err.bibDupField',{name});
   used.add(name);
   if(Object.hasOwn(BIB_FIELDS,name)){
    const target=BIB_FIELDS[name];
    if(name==='author')raw.authors=v?v.split(/\s+and\s+/i).map(x=>x.trim()):[];
    else if(name==='journal'||name==='booktitle'){
     if(raw.source&&raw.source!==v)fail('err.bibSourceConflict');
     raw.source=v;
    }else raw[target]=v;
   }else warnings.push(code('warn.bib',{id,name}));
   skip();
   if(value[i]===','){i++;continue;}
   if(value[i]===close){i++;break;}
   fail('err.bibComma',{id});
  }
  items.push(normalize(raw));
  if(items.length>MAX_ITEMS)fail('err.tooMany',{max:MAX_ITEMS});
 }
 if(!items.length)fail('err.bibEmpty');
 return {library:validateLibrary({version:1,items}),warnings};
}
function readerRis(s){
 const value=source(s),lines=value.replace(/\r\n?/g,'\n').split('\n');
 let raw=null,entries=[],warnings=[],number=0,sp='',ep='';
 function finish(){
  if(!raw)fail('err.risErNoTy');
  if(sp||ep)raw.pages=sp&&ep?sp+'-'+ep:(sp||ep);
  entries.push(normalize(raw));
  if(entries.length>MAX_ITEMS)fail('err.tooMany',{max:MAX_ITEMS});
  raw=null;sp='';ep='';
 }
 for(const line of lines){
  number++;
  if(!line.trim())continue;
  const m=/^([A-Z][A-Z0-9])  -(?: ?)(.*)$/.exec(line);
  if(!m)fail('err.risLine',{line:number});
  const [,tag,body]=m;const v=body.trim();
  if(tag==='TY'){
   if(raw)fail('err.risNoEr',{line:number});
   if(!Object.hasOwn(RIS_TYPES,v))fail('err.risType',{type:v});
   raw={id:'ref'+(entries.length+1),type:RIS_TYPES[v],authors:[],title:''};continue;
  }
  if(!raw)fail('err.risTyFirst',{line:number});
  if(tag==='ER'){finish();continue;}
  if(['AU','A1'].includes(tag))raw.authors.push(v);
  else if(['TI','T1'].includes(tag))raw.title=v;
  else if(['PY','Y1'].includes(tag))raw.year=v.slice(0,4);
  else if(['JO','JF','T2'].includes(tag))raw.source=v;
  else if(tag==='PB')raw.publisher=v;
  else if(tag==='VL')raw.volume=v;
  else if(tag==='IS')raw.number=v;
  else if(tag==='SP')sp=v;
  else if(tag==='EP')ep=v;
  else if(tag==='DO')raw.doi=v;
  else if(tag==='UR')raw.url=v;
  else if(tag==='N1')raw.note=v;
  else if(tag==='ID')raw.id=v;
  else warnings.push(code('warn.ris',{line:number,tag}));
 }
 if(raw)fail('err.risUnclosed');
 if(!entries.length)fail('err.risEmpty');
 return {library:validateLibrary({version:1,items:entries}),warnings};
}
function emitBib(lib){
 const b=validateLibrary(lib);
 const label={article:'journal',inproceedings:'booktitle',book:null,misc:null};
 const out=[];
 for(const r of b.items){
  const parts=[['author',r.authors.join(' and ')],['title',r.title],['year',r.year],
   [label[r.type],r.source],['publisher',r.publisher],['volume',r.volume],
   ['number',r.number],['pages',r.pages],['doi',r.doi],['url',r.url],['note',r.note]]
    .filter(([key,value])=>key&&value).map(([key,value])=>{
      // Nested braces allowed only when balanced; malformed markup is rejected rather than broken output.
      let depth=0;
      for(let i=0;i<value.length;i++){
       if(value[i]==='\\'){i++;continue;}
       if(value[i]==='{')depth++;
       if(value[i]==='}'){depth--;if(depth<0)fail('err.bibUnbalanced',{name:key});}
      }
      if(depth)fail('err.bibUnbalanced',{name:key});
      return '  '+key+' = {'+value+'}';
    });
  // For BOOK/MISC we have no standard source mapping: do not silently discard.
  if(r.source&&!label[r.type])fail('err.bibSourceType',{type:r.type});
  out.push('@'+r.type+'{'+r.id+',\n'+parts.join(',\n')+'\n}');
 }
 return out.join('\n\n')+(out.length?'\n':'');
}
function emitRis(lib){
 const {items}=validateLibrary(lib),lines=[];
 for(const r of items){
  const add=(code,v)=>{if(v){if(/[\r\n\u2028\u2029]/u.test(v))fail('err.risMultiline',{code});lines.push(code+'  - '+v);}};
  add('TY',TO_RIS[r.type]);add('ID',r.id);
  for(const author of r.authors)add('AU',author);
  add('TI',r.title);add('PY',r.year);
  add('T2',r.source);add('PB',r.publisher);add('VL',r.volume);add('IS',r.number);
  if(r.pages){
   const m=/^(.+?)\s*[-–]\s*(.+)$/.exec(r.pages);
   if(m){add('SP',m[1]);add('EP',m[2]);}else add('SP',r.pages);
  }
  add('DO',r.doi);add('UR',r.url);add('N1',r.note);
  lines.push('ER  - ','');
 }
 return lines.join('\r\n');
}
// Aperçu auteur-date indicatif. Les mentions conventionnelles (« s. d. » = sans date, auteur absent,
// libellé DOI) suivent la langue de l'interface quand l'appli les fournit ; français par défaut.
const PREVIEW_FR=Object.freeze({noAuthor:'Auteur non indiqué',noDate:'s. d.',doi:'DOI : '});
function preview(ref,labels=PREVIEW_FR){
 const r=normalize(ref);const authors=r.authors.join(', ')||labels.noAuthor;
 const when=r.year||labels.noDate;
 const extra=[r.source,r.volume&&(r.number?r.volume+'('+r.number+')':r.volume),r.pages,r.publisher,r.doi?labels.doi+r.doi:''].filter(Boolean).join(', ');
 return authors+' ('+when+'). '+r.title+'.'+(extra?' '+extra+'.':'');
}
root.CitationCore=Object.freeze({MAX_ITEMS,MAX_BYTES,MAX_FIELD,TYPES,FIELDS,normalize,validateLibrary,readerBib,readerRis,emitBib,emitRis,preview,bytes});
if(typeof module!=='undefined'&&module.exports)module.exports=root.CitationCore;
})(typeof window==='undefined'?globalThis:window);
