import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEMES, DEFAULT_THEME, STORAGE_KEY, isTheme, loadTheme, saveTheme, applyTheme } from "../js/theme.js";

const memory = (initial = {}) => {
  const data = { ...initial };
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("default theme is listed and first", () => {
  assert.equal(THEMES[0].id, DEFAULT_THEME);
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
});

test("loadTheme falls back to default for missing, unknown or unreadable storage", () => {
  assert.equal(loadTheme(memory()), DEFAULT_THEME);
  assert.equal(loadTheme(memory({ [STORAGE_KEY]: "nope" })), DEFAULT_THEME);
  assert.equal(loadTheme(broken), DEFAULT_THEME);
  assert.equal(loadTheme(null), DEFAULT_THEME);
});

test("saveTheme round-trips and reports failure", () => {
  const s = memory();
  assert.equal(saveTheme("gamers", s), true);
  assert.equal(loadTheme(s), "gamers");
  assert.equal(saveTheme("gamers", broken), false);
});

test("applyTheme sets data-theme and ignores unknown ids", () => {
  const root = { dataset: {} };
  applyTheme("sakura", root);
  assert.equal(root.dataset.theme, "sakura");
  applyTheme("<script>", root);
  assert.equal(root.dataset.theme, DEFAULT_THEME);
  assert.ok(isTheme("terminal") && !isTheme("x"));
});

// Every theme must define exactly the variables the default theme does, so none inherits half its look.
const css = readFileSync(new URL("../css/themes.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
const propsOf = body => [...body.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]).sort();
const blockFor = id => blocks.find(b => b.sel === (id === DEFAULT_THEME ? `:root, [data-theme="${id}"]` : `[data-theme="${id}"]`));

test("every theme defines the same set of variables as the default theme", () => {
  const reference = propsOf(blockFor(DEFAULT_THEME).body);
  assert.ok(reference.length > 30);
  for (const t of THEMES) {
    const block = blockFor(t.id);
    assert.ok(block, `themes.css has no block for ${t.id}`);
    assert.deepEqual(propsOf(block.body), reference, `variables differ for ${t.id}`);
  }
});
