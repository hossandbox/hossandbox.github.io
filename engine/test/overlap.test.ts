import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, LIMITS } from '../src/index.ts';
import { normalize } from '../src/timeline.ts';
import type { Segment } from '../src/types.ts';

/** consumer-review-1 (GPT 6 Astra, 2026-09-22). Times are America/Chicago (CDT, UTC-5). */
const M = (isoUtc: string) => Math.floor(new Date(isoUtc).getTime() / 60000);
const CFG = { timeZone: 'America/Chicago' };
const mins = (segs: Segment[]) => segs.reduce((a, s) => a + (s.end - s.start), 0);

test('overlap: an off-duty entry inside a driving entry SPLITS it — the tail is not deleted', () => {
  const off: Segment = { status: 'OFF', start: M('2026-09-22T01:00:00Z'), end: M('2026-09-22T11:00:00Z') }; // 20:00→06:00 CDT
  const drive: Segment = { status: 'D', start: M('2026-09-22T11:00:00Z'), end: M('2026-09-22T17:00:00Z') }; // 06:00→12:00 CDT
  const brk: Segment = { status: 'OFF', start: M('2026-09-22T13:00:00Z'), end: M('2026-09-22T14:00:00Z') };   // 08:00→09:00 CDT

  const n = normalize([off, drive, brk]);
  const driving = n.filter((s) => s.status === 'D');
  assert.equal(driving.length, 2, 'the drive is split in two around the break');
  assert.deepEqual(driving.map((s) => s.end - s.start), [120, 180], '06:00–08:00 and 09:00–12:00 CDT');
  assert.equal(mins(driving), 300, 'five hours of driving remain, not two');

  const ev = evaluate([off, drive, brk], { asOf: M('2026-09-22T17:00:00Z'), config: CFG });
  assert.equal(ev.shift.driveUsed, 300);
  assert.equal(ev.shift.driveRemaining, LIMITS.DRIVE - 300, 'driving left is 6h, not 9h');
  assert.equal(ev.cycle.remaining, LIMITS.CYCLE_70_8 - 300, 'cycle left is 65h, not 68h');
});

test('overlap: a later entry wins only over the range it covers', () => {
  const a: Segment = { status: 'D', start: 0, end: 600 };
  const b: Segment = { status: 'OFF', start: 120, end: 240 };
  const n = normalize([a, b]);
  assert.deepEqual(n.map((s) => [s.status, s.start, s.end]), [['D', 0, 120], ['OFF', 120, 240], ['D', 240, 600]]);
});

test('overlap: a later entry fully covering an earlier one replaces it', () => {
  const a: Segment = { status: 'D', start: 0, end: 300 };
  const b: Segment = { status: 'OFF', start: 0, end: 600 };
  const n = normalize([a, b]);
  assert.deepEqual(n.map((s) => [s.status, s.start, s.end]), [['OFF', 0, 600]]);
});

test('overlap: re-stating the same range with the same status does not split it', () => {
  const a: Segment = { status: 'D', start: 0, end: 600 };
  const b: Segment = { status: 'D', start: 120, end: 240 };
  const n = normalize([a, b]);
  assert.deepEqual(n.map((s) => [s.status, s.start, s.end]), [['D', 0, 600]], 'same status merges back into one run');
});

test('overlap: a later entry is clipped by an entry that starts before it', () => {
  // s starts inside p but extends past p's end: p keeps its head, s keeps its tail.
  const p: Segment = { status: 'OFF', start: 0, end: 300 };
  const s: Segment = { status: 'D', start: 120, end: 480 };
  const n = normalize([p, s]);
  assert.deepEqual(n.map((x) => [x.status, x.start, x.end]), [['OFF', 0, 120], ['D', 120, 480]]);
});