/* JSONInspector — Web Worker : l'analyse et le formatage des gros fichiers se font ici,
   pour que la page reste réactive. L'arbre reste dans le Worker ; l'interface demande des morceaux. */
'use strict';
importScripts('./core.js');
let session = null; // dernière analyse

self.onmessage = (event) => {
  const { id, op, args } = event.data || {};
  try {
    let result;
    if (op === 'analyze') { session = null; session = self.JsonCore.createSession(args[0]); result = session.result; }
    else if (!session || typeof session[op] !== 'function') throw new Error('err.node');
    else result = session[op](...args);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
};
