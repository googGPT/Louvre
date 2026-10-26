/* CSVClinic v2 — strict, bounded RFC-4180-style parser and safe spreadsheet export. */
(function(root){'use strict';
const MAX_SOURCE_BYTES=1050000,MAX_DATA_ROWS=5000,MAX_COLUMNS=40;
const DELIMITERS=[',',';','\t'];
const encoder=typeof TextEncoder==='function'?new TextEncoder():null;
function fail(message){throw new Error(message);}
function utf8Size(value){
 if(encoder)return encoder.encode(value).length;
 if(typeof Buffer!=='undefined')return Buffer.byteLength(value,'utf8');
 fail('UTF-8 non disponible');
}
function sniff(text,delimiter){
 let counts=[],cols=1,quote=false,rowData=false;
 for(let i=0;i<text.length&&i<32000&&counts.length<12;i++){
  const c=text[i];
  if(c==='"'){
   if(quote&&text[i+1]==='"'){i++;continue;}
   quote=!quote;
  }else if(!quote&&c===delimiter){cols++;rowData=true;}
  else if(!quote&&(c==='\r'||c==='\n')){
   if(c==='\r'&&text[i+1]==='\n')i++;
   if(rowData||cols>1)counts.push(cols);
   cols=1;rowData=false;
  }else rowData=true;
 }
 if(cols>1)counts.push(cols);
 const meaningful=counts.filter(n=>n>1);
 if(!meaningful.length)return {score:0,consistent:0,columns:1};
 const count=new Map();
 for(const n of meaningful)count.set(n,(count.get(n)||0)+1);
 const [columns,consistent]=[...count].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0];
 // Prefer a delimiter that appears repeatedly in a stable table, not in prose.
 return {score:consistent*100+(meaningful.length===consistent?20:0)+Math.min(columns,MAX_COLUMNS),consistent,columns};
}
function inferDelimiter(value){
 if(typeof value!=='string')fail('Source CSV invalide');
 const text=value.replace(/^\uFEFF/,'');
 const rank=DELIMITERS.map(d=>({delimiter:d,...sniff(text,d)})).sort((a,b)=>b.score-a.score);
 return rank[0].score>0?rank[0].delimiter:',';
}
function parse(text,delimiter='auto'){
 if(typeof text!=='string'||utf8Size(text)>MAX_SOURCE_BYTES)fail('Source trop volumineuse (1 Mo maximum)');
 const sep=delimiter==='auto'?inferDelimiter(text):delimiter;
 if(!DELIMITERS.includes(sep))fail('Séparateur invalide');
 const source=text.replace(/^\uFEFF/,'');
 let rows=[],row=[],cell='',quoted=false,afterQuote=false,fieldStart=true;
 function append(){
  row.push(cell);cell='';fieldStart=true;
  if(row.length>MAX_COLUMNS)fail('Plus de 40 colonnes');
 }
 function finish(){
  append();rows.push(row);row=[];
  if(rows.length>MAX_DATA_ROWS+1)fail('Plus de 5 000 lignes de données');
 }
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){
   if(c==='"'){
    if(source[i+1]==='"'){cell+='"';i++;}
    else{quoted=false;afterQuote=true;}
   }else cell+=c;
   continue;
  }
  if(afterQuote){
   if(c===sep){append();afterQuote=false;continue;}
   if(c==='\r'||c==='\n'){
    finish();afterQuote=false;if(c==='\r'&&source[i+1]==='\n')i++;continue;
   }
   if(c===' '||c==='\t')continue;
   fail('Caractère après des guillemets fermants (ligne '+(rows.length+1)+')');
  }
  if(c==='"'){
   if(!fieldStart)fail('Guillemet non échappé (ligne '+(rows.length+1)+')');
   quoted=true;fieldStart=false;continue;
  }
  if(c===sep){append();continue;}
  if(c==='\r'||c==='\n'){
   finish();if(c==='\r'&&source[i+1]==='\n')i++;continue;
  }
  fieldStart=false;cell+=c;
 }
 if(quoted)fail('Guillemet non fermé');
 if(afterQuote||cell!==''||row.length>0)finish();
 if(rows.length<2)fail('Au moins un en-tête et une ligne de données sont nécessaires');
 const columns=rows[0].length;
 if(columns<1||columns>MAX_COLUMNS)fail('Nombre de colonnes invalide');
 for(let i=1;i<rows.length;i++)
  if(rows[i].length!==columns)fail('Nombre de colonnes incohérent à la ligne '+(i+1)+' : '+rows[i].length+' au lieu de '+columns);
 return {delimiter:sep,rows};
}
function normalizeTable(parsed,options){
 if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.rows)||parsed.rows.length<2||parsed.rows.length>MAX_DATA_ROWS+1||!DELIMITERS.includes(parsed.delimiter))fail('Table invalide');
 if(!options||typeof options!=='object'||!['full','first','none'].includes(options.dedupe)||typeof options.trim!=='boolean')fail('Options invalides');
 const rows=parsed.rows;
 const width=rows[0]&&Array.isArray(rows[0])?rows[0].length:0;
 if(width<1||width>MAX_COLUMNS)fail('Colonnes invalides');
 for(let i=0;i<rows.length;i++)if(!Array.isArray(rows[i])||rows[i].length!==width||rows[i].some(v=>typeof v!=='string'))fail('Ligne invalide : '+(i+1));
 const clean=value=>options.trim?value.trim():value;
 const headers=rows[0].map(clean);
 if(headers.some(h=>!h))fail('En-tête vide');
 if(new Set(headers).size!==headers.length)fail('En-têtes dupliqués après normalisation');
 const seen=new Set(),data=[];let removed=0,blankKeys=0;
 for(let i=1;i<rows.length;i++){
  const values=rows[i].map(clean);
  if(options.dedupe==='none'){data.push(values);continue;}
  const keyValues=options.dedupe==='first'?[values[0]]:values;
  // Avoid silently merging unrelated records with blank keys in first-column mode.
  if(options.dedupe==='first'&&values[0]===''){blankKeys++;data.push(values);continue;}
  const key=JSON.stringify(keyValues);
  if(seen.has(key)){removed++;continue;}
  seen.add(key);data.push(values);
 }
 return {rows:[headers,...data],before:rows.length-1,after:data.length,removed,blankKeys,delimiter:parsed.delimiter};
}
// Leading control/format characters before = + - @ can trigger spreadsheet formulas.
const FORMULA=/^[\s\uFEFF\u200B-\u200D\u2060\u00A0]*[=+\-@]/u;
function quote(cell,sep){
 if(typeof cell!=='string'||!DELIMITERS.includes(sep))fail('Cellule ou séparateur invalide');
 const safe=FORMULA.test(cell)?"'"+cell:cell;
 return safe.includes(sep)||/["\r\n]/.test(safe)?'"'+safe.replace(/"/g,'""')+'"':safe;
}
function stringify(rows,sep){
 if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_DATA_ROWS+1||!DELIMITERS.includes(sep))fail('Export invalide');
 const width=Array.isArray(rows[0])?rows[0].length:0;
 if(width<1||width>MAX_COLUMNS)fail('Colonnes invalides');
 for(const row of rows)if(!Array.isArray(row)||row.length!==width||row.some(c=>typeof c!=='string'))fail('Données d’export invalides');
 const output='\uFEFF'+rows.map(row=>row.map(value=>quote(value,sep)).join(sep)).join('\r\n')+'\r\n';
 if(utf8Size(output)>MAX_SOURCE_BYTES*3)fail('Export trop volumineux');
 return output;
}
root.CSVCore=Object.freeze({MAX_SOURCE_BYTES,MAX_DATA_ROWS,MAX_COLUMNS,inferDelimiter,parse,normalizeTable,stringify,quote,utf8Size});
if(typeof module!=='undefined'&&module.exports)module.exports=root.CSVCore;
})(typeof window==='undefined'?globalThis:window);
