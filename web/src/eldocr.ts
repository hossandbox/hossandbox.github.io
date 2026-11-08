/**
 * Screenshot import for the four ELD clocks (patch 12) — the pure half.
 *
 * Patch 8's quick start asks the driver to type four clocks; patch 11 let him say
 * them. This module is everything about READING them off a screenshot of the ELD's
 * own clocks screen that can be decided without a camera or an OCR engine: given
 * the words an on-device reader found (text, confidence, and where each word sits
 * on the image), which values may land in which box — and, more importantly, which
 * may not.
 *
 * The safety bar is asymmetric, like everything on this panel. A value that lands
 * in a box too HIGH invents driving time the driver does not have, so a read is
 * allowed into a box only when all of this holds: the value's shape is an exact
 * clock shape (H:MM, or an "Xh Ym" pair), every word it came from was read at or
 * above OCR_MIN_CONFIDENCE, a label word for that clock sits beside or above it,
 * no OTHER value claims the same clock with a different number of minutes, and
 * the value fits inside that clock's own maximum. Anything else — a smudged
 * digit, a time with no label near it, a number too big for the clock it sat
 * beside — stays OUT, and the panel tells the driver in plain words what was
 * read and what was not. Nothing here seeds: accepted values land in the same
 * text boxes typing uses, and the panel's ordinary confirm (applyEldSeed, behind
 * readEldEntry's whole-number fence) is still the only way in. The image itself
 * never reaches this module — the browser half (eldocr-run.ts) hands over words
 * only, and discards the picture.
 *
 * Two claim shapes an independent verification (checkpoint 1) caught this module
 * getting wrong, now part of the bar: a limit printed as part of a label —
 * "Cycle (70h) Left 28:51" — is itself a clock-shaped candidate sitting nearest
 * the label, and it must not take the box over the row's real value; and a
 * second label token naming the same clock from another line ("Last break
 * 06:00" in a header, above the real "Break Due In" row) is a rival claim, not
 * a weaker one. Ambiguity blanks the clock and reports both values; it never
 * picks a winner by score.
 *
 * Checkpoint 2 closed the two paths that still let that class through when
 * the row's real value is never read at all (a screenshot cropped through the
 * value, or a value too faint for the confidence floor): the label's own
 * bare-hours token — "(70h)", "14hr", a limit of ANY size, not only the
 * statutory maxima — was left as the only claimant and filled the box with
 * the limit (D4), and a LONE "Last break 06:00" header, with no real row
 * beneath it to contest, filled the break box with a time of day (D5). So a
 * claim now comes in two kinds. A limit annotation and an info-line claim
 * may still CONTEST a clock — beside a real value they blank it, exactly as
 * before — but neither can ever be the read that fills it: when they are all
 * a clock has, the clock stays blank and the numbers are only reported.
 *
 * Checkpoint 3 closed the same two classes' remaining members. The info
 * marker no longer has to stand immediately before the label word: a short
 * walk left from the label — across at most three words, stopping at a
 * value-shaped word or a wide gap — finds "last" / "since" / "previous" /
 * "prev", so "Last 30-min break 06:00" and "Previous break 06:00" are info
 * lines too (D7). The parenthesis arm of the annotation rule now covers a
 * candidate of ANY shape sitting inside a label phrase — "(70:00)" and
 * "(70h 0m)" are annotations exactly as "(70h)" is (D6a). And the limit
 * printed in its own column, beyond any closeness rule's reach, is closed
 * by policy rather than geometry (D6b, Lorico's call): an unpaired
 * bare-hours token can NEVER fill a box, wherever it sits, because every
 * statutory limit is printed in exactly that shape and no spacing rule can
 * tell a limit column from a value column. Bare-hours tokens still contest
 * and are still reported; pairs ("7h 15m") and minutes-only tokens ("45m"),
 * which no limit is ever printed as, still fill.
 *
 * Checkpoint 4 closed the info class's last two members and added the
 * cheap half of the colon-limit column. The marker walk is bounded by
 * the text run, not by a word count — "Last 30 minute rest break 06:00"
 * (the regulation's own phrase, unhyphenated, the marker four words from
 * the label) is an info line, and the walk no longer stops at unit
 * tokens like "10h", which are part of the phrase, not values standing
 * in it (D8). And when a label word starts its line, the walk continues
 * onto the line directly above when that line reads as the top half of
 * a wrapped title — text only, at title-wrap distance, left-aligned
 * with the label — so "PREVIOUS" / "BREAK" / "06:00" on a tile is an
 * info line too (D9). A "Limit" / "Max" column header now annotates
 * the clean value column beneath it, so a colon-format limit column
 * cropped through its Remaining column fills nothing (D10, the cheap
 * partial). What remains is stated plainly: the same colon-limit table
 * WITHOUT a header row is indistinguishable from pin (p) — a lone full
 * clock, which must fill — and stays a documented residual, Lorico's
 * accepted endpoint unless he later chooses that policy too.
 */

export type EldClockKey = 'driveLeft' | 'windowLeft' | 'breakDueIn' | 'cycleLeft';

export interface OcrBBox { x0: number; y0: number; x1: number; y1: number }

export interface OcrWord {
  text: string;
  confidence: number; // 0–100, as the reader reports it
  bbox: OcrBBox;
}

export interface EldFieldSpec {
  key: EldClockKey;
  /** The field's own ceiling in minutes — the same maximum the panel's typed boxes are read against. */
  max: number;
}

export interface EldFieldRead {
  minutes: number;
  /** The lowest confidence among the words the value was read from. */
  confidence: number;
}

export interface EldExtraction {
  /** Clocks read well enough to prefill, by field key. Absent key = not read; the box is left as it was. */
  filled: Partial<Record<EldClockKey, EldFieldRead>>;
  /** Confident clock-shaped values no label claimed (or that fit no clock they sat beside). Minutes, in reading order. */
  unplaced: number[];
  /** Clock-shaped candidates dropped because a word was read below the confidence floor or the value fits no clock at all. */
  rejected: number;
  /**
   * Clocks that stayed unfilled because the reads could not agree on one value:
   * two different values claimed the same clock (in one pass, or across the two
   * reader passes — mergeExtractions reports those too). Both minutes are named,
   * in claim order. The field stays unfilled: the disagreement is itself the
   * doubt, and no tie-break is safe.
   */
  disagreed: Partial<Record<EldClockKey, [number, number]>>;
}

/**
 * The confidence floor for a word to take part in a value that lands in a box.
 * Tesseract's word confidences run high on clean rendered text (the synthetic
 * corpus reads its clean screens at 94–96) and fall off exactly where a digit is
 * doubtful. 80 keeps a clearly-read screen whole while a smudge — the failure
 * that matters, a digit misread into MORE time — stays out.
 */
export const OCR_MIN_CONFIDENCE = 80;

interface Candidate {
  minutes: number;
  confidence: number;
  bbox: OcrBBox;
  /**
   * True when this candidate is the clock's limit, not a value the row
   * reports: it sits inside a label's own phrase in parentheses —
   * "(70h)" in "Cycle (70h) Left", "(70:00)", "(70h 0m)" (D4, D6a) — or
   * it stands in a column a "Limit" / "Max" header heads (D10). Such a
   * candidate may contest the clock but can never fill it. For an
   * unpaired bare-hours token the parenthesis alone is enough (a
   * reported value is never set in parentheses); a colon value or an
   * "Xh Ym" pair must also sit inside the label's phrase — the same
   * value in the value column, parentheses and all, is a value.
   */
  limitAnnotation: boolean;
  /**
   * True when this candidate is an unpaired bare-hours token — "62h" with
   * no minutes part. By policy (D6b) such a token can never fill a box
   * wherever it sits: every statutory limit is printed in this shape, and
   * a limit column is geometrically indistinguishable from a value column.
   * It may still contest a clock and is reported like any other read.
   */
  bareHours: boolean;
}

const cy = (b: OcrBBox) => (b.y0 + b.y1) / 2;
const height = (b: OcrBBox) => Math.max(1, b.y1 - b.y0);

function sameLine(a: OcrBBox, b: OcrBBox): boolean {
  return Math.abs(cy(a) - cy(b)) <= 0.6 * Math.max(height(a), height(b));
}

function unionBox(a: OcrBBox, b: OcrBBox): OcrBBox {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

/** A word as the grammar sees it: quotes/brackets/trailing stops stripped, case kept for the caller. */
function cleaned(text: string): string {
  return text.replace(/^["'(]+|["').,;:]+$/g, '');
}

const COLON = /^(\d{1,3}):(\d{2})$/;
const HOURS_WORD = /^(\d{1,3})(?:h|hr|hrs)$/i;
const MINUTES_WORD = /^(\d{1,2})(?:m|min|mins)$/i;

/**
 * Find the clock-shaped values in the word stream. Shapes, and nothing else:
 * "7:15" as one word; "7h 15m" / "7h" / "15m" as unit words (the pair must sit on
 * one line). A decimal ("7.5") matches nothing — it is not a candidate, never a
 * converted one; the whole-number fence from patch 9.2 holds here by shape, not
 * by cleanup. Minutes past 59 are not a clock and match nothing either.
 */
function findCandidates(words: OcrWord[]): { candidates: Candidate[]; rejected: number } {
  const candidates: Candidate[] = [];
  let rejected = 0;
  const used = new Set<number>();
  const push = (minutes: number, conf: number, bbox: OcrBBox, limitAnnotation = false, bareHours = false) => {
    if (conf < OCR_MIN_CONFIDENCE) { rejected++; return; }
    candidates.push({ minutes, confidence: conf, bbox, limitAnnotation, bareHours });
  };
  for (let i = 0; i < words.length; i++) {
    if (used.has(i)) continue;
    const w = words[i];
    const t = cleaned(w.text);
    const colon = COLON.exec(t);
    if (colon) {
      const h = Number(colon[1]), m = Number(colon[2]);
      if (m <= 59 && h <= 99) { used.add(i); push(h * 60 + m, w.confidence, w.bbox, isLimitAnnotation(words, i, i, false) || isHeaderAnnotation(words, w.bbox)); }
      continue;
    }
    const hw = HOURS_WORD.exec(t);
    if (hw) {
      const h = Number(hw[1]);
      if (h > 99) continue;
      const next = i + 1 < words.length && !used.has(i + 1) ? words[i + 1] : null;
      const mw = next ? MINUTES_WORD.exec(cleaned(next.text)) : null;
      if (next && mw && sameLine(w.bbox, next.bbox)) {
        const m = Number(mw[1]);
        if (m <= 59) {
          used.add(i); used.add(i + 1);
          const box = unionBox(w.bbox, next.bbox);
          push(h * 60 + m, Math.min(w.confidence, next.confidence), box, isLimitAnnotation(words, i, i + 1, false) || isHeaderAnnotation(words, box));
          continue;
        }
      }
      used.add(i);
      push(h * 60, w.confidence, w.bbox, isLimitAnnotation(words, i, i, true) || isHeaderAnnotation(words, w.bbox), true);
      continue;
    }
    const mw = MINUTES_WORD.exec(t);
    if (mw) {
      const m = Number(mw[1]);
      if (m <= 59) { used.add(i); push(m, w.confidence, w.bbox); }
    }
  }
  return { candidates, rejected };
}

/** A word reduced to the letters the grammar matches on ("(70h)" → "h", "28:51" → ""). */
const alphaOf = (text: string): string => cleaned(text).toLowerCase().replace(/[^a-z]/g, '');

/**
 * Does a label word's own phrase reach this token — same line, the label
 * to its left, nothing between them but the label's own phrase words — and
 * does the token sit CLOSE to the phrase: within two word-heights of the
 * phrase's end? A limit token is set in the label's own text run, a space
 * away; a value in the value column stands many heights from its label.
 * Since checkpoint 3 this closeness test decides a FILL only through the
 * parenthesis arm below (for a colon value or an "Xh Ym" pair); for an
 * unpaired bare-hours token the annotation flag no longer changes any
 * outcome, because the D6b policy already keeps every such token out of
 * the boxes wherever it sits.
 */
function phraseWalkClose(words: OcrWord[], ti: number): boolean {
  const tok = words[ti];
  const line = words.filter((w) => sameLine(w.bbox, tok.bbox)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const tPos = line.indexOf(tok);
  if (tPos < 0) return false;
  for (let li = 0; li < tPos; li++) {
    if (LABEL_WORDS[alphaOf(line[li].text)] === undefined) continue;
    if (line[li].bbox.x1 > tok.bbox.x0 + 4) continue;
    let prev = line[li];
    let inside = true;
    for (let k = li + 1; k < tPos; k++) {
      const a = alphaOf(line[k].text);
      if (a !== '' && !LABEL_PHRASE.has(a)) { inside = false; break; }
      prev = line[k];
    }
    if (inside && tok.bbox.x0 - prev.bbox.x1 <= 2 * height(tok.bbox)) return true;
  }
  return false;
}

/**
 * D4/D6a: is this candidate a limit annotation — the clock's limit printed
 * as part of its label, as in "Cycle (70h) Left"? For an unpaired
 * bare-hours token, either of two shapes says yes: parentheses wherever it
 * sits (a reported value is never set in parentheses), or the phrase-walk
 * reaching it closely. The token's size is irrelevant — a "(60h)"
 * annotation on a 70-hour clock is a limit token exactly as "(70h)" is.
 * For a colon value or an "Xh Ym" pair, parentheses alone do not convict:
 * the candidate must ALSO sit inside the label's phrase (the phrase-walk
 * reaching it closely), because the same shapes in the value column are
 * values, parentheses and all.
 */
function isLimitAnnotation(words: OcrWord[], first: number, last: number, bare: boolean): boolean {
  const hasParens = words.slice(first, last + 1).some((w) => /[()]/.test(w.text));
  if (bare) return hasParens || phraseWalkClose(words, first);
  return hasParens && phraseWalkClose(words, first);
}

/** Column-header words that turn the column beneath them into limits. */
const HEADER_WORDS = new Set(['limit', 'max', 'maximum', 'limits', 'cap', 'allowed']);

/**
 * D10 (the cheap partial): is this candidate a limit because a "Limit" /
 * "Max" column header heads the column it sits in? A table that prints
 * its limits as full clocks — "11:00 14:00 8:00 70:00" under a "Limit"
 * header — gives each limit exactly the shape of a value, so in-phrase
 * and bare-hours rules cannot see it; cropped through the Remaining
 * column, the limits were the only reads left and they filled every box.
 * The header is the one signal the shape itself carries: a header word
 * above the token, its span overlapping the token's (it heads THIS
 * column, not a neighbouring one), with nothing between them in the
 * column but value-shaped words — the column is a clean column of
 * values under its header, however many rows it runs; the purity test
 * is the bound, not a distance, because a table's row count is the
 * layout's business, not the header's. Anything else intervening (a
 * label word, a caption) breaks the header's reach, and a token the
 * header does not overlap is untouched: values under a "Remaining"
 * header fill as always, and a headerless colon-limit table stays
 * pin (p)'s twin — the documented residual.
 */
function isHeaderAnnotation(words: OcrWord[], bbox: OcrBBox): boolean {
  for (const h of words) {
    if (!HEADER_WORDS.has(alphaOf(h.text))) continue;
    if (sameLine(h.bbox, bbox)) continue;
    if (h.bbox.y1 > bbox.y0 + 4) continue; // the header must sit above the token
    if (Math.min(h.bbox.x1, bbox.x1) - Math.max(h.bbox.x0, bbox.x0) <= 0) continue;
    let clean = true;
    for (const u of words) {
      if (u === h || sameLine(u.bbox, h.bbox)) continue;
      if (u.bbox.y0 < h.bbox.y1 - 4 || u.bbox.y1 > bbox.y0 + 4) continue;
      if (Math.min(u.bbox.x1, bbox.x1) - Math.max(u.bbox.x0, bbox.x0) <= 0) continue;
      if (!isValueShaped(u.text)) { clean = false; break; }
    }
    if (clean) return true;
  }
  return false;
}

/** The label words that name a clock. Everything else on the screen is scenery. */
const LABEL_WORDS: Record<string, EldClockKey> = {
  drive: 'driveLeft', driving: 'driveLeft',
  shift: 'windowLeft', window: 'windowLeft',
  break: 'breakDueIn',
  cycle: 'cycleLeft',
};

interface LabelToken {
  key: EldClockKey;
  bbox: OcrBBox;
  /**
   * True when the label word heads an info phrase rather than a clock row:
   * "Last break 06:00" names when the break was taken, not a clock remaining
   * (D5). An info label's claims may contest a clock but can never fill it.
   */
  info: boolean;
}

/** Words that turn a label word into an info phrase when they stand before it on its line. */
const INFO_PREFIX = new Set(['last', 'since', 'previous', 'prev']);

/** A word shaped like a clock value (the same shapes findCandidates reads). */
function isValueShaped(text: string): boolean {
  const t = cleaned(text);
  return COLON.test(t) || HOURS_WORD.test(t) || MINUTES_WORD.test(t);
}

/**
 * Walk a label's text run right-to-left looking for an info marker
 * ("last" / "since" / "previous" / "prev"). The run is bounded by its
 * shape, not by a word count (D8): the walk stops at a colon-shaped
 * word — a neighbouring column's read ends the phrase — or at a gap
 * wider than two word-heights — a column break ends it too — and at
 * nothing else. Unit tokens ("10h", "30m") do not stop it: they are
 * part of the phrase itself ("Last 30 minute rest break", "Since last
 * 10h break"), and checkpoint 3's three-word bound left exactly those
 * natural phrasings outside. `left` holds the run's words standing
 * left of the label, sorted left to right; `edge` tracks the right
 * edge of the word under examination's neighbour, as in the original
 * walk, so the gap test measures each step of the run.
 */
function runWalk(left: OcrWord[], label: OcrWord): boolean {
  let edge = label.bbox.x0;
  for (let k = left.length - 1; k >= 0; k--) {
    const p = left[k];
    if (COLON.test(cleaned(p.text))) return false;
    if (edge - p.bbox.x1 > 2 * Math.max(height(p.bbox), height(label.bbox))) return false;
    if (INFO_PREFIX.has(alphaOf(p.text))) return true;
    edge = p.bbox.x0;
  }
  return false;
}

/**
 * D9: the label word starts its line, but its phrase may start on the
 * line above — a tile title that wrapped ("PREVIOUS" / "BREAK"). The
 * walk continues onto the line directly above only when that line
 * reads as the top half of THIS label's title: it sits at title-wrap
 * distance (its bottom within ~1.6 label-heights of the label's top),
 * it carries no value of its own (a line with a value on it is another
 * row, not a title fragment — its read already claims and contests on
 * its own line), and the fragment over the label's column starts at
 * the label's own left edge, as a left-aligned wrap does. (Measured on
 * the verifier's screens, a wrapped fragment's last word can end RIGHT
 * of the label's right edge — "PREVIOUS" is wider than "BREAK" — so
 * the alignment that holds is the shared left edge, not the right.)
 * The same stops and the same marker set then apply across the joined
 * run, via runWalk.
 */
function wrappedTitleInfo(words: OcrWord[], w: OcrWord, label: OcrWord = w): boolean {
  const above = words.filter((u) => u !== w && !sameLine(u.bbox, w.bbox) && u.bbox.y1 <= w.bbox.y0 + 4);
  if (above.length === 0) return false;
  const bottom = Math.max(...above.map((u) => u.bbox.y1));
  if (w.bbox.y0 - bottom > 1.6 * height(w.bbox)) return false;
  const anchor = above.find((u) => u.bbox.y1 === bottom) as OcrWord;
  const lineAbove = above.filter((u) => sameLine(u.bbox, anchor.bbox)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  if (lineAbove.some((u) => COLON.test(cleaned(u.text)))) return false;
  const frag = lineAbove.filter((u) => u.bbox.x0 < w.bbox.x1 && u.bbox.x1 > w.bbox.x0);
  if (frag.length === 0) return false;
  if (Math.abs(frag[0].bbox.x0 - w.bbox.x0) > height(w.bbox)) return false;
  return runWalk(frag, w) || (label !== w && frag.some((u) => INFO_PREFIX.has(alphaOf(u.text))));
}

function findLabels(words: OcrWord[]): LabelToken[] {
  const out: LabelToken[] = [];
  for (const w of words) {
    const key = LABEL_WORDS[alphaOf(w.text)];
    if (!key) continue;
    // The marker hunt is a walk left from the label word through its
    // text run (D7, D8), and — when the label starts its line — onto
    // the line above, if that line is the top half of a wrapped title
    // (D9). The immediate predecessor was checkpoint 2's rule; it missed
    // the natural phrasings — "Last 30-min break", "Last rest break",
    // "Previous break" — where a word stands between the marker and the
    // label. (The sibling phrasings — "Break taken 06:00", "Break at
    // 06:00" — put their marker BETWEEN the label and the value instead,
    // where the clear-path rule in claimScore already refuses the claim.)
    const line = words.filter((p) => sameLine(p.bbox, w.bbox)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const pos = line.indexOf(w);
    let info = runWalk(line.slice(0, pos), w);
    if (!info) {
      // CK5 prototype: the wrap test is run-local, not line-global — anchor it
      // at the first word of the label's own text run (same stops as runWalk).
      let start = w, edge = w.bbox.x0;
      for (let k = pos - 1; k >= 0; k--) {
        const p = line[k];
        if (COLON.test(cleaned(p.text))) break;
        if (edge - p.bbox.x1 > 2 * Math.max(height(p.bbox), height(w.bbox))) break;
        start = p; edge = p.bbox.x0;
      }
      info = wrappedTitleInfo(words, start, w);
    }
    out.push({ key, bbox: w.bbox, info });
  }
  return out;
}

/** Words that may stand inside a label's own phrase ("Drive Time Left", "Break Due In"). */
const LABEL_PHRASE = new Set([
  'time', 'left', 'remaining', 'due', 'in', 'until', 'required', 'clock', 'clocks',
  'hour', 'hours', 'rest', 'duty', 'limit', 'max', 'of', 'the',
]);

/**
 * How strongly a label claims a value, or null when it does not claim it at all.
 * A label claims a value that sits on its own line to its right, or directly
 * beneath it (the stacked-card layout) with their spans roughly aligned. Lower
 * is nearer; an above-label starts behind a same-line one (the +1.5), because a
 * row's own label is the stronger claim.
 *
 * A same-line claim also needs a clear path: every word between the label and
 * the value on that line must belong to the label's own phrase. Without that,
 * an info line like "Shift started 06:00" — the word Shift beside a time that
 * is NOT the shift clock — would claim the value, and adjacency alone cannot
 * tell it apart from the real row.
 */
function claimScore(value: OcrBBox, label: OcrBBox, words: OcrWord[]): number | null {
  if (sameLine(value, label) && label.x1 <= value.x0 + 4) {
    for (const w of words) {
      if (w.bbox.x1 <= label.x1 || w.bbox.x0 >= value.x0) continue; // not between them
      if (!sameLine(w.bbox, value)) continue;
      if (LABEL_PHRASE.has(cleaned(w.text).toLowerCase().replace(/[^a-z]/g, ''))) continue;
      return null; // something foreign stands between the label and the value
    }
    return Math.max(0, (value.x0 - label.x1) / height(value));
  }
  const vGap = value.y0 - label.y1;
  if (vGap >= -4 && vGap <= 1.5 * height(value)) {
    const overlap = Math.min(value.x1, label.x1) - Math.max(value.x0, label.x0);
    if (overlap >= -0.25 * Math.max(1, value.x1 - value.x0)) return 1.5 + Math.max(0, vGap) / height(value);
  }
  return null;
}

/**
 * Read the four clocks out of one screenshot's words. Pure: same words in, same
 * extraction out, so the panel and the tests share exactly one reading.
 */
export function extractEldClocks(words: OcrWord[], fields: EldFieldSpec[]): EldExtraction {
  const maxOf = new Map(fields.map((f) => [f.key, f.max]));
  const maxAll = Math.max(...fields.map((f) => f.max));
  const labels = findLabels(words);
  const { candidates, rejected: lowConfidence } = findCandidates(words);
  let rejected = lowConfidence;

  interface Claim { candidate: Candidate; score: number; info: boolean }
  const claims = new Map<EldClockKey, Claim[]>();
  const unclaimed: Candidate[] = []; // read cleanly, but no label claims them at all
  const unplaced: number[] = [];

  for (const c of candidates) {
    if (c.minutes > maxAll) { rejected++; continue; } // fits no clock on the panel — not a clock reading at all
    let best: { key: EldClockKey; score: number; info: boolean } | null = null;
    for (const l of labels) {
      const s = claimScore(c.bbox, l.bbox, words);
      if (s !== null && (best === null || s < best.score)) best = { key: l.key, score: s, info: l.info };
    }
    if (best === null) { unclaimed.push(c); continue; }
    if (c.minutes > (maxOf.get(best.key) ?? 0)) { unplaced.push(c.minutes); continue; }
    const list = claims.get(best.key) ?? [];
    list.push({ candidate: c, score: best.score, info: best.info });
    claims.set(best.key, list);
  }

  const filled: Partial<Record<EldClockKey, EldFieldRead>> = {};
  const disagreed: Partial<Record<EldClockKey, [number, number]>> = {};
  const winners = new Map<EldClockKey, Candidate>();
  for (const [key, list] of claims) {
    list.sort((a, b) => a.score - b.score);
    // Two DIFFERENT values claiming one clock is a contest, whatever the score
    // gap: a header's "Last break 06:00" claims the break clock just as truly
    // as the row's own label claims 2:17, and score only says which text sat
    // nearer, not which the driver meant. The clock stays blank and both values
    // are reported — a mis-assigned clock is worse than a blank one. (Two claims
    // naming the SAME minutes are one read seen twice, not a contest.)
    const distinct: number[] = [];
    for (const x of list) if (!distinct.includes(x.candidate.minutes)) distinct.push(x.candidate.minutes);
    if (distinct.length > 1) {
      disagreed[key] = [distinct[0], distinct[1]];
      for (const m of distinct) unplaced.push(m);
      continue;
    }
    // The read that fills the box must be a PLAIN claim. A limit annotation
    // (D4) is the clock's own limit sitting in its label, an info-line
    // claim (D5) is a time of day, not a clock remaining, and an unpaired
    // bare-hours token (D6b) is the shape every limit is printed in —
    // any of the three may contest the clock (all joined the distinct
    // count above, beside a real value they still blank it), but none may
    // ever be the value that lands. A plain claim of the same minutes
    // outranks them; when they are all the clock has, the clock stays
    // blank and the values are only reported.
    const fillable = list.filter((x) => !x.candidate.limitAnnotation && !x.candidate.bareHours && !x.info);
    if (fillable.length === 0) {
      for (const x of list) unplaced.push(x.candidate.minutes);
      // The claim's line may still hold the row's real value, read but never
      // claimed — the annotation itself blocked its clear path. Name the
      // pair, as the shadow rule would have for a fill: two numbers stood
      // beside this clock, and neither may land.
      const other = unclaimed.find((c) => c.minutes !== distinct[0] && sameLine(c.bbox, list[0].candidate.bbox));
      if (other) disagreed[key] = [distinct[0], other.minutes];
      continue;
    }
    const first = fillable[0];
    filled[key] = { minutes: first.candidate.minutes, confidence: first.candidate.confidence };
    winners.set(key, first.candidate);
    for (const x of list) if (x !== first) unplaced.push(x.candidate.minutes);
  }

  // The shadow rule: a filled clock is contested by a second, SMALLER value
  // sitting on its own line that no label gave to it. That is the shape of a
  // limit printed inside the label — "Cycle (70h) Left 28:51": the "(70h)" token
  // is clock-shaped, claims the label, and wins on nearness, while the row's
  // real value stands unclaimed beside it (the token itself blocks its clear
  // path). The line demonstrably held a smaller number the fill may have
  // swallowed, so neither may land. Only a smaller shadow contests: a LARGER
  // number on the line (a printed limit beside a "used / limit" pair, say)
  // cannot make the fill an overstatement — filling the smaller value errs
  // toward the driver typing more, never toward inventing time. A value equal
  // to the clock's own maximum is held to the stricter account: any smaller
  // number on its line that did not itself fill a clock contests it, claimed
  // or not — a box prefilled to the statutory limit on a shared line is
  // exactly the overstatement this panel must never make.
  const winnerSet = new Set(winners.values());
  const shadowed = new Set<Candidate>();
  for (const [key, w] of [...winners]) {
    let shadow: Candidate | null = null;
    for (const c of candidates) {
      if (c === w || c.minutes >= w.minutes || !sameLine(c.bbox, w.bbox)) continue;
      if (unclaimed.includes(c) || (w.minutes === (maxOf.get(key) ?? 0) && !winnerSet.has(c))) { shadow = c; break; }
    }
    if (shadow) {
      delete filled[key];
      winners.delete(key);
      winnerSet.delete(w);
      disagreed[key] = [w.minutes, shadow.minutes];
      unplaced.push(w.minutes, shadow.minutes);
      shadowed.add(shadow);
    }
  }
  for (const c of unclaimed) if (!shadowed.has(c)) unplaced.push(c.minutes);
  return { filled, unplaced, rejected, disagreed };
}

/**
 * Merge the extractions of two reader passes over the same screenshot (the
 * browser half runs the reader in its automatic layout mode and in sparse-text
 * mode: each has real screens where it drops a region the other reads — the
 * corpus in test/ocr-corpus/ shows both). The merge keeps the panel's
 * asymmetry: a clock fills when either pass read it cleanly, fills with the
 * agreed value when both did, and does NOT fill when the passes name different
 * minutes for it — or when either pass found the clock contested on its own
 * screen. Two disagreeing reads are a doubt, and a doubt stays out.
 */
export function mergeExtractions(a: EldExtraction, b: EldExtraction): EldExtraction {
  const filled: Partial<Record<EldClockKey, EldFieldRead>> = {};
  const disagreed: Partial<Record<EldClockKey, [number, number]>> = {};
  const unplaced: number[] = [];
  for (const m of [...a.unplaced, ...b.unplaced]) if (!unplaced.includes(m)) unplaced.push(m);
  const keys = new Set([
    ...Object.keys(a.filled), ...Object.keys(b.filled),
    ...Object.keys(a.disagreed), ...Object.keys(b.disagreed),
  ] as EldClockKey[]);
  for (const key of keys) {
    // A contest inside either pass blanks the clock for the merge too: the
    // screen held two values for it, and the other pass merely read a subset.
    // A clean fill must not quietly override an ambiguity a pass did see.
    const da = a.disagreed[key];
    const db = b.disagreed[key];
    if (da ?? db) {
      const pair = (da ?? db) as [number, number];
      disagreed[key] = [pair[0], pair[1]];
      for (const v of [...(da ?? []), ...(db ?? [])]) if (!pair.includes(v) && !unplaced.includes(v)) unplaced.push(v);
      for (const src of [a, b]) {
        const f = src.filled[key];
        if (f && !pair.includes(f.minutes) && !unplaced.includes(f.minutes)) unplaced.push(f.minutes);
      }
      continue;
    }
    const ra = a.filled[key];
    const rb = b.filled[key];
    if (ra && rb) {
      if (ra.minutes === rb.minutes) filled[key] = ra.confidence >= rb.confidence ? ra : rb;
      else disagreed[key] = [ra.minutes, rb.minutes];
    } else if (ra ?? rb) {
      filled[key] = (ra ?? rb) as EldFieldRead;
    }
  }
  return { filled, unplaced, rejected: a.rejected + b.rejected, disagreed };
}
