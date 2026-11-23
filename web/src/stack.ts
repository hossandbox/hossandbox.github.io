/**
 * Stack My Stops & Loads — Multi-Stop & Back-to-Back Pre-Plan Chain Checker (Plan tool #8).
 *
 * Built strictly on the existing HOS engine (`engine/src/index.ts`) and store
 * helpers (`web/src/store.ts`) without modifying `engine/` or `web/src/store.ts`.
 *
 * Chains 2 to 5 sequential stops or back-to-back pre-plans forward from the driver's
 * logged clock state, composing:
 *   - `evaluate()` for exact 11h / 14h / 30-min break / 60/70h cycle clocks & violations
 *   - `planTrip()` (with `restStrategy: 'reset10'` and `'restart34'`) sequentially per leg
 *     for legal 30-min breaks, 10-hour resets, midnight recap waits, and 34-hour restarts
 *   - `pairQualifies()`, `restPeriods()`, `normalize()`, and `cycleViolations()` for
 *     engine-verified 7/3 and 8/2 sleeper-berth split rescues between stops
 *   - `pruneHistory()` and `localToMinute()` for DST-safe dual home/local timezone math
 *
 * 100% offline. Zero hand-rolled HOS rules arithmetic.
 */
import type {
  DutyStatus,
  FullEvaluation,
  RestPeriod,
  RulesConfig,
  Segment,
  TripPlan,
  Violation,
  ViolationKind,
} from '../../engine/src/index.ts';
import {
  LIMITS,
  cycleViolations,
  evaluate,
  localToMinute,
  normalize,
  pairQualifies,
  planTrip,
  pruneHistory,
  restPeriods,
} from '../../engine/src/index.ts';
import { ZONE_LABELS, cycleParamsOf, dur, isValidTimeZone, zoneShort } from './store.ts';
import { dayStartWord, safeRulesConfig } from './carrierday.ts';

export const STACK_MIN_STOPS = 2;
export const STACK_MAX_STOPS = 5;
export const STACK_MIN_MPH = 45;
export const STACK_MAX_MPH = 65;
export const STACK_DEFAULT_MPH = 55;
export const STACK_MAX_MILES = 3000;
export const STACK_MAX_DWELL_MIN = 720; // 12h
export const STACK_MAX_DEPARTURE_FUTURE_MIN = 72 * 60; // 72h sanity cap on pinned departure
export const STACK_SPLIT_SB_CALLOUT = 'Long leg = Sleeper Berth ONLY; verify on your ELD.';

export const STACK_MILES_PRESETS = [45, 100, 180, 300, 450] as const;
export const STACK_MPH_PRESETS = [45, 50, 55, 60, 65] as const;
export const STACK_DWELL_PRESETS = [
  { label: '0m', minutes: 0, status: 'ON' as const },
  { label: '+15m drop/hook', minutes: 15, status: 'ON' as const },
  { label: '+1h', minutes: 60, status: 'ON' as const },
  { label: '+2h live', minutes: 120, status: 'ON' as const },
  { label: '+3h live', minutes: 180, status: 'ON' as const },
] as const;

export const STACK_COMMON_ZONES: string[] = Object.keys(ZONE_LABELS);

export type StackLimitKind = ViolationKind | 'TIME_ONLY' | 'NONE';

export interface StackStopInput {
  id: string;
  label: string;
  /** Driving miles from previous stop (or from current position for Stop 1). */
  miles: number;
  /** Realistic average speed for this leg, clamped 45..65 (default 55). */
  mph: number;
  /** Expected dock / unload / drop-hook dwell in minutes (>= 0). */
  dwellMinutes: number;
  /** Duty status during dwell (default 'ON' so unsplit dock time never invents rest credit). */
  dwellStatus: 'ON' | 'OFF' | 'SB';
  /** Optional hard appointment UTC epoch minute. */
  apptMinute: number | null;
  /** IANA timezone of this stop's facility (defaults to home terminal). */
  apptTimeZone: string;
  /** Entry/display mode used for the appointment wall-clock reading ('local' stop zone or 'terminal' home zone). */
  apptEntryMode?: 'local' | 'terminal';
}

export interface StackInput {
  /** Logged (non-tentative) segments materialized up to `now` (e.g. `loggedSegments(s, now)`). */
  segments: Segment[];
  /** Current UTC epoch minute. */
  now: number;
  /** Carrier rules config (cycle, dayStartHour, timeZone, shortHaul, exceptions). */
  config: RulesConfig;
  /** Optional planned departure epoch minute (>= now). Defaults to `now`. */
  departure?: number;
  /** Duty status between `now` and `departure` when `departure > now`. Defaults to `'ON'`. */
  untilDepartureStatus?: DutyStatus;
  /** 2 to 5 sequential stops or back-to-back pre-plans. */
  stops: StackStopInput[];
  /** Whether to evaluate 7/3 and 8/2 sleeper split rescues between stops (default true). */
  allowSplitBetweenStops?: boolean;
}

export interface StackDualTime {
  minute: number;
  homeShort: string;
  homeFull: string;
  localShort: string;
  localFull: string;
  sameZone: boolean;
}

export interface StackInsertedRest {
  kind: 'break30' | 'reset10' | 'recap' | 'restart34' | 'split';
  status: 'OFF' | 'SB';
  start: number;
  end: number;
  minutes: number;
  startDual: StackDualTime;
  endDual: StackDualTime;
  /** Engine `binding` clock that triggered this rest (if any). */
  triggeredBy: StackLimitKind;
  reason: string;
}

export interface StackStopOutcome {
  index: number;
  id: string;
  label: string;
  miles: number;
  effectiveMph: number;
  driveMinutes: number;
  dwellMinutes: number;
  dwellStatus: 'ON' | 'OFF' | 'SB';
  apptZone: string;
  apptZoneName: string;
  sameZone: boolean;
  /** Optional hard appointment in both local and home terminal zones. */
  appt: StackDualTime | null;
  /** Wheels-stop arrival at this stop. */
  arrival: StackDualTime;
  /** When dwell starts (`max(arrival, appt)` when early). */
  dwellStart: StackDualTime;
  /** When dwell finishes and next leg begins (PTA). */
  depart: StackDualTime;
  /** Wait minutes between early arrival and appointment start (0 if on time/late/no appt). */
  earlyWaitMinutes: number;
  /** `appt - arrival` in minutes (`>= 0` on time/early, `< 0` late, `null` if no appt). */
  apptSlack: number | null;
  meetsAppt: boolean;
  /** Rests inserted before/during this stop's driving leg. */
  insertedRests: StackInsertedRest[];
  /** Violations whose start falls on this stop (continuous diagnostic only; 0 on legal plans). */
  violations: Violation[];
  /** Remaining clocks from `evaluate()` right after this stop finishes (`depart.minute`). */
  driveRemainingAfter: number;
  windowRemainingAfter: number;
  cycleRemainingAfter: number;
  breakRemainingAfter: number;
  bindingAfter: FullEvaluation['binding'];
}

export interface StackChainPass {
  strategy: 'continuous' | 'reset10' | 'restart34';
  feasible: boolean;
  hosLegal: boolean;
  allApptsMet: boolean;
  stops: StackStopOutcome[];
  finishAt: number;
  finishDual: StackDualTime;
  /** Total count of >=10h resets / cycle waits inserted across the chain. */
  longRestCount: number;
  /** Index of the last stop that had a >=10h rest / cycle wait before it, or -1. */
  lastLongRestStopIndex: number;
  violations: Violation[];
  simSegments: Segment[];
  endEval: FullEvaluation;
}

export interface StackSplitRescue {
  splitKind: '8/2' | '7/3';
  order: 'short-first' | 'long-first' | 'completes-pending-long' | 'completes-pending-short';
  /** Stop index where the split leg is taken (`-1` = before Stop 1 at departure). */
  atStopIndex: number;
  atStopLabel: string;
  /** Minutes of extra dwell added beyond the stop's original dwell (0 if existing dwell covers it). */
  addedWaitMinutes: number;
  firstLegStatus: 'OFF' | 'SB';
  firstLegStart: StackDualTime;
  firstLegEnd: StackDualTime;
  firstLegMinutes: number;
  /** Required >=7h Sleeper Berth block (either at the stop, trailing after final stop, or already logged). */
  longSbStart: StackDualTime;
  longSbEnd: StackDualTime;
  longSbMinutes: number;
  longSbAlreadyLogged: boolean;
  sbCallout: string;
  /** Chain completion time (final stop PTA, before any trailing completing leg). */
  chainFinish: StackDualTime;
  /** When the split pair fully completes (end of second leg). */
  splitComplete: StackDualTime;
  /** Follow-on clocks directly from `evaluate()` at `splitComplete`. */
  nextDriveRemaining: number;
  nextWindowRemaining: number;
  nextCycleRemaining: number;
  stops: StackStopOutcome[];
  simSegments: Segment[];
  summary: string;
}

export interface StackPushRescue {
  kind: 'reset10' | 'recap' | 'restart34' | 'reschedule';
  title: string;
  /** The breaking stop's new legal arrival & PTA after the rest. */
  breakingStopArrival: StackDualTime;
  breakingStopDepart: StackDualTime;
  /** Chain finish time after the rest. */
  chainFinish: StackDualTime;
  /** Rest period details for the first rest before/on the breaking stop. */
  restSummary: string;
  pass: StackChainPass;
}

export type StackVerdictStatus = 'legal' | 'rescued_by_split' | 'breaks_warn' | 'breaks_stop';

export interface StackResult {
  validInput: boolean;
  status: StackVerdictStatus;
  tone: 'good' | 'warn' | 'bad';
  verdictSign: 'go' | 'warn' | 'stop';
  verdictLabel: string;
  headline: string;
  subline: string;
  stopCount: number;
  homeTimeZone: string;
  homeZoneName: string;
  now: number;
  nowShort: string;
  departure: number;
  departureDual: StackDualTime;
  cycleLimit: number;
  cycleWindowDays: number;
  /** Current clocks at `now` from `evaluate()`. */
  driveRemainingNow: number;
  windowRemainingNow: number;
  breakRemainingNow: number;
  cycleRemainingNow: number;
  pendingSplitLeg: RestPeriod | null;
  /** Active display chain: legal pass when green, legal push-back pass when broken (with continuous breakdown also preserved). */
  displayChain: StackChainPass;
  continuousPass: StackChainPass;
  reset10Pass: StackChainPass;
  restart34Pass: StackChainPass;
  /** First stop index that breaks (`0..n-1`), or `null` when all stops are legal. */
  firstBreakIndex: number | null;
  firstBreakLabel: string | null;
  limitingClock: StackLimitKind;
  limitingClockLabel: string;
  limitingCite: string | null;
  /** Best engine-verified inter-stop split rescue, or `null` if no split rescues the chain. */
  splitRescue: StackSplitRescue | null;
  /** All valid split rescues (best first) for inspection/tests. */
  allSplitRescues: StackSplitRescue[];
  /** Primary legal rest-based pushback option (10h break, recap wait, or 34h restart). */
  pushRescue: StackPushRescue | null;
  /** Alternate cycle recovery (34h restart vs recap wait) when `CYCLE` binds and they differ. */
  altCycleRescue: StackPushRescue | null;
  /** Ready-to-paste calm, CFR-cited dispatch summary / pushback text. */
  dispatchText: string;
}

/* ---------- timezone formatting (DST-safe via engine's localToMinute) ---------- */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
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
    dtfCache.set(tz, f);
  }
  return f;
}

function zoneParts(minute: number, tz: string) {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = partsFormatter(safeTz).formatToParts(new Date(minute * 60000));
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

export function fmtStackShort(minute: number, tz: string): string {
  const p = zoneParts(minute, tz);
  return `${p.weekday} ${p.hour}:${p.minute}`;
}

export function fmtStackFull(minute: number, tz: string): string {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const p = zoneParts(minute, safeTz);
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${zoneShort(safeTz)}`;
}

export function makeDualTime(minute: number, homeTz: string, localTz: string): StackDualTime {
  const safeHome = isValidTimeZone(homeTz) ? homeTz : 'UTC';
  const safeLocal = isValidTimeZone(localTz) ? localTz : safeHome;
  const sameZone = safeHome === safeLocal;
  const homeShort = fmtStackShort(minute, safeHome);
  const homeFull = fmtStackFull(minute, safeHome);
  return {
    minute,
    homeShort,
    homeFull,
    localShort: sameZone ? homeShort : fmtStackShort(minute, safeLocal),
    localFull: sameZone ? homeFull : fmtStackFull(minute, safeLocal),
    sameZone,
  };
}

/** Resolve wall-clock YYYY-MM-DD + HH:MM in `timeZone` via engine's DST-safe `localToMinute`. */
export function resolveStackWallMinute(dateStr: string, timeStr: string, timeZone: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dm || !tm) return null;
  const y = Number(dm[1]), mo = Number(dm[2]), d = Number(dm[3]);
  const h = Number(tm[1]), min = Number(tm[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h < 0 || h > 23 || min < 0 || min > 59) return null;
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  return localToMinute(y, mo, d, h, tz, min);
}

/* ---------- helpers & defaults ---------- */

export function clampStackMph(mph: number): number {
  return Number.isFinite(mph)
    ? Math.max(STACK_MIN_MPH, Math.min(STACK_MAX_MPH, Math.round(mph)))
    : STACK_DEFAULT_MPH;
}

/** Exact ceiling drive-time formula matching `engine/src/trip.ts` (`Math.ceil((miles / mph) * 60)`). */
export function stackLegDriveMinutes(miles: number, mph: number): number {
  const m = Number.isFinite(miles) ? Math.max(0, Math.min(STACK_MAX_MILES, miles)) : 0;
  if (m <= 0) return 0;
  const speed = clampStackMph(mph);
  return Math.ceil((m / speed) * 60);
}

/** Realistic miles for a 45-minute deadhead at `mph`. */
export function deadheadMilesFor(mph: number): number {
  return Math.max(1, Math.round(clampStackMph(mph) * 0.75));
}

export function createDefaultStops(defaultMph = STACK_DEFAULT_MPH, homeTimeZone = 'America/Chicago'): StackStopInput[] {
  const mph = clampStackMph(defaultMph);
  const tz = isValidTimeZone(homeTimeZone) ? homeTimeZone : 'America/Chicago';
  return [
    {
      id: 'stop-1',
      label: 'Stop 1',
      miles: 180,
      mph,
      dwellMinutes: 120,
      dwellStatus: 'ON',
      apptMinute: null,
      apptTimeZone: tz,
    },
    {
      id: 'stop-2',
      label: 'Stop 2',
      miles: 120,
      mph,
      dwellMinutes: 15,
      dwellStatus: 'ON',
      apptMinute: null,
      apptTimeZone: tz,
    },
  ];
}

export interface StackDraft {
  stops: StackStopInput[];
  /** Absolute UTC epoch minute to start the chain, or `null` for "leave now". */
  departureMinute: number | null;
  untilDepartureStatus: DutyStatus;
}

export function sanitizeStackDraft(
  raw: unknown,
  defaultMph: number,
  homeTimeZone: string,
  nowMinute: number = Math.floor(Date.now() / 60000),
): StackDraft {
  const fallback: StackDraft = {
    stops: createDefaultStops(defaultMph, homeTimeZone),
    departureMinute: null,
    untilDepartureStatus: 'ON',
  };
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const rawStops = Array.isArray(obj.stops) ? obj.stops : [];
  const validStops: StackStopInput[] = [];
  for (let i = 0; i < Math.min(rawStops.length, STACK_MAX_STOPS); i++) {
    const item = rawStops[i];
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const status = r.dwellStatus === 'OFF' || r.dwellStatus === 'SB' || r.dwellStatus === 'ON' ? r.dwellStatus : 'ON';
    const tz = typeof r.apptTimeZone === 'string' && isValidTimeZone(r.apptTimeZone) ? r.apptTimeZone : homeTimeZone;
    const appt = typeof r.apptMinute === 'number' && Number.isFinite(r.apptMinute) ? Math.round(r.apptMinute) : null;
    const entryMode = r.apptEntryMode === 'terminal' ? 'terminal' as const : undefined;
    validStops.push({
      id: typeof r.id === 'string' && r.id ? r.id : `stop-${i + 1}`,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : `Stop ${i + 1}`,
      miles: typeof r.miles === 'number' && Number.isFinite(r.miles) ? Math.max(0, Math.min(STACK_MAX_MILES, Math.round(r.miles))) : 120,
      mph: typeof r.mph === 'number' ? clampStackMph(r.mph) : clampStackMph(defaultMph),
      dwellMinutes: typeof r.dwellMinutes === 'number' && Number.isFinite(r.dwellMinutes) ? Math.max(0, Math.min(STACK_MAX_DWELL_MIN, Math.round(r.dwellMinutes))) : 0,
      dwellStatus: status,
      apptMinute: appt,
      apptTimeZone: tz,
      ...(entryMode ? { apptEntryMode: entryMode } : {}),
    });
  }
  if (validStops.length < STACK_MIN_STOPS) return fallback;
  const rawDep = typeof obj.departureMinute === 'number' && Number.isFinite(obj.departureMinute)
    ? Math.round(obj.departureMinute)
    : null;
  // N4: ignore pinned departures more than 72h in the future (treat as leave-now); past values clamp at compute.
  const maxDep = Number.isFinite(nowMinute) ? Math.round(nowMinute) + STACK_MAX_DEPARTURE_FUTURE_MIN : Infinity;
  const depMin = rawDep !== null && rawDep <= maxDep ? rawDep : null;
  const until: DutyStatus = obj.untilDepartureStatus === 'OFF' || obj.untilDepartureStatus === 'SB' || obj.untilDepartureStatus === 'ON'
    ? obj.untilDepartureStatus
    : 'ON';
  return { stops: validStops, departureMinute: depMin, untilDepartureStatus: until };
}

/** In-session draft held in module memory (zero new localStorage keys; store.ts stays frozen). */
let sessionStackDraft: StackDraft | null = null;

export function loadStackDraft(
  defaultMph: number,
  homeTimeZone: string,
  nowMinute: number = Math.floor(Date.now() / 60000),
): StackDraft {
  return sessionStackDraft
    ? sanitizeStackDraft(sessionStackDraft, defaultMph, homeTimeZone, nowMinute)
    : sanitizeStackDraft(null, defaultMph, homeTimeZone, nowMinute);
}

export function saveStackDraft(draft: StackDraft): void {
  sessionStackDraft = {
    stops: draft.stops.map((s) => ({ ...s })),
    departureMinute: draft.departureMinute,
    untilDepartureStatus: draft.untilDepartureStatus,
  };
}

export function clearStackDraft(): void {
  sessionStackDraft = null;
}

export function limitLabelFor(kind: StackLimitKind, config: RulesConfig, ev?: FullEvaluation): string {
  const { limit, windowDays } = cycleParamsOf(config);
  const driveH = ev ? ev.shift.limits.drive / 60 : 11;
  const winH = ev ? ev.shift.limits.window / 60 : 14;
  switch (kind) {
    case 'DRIVE_11': return `${driveH}-hour driving limit`;
    case 'WINDOW_14': return `${winH}-hour window`;
    case 'BREAK_30': return '30-minute break';
    case 'CYCLE': return `${limit / 60}-hour / ${windowDays}-day cycle`;
    case 'TIME_ONLY': return 'drive + dock time';
    default: return 'hours limit';
  }
}

export function limitCiteFor(kind: StackLimitKind, config: RulesConfig, ev?: FullEvaluation): string | null {
  const { windowDays } = cycleParamsOf(config);
  const adv = ev?.shift.exceptionKeys.adverse !== null && ev?.shift.exceptionKeys.adverse !== undefined;
  const six = ev?.shift.exceptionKeys.sixteen !== null && ev?.shift.exceptionKeys.sixteen !== undefined;
  switch (kind) {
    case 'DRIVE_11': return `49 CFR 395.3(a)(3)(i)${adv ? ' · adverse §395.1(b)(1)' : ''}`;
    case 'BREAK_30': return '49 CFR 395.3(a)(3)(ii)';
    case 'WINDOW_14': return `49 CFR 395.3(a)(2)${adv ? ' · adverse §395.1(b)(1)' : ''}${six ? ' · 16-hour day §395.1(o)' : ''}`;
    case 'CYCLE': return `49 CFR 395.3(b)(${windowDays === 7 ? '1' : '2'})`;
    default: return null;
  }
}

/* ---------- engine-backed building blocks ---------- */

/**
 * Append `driveMinutes` starting at `startAt`, letting `engine/src/index.ts` decide
 * mandatory 30-min breaks via `evaluate().shift.breakRemaining`.
 */
function appendContinuousDrive(
  baseHistory: Segment[],
  prefixSegs: Segment[],
  startAt: number,
  driveMinutes: number,
  config: RulesConfig,
  homeTz: string,
  localTz: string,
  stopLabel: string,
): {
  segs: Segment[];
  rests: StackInsertedRest[];
  endAt: number;
} {
  const segs: Segment[] = [];
  const rests: StackInsertedRest[] = [];
  let t = startAt;
  let rem = driveMinutes;
  let guard = 0;
  const maxIter = 2 * Math.ceil(Math.max(1, driveMinutes) / LIMITS.BREAK_AFTER) + 6;

  while (rem > 0 && guard++ < maxIter) {
    const evT = evaluate([...baseHistory, ...prefixSegs, ...segs], { asOf: t, config });
    const brkRem = evT.shift.breakRemaining;
    if (!config.shortHaul && brkRem <= 0) {
      const end = t + LIMITS.BREAK_LEN;
      segs.push({ status: 'OFF', start: t, end, tentative: true, note: '30-min break (8h driving rule)' });
      rests.push({
        kind: 'break30',
        status: 'OFF',
        start: t,
        end,
        minutes: LIMITS.BREAK_LEN,
        startDual: makeDualTime(t, homeTz, localTz),
        endDual: makeDualTime(end, homeTz, localTz),
        triggeredBy: 'BREAK_30',
        reason: '30-minute break (8h driving rule)',
      });
      t = end;
      continue;
    }
    const chunk = config.shortHaul || !Number.isFinite(brkRem) ? rem : Math.min(rem, brkRem);
    segs.push({ status: 'D', start: t, end: t + chunk, tentative: true, note: `Drive to ${stopLabel}` });
    t += chunk;
    rem -= chunk;
  }

  return { segs, rests, endAt: t };
}

/**
 * Evaluate `[...baseHistory, ...simSegments]` at `evalAt` and return all post-`now` violations.
 * When `allowNewRestart34` is false, verifies cycle legality without any newly created >=34h
 * restart ending after `now` (mirroring `rollout.ts` and `rescue.ts`).
 */
function postNowViolations(
  baseHistory: Segment[],
  simSegments: Segment[],
  now: number,
  evalAt: number,
  config: RulesConfig,
  allowNewRestart34: boolean,
): { ev: FullEvaluation; violations: Violation[] } {
  const combined = [...baseHistory, ...simSegments];
  const ev = evaluate(combined, { asOf: evalAt, config });
  const rawViols = ev.violations.filter((v) => v.tentative || v.start >= now);
  if (allowNewRestart34) return { ev, violations: rawViols };

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

function classifyPlanRest(
  seg: Segment,
  reason: string,
  triggeredBy: StackLimitKind,
  homeTz: string,
  localTz: string,
): StackInsertedRest {
  const minutes = seg.end - seg.start;
  let kind: StackInsertedRest['kind'];
  // Any >=34h continuous off-duty rest qualifies as a §395.3(c) restart, never a "recap wait".
  if (/34-hour/i.test(reason) || minutes >= LIMITS.RESTART) {
    kind = 'restart34';
  } else if (/recap/i.test(reason)) {
    kind = 'recap';
  } else if (minutes >= LIMITS.RESET || /10-hour/i.test(reason)) {
    kind = 'reset10';
  } else if (triggeredBy === 'BREAK_30' || minutes === LIMITS.BREAK_LEN) {
    kind = 'break30';
  } else {
    kind = 'split';
  }
  return {
    kind,
    status: seg.status === 'SB' ? 'SB' : 'OFF',
    start: seg.start,
    end: seg.end,
    minutes,
    startDual: makeDualTime(seg.start, homeTz, localTz),
    endDual: makeDualTime(seg.end, homeTz, localTz),
    triggeredBy,
    reason,
  };
}

/* ---------- Pass 1: Continuous (no-10h-reset) diagnostic chain ---------- */

function runContinuousPass(
  baseHistory: Segment[],
  leadSegs: Segment[],
  now: number,
  departure: number,
  stops: StackStopInput[],
  config: RulesConfig,
  homeTz: string,
): StackChainPass {
  const accSegs: Segment[] = [...leadSegs];
  const outcomes: StackStopOutcome[] = [];
  let cursor = departure;
  let seenViolKeys = new Set<string>();
  let longRestCount = 0;
  let lastLongRestStopIndex = -1;

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const effMph = clampStackMph(st.mph);
    const legDrive = stackLegDriveMinutes(st.miles, effMph);
    const localTz = isValidTimeZone(st.apptTimeZone) ? st.apptTimeZone : homeTz;
    const insertedRests: StackInsertedRest[] = [];

    if (legDrive > 0) {
      const drv = appendContinuousDrive(baseHistory, accSegs, cursor, legDrive, config, homeTz, localTz, st.label);
      accSegs.push(...drv.segs);
      insertedRests.push(...drv.rests);
      cursor = drv.endAt;
    }

    const arrivalAt = cursor;
    let earlyWaitMinutes = 0;
    if (st.apptMinute !== null && arrivalAt < st.apptMinute) {
      earlyWaitMinutes = st.apptMinute - arrivalAt;
      accSegs.push({ status: 'OFF', start: arrivalAt, end: st.apptMinute, tentative: true, note: `Wait for ${st.label}` });
      cursor = st.apptMinute;
    }
    const dwellStartAt = cursor;
    if (st.dwellMinutes > 0) {
      accSegs.push({
        status: st.dwellStatus,
        start: dwellStartAt,
        end: dwellStartAt + st.dwellMinutes,
        tentative: true,
        note: st.label,
      });
      cursor = dwellStartAt + st.dwellMinutes;
    }
    const departAt = cursor;

    // F9(c): a >=10h early-arrival OFF wait (alone or contiguous with OFF/SB dwell) is a de facto reset.
    const offSpanAtStop = earlyWaitMinutes + (st.dwellStatus !== 'ON' ? st.dwellMinutes : 0);
    if (earlyWaitMinutes >= LIMITS.RESET || (earlyWaitMinutes > 0 && offSpanAtStop >= LIMITS.RESET)) {
      longRestCount++;
      lastLongRestStopIndex = i;
    }

    const { ev, violations } = postNowViolations(baseHistory, accSegs, now, departAt, config, false);
    const newViols: Violation[] = [];
    for (const v of violations) {
      const k = `${v.kind}:${v.start}:${v.end}`;
      if (!seenViolKeys.has(k)) {
        seenViolKeys.add(k);
        newViols.push(v);
      }
    }

    const apptSlack = st.apptMinute !== null ? st.apptMinute - arrivalAt : null;
    outcomes.push({
      index: i,
      id: st.id,
      label: st.label,
      miles: st.miles,
      effectiveMph: effMph,
      driveMinutes: legDrive,
      dwellMinutes: st.dwellMinutes,
      dwellStatus: st.dwellStatus,
      apptZone: localTz,
      apptZoneName: zoneShort(localTz),
      sameZone: localTz === homeTz,
      appt: st.apptMinute !== null ? makeDualTime(st.apptMinute, homeTz, localTz) : null,
      arrival: makeDualTime(arrivalAt, homeTz, localTz),
      dwellStart: makeDualTime(dwellStartAt, homeTz, localTz),
      depart: makeDualTime(departAt, homeTz, localTz),
      earlyWaitMinutes,
      apptSlack,
      meetsAppt: apptSlack === null || apptSlack >= 0,
      insertedRests,
      violations: newViols,
      driveRemainingAfter: ev.shift.driveRemaining,
      windowRemainingAfter: ev.shift.windowRemaining,
      cycleRemainingAfter: ev.cycle.remaining,
      breakRemainingAfter: ev.shift.breakRemaining,
      bindingAfter: ev.binding,
    });
  }

  const finalCheck = postNowViolations(baseHistory, accSegs, now, cursor, config, false);
  return {
    strategy: 'continuous',
    feasible: finalCheck.violations.length === 0,
    hosLegal: finalCheck.violations.length === 0,
    allApptsMet: outcomes.every((o) => o.meetsAppt),
    stops: outcomes,
    finishAt: cursor,
    finishDual: makeDualTime(cursor, homeTz, homeTz),
    longRestCount,
    lastLongRestStopIndex,
    violations: finalCheck.violations,
    simSegments: accSegs,
    endEval: finalCheck.ev,
  };
}

/* ---------- Pass 2: Legal sequential planTrip() chain ('reset10' and 'restart34') ---------- */

function runPlanTripChain(
  baseHistory: Segment[],
  leadSegs: Segment[],
  now: number,
  departure: number,
  stops: StackStopInput[],
  config: RulesConfig,
  homeTz: string,
  strategy: 'reset10' | 'restart34',
): StackChainPass {
  const accSegs: Segment[] = [...leadSegs];
  const outcomes: StackStopOutcome[] = [];
  let cursor = departure;
  let allLegsFeasible = true;
  let longRestCount = 0;
  let lastLongRestStopIndex = -1;

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const effMph = clampStackMph(st.mph);
    const legDrive = stackLegDriveMinutes(st.miles, effMph);
    const localTz = isValidTimeZone(st.apptTimeZone) ? st.apptTimeZone : homeTz;
    const insertedRests: StackInsertedRest[] = [];

    if (st.miles > 0) {
      let legPlan: TripPlan = planTrip([...baseHistory, ...accSegs], {
        departure: cursor,
        distanceMiles: st.miles,
        mph: effMph,
        stops: [],
        restStrategy: strategy,
        config,
      });

      // Overnight / multi-load rest alignment: if Stop i has an appointment later than arrival AND
      // there is a >=10h rest before driving (either inserted by planTrip or available in the gap
      // between Stop i-1's end and Stop i's appointment), test holding OFF until right before the
      // driving leg so the driver doesn't burn 4-6h of a fresh 14h window parked at a closed gate.
      if (st.apptMinute !== null && legPlan.feasible && legPlan.driveEnd < st.apptMinute) {
        const legSteps = legPlan.steps;
        const hadLongRest = legSteps.some((step) => {
          const sg = step.segment;
          return (sg.status === 'OFF' || sg.status === 'SB') && sg.end - sg.start >= LIMITS.RESET;
        });
        const breaksNeeded = !config.shortHaul && legDrive > LIMITS.BREAK_AFTER
          ? Math.floor((legDrive - 1) / LIMITS.BREAK_AFTER) * LIMITS.BREAK_LEN
          : 0;
        const freshLegSpan = legDrive + breaksNeeded;
        const targetDep = st.apptMinute - freshLegSpan;
        const minResetEnd = cursor + LIMITS.RESET;

        if (targetDep >= minResetEnd && targetDep > cursor) {
          const alt = planTrip([...baseHistory, ...accSegs], {
            departure: targetDep,
            untilDeparture: { from: cursor, status: 'OFF', label: '10-hour rest before next stop' },
            distanceMiles: st.miles,
            mph: effMph,
            stops: [],
            restStrategy: strategy,
            config,
          });
          if (alt.feasible && alt.driveEnd <= st.apptMinute) {
            const origWin = legPlan.evaluation.shift.windowRemaining;
            const altWin = alt.evaluation.shift.windowRemaining;
            if (hadLongRest || altWin > origWin) {
              legPlan = alt;
            }
          }
        }
      }

      if (!legPlan.feasible || legPlan.warnings.some((w) => w.includes('iteration limit'))) {
        allLegsFeasible = false;
      }

      // Walk legPlan steps to record inserted rests with their exact engine `binding` trigger.
      // F1: ONLY tag a binding trigger when the rest was FORCED (driveNow <= 0 or a planTrip
      // reason naming a limit). Voluntary alignment rests (untilDeparture) tag 'NONE'.
      const legRunningSegs: Segment[] = [];
      for (const step of legPlan.steps) {
        const seg = step.segment;
        if (seg.status === 'OFF' || seg.status === 'SB') {
          const isVoluntaryAlign = /assumed, not logged/i.test(step.reason);
          let trig: StackLimitKind = 'NONE';
          if (!isVoluntaryAlign) {
            const evBeforeRest = evaluate([...baseHistory, ...accSegs, ...legRunningSegs], {
              asOf: seg.start,
              config,
            });
            if (evBeforeRest.driveNow <= 0) {
              trig = evBeforeRest.binding;
            } else if (/30-minute break|8h driving rule/i.test(step.reason)) {
              trig = 'BREAK_30';
            } else if (/recap|60\/70 cycle|34-hour restart/i.test(step.reason)) {
              trig = 'CYCLE';
            } else if (/11\/14 exhausted|full 10-hour reset/i.test(step.reason)) {
              trig = evBeforeRest.binding;
            }
          }
          const restInfo = classifyPlanRest(seg, step.reason, trig, homeTz, localTz);
          insertedRests.push(restInfo);
          if (restInfo.kind === 'reset10' || restInfo.kind === 'recap' || restInfo.kind === 'restart34') {
            longRestCount++;
            lastLongRestStopIndex = i;
          }
        }
        legRunningSegs.push(seg);
      }
      accSegs.push(...legRunningSegs);
      cursor = legPlan.driveEnd;
    }

    const arrivalAt = cursor;
    let earlyWaitMinutes = 0;
    if (st.apptMinute !== null && arrivalAt < st.apptMinute) {
      earlyWaitMinutes = st.apptMinute - arrivalAt;
      accSegs.push({ status: 'OFF', start: arrivalAt, end: st.apptMinute, tentative: true, note: `Wait for ${st.label}` });
      cursor = st.apptMinute;
    }
    const dwellStartAt = cursor;
    if (st.dwellMinutes > 0) {
      accSegs.push({
        status: st.dwellStatus,
        start: dwellStartAt,
        end: dwellStartAt + st.dwellMinutes,
        tentative: true,
        note: st.label,
      });
      cursor = dwellStartAt + st.dwellMinutes;
    }
    const departAt = cursor;

    // F9(c): count >=10h early-arrival OFF waits absorbed at a stop as de facto resets too.
    const offSpanAtStop = earlyWaitMinutes + (st.dwellStatus !== 'ON' ? st.dwellMinutes : 0);
    if (earlyWaitMinutes >= LIMITS.RESET || (earlyWaitMinutes > 0 && offSpanAtStop >= LIMITS.RESET)) {
      longRestCount++;
      lastLongRestStopIndex = i;
    }

    const evAfter = evaluate([...baseHistory, ...accSegs], { asOf: departAt, config });
    const apptSlack = st.apptMinute !== null ? st.apptMinute - arrivalAt : null;

    outcomes.push({
      index: i,
      id: st.id,
      label: st.label,
      miles: st.miles,
      effectiveMph: effMph,
      driveMinutes: legDrive,
      dwellMinutes: st.dwellMinutes,
      dwellStatus: st.dwellStatus,
      apptZone: localTz,
      apptZoneName: zoneShort(localTz),
      sameZone: localTz === homeTz,
      appt: st.apptMinute !== null ? makeDualTime(st.apptMinute, homeTz, localTz) : null,
      arrival: makeDualTime(arrivalAt, homeTz, localTz),
      dwellStart: makeDualTime(dwellStartAt, homeTz, localTz),
      depart: makeDualTime(departAt, homeTz, localTz),
      earlyWaitMinutes,
      apptSlack,
      meetsAppt: apptSlack === null || apptSlack >= 0,
      insertedRests,
      violations: [],
      driveRemainingAfter: evAfter.shift.driveRemaining,
      windowRemainingAfter: evAfter.shift.windowRemaining,
      cycleRemainingAfter: evAfter.cycle.remaining,
      breakRemainingAfter: evAfter.shift.breakRemaining,
      bindingAfter: evAfter.binding,
    });
  }

  const endEval = evaluate([...baseHistory, ...accSegs], { asOf: cursor, config });
  const postViols = endEval.violations.filter((v) => v.tentative || v.start >= now);
  return {
    strategy,
    feasible: allLegsFeasible && postViols.length === 0,
    hosLegal: allLegsFeasible && postViols.length === 0,
    allApptsMet: outcomes.every((o) => o.meetsAppt),
    stops: outcomes,
    finishAt: cursor,
    finishDual: makeDualTime(cursor, homeTz, homeTz),
    longRestCount,
    lastLongRestStopIndex,
    violations: postViols,
    simSegments: accSegs,
    endEval,
  };
}

/* ---------- Pass 3: Engine-verified inter-stop 7/3 and 8/2 split rescue search ---------- */

function evaluateSplitCandidate(
  baseHistory: Segment[],
  leadSegs: Segment[],
  now: number,
  departure: number,
  stops: StackStopInput[],
  config: RulesConfig,
  homeTz: string,
  atStopIndex: number, // -1 = before Stop 0, or 0..failIdx-1 = at Stop k's dwell
  splitKind: '8/2' | '7/3',
  order: StackSplitRescue['order'],
  pendingLeg: RestPeriod | null,
): StackSplitRescue | null {
  const longReq = splitKind === '8/2' ? 480 : 420;
  const shortReq = splitKind === '8/2' ? 120 : 180;

  if (order === 'completes-pending-long' && (!pendingLeg || !pendingLeg.qualifiesLongSB)) return null;
  if (order === 'completes-pending-short' && (!pendingLeg || !pendingLeg.qualifiesShort || pendingLeg.isReset)) return null;

  const accSegs: Segment[] = [...leadSegs];
  const outcomes: StackStopOutcome[] = [];
  let cursor = departure;
  let firstLegStart = departure;
  let firstLegEnd = departure;
  const firstLegRef: { status: 'OFF' | 'SB' } = { status: 'OFF' };
  let addedWaitMinutes = 0;

  const needsSbFirstLeg = order === 'long-first' || order === 'completes-pending-short';

  // Helper to place the first split leg at `cursor`.
  // F3: Only reuses existing dwell (`baseDwell > 0`) when the stop's dwellStatus is OFF/SB
  // (and specifically SB for a Sleeper Berth long leg). ON-duty dwell is always emitted first,
  // and the split leg is placed AFTER it with `baseDwell = 0` so the full leg counts in `addedWaitMinutes`.
  const placeFirstSplitLeg = (baseDwell: number, notePrefix: string, reusedStatus?: 'OFF' | 'SB'): boolean => {
    firstLegStart = cursor;
    if (order === 'short-first') {
      const segStatus: 'OFF' | 'SB' = reusedStatus === 'SB' ? 'SB' : 'OFF';
      firstLegRef.status = segStatus;
      const durMin = Math.max(baseDwell, shortReq);
      addedWaitMinutes = Math.max(0, durMin - baseDwell);
      firstLegEnd = cursor + durMin;
      accSegs.push({ status: segStatus, start: firstLegStart, end: firstLegEnd, tentative: true, note: `${notePrefix} (${splitKind} short leg OFF/SB)` });
      cursor = firstLegEnd;
      return true;
    }
    if (order === 'long-first') {
      firstLegRef.status = 'SB';
      const durMin = Math.max(baseDwell, longReq);
      addedWaitMinutes = Math.max(0, durMin - baseDwell);
      firstLegEnd = cursor + durMin;
      accSegs.push({ status: 'SB', start: firstLegStart, end: firstLegEnd, tentative: true, note: `${notePrefix} (${splitKind} Sleeper Berth ONLY)` });
      cursor = firstLegEnd;
      return true;
    }
    if (order === 'completes-pending-long' && pendingLeg) {
      const segStatus: 'OFF' | 'SB' = reusedStatus === 'SB' ? 'SB' : 'OFF';
      firstLegRef.status = segStatus;
      const need = Math.max(shortReq, LIMITS.SPLIT_TOTAL - pendingLeg.duration, LIMITS.SPLIT_MIN_SHORT);
      const durMin = Math.max(baseDwell, need);
      addedWaitMinutes = Math.max(0, durMin - baseDwell);
      firstLegEnd = cursor + durMin;
      accSegs.push({ status: segStatus, start: firstLegStart, end: firstLegEnd, tentative: true, note: `${notePrefix} (completes split OFF/SB)` });
      cursor = firstLegEnd;
      return true;
    }
    if (order === 'completes-pending-short' && pendingLeg) {
      firstLegRef.status = 'SB';
      const need = Math.max(longReq, LIMITS.SPLIT_TOTAL - pendingLeg.duration, LIMITS.SPLIT_MIN_SB);
      const durMin = Math.max(baseDwell, need);
      addedWaitMinutes = Math.max(0, durMin - baseDwell);
      firstLegEnd = cursor + durMin;
      accSegs.push({ status: 'SB', start: firstLegStart, end: firstLegEnd, tentative: true, note: `${notePrefix} (completes split SB ONLY)` });
      cursor = firstLegEnd;
      return true;
    }
    return false;
  };

  // Optional pre-Stop-1 split leg (e.g. completing a pending leg or opening before Stop 1).
  if (atStopIndex === -1) {
    if (!placeFirstSplitLeg(0, 'Before Stop 1')) return null;
  }

  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    const effMph = clampStackMph(st.mph);
    const legDrive = stackLegDriveMinutes(st.miles, effMph);
    const localTz = isValidTimeZone(st.apptTimeZone) ? st.apptTimeZone : homeTz;
    const insertedRests: StackInsertedRest[] = [];

    if (i === 0 && atStopIndex === -1 && firstLegEnd > firstLegStart) {
      insertedRests.push({
        kind: 'split',
        status: firstLegRef.status,
        start: firstLegStart,
        end: firstLegEnd,
        minutes: firstLegEnd - firstLegStart,
        startDual: makeDualTime(firstLegStart, homeTz, localTz),
        endDual: makeDualTime(firstLegEnd, homeTz, localTz),
        triggeredBy: 'WINDOW_14',
        reason: `${splitKind} split leg (${firstLegRef.status === 'SB' ? 'Sleeper Berth ONLY' : 'OFF/SB'})`,
      });
    }

    // Stops strictly before `atStopIndex` can use legal `planTrip` (in case an earlier shift had a 10h reset).
    if (i < atStopIndex && st.miles > 0) {
      const legPlan = planTrip([...baseHistory, ...accSegs], {
        departure: cursor,
        distanceMiles: st.miles,
        mph: effMph,
        stops: [],
        restStrategy: 'reset10',
        config,
      });
      if (!legPlan.feasible) return null;
      for (const step of legPlan.steps) {
        if (step.segment.status === 'OFF' || step.segment.status === 'SB') {
          insertedRests.push(classifyPlanRest(step.segment, step.reason, 'NONE', homeTz, localTz));
        }
        accSegs.push(step.segment);
      }
      cursor = legPlan.driveEnd;
    } else if (legDrive > 0) {
      const drv = appendContinuousDrive(baseHistory, accSegs, cursor, legDrive, config, homeTz, localTz, st.label);
      accSegs.push(...drv.segs);
      insertedRests.push(...drv.rests);
      cursor = drv.endAt;
    }

    const arrivalAt = cursor;
    let earlyWaitMinutes = 0;
    if (st.apptMinute !== null && arrivalAt < st.apptMinute) {
      earlyWaitMinutes = st.apptMinute - arrivalAt;
      accSegs.push({ status: 'OFF', start: arrivalAt, end: st.apptMinute, tentative: true, note: `Wait for ${st.label}` });
      cursor = st.apptMinute;
    }
    const dwellStartAt = cursor;

    if (i === atStopIndex) {
      const canReuseDwell = st.dwellMinutes > 0 && (
        needsSbFirstLeg
          ? st.dwellStatus === 'SB'
          : (st.dwellStatus === 'OFF' || st.dwellStatus === 'SB')
      );
      if (!canReuseDwell && st.dwellMinutes > 0) {
        // Respect ON-duty dwell (or OFF dwell before a Sleeper Berth long leg): emit dwell first,
        // then place the split leg AFTER dwell so it counts honestly in addedWaitMinutes.
        accSegs.push({
          status: st.dwellStatus,
          start: dwellStartAt,
          end: dwellStartAt + st.dwellMinutes,
          tentative: true,
          note: st.label,
        });
        cursor = dwellStartAt + st.dwellMinutes;
      }
      if (!placeFirstSplitLeg(canReuseDwell ? st.dwellMinutes : 0, st.label, canReuseDwell ? (st.dwellStatus as 'OFF' | 'SB') : undefined)) {
        return null;
      }
      insertedRests.push({
        kind: 'split',
        status: firstLegRef.status,
        start: firstLegStart,
        end: firstLegEnd,
        minutes: firstLegEnd - firstLegStart,
        startDual: makeDualTime(firstLegStart, homeTz, localTz),
        endDual: makeDualTime(firstLegEnd, homeTz, localTz),
        triggeredBy: 'WINDOW_14',
        reason: `${splitKind} split leg${canReuseDwell ? ' (dock dwell)' : ' after dwell'} (${firstLegRef.status === 'SB' ? 'Sleeper Berth ONLY' : 'OFF/SB'})`,
      });
    } else if (st.dwellMinutes > 0) {
      accSegs.push({
        status: st.dwellStatus,
        start: dwellStartAt,
        end: dwellStartAt + st.dwellMinutes,
        tentative: true,
        note: st.label,
      });
      cursor = dwellStartAt + st.dwellMinutes;
    }
    const departAt = cursor;
    const apptSlack = st.apptMinute !== null ? st.apptMinute - arrivalAt : null;

    // Early reject if this stop already missed its hard appointment.
    if (apptSlack !== null && apptSlack < 0) return null;

    outcomes.push({
      index: i,
      id: st.id,
      label: st.label,
      miles: st.miles,
      effectiveMph: effMph,
      driveMinutes: legDrive,
      dwellMinutes: st.dwellMinutes,
      dwellStatus: st.dwellStatus,
      apptZone: localTz,
      apptZoneName: zoneShort(localTz),
      sameZone: localTz === homeTz,
      appt: st.apptMinute !== null ? makeDualTime(st.apptMinute, homeTz, localTz) : null,
      arrival: makeDualTime(arrivalAt, homeTz, localTz),
      dwellStart: makeDualTime(dwellStartAt, homeTz, localTz),
      depart: makeDualTime(departAt, homeTz, localTz),
      earlyWaitMinutes,
      apptSlack,
      meetsAppt: true,
      insertedRests,
      violations: [],
      driveRemainingAfter: 0,
      windowRemainingAfter: 0,
      cycleRemainingAfter: 0,
      breakRemainingAfter: 0,
      bindingAfter: 'NONE',
    });
  }

  const chainFinishAt = cursor;
  let splitCompleteAt = chainFinishAt;
  let secondLegStart: number | null = null;
  let secondLegEnd: number | null = null;
  let longSbStartMin: number;
  let longSbEndMin: number;
  let longSbAlreadyLogged = false;

  if (order === 'short-first') {
    secondLegStart = chainFinishAt;
    secondLegEnd = chainFinishAt + longReq;
    accSegs.push({
      status: 'SB',
      start: secondLegStart,
      end: secondLegEnd,
      tentative: true,
      note: `${splitKind} Sleeper Berth long leg (SB ONLY)`,
    });
    splitCompleteAt = secondLegEnd;
    longSbStartMin = secondLegStart;
    longSbEndMin = secondLegEnd;
  } else if (order === 'long-first') {
    secondLegStart = chainFinishAt;
    secondLegEnd = chainFinishAt + shortReq;
    accSegs.push({
      status: 'OFF',
      start: secondLegStart,
      end: secondLegEnd,
      tentative: true,
      note: `${splitKind} short leg (OFF/SB)`,
    });
    splitCompleteAt = secondLegEnd;
    longSbStartMin = firstLegStart;
    longSbEndMin = firstLegEnd;
  } else if (order === 'completes-pending-long' && pendingLeg) {
    splitCompleteAt = firstLegEnd;
    longSbStartMin = pendingLeg.start;
    longSbEndMin = pendingLeg.end;
    longSbAlreadyLogged = true;
  } else {
    // completes-pending-short
    splitCompleteAt = firstLegEnd;
    longSbStartMin = firstLegStart;
    longSbEndMin = firstLegEnd;
  }

  // Verify the entire synthetic timeline directly through `engine/src/index.ts`.
  const evalAt = Math.max(chainFinishAt, splitCompleteAt);
  const { ev, violations } = postNowViolations(baseHistory, accSegs, now, evalAt, config, false);
  if (violations.length > 0) return null;

  // Confirm FMCSA split qualification via `pairQualifies()` on engine's `restPeriods()`.
  const allRests = restPeriods(ev.segments);
  const r1 = allRests.find((r) => r.start <= firstLegStart && r.end >= firstLegEnd);
  let pairOk = false;
  if (order === 'short-first' || order === 'long-first') {
    const r2 = secondLegStart !== null && secondLegEnd !== null
      ? allRests.find((r) => r.start <= secondLegStart! && r.end >= secondLegEnd!)
      : undefined;
    pairOk = Boolean(r1 && r2 && r1 !== r2 && pairQualifies(r1, r2) && (order !== 'short-first' || !r1.isReset));
  } else if (pendingLeg) {
    const rPending = allRests.find((r) => r.start <= pendingLeg.start && r.end >= pendingLeg.end);
    pairOk = Boolean(rPending && r1 && rPending !== r1 && pairQualifies(rPending, r1));
  }
  if (!pairOk) return null;

  // Populate accurate per-stop remaining clocks at each stop's departure (using full timeline so split pairing is active).
  for (const o of outcomes) {
    const evStop = evaluate([...baseHistory, ...accSegs], { asOf: o.depart.minute, config });
    o.driveRemainingAfter = evStop.shift.driveRemaining;
    o.windowRemainingAfter = evStop.shift.windowRemaining;
    o.cycleRemainingAfter = evStop.cycle.remaining;
    o.breakRemainingAfter = evStop.shift.breakRemaining;
    o.bindingAfter = evStop.binding;
  }

  // Read follow-on clocks right after the chain + split finish.
  const evFollow = evaluate([...baseHistory, ...accSegs], { asOf: evalAt, config });
  const atStopLabel = atStopIndex >= 0 ? stops[atStopIndex].label : 'before Stop 1';
  const firstLegDur = firstLegEnd - firstLegStart;
  const longSbDur = longSbEndMin - longSbStartMin;

  let summary: string;
  if (order === 'short-first') {
    summary = `${splitKind} split at ${atStopLabel}: log ${dur(firstLegDur)} OFF/SB${addedWaitMinutes > 0 ? ` (+${dur(addedWaitMinutes)} wait)` : ' (uses dock dwell)'}, then ${dur(longSbDur)} Sleeper Berth after ${stops[stops.length - 1].label} → finishes ${fmtStackShort(chainFinishAt, homeTz)}.`;
  } else if (order === 'long-first') {
    summary = `${splitKind} split at ${atStopLabel}: take ${dur(longSbDur)} Sleeper Berth ONLY at ${atStopLabel}, then ${dur(shortReq)} OFF/SB after ${stops[stops.length - 1].label} → finishes ${fmtStackShort(chainFinishAt, homeTz)}.`;
  } else if (order === 'completes-pending-long') {
    summary = `${splitKind} split at ${atStopLabel}: log ${dur(firstLegDur)} OFF/SB to pair with your earlier ${dur(longSbDur)} Sleeper Berth → finishes ${fmtStackShort(chainFinishAt, homeTz)}.`;
  } else {
    summary = `${splitKind} split at ${atStopLabel}: take ${dur(longSbDur)} Sleeper Berth ONLY to pair with your earlier ${dur(pendingLeg?.duration ?? 0)} rest → finishes ${fmtStackShort(chainFinishAt, homeTz)}.`;
  }

  return {
    splitKind,
    order,
    atStopIndex,
    atStopLabel,
    addedWaitMinutes,
    firstLegStatus: firstLegRef.status,
    firstLegStart: makeDualTime(firstLegStart, homeTz, homeTz),
    firstLegEnd: makeDualTime(firstLegEnd, homeTz, homeTz),
    firstLegMinutes: firstLegDur,
    longSbStart: makeDualTime(longSbStartMin, homeTz, homeTz),
    longSbEnd: makeDualTime(longSbEndMin, homeTz, homeTz),
    longSbMinutes: longSbDur,
    longSbAlreadyLogged,
    sbCallout: STACK_SPLIT_SB_CALLOUT,
    chainFinish: makeDualTime(chainFinishAt, homeTz, homeTz),
    splitComplete: makeDualTime(evalAt, homeTz, homeTz),
    nextDriveRemaining: evFollow.shift.driveRemaining,
    nextWindowRemaining: evFollow.shift.windowRemaining,
    nextCycleRemaining: evFollow.cycle.remaining,
    stops: outcomes,
    simSegments: accSegs,
    summary,
  };
}

function findSplitRescues(
  baseHistory: Segment[],
  leadSegs: Segment[],
  now: number,
  departure: number,
  stops: StackStopInput[],
  config: RulesConfig,
  homeTz: string,
  firstBreakIndex: number,
  pendingLeg: RestPeriod | null,
): StackSplitRescue[] {
  const candidates: StackSplitRescue[] = [];
  const orders: StackSplitRescue['order'][] = [
    ...(pendingLeg?.qualifiesLongSB ? (['completes-pending-long'] as const) : []),
    ...(pendingLeg?.qualifiesShort && !pendingLeg.isReset ? (['completes-pending-short'] as const) : []),
    'short-first',
    'long-first',
  ];
  const kinds: ('8/2' | '7/3')[] = ['8/2', '7/3'];

  // Try inserting a split at every earlier stop (0..firstBreakIndex - 1), plus before Stop 1 (-1).
  const positions: number[] = [];
  for (let k = firstBreakIndex - 1; k >= 0; k--) positions.push(k);
  positions.push(-1);

  for (const pos of positions) {
    for (const kind of kinds) {
      for (const ord of orders) {
        const res = evaluateSplitCandidate(
          baseHistory, leadSegs, now, departure, stops, config, homeTz, pos, kind, ord, pendingLeg,
        );
        if (res) candidates.push(res);
      }
    }
  }

  // Deduplicate identical (atStopIndex, splitKind, chainFinish, splitComplete) and rank best-first:
  // 1. Earliest chainFinish (when all stops are done)
  // 2. Fewest extra wait minutes added beyond existing dwell
  // 3. Prefer splitting at a stop (reusing dock dwell) over pausing before Stop 1
  // 4. Earliest splitComplete
  // 5. Higher follow-on headroom (drive + window)
  candidates.sort((a, b) => {
    if (a.chainFinish.minute !== b.chainFinish.minute) return a.chainFinish.minute - b.chainFinish.minute;
    if (a.addedWaitMinutes !== b.addedWaitMinutes) return a.addedWaitMinutes - b.addedWaitMinutes;
    const aAtStop = a.atStopIndex >= 0 ? 0 : 1;
    const bAtStop = b.atStopIndex >= 0 ? 0 : 1;
    if (aAtStop !== bAtStop) return aAtStop - bAtStop;
    if (a.splitComplete.minute !== b.splitComplete.minute) return a.splitComplete.minute - b.splitComplete.minute;
    return (b.nextDriveRemaining + b.nextWindowRemaining) - (a.nextDriveRemaining + a.nextWindowRemaining);
  });

  return candidates;
}

/* ---------- Dispatch Pushback Copy Text ---------- */

function formatStopLine(o: StackStopOutcome, showLocalTag: boolean): string {
  const eta = showLocalTag && !o.sameZone
    ? `${o.arrival.localShort} ${o.apptZoneName} (${o.arrival.homeShort} home)`
    : o.arrival.homeShort;
  const pta = showLocalTag && !o.sameZone
    ? `${o.depart.localShort} ${o.apptZoneName}`
    : o.depart.homeShort;
  const restTags = o.insertedRests
    .filter((r) => r.kind !== 'break30')
    .map((r) => (r.kind === 'restart34' ? '34h restart' : r.kind === 'recap' ? 'recap wait' : r.kind === 'split' ? 'split' : '10h rest'));
  const afterNote = restTags.length ? ` after ${restTags[restTags.length - 1]}` : '';
  let apptNote = '';
  if (o.appt) {
    const apptStr = !o.sameZone ? `${o.appt.localShort} ${o.apptZoneName}` : o.appt.homeShort;
    if (o.apptSlack !== null && o.apptSlack < 0) {
      apptNote = ` (misses ${apptStr} appt by ${dur(-o.apptSlack)})`;
    } else if (o.apptSlack !== null && o.apptSlack > 0) {
      apptNote = ` (appt ${apptStr} — ${dur(o.apptSlack)} early)`;
    } else {
      apptNote = ` (appt ${apptStr} — on time)`;
    }
  }
  const ptaPart = o.dwellMinutes > 0 ? `, PTA ${pta}` : '';
  return `${o.label}: ETA ${eta}${ptaPart}${afterNote}${apptNote}`;
}

export function buildStackDispatchText(res: Omit<StackResult, 'dispatchText'>): string {
  const lines: string[] = [];
  const anyDiffZone = res.displayChain.stops.some((o) => !o.sameZone);
  const { limit } = cycleParamsOf(res.displayChain.endEval.config);

  if (res.status === 'legal') {
    const longRests = res.displayChain.longRestCount;
    lines.push(
      longRests > 0
        ? `Can run all ${res.stopCount} stops legally (includes ${longRests} planned 10h+ rest${longRests > 1 ? 's' : ''}).`
        : `Can run all ${res.stopCount} stops legally.`,
    );
    for (const o of res.displayChain.stops) {
      lines.push(formatStopLine(o, anyDiffZone));
    }
    const end = res.displayChain.endEval;
    lines.push(
      `Remaining at finish: ${end.shift.limits.window / 60}h window ${dur(end.shift.windowRemaining)}, ${end.shift.limits.drive / 60}h drive ${dur(end.shift.driveRemaining)}, ${limit / 60}h cycle ${dur(end.cycle.remaining)}.`,
    );
    lines.push('Planning estimate — my ELD governs.');
    return lines.join('\n');
  }

  const breakName = res.firstBreakLabel ?? `Stop ${(res.firstBreakIndex ?? 0) + 1}`;
  const citePart = res.limitingCite ? ` (${res.limitingCite})` : '';
  lines.push(`Cannot run ${breakName} as stacked — ${res.limitingClockLabel}${citePart}.`);

  // Realistic legal ETA/PTA per stop from the best legal rest-based chain; if no legal pass
  // exists (pushRescue === null), explicitly qualify the times as non-legal (F9b).
  if (res.pushRescue) {
    for (const o of res.pushRescue.pass.stops) {
      lines.push(formatStopLine(o, anyDiffZone));
    }
  } else {
    lines.push('No legal schedule found within planner bounds — as stacked (not legal):');
    for (const o of res.displayChain.stops) {
      lines.push(formatStopLine(o, anyDiffZone));
    }
  }

  if (res.splitRescue) {
    const sr = res.splitRescue;
    const brkStop = sr.stops[res.firstBreakIndex ?? sr.stops.length - 1];
    lines.push(
      `Split option (49 CFR 395.1(g)): ${sr.splitKind} sleeper split at ${sr.atStopLabel} (${dur(sr.firstLegMinutes)} ${sr.firstLegStatus === 'SB' ? 'SB' : 'OFF/SB'}, ${dur(sr.longSbMinutes)} SB required) — ${brkStop.label} ETA ${brkStop.arrival.homeShort}, finishes ${sr.chainFinish.homeShort}.`,
    );
  }

  if (res.altCycleRescue) {
    const alt = res.altCycleRescue;
    const tag = alt.kind === 'restart34' ? '34h restart (49 CFR 395.3(c))' : `${dayStartWord(res.displayChain.endEval.config)} recap wait`;
    lines.push(
      `Cycle option (${tag}): ${breakName} earliest legal ETA ${alt.breakingStopArrival.homeShort}, finishes ${alt.chainFinish.homeShort}.`,
    );
  }

  lines.push('Planning estimate — my ELD governs.');
  return lines.join('\n');
}

/* ---------- main entry point ---------- */

function findLongRestForStop(
  pass: StackChainPass,
  failIdx: number,
  forcedOnly = false,
): StackInsertedRest | null {
  for (let i = failIdx; i >= 0; i--) {
    const long = pass.stops[i].insertedRests.find(
      (r) => (r.kind === 'restart34' || r.kind === 'recap' || r.kind === 'reset10') && (!forcedOnly || r.triggeredBy !== 'NONE'),
    );
    if (long) return long;
    // Do not cross a voluntary overnight reset into an earlier shift when looking for a forced rest.
    if (forcedOnly && pass.stops[i].insertedRests.some((r) => r.kind === 'reset10' && r.triggeredBy === 'NONE')) {
      break;
    }
  }
  return null;
}

/**
 * N1 + R1: Sum mandatory 30-min break minutes across every stop AFTER the last long rest
 * (reset10 / recap / restart34) up to and including `targetIdx`.
 * Any positive early-arrival wait at an intermediate stop (`i < targetIdx`) absorbs ALL prior
 * break delay: the truck reached stop `i` early even with the break, so without the break it
 * would only have waited longer and still departed at `appt + dwell`.
 */
function effectiveBreak30ForStop(
  pass: StackChainPass,
  targetIdx: number,
): { minutes: number; rests: StackInsertedRest[] } {
  let minutes = 0;
  let rests: StackInsertedRest[] = [];
  for (let i = 0; i <= targetIdx; i++) {
    const stop = pass.stops[i];
    for (const r of stop.insertedRests) {
      if (r.kind === 'reset10' || r.kind === 'recap' || r.kind === 'restart34') {
        minutes = 0;
        rests = [];
      } else if (r.kind === 'break30') {
        minutes += r.minutes;
        rests.push(r);
      }
    }
    if (i < targetIdx && stop.earlyWaitMinutes > 0) {
      minutes = 0;
      rests = [];
    }
  }
  return { minutes, rests };
}

function buildPushRescue(
  pass: StackChainPass,
  failIdx: number,
  limitingClock: StackLimitKind,
): StackPushRescue {
  const brkStop = pass.stops[failIdx];
  // F1 + N1: When no 10h/recap/34h HOS rest caused the miss (pure drive + dock time or 30-min break),
  // never mislabel the pushback as "Push X past a 10-hour break", and check break30 rests across
  // the full shift after the last long rest up to `failIdx`.
  if (limitingClock === 'TIME_ONLY' || limitingClock === 'BREAK_30') {
    const brkRests = limitingClock === 'BREAK_30'
      ? effectiveBreak30ForStop(pass, failIdx).rests
      : [];
    const brkRest = brkRests.length > 0 ? brkRests[brkRests.length - 1] : null;
    const restSummary = brkRest
      ? `${brkRest.reason} (${brkRest.startDual.homeShort} → ${brkRest.endDual.homeShort}, ${dur(brkRest.minutes)})`
      : `Earliest legal schedule reaches ${brkStop.label} at ${brkStop.arrival.homeShort} (drive + dock time)`;
    return {
      kind: 'reschedule',
      title: `Reschedule ${brkStop.label}`,
      breakingStopArrival: brkStop.arrival,
      breakingStopDepart: brkStop.depart,
      chainFinish: pass.finishDual,
      restSummary,
      pass,
    };
  }

  // Find the forced significant rest on or before `failIdx` (closest to `failIdx`).
  const chosenRest = findLongRestForStop(pass, failIdx, true) ?? findLongRestForStop(pass, failIdx, false);
  let kind: StackPushRescue['kind'] = pass.strategy === 'restart34' ? 'restart34' : 'reset10';
  if (chosenRest?.kind === 'restart34') kind = 'restart34';
  else if (chosenRest?.kind === 'recap') kind = 'recap';
  else if (chosenRest?.kind === 'reset10') kind = 'reset10';

  const title = kind === 'restart34'
    ? 'Take a 34-hour restart (§395.3(c))'
    : kind === 'recap'
      ? `Wait for ${dayStartWord(pass.endEval.config)} recap hours`
      : `Push ${brkStop.label} past a 10-hour break`;

  const restSummary = chosenRest
    ? `${chosenRest.reason} (${chosenRest.startDual.homeShort} → ${chosenRest.endDual.homeShort}, ${dur(chosenRest.minutes)})`
    : `Earliest legal schedule reaches ${brkStop.label} at ${brkStop.arrival.homeShort}`;

  return {
    kind,
    title,
    breakingStopArrival: brkStop.arrival,
    breakingStopDepart: brkStop.depart,
    chainFinish: pass.finishDual,
    restSummary,
    pass,
  };
}

function pickRemainingHeadline(ev: FullEvaluation, config: RulesConfig): string {
  const { limit } = cycleParamsOf(config);
  const winRem = ev.shift.windowRemaining;
  const drvRem = ev.shift.driveRemaining;
  const cycRem = ev.cycle.remaining;
  if (cycRem < winRem && cycRem <= drvRem && cycRem < 6 * 60) {
    return `${dur(cycRem)} left on your ${limit / 60}-hr cycle`;
  }
  if (drvRem < winRem) {
    return `${dur(drvRem)} drive / ${dur(winRem)} left on your ${ev.shift.limits.window / 60}`;
  }
  return `${dur(winRem)} left on your ${ev.shift.limits.window / 60}`;
}

export function evaluateStackChain(input: StackInput): StackResult {
  const config = safeRulesConfig(input.config);
  const homeTz = isValidTimeZone(config.timeZone) ? config.timeZone : 'UTC';
  const homeZoneName = zoneShort(homeTz);
  const { limit: cycleLimit, windowDays: cycleWindowDays } = cycleParamsOf(config);
  const logged = input.segments.filter((s) => !s.tentative);
  const departure = Math.max(input.now, Math.round(input.departure ?? input.now));
  const untilStatus: DutyStatus = input.untilDepartureStatus ?? 'ON';
  const leadSegs: Segment[] = departure > input.now
    ? [{ status: untilStatus, start: input.now, end: departure, tentative: true, note: 'Until departure' }]
    : [];
  const baseHistory = pruneHistory(logged, input.now, config);
  const evNow = evaluate(baseHistory, { asOf: input.now, config });
  const evStart = departure > input.now
    ? evaluate([...baseHistory, ...leadSegs], { asOf: departure, config })
    : evNow;

  const stops = input.stops.slice(0, STACK_MAX_STOPS).map((st, idx) => ({
    ...st,
    label: (st.label || '').trim() || `Stop ${idx + 1}`,
    miles: Number.isFinite(st.miles) ? Math.max(0, Math.min(STACK_MAX_MILES, Math.round(st.miles))) : 0,
    mph: clampStackMph(st.mph),
    dwellMinutes: Number.isFinite(st.dwellMinutes) ? Math.max(0, Math.min(STACK_MAX_DWELL_MIN, Math.round(st.dwellMinutes))) : 0,
    apptTimeZone: isValidTimeZone(st.apptTimeZone) ? st.apptTimeZone : homeTz,
  }));

  if (stops.length < STACK_MIN_STOPS) {
    const emptyPass: StackChainPass = {
      strategy: 'continuous',
      feasible: false,
      hosLegal: false,
      allApptsMet: false,
      stops: [],
      finishAt: departure,
      finishDual: makeDualTime(departure, homeTz, homeTz),
      longRestCount: 0,
      lastLongRestStopIndex: -1,
      violations: [],
      simSegments: [],
      endEval: evStart,
    };
    const invalidRes: Omit<StackResult, 'dispatchText'> = {
      validInput: false,
      status: 'breaks_stop',
      tone: 'warn',
      verdictSign: 'warn',
      verdictLabel: 'Add 2 stops',
      headline: 'Enter at least 2 stops to check a chain.',
      subline: 'Add miles, dwell, and any hard appointments.',
      stopCount: stops.length,
      homeTimeZone: homeTz,
      homeZoneName,
      now: input.now,
      nowShort: fmtStackShort(input.now, homeTz),
      departure,
      departureDual: makeDualTime(departure, homeTz, homeTz),
      cycleLimit,
      cycleWindowDays,
      driveRemainingNow: evNow.shift.driveRemaining,
      windowRemainingNow: evNow.shift.windowRemaining,
      breakRemainingNow: evNow.shift.breakRemaining,
      cycleRemainingNow: evNow.cycle.remaining,
      pendingSplitLeg: evStart.shift.pendingSplitLeg,
      displayChain: emptyPass,
      continuousPass: emptyPass,
      reset10Pass: emptyPass,
      restart34Pass: emptyPass,
      firstBreakIndex: null,
      firstBreakLabel: null,
      limitingClock: 'NONE',
      limitingClockLabel: '',
      limitingCite: null,
      splitRescue: null,
      allSplitRescues: [],
      pushRescue: null,
      altCycleRescue: null,
    };
    return { ...invalidRes, dispatchText: '' };
  }

  // Run all three engine-backed passes.
  const continuousPass = runContinuousPass(baseHistory, leadSegs, input.now, departure, stops, config, homeTz);
  const reset10Pass = runPlanTripChain(baseHistory, leadSegs, input.now, departure, stops, config, homeTz, 'reset10');
  const restart34Pass = runPlanTripChain(baseHistory, leadSegs, input.now, departure, stops, config, homeTz, 'restart34');

  // Choose the best legal planTrip pass (reset10 vs restart34).
  const bestLegalPass: StackChainPass = (() => {
    if (reset10Pass.hosLegal && restart34Pass.hosLegal) {
      if (restart34Pass.allApptsMet && !reset10Pass.allApptsMet) return restart34Pass;
      if (reset10Pass.allApptsMet && !restart34Pass.allApptsMet) return reset10Pass;
      return restart34Pass.finishAt < reset10Pass.finishAt ? restart34Pass : reset10Pass;
    }
    if (restart34Pass.hosLegal) return restart34Pass;
    return reset10Pass;
  })();

  // Multi-shift legal check: a chain that includes a >=10h rest / cycle wait is GREEN if
  // it is HOS-legal, meets EVERY set appointment, and at least one stop at or after that rest
  // has an explicit appointment (proving the rest fits inside the planned multi-load schedule).
  const hasApptAtOrAfterLongRest = bestLegalPass.lastLongRestStopIndex >= 0
    && stops.slice(bestLegalPass.lastLongRestStopIndex).some((st) => st.apptMinute !== null);

  const singleShiftLegal = continuousPass.hosLegal && continuousPass.allApptsMet;
  const multiShiftLegal = bestLegalPass.hosLegal && bestLegalPass.allApptsMet && hasApptAtOrAfterLongRest;

  if (singleShiftLegal || multiShiftLegal) {
    // Prefer bestLegalPass when multiShiftLegal (or when bestLegalPass naturally aligns an overnight gap with fresher clocks).
    const winningPass = (multiShiftLegal || (bestLegalPass.hosLegal && bestLegalPass.allApptsMet && bestLegalPass.longRestCount === 0))
      ? bestLegalPass
      : continuousPass;
    const remText = pickRemainingHeadline(winningPass.endEval, config);
    const subParts: string[] = [];
    let restNote = '';
    if (winningPass.longRestCount > 0 && winningPass.lastLongRestStopIndex >= 0) {
      const lrStop = winningPass.stops[winningPass.lastLongRestStopIndex];
      const lr = lrStop.insertedRests
        .find((r) => r.kind === 'reset10' || r.kind === 'recap' || r.kind === 'restart34');
      if (lr) {
        restNote = ` (10h+ rest before ${lrStop.label})`;
        subParts.push(`Includes ${dur(lr.minutes)} rest (${lr.startDual.homeShort} → ${lr.endDual.homeShort}) before ${lrStop.label}.`);
      } else {
        // F9(c): de facto >=10h reset from an early-arrival OFF wait (alone or with OFF/SB dwell).
        const offSpan = lrStop.earlyWaitMinutes + (lrStop.dwellStatus !== 'ON' ? lrStop.dwellMinutes : 0);
        const waitDur = lrStop.earlyWaitMinutes >= LIMITS.RESET ? lrStop.earlyWaitMinutes : offSpan;
        const waitEnd = lrStop.earlyWaitMinutes >= LIMITS.RESET ? lrStop.dwellStart.homeShort : lrStop.depart.homeShort;
        restNote = ` (${dur(waitDur)} off-duty wait at ${lrStop.label})`;
        subParts.push(`Includes ${dur(waitDur)} off-duty wait (${lrStop.arrival.homeShort} → ${waitEnd}) at ${lrStop.label} (resets 11h/14h clocks).`);
      }
    }
    const headline = `ALL ${stops.length} STOPS LEGAL — finishes ${winningPass.finishDual.homeShort}${restNote} with ${remText}.`;
    const firstBreak30 = winningPass.stops.flatMap((o) => o.insertedRests).filter((r) => r.kind === 'break30');
    if (firstBreak30.length > 0) {
      subParts.push(`Includes ${firstBreak30.length} mandatory 30-min break${firstBreak30.length > 1 ? 's' : ''}.`);
    }
    const tightestAppt = winningPass.stops
      .filter((o) => o.apptSlack !== null)
      .sort((a, b) => (a.apptSlack ?? Infinity) - (b.apptSlack ?? Infinity))[0];
    if (tightestAppt && tightestAppt.apptSlack !== null) {
      subParts.push(
        tightestAppt.apptSlack === 0
          ? `Tightest appointment: ${tightestAppt.label} right on time.`
          : `Tightest appointment: ${tightestAppt.label} (${dur(tightestAppt.apptSlack)} cushion).`,
      );
    }
    if (subParts.length === 0) {
      subParts.push('All legs fit inside your current 11h, 14h, and cycle clocks.');
    }

    const baseRes: Omit<StackResult, 'dispatchText'> = {
      validInput: true,
      status: 'legal',
      tone: 'good',
      verdictSign: 'go',
      verdictLabel: `All ${stops.length} stops legal`,
      headline,
      subline: subParts.join(' '),
      stopCount: stops.length,
      homeTimeZone: homeTz,
      homeZoneName,
      now: input.now,
      nowShort: fmtStackShort(input.now, homeTz),
      departure,
      departureDual: makeDualTime(departure, homeTz, homeTz),
      cycleLimit,
      cycleWindowDays,
      driveRemainingNow: evNow.shift.driveRemaining,
      windowRemainingNow: evNow.shift.windowRemaining,
      breakRemainingNow: evNow.shift.breakRemaining,
      cycleRemainingNow: evNow.cycle.remaining,
      pendingSplitLeg: evStart.shift.pendingSplitLeg,
      displayChain: winningPass,
      continuousPass,
      reset10Pass,
      restart34Pass,
      firstBreakIndex: null,
      firstBreakLabel: null,
      limitingClock: 'NONE',
      limitingClockLabel: '',
      limitingCite: null,
      splitRescue: null,
      allSplitRescues: [],
      pushRescue: null,
      altCycleRescue: null,
    };
    return { ...baseRes, dispatchText: buildStackDispatchText(baseRes) };
  }

  // --- Chain breaks: pinpoint the FIRST breaking stop and exact limiting clock from the engine ---
  // F4: If the HOS clock breaks on the leg to Stop i, Stop i IS the breaking stop even if it has
  // no appointment (unless Stop i has an explicit appointment that cleanly absorbs an overnight
  // rest in `bestLegalPass`, as in a planned multi-load chain). The earliest breaking stop wins.
  const firstLateInLegal = bestLegalPass.stops.findIndex((o) => !o.meetsAppt);
  const firstViolInCont = continuousPass.stops.findIndex(
    (o, idx) => o.violations.length > 0 && !(stops[idx].apptMinute !== null && bestLegalPass.stops[idx].meetsAppt),
  );
  const firstLateInCont = continuousPass.stops.findIndex((o) => !o.meetsAppt);
  const breakCandidates = [firstLateInLegal, firstViolInCont, firstLateInCont].filter((idx) => idx >= 0);
  const firstBreakIndex = breakCandidates.length > 0
    ? Math.min(...breakCandidates)
    : Math.max(0, bestLegalPass.lastLongRestStopIndex);

  const firstBreakLabel = stops[firstBreakIndex].label;

  // Determine the exact limiting clock from engine violations / forced rest triggers up to `firstBreakIndex`.
  let limitingClock: StackLimitKind = 'NONE';
  // If an earlier stop k < firstBreakIndex absorbed a planned multi-shift rest and met its explicit
  // appointment in `bestLegalPass`, `continuousPass` diverged on that prior shift, so do not attribute
  // stale continuous violations from <= k to `firstBreakIndex`.
  let lastAbsorbedShiftReset = -1;
  for (let k = 0; k < firstBreakIndex; k++) {
    const legHasLong = bestLegalPass.stops[k].insertedRests.some(
      (r) => r.kind === 'restart34' || r.kind === 'recap' || r.kind === 'reset10',
    ) || bestLegalPass.stops[k].earlyWaitMinutes >= LIMITS.RESET;
    if (legHasLong && stops[k].apptMinute !== null && bestLegalPass.stops[k].meetsAppt) {
      lastAbsorbedShiftReset = k;
    }
  }
  // 1. Check continuous violations on stops after any absorbed shift reset up to `firstBreakIndex`.
  if (lastAbsorbedShiftReset < 0) {
    const contViolsUpToBreak = continuousPass.stops
      .slice(0, firstBreakIndex + 1)
      .flatMap((o) => o.violations)
      .sort((a, b) => a.start - b.start);
    if (contViolsUpToBreak.length > 0) {
      limitingClock = contViolsUpToBreak[0].kind;
    }
  }
  // 2. If none (e.g. a prior stop took a planned overnight reset, or cycle bound on a later shift),
  //    read the trigger directly from a FORCED long rest in `bestLegalPass` on or before `firstBreakIndex`.
  //    F1: Stop at any voluntary alignment rest (`triggeredBy === 'NONE'`) so TIME_ONLY / BREAK_30 can run.
  if (limitingClock === 'NONE') {
    for (let i = firstBreakIndex; i >= 0; i--) {
      const long = bestLegalPass.stops[i].insertedRests
        .find((r) => r.kind === 'restart34' || r.kind === 'recap' || r.kind === 'reset10');
      if (long) {
        if (long.triggeredBy !== 'NONE') limitingClock = long.triggeredBy;
        break;
      }
    }
  }
  // 3. If still NONE and an appointment was missed, check if any 30-min break since the last long
  //    rest (up to and including `firstLateInLegal`) pushed it over, else TIME_ONLY (N1).
  if (limitingClock === 'NONE' && firstLateInLegal >= 0) {
    const o = bestLegalPass.stops[firstLateInLegal];
    const brk = effectiveBreak30ForStop(bestLegalPass, firstLateInLegal);
    limitingClock = brk.minutes > 0 && o.apptSlack !== null && o.apptSlack + brk.minutes >= 0 ? 'BREAK_30' : 'TIME_ONLY';
  }

  const limitingClockLabel = limitLabelFor(limitingClock, config, evStart);
  const limitingCite = limitCiteFor(limitingClock, config, evStart);

  // --- Search for inter-stop 7/3 and 8/2 split rescues ---
  const allowSplit = input.allowSplitBetweenStops !== false;
  const allSplitRescues = allowSplit
    ? findSplitRescues(
      baseHistory, leadSegs, input.now, departure, stops, config, homeTz, firstBreakIndex, evStart.shift.pendingSplitLeg,
    )
    : [];
  const splitRescue = allSplitRescues[0] ?? null;

  // --- Build rest-based push-back rescue (and alternate cycle recovery when CYCLE binds) ---
  const pushRescue = bestLegalPass.hosLegal ? buildPushRescue(bestLegalPass, firstBreakIndex, limitingClock) : null;
  let altCycleRescue: StackPushRescue | null = null;
  if (limitingClock === 'CYCLE') {
    const otherPass = bestLegalPass.strategy === 'reset10' ? restart34Pass : reset10Pass;
    if (otherPass.hosLegal && otherPass.stops[firstBreakIndex].arrival.minute !== bestLegalPass.stops[firstBreakIndex].arrival.minute) {
      const candidateAlt = buildPushRescue(otherPass, firstBreakIndex, limitingClock);
      const altRest = findLongRestForStop(otherPass, firstBreakIndex, false);
      // F7: A "recap wait" >= 34h IS itself a 34h restart (strictly worse than the primary 34h restart);
      // suppress it rather than mislabeling it as "midnight recap wait".
      const isRedundant34hWait = pushRescue?.kind === 'restart34'
        && (candidateAlt.kind === 'restart34' || (altRest !== null && altRest.minutes >= LIMITS.RESTART));
      if (!isRedundant34hWait) {
        altCycleRescue = candidateAlt;
      }
    }
  }

  // --- Build crisp 5-second headline & subline ---
  const brkUpper = firstBreakLabel.toUpperCase();
  const contBrkStop = continuousPass.stops[firstBreakIndex];
  const legalBrkStop = bestLegalPass.stops[firstBreakIndex];
  const apptMissed = firstLateInLegal >= 0 && legalBrkStop.appt !== null && legalBrkStop.apptSlack !== null && legalBrkStop.apptSlack < 0;

  let status: StackVerdictStatus;
  let tone: 'warn' | 'bad';
  let verdictSign: 'warn' | 'stop';
  let verdictLabel: string;
  let headline: string;
  let subline: string;

  if (splitRescue) {
    status = 'rescued_by_split';
    tone = 'warn';
    verdictSign = 'warn';
    verdictLabel = `Breaks at ${firstBreakLabel} · Split rescues`;
    if (apptMissed && contBrkStop.apptSlack !== null && contBrkStop.apptSlack < 0) {
      headline = `BREAKS AT ${brkUpper} — arrives ${contBrkStop.arrival.homeShort} (${dur(-contBrkStop.apptSlack)} late) and hits ${limitingClockLabel}.`;
    } else if (apptMissed && legalBrkStop.appt) {
      headline = `BREAKS AT ${brkUpper} — hits ${limitingClockLabel} (misses ${legalBrkStop.appt.localShort} appt without a split).`;
    } else {
      headline = `BREAKS AT ${brkUpper} — hits ${limitingClockLabel} before ${firstBreakLabel}.`;
    }
    const pushPart = pushRescue
      ? (pushRescue.kind === 'reschedule'
        ? ` OR move ${firstBreakLabel} to ${pushRescue.breakingStopArrival.homeShort}.`
        : ` OR push ${firstBreakLabel} to ${pushRescue.breakingStopArrival.homeShort} after a ${pushRescue.kind === 'restart34' ? '34h restart' : pushRescue.kind === 'recap' ? 'recap wait' : '10h break'}.`)
      : '';
    subline = `${splitRescue.splitKind} sleeper split at ${splitRescue.atStopLabel} rescues it (${firstBreakLabel} ETA ${splitRescue.stops[firstBreakIndex].arrival.homeShort}, finishes ${splitRescue.chainFinish.homeShort});${pushPart}`;
  } else if (apptMissed && legalBrkStop.appt && legalBrkStop.apptSlack !== null) {
    status = 'breaks_stop';
    tone = 'bad';
    verdictSign = 'stop';
    verdictLabel = `Breaks at ${firstBreakLabel}`;
    headline = `BREAKS AT ${brkUpper} — arrives ${legalBrkStop.arrival.homeShort} (${dur(-legalBrkStop.apptSlack)} late for ${legalBrkStop.appt.localShort}) · ${limitingClockLabel}.`;
    if (pushRescue) {
      const altPart = altCycleRescue
        ? ` Or ${altCycleRescue.kind === 'restart34' ? '34h restart' : 'wait for recap'}: ${altCycleRescue.breakingStopArrival.homeShort}.`
        : '';
      subline = `${pushRescue.title}: earliest legal ETA ${pushRescue.breakingStopArrival.homeShort} (PTA ${pushRescue.breakingStopDepart.homeShort}).${altPart}`;
    } else {
      subline = 'No legal rest sequence completes this chain within planner bounds.';
    }
  } else {
    // Breaking stop itself has no appointment (e.g. Probe E), or no appointments are set at all.
    // If a later stop misses its hard appointment (`firstLateInLegal >= 0`) or CYCLE binds, severity is stop/bad.
    const isHardStop = limitingClock === 'CYCLE' || firstLateInLegal >= 0;
    status = isHardStop ? 'breaks_stop' : 'breaks_warn';
    tone = isHardStop ? 'bad' : 'warn';
    verdictSign = isHardStop ? 'stop' : 'warn';
    verdictLabel = `Breaks at ${firstBreakLabel}`;
    headline = `BREAKS AT ${brkUpper} — hits ${limitingClockLabel} before ${firstBreakLabel}.`;
    if (pushRescue) {
      const altPart = altCycleRescue
        ? ` Or ${altCycleRescue.kind === 'restart34' ? '34h restart' : 'wait for recap'}: ${altCycleRescue.breakingStopArrival.homeShort}.`
        : '';
      subline = `${pushRescue.title}: ${firstBreakLabel} arrives ${pushRescue.breakingStopArrival.homeShort}, chain finishes ${pushRescue.chainFinish.homeShort}.${altPart}`;
    } else {
      subline = 'Adjust stops or add rest before rolling.';
    }
  }

  const baseRes: Omit<StackResult, 'dispatchText'> = {
    validInput: true,
    status,
    tone,
    verdictSign,
    verdictLabel,
    headline,
    subline,
    stopCount: stops.length,
    homeTimeZone: homeTz,
    homeZoneName,
    now: input.now,
    nowShort: fmtStackShort(input.now, homeTz),
    departure,
    departureDual: makeDualTime(departure, homeTz, homeTz),
    cycleLimit,
    cycleWindowDays,
    driveRemainingNow: evNow.shift.driveRemaining,
    windowRemainingNow: evNow.shift.windowRemaining,
    breakRemainingNow: evNow.shift.breakRemaining,
    cycleRemainingNow: evNow.cycle.remaining,
    pendingSplitLeg: evStart.shift.pendingSplitLeg,
    displayChain: bestLegalPass,
    continuousPass,
    reset10Pass,
    restart34Pass,
    firstBreakIndex,
    firstBreakLabel,
    limitingClock,
    limitingClockLabel,
    limitingCite,
    splitRescue,
    allSplitRescues,
    pushRescue,
    altCycleRescue,
  };
  return { ...baseRes, dispatchText: buildStackDispatchText(baseRes) };
}
