export * from './types.ts';
export { normalize, restPeriods, shifts, minutesOf } from './timeline.ts';
export { evaluateShift, evaluateShiftWithChain, enumerateChains, pairQualifies, breakStatus, breakViolations, rankEvaluations, shiftLimits, fmt } from './shift.ts';
export { evaluateCycle, cycleUsedAt, cycleViolations, carrierDayStart, nextCarrierDayStart, dayLabel, localToMinute } from './cycle.ts';
export { evaluate, safeHaven, type FullEvaluation, type EvaluateOptions } from './availability.ts';
export { planTrip, planTripAll, TRIP_STRATEGIES, type TripStrategy, type TripInput, type TripPlan, type TripStop, type TripPlanStep } from './trip.ts';

/** Convenience: build a segment from local wall-clock "HH:MM" strings on a base day (minutes since epoch). */
export function seg(status: 'OFF' | 'SB' | 'D' | 'ON', start: number, end: number, note?: string, tentative?: boolean) {
  return { status, start, end, note, tentative };
}
