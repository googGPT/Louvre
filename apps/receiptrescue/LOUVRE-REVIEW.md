# ReceiptRescue 1.0 — notes de conception à partir de Louvre

Ces décisions sont **des adaptations originales**, pas des extraits des cinq livres. Les fiches ont été consultées dans `googGPT/Louvre` ; cela ne signifie pas que le code a été écrit avec tous les frameworks étudiés ou que les livres garantissent l'absence de bugs.

| Source | Fiche effectivement consultée | Principe appliqué et limite |
|---|---|---|
| Total TypeScript (SRC-001) | `technical-library/concepts/language-and-types/TS16-001-runtime-type-guards.md` (chapitre 16, PDF p. 396–400) | Contrôler **à l'exécution** dates, prix, catégories, tailles de photos et schémas importés. Pas de TypeScript nécessaire au navigateur pour cet MVP. |
| The Complete Developer (SRC-002) | `technical-library/concepts/testing/FULL08-001-tdd-and-test-doubles.md` (chapitre 8, PDF p. 160–174) | Séparer calculs purs et stockage pour des tests unitaires reproductibles, compléter par parcours navigateur. |
| Ultimate Next.js (SRC-003) | `technical-library/concepts/frontend/NEXT08-001-client-vs-server-state.md` (chapitre 8, PDF p. 212–226) | Ne pas confondre état d'interface et persistance : l'UI est reconstruite depuis IndexedDB. **Pas de Next.js** : ce projet n'a pas besoin de rendu serveur. |
| Building Real-World Web Applications with Vue.js 3 (SRC-004) | `technical-library/concepts/frontend/VUE07-001-multiplatform-quasar-supabase.md` (chapitre 7, PDF p. 186–202) | Séparer `core.js` de la couche de persistance et du rendu afin de faciliter un port mobile futur. **Pas de Quasar/Supabase** : cela exigerait une autre infrastructure. |
| Learning GitHub Actions (SRC-005) | `technical-library/concepts/security/GHA09-001-permissions-and-untrusted-input.md` (chapitre 9, PDF p. 210–220) | Vérifier les fichiers et utiliser le moins de permissions possible dans le CI. GitHub Pages doit garder MoneyUntil accessible. |

## Sécurité et coûts

- Aucun appel externe dans la Web App, aucune API payante, aucune connexion bancaire.
- Les noms des achats sont affichés par `textContent` (pas `innerHTML`) et les restaurations rejettent les formats inattendus.
- Les photos sont enregistrées comme `Blob` dans IndexedDB ; sauvegardes exportées comme Data URLs à conserver en privé.
- La sauvegarde importée est entièrement validée avant qu'une transaction ne remplace les données : une erreur de validation ne doit pas effacer le coffre.
- Les alertes à 7/30 jours sont un **choix de produit** et ne reflètent aucune durée légale garantie.
- Les tests unitaires ne certifient pas la durée de rétention du stockage local, qui dépend du navigateur.

## Validation requise

Exécuter les tests Node, le parcours automatisé Chrome de GitHub Actions, vérifier la publication publique de ReceiptRescue et la non-régression de MoneyUntil. Ne pas déclarer une version mobile native tant qu'elle n'est pas réellement produite.