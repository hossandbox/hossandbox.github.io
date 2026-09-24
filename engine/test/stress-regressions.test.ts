/**
 * Regression tests from the Opus 5.5 stress-test brief (build 2026-09-24 00:00).
 *
 * T1–T6 were all failing on that build (T6 crashed the process with OOM). R1–R7 are the FMCSA
 * behaviours the brief verified as correct and which must not regress while fixing the rest.
 * The brief's own standalone file is archived at reviews/stress-regressions-original.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, planTrip, normalize, minutesOf, localToMinute, carrierDayStart, nextCarrierDayStart } from '../src/index.ts';
import type { Segment } from '../src/index.ts';

const cfg = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false } as const;
/**
 * Chicago wall-clock literal -> epoch minutes. Every date here falls in CDT (UTC-5), and the offset
 * is written out rather than taken from the runner so the suite cannot depend on the container's TZ.
 */
const at = (s: string) => Math.floor(Date.parse(`${s}Z`) / 60000) + 300;
const H = (h: number) => Math.round(h * 60);
function seq(start: string, parts: [Segment['status'], number][]): Segment[] {
  let t = at(start);
  return parts.map(([status, h]) => { const s = { status, start: t, end: t + H(h) }; t += H(h); return s; });
}

// ---- T1: a future-dated non-tentative entry must not reset the current shift or make an illegal plan "feasible". ----
test('T1 future entry does not hand out a fresh clock / illegal plan', () => {
  const now = at('2026-09-15T10:00');
  const real = seq('2026-09-14T20:00', [['OFF', 10], ['ON', 4]]); // on duty since 06:00
  const futureSB: Segment = { status: 'SB', start: at('2026-09-15T20:00'), end: at('2026-09-16T06:00') };
  const ev = evaluate([...real, futureSB], { asOf: now, config: cfg });
  assert.equal(ev.shift.windowRemaining, H(10), `14-hr left should be 10h00 at 10:00, got ${ev.shift.windowRemaining}m (anchor ${ev.shift.anchor})`);
  assert.equal(ev.futureLogged.length, 1, 'the ignored row must be reported, not dropped silently');
  const p = planTrip([...real, futureSB], { departure: now, distanceMiles: 700, mph: 55, config: cfg, restStrategy: 'reset10' });
  const followed = [...real, ...p.steps.map((s) => ({ ...s.segment, tentative: false }))];
  const truth = evaluate(followed, { config: cfg });
  assert.ok(!(p.feasible && truth.violations.length > 0),
    `plan marked feasible, but following it yields: ${truth.violations.map((v) => `${v.kind} ${v.minutes}m ${v.severity}`).join(', ')}`);
});

// ---- T2: correcting a logged row by adding an overlapping row — the NEWER entry must win. ----
test('T2 forgotten driving added over an OFF row is kept', () => {
  const logged = seq('2026-09-15T06:00', [['D', 6], ['OFF', 8]]);
  const correction: Segment = { status: 'D', start: at('2026-09-15T12:00'), end: at('2026-09-15T13:00'), createdAt: 2 };
  const n = normalize([...logged.map((s) => ({ ...s, createdAt: 1 })), correction]);
  const drive = n.filter((s) => s.status === 'D').reduce((a, s) => a + s.end - s.start, 0);
  assert.equal(drive, H(7), `expected 7h driving after correction, got ${drive / 60}h`);
});

test('T2b late-start correction OFF 06-07 over D 06-14 is kept', () => {
  const logged = seq('2026-09-15T06:00', [['D', 8]]).map((s) => ({ ...s, createdAt: 1 }));
  const corr: Segment = { status: 'OFF', start: at('2026-09-15T06:00'), end: at('2026-09-15T07:00'), createdAt: 2 };
  const n = normalize([...logged, corr]);
  const drive = n.filter((s) => s.status === 'D').reduce((a, s) => a + s.end - s.start, 0);
  assert.equal(drive, H(7), `expected 7h driving, got ${drive / 60}h`);
});

// ---- T3: an unlogged hole inside a working day must not become a 10-hour reset. ----
test('T3 10.5h unlogged gap is not treated as a reset', () => {
  const s = [...seq('2026-09-15T06:00', [['D', 5]]), ...seq('2026-09-15T21:30', [['D', 3]])];
  const ev = evaluate(s, { asOf: at('2026-09-16T00:30'), config: cfg });
  assert.ok(ev.shift.anchor === at('2026-09-15T06:00') || ev.gaps.length > 0,
    `gap silently became a reset: anchor moved to ${new Date(ev.shift.anchor * 60000).toISOString()}, no gap surfaced`);
});

// ---- T4: the split strategy should be able to CREATE a split, not only pair with an existing >=2h rest. ----
test('T4 split strategy differs from reset10 on a long run for a fresh driver', () => {
  const hist = seq('2026-09-14T20:00', [['OFF', 10]]);
  const base = { departure: at('2026-09-15T06:00'), distanceMiles: 2000, mph: 55, preTripMinutes: 30, config: cfg };
  const r = planTrip(hist, { ...base, restStrategy: 'reset10' });
  const sp = planTrip(hist, { ...base, restStrategy: 'split' });
  const usesSplit = sp.steps.some((s) => s.segment.status === 'SB' && s.segment.end - s.segment.start >= H(7) && s.segment.end - s.segment.start < H(10));
  assert.ok(usesSplit || sp.arrival !== r.arrival, 'split plan is identical to reset10 plan (UI then claims strategy "makes no difference")');
});

// ---- T5: malformed import must be rejected cleanly, not throw deep in the engine. ----
test('T5 evaluate() rejects/filters non-numeric segment times without throwing', () => {
  const ev = evaluate([{ status: 'D', start: '2026-09-15T06:00', end: '2026-09-15T08:00' } as unknown as Segment], { asOf: at('2026-09-15T10:00'), config: cfg });
  assert.equal(ev.invalid.length, 1, 'the rejected row should be named, not silently ignored');
  assert.equal(ev.shift.driveRemaining, cfg.cycle === '70/8' ? H(11) : H(11));
});

// ---- T6: continuous split-sleeper history must stay fast and bounded. ----
test('T6 12 days of 7/3 splits evaluates in < 500ms', () => {
  const day: [Segment['status'], number][] = [['ON', 0.5], ['D', 5], ['SB', 7.5], ['D', 5.5], ['OFF', 2.5], ['ON', 1], ['D', 2]];
  const parts: [Segment['status'], number][] = [];
  for (let i = 0; i < 12; i++) parts.push(...day);
  const s = seq('2026-06-01T06:00', parts);
  const t0 = performance.now();
  evaluate(s, { asOf: s[s.length - 1].end, config: cfg });
  const ms = performance.now() - t0;
  assert.ok(ms < 500, `took ${ms.toFixed(0)}ms`);
});

// ---- Extra guards for the fixes themselves. ----

test('the chain search is bounded: a long split history does not blow up the heap', () => {
  // 30 days of continuous splits is past the point where the old implementation died at 512 MB.
  const day: [Segment['status'], number][] = [['ON', 0.5], ['D', 5], ['SB', 7.5], ['D', 5.5], ['OFF', 2.5], ['ON', 1], ['D', 2]];
  const parts: [Segment['status'], number][] = [];
  for (let i = 0; i < 30; i++) parts.push(...day);
  const s = seq('2026-06-01T06:00', parts);
  const t0 = performance.now();
  const ev = evaluate(s, { asOf: s[s.length - 1].end, config: cfg });
  const ms = performance.now() - t0;
  // The search is now an exact DP over every rest (round 2, §2.2): the work is polynomial even though
  // the number of interpretations it covers is astronomically large, so bound the time, not the count.
  assert.ok(ms < 2000, `30 days of splits took ${ms.toFixed(0)}ms`);
  assert.ok(ev.candidates > 3000, 'every interpretation is covered, not a trimmed subset');
});

test('the driving-minutes lookup is exactly equivalent to a direct scan', () => {
  // The prefix-sum lookup replaced a per-segment scan for speed; a clock is only as good as its
  // arithmetic, so prove equivalence on randomised records rather than trusting the change.
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 40; trial++) {
    const segs: Segment[] = [];
    let t = at('2026-06-01T06:00');
    for (let i = 0; i < 30; i++) {
      const mins = 20 + Math.floor(rnd() * 400);
      const status: Segment['status'] = rnd() < 0.45 ? 'D' : rnd() < 0.5 ? 'OFF' : 'SB';
      segs.push({ status, start: t, end: t + mins });
      t += mins;
    }
    const ev = evaluate(segs, { asOf: segs[segs.length - 1].end, config: cfg });
    const direct = minutesOf(ev.segments, new Set(['D']), ev.shift.anchor, ev.asOf);
    assert.equal(ev.shift.driveUsed, direct, `trial ${trial}: lookup and scan disagreed`);
  }
});

test('a gap inside the record is surfaced with its exact boundaries', () => {
  const s = [...seq('2026-09-15T06:00', [['D', 5]]), ...seq('2026-09-15T21:30', [['D', 3]])];
  const ev = evaluate(s, { asOf: at('2026-09-16T00:30'), config: cfg });
  assert.equal(ev.gaps.length, 1);
  assert.equal(ev.gaps[0].start, at('2026-09-15T11:00'));
  assert.equal(ev.gaps[0].end, at('2026-09-15T21:30'));
});

test('tentative rows are still allowed in the future', () => {
  // The future-entry fix must not break what-if planning, which is future by design.
  const real = seq('2026-09-15T06:00', [['OFF', 10]]);
  const planned: Segment = { status: 'D', start: at('2026-09-15T16:00'), end: at('2026-09-15T18:00'), tentative: true };
  const ev = evaluate([...real, planned], { asOf: at('2026-09-15T17:00'), config: cfg });
  assert.equal(ev.futureLogged.length, 0, 'a what-if row is not a future-dated log entry');
  assert.equal(ev.segments.length, 2, 'the tentative row stays in the record');
});

// ---- Must-not-regress: FMCSA behaviour verified correct by the brief. ----
test('R1 basic: 10 off, 1 ON, 8 D, 30m ON, 3 D -> 11 used, 14 has 1h30', () => {
  const ev = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['ON', 1], ['D', 8], ['ON', 0.5], ['D', 3]]), { config: cfg });
  assert.equal(ev.shift.driveRemaining, 0);
  assert.equal(ev.shift.windowRemaining, 90);
  assert.equal(ev.violations.length, 0);
});

test('R2 29-min break -> BREAK_30 violation', () => {
  const ev = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['D', 8], ['OFF', 29 / 60], ['D', 1]]), { config: cfg });
  assert.ok(ev.violations.some((v) => v.kind === 'BREAK_30'), 'missing BREAK_30');
});

test('R3 15m ON + 15m OFF satisfies the 30-min break', () => {
  const ev = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['D', 8], ['ON', 0.25], ['OFF', 0.25], ['D', 1]]), { config: cfg });
  assert.equal(ev.violations.length, 0);
});

test('R4 FMCSA 7/3 example: at end of 3h rest -> 11 left 5h, 14 left 8h', () => {
  const ev = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['ON', 1], ['D', 5], ['SB', 7], ['D', 6], ['OFF', 3]]), { config: cfg });
  assert.equal(ev.shift.driveRemaining, H(5));
  assert.equal(ev.shift.windowRemaining, H(8));
});

test('R5 7h SB interrupted by 10-min ON does not qualify as a split', () => {
  const ev = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['D', 5], ['SB', 3.5], ['ON', 1 / 6], ['SB', 3.5], ['D', 6], ['OFF', 3], ['D', 2]]), { config: cfg });
  assert.equal(ev.shift.chain.length, 0);
  assert.ok(ev.violations.some((v) => v.kind === 'WINDOW_14'), 'broken SB was paired');
});

test('R6 FAQ07 (2026-07-01): 3h OFF then 10h SB -> the 3h does not count against the 14', () => {
  const sb = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['D', 6], ['OFF', 3], ['D', 4.5], ['ON', 1], ['D', 0.5], ['SB', 10]]), { config: cfg });
  const off = evaluate(seq('2026-09-14T20:00', [['OFF', 10], ['D', 6], ['OFF', 3], ['D', 4.5], ['ON', 1], ['D', 0.5], ['OFF', 10]]), { config: cfg });
  assert.ok(!sb.violations.some((v) => v.kind === 'WINDOW_14'), 'FAQ07 pairing not applied');
  assert.ok(off.violations.some((v) => v.kind === 'WINDOW_14'), 'FAQ07 applied to a plain OFF reset');
});

test('R7 FAQ22 (2026-07-01): 10h rest incl. 7h SB pairs with later 2h -> 2h excluded from 14', () => {
  const ev = evaluate(seq('2026-09-14T20:00', [['OFF', 3], ['SB', 7], ['D', 6], ['OFF', 2], ['D', 5], ['ON', 2]]), { config: cfg });
  assert.equal(ev.shift.windowRemaining, H(1));
  assert.equal(ev.shift.driveRemaining, 0);
});
test('DST spring-forward: a carrier day start inside the gap resolves forward, not early', () => {
  // 2026-03-08 in America/Chicago jumps 02:00 CST straight to 03:00 CDT, so 02:00 never appears on a
  // clock. Resolving it an hour early made the preceding carrier day 23 hours long (stress-test 2.8).
  const hm = (min: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date(min * 60000));
  const m = localToMinute(2026, 3, 8, 2, 'America/Chicago');
  assert.equal(hm(m), '03:00', 'the day should start when the clock actually reaches it');
  assert.equal(hm(m - 1), '01:59', 'and it should be the first real instant after the gap');
});

test('DST spring-forward: a dayStartHour in the gap does not corrupt the neighbouring day', () => {
  const cfg = { cycle: '70/8', dayStartHour: 2, timeZone: 'America/Chicago' };
  const insideMar7 = at('2026-03-07T12:00'); // noon local, comfortably inside the carrier day
  const start = carrierDayStart(insideMar7, cfg as never);
  const next = nextCarrierDayStart(start, cfg as never);
  assert.equal(next - start, 1440, `the day beginning Mar 7 runs ${next - start}m, expected a full 24h`);
});

test('DST fall-back: the 25-hour day is unchanged', () => {
  // The clocks go back at 02:00 CDT on 2026-11-01, so the repeated hour sits in the carrier day that
  // BEGINS Oct 31 — with dayStartHour = 2 that day runs 25h, and Nov 1's own day runs the usual 24h.
  const cfg = { cycle: '70/8', dayStartHour: 2, timeZone: 'America/Chicago' };
  const start = carrierDayStart(at('2026-10-31T12:00'), cfg as never);
  const next = nextCarrierDayStart(start, cfg as never);
  assert.equal(next - start, 1500, `the day beginning Oct 31 runs ${next - start}m, expected 25h`);
  const nov1 = carrierDayStart(at('2026-11-01T12:00'), cfg as never);
  assert.equal(nextCarrierDayStart(nov1, cfg as never) - nov1, 1440, 'the day beginning Nov 1 should still be 24h');
});
