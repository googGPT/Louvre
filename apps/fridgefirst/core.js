/* FridgeFirst domain module: deterministic, dependency-free, no network calls. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FridgeCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const VERSION = 1;
  const MAX_ITEMS = 1000, MAX_HISTORY = 3000, MAX_SHOP = 500;
  const CATEGORIES = ['légume','fruit','protéine','féculent','laitier','autre'];
  const PLACES = ['frigo','congélateur','placard'];
  const UNITS = ['pièce','g','kg','ml','L','portion'];
  const FOOD = [
    ['tomate','🍅','légume'], ['œuf','🥚','protéine'], ['fromage','🧀','laitier'],
    ['pain','🥖','féculent'], ['riz','🍚','féculent'], ['pâtes','🍝','féculent'],
    ['carotte','🥕','légume'], ['courgette','🥒','légume'], ['oignon','🧅','légume'],
    ['pomme','🍎','fruit'], ['banane','🍌','fruit'], ['lait','🥛','laitier'],
    ['yaourt','🥣','laitier'], ['poulet','🍗','protéine'], ['poisson','🐟','protéine'],
    ['pomme de terre','🥔','féculent'], ['champignon','🍄','légume'], ['épinard','🥬','légume'],
    ['salade','🥗','légume'], ['concombre','🥒','légume'], ['citron','🍋','fruit'],
    ['fraise','🍓','fruit'], ['avocat','🥑','fruit'], ['thon','🐟','protéine'],
    ['lentille','🫘','protéine'], ['haricot','🫘','protéine'], ['beurre','🧈','laitier'],
    ['crème','🥛','laitier'], ['farine','🌾','féculent'], ['huile','🫒','autre'],
    ['ail','🧄','légume'], ['pois chiche','🫘','protéine'], ['brocoli','🥦','légume'],
    ['poivron','🫑','légume'], ['maïs','🌽','légume'], ['flocon d’avoine','🌾','féculent']
  ];
  const RECIPES = [
    {id:'omelette',name:'Omelette aux légumes',emoji:'🍳',mins:15,ingredients:['œuf','tomate','oignon']},
    {id:'pasta',name:'Pâtes crémeuses aux champignons',emoji:'🍝',mins:20,ingredients:['pâtes','champignon','crème']},
    {id:'salade',name:'Salade fraîche',emoji:'🥗',mins:10,ingredients:['salade','tomate','concombre']},
    {id:'rizpoulet',name:'Riz au poulet',emoji:'🍗',mins:30,ingredients:['riz','poulet','oignon']},
    {id:'soupe',name:'Soupe de légumes',emoji:'🍲',mins:30,ingredients:['carotte','pomme de terre','oignon']},
    {id:'toast',name:'Tartines gratinées',emoji:'🥪',mins:10,ingredients:['pain','tomate','fromage']},
    {id:'fruit',name:'Bol de fruits',emoji:'🍓',mins:5,ingredients:['pomme','banane','yaourt']},
    {id:'pasta-tuna',name:'Pâtes au thon',emoji:'🐟',mins:18,ingredients:['pâtes','thon','tomate']},
    {id:'poelee',name:'Poêlée de légumes',emoji:'🥦',mins:20,ingredients:['courgette','carotte','poivron']},
    {id:'rizlegume',name:'Riz aux légumes',emoji:'🍚',mins:20,ingredients:['riz','carotte','courgette']},
    {id:'saladepois',name:'Salade de pois chiches',emoji:'🫘',mins:10,ingredients:['pois chiche','tomate','concombre']},
    {id:'tartine-avocat',name:'Toast avocat et œuf',emoji:'🥑',mins:12,ingredients:['pain','avocat','œuf']},
    {id:'smoothie',name:'Smoothie banane-fraise',emoji:'🥤',mins:5,ingredients:['banane','fraise','lait']},
    {id:'lentilles',name:'Lentilles aux carottes',emoji:'🍛',mins:35,ingredients:['lentille','carotte','oignon']},
    {id:'gratin',name:'Gratin de pommes de terre',emoji:'🥘',mins:45,ingredients:['pomme de terre','crème','fromage']}
  ];
  const ALIASES = {
    tomates:'tomate',oeuf:'œuf',oeufs:'œuf', 'œufs':'œuf', 'œuf':'œuf',
    oignons:'oignon', carottes:'carotte', bananes:'banane',pommes:'pomme',
    courgettes:'courgette', champignons:'champignon', pâtes:'pâtes', pates:'pâtes',
    riz:'riz', salades:'salade', concombres:'concombre', 'pommes de terre':'pomme de terre',
    patates:'pomme de terre', poivrons:'poivron', epinards:'épinard', avocat:'avocat',
    avocats:'avocat', fraises:'fraise', lentilles:'lentille', 'pois chiches':'pois chiche',
    haricots:'haricot', 'flocons d avoine':'flocon d’avoine'
  };
  function cleanName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0,72); }
  function norm(value) {
    const s = cleanName(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').replace(/[’']/g,' ').trim();
    const alias = Object.entries(ALIASES).find(([k])=>k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').replace(/[’']/g,' ')===s);
    return (alias ? alias[1] : s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/œ/g,'oe').replace(/[’']/g,' ');
  }
  // Nom canonique (français) d'un aliment ; « aliases » : table facultative nom normalisé -> nom du catalogue (autres langues).
  function canon(value, aliases) { const n = norm(value); return aliases && Object.hasOwn(aliases, n) ? norm(aliases[n]) : n; }
  function strictDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const d = new Date(date+'T12:00:00Z');return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===date && d.getUTCFullYear()>=2020 && d.getUTCFullYear()<=2100;
  }
  function dayNumber(date) { if (!strictDate(date)) return NaN; return Math.floor(Date.parse(date+'T12:00:00Z')/86400000); }
  function daysTo(expiry, today) {return dayNumber(expiry)-dayNumber(today);}
  function todayLocal(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
  function addDays(date,days){if(!strictDate(date)||!Number.isInteger(days))throw Error('err.date');const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function status(item,today){const d=daysTo(item.expiry,today);return d<0?'passé':d<=2?'urgent':d<=5?'bientôt':'ok';}
  function stringField(v,max=80){return typeof v==='string' && v.trim().length>0 && v.trim().length<=max && !/[\u0000-\u0008\u000e-\u001f]/.test(v);}
  function isPlainObject(x){return typeof x==='object' && x!==null && !Array.isArray(x) && Object.getPrototypeOf(x)===Object.prototype;}
  function isExact(x,fields){return isPlainObject(x)&& Object.keys(x).length===fields.length && fields.every(k=>Object.hasOwn(x,k));}
  function validItem(i){return isExact(i,['id','name','quantity','unit','category','place','expiry','createdAt']) && stringField(i.id,70) && stringField(i.name,72) && Number.isFinite(i.quantity) && i.quantity>0 && i.quantity<=100000 && UNITS.includes(i.unit) && CATEGORIES.includes(i.category) && PLACES.includes(i.place) && strictDate(i.expiry) && strictDate(i.createdAt);}
  function validHistory(h){return isExact(h,['id','name','quantity','action','date'])&&stringField(h.id,70)&&stringField(h.name,72)&&Number.isFinite(h.quantity)&&h.quantity>0&&h.quantity<=100000&&['consommé','jeté'].includes(h.action)&&strictDate(h.date);}
  function validShop(s){return isExact(s,['id','name','checked'])&&stringField(s.id,70)&&stringField(s.name,72)&&typeof s.checked==='boolean';}
  function validateBackup(input){
    if(!isExact(input,['version','items','history','shopping']) || input.version!==VERSION || !Array.isArray(input.items)||!Array.isArray(input.history)||!Array.isArray(input.shopping))throw Error('err.format');
    if(input.items.length>MAX_ITEMS || input.history.length>MAX_HISTORY || input.shopping.length>MAX_SHOP)throw Error('err.tooMuch');
    if(!input.items.every(validItem)||!input.history.every(validHistory)||!input.shopping.every(validShop))throw Error('err.invalid');
    const ids=[...input.items,...input.history,...input.shopping].map(x=>x.id);
    if(new Set(ids).size!==ids.length)throw Error('err.duplicate');
    return {version:VERSION,items:input.items.map(x=>({...x})),history:input.history.map(x=>({...x})),shopping:input.shopping.map(x=>({...x}))};
  }
  function empty(){return {version:VERSION,items:[],history:[],shopping:[]};}
  function analytics(items,history,today){
    const current=items.length,urgent=items.filter(x=>status(x,today)==='urgent').length,expired=items.filter(x=>status(x,today)==='passé').length;
    const consumed=history.filter(x=>x.action==='consommé').length,discarded=history.filter(x=>x.action==='jeté').length;
    const sorted=items.filter(x=>status(x,today)!=='passé').slice().sort((a,b)=>a.expiry.localeCompare(b.expiry)||a.name.localeCompare(b.name,'fr'));
    return {current,urgent,expired,consumed,discarded,soon:sorted.slice(0,5)};
  }
  function recipeSuggestions(items,today,aliases){
    const safeItems=items.filter(x=>x.quantity>0 && daysTo(x.expiry,today)>=0);
    const grouped=new Map();for(const item of safeItems){const k=canon(item.name,aliases);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(item);}
    return RECIPES.map(r=>{
      const have=r.ingredients.filter(ingredient=>grouped.has(norm(ingredient)));
      const missing=r.ingredients.filter(ingredient=>!grouped.has(norm(ingredient)));
      const expiring=have.filter(ingredient=>grouped.get(norm(ingredient)).some(i=>daysTo(i.expiry,today)<=2));
      // Rank by usable coverage, then urgency, then number of missing items.
      const score=100*have.length/r.ingredients.length+12*expiring.length-7*missing.length;
      return {...r,have,missing,score,ratio:have.length/r.ingredients.length,ready:missing.length===0};
    }).filter(r=>r.have.length>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'fr'));
  }
  function id(){return (typeof crypto!=='undefined' && crypto.randomUUID)?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
  function guess(name,aliases){const c=canon(name,aliases);const found=FOOD.find(([n])=>norm(n)===c);return {emoji:found?.[1]||'🛒',category:found?.[2]||'autre'};}
  return {VERSION,FOOD,RECIPES,CATEGORIES,PLACES,UNITS,norm,canon,cleanName,strictDate,daysTo,addDays,todayLocal,status,validItem,validateBackup,empty,analytics,recipeSuggestions,id,guess};
});