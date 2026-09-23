import { render } from 'preact';
import { App } from './app.tsx';
import { getState, applyTheme } from './store.ts';

// apply before the first paint so a day-theme user never sees a dark flash
applyTheme(getState().theme);
render(<App />, document.getElementById('root')!);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
