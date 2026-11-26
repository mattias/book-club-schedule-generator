# Book Club Schedule

Static, no-build web tool that turns a book's chapter lengths into a reading schedule (solo or book club) and shares it as one URL. 8-bit look. Live at https://mattias.github.io/book-club-schedule-generator/ (GitHub Pages from `main`, repo `mattias/book-club-schedule-generator`, formerly `migaku-book-club-schedule-generator`; it is not Migaku-specific).

The user writes Swedish in chat; the UI, code and docs are English.

## Hard constraints

- No build step, no runtime dependencies, no server. Plain ES modules served as-is by Pages.
- Epubs are read locally in the browser and never uploaded.
- State lives in the URL hash only (no accounts, no storage).
- Keep the plain-text export format `一章　タイトル 3. Dec-5. Dec (~3,600 chars)`; people paste it into chats.
- Dates are local `YYYY-MM-DD` strings, never parsed through UTC.

## Layout

- `index.html`, `css/8bit.css`, `fonts/DotGothic16-Regular.ttf` (OFL, bundled so it works offline).
- `js/chapters.js` pasted-list parsing (`parseCumulative`), `chaptersFromList`, kanji/ch labels (`toKanji` handles 1-999).
- `js/schedule.js` the three modes (`per_day`, `per_week_chap`, `per_week_char`), weekdays, `paceForEndDate`. Pure; throws `no-reading-days`, `no-chapters`, `bad-settings`.
- `js/export.js` `toText`, `toIcs`.
- `js/share.js` `encodeState`/`decodeState` (JSON, deflate-raw, base64url, prefix `v1.`), `parseHash`, `editHash`. Values are range-checked on decode (crafted links must not hang the page).
- `js/zip.js`, `js/epub.js` zip reader and chapter detection (see below).
- `js/ui.js` all DOM (built with `h()`, never innerHTML), `js/main.js` hash routing.
- `tests/` one file per module; `tests/helpers/makeEpub.js` builds small epubs for tests.
- `docs/superpowers/specs|plans/` the original design and plan (history; the code has moved on).

## URL modes

`#` empty or `#edit` = new editor. `#edit/v1.<payload>` = editor restored (the editor rewrites this on every change, debounced). `#v1.<payload>` = read-only shared view with REMIX. SHARE LINK always produces the read-only form.

## Epub chapter detection (`loadEpub`)

Returns `{bookTitle, text, totalChars, units, detections}`. `text` is the whole book as plain text (no tags, ruby `<rt>` dropped, whitespace removed, `\n` at block boundaries which are not counted). Methods: `toc` (nav, then NCX; front/back matter like 表紙/目次/奥付 skipped), `spine` (one file = one chapter, files under 100 chars dropped), `headings` (h1-h3), `patterns` (第N章, Chapter N, プロローグ...), `numbers` (lines that are just 1, 2, 3 / １ / 一 / Ⅰ). Tiny segments (< 100 chars) are pruned for patterns/headings/numbers. Ordering: balanced results first (largest chapter <= 70% of text), and a result with at least 1.5x (and 2+) more chapters of 1000+ chars than the front-runner goes first. `markersFromRegex` is the manual escape hatch (custom regex in the UI).

Tuned on nine real Japanese epubs (light novels, literary novels). The user keeps their books on a NAS at `\\Hemma\data\Japanese\Book Sync\`; ask before copying any. When changing detection, re-test against a few of those and add a synthetic test in `tests/epub.test.js` for any new case.

## Working here

- Tests: `deno test --allow-read tests/` (Node is not installed on this machine; tests use `node:test` so `node --test tests/` also works). Run the whole suite before committing.
- The Bash tool halves doubled backslashes in heredocs/`sed`. For files containing backslashes (regexes, `\n` strings) use the Write/Edit tools.
- To look at the UI: serve the folder with any static server (for example a 10-line `Deno.serve` file server) and open it in the browser pane. After editing modules, force-refresh the cached modules (`fetch(url, {cache: 'reload'})`) or hard reload; Pages sends `Cache-Control: max-age=600`, so users need Ctrl+Shift+R after a deploy.
- Git: work on a branch, open a PR with `gh`, and merge only when the user says so ("merga"). Merge commits (`gh pr merge --merge`). Branch names used so far: `feature/...`, `fix/...`, `docs/...`.
- The untracked `TODO` file holds the user's original notes (their ideas for filling days); they are implemented in `schedule.js` (`perDay`). Do not commit or delete it without asking.

## Decisions worth remembering

- `per_day` leftover rule: drop a day from a chapter when accumulated slack >= max(goal - 1000, goal / 2) and the shortened rate stays <= goal + 1000; never below 1000 chars/day, never below 1 day. Short chapters group onto one day up to goal + 500.
- Week modes use 7 calendar days per week; "per reading day" averages divide by the number of selected reading days.
- Overshoot warning reports the excess over target + allowed overshoot.
- Epub flow: choose/replace button plus drop zone are primary; pasting a list is secondary. Replacing a book updates the title unless the user typed their own.

## Known gaps / ideas

- Edit-chapters table numbering can differ from schedule labels when chapters under 100 chars are dropped; the summary count does not refresh when a length is edited.
- Damaged epubs can surface raw `RangeError`/`TypeError` text instead of `bad-zip`.
- Epub tokenizer quirks: attribute values containing `>`, percent-encoded TOC fragments (`#%E7...`), pattern-detected titles lose spaces ("Chapter1TheBeginning"), spine titles fall back to file names like `part0004`.
- Epub-view state (which detection was chosen) is not stored in the URL, only the resulting chapters.
- Local folder is still named `migaku-book-club-schedule-generator`; renaming needs the session to be closed (Windows locks it).
- Group-reading ideas not built yet: per-person pace variants, catch-up/rest days, finish-by presets, a compact "this week" view.
