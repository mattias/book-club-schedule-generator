import test from "node:test";
import assert from "node:assert/strict";
import { parseCumulative, toKanji, chapterLabel, labelSeparator } from "../js/chapters.js";

test("parseCumulative pairs title+count and treats the last pair as end marker", () => {
  const ch = parseCumulative("表紙\n0\nプロローグ\n252\n一章\n3900\nEnd\n7000");
  assert.deepEqual(ch.map(c => c.roundedLength), [300, 3600, 3100]);
  assert.deepEqual(ch.map(c => c.index), [1, 2, 3]);
  assert.equal(ch[1].title, "プロローグ");
  assert.equal(ch[1].length, 3648);
});

test("chapters under 100 chars are skipped and do not consume an index", () => {
  const ch = parseCumulative("A\n0\nB\n50\nC\n1000\nEnd\n2000");
  assert.deepEqual(ch.map(c => [c.index, c.title]), [[1, "B"], [2, "C"]]);
});

test("empty or garbage input gives no chapters", () => {
  assert.deepEqual(parseCumulative(""), []);
  assert.deepEqual(parseCumulative("only a title"), []);
});

test("toKanji", () => {
  assert.deepEqual([1, 10, 11, 20, 21].map(toKanji), ["一", "十", "十一", "二十", "二十一"]);
});

test("labels", () => {
  assert.equal(chapterLabel(3, "english"), "ch3");
  assert.equal(chapterLabel(3, "kanji"), "三章");
  assert.equal(labelSeparator("kanji"), "　");
  assert.equal(labelSeparator("english"), " ");
});

test("chaptersFromList numbers, rounds and drops chapters under 100 chars", async () => {
  const { chaptersFromList } = await import("../js/chapters.js");
  const ch = chaptersFromList([{ title: "a", length: 50 }, { title: "b", length: 3640 }, { title: "c", length: 1000 }]);
  assert.deepEqual(ch, [
    { index: 1, title: "b", length: 3640, roundedLength: 3600 },
    { index: 2, title: "c", length: 1000, roundedLength: 1000 },
  ]);
});

test("review: toKanji handles 100-999", () => {
  assert.deepEqual([100, 105, 110, 120, 150, 200, 999].map(toKanji), ["百", "百五", "百十", "百二十", "百五十", "二百", "九百九十九"]);
});
