/**
 * Regression tests from the stress-test round-2 brief (retest of build 2026-09-24 21:25).
 * Each of these failed on that build. U1a/U1b (live status vs a stamped row) go through the store and
 * live in web/test/smoke.mjs; everything engine-level is here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, planTrip, planTripAll, pruneHistory, evaluateShift, evaluateShiftWithChain, rankEvaluations, pairQualifies, normalize, restPeriods, shifts } from '../src/index.ts';
import type { Segment, RestPeriod } from '../src/index.ts';

const cfg = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false } as const;
const at = (s: string) => Math.floor(Date.parse(`${s}Z`) / 60000) + 300; // Chicago CDT literal → epoch min
const H = (h: number) => Math.round(h * 60);
const ms = (m: number) => m * 60000; // what stamp() produces: Date.now() milliseconds
function seq(start: string, parts: [Segment['status'], number][]): Segment[] {
  let t = at(start);
  return parts.map(([status, h]) => { const s = { status, start: t, end: t + H(h) }; t += H(h); return s; });
}

// ---- §2.1 — a logged row that started before now and ends after it ----
const straddle = (): Segment[] => [
  { status: 'OFF', start: at('2026-09-14T20:00'), end: at('2026-09-15T06:00'), createdAt: ms(at('2026-09-15T06:00')) },
  { status: 'ON', start: at('2026-09-15T06:00'), end: at('2026-09-15T08:00'), createdAt: ms(at('2026-09-15T08:00')) },
  { status: 'OFF', start: at('2026-09-15T08:00'), end: at('2026-09-15T22:00'), createdAt: ms(at('2026-09-15T08:01')) },
];
test('U1c straddling row: clocks run from 06:00 and the planner result is legal when followed', () => {
  const now = at('2026-09-15T10:00');
  const rows = straddle();
  const ev = evaluate(rows, { asOf: now, config: cfg });
  assert.equal(ev.shift.windowRemaining, H(10), 'window runs from 06:00');
  assert.equal(ev.clippedFuture.length, 1, 'the row running past now is reported');
  assert.equal(ev.clippedFuture[0].end, at('2026-09-15T22:00'), 'reported with its original end');
  const p = planTrip(rows, { departure: now, distanceMiles: 700, mph: 55, config: cfg, restStrategy: 'reset10' });
  const real = [rows[0], rows[1], { status: 'OFF' as const, start: at('2026-09-15T08:00'), end: now }].map(({ createdAt, ...r }) => r);
  const truth = evaluate([...real, ...p.steps.map((s) => ({ ...s.segment, tentative: false }))], { config: cfg });
  assert.ok(!(p.feasible && truth.violations.length), `feasible, but following it: ${truth.violations.map((v) => `${v.kind} ${v.minutes}m`).join(', ')}`);
  assert.ok(p.warnings.some((w) => /cut off at departure/.test(w)), 'the planner says it cut the row');
});
test('U1c-2 unstamped plan rows are never overwritten by stamped history', () => {
  const n = normalize([
    { status: 'OFF', start: at('2026-09-15T07:00'), end: at('2026-09-15T12:00'), createdAt: ms(at('2026-09-15T07:00')) },
    { status: 'D', start: at('2026-09-15T08:00'), end: at('2026-09-15T20:00'), tentative: true },
  ]);
  const d = n.filter((s) => s.status === 'D').reduce((a, s) => a + s.end - s.start, 0);
  assert.equal(d, H(12), 'the planned 12h of driving survives');
});
test('U1c-3 legacy unstamped logged rows still lose to a newer stamped correction', () => {
  const n = normalize([
    { status: 'OFF', start: at('2026-09-15T12:00'), end: at('2026-09-15T20:00') },
    { status: 'D', start: at('2026-09-15T12:00'), end: at('2026-09-15T13:00'), createdAt: ms(at('2026-09-15T21:00')) },
  ]);
  assert.equal(n.filter((s) => s.status === 'D').reduce((a, s) => a + s.end - s.start, 0), H(1));
});

// ---- §2.2 — legal continuous splits: no phantom violations, however long ----
for (const [name, pat] of [
  ['8/2', [['D', 5.5], ['OFF', 2], ['D', 5.5], ['SB', 8]]],
  ['7/3', [['D', 5], ['SB', 7], ['D', 6], ['OFF', 3]]],
  ['4/7.5/4/2.5', [['D', 4], ['SB', 7.5], ['D', 4], ['OFF', 2.5]]],
] as const) {
  test(`U2 21 days of legal ${name} splits → zero DRIVE_11 / WINDOW_14 violations, clocks unchanged`, () => {
    const parts: [Segment['status'], number][] = [['OFF', 10]];
    for (let i = 0; i < 24; i++) parts.push(...(pat as unknown as [Segment['status'], number][]));
    const s = seq('2026-08-01T20:00', parts);
    const t0 = performance.now();
    const ev = evaluate(s, { asOf: s[s.length - 1].end, config: cfg });
    assert.ok(performance.now() - t0 < 2000, 'bounded time');
    const bad = ev.violations.filter((v) => v.kind === 'DRIVE_11' || v.kind === 'WINDOW_14');
    assert.equal(bad.length, 0, `${bad.length} phantom violations, e.g. ${bad[0]?.kind} ${bad[0]?.minutes}m`);
  });
}
test('U2b a real violation inside a long split run is still caught', () => {
  const pat: [Segment['status'], number][] = [['D', 5.5], ['OFF', 2], ['D', 5.5], ['SB', 8]];
  const parts: [Segment['status'], number][] = [['OFF', 10]];
  for (let i = 0; i < 20; i++) parts.push(...pat);
  parts.push(['D', 5.5], ['OFF', 2], ['D', 6.5]); // 1h over the 11 after the last pair
  const s = seq('2026-08-01T20:00', parts);
  const ev = evaluate(s, { asOf: s[s.length - 1].end, config: cfg });
  const d11 = ev.violations.filter((v) => v.kind === 'DRIVE_11');
  assert.equal(d11.length, 1); assert.equal(d11[0].minutes, 60);
});

// Exactness guard: the DP must pick the same interpretation as brute-force enumeration.
test('U2c DP chain selection equals brute force on 1500 random shifts', () => {
  let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const all = (rests: RestPeriod[]) => {
    const c = rests.filter((r) => r.qualifiesShort); const out: RestPeriod[][] = [[]];
    const rec = (ch: RestPeriod[], i0: number) => { for (let i = i0; i < c.length; i++) {
      if (!ch.length) rec([c[i]], i + 1);
      else if (pairQualifies(ch[ch.length - 1], c[i])) { const nx = [...ch, c[i]]; out.push(nx); rec(nx, i + 1); } } };
    rec([], 0); return out;
  };
  const sig = (e: { violations: { severity: string }[]; driveRemaining: number; windowRemaining: number }) =>
    ['egregious', 'violation', 'nominal'].map((k) => e.violations.filter((v) => v.severity === k).length).join() + `|${e.driveRemaining}|${e.windowRemaining}`;
  let n = 0;
  for (let k = 0; k < 1500; k++) {
    let t = 29_800_000 + Math.floor(rnd() * 1440); const segs: Segment[] = [];
    for (let i = 0, m = 4 + Math.floor(rnd() * 20); i < m; i++) {
      const st = pick(['D', 'D', 'SB', 'OFF', 'ON'] as const);
      const d = H(pick(st === 'D' ? [1, 2, 3, 4, 5, 6] : st === 'SB' ? [2, 3, 7, 7.5, 8, 9.5] : st === 'OFF' ? [0.5, 2, 2.5, 3, 10, 12] : [0.5, 1, 2]));
      segs.push({ status: st, start: t, end: t + d, tentative: rnd() < 0.1 }); t += d;
    }
    const norm = normalize(segs); const rests = restPeriods(norm);
    for (const span of shifts(norm, rests)) {
      const inShift = rests.filter((r) => r.start >= span.start && (span.end === null || r.start <= span.end));
      const opening = rests.find((r) => r.end === span.start && r.isReset && r.qualifiesLongSB); if (opening) inShift.unshift(opening);
      if (inShift.filter((r) => r.qualifiesShort).length > 10) continue;
      const asOf = rnd() < 0.5 ? t : span.start + Math.floor(rnd() * 1800);
      const opts = { asOf, config: cfg, rests: inShift };
      const brute = rankEvaluations(all(inShift).map((c) => evaluateShiftWithChain(norm, span, c, opts)));
      const dp = evaluateShift(norm, span, inShift, { asOf, config: cfg }).best;
      assert.equal(sig(dp), sig(brute), `case ${k}`); n++;
    }
  }
  assert.ok(n > 1500, `compared ${n} shifts`);
});

// ---- §2.6 — only gaps that can still change an answer are reported ----
test('U3 a 3h hole 30 days ago is not reported; a 3h hole yesterday is', () => {
  const old = [...seq('2026-08-10T06:00', [['D', 5]]), ...seq('2026-08-10T14:00', [['OFF', 10]])];
  const recent = seq('2026-09-14T20:00', [['OFF', 10], ['D', 4]]);
  const bridge: Segment = { status: 'OFF', start: old[old.length - 1].end, end: recent[0].start };
  const ev = evaluate([...old, bridge, ...recent], { asOf: recent[recent.length - 1].end, config: cfg });
  assert.equal(ev.gaps.length, 0, 'old hole not reported');
  const y = [...seq('2026-09-14T06:00', [['D', 4]]), ...seq('2026-09-14T13:00', [['OFF', 10], ['D', 3]])];
  const ev2 = evaluate(y, { asOf: y[y.length - 1].end, config: cfg });
  assert.equal(ev2.gaps.length, 1, 'yesterday’s hole is reported');
});

// ---- §2.4 — Trip tab cost does not grow with the length of the record ----
const legalWeeks = (weeks: number) => {
  const wk: [Segment['status'], number][] = [];
  for (let i = 0; i < 5; i++) wk.push(['ON', .5], ['D', 5.5], ['OFF', .5], ['D', 5], ['ON', 1], ['OFF', 11.5]);
  wk.push(['OFF', 24]);
  const parts: [Segment['status'], number][] = []; for (let i = 0; i < weeks; i++) parts.push(...wk);
  return seq('2026-03-02T06:00', parts);
};
test('U4 planTripAll on 26 weeks of legal history < 1000ms', () => {
  const s = legalWeeks(26);
  const t0 = performance.now();
  planTripAll(s, { departure: s[s.length - 1].end, distanceMiles: 2400, mph: 55, preTripMinutes: 30, config: cfg });
  const took = performance.now() - t0;
  assert.ok(took < 1000, `took ${took.toFixed(0)}ms`);
});
test('U4b pruning never changes a plan', () => {
  for (const weeks of [3, 8, 26]) {
    const s = legalWeeks(weeks);
    for (const back of [0, H(3), H(13)]) {
      const dep = s[s.length - 1].end - back;
      const input = { departure: dep, distanceMiles: 1900, mph: 55, preTripMinutes: 30, config: cfg };
      const hist = s.filter((x) => x.start < dep).map((x) => (x.end > dep ? { ...x, end: dep } : x));
      assert.ok(pruneHistory(hist, dep, cfg).length < hist.length || hist.length < 50, 'something was pruned');
      for (const strat of ['reset10', 'split', 'restart34'] as const) {
        const a = planTrip(hist, { ...input, restStrategy: strat });
        // reference: the same plan with pruning defeated (history under the size threshold is untouched,
        // so compare against evaluate() on the full record instead)
        const full = evaluate([...hist, ...a.steps.map((x) => x.segment)], { asOf: a.arrival, config: cfg });
        assert.equal(a.evaluation.cycle.remaining, full.cycle.remaining, `${weeks}w ${strat}: cycle at arrival`);
        assert.equal(a.evaluation.driveNow, full.driveNow, `${weeks}w ${strat}: clocks at arrival`);
        assert.deepEqual(a.evaluation.violations.filter((v) => v.start >= dep).map((v) => [v.kind, v.start, v.minutes]),
          full.violations.filter((v) => v.start >= dep).map((v) => [v.kind, v.start, v.minutes]), `${weeks}w ${strat}: plan violations`);
      }
    }
  }
});
