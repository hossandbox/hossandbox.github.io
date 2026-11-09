import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate, restPeriods, fmt, DEFAULT_CONFIG,
  type Segment,
} from '../src/index.ts';

const cfg = { ...DEFAULT_CONFIG, timeZone: 'America/Chicago' };

// ------------------------------------------------------------------ break #11: fmt
// Fractional minutes reach fmt through violation amounts computed from imported rows.
// The remainder was rounded independently of the hours, so 119.7 printed as "1h 60m".

test('fmt: a fractional remainder never prints as 60m', () => {
  assert.equal(fmt(119.7), '2h 00m');
  assert.equal(fmt(239.6), '4h 00m');
  assert.equal(fmt(59.6), '1h 00m');
  assert.equal(fmt(89.4), '1h 29m');
});

test('fmt: whole minutes are unchanged', () => {
  assert.equal(fmt(45), '45m');
  assert.equal(fmt(60), '1h 00m');
  assert.equal(fmt(600), '10h 00m');
  assert.equal(fmt(0), '0m');
  assert.equal(fmt(Infinity), '∞');
});

// ------------------------------------------------------------------ break #12
// A future what-if row must not convert the trailing unlogged time in front of it
// into a rest: the same record with no plan after it reads that hole as nothing.

test('a future what-if row does not turn trailing unlogged time into a reset', () => {
  const N = 2_000_000;
  const segs: Segment[] = [
    { status: 'OFF', start: N - 1500, end: N - 900 },
    { status: 'D', start: N - 900, end: N - 600 },
  ];
  const plain = evaluate(segs, { asOf: N, config: cfg });
  assert.equal(plain.shift.driveRemaining, 360);
  assert.equal(plain.shift.windowRemaining, 0);
  assert.equal(plain.driveNow, 0);
  const withIf = evaluate([...segs, { status: 'SB', start: N + 1, end: N + 120, tentative: true }], { asOf: N, config: cfg });
  assert.equal(withIf.shift.driveRemaining, plain.shift.driveRemaining);
  assert.equal(withIf.shift.windowRemaining, plain.shift.windowRemaining);
  assert.equal(withIf.driveNow, plain.driveNow);
});

test('restPeriods: a gap in front of a what-if row is not rest', () => {
  const rests = restPeriods([
    { status: 'OFF', start: 0, end: 600 },
    { status: 'D', start: 600, end: 900 },
    { status: 'SB', start: 1501, end: 1620, tentative: true },
  ]);
  // The hole 900→1501 is covered by no rest period; the only reset is the logged one.
  assert.equal(rests.filter((r) => r.isReset).length, 1);
  assert.ok(rests.every((r) => r.end <= 900 || r.start >= 1501));
});

test('restPeriods: a gap between two logged rest rows still merges into the rest', () => {
  const rests = restPeriods([
    { status: 'OFF', start: 0, end: 300 },
    { status: 'SB', start: 400, end: 1000 },
  ]);
  assert.equal(rests.length, 1);
  assert.equal(rests[0].start, 0);
  assert.equal(rests[0].end, 1000);
  assert.equal(rests[0].isReset, true);
});

test('restPeriods: a gap in front of a logged row still merges into the rest', () => {
  const rests = restPeriods([
    { status: 'OFF', start: 0, end: 300 },
    { status: 'D', start: 2000, end: 2300 },
  ]);
  // The rest runs 0→2000 (the hole reads as off duty before logged work), as before.
  assert.equal(rests.length, 1);
  assert.equal(rests[0].end, 2000);
  assert.equal(rests[0].isReset, true);
});
