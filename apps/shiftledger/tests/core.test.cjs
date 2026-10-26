const test=require('node:test'),a=require('node:assert/strict'),C=require('../core.js');
const s={id:'s_abcdefgh',date:'2026-10-26',start:'09:00',end:'17:30',breakMinutes:30,label:'Matin'};
const p={rate:15,threshold:8,multiplier:1.25};
const mk=(v={})=>({...s,...v}),data=(shifts,params=p)=>({version:1,shifts,params});
test('service 9h à 17h30 avec pause de 30 min = 8h nettes',()=>a.equal(C.shift(s).minutes,480));
test('service traversant minuit 22h à 6h = 8h',()=>{
 const x=C.shift(mk({start:'22:00',end:'06:00',breakMinutes:0}));
 a.equal(x.minutes,480);a.equal(x.overnight,true);
});
test('début égal fin ambigu refusé plutôt que 24 heures',()=>a.throws(()=>C.shift(mk({start:'09:00',end:'09:00'}))));
test('durée de 23h59 acceptée si aucun repos ni pause',()=>{
 a.equal(C.shift(mk({start:'00:01',end:'00:00',breakMinutes:0})).minutes,1439);
});
test('pause égale à la durée refusée',()=>a.throws(()=>C.shift(mk({start:'09:00',end:'10:00',breakMinutes:60}))));
test('pause au delà de 600 min rejetée',()=>a.throws(()=>C.shift(mk({breakMinutes:601}))));
test('pause fractionnaire et pause négative refusées',()=>{
 a.throws(()=>C.shift(mk({breakMinutes:20.3})));
 a.throws(()=>C.shift(mk({breakMinutes:-1})));
});
test('time strict hours and minute boundaries',()=>{
 a.equal(C.minutes('23:59'),1439);a.equal(C.minutes('00:00'),0);
 for(const v of ['24:00','12:60','2:00','10:1','10:01Z','abc','00:00 '])a.throws(()=>C.minutes(v));
});
test('dates civiles valides, années bissextiles et invalides',()=>{
 a.equal(C.date('2028-02-29'),'2028-02-29');
 for(const v of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01','0000-01-01','2026-01-00','2026-01-32'])a.throws(()=>C.date(v));
});
test('date du jour fournie comme date locale',()=>{
 const x=new Date(2026,9,26,12);a.equal(C.todayKey(x),'2026-10-26');
});
test('8h nettes à 15 euros = 120 euros',()=>a.equal(C.compute([s],p).grossCents,12000));
test('10h à 15 euros, 2h majorées à 25 % = 157,50 euros',()=>{
 const x=C.compute([mk({end:'19:00',breakMinutes:0})],p);
 a.equal(x.normal,480);a.equal(x.overtime,120);a.equal(x.grossCents,15750);
});
test('le seuil quotidien agrège deux services le même jour',()=>{
 const two=mk({id:'s_extra01',start:'14:00',end:'19:00',breakMinutes:0});
 const first=mk({start:'08:00',end:'13:00',breakMinutes:0});
 const x=C.compute([first,two],p);
 a.equal(x.total,600);a.equal(x.normal,480);a.equal(x.overtime,120);
 a.equal(x.grossCents,15750);a.equal(x.dayCount,1);
});
test('le seuil quotidien se réinitialise au changement de date',()=>{
 const two=mk({id:'s_extra01',date:'2026-10-27',start:'08:00',end:'13:00',breakMinutes:0});
 const first=mk({start:'08:00',end:'13:00',breakMinutes:0});
 const x=C.compute([first,two],p);
 a.equal(x.normal,600);a.equal(x.overtime,0);a.equal(x.dayCount,2);
});
test('nuit comptée dans le jour de début et documentée',()=>{
 const v=mk({start:'22:00',end:'06:00',breakMinutes:0});
 const x=C.compute([v],p);
 a.equal(x.total,480);a.equal(x.overnightCount,1);
 a.equal(x.days[0].date,'2026-10-26');
});
test('service de nuit et matinée du même jour de début s’agrègent',()=>{
 const night=mk({id:'s_night01',start:'22:00',end:'06:00',breakMinutes:0});
 const morning=mk({id:'s_morn001',start:'08:00',end:'12:00',breakMinutes:0});
 const x=C.compute([night,morning],p);
 a.equal(x.overtime,240);
});
test('total des pauses calculé, sans les payer',()=>{
 const x=C.compute([s],p);a.equal(x.breakMinutes,30);a.equal(x.grossMinutes,510);a.equal(x.total,480);
});
test('fraction d’heure rémunérée et arrondi en centimes',()=>{
 const x=C.compute([mk({start:'09:00',end:'09:01',breakMinutes:0})],{rate:15,threshold:8,multiplier:1});
 a.equal(x.grossCents,25);
});
test('paramètres à zéro autorisent un taux nul',()=>{
 a.equal(C.compute([s],{...p,rate:0}).grossCents,0);
});
test('taux et seuil hors bornes rejetés',()=>{
 for(const q of [{...p,rate:-1},{...p,rate:Infinity},{...p,threshold:0},{...p,threshold:25},{...p,multiplier:5}])a.throws(()=>C.params(q));
});
test('sauvegarde historique v1 préservée après validation',()=>{
 a.deepEqual(C.backup(data([s])),data([s]));
});
test('un ancien champ calculé minutes est refusé',()=>{
 a.throws(()=>C.backup(data([{...s,minutes:480}])));
});
test('entrée null, tableau et mauvais schéma rejetés',()=>{
 for(const q of [null,[],{},data(null),{version:2,shifts:[s],params:p},data([s],null)])a.throws(()=>C.backup(q));
});
test('identifiants dupliqués, nombre maximal 500',()=>{
 a.throws(()=>C.backup(data([s,s])));
 const rows=Array.from({length:500},(_,i)=>mk({id:'s_'+String(i).padStart(7,'0')}));
 a.doesNotThrow(()=>C.backup(data(rows)));
 a.throws(()=>C.backup(data([...rows,mk({id:'s_extra01'})])));
});
test('champs supplémentaires non fiables rejetés',()=>a.throws(()=>C.shift({...s,script:'alert'})));
test('chevauchement entre deux services du même jour identifié',()=>{
 const r=C.overlapWarnings([s,mk({id:'s_extra01',start:'17:00',end:'20:00',breakMinutes:0})]);
 a.equal(r.length,1);
});
test('chevauchement entre service de nuit et service du lendemain détecté',()=>{
 const items=[mk({start:'22:00',end:'06:00',breakMinutes:0}),
  mk({id:'s_extra01',date:'2026-10-27',start:'05:30',end:'08:00',breakMinutes:0})];
 a.equal(C.overlapWarnings(items).length,1);
});
test('absence de chevauchement aux plages adjacentes',()=>{
 const items=[mk({start:'09:00',end:'12:00',breakMinutes:0}),
  mk({id:'s_extra01',start:'12:00',end:'14:00',breakMinutes:0})];
 a.equal(C.overlapWarnings(items).length,0);
});
test('un chevauchement est signalé et non silencieusement supprimé',()=>{
 const r=[s,mk({id:'s_extra01',start:'17:00',end:'20:00',breakMinutes:0})];
 a.equal(C.compute(r,p).total,630);a.equal(C.overlapWarnings(r).length,1);
});
test('CSV possède BOM, en-tête et 1 ligne par service',()=>{
 const c=C.csv([s]);a.ok(c.startsWith('\uFEFF'));a.match(c,/"Date";"Début";"Fin"/);a.equal(c.trim().split('\r\n').length,2);
});
test('CSV neutralise les formules et double les guillemets',()=>{
 const c=C.csv([mk({label:'=HYPERLINK("https://example.invalid")'})]);
 a.match(c,/"'=HYPERLINK\(""https:\/\/example.invalid""\)"/);
});
test('CSV accepte une étiquette commençant par espaces et signe dangereux',()=>{
 const c=C.csv([mk({label:'  +SUM(1)'})]);a.match(c,/"'  \+SUM\(1\)"/);
});
test('CSV refuse doublons et données non valides',()=>{
 a.throws(()=>C.csv([s,s]));a.throws(()=>C.csv([mk({start:'99:00'})]));
});
test('calcul ne modifie pas le tableau d’entrée ni ses objets',()=>{
 const before=JSON.stringify(s);C.shift(s);C.compute([s],p);C.overlapWarnings([s]);C.csv([s]);
 a.equal(JSON.stringify(s),before);
});
