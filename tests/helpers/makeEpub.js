// Builds small, valid epub files for tests (zip writer using node:zlib).
import { deflateRawSync } from "node:zlib";

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** entries: [{name, data: string|Uint8Array, store?: boolean}] -> ArrayBuffer */
export function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const raw = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const method = e.store ? 0 : 8;
    const body = method === 0 ? raw : new Uint8Array(deflateRawSync(raw));
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, body);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out.buffer;
}

const page = (body, title = "t") =>
  `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${body}</body></html>`;

/**
 * toc: 'nav' | 'ncx' | 'none'
 * files: [{href, html}]  (html = body content, files live under OPS/)
 * tocEntries: [{title, href}]  (href relative to OPS/, may include #fragment)
 */
export function makeEpub({ toc = "none", files, tocEntries = [], bookTitle = "Test Book" }) {
  const manifest = files.map((f, i) => `<item id="f${i}" href="${f.href}" media-type="application/xhtml+xml"/>`);
  const spine = files.map((_, i) => `<itemref idref="f${i}"/>`);
  const entries = [
    { name: "mimetype", data: "application/epub+zip", store: true },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    },
  ];
  if (toc === "nav") {
    manifest.push(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
    const lis = tocEntries.map(e => `<li><a href="${e.href}">${e.title}</a></li>`).join("");
    entries.push({ name: "OPS/nav.xhtml", data: page(`<nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>${lis}</ol></nav>`) });
  } else if (toc === "ncx") {
    manifest.push(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`);
    const pts = tocEntries.map((e, i) => `<navPoint id="n${i}" playOrder="${i + 1}"><navLabel><text>${e.title}</text></navLabel><content src="${e.href}"/></navPoint>`).join("");
    entries.push({ name: "OPS/toc.ncx", data: `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>${pts}</navMap></ncx>` });
  }
  const tocAttr = toc === "ncx" ? ` toc="ncx"` : "";
  entries.push({
    name: "OPS/content.opf",
    data: `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${bookTitle}</dc:title></metadata><manifest>${manifest.join("")}</manifest><spine${tocAttr}>${spine.join("")}</spine></package>`,
  });
  for (const f of files) entries.push({ name: "OPS/" + f.href, data: page(f.html) });
  return makeZip(entries);
}
