import type { Availability, RulesConfig, Segment, ShiftEvaluation, Violation } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { normalize, restPeriods, shifts, gaps } from './timeline.ts';
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
  /**
   * Non-tentative rows dated after `asOf`. A driver cannot have already logged the future, so these
   * are excluded from every clock and reported so the UI can say so rather than dropping them quietly.
   */
  futureLogged: Segment[];
  /**
   * Rows that could not be read as duty time at all (non-finite or backwards times). Dropped rather
   * than thrown on, and reported so an import can name what it rejected (stress-test 2.8).
   */
  invalid: Segment[];
  /**
   * Unlogged intervals inside the record. A gap is read as OFF to compute clocks, which can
   * manufacture a reset the driver never took — the UI must disclose it (stress-test 2.5).
   */
  gaps: { start: number; end: number }[];
}

/**
 * Evaluate a full record (past + tentative). Returns current clocks at `asOf`,
 * the FMCSA-preferred split interpretation, all violations, and the cycle picture.
 */
export function evaluate(raw: Segment[], opts: EvaluateOptions = {}): FullEvaluation {
  const config: RulesConfig = { ...DEFAULT_CONFIG, ...(opts.config ?? {}) };
  const readable = (s: Segment) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start;
  const invalid = raw.filter((s) => !readable(s));
  const normalized = normalize(invalid.length ? raw.filter(readable) : raw);
  const asOf = opts.asOf ?? (normalized.length ? normalized[normalized.length - 1].end : Math.floor(Date.now() / 60000));
  // A non-tentative row dated in the future has not happened. Left in the record it merged with the
  // preceding gap into a phantom ≥10h rest and handed the driver a fresh clock — and because
  // planTrip() re-evaluates as it advances through time, the same row could overwrite the plan's own
  // driving and make an illegal run read "feasible" (stress-test 2.1). Tentative rows are plans and
  // stay in; what is dropped here is reported back so it is never discarded in silence.
  // Strictly `>`: a row starting exactly at asOf has begun and is in progress, not future-dated.
  const futureLogged = normalized.filter((s) => !s.tentative && s.start > asOf);
  const segments = futureLogged.length ? normalized.filter((s) => s.tentative || s.start <= asOf) : normalized;
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
    // FMCSA FAQ 22 (2026-07-01): a ≥10h rest that includes ≥7h consecutive SB may EITHER reset the 11/14 OR
    // pair with a later ≥2h rest. Offer the opening reset as a candidate first leg; ranking picks whichever
    // interpretation is most advantageous. A pure off-duty reset (no 7h SB) is not covered by FAQ 22 → not offered.
    const opening = rests.find((r) => r.end === span.start && r.isReset && r.qualifiesLongSB);
    if (opening) inShift.unshift(opening);
    return evaluateShift(segments, span, inShift, { asOf, config, restartSince: restartSince(span) });
  };
  for (const span of spans) shiftEvals.push(evalSpan(span).best);
  // Pick the shift containing asOf (or the latest one that has actually begun).
  let idx = spans.findIndex((s) => s.start <= asOf && (s.end === null || asOf < s.end));
  if (idx < 0) {
    // asOf can sit outside every span: before the record starts, inside a ≥10h reset between two
    // shifts, or past the end. Fall back to the newest span that has begun — never forward to one
    // that has not, which is what handed out the fresh clock in stress-test 2.1.
    for (let i = spans.length - 1; i >= 0; i--) { if (spans[i].start <= asOf) { idx = i; break; } }
  }
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
    futureLogged, invalid, gaps: gaps(segments, asOf),
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
