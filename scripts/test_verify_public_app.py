"""Regression tests for the generic Louvre public-site smoke verifier."""
import unittest
from verify_public_app import verify

JS = b"/* Valid application core */\nwindow.LouvreApp={version:1};\n"
OLD = b"""<!doctype html><html lang="fr"><head><title>SplitFair - Louvre App Factory</title></head><body><main><h1>App</h1><script src="./core.js"></script></main></body></html>"""
MODERN = b"""<!doctype html><html lang="fr"><head><title>DecisionDeck — Comparateur multicrit\xc3\xa8re</title></head><body><main><h1>Version 2</h1><script src="core.js?v=2"></script></main></body></html>"""
EVENT = b"""<!doctype html><html lang="fr"><head><title>EventCount — Invitations et budget</title></head><body><div>App</div><script src="./core.js"></script></body></html>"""

class PublicAppTest(unittest.TestCase):
    def test_legacy_brand_is_accepted(self):
        verify("splitfair", OLD, JS)

    def test_rebranded_modern_design_is_accepted(self):
        verify("decisiondeck", MODERN, JS)

    def test_app_with_no_main_element_remains_acceptable(self):
        verify("eventcount", EVENT, JS)

    def test_wrong_site_cannot_masquerade_as_200_response(self):
        with self.assertRaisesRegex(ValueError, "titre incorrect"):
            verify("decisiondeck", OLD, JS)

    def test_html_404_returned_instead_of_javascript_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "remplacée"):
            verify("splitfair", OLD, b"<html><title>404</title>" + b"!"*50)

    def test_missing_script_tag_fails(self):
        doc=MODERN.replace(b'<script src="core.js?v=2"></script>',b'<p>missing script</p>')
        with self.assertRaisesRegex(ValueError, "core.js"):
            verify("decisiondeck", doc, JS)

    def test_title_must_exist_and_match_slug(self):
        doc=MODERN.replace(b"DecisionDeck",b"OtherTool")
        with self.assertRaisesRegex(ValueError, "titre incorrect"):
            verify("decisiondeck", doc, JS)

    def test_empty_script_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "incomplète"):
            verify("decisiondeck", MODERN, b"")

    def test_invalid_slug_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "slug invalide"):
            verify("../decisiondeck", MODERN, JS)

    def test_binary_non_utf8_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "UTF-8"):
            verify("splitfair", OLD, b"\xff"*60)

if __name__ == "__main__":
    unittest.main()
