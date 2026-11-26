// Theme picker: a button that opens a dialog of preview cards. Choosing a card applies and saves it at once.
import { h } from './ui.js';
import { THEMES, loadTheme, saveTheme, applyTheme } from './theme.js';

export function mountThemePicker(host) {
  let current = loadTheme();
  applyTheme(current);

  const nameOf = id => THEMES.find(t => t.id === id).name;
  const button = h('button', { class: 'btn ghost small', type: 'button', 'aria-haspopup': 'dialog', onclick: () => dialog.showModal() });
  const refreshButton = () => { button.textContent = `⚙ THEME: ${nameOf(current)}`; };

  const note = h('p', { class: 'intro', 'aria-live': 'polite' }, 'Your choice is saved in this browser only. Shared links look the same for everyone.');

  const cards = THEMES.map(t => h('label', { class: 'theme-card', 'data-theme': t.id },
    h('input', { type: 'radio', name: 'theme', value: t.id, checked: t.id === current, onchange: () => {
      current = t.id;
      applyTheme(current);
      refreshButton();
      note.textContent = saveTheme(current) ? `Theme: ${t.name}. Saved.` : `Theme: ${t.name}. This browser would not save it, so it applies to this visit only.`;
    } }),
    h('span', { class: 'mini' },
      h('span', { class: 'name' }, t.name, h('span', { class: 'badge' }, '✓ ACTIVE')),
      h('span', { class: 'blurb', style: 'display:block' }, t.blurb),
      h('span', { class: 'swatches', 'aria-hidden': 'true' },
        h('i', { style: 'background:var(--yellow)' }), h('i', { style: 'background:var(--green)' }),
        h('i', { style: 'background:var(--cyan)' }), h('i', { style: 'background:var(--red)' }),
        h('i', { class: 'sample' }, 'Aa')))));

  const dialog = h('dialog', { class: 'modal-dialog', 'aria-labelledby': 'theme-title', onclick: e => { if (e.target === dialog) dialog.close(); } },
    h('div', { class: 'box' },
      h('h2', { id: 'theme-title' }, 'CHOOSE A THEME'),
      note,
      h('fieldset', { class: 'theme-list' }, h('legend', {}, 'Theme'), cards),
      h('div', { class: 'theme-actions' }, h('button', { class: 'btn green', type: 'button', onclick: () => dialog.close() }, 'DONE'))));

  refreshButton();
  host.replaceChildren(button, dialog);
}
