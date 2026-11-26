// Theme choice. A personal display preference, kept in this browser only (localStorage);
// it is never part of the share link. The look itself lives in css/themes.css.

export const DEFAULT_THEME = '8bit';
export const STORAGE_KEY = 'bcs-theme';

export const THEMES = [
  { id: '8bit', name: '8-BIT', blurb: 'The original: chunky pixels on deep blue.' },
  { id: 'book-lovers', name: 'BOOK LOVERS', blurb: 'Parchment, ink and a burgundy spine.' },
  { id: 'gamers', name: 'GAMERS', blurb: 'Neon on black with a CRT glow.' },
  { id: 'final-fantasy', name: 'FINAL FANTASY', blurb: 'A blue menu window with a white frame and gold text.' },
  { id: 'migaku-like', name: 'STUDY NIGHT', blurb: 'Calm and modern: violet and rose on dark.' },
  { id: 'gameboy', name: 'GAME BOY', blurb: 'Four shades of handheld green.' },
  { id: 'sakura', name: 'SAKURA', blurb: 'Cherry-blossom pink on warm paper.' },
  { id: 'terminal', name: 'TERMINAL', blurb: 'Green phosphor, monospace, a blinking prompt.' },
];

export const isTheme = id => THEMES.some(t => t.id === id);

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; } // blocked storage can throw on access
}

export function loadTheme(storage = defaultStorage()) {
  try {
    const id = storage?.getItem(STORAGE_KEY);
    return isTheme(id) ? id : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
}

/** Returns false when the choice could not be remembered (the theme still applies for this visit). */
export function saveTheme(id, storage = defaultStorage()) {
  try { storage.setItem(STORAGE_KEY, id); return true; } catch { return false; }
}

export function applyTheme(id, root = document.documentElement) {
  root.dataset.theme = isTheme(id) ? id : DEFAULT_THEME;
}
