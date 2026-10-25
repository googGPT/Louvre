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

## Adaptations apportées en Web 1.1 — aucune infrastructure payante

- **TS16-001, Total TypeScript** (SRC-001, PDF p.396–400) : les données issues de l'utilisateur restent validées à l'exécution par `cleanRecord`; les événements `.ics` n'infèrent jamais de dates manquantes. La lecture de la fiche est documentée, pas une conversion du site en TypeScript.
- **FULL08-001, The Complete Developer** (SRC-002, PDF p.160–174) : tests déterministes ajoutés sur les échéances, l'heure d'été, les statistiques en centimes et l'échappement ICS ; le CI exécute aussi le scénario navigateur réel.
- **NEXT08-001, Ultimate Next.js** (SRC-003, PDF p.212–226) : les statistiques sont dérivées à l'affichage à partir des enregistrements persistés, sans dupliquer des soldes; aucune couche serveur Next.js inutile n'a été installée.
- **VUE07-001, Vue.js 3** (SRC-004, PDF p.186–202) : séparation claire entre `core.js` (domaine), `app.js` (interface + IndexedDB) et `sw.js` (shell hors ligne); les fichiers sont exploitables plus tard dans un wrapper mobile, sans prétendre utiliser Quasar ou Electron.
- **GHA09-001, Learning GitHub Actions** (SRC-005, PDF p.210–220) : jobs de test en lecture seule ; la publication est conditionnée aux tests et vérifie HTTP les deux applications, ainsi que les fichiers PWA. Chaque permission élargie est réservée au job de publication.

Fonctionnalités ajoutées : **échéances triées**, **export ICS**, **répartition mensuelle par catégorie**, **installation progressive hors ligne via manifest/service worker**, **état d'erreur IndexedDB réessayable**, **contrôle de taille de l'export JSON**. Les garanties de retours sont des dates *saisies*, jamais des droits légaux présumés. Les rappels calendaires sont importés volontairement : aucun service push ou envoi en arrière-plan.

Limites : le PWA est disponible hors ligne **après une première ouverture réussie en ligne** ; aucune synchronisation inter-appareils, aucune garantie d'effacement impossible du stockage navigateur, pas de push même avec l'application fermée. Un logo SVG améliore la prise en charge mais certaines plateformes requièrent des icônes PNG spécifiques pour l'installation native.