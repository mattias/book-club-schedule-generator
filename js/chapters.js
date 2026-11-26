// Chapter parsing and labelling. DOM-free.

/** @typedef {{index:number,title:string,length:number,roundedLength:number}} Chapter */

export function toKanji(num) {
  const basic = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return basic[num];
  if (num < 20) return '十' + basic[num % 10];
  if (num % 10 === 0) return basic[Math.floor(num / 10)] + '十';
  return basic[Math.floor(num / 10)] + '十' + basic[num % 10];
}

export function chapterLabel(index, format) {
  return format === 'kanji' ? toKanji(index) + '章' : 'ch' + index;
}

export function labelSeparator(format) {
  return format === 'kanji' ? '　' : ' ';
}

/**
 * Parse "title\ncumulativeCount" pairs. The last pair only marks the end.
 * @returns {Chapter[]}
 */
export function parseCumulative(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l !== '');
  const chapters = [];
  let counter = 1;
  for (let i = 0; i < lines.length - 1; i += 2) {
    const title = lines[i];
    const start = Number.parseInt(lines[i + 1]);
    if (lines[i + 3] === undefined) break;
    const next = Number.parseInt(lines[i + 3]);
    if (Number.isNaN(start) || Number.isNaN(next)) continue;
    const length = next - start;
    if (length < 100) continue;
    chapters.push({ index: counter++, title, length, roundedLength: Math.round(length / 100) * 100 });
  }
  return chapters;
}

/** Build Chapter[] from [{title,length}] (epub detections, share links). Drops chapters under 100 chars. */
export function chaptersFromList(list) {
  const chapters = [];
  for (const { title, length } of list) {
    if (length < 100) continue;
    chapters.push({ index: chapters.length + 1, title, length, roundedLength: Math.round(length / 100) * 100 });
  }
  return chapters;
}
