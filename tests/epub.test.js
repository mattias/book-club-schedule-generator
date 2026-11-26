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
