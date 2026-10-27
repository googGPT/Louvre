#!/usr/bin/env node
// Vérifie les traductions d'une appli : chaque langue a exactement les mêmes clés que le français,
// les mêmes paramètres {x}, et les mêmes formes de pluriel ; aucun texte vide.
// Usage : node scripts/check_messages.cjs <slug>   (ou sans argument : toutes les applis multilingues)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const LANGS = Object.keys(require(path.join(ROOT, 'shared', 'louvre-i18n.js')).LANGS);

function load(file) { // exécute messages.js dans un bac à sable et récupère LouvreMessages
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { timeout: 2000 });
  return sandbox.window.LouvreMessages;
}
const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
function shape(v) { return typeof v === 'object' && v !== null ? 'plural:' + params(v.other) : 'text:' + params(v); }

function check(slug) {
  const file = slug === '_home' ? path.join(ROOT, 'assets', 'home-messages.js') : path.join(ROOT, 'apps', slug, 'messages.js');
  const m = load(file), errors = [];
  if (!m || !m.fr) return [`${slug} : LouvreMessages.fr manquant`];
  const ref = Object.keys(m.fr);
  for (const lang of LANGS) {
    const cur = m[lang];
    if (!cur) { errors.push(`${slug} : langue ${lang} absente`); continue; }
    for (const k of ref) {
      if (!(k in cur)) errors.push(`${slug} [${lang}] clé manquante : ${k}`);
      else if (shape(cur[k]) !== shape(m.fr[k])) errors.push(`${slug} [${lang}] paramètres ou pluriel différents : ${k}`);
      else if (typeof cur[k] === 'string' ? !cur[k].trim() : !cur[k].other) errors.push(`${slug} [${lang}] texte vide : ${k}`);
      if (typeof cur[k] === 'object' && cur[k] && !('other' in cur[k])) errors.push(`${slug} [${lang}] pluriel sans forme « other » : ${k}`);
    }
    for (const k of Object.keys(cur)) if (!(k in m.fr)) errors.push(`${slug} [${lang}] clé inconnue : ${k}`);
  }
  return errors;
}

const targets = process.argv[2] ? [process.argv[2]]
  : fs.readdirSync(path.join(ROOT, 'apps')).filter((d) => fs.existsSync(path.join(ROOT, 'apps', d, 'messages.js')))
    .concat(fs.existsSync(path.join(ROOT, 'assets', 'home-messages.js')) ? ['_home'] : []);
const all = targets.flatMap(check);
if (all.length) { console.error(all.join('\n')); process.exit(1); }
console.log(`OK : traductions complètes (${targets.length} ensemble(s), ${LANGS.length} langues).`);
