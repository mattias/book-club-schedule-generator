import { decodeState, encodeState, parseHash, editHash } from './share.js';
import { mountEditor, mountShared, defaultState, errorText } from './ui.js';
import { mountThemePicker } from './themeui.js';

const app = document.getElementById('app');
mountThemePicker(document.getElementById('theme-host'));
const baseUrl = () => location.pathname + location.search;

/** Keep the URL in step with the editor so a reload (or a copied address) returns to exactly this state. */
let timer = null;
function persist(state) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const payload = await encodeState({ title: state.title, format: state.format, chapters: state.chapters, settings: state.settings });
    history.replaceState(null, '', baseUrl() + editHash(payload));
  }, 250);
}

const withDefaults = shared => ({ ...shared, settings: { targetEndDate: '', ...shared.settings } });

async function boot() {
  clearTimeout(timer);
  const { mode, payload } = parseHash(location.hash);
  if (mode === 'new') return mountEditor(app, defaultState(), { onChange: persist });
  try {
    const state = withDefaults(await decodeState(payload, { allowEmpty: mode === 'edit' }));
    if (mode === 'edit') return mountEditor(app, state, { onChange: persist });
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
