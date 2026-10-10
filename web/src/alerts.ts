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

// ---------------------------------------------------------------------------------------------------
// Side effects. All guarded: they do nothing in tests or in a browser that lacks the feature.

let ctx: AudioContext | null = null;
/** An alert that came due while sound was still locked: played on the next tap (re-check N3). */
let pending: boolean | null = null;

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
    if (ctx && pending !== null) { const u = pending; pending = null; chime(u); buzz(u); }
  } catch { /* no sound on this browser */ }
}

/** True once the browser lets this page make sound (after a tap). */
export function audioReady(): boolean { return ctx !== null && ctx.state === 'running'; }

/**
 * Sound and vibrate for an alert. Before the first tap the browser blocks both, so the alert is kept
 * and played on the next tap rather than lost; the more urgent of two waiting alerts wins.
 */
export function sound(urgent: boolean): void {
  if (!ctx) { pending = pending === null ? urgent : pending || urgent; return; }
  chime(urgent); buzz(urgent);
}
/** Drop a waiting alert (the driver stopped driving before any tap): it would be stale. */
export function clearPendingSound(): void { pending = null; }
/** Test hooks: the module's audio state. */
export const audioForTest = { reset() { ctx = null; pending = null; }, pending: () => pending };

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

/** Vibrate (Android; iPhones do not let web apps vibrate). */
export function buzz(urgent: boolean): void {
  try { navigator.vibrate?.(urgent ? [400, 150, 400, 150, 400] : [300, 150, 300]); } catch { /* ignore */ }
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
