/**
 * My Week — Multi-Load Week Synthesizer (Plan capstone tool).
 *
 * Orchestrates the driver's real week ahead (home-time target + 1–5 upcoming loads +
 * optional open-night shift fill) as ONE continuous engine-verified timeline.
 *
 * ZERO parallel re-implementations of HOS rules:
 *   - Every clock, violation, rest period, split pairing, and cycle recap drop-off
 *     comes strictly from `engine/src/index.ts` (`evaluate`, `planTripAll`,
 *     `pruneHistory`, `restPeriods`, `normalize`, `cycleViolations`, `pairQualifies`,
 *     `carrierDayStart`, `nextCarrierDayStart`, `localToMinute`, `LIMITS`) and the
 *     existing planning modules (`planRollout`, `simulateRescue`, `projectRecapVs34`).
 *   - Forward chaining feeds Load k's actual simulated segments into Load k+1's
 *     evaluation (no fresh-clock resets between loads).
 *   - Read-only against `s.segments` and `s.current` — all simulated segments are
 *     tagged `tentative: true` in-memory and never touch the logged record.
 */
import type {
  DutyStatus,
  FullEvaluation,
  RestPeriod,
  RulesConfig,
  Segment,
  TripInput,
  TripPlan,
  Violation,
} from '../../engine/src/index.ts';
import {
  LIMITS,
  carrierDayStart,
  cycleViolations,
  evaluate,
  localToMinute,
  nextCarrierDayStart,
  normalize,
  planTrip,
  pruneHistory,
  restPeriods,
} from '../../engine/src/index.ts';
import {
  DEFAULT_WEEK_LOAD,
  DEFAULT_WEEK_PLAN,
  WEEK_MAX_LOADS,
  cycleParamsOf,
  dur,
  isValidTimeZone,
  meaningfulGaps,
  zoneShort,
  type HistoryBasis,
  type WeekHomeTarget,
  type WeekLoadDraft,
  type WeekPlanDraft,
} from './store.ts';
import { dayStartWord, safeRulesConfig } from './carrierday.ts';
import {
  DEFAULT_BUFFER_MIN,
  DEFAULT_DOCK_MIN,
  DEFAULT_MPH,
  DEFAULT_PRETRIP_MIN,
  MAX_MPH,
  MIN_MPH,
  SWEET_SPOT_END_MIN,
  SWEET_SPOT_START_MIN,
  computeDriveMinutes,
  formatDualTime,
  formatWallDateTime,
  planRollout,
  resolveWallDateTime,
  wallMinutesInZone,
  type DualTime,
  type RolloutPlan,
} from './rollout.ts';
import {
  SPLIT_SB_CALLOUT,
  simulateRescue,
  type RescueSimulation,
  type RescueStrategyResult,
} from './rescue.ts';
import {
  projectRecapVs34,
  terminalClock,
  type RecapComparison,
} from './recap.ts';

export const WEEK_MILES_PRESETS = [250, 400, 550, 700, 900] as const;
export const WEEK_DOCK_PRESETS = [
  { label: '0m', minutes: 0 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
] as const;
export const WEEK_USUAL_BUDGET_PRESETS = [
  { label: '8h 30m', minutes: 510 },
  { label: '9h 30m', minutes: 570 },
  { label: '10h', minutes: 600 },
  { label: '11h', minutes: 660 },
] as const;
export const WEEK_USUAL_START_PRESETS = [
  { label: '18:00', minutes: 18 * 60 },
  { label: '21:00', minutes: 21 * 60 },
  { label: '00:01', minutes: 1 },
  { label: '06:00', minutes: 6 * 60 },
] as const;
export const WEEK_STANDING_DISCLAIMER_PREFIX = 'Planning estimate at';

export type WeekStrategyId = 'recaps' | 'reset34';

export type WeekConflictKind =
  | 'reset34_blocked'
  | 'midnight_recap_gate'
  | 'split_trap'
  | 'home_time_short'
  | 'appt_missed'
  | 'tz_and_parking';

export interface WeekTradePreview {
  id: string;
  label: string;
  description: string;
  /** Mutates a cloned WeekPlanDraft to preview this concrete trade. */
  apply: (draft: WeekPlanDraft) => WeekPlanDraft;
}

export interface WeekConflict {
  id: string;
  kind: WeekConflictKind;
  severity: 'bad' | 'warn' | 'info';
  /** Sort rank (lower = shown first). */
  priority: number;
  title: string;
  body: string;
  /** Priced impact summary in hours/minutes. */
  priceLabel: string;
  tradeText: string;
  /** Optional 1-tap preview trade. */
  previewTrade: WeekTradePreview | null;
}

export interface WeekLoadOutcome {
  id: string;
  index: number;
  displayName: string;
  load: WeekLoadDraft;
  /** Effective speed & drive minutes. */
  effectiveMph: number;
  deadheadDriveMinutes: number;
  loadedDriveMinutes: number;
  totalDriveMinutes: number;
  preTripMinutes: number;
  bufferMinutes: number;
  dockMinutes: number;
  dockOff: boolean;
  pickupDwellMinutes: number;
  pickupDwellOff: boolean;
  apptTimeZone: string;
  sameZone: boolean;
  /** Appointment time (if set). */
  appointment: DualTime | null;
  /** Roll-out, arrival, PTA, and rest after this load. */
  unconstrainedRollOut: DualTime;
  rollOut: DualTime;
  arrival: DualTime;
  pta: DualTime;
  restBeforeMinutes: number;
  restAfterStart: DualTime;
  restAfterEnd: DualTime;
  restAfterMinutes: number;
  /** Midnight / carrier-day recap gate (or natural 34h restart wait) applied to roll-out (0 when not gated). */
  midnightGateMinutes: number;
  midnightGateKind: 'recap' | 'restart34' | null;
  midnightGateBoundary: DualTime | null;
  midnightGateDropOffMinutes: number;
  /** Appointment slack in minutes (`appt - arrival`). Positive = early, negative = late, null = no appt. */
  apptSlackMinutes: number | null;
  meetsAppt: boolean;
  /** Whether a 30-min break was inserted during driving. */
  insertedBreakMinutes: number;
  /** Parking sweet spot check on shutdown after this load (08:00–10:00 local). */
  ptaInSweetSpot: boolean;
  /** Whether this load used a sleeper split (7/3 or 8/2) to make its appointment. */
  usedSplit: boolean;
  splitKind: 'split82' | 'split73' | null;
  splitOrderLabel: string | null;
  splitCallout: string | null;
  /** If a split was tested and rejected due to a Next-Shift Trap on Load k+1. */
  splitTrapDetected: boolean;
  splitTrapDetail: string | null;
  /** Cycle remaining immediately after this load's PTA (from `evaluate()`). */
  cycleRemainingAfter: number;
  /** Shift drive/window remaining immediately after this load's PTA (from `evaluate()`). */
  driveRemainingAfter: number;
  windowRemainingAfter: number;
  /** Status tag for the week strip card. */
  statusTone: 'good' | 'warn' | 'bad';
  statusBadge: string;
  /** Backwards rollout details (from `planRollout()` when appt set). */
  rolloutPlan: RolloutPlan | null;
  /** Engine-verified tentative segments generated for this load (including pre-load rest). */
  simSegments: Segment[];
  /** Post-cursor violations from `evaluate()`. */
  violations: Violation[];
}

export interface WeekOpenNight {
  index: number;
  label: string;
  shortLabel: string;
  dayShort: string;
  shiftStart: DualTime;
  plannedMinutes: number;
  usableMinutes: number;
  pinched: boolean;
  shortfallMinutes: number;
  dropsOffMinutes: number;
  availAfterMinutes: number;
  blockedByReset: boolean;
}

export interface WeekStrategyResult {
  id: WeekStrategyId;
  label: string;
  /** Only set for Strategy B (`reset34`): where the 34-hour reset is placed. */
  resetPlacement: {
    beforeLoadIndex: number; // 0..activeLoads.length (activeLoads.length = after last load)
    label: string;
    start: DualTime;
    end: DualTime;
  } | null;
  loads: WeekLoadOutcome[];
  openNights: WeekOpenNight[];
  /** Total miles across active loads (loaded + deadhead). */
  totalMiles: number;
  /** Total driving minutes across active loads. */
  totalDriveMinutes: number;
  /** Final completion timestamp (last active load PTA, or last open night end, or `now`). */
  endMinute: number;
  endTime: DualTime;
  /** Engine-evaluated cycle remaining at the end of the chained loads. */
  cycleRemainingAtEnd: number;
  /** Engine-evaluated cycle remaining at end of open-night projection (when fillOpenNights). */
  cycleRemainingAfterOpenNights: number;
  /** Home-time target check (null if no homeTarget set). */
  homeCheck: {
    target: DualTime;
    actualFinish: DualTime;
    /** Positive = early before home target; negative = late past home target. */
    slackMinutes: number;
    meetsTarget: boolean;
    cycleRemainingAtHome: number;
  } | null;
  /** Count of missed hard appointments. */
  missedApptCount: number;
  /** Sum of lateness (minutes) across all missed hard appointments. */
  totalApptLateMinutes: number;
  /** Worst lateness across hard appointments (0 if all met). */
  maxApptLateMinutes: number;
  /** Minimum appointment slack across all hard appointments (null if no hard appts). */
  minApptSlackMinutes: number | null;
  /** Minimum per-load cycle remaining across all active loads (equals cycleRemainingAtEnd if 0 loads). */
  minLoadCycleRemaining: number;
  /** Whether any load in this strategy relies on a sleeper split. */
  usesSplit: boolean;
  /** Whether any load was gated by a midnight/carrier-day recap boundary. */
  totalMidnightGateMinutes: number;
  /** All simulated segments for the chained loads (tagged `tentative: true`). */
  simSegments: Segment[];
  /** Full engine evaluation of `[...logged, ...simSegments]` at `endMinute`. */
  finalEvaluation: FullEvaluation;
  /** Violations strictly in the simulated portion (`>= now`). */
  violations: Violation[];
  /** True when zero HOS violations AND all hard appointments met. */
  allLoadsLegalAndOnTime: boolean;
}

export interface WeekStaleLoad {
  load: WeekLoadDraft;
  index: number;
  displayName: string;
  apptText: string;
}

export interface WeekSynthesisInput {
  segments: Segment[];
  now: number;
  config: RulesConfig;
  mph: number;
  draft: WeekPlanDraft;
  historyBasis?: HistoryBasis;
  previewTradeId?: string | null;
}

export interface WeekSynthesisResult {
  now: number;
  homeTimeZone: string;
  homeZoneName: string;
  dayStartWord: string;
  cycleLimit: number;
  cycleWindowDays: number;
  effectiveMph: number;
  /** Starting clocks straight from `evaluate(logged, { asOf: now, config })`. */
  startingEval: FullEvaluation;
  cycleRemainingNow: number;
  driveRemainingNow: number;
  windowRemainingNow: number;
  /** Upcoming carrier-day recap drop-offs from `startingEval.cycle.forecast`. */
  upcomingDropOffs: { dayStart: number; label: string; dropsOff: number; availableAtStart: number }[];
  /** True if past history is incomplete or contains >=2h unlogged gaps. */
  provisional: boolean;
  provisionalReason: string | null;
  /** Active (non-done, non-stale) loads chained in this synthesis. */
  activeLoadCount: number;
  /** Past-due loads excluded from silent forward chaining (Section F.1 guardrail). */
  staleLoads: WeekStaleLoad[];
  /** Strategy A: Keep Running Recaps. */
  recaps: WeekStrategyResult;
  /** Strategy B: Best-Fit 34-Hour Reset. */
  reset34: WeekStrategyResult;
  /** Which strategy wins overall. */
  recommendedStrategy: WeekStrategyId;
  /** The strategy currently selected for display (`draft.strategyView`, or recommended if previewing). */
  activeStrategy: WeekStrategyResult;
  /** Standalone `projectRecapVs34()` macro baseline (used to detect when a load blocks the ideal 34). */
  macroRecap: RecapComparison;
  /** Cross-engine conflicts & priced trades (sorted by priority). */
  conflicts: WeekConflict[];
  /** Top 5-second verdict banner. */
  verdict: {
    status: 'all_clear' | 'tight' | 'conflict' | 'provisional';
    tone: 'good' | 'warn' | 'bad';
    sign: 'go' | 'warn' | 'stop';
    label: string;
    headline: string;
    subline: string;
    fragilityNote: string | null;
    splitCallout: string | null;
  };
  /** Active preview trade id, if a trade preview is currently applied. */
  activePreviewTradeId: string | null;
  /** Copyable plain-text dispatch summary / pushback. */
  dispatchText: string;
  /** 1-line summary for the Plan hub capstone card. */
  hubSummary: string;
}

/* ---------- internal helpers ---------- */

interface NormalizedLoad {
  load: WeekLoadDraft;
  index: number;
  displayName: string;
  effectiveMph: number;
  deadheadDriveMinutes: number;
  loadedDriveMinutes: number;
  totalDriveMinutes: number;
  preTripMinutes: number;
  bufferMinutes: number;
  dockMinutes: number;
  dockOff: boolean;
  pickupDwellMinutes: number;
  pickupDwellOff: boolean;
  apptTimeZone: string;
  sameZone: boolean;
  apptMinute: number | null;
}

function clampWeekMph(mph: number): number {
  return Number.isFinite(mph) ? Math.max(MIN_MPH, Math.min(MAX_MPH, Math.round(mph))) : DEFAULT_MPH;
}

/** Strip `tentative` flag for passing already-chained prior load segments as committed history to engine/tool helpers. */
function asCommitted(segs: Segment[]): Segment[] {
  return segs.map((s) => (s.tentative ? { status: s.status, start: s.start, end: s.end, note: s.note } : s));
}

/** Check violations after `fromMinute`, optionally rejecting any unintentional new 34h restart. */
function checkTimelineViolations(
  chainHistory: Segment[],
  candidateSegs: Segment[],
  fromMinute: number,
  evalAt: number,
  config: RulesConfig,
  allowNew34: boolean,
): { ev: FullEvaluation; violations: Violation[] } {
  const combined = [...chainHistory, ...candidateSegs];
  const ev = evaluate(combined, { asOf: evalAt, config, forecastDays: 0 });
  const raw = ev.violations.filter((v) => v.tentative || v.start >= fromMinute);
  if (allowNew34) return { ev, violations: raw };

  const rests = restPeriods(ev.segments);
  // Never strip a 34-hour restart that had ALREADY completed in logged/prior rest before `fromMinute`.
  const hasStrippable = rests.some((r) => r.isRestart && r.end > fromMinute && (fromMinute - r.start < LIMITS.RESTART));
  if (!hasStrippable) return { ev, violations: raw };

  const noNew34 = rests.map((r) => (
    r.isRestart && r.end > fromMinute && (fromMinute - r.start < LIMITS.RESTART)
      ? { ...r, isRestart: false }
      : r
  ));
  const extra = cycleViolations(ev.segments, noNew34, config).filter((v) => v.tentative || v.start >= fromMinute);
  const merged = [...raw];
  for (const cv of extra) {
    if (!merged.some((v) => v.kind === cv.kind && v.start === cv.start && v.end === cv.end)) {
      merged.push(cv);
    }
  }
  merged.sort((a, b) => a.start - b.start);
  return { ev, violations: merged };
}

/**
 * Fast engine-exact cycle-violation check used inside Pass-1 hold search (`r >= earliestRoll` already
 * guarantees fresh 11h/14h/8h shift clocks; final winning minute is still verified via full `evaluate()`).
 */
function hasCycleViolationAfter(
  chainHistory: Segment[],
  candidateSegs: Segment[],
  fromMinute: number,
  config: RulesConfig,
  allowNew34: boolean,
): boolean {
  const norm = normalize([...chainHistory, ...candidateSegs]);
  const rests = restPeriods(norm);
  const effectiveRests = allowNew34
    ? rests
    : rests.map((r) => (
        r.isRestart && r.end > fromMinute && (fromMinute - r.start < LIMITS.RESTART)
          ? { ...r, isRestart: false }
          : r
      ));
  const cv = cycleViolations(norm, effectiveRests, config);
  return cv.some((v) => v.tentative || v.start >= fromMinute);
}

/**
 * Append driving segments using the real engine's `evaluate().shift.breakRemaining`
 * so the 30-minute break (§395.3(a)(3)(ii)) is placed only where the engine requires it.
 */
function buildDrivingWithEngineBreak(
  prefix: Segment[],
  startAt: number,
  driveMinutes: number,
  config: RulesConfig,
  note: string,
): { segs: Segment[]; endAt: number; insertedBreakMinutes: number } {
  const segs: Segment[] = [];
  let t = startAt;
  let rem = driveMinutes;
  let insertedBreakMinutes = 0;
  let guard = 0;
  while (rem > 0 && guard++ < 8) {
    const ev = evaluate([...prefix, ...segs], { asOf: t, config, forecastDays: 0 });
    const brkRem = ev.shift.breakRemaining;
    if (!config.shortHaul && brkRem <= 0) {
      segs.push({ status: 'OFF', start: t, end: t + LIMITS.BREAK_LEN, tentative: true, note: '30-min break' });
      t += LIMITS.BREAK_LEN;
      insertedBreakMinutes += LIMITS.BREAK_LEN;
      continue;
    }
    const chunk = config.shortHaul || !Number.isFinite(brkRem) ? rem : Math.min(rem, brkRem);
    if (chunk <= 0) break;
    segs.push({ status: 'D', start: t, end: t + chunk, tentative: true, note });
    t += chunk;
    rem -= chunk;
  }
  return { segs, endAt: t, insertedBreakMinutes };
}

/**
 * Construct concrete single-shift segments for a load rolling out at `rollOut`
 * (pre-load OFF rest from `cursor` to `rollOut`, pre-trip, optional deadhead + pickup dwell,
 * loaded drive with 30m break, optional early-wait OFF until appt, and dock dwell).
 * When `isFreshShift` is true (`rollOut >= earliestRoll`), the 8-hour driving break clock starts
 * fresh at `LIMITS.BREAK_AFTER`, avoiding redundant `evaluate()` calls while staying 100% identical
 * to `buildDrivingWithEngineBreak` (and still verified by `evaluate()` in `checkTimelineViolations`).
 */
function buildSingleShiftLoadSegs(
  chainHistory: Segment[],
  cursor: number,
  rollOut: number,
  nl: NormalizedLoad,
  config: RulesConfig,
  isFreshShift = false,
): {
  segs: Segment[];
  arrival: number;
  pta: number;
  insertedBreakMinutes: number;
  restBeforeMinutes: number;
} {
  const segs: Segment[] = [];
  const restBeforeMinutes = Math.max(0, rollOut - cursor);
  if (rollOut > cursor) {
    segs.push({ status: 'OFF', start: cursor, end: rollOut, tentative: true, note: `Rest before ${nl.displayName}` });
  }
  let t = rollOut;
  if (nl.preTripMinutes > 0) {
    segs.push({ status: 'ON', start: t, end: t + nl.preTripMinutes, tentative: true, note: `${nl.displayName} pre-trip` });
    t += nl.preTripMinutes;
  }
  let insertedBreakMinutes = 0;

  if (isFreshShift) {
    let driveSinceBreak = 0;
    const appendFreshDrive = (mins: number, note: string) => {
      let rem = mins;
      while (rem > 0) {
        if (!config.shortHaul && driveSinceBreak >= LIMITS.BREAK_AFTER) {
          segs.push({ status: 'OFF', start: t, end: t + LIMITS.BREAK_LEN, tentative: true, note: '30-min break' });
          t += LIMITS.BREAK_LEN;
          insertedBreakMinutes += LIMITS.BREAK_LEN;
          driveSinceBreak = 0;
          continue;
        }
        const chunk = config.shortHaul ? rem : Math.min(rem, LIMITS.BREAK_AFTER - driveSinceBreak);
        segs.push({ status: 'D', start: t, end: t + chunk, tentative: true, note });
        t += chunk;
        rem -= chunk;
        driveSinceBreak += chunk;
      }
    };
    if (nl.deadheadDriveMinutes > 0) appendFreshDrive(nl.deadheadDriveMinutes, `${nl.displayName} deadhead`);
    if (nl.pickupDwellMinutes > 0) {
      segs.push({
        status: nl.pickupDwellOff ? 'OFF' : 'ON',
        start: t,
        end: t + nl.pickupDwellMinutes,
        tentative: true,
        note: `${nl.displayName} pickup`,
      });
      t += nl.pickupDwellMinutes;
      if (nl.pickupDwellMinutes >= LIMITS.BREAK_LEN) driveSinceBreak = 0;
    }
    if (nl.loadedDriveMinutes > 0) appendFreshDrive(nl.loadedDriveMinutes, `${nl.displayName} drive`);
  } else {
    if (nl.deadheadDriveMinutes > 0) {
      const dh = buildDrivingWithEngineBreak([...chainHistory, ...segs], t, nl.deadheadDriveMinutes, config, `${nl.displayName} deadhead`);
      segs.push(...dh.segs);
      t = dh.endAt;
      insertedBreakMinutes += dh.insertedBreakMinutes;
    }
    if (nl.pickupDwellMinutes > 0) {
      segs.push({
        status: nl.pickupDwellOff ? 'OFF' : 'ON',
        start: t,
        end: t + nl.pickupDwellMinutes,
        tentative: true,
        note: `${nl.displayName} pickup`,
      });
      t += nl.pickupDwellMinutes;
    }
    if (nl.loadedDriveMinutes > 0) {
      const ld = buildDrivingWithEngineBreak([...chainHistory, ...segs], t, nl.loadedDriveMinutes, config, `${nl.displayName} drive`);
      segs.push(...ld.segs);
      t = ld.endAt;
      insertedBreakMinutes += ld.insertedBreakMinutes;
    }
  }
  const arrival = t;
  // If arriving early before a hard appointment, wait OFF duty until appointment before dock starts
  // (matches rollout.ts PTA semantics: PTA = max(arrival, appt) + dock).
  let dockStart = arrival;
  if (nl.apptMinute !== null && nl.apptMinute > arrival) {
    segs.push({ status: 'OFF', start: arrival, end: nl.apptMinute, tentative: true, note: `${nl.displayName} early wait` });
    dockStart = nl.apptMinute;
  }
  let pta = dockStart;
  if (nl.dockMinutes > 0) {
    segs.push({
      status: nl.dockOff ? 'OFF' : 'ON',
      start: dockStart,
      end: dockStart + nl.dockMinutes,
      tentative: true,
      note: `${nl.displayName} dock`,
    });
    pta = dockStart + nl.dockMinutes;
  }
  return { segs, arrival, pta, insertedBreakMinutes, restBeforeMinutes };
}

/**
 * Fast shifted copy of single-shift work segments from a fresh-shift template (used inside hold binary search
 * where `rollOut >= earliestRoll` guarantees an identical fresh 8h driving break clock).
 */
function buildShiftedLoadSegs(
  templateWorkSegs: Segment[],
  templateBaseRoll: number,
  templateBreakMinutes: number,
  cursor: number,
  rollOut: number,
  nl: NormalizedLoad,
): {
  segs: Segment[];
  arrival: number;
  pta: number;
  insertedBreakMinutes: number;
  restBeforeMinutes: number;
} {
  const delta = rollOut - templateBaseRoll;
  const segs: Segment[] = [];
  const restBeforeMinutes = Math.max(0, rollOut - cursor);
  if (rollOut > cursor) {
    segs.push({ status: 'OFF', start: cursor, end: rollOut, tentative: true, note: `Rest before ${nl.displayName}` });
  }
  let arrival = rollOut;
  for (const ws of templateWorkSegs) {
    const s = ws.start + delta;
    const e = ws.end + delta;
    segs.push({ ...ws, start: s, end: e });
    arrival = e;
  }
  let dockStart = arrival;
  if (nl.apptMinute !== null && nl.apptMinute > arrival) {
    segs.push({ status: 'OFF', start: arrival, end: nl.apptMinute, tentative: true, note: `${nl.displayName} early wait` });
    dockStart = nl.apptMinute;
  }
  let pta = dockStart;
  if (nl.dockMinutes > 0) {
    segs.push({
      status: nl.dockOff ? 'OFF' : 'ON',
      start: dockStart,
      end: dockStart + nl.dockMinutes,
      tentative: true,
      note: `${nl.displayName} dock`,
    });
    pta = dockStart + nl.dockMinutes;
  }
  return { segs, arrival, pta, insertedBreakMinutes: templateBreakMinutes, restBeforeMinutes };
}

/**
 * Compute single-shift wall time from roll-out to arrival (before dock), used for backwards anchoring.
 */
function singleShiftWallBeforeArrival(nl: NormalizedLoad, shortHaul: boolean): number {
  const breakMin =
    !shortHaul && nl.totalDriveMinutes > LIMITS.BREAK_AFTER
    && !(nl.pickupDwellMinutes >= LIMITS.BREAK_LEN && nl.deadheadDriveMinutes <= LIMITS.BREAK_AFTER && nl.loadedDriveMinutes <= LIMITS.BREAK_AFTER)
      ? LIMITS.BREAK_LEN
      : 0;
  return nl.preTripMinutes + nl.deadheadDriveMinutes + nl.pickupDwellMinutes + nl.loadedDriveMinutes + breakMin;
}

/**
 * Determine earliest minute at which the driver has a fresh 10-hour rest (or 34-hour restart)
 * from `chainHistory` at `cursor`. Reuses `knownEval` when already computed for `(chainHistory, cursor)`.
 */
function earliestResetComplete(
  chainHistory: Segment[],
  cursor: number,
  config: RulesConfig,
  requiredRestMinutes: number,
  isFirstLoad: boolean,
  knownEval?: FullEvaluation | null,
): { earliest: number; activeRest: RestPeriod | null; isFreshAtCursor: boolean; ev: FullEvaluation } {
  const ev = knownEval ?? evaluate(chainHistory, { asOf: cursor, config, forecastDays: 0 });
  const rests = restPeriods(ev.segments);
  const activeRest = rests.find((r) => r.start <= cursor && r.end === cursor) ?? null;
  const hasAnyWork = ev.segments.some((s) => s.status === 'D' || s.status === 'ON');

  if (requiredRestMinutes >= LIMITS.RESTART) {
    if (activeRest) {
      return {
        earliest: Math.max(cursor, activeRest.start + LIMITS.RESTART),
        activeRest,
        isFreshAtCursor: activeRest.duration >= LIMITS.RESTART,
        ev,
      };
    }
    return { earliest: cursor + LIMITS.RESTART, activeRest: null, isFreshAtCursor: false, ev };
  }

  // Standard 10h reset check
  const isFreshAtCursor =
    !hasAnyWork
    || (ev.shift.driveUsed === 0 && ev.shift.windowUsed === 0 && isFirstLoad && (activeRest === null || activeRest.isReset));
  if (isFreshAtCursor) {
    return { earliest: cursor, activeRest, isFreshAtCursor: true, ev };
  }
  if (activeRest) {
    return {
      earliest: Math.max(cursor, activeRest.start + LIMITS.RESET),
      activeRest,
      isFreshAtCursor: activeRest.duration >= LIMITS.RESET,
      ev,
    };
  }
  return { earliest: cursor + LIMITS.RESET, activeRest: null, isFreshAtCursor: false, ev };
}

/**
 * Simulate one load via `planTrip()` (multi-shift fallback when a load exceeds 11h/14h
 * or needs multi-day recap waiting). Respects `allowSplits` and `restStrategy`, and
 * derives `splitKind` from the engine's actual split plan (never hard-coded).
 */
function simulateViaPlanTripAll(
  chainHistory: Segment[],
  cursor: number,
  departure: number,
  nl: NormalizedLoad,
  config: RulesConfig,
  strategy: WeekStrategyId,
  allowSplits: boolean,
): {
  segs: Segment[];
  rollOut: number;
  arrival: number;
  pta: number;
  insertedBreakMinutes: number;
  usedSplit: boolean;
  splitKind: 'split82' | 'split73' | null;
  splitOrderLabel: string | null;
  tripPlan: TripPlan;
} {
  const stops: TripInput['stops'] = [];
  if (nl.deadheadDriveMinutes > 0 && nl.pickupDwellMinutes > 0) {
    const dhMiles = (nl.deadheadDriveMinutes / 60) * nl.effectiveMph;
    stops.push({
      atMile: dhMiles,
      minutes: nl.pickupDwellMinutes,
      status: nl.pickupDwellOff ? 'OFF' : 'ON',
      label: `${nl.displayName} pickup`,
    });
  }
  const totalMilesEquiv = (nl.totalDriveMinutes / 60) * nl.effectiveMph;
  const tripInput: TripInput = {
    departure,
    untilDeparture: departure > cursor ? { from: cursor, status: 'OFF', label: `Rest before ${nl.displayName}` } : undefined,
    distanceMiles: Math.max(1, totalMilesEquiv),
    mph: nl.effectiveMph,
    preTripMinutes: nl.preTripMinutes,
    stops,
    config,
  };
  const history = pruneHistory(chainHistory, tripInput.untilDeparture?.from ?? tripInput.departure, config);
  let chosen: TripPlan;
  let usedSplit = false;
  let splitKind: 'split82' | 'split73' | null = null;
  let splitOrderLabel: string | null = null;

  if (strategy === 'reset34') {
    chosen = planTrip(history, { ...tripInput, restStrategy: 'restart34' });
  } else {
    const reset10 = planTrip(history, { ...tripInput, restStrategy: 'reset10' });
    chosen = reset10;
    // H1: Only test sleeper-split fallback when reset10 actually took a 10h shift rest (a split cannot beat a cycle wait)
    const tookShiftReset = reset10.steps.some((st) => st.reason.includes('10-hour') || st.reason.includes('11-hour') || st.reason.includes('14-hour'));
    if (allowSplits && tookShiftReset) {
      const sp7 = planTrip(history, { ...tripInput, restStrategy: 'split', splitFirstLeg: LIMITS.SPLIT_MIN_SB });
      const opened = sp7.steps.some((st) => st.reason.includes('opens a split'));
      const sp8 = opened ? planTrip(history, { ...tripInput, restStrategy: 'split', splitFirstLeg: LIMITS.SPLIT_MIN_SB + 60 }) : null;
      const splitPlan = sp8 && sp8.arrival < sp7.arrival ? sp8 : sp7;
      if (splitPlan.feasible && splitPlan.driveEnd < reset10.driveEnd) {
        chosen = splitPlan;
        usedSplit = splitPlan.steps.some((st) => st.reason.toLowerCase().includes('split') || st.reason.toLowerCase().includes('pairs'));
        if (usedSplit) {
          const has8hSb = splitPlan.steps.some(
            (st) => st.segment.status === 'SB' && st.segment.end - st.segment.start >= LIMITS.SPLIT_MIN_SB + 60,
          );
          splitKind = has8hSb ? 'split82' : 'split73';
          splitOrderLabel = splitKind === 'split82' ? '8/2 sleeper split' : '7/3 sleeper split';
        }
      }
    }
  }
  const segs: Segment[] = chosen.steps.map((st) => ({ ...st.segment, tentative: true }));
  const arrival = chosen.driveEnd;
  let dockStart = arrival;
  if (nl.apptMinute !== null && nl.apptMinute > arrival) {
    segs.push({ status: 'OFF', start: arrival, end: nl.apptMinute, tentative: true, note: `${nl.displayName} early wait` });
    dockStart = nl.apptMinute;
  }
  let pta = dockStart;
  if (nl.dockMinutes > 0) {
    segs.push({
      status: nl.dockOff ? 'OFF' : 'ON',
      start: dockStart,
      end: dockStart + nl.dockMinutes,
      tentative: true,
      note: `${nl.displayName} dock`,
    });
    pta = dockStart + nl.dockMinutes;
  }
  const insertedBreakMinutes = chosen.steps
    .filter((st) => st.reason.includes('30-minute break'))
    .reduce((acc, st) => acc + (st.segment.end - st.segment.start), 0);
  const firstWork = chosen.steps.find((st) => st.segment.status === 'ON' || st.segment.status === 'D');
  return {
    segs,
    rollOut: firstWork ? firstWork.segment.start : departure,
    arrival,
    pta,
    insertedBreakMinutes,
    usedSplit,
    splitKind,
    splitOrderLabel,
    tripPlan: chosen,
  };
}

/**
 * Re-evaluate a single next load (`nl`) from a concrete predecessor history/cursor using the exact same
 * single-shift + carrier-day cycle-gate + fallback engine rules as Pass 1.
 * Used by H5 Split-Trap detection to compare `split → (k+1)` vs `straight-10 → (k+1)` honestly.
 */
interface NextLoadReEval {
  rollOut: number;
  arrival: number;
  pta: number;
  midnightGateMinutes: number;
  violations: Violation[];
  lateMinutes: number;
  homeLateMinutes: number;
  cycleRemainingBefore: number;
  cycleRemainingAfter: number;
  driveRemainingAtCursor: number;
  windowRemainingAtCursor: number;
  blockedByShiftAtPostSplit: boolean;
}

function evaluateNextLoadOutcome(
  history: Segment[],
  cursor: number,
  nl: NormalizedLoad,
  isLast: boolean,
  homeTargetMinute: number | null,
  config: RulesConfig,
  allowSameShiftLaunch: boolean,
): NextLoadReEval {
  const evCursor = evaluate(history, { asOf: cursor, config, forecastDays: 0 });
  const restInfo = earliestResetComplete(history, cursor, config, LIMITS.RESET, false, evCursor);
  const actualRestStart = restInfo.activeRest ? restInfo.activeRest.start : cursor;
  const earliestFresh = restInfo.earliest;
  const wallBeforeArr = singleShiftWallBeforeArrival(nl, config.shortHaul);
  const fitsSingleShift = nl.totalDriveMinutes <= LIMITS.DRIVE && wallBeforeArr <= LIMITS.WINDOW;

  // Determine earliest launch time: when a 10h reset would miss a hard appointment, check whether
  // rolling on the current shift's remaining 11h/14h clocks (symmetric for split and straight-10)
  // is legal without a 10h reset; if 11h/14h blocks it, record the shift block and fall back to fresh 10h.
  let earliestRoll = earliestFresh;
  let blockedByShiftAtPostSplit = false;
  if (
    allowSameShiftLaunch
    && fitsSingleShift
    && cursor < earliestFresh
    && nl.apptMinute !== null
    && earliestFresh + wallBeforeArr > nl.apptMinute
  ) {
    const idealPost = Math.max(cursor, nl.apptMinute - nl.bufferMinutes - wallBeforeArr);
    const postBuilt = buildSingleShiftLoadSegs(history, cursor, idealPost, nl, config);
    const postChk = checkTimelineViolations(history, postBuilt.segs, cursor, postBuilt.pta, config, idealPost - actualRestStart >= LIMITS.RESTART);
    const hasShiftViol = postChk.violations.some((v) => v.kind === 'DRIVE_11' || v.kind === 'WINDOW_14');
    if (!hasShiftViol) {
      earliestRoll = cursor;
    } else {
      blockedByShiftAtPostSplit = true;
    }
  }

  let targetRollOut = earliestRoll;
  if (fitsSingleShift) {
    if (nl.apptMinute !== null) {
      targetRollOut = Math.max(earliestRoll, nl.apptMinute - nl.bufferMinutes - wallBeforeArr);
    } else if (isLast && homeTargetMinute !== null) {
      targetRollOut = Math.max(earliestRoll, homeTargetMinute - (wallBeforeArr + nl.dockMinutes));
    }
  }

  const allow34For = (r: number) => (r - actualRestStart >= LIMITS.RESTART);
  let chosenSegs: Segment[] = [];
  let chosenRollOut = targetRollOut;
  let chosenArrival = targetRollOut + wallBeforeArr;
  let chosenPta = chosenArrival + nl.dockMinutes;
  let midnightGateMinutes = 0;
  let singleShiftLegal = false;

  if (fitsSingleShift) {
    const isFresh = targetRollOut >= earliestFresh;
    const attempt0 = buildSingleShiftLoadSegs(history, cursor, targetRollOut, nl, config, isFresh);
    const chk0 = checkTimelineViolations(history, attempt0.segs, cursor, attempt0.pta, config, allow34For(targetRollOut));
    if (chk0.violations.length === 0) {
      singleShiftLegal = true;
      chosenSegs = attempt0.segs;
      chosenRollOut = targetRollOut;
      chosenArrival = attempt0.arrival;
      chosenPta = attempt0.pta;
    } else if (chk0.violations.every((v) => v.kind === 'CYCLE')) {
      const nextBoundary = nextCarrierDayStart(targetRollOut, config);
      const offToTarget: Segment[] = targetRollOut > cursor
        ? [{ status: 'OFF', start: cursor, end: targetRollOut, tentative: true, note: 'Rest' }]
        : [];
      const evAtTarget = evaluate([...history, ...offToTarget], { asOf: targetRollOut, config, forecastDays: 0 });
      const availBeforeBoundary = Math.max(0, evAtTarget.cycle.remaining);
      const flushRoll = Math.max(targetRollOut, nextBoundary - availBeforeBoundary);
      const restartCompleteAt = actualRestStart + LIMITS.RESTART;

      const workTemplate = attempt0.segs.filter(
        (s) => s.start >= targetRollOut && s.end <= attempt0.arrival,
      );
      const testRoll = (r: number) => {
        const b = r >= earliestFresh
          ? buildShiftedLoadSegs(workTemplate, targetRollOut, attempt0.insertedBreakMinutes, cursor, r, nl)
          : buildSingleShiftLoadSegs(history, cursor, r, nl, config, false);
        const c = checkTimelineViolations(history, b.segs, cursor, b.pta, config, allow34For(r));
        return { b, c };
      };

      const searchMinLegal = (loInit: number, hiInit: number): number => {
        if (hiInit <= loInit) return hiInit;
        if (hiInit - 1 <= loInit || testRoll(hiInit - 1).c.violations.length > 0) return hiInit;
        let lo = loInit;
        let hi = hiInit - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (testRoll(mid).c.violations.length === 0) hi = mid;
          else lo = mid;
        }
        return hi;
      };

      let gatedRoll: number | null = null;
      if (restartCompleteAt > targetRollOut && restartCompleteAt <= nextBoundary && testRoll(restartCompleteAt).c.violations.length === 0) {
        gatedRoll = searchMinLegal(targetRollOut, restartCompleteAt);
      } else if (testRoll(flushRoll).c.violations.length === 0) {
        gatedRoll = searchMinLegal(targetRollOut, flushRoll);
      } else if (nextBoundary > flushRoll && testRoll(nextBoundary).c.violations.length === 0) {
        gatedRoll = searchMinLegal(flushRoll, nextBoundary);
      }

      if (gatedRoll !== null) {
        const built = buildSingleShiftLoadSegs(history, cursor, gatedRoll, nl, config, gatedRoll >= earliestFresh);
        singleShiftLegal = true;
        chosenSegs = built.segs;
        chosenRollOut = gatedRoll;
        chosenArrival = built.arrival;
        chosenPta = built.pta;
        midnightGateMinutes = Math.max(0, gatedRoll - targetRollOut);
      }
    }
  }

  if (!singleShiftLegal) {
    const planned = simulateViaPlanTripAll(history, cursor, earliestFresh, nl, config, 'recaps', false);
    chosenSegs = planned.segs;
    chosenRollOut = planned.rollOut;
    chosenArrival = planned.arrival;
    chosenPta = planned.pta;
    midnightGateMinutes = Math.max(0, chosenRollOut - targetRollOut);
  }

  const finalChk = checkTimelineViolations(history, chosenSegs, cursor, chosenPta, config, allow34For(chosenRollOut));
  const lateMinutes = nl.apptMinute !== null ? Math.max(0, chosenArrival - nl.apptMinute) : 0;
  const homeLateMinutes = isLast && homeTargetMinute !== null ? Math.max(0, chosenPta - homeTargetMinute) : 0;

  return {
    rollOut: chosenRollOut,
    arrival: chosenArrival,
    pta: chosenPta,
    midnightGateMinutes,
    violations: finalChk.violations,
    lateMinutes,
    homeLateMinutes,
    cycleRemainingBefore: evCursor.cycle.remaining,
    cycleRemainingAfter: finalChk.ev.cycle.remaining,
    driveRemainingAtCursor: evCursor.shift.driveRemaining,
    windowRemainingAtCursor: evCursor.shift.windowRemaining,
    blockedByShiftAtPostSplit,
  };
}

/**
 * Evaluate whether a 7/3 or 8/2 split rescues Load `nl` at `cursor` (using `simulateRescue`),
 * AND immediately re-evaluate Load `k+1` under BOTH `split → (k+1)` and `straight-10 → (k+1)`
 * so a Next-Shift Trap fires ONLY when the split is genuinely worse for Load `k+1`.
 */
interface SplitRescueAttempt {
  rescuesCurrent: boolean;
  trapOnNext: boolean;
  strategy: RescueStrategyResult;
  sim: RescueSimulation;
  splitKind: 'split82' | 'split73';
  savedMinutes: number;
  loadSegs: Segment[];
  rollOut: number;
  arrival: number;
  pta: number;
  /** Already-computed engine check at `pta` for `loadSegs` (avoids duplicate `evaluate()`). */
  postSplitChk: { ev: FullEvaluation; violations: Violation[] };
  /** Re-evaluated shortfall / price magnitude on Load k+1 if trapOnNext is true. */
  nextLoadShortfallMinutes: number;
  nextLoadWindowRemaining: number;
  nextLoadDriveRemaining: number;
  nextLoadNeededWindow: number;
  trapCause: 'cycle' | 'drive' | 'window' | 'split_rest' | 'lateness' | null;
  trapPriceLabel: string | null;
  trapDetail: string | null;
}

function trySplitRescueForLoad(
  chainHistory: Segment[],
  cursor: number,
  nl: NormalizedLoad,
  nextLoad: NormalizedLoad | null,
  isNextLast: boolean,
  homeTargetMinute: number | null,
  straight10Segs: Segment[],
  straight10Arrival: number,
  straight10Pta: number,
  config: RulesConfig,
  boundaryWord: string,
): SplitRescueAttempt | null {
  if (nl.apptMinute === null) return null;
  if (nl.totalDriveMinutes <= 0 || nl.totalDriveMinutes > LIMITS.DRIVE) return null;

  // Run the real Split-Sleeper Rescue simulator directly on the post-prior-load history!
  // Pass ONLY driving minutes (never fold ON-duty pre-trip into driving, which would falsely
  // consume the 11-hour driving clock).
  const sim = simulateRescue({
    segments: chainHistory,
    now: cursor,
    config,
    dockWaitMinutes: 0,
    distanceMode: 'hours',
    miles: 0,
    mph: nl.effectiveMph,
    driveMinutesDirect: nl.totalDriveMinutes,
    deadlineMinute: nl.apptMinute,
  });

  // Consider split strategies (8/2 and 7/3) that are HOS-legal and beat straight10
  const splitCandidates = sim.strategies.filter(
    (st) => (st.id === 'split82' || st.id === 'split73') && st.hosLegal && st.pairQualified && st.finishAt < straight10Arrival,
  );
  if (splitCandidates.length === 0) return null;

  // Prefer the split that meets the deadline (earliest finish, tie-break 8/2 for better next-shift clocks)
  splitCandidates.sort((a, b) => {
    if (a.meetsDeadline !== b.meetsDeadline) return a.meetsDeadline ? -1 : 1;
    return a.finishAt - b.finishAt;
  });

  // Evaluate the straight-10 baseline for Load k+1 ONCE (only if nextLoad exists; symmetric same-shift rule!)
  let s10Next: NextLoadReEval | null = null;
  if (nextLoad) {
    const s10History = [...chainHistory, ...asCommitted(straight10Segs)];
    s10Next = evaluateNextLoadOutcome(s10History, straight10Pta, nextLoad, isNextLast, homeTargetMinute, config, true);
  }

  let bestTrap: SplitRescueAttempt | null = null;

  for (const st of splitCandidates) {
    const firstDriveIdx = st.simSegments.findIndex((seg) => seg.status === 'D');
    const driveEndIdx = st.simSegments.reduce((idx, seg, i) => (seg.status === 'D' ? i : idx), -1);
    const beforeDrive = firstDriveIdx > 0 ? st.simSegments.slice(0, firstDriveIdx) : [];
    const driveSegsRaw = firstDriveIdx >= 0 && driveEndIdx >= firstDriveIdx ? st.simSegments.slice(firstDriveIdx, driveEndIdx + 1) : [];
    const trailingFromSim = driveEndIdx >= 0 ? st.simSegments.slice(driveEndIdx + 1) : [];

    const loadSegs: Segment[] = beforeDrive.map((x) => ({ ...x, tentative: true }));
    let t = beforeDrive.length > 0 ? beforeDrive[beforeDrive.length - 1].end : st.releaseAt;
    const rollOut = t;
    if (nl.preTripMinutes > 0) {
      loadSegs.push({ status: 'ON', start: t, end: t + nl.preTripMinutes, tentative: true, note: `${nl.displayName} pre-trip` });
      t += nl.preTripMinutes;
    }
    for (const ds of driveSegsRaw) {
      const len = ds.end - ds.start;
      loadSegs.push({ ...ds, start: t, end: t + len, tentative: true });
      t += len;
    }
    const arrival = t;
    const meetsApptWithPreTrip = arrival <= nl.apptMinute;
    const savedMinutes = Math.max(0, straight10Arrival - arrival);
    const splitKind: 'split82' | 'split73' = st.id === 'split82' ? 'split82' : 'split73';

    const dockStart = Math.max(arrival, nl.apptMinute);
    const receiverPta = dockStart + nl.dockMinutes;
    const dockHasOnDuty = nl.dockMinutes > 0 && !nl.dockOff;
    const dockFree = !dockHasOnDuty;

    let postSplitEnd = receiverPta;
    let trailingRestMin = 0;
    let trailingHasSb = false;
    const fullPostSplitSegs: Segment[] = [...loadSegs];

    if (dockFree && trailingFromSim.length > 0) {
      // Dock-free receiver (dock 0 or dock OFF): no ON-duty work blocks rest after arrival.
      // Model the trailing split leg starting AT ARRIVAL so it absorbs any early wait and
      // OFF-duty dock time — matching the exact schedule accepted by engine evaluate().
      const totalTrailLen = trailingFromSim.reduce((acc, tr) => acc + (tr.end - tr.start), 0);
      trailingHasSb = trailingFromSim.some((tr) => tr.status === 'SB');
      if (trailingHasSb) {
        const sbNote = trailingFromSim.find((tr) => tr.status === 'SB')?.note ?? 'Split long leg (Sleeper Berth ONLY)';
        const sbEnd = arrival + totalTrailLen;
        fullPostSplitSegs.push({
          status: 'SB',
          start: arrival,
          end: sbEnd,
          tentative: true,
          note: sbNote,
        });
        if (receiverPta > sbEnd) {
          fullPostSplitSegs.push({
            status: 'OFF',
            start: sbEnd,
            end: receiverPta,
            tentative: true,
            note: nl.dockMinutes > 0 ? `${nl.displayName} dock` : `${nl.displayName} early wait`,
          });
        }
        postSplitEnd = Math.max(receiverPta, sbEnd);
        trailingRestMin = totalTrailLen;
      } else {
        // Long-first trailing short OFF leg: early wait + OFF-duty dock count toward OFF rest.
        let tOff = arrival;
        if (nl.apptMinute > tOff) {
          fullPostSplitSegs.push({ status: 'OFF', start: tOff, end: nl.apptMinute, tentative: true, note: `${nl.displayName} early wait` });
          tOff = nl.apptMinute;
        }
        if (nl.dockMinutes > 0) {
          fullPostSplitSegs.push({ status: 'OFF', start: tOff, end: tOff + nl.dockMinutes, tentative: true, note: `${nl.displayName} dock` });
          tOff += nl.dockMinutes;
        }
        const needEnd = arrival + totalTrailLen;
        if (needEnd > tOff) {
          fullPostSplitSegs.push({
            status: 'OFF',
            start: tOff,
            end: needEnd,
            tentative: true,
            note: trailingFromSim[0].note,
          });
          tOff = needEnd;
        }
        postSplitEnd = tOff;
        trailingRestMin = Math.max(0, postSplitEnd - receiverPta);
      }
    } else {
      // ON-duty dock present (or no trailing split leg): emit early wait + dock first,
      // then start any trailing split leg after the ON-duty dock completes.
      let tPost = arrival;
      if (nl.apptMinute > tPost) {
        fullPostSplitSegs.push({ status: 'OFF', start: tPost, end: nl.apptMinute, tentative: true, note: `${nl.displayName} early wait` });
        tPost = nl.apptMinute;
      }
      if (nl.dockMinutes > 0) {
        fullPostSplitSegs.push({
          status: nl.dockOff ? 'OFF' : 'ON',
          start: tPost,
          end: tPost + nl.dockMinutes,
          tentative: true,
          note: `${nl.displayName} dock`,
        });
        tPost += nl.dockMinutes;
      }
      postSplitEnd = tPost;
      for (const tr of trailingFromSim) {
        const len = tr.end - tr.start;
        fullPostSplitSegs.push({
          status: tr.status,
          start: postSplitEnd,
          end: postSplitEnd + len,
          tentative: true,
          note: tr.note,
        });
        postSplitEnd += len;
        trailingRestMin += len;
        if (tr.status === 'SB') trailingHasSb = true;
      }
    }

    // Verify full split load legality through the real engine!
    const chk = checkTimelineViolations(chainHistory, fullPostSplitSegs, cursor, postSplitEnd, config, false);
    if (chk.violations.length > 0) continue;

    // NEXT-SHIFT TRAP CHECK BY OUTCOMES ONLY (H5): compare `split → (k+1)` vs `straight-10 → (k+1)`
    // strictly on outcomes (violations, appointment lateness, home lateness, arrival/PTA when no appt).
    // Hold length (`midnightGateMinutes`) and raw remaining cycle never enter the comparison.
    let trapOnNext = false;
    let nextLoadShortfallMinutes = 0;
    let nextLoadWindowRemaining = chk.ev.shift.windowRemaining;
    let nextLoadDriveRemaining = chk.ev.shift.driveRemaining;
    let nextLoadNeededWindow = 0;
    let trapCause: SplitRescueAttempt['trapCause'] = null;
    let trapPriceLabel: string | null = null;
    let trapDetail: string | null = null;

    if (nextLoad && s10Next) {
      nextLoadNeededWindow = singleShiftWallBeforeArrival(nextLoad, config.shortHaul);
      const postSplitHistory = [...chainHistory, ...asCommitted(fullPostSplitSegs)];
      const splitNext = evaluateNextLoadOutcome(
        postSplitHistory,
        postSplitEnd,
        nextLoad,
        isNextLast,
        homeTargetMinute,
        config,
        true,
      );
      nextLoadWindowRemaining = splitNext.windowRemainingAtCursor;
      nextLoadDriveRemaining = splitNext.driveRemainingAtCursor;

      const worseViolations = splitNext.violations.length > s10Next.violations.length;
      const worseApptLate = splitNext.lateMinutes > s10Next.lateMinutes;
      const worseHomeLate = splitNext.homeLateMinutes > s10Next.homeLateMinutes;
      const worseFinishNoAppt =
        nextLoad.apptMinute === null && (splitNext.arrival > s10Next.arrival || splitNext.pta > s10Next.pta);

      if (worseViolations || worseApptLate || worseHomeLate || worseFinishNoAppt) {
        trapOnNext = true;
        const splitLabel = splitKind === 'split82' ? '8/2' : '7/3';
        const splitArticle = splitKind === 'split82' ? 'An' : 'A';
        const hasCycleViol = splitNext.violations.some((v) => v.kind === 'CYCLE');
        const hasDriveViol = splitNext.violations.some((v) => v.kind === 'DRIVE_11');
        const hasWinViol = splitNext.violations.some((v) => v.kind === 'WINDOW_14');
        const lateDelta = Math.max(0, splitNext.lateMinutes - s10Next.lateMinutes);
        const homeDelta = Math.max(0, splitNext.homeLateMinutes - s10Next.homeLateMinutes);
        const finishDelta = Math.max(0, splitNext.arrival - s10Next.arrival, splitNext.pta - s10Next.pta);
        const outcomeDelta = Math.max(lateDelta, homeDelta, finishDelta);
        const s10OutcomePhrase = s10Next.lateMinutes === 0 && nextLoad.apptMinute !== null
          ? 'on time on straight 10'
          : s10Next.lateMinutes > 0
            ? `${dur(s10Next.lateMinutes)} late on straight 10`
            : s10Next.homeLateMinutes === 0 && isNextLast && homeTargetMinute !== null
              ? 'on time for home on straight 10'
              : `${dur(outcomeDelta)} earlier on straight 10`;

        if (hasCycleViol) {
          trapCause = 'cycle';
          nextLoadShortfallMinutes = Math.max(1, outcomeDelta, splitNext.lateMinutes, splitNext.homeLateMinutes);
          trapPriceLabel = splitNext.lateMinutes > 0
            ? `Late ${dur(splitNext.lateMinutes)} on ${nextLoad.displayName} (cycle wall)`
            : `Cycle violation on ${nextLoad.displayName}`;
          trapDetail =
            `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
            + `but leaves only ${dur(splitNext.cycleRemainingBefore)} of cycle before ${nextLoad.displayName} — `
            + `triggering a ${boundaryWord} cycle violation on ${nextLoad.displayName} (vs. ${s10OutcomePhrase}).`;
        } else if (hasDriveViol || (splitNext.blockedByShiftAtPostSplit && nextLoadDriveRemaining < nextLoad.totalDriveMinutes)) {
          trapCause = 'drive';
          const drvShort = Math.max(0, nextLoad.totalDriveMinutes - nextLoadDriveRemaining);
          nextLoadShortfallMinutes = outcomeDelta > 0 ? outcomeDelta : drvShort;
          trapPriceLabel = lateDelta > 0
            ? (s10Next.lateMinutes === 0
                ? `Late ${dur(splitNext.lateMinutes)} on ${nextLoad.displayName} (11h drive)`
                : `+${dur(lateDelta)} later on ${nextLoad.displayName} (11h drive)`)
            : `Short ${dur(drvShort)} drive on ${nextLoad.displayName}`;
          trapDetail =
            `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
            + `but leaves only ${dur(nextLoadDriveRemaining)} of 11-hour driving for ${nextLoad.displayName} `
            + `(needs ${dur(nextLoad.totalDriveMinutes)}) — ${outcomeDelta > 0 ? `making ${nextLoad.displayName} ${dur(outcomeDelta)} later (${s10OutcomePhrase})` : `short ${dur(drvShort)}`}.`;
        } else if (hasWinViol || splitNext.blockedByShiftAtPostSplit) {
          trapCause = 'window';
          const winShort = Math.max(0, nextLoadNeededWindow - nextLoadWindowRemaining);
          nextLoadShortfallMinutes = outcomeDelta > 0 ? outcomeDelta : winShort;
          trapPriceLabel = lateDelta > 0
            ? (s10Next.lateMinutes === 0
                ? `Late ${dur(splitNext.lateMinutes)} on ${nextLoad.displayName} (14h window)`
                : `+${dur(lateDelta)} later on ${nextLoad.displayName} (14h window)`)
            : `Short ${dur(winShort)} window on ${nextLoad.displayName}`;
          trapDetail =
            `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
            + `but leaves only ${dur(nextLoadWindowRemaining)} on your 14-hour window for ${nextLoad.displayName} `
            + `(needs ${dur(nextLoadNeededWindow)}) — ${outcomeDelta > 0 ? `making ${nextLoad.displayName} ${dur(outcomeDelta)} later (${s10OutcomePhrase})` : `short ${dur(winShort)}`}.`;
        } else if (postSplitEnd > straight10Pta && trailingRestMin > 0) {
          trapCause = 'split_rest';
          const restKindText = trailingHasSb ? `${dur(trailingRestMin)} split SB` : `${dur(trailingRestMin)} split rest`;
          const restPhrase = trailingHasSb
            ? (dockHasOnDuty
                ? `completing the ${dur(trailingRestMin)} sleeper berth leg after ${nl.displayName}'s dock`
                : `completing the ${dur(trailingRestMin)} sleeper berth leg`)
            : (dockHasOnDuty
                ? `completing the ${dur(trailingRestMin)} split rest leg after ${nl.displayName}'s dock`
                : `completing the ${dur(trailingRestMin)} split rest leg`);
          nextLoadShortfallMinutes = Math.max(1, outcomeDelta);
          if (worseApptLate) {
            trapPriceLabel = s10Next.lateMinutes === 0
              ? `Late ${dur(splitNext.lateMinutes)} on ${nextLoad.displayName} (${restKindText})`
              : `+${dur(lateDelta)} later on ${nextLoad.displayName} (${restKindText})`;
            trapDetail =
              `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
              + `but ${restPhrase} delays ${nextLoad.displayName} — `
              + `leaving ${nextLoad.displayName} ${dur(splitNext.lateMinutes)} late (vs. ${s10OutcomePhrase}).`;
          } else if (worseHomeLate) {
            trapPriceLabel = `+${dur(homeDelta)} past home (${restKindText})`;
            trapDetail =
              `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
              + `but ${restPhrase} delays ${nextLoad.displayName} — `
              + `putting you ${dur(splitNext.homeLateMinutes)} past home (vs. ${s10OutcomePhrase}).`;
          } else {
            trapPriceLabel = `+${dur(finishDelta)} later on ${nextLoad.displayName} (${restKindText})`;
            trapDetail =
              `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
              + `but ${restPhrase} pushes ${nextLoad.displayName} ${dur(finishDelta)} later than straight 10.`;
          }
        } else {
          trapCause = 'lateness';
          nextLoadShortfallMinutes = Math.max(1, outcomeDelta);
          trapPriceLabel = worseApptLate && s10Next.lateMinutes === 0
            ? `Late ${dur(splitNext.lateMinutes)} on ${nextLoad.displayName}`
            : `+${dur(nextLoadShortfallMinutes)} later on ${nextLoad.displayName}`;
          trapDetail =
            `${splitArticle} ${splitLabel} split saves ${nl.displayName} by ${dur(savedMinutes)}, `
            + `but pushes ${nextLoad.displayName} ${dur(nextLoadShortfallMinutes)} later than a straight 10 `
            + `(${worseApptLate ? `${dur(splitNext.lateMinutes)} late vs. ${s10OutcomePhrase}` : s10OutcomePhrase}).`;
        }
      }
    }

    const attempt: SplitRescueAttempt = {
      rescuesCurrent: meetsApptWithPreTrip,
      trapOnNext,
      strategy: st,
      sim,
      splitKind,
      savedMinutes,
      loadSegs: fullPostSplitSegs,
      rollOut,
      arrival,
      pta: postSplitEnd,
      postSplitChk: chk,
      nextLoadShortfallMinutes,
      nextLoadWindowRemaining,
      nextLoadDriveRemaining,
      nextLoadNeededWindow,
      trapCause,
      trapPriceLabel,
      trapDetail,
    };

    if (!trapOnNext && meetsApptWithPreTrip) {
      return attempt; // Clean rescue with NO trap on Load k+1!
    }
    if (
      meetsApptWithPreTrip
      && (!bestTrap || attempt.nextLoadShortfallMinutes < bestTrap.nextLoadShortfallMinutes)
    ) {
      bestTrap = attempt;
    }
  }

  return bestTrap;
}

/**
 * Compute open-night shift fill for a finished strategy (extracted so candidate reset34 passes can skip it).
 */
function computeOpenNightsForStrategy(
  chainHistory: Segment[],
  now: number,
  cursor: number,
  endLoadsMinute: number,
  activeLoadsCount: number,
  config: RulesConfig,
  homeTz: string,
  draft: WeekPlanDraft,
  homeTargetMinute: number | null,
  strategyId: WeekStrategyId,
  fallbackCycleRemaining: number,
): { openNights: WeekOpenNight[]; cycleRemainingAfterOpenNights: number } {
  const openNights: WeekOpenNight[] = [];
  let cycleRemainingAfterOpenNights = fallbackCycleRemaining;
  if (!draft.fillOpenNights) return { openNights, cycleRemainingAfterOpenNights };

  const horizonEnd = homeTargetMinute !== null ? homeTargetMinute : Math.max(now, cursor) + 5 * 1440;
  const hasOpenTime = activeLoadsCount === 0 || (homeTargetMinute !== null && horizonEnd - endLoadsMinute >= 20 * 60);
  if (!hasOpenTime) return { openNights, cycleRemainingAfterOpenNights };

  const recapFromCursor = projectRecapVs34({
    segments: chainHistory,
    now: Math.max(now, cursor),
    config,
    defaultShiftMinutes: draft.usualShiftBudgetMinutes,
    shiftStartMinutes: draft.usualShiftStartMinutes,
    resetStart: Math.max(now, cursor),
    homeTargetShifts: null,
  });
  const proj = strategyId === 'reset34' && activeLoadsCount === 0 ? recapFromCursor.reset34 : recapFromCursor.recaps;
  for (const sh of proj.shifts) {
    if (sh.shiftStart < endLoadsMinute + (activeLoadsCount > 0 ? LIMITS.RESET : 0)) continue;
    if (homeTargetMinute !== null && sh.shiftEnd > homeTargetMinute + 60) break;
    if (openNights.length >= 5) break;
    openNights.push({
      index: openNights.length,
      label: sh.label,
      shortLabel: sh.shortLabel,
      dayShort: sh.dayShort,
      shiftStart: formatDualTime(sh.shiftStart, homeTz, homeTz),
      plannedMinutes: sh.plannedMinutes,
      usableMinutes: sh.usableMinutes,
      pinched: sh.pinched,
      shortfallMinutes: sh.shortfallMinutes,
      dropsOffMinutes: sh.dropsOffAtDayStart + sh.dropsOffAtNextRoll,
      availAfterMinutes: Math.max(0, sh.availAfterRoll - sh.usableLeg2),
      blockedByReset: sh.blockedByReset,
    });
  }
  if (openNights.length > 0) {
    cycleRemainingAfterOpenNights = openNights[openNights.length - 1].availAfterMinutes;
  }
  return { openNights, cycleRemainingAfterOpenNights };
}

/**
 * Run one complete strategy pass (`recaps` or `reset34` at a given placement) across all active loads
 * and optional open-night fill.
 */
/** Internal cache of per-load end evaluations for prefix reuse across strategy passes (H1). */
const strategyLoadEvals = new WeakMap<WeekStrategyResult, FullEvaluation[]>();

function runWeekStrategy(
  prunedLogged: Segment[],
  now: number,
  config: RulesConfig,
  homeTz: string,
  boundaryWord: string,
  activeLoads: NormalizedLoad[],
  draft: WeekPlanDraft,
  homeTargetMinute: number | null,
  strategyId: WeekStrategyId,
  forcedResetBeforeIdx: number | null,
  skipOpenNights = false,
  reusePrefixFrom?: WeekStrategyResult | null,
  reusePrefixCount?: number,
  startingEvalAtNow?: FullEvaluation | null,
  stopAfterIdx?: number,
  abortIfWorseThan?: { violations: number; missedApptCount: number; totalApptLateMinutes: number } | null,
): {
  result: WeekStrategyResult;
  detectedSplitTraps: { loadIndex: number; loadName: string; nextLoadName: string; attempt: SplitRescueAttempt }[];
  endChainHistory: Segment[];
  endCursor: number;
  aborted?: boolean;
} {
  let chainHistory: Segment[] = [...prunedLogged];
  const allSimSegs: Segment[] = [];
  const outcomes: WeekLoadOutcome[] = [];
  const loadEvals: FullEvaluation[] = [];
  const detectedSplitTraps: { loadIndex: number; loadName: string; nextLoadName: string; attempt: SplitRescueAttempt }[] = [];

  let cursor = now;
  let resetPlacement: WeekStrategyResult['resetPlacement'] = null;
  let startIdx = 0;
  let cursorEval: FullEvaluation | null = startingEvalAtNow ?? null;
  const endLoopIdx = stopAfterIdx !== undefined ? Math.min(activeLoads.length, stopAfterIdx + 1) : activeLoads.length;
  let runningViols = 0;
  let runningMissed = 0;
  let runningLate = 0;

  // H1: Reuse unchanged prefix loads from an already-computed strategy (e.g. `recaps` loads 0..k-1
  // for `reset34` placement at `k`, or unchanged prefix loads from a prior `reset34` candidate).
  const prefixLen = reusePrefixCount !== undefined
    ? Math.min(reusePrefixCount, endLoopIdx)
    : (strategyId === 'reset34' && forcedResetBeforeIdx !== null ? Math.min(forcedResetBeforeIdx, endLoopIdx) : 0);
  if (
    prefixLen > 0
    && reusePrefixFrom
    && reusePrefixFrom.loads.length >= prefixLen
  ) {
    const prevEvals = strategyLoadEvals.get(reusePrefixFrom);
    startIdx = prefixLen;
    if (strategyId === 'reset34' && reusePrefixFrom.id === 'reset34' && reusePrefixFrom.resetPlacement && forcedResetBeforeIdx !== null && startIdx > forcedResetBeforeIdx) {
      resetPlacement = reusePrefixFrom.resetPlacement;
    }
    for (let j = 0; j < startIdx; j++) {
      const prevOut = reusePrefixFrom.loads[j];
      outcomes.push(prevOut);
      if (prevEvals?.[j]) loadEvals.push(prevEvals[j]);
      allSimSegs.push(...prevOut.simSegments);
      chainHistory.push(...asCommitted(prevOut.simSegments));
      cursor = prevOut.pta.minute;
      if (prevOut.violations.length > 0) runningViols += prevOut.violations.length;
      if (!prevOut.meetsAppt) {
        runningMissed++;
        if (prevOut.apptSlackMinutes !== null && prevOut.apptSlackMinutes < 0) {
          runningLate += Math.abs(prevOut.apptSlackMinutes);
        }
      }
    }
    cursorEval = prevEvals?.[startIdx - 1] ?? null;
  }

  for (let i = startIdx; i < endLoopIdx; i++) {
    const nl = activeLoads[i];
    const nextLoad = i + 1 < activeLoads.length ? activeLoads[i + 1] : null;
    const isLastLoad = i === activeLoads.length - 1;
    const isNextLast = i + 1 === activeLoads.length - 1;

    // Determine whether Strategy B forces a 34-hour restart before this load
    const force34Here = strategyId === 'reset34' && forcedResetBeforeIdx === i;
    const restInfo = earliestResetComplete(
      chainHistory,
      cursor,
      config,
      force34Here ? LIMITS.RESTART : LIMITS.RESET,
      i === 0,
      cursorEval,
    );
    const earliestRoll = restInfo.earliest;
    // H2: Measure 34h restart eligibility from the start of the driver's ACTUAL current/last rest
    // (including OFF/SB logged before `now`), NOT from `cursor`.
    const actualRestStart = restInfo.activeRest ? restInfo.activeRest.start : cursor;
    const allow34For = (r: number) => force34Here || (r - actualRestStart >= LIMITS.RESTART);

    if (force34Here) {
      const rStart = actualRestStart;
      const rEnd = earliestRoll;
      resetPlacement = {
        beforeLoadIndex: i,
        label: i === 0 ? `Before ${nl.displayName}` : `After ${activeLoads[i - 1].displayName} (before ${nl.displayName})`,
        start: formatDualTime(rStart, homeTz, homeTz),
        end: formatDualTime(rEnd, homeTz, homeTz),
      };
    }

    const wallBeforeArr = singleShiftWallBeforeArrival(nl, config.shortHaul);
    const fitsSingleShift = nl.totalDriveMinutes <= LIMITS.DRIVE && wallBeforeArr <= LIMITS.WINDOW;

    // Exact 0-cost pre-check for branch-and-bound trade verification:
    // Load i cannot arrive earlier than `cursor + wallBeforeArr` (or `earliestRoll + wallBeforeArr`
    // when a 34h restart is forced here) — abort before any `evaluate()` call if already strictly worse.
    if (abortIfWorseThan && nl.apptMinute !== null) {
      const minArrival = (force34Here ? earliestRoll : cursor) + wallBeforeArr;
      if (minArrival > nl.apptMinute && abortIfWorseThan.violations === 0 && runningViols === 0) {
        const minMissedNow = runningMissed + 1;
        const minLateNow = runningLate + (minArrival - nl.apptMinute);
        if (
          minMissedNow > abortIfWorseThan.missedApptCount
          || (minMissedNow === abortIfWorseThan.missedApptCount && minLateNow > abortIfWorseThan.totalApptLateMinutes)
        ) {
          return {
            result: {
              id: strategyId,
              label: strategyId === 'recaps' ? 'A · Run Recaps' : 'B · Fit a 34',
              resetPlacement,
              loads: outcomes,
              openNights: [],
              totalMiles: 0,
              totalDriveMinutes: 0,
              endMinute: cursor,
              endTime: formatDualTime(cursor, homeTz, homeTz),
              cycleRemainingAtEnd: 0,
              cycleRemainingAfterOpenNights: 0,
              homeCheck: null,
              missedApptCount: minMissedNow,
              totalApptLateMinutes: minLateNow,
              maxApptLateMinutes: 0,
              minApptSlackMinutes: null,
              minLoadCycleRemaining: 0,
              usesSplit: false,
              totalMidnightGateMinutes: 0,
              simSegments: allSimSegs,
              finalEvaluation: restInfo.ev,
              violations: [],
              allLoadsLegalAndOnTime: false,
            },
            detectedSplitTraps,
            endChainHistory: chainHistory,
            endCursor: cursor,
            aborted: true,
          };
        }
      }
    }

    // Determine unconstrained target roll-out
    let targetRollOut = earliestRoll;
    if (fitsSingleShift) {
      if (nl.apptMinute !== null) {
        const ideal = nl.apptMinute - nl.bufferMinutes - wallBeforeArr;
        targetRollOut = Math.max(earliestRoll, ideal);
      } else if (isLastLoad && homeTargetMinute !== null) {
        const ideal = homeTargetMinute - (wallBeforeArr + nl.dockMinutes);
        targetRollOut = Math.max(earliestRoll, ideal);
      }
    }

    let chosenSegs: Segment[] = [];
    let chosenRollOut = targetRollOut;
    let chosenArrival = targetRollOut + wallBeforeArr;
    let chosenPta = chosenArrival + nl.dockMinutes;
    let chosenBreak = 0;
    let chosenChk: { ev: FullEvaluation; violations: Violation[] } | null = null;
    let midnightGateMinutes = 0;
    let midnightGateKind: 'recap' | 'restart34' | null = null;
    let midnightGateBoundary: DualTime | null = null;
    let midnightGateDropOffMinutes = 0;
    let usedSplit = false;
    let splitKind: 'split82' | 'split73' | null = null;
    let splitOrderLabel: string | null = null;
    let splitTrapDetected = false;
    let splitTrapDetail: string | null = null;

    let singleShiftLegal = false;

    if (fitsSingleShift) {
      const isFresh = targetRollOut >= earliestRoll;
      const attempt0 = buildSingleShiftLoadSegs(chainHistory, cursor, targetRollOut, nl, config, isFresh);
      const chk0 = checkTimelineViolations(chainHistory, attempt0.segs, cursor, attempt0.pta, config, allow34For(targetRollOut));

      if (chk0.violations.length === 0) {
        singleShiftLegal = true;
        chosenSegs = attempt0.segs;
        chosenRollOut = targetRollOut;
        chosenArrival = attempt0.arrival;
        chosenPta = attempt0.pta;
        chosenBreak = attempt0.insertedBreakMinutes;
        chosenChk = chk0;
      } else if (chk0.violations.every((v) => v.kind === 'CYCLE')) {
        // Midnight / carrier-day recap gating (and natural 34h completion when logged rest reaches 34h)!
        const nextBoundary = nextCarrierDayStart(targetRollOut, config);
        const offToTarget: Segment[] =
          targetRollOut > cursor
            ? [{ status: 'OFF', start: cursor, end: targetRollOut, tentative: true, note: 'Rest' }]
            : [];
        const evAtTarget = targetRollOut === cursor && restInfo.ev.cycle.forecast.length >= 2
          ? restInfo.ev
          : evaluate([...chainHistory, ...offToTarget], { asOf: targetRollOut, config, forecastDays: 2 });
        const availBeforeBoundary = Math.max(0, evAtTarget.cycle.remaining);
        const dropEntry = evAtTarget.cycle.forecast.find((f) => f.dayStart === nextBoundary);
        const dropAtBoundary = dropEntry?.dropsOff ?? 0;

        // Candidate 1: exact boundary-flush minute `nextBoundary - availBeforeBoundary`
        const flushRoll = Math.max(targetRollOut, nextBoundary - availBeforeBoundary);
        // Candidate 0 (H2): natural 34h restart completion from actualRestStart if it lands before nextBoundary
        const restartCompleteAt = actualRestStart + LIMITS.RESTART;

        // H1: Reuse `attempt0`'s work/break template and fast engine `cycleViolations` check inside hold search;
        // verify the final chosen `gatedRoll` through full `checkTimelineViolations` (`evaluate()`).
        const workTemplate = attempt0.segs.filter(
          (s) => s.start >= targetRollOut && s.end <= attempt0.arrival,
        );
        const isCycleLegal = (r: number): boolean => {
          const b = buildShiftedLoadSegs(workTemplate, targetRollOut, attempt0.insertedBreakMinutes, cursor, r, nl);
          return !hasCycleViolationAfter(chainHistory, b.segs, cursor, config, allow34For(r));
        };
        const maxShiftOff =
          (config.shortHaul ? 0 : LIMITS.BREAK_LEN)
          + (nl.pickupDwellOff ? nl.pickupDwellMinutes : 0)
          + (nl.dockOff ? nl.dockMinutes : 0);
        const searchMinLegal = (loInit: number, hiInit: number): number => {
          if (hiInit <= loInit || hiInit - 1 <= loInit) return hiInit;
          if (!isCycleLegal(hiInit - 1)) return hiInit;
          let lo = loInit;
          let hi = hiInit - 1;
          const tightLo = Math.max(loInit, hiInit - maxShiftOff - 1);
          if (tightLo > lo && !isCycleLegal(tightLo)) {
            lo = tightLo;
          }
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (isCycleLegal(mid)) hi = mid;
            else lo = mid;
          }
          return hi;
        };

        let gatedRoll: number | null = null;
        let gateBoundaryMin = nextBoundary;
        let gateDropOffMin = dropAtBoundary;

        if (restartCompleteAt > targetRollOut && restartCompleteAt <= nextBoundary && isCycleLegal(restartCompleteAt)) {
          gatedRoll = searchMinLegal(targetRollOut, restartCompleteAt);
        }
        if (gatedRoll === null) {
          if (isCycleLegal(flushRoll)) {
            gatedRoll = searchMinLegal(targetRollOut, flushRoll);
          } else if (nextBoundary > flushRoll && isCycleLegal(nextBoundary)) {
            gatedRoll = searchMinLegal(flushRoll, nextBoundary);
          }
        }
        if (gatedRoll === null) {
          const nextBoundary2 = nextCarrierDayStart(nextBoundary, config);
          if (restartCompleteAt > nextBoundary && restartCompleteAt <= nextBoundary2 && isCycleLegal(restartCompleteAt)) {
            gatedRoll = searchMinLegal(nextBoundary, restartCompleteAt);
          }
          if (gatedRoll === null) {
            const availAtB1 = Math.max(0, dropEntry?.availableAtStart ?? (availBeforeBoundary + dropAtBoundary));
            const flushRoll2 = Math.max(nextBoundary, nextBoundary2 - availAtB1);
            if (isCycleLegal(flushRoll2)) {
              gatedRoll = searchMinLegal(nextBoundary, flushRoll2);
              gateBoundaryMin = nextBoundary2;
              gateDropOffMin = evAtTarget.cycle.forecast.find((f) => f.dayStart === nextBoundary2)?.dropsOff ?? 0;
            } else if (nextBoundary2 > flushRoll2 && isCycleLegal(nextBoundary2)) {
              gatedRoll = searchMinLegal(flushRoll2, nextBoundary2);
              gateBoundaryMin = nextBoundary2;
              gateDropOffMin = evAtTarget.cycle.forecast.find((f) => f.dayStart === nextBoundary2)?.dropsOff ?? 0;
            }
          }
        }

        if (gatedRoll !== null) {
          const built = buildShiftedLoadSegs(workTemplate, targetRollOut, attempt0.insertedBreakMinutes, cursor, gatedRoll, nl);
          const fullChk = checkTimelineViolations(chainHistory, built.segs, cursor, built.pta, config, allow34For(gatedRoll));
          if (fullChk.violations.length === 0) {
            singleShiftLegal = true;
            chosenSegs = built.segs;
            chosenRollOut = gatedRoll;
            chosenArrival = built.arrival;
            chosenPta = built.pta;
            chosenBreak = built.insertedBreakMinutes;
            chosenChk = fullChk;
            midnightGateMinutes = Math.max(0, gatedRoll - targetRollOut);
            if (midnightGateMinutes > 0) {
              const isRestartWait =
                restartCompleteAt > targetRollOut
                && gatedRoll >= restartCompleteAt
                && hasCycleViolationAfter(chainHistory, built.segs, cursor, config, false);
              if (isRestartWait) {
                midnightGateKind = 'restart34';
                midnightGateBoundary = formatDualTime(restartCompleteAt, homeTz, nl.apptTimeZone);
                midnightGateDropOffMinutes = 0;
              } else {
                midnightGateKind = 'recap';
                midnightGateBoundary = formatDualTime(gateBoundaryMin, homeTz, nl.apptTimeZone);
                midnightGateDropOffMinutes = gateDropOffMin;
              }
            }
          }
        }
      }
    }

    // Fallback to engine's `planTrip()` when load is multi-shift or needs multi-day recap wait
    if (!singleShiftLegal) {
      const planned = simulateViaPlanTripAll(
        chainHistory,
        cursor,
        earliestRoll,
        nl,
        config,
        strategyId,
        draft.allowSplits,
      );
      chosenSegs = planned.segs;
      chosenRollOut = planned.rollOut;
      chosenArrival = planned.arrival;
      chosenPta = planned.pta;
      chosenBreak = planned.insertedBreakMinutes;
      chosenChk = null;
      usedSplit = planned.usedSplit;
      if (usedSplit) {
        splitKind = planned.splitKind;
        splitOrderLabel = planned.splitOrderLabel;
      }
    }

    // Same-shift continuation check (when a 10h reset misses a hard appointment, check if Load i legally
    // fits on the current shift's remaining 11h/14h/70h clocks at its ideal roll-out before splitting).
    if (
      !force34Here
      && !usedSplit
      && fitsSingleShift
      && nl.apptMinute !== null
      && chosenArrival > nl.apptMinute
      && cursor < earliestRoll
    ) {
      const idealSame = Math.max(cursor, nl.apptMinute - nl.bufferMinutes - wallBeforeArr);
      const canFitShiftClocks =
        restInfo.ev.shift.driveRemaining >= nl.totalDriveMinutes
        && restInfo.ev.shift.windowRemaining >= (idealSame - cursor) + wallBeforeArr;
      if (idealSame < chosenRollOut && canFitShiftClocks) {
        const sameBuilt = buildSingleShiftLoadSegs(chainHistory, cursor, idealSame, nl, config, false);
        const sameChk = checkTimelineViolations(chainHistory, sameBuilt.segs, cursor, sameBuilt.pta, config, allow34For(idealSame));
        if (sameChk.violations.length === 0 && sameBuilt.arrival < chosenArrival) {
          chosenSegs = sameBuilt.segs;
          chosenRollOut = idealSame;
          chosenArrival = sameBuilt.arrival;
          chosenPta = sameBuilt.pta;
          chosenBreak = sameBuilt.insertedBreakMinutes;
          chosenChk = sameChk;
          midnightGateMinutes = 0;
          midnightGateKind = null;
          midnightGateBoundary = null;
          midnightGateDropOffMinutes = 0;
        }
      }
    }

    // Tight-handoff Split-Sleeper Rescue Pass (ONLY when `draft.allowSplits === true`!)
    // Triggered when a straight 10 misses Load k's hard appointment AND a split can plausibly rescue it:
    // - A 2h-short-leg split saves at most 8h (480m) vs a 10h rest, so if straight-10 arrival is already
    //   more than 8h30m past the appointment (e.g. pushed late by an earlier 34h reset), no split can meet it.
    // - And if the load was delayed past its appointment purely by a cycle gate (not a 10h rest), a split
    //   cannot create cycle hours.
    const lateByPreSplit = nl.apptMinute !== null ? chosenArrival - nl.apptMinute : 0;
    const splitPlausible =
      lateByPreSplit > 0
      && lateByPreSplit <= (LIMITS.RESET - LIMITS.SPLIT_MIN_SHORT) + 30
      && (midnightGateMinutes === 0 || lateByPreSplit - midnightGateMinutes > 0);
    if (
      draft.allowSplits
      && !force34Here
      && !usedSplit
      && nl.apptMinute !== null
      && splitPlausible
    ) {
      const rescueAttempt = trySplitRescueForLoad(
        chainHistory,
        cursor,
        nl,
        nextLoad,
        isNextLast,
        homeTargetMinute,
        chosenSegs,
        chosenArrival,
        chosenPta,
        config,
        boundaryWord,
      );
      if (rescueAttempt) {
        if (rescueAttempt.trapOnNext && nextLoad) {
          // Split saves Load k BUT is genuinely worse for Load k+1 under re-evaluation — flag Split Trap!
          splitTrapDetected = true;
          splitTrapDetail = rescueAttempt.trapDetail;
          detectedSplitTraps.push({
            loadIndex: i,
            loadName: nl.displayName,
            nextLoadName: nextLoad.displayName,
            attempt: rescueAttempt,
          });
        } else if (rescueAttempt.rescuesCurrent) {
          // Clean split rescue with no trap on Load k+1!
          // M2: Clear stale Pass-1 hold fields when a split replaces the plan.
          chosenSegs = rescueAttempt.loadSegs;
          chosenRollOut = rescueAttempt.rollOut;
          chosenArrival = rescueAttempt.arrival;
          chosenPta = rescueAttempt.pta;
          chosenChk = rescueAttempt.postSplitChk;
          usedSplit = true;
          splitKind = rescueAttempt.splitKind;
          splitOrderLabel = rescueAttempt.strategy.orderLabel;
          midnightGateMinutes = 0;
          midnightGateKind = null;
          midnightGateBoundary = null;
          midnightGateDropOffMinutes = 0;
        }
      }
    }

    // M2 invariant: never report a hold to a time at or before the unconstrained roll-out.
    if (midnightGateMinutes > 0 && chosenRollOut <= targetRollOut) {
      midnightGateMinutes = 0;
      midnightGateKind = null;
      midnightGateBoundary = null;
      midnightGateDropOffMinutes = 0;
    }

    // Final engine evaluation at Load k's PTA (H1: reuse already-verified `chosenChk` when exact!)
    const allow34Check = allow34For(chosenRollOut) || strategyId === 'reset34';
    const finalLoadChk = chosenChk && (allow34Check === allow34For(chosenRollOut) || chosenChk.violations.length === 0)
      ? chosenChk
      : checkTimelineViolations(chainHistory, chosenSegs, cursor, chosenPta, config, allow34Check);

    const apptSlackMinutes = nl.apptMinute !== null ? nl.apptMinute - chosenArrival : null;
    const meetsAppt = apptSlackMinutes === null || apptSlackMinutes >= 0;

    // Check parking sweet spot (08:00–10:00 in facility local time at PTA shutdown)
    const ptaLocalMin = wallMinutesInZone(chosenPta, nl.apptTimeZone);
    const ptaInSweetSpot = ptaLocalMin >= SWEET_SPOT_START_MIN && ptaLocalMin <= SWEET_SPOT_END_MIN;

    const restAfterMinutes = LIMITS.RESET;
    const restAfterEndMin = chosenPta + restAfterMinutes;

    let statusTone: 'good' | 'warn' | 'bad' = 'good';
    let statusBadge = 'On time';
    if (finalLoadChk.violations.length > 0) {
      statusTone = 'bad';
      const firstKind = finalLoadChk.violations[0].kind;
      statusBadge = firstKind === 'CYCLE' ? 'Cycle wall' : 'HOS limit';
    } else if (!meetsAppt && apptSlackMinutes !== null) {
      statusTone = 'bad';
      statusBadge = `Late ${dur(Math.abs(apptSlackMinutes))}`;
    } else if (usedSplit) {
      statusTone = 'warn';
      statusBadge = splitKind === 'split82' ? 'Needs 8/2 split' : 'Needs 7/3 split';
    } else if (midnightGateMinutes > 0) {
      statusTone = 'warn';
      const gateTag = midnightGateKind === 'restart34'
        ? `34h wait +${dur(midnightGateMinutes)}`
        : `Gated +${dur(midnightGateMinutes)}`;
      statusBadge = apptSlackMinutes !== null
        ? `${gateTag} · +${dur(apptSlackMinutes)}`
        : gateTag;
    } else if (apptSlackMinutes !== null && apptSlackMinutes < 60) {
      statusTone = 'warn';
      statusBadge = `Tight +${dur(apptSlackMinutes)}`;
    } else if (apptSlackMinutes !== null) {
      statusTone = 'good';
      statusBadge = `On time +${dur(apptSlackMinutes)}`;
    } else {
      statusTone = finalLoadChk.ev.cycle.remaining < 60 ? 'warn' : 'good';
      statusBadge = finalLoadChk.ev.cycle.remaining < 60
        ? `Tight (${dur(finalLoadChk.ev.cycle.remaining)} cycle)`
        : 'Fits cleanly';
    }

    outcomes.push({
      id: nl.load.id,
      index: i,
      displayName: nl.displayName,
      load: nl.load,
      effectiveMph: nl.effectiveMph,
      deadheadDriveMinutes: nl.deadheadDriveMinutes,
      loadedDriveMinutes: nl.loadedDriveMinutes,
      totalDriveMinutes: nl.totalDriveMinutes,
      preTripMinutes: nl.preTripMinutes,
      bufferMinutes: nl.bufferMinutes,
      dockMinutes: nl.dockMinutes,
      dockOff: nl.dockOff,
      pickupDwellMinutes: nl.pickupDwellMinutes,
      pickupDwellOff: nl.pickupDwellOff,
      apptTimeZone: nl.apptTimeZone,
      sameZone: nl.sameZone,
      appointment: nl.apptMinute !== null ? formatDualTime(nl.apptMinute, homeTz, nl.apptTimeZone) : null,
      unconstrainedRollOut: formatDualTime(targetRollOut, homeTz, nl.apptTimeZone),
      rollOut: formatDualTime(chosenRollOut, homeTz, nl.apptTimeZone),
      arrival: formatDualTime(chosenArrival, homeTz, nl.apptTimeZone),
      pta: formatDualTime(chosenPta, homeTz, nl.apptTimeZone),
      restBeforeMinutes: Math.max(0, chosenRollOut - cursor),
      restAfterStart: formatDualTime(chosenPta, homeTz, nl.apptTimeZone),
      restAfterEnd: formatDualTime(restAfterEndMin, homeTz, nl.apptTimeZone),
      restAfterMinutes,
      midnightGateMinutes,
      midnightGateKind,
      midnightGateBoundary,
      midnightGateDropOffMinutes,
      apptSlackMinutes,
      meetsAppt,
      insertedBreakMinutes: chosenBreak,
      ptaInSweetSpot,
      usedSplit,
      splitKind,
      splitOrderLabel,
      splitCallout: usedSplit ? SPLIT_SB_CALLOUT : null,
      splitTrapDetected,
      splitTrapDetail,
      cycleRemainingAfter: finalLoadChk.ev.cycle.remaining,
      driveRemainingAfter: finalLoadChk.ev.shift.driveRemaining,
      windowRemainingAfter: finalLoadChk.ev.shift.windowRemaining,
      statusTone,
      statusBadge,
      rolloutPlan: null,
      simSegments: chosenSegs,
      violations: finalLoadChk.violations,
    });

    // Advance chain for Load k+1 — real forward chaining (zero clock resets!)
    loadEvals.push(finalLoadChk.ev);
    allSimSegs.push(...chosenSegs);
    chainHistory = [...chainHistory, ...asCommitted(chosenSegs)];
    cursor = chosenPta;
    cursorEval = finalLoadChk.ev;

    // Exact branch-and-bound for trade verification: violations, missed appts, and total lateness
    // are monotonically non-decreasing; if already strictly worse than the target lane, bail immediately.
    if (finalLoadChk.violations.length > 0) runningViols += finalLoadChk.violations.length;
    if (!meetsAppt) {
      runningMissed++;
      if (apptSlackMinutes !== null && apptSlackMinutes < 0) runningLate += Math.abs(apptSlackMinutes);
    }
    if (abortIfWorseThan) {
      const worseV = runningViols > abortIfWorseThan.violations;
      const worseM = abortIfWorseThan.violations === 0 && runningViols === 0 && runningMissed > abortIfWorseThan.missedApptCount;
      const worseL = abortIfWorseThan.violations === 0 && runningViols === 0 && runningMissed === abortIfWorseThan.missedApptCount && runningLate > abortIfWorseThan.totalApptLateMinutes;
      if (worseV || worseM || worseL) {
        return {
          result: {
            id: strategyId,
            label: strategyId === 'recaps' ? 'A · Run Recaps' : 'B · Fit a 34',
            resetPlacement,
            loads: outcomes,
            openNights: [],
            totalMiles: 0,
            totalDriveMinutes: 0,
            endMinute: cursor,
            endTime: formatDualTime(cursor, homeTz, homeTz),
            cycleRemainingAtEnd: finalLoadChk.ev.cycle.remaining,
            cycleRemainingAfterOpenNights: finalLoadChk.ev.cycle.remaining,
            homeCheck: null,
            missedApptCount: runningMissed,
            totalApptLateMinutes: runningLate,
            maxApptLateMinutes: 0,
            minApptSlackMinutes: null,
            minLoadCycleRemaining: 0,
            usesSplit: false,
            totalMidnightGateMinutes: 0,
            simSegments: allSimSegs,
            finalEvaluation: finalLoadChk.ev,
            violations: finalLoadChk.violations,
            allLoadsLegalAndOnTime: false,
          },
          detectedSplitTraps,
          endChainHistory: chainHistory,
          endCursor: cursor,
          aborted: true,
        };
      }
    }
  }

  // If Strategy B placed the 34h reset AFTER the last load (e.g. weekend reset or open-night reset)
  let appendedTrailing34 = false;
  if (strategyId === 'reset34' && forcedResetBeforeIdx === activeLoads.length) {
    const restInfo = earliestResetComplete(chainHistory, cursor, config, LIMITS.RESTART, activeLoads.length === 0, cursorEval);
    const rStart = restInfo.activeRest ? restInfo.activeRest.start : cursor;
    const rEnd = restInfo.earliest;
    resetPlacement = {
      beforeLoadIndex: activeLoads.length,
      label: activeLoads.length > 0 ? `After ${activeLoads[activeLoads.length - 1].displayName}` : 'Starting now',
      start: formatDualTime(rStart, homeTz, homeTz),
      end: formatDualTime(rEnd, homeTz, homeTz),
    };
    if (rEnd > cursor) {
      const seg34: Segment = { status: 'OFF', start: cursor, end: rEnd, tentative: true, note: '34-hour restart' };
      allSimSegs.push(seg34);
      chainHistory = [...chainHistory, { status: 'OFF', start: cursor, end: rEnd, note: '34-hour restart' }];
      cursor = rEnd;
      appendedTrailing34 = true;
    }
  }

  const endLoadsMinute = activeLoads.length > 0 ? outcomes[outcomes.length - 1].pta.minute : cursor;
  // H1: Reuse `cursorEval` (the last load's exact `evaluate()` at `cursor`) whenever no trailing 34 was appended
  // and `cursor >= now` — identical to evaluating `[...prunedLogged, ...allSimSegs]` at `cursor`!
  const finalLoadEval = !appendedTrailing34 && cursorEval && cursor >= now
    ? cursorEval
    : evaluate([...prunedLogged, ...allSimSegs], { asOf: Math.max(now, cursor), config, forecastDays: 0 });
  const allViolations = finalLoadEval.violations.filter((v) => v.tentative || v.start >= now);

  const openRes = skipOpenNights
    ? { openNights: [], cycleRemainingAfterOpenNights: finalLoadEval.cycle.remaining }
    : computeOpenNightsForStrategy(
        chainHistory,
        now,
        cursor,
        endLoadsMinute,
        activeLoads.length,
        config,
        homeTz,
        draft,
        homeTargetMinute,
        strategyId,
        finalLoadEval.cycle.remaining,
      );

  const totalMiles = activeLoads.reduce((acc, nl) => {
    const loadedMi = nl.load.distanceMode === 'miles'
      ? nl.load.miles
      : Math.round((nl.loadedDriveMinutes / 60) * nl.effectiveMph);
    return acc + loadedMi + nl.load.deadheadMiles;
  }, 0);
  const totalDriveMinutes = activeLoads.reduce((acc, nl) => acc + nl.totalDriveMinutes, 0);

  const missedApptCount = outcomes.filter((o) => !o.meetsAppt).length;
  const totalApptLateMinutes = outcomes.reduce(
    (acc, o) => (o.apptSlackMinutes !== null && o.apptSlackMinutes < 0 ? acc + Math.abs(o.apptSlackMinutes) : acc),
    0,
  );
  const maxApptLateMinutes = outcomes.reduce(
    (mx, o) => (o.apptSlackMinutes !== null && o.apptSlackMinutes < 0 ? Math.max(mx, -o.apptSlackMinutes) : mx),
    0,
  );
  const apptSlacks = outcomes.map((o) => o.apptSlackMinutes).filter((x): x is number => x !== null);
  const minApptSlackMinutes = apptSlacks.length > 0 ? Math.min(...apptSlacks) : null;
  const minLoadCycleRemaining = outcomes.length > 0
    ? Math.min(...outcomes.map((o) => o.cycleRemainingAfter))
    : finalLoadEval.cycle.remaining;
  const usesSplit = outcomes.some((o) => o.usedSplit);
  const totalMidnightGateMinutes = outcomes.reduce((acc, o) => acc + o.midnightGateMinutes, 0);

  const actualFinishMin = activeLoads.length > 0 ? endLoadsMinute : Math.max(now, cursor);
  const homeCheck =
    homeTargetMinute !== null
      ? {
          target: formatDualTime(homeTargetMinute, homeTz, homeTz),
          actualFinish: formatDualTime(actualFinishMin, homeTz, homeTz),
          slackMinutes: homeTargetMinute - actualFinishMin,
          meetsTarget: actualFinishMin <= homeTargetMinute,
          cycleRemainingAtHome: finalLoadEval.cycle.remaining,
        }
      : null;

  const stratResult: WeekStrategyResult = {
    id: strategyId,
    label: strategyId === 'recaps' ? 'A · Run Recaps' : 'B · Fit a 34',
    resetPlacement,
    loads: outcomes,
    openNights: openRes.openNights,
    totalMiles,
    totalDriveMinutes,
    endMinute: actualFinishMin,
    endTime: formatDualTime(actualFinishMin, homeTz, homeTz),
    cycleRemainingAtEnd: finalLoadEval.cycle.remaining,
    cycleRemainingAfterOpenNights: openRes.cycleRemainingAfterOpenNights,
    homeCheck,
    missedApptCount,
    totalApptLateMinutes,
    maxApptLateMinutes,
    minApptSlackMinutes,
    minLoadCycleRemaining,
    usesSplit,
    totalMidnightGateMinutes,
    simSegments: allSimSegs,
    finalEvaluation: finalLoadEval,
    violations: allViolations,
    allLoadsLegalAndOnTime: allViolations.length === 0 && missedApptCount === 0,
  };
  strategyLoadEvals.set(stratResult, loadEvals);

  return {
    result: stratResult,
    detectedSplitTraps,
    endChainHistory: chainHistory,
    endCursor: cursor,
  };
}

function cloneDraft(d: WeekPlanDraft): WeekPlanDraft {
  return {
    ...d,
    loads: d.loads.map((l) => ({ ...l })),
    homeTarget: d.homeTarget ? { ...d.homeTarget } : null,
  };
}

/** Normalize active loads and collect stale (past-due) loads. */
function normalizeDraftLoads(
  draft: WeekPlanDraft,
  now: number,
  homeTz: string,
  baseMph: number,
): { staleLoads: WeekStaleLoad[]; activeLoads: NormalizedLoad[] } {
  const staleLoads: WeekStaleLoad[] = [];
  const activeLoads: NormalizedLoad[] = [];
  for (let i = 0; i < draft.loads.length && i < WEEK_MAX_LOADS; i++) {
    const l = draft.loads[i];
    if (l.done) continue;
    const displayName = l.label.trim() || `Load ${i + 1}`;
    const effMph = clampWeekMph(l.mph ?? baseMph);
    const apptTz = l.apptTimeZone && isValidTimeZone(l.apptTimeZone) ? l.apptTimeZone : homeTz;
    const apptMin = l.hasAppt && l.apptDate ? resolveWallDateTime(l.apptDate, l.apptTime, apptTz) : null;

    if (apptMin !== null && apptMin < now) {
      staleLoads.push({
        load: l,
        index: i,
        displayName,
        apptText: formatDualTime(apptMin, homeTz, apptTz).apptShort,
      });
      continue;
    }

    const deadheadDriveMinutes = l.deadheadMiles > 0
      ? computeDriveMinutes('miles', l.deadheadMiles, effMph, 0).driveMinutes
      : 0;
    const loadedDriveMinutes = computeDriveMinutes(
      l.distanceMode,
      l.miles,
      effMph,
      l.driveMinutes,
    ).driveMinutes;
    const totalDriveMinutes = deadheadDriveMinutes + loadedDriveMinutes;

    activeLoads.push({
      load: l,
      index: i,
      displayName,
      effectiveMph: effMph,
      deadheadDriveMinutes,
      loadedDriveMinutes,
      totalDriveMinutes,
      preTripMinutes: l.preTripMinutes ?? draft.defaultPreTripMinutes ?? DEFAULT_PRETRIP_MIN,
      bufferMinutes: l.bufferMinutes ?? draft.defaultBufferMinutes ?? DEFAULT_BUFFER_MIN,
      dockMinutes: l.dockMinutes ?? DEFAULT_DOCK_MIN,
      dockOff: Boolean(l.dockOff),
      pickupDwellMinutes: l.pickupDwellMinutes ?? 0,
      pickupDwellOff: Boolean(l.pickupDwellOff),
      apptTimeZone: apptTz,
      sameZone: apptTz === homeTz,
      apptMinute: apptMin,
    });
  }
  return { staleLoads, activeLoads };
}

/**
 * H1: Pick high-value reset34 candidate placement indices (at most 3–4 even for 5 loads).
 */
function chooseReset34Candidates(activeLoads: NormalizedLoad[], recaps: WeekStrategyResult): number[] {
  const n = activeLoads.length;
  if (n === 0) return [0];
  if (n <= 3) return Array.from({ length: n }, (_, k) => k);

  const chosen = new Set<number>([0, 1]);
  // First load in recaps that hits a cycle gate, violation, missed appt, or tight cycle
  const troubled = recaps.loads.findIndex(
    (o) => o.midnightGateMinutes > 0 || o.violations.length > 0 || !o.meetsAppt || o.cycleRemainingAfter < 60,
  );
  if (troubled >= 2) chosen.add(troubled);

  // Widest natural inter-load gap (best natural slot for a 34h restart)
  let bestGapIdx = -1;
  let bestGap = -Infinity;
  for (let k = 2; k < n; k++) {
    const prev = recaps.loads[k - 1];
    const nl = activeLoads[k];
    if (prev && nl.apptMinute !== null) {
      const gap = nl.apptMinute - prev.pta.minute;
      if (gap > bestGap) {
        bestGap = gap;
        bestGapIdx = k;
      }
    }
  }
  if (bestGapIdx >= 2) chosen.add(bestGapIdx);

  return [...chosen].sort((a, b) => a - b);
}

/**
 * M1: Symmetric lane recommendation — fewer violations, fewer missed appointments,
 * lower total appointment lateness, earlier home arrival / finish; if both are clean
 * and meet home target, prefer reset34 when it adds > 60m cycle at end.
 */
function pickRecommendedStrategy(
  recaps: WeekStrategyResult,
  bestReset34: WeekStrategyResult,
  activeLoadsCount: number,
  macroRecap: RecapComparison | null,
): WeekStrategyId {
  if (activeLoadsCount === 0) {
    return macroRecap?.bestReset && macroRecap.bestReset.deltaMinutes > 60 ? 'reset34' : 'recaps';
  }
  if (bestReset34.violations.length !== recaps.violations.length) {
    return bestReset34.violations.length < recaps.violations.length ? 'reset34' : 'recaps';
  }
  if (bestReset34.missedApptCount !== recaps.missedApptCount) {
    return bestReset34.missedApptCount < recaps.missedApptCount ? 'reset34' : 'recaps';
  }
  if (bestReset34.totalApptLateMinutes !== recaps.totalApptLateMinutes) {
    return bestReset34.totalApptLateMinutes < recaps.totalApptLateMinutes ? 'reset34' : 'recaps';
  }
  // Tie-break on home arrival / finish when either lane misses appointments or misses home target
  if (recaps.missedApptCount > 0) {
    if (bestReset34.endMinute !== recaps.endMinute) {
      return bestReset34.endMinute < recaps.endMinute ? 'reset34' : 'recaps';
    }
  }
  if (recaps.homeCheck && bestReset34.homeCheck) {
    if (bestReset34.homeCheck.meetsTarget !== recaps.homeCheck.meetsTarget) {
      return bestReset34.homeCheck.meetsTarget ? 'reset34' : 'recaps';
    }
    if (!recaps.homeCheck.meetsTarget && bestReset34.endMinute !== recaps.endMinute) {
      return bestReset34.endMinute < recaps.endMinute ? 'reset34' : 'recaps';
    }
  }
  // Tie-break when both lanes are otherwise equal and recaps relied on a hold that reset34 eliminates
  // (e.g. SEED=383857408 where logged OFF reaches 34h during the hold, making reset34 explicit with 0 gate).
  if (bestReset34.totalMidnightGateMinutes < recaps.totalMidnightGateMinutes) {
    return 'reset34';
  }
  // Both legal, on time, and meet home target (or no home target): prefer 34 when it adds > 60m cycle
  if (bestReset34.allLoadsLegalAndOnTime && bestReset34.cycleRemainingAtEnd > recaps.cycleRemainingAtEnd + 60) {
    return 'reset34';
  }
  return 'recaps';
}

/**
 * Lightweight core evaluation for H6 trade verification (skips macroRecap, openNights, and recursive trade checks).
 */
function runCoreStrategies(
  prunedLogged: Segment[],
  now: number,
  config: RulesConfig,
  homeTz: string,
  boundaryWord: string,
  baseMph: number,
  draft: WeekPlanDraft,
  skipOpenNights: boolean,
  mode: 'both' | 'recaps_only' | 'reset34_only' = 'both',
  preferredResetIdx: number | null = null,
  startingEvalAtNow: FullEvaluation | null = null,
  reuseBaseRecaps: WeekStrategyResult | null = null,
  changedFromIdx = 0,
  stopAfterIdx?: number,
  baseResetByIdx?: Map<number, WeekStrategyResult> | null,
  dockOnlyChange = false,
): {
  staleLoads: WeekStaleLoad[];
  activeLoads: NormalizedLoad[];
  homeTargetMinute: number | null;
  recapsPass: ReturnType<typeof runWeekStrategy>;
  recaps: WeekStrategyResult;
  bestReset34: WeekStrategyResult;
  candidateResetResults: WeekStrategyResult[];
} {
  const homeTargetMinute = draft.homeTarget
    ? resolveWallDateTime(draft.homeTarget.date, draft.homeTarget.time, homeTz)
    : null;
  const { staleLoads, activeLoads } = normalizeDraftLoads(draft, now, homeTz, baseMph);

  // H1: On `reset34_only` trade verification (e.g. push-for-34), skip running a full `recapsPass` when
  // we only need the `reset34` candidates — reuse `reuseBaseRecaps` prefix up to `min(idx, changedFromIdx)`!
  if (mode === 'reset34_only') {
    let candidateIndices = chooseReset34Candidates(activeLoads, reuseBaseRecaps ?? {
      id: 'recaps', label: '', resetPlacement: null, loads: [], openNights: [], totalMiles: 0, totalDriveMinutes: 0,
      endMinute: now, endTime: formatDualTime(now, homeTz, homeTz), cycleRemainingAtEnd: 0, cycleRemainingAfterOpenNights: 0,
      homeCheck: null, missedApptCount: 0, totalApptLateMinutes: 0, maxApptLateMinutes: 0, minApptSlackMinutes: null,
      minLoadCycleRemaining: 0, usesSplit: false, totalMidnightGateMinutes: 0, simSegments: [],
      finalEvaluation: startingEvalAtNow ?? evaluate(prunedLogged, { asOf: now, config }), violations: [], allLoadsLegalAndOnTime: true,
    });
    if (preferredResetIdx !== null && preferredResetIdx >= 0 && preferredResetIdx <= activeLoads.length) {
      candidateIndices = [preferredResetIdx, ...candidateIndices.filter((x) => x !== preferredResetIdx)];
    }
    // Cap verification candidates to the preferred placement + at most 1 alternative (2 max)
    const verifyIndices = candidateIndices.slice(0, 2);
    const candidatePasses: ReturnType<typeof runWeekStrategy>[] = [];
    for (const idx of verifyIndices) {
      const prefix = reuseBaseRecaps ? Math.min(idx, changedFromIdx) : 0;
      const pass = runWeekStrategy(
        prunedLogged, now, config, homeTz, boundaryWord, activeLoads, draft, homeTargetMinute,
        'reset34', idx, true, reuseBaseRecaps, prefix, startingEvalAtNow,
      );
      candidatePasses.push(pass);
      if (pass.result.violations.length === 0 && pass.result.missedApptCount === 0) break;
    }
    candidatePasses.sort((pa, pb) => {
      const a = pa.result, b = pb.result;
      if (a.violations.length !== b.violations.length) return a.violations.length - b.violations.length;
      if (a.missedApptCount !== b.missedApptCount) return a.missedApptCount - b.missedApptCount;
      if (a.totalApptLateMinutes !== b.totalApptLateMinutes) return a.totalApptLateMinutes - b.totalApptLateMinutes;
      return b.cycleRemainingAtEnd - a.cycleRemainingAtEnd;
    });
    const best = candidatePasses[0]!;
    return {
      staleLoads,
      activeLoads,
      homeTargetMinute,
      recapsPass: best,
      recaps: best.result,
      bestReset34: best.result,
      candidateResetResults: candidatePasses.map((p) => p.result),
    };
  }

  const recapsPrefix = reuseBaseRecaps ? Math.max(0, changedFromIdx) : 0;
  const recapsPass = runWeekStrategy(
    prunedLogged,
    now,
    config,
    homeTz,
    boundaryWord,
    activeLoads,
    draft,
    homeTargetMinute,
    'recaps',
    null,
    skipOpenNights,
    reuseBaseRecaps,
    recapsPrefix,
    startingEvalAtNow,
    mode === 'recaps_only' ? stopAfterIdx : undefined,
  );
  const recaps = recapsPass.result;

  if (mode === 'recaps_only') {
    return {
      staleLoads,
      activeLoads,
      homeTargetMinute,
      recapsPass,
      recaps,
      bestReset34: recaps,
      candidateResetResults: [],
    };
  }

  const candidateIndices = chooseReset34Candidates(activeLoads, recaps);
  const candidatePasses: ReturnType<typeof runWeekStrategy>[] = [];
  const bound = baseResetByIdx
    ? {
        violations: recaps.violations.length,
        missedApptCount: recaps.missedApptCount,
        totalApptLateMinutes: recaps.totalApptLateMinutes,
      }
    : null;
  const lastWorkEndOf = (o: WeekLoadOutcome): number => {
    for (let k = o.simSegments.length - 1; k >= 0; k--) {
      const s = o.simSegments[k];
      if (s.status === 'D' || s.status === 'ON') return s.end;
    }
    return o.pta.minute;
  };
  for (const idx of candidateIndices) {
    const baseR = baseResetByIdx?.get(idx) ?? null;
    // Exact zero-loss lower-bound prune on unchanged prefix loads of a previously evaluated reset34 candidate
    if (bound && baseR && idx <= changedFromIdx) {
      const unchangedEnd = dockOnlyChange ? Math.min(baseR.loads.length, changedFromIdx + 1) : Math.min(baseR.loads.length, changedFromIdx);
      let preViols = 0;
      let preMiss = 0;
      let preLate = 0;
      for (let j = 0; j < unchangedEnd; j++) {
        const o = baseR.loads[j];
        if (o.violations.length > 0) preViols += o.violations.length;
        if (!o.meetsAppt) {
          preMiss++;
          if (o.apptSlackMinutes !== null && o.apptSlackMinutes < 0) preLate += Math.abs(o.apptSlackMinutes);
        }
      }
      const impossibleV = preViols > bound.violations;
      const impossibleM = bound.violations === 0 && preViols === 0 && preMiss > bound.missedApptCount;
      const impossibleL = bound.violations === 0 && preViols === 0 && preMiss === bound.missedApptCount && preLate > bound.totalApptLateMinutes;
      if (impossibleV || impossibleM || impossibleL) continue;
    }
    // Exact 34h-restart suffix-invariance prune: a 34h restart before `idx` resets all shift & cycle clocks;
    // if `changedFromIdx < idx` and load `idx - 1` ends work and PTA at the exact same minutes as in the base
    // recaps pass, loads `idx..n-1` are bit-for-bit identical to `baseR.loads.slice(idx)`.
    if (
      bound
      && baseR
      && reuseBaseRecaps
      && idx > 0
      && changedFromIdx < idx
      && recaps.loads[idx - 1]
      && reuseBaseRecaps.loads[idx - 1]
      && recaps.loads[idx - 1].pta.minute === reuseBaseRecaps.loads[idx - 1].pta.minute
      && lastWorkEndOf(recaps.loads[idx - 1]) === lastWorkEndOf(reuseBaseRecaps.loads[idx - 1])
    ) {
      let totV = 0, totM = 0, totL = 0;
      for (let j = 0; j < idx; j++) {
        const o = recaps.loads[j];
        totV += o.violations.length;
        if (!o.meetsAppt) { totM++; if (o.apptSlackMinutes !== null && o.apptSlackMinutes < 0) totL += Math.abs(o.apptSlackMinutes); }
      }
      for (let j = idx; j < baseR.loads.length; j++) {
        const o = baseR.loads[j];
        totV += o.violations.length;
        if (!o.meetsAppt) { totM++; if (o.apptSlackMinutes !== null && o.apptSlackMinutes < 0) totL += Math.abs(o.apptSlackMinutes); }
      }
      const impossibleV = totV > bound.violations;
      const impossibleM = bound.violations === 0 && totV === 0 && totM > bound.missedApptCount;
      const impossibleL = bound.violations === 0 && totV === 0 && totM === bound.missedApptCount && totL > bound.totalApptLateMinutes;
      if (impossibleV || impossibleM || impossibleL) continue;
    }
    const useBaseResetPrefix = Boolean(baseR && idx < changedFromIdx);
    const pass = runWeekStrategy(
      prunedLogged,
      now,
      config,
      homeTz,
      boundaryWord,
      activeLoads,
      draft,
      homeTargetMinute,
      'reset34',
      idx,
      true, // Always skip openNights during candidate comparison; attach only on winner
      useBaseResetPrefix ? baseR : recaps, // Reuse unchanged prefix loads!
      useBaseResetPrefix ? changedFromIdx : idx,
      startingEvalAtNow,
      undefined,
      bound,
    );
    if (pass.aborted) continue;
    candidatePasses.push(pass);
    // Fast exit if a reset34 placement achieves 0 violations, 0 misses, and meets home target
    if (
      pass.result.violations.length === 0
      && pass.result.missedApptCount === 0
      && (pass.result.homeCheck === null || pass.result.homeCheck.meetsTarget)
    ) {
      break;
    }
  }
  candidatePasses.sort((pa, pb) => {
    const a = pa.result;
    const b = pb.result;
    if (a.violations.length !== b.violations.length) return a.violations.length - b.violations.length;
    if (a.missedApptCount !== b.missedApptCount) return a.missedApptCount - b.missedApptCount;
    if (a.totalApptLateMinutes !== b.totalApptLateMinutes) return a.totalApptLateMinutes - b.totalApptLateMinutes;
    const aHome = a.homeCheck ? (a.homeCheck.meetsTarget ? 0 : 1) : 0;
    const bHome = b.homeCheck ? (b.homeCheck.meetsTarget ? 0 : 1) : 0;
    if (aHome !== bHome) return aHome - bHome;
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
    return b.cycleRemainingAtEnd - a.cycleRemainingAtEnd;
  });

  const bestPass = candidatePasses[0] ?? (bound ? null : runWeekStrategy(
    prunedLogged, now, config, homeTz, boundaryWord, activeLoads, draft, homeTargetMinute, 'reset34', activeLoads.length, true,
  ));
  const bestReset34 = bestPass ? bestPass.result : {
    ...recaps,
    id: 'reset34' as WeekStrategyId,
    label: 'B · Fit a 34',
    missedApptCount: recaps.missedApptCount + 1,
    totalApptLateMinutes: recaps.totalApptLateMinutes + 1,
    allLoadsLegalAndOnTime: false,
  };
  if (bestPass && !skipOpenNights && draft.fillOpenNights) {
    const endLoadsMin = activeLoads.length > 0 ? bestReset34.loads[bestReset34.loads.length - 1].pta.minute : bestPass.endCursor;
    const openRes = computeOpenNightsForStrategy(
      bestPass.endChainHistory,
      now,
      bestPass.endCursor,
      endLoadsMin,
      activeLoads.length,
      config,
      homeTz,
      draft,
      homeTargetMinute,
      'reset34',
      bestReset34.cycleRemainingAtEnd,
    );
    bestReset34.openNights = openRes.openNights;
    bestReset34.cycleRemainingAfterOpenNights = openRes.cycleRemainingAfterOpenNights;
  }

  return {
    staleLoads,
    activeLoads,
    homeTargetMinute,
    recapsPass,
    recaps,
    bestReset34,
    candidateResetResults: candidatePasses.map((p) => p.result),
  };
}

/**
 * L3: Compute the exact ON-duty detention breaking point (minutes) via binary search + `evaluate()`,
 * never heuristic `margin + 5`. Returns null if even 12h of added ON duty does not break the cycle.
 */
function computeDetentionBreakMinutes(
  prunedLogged: Segment[],
  winner: WeekStrategyResult,
  now: number,
  config: RulesConfig,
  cycleLimit: number,
): number | null {
  if (winner.loads.length === 0) return null;
  const endMin = winner.endMinute;
  const baseChain = [...prunedLogged, ...winner.simSegments];
  const baseViolCount = winner.violations.length;

  const breaksAt = (d: number): boolean => {
    const extra: Segment = { status: 'ON', start: endMin, end: endMin + d, tentative: true, note: 'Detention probe' };
    const ev = evaluate([...baseChain, extra], { asOf: endMin + d, config, forecastDays: 0 });
    const postViols = ev.violations.filter((v) => v.tentative || v.start >= now);
    return ev.cycle.used > cycleLimit || postViols.length > baseViolCount;
  };

  // Fast exact bracket: if no carrier-day drop-off intervenes, breaking point is `margin + 1` (2 evals instead of 8).
  const margin = Math.max(0, winner.cycleRemainingAtEnd);
  if (margin === 0) {
    if (breaksAt(1)) return 1;
  } else if (margin < 720) {
    if (breaksAt(margin + 1) && !breaksAt(margin)) return margin + 1;
  }

  if (breaksAt(1)) return 1;
  const hiMax = Math.min(720, Math.max(120, margin + 120));
  if (!breaksAt(hiMax)) return null;

  let lo = 1;
  let hi = hiMax;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (breaksAt(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/* ---------- H1: Synthesis instrumentation & hub-summary fingerprint cache ---------- */

let synthesisCallCount = 0;

/** Count of top-level `synthesizeWeek()` calls (used for H1 caching verification). */
export function getWeekSynthesisCount(): number { return synthesisCallCount; }
export function resetWeekSynthesisCount(): void { synthesisCallCount = 0; }

export interface WeekHubSummaryInput {
  segments: Segment[];
  current?: { status: DutyStatus; since: number; note?: string } | null;
  now: number;
  config: RulesConfig;
  mph: number;
  draft: WeekPlanDraft;
  historyBasis?: HistoryBasis;
}

export interface WeekHubSnapshot {
  activeLoadCount: number;
  staleLoadCount: number;
  verdictStatus: WeekSynthesisResult['verdict']['status'];
  verdictTone: WeekSynthesisResult['verdict']['tone'];
  hubSummary: string;
  recommendedStrategy: WeekStrategyId;
}

export const WEEK_HUB_TIME_BUCKET_MINUTES = 15;
const HUB_CACHE_MAX = 16;
const weekHubCache = new Map<string, WeekHubSnapshot>();

export function clearWeekHubCache(): void {
  weekHubCache.clear();
}

/**
 * Time-aware fingerprint of (segments, current status start, weekPlan draft, settings, carrier-day,
 * stale-load boundary, and coarse 15-minute time bucket).
 * - Per-minute ticks inside the same 15-minute bucket keep the exact same fingerprint (0 extra syntheses).
 * - Advancing past the 15-minute bucket invalidates the cache so the Plan hub never disagrees with a fresh
 *   synthesis by more than 15 minutes (N1).
 */
export function computeWeekHubFingerprint(input: WeekHubSummaryInput): string {
  const cfg = safeRulesConfig(input.config);
  const homeTz = isValidTimeZone(cfg.timeZone) ? cfg.timeZone : 'UTC';
  const dayStart = carrierDayStart(input.now, cfg);
  const timeBucket = Math.floor(input.now / WEEK_HUB_TIME_BUCKET_MINUTES);
  const draft = input.draft ?? DEFAULT_WEEK_PLAN;

  const segParts: string[] = [];
  for (const s of input.segments) {
    if (!s.tentative) segParts.push(`${s.status}:${s.start}:${s.end}`);
  }
  const curKey = input.current ? `${input.current.status}:${input.current.since}` : '';

  const staleBits: string[] = [];
  for (let i = 0; i < draft.loads.length && i < WEEK_MAX_LOADS; i++) {
    const l = draft.loads[i];
    if (l.done) { staleBits.push('d'); continue; }
    if (l.hasAppt && l.apptDate) {
      const tz = l.apptTimeZone && isValidTimeZone(l.apptTimeZone) ? l.apptTimeZone : homeTz;
      const m = resolveWallDateTime(l.apptDate, l.apptTime, tz);
      staleBits.push(m !== null && m < input.now ? 's' : 'a');
    } else {
      staleBits.push('a');
    }
  }

  const draftKey = JSON.stringify({
    loads: draft.loads,
    homeTarget: draft.homeTarget,
    fillOpenNights: draft.fillOpenNights,
    usualShiftStartMinutes: draft.usualShiftStartMinutes,
    usualShiftBudgetMinutes: draft.usualShiftBudgetMinutes,
    allowSplits: draft.allowSplits,
    defaultPreTripMinutes: draft.defaultPreTripMinutes,
    defaultBufferMinutes: draft.defaultBufferMinutes,
  });

  return [
    cfg.cycle,
    cfg.dayStartHour,
    cfg.dayStartMinute,
    cfg.timeZone,
    cfg.shortHaul ? '1' : '0',
    clampWeekMph(input.mph),
    input.historyBasis ?? '',
    dayStart,
    timeBucket,
    staleBits.join(''),
    curKey,
    segParts.join(','),
    draftKey,
  ].join('|');
}

function toHubSnapshot(res: WeekSynthesisResult): WeekHubSnapshot {
  return {
    activeLoadCount: res.activeLoadCount,
    staleLoadCount: res.staleLoads.length,
    verdictStatus: res.verdict.status,
    verdictTone: res.verdict.tone,
    hubSummary: res.hubSummary,
    recommendedStrategy: res.recommendedStrategy,
  };
}

function storeHubCache(fp: string, snap: WeekHubSnapshot): void {
  if (weekHubCache.size >= HUB_CACHE_MAX) {
    const first = weekHubCache.keys().next().value;
    if (first !== undefined) weekHubCache.delete(first);
  }
  weekHubCache.set(fp, snap);
}

/** Populate the Plan hub cache from an already-computed `synthesizeWeek` result (e.g., from `MyWeekTab`). */
export function primeWeekHubCache(input: WeekHubSummaryInput, res: WeekSynthesisResult): void {
  const fp = computeWeekHubFingerprint(input);
  storeHubCache(fp, toHubSnapshot(res));
}

/**
 * Compute or return the cached Plan hub summary for My Week.
 * - Zero non-done loads: returns static prompt with ZERO `synthesizeWeek` calls.
 * - Unchanged fingerprint (including across minute ticks): returns cached summary with ZERO `synthesizeWeek` calls.
 */
export function getWeekHubSummary(input: WeekHubSummaryInput): WeekHubSnapshot {
  const draft = input.draft ?? DEFAULT_WEEK_PLAN;
  const hasNonDone = draft.loads.some((l) => !l.done);
  if (!hasNonDone) {
    return {
      activeLoadCount: 0,
      staleLoadCount: 0,
      verdictStatus: 'all_clear',
      verdictTone: 'good',
      hubSummary: 'Stack 1–5 upcoming loads + home time — one chained verdict, priced conflicts, and Recaps vs. 34.',
      recommendedStrategy: 'recaps',
    };
  }
  const fp = computeWeekHubFingerprint(input);
  const hit = weekHubCache.get(fp);
  if (hit) return hit;

  const logged = input.segments.filter((s) => !s.tentative);
  const fullLogged = input.current && input.current.since < input.now
    ? [...logged, { status: input.current.status, start: input.current.since, end: input.now, note: input.current.note }]
    : logged;
  const res = synthesizeWeek({
    segments: fullLogged,
    now: input.now,
    config: input.config,
    mph: input.mph,
    draft,
    historyBasis: input.historyBasis,
  });
  const snap = toHubSnapshot(res);
  storeHubCache(fp, snap);
  return snap;
}

/**
 * Main entry point: synthesize the driver's whole week ahead from logged segments + `WeekPlanDraft`.
 */
export function synthesizeWeek(input: WeekSynthesisInput): WeekSynthesisResult {
  synthesisCallCount++;
  const { now } = input;
  const config = safeRulesConfig(input.config);
  const homeTz = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const homeZoneName = zoneShort(homeTz);
  const boundaryWord = dayStartWord(config);
  const { limit: cycleLimit, windowDays: cycleWindowDays } = cycleParamsOf(config);
  const baseMph = clampWeekMph(input.mph);
  const logged = input.segments.filter((s) => !s.tentative);
  const prunedLogged = pruneHistory(logged, now, config);

  // Starting clocks from the real engine (same shared floor as Now & all Plan tools)
  const startingEval = evaluate(prunedLogged, { asOf: now, config, forecastDays: 8 });
  const upcomingDropOffs = startingEval.cycle.forecast.slice(0, 7);

  // Provisional history check (Section F.2 guardrail)
  const gaps = meaningfulGaps(startingEval.gaps);
  const incompleteBasis = input.historyBasis !== undefined && input.historyBasis !== 'known';
  const provisional = incompleteBasis || gaps.length > 0;
  const provisionalReason = incompleteBasis
    ? `Your last ${cycleWindowDays} days aren't all logged yet — cycle numbers assume unlogged past days were 0h.`
    : gaps.length > 0
      ? `${gaps.length} unlogged gap${gaps.length === 1 ? '' : 's'} of 2h+ in your log read as off duty — check Log or Drift check.`
      : null;

  // Apply preview trade if requested
  if (input.previewTradeId) {
    const baseRes = synthesizeWeek({ ...input, previewTradeId: null });
    const match = baseRes.conflicts.find((c) => c.previewTrade?.id === input.previewTradeId)?.previewTrade ?? null;
    if (match) {
      const mutated = match.apply(cloneDraft(input.draft));
      const previewed = synthesizeWeek({ ...input, draft: mutated, previewTradeId: null });
      return {
        ...previewed,
        activePreviewTradeId: input.previewTradeId,
      };
    }
  }

  const draft = input.draft ?? DEFAULT_WEEK_PLAN;

  // Standalone Weekly Recap vs. 34 macro view (what Weekly Recap alone would say)
  const macroResetStart = nextCarrierDayStart(now, config) + 8 * 60;
  const macroRecap = projectRecapVs34({
    segments: prunedLogged,
    now,
    config,
    defaultShiftMinutes: draft.usualShiftBudgetMinutes,
    shiftStartMinutes: draft.usualShiftStartMinutes,
    resetStart: macroResetStart,
    homeTargetShifts: null,
  });

  // Pass 1 & Pass 2: Run Recaps + Best-Fit Reset34 candidates (reusing `startingEval` for Load 0!)
  const core = runCoreStrategies(prunedLogged, now, config, homeTz, boundaryWord, baseMph, draft, false, 'both', null, startingEval);
  const { staleLoads, activeLoads, recapsPass, recaps, bestReset34, candidateResetResults } = core;

  // M1: Choose winning weekly strategy symmetrically (violations -> missed appts -> total lateness -> earlier finish -> cycle)
  const recommendedStrategy = pickRecommendedStrategy(recaps, bestReset34, activeLoads.length, macroRecap);
  const winner = recommendedStrategy === 'reset34' ? bestReset34 : recaps;

  // Helper to verify a candidate trade by actually re-running core strategies on the mutated draft (H6).
  // Memoized per mutated draft within this synthesis call and reuses unchanged prefix loads (H1).
  // Any non-`reset34_only` change re-evaluates BOTH lanes and re-determines the recommended winner so
  // every trade claim is verified against the exact lane the preview will show (never stale across a lane flip).
  const tradeVerifyCache = new Map<string, {
    recaps: WeekStrategyResult;
    reset34: WeekStrategyResult;
    recommendedStrategy: WeekStrategyId;
    winner: WeekStrategyResult;
    traps: ReturnType<typeof runWeekStrategy>['detectedSplitTraps'];
  }>();
  const firstChangedActiveIdx = (mutated: WeekPlanDraft): number => {
    for (let k = 0; k < activeLoads.length; k++) {
      const orig = activeLoads[k].load;
      const cur = mutated.loads.find((x) => x.id === orig.id);
      if (!cur || cur.apptDate !== orig.apptDate || cur.apptTime !== orig.apptTime || cur.dockOff !== orig.dockOff || cur.hasAppt !== orig.hasAppt) {
        return k;
      }
    }
    return activeLoads.length;
  };
  const baseResetByIdx = new Map<number, WeekStrategyResult>();
  for (const r of candidateResetResults) {
    if (r.resetPlacement) baseResetByIdx.set(r.resetPlacement.beforeLoadIndex, r);
  }
  const verifyTradeDraft = (
    mutated: WeekPlanDraft,
    mode: 'both' | 'reset34_only' = 'both',
    preferredResetIdx: number | null = null,
  ) => {
    const cacheKey = `${mode}:${preferredResetIdx ?? ''}:${JSON.stringify(mutated.loads)}`;
    const cached = tradeVerifyCache.get(cacheKey);
    if (cached) return cached;
    const chgIdx = firstChangedActiveIdx(mutated);
    const origLoad = activeLoads[chgIdx]?.load;
    const mutLoad = origLoad ? mutated.loads.find((x) => x.id === origLoad.id) : undefined;
    const dockOnlyChange = Boolean(
      origLoad && mutLoad
      && origLoad.dockOff !== mutLoad.dockOff
      && origLoad.apptDate === mutLoad.apptDate
      && origLoad.apptTime === mutLoad.apptTime
      && origLoad.hasAppt === mutLoad.hasAppt,
    );

    const afterCore = runCoreStrategies(
      prunedLogged, now, config, homeTz, boundaryWord, baseMph, mutated, true,
      mode, preferredResetIdx, startingEval, recaps, chgIdx, undefined,
      mode === 'both' ? baseResetByIdx : null,
      dockOnlyChange,
    );
    const afterRec = mode === 'reset34_only'
      ? 'reset34'
      : pickRecommendedStrategy(afterCore.recaps, afterCore.bestReset34, afterCore.activeLoads.length, null);
    const afterWinner = afterRec === 'reset34' ? afterCore.bestReset34 : afterCore.recaps;
    const out = {
      recaps: afterCore.recaps,
      reset34: afterCore.bestReset34,
      recommendedStrategy: afterRec,
      winner: afterWinner,
      traps: afterCore.recapsPass.detectedSplitTraps,
    };
    tradeVerifyCache.set(cacheKey, out);
    return out;
  };

  // ---------- Pass 5: Cross-Engine Conflict Detector & Verified Trade Pricer ----------
  const conflicts: WeekConflict[] = [];

  // 1. Split-Sleeper Next-Shift Trap conflict (H5: priced and described from actual re-evaluation)
  for (const trap of recapsPass.detectedSplitTraps) {
    const att = trap.attempt;
    const splitLabel = att.splitKind === 'split82' ? '8/2' : '7/3';
    const loadOutcome = recaps.loads[trap.loadIndex];
    const lateBy = loadOutcome?.apptSlackMinutes !== null && loadOutcome.apptSlackMinutes < 0
      ? Math.abs(loadOutcome.apptSlackMinutes)
      : att.savedMinutes;
    let pushApptMin = loadOutcome?.appointment
      ? loadOutcome.appointment.minute + lateBy + 15
      : null;

    let previewTrade: WeekTradePreview | null = null;
    let tradeText = pushApptMin !== null
      ? `Take a straight 10 after the prior load and ask dispatch to push ${trap.loadName}'s appt by +${dur(lateBy + 15)} instead.`
      : `Take a straight 10 instead of splitting so ${trap.nextLoadName} avoids the ${att.trapCause === 'cycle' ? 'cycle wall' : 'post-split clock trap'}.`;

    if (pushApptMin !== null && loadOutcome) {
      const makeApply = (targetMin: number) => (d: WeekPlanDraft) => {
        const next = cloneDraft(d);
        const target = next.loads.find((x) => x.id === loadOutcome.id);
        if (target) {
          const wd = formatWallDateTime(targetMin, loadOutcome.apptTimeZone);
          target.apptDate = wd.date;
          target.apptTime = wd.time;
          target.hasAppt = true;
        }
        return next;
      };
      let applyFn = makeApply(pushApptMin);
      let after = verifyTradeDraft(applyFn(draft));
      let afterLoad = after.recaps.loads.find((x) => x.id === loadOutcome.id);
      if (afterLoad && !afterLoad.meetsAppt && afterLoad.apptSlackMinutes !== null) {
        pushApptMin = afterLoad.arrival.minute + 15;
        applyFn = makeApply(pushApptMin);
        after = verifyTradeDraft(applyFn(draft));
        afterLoad = after.recaps.loads.find((x) => x.id === loadOutcome.id);
      }
      const trapGone = !after.traps.some((t) => t.loadIndex === trap.loadIndex);
      const afterWinnerLoad = after.winner.loads.find((x) => x.id === loadOutcome.id);
      if (trapGone && afterLoad?.meetsAppt && (!afterWinnerLoad || afterWinnerLoad.meetsAppt) && after.winner.violations.length <= winner.violations.length) {
        const shiftDelta = pushApptMin - loadOutcome.appointment!.minute;
        const afterNext = after.recaps.loads[trap.loadIndex + 1];
        const nextNote = afterNext && afterNext.midnightGateMinutes > 0
          ? `${trap.nextLoadName} still holds ${dur(afterNext.midnightGateMinutes)} for ${afterNext.midnightGateKind === 'restart34' ? '34-hour restart' : `${boundaryWord} cycle`}.`
          : afterNext && afterNext.restBeforeMinutes >= LIMITS.RESET
            ? `${trap.nextLoadName} runs after a full 10-hour rest.`
            : `${trap.nextLoadName} stays on time on the fresh shift.`;
        previewTrade = {
          id: `straight10-push-${loadOutcome.id}`,
          label: `Take Straight 10 & move ${trap.loadName} appt +${dur(shiftDelta)}`,
          description: `Clears the split trap so ${trap.loadName} meets its pushed appt; ${nextNote}`,
          apply: applyFn,
        };
        tradeText = `Take a straight 10 and push ${trap.loadName}'s appt by +${dur(shiftDelta)} (${nextNote.replace(/\.$/, '')}).`;
      }
    }

    conflicts.push({
      id: `split-trap-${trap.loadIndex}`,
      kind: 'split_trap',
      severity: 'bad',
      priority: 10,
      title: `Split trap — ${splitLabel} saves ${trap.loadName} but breaks ${trap.nextLoadName}`,
      body: att.trapDetail
        ?? `${att.splitKind === 'split82' ? 'An' : 'A'} ${splitLabel} split saves ${trap.loadName} by ${dur(att.savedMinutes)}, but hurts ${trap.nextLoadName} by ${dur(att.nextLoadShortfallMinutes)} under re-evaluation.`,
      priceLabel: att.trapPriceLabel ?? `Short ${dur(att.nextLoadShortfallMinutes)} on ${trap.nextLoadName}`,
      tradeText,
      previewTrade,
    });
  }

  // 2. Load vs. Best 34-Hour Reset conflict (H6: verified against re-synthesized reset34!)
  const cycleIsTight =
    startingEval.cycle.remaining <= 15 * 60
    || recaps.cycleRemainingAtEnd <= 10 * 60
    || (macroRecap.bestReset !== null && macroRecap.bestReset.deltaMinutes > 0);
  const reset34FitsCleanly =
    bestReset34.violations.length === 0
    && bestReset34.missedApptCount === 0
    && (bestReset34.homeCheck === null || bestReset34.homeCheck.meetsTarget);
  if (activeLoads.length > 0 && cycleIsTight && !reset34FitsCleanly) {
    const afterLoad1 = candidateResetResults.find((r) => r.resetPlacement?.beforeLoadIndex === 1 && r.missedApptCount > 0);
    const anyApptBlocked34 = candidateResetResults.find((r) => r.missedApptCount > 0);
    const ref34 = bestReset34.missedApptCount > 0
      ? (afterLoad1 && afterLoad1.maxApptLateMinutes <= bestReset34.maxApptLateMinutes + 240 ? afterLoad1 : bestReset34)
      : (afterLoad1 ?? anyApptBlocked34 ?? null);
    const blockedLoad = ref34?.loads.find((o) => !o.meetsAppt && o.appointment !== null) ?? null;
    if (ref34 && blockedLoad && blockedLoad.appointment && blockedLoad.apptSlackMinutes !== null) {
      const missBy = Math.abs(blockedLoad.apptSlackMinutes);
      const placementDesc = ref34.resetPlacement
        ? `${ref34.resetPlacement.label} (${ref34.resetPlacement.start.homeShort} → ${ref34.resetPlacement.end.homeShort})`
        : 'mid-week';
      const pushedApptMin = blockedLoad.arrival.minute + blockedLoad.bufferMinutes;
      const pushedDual = formatDualTime(pushedApptMin, homeTz, blockedLoad.apptTimeZone);
      const shiftMin = pushedApptMin - blockedLoad.appointment.minute;

      const applyPush34 = (d: WeekPlanDraft) => {
        const next = cloneDraft(d);
        const target = next.loads.find((x) => x.id === blockedLoad.id);
        if (target) {
          const wd = formatWallDateTime(pushedApptMin, blockedLoad.apptTimeZone);
          target.apptDate = wd.date;
          target.apptTime = wd.time;
          target.hasAppt = true;
        }
        next.strategyView = 'reset34';
        return next;
      };

      // H6: Re-synthesize to verify what pushing this appointment ACTUALLY delivers on reset34!
      const after34 = verifyTradeDraft(applyPush34(draft), 'reset34_only', ref34.resetPlacement?.beforeLoadIndex ?? null).reset34;
      const beforeMissed = bestReset34.missedApptCount;
      const afterMissed = after34.missedApptCount;
      const afterClean = afterMissed === 0 && after34.violations.length === 0;

      let previewTrade: WeekTradePreview | null = null;
      let tradeText: string;

      if (afterClean) {
        previewTrade = {
          id: `push-for-34-${blockedLoad.id}`,
          label: `Push ${blockedLoad.displayName} appt to ${pushedDual.apptShort} to fit 34`,
          description: `Moves ${blockedLoad.displayName}'s appointment +${dur(shiftMin)} so the 34-hour reset fits cleanly.`,
          apply: applyPush34,
        };
        tradeText = recaps.allLoadsLegalAndOnTime
          ? `Stay on recaps for all ${activeLoads.length} load${activeLoads.length === 1 ? '' : 's'}, OR push ${blockedLoad.displayName} to ${pushedDual.apptShort} (+${dur(shiftMin)}) to fit the 34.`
          : `Push ${blockedLoad.displayName} to ${pushedDual.apptShort} (+${dur(shiftMin)}) so the 34-hour reset fits legally.`;
      } else if (afterMissed < beforeMissed) {
        previewTrade = {
          id: `push-for-34-${blockedLoad.id}`,
          label: `Push ${blockedLoad.displayName} appt to ${pushedDual.apptShort} (${beforeMissed} → ${afterMissed} misses)`,
          description: `Moves ${blockedLoad.displayName}'s appointment +${dur(shiftMin)} — 34-hr reset misses drop from ${beforeMissed} to ${afterMissed}.`,
          apply: applyPush34,
        };
        tradeText = `Pushing ${blockedLoad.displayName} to ${pushedDual.apptShort} (+${dur(shiftMin)}) cuts 34-hr reset misses from ${beforeMissed} to ${afterMissed} (${afterMissed} other appointment${afterMissed === 1 ? '' : 's'} would still need to move).`;
      } else if (after34.totalApptLateMinutes < bestReset34.totalApptLateMinutes && afterMissed <= beforeMissed) {
        const savedLate = bestReset34.totalApptLateMinutes - after34.totalApptLateMinutes;
        previewTrade = {
          id: `push-for-34-${blockedLoad.id}`,
          label: `Push ${blockedLoad.displayName} appt to ${pushedDual.apptShort} (cuts 34 lateness -${dur(savedLate)})`,
          description: `Moves ${blockedLoad.displayName}'s appointment +${dur(shiftMin)} — 34-hr reset still misses ${afterMissed} appt${afterMissed === 1 ? '' : 's'}, cutting total lateness by ${dur(savedLate)}.`,
          apply: applyPush34,
        };
        tradeText = `Multiple appointments block a 34-hr reset; pushing ${blockedLoad.displayName} to ${pushedDual.apptShort} cuts 34 lateness by ${dur(savedLate)} (${afterMissed} appt${afterMissed === 1 ? '' : 's'} still missed).`;
      } else {
        tradeText = recaps.allLoadsLegalAndOnTime
          ? `Stay on recaps — a 34-hour reset misses ${beforeMissed} appointment${beforeMissed === 1 ? '' : 's'} even if ${blockedLoad.displayName} moves.`
          : `Multiple appointments block a 34-hour reset (${beforeMissed} missed); reschedule blocking loads or run recaps.`;
      }

      const homeWipeNote =
        ref34.homeCheck && !ref34.homeCheck.meetsTarget
          ? ` and wipes out home time by ${dur(Math.abs(ref34.homeCheck.slackMinutes))}`
          : '';
      conflicts.push({
        id: `reset34-blocked-${blockedLoad.id}`,
        kind: 'reset34_blocked',
        severity: recaps.allLoadsLegalAndOnTime ? 'warn' : 'bad',
        priority: recaps.allLoadsLegalAndOnTime ? 20 : 12,
        title: `${blockedLoad.displayName} blocks your best 34-hour reset`,
        body: `Weekly cycle math favors a 34-hour reset ${placementDesc}, but ${blockedLoad.displayName}'s ${blockedLoad.appointment.apptShort} appointment blocks it — taking that 34 misses ${blockedLoad.displayName} by ${dur(missBy)}${homeWipeNote}.`,
        priceLabel: `34 misses ${blockedLoad.displayName} by ${dur(missBy)}`,
        tradeText,
        previewTrade,
      });
    }
  }

  // 3. Hard Appointment Missed conflict (on the recommended strategy; H6 verified!)
  for (const o of winner.loads) {
    if (!o.meetsAppt && o.appointment && o.apptSlackMinutes !== null) {
      const lateBy = Math.abs(o.apptSlackMinutes);
      let neededAppt = o.arrival.minute + o.bufferMinutes;

      const makeShiftApply = (targetMin: number) => (d: WeekPlanDraft) => {
        const next = cloneDraft(d);
        const t = next.loads.find((x) => x.id === o.id);
        if (t) {
          const wd = formatWallDateTime(targetMin, o.apptTimeZone);
          t.apptDate = wd.date;
          t.apptTime = wd.time;
          t.hasAppt = true;
        }
        return next;
      };

      let applyShift = makeShiftApply(neededAppt);
      let afterShift = verifyTradeDraft(applyShift(draft), 'both');
      let oAfter = afterShift.winner.loads.find((x) => x.id === o.id);

      // If re-chaining ate into the buffer (or left it still late), adjust once to restore exact verified target
      if (oAfter && oAfter.apptSlackMinutes !== null && oAfter.apptSlackMinutes < o.bufferMinutes) {
        neededAppt += (o.bufferMinutes - oAfter.apptSlackMinutes);
        applyShift = makeShiftApply(neededAppt);
        afterShift = verifyTradeDraft(applyShift(draft), 'both');
        oAfter = afterShift.winner.loads.find((x) => x.id === o.id);
      }

      const neededDual = formatDualTime(neededAppt, homeTz, o.apptTimeZone);
      const shiftDelta = neededAppt - o.appointment.minute;
      let previewTrade: WeekTradePreview | null = null;
      let tradeText: string;

      if (oAfter && oAfter.meetsAppt && oAfter.apptSlackMinutes !== null) {
        const keptFullBuffer = oAfter.apptSlackMinutes >= o.bufferMinutes;
        const slackDesc = keptFullBuffer
          ? `keeps your ${dur(o.bufferMinutes)} buffer`
          : `arrives ${dur(oAfter.apptSlackMinutes)} early`;
        previewTrade = {
          id: `shift-appt-${o.id}`,
          label: `Move ${o.displayName} appt to ${neededDual.apptShort}`,
          description: `Updates ${o.displayName}'s appointment +${dur(shiftDelta)} — ${slackDesc}.`,
          apply: applyShift,
        };
        tradeText = `Ask dispatch to move ${o.displayName}'s appointment to ${neededDual.apptShort} (+${dur(shiftDelta)}) — ${slackDesc}.`;
      } else if (oAfter && oAfter.apptSlackMinutes !== null && Math.abs(oAfter.apptSlackMinutes) < lateBy) {
        const afterLate = Math.abs(oAfter.apptSlackMinutes);
        previewTrade = {
          id: `shift-appt-${o.id}`,
          label: `Move ${o.displayName} appt to ${neededDual.apptShort} (cuts lateness to ${dur(afterLate)})`,
          description: `Moves ${o.displayName}'s appointment +${dur(shiftDelta)} — cuts lateness from ${dur(lateBy)} to ${dur(afterLate)}.`,
          apply: applyShift,
        };
        tradeText = `Moving ${o.displayName}'s appointment to ${neededDual.apptShort} cuts lateness from ${dur(lateBy)} to ${dur(afterLate)}.`;
      } else {
        tradeText = `Ask dispatch to reschedule ${o.displayName} past ${o.arrival.apptShort} (+${dur(lateBy)} minimum).`;
      }

      conflicts.push({
        id: `appt-missed-${o.id}`,
        kind: 'appt_missed',
        severity: 'bad',
        priority: 15,
        title: `${o.displayName} arrives ${dur(lateBy)} past appointment`,
        body: `Chained from your prior run, earliest legal arrival is ${o.arrival.apptShort} against your ${o.appointment.apptShort} appointment (${dur(lateBy)} late).`,
        priceLabel: `Late ${dur(lateBy)}`,
        tradeText,
        previewTrade,
      });
    }
  }

  // 4. Midnight / Carrier-Day Recap Gate (or Natural 34h Restart Wait) conflicts (H6 verified!)
  for (const o of winner.loads) {
    if (o.midnightGateMinutes > 0 && o.midnightGateBoundary) {
      const isRestartWait = o.midnightGateKind === 'restart34';
      const prevLoad = o.index > 0 ? winner.loads[o.index - 1] : null;
      const prevCycleLeft = prevLoad ? prevLoad.cycleRemainingAfter : startingEval.cycle.remaining;
      const dropStr = o.midnightGateDropOffMinutes > 0 ? `+${dur(o.midnightGateDropOffMinutes)}` : 'recap hours';
      const priorDockOn = prevLoad && !prevLoad.dockOff && prevLoad.dockMinutes >= Math.min(45, o.midnightGateMinutes);
      const slackNote = o.apptSlackMinutes !== null
        ? (o.apptSlackMinutes >= 0
            ? `still arrives ${o.arrival.apptShort} (${dur(o.apptSlackMinutes)} early)`
            : `arrives ${dur(Math.abs(o.apptSlackMinutes))} late`)
        : `finishes ${o.pta.homeShort}`;
      const holdKindWord = isRestartWait ? '34-hour restart wait' : `${boundaryWord} hold`;

      let previewTrade: WeekTradePreview | null = null;
      let tradeText = isRestartWait
        ? `Hold roll-out +${dur(o.midnightGateMinutes)} until ${o.rollOut.homeShort} to complete your 34-hour restart.`
        : `Hold roll-out +${dur(o.midnightGateMinutes)} until ${o.rollOut.homeShort} so you cross ${boundaryWord} right as ${dropStr} returns.`;

      if (priorDockOn && prevLoad) {
        const applyRelieve = (d: WeekPlanDraft) => {
          const next = cloneDraft(d);
          const t = next.loads.find((x) => x.id === prevLoad.id);
          if (t) t.dockOff = true;
          return next;
        };
        const afterRel = verifyTradeDraft(applyRelieve(draft), 'both');
        const oAfter = afterRel.winner.loads.find((x) => x.id === o.id);
        const gateAfter = oAfter ? oAfter.midnightGateMinutes : o.midnightGateMinutes;

        if (afterRel.winner.violations.length <= winner.violations.length) {
          if (gateAfter === 0) {
            previewTrade = {
              id: `relieve-dock-${prevLoad.id}`,
              label: `Log ${prevLoad.displayName} dock OFF duty (relieved)`,
              description: `Saves ${dur(prevLoad.dockMinutes)} of cycle before ${o.displayName}, clearing the ${dur(o.midnightGateMinutes)} ${holdKindWord}.`,
              apply: applyRelieve,
            };
            tradeText = `Hold roll-out +${dur(o.midnightGateMinutes)} to ${o.rollOut.homeShort}, OR get relieved OFF duty during ${prevLoad.displayName}'s ${dur(prevLoad.dockMinutes)} dock wait to clear the hold.`;
          } else if (gateAfter < o.midnightGateMinutes) {
            previewTrade = {
              id: `relieve-dock-${prevLoad.id}`,
              label: `Log ${prevLoad.displayName} dock OFF duty (hold ${dur(o.midnightGateMinutes)} → ${dur(gateAfter)})`,
              description: `Saves ${dur(prevLoad.dockMinutes)} of cycle before ${o.displayName}, cutting the ${holdKindWord} from ${dur(o.midnightGateMinutes)} to ${dur(gateAfter)}.`,
              apply: applyRelieve,
            };
            tradeText = `Hold roll-out +${dur(o.midnightGateMinutes)} to ${o.rollOut.homeShort}, OR get relieved OFF duty during ${prevLoad.displayName}'s ${dur(prevLoad.dockMinutes)} dock wait to cut the hold to ${dur(gateAfter)}.`;
          }
        }
      }

      conflicts.push({
        id: `midnight-gate-${o.id}`,
        kind: 'midnight_recap_gate',
        severity: o.apptSlackMinutes !== null && o.apptSlackMinutes < 0 ? 'bad' : 'warn',
        priority: 25,
        title: isRestartWait
          ? `${o.displayName} waits for 34-hour restart`
          : `${o.displayName} roll-out vs. ${boundaryWord} recap wall`,
        body: isRestartWait
          ? `Rolling at ${o.unconstrainedRollOut.homeShort} exceeds your ${dur(prevCycleLeft)} cycle remaining. Holding roll-out ${dur(o.midnightGateMinutes)} until ${o.rollOut.homeShort} completes a 34-hour restart and ${slackNote}.`
          : `Rolling at ${o.unconstrainedRollOut.homeShort} burns past your ${dur(prevCycleLeft)} cycle before ${dropStr} returns at ${o.midnightGateBoundary.homeShort}. Holding roll-out ${dur(o.midnightGateMinutes)} until ${o.rollOut.homeShort} crosses ${boundaryWord} legally and ${slackNote}.`,
        priceLabel: isRestartWait
          ? `34h restart wait +${dur(o.midnightGateMinutes)}`
          : `Hold roll-out +${dur(o.midnightGateMinutes)}`,
        tradeText,
        previewTrade,
      });
    }
  }

  // L3: Compute real detention breaking point via binary search + `evaluate()` when needed
  const needDetentionBreak =
    (winner.homeCheck !== null && (!winner.homeCheck.meetsTarget || winner.homeCheck.cycleRemainingAtHome < 60))
    || winner.cycleRemainingAtEnd < 60;
  const detentionBreakMinutes = needDetentionBreak
    ? computeDetentionBreakMinutes(prunedLogged, winner, now, config, cycleLimit)
    : null;

  // 5. Home-Time Target & Dock-Delay Fragility conflict (H6 verified + L3 re-evaluated detention break)
  if (winner.homeCheck && (!winner.homeCheck.meetsTarget || winner.homeCheck.cycleRemainingAtHome < 60)) {
    const hc = winner.homeCheck;
    const pastBy = Math.max(0, -hc.slackMinutes);
    const margin = hc.cycleRemainingAtHome;
    const firstOnDock = winner.loads.find((o) => !o.dockOff && o.dockMinutes >= 60);

    let previewTrade: WeekTradePreview | null = null;
    let tradeText = `Protect ON-duty dock and pre-trip minutes tightly, or trim one load's dwell.`;

    if (firstOnDock) {
      const applyHomeDock = (d: WeekPlanDraft) => {
        const next = cloneDraft(d);
        const t = next.loads.find((x) => x.id === firstOnDock.id);
        if (t) t.dockOff = true;
        return next;
      };
      const afterHomeRes = verifyTradeDraft(applyHomeDock(draft), 'both');
      const afterHome = afterHomeRes.winner.homeCheck;
      if (
        afterHome
        && afterHomeRes.winner.violations.length <= winner.violations.length
        && (afterHome.cycleRemainingAtHome > hc.cycleRemainingAtHome || afterHome.slackMinutes > hc.slackMinutes)
      ) {
        const gainCyc = Math.max(0, afterHome.cycleRemainingAtHome - hc.cycleRemainingAtHome);
        const homeOutcome = afterHome.meetsTarget
          ? `reaches home on time with ${dur(afterHome.cycleRemainingAtHome)} cycle left`
          : `leaves ${dur(afterHome.cycleRemainingAtHome)} cycle left (${dur(Math.abs(afterHome.slackMinutes))} past home)`;
        previewTrade = {
          id: `relieve-home-dock-${firstOnDock.id}`,
          label: `Relieve ${firstOnDock.displayName} dock OFF duty`,
          description: gainCyc > 0
            ? `Recovers +${dur(gainCyc)} of cycle — ${homeOutcome}.`
            : `Shifts your finish to ${afterHome.actualFinish.homeShort} — ${homeOutcome}.`,
          apply: applyHomeDock,
        };
        tradeText = `Log ${firstOnDock.displayName}'s dock wait OFF duty (when relieved) — ${homeOutcome}.`;
      }
    }

    const lastLoad = winner.loads[winner.loads.length - 1];
    const breakPhrase = detentionBreakMinutes !== null
      ? `Any extra ${dur(detentionBreakMinutes)} of ON-duty detention exhausts your ${cycleLimit / 60}-hour cycle`
      : `Cycle margin at home is ${dur(margin)}`;
    conflicts.push({
      id: 'home-time-fragility',
      kind: 'home_time_short',
      severity: pastBy >= 60 ? 'bad' : 'warn',
      priority: pastBy >= 60 ? 18 : 30,
      title: pastBy > 0
        ? `Home time — ${dur(pastBy)} past target (${dur(margin)} cycle margin)`
        : `Tight cycle margin at home (${dur(margin)} left)`,
      body: pastBy > 0
        ? `${lastLoad ? lastLoad.displayName : 'Your week'} reaches home ${hc.actualFinish.homeShort} — ${dur(pastBy)} past your ${hc.target.homeShort} target with only ${dur(margin)} left on your ${cycleLimit / 60}-hour cycle. ${breakPhrase} until the next ${boundaryWord} drop-off.`
        : `You reach home ${hc.actualFinish.homeShort} (${dur(hc.slackMinutes)} early), but only ${dur(margin)} remains on your ${cycleLimit / 60}-hour cycle — ${breakPhrase}.`,
      priceLabel: pastBy > 0 ? `${dur(pastBy)} past home · ${dur(margin)} margin` : `Only ${dur(margin)} cycle left`,
      tradeText,
      previewTrade,
    });
  }

  // 6. Time-Zone Jump / Parking Sweet-Spot Advisory (only if room & noteworthy)
  const crossZoneLoad = winner.loads.find((o) => !o.sameZone);
  if (crossZoneLoad && conflicts.length < 3) {
    conflicts.push({
      id: `tz-advisory-${crossZoneLoad.id}`,
      kind: 'tz_and_parking',
      severity: 'info',
      priority: 50,
      title: `Time-zone crossing on ${crossZoneLoad.displayName} (${zoneShort(homeTz)} → ${zoneShort(crossZoneLoad.apptTimeZone)})`,
      body: `${crossZoneLoad.displayName} delivers in ${zoneShort(crossZoneLoad.apptTimeZone)} time (${crossZoneLoad.arrival.apptShort} local / ${crossZoneLoad.arrival.homeShort} home). All ${boundaryWord} cycle drop-offs stay anchored to ${homeZoneName} home-terminal time.${crossZoneLoad.ptaInSweetSpot ? ` PTA (${crossZoneLoad.pta.apptShort}) lands in the 08:00–10:00 local parking sweet spot.` : ''}`,
      priceLabel: `${zoneShort(homeTz)} ↔ ${zoneShort(crossZoneLoad.apptTimeZone)}`,
      tradeText: `Double-check ${crossZoneLoad.displayName}'s roll-out in ${homeZoneName} time (${crossZoneLoad.rollOut.homeShort}) before setting your alarm.`,
      previewTrade: null,
    });
  }

  conflicts.sort((a, b) => a.priority - b.priority);

  // M4: activeStrategy defaults to the recommended winner (manual toggle in UI overrides locally)
  const activeStrategy = winner;
  const verdict = buildWeekVerdict(
    winner,
    bestReset34,
    recaps,
    recommendedStrategy,
    activeLoads.length,
    staleLoads,
    conflicts,
    provisional,
    provisionalReason,
    cycleLimit,
    boundaryWord,
    macroRecap,
    detentionBreakMinutes,
  );

  // ---------- Build Copyable Dispatch Summary ----------
  const dispatchText = buildWeekDispatchText(winner, conflicts, baseMph, homeZoneName, verdict.headline);

  // ---------- Build 1-Line Plan Hub Capstone Summary ----------
  const hubSummary = buildHubSummary(activeLoads.length, staleLoads.length, draft.homeTarget, winner, conflicts, verdict, homeTz);

  return {
    now,
    homeTimeZone: homeTz,
    homeZoneName,
    dayStartWord: boundaryWord,
    cycleLimit,
    cycleWindowDays,
    effectiveMph: baseMph,
    startingEval,
    cycleRemainingNow: startingEval.cycle.remaining,
    driveRemainingNow: startingEval.shift.driveRemaining,
    windowRemainingNow: startingEval.shift.windowRemaining,
    upcomingDropOffs,
    provisional,
    provisionalReason,
    activeLoadCount: activeLoads.length,
    staleLoads,
    recaps,
    reset34: bestReset34,
    recommendedStrategy,
    activeStrategy,
    macroRecap,
    conflicts,
    verdict,
    activePreviewTradeId: null,
    dispatchText,
    hubSummary,
  };
}

/** L9: Name the binding tight margin (appointment slack vs home slack vs cycle) with its real value. */
function bindingTightMarginLabel(winner: WeekStrategyResult): string {
  const minCycle = Math.min(winner.cycleRemainingAtEnd, winner.minLoadCycleRemaining);
  const cands: { val: number; text: string }[] = [];
  if (minCycle < 60) cands.push({ val: minCycle, text: `${dur(minCycle)} cycle` });
  if (winner.minApptSlackMinutes !== null && winner.minApptSlackMinutes < 60) {
    cands.push({ val: winner.minApptSlackMinutes, text: `${dur(winner.minApptSlackMinutes)} appt slack` });
  }
  if (winner.homeCheck !== null && winner.homeCheck.slackMinutes < 60) {
    const hs = winner.homeCheck.slackMinutes;
    cands.push({
      val: hs,
      text: hs < 0 ? `${dur(Math.abs(hs))} past home` : `${dur(hs)} home slack`,
    });
  }
  if (cands.length > 0) {
    cands.sort((a, b) => a.val - b.val);
    return cands[0].text;
  }
  if (winner.totalMidnightGateMinutes > 0) {
    const gated = winner.loads.filter((o) => o.midnightGateMinutes > 0);
    const allRestart = gated.length > 0 && gated.every((o) => o.midnightGateKind === 'restart34');
    return `${dur(winner.totalMidnightGateMinutes)} ${allRestart ? 'restart wait' : 'recap hold'}`;
  }
  if (winner.usesSplit) return 'uses split';
  return `${dur(minCycle)} cycle`;
}

function buildWeekVerdict(
  winner: WeekStrategyResult,
  reset34: WeekStrategyResult,
  recaps: WeekStrategyResult,
  recommendedStrategy: WeekStrategyId,
  activeLoadCount: number,
  staleLoads: WeekStaleLoad[],
  conflicts: WeekConflict[],
  provisional: boolean,
  provisionalReason: string | null,
  cycleLimit: number,
  boundaryWord: string,
  macroRecap: RecapComparison,
  detentionBreakMinutes: number | null,
): WeekSynthesisResult['verdict'] {
  const splitCallout = winner.usesSplit ? SPLIT_SB_CALLOUT : null;
  const actionableConflicts = conflicts.filter((c) => c.severity !== 'info');
  const tradeCount = actionableConflicts.length;
  const hasStale = staleLoads.length > 0;

  // Empty week (0 active loads)
  if (activeLoadCount === 0) {
    const cycleLeftStr = dur(winner.cycleRemainingAtEnd);
    // L5: Past-due booked load not in log -> conflict, never All clear
    if (hasStale) {
      const names = staleLoads.map((s) => s.displayName).join(', ');
      return {
        status: 'conflict',
        tone: 'bad',
        sign: 'stop',
        label: provisional ? 'Conflict (Provisional)' : 'Conflict — past-due load',
        headline: `${staleLoads.length} past-due load${staleLoads.length === 1 ? '' : 's'} not logged (${names}) — mark done or move appointment.`,
        subline: `${cycleLeftStr} left on your ${cycleLimit / 60}-hr cycle`,
        fragilityNote: provisional ? provisionalReason : null,
        splitCallout: null,
      };
    }
    if (provisional) {
      return {
        status: 'provisional',
        tone: 'warn',
        sign: 'warn',
        label: 'Provisional — add loads',
        headline: `${cycleLeftStr} left on your ${cycleLimit / 60}-hr cycle (unconfirmed log history). Add 1–5 loads to check your whole week.`,
        subline: provisionalReason ?? 'Add loads below or import from Can I take this load?',
        fragilityNote: null,
        splitCallout: null,
      };
    }
    return {
      status: 'all_clear',
      tone: 'good',
      sign: 'go',
      label: 'Ready to map',
      headline: `${cycleLeftStr} left on your ${cycleLimit / 60}-hr cycle — ${macroRecap.verdict.headline}`,
      subline: 'Add 1–5 upcoming loads and your home-time target to chain them together.',
      fragilityNote: null,
      splitCallout: null,
    };
  }

  const hasSevereConflict =
    hasStale
    || winner.violations.length > 0
    || winner.missedApptCount > 0
    || conflicts.some((c) => c.kind === 'split_trap')
    || (winner.homeCheck !== null && winner.homeCheck.slackMinutes <= -60);

  // H3: Tight when minimum per-load cycle < 60m OR end cycle < 60m OR appt slack < 60m OR home slack < 60m
  const minCycle = Math.min(winner.cycleRemainingAtEnd, winner.minLoadCycleRemaining);
  const isTight =
    !hasSevereConflict
    && (
      minCycle < 60
      || (winner.minApptSlackMinutes !== null && winner.minApptSlackMinutes < 60)
      || (winner.homeCheck !== null && winner.homeCheck.slackMinutes < 60)
      || winner.totalMidnightGateMinutes > 0
      || winner.usesSplit
      || tradeCount > 0
    );

  // Build plain-English headline
  const stratPhrase = recommendedStrategy === 'recaps' ? 'on recaps' : 'with a 34-hr reset';
  const loadWord = `${activeLoadCount} load${activeLoadCount === 1 ? '' : 's'}`;
  const splitSuffix = winner.usesSplit
    ? ` using a ${winner.loads.find((o) => o.usedSplit)?.splitKind === 'split82' ? '8/2' : '7/3'} split`
    : '';
  const gateLoad = winner.loads.find((o) => o.midnightGateMinutes > 0);
  const gatePhrase = gateLoad
    ? gateLoad.midnightGateKind === 'restart34'
      ? `, hold ${gateLoad.displayName} roll-out ${dur(gateLoad.midnightGateMinutes)} to finish 34h restart`
      : `, hold ${gateLoad.displayName} roll-out ${dur(gateLoad.midnightGateMinutes)} for ${boundaryWord}`
    : '';
  const homePhrase = winner.homeCheck
    ? winner.homeCheck.meetsTarget
      ? `, home ${winner.homeCheck.actualFinish.homeShort} (${dur(winner.homeCheck.slackMinutes)} early)`
      : `, home ${winner.homeCheck.actualFinish.homeShort} (${dur(Math.abs(winner.homeCheck.slackMinutes))} past target)`
    : '';

  let headline: string;
  if (hasSevereConflict) {
    const top = actionableConflicts[0];
    if (hasStale && !top && winner.violations.length === 0 && winner.missedApptCount === 0) {
      const names = staleLoads.map((s) => s.displayName).join(', ');
      headline = `${staleLoads.length} past-due load${staleLoads.length === 1 ? '' : 's'} not logged (${names}) — confirm or reschedule before trusting the rest of the week.`;
    } else if (top) {
      headline = `${top.title} — ${top.priceLabel}.`;
    } else if (winner.missedApptCount > 0) {
      headline = `${winner.missedApptCount} appointment${winner.missedApptCount === 1 ? '' : 's'} can't be met legally — worst miss is ${dur(winner.maxApptLateMinutes)}.`;
    } else {
      headline = `Won't all fit legally — ${dur(winner.cycleRemainingAtEnd)} left on your ${cycleLimit / 60}-hr cycle.`;
    }
  } else if (recommendedStrategy === 'recaps' && (reset34.missedApptCount > 0 || (reset34.homeCheck !== null && !reset34.homeCheck.meetsTarget))) {
    headline = `All ${loadWord} fit ${stratPhrase}${splitSuffix} — skip the 34${gatePhrase}${homePhrase} with ${dur(winner.cycleRemainingAtEnd)} of cycle left.`;
  } else {
    headline = `All ${loadWord} fit ${stratPhrase}${splitSuffix}${gatePhrase}${homePhrase} (${dur(winner.cycleRemainingAtEnd)} cycle left).`;
  }

  const subParts = [
    loadWord,
    `${winner.totalMiles.toLocaleString('en-US')} mi`,
    winner.homeCheck
      ? `Cycle at home: ${dur(winner.homeCheck.cycleRemainingAtHome)}`
      : `Cycle left: ${dur(winner.cycleRemainingAtEnd)}`,
  ];
  const subline = subParts.join(' · ');

  const fragilityNote =
    !hasSevereConflict && winner.cycleRemainingAtEnd < 60
      ? (detentionBreakMinutes !== null
          ? `Fragile margin: only ${dur(winner.cycleRemainingAtEnd)} left on your ${cycleLimit / 60}-hr cycle — any +${dur(detentionBreakMinutes)} extra ON-duty dock delay breaks the plan.`
          : `Fragile margin: only ${dur(winner.cycleRemainingAtEnd)} left on your ${cycleLimit / 60}-hr cycle.`)
      : null;

  if (hasSevereConflict) {
    const staleOnly = hasStale && winner.violations.length === 0 && winner.missedApptCount === 0 && !conflicts.some((c) => c.kind === 'split_trap');
    return {
      status: 'conflict',
      tone: 'bad',
      sign: 'stop',
      label: provisional ? 'Conflict (Provisional)' : staleOnly ? 'Conflict — past-due load' : `Conflict — won't all fit`,
      headline,
      subline,
      fragilityNote,
      splitCallout,
    };
  }
  if (provisional) {
    return {
      status: 'provisional',
      tone: 'warn',
      sign: 'warn',
      label: 'Provisional — check log',
      headline,
      subline,
      fragilityNote: provisionalReason ?? fragilityNote,
      splitCallout,
    };
  }
  if (isTight) {
    const tradeLabel = tradeCount > 0 ? `${tradeCount} trade${tradeCount === 1 ? '' : 's'}, ` : '';
    const marginText = bindingTightMarginLabel(winner);
    return {
      status: 'tight',
      tone: 'warn',
      sign: 'warn',
      label: `Tight — ${tradeLabel}${marginText}`,
      headline,
      subline,
      fragilityNote,
      splitCallout,
    };
  }
  return {
    status: 'all_clear',
    tone: 'good',
    sign: 'go',
    label: 'All clear',
    headline,
    subline,
    fragilityNote: null,
    splitCallout,
  };
}

function buildWeekDispatchText(
  winner: WeekStrategyResult,
  conflicts: WeekConflict[],
  mph: number,
  homeZoneName: string,
  headline: string,
): string {
  const lines: string[] = [];
  lines.push(`Week Plan (${winner.label}, ${homeZoneName} terminal):`);
  lines.push(headline);
  for (const o of winner.loads) {
    const apptPart = o.appointment
      ? ` | Appt ${o.appointment.apptShort} (${o.meetsAppt ? `${dur(o.apptSlackMinutes ?? 0)} early` : `LATE ${dur(Math.abs(o.apptSlackMinutes ?? 0))}`})`
      : '';
    const gatePart = o.midnightGateMinutes > 0
      ? (o.midnightGateKind === 'restart34'
          ? ` [34h restart wait +${dur(o.midnightGateMinutes)}]`
          : ` [recap hold +${dur(o.midnightGateMinutes)}]`)
      : '';
    lines.push(
      `- ${o.displayName}: Roll ${o.rollOut.homeShort}${gatePart} -> Arr ${o.arrival.apptShort}${apptPart} | PTA ${o.pta.apptShort} | Cycle left ${dur(o.cycleRemainingAfter)}`,
    );
  }
  const topConflicts = conflicts.filter((c) => c.severity !== 'info').slice(0, 2);
  for (const c of topConflicts) {
    lines.push(`Note: ${c.title} — ${c.tradeText}`);
  }
  if (winner.homeCheck) {
    lines.push(
      `Home target: ${winner.homeCheck.target.homeShort} | Projected finish: ${winner.homeCheck.actualFinish.homeShort} (${winner.homeCheck.meetsTarget ? `${dur(winner.homeCheck.slackMinutes)} early` : `${dur(Math.abs(winner.homeCheck.slackMinutes))} past target`})`,
    );
  }
  lines.push(`${WEEK_STANDING_DISCLAIMER_PREFIX} ${mph} mph — my ELD governs.`);
  return lines.join('\n');
}

function buildHubSummary(
  activeLoadCount: number,
  staleLoadCount: number,
  homeTarget: WeekHomeTarget | null,
  winner: WeekStrategyResult,
  conflicts: WeekConflict[],
  verdict: WeekSynthesisResult['verdict'],
  homeTz: string,
): string {
  if (activeLoadCount === 0 && staleLoadCount === 0) {
    return 'Stack 1–5 upcoming loads + home time — one chained verdict, priced conflicts, and Recaps vs. 34.';
  }
  if (activeLoadCount === 0 && staleLoadCount > 0) {
    return `${staleLoadCount} past-due load${staleLoadCount === 1 ? '' : 's'} · Conflict — confirm or reschedule`;
  }
  const parts: string[] = [`${activeLoadCount} load${activeLoadCount === 1 ? '' : 's'}`];
  if (homeTarget) {
    const hm = resolveWallDateTime(homeTarget.date, homeTarget.time, homeTz);
    if (hm !== null) parts.push(`Home ${terminalClock(hm, homeTz, true)}`);
  }
  const trades = conflicts.filter((c) => c.severity !== 'info').length;
  // H3(c): Hub subtitle strictly follows `verdict.status` (never "All clear" on Tight/Conflict/Provisional).
  if (verdict.status === 'conflict') {
    if (staleLoadCount > 0 && trades === 0) parts.push(`${staleLoadCount} past-due · conflict`);
    else parts.push(`${trades || 1} conflict${trades === 1 ? '' : 's'} flagged`);
  } else if (verdict.status === 'provisional') {
    parts.push('Provisional — verify log');
  } else if (verdict.status === 'tight') {
    const marginText = bindingTightMarginLabel(winner);
    if (trades > 0) parts.push(`Tight · ${trades} trade${trades === 1 ? '' : 's'} · ${marginText}`);
    else parts.push(`Tight · ${marginText}`);
  } else {
    parts.push(`All clear · ${dur(winner.cycleRemainingAtEnd)} cycle left`);
  }
  return parts.join(' · ');
}

/** Create a clean new load draft appended to the week plan. */
export function createNextWeekLoad(
  existingLoads: WeekLoadDraft[],
  now: number,
  config: RulesConfig,
): WeekLoadDraft {
  const safeCfg = safeRulesConfig(config);
  const homeTz = isValidTimeZone(safeCfg.timeZone) ? safeCfg.timeZone : 'UTC';
  const idx = existingLoads.length + 1;
  const usedIds = new Set(existingLoads.map((l) => l.id));
  let id = `load-${idx}`;
  let n = idx;
  while (usedIds.has(id)) id = `load-${++n}`;

  // Default appointment suggestion: +24h after last load's appointment (or next morning >=22h ahead)
  let baseMin = now + 24 * 60;
  const last = existingLoads[existingLoads.length - 1];
  if (last?.hasAppt && last.apptDate) {
    const lastTz = last.apptTimeZone && isValidTimeZone(last.apptTimeZone) ? last.apptTimeZone : homeTz;
    const parsed = resolveWallDateTime(last.apptDate, last.apptTime, lastTz);
    if (parsed !== null && parsed > now) baseMin = parsed + 24 * 60;
  }
  const wd = formatWallDateTime(baseMin, homeTz);
  return {
    ...DEFAULT_WEEK_LOAD,
    id,
    label: '',
    hasAppt: false,
    apptDate: wd.date,
    apptTime: '08:00',
    apptTimeZone: '',
  };
}
