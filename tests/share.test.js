import test from "node:test";
import assert from "node:assert/strict";
import { encodeState, decodeState } from "../js/share.js";

const settings = {
  mode: "per_day", startDate: "2026-12-03", readingDays: [1, 2, 3, 4, 5],
  dailyTarget: 3000, chaptersPerWeek: 5, maxOvershoot: 500,
};
const state = (chapters) => ({ title: "日本語 #1 & \"q\" 😀", chapters, settings, format: "kanji" });

test("round-trips titles with special characters exactly", async () => {
  const s = state([{ title: "日本語 #1 & \"q\" 😀 100%", length: 3600 }, { title: "a/b?c=d", length: 1234 }]);
  assert.deepEqual(await decodeState(await encodeState(s)), s);
});

test("payload is URL-safe and versioned", async () => {
  const p = await encodeState(state([{ title: "x", length: 1000 }]));
  assert.match(p, /^v1\.[A-Za-z0-9_-]+$/);
});

test("a 60-chapter book stays under 2000 characters", async () => {
  const chapters = Array.from({ length: 60 }, (_, i) => ({ title: `第${i + 1}話 ${"あ".repeat(i % 7 + 1)}`, length: 2000 + ((i * 7919) % 4000) }));
  const p = await encodeState(state(chapters));
  assert.ok(p.length < 2000, `length ${p.length}`);
});

test("bad payloads reject with bad-share-link", async () => {
  const good = await encodeState(state([{ title: "x", length: 1000 }]));
  for (const bad of ["", "v1.@@@", "v1.", "v2.abc", "garbage", good.slice(0, good.length - 8), "v1." + btoa("not deflate").replace(/=/g, "")]) {
    await assert.rejects(() => decodeState(bad), /bad-share-link/, bad);
  }
});

test("valid compression but wrong shape rejects", async () => {
  // Encode something structurally wrong by tampering via the public API: settings with no reading days.
  const s = state([{ title: "x", length: 1000 }]);
  s.settings = { ...settings, readingDays: [] };
  await assert.rejects(async () => decodeState(await encodeState(s)), /bad-share-link/);
});
