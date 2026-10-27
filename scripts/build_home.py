#!/usr/bin/env python3
"""Génère la page d'accueil Louvre (index.html) à partir de apps/catalogue.json.

catalogue.json est la source unique de la liste des applis : on modifie ce
fichier, puis on relance ce script. Avec --check, le script ne réécrit rien et
échoue si index.html n'est plus à jour (utilisé par la CI).

Usage : python scripts/build_home.py          (régénère index.html)
        python scripts/build_home.py --check  (vérifie seulement)
"""

import html  # pour échapper le texte inséré dans le HTML
import re  # pour fabriquer des clés de traduction
import unicodedata  # pour retirer les accents des clés
import json  # pour lire catalogue.json
import os  # pour vérifier la présence des icônes et dossiers
import sys  # pour lire les arguments et renvoyer un code de sortie

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # racine du dépôt
CATALOGUE = os.path.join(ROOT, "apps", "catalogue.json")  # source de vérité
OUTPUT = os.path.join(ROOT, "index.html")  # page d'accueil générée

# Icône de secours (une lettre dans un carré) pour une appli sans icon.svg.
FALLBACK = '<span class="tile-letter" aria-hidden="true">{letter}</span>'


def esc(text):
    """Échappe un texte pour l'insérer sans risque dans le HTML."""
    return html.escape(text, quote=True)  # remplace < > & " ' par des entités


def key(text):
    """Clé ASCII stable pour un libellé français (« Maison et achats » -> « maison-et-achats »)."""
    norm = unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode()  # retire les accents
    return re.sub(r"[^a-z0-9]+", "-", norm.lower()).strip("-")


# Textes français de la page ; les autres langues sont dans apps/catalogue-i18n.json (section « ui »).
UI_FR = {
    "meta.title": "Louvre — {n} applications gratuites",
    "meta.description": "{n} applications web gratuites, sans compte, qui gardent vos données sur votre appareil et fonctionnent hors ligne.",
    "hero.title": "{n} applications gratuites pour le quotidien",
    "hero.lead": "Sans compte, sans publicité, sans serveur : vos données restent sur votre appareil, et chaque appli fonctionne hors ligne après la première visite.",
    "search.label": "Rechercher une appli",
    "search.placeholder": "Rechercher : budget, voyage, QR…",
    "filter.label": "Filtrer par famille",
    "filter.all": "Toutes",
    "empty": "Aucune appli ne correspond à cette recherche.",
    "footer.title": "Vos données vous appartiennent.",
    "footer.text": "Toutes les applis partagent la même adresse ; effacer les données du site dans votre navigateur efface donc celles des {n} applis. Pensez à utiliser l'export de sauvegarde de chaque appli.",
    "locale.currency": "Devise",
}


def messages(data, i18n):
    """Construit window.LouvreMessages pour l'accueil : interface, familles, domaines, descriptions."""
    n = len(data["apps"])
    out = {}
    for lang in ["fr"] + sorted(i18n):
        tr = i18n.get(lang, {})
        ui = UI_FR if lang == "fr" else tr["ui"]
        m = {k: v.replace("{n}", str(n)) for k, v in ui.items()}  # nombre d'applis inscrit directement
        for fam in data["families"]:
            m["family." + key(fam)] = fam if lang == "fr" else tr["families"][fam]
        for dom in sorted({a["domain"] for a in data["apps"]}):
            m["domain." + key(dom)] = dom if lang == "fr" else tr["domains"][dom]
        for a in data["apps"]:
            m["app." + a["slug"]] = a["description"] if lang == "fr" else tr["apps"][a["slug"]]
        out[lang] = m
    return out


def card(app):
    """Construit la carte HTML d'une appli."""
    slug = app["slug"]  # nom du dossier, ex. 'fuelmath'
    href = f"./apps/{slug}/"  # lien relatif vers l'appli
    if os.path.isfile(os.path.join(ROOT, "apps", slug, "icon.svg")):  # icône disponible
        icon = f'<img src="./apps/{slug}/icon.svg" alt="" width="44" height="44">'
    else:  # pas d'icône : on affiche l'initiale
        icon = FALLBACK.format(letter=esc(app["name"][0]))
    return (
        f'<li class="card" data-family="{esc(app["family"])}">'
        f'<a href="{href}">{icon}'
        f'<span class="card-text"><strong>{esc(app["name"])}</strong>'
        f'<span class="card-desc" data-i18n="app.{slug}">{esc(app["description"])}</span>'
        f'<span class="card-domain" data-i18n="domain.{key(app["domain"])}">{esc(app["domain"])}</span></span></a></li>'
    )


def render(data):
    """Assemble la page complète."""
    apps = data["apps"]  # liste des applis publiées
    for a in apps:  # contrôle de cohérence : chaque appli doit exister
        if not os.path.isfile(os.path.join(ROOT, "apps", a["slug"], "index.html")):
            raise SystemExit(f"Appli introuvable : apps/{a['slug']}/index.html")
        if a["family"] not in data["families"]:  # famille inconnue = faute de frappe
            raise SystemExit(f"Famille inconnue pour {a['slug']} : {a['family']}")
    listed = {a["slug"] for a in apps}  # applis présentes dans le catalogue
    on_disk = {  # applis réellement présentes dans apps/
        d for d in os.listdir(os.path.join(ROOT, "apps"))
        if os.path.isfile(os.path.join(ROOT, "apps", d, "index.html"))
    }
    if on_disk - listed:  # appli publiée mais oubliée dans le catalogue
        raise SystemExit("Applis absentes de apps/catalogue.json : " + ", ".join(sorted(on_disk - listed)))
    sections = []  # une section par famille
    for fam in data["families"]:  # dans l'ordre choisi dans catalogue.json
        members = sorted((a for a in apps if a["family"] == fam), key=lambda a: a["name"].lower())
        cards = "\n".join(card(a) for a in members)  # cartes triées par nom
        sections.append(
            f'<section class="family" data-family="{esc(fam)}">'
            f'<h2><span data-i18n="family.{key(fam)}">{esc(fam)}</span> <span class="count">{len(members)}</span></h2>'
            f'<ul class="grid">\n{cards}\n</ul></section>'
        )
    chips = "".join(  # boutons de filtre, un par famille
        f'<button type="button" class="chip" data-filter="{esc(f)}" aria-pressed="false" data-i18n="family.{key(f)}">{esc(f)}</button>'
        for f in data["families"]
    )
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Louvre — {len(apps)} applications gratuites</title>
<meta name="description" content="{len(apps)} applications web gratuites, sans compte, qui gardent vos données sur votre appareil et fonctionnent hors ligne.">
<link rel="stylesheet" href="./assets/home.css">
<link rel="stylesheet" href="./assets/louvre-i18n.css">
<script src="./assets/louvre-i18n.js" defer></script>
<script src="./assets/home-messages.js" defer></script>
<script src="./assets/home.js" defer></script>
</head>
<body>
<!-- Fichier généré par scripts/build_home.py depuis apps/catalogue.json : ne pas modifier à la main. -->
<header class="hero">
<div class="hero-top"><p class="eyebrow">Louvre</p><div data-louvre-locale></div></div>
<h1 data-i18n="hero.title">{len(apps)} applications gratuites pour le quotidien</h1>
<p class="lead" data-i18n="hero.lead">Sans compte, sans publicité, sans serveur : vos données restent sur votre appareil, et chaque appli fonctionne hors ligne après la première visite.</p>
<div class="tools" hidden>
<label class="search"><span class="visually-hidden" data-i18n="search.label">Rechercher une appli</span><input type="search" id="q" placeholder="Rechercher : budget, voyage, QR…" data-i18n-attr="placeholder:search.placeholder" autocomplete="off"></label>
<div class="chips" role="group" aria-label="Filtrer par famille" data-i18n-attr="aria-label:filter.label"><button type="button" class="chip" data-filter="" aria-pressed="true" data-i18n="filter.all">Toutes</button>{chips}</div>
</div>
</header>
<main>
{chr(10).join(sections)}
<p class="empty" id="empty" hidden data-i18n="empty">Aucune appli ne correspond à cette recherche.</p>
</main>
<footer>
<p><strong data-i18n="footer.title">Vos données vous appartiennent.</strong> <span data-i18n="footer.text">Toutes les applis partagent la même adresse ; effacer les données du site dans votre navigateur efface donc celles des {len(apps)} applis. Pensez à utiliser l'export de sauvegarde de chaque appli.</span></p>
</footer>
</body>
</html>
"""


def main():
    with open(CATALOGUE, encoding="utf-8") as f:  # ouvre la source de vérité
        data = json.load(f)  # la transforme en dictionnaire Python
    page = render(data)  # construit la page
    with open(os.path.join(ROOT, "apps", "catalogue-i18n.json"), encoding="utf-8") as f:  # traductions
        i18n = json.load(f)
    msg_js = ("/* Généré par scripts/build_home.py : ne pas modifier à la main. */\n"
              "window.LouvreMessages = " + json.dumps(messages(data, i18n), ensure_ascii=False, indent=1) + ";\n")
    msg_path = os.path.join(ROOT, "assets", "home-messages.js")
    if "--check" in sys.argv:  # mode vérification (CI)
        current = open(OUTPUT, encoding="utf-8").read() if os.path.exists(OUTPUT) else ""
        cur_msg = open(msg_path, encoding="utf-8").read() if os.path.exists(msg_path) else ""
        if current != page or cur_msg != msg_js:  # la page ou ses traductions n'ont pas été régénérées
            print("index.html n'est pas à jour : lancez python scripts/build_home.py")
            return 1  # échec
        print(f"OK : index.html à jour ({len(data['apps'])} applis).")
        return 0  # succès
    with open(OUTPUT, "w", encoding="utf-8") as f:  # écrit la page
        f.write(page)
    with open(msg_path, "w", encoding="utf-8") as f:  # écrit les traductions
        f.write(msg_js)
    print(f"index.html régénéré : {len(data['apps'])} applis.")
    return 0


if __name__ == "__main__":  # exécution directe
    sys.exit(main())
