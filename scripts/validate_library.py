#!/usr/bin/env python3
"""Validate the Louvre knowledge index and local Markdown references.

This is a structural integrity check. It does NOT verify claims against
the books, execute application examples, or certify production readiness.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "technical-library"
INDEX = LIBRARY / "INDEX.md"
CONCEPTS = LIBRARY / "concepts"

LINK = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
FILE_ID = re.compile(r"^([A-Z]{2,6}\d{2}-\d{3})-.+\.md$")
DECLARED_ID = re.compile(r"\*\*Identifiant unique\s*:\*\*\s*`([^`]+)`", re.I)


def validate(root: Path = ROOT) -> list[str]:
    library = root / "technical-library"
    index = library / "INDEX.md"
    concepts = library / "concepts"
    errors: list[str] = []

    if not index.is_file():
        return [f"Missing index: {index}"]
    if not concepts.is_dir():
        return [f"Missing concepts directory: {concepts}"]

    actual: dict[str, Path] = {}
    for doc in sorted(concepts.rglob("*.md")):
        match = FILE_ID.fullmatch(doc.name)
        if not match:
            errors.append(f"Invalid concept filename: {doc.relative_to(root)}")
            continue
        identifier = match.group(1)
        if identifier in actual:
            errors.append(f"Duplicate concept ID {identifier}: {doc} and {actual[identifier]}")
        actual[identifier] = doc
        body = doc.read_text(encoding="utf-8")
        ids = DECLARED_ID.findall(body)
        if not ids or ids[0] != identifier:
            errors.append(f"Concept {doc.relative_to(root)} must declare ID {identifier}")
        if not re.search(r"`SRC-00[1-5]`", body):
            errors.append(f"Missing catalogue source SRC-001..005: {doc.relative_to(root)}")

    references: set[Path] = set()
    for markdown in [*root.glob("*.md"), *library.rglob("*.md"), *(root / ".agents").rglob("*.md")]:
        text = markdown.read_text(encoding="utf-8")
        for raw in LINK.findall(text):
            href = raw.split("#", 1)[0].strip().split("?", 1)[0]
            if not href or href.startswith(("http://", "https://", "mailto:", "data:")):
                continue
            if href.startswith("/"):
                # Absolute URLs/paths are not required to resolve as local links.
                continue
            dest = (markdown.parent / href).resolve()
            if not dest.is_relative_to(root.resolve()):
                errors.append(f"Escaping local path in {markdown.relative_to(root)}: {raw}")
                continue
            if not dest.exists():
                errors.append(f"Broken link in {markdown.relative_to(root)}: {raw}")
            if markdown == index and dest.is_relative_to(concepts.resolve()) and dest.suffix == ".md":
                references.add(dest)

    missing = set(actual.values()) - references
    extra = references - set(actual.values())
    for doc in sorted(missing):
        errors.append(f"Unindexed concept: {doc.relative_to(root)}")
    for doc in sorted(extra):
        errors.append(f"Index references non-concept: {doc.relative_to(root)}")

    for forbidden in (*root.rglob("*.pdf"), *root.rglob("*.epub")):
        errors.append(f"Prohibited source publication: {forbidden.relative_to(root)}")
    return errors


if __name__ == "__main__":
    problems = validate()
    if problems:
        print(f"Louvre validation failed: {len(problems)} issue(s)")
        for problem in problems:
            print(f"- {problem}")
        sys.exit(1)
    print("Louvre structural validation passed (links, concept IDs, catalogue IDs, index).")