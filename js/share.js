// Share-link encoding: JSON -> deflate-raw -> base64url, prefixed with a version.

const VERSION = 1;
const PREFIX = `v${VERSION}.`;
const MODES = ['per_day', 'per_week_chap', 'per_week_char'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const bad = () => new Error('bad-share-link');

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toB64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

/** @returns {Promise<string>} payload for the URL hash (without '#') */
export async function encodeState(state) {
  const compact = {
    v: VERSION,
    t: state.title,
    f: state.format,
    s: state.settings,
    c: state.chapters.map(c => [c.title, c.length]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  return PREFIX + toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

function validate(o) {
  const s = o && o.s;
  const ok = o && o.v === VERSION && typeof o.t === 'string' && (o.f === 'kanji' || o.f === 'english')
    && Array.isArray(o.c) && o.c.length > 0
    && o.c.every(c => Array.isArray(c) && typeof c[0] === 'string' && Number.isFinite(c[1]) && c[1] >= 0)
    && s && MODES.includes(s.mode) && DATE_RE.test(s.startDate)
    && Array.isArray(s.readingDays) && s.readingDays.length > 0
    && s.readingDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6)
    && [s.dailyTarget, s.chaptersPerWeek, s.maxOvershoot].every(Number.isFinite)
    && s.dailyTarget > 0 && s.chaptersPerWeek > 0 && s.maxOvershoot >= 0;
  if (!ok) throw bad();
}

/** @returns {Promise<{title:string, chapters:{title:string,length:number}[], settings:object, format:string}>} */
export async function decodeState(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(PREFIX)) throw bad();
  const body = payload.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw bad();
  let obj;
  try {
    const bytes = await pipe(fromB64Url(body), new DecompressionStream('deflate-raw'));
    obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw bad();
  }
  validate(obj);
  return {
    title: obj.t,
    format: obj.f,
    settings: obj.s,
    chapters: obj.c.map(([title, length]) => ({ title, length })),
  };
}
