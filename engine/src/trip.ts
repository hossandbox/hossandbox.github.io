import type { DutyStatus, RulesConfig, Segment } from './types.ts';
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
  /**
   * The driver's status between `from` and `departure`.
   *
   * Unlogged future time is NOT a rest — a gap in a record means "not logged", and the engine
   * reads gaps as OFF. Left implicit, a delayed departure therefore hands the driver a qualifying
   * split leg he never took, and the plan can call a load legal on an assumption nobody made.
   * Always pass this when `departure > now`.
   */
  untilDeparture?: { from: number; status: DutyStatus; label?: string };
  distanceMiles: number;
  /** net average speed incl. fuel/traffic; 55 is a realistic default */
  mph: number;
  /** minutes of on-duty pre-trip / loading before wheels roll */
  preTripMinutes?: number;
  /** planned dwell stops (receiver, fuel) */
  stops?: TripStop[];
  /** how to regain hours when the daily clocks run out */
  restStrategy?: 'reset10' | 'split' | 'restart34';
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

  // Pre-departure: make the driver's status between now and departure an explicit, visible row
  // instead of a gap. See TripInput.untilDeparture.
  const lead: Segment[] = [];
  if (input.untilDeparture && input.untilDeparture.from < input.departure) {
    const u = input.untilDeparture;
    const seg: Segment = { status: u.status, start: u.from, end: input.departure, tentative: true, note: u.label ?? 'Until departure' };
    lead.push(seg);
    steps.push({ segment: seg, fromMile: 0, toMile: 0, reason: `${u.label ?? 'Until departure'} — assumed, not logged` });
  }
  const base = [...lead, ...history];

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
    const ev = evaluate([...base, ...plan], { asOf: t, config: input.config });
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
        // §395.3(c): any 7/8-day period may end with ≥34 consecutive hours off duty. Waiting for
        // recap hours can be much longer, so the two are worth comparing side by side.
        if (input.restStrategy === 'restart34') {
          push('OFF', LIMITS.RESTART, '34-hour restart — resets the 60/70 cycle (§395.3(c))');
        } else {
          const rest = waitForCycle(ev, t);
          push('OFF', rest.minutes, rest.reason);
        }
      } else if (lastRestLen > 0) {
        // We just rested and still have nothing: top the rest up to a full 10h reset.
        push('OFF', Math.max(LIMITS.RESET - lastRestLen, 60), 'Extend to a full 10-hour reset');
      } else if (input.restStrategy === 'split' && ev.shift.pendingSplitLeg && !(ev.shift.pendingSplitLeg.isReset && ev.binding === 'DRIVE_11')) {
        // (a reset-as-first-leg pairing — FAQ 22 — keeps the anchor at shift start, so it can't restore driving time; skip it when the 11 binds)
        const leg = ev.shift.pendingSplitLeg;
        const need = Math.max(leg.qualifiesLongSB ? LIMITS.SPLIT_MIN_SHORT : LIMITS.SPLIT_MIN_SB, LIMITS.SPLIT_TOTAL - leg.duration);
        const why = leg.isReset ? `pairs with your ${fmtH(leg.duration)} sleeper reset (FMCSA FAQ 22) — excluded from the 14` : `pairs with the ${fmtH(leg.duration)} rest ending ${hhmm(leg.end)} (split; clocks recalc from that rest's end)`;
        push(leg.qualifiesLongSB ? 'OFF' : 'SB', need, `${leg.qualifiesLongSB ? 'Off duty' : 'Sleeper'} ${fmtH(need)} — ${why}`);
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
      push('D', ev.driveNow, `Drive ${Math.round(partMiles)} mi (${bindingName(ev.binding, input.config)})`, mile + partMiles);
    }
  }
  if (guard >= 200) warnings.push('Planner hit its iteration limit; trip may be infeasible under current hours.');
  // A stop past the destination is not in the plan — say so rather than dropping it silently.
  for (const st of stops) {
    if (st.atMile > input.distanceMiles + 1e-9) {
      warnings.push(`The ${st.label || 'stop'} at mile ${Math.round(st.atMile)} is past the ${Math.round(input.distanceMiles)}-mile destination, so it is not in this plan.`);
    }
  }

  const evaluation = evaluate([...base, ...plan], { asOf: t, config: input.config });
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

/** Driver-facing name for the binding limit — the enum id (DRIVE_11, BREAK_30…) is internal, never UI copy. */
function bindingName(b: string, cfg?: Partial<RulesConfig>): string {
  switch (b) {
    case 'DRIVE_11': return '11-hour driving limit';
    case 'WINDOW_14': return '14-hour window';
    case 'CYCLE': return cfg?.cycle === '60/7' ? '60-hour cycle' : '70-hour cycle';
    case 'BREAK_30': return '30-minute break due';
    default: return 'hours limit';
  }
}

export type TripStrategy = 'reset10' | 'split' | 'restart34';
export const TRIP_STRATEGIES: TripStrategy[] = ['reset10', 'split', 'restart34'];

/**
 * Plan every rest strategy so the driver can compare arrival times.
 *
 * The 34-hour restart only differs when the CYCLE binds — otherwise it plans identically to the
 * 10-hour reset — but that is exactly where it matters: waiting for recap hours can cost a day or
 * more, and a restart is always available instead (§395.3(c)). Never collapse the two into one
 * itinerary; show the driver both waits.
 */
export function planTripAll(history: Segment[], input: TripInput): { reset10: TripPlan; split: TripPlan; restart34: TripPlan; faster: TripStrategy | 'same' } {
  const plans = {
    reset10: planTrip(history, { ...input, restStrategy: 'reset10' }),
    split: planTrip(history, { ...input, restStrategy: 'split' }),
    restart34: planTrip(history, { ...input, restStrategy: 'restart34' }),
  };
  const best = Math.min(plans.reset10.arrival, plans.split.arrival, plans.restart34.arrival);
  const winners = TRIP_STRATEGIES.filter((k) => plans[k].arrival === best);
  return { ...plans, faster: winners.length === 1 ? winners[0] : 'same' };
}
