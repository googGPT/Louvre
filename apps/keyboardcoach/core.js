/* KeyboardCoach: pure timing and positional Unicode-codepoint metrics.
   Scoring is based on current, uncorrected mistakes, not historical keystrokes. */
(function(root){'use strict';
const PASSAGES=Object.freeze([
 {id:'fr-calm',lang:'fr',level:'facile',title:'Un matin tranquille',text:'Chaque matin, je prends quelques minutes pour organiser mes idées. Une petite pause aide à retrouver le calme.'},
 {id:'fr-garden',lang:'fr',level:'facile',title:'Au jardin',text:'Dans le jardin, les fleurs poussent près des arbres. Le soleil réchauffe la terre après la pluie.'},
 {id:'fr-science',lang:'fr',level:'moyen',title:'Recherche et méthode',text:'Une recherche rigoureuse commence par une question précise. Les données doivent être vérifiées, puis analysées avec méthode.'},
 {id:'fr-travel',lang:'fr',level:'moyen',title:'Voyage en train',text:'À l’arrivée du train, les voyageurs consultent les panneaux. Le départ est annoncé à 14 h 35, voie numéro six.'},
 {id:'fr-debate',lang:'fr',level:'avance',title:'Esprit critique',text:'La précision exige de distinguer les faits établis des hypothèses : une conclusion convaincante doit résister à l’examen des données.'},
 {id:'fr-design',lang:'fr',level:'avance',title:'Concevoir et vérifier',text:'Concevoir un système robuste implique des essais répétés, des corrections mesurables et la reconnaissance explicite de ses limites.'},
 {id:'en-river',lang:'en',level:'facile',title:'A quiet river',text:'A calm river flows past the bridge. Small boats move slowly as the afternoon light fades.'},
 {id:'en-planning',lang:'en',level:'facile',title:'Daily planning',text:'A clear plan helps a team finish its work. Each person knows what to do and when to ask for help.'},
 {id:'en-analysis',lang:'en',level:'moyen',title:'Evidence and reasoning',text:'Reliable conclusions depend on careful measurements, reproducible methods, and a transparent account of uncertainty.'},
 {id:'en-project',lang:'en',level:'moyen',title:'Working together',text:'Before starting a project, define its scope, agree on milestones, and check whether the available resources are sufficient.'},
 {id:'en-accuracy',lang:'en',level:'avance',title:'Accuracy under pressure',text:'Effective communication requires precision: distinguish tentative assumptions from observations, and revise claims when new evidence appears.'},
 {id:'en-engineering',lang:'en',level:'avance',title:'Iterative engineering',text:'Robust software emerges from measurable requirements, independent tests, and deliberate choices about failure modes and maintenance.'},
 // Textes originaux des autres langues de l'interface (identifiants nouveaux : l'historique existant reste valide).
 {id:'es-morning',lang:'es',level:'facile',title:'Una mañana tranquila',text:'Cada mañana dedico unos minutos a ordenar mis ideas. Una pequeña pausa ayuda a recuperar la calma.'},
 {id:'es-park',lang:'es',level:'facile',title:'En el parque',text:'En el parque, los niños juegan cerca del lago. El sol calienta los bancos después de la lluvia.'},
 {id:'es-method',lang:'es',level:'moyen',title:'Investigación y método',text:'Una investigación rigurosa empieza con una pregunta precisa. Los datos deben comprobarse y luego analizarse con método.'},
 {id:'es-train',lang:'es',level:'moyen',title:'Viaje en tren',text:'Al llegar el tren, los viajeros miran los paneles. La salida está prevista a las 14:35 en la vía número seis.'},
 {id:'es-critical',lang:'es',level:'avance',title:'Pensamiento crítico',text:'La precisión exige distinguir los hechos comprobados de las hipótesis: una conclusión convincente debe resistir el examen de los datos.'},
 {id:'es-design',lang:'es',level:'avance',title:'Diseñar y verificar',text:'Diseñar un sistema robusto implica pruebas repetidas, correcciones medibles y el reconocimiento explícito de sus límites.'},
 {id:'ar-morning',lang:'ar',level:'facile',title:'صباح هادئ',text:'كل صباح أخصص بضع دقائق لترتيب أفكاري. استراحة قصيرة تساعد على استعادة الهدوء.'},
 {id:'ar-garden',lang:'ar',level:'facile',title:'في الحديقة',text:'في الحديقة تنمو الأزهار قرب الأشجار. وتدفئ الشمس الأرض بعد المطر.'},
 {id:'ar-method',lang:'ar',level:'moyen',title:'البحث والمنهج',text:'يبدأ البحث الدقيق بسؤال واضح. يجب التحقق من البيانات ثم تحليلها بطريقة منهجية.'},
 {id:'ar-train',lang:'ar',level:'moyen',title:'رحلة بالقطار',text:'عند وصول القطار ينظر المسافرون إلى اللوحات. موعد الانطلاق في الساعة 14:35 من الرصيف رقم ستة.'},
 {id:'ar-critical',lang:'ar',level:'avance',title:'التفكير النقدي',text:'تتطلب الدقة التمييز بين الحقائق الثابتة والفرضيات: فالاستنتاج المقنع يجب أن يصمد أمام فحص البيانات.'},
 {id:'ar-design',lang:'ar',level:'avance',title:'التصميم والتحقق',text:'يتطلب تصميم نظام متين اختبارات متكررة، وتصحيحات قابلة للقياس، واعترافا صريحا بحدوده.'},
 {id:'pt-morning',lang:'pt',level:'facile',title:'Uma manhã tranquila',text:'Todas as manhãs, tiro alguns minutos para organizar as ideias. Uma pequena pausa ajuda a recuperar a calma.'},
 {id:'pt-garden',lang:'pt',level:'facile',title:'No jardim',text:'No jardim, as flores crescem perto das árvores. O sol aquece a terra depois da chuva.'},
 {id:'pt-method',lang:'pt',level:'moyen',title:'Investigação e método',text:'Uma investigação rigorosa começa com uma pergunta precisa. Os dados devem ser verificados e depois analisados com método.'},
 {id:'pt-train',lang:'pt',level:'moyen',title:'Viagem de comboio',text:'À chegada do comboio, os passageiros consultam os painéis. A partida está anunciada para as 14h35, na linha seis.'},
 {id:'pt-critical',lang:'pt',level:'avance',title:'Espírito crítico',text:'A precisão exige distinguir os factos comprovados das hipóteses: uma conclusão convincente tem de resistir à análise dos dados.'},
 {id:'pt-design',lang:'pt',level:'avance',title:'Conceber e verificar',text:'Conceber um sistema robusto implica testes repetidos, correções mensuráveis e o reconhecimento explícito dos seus limites.'},
 {id:'de-morning',lang:'de',level:'facile',title:'Ein ruhiger Morgen',text:'Jeden Morgen nehme ich mir ein paar Minuten, um meine Gedanken zu ordnen. Eine kleine Pause hilft, zur Ruhe zu kommen.'},
 {id:'de-garden',lang:'de',level:'facile',title:'Im Garten',text:'Im Garten wachsen die Blumen neben den Bäumen. Nach dem Regen wärmt die Sonne die Erde.'},
 {id:'de-method',lang:'de',level:'moyen',title:'Forschung und Methode',text:'Gründliche Forschung beginnt mit einer genauen Frage. Die Daten müssen geprüft und dann methodisch ausgewertet werden.'},
 {id:'de-train',lang:'de',level:'moyen',title:'Mit dem Zug unterwegs',text:'Bei der Ankunft des Zuges schauen die Reisenden auf die Anzeigetafel. Die Abfahrt ist für 14:35 Uhr auf Gleis sechs angekündigt.'},
 {id:'de-critical',lang:'de',level:'avance',title:'Kritisches Denken',text:'Genauigkeit verlangt, gesicherte Fakten von Annahmen zu unterscheiden: Eine überzeugende Schlussfolgerung muss der Prüfung der Daten standhalten.'},
 {id:'de-design',lang:'de',level:'avance',title:'Entwerfen und prüfen',text:'Ein robustes System zu entwerfen erfordert wiederholte Tests, messbare Korrekturen und das offene Eingeständnis seiner Grenzen.'},
 {id:'it-morning',lang:'it',level:'facile',title:'Una mattina tranquilla',text:'Ogni mattina mi prendo qualche minuto per mettere ordine nelle idee. Una piccola pausa aiuta a ritrovare la calma.'},
 {id:'it-garden',lang:'it',level:'facile',title:'In giardino',text:'In giardino i fiori crescono vicino agli alberi. Dopo la pioggia il sole scalda la terra.'},
 {id:'it-method',lang:'it',level:'moyen',title:'Ricerca e metodo',text:'Una ricerca rigorosa comincia con una domanda precisa. I dati vanno verificati e poi analizzati con metodo.'},
 {id:'it-train',lang:'it',level:'moyen',title:'Viaggio in treno',text:"All'arrivo del treno, i viaggiatori guardano i tabelloni. La partenza è prevista alle 14:35 dal binario sei."},
 {id:'it-critical',lang:'it',level:'avance',title:'Spirito critico',text:"La precisione richiede di distinguere i fatti accertati dalle ipotesi: una conclusione convincente deve reggere all'esame dei dati."},
 {id:'it-design',lang:'it',level:'avance',title:'Progettare e verificare',text:'Progettare un sistema robusto richiede prove ripetute, correzioni misurabili e il riconoscimento esplicito dei propri limiti.'}
].map(x=>Object.freeze({...x})));
const DURATIONS=Object.freeze([30,60,120]),LEVELS=Object.freeze(['facile','moyen','avance']),LANGS=Object.freeze(['fr','en','es','ar','pt','de','it']);
const HISTORY_KEY='louvre-wave2-keyboardcoach-v1',MAX_HISTORY=30,VERSION=1;
const codepoints=s=>Array.from(s);
// Les erreurs portent une clé de traduction (messages.js) : l'interface les affiche dans la langue choisie.
function fail(key){throw Error(key);}
function validClock(now){
 if(typeof now!=='number'||!Number.isFinite(now)||now<0)fail('err.clock');
 return now;
}
function passage(id){
 const x=PASSAGES.find(p=>p.id===id);if(!x)fail('err.passage');
 return x;
}
function create(id='fr-calm',duration=60){
 passage(id);if(!DURATIONS.includes(duration))fail('err.duration');
 return {id,durationMs:duration*1000,mode:'ready',typed:'',elapsedMs:0,startedAt:null};
}
function validateSession(s){
 if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['id','durationMs','mode','typed','elapsedMs','startedAt'].includes(k)))
  fail('err.session');
 const target=passage(s.id);
 if(!DURATIONS.includes(s.durationMs/1000)||!['ready','running','paused','finished'].includes(s.mode)||
    typeof s.typed!=='string'||codepoints(s.typed).length>codepoints(target.text).length||
    typeof s.elapsedMs!=='number'||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0||s.elapsedMs>s.durationMs)
  fail('err.sessionState');
 if(s.mode==='running'&&(typeof s.startedAt!=='number'||s.startedAt<0||!Number.isFinite(s.startedAt)))
  fail('err.sessionClock');
 if(s.mode!=='running'&&s.startedAt!==null)fail('err.sessionIdle');
 return s;
}
function elapsed(s,now){
 validateSession(s);validClock(now);
 return Math.min(s.durationMs,Math.max(0,s.elapsedMs+(s.mode==='running'?Math.max(0,now-s.startedAt):0)));
}
function tick(s,now){
 validateSession(s);validClock(now);
 if(s.mode!=='running')return s;
 const dt=elapsed(s,now);
 if(dt>=s.durationMs)return {...s,mode:'finished',elapsedMs:s.durationMs,startedAt:null};
 return s;
}
function input(s,value,now){
 validateSession(s);validClock(now);
 if(typeof value!=='string'||codepoints(value).length>codepoints(passage(s.id).text).length)
  fail('err.input');
 if(s.mode==='finished'||s.mode==='paused')return s;
 if(s.mode==='running'&&elapsed(s,now)>=s.durationMs)return tick(s,now);
 if(s.mode==='ready'){
  if(!value)return s;
  const next={...s,mode:'running',startedAt:now,typed:value};
  return codepoints(value).length===codepoints(passage(s.id).text).length
   ?{...next,mode:'finished',startedAt:null,elapsedMs:0}:next;
 }
 const next={...s,typed:value};
 if(codepoints(value).length===codepoints(passage(s.id).text).length){
  return {...next,mode:'finished',elapsedMs:elapsed(s,now),startedAt:null};
 }
 return next;
}
function pause(s,now){
 validateSession(s);validClock(now);
 if(s.mode==='running')return {...s,mode:'paused',elapsedMs:elapsed(s,now),startedAt:null};
 return s;
}
function resume(s,now){
 validateSession(s);validClock(now);
 if(s.mode==='paused')return {...s,mode:'running',startedAt:now};
 return s;
}
function finish(s,now){
 validateSession(s);validClock(now);
 if(s.mode==='finished')return s;
 if(s.mode==='ready')return {...s,mode:'finished',elapsedMs:0};
 return {...s,mode:'finished',elapsedMs:elapsed(s,now),startedAt:null};
}
function metrics(s,now){
 validateSession(s);validClock(now);
 const t=codepoints(passage(s.id).text),u=codepoints(s.typed),ms=elapsed(s,now);
 const correct=u.reduce((n,c,i)=>n+(c===t[i]?1:0),0),errors=u.length-correct;
 const minutes=Math.max(1000,ms)/60000;
 const pct=(num,den)=>den?Math.round(10000*num/den)/100:0;
 const wpm=num=>Math.round(num/5/minutes*10)/10;
 return {typed:u.length,correct,errors,target:t.length,remaining:t.length-u.length,
  accuracy:pct(correct,u.length),progress:pct(u.length,t.length),
  rawWpm:wpm(u.length),netWpm:wpm(correct),elapsedMs:ms,
  remainingMs:Math.max(0,s.durationMs-ms),mode:s.mode};
}
function record(s,now,epochMs){
 const m=metrics(s,now);
 if(s.mode!=='finished')fail('err.notFinished');
 if(!Number.isSafeInteger(epochMs)||epochMs<0||epochMs>8640000000000000)fail('err.date');
 return {at:epochMs,id:s.id,duration:s.durationMs/1000,elapsedMs:Math.round(m.elapsedMs),
  typed:m.typed,correct:m.correct,accuracy:m.accuracy,rawWpm:m.rawWpm,netWpm:m.netWpm};
}
function history(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['version','records'].includes(k))||
    raw.version!==VERSION||!Array.isArray(raw.records)||raw.records.length>MAX_HISTORY)fail('err.history');
 const safe={version:VERSION,records:[]};
 for(const r of raw.records){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='accuracy,at,correct,duration,elapsedMs,id,netWpm,rawWpm,typed')fail('err.record');
  const target=codepoints(passage(r.id).text).length;
  if(!DURATIONS.includes(r.duration)||!Number.isSafeInteger(r.at)||r.at<0||r.at>8640000000000000||
     !Number.isSafeInteger(r.elapsedMs)||r.elapsedMs<0||r.elapsedMs>r.duration*1000||
     !Number.isSafeInteger(r.typed)||r.typed<0||r.typed>target||
     !Number.isSafeInteger(r.correct)||r.correct<0||r.correct>r.typed||
     ![r.accuracy,r.rawWpm,r.netWpm].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=20000))
   fail('err.measures');
  // All derived scores must be internally coherent; imported results are not authoritative certifications.
  const min=Math.max(1000,r.elapsedMs)/60000,score=n=>Math.round(n/5/min*10)/10;
  const precision=r.typed?Math.round(10000*r.correct/r.typed)/100:0;
  if(precision!==r.accuracy||score(r.typed)!==r.rawWpm||score(r.correct)!==r.netWpm)
   fail('err.incoherent');
  safe.records.push({...r});
 }
 return safe;
}
function appendHistory(h,r){
 const a=history(h);const next={version:1,records:[...a.records,r].slice(-MAX_HISTORY)};
 return history(next);
}
// header : en-tête traduit fourni par l'interface (11 colonnes) ; en-tête français par défaut.
function csv(h,header){
 const v=history(h);
 const lines=[header||'Date ISO,Exercice,Langue,Niveau,Durée (s),Temps actif (s),Caractères,Corrects,Précision (%),Brut (MPM),Net (MPM)'];
 for(const r of v.records){
  const p=passage(r.id);
  const row=[new Date(r.at).toISOString(),p.id,p.lang,p.level,r.duration,(r.elapsedMs/1000).toFixed(1),
    r.typed,r.correct,r.accuracy.toFixed(2),r.rawWpm.toFixed(1),r.netWpm.toFixed(1)];
  lines.push(row.join(','));
 }
 return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
root.KeyboardCore=Object.freeze({PASSAGES,DURATIONS,LANGS,LEVELS,VERSION,HISTORY_KEY,MAX_HISTORY,codepoints,passage,create,validateSession,elapsed,tick,input,pause,resume,finish,metrics,record,history,appendHistory,csv});
if(typeof module!=='undefined'&&module.exports)module.exports=root.KeyboardCore;
})(typeof window==='undefined'?globalThis:window);
