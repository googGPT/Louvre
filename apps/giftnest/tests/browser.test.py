"""GiftNest dans Chromium : personnes, occasions, cadeaux, budgets, statuts, filtre, sauvegarde, hors ligne, mobile."""
import functools
import http.server
import json
import os
import re
import pathlib
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY = 'louvre-giftnest-v1'


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


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
            page.on('dialog', lambda d: d.accept())
            page.goto(origin)
            assert page.evaluate('() => document.documentElement.scrollWidth <= innerWidth + 2'), 'débordement mobile'

            # Un cadeau sans personne est refusé.
            page.locator('[name=title]').fill('Livre')
            page.locator('#add-gift').click()
            expect(page.locator('#gift-status')).to_contain_text('pour qui')

            # Personne avec budget de 40 €.
            page.locator('#person-form [name=name]').fill('Léa')
            page.locator('#person-form [name=budget]').fill('40')
            page.locator('#add-person').click()
            expect(page.locator('#people')).to_contain_text(re.compile(r'0,00\s€ dépensés sur 40,00\s€'))

            # Occasion annuelle dans 10 jours.
            in10 = page.evaluate('() => { const d = new Date(); d.setDate(d.getDate() + 10); return GiftCore.dayKey(d); }')
            page.locator('details summary').click()
            page.locator('#occ-form [name=name]').fill('Anniversaire de Léa')
            page.locator('#occ-form [name=date]').fill(in10)
            page.locator('#add-occ').click()
            expect(page.locator('#occasions article')).to_contain_text('10 jours')

            # Deux cadeaux : 25 € acheté, 30 € en idée -> alerte « dépassé si tout est acheté ».
            page.locator('#gift-form [name=occasion]').select_option(label='Anniversaire de Léa')
            page.locator('[name=title]').fill('Écharpe'); page.locator('[name=price]').fill('25'); page.locator('[name=status]').select_option('acheté')
            page.locator('#add-gift').click()
            page.locator('[name=title]').fill('Concert'); page.locator('[name=price]').fill('30'); page.locator('[name=status]').select_option('idée')
            page.locator('#add-gift').click()
            expect(page.locator('#gifts li')).to_have_count(2)
            expect(page.locator('#people')).to_contain_text('reste 15,00')
            expect(page.locator('#people')).to_contain_text('le budget serait dépassé')
            expect(page.locator('#occasions article')).to_contain_text('1 prêt · 1 idée')

            # Faire avancer l'idée : acheté -> budget dépassé (55 € sur 40 €).
            page.locator('#gifts li', has_text='Concert').locator('.status-btn').click()
            expect(page.locator('#people')).to_contain_text('budget dépassé')
            expect(page.locator('#k-wrap')).to_have_text('2')
            page.locator('#gifts li', has_text='Concert').locator('.status-btn').click()
            expect(page.locator('#k-given')).to_have_text('1')

            # Exemples + filtre par personne.
            page.locator('#sample').click()
            page.locator('#filter').select_option(label='Tom')
            expect(page.locator('#gifts li')).to_have_count(1)
            page.locator('#filter').select_option(label='Tout le monde')

            # Sauvegarde, stockage corrompu, restauration.
            with page.expect_download() as d:
                page.locator('#export').click()
            backup = pathlib.Path(d.value.path()).read_text(encoding='utf-8')
            assert len(json.loads(backup)['gifts']) == 5
            page.evaluate(f"() => localStorage.setItem('{KEY}', '{{')")
            page.reload()
            expect(page.locator('#warning')).to_be_visible()
            page.locator('#person-form [name=name]').fill('X')
            page.locator('#add-person').click()
            assert page.evaluate(f"() => localStorage.getItem('{KEY}')") == '{'
            page.locator('#import').set_input_files({'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup.encode('utf-8')})
            expect(page.locator('#backup-status')).to_contain_text('5 cadeaux')

            # Hors ligne.
            page.reload()
            page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=15000)
            context.set_offline(True)
            page.reload()
            expect(page.locator('#gifts li')).to_have_count(5)
            context.set_offline(False)

            assert not external, external
            assert not errors, errors

            # --- Langues : détection du navigateur, 7 langues complètes, arabe de droite à gauche, devise au choix.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, locale='pt-BR')
            ip = intl.new_page()
            ip.on('pageerror', lambda e: errors.append(str(e)))
            ip.on('dialog', lambda d: d.accept())
            ip.goto(origin)
            expect(ip.locator('h1')).to_have_text('O presente certo, na altura certa, dentro do orçamento.')  # navigateur portugais
            assert ip.evaluate('() => LouvreI18n.currency') == 'BRL'  # Brésil -> real proposé
            ip.locator('#sample').click()
            expect(ip.locator('#gifts li')).to_have_count(3)
            expect(ip.locator('#k-spent')).to_contain_text('R$')
            ip.locator('[name=title]').fill('Livro')  # saisie en cours : conservée au changement de langue
            titles = {'fr': 'Le bon cadeau', 'en': 'The right gift', 'es': 'El regalo adecuado', 'ar': 'الهدية المناسبة', 'pt': 'O presente certo', 'de': 'Das richtige Geschenk', 'it': 'Il regalo giusto'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                expect(ip.locator('h1')).to_contain_text(titles[lang])
                expect(ip.locator('#gifts li')).to_have_count(3)
                assert ip.locator('[name=title]').input_value() == 'Livro'
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            ip.locator('#louvre-lang').select_option('en')
            ip.locator('#louvre-currency').select_option('GBP')
            expect(ip.locator('#k-spent')).to_contain_text('£')
            expect(ip.locator('.cur-symbol').first).to_have_text('£')
            expect(ip.locator('#gifts .status-btn').first).to_have_text('idea')  # statut stocké « idée », affiché traduit
            expect(ip.locator('[name=status] option').nth(1)).to_have_text('bought')
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#person-form [name=budget]').fill('abc'); ip.locator('#person-form [name=name]').fill('X')
            ip.locator('#add-person').click()
            expect(ip.locator('#person-status')).to_have_text('Ungültiger Betrag (z. B. 25 oder 24,90)')
            stored = ip.evaluate(f"() => JSON.parse(localStorage.getItem('{KEY}')).gifts.map((g) => g.status).sort()")
            assert stored == ['acheté', 'idée', 'idée'], stored
            assert not errors, errors
            browser.close()
        print('BROWSER PASS GiftNest: validation, person budget, yearly occasion countdown, gifts, status cycle, over-budget alerts, filter, backup/restore, corrupted storage, offline, mobile, 7 languages, RTL, currency')
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
