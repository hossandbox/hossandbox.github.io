/**
 * Round 4: "when can I drive again?" — driveAgainAt().
 *
 * Reported by a driver: after a 14-hour day, nothing on screen said when he could drive again, and
 * tapping On duty after 6 hours off reset the only rest number on screen without saying the rest had
 * ended. The answer comes from the engine itself, so these tests pin it against the rules for every
 * kind of limit, including the case where driving time comes back, disappears, and comes back again
 * within one rest (C3) — the case that defeated a plain binary search.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, driveAgainAt } from '../src/index.ts';
import type { Segment } from '../src/index.ts';

const cfg = { cycle: '70/8', dayStartHour: 0, timeZone: 'America/Chicago', shortHaul: false } as const;
const T = Math.floor(Date.UTC(2026, 9, 3, 19, 0) / 60000); // 2026-10-03 14:00 Chicago
const seg = (status: Segment['status'], start: number, end: number, tentative = false): Segment => ({ status, start, end, ...(tentative ? { tentative } : {}) });
const after = (segs: Segment[], asOf: number, rest: 'OFF' | 'SB' = 'OFF') => {
  const r = driveAgainAt(segs, { asOf, config: cfg }, rest);
  return r === null ? null : r - asOf;
};
/** Ground truth: the first minute of an unbroken rest from asOf with driving time, by brute force. */
const scan = (segs: Segment[], asOf: number, rest: 'OFF' | 'SB' = 'OFF') => {
  for (let d = 1; d <= 36 * 60; d++) if (evaluate([...segs, seg(rest, asOf, asOf + d)], { asOf: asOf + d, config: cfg }).driveNow > 0) return d;
  return null;
};

// The reviewer's day: a full 14-hour day ending 6 hours before T.
const day: Segment[] = [
  seg('OFF', T - 2400, T - 1200), seg('ON', T - 1200, T - 1140), seg('D', T - 1140, T - 840),
  seg('OFF', T - 840, T - 810), seg('D', T - 810, T - 450), seg('ON', T - 450, T - 360),
];

test('C1 reviewer: 6h into the rest after a 14-hour day, driving comes back at 10h — 4h from now', () => {
  assert.equal(after(day, T), 240);
});

test('C2 reviewer: going on duty after 6h off ends that rest — a fresh 10h from the next rest', () => {
  const segs = [...day, seg('OFF', T - 360, T), seg('ON', T, T + 45)];
  assert.equal(after(segs, T + 45), 600);
  // ...but the 6h can still be the short half of a split: 7h in the sleeper completes it.
  assert.equal(after(segs, T + 45, 'SB'), 420);
});

test('C3 driving comes back at 30 min, vanishes when the window runs out, returns at 10h — the answer is 30 min', () => {
  const segs = [seg('OFF', T - 1080, T - 480), seg('D', T - 480, T)]; // 8h straight, no break
  const rest = (d: number) => evaluate([...segs, seg('OFF', T, T + d)], { asOf: T + d, config: cfg }).driveNow;
  assert.equal(rest(29), 0, 'no break yet');
  assert.ok(rest(30) > 0, 'the 30-min break restores driving');
  assert.equal(rest(360), 0, 'the 14-hour window runs out while resting');
  assert.ok(rest(600) > 0, 'a 10-hour rest restores it');
  assert.equal(after(segs, T), 30, 'earliest is the break, not the 10-hour rest');
});

test('C4 a sleeper split completing early is found (8h SB earlier, 2h now)', () => {
  const segs = [seg('OFF', T - 2000, T - 1400), seg('D', T - 1400, T - 1100), seg('SB', T - 1100, T - 620), seg('D', T - 620, T - 260), seg('ON', T - 260, T)];
  assert.equal(evaluate(segs, { asOf: T, config: cfg }).driveNow, 0);
  assert.equal(after(segs, T), 120);
  assert.equal(after(segs, T, 'SB'), 120);
});

test('C5 out of 70 hours: matches a minute-by-minute scan', () => {
  const segs: Segment[] = [];
  for (let d = 7; d >= 0; d--) { const s0 = T - d * 1440 - 525; segs.push(seg('OFF', s0 - 915, s0), seg('ON', s0, s0 + 525)); }
  assert.equal(evaluate(segs, { asOf: T, config: cfg }).binding, 'CYCLE');
  assert.equal(after(segs, T), scan(segs, T));
});

test('C6 already able to drive → now; tentative plan rows are ignored', () => {
  assert.equal(after([seg('OFF', T - 600, T)], T), 0);
  assert.equal(after([...day, seg('D', T, T + 60, true)], T), 240);
});

test('C7 random records: identical to a minute-by-minute scan, OFF and sleeper', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <X,>(a: readonly X[]) => a[Math.floor(rnd() * a.length)];
  let checked = 0;
  for (let k = 0; k < 40 && checked < 10; k++) {
    let t = T - 3000; const segs: Segment[] = []; const add = (st: Segment['status'], d: number) => { segs.push(seg(st, t, t + d)); t += d; };
    add('OFF', 600);
    for (let i = 0, m = 3 + Math.floor(rnd() * 6); i < m; i++) {
      const st = pick(['D', 'D', 'D', 'SB', 'OFF', 'ON'] as const);
      add(st, 60 * pick(st === 'D' ? [2, 3, 4, 5] : st === 'SB' ? [2, 3, 7, 8] : st === 'OFF' ? [0.5, 2, 3] : [0.5, 1]));
    }
    if (evaluate(segs, { asOf: t, config: cfg }).driveNow > 0) continue;
    const rest = pick(['OFF', 'SB'] as const);
    assert.equal(after(segs, t, rest), scan(segs, t, rest), `record ${k} (${rest})`);
    checked++;
  }
  assert.ok(checked >= 5, `only ${checked} out-of-hours records generated`);
});
