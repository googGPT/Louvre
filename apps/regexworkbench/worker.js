/* RegexWorkbench — Web Worker : l'expression est exécutée ici, jamais dans la page.
   Si elle s'emballe (retour arrière catastrophique), la page arrête ce Worker (terminate) après le délai maximal. */
'use strict';
importScripts('./core.js');

self.onmessage = (event) => {
  const { id, req } = event.data || {};
  try {
    self.postMessage({ id, ok: true, result: self.RegexCore.execute(req) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
};
