# 8-bit Redesign, Share URLs, Epub Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-page schedule generator into an 8-bit styled tool with shareable URLs, epub chapter import, weekday/start-date control and better day-filling.

**Architecture:** DOM-free ES modules (`chapters`, `schedule`, `export`, `share`, `zip`, `epub`) tested with `node --test`; a thin `ui.js`/`main.js` wires them to `index.html`. No build step, no runtime dependencies, hosted statically.

**Tech Stack:** Vanilla ES modules, Node >= 20 built-in test runner (dev only, `package.json` has no dependencies), `CompressionStream`/`DecompressionStream`, DotGothic16 font bundled in `fonts/`.

**Spec:** `docs/superpowers/specs/2026-11-26-8bit-redesign-design.md`

## Global Constraints

- No build step, no runtime dependencies, no server; must work from GitHub Pages and offline.
- Epub files are read locally only; nothing is uploaded.
- Keep the three existing modes (`per_day`, `per_week_chap`, `per_week_char`), the pasted "title + cumulative count" input, and the plain-text output line format `一章　タイトル 3. Dec (~3,500 chars)` (kanji: `toKanji(n)+'章'` + full-width space; english: `ch{n}` + space).
- Chapter lengths: skip chapters shorter than 100 chars; `roundedLength = Math.round(length/100)*100`.
- Dates are local calendar dates (`YYYY-MM-DD` strings in state/URL); never parse via UTC.
- Daily pace never below 1000 chars/day (see Task 2).
- Share state lives in the URL hash only: JSON → deflate → base64url.
- Pixel font with Japanese glyphs: DotGothic16, stored in `fonts/`.

## Review Focus

- Epub with no TOC / empty TOC / TOC pointing to missing files → falls through to next strategy, never throws.
- Chapter shorter than 100 chars, a book of 1 chapter, or an empty list → no crash, clear message.
- Reading-days set with zero days selected → UI blocks generation with a message; schedule never loops forever.
- Share link with garbage/truncated hash or unknown `v` → app shows an error and falls back to the editor.
- Titles containing `#`, `&`, quotes, emoji or Japanese round-trip exactly through the share link.
- Ruby `<rt>` text and whitespace are not counted in epub character counts.

---

## File Structure

- `index.html` — markup shell, loads `js/main.js` and `css/8bit.css`.
- `css/8bit.css`, `fonts/DotGothic16-Regular.ttf` — styling.
- `js/chapters.js` — parse pasted input, chapter labels.
- `js/schedule.js` — date helpers and the three scheduling modes.
- `js/export.js` — text and .ics output.
- `js/share.js` — encode/decode state to URL hash.
- `js/zip.js`, `js/epub.js` — zip reading, epub chapter detection.
- `js/ui.js`, `js/main.js` — DOM rendering and events.
- `tests/*.test.js`, `tests/helpers/makeEpub.js` — tests and fixture builder.
- `package.json` — `{"type":"module","scripts":{"test":"node --test tests/"}}`.

### Task 1: Chapters module and project scaffolding

**Files:**
- Create: `package.json`, `js/chapters.js`, `tests/chapters.test.js`

**Interfaces:**
- Produces:
  - `type Chapter = {index:number, title:string, length:number, roundedLength:number}`
  - `parseCumulative(raw: string): Chapter[]` — same pairing logic as old `generateSchedule` (title line, count line; length = next count − this count; last pair is only the end marker; skip NaN and `length < 100`; `index` counts kept chapters from 1).
  - `toKanji(n:number): string`
  - `chapterLabel(index:number, format:'kanji'|'english'): string` → `一章` / `ch1`
  - `labelSeparator(format): string` → `'　'` / `' '`

- [ ] **Step 1: Write failing tests** in `tests/chapters.test.js`: `parseCumulative("表紙\n0\nプロローグ\n252\n一章\n3900\nEnd\n7000")` returns 3 chapters with `roundedLength` 300 (表紙), 3600 (プロローグ), 3100 (一章) — the final "End" pair is only the end marker; a 50-char chapter is skipped and does not consume an index; `toKanji(1|10|11|20|21)` → `一|十|十一|二十|二十一`; `chapterLabel(3,'english')==='ch3'`.
- [ ] **Step 2: Run** `node --test tests/` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `js/chapters.js` by lifting `toKanji`, `getChapterPrefix` and the pre-processing loop from the old `index.html` (lines 123–201), parameterised instead of reading the DOM. Add `package.json`.
- [ ] **Step 4: Run** `node --test tests/` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: chapters module and test scaffolding`

### Task 2: Schedule engine

**Files:**
- Create: `js/schedule.js`, `tests/schedule.test.js`

**Interfaces:**
- Consumes: `Chapter` from Task 1.
- Produces:
  - `type Settings = {mode:'per_day'|'per_week_chap'|'per_week_char', startDate:string, readingDays:number[] /*0=Sun..6=Sat, non-empty*/, dailyTarget:number, chaptersPerWeek:number, maxOvershoot:number, targetEndDate?:string}`
  - `type DayEntry = {chapter:Chapter, start:string, end:string}` (per_day)
  - `type Week = {n:number, start:string, end:string, chapters:Chapter[], total:number, avgPerDay:number, warning?:string, note?:string}` (week modes)
  - `type Schedule = {mode, entries?:DayEntry[], weeks?:Week[], finishDate:string, totalChars:number, readingDaysUsed:number}`
  - `buildSchedule(chapters: Chapter[], settings: Settings): Schedule` — throws `Error('no-reading-days')` if `readingDays` empty, `Error('no-chapters')` if no chapters.
  - `nextReadingDay(date:string, readingDays:number[], inclusive:boolean): string`
  - `addDays(date:string, n:number): string`, `weekdayName(date:string): string`, `formatDate(date:string): string` → `3. Dec`
  - `paceForEndDate(chapters, settings): number` — daily target (rounded to 100) that makes `per_day` finish on `targetEndDate`; found by search over targets.

- [ ] **Step 1: Write failing tests**: (a) per_day with target 3000, chapters 4300/3700 → combined leftover logic: with the TODO rule ("days = ceil(len/goal); leftover += days*goal − len; when leftover > goal + 1000, subtract one day from the most recent chapter and leftover −= goal") 4300+3700 uses 3 days not 4; (b) a chapter never gets fewer than 1 day and never a rate under 1000 chars/day; (c) short chapters group on one day up to `dailyTarget + 500` as before; (d) `readingDays=[1,2,3,4,5]` starting on a Saturday yields entries beginning Monday and no entry ever covers a Sat/Sun; (e) `per_week_chap` with 5 chapters/week gives weeks of 5 and `avgPerDay = round(total/readingDays.length/100)*100`; (f) `per_week_char` honours `maxOvershoot` and sets `warning` when exceeded, last week gets `note` `book ends` / `+N extra days` as in the old `formatWeekEndDate`; (g) `finishDate` equals the last entry/week end; (h) `paceForEndDate` result, fed back through `buildSchedule`, finishes on or before `targetEndDate`; (i) empty `readingDays` throws `no-reading-days`.
- [ ] **Step 2: Run** `node --test tests/schedule.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement `buildSchedule` and helpers.** Port grouping (`tryGroupChapters`), week grouping (`groupChaptersForWeek`) and end-of-book labels from old `index.html` lines 227–430 as pure functions; add the leftover-carry rule above for per_day and apply `nextReadingDay` whenever a day is consumed. Date math uses `Date` constructed from `y,m-1,d` local components. Week modes keep 7-calendar-day weeks; non-reading days are shown as rest days via `avgPerDay` dividing by `readingDays.length`.
- [ ] **Step 4: Run** tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat: schedule engine with weekdays and leftover fill`

### Task 3: Export (text, .ics)

**Files:**
- Create: `js/export.js`, `tests/export.test.js`

**Interfaces:**
- Consumes: `Schedule`, `Settings` (Task 2), `labelSeparator`/`chapterLabel` (Task 1).
- Produces:
  - `toText(schedule: Schedule, opts:{format:'kanji'|'english', title?:string}): string` — per_day lines exactly `一章　タイトル 3. Dec-5. Dec (~3,600 chars)` (single date when start==end, grouped chapters repeat the date); week modes emit `WEEK n (3. Dec - 9. Dec)` headers, chapter lines, `total reading: X chars ≈ Y chars per day`. Weekday prefix is **not** added to keep the legacy format.
  - `toIcs(schedule: Schedule, opts:{format, title:string}): string` — RFC 5545, one all-day `VEVENT` per entry/week, CRLF line endings, `UID`s stable, text escaped (`,` `;` `\n`).

- [ ] **Step 1: Write failing tests** with a fixed small schedule: exact expected `toText` lines for kanji and english; `toIcs` starts with `BEGIN:VCALENDAR`, has `VEVENT` count = entries, uses `DTSTART;VALUE=DATE:20261203`, `DTEND` exclusive (end+1), escapes a title containing `,;`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** both functions.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: text and ics export`

### Task 4: Share URL

**Files:**
- Create: `js/share.js`, `tests/share.test.js`

**Interfaces:**
- Consumes: `Chapter`, `Settings`.
- Produces:
  - `type ShareState = {title:string, chapters:{title:string,length:number}[], settings:Settings, format:'kanji'|'english'}`
  - `async encodeState(state: ShareState): Promise<string>` — hash payload (no leading `#`): `v1.` + base64url(deflate-raw(JSON `{v:1, ...}`)). Chapters stored as compact `[title,length]` pairs.
  - `async decodeState(payload: string): Promise<ShareState>` — throws `Error('bad-share-link')` on malformed input, wrong version, or failed decompression.

- [ ] **Step 1: Write failing tests**: round-trip equality for a state with titles `日本語 #1 & "q" 😀`; payload contains only `[A-Za-z0-9_-.]`; 60 chapters encode to under 2000 chars; `decodeState('v1.@@@')`, `''`, and a truncated valid payload each reject with `bad-share-link`; `v2.` prefix rejects.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with `CompressionStream('deflate-raw')` via `Response`/`Blob` piping and `TextEncoder`; base64url without padding.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: share URL encoding`

### Task 5: Zip reader and epub chapter detection

**Files:**
- Create: `js/zip.js`, `js/epub.js`, `tests/helpers/makeEpub.js`, `tests/epub.test.js`

**Interfaces:**
- Produces:
  - `async readZip(buf: ArrayBuffer): Promise<Map<string, () => Promise<Uint8Array>>>` — parses the central directory (end-of-central-directory record, handles stored(0) and deflate(8) entries; throws `Error('bad-zip')` otherwise).
  - `type Detection = {method:'toc'|'spine'|'headings'|'patterns', chapters:{title:string,length:number}[]}`
  - `async loadEpub(buf: ArrayBuffer): Promise<{bookTitle:string, detections: Detection[], totalChars:number, units: {href:string, text:string, headings:{title:string, offset:number}[]}[]}>` — `detections` only contains methods that produced ≥ 2 chapters, ordered by preference toc → spine → headings → patterns.
  - `countChars(html: string): number` — strips tags, removes `<rt>`/`<rp>` content, removes all whitespace.
  - `splitAtMarkers(units, markers:{unit:number,offset:number,title:string}[]): {title:string,length:number}[]` — backing for manual splitting.
  - `tests/helpers/makeEpub.js`: `makeEpub({toc:'nav'|'ncx'|'none', files:{href:string,html:string}[]}): Promise<ArrayBuffer>` building a valid epub with Node `zlib.deflateRawSync`.

- [ ] **Step 1: Write failing tests** using generated epubs: (a) nav TOC with 3 entries → `toc` detection, lengths match `countChars`; (b) NCX-only epub works; (c) no TOC but 3 spine files → `spine`; (d) no TOC, one file with `<h2>` headings → `headings`; (e) one file with plain `第一章`/`第二章` lines and no tags → `patterns`; (f) a TOC pointing to a missing file → falls through, no throw; (g) `countChars('<p>漢<ruby>字<rt>かんじ</rt></ruby> a b</p>')===3`... precisely: `漢字ab` → 4; (h) `readZip` of garbage rejects `bad-zip`; (i) fragment hrefs (`ch1.xhtml#s2`) split a single file at the anchor.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `zip.js` (own parser, `DecompressionStream('deflate-raw')`) and `epub.js` (container.xml → OPF → manifest/spine; nav `<nav epub:type="toc">` then NCX; parse with `DOMParser` in browser — tests run under Node, so use a tiny regex-based XML/HTML tag scanner exported from `epub.js` instead of `DOMParser`, so the same code runs in both).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: epub import with multiple chapter detection strategies`
- [ ] **Step 6 (manual):** user supplies real epubs; run a small Node script printing detections per book and fix mis-detections (add fixtures only if the user permits).

### Task 6: 8-bit UI and wiring

**Files:**
- Create: `css/8bit.css`, `fonts/DotGothic16-Regular.ttf`, `js/ui.js`, `js/main.js`
- Modify: `index.html` (replace entirely; remove inline script/style)

**Interfaces:**
- Consumes: everything above.
- Produces: `main.js` boots the page: on load, if `location.hash` has a payload → `decodeState` → render read-only view; else show editor. `ui.js` exports `renderEditor(root, state, handlers)`, `renderSchedule(root, schedule, state, {readonly})`.

- [ ] **Step 1: Layout.** Editor steps as numbered pixel panels: ① BOOK (paste list **or** drop epub; detection dropdown with chapter-count/length preview and manual-split option; editable chapter table to rename/merge/remove), ② PACE (mode, target, weekday toggle buttons Mon–Sun, start date, optional end date), ③ SCHEDULE (live-updating result, header "FINISH: Thu 14. Jan", days total). Buttons: COPY TEXT, SHARE LINK (copies URL, shows length), PRINT, .ICS.
- [ ] **Step 2: Style.** Palette of 4–6 colours, DotGothic16 at integer pixel sizes, 2–4px hard borders, `image-rendering: pixelated`, no border-radius/shadows blur, `:focus-visible` outlines, respects `prefers-reduced-motion`, contrast ≥ 4.5:1, print stylesheet (plain black on white).
- [ ] **Step 3: Read-only view.** Shared link shows title, finish date, day list with weekday, today's row highlighted when within range, and a REMIX button loading the state into the editor (clears hash).
- [ ] **Step 4: Errors.** Zero reading days, empty list, bad epub, bad share link each show an inline pixel-styled message; nothing throws to the console uncaught.
- [ ] **Step 5: Verify manually** with `python -m http.server` or equivalent in the browser: paste sample (old placeholder), generate in all three modes, share link round-trip in a fresh tab, drop a test epub, mobile width 375px layout, print preview. Expected: all work without console errors.
- [ ] **Step 6: Commit** `feat: 8-bit UI, share links and epub drop zone`

### Task 7: Docs and cleanup

**Files:**
- Create: `README.md`
- Modify: remove `TODO` content already implemented (keep file if the user wants it; ask first)

- [ ] **Step 1:** README: what it is, how sharing works (URL hash, no server), epub detection order, `node --test tests/`, how to host on GitHub Pages.
- [ ] **Step 2:** Run `node --test tests/` — Expected: all PASS.
- [ ] **Step 3: Commit** `docs: readme`
