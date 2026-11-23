/**
 * Work-Backwards Appointment & Departure Planner ("When to Roll" + PTA Builder).
 *
 * Built strictly on the existing HOS engine (`engine/src/index.ts`) and store
 * helpers (`web/src/store.ts`) without modifying `store.ts` or `engine/`.
 *
 * Given a HARD pickup or delivery appointment on an already-accepted load,
 * works backwards through FMCSA 11-hour driving, 14-hour window, 30-minute break,
 * 10-hour rest, and 60/7 or 70/8 cycle rules to produce an execution timetable:
 *   1. Feasibility verdict seeded from the driver's logged clocks & cycle
 *   2. Latest time to shut down for the 10-hour break (+ 08:00–10:00 sweet spot)
 *   3. Exact roll-out / pre-trip time in BOTH home-terminal and appointment-local time
 *   4. Mandatory 30-minute break window (earliest & latest start)
 *   5. Buffered arrival target and planned arrival
 *   6. Copyable plain-text dispatch PTA (Projected Time Available after dock/unload)
 *
 * 100% offline. Reuses `localToMinute`, `carrierDayStart`, `nextCarrierDayStart`,
 * `evaluate`, `restPeriods`, `normalize`, `cycleViolations`, and `LIMITS` directly
 * from `engine/src/index.ts`.
 */
import type { RulesConfig, Segment, Violation } from '../../engine/src/index.ts';
import {
  LIMITS,
  carrierDayStart,
  cycleViolations,
  evaluate,
  localToMinute,
  nextCarrierDayStart,
  normalize,
  restPeriods,
} from '../../engine/src/index.ts';
import { ZONE_LABELS, cycleParamsOf, dur, isValidTimeZone, zoneShort } from './store.ts';
import { safeRulesConfig } from './carrierday.ts';

export type ZoneEntryMode = 'local' | 'terminal';
export type DistanceMode = 'miles' | 'hours';

export const MIN_MPH = 45;
export const MAX_MPH = 65;
export const DEFAULT_MPH = 55;
export const DEFAULT_BUFFER_MIN = 45;
export const DEFAULT_DOCK_MIN = 120;
export const DEFAULT_PRETRIP_MIN = 15;
export const DEFAULT_MILES = 500;

export const MPH_PRESETS = [45, 50, 55, 60, 65] as const;
export const MILES_PRESETS = [250, 400, 500, 550] as const;
export const HOURS_PRESETS = [
  { label: '6h', minutes: 360 },
  { label: '8h', minutes: 480 },
  { label: '9h 30m', minutes: 570 },
  { label: '10h', minutes: 600 },
] as const;
export const BUFFER_PRESETS = [0, 30, 45, 60, 90] as const;
export const DOCK_PRESETS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
] as const;
export const PRETRIP_PRESETS = [0, 15, 30, 45] as const;

/** Parking sweet spot for overnight linehaul drivers (08:00–10:00 inclusive, home-terminal time). */
export const SWEET_SPOT_START_MIN = 8 * 60;
export const SWEET_SPOT_END_MIN = 10 * 60;

/** Curated driver-friendly IANA timezones (reuses store's ZONE_LABELS). */
export const COMMON_APPT_ZONES: string[] = Object.keys(ZONE_LABELS);

export interface RolloutInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current epoch minute. */
  now: number;
  /** Carrier rules config (cycle, dayStartHour, timeZone, shortHaul). */
  config: RulesConfig;
  /** Appointment date in YYYY-MM-DD (interpreted in the active `entryZoneMode` timezone). */
  apptDate: string;
  /** Appointment time in HH:MM 24h (interpreted in the active `entryZoneMode` timezone). */
  apptTime: string;
  /** Whether `apptDate`/`apptTime` is entered in appointment-local time or home-terminal time. */
  entryZoneMode: ZoneEntryMode;
  /** IANA timezone of the pickup/delivery appointment facility. */
  apptTimeZone: string;
  /** Driver choice: miles + average speed, or direct drive hours/minutes. */
  distanceMode: DistanceMode;
  /** Distance in miles (used when `distanceMode === 'miles'`). */
  miles: number;
  /** Realistic average speed in mph, clamped 45–65 (used when `distanceMode === 'miles'`). */
  mph: number;
  /** Direct drive time in minutes (used when `distanceMode === 'hours'`). */
  driveMinutesDirect: number;
  /** Arrive-early margin in minutes (default 45). */
  bufferMinutes: number;
  /** Expected dock / unload time in minutes for the PTA (default 120). */
  dockMinutes: number;
  /** On-duty pre-trip / roll-out allowance in minutes (default 15). */
  preTripMinutes: number;
}

export interface DualTime {
  minute: number;
  homeText: string;
  homeShort: string;
  homeHM: string;
  apptText: string;
  apptShort: string;
  apptHM: string;
  sameZone: boolean;
}

export interface BreakWindow {
  required: boolean;
  exemptShortHaul: boolean;
  reason: string;
  earliestStart: DualTime | null;
  latestStart: DualTime | null;
  minDriveBeforeBreak: number;
  maxDriveBeforeBreak: number;
}

export interface RolloutLeg {
  legIndex: number;
  rollOut: DualTime;
  wheelsRoll: DualTime;
  driveMinutes: number;
  preTripMinutes: number;
  breakWindow: BreakWindow;
  legEnd: DualTime;
  enRouteRestAfter: { start: DualTime; end: DualTime; minutes: number } | null;
}

export interface RolloutRecovery {
  earliestLegalRollOut: DualTime;
  earliestLegalArrival: DualTime;
  earliestWorkableAppt: DualTime;
  /** Minutes the appointment must move later to keep the requested arrival buffer. */
  apptShiftMinutes: number;
  /** Positive if earliest legal arrival is after the appointment; <= 0 if only eating into buffer. */
  arrivalLateByMinutes: number;
  /** If earliest legal arrival <= appointment, the maximum early buffer (minutes) that still fits. */
  maxBufferThatFits: number | null;
  needsRestart34: boolean;
  apptDateInEntryZone: string;
  apptTimeInEntryZone: string;
}

export interface RolloutPlan {
  validInput: boolean;
  feasible: boolean;
  tone: 'good' | 'warn' | 'bad';
  verdictSign: 'go' | 'warn' | 'stop';
  verdictLabel: string;
  headline: string;
  reason: string;
  restMode: 'reset10' | 'restart34' | 'current_shift' | 'none';
  homeTimeZone: string;
  apptTimeZone: string;
  homeZoneName: string;
  apptZoneName: string;
  sameZone: boolean;
  entryZoneMode: ZoneEntryMode;
  driveMinutes: number;
  effectiveMph: number;
  bufferMinutes: number;
  dockMinutes: number;
  preTripMinutes: number;
  appointment: DualTime;
  bufferedArrival: DualTime;
  plannedArrival: DualTime;
  rollOut: DualTime;
  wheelsRoll: DualTime;
  latestShutdown: DualTime;
  requiredRestMinutes: number;
  /** True when latestShutdown falls in 08:00–10:00 home-terminal time (overnight parking sweet spot). */
  inParkingSweetSpot: boolean;
  /** True when the driver is already resting at `now` and that continuous rest finishes the required break in time. */
  currentRestCoversBreak: boolean;
  currentRestStart: DualTime | null;
  currentRestDoneAt: DualTime | null;
  /** Mandatory 30-min break window for Leg 1 (the entire run for single-shift trips). */
  breakWindow: BreakWindow;
  legs: RolloutLeg[];
  pta: DualTime;
  ptaText: string;
  /** True if PTA falls past the 14-hour shift window (advisory note on PTA card). */
  windowPastAtPta: boolean;
  /** Snapshot of current clocks from `evaluate()`. */
  cycleLimit: number;
  cycleWindowDays: number;
  cycleRemainingNow: number;
  driveRemainingNow: number;
  windowRemainingNow: number;
  recovery: RolloutRecovery | null;
  /** Engine-verified tentative segments for the feasible timetable (empty when infeasible). */
  simSegments: Segment[];
}

/* ---------- timezone formatting & wall-clock resolution (DST-safe via engine's localToMinute) ---------- */

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

const dtfIsoCache = new Map<string, Intl.DateTimeFormat>();
function isoFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfIsoCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    dtfIsoCache.set(tz, f);
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

/** Format an epoch minute as wall-clock `{ date: "YYYY-MM-DD", time: "HH:MM" }` in `timeZone`. */
export function formatWallDateTime(minute: number, timeZone: string): { date: string; time: string } {
  const parts = isoFormatter(timeZone).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hh = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hh}:${get('minute')}`,
  };
}

/** Minutes from midnight (0..1439) for an epoch minute in `timeZone`. */
export function wallMinutesInZone(minute: number, timeZone: string): number {
  const p = getZoneParts(minute, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * Resolve a wall-clock date ("YYYY-MM-DD") + time ("HH:MM") in `timeZone` to an exact UTC epoch minute
 * using the engine's DST-aware `localToMinute`. Returns null if the input cannot be parsed.
 */
export function resolveWallDateTime(dateStr: string, timeStr: string, timeZone: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]), mo = Number(dm[2]), d = Number(dm[3]);
  const h = Number(tm[1]), min = Number(tm[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) return null;
  // Reject overflow calendar dates like Feb 30
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return localToMinute(y, mo, d, h, tz, min);
}

/** Format an epoch minute explicitly in both home-terminal and appointment-local zones. */
export function formatDualTime(minute: number, homeTimeZone: string, apptTimeZone: string): DualTime {
  const sameZone = homeTimeZone === apptTimeZone;
  const homeName = zoneShort(homeTimeZone);
  const apptName = zoneShort(apptTimeZone);
  const hp = getZoneParts(minute, homeTimeZone);
  const ap = sameZone ? hp : getZoneParts(minute, apptTimeZone);
  const homeHM = `${hp.hour}:${hp.minute}`;
  const apptHM = `${ap.hour}:${ap.minute}`;
  return {
    minute,
    homeText: `${hp.weekday} ${hp.month} ${hp.day}, ${homeHM} ${homeName}`,
    homeShort: `${hp.weekday} ${homeHM} ${homeName}`,
    homeHM,
    apptText: `${ap.weekday} ${ap.month} ${ap.day}, ${apptHM} ${apptName}`,
    apptShort: `${ap.weekday} ${apptHM} ${apptName}`,
    apptHM,
    sameZone,
  };
}

/** Clamp speed to 45–65 mph and compute conservative drive minutes (matching engine/src/trip.ts ceiling). */
export function computeDriveMinutes(
  distanceMode: DistanceMode,
  miles: number,
  mph: number,
  driveMinutesDirect: number,
): { driveMinutes: number; effectiveMph: number } {
  const effectiveMph = Number.isFinite(mph)
    ? Math.max(MIN_MPH, Math.min(MAX_MPH, Math.round(mph)))
    : DEFAULT_MPH;
  if (distanceMode === 'hours') {
    const d = Number.isFinite(driveMinutesDirect) ? Math.max(0, Math.round(driveMinutesDirect)) : 0;
    return { driveMinutes: Math.min(d, LIMITS.DRIVE * 10), effectiveMph };
  }
  const m = Number.isFinite(miles) ? Math.max(0, miles) : 0;
  if (m <= 0) return { driveMinutes: 0, effectiveMph };
  // Subtract 1e-9 before ceil so exact divisions (e.g. 550 mi / 55 mph = 600m) never gain a float-epsilon minute.
  const mins = Math.ceil((m * 60) / effectiveMph - 1e-9);
  return { driveMinutes: Math.min(mins, LIMITS.DRIVE * 10), effectiveMph };
}

/**
 * Default hard appointment for first open: next morning at 08:00 in home-terminal time that is at
 * least 22 hours ahead of `now`, so an overnight run with a 10h break fits cleanly out of the box.
 */
export function defaultAppointmentFor(now: number, rawConfig: RulesConfig): { apptDate: string; apptTime: string } {
  const config = safeRulesConfig(rawConfig);
  let ds = carrierDayStart(now, config);
  for (let i = 0; i < 4; i++) {
    ds = nextCarrierDayStart(ds, config);
    const wd = formatWallDateTime(ds + 60, config.timeZone);
    const cand = resolveWallDateTime(wd.date, '08:00', config.timeZone);
    if (cand !== null && cand >= now + 22 * 60) {
      return { apptDate: wd.date, apptTime: '08:00' };
    }
  }
  const fallback = formatWallDateTime(now + 24 * 60, config.timeZone);
  return { apptDate: fallback.date, apptTime: '08:00' };
}

/** Build ready-to-send dispatch PTA plain text (appointment, planned arrival, and empty/available PTA). */
export function buildPtaText(
  appointment: DualTime,
  plannedArrival: DualTime,
  pta: DualTime,
  bufferMinutes: number,
  dockMinutes: number,
): string {
  const bufNote = bufferMinutes > 0 ? `${dur(bufferMinutes)} early` : 'on time';
  const dockNote = dockMinutes > 0 ? `est. ${dur(dockMinutes)} dock` : 'drop & hook / 0m dock';
  if (appointment.sameZone) {
    return [
      `Appt: ${appointment.apptText}`,
      `Planned arrival: ${plannedArrival.apptText} (${bufNote})`,
      `PTA (empty & available): ${pta.apptText} (${dockNote})`,
    ].join('\n');
  }
  return [
    `Appt: ${appointment.apptText} (${appointment.homeShort} home)`,
    `Planned arrival: ${plannedArrival.apptText} (${plannedArrival.homeShort} home, ${bufNote})`,
    `PTA (empty & available): ${pta.apptText} (${pta.homeShort} home; ${dockNote})`,
  ].join('\n');
}

/* ---------- internal backwards leg planner + engine verifier ---------- */

interface LegSpec {
  driveMinutes: number;
  preTripMinutes: number;
  breakMinutes: number;
}

/**
 * Partition `driveMinutes` into legal shift legs respecting 11h driving, 14h window, and 30m break.
 * Returns null if `preTripMinutes` leaves zero room for driving inside the 14h duty window.
 */
function buildLegSpecs(
  driveMinutes: number,
  preTripMinutes: number,
  shortHaul: boolean,
): LegSpec[] | null {
  if (driveMinutes <= 0) return [];
  // Single-shift check first
  if (driveMinutes <= LIMITS.DRIVE) {
    const breakMinutes = !shortHaul && driveMinutes > LIMITS.BREAK_AFTER ? LIMITS.BREAK_LEN : 0;
    if (preTripMinutes + driveMinutes + breakMinutes > LIMITS.WINDOW) return null;
    return [{ driveMinutes, preTripMinutes, breakMinutes }];
  }
  // Multi-shift split: each leg obeys 11h drive + 14h window + 30m break if >8h
  const maxWithBreak = Math.min(LIMITS.DRIVE, LIMITS.WINDOW - preTripMinutes - (shortHaul ? 0 : LIMITS.BREAK_LEN));
  const maxWithoutBreak = Math.min(LIMITS.BREAK_AFTER, LIMITS.WINDOW - preTripMinutes);
  const maxPerLeg = Math.max(maxWithBreak, maxWithoutBreak);
  if (maxPerLeg <= 0) return null;
  const specs: LegSpec[] = [];
  let rem = driveMinutes;
  let guard = 0;
  while (rem > 0 && guard++ < 12) {
    const d = Math.min(rem, maxPerLeg);
    const brk = !shortHaul && d > LIMITS.BREAK_AFTER ? LIMITS.BREAK_LEN : 0;
    if (preTripMinutes + d + brk > LIMITS.WINDOW) return null;
    specs.push({ driveMinutes: d, preTripMinutes, breakMinutes: brk });
    rem -= d;
  }
  if (rem > 0) return null;
  return specs;
}

function totalSpanOf(specs: LegSpec[]): number {
  let total = 0;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    total += sp.preTripMinutes + sp.driveMinutes + sp.breakMinutes;
    if (i < specs.length - 1) total += LIMITS.RESET;
  }
  return total;
}

/** Materialize tentative segments for `specs` starting at `rollOut`, placing each 30m break at its earliest legal minute. */
function buildRunSegments(
  specs: LegSpec[],
  rollOut: number,
  breakOffsetsOverride?: number[],
): { segs: Segment[]; end: number } {
  const segs: Segment[] = [];
  let t = rollOut;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    if (sp.preTripMinutes > 0) {
      segs.push({ status: 'ON', start: t, end: t + sp.preTripMinutes, tentative: true, note: 'Pre-trip' });
      t += sp.preTripMinutes;
    }
    if (sp.breakMinutes > 0) {
      const before = breakOffsetsOverride?.[i] !== undefined
        ? breakOffsetsOverride[i]
        : Math.max(0, sp.driveMinutes - LIMITS.BREAK_AFTER);
      const after = sp.driveMinutes - before;
      if (before > 0) {
        segs.push({ status: 'D', start: t, end: t + before, tentative: true, note: 'Planned drive' });
        t += before;
      }
      segs.push({ status: 'OFF', start: t, end: t + sp.breakMinutes, tentative: true, note: '30-min break' });
      t += sp.breakMinutes;
      if (after > 0) {
        segs.push({ status: 'D', start: t, end: t + after, tentative: true, note: 'Planned drive' });
        t += after;
      }
    } else if (sp.driveMinutes > 0) {
      segs.push({ status: 'D', start: t, end: t + sp.driveMinutes, tentative: true, note: 'Planned drive' });
      t += sp.driveMinutes;
    }
    if (i < specs.length - 1) {
      segs.push({ status: 'OFF', start: t, end: t + LIMITS.RESET, tentative: true, note: 'En-route 10h break' });
      t += LIMITS.RESET;
    }
  }
  return { segs, end: t };
}

function buildLegViews(
  specs: LegSpec[],
  rollOut: number,
  homeTz: string,
  apptTz: string,
  shortHaul: boolean,
  firstLegMaxDriveBeforeBreak?: number,
): RolloutLeg[] {
  const legs: RolloutLeg[] = [];
  let t = rollOut;
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i];
    const legRollOut = t;
    const wheels = legRollOut + sp.preTripMinutes;
    const legEnd = wheels + sp.driveMinutes + sp.breakMinutes;

    let breakWindow: BreakWindow;
    if (shortHaul) {
      breakWindow = {
        required: false,
        exemptShortHaul: true,
        reason: 'Exempt under short-haul setting (§395.1(e))',
        earliestStart: null,
        latestStart: null,
        minDriveBeforeBreak: 0,
        maxDriveBeforeBreak: 0,
      };
    } else if (sp.breakMinutes > 0) {
      const minDrive = Math.max(0, sp.driveMinutes - LIMITS.BREAK_AFTER);
      const maxDrive = i === 0 && firstLegMaxDriveBeforeBreak !== undefined
        ? Math.min(LIMITS.BREAK_AFTER, firstLegMaxDriveBeforeBreak)
        : LIMITS.BREAK_AFTER;
      breakWindow = {
        required: true,
        exemptShortHaul: false,
        reason: `Required for ${dur(sp.driveMinutes)} driving (8-hour rule)`,
        earliestStart: formatDualTime(wheels + minDrive, homeTz, apptTz),
        latestStart: formatDualTime(wheels + maxDrive, homeTz, apptTz),
        minDriveBeforeBreak: minDrive,
        maxDriveBeforeBreak: maxDrive,
      };
    } else {
      breakWindow = {
        required: false,
        exemptShortHaul: false,
        reason: `Not required — ${dur(sp.driveMinutes)} driving is within the 8-hour limit`,
        earliestStart: null,
        latestStart: null,
        minDriveBeforeBreak: 0,
        maxDriveBeforeBreak: 0,
      };
    }

    const enRouteRestAfter = i < specs.length - 1
      ? {
          start: formatDualTime(legEnd, homeTz, apptTz),
          end: formatDualTime(legEnd + LIMITS.RESET, homeTz, apptTz),
          minutes: LIMITS.RESET,
        }
      : null;

    legs.push({
      legIndex: i,
      rollOut: formatDualTime(legRollOut, homeTz, apptTz),
      wheelsRoll: formatDualTime(wheels, homeTz, apptTz),
      driveMinutes: sp.driveMinutes,
      preTripMinutes: sp.preTripMinutes,
      breakWindow,
      legEnd: formatDualTime(legEnd, homeTz, apptTz),
      enRouteRestAfter,
    });

    t = legEnd + (i < specs.length - 1 ? LIMITS.RESET : 0);
  }
  return legs;
}

interface VerifyOutcome {
  ok10: boolean;
  ok34: boolean;
  violations: Violation[];
  cycleViolsNoNew34: Violation[];
  simSegments: Segment[];
}

/**
 * Verify a fresh-break schedule starting at `candidateRollOut` through `engine/src/index.ts`.
 * Explicitly separates plain 10-hour break legality from 34-hour restart legality so a 10h break
 * never silently depends on a 34-hour restart the driver was not told to take.
 */
function verifyFreshSchedule(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  specs: LegSpec[],
  candidateRollOut: number,
  earliestFreshRollOut: number,
  earliestRestartRollOut: number,
): VerifyOutcome {
  const lead: Segment[] = candidateRollOut > now
    ? [{ status: 'OFF', start: now, end: candidateRollOut, tentative: true, note: 'Pre-run rest' }]
    : [];
  const built = buildRunSegments(specs, candidateRollOut);
  const simSegments = [...lead, ...built.segs];
  const combined = [...logged, ...simSegments];
  const ev = evaluate(combined, { asOf: built.end, config });
  const newViols = ev.violations.filter((v) => v.tentative || v.start >= now);

  // Strip any newly created 34-hour restart (ending after `now`) to test whether a plain 10h break suffices.
  const norm = normalize(combined);
  const rests = restPeriods(norm);
  const restsNoNew34 = rests.map((r) => (r.isRestart && r.end > now ? { ...r, isRestart: false } : r));
  const cycleViolsNoNew34 = cycleViolations(norm, restsNoNew34, config).filter((v) => v.tentative || v.start >= now);

  const hasTen = candidateRollOut >= earliestFreshRollOut;
  const has34 = candidateRollOut >= earliestRestartRollOut;
  return {
    ok10: hasTen && newViols.length === 0 && cycleViolsNoNew34.length === 0,
    ok34: has34 && newViols.length === 0,
    violations: newViols,
    cycleViolsNoNew34,
    simSegments,
  };
}

interface CurrentShiftOutcome {
  ok: boolean;
  rollOut: number;
  specs: LegSpec[];
  maxDriveBeforeBreak: number;
  simSegments: Segment[];
}

/**
 * Check whether a single-shift run fits legally on the driver's CURRENT shift clocks without a 10-hour break.
 * Never invents an unrequested split-sleeper chain (`ev.shift.chain.length <= evNow.shift.chain.length`).
 */
function verifyCurrentShift(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  evNowChainLen: number,
  driveMinutes: number,
  preTripMinutes: number,
  bufferedArrival: number,
): CurrentShiftOutcome | null {
  if (driveMinutes <= 0 || driveMinutes > LIMITS.DRIVE) return null;
  // Try without extra break first (when drive <= 8h), then with 30m break if breakRemaining requires it.
  const tryBreak = (withBreak: boolean): CurrentShiftOutcome | null => {
    const brk = withBreak ? LIMITS.BREAK_LEN : 0;
    const rollOut = bufferedArrival - driveMinutes - brk - preTripMinutes;
    if (rollOut < now) return null;
    const wheels = rollOut + preTripMinutes;
    const lead: Segment[] = rollOut > now
      ? [{ status: 'OFF', start: now, end: rollOut, tentative: true, note: 'Wait before roll-out' }]
      : [];
    const preSeg: Segment[] = preTripMinutes > 0
      ? [{ status: 'ON', start: rollOut, end: wheels, tentative: true, note: 'Pre-trip' }]
      : [];
    const evPre = evaluate([...logged, ...lead, ...preSeg], { asOf: wheels, config });
    const breakRem = evPre.shift.breakRemaining;
    if (!config.shortHaul && !withBreak && driveMinutes > breakRem) return null;

    const specs: LegSpec[] = [{ driveMinutes, preTripMinutes, breakMinutes: brk }];
    const minBefore = withBreak ? Math.max(0, driveMinutes - LIMITS.BREAK_AFTER) : 0;
    const maxBefore = withBreak ? Math.min(LIMITS.BREAK_AFTER, breakRem) : driveMinutes;
    if (withBreak && minBefore > maxBefore) return null;

    const built = buildRunSegments(specs, rollOut, withBreak ? [minBefore] : undefined);
    const simSegments = [...lead, ...built.segs];
    const ev = evaluate([...logged, ...simSegments], { asOf: built.end, config });
    const newViols = ev.violations.filter((v) => v.tentative || v.start >= now);
    if (newViols.length > 0) return null;
    // Never silently rely on a newly formed split-sleeper pair the driver didn't ask for.
    if (ev.shift.chain.length > evNowChainLen) return null;
    return { ok: true, rollOut, specs, maxDriveBeforeBreak: maxBefore, simSegments };
  };

  if (config.shortHaul || driveMinutes <= LIMITS.BREAK_AFTER) {
    const direct = tryBreak(false);
    if (direct) return direct;
  }
  return config.shortHaul ? null : tryBreak(true);
}

/**
 * Find the earliest legal roll-out >= `now` that completes `specs` with zero post-`now` violations.
 * Searches current-shift `now`, 10h-reset completion, upcoming carrier-day recap roll-offs (binary
 * searched to the exact minute), and 34-hour restart completion.
 */
function findEarliestLegalRollOut(
  logged: Segment[],
  now: number,
  config: RulesConfig,
  evNowChainLen: number,
  specs: LegSpec[],
  driveMinutes: number,
  preTripMinutes: number,
  earliestFreshRollOut: number,
  earliestRestartRollOut: number,
  windowDays: number,
): { rollOut: number; arrival: number; needsRestart34: boolean } | null {
  const runSpan = totalSpanOf(specs);

  // 1. Can the driver legally roll RIGHT NOW on current shift clocks (single-shift)?
  if (specs.length === 1) {
    const tryNow = verifyCurrentShift(logged, now, config, evNowChainLen, driveMinutes, preTripMinutes, now + runSpan);
    if (tryNow) return { rollOut: tryNow.rollOut, arrival: now + runSpan, needsRestart34: false };
    // Also check if a 30m break makes rolling at `now` legal when drive <= 8h on a mid-shift break clock
    if (!config.shortHaul && specs[0].breakMinutes === 0) {
      const spanWithBrk = preTripMinutes + driveMinutes + LIMITS.BREAK_LEN;
      const tryNowBrk = verifyCurrentShift(logged, now, config, evNowChainLen, driveMinutes, preTripMinutes, now + spanWithBrk);
      if (tryNowBrk) return { rollOut: tryNowBrk.rollOut, arrival: now + spanWithBrk, needsRestart34: false };
    }
  }

  // 2. Check fresh 10-hour break completion
  const atFresh = verifyFreshSchedule(logged, now, config, specs, earliestFreshRollOut, earliestFreshRollOut, earliestRestartRollOut);
  if (atFresh.ok10) {
    return { rollOut: earliestFreshRollOut, arrival: earliestFreshRollOut + runSpan, needsRestart34: false };
  }

  // 3. Cycle-limited: check both upcoming carrier-day recap roll-offs AND 34-hour restart completion, pick earliest!
  let best: { rollOut: number; arrival: number; needsRestart34: boolean } | null = null;
  const consider = (cand: { rollOut: number; arrival: number; needsRestart34: boolean }) => {
    if (!best || cand.rollOut < best.rollOut) best = cand;
  };

  // 3a. 34-hour restart completion
  const at34 = verifyFreshSchedule(logged, now, config, specs, earliestRestartRollOut, earliestFreshRollOut, earliestRestartRollOut);
  if (at34.ok34) {
    consider({ rollOut: earliestRestartRollOut, arrival: earliestRestartRollOut + runSpan, needsRestart34: !at34.ok10 });
  }

  // 3b. Upcoming carrier-day starts (recap roll-offs)
  let ds = carrierDayStart(earliestFreshRollOut, config);
  let prevFail = earliestFreshRollOut;
  for (let i = 0; i < windowDays + 2; i++) {
    ds = nextCarrierDayStart(ds, config);
    if (best && prevFail >= (best as { rollOut: number }).rollOut) break;
    const atDay = verifyFreshSchedule(logged, now, config, specs, ds, earliestFreshRollOut, earliestRestartRollOut);
    if (atDay.ok10) {
      // Binary search [prevFail, ds] for the exact earliest minute that stays cycle-legal across midnight
      let lo = prevFail;
      let hi = ds;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        const mRes = verifyFreshSchedule(logged, now, config, specs, mid, earliestFreshRollOut, earliestRestartRollOut);
        if (mRes.ok10) hi = mid;
        else lo = mid;
      }
      consider({ rollOut: hi, arrival: hi + runSpan, needsRestart34: false });
      break;
    }
    prevFail = ds;
  }

  return best;
}

/* ---------- main public planner ---------- */

/**
 * Work backwards from a hard pickup/delivery appointment through FMCSA HOS rules
 * and verify feasibility directly against the driver's logged record via `evaluate()`.
 */
export function planRollout(input: RolloutInput): RolloutPlan {
  const { now } = input;
  const config = safeRulesConfig(input.config);
  const logged = input.segments.filter((s) => !s.tentative);
  const homeTz = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const apptTz = isValidTimeZone(input.apptTimeZone) ? input.apptTimeZone : homeTz;
  const sameZone = homeTz === apptTz;
  const homeZoneName = zoneShort(homeTz);
  const apptZoneName = zoneShort(apptTz);
  const entryTz = input.entryZoneMode === 'local' ? apptTz : homeTz;

  const { limit: cycleLimit, windowDays: cycleWindowDays } = cycleParamsOf(config);
  const evNow = evaluate(logged, { asOf: now, config });
  const loggedRests = restPeriods(evNow.segments);
  const activeRestNow = loggedRests.find((r) => r.start <= now && r.end === now) ?? null;
  const isFreshEmpty = evNow.segments.length === 0;

  const earliestFreshRollOut = isFreshEmpty
    ? now
    : activeRestNow
      ? Math.max(now, activeRestNow.start + LIMITS.RESET)
      : now + LIMITS.RESET;
  const earliestRestartRollOut = isFreshEmpty
    ? now
    : activeRestNow
      ? Math.max(now, activeRestNow.start + LIMITS.RESTART)
      : now + LIMITS.RESTART;

  const { driveMinutes, effectiveMph } = computeDriveMinutes(
    input.distanceMode,
    input.miles,
    input.mph,
    input.driveMinutesDirect,
  );
  const bufferMinutes = Number.isFinite(input.bufferMinutes) ? Math.max(0, Math.min(240, Math.round(input.bufferMinutes))) : DEFAULT_BUFFER_MIN;
  const dockMinutes = Number.isFinite(input.dockMinutes) ? Math.max(0, Math.min(720, Math.round(input.dockMinutes))) : DEFAULT_DOCK_MIN;
  const preTripMinutes = Number.isFinite(input.preTripMinutes) ? Math.max(0, Math.min(240, Math.round(input.preTripMinutes))) : DEFAULT_PRETRIP_MIN;

  const apptMin = resolveWallDateTime(input.apptDate, input.apptTime, entryTz);
  const dummyTime = formatDualTime(now, homeTz, apptTz);
  const emptyBreak: BreakWindow = {
    required: false,
    exemptShortHaul: config.shortHaul,
    reason: 'Enter distance or drive hours to compute break window.',
    earliestStart: null,
    latestStart: null,
    minDriveBeforeBreak: 0,
    maxDriveBeforeBreak: 0,
  };

  const baseMeta = {
    homeTimeZone: homeTz,
    apptTimeZone: apptTz,
    homeZoneName,
    apptZoneName,
    sameZone,
    entryZoneMode: input.entryZoneMode,
    driveMinutes,
    effectiveMph,
    bufferMinutes,
    dockMinutes,
    preTripMinutes,
    cycleLimit,
    cycleWindowDays,
    cycleRemainingNow: evNow.cycle.remaining,
    driveRemainingNow: evNow.shift.driveRemaining,
    windowRemainingNow: evNow.shift.windowRemaining,
  };

  // Guard invalid appointment or zero distance
  if (apptMin === null || driveMinutes <= 0) {
    const reason = apptMin === null
      ? 'Enter a valid appointment date and time to build your backwards timetable.'
      : 'Enter a distance in miles or drive time above 0 to build your backwards timetable.';
    return {
      ...baseMeta,
      validInput: false,
      feasible: false,
      tone: 'warn',
      verdictSign: 'warn',
      verdictLabel: 'Enter run details',
      headline: reason,
      reason,
      restMode: 'none',
      appointment: apptMin !== null ? formatDualTime(apptMin, homeTz, apptTz) : dummyTime,
      bufferedArrival: dummyTime,
      plannedArrival: dummyTime,
      rollOut: dummyTime,
      wheelsRoll: dummyTime,
      latestShutdown: dummyTime,
      requiredRestMinutes: 0,
      inParkingSweetSpot: false,
      currentRestCoversBreak: false,
      currentRestStart: null,
      currentRestDoneAt: null,
      breakWindow: emptyBreak,
      legs: [],
      pta: dummyTime,
      ptaText: '',
      windowPastAtPta: false,
      recovery: null,
      simSegments: [],
    };
  }

  const appointment = formatDualTime(apptMin, homeTz, apptTz);
  const bufferedArrivalMin = apptMin - bufferMinutes;
  const bufferedArrival = formatDualTime(bufferedArrivalMin, homeTz, apptTz);
  const specs = buildLegSpecs(driveMinutes, preTripMinutes, config.shortHaul);

  // Guard impossible 14-hour shift window (e.g., excessive pre-trip + drive)
  if (!specs) {
    const reason = `Pre-trip (${dur(preTripMinutes)}) plus drive time (${dur(driveMinutes)}) exceeds the 14-hour shift window.`;
    return {
      ...baseMeta,
      validInput: true,
      feasible: false,
      tone: 'bad',
      verdictSign: 'stop',
      verdictLabel: 'Does not fit',
      headline: `Does not fit — ${reason}`,
      reason,
      restMode: 'none',
      appointment,
      bufferedArrival,
      plannedArrival: bufferedArrival,
      rollOut: dummyTime,
      wheelsRoll: dummyTime,
      latestShutdown: dummyTime,
      requiredRestMinutes: LIMITS.RESET,
      inParkingSweetSpot: false,
      currentRestCoversBreak: false,
      currentRestStart: null,
      currentRestDoneAt: null,
      breakWindow: emptyBreak,
      legs: [],
      pta: formatDualTime(apptMin + dockMinutes, homeTz, apptTz),
      ptaText: '',
      windowPastAtPta: false,
      recovery: null,
      simSegments: [],
    };
  }

  const runSpan = totalSpanOf(specs);
  const targetRollOutMin = bufferedArrivalMin - runSpan;
  const targetShutdown10Min = targetRollOutMin - LIMITS.RESET;

  // 1. Test fresh 10-hour break (and check whether a 34-hour restart is required for cycle)
  const freshCheck = targetRollOutMin >= now
    ? verifyFreshSchedule(logged, now, config, specs, targetRollOutMin, earliestFreshRollOut, earliestRestartRollOut)
    : null;

  if (freshCheck && (freshCheck.ok10 || freshCheck.ok34)) {
    const restMode = freshCheck.ok10 ? 'reset10' : 'restart34';
    const requiredRestMinutes = restMode === 'reset10' ? LIMITS.RESET : LIMITS.RESTART;
    const shutdownMin = targetRollOutMin - requiredRestMinutes;
    const latestShutdown = formatDualTime(shutdownMin, homeTz, apptTz);
    const rollOut = formatDualTime(targetRollOutMin, homeTz, apptTz);
    const wheelsRoll = formatDualTime(targetRollOutMin + specs[0].preTripMinutes, homeTz, apptTz);
    const legs = buildLegViews(specs, targetRollOutMin, homeTz, apptTz, config.shortHaul);
    const plannedArrival = legs[legs.length - 1].legEnd;
    const ptaMin = Math.max(apptMin, plannedArrival.minute) + dockMinutes;
    const pta = formatDualTime(ptaMin, homeTz, apptTz);
    const ptaText = buildPtaText(appointment, plannedArrival, pta, bufferMinutes, dockMinutes);

    const shutdownWall = wallMinutesInZone(shutdownMin, homeTz);
    const inParkingSweetSpot = shutdownWall >= SWEET_SPOT_START_MIN && shutdownWall <= SWEET_SPOT_END_MIN;
    const currentRestCoversBreak = !isFreshEmpty && activeRestNow !== null && activeRestNow.start <= shutdownMin;
    const currentRestStart = currentRestCoversBreak && activeRestNow ? formatDualTime(activeRestNow.start, homeTz, apptTz) : null;
    const currentRestDoneAt = currentRestCoversBreak && activeRestNow
      ? formatDualTime(activeRestNow.start + requiredRestMinutes, homeTz, apptTz)
      : null;
    const windowPastAtPta = specs.length === 1 && ptaMin - targetRollOutMin > LIMITS.WINDOW;

    const rollDisplay = sameZone ? rollOut.homeShort : `${rollOut.homeShort} (${rollOut.apptShort})`;
    const ptaDisplay = sameZone ? pta.apptShort : `${pta.apptShort} (${pta.homeShort})`;

    const is34 = restMode === 'restart34';
    return {
      ...baseMeta,
      validInput: true,
      feasible: true,
      tone: is34 ? 'warn' : 'good',
      verdictSign: is34 ? 'warn' : 'go',
      verdictLabel: is34 ? 'Needs 34h reset' : 'Timetable ready',
      headline: is34
        ? `Fits with a 34-hour reset before roll-out — roll out ${rollDisplay}, PTA ${ptaDisplay}.`
        : `Legal timetable — roll out ${rollDisplay}, PTA ${ptaDisplay}.`,
      reason: is34
        ? `Your ${cycleLimit / 60}-hour cycle requires a 34-hour restart before this run; shutting down by ${latestShutdown.homeShort} clears it in time.`
        : `Fits cleanly after a 10-hour break (${specs.length > 1 ? `${specs.length} shifts with ${specs.length - 1} en-route 10h break` : `${dur(driveMinutes)} drive`}).`,
      restMode,
      appointment,
      bufferedArrival,
      plannedArrival,
      rollOut,
      wheelsRoll,
      latestShutdown,
      requiredRestMinutes,
      inParkingSweetSpot,
      currentRestCoversBreak,
      currentRestStart,
      currentRestDoneAt,
      breakWindow: legs[0].breakWindow,
      legs,
      pta,
      ptaText,
      windowPastAtPta,
      recovery: null,
      simSegments: freshCheck.simSegments,
    };
  }

  // 2. If 10h break doesn't finish before required roll-out (or rollOut < earliestFreshRollOut),
  //    check whether the driver's CURRENT shift clocks can legally cover a single-shift run!
  if (specs.length === 1 && targetRollOutMin < earliestFreshRollOut) {
    const curCheck = verifyCurrentShift(
      logged,
      now,
      config,
      evNow.shift.chain.length,
      driveMinutes,
      preTripMinutes,
      bufferedArrivalMin,
    );
    if (curCheck) {
      const rollOut = formatDualTime(curCheck.rollOut, homeTz, apptTz);
      const wheelsRoll = formatDualTime(curCheck.rollOut + preTripMinutes, homeTz, apptTz);
      const latestShutdown = formatDualTime(curCheck.rollOut - LIMITS.RESET, homeTz, apptTz);
      const legs = buildLegViews(curCheck.specs, curCheck.rollOut, homeTz, apptTz, config.shortHaul, curCheck.maxDriveBeforeBreak);
      const plannedArrival = legs[0].legEnd;
      const ptaMin = Math.max(apptMin, plannedArrival.minute) + dockMinutes;
      const pta = formatDualTime(ptaMin, homeTz, apptTz);
      const ptaText = buildPtaText(appointment, plannedArrival, pta, bufferMinutes, dockMinutes);
      const rollDisplay = sameZone ? rollOut.homeShort : `${rollOut.homeShort} (${rollOut.apptShort})`;
      const ptaDisplay = sameZone ? pta.apptShort : `${pta.apptShort} (${pta.homeShort})`;
      const windowPastAtPta = ptaMin - evNow.shift.anchor > LIMITS.WINDOW;

      return {
        ...baseMeta,
        validInput: true,
        feasible: true,
        tone: 'good',
        verdictSign: 'go',
        verdictLabel: 'Fits current shift',
        headline: `Fits on your current shift — roll out ${rollDisplay}, PTA ${ptaDisplay}.`,
        reason: 'No 10-hour break needed before roll-out; your current 11/14/cycle clocks cover this run.',
        restMode: 'current_shift',
        appointment,
        bufferedArrival,
        plannedArrival,
        rollOut,
        wheelsRoll,
        latestShutdown,
        requiredRestMinutes: 0,
        inParkingSweetSpot: false,
        currentRestCoversBreak: false,
        currentRestStart: null,
        currentRestDoneAt: null,
        breakWindow: legs[0].breakWindow,
        legs,
        pta,
        ptaText,
        windowPastAtPta,
        recovery: null,
        simSegments: curCheck.simSegments,
      };
    }
  }

  // 3. INFEASIBLE — compute exact recovery (earliest legal roll-out & earliest workable appointment).
  const found = findEarliestLegalRollOut(
    logged,
    now,
    config,
    evNow.shift.chain.length,
    specs,
    driveMinutes,
    preTripMinutes,
    earliestFreshRollOut,
    earliestRestartRollOut,
    cycleWindowDays,
  );

  let recovery: RolloutRecovery | null = null;
  if (found) {
    const earliestWorkableMin = found.arrival + bufferMinutes;
    const arrivalLateBy = found.arrival - apptMin;
    const entryWall = formatWallDateTime(earliestWorkableMin, entryTz);
    recovery = {
      earliestLegalRollOut: formatDualTime(found.rollOut, homeTz, apptTz),
      earliestLegalArrival: formatDualTime(found.arrival, homeTz, apptTz),
      earliestWorkableAppt: formatDualTime(earliestWorkableMin, homeTz, apptTz),
      apptShiftMinutes: Math.max(0, earliestWorkableMin - apptMin),
      arrivalLateByMinutes: arrivalLateBy,
      maxBufferThatFits: arrivalLateBy <= 0 ? apptMin - found.arrival : null,
      needsRestart34: found.needsRestart34,
      apptDateInEntryZone: entryWall.date,
      apptTimeInEntryZone: entryWall.time,
    };
  }

  const targetRollOutDual = formatDualTime(targetRollOutMin, homeTz, apptTz);
  const targetShutdownDual = formatDualTime(targetShutdown10Min, homeTz, apptTz);
  let headline: string;
  let reason: string;

  if (apptMin <= now) {
    headline = `Does not fit — appointment (${appointment.apptShort}) is already in the past.`;
    reason = 'Move the appointment forward to build a legal timetable.';
  } else if (freshCheck && freshCheck.violations.some((v) => v.kind === 'CYCLE')) {
    headline = `Does not fit — not enough ${cycleLimit / 60}-hour cycle hours left for this run.`;
    reason = `You have ${dur(evNow.cycle.remaining)} left on your ${cycleLimit / 60}-hour / ${cycleWindowDays}-day cycle; this run needs ${dur(preTripMinutes + driveMinutes)} on duty.`;
  } else if (targetRollOutMin < now) {
    headline = `Does not fit — required roll-out (${targetRollOutDual.homeShort}) has already passed.`;
    reason = `Working backwards from ${appointment.apptShort} with a ${dur(bufferMinutes)} buffer requires rolling out ${dur(now - targetRollOutMin)} ago.`;
  } else {
    const freshDual = formatDualTime(earliestFreshRollOut, homeTz, apptTz);
    headline = `Does not fit — a full 10-hour break cannot finish before the ${targetRollOutDual.homeShort} roll-out.`;
    reason = `Your earliest legal roll-out after a 10-hour break is ${freshDual.homeShort} (${dur(earliestFreshRollOut - targetRollOutMin)} past the required roll-out), and current shift clocks cannot cover the run without a break.`;
  }

  return {
    ...baseMeta,
    validInput: true,
    feasible: false,
    tone: 'bad',
    verdictSign: 'stop',
    verdictLabel: 'Does not fit',
    headline,
    reason,
    restMode: 'none',
    appointment,
    bufferedArrival,
    plannedArrival: recovery ? recovery.earliestLegalArrival : bufferedArrival,
    rollOut: targetRollOutDual,
    wheelsRoll: formatDualTime(targetRollOutMin + preTripMinutes, homeTz, apptTz),
    latestShutdown: targetShutdownDual,
    requiredRestMinutes: LIMITS.RESET,
    inParkingSweetSpot: false,
    currentRestCoversBreak: false,
    currentRestStart: null,
    currentRestDoneAt: null,
    breakWindow: emptyBreak,
    legs: [],
    pta: formatDualTime(apptMin + dockMinutes, homeTz, apptTz),
    ptaText: '',
    windowPastAtPta: false,
    recovery,
    simSegments: [],
  };
}
