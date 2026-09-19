import type { Availability, RulesConfig, Segment, ShiftEvaluation, Violation } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { normalize, restPeriods, shifts } from './timeline.ts';
import { evaluateShift, breakViolations } from './shift.ts';
import { evaluateCycle, cycleViolations } from './cycle.ts';

export interface EvaluateOptions {
  asOf?: number;
  config?: Partial<RulesConfig>;
  forecastDays?: number;
}

export interface FullEvaluation extends Availability {
  /** the same shift evaluated with no split credit — "if you don't finish the pair" */
  noSplit: ShiftEvaluation;
  /** number of split-chain interpretations considered for the current shift */
  candidates: number;
  /** every shift in the record, oldest first (best interpretation each) */
  shifts: ShiftEvaluation[];
  segments: Segment[];
  config: RulesConfig;
}

/**
 * Evaluate a full record (past + tentative). Returns current clocks at `asOf`,
 * the FMCSA-preferred split interpretation, all violations, and the cycle picture.
 */
export function evaluate(raw: Segment[], opts: EvaluateOptions = {}): FullEvaluation {
  const config: RulesConfig = { ...DEFAULT_CONFIG, ...(opts.config ?? {}) };
  const segments = normalize(raw);
  const asOf = opts.asOf ?? (segments.length ? segments[segments.length - 1].end : Math.floor(Date.now() / 60000));
  const rests = restPeriods(segments);
  const spans = shifts(segments, rests);

  const shiftEvals: ShiftEvaluation[] = [];
  let current: ReturnType<typeof evaluateShift>;
  /** for §395.1(o): did a ≥34h restart end after the most recent earlier 16-hour shift? */
  const restartSince = (span: { start: number }) => {
    const prior = (config.sixteenHourShifts ?? []).filter((s) => s < span.start);
    if (!prior.length) return true;
    const last = Math.max(...prior);
    return rests.some((r) => r.isRestart && r.start >= last && r.end <= span.start);
  };
  const evalSpan = (span: (typeof spans)[number]) => {
    const inShift = rests.filter((r) => r.start >= span.start && (span.end === null || r.start <= span.end));
    return evaluateShift(segments, span, inShift, { asOf, config, restartSince: restartSince(span) });
  };
  for (const span of spans) shiftEvals.push(evalSpan(span).best);
  // Pick the shift containing asOf (or the last one).
  let idx = spans.findIndex((s) => s.start <= asOf && (s.end === null || asOf < s.end));
  if (idx < 0) idx = spans.length - 1;
  if (idx < 0) {
    // empty record: fresh driver
    const emptySpan = { start: asOf, end: null, terminatingRest: null };
    current = evalSpan(emptySpan);
    shiftEvals.push(current.best);
  } else {
    current = evalSpan(spans[idx]);
  }

  // If asOf falls inside a ≥10h rest that has already run 10h, the driver is fresh.
  const restNow = rests.find((r) => r.start <= asOf && asOf <= r.end);
  let shift = current.best;
  if (restNow && asOf - restNow.start >= 600) {
    shift = { ...shift, anchor: asOf, driveUsed: 0, windowUsed: 0, driveRemaining: shift.limits.drive, windowRemaining: shift.limits.window,
      driveSinceBreak: 0, breakRemaining: config.shortHaul ? Infinity : 480, pendingSplitLeg: null };
  }

  const cycle = evaluateCycle(segments, rests, asOf, config, opts.forecastDays ?? 4);

  const violations: Violation[] = [
    ...shiftEvals.flatMap((s) => s.violations),
    ...breakViolations(segments, config),
    ...cycleViolations(segments, rests, config),
  ].sort((a, b) => a.start - b.start);

  const limits: [number, Availability['binding']][] = [
    [shift.driveRemaining, 'DRIVE_11'],
    [shift.windowRemaining, 'WINDOW_14'],
    [cycle.remaining, 'CYCLE'],
    [shift.breakRemaining, 'BREAK_30'],
  ];
  let driveNow = Infinity, binding: Availability['binding'] = 'NONE';
  for (const [m, k] of limits) if (m < driveNow) { driveNow = m; binding = k; }

  return {
    asOf, shift, cycle, driveNow, binding, mustStopBy: asOf + driveNow, violations,
    noSplit: current.noSplit, candidates: current.candidates, shifts: shiftEvals, segments, config,
  };
}

/** Clock-to-parking: how far can I legally drive from `asOf` at `mph` net? */
export function safeHaven(ev: FullEvaluation, mph: number) {
  const miles = (ev.driveNow / 60) * mph;
  return {
    minutes: ev.driveNow,
    miles: Math.floor(miles),
    mustStopBy: ev.mustStopBy,
    binding: ev.binding,
    /** conservative cut-offs drivers actually plan around */
    cutoffs: [60, 45, 30, 15].map((buf) => ({
      bufferMinutes: buf,
      by: ev.mustStopBy - buf,
      miles: Math.max(0, Math.floor(((ev.driveNow - buf) / 60) * mph)),
    })),
  };
}
