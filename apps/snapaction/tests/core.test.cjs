const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../core.js');
const now=new Date('2026-10-25T12:00:00.000Z');
const make=(data={})=>core.createTask({title:'Envoyer le dossier',dueAt:'2026-10-26T12:30:00.000Z',...data},now,'task-123456789');
const clock=(x)=>new Date(x);
test('date relative en minutes sans service externe',()=>{
 const p=core.parseCommand('rappelle-moi dans 20 minutes',now);
 assert.equal(p.dueAt,'2026-10-25T12:20:00.000Z');
});
test('date relative en heures',()=>assert.equal(core.parseCommand('dans 2 heures',now).dueAt,'2026-10-25T14:00:00.000Z'));
test('date relative en jours',()=>assert.equal(core.parseCommand('dans 3 jours',now).dueAt,'2026-10-28T12:00:00.000Z'));
test('aucune date reconnue implique échéance absente',()=>assert.equal(core.parseCommand('acheter du pain',now).dueAt,null));
test('demain à 14h30, vérification heure locale',()=>{
 const p=core.parseCommand('envoyer le dossier demain à 14h30',now);
 const d=new Date(p.dueAt);assert.equal(d.getHours(),14);assert.equal(d.getMinutes(),30);assert.equal(d.getDate(),26);
});
test('lundi prochain',()=>{
 const p=core.parseCommand('acheter lundi prochain à 9h',now);const d=new Date(p.dueAt);
 assert.equal(d.getDay(),1);assert.equal(d.getHours(),9);
});
test('date explicite invalide refusée',()=>assert.equal(core.parseCommand('faire ceci le 31/02/2027 à 10h',now).dueAt,null));
test('date explicite ISO lisible',()=>{
 const d=new Date(core.parseCommand('payer 2026-11-05 à 16:00',now).dueAt);assert.equal(d.getFullYear(),2026);assert.equal(d.getMonth(),10);assert.equal(d.getDate(),5);assert.equal(d.getHours(),16);
});
test('titre malveillant reste une chaîne de texte (non HTML)',()=>{
 const task=make({title:'<img src=x onerror=alert(1)>'});assert.equal(task.title,'<img src=x onerror=alert(1)>');
});
test('tâche valide, créée avec ID stable et types explicites',()=>assert.equal(core.validTask(make()),true));
test('tâche invalide: champs supplémentaires',()=>assert.equal(core.validTask({...make(),role:'admin'}),false));
test('tâche invalide: date non ISO',()=>assert.equal(core.validTask({...make(),dueAt:'tomorrow'}),false));
test('tâche invalide: image hors MIME autorisé',()=>assert.equal(core.validTask({...make(),image:'data:text/html;base64,PHNjcmlwdD4='}),false));
test('tâche invalide: priorité inconnue',()=>assert.equal(core.validTask({...make(),priority:'urgent!!'}),false));
test('tâche invalide: titre vide (erreur sous forme de clé traduisible)',()=>assert.throws(()=>make({title:'  '}),/^Error: err\.title\|\{"max":180\}$/));
test('changement de statut non destructif',()=>{
 const t=make();const s=core.changeStatus(t,true,clock('2026-10-26T13:00:00.000Z'));
 assert.equal(s.completedAt,'2026-10-26T13:00:00.000Z');assert.equal(t.completedAt,null);
});
test('répétition quotidienne garde l heure locale',()=>{
 const d=core.nextDue('2026-10-25T13:30:00.000Z','daily');const v=new Date(d);
 assert.equal(v.getDate(),26);assert.equal(v.getHours(),new Date('2026-10-25T13:30:00.000Z').getHours());
});
test('répétition hebdomadaire garde le jour de semaine',()=>{
 const d=core.nextDue('2026-10-26T13:30:00.000Z','weekly');assert.equal(new Date(d).getDay(),1);
});
test('répétition mensuelle fin de mois plafonnée',()=>{
 const d=core.nextDue('2026-01-31T13:00:00.000Z','monthly');assert.equal(new Date(d).getMonth(),1);assert.equal(new Date(d).getDate(),28);
});
test('pas de répétition si none',()=>assert.equal(core.nextDue('2026-11-26T13:30:00.000Z','none'),null));
test('statistiques distinguent tâches du jour et en retard',()=>{
 const a=make({dueAt:'2026-10-25T09:00:00.000Z'});
 const b=core.createTask({title:'Deuxième',dueAt:'2026-10-28T09:00:00.000Z'},now,'task-123456780');
 const s=core.statistics([a,b],now);assert.equal(s.open,2);assert.equal(s.overdue,1);assert.equal(s.today,1);
});
test('recherche case-insensitive et filtre done',()=>{
 const a=make();const b=core.changeStatus(a,true,clock('2026-10-26T13:00:00.000Z'));
 assert.equal(core.filterTasks([a],'inbox','dOsSiEr').length,1);
 assert.equal(core.filterTasks([b],'done').length,1);
 assert.equal(core.filterTasks([b],'inbox').length,0);
});
test('backup et restauration sans perte',()=>{
 const o=core.backup([make()],now);assert.deepEqual(core.validateBackup(JSON.parse(JSON.stringify(o))),o.tasks);
});
test('restauration refuse version inconnue',()=>assert.throws(()=>core.validateBackup({...core.backup([make()],now),version:9})));
test('restauration refuse id doublon',()=>assert.throws(()=>core.validateBackup(core.backup([make(),make()],now))));
test('restauration refuse champs supplémentaires',()=>assert.throws(()=>core.validateBackup({...core.backup([make()],now),extra:1})));
test('restauration refuse entrée HTML à la place image',()=>assert.throws(()=>core.validateBackup(core.backup([{...make(),image:'javascript:alert(1)'}],now))));
test('export calendrier contient titre et date attendue',()=>{
 const result=core.exportIcs([make({title:'Bonjour, monde; test\\x'})]);
 assert.ok(result.includes('BEGIN:VEVENT'));assert.ok(result.includes('SUMMARY:Bonjour\\, monde\\; test\\\\x'));assert.ok(result.includes('DTSTART:20261026T123000Z'));
});
test('export calendrier ignore tâche terminée',()=>{
 const done=core.changeStatus(make(),true,clock('2026-10-26T13:00:00.000Z'));
 assert.ok(!core.exportIcs([done]).includes('BEGIN:VEVENT'));
});
test('dates reconnues dans les 7 langues de l interface',()=>{
 const tomorrow1430=(txt)=>{const d=new Date(core.parseCommand(txt,now).dueAt);return [d.getDate(),d.getHours(),d.getMinutes()];};
 for(const txt of ['send the file tomorrow at 14:30','enviar mañana 14:30','enviar amanhã às 14h30','morgen um 14:30 senden','inviare domani alle 14:30','إرسال الملف غدا 14:30'])
  assert.deepEqual(tomorrow1430(txt),[26,14,30],txt);
 assert.equal(new Date(core.parseCommand('call tomorrow 2pm',now).dueAt).getHours(),14);
 assert.equal(new Date(core.parseCommand('morgen 14 Uhr',now).dueAt).getHours(),14);
 for(const txt of ['in 2 hours','en 2 horas','em 2 horas','in 2 Stunden','tra 2 ore','بعد 2 ساعات'])
  assert.equal(core.parseCommand(txt,now).dueAt,'2026-10-25T14:00:00.000Z',txt);
 for(const txt of ['day after tomorrow','pasado mañana','depois de amanhã','übermorgen','dopodomani','بعد غد'])
  assert.equal(new Date(core.parseCommand(txt,now).dueAt).getDate(),27,txt);
 for(const txt of ['monday 9:00','lunes 9:00','segunda-feira 9h','Montag 9 Uhr','lunedì 9:00','الاثنين 9:00'])
  assert.equal(new Date(core.parseCommand(txt,now).dueAt).getDay(),1,txt);
});
test('mots proches non confondus avec une date',()=>{
 assert.equal(core.parseCommand('acheter 1.5 kg de riz',now).dueAt,null);
 assert.equal(core.parseCommand('Morgenroutine planen',now).dueAt,null); // « morgen » dans un mot plus long
 assert.equal(core.parseCommand('inviter 5 amis',now).dueAt,null);
});
