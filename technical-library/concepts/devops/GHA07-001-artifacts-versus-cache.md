# GHA07-001 — Distinguer artefacts de build et caches de dépendances

## Identification

- **Identifiant unique :** `GHA07-001`
- **Domaine :** devops
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster, O’Reilly Media (2023).
- **Chapitre :** 7, *Managing Data Within Workflows*.
- **Pages physiques PDF vérifiées :** 144–158 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Un pipeline doit réutiliser un résultat de compilation entre jobs et accélérer le téléchargement de dépendances sans confondre leurs cycles de vie.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre décrit les artefacts produits par un job puis récupérés dans un autre avec une dépendance `needs`, ainsi que le cache destiné à optimiser les téléchargements et opérations répétitives. Il met en garde contre la présence de secrets dans les caches.

### Interprétation et application Louvre

Stocker une archive de résultat destinée à être inspectée ou testée comme artefact ; réserver le cache aux dépendances reconstructibles. Garder les cache keys sensibles aux versions et lockfiles.

## Principe algorithmique ou architectural

Artefact : sortie explicite d’un run, téléchargeable et partageable par jobs ; cache : données réutilisables pour accélérer plusieurs jobs ou exécutions, avec politique de clé.

## Conditions, limites et compromis

Les actions `upload-artifact`/`download-artifact` citées dans le livre utilisent des versions anciennes ; la version et la politique de rétention actuelles doivent être contrôlées avant copie. Ne mettre ni tokens ni données privées dans le cache.

## Exemple original d’application

Pipeline fictif de documentation : job A produit `site/` ; job B récupère l’artefact pour un contrôle de liens ; le cache sert séparément aux paquets téléchargés.

## Méthode de test et validation

Sur un dépôt de test, vérifier les versions d’actions, les droits du token, l’isolation des caches et le transfert d’un artefact entre deux jobs.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

GitHub Actions édition 2023 ; aucune action lancée ni version actuelle des actions officiellement vérifiée.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.