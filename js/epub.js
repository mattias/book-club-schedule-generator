// Epub import: reads the book locally and proposes chapter splits using several strategies.
// Runs in browsers and in Deno/Node (no DOMParser; a small tag scanner is used instead).
import { readZip } from './zip.js';

const SKIP = new Set(['rt', 'rp', 'script', 'style', 'head']);
const BLOCK = new Set(['p', 'div', 'br', 'li', 'tr', 'section', 'article', 'blockquote', 'body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const TOKEN_RE = /<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
const TAG_RE = /^<(\/?)\s*([a-zA-Z][\w:-]*)/;
const PATTERN_SOURCE = '^(第[0-9０-９一二三四五六七八九十百千]+[章話回節部巻幕]|プロローグ|エピローグ|序章|終章|あとがき|Prologue|Epilogue|Chapter\\s*\\d+|CHAPTER\\s*\\w+)';

const decodeEntities = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, e) => {
  if (e[0] === '#') {
    const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(cp); } catch { return '?'; }
  }
  return ENTITIES[e.toLowerCase()] ?? '?';
});

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? decodeEntities(m[2] ?? m[3]) : null;
};

/** Number of countable characters: newlines (block markers) are not counted. */
const charLen = s => [...s.replace(/\n/g, '')].length;

/** Plain text of an html fragment: no tags, no ruby readings, no whitespace; '\n' marks block breaks. */
function extract(html) {
  let text = '';
  let skip = 0;
  let heading = null;
  const anchors = new Map();
  const headings = [];
  const newline = () => { if (text && !text.endsWith('\n')) text += '\n'; };
  for (const tok of html.match(TOKEN_RE) ?? []) {
    if (tok[0] !== '<') {
      if (skip > 0) continue;
      const decoded = decodeEntities(tok);
      text += decoded.replace(/\s+/g, '');
      if (heading) heading.buf += decoded;
      continue;
    }
    const m = TAG_RE.exec(tok);
    if (!m) continue;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const selfClosing = tok.endsWith('/>');
    if (SKIP.has(name)) {
      if (!selfClosing) skip = closing ? Math.max(0, skip - 1) : skip + 1;
      continue;
    }
    if (skip > 0) continue;
    if (BLOCK.has(name)) newline();
    if (!closing) {
      const id = attr(tok, 'id') ?? (name === 'a' ? attr(tok, 'name') : null);
      if (id) anchors.set(id, text.length);
      if (/^h[1-3]$/.test(name) && !selfClosing) heading = { level: Number(name[1]), offset: text.length, buf: '', tag: name };
    } else if (heading && name === heading.tag) {
      headings.push({ level: heading.level, offset: heading.offset, title: heading.buf.replace(/\s+/g, ' ').trim() });
      heading = null;
    }
  }
  return { text, anchors, headings };
}

export function countChars(html) {
  return charLen(extract(html).text);
}

/** Chapters from sorted markers: each runs from its offset to the next marker (last: end of text). */
export function lengthsFromMarkers(text, markers) {
  const sorted = [...markers].sort((a, b) => a.offset - b.offset);
  return sorted.map((m, i) => ({ title: m.title, length: charLen(text.slice(m.offset, i + 1 < sorted.length ? sorted[i + 1].offset : text.length)) }));
}

/** Markers at every line (<= 60 chars) matching the given regex source. */
export function markersFromRegex(text, source = PATTERN_SOURCE) {
  let re;
  try { re = new RegExp(source); } catch { throw new Error('bad-regex'); }
  const markers = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    if (line && [...line].length <= 60 && re.test(line)) markers.push({ offset, title: line });
    offset += line.length + 1;
  }
  return markers;
}

function resolvePath(dir, href) {
  let decoded = href;
  try { decoded = decodeURIComponent(href); } catch { /* keep raw */ }
  const parts = (dir ? dir.split('/') : []).concat(decoded.split('/'));
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

const dirname = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

function navEntries(navHtml) {
  const m = /<nav\b[^>]*epub:type\s*=\s*["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i.exec(navHtml)
    ?? /<nav\b[^>]*>([\s\S]*?)<\/nav>/i.exec(navHtml);
  if (!m) return [];
  const entries = [];
  let depth = 0;
  let cur = null;
  for (const tok of m[1].match(TOKEN_RE) ?? []) {
    if (tok[0] !== '<') { if (cur) cur.title += decodeEntities(tok); continue; }
    const t = TAG_RE.exec(tok);
    if (!t) continue;
    const name = t[2].toLowerCase();
    if (name === 'ol') depth += t[1] ? -1 : 1;
    else if (name === 'a' && !t[1]) { const href = attr(tok, 'href'); cur = href ? { title: '', href, depth } : null; }
    else if (name === 'a' && cur) { cur.title = cur.title.replace(/\s+/g, ' ').trim(); entries.push(cur); cur = null; }
  }
  return entries;
}

function ncxEntries(ncx) {
  const entries = [];
  const stack = [];
  for (const tok of ncx.match(/<navPoint\b[^>]*>|<\/navPoint>|<text\b[^>]*>[\s\S]*?<\/text>|<content\b[^>]*\/?>/gi) ?? []) {
    if (/^<navPoint/i.test(tok)) { const e = { title: '', href: '', depth: stack.length + 1 }; stack.push(e); entries.push(e); }
    else if (/^<\/navPoint/i.test(tok)) stack.pop();
    else if (/^<text/i.test(tok) && stack.length) { const e = stack[stack.length - 1]; if (!e.title) e.title = decodeEntities(tok.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(); }
    else if (/^<content/i.test(tok) && stack.length) stack[stack.length - 1].href = attr(tok, 'src') ?? '';
  }
  return entries.filter(e => e.href);
}

/**
 * @returns {Promise<{bookTitle:string, text:string, totalChars:number,
 *   units:{href:string,start:number,end:number}[],
 *   detections:{method:'toc'|'spine'|'headings'|'patterns', chapters:{title:string,length:number}[]}[]}>}
 */
export async function loadEpub(buffer) {
  const zip = await readZip(buffer);
  const dec = new TextDecoder('utf-8');
  const read = async name => (zip.has(name) ? dec.decode(await zip.get(name)()) : null);

  const container = await read('META-INF/container.xml');
  const opfPath = container && attr(/<rootfile\b[^>]*>/i.exec(container)?.[0] ?? '', 'full-path');
  const opf = opfPath && await read(opfPath);
  if (!opf) throw new Error('bad-epub');
  const opfDir = dirname(opfPath);

  const items = new Map();
  for (const tag of opf.match(/<item\b[^>]*>/gi) ?? []) {
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    if (id && href) items.set(id, { href: resolvePath(opfDir, href), type: attr(tag, 'media-type') ?? '', props: attr(tag, 'properties') ?? '' });
  }
  const bookTitle = decodeEntities((/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1] ?? '').replace(/<[^>]*>/g, '')).trim();

  // Reading order -> one text with unit offsets
  let text = '';
  const units = [];
  const anchors = new Map();
  const headings = [];
  const spineChapters = [];
  for (const tag of opf.match(/<itemref\b[^>]*>/gi) ?? []) {
    const item = items.get(attr(tag, 'idref'));
    if (!item || /\bnav\b/.test(item.props) || !/x?html/.test(item.type)) continue;
    const html = await read(item.href);
    if (html === null) continue;
    const ex = extract(html);
    const start = text.length;
    text += ex.text.length && !text.endsWith('\n') && text ? '\n' + ex.text : ex.text;
    const shift = start + (text.length - start - ex.text.length);
    units.push({ href: item.href, start, end: text.length });
    anchors.set(item.href, shift);
    for (const [id, off] of ex.anchors) anchors.set(`${item.href}#${id}`, shift + off);
    for (const h of ex.headings) headings.push({ ...h, offset: shift + h.offset });
    const len = charLen(ex.text);
    if (len > 0) spineChapters.push({ title: ex.headings[0]?.title || item.href.split('/').pop().replace(/\.[^.]+$/, ''), length: len });
  }

  const detections = [];

  // 1. TOC (nav, then NCX)
  const resolveToc = (entries, tocPath) => {
    const make = list => {
      const markers = [];
      for (const e of list) {
        const [file, frag] = e.href.split('#');
        const abs = file ? resolvePath(dirname(tocPath), file) : tocPath;
        const off = frag ? (anchors.get(`${abs}#${frag}`) ?? anchors.get(abs)) : anchors.get(abs);
        if (off !== undefined && !markers.some(m => m.offset === off)) markers.push({ offset: off, title: e.title });
      }
      return markers;
    };
    const top = make(entries.filter(e => e.depth <= 1));
    return top.length >= 2 ? top : make(entries);
  };
  const navItem = [...items.values()].find(i => /\bnav\b/.test(i.props));
  const ncxItem = [...items.values()].find(i => /ncx/.test(i.type));
  let tocMarkers = [];
  if (navItem) { const html = await read(navItem.href); if (html) tocMarkers = resolveToc(navEntries(html), navItem.href); }
  if (tocMarkers.length < 2 && ncxItem) { const xml = await read(ncxItem.href); if (xml) tocMarkers = resolveToc(ncxEntries(xml), ncxItem.href); }
  if (tocMarkers.length >= 2) detections.push({ method: 'toc', chapters: lengthsFromMarkers(text, tocMarkers) });

  // 2. Spine files
  if (spineChapters.length >= 2) detections.push({ method: 'spine', chapters: spineChapters });

  // 3. Headings (smallest level that occurs at least twice)
  for (const level of [1, 2, 3]) {
    const hs = headings.filter(h => h.level === level && h.title);
    if (hs.length >= 2) { detections.push({ method: 'headings', chapters: lengthsFromMarkers(text, hs) }); break; }
  }

  // 4. Title patterns
  const pm = markersFromRegex(text);
  if (pm.length >= 2) detections.push({ method: 'patterns', chapters: lengthsFromMarkers(text, pm) });

  return { bookTitle, text, totalChars: charLen(text), units, detections };
}
