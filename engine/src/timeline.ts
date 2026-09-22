import type { Segment, RestPeriod } from './types.ts';
import { LIMITS } from './types.ts';

/**
 * Sort, clip overlaps (a later entry wins over the range it actually covers), drop
 * zero-length, merge adjacent same-status.
 *
 * A later entry OVERWRITES only the time it covers. The earlier segment is SPLIT, keeping
 * both the part before the overlap and the part after it. Truncating the earlier segment
 * instead silently deletes its tail: a 6h drive with a 1h off-duty entry dropped inside it
 * must leave 5h of driving, not 2. Clocks are computed from the record as logged (§395.3(a)),
 * so a small correction must never inflate the available driving or cycle time.
 */
export function normalize(segments: Segment[]): Segment[] {
  const sorted = segments
    .filter((s) => s.end > s.start)
    .map((s) => ({ ...s }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const placed: Segment[] = [];
  for (const s of sorted) {
    const kept: Segment[] = [];
    for (const p of placed) {
      if (p.end <= s.start || p.start >= s.end) { kept.push(p); continue; } // no overlap
      if (p.start < s.start) kept.push({ ...p, end: s.start });            // keep the head
      if (p.end > s.end) kept.push({ ...p, start: s.end });                // keep the tail
    }
    kept.push({ ...s });
    kept.sort((a, b) => a.start - b.start || a.end - b.end);
    placed.length = 0;
    placed.push(...kept);
  }
  const out: Segment[] = [];
  for (const s of placed) {
    const last = out[out.length - 1];
    if (last && last.status === s.status && last.end === s.start && !!last.tentative === !!s.tentative) {
      last.end = s.end;
    } else {
      out.push(s);
    }
  }
  return out;
}

/** Minutes of `status` within [from, to) across segments. */
export function minutesOf(segments: Segment[], status: Set<string>, from: number, to: number): number {
  let total = 0;
  for (const s of segments) {
    if (!status.has(s.status)) continue;
    const a = Math.max(s.start, from);
    const b = Math.min(s.end, to);
    if (b > a) total += b - a;
  }
  return total;
}

const REST = new Set(['OFF', 'SB']);
export const WORK = new Set(['D', 'ON']);
export const DRIVE = new Set(['D']);

/**
 * Merge contiguous OFF/SB segments into RestPeriods, computing the longest
 * contiguous SB run (the 7h leg must be *consecutive* sleeper-berth time).
 * Gaps in the record are treated as OFF (a gap is unlogged time; the driver
 * was not working).
 */
export function restPeriods(segments: Segment[]): RestPeriod[] {
  const out: RestPeriod[] = [];
  let cur: { start: number; end: number; longestSB: number; sbRun: number } | null = null;

  const flush = () => {
    if (!cur) return;
    const duration = cur.end - cur.start;
    const longestSB = Math.max(cur.longestSB, cur.sbRun);
    out.push({
      start: cur.start,
      end: cur.end,
      duration,
      longestSB,
      isReset: duration >= LIMITS.RESET,
      isRestart: duration >= LIMITS.RESTART,
      qualifiesShort: duration >= LIMITS.SPLIT_MIN_SHORT,
      qualifiesLongSB: longestSB >= LIMITS.SPLIT_MIN_SB,
    });
    cur = null;
  };

  let prevEnd: number | null = null;
  for (const s of segments) {
    // gap → OFF
    if (prevEnd !== null && s.start > prevEnd) {
      if (!cur) cur = { start: prevEnd, end: s.start, longestSB: 0, sbRun: 0 };
      else { cur.longestSB = Math.max(cur.longestSB, cur.sbRun); cur.sbRun = 0; cur.end = s.start; }
    }
    if (REST.has(s.status)) {
      if (!cur) cur = { start: s.start, end: s.end, longestSB: 0, sbRun: 0 };
      else cur.end = s.end;
      if (s.status === 'SB') cur.sbRun += s.end - s.start;
      else { cur.longestSB = Math.max(cur.longestSB, cur.sbRun); cur.sbRun = 0; }
    } else {
      flush();
    }
    prevEnd = s.end;
  }
  flush();
  return out;
}

/** Split the record into shifts at every ≥10h rest. Each shift: [start, end) of working span. */
export interface ShiftSpan {
  /** end of the reset that began this shift (or first segment start when none) */
  start: number;
  /** start of the reset that ended this shift, or null if open */
  end: number | null;
  /** the rest that terminated this shift, if any */
  terminatingRest: RestPeriod | null;
}

export function shifts(segments: Segment[], rests: RestPeriod[]): ShiftSpan[] {
  if (segments.length === 0) return [];
  const resets = rests.filter((r) => r.isReset);
  const out: ShiftSpan[] = [];
  let start = segments[0].start;
  // If the record opens with a reset, the shift begins when it ends.
  for (const r of resets) {
    if (r.start <= start) { start = r.end; continue; }
    out.push({ start, end: r.start, terminatingRest: r });
    start = r.end;
  }
  // Always leave an open shift: after a terminating reset the driver is fresh, and that
  // empty shift is what the current clocks are read from.
  out.push({ start, end: null, terminatingRest: null });
  return out;
}
