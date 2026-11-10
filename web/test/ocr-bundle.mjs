/**
 * Screenshot-import bundle pin (patch 18).
 *
 * Patch 12's reader passed every check and then failed for every driver, because
 * every check loaded tesseract.js the way Node does. The app does not: build.mjs
 * bundles for the browser with code splitting, and esbuild puts tesseract.js (a
 * CommonJS package) in a lazy chunk whose ONLY export is `default`. The runner
 * read createWorker / OEM / PSM off the namespace, got three undefineds, and
 * threw on OEM.LSTM_ONLY before a worker was ever asked for.
 *
 * This pin goes through that path, in two passes. It builds src/eldocr-run.ts
 * with the same esbuild settings build.mjs uses (browser platform, ESM,
 * splitting, minified), then imports the BUILT runner.
 *
 * Pass 1 calls the runner with a stand-in Worker that refuses to start. The
 * call must get as far as asking for that Worker — which means createWorker
 * and OEM resolved and createWorker ran — and the worker script it asks for
 * must be this app's own ocr/worker.min.js beside the page.
 *
 * Pass 2 calls the runner again with a stand-in Worker that ANSWERS every
 * job, so the built runner runs to completion — both recognition passes and
 * the setParameters call between them. That is what proves PSM resolved too:
 * pass 1 stops before PSM is ever touched (fresh verification of patch 18,
 * mutant M6: `PSM` alone read off the namespace stayed green under pass 1
 * alone and broke every import in the browser). Pass 2 asserts the job order
 * (load, loadLanguage, initialize, recognize, setParameters, recognize), that
 * initialize carries OEM.LSTM_ONLY, that setParameters carries
 * PSM.SPARSE_TEXT, that the core and language paths sit under the app's own
 * ocr/ folder, and that the worker is terminated exactly once.
 *
 * What neither pass does: real OCR. The answering Worker returns canned
 * words, so the reader's control flow runs end to end but no image is ever
 * actually read; reading the corpus through the built app takes a browser.
 *
 * Run by `npm run smoke`, after the night-light checks.
 */
import { build } from 'esbuild';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const web = fileURLToPath(new URL('..', import.meta.url));
const out = join(web, 'dist-test/ocr-bundle');
const fail = (msg) => { console.error(`OCR BUNDLE FAIL — ${msg}`); process.exit(1); };

// The settings below mirror build.mjs. If the app's build stops splitting or
// stops emitting ESM, this pin is no longer looking at the shipped shape — say
// so loudly instead of passing against a shape nobody ships.
const buildSrc = readFileSync(join(web, 'build.mjs'), 'utf8');
for (const needle of ["format: 'esm'", 'splitting: true', 'minify: true', "target: ['es2022', 'chrome110', 'safari16']"]) {
  if (!buildSrc.includes(needle)) fail(`build.mjs no longer says \`${needle}\` — bring this pin's esbuild settings back in line with the real build`);
}

rmSync(out, { recursive: true, force: true });
await build({
  entryPoints: [join(web, 'src/eldocr-run.ts')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022', 'chrome110', 'safari16'],
  outdir: out,
  chunkNames: 'chunk-[hash]',
  splitting: true,
  logLevel: 'warning',
});

// The shape that bit: tesseract.js lands in a chunk of its own with a lone
// default export. If a future esbuild or tesseract changes that, the pin still
// runs — this line just records which shape it ran against.
const chunks = readdirSync(out).filter((f) => /^chunk-.*\.js$/.test(f));
const tessChunk = chunks.find((f) => readFileSync(join(out, f), 'utf8').includes('SPARSE_TEXT'));
if (!tessChunk) fail('the split build produced no separate tesseract chunk — the reader is no longer lazy-split the way the app ships it');
const loneDefault = /export default [\w$]+\(\);?\s*(\/\/# sourceMappingURL=.*)?\s*$/.test(readFileSync(join(out, tessChunk), 'utf8'));

// A page to be beside, and a Worker that refuses to start. The refusal is the
// signal: reaching it proves createWorker was found and called.
const REFUSED = 'ocr-bundle pin: stand-in Worker refused to start';
const asked = [];
const blobs = new Map();
const realCreate = URL.createObjectURL;
URL.createObjectURL = (b) => { const u = `blob:pin18/${blobs.size}`; blobs.set(u, b); return u; };
// (tesseract.js decides it is in a browser by finding `document`, then resolves
// its paths against window.location — so the stand-in page needs both.)
const PAGE = 'https://pin18.invalid/app/index.html';
globalThis.document = { baseURI: PAGE };
globalThis.window = { location: { href: PAGE } };
globalThis.Worker = class { constructor(url) { asked.push(String(url)); throw new Error(REFUSED); } };

const mod = await import(pathToFileURL(join(out, 'eldocr-run.js')).href);
if (typeof mod.recognizeEldScreenshot !== 'function') fail('the built runner does not export recognizeEldScreenshot');

let threw = null;
try {
  await mod.recognizeEldScreenshot(new Blob([new Uint8Array([0])], { type: 'image/png' }));
} catch (e) {
  threw = e;
}
URL.createObjectURL = realCreate;

const said = threw instanceof Error ? `${threw.name}: ${threw.message}` : String(threw);
if (asked.length === 0) {
  fail(`the built runner never asked for a Worker — it stopped at "${said}". In the split build tesseract.js's names live on the chunk's default export; the runner must read createWorker / OEM / PSM from there`);
}
if (!(threw instanceof Error) || threw.message !== REFUSED) {
  fail(`the built runner asked for a Worker but ended with "${said}", not the stand-in's refusal`);
}
if (asked.length !== 1) fail(`the built runner asked for ${asked.length} Workers on one read — expected exactly one`);

// The worker script must be the app's own, beside the page — never a CDN.
const script = blobs.has(asked[0]) ? await blobs.get(asked[0]).text() : asked[0];
const WANT = 'https://pin18.invalid/app/ocr/worker.min.js';
if (!script.includes(WANT)) fail(`the worker script must be ${WANT} (the app's own ocr/ folder beside the page) — saw ${JSON.stringify(script)}`);
if (/jsdelivr|unpkg|cdn\./i.test(script)) fail(`the worker script must not come from a CDN — saw ${JSON.stringify(script)}`);

// ---- Pass 2: an answering Worker, so the runner runs to its end. ----
// tesseract reads the image Blob through FileReader, which Node does not
// have; this stand-in hands back the Blob's own bytes.
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onload(); }); }
};
URL.createObjectURL = () => 'blob:pin18-pass2/0';
const jobs = [];
let terminated = 0;
globalThis.Worker = class {
  postMessage(p) {
    jobs.push(p);
    // Each recognize answer carries one canned word naming which recognition
    // pass it was (w1 = auto, w2 = sparse), so the result can be checked
    // against the pass that produced it.
    const data = p.action === 'recognize'
      ? { blocks: [{ paragraphs: [{ lines: [{ words: [{ text: `w${jobs.filter((j) => j.action === 'recognize').length}`, confidence: 90, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] }] }] }] }
      : {};
    queueMicrotask(() => this.onmessage({ data: { workerId: p.workerId, jobId: p.jobId, status: 'resolve', action: p.action, data } }));
  }
  terminate() { terminated++; }
};
// A fresh import (cache-busting query) so pass 2 runs the runner again from
// the top instead of reusing pass 1's module state.
const mod2 = await import(pathToFileURL(join(out, 'eldocr-run.js')).href + '?pass2=' + Date.now());
if (typeof mod2.recognizeEldScreenshot !== 'function') fail('pass 2: the built runner does not export recognizeEldScreenshot');
let reads = null;
try {
  reads = await mod2.recognizeEldScreenshot(new Blob([new Uint8Array([0])], { type: 'image/png' }));
} catch (e) {
  fail(`pass 2: the built runner did not finish a read against an answering Worker — it stopped at "${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}" (terminated=${terminated}, jobs=${jobs.map((j) => j.action).join(',')}). A tesseract name read off the module namespace is undefined in the split build and throws exactly here — PSM.SPARSE_TEXT is the one pass 1 cannot reach`);
}
URL.createObjectURL = realCreate;

const acts = jobs.map((j) => j.action);
const WANT_ORDER = ['load', 'loadLanguage', 'initialize', 'recognize', 'setParameters', 'recognize'];
if (JSON.stringify(acts) !== JSON.stringify(WANT_ORDER)) {
  fail(`pass 2: job order must be ${WANT_ORDER.join(', ')} — saw ${acts.join(', ') || '(none)'}`);
}
const initJob = jobs.find((j) => j.action === 'initialize');
if (!initJob || String(initJob.payload.oem) !== '1') {
  fail(`pass 2: initialize must carry OEM.LSTM_ONLY (oem 1) — saw ${JSON.stringify(initJob && initJob.payload)}`);
}
const spJob = jobs.find((j) => j.action === 'setParameters');
if (!spJob || !spJob.payload.params || spJob.payload.params.tessedit_pageseg_mode !== '11') {
  fail(`pass 2: setParameters must carry PSM.SPARSE_TEXT (tessedit_pageseg_mode '11') — saw ${JSON.stringify(spJob && spJob.payload)}`);
}
const OCR_DIR = 'https://pin18.invalid/app/ocr/';
const loadJob = jobs.find((j) => j.action === 'load');
if (!loadJob || !String(loadJob.payload.options.corePath).startsWith(OCR_DIR)) {
  fail(`pass 2: corePath must sit under ${OCR_DIR} — saw ${loadJob && loadJob.payload.options.corePath}`);
}
const langJob = jobs.find((j) => j.action === 'loadLanguage');
if (!langJob || !String(langJob.payload.options.langPath).startsWith(OCR_DIR)) {
  fail(`pass 2: langPath must sit under ${OCR_DIR} — saw ${langJob && langJob.payload.options.langPath}`);
}
if (!reads || !reads.auto[0] || reads.auto[0].text !== 'w1' || !reads.sparse[0] || reads.sparse[0].text !== 'w2') {
  fail(`pass 2: the two reads must come back as auto=w1, sparse=w2 — saw ${JSON.stringify(reads)}`);
}
if (terminated !== 1) fail(`pass 2: the worker must be terminated exactly once — saw ${terminated}`);

console.log(`ocr bundle OK — built runner reached createWorker through the split chunk (${tessChunk}: ${loneDefault ? 'lone default export' : 'NOT a lone default export — shape changed, pin still passed'}); worker script ${WANT}`);
console.log(`ocr bundle OK (pass 2) — built runner ran to completion against an answering Worker; jobs: ${acts.join(', ')}; oem 1; tessedit_pageseg_mode '11' (PSM.SPARSE_TEXT); corePath and langPath under ${OCR_DIR}; worker terminated once`);
