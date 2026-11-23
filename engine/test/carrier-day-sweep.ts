/**
 * 100,000-scenario equivalence sweep + minute>0 consistency pass for carrier-day exact start time.
 *
 * Pass 1 (100,000 scenarios):
 *   Compares the untouched baseline engine (../.. /work-stackfix3/engine/src/index.ts, where
 *   `dayStartMinute` does not exist) against the new engine (../src/index.ts) with
 *   `dayStartMinute: 0` (and alternates omitting `dayStartMinute` on half the scenarios).
 *   Asserts deep, field-by-field identity across `evaluate()` (including `cycle.days`,
 *   `cycle.forecast`, `cycle.used`, `cycle.remaining`, `shift`, `noSplit`, `driveNow`,
 *   `binding`, `mustStopBy`, `violations`, `gaps`), `carrierDayStart()`, `nextCarrierDayStart()`,
 *   and `dayLabel()`. Zero mismatches allowed.
 *
 * Pass 2 (25,000 scenarios):
 *   Runs randomized scenarios with random `dayStartMinute` in 1..59 across DST-heavy zones
 *   and dates. Asserts no crashes, `dayStart <= asOf < nextStart`, boundaries land at the
 *   stated HH:MM local time (or exact forward-resolved instant across a spring-forward gap),
 *   day lengths are strictly 23h/24h/25h (1380/1440/1500m), `dayLabel` matches the local
 *   date of `dayStart` (including at 23:59), and cycle sums match.
 */
import assert from 'node:assert/strict';
import * as nextEng from '../src/index.ts';
import * as baseEng from '../../../work-stackfix3/engine/src/index.ts';
import type { DutyStatus, Segment } from '../src/index.ts';

const ZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Phoenix',
  'America/St_Johns',
  'America/Havana',
  'Europe/London',
  'Europe/Berlin',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
] as const;

// Anchor windows around DST transitions in 2026-2027 (epoch minutes)
const DST_ANCHORS = [
  Date.UTC(2026, 2, 8, 6, 0) / 60000,   // US/CA/Cuba spring-forward
  Date.UTC(2026, 2, 29, 1, 0) / 60000,  // EU/UK spring-forward
  Date.UTC(2026, 3, 4, 15, 0) / 60000,  // AU/NZ fall-back
  Date.UTC(2026, 8, 26, 14, 0) / 60000, // NZ spring-forward
  Date.UTC(2026, 9, 3, 16, 0) / 60000,  // AU spring-forward
  Date.UTC(2026, 9, 25, 1, 0) / 60000,  // EU/UK fall-back
  Date.UTC(2026, 10, 1, 6, 0) / 60000,  // US/CA/Cuba fall-back
  Date.UTC(2027, 2, 14, 6, 0) / 60000,  // US/CA 2027 spring-forward
  Date.UTC(2027, 10, 7, 6, 0) / 60000,  // US/CA 2027 fall-back
];

const YEAR_START = Date.UTC(2026, 0, 1, 0, 0) / 60000;
const YEAR_SPAN = 730 * 1440; // 2 full years (2026-2027)
const STATUSES: DutyStatus[] = ['OFF', 'SB', 'D', 'ON'];

// Deterministic Mulberry32 PRNG
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function localParts(minute: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const parts = f.formatToParts(new Date(minute * 60000));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

function genScenario(rng: () => number) {
  const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const timeZone = ZONES[randInt(0, ZONES.length - 1)];
  const cycle: '60/7' | '70/8' = rng() < 0.3 ? '60/7' : '70/8';
  const shortHaul = rng() < 0.2;
  const dayStartHour = randInt(0, 23);

  // 40% clustered within ±4 days of DST transitions, 60% anywhere in 2026-2027
  let asOf: number;
  if (rng() < 0.4) {
    const anchor = DST_ANCHORS[randInt(0, DST_ANCHORS.length - 1)];
    asOf = Math.floor(anchor + randInt(-4 * 1440, 4 * 1440));
  } else {
    asOf = Math.floor(YEAR_START + randInt(0, YEAR_SPAN));
  }

  // Generate 0..16 realistic segments across up to 9 days before asOf (with occasional tentative/straddling)
  const count = randInt(0, 16);
  const segs: Segment[] = [];
  let cursor = asOf - randInt(1, 9) * 1440 - randInt(0, 1439);
  for (let i = 0; i < count; i++) {
    const status = STATUSES[randInt(0, STATUSES.length - 1)];
    const dur = status === 'OFF' || status === 'SB'
      ? randInt(15, 22 * 60)
      : randInt(10, 9 * 60);
    const start = cursor;
    const end = start + dur;
    const tentative = start >= asOf && rng() < 0.5;
    segs.push({ status, start, end, ...(tentative ? { tentative: true } : {}) });
    cursor = end + (rng() < 0.2 ? randInt(0, 180) : 0);
  }

  return { timeZone, cycle, shortHaul, dayStartHour, asOf, segs };
}

function stripDayStartMinute(ev: nextEng.FullEvaluation) {
  const { dayStartMinute: _dsm, ...restConfig } = ev.config;
  return { ...ev, config: restConfig };
}

/* ---------- Pass 1: 100,000-scenario baseline vs dayStartMinute=0 equivalence ---------- */
const PASS1_COUNT = 100_000;
const rng1 = makeRng(0xca771e01);
const t0 = performance.now();
let mismatches = 0;
let omittedCount = 0;
let zeroCount = 0;

for (let i = 0; i < PASS1_COUNT; i++) {
  const sc = genScenario(rng1);
  const baseCfg = {
    cycle: sc.cycle,
    dayStartHour: sc.dayStartHour,
    timeZone: sc.timeZone,
    shortHaul: sc.shortHaul,
  };
  const useZero = (i & 1) === 0;
  if (useZero) zeroCount++; else omittedCount++;
  const nextCfg = useZero ? { ...baseCfg, dayStartMinute: 0 } : baseCfg;

  const baseEv = baseEng.evaluate(sc.segs, { asOf: sc.asOf, config: baseCfg });
  const nextEv = nextEng.evaluate(sc.segs, { asOf: sc.asOf, config: nextCfg });

  const baseStart = baseEng.carrierDayStart(sc.asOf, baseEv.config);
  const nextStart = nextEng.carrierDayStart(sc.asOf, nextEv.config);
  const baseNext = baseEng.nextCarrierDayStart(baseStart, baseEv.config);
  const nextNext = nextEng.nextCarrierDayStart(nextStart, nextEv.config);
  const baseLbl = baseEng.dayLabel(baseStart, baseEv.config);
  const nextLbl = nextEng.dayLabel(nextStart, nextEv.config);

  const stripped = stripDayStartMinute(nextEv);
  try {
    assert.strictEqual(nextStart, baseStart, 'carrierDayStart mismatch');
    assert.strictEqual(nextNext, baseNext, 'nextCarrierDayStart mismatch');
    assert.strictEqual(nextLbl, baseLbl, 'dayLabel mismatch');
    assert.strictEqual(nextEv.config.dayStartMinute, 0, 'resolved dayStartMinute must be 0');
    assert.deepStrictEqual(stripped, baseEv);
  } catch (err) {
    mismatches++;
    console.error(`MISMATCH at scenario #${i}:`, sc);
    console.error(err);
    break;
  }
}

const t1 = performance.now();
console.log(
  `PASS 1 (baseline vs new dayStartMinute=0/absent): ${PASS1_COUNT} scenarios ` +
  `(${zeroCount} explicit 0, ${omittedCount} omitted), mismatches=${mismatches}, elapsed=${((t1 - t0) / 1000).toFixed(2)}s`,
);
assert.strictEqual(mismatches, 0, `Pass 1 had ${mismatches} mismatches`);

/* ---------- Pass 2: 25,000-scenario dayStartMinute 1..59 consistency pass ---------- */
const PASS2_COUNT = 25_000;
const rng2 = makeRng(0xca771e02);
const t2 = performance.now();
let dstGapCount = 0;
let dayLenCounts: Record<number, number> = { 1380: 0, 1440: 0, 1500: 0 };

for (let i = 0; i < PASS2_COUNT; i++) {
  const sc = genScenario(rng2);
  const dayStartMinute = 1 + Math.floor(rng2() * 59); // 1..59
  const cfg: nextEng.RulesConfig = {
    cycle: sc.cycle,
    dayStartHour: sc.dayStartHour,
    dayStartMinute,
    timeZone: sc.timeZone,
    shortHaul: sc.shortHaul,
  };

  const ev = nextEng.evaluate(sc.segs, { asOf: sc.asOf, config: cfg });
  assert.ok(Number.isFinite(ev.driveNow) && ev.driveNow >= 0, 'driveNow finite >= 0');
  assert.ok(ev.cycle.used >= 0 && ev.cycle.remaining >= 0, 'cycle used/remaining >= 0');
  assert.strictEqual(
    ev.cycle.days.reduce((a, d) => a + d.onDuty, 0),
    ev.cycle.used,
    'cycle.used equals sum of cycle.days.onDuty',
  );

  // Check carrierDayStart bounds around asOf
  const ds = nextEng.carrierDayStart(sc.asOf, cfg);
  const ns = nextEng.nextCarrierDayStart(ds, cfg);
  assert.ok(ds <= sc.asOf && sc.asOf < ns, `asOf ${sc.asOf} outside [${ds}, ${ns})`);
  assert.strictEqual(nextEng.carrierDayStart(ds, cfg), ds, 'carrierDayStart idempotent');
  assert.strictEqual(nextEng.carrierDayStart(ns - 1, cfg), ds, 'ns-1 belongs to ds');
  assert.strictEqual(nextEng.carrierDayStart(ns, cfg), ns, 'ns starts next day');

  // Check every day in cycle.days and every forecast boundary
  for (const d of ev.cycle.days) {
    const len = d.end - d.start;
    assert.ok(
      len === 1380 || len === 1440 || len === 1500,
      `unexpected day length ${len}m in ${sc.timeZone} at ${sc.dayStartHour}:${dayStartMinute} (${d.label})`,
    );
    dayLenCounts[len] = (dayLenCounts[len] ?? 0) + 1;

    const lp = localParts(d.start, sc.timeZone);
    const expectedDate = `${lp.y}-${String(lp.m).padStart(2, '0')}-${String(lp.d).padStart(2, '0')}`;
    assert.strictEqual(d.label, expectedDate, `dayLabel ${d.label} !== local date ${expectedDate}`);

    if (lp.h === sc.dayStartHour && lp.min === dayStartMinute) {
      // Exact wall-clock match
    } else {
      // Must be a spring-forward gap: verify the wall time shifted forward by 60m and that
      // 60m earlier was before the DST jump (same minute, previous offset).
      const prevLp = localParts(d.start - 60, sc.timeZone);
      const targetWall = sc.dayStartHour * 60 + dayStartMinute;
      const gotWall = lp.h * 60 + lp.min;
      assert.strictEqual(
        (gotWall - targetWall + 1440) % 1440,
        60,
        `non-gap boundary mismatch: expected ${sc.dayStartHour}:${dayStartMinute}, got ${lp.h}:${lp.min} in ${sc.timeZone} on ${d.label}`,
      );
      assert.strictEqual(prevLp.min, dayStartMinute, 'spring-forward gap check failed');
      dstGapCount++;
    }
  }

  for (const f of ev.cycle.forecast) {
    const lp = localParts(f.dayStart, sc.timeZone);
    const expectedDate = `${lp.y}-${String(lp.m).padStart(2, '0')}-${String(lp.d).padStart(2, '0')}`;
    assert.strictEqual(f.label, expectedDate, `forecast label ${f.label} !== ${expectedDate}`);
    const targetWall = sc.dayStartHour * 60 + dayStartMinute;
    const gotWall = lp.h * 60 + lp.min;
    const diff = (gotWall - targetWall + 1440) % 1440;
    assert.ok(diff === 0 || diff === 60, `forecast boundary mismatch: ${lp.h}:${lp.min} vs ${sc.dayStartHour}:${dayStartMinute}`);
  }
}

const t3 = performance.now();
console.log(
  `PASS 2 (dayStartMinute 1..59 consistency): ${PASS2_COUNT} scenarios, 0 failures, ` +
  `dayLengths={23h:${dayLenCounts[1380]}, 24h:${dayLenCounts[1440]}, 25h:${dayLenCounts[1500]}}, ` +
  `dstGapResolutions=${dstGapCount}, elapsed=${((t3 - t2) / 1000).toFixed(2)}s`,
);
