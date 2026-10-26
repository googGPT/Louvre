const test=require('node:test'),a=require('node:assert/strict'),C=require('../core.js');
const o=(id='obj-0000001',patch={})=>({id,kind:'table',label:'Table',x:0,y:0,width:120,depth:70,rotation:0,...patch});
const plan=(objects=[],width=500,depth=400)=>({version:1,room:{width,depth},objects});
const initial=()=>C.empty();
test('pièce initiale exacte 5 m × 4 m',()=>a.deepEqual(initial(),plan()));
test('aire totale de 20 m² en centimètres carrés',()=>a.deepEqual(C.area(initial()),{roomCm2:200000,occupiedCm2:0,freeCm2:200000,occupiedPercent:0}));
test('limites pièce 200 et 1500 cm acceptées',()=>{a.equal(C.empty(200,1500).room.width,200);a.equal(C.empty(1500,200).room.depth,200);});
test('dimension < 200 cm refusée',()=>a.throws(()=>C.empty(199,200),/entier/));
test('dimension > 1500 cm refusée',()=>a.throws(()=>C.empty(1501,200),/entier/));
test('dimension décimale refusée',()=>a.throws(()=>C.empty(299.5,200),/entier/));
test('dimension saisie comme texte refusée',()=>a.throws(()=>C.empty('500',400),/entier/));
test('document non versionné refusé',()=>a.throws(()=>C.validate({room:{width:500,depth:400},objects:[]}),/Plan v1/));
test('propriété de document inconnue refusée',()=>a.throws(()=>C.validate({...plan(),secret:true}),/format/));
test('propriété de pièce inconnue refusée',()=>a.throws(()=>C.validate({...plan(),room:{width:500,depth:400,extra:1}}),/format/));
test('type de meuble inconnu refusé',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{kind:'unknown'})])),/Catégorie/));
test('identifiant meuble invalide refusé',()=>a.throws(()=>C.validate(plan([o('bad') ])),/Identifiant/));
test('nom vide interdit',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{label:'  '})])),/Libellé/));
test('nom trop long interdit',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{label:'x'.repeat(81)})])),/Libellé/));
test('nom à caractère de contrôle refusé',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{label:'x\nz'})])),/Libellé/));
test('gabarit de meuble inférieur à 20 cm interdit',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{width:19})])),/Largeur meuble/));
test('gabarit supérieur à 600 cm interdit',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{depth:601})])),/Profondeur meuble/));
test('rotation 45 degrés refusée',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{rotation:45})])),/Rotation/));
test('position x négative rejetée',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{x:-1})])),/Position X/));
test('position y hors mur refusée',()=>a.throws(()=>C.validate(plan([o('obj-0000001',{y:380})])),/hors de la pièce/));
test('meuble précisément contre le mur autorisé',()=>a.equal(C.validate(plan([o('obj-0000001',{x:380,y:330})])).objects.length,1));
test('deux meubles avec aire de chevauchement rejetés',()=>a.throws(()=>C.validate(plan([o('obj-0000001'),o('obj-0000002',{x:119})])),/Collision/));
test('deux meubles qui se touchent verticalement ne collisionnent pas',()=>a.equal(C.validate(plan([o('obj-0000001'),o('obj-0000002',{x:120})])).objects.length,2));
test('deux meubles qui se touchent horizontalement ne collisionnent pas',()=>a.equal(C.validate(plan([o('obj-0000001'),o('obj-0000002',{y:70})])).objects.length,2));
test('deux rectangles séparés sont valides',()=>a.equal(C.validate(plan([o('obj-0000001'),o('obj-0000002',{x:200,y:200})])).objects.length,2));
test('duplication identifiant meuble refusée',()=>a.throws(()=>C.validate(plan([o(),o()])),/dupliqué/));
test('transformation AABB rotation 90 inverse dimensions seulement',()=>a.deepEqual(C.bounds(o('obj-0000001',{x:15,y:22,rotation:90})),{x:15,y:22,width:70,depth:120}));
test('rotation validée dans pièce libre',()=>{const p=C.rotate(plan([o()]),'obj-0000001');a.equal(p.objects[0].rotation,90);a.deepEqual(C.bounds(p.objects[0]),{x:0,y:0,width:70,depth:120});});
test('rotation de deux fois revient à 0°',()=>{const p=plan([o()]);a.deepEqual(C.rotate(C.rotate(p,'obj-0000001'),'obj-0000001'),p);});
test('rotation refusée si elle provoquerait une collision',()=>{
 const p=plan([o(),o('obj-0000002',{kind:'chair',label:'Chaise',x:0,y:70,width:50,depth:50})]);
 a.throws(()=>C.rotate(p,'obj-0000001'),/Collision/);
});
test('rotation refusée près du bord si volume sort',()=>a.throws(()=>C.rotate(plan([o('obj-0000001',{y:330})]),'obj-0000001'),/hors de la pièce/));
test('déplacement sans collision validé',()=>a.equal(C.update(plan([o()]),'obj-0000001',{x:150,y:100}).objects[0].x,150));
test('déplacement en collision rejeté',()=>a.throws(()=>C.update(plan([o(),o('obj-0000002',{x:200})]),'obj-0000001',{x:190}),/Collision/));
test('déplacement hors de la pièce refusé',()=>a.throws(()=>C.update(plan([o()]),'obj-0000001',{x:400}),/hors de la pièce/));
test('mise à jour d’objet inexistant refusée',()=>a.throws(()=>C.update(initial(),'obj-unknown',{x:1}),/introuvable/));
test('modification de type refusée sans migration',()=>a.throws(()=>C.update(plan([o()]),'obj-0000001',{kind:'bed'}),/non modifiable/));
test('propriété inconnue en patch refusée',()=>a.throws(()=>C.update(plan([o()]),'obj-0000001',{password:'x'}),/non pris en charge/));
test('redimensionnement d’une pièce vide autorisé',()=>a.deepEqual(C.resizeRoom(initial(),240,250).room,{width:240,depth:250}));
test('redimensionnement provoquant sortie refusé',()=>a.throws(()=>C.resizeRoom(plan([o('obj-0000001',{x:300})]),300,400),/hors de la pièce/));
test('supprimer objet conserve pièce et autres meubles',()=>{
 const p=plan([o(),o('obj-0000002',{x:200})]);
 const q=C.remove(p,'obj-0000001');a.deepEqual(q.objects.map(t=>t.id),['obj-0000002']);a.equal(p.objects.length,2);
});
test('suppression identifiant inconnu refusée',()=>a.throws(()=>C.remove(initial(),'obj-absent'),/introuvable/));
test('placement auto premier objet commence au coin haut gauche',()=>{
 const p=C.add(initial(),'chair','obj-0000001');a.deepEqual([p.objects[0].x,p.objects[0].y],[0,0]);
});
test('placement auto deuxième chaise juxtapose sans collision',()=>{
 let p=C.add(initial(),'chair','obj-0000001');p=C.add(p,'chair','obj-0000002');
 a.deepEqual([p.objects[1].x,p.objects[1].y],[50,0]);
});
test('ajout refusé si id déjà présent',()=>a.throws(()=>C.add(C.add(initial(),'chair','obj-0000001'),'chair','obj-0000001'),/existant/));
test('ajout meuble trop grand pour pièce refuse explicitement',()=>a.throws(()=>C.add(C.empty(200,200),'sofa','obj-0000001'),/Aucun emplacement/));
test('60 meubles admis, 61ème refusé',()=>{
 const objects=Array.from({length:60},(_,i)=>o('obj-'+String(i).padStart(7,'0'),{kind:'chair',label:'Chaise',x:(i%12)*50,y:Math.floor(i/12)*50,width:50,depth:50}));
 const p=C.validate(plan(objects,1500,1500));a.equal(p.objects.length,60);
 a.throws(()=>C.add(p,'chair','obj-extra-01'),/60 meubles/);
});
test('grille 10cm arrondit à l’entier le plus proche',()=>{a.equal(C.snap(24),20);a.equal(C.snap(25),30);a.equal(C.snap(26),30);});
test('grille 1cm pour placement fin',()=>a.equal(C.snap(24.7,1),25));
test('valeur de grille mal formée rejetée',()=>{for(const n of [0,-1,101,1.5])a.throws(()=>C.snap(25,n));});
test('occupation totale et libre comptées sans chevauchement',()=>{
 const p=plan([o(),o('obj-0000002',{kind:'chair',label:'Chaise',x:120,width:50,depth:50})]);
 const a1=C.area(p);a.equal(a1.occupiedCm2,8400+2500);a.equal(a1.freeCm2,200000-10900);
});
test('surface même après rotation, car largeur × profondeur constante',()=>a.equal(C.area(C.rotate(plan([o()]),'obj-0000001')).occupiedCm2,8400));
test('SVG exact viewBox métrique et raster 1000×800 pour 500×400',()=>{
 const x=C.svg(initial());a.ok(x.includes('viewBox="0 0 500 400"'));a.ok(x.includes('width="1000" height="800"'));
});
test('SVG représente chaque meuble avec les dimensions projetées',()=>{
 const x=C.svg(plan([o('obj-0000001',{x:30,y:40,rotation:90})]));
 a.ok(x.includes('x="30" y="40" width="70" height="120"'));a.ok(x.includes('<g data-id="obj-0000001">'));
});
test('SVG échappe correctement le HTML et les caractères spéciaux',()=>{
 const x=C.svg(plan([o('obj-0000001',{label:'<script>&"\'</script>'})]));
 a.ok(x.includes('&lt;script&gt;&amp;"'));a.ok(!x.includes('<script>'));
});
test('SVG export invalide impossible',()=>a.throws(()=>C.svg(plan([o(),o()])),/dupliqué/));
test('format JSON import/export invariant',()=>{
 const p=C.add(initial(),'desk','obj-0000001');a.deepEqual(C.validate(JSON.parse(JSON.stringify(p))),p);
});
test('60 meubles n’altèrent pas l’ancien plan',()=>{const p=initial();C.add(p,'table','obj-0000001');a.equal(p.objects.length,0);});
