/* RoomSketch: exact integer-centimetre axis-aligned rectangle geometry.
 * No server or external dependencies. Exported SVG is generated from validated values. */
(function(root){'use strict';
const VERSION=1,MAX_OBJECTS=60,MAX_BYTES=500000,MIN_ROOM=200,MAX_ROOM=1500;
const PRESETS=Object.freeze({
 table:{label:'Table',width:120,depth:70,color:'#d4a669'},
 bed:{label:'Lit',width:200,depth:160,color:'#9db3ed'},
 sofa:{label:'Canapé',width:210,depth:90,color:'#94c6ba'},
 desk:{label:'Bureau',width:140,depth:70,color:'#c3a9da'},
 chair:{label:'Chaise',width:50,depth:50,color:'#e2b3a5'},
 wardrobe:{label:'Armoire',width:120,depth:60,color:'#b6c4d0'},
 custom:{label:'Meuble',width:80,depth:60,color:'#c3d7d2'}
});
const KINDS=Object.keys(PRESETS);
const enc=typeof TextEncoder==='function'?new TextEncoder():null;
function fail(message){throw new Error(message);}
function integer(v,name,min,max){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)fail(name+' : entier de '+min+' à '+max+' cm requis');
 return v;
}
function exactObjectKeys(input,allowed,name){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(x=>!allowed.includes(x)))fail(name+' : format non pris en charge');
}
function room(v){
 exactObjectKeys(v,['width','depth'],'Pièce');
 return {width:integer(v.width,'Largeur',MIN_ROOM,MAX_ROOM),depth:integer(v.depth,'Profondeur',MIN_ROOM,MAX_ROOM)};
}
function furniture(v){
 exactObjectKeys(v,['id','kind','label','x','y','width','depth','rotation'],'Meuble');
 if(typeof v.id!=='string'||!/^obj-[a-z0-9-]{6,90}$/.test(v.id))fail('Identifiant meuble invalide');
 if(!KINDS.includes(v.kind))fail('Catégorie de meuble invalide');
 if(typeof v.label!=='string'||v.label.length>80||!v.label.trim()||/[\u0000-\u001f\u007f]/u.test(v.label))fail('Libellé invalide (1 à 80 caractères)');
 const rotation=v.rotation;
 if(rotation!==0&&rotation!==90)fail('Rotation : 0° ou 90° uniquement');
 return {id:v.id,kind:v.kind,label:v.label.trim(),
  x:integer(v.x,'Position X',0,MAX_ROOM),y:integer(v.y,'Position Y',0,MAX_ROOM),
  width:integer(v.width,'Largeur meuble',20,600),depth:integer(v.depth,'Profondeur meuble',20,600),rotation};
}
function bounds(v){return {x:v.x,y:v.y,width:v.rotation===90?v.depth:v.width,depth:v.rotation===90?v.width:v.depth};}
function intersects(a,b){
 const u=bounds(a),v=bounds(b);
 return u.x<v.x+v.width&&u.x+u.width>v.x&&u.y<v.y+v.depth&&u.y+u.depth>v.y;
}
function within(v,r){
 const b=bounds(v);
 return b.x>=0&&b.y>=0&&b.x+b.width<=r.width&&b.y+b.depth<=r.depth;
}
function validate(raw){
 exactObjectKeys(raw,['version','room','objects'],'Plan');
 if(raw.version!==VERSION||!Array.isArray(raw.objects)||raw.objects.length>MAX_OBJECTS)fail('Plan v1 / 60 meubles maximum');
 const r=room(raw.room),items=[],seen=new Set();
 for(const v of raw.objects){
  const o=furniture(v);
  if(seen.has(o.id))fail('Identifiant meuble dupliqué');seen.add(o.id);
  if(!within(o,r))fail('Meuble hors de la pièce : '+o.label);
  for(const other of items)if(intersects(o,other))fail('Collision entre « '+o.label+' » et « '+other.label+' »');
  items.push(o);
 }
 const result={version:VERSION,room:r,objects:items};
 if(enc&&enc.encode(JSON.stringify(result)).length>MAX_BYTES)fail('Plan trop volumineux (500 Ko maximum)');
 return result;
}
function empty(width=500,depth=400){return validate({version:VERSION,room:{width,depth},objects:[]});}
function update(plan,id,patch){
 const old=validate(plan);
 if(typeof id!=='string'||!old.objects.some(o=>o.id===id))fail('Meuble introuvable');
 exactObjectKeys(patch,['label','kind','x','y','width','depth','rotation'],'Modifications');
 if(Object.keys(patch).includes('kind')&&patch.kind!==old.objects.find(o=>o.id===id).kind)fail('Type non modifiable : créer un nouveau meuble');
 return validate({...old,objects:old.objects.map(o=>o.id===id?{...o,...patch}:o)});
}
function add(plan,kind,id){
 const old=validate(plan);
 if(!KINDS.includes(kind))fail('Catégorie inconnue');
 if(old.objects.length>=MAX_OBJECTS)fail('60 meubles maximum');
 if(typeof id!=='string'||!/^obj-[a-z0-9-]{6,90}$/.test(id)||old.objects.some(x=>x.id===id))fail('Identifiant meuble invalide ou existant');
 const p=PRESETS[kind];
 // 10-cm search gives deterministic placement, never silently stacking furniture.
 for(let y=0;y+p.depth<=old.room.depth;y+=10){
  for(let x=0;x+p.width<=old.room.width;x+=10){
   const item={id,kind,label:p.label,x,y,width:p.width,depth:p.depth,rotation:0};
   if(!old.objects.some(o=>intersects(item,o)))return validate({...old,objects:[...old.objects,item]});
  }
 }
 fail('Aucun emplacement libre sur la grille de 10 cm : déplacez un meuble ou agrandissez la pièce');
}
function resizeRoom(plan,width,depth){
 const old=validate(plan);return validate({...old,room:{width,depth}});
}
function remove(plan,id){
 const old=validate(plan);
 if(!old.objects.some(o=>o.id===id))fail('Meuble introuvable');
 return validate({...old,objects:old.objects.filter(o=>o.id!==id)});
}
function rotate(plan,id){
 const old=validate(plan),obj=old.objects.find(o=>o.id===id);
 if(!obj)fail('Meuble introuvable');
 return update(old,id,{rotation:obj.rotation===0?90:0});
}
function snap(cm,step=10){
 if(typeof cm!=='number'||!Number.isFinite(cm)||!Number.isSafeInteger(step)||step<1||step>100)fail('Grille invalide');
 return Math.round(cm/step)*step;
}
function area(plan){
 const p=validate(plan);
 const taken=p.objects.reduce((total,o)=>total+o.width*o.depth,0);
 return {roomCm2:p.room.width*p.room.depth,occupiedCm2:taken,freeCm2:p.room.width*p.room.depth-taken,
   occupiedPercent:Math.round(taken*10000/(p.room.width*p.room.depth))/100};
}
function xml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function svg(plan){
 const p=validate(plan),r=p.room;
 const outputWidth=1000,outputHeight=Math.round(1000*r.depth/r.width);
 const lines=[];
 for(let x=0;x<=r.width;x+=50)lines.push('<line x1="'+x+'" y1="0" x2="'+x+'" y2="'+r.depth+'" stroke="#dce8ea" stroke-width="1"/>');
 for(let y=0;y<=r.depth;y+=50)lines.push('<line x1="0" y1="'+y+'" x2="'+r.width+'" y2="'+y+'" stroke="#dce8ea" stroke-width="1"/>');
 const blocks=p.objects.map(o=>{
  const b=bounds(o),fill=PRESETS[o.kind].color;
  return '<g data-id="'+xml(o.id)+'"><rect x="'+b.x+'" y="'+b.y+'" width="'+b.width+'" height="'+b.depth+'" rx="4" fill="'+fill+'" stroke="#34556a" stroke-width="2"/><text x="'+(b.x+b.width/2)+'" y="'+(b.y+b.depth/2)+'" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#1d3341">'+xml(o.label)+'</text></g>';
 });
 return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<svg xmlns="http://www.w3.org/2000/svg" width="'+outputWidth+'" height="'+outputHeight+'" viewBox="0 0 '+r.width+' '+r.depth+'" role="img">'+
  '<title>RoomSketch — plan de pièce</title><desc>Géométrie en centimètres. '+r.width+' cm par '+r.depth+' cm. '+p.objects.length+' meubles.</desc>'+
  '<rect width="'+r.width+'" height="'+r.depth+'" fill="#fafdfc"/>'+lines.join('')+
  '<rect x="1" y="1" width="'+(r.width-2)+'" height="'+(r.depth-2)+'" fill="none" stroke="#254859" stroke-width="3"/>'+
  blocks.join('')+'</svg>\n';
}
root.RoomCore=Object.freeze({VERSION,MAX_OBJECTS,MAX_BYTES,PRESETS,KINDS,integer,room,furniture,bounds,intersects,within,validate,empty,update,add,resizeRoom,remove,rotate,snap,area,xml,svg});
if(typeof module!=='undefined'&&module.exports)module.exports=root.RoomCore;
})(typeof window==='undefined'?globalThis:window);