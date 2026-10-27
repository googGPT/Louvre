// Recherche et filtres de la page d'accueil. Sans JavaScript, toutes les applis restent visibles.
(() => {
  const tools = document.querySelector('.tools'); // zone recherche + filtres, cachée par défaut
  const input = document.getElementById('q'); // champ de recherche
  const chips = [...document.querySelectorAll('.chip')]; // boutons de famille
  const cards = [...document.querySelectorAll('.card')]; // cartes des applis
  const sections = [...document.querySelectorAll('.family')]; // sections par famille
  const empty = document.getElementById('empty'); // message « aucun résultat »
  let family = ''; // famille choisie ('' = toutes)

  // Retire les accents pour que « etude » trouve « Études ».
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function apply() {
    const q = norm(input.value.trim()); // texte recherché, normalisé
    let shown = 0; // nombre total de cartes visibles
    for (const c of cards) { // décide pour chaque carte
      const ok = (!family || c.dataset.family === family) && (!q || norm(c.dataset.search).includes(q));
      c.hidden = !ok; // cache la carte si elle ne correspond pas
      if (ok) shown++; // compte les cartes visibles
    }
    for (const s of sections) { // cache une section vide
      s.hidden = !s.querySelector('.card:not([hidden])');
    }
    empty.hidden = shown > 0; // affiche le message si rien ne correspond
  }

  for (const chip of chips) { // un clic sur une famille
    chip.addEventListener('click', () => {
      family = chip.dataset.filter; // mémorise la famille choisie
      for (const c of chips) c.setAttribute('aria-pressed', String(c === chip)); // met le bouton en évidence
      apply(); // met à jour l'affichage
    });
  }
  input.addEventListener('input', apply); // filtre à chaque frappe
  tools.hidden = false; // JavaScript actif : on montre la recherche
})();
