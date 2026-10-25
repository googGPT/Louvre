# GHA09-001 — Limiter GITHUB_TOKEN et isoler les entrées non fiables

## Identification

- **Identifiant unique :** `GHA09-001`
- **Domaine :** security
- **Statut :** fiche documentée sur PDF privé et synthèse originale ; adaptation non validée en production.

## Source et référence exacte

- **Catalogue / cartographie :** `SRC-005` / `GHA-2023`.
- **Ouvrage :** *Learning GitHub Actions*, Brent Laster, O’Reilly Media (2023).
- **Chapitre :** 9, *Actions and Security*.
- **Pages physiques PDF vérifiées :** 210–211 ; 213–220 (comptées à partir de 1, distinctes des pages imprimées).
- **Accès effectif :** PDF privé ouvert et inspecté dans la conversation ChatGPT du 25 octobre 2026 ; empreinte SHA-256 `d30634bba4d1a33b1fa443468f0542c96150fcbd9bd34ecb21c13512deb3eab0`.
- **Pages imprimées :** non relevées ; aucune équivalence supposée.
- **Repères :** sections et exemples du chapitre cités ci-dessous ; reformulation originale, aucun extrait substantiel.

## Problème technique traité

Un workflow peut disposer d’autorisations excessives ou interpréter des métadonnées contrôlées par un contributeur comme du script exécutable.

## Explication détaillée du concept

### Faits issus de l’ouvrage

Le chapitre expose l’ajustement des permissions de `GITHUB_TOKEN` au niveau workflow ou job et recommande des droits minimaux. Il considère des champs tels que titre de PR, commentaires et messages de commit comme entrées potentiellement non fiables ; il recommande de ne pas interpoler directement ces valeurs dans les scripts de shell et d’utiliser notamment des variables d’environnement comme intermédiaire.

### Interprétation et application Louvre

Exiger `permissions: contents: read` pour un job qui lit uniquement le code ; accorder des droits supplémentaires uniquement aux jobs qui en ont besoin. Ne pas exécuter de code utilisateur provenant de PR non fiables avec un token privilégié. Toute configuration doit être relue selon les recommandations de sécurité actuelles.

## Principe algorithmique ou architectural

Principe de moindre privilège et séparation entre données externes et instructions shell. Un champ utilisateur passe en donnée via une variable au lieu d’être injecté dans le texte d’un script.

## Conditions, limites et compromis

Un passage par variable d’environnement ne rend pas toutes les utilisations sûres (citations shell, arguments, sorties et contexte à vérifier). Certaines recommandations d’édition 2023 sur les événements et actions peuvent être dépassées.

## Exemple original d’application

Extrait YAML original de principe (non exécuté) :

```yaml
permissions:
  contents: read
```

Ne jamais substituer directement un titre de PR non fiable dans un `run:` exécuté avec des privilèges étendus.

## Méthode de test et validation

Analyser les permissions effectives et entrées de tous les jobs ; vérifier la version actuelle des recommandations GitHub ; éprouver uniquement dans un dépôt de test isolé.

- **PDF vérifié :** oui, sur les plages indiquées et l’empreinte ci-dessus.
- **Exemple exécuté :** non ; scénario ou principe à tester dans le projet cible.
- **Test applicatif / CI réel :** non exécuté.

## Compatibilité technique

Référence 2023 ; aucun workflow GitHub exécuté ni documentation 2026 vérifiée à cette étape.

## Confiance et points ouverts

- **Confiance documentaire :** élevée pour les principes effectivement lus et leurs repères ; **confiance opérationnelle :** limitée sans tests d’intégration.
- **À confirmer :** version de la stack et documentation officielle actuelles avant usage en production ; tests de l’exemple lorsque nécessaires.
- **Dernière révision :** 2026-10-25, premier lot multi-ouvrages.