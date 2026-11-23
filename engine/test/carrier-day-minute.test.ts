import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  carrierDayStart,
  nextCarrierDayStart,
  dayLabel,
  localToMinute,
  type Segment,
  type RulesConfig,
} from '../src/index.ts';

const TZ = 'America/Chicago';

function localHM(minute: number, tz = TZ): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('hour')}:${get('minute')}`;
}

function localYMDHM(minute: number, tz = TZ): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

test('(a) boundary at 18:40: segment ending 18:39 vs starting 18:40 land in different carrier days, and recap drops off at 18:40', () => {
  const cfg = {
    cycle: '70/8' as const,
    dayStartHour: 18,
    dayStartMinute: 40,
    timeZone: TZ,
    shortHaul: false,
  } as RulesConfig;

  const sep14_1800 = localToMinute(2026, 9, 14, 18, TZ);
  const sep14_1839 = sep14_1800 + 39;
  const sep14_1840 = sep14_1800 + 40;
  const sep14_1900 = localToMinute(2026, 9, 14, 19, TZ);

  // Carrier day containing 18:39 is Sep 13 18:40 -> Sep 14 18:40; containing 18:40 is Sep 14 18:40 -> Sep 15 18:40
  const startBefore = carrierDayStart(sep14_1839, cfg);
  const startAt = carrierDayStart(sep14_1840, cfg);
  assert.notEqual(startBefore, startAt, '18:39 and 18:40 must belong to different carrier days');
  assert.equal(localYMDHM(startBefore), '2026-09-13 18:40');
  assert.equal(localYMDHM(startAt), '2026-09-14 18:40');
  assert.equal(startAt - startBefore, 1440);
  assert.equal(nextCarrierDayStart(startBefore, cfg), startAt);
  assert.equal(dayLabel(startBefore, cfg), '2026-09-13');
  assert.equal(dayLabel(startAt, cfg), '2026-09-14');

  // Segment ending 18:39 vs segment starting 18:40 land in different cycle days
  const segBefore: Segment = { status: 'ON', start: sep14_1839 - 60, end: sep14_1839 }; // 17:39-18:39 (60m)
  const segAfter: Segment = { status: 'ON', start: sep14_1840, end: sep14_1840 + 120 }; // 18:40-20:40 (120m)
  const ev = evaluate([segBefore, segAfter], { asOf: sep14_1840 + 180, config: cfg });
  const prevDay = ev.cycle.days.find((d) => d.label === '2026-09-13');
  const curDay = ev.cycle.days.find((d) => d.label === '2026-09-14');
  assert.ok(prevDay && curDay, 'both carrier days must appear in cycle window');
  assert.equal(prevDay.onDuty, 60, '17:39-18:39 must be counted on Sep 13 carrier day');
  assert.equal(curDay.onDuty, 120, '18:40-20:40 must be counted on Sep 14 carrier day');

  // Recap drop-off check: 8 days after Sep 13 carrier day is Sep 21 at 18:40 (NOT 18:00 or 19:00)
  const sep21_1800 = localToMinute(2026, 9, 21, 18, TZ);
  const sep21_1839 = sep21_1800 + 39;
  const sep21_1840 = sep21_1800 + 40;
  const sep21_1900 = localToMinute(2026, 9, 21, 19, TZ);

  const evAt1800 = evaluate([segBefore], { asOf: sep21_1800, config: cfg });
  const evAt1839 = evaluate([segBefore], { asOf: sep21_1839, config: cfg });
  const evAt1840 = evaluate([segBefore], { asOf: sep21_1840, config: cfg });
  const evAt1900 = evaluate([segBefore], { asOf: sep21_1900, config: cfg });

  assert.equal(evAt1800.cycle.used, 60, 'at 18:00 hours have NOT dropped off yet');
  assert.equal(evAt1839.cycle.used, 60, 'at 18:39 hours have NOT dropped off yet');
  assert.equal(evAt1840.cycle.used, 0, 'at 18:40 hours drop off');
  assert.equal(evAt1900.cycle.used, 0, 'at 19:00 hours remain dropped off');

  // Forecast dayStart lands at 18:40, not 18:00 or 19:00
  const nextDrop = evAt1839.cycle.forecast[0];
  assert.equal(nextDrop.dayStart, sep21_1840, 'forecast next roll must be exact 18:40');
  assert.equal(localHM(nextDrop.dayStart), '18:40');
  assert.equal(nextDrop.dropsOff, 60);
  assert.notEqual(nextDrop.dayStart, sep21_1800);
  assert.notEqual(nextDrop.dayStart, sep21_1900);
});

test('(b) DST spring-forward and fall-back with minute-offset start (02:40 and 01:40) resolve sanely', () => {
  const cfg0240 = {
    cycle: '70/8' as const,
    dayStartHour: 2,
    dayStartMinute: 40,
    timeZone: TZ,
    shortHaul: false,
  } as RulesConfig;

  // Spring-forward: 2026-03-08 in America/Chicago jumps 02:00 CST -> 03:00 CDT.
  // 02:40 does not exist on Mar 8 -> resolves forward to 03:40 CDT, keeping Mar 7 a full 24h and Mar 8 23h.
  const mar7Noon = localToMinute(2026, 3, 7, 12, TZ);
  const mar7Start = carrierDayStart(mar7Noon, cfg0240);
  const mar8Start = nextCarrierDayStart(mar7Start, cfg0240);
  const mar9Start = nextCarrierDayStart(mar8Start, cfg0240);

  assert.equal(localYMDHM(mar7Start), '2026-03-07 02:40');
  assert.equal(localYMDHM(mar8Start), '2026-03-08 03:40');
  assert.equal(localYMDHM(mar9Start), '2026-03-09 02:40');
  assert.equal(mar8Start - mar7Start, 1440, 'Mar 7 carrier day is 24h');
  assert.equal(mar9Start - mar8Start, 1380, 'Mar 8 carrier day is 23h');
  assert.equal(carrierDayStart(mar8Start - 1, cfg0240), mar7Start, '1 minute before Mar 8 roll stays in Mar 7');
  assert.equal(carrierDayStart(mar8Start, cfg0240), mar8Start, 'exact Mar 8 roll starts Mar 8');

  // Fall-back: 2026-11-01 in America/Chicago repeats 01:00..01:59.
  // With 02:40 start: Oct 31 carrier day runs 25h (spans the repeated 01:xx hour), Nov 1 runs 24h.
  const oct31Noon = localToMinute(2026, 10, 31, 12, TZ);
  const oct31Start = carrierDayStart(oct31Noon, cfg0240);
  const nov1Start = nextCarrierDayStart(oct31Start, cfg0240);
  const nov2Start = nextCarrierDayStart(nov1Start, cfg0240);

  assert.equal(localYMDHM(oct31Start), '2026-10-31 02:40');
  assert.equal(localYMDHM(nov1Start), '2026-11-01 02:40');
  assert.equal(localYMDHM(nov2Start), '2026-11-02 02:40');
  assert.equal(nov1Start - oct31Start, 1500, 'Oct 31 carrier day is 25h across fall-back');
  assert.equal(nov2Start - nov1Start, 1440, 'Nov 1 carrier day is 24h');

  // Fall-back with start inside the repeated hour (01:40):
  // Oct 31 starts 01:40 CDT, Nov 1 starts at first 01:40 CDT (24h), Nov 1 spans the repeated hour -> 25h.
  const cfg0140 = { ...cfg0240, dayStartHour: 1, dayStartMinute: 40 };
  const oct31_0140 = carrierDayStart(oct31Noon, cfg0140);
  const nov1_0140 = nextCarrierDayStart(oct31_0140, cfg0140);
  const nov2_0140 = nextCarrierDayStart(nov1_0140, cfg0140);
  assert.equal(localYMDHM(oct31_0140), '2026-10-31 01:40');
  assert.equal(localYMDHM(nov1_0140), '2026-11-01 01:40');
  assert.equal(localYMDHM(nov2_0140), '2026-11-02 01:40');
  assert.equal(nov1_0140 - oct31_0140, 1440, 'Oct 31 with 01:40 start is 24h');
  assert.equal(nov2_0140 - nov1_0140, 1500, 'Nov 1 with 01:40 start is 25h');

  // Extreme minute boundary: 23:59 dayLabel must match the starting date, not +1 min (next day)
  const cfg2359 = { ...cfg0240, dayStartHour: 23, dayStartMinute: 59 };
  const sep15Noon = localToMinute(2026, 9, 15, 12, TZ);
  const d2359 = carrierDayStart(sep15Noon, cfg2359);
  assert.equal(localYMDHM(d2359), '2026-09-14 23:59');
  assert.equal(dayLabel(d2359, cfg2359), '2026-09-14');
});

test('(c) dayStartMinute = 0 reproduces today boundaries exactly on fixed cases', () => {
  const cases: { tz: string; h: number; y: number; m: number; d: number; probeH: number; probeM: number; expStart: string; expLen: number }[] = [
    { tz: 'America/Chicago', h: 0, y: 2026, m: 9, d: 14, probeH: 12, probeM: 0, expStart: '2026-09-14 00:00', expLen: 1440 },
    { tz: 'America/Chicago', h: 18, y: 2026, m: 9, d: 14, probeH: 17, probeM: 59, expStart: '2026-09-13 18:00', expLen: 1440 },
    { tz: 'America/Chicago', h: 18, y: 2026, m: 9, d: 14, probeH: 18, probeM: 0, expStart: '2026-09-14 18:00', expLen: 1440 },
    { tz: 'America/Chicago', h: 2, y: 2026, m: 3, d: 7, probeH: 12, probeM: 0, expStart: '2026-03-07 02:00', expLen: 1440 },
    { tz: 'America/Chicago', h: 2, y: 2026, m: 3, d: 8, probeH: 12, probeM: 0, expStart: '2026-03-08 03:00', expLen: 1380 },
    { tz: 'America/Chicago', h: 2, y: 2026, m: 10, d: 31, probeH: 12, probeM: 0, expStart: '2026-10-31 02:00', expLen: 1500 },
    { tz: 'America/New_York', h: 6, y: 2026, m: 11, d: 1, probeH: 5, probeM: 59, expStart: '2026-10-31 06:00', expLen: 1500 },
    { tz: 'America/Phoenix', h: 23, y: 2026, m: 3, d: 8, probeH: 23, probeM: 30, expStart: '2026-03-08 23:00', expLen: 1440 },
    { tz: 'UTC', h: 12, y: 2026, m: 6, d: 15, probeH: 11, probeM: 59, expStart: '2026-06-14 12:00', expLen: 1440 },
  ];

  for (const tc of cases) {
    const cfg = { cycle: '70/8' as const, dayStartHour: tc.h, dayStartMinute: 0, timeZone: tc.tz, shortHaul: false } as RulesConfig;
    const probe = localToMinute(tc.y, tc.m, tc.d, tc.probeH, tc.tz) + tc.probeM;
    const start = carrierDayStart(probe, cfg);
    const next = nextCarrierDayStart(start, cfg);
    assert.equal(localYMDHM(start, tc.tz), tc.expStart, `case ${tc.tz} h=${tc.h}`);
    assert.equal(next - start, tc.expLen, `len ${tc.tz} h=${tc.h}`);
  }
});
