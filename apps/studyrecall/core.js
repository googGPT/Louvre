/* StudyRecall — logique pure de révision espacée (méthode des boîtes de Leitner).
   Aucune dépendance au navigateur : testable avec Node. */
(function (root) {
  'use strict';

  const VERSION = 1; // version du format de sauvegarde
  const BOXES = 5; // boîtes 1 à 5
  const INTERVALS = Object.freeze([1, 2, 4, 8, 16]); // jours avant la prochaine révision, par boîte
  const MAX_CARDS = 2000; // limite raisonnable pour le stockage local
  const MAX_TEXT = 500; // longueur maximale d'une question ou d'une réponse
  const MAX_DECK = 60; // longueur maximale d'un nom de paquet

  function fail(message) { throw new Error(message); }

  // --- Dates : jours civils « AAAA-MM-JJ » en heure locale (midi, pour éviter les changements d'heure).
  function isDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(y, m - 1, d, 12);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
  }
  function dayKey(date = new Date()) {
    const z = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
  }
  function addDays(day, n) {
    if (!isDay(day)) fail('Date invalide');
    const [y, m, d] = day.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + n, 12));
  }
  function daysBetween(a, b) { // nombre de jours de a vers b
    const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  }

  // --- Cartes
  function cleanText(value, label, max) {
    if (typeof value !== 'string') fail(`${label} invalide`);
    const text = value.trim();
    if (!text) fail(`${label} obligatoire`);
    if (text.length > max) fail(`${label} trop longue (${max} caractères au plus)`);
    return text;
  }
  function cleanDeck(value) {
    const deck = typeof value === 'string' ? value.trim() : '';
    if (deck.length > MAX_DECK) fail(`Paquet trop long (${MAX_DECK} caractères au plus)`);
    return deck || 'Général';
  }
  function createCard(input, today, id) {
    if (!isDay(today)) fail('Date du jour invalide');
    if (typeof id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(id)) fail('Identifiant invalide');
    return {
      id,
      front: cleanText(input.front, 'Question', MAX_TEXT),
      back: cleanText(input.back, 'Réponse', MAX_TEXT),
      deck: cleanDeck(input.deck),
      box: 1, // une nouvelle carte commence dans la boîte 1…
      due: today, // …et se révise dès aujourd'hui
      created: today,
      reviews: 0,
      lapses: 0, // nombre d'oublis
      last: null, // dernier jour de révision
    };
  }
  function editCard(card, input) {
    return { ...card, front: cleanText(input.front, 'Question', MAX_TEXT), back: cleanText(input.back, 'Réponse', MAX_TEXT), deck: cleanDeck(input.deck) };
  }

  // Révision : « je savais » fait monter d'une boîte (jusqu'à 5), « à revoir » renvoie en boîte 1.
  function review(card, known, today) {
    if (!isDay(today)) fail('Date du jour invalide');
    if (typeof known !== 'boolean') fail('Réponse de révision invalide');
    if (card.due > today) fail('Cette carte n\'est pas encore à réviser');
    const box = known ? Math.min(BOXES, card.box + 1) : 1;
    return {
      ...card,
      box,
      due: addDays(today, INTERVALS[box - 1]),
      reviews: card.reviews + 1,
      lapses: card.lapses + (known ? 0 : 1),
      last: today,
    };
  }

  function isDue(card, today) { return card.due <= today; }

  // File de révision : cartes dues, les plus en retard d'abord, puis les boîtes basses.
  function queue(cards, today, deck = '') {
    return cards
      .filter((c) => isDue(c, today) && (!deck || c.deck === deck))
      .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box || a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  }

  function stats(cards, today) {
    const perBox = Array(BOXES).fill(0);
    for (const c of cards) perBox[c.box - 1] += 1;
    const reviewed = cards.reduce((s, c) => s + c.reviews, 0);
    const lapses = cards.reduce((s, c) => s + c.lapses, 0);
    return {
      total: cards.length,
      due: cards.filter((c) => isDue(c, today)).length,
      reviewedToday: cards.filter((c) => c.last === today).length,
      mastered: perBox[BOXES - 1], // boîte 5 = notion bien ancrée
      perBox,
      retention: reviewed ? Math.round(1000 * (reviewed - lapses) / reviewed) / 10 : null, // % de « je savais »
    };
  }

  // Charge de travail prévue sur les prochains jours (aujourd'hui inclut le retard).
  function forecast(cards, today, days = 7) {
    const out = [];
    for (let i = 0; i < days; i += 1) {
      const day = addDays(today, i);
      out.push({ day, count: cards.filter((c) => (i === 0 ? c.due <= day : c.due === day)).length });
    }
    return out;
  }

  function decks(cards) {
    return [...new Set(cards.map((c) => c.deck))].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  // --- Sauvegarde : validation stricte avant toute écriture.
  const KEYS = ['back', 'box', 'created', 'deck', 'due', 'front', 'id', 'lapses', 'last', 'reviews']; // ordre alphabétique
  function validateCard(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail('Carte invalide');
    if (Object.keys(c).sort().join(',') !== KEYS.join(',')) fail('Champs de carte inattendus');
    if (typeof c.id !== 'string' || !/^[a-z0-9-]{6,64}$/i.test(c.id)) fail('Identifiant de carte invalide');
    cleanText(c.front, 'Question', MAX_TEXT); cleanText(c.back, 'Réponse', MAX_TEXT); cleanDeck(c.deck);
    if (!Number.isInteger(c.box) || c.box < 1 || c.box > BOXES) fail('Boîte invalide');
    if (!isDay(c.due) || !isDay(c.created)) fail('Date de carte invalide');
    if (c.last !== null && !isDay(c.last)) fail('Date de révision invalide');
    if (!Number.isSafeInteger(c.reviews) || c.reviews < 0 || !Number.isSafeInteger(c.lapses) || c.lapses < 0 || c.lapses > c.reviews) fail('Compteurs de révision invalides');
    return { ...c, front: c.front.trim(), back: c.back.trim(), deck: cleanDeck(c.deck) };
  }
  function validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Sauvegarde illisible');
    if (data.app !== 'studyrecall' || data.version !== VERSION || !Array.isArray(data.cards)) fail('Ce fichier n\'est pas une sauvegarde StudyRecall');
    if (data.cards.length > MAX_CARDS) fail(`Trop de cartes (${MAX_CARDS} au plus)`);
    const cards = data.cards.map(validateCard);
    if (new Set(cards.map((c) => c.id)).size !== cards.length) fail('Identifiants de cartes en double');
    return cards;
  }
  function backup(cards) {
    return JSON.stringify({ app: 'studyrecall', version: VERSION, cards: validateBackup({ app: 'studyrecall', version: VERSION, cards }) }, null, 2);
  }

  const api = { VERSION, BOXES, INTERVALS, MAX_CARDS, isDay, dayKey, addDays, daysBetween, createCard, editCard, review, isDue, queue, stats, forecast, decks, validateBackup, backup };
  root.StudyCore = Object.freeze(api);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.StudyCore;
})(typeof window === 'undefined' ? globalThis : window);
