# Contrôle pilote des types TypeScript — 2026-10-25

## Origine des résultats

Les résultats et l'historique de correction ci-dessous proviennent du rapport fourni dans `Louvre_ETAPE3_pilote_TS.zip`, établi dans l'environnement source ChatGPT. Ils n'ont pas été reproduits par Codex et ne constituent pas une validation indépendante du PDF ou des exemples ici.

## Périmètre source ChatGPT

Fichier : `technical-library/examples/type-patterns.ts`

- Lecture source : pages physiques 362–387 du PDF *Total TypeScript: The Essentials*, chapitre 15 ; chaque fiche précise ses pages.
- Langage : TypeScript.
- Outils : Node.js `v22.16.0` ; `tsc` `5.8.3`.
- Commande exécutée depuis la racine du paquet :

```bash
tsc --strict --noEmit --target ES2022 --module ESNext technical-library/examples/type-patterns.ts
```

## Résultat observé

Statut de sortie : `0` ; aucune erreur de compilation dans la version finale.

Le fichier contient **cinq scénarios négatifs**, chacun documenté par `@ts-expect-error`. Leur prise en compte par TypeScript 5.8.3 est établie par l'absence d'erreur `TS2578` dans la compilation finale.

Lors d'une première exécution, le nom global `Report` heurtait une déclaration `Report` dans `lib.dom.d.ts` et provoquait plusieurs erreurs. Le fichier a été corrigé en ajoutant `export {}` pour isoler les déclarations au niveau du module ; la nouvelle compilation est passée.

## Limites

- Aucune exécution JavaScript et aucun test fonctionnel ou réseau ; le contrôle est **uniquement statique**.
- La version actuelle la plus récente de TypeScript n'a pas été recherchée ni testée.
- Les cas limites au niveau runtime nécessitent une validation supplémentaire.
- Aucune affirmation de couverture exhaustive du chapitre 15.

## Contrôles effectués dans Codex — 2026-10-25

- ZIP accessible : huit fichiers inspectés, intégrité CRC contrôlée, aucun PDF.
- Cinq fiches examinées au regard du modèle : identifiants, source, chapitre, pages, explications, principes, limites, exemples, validation, compatibilité, confiance et points ouverts documentés.
- Node.js disponible : `v24.19.0`. `command -v tsc` ne trouve aucun compilateur ; aucun paquet TypeScript trouvé dans le dossier local du dépôt ou le répertoire global indiqué par npm. Aucune dépendance installée pour ce lot.
- Contrôle statique prévu : **non exécuté dans Codex**. Le succès sous TypeScript 5.8.3 et Node.js 22.16.0 reste un résultat rapporté de l'environnement source.
- Cinq directives `@ts-expect-error` présentes dans l'exemple ; leur reconnaissance par un compilateur n'a pas été testée ici.
- Aucun PDF consulté dans Codex, aucune empreinte PDF recalculée, aucun test runtime exécuté. Les pages et l'empreinte sont cohérentes avec la cartographie fournie, sans vérification sur l'original.

- Contrôles documentaires Codex réussis : cinq identifiants uniques, correspondance `SRC-001` / `TS-2026`, chapitre 15, plages dans les bornes de la cartographie, liens locaux résolus et absence de fichiers autres que Markdown/TypeScript dans le dépôt. L’exemple TypeScript est identique au fichier fourni. Aucun long extrait d’ouvrage repéré lors de la lecture des huit fichiers.
