# TS09-001 — Comprendre le coût runtime des enums

## Identification

- **Identifiant unique :** `TS09-001`
- **Domaine :** language-and-types
- **Type :** fiche de première analyse ciblée ; non exhaustive.

## Provenance contrôlée

- **Catalogue / cartographie :** `SRC-001` / `TS-2026`.
- **Ouvrage :** *Total TypeScript: The Essentials*, Matt Pocock et Taylor Bell (2026).
- **Chapitre :** 9, *TypeScript-Only Features*.
- **Pages physiques PDF réellement consultées :** 211, 212, 213, 214 (numérotation débutant à 1).
- **Empreinte SHA-256 du fichier source privé :** `d7e4dd6c554acceface995b8fdbdfd4e1efef82d6734ecf77371cbce78805975`.
- **Méthode :** extraction de texte de ces pages du PDF privé, confrontation à la cartographie des chapitres ; ni reproduction d'extraits étendus ni publication du PDF.

## Problème traité

Comprendre le coût runtime des enums : formaliser une pratique documentée dans les pages consultées et en connaître les limites.

## Ce que le livre présente

Le chapitre aborde les raccourcis de paramètres de constructeur et les enums numériques ou chaînes. Il explique que les enums TypeScript n'ont pas d'équivalent syntaxique direct en JavaScript et impliquent une transformation lors de la compilation.

## Application originale proposée par Louvre

Pour des statuts métier échangés avec une API, comparer une union littérale, une constante typée et un enum avant de fixer le contrat réseau.

Ce scénario est **une adaptation Louvre**, et non une fonctionnalité construite ou une affirmation textuelle attribuée à l'auteur.

## Limites et conditions

Le livre étudie des possibilités TypeScript ; le choix entre enums et unions est une décision de conception Louvre, pas une prescription unique de l'auteur.

Le reste du chapitre n'est **pas présumé lu**. Des différences de versions logicielles peuvent rendre obsolète une commande ou une API : vérifier la documentation officielle et la version retenue avant toute application.

## Vérification applicative à effectuer

Compiler deux variantes simples et inspecter le JavaScript émis, puis vérifier le JSON envoyé par l'API.

**Statut de validation :** consultation PDF et contrôle de provenance exécutés ; tests d'intégration, sécurité et performance de l'adaptation **non exécutés**.