"""TimelineBuilder dans Chromium : dates avant notre ère, précisions, périodes, pistes, frise SVG à l'échelle,
injection neutralisée, exports SVG/CSV, sauvegarde, stockage corrompu, hors ligne, mobile, 7 langues."""
import functools
import http.server
import json
import os
import pathlib
import threading
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-timelinebuilder-v1'
WIDE = '''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2
      && !e.closest('#chart svg'))
    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)'''


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def date(page, prefix, year, era='ce', month='0', day=''):
    page.locator(f'#{prefix}-era').select_option(era)
    page.locator(f'#{prefix}-year').fill(str(year))
    page.locator(f'#{prefix}-month').select_option(str(month))
    page.locator(f'#{prefix}-day').fill(str(day))


def add(page, title, start, end=None, track=None):
    page.locator('#e-title').fill(title)
    if track is not None:
        page.locator('#e-track').select_option(label=track)
    if page.locator('#e-period').is_checked() != (end is not None):
        page.locator('#e-period').click()
    date(page, 's', *start)
    if end:
        date(page, 'x', *end)
    page.locator('#save-event').click()


def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            exe = os.environ.get('LOUVRE_CHROMIUM', '/usr/bin/chromium')
            browser = p.chromium.launch(headless=True, executable_path=exe if os.path.exists(exe) else None, args=['--no-sandbox'])
            context = browser.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True, locale='fr-FR')
            page = context.new_page()
            errors, external = [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('request', lambda r: external.append(r.url) if r.url.startswith('http') and not r.url.startswith(origin) else None)
            page.on('dialog', lambda d: d.accept(d.default_value) if d.type == 'prompt' else d.accept())
            page.goto(origin)
            # La page ne déborde pas ; seule la frise défile dans son cadre.
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), page.evaluate(WIDE)
            assert page.locator('#louvre-currency').count() == 0
            expect(page.locator('#tracks li')).to_have_count(1)
            expect(page.locator('#chart svg desc')).to_have_text('Frise vide.')

            # Validation (le message dit quelle date est fautive).
            add(page, 'X', ('0',))
            expect(page.locator('#event-status')).to_have_text("Date de début : Année : nombre entier de 1 à 9999 (pas d'année 0)")
            add(page, 'X', ('2023', 'ce', '2', '29'))
            expect(page.locator('#event-status')).to_have_text('Date de début : Jour invalide pour ce mois')
            add(page, 'X', ('2023', 'ce', '0', '5'))
            expect(page.locator('#event-status')).to_have_text('Date de début : Choisissez le mois avant le jour')
            add(page, 'X', ('1800',), ('1700',))
            expect(page.locator('#event-status')).to_have_text('La fin précède le début')
            add(page, '', ('1800',))
            expect(page.locator('#event-status')).to_have_text("Intitulé de l'événement obligatoire")

            # Événements : avant notre ère, jour précis, période à cheval sur notre ère.
            add(page, 'Fondation de Rome', ('753', 'bce'))
            expect(page.locator('#event-status')).to_have_text('Événement ajouté : Fondation de Rome (753 av. J.-C.).')
            add(page, 'Prise de la Bastille', ('1789', 'ce', '7', '14'))
            expect(page.locator('#event-status')).to_have_text('Événement ajouté : Prise de la Bastille (14 juillet 1789).')
            add(page, 'Empire romain', ('27', 'bce'), ('476',))
            expect(page.locator('#event-status')).to_have_text('Événement ajouté : Empire romain (27 av. J.-C. – 476).')
            saved = page.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}')).timelines[0].events")
            assert [e['start'] for e in saved] == [{'y': -752, 'm': 0, 'd': 0}, {'y': 1789, 'm': 7, 'd': 14}, {'y': -26, 'm': 0, 'd': 0}], saved
            expect(page.locator('#events .list li b')).to_have_text(['Fondation de Rome', 'Empire romain', 'Prise de la Bastille'])

            # Frise SVG à l'échelle : deux points, une période ; graduations en numérotation historique.
            expect(page.locator('#chart svg circle')).to_have_count(2)
            texts = page.locator('#chart svg text').all_text_contents()
            assert '500 av. J.-C.' in texts and '1000' in texts, texts
            geo = page.evaluate('''() => {
              const c = [...document.querySelectorAll('#chart svg circle')].map((e) => +e.getAttribute('cx'));
              const r = document.querySelector('#chart svg g rect');
              return { rome: c[0], bastille: c[1], x1: +r.getAttribute('x'), x2: +r.getAttribute('x') + +r.getAttribute('width') };
            }''')
            # Échelle linéaire : (fin de l'Empire - Rome) / (Bastille - Rome) ≈ (477 + 752,5) / (1789,5 + 752,5).
            ratio = (geo['x2'] - geo['rome']) / (geo['bastille'] - geo['rome'])
            assert abs(ratio - (477 + 752.5) / (1789.54 + 752.5)) < 0.01, (ratio, geo)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2')
            assert page.evaluate("() => { const c = document.getElementById('chart'); return c.scrollWidth > c.clientWidth; }")  # défilement interne

            # Pistes : ajout, événement sur la nouvelle piste, suppression refusée si non vide.
            page.locator('#add-track').click()
            expect(page.locator('#tracks li')).to_have_count(2)
            add(page, 'Apollo 11', ('1969', 'ce', '7'), track='Piste 2')
            expect(page.locator('#event-status')).to_have_text('Événement ajouté : Apollo 11 (juillet 1969).')
            page.get_by_role('button', name='Supprimer la piste Piste 2').click()
            expect(page.locator('#timeline-status')).to_contain_text('Déplacez ou supprimez les événements')
            expect(page.locator('#chart svg text', has_text='Piste 2')).to_have_count(1)

            # Modification et injection neutralisée.
            page.get_by_role('button', name='Modifier « Prise de la Bastille »').click()
            expect(page.locator('#h-event')).to_have_text("Modifier l'événement")
            expect(page.locator('#s-month')).to_have_value('7')
            page.locator('#e-title').fill('<img src=x onerror="window.__pwned=1">')
            page.locator('#save-event').click()
            expect(page.locator('#event-status')).to_contain_text('Événement enregistré')
            assert page.evaluate("() => document.querySelectorAll('#chart img, #chart script, #chart foreignObject').length") == 0
            assert page.evaluate('() => window.__pwned === undefined')
            expect(page.locator('#chart svg text', has_text='<img src=x')).to_have_count(1)
            page.get_by_role('button', name='Supprimer « <img src=x onerror="window.__pwned=1"> »').click()
            expect(page.locator('#chart svg circle')).to_have_count(2)

            # Exports SVG (XML valide, textes échappés) et CSV (ISO + texte).
            with page.expect_download() as d:
                page.locator('#export-svg').click()
            assert d.value.suggested_filename == 'ma-frise.svg'
            svg = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            root = ET.fromstring(svg.split('\n', 1)[1])
            assert root.tag.endswith('svg') and '<script' not in svg
            assert 'Fondation de Rome — 753 av. J.-C.' in svg and 'Empire romain — 27 av. J.-C. – 476' in svg, svg[:500]
            with page.expect_download() as d:
                page.locator('#export-csv').click()
            csv = pathlib.Path(d.value.path()).read_text(encoding='utf-8-sig')
            assert csv.splitlines()[0] == 'Piste,Événement,Début (ISO),Fin (ISO),Début,Fin,Note', csv
            assert 'Général,Fondation de Rome,-0752,,753 av. J.-C.,,' in csv and 'Général,Empire romain,-0026,0476,27 av. J.-C.,476,' in csv, csv
            assert 'Piste 2,Apollo 11,1969-07,,juillet 1969,,' in csv, csv

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['timelines'][0]['events']) == 3
            page.evaluate(f"() => localStorage.setItem('{KEY}', '[1,2')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            expect(page.locator('#e-title')).to_be_disabled()
            page.locator('#sample').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '[1,2'
            page.locator('#import').set_input_files({'name': 'x.json', 'mimeType': 'application/json', 'buffer': b'{"app":"timelinebuilder","version":1,"timelines":[{"id":"x"}]}'})
            expect(page.locator('#backup-status')).to_contain_text('Restauration refusée')
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_have_text('Sauvegarde restaurée : 1 frise.')
            expect(page.locator('#warning')).to_be_hidden()
            expect(page.locator('#chart svg circle')).to_have_count(2)

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#events .list li b')).to_have_count(3)
            context.set_offline(False)
            wide = page.evaluate(WIDE)
            assert not wide, f'débordement mobile : {wide}'
            assert not external, external
            assert not errors, errors

            # --- Langues
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='es-MX')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('La historia, a escala.')
            ip.locator('#sample').click()
            expect(ip.locator('#timeline-select')).to_contain_text('Hitos históricos')
            expect(ip.locator('#tracks li')).to_have_count(2)
            expect(ip.locator('#events .list li b').first).to_have_text('Fundación de Roma')  # piste « Política » d'abord
            expect(ip.locator('#events')).to_contain_text('14 de julio de 1789')
            ip.locator('#e-title').fill('Borrador')
            ip.locator('#s-year').fill('1492'); ip.locator('#s-month').select_option('10')
            heads = {'fr': 'Frise à l\'échelle', 'en': 'Timeline to scale', 'es': 'Línea de tiempo a escala', 'ar': 'الخط الزمني بالمقياس', 'pt': 'Cronologia à escala', 'de': 'Maßstabsgetreue Zeitleiste', 'it': 'Linea del tempo in scala'}
            era = {'fr': 'av. J.-C.', 'en': 'BCE', 'es': 'a. C.', 'ar': 'ق.م', 'pt': 'a.C.', 'de': 'v. Chr.', 'it': 'a.C.'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.lang') == lang
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate(WIDE)
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('#h-chart')).to_have_text(heads[lang])
                expect(ip.locator('#e-title')).to_have_value('Borrador')
                expect(ip.locator('#s-year')).to_have_value('1492')
                expect(ip.locator('#s-month')).to_have_value('10')
                expect(ip.locator('#chart svg text', has_text=era[lang]).first).to_be_attached()
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('de')
            expect(ip.locator('#events')).to_contain_text('14. Juli 1789')
            assert not errors, errors
            browser.close()
        print('BROWSER PASS TimelineBuilder: validation, BCE dates, day/month/year precision, periods, linear scale, historical ticks, tracks, edit, injection neutralised, SVG/CSV export, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, input kept')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
