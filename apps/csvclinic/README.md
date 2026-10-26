# CSVClinic v2 — Louvre application 26 (Wave 2, 06/20)

## Audit initial
The app already existed on branch codex/louvre-wave2-06-csvclinic (PR #42), despite the initial main registry describing only a proposal. The original implementation had these issues:

- Editing the source or cleaning options did not invalidate the previously computed export.
- Failed parsing left stale preview rows and statistics on screen.
- Separator detection considered essentially the first record, missing later structural evidence.
- Source-size validation counted JavaScript characters instead of UTF-8 bytes.
- First-column deduplication removed distinct records with empty IDs.
- Spreadsheet-formula mitigation did not account for invisible leading characters.
- Only 16 basic domain tests plus a minimal browser scenario existed.

## v2 capabilities
- Local parsing of comma, semicolon or tab separated CSV, with multiple-record delimiter inference.
- Escaped double-quotes, quoted embedded delimiters, multiline cells, LF/CRLF/CR end of line and UTF-8 BOM.
- Strict 1,050,000-byte UTF-8 input limit, up to 40 columns, 5,000 data rows. Validate uniform column counts and nonempty, unique column headings after optional trimming.
- Deduplication by all columns, first column or none. Empty first-column IDs are retained with an explicit warning rather than silently collapsed.
- Preview of up to 50 records, source/retained/removed statistics, chosen delimiter and explanatory warnings.
- Immediate invalidation of results, statistics and downloadable data on any input or setting change.
- Local file upload with size guard and asynchronous revision token so an outdated read cannot overwrite a newer edit.
- UTF-8 BOM and CRLF CSV exports, escaped quotes and formula-risk mitigation; no server, backend, paid API or hidden data storage.
- Offline service worker caches only static application resources and removes old CSVClinic-version caches.

## Security and quality caveats
To reduce spreadsheet-formula injection risk, exported cells beginning (possibly after leading spaces or certain invisible characters) with =, +, - or @ are prefixed with an apostrophe. This intentionally CHANGES the output value, and is not a universal defense across all spreadsheet importers. Keep the original CSV when exact raw values matter. CSV parsing is not a type-inference, formula execution, date formatting or universal dialect-recognition service. The Excel separator directive sep=; is not implemented.

Trimming and any deduplication can change data meaning. First-column deduplication should only be used for a truly unique identifier; blank identifiers are preserved. All operations run in browser memory, no localStorage, no telemetry, no upload. Browser/OS storage, download handling and privacy remain subject to device settings.

## Run the tests
node --check apps/csvclinic/core.js
node --check apps/csvclinic/app.js
node --check apps/csvclinic/sw.js
node --test apps/csvclinic/tests/core.test.cjs
python apps/csvclinic/tests/browser.test.py

Chromium tests cover embedded quoted newlines, BOM, independent export bytes, spreadsheet neutralization, stale export prevention, failed imports, empty IDs, DOM XSS safety, 390px mobile rendering and PWA offline reload. Passing CI is only claimed after checking the final GitHub Actions result.

## Louvre references
Five existing repository notes were examined: TS16-001, FULL08-001, NEXT10-001, VUE07-001 and GHA04-001. The CSV logic and security measures are original design applications, not claims from those books. PDF page references are sourced from the repository notes, not from newly opened books.

PR: https://github.com/googGPT/Louvre/pull/42
Do not merge to main without authorization.
