# Index de consultation Louvre

Lire cet index avant de sélectionner une fiche. Rechercher un problème ou un mot-clé, puis ouvrir uniquement les fiches utiles. Les chemins ci-dessous sont exacts depuis la racine du dépôt ; les liens sont relatifs à cet index.

## Couverture et validation communes

Cinq fiches uniquement, issues de *Total TypeScript: The Essentials*, Matt Pocock avec Taylor Bell, No Starch Press (2026), catalogue `SRC-001`, cartographie `TS-2026`, chapitre 15, *Designing Your Types*. Les 70 chapitres sont cartographiés, sans être tous analysés ; les 69 autres chapitres restent uniquement indexés. Le chapitre 15 n'est pas couvert exhaustivement.

Pour chacune des cinq fiches : consultation du PDF et succès statique sous TypeScript 5.8.3 / Node.js 22.16.0 **rapportés par l'environnement source ChatGPT**. Ni PDF consulté ni compilation reproduite dans Codex lors de l'intégration. Aucun test runtime ou d'intégration applicative ; autres versions non validées. Les pages sont les pages physiques PDF, base 1, documentées dans les fiches et non revérifiées ici. Voir le [rapport](validation/TS15-static-typecheck.md) et l'[exemple original](examples/type-patterns.ts) si nécessaire.

## TS15-001 — Types génériques, valeurs par défaut et contraintes

- **Problème :** Factoriser les états de chargement de ressources aux contenus différents.
- **Mots-clés :** générique, ressource, ressources, generic, LoadState, Identified, contrainte, extends, paramètres par défaut.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-001-generic-types.md` — [ouvrir la fiche](concepts/language-and-types/TS15-001-generic-types.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 362–368.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Contraintes statiques, sans validation runtime ; context reste obligatoire dans ready.

## TS15-002 — Types de chaînes interpolées

- **Problème :** Distinguer statiquement les routes de projets des autres chemins.
- **Mots-clés :** route, routes, navigation, template literal, ProjectRoute, préfixe, chaîne.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-002-template-literals.md` — [ouvrir la fiche](concepts/language-and-types/TS15-002-template-literals.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 368–370 ; 382–383.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Le type accepte /projects/ sans identifiant ; garde runtime plus stricte ; unions potentiellement coûteuses.

## TS15-003 — Types conditionnels

- **Problème :** Transformer un scalaire en tableau sans ajouter un niveau aux tableaux existants.
- **Mots-clés :** conditionnel, conditionnels, conditional types, AsReadonlyArray, tableau, scalaire, readonly.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-003-conditional-types.md` — [ouvrir la fiche](concepts/language-and-types/TS15-003-conditional-types.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 370–371.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** readonly ne gèle pas les objets ; distributivité et récursion non analysées en détail.

## TS15-004 — Mapped types et remappage des clés

- **Problème :** Dériver des getters typés depuis un modèle sans divergence de contrats.
- **Mots-clés :** getter, getters, GetterFunctions, mapped types, keyof, remappage, clés, Capitalize.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-004-mapped-types.md` — [ouvrir la fiche](concepts/language-and-types/TS15-004-mapped-types.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 371–374 ; 384–387.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Ne crée pas les méthodes JavaScript ; collisions de noms à vérifier.

## TS15-005 — Résultat typé : succès et erreur

- **Problème :** Exprimer les erreurs métier prévisibles et imposer la distinction succès/échec.
- **Mots-clés :** Result<T, E>, Result, résultat, erreur, erreurs, succès, union discriminée, ok, parseAmount.
- **Chemin exact :** `technical-library/concepts/language-and-types/TS15-005-result-errors.md` — [ouvrir la fiche](concepts/language-and-types/TS15-005-result-errors.md).
- **Source :** `SRC-001` / `TS-2026`, *Total TypeScript: The Essentials*, chapitre 15, *Designing Your Types*.
- **Pages PDF documentées :** 375–379.
- **Validation :** contrôle statique source ChatGPT uniquement, selon le statut commun ci-dessus ; non reproduit dans Codex.
- **Limites propres :** Ne remplace pas try/catch ; entrées externes et exceptions inattendues à traiter.

## Connaissances absentes

Aucune fiche approfondie GitHub Actions (`GHA-2023`), Vue.js (`VUE-2024`), Next.js (`NEXT-2026`) ou *The Complete Developer* (`FULL-2024`). Leurs cartographies sont des inventaires, pas des preuves d'une technique ni des extractions. Aucun concept hors des cinq entrées n'est couvert par une fiche à ce jour.

Si aucune entrée ne convient, signaler cette absence. Une recommandation externe reste possible selon la demande, en étant explicitement séparée des connaissances Louvre et sans citation inventée. Une citation textuelle exacte non disponible ne peut pas être reconstituée depuis une synthèse.
