/**
 * Driving alerts. Driver report, 2026-10-06: "Drive passed 16 hours should get a warning. It just keep
 * let me drive. You need to put in a warning system."
 *
 * The app already said "No driving time left — stop driving", but only on screen, and only once time
 * had run out. A phone mounted in a cab is not being read, so this adds:
 *  - advance alerts as driving time crosses 60, 30 and 15 minutes left, and at zero;
 *  - a repeat every 15 minutes while the driver keeps driving with no time left;
 *  - each one as a banner that needs no tap, a sound, a vibration (Android) and, when the app is in the
 *    background and notifications are allowed, a notification.
 *
 * Nothing here needs a touch: handling a phone while driving is not something the app should ask for.
 *
 * Limits, stated in the app: a web app can only alert while it is running. When the phone locks or the
 * app is closed, the phone suspends it, and alerts stop. "Keep screen on while driving" (screen wake
 * lock) is what keeps it running in a mounted phone. Reliable alerts on a locked phone need either a
 * push server or a native app.
 *
 * The decision logic is pure (nextAlert, alertBanner) so it can be tested; the side effects below are
 * guarded so they do nothing outside a browser.
 */

import { speechSynthesisAvailable } from './voiceclocks.ts';

/** Minutes of driving time left at which an alert fires as the count crosses them. */
export const ALERT_MARKS = [60, 30, 15, 0] as const;
/** While driving with no time left, repeat the zero alert this often (minutes). */
export const REPEAT_AT_ZERO = 15;

export interface AlertMemory {
  /** driveNow at the previous check while driving; null = not driving, or the first check */
  prev: number | null;
  /** when an alert last fired (epoch minutes), for the repeat at zero */
  lastAt: number | null;
}
export const NO_ALERTS: AlertMemory = { prev: null, lastAt: null };

/**
 * Decide whether an alert fires now. Returns the mark that fired (60/30/15/0) or null.
 *
 * - Only while DRIVING. Off duty or on duty, the 14-hour window still counts down, but a driver at the
 *   dock or at home does not need an alarm; the status bar already says when driving comes back.
 * - A mark fires when driving time crosses it (was above, is now at or below). If several are crossed
 *   at once (the phone slept), only the most urgent fires.
 * - Opening the app, or tapping Driving, with time already at zero fires the zero alert at once: that is
 *   exactly the moment the driver report describes. Opening it with time left fires nothing until the
 *   next mark, rather than replaying marks already passed.
 */
export function nextAlert(mem: AlertMemory, driving: boolean, driveNow: number, now: number): { mem: AlertMemory; fire: number | null } {
  if (!driving) return { mem: NO_ALERTS, fire: null };
  let fire: number | null = null;
  if (mem.prev === null) {
    if (driveNow <= 0) fire = 0;
  } else {
    const prev = mem.prev;
    const crossed = ALERT_MARKS.filter((m) => prev > m && driveNow <= m);
    if (crossed.length) fire = Math.min(...crossed);
  }
  if (fire === null && driveNow <= 0 && mem.lastAt !== null && now - mem.lastAt >= REPEAT_AT_ZERO) fire = 0;
  return { mem: { prev: driveNow, lastAt: fire !== null ? now : mem.lastAt }, fire };
}

/**
 * One alert check. A simulated clock is for planning: it never sounds, and it leaves nothing behind in
 * the alert memory. Returning to the real clock is then like opening the app (only "already out of
 * time" alerts), instead of measuring a jump from a simulated time as a crossing (re-check).
 */
export function alertTick(mem: AlertMemory, driving: boolean, driveNow: number, now: number, simulated: boolean): { mem: AlertMemory; fire: number | null } {
  if (simulated) return { mem: NO_ALERTS, fire: null };
  return nextAlert(mem, driving, driveNow, now);
}

/**
 * Hold a screen wake lock until the returned stop() is called. The browser drops the lock whenever the
 * page is hidden, and may drop it while on screen too (battery saver, system policy); take it again on
 * return, and, if it is dropped while on screen, try again after `retryMs` (re-check).
 */
export interface WakeEnv {
  request: () => Promise<{ release: () => Promise<void>; addEventListener?: (t: 'release', f: () => void) => void }>;
  visible: () => boolean;
  onVisible: (f: () => void) => () => void;
  later: (f: () => void, ms: number) => void;
}
export function holdWakeLock(env: WakeEnv, retryMs = 5000): () => void {
  let lock: { release: () => Promise<void> } | null = null, gone = false;
  const take = async () => {
    if (gone || lock || !env.visible()) return;
    try {
      const l = await env.request();
      if (gone) { void l.release().catch(() => {}); return; }
      lock = l;
      l.addEventListener?.('release', () => {
        lock = null;
        if (!gone && env.visible()) env.later(() => { void take(); }, retryMs);
      });
    } catch { /* refused (battery saver, not visible): the next return to the screen tries again */ }
  };
  const off = env.onVisible(() => { void take(); });
  void take();
  return () => { gone = true; off(); const l = lock; lock = null; void l?.release().catch(() => {}); };
}

export interface Banner { level: 'warn' | 'bad'; title: string; text: string }

/** The banner shown in the status bar while driving with an hour or less left. `left` is preformatted. */
export function alertBanner(driving: boolean, driveNow: number, left: string, reason: string): Banner | null {
  if (!driving || driveNow > 60) return null;
  if (driveNow <= 0) {
    return { level: 'bad', title: 'Out of driving time', text: `Park as soon as it is safe. Every minute of driving from here is over the ${reason}.` };
  }
  return { level: driveNow <= 15 ? 'bad' : 'warn', title: `${left} of driving left`, text: `Limited by the ${reason}. Plan where you will park.` };
}

/** Wording for the sound/notification of a mark. */
export function alertMessage(mark: number, reason: string): { title: string; body: string } {
  if (mark <= 0) return { title: 'Out of driving time', body: `Park as soon as it is safe — you are over the ${reason}.` };
  return { title: `${mark} minutes of driving left`, body: `Limited by the ${reason}. Plan where you will park.` };
}

/** Keep the screen on: only while driving, and only if the driver wants it (default on). */
export function wantsWakeLock(keepAwake: boolean, status: string | undefined): boolean {
  return keepAwake && status === 'D';
}

/* ---------------------------------------------------------------------------------------------------
 * Spoken alerts (patch 17, M3 "Read it to me"; decision D7-A).
 *
 * 49 CFR 392.80 bars reading while driving, and even the driving view's one number is reading.
 * So the alert this module already decided on (`nextAlert`'s mark) and the status tap itself can
 * be SPOKEN. Everything here is a pure function of the same numbers the screen shows — the mark,
 * `driveNow`, `mustStopBy`, and the app's own `alertReason` string — so a spoken sentence can
 * never quote a different limit or a different stop-by than the banner beside it.
 *
 * D7-A (Lorico, 2026-11-09): the app ASKS ONCE before ever speaking, and nothing speaks until
 * the driver says yes. `speechReady` is that gate plus the simulated-clock guard (a simulated
 * clock is planning, patch 15: it never sounds, so it never speaks); `shouldAskSpeech` is the
 * question's trigger. The utterance itself is patch 11's `speakAloud` (voiceclocks.ts), which
 * cancels before it speaks — a newer sentence supersedes a stale queued one, across both
 * features. Speech OUTPUT only: no recognition is added anywhere by this patch, and where the
 * browser has no speechSynthesis the whole feature is simply absent (the detect in
 * `shouldAskSpeech` and in `speakAloud` itself), never a dead control.
 */

export interface SpeechPrefs { speakAlerts: boolean; speechAsked: boolean }

/**
 * May the app speak right now? Only when the driver has answered the D7-A question with yes
 * (asked AND on) and the clock is real. The alert path additionally requires `alertsOn` — the
 * master alert switch — at its call site in app.tsx; the status confirmation does not (it is
 * not an alert, it is the tap answering back).
 */
export function speechReady(p: SpeechPrefs, simulated: boolean): boolean {
  return p.speechAsked && p.speakAlerts && !simulated;
}

/** The one-time question is due: never asked, real clock, and a browser that can speak at all. */
export function shouldAskSpeech(p: SpeechPrefs, simulated: boolean): boolean {
  return !p.speechAsked && !simulated && speechSynthesisAvailable();
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS_WORDS: Record<number, string> = { 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety' };

/** A whole number 0–99 in words ("forty-seven"). Beyond 99 the digits themselves are returned —
 *  a speech engine reads digits correctly, and no value this app speaks can reach them. */
export function numWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  const t = Math.round(n);
  if (t < 0) return String(t);
  if (t < 20) return NUM_WORDS[t];
  if (t < 100) { const r = t % 10; return r === 0 ? TENS_WORDS[t] : `${TENS_WORDS[t - r]}-${NUM_WORDS[r]}`; }
  return String(t);
}

/**
 * A clock time in words, from the same device-local reading `clock()` prints: "five forty",
 * "twelve oh five", "five o'clock". A speech engine given "05:40" reads the digits; a driver
 * hears a time the way a person says it.
 */
export function clockWords(min: number): string {
  if (!Number.isFinite(min)) return '';
  const d = new Date(min * 60000);
  const h24 = d.getHours(), m = d.getMinutes();
  const hw = numWords(h24 % 12 === 0 ? 12 : h24 % 12);
  if (m === 0) return `${hw} o'clock`;
  if (m < 10) return `${hw} oh ${numWords(m)}`;
  return `${hw} ${numWords(m)}`;
}

/**
 * A length of time in words: "one minute", "thirty minutes", "one hour", "two hours
 * thirty-six". With hours present the remainder drops its "minutes" — the brainstorm's own
 * sentence ("You can drive two hours thirty-six") — and one rule covers every value.
 */
export function durationWords(min: number): string {
  if (!Number.isFinite(min)) return '';
  const t = Math.max(0, Math.round(min));
  if (t === 0) return 'no time';
  if (t < 60) return t === 1 ? 'one minute' : `${numWords(t)} minutes`;
  const head = t < 120 ? 'one hour' : `${numWords(Math.floor(t / 60))} hours`;
  const r = t % 60;
  return r === 0 ? head : `${head} ${numWords(r)}`;
}

/**
 * The spoken form of a fired alert mark. `driveNow` and `stopBy` are the evaluation's own
 * numbers and `reason` is the app's alert wording for the binding limit, so the sentence is
 * the banner read aloud, not a second opinion. At zero there is no stop-by to quote: the
 * time to stop was the number, and it has passed.
 */
export function alertSpeech(mark: number, driveNow: number, stopBy: number, reason: string): string {
  if (mark <= 0) return `Out of driving time. Park as soon as it is safe. You are over the ${reason}.`;
  const left = durationWords(driveNow);
  return `${left.charAt(0).toUpperCase() + left.slice(1)} of driving left. Stop by ${clockWords(stopBy)}. Limited by the ${reason}.`;
}

const SPOKEN_STATUS: Record<string, string> = { OFF: 'Off duty', SB: 'Sleeper berth', ON: 'On duty', D: 'Driving' };

/**
 * The spoken confirmation of a status tap: the tap answers back, so the driver never has to
 * look to know it landed. Driving quotes the clocks (the brainstorm's sentence); every other
 * status names itself and the time it began. `driveNow`/`stopBy` come from an evaluation of
 * the post-tap record; without them the Driving line is the status word alone.
 */
export function statusSpeech(status: 'OFF' | 'SB' | 'D' | 'ON', at: number, driveNow?: number, stopBy?: number): string {
  if (status === 'D') {
    if (driveNow === undefined || stopBy === undefined) return 'Driving.';
    if (driveNow <= 0) return 'Driving. No driving time left.';
    return `Driving. You can drive ${durationWords(driveNow)}. Stop by ${clockWords(stopBy)}.`;
  }
  return `${SPOKEN_STATUS[status]} since ${clockWords(at)}.`;
}

// ---------------------------------------------------------------------------------------------------
// Side effects. All guarded: they do nothing in tests or in a browser that lacks the feature.

let ctx: AudioContext | null = null;
/** An alert that came due while sound was still locked: played on the next tap (re-check N3). */
let pending: boolean | null = null;
/** The waiting alert's mark (capstone C3, M13), so its haptic pattern plays with it; null = no mark given. */
let pendingMark: number | null = null;

/**
 * Browsers only allow sound after a tap. Call this from any tap (the launch notice, a status button,
 * "Test alert", or any touch on the screen) so a later alert can play. Safe to call repeatedly. An
 * alert that came due while sound was locked plays now, once.
 */
export function unlockAudio(): void {
  try {
    if (typeof window === 'undefined') return;
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && AC) ctx = new AC();
    void ctx?.resume();
    if (ctx && pending !== null) { const u = pending, m = pendingMark; pending = null; pendingMark = null; chime(u); buzz(u, m ?? undefined); }
  } catch { /* no sound on this browser */ }
}

/** True once the browser lets this page make sound (after a tap). */
export function audioReady(): boolean { return ctx !== null && ctx.state === 'running'; }

/**
 * Sound and vibrate for an alert. Before the first tap the browser blocks both, so the alert is kept
 * and played on the next tap rather than lost; the more urgent of two waiting alerts wins.
 */
export function sound(urgent: boolean, mark?: number): void {
  if (!ctx) {
    // The more urgent waiting alert wins, and its mark with it (a lower mark is the more urgent one).
    if (mark !== undefined && (pendingMark === null || mark < pendingMark)) pendingMark = mark;
    pending = pending === null ? urgent : pending || urgent;
    return;
  }
  chime(urgent); buzz(urgent, mark);
}
/** Drop a waiting alert (the driver stopped driving before any tap): it would be stale. */
export function clearPendingSound(): void { pending = null; pendingMark = null; }
/** Test hooks: the module's audio state. */
export const audioForTest = { reset() { ctx = null; pending = null; pendingMark = null; }, pending: () => pending, pendingMark: () => pendingMark };

/** Two short tones, or three higher ones when urgent. */
export function chime(urgent: boolean): void {
  try {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    const n = urgent ? 3 : 2, f = urgent ? 1046 : 784;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      const t = t0 + i * 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.27);
    }
  } catch { /* ignore */ }
}

/**
 * The haptic language (capstone C3, audit §3 M13 — decision C9-A: alert marks and status
 * changes only, no Split Lab haptics). Each mark has its own feel, so a moving driver knows
 * which mark he is at without looking: two short at 60, three short at 30, one long and two
 * short at 15, long-short-long at zero and on every 15-minute repeat after it. A status
 * change is one firm 20ms pulse, replacing the 12ms tap tick on the four dock keys only.
 * Android web only (navigator.vibrate); iPhones do not let web apps vibrate, so every call
 * no-ops there. Gated by the existing alerts switch at the call sites — no new switch.
 * The marks themselves (ALERT_MARKS, nextAlert) are untouched: this only says how each feels.
 */
export const HAPTIC_PATTERNS = {
  status: [20],
  60: [60, 80, 60],
  30: [60, 80, 60, 80, 60],
  15: [200, 100, 60, 100, 60],
  0: [400, 120, 80, 120, 400],
} as const;
/** The pattern for a fired alert mark (60/30/15/0; anything at or under zero is the zero pattern). */
export function hapticForMark(mark: number): readonly number[] {
  if (mark <= 0) return HAPTIC_PATTERNS[0];
  if (mark <= 15) return HAPTIC_PATTERNS[15];
  if (mark <= 30) return HAPTIC_PATTERNS[30];
  return HAPTIC_PATTERNS[60];
}
/** One guarded vibrate call: feature-detected and swallowed — a haptic must never throw. */
export function vibrateGuarded(pattern: readonly number[] | number): boolean {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) { navigator.vibrate(pattern as number[] | number); return true; }
  } catch { /* ignore */ }
  return false;
}

/**
 * Vibrate for an alert (Android; iPhones do not let web apps vibrate). With a mark, the mark's
 * own pattern (M13); without one, the old two-pattern form.
 */
export function buzz(urgent: boolean, mark?: number): void {
  vibrateGuarded(mark !== undefined ? hapticForMark(mark) : urgent ? [400, 150, 400, 150, 400] : [300, 150, 300]);
}

/**
 * The status-change pulse (M13) for a dock key. With the alerts switch on, a tap that changed
 * the status gets the 20ms pulse INSTEAD of the 12ms tap tick (the dock keys carry
 * data-haptic, which the global tap tick skips, so there is never a double buzz). With the
 * switch off, or a tap that changed nothing, the dock key gets the plain tap tick as before.
 */
export function statusHaptic(changed: boolean, alertsOn: boolean): void {
  if (changed && alertsOn) vibrateGuarded(HAPTIC_PATTERNS.status);
  else tapTick();
}

/**
 * One short tick under the finger when a tap lands on a control (patch #6), so the tap confirms
 * itself even when the driver is not looking at the screen. Android web only: iPhones do not let
 * web apps vibrate, so the press state stays the confirmation there and this no-ops. Feature-
 * detected and swallowed — a haptic must never throw into a tap.
 */
export function tapTick(): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  } catch { /* ignore */ }
}

export type NotifyState = 'granted' | 'denied' | 'default' | 'unsupported';
export function notifyState(): NotifyState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
export async function askNotify(): Promise<NotifyState> {
  try { if (notifyState() === 'unsupported') return 'unsupported'; return await Notification.requestPermission(); }
  catch { return notifyState(); }
}

/** A notification, only when the app is not on screen (on screen, the banner and sound already show it). */
export async function notify(title: string, body: string): Promise<void> {
  try {
    if (notifyState() !== 'granted' || typeof document === 'undefined' || document.visibilityState === 'visible') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, tag: 'hos-drive-alert', renotify: true, icon: './icon-192.png' } as NotificationOptions;
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch { /* best effort */ }
}

export const canKeepAwake = (): boolean => typeof navigator !== 'undefined' && 'wakeLock' in navigator;
