#!/usr/bin/env python3
"""Ajoute (ou met à jour) la politique de sécurité du contenu (CSP) de chaque appli.

Métaphore : la CSP est la liste des invités autorisés à parler dans la page.
Ici, seul le code fourni par l'appli elle-même peut s'exécuter : un script
injecté (par exemple via une donnée importée malveillante) serait refusé par
le navigateur. Les applis n'utilisent aucune ressource externe, donc rien
d'utile n'est bloqué.

Un script écrit directement dans la page (cas de MoneyUntil) est autorisé par
son empreinte SHA-256 exacte : s'il est modifié, relancer ce script.

Usage : python scripts/apply_csp.py          (écrit la CSP dans index.html et index.htm)
        python scripts/apply_csp.py --check  (échoue si une page n'est pas à jour)
"""

import base64  # encodage de l'empreinte attendu par la CSP
import hashlib  # calcul de l'empreinte SHA-256 des scripts intégrés
import pathlib  # parcours des fichiers
import re  # repérage des balises dans le HTML
import sys  # arguments et code de sortie

ROOT = pathlib.Path(__file__).resolve().parent.parent  # racine du dépôt
MARK = 'http-equiv="Content-Security-Policy"'  # repère de la balise gérée par ce script

BASE = [  # règles communes à toutes les applis
    "default-src 'self'",  # par défaut, uniquement les fichiers de l'appli
    "script-src 'self'{hashes}",  # code : fichiers de l'appli (+ scripts intégrés identifiés)
    "style-src 'self' 'unsafe-inline'",  # styles : l'appli peut colorer ses éléments dynamiquement
    "img-src 'self' data: blob:",  # images : fichiers, photos locales, aperçus générés
    "media-src 'self' blob:",  # médias produits localement
    "font-src 'self' data:",  # polices locales
    "connect-src 'self' blob: data:",  # lectures de fichiers locaux, jamais de serveur externe
    "worker-src 'self'",  # service worker de l'appli
    "manifest-src 'self'",  # manifeste d'installation
    "object-src 'none'",  # aucun plugin
    "base-uri 'self'",  # interdit de détourner les liens relatifs
    "form-action 'self'",  # les formulaires restent dans l'appli
]


def inline_hashes(html):
    """Empreintes des scripts écrits directement dans la page (sans attribut src)."""
    hashes = []
    for attrs, body in re.findall(r"<script(\s[^>]*)?>(.*?)</script>", html, re.S):  # chaque <script>
        if attrs and "src=" in attrs:  # script externe : déjà couvert par 'self'
            continue
        digest = hashlib.sha256(body.encode("utf-8")).digest()  # empreinte exacte du contenu
        hashes.append("'sha256-" + base64.b64encode(digest).decode() + "'")
    return hashes


def policy(html):
    """Construit la politique adaptée à la page."""
    hashes = inline_hashes(html)
    extra = (" " + " ".join(hashes)) if hashes else ""
    return "; ".join(rule.format(hashes=extra) for rule in BASE)


def apply(html):
    """Renvoie la page avec une balise CSP à jour, placée juste après <meta charset>."""
    html = re.sub(r'\n?[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>', "", html)  # retire l'ancienne
    tag = f'<meta {MARK} content="{policy(html)}">'
    match = re.search(r"<meta charset=[^>]*>", html, re.I)  # la CSP doit venir très tôt
    if not match:
        raise SystemExit("<meta charset> introuvable")
    line_start = html.rfind("\n", 0, match.start()) + 1  # reprend l'indentation de la ligne
    indent = html[line_start:match.start()] if html[line_start:match.start()].strip() == "" else ""
    sep = "\n" + indent if indent or html[match.end():match.end() + 1] == "\n" else ""
    return html[:match.end()] + sep + tag + html[match.end():]


def only():
    """Slugs passés après --only (ex. --only fuelmath parkwise) ; vide = toutes les applis."""
    return set(sys.argv[sys.argv.index("--only") + 1:]) if "--only" in sys.argv else set()


def pages():
    """Pages d'applis concernées (index.html et sa copie index.htm)."""
    keep = only()
    for app in sorted((ROOT / "apps").iterdir()):
        if keep and app.name not in keep:
            continue  # --only : ne touche pas aux autres applis
        for name in ("index.html", "index.htm"):
            page = app / name
            if page.is_file():
                yield page


def main():
    check = "--check" in sys.argv
    stale = []
    for page in pages():
        text = page.read_text(encoding="utf-8")
        new = apply(text)
        if new != text:
            if check:
                stale.append(str(page.relative_to(ROOT)))
            else:
                page.write_text(new, encoding="utf-8")
    if stale:
        print("CSP pas à jour (lancez python scripts/apply_csp.py) : " + ", ".join(stale))
        return 1
    print("OK : CSP à jour." if check else "CSP appliquée.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
