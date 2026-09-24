import type { RestPeriod, RulesConfig, Segment, ShiftEvaluation, Violation } from './types.ts';
import { LIMITS } from './types.ts';
import type { ShiftSpan } from './timeline.ts';

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
 * How many candidate rests the chain search will consider, and how many chains it will build.
 *
 * A chain of n qualifying rests has up to 2^n sub-chains, and this app's headline case is a driver
 * splitting for a week: 12 days of 7/3 splits produced tens of thousands of chains and then died
 * with an out-of-memory crash at 512 MB, because the old 5,000 cap was applied to the array the
 * recursion had already finished building — so it bounded nothing (stress-test 2.2).
 *
 * The anchor (§395.1(g)(1)(iii)(A)) is set by the MOST RECENT completed pair, and exclusions are
 * counted only from the anchor forward, so rests older than the last handful cannot change today's
 * clocks. Trimming the candidate list cannot inflate a driver's hours: with fewer rests in a chain,
 * exclusions shrink and the anchor falls back toward shift start — both make the remaining time
 * smaller, never larger. If these bounds ever bite, the result errs toward fewer available hours.
 */
const MAX_CHAIN_RESTS = 12;
const MAX_CHAINS = 3000;

/**
 * Enumerate every chain r1<r2<...<rk (k≥2) of rests where each consecutive pair qualifies.
 * The empty chain (no split used) is always a candidate. Rests may be skipped — extra
 * breaks are simply ordinary off-duty (FMCSA FAQ 2020-11-19).
 */
export function enumerateChains(rests: RestPeriod[]): RestPeriod[][] {
  const all = rests.filter((r) => r.qualifiesShort);
  const cands = all.length > MAX_CHAIN_RESTS ? all.slice(-MAX_CHAIN_RESTS) : all;
  const out: RestPeriod[][] = [[]];
  const rec = (chain: RestPeriod[], fromIdx: number) => {
    for (let i = fromIdx; i < cands.length; i++) {
      if (out.length >= MAX_CHAINS) return; // checked before descending, so the cap actually bounds work
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
  return out;
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

/**
 * O(log n) "how many minutes of DRIVE lie in [from, to)".
 *
 * evaluateShiftWithChain asks this once per driving segment for every candidate chain, so on a long
 * record (six months of legal logs is well over a thousand segments) the cost was quadratic and the
 * Trip tab took seconds to redraw (stress-test 2.2). Segments are sorted and non-overlapping after
 * normalize(), so prefix sums answer exactly the same question without scanning.
 */
function driveLookup(segments: Segment[]): (from: number, to: number) => number {
  const dr = segments.filter((s) => s.status === 'D');
  const starts = dr.map((s) => s.start);
  const ends = dr.map((s) => s.end);
  const cum = new Float64Array(dr.length + 1);
  for (let i = 0; i < dr.length; i++) cum[i + 1] = cum[i] + (dr[i].end - dr[i].start);
  /** first index whose key[i] >= x */
  const firstAtLeast = (key: number[], x: number) => {
    let lo = 0, hi = key.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (key[m] < x) lo = m + 1; else hi = m; }
    return lo;
  };
  return (from, to) => {
    if (to <= from || dr.length === 0) return 0;
    const lo = firstAtLeast(ends, from + 1);  // first segment ending after `from`
    const hi = firstAtLeast(starts, to);      // first segment starting at/after `to`
    if (hi <= lo) return 0;
    let total = cum[hi] - cum[lo];
    if (dr[lo].start < from) total -= from - dr[lo].start;
    if (dr[hi - 1].end > to) total -= dr[hi - 1].end - to;
    return total;
  };
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
  const driveIn = driveLookup(segments);

  for (const seg of segments) {
    if (seg.status !== 'D') continue;
    const a = Math.max(seg.start, S);
    const b = Math.min(seg.end, E);
    if (b <= a) continue;
    const anchor = anchorAt(chain, S, a);
    const windowUsedAtA = (a - anchor) - excludedMinutes(chain, anchor, a, null);
    const driveUsedAtA = driveIn(anchor, a);
    const tW = a + Math.max(0, limits.window - windowUsedAtA);
    const tD = a + Math.max(0, limits.drive - driveUsedAtA);
    if (tW < b) {
      const m = b - tW;
      // Plain English, no ISO timestamp: the UI renders clock(v.start) → clock(v.end) itself, and a
      // UTC string in front of a driver is meaningless (consumer-review-1/2).
      const from = anchor === S ? 'when you came on duty' : 'the end of your first paired break';
      violations.push({ kind: 'WINDOW_14', start: tW, end: b, minutes: m, severity: severityOf(m), tentative: !!seg.tentative,
        detail: `Drove ${fmt(m)} past the ${limits.window / 60}-hour window — the window runs from ${from}` });
    }
    if (tD < b) {
      const m = b - tD;
      violations.push({ kind: 'DRIVE_11', start: tD, end: b, minutes: m, severity: severityOf(m), tentative: !!seg.tentative,
        detail: `Drove ${fmt(m)} past the ${limits.drive / 60}-hour driving limit` });
    }
  }

  // Clocks at asOf (strict).
  const t = Math.min(opts.asOf, E === Infinity ? opts.asOf : E);
  const anchor = anchorAt(chain, S, t);
  const windowUsed = Math.max(0, (t - anchor) - excludedMinutes(chain, anchor, t, t));
  const driveUsed = driveIn(anchor, t);

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
        out.push({ kind: 'BREAK_30', start, end: s.end, minutes: m, severity: severityOf(m), tentative: !!s.tentative,
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
/**
 * Evaluate a shift under every split-sleeper interpretation and return the FMCSA-preferred one.
 *
 * Exact dynamic programme over the qualifying rests (stress-test round 2, §2.2).
 *
 * Why this is exact without enumerating chains: under a chain c1<c2<…, a driving piece that starts
 * after c_j (and before c_{j+1}) is judged with anchor = end of c_{j-1} (or shift start when j<2) and
 * exactly one exclusion, c_j itself (see anchorAt / excludedMinutes). So the violations a chain
 * produces are a sum of costs that depend only on consecutive pairs (c_{j-1}, c_j) — a DP over the
 * state "last two chain rests". The ranking (egregious → over → minor → most time forward) is
 * lexicographic, which is compatible with summing, and the forward time at `asOf` depends only on the
 * state active at `asOf`, so it enters the sum exactly once per chain as a fourth component.
 *
 * The previous version enumerated chains and kept only the last 12 rests, which bounded the work but
 * judged all older driving with no split credit — 14 days of legal 8/2 splits showed 40 "well over"
 * violations that never happened. This version considers every rest in the shift in O(n³) time.
 */
const MAX_DP_RESTS = 200; // absurd-record safety valve only; realistic shifts have well under 60

type Cost = [number, number, number, number]; // egregious, over, minor, −forward
const ZERO: Cost = [0, 0, 0, 0];
const add = (a: Cost, b: Cost): Cost => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const sub = (a: Cost, b: Cost): Cost => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const less = (a: Cost, b: Cost) => {
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};

export function evaluateShift(
  segments: Segment[],
  span: ShiftSpan,
  restsInShift: RestPeriod[],
  opts: ShiftEvalOptions,
): { best: ShiftEvaluation; noSplit: ShiftEvaluation; candidates: number } {
  const withRests = { ...opts, rests: restsInShift };
  const noSplit = evaluateShiftWithChain(segments, span, [], withRests);
  const all = restsInShift.filter((r) => r.qualifiesShort);
  const cands = all.length > MAX_DP_RESTS ? all.slice(-MAX_DP_RESTS) : all;
  const n = cands.length;
  if (n < 2) return { best: noSplit, noSplit, candidates: 1 };

  const S = span.start;
  const E = span.end ?? Infinity;
  const t = Math.min(opts.asOf, E === Infinity ? opts.asOf : E);
  const { limits } = shiftLimits(span, withRests);
  const driveIn = driveLookup(segments);

  // Driving pieces clipped to the shift, in time order.
  const pieces: { a: number; b: number }[] = [];
  for (const seg of segments) {
    if (seg.status !== 'D') continue;
    const a = Math.max(seg.start, S), b = Math.min(seg.end, E);
    if (b > a) pieces.push({ a, b });
  }
  pieces.sort((x, y) => x.a - y.a);
  const firstAtOrAfter = (x: number) => {
    let lo = 0, hi = pieces.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pieces[m].a < x) lo = m + 1; else hi = m; }
    return lo;
  };
  /** violation counts for one piece — the same arithmetic as evaluateShiftWithChain */
  const pieceCost = (anchor: number, excl: number, p: { a: number; b: number }): Cost => {
    const c: Cost = [0, 0, 0, 0];
    const bump = (m: number) => { const sv = severityOf(m); c[sv === 'egregious' ? 0 : sv === 'violation' ? 1 : 2]++; };
    const tW = p.a + Math.max(0, limits.window - ((p.a - anchor) - excl));
    const tD = p.a + Math.max(0, limits.drive - driveIn(anchor, p.a));
    if (tW < p.b) bump(p.b - tW);
    if (tD < p.b) bump(p.b - tD);
    return c;
  };
  /** prefix sums of piece costs under a fixed (anchor, excl), from piece k0 on */
  const prefixFrom = (anchor: number, excl: number, k0: number): Cost[] => {
    const out: Cost[] = [ZERO];
    for (let k = k0; k < pieces.length; k++) out.push(add(out[out.length - 1], pieceCost(anchor, excl, pieces[k])));
    return out;
  };
  const emptyPre = prefixFrom(S, 0, 0);
  const emptyUpTo = (x: number): Cost => emptyPre[firstAtOrAfter(x)];

  // State (pi, ci): the chain's last two rests are cands[pi], cands[ci] (pi = -1: ci is the first).
  const statePre = new Map<number, { k0: number; pre: Cost[] }>();
  const key = (pi: number, ci: number) => (pi + 1) * (n + 1) + ci;
  const stateCost = (pi: number, ci: number, until: number): Cost => {
    const k = key(pi, ci);
    let st = statePre.get(k);
    if (!st) {
      const c = cands[ci];
      const anchor = pi < 0 ? S : cands[pi].end;
      const excl = c.start >= anchor ? c.duration : 0;
      const k0 = firstAtOrAfter(c.end);
      st = { k0, pre: prefixFrom(anchor, excl, k0) };
      statePre.set(k, st);
    }
    const kEnd = Math.max(st.k0, until === Infinity ? pieces.length : firstAtOrAfter(until));
    return st.pre[kEnd - st.k0];
  };
  const fwdCache = new Map<number, number>();
  const fwd = (pi: number, ci: number): number => {
    const k = pi === -2 ? -1 : key(pi, ci);
    let v = fwdCache.get(k);
    if (v === undefined) {
      const ev = pi === -2 ? noSplit : evaluateShiftWithChain(segments, span, pi < 0 ? [cands[ci]] : [cands[pi], cands[ci]], withRests);
      v = ev.driveRemaining + ev.windowRemaining;
      fwdCache.set(k, v);
    }
    return v;
  };
  const F = (pi: number, ci: number): Cost => [0, 0, 0, -fwd(pi, ci)];

  const best = new Map<number, { cost: Cost; back: number; count: number }>();
  for (let ci = 0; ci < n; ci++) {
    let cost = emptyUpTo(cands[ci].start);
    if (cands[ci].end > t) cost = add(cost, F(-2, -1)); // nothing completed by asOf: the no-split clocks are active
    best.set(key(-1, ci), { cost, back: -1, count: 1 });
  }
  // Process states in order of their last rest so every predecessor is final before it is extended.
  let winner: { cost: Cost; pi: number; ci: number } = { cost: add(emptyPre[pieces.length], F(-2, -1)), pi: -2, ci: -1 };
  let chainsCount = 1;
  for (let ci = 0; ci < n; ci++) {
    for (let pi = -1; pi < ci; pi++) {
      const cur = best.get(key(pi, ci));
      if (!cur) continue;
      const c = cands[ci];
      if (pi >= 0) {
        // a complete chain may end here
        let total = add(cur.cost, stateCost(pi, ci, Infinity));
        if (c.end <= t) total = add(total, F(pi, ci));
        if (less(total, winner.cost)) winner = { cost: total, pi, ci };
        chainsCount = Math.min(999_999, chainsCount + cur.count);
      }
      for (let ni = ci + 1; ni < n; ni++) {
        if (!pairQualifies(c, cands[ni])) continue;
        let cost = add(cur.cost, stateCost(pi, ci, cands[ni].start));
        if (c.end <= t && cands[ni].end > t) cost = add(cost, F(pi, ci));
        const k = key(ci, ni);
        const prev = best.get(k);
        if (!prev) best.set(k, { cost, back: pi, count: cur.count });
        else {
          prev.count = Math.min(999_999, prev.count + cur.count);
          if (less(cost, prev.cost)) { prev.cost = cost; prev.back = pi; }
        }
      }
    }
  }

  if (winner.pi === -2) return { best: noSplit, noSplit, candidates: chainsCount };
  // Rebuild the winning chain from back-pointers.
  const chain: RestPeriod[] = [];
  let pi = winner.pi, ci = winner.ci;
  while (ci >= 0) {
    chain.unshift(cands[ci]);
    const back = best.get(key(pi, ci))!.back;
    ci = pi; pi = back;
    if (ci < 0) break;
  }
  return { best: evaluateShiftWithChain(segments, span, chain, withRests), noSplit, candidates: chainsCount };
}

export function fmt(min: number): string {
  if (!isFinite(min)) return '∞';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
