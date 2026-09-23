import test from 'node:test';
import assert from 'node:assert/strict';
import { planTrip, planTripAll } from '../src/index.ts';
import type { Segment } from '../src/types.ts';

/** consumer-review-3 findings 1 and 3. Times are America/Chicago (CDT, UTC-5). */
const M = (iso: string) => Math.floor(new Date(iso).getTime() / 60000);
const CFG70 = { timeZone: 'America/Chicago', cycle: '70/8' as const };
const CFG60 = { timeZone: 'America/Chicago', cycle: '60/7' as const };

// --- finding 3: compare the recap wait against a 34-hour restart -----------------------------
// Reviewer's scenario: 60/7, 3000 mi at 40 mph, off duty until a 15:00 departure.
const now = M('2026-09-23T17:00:00Z'); // Sep 23 12:00 CDT
const history: Segment[] = [
  { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }, // 20:00→06:00 tomorrow's reset
  { status: 'D', start: M('2026-09-23T11:00:00Z'), end: now },                          // 06:00→12:00
];
const longHaul = () => planTripAll(history, {
  departure: M('2026-09-23T20:00:00Z'), distanceMiles: 3000, mph: 40, preTripMinutes: 0,
  config: CFG60, untilDeparture: { from: now, status: 'OFF', label: 'Off duty until departure' },
});

test('trip planner: a 34-hour restart is offered as an alternative to waiting for recap', () => {
  const all = longHaul();
  const recap = all.reset10.steps.find((s) => /recap/i.test(s.reason));
  const restart = all.restart34.steps.find((s) => /34-hour restart/i.test(s.reason));
  assert.ok(recap, 'the reset plan should wait for recap hours');
  assert.ok(restart, 'the restart plan should take a 34-hour restart instead');
  assert.equal(restart.segment.end - restart.segment.start, 34 * 60, 'a restart is a full 34 consecutive hours');
  assert.equal(recap.segment.end - recap.segment.start, 47 * 60, 'the reviewer measured a 47h recap wait');
  assert.equal(
    (recap.segment.end - recap.segment.start) - (restart.segment.end - restart.segment.start),
    13 * 60,
    'the restart saves the 13 hours the review flagged',
  );
  assert.ok(all.restart34.arrival < all.reset10.arrival, 'the restart arrives sooner');
  assert.equal(all.faster, 'restart34', 'the restart is the fastest option here');
});

test('trip planner: when the cycle is not the binding limit the restart plans match the reset', () => {
  const all = planTripAll(history, {
    departure: M('2026-09-23T20:00:00Z'), distanceMiles: 300, mph: 40, preTripMinutes: 0, config: CFG60,
    untilDeparture: { from: now, status: 'OFF', label: 'Off duty until departure' },
  });
  assert.equal(all.restart34.arrival, all.reset10.arrival, 'no cycle wait means the restart plans the same itinerary');
  assert.notEqual(all.faster, 'restart34', 'a restart that is never taken cannot be the winner');
});

// --- finding 1: a stop beyond the destination -------------------------------------------------
test('trip planner: a stop past the destination is reported, not silently dropped', () => {
  const p = planTrip(history, {
    departure: now, distanceMiles: 550, mph: 55, preTripMinutes: 0, config: CFG70,
    stops: [{ atMile: 2500, minutes: 120, status: 'ON', label: 'Receiver' }],
  });
  assert.ok(!p.steps.some((s) => s.reason === 'Receiver'), 'an unreachable stop is not in the itinerary');
  assert.ok(p.warnings.some((w) => /past the 550-mile destination/.test(w)), `expected a warning, got: ${JSON.stringify(p.warnings)}`);
});

test('trip planner: a stop exactly at the destination IS in the plan', () => {
  const p = planTrip(history, {
    departure: now, distanceMiles: 550, mph: 55, preTripMinutes: 0, config: CFG70,
    stops: [{ atMile: 550, minutes: 120, status: 'ON', label: 'Receiver' }],
  });
  assert.ok(p.steps.some((s) => s.reason === 'Receiver'), 'unloading on arrival is a real stop');
  assert.equal(p.warnings.length, 0, 'and it needs no warning');
});