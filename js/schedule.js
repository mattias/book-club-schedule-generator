// Scheduling engine. Pure functions, dates are local 'YYYY-MM-DD' strings.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GROUP_EXTRA = 500;   // short chapters may group up to target + this
const SLACK = 1000;        // leniency when deciding to drop a day
const MAX_OVER = 1000;     // a shortened chapter may exceed target by at most this
const MAX_CHAPTER = 5e6;      // sanity cap on one chapter
const MIN_PER_DAY = 1000;  // never spread a chapter thinner than this

const pad = n => String(n).padStart(2, '0');
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
export function weekdayName(s) { return WEEKDAYS[parse(s).getDay()]; }
export function formatDate(s) { const d = parse(s); return `${d.getDate()}. ${MONTHS[d.getMonth()]}`; }

export function nextReadingDay(s, readingDays, inclusive) {
  let c = inclusive ? s : addDays(s, 1);
  while (!readingDays.includes(parse(c).getDay())) c = addDays(c, 1);
  return c;
}

function nthReadingDay(start, n, readingDays) {
  let c = nextReadingDay(start, readingDays, true);
  for (let i = 1; i < n; i++) c = nextReadingDay(c, readingDays, false);
  return c;
}

function countReadingDays(from, to, readingDays) {
  let n = 0;
  for (let c = from; c <= to; c = addDays(c, 1)) if (readingDays.includes(parse(c).getDay())) n++;
  return n;
}

const round100 = x => Math.round(x / 100) * 100;

function perDay(chapters, s) {
  const goal = s.dailyTarget;
  const maxGroup = goal + GROUP_EXTRA;
  const threshold = Math.max(goal - SLACK, goal / 2);
  const entries = [];
  let cursor = nextReadingDay(s.startDate, s.readingDays, true);
  let leftover = 0;
  let i = 0;
  while (i < chapters.length) {
    const chap = chapters[i];
    const len = chap.roundedLength;
    let days = Math.ceil(len / goal);
    if (days === 1) {
      let j = i + 1, total = len;
      while (j < chapters.length && total + chapters[j].roundedLength <= maxGroup) { total += chapters[j].roundedLength; j++; }
      if (j - i > 1) {
        for (let k = i; k < j; k++) entries.push({ chapter: chapters[k], start: cursor, end: cursor });
        cursor = nextReadingDay(cursor, s.readingDays, false);
        i = j;
        continue;
      }
    }
    days = Math.max(1, Math.min(days, Math.floor(len / MIN_PER_DAY)));
    leftover += days * goal - len;
    if (days > 1 && leftover >= threshold && len / (days - 1) <= goal + MAX_OVER) {
      days--;
      leftover -= goal;
    }
    let end = cursor;
    for (let d = 1; d < days; d++) end = nextReadingDay(end, s.readingDays, false);
    entries.push({ chapter: chap, start: cursor, end });
    cursor = nextReadingDay(end, s.readingDays, false);
    i++;
  }
  return { entries, finishDate: entries[entries.length - 1].end };
}

function perWeekChap(chapters, s) {
  const weeks = [];
  const perWeekDays = s.readingDays.length;
  let start = s.startDate;
  for (let i = 0; i < chapters.length; i += s.chaptersPerWeek) {
    const chs = chapters.slice(i, i + s.chaptersPerWeek);
    const total = chs.reduce((a, c) => a + c.roundedLength, 0);
    weeks.push({ n: weeks.length + 1, start, end: addDays(start, 6), chapters: chs, total, avgPerDay: round100(total / perWeekDays) });
    start = addDays(start, 7);
  }
  return { weeks, finishDate: weeks[weeks.length - 1].end };
}

function perWeekChar(chapters, s) {
  const weeks = [];
  const perWeekDays = s.readingDays.length;
  const allowance = s.dailyTarget + s.maxOvershoot;
  let start = s.startDate;
  let i = 0;
  while (i < chapters.length) {
    const chs = [];
    let total = 0;
    while (i < chapters.length) {
      const t = total + chapters[i].roundedLength;
      if (total === 0 || t / perWeekDays <= allowance) { chs.push(chapters[i]); total = t; i++; }
      else break;
    }
    const isLast = i >= chapters.length;
    const week = { n: weeks.length + 1, start, end: addDays(start, 6), chapters: chs, total, avgPerDay: round100(total / perWeekDays) };
    if (isLast) {
      const daysNeeded = Math.ceil(total / s.dailyTarget);
      week.end = nthReadingDay(start, Math.max(1, daysNeeded), s.readingDays);
      if (daysNeeded < perWeekDays) week.note = 'book ends';
      else if (daysNeeded > perWeekDays) week.note = `+${daysNeeded - perWeekDays} extra days`;
    }
    if (week.avgPerDay > allowance) {
      week.warning = `Average exceeds your limit (target + overshoot) by ${(week.avgPerDay - allowance).toLocaleString('en-US')} chars/day`;
    }
    weeks.push(week);
    start = addDays(start, 7);
  }
  return { weeks, finishDate: weeks[weeks.length - 1].end };
}

export function buildSchedule(chapters, settings) {
  if (!settings.readingDays || settings.readingDays.length === 0) throw new Error('no-reading-days');
  if (!chapters || chapters.length === 0) throw new Error('no-chapters');
  const bad = !Number.isFinite(settings.dailyTarget) || settings.dailyTarget < 500
    || !Number.isInteger(settings.chaptersPerWeek) || settings.chaptersPerWeek < 1 || settings.chaptersPerWeek > 1000
    || !Number.isFinite(settings.maxOvershoot) || settings.maxOvershoot < 0
    || chapters.some(c => !Number.isFinite(c.roundedLength) || c.roundedLength > MAX_CHAPTER);
  if (bad) throw new Error('bad-settings');
  const run = { per_day: perDay, per_week_chap: perWeekChap, per_week_char: perWeekChar }[settings.mode];
  const result = run(chapters, settings);
  return {
    mode: settings.mode,
    ...result,
    totalChars: chapters.reduce((a, c) => a + c.roundedLength, 0),
    readingDaysUsed: countReadingDays(settings.startDate, result.finishDate, settings.readingDays),
  };
}

/** Smallest daily target (steps of 100, from 1000) at which per_day finishes by targetEndDate. */
export function paceForEndDate(chapters, settings) {
  const MAX = 200000;
  for (let t = 1000; t <= MAX; t += 100) {
    const s = buildSchedule(chapters, { ...settings, mode: 'per_day', dailyTarget: t });
    if (s.finishDate <= settings.targetEndDate) return t;
  }
  return null; // cannot be reached
}
