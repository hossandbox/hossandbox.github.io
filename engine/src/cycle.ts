import type { CycleDay, CycleEvaluation, RestPeriod, RulesConfig, Segment, Violation } from './types.ts';
import { LIMITS } from './types.ts';
import { minutesOf, WORK } from './timeline.ts';
import { severityOf, fmt } from './shift.ts';

/* ---------- carrier-day arithmetic (24h periods starting at dayStartHour in home-terminal zone) ---------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function localParts(minute: number, tz: string) {
  const parts = dtf(tz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** Minutes since epoch for local wall time (y,m,d,h) in tz. Handles DST via two-pass correction. */
export function localToMinute(y: number, m: number, d: number, h: number, tz: string): number {
  let guess = Math.floor(Date.UTC(y, m - 1, d, h) / 60000);
  for (let i = 0; i < 2; i++) {
    const p = localParts(guess, tz);
    const asUtc = Math.floor(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 60000);
    const target = Math.floor(Date.UTC(y, m - 1, d, h) / 60000);
    guess += target - asUtc;
  }
  return guess;
}

/** Start minute of the carrier day containing `minute`. */
export function carrierDayStart(minute: number, cfg: RulesConfig): number {
  const p = localParts(minute, cfg.timeZone);
  let start = localToMinute(p.y, p.m, p.d, cfg.dayStartHour, cfg.timeZone);
  if (start > minute) {
    // before today's dayStartHour → belongs to previous carrier day
    const prev = new Date(Date.UTC(p.y, p.m - 1, p.d - 1));
    start = localToMinute(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), cfg.dayStartHour, cfg.timeZone);
  }
  return start;
}

export function nextCarrierDayStart(dayStart: number, cfg: RulesConfig): number {
  // step 25h forward then snap back to the day start (DST-safe)
  return carrierDayStart(dayStart + 25 * 60, cfg);
}

export function dayLabel(dayStart: number, cfg: RulesConfig): string {
  const p = localParts(dayStart + 1, cfg.timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/* ---------- cycle ---------- */

export function cycleParams(cfg: RulesConfig) {
  return cfg.cycle === '60/7'
    ? { limit: LIMITS.CYCLE_60_7, windowDays: 7 }
    : { limit: LIMITS.CYCLE_70_8, windowDays: 8 };
}

/** End of the most recent ≥34h rest that ended at or before t, else null. */
export function lastRestartEnd(rests: RestPeriod[], t: number): number | null {
  let out: number | null = null;
  for (const r of rests) {
    if (r.isRestart && r.end <= t) out = r.end;
    // a restart in progress that already spans 34h counts too
    else if (r.isRestart && r.start + LIMITS.RESTART <= t) out = t;
  }
  return out;
}

/** On-duty minutes counted toward the cycle within [from, to), honoring a restart boundary. */
function onDutyCounted(segments: Segment[], from: number, to: number, restartEnd: number | null): number {
  const f = restartEnd !== null ? Math.max(from, restartEnd) : from;
  return f >= to ? 0 : minutesOf(segments, WORK, f, to);
}

/** Cycle used as of minute t: on-duty in the rolling window of carrier days ending with t's day. */
export function cycleUsedAt(segments: Segment[], rests: RestPeriod[], t: number, cfg: RulesConfig): number {
  const { windowDays } = cycleParams(cfg);
  const todayStart = carrierDayStart(t, cfg);
  let winStart = todayStart;
  for (let i = 1; i < windowDays; i++) winStart = carrierDayStart(winStart - 1, cfg);
  return onDutyCounted(segments, winStart, t, lastRestartEnd(rests, t));
}

export function evaluateCycle(
  segments: Segment[],
  rests: RestPeriod[],
  asOf: number,
  cfg: RulesConfig,
  forecastDays = 4,
): CycleEvaluation {
  const { limit, windowDays } = cycleParams(cfg);
  const restartEnd = lastRestartEnd(rests, asOf);

  // Build the window days, oldest first.
  const todayStart = carrierDayStart(asOf, cfg);
  const starts: number[] = [todayStart];
  for (let i = 1; i < windowDays; i++) starts.unshift(carrierDayStart(starts[0] - 1, cfg));
  const days: CycleDay[] = starts.map((s) => {
    const e = nextCarrierDayStart(s, cfg);
    return { start: s, end: e, label: dayLabel(s, cfg), onDuty: onDutyCounted(segments, s, Math.min(e, asOf), restartEnd) };
  });
  const used = days.reduce((a, d) => a + d.onDuty, 0);

  // Forecast: at the start of each upcoming day, the oldest day in the window drops off.
  // Today's total uses the full recorded/tentative day (not just up to asOf).
  const forecast: CycleEvaluation['forecast'] = [];
  const fullDay = (s: number) => onDutyCounted(segments, s, nextCarrierDayStart(s, cfg), restartEnd);
  let dayStarts = [...starts];
  for (let i = 0; i < forecastDays; i++) {
    const next = nextCarrierDayStart(dayStarts[dayStarts.length - 1], cfg);
    const dropped = dayStarts[0];
    dayStarts = [...dayStarts.slice(1), next];
    const usedAtStart = dayStarts.slice(0, -1).reduce((a, s) => a + fullDay(s), 0);
    forecast.push({
      dayStart: next,
      label: dayLabel(next, cfg),
      dropsOff: fullDay(dropped),
      availableAtStart: Math.max(0, limit - usedAtStart),
    });
  }

  return { limit, windowDays, days, used, remaining: Math.max(0, limit - used), restartEnd, forecast };
}

/** Driving while the cycle is exhausted (§395.3(b)). */
export function cycleViolations(segments: Segment[], rests: RestPeriod[], cfg: RulesConfig): Violation[] {
  const { limit } = cycleParams(cfg);
  const out: Violation[] = [];
  for (const s of segments) {
    if (s.status !== 'D') continue;
    // split at carrier-day boundaries so the rolling window is constant within each piece
    let a = s.start;
    while (a < s.end) {
      const b = Math.min(s.end, nextCarrierDayStart(carrierDayStart(a, cfg), cfg));
      const usedAtA = cycleUsedAt(segments, rests, a, cfg);
      const t = a + Math.max(0, limit - usedAtA);
      if (t < b) {
        const m = b - t;
        out.push({ kind: 'CYCLE', start: t, end: b, minutes: m, severity: severityOf(m),
          detail: `Drove ${fmt(m)} after reaching the ${limit / 60}-hour cycle limit` });
      }
      a = b;
    }
  }
  return out;
}
