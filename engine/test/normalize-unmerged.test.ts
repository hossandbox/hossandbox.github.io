/**
 * normalize(rows, { merge: false }) — the resolved timeline without joining touching rows of one status.
 * Used by the status pill, which labels rows by their note (round-5 retest). The invariant that keeps it
 * honest: merging its output must give exactly what the clocks use, normalize(rows).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/index.ts';
import type { Segment } from '../src/index.ts';

const mergeLikeNormalize = (rows: Segment[]) => {
  const out: Segment[] = [];
  for (const s of rows) {
    const last = out[out.length - 1];
    if (last && last.status === s.status && last.end === s.start && !!last.tentative === !!s.tentative) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
};

test('unmerged + merge = normalize, on random overlapping, stamped and unstamped rows', () => {
  let seed = 17; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ST = ['OFF', 'SB', 'D', 'ON'] as const;
  for (let k = 0; k < 2000; k++) {
    const rows: Segment[] = [];
    for (let i = 0, n = 1 + Math.floor(rnd() * 12); i < n; i++) {
      const start = Math.floor(rnd() * 600), end = start + 1 + Math.floor(rnd() * 240);
      const r: Segment = { status: ST[Math.floor(rnd() * 4)], start, end };
      if (rnd() < 0.7) r.createdAt = Math.floor(rnd() * 50);
      if (rnd() < 0.2) r.note = rnd() < 0.5 ? 'PC' : 'YM';
      if (rnd() < 0.1) r.tentative = true;
      rows.push(r);
    }
    assert.deepEqual(mergeLikeNormalize(normalize(rows, { merge: false })), normalize(rows), `case ${k}`);
  }
});

test('unmerged keeps a note boundary that merging folds away', () => {
  const rows: Segment[] = [{ status: 'OFF', start: 0, end: 30, note: 'PC' }, { status: 'OFF', start: 30, end: 90 }];
  assert.equal(normalize(rows).length, 1, 'merged: one row (correct for the clocks)');
  assert.deepEqual(normalize(rows, { merge: false }).map((r) => r.note), ['PC', undefined]);
});
