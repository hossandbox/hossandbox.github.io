import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16'],
  outfile: 'dist/app.js',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  define: { __BUILD__: JSON.stringify(BUILD) },
  logLevel: 'info',
});

// stamp the service worker so caches roll over on each deploy
const sw = readFileSync('dist/sw.js', 'utf8').replace("self.__BUILD__ || 'dev'", JSON.stringify(BUILD));
writeFileSync('dist/sw.js', sw);
console.log('built', BUILD);
