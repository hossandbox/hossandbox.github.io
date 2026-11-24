/**
 * Do I Make It Back or Motel? — Meet-and-Turn & Relay Wait Cutoff Timer (Plan tool #9).
 *
 * Pure app-layer calculation over `engine/src/index.ts` (`evaluate()` + `normalize()` + `LIMITS`)
 * and read-only helpers from `web/src/store.ts` and `web/src/carrierday.ts`.
 * Zero modifications to `engine/` or `web/src/store.ts`; zero new `localStorage` keys.
 *
 * Honest clock semantics:
 *   - 14-hr window (16-hr with §395.1(o) Big Day): elapsed-time clock consumed by waiting.
 *     Window cutoff = windowEnd − returnDrive − hookTime.
 *   - 11-hr driving limit: NOT consumed by waiting — feasibility check only. If returnDrive > driveRemaining,
 *     verdict is infeasible ("can't make it back on drive time, even rolling now"), with NO invented cutoff.
 *   - 70-hr / 60-hr cycle: waiting ON DUTY consumes it; feasibility check requires hookTime + returnDrive <= cycleRemaining.
 *   - 30-minute break: derived from the current consecutive non-driving stretch at `now`.
 */
import type { DutyStatus, FullEvaluation, RulesConfig, Segment } from '../../engine/src/index.ts';
import { LIMITS, evaluate, normalize } from '../../engine/src/index.ts';
import { dur, isValidTimeZone, zoneShort } from './store.ts';
import { safeRulesConfig } from './carrierday.ts';

export type MotelDistanceMode = 'miles' | 'time';
export type MotelStatus = 'ready' | 'passed' | 'infeasible' | 'invalid';
export type MotelBinding = 'WINDOW_14' | 'WINDOW_16' | 'DRIVE_11' | 'CYCLE' | 'DRIVE_AND_CYCLE' | 'NONE';

export const MOTEL_MIN_MPH = 25;
export const MOTEL_MAX_MPH = 80;
export const MOTEL_DEFAULT_MPH = 55;
export const MOTEL_DEFAULT_MILES = 220;
export const MOTEL_DEFAULT_DRIVE_MIN = 240; // 4h 00m — agrees with 220 mi @ 55 mph
export const MOTEL_DEFAULT_HOOK_MIN = 30;
export const MOTEL_MAX_MILES = 1500;
export const MOTEL_MAX_DRIVE_MIN = 24 * 60;
export const MOTEL_MAX_HOOK_MIN = 6 * 60;

export const MOTEL_HOOK_PRESETS = [15, 30, 45, 60] as const;
export const MOTEL_MILES_PRESETS = [110, 165, 220, 275, 330] as const;
export const MOTEL_MPH_PRESETS = [50, 55, 60, 65] as const;
export const MOTEL_DRIVE_PRESETS = [
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
  { label: '4h', minutes: 240 },
  { label: '5h', minutes: 300 },
  { label: '6h', minutes: 360 },
] as const;

export const MOTEL_BIG_DAY_WARNING =
  '16-hour Big Day (§395.1(o)) requires returning to the same work-reporting location as your previous 5 duty tours, and can be used only once in 7 days (or after a 34-hour restart). Driving limit stays 11 hours.';

export interface MotelDraft {
  distanceMode: MotelDistanceMode;
  miles: number;
  /** null = follow app's s.mph setting (55 if unset); number = inline edited mph */
  mph: number | null;
  driveMinutesDirect: number;
  hookMinutes: number;
  bigDay: boolean;
}

export interface MotelInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current UTC epoch minute. */
  now: number;
  /** Carrier rules config (cycle, dayStartHour, dayStartMinute, timeZone, shortHaul, exceptions). */
  config: RulesConfig;
  /** Return leg entry mode: miles + mph OR direct drive duration. */
  distanceMode: MotelDistanceMode;
  /** Return miles (used when `distanceMode === 'miles'`). */
  miles: number;
  /** Average return speed in mph (used when `distanceMode === 'miles'`). */
  mph: number;
  /** Direct return drive minutes (used when `distanceMode === 'time'`). */
  driveMinutesDirect: number;
  /** Swap / break-and-hook duration in minutes (>= 0). */
  hookMinutes: number;
  /** Whether the driver is testing the 16-hour Big Day exception (§395.1(o)). */
  bigDay: boolean;
  /** Current live duty status, if any (used to flag ON-duty waiting cycle burn). */
  currentStatus?: DutyStatus | null;
}

export interface MotelResult {
  validInput: boolean;
  status: MotelStatus;
  tone: 'good' | 'warn' | 'bad';
  sign: 'go' | 'warn' | 'stop' | 'rest';
  verdictLabel: string;
  effectiveMph: number;
  returnDriveMinutes: number;
  hookMinutes: number;
  returnDutyMinutes: number;
  homeTimeZone: string;
  homeZoneName: string;
  nowHM: string;
  nowShort: string;
  driveLimitMinutes: number;
  driveRemainingMinutes: number;
  driveFeasible: boolean;
  cycleLimitMinutes: number;
  cycleWindowDays: number;
  cycleRemainingMinutes: number;
  cycleFeasible: boolean;
  windowLimitMinutes: number;
  windowUsedMinutes: number;
  windowRemainingMinutes: number;
  windowEndMinute: number;
  windowEndHM: string;
  windowEndShort: string;
  window14CutoffMinute: number;
  window16CutoffMinute: number;
  bigDayRequested: boolean;
  bigDayApplied: boolean;
  bigDayBlockedByLog: boolean;
  bigDayLogNote: string | null;
  bigDayEligibilityWarning: string;
  /** Exact wall-clock cutoff minute — strictly null when drive/cycle feasibility fails or input is invalid. */
  cutoffMinute: number | null;
  cutoffHM: string | null;
  cutoffShort: string | null;
  /** Minutes of wait left from `now` (negative when cutoff already passed; null when infeasible/invalid). */
  waitLeftMinutes: number | null;
  backIfRollNowMinute: number | null;
  backIfRollNowHM: string | null;
  backIfRollNowShort: string | null;
  backAtCutoffMinute: number | null;
  backAtCutoffHM: string | null;
  backAtCutoffShort: string | null;
  /** Earliest legal roll minute when rolling now forces an en-route 30-min break past the window; null otherwise. */
  earliestRollMinute: number | null;
  earliestRollHM: string | null;
  earliestRollShort: string | null;
  /** True when rolling now (including any required en-route 30-min break) arrives past windowEndMinute. */
  rollNowOverWindow: boolean;
  /** Warning copy when earliestRollMinute !== null ("Don't roll before HH:MM — ..."). */
  earliestRollWarning: string | null;
  binding: MotelBinding;
  bindingLabel: string;
  bindingCite: string;
  bindingText: string;
  shortHaulExempt: boolean;
  breakRemainingMinutes: number;
  breakAdjustedCutoff: boolean;
  enRouteBreakIfRollNowMinutes: number;
  enRouteBreakAtCutoffMinutes: number;
  currentNonDriveMinutes: number;
  breakCovered: boolean;
  breakMinutesShort: number;
  breakLine: string;
  returnOverEightNote: string | null;
  waitingOnDutyNote: string | null;
  headline: string;
  subline: string;
  dispatchText: string;
}

/* ---------- timezone formatting (DST-safe, host-TZ independent) ---------- */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function fmtHM(minute: number, tz: string): string {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = partsFormatter(safeTz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${hour}:${get('minute')}`;
}

function fmtShort(minute: number, tz: string): string {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = partsFormatter(safeTz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('weekday')} ${hour}:${get('minute')}`;
}

/* ---------- input sanitization & drive-time parity ---------- */

export function clampMotelMph(mph: unknown): number {
  return typeof mph === 'number' && Number.isFinite(mph)
    ? Math.max(MOTEL_MIN_MPH, Math.min(MOTEL_MAX_MPH, Math.round(mph)))
    : MOTEL_DEFAULT_MPH;
}

/**
 * Convert return leg input to integer drive minutes.
 * In 'miles' mode, uses `Math.ceil((miles * 60) / mph)` so exact multiples (e.g., 220 mi @ 55 mph = 240m,
 * 180 mi @ 60 mph = 180m) are exact integers with zero float-epsilon overshoot, and fractional minutes
 * round conservatively upward. Entering the same trip in 'miles' or 'time' mode produces identical drive minutes.
 */
export function computeMotelDriveMinutes(
  distanceMode: MotelDistanceMode,
  miles: number,
  mph: number,
  driveMinutesDirect: number,
): { driveMinutes: number; effectiveMph: number } {
  const effectiveMph = clampMotelMph(mph);
  if (distanceMode === 'time') {
    const d = Number.isFinite(driveMinutesDirect) ? Math.max(0, Math.round(driveMinutesDirect)) : 0;
    return { driveMinutes: Math.min(d, MOTEL_MAX_DRIVE_MIN), effectiveMph };
  }
  const m = Number.isFinite(miles) ? Math.max(0, miles) : 0;
  if (m <= 0) return { driveMinutes: 0, effectiveMph };
  const mins = Math.ceil((m * 60) / effectiveMph);
  return { driveMinutes: Math.min(mins, MOTEL_MAX_DRIVE_MIN), effectiveMph };
}

/**
 * Derive from the logged segments how many consecutive minutes the driver has been NOT driving
 * ending at `asOf`. Follows `engine/src/shift.ts` `breakStatus()` semantics: OFF, SB, ON (not driving),
 * and unlogged gaps between/after logged segments all count as non-driving; any `D` segment resets to 0.
 */
export function currentNonDrivingStretch(segments: Segment[], asOf: number): number {
  const clipped = segments
    .filter((s) => !s.tentative && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.start < asOf)
    .map((s) => (s.end > asOf ? { ...s, end: asOf } : s));
  const norm = normalize(clipped);
  if (norm.length === 0) return 0;
  let run = 0;
  let prevEnd: number | null = null;
  for (const s of norm) {
    if (prevEnd !== null && s.start > prevEnd) run += s.start - prevEnd;
    if (s.status === 'D') {
      run = 0;
    } else {
      run += s.end - s.start;
    }
    prevEnd = s.end;
  }
  if (prevEnd !== null && asOf > prevEnd) run += asOf - prevEnd;
  return Math.max(0, Math.round(run));
}

/* ---------- in-session lane defaults (module memory; kept while the app stays open, zero new storage keys) ---------- */

let sessionMotelDraft: MotelDraft | null = null;

export function defaultMotelDraft(): MotelDraft {
  return {
    distanceMode: 'miles',
    miles: MOTEL_DEFAULT_MILES,
    mph: null,
    driveMinutesDirect: MOTEL_DEFAULT_DRIVE_MIN,
    hookMinutes: MOTEL_DEFAULT_HOOK_MIN,
    bigDay: false,
  };
}

function sanitizeMotelDraft(raw: MotelDraft | null): MotelDraft {
  const d = defaultMotelDraft();
  if (!raw || typeof raw !== 'object') return d;
  return {
    distanceMode: raw.distanceMode === 'time' ? 'time' : 'miles',
    miles: typeof raw.miles === 'number' && Number.isFinite(raw.miles)
      ? Math.max(0, Math.min(MOTEL_MAX_MILES, Math.round(raw.miles)))
      : d.miles,
    mph: raw.mph === null ? null : clampMotelMph(raw.mph),
    driveMinutesDirect: typeof raw.driveMinutesDirect === 'number' && Number.isFinite(raw.driveMinutesDirect)
      ? Math.max(0, Math.min(MOTEL_MAX_DRIVE_MIN, Math.round(raw.driveMinutesDirect)))
      : d.driveMinutesDirect,
    hookMinutes: typeof raw.hookMinutes === 'number' && Number.isFinite(raw.hookMinutes)
      ? Math.max(0, Math.min(MOTEL_MAX_HOOK_MIN, Math.round(raw.hookMinutes)))
      : d.hookMinutes,
    // Big Day (§395.1(o)) is a per-turn what-if and must always default to OFF on fresh entry.
    bigDay: false,
  };
}

export function loadMotelDraft(): MotelDraft {
  return sanitizeMotelDraft(sessionMotelDraft);
}

export function saveMotelDraft(draft: MotelDraft): void {
  sessionMotelDraft = sanitizeMotelDraft(draft);
}

export function clearMotelDraft(): void {
  sessionMotelDraft = null;
}

/* ---------- core cutoff evaluation ---------- */

export function evaluateMotel(input: MotelInput): MotelResult {
  const cfg = safeRulesConfig(input.config);
  const homeTimeZone = isValidTimeZone(cfg.timeZone) ? cfg.timeZone : 'America/Chicago';
  const homeZoneName = zoneShort(homeTimeZone);
  const now = Math.round(input.now);

  const { driveMinutes: returnDriveMinutes, effectiveMph } = computeMotelDriveMinutes(
    input.distanceMode,
    input.miles,
    input.mph,
    input.driveMinutesDirect,
  );
  const hookMinutes = Number.isFinite(input.hookMinutes)
    ? Math.max(0, Math.min(MOTEL_MAX_HOOK_MIN, Math.round(input.hookMinutes)))
    : 0;
  const returnDutyMinutes = hookMinutes + returnDriveMinutes;
  const validInput = returnDriveMinutes > 0;

  // Evaluate from real logged segments only (no tentative what-if rows).
  const logged = input.segments.filter((s) => !s.tentative);
  const evRaw: FullEvaluation = evaluate(logged, { asOf: now, config: cfg });

  // Clean 14-hr baseline and 16-hr Big Day (§395.1(o)) what-if evaluations via engine's evaluate():
  // - Never double-add +2h if the driver already toggled 16-hr in Now -> ExceptionsSheet.
  // - Let the engine enforce §395.1(o)(3) once-per-7-days / 34-hr-restart eligibility against prior logged uses.
  const existingSixteenKey = evRaw.shift.exceptionKeys.sixteen;
  const evBase: FullEvaluation = existingSixteenKey !== null
    ? evaluate(logged, {
        asOf: now,
        config: {
          ...cfg,
          sixteenHourShifts: (cfg.sixteenHourShifts ?? []).filter((k) => k !== existingSixteenKey),
        },
      })
    : evRaw;

  const evBig: FullEvaluation = existingSixteenKey !== null
    ? evRaw
    : evaluate(logged, {
        asOf: now,
        config: {
          ...cfg,
          sixteenHourShifts: [...(cfg.sixteenHourShifts ?? []), evBase.shift.exceptionKey],
        },
      });

  const bigDayBlockedByLog = input.bigDay && evBig.shift.limits.window === evBase.shift.limits.window;
  const bigDayApplied = input.bigDay && !bigDayBlockedByLog;
  const bigDayLogNote = bigDayBlockedByLog
    ? (evBig.shift.notes.find((n) => /16-hour/i.test(n)) ?? '16-hour exception already used in the prior 6 carrier days with no 34-hour restart since (§395.1(o)(3)).')
    : null;

  const activeEv = input.bigDay ? evBig : evBase;

  const driveLimitMinutes = activeEv.shift.limits.drive;
  const driveRemainingMinutes = activeEv.shift.driveRemaining;
  const cycleLimitMinutes = activeEv.cycle.limit;
  const cycleWindowDays = activeEv.cycle.windowDays;
  const cycleRemainingMinutes = activeEv.cycle.remaining;
  const windowLimitMinutes = activeEv.shift.limits.window;
  const windowUsedMinutes = activeEv.shift.windowUsed;
  const windowRemainingMinutes = activeEv.shift.windowRemaining;

  // Unclamped window end so a past-expiry window still yields its exact true cutoff minute.
  const window14EndMinute = now + (evBase.shift.limits.window - evBase.shift.windowUsed);
  const window16EndMinute = now + (evBig.shift.limits.window - evBig.shift.windowUsed);
  const windowEndMinute = now + (windowLimitMinutes - windowUsedMinutes);

  const window14CutoffMinute = window14EndMinute - returnDriveMinutes - hookMinutes;
  const window16CutoffMinute = window16EndMinute - returnDriveMinutes - hookMinutes;
  const baseWindowCutoffMinute = windowEndMinute - returnDriveMinutes - hookMinutes;

  const driveFeasible = returnDriveMinutes <= driveRemainingMinutes;
  const cycleFeasible = returnDutyMinutes <= cycleRemainingMinutes;

  // 30-minute break status derived from the driver's real log state at `now`.
  // Swap / hook time is ON duty (not driving), so it counts toward the 30-minute break.
  const shortHaulExempt = !!cfg.shortHaul;
  const breakRemainingMinutes = activeEv.shift.breakRemaining;
  const currentNonDriveMinutes = currentNonDrivingStretch(evRaw.segments, now);
  const needBreakWait = shortHaulExempt
    ? 0
    : Math.max(0, LIMITS.BREAK_LEN - currentNonDriveMinutes - hookMinutes);
  const enRouteBreakIfRollNowMinutes = !shortHaulExempt && validInput && (
    returnDriveMinutes > LIMITS.BREAK_AFTER ||
    (breakRemainingMinutes < returnDriveMinutes && needBreakWait > 0)
  )
    ? LIMITS.BREAK_LEN
    : 0;

  // Rule labels & CFR citations
  const adverse = activeEv.shift.exceptionKeys.adverse !== null;
  const driveLimitH = driveLimitMinutes / 60;
  const windowLimitH = windowLimitMinutes / 60;
  const cycleLimitH = cycleLimitMinutes / 60;
  const driveCite = adverse ? '49 CFR 395.3(a)(3)(i) · §395.1(b)(1)' : '49 CFR 395.3(a)(3)(i)';
  const cycleCite = `49 CFR 395.3(b)(${cycleWindowDays === 7 ? '1' : '2'})`;
  const breakCite = '49 CFR 395.3(a)(3)(ii)';
  const windowRuleLabel = bigDayApplied ? `${windowLimitH}-hr Big Day` : `${windowLimitH}-hr window`;
  const windowRuleCite = bigDayApplied
    ? (adverse ? '49 CFR 395.1(o) · §395.1(b)(1)' : '49 CFR 395.1(o)')
    : (adverse ? '49 CFR 395.3(a)(2) · §395.1(b)(1)' : '49 CFR 395.3(a)(2)');
  const windowRuleDispatchParen = bigDayApplied
    ? `${windowLimitH}-hr Big Day, ${windowRuleCite}`
    : `${windowLimitH}-hr limit, ${windowRuleCite}`;

  const nowHM = fmtHM(now, homeTimeZone);
  const nowShort = fmtShort(now, homeTimeZone);
  const windowEndHM = fmtHM(windowEndMinute, homeTimeZone);
  const windowEndShort = fmtShort(windowEndMinute, homeTimeZone);

  let status: MotelStatus;
  let tone: 'good' | 'warn' | 'bad';
  let sign: 'go' | 'warn' | 'stop' | 'rest';
  let verdictLabel: string;
  let cutoffMinute: number | null = null;
  let cutoffHM: string | null = null;
  let cutoffShort: string | null = null;
  let waitLeftMinutes: number | null = null;
  let backIfRollNowMinute: number | null = null;
  let backIfRollNowHM: string | null = null;
  let backIfRollNowShort: string | null = null;
  let backAtCutoffMinute: number | null = null;
  let backAtCutoffHM: string | null = null;
  let backAtCutoffShort: string | null = null;
  let earliestRollMinute: number | null = null;
  let earliestRollHM: string | null = null;
  let earliestRollShort: string | null = null;
  let rollNowOverWindow = false;
  let earliestRollWarning: string | null = null;
  let binding: MotelBinding = 'NONE';
  let bindingLabel = '';
  let bindingCite = '';
  let bindingText = '';
  let headline = '';
  let subline = '';
  let dispatchText = '';
  let breakAdjustedCutoff = false;
  let enRouteBreakAtCutoffMinutes = 0;
  let cycleBinds = false;
  let effectiveWindowCutoffMinute = baseWindowCutoffMinute;

  if (!validInput) {
    status = 'invalid';
    tone = 'warn';
    sign = 'rest';
    verdictLabel = 'ENTER RETURN LEG';
    headline = 'Enter your return miles or drive time to calculate your walk-away cutoff.';
    subline = '';
  } else if (!driveFeasible || !cycleFeasible) {
    // Feasibility check failed — NEVER invent a wall-clock cutoff!
    status = 'infeasible';
    tone = 'bad';
    sign = 'stop';
    verdictLabel = 'MOTEL / REPOWER';

    if (!driveFeasible && !cycleFeasible) {
      binding = 'DRIVE_AND_CYCLE';
      bindingLabel = `${driveLimitH}-hr driving limit & ${cycleLimitH}-hr cycle`;
      bindingCite = `${driveCite}; ${cycleCite}`;
      bindingText = `${bindingLabel} — ${bindingCite}`;
      headline = `Can't make it back on drive time or your ${cycleLimitH}-hr cycle, even rolling now.`;
      subline = `Return needs ${dur(returnDriveMinutes)} driving (only ${dur(driveRemainingMinutes)} left on your ${driveLimitH}) and ${dur(returnDutyMinutes)} duty (only ${dur(cycleRemainingMinutes)} left on your ${cycleLimitH}).`;
      dispatchText = `Waiting at meet point. Cannot legally return to terminal even rolling now — return needs ${dur(returnDriveMinutes)} drive (${dur(driveRemainingMinutes)} left, ${driveCite}) and ${dur(returnDutyMinutes)} duty (${dur(cycleRemainingMinutes)} left on ${cycleLimitH}-hr cycle, ${cycleCite}). Will need motel laydown / repower. Planning estimate — my ELD governs.`;
    } else if (!driveFeasible) {
      binding = 'DRIVE_11';
      bindingLabel = `${driveLimitH}-hr driving limit`;
      bindingCite = driveCite;
      bindingText = `${bindingLabel} — ${bindingCite}`;
      headline = "Can't make it back on drive time, even rolling now.";
      subline = `Return needs ${dur(returnDriveMinutes)} of driving, but you only have ${dur(driveRemainingMinutes)} left on your ${driveLimitH}-hr driving limit. Waiting does not recover drive time.`;
      dispatchText = `Waiting at meet point. Cannot legally return to terminal even rolling now — only ${dur(driveRemainingMinutes)} left on ${driveLimitH}-hr driving limit (${driveCite}) for a ${dur(returnDriveMinutes)} return drive. Will need motel laydown / repower. Planning estimate — my ELD governs.`;
    } else {
      binding = 'CYCLE';
      bindingLabel = `${cycleLimitH}-hr cycle`;
      bindingCite = cycleCite;
      bindingText = `${bindingLabel} — ${bindingCite}`;
      headline = `Not enough left on your ${cycleLimitH} for this return, even rolling now.`;
      subline = `Hook (${dur(hookMinutes)}) + return drive (${dur(returnDriveMinutes)}) needs ${dur(returnDutyMinutes)}, but only ${dur(cycleRemainingMinutes)} remains on your ${cycleLimitH}-hr cycle.`;
      dispatchText = `Waiting at meet point. Cannot legally return to terminal even rolling now — not enough left on ${cycleLimitH}-hr cycle (${dur(cycleRemainingMinutes)} left vs ${dur(returnDutyMinutes)} needed for hook + drive, ${cycleCite}). Will need motel laydown / repower. Planning estimate — my ELD governs.`;
    }
  } else {
    // Feasibility checks passed.
    // F1: While waiting ON duty, every minute waited also burns the 60/70-hr cycle (ignoring midnight roll-off is conservative).
    const isWaitingOnDuty = input.currentStatus === 'ON';
    const cycleCutoffMinute = isWaitingOnDuty ? now + (cycleRemainingMinutes - returnDutyMinutes) : Infinity;

    // F2: If the remaining wait + current non-driving stretch + hook cannot reach 30m before driving,
    // and breakRemaining < returnDrive (or returnDrive > 8h), an en-route 30-min OFF-duty break is required.
    // An en-route OFF-duty break consumes 30m of the 14/16-hr window (not the 60/70-hr cycle).
    const preBreakWaitLeft = Math.min(baseWindowCutoffMinute, cycleCutoffMinute) - now;
    const enRouteBreakNeededAtCutoff = !shortHaulExempt && (
      returnDriveMinutes > LIMITS.BREAK_AFTER ||
      (breakRemainingMinutes < returnDriveMinutes && needBreakWait > 0 && preBreakWaitLeft < needBreakWait)
    );
    enRouteBreakAtCutoffMinutes = enRouteBreakNeededAtCutoff ? LIMITS.BREAK_LEN : 0;
    effectiveWindowCutoffMinute = enRouteBreakNeededAtCutoff
      ? baseWindowCutoffMinute - LIMITS.BREAK_LEN
      : baseWindowCutoffMinute;

    cutoffMinute = Math.min(effectiveWindowCutoffMinute, cycleCutoffMinute);
    cutoffHM = fmtHM(cutoffMinute, homeTimeZone);
    cutoffShort = fmtShort(cutoffMinute, homeTimeZone);
    waitLeftMinutes = cutoffMinute - now;

    cycleBinds = isWaitingOnDuty && cycleCutoffMinute < effectiveWindowCutoffMinute;
    breakAdjustedCutoff = enRouteBreakNeededAtCutoff && !cycleBinds;

    if (cycleBinds) {
      binding = 'CYCLE';
      bindingLabel = `${cycleLimitH}-hr cycle (ON-duty wait)`;
      bindingCite = cycleCite;
      bindingText = `${bindingLabel} — ${bindingCite}`;
    } else {
      binding = bigDayApplied ? 'WINDOW_16' : 'WINDOW_14';
      bindingLabel = breakAdjustedCutoff ? `${windowRuleLabel} + 30-min break` : windowRuleLabel;
      bindingCite = breakAdjustedCutoff ? `${windowRuleCite} · ${breakCite}` : windowRuleCite;
      bindingText = `${bindingLabel} — ${bindingCite}`;
    }

    const activeDispatchParen = cycleBinds
      ? `${cycleLimitH}-hr cycle, ${cycleCite}`
      : (breakAdjustedCutoff ? `${windowRuleDispatchParen}; 30-min break, ${breakCite}` : windowRuleDispatchParen);

    if (waitLeftMinutes < 0) {
      status = 'passed';
      tone = 'bad';
      sign = 'stop';
      verdictLabel = 'CUTOFF PASSED';
      headline = `Cutoff was ${cutoffHM}. Waiting longer means a motel or a repower.`;
      subline = breakAdjustedCutoff
        ? `${dur(-waitLeftMinutes)} past your ${windowRuleLabel} cutoff — moved 30m earlier for a required en-route 30-minute break (${breakCite}; ${windowLimitH}-hr window ends ${windowEndHM}).`
        : `${dur(-waitLeftMinutes)} past your ${windowRuleLabel} cutoff (${windowLimitH}-hr window ends ${windowEndHM}).`;
      dispatchText = `Waiting at meet point. Hard legal cutoff to return to terminal was ${cutoffHM} (${activeDispatchParen}). Cutoff has passed — will need motel laydown / repower. Planning estimate — my ELD governs.`;
    } else {
      status = 'ready';
      const tight = waitLeftMinutes <= 30;
      tone = tight ? 'warn' : 'good';
      sign = tight ? 'warn' : 'go';
      verdictLabel = tight ? 'ROLL SOON' : 'CAN MAKE IT BACK';
      backIfRollNowMinute = now + hookMinutes + returnDriveMinutes + enRouteBreakIfRollNowMinutes;
      backIfRollNowHM = fmtHM(backIfRollNowMinute, homeTimeZone);
      backIfRollNowShort = fmtShort(backIfRollNowMinute, homeTimeZone);
      backAtCutoffMinute = cutoffMinute + hookMinutes + returnDriveMinutes + enRouteBreakAtCutoffMinutes;
      backAtCutoffHM = fmtHM(backAtCutoffMinute, homeTimeZone);
      backAtCutoffShort = fmtShort(backAtCutoffMinute, homeTimeZone);
      // N1: "too early to roll" dead zone — when rolling now forces an en-route 30-min break past windowEnd,
      // the only legal roll times are [now + needBreakWait, cutoffMinute].
      rollNowOverWindow = backIfRollNowMinute > windowEndMinute;
      if (enRouteBreakIfRollNowMinutes > 0 && rollNowOverWindow && needBreakWait > 0) {
        earliestRollMinute = now + needBreakWait;
        earliestRollHM = fmtHM(earliestRollMinute, homeTimeZone);
        earliestRollShort = fmtShort(earliestRollMinute, homeTimeZone);
        earliestRollWarning = `Don't roll before ${earliestRollHM} — ${needBreakWait} more ${needBreakWait === 1 ? 'minute' : 'minutes'} here completes your 30-minute break; rolling earlier forces a 30-min stop that runs past your ${windowLimitH}-hr window (${breakCite}).`;
      }
      const earliestRollDispatch = earliestRollHM
        ? ` Don't roll before ${earliestRollHM} (${needBreakWait}m more here completes 30-min break, ${breakCite}; rolling earlier forces a 30m stop past the ${windowLimitH}-hr window).`
        : '';
      if (cycleBinds) {
        headline = waitLeftMinutes > 0
          ? `Must roll by ${cutoffHM} — ${dur(waitLeftMinutes)} of wait left (${cycleLimitH}-hr cycle)`
          : `Must roll by ${cutoffHM} — 0m of wait left (roll now — ${cycleLimitH}-hr cycle)`;
        subline = `${cycleLimitH}-hr cycle limits ON-duty waiting before your ${windowRuleLabel} cutoff (${fmtHM(effectiveWindowCutoffMinute, homeTimeZone)}) — ${dur(cycleRemainingMinutes)} left on cycle vs ${dur(returnDutyMinutes)} for hook + drive (${cycleCite}).${enRouteBreakAtCutoffMinutes > 0 ? ` Includes 30m en-route break (${breakCite}).` : ''}`;
        dispatchText = `Waiting at meet point (ON duty). Hard legal cutoff to return to terminal is ${cutoffHM} (${activeDispatchParen}).${earliestRollDispatch} If swap isn't ready by ${cutoffHM}, will need motel laydown / repower. Planning estimate — my ELD governs.`;
      } else {
        headline = waitLeftMinutes > 0
          ? (breakAdjustedCutoff
              ? `Must roll by ${cutoffHM} — ${dur(waitLeftMinutes)} of wait left (incl. 30m break)`
              : `Must roll by ${cutoffHM} — ${dur(waitLeftMinutes)} of wait left`)
          : (breakAdjustedCutoff
              ? `Must roll by ${cutoffHM} — 0m of wait left (roll now; incl. 30m break)`
              : `Must roll by ${cutoffHM} — 0m of wait left (roll now)`);
        subline = breakAdjustedCutoff
          ? `${windowLimitH}-hr window ends ${windowEndHM} (${dur(windowRemainingMinutes)} remaining) — cutoff moved 30m earlier for a required en-route 30-minute break (${breakCite}).`
          : `${windowLimitH}-hr window ends ${windowEndHM} (${dur(windowRemainingMinutes)} remaining).`;
        dispatchText = `Waiting at meet point. Hard legal cutoff to return to terminal is ${cutoffHM} (${activeDispatchParen}).${earliestRollDispatch} If swap isn't ready by ${cutoffHM}, will need motel laydown / repower. Planning estimate — my ELD governs.`;
      }
    }
  }

  let breakCovered: boolean;
  let breakMinutesShort: number;
  let breakLine: string;
  if (shortHaulExempt) {
    breakCovered = true;
    breakMinutesShort = 0;
    breakLine = 'Short-haul setting is ON — exempt from the 30-minute break rule (49 CFR 395.1(e)).';
  } else if (currentNonDriveMinutes >= LIMITS.BREAK_LEN) {
    breakCovered = true;
    breakMinutesShort = 0;
    breakLine = 'This wait already covers your 30-minute break — no extra stop needed on the way back (as long as the wait counts as off duty, sleeper, or on duty not driving).';
  } else if (needBreakWait === 0) {
    breakCovered = true;
    breakMinutesShort = 0;
    breakLine = currentNonDriveMinutes > 0
      ? `Your wait (${dur(currentNonDriveMinutes)}) + swap/hook (${dur(hookMinutes)}) covers your 30-minute break — no extra stop needed on the way back (as long as both count as off duty, sleeper, or on duty not driving).`
      : `Your ${dur(hookMinutes)} swap/hook covers your 30-minute break — no extra stop needed on the way back (as long as hook time counts as on duty not driving).`;
  } else {
    breakCovered = false;
    breakMinutesShort = needBreakWait;
    if (enRouteBreakAtCutoffMinutes > 0) {
      if (breakAdjustedCutoff) {
        breakLine = hookMinutes > 0
          ? `Cutoff moved 30m earlier for a required en-route 30-minute break (${breakCite}) — ${dur(currentNonDriveMinutes)} waited + ${dur(hookMinutes)} hook leaves ${breakMinutesShort} ${breakMinutesShort === 1 ? 'minute' : 'minutes'} short of a 30-minute break before rolling.`
          : `Cutoff moved 30m earlier for a required en-route 30-minute break (${breakCite}) — ${dur(currentNonDriveMinutes)} non-driving so far leaves ${breakMinutesShort} ${breakMinutesShort === 1 ? 'minute' : 'minutes'} short of a 30-minute break before rolling.`;
      } else {
        breakLine = hookMinutes > 0
          ? `En-route 30-minute break required (${breakCite}) — ${dur(currentNonDriveMinutes)} waited + ${dur(hookMinutes)} hook leaves ${breakMinutesShort} ${breakMinutesShort === 1 ? 'minute' : 'minutes'} short before your ${cycleLimitH}-hr cycle cutoff; take the 30m break OFF duty en route.`
          : `En-route 30-minute break required (${breakCite}) — ${dur(currentNonDriveMinutes)} non-driving so far leaves ${breakMinutesShort} ${breakMinutesShort === 1 ? 'minute' : 'minutes'} short before your ${cycleLimitH}-hr cycle cutoff; take the 30m break OFF duty en route.`;
      }
    } else if (earliestRollHM) {
      breakLine = hookMinutes > 0
        ? `Wait until at least ${earliestRollHM} (${breakMinutesShort} more ${breakMinutesShort === 1 ? 'minute' : 'minutes'} here + ${dur(hookMinutes)} hook) to complete your 30-minute break — rolling earlier forces a 30-min stop past your ${windowLimitH}-hr window (${breakCite}).`
        : `Wait until at least ${earliestRollHM} (${breakMinutesShort} more ${breakMinutesShort === 1 ? 'minute' : 'minutes'} here) to complete your 30-minute break — rolling earlier forces a 30-min stop past your ${windowLimitH}-hr window (${breakCite}).`;
    } else {
      breakLine = hookMinutes > 0
        ? `Another ${breakMinutesShort} ${breakMinutesShort === 1 ? 'minute' : 'minutes'} of this wait (plus your ${dur(hookMinutes)} hook) covers your 30-minute break.`
        : `Another ${breakMinutesShort} ${breakMinutesShort === 1 ? 'minute' : 'minutes'} of this wait covers your 30-minute break.`;
    }
  }

  const returnOverEightNote = !shortHaulExempt && returnDriveMinutes > LIMITS.BREAK_AFTER
    ? `Note: a return drive over 8 hours requires an en-route 30-minute break before hour 8 of driving — included in the cutoff and arrival estimate (${breakCite}).`
    : null;

  const waitingOnDutyNote = input.currentStatus === 'ON' && cycleFeasible && validInput
    ? (cycleBinds
        ? `You are logged ON DUTY — waiting burns your ${cycleLimitH}-hr cycle (${dur(cycleRemainingMinutes - returnDutyMinutes)} margin after hook + drive), which binds before your ${windowLimitH}-hr window cutoff (${fmtHM(effectiveWindowCutoffMinute, homeTimeZone)}). Log OFF duty or Sleeper if relieved from duty.`
        : `You are logged ON DUTY — waiting burns your ${cycleLimitH}-hr cycle (${dur(cycleRemainingMinutes - returnDutyMinutes)} margin after hook + drive). Log OFF duty or Sleeper if relieved from duty.`)
    : null;

  return {
    validInput,
    status,
    tone,
    sign,
    verdictLabel,
    effectiveMph,
    returnDriveMinutes,
    hookMinutes,
    returnDutyMinutes,
    homeTimeZone,
    homeZoneName,
    nowHM,
    nowShort,
    driveLimitMinutes,
    driveRemainingMinutes,
    driveFeasible,
    cycleLimitMinutes,
    cycleWindowDays,
    cycleRemainingMinutes,
    cycleFeasible,
    windowLimitMinutes,
    windowUsedMinutes,
    windowRemainingMinutes,
    windowEndMinute,
    windowEndHM,
    windowEndShort,
    window14CutoffMinute,
    window16CutoffMinute,
    bigDayRequested: input.bigDay,
    bigDayApplied,
    bigDayBlockedByLog,
    bigDayLogNote,
    bigDayEligibilityWarning: MOTEL_BIG_DAY_WARNING,
    cutoffMinute,
    cutoffHM,
    cutoffShort,
    waitLeftMinutes,
    backIfRollNowMinute,
    backIfRollNowHM,
    backIfRollNowShort,
    backAtCutoffMinute,
    backAtCutoffHM,
    backAtCutoffShort,
    earliestRollMinute,
    earliestRollHM,
    earliestRollShort,
    rollNowOverWindow,
    earliestRollWarning,
    binding,
    bindingLabel,
    bindingCite,
    bindingText,
    shortHaulExempt,
    breakRemainingMinutes,
    breakAdjustedCutoff,
    enRouteBreakIfRollNowMinutes,
    enRouteBreakAtCutoffMinutes,
    currentNonDriveMinutes,
    breakCovered,
    breakMinutesShort,
    breakLine,
    returnOverEightNote,
    waitingOnDutyNote,
    headline,
    subline,
    dispatchText,
  };
}
