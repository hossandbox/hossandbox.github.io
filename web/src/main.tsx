import { render } from 'preact';
import { App } from './app.tsx';
import { getState, applyTheme, effectiveTheme, devicePrefersDark } from './store.ts';

// apply before the first paint so a day-theme user never sees a dark flash — the EFFECTIVE theme:
// a driver who never picked one gets their phone's palette, not the old day default (patch 7)
applyTheme(effectiveTheme(getState(), devicePrefersDark()));
render(<App />, document.getElementById('root')!);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
