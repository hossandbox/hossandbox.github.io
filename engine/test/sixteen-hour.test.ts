/**
 * §395.1(o)(3), QA report M5: "The driver has not taken this exemption within the previous 6 consecutive
 * days, except when the driver has begun a new 7- or 8-consecutive day period with the beginning of any
 * off-duty period of 34 or more consecutive hours." Days are carrier days (§395.2), so the look-back is
 * the current carrier day plus the 6 before it. The old check used a rolling 144 hours, which let a
 * Monday use be claimed again on Sunday — and an ineligible claim still extended the window to 16h.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, localToMinute } from '../src/index.ts';
import type { Segment } from '../src/index.ts';

const TZ = 'America/Chicago';
const L = (y: number, m: number, d: number, h: number) => localToMinute(y, m, d, h, TZ);
type Day = [number, number, number, number]; // y, m, d, local start hour

/** One shift per day (ON 2h, D 6h, ON 2h = 10h), off duty in between; 12h off before the first. */
function week(days: Day[], last?: (start: number) => Segment[]): { segs: Segment[]; lastStart: number } {
  const segs: Segment[] = [];
  let prevEnd = L(...days[0]) - 720;
  days.forEach(([y, m, d, h], i) => {
    const s = L(y, m, d, h);
    segs.push({ status: 'OFF', start: prevEnd, end: s });
    const rows: Segment[] = i === days.length - 1 && last ? last(s)
      : [{ status: 'ON', start: s, end: s + 120 }, { status: 'D', start: s + 120, end: s + 480 }, { status: 'ON', start: s + 480, end: s + 600 }];
    segs.push(...rows);
    prevEnd = rows[rows.length - 1].end;
  });
  return { segs, lastStart: L(...days[days.length - 1]) };
}
const eligibleAt = (segs: Segment[], asOf: number, keys: number[], dayStartHour = 0) => {
  const ev = evaluate(segs, { asOf, config: { timeZone: TZ, dayStartHour, sixteenHourShifts: keys } });
  const warned = ev.shift.notes.some((n) => n.includes('not eligible'));
  assert.equal(ev.shift.limits.window, warned ? 14 * 60 : 16 * 60, 'the window must agree with the eligibility note');
  return !warned;
};

// Mon 2026-09-28 … Sun 2026-10-04, daily shifts, no 34h rest anywhere.
const monToSun: Day[] = [[2026, 9, 28, 6], [2026, 9, 29, 6], [2026, 9, 30, 6], [2026, 10, 1, 6], [2026, 10, 2, 6], [2026, 10, 3, 6], [2026, 10, 4, 7]];

test('M5: used Monday 06:00, claimed again Sunday 07:00 → not eligible (a rolling 144h said eligible)', () => {
  const { segs, lastStart } = week(monToSun);
  const mon = L(2026, 9, 28, 6), sun = L(2026, 10, 4, 7);
  assert.ok(sun - mon > 6 * 1440, 'the old rolling check would have allowed it');
  assert.equal(eligibleAt(segs, lastStart + 180, [mon, sun]), false);
});

test('M5: the following Monday is allowed again (Monday has left the look-back)', () => {
  const { segs, lastStart } = week([...monToSun, [2026, 10, 5, 6]]);
  assert.equal(eligibleAt(segs, lastStart + 180, [L(2026, 9, 28, 6), L(2026, 10, 5, 6)]), true);
});

test('M5: a use is dated by its shift start, not by a key stored in the rest the evening before', () => {
  // Monday's shift was flagged at Sun 23:00, inside the 12h rest that opened it. Dated by the key it would
  // fall on Sunday 27th — outside Sunday 4th's look-back — and the claim would wrongly pass.
  const { segs, lastStart } = week(monToSun);
  const keyInRest = L(2026, 9, 27, 23);
  const first = evaluate(segs, { asOf: L(2026, 9, 28, 9), config: { timeZone: TZ, sixteenHourShifts: [keyInRest] } });
  assert.equal(first.shift.limits.window, 16 * 60, 'the key in the rest flags Monday’s shift');
  assert.equal(eligibleAt(segs, lastStart + 180, [keyInRest, L(2026, 10, 4, 7)]), false);
});

test('M5: the carrier day start is honoured (noon vs midnight changes the answer)', () => {
  // Used Sun 27th 11:00; claimed Sat 3rd 13:00.
  //  - midnight days: look-back from Sat 3rd reaches Sun 27th 00:00 → the 11:00 use counts → not eligible
  //  - noon days:     Sat 13:00 is in the "Sat 3rd noon" day; look-back starts Sun 27th 12:00 → 11:00 is out
  const days: Day[] = [[2026, 9, 27, 11], [2026, 9, 28, 11], [2026, 9, 29, 11], [2026, 9, 30, 11], [2026, 10, 1, 11], [2026, 10, 2, 11], [2026, 10, 3, 13]];
  const { segs, lastStart } = week(days);
  const keys = [L(2026, 9, 27, 11), L(2026, 10, 3, 13)];
  assert.equal(eligibleAt(segs, lastStart + 180, keys, 0), false, 'midnight carrier days');
  assert.equal(eligibleAt(segs, lastStart + 180, keys, 12), true, 'noon carrier days');
});

test('M5: across the fall-back time change (Nov 1, 2026), still counted in carrier days', () => {
  const days: Day[] = [[2026, 10, 26, 6], [2026, 10, 27, 6], [2026, 10, 28, 6], [2026, 10, 29, 6], [2026, 10, 30, 6], [2026, 10, 31, 6], [2026, 11, 1, 7]];
  const { segs, lastStart } = week(days);
  const mon = L(2026, 10, 26, 6), sun = L(2026, 11, 1, 7);
  assert.equal(sun - mon, 6 * 1440 + 120, 'six days and two hours apart, counting the extra hour');
  assert.equal(eligibleAt(segs, lastStart + 180, [mon, sun]), false);
  const next = week([...days, [2026, 11, 2, 6]]);
  assert.equal(eligibleAt(next.segs, next.lastStart + 180, [mon, L(2026, 11, 2, 6)]), true);
});

test('M5: a 34-hour restart after the last use makes it available again', () => {
  // Used Mon 28th; Wed 30th 16:00 → Fri 2nd 06:00 is 38h off; claimed Fri 2nd.
  const days: Day[] = [[2026, 9, 28, 6], [2026, 9, 29, 6], [2026, 9, 30, 6], [2026, 10, 2, 6]];
  const { segs, lastStart } = week(days);
  assert.equal(eligibleAt(segs, lastStart + 180, [L(2026, 9, 28, 6), L(2026, 10, 2, 6)]), true);
  const noRestart = week([[2026, 9, 28, 6], [2026, 9, 29, 6], [2026, 9, 30, 6], [2026, 10, 1, 6], [2026, 10, 2, 6]]);
  assert.equal(eligibleAt(noRestart.segs, noRestart.lastStart + 180, [L(2026, 9, 28, 6), L(2026, 10, 2, 6)]), false);
});

test('M5: an ineligible claim does not extend the window — driving in hour 15 is a violation', () => {
  // Last shift: ON 2h, D 5h, ON 6h, D 2h → driving from 13h to 15h after coming on duty.
  const long = (s: number): Segment[] => [
    { status: 'ON', start: s, end: s + 120 }, { status: 'D', start: s + 120, end: s + 420 },
    { status: 'ON', start: s + 420, end: s + 780 }, { status: 'D', start: s + 780, end: s + 900 },
  ];
  const { segs, lastStart } = week(monToSun, long);
  const mon = L(2026, 9, 28, 6), sun = L(2026, 10, 4, 7);
  const run = (keys: number[]) => evaluate(segs, { asOf: lastStart + 900, config: { timeZone: TZ, sixteenHourShifts: keys } })
    .violations.filter((v) => v.kind === 'WINDOW_14' && v.start >= lastStart);
  assert.equal(run([sun]).length, 0, 'eligible: 16h window, no violation');
  const ineligible = run([mon, sun]);
  assert.equal(ineligible.length, 1, 'not eligible: the 14-hour window applies');
  assert.equal(ineligible[0].minutes, 60);
});

test('re-check N4: a refused claim is not a use, so it does not block the next legitimate one', () => {
  // Mon 28th used; Thu 1st claimed and correctly refused (Monday is 3 days back); Mon 5th claimed.
  // Monday 28th has left Monday 5th's look-back, and Thursday was never taken, so Monday 5th is eligible.
  const { segs, lastStart } = week([...monToSun, [2026, 10, 5, 6]]);
  const mon = L(2026, 9, 28, 6), thu = L(2026, 10, 1, 6), next = L(2026, 10, 5, 6);
  assert.equal(eligibleAt(segs, thu + 180, [mon, thu]), false, 'Thursday is refused');
  assert.equal(eligibleAt(segs, lastStart + 180, [mon, thu, next]), true, 'the refused Thursday must not block Monday 5th');
  // …but an ELIGIBLE use in between still blocks: drop Monday 28th and Thursday becomes a real use
  assert.equal(eligibleAt(segs, lastStart + 180, [thu, next]), false, 'an eligible Thursday use blocks Monday 5th');
});
