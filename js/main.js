import { decodeState } from './share.js';
import { mountEditor, mountShared, defaultState, errorText } from './ui.js';

const app = document.getElementById('app');
let editing = null; // keeps the editor state while the user remixes a shared schedule

async function boot() {
  const payload = location.hash.slice(1);
  if (payload) {
    try {
      const shared = await decodeState(payload);
      const state = { ...shared, settings: { targetEndDate: '', ...shared.settings } };
      mountShared(app, state, {
        onRemix: () => {
          history.replaceState(null, '', location.pathname + location.search);
          mountEditor(app, state);
        },
      });
      return;
    } catch (e) {
      history.replaceState(null, '', location.pathname + location.search);
      mountEditor(app, (editing = defaultState()), { notice: errorText(e) });
      return;
    }
  }
  mountEditor(app, (editing = defaultState()));
}

window.addEventListener('hashchange', boot);
boot();
