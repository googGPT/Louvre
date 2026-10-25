# NEXT03-001 — Choisir SSR, SSG, ISR ou CSR selon les contraintes

## Identification

- **Identifiant unique :** `NEXT03-001`
- **Domaine :** frontend
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-003` / `NEXT-2026`.
- **Ouvrage :** *Ultimate Next.js for Modern Web Applications*, Shubham Jain, Orange Education (2026).
- **Chapitre :** 3, *Rendering Strategies in Next.js*.
- **Pages physiques PDF vérifiées :** 72–77 ; 83–95 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `1f46aaf17add1436f5d48742a97a1365a38bc1e1dfbc1a47fb470215d762eabf`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Une page change à des fréquences différentes selon son contenu ; la stratégie de rendu affecte fraîcheur, vitesse, coût serveur et référencement.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre distingue le rendu serveur à la requête (SSR), la génération statique (SSG), la régénération incrémentale (ISR) et le rendu côté client (CSR). Il liste les facteurs de décision : fraîcheur, fréquence des changements, SEO, latence et personnalisation. Les exemples d’implémentation utilisent notamment les API `getServerSideProps` et `getStaticProps` du Pages Router.

### Interprétation et application Louvre

Établir une matrice page-par-page avant d’écrire du code : contenu éditorial peu changeant, données publiques semi-dynamiques, données personnelles sensibles et interfaces interactives. Adapter l’implémentation au routeur réellement utilisé.

## Principe algorithmique ou architectural

SSR à la requête ; SSG lors de génération ; ISR avec régénération selon politique ; CSR après chargement du JavaScript, éventuellement associé à un HTML initial.

## Conditions, limites et compromis

Ne pas transposer directement les exemples du Pages Router à l’App Router. Revalidation, caching et comportement du serveur dépendent de la version et du mode de déploiement ; aucune compatibilité Next.js actuelle n’est certifiée.

## Exemple original d’application

Site fictif de conférences : page « À propos » candidate au statique ; programme mis à jour par intervalles candidats à revalidation ; espace personnel exigeant autorisation serveur et politique de cache adaptée.

## Méthode de test et validation

Sur un projet réel, mesurer fraîcheur effective, charge, rendu HTML initial, données privées dans le cache et comportement après déploiement.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

Aucune application Next.js construite ; les API de l’édition 2026 sont décrites dans le cadre Pages Router, compatibilité à recontrôler.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.