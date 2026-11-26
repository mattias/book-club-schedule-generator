# 8-bit redesign + shareable schedules + epub import — design

## Intent
A book club needs one simple schedule everyone can follow ("what pace do I
keep, when do we finish?"). Solo readers use it the same way. Nobody logs
reading in it. Today's tool is a single page that outputs plain text; it has
no sharing, no epub input, no weekdays, and can't be adjusted afterwards.

## Goals
- Shareable URL: whole schedule encoded in the URL hash (no server). Opening
  it shows a read-only schedule view with a "remix/edit" button.
- Epub import (client-side, nothing uploaded) with several chapter-detection
  strategies, always previewable/switchable, plus manual splitting.
  Pasted "title + cumulative count" input stays supported.
- User-set start date; selectable reading weekdays (other days skipped);
  dates shown with weekday.
- "Finish date" shown prominently; optionally pick a target end date and get
  the pace computed.
- Better filling logic from the user's TODO (carry leftover characters so days
  fill up; weekly mode caps daily average; never below ~1000 chars/day).
- Exports: copy as text (current format, chat-friendly), print, .ics calendar.
- 8-bit visual style, pixel font with Japanese support (DotGothic16, bundled
  locally so it works offline).

## Non-goals
Accounts, backend, short links, reading-progress logging, uploading books.

## Anti-goals
Anything that makes a shared link stop working offline or require a server;
losing the existing three modes or text output format.

## Constraints
Static hosting (GitHub Pages), no build step, no runtime dependencies.

## Approaches
A. Vanilla ES modules, no build (chosen by user). B. Vite+TS (extra tooling
for a tiny tool). C. Backend for short links (rejected: maintenance, data on a
server, against "simple").

## Decisions
- Layout: `index.html`, `css/`, `js/{schedule,epub,zip,share,export,ui}.js`,
  `fonts/`. Pure logic modules are DOM-free and tested with `node --test`.
- Share format: JSON `{v, title, chapters[[title,len]], settings}` →
  deflate (CompressionStream) → base64url in `#`.
- Epub chapter detection order: nav/NCX TOC → spine files → h1–h3 headings →
  title patterns (第N章, Chapter N, プロローグ/エピローグ) → manual. Character
  count strips tags, `<rt>` ruby, whitespace.
- Zip read via `DecompressionStream('deflate-raw')`, own minimal reader.

## Left to builder
Exact palette, pixel UI details, tuning constants in the fill algorithm,
test fixtures (user supplies epubs for testing).
