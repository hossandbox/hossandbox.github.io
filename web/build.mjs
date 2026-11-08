import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

// Lazy chunks carry content hashes in their names; clear the previous build's so
// dist never accumulates orphans (the entry keeps its stable name, app.js).
for (const f of readdirSync('dist')) {
  if (/^chunk-.*\.js(\.map)?$/.test(f)) rmSync(`dist/${f}`);
}

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16'],
  outdir: 'dist',
  entryNames: 'app',
  chunkNames: 'chunk-[hash]',
  splitting: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  define: { __BUILD__: JSON.stringify(BUILD) },
  logLevel: 'info',
});

// Screenshot import (patch 12): the OCR engine ships with the app, under
// dist/ocr/, and loads only when a driver first imports a screenshot — the
// worker script, the wasm core variants the reader may pick for this device,
// and the English data. All of it is copied from this project's own
// node_modules at build time; nothing is fetched from a CDN, at build time or
// at run time, and none of it joins the service worker's install cache (the
// worker's runtime cache picks the files up on first use, like any app asset).
// Only the LSTM core variants ship: the reader runs LSTM-only (OEM.LSTM_ONLY),
// so the legacy-engine cores would be dead weight.
mkdirSync('dist/ocr', { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', 'dist/ocr/worker.min.js');
for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
  cpSync(`node_modules/tesseract.js-core/tesseract-core-${variant}.wasm.js`, `dist/ocr/tesseract-core-${variant}.wasm.js`);
}
// The English data is the package's quantized "best_int" model (2.9 MB), not the
// full "best" model (10.9 MB): on the synthetic corpus (tools/ocr-corpus-run.mjs)
// the two read identically — 31 of 32 clocks exact, none wrong — because the
// panel's confidence floor, label claims and two-pass agreement rule are what
// keep a bad read out, not model size. If a real-device check ever shows the
// small model under-reading, this one line is the whole change.
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'dist/ocr/eng.traineddata.gz');

// stamp the service worker so caches roll over on each deploy
const sw = readFileSync('dist/sw.js', 'utf8').replace("self.__BUILD__ || 'dev'", JSON.stringify(BUILD));
writeFileSync('dist/sw.js', sw);
console.log('built', BUILD);
