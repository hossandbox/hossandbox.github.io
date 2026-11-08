/**
 * Screenshot import for the four ELD clocks (patch 12) — the browser half.
 *
 * eldocr.ts decides what a screenshot's words may mean; this module is the only
 * place that runs the reader. It is imported dynamically by the panel, on the
 * driver's first tap of "Import from a screenshot" and not before, so the OCR
 * engine's weight never lands on the app's ordinary load path: esbuild splits
 * it into a lazy chunk, and its engine assets (worker script, wasm core,
 * English data) ship under dist/ocr/ — built from this project's own
 * node_modules by build.mjs, fetched from this same origin on first use, never
 * from a CDN.
 *
 * The reader runs TWICE over the same image, in two layout modes (automatic,
 * then sparse-text): each mode has real clock screens where it drops a region
 * the other reads whole — the synthetic corpus in test/ocr-corpus/ shows the
 * automatic mode losing a card grid's labels and sparse mode garbling a wide
 * value elsewhere. Both word lists go back to the panel, eldocr.ts extracts
 * from each, and mergeExtractions keeps only what survives the disagreement
 * rule. Two passes cost a few extra seconds on an explicit, driver-tapped
 * action; a clock that fills is worth more than a fast guess.
 *
 * The privacy fence is structural, not a promise in a dialog: the picked image
 * is handed to a worker on this device and nowhere else. There is no upload
 * (this module makes no network call of its own — the worker, core and
 * language files are the app's own static assets), and nothing is persisted:
 * tesseract's cache is set to 'none', so neither the image nor the language
 * data touch localStorage or IndexedDB, and the worker is terminated when the
 * read ends. What comes back is words — text, confidence, position — twice.
 */
import type { OcrWord } from './eldocr.ts';

export interface EldScreenshotReads {
  auto: OcrWord[];
  sparse: OcrWord[];
}

export async function recognizeEldScreenshot(image: Blob): Promise<EldScreenshotReads> {
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  // The OCR assets sit in an ocr/ folder beside the app itself (dist/ocr/).
  // document.baseURI is the page's own URL, so this stays correct wherever the
  // app is served from — and resolvePaths inside tesseract keeps absolute URLs.
  const base = new URL('ocr/', document.baseURI).href;
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    gzip: true,
    cacheMethod: 'none',
    logger: () => {},
  });
  const flatten = (blocks: readonly { paragraphs: readonly { lines: readonly { words: readonly OcrWord[] }[] }[] }[] | null): OcrWord[] => {
    const words: OcrWord[] = [];
    for (const b of blocks ?? []) {
      for (const p of b.paragraphs) {
        for (const l of p.lines) {
          for (const w of l.words) words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });
        }
      }
    }
    return words;
  };
  try {
    const auto = flatten((await worker.recognize(image, {}, { text: false, blocks: true })).data.blocks);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const sparse = flatten((await worker.recognize(image, {}, { text: false, blocks: true })).data.blocks);
    return { auto, sparse };
  } finally {
    await worker.terminate();
  }
}
