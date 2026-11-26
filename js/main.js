import { decodeState, encodeState, parseHash, editHash } from './share.js';
import { mountEditor, mountShared, defaultState, errorText } from './ui.js';
import { mountThemePicker } from './themeui.js';
import { mountHistory } from './historyui.js';
import { recordHistory } from './history.js';

const app = document.getElementById('app');
mountThemePicker(document.getElementById('theme-host'));
mountHistory(document.getElementById('history-host'));
const baseUrl = () => location.pathname + location.search;

/** The name this editing session last saved under in the history, so a rename replaces that entry. */
let historyName = null;

/** Keep the URL in step with the editor so a reload (or a copied address) returns to exactly this state. */
let timer = null;
function persist(state) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const payload = await encodeState({ title: state.title, format: state.format, chapters: state.chapters, settings: state.settings });
    history.replaceState(null, '', baseUrl() + editHash(payload));
    historyName = recordHistory(state.title, payload, { replaces: historyName }) ?? historyName;
  }, 250);
}

const withDefaults = shared => ({ ...shared, settings: { targetEndDate: '', ...shared.settings } });

async function boot() {
  clearTimeout(timer);
  historyName = null;
  const { mode, payload } = parseHash(location.hash);
  if (mode === 'new') return mountEditor(app, defaultState(), { onChange: persist });
  try {
    const state = withDefaults(await decodeState(payload, { allowEmpty: mode === 'edit' }));
    if (mode === 'edit') {
      historyName = state.title.trim() || null;
      return mountEditor(app, state, { onChange: persist });
    }
    mountShared(app, state, {
      onRemix: () => {
        mountEditor(app, state, { onChange: persist });
        persist(state);
      },
    });
  } catch (e) {
    history.replaceState(null, '', baseUrl());
    mountEditor(app, defaultState(), { notice: errorText(e), onChange: persist });
  }
}

window.addEventListener('hashchange', boot);
boot();
