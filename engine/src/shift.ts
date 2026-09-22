import type { RestPeriod, RulesConfig, Segment, ShiftEvaluation, Violation } from './types.ts';
import { LIMITS } from './types.ts';
import type { ShiftSpan } from './timeline.ts';
import { minutesOf, DRIVE } from './timeline.ts';

export function severityOf(minutes: number): Violation['severity'] {
  if (minutes < 15) return 'nominal';
  if (minutes > 180) return 'egregious';
  return 'violation';
}

/** Do two rests form a qualifying split pair? §395.1(g)(1)(ii)(A)-(C). */
export function pairQualifies(a: RestPeriod, b: RestPeriod): boolean {
  if (!a.qualifiesShort || !b.qualifiesShort) return false;
  if (!(a.qualifiesLongSB || b.qualifiesLongSB)) return false;
  return a.duration + b.duration >= LIMITS.SPLIT_TOTAL;
}

/**
 * Enumerate every chain r1<r2<...<rk (k≥2) of rests where each consecutive pair qualifies.
 * The empty chain (no split used) is always a candidate. Rests may be skipped — extra
 * breaks are simply ordinary off-duty (FMCSA FAQ 2020-11-19).
 */
export function enumerateChains(rests: RestPeriod[]): RestPeriod[][] {
  const cands = rests.filter((r) => r.qualifiesShort);
  const out: RestPeriod[][] = [[]];
  const rec = (chain: RestPeriod[], fromIdx: number) => {
    for (let i = fromIdx; i < cands.length; i++) {
      const r = cands[i];
      if (chain.length === 0) {
        rec([r], i + 1);
      } else if (pairQualifies(chain[chain.length - 1], r)) {
        const next = [...chain, r];
        out.push(next);
        rec(next, i + 1);
      }
    }
  };
  rec([], 0);
  // safety valve: absurd records
  return out.length > 5000 ? out.slice(0, 5000) : out;
}

/**
 * Anchor for the 11/14 at time t under a chain (§395.1(g)(1)(iii)(A)):
 * shift start until the first pair completes; thereafter the end of the first
 * rest of the most recently completed pair.
 */
function anchorAt(chain: RestPeriod[], shiftStart: number, t: number): number {
  let anchor = shiftStart;
  for (let i = 1; i < chain.length; i++) {
    if (chain[i].end <= t) anchor = chain[i - 1].end;
    else break;
  }
  return anchor;
}

/** Sum of chain rests lying within (from, to], optionally only those whose pair has completed by `t`. */
function excludedMinutes(chain: RestPeriod[], from: number, to: number, strictAt: number | null): number {
  let total = 0;
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if (r.start < from || r.end > to) continue;
    if (strictAt !== null) {
      // r counts as excluded only if it is paired with a rest that has completed by strictAt:
      // either r is the second of a pair (i≥1) or its successor has completed.
      const pairedDone = i >= 1 || (i + 1 < chain.length && chain[i + 1].end <= strictAt);
      if (!pairedDone) continue;
    }
    total += r.duration;
  }
  return total;
}

export interface ShiftEvalOptions {
  /** evaluate clocks as of this minute (defaults to end of shift record) */
  asOf: number;
  config: RulesConfig;
  /** all rests in this shift (used to surface an unpaired pending leg) */
  rests?: RestPeriod[];
  /** true when a ≥34h restart ended after any earlier 16-hour-exception shift (eligibility reset) */
  restartSince?: boolean;
}

/**
 * Evaluate one shift under one chain.
 * Violations are computed "as planned": every chain rest is assumed completed, so tentative
 * future rests retroactively exclude their partner (that is how FMCSA evaluates a finished
 * record). Clocks at `asOf` are STRICT: a rest is excluded only once its pair is complete.
 */
export function evaluateShiftWithChain(
  segments: Segment[],
  span: ShiftSpan,
  chain: RestPeriod[],
  opts: ShiftEvalOptions,
): ShiftEvaluation {
  const S = span.start;
  const E = span.end ?? Infinity;
  const violations: Violation[] = [];
  const { limits, notes } = shiftLimits(span, opts);

  for (const seg of segments) {
    if (seg.status !== 'D') continue;
    const a = Math.max(seg.start, S);
    const b = Math.min(seg.end, E);
    if (b <= a) continue;
    const anchor = anchorAt(chain, S, a);
    const windowUsedAtA = (a - anchor) - excludedMinutes(chain, anchor, a, null);
    const driveUsedAtA = minutesOf(segments, DRIVE, anchor, a);
    const tW = a + Math.max(0, limits.window - windowUsedAtA);
    const tD = a + Math.max(0, limits.drive - driveUsedAtA);
    if (tW < b) {
      const m = b - tW;
      // Plain English, no ISO timestamp: the UI renders clock(v.start) → clock(v.end) itself, and a
      // UTC string in front of a driver is meaningless (consumer-review-1/2).
      const from = anchor === S ? 'when you came on duty' : 'the end of your first paired break';
      violations.push({ kind: 'WINDOW_14', start: tW, end: b, minutes: m, severity: severityOf(m),
        detail: `Drove ${fmt(m)} past the ${limits.window / 60}-hour window — the window runs from ${from}` });
    }
    if (tD < b) {
      const m = b - tD;
      violations.push({ kind: 'DRIVE_11', start: tD, end: b, minutes: m, severity: severityOf(m),
        detail: `Drove ${fmt(m)} past the ${limits.drive / 60}-hour driving limit` });
    }
  }

  // Clocks at asOf (strict).
  const t = Math.min(opts.asOf, E === Infinity ? opts.asOf : E);
  const anchor = anchorAt(chain, S, t);
  const windowUsed = Math.max(0, (t - anchor) - excludedMinutes(chain, anchor, t, t));
  const driveUsed = minutesOf(segments, DRIVE, anchor, t);

  // Pending leg: most recent completed chain rest whose successor has not completed;
  // failing that, the most recent ≥2h rest since the anchor that isn't paired yet —
  // any such rest can still pair with a long-enough sleeper period later.
  let pending: RestPeriod | null = null;
  for (let i = 0; i < chain.length; i++) {
    if (chain[i].end <= t && (i + 1 >= chain.length || chain[i + 1].end > t)) pending = chain[i];
  }
  if (!pending && opts.rests) {
    for (const r of opts.rests) {
      if (r.qualifiesShort && r.end <= t && !r.isReset && r.start >= anchor) pending = r;
      // FAQ 22: the opening ≥10h rest with ≥7h SB can pair with a later ≥2h rest (surfaced so the UI can say so)
      else if (r.isReset && r.qualifiesLongSB && r.end === anchor && anchor === S) pending = pending ?? r;
    }
  }

  const brk = breakStatus(segments, t, opts.config);

  return {
    shiftStart: S,
    shiftEnd: span.end,
    chain,
    anchor,
    violations,
    driveUsed,
    windowUsed,
    driveRemaining: Math.max(0, limits.drive - driveUsed),
    windowRemaining: Math.max(0, limits.window - windowUsed),
    driveSinceBreak: brk.driveSinceBreak,
    breakRemaining: brk.breakRemaining,
    pendingSplitLeg: pending,
    limits,
    notes,
  };
}

/**
 * Effective 11/14 for a shift after exceptions.
 * §395.1(b)(1) adverse driving: +2h driving AND +2h window (2020 rule).
 * §395.1(o) 16-hour short-haul: window 14→16, driving unchanged; once per 7 days unless a
 * 34h restart intervened, and only if released at the normal work reporting location.
 */
export function shiftLimits(span: ShiftSpan, opts: ShiftEvalOptions): { limits: { drive: number; window: number }; notes: string[] } {
  let drive = LIMITS.DRIVE, window = LIMITS.WINDOW;
  const notes: string[] = [];
  const adverse = (opts.config.adverseShifts ?? []).includes(span.start);
  const sixteen = (opts.config.sixteenHourShifts ?? []).includes(span.start);
  if (adverse) { drive += 120; window += 120; notes.push('Adverse driving conditions declared: 13-hour driving / 16-hour window (§395.1(b)(1)).'); }
  if (sixteen) {
    window += 120;
    notes.push('16-hour short-haul exception claimed: window extended to 16h, driving still 11h (§395.1(o)). Requires release at your normal work reporting location for this and the previous 5 duty tours.');
    const prior = (opts.config.sixteenHourShifts ?? []).filter((s) => s < span.start && s >= span.start - 6 * 1440);
    if (prior.length && !opts.restartSince) notes.push('⚠ 16-hour exception already used within the previous 6 days and no 34-hour restart since — not eligible today.');
  }
  return { limits: { drive, window }, notes };
}

/** 30-minute break rule §395.3(a)(3)(ii): status as of t. */
export function breakStatus(segments: Segment[], t: number, config: RulesConfig) {
  if (config.shortHaul) return { driveSinceBreak: 0, breakRemaining: Infinity };
  let cum = 0;
  let nonDriveRun = 0;
  let prevEnd: number | null = null;
  for (const s of segments) {
    if (s.start >= t) break;
    const end = Math.min(s.end, t);
    if (prevEnd !== null && s.start > prevEnd) nonDriveRun += s.start - prevEnd; // gap = OFF
    if (s.status === 'D') {
      if (nonDriveRun >= LIMITS.BREAK_LEN) cum = 0;
      nonDriveRun = 0;
      cum += end - s.start;
    } else {
      nonDriveRun += end - s.start;
    }
    prevEnd = end;
  }
  if (nonDriveRun >= LIMITS.BREAK_LEN) cum = 0;
  return { driveSinceBreak: cum, breakRemaining: Math.max(0, LIMITS.BREAK_AFTER - cum) };
}

/** 30-minute break violations across the whole record. */
export function breakViolations(segments: Segment[], config: RulesConfig): Violation[] {
  if (config.shortHaul) return [];
  const out: Violation[] = [];
  let cum = 0;
  let nonDriveRun = 0;
  let prevEnd: number | null = null;
  for (const s of segments) {
    if (prevEnd !== null && s.start > prevEnd) nonDriveRun += s.start - prevEnd;
    if (s.status === 'D') {
      if (nonDriveRun >= LIMITS.BREAK_LEN) cum = 0;
      nonDriveRun = 0;
      const allowed = Math.max(0, LIMITS.BREAK_AFTER - cum);
      const len = s.end - s.start;
      if (len > allowed) {
        const start = s.start + allowed;
        const m = s.end - start;
        out.push({ kind: 'BREAK_30', start, end: s.end, minutes: m, severity: severityOf(m),
          detail: `Drove ${fmt(m)} beyond 8 hours without a 30-minute break` });
      }
      cum += len;
    } else {
      nonDriveRun += s.end - s.start;
    }
    prevEnd = s.end;
  }
  return out;
}

/** FMCSA ordering: fewest/least-severe violations; tie → most available time forward. */
export function rankEvaluations(evals: ShiftEvaluation[]): ShiftEvaluation {
  const score = (e: ShiftEvaluation) => {
    let egregious = 0, viol = 0, nominal = 0;
    for (const v of e.violations) {
      if (v.severity === 'egregious') egregious++;
      else if (v.severity === 'violation') viol++;
      else nominal++;
    }
    return { egregious, viol, nominal, forward: e.driveRemaining + e.windowRemaining };
  };
  return evals.reduce((best, e) => {
    const a = score(best), b = score(e);
    if (b.egregious !== a.egregious) return b.egregious < a.egregious ? e : best;
    if (b.viol !== a.viol) return b.viol < a.viol ? e : best;
    if (b.nominal !== a.nominal) return b.nominal < a.nominal ? e : best;
    return b.forward > a.forward ? e : best;
  });
}

/** Evaluate a shift under every candidate chain and return the FMCSA-preferred one. */
export function evaluateShift(
  segments: Segment[],
  span: ShiftSpan,
  restsInShift: RestPeriod[],
  opts: ShiftEvalOptions,
): { best: ShiftEvaluation; noSplit: ShiftEvaluation; candidates: number } {
  const chains = enumerateChains(restsInShift);
  const evals = chains.map((c) => evaluateShiftWithChain(segments, span, c, { ...opts, rests: restsInShift }));
  const noSplit = evals[0];
  return { best: rankEvaluations(evals), noSplit, candidates: chains.length };
}

export function fmt(min: number): string {
  if (!isFinite(min)) return '∞';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
