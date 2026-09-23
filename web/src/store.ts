import { useEffect, useState } from 'preact/hooks';
import type { Segment, RulesConfig, DutyStatus } from '../../engine/src/index.ts';
import { DEFAULT_CONFIG } from '../../engine/src/index.ts';

export interface OpenSegment { status: DutyStatus; since: number; note?: string }

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
  /** Log tab: show the normalized timeline instead of the entries as typed */
  logResolved: boolean;
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

const initial: State = {
  segments: [], tentative: [], current: null,
  config: { ...DEFAULT_CONFIG, timeZone: deviceTz },
  mph: 55, trip: { ...DEFAULT_TRIP }, logResolved: false, nowOverride: null, tab: 'log', bugEmail: '',
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial;
    const s = JSON.parse(raw);
    return { ...initial, ...s, config: { ...initial.config, ...(s.config ?? {}) }, trip: { ...DEFAULT_TRIP, ...(s.trip ?? {}) } };
  } catch { return initial; }
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
  useEffect(() => { const id = setInterval(() => setN(nowMin()), 30000); return () => clearInterval(id); }, []);
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

/**
 * True when nothing at all is logged, so every number on screen is an assumption rather than a
 * reading of the driver's day. The UI must say so instead of presenting a fresh 11/14/70 as fact
 * (consumer-review-1/2: "Explain the starting assumptions").
 */
export function isFreshLog(s: State): boolean {
  return s.segments.length === 0 && s.tentative.length === 0 && !s.current;
}

/**
 * Apply an edit to one segment, matched by identity so every other entry keeps its reference (the
 * delete control and the undo snapshot both depend on that).
 */
export function applySegmentEdit(s: State, orig: Segment, next: Partial<Segment>): Pick<State, 'segments' | 'tentative'> {
  const replace = (list: Segment[]) => list.map((x) => (x === orig ? { ...x, ...next } : x));
  return { segments: replace(s.segments), tentative: replace(s.tentative) };
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
  if (s.current && now > s.current.since) out.push({ status: s.current.status, start: s.current.since, end: now, note: s.current.note ?? 'current' });
  return [...out, ...s.tentative];
}

export const STATUS_LABEL: Record<DutyStatus, string> = { OFF: 'Off Duty', SB: 'Sleeper', D: 'Driving', ON: 'On Duty' };
export const STATUS_COLOR: Record<DutyStatus, string> = { OFF: '#8a94a6', SB: '#7c5cff', D: '#2ecc71', ON: '#f5a623' };
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
