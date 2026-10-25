# NEXT10-001 — Tester composants et routes API avec des scénarios réalistes

## Identification

- **Identifiant unique :** `NEXT10-001`
- **Domaine :** testing
- **Mots-clés :** Jest, React Testing Library, API tests, mocks, unit, integration
- **Statut :** fiche analytique fondée sur une lecture ciblée du PDF privé ; exemple original non exécuté dans un projet complet.

## Source vérifiée

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Livre :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain.
- **Chapitre :** 10, *Unit Testing and Integration Testing*.
- **Pages physiques PDF retenues :** 248–263 (numérotation commençant à 1, distincte des pages imprimées).
- **Pages effectivement inspectées dans ce chapitre :** 248, 250, 252, 255, 259, 262, 263.
- **Empreinte SHA-256 du PDF source :** `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Provenance :** lecture des pages du PDF original dans l'environnement ChatGPT ; ces pages et les tests ne sont pas supposés accessibles à Codex après publication.

## Problème à résoudre

Vérifier une interface web et son API sans confondre test isolé et test de bout en bout.

## Ce qui vient du livre

Le chapitre présente Jest et React Testing Library, les tests de composants, les fonctions de chargement des pages, les routes API, les mocks et les tests d’intégration via requêtes HTTP. Il décrit aussi le débogage des tests et les snapshots.

## Interprétation et application Louvre (originale)

Pour une application de réservation, isoler la logique du calcul des places, tester l’interface via ses interactions et vérifier les erreurs HTTP sur un serveur de test. Couvrir la concurrence et la persistance séparément.

## Principe d'architecture et de raisonnement

Trois couches : tests purs rapides, composants avec interactions, tests d’intégration exécutant les frontières réelles. Les mocks doivent reproduire des contrats documentés mais ne peuvent pas prouver la robustesse du serveur.

## Exemple original, non copié du livre

```ts
// Test de domaine, indépendant de Next.js
function remaining(available: number, requested: number): number {
  if (!Number.isInteger(requested) || requested <= 0 || requested > available) {
    throw new Error("Demande invalide");
  }
  return available - requested;
}

// Attendus d’un outil de test : remaining(5,2) === 3 ;
// remaining(5,6) doit échouer ; remaining(5,0) doit échouer.
```

## Limites et compatibilité

Les configurations Jest dépendent de l’outillage et du routeur Next.js en usage. Les snapshots ne remplacent pas les assertions métier ; les tests HTTP ne prouvent pas la sécurité ni la concurrence en production.

## Validation à réaliser dans un projet réel

Exécuter Jest/Vitest selon le projet, tester les flux succès/échec, puis une requête HTTP réelle dans un environnement de test isolé.

## Fiabilité et périmètre

- **Confiance documentaire :** élevée sur les notions décrites dans les pages indiquées ; cela ne signifie pas que toutes les consignes techniques de l'ouvrage restent compatibles avec les versions actuelles.
- **Confiance applicative :** non établie : exemple et intégration non déployés, sauf résultat de test distinct et explicite.
- **Couverture :** seulement les pages indiquées ; cette fiche n'est pas une analyse exhaustive du chapitre.