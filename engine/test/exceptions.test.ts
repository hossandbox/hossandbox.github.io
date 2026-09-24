import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, planTrip, planTripAll, localToMinute, type Segment, type DutyStatus } from '../src/index.ts';

const TZ = 'America/Chicago';
const DAY0 = localToMinute(2026, 9, 14, 0, TZ);
const at = (d: number, h: number) => DAY0 + d * 1440 + Math.round(h * 60);
function log(day: number, startHour: number, parts: [DutyStatus, number][]): Segment[] {
  const out: Segment[] = []; let cur = at(day, startHour);
  for (const [status, endH] of parts) { const end = at(day, endH); out.push({ status, start: cur, end }); cur = end; }
  return out;
}
const fresh = (day: number, startHour: number): Segment => ({ status: 'OFF', start: at(day, startHour - 10), end: at(day, startHour) });

test('adverse driving conditions: +2h driving and +2h window for the flagged shift only (§395.1(b)(1))', () => {
  // 06:00 on; D 06-10; ON 10-10.5; D 10.5-18; ON 18-18.5; D 18.5-19.5 → 12.5h driving, 13.5h window.
  // Illegal normally (DRIVE_11 by 1.5h), legal under adverse conditions (13h).
  const segs = [fresh(0, 6), ...log(0, 6, [['D', 10], ['ON', 10.5], ['D', 18], ['ON', 18.5], ['D', 19.5]])];
  const plain = evaluate(segs, { asOf: at(0, 19.5), config: { timeZone: TZ } });
  assert.ok(plain.violations.every((v) => v.kind === 'DRIVE_11'));
  assert.equal(plain.violations.reduce((a, v) => a + v.minutes, 0), 90, '30m at end of first drive segment + 60m in the second');
  const adverse = evaluate(segs, { asOf: at(0, 19.5), config: { timeZone: TZ, adverseShifts: [at(0, 6)] } });
  assert.equal(adverse.violations.length, 0);
  assert.equal(adverse.shift.limits.drive, 13 * 60);
  assert.equal(adverse.shift.limits.window, 16 * 60);
  assert.equal(adverse.shift.driveRemaining, 30, '13h − 12.5h');
  assert.ok(adverse.shift.notes.some((n) => n.includes('Adverse')));
  // Next shift is back to 11/14
  const next = [...segs, { status: 'OFF' as DutyStatus, start: at(0, 19.5), end: at(1, 5.5) }, ...log(1, 5.5, [['D', 9]])];
  const ev2 = evaluate(next, { asOf: at(1, 9), config: { timeZone: TZ, adverseShifts: [at(0, 6)] } });
  assert.equal(ev2.shift.limits.drive, 11 * 60);
});

test('16-hour short-haul exception: window 16, driving still 11, once per 7 days (§395.1(o))', () => {
  // 06:00 on; ON 06-09 (3h dock); D 09-13; ON 13-13.5; D 13.5-20.5 → 11h driving, 14.5h window
  const segs = [fresh(0, 6), ...log(0, 6, [['ON', 9], ['D', 13], ['ON', 13.5], ['D', 20.5]])];
  const plain = evaluate(segs, { asOf: at(0, 20.5), config: { timeZone: TZ } });
  assert.equal(plain.violations.filter((v) => v.kind === 'WINDOW_14').length, 1);
  const s16 = evaluate(segs, { asOf: at(0, 20.5), config: { timeZone: TZ, sixteenHourShifts: [at(0, 6)] } });
  assert.equal(s16.violations.length, 0);
  assert.equal(s16.shift.limits.window, 16 * 60);
  assert.equal(s16.shift.limits.drive, 11 * 60, 'driving is NOT extended');
  assert.ok(!s16.shift.notes.some((n) => n.includes('not eligible')));
  // Claim it again 2 days later with no 34h restart → eligibility warning
  const two = [...segs, { status: 'OFF' as DutyStatus, start: at(0, 20.5), end: at(2, 6) }, ...log(2, 6, [['D', 10]])];
  const again = evaluate(two, { asOf: at(2, 10), config: { timeZone: TZ, sixteenHourShifts: [at(0, 6), at(2, 6)] } });
  assert.ok(again.shift.notes.some((n) => n.includes('not eligible')), 'warns: used within previous 6 days');
  // OFF 20:30 day0 → 06:00 day2 is 33.5h — not a restart. Make it 34h+ and the warning clears.
  const three = [...segs, { status: 'OFF' as DutyStatus, start: at(0, 20.5), end: at(2, 7) }, ...log(2, 7, [['D', 10]])];
  const ok = evaluate(three, { asOf: at(2, 10), config: { timeZone: TZ, sixteenHourShifts: [at(0, 6), at(2, 7)] } });
  assert.ok(!ok.shift.notes.some((n) => n.includes('not eligible')), '34.5h restart resets eligibility');
});

test('trip planner split strategy: uses a receiver OFF break as the short leg and a 7h sleeper instead of a 10h reset', () => {
  // Fresh at 06:00, 1000 mi at 55 mph, 3h OFF at the receiver at mile 450.
  const input = { departure: at(0, 6), distanceMiles: 1000, mph: 55, stops: [{ atMile: 450, minutes: 180, status: 'OFF' as const, label: 'Receiver (off duty)' }], config: { timeZone: TZ } };
  const both = planTripAll([fresh(0, 6)], input);
  assert.ok(both.reset10.feasible && both.split.feasible, [...both.reset10.warnings, ...both.split.warnings].join('; '));
  assert.equal(both.reset10.evaluation.violations.length, 0);
  assert.equal(both.split.evaluation.violations.length, 0);
  assert.ok(both.split.steps.some((s) => s.segment.status === 'SB'), 'split plan contains a sleeper period');
  assert.ok(!both.reset10.steps.some((s) => s.segment.status === 'SB'), 'reset plan does not');
  assert.ok(both.split.arrival <= both.reset10.arrival, `split ${both.split.arrival} should not be slower than reset ${both.reset10.arrival}`);
  // The sleeper the planner chose must actually pair: after it, clocks are anchored at the receiver break's end.
  const sb = both.split.steps.find((s) => s.segment.status === 'SB')!;
  const ev = evaluate([fresh(0, 6), ...both.split.steps.map((s) => s.segment)], { asOf: sb.segment.end + 1, config: { timeZone: TZ } });
  assert.equal(ev.shift.chain.length, 2);
});

test('trip planner split strategy opens a split when the driver has nothing to pair with', () => {
  // This assertion used to be "falls back to a 10h reset when nothing can pair" — which is exactly
  // what stress-test 2.7 reported as a defect: the "Sleeper splits" plan came out identical to the
  // reset plan for a fresh driver, and the UI then told him the rest strategy "makes no difference".
  // A split is the app's headline case, so the planner now opens one with a 7h sleeper long leg.
  const plan = planTrip([fresh(0, 6)], { departure: at(0, 6), distanceMiles: 1000, mph: 55, restStrategy: 'split', config: { timeZone: TZ } });
  assert.ok(plan.feasible);
  assert.ok(plan.steps.some((s) => s.reason.includes('opens a split')), 'the split plan should open a split, not fall back to a reset');
  assert.ok(!plan.steps.some((s) => s.reason.startsWith('10-hour reset')), 'no 10h reset should be needed');
  assert.equal(plan.evaluation.violations.length, 0);
});
