# TS08-001 — Initialisation des classes et contrat instance

## Identification

- **Identifiant unique :** `TS08-001`
- **Domaine :** language-and-types
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell (2026).
- **Chapitre :** 8, *Classes*.
- **Pages physiques PDF réellement consultées :** 189, 190, 191, 192 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Initialisation des classes et contrat instance : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre présente une classe, ses propriétés typées, les diagnostics d'initialisation certaine, puis le constructeur qui renseigne ces propriétés. Il distingue l'usage d'une instance de classe de la déclaration de la classe elle-même.

## Application originale proposée par Louvre

Lors d'une implémentation orientée objet, forcer une initialisation complète dans le constructeur et éviter les objets partiellement initialisés exposés au reste de l'application.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

L'utilisation d'une classe ne garantit pas une validation des entrées externes et n'impose pas à elle seule une architecture orientée objet à un projet fonctionnel.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Créer un exemple compilé avec `strictPropertyInitialization`, puis comparer une initialisation complète à une propriété oubliée.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.