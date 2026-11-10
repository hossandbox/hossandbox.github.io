// The two worst-case records for the lever computation (Verify-C1 §6, defect D5),
// checked in next to the bench that measures them. Both are built on the New York
// terminal clock with the C1 fixtures' CD() convention (local-time construction, so
// the records are the same instants under any TZ the bench runs in). Shapes are
// asserted by the bench before anything is timed: a record that drifts from its
// shape measures the wrong thing and must fail loudly instead.
export const CD = (day, hh, m = 0) => Math.floor(new Date(2026, 10, day, hh, m).getTime() / 60000);

export const mkState = (INIT, NY, over) => ({ ...INIT, config: NY, disclaimerAcked: true, historyAcknowledged: true, ...over });

/**
 * The true L2 worst case: the window binds with driving left, the pre-filter passes
 * (the chain holds the 8h-sleeper reset), but no rest in [2h, 5h] can pair — the 8h
 * sleeper is already paired with the later 2h off-duty leg, and a new leg of at most
 * 5h cannot be the 7h-sleeper half of any other pair. The search must run all
 * 13 steps × 2 statuses and find nothing. The trailing on-duty hours drain the
 * window without draining driving, which is what makes the window the binding
 * limit (its wall-clock end already carries the pair's 2h exclusion). Expected:
 * binding WINDOW_14, driveNow 300, computeLevers → [] (after ~26 evaluations).
 */
export function l2WorstCase(INIT, NY) {
  const segments = [
    { status: 'OFF', start: CD(8, 3, 40), end: CD(8, 4, 40) },
    { status: 'SB', start: CD(8, 4, 40), end: CD(8, 12, 40) },
    { status: 'OFF', start: CD(8, 12, 40), end: CD(8, 13, 40) },
    { status: 'ON', start: CD(8, 13, 40), end: CD(8, 14, 10) },
    { status: 'D', start: CD(8, 14, 10), end: CD(8, 16, 10) },
    { status: 'OFF', start: CD(8, 16, 10), end: CD(8, 18, 10) },
    { status: 'ON', start: CD(8, 18, 10), end: CD(8, 19, 10) },
    { status: 'D', start: CD(8, 19, 10), end: CD(8, 20, 10) },
    { status: 'ON', start: CD(8, 20, 10), end: CD(8, 22, 40) },
  ];
  const now = CD(9, 0, 40);
  return { state: mkState(INIT, NY, { segments, current: { status: 'ON', since: CD(8, 22, 40) }, nowOverride: now, tab: 'now' }), now };
}

/**
 * The resting L3 path, long-record form: the C1 block's V2 (resting off duty, the
 * sleeper brings driving back sooner) preceded by seven fully logged days, with the
 * hero's `again` in the shape useDriveAgain hands NowTab while resting (off
 * computed, sb null) — so the module runs its own sleeper search over a cycle-length
 * record. Expected: computeLevers → [L3] with driveAgainAt's own numbers.
 */
export function l3RestingLong(INIT, NY) {
  const segments = [];
  // Seven light days (5h duty each): the record is cycle-length, but the cycle
  // stays out of the way — with full 10h days the 70 would bind first and there
  // would be no L3 left to measure.
  for (let d = 1; d <= 7; d++) segments.push(
    { status: 'ON', start: CD(d, 5), end: CD(d, 6) }, { status: 'D', start: CD(d, 6), end: CD(d, 10) },
    { status: 'OFF', start: CD(d, 10), end: CD(d + 1, 5) });
  // day 8 runs into the evening so the V2 day (Nov 9) starts from a full reset
  segments.push(
    { status: 'ON', start: CD(8, 5), end: CD(8, 6) }, { status: 'D', start: CD(8, 6), end: CD(8, 14) },
    { status: 'ON', start: CD(8, 14), end: CD(8, 15) }, { status: 'OFF', start: CD(8, 15), end: CD(8, 20) },
    { status: 'OFF', start: CD(8, 20), end: CD(9, 6) }, { status: 'D', start: CD(9, 6), end: CD(9, 10) },
    { status: 'OFF', start: CD(9, 10), end: CD(9, 13) }, { status: 'D', start: CD(9, 13), end: CD(9, 17) },
    { status: 'ON', start: CD(9, 17), end: CD(9, 20) });
  const now = CD(9, 21, 0);
  return { state: mkState(INIT, NY, { segments, current: { status: 'OFF', since: CD(9, 20) }, nowOverride: now, tab: 'now' }), now };
}

/** The audit's standard seed (Appendix A) — the cheap path, for contrast. */
export function seed(INIT, NY) {
  const segments = [
    { status: 'OFF', start: CD(8, 5, 40), end: CD(8, 7, 40) }, { status: 'SB', start: CD(8, 7, 40), end: CD(8, 15, 40) },
    { status: 'ON', start: CD(8, 15, 40), end: CD(8, 16, 25) }, { status: 'D', start: CD(8, 16, 25), end: CD(8, 19, 10) },
    { status: 'OFF', start: CD(8, 19, 10), end: CD(8, 19, 40) }, { status: 'ON', start: CD(8, 19, 40), end: CD(8, 21, 55) }];
  const now = CD(9, 3, 4);
  return { state: mkState(INIT, NY, { segments, current: { status: 'D', since: CD(8, 21, 55) }, nowOverride: now, tab: 'now' }), now };
}
