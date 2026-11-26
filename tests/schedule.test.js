import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, nextReadingDay, addDays, weekdayName, formatDate, paceForEndDate } from "../js/schedule.js";

const ALL = [0, 1, 2, 3, 4, 5, 6];
const mk = lens => lens.map((len, i) => ({ index: i + 1, title: "T" + (i + 1), length: len, roundedLength: len }));
const base = { mode: "per_day", startDate: "2026-12-03", readingDays: ALL, dailyTarget: 3000, chaptersPerWeek: 5, maxOvershoot: 500 };

test("date helpers", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(formatDate("2026-12-03"), "3. Dec");
  assert.equal(weekdayName("2026-12-03"), "Thu");
  assert.equal(nextReadingDay("2026-12-05", [1, 2, 3, 4, 5], true), "2026-12-07");
  assert.equal(nextReadingDay("2026-12-07", [1, 2, 3, 4, 5], true), "2026-12-07");
  assert.equal(nextReadingDay("2026-12-07", [1, 2, 3, 4, 5], false), "2026-12-08");
});

test("per_day: leftover carry removes a gap day (4300 + 3700 at 3000/day = 3 days)", () => {
  const s = buildSchedule(mk([4300, 3700]), base);
  assert.deepEqual(s.entries.map(e => [e.start, e.end]), [["2026-12-03", "2026-12-04"], ["2026-12-05", "2026-12-05"]]);
  assert.equal(s.finishDate, "2026-12-05");
});

test("per_day: never below 1 day and never below 1000 chars/day", () => {
  const s = buildSchedule(mk([100, 2500]), { ...base, dailyTarget: 1000 });
  const long = s.entries.find(e => e.chapter.index === 2);
  assert.equal(long.start === long.end, false);
  assert.equal(addDays(long.start, 1), long.end); // 2500/1000 -> 2 days, not 3
});

test("per_day: short chapters group on one day up to target+500", () => {
  const s = buildSchedule(mk([1000, 1000, 1000, 1000]), base);
  assert.deepEqual(s.entries.map(e => e.start), ["2026-12-03", "2026-12-03", "2026-12-03", "2026-12-04"]);
});

test("per_day: weekdays skip non-reading days", () => {
  const s = buildSchedule(mk([3000, 3000, 3000]), { ...base, startDate: "2026-12-05", readingDays: [1, 2, 3, 4, 5] });
  assert.deepEqual(s.entries.map(e => e.start), ["2026-12-07", "2026-12-08", "2026-12-09"]);
});

test("per_week_chap: chunks of N chapters, 7 calendar days per week", () => {
  const s = buildSchedule(mk(Array(7).fill(3500)), { ...base, mode: "per_week_chap" });
  assert.equal(s.weeks.length, 2);
  assert.deepEqual([s.weeks[0].start, s.weeks[0].end, s.weeks[1].start], ["2026-12-03", "2026-12-09", "2026-12-10"]);
  assert.equal(s.weeks[0].chapters.length, 5);
  assert.equal(s.weeks[0].avgPerDay, 2500);
});

test("per_week_chap: average divides by number of reading days", () => {
  const s = buildSchedule(mk(Array(5).fill(3500)), { ...base, mode: "per_week_chap", readingDays: [1, 2, 3, 4, 5] });
  assert.equal(s.weeks[0].avgPerDay, 3500);
});

test("per_week_char: warning when average exceeds the allowance", () => {
  const s = buildSchedule(mk([30000]), { ...base, mode: "per_week_char" });
  assert.ok(s.weeks[0].warning.includes("800"));
});

test("per_week_char: fills weeks up to target+overshoot", () => {
  const s = buildSchedule(mk([10000, 10000, 10000, 10000]), { ...base, mode: "per_week_char" });
  assert.deepEqual(s.weeks.map(w => w.chapters.length), [2, 2]);
});

test("per_week_char: last week notes 'book ends' and '+N extra days'", () => {
  const short = buildSchedule(mk([3000, 3000]), { ...base, mode: "per_week_char" });
  assert.equal(short.weeks[0].note, "book ends");
  assert.equal(short.weeks[0].end, "2026-12-04");
  const long = buildSchedule(mk([30000]), { ...base, mode: "per_week_char" });
  assert.equal(long.weeks[0].note, "+3 extra days");
  assert.equal(long.weeks[0].end, "2026-12-12");
  assert.equal(long.finishDate, "2026-12-12");
});

test("paceForEndDate finishes on/before the target, one step lower does not", () => {
  const chapters = mk(Array(20).fill(4000));
  const s0 = { ...base, targetEndDate: "2026-12-31" };
  const pace = paceForEndDate(chapters, s0);
  assert.ok(buildSchedule(chapters, { ...s0, dailyTarget: pace }).finishDate <= "2026-12-31");
  assert.ok(buildSchedule(chapters, { ...s0, dailyTarget: pace - 100 }).finishDate > "2026-12-31");
});

test("errors", () => {
  assert.throws(() => buildSchedule(mk([3000]), { ...base, readingDays: [] }), /no-reading-days/);
  assert.throws(() => buildSchedule([], base), /no-chapters/);
});

test("review: invalid pace settings and absurd chapter lengths throw bad-settings instead of hanging", () => {
  for (const patch of [{ chaptersPerWeek: 0, mode: "per_week_chap" }, { chaptersPerWeek: -2, mode: "per_week_chap" }, { dailyTarget: 0 }, { dailyTarget: 1e-9, mode: "per_week_char" }, { dailyTarget: NaN }, { maxOvershoot: -1 }]) {
    assert.throws(() => buildSchedule(mk([3000]), { ...base, ...patch }), /bad-settings/, JSON.stringify(patch));
  }
  assert.throws(() => buildSchedule(mk([1e12]), base), /bad-settings/);
});

test("review: per_week_char does not force the last chapter into an overfull week", () => {
  const s = buildSchedule(mk([20000, 20000]), { ...base, mode: "per_week_char", readingDays: [1, 3, 5] });
  assert.deepEqual(s.weeks.map(w => w.chapters.length), [1, 1]);
});

test("review: overshoot warning reports the excess over target+overshoot", () => {
  const s = buildSchedule(mk([30000]), { ...base, mode: "per_week_char" });
  assert.ok(s.weeks[0].warning.includes("800"), s.weeks[0].warning);
});

test("review: paceForEndDate returns null when the date cannot be reached", () => {
  assert.equal(paceForEndDate(mk([3000, 3000]), { ...base, targetEndDate: "2026-11-01" }), null);
});
