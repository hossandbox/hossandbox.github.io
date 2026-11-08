/**
 * Voice entry for the four ELD clocks (patch 11) — the pure half.
 *
 * Patch 8's quick start asks the driver to type four clocks into hours/minutes boxes.
 * This module is everything about SAYING them instead that can be decided without a
 * microphone: whether the browser even offers speech recognition, how an utterance
 * becomes whole hours + whole minutes (or is refused), how the four captured values
 * read back, and how a voice session moves through the clocks — including the rule
 * that a cancelled or twice-fumbled session leaves the boxes exactly as they were.
 * The panel (app.tsx: QuickStartSheet) owns the microphone and the speech synthesis;
 * nothing here touches the DOM, the store, or the log. Voice is an input method only:
 * accepted values land in the same text boxes the typist uses, and seeding still runs
 * through the panel's ordinary confirm (applyEldSeed) — never from here, never on
 * its own.
 */

/* ---------- feature detection ---------- */

/** The slice of the Web Speech recognition object the panel drives. */
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results?: { 0?: { 0?: { transcript?: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

export type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike;

/**
 * The recognition constructor this browser exposes, or null. Chrome/Android ship it
 * prefixed; Safari's support is partial and Firefox has none — so the panel renders
 * its "Say my clocks" button only when this returns a constructor, and where speech
 * input does not exist the button simply does not exist either. No dead controls.
 */
export function speechRecognitionCtor(): SpeechRecognitionCtorLike | null {
  const g = globalThis as Record<string, unknown>;
  const c = g.SpeechRecognition ?? g.webkitSpeechRecognition;
  return typeof c === 'function' ? (c as SpeechRecognitionCtorLike) : null;
}

export function speechSynthesisAvailable(): boolean {
  const g = globalThis as Record<string, unknown>;
  const sy = g.speechSynthesis as { speak?: unknown } | undefined;
  return !!sy && typeof sy.speak === 'function' && typeof g.SpeechSynthesisUtterance === 'function';
}

/** Speak one line aloud when the browser can. Best-effort: a failure stays silent. */
export function speakAloud(text: string): void {
  try {
    if (!speechSynthesisAvailable()) return;
    const g = globalThis as Record<string, unknown>;
    const sy = g.speechSynthesis as { cancel(): void; speak(u: unknown): void };
    const Utter = g.SpeechSynthesisUtterance as new (t: string) => unknown;
    sy.cancel();
    sy.speak(new Utter(text));
  } catch { /* the on-screen read-back carries the same words */ }
}

/* ---------- the utterance parser ---------- */

export type ClockParse =
  | { ok: true; hours: number; minutes: number; total: number }
  | { ok: false; reason: 'fraction' | 'range' | 'junk' };

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** One spoken number: digits, a unit word, or a tens word optionally followed by a unit. */
function numberAt(tokens: string[], i: number): { value: number; next: number } | null {
  const t = tokens[i];
  if (t === undefined) return null;
  if (/^\d+$/.test(t)) return { value: Number(t), next: i + 1 };
  if (t in TENS) {
    const u = tokens[i + 1];
    if (u !== undefined && u in UNITS && UNITS[u] > 0) return { value: TENS[t] + UNITS[u], next: i + 2 };
    return { value: TENS[t], next: i + 1 };
  }
  if (t in UNITS) return { value: UNITS[t], next: i + 1 };
  if ((t === 'a' || t === 'an') && (tokens[i + 1] === 'hour' || tokens[i + 1] === 'hours' || tokens[i + 1] === 'minute' || tokens[i + 1] === 'minutes')) {
    return { value: 1, next: i + 1 };
  }
  return null;
}

/**
 * Read one spoken clock into whole hours + whole minutes, against the field's own
 * maximum (the panel passes the same ceiling its typed boxes are read against).
 *
 * Accepted shapes, and nothing else:
 *   "seven hours fifteen minutes" · "seven hours" · "forty five minutes"
 *   "seven fifteen" · "seven oh five" · "eleven" (a bare number is hours)
 * Fractions are refused, never converted and never rounded — the same fence the
 * typed boxes got in patch 9.2 ("seven and a half", "seven point five", "7.5"
 * all refuse): a fraction in a clock is a guess about what the driver meant, and
 * the guess that ships is the one that invents or destroys minutes. A minutes
 * part past 59 refuses too ("seven seventy" is not a clock), as does a total
 * past the field's maximum. Everything unparseable is 'junk'.
 */
export function parseClockUtterance(raw: string, maxMinutes: number): ClockParse {
  const text = raw.trim().toLowerCase();
  if (text === '') return { ok: false, reason: 'junk' };
  // Fraction fingerprints are checked on the raw words before any cleanup: a decimal
  // point, a spoken "point", or a part-word (half / quarter) anywhere in the answer.
  if (/\d\s*[.,]\s*\d/.test(text) || /\bpoint\b/.test(text) || /\b(half|halves|quarter|quarters)\b/.test(text)) {
    return { ok: false, reason: 'fraction' };
  }
  if (/\b(minus|negative)\b/.test(text) || text.startsWith('-')) return { ok: false, reason: 'junk' };
  const tokens = text
    .replace(/[-,]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '' && t !== 'please' && t !== 'uh' && t !== 'um');
  // "and" is filler between the hours and the minutes ("seven hours and fifteen minutes").
  const words = tokens.filter((t) => t !== 'and');
  if (words.length === 0) return { ok: false, reason: 'junk' };

  const finish = (hours: number, minutes: number): ClockParse => {
    if (minutes > 59) return { ok: false, reason: 'junk' };
    const total = hours * 60 + minutes;
    if (total > maxMinutes) return { ok: false, reason: 'range' };
    return { ok: true, hours, minutes, total };
  };

  const first = numberAt(words, 0);
  if (!first) return { ok: false, reason: 'junk' };
  let i = first.next;
  const head = words[i];
  if (head === 'hour' || head === 'hours') {
    i++;
    if (i === words.length) return finish(first.value, 0);
    const m = numberAt(words, i);
    if (!m) return { ok: false, reason: 'junk' };
    i = m.next;
    if (words[i] === 'minute' || words[i] === 'minutes') i++;
    if (i !== words.length) return { ok: false, reason: 'junk' };
    return finish(first.value, m.value);
  }
  if (head === 'minute' || head === 'minutes') {
    return i + 1 === words.length ? finish(0, first.value) : { ok: false, reason: 'junk' };
  }
  if (i === words.length) return finish(first.value, 0); // a bare number is hours
  // Bare pair: "seven fifteen", and "seven oh five" — the oh is a spoken zero, so the
  // minutes are the number after it; either way the second value is the minutes.
  const second = numberAt(words, i);
  if (!second) return { ok: false, reason: 'junk' };
  i = second.next;
  if (words[first.next] === 'oh' || words[first.next] === 'zero') {
    const third = numberAt(words, i);
    if (!third) return { ok: false, reason: 'junk' };
    i = third.next;
    if (i !== words.length) return { ok: false, reason: 'junk' };
    return finish(first.value, third.value);
  }
  if (i !== words.length) return { ok: false, reason: 'junk' };
  return finish(first.value, second.value);
}

/* ---------- the read-back ---------- */

/** One clock in spoken words: "7 hours 15", "62 hours", "45 minutes", "0 minutes". */
export function spokenDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} ${h === 1 ? 'hour' : 'hours'} ${m}`;
  if (h > 0) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
}

/**
 * The whole read-back as one line — the exact string shown on screen and spoken
 * aloud, so what the driver hears is what the panel says it heard:
 * "Drive time left: 7 hours 15. Shift time left: 9 hours 40. …"
 */
export function composeReadBack(entries: { label: string; minutes: number }[]): string {
  return entries.map((e) => `${e.label}: ${spokenDuration(e.minutes)}`).join('. ') + '.';
}

/* ---------- the session flow ---------- */

/** The panel's box contents: field key → [hours text, minutes text], as typed. */
export type EldBoxes = Record<string, [string, string]>;

const copyBoxes = (b: EldBoxes): EldBoxes =>
  Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [v[0], v[1]] as [string, string]]));

/**
 * One voice session, as pure state. `preVoice` is the snapshot of the boxes taken
 * when the session began: cancel and the two-failure exit both restore it, so a
 * voice session the driver abandons changes nothing at all. `idx` walks the
 * panel's field order; the session is `done` when every field has been accepted —
 * and even then nothing has seeded: done only means the read-back is showing.
 */
export interface VoiceFlow {
  preVoice: EldBoxes;
  idx: number;
  fails: number;
  done: boolean;
}

export function beginVoice(boxes: EldBoxes): VoiceFlow {
  return { preVoice: copyBoxes(boxes), idx: 0, fails: 0, done: false };
}

/** An accepted clock lands in the same boxes the typist uses. Advances one field. */
export function voiceAccept(
  flow: VoiceFlow, boxes: EldBoxes, key: string, parsed: { hours: number; minutes: number }, fieldCount: number,
): { flow: VoiceFlow; boxes: EldBoxes } {
  const next: EldBoxes = { ...boxes, [key]: [String(parsed.hours), String(parsed.minutes)] };
  const idx = flow.idx + 1;
  return { flow: { ...flow, idx, fails: 0, done: idx >= fieldCount }, boxes: next };
}

/**
 * A refused utterance. The first failure on a clock re-asks; the second exits the
 * session entirely and restores the pre-voice boxes — a driver fighting the
 * microphone lands back on the plain panel, not in a half-spoken record.
 */
export function voiceFailure(
  flow: VoiceFlow, boxes: EldBoxes,
): { flow: VoiceFlow | null; boxes: EldBoxes; exited: boolean } {
  if (flow.fails >= 1) return { flow: null, boxes: copyBoxes(flow.preVoice), exited: true };
  return { flow: { ...flow, fails: flow.fails + 1 }, boxes, exited: false };
}

/** Start over / cancel: the pre-voice boxes, untouched by anything that was said. */
export function voiceDiscard(flow: VoiceFlow): EldBoxes {
  return copyBoxes(flow.preVoice);
}
