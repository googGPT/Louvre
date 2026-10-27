/* LoanSim — interface. Calculs dans core.js (LoanCore) ; textes, montants et devise dans LouvreI18n (messages.js). */
(()=>{'use strict';
const C=window.LoanCore,by=id=>document.getElementById(id),KEY='louvre-wave2-loansim-v1',FIELDS=['principal','apr','months','extra','fees'];
const L=window.LouvreI18n.init(window.LouvreMessages),t=L.t; // langue, devise, traductions
let result=null,lastValues=null;
let storageWarning=''; // clé du message de stockage (retraduit si la langue change)
let errorKey=null; // { msg } : erreur de saisie affichée
try{const raw=localStorage.getItem(KEY);if(raw){const saved=C.validate(JSON.parse(raw));for(const id of FIELDS)by(id).value=saved[id]}}catch(e){storageWarning='storage.unreadable';}
const money=c=>L.money(c); // devise choisie : montants simulés, aucune règle légale propre à l'euro
// Erreur du cœur (« err.number|{"field":"apr"} ») traduite, nom du champ compris.
function errText(err){
 const msg=err&&err.message?err.message:String(err),[key,json]=msg.split('|');
 let params;try{params=json?JSON.parse(json):undefined;}catch(e){params=undefined;}
 if(params&&params.field)params={...params,field:t('field.'+params.field)};
 return L.error(params?key+'|'+JSON.stringify(params):key);
}
function showError(){by('error').textContent=errorKey?errText(errorKey):storageWarning?t(storageWarning):'';}
function path(s,maxMonths,p){const pts=[[0,0],...s.rows.map(r=>[r.month,r.balance])];return pts.map(([m,b],i)=>(i?'L':'M')+(m/maxMonths*600).toFixed(1)+','+(166-165*b/p).toFixed(1)).join(' ')}
function render(v){result=C.compare(v);lastValues=v;const s=result.withExtra;
 for(const el of document.querySelectorAll('.cur'))el.textContent=L.currencySymbol();
 by('payment').textContent=money(s.payment);by('interest').textContent=money(s.interestSum);by('savings').textContent=money(result.interestSaved);by('saved-months').textContent=t('months',{n:result.monthsSaved});
 const p=Math.round(v.principal*100),maxMonths=result.standard.rows.length;by('line-base').setAttribute('d',path(result.standard,maxMonths,p));by('line-extra').setAttribute('d',path(s,maxMonths,p));
 const tbody=by('schedule');tbody.replaceChildren();for(const row of s.rows){const tr=document.createElement('tr');for(const val of [L.number(row.month),money(row.payment),money(row.interest),money(row.principal),money(row.balance)]){const cell=document.createElement('td');cell.textContent=val;tr.append(cell)}tbody.append(tr)}}
function update(e){if(e)e.preventDefault();try{const v={};for(const id of FIELDS)v[id]=Number(by(id).value);C.validate(v);render(v);errorKey=null;if(e){try{localStorage.setItem(KEY,JSON.stringify(v));storageWarning=''}catch(storageError){storageWarning='storage.fail'}}}catch(err){errorKey=err;}showError();}
by('form').addEventListener('submit',update);for(const id of FIELDS)by(id).addEventListener('change',update);
by('csv').addEventListener('click',()=>{if(!result)return;const header=t('csv.header',{cur:L.currency});const url=URL.createObjectURL(new Blob([C.csv(result.withExtra,header)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='loansim-amortissement.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)});by('print').addEventListener('click',()=>window.print());
// Changement de langue ou de devise : réaffichage du dernier calcul valide, sans toucher aux champs en cours de saisie.
L.onChange(()=>{if(lastValues)render(lastValues);showError();});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));update();
})();
