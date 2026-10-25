#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo 'Usage: bash evaluate-candidate.sh /path/to/candidate-snapshot-root' >&2
  exit 2
fi
BENCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANDIDATE="$(cd "$1" && pwd)"
APP="$CANDIDATE/labs/reservation-lab"
test -f "$APP/package.json" || { echo "Missing application at $APP" >&2; exit 2; }
# Operate on a temporary copy: never mutate the submitted candidate.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/app"
cp -R "$APP/." "$WORK/app/"
cp "$BENCH_DIR/evaluator/recovery.acceptance.test.mjs" "$WORK/app/tests/recovery.acceptance.test.mjs"
cd "$WORK/app"
npm install --no-audit --no-fund
# Compiler the candidate's domain; must include the new recovery-storage.ts file.
npm run test:domain
npm run build
npm run test:smoke
printf '\nPASS: tested domain, recovery evaluator, build and HTTP smoke in an isolated temporary copy.\n'
printf 'NOTICE: Browser UI after reload still requires independent manual/browser inspection.\n'