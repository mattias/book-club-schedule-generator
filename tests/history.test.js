import test from "node:test";
import assert from "node:assert/strict";
import { HISTORY_KEY, MAX_ENTRIES, loadHistory, recordHistory, removeHistory } from "../js/history.js";

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("records one entry per name and updates it in place", () => {
  const s = memory();
  recordHistory("Club A", "v1.aaa", { now: 1, storage: s });
  recordHistory("Club B", "v1.bbb", { now: 2, storage: s });
  recordHistory("  club a ", "v1.ccc", { now: 3, storage: s });
  const list = loadHistory(s);
  assert.deepEqual(list.map(e => [e.name, e.payload]), [["club a", "v1.ccc"], ["Club B", "v1.bbb"]]);
});

test("renaming replaces the old entry, so typing a name does not leave fragments", () => {
  const s = memory();
  let at = recordHistory("N", "v1.a", { now: 1, storage: s });
  at = recordHistory("Na", "v1.b", { replaces: at, now: 2, storage: s });
  at = recordHistory("Nar", "v1.c", { replaces: at, now: 3, storage: s });
  assert.deepEqual(loadHistory(s).map(e => e.name), ["Nar"]);
});

test("unnamed books are not recorded", () => {
  const s = memory();
  assert.equal(recordHistory("   ", "v1.a", { storage: s }), null);
  assert.deepEqual(loadHistory(s), []);
});

test("list is capped and newest first", () => {
  const s = memory();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) recordHistory(`Book ${i}`, "v1.x", { now: i, storage: s });
  const list = loadHistory(s);
  assert.equal(list.length, MAX_ENTRIES);
  assert.equal(list[0].name, `Book ${MAX_ENTRIES + 4}`);
});

test("removeHistory deletes by name", () => {
  const s = memory();
  recordHistory("A", "v1.a", { now: 1, storage: s });
  recordHistory("B", "v1.b", { now: 2, storage: s });
  removeHistory("a", s);
  assert.deepEqual(loadHistory(s).map(e => e.name), ["B"]);
});

test("corrupt or hostile stored data is ignored; blocked storage never throws", () => {
  assert.deepEqual(loadHistory(memory({ [HISTORY_KEY]: "not json" })), []);
  assert.deepEqual(loadHistory(memory({ [HISTORY_KEY]: '{"a":1}' })), []);
  const bad = JSON.stringify([{ name: "x", payload: "javascript:alert(1)", updated: 1 }, { name: "", payload: "v1.a", updated: 1 }, { name: "ok", payload: "v1.a", updated: 5 }]);
  assert.deepEqual(loadHistory(memory({ [HISTORY_KEY]: bad })).map(e => e.name), ["ok"]);
  assert.deepEqual(loadHistory(broken), []);
  assert.equal(recordHistory("A", "v1.a", { storage: broken }), "A");
  assert.equal(removeHistory("A", broken), false);
});
