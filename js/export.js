// Text and .ics export. Pure functions.
import { chapterLabel, labelSeparator } from './chapters.js';
import { formatDate, addDays } from './schedule.js';

const n = x => x.toLocaleString('en-US');

function chapterLine(chap, format) {
  return `${chapterLabel(chap.index, format)}${labelSeparator(format)}${chap.title}`;
}

export function toText(schedule, { format, title } = {}) {
  let out = title ? `${title}\n\n` : '';
  if (schedule.mode === 'per_day') {
    for (const e of schedule.entries) {
      const range = e.start === e.end ? formatDate(e.start) : `${formatDate(e.start)}-${formatDate(e.end)}`;
      out += `${chapterLine(e.chapter, format)} ${range} (~${n(e.chapter.roundedLength)} chars)\n`;
    }
    return out;
  }
  const blocks = schedule.weeks.map(w => {
    let b = `WEEK ${w.n}${w.note ? ` (${w.note})` : ''} (${formatDate(w.start)} - ${formatDate(w.end)})`;
    if (w.warning) b += ` (WARNING: ${w.warning})`;
    b += '\n';
    for (const c of w.chapters) b += `${chapterLine(c, format)} (~${n(c.roundedLength)} chars)\n`;
    b += `total reading: ${n(w.total)} chars ≈ ${n(w.avgPerDay)} chars per day\n`;
    return b;
  });
  return out + blocks.join('\n');
}

const BS = String.fromCharCode(92);
const esc = s => s.split(BS).join(BS + BS).replace(/;/g, BS + ';').replace(/,/g, BS + ',').replace(/\r?\n/g, BS + 'n');
const compact = d => d.replace(/-/g, '');
const enc = new TextEncoder();

function fold(line) {
  const parts = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { parts.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  parts.push(cur);
  return parts;
}

export function toIcs(schedule, { format, title, now } = {}) {
  const stamp = now ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events = schedule.mode === 'per_day'
    ? schedule.entries.map(e => ({ start: e.start, end: e.end, summary: chapterLine(e.chapter, format), desc: `~${n(e.chapter.roundedLength)} chars` }))
    : schedule.weeks.map(w => ({
        start: w.start, end: w.end,
        summary: `WEEK ${w.n}`,
        desc: w.chapters.map(c => `${chapterLine(c, format)} (~${n(c.roundedLength)} chars)`).join('\n') + `\n${n(w.total)} chars`,
      }));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//migaku-book-club-schedule//EN', 'CALSCALE:GREGORIAN'];
  if (title) lines.push(`X-WR-CALNAME:${esc(title)}`);
  events.forEach((e, i) => {
    lines.push('BEGIN:VEVENT', `UID:${i}-${compact(e.start)}@migaku-schedule`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`, `DTEND;VALUE=DATE:${compact(addDays(e.end, 1))}`,
      `SUMMARY:${esc((title ? title + ': ' : '') + e.summary)}`, `DESCRIPTION:${esc(e.desc)}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.flatMap(fold).join('\r\n') + '\r\n';
}
