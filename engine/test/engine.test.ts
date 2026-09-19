import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate, planTrip, safeHaven, pairQualifies, restPeriods, normalize, localToMinute,
  type Segment, type DutyStatus,
} from '../src/index.ts';

const TZ = 'America/Chicago';
/** 2026-09-14 00:00 home-terminal time, in minutes since epoch (a Monday). */
const DAY0 = localToMinute(2026, 9, 14, 0, TZ);
/** minute at day offset d (0-based) and fractional hour h */
const at = (d: number, h: number) => DAY0 + d * 1440 + Math.round(h * 60);

/** Build a day's log from ordered (status, endHour) pairs starting at startHour. */
function log(day: number, startHour: number, parts: [DutyStatus, number][], tentative = false): Segment[] {
  const out: Segment[] = [];
  let cur = at(day, startHour);
  for (const [status, endH] of parts) {
    // endH may run past 24 → next day
    const end = at(day, endH);
    out.push({ status, start: cur, end, tentative });
    cur = end;
  }
  return out;
}

/** A legal 10h on-duty day: 4h D, 30m ON (break), 5.5h D, then off until 06:00 next day. */
function workday(d: number): Segment[] {
  return [...log(d, 6, [['D', 10], ['ON', 10.5], ['D', 16]]), { status: 'OFF', start: at(d, 16), end: at(d + 1, 6) }];
}

/** 10h off before the shift so it starts fresh. */
const fresh = (day: number, startHour: number): Segment => ({ status: 'OFF', start: at(day, startHour - 10), end: at(day, startHour) });

// ------------------------------------------------------------------ pairing rules

test('pairQualifies: minimums, not fixed ratios (§395.1(g)(1)(ii))', () => {
  const r = (duration: number, sb: number) => ({
    start: 0, end: duration, duration, longestSB: sb,
    isReset: duration >= 600, isRestart: false,
    qualifiesShort: duration >= 120, qualifiesLongSB: sb >= 420,
  });
  assert.ok(pairQualifies(r(420, 420), r(180, 0)), '7 SB + 3 OFF');
  assert.ok(pairQualifies(r(480, 480), r(120, 0)), '8 SB + 2 OFF');
  assert.ok(pairQualifies(r(450, 450), r(150, 0)), '7.5 SB + 2.5 OFF');
  assert.ok(pairQualifies(r(300, 0), r(420, 420)), '5 OFF + 7 SB (FMCSA FAQ)');
  assert.ok(pairQualifies(r(180, 0), r(600, 600)), '3 OFF + 10 SB (FMCSA FAQ)');
  assert.ok(!pairQualifies(r(360, 360), r(240, 0)), '6/4 fails: no 7h SB leg');
  assert.ok(!pairQualifies(r(480, 0), r(120, 120)), '8h OFF (not SB) + 2h SB fails: long leg must be SB');
  assert.ok(!pairQualifies(r(420, 420), r(90, 0)), '7 SB + 1.5 OFF fails: short leg <2h');
  assert.ok(!pairQualifies(r(420, 420), r(120, 0)), '7 + 2 = 9 fails: total <10');
});

test('restPeriods: 7h SB must be *consecutive* — OFF in the middle breaks it', () => {
  const segs = normalize([
    { status: 'SB', start: 0, end: 240 },
    { status: 'OFF', start: 240, end: 260 },
    { status: 'SB', start: 260, end: 500 },
  ]);
  const [r] = restPeriods(segs);
  assert.equal(r.duration, 500);
  assert.equal(r.longestSB, 240);
  assert.ok(!r.qualifiesLongSB);
});

// ------------------------------------------------------------------ FMCSA worked examples

test('FMCSA example (3h OFF then 7h SB): recalculates from end of first period, both excluded', () => {
  // 06:00 on duty; D 06-11; OFF 11-14; ON 14-14:30; D 14:30-19; SB 19-02(next day)
  const segs = [fresh(0, 6), ...log(0, 6, [['D', 11], ['OFF', 14], ['ON', 14.5], ['D', 19], ['SB', 26]])];
  const ev = evaluate(segs, { asOf: at(1, 2), config: { timeZone: TZ } });
  assert.equal(ev.shift.chain.length, 2, 'pair recognized');
  assert.equal(ev.shift.anchor, at(0, 14), 'anchor = end of first qualifying period');
  assert.equal(ev.shift.driveRemaining, 6.5 * 60, '11 − 4.5 driven between periods');
  assert.equal(ev.shift.windowRemaining, 9 * 60, '14 − 5 on the window between periods');
  assert.equal(ev.violations.length, 0);
});

test('MySafetyManager 7/3 example: 6h drive / 9h window remaining after pairing', () => {
  const segs = [fresh(0, 7), ...log(0, 7, [['D', 10], ['OFF', 13], ['D', 18], ['SB', 25]])];
  const ev = evaluate(segs, { asOf: at(1, 1), config: { timeZone: TZ } });
  assert.equal(ev.shift.driveRemaining, 6 * 60);
  assert.equal(ev.shift.windowRemaining, 9 * 60);
});

test('11-hour limit is ALSO recalculated from the anchor (truckerwiki gets this wrong)', () => {
  // ON 06-07; D 07-12 (5h); OFF 12-15; ON 15-16; D 16-22 (6h); SB 22-05
  const segs = [fresh(0, 6), ...log(0, 6, [['ON', 7], ['D', 12], ['OFF', 15], ['ON', 16], ['D', 22], ['SB', 29]])];
  const ev = evaluate(segs, { asOf: at(1, 5), config: { timeZone: TZ } });
  assert.equal(ev.shift.windowRemaining, 7 * 60, '14 − 7 (15:00→22:00)');
  assert.equal(ev.shift.driveRemaining, 5 * 60, '11 − 6 driven between periods; the 5h before P1 is cleared');
  // Retroactive exclusion: driving 16-22 is legal only because the SB completes the pair.
  assert.equal(ev.violations.length, 0, 'as-planned: no violation');
  assert.equal(ev.noSplit.violations.length, 1, 'without the pair: drove past the 14th hour');
  assert.equal(ev.noSplit.violations[0].kind, 'WINDOW_14');
  assert.equal(ev.noSplit.violations[0].minutes, 120);
});

test('Strict clocks before the pair completes: the short leg still counts against the 14', () => {
  const segs = [fresh(0, 6), ...log(0, 6, [['D', 11], ['OFF', 14], ['D', 18]])];
  const ev = evaluate(segs, { asOf: at(0, 18), config: { timeZone: TZ } });
  assert.equal(ev.shift.chain.length, 0, 'no completed pair yet');
  assert.equal(ev.shift.windowUsed, 12 * 60, '06→18 with the 3h OFF counting');
  assert.equal(ev.shift.driveUsed, 9 * 60);
  // now add a tentative 7h SB and evaluate as of its end → projection
  const withSB: Segment[] = [...segs, { status: 'SB', start: at(0, 18), end: at(1, 1), tentative: true }];
  const proj = evaluate(withSB, { asOf: at(1, 1), config: { timeZone: TZ } });
  assert.equal(proj.shift.pendingSplitLeg?.end, at(1, 1), 'the SB is now the pending leg of the next possible pair');
  assert.equal(proj.shift.windowRemaining, 10 * 60, '14 − 4 (14:00→18:00)');
  assert.equal(proj.shift.driveRemaining, 7 * 60, '11 − 4');
});

test('FMCSA FAQ: 3h OFF then 10h SB — 3h excluded for the old shift, fresh 11/14 going forward', () => {
  const segs = [fresh(0, 6), ...log(0, 6, [['D', 11], ['OFF', 14], ['D', 21], ['SB', 31]])];
  // D 14-21 = 7h; total drive 12h ⇒ under no-split, DRIVE_11 violation of 1h; window 06→21 = 15h ⇒ 1h WINDOW.
  const ev = evaluate(segs, { asOf: at(1, 7), config: { timeZone: TZ } });
  assert.equal(ev.shifts.length, 2);
  const old = ev.shifts[0];
  assert.equal(old.chain.length, 2, 'the 10h SB pairs with the 3h OFF to evaluate the old shift');
  const kinds = old.violations.map((v) => v.kind).sort();
  assert.deepEqual(kinds, ['DRIVE_11'], 'window is fine (3h excluded) but 12h total driving still violates the 11');
  assert.equal(ev.shift.driveRemaining, 11 * 60, 'fresh after ≥10h');
  assert.equal(ev.shift.windowRemaining, 14 * 60);
});

test('Chained splits: second period of one pair becomes first of the next', () => {
  // OFF 3h @ 08-11; D 11-16; SB 16-23 (7h); D 23-04; OFF 04-07 (3h); then evaluate 07:00 next day
  const segs = [fresh(0, 5), ...log(0, 5, [['D', 8], ['OFF', 11], ['D', 16], ['SB', 23], ['D', 28], ['OFF', 31]])];
  const ev = evaluate(segs, { asOf: at(1, 7), config: { timeZone: TZ } });
  assert.equal(ev.shift.chain.length, 3);
  assert.equal(ev.shift.anchor, at(0, 23), 'anchor moved to end of the SB (first of the latest pair)');
  assert.equal(ev.shift.driveRemaining, 6 * 60, '11 − 5 (23→04)');
  assert.equal(ev.shift.windowRemaining, 9 * 60, '14 − 5');
  assert.equal(ev.violations.length, 0);
});

test('Multiple pairings: engine picks the one with fewest violations (FMCSA FAQ ordering)', () => {
  // Two ≥2h OFF breaks then a 7h SB. Pairing the SB with the *later* OFF leaves early driving inside the
  // window; pairing with the earlier one excludes more time. Engine must choose the compliant interpretation.
  // 05:00 start; D 05-09 (4h); OFF 09-11 (2h); D 11-14 (3h); OFF 14-16.5 (2.5h); D 16.5-19.5 (3h); SB 19.5-03.5 (8h)
  // Window without any exclusion: 05:00→19:30 = 14.5h → 30-min violation. Either OFF pairs with the SB
  // (2+8=10, 2.5+8=10.5) and clears it; the later OFF leaves more time forward → FMCSA tie-break picks it.
  const segs = [fresh(0, 5), ...log(0, 5, [['D', 9], ['OFF', 11], ['D', 14], ['OFF', 16.5], ['D', 19.5], ['SB', 27.5]])];
  const ev = evaluate(segs, { asOf: at(1, 3.5), config: { timeZone: TZ } });
  assert.equal(ev.candidates, 3, 'no-split, OFF1+SB, OFF2+SB');
  assert.equal(ev.noSplit.violations.length, 1, 'without a split the driver ran past the 14');
  assert.equal(ev.violations.length, 0, 'a compliant pairing exists and was chosen');
  assert.equal(ev.shift.chain.length, 2);
  assert.equal(ev.shift.anchor, at(0, 16.5), 'tie-break: pairing that leaves the most time forward');
  assert.equal(ev.shift.driveRemaining, 8 * 60);
  assert.equal(ev.shift.windowRemaining, 11 * 60);
});

// ------------------------------------------------------------------ 30-minute break

test('30-minute break: driving 9h straight → 1h BREAK_30 violation; short-haul exempt', () => {
  const segs = [fresh(0, 6), ...log(0, 6, [['D', 15]])];
  const ev = evaluate(segs, { asOf: at(0, 15), config: { timeZone: TZ } });
  const b = ev.violations.filter((v) => v.kind === 'BREAK_30');
  assert.equal(b.length, 1);
  assert.equal(b[0].minutes, 60);
  const sh = evaluate(segs, { asOf: at(0, 15), config: { timeZone: TZ, shortHaul: true } });
  assert.equal(sh.violations.filter((v) => v.kind === 'BREAK_30').length, 0);
});

test('30-minute break can be satisfied by ON-duty-not-driving (fueling counts)', () => {
  const segs = [fresh(0, 6), ...log(0, 6, [['D', 11], ['ON', 11.5], ['D', 16]])];
  const ev = evaluate(segs, { asOf: at(0, 16), config: { timeZone: TZ } });
  assert.equal(ev.violations.length, 0);
  assert.equal(ev.shift.driveSinceBreak, 4.5 * 60);
});

test('binding limit and mustStopBy: window binds when driver dawdled', () => {
  // 06:00 on; ON 06-10 (4h loading); D 10-14 (4h) → at 14:00 drive left 7h, window left 6h → window binds
  const segs = [fresh(0, 6), ...log(0, 6, [['ON', 10], ['D', 14]])];
  const ev = evaluate(segs, { asOf: at(0, 14), config: { timeZone: TZ } });
  assert.equal(ev.binding, 'BREAK_30', '8h rule: 4h driven, 4h until break required — that binds first');
  assert.equal(ev.driveNow, 4 * 60);
  const sh = safeHaven(ev, 55);
  assert.equal(sh.miles, 220);
  assert.equal(sh.cutoffs[0].bufferMinutes, 60);
  assert.equal(sh.cutoffs[0].miles, 165);
});

// ------------------------------------------------------------------ cycle

test('70/8 cycle: 7 days × 10h on duty = 70 → nothing left on day 8; oldest day drops off next day', () => {
  const segs: Segment[] = [];
  for (let d = 0; d < 7; d++) segs.push(...workday(d));
  const ev = evaluate(segs, { asOf: at(7, 6), config: { timeZone: TZ } });
  assert.equal(ev.violations.length, 0, 'history itself is legal');
  assert.equal(ev.cycle.used, 70 * 60);
  assert.equal(ev.cycle.remaining, 0);
  assert.equal(ev.binding, 'CYCLE');
  assert.equal(ev.cycle.forecast[0].dropsOff, 10 * 60, 'day 0 (10h) drops at the next day start');
  assert.equal(ev.cycle.forecast[0].availableAtStart, 10 * 60);
});

test('cycle counts ON-duty not driving, and a 34h restart clears it', () => {
  const segs: Segment[] = [];
  for (let d = 0; d < 6; d++) segs.push(...log(d, 6, [['ON', 8], ['D', 12], ['ON', 12.5], ['D', 16]]), { status: 'OFF', start: at(d, 16), end: at(d + 1, 6) });
  let ev = evaluate(segs, { asOf: at(6, 6), config: { timeZone: TZ } });
  assert.equal(ev.violations.length, 0, 'history itself is legal');
  assert.equal(ev.cycle.used, 60 * 60, '6 × (2.5h ON + 7.5h D)');
  // now a 34h restart: OFF from day 6 06:00 → day 7 16:00
  const restart: Segment = { status: 'OFF', start: at(6, 6), end: at(7, 16) };
  ev = evaluate([...segs, restart], { asOf: at(7, 16), config: { timeZone: TZ } });
  assert.equal(ev.cycle.used, 0);
  assert.equal(ev.cycle.remaining, 70 * 60);
});

test('60/7 cycle option', () => {
  const segs: Segment[] = [];
  for (let d = 0; d < 6; d++) segs.push(...workday(d));
  const ev = evaluate(segs, { asOf: at(6, 6), config: { timeZone: TZ, cycle: '60/7' } });
  assert.equal(ev.cycle.limit, 60 * 60);
  assert.equal(ev.cycle.windowDays, 7);
  assert.equal(ev.cycle.remaining, 0);
});

test('driving past the cycle limit is a CYCLE violation', () => {
  const segs: Segment[] = [];
  for (let d = 0; d < 7; d++) segs.push(...workday(d));
  segs.push(...log(7, 6, [['D', 8]]));
  const ev = evaluate(segs, { asOf: at(7, 8), config: { timeZone: TZ } });
  const c = ev.violations.filter((v) => v.kind === 'CYCLE');
  assert.equal(c.length, 1);
  assert.equal(c[0].minutes, 120);
});

// ------------------------------------------------------------------ trip planner

test('trip: 600 mi @ 55 mph for a fresh driver needs one 30-min break, no reset', () => {
  const plan = planTrip([fresh(0, 6)], { departure: at(0, 6), distanceMiles: 600, mph: 55, config: { timeZone: TZ } });
  assert.ok(plan.feasible, plan.warnings.join('; '));
  const rests = plan.steps.filter((s) => s.segment.status !== 'D');
  assert.equal(rests.length, 1);
  assert.equal(rests[0].segment.end - rests[0].segment.start, 30);
  const driveMin = plan.steps.filter((s) => s.segment.status === 'D').reduce((a, s) => a + (s.segment.end - s.segment.start), 0);
  assert.ok(Math.abs(driveMin - Math.ceil(600 / 55 * 60)) <= 2);
  assert.equal(plan.elapsedMinutes, driveMin + 30);
});

test('trip: 1200 mi needs a 10h reset; receiver dwell burns the 14 but not the 11', () => {
  const plan = planTrip([fresh(0, 6)], {
    departure: at(0, 6), distanceMiles: 1200, mph: 55, preTripMinutes: 30,
    stops: [{ atMile: 500, minutes: 120, status: 'ON', label: 'Receiver dwell' }],
    config: { timeZone: TZ },
  });
  assert.ok(plan.feasible, plan.warnings.join('; '));
  const resets = plan.steps.filter((s) => s.reason.startsWith('10-hour reset'));
  assert.equal(resets.length, 1);
  assert.equal(plan.evaluation.violations.length, 0);
  // sanity: ~21.8h driving + 0.5 pre + 2 dwell + breaks + 10h reset ≈ 35-36h
  assert.ok(plan.elapsedMinutes > 34 * 60 && plan.elapsedMinutes < 37 * 60, `elapsed ${plan.elapsedMinutes}`);
});

test('trip: driver with 0 cycle hours waits for recap instead of driving illegally', () => {
  const segs: Segment[] = [];
  for (let d = 0; d < 7; d++) segs.push(...workday(d));
  const plan = planTrip(segs, { departure: at(7, 6), distanceMiles: 300, mph: 55, config: { timeZone: TZ } });
  assert.ok(plan.feasible, plan.warnings.join('; '));
  assert.ok(plan.steps.some((s) => s.reason.startsWith('Wait for recap')));
  assert.equal(plan.evaluation.violations.length, 0);
});
