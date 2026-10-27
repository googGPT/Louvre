"""Real Chromium test of the local-only SnapAction web application. No external APIs."""
from __future__ import annotations
import struct
import zlib
import json
import os
import shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
# Generate a valid PNG using only Python stdlib to avoid malformed tiny-fixture CRCs.
def fake_png():
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    w, h = 16, 16
    header = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    pixels = b''.join(b'\x00' + bytes([75, 175, 130]) * w for _ in range(h))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')

PNG = fake_png()


def main():
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://localhost:{server.server_port}/'
    errors = []
    try:
        with sync_playwright() as p:
            browser_path = os.environ.get('LOUVRE_CHROMIUM') or os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
            browser = (p.chromium.launch(headless=True, executable_path=browser_path, args=['--no-sandbox', '--disable-dev-shm-usage'])
                       if browser_path else p.chromium.launch(channel='chrome', headless=True, args=['--no-sandbox', '--disable-dev-shm-usage']))
            context = browser.new_context(accept_downloads=True, service_workers='allow', locale='fr-FR')
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url, wait_until='networkidle')
            assert page.title().startswith('SnapAction'), page.title()
            assert page.locator('#storage-warning').is_hidden(), 'IndexedDB not accessible'
            assert page.locator('#metric-open').inner_text() == '0'
            page.locator('#quick-text').fill('Envoyer le dossier demain à 14h30')
            assert page.locator('#parse-preview').inner_text().find('Date suggérée') >= 0
            assert page.locator('#due-local').input_value(), 'Date not automatically suggested'
            page.locator('#image-file').set_input_files({'name': 'capture.png', 'mimeType': 'image/png', 'buffer': PNG})
            page.wait_for_function("() => (document.querySelector('#image-label').textContent.includes('prête'))", timeout=9000)
            page.locator('#create-button').click()
            page.wait_for_function("() => (document.querySelector('#metric-open').textContent==='1')")
            assert page.get_by_text('Envoyer le dossier demain à 14h30', exact=True).count() == 1
            assert page.get_by_text('Capture', exact=False).count() >= 1
            page.reload(wait_until='networkidle')
            page.wait_for_function("() => (document.querySelector('#metric-open').textContent==='1')")
            assert page.get_by_text('Envoyer le dossier demain à 14h30', exact=True).count() == 1
            page.locator('.task-row [data-action="image"]').click()
            assert page.locator('#image-dialog').evaluate('(node)=>node.open')
            page.locator('#close-image').click()
            page.locator('.task-row [data-action="edit"]').click()
            page.locator('#edit-title-input').fill('Envoyer le dossier corrigé')
            page.locator('#edit-note').fill('Pièce à joindre après vérification')
            page.locator('#edit-form button[type="submit"]').click()
            page.wait_for_function("() => (document.querySelector('.task-row .task-body h3')?.textContent==='Envoyer le dossier corrigé')", timeout=10000)
            assert page.get_by_text('Envoyer le dossier corrigé', exact=True).count() == 1
            with page.expect_download() as download_info:
                page.locator('#export-json').click()
            download = download_info.value
            saved = json.loads(Path(download.path()).read_text(encoding='utf-8'))
            assert saved['version'] == 1 and len(saved['tasks']) == 1
            assert saved['tasks'][0]['image'].startswith('data:image/')
            page.locator('.task-row [data-action="edit"]').click()
            page.once('dialog', lambda d: d.accept())
            page.locator('#delete-action').click()
            page.wait_for_function("() => (document.querySelector('#metric-open').textContent==='0')")
            page.once('dialog', lambda d: d.accept())
            page.locator('#import-file').set_input_files({'name': 'backup.json', 'mimeType': 'application/json', 'buffer': json.dumps(saved).encode()})
            page.wait_for_function("() => (document.querySelector('#metric-open').textContent==='1')")
            assert page.get_by_text('Envoyer le dossier corrigé', exact=True).count() == 1
            with page.expect_download() as calendar_info:
                page.locator('#export-calendar').click()
            ics = Path(calendar_info.value.path()).read_text()
            assert 'BEGIN:VEVENT' in ics and 'Envoyer le dossier corrig' in ics
            page.locator('.task-row [data-action="toggle"]').click()
            page.wait_for_function("() => (document.querySelector('#metric-done').textContent==='1')")
            page.locator('[data-view="done"]').click()
            assert page.get_by_text('Envoyer le dossier corrigé', exact=True).count() == 1
            # Verify offline shell: registration should be complete, then reload without network.
            page.wait_for_function('() => (navigator.serviceWorker.controller !== null)', timeout=12000)
            context.set_offline(True)
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("() => (document.querySelector('#metric-done').textContent==='1')", timeout=7000)
            assert page.title().startswith('SnapAction')
            context.set_offline(False)
            mobile = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True, locale='fr-FR')
            mp = mobile.new_page()
            mp.on('pageerror', lambda error: errors.append(str(error)))
            mp.goto(url, wait_until='networkidle')
            assert mp.locator('#quick-text').is_visible()
            assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Mobile has horizontal overflow'
            assert not errors, errors
            mobile.close()

            # --- Langues : détection du navigateur, 7 langues complètes, arabe de droite à gauche, saisie conservée.
            intl = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, locale='en-US')
            ip = intl.new_page()
            ip.on('pageerror', lambda error: errors.append(str(error)))
            ip.goto(url, wait_until='networkidle')
            assert ip.locator('#capture-title').inner_text() == 'What mustn\'t we forget?', ip.locator('#capture-title').inner_text()
            assert ip.evaluate('() => LouvreI18n.lang') == 'en'
            assert ip.locator('#louvre-currency').count() == 0  # pas d'argent : menu langue seul
            ip.locator('#quick-text').fill('Call the bank tomorrow 2pm')
            ip.wait_for_function("() => document.querySelector('#parse-preview').textContent.includes('Suggested date')")
            assert ip.locator('#due-local').input_value().endswith('T14:00'), ip.locator('#due-local').input_value()
            expected = {'fr': 'Toutes les actions', 'en': 'All actions', 'es': 'Todas las acciones', 'ar': 'كل الإجراءات',
                        'pt': 'Todas as ações', 'de': 'Alle Aufgaben', 'it': 'Tutte le azioni'}
            for lang in ['fr', 'en', 'es', 'ar', 'pt', 'de', 'it']:
                ip.locator('#louvre-lang').select_option(lang)
                assert ip.evaluate('() => document.documentElement.dir') == ('rtl' if lang == 'ar' else 'ltr')
                wide = ip.evaluate('''() => document.documentElement.scrollWidth <= innerWidth + 2 ? [] :
                  [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 2)
                    .slice(0, 5).map((e) => `${e.tagName}.${e.className} « ${(e.textContent || '').trim().slice(0, 40)} »`)''')
                assert not wide, f'débordement en {lang} : {wide}'
                assert ip.locator('#list-heading').inner_text() == expected[lang], (lang, ip.locator('#list-heading').inner_text())
                assert ip.locator('#quick-text').input_value() == 'Call the bank tomorrow 2pm'  # saisie conservée
                assert '✧' in ip.locator('#parse-preview').inner_text()
            assert ip.evaluate('() => LouvreI18n.missing()') == [], ip.evaluate('() => LouvreI18n.missing()')
            # Date reconnue en allemand et erreur traduite.
            ip.locator('#louvre-lang').select_option('de')
            ip.locator('#quick-text').fill('Unterlagen morgen um 9:15 senden')
            ip.wait_for_function("() => document.querySelector('#parse-preview').textContent.includes('Vorgeschlagener Termin')")
            assert ip.locator('#due-local').input_value().endswith('T09:15')
            ip.locator('#due-local').fill('')
            ip.locator('#repeat').select_option('daily')
            ip.locator('#create-button').click()
            ip.wait_for_function("() => document.querySelector('#toast').textContent === 'Wählen Sie eine Fälligkeit, um eine Aufgabe zu wiederholen.'")
            ip.locator('#louvre-lang').select_option('ar')
            assert ip.locator('#capture-title').inner_text() == 'ما الذي يجب ألا ننساه؟'
            assert not errors, errors
            intl.close(); context.close(); browser.close()
            print('BROWSER PASS: local date capture, image, persistence, edit, JSON export/import, calendar, completed task, offline PWA, 390px mobile, 7 languages, RTL, multilingual date parsing')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()