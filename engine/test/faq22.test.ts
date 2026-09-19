import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, localToMinute, type Segment, type DutyStatus } from '../src/index.ts';

const TZ = 'America/Chicago';
const DAY0 = localToMinute(2026, 9, 14, 0, TZ);
const at = (d: number, h: number) => DAY0 + d * 1440 + Math.round(h * 60);
function log(day: number, startHour: number, parts: [DutyStatus, number][]): Segment[] {
  const out: Segment[] = []; let cur = at(day, startHour);
  for (const [status, endH] of parts) { const end = at(day, endH); out.push({ status, start: cur, end }); cur = end; }
  return out;
}

// FMCSA-HOS-2020-395-FAQ22 (effective 2026-07-01): a 10-consecutive-hour rest that includes 7 consecutive
// hours in the sleeper berth may EITHER reset the 11/14 OR be paired with a later ≥2h off-duty/SB period,
// whichever is most advantageous to the driver.
// Day: D 06-10:30 (4.5h) · OFF 10:30-12:30 (2h lunch) · ON 12:30-14 · D 14-20:30 (6.5h) → 11h driving,
// 14.5h wall-clock window. Without pairing: 30-min WINDOW_14 violation. Pairing the reset with the lunch
// excludes the lunch → 12.5h window, legal.
const day: [DutyStatus, number][] = [['D', 10.5], ['OFF', 12.5], ['ON', 14], ['D', 20.5]];

test('FAQ 22: a 10h SLEEPER reset may pair with a later 2h break — lunch excluded from the 14', () => {
  const segs = [{ status: 'SB' as DutyStatus, start: at(0, -4), end: at(0, 6) }, ...log(0, 6, day)];
  const ev = evaluate(segs, { asOf: at(0, 20.5), config: { timeZone: TZ } });
  assert.equal(ev.violations.length, 0, 'compliant via reset-as-first-leg pairing');
  assert.equal(ev.shift.chain.length, 2);
  assert.equal(ev.shift.chain[0].isReset, true, 'first leg is the opening sleeper reset');
  assert.equal(ev.shift.anchor, at(0, 6), 'anchor stays at shift start (end of the first leg)');
  assert.equal(ev.shift.windowUsed, 12.5 * 60);
  assert.equal(ev.shift.driveUsed, 11 * 60);
  assert.ok(ev.candidates >= 2, 'both the reset-only and reset+lunch interpretations were considered');
});

test('FAQ 22 does NOT extend to a pure OFF-duty reset (no 7h sleeper) — lunch still counts', () => {
  const segs = [{ status: 'OFF' as DutyStatus, start: at(0, -4), end: at(0, 6) }, ...log(0, 6, day)];
  const ev = evaluate(segs, { asOf: at(0, 20.5), config: { timeZone: TZ } });
  assert.deepEqual(ev.violations.map((v) => v.kind), ['WINDOW_14']);
  assert.equal(ev.violations[0].minutes, 30);
  assert.equal(ev.shift.chain.length, 0);
});

test('FAQ 22 pairing cannot restore driving time — the 11 still counts from shift start', () => {
  // Same day but drive 12h total: pairing helps the 14, not the 11.
  const segs = [{ status: 'SB' as DutyStatus, start: at(0, -4), end: at(0, 6) }, ...log(0, 6, [['D', 11], ['OFF', 13], ['D', 20]])];
  const ev = evaluate(segs, { asOf: at(0, 20), config: { timeZone: TZ } });
  const kinds = new Set(ev.violations.map((v) => v.kind));
  assert.ok(kinds.has('DRIVE_11'), '5 + 7 = 12h driving is over the 11 regardless of pairing');
  assert.ok(!kinds.has('WINDOW_14'), '06→20 is 14h with the 2h lunch excluded = 12h: fine');
});

test('FAQ 22 chains: reset+lunch, then lunch+7h sleeper moves the anchor to the lunch end', () => {
  // SB reset → D 06-10 → OFF 10-13 (3h; 2h would need an 8h sleeper) → D 13-17 → SB 17-24 → evaluate at midnight
  const segs = [{ status: 'SB' as DutyStatus, start: at(0, -4), end: at(0, 6) }, ...log(0, 6, [['D', 10], ['OFF', 13], ['D', 17], ['SB', 24]])];
  const ev = evaluate(segs, { asOf: at(1, 0), config: { timeZone: TZ } });
  assert.equal(ev.violations.length, 0);
  assert.equal(ev.shift.anchor, at(0, 13), 'latest completed pair is (lunch, sleeper) → anchor at lunch end');
  assert.equal(ev.shift.driveRemaining, 7 * 60, '11 − 4 driven between lunch and sleeper');
  assert.equal(ev.shift.windowRemaining, 10 * 60, '14 − 4');
});
