# VUE09-001 — Encadrer la reconnaissance d’objets et les limites d’un modèle prêt à l’emploi

## Identification

- **Identifiant unique :** `VUE09-001`
- **Domaine :** ai-and-frontend
- **Mots-clés :** Vue, TensorFlow.js, COCO-SSD, reconnaissance objets, confiance, limites, webcam
- **Statut :** synthèse technique originale fondée sur les pages PDF indiquées ; les affirmations d'exécution sont limitées aux tests réellement consignés.

## Source documentaire contrôlée

- **Catalogue / cartographie :** `SRC-004` / `VUE-2024`.
- **Ouvrage :** *Building Real-World Web Applications with Vue.js 3*, Joran Quinten.
- **Chapitre :** 9, *Experimental Object Recognition with TensorFlow*.
- **Pages physiques PDF inspectées (indexées à partir de 1) :** 244, 245, 246, 247, 248, 250, 254, 260, 266.
- **SHA-256 du PDF privé :** `3a804b775ff9c8eaa61b2207574b8ebcd19bbbc24588d09e4695d5c9f6c35752` (recalculé avant rédaction).
- **Portée :** lecture ciblée des pages ci-dessus, **pas** analyse exhaustive du chapitre. Les pages imprimées ne sont pas présumées identiques.

## Problème pratique

Une application affiche une étiquette produite par un modèle de reconnaissance comme si elle constituait une identification certaine.

## Faits explicitement documentés par l'ouvrage

Le chapitre utilise le modèle préentraîné COCO-SSD via TensorFlow.js et une interface Vue/Pinia. Il présente le chargement asynchrone du modèle, la détection sur image puis caméra, un seuil de confiance configurable et une limitation importante : seulement certaines classes d’objets sont connues du modèle.

## Interprétation / adaptation Louvre

Afficher les prédictions comme hypothèses, enregistrer `score` et `classe` avec un seuil explicite, et offrir une correction utilisateur. Pour les photos de personnes, minimiser les données et éviter toute inférence d’identité.

## Stratégie algorithmique ou architecturale

Obtenir le consentement caméra → charger le modèle avec état loading → recevoir l’image → détecter → filtrer par score et liste de classes → afficher une suggestion réversible.

## Exemple original (non recopié de l'ouvrage)

```ts
type Detection = { label: string; score: number };
export function acceptedLabels(items: readonly Detection[], minScore = 0.75): string[] {
  return items
    .filter(x => Number.isFinite(x.score) && x.score >= minScore && x.score <= 1)
    .map(x => x.label);
}
// Filtrage post-traitement original ; aucune inférence ML dans cette fonction.
```


## Limites, sécurité et compatibilité

Le score n’est pas une probabilité calibrée pour tous les cas. Le modèle ne détecte pas les classes absentes de son entraînement, ni les identités. Performances et confidentialité dépendent du navigateur, des images et du modèle. Pas d’utilisation en contexte médical ou de sécurité sans validation spécialisée.

## Validation / tests

Tester seuil et données invalides sur un exemple purement déterministe, puis performance réelle, classification par classe, faux positifs et accord utilisateur dans un navigateur. Aucun modèle TensorFlow n’a été chargé dans ce lot.

## Fiabilité

- **Documentaire :** forte pour les points identifiés dans les pages effectivement consultées, et pour leur attribution bibliographique ; aucune vérification exhaustive du chapitre.
- **Applicative :** non établie, hormis les tests déterministes explicitement référencés dans [le rapport du lot 3C4](../../validation/batch-3c4-source-and-typechecks.md).
- **Évolution des outils :** le livre décrit une version et un contexte spécifiques ; toute utilisation en production demande vérification contre la documentation des versions déployées.