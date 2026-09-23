import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, planTripAll } from '../src/index.ts';
import type { Segment } from '../src/types.ts';

/** consumer-review-2 (GPT 6 Astra, 2026-09-22). Times are America/Chicago (CDT, UTC-5). */
const M = (iso: string) => Math.floor(new Date(iso).getTime() / 60000);
const CFG = { timeZone: 'America/Chicago', cycle: '70/8' as const };

const now = M('2026-09-22T17:00:00Z');        // 12:00 CDT — driver goes On Duty at the shipper
const departure = M('2026-09-22T20:00:00Z');  // 15:00 CDT pickup
const history: Segment[] = [
  { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') }, // 20:00→06:00 CDT (10h reset)
  { status: 'D', start: M('2026-09-22T11:00:00Z'), end: now },                          // 06:00→12:00 CDT
];
const trip = (until: { from: number; status: 'OFF' | 'SB' | 'ON'; label?: string }) =>
  planTripAll(history, { departure, distanceMiles: 550, mph: 55, preTripMinutes: 0, config: CFG, untilDeparture: until });

test('trip planner: waiting at the shipper ON DUTY earns no rest credit', () => {
  const both = trip({ from: now, status: 'ON', label: 'On duty until departure' });
  const first = both.split.steps[0];
  assert.equal(first.segment.status, 'ON', 'the wait is a visible row, not an unlogged gap');
  assert.equal(first.segment.start, now);
  assert.equal(first.segment.end, departure);
  assert.match(first.reason, /assumed, not logged/, 'the row is labelled as an assumption');
  assert.ok(!both.split.steps.some((s) => /pairs with/.test(s.reason)), 'no split leg can be built out of the wait');
  assert.equal(both.split.arrival, both.reset10.arrival, 'with the bogus rest gone the split plan has no advantage');
});

test('trip planner: an explicitly logged OFF-duty wait IS a legitimate split leg', () => {
  const both = trip({ from: now, status: 'OFF', label: 'Off duty until departure' });
  assert.equal(both.split.steps[0].segment.status, 'OFF');
  assert.ok(both.split.steps.some((s) => /pairs with/.test(s.reason)), 'a real off-duty period may pair');
  assert.ok(both.split.arrival < both.reset10.arrival, 'that is exactly where the split gains time');
});

test('trip planner: departing now adds no pre-departure row', () => {
  const both = planTripAll(history, {
    departure: now, distanceMiles: 550, mph: 55, preTripMinutes: 0, config: CFG,
    untilDeparture: { from: now, status: 'ON' },
  });
  assert.ok(!/until departure/.test(both.split.steps[0].reason));
});

test('driver-facing wording: no enum ids in plan text and no UTC stamp in violations', () => {
  const both = trip({ from: now, status: 'ON', label: 'On duty until departure' });
  const text = [...both.split.steps, ...both.reset10.steps].map((s) => s.reason).join(' | ');
  assert.ok(!/DRIVE_11|WINDOW_14|BREAK_30|\bCYCLE\b/.test(text), `internal enum leaked into itinerary copy: ${text}`);

  // 06:00 on duty, then a 12-hour drive: trips both the 11 and the 14.
  const long: Segment[] = [
    { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') },
    { status: 'ON', start: M('2026-09-22T11:00:00Z'), end: M('2026-09-22T13:00:00Z') },
    { status: 'D', start: M('2026-09-22T13:00:00Z'), end: M('2026-09-23T03:00:00Z') }, // 08:00→22:00 CDT
  ];
  const ev = evaluate(long, { asOf: M('2026-09-23T03:00:00Z'), config: CFG });
  const details = ev.violations.map((v) => v.detail).join(' | ');
  assert.ok(ev.violations.some((v) => v.kind === 'WINDOW_14'), 'scenario should produce a window violation');
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(details), `ISO/UTC timestamp leaked into driver copy: ${details}`);
});