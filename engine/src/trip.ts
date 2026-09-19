import type { RulesConfig, Segment } from './types.ts';
import { evaluate, type FullEvaluation } from './availability.ts';
import { LIMITS } from './types.ts';
import { nextCarrierDayStart, carrierDayStart } from './cycle.ts';

export interface TripStop {
  /** miles from origin */
  atMile: number;
  minutes: number;
  status: 'ON' | 'OFF' | 'SB';
  label: string;
}

export interface TripInput {
  /** minute the driver goes on duty for the trip */
  departure: number;
  distanceMiles: number;
  /** net average speed incl. fuel/traffic; 55 is a realistic default */
  mph: number;
  /** minutes of on-duty pre-trip / loading before wheels roll */
  preTripMinutes?: number;
  /** planned dwell stops (receiver, fuel) */
  stops?: TripStop[];
  /** how to regain hours when the daily clocks run out */
  restStrategy?: 'reset10' | 'split';
  config?: Partial<RulesConfig>;
}

export interface TripPlanStep {
  segment: Segment;
  fromMile: number;
  toMile: number;
  reason: string;
}

export interface TripPlan {
  feasible: boolean;
  arrival: number;
  elapsedMinutes: number;
  steps: TripPlanStep[];
  warnings: string[];
  /** cycle remaining at arrival */
  cycleRemainingAtArrival: number;
  /** evaluation of history + plan */
  evaluation: FullEvaluation;
}

/**
 * Greedy trip simulator: drive while legal; when a limit binds, insert the
 * smallest rest that clears it (30-min break, 10-hour reset, wait for recap
 * hours at the next carrier day, or a 34-hour restart). Dwell stops are
 * inserted at their mile marker as on-duty (or off-duty) time.
 *
 * v1 uses full 10h resets only. Split-berth strategies are modelled in the
 * Split Lab by hand-placing tentative rests — deliberately, so the driver sees
 * exactly which pairing the plan depends on.
 */
export function planTrip(history: Segment[], input: TripInput): TripPlan {
  const mph = input.mph > 0 ? input.mph : 55;
  const stops = [...(input.stops ?? [])].sort((a, b) => a.atMile - b.atMile);
  const plan: Segment[] = [];
  const steps: TripPlanStep[] = [];
  const warnings: string[] = [];

  let t = input.departure;
  let mile = 0;
  let stopIdx = 0;

  const push = (status: Segment['status'], minutes: number, reason: string, toMile = mile, note?: string) => {
    if (minutes <= 0) return;
    const seg: Segment = { status, start: t, end: t + minutes, tentative: true, note: note ?? reason };
    plan.push(seg);
    steps.push({ segment: seg, fromMile: mile, toMile, reason });
    t += minutes;
    mile = toMile;
  };

  if (input.preTripMinutes) push('ON', input.preTripMinutes, 'Pre-trip / loading');

  let guard = 0;
  while (mile < input.distanceMiles - 1e-9 && guard++ < 200) {
    const ev = evaluate([...history, ...plan], { asOf: t, config: input.config });
    const nextStopMile = stopIdx < stops.length ? stops[stopIdx].atMile : Infinity;
    const legMiles = Math.min(input.distanceMiles, nextStopMile) - mile;
    const legMinutes = Math.ceil((legMiles / mph) * 60);

    if (ev.driveNow <= 0 || !isFinite(ev.driveNow)) {
      // Out of hours: pick the rest that clears the binding limit.
      const last = plan[plan.length - 1];
      const lastRestLen = last && (last.status === 'OFF' || last.status === 'SB') ? last.end - last.start : 0;
      if (ev.binding === 'BREAK_30') {
        push('OFF', LIMITS.BREAK_LEN, '30-minute break (8h driving rule)');
      } else if (ev.binding === 'CYCLE') {
        const rest = waitForCycle(ev, t);
        push('OFF', rest.minutes, rest.reason);
      } else if (lastRestLen > 0) {
        // We just rested and still have nothing: top the rest up to a full 10h reset.
        push('OFF', Math.max(LIMITS.RESET - lastRestLen, 60), 'Extend to a full 10-hour reset');
      } else if (input.restStrategy === 'split' && ev.shift.pendingSplitLeg && !ev.shift.pendingSplitLeg.isReset) {
        const leg = ev.shift.pendingSplitLeg;
        const need = Math.max(leg.qualifiesLongSB ? LIMITS.SPLIT_MIN_SHORT : LIMITS.SPLIT_MIN_SB, LIMITS.SPLIT_TOTAL - leg.duration);
        push('SB', need, `Sleeper ${fmtH(need)} — pairs with the ${fmtH(leg.duration)} rest ending ${hhmm(leg.end)} (split; clocks recalc from that rest's end)`);
      } else {
        push('OFF', LIMITS.RESET, '10-hour reset (11/14 exhausted)');
      }
      continue;
    }

    if (legMinutes <= ev.driveNow) {
      push('D', legMinutes, `Drive ${Math.round(legMiles)} mi`, mile + legMiles);
      if (stopIdx < stops.length && Math.abs(mile - stops[stopIdx].atMile) < 1e-6) {
        const s = stops[stopIdx++];
        push(s.status, s.minutes, s.label);
      }
    } else {
      // Drive what we can, then stop; loop will insert the right rest.
      const partMiles = (ev.driveNow / 60) * mph;
      push('D', ev.driveNow, `Drive ${Math.round(partMiles)} mi (${ev.binding} binds)`, mile + partMiles);
    }
  }
  if (guard >= 200) warnings.push('Planner hit its iteration limit; trip may be infeasible under current hours.');

  const evaluation = evaluate([...history, ...plan], { asOf: t, config: input.config });
  const tentativeViolations = evaluation.violations.filter((v) => v.start >= input.departure);
  if (tentativeViolations.length) warnings.push(`Plan contains ${tentativeViolations.length} violation(s) — check itinerary.`);
  return {
    feasible: mile >= input.distanceMiles - 1e-9 && tentativeViolations.length === 0,
    arrival: t,
    elapsedMinutes: t - input.departure,
    steps, warnings,
    cycleRemainingAtArrival: evaluation.cycle.remaining,
    evaluation,
  };
}

/** How long to wait for recap hours; falls back to a 34h restart if nothing frees within the forecast. */
function waitForCycle(ev: FullEvaluation, t: number): { minutes: number; reason: string } {
  for (const f of ev.cycle.forecast) {
    if (f.availableAtStart >= 60 && f.dayStart > t) {
      const minutes = Math.max(f.dayStart - t, LIMITS.RESET);
      return { minutes, reason: `Wait for recap: +${(f.dropsOff / 60).toFixed(1)}h drops off at ${f.label} day start` };
    }
  }
  return { minutes: LIMITS.RESTART, reason: '34-hour restart (no recap hours within forecast)' };
}

export { carrierDayStart, nextCarrierDayStart };

const fmtH = (m: number) => (m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);
const hhmm = (m: number) => { const d = new Date(m * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** Plan with both rest strategies so the driver can compare arrival times. */
export function planTripBoth(history: Segment[], input: TripInput): { reset10: TripPlan; split: TripPlan; faster: 'reset10' | 'split' | 'same' } {
  const reset10 = planTrip(history, { ...input, restStrategy: 'reset10' });
  const split = planTrip(history, { ...input, restStrategy: 'split' });
  const faster = split.arrival < reset10.arrival ? 'split' : split.arrival > reset10.arrival ? 'reset10' : 'same';
  return { reset10, split, faster };
}
