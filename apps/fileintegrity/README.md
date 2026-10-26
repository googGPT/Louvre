# FileIntegrity — Louvre App Factory vague 2

Vérification de l'empreinte SHA-256 locale d'un fichier au format natif Web Crypto. Ne transmet jamais le fichier ni son empreinte à un serveur. Limite de 32 Mo (lecture en mémoire), pas de scanner antivirus. Les empreintes de référence doivent provenir d'une source fiable. L'égalité de hashes ne prouve pas l'authenticité de la source.

Fonctions : choix/glisser fichier, calcul SHA-256, saisie de l'empreinte attendue, diagnostic concordance/différence, copie et export `.sha256`, PWA hors ligne après premier chargement. Aucun stockage du contenu analysé ; exporter la preuve si nécessaire.

Distinct des 27 applications historiques : aucune ne calcule le hachage cryptographique d'un fichier. Gratuit sur GitHub Pages, quotas gratuits applicables.
