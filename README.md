# Louvre — Bibliothèque technique exploitable par Codex

Cinq livres de programmation transformés progressivement en fiches techniques originales, consultables via un index, avec référence à l'ouvrage, conditions d'utilisation, limites et exemples.

## État du dépôt

- **25 fiches** couvrant partiellement **21 chapitres**, parmi **70 chapitres indexés** : couverture non exhaustive.
- Les cinq ouvrages sont représentés ; les PDF restent privés et absents de ce dépôt public.
- Codex peut consulter directement les fiches même si le Skill n'est pas découvert dans son catalogue.

## Utilisation par Codex

1. Appliquer les règles de provenance et sécurité de [AGENTS.md](AGENTS.md).
2. Consulter [l'index technique](technical-library/INDEX.md) pour identifier les fiches pertinentes sans tout charger.
3. Lire uniquement les fiches utiles ; comparer les versions et les limites avant de proposer une mise en œuvre.
4. Les exemples historiques et rapports de validation sont conservés dans [technical-library/validation](technical-library/validation/TS15-static-typecheck.md).

## Contrôles automatiques

Le script [scripts/validate_library.py](scripts/validate_library.py) vérifie les identifiants, les références de catalogue, les liens Markdown internes et la présence de toutes les fiches dans l'index. Il signale aussi les PDF/EPUB dans le dépôt. Il ne vérifie **pas** les affirmations scientifiques ni la conformité des applications à leurs frameworks.

Le workflow [knowledge-integrity.yml](.github/workflows/knowledge-integrity.yml) prépare l'exécution de ce contrôle lors des Pull Requests et des pushes sur `main`. Un workflow présent sur disque n'est pas une exécution validée : consulter les résultats GitHub Actions avant de le considérer opérationnel.

## Documents

- [Catalogue des cinq ouvrages](technical-library/SOURCES.md)
- [Cartographies des chapitres](technical-library/source-maps/README.md)
- [Modèle de fiche](technical-library/KNOWLEDGE-TEMPLATE.md)
- [Pilote initial](README-PILOT.md)
- [Rapport du lot 3C2](technical-library/validation/batch-3c2-verified-source-notes.md)
- [Skill Codex](.agents/skills/louvre-technical-reference/SKILL.md)
