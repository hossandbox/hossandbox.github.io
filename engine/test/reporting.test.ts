import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, planTrip } from '../src/index.ts';
import type { Segment } from '../src/types.ts';

/** consumer-review-6: what the engine reports must not mislead the UI. Times are America/Chicago. */
const M = (iso: string) => Math.floor(new Date(iso).getTime() / 60000);
const CFG = { timeZone: 'America/Chicago', cycle: '70/8' as const };

test('trip planner: driveEnd is the wheels-stop time, arrival includes any trailing dwell', () => {
  const history: Segment[] = [
    { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }, // 20:00→06:00
    { status: 'D', start: M('2026-09-23T11:00:00Z'), end: M('2026-09-23T15:00:00Z') },   // 06:00→10:00
  ];
  const p = planTrip(history, {
    departure: M('2026-09-23T15:00:00Z'), distanceMiles: 200, mph: 55, preTripMinutes: 0, config: CFG,
    stops: [{ atMile: 200, minutes: 120, status: 'ON', label: 'Receiver' }],
  });
  assert.ok(p.steps.some((s) => s.reason === 'Receiver'), 'the receiver stop should be in the plan');
  assert.equal(p.arrival - p.driveEnd, 120, 'arrival is two hours after the wheels stop');
});

test('trip planner: with no trailing dwell, arrival and driveEnd agree', () => {
  const history: Segment[] = [
    { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') },
    { status: 'D', start: M('2026-09-23T11:00:00Z'), end: M('2026-09-23T15:00:00Z') },
  ];
  const p = planTrip(history, { departure: M('2026-09-23T15:00:00Z'), distanceMiles: 200, mph: 55, preTripMinutes: 0, config: CFG });
  assert.equal(p.arrival, p.driveEnd);
});

test('violations from a logged segment are not flagged tentative', () => {
  const real: Segment[] = [
    { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') }, // 10h reset
    { status: 'D', start: M('2026-09-23T11:00:00Z'), end: M('2026-09-24T01:00:00Z') },   // 14h driving
  ];
  const ev = evaluate(real, { asOf: M('2026-09-24T01:00:00Z'), config: CFG });
  const drive = ev.violations.filter((v) => v.kind === 'DRIVE_11');
  assert.ok(drive.length > 0, 'a 14-hour drive should breach the 11');
  assert.ok(drive.every((v) => !v.tentative), 'duty the driver logged is not hypothetical');
});

test('the same violation is flagged tentative when the segment is a what-if row', () => {
  const hypothetical: Segment[] = [
    { status: 'OFF', start: M('2026-09-23T01:00:00Z'), end: M('2026-09-23T11:00:00Z') },
    { status: 'D', start: M('2026-09-23T11:00:00Z'), end: M('2026-09-24T01:00:00Z'), tentative: true },
  ];
  const ev = evaluate(hypothetical, { asOf: M('2026-09-24T01:00:00Z'), config: CFG });
  const drive = ev.violations.filter((v) => v.kind === 'DRIVE_11');
  assert.ok(drive.length > 0);
  assert.ok(drive.every((v) => v.tentative), 'a plan must never be reported as a violation already committed');
});