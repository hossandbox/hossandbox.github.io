#!/usr/bin/env node
/**
 * Patch 12 OCR corpus runner: feeds the synthetic ELD screens from
 * test/ocr-corpus/ (see tools/make-ocr-corpus.py) through the real reader —
 * tesseract.js, on this machine, with the language data pointed at this
 * project's own node_modules and its cache off, exactly as the app runs it —
 * and then through the app's own extraction (src/eldocr.ts, bundled on the
 * fly). Scores each image against manifest.json:
 *
 *   correct  the field filled with exactly the expected minutes
 *   blank    the field did not fill (safe; the driver types it)
 *   WRONG    the field filled with anything else, or an unexpected field
 *            filled — the one outcome the feature is built to never produce
 *
 * Usage: node tools/ocr-corpus-run.mjs [best|best_int]   (default: best)
 * Exit code is 1 when any field reads WRONG. OCR_DEBUG=1 prints the raw text.
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import pkg from 'tesseract.js';

const { createWorker, OEM, PSM } = pkg;
const root = fileURLToPath(new URL('..', import.meta.url)); // web/
const variant = process.argv[2] ?? 'best';
const langPath = join(root, 'node_modules/@tesseract.js-data/eng', variant === 'best_int' ? '4.0.0_best_int' : '4.0.0');
const corpusDir = join(root, 'test/ocr-corpus');
const manifest = JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8'));

const bundlePath = join(tmpdir(), 'eldocr-corpus-bundle.mjs');
await build({
  entryPoints: [join(root, 'src/eldocr.ts')], bundle: true, format: 'esm',
  platform: 'node', outfile: bundlePath, logLevel: 'silent',
});
const { extractEldClocks, mergeExtractions } = await import(bundlePath);

const FIELDS = [
  { key: 'driveLeft', max: 660 }, { key: 'windowLeft', max: 840 },
  { key: 'breakDueIn', max: 480 }, { key: 'cycleLeft', max: 4200 },
];

const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath, cacheMethod: 'none', gzip: true, logger: () => {},
});
// By default the runner mirrors the app: two passes (AUTO, then SPARSE_TEXT)
// whose extractions are merged under eldcr.ts's disagreement rule. OCR_PSM
// names a single mode instead, for diagnosing one pass on its own.
const singlePsm = process.env.OCR_PSM ? PSM[process.env.OCR_PSM] : null;
if (singlePsm) await worker.setParameters({ tessedit_pageseg_mode: singlePsm });

const wordsOf = (data) => {
  const words = [];
  for (const b of data.blocks ?? []) {
    for (const p of b.paragraphs) {
      for (const l of p.lines) {
        for (const w of l.words) words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });
      }
    }
  }
  return words;
};

let correct = 0, blank = 0, wrong = 0, unplacedMiss = 0;
for (const [file, expect] of Object.entries(manifest)) {
  const path = join(corpusDir, file);
  let r, data;
  if (singlePsm) {
    ({ data } = await worker.recognize(path, {}, { text: true, blocks: true }));
    r = extractEldClocks(wordsOf(data), FIELDS);
  } else {
    const first = await worker.recognize(path, {}, { text: true, blocks: true });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const second = await worker.recognize(path, {}, { text: true, blocks: true });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    data = second.data;
    r = mergeExtractions(
      extractEldClocks(wordsOf(first.data), FIELDS),
      extractEldClocks(wordsOf(second.data), FIELDS));
    if (process.env.OCR_DEBUG) {
      console.log('  auto text:', JSON.stringify(first.data.text));
      console.log('  sparse text:', JSON.stringify(second.data.text));
    }
  }
  const notes = [];
  for (const [k, m] of Object.entries(expect.filled)) {
    const got = r.filled[k];
    if (!got) { blank++; notes.push(`${k}: BLANK (want ${m})`); }
    else if (got.minutes !== m) { wrong++; notes.push(`${k}: WRONG got ${got.minutes}, want ${m}`); }
    else { correct++; notes.push(`${k}: ok`); }
  }
  for (const k of Object.keys(r.filled)) {
    if (!(k in expect.filled)) { wrong++; notes.push(`${k}: WRONG unexpected fill ${r.filled[k].minutes}`); }
  }
  for (const m of expect.unplacedIncludes ?? []) {
    if (!r.unplaced.includes(m)) { unplacedMiss++; notes.push(`unplaced: missing ${m} (saw ${JSON.stringify(r.unplaced)})`); }
  }
  console.log(`${file} [page conf ${data.confidence}] ${notes.join(' · ')}`);
  if (process.env.OCR_DEBUG) console.log('  text:', JSON.stringify(data.text));
}
await worker.terminate();
console.log(`variant=${variant}: correct=${correct} blank=${blank} WRONG=${wrong} unplacedMisses=${unplacedMiss}`);
process.exit(wrong > 0 ? 1 : 0);
