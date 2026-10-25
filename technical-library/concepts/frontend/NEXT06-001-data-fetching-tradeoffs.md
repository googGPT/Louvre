# NEXT06-001 — Séparer récupération des données, état client et revalidation

## Identification

- **Identifiant unique :** `NEXT06-001`
- **Domaine :** frontend
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain, Orange Education (2026).
- **Chapitre :** 6, *Next.js Data Fetching*.
- **Pages physiques PDF vérifiées :** 160–173 ; 175–185 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Des composants récupèrent les mêmes données sans coordination, ce qui complexifie les chargements, les erreurs et le rafraîchissement.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre présente l’usage de `fetch`, d’Axios et de SWR, compare leurs fonctionnalités et discute la récupération côté serveur et côté client, les états de chargement/erreur ainsi que les stratégies de revalidation. Les exemples dépendent du contexte Next.js exposé dans l’ouvrage.

### Interprétation et application Louvre

Choisir l’outil selon le besoin : transport simple ; configuration HTTP partagée ; gestion d’un cache et de revalidation côté client. Ne pas ajouter Axios ou SWR automatiquement si les mécanismes du framework suffisent.

## Principe algorithmique ou architectural

Une couche d’accès aux données explicite et des vues qui distinguent données reçues, erreur et état de chargement ; politique de revalidation définie selon la fraîcheur souhaitée.

## Conditions, limites et compromis

Les comportements de cache/fetch côté serveur et les conventions Next.js ont évolué selon les versions. Les exemples du livre ne sont pas une garantie de compatibilité de la version déployée ; les appels client ne doivent pas divulguer de secrets.

## Exemple original d’application

Tableau fictif de suivi d’inscriptions : précharger une synthèse non sensible côté serveur, rafraîchir une liste interactive côté client selon le besoin et gérer explicitement les erreurs HTTP.

## Méthode de test et validation

Éprouver requêtes répétées, invalidation, erreurs 4xx/5xx, absence de réseau, fuite de clés API et conformité avec le routeur et la version installés.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

Aucune version de Next.js/Axios/SWR testée ; les concepts décrivent uniquement la source PDF.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.