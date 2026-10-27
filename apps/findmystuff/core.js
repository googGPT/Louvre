/* FindMyStuff — pure, locally executable business logic. No network or dependencies.
   Errors carry a translation key (err.xxx) that the interface translates (messages.js). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FMSCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CATEGORIES = ['Maison', 'Documents', 'Électronique', 'Vêtements', 'Outils', 'Loisirs', 'Autre'];
  const MAX_ITEMS = 1000, MAX_EXPORT = 15 * 1024 * 1024, MAX_PHOTO = 900000;
  const exact = (v, keys) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
  const str = (v, max, min = 0) => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v);
  const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && (() => { const d = new Date(v + 'T12:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v && v >= '2000-01-01' && v <= '2100-12-31'; })();
  const photoOk = v => v === null || (typeof v === 'string' && v.length <= MAX_PHOTO && /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(v));
  function validateItem(item) {
    if (!exact(item, ['id','name','category','location','container','quantity','tags','notes','photo','createdAt','updatedAt','loan'])) throw new Error('err.format');
    if (!str(item.id, 80, 8) || !/^[a-zA-Z0-9-]+$/.test(item.id)) throw new Error('err.id');
    if (!str(item.name, 100, 1) || !CATEGORIES.includes(item.category) || !str(item.location, 90, 1) || !str(item.container, 90)) throw new Error('err.fields');
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000000) throw new Error('err.quantity');
    if (!Array.isArray(item.tags) || item.tags.length > 10 || item.tags.some(t => !str(t, 30, 1)) || new Set(item.tags.map(x=>x.toLocaleLowerCase('fr'))).size !== item.tags.length) throw new Error('err.tags');
    if (!str(item.notes, 1000) || !photoOk(item.photo) || !iso(item.createdAt) || !iso(item.updatedAt) || item.updatedAt < item.createdAt) throw new Error('err.misc');
    if (item.loan !== null) {
      if (!exact(item.loan, ['borrower','lentOn','dueOn']) || !str(item.loan.borrower, 90, 1) || !iso(item.loan.lentOn) || !(item.loan.dueOn === '' || iso(item.loan.dueOn)) || (item.loan.dueOn && item.loan.dueOn < item.loan.lentOn)) throw new Error('err.loan');
    }
    return item;
  }
  const cleanText = (v, max) => String(v ?? '').trim().slice(0, max);
  function createItem(raw, today, id) {
    if (!iso(today) || !/^[a-zA-Z0-9-]{8,80}$/.test(id)) throw new Error('err.dateId');
    const tags = Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',').map(x=>x.trim()).filter(Boolean);
    const item = {id, name: cleanText(raw.name,100), category: raw.category, location: cleanText(raw.location,90), container:cleanText(raw.container,90), quantity:Number(raw.quantity),tags:tags.map(t=>cleanText(t,30)), notes:cleanText(raw.notes,1000), photo:raw.photo || null,createdAt:raw.createdAt || today,updatedAt:today,loan:raw.loan || null};
    return validateItem(item);
  }
  function validateBackup(obj) {
    if (!exact(obj, ['app','version','exportedAt','items']) || obj.app !== 'FindMyStuff' || obj.version !== 1 || !iso(obj.exportedAt) || !Array.isArray(obj.items) || obj.items.length > MAX_ITEMS) throw new Error('err.backup');
    const ids = new Set();
    for (const i of obj.items) { validateItem(i); if (ids.has(i.id)) throw new Error('err.duplicate'); ids.add(i.id); }
    return obj;
  }
  function exportBackup(items, today) { return validateBackup({app:'FindMyStuff',version:1,exportedAt:today,items}); }
  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > MAX_EXPORT) throw new Error('err.fileBig');
    let data;try{ data=JSON.parse(text); }catch{throw new Error('err.json');}
    return validateBackup(data);
  }
  function normalize(v) {return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').trim();}
  // catName (facultatif) : nom de la catégorie dans la langue affichée, cherché en plus du nom enregistré.
  function searchScore(item, query, catName) {
    const parts = normalize(query).split(/\s+/).filter(Boolean);
    if (!parts.length) return 1;
    const n=normalize(item.name), l=normalize(item.location), c=normalize(item.container), cat=normalize(item.category)+(catName?' '+normalize(catName(item.category)):''), tags=item.tags.map(normalize), other=normalize(item.notes);
    let total=0;
    for(const word of parts){
      const s = n===word?15 : n.includes(word)?8 : tags.some(t=>t===word)?7 : tags.some(t=>t.includes(word))?5 : l.includes(word)?4 : c.includes(word)?3 : cat.includes(word)?2 : other.includes(word)?1 : 0;
      if(!s) return 0;total+=s;
    }
    return total;
  }
  // opts : { locale } pour l'ordre alphabétique de la langue affichée, { catName } pour la recherche.
  function queryItems(items, query='', filter='all', sort='name', today='2026-10-25', opts={}) {
    const loc=opts.locale||'fr';
    const rows=items.map(i=>({...i,_score:searchScore(i,query,opts.catName)})).filter(i=>i._score>0 && (filter==='all'||(filter==='loaned'&&i.loan)||(filter==='here'&&!i.loan)||(filter==='overdue'&&isOverdue(i,today))||(filter==='fav'&&i.tags.some(t=>normalize(t)==='favori'))||(CATEGORIES.includes(filter)&&i.category===filter)));
    const cmp=(a,b)=>sort==='newest' ? b.createdAt.localeCompare(a.createdAt)||a.name.localeCompare(b.name,loc) : sort==='location' ? a.location.localeCompare(b.location,loc)||a.name.localeCompare(b.name,loc) : a.name.localeCompare(b.name,loc);
    rows.sort((a,b)=>(query.trim()?b._score-a._score:0)||cmp(a,b)); return rows;
  }
  function daysBetween(a,b){ if(!iso(a)||!iso(b)) throw new Error('err.date');return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000); }
  function isOverdue(item,today){return !!(item.loan&&item.loan.dueOn&&iso(today)&&daysBetween(item.loan.dueOn,today)>0);}
  function stats(items,today){return {total:items.length,units:items.reduce((a,i)=>a+i.quantity,0),loaned:items.filter(i=>i.loan).length,overdue:items.filter(i=>isOverdue(i,today)).length,places:new Set(items.map(i=>normalize(i.location))).size};}
  // Liste CSV : cols = 9 titres de colonnes et catName = nom affiché d'une catégorie, fournis par l'interface (langue choisie).
  function htmlCSV(items,cols,catName=c=>c){if(!Array.isArray(cols)||cols.length!==9)throw new Error('err.csvCols'); const esc=v=>'"'+String(v??'').replace(/"/g,'""').replace(/^[=+@\-\t\r]/,'\'$&')+'"';return '\uFEFF'+[cols,...items.map(i=>[i.name,catName(i.category),i.location,i.container,i.quantity,i.tags.join('; '),i.loan?.borrower||'',i.loan?.dueOn||'',i.notes])].map(r=>r.map(esc).join(';')).join('\r\n');}
  return {CATEGORIES,MAX_ITEMS,MAX_EXPORT,MAX_PHOTO,iso,photoOk,validateItem,createItem,validateBackup,exportBackup,parseBackup,normalize,searchScore,queryItems,daysBetween,isOverdue,stats,htmlCSV};
});