# Book Club Schedule

A tiny static web tool for setting a reading pace, alone or for a book club, and sharing it as one link. 8-bit style, no server, no accounts.

## Use it

1. **Book**: paste a list (`title` newline `cumulative character count`, last pair = end of book) or drop an `.epub`.
2. **Pace**: pick a mode, start date, and which weekdays you read. Optionally set a finish date and press CALC PACE.
3. **Schedule**: copy it as text, print it, download a `.ics` calendar, or press SHARE LINK.

### Share links

The whole schedule (titles, chapter lengths, settings) is compressed into the URL after `#`. Opening the link shows a read-only schedule with a REMIX button. Nothing is stored on a server, so links are fairly long.

### Epub chapter detection

Epubs are read in your browser; nothing is uploaded. Chapters are proposed in this order (the most balanced result is shown first), and you can switch between the ones that were found. Front and back matter such as 表紙, 目次 and 奥付 is left out:

1. Table of contents (nav or NCX)
2. One chapter per file in the reading order
3. Headings (h1-h3)
4. Title patterns (第N章, Chapter N, プロローグ ...)
5. Numbered sections: lines that are just 1, 2, 3 (also １, 一, Ⅰ)

If none fit, split at lines matching your own regular expression, then rename, merge or remove chapters in the chapter list. Ruby readings and whitespace are not counted.

## Develop

No build step. Serve the folder with any static server and open `index.html`.

```
deno test --allow-read tests/
```

The tests use `node:test`, so `node --test tests/` works as well.

Host on GitHub Pages by publishing the repository root.

`fonts/DotGothic16-Regular.ttf` is licensed under the SIL Open Font License (`fonts/OFL.txt`).
