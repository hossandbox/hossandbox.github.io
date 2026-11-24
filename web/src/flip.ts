/**
 * Flip My Clock — Shift-Start & Schedule-Flip Bridge Planner (Plan tool #11 / Spec #4).
 *
 * Pure app-layer logic module over `engine/src/index.ts` (`evaluate()`, `normalize()`,
 * `carrierDayStart()`, `nextCarrierDayStart()`, `localToMinute()`, `LIMITS`) and read-only
 * helpers from `web/src/store.ts` and `web/src/carrierday.ts`.
 * Zero modifications to `engine/` or `web/src/store.ts`; zero `localStorage` usage; session-only state.
 *
 * Clock honesty:
 *   - Every clock figure (drive remaining, window remaining, cycle remaining, driveNow, binding)
 *     and every legality check comes directly from running `evaluate()` on tentative candidate segments.
 *   - Option A (Extended Break) uses simple elapsed time (`rollOut - restStart` and `totalRest - 10h`)
 *     for rest cost, and reads all roll-out clocks directly from `evaluate()`.
 *   - Option B (Split-Sleeper Slide) tests canonical 7/3 and 8/2 split pairs (both orders) with a
 *     short drive leg between the two rest legs landing exactly on the target roll-out, and is shown
 *     ONLY when `evaluate()` confirms zero tentative violations, positive `driveNow`, and a qualifying
 *     completed split chain (`chain.length >= 2` and `anchor >= leg1End`). Never fudges a split.
 *   - Option C (Wait-for-Midnight Recap Bridge) runs `evaluate()` at the earliest legal post-10h start
 *     and at the first roll-out minute after the next carrier-day boundary, and is shown AUTOMATICALLY
 *     only when the cycle is tight (`early.cycle.remaining < shift.limits.window`) and the boundary
 *     drop-off materially increases available cycle hours (`gain >= 60m`) without crossing a 34-hr restart.
 *
 * Framing: strictly legal HOS rest/start windows — zero medical or sleep advice.
 */
import type { Availability, FullEvaluation, RulesConfig, Segment } from '../../engine/src/index.ts';
import {
  LIMITS,
  carrierDayStart,
  evaluate,
  localToMinute,
  nextCarrierDayStart,
  normalize,
  restPeriods,
} from '../../engine/src/index.ts';
import { isValidTimeZone, zoneShort } from './store.ts';
import { dayStartWord, safeRulesConfig } from './carrierday.ts';

export const FLIP_STANDING_LINE =
  'Rest windows only — this plans legal start times, not sleep advice.';

export const FLIP_NO_DRIVE_ASSUMPTION =
  "Assumes no driving between now and shutdown. If you'll be driving before shutdown, this slide may not hold.";

export type FlipPresetId = 'night' | 'midnight' | 'early';

export interface FlipPreset {
  id: FlipPresetId;
  label: string;
  shortLabel: string;
  hour: number;
  minute: number;
  hm: string;
}

export const FLIP_PRESETS: readonly FlipPreset[] = [
  { id: 'night', label: '21:00 Night', shortLabel: 'Night', hour: 21, minute: 0, hm: '21:00' },
  { id: 'midnight', label: '00:01 Midnight Recap', shortLabel: 'Midnight Recap', hour: 0, minute: 1, hm: '00:01' },
  { id: 'early', label: '03:00 Early Bird', shortLabel: 'Early Bird', hour: 3, minute: 0, hm: '03:00' },
] as const;

export const FLIP_MIN_SLIDE_DRIVE_MIN = 30;
export const FLIP_MIN_RECAP_GAIN_MIN = 60;

export interface FlipClockSnapshot {
  asOf: number;
  hm: string;
  short: string;
  driveRemaining: number;
  windowRemaining: number;
  cycleRemaining: number;
  driveLimit: number;
  windowLimit: number;
  cycleLimit: number;
  driveNow: number;
  binding: Availability['binding'];
  bindingLabel: string;
}

export interface FlipPlanSegment {
  status: 'OFF' | 'SB' | 'D';
  start: number;
  end: number;
  duration: number;
  startHM: string;
  endHM: string;
  startShort: string;
  endShort: string;
  label: string;
}

export interface FlipOptionA {
  kind: 'extended';
  title: string;
  tag: string;
  restStart: number;
  restStartShort: string;
  rollOutMinute: number;
  rollOutHM: string;
  rollOutShort: string;
  totalRestMinutes: number;
  extraRestMinutes: number;
  /** True when the extended rest reached 34h+ and triggered an engine 34-hr cycle restart. */
  includes34Restart: boolean;
  /** True when the target HH:MM fell in a DST spring-forward gap and resolved forward to the next valid time. */
  dstGapShifted: boolean;
  clocks: FlipClockSnapshot;
  segments: FlipPlanSegment[];
  evalSegments: Segment[];
}

export interface FlipOptionB {
  kind: 'split_slide';
  title: string;
  tag: string;
  splitPair: '7/3' | '8/2' | '3/7' | '2/8';
  restStart: number;
  rollOutMinute: number;
  rollOutHM: string;
  rollOutShort: string;
  driveLegMinutes: number;
  /** True when [now, shutdown) only passed when modeled as non-driving ON (failed under D). */
  assumesNoDrivingBeforeShutdown: boolean;
  /** Plain-language assumption disclosure shown when assumesNoDrivingBeforeShutdown is true. */
  assumptionLine: string | null;
  /** True when the target HH:MM fell in a DST spring-forward gap and resolved forward. */
  dstGapShifted: boolean;
  clocks: FlipClockSnapshot;
  segments: FlipPlanSegment[];
  evalSegments: Segment[];
}

export interface FlipOptionC {
  kind: 'recap_bridge';
  title: string;
  tag: string;
  boundaryMinute: number;
  boundaryHM: string;
  boundaryShort: string;
  boundaryWord: string;
  earlyStart: number;
  earlyHM: string;
  earlyShort: string;
  earlyCanRoll: boolean;
  earlyClocks: FlipClockSnapshot;
  afterStart: number;
  afterHM: string;
  afterShort: string;
  afterClocks: FlipClockSnapshot;
  holdExtraMinutes: number;
  cycleGainMinutes: number;
  earlyEvalSegments: Segment[];
  afterEvalSegments: Segment[];
}

export interface FlipInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current UTC epoch minute. */
  now: number;
  /** Carrier rules config. */
  config: RulesConfig;
  /** Chosen shutdown / finished UTC epoch minute (defaults via `defaultShutdownMinute`). */
  shutdownMinute: number;
  /** Target roll-out wall hour in home-terminal timezone (0..23). */
  targetHour: number;
  /** Target roll-out wall minute in home-terminal timezone (0..59). */
  targetMinute: number;
}

export interface FlipPlanResult {
  homeTimeZone: string;
  homeZoneName: string;
  now: number;
  nowShort: string;
  requestedShutdownMinute: number;
  effectiveShutdownMinute: number;
  shutdownShort: string;
  shutdownHM: string;
  shutdownClampedToWorkEnd: boolean;
  targetHour: number;
  targetMinute: number;
  targetHM: string;
  activePreset: FlipPresetId | null;
  bare10EndMinute: number;
  bare10EndShort: string;
  optionA: FlipOptionA | null;
  optionB: FlipOptionB | null;
  optionC: FlipOptionC | null;
  bridgeCount: number;
  standingLine: string;
}

/* ---------- timezone formatting (DST-safe, host-TZ independent) ---------- */

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

export function fmtFlipHM(minute: number, tz: string): string {
  const p = localWallParts(minute, tz);
  return `${p.hourStr}:${p.minStr}`;
}

export function fmtFlipShort(minute: number, tz: string): string {
  const p = localWallParts(minute, tz);
  return `${p.weekday} ${p.hourStr}:${p.minStr}`;
}

export function formatHM(hour: number, minute: number): string {
  const h = Math.max(0, Math.min(23, Math.trunc(hour)));
  const m = Math.max(0, Math.min(59, Math.trunc(minute)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatFlipWallDateTime(minute: number, tz: string): { date: string; time: string } {
  const p = localWallParts(minute, tz);
  return {
    date: `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`,
    time: `${p.hourStr}:${p.minStr}`,
  };
}

export function resolveFlipWallMinute(dateStr: string, timeStr: string, tz: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr.trim());
  if (!dm || !tm) return null;
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  return localToMinute(+dm[1], +dm[2], +dm[3], +tm[1], safeTz, +tm[2]);
}

/**
 * First UTC epoch minute at or after `minMinute` whose local wall clock in `tz` is `hour:minute`.
 * Uses `engine/src/cycle.ts` `localToMinute()` for DST-safe resolution across spring-forward and fall-back.
 */
export function nextWallClockAtOrAfter(minMinute: number, hour: number, minute: number, tz: string): number {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const p = localWallParts(minMinute, safeTz);
  const candidates: number[] = [];
  for (let delta = -1; delta <= 3; delta++) {
    const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + delta));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    const cand = localToMinute(y, m, d, hour, safeTz, minute);
    if (cand >= minMinute) candidates.push(cand);
    // DST fall-back repeated hour: also consider the other occurrence (±60m) when it lands on the
    // same local date and wall clock (e.g. second 01:30 CST after 01:30 CDT was before minMinute).
    for (const shift of [-60, 60]) {
      const alt = cand + shift;
      if (alt >= minMinute) {
        const ap = localWallParts(alt, safeTz);
        if (ap.y === y && ap.m === m && ap.d === d && ap.h === hour && ap.min === minute) {
          candidates.push(alt);
        }
      }
    }
  }
  candidates.sort((a, b) => a - b);
  return candidates[0];
}

export function matchFlipPreset(hour: number, minute: number): FlipPresetId | null {
  for (const p of FLIP_PRESETS) {
    if (p.hour === hour && p.minute === minute) return p.id;
  }
  return null;
}

/* ---------- default shutdown derivation from logged record ---------- */

/**
 * Default shutdown / finished time:
 * - If the logged record has work (`D` or `ON`) that ended before `now` (the driver is currently
 *   resting), return the start of that current rest (`lastWorkEnd`), whatever its age.
 * - Otherwise (currently working or empty record), return `now`.
 */
export function defaultShutdownMinute(
  segments: Segment[],
  now: number,
): { minute: number; source: 'shift_end' | 'now' } {
  const clipped = segments
    .filter((s) => !s.tentative && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.start < now)
    .map((s) => (s.end > now ? { ...s, end: now } : s));
  const norm = normalize(clipped);
  let lastWorkEnd: number | null = null;
  for (const s of norm) {
    if (s.status === 'D' || s.status === 'ON') lastWorkEnd = s.end;
  }
  if (lastWorkEnd !== null && lastWorkEnd < now) {
    return { minute: lastWorkEnd, source: 'shift_end' };
  }
  return { minute: now, source: 'now' };
}

/* ---------- engine snapshot helper ---------- */

function bindingLabelOf(b: Availability['binding'], cycleLimit: number): string {
  switch (b) {
    case 'DRIVE_11': return '11-hr drive';
    case 'WINDOW_14': return '14-hr window';
    case 'CYCLE': return `${cycleLimit / 60}-hr cycle`;
    case 'BREAK_30': return '30-min break';
    default: return 'None';
  }
}

function snapshotFromEval(ev: FullEvaluation, tz: string): FlipClockSnapshot {
  return {
    asOf: ev.asOf,
    hm: fmtFlipHM(ev.asOf, tz),
    short: fmtFlipShort(ev.asOf, tz),
    driveRemaining: ev.shift.driveRemaining,
    windowRemaining: ev.shift.windowRemaining,
    cycleRemaining: ev.cycle.remaining,
    driveLimit: ev.shift.limits.drive,
    windowLimit: ev.shift.limits.window,
    cycleLimit: ev.cycle.limit,
    driveNow: ev.driveNow,
    binding: ev.binding,
    bindingLabel: bindingLabelOf(ev.binding, ev.cycle.limit),
  };
}

function planSegmentOf(
  status: 'OFF' | 'SB' | 'D',
  start: number,
  end: number,
  label: string,
  tz: string,
): FlipPlanSegment {
  return {
    status,
    start,
    end,
    duration: end - start,
    startHM: fmtFlipHM(start, tz),
    endHM: fmtFlipHM(end, tz),
    startShort: fmtFlipShort(start, tz),
    endShort: fmtFlipShort(end, tz),
    label,
  };
}

/* ---------- candidate base timeline ---------- */

interface BaseTimeline {
  baseSegments: Segment[];
  /** Same as baseSegments, except when effectiveShutdown > now, [now, effectiveShutdown) is modeled as D. */
  baseSegmentsDriving: Segment[];
  effectiveShutdown: number;
  /** Actual start of the contiguous rest period being planned (may precede a custom shutdown <= now). */
  actualRestStart: number;
  shutdownClampedToWorkEnd: boolean;
  /** First minute where tentative bridge segments may start without overwriting logged history. */
  tentativeStart: number;
  baselineNonTentativeViolations: number;
}

function buildBaseTimeline(
  rawSegments: Segment[],
  now: number,
  requestedShutdown: number,
  cfg: RulesConfig,
): BaseTimeline {
  const clipped = rawSegments
    .filter((s) => !s.tentative && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.start < now)
    .map((s) => (s.end > now ? { ...s, end: now } : s));
  const logged = normalize(clipped);

  let lastWorkEnd: number | null = null;
  for (const s of logged) {
    if (s.status === 'D' || s.status === 'ON') lastWorkEnd = s.end;
  }

  let effectiveShutdown = Math.round(requestedShutdown);
  let shutdownClampedToWorkEnd = false;
  if (lastWorkEnd !== null && effectiveShutdown < lastWorkEnd) {
    effectiveShutdown = lastWorkEnd;
    shutdownClampedToWorkEnd = true;
  }

  const lastLoggedEnd = logged.length ? logged[logged.length - 1].end : null;
  const baseSegments: Segment[] = [...logged];
  const baseSegmentsDriving: Segment[] = [...logged];
  let tentativeStart: number;

  if (effectiveShutdown > now) {
    // Future shutdown: model [now, effectiveShutdown) as ON for baseSegments, and as D for
    // baseSegmentsDriving so Option B verifies legality under driving-until-shutdown as well.
    baseSegments.push({
      status: 'ON',
      start: now,
      end: effectiveShutdown,
      tentative: true,
      note: 'Remaining shift until shutdown',
    });
    baseSegmentsDriving.push({
      status: 'D',
      start: now,
      end: effectiveShutdown,
      tentative: true,
      note: 'Remaining shift until shutdown (driving)',
    });
    tentativeStart = effectiveShutdown;
  } else {
    // Shutdown at or before `now` (and >= lastWorkEnd). Preserve logged rest up to lastLoggedEnd
    // and bridge any unlogged trailing hole [lastLoggedEnd, now) as OFF so timeline.ts merges
    // contiguous rest honestly without flushing across a gap before tentative rows.
    if (lastLoggedEnd !== null && lastLoggedEnd > effectiveShutdown) {
      if (lastLoggedEnd < now) {
        const tail: Segment = {
          status: 'OFF',
          start: lastLoggedEnd,
          end: now,
          tentative: true,
          note: 'Rest through now',
        };
        baseSegments.push(tail);
        baseSegmentsDriving.push(tail);
        tentativeStart = now;
      } else {
        tentativeStart = lastLoggedEnd;
      }
    } else {
      tentativeStart = effectiveShutdown;
    }
  }

  // Track the actual start of the ongoing rest period so totalRestMinutes, the 34-hour restart
  // flag, and Option C's 34-hour guard reflect the real continuous rest the engine evaluates.
  let actualRestStart = effectiveShutdown;
  if (effectiveShutdown <= now) {
    const rests = restPeriods(baseSegments);
    const lastRest = rests.length ? rests[rests.length - 1] : null;
    if (lastRest && lastRest.end === tentativeStart) {
      actualRestStart = Math.min(effectiveShutdown, lastRest.start);
    }
  }

  const baseEval = evaluate(baseSegments, { asOf: Math.max(now, effectiveShutdown), config: cfg });
  const baselineNonTentativeViolations = baseEval.violations.filter((v) => !v.tentative).length;

  return {
    baseSegments,
    baseSegmentsDriving,
    effectiveShutdown,
    actualRestStart,
    shutdownClampedToWorkEnd,
    tentativeStart,
    baselineNonTentativeViolations,
  };
}

function buildRestThroughSegments(base: BaseTimeline, rollOut: number, note: string): Segment[] {
  if (rollOut <= base.tentativeStart) return [...base.baseSegments];
  return [
    ...base.baseSegments,
    { status: 'OFF', start: base.tentativeStart, end: rollOut, tentative: true, note },
  ];
}

/* ---------- Option A: Extended Break (cleanest) ---------- */

function buildOptionA(
  base: BaseTimeline,
  now: number,
  targetHour: number,
  targetMinute: number,
  cfg: RulesConfig,
  tz: string,
): FlipOptionA | null {
  const restStart = base.actualRestStart;
  const bare10End = restStart + LIMITS.RESET;
  const minRoll = Math.max(bare10End, now);
  const targetHM = formatHM(targetHour, targetMinute);
  let candidateRoll = nextWallClockAtOrAfter(minRoll, targetHour, targetMinute, tz);

  // Check the first target occurrence (and up to 2 subsequent days if cycle is 0 at first hit).
  for (let attempt = 0; attempt < 3; attempt++) {
    const evalSegments = buildRestThroughSegments(base, candidateRoll, 'Extended break');
    const ev = evaluate(evalSegments, { asOf: candidateRoll, config: cfg });
    const tentViols = ev.violations.filter((v) => v.tentative);
    if (tentViols.length === 0 && ev.driveNow > 0) {
      const totalRestMinutes = candidateRoll - restStart;
      const extraRestMinutes = Math.max(0, totalRestMinutes - LIMITS.RESET);
      const rollOutHM = fmtFlipHM(candidateRoll, tz);
      return {
        kind: 'extended',
        title: 'Option A — Extended Break',
        tag: 'Cleanest',
        restStart,
        restStartShort: fmtFlipShort(restStart, tz),
        rollOutMinute: candidateRoll,
        rollOutHM,
        rollOutShort: fmtFlipShort(candidateRoll, tz),
        totalRestMinutes,
        extraRestMinutes,
        includes34Restart: totalRestMinutes >= LIMITS.RESTART,
        dstGapShifted: rollOutHM !== targetHM,
        clocks: snapshotFromEval(ev, tz),
        segments: [
          planSegmentOf('OFF', restStart, candidateRoll, 'Off Duty / Extended Break', tz),
        ],
        evalSegments,
      };
    }
    candidateRoll = nextWallClockAtOrAfter(candidateRoll + 1, targetHour, targetMinute, tz);
  }
  return null;
}

/* ---------- Option B: Split-Sleeper Slide (keep moving) ---------- */

interface SplitPattern {
  splitPair: '7/3' | '8/2' | '3/7' | '2/8';
  leg1Status: 'SB' | 'OFF';
  leg1Min: number;
  leg2Status: 'SB' | 'OFF';
  leg2Min: number;
  priority: number;
}

const SPLIT_PATTERNS: readonly SplitPattern[] = [
  { splitPair: '7/3', leg1Status: 'SB', leg1Min: 7 * 60, leg2Status: 'OFF', leg2Min: 3 * 60, priority: 0 },
  { splitPair: '8/2', leg1Status: 'SB', leg1Min: 8 * 60, leg2Status: 'OFF', leg2Min: 2 * 60, priority: 1 },
  { splitPair: '3/7', leg1Status: 'OFF', leg1Min: 3 * 60, leg2Status: 'SB', leg2Min: 7 * 60, priority: 2 },
  { splitPair: '2/8', leg1Status: 'OFF', leg1Min: 2 * 60, leg2Status: 'SB', leg2Min: 8 * 60, priority: 3 },
];

function passesOptionBGate(
  evalSegments: Segment[],
  rollOut: number,
  leg1End: number,
  base: BaseTimeline,
  cfg: RulesConfig,
): FullEvaluation | null {
  const ev = evaluate(evalSegments, { asOf: rollOut, config: cfg });
  const tentViols = ev.violations.filter((v) => v.tentative);
  const nonTentViols = ev.violations.filter((v) => !v.tentative);
  if (tentViols.length > 0) return null;
  if (nonTentViols.length > base.baselineNonTentativeViolations) return null;
  if (ev.driveNow <= 0) return null;
  // Engine must actually confirm a completed qualifying split pair advancing the anchor to >= leg1End.
  if (ev.shift.chain.length < 2 || ev.shift.anchor < leg1End) return null;
  return ev;
}

/**
 * Build honest display rows for Leg 1 covering [leg1Start, leg1End) from the actual evaluated
 * timeline so any already-logged portion keeps its real duty status (OFF vs SB).
 */
function buildLeg1DisplaySegments(
  evalSegments: Segment[],
  leg1Start: number,
  leg1End: number,
  pat: SplitPattern,
  tz: string,
): FlipPlanSegment[] {
  const resolved = normalize(evalSegments, { merge: false });
  const rawSlices: { status: 'OFF' | 'SB'; start: number; end: number; logged: boolean }[] = [];
  let cursor = leg1Start;

  for (const s of resolved) {
    if (s.end <= leg1Start || s.start >= leg1End) continue;
    const a = Math.max(s.start, leg1Start);
    const b = Math.min(s.end, leg1End);
    if (b <= a) continue;
    if (a > cursor) {
      rawSlices.push({ status: 'OFF', start: cursor, end: a, logged: false });
    }
    if (s.status === 'OFF' || s.status === 'SB') {
      rawSlices.push({ status: s.status, start: a, end: b, logged: !s.tentative });
    }
    cursor = Math.max(cursor, b);
  }
  if (cursor < leg1End) {
    rawSlices.push({ status: 'OFF', start: cursor, end: leg1End, logged: false });
  }

  const merged: { status: 'OFF' | 'SB'; start: number; end: number; allLogged: boolean }[] = [];
  for (const sl of rawSlices) {
    const prev = merged[merged.length - 1];
    if (prev && prev.status === sl.status && prev.end === sl.start) {
      prev.end = sl.end;
      prev.allLogged = prev.allLogged && sl.logged;
    } else {
      merged.push({ status: sl.status, start: sl.start, end: sl.end, allLogged: sl.logged });
    }
  }

  if (
    merged.length === 1
    && merged[0].start === leg1Start
    && merged[0].end === leg1End
    && !merged[0].allLogged
    && merged[0].status === pat.leg1Status
  ) {
    return [
      planSegmentOf(
        pat.leg1Status,
        leg1Start,
        leg1End,
        pat.leg1Status === 'SB' ? `${pat.leg1Min / 60}h Sleeper Berth` : `${pat.leg1Min / 60}h Off Duty`,
        tz,
      ),
    ];
  }

  return merged.map((sl) => {
    const baseName = sl.status === 'SB' ? 'Sleeper Berth' : 'Off Duty';
    const label = sl.allLogged ? `${baseName} (logged)` : baseName;
    return planSegmentOf(sl.status, sl.start, sl.end, label, tz);
  });
}

function buildOptionB(
  base: BaseTimeline,
  now: number,
  targetHour: number,
  targetMinute: number,
  cfg: RulesConfig,
  tz: string,
): FlipOptionB | null {
  const restStart = base.actualRestStart;
  const bare10End = restStart + LIMITS.RESET;
  const minRoll = Math.max(bare10End, now);
  const targetHM = formatHM(targetHour, targetMinute);
  const rollOut = nextWallClockAtOrAfter(minRoll, targetHour, targetMinute, tz);

  const span = rollOut - restStart;
  const driveLeg = span - LIMITS.SPLIT_TOTAL;
  if (driveLeg < FLIP_MIN_SLIDE_DRIVE_MIN || driveLeg > LIMITS.DRIVE) {
    return null;
  }

  let best: {
    option: FlipOptionB;
    assumesNoDriving: boolean;
    driveNow: number;
    cycleRem: number;
    priority: number;
  } | null = null;

  for (const pat of SPLIT_PATTERNS) {
    const leg1Start = restStart;
    const leg1End = restStart + pat.leg1Min;
    const driveStart = leg1End;
    const driveEnd = driveStart + driveLeg;
    const leg2Start = driveEnd;
    const leg2End = rollOut;

    // Driving leg must not begin in the past.
    if (driveStart < now) continue;

    const tentSegs: Segment[] = [];
    if (leg1End > base.tentativeStart) {
      tentSegs.push({
        status: pat.leg1Status,
        start: base.tentativeStart,
        end: leg1End,
        tentative: true,
        note: pat.leg1Status === 'SB' ? 'Split sleeper leg' : 'Split off-duty leg',
      });
    }
    tentSegs.push({
      status: 'D',
      start: driveStart,
      end: driveEnd,
      tentative: true,
      note: 'Slide drive leg',
    });
    tentSegs.push({
      status: pat.leg2Status,
      start: leg2Start,
      end: leg2End,
      tentative: true,
      note: pat.leg2Status === 'SB' ? 'Split sleeper leg' : 'Split off-duty leg',
    });

    // Evaluate twice for future shutdowns: once with [now, shutdown) as ON and once as D.
    const evalSegmentsOn = [...base.baseSegments, ...tentSegs];
    const evOn = passesOptionBGate(evalSegmentsOn, rollOut, leg1End, base, cfg);
    const evalSegmentsD = base.effectiveShutdown > now
      ? [...base.baseSegmentsDriving, ...tentSegs]
      : evalSegmentsOn;
    const evD = base.effectiveShutdown > now
      ? passesOptionBGate(evalSegmentsD, rollOut, leg1End, base, cfg)
      : evOn;

    if (!evD && !evOn) continue;

    const assumesNoDriving = evD === null;
    const ev = evD ?? evOn!;
    const evalSegments = evD ? evalSegmentsD : evalSegmentsOn;
    const rollOutHM = fmtFlipHM(rollOut, tz);

    const leg1Display = buildLeg1DisplaySegments(evalSegments, leg1Start, leg1End, pat, tz);

    const option: FlipOptionB = {
      kind: 'split_slide',
      title: `Option B — ${pat.splitPair} Split-Sleeper Slide`,
      tag: 'Keep moving',
      splitPair: pat.splitPair,
      restStart,
      rollOutMinute: rollOut,
      rollOutHM,
      rollOutShort: fmtFlipShort(rollOut, tz),
      driveLegMinutes: driveLeg,
      assumesNoDrivingBeforeShutdown: assumesNoDriving,
      assumptionLine: assumesNoDriving ? FLIP_NO_DRIVE_ASSUMPTION : null,
      dstGapShifted: rollOutHM !== targetHM,
      clocks: snapshotFromEval(ev, tz),
      segments: [
        ...leg1Display,
        planSegmentOf('D', driveStart, driveEnd, 'Drive leg', tz),
        planSegmentOf(
          pat.leg2Status,
          leg2Start,
          leg2End,
          pat.leg2Status === 'SB' ? `${pat.leg2Min / 60}h Sleeper Berth` : `${pat.leg2Min / 60}h Off Duty`,
          tz,
        ),
      ],
      evalSegments,
    };

    const isBetter = !best
      || (best.assumesNoDriving && !assumesNoDriving)
      || (best.assumesNoDriving === assumesNoDriving && (
        ev.driveNow > best.driveNow
        || (ev.driveNow === best.driveNow && ev.cycle.remaining > best.cycleRem)
        || (ev.driveNow === best.driveNow && ev.cycle.remaining === best.cycleRem && pat.priority < best.priority)
      ));

    if (isBetter) {
      best = {
        option,
        assumesNoDriving,
        driveNow: ev.driveNow,
        cycleRem: ev.cycle.remaining,
        priority: pat.priority,
      };
    }
  }

  return best?.option ?? null;
}

/* ---------- Option C: Wait-for-Midnight / Carrier-Day Recap Bridge (tight-cycle only) ---------- */

function buildOptionC(
  base: BaseTimeline,
  now: number,
  cfg: RulesConfig,
  tz: string,
): FlipOptionC | null {
  const restStart = base.actualRestStart;
  const earlyStart = Math.max(restStart + LIMITS.RESET, now);
  const earlyDayStart = carrierDayStart(earlyStart, cfg);
  // If earliest start lands right on the carrier-day boundary, recap already rolled off during the 10h break.
  if (earlyStart <= earlyDayStart) return null;

  const boundaryMinute = nextCarrierDayStart(earlyDayStart, cfg);
  const afterStart = boundaryMinute + 1;

  // Keep Option C strictly a carrier-day recap drop-off bridge (not a 34-hour restart).
  if (afterStart - restStart >= LIMITS.RESTART) return null;

  const earlyEvalSegments = buildRestThroughSegments(base, earlyStart, '10h break to earliest start');
  const afterEvalSegments = buildRestThroughSegments(base, afterStart, 'Hold past carrier-day boundary');

  const evEarly = evaluate(earlyEvalSegments, { asOf: earlyStart, config: cfg });
  const evAfter = evaluate(afterEvalSegments, { asOf: afterStart, config: cfg });

  if (evEarly.violations.filter((v) => v.tentative).length > 0) return null;
  if (evAfter.violations.filter((v) => v.tentative).length > 0) return null;
  if (evAfter.driveNow <= 0) return null;

  const earlyCycle = evEarly.cycle.remaining;
  const afterCycle = evAfter.cycle.remaining;
  const cycleGainMinutes = afterCycle - earlyCycle;

  // Show AUTOMATICALLY only when cycle is tight (< full shift window) AND the boundary drop-off
  // materially increases available cycle hours (>= 60 min).
  if (earlyCycle >= evEarly.shift.limits.window) return null;
  if (cycleGainMinutes < FLIP_MIN_RECAP_GAIN_MIN) return null;

  const boundaryWord = dayStartWord(cfg);
  return {
    kind: 'recap_bridge',
    title: boundaryWord === 'midnight'
      ? 'Option C — Wait-for-Midnight Recap Bridge'
      : `Option C — Wait-for-${boundaryWord} Recap Bridge`,
    tag: 'Tight cycle',
    boundaryMinute,
    boundaryHM: fmtFlipHM(boundaryMinute, tz),
    boundaryShort: fmtFlipShort(boundaryMinute, tz),
    boundaryWord,
    earlyStart,
    earlyHM: fmtFlipHM(earlyStart, tz),
    earlyShort: fmtFlipShort(earlyStart, tz),
    earlyCanRoll: evEarly.driveNow > 0,
    earlyClocks: snapshotFromEval(evEarly, tz),
    afterStart,
    afterHM: fmtFlipHM(afterStart, tz),
    afterShort: fmtFlipShort(afterStart, tz),
    afterClocks: snapshotFromEval(evAfter, tz),
    holdExtraMinutes: afterStart - earlyStart,
    cycleGainMinutes,
    earlyEvalSegments,
    afterEvalSegments,
  };
}

/* ---------- main planner entry point ---------- */

export function planFlipBridges(input: FlipInput): FlipPlanResult {
  const cfg = safeRulesConfig(input.config);
  const homeTimeZone = isValidTimeZone(cfg.timeZone) ? cfg.timeZone : 'UTC';
  const homeZoneName = zoneShort(homeTimeZone);
  const targetHour = Math.max(0, Math.min(23, Math.trunc(input.targetHour)));
  const targetMinute = Math.max(0, Math.min(59, Math.trunc(input.targetMinute)));

  const base = buildBaseTimeline(input.segments, input.now, input.shutdownMinute, cfg);
  const bare10EndMinute = base.actualRestStart + LIMITS.RESET;

  const optionA = buildOptionA(base, input.now, targetHour, targetMinute, cfg, homeTimeZone);
  const optionB = buildOptionB(base, input.now, targetHour, targetMinute, cfg, homeTimeZone);
  const optionC = buildOptionC(base, input.now, cfg, homeTimeZone);

  const bridgeCount = (optionA ? 1 : 0) + (optionB ? 1 : 0) + (optionC ? 1 : 0);

  return {
    homeTimeZone,
    homeZoneName,
    now: input.now,
    nowShort: fmtFlipShort(input.now, homeTimeZone),
    requestedShutdownMinute: Math.round(input.shutdownMinute),
    effectiveShutdownMinute: base.effectiveShutdown,
    shutdownShort: fmtFlipShort(base.effectiveShutdown, homeTimeZone),
    shutdownHM: fmtFlipHM(base.effectiveShutdown, homeTimeZone),
    shutdownClampedToWorkEnd: base.shutdownClampedToWorkEnd,
    targetHour,
    targetMinute,
    targetHM: formatHM(targetHour, targetMinute),
    activePreset: matchFlipPreset(targetHour, targetMinute),
    bare10EndMinute,
    bare10EndShort: fmtFlipShort(bare10EndMinute, homeTimeZone),
    optionA,
    optionB,
    optionC,
    bridgeCount,
    standingLine: FLIP_STANDING_LINE,
  };
}
