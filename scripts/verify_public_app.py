#!/usr/bin/env python3
"""Check that a published/local Louvre app response is the intended app.

This catches HTTP 200 fallback/error pages and missing core.js without relying
on the now-obsolete "Louvre App Factory" branding (v2 designs have new labels).
Uses stdlib only; safe for CI without third-party parsers.
"""
from __future__ import annotations
import argparse
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.html = False
        self.in_title = False
        self.title = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag == "html":
            self.html = True
        if tag == "title":
            self.in_title = True
        if tag == "script":
            options = dict(attrs)
            if options.get("src"):
                self.scripts.append(options["src"])

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)


def verify(slug: str, html: bytes, core: bytes) -> None:
    if not re.fullmatch(r"[a-z][a-z0-9-]{1,59}", slug):
        raise ValueError("slug invalide")
    if len(html) < 100 or len(core) < 40:
        raise ValueError("réponse HTML ou JavaScript absente/incomplète")
    try:
        raw_html = html.decode("utf-8-sig")
        js = core.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("réponse non UTF-8") from exc
    parsed = Page()
    parsed.feed(raw_html)
    parsed.close()
    if not parsed.html:
        raise ValueError("la réponse ne contient pas de document HTML")
    normalized_title = re.sub(r"[^a-z0-9]", "", "".join(parsed.title).casefold())
    normalized_slug = re.sub(r"[^a-z0-9]", "", slug.casefold())
    if normalized_slug not in normalized_title:
        raise ValueError(f"titre incorrect pour {slug}: {''.join(parsed.title).strip()!r}")
    if not any(src.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1] == "core.js"
               for src in parsed.scripts):
        raise ValueError("la page ne référence pas core.js")
    if not js.strip() or re.match(r"\s*(?:<!doctype\b|<html\b)", js, re.I):
        raise ValueError("réponse JavaScript remplacée par une page HTML")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--html", type=Path, required=True)
    parser.add_argument("--core", type=Path, required=True)
    args = parser.parse_args()
    try:
        verify(args.slug, args.html.read_bytes(), args.core.read_bytes())
    except (ValueError, OSError) as exc:
        print(f"PUBLIC_APP_VERIFY_FAIL {args.slug}: {exc}", file=sys.stderr)
        return 1
    print(f"PUBLIC_APP_VERIFY_PASS {args.slug}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
