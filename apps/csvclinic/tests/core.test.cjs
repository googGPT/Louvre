const t=require('node:test'),a=require('node:assert/strict'),C=require('../core.js');
t('détecte les virgules',()=>a.equal(C.inferDelimiter('a,b\n1,2'),','));
t('détecte point virgule',()=>a.equal(C.inferDelimiter('a;b\n1;2'),';'));
t('lit CSV ordinaire',()=>a.deepEqual(C.parse('a,b\n1,2',',').rows,[['a','b'],['1','2']]));
t('lit champ cité avec virgule',()=>a.equal(C.parse('a,b\n"salut, toi",z',',').rows[1][0],'salut, toi'));
t('lit quotes doublés',()=>a.equal(C.parse('a,b\n"x""y",z',',').rows[1][0],'x"y'));
t('lit champ multiligne',()=>a.equal(C.parse('a,b\n"x\ny",z',',').rows[1][0],'x\ny'));
t('rejette quotes non fermés',()=>a.throws(()=>C.parse('a,b\n"x,z',',')));
t('rejette colonnes incohérentes',()=>a.throws(()=>C.parse('a,b\nx',',')));
t('rejette trop de colonnes',()=>a.throws(()=>C.parse('a,b\n1,2,3',',')));
t('nettoie espaces et doublons complets',()=>{let x=C.normalizeTable(C.parse('A,B\n x , y \nx,y\nz,t',','),{trim:true,dedupe:'full'});a.equal(x.after,2);a.equal(x.removed,1)});
t('déduplique première colonne',()=>{let x=C.normalizeTable(C.parse('A,B\nx,y\nx,z',','),{trim:true,dedupe:'first'});a.equal(x.after,1)});
t('sans déduplication conserve les doublons',()=>{let x=C.normalizeTable(C.parse('A\nx\nx',','),{trim:true,dedupe:'none'});a.equal(x.after,2)});
t('refuse entêtes identiques',()=>a.throws(()=>C.normalizeTable(C.parse('a,a\n1,2',','),{trim:true,dedupe:'full'})));
t('n’injecte pas formules Excel à l’export',()=>a.ok(C.stringify([['Cellule'],['=HYPERLINK(1)']],',').includes("'=HYPERLINK")));
t('échappe virgule et quotes',()=>a.equal(C.quote('"salut,toi"',','),'"""salut,toi"""'));
t('rejette options de déduplication inconnues',()=>a.throws(()=>C.normalizeTable(C.parse('a\nx',','),{trim:true,dedupe:'x'})));


t('infère tabulation sur plusieurs enregistrements',()=>a.equal(C.inferDelimiter('Nom\tValeur\nA\t1\nB\t2'),'\t'));
t('détecte point-virgule et ignore des virgules citées',()=>a.equal(C.inferDelimiter('"Nom, complet";Valeur\n"A, B";1\n"C, D";2'),';'));
t('détecte séparateur au-delà d’un entête vide ambigu',()=>a.equal(C.inferDelimiter('Entête\nA;B\nC;D'),';'));
t('supporte BOM UTF-8',()=>a.deepEqual(C.parse('\uFEFFa,b\n1,2','auto').rows,[['a','b'],['1','2']]));
t('supporte fin de ligne CRLF, CR et LF',()=>{
 for(const eol of ['\r\n','\r','\n'])a.deepEqual(C.parse('a,b'+eol+'1,2'+eol+'3,4','auto').rows,[['a','b'],['1','2'],['3','4']]);
});
t('préserve cellules quoted vides en fin de ligne',()=>a.deepEqual(C.parse('A,B\nx,""',',').rows,[['A','B'],['x','']]));
t('préserve tab et retour de ligne dans les champs cités',()=>a.equal(C.parse('A,B\n"x\t\r\ny",ok',',').rows[1][0],'x\t\r\ny'));
t('rejette guillemets non échappés au milieu d’un champ',()=>a.throws(()=>C.parse('a,b\nv"u,x',','),/Guillemet non échappé/));
t('rejette caractère après guillemets',()=>a.throws(()=>C.parse('a,b\n"x"y,z',','),/Caractère après/));
t('accepte espace après guillemets fermants en tolérance',()=>a.equal(C.parse('A,B\n"x"  ,z',',').rows[1][0],'x'));
t('refuse tabulateur comme séparateur implicite si virgule choisie',()=>a.throws(()=>C.parse('a,b\n1\t2',','),/incohérent/));
t('aucun résultat CSV pour un seul en-tête',()=>a.throws(()=>C.parse('A,B',','),/Au moins/));
t('limite d’entrée mesurée en octets et non caractères JS',()=>{
 const data='A\n'+'é'.repeat(530000);a.ok(data.length<C.MAX_SOURCE_BYTES);
 a.throws(()=>C.parse(data,','),/volumineuse/);
});
t('maximum 5 000 lignes de données accepté',()=>{
 const s='A\n'+Array.from({length:5000},()=>('x')).join('\n');a.equal(C.parse(s,',').rows.length,5001);
});
t('5 001 lignes de données refusées',()=>a.throws(()=>C.parse('A\n'+'x\n'.repeat(5001),','),/5 000 lignes/));
t('40 colonnes acceptées et 41 refusées',()=>{
 const h=Array.from({length:40},(_,i)=>'H'+i).join(','),v=Array(40).fill('x').join(',');
 a.equal(C.parse(h+'\n'+v,',').rows[0].length,40);
 a.throws(()=>C.parse(h+',H40\n'+v+',x',','),/40 colonnes/);
});
t('refuse lignes de longueurs différentes avec numéro de ligne',()=>a.throws(()=>C.parse('A;B\n1;2\n3',';'),/ligne 3/));
t('rejet de tableaux forgés avec mauvaises cellules ou colonnes',()=>{
 for(const table of [
  {delimiter:',',rows:[['a'],['x',1]]},
  {delimiter:',',rows:[['a'],[null]]},
  {delimiter:'|',rows:[['a'],['x']]},
  {delimiter:',',rows:[[],[]]}
 ])a.throws(()=>C.normalizeTable(table,{trim:true,dedupe:'none'}));
});
t('en-têtes uniquement espaces deviennent invalides après trim',()=>a.throws(()=>C.normalizeTable(C.parse('   ,B\n1,2',','),{trim:true,dedupe:'full'}),/En-tête vide/));
t('entêtes fusionnés par trim sont refusés',()=>a.throws(()=>C.normalizeTable(C.parse(' A,A \n1,2',','),{trim:true,dedupe:'full'}),/dupliqués/));
t('doublons préservent l’ordre original',()=>{
 const r=C.normalizeTable(C.parse('ID,Value\n1,A\n2,B\n1,A\n3,C',','),{trim:true,dedupe:'full'});
 a.deepEqual(r.rows.slice(1),[['1','A'],['2','B'],['3','C']]);
});
t('first conserve lignes dont la clé est vide sans perte silencieuse',()=>{
 const r=C.normalizeTable(C.parse('ID,Value\n,A\n,B\nx,C\nx,D',','),{trim:true,dedupe:'first'});
 a.equal(r.blankKeys,2);a.equal(r.after,3);a.equal(r.removed,1);
});
t('mode full déduplique la ligne vide seulement si elle est identique',()=>{
 const r=C.normalizeTable(C.parse('ID,Value\n,A\n,B\n,A',','),{trim:true,dedupe:'full'});
 a.equal(r.after,2);a.equal(r.removed,1);
});
t('mode none ne déduplique aucune ligne malgré clés vides',()=>{
 const r=C.normalizeTable(C.parse('ID\n\n\nx',','),{trim:true,dedupe:'none'});
 a.equal(r.after,3);a.equal(r.removed,0);
});
t('export neutre texte normal et guillemets corrects',()=>{
 const x=C.stringify([['A','B'],['bonjour','x,y']],',');
 a.deepEqual(C.parse(x,',').rows,[['A','B'],['bonjour','x,y']]);
});
t('formules neutralisées même précédées d’espaces',()=>{
 for(const x of ['=1+1','+CMD','-SUM(3)','@SUM(3)','  =SUM(A1)','\t+1','\u200B=CMD','\uFEFF@SUM'])
  a.ok(C.quote(x,',').includes("'"),x);
});
t('texte non dangereux inchangé, y compris nombres positifs non formulaires',()=>{
 for(const x of ['texte','1+1','2026','abc@example.com'])a.equal(C.quote(x,','),x);
});
t('champs suspects CSV restent dans une seule cellule après sérialisation',()=>{
 const v=' \t=HYPERLINK("http://site", "clic")';
 const out=C.stringify([['Titre'],[v]],',');
 a.equal(C.parse(out,',').rows[1][0],"'"+v);
});
t('export multi-colonne supporte séparateur tabulation',()=>{
 const csv=C.stringify([['A','B'],['one','two']],'\t');
 a.deepEqual(C.parse(csv,'\t').rows,[['A','B'],['one','two']]);
});
t('rejette export avec données incohérentes',()=>{for(const table of [[],[['a'],[4]],[['a'],['x','y']]])a.throws(()=>C.stringify(table,','));});
t('nombre d’octets UTF-8 exact',()=>a.equal(C.utf8Size('Été 🍀'),9));
