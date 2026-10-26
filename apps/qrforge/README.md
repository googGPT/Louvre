# QRForge — application Louvre n° 25 (vague 2, 05/20)

**État avant intervention :** `LOUVRE-WAVE2-TRACKER.md` mentionnait uniquement « 05 | QRForge | QR codes locaux | encodage QR et masque », avec le statut « piste évaluée ; non développée ». Le dossier `apps/qrforge` n'existait pas : cette PR **crée** la première version fonctionnelle au lieu de prétendre corriger une version antérieure.

## Fonctions

- Génération **locale et immédiate** de codes QR Model 2 pour texte libre, adresses web HTTP(S), `mailto:`, `tel:` et réseau Wi-Fi.
- Correction d'erreurs configurable **L/M/Q/H**, versions QR 1 à 40 et sélection automatique du masque par une bibliothèque QR dédiée.
- Couleurs validées et vérification volontaire de **contraste ≥ 4,5:1** avec modules plus sombres que le fond, marge silencieuse configurable 4–10 modules.
- Export **SVG vectoriel** et **PNG bitmap** depuis une matrice commune, sans incorporer le texte utilisateur dans le SVG.
- Mise en page mobile, PWA hors ligne après premier chargement et aucun compte, clé, abonnement ou appel API.
- Les contenus Wi-Fi sont échappés pour `\\`, `;`, `,`, `:` et `"`. Mode ouvert `nopass` sans mot de passe ; mode personnel `WPA` avec phrase de passe entre 8 et 63 caractères (pas de Wi-Fi Enterprise/EAP).
- Contrôle des schémas d'URL, limites de taille (1 800 octets UTF-8 par payload, limite additionnelle réelle selon niveau ECC), confirmation visuelle d'une erreur et désactivation des téléchargements lorsqu'aucun code valide n'est présent.

## Dépendance QR et conformité de licence

L'encodeur est une copie locale de **[Kazuhiko Arase, QR Code Generator for JavaScript](https://github.com/kazuhikoarase/qrcode-generator)**, distribué sous licence **MIT**. Fichier `vendor/qrcode.js` : distribution `js/dist/qrcode.js` du dépôt public amont ; le bandeau de copyright est conservé. Licence intégrale reproduite dans `vendor/LICENSE-MIT.txt` (© 2009 Kazuhiko Arase). **Aucun CDN** ou script distant n'est nécessaire. Aucun contenu de livre protégé n'est copié.

Cette bibliothèque effectue le codage QR et la sélection de masque ; **QRForge** fournit les contrôles de payload, les modes Wi-Fi/URL/e-mail/téléphone, les options, le rendu, l'UI, les tests et les exports. Le texte non ASCII est encodé en UTF-8 ; certains très anciens lecteurs ne prenant pas correctement en charge les contenus UTF-8 sans indicateur ECI peuvent interpréter différemment les caractères accentués. Des vérifications indépendantes sont effectuées avec ZXing-C++ dans les tests de navigateur.

## Vie privée et prudence

- Aucune persistance `localStorage` ni `sessionStorage` n'est effectuée, et le code ne contacte **aucune API distante** ; la coquille PWA seule est mise en cache.
- Le QR lui-même peut contenir **en clair** une adresse de courriel, un numéro de téléphone ou les **identifiants et le mot de passe Wi-Fi**. Toute personne disposant de l'image peut consulter ces informations ; éviter toute diffusion publique des codes Wi-Fi privés.
- Ne jamais considérer le QR comme une authentification ou un chiffrement. Il peut contenir un lien malveillant ; le lecteur doit inspecter les liens avant ouverture.
- Les QR personnalisés (couleur, grande quantité de texte, impression, reflets) ne sont pas garantis lisibles par tous les appareils. Préserver la marge et **tester un export avec un véritable lecteur** avant diffusion.
- Le seuil de contraste choisi est une **politique prudente de conception**, pas un seuil normatif QR/WCAG garantissant une lecture par tous les scanners.
- Pas de logo superposé ni mode caméra/lecture du QR, de suivi analytique, de génération massive ou de raccourcissement d'URL.

## Tests

```bash
node --check apps/qrforge/vendor/qrcode.js
node --check apps/qrforge/core.js
node --check apps/qrforge/app.js
node --check apps/qrforge/sw.js
node --test apps/qrforge/tests/core.test.cjs
python apps/qrforge/tests/browser.test.py
```

Les tests navigateur nécessitent Chromium, Playwright, Pillow et `zxing-cpp` et vérifient le **décodage indépendant** du fichier PNG et d'un SVG rastérisé, les caractères Unicode, URL/e-mail/téléphone/Wi-Fi, la confidentialité, le mobile et le hors-ligne. Les workflows GitHub Actions constituent la preuve d'exécution sur le **dernier commit** ; la présence de ces tests ne garantit pas qu'ils réussissent.

## Hébergement

Le workflow de publication existant `.github/workflows/deploy-moneyuntil-pages.yml` prévoit déjà l'inclusion additive des applications de vague 2, y compris `qrforge`. La PR ne modifie pas `main` ni une application préexistante. Après fusion autorisée seulement, le site statique pourrait être publié à l'URL de l'application sur GitHub Pages, sous réserve de réussite du déploiement.

## Traçabilité documentaire Louvre

La lecture des fiches du dépôt `TS16-001`, `FULL08-001`, `NEXT10-001`, `VUE02-001` et `GHA09-001` est documentée dans `LOUVRE-REVIEW.md`, avec les pages PDF rapportées par les fiches. Le choix de l'encodeur QR et les détails du format relèvent de la **bibliothèque MIT externe** et des adaptations originales QRForge, et non de ces ouvrages.
