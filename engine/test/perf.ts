/**
 * A machine-speed reference, shared by the stress tests.
 *
 * Absolute `performance.now()` budgets measure the container, not the code: U4 once failed at 1009ms
 * against a 1000ms budget with the algorithm unchanged, and passed at ~350ms on a quiet box. Comparing
 * a cost against a reference measured in the same run makes a budget track the machine instead of
 * assuming one. Test utility, not part of the engine — `test/*.test.ts` is what the runner picks up.
 */
export function referenceWork(): number {
  const t0 = performance.now();
  let x = 0;
  for (let i = 0; i < 30_000_000; i++) x = (x + i * 2654435761) >>> 0;
  if (x === 1.5) throw new Error('unreachable — keeps the loop from being optimised away');
  return performance.now() - t0;
}