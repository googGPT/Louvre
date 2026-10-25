#!/usr/bin/env python3
"""Fail if Louvre's 70 chapters are not represented by at least one fiche.

A chapter having a fiche is NOT equivalent to exhaustive study of its pages.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"TS": 16, "FULL": 16, "NEXT": 14, "VUE": 10, "GHA": 14}
FILE_ID = re.compile(r"^(TS|FULL|NEXT|VUE|GHA)(\d{2})-\d{3}-.+\.md$")


def audit(root: Path = ROOT) -> list[str]:
    problems = []
    counts = {k: set() for k in EXPECTED}
    for f in (root / "technical-library" / "concepts").rglob("*.md"):
        m = FILE_ID.fullmatch(f.name)
        if m:
            name, n = m.group(1), int(m.group(2))
            if 1 <= n <= EXPECTED[name]:
                counts[name].add(n)
            else:
                problems.append(f"Chapter out of range: {f.relative_to(root)}")
    for name, total in EXPECTED.items():
        missing = sorted(set(range(1, total + 1)) - counts[name])
        if missing:
            problems.append(f"{name}: no fiche for chapters {missing}")
    index = (root / "technical-library" / "INDEX.md").read_text(encoding="utf-8")
    for name, nums in counts.items():
        for number in sorted(nums):
            key = f"{name}{number:02d}-"
            if key not in index:
                problems.append(f"Index does not mention {key}")
    return problems


if __name__ == "__main__":
    errs = audit()
    if errs:
        print("Louvre chapter coverage check failed:", *errs, sep="\n- ")
        sys.exit(1)
    print("Louvre chapter coverage check passed: 70/70 chapters have at least one fiche (partial coverage).")