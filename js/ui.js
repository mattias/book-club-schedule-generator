// DOM rendering. Everything is built with h() so user text is never parsed as HTML.
import { parseCumulative, chaptersFromList, chapterLabel, labelSeparator } from './chapters.js';
import { buildSchedule, paceForEndDate, formatDate, weekdayName, addDays } from './schedule.js';
import { toText, toIcs } from './export.js';
import { encodeState } from './share.js';
import { loadEpub, markersFromRegex, lengthsFromMarkers } from './epub.js';

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const pad = n => String(n).padStart(2, '0');
export const todayString = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const num = x => x.toLocaleString('en-US');
const dayLabel = d => `${weekdayName(d)} ${formatDate(d)}`;

const ERRORS = {
  'bad-zip': "That file doesn't look like an epub (could not read it as a zip).",
  'bad-epub': "That epub is missing its book description (container.xml / opf).",
  'bad-regex': 'That pattern is not a valid regular expression.',
  'no-reading-days': 'Pick at least one reading day.',
  'bad-settings': 'Check the pace numbers: daily target at least 500, chapters per week 1-1000.',
  'no-chapters': 'Add some chapters first: paste a list or load an epub.',
  'bad-share-link': 'This share link is broken or from an unknown version. Starting fresh.',
};
export const errorText = e => ERRORS[e?.message] ?? `Something went wrong: ${e?.message ?? e}`;

export const defaultState = () => ({
  title: '',
  format: 'kanji',
  chapters: [],
  settings: {
    mode: 'per_day', startDate: todayString(), readingDays: [0, 1, 2, 3, 4, 5, 6],
    dailyTarget: 3000, chaptersPerWeek: 5, maxOvershoot: 500, targetEndDate: '',
  },
});

const DAY_BUTTONS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const MODES = [
  ['per_day', 'CHARS / DAY', 'Chapters get as many days as the daily target needs. Short chapters share a day.'],
  ['per_week_chap', 'CHAPTERS / WEEK', 'A fixed number of chapters every week.'],
  ['per_week_char', 'CHARS / WEEK', 'Fill each week up to the daily target (plus allowed overshoot).'],
];

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function computeSchedule(state) {
  try {
    return { schedule: buildSchedule(chaptersFromList(state.chapters), state.settings) };
  } catch (e) {
    return { error: e };
  }
}

/* ---------- schedule display (shared by editor and read-only view) ---------- */

export function renderScheduleBody(schedule, state) {
  const today = todayString();
  const days = Math.round((Date.parse(schedule.finishDate) - Date.parse(state.settings.startDate)) / 86400000) + 1;
  const avg = Math.round(schedule.totalChars / Math.max(1, schedule.readingDaysUsed) / 100) * 100;
  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat finish' }, h('div', { class: 'k' }, 'FINISH'), h('div', { class: 'v' }, `${dayLabel(schedule.finishDate)} ${schedule.finishDate.slice(0, 4)}`)),
    stat('CALENDAR DAYS', days), stat('READING DAYS', schedule.readingDaysUsed),
    stat('CHARACTERS', num(schedule.totalChars)), stat('AVG / READING DAY', num(avg)));
  const sep = labelSeparator(state.format);
  let body;
  if (schedule.mode === 'per_day') {
    body = h('ul', { class: 'list' }, schedule.entries.map(e => h('li', { class: e.start <= today && today <= e.end ? 'today' : '' },
      h('span', { class: 'when' }, e.start === e.end ? dayLabel(e.start) : `${dayLabel(e.start)} → ${dayLabel(e.end)}`),
      h('span', {}, chapterLabel(e.chapter.index, state.format), sep, e.chapter.title),
      h('span', { class: 'num dim' }, num(e.chapter.roundedLength)))));
  } else {
    body = h('div', {}, schedule.weeks.map(w => h('div', { class: `week${w.start <= today && today <= w.end ? ' today' : ''}` },
      h('h3', {}, `WEEK ${w.n} · ${dayLabel(w.start)} → ${dayLabel(w.end)}`, w.note ? ` (${w.note})` : ''),
      w.warning ? h('div', { class: 'warn' }, `⚠ ${w.warning}`) : null,
      h('ul', { class: 'list' }, w.chapters.map(c => h('li', {},
        h('span', { class: 'when dim' }, ''), h('span', {}, chapterLabel(c.index, state.format), sep, c.title),
        h('span', { class: 'num dim' }, num(c.roundedLength))))),
      h('div', { class: 'total' }, `total ${num(w.total)} chars ≈ ${num(w.avgPerDay)} per reading day`))));
  }
  return h('div', {}, stats, body);
}

const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v));

function exportButtons(state, schedule, notify, withView) {
  const title = state.title || 'Reading schedule';
  const buttons = [
    h('button', { class: 'btn', onclick: async () => notify((await copy(toText(schedule, { format: state.format, title: state.title }))) ? 'Copied the schedule as text.' : 'Could not access the clipboard.') }, 'COPY TEXT'),
    h('button', { class: 'btn cyan', onclick: () => window.print() }, 'PRINT'),
    h('button', { class: 'btn cyan', onclick: () => download(`${title}.ics`, toIcs(schedule, { format: state.format, title }), 'text/calendar') }, '.ICS CALENDAR'),
  ];
  if (withView) {
    // Opens the same read-only view a share link would, without the copy-paste detour; browser Back returns to the editor.
    buttons.splice(1, 0, h('button', { class: 'btn', onclick: async () => {
      location.hash = await encodeState({ title: state.title, format: state.format, chapters: state.chapters, settings: state.settings });
    } }, 'VIEW MODE'));
  }
  buttons.unshift(h('button', { class: 'btn green', onclick: async () => {
    const payload = await encodeState({ title: state.title, format: state.format, chapters: state.chapters, settings: state.settings });
    const url = `${location.origin}${location.pathname}#${payload}`;
    const ok = await copy(url);
    notify(ok ? `Share link copied (${num(url.length)} characters).` : `Copy this link: ${url}`, ok ? 'ok' : '');
  } }, 'SHARE LINK'));
  return h('div', { class: 'no-print' }, buttons);
}

/* ---------- read-only view for shared links ---------- */

export function mountShared(app, state, { onRemix }) {
  app.replaceChildren();
  const { schedule, error } = computeSchedule(state);
  const note = h('div', { 'aria-live': 'polite' });
  const notify = (text, kind = 'ok') => note.replaceChildren(h('div', { class: `msg ${kind}` }, text));
  app.append(h('div', { class: 'box' },
    h('h2', {}, state.title || 'Reading schedule'),
    error ? h('div', { class: 'msg error' }, errorText(error)) : [
      renderScheduleBody(schedule, state),
      exportButtons(state, schedule, notify, false),
      h('button', { class: 'btn ghost no-print', onclick: onRemix }, 'REMIX / EDIT THIS'),
      note,
    ]));
}

/* ---------- editor ---------- */

export function mountEditor(app, state, { notice, onChange } = {}) {
  app.replaceChildren();
  const s = state.settings;
  const epub = { detections: [], text: '', active: 0 };

  const noteBox = h('div', { 'aria-live': 'polite' });
  const notify = (text, kind = 'ok') => noteBox.replaceChildren(h('div', { class: `msg ${kind}` }, text));
  if (notice) notify(notice, 'error');

  /* panel 1: book */
  const summary = h('div', { 'aria-live': 'polite' });
  const tableHost = h('div');
  const detectHost = h('div');
  let lastEpubTitle = '';
  const raw = h('textarea', { placeholder: '表紙\n0\nプロローグ\n252\n一章\n3900\n(last line: end of book count)', 'aria-label': 'Pasted chapter list', oninput: () => {
    state.chapters = parseCumulative(raw.value).map(c => ({ title: c.title, length: c.length }));
    detectHost.replaceChildren();
    setDropState(false);
    refreshBook();
  } });
  const pasteBox = h('details', {}, h('summary', {}, 'OR PASTE A LIST INSTEAD'),
    h('p', { class: 'dim' }, 'One chapter per two lines: the title, then the cumulative character count where it starts. The final pair marks the end of the book.'), raw);

  const fileInput = h('input', { type: 'file', accept: '.epub,application/epub+zip', id: 'epub-file', 'aria-label': 'Choose an epub file', onchange: () => {
    const f = fileInput.files[0];
    fileInput.value = ''; // so the same file can be chosen again
    if (f) openEpub(f);
  } });
  const dropText = h('div', { class: 'drop-text' });
  const chooseBtn = h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() });
  const drop = h('div', { class: 'drop', ondragover: e => { e.preventDefault(); drop.classList.add('over'); }, ondragleave: () => drop.classList.remove('over'),
    ondrop: e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) openEpub(f); } },
    fileInput, dropText, chooseBtn, h('div', { class: 'dim' }, 'Read in your browser. Nothing is uploaded.'));
  function setDropState(loaded) {
    drop.classList.toggle('compact', loaded);
    dropText.textContent = loaded ? 'Drop another .epub here to replace this book' : '▼ DROP AN .EPUB HERE ▼';
    chooseBtn.textContent = loaded ? 'REPLACE EPUB' : 'CHOOSE EPUB FILE';
  }
  setDropState(false);

  async function openEpub(file) {
    try {
      const book = await loadEpub(await file.arrayBuffer());
      epub.detections = book.detections;
      epub.text = book.text;
      epub.active = 0;
      if (book.bookTitle && (!state.title || state.title === lastEpubTitle)) { state.title = book.bookTitle; titleInput.value = book.bookTitle; printTitle.textContent = book.bookTitle; }
      lastEpubTitle = book.bookTitle;
      setDropState(true);
      if (book.detections.length) applyDetection(0);
      else { state.chapters = []; refreshBook(); }
      renderDetect(`Loaded "${book.bookTitle || file.name}": ${num(book.totalChars)} characters.`);
    } catch (e) {
      detectHost.replaceChildren(h('div', { class: 'msg error' }, errorText(e)));
    }
  }

  const METHOD_NAMES = { toc: 'Table of contents', spine: 'One chapter per file', headings: 'Headings (h1-h3)', patterns: 'Title patterns (第N章, Chapter N...)', numbers: 'Numbered sections (1, 2, 3 / Ⅰ, Ⅱ)' };
  function applyDetection(i) {
    epub.active = i;
    state.chapters = epub.detections[i].chapters.map(c => ({ ...c }));
    refreshBook();
  }
  function renderDetect(info) {
    const sel = h('select', { id: 'detect', 'aria-label': 'Chapter detection method', onchange: () => applyDetection(Number(sel.value)) },
      epub.detections.map((d, i) => h('option', { value: String(i), selected: i === epub.active }, `${METHOD_NAMES[d.method]} (${d.chapters.length} chapters)`)));
    const pattern = h('input', { type: 'text', value: '^第.+章', 'aria-label': 'Custom chapter pattern' });
    detectHost.replaceChildren(
      h('div', { class: 'msg ok' }, info),
      epub.detections.length ? h('div', {}, h('label', { for: 'detect' }, 'DETECTED BY'), sel)
        : h('div', { class: 'msg error' }, 'No chapters found automatically. Try a custom pattern below, or paste a list.'),
      h('label', { for: 'pattern' }, 'OR SPLIT AT LINES MATCHING (regular expression)'),
      h('div', { class: 'row' }, Object.assign(pattern, { id: 'pattern' }), h('button', { class: 'btn small', onclick: () => {
        try {
          const markers = markersFromRegex(epub.text, pattern.value);
          if (markers.length < 1) return notify('No lines matched that pattern.', 'error');
          state.chapters = lengthsFromMarkers(epub.text, markers);
          refreshBook();
        } catch (e) { notify(errorText(e), 'error'); }
      } }, 'APPLY')));
  }

  const printTitle = h('h2', { class: 'print-title' }, state.title || 'Reading schedule');
  const titleInput = h('input', { type: 'text', id: 'book-title', value: state.title, placeholder: 'e.g. Tuesday Book Club', oninput: () => { state.title = titleInput.value; printTitle.textContent = state.title || 'Reading schedule'; onChange?.(state); } });

  function refreshBook() {
    const n = chaptersFromList(state.chapters).length;
    summary.replaceChildren(n ? h('div', { class: 'msg ok' }, `${n} chapters · ${num(chaptersFromList(state.chapters).reduce((a, c) => a + c.roundedLength, 0))} characters`)
      : h('div', { class: 'msg' }, 'No chapters yet.'));
    tableHost.replaceChildren(state.chapters.length ? h('details', {}, h('summary', {}, `EDIT CHAPTERS (${state.chapters.length})`),
      h('table', { class: 'chap-table' }, h('tbody', {}, state.chapters.map((c, i) => h('tr', {},
        h('td', {}, h('input', { type: 'text', value: c.title, 'aria-label': `Title of chapter ${i + 1}`, oninput: e => { c.title = e.target.value; refreshSchedule(); } })),
        h('td', { style: 'width:7em' }, h('input', { type: 'number', value: String(c.length), min: '0', 'aria-label': `Length of chapter ${i + 1}`, oninput: e => { c.length = Number(e.target.value) || 0; refreshSchedule(); } })),
        h('td', { style: 'white-space:nowrap' },
          i + 1 < state.chapters.length ? h('button', { class: 'btn small', title: 'Merge with next chapter', onclick: () => { c.length += state.chapters[i + 1].length; state.chapters.splice(i + 1, 1); refreshBook(); } }, '+↓') : null,
          h('button', { class: 'btn small ghost', title: 'Remove chapter', onclick: () => { state.chapters.splice(i, 1); refreshBook(); } }, '✕'))))))) : '');
    refreshSchedule();
  }

  /* panel 2: pace */
  const modeFields = h('div', { class: 'grid' });
  const modeHelp = h('p', { class: 'dim' });
  const modeBtns = MODES.map(([id, label, help]) => h('button', { class: 'btn ghost', 'aria-pressed': String(s.mode === id), onclick: () => {
    s.mode = id; modeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(MODES[i][0] === id))); renderModeFields(); refreshSchedule();
  } }, label));

  const field = (label, id, attrs, key, parse = Number) => {
    const input = h('input', { id, ...attrs, value: String(s[key] ?? ''), oninput: () => { s[key] = parse(input.value); refreshSchedule(); } });
    return h('div', {}, h('label', { for: id }, label), input);
  };
  function renderModeFields() {
    const mode = MODES.find(m => m[0] === s.mode);
    modeHelp.textContent = mode[2];
    const fields = [];
    if (s.mode === 'per_day') fields.push(field('CHARS PER DAY', 'f-daily', { type: 'number', min: '1000', step: '100' }, 'dailyTarget'));
    if (s.mode === 'per_week_chap') fields.push(field('CHAPTERS PER WEEK', 'f-cpw', { type: 'number', min: '1' }, 'chaptersPerWeek'));
    if (s.mode === 'per_week_char') {
      fields.push(field('DAILY TARGET (CHARS)', 'f-daily2', { type: 'number', min: '1000', step: '100' }, 'dailyTarget'));
      fields.push(field('MAX DAILY OVERSHOOT', 'f-over', { type: 'number', min: '0', step: '100' }, 'maxOvershoot'));
    }
    modeFields.replaceChildren(...fields);
  }

  const dayBtns = DAY_BUTTONS.map(([d, name]) => h('button', { class: 'btn ghost small', 'aria-pressed': String(s.readingDays.includes(d)), onclick: e => {
    s.readingDays = s.readingDays.includes(d) ? s.readingDays.filter(x => x !== d) : [...s.readingDays, d];
    e.currentTarget.setAttribute('aria-pressed', String(s.readingDays.includes(d)));
    refreshSchedule();
  } }, name));

  const endInput = h('input', { type: 'date', id: 'f-end', value: s.targetEndDate, oninput: () => { s.targetEndDate = endInput.value; onChange?.(state); } });
  const dailyRefresh = () => { renderModeFields(); refreshSchedule(); };
  const calcPace = h('button', { class: 'btn small', onclick: () => {
    try {
      if (!s.targetEndDate) return notify('Pick a finish date first.', 'error');
      if (s.mode === 'per_week_chap') return notify('FINISH BY works with CHARS / DAY and CHARS / WEEK. For chapters per week, adjust the number of chapters.', 'error');
      const pace = paceForEndDate(chaptersFromList(state.chapters), s);
      if (pace === null) return notify(`${s.targetEndDate} cannot be reached from the start date with these chapters and reading days.`, 'error');
      s.dailyTarget = pace;
      notify(`To finish by ${s.targetEndDate} you need about ${num(s.dailyTarget)} chars per reading day.`);
      dailyRefresh();
    } catch (e) { notify(errorText(e), 'error'); }
  } }, 'CALC PACE');

  const formatSel = h('select', { id: 'f-format', onchange: () => { state.format = formatSel.value; refreshSchedule(); } },
    h('option', { value: 'kanji', selected: state.format === 'kanji' }, '一章 (Japanese)'), h('option', { value: 'english', selected: state.format === 'english' }, 'ch1 (English)'));

  /* panel 3: schedule */
  const scheduleHost = h('div');
  function refreshSchedule() {
    onChange?.(state);
    const { schedule, error } = computeSchedule(state);
    if (error) {
      scheduleHost.replaceChildren(h('div', { class: 'msg' }, errorText(error)));
      return;
    }
    scheduleHost.replaceChildren(renderScheduleBody(schedule, state), exportButtons(state, schedule, notify, true));
  }

  app.append(
    h('section', { class: 'box no-print' }, h('h2', {}, h('span', { class: 'step' }, '1'), 'BOOK'),
      h('label', { for: 'book-title' }, 'BOOK / CLUB NAME'), titleInput,
      h('div', { style: 'margin-top:16px' }, drop, detectHost, pasteBox), summary, tableHost),
    h('section', { class: 'box no-print' }, h('h2', {}, h('span', { class: 'step' }, '2'), 'PACE'),
      h('div', { class: 'row' }, modeBtns), modeHelp, modeFields,
      h('div', { class: 'grid' },
        h('div', {}, h('label', { for: 'f-start' }, 'START DATE'), h('input', { type: 'date', id: 'f-start', value: s.startDate, oninput: e => { if (e.target.value) { s.startDate = e.target.value; refreshSchedule(); } } })),
        h('div', {}, h('label', { for: 'f-format' }, 'CHAPTER NAMES'), formatSel),
        h('div', {}, h('label', { for: 'f-end' }, 'FINISH BY (OPTIONAL)'), endInput, calcPace)),
      h('div', { class: 'label' }, 'READING DAYS'), h('div', { class: 'row' }, dayBtns)),
    h('section', { class: 'box' }, h('h2', { class: 'no-print' }, h('span', { class: 'step' }, '3'), 'SCHEDULE'), printTitle, scheduleHost, noteBox));

  renderModeFields();
  refreshBook();
}
