import { useEffect, useState } from 'preact/hooks';
import type { Segment, RulesConfig, DutyStatus } from '../../engine/src/index.ts';
import { DEFAULT_CONFIG } from '../../engine/src/index.ts';

/**
 * The live status. `createdAt` is the stamp() taken when it was tapped: overlap resolution treats the
 * live row as an entry made at that moment, so a correction typed later still wins, while a row typed
 * earlier (e.g. "off 08:00 → 22:00" before dispatch called) can no longer hide live driving
 * (stress-test round 2, §2.1).
 */
export interface OpenSegment { status: DutyStatus; since: number; note?: string; createdAt?: number }

/**
 * Trip-tab scenario. Kept in the store (not component state) so switching tabs does not silently
 * throw away what the driver was comparing (consumer-review-2).
 */
export interface TripDraft {
  miles: number;
  pre: number;
  stopMile: number;
  stopMin: number;
  stopOff: boolean;
  /** datetime-local string; null follows the live clock */
  dep: string | null;
  /** status assumed between now and departure; 'CURRENT' = whatever the log says now */
  until: DutyStatus | 'CURRENT';
  /** which comparison is selected; null = whichever plan is fastest */
  view: 'reset10' | 'split' | 'restart34' | null;
}

export interface State {
  segments: Segment[];
  tentative: Segment[];
  current: OpenSegment | null;
  config: RulesConfig;
  mph: number;
  trip: TripDraft;
  /** Split Lab scenario — persisted so switching tabs does not rewrite the driver's plan. */
  split: SplitDraft;
  /** Recap "can I take this load?" scenario — same reason. */
  loadCheck: LoadCheckDraft;
  /**
   * The driver has explicitly confirmed the record starts here. Until then the app keeps disclosing
   * that its picture of past duty is incomplete — tapping a status is a statement about NOW, not
   * about the days behind it.
   */
  historyAcknowledged: boolean;
  /** Log tab: show the normalized timeline instead of the entries as typed */
  logResolved: boolean;
  /** night (default) or day; see applyTheme */
  theme: Theme;
  /** simulated "now" for testing; null = wall clock */
  nowOverride: number | null;
  tab: 'log' | 'split' | 'recap' | 'trip' | 'settings';
  /** where "Report a bug" sends mail */
  bugEmail: string;
}

const KEY = 'hos-sandbox-v1';
/** The browser's zone — what every `clock()` on screen renders in, which may differ from the terminal. */
export const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';

export const DEFAULT_TRIP: TripDraft = {
  miles: 550, pre: 30, stopMile: 0, stopMin: 0, stopOff: false, dep: null, until: 'CURRENT', view: null,
};

/** Split Lab scenario. Kept in the store so a trip to the Log tab cannot rewrite the plan. */
export interface SplitDraft {
  b1: number; b1s: 'OFF' | 'SB';
  dwell: number;
  drive: number;
  b2: number; b2s: 'OFF' | 'SB';
}
export const DEFAULT_SPLIT: SplitDraft = { b1: 180, b1s: 'OFF', dwell: 30, drive: 300, b2: 420, b2s: 'SB' };

/** Recap "can I take this load?" scenario. */
export interface LoadCheckDraft { miles: number; dwell: number; dwellOff: boolean }
export const DEFAULT_LOADCHECK: LoadCheckDraft = { miles: 1200, dwell: 120, dwellOff: false };

/** The state a fresh install starts from. Exported so the defaults are assertable, not folklore. */
export const INITIAL_STATE: State = {
  segments: [], tentative: [], current: null,
  config: { ...DEFAULT_CONFIG, timeZone: deviceTz },
  mph: 55, trip: { ...DEFAULT_TRIP }, split: { ...DEFAULT_SPLIT }, loadCheck: { ...DEFAULT_LOADCHECK },
  historyAcknowledged: false, logResolved: false, theme: 'night', nowOverride: null, tab: 'log', bugEmail: '',
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return INITIAL_STATE;
    const s = JSON.parse(raw);
    return { ...INITIAL_STATE, ...s,
      config: { ...INITIAL_STATE.config, ...(s.config ?? {}) },
      trip: { ...DEFAULT_TRIP, ...(s.trip ?? {}) },
      split: { ...DEFAULT_SPLIT, ...(s.split ?? {}) },
      loadCheck: { ...DEFAULT_LOADCHECK, ...(s.loadCheck ?? {}) } };
  } catch { return INITIAL_STATE; }
}

let state: State = load();
const subs = new Set<() => void>();

export function getState() { return state; }
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  localStorage.setItem(KEY, JSON.stringify(state));
  subs.forEach((f) => f());
}
export function useStore(): State {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return state;
}

/* ---------- time helpers (device-local display; engine works in epoch minutes) ---------- */
export const nowMin = () => Math.floor(Date.now() / 60000);
export function useNow(): number {
  const s = useStore();
  const [n, setN] = useState(nowMin());
  // The app works in whole minutes, so a 30s tick recomputed every planning screen twice per
  // meaningful change — and each tick re-runs planTripAll (stress-test 2.2). One minute is the
  // finest thing any readout can show, so tick at the point where the displayed value can change.
  useEffect(() => { const id = setInterval(() => setN(nowMin()), 60000); return () => clearInterval(id); }, []);
  return s.nowOverride ?? n;
}
export function toInput(min: number): string {
  const d = new Date(min * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromInput(s: string): number | null {
  const t = new Date(s).getTime();
  return isNaN(t) ? null : Math.floor(t / 60000);
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function clock(min: number, withDay = true): string {
  if (!isFinite(min)) return '—';
  const d = new Date(min * 60000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return withDay ? `${DOW[d.getDay()]} ${hm}` : hm;
}
/** Like clock(), but with the calendar date — for plans that run past a week, where the weekday repeats. */
export function clockFull(min: number): string {
  if (!isFinite(min)) return '—';
  const d = new Date(min * 60000);
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * How the terminal's day roll (00:00 in `terminalTz`) reads on the device's clock, as "HH:MM".
 * Computed from the real offsets at `at` rather than assumed, so daylight saving is handled — the
 * LA/Chicago gap is 2 hours in summer and 2 in winter, but the US/Phoenix and UTC cases differ.
 */
export function terminalMidnightOnDevice(terminalTz: string, deviceTz: string, at: number): string {
  const offset = (tz: string) => {
    const d = new Date(at * 60000);
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of f.formatToParts(d)) p[part.type] = part.value;
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000);
  };
  const mins = (((offset(deviceTz) - offset(terminalTz)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Every IANA zone the runtime knows, for the settings picker. Falls back to the common US set. */
export const TIME_ZONES: string[] = (() => {
  try {
    const v = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (Array.isArray(v) && v.length) return v;
  } catch { /* older runtime */ }
  return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Winnipeg', 'America/Edmonton',
    'America/Vancouver', 'UTC'];
})();

/**
 * An invalid zone makes `Intl.DateTimeFormat` throw inside the engine, which would blank every tab.
 * Nothing may reach `config.timeZone` unless it passes this.
 */
export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
export function dur(min: number): string {
  if (!isFinite(min)) return '∞';
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
export function hrs(min: number): string { return (min / 60).toFixed(1); }

export type HistoryBasis = 'fresh' | 'incomplete' | 'known';

/**
 * How much the app actually knows about the driver's past duty.
 *
 * A current status is a statement about NOW, not about the days behind it: tapping "Driving" must
 * not turn unknown past days into confirmed zero-hour days (consumer-review-6). Only an explicit
 * acknowledgement — or a record that genuinely reaches back a full day — makes the basis 'known'.
 */
export function historyBasis(s: State, now: number): HistoryBasis {
  if (s.historyAcknowledged) return 'known';
  if (s.segments.length === 0 && s.tentative.length === 0 && !s.current) return 'fresh';
  if (s.segments.length > 0 && now - Math.min(...s.segments.map((x) => x.start)) >= 1440) return 'known';
  return 'incomplete';
}

/**
 * Basis for the CYCLE specifically.
 *
 * The daily clocks only need a shift's worth of record, but the 60/70-hour cycle is measured over the
 * whole carrier window: a driver who installs the app with 60 hours already on his cycle sees ~56h
 * available after one day of use and, under the 24-hour test above, no warning at all (stress-test
 * 2.6). Treat the cycle as known only once the record genuinely spans the window, or the driver
 * confirms.
 */
export function cycleBasis(s: State, now: number, windowDays: number): HistoryBasis {
  if (s.historyAcknowledged) return 'known';
  if (s.segments.length === 0 && s.tentative.length === 0 && !s.current) return 'fresh';
  if (s.segments.length > 0 && now - Math.min(...s.segments.map((x) => x.start)) >= windowDays * 1440) return 'known';
  return 'incomplete';
}

/**
 * A gap only changes an answer once it is long enough to serve as a split leg (≥2h, §395.1(g)(1)(ii)(A))
 * or to stack into a reset. Disclosing every hole would nag about the ordinary case of going off duty
 * and opening the app an hour later, which teaches the driver to ignore the warning that matters.
 */
export const MEANINGFUL_GAP_MINUTES = 120;
export function meaningfulGaps(gapsIn: { start: number; end: number }[]): { start: number; end: number }[] {
  return gapsIn.filter((g) => g.end - g.start >= MEANINGFUL_GAP_MINUTES);
}

/**
 * Monotonic entry key for a row the driver just added or edited.
 *
 * Date.now() alone can repeat inside one interaction, and a phone clock can step backwards; overlap
 * resolution only needs the ORDER to be correct, so keep a counter that never goes back.
 */
let lastStamp = 0;
export function stamp(): number {
  const t = Date.now();
  lastStamp = t > lastStamp ? t : lastStamp + 1;
  return lastStamp;
}

/**
 * Does a Recap "set" entry fit inside its carrier day? applyDayPatch() clamps at the day's end, so an
 * entry that doesn't fit must be refused up front — silently recording 1h of a 15h day understated the
 * cycle by 14h (stress-test round 2, §2.5). Day length is 23/24/25h across DST.
 */
export function dayPatchOverflow(dayStart: number, dayEnd: number, drive: number, on: number, startHour: number): number {
  const need = startHour * 60 + Math.round(on * 60) + Math.round(drive * 60) + (drive > 8 ? 30 : 0);
  return Math.max(0, need - (dayEnd - dayStart));
}

/**
 * Write a day's drive + on-duty hours as real segments, leaving the rest of the record intact.
 *
 * The original filter dropped every segment that *touched* the day — including the part of it that
 * belongs to the neighbouring day. Setting Monday therefore erased 3h of Tuesday's on-duty time and
 * handed back 3h of cycle (stress-test 2.4). Straddling rows are clipped to the day boundary now, and
 * generated rows are clamped inside the day instead of spilling past it.
 */
export function applyDayPatch(
  segments: Segment[], dayStart: number, dayEnd: number,
  drive: number, on: number, startHour: number, createdAt: number,
): Segment[] {
  const kept: Segment[] = [];
  for (const x of segments) {
    if (x.end <= dayStart || x.start >= dayEnd) { kept.push(x); continue; } // outside the day
    if (x.start < dayStart) kept.push({ ...x, end: dayStart });             // keep its earlier part
    if (x.end > dayEnd) kept.push({ ...x, start: dayEnd });                 // keep its later part
  }
  const segs: Segment[] = [];
  let t = dayStart + startHour * 60;
  const add = (status: DutyStatus, minutes: number) => {
    if (minutes <= 0) return;
    const start = t;
    const end = Math.min(t + minutes, dayEnd); // a 13h day entered at 23:00 must not spill out of it
    if (end > start) segs.push({ status, start, end, note: 'recap entry', createdAt });
    t += minutes;
  };
  // pre-trip on-duty, then driving split around a 30-min break if needed, then post-trip on-duty
  const onPre = Math.min(on, 0.5);
  add('ON', Math.round(onPre * 60));
  if (drive > 8) {
    add('D', 480);
    add('OFF', 30);
    add('D', Math.round((drive - 8) * 60));
  } else {
    add('D', Math.round(drive * 60));
  }
  add('ON', Math.round((on - onPre) * 60));
  return [...kept, ...segs].sort((a, b) => a.start - b.start);
}

/**
 * Apply an edit to one segment, matched by identity so every other entry keeps its reference (the
 * delete control and the undo snapshot both depend on that).
 */
export function applySegmentEdit(s: State, orig: Segment, next: Partial<Segment>): Pick<State, 'segments' | 'tentative'> {
  // An edit is a new entry: stamp it so it wins over the row it corrects rather than losing to it.
  const bump = (list: Segment[]) => list.map((x) => (x === orig ? { ...x, ...next, createdAt: stamp() } : x));
  return { segments: bump(s.segments), tentative: bump(s.tentative) };
}

/**
 * Restore a state from an exported payload (see `exportState`).
 *
 * Everything the export carries comes back — including the trip scenario, which the old inline
 * import dropped, so a backup/restore silently lost it. `nowOverride` is deliberately NOT restored:
 * a simulated clock must never come back on its own and quietly make the app lie about the time.
 */
export function applyImportedState(cur: State, d: Partial<State>): Partial<State> {
  return {
    segments: d.segments ?? [],
    tentative: d.tentative ?? [],
    current: d.current ?? null,
    config: { ...cur.config, ...(d.config ?? {}) },
    mph: d.mph ?? cur.mph,
    trip: { ...DEFAULT_TRIP, ...(d.trip ?? {}) },
    bugEmail: typeof d.bugEmail === 'string' ? d.bugEmail : cur.bugEmail,
  };
}

/** Materialize the open segment up to `now` so the engine sees it. */
export function allSegments(s: State, now: number): Segment[] {
  const out = [...s.segments];
  // A live status saved before entries were stamped has no tap time; treat it as the newest entry.
  if (s.current && now > s.current.since) out.push({ status: s.current.status, start: s.current.since, end: now, note: s.current.note ?? 'current', createdAt: s.current.createdAt ?? Number.MAX_SAFE_INTEGER });
  return [...out, ...s.tentative];
}

export const STATUS_LABEL: Record<DutyStatus, string> = { OFF: 'Off Duty', SB: 'Sleeper', D: 'Driving', ON: 'On Duty' };
export const STATUS_COLOR: Record<DutyStatus, string> = { OFF: 'var(--muted)', SB: 'var(--accent)', D: 'var(--good)', ON: 'var(--warn)' };

/**
 * 'night' is the product default and needs no attribute — `:root` carries the night palette.
 * 'day' sets `data-theme="day"` on the document root. Not part of the export: this is a
 * device preference, like `logResolved`, and a restored backup should not change how your screen
 * looks.
 */
export type Theme = 'night' | 'day';
export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return; // the node test harness has no DOM
  const root = document.documentElement;
  if (t === 'day') root.setAttribute('data-theme', 'day');
  else root.removeAttribute('data-theme');
}
/** Sub-statuses drivers think in. For HOS math PC is plain OFF and YM is plain ON (§395.2 / FMCSA guidance). */
export const SUB_STATUS: Record<string, string> = { PC: 'Personal conveyance', YM: 'Yard move' };
export function segLabel(status: DutyStatus, note?: string): string {
  return note && SUB_STATUS[note] ? `${SUB_STATUS[note]} (${status})` : STATUS_LABEL[status];
}

/** Everything a bug report needs. Kept small enough to paste into an email. */
export function exportState(s: State): string {
  return JSON.stringify({ v: 1, exported: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent, segments: s.segments, tentative: s.tentative, current: s.current, config: s.config, mph: s.mph, trip: s.trip, bugEmail: s.bugEmail, nowOverride: s.nowOverride });
}
