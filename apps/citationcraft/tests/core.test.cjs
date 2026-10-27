const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
const ref=(patch={})=>({id:'Dupont2026',type:'article',authors:['Dupont, Jeanne','Martin, Paul'],title:'Risque et climat',year:'2026',source:'Revue Finance',publisher:'',volume:'12',number:'2',pages:'12-24',doi:'10.1234/Climate.26',url:'https://example.org/article',note:'Relecture',...patch});
const lib=(items=[ref()])=>({version:1,items});
test('reference canonique conserve les champs attendus',()=>assert.deepEqual(C.normalize(ref()),ref()));
test('titre et clé obligatoires',()=>{for(const k of ['title','id'])assert.throws(()=>C.normalize(ref({[k]:''})));});
test('types pris en charge explicitement',()=>assert.deepEqual(C.TYPES,['article','book','inproceedings','misc']));
test('type inconnu refusé',()=>assert.throws(()=>C.normalize(ref({type:'thesis'})),/^Error: err\.type$/));
test('champs externes non reconnus refusés',()=>assert.throws(()=>C.normalize({...ref(),abstract:'non géré'}),/err\.refInvalid/));
test('clés bibliographiques dangereuses refusées',()=>{for(const id of ['bad key','evil}entry','a/b',''])assert.throws(()=>C.normalize(ref({id})));});
test('clés accentuées ou trop longues explicitement refusées',()=>{for(const id of ['été','x'.repeat(73)])assert.throws(()=>C.normalize(ref({id})));});
test('années obligatoirement sur quatre chiffres si renseignées',()=>{for(const year of ['26','2026/10','in press'])assert.throws(()=>C.normalize(ref({year})));assert.equal(C.normalize(ref({year:''})).year,'');});
test('auteurs vides autorisés sans inventer un auteur',()=>assert.deepEqual(C.normalize(ref({authors:[]})).authors,[]));
test('auteur vide et plus de trente auteurs refusés',()=>{assert.throws(()=>C.normalize(ref({authors:['']})));assert.throws(()=>C.normalize(ref({authors:Array(31).fill('A')})));});
test('URL http et https sans identifiants autorisées',()=>{assert.equal(C.normalize(ref({url:'http://example.org'})).url,'http://example.org/');assert.equal(C.normalize(ref({url:''})).url,'');});
test('URL javascript / data / file refusées',()=>{for(const url of ['javascript:alert(1)','data:text/plain,abc','file:///etc/a'])assert.throws(()=>C.normalize(ref({url})));});
test('URL avec nom utilisateur ou mot de passe refusée',()=>assert.throws(()=>C.normalize(ref({url:'https://a:secret@example.com'}))));
test('DOI préfixé doi.org devient DOI canonique',()=>assert.equal(C.normalize(ref({doi:'https://doi.org/10.1234/Test'})).doi,'10.1234/Test'));
test('DOI invalide explicitement rejeté',()=>{for(const doi of ['abc','10/foo','https://other.org/a'])assert.throws(()=>C.normalize(ref({doi})));});
test('contrôles de caractère et longueur sur chaque champ',()=>{assert.throws(()=>C.normalize(ref({title:'x'.repeat(4001)})));assert.throws(()=>C.normalize(ref({title:'abc\u0000def'})));});
test('bibliothèque vide valide',()=>assert.deepEqual(C.validateLibrary(lib([])),lib([])));
test('sauvegarde JSON v1 stricte',()=>{for(const x of [null,{},[],{version:2,items:[]},{version:1,items:[],extra:0}])assert.throws(()=>C.validateLibrary(x));});
test('identifiant en double insensible à la casse interdit',()=>assert.throws(()=>C.validateLibrary(lib([ref(),ref({id:'dupont2026',doi:''})])),/^Error: err\.dupKey\|\{"id":"dupont2026"\}$/));
test('DOI en double insensible à la casse interdit',()=>assert.throws(()=>C.validateLibrary(lib([ref(),ref({id:'B',doi:'10.1234/climate.26'})])),/err\.dupDoi/));
test('200 références acceptées',()=>{const refs=Array.from({length:200},(_,i)=>ref({id:'R'+i,doi:''}));assert.equal(C.validateLibrary(lib(refs)).items.length,200);});
test('201 références refusées',()=>assert.throws(()=>C.validateLibrary(lib(Array.from({length:201},(_,i)=>ref({id:'R'+i,doi:''})))),/err\.tooMany\|\{"max":200\}/));
test('source de plus de 512 Ko UTF-8 refusée',()=>assert.throws(()=>C.readerBib('é'.repeat(260000)),/err\.fileBig/));
test('parsing article BibTeX simple',()=>{
 const bib='@article{Dupont2026,\n author = {Dupont, Jeanne and Martin, Paul},\n title = {Risque et climat},\n year = 2026,\n journal = {Revue Finance},\n doi = {10.1234/Climate.26}\n}';
 const result=C.readerBib(bib);
 assert.equal(result.library.items[0].title,'Risque et climat');
 assert.deepEqual(result.library.items[0].authors,['Dupont, Jeanne','Martin, Paul']);
 assert.equal(result.library.items[0].source,'Revue Finance');assert.equal(result.warnings.length,0);
});
test('BibTeX nested braces conservées',()=>{
 const r=C.readerBib('@article{A,title={The {AI} Era},author={Doe, Jane}}').library.items[0];
 assert.equal(r.title,'The {AI} Era');
 assert.ok(C.emitBib(lib([r])).includes('title = {The {AI} Era}'));
});
test('BibTeX guillemets acceptés',()=>assert.equal(C.readerBib('@book(A,title="Livre",year=2024)').library.items[0].year,'2024'));
test('BibTeX corps multiligne cité accepté',()=>assert.equal(C.readerBib('@misc{X,title={Première\nseconde}}').library.items[0].title,'Première\nseconde'));
test('BibTeX doubles entrées acceptées',()=>assert.equal(C.readerBib('@misc{A,title={A}}\n@misc{B,title={B}}').library.items.length,2));
test('BibTeX champs inconnus signalés sans inventer leurs valeurs',()=>{
 const r=C.readerBib('@misc{A,title={A},abstract={Secret},keywords={x}}');
 assert.equal(r.warnings.length,2);assert.equal(r.library.items[0].title,'A');
});
test('BibTeX macro non implémentée explicitement rejetée',()=>assert.throws(()=>C.readerBib('@article{A,title={A},month=jan}'),/err\.bibMacro/));
test('BibTeX types non couverts rejetés',()=>assert.throws(()=>C.readerBib('@phdthesis{A,title={A}}'),/err\.bibType/));
test('BibTeX accolades non fermées rejetées',()=>assert.throws(()=>C.readerBib('@article{A,title={Unclosed}'),/err\.bib(Unclosed|Comma)/));
test('BibTeX guillemets non fermés rejetés',()=>assert.throws(()=>C.readerBib('@article{A,title="Unclosed}'),/err\.bibQuotes/));
test('BibTeX champ répété explicitement refusé',()=>assert.throws(()=>C.readerBib('@misc{A,title={A},title={B}}'),/err\.bibDupField/));
test('BibTeX format injection hors champs refusée',()=>assert.throws(()=>C.readerBib('hello @misc{A,title={A}}'),/err\.bibAt/));
test('BibTeX round trip article avec DOI Unicode',()=>{
 const original=ref({title:'Énergie {ESG} et {AI}',doi:'10.1234/Energie'});
 const loaded=C.readerBib(C.emitBib(lib([original]))).library.items[0];
 assert.deepEqual(loaded,C.normalize(original));
});
test('BibTeX round trip conférence avec booktitle',()=>{
 const x=ref({type:'inproceedings',source:'Conférence IA',doi:''});
 const b=C.emitBib(lib([x]));
 assert.ok(b.includes('booktitle = {Conférence IA}'));
 assert.deepEqual(C.readerBib(b).library.items[0],C.normalize(x));
});
test('BibTeX refuse pertes de source pour books/misc',()=>assert.throws(()=>C.emitBib(lib([ref({type:'book',source:'Revue'})])),/err\.bibSourceType/));
test('BibTeX refuse accolades non équilibrées plutôt que d’exporter un flux corrompu',()=>assert.throws(()=>C.emitBib(lib([ref({title:'Broken {AI'})])),/err\.bibUnbalanced/));
test('RIS article standard multi-auteur',()=>{
 const ris='TY  - JOUR\r\nID  - Test\r\nAU  - Doe, Jane\r\nAU  - Smith, Anna\r\nTI  - Réchauffement\r\nPY  - 2025\r\nJO  - Science Journal\r\nSP  - 10\r\nEP  - 15\r\nDO  - 10.1234/ref\r\nER  - \r\n';
 const r=C.readerRis(ris).library.items[0];
 assert.deepEqual(r.authors,['Doe, Jane','Smith, Anna']);assert.equal(r.pages,'10-15');
 assert.equal(r.title,'Réchauffement');assert.equal(r.type,'article');
});
test('RIS round trip article',()=>{const x=ref();assert.deepEqual(C.readerRis(C.emitRis(lib([x]))).library.items[0],C.normalize(x));});
test('RIS round trip livre',()=>{
 const x=ref({id:'Livre2025',type:'book',source:'',volume:'',number:'',doi:'',url:''});
 assert.deepEqual(C.readerRis(C.emitRis(lib([x]))).library.items[0],C.normalize(x));
});
test('RIS import source T2 reconnu pour conférence',()=>assert.equal(C.readerRis('TY  - CONF\nID  - conf2026\nTI  - Titre\nT2  - Conférence internationale\nER  - ').library.items[0].source,'Conférence internationale'));
test('RIS sans ID génère clé stable ref1',()=>assert.equal(C.readerRis('TY  - GEN\nTI  - Note\nER  - ').library.items[0].id,'ref1'));
test('RIS champ inconnu signalé sans suppression invisible',()=>{
 const out=C.readerRis('TY  - JOUR\nTI  - Titre\nAB  - Texte du résumé\nER  - ');
 assert.equal(out.warnings.length,1);assert.ok(out.warnings[0].includes('AB'));
});
test('RIS sans ER final rejeté',()=>assert.throws(()=>C.readerRis('TY  - JOUR\nTI  - Test'),/err\.risUnclosed/));
test('RIS champ avant TY rejeté',()=>assert.throws(()=>C.readerRis('TI  - Test'),/err\.risTyFirst/));
test('RIS valeur de tag mal formée rejetée',()=>assert.throws(()=>C.readerRis('TY-JOUR'),/err\.risLine/));
test('RIS type inconnu rejeté',()=>assert.throws(()=>C.readerRis('TY  - ELEC\nTI  - C\nER  - '),/err\.risType/));
test('RIS export champ multiligne refuse la perte silencieuse',()=>assert.throws(()=>C.emitRis(lib([ref({note:'ligne1\nligne2'})])),/err\.risMultiline/));
test('RIS export pages simples',()=>{
 const x=ref({pages:'25'});assert.equal(C.readerRis(C.emitRis(lib([x]))).library.items[0].pages,'25');
});
test('RIS multiple références preservées',()=>{
 const x=ref(),y=ref({id:'Livre',type:'book',source:'',doi:'10.1234/book'});
 assert.equal(C.readerRis(C.emitRis(lib([x,y]))).library.items.length,2);
});
test('aperçu honnête sans inventer auteur ou année',()=>{
 const r=C.preview(ref({authors:[],year:''}));assert.ok(r.includes('Auteur non indiqué'));assert.ok(r.includes('(s. d.)'));
});
test('textes HTML dangereux traités comme données',()=>assert.equal(C.normalize(ref({title:'<img src=x onerror=alert(1)>'})).title,'<img src=x onerror=alert(1)>'));
test('aucune entrée BibTeX vide acceptée',()=>assert.throws(()=>C.readerBib(''),/err\.bibEmpty/));
test('aucune entrée RIS vide acceptée',()=>assert.throws(()=>C.readerRis(''),/err\.risEmpty/));
test('aperçu : mentions conventionnelles fournies par la langue de l interface',()=>{
 const r=C.preview(ref({authors:[],year:''}),{noAuthor:'Unknown author',noDate:'n.d.',doi:'DOI: '});
 assert.ok(r.startsWith('Unknown author (n.d.). '));assert.ok(!r.includes('s. d.'));
});
