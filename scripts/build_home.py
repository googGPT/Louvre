#!/usr/bin/env python3
"""Génère la page d'accueil Louvre (index.html) à partir de apps/catalogue.json.

catalogue.json est la source unique de la liste des applis : on modifie ce
fichier, puis on relance ce script. Avec --check, le script ne réécrit rien et
échoue si index.html n'est plus à jour (utilisé par la CI).

Usage : python scripts/build_home.py          (régénère index.html)
        python scripts/build_home.py --check  (vérifie seulement)
"""

import html  # pour échapper le texte inséré dans le HTML
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


def card(app):
    """Construit la carte HTML d'une appli."""
    slug = app["slug"]  # nom du dossier, ex. 'fuelmath'
    href = f"./apps/{slug}/"  # lien relatif vers l'appli
    if os.path.isfile(os.path.join(ROOT, "apps", slug, "icon.svg")):  # icône disponible
        icon = f'<img src="./apps/{slug}/icon.svg" alt="" width="44" height="44">'
    else:  # pas d'icône : on affiche l'initiale
        icon = FALLBACK.format(letter=esc(app["name"][0]))
    search = esc(f'{app["name"]} {app["domain"]} {app["family"]} {app["description"]}'.lower())  # texte de recherche
    return (
        f'<li class="card" data-family="{esc(app["family"])}" data-search="{search}">'
        f'<a href="{href}">{icon}'
        f'<span class="card-text"><strong>{esc(app["name"])}</strong>'
        f'<span class="card-desc">{esc(app["description"])}</span>'
        f'<span class="card-domain">{esc(app["domain"])}</span></span></a></li>'
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
            f'<h2>{esc(fam)} <span class="count">{len(members)}</span></h2>'
            f'<ul class="grid">\n{cards}\n</ul></section>'
        )
    chips = "".join(  # boutons de filtre, un par famille
        f'<button type="button" class="chip" data-filter="{esc(f)}" aria-pressed="false">{esc(f)}</button>'
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
<script src="./assets/home.js" defer></script>
</head>
<body>
<!-- Fichier généré par scripts/build_home.py depuis apps/catalogue.json : ne pas modifier à la main. -->
<header class="hero">
<p class="eyebrow">Louvre</p>
<h1>{len(apps)} applications gratuites pour le quotidien</h1>
<p class="lead">Sans compte, sans publicité, sans serveur : vos données restent sur votre appareil, et chaque appli fonctionne hors ligne après la première visite.</p>
<div class="tools" hidden>
<label class="search"><span class="visually-hidden">Rechercher une appli</span><input type="search" id="q" placeholder="Rechercher : budget, voyage, QR…" autocomplete="off"></label>
<div class="chips" role="group" aria-label="Filtrer par famille"><button type="button" class="chip" data-filter="" aria-pressed="true">Toutes</button>{chips}</div>
</div>
</header>
<main>
{chr(10).join(sections)}
<p class="empty" id="empty" hidden>Aucune appli ne correspond à cette recherche.</p>
</main>
<footer>
<p><strong>Vos données vous appartiennent.</strong> Toutes les applis partagent la même adresse ; effacer les données du site dans votre navigateur efface donc celles des {len(apps)} applis. Pensez à utiliser l'export de sauvegarde de chaque appli.</p>
</footer>
</body>
</html>
"""


def main():
    with open(CATALOGUE, encoding="utf-8") as f:  # ouvre la source de vérité
        data = json.load(f)  # la transforme en dictionnaire Python
    page = render(data)  # construit la page
    if "--check" in sys.argv:  # mode vérification (CI)
        current = open(OUTPUT, encoding="utf-8").read() if os.path.exists(OUTPUT) else ""
        if current != page:  # la page n'a pas été régénérée
            print("index.html n'est pas à jour : lancez python scripts/build_home.py")
            return 1  # échec
        print(f"OK : index.html à jour ({len(data['apps'])} applis).")
        return 0  # succès
    with open(OUTPUT, "w", encoding="utf-8") as f:  # écrit la page
        f.write(page)
    print(f"index.html régénéré : {len(data['apps'])} applis.")
    return 0


if __name__ == "__main__":  # exécution directe
    sys.exit(main())
