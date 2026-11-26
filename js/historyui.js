// History dialog: the books / clubs worked on in this browser. Click one to open it in the editor.
import { h } from './ui.js';
import { loadHistory, removeHistory } from './history.js';
import { editHash } from './share.js';

const when = ms => new Date(ms).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });

export function mountHistory(host) {
  const list = h('ul', { class: 'history-list' });
  const empty = h('p', { class: 'dim' }, 'Nothing here yet. Give your book or club a name and it will show up here.');

  const button = h('button', { class: 'btn ghost small', type: 'button', 'aria-haspopup': 'dialog', onclick: () => { render(); dialog.showModal(); } }, '☰ HISTORY');

  function open(entry) {
    dialog.close();
    const hash = editHash(entry.payload);
    if (location.hash === hash) return; // already showing it
    location.hash = hash; // main.js listens for hashchange and restores the editor
  }

  function render() {
    const entries = loadHistory();
    empty.classList.toggle('hidden', entries.length > 0);
    list.replaceChildren(...entries.map(e => {
      const del = h('button', { class: 'btn small ghost', type: 'button', title: `Remove “${e.name}” from this list`, 'aria-label': `Remove ${e.name} from history`, onclick: () => {
        // two steps: a stray click should not lose the only copy of a link
        if (del.dataset.armed) { removeHistory(e.name); render(); return; }
        del.dataset.armed = '1';
        del.textContent = 'SURE?';
        del.addEventListener('blur', () => { delete del.dataset.armed; del.textContent = '✕'; }, { once: true });
      } }, '✕');
      return h('li', {},
        h('button', { class: 'history-open', type: 'button', onclick: () => open(e) },
          h('span', { class: 'history-name' }, e.name), h('span', { class: 'dim history-when' }, when(e.updated))),
        del);
    }));
  }

  const dialog = h('dialog', { class: 'modal-dialog narrow', 'aria-labelledby': 'history-title', onclick: e => { if (e.target === dialog) dialog.close(); } },
    h('div', { class: 'box' },
      h('h2', { id: 'history-title' }, 'YOUR BOOKS & CLUBS'),
      h('p', { class: 'intro' }, 'Saved in this browser only, one entry per name. It updates whenever you change that book in the editor.'),
      empty, list,
      h('div', { class: 'theme-actions' }, h('button', { class: 'btn green', type: 'button', onclick: () => dialog.close() }, 'CLOSE'))));

  host.replaceChildren(button, dialog);
}
