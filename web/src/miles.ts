/**
 * Miles Left in My 70 — Weekly Miles & Governed-Truck Cycle Pace Check (Plan tool #12 / Spec #5).
 *
 * Pure app-layer logic module layered directly on `engine/src/index.ts` (`evaluate()`,
 * `carrierDayStart()`, `nextCarrierDayStart()`, `dayLabel()`, `localToMinute()`, `minutesOf()`,
 * `restPeriods()`, `LIMITS`) and `web/src/recap.ts` / `web/src/carrierday.ts` / `web/src/store.ts`.
 * Zero modifications to `engine/` or `web/src/store.ts`; zero `localStorage` usage; session-only state.
 *
 * Simulation formulation:
 *   1. Runs `evaluate(logged, { asOf: now, config, forecastDays: 9 })` to read the engine's exact
 *      rolling cycle state (`limit`, `windowDays`, `days[]`, `used`, `remaining`, `forecast[]`) AND
 *      current shift state (`shift.driveRemaining`, `shift.windowRemaining`, `shift.breakRemaining`,
 *      `shift.anchor`, `driveNow`), honoring 70/8 vs 60/7, custom `dayStartHour:dayStartMinute`
 *      (e.g. 18:40), `timeZone`, prior 34-hour restarts, and DST transitions.
 *   2. Resolves the pay-week cutoff `(cutoffDow, cutoffHour, cutoffMinuteOfHour)` to the first
 *      instant at or after `now` in the carrier's home-terminal timezone (DST-safe via
 *      `localToMinute()` with repeated-hour handling).
 *   3. Walks carrier day by carrier day from today (`day 0`) through the carrier day containing
 *      the cutoff, maintaining the rolling `windowDays` on-duty buckets (same bucket model as
 *      `recap.ts`) and an explicit 10-hour inter-shift rest gate:
 *      - Day 0 honors the current shift's remaining 11h drive, 14h window, and 8h/30m break clocks
 *        from `evaluate()`, charging only the not-yet-worked portion of daily overhead
 *        (`max(0, overhead - workedOnInShift)`). When the current shift is spent or a 10h rest is
 *        in progress, the next shift starts no earlier than `ongoingRestStart + 10h`.
 *      - Each day `k >= 1` starts at `sliceStart = max(dayStart, previousShiftEnd + 10h)`,
 *        enforcing the 10-hour rest (§395.3(a)(1)) explicitly across carrier-day boundaries.
 *      - Non-short-haul shifts enforce the 30-minute break rule (§395.3(a)(3)(ii)): when driving
 *        exceeds `breakRemaining` (8h on fresh shifts, or `ev.shift.breakRemaining` on day 0) and
 *        charged on-duty overhead + trailing non-driving time is `< 30m`, the missing break minutes
 *        are subtracted from usable wall and shift-window time (0 extra cycle cost).
 *      - Consumes `drive + dayOverhead` in cycle buckets when `drive > 0` (0 when no driving fits,
 *        so tiny slivers never burn phantom overhead).
 *   4. Total max legal miles (without a 34-hr restart) = `round((sum(driveCapacity) / 60) * mph)`.
 *      Per-day `displayMiles` are reconciled via largest-remainder rounding so displayed rows
 *      always sum exactly to `maxLegalMiles`.
 *   5. When short of goal and `overhead >= 30m`, re-runs the exact same simulation with
 *      `overhead - 30m` and reports the delta ONLY when it strictly adds miles.
 *
 * Framing: legal HOS miles estimate only (without a 34-hr restart) — no medical/sleep advice
 * and no payroll/rate math.
 */
import type { FullEvaluation, RulesConfig, Segment } from '../../engine/src/index.ts';
import {
  LIMITS,
  dayLabel,
  evaluate,
  localToMinute,
  minutesOf,
  nextCarrierDayStart,
  restPeriods,
} from '../../engine/src/index.ts';
import { isValidTimeZone, zoneShort } from './store.ts';
import { dayStartWord, formatDayStartHM, safeRulesConfig } from './carrierday.ts';
import { parseIsoDay } from './recap.ts';

export const MILES_STANDING_LINE =
  'Estimate only — legal HOS miles at your real average speed, not an ELD record or settlement guarantee.';

export const MILES_GOAL_PRESETS = [2200, 2500, 2800, 3000] as const;
export const MILES_OVERHEAD_PRESETS = [
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1h 15m', minutes: 75 },
  { label: '1h 30m', minutes: 90 },
  { label: '2h', minutes: 120 },
] as const;

export const MILES_DOW_LABELS = [
  { dow: 0, short: 'Sun', name: 'Sunday' },
  { dow: 1, short: 'Mon', name: 'Monday' },
  { dow: 2, short: 'Tue', name: 'Tuesday' },
  { dow: 3, short: 'Wed', name: 'Wednesday' },
  { dow: 4, short: 'Thu', name: 'Thursday' },
  { dow: 5, short: 'Fri', name: 'Friday' },
  { dow: 6, short: 'Sat', name: 'Saturday' },
] as const;

export const MILES_DEFAULT_RUN = 0;
export const MILES_DEFAULT_GOAL = 2800;
export const MILES_DEFAULT_MPH = 57;
export const MILES_MIN_MPH = 25;
export const MILES_MAX_MPH = 75;
export const MILES_DEFAULT_OVERHEAD_MIN = 75; // 1h 15m
export const MILES_MAX_OVERHEAD_MIN = 480; // 8h 00m
export const MILES_DEFAULT_CUTOFF_DOW = 6; // Saturday
export const MILES_DEFAULT_CUTOFF_HOUR = 23;
export const MILES_DEFAULT_CUTOFF_MIN = 59;
export const MILES_MAX_RUN = 10000;
export const MILES_MAX_GOAL = 10000;
export const MILES_TRIM_STEP_MIN = 30;

export type MilesDayCapKind = 'none' | 'drive11' | 'window14';
export type MilesDailyCapKind = 'none' | 'drive11' | 'window14' | 'both';

export interface MilesInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current UTC epoch minute. */
  now: number;
  /** Carrier rules config (60/7 or 70/8, dayStartHour, dayStartMinute, timeZone). */
  config: RulesConfig;
  /** Miles already run this pay week (>= 0). */
  milesAlreadyRun: number;
  /** Weekly mileage goal (> 0). */
  goalMiles: number;
  /** Driver's real average speed in mph (not governor setting). */
  mph: number;
  /** Daily non-driving on-duty overhead in minutes (pre-trip, fuel, drop/hook, dock). */
  overheadMinutes: number;
  /** Pay-week cutoff day of week: 0 = Sun .. 6 = Sat (default 6 = Sat). */
  cutoffDow: number;
  /** Pay-week cutoff hour in carrier home-terminal timezone (0..23, default 23). */
  cutoffHour: number;
  /** Pay-week cutoff minute in carrier home-terminal timezone (0..59, default 59). */
  cutoffMinuteOfHour: number;
}

export interface MilesDaySim {
  /** 0 = today's carrier day, 1..K = upcoming carrier days through cutoff. */
  dayIndex: number;
  dayStart: number;
  dayEnd: number;
  label: string;
  shortLabel: string;
  dayShort: string;
  /** Minutes of cycle dropping off at this carrier day's start (0 for today). */
  dropsOffMinutes: number;
  /** Available cycle minutes at the start of this day's simulation step. */
  availCycleMinutes: number;
  /** Wall-clock minutes available in this carrier day after inter-shift 10h rest and before cutoff. */
  wallMinutes: number;
  /** Simulated legal driving minutes on this carrier day. */
  driveMinutes: number;
  /** Simulated on-duty overhead minutes consumed on this carrier day (0 if driveMinutes === 0). */
  overheadUsedMinutes: number;
  /** Extra off-duty 30-min break minutes required beyond overhead on this day (0 when covered or shortHaul). */
  breakOffMinutes: number;
  /** Total cycle minutes consumed on this carrier day (`driveMinutes + overheadUsedMinutes`). */
  consumedMinutes: number;
  /** Estimated miles driven on this carrier day (unrounded float for reference). */
  driveMilesExact: number;
  /** Reconciled integer miles for display so `sum(displayMiles) === maxLegalMiles`. */
  displayMiles: number;
  /** True when either the 11h drive limit or 14h shift window bound this day before cycle/wall. */
  hitDailyCap: boolean;
  /** Which daily shift limit bound this day (`'none' | 'drive11' | 'window14'`). */
  capKind: MilesDayCapKind;
}

export type MilesVerdictStatus = 'met' | 'doable' | 'short';

export interface MilesPlanResult {
  homeTimeZone: string;
  homeZoneName: string;
  cycle: RulesConfig['cycle'];
  cycleLimitHours: number;
  cycleLimitMinutes: number;
  windowDays: number;
  dayStartHM: string;
  dayStartLabel: string;
  now: number;
  cutoffDow: number;
  cutoffHour: number;
  cutoffMinuteOfHour: number;
  cutoffHM: string;
  cutoffMinute: number;
  cutoffShort: string;
  /** Current cycle remaining at `now` from `evaluate()`. */
  remainingNowMinutes: number;
  /** Over-cycle deficit at `now` (`max(0, ev.cycle.used - limit)`), 0 when within cycle. */
  overCycleNowMinutes: number;
  /** Raw recap drop-off minutes landing strictly after `now` and at/before `cutoffMinute`. */
  recapsBeforeCutoffMinutes: number;
  /** Net usable recap minutes (`max(0, cycleThroughCutoffMinutes - remainingNowMinutes)`): always satisfies `remainingNow + netRecaps === cycleThroughCutoff`. */
  netRecapsBeforeCutoffMinutes: number;
  /** Total cycle minutes available through cutoff (matches `evaluate(asOf: cutoffMinute).cycle.remaining`). */
  cycleThroughCutoffMinutes: number;
  /** `cycleThroughCutoffMinutes` formatted as `H:MM` (e.g. `31:20`). */
  cycleThroughCutoffHMM: string;
  /** Recap minutes landing at the exact `cutoffMinute` carrier-day boundary (0 wall minutes left to use them). */
  boundaryDropAtCutoffMinutes: number;
  /** One-line honesty note when `boundaryDropAtCutoffMinutes > 0`, else null. */
  boundaryDropNote: string | null;
  /** Effective sanitized inputs used by the simulation. */
  milesAlreadyRun: number;
  goalMiles: number;
  mph: number;
  overheadMinutes: number;
  /** Day-by-day carrier-day simulation breakdown from `now` through `cutoffMinute`. */
  days: MilesDaySim[];
  /** Number of carrier days simulated from `now` through `cutoffMinute`. */
  dayCount: number;
  /** Number of carrier days with positive driving capacity. */
  activeDayCount: number;
  /** Total simulated legal driving minutes through cutoff. */
  totalDriveMinutes: number;
  /** Total simulated on-duty overhead minutes consumed through cutoff. */
  totalOverheadMinutes: number;
  /** Max legal miles left in the tank without a 34-hr restart (`round(totalDriveMinutes / 60 * mph)`). */
  maxLegalMiles: number;
  /** Weekly ceiling without a 34-hr restart: `milesAlreadyRun + maxLegalMiles`. */
  ceilingMiles: number;
  /** `'met'` when `milesAlreadyRun >= goalMiles`, `'doable'` when `ceilingMiles >= goalMiles`, else `'short'`. */
  status: MilesVerdictStatus;
  tone: 'good' | 'warn' | 'bad';
  /** Positive cushion when doable (`ceilingMiles - goalMiles`), or ahead amount when already met (`milesAlreadyRun - goalMiles`). */
  cushionMiles: number;
  /** Positive shortfall when short (`goalMiles - ceilingMiles`), else 0. */
  shortfallMiles: number;
  /** Plain-language primary verdict headline. */
  verdictHeadline: string;
  /** Tank summary line naming configured rule (60 or 70), H:MM, ~N max legal miles (without a 34), and mph. */
  tankSummaryLine: string;
  /** True when the 11h daily drive limit or 14h window limited at least one day while cycle still had unused headroom at cutoff. */
  dailyCapBound: boolean;
  /** Truthful binding cap kind (`'none' | 'drive11' | 'window14' | 'both'`). */
  dailyCapKind: MilesDailyCapKind;
  /** Truthful cap explanation sentence when `dailyCapBound`, else null. */
  dailyCapNote: string | null;
  /** Honest lever when short: extra miles added by trimming 30m/day of overhead (0 if not short or no gain). */
  trimAddsMiles: number;
  /** Rendered trim-lever sentence, or null when not short or when trimming adds 0 miles. */
  trimLeverLine: string | null;
  standingLine: string;
}

/* ---------- formatting helpers (host-TZ independent) ---------- */

const dtfPartsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfPartsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    dtfPartsCache.set(tz, f);
  }
  return f;
}

function localWallParts(minute: number, tz: string) {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = partsFormatter(safeTz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hourStr = get('hour') === '24' ? '00' : get('hour');
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    weekday: get('weekday'),
    hourStr,
    minStr: get('minute'),
    h: Number(hourStr),
    min: Number(get('minute')),
  };
}

/** Format minutes as `H:MM` (e.g. `31:20`, `70:00`, `0:00`). */
export function fmtHMM(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Format duration as compact `Xh YYm` or `Ym` (e.g. `4h 00m`, `1h 15m`, `45m`). */
function fmtDurCompact(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${String(rem).padStart(2, '0')}m` : `${rem}m`;
}

/** Format integer with US thousands separators (e.g. `2,800`). */
export function fmtMilesNum(n: number): string {
  const v = Math.max(0, Math.round(n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatCutoffHM(hour: number, minute: number): string {
  const h = Math.max(0, Math.min(23, Math.trunc(hour)));
  const m = Math.max(0, Math.min(59, Math.trunc(minute)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtMilesShort(minute: number, tz: string): string {
  const p = localWallParts(minute, tz);
  return `${p.weekday} ${p.hourStr}:${p.minStr}`;
}

/**
 * Resolve pay-week cutoff `(cutoffDow, cutoffHour, cutoffMinuteOfHour)` to the first
 * UTC epoch minute at or after `now` in `tz`. DST-safe via engine `localToMinute()`.
 */
export function resolveCutoffMinute(
  now: number,
  cutoffDow: number,
  cutoffHour: number,
  cutoffMinuteOfHour: number,
  tz: string,
): number {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const dow = ((Math.trunc(cutoffDow) % 7) + 7) % 7;
  const h = Math.max(0, Math.min(23, Math.trunc(cutoffHour)));
  const m = Math.max(0, Math.min(59, Math.trunc(cutoffMinuteOfHour)));
  const p = localWallParts(now, safeTz);
  const candidates: number[] = [];
  for (let delta = 0; delta <= 8; delta++) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + delta));
    if (dt.getUTCDay() !== dow) continue;
    const cy = dt.getUTCFullYear();
    const cm = dt.getUTCMonth() + 1;
    const cd = dt.getUTCDate();
    const cand = localToMinute(cy, cm, cd, h, safeTz, m);
    if (cand >= now) candidates.push(cand);
    // DST fall-back repeated hour check (±60m)
    for (const shift of [-60, 60]) {
      const alt = cand + shift;
      if (alt >= now) {
        const ap = localWallParts(alt, safeTz);
        if (ap.y === cy && ap.m === cm && ap.d === cd && ap.h === h && ap.min === m) {
          candidates.push(alt);
        }
      }
    }
  }
  candidates.sort((a, b) => a - b);
  return candidates[0] ?? now;
}

/* ---------- day-0 shift inspection & day-by-day rolling-window simulation ---------- */

const ON_ONLY = new Set(['ON']);

interface Day0ShiftState {
  isFresh: boolean;
  driveRemaining: number;
  windowRemaining: number;
  breakRemaining: number;
  workedOnInShift: number;
  day0Overhead: number;
  trailingNonDrive: number;
  /** When `!isFresh` and day 0 does 0 driving, the 10h rest ends at `ongoingRestStart + 600`. */
  ongoingRestStart: number | null;
}

function inspectDay0Shift(
  ev: FullEvaluation,
  now: number,
  overheadMinutes: number,
  shortHaul: boolean,
): Day0ShiftState {
  const segs = ev.segments;
  let lastWorkEnd: number | null = null;
  let lastDriveEnd: number | null = null;
  for (const s of segs) {
    if (s.status === 'D' || s.status === 'ON') {
      if (lastWorkEnd === null || s.end > lastWorkEnd) lastWorkEnd = s.end;
    }
    if (s.status === 'D') {
      if (lastDriveEnd === null || s.end > lastDriveEnd) lastDriveEnd = s.end;
    }
  }
  const lastSeg = segs.length > 0 ? segs[segs.length - 1] : null;
  const engineFresh = segs.length === 0 || lastWorkEnd === null || (ev.shift.driveUsed === 0 && ev.shift.windowUsed === 0);
  const trailingGapReset = lastSeg !== null && lastSeg.end < now && lastWorkEnd !== null && (now - lastWorkEnd) >= LIMITS.RESET;

  if (engineFresh || trailingGapReset) {
    return {
      isFresh: true,
      driveRemaining: engineFresh ? ev.shift.driveRemaining : LIMITS.DRIVE,
      windowRemaining: engineFresh ? ev.shift.windowRemaining : LIMITS.WINDOW,
      breakRemaining: shortHaul ? Infinity : LIMITS.BREAK_AFTER,
      workedOnInShift: 0,
      day0Overhead: overheadMinutes,
      trailingNonDrive: 0,
      ongoingRestStart: null,
    };
  }

  const workedOnInShift = minutesOf(segs, ON_ONLY, ev.shift.anchor, now);
  const day0Overhead = Math.max(0, overheadMinutes - workedOnInShift);

  let trailingNonDrive = 0;
  if (lastSeg !== null && lastSeg.end === now && lastSeg.status !== 'D') {
    trailingNonDrive = lastDriveEnd !== null
      ? Math.min(LIMITS.BREAK_LEN, Math.max(0, now - lastDriveEnd))
      : LIMITS.BREAK_LEN;
  }

  // If the driver is currently in a logged OFF/SB segment ending at `now`, a future rest merges
  // with it in timeline.ts so the 10h reset finishes at `lastRest.start + 10h`. Otherwise
  // (actively working, or unlogged trailing gap < 10h), a new 10h rest starts at `now`.
  let ongoingRestStart = now;
  if (lastSeg !== null && lastSeg.end === now && (lastSeg.status === 'OFF' || lastSeg.status === 'SB')) {
    const rests = restPeriods(segs);
    const lastRest = rests.length > 0 ? rests[rests.length - 1] : null;
    if (lastRest && lastRest.end === now) {
      ongoingRestStart = lastRest.start;
    }
  }

  return {
    isFresh: false,
    driveRemaining: ev.shift.driveRemaining,
    windowRemaining: ev.shift.windowRemaining,
    breakRemaining: shortHaul ? Infinity : ev.shift.breakRemaining,
    workedOnInShift,
    day0Overhead,
    trailingNonDrive,
    ongoingRestStart,
  };
}

interface SimFrame {
  start: number;
  end: number;
  label: string;
  shortLabel: string;
  dayShort: string;
  dropsOff: number;
}

interface SimResult {
  days: MilesDaySim[];
  totalDriveMinutes: number;
  totalOverheadMinutes: number;
  maxLegalMiles: number;
  dailyCapBound: boolean;
  dailyCapKind: MilesDailyCapKind;
}

function runDayByDaySimulation(
  pastOnDuty: number[],
  simFrames: SimFrame[],
  now: number,
  cutoffMinute: number,
  limit: number,
  windowDays: number,
  overheadMinutes: number,
  mph: number,
  shortHaul: boolean,
  day0: Day0ShiftState,
): SimResult {
  const todayIdx = pastOnDuty.length - 1;
  // Rolling on-duty buckets: past `windowDays` carrier days + upcoming carrier days through cutoff.
  const buckets: number[] = [...pastOnDuty];
  for (let k = 1; k < simFrames.length; k++) buckets.push(0);

  const windowUsedThrough = (idx: number): number => {
    let sum = 0;
    const from = Math.max(0, idx - (windowDays - 1));
    for (let i = from; i <= idx; i++) sum += buckets[i];
    return sum;
  };

  const days: MilesDaySim[] = [];
  let totalDriveMinutes = 0;
  let totalOverheadMinutes = 0;
  let anyDrive11Cap = false;
  let anyWindow14Cap = false;

  // Explicit 10-hour rest gate between shifts: day k >= 1 starts at max(dayStart, nextShiftEarliestStart).
  let nextShiftEarliestStart = now;

  for (let k = 0; k < simFrames.length; k++) {
    const f = simFrames[k];
    const idx = todayIdx + k;
    const isDay0 = k === 0;
    const availCycle = Math.max(0, limit - windowUsedThrough(idx));

    const shiftDriveRem = isDay0 ? day0.driveRemaining : LIMITS.DRIVE;
    const shiftWindowRem = isDay0 ? day0.windowRemaining : LIMITS.WINDOW;
    const dayOverhead = isDay0 ? day0.day0Overhead : overheadMinutes;
    const breakRem = isDay0 ? day0.breakRemaining : (shortHaul ? Infinity : LIMITS.BREAK_AFTER);
    const trailingNonDrive = isDay0 ? day0.trailingNonDrive : 0;

    const sliceStart = Math.max(f.start, isDay0 ? now : nextShiftEarliestStart);
    const sliceEnd = Math.min(f.end, cutoffMinute);
    const wallMinutes = Math.max(0, sliceEnd - sliceStart);

    const cycleAfterOverhead = Math.max(0, availCycle - dayOverhead);
    const wallAfterOverhead = Math.max(0, wallMinutes - dayOverhead);
    const windowAfterOverhead = Math.max(0, shiftWindowRem - dayOverhead);

    // Option 1: drive without taking an extra OFF-duty break beyond charged on-duty overhead
    const breakCoveredAtStart = shortHaul || (trailingNonDrive + dayOverhead >= LIMITS.BREAK_LEN);
    const breakCoveredMidShift = shortHaul || (dayOverhead >= LIMITS.BREAK_LEN);
    const noExtraBreakCap = breakRem === 0
      ? (breakCoveredAtStart ? Infinity : 0)
      : (breakCoveredMidShift ? Infinity : breakRem);
    const driveNoExtraBreak = Math.max(
      0,
      Math.min(shiftDriveRem, noExtraBreakCap, cycleAfterOverhead, wallAfterOverhead, windowAfterOverhead),
    );

    // Option 2: take the extra OFF-duty break minutes needed for §395.3(a)(3)(ii)
    // (consumes wall & shift-window time, 0 extra cycle cost)
    const extraOffBreakNeeded = shortHaul
      ? 0
      : (breakRem === 0
        ? Math.max(0, LIMITS.BREAK_LEN - trailingNonDrive - dayOverhead)
        : Math.max(0, LIMITS.BREAK_LEN - dayOverhead));
    const driveWithBreak = extraOffBreakNeeded > 0
      ? Math.max(
        0,
        Math.min(
          shiftDriveRem,
          cycleAfterOverhead,
          Math.max(0, wallAfterOverhead - extraOffBreakNeeded),
          Math.max(0, windowAfterOverhead - extraOffBreakNeeded),
        ),
      )
      : driveNoExtraBreak;

    const driveMinutes = Math.max(driveNoExtraBreak, driveWithBreak);
    const breakOffMinutes = driveMinutes > driveNoExtraBreak ? extraOffBreakNeeded : 0;
    const overheadUsedMinutes = driveMinutes > 0 ? dayOverhead : 0;
    const consumedMinutes = driveMinutes + overheadUsedMinutes;
    const shiftWallUsed = driveMinutes > 0 ? driveMinutes + overheadUsedMinutes + breakOffMinutes : 0;

    // Advance explicit 10-hour rest gate for subsequent days
    if (driveMinutes > 0) {
      nextShiftEarliestStart = sliceStart + shiftWallUsed + LIMITS.RESET;
    } else if (isDay0 && !day0.isFresh && day0.ongoingRestStart !== null) {
      nextShiftEarliestStart = day0.ongoingRestStart + LIMITS.RESET;
    }

    buckets[idx] += consumedMinutes;
    totalDriveMinutes += driveMinutes;
    totalOverheadMinutes += overheadUsedMinutes;

    // Determine whether a shift limit (11h drive vs 14h window) strictly bound this day before cycle and wall
    const unconstrainedNoExtra = Math.max(0, Math.min(noExtraBreakCap, cycleAfterOverhead, wallAfterOverhead));
    const unconstrainedWithBreak = extraOffBreakNeeded > 0
      ? Math.max(0, Math.min(cycleAfterOverhead, Math.max(0, wallAfterOverhead - extraOffBreakNeeded)))
      : unconstrainedNoExtra;
    const unconstrainedDrive = Math.max(unconstrainedNoExtra, unconstrainedWithBreak);

    let capKind: MilesDayCapKind = 'none';
    if (driveMinutes > 0 && unconstrainedDrive > driveMinutes) {
      const effectiveWindowCap = Math.max(0, windowAfterOverhead - breakOffMinutes);
      if (effectiveWindowCap < shiftDriveRem && driveMinutes === effectiveWindowCap) {
        capKind = 'window14';
        anyWindow14Cap = true;
      } else {
        capKind = 'drive11';
        anyDrive11Cap = true;
      }
    }
    const hitDailyCap = capKind !== 'none';

    days.push({
      dayIndex: k,
      dayStart: f.start,
      dayEnd: f.end,
      label: f.label,
      shortLabel: f.shortLabel,
      dayShort: f.dayShort,
      dropsOffMinutes: f.dropsOff,
      availCycleMinutes: availCycle,
      wallMinutes,
      driveMinutes,
      overheadUsedMinutes,
      breakOffMinutes,
      consumedMinutes,
      driveMilesExact: (driveMinutes / 60) * mph,
      displayMiles: 0,
      hitDailyCap,
      capKind,
    });
  }

  const finalCycleLeft = Math.max(0, limit - windowUsedThrough(todayIdx + simFrames.length - 1));
  const dailyCapBound = (anyDrive11Cap || anyWindow14Cap) && finalCycleLeft > 0;
  let dailyCapKind: MilesDailyCapKind = 'none';
  if (dailyCapBound) {
    dailyCapKind = anyDrive11Cap && anyWindow14Cap
      ? 'both'
      : anyWindow14Cap
        ? 'window14'
        : 'drive11';
  }

  const maxLegalMiles = Math.round((totalDriveMinutes / 60) * mph);

  // Largest-remainder reconciliation so displayed per-day miles always sum exactly to maxLegalMiles
  const activeIndices: { idx: number; rem: number }[] = [];
  let floorSum = 0;
  for (let i = 0; i < days.length; i++) {
    if (days[i].driveMinutes <= 0) {
      days[i].displayMiles = 0;
    } else {
      const fl = Math.floor(days[i].driveMilesExact);
      days[i].displayMiles = fl;
      floorSum += fl;
      activeIndices.push({ idx: i, rem: days[i].driveMilesExact - fl });
    }
  }
  const deltaMiles = maxLegalMiles - floorSum;
  if (deltaMiles > 0 && activeIndices.length > 0) {
    activeIndices.sort((a, b) => (b.rem - a.rem) || (a.idx - b.idx));
    for (let j = 0; j < deltaMiles && j < activeIndices.length; j++) {
      days[activeIndices[j].idx].displayMiles += 1;
    }
  } else if (deltaMiles < 0 && activeIndices.length > 0) {
    activeIndices.sort((a, b) => (a.rem - b.rem) || (b.idx - a.idx));
    for (let j = 0; j < -deltaMiles && j < activeIndices.length; j++) {
      if (days[activeIndices[j].idx].displayMiles > 0) {
        days[activeIndices[j].idx].displayMiles -= 1;
      }
    }
  }

  return { days, totalDriveMinutes, totalOverheadMinutes, maxLegalMiles, dailyCapBound, dailyCapKind };
}

/**
 * Evaluate "Miles Left in My 70" from logged segments, current time, carrier rules, and driver inputs.
 */
export function evaluateMilesLeft(input: MilesInput): MilesPlanResult {
  const config = safeRulesConfig(input.config);
  const homeTimeZone = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const homeZoneName = zoneShort(homeTimeZone);
  const logged = input.segments.filter((s) => !s.tentative);

  // Sanitize numeric inputs
  const milesAlreadyRun = Number.isFinite(input.milesAlreadyRun)
    ? Math.max(0, Math.min(MILES_MAX_RUN, Math.round(input.milesAlreadyRun)))
    : MILES_DEFAULT_RUN;
  const goalMiles = Number.isFinite(input.goalMiles)
    ? Math.max(1, Math.min(MILES_MAX_GOAL, Math.round(input.goalMiles)))
    : MILES_DEFAULT_GOAL;
  const mph = Number.isFinite(input.mph)
    ? Math.max(MILES_MIN_MPH, Math.min(MILES_MAX_MPH, Math.round(input.mph)))
    : MILES_DEFAULT_MPH;
  const overheadMinutes = Number.isFinite(input.overheadMinutes)
    ? Math.max(0, Math.min(MILES_MAX_OVERHEAD_MIN, Math.round(input.overheadMinutes)))
    : MILES_DEFAULT_OVERHEAD_MIN;
  const cutoffDow = ((Math.trunc(input.cutoffDow) % 7) + 7) % 7;
  const cutoffHour = Math.max(0, Math.min(23, Math.trunc(input.cutoffHour)));
  const cutoffMinuteOfHour = Math.max(0, Math.min(59, Math.trunc(input.cutoffMinuteOfHour)));

  // 1. Engine evaluation at `now` with 9 forecast carrier days (covers any 7-day pay-week cutoff)
  const ev = evaluate(logged, { asOf: input.now, config, forecastDays: 9 });
  const { limit, windowDays } = ev.cycle;
  const cycleLimitHours = Math.round(limit / 60);
  const remainingNowMinutes = ev.cycle.remaining;
  const overCycleNowMinutes = Math.max(0, ev.cycle.used - limit);
  const pastOnDuty = ev.cycle.days.map((d) => d.onDuty);

  // 2. Resolve cutoff minute in home-terminal timezone
  const cutoffMinute = resolveCutoffMinute(input.now, cutoffDow, cutoffHour, cutoffMinuteOfHour, homeTimeZone);
  const cutoffHM = formatCutoffHM(cutoffHour, cutoffMinuteOfHour);
  const cutoffShort = fmtMilesShort(cutoffMinute, homeTimeZone);

  // 3. Build carrier-day frames from today (`day 0`) through the carrier day containing `cutoffMinute`
  const today = ev.cycle.days[ev.cycle.days.length - 1];
  const todayParsed = parseIsoDay(today.label);
  const simFrames: SimFrame[] = [
    {
      start: today.start,
      end: today.end,
      label: today.label,
      shortLabel: todayParsed.shortLabel,
      dayShort: todayParsed.dayShort,
      dropsOff: 0,
    },
  ];

  let recapsBeforeCutoffMinutes = 0;
  let boundaryDropAtCutoffMinutes = 0;
  let lastForecastAvail = remainingNowMinutes;
  for (const fc of ev.cycle.forecast) {
    if (fc.dayStart > cutoffMinute) break;
    if (fc.dayStart === cutoffMinute && fc.dropsOff > 0) {
      boundaryDropAtCutoffMinutes += fc.dropsOff;
    }
    const end = nextCarrierDayStart(fc.dayStart, config);
    const lbl = fc.label || dayLabel(fc.dayStart, config);
    const p = parseIsoDay(lbl);
    simFrames.push({
      start: fc.dayStart,
      end,
      label: lbl,
      shortLabel: p.shortLabel,
      dayShort: p.dayShort,
      dropsOff: fc.dropsOff,
    });
    recapsBeforeCutoffMinutes += fc.dropsOff;
    lastForecastAvail = fc.availableAtStart;
  }

  // Exact engine-backed cycle available through cutoff (matches `evaluate(asOf: cutoffMinute).cycle.remaining`)
  const cycleThroughCutoffMinutes = simFrames.length > 1 ? lastForecastAvail : remainingNowMinutes;
  const cycleThroughCutoffHMM = fmtHMM(cycleThroughCutoffMinutes);
  const netRecapsBeforeCutoffMinutes = Math.max(0, cycleThroughCutoffMinutes - remainingNowMinutes);
  const boundaryDropNote = boundaryDropAtCutoffMinutes > 0
    ? `Includes +${fmtHMM(boundaryDropAtCutoffMinutes)} dropping off right at the ${cutoffShort} cutoff (0m left before cutoff to drive it).`
    : null;

  // 4. Day-0 shift inspection & day-by-day simulation
  const baseDay0 = inspectDay0Shift(ev, input.now, overheadMinutes, config.shortHaul);
  const baseSim = runDayByDaySimulation(
    pastOnDuty,
    simFrames,
    input.now,
    cutoffMinute,
    limit,
    windowDays,
    overheadMinutes,
    mph,
    config.shortHaul,
    baseDay0,
  );

  const maxLegalMiles = baseSim.maxLegalMiles;
  const ceilingMiles = milesAlreadyRun + maxLegalMiles;
  const activeDayCount = baseSim.days.filter((d) => d.driveMinutes > 0).length;

  // Truthful daily-cap note naming the exact binding shift constraint (11h drive vs 14h window)
  const dayWord = activeDayCount === 1 ? 'day' : 'days';
  let dailyCapNote: string | null = null;
  if (baseSim.dailyCapKind === 'drive11') {
    dailyCapNote = `The 11-hr daily driving limit caps your miles before your ${cycleLimitHours}-hr cycle runs out (${activeDayCount} driving ${dayWord} before cutoff).`;
  } else if (baseSim.dailyCapKind === 'window14') {
    dailyCapNote = `The 14-hr shift window (after ${fmtDurCompact(overheadMinutes)}/day on-duty overhead) caps your miles before your ${cycleLimitHours}-hr cycle runs out (${activeDayCount} driving ${dayWord} before cutoff).`;
  } else if (baseSim.dailyCapKind === 'both') {
    dailyCapNote = `The 11-hr daily driving limit and 14-hr shift window cap your miles before your ${cycleLimitHours}-hr cycle runs out (${activeDayCount} driving ${dayWord} before cutoff).`;
  }

  // 5. Verdict & trim lever
  let status: MilesVerdictStatus;
  let tone: 'good' | 'warn' | 'bad';
  let cushionMiles = 0;
  let shortfallMiles = 0;
  let verdictHeadline: string;
  let trimAddsMiles = 0;
  let trimLeverLine: string | null = null;

  if (milesAlreadyRun >= goalMiles) {
    status = 'met';
    tone = 'good';
    cushionMiles = milesAlreadyRun - goalMiles;
    verdictHeadline = cushionMiles > 0
      ? `Already there — ${fmtMilesNum(milesAlreadyRun)} mi run meets your ${fmtMilesNum(goalMiles)} mi goal (+${fmtMilesNum(cushionMiles)} mi ahead).`
      : `Already there — ${fmtMilesNum(milesAlreadyRun)} mi run meets your ${fmtMilesNum(goalMiles)} mi goal.`;
  } else if (ceilingMiles >= goalMiles) {
    status = 'doable';
    tone = 'good';
    cushionMiles = ceilingMiles - goalMiles;
    verdictHeadline = `YES — doable, ~${fmtMilesNum(cushionMiles)} mi cushion`;
  } else {
    status = 'short';
    shortfallMiles = goalMiles - ceilingMiles;
    tone = shortfallMiles > 400 ? 'bad' : 'warn';
    verdictHeadline = `Ceiling ${fmtMilesNum(ceilingMiles)} mi — short ${fmtMilesNum(shortfallMiles)} mi of your goal. That's with your current tank (no 34) — a 34 before cutoff, or pushing into next pay week, could change this.`;

    // Honest lever: re-simulate with overhead - 30m (only when overhead >= 30m and delta > 0)
    if (overheadMinutes >= MILES_TRIM_STEP_MIN) {
      const trimmedOverhead = overheadMinutes - MILES_TRIM_STEP_MIN;
      const trimDay0 = inspectDay0Shift(ev, input.now, trimmedOverhead, config.shortHaul);
      const trimSim = runDayByDaySimulation(
        pastOnDuty,
        simFrames,
        input.now,
        cutoffMinute,
        limit,
        windowDays,
        trimmedOverhead,
        mph,
        config.shortHaul,
        trimDay0,
      );
      const delta = Math.max(0, trimSim.maxLegalMiles - maxLegalMiles);
      if (delta > 0) {
        trimAddsMiles = delta;
        trimLeverLine = `Trimming 30m/day of overhead adds ~${fmtMilesNum(delta)} mi.`;
      }
    }
  }

  const tankSummaryLine = `${cycleThroughCutoffHMM} left in your ${cycleLimitHours}-hr cycle + recaps through ${cutoffShort} → ~${fmtMilesNum(maxLegalMiles)} max legal miles without a 34 at ${mph} mph.`;

  return {
    homeTimeZone,
    homeZoneName,
    cycle: config.cycle,
    cycleLimitHours,
    cycleLimitMinutes: limit,
    windowDays,
    dayStartHM: formatDayStartHM(config),
    dayStartLabel: dayStartWord(config),
    now: input.now,
    cutoffDow,
    cutoffHour,
    cutoffMinuteOfHour,
    cutoffHM,
    cutoffMinute,
    cutoffShort,
    remainingNowMinutes,
    overCycleNowMinutes,
    recapsBeforeCutoffMinutes,
    netRecapsBeforeCutoffMinutes,
    cycleThroughCutoffMinutes,
    cycleThroughCutoffHMM,
    boundaryDropAtCutoffMinutes,
    boundaryDropNote,
    milesAlreadyRun,
    goalMiles,
    mph,
    overheadMinutes,
    days: baseSim.days,
    dayCount: baseSim.days.length,
    activeDayCount,
    totalDriveMinutes: baseSim.totalDriveMinutes,
    totalOverheadMinutes: baseSim.totalOverheadMinutes,
    maxLegalMiles,
    ceilingMiles,
    status,
    tone,
    cushionMiles,
    shortfallMiles,
    verdictHeadline,
    tankSummaryLine,
    dailyCapBound: baseSim.dailyCapBound,
    dailyCapKind: baseSim.dailyCapKind,
    dailyCapNote,
    trimAddsMiles,
    trimLeverLine,
    standingLine: MILES_STANDING_LINE,
  };
}
