import test from "node:test";
import assert from "node:assert/strict";
import { readZip } from "../js/zip.js";
import { loadEpub, countChars, markersFromRegex, lengthsFromMarkers } from "../js/epub.js";
import { makeEpub, makeZip } from "./helpers/makeEpub.js";

const A = n => "あ".repeat(n);
const p = s => `<p>${s}</p>`;
const three = [
  { href: "c1.xhtml", html: p(A(500)) },
  { href: "c2.xhtml", html: p(A(800)) },
  { href: "c3.xhtml", html: p(A(300)) },
];
const entries3 = [
  { title: "序", href: "c1.xhtml" },
  { title: "本編", href: "c2.xhtml" },
  { title: "終", href: "c3.xhtml" },
];
const methods = r => r.detections.map(d => d.method);

test("readZip reads stored and deflated entries", async () => {
  const zip = await readZip(makeZip([
    { name: "a.txt", data: "hello", store: true },
    { name: "dir/b.txt", data: "世界".repeat(100) },
  ]));
  assert.equal(new TextDecoder().decode(await zip.get("a.txt")()), "hello");
  assert.equal(new TextDecoder().decode(await zip.get("dir/b.txt")()), "世界".repeat(100));
});

test("readZip rejects garbage with bad-zip", async () => {
  await assert.rejects(() => readZip(new TextEncoder().encode("this is not a zip file at all").buffer), /bad-zip/);
});

test("countChars drops tags, ruby readings and whitespace", () => {
  assert.equal(countChars("<p>漢<ruby>字<rt>かんじ</rt></ruby> a b</p>"), 4);
  assert.equal(countChars("<p>a&amp;b&#12354;</p>"), 4);
});

test("toc (nav) is detected first with exact lengths", async () => {
  const r = await loadEpub(makeEpub({ toc: "nav", files: three, tocEntries: entries3 }));
  assert.equal(methods(r)[0], "toc");
  assert.deepEqual(r.detections[0].chapters, [
    { title: "序", length: 500 }, { title: "本編", length: 800 }, { title: "終", length: 300 },
  ]);
  assert.equal(r.bookTitle, "Test Book");
  assert.equal(r.totalChars, 1600);
});

test("toc (ncx only) works", async () => {
  const r = await loadEpub(makeEpub({ toc: "ncx", files: three, tocEntries: entries3 }));
  assert.equal(methods(r)[0], "toc");
  assert.deepEqual(r.detections[0].chapters.map(c => c.length), [500, 800, 300]);
});

test("no toc: spine files become chapters", async () => {
  const files = three.map((f, i) => ({ ...f, html: `<h1>Title ${i + 1}</h1>` + f.html }));
  const r = await loadEpub(makeEpub({ toc: "none", files }));
  assert.equal(methods(r)[0], "spine");
  assert.deepEqual(r.detections[0].chapters.map(c => c.title), ["Title 1", "Title 2", "Title 3"]);
  assert.equal(r.detections[0].chapters[0].length, 500 + "Title1".length);
});

test("no toc, one file: headings split it", async () => {
  const html = `<h2>One</h2>${p(A(400))}<h2>Two</h2>${p(A(600))}<h2>Three</h2>${p(A(200))}`;
  const r = await loadEpub(makeEpub({ files: [{ href: "all.xhtml", html }] }));
  assert.deepEqual(methods(r), ["headings"]);
  assert.deepEqual(r.detections[0].chapters, [
    { title: "One", length: 403 }, { title: "Two", length: 603 }, { title: "Three", length: 205 },
  ]);
});

test("no toc, no headings: title patterns split it", async () => {
  const html = p("第一章") + p(A(400)) + p("第二章") + p(A(600)) + p("エピローグ") + p(A(100));
  const r = await loadEpub(makeEpub({ files: [{ href: "all.xhtml", html }] }));
  assert.deepEqual(methods(r), ["patterns"]);
  assert.deepEqual(r.detections[0].chapters.map(c => [c.title, c.length]), [["第一章", 403], ["第二章", 603], ["エピローグ", 105]]);
});

test("toc pointing at missing files falls through without throwing", async () => {
  const bad = [{ title: "x", href: "nope1.xhtml" }, { title: "y", href: "nope2.xhtml" }, { title: "z", href: "nope3.xhtml" }];
  const r = await loadEpub(makeEpub({ toc: "nav", files: three, tocEntries: bad }));
  assert.equal(methods(r)[0], "spine");
});

test("fragment hrefs split a single file at the anchor", async () => {
  const html = `<h3 id="s1">A</h3>${p(A(300))}<h3 id="s2">B</h3>${p(A(500))}`;
  const r = await loadEpub(makeEpub({
    toc: "nav", files: [{ href: "ch.xhtml", html }],
    tocEntries: [{ title: "First", href: "ch.xhtml#s1" }, { title: "Second", href: "ch.xhtml#s2" }],
  }));
  assert.deepEqual(r.detections[0].chapters, [{ title: "First", length: 301 }, { title: "Second", length: 501 }]);
});

test("custom regex markers split the text", async () => {
  const html = p("#1 start") + p(A(100)) + p("#2 next") + p(A(50));
  const r = await loadEpub(makeEpub({ files: [{ href: "a.xhtml", html }] }));
  const markers = markersFromRegex(r.text, "^#\\d");
  assert.equal(markers.length, 2);
  assert.deepEqual(lengthsFromMarkers(r.text, markers).map(c => c.length), [107, 56]);
});

test("a book with a single flat file yields no detections, not an error", async () => {
  const r = await loadEpub(makeEpub({ files: [{ href: "a.xhtml", html: p(A(100)) }] }));
  assert.deepEqual(r.detections, []);
  assert.equal(r.totalChars, 100);
});

test("real-books: bare numeral lines (１, ２, Ⅰ, Ⅱ) split into numbered sections", async () => {
  const html = p("１") + p(A(400)) + p("２") + p(A(600)) + p("３") + p(A(200));
  const r = await loadEpub(makeEpub({ files: [{ href: "a.xhtml", html }] }));
  assert.deepEqual(methods(r), ["numbers"]);
  assert.deepEqual(r.detections[0].chapters, [{ title: "１", length: 401 }, { title: "２", length: 601 }, { title: "３", length: 201 }]);
  const roman = p("Ⅰ") + p(A(300)) + p("Ⅱ") + p(A(300));
  const r2 = await loadEpub(makeEpub({ files: [{ href: "a.xhtml", html: roman }] }));
  assert.deepEqual(r2.detections[0].chapters.map(c => c.title), ["Ⅰ", "Ⅱ"]);
});

test("real-books: numbered sections ignore a stray early list (tiny segments are pruned)", async () => {
  const html = p("１") + p("２") + p(A(300)) + p("１") + p(A(400)) + p("２") + p(A(500)) + p("３") + p(A(200));
  const r = await loadEpub(makeEpub({ files: [{ href: "a.xhtml", html }] }));
  assert.deepEqual(r.detections[0].chapters.map(c => c.length), [401, 501, 201]);
});

test("real-books: title patterns inside a contents page do not create tiny chapters", async () => {
  const html = p("第一章") + p("第二章") + p("第一章") + p(A(400)) + p("第二章") + p(A(500));
  const r = await loadEpub(makeEpub({ files: [{ href: "a.xhtml", html }] }));
  assert.deepEqual(r.detections[0].chapters.map(c => c.length), [403, 503]);
});

test("real-books: front/back matter TOC entries and object-replacement chars are cleaned", async () => {
  const files = [
    { href: "cover.xhtml", html: p(A(150)) }, { href: "c1.xhtml", html: p(A(500)) },
    { href: "c2.xhtml", html: p(A(800)) }, { href: "end.xhtml", html: p(A(250)) },
  ];
  const tocEntries = [{ title: "表紙", href: "cover.xhtml" }, { title: "￼ 一", href: "c1.xhtml" }, { title: "二", href: "c2.xhtml" }, { title: "奥付", href: "end.xhtml" }];
  const r = await loadEpub(makeEpub({ toc: "nav", files, tocEntries }));
  assert.deepEqual(r.detections[0].chapters, [{ title: "一", length: 500 }, { title: "二", length: 800 }]);
});

test("real-books: tiny spine files are not offered as chapters", async () => {
  const files = [{ href: "t.xhtml", html: p(A(10)) }, { href: "a.xhtml", html: p(A(500)) }, { href: "b.xhtml", html: p(A(400)) }];
  const r = await loadEpub(makeEpub({ files }));
  assert.deepEqual(r.detections.find(d => d.method === "spine").chapters.map(c => c.length), [500, 400]);
});

test("real-books: a lopsided detection is ranked after a balanced one", async () => {
  const files = [1, 2, 3, 4].map(i => ({ href: `c${i}.xhtml`, html: p(A(1500)) }));
  const tocEntries = [{ title: "A", href: "c1.xhtml" }, { title: "B", href: "c4.xhtml" }];
  const r = await loadEpub(makeEpub({ toc: "nav", files, tocEntries }));
  assert.deepEqual(methods(r), ["spine", "toc"]);
});
