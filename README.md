# Louvre

Louvre réunit deux choses :

1. **Une collection d'applications web gratuites**, publiées sur [googgpt.github.io/Louvre](https://googgpt.github.io/Louvre/) : sans compte, sans publicité, sans serveur, hors ligne après la première visite.
2. **Une bibliothèque technique** tirée de cinq ouvrages de développement, qui sert de référence aux agents de code (section plus bas).

## Les applications

La liste officielle est [`apps/catalogue.json`](apps/catalogue.json) : c'est la seule source de vérité. La page d'accueil en est générée.

Chaque appli vit dans `apps/<slug>/` et suit la même structure :

| Fichier | Rôle |
| --- | --- |
| `index.html` (+ copie `index.htm`) | Page de l'appli, avec sa politique de sécurité (CSP) |
| `core.js` | Logique pure (calculs, validation), testable sans navigateur |
| `app.js`, `style.css` | Interface |
| `sw.js` | Service worker **généré** (ne pas modifier à la main) |
| `manifest.webmanifest`, `icon.svg`, `sitemap.xml` | Installation et référencement |
| `tests/core.test.cjs`, `tests/browser.test.py` | Tests métier (Node) et test de bout en bout (Chromium) |

### Ajouter ou modifier une appli

```bash
python scripts/apply_csp.py      # écrit la politique de sécurité dans index.html / index.htm
python scripts/build_sw.py       # régénère sw.js : le nom du cache suit le contenu, donc les visiteurs reçoivent la mise à jour
python scripts/build_home.py     # régénère la page d'accueil depuis apps/catalogue.json
bash scripts/test_app.sh <slug>  # syntaxe, manifeste, tests métier, test navigateur
bash scripts/build_site.sh       # assemble le site comme en production (_site/)
```

Pour une nouvelle appli, ajouter aussi son entrée dans `apps/catalogue.json`. La CI refuse un service worker, une CSP ou une page d'accueil non régénérés.

### Langues (7) et devises

Le mécanisme commun est [`shared/louvre-i18n.js`](shared/louvre-i18n.js) : français, anglais, espagnol, arabe (de droite à gauche), portugais, allemand et italien. La langue vient du menu (choix mémorisé pour toutes les applis), sinon du navigateur. La devise se choisit à part : une langue ne dit pas dans quel pays on vit.

Pour rendre une appli multilingue :

1. Écrire ses textes dans `apps/<slug>/messages.js` (`window.LouvreMessages = { fr: {…}, en: {…}, … }`) et marquer le HTML avec `data-i18n="clé"`.
2. Dans `core.js`, lever des erreurs sous forme de clés (`err.price`), traduites par l'interface ; aucun montant ni date formatés en dur.
3. Lancer `python scripts/sync_shared.py`, qui copie le mécanisme dans l'appli pour le mode hors ligne.
4. `node scripts/check_messages.cjs <slug>` vérifie que les 7 langues ont toutes les clés, les mêmes paramètres et les mêmes pluriels.

Applis déjà multilingues : accueil, PriceLens, StudyRecall et BillCalendar.

### Automatisation

- **`louvre-apps-qa.yml`** : sur chaque PR, teste chaque appli modifiée et assemble le site complet.
- **`louvre-pages.yml`** : sur `main`, teste toutes les applis, publie, puis vérifie en ligne l'accueil, chaque appli et chaque fichier mis en cache.
- **`louvre-sw-cache-guard.yml`** : refuse une modification d'appli qui ne renouvelle pas son cache hors ligne.

### Règles de fiabilité communes

- Les montants sont calculés en centimes entiers, et les dates sont des jours civils (pas de piège d'heure d'été).
- Une sauvegarde importée est validée champ par champ avant toute écriture.
- Si le stockage local est illisible, l'appli passe en mode protégé : rien n'est écrasé, une copie brute est exportable, et ce mode est conservé si une restauration échoue.
- Toutes les applis partagent la même adresse : effacer les données du site les efface pour toutes. La page d'accueil le rappelle.

Historique de maintenance : [branches à nettoyer](docs/maintenance/branches.md).

---

# Bibliothèque technique

Louvre transforme cinq ouvrages de développement logiciel en références structurées : fiches de conception, compromis, exemples originaux, limites et provenance documentaire.

## État au 25 octobre 2026 — 75 fiches ; 70/70 chapitres avec une première fiche

- **75 fiches techniques** issues des cinq ouvrages ; **chacun des 70 chapitres possède au moins une analyse ciblée**. Les livres ne sont pas étudiés intégralement.
- **Nouvelle étape 3C6 :** 19 premières fiches pour les chapitres auparavant uniquement cartographiés ; [rapport de provenance](technical-library/validation/batch-3c6-70-chapter-audit.md).
- **Contrôles structurels automatiques :** `scripts/validate_library.py` (liens, identifiants, absence de PDF) et `scripts/verify_chapter_coverage.py` (présence d'au moins une fiche pour chacun des 70 chapitres). La réussite doit être observée sur GitHub Actions pour le dernier commit.
- **Exemples exécutables :** les scripts et tests TypeScript des lots 3C3 à 3C5 sont contrôlés en CI, sans prouver que des applications Next.js, Vue ou Docker complètes fonctionnent.
- **Provenance :** chaque nouvelle fiche documente le SHA-256 du PDF privé, les pages réellement ouvertes, les adaptations Louvre et les limites. Les PDF ne sont pas publiés.
- **Utilisation dans Codex :** lire `AGENTS.md`, puis `technical-library/INDEX.md`, et seulement les fiches pertinentes ; ne pas confondre présence d'une fiche et compétence validée par un test d'intégration.

## Utiliser Louvre dans Codex

1. Lire [AGENTS.md](AGENTS.md) pour les règles de qualité, confidentialité et provenance.
2. Chercher dans [technical-library/INDEX.md](technical-library/INDEX.md) le problème ou les mots-clés pertinents.
3. Lire les seules fiches utiles, vérifier les limites, les versions et la source avant d'appliquer les principes.
4. Consulter les [exemples](technical-library/examples/) et les [rapports de validation](technical-library/validation/) pour distinguer code testé, non exécuté et documenté.

Le Skill facultatif est disponible dans [.agents/skills/louvre-technical-reference/SKILL.md](.agents/skills/louvre-technical-reference/SKILL.md) si le client peut le découvrir ; son absence du catalogue ne rend pas l'index inutilisable.

## Bibliographie et extraction

- [Catalogue des cinq livres](technical-library/SOURCES.md)
- [Cartographie des chapitres](technical-library/source-maps/README.md)
- [Modèle de fiche](technical-library/KNOWLEDGE-TEMPLATE.md)
- [Pilote initial](README-PILOT.md)
- [Rapport du lot multi-ouvrages](technical-library/validation/batch-3c1-source-and-static-checks.md)

## Règles

Aucun contenu substantiel d'ouvrage sous droit d'auteur n'est reproduit. Toute proposition issue d'une fiche doit distinguer les principes attribués à l'auteur de l'adaptation Louvre et de la documentation officielle plus récente. **Ne pas inventer** pages, tests, versions ou conclusions. Aucun changement de stack ne doit être imposé à un projet existant.

- [Rapport du lot 3C2](technical-library/validation/batch-3c2-verified-source-notes.md)

- [Rapport du lot 3C3](technical-library/validation/batch-3c3-source-audit.md)
- [Exemples typés et exécutés du lot 3C3](technical-library/examples/validated-contracts-3c3.ts)

- [Audit du lot 3C4](technical-library/validation/batch-3c4-source-and-typechecks.md)
- [Fonctions TypeScript testables 3C4](technical-library/examples/validated-contracts-3c4.ts) et [leurs cas de test](technical-library/examples/validated-contracts-3c4.test.ts)

- [Rapport lot 3C5](technical-library/validation/batch-3c5-source-audit.md)

- [Rapport de couverture initiale 70/70](technical-library/validation/batch-3c6-70-chapter-audit.md)
