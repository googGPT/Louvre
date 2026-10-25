#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
BASE_SHA="99f8e56343a6c3c265d25a290a29ff3863d9442e"
OUT="${1:-$ROOT/experiments/codex-ab-01/dist}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
A="$OUT/arm-a-without-louvre"
B="$OUT/arm-b-with-louvre"
rm -rf "$A" "$B"
mkdir -p "$A" "$B"

git -C "$ROOT" cat-file -e "$BASE_SHA^{commit}"
git -C "$ROOT" archive "$BASE_SHA" labs/reservation-lab | tar -xf - -C "$A"
git -C "$ROOT" archive "$BASE_SHA" labs/reservation-lab technical-library AGENTS.md .agents | tar -xf - -C "$B"
cp "$ROOT/experiments/codex-ab-01/TASK.md" "$A/TASK.md"
cp "$ROOT/experiments/codex-ab-01/TASK.md" "$B/TASK.md"

# Only the reference library and agent instructions may differ.
diff -qr "$A/labs/reservation-lab" "$B/labs/reservation-lab"
cmp "$A/TASK.md" "$B/TASK.md"
test ! -e "$A/AGENTS.md"
test ! -e "$A/technical-library"
test -f "$B/AGENTS.md"
test -f "$B/technical-library/INDEX.md"
if find "$A" "$B" -type f \( -iname '*.pdf' -o -iname '*.epub' \) | grep -q .; then
  echo 'ERROR: copyrighted book files detected in snapshots' >&2
  exit 1
fi

# Manifests for comparing exactly the application code in both arms.
(cd "$A" && find labs/reservation-lab -type f -print0 | sort -z | xargs -0 sha256sum) > "$OUT/app-sha256-a.txt"
(cd "$B" && find labs/reservation-lab -type f -print0 | sort -z | xargs -0 sha256sum) > "$OUT/app-sha256-b.txt"
cmp "$OUT/app-sha256-a.txt" "$OUT/app-sha256-b.txt"
(
  cd "$OUT"
  tar -czf arm-a-without-louvre.tar.gz arm-a-without-louvre
  tar -czf arm-b-with-louvre.tar.gz arm-b-with-louvre
  sha256sum arm-a-without-louvre.tar.gz arm-b-with-louvre.tar.gz
)
cat <<'MESSAGE'
PASS: same application at frozen commit, same TASK.md.
A contains no Louvre reference library or AGENTS.md.
B includes the library and AGENTS.md.
Snapshots exclude the independent evaluator and copyrighted PDF books.
No Codex execution or outcome measurement is implied.
MESSAGE