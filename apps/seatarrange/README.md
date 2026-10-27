# SeatArrange

Plan de table ou de salle, gratuit, sans compte et hors ligne.

- Invités (collés en liste, « Nom ; groupe »), tables ou rangées avec un nombre de places, plusieurs événements.
- Contraintes : « ensemble » (même table ou même rangée), « séparés », « place fixe » (table ou rangée, place facultative) ; doublons et règles contradictoires refusés.
- Placement automatique déterministe : places fixes d'abord, groupes « ensemble » (union-find) gardés côte à côte, recherche exacte avec budget borné (meilleur ajustement, sans conflit « séparés »), sinon meilleur placement glouton ; les groupes plus grands que la plus grande table sont découpés.
- Ajustement manuel au clavier ou au toucher (choisir un invité, puis une place ; échange si la place est prise ; retrait du plan).
- Rapport recalculé à chaque modification : contraintes non satisfaites, invités sans place, places manquantes.
- Impression du plan, export CSV (en-têtes traduits, cellules protégées contre les formules), sauvegarde JSON entièrement revalidée (références, places en double) ; protection si le stockage local est illisible.

Limites : « ensemble » ne garantit pas des places voisines (seulement la même table ou rangée, les groupes sont toutefois placés à la suite) ; sur de très gros problèmes contraints, la recherche exacte peut s'arrêter et le meilleur placement trouvé est signalé comme tel ; deux invités ne peuvent pas porter exactement le même nom.

Tests : `bash scripts/test_app.sh seatarrange`.
