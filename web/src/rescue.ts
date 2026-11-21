/**
 * Split-Sleeper Rescue Simulator ("10 vs. 8/2 vs. 7/3 vs. Roll now").
 *
 * Built strictly on the existing HOS engine (`engine/src/index.ts`) and store
 * helpers (`web/src/store.ts`) without modifying `store.ts` or `engine/`.
 *
 * Given the driver's logged segments at `now`, a planned dock wait / delay duration,
 * remaining drive needed (miles + mph OR direct drive hours), and an optional target
 * delivery deadline, builds a concrete synthetic segment timeline for each strategy
 * and evaluates legality, 30-minute break interaction, split qualification, and
 * follow-on ("Next-Shift Trap") 11h/14h clocks directly through `engine/src/index.ts`:
 *   1. Straight 10 — full 10-hour rest, no split
 *   2. 8/2 split  — 8h Sleeper Berth + 2h OFF/SB (evaluates both orders & pending legs; displays best order)
 *   3. 7/3 split  — 7h Sleeper Berth + 3h OFF/SB (evaluates both orders & pending legs; displays best order)
 *   4. Roll now / no qualifying break — do-nothing baseline (shown when it differs from the above)
 *
 * 100% offline. Reuses `evaluate`, `restPeriods`, `normalize`, `cycleViolations`,
 * `pairQualifies`, `localToMinute`, and `LIMITS` directly from `engine/src/index.ts`.
 */
import type { DutyStatus, RestPeriod, RulesConfig, Segment, Violation } from '../../engine/src/index.ts';
import {
  LIMITS,
  cycleViolations,
  evaluate,
  localToMinute,
  normalize,
  pairQualifies,
  restPeriods,
} from '../../engine/src/index.ts';
import { cycleParamsOf, dur, isValidTimeZone, zoneShort } from './store.ts';

export type RescueDistanceMode = 'miles' | 'hours';
export type RescueStrategyId = 'straight10' | 'split82' | 'split73' | 'roll_now';
export type SplitOrder =
  | 'short-first'
  | 'long-first'
  | 'completes-pending-long'
  | 'completes-pending-short'
  | 'none';

/** Mandatory FMCSA compliance callout rendered on every split strategy card. */
export const SPLIT_SB_CALLOUT = 'Long leg = Sleeper Berth ONLY; verify on your ELD.';

/** Plain-language failure verdict when no strategy rescues the run. */
export const NO_RESCUE_HEADLINE = "No rescue — the split doesn't save this one";

export const RESCUE_MIN_MPH = 45;
export const RESCUE_MAX_MPH = 65;
export const RESCUE_DEFAULT_MPH = 55;
export const RESCUE_DEFAULT_MILES = 330;
export const RESCUE_DEFAULT_WAIT_MIN = 165; // 2h 45m
export const RESCUE_DEFAULT_DRIVE_DIRECT = 360; // 6h

export const RESCUE_WAIT_PRESETS = [
  { label: '0m', minutes: 0 },
  { label: '1h 30m', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '2h 45m', minutes: 165 },
  { label: '3h', minutes: 180 },
  { label: '4h', minutes: 240 },
  { label: '7h', minutes: 420 },
] as const;

export const RESCUE_MILES_PRESETS = [150, 250, 330, 450] as const;
export const RESCUE_MPH_PRESETS = [45, 50, 55, 60, 65] as const;
export const RESCUE_HOURS_PRESETS = [
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '6h', minutes: 360 },
  { label: '8h', minutes: 480 },
  { label: '10h', minutes: 600 },
] as const;

export interface RescueInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current epoch minute. */
  now: number;
  /** Carrier rules config (cycle, dayStartHour, timeZone, shortHaul, exceptions). */
  config: RulesConfig;
  /** Planned dock wait / delay starting at `now`, in minutes (>= 0). */
  dockWaitMinutes: number;
  /** Remaining drive entry mode: miles + mph OR direct drive hours/minutes. */
  distanceMode: RescueDistanceMode;
  /** Remaining miles (used when `distanceMode === 'miles'`). */
  miles: number;
  /** Realistic average speed in mph, clamped 45–65 (used when `distanceMode === 'miles'`). */
  mph: number;
  /** Direct remaining drive minutes (used when `distanceMode === 'hours'`). */
  driveMinutesDirect: number;
  /** Optional target delivery/arrival deadline (epoch minute). Null = compare earliest legal finish. */
  deadlineMinute: number | null;
}

export interface RescueStep {
  label: string;
  status: DutyStatus;
  start: number;
  end: number;
  minutes: number;
  startShort: string;
  endShort: string;
  isLongSB?: boolean;
}

export interface LongSbRequirement {
  start: number;
  end: number;
  startShort: string;
  endShort: string;
  minutes: number;
  /** True when the >=7h SB leg was already logged earlier in the shift. */
  alreadyLogged: boolean;
  /** Unmistakable compliance callout: "Long leg = Sleeper Berth ONLY; verify on your ELD." */
  callout: string;
}

export interface NextShiftPreview {
  /** Epoch minute at which follow-on shift clocks are read (end of 2nd split leg, delivery finish, or end of 10h rest). */
  at: number;
  atShort: string;
  /** Human-readable point-in-time label (e.g. "after split completes", "after delivery", "after 10-hour rest"). */
  atLabel: string;
  /** Exact remaining 11h drive and 14h window from `evaluate(combined, { asOf: at, config })`. */
  driveRemaining: number;
  windowRemaining: number;
  breakRemaining: number;
  cycleRemaining: number;
  driveUsed: number;
  windowUsed: number;
  driveLimit: number;
  windowLimit: number;
  trapTone: 'good' | 'warn' | 'bad';
  trapSummary: string;
}

export interface RescueStrategyResult {
  id: RescueStrategyId;
  title: string;
  shortTitle: string;
  isSplit: boolean;
  order: SplitOrder;
  orderLabel: string;
  /** True iff engine evaluation yields 0 post-`now` violations (and pair qualified for splits). */
  hosLegal: boolean;
  /** For split strategies: true iff engine `pairQualifies` confirmed a qualifying >=7h SB + >=2h (>=10h) pair. */
  pairQualified: boolean;
  /** True iff `deadlineMinute === null || finishAt <= deadlineMinute`. */
  meetsDeadline: boolean;
  /** Overall: `hosLegal && meetsDeadline`. */
  makesIt: boolean;
  /** Marked on the #1 winning card when `!noRescue`. */
  recommended: boolean;
  tone: 'good' | 'warn' | 'bad';
  badge: string;
  verdictLine: string;
  /** Earliest legal drive-again time (wheels roll for the remaining drive). */
  releaseAt: number;
  releaseShort: string;
  releaseText: string;
  /** Projected finish time of the remaining drive. */
  finishAt: number;
  finishShort: string;
  finishText: string;
  /** Epoch minute when the full split pair completes (null for non-splits). */
  splitCompleteAt: number | null;
  splitCompleteShort: string | null;
  /** Minutes saved vs. Straight 10 finish (`straight10.finishAt - finishAt`). Positive = faster. */
  savedVsStraight10: number;
  /** Minutes before deadline (`deadlineMinute - finishAt`), null if no deadline. Negative = late. */
  deadlineSlack: number | null;
  /** Total 30-min break minutes inserted by the engine's 8h driving break rule. */
  insertedBreakMinutes: number;
  /** Required >=7h Sleeper Berth block (always populated for split strategies, null for non-splits). */
  longSbBlock: LongSbRequirement | null;
  /** Follow-on shift clocks from `evaluate()` after the split (or after the 10h rest / finish). */
  nextShift: NextShiftPreview | null;
  /** Post-`now` violations reported by `engine/src/index.ts`. */
  violations: Violation[];
  /** Ordered timeline steps for display. */
  steps: RescueStep[];
  /** Exact tentative segments fed to `evaluate()`. */
  simSegments: Segment[];
}

export interface RescueSimulation {
  validInput: boolean;
  noRescue: boolean;
  tone: 'good' | 'warn' | 'bad';
  verdictSign: 'go' | 'warn' | 'stop';
  verdictLabel: string;
  headline: string;
  subline: string;
  homeTimeZone: string;
  homeZoneName: string;
  now: number;
  nowShort: string;
  dockWaitMinutes: number;
  driveMinutes: number;
  effectiveMph: number;
  deadlineMinute: number | null;
  deadlineText: string | null;
  deadlineShort: string | null;
  driveRemainingNow: number;
  windowRemainingNow: number;
  breakRemainingNow: number;
  cycleRemainingNow: number;
  cycleLimit: number;
  cycleWindowDays: number;
  isFreshNow: boolean;
  pendingSplitLeg: RestPeriod | null;
  /** Strategies ordered best-first (earliest legal finish first). */
  strategies: RescueStrategyResult[];
  /** Direct reference to the Straight 10 strategy (always present when validInput). */
  straight10: RescueStrategyResult | null;
  /** The recommended strategy, or null when `noRescue` is true. */
  recommended: RescueStrategyResult | null;
}

export interface SplitPairingCheck {
  pairQualified: boolean;
  hosLegal: boolean;
  releaseAt: number;
  finishAt: number;
  splitCompleteAt: number;
  insertedBreakMinutes: number;
  violations: Violation[];
  nextShift: NextShiftPreview | null;
  longSbBlock: LongSbRequirement;
  steps: RescueStep[];
  simSegments: Segment[];
  usedChain: RestPeriod[];
}

/* ---------- timezone formatting (DST-safe via engine's localToMinute) ---------- */

const dtfPartsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfPartsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    dtfPartsCache.set(tz, f);
  }
  return f;
}

function getZoneParts(minute: number, tz: string) {
  const parts = partsFormatter(tz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    weekday: get('weekday'),
    month: get('month'),
    day: get('day'),
    year: get('year'),
    hour,
    minute: get('minute'),
  };
}

export function fmtRescueShort(minute: number, tz: string): string {
  const p = getZoneParts(minute, tz);
  return `${p.weekday} ${p.hour}:${p.minute}`;
}

export function fmtRescueFull(minute: number, tz: string): string {
  const p = getZoneParts(minute, tz);
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${zoneShort(tz)}`;
}

/** Resolve a wall-clock YYYY-MM-DD + HH:MM in `timeZone` via engine's DST-safe `localToMinute`. */
export function resolveRescueDeadline(dateStr: string, timeStr: string, timeZone: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]), mo = Number(dm[2]), d = Number(dm[3]);
  const h = Number(tm[1]), min = Number(tm[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return localToMinute(y, mo, d, h, tz) + min;
}

/** Clamp speed 45–65 mph and compute conservative drive minutes (same ceiling formula as rollout.ts / engine trip.ts). */
export function computeRescueDriveMinutes(
  distanceMode: RescueDistanceMode,
  miles: number,
  mph: number,
  driveMinutesDirect: number,
): { driveMinutes: number; effectiveMph: number } {
  const effectiveMph = Number.isFinite(mph)
    ? Math.max(RESCUE_MIN_MPH, Math.min(RESCUE_MAX_MPH, Math.round(mph)))
    : RESCUE_DEFAULT_MPH;
  if (distanceMode === 'hours') {
    const d = Number.isFinite(driveMinutesDirect) ? Math.max(0, Math.round(driveMinutesDirect)) : 0;
    return { driveMinutes: Math.min(d, LIMITS.DRIVE * 3), effectiveMph };
  }
  const m = Number.isFinite(miles) ? Math.max(0, miles) : 0;
  if (m <= 0) return { driveMinutes: 0, effectiveMph };
  const mins = Math.ceil((m * 60) / effectiveMph - 1e-9);
  return { driveMinutes: Math.min(mins, LIMITS.DRIVE * 3), effectiveMph };
}

/* ---------- internal engine-driven timeline builder ---------- */

/**
 * Append `driveMinutes` of driving starting at `startAt`, letting `engine/src/index.ts`
 * decide whether and when a mandatory 30-minute break is needed via `evaluate().shift.breakRemaining`.
 * Returns the generated tentative segments, the exact minute wheels first roll (`firstDriveAt`),
 * the finish minute (`endAt`), total inserted 30-min break minutes, and UI steps.
 */
function appendEngineDrive(
  logged: Segment[],
  prefixSim: Segment[],
  startAt: number,
  driveMinutes: number,
  config: RulesConfig,
  tz: string,
): {
  segs: Segment[];
  steps: RescueStep[];
  firstDriveAt: number;
  endAt: number;
  insertedBreakMinutes: number;
} {
  const segs: Segment[] = [];
  const steps: RescueStep[] = [];
  let t = startAt;
  let rem = driveMinutes;
  let firstDriveAt: number | null = null;
  let insertedBreakMinutes = 0;
  let guard = 0;
  const maxIter = 2 * Math.ceil(driveMinutes / LIMITS.BREAK_AFTER) + 4;

  while (rem > 0 && guard++ < maxIter) {
    const evT = evaluate([...logged, ...prefixSim, ...segs], { asOf: t, config });
    const brkRem = evT.shift.breakRemaining;
    if (!config.shortHaul && brkRem <= 0) {
      segs.push({ status: 'OFF', start: t, end: t + LIMITS.BREAK_LEN, tentative: true, note: '30-min break' });
      steps.push({
        label: '30-min break (required)',
        status: 'OFF',
        start: t,
        end: t + LIMITS.BREAK_LEN,
        minutes: LIMITS.BREAK_LEN,
        startShort: fmtRescueShort(t, tz),
        endShort: fmtRescueShort(t + LIMITS.BREAK_LEN, tz),
      });
      t += LIMITS.BREAK_LEN;
      insertedBreakMinutes += LIMITS.BREAK_LEN;
      continue;
    }
    const chunk = config.shortHaul || !Number.isFinite(brkRem) ? rem : Math.min(rem, brkRem);
    if (firstDriveAt === null) firstDriveAt = t;
    segs.push({ status: 'D', start: t, end: t + chunk, tentative: true, note: 'Remaining drive' });
    steps.push({
      label: rem === driveMinutes && chunk === rem ? 'Drive remaining' : 'Drive leg',
      status: 'D',
      start: t,
      end: t + chunk,
      minutes: chunk,
      startShort: fmtRescueShort(t, tz),
      endShort: fmtRescueShort(t + chunk, tz),
    });
    t += chunk;
    rem -= chunk;
  }

  return {
    segs,
    steps,
    firstDriveAt: firstDriveAt ?? startAt,
    endAt: t,
    insertedBreakMinutes,
  };
}

/**
 * Evaluate `combined = [...logged, ...simSegments]` at `evalAt` and collect all post-`now` violations.
 * Also guards against an unrequested 34h cycle restart when the simulated wait itself was < 34h.
 */
function postNowViolations(
  logged: Segment[],
  simSegments: Segment[],
  now: number,
  evalAt: number,
  config: RulesConfig,
  allowNewRestart34: boolean,
): { ev: ReturnType<typeof evaluate>; violations: Violation[] } {
  const combined = [...logged, ...simSegments];
  const ev = evaluate(combined, { asOf: evalAt, config });
  const rawViols = ev.violations.filter((v) => v.tentative || v.start >= now);
  if (allowNewRestart34) return { ev, violations: rawViols };

  // Mirror rollout.ts: verify cycle legality without any newly created 34h restart ending after `now`.
  const norm = normalize(combined);
  const rests = restPeriods(norm);
  const restsNoNew34 = rests.map((r) => (r.isRestart && r.end > now ? { ...r, isRestart: false } : r));
  const extraCycle = cycleViolations(norm, restsNoNew34, config).filter((v) => v.tentative || v.start >= now);
  const merged = [...rawViols];
  for (const cv of extraCycle) {
    if (!merged.some((v) => v.kind === cv.kind && v.start === cv.start && v.end === cv.end)) {
      merged.push(cv);
    }
  }
  merged.sort((a, b) => a.start - b.start);
  return { ev, violations: merged };
}

/** Build a NextShiftPreview straight from `evaluate()` at `at`. */
function buildNextShiftPreview(
  evAt: ReturnType<typeof evaluate>,
  at: number,
  tz: string,
  isSplit: boolean,
  atLabel = isSplit ? 'after split completes' : 'after 10-hour rest',
): NextShiftPreview {
  const driveRemaining = evAt.shift.driveRemaining;
  const windowRemaining = evAt.shift.windowRemaining;
  const driveLimit = evAt.shift.limits.drive;
  const windowLimit = evAt.shift.limits.window;
  const driveLost = Math.max(0, driveLimit - driveRemaining);
  const windowLost = Math.max(0, windowLimit - windowRemaining);

  let trapTone: 'good' | 'warn' | 'bad' = 'good';
  let trapSummary: string;
  if (!isSplit) {
    trapTone = 'good';
    trapSummary = `Fresh ${dur(driveLimit)} drive / ${dur(windowLimit)} window after the 10-hour rest — no next-shift split trap.`;
  } else if (driveRemaining < 6 * 60 || windowRemaining < 8 * 60) {
    trapTone = 'bad';
    trapSummary = `Heavy next-shift trap — only ${dur(driveRemaining)} drive and ${dur(windowRemaining)} window left ${atLabel} (vs. ${dur(driveLimit)} / ${dur(windowLimit)} after a straight 10). You will likely need another split or a full 10.`;
  } else if (driveLost > 0 || windowLost > 0) {
    trapTone = 'warn';
    trapSummary = `Shrunken follow-on shift — ${dur(driveRemaining)} drive and ${dur(windowRemaining)} window left ${atLabel} (short ${dur(driveLost)} drive / ${dur(windowLost)} window vs. a fresh 10).`;
  } else {
    trapTone = 'good';
    trapSummary = `Clean follow-on shift — full ${dur(driveRemaining)} drive and ${dur(windowRemaining)} window left ${atLabel}.`;
  }

  return {
    at,
    atShort: fmtRescueShort(at, tz),
    atLabel,
    driveRemaining,
    windowRemaining,
    breakRemaining: evAt.shift.breakRemaining,
    cycleRemaining: evAt.cycle.remaining,
    driveUsed: evAt.shift.driveUsed,
    windowUsed: evAt.shift.windowUsed,
    driveLimit,
    windowLimit,
    trapTone,
    trapSummary,
  };
}

function summarizeViolations(violations: Violation[]): string {
  if (violations.length === 0) return '';
  const labels: Record<Violation['kind'], string> = {
    DRIVE_11: '11h drive limit',
    WINDOW_14: '14h window',
    BREAK_30: '30-min break',
    CYCLE: 'cycle limit',
  };
  const parts = violations.map((v) => `${labels[v.kind]} by ${dur(v.minutes)}`);
  return `Violates ${parts.join(' & ')}`;
}

/** Trailing contiguous SB minutes ending right at `now` in normalized logged segments. */
function trailingSbAtNow(segments: Segment[], now: number): number {
  const norm = normalize(segments);
  const last = norm[norm.length - 1];
  if (!last || last.status !== 'SB' || last.end !== now) return 0;
  return last.end - last.start;
}

/**
 * Evaluate a specific `(longSbMinutes, shortLegMinutes)` split pairing in either
 * `'short-first'` or `'long-first'` order by constructing the exact synthetic segment
 * timeline and verifying it through `engine/src/index.ts`.
 *
 * Exported so unit/DOM pins (including R7: 2h + 7h = 9h failure) can test arbitrary
 * pairings against the exact same engine-backed path used by `simulateRescue`.
 */
export function evaluateSplitPairing(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  dockWaitMinutes: number,
  driveMinutes: number,
  longSbMinutes: number,
  shortLegMinutes: number,
  order: 'short-first' | 'long-first',
): SplitPairingCheck {
  const tz = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const evNow = evaluate(logged, { asOf: now, config });
  const loggedRests = restPeriods(evNow.segments);
  const activeRestNow = loggedRests.find((r) => r.start <= now && r.end === now) ?? null;
  const trailingSB = trailingSbAtNow(evNow.segments, now);

  const prefixSim: Segment[] = [];
  const steps: RescueStep[] = [];
  let leg1Start: number;
  let leg1End: number;
  let longSbBlock: LongSbRequirement;

  if (order === 'short-first') {
    const restOrigin = activeRestNow ? activeRestNow.start : now;
    leg1Start = restOrigin;
    leg1End = Math.max(now + dockWaitMinutes, restOrigin + shortLegMinutes);
    if (leg1End > now) {
      prefixSim.push({
        status: 'OFF',
        start: now,
        end: leg1End,
        tentative: true,
        note: `Split short leg (${dur(leg1End - restOrigin)})`,
      });
      const extra = leg1End - (now + dockWaitMinutes);
      steps.push({
        label: extra > 0
          ? `Dock wait + ${dur(extra)} extra OFF/SB (short leg)`
          : dockWaitMinutes > 0
            ? 'Dock wait as OFF/SB (short leg)'
            : 'Short leg OFF/SB',
        status: 'OFF',
        start: now,
        end: leg1End,
        minutes: leg1End - now,
        startShort: fmtRescueShort(now, tz),
        endShort: fmtRescueShort(leg1End, tz),
      });
    }
    const drv = appendEngineDrive(logged, prefixSim, leg1End, driveMinutes, config, tz);
    const finishAt = drv.endAt;
    const sbStart = finishAt;
    const sbEnd = finishAt + longSbMinutes;
    const sbSeg: Segment = {
      status: 'SB',
      start: sbStart,
      end: sbEnd,
      tentative: true,
      note: 'Split long leg (Sleeper Berth ONLY)',
    };
    const simSegments = [...prefixSim, ...drv.segs, sbSeg];
    steps.push(...drv.steps, {
      label: `Sleeper Berth long leg (${dur(longSbMinutes)} SB)`,
      status: 'SB',
      start: sbStart,
      end: sbEnd,
      minutes: longSbMinutes,
      startShort: fmtRescueShort(sbStart, tz),
      endShort: fmtRescueShort(sbEnd, tz),
      isLongSB: true,
    });

    longSbBlock = {
      start: sbStart,
      end: sbEnd,
      startShort: fmtRescueShort(sbStart, tz),
      endShort: fmtRescueShort(sbEnd, tz),
      minutes: longSbMinutes,
      alreadyLogged: false,
      callout: SPLIT_SB_CALLOUT,
    };

    const { ev, violations } = postNowViolations(logged, simSegments, now, sbEnd, config, dockWaitMinutes >= LIMITS.RESTART);
    const allRests = restPeriods(ev.segments);
    const r1 = allRests.find((r) => r.start <= leg1Start && r.end >= leg1End)
      ?? allRests.find((r) => r.end === leg1End);
    const r2 = allRests.find((r) => r.start <= sbStart && r.end >= sbEnd);
    const pairQualified = Boolean(r1 && r2 && r1 !== r2 && pairQualifies(r1, r2) && !r1.isReset);
    const hosLegal = pairQualified && violations.length === 0;
    const nextShift = pairQualified ? buildNextShiftPreview(ev, sbEnd, tz, true) : null;

    return {
      pairQualified,
      hosLegal,
      releaseAt: drv.firstDriveAt,
      finishAt,
      splitCompleteAt: sbEnd,
      insertedBreakMinutes: drv.insertedBreakMinutes,
      violations,
      nextShift,
      longSbBlock,
      steps,
      simSegments,
      usedChain: ev.shift.chain,
    };
  }

  // order === 'long-first'
  const sbOrigin = trailingSB > 0 ? now - trailingSB : now;
  leg1Start = activeRestNow ? activeRestNow.start : now;
  leg1End = Math.max(now + dockWaitMinutes, sbOrigin + longSbMinutes);
  if (leg1End > now) {
    prefixSim.push({
      status: 'SB',
      start: now,
      end: leg1End,
      tentative: true,
      note: 'Split long leg (Sleeper Berth ONLY)',
    });
    steps.push({
      label: dockWaitMinutes >= longSbMinutes
        ? `Dock wait in Sleeper Berth (${dur(leg1End - sbOrigin)} SB)`
        : `Sleeper Berth long leg (${dur(leg1End - sbOrigin)} SB)`,
      status: 'SB',
      start: now,
      end: leg1End,
      minutes: leg1End - now,
      startShort: fmtRescueShort(now, tz),
      endShort: fmtRescueShort(leg1End, tz),
      isLongSB: true,
    });
  }
  const drv = appendEngineDrive(logged, prefixSim, leg1End, driveMinutes, config, tz);
  const finishAt = drv.endAt;
  const shortStart = finishAt;
  const shortEnd = finishAt + shortLegMinutes;
  const shortSeg: Segment = {
    status: 'OFF',
    start: shortStart,
    end: shortEnd,
    tentative: true,
    note: `Split short leg (${dur(shortLegMinutes)} OFF/SB)`,
  };
  const simSegments = [...prefixSim, ...drv.segs, shortSeg];
  steps.push(...drv.steps, {
    label: `Short leg OFF/SB (${dur(shortLegMinutes)})`,
    status: 'OFF',
    start: shortStart,
    end: shortEnd,
    minutes: shortLegMinutes,
    startShort: fmtRescueShort(shortStart, tz),
    endShort: fmtRescueShort(shortEnd, tz),
  });

  longSbBlock = {
    start: sbOrigin,
    end: leg1End,
    startShort: fmtRescueShort(sbOrigin, tz),
    endShort: fmtRescueShort(leg1End, tz),
    minutes: leg1End - sbOrigin,
    alreadyLogged: false,
    callout: SPLIT_SB_CALLOUT,
  };

  const { ev, violations } = postNowViolations(logged, simSegments, now, shortEnd, config, dockWaitMinutes >= LIMITS.RESTART);
  const allRests = restPeriods(ev.segments);
  const r1 = allRests.find((r) => r.start <= sbOrigin && r.end >= leg1End);
  const r2 = allRests.find((r) => r.start <= shortStart && r.end >= shortEnd);
  const pairQualified = Boolean(r1 && r2 && r1 !== r2 && pairQualifies(r1, r2));
  const hosLegal = pairQualified && violations.length === 0;
  const nextShift = pairQualified ? buildNextShiftPreview(ev, shortEnd, tz, true) : null;

  return {
    pairQualified,
    hosLegal,
    releaseAt: drv.firstDriveAt,
    finishAt,
    splitCompleteAt: shortEnd,
    insertedBreakMinutes: drv.insertedBreakMinutes,
    violations,
    nextShift,
    longSbBlock,
    steps,
    simSegments,
    usedChain: ev.shift.chain,
  };
}

/**
 * Evaluate completing an ALREADY-LOGGED pending split leg before driving `driveMinutes`.
 * - If pending leg is a short leg (>=2h), take `longSbMinutes` SB now to complete the pair -> drive.
 * - If pending leg is a long SB leg (>=7h SB, including FAQ 22 opening reset), take `shortLegMinutes` OFF now -> drive.
 */
function evaluateCompletingPendingLeg(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  dockWaitMinutes: number,
  driveMinutes: number,
  longSbMinutes: number,
  shortLegMinutes: number,
  pending: RestPeriod,
  mode: 'completes-pending-short' | 'completes-pending-long',
): (SplitPairingCheck & { order: SplitOrder }) | null {
  const tz = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const evNow = evaluate(logged, { asOf: now, config });
  const loggedRests = restPeriods(evNow.segments);
  const activeRestNow = loggedRests.find((r) => r.start <= now && r.end === now) ?? null;
  const trailingSB = trailingSbAtNow(evNow.segments, now);

  if (mode === 'completes-pending-short') {
    if (!pending.qualifiesShort || pending.isReset) return null;
    // Must not double-use the currently running active rest as both pending and second leg.
    if (activeRestNow && activeRestNow.start === pending.start && activeRestNow.end === pending.end) return null;
    const sbOrigin = trailingSB > 0 ? now - trailingSB : now;
    const legEnd = Math.max(now + dockWaitMinutes, sbOrigin + longSbMinutes);
    const sbDur = legEnd - sbOrigin;
    if (pending.duration + sbDur < LIMITS.SPLIT_TOTAL || sbDur < LIMITS.SPLIT_MIN_SB) return null;

    const prefixSim: Segment[] = legEnd > now
      ? [{ status: 'SB', start: now, end: legEnd, tentative: true, note: 'Split long leg (Sleeper Berth ONLY)' }]
      : [];
    const steps: RescueStep[] = legEnd > now
      ? [{
          label: `Sleeper Berth long leg (completes earlier ${dur(pending.duration)} leg)`,
          status: 'SB',
          start: now,
          end: legEnd,
          minutes: legEnd - now,
          startShort: fmtRescueShort(now, tz),
          endShort: fmtRescueShort(legEnd, tz),
          isLongSB: true,
        }]
      : [];
    const drv = appendEngineDrive(logged, prefixSim, legEnd, driveMinutes, config, tz);
    const simSegments = [...prefixSim, ...drv.segs];
    steps.push(...drv.steps);

    const { ev: evFinish, violations } = postNowViolations(logged, simSegments, now, drv.endAt, config, dockWaitMinutes >= LIMITS.RESTART);
    const allRests = restPeriods(evFinish.segments);
    const rNew = allRests.find((r) => r.start <= sbOrigin && r.end >= legEnd);
    const pairQualified = Boolean(rNew && pairQualifies(pending, rNew));
    const hosLegal = pairQualified && violations.length === 0;
    const nextShift = pairQualified ? buildNextShiftPreview(evFinish, drv.endAt, tz, true, 'after delivery') : null;

    return {
      order: 'completes-pending-short',
      pairQualified,
      hosLegal,
      releaseAt: drv.firstDriveAt,
      finishAt: drv.endAt,
      splitCompleteAt: legEnd,
      insertedBreakMinutes: drv.insertedBreakMinutes,
      violations,
      nextShift,
      longSbBlock: {
        start: sbOrigin,
        end: legEnd,
        startShort: fmtRescueShort(sbOrigin, tz),
        endShort: fmtRescueShort(legEnd, tz),
        minutes: sbDur,
        alreadyLogged: false,
        callout: SPLIT_SB_CALLOUT,
      },
      steps,
      simSegments,
      usedChain: evFinish.shift.chain,
    };
  }

  // mode === 'completes-pending-long'
  if (!pending.qualifiesLongSB) return null;
  if (activeRestNow && activeRestNow.start === pending.start && activeRestNow.end === pending.end) return null;
  const restOrigin = activeRestNow ? activeRestNow.start : now;
  const legEnd = Math.max(now + dockWaitMinutes, restOrigin + shortLegMinutes);
  const shortDur = legEnd - restOrigin;
  // Respect strategy pairing: e.g. 8/2 requires prior SB >= 8h (or total >= 10h with 2h short leg).
  if (pending.duration + shortDur < LIMITS.SPLIT_TOTAL || shortDur < LIMITS.SPLIT_MIN_SHORT) return null;

  const prefixSim: Segment[] = legEnd > now
    ? [{ status: 'OFF', start: now, end: legEnd, tentative: true, note: `Split short leg (completes earlier ${dur(pending.longestSB)} SB)` }]
    : [];
  const steps: RescueStep[] = legEnd > now
    ? [{
        label: `Dock wait OFF/SB (completes earlier ${dur(pending.longestSB)} SB)`,
        status: 'OFF',
        start: now,
        end: legEnd,
        minutes: legEnd - now,
        startShort: fmtRescueShort(now, tz),
        endShort: fmtRescueShort(legEnd, tz),
      }]
    : [];
  const drv = appendEngineDrive(logged, prefixSim, legEnd, driveMinutes, config, tz);
  const simSegments = [...prefixSim, ...drv.segs];
  steps.push(...drv.steps);

  const { ev: evFinish, violations } = postNowViolations(logged, simSegments, now, drv.endAt, config, dockWaitMinutes >= LIMITS.RESTART);
  const allRests = restPeriods(evFinish.segments);
  const rNew = allRests.find((r) => r.start <= restOrigin && r.end >= legEnd);
  const pairQualified = Boolean(rNew && pairQualifies(pending, rNew));
  const hosLegal = pairQualified && violations.length === 0;
  const nextShift = pairQualified ? buildNextShiftPreview(evFinish, drv.endAt, tz, true, 'after delivery') : null;

  return {
    order: 'completes-pending-long',
    pairQualified,
    hosLegal,
    releaseAt: drv.firstDriveAt,
    finishAt: drv.endAt,
    splitCompleteAt: legEnd,
    insertedBreakMinutes: drv.insertedBreakMinutes,
    violations,
    nextShift,
    longSbBlock: {
      start: pending.start,
      end: pending.end,
      startShort: fmtRescueShort(pending.start, tz),
      endShort: fmtRescueShort(pending.end, tz),
      minutes: pending.longestSB,
      alreadyLogged: true,
      callout: SPLIT_SB_CALLOUT,
    },
    steps,
    simSegments,
    usedChain: evFinish.shift.chain,
  };
}

/* ---------- strategy builders ---------- */

function buildStraight10(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  dockWaitMinutes: number,
  driveMinutes: number,
  activeRestNow: RestPeriod | null,
  isFreshNow: boolean,
  tz: string,
): RescueStrategyResult {
  const restOrigin = activeRestNow ? activeRestNow.start : now;
  const releaseTarget = isFreshNow
    ? now + dockWaitMinutes
    : Math.max(now + dockWaitMinutes, restOrigin + LIMITS.RESET);

  const prefixSim: Segment[] = releaseTarget > now
    ? [{ status: 'OFF', start: now, end: releaseTarget, tentative: true, note: '10-hour rest' }]
    : [];
  const steps: RescueStep[] = releaseTarget > now
    ? [{
        label: isFreshNow
          ? `Off duty during wait (${dur(releaseTarget - now)})`
          : activeRestNow
            ? `Finish 10-hour rest (${dur(releaseTarget - now)} more)`
            : `Full 10-hour rest (${dur(releaseTarget - now)})`,
        status: 'OFF',
        start: now,
        end: releaseTarget,
        minutes: releaseTarget - now,
        startShort: fmtRescueShort(now, tz),
        endShort: fmtRescueShort(releaseTarget, tz),
      }]
    : [];

  const drv = appendEngineDrive(logged, prefixSim, releaseTarget, driveMinutes, config, tz);
  const simSegments = [...prefixSim, ...drv.segs];
  steps.push(...drv.steps);

  const { violations } = postNowViolations(logged, simSegments, now, drv.endAt, config, dockWaitMinutes >= LIMITS.RESTART);
  const evFresh = evaluate([...logged, ...prefixSim], { asOf: releaseTarget, config });
  const nextShift = buildNextShiftPreview(evFresh, releaseTarget, tz, false);
  const hosLegal = violations.length === 0;

  return {
    id: 'straight10',
    title: 'Straight 10',
    shortTitle: 'Straight 10',
    isSplit: false,
    order: 'none',
    orderLabel: 'Full 10h reset',
    hosLegal,
    pairQualified: true,
    meetsDeadline: true,
    makesIt: hosLegal,
    recommended: false,
    tone: hosLegal ? 'good' : 'bad',
    badge: hosLegal ? 'Full reset' : 'Illegal',
    verdictLine: hosLegal
      ? `Clean 10-hour reset — roll at ${fmtRescueShort(drv.firstDriveAt, tz)}, finish by ${fmtRescueShort(drv.endAt, tz)}.`
      : `${summarizeViolations(violations)} even after a 10-hour rest.`,
    releaseAt: drv.firstDriveAt,
    releaseShort: fmtRescueShort(drv.firstDriveAt, tz),
    releaseText: fmtRescueFull(drv.firstDriveAt, tz),
    finishAt: drv.endAt,
    finishShort: fmtRescueShort(drv.endAt, tz),
    finishText: fmtRescueFull(drv.endAt, tz),
    splitCompleteAt: null,
    splitCompleteShort: null,
    savedVsStraight10: 0,
    deadlineSlack: null,
    insertedBreakMinutes: drv.insertedBreakMinutes,
    longSbBlock: null,
    nextShift,
    violations,
    steps,
    simSegments,
  };
}

function buildRollNow(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  dockWaitMinutes: number,
  driveMinutes: number,
  tz: string,
): RescueStrategyResult {
  // Without a qualifying split break, a dock delay does NOT pause the 14-hour window.
  // Modeling the wait as ON (On Duty Not Driving) matches 49 CFR §395.2 detention rules
  // and prevents an opening 10h SB reset (FAQ 22) from silently turning "no break" into a split.
  const waitEnd = now + dockWaitMinutes;
  const prefixSim: Segment[] = dockWaitMinutes > 0
    ? [{ status: 'ON', start: now, end: waitEnd, tentative: true, note: 'Dock wait (no qualifying break)' }]
    : [];
  const steps: RescueStep[] = dockWaitMinutes > 0
    ? [{
        label: `Dock wait — no qualifying break (${dur(dockWaitMinutes)})`,
        status: 'ON',
        start: now,
        end: waitEnd,
        minutes: dockWaitMinutes,
        startShort: fmtRescueShort(now, tz),
        endShort: fmtRescueShort(waitEnd, tz),
      }]
    : [];

  const drv = appendEngineDrive(logged, prefixSim, waitEnd, driveMinutes, config, tz);
  const simSegments = [...prefixSim, ...drv.segs];
  steps.push(...drv.steps);

  const { ev, violations } = postNowViolations(logged, simSegments, now, drv.endAt, config, false);
  const hosLegal = violations.length === 0;

  return {
    id: 'roll_now',
    title: 'Roll now (no break)',
    shortTitle: 'Roll now',
    isSplit: false,
    order: 'none',
    orderLabel: 'No split break',
    hosLegal,
    pairQualified: true,
    meetsDeadline: true,
    makesIt: hosLegal,
    recommended: false,
    tone: hosLegal ? 'good' : 'bad',
    badge: hosLegal ? 'No split needed' : 'Illegal',
    verdictLine: hosLegal
      ? `Fits on your current shift — roll at ${fmtRescueShort(drv.firstDriveAt, tz)}, finish by ${fmtRescueShort(drv.endAt, tz)}.`
      : `${summarizeViolations(violations)} without a qualifying split or 10-hour rest.`,
    releaseAt: drv.firstDriveAt,
    releaseShort: fmtRescueShort(drv.firstDriveAt, tz),
    releaseText: fmtRescueFull(drv.firstDriveAt, tz),
    finishAt: drv.endAt,
    finishShort: fmtRescueShort(drv.endAt, tz),
    finishText: fmtRescueFull(drv.endAt, tz),
    splitCompleteAt: null,
    splitCompleteShort: null,
    savedVsStraight10: 0,
    deadlineSlack: null,
    insertedBreakMinutes: drv.insertedBreakMinutes,
    longSbBlock: null,
    nextShift: hosLegal
      ? {
          at: drv.endAt,
          atShort: fmtRescueShort(drv.endAt, tz),
          atLabel: 'after delivery',
          driveRemaining: ev.shift.driveRemaining,
          windowRemaining: ev.shift.windowRemaining,
          breakRemaining: ev.shift.breakRemaining,
          cycleRemaining: ev.cycle.remaining,
          driveUsed: ev.shift.driveUsed,
          windowUsed: ev.shift.windowUsed,
          driveLimit: ev.shift.limits.drive,
          windowLimit: ev.shift.limits.window,
          trapTone: 'good',
          trapSummary: `Leaves ${dur(ev.shift.driveRemaining)} drive / ${dur(ev.shift.windowRemaining)} window on this shift; take a clean 10-hour rest after delivery.`,
        }
      : null,
    violations,
    steps,
    simSegments,
  };
}

function buildSplitStrategy(
  id: 'split82' | 'split73',
  longSbMinutes: number,
  shortLegMinutes: number,
  logged: Segment[],
  now: number,
  config: RulesConfig,
  dockWaitMinutes: number,
  driveMinutes: number,
  pendingSplitLeg: RestPeriod | null,
  tz: string,
): RescueStrategyResult {
  const title = id === 'split82' ? '8/2 split' : '7/3 split';
  const candidates: Array<SplitPairingCheck & { order: SplitOrder }> = [];

  // 1. Completing an already-logged pending split leg (if one exists and qualifies with this split)
  if (pendingSplitLeg) {
    const cLong = evaluateCompletingPendingLeg(
      logged, now, config, dockWaitMinutes, driveMinutes, longSbMinutes, shortLegMinutes, pendingSplitLeg, 'completes-pending-long',
    );
    if (cLong) candidates.push(cLong);
    const cShort = evaluateCompletingPendingLeg(
      logged, now, config, dockWaitMinutes, driveMinutes, longSbMinutes, shortLegMinutes, pendingSplitLeg, 'completes-pending-short',
    );
    if (cShort) candidates.push(cShort);
  }

  // 2. Fresh split pair starting from `now`: both short-first and long-first
  candidates.push({
    ...evaluateSplitPairing(logged, now, config, dockWaitMinutes, driveMinutes, longSbMinutes, shortLegMinutes, 'short-first'),
    order: 'short-first',
  });
  candidates.push({
    ...evaluateSplitPairing(logged, now, config, dockWaitMinutes, driveMinutes, longSbMinutes, shortLegMinutes, 'long-first'),
    order: 'long-first',
  });

  const violMinutes = (c: SplitPairingCheck) => c.violations.reduce((a, v) => a + v.minutes, 0);
  const headroom = (c: SplitPairingCheck) => (c.nextShift ? c.nextShift.driveRemaining + c.nextShift.windowRemaining : 0);

  // Pick the best order for this split strategy:
  //   1. HOS-legal beats illegal
  //   2. Earliest finishAt wins
  //   3. Tie-break: earliest splitCompleteAt (so a >=7h dock wait prefers SB-now over 7h-SB-later)
  //   4. Tie-break: short-first when dockWaitMinutes > 0
  //   5. Tie-break: more next-shift headroom
  //   If all illegal: fewest violation minutes, preferring short-first when dockWaitMinutes < longSbMinutes.
  candidates.sort((a, b) => {
    if (a.hosLegal !== b.hosLegal) return a.hosLegal ? -1 : 1;
    if (a.hosLegal && b.hosLegal) {
      if (a.finishAt !== b.finishAt) return a.finishAt - b.finishAt;
      if (a.splitCompleteAt !== b.splitCompleteAt) return a.splitCompleteAt - b.splitCompleteAt;
      if (dockWaitMinutes > 0) {
        const aShort = a.order === 'short-first' || a.order === 'completes-pending-long';
        const bShort = b.order === 'short-first' || b.order === 'completes-pending-long';
        if (aShort !== bShort) return aShort ? -1 : 1;
      }
      return headroom(b) - headroom(a);
    }
    const va = violMinutes(a), vb = violMinutes(b);
    if (va !== vb) return va - vb;
    const preferShort = dockWaitMinutes < longSbMinutes;
    const aShort = a.order === 'short-first';
    const bShort = b.order === 'short-first';
    if (aShort !== bShort) return (preferShort ? aShort : !aShort) ? -1 : 1;
    return a.finishAt - b.finishAt;
  });

  const best = candidates[0];
  const orderLabels: Record<SplitOrder, string> = {
    'short-first': dockWaitMinutes > 0 ? 'Short leg first (dock wait)' : 'Short leg first',
    'long-first': 'Long SB leg first',
    'completes-pending-long': 'Short leg completes prior SB',
    'completes-pending-short': 'Long SB completes prior break',
    none: '',
  };

  return {
    id,
    title,
    shortTitle: title,
    isSplit: true,
    order: best.order,
    orderLabel: orderLabels[best.order],
    hosLegal: best.hosLegal,
    pairQualified: best.pairQualified,
    meetsDeadline: true,
    makesIt: best.hosLegal,
    recommended: false,
    tone: best.hosLegal ? 'good' : 'bad',
    badge: best.hosLegal ? 'Legal split' : 'Illegal',
    verdictLine: best.hosLegal
      ? `Legal ${title} — roll at ${fmtRescueShort(best.releaseAt, tz)}, finish by ${fmtRescueShort(best.finishAt, tz)}.`
      : best.violations.length > 0
        ? `${summarizeViolations(best.violations)} — ${title} cannot legally cover ${dur(driveMinutes)} from your current clocks.`
        : `${title} pair does not qualify under FMCSA split-sleeper rules.`,
    releaseAt: best.releaseAt,
    releaseShort: fmtRescueShort(best.releaseAt, tz),
    releaseText: fmtRescueFull(best.releaseAt, tz),
    finishAt: best.finishAt,
    finishShort: fmtRescueShort(best.finishAt, tz),
    finishText: fmtRescueFull(best.finishAt, tz),
    splitCompleteAt: best.splitCompleteAt,
    splitCompleteShort: fmtRescueShort(best.splitCompleteAt, tz),
    savedVsStraight10: 0,
    deadlineSlack: null,
    insertedBreakMinutes: best.insertedBreakMinutes,
    longSbBlock: best.longSbBlock,
    nextShift: best.nextShift,
    violations: best.violations,
    steps: best.steps,
    simSegments: best.simSegments,
  };
}

/* ---------- main public simulator ---------- */

/**
 * Simulate Straight 10, 8/2 split, 7/3 split, and Roll now side-by-side from the driver's
 * logged clocks and planned dock delay. Every HOS clock, violation, 30-minute break, and
 * follow-on next-shift balance is derived directly from `engine/src/index.ts`.
 */
export function simulateRescue(input: RescueInput): RescueSimulation {
  const { now, config } = input;
  const logged = input.segments.filter((s) => !s.tentative);
  const tz = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const homeZoneName = zoneShort(tz);
  const { limit: cycleLimit, windowDays: cycleWindowDays } = cycleParamsOf(config);

  const evNow = evaluate(logged, { asOf: now, config });
  const loggedRests = restPeriods(evNow.segments);
  const activeRestNow = loggedRests.find((r) => r.start <= now && r.end === now) ?? null;
  const isFreshNow = evNow.segments.length === 0
    || (activeRestNow !== null && now - activeRestNow.start >= LIMITS.RESET)
    || (evNow.shift.driveUsed === 0 && evNow.shift.windowUsed === 0 && evNow.shift.anchor >= now);

  const dockWaitMinutes = Number.isFinite(input.dockWaitMinutes)
    ? Math.max(0, Math.min(24 * 60, Math.round(input.dockWaitMinutes)))
    : RESCUE_DEFAULT_WAIT_MIN;

  const { driveMinutes, effectiveMph } = computeRescueDriveMinutes(
    input.distanceMode,
    input.miles,
    input.mph,
    input.driveMinutesDirect,
  );

  const deadlineMinute = input.deadlineMinute !== null && Number.isFinite(input.deadlineMinute)
    ? Math.round(input.deadlineMinute)
    : null;

  const baseMeta = {
    homeTimeZone: tz,
    homeZoneName,
    now,
    nowShort: fmtRescueShort(now, tz),
    dockWaitMinutes,
    driveMinutes,
    effectiveMph,
    deadlineMinute,
    deadlineText: deadlineMinute !== null ? fmtRescueFull(deadlineMinute, tz) : null,
    deadlineShort: deadlineMinute !== null ? fmtRescueShort(deadlineMinute, tz) : null,
    driveRemainingNow: evNow.shift.driveRemaining,
    windowRemainingNow: evNow.shift.windowRemaining,
    breakRemainingNow: evNow.shift.breakRemaining,
    cycleRemainingNow: evNow.cycle.remaining,
    cycleLimit,
    cycleWindowDays,
    isFreshNow,
    pendingSplitLeg: evNow.shift.pendingSplitLeg,
  };

  if (driveMinutes <= 0) {
    return {
      ...baseMeta,
      validInput: false,
      noRescue: false,
      tone: 'warn',
      verdictSign: 'warn',
      verdictLabel: 'Enter remaining drive',
      headline: 'Enter remaining miles or drive hours to compare rescue strategies.',
      subline: 'We will compare Straight 10, 8/2 split, 7/3 split, and rolling now against your logged clocks.',
      strategies: [],
      straight10: null,
      recommended: null,
    };
  }

  // 1. Build all four strategies from the engine
  const straight10 = buildStraight10(logged, now, config, dockWaitMinutes, driveMinutes, activeRestNow, isFreshNow, tz);
  const split82 = buildSplitStrategy('split82', 8 * 60, 2 * 60, logged, now, config, dockWaitMinutes, driveMinutes, evNow.shift.pendingSplitLeg, tz);
  const split73 = buildSplitStrategy('split73', 7 * 60, 3 * 60, logged, now, config, dockWaitMinutes, driveMinutes, evNow.shift.pendingSplitLeg, tz);
  const rollNow = buildRollNow(logged, now, config, dockWaitMinutes, driveMinutes, tz);

  // Include Roll now only when it genuinely differs from Straight 10 (e.g. skip when >=10h wait or already fresh with 0 wait)
  const rollNowDiffers = dockWaitMinutes < LIMITS.RESET
    && !(rollNow.releaseAt === straight10.releaseAt
      && rollNow.finishAt === straight10.finishAt
      && rollNow.hosLegal === straight10.hosLegal);

  const strategies: RescueStrategyResult[] = [straight10, split82, split73];
  if (rollNowDiffers) strategies.push(rollNow);

  // 2. Apply Straight-10 savings and optional deadline comparison to each strategy
  for (const st of strategies) {
    st.savedVsStraight10 = straight10.finishAt - st.finishAt;
    if (deadlineMinute !== null) {
      st.deadlineSlack = deadlineMinute - st.finishAt;
      st.meetsDeadline = st.finishAt <= deadlineMinute;
      st.makesIt = st.hosLegal && st.meetsDeadline;
    } else {
      st.deadlineSlack = null;
      st.meetsDeadline = true;
      st.makesIt = st.hosLegal;
    }

    // Refine per-card tone, badge, and plain-English verdict line
    if (!st.hosLegal) {
      st.tone = 'bad';
      st.badge = 'Illegal';
      if (st.id === 'roll_now') {
        st.verdictLine = `${summarizeViolations(st.violations)} — waiting ${dur(dockWaitMinutes)} without a split runs out of hours.`;
      } else if (st.isSplit) {
        st.verdictLine = `${summarizeViolations(st.violations)} — ${st.title} cannot legally cover ${dur(driveMinutes)} from here.`;
      } else {
        st.verdictLine = `${summarizeViolations(st.violations)} even after a full 10-hour rest.`;
      }
    } else if (!st.meetsDeadline && st.deadlineSlack !== null) {
      st.tone = 'bad';
      st.badge = 'Misses deadline';
      st.verdictLine = `HOS-legal, but misses your ${fmtRescueShort(deadlineMinute!, tz)} deadline by ${dur(-st.deadlineSlack)} (finish ${st.finishShort}).`;
    } else if (deadlineMinute !== null && st.deadlineSlack !== null) {
      st.tone = 'good';
      const slackNote = st.deadlineSlack === 0 ? 'right on deadline' : `${dur(st.deadlineSlack)} early`;
      if (st.isSplit && !straight10.makesIt) {
        st.badge = 'Rescues run';
        st.verdictLine = `Makes deadline (${slackNote}) — saves ${dur(st.savedVsStraight10)} vs. Straight 10.`;
      } else if (st.id === 'roll_now') {
        st.badge = 'No split needed';
        st.verdictLine = `Makes deadline (${slackNote}) on your current shift — no split needed.`;
      } else if (st.id === 'straight10') {
        st.badge = 'Makes deadline';
        st.verdictLine = `Makes deadline (${slackNote}) with a fresh 11h/14h shift — no split trap.`;
      } else {
        st.badge = 'Makes deadline';
        st.verdictLine = st.savedVsStraight10 > 0
          ? `Makes deadline (${slackNote}) — finishes ${dur(st.savedVsStraight10)} ahead of Straight 10.`
          : `Makes deadline (${slackNote}).`;
      }
    } else {
      // No deadline set: compare against Straight 10 & Roll now
      st.tone = st.isSplit && st.nextShift?.trapTone === 'bad' ? 'warn' : 'good';
      if (st.id === 'roll_now') {
        st.badge = 'No split needed';
        st.verdictLine = `Legal on your current shift — finish by ${st.finishShort} (no split needed).`;
      } else if (st.isSplit && st.savedVsStraight10 > 0) {
        st.badge = `Saves ${dur(st.savedVsStraight10)}`;
        st.verdictLine = `Legal ${st.title} — finish ${st.finishShort}, saving ${dur(st.savedVsStraight10)} vs. Straight 10.`;
      } else if (st.id === 'straight10') {
        st.badge = 'Fresh 11h/14h';
        st.verdictLine = `Clean 10-hour rest — finish ${st.finishShort} with no next-shift trap.`;
      } else {
        st.badge = 'Legal split';
        st.verdictLine = `Legal ${st.title} — finish ${st.finishShort}.`;
      }
    }
  }

  // 3. Determine top-level verdict & whether any strategy rescues the run
  const splits = [split82, split73];
  const legalSplits = splits.filter((s) => s.hosLegal);
  const rescueSplitsWithDeadline = splits.filter((s) => s.makesIt);
  const rescueSplitsNoDeadline = legalSplits.filter((s) => !straight10.hosLegal || s.finishAt < straight10.finishAt);

  // Sort strategies best-first:
  //   1. `makesIt` (HOS-legal + beats deadline) first
  //   2. Then `hosLegal` (legal but missed deadline)
  //   3. Within each tier: earliest `finishAt`, then non-split on exact tie, then earliest `splitCompleteAt`, then highest next-shift headroom
  //   4. Illegal strategies last, sorted by fewest violation minutes
  const prefRank = (id: RescueStrategyId) => (id === 'roll_now' ? 0 : id === 'straight10' ? 1 : id === 'split82' ? 2 : 3);
  const totalViolMin = (s: RescueStrategyResult) => s.violations.reduce((a, v) => a + v.minutes, 0);
  const nextHeadroom = (s: RescueStrategyResult) => (s.nextShift ? s.nextShift.driveRemaining + s.nextShift.windowRemaining : 0);

  strategies.sort((a, b) => {
    if (a.makesIt !== b.makesIt) return a.makesIt ? -1 : 1;
    if (a.hosLegal !== b.hosLegal) return a.hosLegal ? -1 : 1;
    if (a.hosLegal && b.hosLegal) {
      if (a.finishAt !== b.finishAt) return a.finishAt - b.finishAt;
      if (prefRank(a.id) !== prefRank(b.id)) return prefRank(a.id) - prefRank(b.id);
      const ac = a.splitCompleteAt ?? a.finishAt;
      const bc = b.splitCompleteAt ?? b.finishAt;
      if (ac !== bc) return ac - bc;
      return nextHeadroom(b) - nextHeadroom(a);
    }
    const va = totalViolMin(a), vb = totalViolMin(b);
    if (va !== vb) return va - vb;
    return prefRank(a.id) - prefRank(b.id);
  });

  let noRescue = false;
  let tone: 'good' | 'warn' | 'bad' = 'good';
  let verdictSign: 'go' | 'warn' | 'stop' = 'go';
  let verdictLabel = 'Rescue available';
  let headline: string;
  let subline: string;
  let recommended: RescueStrategyResult | null = null;

  if (deadlineMinute !== null) {
    const winners = strategies.filter((s) => s.makesIt);
    if (winners.length === 0) {
      noRescue = true;
      tone = 'bad';
      verdictSign = 'stop';
      verdictLabel = 'No rescue';
      headline = NO_RESCUE_HEADLINE;
      const earliestLegal = strategies.find((s) => s.hosLegal) ?? null;
      if (earliestLegal) {
        const late = earliestLegal.finishAt - deadlineMinute;
        const s10Note = earliestLegal.id !== 'straight10' && straight10.hosLegal
          ? ` Straight 10: ${straight10.finishShort} (${dur(straight10.finishAt - deadlineMinute)} past).`
          : '';
        subline = `No strategy legally finishes by ${fmtRescueShort(deadlineMinute, tz)}. Earliest legal finish is ${earliestLegal.finishText} via ${earliestLegal.title} (${dur(late)} past deadline).${s10Note}`;
        earliestLegal.badge = 'Earliest legal';
      } else {
        subline = `No strategy legally finishes ${dur(driveMinutes)} from your current clocks (${summarizeViolations(straight10.violations)}).`;
      }
    } else {
      const top = winners[0];
      recommended = top;
      top.recommended = true;
      if (top.id === 'roll_now') {
        verdictLabel = 'No split needed';
        headline = `Roll after the wait — finish by ${top.finishShort} without splitting.`;
        subline = `Your current shift covers the ${dur(dockWaitMinutes)} wait and ${dur(driveMinutes)} drive legally${top.deadlineSlack ? ` (${dur(top.deadlineSlack)} before deadline)` : ''}.`;
      } else if (top.isSplit) {
        verdictLabel = `${top.title} rescues`;
        const slackTxt = top.deadlineSlack && top.deadlineSlack > 0 ? `${dur(top.deadlineSlack)} early` : 'right on time';
        headline = `${top.title} rescues this run — finish by ${top.finishShort} (${slackTxt}).`;
        subline = !straight10.makesIt && straight10.deadlineSlack !== null
          ? `Straight 10 misses your deadline by ${dur(-straight10.deadlineSlack)} (finish ${straight10.finishShort}). Watch the next-shift trap below before committing.`
          : `Saves ${dur(top.savedVsStraight10)} vs. Straight 10 (Straight 10 also makes the deadline at ${straight10.finishShort} with a fresh 11h/14h).`;
      } else {
        verdictLabel = 'Straight 10 fits';
        headline = `Take a Straight 10 — finish by ${top.finishShort} with a fresh 11h/14h.`;
        subline = rescueSplitsWithDeadline.length === 0
          ? `Splits don't help here, and a full 10-hour rest still makes your ${fmtRescueShort(deadlineMinute, tz)} deadline.`
          : `Full 10-hour rest makes your deadline without a next-shift split trap.`;
      }
    }
  } else {
    // No deadline set
    if (rollNowDiffers && rollNow.hosLegal) {
      recommended = strategies[0];
      recommended.recommended = true;
      verdictLabel = 'No split needed';
      headline = `No split needed — roll at ${rollNow.releaseShort}, finish by ${rollNow.finishShort}.`;
      subline = `Your current clocks cover the ${dur(dockWaitMinutes)} wait and ${dur(driveMinutes)} drive legally without a split-sleeper trap.`;
    } else if (rescueSplitsNoDeadline.length > 0) {
      const top = strategies.find((s) => s.isSplit && s.hosLegal && (!straight10.hosLegal || s.finishAt < straight10.finishAt))!;
      recommended = top;
      top.recommended = true;
      verdictLabel = `${top.title} rescues`;
      headline = `${top.title} saves ${dur(top.savedVsStraight10)} vs. Straight 10 — roll at ${top.releaseShort}, finish ${top.finishShort}.`;
      subline = `Straight 10 finishes at ${straight10.finishShort}. Check the next-shift trap on ${top.title} before committing.`;
    } else if (isFreshNow && straight10.hosLegal) {
      recommended = straight10;
      straight10.recommended = true;
      verdictLabel = 'Fresh clocks';
      headline = `Fresh 11h/14h clocks — roll at ${straight10.releaseShort}, finish by ${straight10.finishShort}.`;
      subline = `No split rescue needed from a fresh shift.`;
    } else {
      // Neither Roll now nor any split rescues the run!
      noRescue = true;
      tone = 'bad';
      verdictSign = 'stop';
      verdictLabel = 'No rescue';
      headline = NO_RESCUE_HEADLINE;
      if (straight10.hosLegal) {
        subline = `Neither an 8/2 nor a 7/3 split legally saves ${dur(driveMinutes)} from your current clocks. Earliest legal finish is ${straight10.finishText} via a Straight 10.`;
        straight10.badge = 'Earliest legal (Straight 10)';
      } else {
        subline = `Neither a split nor a single 10-hour rest legally covers ${dur(driveMinutes)} from your current clocks (${summarizeViolations(straight10.violations)}).`;
      }
    }
  }

  return {
    ...baseMeta,
    validInput: true,
    noRescue,
    tone,
    verdictSign,
    verdictLabel,
    headline,
    subline,
    strategies,
    straight10,
    recommended,
  };
}
