# TextDiff — Louvre application n° 27, vague 2 (07/20)

## Audit de départ

Le registre `LOUVRE-WAVE2-TRACKER.md` identifiait **TextDiff** comme une piste de comparaison textuelle fondée sur la **LCS** (longest common subsequence) et l'alignement des modifications, sans développement. Aucun dossier `apps/textdiff`, branche dédiée ou PR correspondante n'existait. Il s'agit donc d'une **création initiale**, pas d'un correctif d'une version précédente.

## Usage

TextDiff compare deux versions de texte localement, sans compte, service distant ni API payante.

- **Comparaison par lignes** : vue parallèle, numérotation avant/après, coloration distincte des ajouts et suppressions.
- **Comparaison par mots et espaces** : deux volets affichent les textes et surlignent les jetons modifiés. Les espaces constituent volontairement des unités du mode « mots ».
- **Options** : insensibilité à la casse et tolérance des espaces superflus. Les options affectent le **critère d'égalité**, mais ne modifient jamais les textes affichés.
- **Statistiques** : nombre d'unités avant/après, unités conservées/supprimées/ajoutées, blocs de changements et similarité calculée par LCS (2 × identiques / (unités avant + après)). Pour deux documents vides, similarité conventionnelle 100 %.
- **Actions** : échange des versions, exemple, effacement, import de fichiers texte ou Markdown (240 Ko maximum), copie du rapport lorsque l'API presse-papiers est disponible, téléchargement TXT.
- **Invalidation** : toute édition ou modification d'option vide le résultat et désactive les anciens exports. Une lecture de fichier asynchrone obsolète ne peut pas écraser une édition ultérieure.
- **Hors ligne** : service worker PWA uniquement pour les ressources statiques, après une première visite réussie.

## Algorithme, bornes et garanties

LCS par programmation dynamique (`Uint16Array`) utilisant au plus **701 × 701 cellules**. Temps **O(n×m)**, mémoire **O(n×m)** : chaque version est limitée à **60 000 caractères UTF-16** et **700 unités** (lignes ou jetons mots/espaces). Aucune approximation silencieuse ne remplace le calcul lorsque les limites sont dépassées : l'utilisateur doit sélectionner un extrait plus court.

Pour la comparaison, CRLF, CR, séparateurs Unicode U+2028/U+2029 sont normalisés en sauts de ligne ; le contenu source reste présent dans les champs d'entrée et dans la mémoire de la page. En mode lignes, les unités découpées comprennent une dernière ligne vide lorsque le texte se termine par un saut de ligne ; la version totalement vide correspond à zéro unité. Pour les options d'insensibilité à la casse et d'espaces, la représentation comparative est dérivée des unités originales sans les écraser. Les résultats « égaux » selon ces options conservent les **deux** écritures réelles dans l'interface et les variantes dans le rapport TXT.

La métrique de similarité est **structurelle**, non sémantique. Des séquences répétées peuvent conduire à plusieurs alignements LCS valides : le choix de tie-break favorise la suppression puis l'insertion, pour rendre les résultats déterministes. Le rapport TXT utilise des préfixes de lecture `+ - ~` et une représentation JSON des segments : **ce n'est pas un patch Git ni un unified diff à appliquer automatiquement**.

## Confidentialité et sécurité

Tout s'exécute dans le navigateur : pas de réseau destiné aux données, pas de `localStorage`, pas de suivi, pas de serveur de traitement. Les entrées utilisateur sont insérées dans le DOM par `textContent` (sans `innerHTML`), limitant le risque de script injecté lors de l'affichage. Les exports sont préparés sur place via Blob et les URLs de téléchargement sont libérées. Le service worker cache uniquement les ressources de l'application.

**Limites :** le contenu peut rester en mémoire du navigateur ou dans le presse-papiers du système lorsque la copie est demandée ; il n'y a pas d'effacement sécurisé de la mémoire/du presse-papiers. La confidentialité physique dépend de l'appareil. L'import `file.text()` convient au texte UTF-8 et non aux formats binaires, DOCX, PDF ou encodages textuels anciens. Les résultats ne sont pas enregistrés après rechargement.

## Vérifier

```bash
node --check apps/textdiff/core.js
node --check apps/textdiff/app.js
node --check apps/textdiff/sw.js
node --test apps/textdiff/tests/core.test.cjs
python apps/textdiff/tests/browser.test.py
```

La suite Node teste normalisation de fins de ligne, opérations/indices LCS, similarité, égalité avec options, limites et injection HTML textuelle. Le parcours Chromium teste affichage réellement rendu, rapport téléchargé, invalidation des résultats, import local, protection XSS, mobile 390 pixels, mode hors ligne et absence de sauvegarde. **Le résultat de la CI du commit final, et non la présence des scripts, atteste la réussite de ces tests.**

## Hébergement et provenance Louvre

Le workflow existant `.github/workflows/deploy-moneyuntil-pages.yml` inclut déjà le slug `textdiff` parmi les applications de la deuxième vague publiées de façon additive, après fusion sur `main` et validation des contrôles. Aucune autre application ni `main` n'est modifiée directement dans la PR de création.

Les références et leurs limites documentaires sont consignées dans `LOUVRE-REVIEW.md`. L'algorithme et les interfaces sont des **adaptations originales**, non extraites des livres. Aucune relecture intégrale d'ouvrage n'est revendiquée.
