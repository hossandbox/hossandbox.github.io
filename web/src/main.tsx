import { render } from 'preact';
import { App } from './app.tsx';

render(<App />, document.getElementById('root')!);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
