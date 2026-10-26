# ColorContrast v2 — application Louvre n° 23 (vague 2 n° 03/20)

Atelier de contrastes de couleurs **HEX opaques** pour du texte, suivant le calcul de luminance sRGB et les seuils de contraste WCAG 2.2. Application Web **statique et locale**, sans abonnement, API payante ni serveur.

## Fonctionnalités

- Choix des couleurs de texte et de fond avec champs HEX (#RGB ou #RRGGBB) et sélecteurs natifs.
- Ratio de contraste **calculé sans arrondir pour toutes les comparaisons** ; affichage sur quatre décimales pour informer l'utilisateur.
- Résultats **WCAG 2.2 texte** : AA texte normal ≥ 4,5:1 ; AAA texte normal ≥ 7:1 ; AA grand texte ≥ 3:1 ; AAA grand texte ≥ 4,5:1.
- Aperçu direct et inversion texte/fond, recommandation du meilleur texte noir ou blanc.
- **Correction guidée de la couleur du texte** : choix de cible 3, 4,5 ou 7, interpolation des canaux RVB de la couleur de départ vers le noir ou le blanc. La variante validée la plus proche en distance quadratique RVB parmi ces **deux trajectoires** est retenue. Si le contraste est impossible sur le fond fixe, l'interface le signale et n'active pas la suggestion.
- Export des déclarations CSS `color` et `background-color` en texte brut ; copie facultative dans le presse-papiers.
- Jusqu'à 100 combinaisons sauvegardées, pourcentage non affiché mais **compteur de conformité AA standard**, favoris réapplicables, suppression confirmée, refus de doublons à l'ajout.
- Sauvegardes JSON v1, import validé, export du stockage brut en cas de corruption, fonctionnement hors ligne après première visite valide.

## Mathématiques et seuils

Canal sRGB normalisé `c/255` linéarisé :
`c_lin = c_srgb/12.92` si `c_srgb ≤ 0.04045`, sinon `((c_srgb + 0.055)/1.055)^2.4`.

Luminance relative `L = 0.2126 × R_lin + 0.7152 × G_lin + 0.0722 × B_lin`.

Ratio `(L_max + 0.05)/(L_min + 0.05)`, théoriquement entre 1:1 et 21:1.

**Important :** un ratio **4,499:1 ne passe pas AA texte normal**, même s'il s'affiche 4,50 par un arrondi au centième. Les badges utilisent le ratio **non arrondi**. La recommandation ne constitue pas une optimisation perceptuelle globale (distance RVB euclidienne limitée à deux directions), ni une garantie d'accessibilité complète.

Références officielles :
- W3C WCAG 2.2, contraste minimum : https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- W3C WCAG 2.2, critères normatifs 1.4.3 et 1.4.6 : https://www.w3.org/TR/WCAG22/

## Compatibilité et récupération

Le format historique est maintenu **sans migration destructive** : clé `louvre-wave2-colorcontrast-v1`, objet `{"version":1,"pairs":[{"fg":"#AABBCC","bg":"#FFFFFF"}]}`.

La validation conserve les anciens favoris, y compris d'éventuelles répétitions importées ; seules les **nouvelles créations** de doublons sont évitées. La palette en mémoire n'est mise à jour qu'après `localStorage.setItem` réussi ; un échec d'écriture n'annonce donc pas de sauvegarde. En présence de données corrompues, les modifications sont bloquées, la copie brute reste téléchargeable et seul un JSON valide **écrit avec succès** permet de reprendre.

Les fichiers JSON restent sur l'appareil et ne sont pas chiffrés dans le profil local. Aucun stockage serveur, synchronisation, multi-utilisateurs, compte ou API payante.

## Tests

```bash
node --check apps/colorcontrast/core.js
node --check apps/colorcontrast/app.js
node --check apps/colorcontrast/sw.js
node --test apps/colorcontrast/tests/core.test.cjs
python apps/colorcontrast/tests/browser.test.py
```

Le navigateur exige Playwright et Chromium et est exécuté par le workflow GitHub Actions `.github/workflows/louvre-wave2-colorcontrast-qa.yml`.

## Limites de couverture

L'outil teste uniquement le contraste du **texte en couleurs HEX opaques** : ni transparence/alpha, ni images, dégradés, ombres, sous-pixels, antialiasing réel, contrastes non textuels, états de focus, tailles de caractères certifiées, ni audits WCAG exhaustifs. Les WCAG 2.2 ne peuvent être réduites à une mesure de contraste. Les utilisateurs doivent tester leur interface réelle et les autres critères d'accessibilité.

**Numérotation** : ColorContrast est `03/20` dans le registre `LOUVRE-WAVE2-TRACKER.md`, soit l'application globale n° 23 ; le titre original de la PR #40 indiquait à tort `02/20`, déjà attribué à ShiftLedger (PR #44).
