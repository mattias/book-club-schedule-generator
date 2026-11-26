import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule } from "../js/schedule.js";
import { toText, toIcs } from "../js/export.js";

const ch = [
  { index: 1, title: "プロローグ", length: 3600, roundedLength: 3600 },
  { index: 2, title: "Two, Three; Four", length: 6100, roundedLength: 6100 },
];
const s = { mode: "per_day", startDate: "2026-12-03", readingDays: [0, 1, 2, 3, 4, 5, 6], dailyTarget: 3000, chaptersPerWeek: 5, maxOvershoot: 500 };

test("toText per_day kanji uses the legacy line format", () => {
  const sched = buildSchedule(ch, s);
  assert.equal(toText(sched, { format: "kanji" }),
    "一章　プロローグ 3. Dec (~3,600 chars)\n二章　Two, Three; Four 4. Dec-5. Dec (~6,100 chars)\n");
});

test("toText per_day english, single day shows one date", () => {
  const sched = buildSchedule([{ index: 1, title: "A", length: 2000, roundedLength: 2000 }], s);
  assert.equal(toText(sched, { format: "english" }), "ch1 A 3. Dec (~2,000 chars)\n");
});

test("toText week modes", () => {
  const sched = buildSchedule(ch, { ...s, mode: "per_week_chap" });
  assert.equal(toText(sched, { format: "english" }),
    "WEEK 1 (3. Dec - 9. Dec)\nch1 プロローグ (~3,600 chars)\nch2 Two, Three; Four (~6,100 chars)\ntotal reading: 9,700 chars ≈ 1,400 chars per day\n");
});

test("toIcs structure", () => {
  const sched = buildSchedule(ch, s);
  const ics = toIcs(sched, { format: "english", title: "My, Book", now: "20261126T000000Z" });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, 2);
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261203\r\n"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20261204\r\n")); // exclusive end
  assert.ok(ics.includes("My\\, Book"));
  assert.ok(ics.includes("Two\\, Three\\; Four"));
});

test("toIcs folds long lines to 75 octets without splitting characters", () => {
  const long = [{ index: 1, title: "漢".repeat(60), length: 3000, roundedLength: 3000 }];
  const ics = toIcs(buildSchedule(long, s), { format: "kanji", title: "t", now: "20261126T000000Z" });
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.ok(!ics.includes("�"));
});
