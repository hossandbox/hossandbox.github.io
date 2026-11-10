// Lever-computation bench (Verify-C1 §6, defect D5): re-benches the two worst-case
// records from records.mjs the way the verifier measured them — computeLevers called
// exactly as NowTab calls it, 10 warm-ups, then the median of 80 — and reports each
// figure in ms and in single-evaluate equivalents on the same record, so the numbers
// stay meaningful on a VM whose absolute speed swings between sessions.
//
// What this bench can and cannot say: it measures the SYNCHRONOUS cost that used to
// sit on the render path. Since the D5 fix that cost runs inside an idle callback
// after paint, so it no longer blocks a frame; whether the whole computation also
// fits the audit's ≤50 ms budget ON LORICO'S PIXEL is a device measurement this
// bench does not make. If the Pixel gate fails, the audit's fallback is
// tap-to-compute L2 (§6 risk 1).
//
// Run: node test/bench/levers-bench.mjs   (from web/; no build step)
import { computeLevers } from '../../src/levers.ts';
import { INITIAL_STATE as INIT, allSegments } from '../../src/store.ts';
import { evaluate, driveAgainAt, pruneHistory } from '../../../engine/src/index.ts';
import { l2WorstCase, l3RestingLong, seed } from './records.mjs';

const NY = { ...INIT.config, timeZone: 'America/New_York' };
const median = (xs) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const bench = (fn) => {
  for (let i = 0; i < 10; i++) fn();
  const ts = [];
  for (let i = 0; i < 80; i++) { const t0 = performance.now(); fn(); ts.push(performance.now() - t0); }
  return median(ts);
};
const evOf = (s, now) => evaluate(allSegments(s, now), { asOf: now, config: s.config });

function run(name, { state, now }, makeCall, expect) {
  const ev = evOf(state, now);
  const got = makeCall(ev);
  expect(ev, got); // shape first: a drifted record fails here, before any timing
  // The honest unit is one evaluate on the record the module itself works on —
  // the pruned logged record — not on the raw segment list.
  const logged = pruneHistory(allSegments(state, now), now, state.config);
  const evalMs = bench(() => evaluate(logged, { asOf: now, config: state.config }));
  const ms = bench(() => makeCall(ev));
  console.log(`${name}: computeLevers median ${ms.toFixed(1)} ms · one evaluate (pruned record) ${evalMs.toFixed(2)} ms · ≈${(ms / evalMs).toFixed(0)} evaluate-equivalents · levers [${got.map((l) => l.id).join(', ')}]`);
}

// The seed: the cheap path (the L2 search exits at r = 120).
{
  const rec = seed(INIT, NY);
  run('seed (L2 @ 120)', rec, (ev) => computeLevers(rec.state, rec.now, ev, 'log'), (ev, got) => {
    if (ev.binding !== 'WINDOW_14' || ev.driveNow !== 156) throw new Error('seed shape: expected WINDOW_14 / 156');
    if (got.length !== 1 || got[0].id !== 'L2') throw new Error('seed shape: expected exactly [L2]');
  });
}

// The true L2 worst case: the full 26-evaluation scan that finds nothing.
{
  const rec = l2WorstCase(INIT, NY);
  run('L2 worst case (full scan, no pair)', rec, (ev) => computeLevers(rec.state, rec.now, ev, 'log'), (ev, got) => {
    if (ev.binding !== 'WINDOW_14' || ev.driveNow !== 300) throw new Error(`L2-worst shape: expected WINDOW_14 / 300, got ${ev.binding} / ${ev.driveNow}`);
    if (got.length !== 0) throw new Error(`L2-worst shape: expected no levers, got [${got.map((l) => l.id).join(', ')}]`);
  });
}

// The resting L3 path on a cycle-length record, with the hero's `again` in hand.
{
  const rec = l3RestingLong(INIT, NY);
  const segs = pruneHistory(allSegments(rec.state, rec.now), rec.now, NY);
  const again = { off: driveAgainAt(segs, { asOf: rec.now, config: NY }, 'OFF'), sb: null, before: 0 };
  run('resting L3 (long record, hero again passed)', rec, (ev) => computeLevers(rec.state, rec.now, ev, 'log', again), (ev, got) => {
    const sb = driveAgainAt(segs, { asOf: rec.now, config: NY }, 'SB');
    if (got.length !== 1 || got[0].id !== 'L3') throw new Error(`L3 shape: expected exactly [L3], got [${got.map((l) => l.id).join(', ')}]`);
    if (got[0].sbAt !== sb || got[0].offAt !== again.off) throw new Error('L3 shape: numbers must be driveAgainAt’s own');
  });
}
console.log('bench done (VM numbers only — the ≤50 ms Pixel gate is a device measurement)');
