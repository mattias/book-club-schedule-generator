// Local history of the books / clubs worked on in the editor: one entry per name, holding the
// latest share payload. Kept in this browser only (localStorage); never uploaded, never in a link.

export const HISTORY_KEY = 'bcs-history';
export const MAX_ENTRIES = 50;

const keyOf = name => name.trim().toLowerCase();

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

const valid = e => e && typeof e.name === 'string' && e.name.trim() && typeof e.payload === 'string' && /^v1\.[A-Za-z0-9_-]+$/.test(e.payload) && Number.isFinite(e.updated);

/** Entries, newest first. Anything unreadable or malformed is ignored. */
export function loadHistory(storage = defaultStorage()) {
  try {
    const list = JSON.parse(storage?.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.filter(valid).map(e => ({ name: e.name, payload: e.payload, updated: e.updated })).sort((a, b) => b.updated - a.updated);
  } catch { return []; }
}

function save(list, storage) {
  try { storage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES))); return true; } catch { return false; }
}

/**
 * Record the current state of a book. `replaces` is the name this editing session last saved under:
 * when the book gets renamed, that older entry is replaced instead of left behind.
 * Books without a name are not recorded. Returns the name recorded under, or null.
 */
export function recordHistory(name, payload, { replaces = null, now = Date.now(), storage = defaultStorage() } = {}) {
  const clean = (name ?? '').trim();
  if (!clean || !storage) return null;
  const drop = new Set([keyOf(clean)]);
  if (replaces) drop.add(keyOf(replaces));
  const list = loadHistory(storage).filter(e => !drop.has(keyOf(e.name)));
  list.unshift({ name: clean, payload, updated: now });
  save(list, storage);
  return clean;
}

export function removeHistory(name, storage = defaultStorage()) {
  if (!storage) return false;
  return save(loadHistory(storage).filter(e => keyOf(e.name) !== keyOf(name)), storage);
}
