import type { Availability, RulesConfig, Segment, ShiftEvaluation, Violation } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import { normalize, restPeriods, shifts, gaps } from './timeline.ts';
import { evaluateShift, breakViolations, shiftLimits, exceptionKeyFor } from './shift.ts';
import { evaluateCycle, cycleViolations, carrierDayStart } from './cycle.ts';

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
   * Non-tentative rows that began at or before `asOf` but were logged to end after it ("off 08:00 →
   * 22:00" typed at 08:01). The part after `asOf` has not happened; it is cut off at `asOf` for every
   * clock, and reported (with its ORIGINAL end) so the UI can say so. Left in, it merged into a
   * phantom rest and, once rows carried entry stamps, overwrote live driving (stress-test round 2, §2.1).
   */
  clippedFuture: Segment[];
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
  const kept = futureLogged.length ? normalized.filter((s) => s.tentative || s.start <= asOf) : normalized;
  // The present is as far as the record goes: a logged row that runs past asOf is cut there. The
  // original row is reported, never altered in storage. Re-normalize so merges see the clipped ends.
  const clippedFuture = kept.filter((s) => !s.tentative && s.end > asOf);
  const segments = clippedFuture.length
    ? normalize(kept.map((s) => (!s.tentative && s.end > asOf ? { ...s, end: asOf } : s)))
    : kept;
  const rests = restPeriods(segments);
  const spans = shifts(segments, rests);

  const shiftEvals: ShiftEvaluation[] = [];
  let current: ReturnType<typeof evaluateShift>;
  /**
   * §395.1(o)(3): "has not taken this exemption within the previous 6 consecutive days, except when the
   * driver has begun a new 7- or 8-consecutive day period with ... 34 or more consecutive hours" off.
   * A 7/8-day period runs in carrier days (§395.2: it begins "at the time designated by the motor carrier
   * for a 24-hour period"), so the look-back is the current carrier day plus the 6 before it — not a
   * rolling 144h, which let a Monday use be claimed again on Sunday (QA report M5).
   *
   * A use is the START of a shift the exception was claimed for. The stored key can sit inside the rest
   * before that shift (possibly the previous calendar day); dating the use by the key would push it out
   * of the look-back and make the check permissive again. Every claimed shift counts as taken.
   */
  const openFromOf = (span: { start: number }) => rests.find((r) => r.end === span.start && r.isReset)?.start;
  const sixteenUses = (config.sixteenHourShifts ?? []).length
    ? spans.filter((sp) => exceptionKeyFor(config.sixteenHourShifts, sp, openFromOf(sp)) !== null).map((sp) => sp.start)
    : [];
  const sixteenEligible = (span: { start: number }) => {
    let from = carrierDayStart(span.start, config);
    for (let i = 0; i < 6; i++) from = carrierDayStart(from - 1, config); // DST-safe: step by carrier days
    const prior = sixteenUses.filter((u) => u < span.start && u >= from);
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
    const openFrom = rests.find((r) => r.end === span.start && r.isReset)?.start;
    return evaluateShift(segments, span, inShift, { asOf, config, sixteenEligible: sixteenEligible(span), openFrom });
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
    // The fresh clock belongs to the shift AFTER this rest, so its limits are that shift's, never the
    // previous one's: when a what-if row stretches the rest past asOf, the fallback above picks the
    // shift before the rest, and its adverse 13/16 used to carry into the fresh clock. Exceptions
    // flagged during the rest are keyed to a minute inside it and map to the next shift.
    const next = { start: restNow.end };
    const { limits, notes, keys } = shiftLimits(next, { asOf, config, openFrom: restNow.start, sixteenEligible: sixteenEligible(next) });
    shift = { ...shift, anchor: asOf, driveUsed: 0, windowUsed: 0, driveRemaining: limits.drive, windowRemaining: limits.window,
      driveSinceBreak: 0, breakRemaining: config.shortHaul ? Infinity : 480, pendingSplitLeg: null,
      limits, notes, exceptionKey: asOf, exceptionKeys: keys };
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
    futureLogged, clippedFuture, invalid,
    // Only holes that can still change an answer: inside the cycle window or the current shift. A hole
    // from months ago made every verdict "provisional" forever (stress-test round 2, §2.6).
    gaps: gaps(segments, asOf).filter((g) => g.end > Math.min(cycle.days[0]?.start ?? asOf, shift.shiftStart)),
  };
}

/**
 * When can the driver drive again if they rest from `asOf` on, in `rest` status, without a break?
 *
 * Answered by the engine itself: the record is extended with a rest row from `asOf` and the earliest
 * minute with driving time is found. That makes it right for every limit, not just the 10-hour reset:
 * a 30-min break, a sleeper split completing early, or 60/70 hours rolling off. Returns `asOf` when the
 * driver can already drive, and null when even `horizon` minutes of rest are not enough.
 *
 * Driving time is NOT monotone over a rest, so this is not a plain binary search: after exactly 8h of
 * driving, a 30-min break brings driving back, the 14-hour window then runs out mid-rest, and driving
 * returns only at 10h. What does hold: while resting, every limit either stays put or counts down,
 * except at discrete moments when the rest qualifies for something (30 min, a split leg, 10h, 34h, a
 * cycle day rolling off). So driving can only come back at one of those moments. The search walks the
 * rest in `step`-minute strides comparing a state signature that is constant between such moments,
 * pins each change to the minute, and returns the first one with driving time.
 *
 * Tentative "what-if" rows are ignored: this answers "if I rest now", not what a plan says.
 */
export function driveAgainAt(raw: Segment[], opts: EvaluateOptions & { asOf: number }, rest: 'OFF' | 'SB' = 'OFF', horizon = 36 * 60, step = 60): number | null {
  const logged = raw.filter((s) => !s.tentative);
  const { asOf } = opts;
  const at = (d: number) => evaluate(d === 0 ? logged : [...logged, { status: rest, start: asOf, end: asOf + d }], { ...opts, asOf: asOf + d });
  // Constant between qualifying moments. Three regimes for the 14-hour window while resting:
  //  - a fresh shift has not started yet (anchor at "now"): one state, not a new one every minute;
  //  - this rest is a leg of the chosen split: the window is paused, so its elapsed time is fixed;
  //  - otherwise the window keeps running, so its elapsed time is fixed relative to the rest.
  const sig = (e: FullEvaluation, d: number) => {
    const sh = e.shift, fresh = sh.anchor >= asOf + d;
    const paused = !fresh && sh.chain.some((r) => r.start <= asOf && r.end >= asOf + d);
    const win = fresh ? 'fresh' : paused ? `paused:${sh.windowUsed}` : sh.windowUsed - d;
    return [fresh ? 'fresh' : sh.anchor, sh.driveUsed, win, sh.breakRemaining, e.cycle.remaining, sh.limits.drive, sh.limits.window].join();
  };
  let a = 0, ea = at(0);
  if (ea.driveNow > 0) return asOf;
  let sa = sig(ea, 0);
  while (a < horizon) {
    const b = Math.min(a + step, horizon), eb = at(b);
    if (sig(eb, b) === sa) { a = b; continue; } // nothing qualified in (a, b]: driving cannot have come back
    let lo = a, hi = b, ehi = eb;                // first minute in (a, b] where the state changes
    while (hi - lo > 1) { const mid = (lo + hi) >> 1, em = at(mid); if (sig(em, mid) === sa) lo = mid; else { hi = mid; ehi = em; } }
    if (ehi.driveNow > 0) return asOf + hi;
    a = hi; sa = sig(ehi, hi);
  }
  return null;
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
