/**
 * Weekly Recap vs. 34-Hour Reset & Home-Time Planner — pure projection engine.
 *
 * Built strictly on the existing HOS engine (`engine/src/index.ts`) and store
 * helpers (`web/src/store.ts`) without modifying `store.ts`.
 *
 * Models the next 7 planned shifts (straddling 7–8 carrier days for overnight
 * linehaul schedules) side-by-side under two strategies:
 *   (A) Keep Running Recaps
 *   (B) Take a 34-Hour Reset starting at a driver-chosen day/time
 *
 * Overnight shifts that cross the carrier-day boundary (`config.dayStartHour` in
 * `config.timeZone`) split cleanly across the two carrier days they straddle:
 *   - Leg 1 runs before the carrier-day roll against the current rolling window.
 *   - At the carrier-day roll, the oldest day in the window (`windowDays` ago)
 *     drops off, replenishing the rolling cycle.
 *   - Leg 2 runs after the carrier-day roll against the replenished rolling window.
 *
 * Respects both 70-hour/8-day (`70/8`) and 60-hour/7-day (`60/7`) cycle rules,
 * arbitrary `dayStartHour` (0–23), and DST transitions in the home-terminal
 * timezone via `carrierDayStart`, `nextCarrierDayStart`, `dayLabel`, and
 * `localToMinute`.
 */
import type { RulesConfig, Segment } from '../../engine/src/index.ts';
import {
  LIMITS,
  carrierDayStart,
  dayLabel,
  evaluate,
  localToMinute,
  nextCarrierDayStart,
} from '../../engine/src/index.ts';
import { cycleParamsOf, dur } from './store.ts';

export const PROJECTION_SHIFTS = 7;
export const SHIFT_BUDGET_PRESETS = [
  { label: '8h', minutes: 480 },
  { label: '8h 30m', minutes: 510 },
  { label: '9h 30m', minutes: 570 },
  { label: '10h', minutes: 600 },
  { label: '11h', minutes: 660 },
] as const;
export const SHIFT_START_PRESETS = [
  { label: '21:00', minutes: 21 * 60, tag: 'Night' },
  { label: '18:00', minutes: 18 * 60, tag: 'Evening' },
  { label: '06:00', minutes: 6 * 60, tag: 'Day' },
] as const;
export const RESET_TIME_PRESETS = [
  { label: '08:00', minutes: 8 * 60 },
  { label: '10:00', minutes: 10 * 60 },
  { label: '18:00', minutes: 18 * 60 },
  { label: '22:00', minutes: 22 * 60 },
] as const;

export interface RecapPlanInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current epoch minute. */
  now: number;
  /** Carrier rules config (cycle, dayStartHour, timeZone). */
  config: RulesConfig;
  /** Default planned shift length in minutes (0..840). */
  defaultShiftMinutes: number;
  /** Optional per-shift overrides for the 7 projected shifts; null uses `defaultShiftMinutes`. */
  customShiftMinutes?: (number | null)[];
  /** Planned shift start wall-clock time in home-terminal minutes from 00:00 (0..1439). Default 21:00 (1260). */
  shiftStartMinutes?: number;
  /** Strategy B: epoch minute when the 34-hour reset starts (>= now). */
  resetStart: number;
  /**
   * Optional Home Time target: number of upcoming shifts (1..7) to complete before
   * arriving home / taking a day off. Null when no home-time target is set.
   */
  homeTargetShifts?: number | null;
}

export interface PastDaySummary {
  start: number;
  end: number;
  label: string;
  shortLabel: string;
  dayShort: string;
  onDuty: number;
  hasEntries: boolean;
  clearedByRestart: boolean;
  isToday: boolean;
}

export interface ProjectedShift {
  index: number;
  /** Carrier day index (into the full day list) on which this shift starts. */
  dayIdx: number;
  dayStart: number;
  dayEnd: number;
  /** ISO date label (home-terminal) of the carrier day this shift starts on. */
  label: string;
  /** Short weekday + date, e.g. "Thu 12". */
  shortLabel: string;
  /** Short weekday only, e.g. "Thu". */
  dayShort: string;
  /** Shift start & planned end in epoch minutes. */
  shiftStart: number;
  shiftEnd: number;
  /** Planned total shift minutes, split into Leg 1 (on dayIdx) and Leg 2 (on dayIdx+1 after carrier-day roll). */
  plannedMinutes: number;
  plannedLeg1: number;
  plannedLeg2: number;
  /** Whether the planned shift straddles the carrier-day boundary (`plannedLeg2 > 0`). */
  crossesBoundary: boolean;
  /** Available cycle hours at the start of `dayIdx` (before any work on `dayIdx`). */
  availAtDayStart: number;
  /** Exact recap drop-off occurring at `dayStart` of `dayIdx`. */
  dropsOffAtDayStart: number;
  /** Exact recap drop-off occurring at the carrier-day roll `dayEnd` (into `dayIdx + 1`), if shift crosses boundary. */
  dropsOffAtNextRoll: number;
  /** Available cycle hours immediately before this shift begins (`shiftStart`). */
  availBeforeShift: number;
  /** Available cycle hours immediately after the carrier-day roll (`dayEnd`), after Leg 1 is applied. */
  availAfterRoll: number;
  /** Legally usable minutes for Leg 1, Leg 2, and total for this shift. */
  usableLeg1: number;
  usableLeg2: number;
  usableMinutes: number;
  /** Minutes pinched off below the planned shift budget (`plannedMinutes - usableMinutes`). */
  shortfallMinutes: number;
  /** True when `plannedMinutes > 0 && usableMinutes < plannedMinutes`. */
  pinched: boolean;
  /** Strategy B metadata: true if the shift is wholly or partly blocked by the 34-hour reset window. */
  blockedByReset: boolean;
  /** Strategy B metadata: minutes lost directly to being off-duty during the 34h reset window. */
  resetOverlapMinutes: number;
  /** Strategy B metadata: true if the 34-hour reset completes on this shift's carrier day (or before this shift's Leg 2). */
  resetCompletesHere: boolean;
}

export interface RecapWallInfo {
  shiftIndex: number;
  label: string;
  shortLabel: string;
  dayShort: string;
  plannedMinutes: number;
  usableMinutes: number;
  shortfallMinutes: number;
}

export interface StrategyProjection {
  shifts: ProjectedShift[];
  /** Carrier-day summary for the next 7–8 carrier days (from first projected shift's day through the day after shift 6). */
  days: ProjectedCarrierDay[];
  totalPlannedMinutes: number;
  totalUsableMinutes: number;
  wall: RecapWallInfo | null;
  /** Simulated on-duty (and 34h OFF for Strategy B) segments generated by this strategy. */
  simSegments: Segment[];
}

export interface ProjectedCarrierDay {
  dayStart: number;
  dayEnd: number;
  label: string;
  shortLabel: string;
  dayShort: string;
  /** Exact hours dropping off the rolling window at `dayStart` (carrier-day roll). */
  dropsOff: number;
  /** Available cycle hours at `dayStart` (after `dropsOff`, before any work on this carrier day). */
  availAtStart: number;
  /** Total on-duty hours placed on this carrier day (existing today + Leg 2 of previous night + Leg 1 of tonight). */
  onDutyTotal: number;
  /** Available cycle hours at the end of this carrier day. */
  availAtEnd: number;
  /** True if Strategy B's 34-hour reset finishes inside [dayStart, dayEnd). */
  resetFinishesOnDay: boolean;
}

export interface HomeTimeEvaluation {
  targetShifts: number;
  /** Carrier day label when the driver is home / off (the day after the last pre-home shift starts). */
  homeDayLabel: string;
  homeDayShort: string;
  homeDayShortDate: string;
  /** Whether Strategy A (Recaps) completes all pre-home shifts with zero pinch. */
  reachesLegally: boolean;
  /** Total planned minutes across the pre-home shifts. */
  plannedBeforeHome: number;
  /** Usable minutes before home time under Strategy A (Recaps). */
  usableBeforeHomeRecaps: number;
  /** Usable minutes before home time under Strategy B (34-Hour Reset). */
  usableBeforeHomeReset34: number;
  /** Total shortfall minutes before home time under Recaps (`planned - usable`). */
  shortfallMinutes: number;
  /** First Recap Wall occurring before home time, if any. */
  wallBeforeHome: RecapWallInfo | null;
  /** Exact max uniform shift length (minutes, 0..840) that cruises to home time on recaps with zero pinch. */
  cruiseCapMinutes: number;
}

export interface BestResetSuggestion {
  resetStart: number;
  resetEnd: number;
  startLabel: string;
  totalUsableMinutes: number;
  deltaMinutes: number;
}

export interface VerdictBanner {
  tone: 'good' | 'warn' | 'bad';
  headline: string;
  homeLine: string | null;
  tipLine: string | null;
}

export interface RecapComparison {
  cycle: RulesConfig['cycle'];
  limit: number;
  windowDays: number;
  dayStartHour: number;
  timeZone: string;
  /** Historical rolling window days derived from the store's logged segments. */
  pastDays: PastDaySummary[];
  /** Number of past window days (excluding days cleared by a prior 34h restart) with zero logged segments. */
  unloggedPastDays: number;
  /** Cycle used / remaining at `now` from the engine's `evaluate()`. */
  usedNow: number;
  remainingNow: number;
  priorRestartEnd: number | null;
  /** Chosen 34-hour reset window [resetStart, resetEnd) in epoch minutes + home-terminal labels. */
  resetStart: number;
  resetEnd: number;
  resetStartLabel: string;
  resetEndLabel: string;
  /** First projected shift's carrier day starts at `shifts[0].dayStart`. */
  shiftStartMinutes: number;
  defaultShiftMinutes: number;
  recaps: StrategyProjection;
  reset34: StrategyProjection;
  /** `reset34.totalUsableMinutes - recaps.totalUsableMinutes`. Positive = 34h reset nets more usable hours. */
  netDeltaMinutes: number;
  /** Best 34-hour reset start across candidate upcoming days at the same start time-of-day, if it beats recaps. */
  bestReset: BestResetSuggestion | null;
  homeTime: HomeTimeEvaluation | null;
  verdict: VerdictBanner;
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse "YYYY-MM-DD" into short weekday ("Thu") and weekday+day ("Thu 12") and full short date ("Thu Nov 12"). */
export function parseIsoDay(iso: string): { dayShort: string; shortLabel: string; longShort: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { dayShort: iso, shortLabel: iso, longShort: iso };
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const dow = DOW_SHORT[dt.getUTCDay()];
  const mon = MON_SHORT[+m[2] - 1];
  const day = +m[3];
  return { dayShort: dow, shortLabel: `${dow} ${day}`, longShort: `${dow} ${mon} ${day}` };
}

/** Format an epoch minute in the carrier's home-terminal timezone as "Wed 08:00". */
export function terminalClock(minute: number, timeZone: string, withDay = true): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hm = `${get('hour')}:${get('minute')}`;
  return withDay ? `${get('weekday')} ${hm}` : hm;
}

/** Format minutes from midnight (0..1439) as "HH:MM". */
export function fmtWallHM(wallMinutes: number): string {
  const m = ((Math.round(wallMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Exact epoch minute for a home-terminal wall-clock time (`wallMinutes` in 0..1439)
 * that falls inside carrier day `[dayStart, dayEnd)`.
 *
 * When `dayStartHour > 0` (e.g., 06:00), wall times `< dayStartHour` (e.g., 02:00)
 * occur on the next calendar date while still belonging to this carrier day.
 */
export function wallMinuteInCarrierDay(
  dayStart: number,
  dayEnd: number,
  wallMinutes: number,
  config: RulesConfig,
): number {
  const lbl = dayLabel(dayStart, config);
  const [y, mo, d] = lbl.split('-').map(Number);
  const norm = ((Math.round(wallMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const min = norm % 60;
  const base = h < config.dayStartHour
    ? new Date(Date.UTC(y, mo - 1, d + 1))
    : new Date(Date.UTC(y, mo - 1, d));
  const minute = localToMinute(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    h,
    config.timeZone,
  ) + min;
  return Math.max(dayStart, Math.min(dayEnd - 1, minute));
}

/** Default 34-hour reset start: tomorrow at 08:00 home-terminal time (clamped >= now). */
export function defaultResetStart(now: number, config: RulesConfig, dayOffset = 1, wallMinutes = 8 * 60): number {
  let ds = carrierDayStart(now, config);
  for (let i = 0; i < dayOffset; i++) ds = nextCarrierDayStart(ds, config);
  const de = nextCarrierDayStart(ds, config);
  const cand = wallMinuteInCarrierDay(ds, de, wallMinutes, config);
  return Math.max(now, cand);
}

interface DayFrame {
  start: number;
  end: number;
  label: string;
  shortLabel: string;
  dayShort: string;
}

/**
 * Internal rolling-cycle simulator shared by Strategy A (resetStart = null)
 * and Strategy B (resetStart = epoch minute).
 */
function simulateStrategy(
  frames: DayFrame[],
  initialBuckets: number[],
  firstShiftDayIdx: number,
  plannedShifts: number[],
  shiftStartMinutes: number,
  config: RulesConfig,
  limit: number,
  windowDays: number,
  resetStart: number | null,
): StrategyProjection {
  const buckets = [...initialBuckets];
  const resetEnd = resetStart !== null ? resetStart + LIMITS.RESTART : null;
  let restartApplied = false;

  const dayDropsOff = new Map<number, number>();
  const dayAvailAtStart = new Map<number, number>();
  const dayOnDutySnap = new Map<number, number>();
  const dayAvailAtEndSnap = new Map<number, number>();

  /** Sum of on-duty minutes in the rolling window ending on `dayIdx` (inclusive). */
  const windowUsedThrough = (dayIdx: number): number => {
    let sum = 0;
    const from = Math.max(0, dayIdx - (windowDays - 1));
    for (let i = from; i <= dayIdx; i++) sum += buckets[i];
    return sum;
  };

  /** Sum of on-duty minutes in the `windowDays - 1` completed carrier days strictly before `dayIdx`. */
  const windowUsedBeforeDay = (dayIdx: number): number => {
    let sum = 0;
    const from = Math.max(0, dayIdx - (windowDays - 1));
    for (let i = from; i < dayIdx; i++) sum += buckets[i];
    return sum;
  };

  const snapshotDayEnd = (dayIdx: number) => {
    if (dayOnDutySnap.has(dayIdx)) return;
    dayOnDutySnap.set(dayIdx, buckets[dayIdx]);
    dayAvailAtEndSnap.set(dayIdx, Math.max(0, limit - windowUsedThrough(dayIdx)));
  };

  const applyRestartUpTo = (dayIdx: number) => {
    if (restartApplied || resetEnd === null) return;
    // Preserve end-of-day totals for all completed days strictly before `dayIdx` before clearing.
    for (let d = firstShiftDayIdx; d < dayIdx; d++) snapshotDayEnd(d);
    restartApplied = true;
    // All on-duty work prior to `resetEnd` is cleared by the 34-hour restart (§395.3(c)).
    for (let i = 0; i <= dayIdx && i < buckets.length; i++) buckets[i] = 0;
  };

  const simSegments: Segment[] = [];
  if (resetStart !== null && resetEnd !== null) {
    simSegments.push({ status: 'OFF', start: resetStart, end: resetEnd, tentative: true, note: '34h reset' });
  }

  /** Record carrier-day start snapshot (drop-off + available) once per day before its work starts. */
  const snapshotDayStart = (dayIdx: number) => {
    if (dayAvailAtStart.has(dayIdx)) return;
    if (dayIdx > firstShiftDayIdx) snapshotDayEnd(dayIdx - 1);
    if (resetEnd !== null && !restartApplied && frames[dayIdx].start >= resetEnd) {
      applyRestartUpTo(dayIdx);
    }
    const dropIdx = dayIdx - windowDays;
    const drop = dropIdx >= 0 ? buckets[dropIdx] : 0;
    dayDropsOff.set(dayIdx, drop);
    dayAvailAtStart.set(dayIdx, Math.max(0, limit - windowUsedBeforeDay(dayIdx)));
  };

  /**
   * Place work for a single carrier-day leg `[a, b)` on `dayIdx`, respecting any
   * 34-hour reset window `[resetStart, resetEnd)` and the rolling cycle limit.
   */
  const runLeg = (
    dayIdx: number,
    a: number,
    b: number,
  ): { usable: number; blocked: boolean; overlap: number; resetCompleted: boolean } => {
    if (b <= a) return { usable: 0, blocked: false, overlap: 0, resetCompleted: false };
    snapshotDayStart(dayIdx);

    if (resetStart === null || resetEnd === null) {
      const avail = Math.max(0, limit - windowUsedThrough(dayIdx));
      const usable = Math.min(b - a, avail);
      buckets[dayIdx] += usable;
      if (usable > 0) simSegments.push({ status: 'ON', start: a, end: a + usable, tentative: true, note: 'Planned shift' });
      return { usable, blocked: false, overlap: 0, resetCompleted: false };
    }

    const overlapStart = Math.max(a, resetStart);
    const overlapEnd = Math.min(b, resetEnd);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const blocked = overlap > 0;
    let usable = 0;
    let resetCompleted = false;

    // 1. Pre-reset piece [a, min(b, resetStart))
    const preEnd = Math.min(b, resetStart);
    if (preEnd > a) {
      const avail = Math.max(0, limit - windowUsedThrough(dayIdx));
      const u = Math.min(preEnd - a, avail);
      buckets[dayIdx] += u;
      usable += u;
      if (u > 0) simSegments.push({ status: 'ON', start: a, end: a + u, tentative: true, note: 'Planned shift' });
    }

    // 2. Post-reset piece [max(a, resetEnd), b)
    const postStart = Math.max(a, resetEnd);
    if (postStart < b) {
      if (!restartApplied) {
        applyRestartUpTo(dayIdx);
        resetCompleted = true;
      }
      const avail = Math.max(0, limit - windowUsedThrough(dayIdx));
      const u = Math.min(b - postStart, avail);
      buckets[dayIdx] += u;
      usable += u;
      if (u > 0) simSegments.push({ status: 'ON', start: postStart, end: postStart + u, tentative: true, note: 'Planned shift' });
    }

    return { usable, blocked, overlap, resetCompleted };
  };

  // Snapshot any day between today and firstShiftDayIdx
  snapshotDayStart(firstShiftDayIdx);

  const shifts: ProjectedShift[] = [];
  let wall: RecapWallInfo | null = null;

  for (let k = 0; k < plannedShifts.length; k++) {
    const dayIdx = firstShiftDayIdx + k;
    const frame = frames[dayIdx];
    const nextFrame = frames[dayIdx + 1];
    snapshotDayStart(dayIdx);

    const planned = Math.max(0, Math.min(LIMITS.WINDOW, Math.round(plannedShifts[k])));
    const shiftStart = wallMinuteInCarrierDay(frame.start, frame.end, shiftStartMinutes, config);
    const shiftEnd = shiftStart + planned;

    const leg1End = Math.min(shiftEnd, frame.end);
    const plannedLeg1 = Math.max(0, leg1End - shiftStart);
    const plannedLeg2 = Math.max(0, shiftEnd - frame.end);
    const crossesBoundary = plannedLeg2 > 0;

    // If the 34h reset finishes strictly before this shift starts, apply it now so
    // `availBeforeShift` reflects the freshly restarted cycle.
    let resetCompletesHere = false;
    if (resetEnd !== null && !restartApplied && shiftStart >= resetEnd) {
      applyRestartUpTo(dayIdx);
      resetCompletesHere = true;
    }

    const availBeforeShift = Math.max(0, limit - windowUsedThrough(dayIdx));

    // Leg 1 on dayIdx
    const r1 = runLeg(dayIdx, shiftStart, leg1End);
    if (r1.resetCompleted) resetCompletesHere = true;

    // Snapshot carrier-day roll into dayIdx + 1 (after Leg 1 on dayIdx is accounted for)
    snapshotDayStart(dayIdx + 1);
    const dropsOffAtNextRoll = dayDropsOff.get(dayIdx + 1) ?? 0;
    const availAfterRoll = dayAvailAtStart.get(dayIdx + 1) ?? Math.max(0, limit - windowUsedBeforeDay(dayIdx + 1));

    // Leg 2 on dayIdx + 1 (after carrier-day roll)
    const r2 = plannedLeg2 > 0
      ? runLeg(dayIdx + 1, nextFrame.start, shiftEnd)
      : { usable: 0, blocked: false, overlap: 0, resetCompleted: false };
    if (r2.resetCompleted) resetCompletesHere = true;

    // Also tag `resetCompletesHere` if resetEnd falls on `frame` even when the shift was 0m
    if (resetEnd !== null && resetEnd >= frame.start && resetEnd < frame.end) {
      resetCompletesHere = true;
    }

    const usableLeg1 = r1.usable;
    const usableLeg2 = r2.usable;
    const usableMinutes = usableLeg1 + usableLeg2;
    const shortfallMinutes = Math.max(0, planned - usableMinutes);
    const pinched = planned > 0 && usableMinutes < planned;

    const entry: ProjectedShift = {
      index: k,
      dayIdx,
      dayStart: frame.start,
      dayEnd: frame.end,
      label: frame.label,
      shortLabel: frame.shortLabel,
      dayShort: frame.dayShort,
      shiftStart,
      shiftEnd,
      plannedMinutes: planned,
      plannedLeg1,
      plannedLeg2,
      crossesBoundary,
      availAtDayStart: dayAvailAtStart.get(dayIdx) ?? 0,
      dropsOffAtDayStart: dayDropsOff.get(dayIdx) ?? 0,
      dropsOffAtNextRoll,
      availBeforeShift,
      availAfterRoll,
      usableLeg1,
      usableLeg2,
      usableMinutes,
      shortfallMinutes,
      pinched,
      blockedByReset: r1.blocked || r2.blocked,
      resetOverlapMinutes: r1.overlap + r2.overlap,
      resetCompletesHere,
    };
    shifts.push(entry);

    if (wall === null && pinched && !entry.blockedByReset) {
      wall = {
        shiftIndex: k,
        label: frame.label,
        shortLabel: frame.shortLabel,
        dayShort: frame.dayShort,
        plannedMinutes: planned,
        usableMinutes,
        shortfallMinutes,
      };
    }
  }

  // Ensure the final carrier day (day after last shift) is snapshotted
  const lastDayIdx = firstShiftDayIdx + plannedShifts.length;
  snapshotDayStart(lastDayIdx);
  snapshotDayEnd(lastDayIdx);

  const days: ProjectedCarrierDay[] = [];
  for (let d = firstShiftDayIdx; d <= lastDayIdx; d++) {
    const f = frames[d];
    const availAtStart = dayAvailAtStart.get(d) ?? 0;
    const dropsOff = dayDropsOff.get(d) ?? 0;
    const resetFinishesOnDay = resetEnd !== null && resetEnd >= f.start && resetEnd < f.end;
    const onDutyTotal = dayOnDutySnap.get(d) ?? buckets[d];
    const availAtEnd = dayAvailAtEndSnap.get(d) ?? Math.max(0, limit - windowUsedThrough(d));
    days.push({
      dayStart: f.start,
      dayEnd: f.end,
      label: f.label,
      shortLabel: f.shortLabel,
      dayShort: f.dayShort,
      dropsOff,
      availAtStart,
      onDutyTotal,
      availAtEnd,
      resetFinishesOnDay,
    });
  }

  const totalPlannedMinutes = shifts.reduce((a, x) => a + x.plannedMinutes, 0);
  const totalUsableMinutes = shifts.reduce((a, x) => a + x.usableMinutes, 0);

  return {
    shifts,
    days,
    totalPlannedMinutes,
    totalUsableMinutes,
    wall,
    simSegments: simSegments.sort((a, b) => a.start - b.start),
  };
}

/**
 * Exact binary search for the highest uniform shift length (in whole minutes, 0..840)
 * that completes all active pre-home shifts (`0 .. targetShifts - 1`) legally on recaps.
 * Shifts explicitly set to 0 minutes (planned days off) stay 0.
 */
function findCruiseCap(
  frames: DayFrame[],
  initialBuckets: number[],
  firstShiftDayIdx: number,
  plannedShifts: number[],
  targetShifts: number,
  shiftStartMinutes: number,
  config: RulesConfig,
  limit: number,
  windowDays: number,
): number {
  const activeMask = plannedShifts.slice(0, targetShifts).map((m) => m > 0);
  if (!activeMask.some(Boolean)) return 0;

  const fits = (cap: number): boolean => {
    const trial = activeMask.map((active) => (active ? cap : 0));
    const sim = simulateStrategy(
      frames,
      initialBuckets,
      firstShiftDayIdx,
      trial,
      shiftStartMinutes,
      config,
      limit,
      windowDays,
      null,
    );
    return sim.shifts.every((sh) => !sh.pinched);
  };

  let lo = 0;
  let hi = LIMITS.WINDOW; // 840 min (14h max shift)
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Build the plain-English verdict banner shown at the top of the planner. */
export function buildVerdict(
  recaps: StrategyProjection,
  reset34: StrategyProjection,
  resetStartLabel: string,
  bestReset: BestResetSuggestion | null,
  homeTime: HomeTimeEvaluation | null,
): VerdictBanner {
  const delta = reset34.totalUsableMinutes - recaps.totalUsableMinutes;
  const lastShift = recaps.shifts[recaps.shifts.length - 1];
  const endDayShort = lastShift ? lastShift.dayShort : 'Day 7';

  let tone: VerdictBanner['tone'] = 'good';
  let headline: string;
  let tipLine: string | null = null;

  if (recaps.totalPlannedMinutes === 0) {
    tone = 'good';
    headline = 'No shift hours planned yet — pick a nightly budget to compare recaps vs. a 34-hour reset.';
  } else if (recaps.wall) {
    const w = recaps.wall;
    tone = w.usableMinutes < 180 ? 'bad' : 'warn';
    if (delta > 0) {
      headline = `Recaps pinch to ${dur(w.usableMinutes)} on ${w.dayShort}; a 34 starting ${resetStartLabel} nets +${dur(delta)} by ${endDayShort}.`;
    } else if (delta === 0) {
      headline = `Recaps pinch to ${dur(w.usableMinutes)} on ${w.dayShort}; a 34 starting ${resetStartLabel} breaks even (${dur(reset34.totalUsableMinutes)}) by ${endDayShort}.`;
    } else {
      headline = `Recaps pinch to ${dur(w.usableMinutes)} on ${w.dayShort}, but still beat a 34 starting ${resetStartLabel} by +${dur(-delta)} through ${endDayShort}.`;
    }
    if (bestReset && bestReset.deltaMinutes > Math.max(0, delta)) {
      tipLine = `Better 34 timing: starting ${bestReset.startLabel} nets +${dur(bestReset.deltaMinutes)} vs. recaps.`;
    }
  } else {
    tone = 'good';
    if (delta < 0) {
      headline = `Recaps cover all ${recaps.shifts.length} shifts (${dur(recaps.totalUsableMinutes)}) with no wall — skipping a 34 saves +${dur(-delta)} through ${endDayShort}.`;
    } else {
      headline = `Recaps cover all ${recaps.shifts.length} shifts (${dur(recaps.totalUsableMinutes)}) with no wall — no 34-hour reset needed.`;
    }
  }

  let homeLine: string | null = null;
  if (homeTime) {
    if (homeTime.reachesLegally) {
      homeLine = `Home time (${homeTime.homeDayShortDate}): on track on recaps — up to ${dur(homeTime.cruiseCapMinutes)}/shift stays legal.`;
    } else {
      if (tone === 'good') tone = 'warn';
      homeLine = homeTime.cruiseCapMinutes > 0
        ? `Home time (${homeTime.homeDayShortDate}): short ${dur(homeTime.shortfallMinutes)} on recaps — cap shifts at ${dur(homeTime.cruiseCapMinutes)}/night to cruise there legally.`
        : `Home time (${homeTime.homeDayShortDate}): short ${dur(homeTime.shortfallMinutes)} on recaps — cycle is tapped out before home without a reset.`;
    }
  }

  return { tone, headline, homeLine, tipLine };
}

/**
 * Project the next 7 planned shifts side-by-side:
 *   Strategy A: Keep Running Recaps
 *   Strategy B: Take a 34-Hour Reset starting at `input.resetStart`
 */
export function projectRecapVs34(input: RecapPlanInput): RecapComparison {
  const { segments, now, config } = input;
  const logged = segments.filter((x) => !x.tentative);
  const { limit, windowDays } = cycleParamsOf(config);
  const ev = evaluate(logged, { asOf: now, config });
  const priorRestartEnd = ev.cycle.restartEnd;

  // 1. Historical window days derived strictly from `evaluate(logged)`
  const pastDays: PastDaySummary[] = ev.cycle.days.map((d, i) => {
    const p = parseIsoDay(d.label);
    const until = Math.min(d.end, now);
    const hasEntries = logged.some((x) => x.start < until && x.end > d.start);
    const clearedByRestart = priorRestartEnd !== null && d.end <= priorRestartEnd;
    return {
      start: d.start,
      end: d.end,
      label: d.label,
      shortLabel: p.shortLabel,
      dayShort: p.dayShort,
      onDuty: d.onDuty,
      hasEntries,
      clearedByRestart,
      isToday: i === ev.cycle.days.length - 1,
    };
  });
  const unloggedPastDays = pastDays.filter((d) => !d.hasEntries && !d.clearedByRestart).length;

  // 2. Build carrier-day calendar: past `windowDays` + 9 future carrier days
  const frames: DayFrame[] = pastDays.map((d) => ({
    start: d.start,
    end: d.end,
    label: d.label,
    shortLabel: d.shortLabel,
    dayShort: d.dayShort,
  }));
  let curStart = pastDays[pastDays.length - 1].start;
  for (let i = 0; i < 9; i++) {
    const nextStart = nextCarrierDayStart(curStart, config);
    const nextEnd = nextCarrierDayStart(nextStart, config);
    const lbl = dayLabel(nextStart, config);
    const p = parseIsoDay(lbl);
    frames.push({ start: nextStart, end: nextEnd, label: lbl, shortLabel: p.shortLabel, dayShort: p.dayShort });
    curStart = nextStart;
  }

  const initialBuckets = frames.map((_, i) => (i < pastDays.length ? pastDays[i].onDuty : 0));
  const todayIdx = pastDays.length - 1;
  const shiftStartMinutes = ((Math.round(input.shiftStartMinutes ?? 21 * 60) % 1440) + 1440) % 1440;
  const defaultShiftMinutes = Math.max(0, Math.min(LIMITS.WINDOW, Math.round(input.defaultShiftMinutes)));

  // Determine whether today's planned shift starts at or after `now`; if already passed,
  // project the next 7 full upcoming shifts starting tomorrow so logged time is never double-counted.
  const todayCandidateStart = wallMinuteInCarrierDay(frames[todayIdx].start, frames[todayIdx].end, shiftStartMinutes, config);
  const firstShiftDayIdx = todayCandidateStart >= now ? todayIdx : todayIdx + 1;

  const plannedShifts: number[] = [];
  for (let k = 0; k < PROJECTION_SHIFTS; k++) {
    const custom = input.customShiftMinutes?.[k];
    const m = custom !== null && custom !== undefined && Number.isFinite(custom)
      ? Math.max(0, Math.min(LIMITS.WINDOW, Math.round(custom)))
      : defaultShiftMinutes;
    plannedShifts.push(m);
  }

  const resetStart = Math.max(now, Math.round(input.resetStart));
  const resetEnd = resetStart + LIMITS.RESTART;

  // 3. Run Strategy A (Recaps) and Strategy B (34-Hour Reset)
  const recaps = simulateStrategy(
    frames,
    initialBuckets,
    firstShiftDayIdx,
    plannedShifts,
    shiftStartMinutes,
    config,
    limit,
    windowDays,
    null,
  );
  const reset34 = simulateStrategy(
    frames,
    initialBuckets,
    firstShiftDayIdx,
    plannedShifts,
    shiftStartMinutes,
    config,
    limit,
    windowDays,
    resetStart,
  );

  // 4. Scan candidate reset start days (at the chosen reset time-of-day) to find best 34 timing
  const resetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(resetStart * 60000));
  const resetWallMin =
    Number(resetParts.find((p) => p.type === 'hour')?.value ?? '8') * 60 +
    Number(resetParts.find((p) => p.type === 'minute')?.value ?? '0');

  let bestReset: BestResetSuggestion | null = null;
  for (let k = 0; k < PROJECTION_SHIFTS - 1; k++) {
    const f = frames[firstShiftDayIdx + k];
    const cand = wallMinuteInCarrierDay(f.start, f.end, resetWallMin, config);
    if (cand < now) continue;
    const trial = simulateStrategy(
      frames,
      initialBuckets,
      firstShiftDayIdx,
      plannedShifts,
      shiftStartMinutes,
      config,
      limit,
      windowDays,
      cand,
    );
    const delta = trial.totalUsableMinutes - recaps.totalUsableMinutes;
    if (delta > 0 && (!bestReset || delta > bestReset.deltaMinutes)) {
      bestReset = {
        resetStart: cand,
        resetEnd: cand + LIMITS.RESTART,
        startLabel: terminalClock(cand, config.timeZone, true),
        totalUsableMinutes: trial.totalUsableMinutes,
        deltaMinutes: delta,
      };
    }
  }

  // 5. Optional Home-Time target evaluation
  let homeTime: HomeTimeEvaluation | null = null;
  if (input.homeTargetShifts !== null && input.homeTargetShifts !== undefined) {
    const targetShifts = Math.max(1, Math.min(PROJECTION_SHIFTS, Math.round(input.homeTargetShifts)));
    const preA = recaps.shifts.slice(0, targetShifts);
    const preB = reset34.shifts.slice(0, targetShifts);
    const homeFrame = frames[firstShiftDayIdx + targetShifts];
    const homeParsed = parseIsoDay(homeFrame.label);
    const plannedBeforeHome = preA.reduce((a, x) => a + x.plannedMinutes, 0);
    const usableBeforeHomeRecaps = preA.reduce((a, x) => a + x.usableMinutes, 0);
    const usableBeforeHomeReset34 = preB.reduce((a, x) => a + x.usableMinutes, 0);
    const shortfallMinutes = Math.max(0, plannedBeforeHome - usableBeforeHomeRecaps);
    const firstPinched = preA.find((x) => x.pinched) ?? null;
    const wallBeforeHome: RecapWallInfo | null = firstPinched
      ? {
          shiftIndex: firstPinched.index,
          label: firstPinched.label,
          shortLabel: firstPinched.shortLabel,
          dayShort: firstPinched.dayShort,
          plannedMinutes: firstPinched.plannedMinutes,
          usableMinutes: firstPinched.usableMinutes,
          shortfallMinutes: firstPinched.shortfallMinutes,
        }
      : null;
    const cruiseCapMinutes = findCruiseCap(
      frames,
      initialBuckets,
      firstShiftDayIdx,
      plannedShifts,
      targetShifts,
      shiftStartMinutes,
      config,
      limit,
      windowDays,
    );
    homeTime = {
      targetShifts,
      homeDayLabel: homeFrame.label,
      homeDayShort: homeParsed.dayShort,
      homeDayShortDate: homeParsed.longShort,
      reachesLegally: wallBeforeHome === null,
      plannedBeforeHome,
      usableBeforeHomeRecaps,
      usableBeforeHomeReset34,
      shortfallMinutes,
      wallBeforeHome,
      cruiseCapMinutes,
    };
  }

  const resetStartLabel = terminalClock(resetStart, config.timeZone, true);
  const resetEndLabel = terminalClock(resetEnd, config.timeZone, true);
  const netDeltaMinutes = reset34.totalUsableMinutes - recaps.totalUsableMinutes;
  const verdict = buildVerdict(recaps, reset34, resetStartLabel, bestReset, homeTime);

  return {
    cycle: config.cycle,
    limit,
    windowDays,
    dayStartHour: config.dayStartHour,
    timeZone: config.timeZone,
    pastDays,
    unloggedPastDays,
    usedNow: ev.cycle.used,
    remainingNow: ev.cycle.remaining,
    priorRestartEnd,
    resetStart,
    resetEnd,
    resetStartLabel,
    resetEndLabel,
    shiftStartMinutes,
    defaultShiftMinutes,
    recaps,
    reset34,
    netDeltaMinutes,
    bestReset,
    homeTime,
    verdict,
  };
}
