import type { FullEvaluation, RestPeriod } from '../../engine/src/index.ts';
import { evaluate, driveAgainAt, pruneHistory } from '../../engine/src/index.ts';
import { allSegments, clock, dur, zoneShort, type SplitDraft, type State } from './store.ts';

/**
 * Lever chips (capstone C1, audit §2.4): "If you … → …" — the one change that moves the
 * driver's answer, computed from the logged record and offered on Now under the Timeline
 * card. Every number comes from `evaluate` / `driveAgainAt` on the record plus one
 * hypothetical rest row — the patch-10 pattern — never from new rule math in this file.
 * The conditions, sentence patterns and search bounds are the audit's; the oracles a
 * verifier checks them against are written from 49 CFR 395 / FMCSA FAQ 22, not from here.
 *
 * Two guards stand in front of the whole library, both from the audit: chips need the
 * record to stand on the driver's own log (`ringBasis === 'log'` — a pending split leg
 * built from typed ELD clocks, or an unlogged gap counted as rest, is exactly the kind
 * of leg a lever would wrongly pair with), and no chip is computed while what-if rows
 * are on the log (the Why sheet omits its lever for the same reason: the lever stands
 * on the logged record, the screen's evaluation would be explaining a hypothetical).
 */

/** The rest a lever pairs with, in the shape the sentences need. */
export interface PendingLeg { start: number; end: number; duration: number; longestSB: number; isReset: boolean }

const legOf = (r: RestPeriod): PendingLeg => ({ start: r.start, end: r.end, duration: r.duration, longestSB: r.longestSB, isReset: r.isReset });

export type Lever =
  /** L1 Break now: binding is the 30-min break; 30 off now hands back more driving than he has. */
  | { id: 'L1'; restMin: 30; driveAfter: number; stopBy: number }
  /** L2 Free rest: binding is the window; the smallest rest in [2h, 5h] that pairs and loses no driving. */
  | { id: 'L2'; restMin: number; status: 'OFF' | 'SB' | 'either'; driveAfter: number; stopBy: number; driveNow: number; pending: PendingLeg | null }
  /** L3 Sleeper instead: out of time, and the sleeper brings driving back sooner than off duty. */
  | { id: 'L3'; sbAt: number; offAt: number; pending: PendingLeg | null }
  /** L4 Recap: the cycle binds (now, or once the shortest restoring rest is taken); hours roll back at `at`. */
  | { id: 'L4'; at: number; dropsOff: number; available: number; dayStartLabel: string };

/** The logged record the levers stand on: what-if rows out, pruned the way the Trip planner prunes. */
function loggedRecord(s: State, now: number) {
  return pruneHistory(allSegments(s, now).filter((x) => !x.tentative), now, s.config);
}

/**
 * The partner a completed pair stands on, read out of the AFTER evaluation's own chain:
 * the qualifying rest in the chain that ended at or before `now` (the new rest is the one
 * still running). Falls back to the current shift's pending leg, then to null — the sheet
 * then uses its generic sentence rather than naming a rest it cannot point at.
 */
function pairPartner(after: FullEvaluation, now: number, ev: FullEvaluation): PendingLeg | null {
  const earlier = after.shift.chain.filter((r) => r.end <= now);
  if (earlier.length) return legOf(earlier[earlier.length - 1]);
  return ev.shift.pendingSplitLeg ? legOf(ev.shift.pendingSplitLeg) : null;
}

/**
 * Every lever the record currently offers, in the audit's priority order L1 > L2 > L3 > L4.
 * At most one lever of each kind can fire: L1 and L2 key on different bindings, L3 needs
 * no driving time where L1/L2 need some, and L4 keys on the cycle.
 */
export function computeLevers(s: State, now: number, ev: FullEvaluation, basis: 'log' | 'estimate' | 'demo', again?: { off: number | null; sb: number | null } | null): Lever[] {
  if (basis !== 'log' || s.tentative.length > 0) return [];
  const out: Lever[] = [];
  const status = s.current?.status ?? 'OFF';
  const logged = loggedRecord(s, now);
  const evalRest = (r: number, st: 'OFF' | 'SB') =>
    evaluate([...logged, { status: st, start: now, end: now + r }], { asOf: now + r, config: s.config });

  // L1 — the break is what binds, and taking it now hands back driving.
  if (ev.driveNow > 0 && ev.binding === 'BREAK_30') {
    const e2 = evalRest(30, 'OFF');
    if (e2.driveNow > ev.driveNow) out.push({ id: 'L1', restMin: 30, driveAfter: e2.driveNow, stopBy: e2.mustStopBy });
  }

  // L2 — the window is what binds, and a paired rest is excluded from it: the smallest
  // rest in [2h, 5h] (15-min steps, OFF then SB) that loses no driving. The search IS the
  // rule: without the pair, resting only runs the window down, so drive′ < driveNow and
  // the step cannot qualify; a reset inside the range is out of bounds by the cap.
  // The search costs an evaluation per step, so it runs only when a pair partner can
  // exist at all: a pair needs one leg of at least 7 hours in the sleeper, and the new
  // leg runs at most 5 hours, so that sleeper leg must be the partner — a rest already
  // in this shift's chain with 7+ hours in the sleeper and, the two legs having to add
  // to 10, a duration of at least 5 hours (the pending leg is such a rest by name).
  // A shift with no such rest can never pair; the search would only prove that 26 times.
  const pairPartnerPossible = ev.shift.pendingSplitLeg !== null && ev.shift.pendingSplitLeg.longestSB >= 420
    || ev.shift.chain.some((rp) => rp.longestSB >= 420 && rp.duration >= 300);
  if (ev.driveNow > 0 && ev.binding === 'WINDOW_14' && (status === 'ON' || status === 'D') && pairPartnerPossible) {
    for (let r = 120; r <= 300; r += 15) {
      const off = evalRest(r, 'OFF');
      const sb = evalRest(r, 'SB');
      const offOk = off.driveNow >= ev.driveNow, sbOk = sb.driveNow >= ev.driveNow;
      if (!offOk && !sbOk) continue;
      let lever: Lever | null = null;
      if (offOk && sbOk && off.driveNow === sb.driveNow && off.mustStopBy === sb.mustStopBy) {
        lever = { id: 'L2', restMin: r, status: 'either', driveAfter: off.driveNow, stopBy: off.mustStopBy, driveNow: ev.driveNow, pending: pairPartner(off, now, ev) };
      } else if (offOk && (!sbOk || off.driveNow > sb.driveNow || (off.driveNow === sb.driveNow && off.mustStopBy >= sb.mustStopBy))) {
        lever = { id: 'L2', restMin: r, status: 'OFF', driveAfter: off.driveNow, stopBy: off.mustStopBy, driveNow: ev.driveNow, pending: pairPartner(off, now, ev) };
      } else if (sbOk) {
        lever = { id: 'L2', restMin: r, status: 'SB', driveAfter: sb.driveNow, stopBy: sb.mustStopBy, driveNow: ev.driveNow, pending: pairPartner(sb, now, ev) };
      }
      if (lever) { out.push(lever); break; }
    }
  }

  // L3 — no driving time, not already in the sleeper, and the sleeper brings it back
  // sooner. The two drive-again calls mirror useDriveAgain's construction (a just-tapped
  // on-duty row counts as begun, or the engine would still see the rest as unbroken) —
  // and when the caller passes the hero's own `again` (NowTab does), its numbers ARE
  // those calls on the same construction, so they are reused rather than recomputed:
  // the search is the expensive part of this module, and the shipped rest hero already
  // pays for it on every render in both modes. While resting off duty the hero's sb is
  // null by its own design, so that one call stays here.
  if (ev.driveNow <= 0 && status !== 'SB') {
    const t = (status === 'ON' || status === 'D') && s.current ? Math.max(now, s.current.since + 1) : now;
    const segs = pruneHistory(allSegments(s, t), t, s.config);
    const offAt = again ? again.off : driveAgainAt(segs, { asOf: t, config: s.config }, 'OFF');
    const sbAt = again?.sb ?? driveAgainAt(segs, { asOf: t, config: s.config }, 'SB');
    if (offAt !== null && sbAt !== null && sbAt < offAt) {
      out.push({ id: 'L3', sbAt, offAt, pending: ev.shift.pendingSplitLeg ? legOf(ev.shift.pendingSplitLeg) : null });
    }
  }

  // L4 — the cycle is the lever: it binds now, or it is what binds once the shortest
  // restoring rest is taken (whyLever's recap branch, with its numbers read from the
  // evaluation's own forecast — no new evaluate of the cycle itself).
  {
    let cycleBinds = ev.binding === 'CYCLE';
    if (!cycleBinds && ev.driveNow <= 0) {
      // Resting off duty, the hero's `again.off` is this same search on this same record
      // (t = now in both constructions); every other status keeps its own call.
      const againAt = status === 'OFF' && again ? again.off : driveAgainAt(logged, { asOf: now, config: s.config }, 'OFF');
      if (againAt !== null && againAt - now <= 600) {
        const resumed = evaluate([...logged, { status: 'OFF' as const, start: now, end: againAt }], { asOf: againAt, config: s.config });
        cycleBinds = resumed.binding === 'CYCLE';
      }
    }
    if (cycleBinds) {
      const f = ev.cycle.forecast.find((x) => x.dayStart > now && x.dropsOff > 0);
      if (f) {
        const h = s.config.dayStartHour;
        const dayStartLabel = h === 0 ? `midnight ${zoneShort(s.config.timeZone)}` : `${String(h).padStart(2, '0')}:00 ${zoneShort(s.config.timeZone)}`;
        out.push({ id: 'L4', at: f.dayStart, dropsOff: f.dropsOff, available: f.availableAtStart, dayStartLabel });
      }
    }
  }

  return out;
}

/** Decision C3-A: at most two chips on Now; computeLevers already returns priority order. */
export function pickChips(levers: Lever[]): Lever[] { return levers.slice(0, 2); }

/** How a rest is named when one status is meant: "off duty" / "in the sleeper". */
const statusWords = (st: 'OFF' | 'SB') => (st === 'SB' ? 'in the sleeper' : 'off duty');
/** A rest period's dominant kind, in the words restWords uses on the Now screen. */
export const legKindWords = (p: PendingLeg): string =>
  p.longestSB >= p.duration ? 'sleeper' : p.longestSB > 0 ? 'sleeper and off duty' : 'off duty';

/** The chip's headline sentence (audit §2.4 patterns; the app's dur()/clock() house style). */
export function leverTitle(l: Lever): string {
  switch (l.id) {
    case 'L1': return `If you take your 30-min break now → drive till ${clock(l.stopBy)}`;
    case 'L2': {
      const where = l.status === 'either' ? 'off duty or in the sleeper' : statusWords(l.status);
      const kept = l.driveAfter === l.driveNow ? `still ${dur(l.driveAfter)} to drive` : `${dur(l.driveAfter)} to drive`;
      return `If you rest ${dur(l.restMin)} now, ${where} → ${kept}, stop by ${clock(l.stopBy)}`;
    }
    case 'L3': return `If you rest in the sleeper instead → drive again ${clock(l.sbAt)} (off duty: ${clock(l.offAt)})`;
    case 'L4': return `At ${clock(l.at)} (${l.dayStartLabel}), +${dur(l.dropsOff)} comes back → ${dur(l.available)} available`;
  }
}

/** The chip's second line, where the pattern has one. */
export function leverSub(l: Lever): string | null {
  switch (l.id) {
    case 'L1': return `${dur(l.driveAfter)} of driving after it · any 30 min without driving counts`;
    case 'L3': return l.pending ? `pairs with your ${clock(l.pending.start)}–${clock(l.pending.end)} ${legKindWords(l.pending)} (${dur(l.pending.duration)})` : null;
    default: return null;
  }
}

/** The sheet's one rule sentence, its citation, and the log-it-exactly caveat (audit §2.4). */
export function leverRule(l: Lever, ev: FullEvaluation): { rule: string; cite: string; caveat: string } {
  const win = ev.shift.limits.window / 60;
  switch (l.id) {
    case 'L1': return {
      rule: `A break is 30 minutes in a row without driving. Off duty, sleeper, or on-duty work like fueling all count — and your ${win}-hour window keeps running while you take it.`,
      cite: '49 CFR 395.3(a)(3)(ii)',
      caveat: 'Log it exactly: 30 minutes in a row, no driving in it. A minute at the wheel starts the count again.',
    };
    case 'L2': {
      const p = l.pending;
      const head = p
        ? p.isReset
          ? `Your ${dur(p.duration)} rest (${clock(p.start)}–${clock(p.end)}) held ${dur(p.longestSB)} in a row in the sleeper. `
          : `Your ${dur(p.duration)} ${legKindWords(p)} rest (${clock(p.start)}–${clock(p.end)}) is one half of a split pair. `
        : '';
      return {
        rule: `${head}A rest of ${dur(l.restMin)} or more now can pair with it, and the pair's second rest does not count against your ${win}-hour window.${l.driveAfter === l.driveNow ? ' It gives you window, not more driving.' : ''}`,
        cite: p?.isReset ? 'FMCSA HOS FAQ 22' : '49 CFR 395.1(g)',
        caveat: `Log it exactly: ${dur(l.restMin)} in a row, ${l.status === 'either' ? 'off duty or sleeper' : statusWords(l.status)}. Shorter, and nothing pairs.`,
      };
    }
    case 'L3': {
      const p = l.pending;
      const head = p ? `Your ${dur(p.duration)} rest (${clock(p.start)}–${clock(p.end)}) is one half of a split pair. ` : '';
      return {
        rule: `${head}Resting in the sleeper from now completes the other half sooner — 7 hours in a row in the berth, against 10 hours off duty. The pair's rests do not count against your ${win}-hour window.`,
        cite: '49 CFR 395.1(g)',
        caveat: 'Log it exactly: the sleeper time has to be in the berth, in a row.',
      };
    }
    case 'L4': return {
      rule: `Your ${ev.cycle.limit / 60}-hour cycle counts the last ${ev.cycle.windowDays} carrier days. At ${clock(l.at)} the oldest day in the window drops off, and the ${dur(l.dropsOff)} of duty from that day come back.`,
      cite: '49 CFR 395.3(b)',
      caveat: `This refills the cycle only — driving still needs your ${ev.shift.limits.drive / 60} and your ${win} clear as well.`,
    };
  }
}

/**
 * The AFTER evaluation a lever's sheet draws its ghost axis from: the record plus the
 * lever's own rest, at the minute that rest completes. L3/L4 change no single evaluation
 * this way (their sheets draw from the lever's own fields), so they return null.
 */
export function leverAfter(s: State, now: number, l: Lever): FullEvaluation | null {
  if (l.id !== 'L1' && l.id !== 'L2') return null;
  const st = l.id === 'L1' ? 'OFF' as const : l.status === 'SB' ? 'SB' as const : 'OFF' as const;
  const logged = loggedRecord(s, now);
  return evaluate([...logged, { status: st, start: now, end: now + l.restMin }], { asOf: now + l.restMin, config: s.config });
}

/**
 * [Try it in Split Lab] (L2/L3, audit §2.4): the draft patch the sheet's button applies —
 * draft only, never the log. L2 fills Break 1 with the lever's rest and the Drive with the
 * driving the lever leaves; an 'either' lever keeps the draft's own Break 1 status, since
 * the two statuses buy the same thing and the choice is the driver's. L3 models resting in
 * the sleeper from now until driving returns, then driving what the engine leaves at that
 * minute. Null when the model does not fit the Lab's own ranges (the sheet then omits the
 * button rather than clamping a number into a different claim).
 */
export function leverSplitPrefill(s: State, now: number, l: Lever): Partial<SplitDraft> | null {
  if (l.id === 'L2') {
    return { b1: l.restMin, ...(l.status === 'either' ? {} : { b1s: l.status }), drive: Math.min(l.driveAfter, 660) };
  }
  if (l.id === 'L3') {
    const b1 = l.sbAt - now;
    if (b1 <= 0 || b1 > 600) return null;
    const logged = loggedRecord(s, now);
    const at = evaluate([...logged, { status: 'SB' as const, start: now, end: l.sbAt }], { asOf: l.sbAt, config: s.config });
    return { b1, b1s: 'SB', drive: Math.min(at.driveNow, 660) };
  }
  return null;
}
