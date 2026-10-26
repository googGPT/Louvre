const test=require('node:test'),a=require('node:assert/strict'),C=require('../core.js');
const opt={format:'image/webp',quality:.8,maxWidth:1920,maxHeight:1920};
const file=(patch={})=>({name:'Photo.png',size:1000000,type:'image/png',...patch});
const good=(config={})=>C.settings({...opt,...config});
test('formats de sortie exactement JPEG, PNG et WebP',()=>a.deepEqual(Object.keys(C.FORMATS).sort(),['image/jpeg','image/png','image/webp']));
test('réglages canoniques retournés sans mutation',()=>{
 const x=good();a.deepEqual(x,opt);a.notStrictEqual(x,opt);
});
test('validation rejette objets non fiables',()=>{
 for(const q of [null,{},[],{...opt,other:true},{...opt,format:'image/svg+xml'}])a.throws(()=>C.settings(q));
});
test('qualité hors plage et non finie refusée',()=>{
 for(const quality of [.29,.96,NaN,Infinity,-Infinity,'0.8'])a.throws(()=>good({quality}));
});
test('bornes de largeur et hauteur contrôlées',()=>{
 for(const maxWidth of [0,63,6001,100.2,Infinity])a.throws(()=>good({maxWidth}));
 for(const maxHeight of [0,63,6001,NaN])a.throws(()=>good({maxHeight}));
});
test('redimensionnement paysage 4000x3000 vers 1920x1440',()=>{
 const x=C.dimensions(4000,3000,opt);
 a.deepEqual({width:x.width,height:x.height,resized:x.resized},{width:1920,height:1440,resized:true});
});
test('redimensionnement portrait 3000x4000 vers 1440x1920',()=>{
 const x=C.dimensions(3000,4000,opt);
 a.deepEqual([x.width,x.height],[1440,1920]);
});
test('image carrée réduite sans distorsion',()=>{
 const x=C.dimensions(2048,2048,opt);a.deepEqual([x.width,x.height],[1920,1920]);
});
test('petites images non agrandies',()=>{
 const x=C.dimensions(320,200,opt);
 a.deepEqual([x.width,x.height,x.resized],[320,200,false]);
});
test('une image très fine garde au moins un pixel',()=>{
 const x=C.dimensions(10000,1,opt);
 a.equal(x.width,1920);a.equal(x.height,1);
});
test('limite source 40 mégapixels',()=>{
 a.doesNotThrow(()=>C.dimensions(8000,5000,opt));
 a.throws(()=>C.dimensions(8000,5001,opt));
});
test('dimensions invalides ou flottantes rejetées',()=>{
 for(const width of [0,-1,1.5,NaN,Infinity,32769])a.throws(()=>C.dimensions(width,200,opt));
 for(const height of [0,32769,1.2])a.throws(()=>C.dimensions(200,height,opt));
});
test('sortie maximum 20 mégapixels lorsque bornes élevées',()=>{
 const x=C.dimensions(6000,6000,good({maxWidth:6000,maxHeight:6000}));
 a.ok(x.width*x.height<=C.MAX_OUTPUT_PIXELS);
 a.ok(x.width<=6000&&x.height<=6000);
});
test('aucune sortie de dimension zéro',()=>{
 const x=C.dimensions(1,8000,good({maxWidth:64,maxHeight:64}));
 a.ok(x.width>=1&&x.height>=1);
});
test('dimension et proportion d’une image 6000x3000 pour borne 1000',()=>{
 const x=C.dimensions(6000,3000,good({maxWidth:1000,maxHeight:1000}));
 a.deepEqual([x.width,x.height],[1000,500]);
});
test('fichier PNG accepté avec nom et taille',()=>a.deepEqual(C.validFile(file()),file()));
test('JPEG et WebP acceptés',()=>{
 a.doesNotThrow(()=>C.validFile(file({type:'image/jpeg'})));
 a.doesNotThrow(()=>C.validFile(file({type:'image/webp'})));
});
test('SVG, GIF, HEIC et fichiers arbitraires refusés',()=>{
 for(const type of ['image/svg+xml','image/gif','image/heic','text/html',''])a.throws(()=>C.validFile(file({type})));
});
test('fichiers vides ou trop gros refusés',()=>{
 for(const size of [0,-1,C.MAX_FILE_BYTES+1,1.5,Infinity])a.throws(()=>C.validFile(file({size})));
});
test('nom vide ou inexistant refusé',()=>{
 for(const name of ['',null,'   '])a.throws(()=>C.validFile(file({name})));
});
test('lot de 1 à 10 accepté',()=>{
 a.doesNotThrow(()=>C.validateBatch([file()]));
 a.doesNotThrow(()=>C.validateBatch(Array(10).fill(file())));
});
test('lot de zéro ou 11 images refusé',()=>{
 a.throws(()=>C.validateBatch([]));
 a.throws(()=>C.validateBatch(Array(11).fill(file())));
});
test('lot 60MB maximum autorisé',()=>{
 a.doesNotThrow(()=>C.validateBatch(Array(3).fill(file({size:20*1024*1024}))));
 a.throws(()=>C.validateBatch(Array(4).fill(file({size:20*1024*1024}))));
});
test('un fichier invalide invalide tout le lot',()=>a.throws(()=>C.validateBatch([file(),file({type:'image/svg+xml'})])));
test('nom de sortie sans double extension',()=>{
 a.equal(C.outputName('vacances.PNG','image/webp'),'vacances-imageshrink.webp');
 a.equal(C.outputName('vacances.jpg','image/jpeg'),'vacances-imageshrink.jpg');
});
test('chemin utilisateur neutralisé pour téléchargement',()=>{
 a.equal(C.outputName('../../evil.jpg','image/png'),'evil-imageshrink.png');
 a.equal(C.outputName('C:\\photos\\test.png','image/jpeg'),'test-imageshrink.jpg');
});
test('caractères dangereux et nom manquant neutralisés',()=>{
 a.equal(C.outputName('<script>.jpg','image/png'),'_script_-imageshrink.png');
 a.equal(C.outputName('', 'image/png'),'image-imageshrink.png');
});
test('long nom réduit à 80 caractères avant suffixe',()=>{
 const s=C.outputName('x'.repeat(200)+'.jpg','image/webp');
 a.ok(s.length<=80+'-imageshrink.webp'.length);
});
test('format de sortie dangereux refusé',()=>a.throws(()=>C.outputName('photo.svg','image/svg+xml')));
test('économie de 50% mesurée correctement',()=>{
 a.deepEqual(C.comparison(1000,500),{bytesSaved:500,percentage:50,smaller:true});
});
test('une conversion plus lourde donne un pourcentage négatif explicite',()=>{
 a.deepEqual(C.comparison(1000,1200),{bytesSaved:-200,percentage:-20,smaller:false});
});
test('taille identique reconnue',()=>a.equal(C.comparison(1024,1024).smaller,false));
test('unités françaises lisibles',()=>{
 a.equal(C.displayBytes(0),'0 o');a.equal(C.displayBytes(1024),'1,0 Ko');a.equal(C.displayBytes(1048576),'1,00 Mo');
});
test('inputs numériques non finis refusés',()=>{
 a.throws(()=>C.comparison(0,100));a.throws(()=>C.comparison(100,NaN));a.throws(()=>C.displayBytes(Infinity));
});
